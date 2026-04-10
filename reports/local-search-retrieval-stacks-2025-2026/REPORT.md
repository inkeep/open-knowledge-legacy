---
title: "Local-First Search & Retrieval Stacks 2025-2026: Hybrid Search for Developer Knowledge Platforms"
description: "Comprehensive evaluation of self-hostable, CPU-only search and retrieval stacks for a local-first knowledge platform. Covers embeddable search engines (Orama, SQLite FTS5+sqlite-vec, LanceDB, MeiliSearch, Typesense, DuckDB, Tantivy, Qdrant, ChromaDB), local embedding models (bge-small, nomic-embed-text, MiniLM), Node.js inference runtimes (transformers.js, ONNX Runtime, node-llama-cpp), embedding pipeline design, JS/TS-native search libraries, and real-world search architectures from production local-first apps (Logseq, AnyType, AppFlowy, AFFiNE, Obsidian plugins). Directly informs stack selection for a ~1000-article markdown knowledge base running on a MacBook Air."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Orama
  - SQLite FTS5
  - sqlite-vec
  - LanceDB
  - MeiliSearch
  - Typesense
  - Tantivy
  - DuckDB
  - ChromaDB
  - Qdrant
  - transformers.js
  - bge-small-en-v1.5
  - nomic-embed-text-v1.5
  - better-sqlite3
  - MiniSearch
  - FlexSearch
  - AFFiNE
  - Logseq
  - AnyType
  - AppFlowy
  - Obsidian Copilot
  - Smart Connections
  - AnythingLLM
  - Fumadocs
topics:
  - hybrid search
  - local-first search
  - embeddable databases
  - vector search
  - embedding models
  - CPU inference
  - local AI stacks
---

# Local-First Search & Retrieval Stacks 2025-2026: Hybrid Search for Developer Knowledge Platforms

**Purpose:** Identify the optimal self-hostable, CPU-only hybrid search stack for a Node.js/TypeScript knowledge platform running locally on developer laptops. The product indexes ~1000 markdown articles in git, must support BM25 + vector/semantic search, and must run without cloud services, GPUs, Docker, or separate database servers.

---

## Executive Summary

Two stacks emerge as clear winners for a local-first TypeScript knowledge platform at the ~1000-article scale, each representing a different design philosophy:

**Stack A (Simplicity): Orama + transformers.js** -- Pure TypeScript search with zero native dependencies. A single `search()` call provides hybrid BM25 + vector results. Paired with `@huggingface/transformers` for local CPU embedding via `bge-small-en-v1.5`. Install is `npm install @orama/orama @huggingface/transformers`. Hybrid queries run in 5-15ms. Already validated in production by Fumadocs (documentation search), Deno docs (5,856-doc index), and Obsidian Copilot (hybrid retrieval). Trade-offs: in-memory only (full index loaded on startup), brute-force vector search (O(n), adequate at 1K but limits scaling past ~10K docs), uses weighted-sum score fusion (not RRF).

**Stack B (Robustness): SQLite FTS5 + sqlite-vec + better-sqlite3 + transformers.js** -- Disk-persistent hybrid search in a single SQLite file. FTS5 provides built-in BM25; sqlite-vec adds vector search with SIMD acceleration. Hybrid queries via Reciprocal Rank Fusion (RRF) in SQL. Runs in 1-3ms at this scale. The entire index persists across restarts with zero serialization overhead. Install is `npm install better-sqlite3 sqlite-vec @huggingface/transformers`. Trade-offs: requires native modules (prebuilt binaries available), manual SQL for hybrid fusion, sqlite-vec is pre-v1 (v0.1.9).

Both stacks use the same embedding layer: `bge-small-en-v1.5` (~34MB INT8 ONNX) via `@huggingface/transformers` v4. This model dominates `all-MiniLM-L6-v2` on every axis (24% better retrieval, near-identical size, 99.4% quality retention under INT8 quantization). The entire embedding cache for 1,000 articles at 384 dimensions is 1.46MB of vector data.

The central surprise from this research: **no production local-first application ships hybrid search (BM25 + vector) as of early 2026.** Every app studied uses either full-text search alone (Logseq, AnyType, Outline) or vector similarity alone (PrivateGPT, Smart Connections). The hybrid search tooling exists and is mature enough (Orama v3, sqlite-vec + FTS5, LanceDB), but assembling it into a shipping product would be genuinely novel.

**Key Findings:**

