# Payload CMS: Custom Blocks in Lexical Rich Text Editor

**Date:** 2026-04-03
**Scope:** Source code analysis of Payload CMS's `BlocksFeature` for custom blocks in their Lexical-based rich text editor
**Source:** `~/.claude/oss-repos/payload/` (packages/richtext-lexical)
**Relevance:** Informs editor architecture decisions for an agent-native knowledge platform

---

## Executive Summary

Payload CMS implements custom blocks as **Lexical DecoratorBlockNodes** whose schemas are defined using Payload's standard field system. This means any Payload field type — text, select, relationship, upload, array, or even nested rich text — can appear inside a block. The admin UI auto-generates editing forms from these schemas, rendering them in collapsible sections with drawer-based detailed editing. Frontend rendering uses a type-safe converter registry keyed by block slug. The architecture cleanly separates schema definition (server), editing UI (client), serialization (JSON/HTML/JSX/Markdown), and frontend rendering into independent layers.

---

## D1: Schema Definition

### BlocksFeature API

The entry point is `BlocksFeature()`, a server feature factory that accepts two arrays:

```typescript
// packages/richtext-lexical/src/features/blocks/server/index.ts:24-27
export type BlocksFeatureProps = {
  blocks?: (Block | BlockSlug)[] | Block[]
  inlineBlocks?: (Block | BlockSlug)[] | Block[]
}
```

Usage in a Lexical editor configuration:

```typescript
lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    BlocksFeature({
      blocks: [CalloutBlock, MediaBlock, 'codeBlock'],  // slug reference
      inlineBlocks: [MentionBlock],
    }),
  ],
})
```

Blocks can be defined inline or referenced by slug from a global `config.blocks` registry, enabling reuse across multiple rich text fields. [[e01]](evidence/e01-blocks-feature-api.md)

### Block Type Definition

A block is defined as a `Block` object with a `slug` and a `fields` array:

```typescript
// packages/payload/src/fields/config/types.ts:1512-1598 (summarized)
export type Block = {
  slug: string              // Unique identifier
  fields: Field[]           // Standard Payload fields
  labels?: Labels           // Display names
  admin?: {
    components?: {
      Block?: PayloadComponent  // Custom editor component
      Label?: PayloadComponent
    }
    group?: string          // Menu grouping
    images?: { icon?, thumbnail? }
    disableBlockName?: boolean
  }
  jsx?: BlockJSX            // Markdown import/export
}
```

[[e02]](evidence/e02-block-type-definition.md)

### Supported Field Types

Because `fields: Field[]` uses Payload's standard field system, blocks support **every field type** available in Payload:

| Category | Field Types |
|----------|-------------|
| **Text inputs** | `text`, `textarea`, `email`, `number`, `code`, `json` |
| **Selection** | `select`, `radio`, `checkbox`, `date` |
| **Composite** | `array`, `group`, `row`, `collapsible`, `tabs` |
| **Relationships** | `relationship`, `upload`, `join` |
| **Rich content** | `richText` (recursive Lexical editors) |
| **Layout** | `ui` (non-data presentational) |
| **Nested blocks** | `blocks` (recursive block nesting) |

### Example Block Definition

```typescript
// test/live-preview/blocks/MediaBlock/index.ts
export const MediaBlock: Block = {
  slug: 'mediaBlock',
  fields: [
    { name: 'position', type: 'select', defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Fullscreen', value: 'fullscreen' },
      ] },
    { name: 'media', type: 'upload', relationTo: 'media', required: true },
  ],
}
```

### Architectural Insight

**Schema = standard fields.** Payload does not invent a separate "block schema" language. Blocks reuse the same field types, validation, access control, and hooks as any collection field. This is a powerful design choice: any capability added to the field system automatically becomes available in blocks.

---

## D2: Editing UI in Lexical

### Lexical Node Type

Custom blocks are implemented as **DecoratorBlockNode** subclasses — a Lexical node type that renders via React components rather than DOM manipulation.

```typescript
// packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx:39
export class ServerBlockNode extends DecoratorBlockNode {
  __fields: BlockFields   // { id, blockType, blockName, ...customFields }
  __cacheBuster: number   // Triggers React re-render on field update
}

// packages/richtext-lexical/src/features/blocks/client/nodes/BlocksNode.tsx:16
export class BlockNode extends ServerBlockNode {
  override decorate(_editor, config): JSX.Element {
    return <BlockComponent formData={this.getFields()} nodeKey={this.getKey()} ... />
  }
}
```

There are two node types:
- `type: 'block'` — Full-width blocks (extends `DecoratorBlockNode`)
- `type: 'inlineBlock'` — Inline blocks within text flow (extends `DecoratorNode`)

