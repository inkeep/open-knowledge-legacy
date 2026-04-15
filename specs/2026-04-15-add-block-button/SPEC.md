# Add Block Button — Block Controls

## Problem Statement

The editor currently shows a drag gripper in the left margin when hovering over a block. Users can reorder blocks via drag-and-drop, but there is no quick way to add a new block below the current one without clicking into the editor and pressing Enter or `/`. A `+` button in the block controls area would allow users to add a new block below any hovered block in one click — the equivalent of "insert after" directly from the margin.

## Goals

1. Add a `+` (Lucide Plus) icon button to the LEFT of the drag gripper, visible on block hover.
2. Clicking `+` inserts a new empty paragraph directly below the hovered block and immediately triggers the slash command menu.
3. The gripper retains its existing drag-to-reorder behavior unchanged.

## Non-Goals

- Insert-above affordance (future work).
- Source/diff mode support (drag controls are WYSIWYG-only).
- Changes to FileTree or sidebar.

## Requirements

### R1 — Layout: `+` left of grip, flex row
- The block controls container is a flex row: `[+ btn] [grip]`
- The `+` uses the Lucide `Plus` SVG (16×16), matching the grip size
- Both buttons are vertically centered in the container
- The container inherits the same hover/visibility behavior as the current drag handle (fades in on block hover, hidden otherwise)

### R2 — Click: insert paragraph + trigger slash menu
- Clicking `+` inserts an empty paragraph node immediately after the end of the hovered block
- The editor focuses on the new paragraph
- A `/` character is inserted at the start of the new paragraph, triggering the slash command suggestion plugin
- Result is equivalent to: End → Enter → `/`

### R3 — No drag on `+` click
- `mousedown` on the `+` button calls `preventDefault()` + `stopPropagation()` — prevents the container's `draggable = true` from initiating a drag
- The grip retains `cursor: grab`; the `+` button uses `cursor: pointer`

### R4 — Visibility matches existing drag handle behavior
- Both `+` and grip fade in/out together via the same `visibility: hidden` inline style that `DragHandlePlugin` manages
- No separate hover trigger for the `+` button

### R5 — Accessibility
- `aria-label="Add block below"` on the `+` button
- Button is keyboard-focusable (native button element)

### R6 — Correct block detection
- The `+` handler correctly determines which top-level block is hovered, via the `pos` provided by the `onNodeChange` callback
- The new paragraph is inserted at `hoveredNodePos + hoveredNode.nodeSize` — after the block's closing tag

## Technical Design

### Current architecture (pre-change)

`drag-handle.ts` exports:
```typescript
export const BlockDragHandle = DragHandle.configure({
  render: createHandleElement,   // creates <div class="ok-drag-handle"> with grip SVG
  computePositionConfig: { middleware: [offset(...)] },
});
```

`DragHandle.configure()` is a TipTap extension shorthand. Under the hood, `DragHandle.addProseMirrorPlugins()` calls `this.options.render()` and passes the element to `DragHandlePlugin`.

### Proposed architecture (post-change)

**Key insight from package investigation:** `DragHandlePlugin` and `normalizeNestedOptions` are both publicly exported from `@tiptap/extension-drag-handle`. The `onNodeChange` callback is typed at the plugin level as `(data: { editor: Editor; node: Node | null; pos: number }) => void` — `pos` IS included at the plugin level (the extension-level type omits it, but the runtime value is present).

**Use `Extension.create()` + `DragHandlePlugin` directly** — this allows the click handler to close over the editor instance and the tracked hovered block, without module-level mutable state.

```typescript
export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    const editor = this.editor;  // available in extension lifecycle ✓

    // Closure state — one instance per extension lifecycle
    let currentNode: PmNode | null = null;
    let currentNodePos = -1;

    const { container, addBtn } = createBlockControlsElement();

    addBtn.addEventListener('click', () => {
      if (currentNode && currentNodePos >= 0) {
        addBlockBelow(editor, currentNodePos, currentNode);
      }
    });

    return [
      DragHandlePlugin({
        element: container,
        editor,
        onNodeChange({ node, pos }) {
          currentNode = node;
          currentNodePos = pos;
        },
        computePositionConfig: {
          placement: 'left-start',
          strategy: 'absolute',
          middleware: [offset(...)],
        },
        nestedOptions: normalizeNestedOptions(false),
      }).plugin,
    ];
  },
});
```

**Element structure:**
```html
<div class="ok-block-controls">         <!-- replaces ok-drag-handle as the root -->
  <button class="ok-add-block-btn"       <!-- + icon, cursor: pointer, aria-label -->
          aria-label="Add block below"
          type="button">
    <!-- Lucide Plus SVG -->
  </button>
  <div class="ok-drag-grip"             <!-- grip icon, cursor: grab, aria-label -->
       aria-label="Drag to reorder block — keyboard: Mod+Shift+↑/↓">
    <!-- Lucide GripVertical SVG -->
  </div>
</div>
```

