---
title: "JS/TS-Native Search Path: Hybrid Search Libraries and Stacks for Node.js"
description: "Deep investigation of JavaScript/TypeScript-native search libraries for hybrid BM25 + vector search in a Node.js knowledge platform targeting ~1000 markdown articles. Covers Orama, MiniSearch, FlexSearch, sqlite-vec + better-sqlite3, LanceDB, and the pure-TS vs native-module trade-off."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Orama
  - MiniSearch
  - FlexSearch
  - sqlite-vec
  - better-sqlite3
  - LanceDB
  - transformers.js
topics:
  - hybrid search engines
  - JavaScript search libraries
  - local-first search
  - vector search in Node.js
---

# JS/TS-Native Search Path: Hybrid Search Libraries and Stacks for Node.js

**Purpose:** Identify the best JavaScript/TypeScript-native hybrid search stack for a developer-facing knowledge platform. The target is ~1000 markdown articles on a MacBook Air, with BM25 + vector search, <100ms latency, <2GB memory, no cloud services, no Docker, no GPU. This report focuses specifically on the JS/TS ecosystem — libraries that work natively in Node.js.

---

## Executive Summary

Three viable hybrid search stacks emerge for a 1000-document Node.js knowledge platform, each with distinct trade-offs:

1. **Orama + transformers.js** — the pragmatic default. Orama is a pure-TypeScript search engine with built-in BM25 + vector hybrid search. Paired with transformers.js for local embeddings, it requires zero compilation and installs with `npm install`. Search latency is 5-15ms hybrid. The trade-off: ~220MB for the ONNX runtime prebuilt binary, and Orama's vector search is brute-force O(n), which is irrelevant at 1K docs but limits future scaling.

2. **SQLite FTS5 + sqlite-vec + better-sqlite3** — the fastest and most persistent. Alex Garcia's sqlite-vec extension brings vector search to SQLite with documented RRF hybrid patterns. Combined with better-sqlite3's synchronous API, hybrid queries run in 1-3ms at this scale. The index persists to a single file. The trade-off: requires native modules (prebuilt binaries available), manual SQL for hybrid queries, and sqlite-vec is pre-1.0.

3. **MiniSearch + separate vector library** — the lightest option. MiniSearch provides best-in-class BM25+ scoring in ~7KB with excellent TypeScript types, but has no vector search. Pairing with hnswlib-node or a brute-force cosine implementation adds hybrid capability at the cost of manual score fusion. Smallest memory footprint (~500KB for the text index alone).

**LanceDB** is a capable option with the most sophisticated API (`.query().fullTextSearch().nearestTo().rerank()`) but its 91MB native binary and unknown JS-specific cold start make it over-engineered for 1000 documents.

At this scale, **all approaches meet the performance requirements**. The decision factors are: TypeScript DX, native dependency tolerance, persistence needs, and scaling headroom.

**Key Findings:**
- **Orama is pure TypeScript with zero dependencies, but its vector search is brute-force and hybrid fusion uses weighted sum (not RRF)**
- **Embedding generation is the real bottleneck: ~80-100 seconds build-time for 1000 docs, regardless of search engine**
- **No performant pure-JS embedding solution exists — transformers.js with prebuilt ONNX binaries is the practical minimum**
- **At 1000 documents, search latency differences between engines are negligible (<15ms for all)**
- **MiniSearch is the best standalone BM25 engine (BM25+ scoring, native TypeScript, 913K weekly downloads)**

---

## Research Rubric

| # | Dimension | Priority | Depth | Stance |
|---|-----------|----------|-------|--------|
| D1 | Orama Deep Dive | P0 | Deep | Factual |
| D2 | Other JS/TS Full-Text Search Libraries | P0 | Moderate | Factual/Comparative |
| D3 | sqlite-vec + better-sqlite3 from Node.js | P0 | Deep | Factual |
| D4 | LanceDB from Node.js | P0 | Moderate | Factual |
| D5 | Performance Benchmarks at Target Scale | P0 | Deep | Factual/Quantitative |
| D6 | Pure TypeScript vs Native Modules | P0 | Deep | Factual |

**Primary question:** What is the optimal JS/TS-native hybrid search stack for ~1000 markdown articles in a Node.js application?

**Non-goals:** Cloud services, GPU solutions, enterprise-scale systems, pricing/licensing, 1P codebase analysis.

---

