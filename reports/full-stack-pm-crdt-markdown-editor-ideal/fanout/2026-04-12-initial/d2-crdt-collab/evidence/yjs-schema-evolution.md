# Evidence: Y.js Schema Evolution — No Migration Story

## Sources
- `node_modules/yjs/src/types/YXmlElement.js` (v13.6.30)
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js` (v1.3.7)
- [Handling unknown nodes/marks in prosemirror schema](https://discuss.yjs.dev/t/handling-unknown-nodes-marks-in-prosemirror-schema/3683) — Kevin Jahns (Y.js maintainer)
- [What is the correct way to apply document migrations?](https://discuss.yjs.dev/t/what-is-the-correct-way-to-apply-document-migrations/2321) — Community discussion
- [Conversion doesn't check types (y-prosemirror #116)](https://github.com/yjs/y-prosemirror/issues/116) — Upstream issue
- [Schema versioning and migrations (ProseMirror)](https://discuss.prosemirror.net/t/schema-versioning-and-migrations/321)

## Key Finding: No Built-In Schema Migration in Y.js or y-prosemirror

### Y.js Layer: Schema-Agnostic Storage

Y.js stores `nodeName` as an opaque string with zero schema validation:

```javascript
// YXmlElement.js constructor (line 30)
export class YXmlElement extends YXmlFragment {
  constructor(nodeName = 'UNDEFINED') {
    super()
    this.nodeName = nodeName
    this._prelimAttrs = new Map()
  }
}

// Binary serialization (line 248-251)
_write(encoder, offset) {
  encoder.writeTypeRef(YXmlElementRefID)
  encoder.writeKey(this.nodeName)  // Raw string, no schema check
}
```

There is no version field, no type registry, and no compatibility check. The `nodeName` is stored and retrieved as a plain string.

### y-prosemirror Layer: Destructive on Mismatch

When y-prosemirror converts Y.XmlElements to ProseMirror nodes, unknown type names cause **permanent data deletion**:

```javascript
// sync-plugin.js line 801-811
try {
  const node = schema.node(el.nodeName, attrs, children)  // Throws if unknown type
  meta.mapping.set(el, node)
  return node
} catch (e) {
  // DESTRUCTIVE: deletes the element from the Y.Doc
  el.doc.transact((transaction) => {
    el._item.delete(transaction)
  }, ySyncPluginKey)
  meta.mapping.delete(el)
  return null
}
```

### Schema Change Impact Matrix

| Operation | Y.js Impact | y-prosemirror Impact | Data Safety |
|-----------|------------|---------------------|-------------|
| Add new node type | None | None (old docs don't use it) | **Safe** |
| Remove node type | None | Elements with old name **deleted** | **DATA LOSS** |
| Rename node type | None | Elements with old name **deleted** | **DATA LOSS** |
| Add attribute to type | None | Missing attrs get schema defaults | **Safe** |
| Remove attribute | Old attr stays in Y.Doc | Old attr ignored by PM | **Safe** |
| Change attribute default | None | Only new nodes get new default | **Safe** |
| Change content model | None | `schema.node()` may throw → **deletion** | **RISKY** |
| Add new mark type | None | Old text lacks the mark, no issue | **Safe** |
| Remove mark type | Old format keys stay in Y.XmlText | `schema.mark()` throws → **text deletion** | **DATA LOSS** |

### Community Consensus

From the Y.js discussion forum:

> "Migrations are...the biggest glaring flaw with Yjs, and pretty much every local-first solution."

Kevin Jahns (Y.js maintainer) on handling unknown nodes:
> An "unknown" passthrough node type in y-prosemirror is "currently not planned."

### Recommended Mitigation Strategies

1. **Pre-migration Y.Doc walk**: Before deploying a schema change, walk all persisted Y.Docs and programmatically rename/transform Y.XmlElement instances. Must happen server-side before any client loads the new schema.

2. **Version gating**: Store a schema version in `Y.Map('meta')`. Clients detect version mismatch and force reload to get new code before loading Y.Doc state. Kevin Jahns recommends this approach.

3. **Version-suffix naming**: Name types with version suffixes (`paragraph_v2`). Keep old type definitions in the schema forever. Works but accumulates cruft.

4. **Markdown escape hatch** (this project's advantage): Because the project stores canonical content as markdown on disk, Y.Docs are ephemeral session state that gets rebuilt from disk on load. Schema changes are safe as long as the markdown parser/serializer handles both old and new formats.

## Implications for Greenfield Schema Design

1. **Choose node/mark names carefully** — changing them later is destructive for any in-flight Y.Docs
2. **The markdown storage layer provides a natural migration path** — Y.Docs are rebuilt from disk markdown, not from persisted Y.Doc binary state
3. **For pure-CRDT systems without a canonical text representation, schema evolution is a hard problem** with no first-class Y.js support
4. **Adding new node types is always safe** — only removal and renaming are destructive
