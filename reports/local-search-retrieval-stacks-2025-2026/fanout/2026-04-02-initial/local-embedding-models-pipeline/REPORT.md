---
title: "Local Embedding Models & Pipeline Design for CPU-Only Node.js Knowledge Platforms"
description: "Deep investigation of embedding models, inference runtimes, pipeline architecture, and storage formats for a local-first TypeScript knowledge platform running on MacBook Air. Covers model selection (MiniLM, BGE, GTE, nomic-embed, arctic-embed, E5), Node.js runtimes (transformers.js, ONNX Runtime, node-llama-cpp), incremental embedding strategies, and vector storage (sqlite-vec, raw binary, LanceDB, HNSW)."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - bge-small-en-v1.5
  - nomic-embed-text-v1.5
  - all-MiniLM-L6-v2
  - transformers.js
  - onnxruntime-node
  - node-llama-cpp
  - sqlite-vec
  - LanceDB
  - Orama
  - Smart Connections
topics:
  - local embedding models
  - CPU inference runtimes
  - embedding pipeline design
  - vector storage formats
  - hybrid search
---

# Local Embedding Models & Pipeline Design for CPU-Only Node.js Knowledge Platforms

**Purpose:** Identify the optimal embedding models, inference runtimes, and pipeline architecture for a local-first TypeScript knowledge platform. The system targets ~1,000 markdown articles on a developer laptop (MacBook Air M1/M2), with constraints: CPU-only, no cloud services, no GPU, no Docker, <2GB memory, <100ms search latency.

**Parent report:** `local-search-retrieval-stacks-2025-2026` — this is a fanout sub-report covering the embedding layer specifically.

---

## Executive Summary

The local embedding stack for a CPU-only Node.js knowledge platform is a solved problem with clear winners at each layer. The key insight is that **1,000 documents is a trivially small corpus** for modern embedding infrastructure — brute-force vector search completes in <5ms, the entire vector index fits in ~1.5MB of RAM, and full corpus re-embedding takes 2-5 minutes. This means the optimal architecture favors simplicity over scalability.

**Key Findings:**

- **Model:** `bge-small-en-v1.5` (BAAI) is the recommended default — 51.7 NDCG@10 on MTEB retrieval, 67MB on disk (34MB INT8), 384 dimensions, 512-token context, and near-perfect INT8 quantization retention (99.4%). It dominates `all-MiniLM-L6-v2` on every axis. For long-context needs, `nomic-embed-text-v1.5` (8192-token context) eliminates chunking entirely at a moderate size increase.

- **Runtime:** `@huggingface/transformers` v4 (transformers.js) is the simplest path — 6 lines of code, auto-downloads ONNX models, zero Python/Docker dependency, runs on Apple Silicon via WASM. `node-llama-cpp` is the alternative when Metal GPU acceleration matters.

- **Pipeline:** Build-time embedding + startup incremental hash check + background worker for live changes. Use mtime as pre-filter, SHA-256 for confirmation. Store model version in cache metadata; full wipe on model change.

- **Storage:** SQLite + `sqlite-vec` is the best fit — single file, vectors + metadata + FTS5 full-text search in one database, brute-force KNN under 5ms at this scale. Raw binary Float32Array is the zero-dependency alternative.

---

## Research Rubric

| # | Dimension | Priority | Depth | Stance |
|---|-----------|----------|-------|--------|
| D1 | Small Embedding Models for CPU | P0 | Deep | Factual |
| D2 | Inference Runtimes for Node.js/TS | P0 | Deep | Factual |
| D3 | Embedding Pipeline Design | P0 | Deep | Factual |
| D4 | Embedding Storage Formats | P0 | Moderate | Factual |

**Non-goals:** Cloud-hosted search services, GPU-required solutions, enterprise-scale systems, pricing/licensing comparisons, 1P codebase analysis.

---

## Detailed Findings

### D1: Small Embedding Models for CPU

**Finding:** `bge-small-en-v1.5` sits on the Pareto frontier for 384-dimension CPU embedding. `nomic-embed-text-v1.5` is the long-context upgrade path.

**Evidence:** [evidence/small-embedding-models-cpu.md](evidence/small-embedding-models-cpu.md)

Seven embedding models were evaluated across size, quality (MTEB retrieval NDCG@10), inference speed, quantization behavior, and Node.js ecosystem readiness.

#### Model Comparison

