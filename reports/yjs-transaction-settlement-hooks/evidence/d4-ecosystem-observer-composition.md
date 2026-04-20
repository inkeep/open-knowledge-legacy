# Evidence: D4 — Observer composition pattern in y-prosemirror, y-codemirror.next, and ecosystem

**Dimension:** D4 — Prior art: how do ecosystem bridge libraries handle "observer fires, but I want to react after settlement"?
**Date:** 2026-04-16
**Sources:**
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js:330-345, 588-676` (sync-plugin observer + lifecycle hooks)
- `node_modules/y-prosemirror/src/plugins/undo-plugin.js:104-120`
- `node_modules/y-codemirror.next/src/y-sync.js:100-159` (YSyncPluginValue)
- https://github.com/yjs/y-monaco/blob/master/src/y-monaco.js (web-fetched if needed)

---

## Key files / locations referenced

- `y-prosemirror/src/plugins/sync-plugin.js:325` — `this._observeFunction = this._typeChanged.bind(this)`.
- `y-prosemirror/src/plugins/sync-plugin.js:335-345` — defines `beforeAllTransactions` (capture selection state) and `afterAllTransactions` (clear it).
- `y-prosemirror/src/plugins/sync-plugin.js:592-643` — `_typeChanged(events, transaction)` — the observeDeep callback that synchronously dispatches a PM transaction inside `mux(...)` for cross-write deduplication.
- `y-prosemirror/src/plugins/sync-plugin.js:662-676` — `initView` / `destroy`: registers `beforeAllTransactions` + `afterAllTransactions` event listeners AND `observeDeep`.
- `y-codemirror.next/src/y-sync.js:107-127` — `_observer = (event, tr) => { if (tr.origin !== this.conf) { ... } }` — uses single-type `observe`, dispatches CM transaction synchronously in the observer callback.

---

## Findings

### Finding 4.1: y-prosemirror uses BOTH `observeDeep` (for the actual sync work) AND `afterAllTransactions` (for selection bookkeeping bracket).

**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/src/plugins/sync-plugin.js:662-676`

```js
initView (prosemirrorView) {
  if (this.prosemirrorView != null) this.destroy()
  this.prosemirrorView = prosemirrorView
  this.doc.on('beforeAllTransactions', this.beforeAllTransactions)
  this.doc.on('afterAllTransactions', this.afterAllTransactions)
  this.type.observeDeep(this._observeFunction)
}

destroy () {
  if (this.prosemirrorView == null) return
  this.prosemirrorView = null
  this.type.unobserveDeep(this._observeFunction)
  this.doc.off('beforeAllTransactions', this.beforeAllTransactions)
  this.doc.off('afterAllTransactions', this.afterAllTransactions)
}
```

The `_observeFunction` (`_typeChanged`) does the actual sync: receive `(events, transaction)`, then `this.mux(() => { /* dispatch PM transaction */ })`. This runs INSIDE the transaction's observer phase — synchronously, in the same call stack as the original `doc.transact(...)`.

`beforeAllTransactions` captures the PM relative selection (line 336-340) once per drain, as a guard so that the per-event sync work can refer to a stable pre-transaction selection. `afterAllTransactions` resets the captured selection to `null` (line 343-344) once the entire drain is complete, so the next drain re-captures fresh state.

**Implications:**
- y-prosemirror does NOT debounce the sync work. It reacts at observer-fire time.
- `afterAllTransactions` is used for **per-drain bracket bookkeeping**, not for the actual sync work.
- This pattern works because the PM tree update IS the cross-CRDT sync (PM is the canonical view), and a synchronous `view.dispatch(tr)` inside the observer callback is fine for PM.

**Why our case differs:** Open Knowledge's bridge has **two** CRDT sides (Y.XmlFragment + Y.Text). A synchronous-in-observer write to the OTHER side from inside the observer would either:
- Re-trigger our own observer (infinite loop without origin guard), OR
- Conflate with concurrent updates that arrived in the same outer message but haven't been observed yet.

So we genuinely need a "settled" hook, not just an in-observer reactor — which is what `afterAllTransactions` provides.

---

### Finding 4.2: y-codemirror.next uses single-type `observe` (not `observeDeep`) and dispatches synchronously in the observer callback.

**Confidence:** CONFIRMED
**Evidence:** `y-codemirror.next/src/y-sync.js:107-127`

```js
this._observer = (event, tr) => {
  if (tr.origin !== this.conf) {
    const delta = event.delta
    const changes = []
    let pos = 0
    for (let i = 0; i < delta.length; i++) {
      const d = delta[i]
      if (d.insert != null) {
        changes.push({ from: pos, to: pos, insert: d.insert })
      } else if (d.delete != null) {
        changes.push({ from: pos, to: pos + d.delete, insert: '' })
        pos += d.delete
      } else {
        pos += d.retain
      }
    }
    view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf)] })
  }
}
this._ytext = this.conf.ytext
this._ytext.observe(this._observer)
```

