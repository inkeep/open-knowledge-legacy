import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_SRC_ROOT = join(__dirname, '..', '..', '..', 'app', 'src');

interface BannedPattern {
  pattern: RegExp;
  description: string;
}

const BANNED_PATTERNS: ReadonlyArray<BannedPattern> = [
  {
    pattern: /setThemeSource\s*\([^)]*\bmatchMedia\b/,
    description:
      'matchMedia inside setThemeSource argument — pass the unresolved CRDT value directly. ' +
      "Resolving 'system' to a concrete 'light'/'dark' here loses OS auto-tracking.",
  },
  {
    pattern: /setThemeSource\s*\([^)]*['"]light['"][^)]*['"]dark['"]/,
    description:
      "setThemeSource argument resolves to 'light'/'dark' literals (likely a ternary) — " +
      'pass the unresolved CRDT value directly.',
  },
  {
    pattern: /setThemeSource\s*\([^)]*['"]dark['"][^)]*['"]light['"]/,
    description:
      "setThemeSource argument resolves to 'dark'/'light' literals (likely a ternary) — " +
      'pass the unresolved CRDT value directly.',
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      yield full;
    }
  }
}

interface Violation {
  file: string;
  line: number;
  match: string;
  rule: string;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(APP_SRC_ROOT)) {
    const rel = relative(APP_SRC_ROOT, file).split(sep).join('/');
    const lines = readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      for (const { pattern, description } of BANNED_PATTERNS) {
        const m = line.match(pattern);
        if (m) {
          violations.push({
            file: rel,
            line: idx + 1,
            match: m[0],
            rule: description,
          });
        }
      }
    });
  }
  return violations;
}

describe('1-way contract — no-resolved-value-theme-source', () => {
  test('packages/app/src/ contains no resolved-value calls into bridge.setThemeSource', () => {
    const violations = scan();
    if (violations.length > 0) {
      const lines = violations.map((v) => `  ${v.file}:${v.line} → ${v.match}\n    ${v.rule}`);
      throw new Error(
        [
          '1-way contract violation — bridge.setThemeSource(...) called with a resolved value:',
          ...lines,
          '',
          'Fix: pass the unresolved CRDT value directly. The user-intent space is',
          "{'system', 'light', 'dark'}; 'system' delegates appearance tracking to",
          'macOS via nativeTheme — resolving it at the call site loses that tracking.',
        ].join('\n'),
      );
    }
    expect(violations).toEqual([]);
  });

  test('the scan walks a real source tree with .ts / .tsx files', () => {
    let counted = 0;
    for (const _ of walk(APP_SRC_ROOT)) {
      counted++;
      if (counted >= 5) break;
    }
    expect(counted).toBeGreaterThan(0);
  });

  test('mutation: BANNED_PATTERNS catch known violations (positive regression)', () => {
    const fixtures: ReadonlyArray<{ source: string; expectedMatchCount: number }> = [
      {
        source:
          "bridge.setThemeSource(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')",
        expectedMatchCount: 1,
      },
      {
        source: "okDesktop.setThemeSource(prefersDark ? 'dark' : 'light')",
        expectedMatchCount: 1,
      },
      {
        source: "window.okDesktop?.setThemeSource(isLight ? 'light' : 'dark')",
        expectedMatchCount: 1,
      },
    ];

    const cleanFixtures: ReadonlyArray<string> = [
      'bridge.setThemeSource(themeValue)',
      'okDesktop.setThemeSource(merged.appearance.theme)',
      'window.okDesktop?.setThemeSource(theme)',
      'setThemeSource(source: OkThemeSource): Promise<{ ok: true }>;',
    ];

    for (const fixture of fixtures) {
      let matches = 0;
      for (const { pattern } of BANNED_PATTERNS) {
        if (pattern.test(fixture.source)) matches++;
      }
      expect(matches).toBeGreaterThanOrEqual(fixture.expectedMatchCount);
    }
    for (const cleanSource of cleanFixtures) {
      for (const { pattern } of BANNED_PATTERNS) {
        expect(pattern.test(cleanSource)).toBe(false);
      }
    }
  });
});
