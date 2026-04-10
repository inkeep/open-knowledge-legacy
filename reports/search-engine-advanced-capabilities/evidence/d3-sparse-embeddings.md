# Evidence: Sparse Embeddings

**Dimension:** D3 — Sparse embeddings (SPLADE, learned sparse, sparse vector storage)
**Date:** 2026-04-04
**Sources:** pgvector GitHub, ParadeDB blog, VectorChord docs, sqlite-vec docs, Orama docs

---

## Key files / pages referenced

- [pgvector 0.7.0 release notes](https://www.postgresql.org/about/news/pgvector-070-released-2852/) — sparsevec introduction
- [ParadeDB SPLADE blog](https://www.paradedb.com/blog/introducing-sparse) — SPLADE integration documented
- [VectorChord sparse vector docs](https://docs.vectorchord.ai/use-case/sparse-vector.html) — BGE-M3 sparse
- [pgvector sparsevec limits #818](https://github.com/pgvector/pgvector/issues/818) — 16K nonzero storage
- [pgvector sparsevec HNSW limits #747](https://github.com/pgvector/pgvector/issues/747) — 1K nonzero indexed

---

## Findings

### Finding: pgvector is the ONLY engine with native sparse vector support
**Confidence:** CONFIRMED

`sparsevec` type added in v0.7.0. Format: `{index:value,...}/dimensions`. Storage: up to 16,000 nonzero elements. HNSW indexing: capped at 1,000 nonzero elements. SPLADE typically has ~50-200 nonzero elements out of 30,522 total dims — well within limits.

All distance operators work: L2, inner product, cosine, L1. HNSW indexing supported for L2, IP, cosine.

### Finding: SPLADE integration explicitly documented for pgvector
**Confidence:** CONFIRMED

ParadeDB published detailed guide. 100K SPLADE vectors: HNSW index build ~200s (500 vec/s), indexed query top-10: 6ms, sequential scan: 150ms. 25x speedup with HNSW.

ParadeDB originally built pg_sparse as separate extension, then deprecated it when pgvector absorbed sparsevec natively.

### Finding: sqlite-vec has NO sparse vector support
**Confidence:** CONFIRMED
Only dense types: float32, int8, bit. No sparsevec equivalent, no GitHub issues requesting it.

### Finding: Orama has NO sparse vector support
**Confidence:** CONFIRMED
Only dense number[] vectors. No sparse type, no documentation mention.

### Finding: tsvector and learned sparse are complementary, not interchangeable
**Confidence:** CONFIRMED
tsvector = lexical token positions (BM25). sparsevec = learned float weights (SPLADE/BGE-M3). Different index types (GIN vs HNSW). Strongest retrieval uses all three: tsvector + vector + sparsevec.

---

## SPLADE vs BM25 at Small Scale (1K-10K Documents)

**Research date:** 2026-04-05
**Sources:** BEIR benchmark paper (NeurIPS 2021), SPLADE v2 (SIGIR 2022), SPLADE-v3 (arXiv 2403.06789), SPLADE efficiency study (SIGIR 2022, Lassance & Clinchant), SPLADE billion-scale study (arXiv 2511.22263), Amazon Science "Keyword search is all you need" (arXiv 2602.23368), Qdrant engineering blog, Elastic ELSER blog, Pinecone SPLADE explainer, BM25 benchmarks repo

---

### Finding: No published SPLADE benchmarks exist below 20M documents; smallest BEIR datasets (3.6K-8.7K) provide indirect evidence only
**Confidence:** CONFIRMED

All SPLADE benchmark papers use large corpora:
- MS MARCO: 8.8M passages (primary training/eval corpus)
- BEIR: 18 datasets ranging from 3.6K to 5.4M documents (zero-shot eval only)
- Billion-scale study (arXiv 2511.22263): 20M and 9B web document titles

The BEIR benchmark includes several small datasets that fall within the 1K-10K range:
- **SciFact:** 5,183 documents
- **NFCorpus:** 3,633 documents
- **ArguAna:** 8,674 documents

These are evaluated in zero-shot mode (SPLADE trained on MS MARCO, tested on BEIR without fine-tuning). No study specifically isolates corpus size as a variable — all use fixed datasets.

**Source:** [BEIR paper](https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/file/65b9eea6e1cc6bb9f0cd2a47751a186f-Paper-round2.pdf), [Elastic BEIR corpus sizes](https://www.elastic.co/search-labs/blog/evaluating-search-relevance-part-1)

### Finding: On small BEIR datasets (3.6K-8.7K docs), SPLADE's improvement over BM25 is inconsistent and often marginal
**Confidence:** CONFIRMED

SPLADE v2 NDCG@10 on small BEIR datasets vs BM25 (from SPLADE v2 paper, arXiv 2109.10086):

| Dataset (size) | BM25 | SPLADE distil | Delta | SPLADE wins? |
|---|---|---|---|---|
| SciFact (5,183) | 0.665 | 0.693 | +4.2% | Yes (marginal) |
| NFCorpus (3,633) | 0.325 | 0.334 | +2.8% | Yes (marginal) |
| ArguAna (8,674) | 0.315 | 0.479 | +52% | Yes (large) |

Note: SPLADE-v3 (2024) shows similar pattern — SciFact 0.710, NFCorpus 0.357, ArguAna 0.509. BM25 baseline unchanged.

BM25 benchmarks repo (xhluca/bm25-benchmarks) reports: SciFact BM25 = 0.681, NFCorpus = 0.318, ArguAna = 0.487 (variant-dependent, k1/b tuning matters).

Key observation: On SciFact and NFCorpus (the smallest datasets, 3.6K-5.2K docs), SPLADE's gain is 2.8-4.2% NDCG — within the range that query-by-query variance and BM25 parameter tuning can close. ArguAna is the exception (52% gain) but ArguAna has unusual query-document structure (counterargument retrieval) where vocabulary mismatch is the primary challenge.

**Source:** [SPLADE v2](https://arxiv.org/abs/2109.10086), [SPLADE-v3](https://arxiv.org/html/2403.06789), [BM25 benchmarks](https://github.com/xhluca/bm25-benchmarks/)

### Finding: SPLADE's advantage comes from vocabulary mismatch resolution — this benefit scales with corpus heterogeneity, not corpus size
**Confidence:** INFERRED

SPLADE's learned term expansion addresses the vocabulary mismatch problem: BM25 can only match literal terms, while SPLADE learns to expand "spaghetti" to activate "pasta." This advantage is:
- **Large** when query and document vocabularies diverge (ArguAna: counterargument retrieval; BRIGHT Biology: research terminology)
- **Small** when query terms appear directly in documents (SciFact: scientific claims with shared vocabulary; e-commerce product search with exact model numbers)

Premai blog analysis: hybrid search (BM25 + semantic) helps most "where vocabulary mismatch between queries and documents is highest." WANDS furniture e-commerce saw only +1.7% NDCG improvement with hybrid, while BRIGHT Biology saw +24%.

At 1K-10K documents in a knowledge base with consistent domain vocabulary, BM25's lexical coverage is proportionally higher — the smaller the corpus, the more likely any given query term appears literally in relevant documents. SPLADE's expansion adds less incremental value.

**Source:** [Premai hybrid search blog](https://blog.premai.io/hybrid-search-for-rag-bm25-splade-and-vector-search-combined/), [Qdrant sparse embeddings](https://qdrant.tech/articles/sparse-embeddings-ecommerce-part-1/)

### Finding: BM25 is more robust than SPLADE in zero-shot/out-of-domain settings
**Confidence:** CONFIRMED

Multiple sources confirm BM25's generalization advantage:
- Qdrant: SPARTA and early sparse neural retrievers "show good results on MS MARCO test data, but when it comes to generalisation (working with other data), they could perform worse than BM25"
- BEIR paper finding: "BM25 is a strong baseline; document expansion (docT5query) and BM25+cross-encoder re-ranking are competitive or better"
- BM25's static term statistics provide "advantageous generalization in the absence of dense in-domain training"
- Zilliz: "the performance of SPLADE is not guaranteed to be better than BM25 if the same model is used for different data domains"

SPLADE models trained on MS MARCO may underperform BM25 on domain-specific small corpora unless fine-tuned — and fine-tuning requires labeled query-document pairs that are expensive to create for a 1K-10K doc corpus.

**Source:** [Qdrant modern sparse retrieval](https://qdrant.tech/articles/modern-sparse-neural-retrieval/), [Zilliz SPLADE vs BM25](https://zilliz.com/learn/comparing-splade-sparse-vectors-with-bm25)

### Finding: SPLADE adds 40-50ms query encoding latency (GPU) on top of retrieval time; BM25 query processing is sub-millisecond
**Confidence:** CONFIRMED

SPLADE computational cost:
- **Query encoding:** 40-50ms per query on GPU (T4). SPLADE requires a forward pass through a BERT-based model (110M parameters for naver/splade-v3) for every query. BM25 query processing is tokenization + index lookup (sub-millisecond).
- **Efficient SPLADE variants:** distilSplade_sep reduced latency from 122.5ms to 50.2ms (59% decrease) via encoder separation (Lassance & Clinchant, SIGIR 2022)
- **Retrieval latency (large scale):** BM25 1.02s vs SPLADE 1.96s vs Expanded-SPLADE 1.20s for long queries on 9B docs (arXiv 2511.22263). At 1K docs, retrieval time is negligible for both.
- **Short query anomaly:** SPLADE shows 4.75s latency on short queries (1.5 words avg) vs 0.75s for BM25 on the billion-scale benchmark — SPLADE's expansion mechanism adds more overhead for shorter inputs.
- **GPU requirement:** SPLADE query encoding effectively requires GPU for production latency. On CPU, transformer inference for 110M parameter model is 200-500ms+ per query.
- **Document encoding throughput:** ~50 QPS on T4 GPU. For a 10K document corpus, initial index build (encoding all documents) takes ~200 seconds on GPU, vs near-instant for BM25.

**Source:** [SPLADE efficiency study](https://dl.acm.org/doi/10.1145/3477495.3531833), [arXiv 2511.22263](https://arxiv.org/html/2511.22263v1), [Sentence Transformers efficiency docs](https://sbert.net/docs/sparse_encoder/usage/efficiency.html)

### Finding: The Amazon "Keyword search is all you need" paper shows agentic keyword search achieves 88-94% of RAG performance — but does not compare BM25 to SPLADE
**Confidence:** CONFIRMED

The paper (Subramanian et al., 2026, arXiv 2602.23368) compares:
- **Agentic keyword search** (regex via RipGrep-All + PDFGrep, iterative refinement) vs **Traditional RAG** (Amazon Bedrock + Titan Embedding + OpenSearch)
- Datasets: 5 small document corpora (individual PDFs — PaulGrahamEssay, Llama2Paper, HistoryOfAlexnet, BlockchainSolana, LLM Survey paper) + FinanceBench (financial filings)
- Results: keyword search agent achieves 94.52% faithfulness attainment, 88.05% context recall attainment, 91.48% answer correctness attainment vs RAG baseline

This paper does NOT address SPLADE, BM25, or sparse learned retrieval. It compares regex-based keyword search (grep) against vector-based RAG. The finding is relevant to the broader question ("is sophisticated retrieval needed at small scale?") but does not directly inform the SPLADE vs BM25 comparison.

**Source:** [Amazon Science](https://www.amazon.science/publications/keyword-search-is-all-you-need-achieving-rag-level-performance-without-vector-databases-using-agentic-tool-use), [arXiv 2602.23368](https://arxiv.org/abs/2602.23368)

### Finding: Elastic ELSER (production SPLADE variant) beats BM25 on 10 of 12 BEIR datasets with average 17% NDCG@10 improvement — but the 1 loss and 1 draw are not identified by dataset
**Confidence:** CONFIRMED

Elastic's ELSER (Elastic Learned Sparse Encoder), a 100M parameter SPLADE-variant trained for production use, shows "10 wins, 1 draw, and 1 loss and an average improvement in NDCG@10 of 17%" across 12 BEIR datasets. The specific dataset where BM25 wins is not named in the blog post.

This aggregate number masks the per-dataset variance observed in the SPLADE v2 paper: large gains on some datasets (ArguAna +52%), marginal on others (NFCorpus +2.8%).

**Source:** [Elastic ELSER blog](https://www.elastic.co/search-labs/blog/elastic-learned-sparse-encoder-elser-retrieval-performance)

---

## Negative searches

- Searched: "SPLADE small corpus" "SPLADE 1000 documents" "SPLADE 10K documents" "sparse retrieval small scale benchmark" across Google Scholar, arXiv, ACM DL → No papers specifically benchmark SPLADE at sub-100K corpus sizes as a controlled variable
- Searched: "BM25 vs SPLADE corpus size effect" "SPLADE diminishing returns small corpus" → No controlled study varying corpus size while holding other variables constant
- Searched: Amazon Science "keyword search is all you need" for SPLADE-specific content → Paper uses regex/grep, not BM25 or SPLADE

---

## Gaps / follow-ups

- No benchmarks for BGE-M3 sparse mode with pgvector sparsevec
- No controlled study exists that varies corpus size (1K → 10K → 100K → 1M) while measuring SPLADE vs BM25 delta — this would be the definitive answer but doesn't exist in the literature
- SPLADE fine-tuning cost for domain-specific small corpus is undocumented — labeled data requirements unknown
