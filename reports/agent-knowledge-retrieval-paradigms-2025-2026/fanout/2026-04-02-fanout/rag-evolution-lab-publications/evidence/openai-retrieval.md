---
name: OpenAI — Retrieval Research and Products
description: OpenAI's approach to retrieval — Assistants API file_search, ChatGPT memory, Deep Research, Responses API
type: evidence
dimension: D6.2
confidence: high
sources:
  - title: "Assistants API / file_search"
    authors: "OpenAI"
    venue: "OpenAI documentation"
    date: "2023-2025"
    url: "https://platform.openai.com/docs/assistants/tools/file-search"
  - title: "Responses API"
    authors: "OpenAI"
    venue: "OpenAI documentation"
    date: "2025"
    url: "https://platform.openai.com/docs/api-reference/responses"
  - title: "Deep Research"
    authors: "OpenAI"
    venue: "OpenAI blog"
    date: "2025-02"
    url: "https://openai.com/index/introducing-deep-research/"
---

# OpenAI — Retrieval Research and Products

## file_search (Assistants API → Responses API)

OpenAI's built-in retrieval tool, evolved through several iterations.

**Architecture**: Hybrid search combining:
- Vector search (semantic similarity)
- Keyword search (BM25-style)
- Reciprocal Rank Fusion (RRF) to merge results from both

**Evolution**:
- Assistants API (2023): First-generation, file-search as a built-in tool
- Responses API (2025): Successor architecture, file_search migrated as a tool type
- Transition signaled OpenAI's move from stateful Assistants to stateless Responses

**Key design choices**:
- Hybrid search as default (no pure-vector option) — validates the "BM25 + vectors" consensus
- Automatic chunking and indexing — opaque to the developer
- No user control over chunking strategy — a deliberate simplification

**Limitations**: Limited control over retrieval quality, no visibility into what chunks are retrieved, no reranking API.

## ChatGPT Memory System

A two-tier memory architecture for personalization:

**Tier 1 — Explicit memories**: A "notepad" the user and system can write to. Memories are short facts ("User prefers Python over JavaScript", "User works at Acme Corp"). Stored persistently, loaded when relevant.

**Tier 2 — Chat history reference**: The system can reference prior conversations for context. Relevance-based prioritization determines which memories are loaded.

**Key insight**: This is not traditional RAG — it's more like a structured key-value store with natural language keys. The memory system doesn't chunk and embed conversations; it extracts and stores discrete facts.

**Relevance**: Demonstrates that for agent personalization, structured fact storage outperforms naive RAG over conversation history.

## Deep Research (February 2025)

OpenAI's most significant retrieval-for-agents product. An o3-powered agent that autonomously browses the web for 5-30 minutes to research complex questions.

**Architecture**: The agent:
1. Plans a research strategy
2. Conducts multiple web searches
3. Reads and analyzes full pages
4. Synthesizes findings into a structured report
5. Cites sources

**Available via API** (June 2025): Developers can invoke Deep Research programmatically, making it a retrieval tool for other agents.

**Significance**: This is the clearest example of agentic retrieval from a major lab — the agent controls its own retrieval strategy entirely.

## OpenAI's Retrieval Philosophy

OpenAI has been notably less vocal about RAG methodology compared to Anthropic or Microsoft. Their approach:
- **Product-first**: Build retrieval into products (file_search, memory, Deep Research) rather than publish research papers
- **Hybrid by default**: All their retrieval products use vector + keyword search
- **Agentic for complex queries**: Deep Research shows their direction — agent-controlled retrieval for anything beyond simple lookup

## Relevance to Knowledge Platform Design

- **Hybrid search validation**: OpenAI's choice of vector + keyword + RRF for file_search validates the hybrid approach
- **Opaque chunking**: OpenAI chose to hide chunking from developers — suggests chunking details shouldn't be exposed to agents either
- **Deep Research pattern**: For complex queries, let the agent control its own multi-step retrieval strategy
- **Memory as structured facts**: For frequently-needed context, structured storage beats RAG over raw content
