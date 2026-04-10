---
title: Keystatic Frontend Rendering and Reader API
source_type: primary
source_paths:
  - packages/keystatic/src/form/fields/markdoc/index.tsx
  - packages/keystatic/src/form/fields/markdoc/markdoc-config.ts
  - packages/keystatic/src/reader/index.ts
  - packages/keystatic/src/reader/generic.ts
  - packages/keystatic/src/form/api.tsx
repo: https://github.com/Thinkmill/keystatic
---

# Frontend Rendering

## Reader API

### Creating a Reader
```typescript
// reader/index.ts:13-90
import { createReader } from '@keystatic/core/reader';
const reader = createReader(repoPath, config);
```

Returns typed `Reader<Collections, Singletons>` with:
- `reader.collections.{name}.read(slug)` → entry data or null
- `reader.collections.{name}.readOrThrow(slug)` → entry data (throws if not found)
- `reader.collections.{name}.all()` → all entries
- `reader.collections.{name}.list()` → all slugs

### Content Fields are Async

From `form/api.tsx:564-568`:
```typescript
export type ValueForReading<Schema extends ComponentSchema> =
  Schema extends ContentFormField<any, any, infer Value>
    ? () => Promise<Value>  // Content fields are lazy-loaded!
    : // ...
```

Content fields (markdoc/mdx) are returned as **async functions** that resolve on demand.

## Format-Specific Reader Output

### Markdoc Reader Output
```typescript
// markdoc/index.tsx:110-115
reader: {
  parse: (_, { content }) => {
    const text = textDecoder.decode(content);
    return { node: parse(text) };  // Returns Markdoc AST
  },
}

// Type: { node: MarkdocNode }
```

The reader returns a **raw Markdoc AST node**. Frontend rendering uses Markdoc's `transform()` and `renderers.react()` to convert to React.

### MDX Reader Output
```typescript
// markdoc/index.tsx:286-289
reader: {
  parse: (_, { content }) => {
    const text = textDecoder.decode(content);
    return text;  // Returns raw MDX string
  },
}

// Type: string
```

The reader returns the **raw MDX string**. Frontend rendering uses an MDX compiler (e.g., `@mdx-js/mdx`) to convert to React.

## Markdoc Config for Rendering

`createMarkdocConfig()` (markdoc-config.ts:85-168) generates a Markdoc `Config` for frontend rendering:

```typescript
export function createMarkdocConfig<Components>(opts: {
  options?: MarkdocEditorOptions;
  components?: Components;
  render?: {
    tags?: { [_ in keyof Components]?: string };
    nodes?: { [_ in NodeType]?: string };
  };
}): Config
```

### Component Registration
```typescript
// markdoc-config.ts:149-160
for (const [name, component] of Object.entries(opts.components || {})) {
  const isEmpty = component.kind === 'block' || component.kind === 'inline';
  config.tags[name] = {
    render: opts.render?.tags?.[name],    // Maps to React component name
    children: isEmpty ? [] : undefined,    // Block/inline have no children
    selfClosing: isEmpty,
    attributes: fieldsToMarkdocAttributes(component.schema),
    description: component.description,
    inline: component.kind === 'inline' || component.kind === 'mark',
  };
}
```

### Usage Pattern (Frontend)
```typescript
import Markdoc from '@markdoc/markdoc';
import { createMarkdocConfig } from '@keystatic/core/reader/markdoc';

const config = createMarkdocConfig({
  components: { /* same components as in keystatic config */ },
  render: {
    tags: { Callout: 'Callout' },  // Map tag name to React component
  },
});

const ast = Markdoc.parse(markdocContent);
const content = Markdoc.transform(ast, config);
const rendered = Markdoc.renderers.react(content, React, { components: { Callout } });
```

## Field-to-Markdoc Attribute Mapping

`fieldsToMarkdocAttributes()` (markdoc-config.ts:74-83) converts component schema fields to Markdoc `SchemaAttribute` types:

```typescript
function getTypeForField(field: ComponentSchema): SchemaAttribute {
  // Object/conditional → { type: Object, required: true }
  // Array → { type: Array, required: true }
  // String with options → { type: String, matches: [...], required: true }
  // Plain string → { type: String, required: ... }
  // Number-parseable → { type: Number }
  // Boolean → { type: Boolean, required: true }
  // Asset → { type: String, required: ... }
}
```

## Summary: Frontend Rendering Flow

### Markdoc Path
1. `reader.collections.posts.read(slug)` → `{ content: () => Promise<{ node: MarkdocNode }> }`
2. `const { node } = await entry.content()`
3. `const config = createMarkdocConfig({ components, render: { tags: { ... } } })`
4. `const content = Markdoc.transform(node, config)`
5. `Markdoc.renderers.react(content, React, { components: { ... } })`

### MDX Path
1. `reader.collections.posts.read(slug)` → `{ content: () => Promise<string> }`
2. `const mdxString = await entry.content()`
3. Process with `@mdx-js/mdx` or similar MDX compiler
4. Pass component map to MDX runtime