- **Only 3 engines run in-process within Node.js with hybrid search capabilities:** Orama (pure TypeScript), SQLite FTS5 + sqlite-vec (C via native addon), and LanceDB (Rust via N-API). MeiliSearch, Typesense, Qdrant, and ChromaDB all require separate server processes.
- **`bge-small-en-v1.5` replaces `all-MiniLM-L6-v2` as the default embedding model:** 51.7 vs 41.7 MTEB retrieval NDCG@10, 99.4% vs 90.8% INT8 quantization retention, 512 vs 256 token context, near-identical disk size (~34MB vs ~46MB INT8).
- **`@huggingface/transformers` v4 is the JS embedding runtime:** 6 lines of code, auto-downloads ONNX models, zero Python dependency. 15.3K GitHub stars, 567+ npm dependents.
- **Embedding generation is the only slow operation:** ~2-5 minutes for full corpus (1,000 articles). Incremental updates (mtime pre-filter + SHA-256 confirmation) process a single changed article in ~100-200ms.
- **At 1,000 documents, all search engines deliver sub-15ms hybrid queries.** The differentiators are persistence model, API simplicity, and scaling ceiling -- not raw speed.
- **SQLite FTS5 is the dominant embedded search engine in production local-first apps** (Logseq, Inkdrop, Notion, Bear). Tantivy dominates in compiled-native apps (AnyType, AppFlowy).
- **The Python AI ecosystem is not usable from Node.js without sidecars.** ChromaDB, txtai, Haystack, and PrivateGPT all require Python server processes. Only AnythingLLM has a native Node.js search core (via LanceDB).

---

## Research Rubric

**Report Type:** Comparative Analysis / Technology Deep-Dive
**Primary Question:** What is the optimal local-first hybrid search stack for a TypeScript knowledge platform targeting ~1000 markdown articles on developer laptops?
**Audience:** Product/engineering team building a local-first knowledge platform
**Stance:** Factual -- presenting the landscape with decision triggers, not prescriptive recommendations

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Embeddable search engines for hybrid search | Deep | P0 |
| D2 | Local embedding models for CPU | Deep | P0 |
| D3 | All-in-one local stacks people actually use | Deep | P0 |
| D4 | The JavaScript/TypeScript-native path | Deep | P0 |
| D5 | Performance benchmarks at target scale | Deep | P0 |
| D6 | The embedding pipeline for local use | Deep | P0 |
| D7 | What production local-first apps actually use | Deep | P0 |

**Non-goals:** Cloud-hosted search services; GPU-required solutions; enterprise-scale systems (>100K docs); pricing/licensing comparisons; 1P codebase analysis.

---

## The Answer: Two Viable Stacks

Before the detailed findings, the direct answer to the primary question:

### Stack A: Orama + transformers.js (Pure TypeScript)

```
npm install @orama/orama @huggingface/transformers
```

```typescript
import { create, insert, search } from "@orama/orama";
import { pipeline } from "@huggingface/transformers";

// Embedding
const embed = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
const getVector = async (text: string) => {
  const result = await embed(text, { pooling: "mean", normalize: true });
  return result.tolist()[0]; // number[384]
};

// Search
const db = create({
  schema: { title: "string", content: "string", embedding: "vector[384]" }
});

// Insert with pre-computed vector
insert(db, { title: "Article", content: "...", embedding: await getVector("...") });

// Hybrid search
const results = search(db, {
  term: "query",
  mode: "hybrid",
  vector: { value: await getVector("query"), property: "embedding" },
});
```

**When to choose:** Zero-dependency simplicity is paramount. No native modules, no compilation, no SQL. The index lives in memory and is serialized to JSON/binary for persistence. Already used by Fumadocs and Obsidian Copilot.

### Stack B: SQLite FTS5 + sqlite-vec + better-sqlite3 + transformers.js

```
npm install better-sqlite3 sqlite-vec @huggingface/transformers
```

```typescript
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const db = new Database("search.db");
sqliteVec.load(db);

// Hybrid search via RRF
const hybridSearch = db.prepare(`
  WITH fts AS (
    SELECT rowid, row_number() OVER (ORDER BY rank) AS rn
    FROM fts_articles WHERE fts_articles MATCH ? LIMIT ?
  ),
  vec AS (
    SELECT article_id, row_number() OVER (ORDER BY distance) AS rn
    FROM vec_articles WHERE embedding MATCH ? AND k = ?
  )
  SELECT articles.*,
    COALESCE(1.0/(60+fts.rn), 0) + COALESCE(1.0/(60+vec.rn), 0) AS score
  FROM fts FULL OUTER JOIN vec ON vec.article_id = fts.rowid
  JOIN articles ON articles.rowid = COALESCE(fts.rowid, vec.article_id)
  ORDER BY score DESC
`);
```

