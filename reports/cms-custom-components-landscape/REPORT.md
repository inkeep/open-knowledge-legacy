---
title: "CMS Custom Components in Rich Text Editors: Architecture Landscape"
description: "How 12 CMS platforms define, edit, serialize, and render custom components/blocks in their rich text editors — source-code-level investigation of Payload CMS (Lexical), Sanity (Portable Text), TinaCMS (MDX/Plate), and Keystatic (ProseMirror), plus comparative survey of Strapi, Contentful, Builder.io, Storyblok, WordPress Gutenberg, Notion, Directus, and Hygraph. Identifies cross-cutting architectural patterns for schema definition, editing UI generation, serialization formats, nested rich text, and frontend rendering."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Payload CMS
  - Sanity
  - TinaCMS
  - Keystatic
  - Strapi
  - Contentful
  - Builder.io
  - Storyblok
  - WordPress Gutenberg
  - Notion
  - Directus
  - Hygraph
topics:
  - custom components in rich text
  - CMS block architecture
  - schema-driven editing
  - rich text serialization
  - nested content composition
---

# CMS Custom Components in Rich Text Editors: Architecture Landscape

**Purpose:** Understand how CMS platforms define, edit, serialize, and render custom components/blocks in their rich text editors. Identify architectural patterns that could inform editor architecture for an agent-native knowledge platform with custom block types (callouts, tabs, code groups, embeds, etc.).

---

## Executive Summary

Twelve CMS platforms were investigated — four at source-code depth (Payload CMS, Sanity, TinaCMS, Keystatic) and eight through documentation and partial source analysis (Strapi, Contentful, Builder.io, Storyblok, WordPress Gutenberg, Notion, Directus, Hygraph). The investigation traced the full lifecycle of custom components: schema definition, editing UI generation, serialization, nested content handling, and frontend rendering.

**The central finding is convergence.** Despite radically different editor frameworks (Lexical, ProseMirror, Slate, proprietary), serialization formats (Lexical JSON, Portable Text, MDX, Markdoc, ProseMirror JSON, HTML-with-comments), and architectural philosophies, all 12 systems converge on the same fundamental patterns:

**Key Findings:**

- **The discriminator-driven component map is universal.** Every system uses a single string field (`_type`, `blockType`, `component`, `nodeType`, `__component`, `collection`) to route content data to rendering components. This pattern appears in schema definition, editing dispatch, serialization, and frontend rendering — it is the load-bearing abstraction.

- **Schema-driven UI generation is the dominant pattern.** Ten of twelve systems auto-generate editing forms from declarative field schemas. The developer defines the shape (fields, types, defaults); the CMS generates the editing UI. The two exceptions (WordPress Gutenberg, Notion) require developer-authored editing components.

- **Three paradigms exist for custom blocks inside rich text.** (1) Embedded typed nodes within the rich text AST — the content data lives inline in the document tree (Payload, Sanity, Storyblok, Builder.io). (2) Reference nodes — void nodes in the AST that carry only an ID; actual data resolved separately (Contentful, Hygraph). (3) Separated composition — rich text and custom blocks are distinct, non-interleaving systems (Strapi Dynamic Zones, Directus M2A).

- **Nested rich text inside custom components is universally supported** through recursive composition. Every system that allows custom blocks also supports rich text fields within those blocks. The architectural mechanism varies: independent editor instances (Payload), modal sub-editors (Sanity), recursive AST parsing (TinaCMS), ProseMirror child content (Keystatic). No system imposes hard depth limits, though editing UX degrades beyond 2-3 levels.

- **JSON is the dominant serialization format** for rich text with custom blocks. Only WordPress Gutenberg uses HTML (with JSON metadata in comments). MDX serialization (TinaCMS, Keystatic) is a secondary path that adds conversion complexity. The most transport-independent format is Sanity's Portable Text — a flat array of typed objects with no editor runtime dependency.

- **The "void node + form panel" pattern dominates custom block editing.** In Payload, Sanity, TinaCMS, and Keystatic, custom blocks render as opaque, non-editable elements in the document flow. Editing happens in side panels, drawers, or modals. No CMS has achieved true inline WYSIWYG editing of custom component props within the document flow.