| Model | Params | Disk (INT8) | Dims | Max Tokens | MTEB Retrieval | INT8 Retention | Xenova ONNX |
|---|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | 22.7M | ~46 MB | 384 | 256 | 41.7 | 90.8% | Yes |
| e5-small-v2 | 33M | ~64 MB | 384 | 512 | 49.0 | ~97% | Community |
| gte-small | 33.4M | ~35 MB | 384 | 512 | 49.5 | ~98% | Yes |
| **bge-small-en-v1.5** | 33.4M | **~34 MB** | 384 | 512 | **51.7** | **99.4%** | **Yes** |
| arctic-embed-s | 33M | ~34 MB | 384 | 512 | 52.0 | ~98% | No |
| **nomic-embed-text-v1.5** | 137M | ~78 MB (Q4) | 768 | **8192** | **52.8** | ~97% | ONNX avail |
| arctic-embed-m | 110M | ~220 MB | 768 | 512 | 54.9 | ~98% | No |

#### Pareto Frontier

Three models sit on the Pareto frontier for this use case:

**Tier 1 — Best speed/size (recommended default): `bge-small-en-v1.5`**
- ~34 MB INT8 ONNX on disk, ~150-200 MB RAM during inference
- Query latency: ~10-15ms (INT8, Apple Silicon estimated)
- 24% better retrieval than MiniLM, nearly identical size
- Official [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5) ONNX export for transformers.js
- Indexing 1,000 docs: ~15-30 seconds at batch=32

**Tier 2 — Best quality with no-chunking architecture: `nomic-embed-text-v1.5`**
- ~78 MB (GGUF Q4) or ~137 MB (INT8 ONNX)
- 8,192-token context eliminates chunking for articles up to ~6,000 words
- [Matryoshka dimensions](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5): reduce to 256 dims at query time for 4x faster vector search with 98% quality retention
- Query latency: ~40-80ms (still under 100ms target)
- Indexing 1,000 docs: ~60-120 seconds

**Not on the frontier:**
- `all-MiniLM-L6-v2`: Dominated by bge-small on every axis (quality, size, quantization retention, context length). Not recommended for new projects.
- `arctic-embed-s`: Edges out bge-small by 0.3 NDCG@10 points but lacks official ONNX exports for transformers.js — the ecosystem gap outweighs the marginal quality advantage.
- `e5-small-v2`: Worse retrieval than bge-small at more disk space. Superseded.
- `gte-small`: Similar to bge-small but slightly worse INT8 retention.

#### Quantization

INT8 ONNX quantization is the primary CPU acceleration path. On Apple Silicon (ARM NEON), estimated 2-3x speedup over FP32. The critical finding is that **quantization retention varies dramatically by model** — bge-small retains 99.4% while MiniLM retains only 90.8%. Always use INT8 for bge-small; it's essentially free quality.

**Decision triggers:**
- If articles average <400 words: bge-small-en-v1.5 (512-token context is sufficient)
- If articles regularly exceed 2,000 words and you want to avoid chunking: nomic-embed-text-v1.5
- If Metal GPU acceleration is available and desired: consider bge-small via node-llama-cpp (GGUF Q8 format, ~24 MB)

---

### D2: Inference Runtimes for Node.js/TypeScript

**Finding:** `@huggingface/transformers` v4 is the clear winner for developer experience and ecosystem breadth. `node-llama-cpp` is the alternative when Metal acceleration matters.

**Evidence:** [evidence/inference-runtimes-nodejs.md](evidence/inference-runtimes-nodejs.md)

Five runtimes were evaluated for running embedding inference in Node.js without Python or Docker.

#### Runtime Comparison

| Runtime | Lines of Code | Model Hub | Auto-Download | Apple Silicon | Maintained | Best For |
|---|---|---|---|---|---|---|
| **@huggingface/transformers** | **~6** | HF Hub (huge) | Yes | WASM (ARM64) | Active (v4, Feb 2026) | Default choice |
| onnxruntime-node | ~80-120 | Manual | No | ARM64 CPU | Active (Microsoft) | Maximum control |
| **node-llama-cpp** | **~8** | GGUF (smaller) | No | **Metal + NEON** | Active (v3.18, Mar 2026) | Metal GPU + LLM apps |
| fastembed | ~6 | Limited (7) | Yes | ARM64 CPU | **Archived Jan 2026** | Avoid |
| candle | N/A | N/A | N/A | N/A | No Node.js pkg | Not feasible |

#### @huggingface/transformers (Recommended)

The simplest path to CPU embeddings in Node.js:

```typescript
import { pipeline } from "@huggingface/transformers";
const embed = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
const result = await embed("query text", { pooling: "mean", normalize: true });
const vector = result.tolist()[0]; // number[384]
```