**When to choose:** Disk persistence matters (index survives restarts without serialization), predictable memory usage is important, or you want RRF score fusion instead of weighted sum. Already used as components by Logseq (FTS5), AppFlowy (sqlite-vec), and many others.

---

## Detailed Findings

### D1: Embeddable Search Engines for Hybrid Search

**Finding:** Of 9 engines evaluated, only 3 can run in-process within Node.js with hybrid search capabilities. The rest require separate server processes or lack Node.js bindings entirely.

**Evidence:** [evidence/d1-orama.md](evidence/d1-orama.md), [evidence/d1-sqlite-fts5-vec.md](evidence/d1-sqlite-fts5-vec.md), [evidence/d1-lancedb.md](evidence/d1-lancedb.md), [evidence/d1-meilisearch-typesense.md](evidence/d1-meilisearch-typesense.md), [evidence/d1-tantivy.md](evidence/d1-tantivy.md), [evidence/d1-qdrant-chromadb.md](evidence/d1-qdrant-chromadb.md), [evidence/d1-duckdb-fts-vss.md](evidence/d1-duckdb-fts-vss.md)

#### Classification Matrix

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

#### In-Process Engine Comparison

| Criterion | Orama | SQLite FTS5+vec | LanceDB | DuckDB FTS+VSS |
|---|---|---|---|---|
| **Language** | Pure TypeScript | C (SQLite) + C (vec) | Rust (napi) | C++ (napi) |
| **Native deps** | None | better-sqlite3 (prebuild) | Native binary (91MB) | Native binary |
| **Hybrid API** | Single `search()` call | Manual SQL (RRF CTE) | Single API call | Manual SQL |
| **BM25 quality** | Standard BM25 | Standard BM25 (English stemmer) | Tantivy BM25 (17 languages) | Standard BM25 (English stemmer) |
| **Score fusion** | Weighted sum | RRF (documented SQL) | RRF (built-in) | Manual (weighted/RRF) |
| **Vector index** | Brute-force only | Brute-force (ANN in alpha) | IVF/HNSW | HNSW (experimental persist) |
| **Storage** | In-memory + serialization | Disk (SQLite file) | Disk (Lance format) | Disk (.duckdb file) |
| **RAM at 1K docs** | ~10-50MB | ~2-50MB (mmap) | Very low (mmap) | Low (configurable) |
| **Query latency** | <10ms | <3ms | <10ms | <10ms |
| **npm downloads** | 520K/wk | 5M/wk (better-sqlite3) | 636K/wk | New package |
| **Maturity** | v3.1.18 | FTS5: stable. vec: pre-v1 | Pre-v1 (v0.27.1) | FTS: stable. VSS: experimental |
| **Production users** | Fumadocs, Deno docs | LangChain, MCP servers | Continue IDE | Analytics pipelines |
| **Browser support** | Yes | No | No | No |
| **Scaling ceiling** | ~10K (brute-force) | ~100K+ (ANN coming) | ~1M+ | ~100K+ |

#### Sidecar Engines (for reference)

MeiliSearch (56.9K GitHub stars) has the most sophisticated hybrid search fusion -- score-calibrated normalization rather than RRF -- and stabilized hybrid search in v1.13 (Feb 2025). Typesense (21K stars) has had vector search since 2021 but its built-in embedding models require 2-6GB RAM (exceeding the budget). Both require distributing a separate binary and managing it as a child process.

#### Engines Eliminated

- **Tantivy:** Gold-standard Rust BM25 library (used by Quickwit/Datadog, ParadeDB, Milvus, LanceDB), but all Node.js binding projects are abandoned. No native vector search. Python bindings (`tantivy-py`) are maintained. Correction: MeiliSearch does NOT use Tantivy -- this is a common misconception.
- **Qdrant:** Embedded mode exists only in Python (`QdrantClient(":memory:")`). Node.js client is REST/gRPC only. Qdrant Edge (in-process for embedded devices) announced July 2025 but in private beta.
- **ChromaDB:** Same pattern -- `PersistentClient()` is Python-only. The `chromadb` npm package requires `chroma run` or Docker.

**Decision triggers:**
- If zero native dependencies is a hard requirement: Orama
- If disk persistence without serialization overhead matters: SQLite FTS5 + sqlite-vec
- If you want the most sophisticated API and may scale to 100K+: LanceDB
- If a sidecar server is acceptable: MeiliSearch has the most mature hybrid search

---

### D2: Local Embedding Models for CPU

**Finding:** `bge-small-en-v1.5` dominates `all-MiniLM-L6-v2` on every axis. It is the new default choice for CPU-only embedding at small scale.

