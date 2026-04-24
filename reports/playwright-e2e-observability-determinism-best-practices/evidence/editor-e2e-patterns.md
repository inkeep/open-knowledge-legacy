---
dimension: Follow-up D — Editor E2E test design patterns
date: 2026-04-17
sources:
  - github.com/TypeCellOS/BlockNote
  - github.com/Milkdown/milkdown
  - github.com/facebook/lexical
  - github.com/ueberdosis/tiptap
---

# Evidence: Editor E2E test design patterns (code-first catalog)

**Primary question:** How do mature editor projects structure E2E tests? Code-first catalog, with file:line citations from BlockNote, Milkdown, Lexical, and Tiptap.

**Survey scope:**
- BlockNote (20 E2E specs + 10 helper files) — deep read of code
- Milkdown (40+ specs in 9 feature dirs + 1 helper module) — deep read
- Lexical (48+ specs + `utils/index.mjs` + `keyboardShortcuts/index.mjs`) — via WebFetch of primary source
- Tiptap (2 Cypress legacy specs) — direct read

---

## Findings

### Finding: Universal keyboard-type + state-assert template

**Confidence:** CONFIRMED
**Evidence:**

```ts
// BlockNote — event-wait + explicit selector assertion
// tests/src/end-to-end/slashmenu/slashmenu.test.ts:40-43
await focusOnEditor(page);
await executeSlashCommand(page, "h1");
await page.keyboard.type("This is a H1");
await waitForSelectorInEditor(page, H_ONE_BLOCK_SELECTOR);

// Milkdown — locator auto-retry on text + markdown round-trip
// e2e/tests/input/heading.spec.ts:10-16
await focusEditor(page)
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
const markdown = await getMarkdown(page)
expect(markdown).toBe('# Heading1\n')

// Lexical — tagged-template HTML assertion
// packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs
await focusEditor(page);
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
await page.keyboard.type('My Heading');
await assertHTML(page, html`<h1 class="..."><span data-lexical-text="true">My Heading</span></h1>`);
```

**Typing primitive is universal.** `page.keyboard.type()` for multi-character input in 100% of observed cases. `{ delay }` option used selectively on single-key presses where handlers must settle (`keyboard.press("Enter", { delay: TYPE_DELAY })` in BlockNote, where `TYPE_DELAY = 10`). Milkdown uses `type('abcdefghij', { delay: 30 })` exactly once for a debounce test. Otherwise no delay. No surveyed editor uses `locator.fill()` or `pressSequentially()` for editor text input.

---

### Finding: Editor state exposed on `window` — universal pattern

**Confidence:** CONFIRMED
**Evidence:**

**BlockNote** at `tests/src/utils/editor.ts:25-31`:

```ts
export async function getDoc(page: Page) {
  const window = await page.evaluateHandle("window");
  const doc = await window.evaluate((win) => (win as any).ProseMirror.getJSON());
  return doc;
}
```

**Milkdown** at `e2e/tests/misc/index.ts:12, 19`:

```ts
export const getMarkdown = async (page: Page): Promise<string> =>
  await page.evaluate(() => (window as any).__getMarkdown__())

export const setMarkdown = async (page: Page, markdown: string): Promise<void> =>
  await page.evaluate((md) => (window as any).__setMarkdown__(md), markdown)
```

Command API test at `e2e/tests/multiple/command.spec.ts:10-13`:

```ts
await page.evaluate(() => {
  (window as any).commands.addTable?.()
})
```

**Lexical** via `exposeLexicalEditor(page)` helper in `utils/index.mjs`:

```js
window.lexicalEditor = document.querySelector('[data-lexical-editor="true"]').__lexicalEditor
```

**DOM alone is insufficient for editor-state assertions** — round-trip markdown equality or JSON-snapshot assertion against the editor's own public API is the shared convention.

---

### Finding: Slash-menu pattern uses two-tier wait

**Confidence:** CONFIRMED
**Evidence:** BlockNote `tests/src/utils/slashmenu.ts:4-15`:

```ts
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

Lexical's equivalent (implicit second wait is in `assertHTML` auto-retry):

```js
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
```

**Selector conventions:**
- BlockNote: feature-class selectors `.bn-suggestion-menu` (slash), `.bn-grid-suggestion-menu` (emoji); `data-test="..."` for named buttons.
- Lexical: semantic class selectors `.typeahead-popover`, `.typeahead-popover .icon.h1`.
- Neither uses text-based selectors (`getByText("Heading 1")`) — avoids i18n brittleness.

**Mentions and slash-menu are isomorphic.** Lexical's `Mentions.spec.mjs` uses the same template — type trigger (`@`), wait for match, press `Enter`. A single `openSuggestionMenu(page, triggerChar)` helper could serve both.

---

### Finding: Three helper organization shapes coexist

**Confidence:** CONFIRMED
**Evidence:**

**BlockNote `tests/src/utils/`** (10 files, one per UI surface):

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

**Milkdown `e2e/tests/misc/index.ts`** (one file, 73 lines, 6 exports): `focusEditor`, `getMarkdown`, `setMarkdown`, `loadFixture`, `pressMetaKey`, `selectAll`, `paste`, `waitNextFrame`.

**Lexical `packages/lexical-playground/__tests__/utils/` + `keyboardShortcuts/`** — ~60 named function exports across domain-split directories.

**All three use named function exports taking `page: Page` as first argument.** No class-based Page Object Model. No Playwright `test.extend({...})` fixtures wrapping editor operations. Each test file uses `test.beforeEach(async ({page}) => await page.goto(URL))` for per-test isolation via fresh page load.

---

### Finding: Three coexisting cross-platform shortcut strategies

**Confidence:** CONFIRMED
**Evidence:**

**Strategy 1 — Playwright's `ControlOrMeta` token** (BlockNote `tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:341`):

```ts
await page.keyboard.press("ControlOrMeta+Alt+1");
```

Minimal ceremony. Resolves to `Meta` on Mac and `Control` on Win/Linux at press time.

**Strategy 2 — runtime `process.platform` returning release callback** (Milkdown `e2e/tests/misc/index.ts:27-32`):

```ts
export async function pressMetaKey(page: Page) {
  const isMac = process.platform === 'darwin'
  const key = isMac ? 'Meta' : 'Control'
  await page.keyboard.down(key)
  return () => page.keyboard.up(key)
}
```

Explicit; useful for held-modifier multi-press sequences.

**Strategy 3 — browser-side `navigator.platform` detection** (Lexical `keyboardShortcuts/index.mjs`):

```js
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

