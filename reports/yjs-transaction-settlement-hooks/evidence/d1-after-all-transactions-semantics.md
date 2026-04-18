# Evidence: D1 — `afterAllTransactions` precise firing semantics

**Dimension:** D1 — `afterAllTransactions` precise firing semantics (source-traced from Transaction.js / Doc.js)
**Date:** 2026-04-16
**Sources:**
- `node_modules/yjs/src/utils/Transaction.js` (yjs 13.6.30, pinned via `^13.6.30` in `packages/server/package.json`)
- `node_modules/yjs/src/utils/Doc.js`
- `node_modules/yjs/dist/src/utils/Doc.d.ts`
- `node_modules/lib0/observable.js` (event emitter backing `Doc.emit` / `Doc.on`)
- https://github.com/yjs/yjs/blob/main/src/utils/Transaction.js (cross-check against main)
- https://docs.yjs.dev/api/y.doc (official Y.Doc event docs)
- https://beta.yjs.dev/docs/api/transactions/ (beta transactions docs)
- https://discuss.yjs.dev/t/whats-the-difference-between-beforealltransactions-and-beforetransaction/614 (community discussion citing internal docs)

---

## Key files / locations referenced

- `node_modules/yjs/src/utils/Transaction.js:412-448` — `transact()` entry point; how a new transaction is created, how the cleanup queue accumulates, and when cleanup is dispatched.
- `node_modules/yjs/src/utils/Transaction.js:260-399` — `cleanupTransactions()` recursive-drain implementation; where `afterTransaction` and `afterAllTransactions` are emitted.
- `node_modules/yjs/src/utils/Transaction.js:391-396` — the tail of `cleanupTransactions` that emits `afterAllTransactions` once the queue is empty, or recurses to the next queued transaction otherwise.
- `node_modules/yjs/src/utils/Doc.js:43-50` — `DocEvents` JSDoc typedef listing all six transaction-lifecycle events.
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` — generated TypeScript type for `DocEvents`.
- `node_modules/lib0/observable.js:80-83` — `ObservableV2.emit` implementation; event dispatch is **synchronous** (`forEach(f => f(...args))`).

---

## Findings

### Finding 1.1: `afterAllTransactions` fires AFTER the outermost transaction's `transact()` call has drained every queued transaction, emitted synchronously.

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/Transaction.js:391-396`

```js
      if (transactionCleanups.length <= i + 1) {
        doc._transactionCleanups = []
        doc.emit('afterAllTransactions', [doc, transactionCleanups])
      } else {
        cleanupTransactions(transactionCleanups, i + 1)
      }
```

**Call chain:**
1. User calls `doc.transact(f, origin)`. That forwards to the `transact()` helper (`Transaction.js:412`).
2. If `doc._transaction === null`, this is the **initial call** — `_transaction` is set, the transaction is pushed onto `doc._transactionCleanups`, and if this is the first entry the `beforeAllTransactions` event fires (`Transaction.js:423-425`).
3. `f(doc._transaction)` runs synchronously. Any `doc.transact(...)` calls inside `f` see `doc._transaction !== null` and become no-op wrappers that share the same `Transaction` object (they do NOT push another entry onto `_transactionCleanups`).
4. When `f` returns, the `finally` block runs. Because `initialCall === true` and `_transaction === transactionCleanups[0]`, `cleanupTransactions(transactionCleanups, 0)` is invoked.
5. `cleanupTransactions` drains the queue. For each entry it runs observer calls (including `observe` / `observeDeep` callbacks), emits `afterTransaction`, then — critically — inside its `finally` block, checks whether any *new* transactions were pushed during observer callbacks.
6. If `transactionCleanups.length <= i + 1` (no new transactions queued), `afterAllTransactions` fires and the queue is reset to `[]`. Otherwise `cleanupTransactions` recurses to process entry `i + 1`.

