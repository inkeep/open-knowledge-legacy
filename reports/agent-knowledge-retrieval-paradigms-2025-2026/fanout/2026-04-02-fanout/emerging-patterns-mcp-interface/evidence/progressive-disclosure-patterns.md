---
title: "Progressive Disclosure Patterns for Agent Knowledge Retrieval"
type: evidence
dimension: D8
facet: progressive-disclosure
confidence: high
sources:
  - url: https://www.honra.io/articles/progressive-disclosure-for-ai-agents
    title: "Why AI Agents Need Progressive Disclosure, Not More Data — Honra"
    type: practitioner-article
  - url: https://linkly.ai/blog/outlines-index-progressive-disclosure-for-ai-agents
    title: "Outlines Index: A Progressive Disclosure Approach for Feeding Documents to AI Agents"
    type: practitioner-article
  - url: https://medium.com/@prakashkop054/s01-mcp03-progressive-disclosure-for-knowledge-discovery-in-agentic-workflows-8fc0b2840d01
    title: "Progressive Disclosure for Knowledge Discovery in Agentic Workflows"
    type: practitioner-blog
  - url: https://docs.claude-mem.ai/progressive-disclosure
    title: "Progressive disclosure — Claude-Mem"
    type: product-docs
  - url: https://medium.com/@martia_es/progressive-disclosure-the-technique-that-helps-control-context-and-tokens-in-ai-agents-8d6108b09289
    title: "Progressive Disclosure: the technique that helps control context and tokens in AI agents"
    type: practitioner-blog
date_collected: 2026-04-03
---

# Progressive Disclosure Patterns for Knowledge Retrieval

## Core Principle

"Agents get dumber when given too much information upfront — the solution isn't bigger context windows but smarter context management through progressive disclosure." (Honra)

Progressive disclosure applied to knowledge retrieval means: **provide the map, let the agent choose the path**. Context is a resource to be spent wisely, not a dump truck to be emptied into every conversation.

## The Three-Layer Pattern

Most effective implementations follow a three-layer disclosure pattern:

### Layer 1: Index/Overview (lightweight metadata)
- Article titles, categories, tags, brief descriptions
- Token cost: minimal (a few hundred tokens for 100+ articles)
- Purpose: routing decisions — agent knows WHAT exists without consuming WHAT it says

### Layer 2: Summary/Outline (intermediate detail)
- Section headings, key points, first-sentence summaries per section
- Token cost: moderate (~100-200 tokens per article)
- Purpose: agent can assess relevance before committing to full read

### Layer 3: Full Content (complete articles)
- Complete article text with all details
- Token cost: full (~500-5000 tokens per article)
- Purpose: agent needs comprehensive information for synthesis or detailed answers

## The Outlines Index Approach

A novel approach (Linkly AI) that specifically addresses the "map vs territory" distinction:

**How it works**:
1. For each document, generate a structured "card" with: section headings hierarchy, first-sentence summary per section, keywords, line number ranges
2. Embed the OUTLINE (not the original text) — one vector per document instead of 200 chunks
3. Agent workflow: search → discover relevant outline → read specific sections

**Efficiency gains**:
- Traditional RAG: 10 chunks at 4,000-6,000 tokens, no structural awareness
- Outline approach: ~800 tokens for the same scenario, with full structural understanding
- 10,000 documents = 10,000 vectors (vs. 2 million with traditional chunking)

## Real-World Implementation: Claude Code Skills

Claude Code's skill system demonstrates progressive disclosure at startup:
- **Load**: Only skill names and descriptions (metadata)
- **Discover**: Dozens of skills available, but agent sees just lightweight metadata
- **Activate**: Full skill content loaded only when triggered by user request
- **Principle**: "Enough to know what's available without consuming meaningful context"

## Key Design Principles

1. **Structure knowledge with explicit index and detail tiers** — every component should have lightweight metadata supporting routing decisions
2. **Treat context window space as currency** — every token loaded competes for attention
3. **Let the agent decide depth** — don't force full content when a summary suffices
4. **Cache at each layer** — avoid re-fetching index data on every query

## Implication for MCP Server Design

An MCP server should expose tools that map to these layers:
1. `list_articles` / `get_index` → Layer 1 (returns titles, categories, descriptions)
2. `get_summary` / `get_outline` → Layer 2 (returns structured summary of an article)
3. `get_article` / `read` → Layer 3 (returns full content)

The agent naturally discovers the KB through Layer 1, narrows via Layer 2, and reads fully via Layer 3. This is the optimal token-efficiency pattern.