[[e03]](evidence/e03-lexical-node-types.md)

### Auto-Generated Editing Forms

The `BlockContent` component makes a key rendering decision: if a custom component is provided via `admin.components.Block`, use it; otherwise, auto-generate the form from the block schema.

```typescript
// packages/richtext-lexical/src/features/blocks/client/component/BlockContent.tsx:117-139
return CustomBlock ? (
  <BlockComponentContext value={{ ...contextProps, BlockCollapsible }}>
    {CustomBlock}
    <BlockDrawer />
  </BlockComponentContext>
) : (
  <CollapsibleWithErrorProps>
    <RenderFields fields={formSchema} forceRender={true} readOnly={!isEditable} ... />
  </CollapsibleWithErrorProps>
)
```

`RenderFields` is Payload's universal form renderer — it generates the correct input component for each field type. [[e04]](evidence/e04-block-editing-ui.md)

### Editing Experience

The editing experience combines two patterns:

1. **Collapsible in-editor**: Blocks render as collapsible sections directly in the editor flow, showing the block type pill, name, error count, and edit/remove buttons.
2. **Right-side drawer**: Clicking "Edit" opens a drawer panel with the full block form. The drawer preserves Lexical selection state on open/close via `useLexicalDrawer()`.

### Block Insertion

Users insert blocks via:
- **Slash menu**: Type `/` to see available blocks, filtered by keywords
- **Toolbar dropdown**: Block icon in the fixed toolbar with a dropdown of block types

Both dispatch `INSERT_BLOCK_COMMAND` (or `INSERT_INLINE_BLOCK_COMMAND`), handled by `BlocksPlugin`.

```typescript
// packages/richtext-lexical/src/features/blocks/client/plugin/index.tsx:51-76
editor.registerCommand(INSERT_BLOCK_COMMAND, (payload) => {
  editor.update(() => {
    const blockNode = $createBlockNode(payload)
    $insertNodeToNearestRoot(blockNode)
    // Remove empty paragraph if cursor was in one
  })
})
```

### Architectural Insight

**Decorator nodes are the key abstraction.** Lexical's DecoratorNode pattern — where the node's `decorate()` method returns arbitrary JSX — allows Payload to embed full React form components inside the editor without any DOM hacking. The editor treats blocks as opaque decorated elements, while Payload's form system handles the actual editing.

---

## D3: Serialization

### JSON Structure

Blocks serialize as Lexical nodes with `type: 'block'` and all block data in a flat `fields` object:

```json
{
  "type": "block",
  "version": 2,
  "format": "",
  "fields": {
    "id": "507f1f77bcf86cd799439011",
    "blockName": "Important Note",
    "blockType": "callout",
    "style": "warning",
    "richContent": { "root": { "type": "root", "children": [...] } }
  }
}
```

Custom field values are spread directly into `fields` alongside the system fields (`id`, `blockType`, `blockName`). The `blockType` discriminator is used at every layer: validation, form rendering, HTML/JSX conversion, and frontend rendering. [[e05]](evidence/e05-serialization-json-structure.md)

### Database Storage

The entire Lexical `SerializedEditorState` JSON is stored as-is in the database. No block normalization, no separate block tables. This is a deliberate simplicity trade-off: blocks live entirely within the rich text field's JSON column.

### HTML Conversion

The HTML converter system uses a type-discriminated registry:

```typescript
// packages/richtext-lexical/src/features/converters/lexicalToHtml/shared/findConverterForNode.ts:30-38
if (node.type === 'block') {
  converterForNode = converters?.blocks?.[node.fields?.blockType]
}
```

Each block type can register an HTML converter that receives the node's fields and returns an HTML string.

### JSX/React Conversion

The JSX converter follows the same pattern for server-side or static rendering:

```typescript
// packages/richtext-lexical/src/features/converters/lexicalToJSX/converter/index.tsx:53-70
if (node.type === 'block') {
  converterForNode = converters?.blocks?.[node.fields?.blockType]
} else if (node.type === 'inlineBlock') {
  converterForNode = converters?.inlineBlocks?.[node.fields?.blockType]
}
```

### Markdown Serialization

Blocks serialize to JSX-like tags in markdown:

```markdown
<callout style="warning">
  This is the **inner content** of the callout.
</callout>
```

The `BlockJSX` configuration on each block defines bidirectional `export` and `import` functions. Custom regex patterns can override the default JSX tag format (e.g., code blocks use triple backticks). [[e08]](evidence/e08-markdown-serialization.md)

### Architectural Insight

**Three conversion paths, one registry pattern.** HTML, JSX, and Markdown converters all follow the same pattern: a map keyed by `blockType` slug, with each converter receiving the node's fields. This consistency means adding a new output format is straightforward — implement the registry pattern and write per-block converters.

