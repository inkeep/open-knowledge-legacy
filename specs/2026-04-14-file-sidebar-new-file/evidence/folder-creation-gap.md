---
name: folder-creation-gap
description: The server has no folder-creation endpoint, and the tree derives folders from files only — "new folder" needs a design decision
type: evidence
sources:
  - packages/server/src/api-extension.ts
  - packages/app/src/components/file-tree-utils.ts
---

## Observed
- `POST /api/create-page` auto-creates parent directories as a side-effect of file creation (`mkdirSync(dirname(fullPath), { recursive: true })`).
- **No `POST /api/create-folder` handler exists.** `grep -E 'create-folder|createFolder|newFolder'` in `packages/server/src` returns zero matches.
- `/api/documents` enumerates only files from the watcher's file index (`packages/server/src/api-extension.ts:725`).
- `buildTree(documents)` in `file-tree-utils.ts` derives folder nodes from file-path segments. An empty folder on disk would be invisible.

## Design implications
Three strategies for "new folder":
1. **Server-side folder endpoint.** Add `POST /api/create-folder` that `mkdirSync`s an empty directory. Requires `/api/documents` (or a new endpoint) to surface empty folders, and the tree must render them. Non-trivial change across watcher + API + tree builder.
2. **File-based composite ("new folder" == "new file in folder").** The "New folder" dialog prompts for folder name AND first filename; submit creates `{folder}/{file}.md` through the existing endpoint. No server change. Keeps the invariant that the tree only reflects files.
3. **Ghost-folder client state.** Client creates a transient folder node in the tree; user must add a file to persist. Simple server-wise but the folder disappears on refresh if no file is added — potentially confusing.

Strategy 2 preserves the architectural invariant (`/api/documents` is the source of truth; empty folders don't exist). Strategy 1 is the "right" long-term shape if empty folders become user-visible first-class objects elsewhere. Strategy 3 is not recommended.