**`DragHandlePlugin` sets `element.draggable = true` on the container.** The `+` button prevents drag via `mousedown` → `preventDefault` + `stopPropagation`.

**Insert logic:**
```typescript
function addBlockBelow(editor: Editor, hoveredNodePos: number, hoveredNode: PmNode): void {
  const { state, view } = editor;
  const insertAt = hoveredNodePos + hoveredNode.nodeSize; // position after block's closing tag

  const { tr } = state;
  const paragraph = state.schema.nodes.paragraph?.create();
  if (!paragraph) return;

  tr.insert(insertAt, paragraph);
  const sel = TextSelection.near(tr.doc.resolve(insertAt + 1)); // inside new paragraph
  tr.setSelection(sel).scrollIntoView();
  view.dispatch(tr);
  view.focus();

  editor.commands.insertContent('/'); // triggers @tiptap/suggestion slash menu
}
```

### CSS changes

```css
/* Rename root class ok-drag-handle → ok-block-controls */
.ok-block-controls {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 2px;
  /* visibility and opacity managed by DragHandlePlugin inline styles */
  user-select: none;
}

/* + button */
.ok-add-block-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  cursor: pointer;
  color: oklch(0.72 0 0);
  border-radius: 3px;
  border: none;
  background: transparent;
  padding: 0;
  transition: background-color 100ms var(--ease-out-strong);
}
.ok-add-block-btn:hover {
  background-color: oklch(0 0 0 / 6%);
}

/* Grip */
.ok-drag-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  cursor: grab;
  color: oklch(0.72 0 0);
  border-radius: 3px;
}
.ok-drag-grip:hover {
  background-color: oklch(0 0 0 / 6%);
}
.ok-drag-grip:active {
  cursor: grabbing;
}

/* Visibility fade (DragHandlePlugin sets inline visibility: hidden) */
.ok-block-controls[style*="visibility: hidden"],
.ok-block-controls[style*="visibility:hidden"] {
  opacity: 0;
}

/* Dark mode */
.dark .ok-add-block-btn { color: oklch(0.5 0 0); }
.dark .ok-add-block-btn:hover { background-color: oklch(1 0 0 / 8%); }
.dark .ok-drag-grip { color: oklch(0.5 0 0); }
.dark .ok-drag-grip:hover { background-color: oklch(1 0 0 / 8%); }
```

### Files changed

| File | Change |
|------|--------|
| `packages/app/src/editor/extensions/drag-handle.ts` | Rewrite: closure-based `Extension.create()` with `DragHandlePlugin` directly; combined element |
| `packages/app/src/globals.css` | Rename `.ok-drag-handle` → `.ok-block-controls`; add `.ok-add-block-btn`, `.ok-drag-grip` |
| `packages/app/src/editor/extensions/shared.ts` | No change — `BlockDragHandle` export name unchanged |

### No test file changes required

This feature has no unit-testable pure logic — the behavior is DOM event → ProseMirror transaction. The acceptance criteria are verified via E2E/visual QA. The `block-mover.ts` pattern (pure functions exported separately) applies only when there are dispatch-free logic functions worth unit testing; here the logic is trivial and the interesting behavior is DOM-integration.

## Test Cases

### TC1 — Add below paragraph
- Hover over a paragraph → `+` appears to the left of the grip
- Click `+` → new empty paragraph below, slash menu open

### TC2 — Add below heading
- Hover over a heading → `+` appears
- Click `+` → new empty paragraph below heading, slash menu open

### TC3 — Add below list
- Hover over a bullet/ordered list → `+` appears  
- Click `+` → new empty paragraph below the entire list, slash menu open

### TC4 — Add below last block (document end)
- Hover over the last block
- Click `+` → new paragraph appended to document, slash menu open

### TC5 — No drag on + click
- Mousedown on `+` → no drag operation starts
- The grip still drags normally

### TC6 — Layout
- `+` is to the LEFT of the grip icon
- Both are vertically centered in the container

### TC7 — Slash menu appears
- After clicking `+`, the slash command suggestion popup is visible

### TC8 — Keyboard: focus in new block
- After clicking `+`, cursor is in the new paragraph (the `/` character is there), ready to type a slash command

## Acceptance Criteria

- [ ] `+` (Lucide Plus) icon appears to the LEFT of the drag gripper on block hover
- [ ] Clicking `+` creates a new empty paragraph immediately below the hovered block
- [ ] The slash command menu opens in the new paragraph after the click
- [ ] No drag operation starts when clicking `+` (mousedown preventDefault + stopPropagation)
- [ ] The drag gripper still works correctly (reorder still functions)
- [ ] `aria-label="Add block below"` on the `+` button
- [ ] Light/dark theme visual consistency
- [ ] `bun run check` passes green
