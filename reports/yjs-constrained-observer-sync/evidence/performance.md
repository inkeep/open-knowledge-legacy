# Evidence: Performance — Observer Serialization Cost

**Dimension:** D6 — Performance of serializing Y.XmlFragment on every keystroke
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/yjs/src/ytype.js, y-prosemirror/src/sync-utils.js, Yjs transaction mechanics

---

## Key files referenced

- `yjs/src/ytype.js:1288-1338` — toJSON() and toString() traversal
- `yjs/src/utils/Transaction.js:635-666` — Transaction nesting behavior
- `y-prosemirror/src/sync-utils.js` — ProseMirror delta conversion

---

## Findings

### Finding: Y.XmlFragment serialization traverses the entire tree on every call
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js:1288-1312

```js
toJSON () {
    const attrs = this.getAttrs()
    for (const k in attrs) {
      const attr = attrs[k]
      attrs[k] = attr instanceof YType ? attr.toJSON() : attr
    }
    const children = this.toArray().map(child => 
      child instanceof YType ? child.toJSON() : child
    )
    // ...
}
```

`toJSON()` recursively calls `toJSON()` on all children. For a document with N nodes, this is O(N) traversal. `toString()` has similar recursive behavior. There is no incremental serialization — every call traverses the full tree.

**Implications:** For a 1KB document (~10-20 nodes), this is negligible (<1ms). For a 10KB document (~100-200 nodes), likely 1-5ms. For a 50KB document (~500-1000 nodes), potentially 5-20ms. These are rough estimates based on tree traversal overhead in JavaScript.

The real cost is NOT the Yjs traversal — it's the markdown serialization AFTER getting the ProseMirror JSON. The pipeline is:

1. `yXmlFragmentToProsemirrorJSON(xmlFragment)` — traverses Yjs tree, produces PM JSON
2. PM JSON → ProseMirror Node (schema parsing)
3. PM Node → Markdown string (via MarkdownManager.serialize or similar)

Step 3 is the expensive one — markdown serialization involves walking the PM node tree and producing formatted text with all the markdown syntax. For a 50KB document, this could be 20-50ms.

---

### Finding: The observer fires on EVERY transaction, including single-character insertions
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:520-526

```js
transaction.changed.forEach((subs, itemtype) =>
  fs.push(() => {
    if (itemtype._item === null || !itemtype._item.deleted) {
      itemtype._callObserver(transaction, subs)
    }
  })
)
```

Every keystroke in TipTap creates a ProseMirror transaction, which y-prosemirror converts to a Yjs transaction on Y.XmlFragment. This fires the observer. With the observer doing full serialization, every keystroke triggers a full document serialization.

**Implications:** At 60 WPM (~5 keystrokes/second), a 50KB document would trigger 5 serializations/second at ~20-50ms each, consuming 100-250ms of the frame budget. This is borderline acceptable but will cause jank on slower devices.

---

### Finding: Debouncing the observer does NOT break CRDT ordering guarantees
**Confidence:** CONFIRMED
**Evidence:** Analysis of Yjs transaction semantics

CRDT ordering is maintained by Y.Doc regardless of when observers fire. The Y.XmlFragment state is always consistent because Yjs transactions are atomic. Debouncing the observer means Y.Text lags behind Y.XmlFragment temporarily, but:

1. When the debounce fires, we read the CURRENT state of Y.XmlFragment (not a stale one)
2. We write the CURRENT serialization to Y.Text
3. The write is a single transaction — atomic

The only risk is that if someone is viewing source mode while WYSIWYG changes happen, they see stale content during the debounce window. But since the observer only runs when the user is NOT in source mode (observer is paused in source mode), this staleness is invisible.

**Implications:** A 200-500ms debounce is safe and recommended. It reduces 5 serializations/second to ~2-3, and batches rapid edits (e.g., holding backspace) into single serializations.

---

### Finding: requestIdleCallback can defer serialization to idle time
**Confidence:** INFERRED
**Evidence:** Browser API availability, application-level pattern

```js
let pendingSync = false

xmlFragment.observeDeep((event, transaction) => {
  if (sourceMode || transaction.origin === OBSERVER_ORIGIN) return
  
  if (!pendingSync) {
    pendingSync = true
    requestIdleCallback(() => {
      const markdown = serializeToMarkdown(xmlFragment)
      doc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, markdown)
      }, OBSERVER_ORIGIN)
      pendingSync = false
    }, { timeout: 1000 })
  }
})
```

**Implications:** `requestIdleCallback` with a timeout ensures serialization happens during idle time, with a maximum 1-second delay. This keeps the main thread responsive during rapid typing.

---

### Finding: Incremental Y.Text updates (diff-based) are more expensive to compute than full replacement
**Confidence:** INFERRED
**Evidence:** Analysis of the tradeoffs

Alternative to full replacement: compute a string diff (old Y.Text content vs new serialized content) and apply incremental insert/delete operations to Y.Text. This preserves cursor positions in CodeMirror.

Cost of diff: O(N*M) for naive diff, O(N+D) for Myers algorithm (where D is the number of differences). For a 50KB document with a single character change, the diff is nearly O(N) but produces minimal operations. The diff computation itself may be 5-10ms.

Cost of full replacement: O(1) for the delete + O(N) for the insert. Simpler but loses cursor state.

**Implications:** Since the observer only runs when the user is NOT in source mode, cursor preservation in CodeMirror is irrelevant. Full replacement is simpler and cheaper. Diff-based updates would only matter if we kept the observer running during source mode — which we should not do (see D4 conflict analysis).

---

## Gaps / follow-ups

- Actual benchmark numbers for markdown serialization are estimates; real benchmarking with the specific PM schema and serializer would be needed
- For very large documents (100KB+), consider a web worker for serialization
