---
title: "Embeddable Search Engines for Local-First Hybrid Search"
description: "Deep investigation of 8 search engines (Orama, MeiliSearch, Typesense, Tantivy, SQLite FTS5+sqlite-vec, LanceDB, DuckDB, Qdrant, ChromaDB) for hybrid BM25+vector search embeddable in a Node.js/TypeScript application on developer laptops."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Orama
  - MeiliSearch
  - Typesense
  - Tantivy
  - SQLite FTS5
  - sqlite-vec
  - LanceDB
  - DuckDB
  - Qdrant
  - ChromaDB
topics:
  - hybrid search
  - embeddable databases
  - local-first search
  - vector search
---

# Embeddable Search Engines for Local-First Hybrid Search

**Purpose:** Identify which search engines can support hybrid search (BM25 + vector/semantic) while running in-process or as lightweight sidecars within a Node.js/TypeScript application on developer laptops. This report serves the parent investigation into the optimal local-first search stack for a knowledge platform indexing ~1000 markdown articles.

---

## Executive Summary

Of 8 search engines evaluated, **only 3 can run in-process within Node.js** with hybrid search capabilities: Orama, SQLite FTS5 + sqlite-vec, and LanceDB. The remaining 5 either require a separate server process (MeiliSearch, Typesense, Qdrant, ChromaDB) or lack Node.js bindings and/or vector search (Tantivy).

**Key Findings:**

- **Orama is the lowest-friction option** for a TypeScript knowledge platform: pure JavaScript, zero native dependencies, single `search()` API call for hybrid search, proven in documentation search (Fumadocs, Deno docs). At 1,000 docs, expect <10ms queries and <50MB RAM. Trade-off: in-memory only (must load full index on startup), brute-force vector search (adequate at this scale but limits future growth past ~100K docs).

- **SQLite FTS5 + sqlite-vec has the strongest persistence story** and the most predictable resource usage: disk-based with memory-mapped I/O, ~7-12MB total storage, sub-10ms hybrid queries via documented RRF SQL patterns. Trade-off: requires writing the hybrid fusion query yourself (no single-API-call hybrid), and sqlite-vec is pre-v1 (expect breaking changes).

- **LanceDB is the most capable embedded option** with native hybrid search (BM25 via Tantivy + vector), RRF reranking built-in, and disk-mapped storage. TypeScript SDK is first-class (v0.27.1, used by Continue IDE). Trade-off: LanceDB is transitioning FTS from Tantivy to a native implementation — the TypeScript FTS path's maturity during this transition is uncertain.

- **MeiliSearch and Typesense are disqualified as in-process options** — both are separate server binaries communicating over HTTP. They are strong choices if a sidecar architecture is acceptable, with MeiliSearch having the more sophisticated hybrid search fusion (score-calibrated, not RRF) and lower memory usage than Typesense.

- **Tantivy, Qdrant, and ChromaDB are not viable for this use case.** Tantivy has no maintained Node.js bindings and no native vector search. Qdrant and ChromaDB have embedded modes only in Python — their Node.js clients require a running server process.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | Orama | P0 | Deep |
| D2 | MeiliSearch | P0 | Deep |
| D3 | Typesense | P0 | Moderate |
| D4 | Tantivy | P0 | Deep |
| D5 | SQLite FTS5 + sqlite-vec | P0 | Deep |
| D6 | LanceDB | P0 | Moderate |
| D7 | DuckDB FTS + VSS | P0 | Moderate |
| D8 | Qdrant + ChromaDB | P0 | Moderate |

**Primary question:** Which embeddable search engines support hybrid BM25 + vector search within a Node.js process on a developer laptop?

**Non-goals:** Cloud-hosted services, GPU-required solutions, enterprise-scale systems, pricing/licensing, 1P codebase analysis.

---

## Detailed Findings

### Embeddability Classification

The single most important discriminator is whether the engine runs **in-process** within Node.js or requires a **separate server process**. This is a hard architectural constraint — not a configuration option.

```
                    Embeddable Search Engines
                    ========================

    IN-PROCESS (Node.js)              SIDECAR (HTTP server)          NOT VIABLE
    ========================          =======================        ===========
    Orama (TypeScript)                MeiliSearch (Rust binary)      Tantivy (no Node.js bindings)
    SQLite FTS5+vec (C ext)           Typesense (C++ binary)         Qdrant (Node.js = client only)
    LanceDB (Rust via napi)                                          ChromaDB (Node.js = client only)
    DuckDB FTS+VSS (C++ via napi)
```

