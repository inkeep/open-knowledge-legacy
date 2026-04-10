---
title: Portable Text Core Type Definitions
source: sanity monorepo (primary source)
file: packages/@sanity/types/src/portableText/types.ts
lines: 1-38
confidence: high
dimension: D3
---

# Portable Text Core Types

The canonical TypeScript types for Portable Text data, from `@sanity/types`:

```typescript
// packages/@sanity/types/src/portableText/types.ts

export type PortableTextBlock = PortableTextTextBlock | PortableTextObject

export interface PortableTextTextBlock<TChild = PortableTextSpan | PortableTextObject> {
  _type: string          // Block type name (e.g., 'block')
  _key: string           // Unique key within the array
  children: TChild[]     // Spans and inline objects
  markDefs?: PortableTextObject[]  // Annotation definitions
  listItem?: string      // List type (e.g., 'bullet', 'number')
  style?: string         // Block style (e.g., 'normal', 'h1')
  level?: number         // List nesting level
}

export interface PortableTextObject {
  _type: string          // Custom type identifier
  _key: string           // Unique key
  [other: string]: unknown  // Arbitrary custom fields
}

export interface PortableTextSpan {
  _key: string
  _type: 'span'          // Always 'span' for text spans
  text: string           // The text content
  marks?: string[]       // Decorator names or markDef _key references
}

export type PortableTextChild = PortableTextObject | PortableTextSpan

export interface PortableTextListBlock extends PortableTextTextBlock {
  listItem: string       // Required for list blocks
  level: number          // Required for list blocks
}
```

## Key architectural insight

The union type `PortableTextBlock = PortableTextTextBlock | PortableTextObject` is the core discriminator. Text blocks have `children[]`, while custom blocks (objects) are open-ended with `[other: string]: unknown`. This means any JSON-serializable data can be a custom block — the only required fields are `_type` and `_key`.

## Source
- File: `packages/@sanity/types/src/portableText/types.ts` (lines 1-38)
- Repo: https://github.com/sanity-io/sanity
