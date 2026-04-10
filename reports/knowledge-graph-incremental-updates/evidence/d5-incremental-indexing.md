# Evidence: Efficient Incremental KG Indexing

**Dimension:** D5 — Efficient incremental indexing (embedding indexes, LSH/blocking, ANN search)
**Date:** 2026-03-21
**Sources:** arxiv.org/html/2504.01557v3 (FastER), arxiv.org/html/2401.08281v4 (FAISS library), dl.acm.org/3589777 (high-throughput vector search in KGs), arxiv.org/pdf/1905.06167 (blocking survey), medium.com/data-science-in-your-pocket (LightRAG), arxiv.org/html/2507.03226v2

---

## Key files / pages referenced
- https://arxiv.org/html/2504.01557v3 — FastER property graph ER
- https://arxiv.org/html/2401.08281v4 — FAISS library paper
- https://dl.acm.org/doi/10.1145/3589777 — High-throughput vector similarity in KGs
- https://arxiv.org/pdf/1905.06167 — Blocking/filtering survey
- https://scads.ai/research/data-quality/entity-resolution-on-heterogeneous-kgs — ScaDS.AI ER on KGs
- https://rabmcmenemy.medium.com — FAISS + KG system design

---

## Findings

### Finding: Standard incremental matching pipeline is two-phase: blocking (candidate generation) + pairwise classification
**Confidence:** CONFIRMED
**Evidence:** Multiple sources (blocking survey, FastER, iText2KG)

```text
"Plain enumeration approaches increase workload of entity alignment and lead to less efficient
alignment." "Finding nearest neighbors in high-dimensional spaces is computationally infeasible,
so approximate nearest neighbor search via LSH is employed."
Two phases: (1) blocking reduces N² pairs to O(N) candidates, (2) classifier on candidates.
```

**Implications:** For a KG with N=1M entities, naive pairwise comparison = 10¹² pairs. With effective blocking (reduction ratio 99.9%), that becomes ~1M candidate pairs — tractable. The blocking quality ceiling is critical: false negative from blocking (missed match) is unrecoverable.

---

### Finding: FAISS supports incremental add without full index rebuild via IVF quantizers
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2401.08281v4 (FAISS library paper) + search summaries

```text
"New vectors can be added without rebuilding the entire index." "Pre-trained quantizers used
to train IVF quantizers on representative samples, then assign new vectors to existing clusters
when new data arrives." FAISS IVF: clusters embeddings into Voronoi cells, probes k nearest
cells at query time.
```

**Implications:** FAISS incremental add is append-only — vectors are added to existing IVF cells without redistribution. Quality degrades if distribution of new entities differs significantly from training distribution (Voronoi cells become unbalanced). Full re-training of quantizer recommended every N new entities (typical: when 10-20% of index has been appended). Milvus wraps FAISS with segment-level indexing that handles this better for production KGs.

---

### Finding: LSH/MinHash blocking for name-based candidate generation — configurable threshold trades recall vs. precision
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/pdf/1905.06167 + search results

```text
"MinHash/LSH operates over n-gram representation of name values, hashes similar entities into
same cluster." "LSH threshold can be adjusted to balance recall, precision, and performance."
"LSH transforms blocking key value into bag of shingles (tokens or q-grams), shingles transformed
via MinHash to create hash code used to generate blocks."
```

**Implications:** LSH is fast (O(N) approximate) but name-only. For KG entities with rich attributes (descriptions, aliases), attribute-level LSH (multiple blocking keys) improves recall. JedAI3 uses multi-key blocking for this reason. The blocking threshold is the critical hyperparameter: too high = many false negatives (missed merges), too low = too many candidate pairs.

---

### Finding: FastER achieves near-linear complexity O(m + βC + C'log C' + N·k') where β<0.1 empirically
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2504.01557v3

```text
"m=edges, C=candidate pairs, β=filtering effectiveness fraction (<0.1 empirically),
C'=filtered pairs, N=target entities, k'=average candidates per entity (typically <5)."
"Removing rules filtering increases comparisons 453-1000x."
"Removing blocking increases comparisons 10-30x."
```

**Implications:** FastER's efficiency is almost entirely from the GDD filtering stage (β factor). This generalizes: any rule-based pre-filter that can reduce candidates by 90%+ provides 10x efficiency gain over blocking-only approaches. The N·k' term (progressive scheduling over k' candidates per entity) is typically the dominating factor at scale.

---

### Finding: HNSW (Hierarchical Navigable Small World) graphs outperform IVF for dynamic KG scenarios
**Confidence:** INFERRED
**Evidence:** https://dl.acm.org/doi/10.1145/3589777 (from 403 response — from abstract/search context)

```text
"High-throughput vector similarity search in knowledge graphs" — paper focuses on KG-native
indexing. HNSW provides logarithmic insertion and search complexity with no batch rebuild needed.
Used by most modern vector DBs (Weaviate, Qdrant, Milvus with HNSW) for dynamic scenarios.
```

**Implications:** For incremental KG entity matching, HNSW is preferred over IVF because: (1) no periodic quantizer retraining needed, (2) O(log N) insertion, (3) maintains quality as graph grows. Trade-off: higher memory usage (graph structure overhead) vs. IVF (compressed inverted lists). At 10M+ entities, IVF+PQ may be necessary for memory budgets.

---

### Finding: Three blocking quality metrics: Reduction Ratio (RR), Pairs Completeness (PC), F-measure balance
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/pdf/1905.06167 (blocking survey)

```text
"Reduction Ratio = 1 - (candidate pairs / total pairs). Pairs Completeness = matched duplicates
captured / total duplicates. F-measure = harmonic mean of PC and RR."
Meta-blocking post-processes initial blocks: edge weights in bipartite graph, pruning low-weight edges.
```

**Implications:** An incremental blocking system should track these metrics as new entities arrive. Degrading PC over time signals that the blocking strategy no longer covers new entity types. Degrading RR signals the index is generating too many false positives (expensive downstream classification).

---

### Finding: Production pattern — LightRAG and Neo4j both use embedding similarity for deduplication, not string matching
**Confidence:** CONFIRMED
**Evidence:** https://lightrag.github.io/ + Neo4j search summaries

```text
"LightRAG: deduplication identifies and merges identical entities from different segments."
"Neo4j 2025: replaced slow LLM-based resolution with distance metrics for scalable parallel merging."
iText2KG: cosine similarity with text-embedding-3-large at 0.7 threshold.
```

**Implications:** The industry has converged on embedding-similarity-based deduplication for LLM-extracted KG entities. String matching fails because LLM extraction produces semantically equivalent but textually different entity names ("United States", "USA", "U.S.A."). Embedding similarity handles lexical variation but requires a capable embedding model (text-embedding-3-large or equivalent).

---

## Negative searches
- Searched: FAISS incremental index quality degradation benchmarks → Found: general guidance only, no KG-specific benchmarks
- Searched: Milvus vs. FAISS for KG entity matching at scale → Found: general comparisons, not KG-specific

---

## Gaps
- Quantitative comparison of HNSW vs. IVF for incremental KG entity matching at different scales — not found in accessible sources
- Memory overhead benchmarks for embedding-based blocking at KG scale (>100M entities) — open question
