---
title: MCP and HTTP API surface for document addressing
sources:
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/tools.ts
  - packages/cli/src/mcp/tools/index.ts
  - packages/server/src/api-extension.ts
  - packages/cli/src/commands/mcp.ts
  - packages/cli/src/commands/start.ts
---

## Two separate systems, not connected

1. **MCP server** (cli package) — stdio, disk-only, workflow tools (init-wiki, ingest, research).
   Does NOT require Hocuspocus. Does NOT expose document read/write tools.
   
2. **Hocuspocus HTTP API** (server package) — full document CRUD via `/api/agent-*` endpoints.
   Not exposed through MCP.

## HTTP API endpoints (all support docName parameter)

| Endpoint | Method | docName source | Default |
|----------|--------|---------------|---------|
| /api/document | GET | query param | test-doc |
| /api/agent-write | POST | body.docName | test-doc |
| /api/agent-write-md | POST | body.docName | test-doc |
| /api/agent-patch | POST | body.docName | test-doc |
| /api/agent-undo-status | GET | query param | test-doc |
| /api/agent-undo | POST | body.docName | test-doc |
| /api/agent-redo | POST | body.docName | test-doc |

## D1-deferred MCP tools (commented in tools.ts)

8 tools were removed. Write tools deferred (D1), read tools rejected (D2).

Write tools used `path` parameter (mapped to docName):
- write_document(path, markdown, mode)
- edit_document(path, find, replace, dry_run)
- update_frontmatter(path, fields)
- undo_agent_edit() — no docName param (bug)
- redo_agent_edit() — no docName param (bug)

Read tools used `path` parameter:
- read_document(path) → GET /api/document?docName=path
- list_documents(directory) → fs.readdirSync recursive
- search_documents(query, case_sensitive) → line-by-line grep

## Missing today

- No `/api/list-documents` endpoint
- No MCP tool to list documents
- No document discovery API (agents read INDEX.md or use native file tools)
- Undo/redo tools lacked docName param
