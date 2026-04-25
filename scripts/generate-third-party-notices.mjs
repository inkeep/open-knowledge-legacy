#!/usr/bin/env node
/**
 * Generate THIRD_PARTY_NOTICES.md.
 *
 * Walks the production-dep closure of every workspace whose code ends up
 * bundled into a shipped artifact (the npm CLI tarball or the Electron DMG),
 * extracts each package's license + LICENSE-file text + NOTICE if Apache,
 * and emits a deterministic markdown notice.
 *
 * Modes:
 *   default          write to <repo-root>/THIRD_PARTY_NOTICES.md
 *   --check          re-generate in memory, fail if existing file differs
 *   --out <path>     override output path (used by build wiring)
 *
 * Determinism: packages are sorted alphabetically inside each license bucket,
 * and the file body contains no timestamps. Re-running with no dep changes
 * yields a byte-identical file.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

// Workspaces whose runtime dependencies are bundled into a shipped artifact.
// cli/app are bundled by tsdown/Vite into packages/cli/dist/. server/core are
// workspace-internal libraries pulled in by cli, but `collectClosure` skips
// workspace-prefixed packages when walking deps, so each shipping workspace
// must be seeded explicitly. desktop adds @napi-rs/keyring (native) and
// electron-updater (bundled into the main-process JS). Electron itself is
// attributed by electron-builder via electron/dist/LICENSES.chromium.html.
const SHIPPING_WORKSPACES = [
  'packages/cli',
  'packages/server',
  'packages/core',
  'packages/app',
  'packages/desktop',
];

const WORKSPACE_NAME_PREFIX = '@inkeep/open-knowledge';

const LICENSE_FILENAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'COPYING',
  'COPYING.md',
  'COPYING.txt',
  'LICENSE-MIT',
  'LICENSE.MIT',
];

const NOTICE_FILENAMES = ['NOTICE', 'NOTICE.md', 'NOTICE.txt'];

const PATCHED_DEPS = [
  {
    name: '@handlewithcare/remark-prosemirror',
    version: '0.1.5',
    patchFile: 'patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch',
  },
  {
    name: 'y-prosemirror',
    version: '1.3.7',
    patchFile: 'patches/y-prosemirror@1.3.7.patch',
  },
  {
    name: '@tiptap/y-tiptap',
    version: '3.0.3',
    patchFile: 'patches/@tiptap%2Fy-tiptap@3.0.3.patch',
  },
];

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = argv.slice(2);
const CHECK_MODE = args.includes('--check');
const outIdx = args.indexOf('--out');
const OUT_PATH =
  outIdx >= 0 && args[outIdx + 1]
    ? args[outIdx + 1]
    : join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md');

// ─── closure resolution ──────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Mimic Node's resolution by walking up from `fromDir`, looking for
 * node_modules/<name>/package.json. Bun's hoisting puts most packages at the
 * repo-root node_modules; nested ones are found by walking up.
 */
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  while (dir.length >= REPO_ROOT.length) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isWorkspacePkg(pkg) {
  return pkg.name && pkg.name.startsWith(WORKSPACE_NAME_PREFIX);
}

// Platform-binary forks (e.g., `@parcel/watcher-darwin-arm64`) declare a
// non-empty `os` or `cpu` array restricting them to a single host. Only the
// fork matching the publisher's host actually resolves into `node_modules/`,
// so including them would make the committed notices file diverge across
// contributor platforms. The cross-platform wrapper package
// (`@parcel/watcher`) is still attributed; per-platform binary attribution
// rides along in each binary's own published npm package, fetched at install
// time on the user's host.
function isPlatformRestricted(pkg) {
  if (Array.isArray(pkg.os) && pkg.os.length > 0) return true;
  if (Array.isArray(pkg.cpu) && pkg.cpu.length > 0) return true;
  return false;
}

function collectClosure() {
  const visitedDirs = new Set();
  const queue = [];

  for (const ws of SHIPPING_WORKSPACES) {
    queue.push(join(REPO_ROOT, ws));
  }

  const collected = [];

  while (queue.length > 0) {
    const pkgDir = queue.shift();
    if (visitedDirs.has(pkgDir)) continue;
    visitedDirs.add(pkgDir);

    let pkg;
    try {
      pkg = readJson(join(pkgDir, 'package.json'));
    } catch {
      continue;
    }

    if (
      !isWorkspacePkg(pkg) &&
      pkg.name &&
      pkg.version &&
      !isPlatformRestricted(pkg)
    ) {
      collected.push({ dir: pkgDir, pkg });
    }

    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.optionalDependencies || {}),
    };

    for (const depName of Object.keys(deps)) {
      // Workspace-internal pkgs are seeded explicitly above; skip them here.
      if (depName.startsWith(WORKSPACE_NAME_PREFIX)) continue;
      const depDir = resolvePackageDir(depName, pkgDir);
      if (!depDir) continue;
      if (visitedDirs.has(depDir)) continue;
      queue.push(depDir);
    }
  }

  return collected;
}

