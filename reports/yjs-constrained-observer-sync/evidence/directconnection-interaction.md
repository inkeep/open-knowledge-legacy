# Evidence: Hocuspocus DirectConnection Interaction

**Dimension:** D7 — DirectConnection writes triggering observeDeep
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/hocuspocus/packages/server/src/DirectConnection.ts, Document.ts, Hocuspocus.ts, yjs/src/utils/Transaction.js

---

## Key files referenced

- `hocuspocus/packages/server/src/DirectConnection.ts:29-43` — transact() method
- `hocuspocus/packages/server/src/Document.ts:12,53` — Document extends Doc, update handler
- `hocuspocus/packages/server/src/types.ts:16-19` — LocalTransactionOrigin type
- `yjs/src/utils/Transaction.js:635-666` — transact() function

---

## Findings

### Finding: DirectConnection.transact() creates a Yjs transaction with a LocalTransactionOrigin
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/DirectConnection.ts:29-43

```ts
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

The transaction origin is `{ source: "local", context: this.context }`. This is an object, not a string. It calls `this.document.transact()` which calls `Y.Doc.transact()` (since Document extends Doc).

**Implications:** The transaction origin from DirectConnection is `{ source: "local", ... }`. This is NOT the same as:
- y-codemirror.next's `YSyncConfig` instance
- y-prosemirror's origin (it uses its own mutex-based approach)
- Our observer origin (e.g., string `'xmlfragment-to-text-sync'`)

So DirectConnection writes are treated as "remote" by all bindings, which is correct — they should trigger observer updates.

---

### Finding: DirectConnection.transact() triggers observeDeep on the modified types
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:500-542

The `transact()` function (Transaction.js:635) creates a transaction, runs the callback, then calls `cleanupTransactions()`. During cleanup:

1. `transaction.changed` maps modified types to their changed keys (line 520)
2. `_callObserver` is called for each changed type (line 522)
3. `changedParentTypes` propagates events up for `observeDeep` handlers (line 529)

Since DirectConnection calls `document.transact()`, any changes made inside the callback (e.g., modifying Y.XmlFragment) will trigger:
- `observe()` on the directly modified types
- `observeDeep()` on parent types (including the root Y.XmlFragment)

**Implications:** Our observer pattern works with DirectConnection writes. When an agent writes to Y.XmlFragment via DirectConnection, the `observeDeep` observer fires, serializes to markdown, and writes to Y.Text. This keeps Y.Text in sync with agent-initiated changes.

---

### Finding: DirectConnection can open and close rapidly without missing updates
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/DirectConnection.ts:22-27, 46-89

```ts
constructor(document: Document, instance: Hocuspocus, context?: Context) {
    this.document = document;
    this.instance = instance;
    this.context = (context ?? {}) as Context;
    this.document.addDirectConnection();
}
```

`addDirectConnection()` simply increments a counter (Document.ts:136). It does NOT set up any special subscription or state. The `transact()` method is synchronous — it calls `document.transact()` directly.

```ts
async disconnect() {
    if (this.document) {
        this.document?.removeDirectConnection();
        await this.instance.storeDocumentHooks(...);
        // ...
    }
}
```

`disconnect()` decrements the counter and triggers store hooks. There is no cleanup of Yjs state — the Y.Doc persists.

**Implications:** Rapid open/close of DirectConnection has no timing issues because:
1. `transact()` is synchronous — changes are applied immediately
2. Observers fire synchronously after the transaction
3. The connection lifecycle (addDirectConnection/removeDirectConnection) is a simple counter
4. Store hooks are debounced by Hocuspocus (default 2000ms with 10000ms max)

The only potential issue is if `disconnect()` triggers `unloadDocument()` (when connection count reaches 0), which would destroy the Y.Doc. But if there are active WebSocket connections (users with the document open), the connection count won't reach 0.

---

### Finding: DirectConnection writes trigger the same update broadcast as WebSocket edits
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/Document.ts:221-231, Hocuspocus.ts:263-310

```ts
// Document.ts — registered in constructor via this.on("update", ...)
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

The `update` event fires for ALL transactions, regardless of origin. This includes DirectConnection transactions. The update is broadcast to all connected WebSocket clients.

Hocuspocus.ts:263-310 then handles the update via `handleDocumentUpdate()`, which calls `onChange` hooks and (unless `shouldSkipStoreHooks`) triggers `onStoreDocument`.

For DirectConnection with `{ source: "local" }` origin, `shouldSkipStoreHooks` returns false (types.ts:40-48), so store hooks DO fire.

**Implications:** DirectConnection writes are fully integrated:
1. Y.XmlFragment is modified
2. Our observer fires, updates Y.Text
3. The Y.Doc 'update' event fires (includes both XmlFragment and Text changes)
4. Update is broadcast to WebSocket clients
5. onChange hooks fire
6. onStoreDocument hooks fire (debounced)

The only caveat: our observer creates a nested transaction (T2) inside the observer callback from T1. Both T1 and T2 produce update events. Hocuspocus broadcasts both. Clients receive both updates. This is correct behavior — clients will have both the XmlFragment change and the Text change applied.

---

### Finding: Multiple rapid DirectConnection.transact() calls batch efficiently
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:635-643

```js
if (doc._transaction === null) {
    initialCall = true
    doc._transaction = new Transaction(doc, origin, local)
```

If multiple `directConnection.transact()` calls happen synchronously (in the same microtask), each creates its own transaction. However, observers only fire after each transaction completes. For our observer, this means:
- Each DirectConnection.transact() → observer fires → Y.Text serialization
- N rapid calls → N serializations

If the agent makes 10 rapid writes, we get 10 observer fires and 10 full serializations.

**Implications:** For agent workflows that make many rapid writes (e.g., streaming content), consider debouncing the observer (200-500ms) even when not in source mode. This reduces unnecessary intermediate serializations while still converging to the correct final state.

---

## Gaps / follow-ups

- If the agent uses a single large transaction (e.g., wrapping 10 changes in one `directConnection.transact()`), only one observer fire occurs — this is the recommended pattern for agent writes
- Need to verify timing with Hocuspocus debounce for onStoreDocument (2000ms default) — our Y.Text write creates additional update events that reset the debounce timer