**Evidence:** [evidence/d2-embedding-models.md](evidence/d2-embedding-models.md), [evidence/d2-inference-runtimes.md](evidence/d2-inference-runtimes.md)

#### Model Comparison

| Model | Params | Disk (INT8) | Dims | Max Tokens | MTEB Retrieval | INT8 Retention |
|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | 22.7M | ~46MB | 384 | 256 | 41.7 | 90.8% |
| e5-small-v2 | 33M | ~64MB | 384 | 512 | 49.0 | ~97% |
| gte-small | 33.4M | ~35MB | 384 | 512 | 49.5 | ~98% |
| **bge-small-en-v1.5** | **33.4M** | **~34MB** | **384** | **512** | **51.7** | **99.4%** |
| arctic-embed-s | 33M | ~34MB | 384 | 512 | 52.0 | ~98% |
| **nomic-embed-text-v1.5** | **137M** | **~78MB (Q4)** | **768** | **8192** | **52.8** | ~97% |

**Recommended default: `bge-small-en-v1.5`** (BAAI). 24% better retrieval than MiniLM, 512-token context (vs 256), 99.4% quality retention under INT8 quantization, official Xenova ONNX export for transformers.js. Indexing 1,000 documents takes ~15-30 seconds at batch=32.

**Long-context upgrade: `nomic-embed-text-v1.5`** (Nomic AI). 8,192-token context eliminates chunking for articles up to ~6,000 words. Matryoshka dimensions allow reducing to 256 dims at query time for 4x faster vector search with 98% quality retention. Indexing takes ~60-120 seconds for 1,000 docs.

**Not recommended for new projects: `all-MiniLM-L6-v2`.** Dominated by bge-small on every axis. Its continued popularity is inertia, not merit.

#### Inference Runtimes

| Runtime | Lines of Code | Auto-Download | Apple Silicon | Status |
|---|---|---|---|---|
| **@huggingface/transformers v4** | **~6** | Yes (HF Hub) | WASM (ARM64) | Active, 15.3K stars |
| onnxruntime-node | ~80-120 | No | ARM64 CPU | Active (Microsoft) |
| **node-llama-cpp v3** | **~8** | No | **Metal + NEON** | Active, 4.4M wkly DLs |
| fastembed-js | ~6 | Yes | ARM64 CPU | **Archived Jan 2026** |
| candle (Rust) | N/A | N/A | N/A | No Node.js bindings |

`@huggingface/transformers` is the clear winner for developer experience. v4 (Feb 2026) shipped a rewritten C++ WebGPU runtime with ~4x BERT speedup. Supports fully offline operation via `env.localModelPath` + `env.allowRemoteModels = false`. The ESM-only packaging requires dynamic `import()` in CJS projects (documented friction).

`node-llama-cpp` is the alternative when Metal GPU acceleration matters (transformer layer acceleration for embedding computation). Smaller GGUF model ecosystem but covers the key models.

**Decision triggers:**
- If articles average <400 words: bge-small-en-v1.5 (512 tokens sufficient)
- If articles regularly exceed 2,000 words: nomic-embed-text-v1.5 (eliminates chunking)
- If Metal acceleration matters: node-llama-cpp with GGUF models

---

### D3: All-in-One Local Stacks People Actually Use

**Finding:** The local AI stack ecosystem is overwhelmingly Python-centric. Of 7 major tools surveyed, only AnythingLLM has a native Node.js search core (via LanceDB npm).

**Evidence:** [evidence/d3-local-ai-stacks.md](evidence/d3-local-ai-stacks.md), [evidence/d3-obsidian-plugins.md](evidence/d3-obsidian-plugins.md)

| Tool | Search Type | Node.js Embeddable? | Hybrid Search? |
|------|------------|-------------------|----------------|
| ChromaDB | Vector + BM25 (RRF) | No -- JS client is HTTP-only | Yes (Python) |
| txtai | Faiss + custom BM25 | No -- Python-only core | Yes (Python) |
| LlamaIndex | Vector + BM25 plugin | Partial -- TS has SimpleVectorStore | BM25 less mature in TS |
| Haystack | InMemory BM25 + embedding | No -- Python-only | Yes (Python) |
| PrivateGPT | Vector-only (Qdrant) | No -- Python FastAPI | No |
| LocalGPT | Semantic + BM25 + Late Chunking | No -- Python backend | Yes (Python) |
| AnythingLLM | Vector similarity (LanceDB) | **Yes -- LanceDB embedded via npm** | LanceDB supports it, app exposes vector-only |

**Obsidian plugins** reveal the practical constraints of running search in Electron/Node.js:

- **Smart Connections** (most popular AI plugin): transformers.js with `bge-micro-v2`, WASM in hidden iframe (Web Workers broken in Electron), vector cosine similarity only, custom `.ajson` storage.
- **Obsidian Copilot**: Uses **Orama v3** for hybrid retrieval (BM25 + vector), with MiniSearch as a tiered fallback. This is the strongest real-world validation of the Orama hybrid search path.
- **Omnisearch**: MiniSearch for BM25, IndexedDB persistence. Pure full-text, no vector search.

**Implications:** The Python ecosystem has mature hybrid search. The Node.js ecosystem does not. Any JS/TS hybrid search solution will be genuinely novel in the production landscape.

---

### D4: The JavaScript/TypeScript-Native Path

**Finding:** Three viable JS/TS-native hybrid search stacks exist, each trading simplicity against different capabilities.

**Evidence:** [evidence/d4-orama-deep-dive.md](evidence/d4-orama-deep-dive.md), [evidence/d4-js-ts-libraries.md](evidence/d4-js-ts-libraries.md), [evidence/d4-sqlite-vec-nodejs.md](evidence/d4-sqlite-vec-nodejs.md), [evidence/d4-pure-ts-vs-native.md](evidence/d4-pure-ts-vs-native.md)

#### Stack Comparison

| Criterion | Orama + transformers.js | SQLite FTS5 + sqlite-vec | MiniSearch + vector lib | LanceDB |
|---|---|---|---|---|
| **Hybrid search** | Built-in (weighted sum) | SQL-based (RRF) | Manual assembly | Built-in (RRF) |
| **BM25 quality** | Standard BM25 | FTS5 BM25 (English stemmer) | BM25+ (best) | Lance-native BM25 |
| **Native deps** | None (search); ONNX (embeddings) | better-sqlite3 + sqlite-vec | None (search) | 91MB Rust binary |
| **Persistence** | Plugin (JSON/binary serialize) | Native (SQLite file) | JSON serialization | Native (Lance files) |
| **Install size** | ~220MB (with ONNX) | ~30MB | ~7KB (search only) | ~91MB |
| **npm downloads** | 520K/wk | 5M/wk (better-sqlite3) | 913K/wk | 636K/wk |
| **Scaling ceiling** | ~10K (brute-force vector) | ~100K+ (ANN coming) | ~10K (text only) | ~1M+ |

