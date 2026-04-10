---
title: "Pinecone: Serverless Vector Search & Agent Retrieval"
dimension: D3
facet: "Pinecone serverless architecture and agent positioning"
collected: 2026-04-03
confidence: high
---

# Pinecone Agent Retrieval

## Serverless Architecture (Gen 2)

Full separation of storage from compute with independent scaling of read/write paths.

**Write path**: API gateway -> log writer (LSN-based durability) -> memtable -> flush to immutable slabs on object storage. Adaptive indexing: small slabs use scalar quantization; larger merged slabs use more intensive methods.

**Read path**: Query router -> parallel slab search + memtable search -> dedup + merge -> results.

**Gen 2 innovations (March 2025)**:
- Disk-based bitmap metadata filtering (adapted from data warehouse techniques)
- 4x more queries, 1/8th latency, half the compute vs Gen 1
- Cold data eviction: ~250ms penalty on re-access
- Explicitly designed for three workload types: recommender, semantic search, and **agentic systems** (millions of independent agents with bursty patterns)

Sources: [Pinecone Architecture Docs](https://docs.pinecone.io/reference/architecture/serverless-architecture), [Evolving Architecture Blog](https://www.pinecone.io/blog/evolving-pinecone-for-knowledgeable-ai/)

## Pinecone Assistant

Managed API for chunking, embedding, indexing, and retrieval. Two key APIs:

- **Chat API**: Full RAG (retrieval + LLM generation) with citations
- **Context API**: Retrieval only -- returns structured chunks with relevancy scores and source references. **This is the key API for agent workflows** -- agents get raw context, not synthesized answers.

The Context API internally does query planning: breaks complex queries into "smaller direct questions" for better retrieval.

Claimed: up to 12% more accurate than OpenAI Assistants on grounded retrieval. GA since January 2025.

Sources: [Pinecone Assistant](https://www.pinecone.io/product/assistant/), [Agentic Systems Guide](https://www.pinecone.io/learn/pinecone-assistant/)

## MCP Integration

Three MCP server implementations:
1. **Pinecone Assistant MCP (Remote)** -- every Assistant is now a remote MCP server
2. **Pinecone Assistant MCP (Local)** -- stdio transport
3. **Pinecone Developer MCP** -- database operations (manage indexes, upsert, query)

Framework integrations: LangChain, LangGraph, Google ADK, Composio.

Source: [Pinecone MCP Blog](https://www.pinecone.io/blog/first-MCPs/)

## Pricing

| Plan | Min/mo | Storage | Writes | Reads |
|------|--------|---------|--------|-------|
| Starter | Free | 2GB | 2M/mo | 1M/mo |
| Standard | $50 | $0.33/GB | $4/M | $16/M |
| Enterprise | $500 | $0.33/GB | $4/M | $16/M + SLA |

Assistant pricing: $3/GB storage, $8/M input tokens, $15/M output tokens.

## Case Studies

- **Delphi**: 100M+ vectors, 12K+ namespaces, 100ms P95 latency, zero scaling incidents
- **Terminal X (Finance)**: F1 score 0.68 -> 0.91, 35% latency reduction, users save ~3 hours/day
- Scale benchmarks: 1.4B vectors at 5,700 QPS with tens of ms median latency

Sources: [Delphi Case Study](https://www.pinecone.io/customers/delphi/), [Terminal X Case Study](https://www.pinecone.io/customers/terminal-x/)

## Implications for Agent-Native KB Design

1. The **Context API pattern** (retrieval without generation) is the right interface for agent consumption -- let the agent's LLM do generation
2. Namespace-per-tenant at scale (millions) is proven -- maps to per-workspace or per-user KB isolation
3. Query planning (decomposing complex queries) improves retrieval quality significantly
4. MCP exposure of retrieval tools is becoming standard practice