---

## D4: Nested Rich Text

### Full Recursive Nesting

Rich text fields can be nested inside blocks, and those nested rich text fields can themselves contain `BlocksFeature` with more blocks:

```typescript
// test/lexical/collections/Lexical/blocks.ts:265-298
export const RichTextBlock: Block = {
  slug: 'richTextBlock',
  fields: [{
    name: 'richTextField',
    type: 'richText',
    editor: lexicalEditor({
      features: ({ defaultFeatures }) => [
        ...defaultFeatures,
        BlocksFeature({
          blocks: [{
            slug: 'lexicalAndUploadBlock',
            fields: [
              { name: 'subRichTextField', type: 'richText', editor: lexicalEditor({}) },
              { name: 'subUploadField', type: 'upload', relationTo: 'uploads' },
            ],
          }],
        }),
      ],
    }),
  }],
}
```

This creates a 3-level nesting: Top editor → RichTextBlock → richTextField (nested editor) → lexicalAndUploadBlock → subRichTextField (doubly-nested editor). [[e07]](evidence/e07-nested-richtext-example.md)

### How Deep Can It Go?

No explicit `maxDepth` configuration was found in the BlocksFeature API. Each nested rich text field creates an independent Lexical editor instance. Depth is tracked via `useEditDepth()` for drawer stacking management in the admin UI, but this is a UI concern, not a data limitation.

### Serialized Nesting

In the serialized JSON, nested rich text appears as a nested `SerializedEditorState` object:

```json
{
  "type": "block",
  "fields": {
    "blockType": "richTextBlock",
    "richTextField": {
      "root": {
        "type": "root",
        "children": [
          {
            "type": "block",
            "fields": {
              "blockType": "lexicalAndUploadBlock",
              "subRichTextField": { "root": { ... } }
            }
          }
        ]
      }
    }
  }
}
```

### Architectural Insight

**Composition through independence.** Each nested Lexical editor is a fully independent instance with its own feature set, toolbar, and state management. This avoids the complexity of a single shared editor managing nested editing contexts, but means each nesting level incurs the full weight of a Lexical editor.

---

## D5: Frontend Rendering

### RichText Component

The `@payloadcms/richtext-lexical/react` package exports a `RichText` React component:

```typescript
// packages/richtext-lexical/src/features/converters/lexicalToJSX/Component/index.tsx:49-89
export const RichText: React.FC<RichTextProps> = ({
  className, converters, data: editorState, disableContainer, ...
}) => {
  let finalConverters = converters
    ? (typeof converters === 'function'
        ? converters({ defaultConverters: defaultJSXConverters })
        : converters)
    : defaultJSXConverters

  const content = convertLexicalToJSX({ converters: finalConverters, data: editorState })
  return <div className={className ?? 'payload-richtext'}>{content}</div>
}
```

### Component Mapping Pattern

Developers provide custom block renderers via a converter function:

```typescript
const jsxConverters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  blocks: {
    callout: ({ node }) => (
      <div className={`callout callout--${node.fields.style}`}>
        {node.fields.content}
      </div>
    ),
    mediaBlock: ({ node }) => <MediaBlock {...node.fields} />,
  },
  inlineBlocks: {
    mention: ({ node }) => <span className="mention">@{node.fields.name}</span>,
  },
})

// Usage
<RichText converters={jsxConverters} data={page.content} />
```

[[e06]](evidence/e06-jsx-converter-system.md)

### Type Safety

The `JSXConverters` type uses conditional type inference to extract valid block slugs from the serialized node type parameter, providing autocomplete for block slug keys in the converter map.

### Package Exports

Available via `@payloadcms/richtext-lexical/react`:
- `RichText` component
- `JSXConvertersFunction` type
- `defaultJSXConverters`
- Individual node converters (`ParagraphJSXConverter`, `HeadingJSXConverter`, etc.)
- `convertLexicalNodesToJSX` utility

### Architectural Insight

**Converter function pattern enables progressive customization.** By providing `defaultConverters` to the converter function, developers only need to override the blocks they've defined. Standard Lexical nodes (paragraphs, headings, lists, links) are handled automatically.

---

## D6: Slate-to-Lexical Migration

### Why They Moved

