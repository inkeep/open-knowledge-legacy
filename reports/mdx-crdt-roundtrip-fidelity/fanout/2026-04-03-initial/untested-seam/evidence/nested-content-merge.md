---
type: evidence
source: slate-yjs mapping architecture + Yjs Y.XmlText nesting semantics
date: 2026-04-03
confidence: high (based on verified source code)
---

# Nested Content Merge Behavior

## Test Case: Tabs > Tab > Heading with Bold

```mdx
<Tabs>
  <Tab>
    ## Heading with **bold**
  </Tab>
  <Tab>
    ## Another heading
  </Tab>
</Tabs>
```

## Slate Representation

```javascript
{
  type: 'tabs',
  children: [
    {
      type: 'tab',
      children: [
        {
          type: 'heading',
          level: 2,
          children: [
            { text: 'Heading with ' },
            { text: 'bold', bold: true }
          ]
        }
      ]
    },
    {
      type: 'tab',
      children: [
        {
          type: 'heading',
          level: 2,
          children: [
            { text: 'Another heading' }
          ]
        }
      ]
    }
  ]
}
```

## Yjs Representation (via slate-yjs)

```
Y.XmlText (root sharedRoot)
  attrs: {}
  content delta:
    [{ insert: Y.XmlText_A }]    // The <Tabs> element

Y.XmlText_A (Tabs)
  attrs: { type: 'tabs' }
  content delta:
    [{ insert: Y.XmlText_B }, { insert: Y.XmlText_C }]

Y.XmlText_B (Tab 1)
  attrs: { type: 'tab' }
  content delta:
    [{ insert: Y.XmlText_D }]

Y.XmlText_C (Tab 2)
  attrs: { type: 'tab' }
  content delta:
    [{ insert: Y.XmlText_E }]

Y.XmlText_D (Heading 1)
  attrs: { type: 'heading', level: 2 }
  content delta:
    [{ insert: 'Heading with ', attributes: {} },
     { insert: 'bold', attributes: { bold: true } }]

Y.XmlText_E (Heading 2)
  attrs: { type: 'heading', level: 2 }
  content delta:
    [{ insert: 'Another heading' }]
```

## Key Findings

### 1. Every element is its own Y.XmlText instance

The nesting depth is: root -> Tabs -> Tab -> Heading -> text content.
Each non-text node is a separate Y.XmlText instance with independent
attributes and content.

### 2. Text is stored as Y.XmlText delta content (character-level CRDT)

The actual text "Heading with bold" lives inside Y.XmlText_D as delta
operations. Each character has its own position in the CRDT sequence.
Formatting marks (bold) are stored as delta attributes on character ranges.

### 3. Can two users edit text in different Tab components simultaneously?

**YES, fully independently.** User A editing text in Y.XmlText_D and
User B editing text in Y.XmlText_E are modifying completely separate
Y.XmlText instances. There is zero contention, zero conflict, and zero
cross-interference.

This works because each element embed creates a new Y.XmlText instance.
The only shared ancestor is Y.XmlText_A (the Tabs container), and edits
to the content of Y.XmlText_B and Y.XmlText_C do not propagate as
changes to Y.XmlText_A's content -- they are scoped to their respective
Y.XmlText instances.

### 4. Nesting depth concern: Yjs performance

Each nesting level adds a Y.XmlText instance. For the test case:
- Root: 1
- Tabs: 1
- Tab x 2: 2
- Heading x 2: 2
- Total: 6 Y.XmlText instances for a simple nested structure

For a realistic MDX document with 20 components, each containing 5 nested
elements with text: ~100+ Y.XmlText instances. Yjs handles this well --
Y.XmlText is lightweight -- but the observeDeep callback on the root will
fire for ANY change in ANY descendant. The slate-yjs handleYEvents must
traverse the event path to find the correct Slate path, which is O(depth).

### 5. The problem case: editing text INSIDE a void component

If an MDX component is marked as void in Slate (editor.isVoid returns true),
its children are not editable. But in Yjs, the Y.XmlText still has content.

A remote edit to a void element's content will generate Yjs events that
slate-yjs must translate to Slate operations. But Slate may reject these
operations because the target node is void. This creates a divergence:
Yjs state has the edit, Slate state rejects it.

slate-yjs Discussion #279 discusses this exact problem. The maintainer's
recommendation: avoid nested editors for voids, use normalization instead.
But this means MDX components with editable internal content cannot be
modeled as Slate voids -- they must be modeled as regular elements with
custom rendering. This has implications for how MDX nodes participate in
cursor navigation, selection, and deletion.

### 6. ProseMirror path: atom nodes vs editable nodes

In ProseMirror, `atom: true` nodes are similar to Slate voids -- their
content is not directly editable. MDX components could be atom nodes
(black boxes) or they could have editable content.

For y-prosemirror, atom nodes are represented as Y.XmlElement with no
content children. Non-atom nodes with content are Y.XmlElement with
Y.XmlFragment children containing the editable content.

The same problem applies: if an MDX component needs editable children,
it cannot be an atom node. But non-atom nodes must conform to the
ProseMirror schema's content rules, which must be defined for every
possible MDX component structure. This is a schema explosion problem.
