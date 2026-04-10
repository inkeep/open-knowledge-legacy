# Run: 2026-04-03-initial

**Status:** Closed
**Intent:** Fanout — initial research pass
**Created:** 2026-04-03

## Parent Context
**Purpose:** Understand how CMS platforms define, edit, serialize, and render custom components/blocks in their rich text editors. Identify architectural patterns that could inform our editor architecture for an agent-native knowledge platform.
**Primary question:** What are the common patterns across CMS systems for custom block schemas, editing UI generation, serialization, nested rich text handling, and frontend rendering — and which patterns should we adopt?
**Non-goals:** Implementing any CMS, evaluating CMS products for adoption, pricing/licensing analysis, performance benchmarks, migration guides.

## Selected Dimensions for Fanout

| # | Direction | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|
| 1 | Payload CMS — Lexical-based blocks | 5+ (schema, editing, serialization, nesting, migration) | Single repo (payloadcms/payload) | Heavy |
| 2 | Sanity — Portable Text custom blocks | 5+ (schema, studio rendering, serialization, nesting, PT serializers) | Multi-repo (sanity-io/*) | Heavy |
| 3 | TinaCMS — MDX component registration | 4+ (templates, schema, editing UI, MDX serialization) | Single repo (tinacms/tinacms) | Heavy |
| 4 | Keystatic — Content Components | 4+ (ProseMirror editor, component schema, MDX/Markdoc, nesting) | Single repo (Thinkmill/keystatic) | Heavy |
| 5 | Tier 2+3 CMS Survey (Strapi, Contentful, Builder.io, Storyblok, Gutenberg, Notion, Directus, Hygraph) | 8 systems, 6 facets each | Multi-source (docs + partial OSS) | Heavy |

## Sub-instance Tracking

| Direction | Status | Report Path | Task ID | Notes |
|---|---|---|---|---|
| Payload CMS | completed | fanout/2026-04-03-initial/payload-cms-blocks/ | bppv9wzwl | 475 lines, 9 evidence files |
| Sanity Portable Text | completed | fanout/2026-04-03-initial/sanity-portable-text/ | b72ibpbsi | 541 lines, 6 evidence files |
| TinaCMS MDX | completed | fanout/2026-04-03-initial/tinacms-mdx-components/ | b4yq5dj40 | 580 lines, 3 evidence files |
| Keystatic Content Components | completed | fanout/2026-04-03-initial/keystatic-content-components/ | bqjrvfee2 | 514 lines, 5 evidence files |
| Tier 2+3 CMS Survey | completed | fanout/2026-04-03-initial/tier2-tier3-cms-survey/ | bo4bz2u4d | 674 lines, 6 evidence files |

## Fanout Directory
`/Users/edwingomezcuellar/reports/cms-custom-components-landscape/fanout/2026-04-03-initial/`
