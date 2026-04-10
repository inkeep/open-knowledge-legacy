# Evidence: Block-Level Structure in Y.Text

**Dimension:** D2 — Block-level structure in Y.Text (y-quill prior art)
**Date:** 2026-04-07
**Sources:** y-quill source code, Quill Delta format docs, Automerge 2.2 rich text schema, BlockSuite/AFFiNE source

---

## Key files referenced

- `y-quill/src/y-quill.js` — complete Quill binding (363 lines)
- Quill Delta format specification (quilljs.com/docs/delta)
- Automerge rich text schema (automerge.org/docs/reference/under-the-hood/rich-text-schema/)
- `blocksuite/packages/framework/std/src/inline/inline-editor.ts` — BlockSuite Y.Text usage

---

## Findings

### Finding: Quill Delta encodes block-level formatting as newline attributes
**Confidence:** CONFIRMED
**Evidence:** Quill Delta format documentation, y-quill source

Quill's Delta format represents block structure by attaching attributes to the newline character (`\n`) that terminates each line:
- `{ insert: "Heading text\n", attributes: { header: 1 } }` — H1
- `{ insert: "List item\n", attributes: { list: "bullet" } }` — bullet list
- `{ insert: "code\n", attributes: { "code-block": true } }` — code block

This is a flat representation — no tree nesting. The `\n` is the block delimiter, and its attributes define the block type.

### Finding: y-quill binds Quill to Y.Text including block formatting
**Confidence:** CONFIRMED
**Evidence:** y-quill/src/y-quill.js lines 240-276

y-quill observes Quill's `editor-change` events and applies them to Y.Text via `type.applyDelta(changes.ops)`. Block-level formatting (headings, lists, code blocks) flows through as attributes on retain/insert operations targeting newline characters. The binding is bidirectional — Y.Text changes emit deltas that are applied to Quill via `quill.updateContents(delta)`.

The binding is 363 lines total, handling text, embeds, cursors, and the negated-formats pattern.

### Finding: y-quill handles embeds via Y.XmlElement inside Y.Text
**Confidence:** CONFIRMED
**Evidence:** y-quill/src/y-quill.js lines 291-299

```javascript
// When Quill inserts an embed:
const yembed = new Y.XmlElement(embedName)
type.insertEmbed(index, yembed)
embedDef.update(yembed, op.insert[embedName], this)
```

Custom embeds are stored as Y.XmlElement children within Y.Text (using ContentType, not ContentEmbed). This provides full CRDT sub-structure for complex embeds. An `embeds` option maps embed names to conversion functions (update, eventsToDelta, typeToDelta).

### Finding: Automerge's Peritext implementation uses block markers in flat text
**Confidence:** CONFIRMED
**Evidence:** automerge.org/docs/reference/under-the-hood/rich-text-schema/

Automerge 2.2 encodes block structure by inserting "block marker" objects into the flat character sequence:
```
{ type: "heading", parents: ["blockquote"], attrs: { level: 2 } }
```
Text following a block marker until the next marker belongs to that block. The `parents` array enables hierarchical nesting (blockquote > ordered-list-item > paragraph) without tree structure.

### Finding: BlockSuite uses Y.Text for inline editing, Y.Map tree for block structure
**Confidence:** CONFIRMED  
**Evidence:** BlockSuite source code, blocksuite.io documentation

BlockSuite (AFFiNE's editor framework) uses a hybrid model:
- Block tree: Y.Map hierarchy for block-level document structure
- Inline content: Each block's rich text content is a Y.Text node
- Their `@blocksuite/inline` component binds directly to Y.Text for inline formatting

This is a "block tree + inline flat text" model, not a pure Peritext model. But it validates that Y.Text handles inline rich text correctly in production.

---

## Gaps / follow-ups

* The Quill newline-attributes approach for blocks is simpler than Automerge's block-marker approach but cannot represent arbitrary nesting (e.g., a list inside a blockquote inside a list). Automerge's `parents` array solves this.
* Neither approach has been used with ProseMirror (which requires a tree structure). The binding layer must reconstruct ProseMirror's block tree from either newline attributes or block markers.
