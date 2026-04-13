# y-codemirror.next v0.3.5 — Binding Architecture

## Source: `node_modules/y-codemirror.next/src/` (5 files)

### Core Binding: ViewPlugin (not StateField)

The binding uses `cmView.ViewPlugin.fromClass(YSyncPluginValue)` — a CodeMirror 6 EditorView plugin.

Configuration via Facet:
```js
export const ySyncFacet = cmState.Facet.define({
  combine(inputs) { return inputs[inputs.length - 1] }
})
```

### Local Edits (CM → Y.Text): `YSyncPluginValue.update()`

1. Guards against echo: if transaction carries `ySyncAnnotation` matching config, returns immediately
2. Translates CM changes via `update.changes.iterChanges()`:
   - Deletion: `ytext.delete(fromA + adj, toA - fromA)`
   - Insertion: `ytext.insert(fromA + adj, insertText)`
   - `adj` accumulator tracks offset drift
3. All mutations wrapped in `ytext.doc.transact(() => { ... }, this.conf)` — origin is the YSyncConfig object

### Remote Edits (Y.Text → CM): `_observer` callback

```js
this._observer = (event, tr) => {
  if (tr.origin !== this.conf) {
    const delta = event.delta
    const changes = []
    let pos = 0
    for (const d of delta) {
      if (d.insert != null) changes.push({ from: pos, to: pos, insert: d.insert })
      else if (d.delete != null) { changes.push({ from: pos, to: pos + d.delete, insert: '' }); pos += d.delete }
      else pos += d.retain
    }
    view.dispatch({ changes, annotations: [ySyncAnnotation.of(this.conf)] })
  }
}
```

### Echo Prevention (Symmetric)

```
CM local edit → update() → ytext.doc.transact(mutations, origin=syncConf)
  → Y.Text observer fires → origin === syncConf → SKIP

Remote Y.Text change → observer fires → origin !== syncConf
  → view.dispatch(changes, annotation=ySyncAnnotation)
  → update() fires → annotation === ySyncAnnotation → SKIP
```

### Cursor Preservation: Yjs Relative Positions

Remote selections use `Y.createRelativePositionFromTypeIndex()` to store cursors.
When remote edits change the document, relative positions automatically resolve to correct
new absolute positions. No explicit "adjust cursor by delta" logic needed.

### yCollab() API

```js
export const yCollab = (ytext, awareness, { undoManager = new Y.UndoManager(ytext) } = {})
```

Returns `cmState.Extension` containing:
- `ySyncFacet + ySync` — core sync ViewPlugin
- `yRemoteSelectionsTheme + yRemoteSelections` — remote cursor rendering (if awareness truthy)
- `yUndoManagerFacet + yUndoManager + domEventHandlers` — undo/redo (unless undoManager === false)

### UndoManager Integration

- `undoManager.addTrackedOrigin(syncConf)` — only tracks local CM edits
- Stack items store pre-change selection as YRange (relative positions)
- `_onStackItemPopped` restores cursor on undo/redo
- DOM `beforeinput` handler intercepts native undo/redo gestures
