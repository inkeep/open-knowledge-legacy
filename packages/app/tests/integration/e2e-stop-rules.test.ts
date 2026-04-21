/**
 * Mechanical guard for the E2E suite's zero-allowlist anti-pattern bans
 * (SPEC §6c AC-3/4/5/10, D-Q14/D-Q15/D-Q11 LOCKED).
 *
 * Each banned pattern is enforced by a per-pattern test. Failure messages
 * list `<file>:<line>` for every violation so the developer can fix without
 * having to re-grep.
 *
 * Template: `packages/app/src/editor/clipboard/wysiwyg-stop-rule.test.ts` —
 * same per-pattern shape, same string-grep enforcement (cheapest mechanical
 * check that catches both spellings of each banned construct).
 *
 * Patterns enforced:
 *   1. `page.waitForTimeout(`        — D-Q14, AC-3
 *   2. `waitUntil: 'networkidle'`    — D-Q14, AC-4
 *   3. `new Promise(r => setTimeout(r,` — D-Q14
 *   4. `page.pause(`                 — D-Q14
 *   5. `test.skip(browserName === 'webkit'` — D-Q10/AC-5 ratchet
 *   6. Inner-file helper imports     — D-Q11 barrel contract
 *   7. Ungated `window.__` writes outside the allowlist (US-006/US-026)
 *   8. `window.__activeEditor` writes outside DocumentContext.tsx
 *      (regression — PR #168 merge collision: TiptapEditor direct
 *      assignment clashed with main PR #212's getter-only defineProperty
 *      and threw TypeError on any doc open in DEV)
 *   9. `:has()` in selection-halo CSS rules (precedent #30 — innermost-wins
 *      via plugin state, not `:has()` cascade; Firefox compat + large-doc
 *      perf + SSR parity)
 *  10. Selection halo transition uses bare `ease-out` instead of
 *      `var(--ease-out-strong)` — consistency with the repo's custom
 *      easing token (round-2 review fix in commit `4e9d96a5`)
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_GATED_WINDOW_WRITERS } from './dev-gate-allowlist';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const E2E_DIR = join(__dirname, '..', 'stress');
const APP_SRC_DIR = join(__dirname, '..', '..', 'src');

interface FileLines {
  /** Repo-relative path for failure messages. */
  path: string;
  /** Absolute path for reading. */
  absPath: string;
  /** Lines split on '\n', 0-indexed. */
  lines: string[];
}

function listE2eFiles(): FileLines[] {
  const entries = readdirSync(E2E_DIR);
  return entries
    .filter((name) => name.endsWith('.e2e.ts'))
    .map((name) => {
      const absPath = join(E2E_DIR, name);
      const source = readFileSync(absPath, 'utf-8');
      return {
        path: relative(REPO_ROOT, absPath),
        absPath,
        lines: source.split('\n'),
      };
    });
}

function listAppSrcTsFiles(): FileLines[] {
  const out: FileLines[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, name.name);
      if (name.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.isFile()) continue;
      if (!name.name.endsWith('.ts') && !name.name.endsWith('.tsx')) continue;
      if (name.name.endsWith('.test.ts') || name.name.endsWith('.test.tsx')) continue;
      if (name.name.endsWith('.spec.ts') || name.name.endsWith('.spec.tsx')) continue;
      const source = readFileSync(abs, 'utf-8');
      out.push({ path: relative(REPO_ROOT, abs), absPath: abs, lines: source.split('\n') });
    }
  }
  walk(APP_SRC_DIR);
  return out;
}

function collectMatches(
  files: FileLines[],
  predicate: (line: string, lineIdx: number, file: FileLines) => boolean,
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    for (let i = 0; i < file.lines.length; i++) {
      if (predicate(file.lines[i] ?? '', i, file)) {
        violations.push(`  ${file.path}:${i + 1}    ${(file.lines[i] ?? '').trim()}`);
      }
    }
  }
  return violations;
}

