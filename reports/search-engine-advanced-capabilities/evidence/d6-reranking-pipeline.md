# Evidence: Reranking Pipeline

**Dimension:** D6 — Cross-encoder support, custom scoring, multi-stage retrieval
**Date:** 2026-04-04
**Sources:** PostgresML docs, ParadeDB blog, Orama plugin API, Transformers.js docs, production RAG examples

---

## Key files / pages referenced

- [PostgresML reranking](https://www.llamaindex.ai/blog/improving-vector-search-reranking-with-postgresml-and-llamaindex) — in-database cross-encoder
- [ParadeDB retrieve-and-rerank](https://www.paradedb.com/blog/personalized-search-in-postgresql) — SQL-native
- [Production pgvector + cross-encoder pipeline](https://dev.to/martin_palopoli/how-i-built-a-production-rag-pipeline-with-fastapi-pgvector-and-cross-encoder-reranking-j2o)
- [Orama plugin docs](https://docs.orama.com/open-source/plugins/writing-your-own-plugins) — afterSearch hook
- [Transformers.js](https://huggingface.co/docs/transformers.js) — local cross-encoder in Node.js

---

## Findings

### Finding: PostgreSQL has the most mature reranking ecosystem
**Confidence:** CONFIRMED
PostgresML: in-database cross-encoder via `pgml.rank()`. ParadeDB: BM25 + vector retrieve-and-rerank in SQL. VectorChord: ColBERT MaxSim reranking. Production three-stage documented: BM25 top-100 → vector top-50 → cross-encoder top-15 (100-300ms on CPU for 50 candidates).

### Finding: Orama has afterSearch hook but no documented reranking examples
**Confidence:** CONFIRMED
`afterSearch(db, params, language, results)` async hook available. Could wire cross-encoder through it. No community examples found. Three built-in scoring algorithms (BM25, QPS, PT15) but no custom algorithm API.

### Finding: sqlite-vec has no reranking hooks; app-layer or SQL CTE only
**Confidence:** CONFIRMED
FTS5 retrieve → vec0 distance rerank documented (Alex Garcia's pattern 3). Custom scoring via SQLite UDFs possible. Cross-encoder is strictly application-layer.

### Finding: Cross-encoder latency at small scale is acceptable
**Confidence:** CONFIRMED
ms-marco-MiniLM-L-6-v2: 100-300ms for 50 candidates on CPU. At 1K docs, retrieve top-50 via hybrid search (~5ms), rerank via cross-encoder (~200ms) = ~205ms total. Below 300ms threshold.

### Finding: @huggingface/transformers v3 supports ~340 ONNX cross-encoder models in Node.js
**Confidence:** CONFIRMED
Local cross-encoder inference without Python. Models include ms-marco-MiniLM-L-6-v2, bge-reranker-v2-m3. Cloud alternatives: Cohere Rerank API, Jina Reranker.

### Finding: At 1K-10K docs, two-stage may outperform three-stage
**Confidence:** INFERRED
ParadeDB: cross-encoders are for "5% of cases where squeezing out final drops of relevance is worth extra latency." At small scale, brute-force vector KNN has high recall already. Cross-encoder adds relevance but the marginal gain over hybrid search is smaller when the corpus is small.

---

## Gaps / follow-ups

- No benchmarks for Transformers.js cross-encoder latency specifically in Bun/Node
- Orama afterSearch + cross-encoder integration untested — feasibility confirmed but not validated
