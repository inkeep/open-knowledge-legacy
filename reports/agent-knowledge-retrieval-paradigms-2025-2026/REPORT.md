---
title: "Agent Knowledge Retrieval Paradigms 2025-2026: From RAG to Agentic Retrieval"
description: "Comprehensive landscape of how AI agents retrieve and consume knowledge in 2025-2026 — from naive RAG to agentic retrieval, vector search to grep-based approaches. Covers RAG evolution, coding agent patterns, vector DB/memory tools, CX agent architectures, local KB systems, lab publications, emerging best practices, and MCP interface design implications. Directly informs the design of an agent-native knowledge platform serving ~100-1000 markdown articles."
createdAt: 2026-04-02
updatedAt: 2026-04-03
subjects:
  - Anthropic
  - OpenAI
  - Google
  - Microsoft
  - Meta
  - Claude Code
  - Cursor
  - Pinecone
  - Turbopuffer
  - Chroma
  - Weaviate
  - Mem0
  - Zep
  - Letta
  - Context7
  - Intercom Fin
  - Sierra AI
  - Decagon
  - Perplexity
  - Glean
topics:
  - retrieval augmented generation
  - agentic retrieval
  - knowledge retrieval
  - vector search
  - agent memory
  - MCP interface design
  - progressive disclosure
  - context engineering
---

# Agent Knowledge Retrieval Paradigms 2025-2026: From RAG to Agentic Retrieval

**Purpose:** Map the full spectrum of how AI agents retrieve and consume knowledge in 2025-2026. Inform the design of an MCP server interface for an agent-native knowledge platform serving ~100-1000 markdown articles with frontmatter.

---

## Executive Summary

The field of agent knowledge retrieval has undergone a paradigm shift between 2023 and 2026. The trajectory is clear: from system-designed retrieval pipelines (naive RAG) to agent-controlled retrieval (agentic RAG). The practical implication for a knowledge platform is equally clear: expose simple, composable tools and let the agent decide its retrieval strategy.

**The core answer to "what's the best interface for agents to consume knowledge from a structured KB of ~100-1000 articles?":**

A 4-tool MCP server implementing progressive disclosure: (1) `get_overview` for corpus orientation, (2) `search` with hybrid keyword+semantic retrieval and reranking, (3) `list_articles` for metadata browsing/filtering, (4) `read_article` for full content on demand. Content stays markdown. Metadata stays structured JSON. The agent decides the path.

This design is grounded in converging evidence from multiple independent sources: Anthropic's context engineering principles, Claude Code's production architecture (grep/glob/read with no pre-indexing), Karpathy's index-first pattern for personal KBs, Context7's two-tool MCP pattern (51.6K GitHub stars), production CX agents' universal adoption of hybrid search + reranking, and the Amazon Science finding that keyword search with agentic tool use achieves over 90% of vector RAG performance.

**Key Findings:**

- **The RAG-to-agentic arc is complete.** Naive RAG (2023) -> Advanced RAG with reranking/HyDE/contextual retrieval (2024) -> Agentic RAG where the agent controls retrieval (2025-2026). The consensus: tools over pipelines.
- **"Grep is all you need" has strong evidence but clear limits.** Claude Code dropped RAG for agentic search. Amazon Science shows 90%+ RAG performance from keyword search alone. But at scale (1000+ files, 2.5M lines), hybrid semantic+BM25 uses 61% fewer tokens and 84% fewer tool calls than grep-only (SocratiCode benchmark).
- **Hybrid search + reranking is table stakes for production.** Every production system — Perplexity, Glean, Intercom Fin, Sierra, Zendesk — combines vector + keyword search with cross-encoder reranking. Anthropic's contextual retrieval paper showed 67% failure reduction with the full stack.
- **Content quality is the biggest lever.** Intercom's data shows content optimization drives more improvement than architecture changes. Anthropic (the company) went from 36% to 50.8% resolution rate through KB content work, not retrieval changes.
- **Long context complements RAG, doesn't replace it.** The "RAG is dead" narrative is definitively refuted. The lost-in-the-middle effect persists. RAG preserves 95% accuracy with 25% of tokens. The consensus: use RAG to select, long context to reason.
- **Progressive disclosure is the optimal agent interface.** Three layers: index/overview (orientation) -> search snippets (discovery) -> full articles (deep read). "Agents get dumber when given too much information upfront."
- **GraphRAG is overkill at 100-1000 articles.** Microsoft's GraphRAG costs ~$33K to index. Frontmatter metadata (topics, tags, cross-references) provides lightweight graph functionality without the infrastructure.
- **Memory tools solve a different problem than KB retrieval.** Mem0/Zep/Letta handle conversational memory and personalization. KB retrieval handles structured reference knowledge. Orthogonal layers, not competitors.

