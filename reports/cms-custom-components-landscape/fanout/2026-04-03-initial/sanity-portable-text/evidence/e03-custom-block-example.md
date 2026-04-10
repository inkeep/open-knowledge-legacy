---
title: Custom Block Type Examples (InfoBox with Nested PT)
source: sanity monorepo test studio (primary source)
file: dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts
lines: 290-342
confidence: high
dimension: D1, D4
---

# InfoBox Custom Block with Nested Portable Text

From the Sanity test studio — a canonical example of a custom block type that contains nested rich text:

```typescript
// dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts:290-342

defineField({
  name: 'infoBox',
  icon: InfoOutlineIcon,
  title: 'Info Box',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required().warning('Should have a title'),
    }),
    defineField({
      title: 'Box Content',
      name: 'content',
      type: 'array',
      of: [{type: 'block'}],   // <-- NESTED PORTABLE TEXT
      validation: (rule) => rule.required().error('Must have content'),
    }),
    defineField({
      title: 'Nested object',
      name: 'nestedObject',
      type: 'object',
      fields: [
        defineField({
          name: 'title',
          title: 'Title',
          type: 'string',
        }),
        defineField({
          title: 'Box Content',
          name: 'body',
          type: 'array',
          of: [{type: 'block'}],   // <-- DOUBLY NESTED PT
        }),
      ],
    }),
  ],
  components: {
    preview: InfoBoxPreview as any,  // Custom preview component
  },
  preview: {
    select: { title: 'title', body: 'body' },
    prepare({title, body}) {
      return {title, body}
    },
  },
})
```

## Schema registration pattern

This `infoBox` object is placed in the top-level array's `of` property:

```typescript
defineField({
  type: 'array',
  name: 'text',
  of: [
    defineArrayMember({ type: 'block', /* ... */ }),  // Text blocks
    defineField({ name: 'infoBox', type: 'object', /* ... */ }),  // Custom block
    defineField({ name: 'image', type: 'image', /* ... */ }),     // Image block
  ]
})
```

## Key insights for editor architecture

1. **Custom blocks are object types** — they use `type: 'object'` with `fields[]`
2. **Nested PT is just `type: 'array', of: [{type: 'block'}]`** — recursive use of the same system
3. **Preview components** control how the block appears in the editor before opening
4. **Validation** works at every level — fields within custom blocks validate independently
5. **Nesting depth is unlimited** — the example shows 3 levels (PT → infoBox → nestedObject → body PT)

## Source
- File: `dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts`
- Repo: https://github.com/sanity-io/sanity
