# Evidence: Existing Y.Text-to-ProseMirror Bindings

**Dimension:** D3 — Existing Y.Text-to-ProseMirror bindings
**Date:** 2026-04-07
**Sources:** y-prosemirror v14 source code, npm search, discuss.yjs.dev, discuss.prosemirror.net, BlockSuite, Liveblocks, automerge-prosemirror

---

## Key files referenced

- `y-prosemirror/src/sync-plugin.js` — sync plugin (310 lines)
- `y-prosemirror/src/sync-utils.js` — delta-to-PM-steps translation (505 lines)
- `y-prosemirror/src/commands.js` — configureYProsemirror command (66 lines)
- `automerge-prosemirror/src/` — Automerge's ProseMirror binding (3,272 lines)

---

## Findings

### Finding: y-prosemirror v14 uses a generic delta protocol, not XML-specific code
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/sync-plugin.js, sync-utils.js

The refactored y-prosemirror operates entirely through:
- `ytype.toDeltaDeep(am)` — read Yjs state as a delta
- `ytype.applyDelta(diff, am)` — write PM changes as a delta to Yjs
- `ytype.observeDeep(cb)` — subscribe to Yjs changes

These are all methods on the base `YType` class (not XmlFragment-specific). The sync-utils.js converts between ProseMirror's node tree and a recursive delta format:

```javascript
export const $prosemirrorDelta = delta.$delta({
  name: s.$string,
  attrs: s.$record(s.$string, s.$any),
  text: true,
  recursiveChildren: true
})
```

This delta format supports named children (block nodes), attributes, text content, and formatting — mapping cleanly to ProseMirror's document model.

**Critical implication:** The current y-prosemirror may already work with a non-XmlFragment YType, since it only uses the generic delta interface. This needs empirical validation.

### Finding: No existing Y.Text-only ProseMirror binding exists on npm or GitHub
**Confidence:** CONFIRMED (negative search)
**Evidence:** npm search, GitHub search, discuss.yjs.dev, discuss.prosemirror.net

Searched:
- npm: "prosemirror y.text", "prosemirror flat text crdt", "prosemirror peritext"
- GitHub: "prosemirror Y.Text binding", "peritext prosemirror"
- discuss.yjs.dev: Y.Text vs Y.XmlFragment thread (#1662)
- discuss.prosemirror.net: CRDT threads

Result: Zero results for a ProseMirror binding using Y.Text instead of Y.XmlFragment. The only known editor-to-Y.Text bindings are y-quill (Quill), y-codemirror.next (CodeMirror), and BlockSuite's @blocksuite/inline.

### Finding: automerge-prosemirror is the closest architectural reference (3,272 lines)
**Confidence:** CONFIRMED
**Evidence:** automerge-prosemirror/src/ source analysis

Automerge's ProseMirror binding maps flat-text-with-marks-and-block-markers to ProseMirror's tree structure. Key components:
- `schema.ts` (313 lines) — SchemaAdapter with mark/node mappings, expand config
- `traversal.ts` (1,016 lines) — bidirectional traversal between spans and PM nodes
- `maintainSpans.ts` (547 lines) — incremental span maintenance from patches
- `syncPlugin.ts` (147 lines) — ProseMirror plugin for bidirectional sync
- `amToPm.ts` (334 lines) — Automerge spans to PM transactions
- `pmToAm.ts` (304 lines) — PM transactions to Automerge operations

The most complex part is `traversal.ts` — converting between the flat span representation (text spans + block markers) and ProseMirror's nested node tree. This is the same problem a Y.Text-to-ProseMirror binding would need to solve.

### Finding: Liveblocks wraps standard y-prosemirror — no custom binding
**Confidence:** CONFIRMED
**Evidence:** Liveblocks documentation

Liveblocks uses the standard Yjs provider model (Y.Doc sync over WebSocket) with standard y-prosemirror. No custom Y.Text binding.

### Finding: configureYProsemirror command supports live type switching
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/commands.js lines 38-66

```javascript
export const configureYProsemirror = (opts = {}) => (state, dispatch) => {
  // ...
  if (ytype) {
    const ycontent = deltaAttributionToFormat(
      ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
      pluginState.attributionMapper
    )
    tr.replaceWith(0, tr.doc.content.size, deltaToPNode(ycontent, tr.doc.type.schema, null))
  }
}
```

This command allows switching the bound YType at runtime. Originally designed for document switching, it could enable toggling between different Yjs representations.

---

## Gaps / follow-ups

* Whether y-prosemirror v14 actually works when given a flat Y.Text (without named children) requires empirical testing. The delta format supports `recursiveChildren: true` which implies nested structure is expected.
* The delta protocol abstraction is the key enabler — if the delta format can be made to work for both structured (tree) and flat (Peritext-style) representations, the binding layer becomes type-agnostic.
