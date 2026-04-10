---
title: "Advanced Search Capabilities: Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector"
description: "Comparative feature assessment of advanced search capabilities across three search engine candidates: ANN algorithms, vector types and quantization, sparse embeddings, hybrid fusion methods, metadata filtering, and reranking pipelines. Complements the architecture-specific decision report with engine-level feature depth."
createdAt: 2026-04-04
updatedAt: 2026-04-05
subjects:
  - Orama
  - sqlite-vec
  - pgvector
  - PGlite
  - SQLite FTS5
  - SPLADE
  - ColBERT
  - HNSW
topics:
  - ANN algorithms
  - vector quantization
  - sparse embeddings
  - hybrid search fusion
  - cross-encoder reranking
  - metadata filtering
---

# Advanced Search Capabilities: Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector

**Purpose:** Compare search-specific features beyond basic hybrid search across the three engine candidates. This is a feature inventory — factual, not recommendation-oriented. The architecture-level recommendation (SQLite primary, Orama fallback) is covered in the [Search Engine Decision Report](/Users/edwingomezcuellar/reports/search-engine-decision/REPORT.md).

---

## Executive Summary

pgvector is the most feature-rich search engine by a wide margin. It has production-ready HNSW, four vector types (float32, float16, bit, sparse), native SPLADE support, six distance metrics, full SQL fusion control, in-database cross-encoder reranking (via PostgresML), and late interaction model support (via VectorChord). It is the clear winner on every advanced search dimension.

sqlite-vec occupies the middle ground. It supports three vector types (float32, int8, bit), three distance metrics, brute-force with DiskANN/IVF in alpha, metadata pre-filtering via bitmaps, and composable RRF fusion through SQL. No sparse vectors, no native reranking, no facets.

Orama is the simplest and most constrained. Float-only vectors, cosine-only distance, brute-force-only search, opaque fusion logic, but with the best single-API developer experience (one `search()` call combines FTS + vector + filters + facets + geo).

**The critical context: none of these advanced features matter at our P0 scale.** At 1,000 articles with 384-dim embeddings, brute-force search is sub-10ms in all engines. ANN indexes, quantization, sparse embeddings, and multi-stage reranking pipelines are solutions for 100K+ document scale. The feature gap between engines is real but irrelevant for P0 — it becomes relevant when the cloud product (S-L3) serves enterprise-scale knowledge bases.

**Key Findings:**

- **ANN:** pgvector has HNSW+IVFFlat (stable). sqlite-vec has DiskANN+IVF (alpha). Orama has nothing. All moot at 1K docs — brute-force is faster than indexed search below ~10K vectors.
- **Vector types:** pgvector supports float32/float16/bit/sparse. sqlite-vec supports float32/int8/bit. Orama supports float64 only. sqlite-vec's int8 gives 4x storage reduction at ~1.5% recall loss.
- **Sparse embeddings:** pgvector is the ONLY engine with SPLADE support (via sparsevec type). Neither sqlite-vec nor Orama has sparse vector storage.
- **Fusion methods:** SQLite and PostgreSQL use RRF (rank-based, no score calibration needed). Orama uses weighted linear combination (score-based, internal normalization). RRF is more robust.
- **Metadata filtering:** Orama has the richest built-in experience (filters + facets + geo in one call). pgvector has the most powerful (full SQL + JSONB + PostGIS). sqlite-vec has basic metadata columns with bitmap pre-filtering.
- **Reranking:** pgvector has in-database cross-encoder (PostgresML) and ColBERT (VectorChord). sqlite-vec and Orama require application-layer reranking. At 1K docs, cross-encoder adds ~200ms for marginal relevance gain.

---

## Research Rubric