Required when different OSes use genuinely different keys (Cmd+Arrow vs Home).

**Held-modifier chords** (BlockNote `keyboardhandlers.test.ts:29-33`):

```ts
await page.keyboard.down("Shift");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ControlOrMeta+ArrowRight");
await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Shift");
```

---

### Finding: Five assertion styles coexist within any mature suite

**Confidence:** CONFIRMED
**Evidence:**

| Style | Target | Example |
|---|---|---|
| Locator auto-retry | Visible text / structure | `expect(editor.locator('h1')).toHaveText('Heading1')` |
| Locator count/attribute | Structural invariants | `expect(await page.locator(BLOCK_GROUP_SELECTOR).count()).toBe(1)` |
| Markdown round-trip equality | Parser+serializer | `expect(await getMarkdown(page)).toBe('# Heading1\n')` |
| JSON snapshot | Full editor state | `expect(doc).toMatchSnapshot('enterSelectionNotEmpty.json')` |
| HTML tagged-template | Rendered HTML subtree | `await assertHTML(page, html\`<h1 ...>...</h1>\`)` |
| PNG screenshot (sparingly) | Visual rendering | `expect(await page.screenshot()).toMatchSnapshot('slash_menu_page_down.png')` |

**BlockNote's snapshot helper** (`tests/src/utils/editor.ts:25-48`):

```ts
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

**Milkdown's dual-assert per test** (DOM + markdown round-trip) covers both view-layer and parser/serializer regressions:

```ts
// milkdown/e2e/tests/input/heading.spec.ts:10-16
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
await expect(editor.locator('h1')).toHaveAttribute('id', 'heading1')
const markdown = await getMarkdown(page)
expect(markdown).toBe('# Heading1\n')
```

**Lexical's tagged-template HTML** (`utils/index.mjs:605-634`):

```js
export async function assertHTML(
  page, expectedHtml,
  expectedHtmlFrameRight = expectedHtml,
  {ignoreClasses = false, ignoreInlineStyles = false, ignoreDir = false} = {},
  actualHtmlModificationsCallback,
)
```

PNG snapshots reserved for tests explicitly protecting visual rendering (`slash_menu_page_down.png` after PageDown); bulk of state assertions use JSON.

---

### Finding: Timing-primitive counts — `waitForTimeout` endemic even in mature editor suites

**Confidence:** CONFIRMED
**Evidence:** Raw counts from subagent surveys:

| Project | `waitForTimeout` | Top value | Per-spec average | Enforcement |
|---|---|---|---|---|
| BlockNote (end-to-end specs) | 76 | 58× 500ms | ~3-4 per spec | None |
| BlockNote (incl. `utils/`) | 84 | — | — | None |
| Milkdown | 26 | 17× 100ms | < 1 per spec | None |
| Tiptap Playwright | 0 | — | — | Cypress legacy only |

None of the surveyed projects has a STOP rule against `waitForTimeout`.

**Event-based alternatives in the wild:**

1. **`waitForSelector(className)`** — used for menu/modal appearance. BlockNote: 58 uses.
2. **Locator auto-retry via `toHaveText`/`toHaveAttribute`** — primary Milkdown pattern.
3. **`waitNextFrame` via double rAF** — Milkdown's deterministic one-paint wait (`e2e/tests/misc/index.ts:62-72`):

```ts
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

4. **`waitForEvent('console')`** — Milkdown's pattern for editor-listener assertions (`e2e/tests/plugin/listener.spec.ts:11-18`):

```ts
let msgPromise = page.waitForEvent('console')
await page.keyboard.type('A')
const msg = await msgPromise
const afterText = await msg.args()[0]?.jsonValue()
expect(afterText).toBe('testA\n')
```

**Lexical's `sleep()` used sparingly** — reserved for async-work-without-selector-signal (image insertion, DateTime nodes) at `utils/index.mjs:890-895`:

```js
export async function sleep(delay) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}
export async function sleepInsertImage(count = 1) {
  return await sleep(1000 * count);
}
```

---

## Gaps / follow-ups

- Lexical `assertHTML` normalization internals (string-diff vs structural-diff implementation) summarized via WebFetch, not read byte-for-byte.
- Outline has no Playwright E2E suite (verified via `find ... -name "*.e2e.ts"` returning empty).
- Slate, AFFiNE, ProseMirror examples were in the target list but not locally cloned; omitted to stay within P0 scope.
