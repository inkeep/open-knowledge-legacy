---
title: NodeViewContent Feasibility for Inline-Editable Children
description: Investigation confirming TipTap's NodeViewContent supports editable rich-text content holes inside ReactNodeViewRenderer — Layer 3 is architecturally feasible.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: NodeViewContent creates contentDOM via ref injection
**Confidence:** CONFIRMED (source: tiptap/packages/react/src/NodeViewContent.tsx)

NodeViewContent renders a div with `ref={nodeViewContentRef}` and `data-node-view-content=""`. The ref callback in ReactNodeViewRenderer appends the `contentDOMElement` as a child.

## Finding 2: ReactNodeViewRenderer creates contentDOM for non-leaf nodes
**Confidence:** CONFIRMED (source: tiptap/packages/react/src/ReactNodeViewRenderer.tsx:90-111)

Constructor checks `!this.node.isLeaf` — if the node has a `content` spec, it creates a `contentDOMElement` and injects it into the `<NodeViewContent />` element.

## Finding 3: Working demo exists with ReactNodeViewRenderer + editable content
**Confidence:** CONFIRMED (source: tiptap/demos/src/Markdown/Full/React/index.tsx:22-82)

`CustomReactNode` extension with `content: 'block+'`, no `atom: true`, uses ReactNodeViewRenderer + `<NodeViewContent />` inside a styled React component. Full rich-text editing works inside the content hole.

## Finding 4: atom: true prevents contentDOM creation
**Confidence:** CONFIRMED

When `atom: true` is set, the node is treated as a leaf node — no contentDOM is created. Layer 3 requires removing `atom: true` and adding a `content` spec.

## Finding 5: Table cells validate the pattern at scale
**Confidence:** CONFIRMED (source: tiptap/packages/extension-table/src/cell/table-cell.ts)

Table cells use `content: 'block+'` with `isolating: true`. They support full rich-text editing inside non-atom nodes with custom rendering. Same pattern applies to component nodes.

## Implication for Layer 3

The transformation required:
1. Remove `atom: true` from jsxComponent extension
2. Add `content: 'block+'` to the node spec
3. Add `<NodeViewContent />` to JsxComponentView
4. Update renderHTML to include `0` (child slot marker)
5. Children become ProseMirror document fragments, not string attributes

**Risk assessment:** LOW — this is a well-tested pattern in TipTap's own table extension and demo code.
