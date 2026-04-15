# Evidence: Yjs UndoManager internals

**Dimension:** D3 — Does Yjs UndoManager have built-in mechanisms to address origin-laundering?
**Date:** 2026-04-13
**Sources:** yjs source (node_modules) + GitHub issues

---

## Key sources referenced

- `node_modules/yjs/src/utils/UndoManager.js` — primary source
- `node_modules/yjs/src/structs/Item.js` — Item redo logic
- `node_modules/yjs/dist/src/utils/UndoManager.d.ts` — type definitions
- [yjs/yjs#273](https://github.com/yjs/yjs/issues/273), [#624](https://github.com/yjs/yjs/issues/624), [#157](https://github.com/yjs/yjs/issues/157), [#699](https://github.com/yjs/yjs/issues/699)

---

## Findings

### Finding 1: Configuration surface is exactly 6 options
**Confidence:** CONFIRMED

From `UndoManager.js:130-141, :165-172`:

| Option | Role |
|---|---|
| `captureTimeout` (500ms default) | Coalesces tracked tx into top StackItem |
| `captureTransaction` (pre-check hook) | Per-tx gate; false=drop |
| `deleteFilter` | Filters what undo can *delete* during stack replay |
| `trackedOrigins` (Set with `null` default) | Origin whitelist; matches `tr.origin` OR `tr.origin.constructor` |
| `ignoreRemoteMapChanges` (false default) | Only affects `parentSub`/Map branch of `redoItem` |
| `doc` | Handle |

No other hooks. Events (`stack-item-added`, `stack-item-popped`, etc.) fire AFTER capture — no way to inspect an already-captured StackItem *before* the stack grows.

### Finding 2: UndoManager drops untracked-origin transactions ENTIRELY
**Confidence:** CONFIRMED

`afterTransactionHandler` (`:211-267`) gates on three conditions (`:213-217`):
1. `captureTransaction(tr)` truthy
2. Some scoped type in `tr.changedParentTypes`
3. `tr.origin` (or its constructor) in `trackedOrigins`

**If any gate fails, the transaction is dropped.** No stack entry, no bookkeeping, no `keepItem` call. Items created by non-tracked transactions are **invisible** to the UM.

### Finding 3: StackItem contains only insertions+deletions, no cross-reference protection
**Confidence:** CONFIRMED

When captured, StackItem contains two DeleteSets (`:229-246`):
- `insertions`: IDs added (from state-vector diff)
- `deletions`: the tx's own deleteSet

Then `keepItem(item, true)` on deleted items in scope (`:253-257`). That's it.

There's no linkage between one StackItem and a subsequent non-tracked transaction that overlays it.

### Finding 4: undo() can't reach zombie content by construction
**Confidence:** CONFIRMED — traced line-by-line

Zombie content scenario:
1. Tx A (`'agent-write'`): creates Item-A. UM captures → `StackItem{insertions: {Item-A.id}}`.
2. Tx B (`'sync-from-tree'`): deletes Item-A, creates Item-B. **UM does not fire** (origin not tracked).
3. `um.undo()`: pops StackItem. Iterates `insertions` → finds Item-A, sees it's already deleted (`!struct.deleted` fails at `:84`), **skips it**. Iterates `deletions` → empty. `performedChange` false → `currStackItem = null` (`:111`).

**Result:** silent no-op. Item-B (zombie) untouched because UM has no record.

### Finding 5: Only protection is for Y.Map/Y.Xml attrs, NOT Y.Text/Y.XmlFragment content
**Confidence:** CONFIRMED

`Item.js:209-222`: `redoItem` for `parentSub`-keyed items (Y.Map keys, Y.Xml attributes) checks whether the successor position has been overwritten by a non-tracked item. If so, redo is rejected with *"It is not possible to redo this item because it conflicts with a change from another client"*.

**For sequence/array items** (the `parentSub === null` branch, used by **Y.Text and Y.XmlFragment content**), there is **no such conflict check**. The redo pushes a new Item unconditionally.

Our problem domain (Y.Text, Y.XmlFragment) is exactly the unprotected branch.

### Finding 6: dmonad's canonical guidance is "use origins"
**Confidence:** CONFIRMED — explicit across multiple issues

- **[#273](https://github.com/yjs/yjs/issues/273)** (open, 2021): identical problem class documented. No built-in fix. Workaround: `captureTimeout: 0`.
- **[#624](https://github.com/yjs/yjs/issues/624)** (open): dmonad reaffirms origin filtering is THE mechanism. No "null=all" escape hatch.
- **[#157](https://github.com/yjs/yjs/issues/157)** (closed): dmonad's canonical recommendation: *"use the transaction origin to selectively capture operations."*
- **[#699](https://github.com/yjs/yjs/issues/699)** (open): UndoManager-created redo items carry semantically inconsistent origins — tangential but structurally related.

No issue mentions "origin laundering" by name. No documented fix beyond "pick a better origin policy."

### Finding 7: deleteFilter and captureTransaction don't help
**Confidence:** CONFIRMED

- **deleteFilter:** Only invoked when undo replay is about to delete an item from the *insertions* set (`:106`). Cannot prevent restoration of tombstoned content. Cannot examine `deletions`. Cannot see items outside the StackItem. Doesn't help.
- **captureTransaction:** Fires once per tx before gate checks. Returning false drops the tx. Offers no capability beyond `trackedOrigins`. Cannot retroactively evict a prior StackItem when a later tx overlays it.

---

## Bottom-line finding

**Yjs has NO built-in mechanism to address origin-laundering for Y.Text/Y.XmlFragment content.** The architectural contract Yjs enforces: *if two logically-distinct actors mutate the same region, they must use distinct transaction origins, and the UndoManager author must choose which origin set to track.*

Observer bridges that re-author content under a new origin are, from Yjs's perspective, distinct actors — and the UndoManager correctly refuses to reverse changes it didn't capture. **Zombie content after undo is an application-layer responsibility.**

dmonad's recommended solutions (from GitHub issues):
1. Make the observer bridge **propagate the original origin** (pass through 'agent-write' instead of using 'sync-from-tree')
2. Perform **pre-undo reconciliation** in a `stack-item-popped` / `stack-item-added` listener
3. Add the observer transaction's origin to `trackedOrigins` so its StackItem supersedes the prior one

---

## Implications for Open Knowledge

1. **Our approach (content-comparison gate) is application-layer** — consistent with the ecosystem's position.

2. **A cleaner alternative exists**: propagate the original origin. If Observer A could re-emit the agent's writes under `'agent-write'` origin (not `'sync-from-tree'`), the UndoManager would capture the replacement Items and undo would work correctly. This is approach #1 from dmonad's guidance above.

   BUT: this requires knowing the original origin of each character being re-emitted, which we don't have in Observer A's current architecture (no per-character attribution). Would require either XmlFragment events with origin preservation (option c from earlier analysis — architecturally new pattern) or a custom attribution layer.

3. **Our content-comparison approach is equivalent to dmonad's option #2** (pre-undo reconciliation) but applied at the sync-layer rather than the undo-layer. By preventing the delete+reinsert when content matches, we preserve the original Items → UndoManager's StackItem still references live Items → undo works.

4. **Character-level diff aligns with minimizing the "re-emitted byte" blast radius.** Fewer bytes re-emitted = fewer Items laundered.

---

## Gaps / follow-ups

- Implementing origin-propagation (option #1 from dmonad) would require XmlFragment event-driven sync. The `observer-b-web-worker` spec's evidence already discusses this. Cross-reference if this becomes a live alternative.
- Could we add Observer A's origin `'sync-from-tree'` to the agent UndoManager's `trackedOrigins`? That would make undo reverse sync-tree items too — but it would also make undo reverse user typing that flowed through Observer A, which is wrong. Not viable.
