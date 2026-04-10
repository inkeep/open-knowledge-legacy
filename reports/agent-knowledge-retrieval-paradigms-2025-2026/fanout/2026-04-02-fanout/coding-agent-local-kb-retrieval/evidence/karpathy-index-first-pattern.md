---
title: "Karpathy's Auto-Maintained Index and the Index-First Pattern"
type: evidence
dimension: D5
source_type: primary
confidence: high
date_collected: 2026-04-03
sources:
  - url: https://x.com/karpathy/status/2039805659525644595
    title: "Karpathy: LLM Knowledge Bases (X post, April 2, 2025)"
    type: social_media
  - url: https://glenrhodes.com/andrej-karpathys-llm-powered-personal-knowledge-base-workflow-using-markdown-wikis-and-obsidian/
    title: "Glen Rhodes analysis of Karpathy's workflow"
    type: blog
  - url: https://medium.com/@prakashkop054/s01-mcp03-progressive-disclosure-for-knowledge-discovery-in-agentic-workflows-8fc0b2840d01
    title: "Progressive Disclosure for Knowledge Discovery in Agentic Workflows"
    type: blog
  - url: https://www.honra.io/articles/progressive-disclosure-for-ai-agents
    title: "Why AI Agents Need Progressive Disclosure, Not More Data"
    type: blog
  - url: https://x.com/googledevs/status/2039359112668950986
    title: "Google Agent Skills specification - progressive disclosure"
    type: social_media
---

# Karpathy's Auto-Maintained Index and the Index-First Pattern

## Karpathy's System Architecture

### Original Source

Published April 2, 2025 on X: [x.com/karpathy/status/2039805659525644595](https://x.com/karpathy/status/2039805659525644595)

### Core Setup

- **raw/** directory: Stores source materials (articles, papers, repos, datasets, images). Uses Obsidian's Web Clipper to convert web articles into `.md` files.
- **LLM processing layer**: Compiles raw sources into structured markdown wiki — summaries, backlinks, categories, articles.
- **Obsidian**: Serves as the reading/viewing interface. "The LLM writes; the human reads."
- **Scale**: ~100 articles totaling ~400,000 words on focused research topics

### Auto-Maintained Index

Karpathy expected to need "fancy RAG pipelines" but discovered the LLM could handle index maintenance directly. The model auto-generates:
- Document summaries
- Backlinks between concepts
- Category organization
- Index files tracking relationships

### Why RAG Is Unnecessary at This Scale

With large context windows, the LLM can "read all relevant material fairly easily" without complex retrieval systems. At ~100 articles / 400K words:
- The index itself is small enough to read in one pass
- The LLM maintains its own index summaries
- Complete relevant documents can be processed directly
- Retrieval complexity is eliminated

### Self-Accumulating Knowledge Loop

Query outputs feed back into the wiki automatically:
- Useful answers become new wiki entries
- "The cost of building the knowledge base is nearly zero once the pipeline is running"
- "Health checks" — LLM passes over entire wiki to identify inconsistencies, impute missing data via web search, surface candidates for new articles

## The Index-First Pattern

### Definition

Instead of semantic search over all content, agents first read a **table of contents / index file**, then drill down to specific articles. This is the pattern Karpathy uses and it maps directly to how CLAUDE.md / AGENTS.md work for codebases.

### How It Works

1. Agent receives a structured index (TOC, category tree, or summary list)
2. Agent reads index to understand available knowledge
3. Agent selects relevant articles based on index metadata
4. Agent reads full content of selected articles only

### Why It Works for Small-Medium KBs (100-1000 items)

- **Token efficiency**: Index is ~1-5K tokens vs 400K+ for all content
- **Agent comprehension**: LLM can reason about what to read (unlike embedding retrieval which is opaque)
- **No infrastructure**: No vector DB, no embedding pipeline, no reranking
- **Always fresh**: Index is regenerated when content changes
- **Deterministic**: Agent knows exactly what's available (no recall gaps)

### Scale Boundaries

The index-first pattern works well when:
- Total content fits in 1-5 context windows (~100-1000 articles)
- Content is topically focused (not a general encyclopedia)
- Content has clear categorical structure
- Articles have meaningful titles/summaries

It breaks down when:
- Content exceeds what a single index can represent (~10,000+ items)
- Topics are highly cross-cutting (no clean categorization)
- Queries require semantic similarity matching across large corpora
- Real-time updates from many sources overwhelm index maintenance

## Progressive Disclosure Pattern

Google's Agent Skills specification formalizes progressive disclosure:
- **L1 metadata**: Just enough info for the agent to decide if a skill is relevant
- **L2 detailed docs**: Full usage instructions loaded on demand
- **L3 examples/templates**: Loaded only when actively using

This reduces baseline context usage by 90%. The same principle applies to knowledge bases:
- L1: Index/TOC (always loaded)
- L2: Article summaries (loaded on match)
- L3: Full article content (loaded on demand)

## Implications for Agent-Native KB Design

The Karpathy pattern suggests that for a knowledge platform serving ~100-1000 markdown articles:

1. **Primary interface should be an index/TOC**, not a search endpoint
2. **Articles should have rich frontmatter** (title, summary, categories, related articles)
3. **The agent should browse, not search** — read index, select, drill down
4. **RAG is over-engineering** at this scale
5. **The index itself is the retrieval mechanism**
