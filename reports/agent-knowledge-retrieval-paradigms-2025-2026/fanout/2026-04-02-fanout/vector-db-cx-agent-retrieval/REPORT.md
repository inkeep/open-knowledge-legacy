# Vector DB Landscape & CX Agent Knowledge Retrieval

**Research date**: 2026-04-03
**Dimensions covered**: D3 (Vector DB & Agent Memory Tools), D4 (Knowledge Retrieval in CX/Support Agents)
**Parent report**: Agent Knowledge Retrieval Paradigms 2025-2026
**Primary question**: What have production systems learned about retrieval architecture for agents that answer questions from a knowledge base?

---

## Executive Summary

The vector DB / agent memory landscape has fragmented into three competing framings: **"Search for Agents"** (Pinecone, Turbopuffer), **"Memory for Agents"** (Mem0, Zep, Letta), and **"Context for Agents"** (Chroma Context-1, Context7). Meanwhile, production CX agents (Intercom Fin, Sierra, Decagon) have converged on a common architecture: hybrid search + custom reranking + multi-source retrieval + validation guardrails. The gap between what infrastructure vendors sell and what production CX systems actually build is instructive for designing an agent-native knowledge platform.

**Key findings for KB MCP server design:**
1. The **Context API pattern** (retrieval without generation, structured results with scores and sources) is the emerging standard interface for agent consumption
2. **Hybrid search** (vector + BM25) is universal in production -- every serious system supports both
3. The **two-tool MCP pattern** (resolve entity -> query content) is proven at scale (Context7: 51.6k stars, 240k weekly npm downloads)
4. **Content quality is the biggest lever** for retrieval accuracy -- not the retrieval algorithm
5. **Custom reranking** (fine-tuned on domain data) dramatically outperforms generic models
6. For a static KB of ~100-1000 articles, the "Search" framing is most appropriate, but the interface should support "Context" framing (metadata, topic browsing, chunked results)

---

## D3: Vector DB Companies & Agent Memory Tools

### The Positioning Spectrum

The landscape has split into three theories of what agents need:

| Framing | Players | Core Thesis | Agent Interface |
|---------|---------|-------------|-----------------|
| **Search for Agents** | Pinecone, Turbopuffer, Weaviate | Fast, accurate retrieval from large collections | Query -> ranked results with scores |
| **Memory for Agents** | Mem0, Zep/Graphiti, Letta | Persistent, evolving state across sessions | `add()` / `search()` with conflict resolution |
| **Context for Agents** | Chroma Context-1, Context7 | Intelligent context assembly for each generation step | Specialized retrieval model/system manages context |

### Vector Databases: Comparative Landscape

#### Pinecone — The "Knowledgeable AI" Infrastructure
- **Architecture**: Gen 2 serverless with separated storage/compute, slab-based indexing on object storage, disk-based bitmap metadata filtering
- **Agent story**: Pinecone Assistant's **Context API** returns structured chunks with relevancy scores and source references *without generation* -- the key interface for agent workflows. Internally does query planning (decomposes complex queries). Claims 12% more accurate than OpenAI Assistants
- **MCP**: Three MCP servers (remote Assistant, local Assistant, developer database ops). Every Assistant is now a remote MCP server
- **Scale**: 1.4B vectors at 5,700 QPS, tens of ms median latency. Millions of namespaces proven
- **Pricing**: Standard from $50/mo + usage ($0.33/GB storage, $16/M reads)
- Evidence: [pinecone-agent-retrieval.md](evidence/pinecone-agent-retrieval.md)

#### Turbopuffer — Cheapest at Scale, Winning on Adoption
- **Architecture**: Object storage-first (S3/GCS/Azure), three-tier caching (cold/warm/hot), SPFresh centroid index instead of HNSW
- **Pricing**: $1/month per million vectors, $4/M queries (~10x cheaper than alternatives)
- **Agent fit**: Millions of namespaces with scale-to-zero economics. Cursor has 10M+ namespaces, Notion has 1M+
- **Customers**: Cursor (100B+ vectors, 95% cost reduction), Notion (10B+ vectors, saved "millions annually"), Linear, Anthropic, Atlassian
- **Scale**: 2.5T+ documents globally, ~17 person team, profitable
- Evidence: [turbopuffer-weaviate.md](evidence/turbopuffer-weaviate.md)

