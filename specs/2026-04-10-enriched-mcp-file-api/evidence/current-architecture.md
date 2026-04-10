---
title: Current architecture — MCP server, Hocuspocus, catalog system
description: Factual findings on how the MCP server, Hocuspocus collaboration server, and catalog system currently work and relate to each other.
sources:
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/tools.ts
  - packages/cli/src/mcp/tools/index.ts
  - packages/cli/src/wiki/catalog.ts
  - packages/cli/src/wiki/watcher.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/persistence.ts
  - specs/2026-04-08-project-wiki-mcp-surface/SPEC.md
---

## Two decoupled operational modes

1. **MCP server** (`open-knowledge mcp`) — disk-only, stdio. Starts file watcher + catalog generator. Exposes three workflow tools (init-wiki, ingest, research). Agents read/write files via native tools (Read, Edit, Write, Grep). No CRDT integration.

2. **Full server** (`open-knowledge start`) — Hocuspocus + React editor. Creates DirectConnection for agent writes, origin-tagged transactions, per-agent UndoManager. HTTP API at `/api/agent-*`. Persistence pipeline: CRDT → markdown → disk → git WIP ref.

**Bridge:** MCP server probes for Hocuspocus at startup via HTTP GET to `/api/agent-undo-status` (server.ts:82-93). Detection only — no routing of operations.

## Deferred write tools (tools.ts)

8 tools commented out (~300 lines). Split between:
- **D2-rejected reads** (read_document, list_documents, search_documents) — agents use native tools
- **D1-deferred writes** (write_document, edit_document, update_frontmatter, undo_agent_edit, redo_agent_edit) — route through Hocuspocus HTTP API

These are preserved as reference implementation. Server-side counterpart exists in api-extension.ts.

## Catalog system (catalog.ts)

Data types available:
- `ArticleMeta`: title, description, tags[], relativePath
- `SubfolderMeta`: name, title, description, articleCount, relativePath
- `IndexMeta`: title, description (sticky across rebuilds)
- `generateCatalog(dirPath)` → INDEX.md markdown string
- `generateRootCatalog(okDir, sections)` → root INDEX.md
- `contentHash(content)` → sha256 for write dedup

Catalog watcher (watcher.ts): @parcel/watcher on .open-knowledge/, debounced rebuild (500ms quiet, 2000ms max), content-hash dedup prevents infinite loops.

## Tool registration pattern

Each tool is a separate file in `mcp/tools/` with a `register(server)` export. `index.ts` aggregates. `shared.ts` provides `textResult()` helper and `ServerInstance` type.

## Agent write flow through Hocuspocus

1. `AgentSessionManager.getSession(docName)` → DirectConnection to Y.Doc
2. `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` — origin tag enables per-agent undo
3. Y.Text('source') modified → `syncTextToFragment()` keeps XmlFragment in sync
4. Activity logged to `Y.Map('activity')` with agentId, timestamp, type, description
5. Persistence debounce → atomic write to disk → git WIP commit (30s idle)

## Config mapping

`config.yml` `wiki.roots` array maps content locations:
```yaml
wiki:
  roots:
    - path: ./articles      # relative to .open-knowledge/
      label: Knowledge Articles
    - path: ./external-sources
      label: External Sources
    - path: ./research
      label: Research
```

Roots resolve to absolute paths via `resolveWikiPaths()`. Each root gets its own INDEX.md catalog tree.
