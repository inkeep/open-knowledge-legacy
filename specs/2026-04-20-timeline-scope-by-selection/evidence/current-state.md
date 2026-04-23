---
name: Current state — timeline stack + navigation target model
description: Factual catalog of the existing per-file timeline implementation plus the navigation-target primitives that the scope-by-selection feature will bind to.
date: 2026-04-20
source: 1P codebase inspection
---

# Current state: timeline + navigation-target primitives

## Timeline stack (per-file only)

- **Type:** `packages/core/src/types/timeline.ts` — `TimelineEntry { sha, timestamp, author, authorEmail, type: 'checkpoint' | 'wip' | 'upstream', message, contributors, checkpoint: ParsedCheckpoint | null }`.
- **Query function:** `packages/server/src/timeline-query.ts:getDocumentHistory(shadow, query, contentRoot)` — walks shadow refs via `git log` with NUL-delimited format. Accepts `{ docName, branch?, type?, author?, excludeAuthor?, limit?, offset? }`. Fast path exists for `type === 'checkpoint'` only.
- **Pathspec construction:** lines 128-139 — builds `docPath = <contentRoot>/<docName><ext>` when `docName` is set; `docPath` is undefined otherwise. Pathspec is appended as `['--', docPath]` to the `git log` invocation. **`docName: undefined` currently means "no pathspec, walk all commits" — the project-scope plumbing already works at the query-layer level.**
- **Ref enumeration:** Uses `for-each-ref refs/wip/<branch>/` and `for-each-ref refs/checkpoints/<branch>/` separately, then passes the collected SHAs to `git log`. On feature branches, falls back to main's WIP and checkpoint refs for pre-divergence history. WIP refs are per-writer (`refs/wip/<branch>/<writer-id>`), not per-doc — so walking them is already project-wide in ref coverage.
- **HTTP endpoint:** `packages/server/src/api-extension.ts:1910-1973` — `GET /api/history` requires `docName` query param (returns 400 otherwise), accepts optional `branch`, `limit` (capped at 200), `offset`, `type`, `author`, `excludeAuthor`.
- **MCP tool:** `packages/cli/src/mcp/tools/get-history.ts` — `get_history` tool with Zod schema. `docName: z.string()` is required. Mirrors HTTP params.
- **React panel:** `packages/app/src/components/TimelinePanel.tsx` — right-side Sheet (`side="right"`, width 350px), fetches on open, polls every 10s, hard-caps at `limit=100`. `docName` is required prop. Empty state is a 12px muted "No history yet" string (lines 426-430). Grouping: checkpoints are flat landmarks; WIP entries collapse into `WipGroup` components between checkpoints (lines 328-358).
- **Panel mounting:** `packages/app/src/components/EditorPane.tsx:218-224` — `<TimelinePanel docName={activeDocName ?? ''} ... />`. Header button at EditorPane:183 toggles `timelineOpen` state; this is the only entry point.
- **Restore flow:** `EditorPane.tsx:65-78` `handleEntrySelect` sets `previewEntry` and flips editor mode to `'diff'`. Restore action ultimately targets `activeDocName` only. Timeline entry's `contributors[].docs` array is rendered in the panel but not used for navigation.

## Navigation-target primitives

- **Type:** `packages/app/src/components/navigation-targets.ts:ResolvedNavigationTarget` — discriminated union with four `kind` values: `'doc'`, `'folder-index'`, `'folder'`, `'missing'`.
- **`resolveNavigationTarget(target, options)`:** classifies a path against the known pages + derived folder paths. A path resolving to a doc → `{kind:'doc', docName}`; a folder with an index page → `{kind:'folder-index', folderPath, docName}`; a folder without an index → `{kind:'folder', folderPath}`; unknown → `{kind:'missing', target}`.
- **Exposure:** `packages/app/src/editor/DocumentContext.tsx:24-25, 211, 326` — `activeTarget: ResolvedNavigationTarget | null` is part of the context value. `setActiveTarget()` is called by `openDocument()` (always sets `kind: 'doc'`) and `openTarget()` (accepts any kind).
- **Selection derivation:** `packages/app/src/components/file-tree-selection.ts:resolveFileTreeSelection(activeTarget, activeDocName)` returns `{ selectedFilePath, selectedFolderPath, navigationPath }`. `doc` → selectedFilePath set; `folder` / `folder-index` → selectedFolderPath set; `missing` → both null.
- **Folder viewing:** `FolderOverview.tsx` renders when `activeTarget.kind` is `'folder'` or `'folder-index'`. Users can navigate into a folder and see its children — folder is a first-class view target, not just a tree-expansion affordance.
- **Navigation path:** URL hash — `#/<path>`. FileTree row click → `window.location.hash = #/<path>` → DocumentContext's hash listener calls `openTarget()` → `activeTarget` updates.

## FileTree context-menu scaffolding

- `packages/app/src/components/FileTree.tsx:50-58` imports `ContextMenu` primitives. Folder rows already have context-menu entries ("New file here", "New folder here"). No "history" entry exists.
- `selectedFilePath` and `selectedFolderPath` are threaded to the rendered rows — `isActive` styling is already derived from these (FileTree.tsx:274).

## Reserved / system doc handling

- `__system__` pseudo-doc is filtered at multiple layers (ProviderPool.open, EditorActivityPool, ContentFilter). The API's `createServer()` rejects `docName='__system__'` at admit time. Any scope-filter extension must similarly short-circuit system docs.

## Shadow-repo scope mechanics (already in place)

- `getCurrentBranch?.()` — branch-scoped shadow refs already supported.
- Shadow refs under `refs/wip/<branch>/<writer-id>` — one per writer, spans all docs.
- Shadow refs under `refs/checkpoints/<branch>/` — checkpoints (user-triggered saves + silent rescue checkpoints).
- Pathspec is the only knob narrowing scope from project-wide to per-path.

## Implications for the scope-by-selection spec

- **Scope source = `activeTarget`.** The `activeTarget.kind` maps directly onto scope:
  - `'doc'` → file scope (pathspec = docPath)
  - `'folder-index'` → folder scope (pathspec = `<folderPath>/`)
  - `'folder'` → folder scope (pathspec = `<folderPath>/`)
  - `'missing'` → project scope (no pathspec) or disabled (user preference)
  - `null` (no target yet) → project scope or disabled
- **No new state required.** DocumentContext already exposes what the scope should be.
- **API blockers identified:** `docName` is required at server, MCP, and React-prop boundaries. Spec must relax these.
- **Restore flow needs rework for folder/project scope.** Click-entry currently targets `activeDocName`. Under wider scope, an entry may touch N files.
- **FileTree context-menu already scaffolded.** Adding a "Show history for this folder" entry is a small additive change.
- **Polling at 10s is cheap at file scope, unclear at project scope.** At project scope, every git log walks all refs with no pathspec filter — cost scales with commit count. Need to measure or cap.
