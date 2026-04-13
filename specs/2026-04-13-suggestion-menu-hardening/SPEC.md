# SPEC: Suggestion Menu Hardening — Shared Positioning, Command Safety, Accessibility

**Status:** Final
**Created:** 2026-04-13
**Baseline commit:** 47e858b (origin/main — includes PR #78 wiki-link suggestion migration)
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/app/src/editor/extensions/`, `packages/app/src/editor/slash-command/`
**Nature:** Cross-cutting hardening of both suggestion menus (slash command + wiki-link). Extracts shared Floating UI positioning, improves error safety in slash-command's command handler, adds screen reader accessibility and focus-steal prevention to SlashCommandMenu. No user-visible behavior change except improved a11y.
**Target PR:** Direct to main. Small-medium size — 5 focused changes.

**Pace:** Fast. Single-phase cleanup informed by findings from PR #78.

---

## 1. Problem Statement (SCR)

**Situation:** The editor now has two `@tiptap/suggestion` menus — slash commands (`/`) and wiki-links (`[[`) — both using identical Floating UI positioning code (~30 lines each). PR #78 migrated wiki-link to `@tiptap/suggestion` and in the process discovered three issues in the slash-command extension, plus confirmed that the Floating UI positioning code is a 1:1 duplicate.

**Complication:** Four concrete issues surfaced during PR #78's review and assessment passes:

1. **Command error safety (slash-command only):** `slash-command.ts:108-110` runs `editor.chain().focus().deleteRange(range).run()` before `try { item.command(editor) }`, but the try/catch only wraps `item.command` — if `deleteRange` itself throws (e.g., stale range from a race), the error is uncaught and crashes the editor. Wrapping both calls in a single try/catch ensures pluggable commands (increasingly important as PR #12/#23 add component insertion) can't crash the editor. Note: trigger text consumption on item select is intentional — the user chose an item, so the `/` trigger is always removed regardless of whether the command succeeds.

2. **Redundant `doPosition()` (slash-command only):** `slash-command.ts:197` calls `doPosition()` immediately after `autoUpdate(virtualEl, popup, doPosition)`. `autoUpdate` calls the callback synchronously on setup ([Floating UI docs](https://floating-ui.com/docs/autoupdate)), making the explicit call redundant — a double-position cycle on every menu open. Wiki-link already fixed this in PR #78 (local review finding).

3. **No aria-live region (SlashCommandMenu only):** Wiki-link's `WikiLinkSuggestionMenu` now has `aria-live="polite"` announcing the selected item on arrow navigation. `SlashCommandMenu` has `role="listbox"` + `role="option"` + `aria-selected` but no live region — screen readers can't announce the selected item because focus stays in ProseMirror's contenteditable (making `aria-selected` inert). Same issue that was fixed for wiki-link in PR #78.

4. **Floating UI positioning duplication:** Both menus have ~30 identical lines: `virtualEl` pattern, `computePosition` with `offset(4)` + `flip()` + `size` middleware setting `--suggestion-menu-max-height`, `autoUpdate` setup, and style application. PR #78's review flagged this as "extract when 3rd consumer arrives" (rule-of-three). With the user's direction that this will be needed, extract now — eliminates the coordination problem demonstrated by issue #2 (fix applied to one file, missed in the other).

**Resolution:** Four changes in one PR — extract shared positioning utility, fix command safety, remove redundant positioning call, add aria-live to SlashCommandMenu.

---

## 2. Success Criteria

### Primary: Fix the slash-command issues + a11y parity
- Slash-command `command()` wraps both `deleteRange` and `item.command` in a single try/catch so errors from pluggable commands don't crash the editor
- Redundant `doPosition()` removed from slash-command's `onStart`
- `SlashCommandMenu` announces selected item via `aria-live="polite"` region with full a11y parity: `useId()`, per-item `id`, `aria-activedescendant`, `tabIndex={-1}` (matching wiki-link pattern)
- `SlashCommandMenu` container div prevents focus-steal on padding clicks (`onMouseDown` → `preventDefault`)

### Secondary: Extract shared Floating UI positioning
- New shared module `suggestion-floating-ui.ts` used by both `slash-command.ts` and `wiki-link-suggestion.ts`
- Both menus' positioning behavior is identical before and after extraction
- The shared module is the single source of truth for: virtualEl pattern, computePosition middleware config, doPosition function, autoUpdate setup

---

## 3. What to Build

### 3.1 Extract shared Floating UI positioning utility

**New file:** `packages/app/src/editor/extensions/suggestion-floating-ui.ts`

```ts
import { autoUpdate, computePosition, flip, offset, size } from '@floating-ui/dom';
import type { SuggestionProps } from '@tiptap/suggestion';

export interface SuggestionPositionState {
  popup: HTMLDivElement | null;
  stopAutoUpdate: (() => void) | null;
}

/**
 * Create a positioned suggestion popup element and its positioning helpers.
 * Shared by slash-command and wiki-link suggestion menus.
 *
 * Returns: { popup, doPosition, startAutoUpdate }
 * - popup: the positioned container element (fixed, z-50, appended to body)
 * - doPosition: trigger repositioning (call from onUpdate)
 * - startAutoUpdate: call AFTER appending renderer content to preserve
 *   content-before-autoUpdate ordering (autoUpdate fires doPosition
 *   synchronously on setup — must run after popup has content so size
 *   middleware computes correct max-height)
 *
 * Uses `popup.isConnected` guards in async callbacks because computePosition
 * is async (returns Promise). The `.then()` can resolve after cleanup has
 * called `popup.remove()` — at that point the reference is non-null but
 * disconnected. A null-check alone would miss this race.
 */
export function createSuggestionPopup(
  getCurrentProps: () => SuggestionProps<unknown> | null,
  label: string,
): { popup: HTMLDivElement; doPosition: () => void; startAutoUpdate: () => () => void } {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.zIndex = '50';
  document.body.appendChild(popup);

  const virtualEl = {
    getBoundingClientRect: () => getCurrentProps()?.clientRect?.() ?? new DOMRect(),
    get contextElement() {
      return getCurrentProps()?.editor.view.dom;
    },
  };

  const doPosition = () => {
    if (!popup.isConnected) return;
    computePosition(virtualEl, popup, {
      placement: 'bottom-start',
      middleware: [
        offset(4),
        flip(),
        size({
          apply({ availableHeight }) {
            if (popup.isConnected) {
              popup.style.setProperty(
                '--suggestion-menu-max-height',
                `${Math.min(availableHeight, window.innerHeight * 0.4)}px`,
              );
            }
          },
        }),
      ],
    })
      .then(({ x, y }) => {
        if (popup.isConnected) {
          popup.style.left = `${x}px`;
          popup.style.top = `${y}px`;
        }
      })
      .catch((err) => {
        if (popup.isConnected) {
          console.warn(`[${label}] computePosition failed`, err);
        }
      });
  };

  // Caller invokes startAutoUpdate() AFTER appending renderer content
  const startAutoUpdate = () => autoUpdate(virtualEl, popup, doPosition);

  return { popup, doPosition, startAutoUpdate };
}

/**
 * Clean up a suggestion popup. Order: stop positioning → remove DOM → caller destroys renderer.
 */
export function destroySuggestionPopup(state: SuggestionPositionState): void {
  state.stopAutoUpdate?.();
  state.stopAutoUpdate = null;
  state.popup?.remove();
  state.popup = null;
}
```

**Design notes:**
- `popup.isConnected` guards are **required for correctness** in async callbacks. `computePosition` is async (`@floating-ui/core` line 135: `const computePosition = async (...)`). The `.then()` can resolve after `destroySuggestionPopup` has called `popup.remove()` — the reference is still non-null but the element is disconnected from the DOM. A null-check alone would miss this race and apply styles to a disconnected element.
- `startAutoUpdate` is returned as a function (not called internally) so callers can append renderer content first. `autoUpdate` fires `doPosition` synchronously on setup (verified: `@floating-ui/dom` line 666), so content must be in the popup before `autoUpdate` starts — otherwise the first `computePosition` runs against an empty container and `size` middleware computes incorrect `availableHeight`.
- `destroySuggestionPopup` enforces cleanup ordering (positioning first, DOM second) — callers handle `renderer.destroy()` after
- `label` parameter for per-menu log prefix (`[slash-command]` vs `[wiki-link-suggestion]`)

### 3.2 Fix slash-command `command()` error safety

**Current (slash-command.ts:108-115):**
```ts
command: ({ editor, range, props: item }) => {
  editor.chain().focus().deleteRange(range).run();  // separate chain — dispatches immediately
  try {
    item.command(editor);  // if this throws, trigger text is gone
  } catch (err) {
    console.error(`SlashCommand: command "${item.name}" threw an error`, err);
  }
},
```

**Target:**
```ts
command: ({ editor, range, props: item }) => {
  try {
    editor.chain().focus().deleteRange(range).run();
    item.command(editor);
  } catch (err) {
    // deleteRange dispatches as its own transaction, then item.command runs.
    // If item.command throws, the trigger text is already consumed — this is
    // intentional (user selected an item). The try/catch ensures neither call
    // crashes the editor. Pluggable commands (PR #12/#23) may throw on complex
    // editor operations — this catch prevents unhandled exceptions.
    console.error(`[slash-command] command "${item.name}" threw an error`, err);
  }
},
```

**Note:** Unlike wiki-link (which uses a single chain for deleteRange + insertContent), slash-command can't combine deleteRange with item.command in one chain because `item.command(editor)` is an arbitrary function — it may chain internally or use direct dispatch. The fix wraps both in a single try/catch so errors from `item.command()` don't crash the editor. The trigger text deletion is intentional — the user selected an item, so the `/` trigger should be consumed regardless.

### 3.3 Remove redundant `doPosition()` in slash-command `onStart`

**Current (slash-command.ts:196-197):**
```ts
stopAutoUpdate = autoUpdate(virtualEl, popup, doPosition);
doPosition();  // redundant — autoUpdate calls synchronously on setup
```

**Target:** Handled by extraction — `createSuggestionPopup` calls `autoUpdate` internally and does not expose a separate setup step. The redundant call is eliminated by design.

### 3.4 Add full a11y parity + focus-steal prevention to SlashCommandMenu

Bring `SlashCommandMenu` to full parity with `WikiLinkSuggestionMenu`:

**aria-live region** (SR announcements on arrow navigation):
```tsx
<span className="sr-only" aria-live="polite" aria-atomic="true">
  {selectedItem ? selectedItem.label : ''}
</span>
```

**aria-activedescendant + per-item IDs** (same pattern as wiki-link):
```tsx
const listboxId = useId();
const activeDescendant = selectedIndex >= 0 && selectedIndex < items.length
  ? `${listboxId}-option-${selectedIndex}`
  : undefined;

// On listbox container:
<div role="listbox" aria-activedescendant={activeDescendant} tabIndex={-1} ...>

// On each item button:
<button id={`${listboxId}-option-${idx}`} role="option" aria-selected={isSelected} ...>
```

**Focus-steal prevention on container** (matches wiki-link's `preventFocusSteal`):
```tsx
// On the listbox container div:
onMouseDown={(e) => e.preventDefault()}
```

Without this, clicking container padding (between items, on border area) steals editor focus and dismisses the menu. Individual buttons already call `e.preventDefault()` on their own `onMouseDown`, but the container gap is unprotected. Wiki-link has this on all 3 container divs (items, loading, empty states).

---

## 4. Implementation Order

1. Create `suggestion-floating-ui.ts` with `createSuggestionPopup` and `destroySuggestionPopup` (§3.1)
2. Refactor `slash-command.ts` to use shared positioning + fix command error safety (§3.2, §3.3)
3. Refactor `wiki-link-suggestion.ts` to use shared positioning (§3.1)
4. Add full a11y parity + focus-steal prevention to `SlashCommandMenu.tsx` (§3.4)
5. Verify quality gates: `bun run check`

---

## 5. Tech Stack

### Existing (no new dependencies)
- `@floating-ui/dom` — already a direct dependency
- `@tiptap/suggestion` — already installed

---

## 6. Scope Boundaries

### In Scope
- New file: `packages/app/src/editor/extensions/suggestion-floating-ui.ts`
- Modify: `packages/app/src/editor/extensions/slash-command.ts` (use shared positioning + fix command + remove redundant doPosition)
- Modify: `packages/app/src/editor/extensions/wiki-link-suggestion.ts` (use shared positioning)
- Modify: `packages/app/src/editor/slash-command/SlashCommandMenu.tsx` (add aria-live)

### Out of Scope
- Changes to suggestion menu behavior (filtering, items, keyboard navigation)
- Changes to WikiLinkSuggestionMenu.tsx (already has aria-live from PR #78)
- Changes to any other extension or component
- Adding new tests for positioning (the shared utility is exercised by existing browser QA for both menus)

---

## 7. Test Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| S01 | Type `/` → slash command menu opens with items | Menu positioned below trigger, items visible |
| S02 | Type `[[` → wiki-link menu opens with pages | Menu positioned below trigger, pages visible |
| S03 | Select slash command item → item inserted | Trigger text removed, command executed, no console errors |
| S04 | Slash command with throwing item.command | Trigger text consumed, error logged, editor not crashed |
| S05 | Arrow Down/Up in slash command menu with screen reader | Selected item announced via aria-live |
| S06 | Menu near viewport bottom → flips above | Both menus flip consistently (shared positioning) |
| S07 | Click on SlashCommandMenu container padding (between items) | Editor focus NOT stolen, menu stays open |
| S08 | SlashCommandMenu: ARIA attributes present | `role=listbox`, `aria-activedescendant`, `tabIndex=-1`, per-item `id`, `aria-selected` |
| S09 | All existing wiki-link QA scenarios (R01-R23) | Zero regression |

---

## 8. Decision Log

| # | Decision | Resolution | Status | Confidence |
|---|----------|-----------|--------|------------|
| D1 | Extract now vs wait for 3rd consumer | **Extract now.** User direction + concrete evidence of divergence (doPosition fix applied to wiki-link, missed in slash-command). Two consumers with demonstrated coordination failure warrants extraction. | DIRECTED (user) | HIGH |
| D2 | Shared utility API shape | **Factory function returning { popup, doPosition, stopAutoUpdate }.** Callers own renderer lifecycle; shared module owns positioning lifecycle. `destroySuggestionPopup` for cleanup ordering. | DELEGATED | HIGH |
| D3 | Slash-command command() error safety approach | **Wrap both deleteRange and item.command in single try/catch for error containment.** Cannot combine into single chain because item.command is an arbitrary function. Trigger text consumption on item select is intentional — not a bug to fix. The try/catch prevents uncaught exceptions from crashing the editor when pluggable commands throw. | LOCKED | HIGH |

---

## 9. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | `autoUpdate` calls callback synchronously on setup | **VERIFIED** | [Floating UI docs](https://floating-ui.com/docs/autoupdate) confirm immediate callback; verified by removing redundant call in PR #78 wiki-link with no regression |
| A2 | `item.command(editor)` is an arbitrary function that can't be chained | **VERIFIED** | Source inspection: `SlashCommandItem.command` is typed as `(editor: Editor) => void`, called by external sources (PR #12/#23 component insertion). Cannot be composed into a TipTap chain. |
| A3 | `popup.isConnected` is required in async callbacks to guard against the cleanup race | **VERIFIED** | `computePosition` is async (`@floating-ui/core` line 135). The `.then()` can resolve after `destroySuggestionPopup` calls `popup.remove()`. At that point the popup reference is non-null but disconnected from DOM. A null-check alone would pass and apply styles to a disconnected element. `popup.isConnected` catches this race. |

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Shared utility API doesn't fit a future 3rd suggestion menu | Low | Low | API is minimal (factory + cleanup). A 3rd menu that needs different middleware can extend or bypass. |
| R2 | Slash-command command() fix changes error behavior for existing items | Low | Low | Built-in items (heading, list, etc.) never throw. The try/catch only catches errors that would previously crash the editor. |

## 11. Agent Constraints

**SCOPE:** 4 files modified + 1 new file (see §6)
**EXCLUDE:** All other files
**STOP_IF:** Any existing test regresses after changes