Payload originally used Slate.js for rich text editing. The migration to Lexical (Meta's editor framework) was driven by:
- Lexical's more predictable, immutable state model
- Better extensibility via the features/plugin system
- Active maintenance from Meta

### Migration Approach

Payload provides three migration strategies:

1. **On-the-fly conversion** via `SlateToLexicalFeature`: An `afterRead` hook detects Slate format (arrays) vs Lexical (objects with `root`) and converts on read without modifying the database.

2. **Batch migration** via `migrateSlateToLexical()`: A utility that recursively crawls all documents, finding rich text fields in blocks, arrays, groups, and tabs, and converting them in-place.

3. **Manual conversion** via `convertSlateToLexical()`: A pure function for one-off conversions.

```typescript
// Available as @payloadcms/richtext-lexical/migrate
export { SlateToLexicalFeature }
export { migrateSlateToLexical }
export { convertSlateToLexical, convertSlateNodesToLexical }
```

[[e09]](evidence/e09-slate-to-lexical-migration.md)

### What Changed for Custom Blocks

The fundamental block model is unchanged — blocks are still defined with `slug` and `fields`. What changed is the **container**: blocks moved from being Slate void elements to Lexical DecoratorBlockNodes. The serialized format changed from Slate's nested array structure to Lexical's tree-with-root structure, and blocks gained JSX/Markdown serialization capabilities that weren't available in Slate.

---

## Architecture Patterns Summary

| Pattern | Payload's Approach | Relevance to Agent-Native Editor |
|---------|-------------------|----------------------------------|
| **Schema definition** | Reuse standard field system (`Field[]`) | Validate: can we reuse our own field system for block schemas? |
| **Editing UI** | Auto-generated from schema via `RenderFields`, with custom component override | Strong pattern: auto-generate 80% of editing UI, allow full override |
| **Lexical integration** | DecoratorBlockNode with `decorate()` returning JSX | This is the standard Lexical pattern for embedded components |
| **Serialization** | Flat `fields` object within Lexical node JSON, `blockType` discriminator | Simple and effective; consider if normalization is needed at scale |
| **Multi-format output** | Registry of converters keyed by blockType (HTML, JSX, Markdown) | Extensible pattern; add new output formats without changing blocks |
| **Frontend rendering** | `RichText` component + converter function pattern | Clean separation; frontend is decoupled from admin editing |
| **Nested rich text** | Independent Lexical instances per nesting level | Works but heavy; consider lighter approach for shallow nesting |
| **Migration** | Detect-and-convert on read, batch migrate utility | Good rollout pattern for editor changes |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/richtext-lexical/src/features/blocks/server/index.ts` | BlocksFeature server factory |
| `packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx` | ServerBlockNode (DecoratorBlockNode) |
| `packages/richtext-lexical/src/features/blocks/client/nodes/BlocksNode.tsx` | Client BlockNode with `decorate()` |
| `packages/richtext-lexical/src/features/blocks/client/component/BlockContent.tsx` | Block form rendering (auto-gen or custom) |
| `packages/richtext-lexical/src/features/blocks/client/component/index.tsx` | BlockComponent with form state management |
| `packages/richtext-lexical/src/features/blocks/client/plugin/index.tsx` | Block insertion command handler |
| `packages/richtext-lexical/src/features/blocks/client/markdown/markdownTransformer.ts` | Markdown ↔ Block bidirectional conversion |
| `packages/richtext-lexical/src/features/converters/lexicalToJSX/Component/index.tsx` | `RichText` frontend component |
| `packages/richtext-lexical/src/features/converters/lexicalToJSX/converter/types.ts` | JSXConverters type with block support |
| `packages/richtext-lexical/src/features/converters/lexicalToJSX/converter/index.tsx` | Block-aware JSX conversion logic |
| `packages/richtext-lexical/src/features/migrations/slateToLexical/converter/index.ts` | Slate-to-Lexical converter |
| `packages/payload/src/fields/config/types.ts` | Core `Block` and `Field` type definitions |

---

## Evidence Index

| ID | Title | Dimension |
|----|-------|-----------|
| [e01](evidence/e01-blocks-feature-api.md) | BlocksFeature Server API and Props Type | D1 |
| [e02](evidence/e02-block-type-definition.md) | Block Type Definition from Payload Core | D1 |
| [e03](evidence/e03-lexical-node-types.md) | Lexical Node Implementation (DecoratorBlockNode) | D2 |
| [e04](evidence/e04-block-editing-ui.md) | Block Editing UI - Form Auto-Generation | D2 |
| [e05](evidence/e05-serialization-json-structure.md) | Serialized Block JSON Structure | D3 |
| [e06](evidence/e06-jsx-converter-system.md) | Frontend JSX Converter System | D5 |
| [e07](evidence/e07-nested-richtext-example.md) | Nested Rich Text Inside Blocks | D4 |
| [e08](evidence/e08-markdown-serialization.md) | Markdown Serialization via JSX-like Tags | D3 |
| [e09](evidence/e09-slate-to-lexical-migration.md) | Slate-to-Lexical Migration Converter | D6 |