---

## Research Rubric

**Report Type:** Comparative Analysis + Technology Deep-Dive
**Primary Question:** What are the common patterns across CMS systems for custom block schemas, editing UI generation, serialization, nested rich text handling, and frontend rendering — and which patterns should we adopt?
**Stance:** Factual with conclusions

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Payload CMS — Lexical-based blocks | Deep, Primary source | P0 |
| D2 | Sanity — Portable Text custom blocks | Deep, Primary source | P0 |
| D3 | TinaCMS — MDX component registration | Deep, Primary source | P0 |
| D4 | Keystatic — Content Components | Deep, Primary source | P0 |
| D5 | Strapi, Contentful, Builder.io, Storyblok | Moderate, Comparative | P0 |
| D6 | WordPress Gutenberg, Notion, Directus, Hygraph | Moderate, Survey | P1 |
| D7 | Cross-cutting synthesis | Deep, Analytical | P0 |

**Non-goals:** Implementing any CMS, evaluating CMS products for adoption, pricing/licensing, performance benchmarks, migration guides.

---

## Detailed Findings

### D1: Payload CMS — Lexical DecoratorBlockNodes

**Finding:** Payload implements custom blocks as Lexical `DecoratorBlockNode` subclasses with schemas defined using Payload's standard field system. The editing UI is auto-generated from field schemas via `RenderFields`, with an escape hatch to fully custom React components. Serialization follows a registry pattern keyed by `blockType` slug across three output formats (HTML, JSX, Markdown).

**Evidence:** [fanout/2026-04-03-initial/payload-cms-blocks/REPORT.md](fanout/2026-04-03-initial/payload-cms-blocks/REPORT.md)

**Schema definition:** A block is a `Block` object with a `slug` and `fields: Field[]` array. Because blocks reuse Payload's standard field system, every field type (text, select, relationship, upload, array, richText, nested blocks) is available inside blocks. This is a key design choice — no separate "block schema" language exists.

```typescript
const CalloutBlock: Block = {
  slug: 'callout',
  fields: [
    { name: 'style', type: 'select', options: ['warning', 'info', 'danger'] },
    { name: 'content', type: 'richText' },  // Nested rich text
  ],
}
```

**Editing UI:** Blocks render as collapsible sections in the editor with a "Edit" button that opens a right-side drawer. The drawer contains auto-generated form fields via `RenderFields`. If the developer provides `admin.components.Block`, that custom component renders instead. Insertion via slash menu (`/`) or toolbar dropdown.

**Serialization:** Blocks serialize as Lexical nodes with `type: 'block'` and field data in a flat `fields` object with `blockType` as discriminator. The entire Lexical `SerializedEditorState` JSON is stored as-is in the database. Three converter registries (HTML, JSX, Markdown) use the same `converters.blocks[blockType]` pattern.

**Nested rich text:** Fully recursive — no `maxDepth`. Each nested `richText` field creates an independent Lexical editor instance. Serialized as nested `SerializedEditorState` objects.

**Frontend rendering:** `<RichText>` component from `@payloadcms/richtext-lexical/react` with a converter function pattern that provides `defaultConverters` for standard nodes and allows block-specific overrides.

**Implications:**
- The "schema = standard fields" approach eliminates a separate block schema API — anything the CMS can model is available in blocks
- The DecoratorNode pattern (Lexical) is the standard way to embed arbitrary React inside a Lexical editor
- The converter registry pattern (keyed by blockType) is extensible to new output formats

---

### D2: Sanity — Portable Text's Flat Array Model

**Finding:** Portable Text is a flat array of typed JSON objects where `_type` is the universal discriminator. Custom blocks are simply objects with arbitrary fields placed in the array alongside text blocks. This design separates content structure from any editor runtime, making PT the most format-agnostic serialization model investigated.

**Evidence:** [fanout/2026-04-03-initial/sanity-portable-text/REPORT.md](fanout/2026-04-03-initial/sanity-portable-text/REPORT.md)

