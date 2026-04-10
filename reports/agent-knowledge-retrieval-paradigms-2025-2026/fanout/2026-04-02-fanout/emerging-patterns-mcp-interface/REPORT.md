# Emerging Patterns & MCP Interface Design for Agent Knowledge Retrieval

**Dimensions**: D7 (Emerging Patterns — What Actually Works) · D8 (MCP Interface Implications)
**Parent Report**: Agent Knowledge Retrieval Paradigms 2025-2026
**Date**: 2026-04-03
**Confidence**: High (grounded in primary sources from production systems, academic papers, and practitioner evidence)

---

## Executive Summary

The agent knowledge retrieval landscape has converged on clear best practices by early 2026. Hybrid search + reranking is table stakes. Agentic retrieval (agents deciding *when* and *how* to retrieve, not fixed pipelines) is the dominant paradigm. Progressive disclosure — revealing knowledge in layers from index → summary → full content — is the optimal pattern for agent-native interfaces.

For a knowledge platform serving ~100-1000 markdown articles via MCP, the evidence points to a specific tool surface: **4-6 tools** combining search, browse, read, and orientation capabilities, serving markdown content with structured metadata envelopes. Existing MCP knowledge servers (Context7, Obsidian, Notion, GitBook) all have significant gaps — most notably lacking semantic search, progressive disclosure, and relevance scoring.

---

## D7: Emerging Patterns — What Actually Works

### 7.1 Convergence on Best Practices

The production RAG community has settled on a **three-stage retrieval consensus** as the minimum viable architecture:

| Stage | Function | Evidence |
|---|---|---|
| 1. Hybrid retrieval | Vector + keyword (BM25) search | 20-40% accuracy improvement vs. vector alone ([VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)) |
| 2. Reranking | Cross-encoder scoring of candidate set | 33-48% quality improvement, ~200ms added latency ([Ailog study](https://app.ailog.fr/en/blog/news/reranking-cross-encoders-study)) |
| 3. Contextual grounding | Top-ranked chunks → LLM with citations | 67% retrieval failure reduction with full stack ([Anthropic](https://www.anthropic.com/news/contextual-retrieval)) |

**Reciprocal Rank Fusion (RRF)** is the standard algorithm for merging keyword and semantic results. The `alpha` parameter (keyword vs. semantic weighting) is the primary tuning knob. Standard practice retrieves 50-100 candidates, reranks to top 5-10 for LLM consumption.

Anthropic's **Contextual Retrieval** technique — prepending 50-100 tokens of chunk-specific context before embedding — reduces retrieval failure by 35-67% depending on configuration. This has become a widely-adopted technique.

**→ Evidence**: [hybrid-search-reranking-consensus.md](evidence/hybrid-search-reranking-consensus.md)

### 7.2 The 'It Depends' Taxonomy

The "RAG is dead" narrative (early 2024) has been definitively refuted. The consensus is that **long context and RAG are complementary, not competing** ([arXiv 2501.01880](https://arxiv.org/abs/2501.01880), [RAGFlow review](https://ragflow.io/blog/rag-review-2025-from-rag-to-context)).

#### By Corpus Size

| Corpus Size | Tokens (approx) | Optimal Approach |
|---|---|---|
| <10 articles | <50K tokens | Context-stuff everything |
| 10-100 articles | 50K-500K tokens | Index-first + targeted read; context-stuff if <200K tokens |
| 100-1000 articles | 500K-5M tokens | Search + selective retrieval (RAG) |
| 1000+ articles | 5M+ tokens | Sophisticated multi-stage retrieval pipeline |

**Key breakpoint**: ~200K tokens (~500 pages) — below this, context stuffing is viable; above, RAG becomes necessary ([Pinecone](https://www.pinecone.io/blog/why-use-retrieval-instead-of-larger-context/)).

#### By Query Type

| Query Type | Best Approach |
|---|---|
| Factual lookup | RAG (precision) |
| Exploratory | RAG with broader retrieval |
| Multi-hop reasoning | Agentic RAG (iterative) |
| Summarization | Long context (if corpus fits) |
| Cross-document synthesis | Hybrid: RAG to select, long context to synthesize |

#### Critical Performance Findings

- **Lost-in-the-middle effect persists**: Accuracy drops 10-20+ percentage points when relevant information sits in the middle of long contexts ([U-NIAH, arXiv 2503.00353](https://arxiv.org/abs/2503.00353))
- **RAG cost efficiency**: Preserves 95% of accuracy with 25% of tokens — 75% cost reduction ([Pinecone](https://www.pinecone.io/blog/why-use-retrieval-instead-of-larger-context/))
- **RAG helps smaller models most**: 82.58% win-rate over raw long-context for smaller LLMs
- **Advanced reasoning LLMs** show reduced RAG compatibility due to sensitivity to semantic distractors

**→ Evidence**: [long-context-vs-rag-tradeoff.md](evidence/long-context-vs-rag-tradeoff.md)

### 7.3 Production System Architectures

The most successful production knowledge retrieval systems — **Perplexity**, **Glean**, **You.com**, **Notion AI** — share a remarkably consistent architecture despite different domains:

```
Query Understanding → Hybrid Retrieval → Multi-Stage Ranking → Chunk Extraction → Grounded Generation
```

**Perplexity** ([Vespa.ai case study](https://vespa.ai/perplexity/), [Research blog](https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api)):
- Chunk-level retrieval on Vespa — documents decomposed into fine-grained spans, each individually scorable
- Hybrid candidate set — parallel lexical + semantic retrieval merged
- Progressive ranking — fast scorers → cross-encoder rerankers
- Strict grounding: "You are not supposed to say anything that you didn't retrieve"

**Glean** ([ZenML analysis](https://www.zenml.io/llmops-database/building-robust-enterprise-search-with-llms-and-traditional-ir)):
- Custom embedding models per customer
- Classical IR + vector search hybrid
- Permission-aware retrieval
- Evolved to agentic reasoning (plan → retrieve → generate → evaluate)

**You.com** ([Search API docs](https://you.com/resources/search-api-for-the-agentic-era)):
- Query fan-out — questions decomposed into parallel subtopics
- Multiple specialized indices (general, vertical, private)
- Deep Search (Nov 2025): retrieves pages, extracts passages, verifies text on source pages

**Notion AI** ([Developer docs](https://developers.notion.com/docs/mcp)):
- Permission-scoped retrieval respecting workspace access models
- Multi-source: workspace + Slack, Google Drive, Jira, Zendesk
- Research Mode for complex multi-source queries

**→ Evidence**: [production-system-architectures.md](evidence/production-system-architectures.md)

### 7.4 The 'Retrieval is a Tool Call' Pattern

The dominant paradigm shift of 2025-2026: from **pipeline RAG** (fixed retrieve → generate) to **agentic retrieval** (agent decides when, what, and how to retrieve).

**Pipeline RAG** (2023-2024): `Query → Retrieve(query) → Rerank → Generate(context + query)` — Fixed pipeline, same strategy for every query.

**Agentic RAG** (2025-2026): `Query → Agent plans → [Search | Read | DB | API | ...] → Reflect → [Retry?] → Generate` — Agent decides whether retrieval is needed, which source, how to query, whether to iterate.

The agentic architecture wraps retrieval in a loop with: **Router** (decides source), **Retriever** (executes search), **Grader** (evaluates relevance), **Generator** (produces response), **Hallucination Checker** (verifies against sources) ([arXiv 2501.09136](https://arxiv.org/abs/2501.09136)).

**Azure AI Search** implements agentic retrieval as a first-class feature (2025): LLM decomposes queries into focused subqueries, parallel execution, semantic reranking — achieving **40% relevance improvement** over traditional RAG ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview)).

**Claude Code** exemplifies the pattern without pre-built indexes: grep/glob/read tools used iteratively, with multi-step reasoning triangulating toward targets. Trade-off: burns more tokens but gains precision, freshness, simplicity, and privacy ([Vadim's Blog](https://vadim.blog/claude-code-no-indexing)).

**→ Evidence**: [agentic-retrieval-tool-pattern.md](evidence/agentic-retrieval-tool-pattern.md)

### 7.5 Where the Field is Headed (2026)

Six distinct agentic knowledge base patterns have crystallized in production ([The New Stack](https://thenewstack.io/agentic-knowledge-base-patterns/)):

1. **Coding assistant playbooks** — static rules/conventions as markdown (LinkedIn CAPT: 70% triage reduction)
2. **Integration knowledge centers** — schemas and compliance rules
3. **Multi-agent home bases** — vectorized repos + semantic search + RAG
4. **Shared business context layers** — domain KB for multiple agents
5. **Semantic layers for data intelligence** — canonical definitions
6. **MCP-powered capability layers** — autonomous search from governed KBs (most relevant)

The two-layer architecture is emerging: **Skills (markdown)** for stable knowledge + **MCP (tools)** for dynamic retrieval. A VC runs his entire company on 12 markdown files; skills cut token costs 100x vs. equivalent MCP server tool descriptions ([The New Stack](https://thenewstack.io/skills-vs-mcp-agent-architecture/), [Block/Goose blog](https://block.github.io/goose/blog/2025/12/22/agent-skills-vs-mcp/)).

**→ Evidence**: [six-agentic-kb-patterns.md](evidence/six-agentic-kb-patterns.md)

---

## D8: Implications for a Knowledge Platform MCP Interface

### 8.1 Recommended Tool Surface

Based on the evidence, a KB MCP server serving 100-1000 markdown articles should expose **4-6 tools**:

#### Core Tools (Required)

| Tool | Purpose | Returns | Layer |
|---|---|---|---|
| `search` | Hybrid search (keyword + semantic) across all articles | Ranked list: title, snippet, score, metadata | Discovery |
| `read_article` | Get full content of a specific article by ID/slug/path | Full markdown + frontmatter | Deep read |
| `list_articles` | Browse/filter articles by category, tag, recency | Metadata array: title, category, tags, date, description | Orientation |
| `get_overview` | KB structure: categories, counts, recently updated | Structured overview of entire KB | Orientation |

#### Optional Tools (Valuable at Scale)

| Tool | Purpose | When to Include |
|---|---|---|
| `get_article_summary` | Condensed version of an article (~100-200 tokens) | At 500+ articles, when agents need to triage before full read |
| `search_by_metadata` | Filter on frontmatter fields (tags, category, date range) | When frontmatter taxonomy is rich and consistent |

#### What NOT to Include
- `get_all` / bulk dump — impractical at 100+ articles, lost-in-the-middle kills accuracy
- Query decomposition tools — let the agent handle this; the server should accept natural language queries
- Write/update tools — separate concern; the KB is a read interface for agents

### 8.2 How the Answer Changes by KB Size

| KB Size | Primary Tools | Strategy |
|---|---|---|
| 1-10 articles | `get_overview` returns everything | Context-stuff via MCP Resource |
| 10-100 articles | `list_articles` + `read_article` | Index-first, targeted read |
| 100-1000 articles | `search` + `read_article` + `list_articles` + `get_overview` | Search-first, browse by category |
| 1000+ articles | Full suite + `get_article_summary` + chunk-level results | Multi-stage retrieval |

**For the target range (100-1000)**: `search` becomes the primary discovery mechanism. `list_articles` enables category browsing. `get_overview` provides one-shot orientation. `read_article` delivers full content for selected articles.

**→ Evidence**: [corpus-size-breakpoints.md](evidence/corpus-size-breakpoints.md)

### 8.3 Progressive Disclosure Pattern

The evidence strongly supports a **three-layer progressive disclosure** pattern ([Honra](https://www.honra.io/articles/progressive-disclosure-for-ai-agents), [Linkly AI](https://linkly.ai/blog/outlines-index-progressive-disclosure-for-ai-agents)):

```
Layer 1: Index       → get_overview / list_articles  → titles, categories, descriptions (~few hundred tokens)
Layer 2: Summary     → get_article_summary / search  → key points, outlines (~100-200 tokens/article)
Layer 3: Full Read   → read_article                  → complete markdown (~500-5000 tokens/article)
```

**Why this matters**:
- "Agents get dumber when given too much information upfront" (Honra)
- Traditional RAG returns ~4,000-6,000 tokens per query with no structural awareness
- Outline approach achieves same results in ~800 tokens with full structural understanding (Linkly AI)
- Claude Code's skill system uses this exact pattern: metadata at startup, full content on demand

**Key design principles**:
1. Provide the map, let the agent choose the path
2. Treat context window space as currency
3. Let the agent decide depth — don't force full content when a summary suffices
4. Use MCP Resources for always-available index data, Tools for on-demand retrieval

**→ Evidence**: [progressive-disclosure-patterns.md](evidence/progressive-disclosure-patterns.md)

### 8.4 Index-First vs Search-First vs Context-Stuffing

| Approach | When Optimal | MCP Implementation |
|---|---|---|
| **Context-stuffing** | <50K tokens total corpus | MCP Resource with full KB |
| **Index-first** | 10-100 articles, structured taxonomy | `get_overview` → `list_articles` → `read_article` |
| **Search-first** | 100+ articles, diverse queries | `search` as primary entry → `read_article` for depth |
| **Hybrid** | 100-1000 articles (our target) | `get_overview` for orientation, `search` for discovery, `list_articles` for browsing, `read_article` for depth |

**Should the server guide the agent?** Yes, lightly:
- Tool descriptions should indicate recommended usage order
- `get_overview` description: "Call this first to understand what's available in the knowledge base"
- `search` description: "Primary tool for finding relevant articles. Returns ranked results with snippets."
- The MCP Resources primitive can provide a lightweight index that's always available without a tool call

### 8.5 Existing MCP Knowledge Servers: Gap Analysis

| Capability | Context7 | Notion MCP | Obsidian MCP | GitBook MCP | **Optimal KB Server** |
|---|---|---|---|---|---|
| Keyword search | via query | Yes | Yes | Yes | **Yes** |
| Semantic search | Implied | Implied | No | No | **Yes (hybrid)** |
| Browse/list | No | Yes | Yes | Limited | **Yes (with filters)** |
| Read full article | via query | Yes | Yes | Yes | **Yes** |
| Summary/outline | No | No | No | Yes (explain) | **Yes** |
| Frontmatter/metadata | No | Limited | Yes | No | **Yes** |
| Index/TOC | No | Limited | Yes | No | **Yes** |
| Relevance scoring | No | No | No | No | **Yes** |
| Corpus overview | No | No | No | No | **Yes** |
| Progressive disclosure | No | No | No | Partial | **Yes (3-layer)** |

Every existing server has the same gaps: no semantic search, no progressive disclosure layers, no relevance scoring, no corpus-level orientation tools.

**→ Evidence**: [existing-mcp-kb-servers.md](evidence/existing-mcp-kb-servers.md)

### 8.6 Agent-Native Format: Markdown + Metadata Envelope

The evidence converges on **markdown content with structured metadata envelopes** as the optimal agent-native format ([DEV Community](https://dev.to/lingodotdev/how-to-serve-markdown-to-ai-agents-making-your-docs-more-ai-friendly-4pdn), [Medium analysis](https://medium.com/@kanishk.khatter/markdown-a-smarter-choice-for-embeddings-than-json-or-xml-70791ece24df)):

**Why markdown for content**:
- De facto LLM native language — pre-trained extensively on markdown
- Less syntax noise than JSON/XML → fewer wasted tokens (15-30% savings)
- Better embeddings quality than structured formats
- Human-writable by content authors

**Why structured envelope for metadata**:
- MCP tool response needs type-safe fields (title, score, pagination)
- Filtering and sorting require structured metadata
- Agent routing decisions need parsed fields, not prose

**Recommended response format**:
```json
{
  "articles": [
    {
      "id": "getting-started",
      "title": "Getting Started Guide",
      "category": "onboarding",
      "tags": ["quickstart", "setup"],
      "relevance_score": 0.94,
      "snippet": "First 200 chars of matching section...",
      "content": "# Getting Started\n\nFull markdown content here..."
    }
  ],
  "total_results": 47,
  "query": "how to get started"
}
```

The content stays markdown. The envelope stays JSON. The agent reads markdown natively. The filtering operates on structured fields.

**→ Evidence**: [markdown-vs-structured-format.md](evidence/markdown-vs-structured-format.md)

---

## Synthesis: Recommended MCP Server Architecture

### For a ~100-1000 Article Markdown KB

```
┌─────────────────────────────────────────────────┐
│                 MCP Server                       │
│                                                  │
│  Resources (passive, always available):           │
│  ┌──────────────────────────────────────────┐    │
│  │ kb://index — article titles, categories,  │    │
│  │              tags, descriptions (~500 tok) │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Tools (agent-invoked):                          │
│  ┌────────────────┐  ┌─────────────────────┐    │
│  │ get_overview    │  │ search              │    │
│  │ KB structure,   │  │ Hybrid keyword +    │    │
│  │ categories,     │  │ semantic, reranked, │    │
│  │ recent updates  │  │ returns snippets +  │    │
│  │                 │  │ relevance scores    │    │
│  └────────────────┘  └─────────────────────┘    │
│  ┌────────────────┐  ┌─────────────────────┐    │
│  │ list_articles   │  │ read_article        │    │
│  │ Filter by tag,  │  │ Full markdown +     │    │
│  │ category, date; │  │ frontmatter by      │    │
│  │ metadata only   │  │ ID/slug/path        │    │
│  └────────────────┘  └─────────────────────┘    │
│                                                  │
│  Internal (not exposed to agent):                │
│  ┌──────────────────────────────────────────┐    │
│  │ Hybrid search engine (BM25 + embeddings) │    │
│  │ Reranker (cross-encoder or Cohere)       │    │
│  │ Frontmatter index (structured fields)    │    │
│  │ Markdown content store                   │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Design Decisions with Rationale

| Decision | Choice | Rationale |
|---|---|---|
| Tool count | 4 core tools | MCP best practice: 10-15 max; 4 keeps schema overhead low |
| Search type | Hybrid (keyword + semantic) | Production consensus: 20-40% improvement over vector-only |
| Reranking | Server-side, pre-applied | Agent shouldn't manage retrieval complexity; server returns quality results |
| Content format | Markdown body, JSON envelope | Markdown is LLM-native; JSON envelope for structured metadata |
| Progressive disclosure | 3 layers via different tools | Token-efficient; agent controls depth |
| Primary entry point | `search` for discovery, `get_overview` for orientation | At 100-1000 articles, browsing is too slow; search is primary |
| Index as Resource | Auto-loaded KB index | Orientation without tool call; minimal token cost |
| Chunk-level results | Not yet (full articles) | At <1000 articles, full articles are manageable; add chunking if scaling to 10K+ |

### What This Gets Right That Existing Servers Miss

1. **Hybrid search with relevance scoring** — none of the existing KB MCP servers do this
2. **Progressive disclosure** — explicit layer separation (index → search snippets → full read)
3. **Corpus orientation** — `get_overview` tells the agent what the KB contains before any search
4. **Agentic design** — tools are composable, not pipeline-forcing; the agent decides the retrieval strategy
5. **Markdown-native content** — optimized for LLM consumption, not re-serialized into structured formats
6. **MCP Resource for index** — lightweight orientation without consuming a tool call

---

## Key Uncertainties

1. **Semantic search infrastructure**: Embedding model choice, vector DB vs. in-memory — depends on deployment constraints. At 1000 articles, in-memory vector search is feasible.
2. **Reranker selection**: Cohere API (best quality, adds latency + cost) vs. local FlashRank (fast, free, less accurate). For a hosted KB, Cohere is likely worth it.
3. **Summary generation**: Pre-computed vs. on-demand article summaries. Pre-computed is better for <1000 articles (manageable batch job).
4. **MCP Resource vs. Tool for index**: Resources are passively available but less discoverable in some clients. A tool (`get_overview`) provides explicit control. Recommend both.
5. **Chunk-level retrieval**: Not necessary at 100-1000 articles where articles are ~500-2000 tokens each. Becomes important at 10K+ or for very long articles.

---

## Evidence Files

| File | Dimension | Facet |
|---|---|---|
| [hybrid-search-reranking-consensus.md](evidence/hybrid-search-reranking-consensus.md) | D7 | Convergence on best practices |
| [production-system-architectures.md](evidence/production-system-architectures.md) | D7 | Production system patterns |
| [long-context-vs-rag-tradeoff.md](evidence/long-context-vs-rag-tradeoff.md) | D7 | The 'it depends' taxonomy |
| [agentic-retrieval-tool-pattern.md](evidence/agentic-retrieval-tool-pattern.md) | D7 | Retrieval as a tool call |
| [six-agentic-kb-patterns.md](evidence/six-agentic-kb-patterns.md) | D7 | Field direction 2026 |
| [progressive-disclosure-patterns.md](evidence/progressive-disclosure-patterns.md) | D8 | Progressive disclosure |
| [existing-mcp-kb-servers.md](evidence/existing-mcp-kb-servers.md) | D8 | Existing MCP servers |
| [markdown-vs-structured-format.md](evidence/markdown-vs-structured-format.md) | D8 | Agent-native format |
| [corpus-size-breakpoints.md](evidence/corpus-size-breakpoints.md) | D8 | KB size breakpoints |
| [mcp-tool-design-best-practices.md](evidence/mcp-tool-design-best-practices.md) | D8 | MCP tool design |
