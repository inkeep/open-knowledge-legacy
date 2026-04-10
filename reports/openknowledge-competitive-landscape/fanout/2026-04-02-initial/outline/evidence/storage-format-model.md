---
title: "Outline Storage & Format Model Evidence"
type: evidence
subject: Outline
dimension: storage-format-model
collected: 2026-04-02
sources:
  - url: https://deepwiki.com/outline/outline/2.1-document-model-and-api
    type: secondary
    description: DeepWiki technical analysis of document model
  - url: https://github.com/outline/outline/discussions/7396
    type: primary
    description: Storage format discussion with maintainer
  - url: https://github.com/outline/outline/discussions/6790
    type: primary
    description: Git export discussion with maintainer
  - url: https://docs.getoutline.com/s/guide/doc/export-Da6C7HqL8M
    type: primary
    description: Export documentation
---

# Storage & Format Model Evidence

## Internal Document Model

### Database: PostgreSQL + Redis + S3
- PostgreSQL: primary data store
- Redis: caching + real-time collaboration pub/sub
- S3 (or compatible): file/attachment storage

### Document Storage Layers (4 parallel representations):
1. **JSONB `content` column** - ProseMirror document tree (canonical source of truth)
2. **Text `text` column** - Legacy markdown representation (kept for backward compatibility)
3. **BYTEA `state` column** - Y.js CRDT binary state for real-time collaboration
4. **TSVECTOR `searchVector`** - PostgreSQL full-text search index

### Key Insight: NOT Markdown Storage
Tommy Moor (maintainer) explicitly stated:
> "Markdown cannot represent all the many things that a modern text editor must achieve."

The API documentation claims "documents are stored in Markdown formatting" but this is misleading. Using `x-api-version: 3` header with `documents.info` returns JSON, not markdown. The JSON format is the actual storage format; markdown is a lossy export.

### Document Properties:
- UUID `id` + 10-character `urlId` for URLs
- `collectionId` + `parentDocumentId` for hierarchy
- `publishedAt`, `archivedAt`, `deletedAt` for lifecycle states
- `revisionCount`, `popularityScore` for tracking
- Soft-delete with 30-day retention

## ProseMirror Schema

Node types include: headings, paragraphs, tables, code blocks, math nodes, embeds, notices, toggle blocks, images, videos, etc.

The schema is Outline-specific (not vanilla ProseMirror). Custom node types for Outline-specific features like mentions, comments, embeds.

## Export Options

Formats available:
- **Markdown** - Lossy export (cannot represent all editor features)
- **HTML** - More complete but not round-trippable
- **JSON** - Structured data, best for Outline-to-Outline migration

Export scope:
- Individual documents
- Entire collections
- Full workspace (`collections.exportAll` API)

## Git Backup Story

No native git integration. Maintainer recommendation:
> "I would recommend using webhooks honestly, listen for `revisions.create` event and write the data to git every time it's received."

Community tools exist:
- `outline-export` - automate zip exports, extract to markdown, push to git
- `FeralMib/outline-backup` - backup tool
- Various scripts for API-based migration

### Critical Portability Assessment:
- **Good**: API access to all content, export in multiple formats
- **Bad**: Canonical format is ProseMirror JSON, not markdown. Markdown export is lossy.
- **Ugly**: No native git sync. Webhook-based sync is DIY and fragile.
- **Implication for competitor**: A markdown+git native product has a fundamental portability advantage. Outline's rich editor features create lock-in because the internal format captures things markdown cannot express.

## Import Capabilities

- Confluence export files
- Notion export files  
- Word (.docx) files
- Markdown files
- JSON files (from other Outline instances)
- Drag-and-drop HTML, Markdown, .txt files into collections