#### Weaviate — Full-Stack AI-Native DB
- **Architecture**: Hybrid search (vector + BM25) with alpha-tunable Relative Score Fusion. Built-in RAG (generative search as first-class query type)
- **Agent products**: Three dedicated Weaviate Agents (Query, Transformation, Personalization) + Elysia agentic RAG framework
- **MCP**: Official Go-based server with 11 tools, plus separate docs MCP server
- **Integrations**: LangChain, LlamaIndex, Microsoft Semantic Kernel, Google Vertex AI RAG Engine
- **Funding**: $67.7M total, $200M valuation, Forbes AI 50
- Evidence: [turbopuffer-weaviate.md](evidence/turbopuffer-weaviate.md)

#### Chroma Context-1 — Retrieval as Specialized Model
- **What it is**: 20B open-weights agentic search model (not a DB feature). Trained as a retrieval subagent that finds and returns ranked documents
- **"Context engineering" framing**: Jeff Huber argues "RAG is dead" -- replaced by the discipline of assembling right information for each LLM generation step. "Context rot" = degradation from over-stuffed prompts
- **Tools**: `search_corpus` (hybrid search), `grep_corpus`, `read_document`, `prune_chunks` (self-editing context)
- **Benchmarks**: BrowseComp-Plus 0.87 (1x), 0.96 (4x parallel). Claims to match GPT-5.4 accuracy at 10x speed, 25x cheaper
- **Caveat**: One week old, requires unreleased agent harness, no independent benchmarks
- Evidence: [chroma-context-1.md](evidence/chroma-context-1.md)

#### Context7 (Upstash) — MCP-Native Documentation Retrieval
- **What it is**: Documentation delivery platform via MCP for coding agents. 33,000+ libraries indexed
- **MCP interface**: Two tools -- `resolve-library-id` (name -> ID) and `query-docs` (ID + topic -> reranked markdown snippets)
- **Architecture**: Parse -> Enrich (LLM) -> Vectorize (Upstash Vector/DiskANN) -> Rerank (LLM) -> Cache (Redis)
- **Adoption**: ~51,600 GitHub stars, 8M+ npm downloads, 240K weekly. One of most-starred MCP servers
- **Security incident**: ContextCrush vulnerability (Feb 2026, patched) -- malicious instructions injected via open registry. Warning for any MCP server serving third-party content
- Evidence: [context7-upstash.md](evidence/context7-upstash.md)

### Agent Memory Tools: Comparative Landscape

#### Mem0 — System-Driven Memory Extraction (Winning on Adoption)
- **Architecture**: Two-phase (Extraction + Update). LLM extracts facts from conversations, evaluates against existing memories, decides ADD/UPDATE/DELETE/NOOP. Hybrid datastore: vector DB + graph DB + KV store
- **Key differentiator**: Stores extracted *facts* (not raw chunks). ~90% token reduction vs full context. Automatic conflict resolution
- **Benchmarks**: 66.88% J-score on LOCOMO, 1.44s p95 latency, vs 52.9% for OpenAI Memory
- **MCP**: First-party server with 9 tools (CRUD for memories + entities)
- **Adoption**: 51.9k GitHub stars, 14M+ PyPI downloads, 186M API calls/quarter (Q3 2025), $24M funding
- Evidence: [mem0-agent-memory.md](evidence/mem0-agent-memory.md)

#### Zep/Graphiti — Graph-Based Temporal Memory (Winning on Research Quality)
- **Architecture**: Three-layer hierarchical graph (Episodes -> Semantic Entities -> Communities). Bi-temporal model (4 timestamps per edge: system ingested/expired, fact valid/invalid). Search: vector + BM25 + graph traversal. **No LLM calls during retrieval** (<100ms typical)
- **Key differentiator**: Temporal reasoning (+48.2% improvement), preference tracking (+77.7%), entity-relationship traversal
- **Benchmarks**: 63.8% on LongMemEval with 1.6k tokens (vs 55.4% full-context with 115k tokens). **LoCoMo claim of 84% was contested by Mem0 CTO -- actual 58.44%**
- **Graph DBs**: Neo4j, FalkorDB, Kuzu, Amazon Neptune, in-memory
- **Adoption**: ~24,500 GitHub stars, 25K weekly PyPI downloads, Apache 2.0
- Evidence: [zep-graphiti.md](evidence/zep-graphiti.md)

