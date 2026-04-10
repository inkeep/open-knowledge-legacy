---
type: evidence
source: source code analysis + Yjs documentation + GitHub issues
date: 2026-04-03
confidence: high
verdict: Both bindings store attrs as individual Y.XmlElement/Y.XmlText attributes, BUT complex/nested props collapse to LWW opaque values
---

# Prop Representation in Yjs: The Architectural Answer

## The Binding Determines the Answer (Not the User)

Neither slate-yjs nor y-prosemirror offers a choice. The attribute storage
strategy is **hardcoded in the binding layer**, not configurable.

### slate-yjs: Individual setAttribute per top-level property

Source: `packages/core/src/applyToYjs/node/setNode.ts`

```typescript
Object.entries(op.newProperties).forEach(([key, value]) => {
  if (value === null) {
    return yTarget.removeAttribute(key);
  }
  yTarget.setAttribute(key, value);
});
```

Each top-level Slate node property becomes a separate Y.XmlText attribute.
This means `{ type: "warning", title: "Note" }` becomes two independent
CRDT keys. Concurrent edits to `type` and `title` merge cleanly.

**BUT**: The `value` passed to `setAttribute` can be anything -- including
nested objects. If a Slate element has:

```javascript
{ type: "callout", props: { variant: "warning", data: { chart: [...] } } }
```

Then `props` is stored as ONE attribute. The entire object is the LWW unit.
Concurrent edits to `props.variant` and `props.data` will conflict.

### y-prosemirror: Individual setAttribute per attr key

Source: `src/y-prosemirror.js` (referenced in Issue #116)

When converting ProseMirror nodes to Y.XmlElement, the code iterates through
`node.attrs` and calls `type.setAttribute(key, val)` for each key.

Same architecture. Same limitation. Each ProseMirror attr key is independent,
but nested objects within a single attr key are opaque to CRDT.

### Y.XmlElement.setAttribute type contract

Source: [Yjs docs](https://docs.yjs.dev/api/shared-types/y.xmlelement)

> "Technically, the value can only be a string. However, we also allow shared
> types. In this case, the XML type can't be properly converted to a string."

This is a critical gap:
- Strings: work, but force JSON.stringify for complex values
- Shared types (Y.Map, Y.Array): allow granular CRDT merging, but break
  XML serialization and are not used by either binding
- Plain objects: silently stored as-is, no CRDT granularity, LWW on the
  entire object

### Implication for MDX Props

MDX component props in the mdast representation look like:

```javascript
{
  type: 'mdxJsxAttribute',
  name: 'data',
  value: {
    type: 'mdxJsxAttributeValueExpression',
    value: '{chartData}',
    data: { estree: Program }
  }
}
```

When this is converted to a Slate/ProseMirror node and then to Yjs:

**Option A (current architecture)**: Each prop name becomes a separate
Y.XmlText/Y.XmlElement attribute. Concurrent edits to different props
merge. Concurrent edits to the same prop use LWW.

**Option B (ideal but not implemented)**: Each prop value would be a
Y.Map with sub-fields. This would require custom binding code that
neither slate-yjs nor y-prosemirror provides.

## Verdict

**Option A (single attribute per prop name) is what both bindings implement.**
This is NOT "Option A: Single string attribute" from the question
(all props in one string), nor is it "Option B: Structured Yjs map"
(each prop sub-field in a separate Y.Map entry).

It is a middle ground: each prop NAME is a separate CRDT key, but each
prop VALUE is an opaque LWW blob. This is acceptable for simple string/boolean
props but breaks down for:

1. Props with nested objects (e.g., `data={chartData}`)
2. Props with expression values (e.g., `{...spreadProps}`)
3. Props where the value itself is a complex JSX expression
