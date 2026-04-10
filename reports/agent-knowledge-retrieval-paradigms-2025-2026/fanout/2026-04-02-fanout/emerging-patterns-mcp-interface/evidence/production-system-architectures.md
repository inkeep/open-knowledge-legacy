---
title: "Production System Architectures: Perplexity, Glean, You.com, Notion AI"
type: evidence
dimension: D7
facet: production-system-patterns
confidence: high
sources:
  - url: https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api
    title: "Architecting and Evaluating an AI-First Search API — Perplexity Research"
    type: primary-research
  - url: https://vespa.ai/perplexity/
    title: "How Perplexity uses Vespa.ai — Vespa.ai"
    type: case-study
  - url: https://blog.vespa.ai/perplexity-show-what-great-rag-takes/
    title: "How Perplexity beat Google on AI Search with Vespa.ai"
    type: engineering-blog
  - url: https://blog.bytebytego.com/p/how-perplexity-built-an-ai-google
    title: "How Perplexity Built an AI Google — ByteByteGo"
    type: architecture-analysis
  - url: https://www.glean.com/blog/retrieval-augmented-generation-rag-the-key-to-enabling-generative-ai-for-the-enterprise
    title: "Retrieval Augmented Generation — Glean Blog"
    type: vendor-blog
  - url: https://www.zenml.io/llmops-database/building-robust-enterprise-search-with-llms-and-traditional-ir
    title: "Glean: Building Robust Enterprise Search with LLMs and Traditional IR"
    type: analysis
  - url: https://you.com/resources/search-api-for-the-agentic-era
    title: "Search API for the Agentic Era — You.com"
    type: product-docs
  - url: https://developers.notion.com/docs/mcp
    title: "Notion MCP — Notion Developers"
    type: product-docs
date_collected: 2026-04-03
---

# Production System Architecture Patterns

## Common Architecture Across Leaders

Despite different domains, the most successful production knowledge retrieval systems (Perplexity, Glean, You.com, Notion AI) share a remarkably consistent architecture:

### Shared Pattern: Multi-Stage Retrieval Pipeline

1. **Query understanding/planning** — LLM decomposes or reformulates the query
2. **Hybrid retrieval** — parallel keyword + semantic search across indices
3. **Multi-stage ranking** — fast scorers → cross-encoder rerankers
4. **Chunk-level extraction** — sub-document spans surfaced, not full documents
5. **Grounded generation** — LLM generates from retrieved context with citations

---

## Perplexity (AI Search)

**Infrastructure**: Vespa.ai for retrieval and ranking at scale.

**Key architectural decisions**:
- **Chunk-level retrieval**: Documents decomposed into "fine-grained units" (spans), each individually retrievable and scorable. Both document-level and sub-document-level results are returned.
- **Hybrid candidate set**: Queries index via both lexical AND semantic modalities, merging results into a hybrid candidate set.
- **Progressive ranking**: Earlier stages use fast lexical + embedding scorers; later stages use powerful cross-encoder rerankers on winnowed candidate set.
- **Strict grounding principle**: "You are not supposed to say anything that you didn't retrieve." Inline citations enforced.
- **Model routing**: Multi-model architecture dynamically routes queries to different engines (conversational, research, coding, enterprise).

**Result format**: Most atomic units possible — downstream consumers incorporate precise spans without pulling irrelevant context.

## Glean (Enterprise Search)

**Key architectural decisions**:
- **Custom embedding models per customer** — domain-specific representations
- **Hybrid approach**: Combines classical IR techniques with vector search
- **Permission-aware retrieval**: Enterprise access controls enforced at retrieval time
- **Agentic reasoning layer** (2025+): Plan → Retrieve → Generate pipeline evolved into agents that plan, execute, evaluate, and adapt
- **Personalization**: Results ranked with user/team context

## You.com (AI Search API)

**Key architectural decisions**:
- **Query fan-out**: Questions broken into subtopics for parallel retrieval
- **Multiple specialized indices**: General web, vertical web (legal, healthcare, retail), private data
- **Composable architecture**: Components tie together for enterprise integration with security boundaries
- **Two-speed endpoints**: Standard search (<445ms) vs. Research (prioritizes depth)
- **Deep Search (Nov 2025)**: Retrieves live pages, extracts answer-relevant passages, verifies text actually appears on source pages using fuzzy-match verification

## Notion AI (Workspace Knowledge)

**Key architectural decisions**:
- **Permission-scoped retrieval**: Q&A respects sharing and permission models — only retrieves content the user can access
- **Multi-source integration**: Searches across Notion workspace + connected apps (Slack, Google Drive, Jira, Zendesk)
- **Source attribution**: Answers include links to underlying source pages for audit
- **Research Mode**: Multi-source deep search for complex questions
- **Memory system**: Uses Notion's own infrastructure (pages, databases, version history) to maintain evolving organizational context

## Implication for MCP Server Design

The convergence across these systems suggests an MCP server should:
1. Handle query decomposition server-side (or expose it as a tool)
2. Return chunk-level results with source attribution, not just full documents
3. Include relevance scoring in responses
4. Support permission scoping if applicable
5. Offer both fast (simple lookup) and deep (multi-step) retrieval modes
