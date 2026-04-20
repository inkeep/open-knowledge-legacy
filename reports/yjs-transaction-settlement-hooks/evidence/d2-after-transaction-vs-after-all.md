# Evidence: D2 — `afterTransaction` vs `afterAllTransactions`

**Dimension:** D2 — `afterTransaction` vs `afterAllTransactions` distinction
**Date:** 2026-04-16
**Sources:**
- `node_modules/yjs/src/utils/Transaction.js:260-399` (cleanupTransactions implementation)
- `node_modules/yjs/src/utils/Transaction.js:412-448` (transact entry, queue management)
- `node_modules/yjs/src/utils/Doc.js:43-50` (DocEvents typedef)
- https://docs.yjs.dev/api/y.doc (official docs for `afterTransaction`, `beforeObserverCalls`)

---

## Key files / locations referenced

- `Transaction.js:270` — `doc.emit('beforeObserverCalls', [transaction, doc])` — fires before observer callbacks for the **current** transaction.
- `Transaction.js:280-286` — observer callbacks fire (`itemtype._callObserver(transaction, subs)`).
- `Transaction.js:287-319` — deepObserver events are gathered, then `doc.emit('afterTransaction', [transaction, doc])` is pushed onto the `fs` queue.
- `Transaction.js:313` — `fs.push(() => doc.emit('afterTransaction', [transaction, doc]))` — the per-transaction "after" event.
- `Transaction.js:320` — `callAll(fs, [])` — runs the queue (observer calls + afterTransaction).
- `Transaction.js:362` — `doc.emit('afterTransactionCleanup', [transaction, doc])` — fires inside the `finally` block after structure merging + GC + update emit.
- `Transaction.js:393` — `doc.emit('afterAllTransactions', [doc, transactionCleanups])` — fires only when the queue is fully drained.

---

## Findings

### Finding 2.1: `afterTransaction` fires per-transaction; `afterAllTransactions` fires per-drain.

**Confidence:** CONFIRMED
**Evidence:** Source-traced from `Transaction.js:260-399`.

The `cleanupTransactions(transactionCleanups, i)` function processes one entry of the queue per recursive call. For each entry it:

1. Calls `getStateVector` → sets `transaction.afterState`.
2. Emits `beforeObserverCalls` (line 270).
3. Builds an array `fs` of zero-arg functions: one per changed type's observer, one per deep-observed parent, plus `() => doc.emit('afterTransaction', ...)` (line 313).
4. Runs `callAll(fs, [])` (line 320) — this is `lib0/function`'s `callAll`, which iterates the array even if individual callbacks throw.
5. Inside `finally`: GCs, merges, emits `afterTransactionCleanup` (line 362), emits `update` / `updateV2` events for any subscribers (lines 363-376).
6. **Then checks the queue:** if `transactionCleanups.length <= i + 1`, fire `afterAllTransactions`; else recurse to entry `i + 1`.

**Per-transaction events fire N times** if observer callbacks created N - 1 new transactions during the drain. **Per-drain events fire exactly once** for the outermost user-initiated `transact()` call.

**Implications:**
- If you want "after every transaction, including ones triggered as side-effects of observers": use `afterTransaction`.
- If you want "after the entire user-initiated batch has settled, including any sub-transactions cascade-triggered": use `afterAllTransactions`.
- For a server-authoritative cross-CRDT bridge: `afterAllTransactions` is correct, because cross-CRDT writes themselves create new transactions, and we want to react after the drain is complete (not after the inbound mutation but before our own writes).

---

### Finding 2.2: `afterTransaction` runs inside the observer queue (`fs`), so it fires AFTER all observe/observeDeep callbacks for the same transaction.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:280-320`

```js
const fs = []
// observe events on changed types
transaction.changed.forEach((subs, itemtype) =>
  fs.push(() => {
    if (itemtype._item === null || !itemtype._item.deleted) {
      itemtype._callObserver(transaction, subs)
    }
  })
)
fs.push(() => {
  // deep observe events
  transaction.changedParentTypes.forEach((events, type) => {
    if (type._dEH.l.length > 0 && (type._item === null || !type._item.deleted)) {
      // ...
      fs.push(() => {
        callEventHandlerListeners(type._dEH, events, transaction)
      })
    }
  })
  fs.push(() => doc.emit('afterTransaction', [transaction, doc]))
  fs.push(() => {
    if (transaction._needFormattingCleanup) {
      cleanupYTextAfterTransaction(transaction)
    }
  })
})
callAll(fs, [])
```

Note the nesting: the deep-observe block pushes `afterTransaction` and `cleanupYTextAfterTransaction` *while iterating* `fs` (because the outer function is itself one of the `fs` entries). `callAll` processes the array in order, so even though they're pushed mid-iteration, they run after all observe + observeDeep callbacks for this transaction.

**Implications:**
- An `afterTransaction` listener can read the post-state of every shared type the transaction modified — observer callbacks have already mutated derived state (e.g., y-prosemirror has dispatched its PM transaction).
- An `afterTransaction` listener CANNOT see the result of any sub-transaction triggered by an observer callback — those sub-transactions queue onto `transactionCleanups` and only run on the next loop iteration.

---

