# Evidence: ANN Algorithms

**Dimension:** D1 — ANN algorithms (HNSW, IVF, DiskANN, brute-force ceilings)
**Date:** 2026-04-04
**Sources:** pgvector GitHub, sqlite-vec GitHub, Orama GitHub, Neon blog, AWS blog, Jonathan Katz blog

---

## Key files / pages referenced

- [pgvector GitHub](https://github.com/pgvector/pgvector) — v0.8.2, HNSW + IVFFlat stable
- [sqlite-vec Issue #25](https://github.com/asg017/sqlite-vec/issues/25) — ANN roadmap discussion
- [sqlite-vec releases](https://github.com/asg017/sqlite-vec/releases) — DiskANN/IVF in alpha
- [Orama vector search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — brute-force only
- [Neon pgvector 30x faster builds](https://neon.com/blog/pgvector-30x-faster-index-build-for-your-vector-embeddings) — v0.6.0 parallel build
- [AWS 67x faster pgvector](https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/) — v0.7.0 binary quantization
- [Jonathan Katz 150x cumulative speedup](https://jkatz05.com/post/postgres/pgvector-performance-150x-speedup/)
- [Vec1 SQLite official extension](https://sqlite.org/vec1/doc/trunk/doc/vec1.md) — IVFADC algorithm

---

## Findings

### Finding: pgvector has production-ready HNSW and IVFFlat
**Confidence:** CONFIRMED
**Evidence:** [pgvector GitHub README](https://github.com/pgvector/pgvector)

HNSW stable since v0.5.0. IVFFlat since original release. Tuning: m (default 16), ef_construction (64), ef_search (40). v0.8.0 added iterative_scan for filtered queries. 6 distance metrics: L2, cosine, inner product, L1, Hamming, Jaccard. pgvectorscale (Timescale) adds StreamingDiskANN on top.

### Finding: sqlite-vec has DiskANN and IVF in alpha, brute-force stable
**Confidence:** CONFIRMED
**Evidence:** [sqlite-vec Issue #25](https://github.com/asg017/sqlite-vec/issues/25), release notes

Stable v0.1.x is brute-force only. Alpha releases include experimental DiskANN (DELETE is expensive due to pruning) and IVF (disabled by default). Alex Garcia prioritized IVF+kmeans first, then DiskANN. HNSW deprioritized ("complicated to implement" in SQLite's model). Vec1 (official SQLite extension) uses IVFADC with product quantization — competing/complementary approach.

### Finding: Orama has no ANN and no announced plans
**Confidence:** CONFIRMED
**Evidence:** [Orama GitHub](https://github.com/oramasearch/orama), vector search docs

Brute-force cosine similarity only. No GitHub issues or roadmap items for ANN/HNSW. Design philosophy (browser-first, <2kb) deprioritizes large-scale vector indexing.

### Finding: Brute-force ceilings differ significantly
**Confidence:** CONFIRMED (pgvector), CONFIRMED (sqlite-vec), INFERRED (Orama)

| Engine | Practical ceiling | Benchmarked latency |
|--------|------------------|---------------------|
| pgvector (seq scan) | ~10K-50K vectors | ~36ms at 10K, degrades past 50K |
| sqlite-vec | ~100K-250K vectors | ~85ms for 250K at 1024 dims |
| Orama | ~10K-50K (estimated) | ~21µs (small dataset, in-memory) |

### Finding: pgvector index build has improved 150x over 2 years
**Confidence:** CONFIRMED
**Evidence:** v0.6.0 parallel build (30x), v0.7.0 binary quantization (67x). 1M vectors at 50-dim: IVFFlat ~128s, HNSW ~68min (pre-parallel).

---

## Gaps / follow-ups

- sqlite-vec ANN timeline has slipped from original Jan 2025 target — current status unclear
- Vec1 (official SQLite extension) vs sqlite-vec competitive dynamics not fully explored
- Orama brute-force ceiling is estimated, not benchmarked at scale
