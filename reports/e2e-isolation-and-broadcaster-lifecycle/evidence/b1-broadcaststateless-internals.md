# Evidence: B1 — Hocuspocus `broadcastStateless` internals

**Dimension:** B1 — Hocuspocus `broadcastStateless` source-level implementation
**Date:** 2026-04-18
**Sources:** Local OSS clone at `~/.claude/oss-repos/hocuspocus/packages/server/src/` (package `@hocuspocus/server`, latest main branch as of clone)

---

## Key files referenced

- `Document.ts` — defines `broadcastStateless` (lines 235-251)
- `Connection.ts` — defines `send` (lines 151-168) and `sendStateless` (lines 170-179)
- `types.ts` — defines `WebSocketLike` interface (lines 55-59)
- `@hocuspocus/common` — exports `WsReadyStates` enum (imported at `Connection.ts:4`)

---

## Findings

### Finding B1-1: `broadcastStateless` accepts a per-connection filter callback

**Confidence:** CONFIRMED
**Evidence:** `Document.ts:238-251`

```ts
/**
 * Broadcast stateless message to all connections
 */
public broadcastStateless(
  payload: string,
  filter?: (conn: Connection) => boolean,
): void {
  this.callbacks.beforeBroadcastStateless(this, payload);

  const connections = filter
    ? this.getConnections().filter(filter)
    : this.getConnections();

  connections.forEach((connection) => {
    connection.sendStateless(payload);
  });
}
```

The filter is applied **before** iteration, so filtered-out connections never have `sendStateless` called against them. A consumer can pass `(conn) => conn.webSocket.readyState === OPEN` and exclude closed sockets at the broadcast-dispatch layer.

**Implications:** A consumer-side pre-filter by readyState is a **public, supported API path** — no patching needed. The filter receives the full `Connection` object, which exposes `webSocket: WebSocketLike` (see Finding B1-3 for the interface shape).

---

### Finding B1-2: `Connection.send` ALREADY pre-filters by readyState internally

**Confidence:** CONFIRMED
**Evidence:** `Connection.ts:151-168`

```ts
/**
 * Send the given message
 */
send(message: Uint8Array): void {
  if (
    this.webSocket.readyState === WsReadyStates.Closing ||
    this.webSocket.readyState === WsReadyStates.Closed
  ) {
    this.close();
    return;
  }

  try {
    this.webSocket.send(message);
  } catch (exception) {
    this.close();
  }
}
```

**Key observations:**
1. Before every `webSocket.send()` call, Hocuspocus checks `readyState` against `Closing` and `Closed` states — if the socket is already in a terminal state, the send is **skipped** and the connection is gracefully closed.
2. The `webSocket.send()` call is wrapped in a **try/catch** — synchronous exceptions (serialization errors, certain immediate write failures) are caught and trigger a graceful `connection.close()`.
3. `sendStateless` (lines 170-179) is a thin wrapper: it serializes the payload into an `OutgoingMessage` and calls `send`. It does NOT add its own error handling — it relies entirely on `send`'s existing checks.

**Implications:**

- A consumer-side `filter` parameter on `broadcastStateless` checking `readyState === OPEN` is **functionally redundant** with the built-in `send()` pre-check. Both would stop the write at the same boundary. The filter version terminates one layer higher (skips the payload allocation in `sendStateless`), but the observable behavior is the same for closed sockets.
- The try/catch catches **synchronous** exceptions only. Asynchronous errors emitted by the underlying TCP socket — such as EPIPE or ECONNRESET that fire after the `ws.send()` call has already returned control — are NOT caught here. They propagate to the raw socket's `'error'` event.
- This explains the observed behavior in consumer projects where EPIPE/ECONNRESET still appears in logs despite Hocuspocus's pre-filter: the race is below the userspace check level (see Evidence file B3 for TCP-level analysis).

---

### Finding B1-3: `WebSocketLike` is a minimal shape that always exposes readyState

**Confidence:** CONFIRMED
**Evidence:** `types.ts:55-59`

```ts
export interface WebSocketLike {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}
```

`readyState` is a required field on every WebSocket-like implementation Hocuspocus accepts, enforcing that any adapter (real `ws`, mocks, alternative transports) supports the pre-check in B1-2.

---

### Finding B1-4: `beforeBroadcastStateless` hook exists as a pre-broadcast extension point

**Confidence:** CONFIRMED
**Evidence:** `types.ts:102-104, 129, 154` + `Document.ts:242`

The hook type signature:
```ts
beforeBroadcastStateless?(
  data: beforeBroadcastStatelessPayload,
): Promise<any>;
```

With payload:
```ts
export interface beforeBroadcastStatelessPayload {
  document: Document;
  documentName: string;
  payload: string;
}
```

The hook fires **before** the connection iteration (`Document.ts:242`, inline call to `this.callbacks.beforeBroadcastStateless(this, payload)`). It does NOT receive the connection list and cannot filter — it's for interception/logging/audit, not for filtering recipients.

**Implications:** This hook is the right extension point for broadcast-level side effects (metrics, logging, rate limiting the outer broadcast). It is NOT a filter hook. Pre-filtering recipients happens via the `filter` callback on `broadcastStateless` itself (B1-1).

---

## Gaps / follow-ups

- **Confirmed:** The filter callback works per-connection and happens before the send loop.
- **Open:** How `sendStateless` interacts with `afterUnloadDocument` and document lifecycle during broadcast — e.g., what happens if a connection closes mid-broadcast (between filter and forEach)? Likely handled by the readyState pre-check in `send` (B1-2) since it runs synchronously inside the forEach.
- **Not investigated here (see B3):** The exact mechanism by which EPIPE is emitted asynchronously from `webSocket.send()` — this requires reading the `ws` library source + kernel TCP semantics. Covered in evidence file B3.
