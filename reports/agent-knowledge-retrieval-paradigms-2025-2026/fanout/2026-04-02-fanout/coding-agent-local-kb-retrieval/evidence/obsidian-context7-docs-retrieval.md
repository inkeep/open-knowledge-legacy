---
title: "Obsidian AI, Context7, and Documentation Platform Retrieval"
type: evidence
dimension: D5
source_type: primary
confidence: medium-high
date_collected: 2026-04-03
sources:
  - url: https://github.com/logancyang/obsidian-copilot
    title: "Obsidian Copilot GitHub repo"
    type: github_repo
  - url: https://www.obsidiancopilot.com/en/docs/vault-qa
    title: "Vault QA (Basic) - Copilot for Obsidian"
    type: official_docs
  - url: https://deepwiki.com/logancyang/obsidian-copilot
    title: "Obsidian Copilot Architecture - DeepWiki"
    type: docs
  - url: https://github.com/upstash/context7
    title: "Context7 GitHub repo"
    type: github_repo
  - url: https://gitbook.com/docs/creating-content/searching-your-content/gitbook-ai
    title: "GitBook AI documentation"
    type: official_docs
  - url: https://www.gitbook.com/blog/new-adaptive-content-gitbook-assistant
    title: "GitBook Assistant - agentic retrieval"
    type: blog
---

# Obsidian AI, Context7, and Documentation Platform Retrieval

## Obsidian AI Plugins — Landscape

### Obsidian Copilot (Most Sophisticated)

Multi-retriever RAG system with RetrieverFactory selecting among:
1. **HybridRetriever** (Orama hybrid) — keyword + vector
2. **TieredLexicalRetriever** (BM25+ via SearchCore)
3. **MiyoSemanticRetriever** — semantic/vector

ContextManager assembles L1-L5 layered "prompt envelope" (direct context → vault retrieval → external sources → structured data → system context). Supports OpenAI, Google, Cohere, Ollama, LM Studio embedding providers.

### Sonar — Local-First Hybrid Search

Powered by llama.cpp, everything on-device. Uses **BGE-M3** embeddings + **BGE Reranker v2-m3** cross-encoder. On Meta's CRAG dataset: 43% accuracy (matching cloud OpenAI's 42%), 32% hallucination rate (vs 35% cloud). Requires 32GB RAM minimum, GPU recommended.

### obsidian-qmd — Hybrid BM25 + Vector

BM25 via MiniSearch + vector via **hnswlib HNSW algorithm** + Reciprocal Rank Fusion (RRF). Query expansion with embedding-based term addition. All local via Transformers.js.

### Smart Connections — Pure Semantic

Most widely adopted plugin. Built-in Transformers.js embeddings, zero-config, fully offline. Pure vector search (no BM25). Uses HyDE for multi-note queries.

### GNO — Full Pipeline + Knowledge Graph + MCP

BM25 + vector + query expansion + cross-encoder reranking. 100% local. Knowledge graph with wiki links, markdown links, and semantic similarity edges. **Exposes vault as MCP server** for Claude Code, Cursor, Codex.

### Blake Crosley's Hybrid Retriever — Benchmarked at Scale

The most detailed benchmarks for structured markdown retrieval:
- **16,894 markdown files**, 49,746 chunks, 83MB SQLite database
- **Embedding model**: Model2Vec potion-base-8M (256-dim, 89% of MiniLM-L6-v2 quality at 500x speed)
- **BM25**: SQLite FTS5 with column weights (1.0 chunk, 0.5 section, 0.3 heading)
- **Vector KNN**: sqlite-vec extension
- **RRF fusion**: `score(d) = Sum(weight_i / (k + rank_i))` where k=60
- **Query latency: 23 milliseconds** end-to-end
- **grep through same vault: 11-66 seconds**
- Full-text-only became unusable above ~3,000 files
- Also exposed as MCP server

