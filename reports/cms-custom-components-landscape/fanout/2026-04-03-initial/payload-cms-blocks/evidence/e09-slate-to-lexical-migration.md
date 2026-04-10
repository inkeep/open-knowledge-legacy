---
id: e09
title: Slate-to-Lexical Migration Converter
source: packages/richtext-lexical/src/features/migrations/slateToLexical/converter/index.ts
lines: 12-98
type: source-code
dimension: D6
confidence: high
---

# Slate-to-Lexical Migration

## Core Converter (lines 12-34)

```typescript
export function convertSlateToLexical({
  converters,
  slateData,
}: {
  converters: SlateNodeConverter[]
  slateData: SlateNode[]
}): SerializedEditorState {
  return {
    root: {
      type: 'root',
      children: convertSlateNodesToLexical({
        canContainParagraphs: true,
        converters,
        parentNodeType: 'root',
        slateNodes: slateData,
      }),
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}
```

## On-the-Fly Migration via Feature (feature.server.ts, lines 44-97)

```typescript
export const SlateToLexicalFeature = createServerFeature<SlateToLexicalFeatureProps>({
  feature: ({ props }) => {
    return {
      hooks: {
        afterRead: [
          ({ value }) => {
            if (!value || !Array.isArray(value) || 'root' in value) {
              return value  // Already Lexical format or null
            }
            // Slate format detected (array) — convert on read
            return convertSlateToLexical({
              converters: props.converters,
              slateData: value,
            })
          },
        ],
      },
    }
  },
})
```

## Key Structural Difference

- **Slate**: Data is a flat array of nodes `SlateNode[]`
- **Lexical**: Data is wrapped in `{ root: { type: 'root', children: [...] } }`

## Migration Approach

1. **Non-destructive**: The `afterRead` hook converts on read, leaving the database unchanged until the document is re-saved.
2. **Auto-detection**: Checks if value is an array (Slate) or has a `root` key (Lexical) to decide whether to convert.
3. **Recursive**: `migrateDocumentFieldsRecursively()` crawls through blocks, arrays, groups, and tabs to find all rich text fields needing migration.
4. **Pluggable converters**: Each Slate node type maps to a converter function that produces the equivalent Lexical serialized node.

## Available via Package Export

```typescript
// packages/richtext-lexical/src/exports/server/migrate.ts
export { SlateToLexicalFeature } from '../../features/migrations/slateToLexical/feature.server.js'
export { migrateSlateToLexical } from '../../utilities/migrateSlateToLexical/index.js'
export { convertSlateToLexical, convertSlateNodesToLexical } from '...'
```

Importable as `@payloadcms/richtext-lexical/migrate`.
