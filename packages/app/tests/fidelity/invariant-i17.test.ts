/**
 * Invariant I17 — Content-visibility invariant (static STOP rule).
 *
 * AGENTS.md Precedent #28 requires: "All user content visible and editable
 * (no hidden content). No `display: none` on `NodeViewContent`, no
 * read-only chrome covering user content, no `data-*` attribute hiding."
 *
 * ## Architecture decision (see evidence/deferred-invariants-and-perf.md)
 *
 * The evidence doc's §H specifies a DOM-rendered PBT using
 * `@happy-dom/global-registrator` + `extractDocText` + `extractRenderedText`.
 * A pre-flight spike (2026-04-19) proved this path is non-viable: React
 * 19.2's scheduler captures `window` at module-closure time — before
 * `beforeAll` can run — and fails with `ReferenceError: window is not
 * defined` in `performWorkOnRootViaSchedulerTask`. Shims don't help because
 * the scheduler closure is already captured.
 *
 * A ~`bun test --preload`~ infrastructure path exists but adds emulator
 * middle-tier cost for marginal coverage. Two-staff-engineer assessment:
 *
 *   Bun-tier (this file): static STOP rule — catches literal
 *     `display:none`/`hidden`/`aria-hidden` at commit time. Zero runtime,
 *     zero infra, fails fast in CI.
 *
 *   Browser-tier (Playwright QA-001..QA-050, already passing): catches
 *     ALL runtime hiding including class-based CSS, layout tricks, opacity.
 *     This is STRONGER coverage than a happy-dom emulator would be —
 *     happy-dom doesn't run CSS, so class-based hiding would fall through
 *     anyway.
 *
 *   Skipped middle-tier: happy-dom DOM-PBT. Infra risk + coverage already
 *     subsumed by Playwright. Not deferred tech debt — actively declined
 *     as over-engineering for marginal value.
 *
 * ## What this file enforces
 *
 * Every NodeView file must not contain source patterns that hide
 * `NodeViewContent` or the wrapping container. Documented exemptions are
 * permitted only when the comment block cites Precedent #28 by number
 * (enforcement: the exemption-strip regex requires the literal phrase).
 *
 * SPEC §7.1 I17.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * NodeView source files governed by Precedent #28 — every file that renders
 * user content through the `<NodeViewContent>` JSX element.
 *
 * Other NodeViews in the codebase (RawMdxFallbackCMView, compound-wrappers)
 * render content-bearing nodes via different mechanisms (imperative CM mount,
 * `data-state` DOM bridge) and have their own governance:
 *   - compound-wrappers.tsx tab-panel hiding: pinned separately below
 *     ("exemption discipline" test).
 *   - RawMdxFallbackCMView.tsx: NodeViewWrapper + imperative CodeMirror
 *     mount. Content hole exposed via the nested CM's contentDOM, not
 *     NodeViewContent JSX. Precedent #24 governs.
 */
const NODE_VIEW_SOURCES = ['src/editor/extensions/JsxComponentView.tsx'];

/**
 * Strip blocks of code preceded by a comment citing Precedent #28 as a
 * documented exemption. The exemption must name the precedent by number —
 * a bare "this is fine" comment does not pass. The exemption window covers
 * ~20 lines of following code (enough for a typical render body).
 */
function stripDocumentedExemptions(src: string): string {
  return src.replace(
    /documented exemption from Precedent #28[\s\S]{1,2000}?\n(?:\n|$)/g,
    '\n/* EXEMPT */\n',
  );
}

/**
 * Forbidden patterns — source-level hiding mechanisms applied to user
 * content. Anchored to likely sites (`NodeViewContent`, `contentDOM`,
 * NodeView wrapper style) to minimize false positives on React Compiler
 * internals, DX HMR annotations, etc. A real regression must trip one.
 */
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
  // Conditional-hiding catch: `display: <expr>` where expr evaluates to a
  // string is how conditional hiding shows up in React. The inline-style
  // object literal form is the common shape.
  {
    name: 'conditional display:none via ternary on NodeViewContent',
    re: /<NodeViewContent[^>]*style=\{\{[^}]*display:[^}]*['"]none['"]/,
  },
];

describe('I17 — content-visibility STOP rule (AGENTS.md Precedent #28)', () => {
  for (const rel of NODE_VIEW_SOURCES) {
    test(`${rel}: no NodeViewContent hiding`, () => {
      const full = join(APP_ROOT, rel);
      const src = readFileSync(full, 'utf8');
      const scanned = stripDocumentedExemptions(src);
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        expect(
          re.test(scanned),
          `${rel}: forbidden pattern "${name}" — hides user content. See AGENTS.md Precedent #28.`,
        ).toBe(false);
      }
    });
  }

  test('exemption discipline: tab-panel exemption documents Precedent #28', () => {
    // Pin: compound-wrappers.tsx EditorTab uses `data-[state=inactive]:hidden`
    // — the sole documented exemption (standard tab UX hides inactive panels;
    // content is accessible by clicking the trigger). Enforce that the
    // exemption comment cites Precedent #28 so future readers find the why.
    const src = readFileSync(join(APP_ROOT, 'src/editor/components/compound-wrappers.tsx'), 'utf8');
    expect(src.includes('data-[state=inactive]:hidden')).toBe(true);
    expect(src.includes('documented exemption from Precedent #28')).toBe(true);
  });

  test('NodeView source list: audit-complete (no new NodeView files missed)', () => {
    // Audit sanity check: the NODE_VIEW_SOURCES list should cover every
    // file that USES `<NodeViewContent>` as a JSX element (not just
    // references it in comments). If a new NodeView lands without being
    // added to the list, this test catches it.
    const { execSync } = require('node:child_process');
    // Match the literal JSX opening tag — `<NodeViewContent` followed by
    // ` `, `>`, or `/>`. Comments with plain prose like "…NodeViewContent…"
    // are excluded.
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
    // Also verify no stale entries (listed files that no longer use NodeViewContent).
    const stale = governed.filter((f) => !usingFiles.includes(f));
    expect(
      stale,
      `Files in NODE_VIEW_SOURCES but no longer using <NodeViewContent>: ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});