**Evidence:** [evidence/meilisearch-typesense.md](evidence/meilisearch-typesense.md), [evidence/qdrant-chromadb.md](evidence/qdrant-chromadb.md), [evidence/tantivy.md](evidence/tantivy.md)

---

### D1: Orama

**Finding:** Orama is a pure TypeScript in-memory search engine with native hybrid search via a single API call. It is the lowest-friction path to hybrid search in a Node.js/TypeScript project.

**Architecture:** Zero runtime dependencies, runs in any JavaScript runtime. Index stored entirely in JavaScript memory (Float32Array for vectors, tries for text). Persistence via `@orama/plugin-data-persistence` (JSON or SeqProto binary format). Index must be fully loaded into RAM on startup — no disk-resident query execution.

**Hybrid search implementation:** Weighted linear combination with per-modality min-max normalization (not RRF). Both BM25 and vector results normalized to [0,1], then fused with configurable weights (default 0.5/0.5). Single `search()` call with `mode: "hybrid"`.

**Vector search:** Brute-force linear scan, cosine similarity only. No HNSW or ANN index. Vectors stored as Float32Array. Dimensionality configurable via schema (`"vector[512]"`). Magnitude cached at insert time.

**Performance at 1,000 docs (inferred):** Sub-10ms query latency. Estimated 10-50MB RAM depending on document length and schema complexity. Based on community-reported ~500MB at 100K documents ([GitHub issue #573](https://github.com/oramasearch/orama/issues/573)).

**Embedding integration:** Bring-your-own-vectors (insert raw float arrays) or use `@orama/plugin-embeddings` with TensorFlow.js CPU backend. Plugin produces 512-dim vectors. Model identity not publicly documented — bring-your-own-vectors is recommended for quality control.

**Production users:** [Fumadocs](https://www.fumadocs.dev/docs/headless/search/orama) (default search, migrated from Flexsearch), [Deno docs](https://docs.deno.com/orama/README/) (5,856-doc index), Docusaurus (official plugin). ~520K weekly npm downloads, 10.3K GitHub stars.

**Stability concern:** v3.0 introduced a critical tokenization regression ([#869](https://github.com/oramasearch/orama/issues/869)) that took ~7 months to fix (v3.0.4 → v3.1.11). The affected user reported wrong results, 200x result inflation, and 2s+ latency. Current stable: v3.1.18.

**Decision triggers:**
- If zero-dependency, pure-JS simplicity is the primary requirement → Orama is the clear choice
- If index persistence and predictable memory across app restarts matters → consider SQLite FTS5+vec instead
- If scale may grow past ~50K docs → Orama's brute-force vector search and in-memory architecture become limiting

**Evidence:** [evidence/orama.md](evidence/orama.md)

---

### D2: MeiliSearch

**Finding:** MeiliSearch is a mature, high-quality search engine with sophisticated hybrid search, but it is architecturally a separate server process — not embeddable in Node.js.

**Embeddability:** MeiliSearch is a Rust binary that runs as an HTTP server (default port 7700). The `meilisearch` npm package is a REST client. Local deployment requires distributing the binary and managing it as a child process.

**Hybrid search:** Stable since v1.13 (Feb 18, 2025) after ~20 months of experimental iteration. Uses score-calibrated fusion (not RRF): both BM25 and vector scores normalized to [0,1] via an affine transformation that spreads compressed cosine similarity clusters across the full range. Controlled via `semanticRatio` parameter (0.0 = keyword-only, 1.0 = vector-only).

**Vector search:** [Hannoy](https://blog.kerollmops.com/from-trees-to-graphs-speeding-up-vector-search-10x-with-hannoy) HNSW implementation, disk-backed via LMDB, CPU-only. 10x faster than previous arroy backend. Stabilized in v1.37 (Mar 2025).

**Resource footprint:** LMDB memory-mapped storage — real RAM scales with data access patterns, not data size. For 1,000 docs: estimated 50-200MB real RAM. Does not include built-in embedding model RAM (HuggingFace local embedder overhead not documented as explicitly as Typesense's).

**Node.js SDK:** `meilisearch` npm — written in TypeScript, first-class types, v0.56.0, actively maintained. 56.9K GitHub stars on the engine repo.

**Decision triggers:**
- If a sidecar server process is acceptable → MeiliSearch is the most mature hybrid search option
- If in-process embedding is a hard requirement → MeiliSearch is disqualified

**Evidence:** [evidence/meilisearch-typesense.md](evidence/meilisearch-typesense.md)

---

### D3: Typesense

**Finding:** Typesense has hybrid search capabilities predating MeiliSearch's by 3.5 years, but its built-in embedding models require 2-6GB RAM, and it requires a separate server process.

**Embeddability:** Separate C++ server binary, HTTP API on port 8108. `typesense` npm package is an HTTP client.

**Hybrid search:** Available since v0.25.0 (Aug 2021). HNSW-based vector search, built-in S-BERT/E5 embedding models, configurable semantic ratio. Current version: v30.1 (Jan 2025).

**Critical resource constraint:** Built-in embedding models require 2-6GB additional RAM — exceeds the 2GB total budget. Pre-generated external embeddings eliminate this overhead but add pipeline complexity.

**Comparison to MeiliSearch:** Typesense has longer vector search maturity and includes Snowball stemming (vs MeiliSearch's no-stemming approach). MeiliSearch has tighter BM25/vector score fusion and lower memory usage due to LMDB disk-backed architecture.

**Decision triggers:**
- If a sidecar server + stemming support is needed → Typesense is viable with external embeddings
- If the 2GB RAM budget is hard → built-in Typesense embeddings are disqualified

**Evidence:** [evidence/meilisearch-typesense.md](evidence/meilisearch-typesense.md)

---

### D4: Tantivy

**Finding:** Tantivy is the gold-standard Rust full-text search library, but it has no maintained Node.js bindings and no native vector search, making it impractical for this use case.

**BM25 quality:** Full Okapi BM25, 17-language stemming, SIMD-accelerated posting lists, FST term dictionaries. Used by Quickwit (acquired by Datadog), ParadeDB, Milvus, and LanceDB.

**No Node.js bindings:** All known binding projects are abandoned or proof-of-concept: `strangerlabs/tantivy` (last release 2019), `phiresky/tantivy-wasm` (browser demo, 15 commits), `Frando/tantivy-node` (5 commits, no release). The only maintained binding is `tantivy-py` (Python, v0.25.1).

**No native vector search:** [Issue #815](https://github.com/quickwit-oss/tantivy/issues/815) has been open since April 2020. No dense vector field type merged into core. Community implementations exist externally (NucliaDB HNSW, tANNtivy fork) but none in core Tantivy.

**Correction:** MeiliSearch does NOT use Tantivy internally — this is a common misconception. They are independent Rust codebases.

**Indirect path:** LanceDB uses Tantivy internally for FTS and has a Node.js SDK. This is the only way to access Tantivy-quality BM25 from Node.js today, albeit indirectly.

**Decision triggers:**
- If Python is an option → tantivy-py is excellent for BM25 (but still no vector search)
- If Node.js is required → Tantivy is not directly usable without significant custom binding work

**Evidence:** [evidence/tantivy.md](evidence/tantivy.md)

---

### D5: SQLite FTS5 + sqlite-vec

**Finding:** SQLite FTS5 + sqlite-vec provides the most predictable, disk-efficient hybrid search path with excellent Node.js integration, at the cost of writing your own fusion query.

**sqlite-vec (v0.1.9):** Maintained by [Alex Garcia](https://github.com/asg017/sqlite-vec), sponsored by Mozilla Builders, Fly.io, Turso. 7.3K GitHub stars. Written in C with zero dependencies. Supports float32, int8, and bit vectors. Distance metrics: L2, cosine, inner product. SIMD-accelerated (AVX on x86, NEON on ARM). Pre-v1 — expect breaking changes.

**FTS5 BM25:** Standard Okapi BM25 with hardcoded k1=1.2, b=0.75. Column weighting supported. Porter stemmer (English only). Built into SQLite — no extension needed.

**Hybrid search pattern:** Alex Garcia published a [dedicated blog post](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) documenting three fusion strategies. The recommended approach is **Reciprocal Rank Fusion (RRF)** via SQL CTEs — a single parameterized query that runs FTS5 and sqlite-vec searches as subqueries, then fuses by rank position. The SQL is well-documented and directly usable.

**Node.js integration:** `npm install sqlite-vec` + `better-sqlite3`. Official package with documented `sqliteVec.load(db)` pattern. FTS5 built into SQLite (no additional extension). This is the simplest npm install story: two packages for the entire hybrid search stack.

**Resource usage at 1,000 docs with 768-dim embeddings:**
- Disk: ~7-12MB total (3MB vectors + 2-5MB FTS5 index + 1-3MB content)
- RAM: SQLite pages in via cache (default 2MB). With `PRAGMA mmap_size`: entire DB in ~30-50MB window
- Query: sub-10ms hybrid (FTS5 sub-millisecond + brute-force vec sub-10ms)

**Limitations:**
- Brute-force only in stable releases (ANN index in experimental alpha)
- FTS5 has English-only stemming, no BM25 parameter tuning, no fuzzy matching without trigram tokenizer
- Two separate index structures (FTS5 table + vec0 table) must both be updated within the same transaction
- Pre-v1 sqlite-vec — pin versions

**Decision triggers:**
- If disk-based persistence and predictable memory are important → strongest choice
- If minimal API surface (single search call) is preferred → Orama or LanceDB are simpler
- If multi-language stemming is needed → FTS5's English-only porter stemmer is a limitation

**Evidence:** [evidence/sqlite-fts5-vec.md](evidence/sqlite-fts5-vec.md)

---

### D6: LanceDB

**Finding:** LanceDB is the most capable embedded option with native hybrid search, disk-mapped storage, and a first-class TypeScript SDK — but its FTS implementation is in transition.

**Architecture:** Embeddable, in-process. Storage uses Lance columnar format on local disk. In-memory operations via Apache Arrow + DataFusion (Rust). Only indexes and metadata kept in RAM — raw data memory-mapped from SSD.

**Hybrid search:** Native first-class feature. BM25 FTS (currently via Tantivy) + vector search combined with RRF reranking (default), Cohere, CrossEncoder, or custom rerankers. Single API for hybrid results.

**TypeScript SDK:** `@lancedb/lancedb` v0.27.1 on npm. Actively maintained (rapid release cadence). Downloads platform-specific native Rust binary. Full TypeScript types. Async/await API. Used in production by [Continue](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/) (IDE coding assistant) for semantic code search.

**FTS transition concern:** LanceDB has [announced](https://lancedb.com/blog/feature-full-text-search/) a move from Tantivy-based FTS to a native Lance FTS implementation ("No more Tantivy!"). The Tantivy-based FTS was historically Python-only sync API. Current TypeScript docs show FTS examples, but the migration's completeness in the TypeScript SDK is uncertain.

**Performance at 1,000 docs:** "For small datasets of ~100K records, a vector index is usually not necessary" ([LanceDB FAQ](https://docs.lancedb.com/faq/faq-oss)). Flat vector search well under 100ms. ~6MB raw vectors at 1,536-dim. Minimal RAM due to disk-mapped architecture.

**Decision triggers:**
- If native hybrid search API + embedded TypeScript is the priority → LanceDB is the strongest choice
- If FTS reliability during the Tantivy→native transition is a concern → verify against current changelog
- If the project is production-critical and API stability matters → LanceDB is pre-v1 (v0.27.1)

**Evidence:** [evidence/lancedb.md](evidence/lancedb.md)

---

### D7: DuckDB FTS + VSS

**Finding:** DuckDB provides embeddable FTS (BM25) and vector search (HNSW), but hybrid search requires manual SQL composition and the VSS extension has experimental persistence.

**FTS extension:** Core extension with `match_bm25()` function. Porter stemmer, English stop words. Auto-loaded. Index does NOT auto-update on table changes.

**VSS extension:** Based on usearch library. HNSW indexing via `array_cosine_similarity()` and related functions. **Critical caveat:** HNSW index persistence requires `SET hnsw_enable_experimental_persistence = true` and documentation states "not recommended for production environments." WAL recovery not implemented. At 1,000 docs, rebuilding the index on startup takes milliseconds — this caveat is manageable.

**Node.js integration:** New official `@duckdb/node-api` package (TypeScript-native, Promise support). Old `duckdb` npm package being deprecated. FTS and VSS extensions loaded via SQL through the connection object.

**Hybrid search:** No built-in function. Requires composing `match_bm25()` + `array_cosine_similarity()` in SQL CTEs with manual fusion (weighted combination or RRF). Well-documented community pattern ([MotherDuck tutorial](https://motherduck.com/blog/search-using-duckdb-part-3/)).

**Decision triggers:**
- If DuckDB is already in the stack for analytics → adding search is incremental
- If a single-API hybrid search call is preferred → DuckDB requires more manual composition
- If VSS persistence stability matters → currently experimental

**Evidence:** [evidence/duckdb-fts-vss.md](evidence/duckdb-fts-vss.md)

---

### D8: Qdrant & ChromaDB

**Finding:** Both Qdrant and ChromaDB have embedded modes in Python only. Their Node.js clients are HTTP-only, requiring a separate server process — disqualifying them for in-process Node.js use.

**Qdrant:** Rust-based vector DB. Python has `QdrantClient(":memory:")` and `QdrantClient(path="./storage")` for in-process use. Node.js `@qdrant/qdrant-js` is REST/gRPC client only. Native BM25 via sparse vectors (v1.15.2+), sophisticated hybrid search with RRF. Qdrant Edge (in-process for embedded devices) announced July 2025 but in private beta — no Node.js bindings.

**ChromaDB:** Python has `PersistentClient(path="./chroma_db")` for in-process use. Node.js `chromadb` npm package (v3.4.0) is HTTP client only — requires `chroma run` or Docker. Recently added BM25 sparse vector support for hybrid search.

**Both engines perform well on CPU at 1,000 docs** — this is not the constraint. The constraint is architectural: neither provides in-process Node.js access.

**Decision triggers:**
- If Python is the runtime → both are strong embedded options with hybrid search
- If Node.js is required → both are disqualified for in-process use
- If a sidecar is acceptable → Qdrant's hybrid search (BM25 + RRF + BM42) is more mature than ChromaDB's

**Evidence:** [evidence/qdrant-chromadb.md](evidence/qdrant-chromadb.md)

---

## Comparative Analysis

### In-Process Engines: Head-to-Head

| Criterion | Orama | SQLite FTS5+vec | LanceDB | DuckDB FTS+VSS |
|---|---|---|---|---|
| **Language** | Pure TypeScript | C (SQLite) + C (vec) | Rust (napi) | C++ (napi) |
| **Native deps** | None | better-sqlite3 (prebuild) | Native binary | Native binary |
| **Hybrid API** | Single `search()` call | Manual SQL (RRF CTE) | Single API call | Manual SQL |
| **BM25 quality** | Standard BM25 | Standard BM25 (English stemmer) | Tantivy BM25 (17 languages) | Standard BM25 (English stemmer) |
| **Vector index** | Brute-force only | Brute-force (ANN alpha) | IVF/HNSW | HNSW (experimental persistence) |
| **Storage** | In-memory + file serialize | Disk (SQLite file) | Disk (Lance format) | Disk (.duckdb file) |
| **RAM at 1K docs** | ~10-50MB | ~2-50MB (mmap) | Very low (mmap) | Low (configurable) |
| **Query latency (1K)** | <10ms | <10ms | <10ms | <10ms |
| **npm install** | `@orama/orama` | `better-sqlite3` + `sqlite-vec` | `@lancedb/lancedb` | `@duckdb/node-api` |
| **Maturity** | v3.1.18, ~520K wkly downloads | FTS5: stable. vec: pre-v1 (v0.1.9) | Pre-v1 (v0.27.1) | FTS: stable. VSS: experimental |
| **Production users** | Fumadocs, Deno docs | LangChain, MCP servers | Continue IDE | Analytics pipelines |
| **Persistence** | Load full index on restart | Native (SQLite file) | Native (Lance files) | Native (.duckdb file) |
| **Browser support** | Yes | No | No | No |

### Sidecar Engines: For Reference

| Criterion | MeiliSearch | Typesense |
|---|---|---|
| **Hybrid search** | Score-calibrated fusion (stable v1.13+) | HNSW + BM25 (stable v0.25+) |
| **Deployment** | Single Rust binary, port 7700 | Single C++ binary, port 8108 |
| **RAM at 1K docs** | ~50-200MB | ~20-50MB (no built-in model) |
| **Built-in embeddings** | HuggingFace local | S-BERT/E5 (2-6GB RAM) |
| **Stemming** | None (by design) | Snowball (multi-language) |
| **Stars** | 56.9K | ~21K |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Orama performance benchmarks:** No official benchmarks published for `@orama/orama` at any scale. All performance claims are inferred from architecture and the single 100K-doc memory data point.
- **LanceDB FTS transition status:** The Tantivy → native FTS migration's completeness in the TypeScript SDK could not be confirmed from public sources. Requires testing against current release.
- **DuckDB VSS persistence timeline:** When HNSW persistence will move from experimental to stable is not publicly documented.

### Out of Scope (per Rubric)

- Cloud-hosted search services (Algolia, Elasticsearch Cloud, Orama Cloud)
- GPU-required solutions (FAISS with GPU, cuVS)
- Enterprise-scale systems (Elasticsearch, OpenSearch, Solr)
- Pricing and licensing comparisons
- 1P codebase analysis

---

## References

### Evidence Files

- [evidence/orama.md](evidence/orama.md) — Orama architecture, hybrid search, performance, production users, limitations
- [evidence/meilisearch-typesense.md](evidence/meilisearch-typesense.md) — MeiliSearch and Typesense embeddability, hybrid search, resource usage
- [evidence/tantivy.md](evidence/tantivy.md) — Tantivy architecture, Node.js bindings survey, vector search status
- [evidence/sqlite-fts5-vec.md](evidence/sqlite-fts5-vec.md) — sqlite-vec maturity, FTS5 BM25, hybrid search patterns, Node.js integration
- [evidence/lancedb.md](evidence/lancedb.md) — LanceDB architecture, hybrid search, TypeScript SDK, FTS transition
- [evidence/duckdb-fts-vss.md](evidence/duckdb-fts-vss.md) — DuckDB FTS/VSS extensions, hybrid search patterns, Node.js SDK
- [evidence/qdrant-chromadb.md](evidence/qdrant-chromadb.md) — Qdrant/ChromaDB embedded modes, Node.js limitations

### External Sources

- [Orama GitHub](https://github.com/oramasearch/orama) — 10.3K stars, Apache 2.0
- [Orama Hybrid Search docs](https://docs.orama.com/docs/orama-js/search/hybrid-search)
- [MeiliSearch GitHub](https://github.com/meilisearch/meilisearch) — 56.9K stars
- [MeiliSearch v1.13 hybrid search stabilization](https://www.meilisearch.com/blog/meilisearch-1-13)
- [Hannoy HNSW blog](https://blog.kerollmops.com/from-trees-to-graphs-speeding-up-vector-search-10x-with-hannoy)
- [Typesense GitHub](https://github.com/typesense/typesense) — ~21K stars
- [Typesense system requirements (embedding model RAM)](https://typesense.org/docs/guide/system-requirements.html)
- [Tantivy GitHub](https://github.com/quickwit-oss/tantivy) — 14.8K stars
- [Tantivy vector search issue #815](https://github.com/quickwit-oss/tantivy/issues/815) — open since April 2020
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — 7.3K stars, Alex Garcia
- [sqlite-vec hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)
- [sqlite-vec Node.js docs](https://alexgarcia.xyz/sqlite-vec/js.html)
- [SQLite FTS5 docs](https://www.sqlite.org/fts5.html)
- [LanceDB GitHub](https://github.com/lancedb/lancedb)
- [LanceDB npm @lancedb/lancedb](https://www.npmjs.com/package/@lancedb/lancedb) — v0.27.1
- [LanceDB FTS transition blog](https://lancedb.com/blog/feature-full-text-search/)
- [DuckDB FTS extension docs](https://duckdb.org/docs/current/core_extensions/full_text_search)
- [DuckDB VSS extension docs](https://duckdb.org/docs/current/core_extensions/vss)
- [DuckDB Node Neo client](https://duckdb.org/2024/12/18/duckdb-node-neo-client)
- [MotherDuck hybrid search tutorial](https://motherduck.com/blog/search-using-duckdb-part-3/)
- [Qdrant Edge announcement](https://www.businesswire.com/news/home/20250729908555/en/Qdrant-Announces-Qdrant-Edge-First-Vector-Search-Engine-for-Embedded-AI)
- [Qdrant hybrid search](https://qdrant.tech/articles/hybrid-search/)
- [ChromaDB BM25 docs](https://docs.trychroma.com/integrations/embedding-models/chroma-bm25)
- [Fumadocs Orama integration](https://www.fumadocs.dev/docs/headless/search/orama)
- [Continue IDE + LanceDB case study](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/)
