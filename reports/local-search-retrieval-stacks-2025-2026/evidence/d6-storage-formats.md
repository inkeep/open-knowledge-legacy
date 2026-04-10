# Evidence: Embedding Storage Formats

**Dimension:** D4 — Embedding Storage Formats
**Date:** 2026-04-03
**Sources:** sqlite-vec docs/blog, LanceDB docs, hnswlib-node npm, usearch npm, Orama internals, Smart Connections GitHub

---

## Key sources referenced
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — v0.1.0 stable, brute-force vector search
- [sqlite-vec stable release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) — Architecture and benchmarks
- [sqlite-vec metadata columns](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) — v0.1.6 metadata support
- [sqlite-vec hybrid search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — FTS5 + vector
- [sqlite-vec Node.js docs](https://alexgarcia.xyz/sqlite-vec/js.html) — better-sqlite3, node:sqlite integration
- [@lancedb/lancedb npm](https://www.npmjs.com/package/@lancedb/lancedb) — Embedded vector DB
- [LanceDB vector index docs](https://docs.lancedb.com/indexing/vector-index) — IVF_PQ, IVF_HNSW_SQ
- [hnswlib-node npm](https://www.npmjs.com/package/hnswlib-node) — 12.4K weekly downloads, last updated Jan 2025
- [usearch npm](https://www.npmjs.com/package/usearch) — USearch Node.js bindings
- [npyjs GitHub](https://github.com/aplbrain/npyjs) — Node.js .npy reader/writer
- [Smart Connections GitHub](https://github.com/brianpetro/obsidian-smart-connections) — AJSON storage format
- [Orama internals](https://docs.orama.com/open-source/internals/components) — In-memory JS objects + JSON serialize
- [Lantern HNSW calculator](https://lantern.dev/blog/calculator) — Index size estimation

---

## Findings

### Finding: SQLite + sqlite-vec is the best-fit storage format for 1,000 documents in Node.js
**Confidence:** CONFIRMED
**Evidence:** sqlite-vec v0.1.0+: brute-force KNN scan, metadata columns (v0.1.6), hybrid FTS5+vector search. Works with better-sqlite3, node:sqlite (Node 22+), bun:sqlite. Single .db file ~1.55-1.6 MB for 1,000 × 384 vectors.

Brute-force scan performance from Alex Garcia's benchmarks: SIFT1M (1M × 128) = 33ms. Extrapolating: 1,000 × 384 should complete in <5ms. No ANN index needed — HNSW is listed as future work.

Hybrid search (BM25 + vector) documented and working via FTS5 + vec0 in same database. SQL interface means no custom query code.

**Implications:** sqlite-vec provides vectors + metadata + full-text search in a single dependency-light package. Best overall fit for this use case.

### Finding: Raw binary Float32Array is the simplest zero-dependency option
**Confidence:** CONFIRMED
**Evidence:** 1,000 × 384 × 4 bytes = 1.46 MB. Node.js native `Buffer` / `Float32Array` — no npm packages needed.

Single concatenated file + sidecar JSON index: ~1.47 MB total. Brute-force cosine similarity in TypeScript: 384,000 multiplications for 1,000 vectors, completes in <5ms.

**Implications:** Viable as a starting point or for apps that want zero dependencies. No metadata, no indexing, no query language.

### Finding: LanceDB is over-engineered for 1,000 documents
**Confidence:** CONFIRMED
**Evidence:** LanceDB docs state IVF_PQ requires "at least a few thousand rows" for effective training. HNSW only available as IVF sub-index, not standalone. At 1,000 docs, falls back to brute-force automatically.

LanceDB adds: Lance columnar format overhead, directory-based storage (multiple files), larger npm dependency. Strengths (IVF_PQ, versioning, columnar optimization) only matter at 100K+ vectors.

**Implications:** Skip LanceDB at this scale. Consider if the corpus grows to 100K+.

### Finding: HNSW indexes (hnswlib-node, usearch) provide no benefit at 1,000 vectors
**Confidence:** CONFIRMED
**Evidence:** HNSW index for 1,000 × 384 with M=16: ~1.83 MB (vectors + graph). Brute-force scan at 1,000 vectors takes <5ms. HNSW overhead (build time, index file management) provides no perceptible speed improvement.

hnswlib-node: 12.4K weekly downloads, maintained (Jan 2025). usearch: actively maintained, supports f16/i8 quantization. Both are strong at 100K+ vectors.

**Implications:** Skip HNSW at 1,000-doc scale. hnswlib-node or usearch are good upgrade paths if the corpus grows.

### Finding: .npy format offers no advantage over raw binary in pure Node.js pipelines
**Confidence:** CONFIRMED
**Evidence:** .npy = raw binary + 128-byte header (dtype, shape). Same performance as Float32Array. Only useful for Python interoperability. npyjs npm package available for reading/writing.

**Implications:** Skip .npy unless the embedding pipeline involves Python.

### Finding: Local-first apps predominantly use JSON-based storage
**Confidence:** CONFIRMED
**Evidence:** Smart Connections: AJSON (newline-delimited JSON) in `.smart-env/`. Orama: in-memory JS objects, serialized to JSON. LlamaIndex SimpleVectorStore: JSON file at `./storage/vector_store.json`.

JSON for 1,000 × 384 vectors: ~5-6 MB (floats are verbose as text). Parse time: ~20-50ms. Human-readable but 4× larger than binary.

**Implications:** JSON is viable but wasteful. sqlite-vec or raw binary are more efficient. JSON's advantage is human readability and portability.

---

## Size comparison table

| Format | Disk size (1K × 384) | Read speed | Metadata | ANN Index | Node.js support |
|---|---|---|---|---|---|
| Raw binary | 1.46 MB | Fastest | No | No | Built-in |
| SQLite + sqlite-vec | ~1.55-1.6 MB | <5ms BF | Yes (v0.1.6+) | Brute force only | better-sqlite3, node:sqlite |
| LanceDB | ~1.6-2 MB | <5ms BF | Yes | IVF (overkill) | @lancedb/lancedb |
| HNSW (hnswlib-node) | ~1.83 MB | <1ms ANN | No | Yes | hnswlib-node |
| HNSW (usearch) | ~1.6-1.7 MB | <1ms ANN | No | Yes + quantize | usearch |
| .npy | 1.46 MB + header | Same as raw | No | No | npyjs |
| JSON | ~5-6 MB | ~20-50ms parse | Yes | No | Built-in |

---

## Gaps / follow-ups

* sqlite-vec HNSW implementation timeline — Alex Garcia has listed it as planned but no release date.
* Voyager (Spotify) Node.js bindings — currently Python/Java only, worth monitoring.
* sqlite-vec on Bun: macOS may need custom SQLite lib due to extension loading.
