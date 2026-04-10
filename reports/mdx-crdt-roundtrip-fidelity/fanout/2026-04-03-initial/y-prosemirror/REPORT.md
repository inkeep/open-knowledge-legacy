---
title: "y-prosemirror: ProseMirror Node to Yjs Type Mapping -- Source-Level Analysis"
date: 2026-04-03
parent_report: mdx-crdt-roundtrip-fidelity
status: complete
sources:
  - repo: https://github.com/yjs/y-prosemirror
    versions_analyzed: [v1.3.7, v2.0.0-2]
    local_path: ~/.claude/oss-repos/y-prosemirror
  - repo: https://github.com/ueberdosis/tiptap
    packages: [extension-collaboration, extension-collaboration-caret]
    local_path: ~/.claude/oss-repos/tiptap
  - package: "@tiptap/y-tiptap@3.0.2"
    note: "TipTap's fork of y-prosemirror v1.x, published as npm package"
confidence: high
---

# y-prosemirror: ProseMirror-to-Yjs Mapping

## Executive Summary

y-prosemirror exists in two fundamentally different architectures. **v1** (stable, used by TipTap) maps ProseMirror nodes to `Y.XmlElement` and `Y.XmlText` types. **v2** (pre-release, `@y/prosemirror 2.0.0-2`) replaces the entire mapping with a `lib0/delta`-based approach where ProseMirror documents are converted to/from a universal delta format, and the Y.Type stores deltas natively. Both versions store node attributes as individual key-value entries, enabling clean concurrent merges of different attributes on the same node.

For a CRDT-backed MDX visual editor, y-prosemirror (either version) provides significantly better attribute-level granularity than slate-yjs for custom node types, as long as custom component props are modeled as ProseMirror node attributes rather than serialized strings.

---

## 1. Version Architecture Overview

### v1 (1.3.7) -- XmlElement/XmlText Mapping

**Package:** `y-prosemirror@1.3.7`, peer dep `yjs@^13`

The v1 mapping is a direct structural isomorphism between ProseMirror's document tree and Yjs's XML types:

| ProseMirror Concept | Yjs Type | Evidence |
|---|---|---|
| Document (top-level) | `Y.XmlFragment` | `ydoc.get('prosemirror', Y.XmlFragment)` |
| Element node (paragraph, heading, etc.) | `Y.XmlElement(nodeName)` | `new Y.XmlElement(node.type.name)` |
| Text node(s) | `Y.XmlText` | `new Y.XmlText()` with delta applied |
| Node attributes | `Y.XmlElement.setAttribute(key, val)` | Individual key-value entries |
| Marks (bold, italic, link) | Formatting attributes on `Y.XmlText` | `{ insert: text, attributes: { bold: {} } }` |
| Overlapping marks (comments) | Hash-suffixed attribute names | `comment--abc123` |

**Source:** `evidence/v1-xmlelement-mapping.js`

The sync plugin (`ProsemirrorBinding` class) maintains a `ProsemirrorMapping` (`Map<Y.AbstractType, Node | Array<Node>>`) that tracks the correspondence between Yjs types and ProseMirror nodes. On ProseMirror changes, it calls `updateYFragment()` which diffs the PM tree against the Yjs tree and applies minimal mutations. On Yjs changes, it reconstructs PM nodes from the Yjs types via `createNodeFromYElement()`.

### v2 (2.0.0-2) -- Delta-Based Mapping

**Package:** `@y/prosemirror@2.0.0-2`, peer dep `@y/y@^14`

v2 is a complete rewrite. Instead of mapping to XML types, it uses `lib0/delta` as a universal intermediate representation:

| ProseMirror Concept | Delta Representation | Evidence |
|---|---|---|
| Document | Root delta (name=null) | `nodeToDelta(doc, null)` |
| Element node | Named delta with attrs | `delta.create(nodeName, $prosemirrorDelta)` + `d.setAttrs(n.attrs)` |
| Text content | String insert operations | `d.insert(text, formatting)` |
| Child elements | Nested delta inserts | `d.insert([nodeToDelta(child)], formatting)` |
| Node attributes | Delta attr entries | Individual `{key, value}` pairs |
| Marks | Formatting attributes on inserts | `{ markName: markAttrs }` |

**Source:** `evidence/v2-nodeToDelta-mapping.js`

The sync uses `delta.diff()` to compute minimal changes between the ProseMirror state and the Y.Type state, then applies those diffs in both directions. No explicit mapping table is maintained.

**Source:** `evidence/v2-sync-plugin-bidirectional.js`

---

