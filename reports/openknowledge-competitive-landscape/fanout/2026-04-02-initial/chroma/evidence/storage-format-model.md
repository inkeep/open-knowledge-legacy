---
title: "Chroma Storage & Format Model Evidence"
source_type: primary
collection_date: 2026-04-02
sources:
  - url: https://docs.trychroma.com/docs/overview/architecture
    type: documentation
  - url: https://docs.trychroma.com/docs/collections/add-data
    type: documentation
  - url: https://github.com/chroma-core/chroma
    type: github
  - url: https://docs.trychroma.com/cloud/sync/github
    type: documentation
---

# Chroma Storage & Format Model Evidence

## Core Data Model: Embedding + Document + Metadata

Each record in Chroma consists of:
- **ID** (string, required, unique per collection)
- **Document** (string, optional raw text content)
- **Embedding** (vector, auto-generated if document provided)
- **Metadata** (dict of key-value pairs, optional)

When documents are provided without embeddings, Chroma auto-generates embeddings using the collection's configured embedding function. Default is Onnx Runtime with all-MiniLM-L6-v2.

## Storage Backends

### Local/Self-Hosted
- **Ephemeral**: In-memory only, lost on restart. For development.
- **Persistent**: SQLite-backed local storage with Apache Arrow format for vectors.

### Self-Hosted Server
- HTTP client connects to a self-managed Chroma server instance.
- Production deployments run as containerized services.

### Chroma Cloud
- Multi-tiered storage architecture:
  - Query layer: fast memory cache
  - SSD cache
  - Storage layer: S3/GCS for vectors, metadata, indexes
- Write-Ahead Log (wal3) built on object storage (October 2025)
- Automatic query-aware data tiering and caching

## Persistence Format
- Embeddings stored using efficient serialization (Apache Arrow format)
- HNSW index for approximate nearest neighbor search
- Brute force buffer for incoming embeddings before HNSW indexing

## Human-Readability: None
Content stored in Chroma is NOT human-readable or directly editable:
- Embeddings are binary vector representations
- Documents are stored as raw strings but not in any standard file format
- No markdown layer
- No file-system-based storage that could be version controlled
- No git integration for content (Chroma Sync reads FROM git, does not write TO git)
- Export requires programmatic API access

## Chroma Sync: One-Way Ingestion
Chroma Sync reads content FROM external sources and converts to embeddings:
- **GitHub**: Reads repo contents, chunks, embeds, indexes into collections
- **S3**: Reads objects from S3 buckets
- **Web**: Crawls, scrapes, chunks, and embeds web pages

Key detail: "When syncing a new version of a repository, Chroma forks the existing collection using copy-on-write and only processes the diff."

This is one-way ingestion only. There is no mechanism to:
- Write content back to git
- Edit the original documents
- Maintain a human-readable copy alongside embeddings
- Round-trip between human-authored content and Chroma storage

## Collection Forking
Copy-on-write duplication of collections (September 2025). This is operational branching for the embedding layer, not content branching. It has no analog to git branching for human-readable content.

## Import/Export
- Chroma Cloud supports data export (noted in pricing FAQ: "You can export your data at any time")
- Export is programmatic via API
- No standard export format (e.g., markdown, JSON-LD, CSV of documents) documented as a first-class feature

## Implications for Knowledge Platform Comparison
Chroma's storage model is fundamentally incompatible with the "markdown + git" knowledge substrate concept:
- Content enters as text, gets transformed into embeddings
- The transformation is lossy for editing purposes (embeddings are not reversible)
- Original documents ARE stored alongside embeddings, but not in an editable format
- No version history of document content (only collection-level forking)
- No diff/merge capabilities for content
