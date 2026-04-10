---
id: e05
title: Serialized Block JSON Structure and Converter Registration
source: packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx
lines: 21-37, 114-121
type: source-code
dimension: D3
confidence: high
---

# Block Serialization Format

## Type Definitions (lines 21-37)

```typescript
type BaseBlockFields<TBlockFields extends JsonObject = JsonObject> = {
  blockName: string    // User-editable label
  blockType: string    // Block slug (discriminator)
} & TBlockFields       // Custom field values spread at top level

export type BlockFields<TBlockFields extends JsonObject = JsonObject> = {
  id: string           // Unique instance ID (BSON ObjectID)
} & BaseBlockFields<TBlockFields>

export type SerializedBlockNode<TBlockFields extends JsonObject = JsonObject> = {
  fields: BlockFields<TBlockFields>
} & StronglyTypedLeafNode<SerializedDecoratorBlockNode, 'block'>
```

## Serialized JSON Example

A Lexical document with a custom "callout" block would serialize as:

```json
{
  "root": {
    "type": "root",
    "version": 1,
    "children": [
      {
        "type": "paragraph",
        "children": [{ "type": "text", "text": "Some text before the block" }]
      },
      {
        "type": "block",
        "version": 2,
        "format": "",
        "fields": {
          "id": "507f1f77bcf86cd799439011",
          "blockName": "Important Note",
          "blockType": "callout",
          "style": "warning",
          "content": { "root": { ... } }
        }
      }
    ]
  }
}
```

## Key Design Decisions

1. **Flat field storage**: Custom field values are spread directly into the `fields` object alongside `id`, `blockName`, and `blockType`. Not nested in a `data` sub-object (that was v1, migrated away).
2. **Block type as discriminator**: `blockType` string is used to look up the correct block schema for validation, rendering, and conversion.
3. **Version field**: `version: 2` enables future schema migrations via `importJSON()`.
4. **Entire Lexical JSON stored in DB**: The database stores the complete serialized Lexical editor state as-is. No separate block table or normalization.
5. **Nested rich text as nested Lexical state**: If a block contains a `richText` field, that field's value is itself a serialized Lexical `EditorState` object nested within the parent block's `fields`.
