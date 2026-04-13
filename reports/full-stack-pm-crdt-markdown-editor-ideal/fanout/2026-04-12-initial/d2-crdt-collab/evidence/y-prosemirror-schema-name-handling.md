# Evidence: y-prosemirror Schema Name Handling

## Source
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js` (v1.3.7)
- `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (v3.0.3, fork of y-prosemirror)

## Key Finding: y-prosemirror is schema-name-agnostic

y-prosemirror does **not** hardcode any ProseMirror node or mark names. It uses the `nodeName` property of `Y.XmlElement` and the ProseMirror schema object dynamically at runtime. The only string literal used as a node/mark name is `'ychange'`, which is an internal tracking mark.

### Strict Name Matching (line 1305)

```javascript
const matchNodeName = (yElement, pNode) =>
  !(pNode instanceof Array) && yElement.nodeName === pNode.type.name
```

This is a strict `===` comparison between the Y.XmlElement's stored `nodeName` and the ProseMirror node's type name. No hardcoded names, no aliases, no fallbacks.

### Schema Lookup via `schema.node()` (line 801)

```javascript
const node = schema.node(el.nodeName, attrs, children)
```

The `el.nodeName` comes from the Y.XmlElement. ProseMirror's `schema.node()` does the name→type lookup. If the name doesn't exist in the schema, ProseMirror throws `RangeError`.

### Destructive Error Handling (lines 804-811)

```javascript
} catch (e) {
  // an error occured while creating the node. This is probably a result of a concurrent action.
  /** @type {Y.Doc} */ (el.doc).transact((transaction) => {
    /** @type {Y.Item} */ (el._item).delete(transaction);
  }, ySyncPluginKey);
  meta.mapping.delete(el);
  return null
}
```

When `schema.node()` throws (unknown type name OR invalid content/attrs), the Y.XmlElement is **permanently deleted** from the Y.Doc. This deletion propagates to all connected clients.

### Name Mismatch Guard in `updateYFragment` (lines 1147-1151)

```javascript
if (
  yDomFragment instanceof Y.XmlElement &&
  yDomFragment.nodeName !== pNode.type.name
) {
  throw new Error('node name mismatch!')
}
```

When updating an existing Y.XmlElement from a ProseMirror node, the names must match exactly. A mismatch throws an unrecoverable error.

### Mark Name Handling

Marks use the ProseMirror mark type's `.name` property, never hardcoded strings:

```javascript
// marksToAttributes (line 1121-1130)
pattrs[isOverlapping ? `${mark.type.name}--${hashOfJSON(mark.toJSON())}` : mark.type.name] = mark.attrs

// attributesToMarks (line 1105-1115) — reverse direction
marks.push(schema.mark(yattr2markname(markName), attrs[markName]))
```

The only filtered name is `'ychange'` (line 1124), which is y-prosemirror's internal change-tracking mark.

## Implications for Schema Design

1. **Any valid ProseMirror node/mark name works** — y-prosemirror is fully name-agnostic
2. **Node names are stored permanently** in the Y.Doc as Y.XmlElement `nodeName` strings
3. **Renaming a node type is destructive** — old Y.Docs contain elements with the old name, which will be deleted on load
4. **Mark names are stored as Y.XmlText format keys** — same renaming risk applies
5. **No compatibility layer exists** — there are no aliases, migrations, or fallback mechanisms
