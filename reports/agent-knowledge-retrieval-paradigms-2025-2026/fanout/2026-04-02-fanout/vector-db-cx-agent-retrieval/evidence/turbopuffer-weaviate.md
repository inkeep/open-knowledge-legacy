---
title: "Turbopuffer & Weaviate: Contrasting Vector DB Approaches"
dimension: D3
facet: "Cheap storage-first search vs full-stack AI-native DB"
collected: 2026-04-03
confidence: high
---

# Turbopuffer

## Architecture: Storage-First Design

Three-tier storage hierarchy moving data based on access patterns:

| Tier | Medium | Latency | Cost |
|------|--------|---------|------|
| Cold | Object Storage (S3/GCS/Azure) | 200-500ms | ~$0.02/GB |
| Warm | NVMe SSD Cache | Tens of ms | Medium |
| Hot | RAM | Sub-10ms p50 | Highest |

Key design decisions:
- **SPFresh index** (centroid-based) instead of HNSW -- HNSW requires many random-access round trips, catastrophic for object storage
- Writes appear in search immediately
- Auto-tuned for 90-100% recall
- System behaves like a JIT compiler: more queries -> faster (data inflates up cache hierarchy)
- Also supports hybrid search (BM25 + vector)

**Pricing**: $1/month per million vectors, $4 per million queries. ~10x cheaper than alternatives.

Sources: [turbopuffer.com](https://turbopuffer.com/), [Latent Space Podcast](https://www.latent.space/p/turbopuffer), [Jason Liu Architecture Analysis](https://jxnl.co/writing/2025/09/11/turbopuffer-object-storage-first-vector-database-architecture/)

## Agent Workflow Fit

- **Millions of namespaces**: Notion has 1M+, Cursor has 10M+. Maps to per-agent/per-conversation stores
- **Scale-to-zero**: Cold namespaces cost nearly nothing. Matches bursty agent workloads
- **Serverless**: No cluster management
- **Immediate write visibility**: Agent memory updates searchable instantly

## Adoption

- **Customers**: Cursor (100B+ vectors, 10M+ namespaces, 95% cost reduction), Notion (10B+ vectors, saved "millions annually"), Linear (250M+ docs, 70% cost reduction, 13ms p50), Anthropic, Atlassian, Superhuman
- **Scale**: 2.5T+ documents globally, 10M+ writes/s, 10k+ queries/s
- **Team**: ~17 people, profitable. Founded by Simon Eskildsen and Justine Li (ex-Shopify)
- **Funding**: Seed from Thrive Capital, Lachy Groom, Redpoint. ARR "tens of millions"

Source: [turbopuffer.com/customers](https://turbopuffer.com/customers)

---

# Weaviate

## Hybrid Search Architecture

Combines dense vector search + BM25 keyword search in parallel:
1. Both searches run simultaneously on same query
2. Results merged via **Relative Score Fusion** (default from v1.24): normalizes raw scores (highest=1, lowest=0), combines
3. `alpha` parameter controls blend: 1=pure vector, 0=pure keyword, 0.5=balanced

Sources: [Hybrid Search Explained](https://weaviate.io/blog/hybrid-search-explained), [Fusion Algorithms](https://weaviate.io/blog/hybrid-search-fusion-algorithms)

## Agent Integration: First-Class Product Pillar

**Weaviate Agents** (launched March 2025) -- pre-built agentic services:

| Agent | What It Does |
|-------|-------------|
| Query Agent (GA) | Natural language to search/aggregation. Parses intent, formulates searches, chains queries |
| Transformation Agent | Data enrichment, cleaning, categorization via NL instructions |
| Personalization Agent | Real-time LLM-driven personalization based on user behavior |

**Elysia**: Open-source agentic RAG framework with decision-tree architecture.

**Built-in RAG**: Generative search as a first-class query type -- retrieval + generation in a single query call. Supports OpenAI, Cohere, AWS Bedrock, Google Vertex AI modules.

Sources: [Weaviate Agents Blog](https://weaviate.io/blog/weaviate-agents), [Generative Search Docs](https://weaviate.io/developers/weaviate/search/generative)

## MCP & Framework Integrations

- **Official MCP Server**: [weaviate/mcp-server-weaviate](https://github.com/weaviate/mcp-server-weaviate) (~155 stars, Go-based, 11 tools)
- **Docs MCP Server**: Separate server for querying Weaviate's own documentation
- **Frameworks**: LangChain, LlamaIndex, Microsoft Semantic Kernel, Google Vertex AI RAG Engine

## Adoption

- Customers: Morningstar, Instabase, Cisco, Bunq, Kapa.ai
- Funding: $67.7M total, $50M Series C at $200M valuation (Battery Ventures)
- Revenue: $12.3M (2024), 104-person team
- Forbes AI 50 (2024)
- Open source: Apache 2.0

Sources: [Weaviate Case Studies](https://weaviate.io/case-studies), [SalesTools](https://salestools.io/en/report/weaviate-raises-50m-series-c)

## Comparative Summary

| Dimension | Turbopuffer | Weaviate |
|-----------|-------------|----------|
| Core positioning | Cheapest vector search at scale | Full-featured AI-native DB + built-in RAG |
| Built-in RAG | No (retrieval only) | Yes (generative modules in query) |
| Agent products | None (infrastructure) | 3 dedicated agents |
| MCP server | Community-built | Official, Go-based |
| Pricing | Usage-based ($1/M vectors/mo) | Cloud tiers + OSS self-hosted |
| Open source | No | Yes (Apache 2.0) |

## Implications for Agent-Native KB Design

1. **Turbopuffer's namespace model** (millions of isolated namespaces, scale-to-zero) is ideal for multi-tenant KB serving
2. **Weaviate's built-in generation** suggests some platforms want retrieval+generation unified, while others (Turbopuffer, Pinecone Context API) keep them separate
3. For a ~100-1000 article KB, either approach works -- the choice depends on whether you want generation in the retrieval layer or in the agent
4. Hybrid search (vector + BM25) is universal -- every serious production system supports both
