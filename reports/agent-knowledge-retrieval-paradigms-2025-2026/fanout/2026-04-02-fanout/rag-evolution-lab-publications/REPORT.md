---
title: "RAG Evolution and AI Lab Publications on Knowledge Retrieval (2023-2026)"
date: 2026-04-03
type: research-report
parent: agent-knowledge-retrieval-paradigms-2025-2026
dimensions:
  - id: D1
    name: "RAG Evolution and Current State"
    priority: P0
    depth: deep
  - id: D6
    name: "What Big Labs Publish"
    priority: P0
    depth: deep
confidence: high
evidence_count: 9
---

# RAG Evolution and AI Lab Publications on Knowledge Retrieval (2023-2026)

## Executive Summary

This report traces the evolution of Retrieval-Augmented Generation from naive chunk-embed-retrieve pipelines (2023) through advanced techniques (2024) to the agentic retrieval paradigm (2025-2026), and catalogs what Anthropic, OpenAI, Google, Meta, and Microsoft have published about knowledge retrieval for agents. The findings directly inform the design of an MCP server interface for an agent-native knowledge platform serving ~100-1000 markdown articles.

**Key thesis**: The field has undergone a paradigm shift from *pipeline RAG* (system-designed retrieval) to *agentic RAG* (agent-controlled retrieval). For a knowledge platform of 100-1000 articles, the optimal interface gives agents simple search tools rather than pre-built retrieval pipelines — and the evidence strongly converges on this pattern.

---

## D1: RAG Evolution and Current State

### D1.1: Classic RAG — What Worked and What Didn't

**Evidence**: [classic-rag-failures.md](evidence/classic-rag-failures.md)

The naive RAG pipeline (chunk → embed → retrieve top-k → generate) dominated 2023-early 2024. Barnett et al. ("Seven Failure Points When Engineering a RAG System," arXiv:2401.05856, January 2024) systematically documented seven failure modes across three domains: missing content, missed top-k, consolidation failure, extraction failure, wrong format, incorrect specificity, and incompleteness.

**The root cause is chunking.** Fixed-size chunks destroy semantic boundaries, lose pronoun references, and strip hierarchical context (section headers, document titles). A chunk saying "Revenue increased 3%" is meaningless without knowing the company, quarter, and revenue line. This single insight drives much of the subsequent evolution.

**What worked**: Vector similarity search for simple factual lookups. Keyword search (BM25) for precise term matching. The combination of both (hybrid search) outperformed either alone. Pre-processing documents with metadata enrichment improved retrieval quality significantly.

**What didn't work**: Fixed chunking strategies. Pure vector search without keyword augmentation. Single-stage retrieval without reranking. Retrieval without quality evaluation. All of these produced high hallucination rates from irrelevant or insufficient context.

### D1.2: Advanced RAG Techniques (2023-2025)

**Evidence**: [advanced-rag-techniques.md](evidence/advanced-rag-techniques.md)

The "refinement era" addressed classic RAG's failures through five key techniques:

**Reranking** (ColBERT, Cohere Rerank 3.5, Jina): Adding a cross-encoder scoring stage after initial retrieval dramatically improves precision. By late 2024, practitioners considered reranking "no longer optional." The pattern: retrieve 50-100 candidates via BM25 or vector search, rerank to top-5 via a cross-encoder.

**HyDE — Hypothetical Document Embeddings** (Gao et al., ACL 2023, arXiv:2212.10496): Generate a hypothetical answer, embed it, and use that embedding for retrieval. Outperformed Contriever without fine-tuning because the hypothetical answer is semantically closer to the real answer than the original question. Adds latency (one LLM call) but improves recall.

**Multi-step / recursive retrieval**: Retrieve → generate intermediate answer → use that to retrieve again → generate final answer. LlamaIndex's RetryQueryEngine implements this pattern. Particularly effective for documentation with cross-references.

**Query decomposition**: Break "How does auth handle both OAuth and SAML?" into sub-queries. Supported by Haystack/Deepset and NVIDIA RAG Blueprint.

**Contextual Retrieval** (Anthropic, September 2024): The landmark paper. Before embedding a chunk, prepend LLM-generated context explaining what the chunk is about within its document. Results: 35% failure reduction with contextual embeddings alone; 49% with BM25 hybrid; **67% with full stack** (contextual embeddings + BM25 + reranking). This became the reference architecture.

