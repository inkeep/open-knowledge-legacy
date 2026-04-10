---
title: "MCP Tool Design Best Practices and Protocol Evolution"
type: evidence
dimension: D8
facet: mcp-tool-surface
confidence: high
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
    title: "Tools — Model Context Protocol Specification (2025-06-18)"
    type: specification
  - url: https://oshea00.github.io/posts/mcp-practices/
    title: "Model Context Protocol (MCP) Best Practices — MikesBlog"
    type: practitioner-guide
  - url: https://blogs.versalence.ai/mcp-model-context-protocol-evolution-2026
    title: "Long Live MCP: Why the Model Context Protocol Is Facing an Evolution in 2026"
    type: analysis
  - url: https://www.elastic.co/search-labs/blog/mcp-current-state
    title: "The current state of MCP — Elastic"
    type: industry-analysis
  - url: https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025
    title: "The Model Context Protocol's impact on 2025 — ThoughtWorks"
    type: industry-analysis
  - url: https://dev.to/phil-whittaker/mcp-vs-agent-skills-why-theyre-different-not-competing-2bc1
    title: "MCP vs Agent Skills: Why They're Different, Not Competing — DEV"
    type: practitioner-article
  - url: https://cra.mr/mcp-skills-and-agents/
    title: "MCP, Skills, and Agents"
    type: practitioner-analysis
date_collected: 2026-04-03
---

# MCP Tool Design Best Practices

## Protocol Evolution (2025-2026)

### Key Specification Updates
- **Streamable HTTP** (March 2025): Replaces SSE with scalable bi-directional transport; enables cloud deployment (AWS Lambda)
- **Tool Output Schemas** (June 2025): Servers describe expected return structure, helping agents use tokens efficiently
- **OAuth 2.1** (June 2025): Standardized authorization for MCP servers

### MCP Primitive Types
- **Tools**: Model-controlled functions. Agent discovers and invokes them.
- **Resources**: Passive context for prompting/retrieval (documents, KBs, code snippets). Agent fetches and incorporates.
- **Prompts**: Pre-configured prompt templates.

For a KB MCP server, **Tools** (for search/read) and **Resources** (for static context like index/overview) are the relevant primitives.

## Best Practices for Tool Design

### Tool Count
- **Limit to 10-15 tools** to avoid context bloat (expert recommendation)
- Deduplicating schemas and scoping into namespaces can cut token usage by 30-60%
- A KB server should aim for 4-7 tools maximum

### Tool Naming
- Use clear, descriptive names that convey function
- Namespace with server identity (e.g., `kb_search`, `kb_read_article`)
- Tool descriptions should be concise but sufficient for the LLM to understand when to use each

### Input/Output Design
- **Tool Output Schemas** enable agents to anticipate response structure
- Return structured metadata alongside content (not just raw text)
- Include pagination for large result sets
- Relevance scores help agents decide whether to read further

### Two-Layer Architecture: Skills + MCP

The emerging consensus is that MCP and Skills serve complementary roles:

| Aspect | Skills (Markdown) | MCP (Tools) |
|---|---|---|
| Best for | Stable knowledge, workflows, guidelines | Dynamic data, API access, real-time queries |
| Update frequency | Weeks/months | Real-time |
| Token cost | Low (loaded on demand) | Higher (tool schemas always in context) |
| Infrastructure | None (files in repo) | Server process required |

For a knowledge platform:
- **Static knowledge** (onboarding docs, policies) → could be Skills
- **Dynamic knowledge** (search, recent articles, versioned content) → MCP tools
- **Hybrid**: MCP server with a lightweight index Resource + search/read Tools

## Implication for MCP Server Design

### Recommended Tool Surface (4-6 tools)

1. **`search`** — Full-text/semantic search across articles. Returns ranked results with snippets.
2. **`read_article`** — Get full content of a specific article by ID/path.
3. **`list_articles`** — Browse/filter articles by category, tag, recency. Returns metadata only.
4. **`get_overview`** — Return KB structure: categories, article counts, recently updated. One-shot orientation.
5. **`get_article_summary`** (optional) — Return condensed version of an article.
6. **`search_by_metadata`** (optional) — Filter on frontmatter fields (tags, category, date range).

### Resource Surface
- **KB Index Resource**: Auto-loaded context with article titles, categories, and descriptions. Provides orientation without a tool call.
