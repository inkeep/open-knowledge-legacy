---
title: "Evidence: Serialization Pipeline (Plate -> MDAST -> MDX)"
source: "@tinacms/mdx/src/stringify/"
type: source-code
---

# Serialization Pipeline

## Entry Point

```typescript
// @tinacms/mdx/src/stringify/index.ts lines 34-72
export const serializeMDX = (value, field, imageCallback) => {
  // Route to "next" (markdown-mode) or "slatejson" if configured
  if (field.parser?.type === 'markdown') {
    return stringifyMDXNext(value, field, imageCallback);
  }
  if (field.parser?.type === 'slatejson') {
    return value;  // passthrough
  }
  
  // Default MDX path
  if (value?.children[0]?.type === 'invalid_markdown') {
    return value.children[0].value;  // Return raw string for unparseable content
  }
  
  const tree = rootElement(value, field, imageCallback);
  const res = toTinaMarkdown(tree, field);
  // Post-process shortcodes
  return preprocessedString;
};
```

## MDX JSX Flow Element Serialization

```typescript
// @tinacms/mdx/src/stringify/index.ts lines 215-278
case 'mdxJsxFlowElement':
  // Special case: internal table representation
  if (content.name === 'table') { /* ... */ }
  
  // General JSX element
  const { children, attributes, useDirective, directiveType } =
    stringifyProps(content, field, false, imageCallback);
  
  if (useDirective) {
    // Shortcode syntax: {{< name attr="val" >}} ... {{< /name >}}
    return { type: 'containerDirective', name, attributes, children };
  }
  
  return {
    type: 'mdxJsxFlowElement',
    name: content.name,
    attributes,
    children,
  };
```

## toTinaMarkdown -- Final String Output

```typescript
// @tinacms/mdx/src/stringify/index.ts lines 82-143
export const toTinaMarkdown = (tree, field) => {
  // Custom text handler to control escaping
  handlers['text'] = (node, parent, context, safeOptions) => {
    // Remove space-in-phrasing from unsafe list
    // Optionally skip HTML escaping
    return text(node, parent, context, safeOptions);
  };
  
  return toMarkdown(tree, {
    extensions: [
      directiveToMarkdown(patterns),  // shortcode support
      mdxJsxToMarkdown(),             // JSX element support
      gfmToMarkdown(),                // GFM support
    ],
    listItemIndent: 'one',
    handlers,
  });
};
```

## Object Props via Prettier

```typescript
// @tinacms/mdx/src/stringify/acorn.ts lines 296-313
function stringifyObj(obj, flatten) {
  const dummyFunc = `const dummyFunc = `;
  const res = prettier
    .format(`${dummyFunc}${JSON.stringify(obj)}`, {
      parser: 'acorn',
      trailingComma: 'none',
      semi: false,
      plugins: [parser],
    })
    .trim()
    .replace(dummyFunc, '');
  return flatten ? res.replaceAll('\n', '').replaceAll('  ', ' ') : res;
}
```

This means all object props are reformatted by Prettier on every save -- original formatting is never preserved.
