# Evidence: Automerge Sync Infrastructure

**Dimension:** D2 — Automerge sync infrastructure (automerge-repo)
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-repo, https://github.com/automerge/automerge-repo-sync-server, npm

---

## Key files referenced

- `packages/automerge-repo/src/Repo.ts` — Main entry point (~300 lines visible, total ~7,982 lines in core)
- `packages/automerge-repo/src/DocHandle.ts` — Document handle with state machine (xstate), change/merge API
- `packages/automerge-repo/src/presence/Presence.ts` (287 lines) — Ephemeral state for cursor/awareness
- `packages/automerge-repo-network-websocket/` (579 lines) — WebSocket adapters (client + server)
- `packages/automerge-repo-storage-indexeddb/` — Browser storage
- `packages/automerge-repo-storage-nodefs/` — Node.js filesystem storage

---

## Findings

### Finding: automerge-repo provides WebSocket sync between clients via network adapters
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo-network-websocket/src/index.ts, WebSocketClientAdapter.ts, WebSocketServerAdapter.ts

`@automerge/automerge-repo-network-websocket` (v2.5.3, published ~24 days ago) provides `WebSocketClientAdapter` and `WebSocketServerAdapter`. Both work in browser and Node.js via `isomorphic-ws`. The protocol uses join/peer/error/message types with protocol version negotiation.

### Finding: Persistence via pluggable StorageAdapters — equivalent to Hocuspocus onStoreDocument
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo-storage-nodefs/, packages/automerge-repo-storage-indexeddb/

The Repo constructor accepts a `storage` parameter implementing `StorageAdapterInterface`. `automerge-repo-storage-nodefs` writes to filesystem, `automerge-repo-storage-indexeddb` to browser IndexedDB. The Repo handles document saving automatically via a debounced save mechanism in `StorageSubsystem`.

**Key difference from Hocuspocus:** No `onStoreDocument` callback hook. Persistence is automatic via the storage adapter. To add custom behavior on document save (e.g., markdown conversion pipeline), you would need to listen to `DocHandle.on("change", ...)` events rather than a dedicated persistence hook.

### Finding: Document lifecycle — load, unload, delete states managed by xstate machine
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo/src/DocHandle.ts lines 106-152

DocHandle uses an xstate state machine with states: `idle → loading → requesting → ready`, plus `unavailable`, `unloaded`, `deleted`. Documents can be unloaded (freed from memory but not deleted from storage) and reloaded.

### Finding: Server-side writes via `handle.change()` — equivalent to DirectConnection
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo/src/DocHandle.ts lines 595-609

```typescript
handle.change(doc => {
  // mutate doc here
  am.splice(doc, ["content"], 0, 0, "new text")
})
```

A server-side process creates a Repo with a network adapter connected to the sync server, finds a document via `repo.find(url)`, waits for it to be ready, then calls `handle.change()`. Changes automatically propagate to all connected peers via the sync protocol. This is the direct equivalent of Hocuspocus DirectConnection.

### Finding: Presence API exists — ephemeral state broadcast via Presence class
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo/src/presence/Presence.ts, types.ts

The `Presence` class wraps `DocHandle.broadcast()` for ephemeral messages. It supports typed state channels, heartbeats, peer tracking, and automatic pruning. This is structurally equivalent to Yjs awareness protocol.

### Finding: automerge-repo-sync-server is a separate, minimal repo (Express app)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/automerge/automerge-repo-sync-server

The sync server is a simple Express app configured via `PORT` and `DATA_DIR` environment variables. It uses `automerge-repo-storage-nodefs` for persistence. This is significantly less featured than Hocuspocus, which provides: document lifecycle hooks, authentication, debounced storage, connection management, rate limiting, and extension system.

---

## Comparison with Hocuspocus

| Feature | Hocuspocus | automerge-repo + sync-server |
|---------|-----------|------------------------------|
| WebSocket sync | Yes (custom Y.js protocol) | Yes (automerge sync protocol) |
| Persistence hooks | `onStoreDocument`, `onLoadDocument` | Automatic via StorageAdapter, change events |
| Authentication | `onAuthenticate` extension | Not built-in, custom middleware needed |
| Document lifecycle | Load/unload/destroy hooks | xstate machine (load/unload/delete) |
| Server-side writes | DirectConnection | `handle.change()` on server Repo |
| Presence/awareness | Yjs awareness protocol | Presence class (ephemeral messages) |
| Rate limiting | Built-in | Not built-in |
| Extension system | Yes (plugins) | Network/Storage adapter interfaces |
| Maturity | Production (v3.4.4) | Production-ish (v2.5.3), less battle-tested |

---

## Gaps / follow-ups

- The sync server lacks authentication, rate limiting, document access control
- No equivalent to Hocuspocus's rich extension system
- Storage adapter interface is simpler than Hocuspocus hooks — custom pipeline logic needs different architecture
