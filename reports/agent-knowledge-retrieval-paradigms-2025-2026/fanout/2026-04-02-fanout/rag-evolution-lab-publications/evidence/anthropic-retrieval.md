---
name: Anthropic — Retrieval Research and Products
description: Anthropic's contributions to retrieval — Contextual Retrieval, Claude Code's agentic search, MCP as retrieval protocol, context engineering
type: evidence
dimension: D6.1
confidence: high
sources:
  - title: "Introducing Contextual Retrieval"
    authors: "Anthropic"
    venue: "Anthropic blog"
    date: "2024-09"
    url: "https://www.anthropic.com/news/contextual-retrieval"
  - title: "Introducing the Model Context Protocol"
    authors: "Anthropic"
    venue: "Anthropic blog"
    date: "2024-11"
    url: "https://www.anthropic.com/news/model-context-protocol"
  - title: "Effective Context Engineering for AI Agents"
    authors: "Anthropic"
    venue: "Anthropic engineering blog"
    date: "2025-09"
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
  - title: "Claude Code's approach — no indexing, agentic search"
    authors: "Boris Cherny (creator) and team"
    venue: "Various interviews and blog posts"
    date: "2025-2026"
    url: "https://vadim.blog/claude-code-no-indexing"
---

# Anthropic — Retrieval Research and Products

## Contextual Retrieval (September 2024)

Anthropic's most direct contribution to RAG methodology.

**The problem**: Standard RAG chunks lose context. A chunk saying "Revenue increased 3% from the previous quarter" is meaningless without knowing which company, which quarter, which revenue line.

**The solution**: Before embedding each chunk, use an LLM to prepend a brief context statement. Example: "This chunk is from SEC filing 10-Q for Acme Corp, Q2 2024, discussing quarterly revenue trends."

**Results (cumulative stack)**:
- Contextual embeddings alone: 35% reduction in retrieval failure
- + BM25 hybrid search: 49% reduction
- + Reranking: **67% reduction** in retrieval failure

**Significance**: This paper established the reference architecture for production RAG in 2024-2025 and demonstrated that combining multiple techniques (contextual embedding + hybrid search + reranking) yields dramatically better results than any single approach.

## MCP — Model Context Protocol (November 2024)

MCP is not a retrieval system per se, but it's the **protocol layer** that enables retrieval. It defines how agents connect to external data sources.

**Three retrieval-relevant primitives**:
1. **Resources** — Application-controlled data the agent can read (catalogs, indexes, static content). Read-only, deterministic, idempotent.
2. **Tools** — Model-controlled functions the agent can call (search, query, fetch). The agent decides when to invoke them.
3. **Prompts** — Pre-built templates for common interaction patterns.

**For knowledge retrieval**: The community consensus is tools for search (agent-controlled) + resources for catalog/orientation (application-provided). This maps directly to the "search to find, read to consume" pattern.

**Scale**: 8M+ MCP server downloads by early 2026. Adopted by Cursor, Windsurf, VS Code, JetBrains, and many other AI tools.

## Claude Code — Agentic Search Without Indexing

The most significant production example of agentic retrieval in 2025-2026.

**Architecture**: No vector database, no embeddings, no pre-indexing. Three tools:
1. **Glob** — file pattern matching, returns paths only (~zero token cost)
2. **Grep** — regex content search via ripgrep, returns matching lines
3. **Read** — loads full file content into context

**Key quote from Boris Cherny** (Claude Code creator): "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better."

**Key quote from Claude engineer**: "In our testing we found that agentic search outperformed [it] by a lot, and this was surprising."

**Sub-agent pattern**: For deep exploration, Claude Code spawns an "Explore sub-agent" (Haiku model) that searches and returns summaries — not raw content — to preserve the main agent's context budget.

**Tradeoffs**:
- Pros: Zero setup, perfect freshness, full privacy, lower complexity
- Cons: Token burn on common terms, struggles with renamed symbols, slower on semantic/conceptual queries

## Context Engineering Framework (September 2025)

Anthropic's published framework for how agents should manage context.

**Core principle**: "The smallest set of high-signal tokens that maximize the likelihood of your desired outcome."

**Key strategies for knowledge retrieval**:
1. **Just-in-time retrieval** over pre-loading: "Maintain lightweight identifiers (file paths, stored queries, web links) and dynamically load via tools"
2. **Compaction**: Summarize and reinitiate with distilled details as context grows
3. **Structured note-taking**: Agents maintain external memory (NOTES.md pattern)
4. **Sub-agent architectures**: Specialists return summaries, not raw content

**Tool design guidance**: "If a human engineer can't definitively say which tool should be used, an AI agent can't be expected to do better." Keep tool descriptions minimal and self-contained. 3-5 focused tools beat 20 overlapping ones.

## Relevance to Knowledge Platform Design

Anthropic's work converges on a clear design philosophy for agent-native knowledge:

1. **Tools for retrieval, not pre-loading** — Agents should pull information on demand
2. **Article-level granularity** — Like Read fetching a full file, return full articles not chunks
3. **Lightweight discovery first** — Like Glob returning paths, expose metadata/titles before content
4. **Minimal tool surface** — 3-5 focused tools, not a complex API
5. **MCP as the protocol** — Resources for orientation, Tools for retrieval
