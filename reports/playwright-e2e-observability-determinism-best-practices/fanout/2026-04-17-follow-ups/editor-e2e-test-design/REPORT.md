---
title: "Editor E2E Test Design — BlockNote, Milkdown, Lexical Pattern Catalog"
description: "Factual pattern catalog from the actual Playwright E2E test code of mature editor projects (BlockNote, Milkdown, Lexical) and supporting signal from Tiptap. Covers keyboard-type + assertion sequences, slash-menu test flows, helper organization, cross-platform shortcut handling, assertion styles, and timing primitive conventions."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - BlockNote
  - Milkdown
  - Lexical
  - Tiptap
  - Playwright
topics:
  - editor e2e testing
  - slash menu testing
  - test helper organization
  - cross-platform shortcuts
  - assertion styles
---

# Editor E2E Test Design — BlockNote, Milkdown, Lexical Pattern Catalog

**Purpose:** Surface the concrete patterns mature editor projects use in their actual Playwright test code — so the parent spec can pick specific shapes when refactoring `slash-command.e2e.ts` and its siblings. Code-first, no tool comparison, no recommendations beyond "here is what the community does."

---

## Executive Summary

Across BlockNote (20 E2E spec files), Milkdown (40+ spec files in `e2e/tests/`), Lexical (48+ spec files under `lexical-playground/__tests__/e2e/`), and Tiptap (Cypress legacy, 2 specs), the shape of an editor E2E test converges on a small set of conventions. The parent spec's refactor target — `type → open suggestion menu → filter → select → assert` — is solved by all three mature Playwright suites with a shared template:

1. A `focusEditor(page)` helper that locates and focuses the contenteditable surface.
2. Typing via `page.keyboard.type(str)` — never `locator.fill()`, never `pressSequentially`.
3. Event-based wait for suggestion UI (`waitForSelector('.<menu-class>')`) followed by a short fixed timeout (~100ms) as a focus-handoff buffer.
4. Filter by typing additional characters; select via `Enter` (first match) or a selector click (specific target).
5. Assert on one or more of: auto-retrying DOM locator, markdown round-trip, ProseMirror/editor-state JSON snapshot, or tagged-template HTML.

**Key findings:**

- **Typing primitive is universal.** `page.keyboard.type()` for multi-char input; `page.keyboard.press(Key, { delay })` for race-sensitive single keys (Enter/Tab/Arrow). No surveyed editor uses `locator.fill()` or `pressSequentially()`.
- **Editor state exposed on `window`.** Every project exposes a test-only API: `window.ProseMirror.getJSON()` (BlockNote), `window.__getMarkdown__()` / `window.__setMarkdown__()` / `window.commands.*` (Milkdown), `window.lexicalEditor` (Lexical). DOM alone is insufficient for editor-state assertions.
- **Helpers are functional + feature-grouped, not class-based or fixture-based.** BlockNote splits ~10 helper files by surface (slashmenu.ts, editor.ts, copypaste.ts, draghandle.ts, …). Milkdown consolidates into one `misc/index.ts` (~73 lines, 6 exports). Lexical splits `utils/` and `keyboardShortcuts/` (~50 named shortcut functions). No Page Object Model.
- **Cross-platform shortcuts: three strategies coexist.** Playwright's built-in `ControlOrMeta` token (BlockNote), a runtime `process.platform === 'darwin'` check returning an `up` release callback (Milkdown), and browser-side `navigator.platform` detection branching inside named helpers (Lexical).
- **Assertion styles stack by protection layer.** DOM locator auto-retry (`toHaveText`) + markdown round-trip equality + JSON snapshot of editor state + optional PNG for visual concerns. Milkdown's inline markdown-equality + `toHaveText` combo covers both view and serialization regressions per test.
- **`waitForTimeout` is used everywhere; the ratio varies.** BlockNote: 76 timeouts across ~20 specs (58× 500ms). Milkdown: 26 timeouts across 40+ specs (17× 100ms). Neither has a STOP rule. Event-based alternatives exist (`waitForSelector`, `waitForEvent('console')`, `waitNextFrame` via double rAF) and Milkdown leans on them more heavily.

---

## Research Rubric

**Primary question:** How do mature editor projects structure E2E tests — the test file shapes, helper patterns, keyboard/mouse interaction patterns, and assertion styles?

**Stance:** Factual pattern catalog. No recommendations, no ranking, no 1P-applicability analysis. Findings are intended for the parent spec to pick from.

**Dimensions (all P0):**

