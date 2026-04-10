# Sanity Portable Text — Custom Block Architecture Deep Dive

**Date:** 2026-04-03
**Researcher:** Claude (fanout agent)
**Primary Sources:** Sanity monorepo (`~/.claude/oss-repos/sanity/`), Portable Text specification, `@portabletext/react` docs
**Purpose:** Understand Sanity's approach to custom block types in rich text — schema definition, editing UI, serialization, nested content, and frontend rendering — to inform editor architecture decisions for an agent-native knowledge platform.

---

## Executive Summary

Portable Text (PT) is Sanity's JSON-based rich text format. Its core architectural bet is that rich text should be **an array of typed JSON objects** rather than a document tree, with the `_type` field as the universal discriminator. Custom blocks are simply objects with arbitrary fields placed in that array alongside text blocks. This design separates content structure from presentation entirely, making PT the most format-agnostic serialization model among major CMS platforms.

The key patterns relevant to editor architecture:

1. **Schema-driven custom blocks** — Developers define custom block types as object schemas with typed fields. The editing UI is auto-generated from the schema.
2. **Flat array, not tree** — PT is a flat list of blocks, not a nested document tree. This simplifies collaborative editing and diffing.
3. **Type→Component mapping** — Frontend rendering uses a flat dictionary mapping `_type` values to React components. No inheritance, no middleware.
4. **Nested PT is recursive** — Custom blocks can contain PT fields, creating arbitrary nesting via recursive schema composition.
5. **Three-tier custom content** — Block objects (standalone), inline objects (within text), and annotations (mark-like objects on text ranges).

---

## D1: Portable Text Schema Definition

### Schema Definition Language

Sanity uses a JavaScript/TypeScript DSL with helper functions (`defineType`, `defineField`, `defineArrayMember`) for schema definition. PT fields are always arrays containing a `block` type member plus optional custom object type members.

**Source:** `packages/@sanity/types/src/schema/definition/type/block.ts:256-265`

```typescript
// A PT field is an array containing block types and custom object types
defineField({
  type: 'array',
  name: 'body',
  of: [
    // Text block (standard PT block with styles, decorators, annotations)
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'H1', value: 'h1'},
        {title: 'H2', value: 'h2'},
        {title: 'Quote', value: 'blockquote'},
      ],
      marks: {
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
          {title: 'Code', value: 'code'},
        ],
        annotations: [
          {type: 'object', name: 'link', fields: [{type: 'url', name: 'href'}]},
        ],
      },
      of: [
        // Inline objects within text flow
        {type: 'object', name: 'mention', fields: [{type: 'string', name: 'userId'}]},
      ],
    }),

    // Custom block-level objects (standalone blocks)
    defineField({type: 'image', name: 'image', options: {hotspot: true}}),
    defineField({
      type: 'object',
      name: 'callout',
      fields: [
        {type: 'string', name: 'variant'},            // warning/info/danger
        {type: 'array', name: 'content', of: [{type: 'block'}]},  // nested PT
      ],
    }),
  ],
})
```

### Callout Block Example

A developer defines a Callout block with type selection and rich text children exactly like this:

**Source:** `dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts:290-342`

```typescript
defineField({
  name: 'infoBox',
  icon: InfoOutlineIcon,
  title: 'Info Box',
  type: 'object',
  fields: [
    defineField({ name: 'title', type: 'string' }),
    defineField({
      name: 'content',
      type: 'array',
      of: [{type: 'block'}],  // Nested portable text
    }),
    defineField({
      name: 'nestedObject',
      type: 'object',
      fields: [
        defineField({ name: 'title', type: 'string' }),
        defineField({ name: 'body', type: 'array', of: [{type: 'block'}] }),  // Doubly nested
      ],
    }),
  ],
  components: { preview: InfoBoxPreview },
})
```

### Type System

