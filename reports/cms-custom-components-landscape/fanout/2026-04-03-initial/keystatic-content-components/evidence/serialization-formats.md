---
title: Keystatic Serialization — MDX and Markdoc
source_type: primary
source_paths:
  - packages/keystatic/src/form/fields/markdoc/editor/markdoc/serialize.ts
  - packages/keystatic/src/form/fields/markdoc/editor/mdx/serialize.ts
  - packages/keystatic/src/form/fields/markdoc/editor/markdoc/parse.ts
  - packages/keystatic/src/form/fields/markdoc/editor/mdx/parse.ts
  - packages/keystatic/src/form/fields/markdoc/editor/tests/mdx.test.tsx
  - packages/keystatic/src/form/fields/markdoc/editor/tests/markdoc.test.tsx
repo: https://github.com/Thinkmill/keystatic
---

# Serialization: MDX and Markdoc

## Dual-Format Architecture

Keystatic supports **two serialization formats** for the same ProseMirror document model:
- **Markdoc** (`.mdoc`) — Stripe's Markdoc format with `{% tag %}` syntax
- **MDX** (`.mdx`) — JSX-in-Markdown with `<Component />` syntax

The format is determined at schema creation time (`createEditorSchema(config, components, isMDX)`).

## Markdoc Serialization

### Block component (self-closing)
```markdoc
{% with-array array=[] /%}
```

### Inline component (self-closing, inline)
```markdoc
wertgrfdsc{% inline-thing something="adkjsakjndnajksdnjk" /%}sfasdf
```

### Mark component (wrapping text)
```markdoc
{% highlight variant="success" %}some text{% /highlight %}
```

### Serializer: `proseMirrorToMarkdoc()` (serialize.ts:141-275)
Converts ProseMirror nodes to Markdoc `Ast.Node` objects:
```typescript
// serialize.ts:258-270 (component handling)
const name = node.type.name;
const componentConfig = schema.components[name];
if (componentConfig) {
  const children =
    componentConfig.kind === 'wrapper' || componentConfig.kind === 'repeating'
      ? blocks(node.content)
      : [];
  return new Ast.Node(
    'tag',
    internalToSerialized(componentConfig.schema, node.attrs.props, state),
    children,
    name
  );
}
```

### Parser: `markdocToProseMirror()` (parse.ts:114-143)
Converts Markdoc AST back to ProseMirror document, looking up components by `node.tag`.

## MDX Serialization

### Block component (self-closing JSX)
```mdx
<Another array={[{"blah":"A"},{"blah":"B"}]} />
```

### Inline component (self-closing, inline JSX)
```mdx
wertgrfdsc<InlineThing something="adkjsakjndnajksdnjk" />asdfasdf
```

### Mark component (wrapping JSX)
```mdx
<Highlight variant="success">something</Highlight>
```

### Serializer: `proseMirrorToMDXRoot()` (serialize.ts:181-286)
Converts ProseMirror nodes to MDAST nodes:
```typescript
// serialize.ts:264-280 (component handling)
const componentConfig = schema.components[name];
if (componentConfig) {
  const children =
    componentConfig.kind === 'wrapper' || componentConfig.kind === 'repeating'
      ? blocks(node.content) : [];
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: propsToAttributes(
      internalToSerialized(componentConfig.schema, node.attrs.props, state)
    ),
    children,
  };
}
```

Uses `mdast-util-to-markdown` with MDX extensions for final text output.

### Parser: `mdxToProseMirror()` (parse.ts:117-156)
Parses MDX using `micromark-extension-mdxjs` and `mdast-util-mdx`, then converts MDAST to ProseMirror nodes. JSX attribute expressions are parsed as JavaScript AST (Literal, Array, Object expressions).

## Props Attribute Handling

### Simple string props → direct attribute values
```mdx
<InlineThing something="text" />
```

### Complex props (objects, arrays) → JSON expression attributes
```mdx
<Another array={[{"blah":"A"},{"blah":"B"}]} />
```
In MDX: `mdxJsxAttributeValueExpression` with stringified JSON.
In Markdoc: Direct object/array attribute values.

### Boolean props → presence attribute (MDX) or boolean value (Markdoc)

## File Handling During Serialization

Both serializers manage a `DocumentSerializationState`:
```typescript
{
  extraFiles: Map<string, Uint8Array>;   // Files at document root
  otherFiles: Map<string, Map<string, Uint8Array>>;  // Files in directories
  schema: EditorSchema;
  slug: string | undefined;
}
```

The `internalToSerialized()` function (props-serialization.ts:109-144) converts internal props to serialized form while extracting file references into the state maps.

## Test Evidence

From `mdx.test.tsx:455-485` (array in component roundtrip):
```
Input MDX:  `<Another array={[{blah:'A'},{blah:'B'}]} />`
Editor:     <Another props={{ value: { array: [{blah:"A"},{blah:"B"}] }, extraFiles: [] }} />
Output MDX: `<Another array={[{"blah":"A"},{"blah":"B"}]} />`
```

From `markdoc.test.tsx:477-506` (inline component roundtrip):
```
Input:  `wertgrfdsc{% inline-thing something="adkjsakjndnajksdnjk" /%}sfasdf`
Output: `wertgrfdsc{% inline-thing something="adkjsakjndnajksdnjk" /%}sfasdf`
```
