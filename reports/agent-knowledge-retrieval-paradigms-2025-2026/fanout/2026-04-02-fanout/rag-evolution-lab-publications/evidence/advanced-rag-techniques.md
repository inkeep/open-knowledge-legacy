---
name: Advanced RAG Techniques
description: Reranking, HyDE, multi-step retrieval, query decomposition, and contextual retrieval — the 2023-2025 refinement era
type: evidence
dimension: D1.2
confidence: high
sources:
  - title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
    authors: "Khattab & Zaharia"
    venue: "SIGIR 2020, arXiv:2004.12832"
    date: "2020"
    url: "https://arxiv.org/abs/2004.12832"
  - title: "Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)"
    authors: "Gao et al."
    venue: "ACL 2023, arXiv:2212.10496"
    date: "2023"
    url: "https://arxiv.org/abs/2212.10496"
  - title: "Introducing Contextual Retrieval"
    authors: "Anthropic"
    venue: "Anthropic blog"
    date: "2024-09"
    url: "https://www.anthropic.com/news/contextual-retrieval"
  - title: "Cohere Rerank 3.5"
    authors: "Cohere"
    venue: "Cohere blog"
    date: "2024-12"
    url: "https://cohere.com/blog/rerank-3pt5"
---

# Advanced RAG Techniques (2023-2025)

## Reranking

Reranking adds a cross-encoder stage after initial vector retrieval to re-score results with higher fidelity.

**ColBERT** (Khattab & Zaharia, SIGIR 2020): Introduced late interaction — encodes queries and documents separately, then computes fine-grained token-level similarity. Enabled both efficient retrieval and high-quality scoring.

**Cohere Rerank 3.5** (December 2024): Achieved SOTA on BEIR benchmark for retrieval quality. By 2025, reranking was considered "no longer optional" by practitioners — a standard component of any production RAG stack.

**Jina Reranker** (2024): Claimed ~20% improvement over vector search alone in retrieval precision.

**Practical impact**: Reranking is cheap (runs on a small model) and dramatically improves retrieval precision. The pattern: retrieve 50-100 candidates via vector search, rerank to top-5. Works with any embedding model.

## HyDE (Hypothetical Document Embeddings)

**Gao et al. (ACL 2023, arXiv:2212.10496)**: Instead of embedding the query directly, generate a hypothetical answer document, then embed that document and use it for retrieval.

- Outperformed Contriever without fine-tuning on multiple benchmarks
- Works because the hypothetical answer is closer in embedding space to the real answer than the original question
- Limitation: adds latency (one extra LLM call) and can hallucinate misleading hypothetical documents

## Multi-Step / Recursive Retrieval

The pattern: retrieve → generate intermediate answer → use that to retrieve again → generate final answer.

**LlamaIndex RetryQueryEngine**: Implements retry logic where if initial retrieval doesn't yield sufficient information, the query is reformulated and retrieval is attempted again.

**Recursive retrieval**: Documents reference other documents; follow those references to build a complete answer. Particularly effective for documentation with cross-references.

## Query Decomposition

Break complex multi-part questions into simpler sub-queries, retrieve for each, then synthesize.

**Implementations**: Haystack/Deepset, NVIDIA RAG Blueprint both support query decomposition as a standard pipeline component.

**Example**: "How does the authentication system handle both OAuth and SAML?" → sub-queries: "How does authentication handle OAuth?" + "How does authentication handle SAML?"

## Contextual Retrieval (Anthropic, September 2024)

Anthropic's landmark contribution to the RAG space. The insight: chunks lose context when extracted from documents.

**Approach**: Before embedding each chunk, prepend a short LLM-generated context that explains what the chunk is about within the document. Example: "This chunk is from the API Authentication section of the Developer Guide, describing OAuth 2.0 token refresh."

**Results (full stack)**:
- Contextual embeddings alone: 35% reduction in retrieval failure
- Contextual embeddings + BM25 hybrid: 49% reduction
- Contextual embeddings + BM25 + reranking: **67% reduction** in retrieval failure

**Key insight**: The combination of contextual embeddings, keyword search (BM25), and reranking is far more powerful than any single technique. This became the reference architecture for production RAG in 2024-2025.

## The Cumulative Stack

By late 2024, the "advanced RAG" reference architecture:
1. Contextual chunk preparation (Anthropic approach)
2. Hybrid retrieval (vector + BM25/keyword)
3. Reranking (Cohere, Jina, or ColBERT)
4. Optional: query decomposition for complex questions
5. Optional: multi-step retrieval for follow-up

## Relevance to Knowledge Platform Design

For a ~100-1000 article KB:
- **Reranking** remains valuable even at small scale — BM25 + reranking is simple and effective
- **Contextual embeddings** less critical if returning full articles (context isn't lost)
- **Query decomposition** valuable when agents ask complex questions spanning multiple articles
- **Hybrid search (keyword + semantic)** is the minimum viable approach, well-proven