| # | Dimension | Depth |
|---|---|---|
| 1 | Keyboard-type + state-assert patterns | Deep |
| 2 | Slash-menu / suggestion-extension test patterns | Deep |
| 3 | Helper organization in practice | Moderate |
| 4 | Keyboard shortcut testing (Cmd vs Ctrl) | Moderate |
| 5 | Assertion styles | Moderate |
| 6 | Test timing primitives | Moderate |

**Non-goals (inherited from parent):** Per-test docName isolation, bridge-convergence fuzz testing, tool comparison, 1P Open Knowledge analysis, mobile testing.

**Survey scope actually reached:**
- BlockNote (20 E2E specs + 10 helper files) — deep read of code
- Milkdown (40+ specs in 9 feature dirs + 1 helper module) — deep read of code
- Lexical (48+ specs + `utils/index.mjs` + `keyboardShortcuts/index.mjs`) — code via WebFetch of primary source
- Tiptap (2 Cypress legacy specs) — direct read
- Outline — no E2E tests present (`find ... -name "*.e2e.ts"` empty)
- Slate, AFFiNE, ProseMirror examples — not locally cloned; omitted to stay within P0 scope

---

## Detailed Findings

### Dimension 1 — Keyboard-type + state-assert patterns

**Finding:** The universal pattern is `focusEditor → keyboard.type(str) → expect(locator).toHaveText(...)` OR `→ snapshot(state)`. Typing and assertion are always discrete steps; no "typeAndAssert" combined helper exists in any surveyed repo.

**Evidence:** [evidence/keyboard-type-assert-patterns.md](evidence/keyboard-type-assert-patterns.md)

**Concrete shapes observed:**

```ts
// BlockNote — event-wait + explicit selector assertion
await focusOnEditor(page);
await executeSlashCommand(page, "h1");
await page.keyboard.type("This is a H1");
await waitForSelectorInEditor(page, H_ONE_BLOCK_SELECTOR);
// slashmenu.test.ts:40-43

// Milkdown — locator auto-retry on text + markdown round-trip
await focusEditor(page)
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
const markdown = await getMarkdown(page)
expect(markdown).toBe('# Heading1\n')
// input/heading.spec.ts:10-16

// Lexical — tagged-template HTML assertion
await focusEditor(page);
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
await page.keyboard.type('My Heading');
await assertHTML(page, html`<h1 class="..."><span data-lexical-text="true">My Heading</span></h1>`);
// ComponentPicker.spec.mjs
```

**Typing API choice:** `page.keyboard.type()` for multi-character input in 100% of observed cases. The `{ delay }` option is used selectively on single-key presses where handlers must settle (`keyboard.press("Enter", { delay: TYPE_DELAY })` in BlockNote, where `TYPE_DELAY = 10`), and exactly once on a multi-char `type()` in Milkdown's debounce test (`type('abcdefghij', { delay: 30 })`). Otherwise no delay.

**State exposure:** Every project exposes editor state on `window` for test access:
- BlockNote: `window.ProseMirror.getJSON()` (`tests/src/utils/editor.ts:27-28`)
- Milkdown: `window.__getMarkdown__()`, `window.__setMarkdown__(md)`, `window.commands.addTable?.()` (`e2e/tests/misc/index.ts:12, 19; e2e/tests/multiple/command.spec.ts:10-13`)
- Lexical: `window.lexicalEditor = document.querySelector('[data-lexical-editor="true"]').__lexicalEditor` via `exposeLexicalEditor(page)` (`utils/index.mjs`)

---

### Dimension 2 — Slash-menu / suggestion-extension test patterns

**Finding:** A two-tier wait pattern — `waitForSelector(menuClass)` after the trigger, `waitForTimeout(100)` before typing the filter — is the common default. Filtering is done by typing more chars; selection is via `Enter` (trust-first-match) or a selector-specific click. Tests do not enumerate the filtered list.

**Evidence:** [evidence/slash-menu-suggestion-patterns.md](evidence/slash-menu-suggestion-patterns.md)

**Canonical shape (BlockNote `executeSlashCommand`):**

```ts
// blocknote/tests/src/utils/slashmenu.ts:4-15
export async function openSlashMenu(page: Page) {
  await page.keyboard.press("/");
  await page.waitForSelector(SLASH_MENU_SELECTOR);   // event-based — menu appeared
}

export async function executeSlashCommand(page: Page, command: string) {
  await openSlashMenu(page);
  await page.waitForTimeout(100);                    // focus-handoff buffer
  await page.keyboard.type(command);                 // filter
  await page.keyboard.press("Enter");                // select first match
  await page.waitForTimeout(500);                    // command-execute insurance
}
```