Key facts: 15.3K GitHub stars, 567+ npm dependents, ships as ESM (requires dynamic `import()` in CJS projects — documented friction point per [issue #922](https://github.com/huggingface/transformers.js/issues/922)). v4 shipped February 2026 with a rewritten C++ WebGPU runtime providing ~4x speedup for BERT models. Supports fully offline operation via `env.localModelPath` + `env.allowRemoteModels = false`.

#### node-llama-cpp (Alternative)

The choice when you need Metal GPU acceleration or already use llama.cpp for LLM inference:

```typescript
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: "bge-small-en-v1.5-q8_0.gguf" });
const ctx = await model.createEmbeddingContext();
const { vector } = await ctx.getEmbeddingFor("query text");
```

4.4M npm weekly downloads, 110+ dependents. Metal acceleration for transformer layers is supported, which benefits embedding computation. The GGUF embedding model ecosystem is smaller than the ONNX ecosystem but covers the key models (bge-small, bge-base via [ggml-org](https://huggingface.co/ggml-org/bge-small-en-v1.5-Q8_0-GGUF) and community converters).

#### Not Recommended

- **Direct onnxruntime-node**: 80-120 lines of boilerplate (manual tokenization, tensor creation, mean pooling, normalization). Only worthwhile for custom ONNX models not on the HuggingFace Hub.
- **fastembed-js**: [Archived January 2026](https://github.com/Anush008/fastembed-js). Functionally equivalent to transformers.js but unmaintained.
- **candle**: No Node.js/NAPI bindings exist. Building custom Rust bindings is a significant engineering investment.

**Remaining uncertainty:** Direct Apple Silicon benchmarks comparing transformers.js WASM vs node-llama-cpp Metal for embedding workloads are not available in public literature. The Metal path likely outperforms WASM for larger models (nomic-embed-text) but the difference may be negligible for small models (bge-small) where inference is already under 15ms.

---

### D3: Embedding Pipeline Design

**Finding:** The optimal pipeline is a three-phase hybrid: build-time + startup incremental + background worker. Change detection uses mtime pre-filter + SHA-256 confirmation. Model versioning via full wipe on mismatch.

**Evidence:** [evidence/embedding-pipeline-design.md](evidence/embedding-pipeline-design.md)

#### Incremental Embedding

**Change detection pattern** (recommended):

```
For each article:
  1. Read stat().mtimeMs          [single syscall, no I/O]
  2. If mtime unchanged → skip   [fast path: ~99% of files]
  3. If mtime changed → SHA-256(content)
  4. If hash unchanged → skip    [catches git checkout, rsync]
  5. If hash changed → re-embed all chunks from this article
```

This combines mtime's speed (single syscall) with content hashing's reliability (immune to filesystem timestamp artifacts). For 1,000 files, the full mtime scan completes in <1ms; SHA-256 hashing of changed files adds <100ms total on M1 SSD.

**Document-level vs chunk-level detection:** Use document-level. When a markdown article changes, re-embed all chunks from that article (~3-5 chunks at 512 tokens each). Chunk-level tracking creates false precision — inserting a paragraph shifts all downstream chunk boundaries, causing most chunks to hash differently despite no semantic change in surrounding content.

This is consistent with [LlamaIndex's approach](https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/), which tracks a `doc_id → document_hash` map in its docstore and re-processes all nodes for changed documents.

#### Embedding Timing

| Phase | When | What | Duration (1K articles) |
|---|---|---|---|
| **Build-time** | `npm run build` or CI | Embed all articles, ship index as artifact | 2-5 min (one-time) |
| **Startup incremental** | App start | Diff files vs index, embed only delta | <1s (warm) to 2-5 min (cold) |
| **Background worker** | During runtime | Embed new/changed articles in Worker thread | ~100-200ms per article |

The dominant production pattern separates these concerns. [Fumadocs](https://www.fumadocs.dev/docs/headless/search/orama) uses build-time indexing. [Smart Connections](https://smartconnections.app/smart-connections/) uses background indexing at startup with incremental updates via vault event listeners.

#### First-Run Experience

Cold embedding of 1,000 articles with bge-small-en-v1.5 on M1 CPU: **~2-5 minutes** (estimated from Smart Connections reporting 3,000 notes in <10 minutes with the smaller BGE-micro model). Mitigation strategies:

1. **Progress events**: Emit per-article progress for terminal/UI display
2. **Background Worker thread**: Keep main thread responsive while indexing
3. **Progressive search**: Allow search immediately on already-embedded articles; show "Indexing N remaining..." banner
4. **Pre-computed index**: Ship embeddings as a build artifact for published documentation

#### Model Versioning

Embeddings from different models occupy incompatible semantic spaces. A model mismatch causes **silent retrieval failure** — no errors, normal latency, semantically wrong results. [RAG post-mortems](https://decompressed.io/learn/rag-observability-postmortem) document this as a common production failure mode.

**Strategy:** Store `model_id` + `schema_version` in cache metadata. On startup, compare against the configured model. Mismatch triggers full wipe + rebuild. At 1,000 documents, rebuild takes 2-5 minutes — simple enough that versioned parallel indexes are unnecessary.

#### How Existing Tools Handle Embedding

| Tool | Model | Pipeline | Storage |
|---|---|---|---|
| **Smart Connections** | Xenova/bge-micro-v2 (transformers.js) | Background indexing + vault events | AJSON files in `.smart-env/` |
| **Orama** | Expects pre-computed vectors | Build-time or runtime insert | In-memory JS objects → JSON |
| **Fumadocs** | No embeddings (BM25 only) | Build-time via `staticGET` | Orama in-memory index |
| **DevDocs/Dash** | No embeddings | Keyword search | Pre-built docsets |

Notable: [Orama's `@orama/plugin-embeddings`](https://docs.orama.com/docs/orama-js/search/vector-search) generates vectors locally but uses **TensorFlow.js** (not transformers.js) — a heavier dependency. If using Orama for search, generate embeddings externally via transformers.js and insert them at index time.

#### Caching & Git

Embeddings are derived artifacts — regenerable from source. They should **not** be committed to git (binary diffs, model upgrades invalidate all vectors, merge conflicts). Recommended: `.search-cache/` directory at project root, listed in `.gitignore`. Distribute pre-computed indexes via npm `files`, CDN, or CI artifacts.

#### Memory Mapping

At 1,000 documents: 1,000 × 384 × 4 bytes = **1.46 MB** of raw vector data (4.4 MB with 3x chunking). Memory mapping is irrelevant at this scale — load everything into RAM. Mmap becomes relevant at 1M+ vectors.

---

### D4: Embedding Storage Formats

**Finding:** SQLite + sqlite-vec is the best-fit storage format. Raw binary Float32Array is the zero-dependency alternative. HNSW indexes and LanceDB are over-engineered at 1,000 documents.

**Evidence:** [evidence/embedding-storage-formats.md](evidence/embedding-storage-formats.md)

#### Format Comparison

| Format | Size (1K × 384) | Query Time | Metadata | ANN Index | Node.js Ecosystem |
|---|---|---|---|---|---|
| **SQLite + sqlite-vec** | **~1.6 MB** | **<5ms (BF)** | **Yes (v0.1.6+)** | BF only (HNSW planned) | better-sqlite3, node:sqlite |
| Raw binary (.bin) | 1.46 MB | <5ms (manual BF) | No (sidecar) | No | Built-in (fs, Buffer) |
| LanceDB | ~1.6-2 MB | <5ms (BF fallback) | Yes | IVF_PQ (overkill) | @lancedb/lancedb |
| HNSW (hnswlib-node) | ~1.83 MB | <1ms ANN | No | Yes | hnswlib-node (12K wkly DLs) |
| HNSW (usearch) | ~1.6-1.7 MB | <1ms ANN | No | Yes + quantize | usearch |
| JSON | ~5-6 MB | ~20-50ms parse | Yes | No | Built-in |

#### SQLite + sqlite-vec (Recommended)

[sqlite-vec](https://github.com/asg017/sqlite-vec) (Alex Garcia) reached stable v0.1.0 in August 2024. Key capabilities:

- **Brute-force KNN scan**: No ANN index needed at 1,000 vectors. Benchmark extrapolation from SIFT1M (1M × 128 = 33ms) puts 1,000 × 384 at well under 5ms.
- **Metadata columns** (v0.1.6+): Store `doc_id`, `content_hash`, `model_version` directly in the `vec0` virtual table alongside vectors.
- **Hybrid search**: [Documented pattern](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) combining FTS5 (BM25) and vec0 (cosine) in the same database, enabling hybrid full-text + semantic search in pure SQL.
- **Node.js support**: Works with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (most popular), `node:sqlite` (Node 22+), and `bun:sqlite`.

Recommended schema for the embedding cache:

```sql
CREATE TABLE cache_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE article_index (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[384],
  +article_path TEXT,
  +chunk_text TEXT,
  +chunk_index INTEGER
);
```

#### What Not to Use at This Scale

- **LanceDB**: IVF_PQ requires ["at least a few thousand rows"](https://docs.lancedb.com/indexing/vector-index) for effective training. Falls back to brute-force automatically at 1,000 docs. The Lance format's advantages (columnar compression, versioning) don't justify the complexity.
- **HNSW indexes** (hnswlib-node, usearch): No perceptible speed improvement over brute-force at 1,000 vectors. Both are strong at 100K+ scale. [hnswlib-node](https://www.npmjs.com/package/hnswlib-node) (12.4K weekly downloads) and [usearch](https://www.npmjs.com/package/usearch) are the options when scaling up.
- **JSON arrays**: 4x larger on disk than binary, unnecessary parse overhead. Both [Orama](https://docs.orama.com/open-source/internals/components) and [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) use JSON-based storage but accept the tradeoff for simplicity.

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Build / CI Phase                    │
│                                                     │
│  articles/*.md  ──→  transformers.js (bge-small INT8)│
│                      ──→  search-cache/index.db     │
│                           (SQLite + sqlite-vec)     │
└───────────────────────────┬─────────────────────────┘
                            │ ship as artifact
┌───────────────────────────▼─────────────────────────┐
│                  App Startup Phase                    │
│                                                     │
│  scan articles → mtime check → SHA-256 on changed   │
│  → re-embed delta → update index.db                 │
│  → verify model_id matches cache metadata           │
└───────────────────────────┬─────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────┐
│                  Runtime Phase                       │
│                                                     │
│  File watcher → background Worker thread            │
│  → embed changed articles → upsert into index.db   │
│                                                     │
│  Search query → FTS5 (BM25) + vec0 (cosine)        │
│  → hybrid rank → return results (<5ms)              │
└─────────────────────────────────────────────────────┘
```

**Stack summary:**
- **Model:** `bge-small-en-v1.5` (Xenova ONNX INT8, ~34 MB)
- **Runtime:** `@huggingface/transformers` v4 (~6 lines of code)
- **Storage:** SQLite + sqlite-vec (via `better-sqlite3`)
- **Change detection:** mtime pre-filter + SHA-256 confirmation
- **Model versioning:** `model_id` in cache metadata; full wipe on mismatch

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Apple Silicon embedding benchmarks**: Direct M1/M2/M3 benchmarks for these embedding models via transformers.js WASM are not publicly available. Speed estimates are extrapolated from x86 benchmarks and ARM architecture characteristics. The actual performance may differ.
- **transformers.js WASM vs node-llama-cpp Metal**: No head-to-head comparison for embedding inference on Apple Silicon. Metal acceleration likely benefits larger models (nomic-embed-text) more than small ones (bge-small).
- **sqlite-vec HNSW timeline**: HNSW/IVF indexes are listed as future work for sqlite-vec. No release date available. For scaling beyond 100K vectors, hnswlib-node or usearch would be needed.

### Out of Scope (per Rubric)

- Cloud-hosted search services (Algolia, Pinecone, Weaviate Cloud)
- GPU-required solutions (CUDA, ROCm-dependent models)
- Enterprise-scale systems (millions of documents)
- Pricing/licensing comparisons
- 1P codebase analysis

---

## References

### Evidence Files
- [evidence/small-embedding-models-cpu.md](evidence/small-embedding-models-cpu.md) — Model comparison, MTEB scores, quantization analysis
- [evidence/inference-runtimes-nodejs.md](evidence/inference-runtimes-nodejs.md) — Runtime evaluation, API examples, ecosystem status
- [evidence/embedding-pipeline-design.md](evidence/embedding-pipeline-design.md) — Incremental strategies, timing estimates, tool analysis
- [evidence/embedding-storage-formats.md](evidence/embedding-storage-formats.md) — Storage format comparison, size calculations, Node.js support

### External Sources
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — Embedding model benchmark authority
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) — Recommended model
- [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — Long-context alternative
- [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5) — ONNX export for transformers.js
- [@huggingface/transformers npm](https://www.npmjs.com/package/@huggingface/transformers) — Recommended runtime
- [Transformers.js v4 blog](https://huggingface.co/blog/transformersjs-v4) — v4 architecture and benchmarks
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) — Alternative runtime with Metal
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — Recommended vector storage
- [sqlite-vec hybrid search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — BM25 + vector pattern
- [HuggingFace embedding quantization blog](https://huggingface.co/blog/embedding-quantization) — INT8 quality retention data
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) — Reference local embedding implementation
- [LlamaIndex Document Management](https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/) — Incremental embedding reference
- [RAG observability post-mortem](https://decompressed.io/learn/rag-observability-postmortem) — Model mismatch failure mode