---

## Research Rubric

**Report Type:** Technology Deep-Dive / Ecosystem Landscape
**Primary Question:** What's the best interface for agents to consume knowledge from a structured KB (~100-1000 markdown articles with frontmatter)?
**Audience:** Product/engineering team building an agent-native knowledge platform
**Stance:** Factual/Academic — presenting the landscape for the team to draw conclusions

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | RAG evolution and current state | Deep | P0 |
| D2 | How coding agents retrieve context | Deep | P0 |
| D3 | Vector DB companies and agent memory tools | Deep | P0 |
| D4 | Knowledge retrieval in support/CX agents | Deep | P0 |
| D5 | Local KB and personal knowledge retrieval | Deep | P0 |
| D6 | What big labs publish | Deep | P0 |
| D7 | Emerging patterns — what actually works | Deep | P0 |
| D8 | Implications for a knowledge platform MCP interface | Deep | P0 |

**Non-goals:** General AI/LLM capability surveys; specific vendor pricing evaluation; implementation guides for specific vector DBs; 1P codebase analysis.

---

## Detailed Findings

### D1: RAG Evolution and Current State

**Finding:** RAG has evolved through three distinct generations, converging on agent-controlled retrieval as the dominant paradigm.

**Evidence:** [evidence/rag-evolution.md](evidence/rag-evolution.md)

#### The Arc

| Era | Approach | Defining Characteristic |
|-----|----------|------------------------|
| 2023 | Naive RAG | Chunk -> embed -> retrieve top-k -> generate |
| 2024 | Advanced RAG | Contextual chunks, hybrid search, reranking, HyDE |
| 2025-2026 | Agentic RAG | Agent decides what, when, and how to retrieve |

**Classic RAG failures** (Barnett et al., arXiv:2401.05856): Seven documented failure modes — missing content, missed top-k, consolidation failure, extraction failure, wrong format, incorrect specificity, incompleteness. The root cause is chunking: fixed-size chunks destroy semantic boundaries and strip hierarchical context.

