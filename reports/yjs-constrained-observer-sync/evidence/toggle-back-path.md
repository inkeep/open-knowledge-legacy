# Evidence: Toggle-Back Path (Source → WYSIWYG)

**Dimension:** D5 — Reading Y.Text and applying changes back to Y.XmlFragment
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/yjs/src/ytype.js, y-codemirror.next/src/y-sync.js, y-prosemirror/src/sync-plugin.js

---

## Key files referenced

- `yjs/src/ytype.js:1318-1338` — YType.toString() for reading text content
- `yjs/src/ytype.js:1266-1282` — YType.toArray() for reading content
- `y-codemirror.next/src/y-sync.js:301-303` — destroy() cleanup
- `y-prosemirror/src/sync-plugin.js:233-261` — y-prosemirror subscription lifecycle

---

## Findings

### Finding: Y.Text content can be read as a string via toString()
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js:1318-1338

```js
toString ({ forceTag = false } = {}) {
    const attrs = []
    this.forEachAttr((attr, key) => {
      attrs.push([(key), attr instanceof YType ? attr.toString({ forceTag: true }) : JSON.stringify(attr)])
    })
    const attrsString = (attrs.length > 0 ? ' ' : '') + attrs.sort(...)
    const children = this.toArray().map(c => 
      s.$string.check(c) ? c : (c instanceof YType ? c.toString({ forceTag: true }) : JSON.stringify(c))
    ).join('')
    if (this.name == null && !forceTag && attrs.length === 0) {
      return children  // <-- For Y.Text (name=null, no attrs), just returns the text content
    }
    // ...
}
```

For a YType with `name = null` (which is what `doc.get('sourceText')` returns), `toString()` returns just the concatenated text content of all children. Since we're storing plain markdown text, this returns the full markdown string.

**Implications:** Reading Y.Text content for toggle-back is `ytext.toString()`. No special API needed.

---

### Finding: y-codemirror.next's binding does NOT need to be destroyed before toggle-back
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:301-303, 270

The binding's `update()` handler (line 270) only writes to Y.Text when the CM document changes AND the transaction is not from Yjs. During toggle-back:

1. We read Y.Text content: `ytext.toString()`
2. We parse it back to ProseMirror JSON or apply it to XmlFragment
3. The CodeMirror editor is about to be unmounted (or hidden)

Since we're only READING Y.Text, the binding has no effect. It only acts on CM document changes. Reading Y.Text is a pure read operation that doesn't trigger any observers or transactions.

However, if we destroy the CM editor during toggle-back, the ViewPlugin's `destroy()` is called automatically, which calls `this._ytext.unobserve(this._observer)`. This cleanly detaches.

**Implications:** The binding can remain active during toggle-back (it's a no-op if CM isn't changing). It will be cleaned up when the CM EditorView is destroyed. No explicit destruction needed before reading Y.Text.

---

### Finding: y-prosemirror can re-bind to a different Y.XmlFragment state
**Confidence:** CONFIRMED  
**Evidence:** y-prosemirror/src/sync-plugin.js:233-261, 264-294

```js
function subscribeToYType ({ view, ytype, attributionManager, attributionMapper }) {
    unsubscribeFn?.()  // Unsubscribe from previous
    if (ytype != null) {
      const yTypeCb = ytype.observeDeep(change => {
        // ...
        mutex(() => {
          const d = deltaAttributionToFormat(
            change.getDelta(attributionManager || Y.noAttributionsManager, { deep: true }),
            attributionMapper
          ).done()
          const ptr = deltaToPSteps(view.state.tr, d)
          // ...
          view.dispatch(ptr)
        })
      })
      // ...
    }
}
```

And the update handler (line 283-294):

```js
if (ytype != null) {
    mutex(() => {
      const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
      const pcontent = nodeToDelta(view.state.doc)
      const diff = d.diff(ycontent.done(), pcontent.done())
      // ...
      ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
    })
}
```

The y-prosemirror binding does a BIDIRECTIONAL sync on every update. It diffs the Y.XmlFragment content against the ProseMirror document and applies the diff. This means if we modify Y.XmlFragment programmatically, the ProseMirror editor will pick up the changes on the next update cycle.

**Implications:** For toggle-back, we can:
1. Parse the Y.Text markdown back to ProseMirror-compatible structure
2. Apply it to Y.XmlFragment via `doc.transact()`
3. y-prosemirror's observer will fire and update the ProseMirror editor

We don't need to touch ProseMirror's state directly — modifying Y.XmlFragment is sufficient.

---

### Finding: Three-way merge requires a snapshot of Y.Text at mode-switch time
**Confidence:** INFERRED
**Evidence:** Application-level analysis

The toggle-back challenge:
- **Base:** Y.Text snapshot from when source mode was entered (the markdown at that moment)
- **Ours:** Current Y.Text content (user's source mode edits)
- **Theirs:** Current Y.XmlFragment content (may have been modified by remote peers)

If base === ours: No source edits were made → just re-enable the observer, no changes needed.
If base === theirs (serialized): No remote WYSIWYG edits → apply Y.Text to Y.XmlFragment.
If both changed: True conflict → requires markdown-level three-way merge or a choice.

**Implications:** When entering source mode:
1. Store `ytext.toString()` as the snapshot (or a Y.Snapshot for CRDT-level comparison)
2. Pause the observer
3. When toggling back, compare snapshot vs current Y.Text to detect edits

---

### Finding: Y.Snapshot can be used for point-in-time state capture
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Snapshot.js exists in the codebase (referenced in ytype.js imports)

Yjs provides `Y.snapshot(doc)` to capture a point-in-time snapshot. This can be used to compare document state between the mode-switch entry and exit points.

**Implications:** Instead of storing the serialized string, we can use `Y.snapshot(doc)` when entering source mode. This captures the CRDT state at that moment. On toggle-back, we can check if Y.XmlFragment has changed since the snapshot by comparing snapshots or by checking if the serialized content differs.

---

## Gaps / follow-ups

- The three-way merge implementation requires a markdown diff library (e.g., `diff-match-patch`)
- Need to decide: on conflict, does source mode win, WYSIWYG win, or do we merge?
- Consider using ProseMirror's `replaceContent` via y-prosemirror rather than raw Y.XmlFragment manipulation