## Detailed Findings

### D1: Orama Deep Dive

**Finding:** Orama is a pure-TypeScript search engine with built-in hybrid search, brute-force vector search, and BM25 scoring — a complete in-memory solution with zero native dependencies.

**Evidence:** [evidence/d1-orama-deep-dive.md](evidence/d1-orama-deep-dive.md)

#### Architecture

Orama uses a multi-tree index architecture with 7 specialized data structures (confirmed from [source code](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees.ts)):

- **Radix Tree** for full-text indexing with fuzzy matching via Levenshtein distance
- **AVL Tree** for sorted/comparable data (numbers, dates)
- **Vector Tree** — a flat `Map<DocID, [Magnitude, Float32Array]>` for vector storage
- BKD (geo), Boolean, Flat, and ZIP trees for other data types

This is NOT a single inverted index — each schema type gets its own optimized data structure.

#### Hybrid Search Mechanics

Orama's hybrid search uses **weighted sum with min-max normalization** — NOT Reciprocal Rank Fusion (confirmed from [search-hybrid.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/methods/search-hybrid.ts)):

1. BM25 scores normalized by dividing by max score in the result set
2. Vector cosine similarities normalized the same way
3. `combined = (text_score × text_weight) + (vector_score × vector_weight)`
4. Default weights: 0.5/0.5 (configurable via `hybridWeights`)

BM25 parameters are standard: k=1.2, b=0.75, d=0.5. Schema types include `string`, `number`, `boolean`, `enum`, `geopoint`, `vector[N]`, and their array variants.

#### Vector Search

Brute-force linear scan only — no HNSW, no approximate nearest neighbor. Cosine similarity is the only distance metric. Magnitudes are pre-computed at insert time for efficiency. A `@todo` comment in the source acknowledges the limitation.

For 1000 documents at 384 dimensions, this is 5-10ms per query (confirmed by [third-party Nearform measurement](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/) at ~900 articles). At 100K+ documents, this becomes a bottleneck.

#### Embedding Integration

The official `@orama/plugin-embeddings` uses **TensorFlow.js** (not transformers.js). For transformers.js, users must generate embeddings externally and pass vectors via Orama's bring-your-own-embeddings API:

```typescript
const db = create({
  schema: {
    title: 'string',
    content: 'string',
    embedding: 'vector[384]',
  },
})

insert(db, {
  title: 'Article Title',
  content: 'Article body...',
  embedding: preComputedVector, // Float32Array from transformers.js
})

const results = search(db, {
  term: 'search query',
  mode: 'hybrid',
  vector: { value: queryEmbedding, property: 'embedding' },
  similarity: 0.8,
})
```

#### Persistence

