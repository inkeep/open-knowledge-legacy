# Evidence: Fumadocs Community Ecosystem Survey

**Dimension:** D3 — Community plugins, integrations, and ecosystem
**Date:** 2026-04-14
**Sources:** npm registry search, GitHub search (131 repos tagged "fumadocs"), fumadocs.dev

---

## Key packages referenced

- fumadocs-core: npmjs.com/package/fumadocs-core (16.6.2, ~37K/wk)
- fumadocs-ui: npmjs.com/package/fumadocs-ui (16.7.14)
- fumadocs-mdx: npmjs.com/package/fumadocs-mdx (14.2.14)
- fumadocs-openapi: npmjs.com/package/fumadocs-openapi (10.4.1)
- @fumadocs/mdx-remote: npmjs.com/package/@fumadocs/mdx-remote (1.4.8, ~14K/wk)
- @fumadocs/cli: npmjs.com/package/@fumadocs/cli (1.2.6, ~5.7K/wk)
- @fumadocs/content-collections: npmjs.com/package/@fumadocs/content-collections (1.2.2)
- fumadocs-typescript: npmjs.com/package/fumadocs-typescript (5.2.0)

---

## Findings

### Finding: Fumadocs ecosystem is large but entirely focused on docs-site rendering
**Confidence:** CONFIRMED
**Evidence:** npm registry + GitHub search (131 repos)

Official packages: 12+ (fumadocs-core, fumadocs-ui, fumadocs-mdx, fumadocs-openapi, fumadocs-typescript, fumadocs-docgen, @fumadocs/ui, @fumadocs/base-ui, @fumadocs/mdx-remote, @fumadocs/cli, @fumadocs/content-collections, create-fumadocs-app)

Growth metrics:
- ~150K downloads/month (3x year-over-year growth as of March 2026)
- 11.5K GitHub stars
- Releases every 1-2 days (very actively maintained)
- 131 public repos tagged "fumadocs" on GitHub

### Finding: Zero visual/WYSIWYG MDX editors exist in fumadocs ecosystem
**Confidence:** CONFIRMED
**Evidence:** Exhaustive npm + GitHub search

No community visual editor, WYSIWYG editor, component palette, or UI builder tool targets fumadocs. The fumadocs-payload-template uses Payload CMS's Lexical editor, but that's Payload's editor, not fumadocs-specific.

### Finding: CMS integrations exist at content-source level, not editing level
**Confidence:** CONFIRMED
**Evidence:** GitHub repos + npm packages

| CMS | Integration | Status |
|-----|-------------|--------|
| Payload CMS | fumadocs-payloadcms (67 stars), fumadocs-payload-template | Active |
| Sanity | fumadocs-sanity (39 stars) | Maintained |
| BaseHub | fumadocs-basehub (38 stars) | Maintained |
| Notion | fumadocs-notion (27 stars) | Low activity (Dec 2024) |
| Content Collections | @fumadocs/content-collections | Official package |

NOT found: TinaCMS + fumadocs, Keystatic + fumadocs, Velite + fumadocs

All integrations are custom Source adapters — they transform CMS data into fumadocs `VirtualFile[]`. None provide visual MDX editing.

### Finding: graphql-markdown demonstrates custom fumadocs component registration pattern
**Confidence:** CONFIRMED
**Evidence:** github.com/graphql-markdown/graphql-markdown (174 stars)

Custom fumadocs source adapter for GraphQL schemas. Uses `formatMDXBadge`, `formatMDXAdmonition` utilities for MDX component registration into fumadocs pipeline. Demonstrates the pattern-copy approach for third-party component registration.

### Finding: fuma-content (upcoming framework-agnostic content layer) announced
**Confidence:** INFERRED
**Evidence:** fumadocs blog + GitHub

Framework-agnostic content processing layer, successor to fumadocs-mdx internals. Not yet on npm. Will work with Vite, Turbopack, Webpack, any JS runtime. No published timeline.

### Finding: Deprecated/archived community packages
**Confidence:** CONFIRMED
**Evidence:** npm registry

- @maximai/fumadocs-ui v12.5.4-beta1 — 2 years old, deprecated community fork
- @maximai/fumadocs-core — deprecated community fork
- No other archived forks found

---

## Negative searches

* "fumadocs visual editor" on npm: 0 results
* "fumadocs wysiwyg" on npm: 0 results
* "fumadocs tiptap" on GitHub: 0 results
* "fumadocs prosemirror" on GitHub: 0 results
* "fumadocs keystatic" on npm/GitHub: 0 results
* "fumadocs tina" on npm/GitHub: 0 results
* "fumadocs velite" on npm/GitHub: 0 results