**Schema definition:** Developers define custom block types as object schemas within a PT array field using Sanity's `defineField`/`defineType` DSL. A PT field is always an `array` containing a `block` type member (for text) plus optional custom object type members (for custom blocks).

```typescript
defineField({
  type: 'array', name: 'body',
  of: [
    defineArrayMember({ type: 'block', /* styles, marks, inline objects */ }),
    defineField({ type: 'object', name: 'callout', fields: [
      { type: 'string', name: 'variant' },
      { type: 'array', name: 'content', of: [{ type: 'block' }] },  // Nested PT
    ]}),
  ],
})
```

**Three-tier custom content:** Block objects (standalone), inline objects (within text flow in `children[]`), and annotations (mark-like objects on text ranges via `markDefs` references). This taxonomy covers the full spectrum of custom content within rich text.

**Editing UI:** The PTE (Portable Text Editor) wraps `@portabletext/editor` with Sanity Studio's form system. Custom blocks render as preview cards (`BlockObject`); editing opens in a modal dialog (popover or dialog). The form is auto-generated from the object schema's `fields[]`. Three modal variants exist: `PopoverEditDialog`, `EnhancedObjectDialog`, `DefaultEditDialog`.

**Serialization:** PT's flat array model with `_type`/`_key` per object. Text blocks use a span-based model with `markDefs` references for overlapping marks. Custom blocks are open-ended objects — any JSON-serializable data is valid with just `_type` and `_key`.

**Frontend rendering:** `@portabletext/react` uses a flat `PortableTextComponents` dictionary: `types.*` for custom blocks, `block.*` for text block styles, `marks.*` for decorators/annotations. Nested PT requires the developer to manually call `<PortableText>` for nested arrays.

**Implications:**
- PT's flat array is attractive for AI-driven content operations (blocks are independently addressable)
- The `_type` discriminator pattern is the simplest possible custom type system
- The `markDefs` reference pattern avoids deeply nested mark structures
- Format agnosticism comes at the cost of a single-editor ecosystem (only `@portabletext/editor` can author PT)

---

### D3: TinaCMS — Template-Driven MDX Components

**Finding:** TinaCMS uses a template system where developers define component schemas as `Template` objects with typed `fields` arrays. The editor is built on Plate.js (Slate wrapper), with MDX components represented as void nodes. The serialization pipeline is template-aware — field types determine how each prop is parsed and serialized to MDX.

**Evidence:** [fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md](fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md)

**Schema definition:** Components are registered via the `templates` array on a `rich-text` field. Each `Template` has a `name` (must match the JSX component name), `label`, and `fields: Field[]` with types including string, number, boolean, datetime, image, reference, rich-text, and object. The `inline` flag distinguishes block vs. inline JSX. A `match` option enables custom shortcode syntax.

**Editing UI:** Auto-generated from template fields via a plugin registry. When a user clicks an MDX component in the editor, a `NestedForm` opens in a side panel (`FormPortal`). Each field type has a `FieldPlugin` with a `Component` renderer. The plugin registry is extensible — adding a new field type requires registering a plugin. The `wrapFieldsWithMeta` HOC ensures consistent label/description/error chrome.

**MDX Serialization:** Template-aware bidirectional pipeline: MDX string to MDAST (via remark-mdx) to Plate IR (via `remarkToSlate`), and reverse via `rootElement()` to MDAST to MDX string. The pipeline uses field type definitions to determine parse/serialize behavior per prop. Unknown components (no matching template) are demoted to raw HTML — a safety/predictability tradeoff.

**Rich text nesting:** The `children` field (special-cased) maps to natural JSX children. Other rich-text fields serialize as JSX fragment expressions (`prop={<>content</>}`). Nesting is recursive via `remarkToSlate()` recursive calls. Arbitrary depth is supported.

**Frontend rendering:** `TinaMarkdown` component recursively walks the content tree, dispatching nodes to components by name. Fully decoupled from schema and editing — knows only the content tree structure. Custom components receive their template fields as props.

