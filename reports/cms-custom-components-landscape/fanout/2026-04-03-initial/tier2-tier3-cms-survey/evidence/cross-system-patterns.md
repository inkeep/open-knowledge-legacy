---
title: Cross-System Architectural Patterns for Custom Blocks in CMS Rich Text
type: analysis
sources:
  - evidence/strapi-dynamic-zones.md
  - evidence/contentful-rich-text-ast.md
  - evidence/builderio-component-registration.md
  - evidence/storyblok-blok-system.md
  - evidence/tier3-gutenberg-notion-directus-hygraph.md
date: 2026-04-03
---

# Cross-System Architectural Patterns

## Pattern 1: Universal Discriminator-Driven Component Map

Every system uses a string discriminator:
- Strapi: `__component` ("blocks.hero-section")
- Contentful: `sys.contentType.sys.id` or `__typename`
- Builder.io: `component.name`
- Storyblok: `component`
- Gutenberg: `wp:namespace/name` (in HTML comments)
- Notion: `type`
- Directus: `collection`
- Hygraph: `nodeType`

Frontend rendering follows: `data[discriminator] → registry[value] → Component`

## Pattern 2: Three Composition Models

| Model | Systems | Approach |
|---|---|---|
| Separated | Strapi, Directus | RT and blocks are distinct systems |
| Unified | Notion, Gutenberg | Everything is a block |
| Hybrid | Contentful, Hygraph, Storyblok, Builder.io | RT AST with embedded typed references |

The hybrid model appears most flexible — preserves prose flow while allowing structured data embeds.

## Pattern 3: Void Nodes vs. Inline Data

- Void (reference only): Contentful, Hygraph — AST carries ID; data resolved separately
- Inline (full data): Storyblok, Builder.io — component data embedded in AST/tree

Void nodes decouple structure from data; inline simplifies rendering.

## Pattern 4: Rich Text AST Formats

- Custom JSON: Contentful, Strapi Blocks
- TipTap/ProseMirror JSON: Storyblok
- Slate JSON: Hygraph
- HTML with metadata: Gutenberg (unique)

TipTap/ProseMirror emerging as practical default for new systems.

## Pattern 5: Schema Location

- On disk (code-first): Strapi, Gutenberg
- In CMS backend (config-first): Storyblok, Contentful, Hygraph, Directus
- In application code: Builder.io

## Pattern 6: Visual Editing

Builder.io and Storyblok use iframe-bridge patterns — most framework-agnostic approach.
