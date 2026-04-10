---
title: "Retrieval as a Tool Call: The Agentic Pattern"
type: evidence
dimension: D7
facet: retrieval-is-a-tool-call
confidence: high
sources:
  - url: https://arxiv.org/abs/2501.09136
    title: "Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG"
    type: academic-survey
  - url: https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview
    title: "Agentic Retrieval Overview — Azure AI Search"
    type: product-docs
  - url: https://www.llamaindex.ai/blog/rag-is-dead-long-live-agentic-retrieval
    title: "RAG is dead, long live agentic retrieval — LlamaIndex"
    type: thought-leadership
  - url: https://particula.tech/blog/agentic-rag-agent-controlled-retrieval
    title: "Agentic RAG Explained: Agent-Controlled Retrieval Beats Fixed Pipelines"
    type: practitioner-guide
  - url: https://vadim.blog/claude-code-no-indexing
    title: "Claude Code Doesn't Index Your Codebase — Vadim's Blog"
    type: analysis
  - url: https://www.aifreeapi.com/en/posts/claude-code-tool-search
    title: "Claude Code Tool Search Explained"
    type: guide
  - url: https://milvus.io/blog/why-im-against-claude-codes-grep-only-retrieval-it-just-burns-too-many-tokens.md
    title: "Why I'm Against Claude Code's Grep-Only Retrieval — Milvus Blog"
    type: critique
date_collected: 2026-04-03
---

# Retrieval as a Tool Call: The Agentic Pattern

## The Paradigm Shift

The dominant pattern shift in 2025-2026 is from **pipeline RAG** (fixed retrieve → generate) to **agentic retrieval** (agent decides when, what, and how to retrieve as one of many tools).

### Pipeline RAG (2023-2024)
```
Query → Retrieve(query) → Rerank → Generate(context + query)
```
Fixed pipeline. Retrieval always happens. Same strategy for every query.

### Agentic Retrieval (2025-2026)
```
Query → Agent plans → [Search tool | Read tool | DB tool | API tool | ...] → Reflect → [Retry? Different tool?] → Generate
```
Agent decides whether retrieval is needed, which source to query, how to formulate the query, and whether to iterate.

## Key Components (from Survey, arXiv 2501.09136)

The agentic RAG architecture wraps retrieval in an agent loop with five components:
1. **Router** — decides which retrieval source to query (instead of always hitting vector DB)
2. **Retriever** — executes the actual search (can be multiple sources in parallel)
3. **Grader** — evaluates retrieved documents for relevance
4. **Generator** — produces the response from graded context
5. **Hallucination Checker** — verifies output against retrieved sources

## Azure AI Search: Agentic Retrieval in Production

Microsoft's Azure AI Search (2025) implements agentic retrieval as a first-class feature:
- **Query planning**: LLM analyzes query + conversation history, decomposes complex questions into focused subqueries
- **Parallel execution**: All subqueries run simultaneously as keyword, vector, or hybrid search
- **Semantic reranking**: Applied per subquery
- **40% relevance improvement** over traditional RAG in conversational AI

## Claude Code: The Grep-Based Agent Pattern

Claude Code's approach to codebase retrieval exemplifies the "retrieval as a tool" pattern without any pre-built index:

**Tools available**: Glob (file patterns), Grep (content regex), Read (file content), Agent/Explore (complex multi-step search)

**How it works**:
- No pre-built index — explores codebase at runtime
- Multi-step reasoning: runs multiple searches triangulating toward the target ("auth", "session", "token", "middleware")
- Each search result informs the next search
- "Just in time" context loading — maintains lightweight identifiers, loads data at runtime

**Trade-offs** (per Milvus critique):
- Burns more tokens than indexed approaches
- But gains: precision (exact matches), simplicity (no index maintenance), freshness (no stale index), privacy (no data leaves machine)

## Implication for MCP Server Design

The agentic pattern means an MCP server should expose **multiple retrieval tools** that agents can compose:
1. A **search** tool (the agent decides the query)
2. A **read** tool (the agent decides which article to read in full)
3. An **index/overview** tool (the agent decides when it needs the big picture)
4. Possibly a **filter** tool (narrow by metadata, tags, categories)

The server should NOT force a fixed retrieval pipeline. Let the agent orchestrate.