// ─── license extraction ──────────────────────────────────────────────────────

function findFileCaseInsensitive(dir, candidates) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const lookup = new Map();
  for (const e of entries) lookup.set(e.toLowerCase(), e);
  for (const cand of candidates) {
    const found = lookup.get(cand.toLowerCase());
    if (found) return join(dir, found);
  }
  return null;
}

function readTextOrNull(path) {
  if (!path) return null;
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
  } catch {
    return null;
  }
}

function readLicenseText(pkgDir) {
  return readTextOrNull(findFileCaseInsensitive(pkgDir, LICENSE_FILENAMES));
}

function readNoticeText(pkgDir) {
  return readTextOrNull(findFileCaseInsensitive(pkgDir, NOTICE_FILENAMES));
}

function normalizeSpdx(licenseField) {
  if (!licenseField) return 'UNKNOWN';
  if (typeof licenseField === 'string') return licenseField.trim();
  if (Array.isArray(licenseField)) {
    return licenseField
      .map((l) => (typeof l === 'string' ? l : l.type || JSON.stringify(l)))
      .join(' OR ');
  }
  if (typeof licenseField === 'object')
    return licenseField.type || JSON.stringify(licenseField);
  return String(licenseField);
}

// Cap the number of copyright blocks captured per LICENSE. Aggregator licenses
// (e.g. Chromium's `LICENSES.chromium.html` with thousands of holders) would
// otherwise blow up the notices file; legitimate per-package LICENSEs rarely
// exceed three holders.
const MAX_COPYRIGHT_BLOCKS = 4;

function extractCopyrights(licenseText) {
  if (!licenseText) return [];
  const lines = licenseText.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length && blocks.length < MAX_COPYRIGHT_BLOCKS) {
    const line = lines[i].trim();
    // Match lines that START with the literal word "Copyright" (or
    // "(c) Copyright"). This excludes prose like "the above copyright notice"
    // which appears inside MIT/BSD permission text and is not a copyright line.
    if (/^(\(c\)\s*)?copyright\b/i.test(line)) {
      // Collect this line + continuation lines until a blank line or until we
      // hit something that is clearly the start of the permission grant.
      // Captures multi-line copyrights like yjs:
      //   Copyright (c) 2023
      //     - Kevin Jahns <...>
      const block = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '') {
        const next = lines[j].trim();
        if (
          /^(Permission|Redistribution|This Font|This license|This software|This program|This module|All rights|The above|Licensed|License|Released under|Subject to|See the)/i.test(next)
        ) {
          break;
        }
        // Only continue if the line looks like a holder/contributor — bullets,
        // dashes, indented names, or another Copyright line.
        if (/^([-*•]|\s*\w+|copyright\b)/i.test(next)) {
          block.push(next);
          j++;
        } else {
          break;
        }
      }
      blocks.push(block.join(' '));
      i = j;
    } else {
      i++;
    }
  }
  return blocks;
}

// Normalize a `repository.url` (or string-form `repository`) into a browsable
// `https://…` URL. Handles npm shorthand (`github:user/repo`, bare
// `user/repo`), the deprecated `git://` protocol, `git+ssh://git@host/path`,
// and SCP-style `git@host:path` — none of which are clickable as-is in
// rendered markdown.
function normalizeRepoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();

  const shortcutMatch = u.match(/^(github|gitlab|bitbucket):(.+)$/);
  if (shortcutMatch) {
    const [, host, path] = shortcutMatch;
    const domain = {
      github: 'github.com',
      gitlab: 'gitlab.com',
      bitbucket: 'bitbucket.org',
    }[host];
    return `https://${domain}/${path.replace(/\.git$/, '')}`;
  }

  // Bare `user/repo` defaults to GitHub per npm convention.
  if (/^[\w-]+\/[\w.-]+$/.test(u)) {
    return `https://github.com/${u.replace(/\.git$/, '')}`;
  }

  u = u.replace(/^git\+/, '');
  u = u.replace(/^ssh:\/\/git@/, 'https://');
  u = u.replace(/^git@([^:]+):/, 'https://$1/');
  u = u.replace(/^git:\/\//, 'https://');
  u = u.replace(/\.git$/, '');
  return u;
}

