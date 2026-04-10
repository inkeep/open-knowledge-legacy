# CMS Custom Components/Blocks Landscape Survey

**Date:** 2026-04-03
**Scope:** 8 CMS platforms — how they define, edit, serialize, and render custom components/blocks in rich text editors
**Purpose:** Identify architectural patterns that inform editor architecture for an agent-native knowledge platform

---

## Executive Summary

This survey examines how 8 CMS platforms handle custom components within rich text content. The systems split into two fundamental architectural paradigms:

1. **Unified block model** — Everything is a block; rich text and custom components live in the same tree (Notion, WordPress Gutenberg, Storyblok's richtext)
2. **Separated composition layers** — Rich text and structured components are distinct systems that reference each other (Strapi, Contentful, Directus)

A third hybrid emerges where embedded references appear as nodes within a rich text AST but the actual data lives outside the tree (Contentful, Hygraph, Builder.io).

Key cross-cutting findings:
- **Every system uses a string discriminator** (`__component`, `component`, `nodeType`, `__typename`, `type`, `collection`) to map data to renderers
- **JSON AST is the dominant serialization** — only WordPress Gutenberg uses HTML (with JSON-in-comments)
- **Frontend rendering universally follows a component-map pattern** — a registry keyed by the discriminator string
- **Rich text nesting inside custom blocks is universally supported**; the reverse (custom blocks inside rich text) varies significantly
- **Schema-driven UI generation** is the norm — most systems auto-generate editing forms from field declarations

---

## Table of Contents

1. [Tier 2 Systems (Moderate Depth)](#tier-2-systems)
   - [Strapi](#1-strapi)
   - [Contentful](#2-contentful)
   - [Builder.io](#3-builderio)
   - [Storyblok](#4-storyblok)
2. [Tier 3 Systems (Quick Survey)](#tier-3-systems)
   - [WordPress Gutenberg](#5-wordpress-gutenberg)
   - [Notion](#6-notion)
   - [Directus](#7-directus)
   - [Hygraph](#8-hygraph)
3. [Cross-System Comparison Matrix](#cross-system-comparison-matrix)
4. [Architectural Patterns & Implications](#architectural-patterns--implications)
5. [Sources](#sources)

---

## Tier 2 Systems

### 1. Strapi

#### Schema Definition

Strapi uses **JSON schema files** stored on the filesystem (`./src/api/[name]/content-types/[name]/schema.json`). Components live under `./src/components/[category]/`. The primary mechanism for custom blocks is **Dynamic Zones** — polymorphic ordered lists of developer-defined components.

```json
{
  "attributes": {
    "sections": {
      "type": "dynamiczone",
      "components": [
        "blocks.hero-section",
        "blocks.testimonial",
        "blocks.faq-block"
      ]
    }
  }
}
```

Components use a `<category>.<name>` naming convention and can nest other components, though Dynamic Zones cannot be nested inside components (a long-standing limitation — [GitHub #5798](https://github.com/strapi/strapi/issues/5798)).

#### Editing UI

Auto-generated from schemas. The Content Manager renders appropriate form inputs for each field type. Dynamic Zone editing shows a component picker dropdown; editors select a type, fill its fields inline, and reorder via drag-and-drop. Custom Fields extend the admin with Vue/React components but must map to existing Strapi data types (string, text, integer, json, etc.).

#### Rich Text Nesting

**Rich text inside components: Yes.** A component can include a `blocks` (Rich Text) field. **Custom blocks inside rich text: No.** The Blocks editor (v4.15+) has a fixed node vocabulary (paragraph, heading, list, quote, code, image, link). Custom block types cannot be added natively — community plugin [strapi-plugin-rich-text-blocks-extended](https://market.strapi.io/plugins/strapi-plugin-rich-text-blocks-extended) addresses this.

#### Serialization Format

Three rich text field types exist:

| Field Type | Format | Version |
|---|---|---|
| Rich Text (Markdown) | Markdown string | v3, v4 |
| Rich Text (Blocks) | JSON array of typed nodes | v4.15+, v5 default |
| Custom (CKEditor) | HTML string | Plugin |

The Blocks editor serializes as a JSON array with a Slate-like structure. Dynamic Zone API responses include a `__component` discriminator on each item:

```json
{
  "sections": [
    { "id": 2, "__component": "blocks.hero-section", "title": "Welcome" },
    { "id": 3, "__component": "blocks.cta", "theme": "primary" }
  ]
}
```

Strapi v5 requires explicit `on` fragments for population — no shared wildcard for components/dynamic zones ([v5 breaking change](https://docs.strapi.io/cms/migration/v4-to-v5/breaking-changes/no-shared-population-strategy-components-dynamic-zones)).

#### Frontend Rendering

**Blocks editor:** `@strapi/blocks-react-renderer` — a tree walker that maps node types to React components via `blocks` and `modifiers` props.

**Dynamic Zones:** Standard `__component` switch/map pattern:

```tsx
const componentMap = {
  'blocks.hero-section': Hero,
  'blocks.testimonial': Testimonial,
};
sections.map(s => {
  const C = componentMap[s.__component];
  return C ? <C key={s.id} {...s} /> : null;
});
```

#### Notable Patterns

- **Two-tier composition architecture:** Dynamic Zones (macro, component-level) and Blocks editor (micro, paragraph-level) are completely separate systems that don't interleave
- **Schema-on-disk:** Content-type schemas are version-controlled JSON files — code-first philosophy
- **Closed Blocks editor:** The rich text node vocabulary is fixed in core; extensibility is via Dynamic Zones, not inline custom blocks

**Sources:** [Strapi Models Docs](https://docs.strapi.io/cms/backend-customization/models) | [Dynamic Zones](https://strapi.io/features/dynamic-zone) | [blocks-react-renderer](https://github.com/strapi/blocks-react-renderer) | [v5 Population Guide](https://docs.strapi.io/cms/api/rest/guides/understanding-populate)

---

### 2. Contentful

#### Schema Definition

Contentful has no special "block" type. **Any content type can be embedded into a Rich Text field.** You define a regular content type (e.g., "CodeBlock" with `language` and `code` fields), then configure the Rich Text field's validations to allow embedding:

```json
{
  "validations": [
    { "enabledNodeTypes": ["embedded-entry-block", "embedded-entry-inline", "embedded-asset-block"] },
    { "nodes": {
        "embedded-entry-block": [{ "linkContentType": ["codeBlock", "videoEmbed", "callout"] }]
    }}
  ]
}
```

This is a **validation-driven configuration** model — you progressively restrict from a full set rather than building up.

#### Editing UI

Embedded entries appear as **entry cards** within the rich text flow. Block embeds show as compact cards with the entry title and content type icon. Inline embeds render as pill/chip elements. Clicking navigates to the full entry editor. The editing UI is auto-generated from entry content types. The editor itself is open-source ([`@contentful/field-editors`](https://github.com/contentful/field-editors)) and customizable via the App Framework.

#### Rich Text Nesting

**Yes.** Since embedded entries are regular entries, they can have their own Rich Text fields, which can themselves contain embedded entries. The REST API resolves linked entries up to **10 levels deep** (`include` parameter 1-10). The GraphQL API has no fixed depth limit — constrained by query complexity.

#### Serialization Format

Contentful uses a **JSON AST** with a `document` root node. The key insight: **embedded entries are void nodes** — they carry only a link reference, no children:

```json
{
  "nodeType": "embedded-entry-block",
  "data": {
    "target": { "sys": { "id": "abc123", "type": "Link", "linkType": "Entry" } }
  },
  "content": []
}
```

The actual entry data is resolved separately — via `includes.Entry` in REST or the `links` field in GraphQL. Node types are defined in `@contentful/rich-text-types` as `BLOCKS` and `INLINES` enums. Marks: `bold`, `italic`, `underline`, `code`, `superscript`, `subscript`.

#### Frontend Rendering

`@contentful/rich-text-react-renderer` provides `documentToReactComponents(document, options)` with `renderNode`, `renderMark`, and `renderText` customization:

```tsx
const options = {
  renderNode: {
    [BLOCKS.EMBEDDED_ENTRY]: (node) => {
      const entry = entryMap.get(node.data.target.sys.id);
      switch (entry.__typename) {
        case 'CodeBlock': return <CodeBlock {...entry} />;
        case 'Callout': return <Callout>{documentToReactComponents(entry.body.json)}</Callout>;
      }
    },
  },
};
```

With GraphQL, developers must build lookup Maps from the `links` object — a two-phase resolution pattern.

#### Notable Patterns

- **"Everything is an entry"** — No special block schema. Embedded components are regular entries, reusable across rich text fields, reference fields, and standalone contexts
- **Void node design** — The AST is a thin structural spine; heavy data lives in the entry graph
- **Two-phase resolution** (GraphQL) — `json` + `links` are separate; developers build Maps manually
- **Cross-space references** — Rich text can embed entries from different Contentful spaces

**Sources:** [Rich Text Concept](https://www.contentful.com/developers/docs/concepts/rich-text/) | [@contentful/rich-text-types](https://www.npmjs.com/package/@contentful/rich-text-types) | [rich-text-react-renderer](https://github.com/contentful/rich-text/tree/master/packages/rich-text-react-renderer) | [Content Modeling Patterns](https://www.contentful.com/help/content-modeling-patterns/)

---

### 3. Builder.io

#### Schema Definition

Builder uses **component registration** — developers declare custom React (or Vue/Svelte/etc.) components with an `inputs` schema describing their editable properties.

**Gen 1** (`@builder.io/react`):
```tsx
Builder.registerComponent(MyHero, {
  name: 'Hero',
  inputs: [
    { name: 'title', type: 'string', defaultValue: 'Hello' },
    { name: 'subtitle', type: 'richText' },
    { name: 'items', type: 'list', subFields: [{ name: 'label', type: 'text' }] },
  ],
  canHaveChildren: true,
});
```

**Gen 2** (`@builder.io/sdk-react`): Components are passed as an array to `<Content customComponents={[...]} />`.

Available input types include: `string`, `longText`, `richText`, `number`, `boolean`, `color`, `file`, `date`, `url`, `object` (nested via `subFields`), `list` (repeatable), `reference`, `code`, `uiBlocks` (nested Builder blocks), `enum`.

#### Editing UI

Auto-generated from the `inputs` array. Builder's Visual Editor is **iframe-based**: your actual site loads in an iframe, and the SDK communicates via `postMessage` to the parent editor. Each input type maps to a form control (text field, toggle, color picker, etc.). Builder never stores your component code — it only stores the component name and serialized option values.

#### Rich Text Nesting

**`richText` input type** provides a WYSIWYG editor, storing HTML strings. Rendering requires `dangerouslySetInnerHTML`. **Component nesting** is supported via `canHaveChildren: true` (renders `props.children`) and the `uiBlocks` input type (named slots with `BuilderBlocks` rendering component). The `uiBlocks` pattern enables composable, recursively nestable content slots (tabs, accordions, layout grids).

#### Serialization Format

All content is JSON. The core unit is `BuilderBlock`:

```json
{
  "@type": "@builder.io/sdk:Element",
  "id": "block-1",
  "component": { "name": "Hero", "options": { "title": "Welcome" } },
  "responsiveStyles": { "large": { "padding": "20px" } },
  "children": [...]
}
```

Custom components appear as `component.name` + `component.options`. Blocks nest recursively via `children`. Responsive styles are per-breakpoint objects. `bindings` and `actions` store JavaScript expressions for dynamic behavior.

#### Frontend Rendering

Gen 2 `<Content>` component renders the JSON block tree, looking up registered components by `component.name` and passing `component.options` as props. Builder uses **Mitosis** (their open-source compiler) to generate framework-specific SDKs from a single source — React, Vue, Svelte, Qwik, Angular, Solid, React Native. All SDKs follow the identical rendering pipeline.

#### Notable Patterns

- **Mitosis as "LLVM for frontend"** — Write SDK once, compile to 15+ framework targets
- **Your components, their editor** — Builder never stores component code; components live in your codebase, Builder persists only names + serialized options
- **JSON-first, framework-agnostic** — The same content JSON renders identically across any supported framework
- **`uiBlocks` for named slots** — Enables arbitrarily deep editable regions inside custom components

**Sources:** [Custom Components Setup](https://www.builder.io/c/docs/custom-components-setup) | [Input Types](https://www.builder.io/c/docs/custom-components-input-types) | [How Builder Works](https://www.builder.io/c/docs/how-builder-works-technical) | [Mitosis GitHub](https://github.com/BuilderIO/mitosis)

---

### 4. Storyblok

#### Schema Definition

Storyblok models content as a **recursive tree of typed components** called "bloks." Three blok types exist:

| Type | `is_root` | `is_nestable` | Purpose |
|---|---|---|---|
| Content Type | `true` | `false` | Top-level story types (page, article) |
| Nestable | `false` | `true` | Child building blocks (hero, cta, card) |
| Universal | `true` | `true` | Both standalone and nestable |

Blok schemas are defined via GUI or Management API with 15 field types: `text`, `textarea`, `richtext`, `markdown`, `number`, `boolean`, `datetime`, `asset`, `multiasset`, `bloks` (nested components), `option`, `options`, `link`, `table`, `plugin`. The `bloks` field creates a dynamic zone where editors insert, reorder, and remove child components. Restrictions use whitelists/denylists/tags per field.

#### Editing UI

Entirely auto-generated from schema. Storyblok's Visual Editor uses an **iframe-bridge** pattern: your frontend app loads in an iframe, and `storyblokEditable(blok)` spreads data attributes (`data-blok-c`, `data-blok-uid`) for clickable overlays. The bridge fires events on every keystroke (`input` event) for real-time preview.

#### Rich Text Nesting

**Bidirectional.** Bloks can contain `richtext` fields. Rich text can contain embedded `blok` nodes. Nesting depth is theoretically unlimited — constrained only by field-level whitelists. The `segmentStoryblokRichText()` utility splits a richtext document into ordered chunks of HTML vs. embedded blok nodes for rendering.

#### Serialization Format

API responses are JSON. Every blok carries `_uid` (unique ID), `component` (type name discriminator), and field values. The richtext field uses **TipTap/ProseMirror JSON**:

```json
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "text": "Hello", "type": "text" }] },
    { "type": "blok", "attrs": { "body": [
      { "_uid": "abc", "component": "inline_cta", "label": "Sign Up" }
    ]}}
  ]
}
```

Embedded bloks appear as `"type": "blok"` nodes with full component data in `attrs.body`.

#### Frontend Rendering

Global component registry initialized at app startup:

```tsx
storyblokInit({
  components: { page: Page, hero_block: HeroBlock, feature: Feature },
});

// Dynamic rendering via:
<StoryblokComponent blok={blok} />
```

`StoryblokComponent` reads `blok.component`, looks up the registry, renders the matched component with `{ blok }` props. `<StoryblokRichText>` handles richtext rendering including automatic blok resolution. SDKs available for React, Vue, Nuxt, Svelte, Astro.

#### Notable Patterns

- **Content-as-component-tree** — The CMS schema mirrors the frontend component tree; a page is a root component containing nested components
- **Iframe-bridge visual editing** — Minimal coupling: spread `storyblokEditable()` on DOM elements, initialize bridge, done
- **Rich text hybrid model** — TipTap JSON with Storyblok-specific `blok` nodes creates two tiers (prose + structured components) within a single field
- **Universal blocks** — A component that serves as both standalone story (with URL) and nestable child — avoids content duplication

**Sources:** [Blocks Concept](https://www.storyblok.com/docs/concepts/blocks) | [Visual Editor](https://www.storyblok.com/docs/concepts/visual-editor) | [@storyblok/richtext](https://www.storyblok.com/docs/libraries/js/rich-text) | [@storyblok/react](https://www.storyblok.com/docs/packages/storyblok-react)

---

## Tier 3 Systems

### 5. WordPress Gutenberg

#### Schema Definition

Custom blocks are defined via `block.json` (canonical) + `registerBlockType()`:

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "my-plugin/notice",
  "title": "Notice",
  "category": "text",
  "attributes": {
    "message": { "type": "string", "source": "html", "selector": ".message" }
  },
  "supports": { "align": true },
  "editorScript": "file:./index.js",
  "render": "file:./render.php"
}
```

Attributes define structured data; `source` specifies extraction from HTML (attribute, html, text, query). `InnerBlocks` enables nested content with `allowedBlocks`, `template`, and `templateLock` constraints.

#### Editing UI

Developer-authored React components. The `edit()` function defines the editor experience; `save()` defines the serialized output. `useBlockProps()` applies editor functionality. `RichText` component provides inline rich text editing. `InspectorControls` renders sidebar panels; `BlockControls` adds toolbar items.

#### Rich Text Nesting

`InnerBlocks` provides recursive block nesting — a block can contain other blocks. `RichText` component enables rich text within block attributes. Combined: a custom block can have both `RichText` attributes and `InnerBlocks` children.

#### Serialization Format

**HTML with JSON-in-comments** — unique among CMS platforms:

```html
<!-- wp:my-plugin/notice {"type":"warning"} -->
<div class="wp-block-my-plugin-notice warning">
  <p>Watch out!</p>
</div>
<!-- /wp:my-plugin/notice -->
```

Dynamic blocks use self-closing comments: `<!-- wp:latest-posts {"postsToShow":4} /-->`. Attributes without a `source` are serialized into the comment delimiter as JSON.

#### Frontend Rendering

Two modes: **Static blocks** render via the `save()` function (pure React → HTML). **Dynamic blocks** use server-side rendering via `render_callback` (PHP) or a `render` file. No component mapping needed — the serialized HTML IS the output for static blocks.

#### Notable Patterns

- **HTML-comment serialization** — The only system that stores blocks as valid HTML with metadata in comments. Content degrades gracefully without the block editor.
- **Edit/save split** — Separate editor and output representations. `edit()` is interactive React; `save()` is pure, stateless HTML generation.
- **Block patterns** — Pre-configured arrangements of blocks, acting as templates.

**Sources:** [Block Registration](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/) | [Block Metadata (block.json)](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/) | [Edit and Save](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/) | [Markup Representation](https://developer.wordpress.org/block-editor/getting-started/fundamentals/markup-representation-block/)

---

### 6. Notion

#### Schema Definition

Notion has a **fixed, closed set of ~32 block types** — paragraphs, headings, lists, callouts, toggles, columns, code blocks, databases, synced blocks, embeds, etc. Developers cannot define custom block types. Each block type has specific properties within the Notion API.

#### Editing UI

Notion's editor uses slash commands (`/`) for block insertion and block transformations. The editing experience is bespoke per block type, not schema-generated. No external customization of the editor UI.

#### Rich Text Nesting

Blocks that support children include: lists, callouts, paragraphs, quotes, toggles, tables, columns, synced blocks, and child pages. No fixed depth limit — the API returns `has_children: boolean` and you recursively fetch via `GET /v1/blocks/{block_id}/children`. Headings can be `is_toggleable: true` to support nested content.

#### Serialization Format

JSON with a `type` discriminator. Each block has standard metadata plus a type-specific object:

```json
{
  "object": "block",
  "id": "uuid",
  "type": "callout",
  "has_children": false,
  "callout": {
    "rich_text": [{ "type": "text", "text": { "content": "Important!" } }],
    "icon": { "emoji": "⭐" },
    "color": "default"
  }
}
```

Rich text is an array of objects with formatting annotations (bold, italic, code, color, links).

#### Frontend Rendering

Notion is primarily its own renderer. Third-party tools like [react-notion-x](https://github.com/NotionX/react-notion-x) and notion-to-md handle external rendering by walking the block tree and mapping `type` strings to components.

#### Notable Patterns

- **"Everything is a block"** philosophy — Even databases, pages, and synced content are blocks
- **Closed type system** — No developer extensibility; Notion controls the block vocabulary
- **Synced blocks** — Original/duplicate pattern where duplicates reference the original via `synced_from.block_id`

**Sources:** [Notion Block API](https://developers.notion.com/reference/block) | [Get Block Children](https://developers.notion.com/reference/get-block-children)

---

### 7. Directus

#### Schema Definition

Directus uses **Many-to-Any (M2A) relationships** as its block mechanism. No built-in "component" primitive — you create separate collections per block type (`block_hero`, `block_richtext`, etc.) and wire them through an M2A alias field on the parent. Directus auto-creates a junction collection with `collection` (discriminator), `item` (ID), and `sort`.

#### Editing UI

Built on Vue 3. M2A blocks use a list interface — editors pick a block type, fill its form, reorder via drag-and-drop. Custom interfaces are Vue components registered via `defineInterface()` from `@directus/extensions-sdk`.

#### Rich Text Nesting

The built-in WYSIWYG stores HTML strings — no native support for embedding relational blocks inside rich text. The community [Flexible Editor extension](https://github.com/formfcw/directus-extension-flexible-editor) (Tiptap-based) bridges this gap, supporting relation blocks, inline blocks, and relation marks within rich text via M2A relations.

#### Serialization Format

API returns M2A blocks as junction objects with `collection` discriminator and `item` data:

```json
{
  "blocks": [
    { "id": 1, "sort": 1, "collection": "block_hero", "item": { "headline": "Welcome" } },
    { "id": 2, "sort": 2, "collection": "block_richtext", "item": { "content": "<p>...</p>" } }
  ]
}
```

Querying requires collection-scoped field selection per block type.

#### Frontend Rendering

Standard component mapper on the `collection` discriminator:
```tsx
const blockMap = { block_hero: Hero, block_richtext: RichText };
blocks.map(b => <blockMap[b.collection] key={b.id} {...b.item} />);
```

#### Notable Patterns

- **M2A-as-page-builder** — Each block type is a first-class collection with its own permissions, validation, and API
- **Extension system** — Custom Interfaces, Displays, Layouts, Modules, Hooks, Endpoints as Vue 3 / Node.js extensions

**Sources:** [M2A Blocks Tutorial](https://directus.io/docs/tutorials/getting-started/create-reusable-blocks-with-many-to-any-relationships) | [Interfaces Extension](https://directus.io/docs/guides/extensions/app-extensions/interfaces) | [Flexible Editor](https://github.com/formfcw/directus-extension-flexible-editor)

---

### 8. Hygraph

#### Schema Definition

Hygraph embeds model references directly into the Rich Text AST. On any Rich Text field, you enable embedding and select which models/Assets are embeddable. This generates typed GraphQL union types (`{FieldName}RichTextEmbeddedTypes`). **Important:** the embed configuration is permanent and cannot be changed after initial save. Embeddable items are full Hygraph models, not Hygraph Components (which are reusable field groups for model fields, not for rich text embedding).

#### Editing UI

Embedded content appears in the rich text editor as block embeds (full-width between paragraphs), inline embeds (within text), or link embeds. Editors insert via the toolbar. Editing the embedded content requires navigating to the referenced entry — not inline-editable.

#### Rich Text Nesting

Embedded models can contain their own Rich Text fields. Hygraph Components support nesting up to 4 levels deep. No built-in recursive rich-text-within-rich-text rendering — handled at the frontend.

#### Serialization Format

**Slate 0.5-based AST.** GraphQL returns `json` (AST) and `references` (data) separately:

```json
{
  "type": "embed",
  "nodeId": "clx1abc123",
  "nodeType": "Post",
  "children": [{ "text": "" }]
}
```

Node types: `paragraph`, `heading-one` through `heading-six`, `bulleted-list`, `numbered-list`, `blockquote`, `code-block`, `table`, `embed`, `class`, `link`, `image`.

#### Frontend Rendering

`@graphcms/rich-text-react-renderer` with typed embed renderers:

```tsx
<RichText content={content.json} references={content.references}
  renderers={{
    embed: {
      Post: ({ title, slug }) => <PostCard title={title} slug={slug} />,
      Product: ({ name }) => <ProductCard name={name} />,
    },
  }}
/>
```

References are matched to `nodeId` values in the AST automatically.

#### Notable Patterns

- **Rich Text AST as the composition layer** — Embed references live directly in the AST, not in a separate relation system
- **GraphQL-native** — Schema changes auto-generate typed union types
- **References pattern** — `json` + `references` split keeps the AST lightweight

**Sources:** [Rich Text Field API](https://hygraph.com/docs/api-reference/content-api/rich-text-field) | [Rich Text Embeds](https://hygraph.com/blog/rich-text-embeds) | [rich-text-react-renderer](https://github.com/hygraph/rich-text)

---

## Cross-System Comparison Matrix

| System | Schema Definition | Editing UI | Rich Text Nesting | Serialization | Discriminator | Frontend Pattern |
|---|---|---|---|---|---|---|
| **Strapi** | JSON schema files on disk | Auto-generated from schema | RT inside blocks: Yes. Blocks inside RT: No (fixed vocabulary) | JSON (Blocks editor) + JSON with `__component` (Dynamic Zones) | `__component` | Component map / BlocksRenderer |
| **Contentful** | Regular content types + RT field validations | Auto-generated entry cards in RT | Bidirectional (entries can have RT, RT can embed entries) | JSON AST with void nodes + separate entry resolution | `sys.contentType.sys.id` or `__typename` | `documentToReactComponents` + renderNode map |
| **Builder.io** | `registerComponent()` with inputs array | Auto-generated from inputs; iframe-based visual editor | `richText` (HTML string) + `canHaveChildren` + `uiBlocks` for slots | JSON tree of `BuilderBlock` objects | `component.name` | SDK `<Content>` with component registry |
| **Storyblok** | GUI/API blok schemas with 15 field types | Auto-generated; iframe-bridge visual editor | Bidirectional (bloks have RT fields; RT has `blok` nodes) | JSON with TipTap/ProseMirror AST for richtext | `component` | `StoryblokComponent` registry lookup |
| **Gutenberg** | `block.json` + `registerBlockType()` | Developer-authored `edit()` React components | `InnerBlocks` + `RichText` component | HTML with JSON-in-comments (`<!-- wp:name {...} -->`) | `wp:namespace/name` in HTML comments | `save()` function / `render_callback` (PHP) |
| **Notion** | Fixed ~32 block types (not extensible) | Bespoke per block type; slash commands | Child blocks via `has_children`; no depth limit | JSON with `type` discriminator | `type` | Third-party: react-notion-x, notion-to-md |
| **Directus** | M2A relations (separate collections per block) | Vue 3 admin; auto-generated + custom interfaces | WYSIWYG (HTML); blocks-in-RT via Flexible Editor extension | JSON with `collection`/`item` junction objects | `collection` | Component map on `collection` |
| **Hygraph** | Embeddable models configured per RT field | Embed toolbar in RT editor; not inline-editable | Embedded models can have own RT; 4-level component nesting | Slate 0.5 AST with `nodeId`/`nodeType` + separate `references` | `nodeType` | `<RichText>` with typed embed renderers |

---

## Architectural Patterns & Implications

### Pattern 1: The Discriminator-Driven Component Map

**Every system** uses a string discriminator to route data to renderers. The names differ (`__component`, `component`, `nodeType`, `type`, `collection`, `component.name`) but the pattern is universal:

```
data[discriminator_field] → lookup_table[discriminator_value] → Framework Component
```

**Implication:** Any editor architecture should standardize on a discriminator field early. The choice between a flat string (`"hero"`) vs. a namespaced string (`"blocks.hero-section"`) affects extensibility and collision avoidance.

### Pattern 2: Separated vs. Unified Block Models

| Approach | Systems | Tradeoffs |
|---|---|---|
| **Separated** (RT and blocks are distinct) | Strapi, Directus | Clear boundaries; simpler per-system but limits inline custom content |
| **Unified** (everything is a block) | Notion, Gutenberg | Maximum flexibility; complex serialization/parsing |
| **Hybrid** (RT AST with embedded references) | Contentful, Hygraph, Storyblok, Builder.io | Best of both — rich text flow with structured data embeds |

**Implication:** The hybrid model (AST with embedded typed nodes) appears most flexible for an agent-native platform. It preserves prose flow while allowing structured data at any point.

### Pattern 3: Void Nodes vs. Inline Data

- **Contentful, Hygraph:** Embedded entries are **void nodes** — the AST carries only a reference ID; actual data is resolved separately
- **Storyblok:** Embedded bloks carry **full data inline** within the AST (`attrs.body` contains all fields)
- **Builder.io:** Components carry **options inline** within the block tree

**Implication:** Void nodes (Contentful/Hygraph approach) decouple the document structure from content resolution, enabling lazy loading and independent caching. Inline data (Storyblok approach) simplifies rendering but creates tighter coupling.

### Pattern 4: Schema Location

| Location | Systems | Tradeoffs |
|---|---|---|
| **On disk (code-first)** | Strapi, Gutenberg | Version-controllable; deploy-coupled |
| **In CMS backend (config-first)** | Storyblok, Contentful, Hygraph, Directus | Runtime-editable; decoupled from deploys |
| **In application code (registration)** | Builder.io | Framework-native; tightest code coupling |

### Pattern 5: Rich Text AST Formats

Three dominant formats emerged:

1. **Custom JSON AST** — Contentful (own format), Strapi Blocks (Slate-like)
2. **TipTap/ProseMirror JSON** — Storyblok
3. **Slate JSON** — Hygraph (Slate 0.5)
4. **HTML with metadata** — Gutenberg (only one)

**Implication:** TipTap/ProseMirror JSON is emerging as a practical default for new systems — it has mature editor tooling, a well-defined schema, and supports custom node types natively.

### Pattern 6: Visual Editing Architecture

Builder.io and Storyblok both use **iframe-bridge patterns** where your actual frontend loads in an iframe and communicates with the editor via `postMessage`. This decouples the editor from the rendering framework.

**Implication:** The iframe-bridge pattern is the most framework-agnostic approach to visual editing, requiring minimal integration code on the frontend side.

---

## Sources

### Strapi
- [Strapi Models Documentation](https://docs.strapi.io/cms/backend-customization/models)
- [Content-type Builder](https://docs.strapi.io/cms/features/content-type-builder)
- [Custom Fields](https://docs.strapi.io/cms/features/custom-fields)
- [Dynamic Zones Feature](https://strapi.io/features/dynamic-zone)
- [blocks-react-renderer (GitHub)](https://github.com/strapi/blocks-react-renderer)
- [v5 Population Guide](https://docs.strapi.io/cms/api/rest/guides/understanding-populate)
- [v5 Breaking Change: No Shared Population](https://docs.strapi.io/cms/migration/v4-to-v5/breaking-changes/no-shared-population-strategy-components-dynamic-zones)
- [Nested Dynamic Zones Request (GitHub #5798)](https://github.com/strapi/strapi/issues/5798)

### Contentful
- [Rich Text Concept](https://www.contentful.com/developers/docs/concepts/rich-text/)
- [Getting Started with Rich Text](https://www.contentful.com/developers/docs/tutorials/general/getting-started-with-rich-text-field-type/)
- [@contentful/rich-text-types (npm)](https://www.npmjs.com/package/@contentful/rich-text-types)
- [rich-text-react-renderer (GitHub)](https://github.com/contentful/rich-text/tree/master/packages/rich-text-react-renderer)
- [field-editors (GitHub)](https://github.com/contentful/field-editors)
- [Content Modeling Patterns](https://www.contentful.com/help/content-modeling-patterns/)
- [Cross-space References](https://www.contentful.com/help/connect-content/cross-space-references/cross-space-references-in-rich-text-fields/)

### Builder.io
- [Custom Components Setup](https://www.builder.io/c/docs/custom-components-setup)
- [Input Types](https://www.builder.io/c/docs/custom-components-input-types)
- [Registration Options](https://www.builder.io/c/docs/register-components-options)
- [How Builder Works (Technical)](https://www.builder.io/c/docs/how-builder-works-technical)
- [Visual Editor Introduction](https://www.builder.io/c/docs/101-visual-editor)
- [Adding Children to Components](https://www.builder.io/c/docs/custom-components-children)
- [Mitosis (GitHub)](https://github.com/BuilderIO/mitosis)
- [Builder.io (GitHub)](https://github.com/BuilderIO/builder)

### Storyblok
- [Blocks Concept](https://www.storyblok.com/docs/concepts/blocks)
- [Fields Concept](https://www.storyblok.com/docs/concepts/fields)
- [Visual Editor Concept](https://www.storyblok.com/docs/concepts/visual-editor)
- [@storyblok/react SDK](https://www.storyblok.com/docs/packages/storyblok-react)
- [@storyblok/richtext v4](https://www.storyblok.com/docs/libraries/js/rich-text)
- [Management API: Components](https://www.storyblok.com/docs/api/management/components/create-a-component)

### WordPress Gutenberg
- [Block Registration](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/)
- [Block Metadata (block.json)](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)
- [Edit and Save](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/)
- [Markup Representation](https://developer.wordpress.org/block-editor/getting-started/fundamentals/markup-representation-block/)
- [Nested Blocks: InnerBlocks](https://developer.wordpress.org/block-editor/how-to-guides/block-tutorial/nested-blocks-inner-blocks/)

### Notion
- [Block API Reference](https://developers.notion.com/reference/block)
- [Get Block Children](https://developers.notion.com/reference/get-block-children)

### Directus
- [M2A Blocks Tutorial](https://directus.io/docs/tutorials/getting-started/create-reusable-blocks-with-many-to-any-relationships)
- [Relationships Guide](https://directus.io/docs/guides/data-model/relationships)
- [Interfaces Extension Guide](https://directus.io/docs/guides/extensions/app-extensions/interfaces)
- [Flexible Editor Extension (GitHub)](https://github.com/formfcw/directus-extension-flexible-editor)

### Hygraph
- [Rich Text Field API](https://hygraph.com/docs/api-reference/content-api/rich-text-field)
- [Rich Text Embeds Blog](https://hygraph.com/blog/rich-text-embeds)
- [Components Guide](https://hygraph.com/docs/developer-guides/schema/components)
- [rich-text-react-renderer (GitHub)](https://github.com/hygraph/rich-text)
