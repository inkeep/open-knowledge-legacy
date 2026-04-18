# Evidence: D7 + D8 + D9 — observeDeep vs observe; beforeAllTransactions accumulator; TypeScript typing

**Dimensions:**
- D7 — `observeDeep` vs `observe` under settlement-based propagation
- D8 — `beforeAllTransactions` + transaction accumulator pattern
- D9 — TypeScript typing for hook callbacks

**Date:** 2026-04-16
**Sources:**
- `node_modules/yjs/src/utils/Transaction.js:159-164` (addChangedTypeToTransaction — populates transaction.changed)
- `node_modules/yjs/src/utils/Transaction.js:80-87` (transaction.changed + transaction.changedParentTypes)
- `node_modules/yjs/src/utils/Transaction.js:280-319` (observer-call dispatch order: observe before observeDeep)
- `node_modules/yjs/src/types/AbstractType.js` (observe / observeDeep registration)
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` (DocEvents type)
- `node_modules/yjs/dist/src/utils/Transaction.d.ts` (Transaction class type)
- `node_modules/lib0/observable.d.ts` (ObservableV2 generic surface)
- `node_modules/@hocuspocus/server/src/types.ts` (LocalTransactionOrigin / TransactionOrigin types)

---

## D7 — `observeDeep` vs `observe` under settlement-based propagation

### Finding 7.1: `observeDeep` and `observe` differ ONLY in scope (deep tree vs single type), not in firing time. Both fire during the per-transaction observer phase.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:280-319`

```js
// observe events on changed types
transaction.changed.forEach((subs, itemtype) =>
  fs.push(() => {
    if (itemtype._item === null || !itemtype._item.deleted) {
      itemtype._callObserver(transaction, subs)        // single-type observe
    }
  })
)
fs.push(() => {
  // deep observe events
  transaction.changedParentTypes.forEach((events, type) => {
    if (type._dEH.l.length > 0 && (type._item === null || !type._item.deleted)) {
      events = events.filter(event => event.target._item === null || !event.target._item.deleted)
      events.forEach(event => { event.currentTarget = type; event._path = null })
      events.sort((event1, event2) => event1.path.length - event2.path.length)
      fs.push(() => {
        callEventHandlerListeners(type._dEH, events, transaction)   // deep observe
      })
    }
  })
  fs.push(() => doc.emit('afterTransaction', [transaction, doc]))
  // ...
})
```

`observe` fires per directly-modified type (line 282). `observeDeep` fires per parent type that contains a modified child (line 289 — keyed by `transaction.changedParentTypes`). Both run inside the same `callAll(fs, [])` call (line 320), so both complete BEFORE `afterTransaction` and BEFORE `afterAllTransactions`.

### Finding 7.2: Under a settlement-based bridge, the observe/observeDeep callback can be reduced to a "dirty flag" — actual sync work moves to `afterAllTransactions`.

**Confidence:** CONFIRMED (architectural reasoning grounded in 7.1)

The current code at `server-observers.ts:204-241` (`observerA` callback) does:
1. Origin-skip (self / paired-write).
2. Synchronously refresh baseline for paired writes.
3. Schedule debounced `runObserverASync` via `sched.setTimeout(..., 50)`.

If the bridge moves to `afterAllTransactions`-driven settlement:
- The observer callback can be replaced with a trivial `dirty = true` flag set inside an `observe`/`observeDeep` callback that just records "this drain touched the watched type with a non-skipped origin."
- `afterAllTransactions` consults the flag, reads current state, and writes.
- Alternatively: skip the intermediate observer entirely and inspect `transactions[].changed` / `transactions[].deleteSet` from inside the `afterAllTransactions` handler. The `transactions` array gives access to `transaction.changed: Map<AbstractType, Set<string|null>>` and `transaction.changedParentTypes: Map<AbstractType, YEvent[]>`, which together tell you whether the watched fragment was touched in this drain.

The "no observer at all" approach is the more idiomatic alternative — it eliminates one callback registration (less ceremony, less to clean up). The "dirty flag" approach is useful if the in-observer phase needs to do bookkeeping (e.g., capture origins for batch-skip checks).

**Implications:**
- We can drop `observeDeep(observerA)` entirely if `afterAllTransactions` does the work. The `transactions[]` argument carries everything we need to detect "did the XmlFragment change?" (check `transactionCleanups[i].changed` for the fragment type or its descendants, or `transactionCleanups[i].changedParentTypes`).
- Or: keep a minimal `observeDeep` callback that only does origin-skip + dirty-flag. This is closer to the current pattern, easier to migrate.
- Decision: keep observe minimal (origin-skip + dirty flag), do the work in `afterAllTransactions`. This preserves the "early-skip on self/paired-write" optimization without polluting the settlement handler with origin logic.

