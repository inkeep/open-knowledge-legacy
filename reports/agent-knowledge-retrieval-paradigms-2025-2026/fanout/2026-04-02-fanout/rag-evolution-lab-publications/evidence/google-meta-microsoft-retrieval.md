---
name: Google, Meta, and Microsoft — Retrieval Research and Products
description: Google's long-context research and NotebookLM, Meta's CRAG and FAISS, Microsoft's GraphRAG and Copilot
type: evidence
dimension: D6.3-D6.5
confidence: high
sources:
  - title: "Lost in the Middle: How Language Models Use Long Contexts"
    authors: "Liu et al."
    venue: "TACL 2024, arXiv:2307.03172"
    date: "2023-07"
    url: "https://arxiv.org/abs/2307.03172"
  - title: "CRAG: Comprehensive RAG Benchmark"
    authors: "Meta"
    venue: "Meta Research"
    date: "2024-06"
    url: "https://ai.meta.com/research/publications/crag-comprehensive-rag-benchmark/"
  - title: "GraphRAG: From Local to Global"
    authors: "Edge et al."
    venue: "EMNLP 2024, arXiv:2404.16130"
    date: "2024-04"
    url: "https://arxiv.org/abs/2404.16130"
  - title: "Azure AI Search: Agentic Retrieval"
    authors: "Microsoft"
    venue: "Azure documentation"
    date: "2025"
    url: "https://learn.microsoft.com/en-us/azure/search/search-agentic-retrieval-concept"
  - title: "IterDRAG"
    authors: "Various"
    venue: "ICLR 2025"
    date: "2025"
  - title: "Google Developer Knowledge MCP Server"
    authors: "Google"
    venue: "Google Developers blog"
    date: "2026-02"
    url: "https://developers.googleblog.com/introducing-the-developer-knowledge-api-and-mcp-server/"
---

# Google / DeepMind

## Long Context Research

Google's primary contribution to the retrieval landscape has been pushing context window boundaries:
- **Gemini 1.5 Pro** (February 2024): 1M token context window
- **Gemini 2.0** (2025): Up to 2M token context window

However, Google's own documentation acknowledges RAG is still needed for cost and accuracy — long context is not a universal replacement.

## "Lost in the Middle" (Liu et al., TACL 2024)

While not exclusively a Google paper (Stanford/UC Berkeley), it used Google models prominently and remains the foundational finding:

- LLMs exhibit U-shaped attention — good at context start and end, poor in the middle
- This holds even for models trained on long contexts
- Directly argues against "stuff everything in context" approaches

## IterDRAG (ICLR 2025)

Shows **up to 58.9% accuracy gains** through inference-time scaling of RAG — iterating retrieval during generation. Key contribution from the Google/academic ecosystem demonstrating RAG's ceiling is much higher than naive implementations suggest.

## NotebookLM

Google's document understanding product uses **source-grounded RAG with inline citations**:
- Users upload documents, NotebookLM indexes them
- Responses are grounded in uploaded sources with specific citations
- "Audio Overview" feature generates podcast-style summaries
- Demonstrates the "user provides the corpus, system provides retrieval" pattern

## Google Developer Knowledge MCP Server (February 2026)

A production-grade MCP implementation from Google:
- **Two-phase architecture**: `SearchDocumentChunks` finds relevant URIs + snippets, then `GetDocument`/`BatchGetDocuments` fetches full content
- Serves Google's developer documentation as markdown
- Re-indexed within 24 hours of source changes
- Uses Streamable HTTP transport
- Plans to expand from "unstructured Markdown" to structured content (code samples, API reference)

This is the closest existing analog to the MCP knowledge platform being designed.

---

# Meta / FAIR

## The Origin of RAG

Meta originated the RAG concept itself: **Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," NeurIPS 2020**. This paper coined the term and established the paradigm.

## CRAG Benchmark (June 2024)

**Key findings**:
- Even SOTA RAG systems only answer **63% of questions** without hallucination
- Naive LLMs (no retrieval) hit **34%**
- This establishes a ~29 percentage point improvement from RAG and ~37 points of remaining gap

CRAG tests across multiple domains and question types, providing the most comprehensive evaluation of RAG quality in 2024.

## FAISS

Meta's FAISS (Facebook AI Similarity Search) remains the foundational open-source vector search library used by most RAG implementations. While not new, it continues to be the default for local/embedded vector search.

## Llama Stack (2025)

Meta's standardized AI development framework includes RAG APIs:
- Standard interfaces for retrieval, memory, and generation
- Enables portable RAG applications across different infrastructure
- Open-source approach to RAG standardization

---

# Microsoft

## GraphRAG (See separate evidence file: graphrag.md)

Microsoft's most significant retrieval contribution. Key details covered there.

## LazyGraphRAG (November 2024)

Microsoft's own correction for GraphRAG's cost problem:
- **0.1% of indexing cost** compared to full GraphRAG
- Defers graph construction to query time
- "Lazy" evaluation only builds needed graph portions

## Azure AI Search: Agentic Retrieval (2025)

Microsoft evolved Azure AI Search to support agentic patterns:
- **LLM-driven query decomposition**: The search service itself breaks complex queries into sub-queries
- **Multi-turn retrieval**: Supports iterative refinement
- **Tool integration**: Designed to work as an agent tool, not just a pipeline component

This represents a major cloud vendor explicitly building "agentic retrieval" into their search infrastructure.

## Copilot's Retrieval Architecture

Microsoft Copilot uses a proprietary pipeline:
- **Microsoft Graph**: Structured data (emails, calendar, files, people)
- **Semantic Index**: Embeddings over Microsoft 365 content
- **Grounding pipeline**: Combines Graph + Semantic Index results with the user's query

Key learning: For enterprise knowledge, structured data (Graph) combined with semantic search produces better results than either alone.

## BenchmarkQED

Microsoft's automated RAG evaluation framework — provides standardized metrics for comparing RAG approaches.

---

# Relevance to Knowledge Platform Design

**From Google**: The two-phase MCP architecture (search for metadata → fetch full content) from Google's Developer Knowledge MCP Server is the closest existing production analog to the target system.

**From Meta**: CRAG's finding that even SOTA RAG hits 63% accuracy reinforces that retrieval quality is still the bottleneck — agent-controlled iterative retrieval (agentic RAG) is necessary for high-quality answers.

**From Microsoft**: GraphRAG is overkill at 100-1000 articles, but Azure's "agentic retrieval" concept — where the search service supports agent-driven query decomposition — validates the pattern of giving agents search tools rather than pre-built pipelines.
