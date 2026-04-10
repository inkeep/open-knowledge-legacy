---
title: Tier 3 Systems Quick Survey — Gutenberg, Notion, Directus, Hygraph
type: primary-source-synthesis
sources:
  - https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/
  - https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
  - https://developer.wordpress.org/block-editor/getting-started/fundamentals/markup-representation-block/
  - https://developers.notion.com/reference/block
  - https://directus.io/docs/tutorials/getting-started/create-reusable-blocks-with-many-to-any-relationships
  - https://hygraph.com/docs/api-reference/content-api/rich-text-field
  - https://github.com/hygraph/rich-text
date: 2026-04-03
---

# Tier 3 Systems: Key Architectural Patterns

## WordPress Gutenberg

**Unique serialization:** HTML with JSON-in-comments. The only system that stores blocks as valid HTML with metadata in `<!-- wp:name {...} -->` comments. Content degrades gracefully without the block editor.

**Edit/save split:** Separate editor (`edit()` — interactive React) and output (`save()` — pure, stateless HTML generation) representations.

**InnerBlocks:** Recursive block nesting with `allowedBlocks`, `template`, and `templateLock`. A block can have both `RichText` attributes and `InnerBlocks` children.

## Notion

**Closed type system:** ~32 fixed block types. No developer extensibility. Notion controls the block vocabulary entirely.

**"Everything is a block":** Even databases, pages, and synced content are blocks with `has_children` boolean for recursive child access.

**Synced blocks:** Original/duplicate pattern — duplicates reference original via `synced_from.block_id`.

## Directus

**M2A as page builder:** Each block type is a first-class collection. Junction table provides `collection` discriminator + `sort` ordering.

**Rich text gap:** Built-in WYSIWYG stores HTML. No native blocks-in-rich-text. Community Flexible Editor extension (Tiptap + M2A) bridges this.

## Hygraph

**AST as composition layer:** Embed references live directly in Slate 0.5-based AST with `nodeId`/`nodeType` pointers.

**json + references split:** GraphQL returns AST and data separately. Renderer auto-matches by ID.

**Permanent embed config:** Rich Text field embedding settings cannot be changed after initial save.
