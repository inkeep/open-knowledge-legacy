# Evidence: MeiliSearch & Typesense

**Dimension:** D2 — MeiliSearch, D3 — Typesense
**Date:** 2026-04-03
**Sources:** GitHub repos, official docs, blog posts, npm packages

---

## Key files / pages referenced

- [MeiliSearch GitHub](https://github.com/meilisearch/meilisearch) — 56.9K stars, Rust engine
- [MeiliSearch v1.13 blog](https://www.meilisearch.com/blog/meilisearch-1-13) — hybrid search stabilized
- [Fixing Hybrid Search blog](https://www.meilisearch.com/blog/fixing-hybrid-search) — scoring fusion methodology
- [Hannoy HNSW blog](https://blog.kerollmops.com/from-trees-to-graphs-speeding-up-vector-search-10x-with-hannoy) — vector index architecture
- [MeiliSearch Storage docs](https://www.meilisearch.com/docs/learn/engine/storage) — LMDB architecture
- [meilisearch-js GitHub](https://github.com/meilisearch/meilisearch-js) — TypeScript SDK
- [Typesense GitHub](https://github.com/typesense/typesense) — ~21K stars, C++ engine
- [Typesense Semantic Search docs](https://typesense.org/docs/guide/semantic-search.html)
- [Typesense System Requirements](https://typesense.org/docs/guide/system-requirements.html)

---

## Findings

### Finding: MeiliSearch is a separate server process — NOT embeddable in Node.js
**Confidence:** CONFIRMED
**Evidence:** [meilisearch-js README](https://github.com/meilisearch/meilisearch-js) — npm package is HTTP client only

MeiliSearch is a Rust binary that runs as a standalone HTTP server (default port 7700). The `meilisearch` npm package is a REST client, not an embedded engine. Local deployment requires spawning the binary as a child process.

**Implications:** Not in-process. Requires distributing and managing a separate binary alongside the Node.js app. Adds operational complexity for a developer tool.

### Finding: MeiliSearch hybrid search is stable since v1.13 (Feb 18, 2025)
**Confidence:** CONFIRMED
**Evidence:** [v1.13 blog](https://www.meilisearch.com/blog/meilisearch-1-13), [experimental timeline](https://github.com/orgs/meilisearch/discussions/677)

Vector search was experimental from v1.3 (Aug 2023) through v1.12. Hybrid search uses score-based fusion (not RRF): BM25 and vector scores normalized to [0,1], merged via `semanticRatio` parameter. Hannoy HNSW vector store stabilized in v1.37 (Mar 2025).

**Implications:** Mature hybrid search with ~20 months of iteration before stabilization. Score-calibrated fusion is more sophisticated than naive RRF.

### Finding: MeiliSearch RAM usage ~50-200MB for 1K docs with vectors
**Confidence:** INFERRED
**Evidence:** [Storage docs](https://www.meilisearch.com/docs/learn/engine/storage) — LMDB memory-mapped, benchmark at 19.5K docs used ~305MB real RAM

LMDB architecture pages in data on demand. Virtual memory reports are misleadingly high (205GB mmap reservation). Real RAM scales with data size. For 1K docs (~5-10MB), estimated 50-100MB real RAM.

**Implications:** Comfortably within 2GB budget. LMDB's disk-backed nature makes RAM usage more predictable than fully in-memory engines.

### Finding: MeiliSearch does not use stemming — by design
**Confidence:** CONFIRMED
**Evidence:** [Tokenization docs](https://www.meilisearch.com/docs/learn/indexing/tokenization), [Charabia library](https://github.com/meilisearch/charabia)

Uses Charabia tokenizer with Unicode normalization, lowercasing, transliteration, and typo-tolerance instead of stemming. Stop words configurable per index.

**Implications:** Different approach to relevance than traditional BM25 engines. Typo-tolerance may be more useful for developer search than stemming.

### Finding: Typesense is a separate C++ server process — NOT embeddable
**Confidence:** CONFIRMED
**Evidence:** [Typesense install docs](https://typesense.org/docs/guide/install-typesense.html) — single binary, HTTP API on port 8108

Architecture is fully in-memory (entire keyword index in RAM), with disk backup. `typesense` npm package is HTTP client only.

**Implications:** Same operational burden as MeiliSearch for local deployment. Must distribute and manage a binary.

### Finding: Typesense built-in embedding models require 2-6GB RAM
**Confidence:** CONFIRMED
**Evidence:** [System requirements](https://typesense.org/docs/guide/system-requirements.html) — explicitly documented

Built-in S-BERT/E5 models load into server memory. This exceeds the 2GB total budget. Pre-generated external embeddings avoid this but add pipeline complexity.

**Implications:** Typesense hybrid search on a 2GB budget requires external embedding generation. The engine itself is fine for 1K docs (~20-50MB index RAM).

### Finding: Typesense had vector search 3.5 years before MeiliSearch stabilized it
**Confidence:** CONFIRMED
**Evidence:** Typesense v0.25.0 (Aug 2021) vs MeiliSearch v1.13 (Feb 2025)

Typesense was an early mover with HNSW-based semantic search. Current version v30.1 (Jan 2025).

**Implications:** More mature vector search implementation, but both are production-ready now.

---

## Negative searches

- Searched for MeiliSearch WASM/in-process mode → NOT FOUND. No plans to make it embeddable.
- Searched for Typesense embedded/library mode → NOT FOUND. Server-only architecture.

---

## Gaps / follow-ups

- MeiliSearch's built-in HuggingFace local embedder RAM overhead not explicitly documented (contrast with Typesense's documented 2-6GB)
- Neither engine is embeddable in-process for Node.js — both are server sidecars
