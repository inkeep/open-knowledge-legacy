# Evidence: D3 — Hocuspocus WebSocket update ingestion (one transaction per message?)

**Dimension:** D3 — WebSocket sync integration: does one inbound message yield one transaction, or N?
**Date:** 2026-04-16
**Sources:**
- `node_modules/@hocuspocus/server/src/Connection.ts:227-276` (per-connection message queue)
- `node_modules/@hocuspocus/server/src/MessageReceiver.ts:33-236` (message dispatch + sync handling)
- `node_modules/@hocuspocus/server/src/DirectConnection.ts:29-44` (server-side direct write path)
- `node_modules/@hocuspocus/server/src/Document.ts:42-56` (Document extends Y.Doc)
- `node_modules/@hocuspocus/server/package.json` — `"version": "4.0.0-rc.1"`
- `node_modules/y-protocols/sync.js:80-94, 106-110` (`readSyncStep2` / `readUpdate` definitions)
- `node_modules/yjs/src/utils/encoding.js:382-449` (`readUpdateV2` — wraps in single `transact`)

---

## Key files / locations referenced

- `Connection.ts:231-237` — `handleMessage(data)` pushes to `messageQueue`; the queue is drained sequentially via `processMessages()`, which awaits each `MessageReceiver.apply` before processing the next.
- `Connection.ts:239-275` — `processMessages()` strict serial loop: `messageQueue.at(0)` → `new MessageReceiver(message)` → `await receiver.apply(this.document, this)` → `messageQueue.shift()`.
- `MessageReceiver.ts:42-123` — `apply()` switches on message type; routes Sync messages to `readSyncMessage`.
- `MessageReceiver.ts:205-229` — `messageYjsUpdate` branch reads via `readUpdate(message.decoder, document, ...)`.
- `y-protocols/sync.js:106-110` — `readUpdate` is an alias for `readSyncStep2`.
- `y-protocols/sync.js:80-94` — `readSyncStep2` calls `Y.applyUpdate(doc, decoding.readVarUint8Array(decoder), transactionOrigin)`.
- `yjs/src/utils/encoding.js:382-449` — `readUpdateV2` wraps the entire update integration in **one** `transact(ydoc, fn, origin, false)` call.
- `DirectConnection.ts:29-44` — server-initiated `transact()` calls (used by our `setupServerObservers`, `applyAgentMarkdownWrite`, `applyExternalChange`) all forward to `document.transact(fn, { source: 'local', context, ... })`.

---

## Findings

### Finding 3.1: One inbound `messageYjsUpdate` WebSocket message = exactly one outermost Yjs transaction.

**Confidence:** CONFIRMED
**Evidence:**

Trace from inbound bytes to `transact()`:

1. `Connection.handleMessage(data)` (line 231) pushes the raw `Uint8Array` onto `messageQueue` and starts `processMessages()` if the queue was empty.

