---
title: "Evidence: Template Lookup and Prop Extraction"
source: "@tinacms/mdx/src/parse/mdx.ts + acorn.ts"
type: source-code
---

# Template Lookup and Prop Extraction

## Template Lookup (mdx.ts)

Every JSX element must match a registered template by name. Unregistered components fall back to raw HTML strings.

```typescript
// @tinacms/mdx/src/parse/mdx.ts lines 40-55
const template = field.templates?.find((template) => {
  const templateName = typeof template === 'string' ? template : template.name;
  return templateName === node.name;
});

if (!template) {
  // Fallback: serialize back to string, store as HTML
  const string = toTinaMarkdown({ type: 'root', children: [node] }, field);
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: string.trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

## Acorn-Based Prop Extraction (acorn.ts)

Props are extracted using Acorn's ESTree AST. Each field type has a specific extraction path. The `assertType()` calls mean only specific AST node types are accepted -- variable references, function calls, etc. will throw.

```typescript
// @tinacms/mdx/src/parse/acorn.ts lines 47-91
const extractAttribute = (attribute, field, imageCallback) => {
  switch (field.type) {
    case 'boolean':
    case 'number':
      return extractScalar(extractExpression(attribute), field);
    case 'string':
      return extractString(attribute, field);  // supports both "val" and {"val"}
    case 'object':
      return extractObject(extractExpression(attribute), field, imageCallback);
    case 'rich-text':
      const JSXString = extractRaw(attribute);
      return parseMDX(JSXString, field, imageCallback);
    // ...
  }
};

// The scalar extraction -- note assertType(expression, 'Literal')
const extractScalar = (attribute, field) => {
  if (field.list) {
    assertType(attribute.expression, 'ArrayExpression');
    return attribute.expression.elements.map((element) => {
      assertType(element, 'Literal');
      return element.value;
    });
  } else {
    assertType(attribute.expression, 'Literal');  // <-- This rejects Identifier nodes
    return attribute.expression.value;
  }
};
```

**Why `data={chartData}` fails**: `chartData` is an `Identifier` node in the ESTree AST, not a `Literal`. The `assertType(attribute.expression, 'Literal')` call throws immediately.
