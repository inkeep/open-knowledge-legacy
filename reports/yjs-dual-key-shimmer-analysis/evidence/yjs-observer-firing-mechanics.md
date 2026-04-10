# Evidence: Yjs Observer Firing Mechanics

**Dimension:** Cascade analysis / Transaction origin guards / Observer no-op behavior
**Date:** 2026-04-07
**Sources:** Yjs source (yjs/src/), y-prosemirror source (y-prosemirror/src/)

---

## Key files referenced

- `yjs/src/utils/Transaction.js` — Transaction lifecycle, observer dispatch, origin field
- `yjs/src/ytype.js` — YType._callObserver, observe(), applyDelta()
- `yjs/src/structs/Item.js` — addChangedTypeToTransaction calls
- `y-prosemirror/src/sync-plugin.js` — Bidirectional sync mechanism, mutex guard

---

## Findings

### Finding: Transaction origin is stored and accessible to observers
**Confidence:** CONFIRMED
**Evidence:** Transaction.js line 56-57, 105, 635

```javascript
constructor (doc, origin, local) {
    // ...
    this.origin = origin
}
```

And `transact()`:
```javascript
export const transact = (doc, f, origin = null, local = true) => {
```

The `origin` parameter flows through:
1. `doc.transact(fn, origin)` sets `transaction.origin = origin`
2. Observer callbacks receive the transaction: `observe((event, transaction) => ...)`
3. The observer can check `transaction.origin` to filter

### Finding: Observers ONLY fire when items are inserted or deleted
**Confidence:** CONFIRMED
**Evidence:** Transaction.js lines 206-211, 520-526; Item.js lines 549, 650

Observer dispatch is driven by `transaction.changed` map:
```javascript
// Line 520
transaction.changed.forEach((subs, itemtype) =>
    fs.push(() => {
        if (itemtype._item === null || !itemtype._item.deleted) {
            itemtype._callObserver(transaction, subs)
        }
    })
)
```

The `changed` map is ONLY populated by `addChangedTypeToTransaction()`, which is called in exactly two places:
1. `Item.integrate()` (line 549) — when a new item is integrated into the document
2. `Item.delete()` (line 650) — when an item is deleted

**Critical implication:** If a transaction produces no new items and no deletions, `transaction.changed` remains empty, and NO observers fire.

### Finding: No-op transactions produce no updates
**Confidence:** CONFIRMED
**Evidence:** Transaction.js lines 178-185

```javascript
export const writeUpdateMessageFromTransaction = (encoder, transaction) => {
    if (transaction.deleteSet.clients.size === 0 && transaction.insertSet.clients.size === 0) {
        return false
    }
    // ...
}
```

If insertSet and deleteSet are both empty, `writeUpdateMessageFromTransaction` returns false, and the `update`/`updateV2` events are NOT emitted (lines 586-599 check `hasContent`).

### Finding: applyDelta with identical content produces no items
**Confidence:** CONFIRMED
**Evidence:** ytype.js lines 1033-1076

`applyDelta` processes delta operations inside a transaction:
- `$textOp` / `$insertOp` -> calls `insertContent()` which creates new Items
- `$retainOp` -> calls `formatText()` which only creates Items if formatting changes
- `$deleteOp` -> calls `deleteText()` which marks Items as deleted
- `$modifyOp` -> recurses into child types

If the delta between current content and new content has ONLY retain operations (no inserts, no deletes, no format changes), no Items are created or deleted. The `changed` map stays empty.

### Finding: lib0/delta.diff() produces a minimal diff
**Confidence:** INFERRED
**Evidence:** y-prosemirror/src/sync-plugin.js line 290, sync-utils.js line 319

The sync-plugin uses `delta.diff()` to compute the difference between Y.Type content and ProseMirror content:
```javascript
const diff = d.diff(ycontent.done(), pcontent.done())
```

If the two deltas are structurally identical, the diff should be a pure-retain delta (no insert/delete/modify operations). Applied to the Y.Type via `applyDelta()`, this would produce no new Items.

### Finding: y-prosemirror uses a mutex to prevent immediate re-entry
**Confidence:** CONFIRMED
**Evidence:** sync-plugin.js lines 221, 241, 284

```javascript
const mutex = mux.createMutex()
// ...
// Y.Type -> ProseMirror direction:
const yTypeCb = ytype.observeDeep(change => {
    mutex(() => {
        // apply Y changes to ProseMirror
    })
})
// ...
// ProseMirror -> Y.Type direction:
mutex(() => {
    const diff = d.diff(ycontent.done(), pcontent.done())
    ytype.applyDelta(diff, ...)
})
```

The mutex prevents SYNCHRONOUS re-entry: when the Y.Type observer is dispatching changes to ProseMirror, the ProseMirror -> Y.Type direction is blocked, and vice versa. This prevents infinite synchronous loops.

However, the mutex does NOT prevent ASYNCHRONOUS cascading: if the ProseMirror dispatch triggers a state update which triggers the view's `update()` method, the mutex may have been released by then.

### Finding: The sync plugin marks Y-originated transactions with metadata
**Confidence:** CONFIRMED
**Evidence:** sync-plugin.js lines 248-253

```javascript
ptr.setMeta('addToHistory', false)
ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({...}))
```

Transactions originating from Y.Type changes are tagged with `y-sync-transaction` metadata. The appendTransaction hook (lines 107-116) checks for this and skips if present.

**Implications:**
1. Transaction origin guards ARE supported by Yjs and usable for filtering
2. If a no-op delta is applied (content unchanged), NO observer fires -- this is the shimmer dampening mechanism
3. The mutex provides an additional layer of protection against synchronous cascading
4. The combination of these three mechanisms (origin guards + no-op detection + mutex) provides strong protection against shimmer

---

## Gaps / follow-ups

* Need to verify lib0/delta.diff behavior when deltas are identical (returns empty diff vs retain-only)
* Need to trace whether retain-only deltas still trigger any Items via formatText