Origin-skip is via `tr.origin !== this.conf` (the YSyncConfig instance is the origin object — the same identity-based pattern as our `OBSERVER_SYNC_ORIGIN`, precedent #1). No `afterAllTransactions`, no debounce. The observer runs once per Y.Text-touching transaction, dispatches a CM transaction immediately.

**Implications:**
- y-codemirror.next's bridge is "single-direction-per-callback" (Y.Text → CM, with the reverse handled by `update()` lifecycle method on the plugin). It doesn't need a settled-state hook because the reaction is local to one CRDT type.
- y-codemirror.next does NOT use `observeDeep` — `Y.Text.observe` is per-type and gives a single `event` object with a `delta`.

---

### Finding 4.3: y-prosemirror's `_typeChanged` reads the FULL fragment and reconstructs the PM doc — it doesn't rely on incremental delta application.

**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/src/plugins/sync-plugin.js:603-642`

```js
this.mux(() => {
  // Map deletions to PM mapping cleanup
  const delType = (_, type) => this.mapping.delete(type)
  Y.iterateDeletedStructs(transaction, transaction.deleteSet, (struct) => { ... })
  transaction.changed.forEach(delType)
  transaction.changedParentTypes.forEach(delType)
  // Rebuild PM fragment from current Y state
  const fragmentContent = this.type.toArray().map((t) =>
    createNodeIfNotExists(t, this.prosemirrorView.state.schema, this)
  ).filter((n) => n !== null)
  let tr = this._tr.replace(0, this.prosemirrorView.state.doc.content.size,
    new PModel.Slice(PModel.Fragment.from(fragmentContent), 0, 0))
  restoreRelativeSelection(tr, this.beforeTransactionSelection, this)
  // ...
  this.prosemirrorView.dispatch(tr)
})
```

The reaction reads `this.type.toArray()` — i.e., the CURRENT fragment state, not the delta — and reconstructs the PM doc from it. This pattern relies on the CRDT being internally consistent at observer-fire time (which it is, per Yjs semantics: observers fire after `transaction.afterState` is computed).

**Implications:**
- The "react after settlement" pattern (read current state) is the canonical Yjs ecosystem pattern, not the "apply delta" pattern.
- In an `afterAllTransactions` handler, you can do the same: read the current state of both CRDTs, compute the diff against your baseline, and apply minimal mutations — without needing to track per-event deltas.

---

### Finding 4.4: Neither y-prosemirror nor y-codemirror.next uses `setTimeout`-style debouncing for cross-CRDT sync.

**Confidence:** CONFIRMED
**Evidence:** Grep for `setTimeout|setImmediate|requestAnimationFrame|debounce` in both packages' `src/`:

- `y-prosemirror/src/plugins/sync-plugin.js:362` — `eventloop.timeout(0, () => { this._domSelectionInView = null })` — used ONLY to clear a per-tick caching of selection-in-viewport, not for sync debouncing.
- `y-codemirror.next/src/`: no `setTimeout` at all.

The ecosystem precedent is: **react synchronously inside the observer**, dedupe via origin guards (mux/annotation/origin object identity), and let the CRDT's own batching (one transaction per outer `transact` call) handle coalescing.

**Implications:**
- Open Knowledge's current 50ms `setTimeout` debounce is ecosystem-uncommon. The legitimate reason to debounce is to coalesce per-keystroke client edits into one cross-CRDT sync; but Yjs already provides that coalescing per-transaction. The 50ms exists because (a) the original implementation predates the move to server-authoritative observers, (b) it provided a defensive buffer when client and server both wrote, (c) it accommodated cross-Y.Doc-instance test setups where clients have their own bridge baselines.
- For the server-authoritative bridge, replacing `setTimeout` with `afterAllTransactions` aligns with ecosystem norms and removes timing-dependent test flake.

---

### Finding 4.5: undo-plugin and Awareness use `beforeTransactionSelection` (per-drain captured state) — confirms the bracket pattern.

**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/src/plugins/undo-plugin.js:104-120`

```js
this._undoManager.on('stack-item-added', (event) => {
  binding.beforeTransactionSelection = event.stackItem.meta.get(binding) || binding.beforeTransactionSelection
  // ...
})
```

The undo-plugin reads the binding's `beforeTransactionSelection` to attach to undo stack items. The bracket pattern (capture once before drain, use throughout, clear after drain) is reused across the plugin family.

**Implications:**
- The y-prosemirror codebase treats `beforeAllTransactions` / `afterAllTransactions` as a **drain-bracket** that lets in-drain reactors reference pre-drain state without each one re-capturing. This is a generalizable pattern that maps cleanly onto our bridge: capture baseline before drain, let `afterAllTransactions` consume it for sync work, reset baseline after.

---

## Negative searches

- Searched: `setTimeout|debounce` in `y-monaco/src/` (the third major Yjs editor binding) — checked via WebFetch fallback — same pattern: `observe` callback dispatches Monaco transaction synchronously, no debounce. (Not embedded as quote here; consistent with y-prosemirror / y-codemirror.next pattern.)
- Searched: any use of `requestIdleCallback` in the editor bindings → NOT FOUND.

---

## Gaps / follow-ups

- BlockSuite (single-CRDT structure) and Tiptap Collaboration (uses y-prosemirror under the hood) don't have a separate dual-CRDT bridge to compare against. The single-CRDT pattern doesn't need settlement-hook reasoning.
- Loro and Automerge ecosystems have their own settlement patterns (e.g., `Doc.commit()` in Automerge is explicitly the settlement boundary). Out of scope for this report.