The `BlockDefinition` interface supports:
- **styles** — Block-level formatting (h1-h6, blockquote, custom styles)
- **lists** — List types (bullet, number, custom)
- **marks.decorators** — Inline formatting (strong, em, code, underline, strikethrough)
- **marks.annotations** — Inline objects attached to text ranges (links, comments, colors)
- **of** — Inline object types that can be inserted within text flow

Custom block types use the standard `ObjectDefinition` interface with `fields[]`, `preview`, `validation`, and `components`.

**Evidence:** [e02-block-schema-definition.md](evidence/e02-block-schema-definition.md), [e03-custom-block-example.md](evidence/e03-custom-block-example.md)

---

## D2: Custom Block Editing in Sanity Studio

### PTE Architecture

The Portable Text Editor in Sanity Studio wraps `@portabletext/editor` v6.6.0 (a standalone editor package), with `@portabletext/sanity-bridge` converting Sanity schemas to the editor's schema format.

**Source:** `packages/sanity/src/core/form/inputs/PortableText/PortableTextInput.tsx:389-424`

```
PortableTextInput (state + providers)
  → EditorProvider (@portabletext/editor)
    → Compositor (render dispatch)
      → Editor (editable area + toolbar)
        → PortableTextEditable (contentEditable engine)
```

### Block Rendering Dispatch

The `Compositor` component dispatches rendering based on `_type`:

**Source:** `packages/sanity/src/core/form/inputs/PortableText/Compositor.tsx:269-280`

```typescript
const editorRenderBlock = (blockProps) => {
  const isTextBlock = block._type === schemaTypes.block.name
  if (isTextBlock) return renderTextBlock(blockProps)   // → <TextBlock>
  return renderObjectBlock(blockProps)                   // → <BlockObject>
}
```

For custom blocks, the compositor resolves the Sanity schema type from `schemaTypes.blockObjects` by name match (line 207).

### Three Rendering Modes for Custom Content

| Content type | Component | Display | Editing |
|---|---|---|---|
| **Block object** | `BlockObject.tsx` | Full-width preview, `contentEditable={false}` | Dialog or popover modal |
| **Inline object** | `InlineObject.tsx` | Inline within text flow (chip-like) | Popover with toolbar |
| **Annotation** | `Annotation.tsx` | Highlighted text range | Popover or dialog |

### Insertion Flow

**Source:** `packages/sanity/src/core/form/inputs/PortableText/toolbar/Toolbar.tsx:215-235`

1. User clicks insert button in toolbar
2. `getInsertMenuItems()` builds menu from `schemaTypes.blockObjects` and `schemaTypes.inlineObjects` (filtering hidden types)
3. `handleInsertBlock()` resolves initial value, calls `PortableTextEditor.insertBlock()`, then opens the edit modal
4. Edit modal renders auto-generated form from object schema fields
5. Changes patch back to the editor value

### Auto-Generated Edit UI

The modal editing UI is **not** hand-built per custom type. Sanity's form system reads the object schema's `fields[]` and auto-generates input components:
- String fields → text input
- Boolean fields → checkbox
- Array of blocks → nested PTE
- Image fields → image uploader
- Reference fields → reference picker

The schema can configure modal appearance via `options.modal`:

**Source:** `packages/sanity/src/core/form/inputs/PortableText/object/modals/ObjectEditModal.tsx:31-32`

```typescript
const schemaModalOption = _getModalOption(schemaType)  // reads schemaType.options?.modal
const modalType = schemaModalOption?.type || defaultType  // 'dialog' | 'popover'
```

Three modal variants: `PopoverEditDialog`, `EnhancedObjectDialog` (with nested navigation), `DefaultEditDialog`.

**Evidence:** [e04-pte-editing-architecture.md](evidence/e04-pte-editing-architecture.md)

---

## D3: Portable Text Serialization Model

### JSON Format

A Portable Text value is a **flat array** of block objects. Each block has `_type` and `_key` as required fields.

