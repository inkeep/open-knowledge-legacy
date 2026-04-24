---
title: "Yjs Transaction Settlement Hooks: afterAllTransactions vs Wall-Clock Debounce"
description: "Source-traced semantics of Yjs transaction lifecycle hooks (afterAllTransactions, afterTransaction, beforeAllTransactions) and their suitability as a settlement-based replacement for setTimeout debounce in a server-authoritative CRDT bridge observer. Confirms afterAllTransactions fires synchronously after the outermost transact() drains its full queue, that one Hocuspocus WebSocket message produces exactly one outermost transaction, that y-prosemirror uses this hook in production, and that reentrancy semantics are well-defined. Migration is a net correctness win for a dual-CRDT bridge."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Yjs
  - Hocuspocus
  - y-prosemirror
  - y-codemirror.next
  - lib0/observable
topics:
  - Yjs transaction lifecycle
  - settlement-based observer composition
  - CRDT bridge propagation
  - WebSocket sync batching
  - test harness design
---

# Yjs Transaction Settlement Hooks: afterAllTransactions vs Wall-Clock Debounce

**Purpose:** Determine whether `doc.on('afterAllTransactions', ...)` is a correct settlement-based replacement for the current 50 ms `setTimeout` debounce in a server-authoritative CRDT bridge observer. Drives a 1-way-door architectural decision affecting all future bridge work, the test harness, and propagation timing semantics.

## Executive Summary

`afterAllTransactions` is a **CONFIRMED-correct** settlement hook for a server-authoritative cross-CRDT bridge observer in yjs 13.6.30. It fires synchronously after the outermost `doc.transact()` drains its entire queue (initial + cascade-triggered sub-transactions), receives the full batch via its `transactions: Transaction[]` argument, and is the same hook the canonical ecosystem binding (y-prosemirror) uses for drain-bracket bookkeeping. Source: `node_modules/yjs/src/utils/Transaction.js:391-396` — emit happens in the tail of `cleanupTransactions` after the queue is fully drained, on the same call stack as `doc.transact()`'s caller, with no microtask or setTimeout deferral.

For a dual-CRDT bridge (Y.XmlFragment + Y.Text), the migration is a **net correctness win**:

- **One whole-class race goes away.** Today, a second remote update arriving inside the 50 ms debounce window can conflate two distinct settled states into one bridge sync. With `afterAllTransactions`, each `transact()` call produces its own settlement fire — no conflation possible.
- **Settlement is causal, not timing-based.** `afterAllTransactions` IS the cascade-completion signal.
- **Paired-write handling translates mechanically.** Today's observer callback already does the right thing; we relocate the logic into the `afterAllTransactions` handler with `transactions.some(tr => isPairedWriteOrigin(tr.origin))` as the trigger.
- **One Hocuspocus WebSocket message = one Yjs transaction = one `afterAllTransactions` fire** — confirmed via source-trace from `Connection.ts:231` → `MessageReceiver.ts:215` → `y-protocols/sync.js:109` → `yjs/src/utils/encoding.js:382`.

Non-trivial constraints:

- **Test-harness `Scheduler` injection seam disappears.** Tests using `scheduler.flush()` need a replacement (export the settlement handler for direct invocation, or `nextSettlement(doc): Promise<void>` helper). Touches ~30 integration tests.
- **Implicit `setTimeout` coalescing across multiple `transact()` calls is gone.** Today's code paths each issue exactly one `transact()` per logical operation, so no real-world coalescing is lost. Future code with bursty per-token `transact()` calls would need explicit batching.
- **`afterAllTransactions` is a stable but undocumented public API.** Exported in `DocEvents` TS types (`Doc.d.ts:220-237`), used in production by `y-prosemirror/src/plugins/sync-plugin.js:666`, present in main branch identical to 13.6.30. Not in the official `docs.yjs.dev/api/y.doc` page — version-stability is informally guaranteed by ecosystem dependency.

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|---|---|---|---|
| D1 | `afterAllTransactions` precise firing semantics | P0 | Deep | CONFIRMED |
| D2 | `afterTransaction` vs `afterAllTransactions` distinction | P0 | Deep | CONFIRMED |
| D3 | Hocuspocus WebSocket update ingestion | P0 | Deep | CONFIRMED |
| D4 | Ecosystem composition pattern (y-prosemirror, y-codemirror.next) | P0 | Moderate | CONFIRMED |
| D5 | Reentrancy and nesting | P0 | Deep | CONFIRMED |
| D6 | Version stability across Yjs 13.x | P1 | Moderate | CONFIRMED |
| D7 | observeDeep vs observe under settlement | P1 | Moderate | CONFIRMED |
| D8 | beforeAllTransactions + accumulator pattern | P1 | Moderate | CONFIRMED |
| D9 | TypeScript typing for hook callbacks | P1 | Moderate | CONFIRMED |