### Finding 2.3: For "react after CRDT state has fully settled," `afterAllTransactions` is the canonical hook.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:391-396` + comment at `Transaction.js:435-442`

```js
const finishCleanup = doc._transaction === transactionCleanups[0]
doc._transaction = null
if (finishCleanup) {
  // The first transaction ended, now process observer calls.
  // Observer call may create new transactions for which we need to call the observers and do cleanup.
  // We don't want to nest these calls, so we execute these calls one after
  // another.
  // Also we need to ensure that all cleanups are called, even if the
  // observes throw errors.
  // This file is full of hacky try {} finally {} blocks to ensure that an
  // event can throw errors and also that the cleanup is called.
  cleanupTransactions(transactionCleanups, 0)
}
```

The author's comment confirms the design intent: **observer-triggered transactions are processed sequentially (not nested), and the queue is drained completely before `transact()` returns**. `afterAllTransactions` is the single point where you know:
- All initial mutations have been applied to the CRDT store.
- All `observe` / `observeDeep` callbacks have run.
- All sub-transactions cascade-triggered by those callbacks have also been applied + observed.
- All `afterTransaction` events have fired.
- All `afterTransactionCleanup` events have fired.
- All `update` / `updateV2` events have fired.

**Implications:**
- `afterAllTransactions` is the **strongest "settled state" signal** Yjs offers without resorting to setTimeout.
- It is the correct replacement for a `setTimeout(syncFn, debounceMs)` debounce that exists solely to "wait for everything to settle" — provided the debounce was not also serving a coalescing purpose for high-frequency local edits (cross-reference D5 for reentrancy + coalescing semantics).

---

### Finding 2.4: `afterTransactionCleanup` exists between `afterTransaction` and `afterAllTransactions` and is occasionally what callers want.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:362`

```js
// @todo Merge all the transactions into one and provide send the data as a single update message
doc.emit('afterTransactionCleanup', [transaction, doc])
if (doc._observers.has('update')) {
  // ... emit('update', ...)
}
```

`afterTransactionCleanup` fires AFTER `afterTransaction` (which ran inside the `fs` queue at line 320), but BEFORE the `update` events. It runs inside the `finally` block of the per-entry loop — so it fires for each transaction in the drain, BEFORE `afterAllTransactions`.

The `@todo` author comment indicates the GC + structure-merge phase of cleanup is complete by this point: deletes have been GC'd, mergeable structs have been compacted, and the post-state is canonical.

**Implications:**
- For our use case (cross-CRDT settlement reactor) `afterTransactionCleanup` is NOT the right choice — it fires per-transaction, not per-drain, so we'd over-fire during cascade-triggered sub-transactions.
- For consumers that want "post-GC, post-merge state" but per-transaction granularity (e.g., a metric that counts deletes after compaction), `afterTransactionCleanup` is the right hook.

---

### Finding 2.5: Lifecycle event ordering, summarized.

**Confidence:** CONFIRMED (assembled from `Transaction.js` + `lib0/observable.js`)

For one user-initiated `doc.transact(f, origin)` call where the queue ends up containing N transactions (1 initial + N-1 from observer callbacks):

```
beforeAllTransactions(doc)                    [fires ONCE, only if queue was empty]
  beforeTransaction(tr_1, doc)
  f(tr_1)                                     [user mutations]
  // f returns; transact() finally block runs cleanupTransactions(queue, 0)
    // Loop iteration 0: process tr_1
    beforeObserverCalls(tr_1, doc)
    [observe callbacks on changed types]      [may push tr_2, tr_3, ... onto queue]
    [observeDeep callbacks]
    afterTransaction(tr_1, doc)
    [GC, struct merge]
    afterTransactionCleanup(tr_1, doc)
    update(...) | updateV2(...)               [if hasContent]
    // Loop iteration 1: process tr_2 (recurse)
    beforeObserverCalls(tr_2, doc)
    ...
    afterTransactionCleanup(tr_2, doc)
    // ...
    // Loop iteration N-1: process tr_N
    afterTransactionCleanup(tr_N, doc)
afterAllTransactions(doc, [tr_1, tr_2, ..., tr_N])  [fires ONCE, after queue empty]
// transact() returns
```

`beforeAllTransactions` and `afterAllTransactions` bracket the entire drain. `beforeTransaction` / `beforeObserverCalls` / observer callbacks / `afterTransaction` / `afterTransactionCleanup` / `update` fire per-entry. All synchronous on the original caller's stack (no microtask, no setTimeout).

---

## Negative searches

- Searched: `Promise`, `microtask`, `setTimeout`, `setImmediate` in `Transaction.js`, `Doc.js`, `lib0/observable.js` → NOT FOUND. Every emit is synchronous.
- Searched: `afterTransactionCleanup` in `https://docs.yjs.dev/api/y.doc` → NOT FOUND (also undocumented; only the per-entry `afterTransaction` is documented).

---

## Gaps / follow-ups

- The relative ordering between `afterTransaction` (which fires inside the `fs` queue at line 320) and `afterTransactionCleanup` (which fires in the per-entry `finally` at line 362) deserves a small runtime test if the bridge ever needs to depend on it. Source reading shows `afterTransaction` runs first, then GC, then `afterTransactionCleanup`. This evidence file documents the source position; an empirical assertion is straightforward to add if needed.