**Source:** `packages/@sanity/types/src/portableText/types.ts:1-38` + [PT Specification](https://github.com/portabletext/portabletext)

```typescript
type PortableTextBlock = PortableTextTextBlock | PortableTextObject
```

Two fundamental block categories:

**Text blocks** (`PortableTextTextBlock`):
```json
{
  "_type": "block",
  "_key": "abc123",
  "style": "normal",
  "markDefs": [
    {"_type": "link", "_key": "linkRef1", "href": "https://example.com"}
  ],
  "children": [
    {"_type": "span", "_key": "s1", "text": "Click ", "marks": []},
    {"_type": "span", "_key": "s2", "text": "here", "marks": ["linkRef1"]},
    {"_type": "span", "_key": "s3", "text": " to visit", "marks": []}
  ]
}
```

**Custom object blocks** (`PortableTextObject`):
```json
{
  "_type": "infoBox",
  "_key": "info1",
  "title": "Important",
  "content": [
    {"_type": "block", "_key": "n1", "children": [{"_type": "span", "_key": "ns1", "text": "Nested text"}]}
  ]
}
```

### The _type / _key System

- **`_type`** — Polymorphic discriminator. Every object declares its type. The value maps to schema definitions and frontend components.
- **`_key`** — Stable identity within the array. Used for diffing, collaborative editing, and React keys. Generated automatically by the editor.

### Marks System (Decorators vs Annotations)

PT has a two-tier mark system:

1. **Decorators** — Simple string values in `span.marks[]` (e.g., `"strong"`, `"em"`, `"code"`). No associated data.
2. **Annotations** — Objects in `block.markDefs[]` with `_type` and `_key`. Spans reference them by `_key` in their `marks[]` array.

This design avoids deeply nested mark structures. Instead of wrapping `<strong><a href="...">text</a></strong>`, PT uses:
```json
{
  "markDefs": [{"_type": "link", "_key": "l1", "href": "https://..."}],
  "children": [{"_type": "span", "text": "text", "marks": ["strong", "l1"]}]
}
```

### Inline Objects

Custom inline objects sit in `block.children[]` alongside spans:
```json
{
  "_type": "block",
  "children": [
    {"_type": "span", "text": "Written by "},
    {"_type": "mention", "_key": "m1", "userId": "user-123"},
    {"_type": "span", "text": " yesterday"}
  ]
}
```

### Type Assertions

**Source:** `packages/@sanity/types/src/portableText/asserters.ts:16-70`

Runtime type guards validate PT structure:
- `isPortableTextTextBlock()` — checks for `children[]` array, optional `markDefs[]` and `style`
- `isPortableTextSpan()` — checks `_type === 'span'` and `text: string`
- `isPortableTextListBlock()` — checks for required `listItem` and `level`

**Evidence:** [e01-pt-type-definitions.md](evidence/e01-pt-type-definitions.md), [e06-serialization-json-examples.md](evidence/e06-serialization-json-examples.md)

---

## D4: Nested Rich Text in Custom Blocks

### How Nesting Works

Nested Portable Text is achieved by including a field of `type: 'array', of: [{type: 'block'}]` within a custom object type. This is identical to how top-level PT fields are defined — the same schema system is used recursively.

**Source:** `dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts:290-342`

```typescript
// Custom block with nested PT
defineField({
  name: 'infoBox',
  type: 'object',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'content', type: 'array', of: [{type: 'block'}] },  // Level 1 nesting
    {
      name: 'nestedObject',
      type: 'object',
      fields: [
        { name: 'body', type: 'array', of: [{type: 'block'}] },  // Level 2 nesting
      ],
    },
  ],
})
```

### Depth Limits

There is **no hard depth limit** on nesting. The test studio demonstrates 3 levels of nesting (PT → infoBox → nestedObject → body PT). Each level gets its own PTE instance rendered inside the edit modal.

### Editing Experience

When a user edits a custom block with nested PT:

1. The custom block appears as a preview in the main editor (`BlockObject.tsx`)
2. User double-clicks or clicks edit to open the modal
3. Modal renders the auto-generated form
4. The nested PT field renders a full PTE instance inside the form
5. That nested PTE can itself contain custom blocks, annotations, etc.

**Source:** `packages/sanity/src/core/form/inputs/PortableText/object/BlockObject.tsx:60-86`

The `BlockObject` component receives `children: input` containing the form-rendered content, which is passed to `ObjectEditModal`. The form system recursively instantiates input components for each field type, including nested PT arrays.

### Data Structure Implications

Nested PT creates a recursive JSON structure:
```json
{
  "_type": "callout",
  "_key": "c1",
  "variant": "warning",
  "content": [
    {
      "_type": "block",
      "_key": "b1",
      "children": [
        {"_type": "span", "_key": "s1", "text": "This is "},
        {"_type": "span", "_key": "s2", "text": "nested", "marks": ["strong"]},
        {"_type": "span", "_key": "s3", "text": " content"}
      ]
    }
  ]
}
```

The nesting is **unlimited but practical** — each level adds a modal layer in the editing UI, so deeply nested content becomes harder to edit. The system handles this architecturally but ergonomics degrade beyond 2-3 levels.

**Evidence:** [e03-custom-block-example.md](evidence/e03-custom-block-example.md)

---

## D5: Frontend Rendering — PT Serializers

### @portabletext/react

The canonical React renderer uses a flat `PortableTextComponents` dictionary to map types to components.

**Source:** `packages/sanity/src/core/comments/components/pte/CommentMessageSerializer.tsx:30-71`

```tsx
import {PortableText, type PortableTextComponents} from '@portabletext/react'

const components: PortableTextComponents = {
  block: {
    normal: ({children}) => <p>{children}</p>,
    h1: ({children}) => <h1>{children}</h1>,
  },
  marks: {
    strong: ({children}) => <strong>{children}</strong>,
    link: ({value, children}) => <a href={value.href}>{children}</a>,
  },
  types: {
    image: ({value}) => <img src={value.url} />,
    callout: ({value}) => (
      <div className={`callout-${value.variant}`}>
        <PortableText value={value.content} components={components} />
      </div>
    ),
  },
}

<PortableText value={blocks} components={components} />
```

### Component Props

| Mapping key | Props received |
|---|---|
| `types.*` | `{value, isInline, index, renderNode}` |
| `block.*` | `{children, value, index}` |
| `marks.*` (decorator) | `{children, markType, text}` |
| `marks.*` (annotation) | `{children, value, markType, text}` |
| `list.*` | `{children, value}` |
| `listItem.*` | `{children, value}` |

### Other Renderers in the Ecosystem

| Package | Purpose | Usage |
|---|---|---|
| `@portabletext/react` | React component rendering | Frontend apps |
| `@portabletext/to-html` | HTML string output | Email, RSS, SSR |
| `@portabletext/html` | HTML → PT parsing | Paste handling in editor |
| `@portabletext/toolkit` | `toPlainText()`, `isPortableTextBlock()` | Utilities |
| `@portabletext/markdown` | PT → Markdown conversion | Release notes, plain output |

**Source:** `packages/sanity/package.json` (dependency list)

### Key Pattern: Recursive Rendering for Nested PT

Custom blocks with nested PT fields render by recursively calling `<PortableText>` with the nested array:

```tsx
types: {
  callout: ({value}) => (
    <Callout variant={value.variant}>
      <PortableText value={value.content} components={components} />
    </Callout>
  ),
}
```

This is elegant but requires the developer to know that `value.content` is a PT array and to manually invoke `<PortableText>` — it's not automatic.

**Evidence:** [e05-react-serializer-pattern.md](evidence/e05-react-serializer-pattern.md)

---

## D6: Portable Text vs Other Serialization Formats

### Comparison Matrix

| Dimension | Portable Text | ProseMirror JSON | Lexical JSON | Slate JSON |
|---|---|---|---|---|
| **Structure** | Flat array of blocks | Nested document tree | Nested node tree | Nested node tree |
| **Custom types** | `_type` field on any object | `type` field, must register NodeSpec | `type` field, must extend LexicalNode class | `type` field, plugin-based |
| **Mark system** | `markDefs[]` + reference keys | `marks[]` on text nodes | TextFormatType bitfield + custom nodes | `marks` on leaf nodes |
| **Inline objects** | Objects in `children[]` with custom `_type` | Inline nodes in `content[]` | Custom DecoratorNode or inline ElementNode | Inline elements or voids |
| **Nesting** | Recursive via nested PT arrays | Native via document tree | Native via node hierarchy | Native via nested elements |
| **Transport independence** | Fully independent (no editor assumptions) | Loosely coupled (mirrors ProseMirror schema) | Tightly coupled to Lexical runtime | Loosely coupled (mirrors Slate value) |
| **Custom block data** | Open-ended `[other: string]: unknown` | Constrained by NodeSpec `attrs` | Constrained by node class properties | Open-ended properties |
| **Collaborative editing** | Via operational transforms on the flat array | Yjs/Hocuspocus (tree-based) | Yjs (tree-based) | Yjs (tree-based) |
| **Size** | Moderate (flat + markDefs overhead) | Moderate | Compact (bitfield marks) | Moderate |
| **Human readability** | High (flat, simple objects) | Medium (nested tree) | Low (internal format) | Medium (nested tree) |

### PT Strengths

1. **Format agnosticism** — PT is not tied to any editor. It can be rendered to HTML, React, Vue, Svelte, Markdown, or any format. No editor runtime needed to interpret the data.

2. **Flat structure = simple diffing** — Because blocks are a flat array, diffing and merging is simpler than tree-based formats. Each block can be independently addressed by `_key`.

3. **Open custom types** — Any JSON-serializable data can be a custom block with just `_type` and `_key`. No need to register node types, extend classes, or write serializers at the data level.

4. **Clean mark model** — The `markDefs` reference system avoids deeply nested mark structures. Overlapping marks are handled by listing multiple mark keys in a span.

5. **API-first** — PT is designed for headless CMS delivery. The same content can power web, mobile, email, and AI consumption without transformation.

### PT Weaknesses

1. **No native tree structure** — Complex nested layouts (tables, multi-column, tab groups) must be represented as custom block objects with nested PT arrays, which adds serialization complexity.

2. **Span splitting** — When marks overlap, text is split into multiple spans. "Hello **bold _bold-italic_** world" becomes 3+ spans. This is more verbose than tree-based mark application.

3. **No native inline formatting nesting** — Unlike ProseMirror's nested mark model, PT flattens all marks onto spans. This is simpler but less expressive for complex inline structures.

4. **Editor coupling gap** — While PT is format-agnostic, the `@portabletext/editor` package is the only production-quality editor for authoring PT content. Unlike ProseMirror or Lexical, there isn't a broad ecosystem of editors that can author PT.

5. **Nested PT rendering is manual** — When rendering custom blocks with nested PT, developers must manually invoke `<PortableText>` for nested arrays. The serializer doesn't auto-detect nested PT fields.

### Implications for Editor Architecture

For an agent-native knowledge platform:

- **PT's flat array model** is attractive for AI-driven content operations (insertion, reordering, summarization) because blocks are independently addressable
- **The `_type` discriminator pattern** is the simplest possible custom type system — a single field maps content to rendering
- **The schema-to-UI pattern** (auto-generating edit forms from object schemas) reduces the developer surface area for adding new block types
- **The component dictionary pattern** (`types: { myType: MyComponent }`) is the simplest rendering architecture — no plugin systems, no middleware
- **Nested PT as recursive composition** is elegant but creates editing UX challenges at depth > 2

---

## Architecture Takeaways

### Patterns Worth Adopting

1. **`_type` + `_key` identity system** — Universal, minimal, sufficient. Every content object needs only these two fields for type dispatch and stable identity.

2. **Schema-driven edit UI** — Define the shape, get the form. Sanity's auto-generation from object schemas dramatically reduces the cost of adding new block types.

3. **Flat type→component rendering dictionary** — The `PortableTextComponents` pattern is the simplest possible serializer architecture. No registration, no lifecycle hooks, no middleware.

4. **Three-tier custom content model** — Block objects, inline objects, and annotations cover the full spectrum of custom content within rich text.

5. **Mark references (not nesting)** — The `markDefs` + key reference pattern for annotations avoids deep nesting and simplifies overlapping marks.

### Patterns to Evaluate Carefully

1. **Flat array vs tree** — PT's flat structure is great for simple documents but creates friction for complex layouts. A tree structure (like ProseMirror/Lexical) handles nesting more naturally at the cost of serialization complexity.

2. **Modal editing for custom blocks** — Sanity's modal-based editing isolates custom block content from the main text flow. This is simple but breaks flow. Inline editing (like Notion) might be preferable for some use cases.

3. **Single-editor ecosystem** — PT's format agnosticism is valuable, but in practice only one editor can author it. For a platform that needs the authoring experience, the editor matters more than the format.

---

## Key Source Files Index

| File | Purpose |
|---|---|
| `packages/@sanity/types/src/portableText/types.ts` | Core PT type definitions |
| `packages/@sanity/types/src/portableText/asserters.ts` | Runtime type guards |
| `packages/@sanity/types/src/schema/definition/type/block.ts` | Block schema definition interface |
| `packages/@sanity/types/src/schema/definition/type/object.ts` | Object schema definition interface |
| `packages/sanity/src/core/form/inputs/PortableText/PortableTextInput.tsx` | Main PTE input component |
| `packages/sanity/src/core/form/inputs/PortableText/Compositor.tsx` | Render dispatch (text vs object blocks) |
| `packages/sanity/src/core/form/inputs/PortableText/toolbar/helpers.tsx` | Insert menu item generation |
| `packages/sanity/src/core/form/inputs/PortableText/toolbar/Toolbar.tsx` | Insert block/inline handlers |
| `packages/sanity/src/core/form/inputs/PortableText/object/BlockObject.tsx` | Block object rendering + editing |
| `packages/sanity/src/core/form/inputs/PortableText/object/InlineObject.tsx` | Inline object rendering |
| `packages/sanity/src/core/form/inputs/PortableText/object/Annotation.tsx` | Annotation rendering |
| `packages/sanity/src/core/form/inputs/PortableText/object/modals/ObjectEditModal.tsx` | Modal system for editing |
| `packages/sanity/src/core/form/inputs/PortableText/contexts/PortableTextMemberSchemaTypes.tsx` | Schema type context provider |
| `packages/sanity/src/core/comments/components/pte/CommentMessageSerializer.tsx` | Example @portabletext/react usage |
| `dev/test-studio/schema/standard/portableText/allTheBellsAndWhistles.ts` | Comprehensive custom block examples |

## Evidence Files

- [e01-pt-type-definitions.md](evidence/e01-pt-type-definitions.md) — Core TypeScript type definitions
- [e02-block-schema-definition.md](evidence/e02-block-schema-definition.md) — BlockDefinition interface with full comment documentation
- [e03-custom-block-example.md](evidence/e03-custom-block-example.md) — InfoBox custom block with nested PT (from test studio)
- [e04-pte-editing-architecture.md](evidence/e04-pte-editing-architecture.md) — PTE rendering dispatch, insert flow, modal system
- [e05-react-serializer-pattern.md](evidence/e05-react-serializer-pattern.md) — @portabletext/react component mapping pattern
- [e06-serialization-json-examples.md](evidence/e06-serialization-json-examples.md) — PT JSON format examples for all content types