**Implications:**
- The void node model avoids the complexity of inline structured editing but creates a context switch
- Template-aware serialization means the pipeline cannot handle unregistered components (safety vs. flexibility tradeoff)
- The `children` vs. non-children distinction for rich text is a key serialization design decision
- The plugin registry for field types is a clean extension point

---

### D4: Keystatic — Five-Kind ProseMirror Components

**Finding:** Keystatic implements a five-kind component taxonomy (`block`, `wrapper`, `inline`, `mark`, `repeating`) where each kind maps to a specific ProseMirror node/mark type. The system supports dual serialization to both MDX and Markdoc from the same document model. Props are stored as serialized JSON in ProseMirror node attributes.

**Evidence:** [fanout/2026-04-03-initial/keystatic-content-components/REPORT.md](fanout/2026-04-03-initial/keystatic-content-components/REPORT.md)

**Schema definition:** Factory functions (`block()`, `wrapper()`, `inline()`, `mark()`, `repeating()`) create components with a `schema` record using Keystatic's field system — the same API used for collection/singleton fields. The `ComponentSchema` union supports `text`, `select`, `integer`, `number`, `url`, `date`, `checkbox`, `multiselect`, `image`, `file`, `relationship`, `object`, `conditional`, and `array` types.

**Five kinds mapped to ProseMirror:**

| Kind | ProseMirror | Children? | Use case |
|------|-------------|-----------|----------|
| `block` | Atom node | No | Self-closing (embed, divider) |
| `wrapper` | Node with `content: 'block+'` | Rich text | Callout, note, aside |
| `inline` | Inline node | No | Mention, variable |
| `mark` | Mark | Wraps text | Highlight, custom formatting |
| `repeating` | Constrained container | Specific types | Tab group, accordion |

**Editing UI:** Default path is auto-generated modal forms via `BlockWrapper` with an "Edit" button. The developer can override with a `NodeView` component receiving `{ value, onChange, onRemove, isSelected }`. For wrapper components, the ProseMirror-managed child content renders inline with full editing behavior.

**Dual serialization:** The same ProseMirror document serializes to both Markdoc (`.mdoc`) and MDX (`.mdx`) via parallel serializer pipelines. The format choice is made at the field level, not the component level. Complex values use JSON.stringify in expressions.

**Nested rich text:** Wrapper components get `content: 'block+'`, meaning any block content (paragraphs, headings, lists, other components) can nest inside. Repeating components constrain children to specific types with count limits. No explicit depth limit.

**Frontend rendering:** Format-native: Markdoc content renders through `createMarkdocConfig()` + Markdoc's pipeline, MDX content through standard MDX tooling. The reader API is async — `content()` is lazy-loaded.

**Implications:**
- The five-kind taxonomy provides a non-overlapping classification that maps cleanly to ProseMirror
- ProseMirror-native integration means components participate in selection, undo, collaboration naturally
- Dual-format serialization from a single model is powerful but constrains to what both formats support
- The wrapper/block split cleanly solves the "does this component have children?" question

---

### D5-D6: Broader CMS Landscape

**Finding:** Eight additional systems confirm the patterns found in the Tier 1 investigation while revealing three distinct architectural paradigms for how custom blocks relate to rich text.

**Evidence:** [fanout/2026-04-03-initial/tier2-tier3-cms-survey/REPORT.md](fanout/2026-04-03-initial/tier2-tier3-cms-survey/REPORT.md)

**Three paradigms:**

| Paradigm | Systems | Mechanism |
|----------|---------|-----------|
| **Embedded typed nodes** | Storyblok, Builder.io | Custom block data lives inline within the rich text AST |
| **Reference nodes** | Contentful, Hygraph | Void nodes in the AST carry only an ID; data resolved separately |
| **Separated composition** | Strapi, Directus | Rich text and custom blocks are distinct, non-interleaving systems |

**Contentful's "everything is an entry" pattern** is notable: any content type can be embedded into rich text via `embedded-entry-block` nodes. There is no special "block" concept — embeds are regular entries reusable across contexts. The AST carries only link references (`sys.id`); actual data resolves via `includes.Entry` (REST) or `links` (GraphQL).

