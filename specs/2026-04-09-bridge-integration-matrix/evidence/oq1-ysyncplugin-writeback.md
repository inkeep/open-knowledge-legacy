---
name: oq1-ysyncplugin-writeback
description: OQ1 investigation — ySyncPlugin's view.update callback writes ProseMirror state back to XmlFragment after every state change, including remote CRDT changes
type: factual
sources:
  - node_modules/@tiptap/y-tiptap/dist/y-tiptap.js (lines 230-268)
  - node_modules/@tiptap/extension-collaboration/dist/index.js (lines 169-176)
---

# OQ1: ySyncPlugin Write-Back Mechanism

## Key Finding

The `ySyncPlugin` from `@tiptap/y-tiptap` has a `view.update` callback (y-tiptap.js:230-268) that runs on EVERY ProseMirror state change. When `initialContentChanged` is true (after the first edit), it calls `_prosemirrorChanged(view.state.doc)` which writes the ProseMirror document state back to Y.XmlFragment via a Yjs transaction with origin `ySyncPluginKey`.

### The write-back path

```
Remote CRDT change (undo) arrives
→ ySyncPlugin._typeChanged() fires (y-tiptap.js:647-700)
→ Creates ProseMirror transaction with meta { isChangeOrigin: true }
→ prosemirrorView.dispatch(tr)
→ ProseMirror applies transaction
→ TipTap extensions may create appendTransactions
→ view.update() fires (y-tiptap.js:230-268)
→ Calls _prosemirrorChanged(view.state.doc) (y-tiptap.js:703+)
→ Writes ProseMirror doc state BACK to Y.XmlFragment
→ This XmlFragment write is a LOCAL transaction (origin: ySyncPluginKey)
→ Observer A fires (transaction.local === true, origin !== ORIGIN_TEXT_TO_TREE)
→ Observer A serializes XmlFragment → computes delta → applies to Y.Text
```

### Why this causes re-insertion

The `mux()` (mutex) call around `_prosemirrorChanged` prevents re-entrant loops between ySyncPlugin and ProseMirror. But it does NOT prevent Observer A from firing — Observer A's origin guard checks for `ORIGIN_TEXT_TO_TREE` ('sync-from-text'), not `ySyncPluginKey`.

When ySyncPlugin writes the post-undo ProseMirror state back to XmlFragment:
1. This is a LOCAL transaction → Observer A's `!transaction.local` guard passes
2. This has origin `ySyncPluginKey` → Observer A's `ORIGIN_TEXT_TO_TREE` guard passes (different origin)
3. Observer A fires → serializes XmlFragment → computes delta from lastSyncedXmlMd
4. If lastSyncedXmlMd was correctly refreshed by Option I (from the remote XmlFragment change), the delta should be empty → no re-insertion
5. BUT if ySyncPlugin's write-back slightly MODIFIES XmlFragment (e.g., normalizes attributes, adjusts text content, adds default marks), the serialized output differs from lastSyncedXmlMd, and Observer A applies a non-empty delta to Y.Text

### Hypothesis: ySyncPlugin write-back mutates XmlFragment

The `_prosemirrorChanged` function (y-tiptap.js:703+) calls `updateYFragment` which does a destructive tree replacement. Even if the ProseMirror content is semantically identical, `updateYFragment`'s diff algorithm may produce slightly different Y.XmlFragment items (different item IDs, different structure). This would cause the NEXT Observer A serialization to produce slightly different markdown, triggering a "delta" that re-inserts content.

### Confidence: CHALLENGED

**Challenge (design-challenge-v2):** lib0's `createMutex` (used by ySyncPlugin's `mux()`) likely PREVENTS the re-entrant `_prosemirrorChanged` call during remote change processing. When `_typeChanged` holds the mutex and dispatches the ProseMirror transaction, the `view.update` callback's `binding.mux()` call is silently dropped. This means the write-back path may never execute during remote changes, and the actual root cause of the Layer C failure remains unknown.

The diagnostic plan (US-020) is still correct — instrument the browser to capture ALL transaction origins during undo, not just ySyncPluginKey.

The mechanism is traced from source code. The exact trigger (which TipTap extension's appendTransaction creates the follow-up, or whether _prosemirrorChanged itself modifies the tree) needs browser-level instrumentation to confirm.

### Diagnostic plan (from D6)

Add `page.evaluate` logging to crdt-stress.spec.ts:
1. Before undo click: log ytext.length, xmlFragment.length, lastSyncedXmlMd.length
2. After undo click: poll every 500ms, log same metrics + "Observer A fired" count
3. Check if ytext.length increases after initially decreasing (re-insertion signal)
4. Check if xmlFragment items change between the remote undo and the ySyncPlugin write-back

### Potential fix (if hypothesis confirmed)

Add `ySyncPluginKey` to Observer A's origin guard:
```typescript
if (transaction.origin === ORIGIN_TEXT_TO_TREE) return;
if (transaction.origin === ySyncPluginKey) return;  // ← skip ySyncPlugin write-backs
```

This would prevent Observer A from syncing XmlFragment→Y.Text when the XmlFragment change came from ySyncPlugin's write-back of a remote CRDT change. The write-back is a no-op (ProseMirror → XmlFragment for the same content), so Observer A has nothing useful to sync.

Alternatively: check if `ySyncPluginKey` is importable from `@tiptap/y-tiptap` and use it in the guard. Or use a more general approach: if the XmlFragment content didn't semantically change (lastSyncedXmlMd === md), skip — which is already the guard at observers.ts:279.