**Implications:**
- One `afterAllTransactions` per **outermost** `doc.transact()` call **at minimum**.
- If observer callbacks call `doc.transact()` recursively, the newly-created transactions are enqueued and drained BEFORE `afterAllTransactions` fires. So `afterAllTransactions` fires **once per drain cycle**, not per-transaction, and is the correct hook for "everything has fully settled, observers have run, sub-transactions have run, CRDT state is consistent."
- `afterAllTransactions` receives `(doc, transactions: Transaction[])` — the full batch of transactions that ran inside the drain. You can inspect origins, `local` flags, and `changed` sets for each.

---

### Finding 1.2: The emit is synchronous — no microtask, no setTimeout.

**Confidence:** CONFIRMED
**Evidence:** `node_modules/lib0/observable.js:80-83`

```js
  emit (name, args) {
    // copy all listeners to an array first to make sure that no event is emitted to listeners that are subscribed while the event handler is called.
    return array.from((this._observers.get(name) || map.create()).values()).forEach(f => f(...args))
  }
```

`Doc` extends `ObservableV2` (`Doc.js:56`). Every `doc.emit(...)` call iterates the listener set and calls each function synchronously in a `forEach`. There is no `queueMicrotask`, `Promise.resolve().then(...)`, or `setTimeout` wrapping. The callback runs on the same call stack that invoked `doc.transact(f, ...)`, immediately after the last observer has returned.

**Implications:**
- `afterAllTransactions` runs **inside** the `finally` block of `cleanupTransactions`, which itself runs inside the `finally` block of `transact()`. The original caller's `await doc.transact(...)` (or the synchronous return) completes only *after* your `afterAllTransactions` listener has returned.
- This is a strictly stronger guarantee than `setTimeout(fn, 50)`: settlement is observed **in the same event-loop tick** as the transaction, with no risk of a second concurrent mutation landing between "settlement" and "callback."
- If your listener throws, the exception propagates up through `transact()` into user code (no try/catch around the emit). The code comment above notes "This should catch exceptions" as a `@todo` — current behavior is uncaught.

---