function homepageOf(pkg) {
  if (pkg.homepage && typeof pkg.homepage === 'string') return pkg.homepage;
  const repo = pkg.repository;
  if (!repo) return null;
  const url = typeof repo === 'string' ? repo : repo.url;
  return normalizeRepoUrl(url);
}

// ─── categorization ──────────────────────────────────────────────────────────

function categorize(spdx) {
  const stripped = spdx.replace(/[()]/g, '').trim();
  // SPDX `OR` is commutative, so normalize alternatives to alphabetical order.
  // Without this, a routine upstream reorder (e.g. `Apache-2.0 OR MIT` ↔
  // `MIT OR Apache-2.0`) would silently route the package to OTHER.
  const orParts = stripped
    .split(/\s+OR\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const s =
    orParts.length > 1
      ? [...orParts].sort((a, b) => a.localeCompare(b)).join(' OR ')
      : stripped;

  // OR expressions: pick a permissive primary.
  if (/\bMIT\b/i.test(s) && /\bCC0-1\.0\b/i.test(s)) return 'MIT';
  if (/\bMIT\b/i.test(s) && /\bWTFPL\b/i.test(s)) return 'MIT';
  if (/\bMPL-2\.0\b/i.test(s) && /\bApache-2\.0\b/i.test(s)) return 'Apache-2.0';
  if (/\bWTFPL\b/i.test(s) && /\bISC\b/i.test(s)) return 'ISC';
  if (/\bBSD-2-Clause\b/i.test(s) && /\bMIT\b/i.test(s)) return 'BSD-2-Clause';
  if (/^Apache-2\.0 OR MIT$/i.test(s)) return 'MIT';
  if (/^MIT$/i.test(s)) return 'MIT';
  if (/^Apache-2\.0$/i.test(s)) return 'Apache-2.0';
  if (/^ISC$/i.test(s)) return 'ISC';
  if (/^BSD-3-Clause$/i.test(s)) return 'BSD-3-Clause';
  if (/^BSD-2-Clause$/i.test(s)) return 'BSD-2-Clause';
  if (/^OFL-1\.1$/i.test(s)) return 'OFL-1.1';
  if (/^MPL-2\.0$/i.test(s)) return 'MPL-2.0';
  if (/^BlueOak-1\.0\.0$/i.test(s)) return 'BlueOak-1.0.0';
  if (/^0BSD$/i.test(s)) return '0BSD';
  if (/^WTFPL$/i.test(s)) return 'WTFPL';
  if (/^Unlicense$/i.test(s)) return 'Unlicense';
  if (/^Python-2\.0$/i.test(s)) return 'Python-2.0';
  if (/^CC-BY-4\.0$/i.test(s)) return 'CC-BY-4.0';
  if (/^CC0-1\.0$/i.test(s)) return 'CC0-1.0';
  if (/^LGPL/i.test(s)) return 'LGPL';
  if (/^GPL/i.test(s)) return 'GPL';
  return 'OTHER';
}

// ─── markdown rendering ──────────────────────────────────────────────────────

function packageHeader(pkg) {
  return `### \`${pkg.name}@${pkg.version}\``;
}

function shortEntry(e) {
  const lines = [packageHeader(e.pkg)];
  const home = homepageOf(e.pkg);
  if (home) lines.push(`Homepage: ${home}`);
  const cps = extractCopyrights(e.licenseText);
  if (cps.length > 0) {
    lines.push('');
    for (const cp of cps) lines.push(cp);
  } else if (!e.licenseText) {
    lines.push('');
    lines.push(
      '_(No LICENSE file in package; SPDX identifier in `package.json` is the sole declared grant.)_',
    );
  }
  return lines.join('\n');
}

function fullLicenseEntry(e) {
  const lines = [packageHeader(e.pkg)];
  const home = homepageOf(e.pkg);
  if (home) lines.push(`Homepage: ${home}`);
  lines.push('');
  if (e.licenseText) {
    lines.push('```');
    lines.push(e.licenseText);
    lines.push('```');
  } else {
    lines.push('_(LICENSE file not present in package; see homepage.)_');
  }
  return lines.join('\n');
}

function apacheEntry(e) {
  const lines = [packageHeader(e.pkg)];
  const home = homepageOf(e.pkg);
  if (home) lines.push(`Homepage: ${home}`);
  const cps = extractCopyrights(e.licenseText);
  if (cps.length > 0) {
    lines.push('');
    for (const cp of cps) lines.push(cp);
  }
  if (e.noticeText) {
    lines.push('');
    lines.push('NOTICE:');
    lines.push('');
    lines.push('```');
    lines.push(e.noticeText);
    lines.push('```');
  }
  return lines.join('\n');
}

function build() {
  const collected = collectClosure();

  // Dedupe by name@version — Bun's nested resolution can surface the same
  // package multiple times under different node_modules dirs.
  const seenKeys = new Set();
  const grouped = new Map();
  for (const { dir, pkg } of collected) {
    if (!pkg.name || !pkg.version) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const spdx = normalizeSpdx(pkg.license || pkg.licenses);
    const category = categorize(spdx);
    const entry = {
      pkg,
      dir,
      spdx,
      category,
      licenseText: readLicenseText(dir),
      noticeText: readNoticeText(dir),
    };
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(entry);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
  }

  const lines = [];
  const push = (...xs) => lines.push(...xs);
  const hr = () => push('---', '');

  push('# Third-Party Notices', '');
  push(
    '`@inkeep/open-knowledge` (npm CLI) and `@inkeep/open-knowledge-desktop` (Electron app) bundle source code from the third-party packages listed below. Each package is redistributed under its own license; the relevant copyright notice and license text are reproduced here as required.',
    '',
  );
  push(
    'This file is generated. **Do not edit by hand.** Regenerate with `bun run notices` from the repo root, then commit the result.',
    '',
  );
  hr();

  // OFL fonts — full LICENSE text is non-negotiable
  if (grouped.has('OFL-1.1')) {
    push('## SIL Open Font License (OFL-1.1) — bundled fonts', '');
    push(
      'The font packages below are bundled into the React app frontend (`packages/cli/dist/public/assets/*.woff2`) and require the full OFL-1.1 license text to ship with any distribution that contains them. The Reserved Font Names cannot be used in derivative font names.',
      '',
    );
    for (const e of grouped.get('OFL-1.1')) {
      push(fullLicenseEntry(e), '');
    }
    hr();
  }

  // LGPL — `node-liblzma` is an optional transitive of just-bash. Emit the
  // callout unconditionally so the notice is platform-stable; if the package
  // ended up in this build's resolved tree, surface the resolved version.
  push('## LGPL-3.0 — transitive optional binary', '');
  const lgplResolved = (grouped.get('LGPL') || []).find(
    (e) => e.pkg.name === 'node-liblzma',
  );
  push(
    `\`node-liblzma\`${
      lgplResolved ? `@${lgplResolved.pkg.version}` : ''
    } is an **optional** transitive dependency of \`just-bash\`, which \`@inkeep/open-knowledge\` depends on for sandboxed shell execution. We do not bundle \`node-liblzma\`; npm/bun fetches it directly from the public registry on platforms where the native build succeeds. Source is available at https://github.com/Manawyrm/node-liblzma. The library is licensed under LGPL-3.0; corresponding source can be obtained from upstream per LGPL §6.`,
    '',
  );
  hr();

  // Apache-2.0
  if (grouped.has('Apache-2.0')) {
    push('## Apache License, Version 2.0', '');
    push(
      'Each entry below is licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Where the upstream package ships a `NOTICE` file, its contents are reproduced inline as required by Apache-2.0 §4(d).',
      '',
    );
    for (const e of grouped.get('Apache-2.0')) {
      push(apacheEntry(e), '');
    }
    hr();
  }

  // MIT
  if (grouped.has('MIT')) {
    push('## MIT License', '');
    push(
      'Each entry below is licensed under the MIT License. The original copyright notice is reproduced; the MIT permission notice applies as written by the original author.',
      '',
    );
    for (const e of grouped.get('MIT')) {
      push(shortEntry(e), '');
    }
    hr();
  }

  // ISC
  if (grouped.has('ISC')) {
    push('## ISC License', '');
    push(
      'Each entry below is licensed under the ISC License (functionally equivalent to MIT/2-clause BSD).',
      '',
    );
    for (const e of grouped.get('ISC')) {
      push(shortEntry(e), '');
    }
    hr();
  }

  // BSD-3-Clause
  if (grouped.has('BSD-3-Clause')) {
    push('## BSD 3-Clause License', '');
    for (const e of grouped.get('BSD-3-Clause')) {
      push(shortEntry(e), '');
    }
    hr();
  }

  // BSD-2-Clause
  if (grouped.has('BSD-2-Clause')) {
    push('## BSD 2-Clause License', '');
    for (const e of grouped.get('BSD-2-Clause')) {
      push(shortEntry(e), '');
    }
    hr();
  }

  // MPL-2.0
  if (grouped.has('MPL-2.0')) {
    push('## Mozilla Public License 2.0', '');
    push(
      'Used at build time only — not bundled into shipped artifacts. Listed for traceability.',
      '',
    );
    for (const e of grouped.get('MPL-2.0')) {
      push(shortEntry(e), '');
    }
    hr();
  }

  // Permissive-no-attribution roll-up
  const PERMISSIVE_NO_ATTR = [
    'BlueOak-1.0.0',
    '0BSD',
    'WTFPL',
    'Unlicense',
    'CC0-1.0',
    'Python-2.0',
    'CC-BY-4.0',
  ];
  const noAttrEntries = [];
  for (const cat of PERMISSIVE_NO_ATTR) {
    if (grouped.has(cat)) noAttrEntries.push(...grouped.get(cat));
  }
  if (noAttrEntries.length > 0) {
    noAttrEntries.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
    push('## Other permissive licenses', '');
    push(
      'The following packages are under licenses that do not strictly require attribution (BlueOak-1.0.0, 0BSD, WTFPL, Unlicense, CC0-1.0, Python-2.0, CC-BY-4.0). Listed for completeness and traceability.',
      '',
    );
    for (const e of noAttrEntries) {
      push(`- \`${e.pkg.name}@${e.pkg.version}\` — ${e.spdx}`);
    }
    push('');
    hr();
  }

  // Patched deps
  push('## Patched dependencies', '');
  push(
    "The following MIT-licensed packages are patched in this repository via Bun's `patchedDependencies` mechanism. Modifications are released under the same MIT license as the upstream package. Patch files live under `patches/` in the source repo; the bundled output of every shipped artifact incorporates the patched code.",
    '',
  );
  push('| Package | Patch file |');
  push('| --- | --- |');
  for (const p of PATCHED_DEPS) {
    push(`| \`${p.name}@${p.version}\` | \`${p.patchFile}\` |`);
  }
  push('');
  hr();

  // Audit-needed bucket — should normally be empty.
  // node-liblzma is already covered by the dedicated LGPL callout above; do
  // not double-list it here.
  const callouts = [];
  for (const cat of ['OTHER', 'GPL', 'LGPL']) {
    if (grouped.has(cat)) callouts.push(...grouped.get(cat));
  }
  const filteredCallouts = callouts.filter((e) => e.pkg.name !== 'node-liblzma');
  if (filteredCallouts.length > 0) {
    filteredCallouts.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
    push('## Other licenses (audit needed)', '');
    push(
      'The generator did not auto-categorize the following packages. Each requires individual review before next-release ship.',
      '',
    );
    for (const e of filteredCallouts) {
      push(`- \`${e.pkg.name}@${e.pkg.version}\` — ${e.spdx}`);
    }
    push('');
    hr();
  }

  push(
    '_Regenerate with `bun run notices`. The generator at `scripts/generate-third-party-notices.mjs` walks the production-dep closure of `packages/{cli,server,core,app,desktop}` and emits attribution for every package that ends up bundled into a shipped artifact._',
    '',
  );

  return lines.join('\n');
}

// ─── main ────────────────────────────────────────────────────────────────────

const generated = build();

if (CHECK_MODE) {
  if (!existsSync(OUT_PATH)) {
    console.error(`THIRD_PARTY_NOTICES.md not found at ${OUT_PATH}`);
    console.error('Run `bun run notices` to regenerate.');
    exit(1);
  }
  const existing = readFileSync(OUT_PATH, 'utf8');
  if (existing !== generated) {
    console.error(
      `${relative(REPO_ROOT, OUT_PATH)} is out of date with the resolved dependency tree.`,
    );
    console.error('');
    console.error('Run `bun run notices` to regenerate, then commit the result.');
    exit(1);
  }
  console.log(`${relative(REPO_ROOT, OUT_PATH)} is up to date.`);
} else {
  writeFileSync(OUT_PATH, generated);
  console.log(
    `Wrote ${relative(REPO_ROOT, OUT_PATH)} (${Buffer.byteLength(generated, 'utf8')} bytes).`,
  );
}
