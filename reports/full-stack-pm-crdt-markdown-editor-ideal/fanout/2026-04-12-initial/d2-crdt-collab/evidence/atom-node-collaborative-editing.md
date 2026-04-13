# Evidence: Atom Node Support in y-prosemirror Collaborative Editing

## Source
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js` (v1.3.7)
- `node_modules/yjs/src/types/YXmlElement.js` (v13.6.30)
- Project atom nodes: `packages/core/src/extensions/{wiki-link,jsx-component,html-block-fidelity,link-ref-def-fidelity}.ts`

## Finding: Atom Nodes Are Fully Supported, with Caveats

### How Atom Nodes Map to Y.js

Atom nodes in ProseMirror (nodes with `atom: true` in the schema) have no editable children. In y-prosemirror, they map to `Y.XmlElement` instances just like non-atom nodes:

```
ProseMirror atom node → Y.XmlElement(nodeName) with attributes, no children
```

The `atom: true` flag is a ProseMirror schema-level concept. y-prosemirror and Y.js don't distinguish between atom and non-atom elements — the difference is that atom elements have no child Y.XmlText or Y.XmlElement instances.

### Attribute Concurrency Semantics

Atom node attributes are stored via `Y.XmlElement.setAttribute()`. Concurrent attribute edits follow Y.js's standard resolution:

| Scenario | Resolution |
|----------|-----------|
| Two users edit **different** attributes of same atom | Clean merge — independent keys |
| Two users edit **same** attribute of same atom | Last-write-wins by Lamport timestamp |
| One user edits attribute, another deletes the node | Delete wins (node gone, attrs irrelevant) |
| Two users insert atom nodes at same position | Both survive, ordered by client ID |

### Evidence from Project Atom Nodes

The project defines four atom node types:

1. **WikiLink** (`wiki-link.ts:65`) — `atom: true`, inline node
   - Attrs: `target`, `alias`, `section`
   - Concurrent: Two users editing `alias` of same link → last-write-wins

2. **JsxComponent** (`jsx-component.ts:20`) — `atom: true`, block node
   - Attrs: `componentName`, `type`, `children`, `rawSource`
   - Concurrent: Users editing different attrs (e.g., one edits `children`, another edits `type`) → clean merge

3. **HtmlBlock** (`html-block-fidelity.ts:14`) — `atom: true`, block node
   - Attrs: `rawHtml`
   - Concurrent: The entire HTML content is a single `rawHtml` string attribute → last-write-wins (no character-level CRDT for this content)

4. **LinkRefDef** (`link-ref-def-fidelity.ts:15`) — `atom: true`, block node
   - Attrs: `label`, `url`, `title`, `rawSource`

### The Attribute Granularity Problem

**Critical limitation:** When an atom node stores complex content as a single attribute (e.g., `rawHtml` containing `<div>hello world</div>`), concurrent edits to that content are **not character-level merged**. The entire attribute value is replaced atomically. This is fine for simple properties (`target`, `alias`) but problematic for attributes containing structured text.

### Y.XmlElement Attribute Storage (from YXmlElement.js)

```javascript
setAttribute(attributeName, attributeValue) {
  if (this.doc !== null) {
    transact(this.doc, transaction => {
      typeMapSet(transaction, this, attributeName, attributeValue)
    })
  } else {
    this._prelimAttrs.set(attributeName, attributeValue)
  }
}
```

Attributes are stored in `AbstractType._map` — each key maps to a Y.js Item with last-write-wins semantics. Complex objects are serialized atomically via `ContentAny`.

### Workaround for Fine-Grained Collaborative Atom Content

For atom nodes that need character-level collaborative editing of their content (e.g., code blocks stored as atoms), the recommended pattern is to use a nested Y.Text as an attribute value:

```javascript
const codeContent = new Y.Text()
codeContent.insert(0, 'console.log("hello")')
element.setAttribute('content', codeContent)
```

This gives character-level CRDT merging for the content while keeping the node atomic from ProseMirror's perspective. However, y-prosemirror's `createNodeFromYElement` does not natively support this — it calls `el.getAttributes()` which would return the Y.Text type reference, not a string.

## Implications

1. **Atom nodes work out-of-the-box** — no special handling needed in y-prosemirror
2. **Attribute edits are attribute-level atomic** — concurrent edits to different attrs merge cleanly
3. **Same-attribute concurrent edits are last-write-wins** — no character-level merge
4. **Schema design should prefer multiple small attributes over one large attribute** for atom nodes that might be collaboratively edited
