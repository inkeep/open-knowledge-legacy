# Evidence: Docusaurus Frontmatter Schema

**Dimension:** D4 — Docusaurus frontmatter (docs + blog)
**Date:** 2026-04-05
**Sources:** https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs#markdown-front-matter, https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-blog#markdown-front-matter

---

## Key pages referenced

- Docusaurus docs plugin frontmatter reference
- Docusaurus blog plugin frontmatter reference

---

## Findings

### Finding: Docusaurus docs plugin supports 22+ frontmatter fields
**Confidence:** CONFIRMED
**Evidence:** https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs

| Field | Type | Required | Purpose | Default |
|-------|------|----------|---------|---------|
| id | string | No | Unique document ID | File path sans extension |
| title | string | No | Page title | Markdown title or id |
| title_meta | string | No | SEO-specific title for `<head>` | title |
| description | string | No | Meta description | First content line |
| sidebar_label | string | No | Sidebar display text | title |
| sidebar_position | number | No | Position in auto-generated sidebar | Default ordering |
| sidebar_class_name | string | No | CSS class on sidebar item | None |
| sidebar_key | string | No | Unique sidebar key for i18n | None |
| sidebar_custom_props | object | No | Custom data on sidebar item | None |
| displayed_sidebar | string | No | Force specific sidebar display | None |
| hide_title | boolean | No | Hide rendered title | false |
| hide_table_of_contents | boolean | No | Hide TOC | false |
| toc_min_heading_level | number | No | Min heading in TOC (2-6) | 2 |
| toc_max_heading_level | number | No | Max heading in TOC (2-6) | 3 |
| pagination_label | string | No | Text in prev/next buttons | sidebar_label or title |
| pagination_next | string|null | No | Next page ID override | Next in sidebar |
| pagination_prev | string|null | No | Previous page ID override | Prev in sidebar |
| parse_number_prefixes | boolean | No | Disable number prefix parsing | Plugin option |
| custom_edit_url | string|null | No | Edit this page URL | Computed from editUrl |
| keywords | string[] | No | `<meta name="keywords">` tags | None |
| image | string | No | Social media preview image | None |
| slug | string | No | Custom URL path | File path |
| tags | Tag[] | No | Categorization tags | None |
| draft | boolean | No | Dev-only (excluded from prod) | false |
| unlisted | boolean | No | Available but hidden + not indexed | false |
| last_update | object | No | Override author/date metadata | None |

### Finding: Docusaurus blog plugin adds author-specific and date fields
**Confidence:** CONFIRMED
**Evidence:** https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-blog

Additional blog-specific fields beyond shared ones:
| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| authors | Authors | No | Blog post author(s) |
| date | string | No | Post creation timestamp |
| author (deprecated) | string | No | Single author name |
| author_url (deprecated) | string | No | Author profile link |
| author_image_url (deprecated) | string | No | Author thumbnail |
| author_title (deprecated) | string | No | Author description |

### Finding: Docusaurus has clear draft vs unlisted distinction
**Confidence:** CONFIRMED
**Evidence:**
- `draft: true` — Completely excluded from production builds, only visible in dev
- `unlisted: true` — Available in production but hidden from navigation and not indexed by search engines. Accessible by direct URL only.

### Finding: Docusaurus supports parseFrontMatter hooks for custom processing
**Confidence:** CONFIRMED
**Evidence:** "You can use the Markdown config parseFrontMatter function to provide your own front matter parser, or to enhance the default parser."

---

## Gaps / follow-ups

- No AI/LLM-specific fields (no noindex for llms.txt, no agent directives)
- No `mode` or `layout` field for layout variations
- No explicit `noindex` field (uses `unlisted` for similar effect)
- No `groups` or access control fields
