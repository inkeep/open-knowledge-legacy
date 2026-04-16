/**
 * Fixture-isolation guard (US-001 / R8).
 *
 * Invariants:
 *   (A) The externalized fixture locations — under
 *       `packages/core/src/markdown/fixtures/` — are the single source of
 *       truth for markdown corpora. The legacy locations
 *       `packages/app/tests/fixtures/` and `packages/app/tests/fidelity/fixtures/`
 *       must not return.
 *   (B) Source files across `packages/` must not read from the legacy
 *       fixture paths (even indirectly — any mention of those paths in a
 *       source or test file is a red flag).
 *   (C) Fixture-specific signatures unique to the canonical corpora
 *       (e.g. the `r23Covers` key from the MDX crash taxonomy; the
 *       `section: "Task list items"` + `"Strikethrough"` shape from the
 *       GFM corpus) must only appear in the fixture files and their
 *       loader, never inline in a test or source file.
 *
 * When this test fails, move the offending content into
 * `packages/core/src/markdown/fixtures/<subdir>/` and load it via
 * `loadGfmExamples()` / `loadMdxCrashTaxonomy()` / etc.
 *
 * Scope note: this test deliberately scans for specific fixture signatures
 * rather than any long string literal. Tests often contain legitimately
 * large inline strings (expected outputs, fuzz arbitraries, integration
 * scenarios) that are not corpus duplication.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const FIXTURES_ROOT = join(PACKAGES_DIR, 'core', 'src', 'markdown', 'fixtures');

const LEGACY_FIXTURE_LOCATIONS = [
  join(PACKAGES_DIR, 'app', 'tests', 'fixtures'),
  join(PACKAGES_DIR, 'app', 'tests', 'fidelity', 'fixtures'),
];

/** Path fragments that MUST NOT appear in any scanned source file. */
const LEGACY_PATH_FRAGMENTS = [
  'tests/fixtures/large-realistic.md',
  'tests/fidelity/fixtures/gfm-examples.json',
  'tests/fidelity/fixtures/mdx-tolerant-crash-taxonomy.json',
];

/**
 * Signatures unique to the canonical corpora. If any of these regexes
 * matches outside the fixtures directory, someone has duplicated the
 * fixture inline. Regex (rather than literal includes) so the guard
 * survives re-quoting / re-indentation of the same signature.
 */
const FIXTURE_SIGNATURES: Array<{ pattern: RegExp; label: string; suggestion: string }> = [
  {
    pattern: /\br23Covers\b/,
    label: 'r23Covers',
    suggestion: 'load via loadMdxCrashTaxonomy()',
  },
  {
    pattern: /["'\s:]section["'\s:]+["']Task list items["']/,
    label: '"section": "Task list items"',
    suggestion: 'load via loadGfmExamples()',
  },
  {
    pattern: /["'\s:]section["'\s:]+["']Strikethrough["']/,
    label: '"section": "Strikethrough"',
    suggestion: 'load via loadGfmExamples()',
  },
];

const WALK_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  'tmp',
  'fixtures', // the canonical fixture location itself
]);

/**
 * File names exempted from the signature + path scan. Use sparingly —
 * this isolation test itself is the only legitimate exception.
 */
const SCAN_EXEMPT_BASENAMES = new Set<string>(['fixtures-isolation.test.ts']);

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (WALK_SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, acc);
    // Scan .ts/.tsx source files AND .json files — copying a JSON fixture
    // outside the canonical location is a common duplication pattern that
    // the .ts-only walk previously missed.
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.json')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Enumerate every directory under `root` matching `/^fixtures?$/`, skipping
 * build / vendor dirs. Used by the positive-assertion walk below so that
 * ANY new fixture directory outside the canonical location fails the guard,
 * not just known-legacy paths.
 */
function findFixtureDirs(root: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (WALK_SKIP_DIRS.has(entry)) continue;
    const full = join(root, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (/^fixtures?$/.test(entry)) acc.push(full);
    findFixtureDirs(full, acc);
  }
  return acc;
}

describe('fixture isolation (US-001 / R8)', () => {
  test('legacy fixture locations are removed', () => {
    for (const legacy of LEGACY_FIXTURE_LOCATIONS) {
      expect(existsSync(legacy)).toBe(false);
    }
  });

  test('canonical fixtures root exists with all subdirs', () => {
    const expected = ['commonmark', 'gfm', 'mdx', 'wiki-links', 'frontmatter', 'ng-pinned', 'perf'];
    expect(existsSync(FIXTURES_ROOT)).toBe(true);
    for (const sub of expected) {
      expect(existsSync(join(FIXTURES_ROOT, sub))).toBe(true);
    }
  });

  test('canonical fixture files were migrated', () => {
    expect(existsSync(join(FIXTURES_ROOT, 'gfm', 'examples.json'))).toBe(true);
    expect(existsSync(join(FIXTURES_ROOT, 'mdx', 'crash-taxonomy.json'))).toBe(true);
    expect(existsSync(join(FIXTURES_ROOT, 'perf', 'large-realistic.md'))).toBe(true);
  });

  test('no fixture directory exists outside the canonical location', () => {
    // Positive-assertion walk: the stated goal of this file is "fixtures
    // live only in the canonical location." A signature-based scan catches
    // duplication of *existing* corpora; this walk catches *any new* fixture
    // directory (e.g. `packages/app/tests/integration/fixtures/`) that the
    // signature list doesn't enumerate.
    const allFixtureDirs = findFixtureDirs(PACKAGES_DIR);
    const offenders = allFixtureDirs.filter((d) => d !== FIXTURES_ROOT);
    if (offenders.length > 0) {
      throw new Error(
        `Fixture directories found outside the canonical location ` +
          `(${relative(REPO_ROOT, FIXTURES_ROOT)}):\n  - ` +
          offenders.map((d) => relative(REPO_ROOT, d)).join('\n  - '),
      );
    }
  });

  test('no source file references legacy fixture paths', () => {
    const files = walk(PACKAGES_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      if (SCAN_EXEMPT_BASENAMES.has(basename(file))) continue;
      const source = readFileSync(file, 'utf8');
      for (const frag of LEGACY_PATH_FRAGMENTS) {
        if (source.includes(frag)) {
          offenders.push(
            `${relative(REPO_ROOT, file)}: references legacy path '${frag}' — use packages/core/src/markdown/fixtures/`,
          );
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(`Legacy fixture path references found:\n  - ${offenders.join('\n  - ')}`);
    }
  });

  test('fixture-specific signatures do not appear outside the fixtures dir', () => {
    const files = walk(PACKAGES_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      if (SCAN_EXEMPT_BASENAMES.has(basename(file))) continue;
      const source = readFileSync(file, 'utf8');
      for (const { pattern, label, suggestion } of FIXTURE_SIGNATURES) {
        if (pattern.test(source)) {
          offenders.push(`${relative(REPO_ROOT, file)}: matches ${label} — ${suggestion}`);
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(`Fixture-signature duplication detected:\n  - ${offenders.join('\n  - ')}`);
    }
  });
});