**Report Type:** Comparative Feature Assessment
**Primary Question:** How do these three engines compare on search-specific capabilities beyond basic hybrid search?
**Stance:** Factual (feature inventory)

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | ANN algorithms — HNSW, IVF, DiskANN, brute-force ceilings | Deep | P0 |
| D2 | Vector types & quantization — float32, float16, int8, binary, max dimensions | Deep | P0 |
| D3 | Sparse embeddings — SPLADE, learned sparse, sparse vector storage | Moderate | P0 |
| D4 | Hybrid fusion methods — RRF, weighted-sum, cross-encoder reranking, late interaction | Deep | P0 |
| D5 | Metadata filtering & faceted search — filter syntax, performance, combinability | Moderate | P1 |
| D6 | Reranking pipeline — cross-encoder support, custom scoring, multi-stage | Deep | P0 |

**Non-goals:** Re-evaluating architecture fit (covered by search-engine-decision report). Embedding model selection. Operational/lifecycle concerns.

---

## Detailed Findings

### D1: ANN Algorithms

**Finding:** pgvector has production-ready HNSW and IVFFlat. sqlite-vec has DiskANN and IVF in alpha. Orama has no ANN and no announced plans. All engines are brute-force-adequate at 1K docs.

**Evidence:** [evidence/d1-ann-algorithms.md](evidence/d1-ann-algorithms.md)

| Capability | pgvector | sqlite-vec | Orama |
|-----------|----------|------------|-------|
| **HNSW** | Stable (v0.5.0+) | Not supported | Not supported |
| **IVFFlat** | Stable | Alpha (experimental) | Not supported |
| **DiskANN** | Via pgvectorscale | Alpha (experimental) | Not supported |
| **Brute-force ceiling** | ~50K vectors | ~250K vectors | ~10-50K (estimated) |
| **Distance metrics** | 6 (L2, cosine, IP, L1, Hamming, Jaccard) | 3 (L2, cosine, Hamming) | 1 (cosine) |
| **Tuning parameters** | 7+ (m, ef_construction, ef_search, ...) | None (brute-force) | similarity threshold |

pgvector's HNSW has seen 150x cumulative build-time improvement from v0.5.0 to v0.7.0 (parallel build + binary quantization). v0.8.0 added iterative scan for filtered ANN queries.

sqlite-vec's ANN roadmap has slipped from the original Jan 2025 target. Alex Garcia prioritized IVF+kmeans first, then DiskANN. Separately, the official SQLite team released Vec1 (IVFADC with product quantization) — a potentially competing/complementary approach.

**Relevance at 1K docs:** None. Brute-force through 1,536 bytes × 1,000 vectors (~1.5MB) is sub-10ms on any modern CPU. ANN indexes add overhead (build time, memory, tuning) that produces no benefit until ~10K+ vectors.

---

### D2: Vector Types & Quantization

**Finding:** pgvector has the broadest type system (float32, float16, bit, sparse). sqlite-vec is second (float32, int8, bit). Orama is float-only. Quantization quality is well-documented for pgvector, undocumented for sqlite-vec.

**Evidence:** [evidence/d2-vector-types-quantization.md](evidence/d2-vector-types-quantization.md)

**Storage at 384 dims, 1K docs:**

| Engine + Type | Per vector | 1K docs total |
|--------------|-----------|---------------|
| pgvector vector (f32) | 1,544 B | ~1.5 MB |
| pgvector halfvec (f16) | 776 B | ~0.8 MB |
| sqlite-vec float (f32) | 1,536 B | ~1.5 MB |
| sqlite-vec int8 | 384 B | ~0.4 MB |
| sqlite-vec bit | 48 B | ~0.05 MB |
| Orama number[] (f64) | ~3,072 B | ~3 MB |

**Quantization quality** (pgvector benchmarks, [Jonathan Katz](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)):
- **halfvec (f16):** <0.3% recall loss — safe default for all datasets
- **bit (binary):** Catastrophic recall loss on low-dim datasets without reranking. Only viable for high-dim (1536+) embeddings + rerank pass.

**Maximum dimensions:**

