# Evidence: Cross-Cutting Architectural Patterns

**Dimension:** D7 — Cross-cutting synthesis
**Date:** 2026-04-03
**Sources:** All five fanout sub-reports + primary source code analysis

---

## Key files / pages referenced

- Payload: `packages/richtext-lexical/src/features/blocks/server/index.ts` — BlocksFeature API
- Payload: `packages/richtext-lexical/src/features/blocks/client/component/BlockContent.tsx` — Auto-gen vs custom rendering decision
- Payload: `packages/richtext-lexical/src/features/converters/lexicalToJSX/converter/index.tsx` — Converter registry pattern
- Sanity: `packages/@sanity/types/src/portableText/types.ts` — PT type definitions with _type/_key
- Sanity: `packages/sanity/src/core/form/inputs/PortableText/Compositor.tsx` — Block rendering dispatch
- TinaCMS: `packages/@tinacms/schema-tools/src/types/index.ts` — Template type system
- TinaCMS: `packages/@tinacms/mdx/src/parse/mdx.ts` — Template-aware parsing
- Keystatic: `packages/keystatic/src/content-components.ts` — Five-kind factory functions
- Keystatic: `packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx` — ProseMirror node specs

---

## Findings

### Finding: Universal Discriminator Pattern
**Confidence:** CONFIRMED
**Evidence:** All 12 systems use a string discriminator field

All systems investigated use a single string field to route content data to renderers:
- Payload: `blockType` in `fields` object
- Sanity: `_type` on every object
- TinaCMS: `name` on MDX element / `type` in Plate IR
- Keystatic: ProseMirror node type name
- Strapi: `__component` on Dynamic Zone items
- Contentful: `sys.contentType.sys.id` on entries
- Builder.io: `component.name` on BuilderBlock
- Storyblok: `component` on bloks
- Gutenberg: block name in HTML comment delimiter
- Notion: `type` on block objects
- Directus: `collection` on M2A junction
- Hygraph: `nodeType` on embed nodes

**Implications:** The discriminator-driven component map is the single most universal pattern in CMS content architecture. Any editor system should adopt this as a first-class concept.

---

### Finding: Schema-Driven UI Is the Default, Not the Exception
**Confidence:** CONFIRMED
**Evidence:** 10 of 12 systems auto-generate editing forms

| System | UI Generation | Override mechanism |
|--------|--------------|-------------------|
| Payload | RenderFields from Field[] | admin.components.Block |
| Sanity | Form from schema fields[] | components.preview |
| TinaCMS | FieldsBuilder from Template.fields | Field plugins |
| Keystatic | FormValue from ComponentSchema | NodeView prop |
| Strapi | Content Manager from schema | Custom Fields |
| Contentful | Entry editor from content type | App Framework |
| Builder.io | Editor from inputs array | N/A (auto only) |
| Storyblok | Editor from field schema | Plugin fields |
| Directus | Vue admin from field schema | Custom interfaces |
| Hygraph | Editor from model schema | N/A (auto only) |
| Gutenberg | **Developer-authored** edit() | N/A |
| Notion | **Fixed, bespoke** per type | N/A |

**Implications:** Auto-generation with override is the dominant pattern. The developer defines shape; the CMS generates chrome.

---

### Finding: No System Has Achieved Inline WYSIWYG Editing of Custom Block Props
**Confidence:** CONFIRMED
**Evidence:** Every OSS system's editing UI was inspected at source level

In all 4 source-code-investigated systems:
- Payload: Collapsible sections + drawer panel
- Sanity: Preview cards + modal/popover editing
- TinaCMS: Chip/card display + side panel form
- Keystatic: Chrome header + modal dialog

All use a "click to edit in separate surface" pattern. The document flow shows the block as a non-editable preview; actual editing happens elsewhere. The closest to inline editing is Keystatic's wrapper kind, where rich text children are editable inline, but props still require the modal.

**Implications:** Inline WYSIWYG editing of structured props within a text editor remains an unsolved problem across the entire CMS landscape.

---

## Gaps / follow-ups

- How do these patterns interact with real-time collaboration (concurrent edits to the same custom block)?
- Performance characteristics with many custom blocks in a single document
- Could a hybrid approach (inline for simple props, modal for complex ones) work?