---

## D8 — `beforeAllTransactions` + accumulator pattern

### Finding 8.1: `beforeAllTransactions` provides a "drain start" hook with no per-transaction info — it predates any mutation.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:419-426`

```js
if (doc._transaction === null) {
  initialCall = true
  doc._transaction = new Transaction(doc, origin, local)
  transactionCleanups.push(doc._transaction)
  if (transactionCleanups.length === 1) {
    doc.emit('beforeAllTransactions', [doc])    // <-- single arg: just the doc
  }
  doc.emit('beforeTransaction', [doc._transaction, doc])
}
```

The `beforeAllTransactions` signature is `(doc: Doc) => void` — no transaction object. It fires before any mutations have been applied; the listener can capture pre-drain CRDT state (e.g., baseline serialization).

### Finding 8.2: A `beforeAllTransactions` + `afterAllTransactions` pair lets you implement "diff against pre-drain baseline" without per-transaction accounting.

**Confidence:** CONFIRMED (composition pattern grounded in 8.1)

Pattern:
```ts
let preDrainXmlMd = '';
doc.on('beforeAllTransactions', (d) => {
  preDrainXmlMd = serializeFragment(xmlFragment);
});
doc.on('afterAllTransactions', (d, transactions) => {
  const postDrainXmlMd = serializeFragment(xmlFragment);
  if (preDrainXmlMd !== postDrainXmlMd) {
    syncToYText(preDrainXmlMd, postDrainXmlMd);
  }
});
```

This is the y-prosemirror pattern (capturing relative selection in `beforeAllTransactions`, using it during in-drain observer fires, clearing in `afterAllTransactions`). The Open Knowledge bridge has the inverse need: capture state, react in `afterAllTransactions`, optionally use the captured state to compute the minimal-mutation diff.

### Finding 8.3: An accumulator approach (collect per-transaction info during the drain, reconcile in `afterAllTransactions`) is supported but rarely necessary.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:393` — `afterAllTransactions` receives `transactions: Transaction[]` already, so per-transaction info is available without an external accumulator.

Pattern (if you need per-transaction info during the drain rather than in the final batch):
```ts
const drainAccumulator: Array<{ origin: any; changed: Map<...> }> = [];
doc.on('beforeAllTransactions', () => { drainAccumulator.length = 0; });
doc.on('afterTransaction', (tr, doc) => {
  drainAccumulator.push({ origin: tr.origin, changed: tr.changed });
});
doc.on('afterAllTransactions', (doc, transactions) => {
  // Either inspect drainAccumulator (per-transaction info, populated incrementally)
  // or just iterate transactions[] directly (same data, reconstructed at end).
});
```