describe('E2E STOP rule — zero allowlist', () => {
  const e2eFiles = listE2eFiles();

  test('there are E2E files to check (sanity)', () => {
    expect(e2eFiles.length).toBeGreaterThan(0);
  });

  test('no page.waitForTimeout( in tests/stress/*.e2e.ts (AC-3)', () => {
    const violations = collectMatches(e2eFiles, (line) => line.includes('page.waitForTimeout('));
    if (violations.length > 0) {
      throw new Error(
        `page.waitForTimeout( pattern found — replace with condition-based wait per D-Q1:\n${violations.join('\n')}`,
      );
    }
  });

  test("no waitUntil: 'networkidle' in tests/stress/*.e2e.ts (AC-4)", () => {
    const violations = collectMatches(e2eFiles, (line) =>
      /waitUntil:\s*['"]networkidle['"]/.test(line),
    );
    if (violations.length > 0) {
      throw new Error(
        `waitUntil: 'networkidle' pattern found — use 'domcontentloaded' + waitForActiveProviderSynced instead:\n${violations.join('\n')}`,
      );
    }
  });

  test('no new Promise + setTimeout busy-wait in tests/stress/*.e2e.ts (D-Q14)', () => {
    const pattern = /new Promise\(\s*(\w+)\s*=>\s*setTimeout\(\s*\1\s*,/;
    const violations = collectMatches(e2eFiles, (line) => pattern.test(line));
    if (violations.length > 0) {
      throw new Error(
        `\`new Promise(r => setTimeout(r, N))\` busy-wait found — use a condition-based wait:\n${violations.join('\n')}`,
      );
    }
  });

  test('no page.pause( in tests/stress/*.e2e.ts (D-Q14)', () => {
    const violations = collectMatches(e2eFiles, (line) => line.includes('page.pause('));
    if (violations.length > 0) {
      throw new Error(
        `page.pause( found — debugger pauses must not land in committed E2E tests:\n${violations.join('\n')}`,
      );
    }
  });

  test("no test.skip(browserName === 'webkit') in tests/stress/*.e2e.ts (AC-5 ratchet)", () => {
    const pattern = /test\.skip\(\s*browserName\s*===\s*['"]webkit['"]/;
    const violations = collectMatches(e2eFiles, (line) => pattern.test(line));
    if (violations.length > 0) {
      throw new Error(
        `webkit-skip pattern reintroduced — chromium-only CI ratchet (D-Q10):\n${violations.join('\n')}`,
      );
    }
  });

  test("no keyboard.press('Meta+X') — use ControlOrMeta+X for cross-platform CI (D-Q10)", () => {
    // Chromium on Linux CI treats `Meta` as the Super / Windows key. PM's
    // `Mod-a` keymap resolves to `Ctrl+a` on Linux, so `keyboard.press('Meta+a')`
    // on CI does not trigger PM's selectAll command — `simulateCopyAndRead`
    // then returns an empty MIME map. `ControlOrMeta+X` (Playwright v1.37+)
    // maps to `Meta+X` on macOS and `Control+X` elsewhere, matching
    // `prosemirror-keymap`'s `Mod-` resolution.
    //
    // Scope: only keyboard shortcuts where the chord is meant to match a
    // platform-aware key binding (select-all, copy, cut, paste, end-of-doc,
    // start-of-doc, select-all-up, select-word-left/right). Plain `Meta`
    // key references in prose / identifiers are not banned.
    const pattern = /keyboard\.press\(\s*['"`]Meta\+[A-Za-z][A-Za-z]*['"`]/;
    const violations = collectMatches(e2eFiles, (line) => pattern.test(line));
    if (violations.length > 0) {
      throw new Error(
        `keyboard.press('Meta+X') — replace with 'ControlOrMeta+X' so CI (Linux chromium) maps to Ctrl+X:\n${violations.join('\n')}`,
      );
    }
  });

  test('no inner-file helper imports — must use barrel ./_helpers (D-Q11)', () => {
    // Banned: `from './_helpers/sidebar'`, `from './_helpers/provider'`, etc.
    // Allowed: `from './_helpers'` (resolves to ./_helpers/index.ts).
    // Also banned: deeper paths like `from '../_helpers/sidebar'`.
    // `[a-zA-Z]` (not `[a-z]`) so future PascalCase-named helper files
    // (e.g., `Clipboard.ts`) can't bypass the STOP rule via direct import.
    const innerImport = /from\s+['"]\.\.?(?:\/[^'"]*)?\/_helpers\/[a-zA-Z][\w-]*['"]/;
    const violations = collectMatches(e2eFiles, (line) => innerImport.test(line));
    if (violations.length > 0) {
      throw new Error(
        `Inner-file helper import found — import from the barrel ('./_helpers') only:\n${violations.join('\n')}`,
      );
    }
  });

  test('no ungated window.__ writes outside dev-gate allowlist (US-006/US-026)', () => {
    const srcFiles = listAppSrcTsFiles();
    // Match `window.__name = ` (assignment) and `window.__name = (...)` shapes.
    const writePattern = /window\.__[A-Za-z_][A-Za-z0-9_]*\s*=/;
    // Exclude pure equality / comparison usages by requiring no `==` or `===` immediately after.
    const equalityPattern = /window\.__[A-Za-z_][A-Za-z0-9_]*\s*===?/;
    // Match the `Object.defineProperty(window, '__name', …)` publication
    // shape used by `DocumentContext.tsx` for `window.__activeProvider`.
    // Without this, a new contributor adding a second
    // `Object.defineProperty(window, '__x', …)` writer outside the
    // allowlist would slip past the assignment-only regex above.
    const definePropertyPattern =
      /Object\.defineProperty\s*\(\s*window\s*,\s*['"]__[A-Za-z_][A-Za-z0-9_]*['"]/;

    const violations: string[] = [];
    for (const file of srcFiles) {
      if (DEV_GATED_WINDOW_WRITERS.includes(file.path)) continue;
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i] ?? '';
        const isAssignWrite = writePattern.test(line) && !equalityPattern.test(line);
        const isDefinePropertyWrite = definePropertyPattern.test(line);
        if (!isAssignWrite && !isDefinePropertyWrite) continue;
        violations.push(`  ${file.path}:${i + 1}    ${line.trim()}`);
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Ungated window.__ write outside the dev-gate allowlist — wrap in if (import.meta.env.DEV) and add to dev-gate-allowlist.ts:\n${violations.join('\n')}`,
      );
    }
  });

  test('no waitForFunction(fn, { timeout/polling }) — options must be 3rd arg (precedent §20(j))', () => {
    // Playwright's `page.waitForFunction(pageFunction, arg?, options?)` is
    // strictly positional (verified at node_modules/playwright-core/lib/
    // client/frame.js:368). When a test writes
    //   `waitForFunction(fn, { timeout: 10_000 })`
    // the `{ timeout: 10_000 }` is bound to `arg`, not `options` — the
    // intended timeout is silently ignored and the action falls back to
    // the test-level timeout (typically 120s). Empirical probe:
    // `waitForFunction(fn, { timeout: 200 })` takes 56_736ms vs 202ms for
    // `waitForFunction(fn, null, { timeout: 200 })` — same fn, only the
    // signature differs.
    //
    // Required shape: `waitForFunction(fn, null, { timeout: N })` — pass
    // `null` (or `undefined`, or a real arg value) as the 2nd positional,
    // options as the 3rd. See AGENTS.md precedent §20(j).
    //
    // Detection:
    //   - Single-line:  `waitForFunction(...=>..., { timeout|polling: ...`
    //   - Multi-line:   a line whose trim is `{ timeout: ...` or
    //     `{ polling: ...` whose nearest previous non-blank, non-comment
    //     line ends with `),` (function-body close directly followed by
    //     options — no middle arg).
    const singleLinePattern = /waitForFunction\s*\([^)]*?=>\s*[^,]*,\s*\{\s*(timeout|polling)\s*:/;
    // Multi-line: accept both `{ timeout: ...` and `{ timeout: ..., ...`
    // trimmed-first-char shapes. No-intermediate-arg detected by the
    // preceding line ending in `),` (the function body's close).
    const multiLineKeyword = /^\s*\{\s*(timeout|polling)\s*:/;
    const fnBodyCloseTerminator = /\)\s*,\s*$/;

    const violations: string[] = [];
    for (const file of e2eFiles) {
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i] ?? '';
        if (singleLinePattern.test(line)) {
          // Exclude the CORRECT multi-arg form where the arg is itself an
          // object literal that happens to have a `timeout` field (rare
          // but possible). Require: BEFORE the `{ timeout`/`{ polling`
          // match, there is no bare `),` or `null,` / `undefined,` /
          // `identifier,` argument sequence. Conservative approach: the
          // single-line regex above already requires `=>` directly before
          // the comma-options, which means the arrow function is the
          // FIRST arg and the object is the SECOND — always buggy.
          violations.push(`  ${file.path}:${i + 1}    ${line.trim()}`);
          continue;
        }
        if (!multiLineKeyword.test(line)) continue;
        // Find previous non-blank, non-comment-only line.
        let p = i - 1;
        while (p >= 0) {
          const prev = (file.lines[p] ?? '').trim();
          if (prev === '' || prev.startsWith('//') || prev.startsWith('*')) {
            p--;
            continue;
          }
          break;
        }
        if (p < 0) continue;
        const prev = file.lines[p] ?? '';
        if (!fnBodyCloseTerminator.test(prev)) continue;
        // Guard: preceding line ends with `),` AND that `)` was a
        // FUNCTION-BODY close (the arrow function's closing paren), not
        // an argument value's closing. Approximate by: scan up to 8
        // earlier lines; if a `waitForFunction(` occurs within the
        // block, this is the buggy shape. Otherwise not a match.
        let scanUp = p;
        let foundCall = false;
        for (let k = 0; k < 10 && scanUp >= 0; k++, scanUp--) {
          if ((file.lines[scanUp] ?? '').includes('waitForFunction(')) {
            foundCall = true;
            break;
          }
        }
        if (!foundCall) continue;
        violations.push(`  ${file.path}:${i + 1}    ${line.trim()}`);
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `waitForFunction(fn, { timeout/polling }) pattern — options as 2nd arg is bound to \`arg\` and silently ignored. Pass \`null\` as 2nd arg: \`waitForFunction(fn, null, { timeout: N })\`. See AGENTS.md §20(j):\n${violations.join('\n')}`,
      );
    }
  });

  test('window.__activeEditor is published only by DocumentContext.tsx (regression — PR #168 merge collision)', () => {
    // `DocumentContext.tsx` owns `window.__activeEditor` via
    // `Object.defineProperty(window, '__activeEditor', { get: ... })` —
    // a getter-only accessor that derives the active editor from the
    // `active-editor.ts` registry (populated by `registerEditor` /
    // `unregisterEditor` in `TiptapEditor.tsx`). V8 rejects bare
    // assignment to a getter-only accessor: any `window.__activeEditor = x`
    // anywhere else throws `TypeError: Cannot set property __activeEditor
    // of #<Window> which has only a getter` on the next editor mount in
    // DEV, surfaced as an app-level error boundary crash.
    //
    // History: commit 3b12b6a3 (US-010/US-011 E2E infra) added a direct
    // assignment in TiptapEditor.tsx that was harmless in isolation. It
    // collided with main's PR #212 (commit 0ae6cc8d) which introduced the
    // getter-only defineProperty. Neither branch alone had the bug — it
    // emerged in merge commit cacaa06b. Both sites touched different
    // files, so git produced zero conflict markers. Fixed in 504f2746 by
    // deleting the direct-assignment useEffect.
    //
    // This test enforces the invariant at the static-scan layer so a
    // future contributor cannot reintroduce a second publication path
    // for the same global.
    const srcFiles = listAppSrcTsFiles();
    const directAssignPattern = /window\.__activeEditor\s*=/;
    // Exclude equality comparisons (`window.__activeEditor === editor`).
    const equalityPattern = /window\.__activeEditor\s*===?/;
    const definePropertyPattern =
      /Object\.defineProperty\s*\(\s*window\s*,\s*['"]__activeEditor['"]/;
    const ownerFile = 'packages/app/src/editor/DocumentContext.tsx';

    const violations: string[] = [];
    for (const file of srcFiles) {
      if (file.path === ownerFile) continue;
      for (let i = 0; i < file.lines.length; i++) {
        const line = file.lines[i] ?? '';
        const isAssign = directAssignPattern.test(line) && !equalityPattern.test(line);
        const isDefine = definePropertyPattern.test(line);
        if (!isAssign && !isDefine) continue;
        violations.push(`  ${file.path}:${i + 1}    ${line.trim()}`);
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `window.__activeEditor must be published only by DocumentContext.tsx — additional writers collide with the getter-only accessor and throw TypeError on doc open in DEV. Delete the direct write and read through window.__activeEditor (the getter already resolves via the active-editor.ts registry, which TiptapEditor already populates via registerEditor/unregisterEditor):\n${violations.join('\n')}`,
      );
    }
  });

  test('selection-halo CSS rules use plugin-state propagation, not `:has()` (Precedent #30)', () => {
    // Precedent #30: innermost-wins uses `data-has-child-selected` written
    // by the SelectionStatePlugin, NOT a CSS `:has()` cascade. Reasons:
    //   1. Firefox rollout gaps (Safari, Chrome, and Firefox all support
    //      `:has()` now, but SSR environments + older browsers don't).
    //   2. Large-doc perf — `:has()` can be quadratic on deep nested trees.
    //   3. Debuggability — DOM `data-*` attrs are trivially inspectable;
    //      a CSS `:has()` cascade is not.
    //   4. SSR parity — plugin state survives without CSS support.
    //
    // Detection: match `:has(` on any line whose selector (i.e., the line
    // itself or the containing selector block) includes a selection-related
    // marker — `data-selected`, `data-has-child-selected`, or
    // `--selection-halo`. Other `:has()` usages (chrome hover innermost-
    // wins, slot hover, etc.) are out of scope — they don't govern
    // selection state.
    const cssPath = join(APP_SRC_DIR, 'globals.css');
    const css = readFileSync(cssPath, 'utf-8');
    const lines = css.split('\n');

    const hasPattern = /:has\(/;
    const selectionMarker =
      /data-selected|data-has-child-selected|--selection-halo|selection-halo-opacity/;
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!hasPattern.test(line)) continue;

      // Check the line itself AND the surrounding selector block (up to 3
      // lines back for multi-line selectors like `.foo:not(\n  :has(...))`).
      const windowStart = Math.max(0, i - 3);
      const windowEnd = Math.min(lines.length, i + 4);
      const selectorContext = lines.slice(windowStart, windowEnd).join('\n');

      if (selectionMarker.test(selectorContext)) {
        violations.push(`  packages/app/src/globals.css:${i + 1}    ${line.trim()}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Selection-halo CSS rules must not use \`:has()\` — precedent #30 requires innermost-wins via plugin-state propagation (\`data-has-child-selected\`). Move the cascade logic into SelectionStatePlugin's apply function and let JsxComponentView emit the attribute:\n${violations.join('\n')}`,
      );
    }
  });

  test('selection-halo transition uses `var(--ease-out-strong)`, not bare `ease-out` (round-2 review fix)', () => {
    // Round-2 cloud-review finding (commit 4e9d96a5): the halo opacity
    // transition originally used bare `ease-out` but every other transition
    // in globals.css (7 of them) uses `var(--ease-out-strong)`. Silent
    // inconsistency regression is easy to re-introduce; guard statically.
    const cssPath = join(APP_SRC_DIR, 'globals.css');
    const css = readFileSync(cssPath, 'utf-8');
    const lines = css.split('\n');

    // Find the halo-architecture section and look for a transition-opacity
    // or transition: opacity line that uses bare `ease-out`.
    const haloStart = lines.findIndex((l) => /\/\*\s*7a\..*selection/i.test(l));
    if (haloStart === -1) {
      throw new Error(
        `globals.css: expected "7a. Selection halo" section anchor not found — same rename/removal case as the :has() rule above.`,
      );
    }
    const sectionHeaderPattern = /\/\*\s*(?:7b|8|9)\./i;
    let haloEnd = lines.length;
    for (let i = haloStart + 1; i < lines.length; i++) {
      if (sectionHeaderPattern.test(lines[i] ?? '')) {
        haloEnd = i;
        break;
      }
    }

    // Match `transition:*ease-out` (bare, no leading `-` or `--ease`) on the
    // same line. Not a match: `var(--ease-out-strong)`, `ease-out-strong`.
    // Is a match: `transition: opacity 180ms ease-out;` (what round-2 fixed).
    const violations: string[] = [];
    for (let i = haloStart; i < haloEnd; i++) {
      const line = lines[i] ?? '';
      if (!line.includes('transition')) continue;
      // Strip CSS custom property usage (`var(--ease-out-strong)`) so the
      // bare-`ease-out` detector doesn't false-positive on the correct form.
      const stripped = line.replace(/var\([^)]*\)/g, '');
      if (/\bease-out\b/.test(stripped)) {
        violations.push(`  packages/app/src/globals.css:${i + 1}    ${line.trim()}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Selection-halo transition uses bare \`ease-out\` — use \`var(--ease-out-strong)\` for consistency with the repo's 7 other transitions (round-2 review fix, commit 4e9d96a5):\n${violations.join('\n')}`,
      );
    }
  });
});
