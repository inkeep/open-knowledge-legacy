# PRD-6520 — V0-23: Sidebar drag-and-drop (move files/folders)

## Problem

Users expect to reorganize markdown files and folders in the sidebar the same way they do in a file manager. Context-menu “move” is slower for spatial workflows; Obsidian and VS Code support drag-and-drop.

## Goals

- Drag files and folders within the sidebar tree to **move** them on disk.
- DnD is a **trigger** for the same rename/move APIs as other file ops (`/api/rename` for files, `/api/rename-path` for folders), not a separate backend operation.
- Clear visual feedback: drag preview, valid drop target highlighting, prohibited-drop indication.

## Non-goals

- New REST routes dedicated to “move” (reuse rename).
- Reordering siblings only by drag order (not in scope; move-into-folder only).

## Acceptance criteria

1. Drag a file onto a folder row → file moves into that folder (path updates accordingly).
2. Drag a folder onto another folder (or root) → folder and contained docs move together.
3. While dragging: visible preview (overlay) and highlight on the active drop target.
4. Invalid drops: cannot move a folder into itself or into its own descendant; UI shows prohibited styling and does not call the API for no-ops.

## Technical notes

- Library: `@dnd-kit/core` (`DndContext`, `pointerWithin`, `DragOverlay`).
- Pure validation: `packages/app/src/components/file-tree-dnd.ts` (`validateMoveToFolder`, etc.).
- UI: `packages/app/src/components/FileTree.tsx` — draggable + droppable rows, root drop strip.
- CC1 / `emitDocumentsChanged(['files', ...])` after success so the tree refreshes.

## Decision log

| Decision | Rationale |
|----------|-----------|
| Reuse `/api/rename` + `/api/rename-path` | Same managed rename pipeline as context-menu rename; matches PRD. |
| File row as droppable with parent dir | Matches “drop near file” → move into that file’s parent. |
| Root drop zone only while dragging | Avoids clutter when not dragging. |

## Verification

- Unit: `packages/app/src/components/file-tree-dnd.test.ts`
- Manual: drag file/folder in sidebar with dev server; confirm invalid folder targets show destructive highlight.