## 2. The ySyncPlugin: Bidirectional Sync

### ProseMirror -> Yjs (on local edit)

**v2** (lines 283-294 of `sync-plugin.js`):
1. On `EditorView.update`, inside a mutex:
2. Get current Y.Type content as delta: `ytype.toDeltaDeep()`
3. Get current PM doc as delta: `nodeToDelta(view.state.doc)`
4. Compute diff: `delta.diff(ycontent, pcontent)`
5. Apply diff to Y.Type: `ytype.applyDelta(diff)`

**v1** (sync-plugin.js `_prosemirrorChanged()`):
1. On PM transaction (not from Yjs), inside a mutex:
2. Diff the PM doc tree against the Yjs type tree
3. Apply minimal mutations (setAttribute, insert, delete) to Y.Types
4. Update the mapping table

### Yjs -> ProseMirror (on remote edit)

**v2** (lines 237-256 of `sync-plugin.js`):
1. `ytype.observeDeep()` fires with a change event
2. Inside mutex, get the change delta: `change.getDelta({ deep: true })`
3. Convert to PM transaction steps: `deltaToPSteps(tr, delta)`
4. Dispatch with `y-sync-transaction` meta (skips undo stack)

**v1** (sync-plugin.js `_typeChanged()`):
1. `ytype.observeDeep()` fires with events array
2. For each event, compute affected PM positions from the mapping
3. Reconstruct affected PM subtrees from Yjs types
4. Build PM transaction with ReplaceStep operations

### Key Difference

v2's delta-based approach is more principled -- both directions use the same diff/apply mechanism on a common delta format. v1 uses different code paths for each direction, with more bespoke position-tracking logic that has been a source of bugs (see issues #121, #160, #161 in the repo).

---

## 3. Node Attribute Handling

### How attributes map (both versions)

ProseMirror node attributes are stored as **individual key-value entries** in the Yjs type, not as a single serialized blob.

**v2:** Each attr becomes a separate entry in the delta's attrs array. The `AttrStep` handler (sync-utils.js line 371) converts a PM attribute change to `delta.create().setAttr(key, value)`.

**v1:** Each attr is set via `Y.XmlElement.setAttribute(key, val)`, which creates a separate entry in the underlying Y.Map.

### MDX Component Props Example

For a ProseMirror node:
```js
{
  type: 'callout',
  attrs: {
    componentName: 'Callout',
    type: 'warning',
    collapsed: false
  }
}
```

**v2 delta:**
```
delta(name="callout", attrs=[
  {key: "componentName", value: "Callout"},
  {key: "type", value: "warning"},
  {key: "collapsed", value: false}
])
```

**v1 Yjs:**
```
Y.XmlElement("callout")
  .setAttribute("componentName", "Callout")
  .setAttribute("type", "warning")
  .setAttribute("collapsed", false)
```

### Critical Design Constraint

If a node stores its children as a **string attribute** (e.g., `attrs.children = '<p>text</p>'`), concurrent edits to that content will be **last-write-wins** on the entire string. To get character-level CRDT merging of child content, children MUST be ProseMirror child nodes (mapped to nested deltas in v2 or child Y.XmlText/Y.XmlElement in v1).

**Source:** `evidence/attr-handling-analysis.js`

---

## 4. Mark (Formatting) Storage

Marks are stored as **formatting attributes** on text inserts, using Yjs's native formatting model:

```js
// ProseMirror: text "hello" with bold mark
// -> Yjs delta: { insert: "hello", attributes: { bold: {} } }
//
// ProseMirror: text "click" with link mark
// -> Yjs delta: { insert: "click", attributes: { link: { href: "..." } } }
```

**Overlapping marks** (marks where `excludes === ''`, like comments) get special handling in v1:
- The mark name is hash-suffixed: `comment--abc123`
- This allows multiple instances of the same mark type to coexist on the same text range
- v2 handles this differently -- the delta format natively supports multiple formatting attributes

### Mark Merge Semantics

- Two users apply **different marks** to overlapping ranges -> clean merge (both marks applied)
- Two users apply **same mark** to overlapping ranges -> clean merge (both applied, unless mark excludes itself)
- One user applies mark, another edits text in same range -> clean merge (mark range adjusts via Yjs text CRDT)

---

## 5. Concurrent Edit Behavior

### Scenario: Two users edit DIFFERENT attrs on same node

```
User A: heading.attrs.level = 3
User B: heading.attrs.alignment = "center"
```

**Result: CLEAN MERGE.** Both attribute changes are applied. Each attribute is an independent key in the Yjs type (v1: separate Y.Map entries; v2: separate delta attr operations). Yjs merges them without conflict.

