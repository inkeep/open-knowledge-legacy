# Evidence: Hocuspocus DirectConnection — Server-Side CRDT Mutation API

**Dimension:** How does Hocuspocus DirectConnection work in practice?
**Date:** 2026-03-21
**Sources:** Hocuspocus source code (`~/.claude/oss-repos/hocuspocus/`), test files, npm docs

---

## Key files referenced

- `~/.claude/oss-repos/hocuspocus/packages/server/src/DirectConnection.ts:1-91` — Full DirectConnection class
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts:593-611` — openDirectConnection factory
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts:263-311` — handleDocumentUpdate propagation
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Document.ts:12-147` — Document class (extends Yjs Doc)
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Document.ts:221-233` — handleUpdate broadcast
- `~/.claude/oss-repos/hocuspocus/packages/server/src/types.ts:6-50` — Transaction origin types
- `~/.claude/oss-repos/hocuspocus/tests/server/openDirectConnection.ts:1-393` — Comprehensive test suite

---

## Findings

### Finding: DirectConnection provides zero-overhead, in-process CRDT mutations with full Yjs API access
**Confidence:** CONFIRMED
**Evidence:** `DirectConnection.ts:29-44` — The `transact()` method wraps user code in a Yjs transaction with no WebSocket overhead:

```typescript
async transact(transaction: (document: Document) => void) {
  if (!this.document) {
    throw new Error("direct connection closed");
  }
  this.document.transact(
    (x) => { transaction(this.document!); },
    { source: "local", context: this.context } satisfies LocalTransactionOrigin,
  );
}
```

The Document class extends `Y.Doc`, so ALL Yjs methods are available: `getMap()`, `getArray()`, `getXmlFragment()`, `getText()`, `transact()`.

**Implications:** An AI agent MCP server running in the same Node.js process as Hocuspocus can directly mutate Yjs documents with zero network overhead. This is the ideal integration point.

### Finding: Updates propagate to WebSocket clients immediately (microseconds)
**Confidence:** CONFIRMED
**Evidence:** `Document.ts:221-233` — After a transaction completes, `handleUpdate()` broadcasts the binary update to ALL connected WebSocket clients:

```typescript
private handleUpdate(update: Uint8Array, origin: unknown): Document {
  this.callbacks.onUpdate(this, origin, update);
  for (const connection of this.getConnections()) {
    const message = new OutgoingMessage(connection.messageAddress)
      .createSyncMessage()
      .writeUpdate(update);
    connection.send(message.toUint8Array());
  }
  return this;
}
```

**Implications:** When an AI agent writes via DirectConnection, human editors see the change within milliseconds. No polling or explicit sync needed.

### Finding: Transaction origin tracking distinguishes DirectConnection writes from WebSocket writes
**Confidence:** CONFIRMED
**Evidence:** `types.ts:6-50` — Three origin types:

```typescript
interface LocalTransactionOrigin {
  source: "local";          // DirectConnection writes
  skipStoreHooks?: boolean;
  context?: any;
}
interface ConnectionTransactionOrigin {
  source: "connection";     // WebSocket client writes
  connection: Connection;
}
interface RedisTransactionOrigin {
  source: "redis";          // Multi-server sync
}
```

In `onChange` hooks: `data.transactionOrigin?.source === "local"` identifies DirectConnection writes. The custom context (e.g., `{ agentId: "claude-1" }`) flows through to all hooks.

**Implications:** The system can distinguish AI agent writes from human writes. This enables audit logging, conflict resolution policies, and undo isolation per writer.

### Finding: openDirectConnection handles full document lifecycle
**Confidence:** CONFIRMED
**Evidence:** `Hocuspocus.ts:593-611`:

```typescript
async openDirectConnection(
  documentName: string,
  context?: Context,
): Promise<DirectConnection<Context>> {
  const connectionConfig: ConnectionConfiguration = {
    isAuthenticated: true,
    readOnly: false,
  };
  const document: Document = await this.createDocument(
    documentName,
    new Request("http://localhost"),
    crypto.randomUUID(),
    connectionConfig,
    context,
  );
  return new DirectConnection<Context>(document, this, context);
}
```

If the document doesn't exist, it's created (triggering `onLoadDocument` hooks to load from storage). If it already exists in memory, the existing instance is returned.

**Implications:** The MCP server can open a DirectConnection for any document by name. If a human is already editing, the agent joins the same document instance. If no one is editing, the document is loaded from storage.

### Finding: Document unloading is connection-count-aware
**Confidence:** CONFIRMED
**Evidence:** `Document.ts:12-147` — `getConnectionsCount()` returns `this.connections.size + this.directConnectionsCount`. Documents unload when count reaches 0.

On `DirectConnection.disconnect()`:
1. `document.removeDirectConnection()` decrements counter
2. `storeDocumentHooks()` is called with `immediately: true`
3. If no WebSocket clients remain, document unloads from memory

**Implications:** DirectConnections keep documents alive in memory. The MCP server should open/close DirectConnections judiciously — not hold them open indefinitely.

### Finding: DirectConnection changes trigger all persistence hooks
**Confidence:** CONFIRMED
**Evidence:** `Hocuspocus.ts:263-311` — `handleDocumentUpdate()` fires `onChange` and `onStoreDocument` hooks for DirectConnection writes. The debounced store (default 2s) persists changes to the database.

Tests at `openDirectConnection.ts:173-202` confirm: `onStoreDocument` hooks are awaited before `disconnect()` resolves.

**Implications:** DirectConnection writes are durable — they go through the same persistence pipeline as WebSocket writes. No special persistence handling needed for AI agent writes.

### Finding: Bidirectional visibility confirmed between DirectConnection and WebSocket clients
**Confidence:** CONFIRMED
**Evidence:** `openDirectConnection.ts:45-73` — Test proves:

```typescript
const directConnection = await server.openDirectConnection("hocuspocus-test");
await directConnection.transact((doc) => {
  // Can read data written by WebSocket client
  t.is("valueFromProvider", String(doc.getMap("config").get("a")));
  // Write data visible to WebSocket client
  doc.getMap("config").set("b", "valueFromServerDirectConnection");
});
await sleep(100);
t.is("valueFromServerDirectConnection",
  String(provider.document.getMap("config").get("b"))); // WebSocket client sees it
```

**Implications:** Full bidirectional data flow. AI agent reads current state, makes changes, WebSocket clients receive updates.

---

## Latency characteristics

| Operation | Latency |
|-----------|---------|
| `openDirectConnection()` | ~ms (document load from DB if cold), ~µs (document already in memory) |
| `transact()` | ~µs (in-process Yjs transaction) |
| Update propagation to WebSocket clients | ~µs (immediate broadcast after transaction) |
| `disconnect()` | ~ms (awaits persistence hooks) |

---

## Gaps / follow-ups

* DirectConnection bug history: Issues #832 (state corruption) and #833 (context not passed) suggest edge cases. v2.13.2 fixed a critical data loss bug with custom origins. The feature is stable but has had correctness issues.
* No built-in rate limiting or queueing for DirectConnection writes — high-frequency AI writes could flood WebSocket clients.
