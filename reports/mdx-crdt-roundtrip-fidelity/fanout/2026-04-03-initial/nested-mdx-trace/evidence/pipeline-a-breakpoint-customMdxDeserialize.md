---
title: "Evidence: Pipeline A Breakpoint - customMdxDeserialize fallback"
pipeline: plate-slate-yjs
step: A.2 (MDAST to Slate)
severity: critical
file: plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts
lines: 38-76
---

# Pipeline A Breakpoint: customMdxDeserialize Fallback

## Location

File: `plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts`

## Code Path

When `convertNodesDeserialize()` encounters an `mdxJsxFlowElement` or
`mdxJsxTextElement` node, it dispatches to `customMdxDeserialize()`:

```typescript
// convertNodesDeserialize.ts lines 32-37
if (
  mdastNode.type === 'mdxJsxTextElement' ||
  mdastNode.type === 'mdxJsxFlowElement'
) {
  const result = customMdxDeserialize(mdastNode, deco, options);
  return Array.isArray(result) ? result : [result];
}
```

## The Fallback

`customMdxDeserialize` first tries to find a registered plugin matching the JSX
element name:

```typescript
const customJsxElementKey = mdastNode.name;
const key =
  getPluginKey(options.editor!, customJsxElementKey as any) ?? mdastNode.name;
```

If no matching deserializer is found, the fallback for flow elements is:

```typescript
if (mdastNode.type === 'mdxJsxFlowElement') {
  const tagName = mdastNode.name;
  return [{
    children: [
      { text: `<${tagName}>\n` },
      ...convertChildrenDeserialize(mdastNode.children, deco, options),
      { text: `\n</${tagName}>` },
    ],
    type: getPluginType(options.editor!, KEYS.p),
  }];
}
```

## What Breaks

1. **Attributes are completely dropped**: The `mdastNode.attributes` array is
   never read. For our test case, `title="Docker"`, `type="info"`,
   `data={chartData}`, `responsive={true}` are all silently discarded.

2. **Expression attribute values are lost**: `MdxJsxAttributeValueExpression`
   objects (which contain `{chartData}` and `{true}`) are not serialized back
   into the tag string.

3. **Self-closing form is lost**: Self-closing elements like `<Chart ... />`
   are emitted as `<Chart>\n...\n</Chart>` even when they had no children.

4. **Children placed inside paragraph violates schema**: The recursive call to
   `convertChildrenDeserialize(mdastNode.children, ...)` may produce heading
   nodes, code block nodes, etc. These are placed inside a paragraph's `children`
   array. In Slate's schema model, block elements cannot be nested inside
   paragraphs. This creates an invalid Slate tree.

5. **Nesting is flattened recursively**: For `<Tabs>` containing `<Tab>`,
   the outer `customMdxDeserialize` call processes `<Tabs>`. When it gets to
   the child `<Tab>` element, `convertChildrenDeserialize` calls back into
   `buildSlateNode`, which again dispatches to `customMdxDeserialize` for `<Tab>`.
   The result is nested paragraph wrappers:
   ```
   paragraph("<Tabs>")
     paragraph("<Tab>")
       heading(2)...
       paragraph("<Callout>")
         paragraph(content)
       text("</Callout>")
     text("</Tab>")
   text("</Tabs>")
   ```
   This deeply nested paragraph structure is both schema-invalid and lossy.

## Confirmed via Test

The spec file at `customMdxDeserialize.spec.ts` confirms this behavior with
the test "falls back to a paragraph wrapper for unknown block mdx tags":

```typescript
const result = customMdxDeserialize(
  {
    children: [],
    name: 'Widget',
    type: 'mdxJsxFlowElement',
  } as any,
  {},
  { editor }
);

expect(result).toEqual([{
  children: [
    { text: '<Widget>\n' },
    { text: '' },
    { text: '\n</Widget>' },
  ],
  type: 'p',
}]);
```

Even an empty `<Widget />` element becomes a paragraph with three text nodes.
