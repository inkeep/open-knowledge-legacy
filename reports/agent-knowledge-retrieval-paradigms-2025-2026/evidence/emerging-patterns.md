# Evidence: Emerging Patterns — What Actually Works (D7)

**Dimension:** D7 — Emerging Patterns — What Actually Works
**Date:** 2026-04-03
**Sources:** Production case studies, practitioner reports, benchmarks, surveys
**Sub-report evidence:** fanout/2026-04-02-fanout/emerging-patterns-mcp-interface/evidence/ (10 files)

---

## Key Findings

### Finding: Hybrid search + reranking improves accuracy 20-40% (search) + 33-48% (reranking)
**Confidence:** CONFIRMED
**Evidence:** [VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking); [Ailog study](https://app.ailog.fr/en/blog/news/reranking-cross-encoders-study); Anthropic contextual retrieval

Standard practice: retrieve 50-100 candidates via hybrid, rerank to top 5-10. Reciprocal Rank Fusion (RRF) is the standard merge algorithm.

### Finding: "RAG is dead" narrative is definitively refuted
**Confidence:** CONFIRMED
**Evidence:** [arXiv 2501.01880](https://arxiv.org/abs/2501.01880); [RAGFlow review](https://ragflow.io/blog/rag-review-2025-from-rag-to-context)

Long context and RAG are complementary. RAG preserves 95% accuracy with 25% of tokens (75% cost reduction). Lost-in-the-middle effect persists (10-20+ pp accuracy drop). RAG helps smaller models most (82.58% win-rate).

### Finding: Production systems converge on identical architecture
**Confidence:** CONFIRMED
**Evidence:** [Vespa/Perplexity case study](https://vespa.ai/perplexity/); [Perplexity research blog](https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api); Glean, You.com, Notion AI documentation

Common pattern: Query Understanding -> Hybrid Retrieval -> Multi-Stage Ranking -> Chunk Extraction -> Grounded Generation. Perplexity: strict grounding ("not supposed to say anything you didn't retrieve").

### Finding: Six distinct agentic KB patterns have crystallized
**Confidence:** CONFIRMED
**Evidence:** [The New Stack](https://thenewstack.io/agentic-knowledge-base-patterns/)

1. Coding assistant playbooks, 2. Integration knowledge centers, 3. Multi-agent home bases, 4. Shared business context layers, 5. Semantic layers, 6. MCP-powered capability layers.

### Finding: Two-layer architecture emerging — Skills (markdown) + MCP (tools)
**Confidence:** INFERRED
**Evidence:** [The New Stack](https://thenewstack.io/skills-vs-mcp-agent-architecture/); [Block/Goose blog](https://block.github.io/goose/blog/2025/12/22/agent-skills-vs-mcp/)

Skills cut token costs 100x vs equivalent MCP server tool descriptions for stable knowledge.

### Finding: ~200K tokens is the breakpoint where RAG becomes necessary over context-stuffing
**Confidence:** INFERRED (extrapolated from multiple sources)
**Evidence:** [Pinecone blog](https://www.pinecone.io/blog/why-use-retrieval-instead-of-larger-context/); production system data

Below 200K tokens (~500 pages): context stuffing viable. Above: RAG is necessary for accuracy and cost.
