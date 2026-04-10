# Evidence: Fern Frontmatter Schema

**Dimension:** D3 — Fern frontmatter schema (including AI-specific fields)
**Date:** 2026-04-05
**Sources:** https://buildwithfern.com/learn/docs/content/frontmatter, https://buildwithfern.com/learn/docs/ai-features/llms-txt, https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide

---

## Key pages referenced

- https://buildwithfern.com/learn/docs/content/frontmatter — Page-level settings
- https://buildwithfern.com/learn/docs/ai-features/llms-txt — llms.txt configuration
- https://buildwithfern.com/learn/docs/ai-features/overview — AI features overview
- https://buildwithfern.com/learn/docs/seo/setting-seo-metadata — SEO metadata

---

## Findings

### Finding: Fern supports 11+ explicit frontmatter fields
**Confidence:** CONFIRMED
**Evidence:** https://buildwithfern.com/learn/docs/content/frontmatter

| Field | Type | Required | Purpose | Default |
|-------|------|----------|---------|---------|
| title | string | No | `<title>` element for browser tabs, search results | Auto |
| subtitle | string | No | Rendered subtitle; fallback for description in llms.txt | None |
| description | string | No | Meta description for SEO; used in llms.txt | Falls back to subtitle |
| slug | string | No | Full URL path override from docs root | From file path |
| noindex | boolean | No | Exclude from search engines AND llms.txt | false |
| edit-url | string | No | Absolute link to source file in GitHub | None |
| og:image | string | No | OpenGraph image URL for social preview | None |
| availability | enum | No | Badge: stable, generally-available, in-development, pre-release, deprecated, beta | None |
| layout | enum | No | `overview` (full-width, no TOC) or `guide` (default with TOC) | guide |
| hide-toc | boolean | No | Hide table of contents | false |
| hide-feedback | boolean | No | Disable on-page feedback widget | false |
| keywords | string[] | No | SEO metadata keywords | None |

### Finding: Fern has the most advanced AI-specific features via frontmatter + config
**Confidence:** CONFIRMED
**Evidence:** https://buildwithfern.com/learn/docs/ai-features/llms-txt

**noindex: true** — Dual function: excludes from search engines AND from llms.txt/llms-full.txt endpoints

**agents key (in docs.yml, site-level)** — Prepends AI-agent instruction text before page body. Injected after frontmatter but before content. Visible to agents even if they truncate. Applies to individual .md/.mdx URLs and each page section in llms-full.txt.

**`<llms-only>` content tag** — Content visible to AI (in llms.txt) but hidden from human docs viewers. Use for verbose technical context.

**`<llms-ignore>` content tag** — Content visible to humans but excluded from AI consumption. Use for marketing CTAs.

**Query parameters on llms.txt:**
- `?lang=python` — filter SDK examples to specific language
- `?excludeSpec=true` — remove OpenAPI/AsyncAPI specs to reduce tokens
- Combined: `?lang=python&excludeSpec=true`

### Finding: Description/subtitle feeds directly into llms.txt generation
**Confidence:** CONFIRMED
**Evidence:** "Fern uses the description field if present, otherwise falls back to subtitle" for llms.txt and llms-full.txt page descriptions.

### Finding: availability field has 6 enum values and overrides navigation-level setting
**Confidence:** CONFIRMED
**Evidence:** Valid values: stable, generally-available, in-development, pre-release, deprecated, beta. When set in frontmatter, overrides docs.yml navigation definition.

---

## Summary: AI-specific field inventory

| Mechanism | Scope | Purpose |
|-----------|-------|---------|
| noindex (frontmatter) | Per-page | Exclude from search + llms.txt |
| agents (docs.yml) | Site-wide | Prepend AI directive to pages |
| `<llms-only>` (content) | Per-section | Show to AI only |
| `<llms-ignore>` (content) | Per-section | Hide from AI only |
| ?lang, ?excludeSpec (URL) | Per-request | Filter llms.txt output |

---

## Gaps / follow-ups

- No `tags`, `draft`, or `date` field
- No per-page agent directives (agents key is site-level only in docs.yml)
- `breadcrumb-override` mentioned in some sources but not confirmed
