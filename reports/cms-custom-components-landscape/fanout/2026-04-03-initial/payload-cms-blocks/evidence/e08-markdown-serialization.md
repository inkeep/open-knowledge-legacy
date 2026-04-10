---
id: e08
title: Markdown Serialization via JSX-like Tags
source: packages/richtext-lexical/src/features/blocks/client/markdown/markdownTransformer.ts
lines: 30-76
type: source-code
dimension: D3
confidence: high
---

# Markdown Block Serialization

## Transformer Registration (lines 37-76)

Each block gets its own markdown transformer based on its `jsx` configuration:

```typescript
export const getBlockMarkdownTransformers = ({
  blocks, inlineBlocks,
}: {
  blocks: ClientBlock[]
  inlineBlocks: ClientBlock[]
}): TransformerFactory[] => {
  let transformers = []
  if (blocks?.length) {
    for (const block of blocks) {
      const transformer = getMarkdownTransformerForBlock(block, false)
      if (transformer) transformers = transformers.concat(transformer)
    }
  }
  if (inlineBlocks?.length) {
    for (const block of inlineBlocks) {
      const transformer = getMarkdownTransformerForBlock(block, true)
      if (transformer) transformers = transformers.concat(transformer)
    }
  }
  return transformers
}
```

## JSX-like Tag Format (lines 30-36)

Blocks serialize to JSX-like tags in markdown:

```typescript
function createTagRegexes(tagName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    regExpEnd: new RegExp(`</(${escapedTagName})\\s*>|<${escapedTagName}[^>]*?/>`, 'i'),
    regExpStart: new RegExp(`<(${escapedTagName})([^>]*?)\\s*(/?)>`, 'i'),
  }
}
```

## Markdown Output Example

A block with slug "callout" and fields `style="warning"` would serialize as:

```markdown
<callout style="warning">
  This is the **inner content** of the callout.

  It can contain full markdown.
</callout>
```

Inline blocks use self-closing or content-less tags:

```markdown
Text before <inlineTag prop="value" /> text after.
```

## BlockJSX Configuration (from payload/src/fields/config/types.ts)

```typescript
export type BlockJSX = {
  customEndRegex?: { optional?: true; regExp: RegExp } | RegExp
  customStartRegex?: RegExp
  doNotTrimChildren?: boolean
  export: (props: {
    fields: BlockFields
    lexicalToMarkdown: (props: { editorState: Record<string, any> }) => string
  }) => { children?: string; props?: object } | false | string
  import: (props: {
    children: string
    markdownToLexical: (props: { markdown: string }) => Record<string, any>
    props: Record<string, any>
  }) => BlockFields | false
}
```

## Key Patterns

1. **JSX-like tag syntax**: Not standard markdown — uses `<blockSlug>` opening/closing tags.
2. **Bidirectional**: Both `export` (Lexical→MD) and `import` (MD→Lexical) defined per block.
3. **Custom regex override**: Blocks can define `customStartRegex`/`customEndRegex` for non-JSX formats (e.g., code blocks use triple backticks).
4. **Children support**: Block tags can wrap inner markdown content (useful for rich text fields within blocks).
