# Evidence: Observer Mechanics

**Dimension:** D3 — Observer mechanics for Y.XmlFragment → Y.Text sync
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/yjs/src/ytype.js, yjs/src/utils/Transaction.js, yjs/src/utils/YEvent.js

---

## Key files referenced

- `yjs/src/ytype.js:741-756` — observe() and observeDeep() registration
- `yjs/src/ytype.js:716-732` — _callObserver() and callTypeObservers()
- `yjs/src/utils/Transaction.js:500-542` — cleanupTransactions observer invocation
- `yjs/src/utils/Transaction.js:635-666` — transact() function
- `yjs/src/utils/YEvent.js:18-130` — YEvent class and getDelta()

---

## Findings

### Finding: observeDeep fires for any mutation in the type tree; observe fires only for direct children
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js:741-756

```js
observe (f) {
    addEventHandlerListener(this._eH, f)
    return f
}

observeDeep (f) {
    addEventHandlerListener(this._dEH, f)
    return f
}
```

And yjs/src/utils/Transaction.js:527-539:

```js
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
      const deepEventHandler = events.find(event => event.target === type) || new YEvent(type, transaction, new Set(null))
      callEventHandlerListeners(type._dEH, deepEventHandler, transaction)
    }
  })
})
```

`observe()` handlers are called via `_callObserver` which is invoked for each directly changed type. `observeDeep()` handlers are called via `changedParentTypes` which propagates up the parent chain.

**Implications:** For watching Y.XmlFragment changes, `observeDeep()` is correct — it catches changes to any nested element (paragraphs, text nodes, marks) within the fragment, not just direct child additions/removals.

---

### Finding: Observer callback signature is (event: YEvent, transaction: Transaction)
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js:737-744, yjs/src/utils/YEvent.js:18-65

The callback receives a `YEvent` with:
- `event.target` — the YType that was directly changed
- `event.transaction` — the Transaction object
- `event.transaction.origin` — the origin passed to `doc.transact(fn, origin)`
- `event.getDelta(am)` — the delta of changes
- `event.childListChanged` — boolean
- `event.keysChanged` — Set of changed attribute keys

For `observeDeep()`, the event's `target` may be a nested child, while `currentTarget` is the type you called `observeDeep()` on.

**Implications:** Inside the observer, we can inspect `transaction.origin` to filter. We can also call `event.getDelta()` to get the delta of changes, but for our use case we don't need the delta — we need to re-serialize the entire document.

---

### Finding: Observers fire AFTER the transaction function completes, during cleanup
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:500-542

```js
const cleanupTransactions = (transactionCleanups, i) => {
  // ...
  doc.emit('beforeObserverCalls', [transaction, doc])
  const fs = []
  // observe events on changed types
  transaction.changed.forEach((subs, itemtype) =>
    fs.push(() => {
      if (itemtype._item === null || !itemtype._item.deleted) {
        itemtype._callObserver(transaction, subs)
      }
    })
  )
  // ... deep observers ...
  callAll(fs, [])
```

This is called from `transact()` (line 654-666):

```js
if (initialCall) {
  doc._transaction = null
  if (finishCleanup) {
    cleanupTransactions(transactionCleanups, 0)
  }
}
```

Observers fire synchronously after the transaction body completes, before `transact()` returns to the caller. They fire in the same microtask.

**Implications:** When our observer fires (from Y.XmlFragment changes), it can safely call `doc.transact()` to write to Y.Text. This creates a NESTED transaction. Nested transactions are accumulated and cleaned up in order (line 614-619). The Y.Text observer (from y-codemirror.next) will fire during the cleanup of this nested transaction.

---

### Finding: Writing to Y.Text inside an observer requires a new transaction with a specific origin
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:635-643

```js
export const transact = (doc, f, origin = null, local = true) => {
  const transactionCleanups = doc._transactionCleanups
  let initialCall = false
  let result = null
  if (doc._transaction === null) {
    initialCall = true
    doc._transaction = new Transaction(doc, origin, local)
    transactionCleanups.push(doc._transaction)
```

If `doc._transaction` is already set (nested transaction), the function body `f` runs inside the existing transaction. If `doc._transaction` is null (no active transaction), a new one is created.

During observer execution, `doc._transaction` is null (it was set to null at line 655 before `cleanupTransactions` is called). So calling `doc.transact(fn, ourOrigin)` inside an observer WILL create a new transaction with our specified origin.

**Implications:** The recommended pattern:

```js
const OBSERVER_ORIGIN = 'xmlfragment-to-text-sync'

xmlFragment.observeDeep((event, transaction) => {
  if (transaction.origin === OBSERVER_ORIGIN) return // prevent infinite loop
  
  const markdown = serializeToMarkdown(xmlFragment)
  doc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, markdown)
  }, OBSERVER_ORIGIN)
})
```

The origin check `transaction.origin === OBSERVER_ORIGIN` prevents the observer from re-firing on its own writes. Since this observer is on Y.XmlFragment and we're writing to Y.Text, the observer would NOT fire anyway (different type). But if we also have a Y.Text observer, the origin filtering prevents loops.

---

### Finding: getDelta() on YEvent returns the structured delta of changes
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/YEvent.js:101-130

```js
getDelta (am = noAttributionsManager, { deep } = {}) {
    const itemsToRender = mergeIdSets([
      diffIdSet(this.transaction.insertSet, this.transaction.deleteSet), 
      diffIdSet(this.transaction.deleteSet, this.transaction.insertSet)
    ])
    // ...
    return this.target.toDelta(am, { itemsToRender, retainDeletes: true, ... })
}
```

**Implications:** For our use case, we do NOT need the delta. We need the full serialized content. The observer is merely a trigger — "something changed in XmlFragment, re-serialize the whole thing to Y.Text."

---

## Gaps / follow-ups

- Need to verify that observeDeep on a top-level XmlFragment catches text content changes (typing in ProseMirror)
- Confirm that Y.XmlFragment observeDeep fires BEFORE the Y.Doc 'update' event (yes — observers fire during cleanup, before the update event emission at Transaction.js:586)
