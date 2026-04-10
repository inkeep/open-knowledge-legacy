# Evidence: Serialization Format Comparison

**Dimension:** D7 — Serialization format comparison across systems
**Date:** 2026-04-03
**Sources:** All five fanout sub-reports

---

## Key files / pages referenced

- Payload: `packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx` — Lexical JSON node structure
- Sanity: `packages/@sanity/types/src/portableText/types.ts` — Portable Text JSON specification
- TinaCMS: `packages/@tinacms/mdx/src/parse/plate.ts` — Plate IR definition
- TinaCMS: `packages/@tinacms/mdx/src/stringify/index.ts` — MDX serialization pipeline
- Keystatic: `packages/keystatic/src/form/fields/markdoc/editor/markdoc/serialize.ts` — Markdoc serializer
- Keystatic: `packages/keystatic/src/form/fields/markdoc/editor/mdx/serialize.ts` — MDX serializer

---

## Findings

### Finding: JSON Is the Dominant Storage Format for Rich Text with Custom Blocks
**Confidence:** CONFIRMED
**Evidence:** 11 of 12 systems use JSON as primary storage; only Gutenberg uses HTML

JSON variants:
- Lexical JSON tree (Payload)
- Portable Text flat array (Sanity)
- Slate/Plate IR (TinaCMS internal)
- ProseMirror JSON (Keystatic, Storyblok)
- Custom JSON AST (Contentful, Strapi Blocks)
- Slate 0.5 AST (Hygraph)
- BuilderBlock JSON tree (Builder.io)
- Notion API JSON (Notion)
- M2A junction JSON (Directus)

The only non-JSON system: WordPress Gutenberg serializes to HTML with JSON metadata in comment delimiters.

Text formats (MDX, Markdoc) appear as secondary serialization targets in TinaCMS and Keystatic, not as primary storage.

### Finding: Portable Text Is Uniquely Editor-Independent
**Confidence:** CONFIRMED
**Evidence:** PT specification + comparison with other formats

Portable Text is the only format designed from inception to have zero editor runtime dependency:
- Flat array of typed objects (no tree structure matching an editor's internal model)
- `_type` discriminator is a content concept, not an editor concept
- No mark nesting — uses `markDefs` reference pattern
- Renderable to any output format without the `@portabletext/editor`

Every other JSON format mirrors an editor's internal state:
- Lexical JSON → Lexical editor state
- ProseMirror JSON → ProseMirror document model
- Slate JSON → Slate value
- Custom ASTs → vendor-specific internal models

**Implications:** If editor independence is a priority, PT's data model is the reference. If editor fidelity is the priority, storing the editor's native format is simpler.

---

## Gaps / follow-ups

- How do JSON AST sizes compare for the same document across formats?
- What are the query/indexing implications of different JSON structures?
