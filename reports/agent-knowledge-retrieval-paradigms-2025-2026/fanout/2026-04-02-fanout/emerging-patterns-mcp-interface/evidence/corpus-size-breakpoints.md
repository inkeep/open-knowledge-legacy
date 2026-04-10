---
title: "Corpus Size Breakpoints: When to Use Which Retrieval Strategy"
type: evidence
dimension: D8
facet: kb-size-breakpoints
confidence: high
sources:
  - url: https://www.pinecone.io/blog/why-use-retrieval-instead-of-larger-context/
    title: "Less is More: Why Use Retrieval Instead of Larger Context Windows — Pinecone"
    type: vendor-research
  - url: https://www.spyglassmtg.com/blog/rag-vs.-prompt-stuffing-overcoming-context-window-limits-for-large-information-dense-documents
    title: "RAG vs. Prompt Stuffing — Spyglass"
    type: practitioner-analysis
  - url: https://www.marktechpost.com/2026/02/24/rag-vs-context-stuffing-why-selective-retrieval-is-more-efficient-and-reliable-than-dumping-all-data-into-the-prompt/
    title: "RAG vs. Context Stuffing — MarkTechPost"
    type: analysis
  - url: https://datanucleus.dev/rag-and-agentic-ai/agentic-rag-enterprise-guide-2026
    title: "Agentic RAG in 2026: The UK/EU enterprise guide — Data Nucleus"
    type: enterprise-guide
date_collected: 2026-04-03
---

# Corpus Size Breakpoints for Retrieval Strategy

## The Core Framework

The optimal retrieval strategy shifts dramatically based on corpus size. Here are the empirically-grounded breakpoints:

### Tier 1: Micro KB (1-10 articles, <50K tokens)
**Strategy**: Context-stuff everything
- Full corpus fits in a single prompt alongside the query
- No retrieval infrastructure needed
- Best accuracy — LLM sees everything, no information loss
- Cost: negligible per query

**MCP implication**: A simple `get_all` or `dump` tool suffices. Or use an MCP Resource to provide the entire KB as context.

### Tier 2: Small KB (10-100 articles, 50K-500K tokens)
**Strategy**: Index-first + targeted read
- Full corpus may fit in some model context windows (200K+ token models) but with diminishing returns
- Lost-in-the-middle effect becomes significant above ~100K tokens
- **Breakpoint at ~200K tokens (~500 pages)**: Below this, context stuffing can work; above, retrieval becomes necessary (Pinecone, practitioner consensus)
- Index/TOC approach works well — agent browses structure, reads selectively

**MCP implication**: Expose `list_articles` (browse) + `read_article` (targeted read). Search optional but helpful.

### Tier 3: Medium KB (100-1000 articles, 500K-5M tokens)
**Strategy**: Search becomes necessary
- Context stuffing is impractical and expensive
- RAG preserves 95% of accuracy with 25% of the tokens (Pinecone)
- Hybrid search (keyword + semantic) provides best retrieval quality
- Agent needs discovery tools — can't browse 1000 articles linearly

**MCP implication**: `search` becomes the primary tool. `list_articles` useful for browsing categories. `get_overview` essential for orientation.

### Tier 4: Large KB (1000-10K+ articles, 5M-50M+ tokens)
**Strategy**: Sophisticated retrieval pipeline
- Multi-stage retrieval mandatory (retrieve → rerank → filter)
- Chunk-level retrieval becomes important (don't return full articles if only one section is relevant)
- Faceted search, metadata filtering essential for navigation
- Agentic retrieval patterns (iterative search, query decomposition) become valuable

**MCP implication**: Full tool suite needed. Consider server-side reranking, chunk-level results, faceted search tools.

## The Target Range: 100-1000 Articles

For the parent report's target (100-1000 markdown articles):

### What's Required
- **Search** (the agent can't browse 1000 articles)
- **Index/overview** (agent needs to understand KB structure)
- **Read by ID** (after search narrows options)
- **Metadata filtering** (category, tags, date)

### What's Optimal
- Hybrid search (keyword + semantic) with reranking
- Summary/outline layer for intermediate disclosure
- Relevance scoring in search results
- Paginated list/browse for category exploration

### What's Overkill
- GraphRAG / knowledge graph (KB is well-structured markdown, not enterprise chaos)
- Multi-agent retrieval orchestration (single search + read flow is sufficient)
- Real-time indexing (articles update weekly, not per-second)

## Cost-Efficiency Evidence

| Approach | Tokens per Query | Accuracy | Latency |
|---|---|---|---|
| Context-stuff 1000 articles | ~2-5M tokens | Variable (lost-in-middle) | High |
| RAG (top-10 chunks) | ~5-20K tokens | ~95% of full context | Low |
| Progressive (index → summary → read) | ~2-10K tokens | ~95%+ (targeted) | Low-Medium |

RAG at this scale: **100-250x token reduction** vs. context stuffing, with minimal accuracy loss.