**Stance:** Factual. Out of scope: implementation in `server-observers.ts`, benchmarking, other CRDTs.

## Detailed Findings

### D1. `afterAllTransactions` precise firing semantics

Fires synchronously after the outermost `doc.transact()` call drains its full transaction-cleanups queue. Emit lives in `cleanupTransactions`'s tail at `Transaction.js:391-396`:

```js
if (transactionCleanups.length <= i + 1) {
  doc._transactionCleanups = []
  doc.emit('afterAllTransactions', [doc, transactionCleanups])
} else {
  cleanupTransactions(transactionCleanups, i + 1)
}
```

Emit is via `lib0/observable.js:80-83` — synchronous `forEach(f => f(...args))`, no microtask, no setTimeout, runs on the original `transact()` caller's call stack. The `transactions: Transaction[]` argument contains every transaction processed in this drain (initial plus any sub-transactions enqueued by observer callbacks). `_transactionCleanups` is reset to `[]` BEFORE the emit — so handler-triggered `transact()` calls start a fresh drain.

**Evidence:** `evidence/d1-after-all-transactions-semantics.md`

**Implications:** Stronger settlement guarantee than `setTimeout(fn, N)` — no risk of a second concurrent mutation arriving between "settlement" and "callback." Handler can inspect `transactions[]` for batch-aware origin skip (e.g., `transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)`).

### D2. `afterTransaction` vs `afterAllTransactions`

Six lifecycle events; two are bracket-pair events spanning the entire drain:

| Event | Argument | When | Per-drain or per-transaction |
|---|---|---|---|
| `beforeAllTransactions` | `(doc)` | Before first transaction in drain | Per-drain (1×) |
| `beforeTransaction` | `(tr, doc)` | Before each transaction's body | Per-transaction (N×) |
| `beforeObserverCalls` | `(tr, doc)` | After body, before observer callbacks | Per-transaction (N×) |
| `afterTransaction` | `(tr, doc)` | After observer callbacks | Per-transaction (N×) |
| `afterTransactionCleanup` | `(tr, doc)` | After GC + struct merge | Per-transaction (N×) |
| `afterAllTransactions` | `(doc, transactions[])` | After full queue drain | Per-drain (1×) |

For a server-authoritative cross-CRDT bridge, `afterAllTransactions` is correct because the bridge's own writes themselves create new transactions enqueued during the drain. We want one fire after the cascade settles, not one fire per cascade-triggered intermediate.

**Evidence:** `evidence/d2-after-transaction-vs-after-all.md`

### D3. Hocuspocus WebSocket update ingestion

**One inbound `messageYjsUpdate` = exactly one outermost Yjs transaction.** Source-traced:

```
Connection.handleMessage(data)        — Connection.ts:231 (push to messageQueue)
  → processMessages()                  — Connection.ts:239 (sequential await drain)
    → MessageReceiver.apply(...)       — MessageReceiver.ts:33
      → readSyncMessage(...)           — MessageReceiver.ts:126
        → readUpdate(decoder, doc, origin)  — y-protocols/sync.js:109
          → Y.applyUpdate(doc, update, origin)  — yjs/src/utils/encoding.js:492
            → applyUpdateV2(...)             — encoding.js:476
              → readUpdateV2(decoder, doc, origin, decoderInstance)  — encoding.js:382
                → transact(doc, fn, origin, false)   — ← ONE outer transact
```

`local: false` is forced inside `readUpdateV2` (`encoding.js:385`). Hocuspocus's `messageQueue` is per-connection and sequential (`await receiver.apply(...)`). Cross-connection serialization is implicit via Node.js single-threaded event loop — no two `transact()` calls run concurrently on the same Y.Doc.

A single message merging N peer edits still produces ONE `afterAllTransactions` fire. Server-side direct writes (`applyAgentMarkdownWrite`, `applyExternalChange`, `setupServerObservers` self-writes) all use `Document.transact(...)` which IS `Doc.transact(...)`. Same lifecycle.

**Pending-structs case:** The recursive `applyUpdateV2` call inside `readUpdateV2` is REENTRANT into the existing transact and is absorbed into the same outer transaction. Still one `afterAllTransactions` fire.

**Evidence:** `evidence/d3-hocuspocus-websocket-batching.md`

### D4. Observer composition pattern (ecosystem prior art)

