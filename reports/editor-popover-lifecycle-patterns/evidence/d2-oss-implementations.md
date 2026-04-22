---
title: D2 — OSS Editor Implementation Patterns (Selection ↔ Popover State Coupling)
type: evidence
created: 2026-04-21
sources:
  - ~/.claude/oss-repos/lexical (facebook/lexical)
  - ~/.claude/oss-repos/blocknote (TypeCellOS/BlockNote)
  - ~/.claude/oss-repos/plate (udecode/plate)
  - ~/.claude/oss-repos/blocksuite (toeverything/blocksuite, AFFiNE)
  - ~/.claude/oss-repos/tiptap (ueberdosis/tiptap)
  - https://tiptap.dev/docs/ui-components/components/link-popover
  - https://github.com/ueberdosis/tiptap/discussions/4097
---

## Scope

Five OSS editors inspected: Lexical, BlockNote, Plate.js, BlockSuite (AFFiNE), TipTap. Focus: how is "link popover is open" stored in the editor, and how does it couple to selection state? Chip/mark popovers only; block halos and formatting bubble-menus excluded except where the formatting BubbleMenu is the doc-canonical link editor (TipTap).

## Key files / URLs

- `lexical/packages/lexical-playground/src/plugins/FloatingLinkEditorPlugin/index.tsx` (469 LOC)
- `blocknote/packages/core/src/extensions/LinkToolbar/LinkToolbar.ts` (122 LOC)
- `blocknote/packages/react/src/components/LinkToolbar/LinkToolbarController.tsx` (193 LOC)
- `plate/packages/link/src/react/LinkPlugin.tsx` (99 LOC)
- `plate/packages/link/src/react/components/FloatingLink/useFloatingLinkEdit.ts` (152 LOC)
- `plate/packages/link/src/react/components/FloatingLink/useVirtualFloatingLink.ts`
- `blocksuite/packages/affine/inlines/link/src/link-node/link-popup/link-popup.ts` (336 LOC — Lit custom element)
- `blocksuite/packages/affine/inlines/link/src/link-node/link-popup/toggle-link-popup.ts`
- `blocksuite/packages/affine/inlines/link/src/command.ts` (toggleLink)
- `tiptap/packages/extension-bubble-menu/src/bubble-menu-plugin.ts` (shouldShow gate)
- https://tiptap.dev/docs/ui-components/components/link-popover (Tiptap Pro docs)

## Findings

### Lexical — FUSED (selection-derived, local React state)  ·  CONFIRMED

The floating link editor's "am I open" state is **React `useState` in a single-component hook**, recomputed from every selection event.

```tsx
// FloatingLinkEditorPlugin/index.tsx:353-437 (excerpted)
function useFloatingLinkEditorToolbar(editor, anchorElem, isLinkEditMode, setIsLinkEditMode) {
  const [isLink, setIsLink] = useState(false);
  useEffect(() => {
    function $updateToolbar() {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // ... detect $isLinkNode / $isAutoLinkNode under selection ...
        if (!badNode) setIsLink(true);
        else setIsLink(false);
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => editorState.read($updateToolbar)),
      editor.registerCommand(SELECTION_CHANGE_COMMAND, () => { $updateToolbar(); ... },
        COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ESCAPE_COMMAND, () => {
        if (isLink) { setIsLink(false); return true; }
        return false;
      }, COMMAND_PRIORITY_HIGH),
    );
  }, [editor]);
  return createPortal(<FloatingLinkEditor .../>, anchorElem);
}
```

Key points:
- `isLink` is strictly derived from selection — every `SELECTION_CHANGE_COMMAND` fires `$updateToolbar()` (file:411-419).
- ESC key explicitly sets `setIsLink(false)` (file:192-201) — the *only* close affordance that isn't "selection moved away."
- `isLinkEditMode` is a **second** boolean, hoisted one level up (passed as prop from `FloatingLinkEditorPlugin`) — this is the toggle between view-mode and edit-mode UI; it is NOT about "is the popover open" but "if it is open, which chrome."
- Single-instance popover: `createPortal(<FloatingLinkEditor ... />, anchorElem)` always renders at most one floating editor (file:439-449). No multi-popover coexistence in this codebase.
- **No in-code justification comment** for the fused choice; it is presented as the obvious shape.