**The cumulative insight**: No single technique suffices. The production-grade stack by late 2024 was: contextual chunk preparation → hybrid retrieval (vector + BM25) → reranking → optional query decomposition.

### D1.3: Agentic RAG — The Paradigm Shift

**Evidence**: [agentic-rag.md](evidence/agentic-rag.md)

The most significant development in retrieval since RAG itself. The core shift: from the system designing retrieval strategy at build time to the agent controlling retrieval at inference time.

**Self-RAG** (Asai et al., NeurIPS 2023, arXiv:2310.11511): Trained the LLM to generate "reflection tokens" — deciding whether to retrieve, whether retrieved passages are relevant, and whether they support the generation. Pushed complex multi-hop accuracy from ~34% (naive RAG) toward ~78%.

**CRAG — Corrective RAG** (Yan et al., arXiv:2401.15884, January 2024): Added a retrieval evaluator. If retrieved docs are irrelevant, trigger web search as fallback. If ambiguous, refine query and re-retrieve. +19% on PopQA benchmark.

**The Agentic RAG Survey** (Singh et al., arXiv:2501.09136, January 2025): First comprehensive taxonomy — single-agent, multi-agent, and hierarchical agentic RAG. Documents the shift from "retrieve then generate" to "plan, retrieve, evaluate, re-retrieve, generate, verify."

**The Amazon Science bombshell** (arXiv:2602.23368, December 2025 / February 2026): "Keyword Search is All You Need" — agentic tool use with simple keyword search achieves **over 90% of RAG-level performance** without a vector database. Specific numbers: 94.52% faithfulness, 88.05% context recall, 91.48% answer correctness. This is the strongest evidence that the intelligence lies in the agent's retrieval strategy, not the retrieval infrastructure.

**LlamaIndex's framing** (2025): "RAG isn't 'always retrieve k chunks.' It's a decision stack." The agent decides its own search strategy, reformulates queries when results are poor, and iterates until confident.

### D1.4: GraphRAG

**Evidence**: [graphrag.md](evidence/graphrag.md)

**Microsoft's GraphRAG** (Edge et al., EMNLP 2024, arXiv:2404.16130): Constructs a knowledge graph from documents via LLM entity extraction, then uses community detection and hierarchical summarization to answer global queries that vector search cannot handle ("What are the main themes across this dataset?").

**Production reality**: ~$33K indexing cost for large datasets. Every chunk requires an LLM call for entity extraction; every community requires a summarization call.

**Corrections**:
- **LightRAG** (HKU, October 2024): 10x cheaper, 30% lower latency
- **LazyGraphRAG** (Microsoft, November 2024): 0.1% of indexing cost via query-time graph construction

**When GraphRAG wins**: Global/theme queries, cross-document synthesis, exploratory analysis.
**When it's overkill**: Specific factual queries, small corpora (100-1000 docs), rapidly changing content.

**For the target system** (100-1000 articles): Full GraphRAG is overkill. However, the insight about global vs. local queries is valuable. Frontmatter metadata (topics, tags) + explicit cross-references provide lightweight "graph" functionality without the infrastructure cost.

### D1.5: The "Long Context Kills RAG" Debate

**Evidence**: [long-context-vs-rag.md](evidence/long-context-vs-rag.md)

Context windows expanded from 4K (GPT-3.5, early 2023) to 2M (Gemini 2.0, 2025). Does this make RAG obsolete?

**"Lost in the Middle"** (Liu et al., TACL 2024, arXiv:2307.03172): LLMs exhibit a U-shaped attention curve — strong at context start and end, degraded in the middle. Even models trained on long contexts suffer this. Stuffing all documents into context doesn't guarantee they'll be used.

**The cost argument**: RAG costs ~$0.00008/query vs ~$0.10 for long context — a **1,250x difference**. A European bank case study found RAG was 67% more accurate on cross-document synthesis, 8x faster, and 94% cheaper.

**Li et al. (EMNLP 2024)**: Long context outperforms RAG in accuracy on many benchmarks but loses on cost/latency. Proposed **Self-Route**: attempt RAG first, fall back to long context when RAG confidence is low.

