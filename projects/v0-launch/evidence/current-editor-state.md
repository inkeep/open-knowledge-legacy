---
title: "Current editor state — features, APIs, and gaps"
type: synthesis
created: 2026-04-12
---

## TLDR

The web editor has 12 of 47 Obsidian/Notion-class features. The server has 6 API endpoints
with no UI consumer. Search has 8 research reports but zero implementation. Version history
has shadow repo infrastructure but no read/query API. The sidebar is view-only with 5s polling.

## Feature Inventory

### Exists (12)
- Create file: `CreatePageDialog.tsx` + `POST /api/create-page`
- File sidebar tree: `FileSidebar.tsx` + `GET /api/documents` (5s poll)
- Slash commands: `slash-command.ts` — headings, lists, quotes, code, tables, separator
- Backlinks panel: `BacklinksPanel.tsx` + `GET /api/backlinks` (2s poll)
- Presence indicators: `PresenceBar.tsx`
- Theme toggle: `ThemeToggle.tsx` (dark/light/system)
- Agent undo/redo: `AgentUndoButton.tsx` + API
- Wiki links: inline `[[link]]` with suggestions
- Inline formatting: bubble menu (bold, italic, underline, strikethrough, code, highlight)
- Editor mode toggle: Visual/Markdown in EditorHeader
- Sidebar collapse: Ctrl+\ keyboard shortcut
- Folder expand/collapse in tree

### API exists, no UI (6)
- Forward links: `GET /api/forward-links`
- Orphans: `GET /api/orphans`
- Hubs: `GET /api/hubs`
- Page headings/outline: `GET /api/page-headings`
- Pages with titles: `GET /api/pages`
- Save version: `POST /api/save-version`

### Missing (30)
See gap analysis in the session conversation. Key clusters:
- File ops (delete, rename, move) — zero implementation
- Search — zero implementation, 8 research reports completed
- Version history UI — shadow repo exists, no read API or UI
- Navigation (Cmd+K, recents, breadcrumbs, outline panel)
- Sidebar enhancements (sort, filter, context menus, real-time updates)
- Editor polish (find/replace, word count, export)
- Import/export — zero implementation

## Infrastructure Readiness

| Component | Ready for | Evidence |
|-----------|----------|----------|
| ContentFilter + file watcher | File ops, search indexing hook | `file-watcher.ts:seedLastKnownHashes`, `content-filter.ts` |
| Safe path utilities | File ops security | `api-extension.ts:safeSubdir`, `isSafeDocName` |
| Provider pool | File deletion/rename cleanup | `standalone.ts:322-368` — deletion already handled for external changes |
| Backlink index | Graph UI panels | `backlink-index.ts:getBacklinks/getForwardLinks/getOrphans/getHubs` |
| Shadow repo | Version history | `shadow-repo.ts:commitWip/saveVersion/parkBranch` — write-side done |
| Slash command system | Extensible commands | `slash-command.ts` — can add new command items |
| File index metadata | Sort by modified | `fileIndex` stores `size` and `modified` per entry |

## Search Research (8 reports, zero implementation)

Extensive prior art research completed:
- `reports/search-engine-decision/` — Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector
- `reports/orama-deep-dive/` — Source-code-level assessment
- `reports/orama-vs-ripgrep-indexed-grep/` — Indexed grep architecture comparison
- `reports/local-search-retrieval-stacks-2025-2026/` — Hybrid search landscape
- `reports/search-engine-advanced-capabilities/` — ANN, vector quantization, sparse embeddings
- Plus 3 more related reports

Decision appears to lean toward Orama based on report titles. Need to verify recommendation.

## Sidebar Real-Time Updates (draft spec, 6 open questions)

`specs/2026-04-11-sidebar-realtime-updates/SPEC.md` — draft spec exists.
Current architecture: 5s polling via `setInterval` in `FileSidebar.tsx:126`.
Proposed: file watcher event forwarding to connected WebSocket clients.
6 open questions remain (push vs pull, provider pool coordination, event scope,
optimistic UI, scalability, event stream subscription).

## Version History Data Model

Shadow repo at `.git/openknowledge/` (integrated) or `.openknowledge/` (standalone).
- Per-writer WIP refs: `refs/wip/{branch}/{writer-id}`
- Upstream import commits: track git pull/merge
- Branch parking: save Y.Doc + disk snapshot for branch switching
- Save Version: creates real commit in project repo + checkpoint in shadow

Missing: no REST API to query version history, no diff endpoint, no restore endpoint.
The shadow repo was designed for attribution journaling, not user-facing history.
