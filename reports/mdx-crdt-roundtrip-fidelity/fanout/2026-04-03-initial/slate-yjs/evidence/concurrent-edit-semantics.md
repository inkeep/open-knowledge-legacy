---
type: evidence
source: slate-yjs source code + Yjs CRDT semantics analysis
date: 2026-04-03
---

# Concurrent Edit Semantics Evidence

## How concurrency resolution works in this architecture

slate-yjs does NOT implement its own conflict resolution. It delegates entirely to Yjs CRDT types.
The mapping determines which Yjs type stores which data, and Yjs types have fixed merge semantics:

### Y.XmlText attributes (element properties like type, id, props)

Stored via: `yTarget.setAttribute(key, value)`

Yjs Map semantics apply: **Last-writer-wins (LWW) per key**.

Each attribute key is independently resolvable. If User A sets `props.type = 'warning'`
and User B sets `props.variant = 'outlined'` on the same node, both changes merge cleanly
because they are different keys.

If both users set the same key (e.g., `props.type`), the Yjs map conflict resolution
picks a deterministic winner based on client ID ordering. One value wins, the other is lost.

### Y.XmlText content (children / text)

Stored via: `yParent.insert()`, `yParent.delete()`, `yParent.insertEmbed()`

Yjs Text/XmlText CRDT semantics apply: **Interleaving merge for concurrent inserts**.

Text insertions at the same position from different users will be interleaved
(ordered by client ID). Deletions are commutative -- if both users delete the same
range, the result is a single deletion.

### Y.XmlText formatting (text marks like bold, italic)

Stored via: `yParent.format(start, length, attributes)`

Yjs formatting semantics apply: formatting ranges merge with LWW per attribute.
If User A bolds characters 5-10 and User B italicizes characters 7-15,
both formats apply to their respective ranges (bold 5-10, italic 7-15, both 7-10).

## Concrete scenarios for MDX components

### Scenario 1: Two users edit different props on same component

```
User A: Transforms.setNodes(editor, { type: 'warning' }, { at: componentPath })
User B: Transforms.setNodes(editor, { title: 'Note' }, { at: componentPath })
```

In Yjs: User A calls `yTarget.setAttribute('type', 'warning')`
        User B calls `yTarget.setAttribute('title', 'Note')`

Result: CLEAN MERGE. Different map keys, no conflict. Both attributes present.

### Scenario 2: Two users edit the same prop on same component

```
User A: Transforms.setNodes(editor, { type: 'warning' }, { at: componentPath })
User B: Transforms.setNodes(editor, { type: 'info' }, { at: componentPath })
```

In Yjs: Both call `yTarget.setAttribute('type', ...)` with different values.

Result: LAST-WRITER-WINS. One value survives, deterministically chosen by Yjs
(based on client ID / timestamp ordering in the CRDT). No error, but one edit is lost.
Both clients converge to the same value.

### Scenario 3: One user edits content, another changes a prop

```
User A: Inserts text "Hello" inside the component's children
User B: Transforms.setNodes(editor, { variant: 'outlined' })
```

In Yjs: User A modifies the Y.XmlText's content (insert delta)
        User B modifies the Y.XmlText's attributes (setAttribute)

Result: CLEAN MERGE. Content changes and attribute changes are independent
in Y.XmlText. No conflict whatsoever.

### Scenario 4: Two users edit text inside the same component

Standard Y.XmlText text CRDT behavior. Concurrent inserts at the same position
interleave. Concurrent inserts at different positions merge cleanly.

### Scenario 5: One user deletes a component, another edits it

The deletion wins for the structural operation. Yjs handles this by removing
the Y.XmlText embed. The other user's edits to attributes/content of the
deleted Y.XmlText are effectively lost.

## Important limitation: Nested object props

If a Slate node has `props: { style: { color: 'red', fontSize: 14 } }`,
the entire `props` value is stored as ONE Y.XmlText attribute:

```
yTarget.setAttribute('props', { style: { color: 'red', fontSize: 14 } })
```

This means if User A changes `props.style.color` and User B changes `props.style.fontSize`,
they BOTH write the entire `props` object. Result: LWW on the entire `props` key.
One user's changes are lost.

To get field-level merging of nested props, the props must be flattened to individual
top-level Slate node attributes.
