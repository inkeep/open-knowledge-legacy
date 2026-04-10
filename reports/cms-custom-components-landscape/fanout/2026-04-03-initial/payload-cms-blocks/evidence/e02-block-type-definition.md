---
id: e02
title: Block Type Definition from Payload Core
source: packages/payload/src/fields/config/types.ts
lines: 1512-1598
type: source-code
dimension: D1
confidence: high
---

# Core Block Type Definition

The `Block` type is defined in Payload's core package, not in the richtext-lexical package. This means blocks are a first-class concept in the Payload field system.

## Block Type (lines 1512-1598, summarized)

```typescript
export type Block = {
  _sanitized?: boolean           // Internal: prevent re-sanitization
  admin?: {
    components?: {
      Block?: PayloadComponent    // Custom rendering component for the block in editor
      Label?: PayloadComponent    // Custom label component
    }
    custom?: Record<string, any>
    disableBlockName?: boolean    // Hide the blockName text input
    group?: Record<string, string> | string  // Group blocks in insertion menu
    images?: {
      icon?: { alt?: string; url: string } | string    // 20x20px menu icon
      thumbnail?: { alt?: string; url: string } | string  // 3:2 thumbnail
    }
    jsx?: PayloadComponent
  }
  custom?: Record<string, any>   // Server-only custom data
  dbName?: DBIdentifierName      // Custom SQL table name
  fields: Field[]                // The fields that compose this block
  interfaceName?: string         // Custom GraphQL/TypeScript schema name
  jsx?: BlockJSX                 // Markdown/JSX converter config
  labels?: Labels                // Block singular/plural display labels
  slug: string                   // Unique identifier for this block type
}
```

## Key Design Decisions

1. **`fields: Field[]` is the schema**: A block's schema is just an array of standard Payload fields. This means ANY field type usable in a Payload collection is usable inside a block.
2. **`slug` is the discriminator**: The slug uniquely identifies the block type and is stored in the serialized Lexical JSON.
3. **`admin.components.Block`**: Developers can provide a completely custom React component for rendering the block in the editor.
4. **`jsx?: BlockJSX`**: Optional markdown/JSX import/export configuration for portable serialization.
5. **`admin.group`**: Blocks can be organized into named groups in the insertion menu.
