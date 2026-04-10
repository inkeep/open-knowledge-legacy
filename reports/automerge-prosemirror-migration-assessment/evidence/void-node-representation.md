# Evidence: Void Node Representation

**Dimension:** D5 — Void node representation in Automerge flat text
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-prosemirror

---

## Findings

### Finding: Void/atom nodes are represented as block markers with `isEmbed: true`
**Confidence:** CONFIRMED
**Evidence:** src/traversal.ts lines 642-658, src/basicSchema.ts lines 139-179

In Automerge's rich text model, a void/atom node is a block marker in the CRDT sequence with `isEmbed: true`. The block marker occupies 1 position in the sequence (like an object replacement character). The traversal emits a `leafNode` event for it.

Example from basicSchema (image node):
```typescript
image: {
  automerge: {
    block: "image",
    isEmbed: true,
    attrParsers: {
      fromAutomerge: (block) => ({ src: block.attrs.src?.toString(), alt: block.attrs.alt, title: block.attrs.title }),
      fromProsemirror: (node) => ({ src: new am.ImmutableString(node.attrs.src), alt: node.attrs.alt, title: node.attrs.title }),
    },
  },
  inline: true,
  group: "inline",
  draggable: true,
  // ...
}
```

### Finding: jsxComponent void node would map naturally to this pattern
**Confidence:** INFERRED
**Evidence:** Architecture analysis based on image embed pattern

A jsxComponent node storing raw JSX as a string attribute would be:

```typescript
jsxComponent: {
  automerge: {
    block: "jsx-component",
    isEmbed: true,
    attrParsers: {
      fromAutomerge: (block) => ({ jsx: block.attrs.jsx?.toString() || "" }),
      fromProsemirror: (node) => ({ jsx: new am.ImmutableString(node.attrs.jsx) }),
    },
  },
  atom: true,
  inline: false,
  group: "block",
  attrs: { jsx: { default: "" } },
  // ...
}
```

In the Automerge document, this would appear as a block marker: `{ type: "jsx-component", parents: [], attrs: { jsx: "<MyComponent prop=\"value\" />" }, isEmbed: true }` occupying one position in the flat text sequence.

### Finding: This is structurally equivalent to Yjs Y.XmlElement representation
**Confidence:** CONFIRMED
**Evidence:** Comparison with Yjs void node model

In Yjs: void node = Y.XmlElement with no children, attributes stored on the element.
In Automerge: void node = block marker with `isEmbed: true`, attributes in `attrs` object.

Both take 1 position in the CRDT sequence. Both store attributes as key-value pairs. The migration is a 1:1 structural mapping.

---

## Gaps / follow-ups

- Large JSX strings as attributes: Automerge stores attrs as `MaterializeValue` — need to verify string size limits
- Nested component structures (component within component) would need careful schema design
