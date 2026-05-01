
import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NODE_VIEW_SOURCES = ['src/editor/extensions/JsxComponentView.tsx'];

function stripDocumentedExemptions(src: string): string {
  return src.replace(
    /documented exemption from Precedent #30[\s\S]{1,2000}?\n(?:\n|$)/g,
    '\n/* EXEMPT */\n',
  );
}

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: 'display:none on NodeViewContent',
    re: /<NodeViewContent[^>]*style=\{\{[^}]*display:\s*['"]none['"]/i,
  },
  {
    name: 'NodeViewContent hidden attribute',
    re: /<NodeViewContent[^>]*\bhidden\b[^>]*>/,
  },
  {
    name: 'NodeViewContent visibility:hidden',
    re: /<NodeViewContent[^>]*style=\{\{[^}]*visibility:\s*['"]hidden['"]/i,
  },
  {
    name: 'NodeViewContent aria-hidden',
    re: /<NodeViewContent[^>]*aria-hidden\s*=\s*\{?\s*["{]?true/,
  },
  {
    name: 'conditional display:none via ternary on NodeViewContent',
    re: /<NodeViewContent[^>]*style=\{\{[^}]*display:[^}]*['"]none['"]/,
  },
];

describe('I17 — content-visibility STOP rule (AGENTS.md Precedent #30)', () => {
  for (const rel of NODE_VIEW_SOURCES) {
    test(`${rel}: no NodeViewContent hiding`, () => {
      const full = join(APP_ROOT, rel);
      const src = readFileSync(full, 'utf8');
      const scanned = stripDocumentedExemptions(src);
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        expect(
          re.test(scanned),
          `${rel}: forbidden pattern "${name}" — hides user content. See AGENTS.md Precedent #30.`,
        ).toBe(false);
      }
    });
  }

  test('NodeView source list: audit-complete (no new NodeView files missed)', () => {
    const grepResult = execSync(
      `grep -lE "<NodeViewContent[ />]" ${join(APP_ROOT, 'src/editor')} -r --include="*.tsx" --include="*.ts"`,
      { encoding: 'utf8' },
    ) as string;
    const usingFiles = grepResult
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((p) => p.replace(`${APP_ROOT}/`, ''))
      .filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
      .sort();

    const governed = [...NODE_VIEW_SOURCES].sort();
    const missing = usingFiles.filter((f) => !governed.includes(f));
    expect(
      missing,
      `Files using <NodeViewContent> JSX but not in NODE_VIEW_SOURCES: ${JSON.stringify(missing)}`,
    ).toEqual([]);
    const stale = governed.filter((f) => !usingFiles.includes(f));
    expect(
      stale,
      `Files in NODE_VIEW_SOURCES but no longer using <NodeViewContent>: ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});
