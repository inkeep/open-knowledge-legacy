---
title: "Evidence: y-prosemirror Delta Model for ProseMirror Sync"
pipeline: milkdown-prosemirror-yjs
step: B.3 (ProseMirror to Yjs)
file: y-prosemirror/src/sync-utils.js
---

# y-prosemirror Delta Model

## Architecture

y-prosemirror uses a custom delta format (`$prosemirrorDelta`) that maps
ProseMirror's tree structure to Yjs's flat delta sequences with nesting.

File: `y-prosemirror/src/sync-utils.js`

### Key Delta Schema

```javascript
export const $prosemirrorDelta = delta.$delta({
  name: s.$string,
  attrs: s.$record(s.$string, s.$any),
  text: true,
  recursiveChildren: true
})
```

This defines a delta type that:
- Has a `name` (the ProseMirror node type name)
- Has `attrs` (the ProseMirror node attributes)
- Supports text operations (inline text inserts)
- Supports recursive children (nested deltas for block nodes)

### ProseMirror Node to Delta

```javascript
export const nodeToDelta = (n, nodeName = n.type.name) => {
  const d = delta.create(nodeName, $prosemirrorDelta)
  d.setAttrs(n.attrs)
  n.content.content.forEach(c => {
    d.insert(
      c.isText ? (c.text ?? []) : [nodeToDelta(c)],
      marksToFormattingAttributes(c.marks)
    )
  })
  return d.done(false)
}
```

Each ProseMirror node becomes a named delta. Text children are text inserts.
Block children are nested delta inserts.

### Document Diff to Delta

```javascript
export const trToDelta = (tr) => {
  const initialDelta = nodeToDelta(tr.before)
  const finalDelta = nodeToDelta(tr.doc)
  const resultDelta = delta.diff(initialDelta.done(), finalDelta.done())
  return resultDelta
}
```

Transactions are converted by diffing the before/after document states.
This produces a delta that can be applied to the Yjs document.

## Implications for MDX Test Case in Pipeline B

### HTML Atoms in the Delta

For Milkdown's `html` inline atoms, the delta looks like:

```
doc (delta name: "doc")
  insert: [
    paragraph (delta)
      insert: [
        html (delta, attrs: { value: "<Tabs>" })
      ]
    paragraph (delta)
      insert: [
        html (delta, attrs: { value: '<Tab title="Docker">' })
      ]
    heading (delta, attrs: { level: 2 })
      insert: "Using Docker" (text)
    paragraph (delta)
      insert: "First, " (text)
      insert: "build" (text, format: { strong: {} })
      insert: " the image:" (text)
    code_block (delta, attrs: { language: "bash" })
      insert: "docker build -t myapp ." (text)
    ... etc
  ]
```

### Concurrent Edit Mechanics

**Edit 1: User changes "build" to "create"**

Delta diff for this edit:
```
retain(heading_node)         -- skip the heading
modify(paragraph_node) {     -- enter the paragraph
  retain(7)                  -- skip "First, "
  retain(0, { strong: {} })  -- enter strong-formatted text
  delete(5)                  -- delete "build"
  insert("create", { strong: {} })  -- insert "create" with bold
}
```

This targets a specific text region within a specific paragraph node.

**Edit 2: Agent inserts new Tab**

Delta diff for this edit:
```
retain(existing_tab_close_paragraph)  -- skip to after </Tab> paragraph
insert([
  paragraph_delta({ children: [html_delta({ value: '<Tab title="Kubernetes">' })] }),
  heading_delta({ level: 2, children: ["Using Kubernetes"] }),
  paragraph_delta({ children: ["Content here"] }),
  paragraph_delta({ children: [html_delta({ value: '</Tab>' })] }),
])
```

This is a block-level insert between existing nodes.

### Conflict Resolution

These two edits are in DIFFERENT regions of the delta tree:
- Edit 1 modifies content INSIDE an existing paragraph
- Edit 2 inserts new nodes BETWEEN existing blocks

Yjs CRDT resolution handles this cleanly: the text edit and the block insert
are non-overlapping operations. Both will be applied correctly after merge.

**However**, if both edits targeted the SAME paragraph (e.g., both editing
text in the Docker tab content), Yjs would merge at the character level within
that text segment. For text content, this is correct behavior. For html atom
nodes (which are single units), concurrent modification of the same atom is
not possible -- one edit would replace the entire atom.

### Safety Properties

1. HTML atoms cannot be partially modified by concurrent edits (they are
   opaque delta units)
2. Block-level inserts between atoms are structurally safe
3. Text edits within content blocks merge correctly at character level
4. BUT: there is no validation that tag nesting is balanced after merge
