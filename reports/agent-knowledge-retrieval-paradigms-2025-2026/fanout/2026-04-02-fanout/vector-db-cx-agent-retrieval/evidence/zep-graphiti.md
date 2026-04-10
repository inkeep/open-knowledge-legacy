---
title: "Zep & Graphiti: Knowledge Graph-Based Agent Memory"
dimension: D3
facet: "Graph-based memory vs flat vector search"
collected: 2026-04-03
confidence: high
---

# Zep & Graphiti

## Architecture

**Zep** = managed platform (SOC2, HIPAA). **Graphiti** = open-source engine (Apache 2.0).

Paper: "Zep: A Temporal Knowledge Graph Architecture for Agent Memory" (arXiv:2501.13956, Jan 2025)

### Three-Layer Hierarchical Graph

| Layer | Purpose |
|-------|---------|
| Episode Subgraph | Raw input data (non-lossy, preserves original messages) |
| Semantic Entity Subgraph | Extracted entity nodes + relationship edges |
| Community Subgraph | Clusters of strongly connected entities with summaries |

### Ingestion Pipeline

1. Raw data arrives as episodes
2. System analyzes current + last 4 messages for context
3. LLM NER on episode with reflection step (minimizes hallucinations)
4. Entity embeddings (1024-dim BGE-m3) -> cosine similarity + full-text search for duplicates
5. LLM-based entity resolution determines if entities are duplicates
6. Facts/relationships extracted between entities
7. **Bi-temporal metadata** on all edges: 4 timestamps (transaction created/expired, event valid/invalid)
8. Community detection updates cluster summaries

### Search Architecture (No LLM at Retrieval Time)

Three complementary search functions:
1. Cosine similarity on embeddings
2. BM25 full-text search (Lucene in Neo4j)
3. Breadth-first graph traversal (n-hop)

Reranking: RRF, MMR, episode-mentions, node distance, cross-encoder LLMs.

**Retrieval latency**: Under 100ms typical, P95 ~300ms. No LLM calls during retrieval.

Source: [arXiv paper](https://arxiv.org/html/2501.13956v1)

## When Graphs Outperform Flat Vector Search

**Graphs win**:
- Multi-hop reasoning ("How is X related to Y through Z?")
- Temporal reasoning ("What did the customer prefer BEFORE they changed?")
- Cross-session synthesis
- Entity-centric queries ("Tell me everything about customer X")
- Preference tracking (+77.7% improvement over full-context)

**Vectors win**:
- Broad similarity matching
- Purely unstructured data without relational structure
- Simple Q&A where semantic similarity suffices

**Industry consensus (2025-2026)**: Converging on Hybrid RAG -- vectors for breadth, graphs for depth.

## Graph DB Support

Neo4j (5.26+), FalkorDB (1.1.2+, claims 496x faster P99), Kuzu (0.11.2+, embedded), Amazon Neptune, In-memory. All share same Graphiti API.

## Benchmarks (LongMemEval)

Conversations averaging 115,000 tokens:

| System | Model | Accuracy | Latency | Context Tokens |
|--------|-------|----------|---------|----------------|
| Full-context | gpt-4o-mini | 55.4% | 31.3s | 115k |
| **Zep** | **gpt-4o-mini** | **63.8%** | **3.20s** | **1.6k** |
| Full-context | gpt-4o | 60.2% | 28.9s | 115k |
| **Zep** | **gpt-4o** | **71.2%** | **2.58s** | **1.6k** |

Category breakdowns: Preference +77.7%, Temporal +48.2%, Multi-session +16.7%, Single-session **-8.3%** (underperformed).

**Contested benchmark**: Zep's LoCoMo claim of 84% was challenged by Mem0's CTO -- actual accuracy 58.44% when properly evaluated. Issues: included answers from excluded categories, modified system prompts, single run vs 10-run average.

Source: [GitHub issue getzep/zep-papers#5](https://github.com/getzep/zep-papers/issues/5)

## Adoption

- Graphiti GitHub: ~24,500 stars, 2,400 forks, 35+ contributors
- PyPI: 25,000 weekly downloads
- MCP server: "hundreds of thousands of weekly users"
- License: Apache 2.0

## MCP Integration

Official MCP server: tools for `add_episode`, `search_nodes`, `search_facts`, `delete_entity_edge`. Works with Claude Desktop (stdio) and VS Code/Copilot (HTTP).

Source: [MCP Server Docs](https://help.getzep.com/graphiti/getting-started/mcp-server)

## Implications for Agent-Native KB Design

1. **Graph structure excels for relational, temporal knowledge** -- less relevant for a static article KB but very relevant for KB + user interaction history
2. **The bi-temporal model** (when the system learned it vs when the fact was true) is sophisticated -- overkill for most KB use cases but valuable for content versioning
3. **Compression ratio is remarkable**: 115k tokens -> 1.6k tokens with accuracy improvement. For a KB, this suggests pre-extracting facts/entities from articles could dramatically reduce context usage
4. **No LLM at retrieval time** = fast, cheap retrieval. Important design principle for MCP servers
5. **Single-session factual recall actually underperformed full-context** -- graphs are not universally better; they're better for specific query types
