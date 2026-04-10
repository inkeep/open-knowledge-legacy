# Evidence: Conflict Between Observer Writes and y-codemirror.next Binding

**Dimension:** D4 — Bidirectional write conflict analysis
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/y-codemirror.next/src/y-sync.js, yjs/src/utils/Transaction.js

---

## Key files referenced

- `y-codemirror.next/src/y-sync.js:236-298` — Observer and update handler (full loop analysis)
- `yjs/src/utils/Transaction.js:635-666` — Nested transaction mechanics
- `y-codemirror.next/src/y-sync.js:270` — Loop prevention check

---

## Findings

### Finding: y-codemirror.next uses the YSyncConfig instance (not a string) as transaction origin
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:298

```js
}, this.conf)
```

Where `this.conf` is an instance of `YSyncConfig` (line 234). This is a unique object reference.

**Implications:** Our observer can use ANY origin that is not this specific object instance, and y-codemirror.next will treat our writes as "remote" and apply them to CodeMirror. There is no risk of accidentally matching the origin because it is an object reference, not a string.

---

### Finding: When both observer and binding write to Y.Text simultaneously, Yjs CRDT resolves correctly
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:635-643

Yjs transactions are serialized — there is no true concurrency within a single JavaScript execution context. The sequence is:

1. User types in WYSIWYG (TipTap) → y-prosemirror writes to Y.XmlFragment
2. Transaction completes → observers fire
3. Our observeDeep handler fires → serializes XmlFragment → writes to Y.Text in a new transaction
4. Our Y.Text transaction completes → y-codemirror.next's Y.Text observer fires
5. y-codemirror.next dispatches changes to CodeMirror

There is no conflict in this direction because operations are sequential in the event loop.

The conflict scenario is:

1. User types in CodeMirror (source mode) → y-codemirror.next writes to Y.Text
2. Simultaneously, someone types in WYSIWYG on another peer → remote update arrives → Y.XmlFragment changes → observer fires → writes to Y.Text

In this case:
- The local CodeMirror keystroke creates transaction T1 (origin: YSyncConfig)
- The remote XmlFragment update creates transaction T2 (origin: null/remote)
- Our observer fires from T2, creates transaction T3 (origin: our custom origin)
- T3 writes to Y.Text (full replacement: delete all + insert new)

This T3 will OVERWRITE the user's local Y.Text changes from T1, because it does a full replacement.

**Implications:** This is the critical conflict. A full-replacement write to Y.Text from the observer will destroy concurrent local edits in CodeMirror. This is why the observer MUST be paused while the user is in source mode, or we need a more sophisticated approach than full replacement.

---

### Finding: y-codemirror.next's observer correctly handles external full-replacement of Y.Text
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:236-253

When Y.Text content is replaced externally (delete all + insert new), the observer receives the delta:
- `[{ delete: oldLength }, { insert: newContent }]`

The binding converts this to CM changes and dispatches them. CodeMirror replaces its entire buffer. The cursor position is lost (it moves to position 0 or the end of the new content depending on CM's change mapping).

**Implications:** Full replacement works but is disruptive — cursor position, scroll state, and selection are lost. For a non-interactive observer sync (user not actively editing source mode), this is acceptable. For interactive source mode, this is a poor UX.

---

### Finding: The observer can be conditionally paused based on application state
**Confidence:** CONFIRMED
**Evidence:** This is an application-level pattern, not a library feature

```js
let sourceMode = false

xmlFragment.observeDeep((event, transaction) => {
  if (sourceMode) return  // Paused while user is in source mode
  if (transaction.origin === OBSERVER_ORIGIN) return
  
  const markdown = serializeToMarkdown(xmlFragment)
  doc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, markdown)
  }, OBSERVER_ORIGIN)
})
```

**Implications:** The observer should be paused when the user switches to source mode. While paused, Y.Text is the authoritative source (edited via CodeMirror). When toggling back to WYSIWYG, we read Y.Text and apply changes to Y.XmlFragment.

---

### Finding: Transaction origin filtering prevents y-codemirror.next from echoing observer writes back
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:244,270

The binding's observer check: `tr.origin !== this.conf` — since our observer uses a different origin (e.g., string 'xmlfragment-to-text-sync'), this evaluates to `true`, and the binding dispatches the change to CodeMirror.

The binding's update check: `update.transactions[0].annotation(ySyncAnnotation) === this.conf` — since the dispatched CM transaction IS annotated with `ySyncAnnotation.of(this.conf)`, the update handler skips it, NOT writing back to Y.Text.

**Implications:** The loop prevention chain is:
1. Our observer writes to Y.Text (origin: our string)
2. y-codemirror.next observer fires (origin !== conf → process it)
3. Dispatches to CM (annotated with ySyncAnnotation)
4. CM update handler sees annotation → skips → no write back to Y.Text

No infinite loop. Confirmed by tracing the full code path.

---

### Finding: Remote peer edits to Y.XmlFragment while local user is in source mode create a conflict
**Confidence:** CONFIRMED
**Evidence:** Analysis of the update flow

If the observer is paused (user in source mode), remote WYSIWYG edits update Y.XmlFragment but NOT Y.Text. Y.Text drifts from Y.XmlFragment. When the user toggles back to WYSIWYG:
- If we blindly serialize Y.Text to XmlFragment, we lose the remote peer's edits
- If we diff Y.Text against a snapshot, we can three-way merge

**Implications:** The toggle-back path must handle concurrent remote edits. A snapshot of Y.Text at the time of entering source mode is needed for the merge.

---

## Gaps / follow-ups

- Need to design the three-way merge for toggle-back
- Consider whether debounced (not paused) observer is viable — with incremental text diffs instead of full replacement