### BlockNote — FUSED-BY-DEFAULT with explicit SPLIT escape hatch  ·  CONFIRMED

The only OSS editor examined that calls out the coupling choice in an inline comment.

```tsx
// blocknote/packages/react/src/components/LinkToolbar/LinkToolbarController.tsx:22-66 (excerpted)
const [toolbarOpen, setToolbarOpen] = useState(false);
const [toolbarPositionFrozen, setToolbarPositionFrozen] = useState(false);
// Because the toolbar opens with a delay when a link is hovered by the mouse
// cursor, We need separate `toolbarOpen` and `link` states.                    // <-- THE COMMENT
const [link, setLink] = useState<...>(undefined);

useEffect(() => {
  const textCursorCallback = () => {
    const textCursorLink = linkToolbar.getLinkAtSelection();
    if (!textCursorLink) {
      setLink(undefined);
      if (!toolbarPositionFrozen) setToolbarOpen(false);        // <-- selection loss closes UNLESS frozen
      return;
    }
    setLink({ cursorType: "text", url, text, range, element });
    if (!toolbarPositionFrozen) setToolbarOpen(true);
  };
  const destroyOnChangeHandler = editor.onChange(textCursorCallback);
  const destroyOnSelectionChangeHandler = editor.onSelectionChange(textCursorCallback);
  // mouse hover path: floating-ui's useHover manages its own delay
  ...
}, [editor, linkToolbar, link, toolbarPositionFrozen]);
```

Key points:
- Two useStates: `toolbarOpen` (visibility) + `link` (anchor/payload data). `toolbarOpen` is distinct from `link !== undefined` — the comment at line 27-28 explicitly justifies why.
- `toolbarPositionFrozen` (line 23, 117-120) is a SPLIT escape: during active edit the controller must NOT close just because selection drifted into an input. `LinkToolbar` component receives `setToolbarPositionFrozen` and `setToolbarOpen` as props so the child UI can command-override the parent's selection-driven logic (file:186-188).
- Passes `{ open: toolbarOpen, onOpenChange: ... }` into FloatingUI (line 116-137) — FloatingUI is itself controlled. The `onOpenChange` callback **ignores hover-reason close** when `cursorType === "text"` (file:124-130) — selection-driven open wins over hover.
- Only one LinkToolbarController per editor; no multi-popover coexistence.
- JUSTIFICATION PRESENT: comment at file:27-28 is the surfaced reason (hover delay ≠ instant selection response).

### Plate.js — EXTERNALIZED SINGLE-SLOT (plugin-store mode enum)  ·  CONFIRMED

State is hoisted out of React into the **plugin options store**, but only one popover per editor can open at a time.

```tsx
// plate/packages/link/src/react/LinkPlugin.tsx:7-98 (excerpted)
export type FloatingLinkMode = '' | 'edit' | 'insert';

export const LinkPlugin = toTPlatePlugin<LinkConfig>(BaseLinkPlugin, {
  options: {
    isEditing: false,
    mode: '' as FloatingLinkMode,
    openEditorId: null,
    // ... url, text, newTab, updated ...
  },
})
  .extendEditorApi(({ setOptions }) => ({
    floatingLink: {
      hide:  () => setOptions({ isEditing: false, mode: '', openEditorId: null, ... }),
      show:  (mode, editorId) => setOptions({ isEditing: false, mode, openEditorId: editorId }),
      reset: () => setOptions({ isEditing: false, mode: '', ... }),
    },
  }))
  .extendSelectors(({ getOptions }) => ({
    isOpen: (editorId) => getOptions().openEditorId === editorId,   // <-- single-slot selector
  }));
```

```tsx
// plate/packages/link/src/react/components/FloatingLink/useFloatingLinkEdit.ts:84-101
React.useEffect(() => {
  if (editor.selection && editor.api.isCollapsed() &&
      editor.api.some({ match: { type: editor.getType(KEYS.link) } })) {
    api.floatingLink.show('edit', editor.id);
    floating.update();
    return;
  }
  if (getOptions().mode === 'edit') api.floatingLink.hide();
}, [editor, versionEditor, floating.update]);
```

