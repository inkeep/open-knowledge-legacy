# Evidence: y-codemirror.next Integration Analysis

## Source
- `node_modules/y-codemirror.next/src/y-sync.js` (v0.3.5)
- `node_modules/y-codemirror.next/src/y-remote-selections.js`
- `node_modules/y-codemirror.next/src/y-undomanager.js`
- `node_modules/y-codemirror.next/src/index.js`

## Key Finding: Zero ProseMirror Coupling

y-codemirror.next operates exclusively on Y.Text and CodeMirror 6 APIs. It has **no imports, references, or coupling to ProseMirror** (model, view, state, or schema). The source-mode editor does not need to know about the PM schema.

### Binding Mechanism

The binding is established through `yCollab(ytext, awareness, opts)`, which returns a CodeMirror Extension array combining three ViewPlugins:

#### Y.Text → CodeMirror (y-sync.js lines 107-128)

```javascript
// Observer on Y.Text fires when remote changes arrive
const delta = event.delta  // [{insert: string} | {delete: number} | {retain: number}]
// Delta items converted to CodeMirror ChangeSpec objects
changes.push({ from: pos, to: pos, insert: d.insert })  // for inserts
changes.push({ from: pos, to: pos + d.delete, insert: '' })  // for deletes
```

#### CodeMirror → Y.Text (y-sync.js lines 133-154)

```javascript
// On CodeMirror state change, apply changes to Y.Text
ytext.doc.transact(() => {
  let adj = 0
  update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
    const insertText = insert.sliceString(0, insert.length, '\n')
    if (fromA !== toA) ytext.delete(fromA + adj, toA - fromA)
    if (insertText.length > 0) ytext.insert(fromA + adj, insertText)
    adj += insertText.length - (toA - fromA)
  })
}, this.conf)  // Origin for loop prevention
```

### Loop Prevention

Uses CodeMirror annotations (analogous to ProseMirror transaction metadata) to prevent echo loops:

```javascript
// ySyncAnnotation used to tag transactions originating from Y.Text sync
if (tr.origin !== this.conf) {
  // Only apply changes from external sources, not from our own sync
}
```

### API Surface

```javascript
// Main entry point
yCollab(ytext: Y.Text, awareness?: Awareness, opts?: { undoManager?: Y.UndoManager })

// Exported utilities
YSyncConfig   // Position conversion: toYPos(), fromYPos(), toYRange(), fromYRange()
YRange        // Serializable range wrapping Y.RelativePosition pairs
ySync         // ViewPlugin for bidirectional sync
ySyncFacet    // Facet for storing config
yRemoteSelections      // ViewPlugin for remote cursor rendering
yRemoteSelectionsTheme // Base theme for cursor styles
yUndoManager           // ViewPlugin for undo/redo
yUndoManagerFacet      // Facet for undo config
yUndoManagerKeymap     // Default keybindings (Mod-z, Mod-y, Mod-Shift-z)
```

### Contrast with y-prosemirror

| Aspect | y-prosemirror | y-codemirror.next |
|--------|--------------|-------------------|
| Y.js type | Y.XmlFragment (tree) | Y.Text (flat string) |
| Schema dependency | ProseMirror Schema required | None |
| Node type awareness | Yes (nodeName matching) | No |
| Mark awareness | Yes (format attributes) | No |
| Binding complexity | High (tree diffing, node creation) | Low (delta ↔ changes) |

## Implications

1. **Source mode and WYSIWYG mode can have completely independent schemas** — y-codemirror.next is a pure text binding
2. **Schema changes in ProseMirror do not affect the source editor binding** — only the observer bridge (Observer B: Y.Text → XmlFragment) is schema-aware
3. **The Y.Text serves as a schema-agnostic intermediary** — it stores raw markdown text, which is then parsed into whatever PM schema is current
4. **This architecture naturally supports schema migration** — change the schema, and the Y.Text content is re-parsed into the new schema structure on next Observer B trigger
