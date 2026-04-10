# Evidence: Hybrid Fusion Methods

**Dimension:** D4 — RRF, weighted-sum, cross-encoder reranking, late interaction
**Date:** 2026-04-04
**Sources:** Orama docs, Alex Garcia blog, Supabase docs, ParadeDB blog, VectorChord blog

---

## Key files / pages referenced

- [Orama hybrid search docs](https://docs.orama.com/docs/orama-js/search/hybrid-search) — weighted linear combination
- [Alex Garcia hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — 3 fusion patterns
- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) — RRF function
- [ParadeDB hybrid search manual](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual) — RRF + weighted
- [VectorChord ColBERT rerank](https://blog.vectorchord.ai/supercharge-vector-search-with-colbert-rerank-in-postgresql) — late interaction

---

## Findings

### Finding: Orama uses weighted linear combination, not RRF
**Confidence:** CONFIRMED
Formula: `hybrid_score = w_text * BM25_normalized + w_vec * cosine_similarity`. Default weights 0.5/0.5. Score normalization internal/opaque. Single `search()` call with `mode: 'hybrid'`. OSS SDK does not expose `hybridWeights` parameter.

### Finding: SQLite FTS5 + sqlite-vec uses RRF (rank-based, no score normalization needed)
**Confidence:** CONFIRMED
Three documented patterns: (1) keyword-first union, (2) RRF via CTEs with configurable k=60, (3) semantic re-ranking. RRF avoids score calibration entirely. Full user control via SQL.

### Finding: PostgreSQL uses RRF (multiple documented implementations)
**Confidence:** CONFIRMED
Supabase: RRF function with configurable weights and k=50. ParadeDB: weighted RRF + min-max normalized weighted linear. Both well-documented with production examples.

### Finding: Late interaction (ColBERT) only viable in PostgreSQL ecosystem
**Confidence:** CONFIRMED
pgvector provides storage (`vector[]`) but not MaxSim operator. VectorChord 0.3 provides full ColBERT reranking with indexing. ColBERT achieved 51.6 NDCG@10 vs 41.6 for dense vector. ColPali supported via `bit[]`. Neither sqlite-vec nor Orama support multi-vector embeddings.

### Finding: Custom fusion fully controllable in SQL engines, opaque in Orama
**Confidence:** CONFIRMED
SQLite/PostgreSQL: write any fusion formula in SQL. Orama: must fork source code to change fusion logic.

---

## Gaps / follow-ups

- Orama's internal normalization details would require source code inspection
- ColBERT/VectorChord performance at small scale (1K docs) not benchmarked
