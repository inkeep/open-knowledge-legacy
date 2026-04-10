# Evidence: updateYFragment Behavior Under Concurrent Mutations

**Dimension:** File watcher → CRDT sync under concurrent external mutations
**Date:** 2026-04-07
**Sources:** y-prosemirror v1.x source (sync-plugin.js via GitHub), Hocuspocus types.ts, Outline DocumentHelper.tsx, Yjs community discussions

---

## Key files / pages referenced

- `y-prosemirror/src/plugins/sync-plugin.js` (v1.x master branch) — `updateYFragment` function
- `hocuspocus/packages/server/src/types.ts:7-50` — TransactionOrigin types (ConnectionTransactionOrigin, RedisTransactionOrigin, LocalTransactionOrigin)
- `outline/server/models/helpers/DocumentHelper.tsx:553` — Outline's usage of updateYFragment for server-side document replacement
- https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273 — Algorithm accuracy discussion
- https://discuss.yjs.dev/t/how-to-replace-prosemirror-content-in-ydoc-on-server-side/2625 — Server-side content replacement

---

## Findings

### Finding: updateYFragment performs a two-way diff against CURRENT CRDT state and will clobber concurrent mutations
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror sync-plugin.js (v1.x master)

The `updateYFragment` function:

1. Takes the Y.Doc (`y`), a Y.XmlFragment (`yDomFragment`), a ProseMirror Node (`pNode`), and a `mapping` object
2. Reads the CURRENT children of the Y.XmlFragment via `yDomFragment.toArray()` 
3. Reads the children of the ProseMirror Node (the "desired" state)
4. Performs a left-to-right / right-to-left matching scan to find unchanged prefixes/suffixes
5. For the unmatched middle section: deletes CRDT children and inserts new ones from the ProseMirror node

```javascript
// Critical section from updateYFragment:
const pChildren = normalizePNodeContent(pNode)
const yChildren = yDomFragment.toArray()  // <-- reads CURRENT CRDT state
// ...left/right matching...
y.transact(() => {
  // For unmatched middle: delete from CRDT, insert from ProseMirror node
  while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
    // tries to update in-place if same node type, otherwise:
    yDomFragment.delete(left, 1)
    yDomFragment.insert(left, [createTypeFromTextOrElementNode(leftP, mapping)])
  }
  // Delete any remaining CRDT children not in the ProseMirror node
  const yDelLen = yChildCnt - left - right
  if (yDelLen > 0) { yDomFragment.delete(left, yDelLen) }
  // Insert any remaining ProseMirror children not in CRDT
  if (left + right < pChildCnt) { /* insert remaining */ }
}, ySyncPluginKey)
```

**Scenario analysis: CRDT has [A, B', C, D], disk has [A, B, C], file watcher calls updateYFragment with disk content:**

1. `yChildren` = `[A, B', C, D]` (current CRDT state, includes agent's work)
2. `pChildren` = `[A, B, C]` (ProseMirror node created from disk content)
3. Left scan: A matches A → `left = 1`
4. Right scan: C matches C (from right) → `right = 1`
5. Unmatched middle: CRDT has `[B', D]` minus matched suffix, PM has `[B]`
6. The algorithm sees B' does not match B (different content), deletes B' from CRDT, inserts B
7. D is in the CRDT but not in PM → gets deleted

**Result: Agent's work (B' and D) is CLOBBERED.** The file watcher path silently overwrites concurrent CRDT mutations.

**Implications:** This is the critical flaw in Path 3 (external → disk → watcher → CRDT). Without mitigation, any concurrent writes by an agent via DirectConnection will be lost when the file watcher re-syncs disk content to CRDT.

---

### Finding: updateYFragment uses ySyncPluginKey as the transaction origin
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror sync-plugin.js

```javascript
y.transact(() => {
  // ... all mutations ...
}, ySyncPluginKey)  // <-- origin parameter
```

The transaction origin is `ySyncPluginKey`, which is a ProseMirror PluginKey. This means:
- All updateYFragment writes share the same origin
- There is no way to distinguish "file watcher calling updateYFragment" from "editor sync calling updateYFragment" based on origin alone
- A custom wrapper could use a DIFFERENT origin (e.g., `y.transact(() => { ... }, 'file-watcher')`) to tag file watcher writes

**Implications:** Transaction origins CAN be used for per-source conflict resolution, but only if the file watcher path uses its own custom origin instead of calling updateYFragment directly.

---

### Finding: Hocuspocus provides three distinct TransactionOrigin types
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/types.ts:7-25

```typescript
export interface ConnectionTransactionOrigin { source: "connection"; connection: Connection; }
export interface RedisTransactionOrigin { source: "redis"; }
export interface LocalTransactionOrigin { source: "local"; skipStoreHooks?: boolean; context?: any; }
```

DirectConnection writes use `{ source: "local", context }`. WebSocket writes use `{ source: "connection" }`. Redis sync uses `{ source: "redis" }`.

The `skipStoreHooks` flag on LocalTransactionOrigin (added in Hocuspocus v4) allows DirectConnection writes to opt out of triggering `onStoreDocument` — preventing a feedback loop where a DirectConnection write triggers persistence which triggers the file watcher.

**Implications:** A file watcher → CRDT path should use a custom LocalTransactionOrigin with `skipStoreHooks: true` to prevent re-persisting content that just came from disk.

---

### Finding: updateYFragment is a two-way diff with NO common ancestor awareness
**Confidence:** CONFIRMED
**Evidence:** Source code analysis

The function diffs current CRDT state vs. desired ProseMirror state. It has no concept of:
- What the state was when the file was last written to disk (common ancestor)
- Which parts of the CRDT were modified by concurrent writes vs. which were inherited from the last disk write
- Whether the "desired" state is older or newer than concurrent mutations

This is fundamentally a two-way diff: "make CRDT look like this ProseMirror node." It cannot implement three-way merge semantics because it has no third input.

---

### Finding: Outline uses updateYFragment for server-side document replacement (non-concurrent context)
**Confidence:** CONFIRMED
**Evidence:** outline/server/models/helpers/DocumentHelper.tsx:553

```typescript
updateYFragment(type.doc, type, doc, {
  mapping: new Map(),
  isOMark: new Map(),
});
```

Outline uses updateYFragment in `toState()` to apply API-imported document content to an existing Yjs document. This is NOT a concurrent context — the document is loaded from the database, modified, and saved back. No live editors are connected during this operation.

**Implications:** updateYFragment was designed for synchronization in controlled contexts (initial load, server-side import), not for live concurrent sync from a file watcher.

---

## Negative searches

* Searched: "updateYFragment concurrent" in y-prosemirror issues, Yjs Community forum → No documented cases of file-watcher-triggered concurrent clobbering (likely because few projects use this pattern)
* Searched: "three-way merge" in y-prosemirror, yjs repos → No built-in three-way merge for ProseMirror documents exists in the Yjs ecosystem

---

## Gaps / follow-ups

* The y-prosemirror v2.0.0 (new delta-based API in local oss-repos) replaces updateYFragment with a fundamentally different delta diff/apply approach. Need to assess whether v2's `applyDelta` approach has the same clobbering problem.
* The `computeChildEqualityFactor` heuristic in updateYFragment may partially mitigate clobbering in some structural scenarios — needs deeper analysis of edge cases.
