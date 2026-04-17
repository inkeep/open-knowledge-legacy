---
name: Slash-menu / suggestion-extension test patterns
description: How projects with slash-commands or @-mentions open the suggestion menu, filter results, assert on the filtered list, select via Enter/click, and what signal they wait for between each step.
type: evidence
---

# Evidence: Slash-menu / suggestion-extension test patterns

**Dimension:** Slash-menu / suggestion-extension test patterns (P0 Deep)
**Date:** 2026-04-17
**Sources:** BlockNote, Lexical, Milkdown

---

## Key files / pages referenced

- `blocknote/tests/src/utils/slashmenu.ts` — `openSlashMenu`, `executeSlashCommand`
- `blocknote/tests/src/utils/const.ts:65-66` — `SLASH_MENU_SELECTOR = .bn-suggestion-menu`, `EMOJI_PICKER_SELECTOR = .bn-grid-suggestion-menu`
- `blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts` — all slash-menu tests
- `blocknote/tests/src/end-to-end/slashmenu/slashmenu-customblock.test.ts` — custom block via slash
- `lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs` — slash → typeahead-popover → click
- `lexical/packages/lexical-playground/__tests__/e2e/Mentions.spec.mjs` — @-mention typeahead via keyboard

---

## Findings

### Finding: Two-tier wait: (1) event-based wait for menu to appear (`waitForSelector`), (2) fixed timeout before interaction
**Confidence:** CONFIRMED
**Evidence:** BlockNote's composed helper shows both patterns in a single 10-line function:

```ts
// blocknote/tests/src/utils/slashmenu.ts:4-15
export async function openSlashMenu(page: Page) {
  await page.keyboard.press("/");
  await page.waitForSelector(SLASH_MENU_SELECTOR);
}

export async function executeSlashCommand(page: Page, command: string) {
  await openSlashMenu(page);
  await page.waitForTimeout(100);           // <-- fixed wait between open + type
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);           // <-- fixed wait after select
}
```

Lexical uses the same two-step structure, but the second wait is implicit in the `assertHTML` auto-retry:

```ts
// lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs (WebFetch verified)
await page.keyboard.type('/');
await waitForSelector(page, '.typeahead-popover');
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
await page.keyboard.type('My Heading');
await assertHTML(page, html`<h1 ...>...</h1>`);
```

**Implications:** The `waitForSelector(menu)` is event-based and deterministic. The `waitForTimeout(100)` between open and filter-typing is insurance against focus/keyboard handlers re-wiring when the menu appears (a React re-render cycle). `waitForTimeout(500)` after Enter is insurance against the command executing asynchronously (e.g., creating a new block inserts into ProseMirror state then re-renders).

### Finding: Filter by typing additional characters, then assert by selector presence (not by enumerating list items)
**Confidence:** CONFIRMED
**Evidence:** None of the surveyed tests enumerate the filtered list — they type to narrow and then either press Enter (if the selection is "first match") or click a specific item by its selector.

BlockNote filters via `page.keyboard.type(command)`:

```ts
// blocknote/tests/src/utils/slashmenu.ts:9-14
export async function executeSlashCommand(page: Page, command: string) {
  await openSlashMenu(page);
  await page.waitForTimeout(100);
  await page.keyboard.type(command);    // filter
  await page.keyboard.press("Enter");   // select first match
  await page.waitForTimeout(500);
}
```

Lexical filters by typing + clicks a specific icon selector, not by asserting the list:

```ts
// lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs (WebFetch verified)
await page.keyboard.type('heading');
await click(page, '.typeahead-popover .icon.h1');
```

**Implications:** The convention is "trust the filter, click the target" — the test assertion is on the post-select state (resulting block rendered), not on the filtered list itself. This keeps tests robust against re-ordering of menu items.

### Finding: Keyboard-only selection uses Enter; mouse selection uses a project-specific test-id or icon selector
**Confidence:** CONFIRMED
**Evidence:** BlockNote's `executeSlashCommand` uses Enter (line 13), and BlockNote's test constants expose `data-test="..."` attributes for named buttons:

```ts
// blocknote/tests/src/utils/const.ts:68-77
export const ITALIC_BUTTON_SELECTOR = `[data-test="italic"]`;
export const LINK_BUTTON_SELECTOR = `[data-test="createLink"]`;
export const DRAG_HANDLE_SELECTOR = `[data-test="dragHandle"]`;
```

Lexical uses semantic class selectors on icons (`.icon.h1`, `.icon.table`):

```ts
// lexical/packages/lexical-playground/__tests__/e2e/ComponentPicker.spec.mjs (WebFetch verified)
await click(page, '.typeahead-popover .icon.h1');
```

**Implications:** Projects with a stable internal design system (BlockNote with its `data-test` attributes) prefer test-ID-based selectors; projects without explicit test IDs use visual/semantic class selectors. Neither uses text-based selectors for command items (`getByText("Heading 1")`) — brittle against i18n/localization.

### Finding: Mentions typeahead uses the same keyboard-flow template as slash-commands, with different trigger char
**Confidence:** CONFIRMED
**Evidence:** Lexical's `Mentions.spec.mjs` (WebFetch verified opening imports + first test):

```ts
// lexical/packages/lexical-playground/__tests__/e2e/Mentions.spec.mjs
import { deleteNextWord, moveLeft, moveRight, moveToEditorBeginning, selectAll }
  from '../keyboardShortcuts/index.mjs';
import { assertHTML, assertSelection, expect, focusEditor, html, initialize,
  IS_WINDOWS, pasteFromClipboard, test, waitForSelector } from '../utils/index.mjs';

test.describe('Mentions', () => {
  test.beforeEach(({isCollab, page}) => initialize({isCollab, page}));

  test(`Can enter the Luke Skywalker mention`, async ({page}) => {
    // Flow per WebFetch: type '@Luke' → wait for menu match 'Luke Skywalker' →
    // press Enter → assert mention span with styled class
  });
});
```

**Implications:** The slash-menu and mention-menu test patterns are isomorphic. A single `openSuggestionMenu(page, triggerChar)` + `filterAndSelect(page, filterText)` pair could serve both.

### Finding: Two separate selector constants for "normal" vs "grid" suggestion menus (block suggestions vs emoji picker)
**Confidence:** CONFIRMED
**Evidence:** BlockNote defines two distinct selectors:

```ts
// blocknote/tests/src/utils/const.ts:65-66
export const SLASH_MENU_SELECTOR = `.bn-suggestion-menu`;
export const EMOJI_PICKER_SELECTOR = `.bn-grid-suggestion-menu`;
```

Separate helper files (`slashmenu.ts`, `emojipicker.ts`) wrap each.

**Implications:** When an editor has multiple suggestion-style popovers (slash, emoji, mentions, link-target), they warrant parallel helpers rather than a single polymorphic helper. Selector drift between surfaces is a real failure mode.

---

## Negative searches

- Searched BlockNote + Milkdown for any assertion on filtered-menu contents (e.g., `expect(menuItems).toHaveCount(N)`, `toContainText`) → not found in slash-menu test files
- Searched for explicit "debounce" waits tied to the suggestion filter timing → none; all waits are either `waitForSelector` or constant `waitForTimeout(100)`/`(500)`

---

## Gaps / follow-ups

- Milkdown does not ship a slash-command plugin in the surveyed e2e harness (the `command/chain.spec.ts` exercises Milkdown's `CommandManager`, not a user-facing slash menu). Its patterns apply to imperative command invocation, not typeahead UX.
- Lexical's exact `click` helper implementation (does it scroll-into-view? force-click? wait for stable?) was not extracted byte-for-byte from `utils/index.mjs`.