### Finding 1.3: The `transactions` argument contains every transaction that ran in the drain cycle, including ones created inside observer callbacks.

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/Transaction.js:393` + `Transaction.js:419-425`

```js
// Line 419-425 (transact entry, on initial call):
if (doc._transaction === null) {
  initialCall = true
  doc._transaction = new Transaction(doc, origin, local)
  transactionCleanups.push(doc._transaction)
  if (transactionCleanups.length === 1) {
    doc.emit('beforeAllTransactions', [doc])
  }

// Line 393 (afterAllTransactions emit):
doc.emit('afterAllTransactions', [doc, transactionCleanups])
```

The `transactionCleanups` array is the same object shared between the outermost `transact()` call and every observer-triggered re-entrant `transact()`. The `else` branch at `Transaction.js:394-395` recurses with `i + 1`, meaning the cleanup loop processes newly-enqueued transactions in order. By the time `afterAllTransactions` fires, the array contains all transactions processed in this drain.

**Implications:**
- Inside an `afterAllTransactions` handler you can iterate `transactions` and distinguish origins (e.g., "was there an agent write in this batch?"), `local` flags, and per-transaction `changed` sets — useful for deciding whether a derived cross-CRDT sync is needed.
- Note that `_transactionCleanups` is reset to `[]` *before* `afterAllTransactions` fires (line 392). The array passed to the handler is the *old* drained array; `doc._transactionCleanups` is already a fresh empty array. So if your handler calls `doc.transact(...)` it will start a new drain cycle (see D5).

---

### Finding 1.4: `afterAllTransactions` is undocumented in the official stable docs, but is a stable public API in TypeScript definitions.

**Confidence:** CONFIRMED
**Evidence:**
- https://docs.yjs.dev/api/y.doc — the official Y.Doc page documents `beforeTransaction`, `beforeObserverCalls`, `afterTransaction`, `update` — but does NOT document `beforeAllTransactions`, `afterTransactionCleanup`, or `afterAllTransactions`.
- https://beta.yjs.dev/docs/api/transactions/ (beta docs) — same omission; no mention of the `*All*` variants.
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` — the generated TypeScript `DocEvents` type lists all six hooks with typed signatures.
- Community discussion: https://discuss.yjs.dev/t/whats-the-difference-between-beforealltransactions-and-beforetransaction/614 quotes an unofficial doc as: *"beforeTransaction: Emitted before each transaction. beforeAllTransactions: Transactions can be nested (e.g. when an event within a transaction calls another transaction). Emitted before the first transaction."*

**Implications:**
- The API is shipped in the TypeScript types and typed-event surface, so consumers can rely on it without unsafe casts. It is not marked `@deprecated` or `@internal` anywhere in 13.6.30.
- The undocumented status is a **risk vector**: behavioral changes across minor versions are less likely to be announced in a CHANGELOG or migration guide. Cross-reference D6 for version stability.
- Prior art (y-prosemirror) uses the hook, so any breaking change would ripple through the ecosystem and become visible quickly.

---

### Finding 1.5: One inbound update message = one outermost transaction; `afterAllTransactions` fires once per inbound message (except when pending structs trigger a re-application — see D3).

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/encoding.js:382-462`

```js
// readUpdateV2 (lines 382-449):
export const readUpdateV2 = (decoder, ydoc, transactionOrigin, structDecoder = new UpdateDecoderV2(decoder)) =>
  transact(ydoc, transaction => {
    // force that transaction.local is set to non-local
    transaction.local = false
    // ... read structs, integrate missing deletes, etc.
    if (store.pendingStructs != null && store.pendingStructs.missingSV.size === 0) {
      // All missing structs have been integrated and we can continue processing
      const update = store.pendingStructs.update
      store.pendingStructs = null
      applyUpdateV2(transaction.doc, update)   // <-- nested applyUpdateV2 → another transact call
    }
  }, transactionOrigin, false)

// readUpdate wraps readUpdateV2 with V1 decoder (line 462):
export const readUpdate = (decoder, ydoc, transactionOrigin) => readUpdateV2(decoder, ydoc, transactionOrigin, new UpdateDecoderV1(decoder))
```

`readUpdate` / `applyUpdate` wraps the entire update application in **one** outer `transact(ydoc, fn, origin, false)`. The `local=false` flag is forced. Observer callbacks inside `cleanupTransactions` will see `transaction.local === false` and `transaction.origin === transactionOrigin` (whatever Hocuspocus passed in).

The exception is the recursive `applyUpdateV2` call on line 447: if an arriving update references structs not yet present (pendingStructs buffer), yjs queues them and re-applies once integrations complete. That recursive call creates a **second** outer transaction when its own drain completes, which would fire a second `afterAllTransactions`.

**Implications:**
- For the vast majority of inbound messages (no pendingStructs), one WebSocket `messageYjsUpdate` = one `afterAllTransactions` fire. Your handler sees a single batch covering all merges bundled in that message.
- For late-arriving updates that reference forward structs, you may see **two** `afterAllTransactions` fires — one for the partial apply, one for the resolution. Consumers must be idempotent across this case (reading current state, not accumulating diffs).

---

## Negative searches

- Searched: `afterAllTransactions` in `https://docs.yjs.dev/` sitemap → NOT FOUND (event is undocumented).
- Searched: `INTERNALS.md` at https://github.com/yjs/yjs/blob/main/INTERNALS.md → NOT FOUND (no mention of any transaction lifecycle event).
- Searched: `queueMicrotask` / `setTimeout` / `Promise.resolve` inside `cleanupTransactions` → NOT FOUND (emit is fully synchronous).

---

## Gaps / follow-ups

- **Version history of `afterAllTransactions`:** The yjs `CHANGELOG.md` is not shipped with the npm tarball (confirmed: root of package only contains `LICENSE`, `README.md`, `package.json`, `src/`, `dist/`, `tests/`). Version introduction would require a `git log --oneline -- src/utils/Transaction.js | rg afterAllTransactions` on the upstream repo. Cross-reference D6.
- **Throw behavior:** The `@todo This should catch exceptions` comment (lib0 observable.js:74) means a throwing listener aborts the remaining listeners and propagates to user code. Consumers must wrap their listener body in try/catch if they care about other listeners running. Not explored further here since the bridge observer is the sole relevant consumer in-scope.