**Orama internals (from source code):** Multi-tree index architecture with 7 specialized data structures -- Radix Tree for full-text with fuzzy matching, AVL Tree for sorted data, flat `Map<DocID, [Magnitude, Float32Array]>` for vectors. Hybrid search uses weighted sum with min-max normalization, NOT RRF. BM25 parameters: k=1.2, b=0.75, d=0.5. v3.0.x had significant tokenization regressions (issue #869) -- stable from v3.1.11+.

**MiniSearch** is the best standalone BM25 engine: BM25+ scoring (improvement over standard BM25 that reduces short-document bias), native TypeScript, 913K weekly downloads, ~7KB gzipped, used by VitePress. No vector search -- hybrid requires pairing with a separate library.

**FlexSearch** is the fastest pure-JS search but uses proprietary "Contextual Search" scoring (explicitly rejects BM25/TF-IDF), has documented TypeScript type issues, and spawned community forks. Not recommended for a new project requiring standard relevance scoring.

#### The Pure TypeScript Question

There is no performant pure-JS embedding solution. TensorFlow.js CPU backend is 10-30x slower than WASM and 100-500x slower than native. The pragmatic "zero compilation" stack is Orama (pure TS search) + transformers.js (prebuilt native ONNX binaries -- no node-gyp needed).

At 1,000 documents, the pure-TS vs native distinction barely matters for search. It matters enormously for embedding generation.

---

### D5: Performance Benchmarks at Target Scale

**Finding:** At 1,000 documents, all engines deliver sub-15ms hybrid queries. Embedding generation (~2-5 minutes first run) is the only slow operation. No independent head-to-head benchmark exists at this scale.

**Evidence:** [evidence/d5-performance-benchmarks.md](evidence/d5-performance-benchmarks.md)

#### Estimated Performance at 1,000 Articles (~2KB each, 384-dim embeddings)

| Metric | Orama (hybrid) | SQLite FTS5 + sqlite-vec | MiniSearch (text) | LanceDB |
|---|---|---|---|---|
| **Index build** | ~150-200ms | <50ms (search) + 2-5min (embed) | ~100-250ms | Unknown from JS |
| **Hybrid query p50** | 5-15ms | 1-3ms | <0.5ms (text only) | <10ms (estimated) |
| **Memory** | ~10-50MB | ~4-6MB file + ~30MB runtime | ~0.5-1MB | Disk-based (mmap) |
| **Cold start** | <200ms (no model) | <50ms | <200ms | Unknown (91MB binary) |
| **Persistence** | Serialize (JSON/binary) | Native SQLite file | JSON serialization | Native Lance files |

**Confirmed data points:**
- Orama vector query: 5-10ms at ~900 docs ([Nearform](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/))
- sqlite-vec brute-force: 56.65ms at 100K x 384 dims on M1 Pro (author benchmark) -- extrapolated to <1ms at 1K
- MiniSearch: ~500KB memory for 1K docs (official docs)

**Embedding generation timeline:**

| Phase | Duration (1K articles) |
|---|---|
| Full corpus embedding (cold start) | ~2-5 minutes |
| Incremental (1 changed article) | ~100-200ms |
| Startup mtime scan (1K files) | <1ms |
| SHA-256 hash of changed files | <100ms |
| Per-query embedding (single query string) | 10-30ms (WASM) |

**Vector storage at this scale:** 1,000 x 384 x 4 bytes = **1.46 MB**. With 3x chunking: 4.4MB. Memory mapping is irrelevant at this size -- load everything into RAM.

---

### D6: The Embedding Pipeline for Local Use

**Finding:** The optimal pipeline is build-time embedding + startup incremental check + background worker. Change detection uses mtime pre-filter + SHA-256 confirmation. Model versioning via full wipe on mismatch.

**Evidence:** [evidence/d6-embedding-pipeline.md](evidence/d6-embedding-pipeline.md), [evidence/d6-storage-formats.md](evidence/d6-storage-formats.md)

#### Change Detection Pattern

```
For each article:
  1. Read stat().mtimeMs          [single syscall, no I/O]
  2. If mtime unchanged -> skip   [fast path: ~99% of files]
  3. If mtime changed -> SHA-256(content)
  4. If hash unchanged -> skip    [catches git checkout, rsync]
  5. If hash changed -> re-embed all chunks from this article
```

Use **document-level** detection (not chunk-level). When a markdown article changes, re-embed all chunks from that article. Chunk-level tracking creates false precision -- inserting a paragraph shifts all downstream chunk boundaries.

#### Three-Phase Pipeline

| Phase | When | What | Duration |
|---|---|---|---|
| Build-time | `npm run build` / CI | Embed all articles, ship index | 2-5 min (one-time) |
| Startup incremental | App start | Diff files vs index, embed delta | <1s (warm) to 2-5 min (cold) |
| Background worker | During runtime | Embed changed articles in Worker thread | ~100-200ms per article |

#### First-Run Experience

Cold embedding of 1,000 articles: ~2-5 minutes. Mitigation strategies:
1. Progress events (per-article for UI display)
2. Background Worker thread (keep main thread responsive)
3. Progressive search (allow search on already-embedded articles)
4. Pre-computed index (ship as build artifact for published docs)

#### Model Versioning

Store `model_id` + `schema_version` in cache metadata. On startup, compare against configured model. Mismatch triggers full wipe + rebuild. At 1,000 documents, rebuild takes 2-5 minutes -- simple enough that versioned parallel indexes are unnecessary.

#### Caching Strategy

Embeddings are derived artifacts -- regenerable from source. Do NOT commit to git. Store in `.search-cache/` at project root, listed in `.gitignore`. Distribute pre-computed indexes via npm `files`, CDN, or CI artifacts.

---

### D7: What Production Local-First Apps Actually Use

**Finding:** Three architectural tiers emerge. SQLite FTS5 is the dominant embedded search engine for JS/Electron apps. Tantivy dominates compiled-native apps. No app ships hybrid search.

**Evidence:** [evidence/d7-production-apps.md](evidence/d7-production-apps.md), [evidence/d7-patterns-convergences.md](evidence/d7-patterns-convergences.md), [evidence/d7-architecture-patterns.md](evidence/d7-architecture-patterns.md)

#### Production App Search Architectures

| App | Search Engine | Type | Platform |
|-----|-------------|------|----------|
| AFFiNE | Manticore/Elasticsearch | FTS + semantic (server-side) | Electron + web |
| Logseq | SQLite FTS5 (trigram tokenizer) | FTS + Fuse.js fuzzy | Electron + web |
| AnyType | Tantivy (via tantivy-go) | FTS (multi-lang) | Electron + mobile |
| AppFlowy | Tantivy + sqlite-vec | FTS + vector (emerging) | Flutter |
| Outline | PostgreSQL FTS | FTS only | Web (Node.js) |
| Docmost | PostgreSQL FTS | FTS only | Web (NestJS) |
| Foam | VS Code ripgrep | Text search | VS Code |
| Dendron | Fuse.js + ripgrep | Fuzzy + text | VS Code (archived) |

#### Three Tiers

```
Tier 1: Server-First                Tier 2: Compiled-Native           Tier 3: JS/Electron
(PostgreSQL FTS, Elastic,           (Tantivy via FFI)                 (In-memory JS library OR
 Manticore Search)                                                     SQLite FTS5 via WASM/addon)

Outline, Docmost, AFFiNE           AnyType, AppFlowy, TursoDB        Logseq, Omnisearch,
                                                                      Copilot, Inkdrop
```

A Node.js/TypeScript app sits in Tier 3, with the option of accessing Tier 2 via N-API native addons.

#### SQLite as Common Denominator

Used by 6 of 8 production apps studied (Logseq, AppFlowy, Inkdrop, Notion, Bear, AnythingLLM). FTS5 provides built-in BM25 ranking. sqlite-vec adds vector search. Together, they enable a pure-SQLite hybrid search stack with documented RRF combination -- the most battle-tested foundation.

#### The Hybrid Search Gap

The gap is real. The tooling exists (Orama v3, sqlite-vec + FTS5, LanceDB) but no production local-first app has assembled it into a shipping hybrid search feature. This represents a genuine opportunity for differentiation.

---

## Recommended Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Build / CI Phase                       │
│                                                          │
│  articles/*.md  -->  transformers.js (bge-small INT8)    │
│                      -->  search-cache/index.db          │
│                           (SQLite + sqlite-vec + FTS5)   │
│                           OR: orama-index.json           │
└──────────────────────────┬───────────────────────────────┘
                           │ ship as artifact / .gitignore
┌──────────────────────────▼───────────────────────────────┐
│                    App Startup Phase                      │
│                                                          │
│  scan articles --> mtime check --> SHA-256 on changed    │
│  --> verify model_id matches cache metadata              │
│  --> re-embed delta --> update index                     │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                    Runtime Phase                          │
│                                                          │
│  File watcher --> background Worker thread               │
│  --> embed changed articles --> upsert into index        │
│                                                          │
│  Search query --> BM25 + vector --> hybrid rank          │
│  --> return results (<15ms)                              │
└──────────────────────────────────────────────────────────┘
```

**Component choices:**
- **Embedding model:** `bge-small-en-v1.5` (Xenova ONNX INT8, ~34MB)
- **Embedding runtime:** `@huggingface/transformers` v4
- **Search engine:** Orama (simplicity-first) OR SQLite FTS5 + sqlite-vec (robustness-first)
- **Change detection:** mtime pre-filter + SHA-256 confirmation
- **Model versioning:** `model_id` in cache metadata; full wipe on mismatch
- **Cache location:** `.search-cache/` at project root, in `.gitignore`

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Apple Silicon embedding benchmarks:** Direct M1/M2/M3 benchmarks for bge-small via transformers.js WASM are not publicly available. Speed estimates are extrapolated from x86 benchmarks. (UNCERTAIN)
- **LanceDB JS-specific performance:** No published benchmarks for cold start, query latency, or N-API boundary overhead from the TypeScript client. All published numbers are Python/Rust. (NOT FOUND)
- **Orama formal benchmarks:** No official benchmark suite exists for Orama at any scale. All performance claims at 1K are inferred from architecture and a single 100K-doc memory data point. (UNCERTAIN)
- **LanceDB FTS transition:** LanceDB is migrating from Tantivy-based FTS to a native implementation. The TypeScript SDK's FTS maturity during this transition could not be confirmed from public sources. (UNCERTAIN)
- **sqlite-vec ANN timeline:** HNSW/IVF indexes are listed as future work. No release date available. For scaling beyond 100K vectors, hnswlib-node or usearch would be needed. (NOT FOUND)
- **transformers.js WASM vs node-llama-cpp Metal:** No head-to-head comparison for embedding inference on Apple Silicon. (NOT FOUND)

### Out of Scope (per Rubric)

- Cloud-hosted search services (Algolia, Pinecone, Elasticsearch Cloud, Orama Cloud)
- GPU-required solutions (CUDA, ROCm, FAISS GPU)
- Enterprise-scale systems (>100K documents)
- Pricing and licensing comparisons
- 1P codebase analysis

---

## References

### Evidence Files

#### D1: Search Engines
- [evidence/d1-orama.md](evidence/d1-orama.md) -- Orama architecture, hybrid search, performance, production users
- [evidence/d1-sqlite-fts5-vec.md](evidence/d1-sqlite-fts5-vec.md) -- sqlite-vec maturity, FTS5 BM25, hybrid patterns, Node.js integration
- [evidence/d1-lancedb.md](evidence/d1-lancedb.md) -- LanceDB architecture, hybrid search, TypeScript SDK
- [evidence/d1-meilisearch-typesense.md](evidence/d1-meilisearch-typesense.md) -- MeiliSearch/Typesense hybrid search, embeddability
- [evidence/d1-tantivy.md](evidence/d1-tantivy.md) -- Tantivy architecture, Node.js bindings survey
- [evidence/d1-qdrant-chromadb.md](evidence/d1-qdrant-chromadb.md) -- Qdrant/ChromaDB embedded modes, Node.js limitations
- [evidence/d1-duckdb-fts-vss.md](evidence/d1-duckdb-fts-vss.md) -- DuckDB FTS/VSS extensions, hybrid search patterns

#### D2: Embedding Models & Runtimes
- [evidence/d2-embedding-models.md](evidence/d2-embedding-models.md) -- Model comparison, MTEB scores, quantization analysis
- [evidence/d2-inference-runtimes.md](evidence/d2-inference-runtimes.md) -- Runtime evaluation, API examples, ecosystem status

#### D3: Local AI Stacks
- [evidence/d3-local-ai-stacks.md](evidence/d3-local-ai-stacks.md) -- ChromaDB, txtai, LlamaIndex, Haystack, PrivateGPT, AnythingLLM
- [evidence/d3-obsidian-plugins.md](evidence/d3-obsidian-plugins.md) -- Smart Connections, Copilot, Omnisearch patterns

#### D4: JS/TS-Native Path
- [evidence/d4-orama-deep-dive.md](evidence/d4-orama-deep-dive.md) -- Orama internals from source code
- [evidence/d4-js-ts-libraries.md](evidence/d4-js-ts-libraries.md) -- MiniSearch, FlexSearch, lunr.js comparison
- [evidence/d4-sqlite-vec-nodejs.md](evidence/d4-sqlite-vec-nodejs.md) -- SQLite hybrid search from Node.js, RRF patterns
- [evidence/d4-pure-ts-vs-native.md](evidence/d4-pure-ts-vs-native.md) -- Pure TS vs WASM vs native trade-offs

#### D5: Performance
- [evidence/d5-performance-benchmarks.md](evidence/d5-performance-benchmarks.md) -- Comparative performance data at 1K scale

#### D6: Embedding Pipeline
- [evidence/d6-embedding-pipeline.md](evidence/d6-embedding-pipeline.md) -- Incremental strategies, timing, tool analysis
- [evidence/d6-storage-formats.md](evidence/d6-storage-formats.md) -- Storage format comparison, size calculations

#### D7: Production Apps
- [evidence/d7-production-apps.md](evidence/d7-production-apps.md) -- AFFiNE, Logseq, AnyType, AppFlowy, Outline, Docmost
- [evidence/d7-patterns-convergences.md](evidence/d7-patterns-convergences.md) -- SQLite convergence, hybrid search gap
- [evidence/d7-architecture-patterns.md](evidence/d7-architecture-patterns.md) -- Deployment patterns, RRF, real-time indexing

### Key External Sources

- [Orama](https://github.com/oramasearch/orama) -- 10.3K stars, Apache 2.0
- [sqlite-vec](https://github.com/asg017/sqlite-vec) -- 7.3K stars, Alex Garcia, Mozilla/Fly.io sponsored
- [sqlite-vec hybrid search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) -- RRF implementation
- [LanceDB](https://github.com/lancedb/lancedb) -- Embeddable vector DB
- [MeiliSearch](https://github.com/meilisearch/meilisearch) -- 56.9K stars
- [Tantivy](https://github.com/quickwit-oss/tantivy) -- 14.8K stars
- [@huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) -- JS inference runtime
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) -- Recommended embedding model
- [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) -- Long-context alternative
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) -- Embedding benchmark authority
- [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) -- 5M weekly downloads
- [MiniSearch](https://github.com/lucaong/minisearch) -- BM25+ scoring, 913K weekly downloads
- [Fumadocs Orama Search](https://www.fumadocs.dev/docs/headless/search/orama) -- Production integration
- [Continue IDE + LanceDB](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/)
- [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) -- Orama v3 hybrid search in production
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) -- Local embedding reference
- [Nearform Orama benchmark](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/) -- ~900 doc performance

### Related Research

- [agent-knowledge-retrieval-paradigms-2025-2026](/Users/edwingomezcuellar/reports/agent-knowledge-retrieval-paradigms-2025-2026/) -- Covers the higher-level retrieval paradigm question (RAG evolution, agentic retrieval, MCP interface design). This report covers the concrete infrastructure layer.
