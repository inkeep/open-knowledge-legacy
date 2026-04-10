// SOURCE: y-prosemirror v2.0.0-2, src/sync-plugin.js
// The ySyncPlugin creates a bidirectional binding between ProseMirror and a Y.Type.

// DIRECTION 1: ProseMirror -> Yjs (lines 283-294)
// Triggered on EditorView update when the ProseMirror doc has changed.
//
// The mutex ensures only one direction fires at a time (prevents echo loops).
//
// view.update():
if (ytype != null) {
  mutex(() => {
    // Get current Yjs content as a delta
    const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
    // Get current ProseMirror doc as a delta
    const pcontent = nodeToDelta(view.state.doc)
    // Compute the diff
    const diff = d.diff(ycontent.done(), pcontent.done())
    // Strip attribution formatting if present
    if (attributionManager != null) { stripAttributionFormattingFromDelta(diff) }
    // Apply the diff to the Y.Type
    ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
  })
}

// DIRECTION 2: Yjs -> ProseMirror (lines 237-256)
// Triggered by Y.Type.observeDeep() when remote changes arrive.
//
const yTypeCb = ytype.observeDeep(change => {
  mutex(() => {
    // Get the delta of what changed, with attribution info
    const d = deltaAttributionToFormat(
      change.getDelta(attributionManager || Y.noAttributionsManager, { deep: true }),
      attributionMapper
    ).done()
    // Convert delta to ProseMirror transaction steps
    const ptr = deltaToPSteps(view.state.tr, d)
    ptr.setMeta('addToHistory', false)  // remote changes don't go to undo stack
    ptr.setMeta('y-sync-transaction', ...)
    view.dispatch(ptr)
  })
})

// KEY INSIGHT: Both directions use the SAME delta format as intermediate representation.
// The mutex prevents concurrent application in both directions.
// The diff algorithm (lib0/delta.diff) is crucial -- it computes the minimal delta
// between two states, avoiding unnecessary operations.

// ALSO: The `configureYProsemirror` command (src/commands.js) handles
// switching between Y.Types (e.g., switching to a suggestion doc):
//   1. Gets the Y.Type content as a delta
//   2. Gets the current PM doc as a delta
//   3. Computes diff and applies as PM transaction steps
