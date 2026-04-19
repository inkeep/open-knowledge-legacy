# Evidence: B2 — Hocuspocus connection lifecycle hooks

**Dimension:** B2 — `onDisconnect`, `onClose`, `afterUnloadDocument` ordering relative to socket close
**Date:** 2026-04-18
**Sources:** Local OSS clone `~/.claude/oss-repos/hocuspocus/packages/server/src/`

---

## Key files referenced

- `types.ts` — hook type signatures (`HookPayloadByName`, `HookName`)
- `Hocuspocus.ts:220-260` — `handleConnection` wires `onClose` callback
- `Connection.ts:22-35, 86-95` — `onClose` callback registry
- `ClientConnection.ts:277-295` — post-upgrade `readyState` check

---

## Findings

### Finding B2-1: Complete hook inventory

**Confidence:** CONFIRMED
**Evidence:** `types.ts:90-114, 117-140`

| Hook | Firing order (from source) | Purpose |
|---|---|---|
| `onConfigure` | Server start | Configuration-time side effects |
| `onListen` | After HTTP server listens | Post-listen initialization |
| `onUpgrade` | Before WebSocket upgrade | Reject upgrades pre-handshake |
| `onConnect` | After upgrade, before auth | Connection-level auth/setup |
| `connected` | After auth success | Per-connection post-auth |
| `onAuthenticate` | During auth | Token/credential check |
| `onCreateDocument` | Before doc is loaded for first time | Doc-creation hook |
| `onLoadDocument` | While loading doc from persistence | Load initial state |
| `afterLoadDocument` | After doc is in memory | Post-load instrumentation |
| `beforeHandleMessage` | Per incoming Y.js message | Pre-process inbound |
| `beforeBroadcastStateless` | Before `broadcastStateless` iterates | Pre-broadcast instrumentation |
| `onStateless` | On inbound stateless message | Handle stateless payloads |
| `onChange` | On doc change | Doc-level change handler |
| `onStoreDocument` / `afterStoreDocument` | Debounced persist | Persistence lifecycle |
| `onAwarenessUpdate` | On awareness (cursor/presence) update | Presence handler |
| `onRequest` | On HTTP request (API extension pattern) | HTTP route handling |
| **`onDisconnect`** | **When connection closes** | Connection cleanup |
| `beforeUnloadDocument` / `afterUnloadDocument` | Before/after doc is unloaded from memory | Doc-lifecycle endpoints |
| `onDestroy` | Server shutdown | Final cleanup |

---

### Finding B2-2: `onDisconnect` fires AFTER the WebSocket close event

**Confidence:** CONFIRMED
**Evidence:** `Hocuspocus.ts:223-260`

```ts
clientConnection.onClose(
  (document: Document, hookPayload: onDisconnectPayload) => {
    // Check if there are still no connections to the document, as these hooks
    // may take some time to resolve (e.g. database queries). If a
    // new connection were to come in during that time it would rely on the
    // document in the map that we remove now.
    if (document.getConnectionsCount() > 0) {
      // ... early return on reconnect-race
    }
    // ... calls onDisconnect hook
  }
);
```

`clientConnection.onClose(callback)` appends to the `callbacks.onClose` array (`Connection.ts:86-95`, `Connection.ts:22-35`). These callbacks fire from inside `Connection.close()` — which means:

1. Socket receives FIN from client (or server-side close is called)
2. The ws library emits its `close` event
3. `ClientConnection.handleClose` runs
4. This invokes `Connection.close()`
5. Inside `Connection.close()`, all registered onClose callbacks run synchronously
6. One of these callbacks is the Hocuspocus `onDisconnect` hook dispatcher

**Key consequence:** `onDisconnect` is an **after-close** hook, not a pre-close hook. The socket is already in `CLOSED` state by the time `onDisconnect` fires. There is no documented pre-close hook in Hocuspocus's API surface — `beforeUnloadDocument` fires only when the **last** connection on a document closes, not per-connection.

**Implications for "pre-close drain" designs:** A consumer pattern that tries to flush pending broadcasts *before* a socket closes cannot use `onDisconnect` — the socket is already closed when the hook fires. The only way to pre-flush is to hook at the WebSocketLike layer (Docmost pattern, see `b5-consumer-patterns.md`) and react to the `'close'` event on the underlying ws before it's propagated to Hocuspocus.

---

### Finding B2-3: ClientConnection also checks `readyState` post-upgrade for fast-close

**Confidence:** CONFIRMED
**Evidence:** `ClientConnection.ts:277-295`

```ts
// If the WebSocket has already disconnected (wow, that was fast) – then
// immediately call close to cleanup the connection and document in memory.
if (
  this.websocket.readyState === WsReadyStates.Closing ||
  this.websocket.readyState === WsReadyStates.Closed
) {
  this.close();
  return;
}
```

Even immediately after upgrade, Hocuspocus checks for the fast-close race (where a client disconnects between `handleUpgrade` completing and the `ClientConnection` constructor running). This pre-check uses the same `readyState` enum as `Connection.send`.

---

## Gaps

- **`beforeHandleMessage` interaction with EPIPE** — if a message is being processed when the socket closes, whether the async queue (`Connection.ts:processMessages`) terminates cleanly or leaks state. Not relevant for CC1 broadcaster (outbound-only), but worth noting for inbound paths.
- **Exact `onDisconnect` timing under WebSocket server shutdown** — when `hocuspocus.closeConnections()` is called (Hocuspocus.ts:182-196), whether it fires `onDisconnect` per-connection or only `onDestroy`. Not investigated here.
