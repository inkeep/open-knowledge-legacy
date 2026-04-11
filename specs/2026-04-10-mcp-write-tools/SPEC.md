# MCP Write Tools (D1 Revival)

**Status:** Final
**Created:** 2026-04-10
**Baseline commit:** 748f63e
**Parent spec:** `specs/2026-04-10-multi-file-documents/SPEC.md`
**Parallel with:** `specs/2026-04-10-provider-pool/`, `specs/2026-04-10-document-list-api/`

---

## Problem

The MCP write/edit/undo tools were D1-deferred when the server shipped. They're commented out in `packages/cli/src/mcp/tools.ts` (lines 34-303). Agents currently write via native `Edit` (disk-only, no CRDT sync, no undo, no real-time propagation to editor). With multi-file support landing, agents need to target documents by name through the CRDT layer.

## Goal

Revive the deferred write tools as MCP tools, with consistent `docName` addressing matching the HTTP API. Add a `list_documents` tool. Require Hocuspocus to be running.

## Non-Goals

- Read tools (`read_document`, `search_documents`) — D2-rejected, agents use native Read/Grep
- `update_frontmatter` — deferred, composable from `edit_document`
- Disk-only fallback — agents use native Edit for that

## Package boundary

**This spec touches `packages/cli/` only.** No app or server changes.

---

## Design

### Tools

| Tool | Parameters | HTTP endpoint |
|------|-----------|--------------|
| `write_document` | `docName`, `markdown`, `position` (append/prepend/replace) | `POST /api/agent-write-md` |
| `edit_document` | `docName`, `find`, `replace` | `POST /api/agent-patch` |
| `undo_agent_edit` | `docName` | `POST /api/agent-undo` |
| `redo_agent_edit` | `docName` | `POST /api/agent-redo` |
| `list_documents` | `dir` (optional) | `GET /api/documents` (from parallel spec) |

### Key changes from commented reference

- **Parameter renamed:** `path` → `docName` for consistency with HTTP API
- **`docName` required on undo/redo:** Previously had no document targeting
- **`dry_run` removed from edit_document:** Agents can read first with native tools
- **Registry pattern:** New files in `packages/cli/src/mcp/tools/` (one per tool), registered via `tools/index.ts`. The commented code in `tools.ts` is a reference, not a drop-in.

### Error behavior

All tools check Hocuspocus reachability per-request via `fetch()`. If unreachable:
```
Error: Hocuspocus server is not running. Start it with `open-knowledge start`, then retry.
For disk-only writes without real-time sync, use your native Edit tool directly.
```

### MCP server wiring

The MCP server receives `serverUrl` in `McpServerOptions` (server.ts:32) and detects availability at startup (server.ts:79-90). Currently `registerAllTools(server)` only passes the `McpServer` instance (server.ts:207). The new write tools need `serverUrl` too — either:
- Expand `registerAllTools(server, serverUrl)`, or
- Add `serverUrl` to a shared context/options object passed to each tool's `register()` function

The existing workflow tools (init-content, ingest, research) don't need `serverUrl` — they return instructional text. Only the new write/edit/undo/redo tools make HTTP calls.

### `list_documents` dependency

`list_documents` calls `GET /api/documents` from the parallel document-list-api spec. If that endpoint hasn't shipped yet, this tool can be stubbed (return error "endpoint not available") or deferred to ship after. The write/edit/undo/redo tools have no dependency on it.

---

## Acceptance Criteria

1. `write_document` writes markdown to the specified document; change appears in CRDT
2. `edit_document` performs find-and-replace on the specified document
3. `undo_agent_edit` undoes the last agent edit on the specified document
4. `redo_agent_edit` redoes the last undone edit on the specified document
5. `list_documents` returns available documents (or clear error if endpoint unavailable)
6. All tools return clear error when Hocuspocus is not running
7. All tools use `docName` parameter consistently

## Agent Constraints

**SCOPE:**
- `packages/cli/src/mcp/tools/` — new files: write-document.ts, edit-document.ts, undo-agent-edit.ts, redo-agent-edit.ts, list-documents.ts
- `packages/cli/src/mcp/tools/index.ts` — register new tools
- `packages/cli/src/mcp/server.ts` — pass `serverUrl` to tool registration if not already available

**EXCLUDE:**
- `packages/app/` (parallel spec)
- `packages/server/` (parallel spec)
