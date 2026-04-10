# Changelog

## 2026-04-05 — Deepen D3 SPLADE vs BM25 at small scale
**Update type:** Additive
**Why this pass happened:** User requested research on whether SPLADE provides meaningful improvement over BM25 at 1K-10K document scale

### Scope (delta only)
- D3 (Sparse Embeddings) — new subsection D3.1 investigating SPLADE vs BM25 effectiveness at small corpus sizes

### What changed (current-state)
- REPORT.md — added D3.1 subsection under D3 with BEIR small-dataset benchmarks, computational cost analysis, and practical recommendation; updated `updatedAt` to 2026-04-05
- Evidence — appended "SPLADE vs BM25 at Small Scale" section to existing `evidence/d3-sparse-embeddings.md` with 6 new findings and negative search documentation; replaced former gaps section

### Notes on confidence / contradictions
- No controlled study exists that isolates corpus size as a variable for SPLADE vs BM25 — findings are inferred from BEIR small datasets (indirect evidence)
- ArguAna (8.7K docs) shows 52% SPLADE improvement, contradicting the "marginal gain" pattern — but ArguAna's counterargument retrieval task has atypical vocabulary mismatch characteristics
- Amazon "Keyword search is all you need" paper is tangentially relevant (compares grep vs RAG, not BM25 vs SPLADE)

### Open questions / gaps
- No controlled corpus-size scaling study (1K -> 10K -> 100K -> 1M) measuring SPLADE vs BM25 delta exists in the literature
- SPLADE fine-tuning data requirements for small domain-specific corpora undocumented