**LaRA (ICML 2025)**: **No universal winner.** Depends on query complexity, corpus size, freshness needs, and cost tolerance.

**Context rot** (documented 2025-2026): Unpredictable performance degradation as context expands. Models can catastrophically fail on specific information depending on position. Argues for retrieval-on-demand over pre-loading.

### D1.6: The 2025-2026 Consensus

**The field has converged on a hybrid approach**: Use retrieval to select the relevant 0.1% of the corpus, then long context to reason across the retrieved content.

Specifically:
1. **Retrieval remains necessary** for selection — you can't put 1000 articles in context
2. **Long context enables better reasoning** over retrieved content — retrieve 20 articles and reason, don't cram answers into 5 chunks
3. **Agentic control is preferred** — let agents decide what/when/how to retrieve
4. **Simple tools beat complex pipelines** — Amazon Science shows keyword search + agent intelligence achieves 90%+ of vector RAG performance
5. **RAG is a "knowledge runtime"** — an orchestration layer, not just a retrieval pipeline

---

## D6: What Big Labs Publish

### D6.1: Anthropic

**Evidence**: [anthropic-retrieval.md](evidence/anthropic-retrieval.md)

Anthropic has been the most influential lab for retrieval methodology.

**Contextual Retrieval** (September 2024): The reference paper for production RAG. Demonstrated that contextual embeddings + BM25 + reranking reduces retrieval failure by 67%. Established that no single technique suffices — the stack matters.

**MCP — Model Context Protocol** (November 2024): The protocol layer for agent-data connections. Three retrieval-relevant primitives: Resources (application-controlled data), Tools (agent-controlled functions), Prompts (templates). 8M+ server downloads by early 2026. The community consensus for knowledge retrieval: Tools for search, Resources for catalogs.

**Claude Code** (2025-2026): The highest-profile production example of agentic retrieval. No vector DB, no embeddings, no pre-indexing. Three tools: Glob (paths), Grep (content lines), Read (full files). Quote from Boris Cherny: "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better." The sub-agent pattern (Haiku-class model returns summaries, not raw content) is a key architecture choice.

**Context Engineering** (September 2025): Anthropic's framework. Core principle: "The smallest set of high-signal tokens that maximize the likelihood of your desired outcome." Key guidance: just-in-time retrieval over pre-loading, minimal tool surface (3-5 focused tools), sub-agents for context isolation.

### D6.2: OpenAI

**Evidence**: [openai-retrieval.md](evidence/openai-retrieval.md)

OpenAI has been product-first rather than research-first on retrieval.

**file_search** (Assistants/Responses API, 2023-2025): Hybrid search (vector + keyword + RRF reranking). Automatic, opaque chunking. Validates hybrid search as the default approach. Transitioned from Assistants API to Responses API in 2025.

**ChatGPT Memory**: Two-tier architecture — explicit memories (structured facts) + chat history reference. Not RAG over conversations but structured key-value storage with natural language keys. Demonstrates that structured fact storage outperforms RAG for agent personalization.

**Deep Research** (February 2025): o3-powered agent that autonomously browses the web for 5-30 minutes. The clearest example of agentic retrieval from OpenAI — the agent controls its own multi-step retrieval strategy entirely. Available via API (June 2025).

### D6.3: Google / DeepMind

**Evidence**: [google-meta-microsoft-retrieval.md](evidence/google-meta-microsoft-retrieval.md)

**Long context leadership**: Gemini 1.5 Pro (1M tokens, February 2024), Gemini 2.0 (2M tokens, 2025). Yet Google's own documentation acknowledges RAG is still needed for cost and accuracy.

**"Lost in the Middle"** (Liu et al., 2023/2024): The foundational paper on attention degradation, though a Stanford/UC Berkeley collaboration using Google models.

**IterDRAG** (ICLR 2025): Up to 58.9% accuracy gains through inference-time scaling of RAG. Demonstrates RAG's ceiling is much higher than naive implementations.

**NotebookLM**: Source-grounded RAG with inline citations. Users upload documents, the system indexes them, responses cite specific sources. The "user provides corpus, system provides retrieval" pattern.

