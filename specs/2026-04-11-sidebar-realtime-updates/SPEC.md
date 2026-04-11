# Sidebar Real-Time Updates

**Status:** Draft (seed)
**Created:** 2026-04-11
**Baseline commit:** 718d33e

---

## Problem

The FileSidebar polls `GET /api/documents` every 5 seconds to discover new/removed files. This creates two issues:

1. **Latency** — when an agent creates a document via MCP `write_document`, it won't appear in the sidebar for up to 5 seconds. In a real-time collaborative tool, this feels broken.
2. **Divergence** — the sidebar's document list and the provider pool's open documents are two independent data sources with no coordination. A document can be open in the editor but not yet visible in the sidebar (or vice versa — deleted from disk but still listed).

## Goal

Replace or supplement polling with event-driven updates so the sidebar reflects filesystem changes in real-time, coordinated with the provider pool.

## Current State

- `FileSidebar` fetches `GET /api/documents` on mount + every 5 seconds (`setInterval`)
- The Hocuspocus file watcher (`@parcel/watcher`) already detects disk changes in real-time
- The provider pool has an `onChange` callback but it only fires for pool operations (open/close/setActive), not for new files appearing on disk
- `GET /api/documents` does a synchronous `readdirSync` on every call

---

## Open Questions

### OQ1: Push vs pull for file list updates
**Options:**
- **A: WebSocket push** — the server sends a message over the Hocuspocus WebSocket (or a dedicated channel) when files are created/deleted/renamed. Sidebar subscribes.
- **B: Server-Sent Events (SSE)** — dedicated `/api/documents/stream` endpoint. Lighter than WebSocket for unidirectional updates.
- **C: Smarter polling** — keep polling but add `If-None-Match` / ETag or a `?since=<timestamp>` parameter so the server only returns changes. Reduces payload and enables shorter intervals.
- **D: File watcher event forwarding** — the Hocuspocus file watcher already runs; broadcast its `DiskEvent` stream to connected clients via the existing WebSocket.

### OQ2: Should the provider pool trigger sidebar refresh?
When `pool.open(docName)` creates a document that didn't exist on disk (agent write creates the file), should the pool notify the sidebar to refresh? Or should the sidebar only react to server-side events?

### OQ3: Scope of "real-time" — what events matter?
- File created (agent write, user creates file on disk)
- File deleted (user deletes file on disk)
- File renamed/moved
- File content changed (do we need to update `size`/`modified` in the list?)

### OQ4: Optimistic UI for agent writes
When the MCP `write_document` tool creates a new document, should the sidebar optimistically add it before the server confirms? Or wait for the server event?

### OQ5: Scalability of the list endpoint
With `content.dir: '.'` (project root), `GET /api/documents` returns 3000+ files and does a synchronous `readdirSync`. Should the list endpoint be paginated, cached, or made async? Does the sidebar need the full list on every update, or just deltas?

### OQ6: Coordination with file watcher events
The Hocuspocus file watcher already classifies events as `create | update | delete | rename | conflict`. Could the sidebar subscribe to a filtered version of this stream (just create/delete/rename) rather than re-listing the entire directory?

---

## Potential Architecture

```
File Watcher (already running)
  │
  ├─ DiskEvent: create/delete/rename
  │
  ├─→ Hocuspocus (CRDT reconciliation — existing)
  │
  └─→ NEW: Broadcast to connected clients
       │
       └─→ Sidebar receives event, patches local tree
            (no full re-fetch needed)
```

## Future Work Context

- The file watcher already runs per-server and classifies all events
- The WebSocket connection already exists (HocuspocusProvider)
- Hocuspocus supports custom awareness/broadcast messages
- The `buildTree()` function is pure — patching the document list (add/remove entries) and rebuilding the tree is cheap
