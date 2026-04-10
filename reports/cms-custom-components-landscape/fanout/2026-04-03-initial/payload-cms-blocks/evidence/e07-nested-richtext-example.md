---
id: e07
title: Nested Rich Text Inside Blocks - Test Evidence
source: test/lexical/collections/Lexical/blocks.ts
lines: 265-298
type: source-code
dimension: D4
confidence: high
---

# Nested Rich Text Inside Custom Blocks

## RichTextBlock Definition (lines 265-298)

This test block demonstrates **three levels of nesting**: Block → richText field → BlocksFeature → sub-block → richText field.

```typescript
export const RichTextBlock: Block = {
  fields: [
    {
      name: 'richTextField',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          FixedToolbarFeature(),
          BlocksFeature({
            blocks: [
              {
                fields: [
                  {
                    name: 'subRichTextField',
                    type: 'richText',
                    editor: lexicalEditor({}),  // Nested Lexical editor
                  },
                  {
                    name: 'subUploadField',
                    type: 'upload',
                    relationTo: 'uploads',
                  },
                ],
                slug: 'lexicalAndUploadBlock',
              },
            ],
          }),
        ],
      }),
    },
  ],
  slug: 'richTextBlock',
}
```

## Nesting Structure

```
Lexical Editor (top level)
  └── BlocksFeature
        └── RichTextBlock (slug: 'richTextBlock')
              └── richTextField (type: 'richText', editor: lexicalEditor)
                    └── BlocksFeature (nested)
                          └── lexicalAndUploadBlock
                                ├── subRichTextField (type: 'richText', editor: lexicalEditor)
                                └── subUploadField (type: 'upload')
```

## Key Findings

1. **Recursive nesting is supported**: Rich text fields inside blocks can themselves contain BlocksFeature with more blocks.
2. **Each level gets its own Lexical editor instance**: Nested rich text fields are independent Lexical editors, not shared state.
3. **No explicit depth limit**: The test demonstrates 3 levels deep. No `maxDepth` configuration found in the BlocksFeature API.
4. **Depth tracked via `useEditDepth()`**: The admin UI tracks nesting depth for drawer management (ensuring drawers stack correctly).
5. **Each nested editor can have different features**: The inner editor at level 2 uses `lexicalEditor({})` (defaults only), while level 1 adds `FixedToolbarFeature`.