**Google Developer Knowledge MCP Server** (February 2026): **The closest production analog to the target system.** Two-phase architecture: `SearchDocumentChunks` → `GetDocument`/`BatchGetDocuments`. Serves Google's developer documentation as markdown. Re-indexes within 24 hours. Uses Streamable HTTP transport.

### D6.4: Meta / FAIR

**Evidence**: [google-meta-microsoft-retrieval.md](evidence/google-meta-microsoft-retrieval.md)

**CRAG Benchmark** (June 2024): The most comprehensive RAG evaluation. Finding: even SOTA RAG only answers 63% of questions without hallucination; naive LLMs hit 34%. Establishes the ceiling and gap.

**FAISS**: Remains the foundational open-source vector search library.

**Llama Stack** (2025): Standardized AI development framework with RAG APIs. Enables portable RAG applications.

**Historical significance**: Meta originated RAG itself (Lewis et al., NeurIPS 2020).

### D6.5: Microsoft

**Evidence**: [google-meta-microsoft-retrieval.md](evidence/google-meta-microsoft-retrieval.md), [graphrag.md](evidence/graphrag.md)

**GraphRAG** (EMNLP 2024): Knowledge graph construction for global queries. $33K indexing cost. Followed by LightRAG (HKU) and LazyGraphRAG (Microsoft, 0.1% cost).

**Azure AI Search: Agentic Retrieval** (2025): A major cloud vendor explicitly building "agentic retrieval" into search infrastructure. LLM-driven query decomposition, multi-turn retrieval, designed as agent tools.

**Copilot**: Microsoft Graph (structured data) + Semantic Index (embeddings over M365 content). Demonstrates that combining structured data with semantic search outperforms either alone.

### D6.6: Notable 2025-2026 Academic Papers

**Key papers**:
- **Singh et al.** (arXiv:2501.09136, January 2025): "Agentic RAG Survey" — first comprehensive taxonomy of agent-controlled retrieval
- **Amazon Science** (arXiv:2602.23368, 2025-2026): "Keyword Search is All You Need" — 90%+ of RAG performance without vectors
- **LaRA** (ICML 2025): No universal winner between RAG and long context
- **IterDRAG** (ICLR 2025): 58.9% gains from inference-time RAG scaling
- **A-RAG** (arXiv:2602.03442, February 2026): Hierarchical retrieval interfaces for agents
- **Agent interoperability survey** (2025): Covers MCP/A2A/ACP as retrieval protocols

---

## Synthesis: What This Means for an Agent-Native Knowledge Platform

### The Arc of the Field

```
2023: Naive RAG         → "Chunk everything, embed, retrieve top-5"
2024: Advanced RAG      → "Contextual chunks, hybrid search, reranking"
2025: Agentic RAG       → "Give agents search tools, let them decide"
2026: Knowledge runtime → "Orchestration layer with agent-controlled retrieval"
```

### Seven Design Principles Emerging from the Research

**1. Tools over pipelines.** The entire trajectory of the field is from system-designed retrieval to agent-controlled retrieval. Expose search and read tools. Don't pre-build retrieval logic.

**2. Keyword search is a strong baseline.** Amazon Science shows 90%+ performance with keyword search alone when an agent controls the search strategy. For 100-1000 articles, BM25/FTS5 may be sufficient without vector embeddings. Semantic search is a valuable addition, not a requirement.

**3. Two-phase retrieval (search → read).** Google's MCP server, Claude Code's Glob → Read, and every production system converge on: lightweight search returns metadata/snippets, then the agent fetches full content for selected results. This is the "funnel" pattern.

**4. Full articles over chunks.** At the 100-1000 article scale, the retrieval unit should be the article, not the chunk. Most articles fit within a few thousand tokens. This avoids the entire class of chunking-related failures documented by Barnett et al.

**5. Frontmatter is the API layer.** Topics, tags, dates, summaries, cross-references in YAML frontmatter serve as structured metadata for filtering and navigation. Agents use metadata to narrow search before reading content. This provides lightweight "graph" functionality without GraphRAG infrastructure.

**6. Minimal tool surface (3-5 tools).** Anthropic's context engineering guidance: "If a human can't tell which tool to use, neither can the AI." The converging pattern:
   - `list_topics` or `get_index` — catalog/orientation
   - `search_articles(query, filters)` — keyword/semantic search
   - `get_article(id)` — full content retrieval
   - Optional: `get_related(id)` — cross-reference navigation

