---
title: Strapi Dynamic Zones and Blocks Editor Architecture
type: primary-source-synthesis
sources:
  - https://docs.strapi.io/cms/backend-customization/models
  - https://docs.strapi.io/cms/features/content-type-builder
  - https://docs.strapi.io/cms/features/custom-fields
  - https://strapi.io/features/dynamic-zone
  - https://github.com/strapi/blocks-react-renderer
  - https://docs.strapi.io/cms/api/rest/guides/understanding-populate
  - https://github.com/strapi/strapi/issues/5798
  - https://market.strapi.io/plugins/strapi-plugin-rich-text-blocks-extended
date: 2026-04-03
---

# Strapi: Dynamic Zones and Blocks Editor

## Two-Tier Composition Architecture

Strapi uniquely splits structured content into two distinct composition layers:

1. **Dynamic Zones** (macro level) — Component-based page composition. `type: "dynamiczone"` with allowed component list. Each item carries `__component` discriminator.
2. **Blocks editor** (micro level) — Paragraph-level rich text. Fixed node vocabulary: paragraph, heading, list, quote, code, image, link.

These two layers do NOT interleave. You cannot insert a Dynamic Zone component into rich text, nor can you nest a Dynamic Zone inside a component.

## Key Limitations

- Dynamic Zones inside components: NOT SUPPORTED (GitHub #5798)
- Custom block types in Blocks editor: NOT SUPPORTED natively (requires plugin)
- Custom Fields must map to existing Strapi data types (string, text, integer, json, etc.)

## Serialization

Blocks editor: JSON array of typed nodes (Slate-like structure)
Dynamic Zones: JSON with `__component` discriminator per item

## v5 Breaking Change

Strapi v5 removed shared wildcard population for components/dynamic zones. Requires explicit `on` fragments per component type in queries.
