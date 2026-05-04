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

const LEGACY_PATH_FRAGMENTS = [
  'tests/fixtures/large-realistic.md',
  'tests/fidelity/fixtures/gfm-examples.json',
  'tests/fidelity/fixtures/mdx-tolerant-crash-taxonomy.json',
];

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
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.json')) {
      acc.push(full);
    }
  }
  return acc;
}

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