[y-prosemirror's `sync-plugin.js`](https://github.com/yjs/y-prosemirror/blob/master/src/plugins/sync-plugin.js) uses BOTH `observeDeep` (for sync work) AND `afterAllTransactions` (for drain-bracket bookkeeping). Lines 343-345:

```js
this.afterAllTransactions = () => {
  this.beforeTransactionSelection = null
}
```

`initView` registers both at lines 666-667:

```js
this.doc.on('afterAllTransactions', this.afterAllTransactions)
this.type.observeDeep(this._observeFunction)
```

[y-codemirror.next's `y-sync.js`](https://github.com/yjs/y-codemirror.next/blob/master/src/y-sync.js) uses single-type `observe` only — no settlement hook. The observer dispatches a CM transaction synchronously, with origin-skip via the `tr.origin !== this.conf` identity check (lines 107-127).

**Critically: no ecosystem editor binding uses `setTimeout` debouncing for cross-CRDT sync.** Yjs's per-transaction batching IS their coalescing. The current 50 ms `setTimeout` is ecosystem-uncommon.

**Evidence:** `evidence/d4-ecosystem-observer-composition.md`

### D5. Reentrancy and nesting

A handler calling `doc.transact(...)` inside `afterAllTransactions` starts a NEW outermost drain. Because `_transactionCleanups` is reset to `[]` *before* the emit (`Transaction.js:392`), the inner `transact()` finds `doc._transaction === null` and creates a fresh transaction. The new drain fires its own `beforeAllTransactions` and (when complete) its own `afterAllTransactions`.

For a bridge writing `OBSERVER_SYNC_ORIGIN`-tagged transactions inside `afterAllTransactions`:
- New drain fires `afterAllTransactions` with `transactions = [bridgeWriteTr]`.
- Batch-skip predicate `transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)` returns true.
- Handler exits without re-firing.

Sub-transactions cascade-triggered by observer callbacks are absorbed into the SAME drain (pushed onto `_transactionCleanups`; cleanup loop iterates per `Transaction.js:391-396`).

**`cleanupTransactions` is still recursive in 13.6.30** despite [issue #522](https://github.com/yjs/yjs/issues/522). Irrelevant for bridge drain depths (1-3 transactions).

**Evidence:** `evidence/d5-reentrancy-and-nesting.md`

### D6. Version stability

`afterAllTransactions` is identical between pinned `^13.6.30` and yjs upstream main. No deprecation, no rename in 13.6.x. Exported in TS types (`Doc.d.ts:220-237`), in active production use by y-prosemirror.

**Not documented at [docs.yjs.dev/api/y.doc](https://docs.yjs.dev/api/y.doc)** — only `beforeTransaction`, `beforeObserverCalls`, `afterTransaction`, and `update` are documented. Stability is informally guaranteed by ecosystem dependency.

`Transaction.origin: any` is intentionally typed `any` because Yjs doesn't constrain consumers' origin types. No deprecation tags on transaction-lifecycle events anywhere in the source.

**Evidence:** `evidence/d6-version-stability.md`

### D7. observeDeep vs observe under settlement

Both fire during the same observer phase per transaction (`Transaction.js:280-319`); the difference is scope (single type vs deep tree). Under settlement-based propagation, the observer can be reduced to a "dirty flag" set inside a trivial callback — or eliminated entirely by inspecting `transactions[].changed` and `transactions[].changedParentTypes` at settlement.

**Recommended:** Keep a minimal `observeDeep` callback for early origin-skip + dirty-flag, do the actual sync work in `afterAllTransactions`. Preserves the optimization that already-paired writes are detected before any settlement work.

**Evidence:** `evidence/d7-d8-d9-observation-typing.md`

### D8. beforeAllTransactions + accumulator pattern

`beforeAllTransactions` fires once at drain start with `(doc)` only — no transaction info. Pairing it with `afterAllTransactions` (which receives `transactions[]`) gives a clean diff-against-baseline pattern without a long-lived `lastSyncedXmlMd` field.

A separate accumulator (collecting per-transaction info during the drain) is supported but rarely necessary — `transactions[]` already contains all of it at settlement.

**Evidence:** `evidence/d7-d8-d9-observation-typing.md`

### D9. TypeScript typing

`Doc extends ObservableV2<DocEvents>`, so `doc.on('afterAllTransactions', (d, transactions) => ...)` is statically typed: `d: Doc`, `transactions: Transaction[]`. No `any` cast at registration. The only weak link is `Transaction.origin: any`. A one-line type guard gives compile-time-safe narrowing inside the handler:

```ts
type EnforcedOrigin = typeof OBSERVER_SYNC_ORIGIN | typeof AGENT_WRITE_ORIGIN | typeof FILE_WATCHER_ORIGIN;
const isEnforcedOrigin = (o: unknown): o is EnforcedOrigin =>
  o === OBSERVER_SYNC_ORIGIN || o === AGENT_WRITE_ORIGIN || o === FILE_WATCHER_ORIGIN;
```

The "no `any`/`unknown` in user code" directive is satisfiable: the boundary is one type guard.

**Evidence:** `evidence/d7-d8-d9-observation-typing.md`

## Correctness Equivalence Summary

| Scenario | `setTimeout(50)` debounce | `afterAllTransactions` | Equivalent? |
|---|---|---|---|
| Single client edit | 1 sync at ~50ms | 1 sync at settlement | ✅ Yes (faster) |
| 2 client edits 30 ms apart | 1 sync (coalesced) | 2 syncs | ❌ Different |
| Inbound message merging N peer edits | 1 sync | 1 sync | ✅ Same |
| Paired-write origin | Sync baseline refresh, no sync | Origin guard skip | ✅ Same |
| Bridge self-write (OBSERVER_SYNC_ORIGIN) | Skip at observer | Skip at handler | ✅ Same |
| Test with `ManualScheduler` | `scheduler.flush()` | Mock or direct invoke | ❌ Different (test ergonomics) |
| Cascade: observer triggers sub-transaction | Same 50ms window → 1 sync | Same drain → 1 sync | ✅ Same (more correct) |
| Burst of 10 server transacts in 50ms | 1 sync (coalesced) | 10 syncs | ❌ Different |

**Pure correctness wins:**
- Stronger cascade-completion guarantee (no "wait and hope").
- Eliminates the conflation race entirely (no debounce window for second concurrent mutation).
- Faster (~50ms latency reduction per cycle; non-bottleneck per related research).

**Implementation costs:**
- Test-harness Scheduler DI seam disappears. Replace with handler-direct invocation or `nextSettlement(doc): Promise<void>` helper. Touches ~30 integration tests.
- No implicit coalescing across distinct `transact()` calls. Today's code is one-transact-per-operation; future bursty paths need explicit batching (idiomatic Yjs guidance).
- Paired-write handling translates mechanically — no new design.

## Limitations & Open Questions

**Out of scope:** implementation details for the migration; benchmarking; other CRDTs.

**Known unknowns:**
- Exact yjs version where `afterAllTransactions` was introduced — not in current snapshot. Present in 13.6.30 and main; assumed pre-13.0 based on y-prosemirror's longstanding dependency. Risk: low.
- Behavior of yjs upstream when issue #522 is fixed — semantics unchanged, internal call shape changes.

## Sources

- [Yjs Transaction.js (main)](https://github.com/yjs/yjs/blob/main/src/utils/Transaction.js)
- [Yjs Doc.js (main)](https://github.com/yjs/yjs/blob/main/src/utils/Doc.js)
- [Yjs INTERNALS.md](https://github.com/yjs/yjs/blob/main/INTERNALS.md)
- [docs.yjs.dev — Y.Doc API](https://docs.yjs.dev/api/y.doc)
- [docs.yjs.dev — Transactions (beta)](https://beta.yjs.dev/docs/api/transactions/)
- [Yjs issue #522 — cleanupTransactions stack overflow](https://github.com/yjs/yjs/issues/522)
- [Yjs community discussion: beforeAllTransactions vs beforeTransaction](https://discuss.yjs.dev/t/whats-the-difference-between-beforealltransactions-and-beforetransaction/614)
- [y-prosemirror sync-plugin.js](https://github.com/yjs/y-prosemirror/blob/master/src/plugins/sync-plugin.js)
- [y-codemirror.next y-sync.js](https://github.com/yjs/y-codemirror.next/blob/master/src/y-sync.js)
- [Hocuspocus server source](https://github.com/ueberdosis/hocuspocus/tree/main/packages/server/src)
- [npm: yjs](https://www.npmjs.com/package/yjs)

## Related Research

- [reports/crdt-observer-bridge-latency-analysis/REPORT.md](../crdt-observer-bridge-latency-analysis/REPORT.md) — identifies 50ms debounce as <5% of total cycle time; settlement-hook migration is correctness-driven, not latency-driven
- [reports/crdt-origin-laundering-prior-art/REPORT.md](../crdt-origin-laundering-prior-art/REPORT.md) — typed origin objects + origin-aware reconciliation; preserved under settlement-based propagation
- [reports/three-way-merge-content-preservation/REPORT.md](../three-way-merge-content-preservation/REPORT.md) — sister investigation: state-based merge has fundamental limits even with correct settlement
