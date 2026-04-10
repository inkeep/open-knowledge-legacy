# Evidence: Hocuspocus Document Lifecycle for File Watcher Integration

**Dimension:** Hocuspocus load/unload, force-loading documents, DirectConnection with active editors
**Date:** 2026-04-07
**Sources:** Hocuspocus v4 source (packages/server/src/Hocuspocus.ts, DirectConnection.ts, Document.ts, types.ts)

---

## Key files referenced

- `Hocuspocus.ts:593-611` -- openDirectConnection implementation
- `Hocuspocus.ts:316-357` -- createDocument (load-or-reuse logic)
- `Hocuspocus.ts:359-459` -- loadDocument (onLoadDocument hooks, update subscription)
- `Hocuspocus.ts:544-591` -- shouldUnloadDocument + unloadDocument
- `Hocuspocus.ts:228-254` -- handleConnection onClose (unload on last disconnect)
- `DirectConnection.ts:29-44` -- transact implementation
- `DirectConnection.ts:46-89` -- disconnect and document unload logic
- `Document.ts:29-37` -- directConnectionsCount tracking

---

## Findings

### Finding: openDirectConnection force-loads a document even if no WebSocket clients are connected
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:593-611

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

`createDocument` either returns an existing document (if already in memory) or loads it fresh via `loadDocument`. The `loadDocument` path runs the full `onLoadDocument` hook chain (line 398-408), including our persistence extension that reads the .md file from disk.

**Implications for file watcher:** When the watcher detects a file change for a document that NO browser client has open, we can call `openDirectConnection(documentName)` to force-load it, apply the changes, then `disconnect()`. This triggers the full document lifecycle: load from disk, apply watcher changes, persist (if not using skipStoreHooks), then unload.

---

### Finding: Documents unload when all connections (WebSocket + DirectConnection) reach zero
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:544-551, DirectConnection.ts:66-88

```typescript
// Hocuspocus.ts
shouldUnloadDocument(document: Document): boolean {
  const hasPendingWork =
    this.debouncer.isDebounced(`onStoreDocument-${document.name}`) ||
    this.debouncer.isCurrentlyExecuting(`onStoreDocument-${document.name}`) ||
    document.saveMutex.isLocked();
  return hasPendingWork === false && document.getConnectionsCount() === 0;
}
```

```typescript
// Document.ts
getConnectionsCount(): number {
  return this.connections.size + this.directConnectionsCount;
}
```

Connection count includes BOTH WebSocket connections (`connections.size`) and DirectConnections (`directConnectionsCount`). A document stays in memory as long as either type is connected.

DirectConnection.disconnect() (line 66-88):
1. Decrements `directConnectionsCount`
2. Forces immediate store via `storeDocumentHooks(document, ..., true)` 
3. If `getConnectionsCount() === 0` and `saveMutex` is not locked: fires `onDisconnect` hook and calls `unloadDocument`

**Implications for file watcher:** 
- If a document is being actively edited (WebSocket clients), the DirectConnection adds to the count but does NOT unload on disconnect (WebSocket connections remain).
- If no WebSocket clients are connected, the DirectConnection disconnect will trigger full unload.
- We can keep a long-lived DirectConnection pool for documents the watcher is actively monitoring, or use ephemeral open-transact-disconnect for each watcher event.

---

### Finding: Opening a DirectConnection to an actively-edited document shares the same Y.Doc instance
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:316-336

```typescript
public async createDocument(documentName, request, socketId, connection, context): Promise<Document> {
  // ...
  const existingDoc = this.documents.get(documentName);
  if (existingDoc) {
    return Promise.resolve(existingDoc);  // Returns the SAME document instance
  }
  // ...load new document...
}
```

When the watcher opens a DirectConnection to a document that's being edited by a browser client, it gets the SAME Y.Doc instance. This means:
- Watcher writes propagate to WebSocket clients immediately (same event loop tick)
- The watcher reads the current CRDT state including all pending browser edits
- No separate document or sync step is needed

