# Evidence: y-codemirror.next Binding Internals

**Dimension:** D1 — y-codemirror.next binding internals
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/y-codemirror.next/src/y-sync.js, src/index.js, src/y-undomanager.js

---

## Key files referenced

- `y-codemirror.next/src/y-sync.js` — Core sync plugin (YSyncPluginValue class, observer, CM update handler)
- `y-codemirror.next/src/index.js` — yCollab() entry point, extension composition
- `y-codemirror.next/src/y-undomanager.js` — UndoManager integration

---

## Findings

### Finding: y-codemirror.next uses the YSyncConfig instance as transaction origin
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:274,298

```js
// Line 274-298: When CM editor changes, writes to Y.Text using `this.conf` as origin
update (update) {
    if (!update.docChanged || (update.transactions.length > 0 && update.transactions[0].annotation(ySyncAnnotation) === this.conf)) {
      return
    }
    const ytext = this.conf.ytext
    ;/** @type {Y.Doc} */ (ytext.doc).transact(tr => {
      // ... delta computation ...
      ytext.applyDelta(d, this.conf.am)
    }, this.conf)  // <-- `this.conf` is the transaction origin
  }
```

**Implications:** The transaction origin is the `YSyncConfig` object instance. This is a unique object reference (not a string), so filtering on it requires access to the same object or using `!==` comparisons.

---

### Finding: Observer filters on transaction origin to distinguish local vs remote
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:236-253

```js
this._observer = this._ytext.observe((event, tr) => {
  let delta = null
  if (tr.origin === this.conf && this.conf.am !== Y.noAttributionsManager) {
    // Attribution-manager path (self-originated changes)
    const changes = Y.mergeIdSets([tr.insertSet, tr.deleteSet])
    delta = this._ytext.toDelta(this.conf.am, { itemsToRender: changes, retainInserts: true })
  } else if (tr.origin !== this.conf) {
    // Remote changes — different origin, apply to CM
    delta = event.getDelta(this.conf.am)
  }
  if (delta != null) {
    const { changes, decorations } = ydeltaToCmChanges(delta, tr.origin === this.conf)
    const dispatch = () => view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf), ...] })
    if (tr.origin === this.conf) { setTimeout(dispatch, 0) } else { dispatch() }
  }
})
```

**Implications:** Any transaction whose origin is NOT `this.conf` will be treated as "remote" and applied to the CodeMirror editor. This means our observer writing to Y.Text WILL be reflected in CodeMirror — as long as we use an origin different from the YSyncConfig instance. If we want the observer write to appear in CodeMirror, we simply use any other origin. If we want to suppress it from CodeMirror, we would need to use `this.conf` — but we don't have access to it from outside the binding.

---

### Finding: CM-to-Y.Text loop prevention uses ySyncAnnotation
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:270

```js
update (update) {
    if (!update.docChanged || (update.transactions.length > 0 && 
        update.transactions[0].annotation(ySyncAnnotation) === this.conf)) {
      return  // Skip — this CM change came FROM Yjs, don't echo back
    }
```

**Implications:** When the observer dispatches changes to CodeMirror with `ySyncAnnotation.of(this.conf)`, the `update()` method recognizes them and does NOT write them back to Y.Text. This is the bidirectional loop prevention. External writes to Y.Text → observer fires → dispatches to CM with annotation → CM `update()` sees annotation → skips writing back.

---

### Finding: yCollab() creates the YSyncConfig and uses it as the UndoManager tracked origin
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/index.js:20-21, y-undomanager.js:96

```js
// index.js
export const yCollab = (ytext, awareness, { undoManager = new Y.UndoManager(ytext), ... } = {}) => {
  const ySyncConfig = new YSyncConfig(ytext, awareness, attributionManager)
  // ...
}

// y-undomanager.js:96
this._undoManager.addTrackedOrigin(this.syncConf)
```

**Implications:** The YSyncConfig instance is used as the UndoManager's tracked origin. Only transactions with this origin are tracked for undo/redo. External writes to Y.Text (from our observer) with a different origin will NOT be part of the CM undo stack — which is correct behavior (undo in source mode should not undo WYSIWYG edits).

---

### Finding: External Y.Text replacement while binding is active triggers the observer synchronously
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:236-253

The observer registered in `YSyncPluginValue.constructor()` uses `this._ytext.observe()`. When any external code calls `ytext.applyDelta()` or writes to Y.Text via `doc.transact()`, the observer fires during transaction cleanup (see Transaction.js:520-537). The observer then dispatches the delta to CodeMirror.

For a full replacement (delete all + insert new), the observer will receive a single delta with delete + insert ops. CodeMirror will process this as a single CM transaction. This is the mechanism by which external Y.Text writes propagate to the editor.

**Implications:** Our one-way observer can safely call Y.Text operations (delete + insert) inside a `doc.transact()` and the y-codemirror.next binding will pick them up and update CodeMirror's view.

---

### Finding: The binding is destroyed by calling unobserve
**Confidence:** CONFIRMED
**Evidence:** y-codemirror.next/src/y-sync.js:301-303

```js
destroy () {
    this._ytext.unobserve(this._observer)
}
```

The `ySync` ViewPlugin (line 306) is a `cmView.ViewPlugin.fromClass(YSyncPluginValue)`. When the CM EditorView is destroyed (or the extension is removed), `destroy()` is called, which unobserves from Y.Text. There is no cleanup of Y.Text content or state — only the observer is removed.

**Implications:** Destroying the CodeMirror instance (or removing the yCollab extension) cleanly detaches from Y.Text without affecting Y.Text content. We can safely destroy and recreate the binding during mode toggles.

---

## Gaps / follow-ups

- The YSyncConfig instance is not exported or accessible from outside the binding. To filter on it, we would need to either (a) create our own yCollab setup with access to the config, or (b) use a different filtering approach.
