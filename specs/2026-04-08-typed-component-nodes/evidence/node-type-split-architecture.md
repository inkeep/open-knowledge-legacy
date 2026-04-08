---
title: Atom vs Non-Atom Node Type Split for JSX Components
description: Investigation confirming two node types (jsxComponentEditable + jsxComponentVoid) is the correct architecture. Single node type with runtime atom toggling is not a viable pattern.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: `atom` is schema-level, but TipTap allows it as a function
**Confidence:** CONFIRMED (source: tiptap/packages/core/src/Node.ts:113-121)

TipTap's type definition allows `atom` to be a function with access to `this.editor`. However, no extension in the TipTap ecosystem uses this pattern. The atom value is evaluated at schema compilation time, not per-instance.

## Finding 2: ReactNodeViewRenderer checks `isLeaf`, not `atom`
**Confidence:** CONFIRMED (source: tiptap/packages/react/src/ReactNodeViewRenderer.tsx:90, 252-258)

`contentDOM` is created only when `!this.node.isLeaf`. A node is a "leaf" when it has no `content` spec. A node with `atom: true` AND `content: 'block+'` is NOT a leaf — it WILL get contentDOM.

## Finding 3: No TipTap extension uses runtime atom toggling
**Confidence:** CONFIRMED (exhaustive search of oss-repos/tiptap/packages/)

Every extension with different editing behavior uses separate node types:
- Details: `details` (container) + `detailsSummary` (editable) + `detailsContent` (editable)
- Table: `table` + `tableRow` + `tableCell` + `tableHeader`

## Finding 4: Option B (always non-atom, contentEditable={false}) is unreliable
**Confidence:** CONFIRMED

Setting `contentEditable={false}` on the DOM element does NOT fully prevent ProseMirror from routing edits into the element. ProseMirror's internal selection handling can still allow cursor entry via keyboard navigation. You'd need `atom: true` anyway for unregistered components, making Option B equivalent to Option A.

## Recommendation: Option A — Two node types
**Confidence:** HIGH

```
jsxComponentEditable: content: 'block+', no atom → editable children, ReactNodeViewRenderer creates contentDOM
jsxComponentVoid:     atom: true, no content     → raw string display, no contentDOM
```

Both serialize to the same markdown format. parseMarkdown checks the registry to decide which type to create.

## Finding 5: CMS landscape confirms this is universal
**Confidence:** CONFIRMED (from cms-custom-components-landscape report)

Every CMS system separates registered (schema-known) from unregistered (pass-through) components:
- Payload: DecoratorNode (opaque) vs embedded editor
- Sanity: contentEditable=false card vs modal editor
- TinaCMS: void node vs side panel
- Keystatic: atom node vs wrapper kind

Two-tier architecture is the consensus pattern.