**7. Support iterative refinement.** Agentic RAG's power comes from the agent's ability to search, evaluate, refine, and re-search. The interface should support multiple search-read cycles, not assume one retrieval suffices.

### The Production Analog

**Google's Developer Knowledge MCP Server** (February 2026) is the closest existing production system to the target design:
- Serves developer documentation as markdown
- Two-phase: search → fetch full content
- MCP-native (Streamable HTTP)
- 24-hour re-indexing cycle
- Plans to expand from unstructured markdown to structured content

The key difference: the target system serves ~100-1000 articles (manageable corpus) to AI agents specifically (not human developers), which allows optimizing the interface for agent consumption patterns documented above.

---

## Evidence Index

| File | Dimension | Topic |
|------|-----------|-------|
| [classic-rag-failures.md](evidence/classic-rag-failures.md) | D1.1 | Naive RAG pipeline failure modes |
| [advanced-rag-techniques.md](evidence/advanced-rag-techniques.md) | D1.2 | Reranking, HyDE, contextual retrieval |
| [agentic-rag.md](evidence/agentic-rag.md) | D1.3 | Self-RAG, CRAG, agent-controlled retrieval |
| [graphrag.md](evidence/graphrag.md) | D1.4 | Microsoft GraphRAG and alternatives |
| [long-context-vs-rag.md](evidence/long-context-vs-rag.md) | D1.5 | Long context vs RAG debate |
| [anthropic-retrieval.md](evidence/anthropic-retrieval.md) | D6.1 | Anthropic publications and products |
| [openai-retrieval.md](evidence/openai-retrieval.md) | D6.2 | OpenAI publications and products |
| [google-meta-microsoft-retrieval.md](evidence/google-meta-microsoft-retrieval.md) | D6.3-5 | Google, Meta, Microsoft publications |
| [mcp-retrieval-patterns.md](evidence/mcp-retrieval-patterns.md) | D6.1+ | MCP server implementations for knowledge |
| [agent-retrieval-production.md](evidence/agent-retrieval-production.md) | D6+ | Production agent retrieval patterns |

---

## Key Citations (Primary Sources)

### Foundational Papers
- Barnett et al. "Seven Failure Points When Engineering a RAG System." arXiv:2401.05856, January 2024.
- Gao et al. "Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)." ACL 2023, arXiv:2212.10496.
- Asai et al. "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection." NeurIPS 2023 / ICLR 2024, arXiv:2310.11511.
- Yan et al. "Corrective Retrieval Augmented Generation." arXiv:2401.15884, January 2024.
- Liu et al. "Lost in the Middle: How Language Models Use Long Contexts." TACL 2024, arXiv:2307.03172.
- Edge et al. "From Local to Global: A Graph RAG Approach." EMNLP 2024, arXiv:2404.16130.
- Li et al. "RAG vs Long-Context LLMs." EMNLP 2024.
- Lewis et al. "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks." NeurIPS 2020.

### Lab Publications and Products
- Anthropic. "Introducing Contextual Retrieval." September 2024. https://www.anthropic.com/news/contextual-retrieval
- Anthropic. "Introducing the Model Context Protocol." November 2024. https://www.anthropic.com/news/model-context-protocol
- Anthropic. "Effective Context Engineering for AI Agents." September 2025. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Google. "Developer Knowledge MCP Server." February 2026. https://developers.google.com/knowledge/mcp
- Microsoft. "LazyGraphRAG." November 2024. https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/

### 2025-2026 Key Papers
- Singh et al. "Agentic RAG Survey." arXiv:2501.09136, January 2025.
- Amazon Science. "Keyword Search is All You Need." arXiv:2602.23368, 2025/2026.
- LaRA. ICML 2025.
- IterDRAG. ICLR 2025.
- A-RAG. arXiv:2602.03442, February 2026.

### MCP Implementations
- Will Larson. library-mcp. https://github.com/lethain/library-mcp
- pvliesdonk. markdown-vault-mcp. https://github.com/pvliesdonk/markdown-vault-mcp
- Vercel. "Make Documentation Readable by AI Agents." https://vercel.com/kb/guide/make-your-documentation-readable-by-ai-agents
- llms.txt specification. https://llmstxt.org/