**WordPress Gutenberg** is the only system that serializes to HTML (with JSON metadata in comments): `<!-- wp:my-plugin/notice {"type":"warning"} -->`. This is also the only system where developers must write both `edit()` (React) and `save()` (HTML generation) functions — no auto-generated editing UI.

**Storyblok's hybrid model** uses TipTap/ProseMirror JSON for rich text with a custom `blok` node type that carries full component data inline. The iframe-bridge visual editing pattern (shared with Builder.io) decouples the editor from the rendering framework.

**Notion** has a closed, fixed set of ~32 block types with no developer extensibility — the only system that does not allow custom block definition.

---

### D7: Cross-Cutting Synthesis

#### Pattern 1: The Universal Discriminator

Every system uses a single string field to route content to renderers:

| System | Discriminator Field | Example Value |
|--------|-------------------|---------------|
| Payload CMS | `blockType` (in `fields`) | `"callout"` |
| Sanity | `_type` | `"infoBox"` |
| TinaCMS | `name` (on MDX element) | `"BlockQuote"` |
| Keystatic | ProseMirror node type | `"component0"` |
| Strapi | `__component` | `"blocks.hero-section"` |
| Contentful | `sys.contentType.sys.id` | `"codeBlock"` |
| Builder.io | `component.name` | `"Hero"` |
| Storyblok | `component` | `"hero_block"` |
| Gutenberg | HTML comment | `wp:my-plugin/notice` |
| Directus | `collection` | `"block_hero"` |
| Hygraph | `nodeType` | `"Post"` |

The pattern is `data[discriminator] -> lookup[value] -> Component`. This appears at every layer: schema resolution, editing dispatch, serialization, and frontend rendering.

#### Pattern 2: Schema-Driven UI Generation Is the Default

| Approach | Systems | Developer cost per block |
|----------|---------|------------------------|
| **Auto-generated from schema** | Payload, Sanity, TinaCMS, Keystatic, Strapi, Contentful, Builder.io, Storyblok, Directus, Hygraph | Define fields only |
| **Developer-authored edit components** | WordPress Gutenberg | Write `edit()` React component |
| **Fixed, not extensible** | Notion | N/A |

The dominant pattern: developer defines a declarative field schema, the CMS generates editing UI from it. Override escape hatches exist in Payload (`admin.components.Block`), Keystatic (`NodeView`), and TinaCMS (field plugins). The schema → form generation pipeline is the highest-leverage architectural pattern across the landscape.

#### Pattern 3: How Custom Blocks Exist Inside the Editor

| Strategy | Systems | Behavior |
|----------|---------|----------|
| **Lexical DecoratorNode** | Payload | `decorate()` returns arbitrary JSX; block is opaque to editor |
| **Void element** | TinaCMS | Slate void node; props edited in side panel |
| **ProseMirror atom node** | Keystatic (block) | Non-editable; props in modal |
| **ProseMirror container node** | Keystatic (wrapper) | Editable children; props in modal |
| **contentEditable=false block** | Sanity | Preview card; editing in modal/popover |
| **Embedded blok node** | Storyblok | TipTap node with full data in attrs |
| **Entry card** | Contentful | Reference card; click navigates to entry editor |

The common theme: **custom blocks are non-editable regions within the document flow.** No system has achieved true inline WYSIWYG editing of structured component props within the text editor. The closest is Keystatic's `wrapper` kind, where rich text children are editable inline but props still require a modal.

#### Pattern 4: Serialization Format Comparison