**Lexical's equivalent** (implicit second wait is in `assertHTML` auto-retry):
```ts
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
```

**Selector conventions:**
- BlockNote: feature-class selectors `.bn-suggestion-menu` (slash), `.bn-grid-suggestion-menu` (emoji); `data-test="..."` for named buttons like `[data-test="italic"]`, `[data-test="createLink"]`.
- Lexical: semantic class selectors `.typeahead-popover`, `.typeahead-popover .icon.h1`.
- Neither uses text-based selectors (`getByText("Heading 1")`) — avoids i18n brittleness.

**Mentions and slash-menu are isomorphic.** Lexical's `Mentions.spec.mjs` uses the same template — type trigger (`@`), wait for match, press `Enter`. A single `openSuggestionMenu(page, triggerChar)` helper could serve both.

---

### Dimension 3 — Helper organization in practice

**Finding:** Three valid shapes exist in the wild, correlated with suite scale:

| Shape | Project | File count | When it fits |
|---|---|---|---|
| One file per UI surface, flat `utils/` dir | BlockNote | 10 | Medium suite (~20 specs), multiple distinct surfaces (slash, emoji, drag, copy) |
| Single `misc/index.ts` module | Milkdown | 1 (6 exports) | Small surface area, < 10 shared helpers |
| Split `utils/` + `keyboardShortcuts/` dirs | Lexical | 2+ dirs, ~60 exports | Large suite (48+ specs), domain-shaped divisions |

**Evidence:** [evidence/helper-organization.md](evidence/helper-organization.md)

**BlockNote `tests/src/utils/` layout:**

```
utils/
├── const.ts           (selectors, URLs, TYPE_DELAY)
├── editor.ts          (focusOnEditor, waitForSelectorInEditor, getDoc, compareDocToSnapshot)
├── slashmenu.ts       (openSlashMenu, executeSlashCommand)
├── emojipicker.ts
├── draghandle.ts
├── copypaste.ts       (insertHeading, insertParagraph, clipboard ops)
├── mouse.ts
├── debug.ts
├── components/        (test-page React components)
└── customblocks/      (test fixtures: Alert.tsx, Button.tsx, etc.)
```

**Milkdown `e2e/tests/misc/index.ts` exports (one file, 73 lines):**
`focusEditor`, `getMarkdown`, `setMarkdown`, `loadFixture`, `pressMetaKey`, `selectAll`, `paste`, `waitNextFrame`.

**All three use named function exports taking `page: Page` as first argument. No class-based Page Object Model, no Playwright `test.extend({...})` fixtures wrapping editor operations.** Each test file uses `test.beforeEach(async ({page}) => await page.goto(URL))` for per-test isolation via fresh page load.

---

### Dimension 4 — Keyboard shortcut testing (Cmd vs Ctrl)

**Finding:** Three coexisting strategies with clear tradeoffs:

1. **Playwright `ControlOrMeta` token** — the minimal-ceremony choice, resolves to `Meta` on Mac and `Control` on Win/Linux at press time.
   ```ts
   // blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:341
   await page.keyboard.press("ControlOrMeta+Alt+1");
   ```

2. **Runtime `process.platform` check returning release callback** — explicit, useful for held-modifier multi-press sequences.
   ```ts
   // milkdown/e2e/tests/misc/index.ts:27-32
   export async function pressMetaKey(page: Page) {
     const isMac = process.platform === 'darwin'
     const key = isMac ? 'Meta' : 'Control'
     await page.keyboard.down(key)
     return () => page.keyboard.up(key)
   }
   ```

3. **Browser-side `navigator.platform` detection inside named helpers** — required when different OSes use genuinely different keys (Cmd+Arrow vs Home).
   ```js
   // lexical/.../keyboardShortcuts/index.mjs
   export async function moveToLineBeginning(page) {
     if (IS_MAC) {
       await keyDownCtrlOrMeta(page);
       await page.keyboard.press('ArrowLeft');
       await keyUpCtrlOrMeta(page);
     } else {
       await page.keyboard.press('Home');
     }
   }
   ```

**Evidence:** [evidence/keyboard-shortcut-testing.md](evidence/keyboard-shortcut-testing.md)

**Held-modifier chords:** For multi-step selection under a modifier, the `down(key)` + presses + `up(key)` pattern is used explicitly:

