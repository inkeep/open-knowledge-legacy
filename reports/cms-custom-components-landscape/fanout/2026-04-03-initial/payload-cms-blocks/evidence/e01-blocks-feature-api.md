---
id: e01
title: BlocksFeature Server API and Props Type
source: packages/richtext-lexical/src/features/blocks/server/index.ts
lines: 24-86
type: source-code
dimension: D1
confidence: high
---

# BlocksFeature Server API

The `BlocksFeature` is the main entry point for adding custom blocks to a Payload Lexical editor. It accepts two arrays: `blocks` (full-width decorator blocks) and `inlineBlocks` (inline decorator blocks within text flow).

## Type Definition (lines 24-27)

```typescript
export type BlocksFeatureProps = {
  blocks?: (Block | BlockSlug)[] | Block[]
  inlineBlocks?: (Block | BlockSlug)[] | Block[]
}
```

## Feature Factory (lines 29-86)

```typescript
export const BlocksFeature = createServerFeature<BlocksFeatureProps, BlocksFeatureProps>({
  feature: async ({ config: _config, isRoot, parentIsLocalized, props: _props }) => {
    const validRelationships = _config.collections.map((c) => c.slug) || []

    // 1. Sanitize block fields via Payload's standard field sanitization
    const sanitized = await sanitizeFields({
      config: _config as unknown as Config,
      fields: [
        {
          name: 'lexical_blocks',
          type: 'blocks',
          blockReferences: _props.blocks ?? [],
          blocks: [],
        },
        {
          name: 'lexical_inline_blocks',
          type: 'blocks',
          blockReferences: _props.inlineBlocks ?? [],
          blocks: [],
        },
      ],
      parentIsLocalized,
      requireFieldLevelRichTextEditor: isRoot,
      validRelationships,
    })

    // 2. Resolve block slugs to full Block objects from config.blocks
    const blockConfigs: Block[] = []
    for (const _block of (sanitized[0] as BlocksField).blockReferences ??
      (sanitized[0] as BlocksField).blocks) {
      const block =
        typeof _block === 'string' ? _config?.blocks?.find((b) => b.slug === _block) : _block
      if (!block) {
        throw new Error(`Block not found for slug: ${typeof _block === 'string' ? _block : _block?.slug}`)
      }
      blockConfigs.push({
        ...block,
        fields: applyBaseFilterToFields(block.fields, _config),
      })
    }
    // ... same for inlineBlockConfigs
  },
  key: 'blocks',
})
```

## Key Architectural Patterns

1. **Slug-based referencing**: Blocks can be defined once in `config.blocks` and referenced by slug string across multiple rich text fields
2. **Standard field sanitization**: Block schemas go through the same sanitization pipeline as any Payload field, ensuring consistent validation
3. **Relationship field filtering**: `applyBaseFilterToFields` automatically applies base filters to relationship fields within blocks
4. **Client/server split**: Returns `ClientFeature: '@payloadcms/richtext-lexical/client#BlocksFeatureClient'` for the admin UI