**Advanced RAG refinements** that became the reference architecture by late 2024:
- **Reranking** (ColBERT, Cohere Rerank 3.5): Cross-encoder scoring after initial retrieval. Considered "no longer optional" by practitioners.
- **HyDE** (Gao et al., ACL 2023): Generate a hypothetical answer, embed it, retrieve with that embedding. Improves recall without fine-tuning.
- **Contextual Retrieval** ([Anthropic](https://www.anthropic.com/news/contextual-retrieval), September 2024): Prepend LLM-generated context to each chunk before embedding. 67% failure reduction with full stack (contextual embeddings + BM25 + reranking). This became the reference paper.

**Agentic RAG** — the paradigm shift:
- **Self-RAG** (Asai et al., NeurIPS 2023): LLM generates reflection tokens deciding whether to retrieve, evaluate, and regenerate. Multi-hop accuracy: ~34% (naive) -> ~78%.
- **CRAG** (Yan et al., arXiv:2401.15884): Retrieval evaluator with web search fallback. +19% on PopQA.
- **"Keyword Search is All You Need"** ([Amazon Science](https://arxiv.org/abs/2602.23368)): Agentic tool use with keyword search achieves 94.5% faithfulness, 88% context recall, 91.5% answer correctness — over 90% of RAG-level performance without a vector database. The strongest evidence that intelligence lies in the agent's retrieval strategy, not the infrastructure.

**GraphRAG** (Edge et al., EMNLP 2024): Knowledge graph construction for global/theme queries. Production cost ~$33K for large datasets. Followed by LightRAG (10x cheaper) and LazyGraphRAG (0.1% indexing cost). Wins for cross-document synthesis; overkill for specific factual queries at 100-1000 article scale. Frontmatter metadata provides lightweight graph functionality.

**The "long context kills RAG" debate:**
- "Lost in the Middle" (Liu et al., TACL 2024): U-shaped attention curve persists even in long-context models. Stuffing documents into context doesn't guarantee they'll be used.
- RAG costs ~$0.00008/query vs ~$0.10 for long context — 1,250x difference.
- LaRA (ICML 2025): No universal winner. Depends on query complexity, corpus size, cost tolerance.
- **Consensus:** Use RAG to select the relevant 0.1%, long context to reason across retrieved content.

**Decision triggers:**
- If corpus fits entirely in context (<50K tokens): context-stuff everything, skip RAG
- If corpus is 100-1000 articles: hybrid search + agentic retrieval is the sweet spot
- If global/theme queries dominate: consider lightweight graph approaches (not full GraphRAG)

---

### D2: How Coding Agents Retrieve Context

**Finding:** The dominant paradigm for AI coding agents is agentic search (iterative grep/glob/read) without pre-indexing. Embedding-based retrieval adds value at scale (1000+ files) but is not necessary at smaller corpus sizes.

**Evidence:** [evidence/coding-agent-retrieval.md](evidence/coding-agent-retrieval.md)

#### The Retrieval Spectrum

| Agent | Approach | Indexing | Key Mechanism |
|-------|----------|---------|---------------|
| Claude Code | Agentic search | None | Grep -> glob -> read loop |
| Cursor | Embedding + rerank | Cloud (Turbopuffer) | Vector search + AI reranking |
| Windsurf | Local RAG | Local embeddings | RAG + action/memory tracking |
| Aider | Structural graph | Local (tree-sitter) | PageRank on dependency graph |
| Devin | Three-layer hybrid | DeepWiki + KB | SWE-grep RL subagent + knowledge base |
| Codex CLI | Shell-based | None | ripgrep via shell + AGENTS.md |

**Claude Code dropped RAG.** Boris Cherny (creator): "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better." The architecture uses a three-tool hierarchy (Glob -> Grep -> Read) with strict cost ordering. Compensates for lack of semantic search by running parallel triangulation searches across multiple terms. Explore sub-agents run on Haiku with read-only tools in isolated contexts — up to 7 simultaneously.

**The "grep is all you need" evidence:**
- SWE-bench validation: "Embedding-based retrieval tools were not the bottleneck — grep and find were sufficient"
- Amazon Science: Keyword search via agentic tool use achieves >90% of RAG performance
- Cline mirrors Claude Code's no-indexing philosophy
- Why grep wins for code: explicit structural relationships, exact match as primary need, fails loudly (no match) vs. embeddings failing silently (wrong match)

**When embeddings add value:**
- Cursor benchmarks: semantic search adds 12.5% accuracy improvement on large codebases (1000+ files)
- [SocratiCode](https://github.com/giancarloerra/SocratiCode) benchmark on VS Code's 2.45M-line codebase: hybrid semantic+BM25 needed 5 steps vs. grep's 31 steps — 61% fewer tokens, 84% fewer tool calls, 37x faster
- Unfamiliar codebases, natural language queries, cross-cutting concerns with inconsistent naming

**The deeper insight** (per Morph's analysis): "Agentic search offloads the learned semantics of an embedding model to an LLM." The question is not grep vs. embeddings but who does the semantic reasoning — a frozen embedding model or a live reasoning model?

**Implications for KB design:** For 100-1000 markdown articles, the coding agent evidence suggests: expose keyword search as a tool, let the agent search iteratively, and add semantic search as a complement — not a replacement. The agent's reasoning ability IS the retrieval mechanism.

---

### D3: Vector DB Companies and Agent Memory Tools

**Finding:** The landscape has fragmented into three competing framings — "Search for Agents" (Pinecone, Turbopuffer), "Memory for Agents" (Mem0, Zep, Letta), and "Context for Agents" (Chroma Context-1, Context7). For a static KB, the "Search" framing is most appropriate, with the "Context" framing as the emerging alternative.

**Evidence:** [evidence/vector-db-memory-tools.md](evidence/vector-db-memory-tools.md)

#### Vector Databases

| Product | Key Differentiator | Agent Interface | Scale Evidence |
|---------|-------------------|-----------------|---------------|
| **Pinecone** | Context API (retrieval without generation) | Query -> ranked chunks with scores + source refs | 1.4B vectors at 5,700 QPS; every Assistant is an MCP server |
| **Turbopuffer** | 10x cheaper, object-storage-first | Simple query interface, millions of namespaces | Cursor: 100B+ vectors, 95% cost reduction; Notion: 10B+ vectors |
| **Weaviate** | Full-stack hybrid search (BM25 + vector, alpha-tunable) | 3 dedicated agent types + Elysia agentic RAG framework | $67.7M funded, Forbes AI 50 |
| **Chroma Context-1** | 20B open-weights retrieval subagent model | `search_corpus`, `grep_corpus`, `read_document`, `prune_chunks` | Claims GPT-5.4 accuracy at 10x speed, 25x cheaper (unverified, 1 week old) |
| **Context7** | MCP-native docs retrieval, 33K+ libraries | Two tools: `resolve-library-id` -> `query-docs` | 51.6K GitHub stars, 240K weekly npm downloads |

**Pinecone's Context API** is the emerging standard interface for agent consumption — retrieval without generation, structured results with scores and source references. This separates retrieval from generation, letting the agent control the generation step.

**Turbopuffer** is winning on adoption in the coding agent space. Cursor has 10M+ namespaces; Notion has 1M+. The economics (scale-to-zero, $1/month per million vectors) make per-user or per-workspace vector stores viable.

#### Agent Memory Tools

| Product | Architecture | Differentiator | Adoption |
|---------|-------------|----------------|----------|
| **Mem0** | Extracts facts from conversations, stores in hybrid DB | Simplest API, 90% token reduction | 51.9K stars, 14M+ PyPI downloads |
| **Zep/Graphiti** | Hierarchical knowledge graph with temporal reasoning | +48.2% temporal improvement, no LLM calls during retrieval | 24.5K stars, Apache 2.0 |
| **Letta** | Agent manages own memory via tool calls (MemGPT pattern) | Agent decides what to remember/forget | 21.9K stars, $10M seed |

**Memory tools solve a different problem than KB retrieval.** KB retrieval answers "What does the documentation say about X?" Agent memory answers "What has this user asked about before?" These are orthogonal layers. A KB MCP server should be in the "Search" or "Context" framing, not the "Memory" framing.

**All vendor benchmarks are contested.** Each company benchmarks favorably for themselves. Mem0 claims 66.88% on LOCOMO; Zep claims 84% (contested by Mem0 CTO — actual 58.44%). Treat all accuracy numbers with skepticism.

---

### D4: Knowledge Retrieval in Support/CX Agents

**Finding:** Production CX agents have converged on a common architecture: hybrid search + custom reranking + multi-source retrieval + validation guardrails. Content quality is the single biggest lever for retrieval accuracy — not the retrieval algorithm.

**Evidence:** [evidence/cx-agent-retrieval.md](evidence/cx-agent-retrieval.md)

#### Architecture Patterns Across Production CX Agents

| Pattern | Prevalence | Details |
|---------|-----------|---------|
| Hybrid search (vector + BM25) | Universal | Every production system combines both |
| Custom reranking | High | Fine-tuned on domain data; generic rerankers are table stakes, custom ones differentiate |
| Multi-source retrieval | Universal | Articles + conversations + snippets + external sources |
| Validation/grounding check | High | Separate phase confirming response is grounded in KB |
| Citation generation | Universal | Source IDs, section references, confidence scores |
| Confidence-based escalation | Universal | Below threshold -> clarifying question or human handoff |

**Intercom Fin** is the most transparent on retrieval engineering. Custom models at every stage: `fin-cx-retrieval` (fine-tuned on 3K CX queries), `fin-cx-reranker` (ModernBERT, outperforms Cohere Rerank v3.5). Teacher-student pattern: LLM used as reranker first (expensive), distilled into small model (80% cost reduction). Critical finding: Anthropic (the company) went from 36% to 50.8% resolution primarily through KB content optimization.

**Sierra AI's tau-3-Bench** (most rigorous open CX benchmark): Best frontier model succeeds on only ~25% of realistic CX tasks. Even with perfect information: ~40% success. **Retrieval is necessary but far from sufficient — reasoning + execution is the bottleneck.**

**Decagon** uses a unified knowledge graph connecting articles, product data, and conversations. Agent Operating Procedures (natural-language workflow definitions) control how knowledge is retrieved and applied. 90% resolution for some customers, $4.5B valuation.

**Decision triggers for KB platform design:**
- If serving CX/support use cases: invest in content quality tooling (gap detection, readability scoring, freshness) as much as retrieval
- If accuracy is critical: add a validation/grounding step after generation
- If domain-specific: consider fine-tuned reranking (teacher-student pattern reduces cost 80%)

---

### D5: Local KB and Personal Knowledge Retrieval

**Finding:** For knowledge bases of ~100 articles, the index-first pattern (agent reads a structured TOC, then drills into specific articles) eliminates the need for RAG. This pattern is validated by Karpathy's personal wiki, the llms.txt standard, and the AGENTS.md convention.

**Evidence:** [evidence/local-kb-retrieval.md](evidence/local-kb-retrieval.md)

**Karpathy's index-first pattern** (April 2025): Personal knowledge system at ~100 articles / ~400K words. LLM generates summaries, backlinks, categories, and tracking files. Expected to need "fancy RAG pipelines" but found the LLM handles index maintenance directly. Self-accumulating loop: query outputs feed back as new wiki entries. "Health checks" — periodic LLM passes over the entire wiki to identify inconsistencies.

**llms.txt** (Jeremy Howard, September 2024) and **AGENTS.md** (2025, 60,000+ repos) both implement the same pattern: structured index metadata first, detailed content on demand. Mintlify auto-publishes llms.txt + MCP servers for 10,000+ companies.

**Context7** (Upstash) provides the production proof point for MCP-native docs delivery: 33,000+ libraries indexed, two-tool interface (resolve -> query). Recent optimization: 65% token reduction through server-side reranking returning only relevant pieces.

**Obsidian hybrid retrieval evidence:** Blake Crosley's benchmark on 16,894 markdown files — hybrid search (BM25 + vector + RRF) completes in 23 milliseconds, while grep through the same vault takes 11-66 seconds. Full-text-only search became unusable above ~3,000 files.

**Scale breakpoints:**
- 1-100 articles: Index-first only (Karpathy pattern; entire index fits in context)
- 100-500 articles: Index-first + keyword search
- 500-1000 articles: Index + hybrid search (add vector for semantic discovery)
- 1000+ articles: Full hybrid RAG

---

### D6: What Big Labs Publish

**Finding:** Every major lab has converged on the same conclusion from different directions — retrieval should be agent-controlled, not pipeline-designed. But each lab's product approach reflects different strategic positions.

**Evidence:** [evidence/lab-publications.md](evidence/lab-publications.md)

| Lab | Key Contribution | Product Implementation |
|-----|-----------------|----------------------|
| **Anthropic** | Contextual Retrieval paper (67% failure reduction); MCP protocol; Context Engineering framework | Claude Code: no RAG, agentic grep/read tools |
| **OpenAI** | file_search (hybrid search in Assistants API); ChatGPT Memory | Deep Research: o3-powered autonomous web retrieval |
| **Google** | Long context leadership (2M tokens); "Lost in the Middle" | NotebookLM: source-grounded RAG; Developer Knowledge MCP Server |
| **Meta** | RAG originated here (Lewis et al., NeurIPS 2020); CRAG benchmark | FAISS (foundational vector search); Llama Stack (standardized RAG API) |
| **Microsoft** | GraphRAG (EMNLP 2024); LazyGraphRAG (0.1% cost) | Azure AI Search Agentic Retrieval; Copilot (Graph + Semantic Index) |

**Anthropic** has been the most influential for retrieval methodology. Three key publications: (1) Contextual Retrieval — the reference paper for production RAG stacks. (2) MCP — the protocol layer for agent-data connections, with 8M+ server downloads. (3) Context Engineering — the framework: "The smallest set of high-signal tokens that maximize the likelihood of your desired outcome."

**Google's Developer Knowledge MCP Server** (February 2026) is the closest production analog to the target system. Two-phase: `SearchDocumentChunks` -> `GetDocument`/`BatchGetDocuments`. Serves developer documentation as markdown. Re-indexes within 24 hours. Streamable HTTP transport.

**Notable 2025-2026 papers:**
- Singh et al. (arXiv:2501.09136): "Agentic RAG Survey" — first comprehensive taxonomy
- Amazon Science (arXiv:2602.23368): "Keyword Search is All You Need"
- LaRA (ICML 2025): No universal winner between RAG and long context
- IterDRAG (ICLR 2025): 58.9% gains from inference-time RAG scaling
- A-RAG (arXiv:2602.03442): Hierarchical retrieval interfaces for agents

---

### D7: Emerging Patterns — What Actually Works

**Finding:** The field has converged on a three-stage retrieval consensus (hybrid search -> reranking -> contextual grounding) as the minimum viable architecture, with agentic control as the dominant paradigm shift.

**Evidence:** [evidence/emerging-patterns.md](evidence/emerging-patterns.md)

#### The Three-Stage Consensus

| Stage | Function | Impact |
|-------|----------|--------|
| Hybrid retrieval | Vector + keyword (BM25) search | 20-40% accuracy improvement vs. vector alone |
| Reranking | Cross-encoder scoring of candidates | 33-48% quality improvement |
| Contextual grounding | Top-ranked chunks -> LLM with citations | 67% retrieval failure reduction with full stack |

#### The "It Depends" Taxonomy

**By corpus size:**
- <10 articles (<50K tokens): Context-stuff everything
- 10-100 articles (50K-500K tokens): Index-first + targeted read; context-stuff if <200K tokens
- 100-1000 articles (500K-5M tokens): Search + selective retrieval (RAG)
- 1000+ articles (5M+ tokens): Sophisticated multi-stage retrieval pipeline

**Key breakpoint:** ~200K tokens (~500 pages) — below this, context stuffing is viable; above, RAG becomes necessary.

**By query type:**
- Factual lookup: RAG (precision)
- Exploratory: RAG with broader retrieval
- Multi-hop reasoning: Agentic RAG (iterative)
- Summarization: Long context (if corpus fits)
- Cross-document synthesis: Hybrid — RAG to select, long context to synthesize

#### Production System Architectures

Perplexity, Glean, You.com, and Notion AI share a consistent architecture: Query Understanding -> Hybrid Retrieval -> Multi-Stage Ranking -> Chunk Extraction -> Grounded Generation.

**Perplexity** uses chunk-level retrieval on Vespa with progressive ranking. Strict grounding: "You are not supposed to say anything that you didn't retrieve."

**Glean** uses custom embedding models per customer, classical IR + vector search hybrid, permission-aware retrieval, and has evolved to agentic reasoning.

#### Six Agentic KB Patterns (2026)

Six distinct patterns have crystallized in production:
1. Coding assistant playbooks — static markdown rules (LinkedIn CAPT: 70% triage reduction)
2. Integration knowledge centers — schemas and compliance rules
3. Multi-agent home bases — vectorized repos + semantic search + RAG
4. Shared business context layers — domain KB for multiple agents
5. Semantic layers for data intelligence — canonical definitions
6. MCP-powered capability layers — autonomous search from governed KBs

The two-layer architecture is emerging: Skills (markdown) for stable knowledge + MCP (tools) for dynamic retrieval.

---

### D8: Implications for a Knowledge Platform MCP Interface

**Finding:** The optimal MCP server for 100-1000 markdown articles exposes 4 core tools implementing progressive disclosure, with hybrid search as the discovery mechanism and markdown content with structured JSON envelopes as the response format.

**Evidence:** [evidence/mcp-interface-design.md](evidence/mcp-interface-design.md)

#### Recommended Tool Surface

**Core Tools (Required):**

| Tool | Purpose | Returns |
|------|---------|---------|
| `get_overview` | KB structure, categories, counts, recent updates | Structured overview of entire KB |
| `search` | Hybrid keyword + semantic search, reranked | Ranked list: title, snippet, score, metadata |
| `list_articles` | Browse/filter by category, tag, recency | Metadata array: title, category, tags, date |
| `read_article` | Full content by ID/slug/path | Full markdown + frontmatter |

**Optional Tools (at scale):**

| Tool | Purpose | When to Include |
|------|---------|----------------|
| `get_article_summary` | Condensed version (~100-200 tokens) | At 500+ articles for triage |
| `search_by_metadata` | Filter on frontmatter fields | When taxonomy is rich |

**What NOT to include:** `get_all` / bulk dump (lost-in-the-middle kills accuracy), query decomposition tools (let the agent handle this), write/update tools (separate concern).

#### Progressive Disclosure Pattern

```
Layer 1: Index       -> get_overview / list_articles  -> titles, categories, descriptions
Layer 2: Summary     -> search snippets               -> key points, matched passages
Layer 3: Full Read   -> read_article                  -> complete markdown content
```

"Agents get dumber when given too much information upfront." Traditional RAG returns ~4,000-6,000 tokens per query with no structural awareness. An outline approach achieves the same results in ~800 tokens with full structural understanding.

#### How the Answer Changes by KB Size

| KB Size | Strategy | Primary Tools |
|---------|----------|---------------|
| 1-10 articles | Context-stuff via MCP Resource | `get_overview` returns everything |
| 10-100 articles | Index-first, targeted read | `list_articles` + `read_article` |
| 100-1000 articles | Search-first, browse by category | `search` + `read_article` + `list_articles` + `get_overview` |
| 1000+ articles | Multi-stage retrieval | Full suite + `get_article_summary` + chunk-level results |

#### Agent-Native Format

The evidence converges on markdown content with structured metadata envelopes:
- **Markdown for content:** De facto LLM native language. 15-30% fewer tokens than JSON/XML. Better embedding quality. Human-writable.
- **JSON for metadata:** Type-safe fields for filtering, sorting, routing. Relevance scores, pagination, structured frontmatter.

#### Gap Analysis of Existing MCP Knowledge Servers

| Capability | Context7 | Notion MCP | Obsidian MCP | GitBook MCP | **Recommended** |
|---|---|---|---|---|---|
| Keyword search | via query | Yes | Yes | Yes | Yes |
| Semantic search | Implied | Implied | No | No | Yes (hybrid) |
| Browse/list | No | Yes | Yes | Limited | Yes (with filters) |
| Frontmatter/metadata | No | Limited | Yes | No | Yes |
| Relevance scoring | No | No | No | No | Yes |
| Corpus overview | No | No | No | No | Yes |
| Progressive disclosure | No | No | No | Partial | Yes (3-layer) |

Every existing server lacks: semantic search, progressive disclosure layers, relevance scoring, and corpus-level orientation tools.

#### Recommended Architecture

```
┌─────────────────────────────────────────────────┐
│                 MCP Server                       │
│                                                  │
│  Resources (passive, always available):           │
│  ┌──────────────────────────────────────────┐    │
│  │ kb://index — titles, categories, tags,    │    │
│  │              descriptions (~500 tokens)    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Tools (agent-invoked):                          │
│  ┌────────────────┐  ┌─────────────────────┐    │
│  │ get_overview    │  │ search              │    │
│  │ KB structure,   │  │ Hybrid keyword +    │    │
│  │ categories,     │  │ semantic, reranked, │    │
│  │ recent updates  │  │ snippets + scores   │    │
│  └────────────────┘  └─────────────────────┘    │
│  ┌────────────────┐  ┌─────────────────────┐    │
│  │ list_articles   │  │ read_article        │    │
│  │ Filter by tag,  │  │ Full markdown +     │    │
│  │ category, date  │  │ frontmatter by ID   │    │
│  └────────────────┘  └─────────────────────┘    │
│                                                  │
│  Internal (not exposed):                         │
│  ┌──────────────────────────────────────────┐    │
│  │ BM25 index + embedding store              │    │
│  │ Cross-encoder reranker                    │    │
│  │ Frontmatter structured index              │    │
│  │ Markdown content store                    │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Scale boundary precision:** Exactly where index-first breaks down (500? 1000? 2000 articles?) depends on article length, topic diversity, and context window size. No rigorous benchmarks exist for this specific transition.
- **Reranker selection:** Cohere API (best quality, adds latency + cost) vs. local FlashRank (fast, free, less accurate). Optimal choice depends on deployment constraints.
- **Chroma Context-1 maturity:** One week old at time of research. Claims are impressive but unverified by independent benchmarks. The retrieval-as-specialized-model paradigm may reshape the landscape if validated.

### Contested Claims

- All vendor benchmarks (Mem0, Zep, Pinecone, Intercom) are self-reported. Cross-validated numbers are rare.
- The "90% of RAG performance from keyword search" (Amazon Science) may not generalize beyond their specific evaluation setup.
- CX resolution rate claims (Intercom 67%, Decagon 90%, Zendesk 80%) use different definitions and measurement methodologies.

### Open Questions

- **Token cost tradeoff at scale:** The agentic/iterative approach burns more tokens per query than cached embedding retrieval. At high query volumes, where does the economics shift?
- **Long context evolution:** As context windows grow past 2M tokens, do the scale breakpoints shift upward?
- **MCP Resource vs Tool for index:** Resources are passively available but less discoverable in some clients. A tool provides explicit control. The optimal split needs testing.

---

## References

### Evidence Files
- [evidence/rag-evolution.md](evidence/rag-evolution.md) — RAG from naive to agentic, GraphRAG, long context debate
- [evidence/coding-agent-retrieval.md](evidence/coding-agent-retrieval.md) — Claude Code, Cursor, Codex, Devin, grep vs embeddings
- [evidence/vector-db-memory-tools.md](evidence/vector-db-memory-tools.md) — Pinecone, Turbopuffer, Weaviate, Chroma, Mem0, Zep, Letta
- [evidence/cx-agent-retrieval.md](evidence/cx-agent-retrieval.md) — Intercom Fin, Sierra, Decagon, Zendesk, Ada
- [evidence/local-kb-retrieval.md](evidence/local-kb-retrieval.md) — Karpathy, Obsidian, Context7, llms.txt, AGENTS.md
- [evidence/lab-publications.md](evidence/lab-publications.md) — Anthropic, OpenAI, Google, Meta, Microsoft publications
- [evidence/emerging-patterns.md](evidence/emerging-patterns.md) — Convergence patterns, production architectures, taxonomy
- [evidence/mcp-interface-design.md](evidence/mcp-interface-design.md) — Tool surface, progressive disclosure, format, gap analysis

### Foundational Papers
- Barnett et al. "Seven Failure Points When Engineering a RAG System." arXiv:2401.05856, January 2024.
- Asai et al. "Self-RAG: Learning to Retrieve, Generate, and Critique." NeurIPS 2023, arXiv:2310.11511.
- Yan et al. "Corrective Retrieval Augmented Generation." arXiv:2401.15884, January 2024.
- Liu et al. "Lost in the Middle: How Language Models Use Long Contexts." TACL 2024, arXiv:2307.03172.
- Edge et al. "From Local to Global: A Graph RAG Approach." EMNLP 2024, arXiv:2404.16130.
- Lewis et al. "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks." NeurIPS 2020.
- Gao et al. "Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)." ACL 2023.

### Lab Publications
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) (September 2024)
- [Anthropic — Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) (November 2024)
- [Anthropic — Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (September 2025)
- [Google — Developer Knowledge MCP Server](https://developers.google.com/knowledge/mcp) (February 2026)
- [Microsoft — LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/) (November 2024)

### 2025-2026 Key Papers
- Singh et al. "Agentic RAG Survey." arXiv:2501.09136, January 2025.
- Amazon Science. "Keyword Search is All You Need." arXiv:2602.23368, 2025/2026.
- LaRA. ICML 2025.
- IterDRAG. ICLR 2025.
- A-RAG. arXiv:2602.03442, February 2026.

### Production Systems
- [Perplexity on Vespa](https://vespa.ai/perplexity/)
- [Context7 GitHub](https://github.com/upstash/context7) (51.6K stars)
- [Intercom Fin Reranker Research](https://fin.ai/research/how-we-built-a-world-class-reranker-for-fin/)
- [Sierra tau-3-Bench](https://sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice)
- [SocratiCode Benchmark](https://github.com/giancarloerra/SocratiCode)

### Related Research (in this reports directory)
- [ai-agent-codebase-navigation/](../ai-agent-codebase-navigation/) — Deeper dive into coding agent code search (Aider, Continue.dev, Cody)
- [anthropic-knowledge-infrastructure-positioning/](../anthropic-knowledge-infrastructure-positioning/) — Strategic analysis of Anthropic's knowledge stack and operationalized vs reference knowledge taxonomy
- [obsidian-wiki-ai-agents/](../obsidian-wiki-ai-agents/) — Obsidian-specific MCP servers, vault structure, and Claudian integration
- [llms-txt-consumption-patterns/](../llms-txt-consumption-patterns/) — How AI coding tools consume llms.txt and documentation delivery patterns