Source: [blakecrosley.com/blog/hybrid-retriever-obsidian](https://blakecrosley.com/blog/hybrid-retriever-obsidian)

### Vault Size Scaling Evidence

| Vault Size | Recommended Approach |
|---|---|
| <100 notes | Simple keyword search sufficient |
| 100-1,000 notes | Pure semantic (Smart Connections) or BM25 (OmniSearch) |
| 1,000-5,000 notes | Hybrid recommended; BM25-only misses semantic matches |
| 5,000-10,000+ notes | Full hybrid pipeline essential (23ms at 16,894 files) |

**Mandalivia benchmark** (2,400 notes): QMD hybrid won for AI agent integration (score differentiation: 0.93 vs 0.47 vs 0.45). **Splitting vault into specialized collections** significantly improved reranking quality — progressive disclosure applied to document organization.

## Context7 (Upstash) — MCP Server for Documentation

### Architecture

Context7 operates as an **MCP server** making library documentation accessible to 30+ AI coding assistants (Cursor, Claude Code, VS Code Copilot, Windsurf).

### How It Works

Two core MCP tools:
1. **resolve-library-id**: Resolves general library name → Context7-compatible library ID
2. **ctx7 docs**: Retrieves documentation using library ID (e.g., `/mongodb/docs`, `/vercel/next.js`)

### Invocation Pattern

The phrase **"use context7"** in prompts triggers the LLM to call MCP tools to fetch current documentation before generating code.

### Storage and Pipeline

- **Sources**: 33,000+ libraries from GitHub repos and documentation sites
- **Storage**: Upstash Vector Database using **DiskANN** (Disk-based Approximate Nearest Neighbor) — keeps indexes on disk for cost-effective semantic search
- **Caching**: Upstash Global Database (multi-region Redis) for read replicas
- **Query**: Vector search + server-side reranking

### Performance Optimizations (New Architecture)

| Metric | Before | After | Improvement |
|---|---|---|---|
| Context tokens | ~9,700 avg | ~3,300 avg | 65% reduction |
| Latency | 24s avg | 15s avg | 38% reduction |
| Tool calls | 3.95 avg | 2.96 avg | 30% reduction |

Achieved through server-side reranking — returns only relevant documentation pieces, not everything.

### Significance

Context7 represents a middle ground: curated, version-specific documentation retrieval via a simple MCP interface. Neither too granular (Claude Code style file reading) nor too heavy (full RAG pipeline).

## GitBook — Evolution from RAG to Agentic Retrieval

### Previous Approach (RAG)

Traditional RAG: pull keywords from user question → choose pages based on keywords → feed LLM information from those pages.

### Current Approach (GitBook Assistant, August 2025)

Upgraded to **agentic retrieval**:
- Understands context of query based on user's current page
- Considers previously-read pages and prior conversations
- Connects to external sources via MCP servers
- Embeddable version (November 2025) — runs inside customer products

### Key Insight

GitBook's evolution mirrors the broader trend: moving from keyword/embedding retrieval toward agentic retrieval that considers user context, conversation history, and multi-step reasoning.

## Mintlify — Documentation as Agent Infrastructure

### Evolution

Mintlify positions itself as "the intelligent knowledge platform" — documentation infrastructure that serves both humans and agents.

### Agent-Native Features

- Auto-publishes **llms.txt** and **llms-full.txt** for every docs site
- Auto-generates **MCP servers** so tools like Cursor, ChatGPT, and Claude consume docs directly
- **Agent analytics**: Tracks AI and agent traffic separately from human traffic
- **AI Assistant** (2025): Turns docs into "your product expert"

### Scale

- 10,000+ companies
- 1M+ monthly AI queries
- 8-figure ARR
- "2026 will be about self-updating documentation and the infrastructure layer for knowledge"

## Implications for Agent-Native KB Design

### The Retrieval Spectrum for Documentation

| Approach | Best For | Token Cost | Setup Cost |
|----------|----------|------------|------------|
| Index-first (llms.txt) | Small KBs (100-500 articles) | Low | Zero |
| MCP search (Context7) | Library/API docs | Medium | Low |
| Hybrid RAG (Obsidian) | Personal knowledge (1K-10K notes) | Medium | Medium |
| Agentic retrieval (GitBook) | Large docs with user context | Medium-High | High |
| Full RAG | Large multi-tenant corpora | High | High |

### Converging Design Patterns

1. **Progressive disclosure** is universal — all successful systems show index first, details on demand
2. **MCP is the delivery mechanism** — Context7, Mintlify, GitBook all converging on MCP
3. **Hybrid > pure** — BM25 + vector outperforms either alone for structured content
4. **Agent context matters** — what the agent already knows should inform retrieval (GitBook's key insight)
5. **Server-side reranking** reduces token waste significantly (Context7's 65% reduction)