| Engine | Type | Max stored | Max indexed |
|--------|------|-----------|-------------|
| pgvector | vector | 16,000 | 2,000 |
| pgvector | halfvec | 16,000 | 4,000 |
| pgvector | bit | 83,000+ | 64,000 |
| sqlite-vec | all | No documented limit | No ANN index |
| Orama | vector | No documented limit | No ANN index |

No engine supports product quantization (PQ). pgvector has an open feature request (#605).

**Relevance at 1K docs:** sqlite-vec's int8 type is practically useful — 4x storage reduction (1.5MB → 0.4MB) with ~1.5% recall loss per general benchmarks. For per-branch cached indexes (CC6), smaller is better for branch switching speed.

---

### D3: Sparse Embeddings (SPLADE, Learned Sparse)

**Finding:** pgvector is the only engine with sparse vector support. It can store and search SPLADE vectors natively. Neither sqlite-vec nor Orama has sparse vector storage or search.

**Evidence:** [evidence/d3-sparse-embeddings.md](evidence/d3-sparse-embeddings.md)

| Capability | pgvector | sqlite-vec | Orama |
|-----------|----------|------------|-------|
| Sparse vector storage | `sparsevec(N)` | No | No |
| SPLADE compatible | Yes (documented by ParadeDB) | No | No |
| Sparse-to-sparse search | Yes (L2, IP, cosine, L1) | No | No |
| HNSW on sparse | Yes (≤1K nonzero elements) | No | No |
| Three-way hybrid (BM25+dense+sparse) | Yes | No (BM25+dense only) | No (BM25+dense only) |

SPLADE vectors have ~50-200 nonzero elements out of 30,522 total dimensions. pgvector's 1,000 nonzero element HNSW indexing limit is well above typical SPLADE output.

ParadeDB benchmarks (100K SPLADE vectors): HNSW index query top-10 in 6ms vs 150ms sequential scan (25x speedup).

`tsvector` (PostgreSQL BM25) and `sparsevec` (SPLADE) are complementary, not interchangeable. tsvector is lexical token matching; sparsevec stores learned float weights with semantic expansion.

**Relevance at 1K docs:** SPLADE adds complexity (model inference, sparse storage) for marginal gain over BM25 at small scale. Relevant for cloud product at 10K+ enterprise knowledge bases where semantic recall matters.

#### D3.1: SPLADE vs BM25 at Small Scale (1K-10K Documents)

**Finding:** At the 1K-10K document scale, SPLADE provides marginal and inconsistent improvement over BM25 (2-4% NDCG on most small datasets). The computational overhead — GPU-dependent query encoding at 40-50ms per query, 110M parameter model inference, and domain generalization risk — is not justified for corpora where BM25's brute-force lexical matching already achieves high coverage.

**Evidence:** [evidence/d3-sparse-embeddings.md](evidence/d3-sparse-embeddings.md) (SPLADE vs BM25 at Small Scale section)

No published study benchmarks SPLADE specifically at sub-100K corpus sizes as a controlled variable. The closest evidence comes from BEIR's small datasets (SciFact: 5,183 docs, NFCorpus: 3,633 docs, ArguAna: 8,674 docs), where SPLADE is evaluated in zero-shot mode:

| Dataset (corpus size) | BM25 NDCG@10 | SPLADE distil NDCG@10 | Delta |
|---|---|---|---|
| SciFact (5,183) | 0.665 | 0.693 | +4.2% |
| NFCorpus (3,633) | 0.325 | 0.334 | +2.8% |
| ArguAna (8,674) | 0.315 | 0.479 | +52% |

The 2-4% gains on SciFact and NFCorpus are within the range that BM25 parameter tuning (k1, b values) can close. ArguAna's 52% gain is an outlier — it is a counterargument retrieval task with extreme vocabulary mismatch between queries and documents, a scenario atypical of knowledge base search.

**Why SPLADE's advantage diminishes at small scale:**

1. **Vocabulary coverage:** In a 1K-10K document corpus with consistent domain vocabulary, most query terms appear literally in relevant documents. SPLADE's learned term expansion ("spaghetti" activating "pasta") adds less value when lexical overlap is already high.

2. **Generalization risk:** SPLADE models trained on MS MARCO can underperform BM25 on out-of-domain corpora without fine-tuning. Fine-tuning requires labeled query-document pairs that are prohibitively expensive to create for a small corpus.

3. **Computational cost is fixed regardless of corpus size:** SPLADE adds ~40-50ms query encoding latency (GPU) per query. BM25 query processing is sub-millisecond. At 1K docs, BM25 retrieval is sub-10ms total; SPLADE adds 4-5x the total query latency just for encoding, before retrieval even begins. On CPU (no GPU available), SPLADE encoding rises to 200-500ms+ per query.

4. **Index build overhead:** Encoding 10K documents through SPLADE requires ~200 seconds on a T4 GPU. BM25 index build for 10K documents is near-instant.

**The Amazon "Keyword search is all you need" finding** ([Subramanian et al., 2026](https://arxiv.org/abs/2602.23368)) demonstrates that even regex-based keyword search (grep) achieves 88-94% of RAG performance on small document corpora. While this paper compares grep-level keyword search against vector RAG (not BM25 vs SPLADE specifically), it reinforces the broader principle: at small scale, sophisticated retrieval mechanisms provide diminishing returns over simple lexical approaches.

**Practical implication:** For a 1K-10K document knowledge base, BM25 (via FTS5 or tsvector) is the correct baseline. The 2-4% NDCG improvement from SPLADE does not justify: (a) GPU dependency for query encoding, (b) 110M parameter model deployment, (c) domain fine-tuning costs, or (d) sparse vector storage complexity. SPLADE becomes relevant when the corpus crosses ~50K-100K documents, query diversity increases, and vocabulary mismatch becomes a retrieval bottleneck.

---

### D4: Hybrid Fusion Methods

**Finding:** SQLite and PostgreSQL both use RRF (rank-based, robust). Orama uses weighted linear combination (score-based, simpler API). PostgreSQL additionally supports ColBERT late interaction via VectorChord.

**Evidence:** [evidence/d4-hybrid-fusion-methods.md](evidence/d4-hybrid-fusion-methods.md)

| Capability | Orama | SQLite FTS5 + sqlite-vec | pgvector + PostgreSQL |
|-----------|-------|-------------------------|----------------------|
| **Default fusion** | Weighted linear combination | RRF (rank-based) | RRF (rank-based) |
| **Custom fusion** | Fork source code | Full (user SQL) | Full (SQL functions) |
| **Weight tuning** | Not exposed in OSS SDK | User-controlled params | User-controlled params |
| **Score calibration** | Internal/opaque | Not needed (RRF) | Not needed (RRF) |
| **Cross-encoder** | App-layer only | App-layer only | PostgresML in-DB + app-layer |
| **ColBERT/ColPali** | No | No | VectorChord MaxSim |
| **Multi-stage retrieval** | No | Yes (SQL pattern) | Yes (SQL CTEs) |

RRF is more robust than weighted linear combination because it uses rank positions only — no need to normalize BM25 scores (unbounded, negative) against cosine similarity (0-1). This is why both SQL engines default to it.

Orama's fusion is a black box. You can't tune weights in the OSS SDK, can't swap to RRF, can't add custom signals. For a product that needs to tune search quality over time, this opacity is a constraint.

**Relevance at 1K docs:** Both fusion methods produce adequate results at small scale. The tuning advantage of RRF matters more as the corpus grows and queries become more diverse.

---

### D5: Metadata Filtering & Faceted Search

**Finding:** Orama has the best single-API experience (filters + facets + geo in one call). pgvector has the most powerful filtering (full SQL). sqlite-vec has basic metadata columns with bitmap pre-filtering.

**Evidence:** [evidence/d5-metadata-filtering.md](evidence/d5-metadata-filtering.md)

| Capability | Orama | sqlite-vec + FTS5 | pgvector + PostgreSQL |
|-----------|-------|-------------------|----------------------|
| **Filter operators** | eq, gt, gte, lt, lte, between, in, nin, containsAll, containsAny, nested dot notation | =, !=, >, >=, <, <=, IN, BETWEEN (no LIKE/REGEXP) | Full SQL + JSONB + array ops + regex |
| **Pre/post filter** | Pre-filter (index intersection) | Pre-filter (bitmap) | Post-filter + iterative scan (v0.8.0) |
| **Faceted search** | Native (string, number ranges, boolean, enum) | None | GROUP BY or pgfaceting extension |
| **Geo-filtering** | Native geopoint + radius | None | PostGIS (full spatial) |
| **Combined FTS+Vec+Filter** | Single `search()` call | Multi-CTE SQL | Multi-CTE SQL |

Orama's single-API experience is genuinely better for developer productivity. One call does everything. The SQL engines require composing CTEs, JOINs, and multiple index queries manually.

pgvector v0.8.0's iterative_scan fixed the historical problem of post-filtering discarding too many ANN results with selective filters (5.7x performance improvement, 100x result completeness improvement).

**Relevance at 1K docs:** Metadata filtering is useful immediately (filter by topic, tags, date). Facets are useful for the editor's search UI. Geo is irrelevant for a knowledge platform.

---

### D6: Reranking Pipeline

**Finding:** pgvector has the most complete reranking ecosystem (in-database cross-encoder, ColBERT, multi-stage SQL). Orama has an afterSearch hook but no documented reranking examples. sqlite-vec requires application-layer reranking.

**Evidence:** [evidence/d6-reranking-pipeline.md](evidence/d6-reranking-pipeline.md)

| Capability | Orama | sqlite-vec | pgvector |
|-----------|-------|------------|----------|
| **Built-in reranking** | afterSearch hook (undocumented for reranking) | None | PostgresML `pgml.rank()` |
| **Cross-encoder** | App-layer | App-layer | In-DB (PostgresML) + app-layer |
| **ColBERT** | No | No | VectorChord MaxSim |
| **Multi-stage pipeline** | No | SQL pattern (FTS→vec rerank) | SQL CTEs (BM25→vec→cross-encoder) |
| **Custom scoring** | 3 built-in algorithms, no custom API | SQLite UDFs | Full SQL expressions |

Cross-encoder performance at small scale: ms-marco-MiniLM-L-6-v2 processes 50 candidates in ~100-300ms on CPU. For 1K docs: hybrid search top-50 (~5ms) → cross-encoder rerank (~200ms) = ~205ms total.

[@huggingface/transformers v3](https://huggingface.co/docs/transformers.js) provides ~340 ONNX cross-encoder models in Node.js — no Python needed. Cloud alternatives: Cohere Rerank API, Jina Reranker.

ParadeDB assessment: cross-encoders are for "the 5% of cases where squeezing out final drops of relevance is worth extra latency and vendor cost." At small scale, hybrid search already has high recall.

**Relevance at 1K docs:** Cross-encoder reranking adds ~200ms latency for marginal relevance improvement. At 1K docs, brute-force hybrid search already achieves high recall. Reranking becomes valuable at 10K+ where recall from initial retrieval drops.

---

## Consolidated Feature Matrix

| Feature | Orama | sqlite-vec | pgvector |
|---------|-------|------------|----------|
| **ANN index** | None | DiskANN/IVF (alpha) | HNSW + IVFFlat (stable) |
| **Brute-force ceiling** | ~10-50K | ~250K | ~50K |
| **Vector types** | float64 | float32, int8, bit | float32, float16, bit, sparse |
| **Distance metrics** | cosine | L2, cosine, Hamming | L2, cosine, IP, L1, Hamming, Jaccard |
| **Max dims (indexed)** | No limit (no index) | No limit (no index) | 2K (f32), 4K (f16), 64K (bit) |
| **Quantization** | None | Binary (SQ in progress) | Scalar (f16) + Binary |
| **Sparse vectors** | No | No | Yes (sparsevec) |
| **SPLADE** | No | No | Yes (documented) |
| **Fusion method** | Weighted linear | RRF (user SQL) | RRF (user SQL) |
| **Custom fusion** | Fork source | Full SQL control | Full SQL control |
| **ColBERT** | No | No | Via VectorChord |
| **Cross-encoder** | App-layer | App-layer | In-DB (PostgresML) |
| **Metadata filters** | Rich (nested, enum, geo) | Basic (bitmap pre-filter) | Full SQL + JSONB |
| **Facets** | Native | None | Extension (pgfaceting) |
| **Geo** | Native (BKD tree) | None | PostGIS |
| **Single-call hybrid** | Yes | No (multi-CTE) | No (multi-CTE) |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D1:** sqlite-vec ANN timeline uncertainty — alpha builds exist but stable release date unknown
- **D2:** Orama's actual V8 memory representation may be more efficient than naive 8 bytes/number
- **D2:** sqlite-vec int8 quantization recall quality has no published benchmarks
- **D6:** Orama afterSearch + cross-encoder integration is architecturally feasible but untested

### Out of Scope (per Rubric)

- Architecture fit evaluation (covered by search-engine-decision report)
- Operational complexity and failure modes (covered by search-engine-decision report)
- Embedding model selection (covered by local-search-retrieval-stacks report)
- Cloud engine selection (separate product phase)

---

## References

### Evidence Files
- [evidence/d1-ann-algorithms.md](evidence/d1-ann-algorithms.md) — ANN support, brute-force ceilings, roadmaps
- [evidence/d2-vector-types-quantization.md](evidence/d2-vector-types-quantization.md) — Vector types, storage efficiency, recall benchmarks
- [evidence/d3-sparse-embeddings.md](evidence/d3-sparse-embeddings.md) — SPLADE/sparse support, three-way hybrid
- [evidence/d4-hybrid-fusion-methods.md](evidence/d4-hybrid-fusion-methods.md) — RRF vs weighted-sum, late interaction, score calibration
- [evidence/d5-metadata-filtering.md](evidence/d5-metadata-filtering.md) — Filter syntax, facets, geo, pre/post filtering
- [evidence/d6-reranking-pipeline.md](evidence/d6-reranking-pipeline.md) — Cross-encoder, ColBERT, multi-stage pipelines

### External Sources
- [pgvector GitHub](https://github.com/pgvector/pgvector) — Official repo, v0.8.2
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — Official repo, v0.1.9
- [Orama GitHub](https://github.com/oramasearch/orama) — Official repo
- [ParadeDB SPLADE integration](https://www.paradedb.com/blog/introducing-sparse) — SPLADE in PostgreSQL
- [VectorChord ColBERT](https://blog.vectorchord.ai/supercharge-vector-search-with-colbert-rerank-in-postgresql) — Late interaction in PostgreSQL
- [Jonathan Katz quantization benchmarks](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/) — halfvec vs bit recall
- [Alex Garcia hybrid search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — FTS5+sqlite-vec RRF patterns
- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) — PostgreSQL RRF reference
- [Transformers.js](https://huggingface.co/docs/transformers.js) — Cross-encoder models in Node.js

### Related Research
- [Search Engine Decision Report](/Users/edwingomezcuellar/reports/search-engine-decision/) — Architecture-specific decision (contentless, branching, lifecycle)
- [Local-First Search & Retrieval Stacks](/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/) — Comprehensive engine comparison
- [Orama Deep Dive](/Users/edwingomezcuellar/reports/orama-deep-dive/) — Source-code-level Orama assessment
- [PGlite Search Engine Evaluation](/Users/edwingomezcuellar/reports/pglite-search-engine-evaluation/) — PGlite viability assessment
