# Evidence: Sync Infrastructure

**Dimension:** D5 — WebSocket sync, persistence, server-side writes
**Date:** 2026-04-07
**Sources:** loro.dev/blog/loro-protocol, github.com/SchoolAI/loro-extended, npm

---

## Key files / pages referenced

- https://loro.dev/blog/loro-protocol — Loro Protocol specification
- https://github.com/SchoolAI/loro-extended — SchoolAI's extended Loro toolkit
- https://www.npmjs.com/package/@loro-extended/repo — Repo package
- https://lib.rs/crates/loro-websocket-client — Rust WebSocket client

---

## Findings

### Finding: Loro has its own sync protocol (Loro Protocol) with WebSocket support
**Confidence:** CONFIRMED
**Evidence:** loro.dev/blog/loro-protocol

The Loro Protocol is a wire protocol designed for real-time CRDT synchronization:

- Operates over WebSocket connections
- Multiplexes multiple independent rooms on a single WebSocket using four-byte magic prefixes
- Message types: `%LOR` (Loro Document), `%EPH` (Ephemeral Store / cursors), `%ELO` (End-to-end encrypted), `%YJS`/`%YAW` (Yjs compatibility)
- Handles message fragmentation for payloads exceeding 256 KiB
- Application-level ping/pong for connection liveness (browser environments)

### Finding: SimpleServer exists but is minimal — designed for testing, not production
**Confidence:** CONFIRMED
**Evidence:** loro.dev/blog/loro-protocol

`SimpleServer` is part of the `loro-websocket` package. It accepts hooks:
- `onLoadDocument` — load document state when a client connects to a room
- `onSaveDocument` — persist document state
- Authentication hooks

This is analogous to a minimal Hocuspocus setup but lacks:
- Horizontal scaling (no Redis/multi-instance support documented)
- Document lifecycle management (lazy loading, memory limits, eviction)
- Extension system (Hocuspocus has a rich extension API)
- Webhook support
- Rate limiting, logging, metrics

### Finding: Client-side architecture supports room-based sync
**Confidence:** CONFIRMED
**Evidence:** loro.dev/blog/loro-protocol

```javascript
// Client creates a single WebSocket connection
const client = new LoroWebsocketClient(url);

// Join rooms with different adaptors
client.join("room-1", new LoroAdaptor(doc1));      // Document sync
client.join("room-1", new LoroEphemeralAdaptor(ephemeral)); // Presence
```

Local edits sync automatically upon `doc.commit()`.

### Finding: No Hocuspocus equivalent exists — but loro-extended fills some gaps
**Confidence:** CONFIRMED
**Evidence:** SchoolAI/loro-extended repository

SchoolAI's `loro-extended` provides:
- **Schema-driven development**: Define schema once, get TypeScript types
- **Network adapters**: HTTP polling, SSE, WebSocket, WebRTC
- **Persistence adapters**: IndexedDB, LevelDB, PostgreSQL
- **React hooks**: `useDocument`, `usePresence`
- **@loro-extended/repo**: Document lifecycle management, storage, network sync

This is the closest thing to a Hocuspocus equivalent for Loro — a third-party community project, not first-party.

Key concern: loro-extended is from SchoolAI (676 commits), not the Loro core team. It's a monorepo with active development but no clear production deployment evidence.

### Finding: Server-side write capability exists but is bare-metal
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt, npm loro-crdt

Loro's JS/WASM binding works in Node.js. A server can:
1. Create a `LoroDoc` and apply operations directly
2. Export updates and broadcast to connected clients
3. Import updates from clients

```javascript
// Server-side mutation (equivalent to Hocuspocus DirectConnection)
const serverDoc = new LoroDoc();
serverDoc.import(savedState);
const text = serverDoc.getText("content");
text.insert(0, "Server-written text");
serverDoc.commit();
const update = serverDoc.export({ mode: "update", from: previousVersion });
// Broadcast update to connected clients via WebSocket
```

This is equivalent to Hocuspocus's DirectConnection pattern but requires manual implementation of:
- Document loading/saving
- WebSocket broadcasting
- Connection management
- Document lifecycle (load on first connect, unload when no clients)

### Finding: No managed service (Liveblocks/TipTap Cloud equivalent)
**Confidence:** CONFIRMED
**Evidence:** Negative search across loro.dev, npm, GitHub

No hosted/managed collaboration service exists for Loro. Every deployment requires self-hosted infrastructure.

---

## Gaps / follow-ups

- SimpleServer source code not inspected — unclear how robust error handling is
- Horizontal scaling patterns not documented (multi-server, Redis pub/sub)
- loro-extended's maturity and production readiness not assessed in depth
- No documentation on authentication/authorization patterns for rooms
