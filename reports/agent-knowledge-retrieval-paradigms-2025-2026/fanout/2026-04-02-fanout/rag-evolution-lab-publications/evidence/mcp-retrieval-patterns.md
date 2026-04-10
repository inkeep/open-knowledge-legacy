---
name: MCP-Based Retrieval Patterns and Implementations
description: How MCP servers expose knowledge bases today — existing implementations, Resources vs Tools, and design patterns
type: evidence
dimension: D6.1-supplement
confidence: high
sources:
  - title: "library-mcp"
    authors: "Will Larson"
    venue: "GitHub"
    date: "2025-04"
    url: "https://github.com/lethain/library-mcp"
  - title: "markdown-vault-mcp"
    authors: "pvliesdonk"
    venue: "GitHub"
    date: "2025"
    url: "https://github.com/pvliesdonk/markdown-vault-mcp"
  - title: "MCP Specification — Tools"
    authors: "Anthropic"
    venue: "Model Context Protocol"
    date: "2025"
    url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools"
  - title: "Google Developer Knowledge MCP Server"
    authors: "Google"
    venue: "Google Developers"
    date: "2026-02"
    url: "https://developers.google.com/knowledge/mcp"
  - title: "llms.txt specification"
    authors: "Jeremy Howard / Answer.AI"
    venue: "llmstxt.org"
    date: "2024-2025"
    url: "https://llmstxt.org/"
  - title: "Make Documentation Readable by AI Agents"
    authors: "Vercel"
    venue: "Vercel KB"
    date: "2025-2026"
    url: "https://vercel.com/kb/guide/make-your-documentation-readable-by-ai-agents"
---

# MCP-Based Retrieval Patterns

## Existing MCP Knowledge Base Implementations

### Will Larson's library-mcp (April 2025)
**URL**: https://github.com/lethain/library-mcp

Designed for markdown knowledge bases with YAML frontmatter. Tools exposed:
- `get_by_date_range` — temporal filtering
- `get_by_slug_or_url` — direct access
- `list_all_tags` — taxonomy browsing
- Text search

Larson introduces the **"datapack" concept**: curated collections of content dynamically assembled for LLM consumption based on the current question. Key design insight: security approval at the application layer, not agent layer.

### markdown-vault-mcp (2025)
**URL**: https://github.com/pvliesdonk/markdown-vault-mcp

The most feature-rich implementation found. 23 MCP tools including:
- **Hybrid search**: FTS5 (full-text) + semantic search with Reciprocal Rank Fusion
- **Frontmatter-aware indexing**: Configurable required/indexed fields
- **Link analysis**: Backlinks, outlinks, orphan detection
- **`get_context` tool**: Returns consolidated dossier (backlinks, outlinks, similar notes, tags, modification time)

Supports FastEmbed (local), Ollama, and OpenAI for embeddings.

### Google Developer Knowledge MCP Server (February 2026)
**URL**: https://developers.google.com/knowledge/mcp

Production-grade, from Google:
- **Two-phase architecture**: `SearchDocumentChunks` → `GetDocument`/`BatchGetDocuments`
- Serves developer docs as markdown
- 24-hour re-indexing cycle
- Streamable HTTP transport
- Plans for structured content (code samples, API entities)

### Others
- **jeanibarz/knowledge-base-mcp-server**: `list_knowledge_bases` + `retrieve_knowledge` (FAISS semantic search)
- **alekspetrov/mcp-docs-service**: Full CRUD with frontmatter support, navigation structure generation
- **Zackriya-Solutions/MCP-Markdown-RAG**: Heading-based splitting, Milvus vector DB
- **AWS Bedrock Knowledge Base Retrieval MCP Server**: Enterprise-grade via AWS infrastructure

## Resources vs Tools: The Design Decision

**MCP spec position**:
- **Resources** = application-controlled, read-only, deterministic, idempotent. The host app decides when to provide them.
- **Tools** = model-controlled. The AI agent decides when to invoke them.

**For knowledge retrieval, the consensus is clear**:
- Use **tools** for search-based retrieval (agent controls when/what to search)
- Use **resources** for static orientation data (catalog, index, schema)
- **Resource templates** (e.g., `article://{topic}/{slug}`) allow scalable resource definitions without registering thousands of URIs

**The hybrid pattern emerging**:
1. **Resource**: Topic index / catalog (always available for orientation)
2. **Tool**: `search_articles(query, filters)` — agent-initiated search
3. **Tool**: `get_article(id_or_slug)` — agent fetches specific content

## llms.txt and Agent Readability

### llms.txt (Jeremy Howard / Answer.AI)
A plain Markdown file at site root providing a structured map:
- `/llms.txt` — lightweight summary with one-sentence descriptions + URLs
- `/llms-full.txt` — complete documentation in one file
- Claims 90%+ token reduction vs crawling HTML
- 844,000+ websites have implemented it (BuiltWith)
- **Caveat**: "Not a single major AI platform has officially said they actually read these files"

### Vercel Agent Readability Spec
Vercel's comprehensive guidance:
- Serve **markdown over HTML** for agent consumption
- Include **frontmatter** (`title`, `canonical_url`, `last_updated`) on every response
- Support **content negotiation** (Accept: text/markdown)
- Provide **llms.txt** as a curated discovery index
- Return **actionable suggestions** on 404 errors

## The Converging Pattern

Across all implementations, a consistent three-layer architecture emerges:

1. **Discovery layer**: What articles exist? (index, topics, tags) — exposed as resource or lightweight tool
2. **Search layer**: Which articles match my query? (keyword, semantic, filtered) — exposed as tool
3. **Content layer**: Give me this specific article (full content + metadata) — exposed as tool

This maps directly to Claude Code's Glob → Grep → Read hierarchy.
