---
title: "Outline Product Capabilities & Editor Experience Evidence"
type: evidence
subject: Outline
dimension: product-capabilities
collected: 2026-04-02
sources:
  - url: https://www.getoutline.com/changelog
    type: primary
    description: Official changelog with feature releases
  - url: https://github.com/outline/outline
    type: primary
    description: GitHub repository with 37.9k stars
  - url: https://deepwiki.com/outline/outline/2.1-document-model-and-api
    type: secondary
    description: DeepWiki analysis of Outline's document model
  - url: https://docs.getoutline.com/s/guide/doc/blocks-iwAQVA8kAf
    type: primary
    description: Official blocks documentation
  - url: https://www.markdownguide.org/tools/outline/
    type: secondary
    description: Markdown Guide Outline reference
  - url: https://github.com/outline/outline/discussions/3326
    type: primary
    description: Raw markdown view discussion with maintainer response
---

# Product Capabilities & Editor Experience Evidence

## Editor Architecture

- Built on ProseMirror (React wrapper) with Y.js CRDT for real-time collaboration
- TypeScript codebase (96.5% TS), React frontend, Node.js backend
- Editor originally published as `outline/rich-markdown-editor` (separate repo)
- WYSIWYG-first with markdown input shortcuts (not a markdown editor)

## Block Types Confirmed

From official docs and changelog:
- Headings (H1-H6), Paragraphs, Blockquotes
- Ordered/Unordered Lists, Task Lists
- Tables (with cell merging, column/row reordering, cell background colors, currency/date sorting, sticky headers - added incrementally 2025-2026)
- Code blocks with syntax highlighting
- Math (KaTeX) via `/math` or `$$`
- Notices (success, info, tip, warning)
- Images (jpg, png, gif) with resize, position, caption
- Videos with upload and embed
- File attachments (PDF, zip, etc.)
- Toggle blocks (collapsible content, added Jan 2026)
- PDF embeds (added Dec 2025)
- Draw.io/Diagrams.net diagrams (added Jan 2026)
- Mermaid diagrams
- Embeds: YouTube, Vimeo, Spotify, Figma, Google Docs, Airtable, Codepen, GitHub, Linear, GitLab, and more

## Slash Commands

- `/` triggers block menu
- Supports standard content insertion patterns
- `/table`, `/math`, `/pdf`, `/toggle` confirmed

## Markdown Support

Full support: headings, bold, italic, blockquotes, lists, code blocks, syntax highlighting, strikethrough, task lists, links, images

Partial support: tables (must use /table command, can't type markdown tables), heading IDs (auto-generated, can't manually specify)

NOT supported: footnotes, definition lists, emoji shortcodes, highlight, subscript, superscript, HTML

## Maintainer Position on Raw Markdown

Tom Moor (maintainer) explicitly declined raw markdown editing view:
> "Doubling down on making the editor collaborative" with features incompatible with basic markdown specs (mentions, inline comments, rich embeds)

This is a strategic choice to prioritize WYSIWYG collaboration over markdown fidelity.

## Editor Comparison Notes

- vs Notion: Community perception is that Outline's editor "feels very basic" compared to Notion's extensive block types and database views. Notion has databases, kanban, timeline, gallery views that Outline lacks entirely.
- vs Obsidian: Obsidian is pure markdown on local files with graph view. Outline is WYSIWYG-first with markdown shortcuts. Different philosophies - Obsidian optimizes for single-user knowledge graphs, Outline for team collaboration.

## Search

- PostgreSQL full-text search using tsvector
- `ts_rank_cd` for density-based relevance scoring
- Popularity boost multiplier
- Filters: collection, user, date range, status
- AI Answers overlay (cloud/licensed editions only)

## Document Hierarchy

- Workspace > Collections > Documents (nested)
- Collections support nested document trees via `parentDocumentId`
- Public collection sharing (added Aug 2025)
- Templating system for reusable document starting points