**Implications:** This is ideal. The watcher can read the current CRDT state to compare with disk content, then apply only the delta. There's no stale-data risk from the read.

---

### Finding: DirectConnection transact uses LocalTransactionOrigin, distinguishable from WebSocket writes
**Confidence:** CONFIRMED
**Evidence:** DirectConnection.ts:29-44

```typescript
async transact(transaction: (document: Document) => void) {
  if (!this.document) {
    throw new Error("direct connection closed");
  }
  this.document.transact(
    (x) => {
      transaction(this.document!);
    },
    {
      source: "local",
      context: this.context,
    } satisfies LocalTransactionOrigin,
  );
}
```

The custom `context` field flows through to all hooks. Combined with `skipStoreHooks`:

```typescript
// Custom transact with skipStoreHooks
this.document.transact(
  (x) => { transaction(this.document!); },
  {
    source: "local",
    skipStoreHooks: true,
    context: { origin: 'file-watcher' },
  } satisfies LocalTransactionOrigin,
);
```

However, `DirectConnection.transact()` does NOT support passing a custom origin -- it always uses `{ source: "local", context: this.context }`. To use `skipStoreHooks`, we need to either:
1. Call `document.transact()` directly (bypassing the DirectConnection wrapper)
2. Set `skipStoreHooks` in the context passed to `openDirectConnection`

Option 1 is cleaner. After `openDirectConnection`, access `conn.document` and call `document.transact()` with the desired origin.

---

### Finding: Connection pooling for the file watcher should use ephemeral connections with careful disconnect timing
**Confidence:** INFERRED
**Evidence:** Architecture analysis of document lifecycle

Two strategies:

**Strategy A: Ephemeral (open-transact-disconnect per event)**
```
Watcher event -> openDirectConnection -> transact -> disconnect
```
Pros: Simple, no connection management
Cons: For documents with NO WebSocket clients, each event triggers full load-process-unload cycle (including onLoadDocument reading the file from disk that we're trying to sync -- circular)

**Strategy B: Long-lived pool**
```
Watcher event -> pool.get(docName) -> transact (keep alive)
Periodic cleanup: disconnect idle connections
```
Pros: Documents stay in memory, no redundant load/unload
Cons: Memory usage for documents not being actively edited

**Strategy C: Piggyback on existing documents + ephemeral for new ones**
```
If document is in hocuspocus.documents map: use it directly
Else: skip (no one is editing this document, changes will be picked up on next load)
```
Pros: No extra memory, no circular loading
Cons: External changes to unopened documents are deferred

Strategy C is recommended as the starting point. If a document is open in the browser, its Y.Doc is already in memory. The watcher can transact on it directly. If no one has the document open, the watcher event can be ignored -- the changes will be loaded from disk when someone opens the document.

---

### Finding: The unloadImmediately flag controls post-disconnect behavior
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:228-250, types.ts:195-201

```typescript
// Default: unloadImmediately = true
if (this.configuration.unloadImmediately) {
  this.debouncer.executeNow(`onStoreDocument-${document.name}`);
} else {
  // Respects debounce time before unloading
}
```

With `unloadImmediately: true` (default), documents are stored and unloaded as soon as the last connection drops. With `false`, the debounce timer is respected, which means the document stays in memory for up to `maxDebounce` ms after the last disconnect.

Setting `unloadImmediately: false` could help the file watcher scenario: a document that loses its last WebSocket client stays in memory briefly, giving the watcher a window to apply changes before unload.

---

## Gaps / follow-ups

* The DirectConnection.transact method does not expose skipStoreHooks. To use it, we need to access the underlying document directly. This is a minor API gap that could be addressed upstream.
* Strategy C (piggyback on existing documents) means external changes to closed documents are deferred. If real-time sync for closed documents is required, Strategy B (connection pool) is needed, but it adds memory overhead and the circular loading problem.
