# Evidence: D5 — Reentrancy and nesting (handler calling `doc.transact()` inside itself)

**Dimension:** D5 — If an `afterAllTransactions` handler calls `doc.transact(...)`, what happens?
**Date:** 2026-04-16
**Sources:**
- `node_modules/yjs/src/utils/Transaction.js:412-448` (transact entry, queue management)
- `node_modules/yjs/src/utils/Transaction.js:391-396` (afterAllTransactions emit, queue reset to `[]`)
- `node_modules/yjs/src/utils/Transaction.js:260-399` (cleanupTransactions iterative drain)
- https://github.com/yjs/yjs/issues/522 (cleanupTransactions stack-overflow + recursive→iterative fix)
- https://discuss.yjs.dev/t/whats-the-difference-between-beforealltransactions-and-beforetransaction/614

---

## Key files / locations referenced

- `Transaction.js:392` — `doc._transactionCleanups = []` (queue reset BEFORE the emit).
- `Transaction.js:393` — `doc.emit('afterAllTransactions', [doc, transactionCleanups])`.
- `Transaction.js:419-427` — `transact()` reentrancy: if `doc._transaction !== null`, the inner call shares the existing transaction; if `null`, it starts a new outermost call.
- `Transaction.js:431-444` — `transact()` finally block: `_transaction = null` is set BEFORE `cleanupTransactions(...)` runs, so the cleanup itself is in "no active transaction" mode.
- `Transaction.js:434-443` — comment block: *"Observer call may create new transactions for which we need to call the observers and do cleanup. We don't want to nest these calls, so we execute these calls one after another."*
- `Transaction.js:393` (post-fix iterative loop is now line ~393 area) — confirmed iterative-drain pattern in 13.6.30.

---

## Findings

### Finding 5.1: A handler calling `doc.transact()` inside `afterAllTransactions` starts a NEW outermost drain — `beforeAllTransactions` fires again.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:391-396` + `Transaction.js:419-427`

The emit sequence inside `cleanupTransactions`:

```js
if (transactionCleanups.length <= i + 1) {
  doc._transactionCleanups = []                                     // line 392
  doc.emit('afterAllTransactions', [doc, transactionCleanups])       // line 393
}
```

The queue is reset to `[]` BEFORE the emit. So when `afterAllTransactions` runs and the handler calls `doc.transact(f, origin)`:

1. `transact()` is called. It checks `doc._transaction` — but `_transaction` was set to `null` at `Transaction.js:433` (inside the outer transact's finally block) BEFORE `cleanupTransactions` was invoked.
2. So `doc._transaction === null`, `initialCall = true`.
3. A new `Transaction` is created and pushed onto `doc._transactionCleanups` (now `[newTr]`).
4. Because `transactionCleanups.length === 1`, **`beforeAllTransactions` fires again** (line 423-425).
5. The handler's mutations run, then the inner `transact`'s finally block runs `cleanupTransactions(transactionCleanups, 0)`.
6. After that drain completes, `afterAllTransactions` fires again (with a fresh batch).
7. Control returns to the outer `afterAllTransactions` listener.

**Implications:**
- An `afterAllTransactions` handler that performs a sync write (e.g., our cross-CRDT bridge) creates a NEW drain cycle that fully completes before the original `afterAllTransactions` emit returns.
- If your handler iterates on settled state (read post-handler state), it sees the bridge's mutations applied. The original drain's `afterAllTransactions` listener call has not yet returned.
- Recursion depth: each handler-triggered `transact` adds one stack frame for the `transact` call + one for `cleanupTransactions`. As long as your handler doesn't trigger an unbounded chain (handler writes that re-trigger your handler), depth stays bounded.

---

### Finding 5.2: Self-fire is a real risk — listener mutations re-fire your own listener via the new drain's `afterAllTransactions`.

**Confidence:** CONFIRMED
**Evidence:** Source-traced reasoning from Finding 5.1 + `Transaction.js:419-427`.

If your `afterAllTransactions` handler:
- Reads CRDT state.
- Writes to a Y.Type (any of them, including the same one the drain mutated).
- Returns.

Then the WRITE is itself a new outermost transaction. When that inner transact's finally block runs `cleanupTransactions`, eventually `afterAllTransactions` fires AGAIN — with the inner write's transaction in the batch. Your handler is called recursively.

If the recursive call's body has the same condition that triggers the write (e.g., "Y.Text differs from baseline → write to Y.Text") and your write didn't make the condition false, you have an infinite loop.

**Implications:**
- Self-skip is mandatory for `afterAllTransactions`-driven cross-CRDT bridges. The standard pattern: tag the listener's writes with a sentinel origin, skip the listener body when ALL transactions in the batch carry that origin. Open Knowledge already does this with `OBSERVER_SYNC_ORIGIN` and the `transaction.origin === OBSERVER_SYNC_ORIGIN` guard in `server-observers.ts:206, 380`.
- For batch-aware handlers: `transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)` is the equivalent batch-skip predicate. Using `.every` rather than `.some` is correct: if ANY non-sync transaction is in the batch, we still need to react.

---

### Finding 5.3: Sub-transactions created during the drain (by observer callbacks) do NOT fire their own `afterAllTransactions` — they are absorbed into the existing drain.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:391-396` + `Transaction.js:280-286` (observer callback site).

Per Finding 1.1, observer callbacks that trigger `doc.transact(...)` find `doc._transaction === null` (already cleared at line 433) BUT the cleanup loop is in progress. The new `transact` call starts a new outer transaction, pushes it onto `_transactionCleanups`, then in its finally block invokes `cleanupTransactions`.

**However:** the inner `cleanupTransactions` call sees that `_transaction === transactionCleanups[0]` is true for ITS new transaction, but the OUTER `cleanupTransactions` is already running with the parent queue. There's no double-drain — the inner `cleanupTransactions(queue, 0)` would see only the new transaction in the queue from its own perspective. Actually, the inner call iterates from `i=0` on the SAME `transactionCleanups` array that was pushed onto.

Re-reading Transaction.js:391-396: when the outer cleanup loop reaches its check `if (transactionCleanups.length <= i + 1)`, the array LENGTH includes any sub-transactions pushed by observers during this iteration. So if a sub-transaction is pushed at iteration `i=0`, the queue length is now 2, the condition `length <= 1` is false, and the loop recurses to `i+1=1` to process the sub-transaction. `afterAllTransactions` fires only when ALL sub-transactions are drained.

**Implications:**
- This is exactly the design intent of `afterAllTransactions`: a single fire after the entire cascade settles.
- For our bridge: even if observer A's reactor synchronously triggers a Y.Text write, that write is absorbed into the SAME drain (because it's invoked from inside an observer callback during cleanup). `afterAllTransactions` fires once, with both the original mutation transaction AND the bridge's reactive transaction in the `transactions[]` argument.
- This means a cross-CRDT bridge that runs INSIDE an observer + a final reconciliation in `afterAllTransactions` would see TWO entries in the `transactions[]` array: the original + the in-observer write. A pure-`afterAllTransactions` bridge would see ONE entry: the original (because the bridge's write happens AFTER `afterAllTransactions` fires, in a NEW drain).

---

### Finding 5.4: `cleanupTransactions` is recursive in source 13.6.30 (no stack-overflow fix yet, despite issue #522).

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:391-396`

```js
if (transactionCleanups.length <= i + 1) {
  doc._transactionCleanups = []
  doc.emit('afterAllTransactions', [doc, transactionCleanups])
} else {
  cleanupTransactions(transactionCleanups, i + 1)   // <-- still recursive
}
```

The function calls itself recursively to advance the cleanup index. Issue #522 (https://github.com/yjs/yjs/issues/522) reports this can blow the stack with very large transaction batches (e.g., loading a doc with millions of operations or many sub-transactions). A PR was opened to convert to iteration but is not merged into 13.6.30.

**Implications:**
- For our bridge, drains are bounded (initial mutation + one bridge sync = 2-3 transactions in the queue, max). Stack depth is fine.
- Worth flagging if a future cascade creates many sub-transactions in one drain (e.g., a reactor that splits one input into 100 small writes). At that point upgrading yjs to a version with the iterative fix becomes a hard requirement.

---

### Finding 5.5: There is NO debounce/throttle/coalesce mechanism in Yjs's transaction cycle. Coalescing is the consumer's responsibility.

**Confidence:** CONFIRMED
**Evidence:** Source reading of `Transaction.js` and `Doc.js` — no `setTimeout`, `queueMicrotask`, `setImmediate`, or rate-limit logic anywhere in the lifecycle path.

Yjs's only "batching" is at the user-call level: `doc.transact(f, origin)` bundles all mutations inside `f` into one transaction. Multiple separate `transact()` calls fire multiple separate transactions and multiple separate `afterAllTransactions` events.

**Implications:**
- Replacing our `setTimeout(syncFn, 50)` debounce with `afterAllTransactions` removes ALL coalescing. Each separate `transact()` call (e.g., consecutive WebSocket messages, consecutive agent writes, consecutive direct edits) triggers a fresh sync.
- This is fine for the current write surfaces:
  - **WebSocket messages:** one message = one transaction = one sync. Coalescing across messages would only hide work, not save it (each message has independent merge semantics).
  - **Server-side direct writes (`applyAgentMarkdownWrite`, `applyExternalChange`):** each is one `transact()` call. Already-paired writes don't need bridge work (early-exit gates).
  - **Bridge self-writes:** carry `OBSERVER_SYNC_ORIGIN`, skip the bridge.
- If a future write surface generates many small `transact()` calls in close succession (e.g., a streaming-ingest path that does one transact per token), we'd want to **add** explicit coalescing (e.g., a per-message accumulator, or batch the writes into one outer `transact`). `afterAllTransactions` does not provide implicit coalescing.

---

## Negative searches

- Searched: any per-Doc throttle / rate-limit / coalesce option in `Doc.js` or `DocOpts` → NOT FOUND. The only option that affects transaction behavior is `gc` / `gcFilter`, neither of which deals with timing.
- Searched: `microtask` in `Transaction.js` or `Doc.js` → NOT FOUND.

---

## Gaps / follow-ups

- The recursive→iterative fix (issue #522) status as of 13.6.30 is "unresolved." A future yjs version may change `cleanupTransactions` to a `while` loop. The semantics from a consumer's standpoint don't change — `afterAllTransactions` still fires once after the queue is drained — but the internal call shape changes. Worth re-verifying after a yjs upgrade.
- Cross-Y.Doc cascading: our `setupServerObserverExtension` runs per-document (each Y.Doc gets its own observers). If a future feature needs cross-doc settlement (e.g., backlink-index updates triggered by another doc's settlement), `afterAllTransactions` only knows about its own doc's drain — cross-doc coordination would need a higher-level orchestration layer.
