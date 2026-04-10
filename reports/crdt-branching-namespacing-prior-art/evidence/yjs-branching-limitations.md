# Evidence: Yjs Branching, Snapshots, and Version Control Capabilities

**Dimension:** Yjs ecosystem branching/versioning mechanisms
**Date:** 2026-04-02
**Sources:** Yjs docs (docs.yjs.dev), Yjs community (discuss.yjs.dev), GitHub (yjs/yjs, yjs/y-prosemirror, yjs/yjs-demos)

---

## Key files / pages referenced

- https://discuss.yjs.dev/t/document-branches-like-git-branches/697 -- Branch discussion with Kevin Jahns
- https://discuss.yjs.dev/t/for-versioning-should-i-store-snapshot-or-document-copies/2421 -- Versioning strategy
- https://discuss.yjs.dev/t/how-to-recover-to-the-specified-version/2301 -- Version recovery
- https://discuss.yjs.dev/t/snapshots-versioning/3866 -- Snapshot mechanics
- https://discuss.yjs.dev/t/restoring-tiptap-previous-state/3677 -- TipTap state restoration
- https://docs.yjs.dev/api/document-updates -- Update encoding API
- https://github.com/yjs/yjs-demos/tree/main/prosemirror-versions -- Versions demo

---

## Findings

### Finding: Yjs does NOT support git-style branching natively -- fork/merge produces interleaved (broken) content for text
**Confidence:** CONFIRMED
**Evidence:** discuss.yjs.dev/t/document-branches-like-git-branches/697

Kevin Jahns (dmonad, Yjs creator) confirmed:
- Updates have interdependencies that prevent selective (cherry-pick) merging
- Document cloning is possible, but true branching with independent histories contradicts CRDT merge semantics
- For text CRDTs (YText), merging concurrent edits from two forks interleaves characters, producing syntactically broken content

The fundamental issue:

```javascript
// Create fork
const fork = Y.encodeStateAsUpdate(docA);
const docB = new Y.Doc();
Y.applyUpdate(docB, fork);  // docB is now a copy of docA

// Both documents edited independently...
// docA: "Hello World" -> "Hello Beautiful World"
// docB: "Hello World" -> "Hello Amazing World"

// Attempt merge
const updateB = Y.encodeStateAsUpdate(docB);
Y.applyUpdate(docA, updateB);
// Result: "Hello BAeamuatiizfiunlg World" -- interleaved, NOT a merge
```

**Implications:** Yjs cannot serve as the merge mechanism for branch reconciliation. Branching must use isolation (separate Y.Docs) with application-level merge (text diffing, not CRDT merge).

### Finding: Y.snapshot() captures read-only point-in-time views but requires gc:false
**Confidence:** CONFIRMED
**Evidence:** docs.yjs.dev, discuss.yjs.dev discussions

Snapshot API:
- `Y.snapshot(doc)` -- captures `{ deleteSet, stateVector }` reference
- `Y.createDocFromSnapshot(originDoc, snapshot)` -- reconstructs a read-only doc at that point
- Requires `gc: false` on the origin doc (garbage collection disabled)
- The snapshot doc is read-only and cannot be edited
- No direct snapshot diffing API -- must materialize and compare text

Snapshot storage is efficient: "A snapshot is just a state vector + delete set, so it takes up very little space."

### Finding: Y.encodeStateAsUpdate / Y.applyUpdate can serialize and restore Y.Doc state
**Confidence:** CONFIRMED
**Evidence:** docs.yjs.dev/api/document-updates

```javascript
// Save state
const state = Y.encodeStateAsUpdate(doc);

// Restore into new doc
const newDoc = new Y.Doc();
Y.applyUpdate(newDoc, state);

// Incremental updates (delta)
const stateVector = Y.encodeStateVector(doc);
const delta = Y.encodeStateAsUpdate(remoteDoc, stateVector);
Y.applyUpdate(doc, delta);
```

This is the mechanism for branch creation: encode the main branch Y.Doc state, store it, and apply it to create the branch Y.Doc.

### Finding: Version recovery requires UndoManager workaround, not clean revert
**Confidence:** CONFIRMED
**Evidence:** discuss.yjs.dev/t/how-to-recover-to-the-specified-version/2301

The community-recommended approach for "reverting" to a previous version:
1. Create a temp doc from the snapshot: `Y.createDocFromSnapshot()`
2. Disable garbage collection temporarily
3. Use UndoManager to reverse changes since the snapshot point
4. Apply the reverse update to the original doc

This approach:
- Relies on non-public Yjs internals
- Is fragile across library upgrades
- Was described as an "ugly hack" even by community members
- Does NOT produce a clean "revert" -- it adds reverse operations to the history

### Finding: The prosemirror-versions demo shows snapshot viewing but NOT version switching
**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/yjs-demos/tree/main/prosemirror-versions

The demo enables:
- Creating named versions (snapshots)
- Viewing diffs between versions
- "Live Tracking" mode (read-only diff view)
- Requires `gc: false`

The demo does NOT:
- Switch the editor to a previous version for editing
- Load a different Y.Doc into the same ProseMirror instance
- Implement any branching concept

---

## Negative searches

- Searched Yjs docs for "branch", "fork" -> no API documentation
- Searched yjs GitHub issues for "branching" -> discussion only, no implementation
- Searched npm for "yjs-branching", "y-branches", "yjs-version-control" -> no packages found

---

## Gaps / follow-ups

- Yjs v2 plans (beta.yjs.dev) -- does the new version add any branching primitives?
- The y-prosemirror rewrite mentioned on discuss.prosemirror.net -- does it address document switching?