### Scenario: Two users edit SAME attr on same node

```
User A: heading.attrs.level = 2
User B: heading.attrs.level = 3
```

**Result: LAST-WRITE-WINS** by Yjs CRDT ordering (deterministic: higher clientID wins ties at the same logical timestamp). There is no semantic merge for scalar values.

### Scenario: Content edit + attr edit on same node

```
User A: inserts "hello" in paragraph content
User B: sets paragraph.attrs.alignment = "center"
```

**Result: CLEAN MERGE.** Content operations (text inserts/deletes) and attribute operations target different parts of the CRDT structure. In v1, content is in child Y.XmlText while attrs are on the parent Y.XmlElement. In v2, content is in the delta's children while attrs are in the delta's attrs array. These are independent.

### Scenario: Two users insert at same position

Same as standard Yjs behavior: both insertions are preserved, ordered by clientID. The delta format in v2 preserves this via `delta.diff()` which generates retain/insert operations.

---

## 6. The Conversion Functions: Edge Cases

### v2: `deltaToPSteps` (sync-utils.js lines 202-292)

This is the workhorse that converts a delta diff into ProseMirror transaction steps. Identified edge cases:

1. **Retain with format changes** (line 220-249): When retaining text with new formatting, it must handle both adding marks (`tr.addMark`) and removing marks (`tr.removeMark`). Node marks use `addNodeMark`/`removeNodeMark`.

2. **Modify operations** (line 255-258): For nested node changes, the modify op recurses into child deltas. The `currPos` tracker must correctly account for PM's opening/closing tag positions.

3. **Delete spanning multiple nodes** (line 267-289): Delete operations that span text node boundaries must iterate through PM's children, tracking node boundaries and text offsets.

4. **Node creation from delta** (`deltaToPNode`, lines 300-310): When creating PM nodes from deltas, attributes are extracted from the delta's attrs array, and children are recursively created. The PM schema validation (`schema.node()`) can throw if the delta produces invalid content.

### v2: `trToDelta` (sync-utils.js lines 326-341)

**Important implementation detail:** The function computes the delta by diffing the before/after document states, NOT by composing step-by-step deltas. The comment in the source (lines 326-336) explicitly states this is intentional:

> "Calculate delta from initial and final document states to avoid composition issues with delete operations. This is more reliable than composing step-by-step."

This means complex multi-step transactions are reduced to a single before/after diff, which is more robust but loses information about intermediate states.

### v1: `updateYFragment` (sync-plugin.js lines 1145+)

The v1 diff algorithm is more complex:
1. Compares PM node children against Yjs children
2. Walks both arrays simultaneously, looking for matches
3. Can handle insertions, deletions, and moves
4. Has special handling for text node merging/splitting

