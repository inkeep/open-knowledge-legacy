# File Tree Rename/Delete

## Problem

The app sidebar lists nested markdown files and folders, but users can only browse them. Basic file management still requires leaving the editor and using the filesystem directly.

## Goals

- Add rename and delete actions for files and folders in the app file tree.
- Trigger both actions from the sidebar's context menu UI.
- Delete immediately with no confirmation dialog.
- Keep the active document and file list in sync after rename/delete.

## Non-Goals

- Drag-and-drop move support.
- Cross-directory move support from the rename flow.
- Restore/undo for deleted files.

## Requirements

1. Right-clicking a file node shows `Rename` and `Delete`.
2. Right-clicking a folder node shows `Rename` and `Delete`.
3. `Rename` enters an inline editing state for the clicked node.
4. File rename changes only the basename; the `.md` extension stays implicit.
5. Folder rename changes only that folder segment and remaps descendant documents.
6. `Delete` removes the selected file or folder immediately, recursively for folders.
7. Active-doc navigation updates when the active file is renamed or deleted.
8. Other open providers for renamed/deleted docs are closed so stale paths do not linger.
9. The server exposes explicit rename/delete APIs instead of relying on external watcher behavior alone.

## Technical Direction

- Add API routes in `packages/server/src/api-extension.ts` for rename/delete path operations.
- Resolve targets relative to the configured content directory and reject traversal.
- For affected live documents, capture current `Y.Text('source')`, close sessions/connections, unload docs, then perform the filesystem change.
- After rename, return an explicit old→new doc mapping so the app can update local state and navigation immediately.
- In `packages/app/src/components/FileSidebar.tsx`, wrap file-tree nodes with the existing `ui/context-menu` component and implement inline rename mode.

## Acceptance Criteria

- Renaming a file updates the sidebar entry and opens the renamed doc if it was active.
- Renaming a folder updates descendant paths in the sidebar and remaps the active doc if it was inside that folder.
- Deleting a file removes it from the sidebar and clears the editor selection if it was active.
- Deleting a folder removes all descendant files from the sidebar and clears the editor selection if the active doc was inside it.
- Server endpoints reject invalid paths and destination collisions with structured JSON errors.

## Verification

- Server API tests for file rename/delete and folder rename/delete.
- App unit tests for doc-path remapping helpers used by the sidebar.
- `bun run check`.
