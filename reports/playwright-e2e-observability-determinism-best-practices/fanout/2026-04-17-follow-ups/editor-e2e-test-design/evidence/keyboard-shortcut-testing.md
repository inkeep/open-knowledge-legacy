---
name: Keyboard shortcut testing
description: How projects test Cmd/Ctrl modifier keys for bold, italic, select-all, and similar shortcuts across Mac and Windows/Linux.
type: evidence
---

# Evidence: Keyboard shortcut testing (Cmd-vs-Ctrl)

**Dimension:** Keyboard shortcut testing (P0 Moderate)
**Date:** 2026-04-17
**Sources:** BlockNote, Milkdown, Lexical

---

## Key files / pages referenced

- `milkdown/e2e/tests/misc/index.ts:27-38` — `pressMetaKey` + `selectAll`
- `blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:338-378` — heading shortcuts, list shortcuts
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs` — `isMac`, `keyDownCtrlOrMeta`, `keyUpCtrlOrMeta`
- `lexical/packages/lexical-playground/__tests__/keyboardShortcuts/index.mjs` — ~50 named shortcut functions

---

## Findings

### Finding: Three distinct strategies for cross-platform modifier handling
**Confidence:** CONFIRMED
**Evidence:**

**Strategy 1 — Playwright's built-in `ControlOrMeta` token (BlockNote):** Playwright interprets `ControlOrMeta` as `Meta` on Mac, `Control` on Win/Linux:

```ts
// blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:340-343
test("Check heading 1 shortcut", async ({ page }) => {
  await focusOnEditor(page);
  await page.keyboard.type("Paragraph");
  await page.keyboard.press("ControlOrMeta+Alt+1");
});
```

```ts
// blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:27
await page.keyboard.press("ControlOrMeta+ArrowLeft");
```

**Strategy 2 — Runtime platform detection returning a release callback (Milkdown):**

```ts
// milkdown/e2e/tests/misc/index.ts:27-38
export async function pressMetaKey(page: Page) {
  const isMac = process.platform === 'darwin'
  const key = isMac ? 'Meta' : 'Control'
  await page.keyboard.down(key)
  return () => page.keyboard.up(key)
}

export async function selectAll(page: Page) {
  const up = await pressMetaKey(page)
  await page.keyboard.press('KeyA')
  await up()
}
```

Usage in tests:

```ts
// milkdown/e2e/tests/shortcut/bold.spec.ts:14-16
let up = await pressMetaKey(page)
await page.keyboard.press('b')
await up()
```

**Strategy 3 — Browser-side detection via `navigator.platform` (Lexical):**

```js
// lexical/packages/lexical-playground/__tests__/utils/index.mjs:709-714 (WebFetch verified)
export async function isMac(page) {
  return page.evaluate(
    () =>
      typeof window !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(window.navigator.platform),
  );
}
```

Used to branch inside shortcut helpers:

```js
// lexical/packages/lexical-playground/__tests__/keyboardShortcuts/index.mjs (WebFetch verified)
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

**Implications:** `ControlOrMeta` (Strategy 1) is the newest and simplest — Playwright ships it, no helper needed for `press()`. Strategies 2 and 3 are older patterns that existed before `ControlOrMeta` was added (Playwright 1.38, 2023). For new code, Strategy 1 is the minimal-ceremony choice. Strategies 2 and 3 remain necessary when the test needs to branch logic (Mac uses Meta+Arrow for line-begin, Win uses Home — same intent, different keys).

### Finding: Named per-shortcut helpers (`toggleBold`, `pressBold`) are the Lexical convention; inline `keyboard.press` is the BlockNote convention
**Confidence:** CONFIRMED
**Evidence:** BlockNote uses inline `keyboard.press("ControlOrMeta+Alt+1")` for heading shortcuts and inline `.click()` on formatting buttons (e.g. `ITALIC_BUTTON_SELECTOR`):

```ts
// blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:48-49
await page.mouse.click(x + 35, y + height / 2, { clickCount: 2 });
await page.locator(ITALIC_BUTTON_SELECTOR).click();
```

Lexical's `keyboardShortcuts/index.mjs` exports a full vocabulary:

```js
// lexical/packages/lexical-playground/__tests__/keyboardShortcuts/index.mjs (WebFetch synthesis)
moveToLineBeginning, moveToEditorEnd, moveToPrevWord
selectAll, selectCharacters, selectPrevWord
deleteNextWord, deleteLineBackward, pressBackspace
toggleBold, toggleUnderline, toggleItalic, toggleStrikethrough
leftAlign, centerAlign, rightAlign, justifyAlign
indent, outdent, applyHeading, toggleBulletList
```

**Implications:** At ~50-spec scale, named helpers (`toggleBold(page)`) beat inline `keyboard.press` because they encapsulate cross-platform branching once. At ~20-spec scale, inline presses remain readable. The parent spec should default to inline `ControlOrMeta+X` presses and extract helpers only where cross-platform intent diverges (line-begin, word-delete).

### Finding: Modifier-key "down + up" with an explicit release call is common when multiple presses occur under the modifier
**Confidence:** CONFIRMED
**Evidence:** Milkdown's `pressMetaKey` pattern returns the `up` callback so the test holds the modifier for multiple presses:

```ts
// milkdown/e2e/tests/shortcut/bold.spec.ts:30-37
let up = await pressMetaKey(page)
await page.keyboard.press('b')
await up()
await page.keyboard.type('on the ')
up = await pressMetaKey(page)
await page.keyboard.press('b')
await up()
```

Same pattern in BlockNote for Shift-held selections:

```ts
// blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:29-33
await page.keyboard.down("Shift");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ControlOrMeta+ArrowRight");
await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Shift");
```

**Implications:** For single-key combos (Cmd+B), `keyboard.press("ControlOrMeta+B")` is sufficient. For multi-step selections or chord sequences under a held modifier, `down(...)` + individual presses + `up(...)` is the explicit pattern.

---

## Negative searches

- Searched for cross-platform AltGraph / Option handling → not a test concern in these repos (production code handles it via extension key-bindings config)
- Searched for Windows-specific "Windows key" testing → none found

---

## Gaps / follow-ups

- Playwright's exact version at which `ControlOrMeta` became available (release notes suggest 1.38, 2023) was not verified against each project's Playwright pin.
- Lexical's `IS_MAC` constant is set at module-load via `process.platform` (Node-side) in some places and via browser `navigator.platform` (`isMac(page)`) in others — the two can disagree when running a Mac test runner against a Linux container. Which path Lexical canonically uses was not fully resolved.