Known edge case (fixed in the codebase, from issue #160): When two `Y.XmlText` nodes exist adjacent to each other, `createNodeFromYElement` merges them to prevent character duplication.

---

## 7. Comparison with slate-yjs

| Dimension | y-prosemirror (v1/v2) | slate-yjs |
|---|---|---|
| **Node mapping** | Element -> Y.XmlElement (v1) or named delta (v2) | Node -> Y.Map (shared type) |
| **Text mapping** | Text -> Y.XmlText with formatting | Text -> Y.Text (leaf node) |
| **Attribute storage** | Individual key-value entries | Individual Y.Map entries |
| **Attribute merge** | Per-key, concurrent safe | Per-key, concurrent safe |
| **Mark/formatting** | Yjs formatting attributes (native) | Custom format attributes on Y.Text |
| **Nested content** | Y.XmlElement children (v1) / nested deltas (v2) | Y.Map with `children` Y.Array |
| **Schema enforcement** | ProseMirror schema validates on apply | Slate normalizer post-hoc |
| **Custom node types** | Any PM node type works (just a name string) | Any Slate element type works |
| **Overlapping marks** | Hash-suffixed names (v1), native in delta (v2) | Not natively supported |
| **Maturity** | v1: stable, production-used. v2: pre-release | Stable, less actively maintained |
| **Diff algorithm** | Tree diff (v1) or delta diff (v2) | Operation-based translation |

### Which is better for custom node types?

**Roughly equivalent**, with different tradeoffs:

- **y-prosemirror** benefits from ProseMirror's strict schema validation. If you define a custom node type in the PM schema with specific attrs, the binding automatically handles those attrs as individual CRDT entries. The schema enforces valid documents at apply-time.

- **slate-yjs** is more flexible (no schema enforcement by default) but also more dangerous -- invalid states can be applied and must be normalized after the fact.

- For MDX components specifically, both can model component props as node attributes with per-key CRDT merging. The critical requirement in both is: **children content must be child nodes, not string attributes.**

---

## 8. TipTap's @tiptap/extension-collaboration

**Finding:** TipTap's collaboration extension is a thin wrapper. It does NOT modify the mapping.

**Source:** `evidence/tiptap-collaboration-analysis.ts`

The actual binding comes from `@tiptap/y-tiptap` (v3.0.2), which is TipTap's maintained fork of y-prosemirror **v1.x**. It uses the `Y.XmlElement`/`Y.XmlText` mapping, not the v2 delta-based mapping.

What the TipTap extension adds on top:
1. **Undo/redo commands** with TipTap command API integration
2. **Keyboard shortcuts** (Cmd-Z, etc.)
3. **Content validation plugin** -- filters invalid Y.js transactions against PM schema, emitting `contentError` event
4. **UndoManager lifecycle management** -- preserves undo stack across view recreation (workaround for y-prosemirror issue #114)

The `@tiptap/extension-collaboration-caret` is similarly a wrapper around `yCursorPlugin` with TipTap-style API.

**There is no separate `@tiptap/y-tiptap` repository** -- it's published directly as an npm package maintained by the TipTap team.

---

## 9. v2 Attribution/Suggestion System

v2 introduces a sophisticated attribution and suggestion system (not present in v1):

- **Attribution marks**: `y-attribution-insertion`, `y-attribution-deletion`, `y-attribution-format`
- **Suggestion mode**: Changes are tracked as attributions rather than applied directly
- **Accept/Reject**: Can accept or reject tracked changes
- **Dual document model**: A suggestion doc forks from the main doc, with attributions tracking the diff

This is relevant for our editor because it demonstrates that y-prosemirror v2 can handle complex workflows beyond simple collaborative editing.

---

## 10. Implications for MDX CRDT Editor

### Recommended Approach

1. **Model MDX components as ProseMirror nodes** with individual attrs for each prop. This gives per-prop CRDT merging.

2. **Model children as PM child nodes**, NOT as string attrs. This gives character-level CRDT merging of content.

3. **Use TipTap** (which uses v1 mapping via `@tiptap/y-tiptap`) for the fastest path to production. The v1 mapping is stable and well-tested.

4. **Consider v2** if you need the attribution/suggestion system, or if the delta-based approach proves more robust for complex schema migrations.

### Risk: Schema Violations

Both v1 and v2 can produce invalid ProseMirror documents from concurrent edits (e.g., a node type change + content edit that produces content invalid for the new type). v1 handles this by deleting the offending Yjs node and returning null. v2 would let the PM schema throw on `schema.node()`.

TipTap's content validation plugin provides a safety net: it filters out transactions that would produce invalid documents, at the cost of potentially losing some concurrent edits.

### Risk: Complex Attrs

If an MDX component has attrs with complex values (arrays, nested objects), these are stored as **single values** in the CRDT. Concurrent edits to different parts of a complex value (e.g., two users editing different items in an array attr) will be last-write-wins on the entire value. To get fine-grained merging, complex values should be decomposed into separate flat attrs or modeled as child nodes.

---

## Files Analyzed

| File | Version | Lines | Purpose |
|---|---|---|---|
| `src/sync-utils.js` | v2 | 506 | Core delta mapping functions |
| `src/sync-plugin.js` | v2 | 311 | Bidirectional sync plugin |
| `src/commands.js` | v2 | 67 | PauseSync, configureYProsemirror |
| `src/positions.js` | v2 | 170 | PM position <-> Yjs RelativePosition |
| `src/cursor-plugin.js` | v2 | 276 | Awareness/cursor rendering |
| `src/keys.js` | v2 | 27 | Plugin keys |
| `src/plugins/sync-plugin.js` | v1.3.7 | ~1350 | Full v1 sync implementation |
| `src/lib.js` | v1.3.7 | ~380 | v1 conversion utilities |
| `tests/y-prosemirror.test.js` | v2 | 817 | Integration tests |
| `tests/complexSchema.js` | v2 | 284 | Test schema with custom nodes |
| `tests/tr.test.js` | v2 | 381 | Transaction-to-delta tests |
| `tiptap/packages/extension-collaboration/src/collaboration.ts` | latest | 257 | TipTap collaboration wrapper |
| `tiptap/packages/extension-collaboration-caret/src/collaboration-caret.ts` | latest | 189 | TipTap cursor wrapper |