```ts
// blocknote/.../keyboardhandlers.test.ts:29-33
await page.keyboard.down("Shift");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ControlOrMeta+ArrowRight");
await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Shift");
```

---

### Dimension 5 — Assertion styles

**Finding:** Four assertion styles coexist within any mature suite; choice correlates with what the test is protecting.

| Style | Target | Example |
|---|---|---|
| Locator auto-retry (Playwright built-in) | Visible text / structure | `expect(editor.locator('h1')).toHaveText('Heading1')` |
| Locator count/attribute | Structural invariants | `expect(await page.locator(BLOCK_GROUP_SELECTOR).count()).toBe(1)` |
| Markdown round-trip equality | Parser+serializer | `expect(await getMarkdown(page)).toBe('# Heading1\n')` |
| JSON snapshot | Full editor state | `expect(doc).toMatchSnapshot('enterSelectionNotEmpty.json')` |
| HTML tagged-template | Rendered HTML subtree | `await assertHTML(page, html\`<h1 ...>...</h1>\`)` |
| PNG screenshot (sparingly) | Visual rendering | `expect(await page.screenshot()).toMatchSnapshot('slash_menu_page_down.png')` |

**Evidence:** [evidence/assertion-styles.md](evidence/assertion-styles.md)

**BlockNote's canonical snapshot helper:**

```ts
// blocknote/tests/src/utils/editor.ts:25-48
export async function getDoc(page: Page) {
  const window = await page.evaluateHandle("window");
  const doc = await window.evaluate((win) => (win as any).ProseMirror.getJSON());
  return doc;
}

export async function compareDocToSnapshot(page: Page, name: string) {
  const doc = JSON.stringify(await getDoc(page), null, 2);
  expect(doc).toMatchSnapshot(`${name}.json`);
}
```

Used 20+ times across `keyboardhandlers.test.ts` — one snapshot per keyboard-handler invariant. Accompanied by `removeAttFromDoc(doc, att)` for stripping non-deterministic attrs (auto-generated IDs).

**Milkdown's dual-assert per test** (DOM + markdown round-trip) covers both view-layer and parser/serializer regressions in one case:

```ts
// milkdown/.../heading.spec.ts:10-16
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
await expect(editor.locator('h1')).toHaveAttribute('id', 'heading1')
const markdown = await getMarkdown(page)
expect(markdown).toBe('# Heading1\n')
```

**Lexical's tagged-template HTML with normalization options:**

```js
// lexical/.../utils/index.mjs:605-634
export async function assertHTML(
  page, expectedHtml,
  expectedHtmlFrameRight = expectedHtml,
  {ignoreClasses = false, ignoreInlineStyles = false, ignoreDir = false} = {},
  actualHtmlModificationsCallback,
)
```

PNG snapshots are reserved for tests explicitly protecting visual rendering (`slash_menu_page_down.png` after PageDown); the bulk of state assertions use JSON.

---

### Dimension 6 — Test timing primitives

**Finding:** `waitForTimeout` is present in every surveyed Playwright suite; the ratio to event-based waits is where projects diverge. No surveyed project has a STOP rule against `waitForTimeout`.

**Evidence:** [evidence/test-timing-primitives.md](evidence/test-timing-primitives.md)

**Raw counts:**

| Project | `waitForTimeout` | Top value | Per-spec average |
|---|---|---|---|
| BlockNote | 76 | 58× 500ms | ~3-4 per spec (~20 specs) |
| Milkdown | 26 | 17× 100ms | < 1 per spec (40+ specs) |
| Tiptap Playwright | 0 | — | Cypress legacy only |

**Event-based alternatives in the wild:**

1. **`waitForSelector(className)`** — used for menu/modal appearance. BlockNote: 58 uses.
2. **Locator auto-retry via `toHaveText`/`toHaveAttribute`** — primary Milkdown pattern. ~15-line-count per spec.
3. **`waitNextFrame` via double rAF** — Milkdown's deterministic one-paint wait:
   ```ts
   // milkdown/e2e/tests/misc/index.ts:62-72
   export async function waitNextFrame(page: Page) {
     await page.evaluate(() => {
       return new Promise<void>((resolve) => {
         requestAnimationFrame(() => {
           requestAnimationFrame(() => { resolve() })
         })
       })
     })
   }
   ```
