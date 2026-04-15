---
title: Current state — file/folder creation UX
type: evidence
sources:
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/FileTree.tsx
  - packages/app/src/components/NewItemDialog.tsx
  - packages/app/src/components/file-tree-utils.ts
  - packages/app/src/components/file-tree-operations.ts
  - packages/app/src/components/ui/sonner.tsx
  - packages/app/src/main.tsx
---

## Header buttons (FileSidebar.tsx)

`FileSidebar.tsx:30-34`:
```ts
function openNewItemDialog(kind: 'file' | 'folder', initialDir?: string) {
  setDialogKind(kind);
  setDialogInitialDir(initialDir ?? defaultInitialDir(activeDocName));
  setDialogOpen(true);
}
```

The header "New file" (SquarePen) and "New folder" (FolderPlus) buttons call `openNewItemDialog(kind)` with **no `initialDir`**. The fallback is `defaultInitialDir(activeDocName)`.

`file-tree-utils.ts:46-49`:
```ts
export function defaultInitialDir(activeDocName: string | null): string {
  if (!activeDocName) return '';
  const slash = activeDocName.lastIndexOf('/');
  return slash > 0 ? activeDocName.slice(0, slash) : '';
}
```

So: if the active doc is `foo/bar/baz`, the dialog pre-fills with `foo/bar`. If it's `foo` (root-level), `initialDir` is `''` (root).

## Context menu (FileTree.tsx)

`FileTree.tsx:203-218`: Context menu on folder rows calls `onNewItem('file', node.path)` / `onNewItem('folder', node.path)` — passes the **folder's own path** as `initialDir`. This is correct behavior: it creates inside the folder you right-clicked.

## NewItemDialog behavior

`NewItemDialog.tsx:41-54`: `composeNewItemPath()` prefixes with `initialDir` if non-empty:
```ts
return args.initialDir ? `${args.initialDir}/${file}` : file;
```
So `initialDir=''` → root. `initialDir='foo/bar'` → creates under `foo/bar/`.

For **folder creation**, it creates `{initialDir}/{folderName}/{fileName}` — always requires two inputs (folder name + first file name).

## Toast / error infrastructure

`sonner.tsx` + `main.tsx:32`: `<Toaster />` is already mounted in the app root. `toast` from `sonner` is available for use anywhere — just needs `import { toast } from 'sonner'`.

## Current error display pattern (FileTree rename/delete)

`FileTree.tsx:446-450`:
```tsx
{error && (
  <span role="alert" className="px-3 pb-1 text-xs text-destructive">
    {error}
  </span>
)}
```
Errors are shown as an inline span at the top of the tree — not a toast.

`NewItemDialog.tsx:275-279`: Dialog errors shown as `<p role="alert" className="text-xs text-red-600">`.

## Rename inline pattern (existing, in FileTree.tsx:129-159)

The rename UX already shows an inline input in the tree row:
- `editingPath: string | null` tracks which node is being edited
- The row swaps the `ButtonToUse` for an `<Input>` with autoFocus
- Enter → commits rename, Escape → cancels, blur → cancels
- The input shows the node's icon + input + `.md` suffix hint

This pattern is the foundation for inline creation.

## Folder-creation semantics

Current dialog (kind='folder') requires:
1. Folder name (required)
2. First file name (defaults to `index.md`)

Creates path: `{initialDir}/{folderName}/{fileName}` via POST `/api/create-page`.

No concept of "empty folder" — folders only exist in the tree if they contain files.
