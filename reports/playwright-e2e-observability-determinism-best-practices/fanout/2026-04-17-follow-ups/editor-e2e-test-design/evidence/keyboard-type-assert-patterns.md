---
name: Keyboard-type + state-assert patterns
description: How mature editor Playwright suites structure "type then assert" sequences — typing APIs (type/fill/pressSequentially), delay conventions, assertion targets, shared type-and-assert helpers.
type: evidence
---

# Evidence: Keyboard-type + state-assert patterns

**Dimension:** Keyboard-type + state-assert patterns (P0 Deep)
**Date:** 2026-04-17
**Sources:** BlockNote (`~/.claude/oss-repos/blocknote`), Milkdown (`~/.claude/oss-repos/milkdown`), Lexical (`github.com/facebook/lexical`), Tiptap Cypress (`~/.claude/oss-repos/tiptap`)

---

## Key files / pages referenced

- `blocknote/tests/src/utils/const.ts` — `TYPE_DELAY = 10` constant, `data-test` selector conventions
- `blocknote/tests/src/utils/editor.ts` — `focusOnEditor`, `waitForTextInEditor`, `compareDocToSnapshot`, `getDoc` via `window.ProseMirror.getJSON()`
- `blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts` — type-and-assert pattern
- `blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts` — keyboard + snapshot pattern
- `milkdown/e2e/tests/misc/index.ts` — `focusEditor`, `getMarkdown`, `waitNextFrame`
- `milkdown/e2e/tests/input/heading.spec.ts` — `type` + `toHaveText` + `getMarkdown` assertion triple
- `milkdown/e2e/tests/shortcut/bold.spec.ts` — type → press-meta-key → up → assert
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs` — `assertHTML`, `focusEditor`, `exposeLexicalEditor`
- `lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs` — imports from utils, uses `page.keyboard.type` + `assertHTML`

---

## Findings

### Finding: Projects use `page.keyboard.type(str)` for multi-char typing, not `locator.fill()` or `locator.pressSequentially()`
**Confidence:** CONFIRMED
**Evidence:** Every surveyed editor spec uses `page.keyboard.type(...)` after an initial `focusEditor(page)`. None use `locator.fill()` (which would replace input values) and none use `pressSequentially()`.

```ts
// blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:39-44
await focusOnEditor(page);
await executeSlashCommand(page, "h1");
await page.keyboard.type("This is a H1");
await waitForSelectorInEditor(page, H_ONE_BLOCK_SELECTOR);
```

```ts
// milkdown/e2e/tests/input/heading.spec.ts:10-16
const editor = page.locator('.editor')
await focusEditor(page)
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
```

```ts
// lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs (WebFetch verified)
await focusEditor(page);
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
```

**Implications:** Editor tests target contenteditable surfaces, where `fill()` semantics (replace-value) don't apply. `keyboard.type()` dispatches `keydown`/`keypress`/`input` events the editor processes via ProseMirror/Lexical view, matching production keystrokes.

### Finding: Per-key `{ delay }` option used rarely, typically for race-sensitive keys (Enter, Tab, Arrow), not char streams
**Confidence:** CONFIRMED
**Evidence:** BlockNote defines `TYPE_DELAY = 10` and passes it only on `keyboard.press("Enter", { delay: TYPE_DELAY })`, `keyboard.press("Tab", { delay: TYPE_DELAY })`, `keyboard.press("ArrowUp", { delay: TYPE_DELAY })` — never on `keyboard.type()`.

```ts
// blocknote/tests/src/utils/const.ts:79
export const TYPE_DELAY = 10;
```

```ts
// blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:103-107
await page.keyboard.press("Enter", { delay: TYPE_DELAY });
await page.keyboard.press("Tab", { delay: TYPE_DELAY });
await page.keyboard.type("B");
await page.keyboard.press("ArrowUp", { delay: TYPE_DELAY });
```

Milkdown uses `{ delay: 30 }` on a multi-char `type()` call only in one debounce-specific test:

```ts
// milkdown/e2e/tests/plugin/listener.spec.ts:57
await page.keyboard.type('abcdefghij', { delay: 30 })
```

**Implications:** The default `keyboard.type()` speed (no delay) is fast enough that editors don't drop keystrokes. The `{ delay }` option is specifically used when a handler's reaction time is load-bearing (input rules firing, debounce under rapid input). Otherwise omitted.

### Finding: Three dominant assertion targets after typing — DOM text/structure, HTML snapshot, markdown round-trip
**Confidence:** CONFIRMED
**Evidence:** Every project uses at least two of these three; the third is optional.

1. **DOM text/structure (auto-retrying):** Milkdown + BlockNote use `expect(locator).toHaveText(...)` (Playwright auto-waits):

```ts
// milkdown/e2e/tests/input/heading.spec.ts:11-14
await page.keyboard.type('# Heading1')
await expect(editor.locator('h1')).toHaveText('Heading1')
await expect(editor.locator('h1')).toHaveAttribute('id', 'heading1')
```

2. **HTML snapshot assertion:** Lexical's `assertHTML(page, html\`...\`)` tagged-template compares the editor subtree's serialized HTML against an inline string (line 605-634 of `utils/index.mjs`):

```ts
// lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs (WebFetch verified)
await assertHTML(page, html`<h1 class="PlaygroundEditorTheme__h1" dir="auto">
  <span data-lexical-text="true">My Heading</span>
</h1>`);
```

3. **Editor-state JSON snapshot:** BlockNote uses `compareDocToSnapshot(page, name)` which calls `window.ProseMirror.getJSON()` and snapshots it as a `.json` file via `expect(doc).toMatchSnapshot()`:

```ts
// blocknote/tests/src/utils/editor.ts:25-48
export async function getDoc(page: Page) {
  const window = await page.evaluateHandle("window");
  const doc = await window.evaluate((win) =>
    (win as any).ProseMirror.getJSON(),
  );
  return doc;
}

export async function compareDocToSnapshot(page: Page, name: string) {
  const doc = JSON.stringify(await getDoc(page), null, 2);
  expect(doc).toMatchSnapshot(`${name}.json`);
}
```

4. **Round-trip markdown:** Milkdown uses `getMarkdown(page)` returning the editor's serialized markdown via `window.__getMarkdown__()`:

```ts
// milkdown/e2e/tests/misc/index.ts:11-15
export async function getMarkdown(page: Page) {
  return await page.evaluate(() => {
    return window.__getMarkdown__()
  })
}
```

Then asserts string equality:

```ts
// milkdown/e2e/tests/shortcut/bold.spec.ts:41-42
const markdown = await getMarkdown(page)
expect(markdown).toBe('The lunatic **on the**  grass\n')
```

**Implications:** The choice depends on what the test is protecting. DOM text = cheap, auto-retrying, insensitive to attribute changes. HTML snapshot = catches visual regressions + theme class drift. JSON snapshot = catches ProseMirror schema regressions. Markdown round-trip = exercises the full parse→render→serialize pipeline end-to-end.

### Finding: Editor-state exposure via `window.__<helper>__` or `window.<lib>.getJSON()` is universal
**Confidence:** CONFIRMED
**Evidence:** Every surveyed project exposes a test-only API on `window`.

- BlockNote: `window.ProseMirror.getJSON()` (blocknote/tests/src/utils/editor.ts:25-30)
- Milkdown: `window.__getMarkdown__()`, `window.__setMarkdown__(md)` (milkdown/e2e/tests/misc/index.ts:11-21)
- Milkdown multi-editor: `window.commands.addTable?.()`, `window.commands.addTable2?.()` (milkdown/e2e/tests/multiple/command.spec.ts:10-13)
- Lexical: `window.lexicalEditor = document.querySelector('[data-lexical-editor="true"]').__lexicalEditor` via `exposeLexicalEditor(page)` (lexical/packages/lexical-playground/__tests__/utils/index.mjs, WebFetch verified)

**Implications:** Editor tests cannot rely on DOM alone — internal state (selection paths, Y.Doc, ProseMirror state) is not directly serializable from DOM. Window-level exposure is the idiomatic way to bridge test → editor internals. This is how editor-specific helpers (`getMarkdown`, `getDoc`, `assertSelection`) access the real state.

### Finding: No project uses a "typeAndWaitForEditorState(text, expectedHtml)" combined helper
**Confidence:** CONFIRMED
**Evidence:** Searched BlockNote and Milkdown helper files for any function that takes both a typing string and an expected post-state. Only one sequence pattern exists: `type()` is always followed by a separate assertion line.

BlockNote helpers take either an action (`openSlashMenu`, `executeSlashCommand(page, command)`) OR an assertion (`waitForSelectorInEditor`, `compareDocToSnapshot`) — never both. Same in Milkdown (`focusEditor`, `getMarkdown`, `setMarkdown` are separate).

**Implications:** The community convention is separation of concerns: one helper to perform an input action, another to assert. Combined `typeAndAssert(text, expected)` would conflate the two and make failures ambiguous (did typing fail, or did assertion fail?). A useful pattern for Open Knowledge: keep `type` + `assert` as distinct steps, but compose them in test-case bodies.

---

## Negative searches

- Searched BlockNote + Milkdown for `pressSequentially` → zero results across both repos
- Searched for `locator.fill(` in editor tests → zero results
- Searched for combined "type-and-assert" helpers → none found; universal pattern is discrete action+assertion

---

## Gaps / follow-ups

- Lexical `assertHTML` normalization logic (how it strips classes/styles conditionally) was partially captured via WebFetch — line ranges confirmed (605-634) but the exact diff algorithm was not read byte-for-byte.
- Outline repo has no E2E tests (only `*.test.ts` unit files — verified via `find ~/.claude/oss-repos/outline -name "*.e2e.ts"` returning empty). AFFiNE and Slate not locally cloned; GitHub fetch omitted to stay within P0 scope.
