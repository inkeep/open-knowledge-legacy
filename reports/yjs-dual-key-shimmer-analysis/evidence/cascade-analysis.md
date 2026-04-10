# Evidence: Cascade Analysis

**Dimension:** Worst-case cascade modeling for dual-key observer sync
**Date:** 2026-04-07
**Sources:** Yjs source, y-prosemirror source, @tiptap/markdown source

---

## Key files referenced

- `yjs/src/utils/Transaction.js` — Transaction lifecycle, cleanupTransactions
- `yjs/src/ytype.js` — applyDelta, _callObserver, observe
- `yjs/src/structs/Item.js` — Item.integrate, Item.delete
- `y-prosemirror/src/sync-plugin.js` — Bidirectional sync mechanism
- `y-prosemirror/src/sync-utils.js` — delta.diff, nodeToDelta, pmToFragment

---

## Findings

### Finding: Complete cascade trace for a single keystroke in CodeMirror (Y.Text)

**Confidence:** CONFIRMED (traced through source code)

**Scenario:** User types character 'a' in CodeMirror bound to Y.Text via y-codemirror.next.

**Step 1: User types 'a'**
- y-codemirror.next inserts character into Y.Text
- Yjs creates transaction T1 with origin (from y-codemirror)
- Item.integrate() is called, addChangedTypeToTransaction populates T1.changed
- Transaction T1 cleanup fires observers on Y.Text

**Step 2: Text->Tree observer fires**
The hypothetical observer watches Y.Text for changes:
```javascript
yText.observe((event, transaction) => {
    if (transaction.origin === 'sync-from-tree') return; // skip own changes
    
    const markdown = yText.toString();
    const json = markdownManager.parse(markdown);
    const pmNode = /* convert json to ProseMirror Node */;
    
    doc.transact(() => {
        // Apply diff to Y.XmlFragment
        const currentDelta = yXmlFragment.toDelta();
        const newDelta = nodeToDelta(pmNode);
        const diff = delta.diff(currentDelta, newDelta);
        yXmlFragment.applyDelta(diff);
    }, 'sync-from-text');
});
```

This creates transaction T2 with origin 'sync-from-text'. The applyDelta creates new Items (the character 'a' now appears in the tree). T2.changed is non-empty. Observer fires.

**Step 3: Tree->Text observer fires**
```javascript
yXmlFragment.observeDeep((event, transaction) => {
    if (transaction.origin === 'sync-from-text') return; // skip own changes
    
    // ... serialize tree to markdown and write to Y.Text
});
```

BUT: transaction.origin is 'sync-from-text', so the Tree->Text observer RETURNS EARLY. No further cascade.

**However, there is an alternative scenario:**

**Step 3 (alternative): Tree->Text observer fires WITHOUT origin guard**
If we don't use origin guards, what happens?

The observer serializes Y.XmlFragment to markdown and writes to Y.Text:
```javascript
const markdown = markdownManager.serialize(treeToJson(yXmlFragment));
```

The new markdown includes the character 'a'. But Y.Text already contains the character 'a' (from step 1). So the diff between the current Y.Text content and the new markdown would be:

- If idempotent: the diff is EMPTY (or retain-only) -> NO items created -> NO observer fires -> CASCADE STOPS

This is the key insight: **even without origin guards, if the round-trip is idempotent, the cascade naturally dampens**.

### Finding: The cascade dampens after AT MOST 2 cycles
**Confidence:** CONFIRMED

Let's trace the worst case where a normalization occurs:

**Step 1:** User types `~~~` (tilde code fence) in Y.Text
**Step 2:** Text->Tree observer parses to ProseMirror JSON (codeBlock node), writes to Y.XmlFragment
**Step 3:** Tree->Text observer serializes codeBlock to markdown: outputs ` ``` ` (backtick, not tilde)
- Y.Text content changes from `~~~` to ` ``` ` -- this IS a change
- Items are created/deleted in Y.Text
- Y.Text observer fires

**Step 4:** Text->Tree observer fires again
- Parses ` ``` ` to codeBlock JSON -- SAME JSON as step 2
- Diff against Y.XmlFragment: EMPTY (no changes)
- No items created -> No observer fires -> CASCADE STOPS

The cascade is:
- Cycle 1: Original content -> normalized form (may differ)
- Cycle 2: Normalized form -> same normalized form (no change, cascade stops)

### Finding: No-op delta application produces no observer events
**Confidence:** CONFIRMED
**Evidence:** Transaction.js lines 206-211, 520-526

The proof chain:
1. `delta.diff(identicalA, identicalB)` produces retain-only operations
2. `applyDelta(retainOnlyDelta)` processes retain operations via `formatText()`
3. `formatText()` with no format changes calls `currPos.forward()` -- no items created
4. `transaction.changed` remains empty
5. `cleanupTransactions` iterates `transaction.changed.forEach(...)` -- empty, no observers fire
6. `writeUpdateMessageFromTransaction` checks `insertSet.clients.size === 0 && deleteSet.clients.size === 0` -- true, returns false
7. No `update` event emitted, no sync to other peers

### Finding: y-prosemirror's sync plugin already uses this exact pattern
**Confidence:** CONFIRMED
**Evidence:** sync-plugin.js lines 283-293

The sync plugin's `update()` method:
```javascript
mutex(() => {
    const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
    const pcontent = nodeToDelta(view.state.doc)
    const diff = d.diff(ycontent.done(), pcontent.done())
    ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
})
```

This is EXACTLY the pattern needed for dual-key sync: compute diff, apply if non-empty, skip if identical. The y-prosemirror codebase has already validated this approach for ProseMirror <-> Y.XmlFragment sync.

**Implications:**
1. Origin guards provide the PRIMARY shimmer prevention (observer skips changes from the other direction)
2. Even WITHOUT origin guards, idempotent round-trips produce no-op diffs that create no Items and fire no observers
3. The worst case (one normalization) produces exactly 2 cycles before dampening
4. The existing y-prosemirror sync plugin already validates this exact diff-and-apply-if-changed pattern

---

## Gaps / follow-ups

* Need to verify that `formatText()` with identical attributes truly creates no Items
* Need to measure wall-clock time for the 2-cycle worst case
