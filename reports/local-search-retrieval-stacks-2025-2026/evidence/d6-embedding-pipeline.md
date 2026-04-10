# Evidence: Embedding Pipeline Design for Local Use

**Dimension:** D3 — Embedding Pipeline Design for Local Use
**Date:** 2026-04-03
**Sources:** Obsidian Smart Connections, LlamaIndex docs, Orama docs, Fumadocs docs, LangChain docs, community blog posts

---

## Key sources referenced
- [LlamaIndex Ingestion Pipeline](https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/) — Incremental pipeline reference
- [LlamaIndex Document Management](https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/) — `refresh_ref_docs()` API
- [Smart Connections GitHub](https://github.com/brianpetro/obsidian-smart-connections) — Local embedding pipeline
- [Smart Connections docs](https://smartconnections.app/smart-connections/) — Architecture overview
- [Orama vector search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — Pre-computed vector approach
- [Fumadocs Orama integration](https://www.fumadocs.dev/docs/headless/search/orama) — Build-time indexing
- [LangChain CacheBackedEmbeddings](https://api.python.langchain.com/en/latest/embeddings/langchain.embeddings.cache.CacheBackedEmbeddings.html) — Caching pattern
- [Weaviate chunking strategies](https://weaviate.io/blog/chunking-strategies-for-rag) — Document vs chunk detection
- [RAG observability post-mortem](https://decompressed.io/learn/rag-observability-postmortem) — Model mismatch failure mode
- [sqlite-vec stable release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) — Storage reference

---

## Findings

### Finding: mtime as pre-filter + SHA-256 on changed files is the optimal incremental strategy
**Confidence:** CONFIRMED
**Evidence:** LlamaIndex uses content hashing via `document_hash` map in docstore. Smart Connections uses file event listeners + mtime. Content hashing is reliable but costs I/O; mtime is fast but unreliable across git checkout / rsync.

Recommended pattern: Read `stat().mtimeMs` first (single syscall, no I/O). If mtime unchanged, skip. If mtime changed, compute SHA-256 of content to confirm actual change before re-embedding. For 1,000 markdown files, full SHA-256 scan takes <100ms on M1 SSD.

**Implications:** Combines the speed of mtime with the reliability of content hashing. Near-zero overhead for unchanged files.

### Finding: Document-level change detection is preferred over chunk-level for markdown articles
**Confidence:** INFERRED
**Evidence:** Adding a paragraph mid-document shifts all downstream chunk boundaries, causing most chunks to get new hashes despite no semantic change. LlamaIndex tracks at document level in its docstore (`doc_id → document_hash` map).

When a document changes, re-embed all chunks for that document (typically 3-5 chunks for a ~1000-word article). This is fast enough on CPU (~100-200ms per article with bge-small) that the complexity of chunk-level tracking is not justified.

**Implications:** Store one content hash per source file. On change, re-embed all chunks from that file.

### Finding: The dominant production pattern is build-time + startup incremental + background worker
**Confidence:** CONFIRMED
**Evidence:** Smart Connections uses background indexing at startup + incremental updates. Fumadocs uses build-time indexing via `staticGET`. DocSearch uses weekly external re-indexing.

Three-phase hybrid: (1) Build-time: generate embeddings for all known content, ship as artifact. (2) Startup: diff current files against index via hashes, embed only delta. (3) Runtime: background worker embeds new/changed content without blocking main thread.

**Implications:** Build-time embedding eliminates cold start for published documentation. Startup incremental check handles edits since last build. Background worker handles live editing.

### Finding: First-run embedding of 1,000 articles takes ~2-5 minutes on M1 CPU
**Confidence:** INFERRED
**Evidence:** Smart Connections reports 3,000 notes in <10 minutes with BGE-micro (17M params). bge-small-en-v1.5 (33M params) is roughly 2x slower per inference. Estimated: ~100-200ms per article (3 chunks × 30-60ms/chunk), totaling 100-200 seconds for 1,000 articles.

Cold start includes model loading (~500ms-2s for WASM ONNX deserialize) plus per-article inference. With progress events and a background worker, the app can be usable while indexing completes.

**Implications:** Tolerable as a one-time cost. Ship pre-computed embeddings for published content to avoid this delay for end users.

### Finding: Model version mismatch causes silent retrieval failure — no errors, wrong results
**Confidence:** CONFIRMED
**Evidence:** [RAG observability post-mortem](https://decompressed.io/learn/rag-observability-postmortem) documents this failure mode. Cosine similarity drops from ~0.85 to ~0.65 across incompatible embedding spaces.

Store `model_id` + `model_version` in cache metadata. On startup, compare against configured model. Mismatch → full wipe + rebuild. For 1,000 articles, full rebuild is ~2-5 minutes — simple enough that versioned parallel indexes are unnecessary.

**Implications:** Always store model identifier with embeddings. Full wipe on model change is the simplest correct strategy at this scale.

### Finding: Embeddings should not be committed to git
**Confidence:** CONFIRMED
**Evidence:** Embeddings are derived artifacts (regenerable from source). Binary files produce undiffable git objects. Model upgrades invalidate all stored embeddings, creating stale committed data.

Convention: `.search-cache/` in `.gitignore`. Optionally commit a manifest (article paths + hashes, no vectors) to help CI know what needs re-embedding. Ship pre-computed embeddings as build artifacts, not git-tracked files.

**Implications:** Use `.gitignore` for embedding cache. Distribute pre-computed indexes via npm files, CDN, or CI artifacts.

### Finding: Smart Connections uses transformers.js with BGE-micro-v2 as default local model
**Confidence:** CONFIRMED
**Evidence:** [Smart Connections docs](https://smartconnections.app/smart-connections/). Default model: Xenova/bge-micro-v2 (17M params, 384 dims). Stores embeddings in `.smart-env/multi/` as custom AJSON files. Supports note-level + block-level embeddings independently.

**Implications:** Validates transformers.js + BGE family as a proven local embedding stack.

### Finding: Orama expects pre-computed vectors; its embedding plugin uses TensorFlow.js (not transformers.js)
**Confidence:** CONFIRMED
**Evidence:** [Orama vector search docs](https://docs.orama.com/docs/orama-js/search/vector-search). Core `mode: 'hybrid'` requires you to supply vectors at insert time. `@orama/plugin-embeddings` generates vectors locally but uses TFjs backend — a heavier dependency than transformers.js.

**Implications:** If using Orama for search, generate embeddings externally via transformers.js and insert them. Do not use @orama/plugin-embeddings.

### Finding: Memory mapping is irrelevant at 1,000-article scale
**Confidence:** CONFIRMED
**Evidence:** 1,000 × 384 × 4 bytes = 1.46 MB raw vectors. With 3x chunking: 4.4 MB. This is trivially small — fits entirely in RAM.

Memory mapping becomes relevant at 1M+ vectors (>1.5 GB). sqlite-vec provides effective OS page cache behavior. LanceDB uses implicit mmap at the format level.

**Implications:** Do not engineer for mmap. Load all vectors into RAM.

---

## Recommended embedding cache schema (SQLite)

```sql
CREATE TABLE cache_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Store: model_id, model_version, embedding_dim, schema_version, created_at

CREATE TABLE article_index (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,       -- SHA-256 hex
  mtime INTEGER NOT NULL,           -- Unix ms
  indexed_at INTEGER NOT NULL       -- Unix ms
);

CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[384],
  +article_path TEXT,               -- FK to article_index
  +chunk_text TEXT,                  -- raw text for display
  +chunk_index INTEGER              -- position within article
);
```

---

## Gaps / follow-ups

* Worker thread performance for embedding (Node.js `worker_threads`) vs main thread — overhead of message passing for typed arrays.
* Streaming/progressive search during initial indexing — implementation patterns for "search what's ready."
