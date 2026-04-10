---
dimension: D3
title: TinaCMS MDX Serialization Pipeline — Parse and Stringify
sources:
  - path: packages/@tinacms/mdx/src/parse/plate.ts
    lines: "10-13, 38-41, 53-57, 69-75"
    description: Plate IR type definitions (RootElement, HeadingElement, HTMLElement, InvalidMarkdownElement)
  - path: packages/@tinacms/mdx/src/parse/mdx.ts
    lines: "16-87"
    description: mdxJsxElement — template matching, attribute extraction, children parsing
  - path: packages/@tinacms/mdx/src/parse/remarkToPlate.ts
    lines: "33-137"
    description: remarkToSlate — MDAST to Plate conversion
  - path: packages/@tinacms/mdx/src/next/stringify/acorn.ts
    lines: "194-250"
    description: Rich-text serialization in stringifyProps — children vs prop handling
  - path: packages/@tinacms/mdx/src/stringify/index.ts
    lines: "82-143"
    description: toTinaMarkdown — MDAST to markdown string via mdx-to-markdown extensions
---

## Parse Pipeline

```
MDX String → remark + remarkMdx → MDAST → remarkToSlate() → Plate RootElement
```

### Key: mdxJsxElement() — Template Matching During Parse

From `packages/@tinacms/mdx/src/parse/mdx.ts:40-44`:

```typescript
const template = field.templates?.find((template) => {
  const templateName =
    typeof template === 'string' ? template : template.name;
  return templateName === node.name;
});
```

If no template matches, the component is converted to raw HTML for safety (line 48-54):
```typescript
if (!template) {
  const string = toTinaMarkdown({ type: 'root', children: [node] }, field);
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: string.trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

### Children Handling During Parse (line 63-73)

```typescript
const childField = template.fields.find(
  (field) => field.name === 'children'
);
if (childField) {
  if (childField.type === 'rich-text') {
    if (node.type === 'mdxJsxTextElement') {
      node.children = [{ type: 'paragraph', children: node.children }];
    }
    props.children = remarkToSlate(node, childField, imageCallback);
  }
}
```

## Serialize Pipeline

```
Plate RootElement → rootElement() → MDAST → toTinaMarkdown() → MDX String
```

### Rich-text Serialization in Props (acorn.ts:194-245)

Two paths based on field name:

**`children` field (line 210-215):** Direct extraction as MDAST children:
```typescript
if (field.name === 'children') {
  const root = rootElement(value, field, imageCallback);
  root.children.forEach((child) => {
    children.push(child);
  });
  return;
}
```

**Other rich-text props (line 226-244):** Wrapped in JSX fragment expression:
```typescript
attributes.push({
  type: 'mdxJsxAttribute',
  name,
  value: {
    type: 'mdxJsxAttributeValueExpression',
    value: `<>\n${val}\n</>`,
  },
});
```

## Plate IR Node Types

### Block MDX Component
```typescript
type MdxBlockElement = {
  type: 'mdxJsxFlowElement';
  name: string | null;
  props: Record<string, unknown>;
  children: [EmptyTextElement];  // Always [{type: 'text', text: ''}]
};
```

### Inline MDX Component
```typescript
type MdxInlineElement = {
  type: 'mdxJsxTextElement';
  name: string | null;
  props: Record<string, unknown>;
  children: [EmptyTextElement];
};
```
