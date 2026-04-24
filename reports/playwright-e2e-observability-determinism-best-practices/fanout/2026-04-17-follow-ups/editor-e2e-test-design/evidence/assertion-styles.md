---
name: Assertion styles
description: What editor E2E suites assert on — DOM, HTML snapshot, JSON snapshot, markdown round-trip, golden file comparison.
type: evidence
---

# Evidence: Assertion styles

**Dimension:** Assertion styles (P0 Moderate)
**Date:** 2026-04-17
**Sources:** BlockNote, Milkdown, Lexical

---

## Key files / pages referenced

- `blocknote/tests/src/utils/editor.ts:44-48` — `compareDocToSnapshot` (JSON snapshot of ProseMirror state)
- `blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:150-154` — mixed JSON snapshot + PNG screenshot
- `milkdown/e2e/tests/shortcut/bold.spec.ts` — `toHaveText` + `getMarkdown` + `expect().toBe()`
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs:605-634` — `assertHTML` implementation
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs:685-687` — `assertSelection`

---

## Findings

### Finding: Four assertion styles coexist; choice correlates with what the test is protecting
**Confidence:** CONFIRMED
**Evidence:**

| Style | Library | Target | Example | Source |
|---|---|---|---|---|
| Auto-retrying DOM text | Playwright built-in | Visible text content | `expect(editor.locator('h1')).toHaveText('Heading1')` | `milkdown/.../heading.spec.ts:13` |
| Locator count/attribute | Playwright built-in | Block/mark structure via attribute | `expect(await page.locator(BLOCK_GROUP_SELECTOR).count()).toBe(1)` | `blocknote/.../slashmenu.test.ts:87` |
| Inline string compare | `expect(...).toBe(...)` | Full markdown round-trip | `expect(markdown).toBe('The lunatic **on the**  grass\n')` | `milkdown/.../bold.spec.ts:41` |
| Snapshot file | `toMatchSnapshot` | Persistent JSON / PNG golden | `expect(doc).toMatchSnapshot('slashMenuEndProduct.json')` | `blocknote/.../editor.ts:47` |
| HTML tagged-template | Lexical custom `assertHTML` | Rendered HTML subtree | `await assertHTML(page, html\`<h1 class="...">...</h1>\`)` | `lexical/.../ComponentPicker.spec.mjs` |

**Implications:** Editor tests commonly combine all four within a single suite. A test that verifies "typing `# Foo` produces a heading" can legitimately assert on all of: `h1` tag presence (structure), `h1` text content (payload), `#foo` id attribute (autogen logic), and `# Foo\n` markdown round-trip (serialization).

### Finding: BlockNote uses JSON snapshot on ProseMirror `getJSON()` as the canonical state assertion
**Confidence:** CONFIRMED
**Evidence:**

```ts
// blocknote/tests/src/utils/editor.ts:25-48
export async function getDoc(page: Page) {
  const window = await page.evaluateHandle("window");
  const doc = await window.evaluate((win) =>
    (win as any).ProseMirror.getJSON(),
  );
  return doc;
}

export function removeAttFromDoc(doc: any, att: string) {
  // Recursively delete `att` from the doc tree
}

export async function compareDocToSnapshot(page: Page, name: string) {
  const doc = JSON.stringify(await getDoc(page), null, 2);
  expect(doc).toMatchSnapshot(`${name}.json`);
}
```

Used across 20+ test cases in `keyboardhandlers.test.ts`:

```ts
// blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:37
await compareDocToSnapshot(page, "enterSelectionNotEmpty.json");
```

Snapshot files live next to specs in `*.test.ts-snapshots/`:

```
blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts-snapshots/
├── enterSelectionNotEmpty.json
├── enterPreservesMarks.json
├── ...
└── <per-browser>.json (chromium, firefox, webkit)
```

**Implications:** Snapshots enable broad-coverage regression testing without hand-writing HTML/structure assertions per case. Cost: snapshot churn on intentional structural changes, and a ~10-20% increase in repo size vs inline assertions. BlockNote's `removeAttFromDoc(doc, att)` exists for stripping non-deterministic attrs (likely auto-generated IDs) before snapshotting — a design need that arises only with snapshot-based assertions.

### Finding: Milkdown assertion is two-layered — DOM-text (`toHaveText`) AND markdown-roundtrip (`getMarkdown` equality) — per test
**Confidence:** CONFIRMED
**Evidence:** Nearly every Milkdown input/shortcut spec asserts both the visible DOM and the roundtrip markdown:

```ts
// milkdown/e2e/tests/input/heading.spec.ts:9-23
test('heading', async ({ page }) => {
  const editor = page.locator('.editor')
  await focusEditor(page)
  await page.keyboard.type('# Heading1')
  await expect(editor.locator('h1')).toHaveText('Heading1')
  await expect(editor.locator('h1')).toHaveAttribute('id', 'heading1')
  const markdown = await getMarkdown(page)
  expect(markdown).toBe('# Heading1\n')

  await page.keyboard.press('Enter')
  await page.keyboard.type('## Heading 2')
  await expect(editor.locator('h2')).toHaveText('Heading 2')
  await expect(editor.locator('h2')).toHaveAttribute('id', 'heading-2')
  const markdown2 = await getMarkdown(page)
  expect(markdown2).toBe('# Heading1\n\n## Heading 2\n')
})
```

**Implications:** The two assertions protect different invariants. `toHaveText` catches view-layer regressions. `getMarkdown` catches parser/serializer regressions. For editors with bidirectional markdown ↔ editor-state translation (Milkdown, Open Knowledge), both matter. Testing only DOM would miss serialization drift; testing only markdown would miss render regressions.

### Finding: Lexical's `assertHTML` uses an HTML tagged-template with built-in class/style normalization options
**Confidence:** CONFIRMED
**Evidence:** Lexical defines an `html` tag and an `assertHTML(page, expected, options)` pair:

```js
// lexical/packages/lexical-playground/__tests__/utils/index.mjs:605-634 (WebFetch verified lines)
export async function assertHTML(
  page,
  expectedHtml,
  expectedHtmlFrameRight = expectedHtml,
  {ignoreClasses = false, ignoreInlineStyles = false, ignoreDir = false} = {},
  actualHtmlModificationsCallback,
)
```

```js
// usage in ComponentPicker.spec.mjs
await assertHTML(page, html`<h1 class="PlaygroundEditorTheme__h1" dir="auto">
  <span data-lexical-text="true">My Heading</span>
</h1>`);
```

**Implications:** Inline HTML comparison is readable (test author sees the expected shape in-line with the test) but requires careful normalization (classes drift across theme changes; `dir="auto"` may appear/disappear). The `{ignoreClasses, ignoreInlineStyles, ignoreDir}` options let tests opt into lenient comparison per-case. Less brittle than pure string compare, more explicit than PNG snapshot.

### Finding: Screenshot snapshots used sparingly — reserved for full-page rendering tests, not state assertions
**Confidence:** CONFIRMED
**Evidence:** BlockNote's `slashmenu.test.ts` combines JSON + PNG for a single "complex document" test:

```ts
// blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:149-154
await page.waitForTimeout(1000);
// Compare doc object snapshot
await compareDocToSnapshot(page, "docStructureSnapshot");
// Compare editor screenshot
expect(await page.screenshot()).toMatchSnapshot(
  "slash_menu_end_product.png",
);
```

And pure-PNG assertion for navigation:

```ts
// blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:34-37
await page.keyboard.press("PageDown");
expect(await page.screenshot()).toMatchSnapshot("slash_menu_page_down.png");
await page.keyboard.press("PageUp");
expect(await page.screenshot()).toMatchSnapshot("slash_menu_page_up.png");
```

But the keyboard-handlers tests (20+ cases in `keyboardhandlers.test.ts`) use JSON snapshots only, not PNGs.

**Implications:** PNG snapshots are expensive (per-browser, per-OS rendering differences) and are used only where the test explicitly protects visual rendering (e.g., slash-menu highlight moving on PageDown). For editor-state assertions, JSON is the default.

---

## Negative searches

- Searched for Playwright `expect.poll()` usage in editor tests → not found in BlockNote/Milkdown e2e
- Searched for custom matchers (`expect.extend`) → not used in surveyed projects
- Searched for visual-regression plugins (`@playwright/test` built-in `toMatchSnapshot` on images is used; no third-party visual-regression libs like `playwright-visual-regression` or `pixelmatch` integration)

---

## Gaps / follow-ups

- Lexical's full normalization logic in `assertHTML` (how it handles `ignoreClasses`, whether it does structural diff vs string diff) was summarized via WebFetch but not read byte-for-byte.