Key points:
- `mode` is a **tri-state enum** (`'' | 'edit' | 'insert'`) not a boolean — precedent #6-style "mode state as enums" (see `CLAUDE.md` precedents).
- `openEditorId` is the only "which one is open" handle; implies **one popover per editor**, but multiple editors on a page *could* each have one.
- `isOpen(editorId)` is a pure selector — consumers read, don't subscribe to React state.
- Selection still drives: the `useFloatingLinkEdit` effect re-runs on every editor version and calls `api.floatingLink.show('edit', editor.id)` if collapsed inside a link, else `hide()`.
- `useOnClickOutside` → `hide()` but only if `isEditing` (file:120-124). So click-outside during view-mode doesn't fire — selection-change handles it.
- Hotkey-driven `insert` mode: `meta+k, ctrl+k` (`triggerFloatingLinkHotkeys` default, file:52).
- **No in-code comment** explaining the externalized choice; inferred motivation: per-editor imperative API (`api.floatingLink.show()`) is useful for command-palette / keyboard / toolbar buttons.

### BlockSuite (AFFiNE) — IMPERATIVE MODAL (abort-controller lifecycle, selection-independent)  ·  CONFIRMED

Stands apart: LinkPopup is **not bound to selection** — it is a one-shot Lit custom element appended to the document body with modal semantics (body-scroll lock + overlay mask).

```ts
// blocksuite/packages/affine/inlines/link/src/command.ts:10-42 (toggleLink command)
export const toggleLink: Command = (ctx, next) => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;
  // ... resolve inlineEditor + targetInlineRange ...
  const format = inlineEditor.getFormat(targetInlineRange);
  if (format.link) { inlineEditor.formatText(targetInlineRange, { link: null }); return next(); }

  const abortController = new AbortController();
  const popup = toggleLinkPopup(ctx.std, 'create', inlineEditor, targetInlineRange, abortController);
  abortController.signal.addEventListener('abort', () => popup.remove());
  return next();
};
```

```ts
// blocksuite/packages/affine/inlines/link/src/link-node/link-popup/link-popup.ts:223-251 (excerpted)
override connectedCallback() {
  super.connectedCallback();
  if (this.targetInlineRange.length === 0) return;
  // disable body scroll
  this._bodyOverflowStyle = document.body.style.overflow;
  document.body.style.overflow = 'hidden';                              // <-- MODAL behavior
  this.disposables.add({ dispose: () => { document.body.style.overflow = this._bodyOverflowStyle; } });
}

override firstUpdated() {
  this.disposables.addFromEvent(this.overlayMask, 'click', e => {
    e.stopPropagation();
    this.std.host.selection.setGroup('note', []);
    this.abortController.abort();                                       // <-- only close path
  });
  ...
}
```

Key points:
- Open state is **the existence of the Lit element in the DOM**. There is no boolean anywhere; construction = open, `.remove()` = closed.
- Close triggers (all abort the controller): overlay-mask click (line 247-251), ESC keybinding (file-internal `_onKeydown`), confirm button, external command (selection leaving via "note" group reset).
- `type: 'create' | 'edit'` is the analogue of Plate's `mode` enum (property on the Lit element, file:330-331) — chooses which input layout to render.
- Body-scroll lock means this is **modal**, not a peer-with-editor popover. It's triggered only by explicit user action (Cmd+K, toolbar "Edit" button) — *never* by selection simply landing on a link.
- Per-call freshness: each `toggleLinkPopup()` creates a new LinkPopup node, so "one at a time" is enforced by convention rather than state machine — there is no global registry preventing a second call.
- There is ALSO a separate "hover-only" toolbar (`link-node/configs/toolbar.ts`) — that one is toolbar-framework driven (ctx.message$), distinct from the popup. Two independent chrome pieces for the same chip, with different lifecycles.

### TipTap — FUSED via `shouldShow` callback; LinkPopover UI component exposes `onOpenChange` observer  ·  CONFIRMED + PARTIALLY INFERRED

Core `extension-bubble-menu` (the primary place link UI attaches):

```ts
// tiptap/packages/extension-bubble-menu/src/bubble-menu-plugin.ts:195-216, 524-543 (excerpted)
public shouldShow = ({ view, state, from, to }) => {
  const { empty } = state.selection;
  const isEmptyTextBlock = !state.doc.textBetween(from, to).length && isTextSelection(state.selection);
  const isChildOfMenu = this.element.contains(document.activeElement);
  const hasEditorFocus = view.hasFocus() || isChildOfMenu;
  if (!hasEditorFocus || empty || isEmptyTextBlock || !this.editor.isEditable) return false;
  return true;
}

updateHandler = (view, selectionChanged, docChanged, oldState) => {
  const { composing } = view;
  const isSame = !selectionChanged && !docChanged;
  if (composing || isSame) return;
  const shouldShow = this.getShouldShow(oldState);
  if (!shouldShow) { this.hide(); return; }
  this.show();
  this.updatePosition();
}
```

