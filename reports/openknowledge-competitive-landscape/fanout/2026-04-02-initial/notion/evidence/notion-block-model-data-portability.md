---
title: "Notion Block Model and Data Portability Analysis"
type: technical-analysis
created: 2026-04-02
---

# Notion Block Model and Data Portability

## Source
- https://www.notion.com/blog/data-model-behind-notion
- https://developers.notion.com/guides/data-apis/working-with-markdown-content
- https://unmarkdown.com/blog/notion-export-broken

## Block Architecture

Everything in Notion is a block with three attributes:
1. **ID**: UUID v4 (visible in page URLs)
2. **Properties**: Custom data attributes (e.g., "title" for text)
3. **Type**: Determines rendering behavior

Blocks use dual-pointer system:
- **Content**: Downward pointers (ordered array of child block IDs)
- **Parent**: Upward pointer for permission inheritance

Indentation is structural, not presentational -- directly manipulates block relationships.

Block type transformations are lossless: changing type preserves properties and content, only changes the type attribute.

## Enhanced Markdown API

Three operations:
- `POST /v1/pages` (create with markdown)
- `GET /v1/pages/:page_id/markdown` (read)
- `PATCH /v1/pages/:page_id/markdown` (update)

~22 block types fully supported. Unsupported blocks (bookmarks, embeds, link previews, breadcrumbs) appear as `<unknown url="..." alt="block_type"/>` tags.

Update commands: `update_content` (search-and-replace), `replace_content` (full page replacement), `insert_content` (legacy), `replace_content_range` (legacy).

### Truncation
Pages exceeding ~20,000 blocks are truncated. Must handle pagination by fetching unknown block IDs separately.

### Text limits
- Text content: 2,000 characters per block
- Rich text arrays: 100 elements

## Export Limitations

### Markdown Export
- Databases exported as CSV, not markdown
- Colors, synced blocks, embeds silently dropped
- Toggle/callout blocks converted to raw HTML
- Table cells lose rich content (images, checkboxes, nested lists)
- File names get 32-char hex IDs appended; nested pages can exceed 260 chars (Windows failure)

### Markdown Import
- Basic formatting supported (headers, lists, bold/italic, links, code)
- Complex elements stripped: footnotes, nested tables, LaTeX
- File size limits: 5 MB (Free), 50 MB (paid)
- Rate limit: ~120 imports per 12 hours
- No direct .md file upload via API

## Data Portability Assessment

**Verdict: Significant vendor lock-in.**

While Notion supports export to HTML, Markdown, and CSV, complex relationships and proprietary block types break during export. The export is not lossless -- database relations, rollup properties, and embedded content may not survive conversion.

The Enhanced Markdown API partially addresses this for programmatic access, but it uses a Notion-specific flavor with XML-like tags that are not standard markdown. Data stored in Notion is fundamentally in Notion's proprietary block format, with markdown as an approximation layer.

## Implications for Agent-Native Knowledge Platforms

A platform built on markdown+git has an inherent portability advantage. Notion's block model creates rich editing experiences but at the cost of data portability. The Enhanced Markdown API is a concession that markdown is the lingua franca for agentic systems, but it's a translation layer, not the native format. An agent-native platform where markdown IS the source of truth eliminates this translation overhead and data loss.
