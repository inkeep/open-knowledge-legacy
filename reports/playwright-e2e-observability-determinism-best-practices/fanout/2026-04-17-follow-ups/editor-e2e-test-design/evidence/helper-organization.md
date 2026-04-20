---
name: Helper organization in practice
description: How mature editor E2E suites organize their helpers — directory layout, file count, export style, fixture vs functional, shared vs per-test.
type: evidence
---

# Evidence: Helper organization in practice

**Dimension:** Helper organization in practice (P0 Moderate)
**Date:** 2026-04-17
**Sources:** BlockNote, Milkdown, Lexical

---

## Key files / pages referenced

- `blocknote/tests/src/utils/` — directory listing + individual helper files
- `milkdown/e2e/tests/misc/index.ts` — single-file Milkdown helper module
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs` — Lexical core util module
- `lexical/packages/lexical-playground/__tests__/keyboardShortcuts/index.mjs` — dedicated shortcut helper module

---

## Findings

### Finding: BlockNote uses one-file-per-feature helpers in a flat `utils/` directory (10 files)
**Confidence:** CONFIRMED
**Evidence:**

```
blocknote/tests/src/utils/
├── components/           (test-page React components: Editor.tsx, EditorWithTextArea.tsx, CSS)
├── customblocks/         (test fixtures: Alert.tsx, Button.tsx, Embed.tsx, Image.tsx, etc.)
├── const.ts              (selectors, URLs, TYPE_DELAY)
├── copypaste.ts          (clipboard-focused helpers: insertHeading, insertParagraph)
├── debug.ts              (debug utilities)
├── draghandle.ts         (drag-handle-focused helpers)
├── editor.ts             (focusOnEditor, waitForSelectorInEditor, waitForTextInEditor, getDoc, compareDocToSnapshot)
├── emojipicker.ts        (emoji-picker-specific helpers)
├── mouse.ts              (mouse interaction helpers)
└── slashmenu.ts          (openSlashMenu, executeSlashCommand)
```

**Source:** `ls ~/.claude/oss-repos/blocknote/tests/src/utils/`, verified by direct Read of individual files.

**Implications:** Each feature area gets its own helper file, named for the UI surface it tests. File count ≈ number of UI surfaces being tested (slash menu, emoji picker, drag handle, copy-paste, mouse, editor focus). Matches the parent report's recommendation of ~5-20 files for editor-suite sizes.

### Finding: Milkdown uses a single `misc/index.ts` module (73 lines, 6 exports)
**Confidence:** CONFIRMED
**Evidence:** `milkdown/e2e/tests/misc/index.ts` contains all shared helpers in one file:

```ts
// milkdown/e2e/tests/misc/index.ts (complete export list)
export async function focusEditor(page: Page) { ... }             // line 6
export async function getMarkdown(page: Page) { ... }             // line 11
export async function setMarkdown(page: Page, markdown: string) { ... } // line 17
export async function loadFixture(filePath: string) { ... }       // line 23
export async function pressMetaKey(page: Page) { ... }            // line 27
export async function selectAll(page: Page) { ... }               // line 34
export async function paste(page: Page, payload: ..., selector) { ... } // line 40
export async function waitNextFrame(page: Page) { ... }           // line 62
```

All tests import from `'../misc'`:

```ts
// milkdown/e2e/tests/shortcut/bold.spec.ts:3
import { focusEditor, getMarkdown, pressMetaKey, selectAll } from '../misc'
```

**Implications:** When the helper count is small (< 10) and no feature is complex enough to warrant its own file, a single shared module is lower-friction than file-splitting. The tradeoff: Milkdown cannot add a slash-menu or drag-handle helper module without restructuring.

### Finding: Lexical splits by semantic domain — `utils/` (general), `keyboardShortcuts/` (keys), plus a separate directory for each
**Confidence:** CONFIRMED
**Evidence:** Lexical's `__tests__/` tree (per WebFetch of `github.com/facebook/lexical/tree/main/packages/lexical-playground/__tests__`):

```
lexical-playground/__tests__/
├── e2e/                    (48+ feature spec files: Mentions.spec.mjs, Tables.spec.mjs, ...)
├── keyboardShortcuts/      (dedicated helper dir for keyboard helpers)
├── regression/             (regression-specific specs)
├── unit/                   (unit tests)
└── utils/                  (assertHtml, index.mjs, other shared helpers)
```

Specs import from both:

```ts
// Mentions.spec.mjs imports split between utils and keyboardShortcuts
import { deleteNextWord, moveLeft, ... } from '../keyboardShortcuts/index.mjs';
import { assertHTML, focusEditor, initialize, test, waitForSelector, ... } from '../utils/index.mjs';
```

**Implications:** Lexical's scale (48+ spec files) justified splitting keyboard shortcuts into its own directory with ~50 exports (`moveToLineBeginning`, `selectAll`, `toggleBold`, `pressBackspace`, etc.). For smaller suites, this degree of split is over-engineered.

### Finding: All three use named exports and functional (non-class, non-fixture) helpers
**Confidence:** CONFIRMED
**Evidence:**

- BlockNote: `export async function focusOnEditor(page: Page)` (editor.ts:4), `export async function openSlashMenu(page: Page)` (slashmenu.ts:4)
- Milkdown: `export async function focusEditor(page: Page)` (misc/index.ts:6)
- Lexical: `export async function focusEditor(page, parentSelector = '.editor-shell')` (utils/index.mjs:723-726)

None use Playwright's `test.extend({fixture: ...})` fixture pattern for editor state; none use class-based Page Objects (no `class EditorPage { async type(...) }`).

**Implications:** The community convention is functional helpers taking `page: Page` as first argument. Fixtures are reserved for cross-test setup (`test.beforeEach` + `initialize`), not for wrapping editor operations.

### Finding: Per-test `beforeEach` navigation is universal; no reliance on `/api/test-reset` semantics
**Confidence:** CONFIRMED
**Evidence:** Every surveyed spec file uses `test.beforeEach(async ({page}) => await page.goto(URL))` or its project-specific equivalent:

```ts
// blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:21-23
test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL);
});
```

```ts
// milkdown/e2e/tests/shortcut/bold.spec.ts:5-7
test.beforeEach(async ({ page }) => {
  await page.goto('/preset-commonmark/')
})
```

```ts
// lexical/packages/lexical-playground/__tests__/e2e/Mentions.spec.mjs (WebFetch verified)
test.describe('Mentions', () => {
  test.beforeEach(({isCollab, page}) => initialize({isCollab, page}));
```

**Implications:** Each test gets a fresh editor by navigating to a URL — the fresh page load owns isolation. No project in the survey uses a `resetEditor` HTTP endpoint to wipe state. This simplifies test setup but adds per-test navigation cost (offset by parallel workers).

---

## Negative searches

- Searched BlockNote + Milkdown for `test.extend(` (Playwright fixture pattern) → not used for editor helpers
- Searched for `class.*Page` or `class.*Editor` Page-Object-Model patterns → none found
- Searched for `beforeAll` editor setup → not used; all projects use `beforeEach` for per-test isolation

---

## Gaps / follow-ups

- Lexical's `initialize()` function implementation details (URL params, iframe handling for `split/` collab mode) were extracted via WebFetch but not read byte-for-byte.
- Outline tests directory has no Playwright E2E — the `*.test.ts` files there are all Vitest unit tests (verified `find ~/.claude/oss-repos/outline -name "*.e2e.ts"` returns empty).
