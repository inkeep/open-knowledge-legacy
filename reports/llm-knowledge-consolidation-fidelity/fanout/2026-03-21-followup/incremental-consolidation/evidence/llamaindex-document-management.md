---
title: "LlamaIndex Document Management: Insert/Update/Refresh for Incremental Indexing"
source_type: open_source_project
url: https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/
accessed: 2026-03-21
relevance: Production-ready incremental indexing API with document-level change detection
---

# LlamaIndex Document Management

## Source
LlamaIndex documentation. https://developers.llamaindex.ai

## Core Operations

- **insert()**: Add new document post-initialization; auto-converted to nodes and ingested
- **delete(document_id)**: Remove document and all associated nodes
- **update(document)**: Replace existing document (same id_, different text) and re-index affected nodes
- **refresh(documents)**: Intelligent incremental update — only modifies documents with matching IDs but different content; inserts entirely new documents; returns boolean list of what was refreshed

## State Tracking

`ref_doc_info` attribute maps document IDs to:
- Constituent node IDs
- Original metadata from input documents
- Available on all index types using docstores

## Change Detection

- `filename_as_id` flag enables automatic ID assignment for directory-based workflows
- Change detection compares document text content (same ID, different text = needs update)
- No content-aware diffing — entire document re-processed on change

## Property Graph Index (May 2024)

LlamaIndex introduced Property Graph Index for LLM-based knowledge graph construction:
- Automated triple extraction from unstructured text
- Entity-based querying
- Incremental updates via insert()

## Key Insight for /consolidate

LlamaIndex's refresh() function is the closest production analog to incremental consolidation: it compares document IDs, detects changed content, and re-processes only what's different. The limitation is that it operates at document granularity, not claim granularity.
