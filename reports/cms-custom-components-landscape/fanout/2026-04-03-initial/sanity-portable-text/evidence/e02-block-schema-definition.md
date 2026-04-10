---
title: Block Schema Definition Interface
source: sanity monorepo (primary source)
file: packages/@sanity/types/src/schema/definition/type/block.ts
lines: 256-265
confidence: high
dimension: D1
---

# BlockDefinition — Schema for Text Blocks

The schema interface that developers use to define a Portable Text block type:

```typescript
// packages/@sanity/types/src/schema/definition/type/block.ts:256-265

export interface BlockDefinition extends BaseSchemaDefinition {
  type: 'block'
  styles?: BlockStyleDefinition[]      // h1, h2, blockquote, etc.
  lists?: BlockListDefinition[]        // bullet, number, etc.
  marks?: BlockMarksDefinition         // decorators + annotations
  of?: ArrayOfType<'object' | 'reference'>[]  // INLINE objects within text
  initialValue?: InitialValueProperty<any, any[]>
  options?: BlockOptions
  validation?: ValidationBuilder<BlockRule, any[]>
}
```

## Key sub-interfaces

### BlockMarksDefinition (lines 198-201)
```typescript
export interface BlockMarksDefinition {
  decorators?: BlockDecoratorDefinition[]    // strong, em, code, etc.
  annotations?: ArrayOfType<'object' | 'reference'>[]  // link, color, etc.
}
```

### BlockDecoratorDefinition (lines 61-66)
```typescript
export interface BlockDecoratorDefinition {
  title: string
  i18nTitleKey?: string
  value: string              // e.g., 'strong', 'em'
  icon?: ReactNode | ComponentType
}
```

### BlockStyleDefinition (lines 122-127)
```typescript
export interface BlockStyleDefinition {
  title: string
  value: string              // e.g., 'normal', 'h1', 'blockquote'
  i18nTitleKey?: string
  icon?: ReactNode | ComponentType
}
```

## Critical distinction: `of` vs top-level array members

- `block.of` = **inline objects** placed within text flow (e.g., inline images, mentions)
- Top-level `array.of` = **block-level objects** placed as standalone blocks (e.g., callouts, images, code blocks)

This is the dual-level custom type system: inline objects are children of text blocks, while block objects are siblings of text blocks.

## Source
- File: `packages/@sanity/types/src/schema/definition/type/block.ts`
- Repo: https://github.com/sanity-io/sanity