2. `processMessages()` (line 239) is a serial drain:
   ```ts
   while (this.messageQueue.length > 0) {
     const rawUpdate = this.messageQueue.at(0) as Uint8Array;
     // ... [parse address, validate documentName] ...
     const receiver = new MessageReceiver(message);
     await receiver.apply(this.document, this);
     this.messageQueue.shift();
   }
   ```
   `await receiver.apply(...)` ensures the outer `transact(...)` from `applyUpdate` completes (synchronously, since the body of `applyUpdate` doesn't `await`) before the next message is processed.

3. `MessageReceiver.apply()` for `MessageType.Sync` calls `readSyncMessage(...)` (line 46), which for `messageYjsUpdate` (line 205-228) calls:
   ```ts
   readUpdate(
     message.decoder,
     document,
     connection ? { source: "connection" as const, connection } : ...
   );
   ```

4. `y-protocols/sync.readUpdate` (alias for `readSyncStep2`, line 109) calls `Y.applyUpdate(doc, decoding.readVarUint8Array(decoder), transactionOrigin)`.

5. `yjs/src/utils/encoding.applyUpdate` (line 492) calls `applyUpdateV2(ydoc, update, transactionOrigin, UpdateDecoderV1)`, which calls `readUpdateV2(decoder, ydoc, transactionOrigin, new YDecoder(decoder))`.

6. `readUpdateV2` (line 382) wraps the entire integration in:
   ```js
   transact(ydoc, transaction => {
     transaction.local = false      // forces local=false for remote updates
     // ... read structs, integrate, ...
   }, transactionOrigin, false)
   ```

So **one WebSocket update message = one outermost `transact()` call = one `afterAllTransactions` fire** (in the common case — see Finding 3.4 for the pendingStructs exception).

**Implications:**
- A single inbound message carrying merged updates from N peers (or N edits batched by one peer's batching provider) still produces **one** `afterAllTransactions` fire. That fire's `transactions` argument has length 1 (the outer transaction), and the embedded changes are visible via `transaction.changed`, `transaction.deleteSet`, etc.
- This is GOOD for cross-CRDT bridge semantics: we react to the "settled" state of the entire merge, not per-update.

---

### Finding 3.2: The Connection's `messageQueue` is per-connection, sequential. Multiple connections send concurrently to the same Y.Doc.

**Confidence:** CONFIRMED
**Evidence:** `Connection.ts:231-275`

```ts
public handleMessage(data: Uint8Array): void {
  this.messageQueue.push(data);
  if (this.messageQueue.length === 1) {
    this.processingPromise = this.processMessages();
  }
}

private async processMessages() {
  while (this.messageQueue.length > 0) {
    // ... await receiver.apply(this.document, this);
    this.messageQueue.shift();
  }
}
```

Each `Connection` has its own queue. There is **no global serialization across connections**. Two clients can each have a `processMessages` loop running concurrently. Both eventually call `Y.applyUpdate(this.document, ...)`, which calls `transact(this.document, ...)` on the shared `Document` (which extends `Doc`).

`Doc._transaction` and `Doc._transactionCleanups` are singletons per Y.Doc. JavaScript / Node.js / Bun event loop is single-threaded, so any `transact()` call runs to completion (including its synchronous cleanup drain) before the next is dispatched. **There is no preemption mid-transaction.**

Concretely: if Connection A's `processMessages` is blocked on `await receiver.apply(...)` (which itself is a sync chain ending in `applyUpdate` → `transact`), Connection B's queued `processMessages` cannot interrupt the synchronous body. B's apply only runs once A's microtask queue resumes — by which time A's `transact()` has already fired its `afterAllTransactions`.

**Implications:**
- Cross-connection serialization is **implicit** via the Node.js event loop. No mutex needed.
- An `afterAllTransactions` listener can rely on the doc's state being internally consistent for THE transaction it just observed, even though other connections may have queued updates waiting.
- Burst write scenarios (e.g., 5 clients all typing) produce 5 sequential `afterAllTransactions` fires, one per inbound message. Coalescing across them (if desired) is the consumer's responsibility.

---

### Finding 3.3: Server-initiated writes (DirectConnection.transact) use `document.transact(fn, origin)` directly — same Y.Doc transact path.

**Confidence:** CONFIRMED
**Evidence:** `DirectConnection.ts:29-44`

```ts
async transact(transaction: (document: Document) => void) {
  if (!this.document) throw new Error("direct connection closed");
  this.document.transact(
    (x) => { transaction(this.document!); },
    {
      source: "local",
      context: this.context,
    } satisfies LocalTransactionOrigin,
  );
}
```

`Document` extends `Y.Doc` (`Document.ts:12`), so `document.transact(...)` IS `Doc.transact(...)`. The origin object is shaped as `LocalTransactionOrigin` per Hocuspocus's typed contract, with `source: 'local'`.

Open Knowledge's bridge code uses this path for `applyAgentMarkdownWrite`, `applyExternalChange`, and the server observer's own writes (`server-observers.ts:166, 250, 303, 335`). All three paths trigger the standard `transact()` → `cleanupTransactions` → `afterAllTransactions` flow.

**Implications:**
- `afterAllTransactions` fires for **both** inbound WebSocket updates (`local=false`) and server-side direct writes (`local=true`) on the same Y.Doc.
- The handler can distinguish via `transaction.local` and `transaction.origin` (e.g., to skip self-writes by `OBSERVER_SYNC_ORIGIN`).

---

### Finding 3.4: Pending-structs case can produce TWO `afterAllTransactions` for one message.

**Confidence:** CONFIRMED
**Evidence:** `yjs/src/utils/encoding.js:444-449`

```js
if (store.pendingStructs != null && store.pendingStructs.missingSV.size === 0) {
  // All missing structs have been integrated and we can continue processing
  const update = /** @type {{update: Uint8Array}} */ (store.pendingStructs).update
  store.pendingStructs = null
  applyUpdateV2(transaction.doc, update)
}
```

If the inbound update references structs (Items) not yet present in the local store — e.g., a client sends an update referencing a remote insertion that hasn't arrived yet — yjs buffers the partial update in `store.pendingStructs`. When the missing structs arrive (in a later message or in this same message after deletes are processed), the recursive `applyUpdateV2` call inside the OUTER `transact`'s body creates a NEW outermost `transact()` (because it's called after the outer `f` has returned conceptually — actually it's called inside `f`, but its own `transact` body integrates a separate update).

Wait — `applyUpdateV2` is called **inside** the outer transact's `f` function. So per the nesting rules in D5, the inner `applyUpdateV2`'s `transact()` is a NESTED call: it doesn't push a new entry onto `_transactionCleanups`, it doesn't fire `beforeAllTransactions`, and it doesn't fire its own `afterAllTransactions`.

Re-reading `Transaction.js:419-427`: the inner `transact` finds `doc._transaction !== null`, sets `initialCall = false`, and just runs `f(doc._transaction)` against the existing transaction. The inner `applyUpdateV2`'s mutations get folded into the OUTER transaction. **Only one `afterAllTransactions` fires.**

So Finding 3.4 is REVISED:

**Confidence:** REVISED → CONFIRMED that pendingStructs does NOT produce extra `afterAllTransactions` fires.

The pendingStructs integration runs inside the outer `transact`'s body (`f`), so it's reentrant and absorbed into the existing transaction. `afterAllTransactions` still fires exactly once per outermost `applyUpdate` call.

However, if structs are **still missing** after the integration attempt (the buffered update remains in `store.pendingStructs` waiting for a future message), then a SUBSEQUENT inbound message that fills the gap will fire its own `applyUpdate` → its own outer `transact` → its own `afterAllTransactions`. From the consumer's standpoint, this is "two settlements over two messages" — which is correct: the doc IS in two distinct settled states across two messages.

**Implications:**
- One message → one `afterAllTransactions` always holds for the message-receive path.
- Late-arriving structs don't add complexity to the consumer; they just fire another settlement when the gap fills.

---

### Finding 3.5: Hocuspocus's broadcast path (`Hocuspocus.handleUpdate` → broadcast to other peers) does NOT go through Y.applyUpdate on the broadcasting doc — it just emits an outbound message.

**Confidence:** CONFIRMED (relevant for confirming our `local=false` semantics)
**Evidence:** `Document.ts:53` registers `this.on("update", this.handleUpdate.bind(this))`. The `update` event fires inside `cleanupTransactions` (Transaction.js:367) AFTER `afterTransaction` and `afterTransactionCleanup`. Hocuspocus's `handleUpdate` then schedules outbound messages to other connections.

This means the outbound broadcast is triggered AFTER per-transaction cleanup but BEFORE `afterAllTransactions`. So if your `afterAllTransactions` listener writes to the Y.Doc, the resulting `update` event for that listener's mutations will fire via the next iteration of the cleanup loop (since the listener's `transact()` enqueues a new transaction).

**Implications:**
- Outbound broadcasts of the bridge's cross-CRDT writes happen as part of the same drain — clients receive both the original mutation and the bridge's derived mutation in close sequence.

---

## Negative searches

- Searched: any "batch incoming messages" or "coalesce" logic in `Connection.ts` or `MessageReceiver.ts` → NOT FOUND. The serial queue is the only batching mechanism, and it's sequential, not coalescing.
- Searched: any global `Hocuspocus`-level lock around `Document.transact` → NOT FOUND. `saveMutex` exists on `Document` but is for persistence, not for transaction serialization.

---

## Gaps / follow-ups

- The y-websocket / HocuspocusProvider client-side may batch multiple local edits into a single outbound message if the WebSocket buffer pressure permits. This is provider-level batching invisible to the server's settlement reactor — it just sees one inbound message with merged changes. Not in scope for this report.
