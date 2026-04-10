# Evidence: What Orama Does NOT Do (Gaps)

**Dimension:** D9 — What Orama does NOT do
**Date:** 2026-04-02
**Sources:** Orama source code analysis, web search results

---

## Findings

### Finding: No reranking / cross-encoder support
**Confidence:** CONFIRMED
**Evidence:** No reranking functions in the source code. The search pipeline is: index query -> score -> sort -> return. There is no post-retrieval reranking step. A cross-encoder would need to be implemented as an afterSearch hook or in the consuming application.

### Finding: No backlink indexing
**Confidence:** CONFIRMED
**Evidence:** Orama indexes forward documents (document -> terms). There is no concept of backlinks (document A references document B). Backlink resolution would need to be handled externally and stored as document metadata.

### Finding: No frontmatter-aware parsing
**Confidence:** CONFIRMED
**Evidence:** Orama is a search engine, not a document parser. It expects structured data (already-parsed documents with fields). The consumer must parse markdown frontmatter before inserting. The `@orama/plugin-parsedoc` plugin can parse HTML but does NOT handle markdown frontmatter.

### Finding: No auto-indexing from filesystem / no file watcher
**Confidence:** CONFIRMED
**Evidence:** No filesystem APIs in the source code. Orama is a pure in-memory search index. The consuming application must: watch the filesystem for changes, parse documents, and call insert/update/remove.

### Finding: No MCP server
**Confidence:** CONFIRMED
**Evidence:** No MCP-related code in the monorepo. No community MCP server found in web search. This would need to be built from scratch.

### Finding: No query decomposition / multi-step retrieval
**Confidence:** CONFIRMED
**Evidence:** Each search() call is a single atomic query. There is no built-in query planning, query expansion, or multi-step retrieval (e.g., search, then refine, then re-search). The AnswerSession class (v3 feature) provides RAG/chat capabilities but uses single-shot search internally.

### Finding: Multi-language support requires external stemmers package
**Confidence:** CONFIRMED
**Evidence:** Core Orama only bundles the English stemmer. Other languages require:
1. `@orama/stemmers` for stemming in 30 languages
2. `@orama/stopwords` for stop words
3. `@orama/tokenizers` for Japanese and Mandarin Chinese

All languages have regex splitters built into the core tokenizer, but accurate search in non-English languages requires these additional packages.

### Finding: No built-in snippet extraction (text window around match)
**Confidence:** CONFIRMED
**Evidence:** The match-highlight plugin returns raw character positions. Building "...context before **match** context after..." snippets is left to the consumer.

### Finding: No incremental persistence / WAL / change tracking
**Confidence:** CONFIRMED
**Evidence:** save() serializes the full state every time. There's no write-ahead log, no change tracking, no diffing. For 1,000 documents this is fast enough (< 100ms), but at larger scales it becomes a bottleneck.

### Finding: No schema evolution (add/remove fields without rebuild)
**Confidence:** CONFIRMED
**Evidence:** Schema is fixed at create() time. Adding a new field requires creating a new database and re-inserting all documents.

### Finding: No ANN (approximate nearest neighbor) index for vector search
**Confidence:** CONFIRMED
**Evidence:** Vector search is brute-force cosine similarity. Works well at < 10K documents but would need replacement at larger scales.

### Finding: No disk-based storage / memory-mapped files
**Confidence:** CONFIRMED
**Evidence:** Everything is in JavaScript heap memory. No mmap, no disk-based index, no memory-efficient storage. The entire index must fit in RAM.

### Finding: No built-in authentication or access control
**Confidence:** CONFIRMED
**Evidence:** Orama is a library, not a service. There's no concept of API keys, user permissions, or tenant isolation at the library level. The consuming application handles access control.

---

## Summary of gaps for our use case

| Gap | Severity for us | Mitigation |
|-----|----------------|------------|
| No frontmatter parsing | Low | We parse with gray-matter/remark before indexing |
| No filesystem watcher | Low | We build this (chokidar/fs.watch) |
| No MCP server | Medium | We build an MCP server wrapper |
| No reranking | Medium | We add cross-encoder post-processing if needed |
| No backlink indexing | Medium | We compute backlinks externally, store as metadata |
| No snippet extraction | Low | We build snippet extraction from positions |
| No incremental persistence | Low at 1K docs | Full serialization is fast enough |
| No schema evolution | Low | Rare operation; rebuild on schema change is acceptable |
| No ANN index | Low at 1K docs | Brute-force is fine for our scale |