| Format | Systems | Custom block representation | Editor coupling |
|--------|---------|---------------------------|----------------|
| **Lexical JSON** | Payload | `{ type: 'block', fields: { blockType, ...data } }` | Tight (Lexical runtime) |
| **Portable Text** | Sanity | `{ _type: 'customType', _key, ...data }` in flat array | None (format-agnostic) |
| **Plate/Slate IR** | TinaCMS | Void node with `props: { ...data }` → serialized to MDX | Medium (Slate) |
| **ProseMirror JSON** | Keystatic, Storyblok | Node with `attrs: { props: JSON }` | Medium (ProseMirror) |
| **MDX text** | TinaCMS, Keystatic | `<Component prop="value">children</Component>` | None (text format) |
| **Markdoc text** | Keystatic | `{% tag attr="value" %}children{% /tag %}` | None (text format) |
| **Custom JSON AST** | Contentful, Strapi | Proprietary node structure | Tight (vendor) |
| **Slate 0.5 AST** | Hygraph | Slate-format nodes with embed references | Medium (Slate) |
| **HTML + comments** | Gutenberg | `<!-- wp:name {json} -->html<!-- /wp:name -->` | Low (degrades gracefully) |

**Portable Text stands alone** as the only format designed from the start to be editor-independent. Every other JSON format mirrors an editor's internal representation to varying degrees.

**MDX/Markdoc text formats** add a conversion boundary (AST to text and back) but gain human readability and git-friendly diffing.

#### Pattern 5: Nested Rich Text Strategies

All systems support rich text inside custom blocks. The mechanisms differ:

| Mechanism | Systems | Tradeoff |
|-----------|---------|----------|
| **Independent editor instances** | Payload | Full feature set per level; heavy per instance |
| **Modal sub-editors** | Sanity, TinaCMS | Isolates editing context; context switch disrupts flow |
| **ProseMirror container nodes** | Keystatic (wrapper) | Native editing in children; props still in modal |
| **Recursive AST fields** | All systems in serialization | Unlimited depth structurally; UX degrades at depth > 2 |

No system imposes hard depth limits. Every system agrees that editing UX degrades significantly beyond 2-3 nesting levels.

#### Pattern 6: Frontend Rendering — The Component Map

Every system's frontend rendering follows the same architecture:

```
content[discriminator] → component_registry[discriminator_value] → React Component(data)
```

| System | API | Pattern |
|--------|-----|---------|
| Payload | `<RichText converters={fn}>` | Converter function with defaultConverters |
| Sanity | `<PortableText components={dict}>` | Flat dictionary by _type |
| TinaCMS | `<TinaMarkdown components={dict}>` | Flat dictionary by name |
| Keystatic | `createMarkdocConfig()` / MDX runtime | Markdoc tags or MDX components |
| Strapi | `<BlocksRenderer>` + component map | Tree walker + block map |
| Contentful | `documentToReactComponents(doc, opts)` | renderNode map by BLOCKS enum |
| Builder.io | `<Content customComponents={arr}>` | Array registration |
| Storyblok | `<StoryblokComponent blok={blok}>` | Global registry by `component` |
| Hygraph | `<RichText renderers={dict}>` | Typed embed renderers |

The convergence is total. Frontend rendering of custom blocks is a solved problem: a dictionary mapping discriminator values to components.

---

## Architectural Patterns for Our Editor

Based on the cross-cutting analysis, these patterns should inform our editor architecture:

### 1. Adopt a Discriminator-First Data Model

Every block/component should carry a `type` (or equivalent) string field as its primary identity. This field drives schema resolution, editing dispatch, serialization routing, and frontend rendering. The choice between flat (`"callout"`) vs. namespaced (`"blocks.callout"`) depends on whether extensibility/collision-avoidance matters.

### 2. Schema-Driven UI Generation with Override Escape Hatch

Define block schemas declaratively (field name, type, default, validation). Auto-generate the editing form from the schema. Provide an override mechanism for blocks that need custom editing UIs. This is the pattern used by 10 of 12 systems — it dramatically reduces the cost of adding new block types.

### 3. The Wrapper/Block Split for Children

Keystatic's distinction between `block` (no children, props only) and `wrapper` (has rich text children) is the cleanest solution to the "does this component have children?" question. Adopt a similar taxonomy.

### 4. Void/Decorator Nodes for Block Editing

Custom blocks should be non-editable regions in the editor (DecoratorNode in Lexical, void node in Slate, atom node in ProseMirror). Props are edited in side panels, drawers, or modals. This is the universal pattern — no system has achieved reliable inline prop editing within the document flow.