#### Letta (MemGPT) — Agent-Driven Self-Editing Memory
- **Architecture**: LLM-as-OS paradigm. The agent manages its own memory via tool calls (Core Memory always in-context, Recall Memory for conversation history, Archival Memory for long-term). At ~70% context fill, memory pressure warning triggers agent to save/compress
- **Key differentiator**: The LLM decides what to remember/forget -- not an external system. Full agent runtime, not a pluggable layer
- **Tradeoff**: Highest capability but highest lock-in (must run agents inside Letta's runtime)
- **Adoption**: ~21.9k stars, $10M seed at $70M valuation, actively maintained (v0.16.7, March 31, 2026)
- Evidence: [letta-memgpt.md](evidence/letta-memgpt.md)

### D3 Synthesis: Who's Winning?

| Framing | Winner | Why |
|---------|--------|-----|
| Search for Agents | **Turbopuffer** (adoption), **Pinecone** (completeness) | Turbopuffer: Cursor/Notion/Anthropic at 2.5T+ docs. Pinecone: Context API + MCP + integrated inference |
| Memory for Agents | **Mem0** (adoption), **Zep** (research quality) | Mem0: simplest API wins (51.9k stars, every framework). Zep: best academic contribution but graph complexity limits adoption |
| Context for Agents | **Too early** | Chroma Context-1 is one week old. Context7 massive adoption but only for library docs |

**All vendor benchmarks are contested**. Each company benchmarks favorably for themselves. Treat all accuracy numbers skeptically.

---

## D4: Knowledge Retrieval in Support/CX Agents

### Intercom Fin — Most Transparent Architecture

Intercom has published more retrieval engineering detail than any other CX vendor.

**Pipeline**: Query Refinement -> RAG (custom retrieval + reranking + generation) -> Validation (grounding check).

**Custom models at every stage**: `fin-cx-retrieval` (fine-tuned on 3,000 CX queries), `fin-cx-reranker` (ModernBERT, outperforms Cohere Rerank v3.5), Fin Apex (custom answering model, claims to beat GPT-5.4 on CX tasks).

**Key engineering pattern — Teacher-Student**: LLM used as reranker first (expensive, slow), then quality distilled into small ModernBERT model (cheap, fast). 80% cost reduction, <1s latency.

**Metrics**: 67% average resolution rate (Dec 2025), 40M+ conversations resolved, 99.9% accuracy (self-reported), <1% hallucination rate (claimed).

**Critical finding**: Content quality is the single biggest lever. Anthropic (the company) went from 36% to 50.8% resolution in one month primarily through KB optimization, not architecture changes.

Evidence: [intercom-fin.md](evidence/intercom-fin.md)

### Decagon — Knowledge Graph Approach

**Unified Knowledge Graph**: Processes structured + unstructured sources into a dynamic knowledge graph connecting articles, product data, and past conversations.

**Agent Operating Procedures (AOPs)**: Natural-language workflow definitions compiled into structured logic. Non-technical teams architect how knowledge is retrieved and applied.

**Multi-Model Stack**: OpenAI, Anthropic, Google + proprietary fine-tuned models. "Ecosystem of agents" reviewing each other's work.

**Scale**: 90% resolution for some customers, $4.5B valuation, ~$481M raised. Customers: Notion, Rippling, Figma, Duolingo, Chime.

**Limited technical disclosure** -- no published papers or detailed architecture.

Evidence: [decagon-sierra.md](evidence/decagon-sierra.md)

### Sierra AI — Multi-Method Retrieval + Open Evaluation

**Constellation of Models**: 15+ frontier/open-weight/proprietary models orchestrated together with automatic failover.

**Multiple retrieval methods**: Keyword search, embedding-based, long-context (feeding large KB portions directly), terminal-style file exploration. Agent Data Platform merges unstructured conversation data with structured enterprise data.

**tau-3-Bench** (most rigorous open CX benchmark): Best frontier model (GPT-5.2) succeeds on only ~25% of realistic CX tasks. Even with perfect information: ~40% success. **Implication: retrieval is necessary but far from sufficient — reasoning + execution is the bottleneck.**

**Scale**: $100M ARR (Jan 2026, 7 quarters after launch), $10B valuation. Outcome-based pricing.

Evidence: [decagon-sierra.md](evidence/decagon-sierra.md)

### Zendesk AI — Platform Scale + Knowledge Graph

**Resolution Platform**: Multi-agent architecture (Task ID -> Procedure Compile -> Procedure Execute). Conversational RAG grounded in multi-turn context.

**Knowledge Graph**: 50,000+ active service knowledge bases. Federated Search API (50+ external sources). Unleash acquisition adds permission-based RAG across 70+ content sources.

**Model rigor**: Internal benchmarking program, different models per use case. CoT reasoning exposed for every conversation.

**Scale**: ~80% autonomous resolution claim, ~20,000 AI customers, $200M AI ARR projection.

Evidence: [zendesk-ada-cx-patterns.md](evidence/zendesk-ada-cx-patterns.md)

### Ada — Customer-Specific Fine-Tuning

**Reasoning Engine**: Constellation of language models, dual-reasoning architecture (patent-pending). Each agent fine-tuned on single-customer data with PII de-identification.

**Scale**: 1.5T tokens monthly, 80%+ automated resolution. $1.2B valuation, independent.

Evidence: [zendesk-ada-cx-patterns.md](evidence/zendesk-ada-cx-patterns.md)

### D4 Synthesis: Common Patterns Across Production CX Agents

| Pattern | Prevalence | Details |
|---------|-----------|---------|
| **Hybrid search (vector + BM25)** | Universal | Every production system combines semantic + keyword search |
| **Custom reranking** | High | Intercom, Zendesk, Ada all use fine-tuned rerankers. Generic rerankers are table stakes, custom ones are differentiators |
| **Multi-source retrieval** | Universal | Articles + conversations + snippets + external sources. Source diversity tracking improves quality |
| **Validation/grounding check** | High | Separate phase confirming response is grounded in KB before delivery |
| **Multi-model orchestration** | High | Different models for different tasks (retrieval, classification, generation, escalation) |
| **Agentic RAG (multi-step)** | Growing | Query decomposition, retrieve-evaluate-refine loops, tool-augmented retrieval |
| **Citation generation** | Universal | Source IDs, section references, confidence scores returned with every answer |
| **Confidence-based escalation** | Universal | Below threshold -> ask clarifying question or escalate to human |
| **Content gap detection** | Emerging | Track what agents search for but can't find (Zendesk auto-generates articles from gaps) |

---

## Cross-Cutting Findings: Implications for Agent-Native KB Design

### 1. The Right MCP Interface Pattern

The evidence converges on a **retrieval-without-generation** interface with structured results:

```
Tools:
  list-topics        -> KB structure/taxonomy (for agent planning)
  resolve-article    -> article ID + metadata from a query or name
  search-knowledge   -> ranked chunks with scores, source IDs, confidence
  get-article        -> full article content by ID
```

This is informed by:
- Pinecone's Context API (retrieval only, structured results with scores)
- Context7's two-tool pattern (resolve -> query, proven at 51.6k stars)
- Intercom's approach (retrieval + reranking as separate stages from generation)

### 2. Hybrid Search Is Table Stakes

Every production system combines vector similarity with keyword/BM25 search. For a ~100-1000 article KB:
- Vector search handles semantic queries ("how do I configure X?")
- BM25 handles exact-match queries (error codes, product names, technical terms)
- Fusion algorithms (Relative Score Fusion or Reciprocal Rank Fusion) merge results

### 3. Reranking Is the Biggest Quality Lever After Content

Intercom's fin.ai/research shows fine-tuned reranking (ModernBERT on domain data) outperforms even larger general-purpose models. The teacher-student pattern (LLM reranker -> distilled small model) is production-proven.

For a KB MCP server: consider exposing **pre-reranked results** rather than raw similarity scores.

### 4. Content Quality > Retrieval Sophistication

Intercom's data shows that KB content optimization drives more improvement than architecture changes. Anthropic's 36% -> 50.8% resolution improvement came from content work, not retrieval changes.

**Implication**: A KB platform should invest in content quality tooling (gap detection, readability scoring, freshness monitoring) as much as retrieval.

### 5. Return Chunks, Not Whole Articles

Every production CX system chunks articles and returns relevant passages. For a 100-1000 article KB:
- Chunk by semantic sections (H1/H2 boundaries)
- Return 3-5 most relevant chunks per query
- Include source article ID, section heading, and confidence score
- Let the agent request the full article if needed (via `get-article`)

### 6. Memory Layer Is Orthogonal to KB Retrieval

For a static KB, agent memory (Mem0, Zep, Letta) solves a different problem:
- KB retrieval answers "What does the documentation say about X?"
- Agent memory answers "What has this user asked about before?" or "What did we discuss last session?"

A well-designed platform would support both: KB retrieval via MCP tools + optional memory layer for user/conversation context. But the KB MCP server itself should be in the "Search for Agents" or "Context for Agents" framing, not the "Memory for Agents" framing.

### 7. Token Efficiency Matters

| Approach | Tokens/query |
|----------|-------------|
| Full article dump | 5,000-50,000 |
| Chunked retrieval (top-5) | 1,000-3,000 |
| Fact-extracted (Mem0 style) | 200-500 |
| Zep graph retrieval | ~1,600 |

For agent workflows where multiple KB queries happen per conversation, token-efficient retrieval directly impacts cost and quality (avoiding context rot).

---

## Evidence Index

| File | Dimension | Coverage |
|------|-----------|----------|
| [chroma-context-1.md](evidence/chroma-context-1.md) | D3 | Chroma Context-1 architecture, benchmarks, positioning |
| [pinecone-agent-retrieval.md](evidence/pinecone-agent-retrieval.md) | D3 | Pinecone serverless, Assistant, Context API, MCP |
| [turbopuffer-weaviate.md](evidence/turbopuffer-weaviate.md) | D3 | Turbopuffer storage-first arch, Weaviate hybrid search + agents |
| [context7-upstash.md](evidence/context7-upstash.md) | D3 | Context7 MCP server, architecture, security incident |
| [mem0-agent-memory.md](evidence/mem0-agent-memory.md) | D3 | Mem0 architecture, benchmarks, memory vs search |
| [zep-graphiti.md](evidence/zep-graphiti.md) | D3 | Zep/Graphiti knowledge graphs, temporal memory, benchmarks |
| [letta-memgpt.md](evidence/letta-memgpt.md) | D3 | Letta/MemGPT self-editing memory, OS paradigm |
| [positioning-spectrum.md](evidence/positioning-spectrum.md) | D3 | Cross-cutting positioning analysis |
| [intercom-fin.md](evidence/intercom-fin.md) | D4 | Intercom Fin architecture, custom models, case studies |
| [decagon-sierra.md](evidence/decagon-sierra.md) | D4 | Decagon knowledge graph, Sierra multi-method retrieval |
| [zendesk-ada-cx-patterns.md](evidence/zendesk-ada-cx-patterns.md) | D4 | Zendesk/Ada architecture, common CX patterns |

---

## Key External Sources

### Vector DB / Agent Memory
- [Chroma Context-1 Research Report](https://www.trychroma.com/research/context-1)
- [Pinecone Serverless Architecture](https://docs.pinecone.io/reference/architecture/serverless-architecture)
- [Turbopuffer Latent Space Podcast](https://www.latent.space/p/turbopuffer)
- [Context7 GitHub](https://github.com/upstash/context7)
- [Mem0 arXiv Paper (2504.19413)](https://arxiv.org/abs/2504.19413)
- [Zep arXiv Paper (2501.13956)](https://arxiv.org/abs/2501.13956)
- [MemGPT Paper (2310.08560)](https://arxiv.org/abs/2310.08560)

### CX Agent Retrieval
- [Intercom Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine)
- [Intercom Finetuning Retrieval](https://fin.ai/research/finetuning-retrieval-for-fin/)
- [Intercom Reranker Research](https://fin.ai/research/how-we-built-a-world-class-reranker-for-fin/)
- [Sierra tau-3-Bench](https://sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice)
- [Sierra Constellation of Models](https://sierra.ai/blog/constellation-of-models)
- [OpenAI x Zendesk Case Study](https://openai.com/index/zendesk/)
- [Agentic RAG Survey (arXiv:2501.09136)](https://arxiv.org/abs/2501.09136)