The accumulator only adds value if you need to react during the drain to PREVIOUS-in-drain transactions (e.g., to inform observer behavior during a later in-drain transaction's observer phase). For our use case, iterating `transactions[]` at `afterAllTransactions` time is simpler and sufficient.

**Implications:**
- We don't need an accumulator. `transactions[]` argument is the canonical "what just happened" surface.
- `beforeAllTransactions` is useful if we want a captured-baseline approach (preDrainXmlMd → postDrainXmlMd). This avoids relying on a long-lived `lastSyncedXmlMd` field that can drift across multi-doc test runs.

---

## D9 — TypeScript typing for hook callbacks

### Finding 9.1: `Doc` extends `ObservableV2<DocEvents>`; `on(name, fn)` is statically typed against `DocEvents[NAME]`.

**Confidence:** CONFIRMED
**Evidence:**
- `node_modules/lib0/observable.d.ts` (inferred from source — ObservableV2 is generic over the event-map type).
- `node_modules/yjs/dist/src/utils/Doc.d.ts:31` — `export class Doc extends ObservableV2<DocEvents>`.
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` — `DocEvents` type definition.

From `Doc.js:55-56`:
```js
/**
 * @extends ObservableV2<DocEvents>
 */
export class Doc extends ObservableV2 {
```

The `DocEvents` type:
```ts
export type DocEvents = {
  destroy: (arg0: Doc) => void;
  load: (arg0: Doc) => void;
  sync: (arg0: boolean, arg1: Doc) => void;
  update: (arg0: Uint8Array, arg1: any, arg2: Doc, arg3: Transaction) => void;
  updateV2: (arg0: Uint8Array, arg1: any, arg2: Doc, arg3: Transaction) => void;
  beforeAllTransactions: (arg0: Doc) => void;
  beforeTransaction: (arg0: Transaction, arg1: Doc) => void;
  beforeObserverCalls: (arg0: Transaction, arg1: Doc) => void;
  afterTransaction: (arg0: Transaction, arg1: Doc) => void;
  afterTransactionCleanup: (arg0: Transaction, arg1: Doc) => void;
  afterAllTransactions: (arg0: Doc, arg1: Array<Transaction>) => void;
  subdocs: (arg0: { loaded: Set<Doc>; added: Set<Doc>; removed: Set<Doc>; }, arg1: Doc, arg2: Transaction) => void;
};
```

`ObservableV2.on<NAME extends keyof EVENTS & string>(name: NAME, f: EVENTS[NAME])` (per `lib0/observable.js:30-37` JSDoc). So `doc.on('afterAllTransactions', (d, transactions) => ...)` is statically typed: `d: Doc`, `transactions: Transaction[]`. No `any` cast needed.

### Finding 9.2: `Transaction.origin` is typed as `any` — the only weak link.

**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:92-95`:

```js
/**
 * @type {any}
 */
this.origin = origin
```

The `origin` field is intentionally typed `any` because Yjs doesn't constrain what consumers pass in (could be a string, a class instance, an arbitrary object). Hocuspocus narrows this for its layer:

`@hocuspocus/server/src/types.ts` (referenced from `server-observers.ts:19`):
```ts
export type LocalTransactionOrigin = {
  source: 'local';
  context?: any;
  skipStoreHooks?: boolean;
};

export type TransactionOrigin =
  | LocalTransactionOrigin
  | { source: 'connection'; connection: Connection };
```

But the typing only constrains what Hocuspocus passes to `transact(...)`. When you receive a transaction in your handler, `tr.origin` is still `any` and you must narrow at the callsite (e.g., via type guard or identity check).

### Finding 9.3: Generic typing for the handler is achievable via a wrapper if we want type-safe origin matching.

**Confidence:** INFERRED (constructive proposal, not in source)

Pattern:
```ts
type EnforcedOrigin =
  | typeof OBSERVER_SYNC_ORIGIN
  | typeof AGENT_WRITE_ORIGIN
  | typeof FILE_WATCHER_ORIGIN
  | typeof ROLLBACK_ORIGIN;

function isEnforcedOrigin(o: unknown): o is EnforcedOrigin {
  return o === OBSERVER_SYNC_ORIGIN
      || o === AGENT_WRITE_ORIGIN
      || o === FILE_WATCHER_ORIGIN
      || o === ROLLBACK_ORIGIN;
}

doc.on('afterAllTransactions', (d, transactions) => {
  for (const tr of transactions) {
    if (isEnforcedOrigin(tr.origin)) {
      // tr.origin is now narrowed
    }
  }
});
```

This gives compile-time safety at the consumer site without changing Yjs's API. Combined with precedent #1 (typed-origin object refs), the identity-based `===` check is both runtime-correct and type-narrowing.

**Implications:**
- TypeScript types for the hooks themselves are fine — the hook signature is fully typed from `DocEvents`.
- For origin-aware logic, write a narrowed type guard (one per family of LocalTransactionOrigin objects) and use it inside the handler. No `any`/`unknown` in user code beyond the unavoidable `tr.origin: any` boundary.
- The "no any/unknown" directive is satisfiable: the boundary is one type guard; user code never touches `any` directly.

---

## Negative searches

- Searched: `as const` / generic origin parameterization in Hocuspocus's TypeScript surface beyond `LocalTransactionOrigin` → NOT FOUND. Hocuspocus does not generic-parameterize the `Document.transact` signature on origin type.
- Searched: any utility for typed origin-narrowing in `@hocuspocus/server/src/types.ts` → NOT FOUND. Consumers narrow at the callsite.

---

## Gaps / follow-ups

- We could PR Hocuspocus to genericize `Document.transact<O extends LocalTransactionOrigin>(fn, origin: O)` and tag the resulting transaction's origin type for downstream narrowing. This is out of scope for the bridge migration — we can ship with a local type guard pattern.
- The `tr.origin: any` is a Yjs-level limitation. Until Yjs adds a generic parameter to `Doc<O>` (no public RFC for this), origin narrowing remains a per-consumer concern.