4. **`waitForEvent('console')`** — Milkdown's pattern for editor-listener assertions: arm the promise, type, consume the console-log payload:
   ```ts
   // milkdown/e2e/tests/plugin/listener.spec.ts:11-18
   let msgPromise = page.waitForEvent('console')
   await page.keyboard.type('A')
   const msg = await msgPromise
   const afterText = await msg.args()[0]?.jsonValue()
   expect(afterText).toBe('testA\n')
   ```

**Lexical's `sleep()` is used sparingly** — reserved for async-work-without-selector-signal (image insertion, DateTime nodes):

```js
// lexical/.../utils/index.mjs:890-895
export async function sleep(delay) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}
export async function sleepInsertImage(count = 1) {
  return await sleep(1000 * count);
}
```

---

## Cross-Dimension Synthesis: The Editor E2E Template

Assembled from the findings, the common shape of an editor E2E test looks like:

```ts
// Shared helpers (either flat utils/ or misc/index.ts)
export async function focusEditor(page: Page);              // required — entry point
export async function getMarkdown(page: Page): Promise<string>;   // OR getDoc() returning JSON
export async function pressMetaKey(page: Page): Promise<() => Promise<void>>;  // OR use ControlOrMeta
export async function openSlashMenu(page: Page);            // press '/' + waitForSelector(menuClass)
export async function executeSlashCommand(page: Page, cmd: string);  // open + wait + type + Enter
export async function waitNextFrame(page: Page);            // rAF×2 — deterministic paint wait

// Test body template
test.beforeEach(async ({page}) => await page.goto(BASE_URL));

test('feature X', async ({page}) => {
  await focusEditor(page);
  await page.keyboard.type('setup text');                   // no delay on multi-char
  await page.keyboard.press('Enter', { delay: 10 });        // delay on race-sensitive single-key
  await executeSlashCommand(page, 'h1');
  await page.keyboard.type('target content');

  // Assert — stack as many layers as invariants require
  await expect(page.locator('h1')).toHaveText('target content');
  expect(await getMarkdown(page)).toBe('# target content\n');
  // OR: await assertHTML(page, html`<h1>...</h1>`);
  // OR: await compareDocToSnapshot(page, 'featureX.json');
});
```

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Lexical `assertHTML` normalization internals** — The function signature + options are confirmed (lines 605-634 of `utils/index.mjs`), but the exact string-diff vs structural-diff implementation was summarized via WebFetch, not read byte-for-byte.
- **Outline** has no Playwright E2E suite (verified via `find` returning empty for `*.e2e.ts` under the repo).
- **Slate, AFFiNE, ProseMirror examples** were in the target list but not locally cloned; to stay within P0 scope on the present dimensions, GitHub WebFetch was deferred. Future pass could add these if additional convention-samples are needed.

### Out of scope (per rubric)

- Per-test docName isolation (parent's sibling spec owns this).
- Bridge-convergence fuzz testing.
- Playwright-vs-Cypress-vs-WebdriverIO tool comparison.
- 1P Open Knowledge codebase analysis (parent spec consumes this report).
- Mobile testing.

---

## References

### Evidence Files

- [evidence/keyboard-type-assert-patterns.md](evidence/keyboard-type-assert-patterns.md) — Typing APIs, delay conventions, assertion targets.
- [evidence/slash-menu-suggestion-patterns.md](evidence/slash-menu-suggestion-patterns.md) — Two-tier wait, filter-by-typing, selector-based selection.
- [evidence/helper-organization.md](evidence/helper-organization.md) — Three directory shapes (flat utils / single misc / domain split).
- [evidence/keyboard-shortcut-testing.md](evidence/keyboard-shortcut-testing.md) — `ControlOrMeta` vs `process.platform` vs `navigator.platform`.
- [evidence/assertion-styles.md](evidence/assertion-styles.md) — Auto-retry / round-trip / JSON / HTML / PNG assertion styles.
- [evidence/test-timing-primitives.md](evidence/test-timing-primitives.md) — Timeout counts, event-based alternatives.

### Primary Sources

- [BlockNote test harness](https://github.com/TypeCellOS/BlockNote/tree/main/tests) (local clone `~/.claude/oss-repos/blocknote/tests/`)
- [Milkdown e2e tests](https://github.com/Milkdown/milkdown/tree/main/e2e) (local clone `~/.claude/oss-repos/milkdown/e2e/`)
- [Lexical playground __tests__](https://github.com/facebook/lexical/tree/main/packages/lexical-playground/__tests__) — WebFetch
- [Tiptap tests](https://github.com/ueberdosis/tiptap/tree/main/tests) (local clone `~/.claude/oss-repos/tiptap/tests/`)
