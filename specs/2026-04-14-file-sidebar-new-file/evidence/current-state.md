---
name: current-state
description: What exists today in the codebase that the new-file-sidebar feature builds on
type: evidence
sources:
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/FileTree.tsx
  - packages/app/src/components/CreatePageDialog.tsx
  - packages/app/src/editor/extensions/WikiLinkView.tsx
  - packages/server/src/api-extension.ts
---

## FileSidebar (`packages/app/src/components/FileSidebar.tsx`)
- Renders `<Sidebar variant="inset">` with a `<SidebarHeader>` containing a static "Files" label and a `<SidebarContent>` that hosts `<FileTree />`.
- **No action slots today.** Header is label-only. Easy extension point for "+" button.

## FileTree (`packages/app/src/components/FileTree.tsx`)
- Fetches `/api/documents` on mount and polls every 5s.
- **Does NOT subscribe to `documents-events`.** Only `PageListContext.tsx:57` calls `subscribeToDocumentsChanged`. The 5-second poll is the only refresh path today. (Audit correction — earlier draft of this evidence claimed otherwise.)
- `<FileTreeNode>` wraps each row in `<ContextMenu>` with two items (`Rename`, `Delete`) — shared between file and folder rows.
- Folder rows have expand/collapse state via `userExpanded`/`userCollapsed`; **no "selected folder" state**.
- Empty state (line 410): renders `"No files yet."` as centered muted text — no CTA.
- Error state (line 402): renders error text; shares the centered layout with empty state.
- Selection model: `activeDocName` from `useDocumentContext()` — files only.

## CreatePageDialog (`packages/app/src/components/CreatePageDialog.tsx`)
- Props: `{ open, target, onOpenChange, onCreated }`.
- `getSuggestedPath(target)` reads `window.location.hash`, extracts current doc name, derives parent directory via `lastIndexOf('/')`, then appends `${toWikiLinkSlug(target)}.md`.
- Submits JSON `{ path }` to `POST /api/create-page`, surfaces server errors inline, calls `onCreated(data.docName)` on success.
- **Coupled to the wiki-link flow today:** prop `target: string` is the `[[wiki-link]]` text; the dialog title reads "Create page" and the description reads "Create a new page for [[{target}]]".

## WikiLinkView (only current caller)
- `packages/app/src/editor/extensions/WikiLinkView.tsx:383` — renders `<CreatePageDialog ... />` when a wiki-link click targets a missing page.

## Server endpoint `POST /api/create-page` (`packages/server/src/api-extension.ts:1352`)
- Validates: must be JSON object; `path` is non-empty string; must end with `.md`; no `..`, no leading `/`, no backslash, no null byte; resolves to within `contentDir`.
- `isSystemDoc` guard rejects reserved names (e.g. `__system__`).
- Creates parent dirs recursively via `mkdirSync(dirname(fullPath), { recursive: true })`.
- Writes with `{ flag: 'wx' }` — 409 `"File already exists"` on EEXIST.
- Returns `{ ok: true, docName }` on success (`docName` = `filePath.slice(0, -3)`).
- **No analogous `/api/create-folder` endpoint exists.** Folders only appear in the tree when they contain a file.

## `/api/documents` (`packages/server/src/api-extension.ts:700`)
- Reads from the watcher's in-memory file index — only files are enumerated.
- **Empty folders are invisible** to this API, so to the tree.

## Global keyboard infrastructure
- No app-level keybind system; editor plugins use `keydown` locally (`TiptapEditor.tsx`, `SourceEditor.tsx`, etc.).
- Adding `Cmd/Ctrl+N` requires a new listener at App level (outside editor focus scope).
