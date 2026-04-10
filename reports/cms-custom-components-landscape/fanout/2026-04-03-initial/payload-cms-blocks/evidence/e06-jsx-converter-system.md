---
id: e06
title: Frontend JSX Converter System and RichText Component
source: packages/richtext-lexical/src/features/converters/lexicalToJSX/
lines: converter/types.ts:1-70, converter/index.tsx:36-100, Component/index.tsx:1-89
type: source-code
dimension: D5
confidence: high
---

# Frontend Rendering Architecture

## RichText Component (Component/index.tsx, lines 49-89)

```typescript
export const RichText: React.FC<RichTextProps> = ({
  className, converters, data: editorState, disableContainer, disableIndent, disableTextAlign,
}) => {
  let finalConverters: JSXConverters = {}
  if (converters) {
    if (typeof converters === 'function') {
      finalConverters = converters({ defaultConverters: defaultJSXConverters })
    } else {
      finalConverters = converters
    }
  } else {
    finalConverters = defaultJSXConverters
  }

  const content = editorState && convertLexicalToJSX({
    converters: finalConverters,
    data: editorState,
    disableIndent, disableTextAlign,
  })

  return disableContainer
    ? <>{content}</>
    : <div className={className ?? 'payload-richtext'}>{content}</div>
}
```

## JSXConverters Type (converter/types.ts, lines 24-70)

```typescript
export type JSXConverters<T> = {
  // Standard node type converters
  [nodeType in Exclude<NonNullable<T['type']>, 'block' | 'inlineBlock'>]?: JSXConverter<...>
} & {
  // Block converters keyed by blockType slug
  blocks?: {
    [K in BlockTypeSlug]?: JSXConverter<SerializedBlockNode<...>>
  }
  // Inline block converters keyed by blockType slug
  inlineBlocks?: {
    [K in InlineBlockTypeSlug]?: JSXConverter<SerializedInlineBlockNode<...>>
  }
  // Fallback for unknown node types
  unknown?: JSXConverter<SerializedLexicalNode>
}
```

## Block Converter Lookup (converter/index.tsx, lines 53-70)

```typescript
if (node.type === 'block') {
  converterForNode = converters?.blocks?.[(node as SerializedBlockNode)?.fields?.blockType]
} else if (node.type === 'inlineBlock') {
  converterForNode = converters?.inlineBlocks?.[(node as SerializedInlineBlockNode)?.fields?.blockType]
} else {
  converterForNode = converters[node.type]
}
```

## Usage Pattern (from test/lexical/collections/Lexical/LexicalRendered.tsx)

```typescript
const jsxConverters: JSXConvertersFunction<DefaultNodeTypes | SerializedBlockNode<any>> = ({
  defaultConverters,
}) => ({
  ...defaultConverters,
  blocks: {
    myTextBlock: ({ node }) => <div style={{ backgroundColor: 'red' }}>{node.fields.text}</div>,
    relationshipBlock: ({ node }) => <p>Test</p>,
  },
})

// Usage:
<RichText converters={jsxConverters} data={data.lexicalWithBlocks} />
```

## Key Architecture Patterns

1. **Converter function pattern**: Developers provide a function `({ defaultConverters }) => ({ ...defaultConverters, blocks: { ... } })` to merge custom block converters with defaults.
2. **Block-slug-keyed lookup**: The converter map uses `blocks.{blockSlug}` as the key, matching against `node.fields.blockType`.
3. **Type-safe generics**: The JSXConverters type uses conditional type extraction to infer valid block slugs from the serialized node types.
4. **Package export**: Available as `@payloadcms/richtext-lexical/react` exporting `RichText`, `JSXConvertersFunction`, `defaultJSXConverters`, and individual node converters.