The `@orama/plugin-data-persistence` supports JSON, dpack, and seqproto (fast binary) formats. Core also exports `save()`/`load()` without the plugin. Serialization ceiling at ~512MB due to JavaScript string length limit ([Issue #851](https://github.com/oramasearch/orama/issues/851)).

#### Maturity and Production Usage

~520K weekly npm downloads, 10.3K GitHub stars, Apache 2.0. v3.1.18 (Dec 2024). Originally "Lyra" at NearForm. Fumadocs uses Orama as its default search engine. Integrations exist for Docusaurus, Astro Starlight, Strapi, Nextra, and Qwik City.

v3.0.x had significant tokenization regressions ([Issue #869](https://github.com/oramasearch/orama/issues/869)) — stable from v3.1.11+. No formal benchmark suite exists.

**Decision triggers:**
- If you need a single-dependency, zero-compilation hybrid search → Orama is the strongest fit
- If you need RRF-style ranking fusion → Orama uses weighted sum, not RRF; consider SQLite path
- If you anticipate scaling beyond 10K documents → brute-force vector search becomes a concern

---

### D2: Other JS/TS Full-Text Search Libraries

**Finding:** MiniSearch is the best standalone BM25 engine for TypeScript codebases. FlexSearch is fastest but uses non-standard scoring and has poor TypeScript types. lunr.js is effectively abandoned.

**Evidence:** [evidence/d2-js-ts-search-libraries.md](evidence/d2-js-ts-search-libraries.md)

#### MiniSearch — The BM25 Champion

[MiniSearch](https://github.com/lucaong/minisearch) uses BM25+ scoring (an improvement over standard BM25 that reduces short-document bias). Written natively in TypeScript. ~913K weekly downloads, ~5,900 stars, actively maintained. ~7KB gzipped.

Key strengths: JSON serialization (`JSON.stringify()`/`MiniSearch.loadJSON()`), built-in fuzzy and prefix search, result explanations (match details alongside scores), used by VitePress. Weakest point: no vector search — hybrid requires pairing with a separate vector library.

#### FlexSearch — Speed King, DX Liability

[FlexSearch](https://github.com/nextapps-de/flexsearch) uses proprietary "Contextual Search" scoring — the author explicitly rejects BM25/TF-IDF. ~956K weekly downloads, ~13,650 stars. Claims 300x more operations than next-fastest competitor.

The dealbreaker for a TypeScript codebase: type definitions have documented issues (incorrect types across multiple versions, broken ESM imports), spawning community forks (flexsearch-es, flexsearch-ts). Also: no BM25 means relevance ranking behavior is non-standard and harder to reason about.

#### lunr.js — Legacy, Do Not Use

~5.9M weekly downloads (embedded in static site generators), but last release ~2020, 129 open issues, effectively unmaintained. BM25 + vector space model scoring. Immutable index. Not viable for new projects.

#### Others

- **Fuse.js** (~8.8M downloads): Fuzzy search only (Bitap algorithm), not full-text. Appropriate for autocomplete, not document search.
- **search-index** (~54K downloads): TF-IDF scoring on LevelDB. Overkill and under-adopted for this use case.
- **wink-bm25-text-search**, **fast-bm25**, **bm25-lite**: Standalone BM25 implementations. MiniSearch offers BM25+ with better DX.

**Decision triggers:**
- If you want the best BM25 quality in pure TS → MiniSearch
- If you want maximum raw speed and can tolerate non-standard scoring → FlexSearch
- If you need built-in hybrid search → neither; use Orama or SQLite path

---

### D3: sqlite-vec + better-sqlite3 from Node.js

**Finding:** SQLite FTS5 + sqlite-vec provides the fastest hybrid search path from Node.js (1-3ms estimated at 1K docs) with disk persistence, well-documented RRF patterns, and official better-sqlite3 support. The trade-off is native module dependencies and manual SQL for hybrid queries.

**Evidence:** [evidence/d3-sqlite-vec-better-sqlite3.md](evidence/d3-sqlite-vec-better-sqlite3.md)

#### Setup

[sqlite-vec](https://alexgarcia.xyz/sqlite-vec/js.html) officially lists better-sqlite3 as a first-class binding. Installation is `npm install sqlite-vec better-sqlite3`. Prebuilt binaries for 8 platforms auto-download at install time.

```javascript
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";
const db = new Database("search.db");
sqliteVec.load(db);
```

#### Hybrid Search Patterns

Alex Garcia (sqlite-vec author) published an [authoritative blog post](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) on hybrid search with three methods. The recommended pattern is **Reciprocal Rank Fusion (RRF)** via SQL CTEs:

```sql
WITH fts_matches AS (
  SELECT rowid AS article_id,
    row_number() OVER (ORDER BY rank) AS rank_number
  FROM fts_articles WHERE headline MATCH ?
  LIMIT ?
),
vec_matches AS (
  SELECT article_id,
    row_number() OVER (ORDER BY distance) AS rank_number
  FROM vec_articles
  WHERE headline_embedding MATCH ? AND k = ?
)
SELECT articles.*,
  COALESCE(1.0 / (60 + fts_matches.rank_number), 0.0) * :weight_fts +
  COALESCE(1.0 / (60 + vec_matches.rank_number), 0.0) * :weight_vec
  AS combined_rank
FROM fts_matches
FULL OUTER JOIN vec_matches ON vec_matches.article_id = fts_matches.article_id
JOIN articles ON articles.rowid = COALESCE(fts_matches.article_id, vec_matches.article_id)
ORDER BY combined_rank DESC
```

Vector parameters must be passed as `Float32Array`.

#### Performance

At 100K vectors × 384 dims: 56.65ms brute-force on M1 Pro. Extrapolated to 1K: <1ms. Insert 100K vectors: 1,179ms → 1K: ~12ms. FTS5 at 1M records: 140ms → 1K: <1ms. better-sqlite3's synchronous API eliminates async overhead.

Memory footprint at 1K docs: ~4-6MB database file, ~8MB page cache, ~30MB sqlite-vec allocation. Cold start estimated <50ms.

#### Maturity Risks

sqlite-vec is pre-1.0 (first stable: v0.1.0, August 2024; latest: v0.1.9, March 2026). Brute-force only in stable releases — ANN indexes (IVF, DiskANN) in alpha. Known limitations: KNN filtering applied after top-K (not before), no UPSERT for vec0 tables, Windows has most loading issues.

better-sqlite3 is mature: v12.8.0, ~5M weekly downloads, actively maintained.

**Decision triggers:**
- If you need disk persistence with minimal memory → SQLite is the strongest option
- If you need the fastest hybrid queries → this path wins (1-3ms vs Orama's 5-15ms)
- If you want to avoid SQL and manual score fusion → Orama's API is cleaner
- If Windows support is critical → test thoroughly (sqlite-vec has reported issues)

---

### D4: LanceDB from Node.js

**Finding:** LanceDB offers the most sophisticated hybrid search API from TypeScript but its 91MB native binary and lack of JS-specific benchmarks make it over-engineered for a 1000-document use case.

**Evidence:** [evidence/d4-lancedb-from-nodejs.md](evidence/d4-lancedb-from-nodejs.md)

#### Package and Architecture

[@lancedb/lancedb](https://www.npmjs.com/package/@lancedb/lancedb): v0.27.2, ~636K weekly downloads, Apache-2.0. Rust core with NAPI-RS bindings. True embedded database — no server required. Lance columnar format (claims 100x faster than Parquet for random access).

The native binary is **91MB per platform** — distributed as platform-specific optional npm dependencies. This exceeds standard Lambda zip limits and dominates install size.

#### Hybrid Search API

The TypeScript API is the most ergonomic of any option:

```typescript
const results = await table
  .query()
  .fullTextSearch("search terms")
  .nearestTo(queryVector)
  .rerank(reranker) // RRF by default
  .select(["text"])
  .limit(10)
  .toArray();
```

Lance-native BM25 FTS with fuzzy search, phrase matching, boolean queries. RRFReranker is the default fusion method. Supports custom rerankers.

#### JS Client Maturity

TypeScript is near feature parity with Python (both are thin wrappers around the shared Rust core). [Continue.dev](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/) uses LanceDB from TypeScript in production. Same-day releases alongside Python.

Gaps: all published benchmarks are Python/Rust (no JS-specific numbers), some reranker docs are Python-only, fewer community tutorials for TS.

**Decision triggers:**
- If you're building a vector-heavy application that may scale to 100K+ documents → LanceDB's IVF/HNSW indexes and disk-based storage shine
- If 91MB install size is acceptable and you want the cleanest API → LanceDB
- If lightweight footprint matters for a ~1K-doc tool → Orama or SQLite path is more appropriate

---

### D5: Performance Benchmarks at Target Scale

**Finding:** At 1000 documents, all engines deliver sub-15ms hybrid search. Embedding generation (~80-100 seconds build-time) is the dominant cost regardless of search engine choice. No independent head-to-head benchmark exists at this scale.

**Evidence:** [evidence/d5-performance-benchmarks.md](evidence/d5-performance-benchmarks.md)

#### Estimated Performance at 1000 Documents (~2KB each)

| Metric | Orama (hybrid) | SQLite FTS5 + sqlite-vec | MiniSearch (text only) | LanceDB |
|--------|---------------|--------------------------|----------------------|---------|
| **Index build** | ~150-200ms | <50ms + ~80-100s embed | ~100-250ms | Unknown from JS |
| **Query p50** | 5-15ms | 1-3ms | <0.5ms | Unknown from JS |
| **Memory** | ~5-10MB + 30MB model | ~4-6MB file + ~30MB runtime | ~0.5-1MB | Disk-based |
| **Cold start** | <200ms (no model) | <50ms | <200ms | Unknown (91MB binary) |
| **Persistence** | Plugin (JSON/binary) | Native (SQLite file) | JSON serialization | Native (Lance files) |

Confidence: Mostly INFERRED from confirmed data points extrapolated to 1K scale. The only directly confirmed numbers at ~1K scale are: Orama vector query 5-10ms at ~900 docs ([Nearform](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/)), lunr.js build time 300ms at 1K docs.

#### Embedding Generation: The Real Bottleneck

Regardless of search engine, generating embeddings for 1000 documents (each ~2KB, ~400 words, ~4-5 chunks at 128-token max) takes ~80-100 seconds single-threaded with all-MiniLM-L6-v2 via transformers.js. This is a **one-time build-time cost**, not per-query. Incremental updates (1 changed document) take ~80-100ms.

Per-query embedding generation adds 20-30ms (WASM) or potentially <1ms (native onnxruntime-node on Apple Silicon) to search latency.

#### What's Confirmed vs Estimated

| Claim | Source | Confidence |
|-------|--------|-----------|
| Orama vector query 5-10ms at ~900 docs | Nearform (third-party) | CONFIRMED |
| sqlite-vec 56.65ms at 100K × 384d | Alex Garcia (author) | CONFIRMED |
| FlexSearch "1,000,000x faster" | FlexSearch README (vendor) | VENDOR CLAIM — unverifiable |
| MiniSearch ~500KB memory for 1K docs | MiniSearch docs (vendor) | CONFIRMED |
| No head-to-head benchmark at 1K scale | Negative search | CONFIRMED |

**Remaining uncertainty:** LanceDB has zero published JS-specific benchmarks. FlexSearch's vendor benchmarks show a suspicious 1700x gap vs Orama (likely different methodology/versions).

---

### D6: The Pure TypeScript vs Native Modules Question

**Finding:** There is no performant pure-JS embedding solution. The practical "zero compilation" stack is Orama (pure TS search) + transformers.js (prebuilt native ONNX binaries). At 1000 documents, the native vs pure-TS distinction barely matters for search — but it matters enormously for embedding generation.

**Evidence:** [evidence/d6-pure-ts-vs-native.md](evidence/d6-pure-ts-vs-native.md)

#### Three Paths

**Path A: Pure TypeScript (zero native modules)**
- Search: Orama (pure TS, confirmed zero runtime deps)
- Embeddings: `@tensorflow/tfjs-backend-cpu` — the only pure-JS option, but 10-30x slower than WASM and 100-500x slower than native. Not viable for real-time use.
- Verdict: Technically possible, practically impractical for embedding generation.

**Path B: Prebuilt Native (no compilation required)**
- Search: Orama (pure TS) or better-sqlite3 + sqlite-vec (prebuilt binaries)
- Embeddings: transformers.js → `onnxruntime-node` (~220MB prebuilt binary, no node-gyp)
- Verdict: **The pragmatic sweet spot.** `npm install` works without a C++ toolchain on macOS ARM64, Linux x64, and Windows x64.

**Path C: Full Native (maximum performance)**
- Search: better-sqlite3 + sqlite-vec + hnswlib-node/usearch
- Embeddings: onnxruntime-node
- Verdict: Fastest possible, but requires native modules that may fall back to node-gyp compilation on unusual platforms.

#### Scale Thresholds

| Document Count | Pure TS OK? | Notes |
|---------------|------------|-------|
| 100-1,000 | Yes (with prebuilt native embeddings) | All engines trivially fast |
| 1,000-10,000 | Yes (with prebuilt native embeddings) | Orama handles this. Batch embed time grows linearly |
| 10,000-100,000 | Consider native search | Orama uses ~400MB at 100K. Brute-force vector O(n) |
| 100,000+ | Native recommended | SQLite + sqlite-vec for persistence and ANN indexes |

#### The WASM Middle Ground

WASM-based alternatives exist but are awkward in Node.js:
- `onnxruntime-web` (WASM) is 11-17x slower than native `onnxruntime-node` ([ONNX Runtime #11181](https://github.com/microsoft/onnxruntime/issues/11181))
- transformers.js doesn't officially support WASM backend in Node.js (open feature request [#1406](https://github.com/huggingface/transformers.js/issues/1406))
- No mature WASM search engine exists for Node.js (tantivy-wasm is browser-only POC)

**Decision triggers:**
- If zero native modules is a hard requirement → Orama for search, but accept slow embeddings or use API-generated vectors
- If "no compilation" is the actual requirement → Orama + transformers.js (prebuilt onnxruntime-node)
- If maximum performance matters → better-sqlite3 + sqlite-vec path

---

## Stack Comparison Matrix

| Criterion | Orama + transformers.js | SQLite FTS5 + sqlite-vec | MiniSearch + vector lib | LanceDB |
|-----------|------------------------|--------------------------|------------------------|---------|
| **Hybrid search** | Built-in (weighted sum) | SQL-based (RRF) | Manual assembly | Built-in (RRF) |
| **BM25 quality** | Standard BM25 | FTS5 BM25 | BM25+ (best) | Lance-native BM25 |
| **Vector algorithm** | Brute-force | Brute-force (ANN in alpha) | Depends on lib | IVF/HNSW available |
| **TypeScript DX** | Good (pure TS) | Acceptable (manual types) | Excellent (native TS) | Good (generated types) |
| **Native deps** | None for search; ONNX for embeddings | better-sqlite3 + sqlite-vec | None for search | 91MB Rust binary |
| **Persistence** | Plugin (JSON/binary) | Native (SQLite file) | JSON serialization | Native (Lance format) |
| **Memory (1K docs)** | ~5-10MB | ~4-6MB file | ~0.5-1MB | Disk-based |
| **Install size** | ~220MB (with ONNX) | ~30MB | ~7KB (search only) | ~91MB |
| **npm downloads** | 520K/wk | 5M/wk (better-sqlite3) | 913K/wk | 636K/wk |
| **Scaling ceiling** | ~10K (brute-force) | ~100K+ (ANN coming) | ~10K (text only) | ~1M+ |
| **Setup complexity** | Low | Medium (SQL knowledge) | Low (text) / Medium (hybrid) | Low |
| **Fumadocs precedent** | Yes (default search) | No | No (VitePress uses MiniSearch) | No |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **LanceDB JS-specific performance:** No published benchmarks for cold start, query latency, or NAPI boundary overhead from the JavaScript client. All published numbers are Python/Rust.
- **FlexSearch v0.8 persistent indexing:** The new SQLite/PostgreSQL-backed persistent indexes in FlexSearch v0.8 are undocumented in terms of maturity and performance.
- **Cold start times:** No engine has published cold-start benchmarks (time from process start to first query). Estimates are inferred.

### Out of Scope (per Rubric)

- Cloud-hosted search services (Algolia, Orama Cloud, Typesense Cloud)
- GPU-accelerated search (CUDA, Metal)
- Enterprise-scale systems (Elasticsearch, Meilisearch server)
- Pricing and licensing comparisons
- 1P codebase analysis

---

## References

### Evidence Files
- [evidence/d1-orama-deep-dive.md](evidence/d1-orama-deep-dive.md) — Orama architecture, hybrid search, vector search, persistence, Fumadocs
- [evidence/d2-js-ts-search-libraries.md](evidence/d2-js-ts-search-libraries.md) — MiniSearch, FlexSearch, lunr.js, Fuse.js, search-index comparison
- [evidence/d3-sqlite-vec-better-sqlite3.md](evidence/d3-sqlite-vec-better-sqlite3.md) — SQLite hybrid search from Node.js, RRF patterns, performance
- [evidence/d4-lancedb-from-nodejs.md](evidence/d4-lancedb-from-nodejs.md) — LanceDB TypeScript client, hybrid search API, maturity
- [evidence/d5-performance-benchmarks.md](evidence/d5-performance-benchmarks.md) — Comparative performance data at 1K-doc scale
- [evidence/d6-pure-ts-vs-native.md](evidence/d6-pure-ts-vs-native.md) — Pure TS vs WASM vs native trade-offs, transformers.js

### External Sources
- [Orama GitHub](https://github.com/oramasearch/orama) — Source code and issues
- [MiniSearch GitHub](https://github.com/lucaong/minisearch) — Source and design document
- [FlexSearch GitHub](https://github.com/nextapps-de/flexsearch) — Source and benchmarks
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — Source, docs, and issues
- [sqlite-vec Hybrid Search Blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — RRF patterns
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — Package and performance docs
- [LanceDB GitHub](https://github.com/lancedb/lancedb) — Source and docs
- [LanceDB Hybrid Search docs](https://docs.lancedb.com/search/hybrid-search) — TypeScript API
- [transformers.js docs](https://huggingface.co/docs/transformers.js/index) — Embedding generation
- [transformers.js v4 blog](https://huggingface.co/blog/transformersjs-v4) — Latest version
- [Nearform Browser Vector Search](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/) — Orama performance at ~900 docs
- [Fumadocs Orama Search](https://www.fumadocs.dev/docs/headless/search/orama) — Integration docs
- [ONNX Runtime #11181](https://github.com/microsoft/onnxruntime/issues/11181) — WASM vs native performance