### 5. Component-Map Rendering is Solved

Frontend rendering is a flat dictionary from type string to React component. Provide default renderers for standard nodes; developers override for custom blocks. The Payload pattern (converter function receiving defaultConverters) is the most ergonomic API.

### 6. JSON as Primary Serialization, Text as Secondary

Store content as a JSON document tree (matching the editor's internal model). If text-format output is needed (MDX, Markdoc, Markdown), treat it as a serialization target — not the storage format. This avoids the conversion boundary problems documented in the companion MDX round-trip report.

### 7. Nested Rich Text via Recursive Composition

Support rich text fields within block schemas. Each nesting level should use the same editor infrastructure recursively. Expect UX degradation at depth > 2 and design the editing experience accordingly (progressive disclosure, breadcrumb navigation).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Collaborative editing with custom blocks:** How each system handles concurrent edits to the same custom block across multiple users was not investigated beyond Keystatic's Y.js integration mention.
- **Performance characteristics:** How systems handle documents with many custom blocks (100+) was not benchmarked.
- **Mobile editing:** None of the systems were evaluated for mobile editing of custom blocks.

### Out of Scope (per Rubric)

- CMS product evaluation for adoption
- Pricing, licensing, or commercial analysis
- Performance benchmarks
- Migration guides between systems

---

## References

### Evidence Files (Fanout Sub-Reports)

- [fanout/2026-04-03-initial/payload-cms-blocks/REPORT.md](fanout/2026-04-03-initial/payload-cms-blocks/REPORT.md) — Payload CMS BlocksFeature source-code analysis (9 evidence files)
- [fanout/2026-04-03-initial/sanity-portable-text/REPORT.md](fanout/2026-04-03-initial/sanity-portable-text/REPORT.md) — Sanity Portable Text architecture deep dive (6 evidence files)
- [fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md](fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md) — TinaCMS MDX component registration system (3 evidence files)
- [fanout/2026-04-03-initial/keystatic-content-components/REPORT.md](fanout/2026-04-03-initial/keystatic-content-components/REPORT.md) — Keystatic Content Components deep analysis (5 evidence files)
- [fanout/2026-04-03-initial/tier2-tier3-cms-survey/REPORT.md](fanout/2026-04-03-initial/tier2-tier3-cms-survey/REPORT.md) — Tier 2+3 CMS survey: Strapi, Contentful, Builder.io, Storyblok, Gutenberg, Notion, Directus, Hygraph (2 evidence files)

### External Sources

- [Payload CMS Source Code](https://github.com/payloadcms/payload) — packages/richtext-lexical/src/features/blocks/
- [Sanity Source Code](https://github.com/sanity-io/sanity) — packages/sanity/src/core/form/inputs/PortableText/
- [TinaCMS Source Code](https://github.com/tinacms/tinacms) — packages/@tinacms/mdx/, packages/tinacms/src/toolkit/
- [Keystatic Source Code](https://github.com/Thinkmill/keystatic) — packages/keystatic/src/content-components.ts
- [Portable Text Specification](https://github.com/portabletext/portabletext)
- [@portabletext/react](https://github.com/portabletext/react-portabletext)
- [@contentful/rich-text-types](https://www.npmjs.com/package/@contentful/rich-text-types)
- [Storyblok Blocks Concept](https://www.storyblok.com/docs/concepts/blocks)
- [Builder.io Custom Components](https://www.builder.io/c/docs/custom-components-setup)
- [WordPress Block Registration](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/)

### Related Research

- [mdx-crdt-roundtrip-fidelity](../mdx-crdt-roundtrip-fidelity/) — MDX conversion boundary analysis (the WYSIWYG approach)
- [mdx-text-editor-preview-approach](../mdx-text-editor-preview-approach/) — Text editor + live preview for MDX
- [rich-inline-text-editing](../rich-inline-text-editing/) — Inline text editing in visual code editors
- [source-of-truth-persistence-collaboration](../source-of-truth-persistence-collaboration/) — CRDT collaboration architecture
