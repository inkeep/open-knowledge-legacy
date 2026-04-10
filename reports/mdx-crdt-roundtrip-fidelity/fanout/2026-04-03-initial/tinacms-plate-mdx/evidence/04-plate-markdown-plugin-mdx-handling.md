---
title: "Evidence: Plate @udecode/plate-markdown MDX Handling"
source: "plate/packages/markdown/src/lib/"
type: source-code
---

# Plate Markdown Plugin MDX Handling

## Plugin Architecture

Plate's markdown plugin is rule-based. Each element type has a `deserialize` and `serialize` function:

```typescript
// plate/packages/markdown/src/lib/types.ts
export type MdNodeParser<K extends keyof PlateNodeMap> = {
  mark?: boolean;
  deserialize?: (mdastNode, deco, options) => PlateNodeMap[K];
  serialize?: (slateNode, options) => MdNodeMap[K];
};
```

## MDX Dispatch

When an MDX JSX node is encountered, Plate routes to `customMdxDeserialize()`:

```typescript
// plate/packages/markdown/src/lib/deserializer/convertNodesDeserialize.ts lines 30-37
if (
  mdastNode.type === 'mdxJsxTextElement' ||
  mdastNode.type === 'mdxJsxFlowElement'
) {
  const result = customMdxDeserialize(mdastNode, deco, options);
  return Array.isArray(result) ? result : [result];
}
```

## Custom MDX Deserialization

```typescript
// plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts
export const customMdxDeserialize = (mdastNode, deco, options) => {
  const customJsxElementKey = mdastNode.name;
  const key = getPluginKey(options.editor!, customJsxElementKey);

  if (key) {
    const nodeParserDeserialize = getDeserializerByKey(
      mdastToPlate(options.editor!, key), options
    );
    if (nodeParserDeserialize)
      return nodeParserDeserialize(mdastNode, deco, options);
  }

  // Fallback: preserve as text string
  if (mdastNode.type === 'mdxJsxTextElement') {
    return [{ text: `<${tagName}>${textContent}</${tagName}>` }];
  }
  if (mdastNode.type === 'mdxJsxFlowElement') {
    return [{
      children: [
        { text: `<${tagName}>\n` },
        ...convertChildrenDeserialize(mdastNode.children, deco, options),
        { text: `\n</${tagName}>` },
      ],
      type: getPluginType(options.editor!, KEYS.p),
    }];
  }
};
```

**Key difference from TinaCMS**: Plate does NOT extract props from JSX attributes. It passes the raw MDAST node to the deserializer function, which is responsible for prop extraction. The built-in rules (callout, toc, etc.) use a `parseAttributes()` helper for simple key-value pairs, but there is no Acorn-based AST extraction like TinaCMS has.

## Built-in MDX Components in Plate

```typescript
// plate/packages/markdown/src/lib/rules/defaultRules.ts
callout: {
  deserialize: (mdastNode, deco, options) => {
    const props = parseAttributes(mdastNode.attributes);
    return {
      children: convertChildrenDeserialize(mdastNode.children, deco, options),
      type: getPluginType(options.editor!, KEYS.callout),
      ...props,
    };
  },
  serialize(slateNode, options) {
    const { children, type, ...rest } = slateNode;
    return {
      attributes: propsToAttributes(rest),
      children: convertNodesSerialize(children, options),
      name: 'callout',
      type: 'mdxJsxFlowElement',
    };
  },
},
```

## HTML-to-JSX Pre-processing

Before parsing, Plate converts HTML to JSX-compatible syntax:

```typescript
// plate/packages/markdown/src/lib/deserializer/utils/htmlToJsx.ts
export const htmlToJsx = (html: string): string => {
  return html
    .replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}')  // HTML comments -> JSX comments
    .replace(/<([a-zA-Z0-9]+)\b([^>]*?)(\/?)>/gi, (_match, tagName, attrs, selfClosing) => {
      // Rename class->className, for->htmlFor
      // Add quotes to unquoted attributes
      // Convert boolean attrs: disabled -> disabled="true"
      // Self-close void elements
    });
};
```

**HTML comments are converted to JSX comments `{/*...*/}`**, but these are then parsed by remark-mdx as `mdxFlowExpression` nodes. Whether they survive depends on whether the consumer handles that node type.

## Type Mapping Tables

```typescript
// plate/packages/markdown/src/lib/types.ts
const MDAST_TO_PLATE = {
  mdxJsxFlowElement: 'mdxJsxFlowElement',
  mdxJsxTextElement: 'mdxJsxTextElement',
  mdxFlowExpression: 'mdxFlowExpression',
  mdxjsEsm: 'mdxjsEsm',
  mdxTextExpression: 'mdxTextExpression',
  // ... plus all standard markdown types
};
```

Note: `mdxFlowExpression`, `mdxjsEsm`, and `mdxTextExpression` are in the type map but **have no corresponding rules in `defaultRules`**. They would need custom rules to be handled.