LinkPopover (Tiptap Pro UI component, per docs):
- Props: `autoOpenOnLinkActive` (default `true`), `hideWhenUnavailable`, `onOpenChange(isOpen)`.
- `useLinkPopover()` hook returns `isVisible`, `canSet`, `isActive` — all derived from selection.
- No `open` / `defaultOpen` prop to control externally — internal state only. `onOpenChange` is observational, per docs.

Key points:
- Core BubbleMenu: **pure selection-derived visibility** via `shouldShow` gate on every state update. `isVisible` is plugin instance field — not exposed, not controllable.
- `isChildOfMenu` check (line 207-209) is the one SPLIT accommodation — when focus moves to an input *inside* the menu, visibility stays true. Same pattern as BlockNote's position-frozen, implemented as a derived predicate rather than explicit state.
- Debounced selection updates via `updateDebounceTimer` (file:493-500).
- Public discussion (GitHub #4097) around building a custom link popover with floating-ui remained unresolved — community wanted a concrete SPLIT recipe; the canonical answer is "use BubbleMenu + `shouldShow` and accept the coupling."
- `BubbleMenu opening on click · Issue #2171` — another unresolved request for non-selection open.

## Cross-editor summary table

| Editor | Open state lives in | Coupled to selection? | Multi-open coexistence | Mode enum? | In-code justification |
|---|---|---|---|---|---|
| Lexical | React `useState` (component-local) | FUSED — every SELECTION_CHANGE | No — single portal | `isLinkEditMode` (boolean) | None |
| BlockNote | React `useState` (component-local) | FUSED + `toolbarPositionFrozen` escape | No — single controller | `cursorType: "text" \| "mouse"` | YES (file:27-28) |
| Plate.js | Plugin options store (externalized) | FUSED via effect + imperative API | One per-editor (`openEditorId`) | `mode: "" \| "edit" \| "insert"` | None |
| BlockSuite | DOM existence of Lit element | SPLIT — explicit user trigger only | By convention, not enforced | `type: "create" \| "edit"` | None (but modal semantics make intent clear) |
| TipTap core | Plugin instance `isVisible` field | FUSED via `shouldShow` gate | No — single menu | No — boolean gate | None |

## Negative searches

- **No repo** used a Zustand / Jotai / Redux atom *per link instance* to track open state. Plate.js came closest with `openEditorId` but that's still single-slot per editor.
- **No repo** defined a "selected chip A is active, a different popover is open for chip B" scenario as first-class. BlockNote's `toolbarPositionFrozen` is the closest escape, but even there only ONE toolbar exists; frozen just means "don't follow selection for a beat."
- Searched for `"multiple popover"` / `"coexist"` / `"simultaneously open"` across all five repos — no comments or tests match.
- BlockSuite's link-popup has **no** `isOpen` boolean at all; open-ness is the node's DOM presence. This is a valid design point but not a pattern any React-based editor in this sample follows.

## Gaps / UNCERTAIN

- **Lexical — justification:** no commit-message or code-comment explanation for the `isLink`/`isLinkEditMode` split. UNCERTAIN whether this was designed as two dimensions or accreted.
- **Plate.js — multi-editor-on-page scenario:** the `openEditorId` design clearly *permits* two Plate editors on one page each showing their own link popover simultaneously, but no test or example demonstrates this. INFERRED from selector shape.
- **TipTap LinkPopover (Pro):** only the public docs were accessible; the source is not in the OSS mirror. State-model details come from docs, not source — classified PARTIALLY INFERRED.
- **BlockSuite — has the team documented the modal choice?** No commit message or design doc surfaced in a quick grep. UNCERTAIN whether modal-style was a deliberate inversion of the FUSED pattern or inherited from AFFiNE's broader component style.
- `~/.claude/oss-repos/affine` exists as a separate clone — not investigated due to time budget; would corroborate/refine BlockSuite findings.
