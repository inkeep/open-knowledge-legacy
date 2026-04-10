---
title: "@portabletext/react Component Mapping Pattern"
source: sanity monorepo usage + @portabletext/react docs
files:
  - packages/sanity/src/core/comments/components/pte/CommentMessageSerializer.tsx (lines 1-89)
  - packages/sanity/src/core/studio/upsell/upsellDescriptionSerializer/UpsellDescriptionSerializer.tsx
confidence: high
dimension: D5
---

# @portabletext/react — Component Mapping Pattern

## Core Usage

```tsx
import {PortableText, type PortableTextComponents} from '@portabletext/react'

<PortableText value={blocks} components={components} />
```

## PortableTextComponents Structure

```typescript
const components: PortableTextComponents = {
  // Block-level components by style name
  block: {
    normal: ({children}) => <p>{children}</p>,
    h1: ({children}) => <h1>{children}</h1>,
    h2: ({children}) => <h2>{children}</h2>,
    blockquote: ({children}) => <blockquote>{children}</blockquote>,
    // ... any custom style value
  },

  // List containers by listItem type
  list: {
    bullet: ({children}) => <ul>{children}</ul>,
    number: ({children}) => <ol>{children}</ol>,
  },

  // List items by listItem type
  listItem: {
    bullet: ({children}) => <li>{children}</li>,
    number: ({children}) => <li>{children}</li>,
  },

  // Inline marks (decorators and annotations)
  marks: {
    // Decorators — simple formatting, receive {children}
    strong: ({children}) => <strong>{children}</strong>,
    em: ({children}) => <em>{children}</em>,
    code: ({children}) => <code>{children}</code>,

    // Annotations — objects with data, receive {value, children}
    link: ({value, children}) => (
      <a href={value.href} target={value.newTab ? '_blank' : undefined}>
        {children}
      </a>
    ),
  },

  // Custom object types — maps _type to component
  types: {
    // Block-level custom objects
    image: ({value}) => <img src={value.url} alt={value.alt} />,
    
    // Inline custom objects
    mention: ({value}) => <MentionBadge userId={value.userId} />,

    // Custom block with nested PT
    callout: ({value}) => (
      <div className={`callout callout-${value.variant}`}>
        <PortableText value={value.content} components={components} />
      </div>
    ),
  },
}
```

## Props received by components

| Component type | Props |
|---------------|-------|
| `block.*` | `{children, value, index, isInline, renderNode}` |
| `list.*` | `{children, value}` |
| `listItem.*` | `{children, value}` |
| `marks.*` (decorator) | `{children, markType, markKey, renderNode, text}` |
| `marks.*` (annotation) | `{children, value, markType, markKey, renderNode, text}` |
| `types.*` | `{value, isInline, index, renderNode}` |

## Real example from Sanity codebase

```typescript
// packages/sanity/src/core/comments/components/pte/CommentMessageSerializer.tsx:30-71

const components: PortableTextComponents = {
  block: {
    normal: NormalBlockTransformed,
    h1: NormalBlockTransformed,
    // ... all styles mapped
  },
  list: { bullet: Fragment, number: Fragment },
  listItem: { bullet: NormalBlockTransformed, number: NormalBlockTransformed },
  marks: {
    strong: Fragment, em: Fragment, code: Fragment,
    underline: Fragment, strikeThrough: Fragment, link: Fragment,
  },
  types: {
    mention: (props) => <MentionInlineBlock userId={props?.value?.userId} selected={false} />,
  },
}
```

## Key architectural pattern

The component mapping is a **flat type→component dictionary**, not a tree. Every custom `_type` value maps directly to one component. The library handles:
- Block vs inline context via `isInline` prop
- Mark nesting (overlapping decorators) via recursive children
- List grouping (consecutive listItem blocks → virtual list container)
- Unknown types (renders nothing by default, can be overridden)

## Source
- Package: https://github.com/portabletext/react-portabletext
- Sanity usage: `packages/sanity/src/core/comments/components/pte/CommentMessageSerializer.tsx`
