---
title: "The Positioning Spectrum: Memory vs Search vs Context for Agents"
dimension: D3
facet: "Competitive positioning analysis across the landscape"
collected: 2026-04-03
confidence: high
---

# The Positioning Spectrum

The vector DB and agent memory landscape has fragmented into three distinct positioning framings. Each reflects a different theory of what agents need.

## Framing 1: "Search for Agents"

**Who**: Pinecone, Turbopuffer, traditional vector DBs

**Thesis**: Agents need fast, accurate retrieval from large document collections. The agent issues queries; the DB returns results. Clean separation of concerns.

**Interface pattern**: Query -> ranked results with scores and metadata. The agent decides what to do with results.

**Strengths**: Simple, composable, well-understood. Agent remains in control.
**Weaknesses**: No state across queries. No memory of what was previously retrieved. No relationship reasoning.

**Representative products**:
- Pinecone Context API (retrieval without generation)
- Turbopuffer (cheapest at scale, millions of namespaces)
- Weaviate hybrid search (vector + BM25)

## Framing 2: "Memory for Agents"

**Who**: Mem0, Zep/Graphiti, Letta

**Thesis**: Agents need persistent, evolving state that goes beyond one-shot retrieval. Memory = extracted facts, entity relationships, user preferences that update over time.

**Interface pattern**: `add(conversation)` -> system extracts and stores memories. `search(query)` -> returns relevant memories. System manages deduplication, conflicts, staleness.

**Strengths**: Cross-session continuity. Conflict resolution. Compressed context (90% token reduction). Entity-relationship reasoning.
**Weaknesses**: Higher complexity. LLM calls during ingestion. Overkill for static document retrieval.

**Sub-spectrum within "memory"**:

| Approach | Who | Memory Management |
|----------|-----|-------------------|
| System-driven extraction | Mem0 | System decides what to remember via LLM extraction |
| Graph-based temporal | Zep/Graphiti | System builds knowledge graph with bi-temporal edges |
| Agent-driven self-editing | Letta/MemGPT | The agent itself decides what to remember/forget |

**The "agent-driven" extreme (Letta)** requires running agents inside Letta's runtime -- highest capability but highest lock-in. The "system-driven" approach (Mem0) is most pluggable.

## Framing 3: "Context for Agents"

**Who**: Chroma (Context-1), Context7 (Upstash)

**Thesis**: Neither raw search nor persistent memory captures the real problem. The real problem is **context engineering** -- assembling the right information in the right format for each LLM generation step.

**Interface pattern**: Specialized retrieval model/system that autonomously finds, selects, and prunes context. The developer doesn't manage retrieval logic -- a specialized system does.

**Strengths**: Addresses "context rot" (degradation from over-stuffed prompts). Token-efficient. Can handle multi-hop reasoning.
**Weaknesses**: Newest framing, least proven. Chroma's Context-1 requires unreleased agent harness. Context7 is limited to library documentation.

**Representative products**:
- Chroma Context-1 (20B retrieval subagent model)
- Context7 (curated documentation via MCP)

## Who's Winning Each Framing?

### "Search for Agents" -- Turbopuffer is winning on adoption

Turbopuffer has the most impressive production deployments: Cursor (100B+ vectors, 10M+ namespaces), Notion (10B+ vectors), Linear, Anthropic. The combination of cheapest-at-scale pricing + proven multi-tenant architecture at 2.5T+ documents makes it the pragmatic choice.

Pinecone has the most complete agent story (Context API + MCP + integrated inference) but at higher cost. Weaviate has the richest feature set (built-in RAG, 3 agent products) but less scale evidence.

### "Memory for Agents" -- Mem0 is winning on adoption, Zep on research quality

Mem0: 51.9k stars, 14M+ PyPI downloads, $24M funding, integrations with every major framework. The simplest API surface (`add` / `search`) wins in practice.

Zep/Graphiti: Strongest academic contribution (temporal knowledge graphs, published paper). Better on multi-hop and temporal reasoning. But graph construction complexity limits adoption.

Letta: Strongest research pedigree (UC Berkeley) but highest adoption barrier (full runtime commitment). More of an agent framework than a memory tool.

### "Context for Agents" -- Too early to call

Chroma's Context-1 is one week old. Context7 has massive adoption (51.6k stars) but only for library docs. The "context engineering" framing resonates intellectually but lacks production validation at the platform level.

## The Convergence Pattern

The clearest signal from production CX systems (Intercom, Sierra, Decagon) is that the winning architecture combines elements from all three framings:

1. **Search** (vector + BM25 hybrid) for breadth
2. **Memory/State** (conversation history, user preferences) for personalization
3. **Context management** (reranking, pruning, token budgets) for quality

No single product covers all three. The MCP server pattern enables composing tools from different providers.

## Implications for Agent-Native KB Design

1. For a **static KB of ~100-1000 articles**, the "Search for Agents" framing is most appropriate -- agents need retrieval, not memory
2. But the MCP server should **also expose metadata about the KB** (list topics, list articles, get article metadata) to support context engineering
3. The **Context7 two-tool pattern** (resolve entity -> query content) is the cleanest proven MCP interface for knowledge retrieval
4. **Memory** becomes relevant when the KB platform also tracks user interactions -- what questions were asked, which articles were useful, user-specific context
5. A well-designed KB MCP server could position in the **"Context for Agents"** framing: not just search, but intelligent context assembly from structured knowledge
