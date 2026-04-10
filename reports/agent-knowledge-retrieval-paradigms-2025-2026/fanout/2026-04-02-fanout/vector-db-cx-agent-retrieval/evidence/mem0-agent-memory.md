---
title: "Mem0: Memory Layer for AI Agents"
dimension: D3
facet: "Agent memory abstraction vs raw vector search"
collected: 2026-04-03
confidence: high
---

# Mem0

## Architecture

Two-phase pipeline:

**Extraction Phase**: Processes message pairs using (1) latest exchange, (2) rolling conversation summary from DB, (3) last 10 messages. LLM identifies salient candidate memories.

**Update Phase**: Each candidate fact evaluated against top-10 semantically similar existing memories. LLM decides: **ADD** (new), **UPDATE** (augment), **DELETE** (contradicted), **NOOP** (no change).

### Hybrid Datastore (Three Stores)

| Store | Purpose |
|-------|---------|
| Vector DB | Dense embeddings for similarity search (pluggable: Qdrant, Chroma, etc.) |
| Graph DB (Mem0g) | Directed labeled graph -- entities as nodes, relationships as edges |
| Key-Value store | Natural language memory facts with unique IDs |

**Two variants**: Mem0 (base, vector + KV, ~7k tokens/conversation) and Mem0g (graph-enhanced, ~14k tokens, ~2% additional accuracy improvement).

Source: [arXiv paper 2504.19413](https://arxiv.org/abs/2504.19413)

## Key Differentiator: Memory vs Search

| Dimension | Raw Vector DB | Mem0 |
|-----------|---------------|------|
| Storage unit | Text chunks as vectors | Extracted *facts* distilled from conversation |
| Conflict handling | Append-only (stale entries accumulate) | LLM-based ADD/UPDATE/DELETE/NOOP |
| Token efficiency | Full chunks (~26k tokens) | Compressed facts (~1.8-7k tokens) |
| Relationships | None | Graph store captures entity-relationship triples |
| Developer surface | Manage chunking, embedding, indexing | `mem0.add()` and `mem0.search()` |

## Memory Types

**Temporal layers**: Conversation (single response), Session (minutes-hours), User (weeks-forever), Organizational (long-term shared).

**Cognitive categories**: Semantic (facts), Episodic (past events), Procedural (how-to knowledge).

## Benchmarks (LOCOMO)

| Metric | Mem0 | Mem0g | Full-Context | OpenAI Memory |
|--------|------|-------|-------------|---------------|
| J-score | 66.88% | 68.44% | -- | 52.9% |
| p95 latency | 1.44s | 2.59s | 17.12s | -- |
| Tokens/conversation | ~7k | ~14k | ~26k | -- |
| Token cost reduction | ~90% | ~73% | baseline | -- |

Source: [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)

## MCP Integration

First-party MCP server at `https://mcp.mem0.ai/mcp`. 9 tools: `add_memory`, `search_memories`, `get_memories`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `get_memory`, `list_entities`.

Agent **autonomously decides** when to store/retrieve -- no explicit user direction needed.

Source: [Mem0 MCP Docs](https://docs.mem0.ai/platform/features/mcp-integration)

## Adoption & Funding

- GitHub: 51.9k stars, 5.8k forks, Apache 2.0
- PyPI: 14M+ downloads
- API calls: 35M (Q1 2025) -> 186M (Q3 2025) -- 5.3x growth in 6 months
- Funding: $24M total (Seed $3.9M + Series A $20M led by Basis Set Ventures)
- YC batch, notable angels: Datadog CEO, Supabase CEO, PostHog CEO, HubSpot CTO

Source: [GitHub](https://github.com/mem0ai/mem0), [TechCrunch](https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)

## Staleness Handling

Mem0 does NOT explicitly implement memory decay. Available mechanisms: LRU policies, similarity-age scaling (configurable), periodic pruning, TTL. Acknowledged as a weaker area.

## Implications for Agent-Native KB Design

1. The **memory abstraction** (extracted facts, not raw chunks) is valuable for conversational agents but may be overkill for static KB retrieval
2. The **ADD/UPDATE/DELETE/NOOP** pattern for memory management is relevant for KB content that changes -- not just append-only
3. For a ~100-1000 article KB, the Mem0 approach adds unnecessary LLM overhead -- direct retrieval is more appropriate
4. The MCP server pattern (9 CRUD tools) is a good reference for what a KB MCP server might expose
5. Mem0 is best suited for **user-specific memory** layered on top of KB retrieval, not as the KB retrieval itself
