# Evidence: Mintlify Frontmatter Schema

**Dimension:** D2 — Mintlify frontmatter schema
**Date:** 2026-04-05
**Sources:** https://www.mintlify.com/docs/organize/pages, https://www.mintlify.com/docs/ai/llmstxt

---

## Key pages referenced

- https://www.mintlify.com/docs/organize/pages — Frontmatter reference
- https://www.mintlify.com/docs/ai/llmstxt — llms.txt generation details
- https://www.mintlify.com/docs/llms-full.txt — Full llms.txt file

---

## Findings

### Finding: Mintlify supports 17+ explicit frontmatter fields
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/organize/pages

| Field | Type | Required | Purpose | Default |
|-------|------|----------|---------|---------|
| title | string | No | Page title in nav and browser tabs | Auto from file path |
| description | string | No | SEO meta description, shown under title | None |
| sidebarTitle | string | No | Abbreviated sidebar label | None |
| icon | string | No | Visual identifier (Font Awesome, Lucide, URL) | None |
| iconType | string | No | Font Awesome style variant | None |
| tag | string | No | Badge label next to title | None |
| hidden | boolean | No | Remove from sidebar (still accessible by URL) | false |
| noindex | boolean | No | Prevent search engine indexing | false |
| deprecated | boolean | No | Display deprecation warning | false |
| hideFooterPagination | boolean | No | Remove prev/next nav links | false |
| hideApiMarker | boolean | No | Hide HTTP method badge on API pages | false |
| groups | string[] | No | Restrict access to user groups | None |
| mode | enum | No | Layout: default, wide, custom, frame, center | default |
| api / openapi | string | No | API spec for interactive playground | None |
| url | string | No | External link URL | None |
| timestamp | boolean | No | Override global last-modified setting | Global |
| keywords | string[] | No | Help search discovery | None |

### Finding: Mintlify supports arbitrary custom YAML fields
**Confidence:** CONFIRMED
**Evidence:** "Any valid YAML frontmatter is supported, for example, product: 'API' or version: '1.0.0'"

### Finding: hidden pages automatically get noindex:true
**Confidence:** CONFIRMED
**Evidence:** "Pages with hidden: true in their frontmatter receive noindex: true automatically"

### Finding: Mintlify auto-generates llms.txt from description frontmatter
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/llmstxt
- Descriptions truncated at 300 chars and first line break
- API pages include spec info from openapi/api fields
- Group-restricted pages excluded from llms.txt
- HTTP headers `Link: </llms.txt>; rel="llms-txt"` added for discovery

### Finding: Mintlify has 5 layout modes controlled via frontmatter
**Confidence:** CONFIRMED
**Evidence:** mode field values:
- `default` — standard with sidebar + TOC
- `wide` — hides TOC, extra horizontal space
- `custom` — blank canvas, only top navbar
- `frame` — like custom but keeps sidebar
- `center` — removes sidebar + TOC, centers content

---

## Gaps / follow-ups

- No explicit `draft` or `unlisted` field documented
- No `tags` field (uses `keywords` instead for search)
- No `slug` field documented (URL determined by file path)
- No date/timestamp fields beyond the `timestamp` toggle
- No AI-specific fields beyond the implied noindex behavior on llms.txt
