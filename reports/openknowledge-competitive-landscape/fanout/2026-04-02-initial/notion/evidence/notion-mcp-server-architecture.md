---
title: "Notion MCP Server Architecture and Capabilities"
type: primary-source-analysis
created: 2026-04-02
---

# Notion MCP Server Architecture and Capabilities

## Source
- Official GitHub: https://github.com/makenotion/notion-mcp-server (4.2k stars)
- Blog post: https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look
- Developer docs: https://developers.notion.com/guides/mcp/mcp

## Hosted MCP Server (Primary)

Notion hosts its own MCP server using OAuth-based one-click authorization. Two transport protocols:
- **Streamable HTTP** (prioritized for Cursor)
- **Server-Sent Events (SSE)** for broader client compatibility

### Tools Exposed (22 total in v2.0.0)

**Agent-Oriented Tools** (custom implementations, ground-up rewrites):
- `create-pages` and `update-page`: New implementations using Notion-flavored Markdown
- `search`: Semantic search via natural language across Notion + 10+ third-party connected apps
- Built for efficient token density per LLM token

**Existing API Tools** (wrapped v1 endpoints):
- Page operations (retrieve, create, update, move, append content)
- Data source querying with filters and sorting
- Database metadata retrieval
- Block management and commenting
- Search across workspaces

### v2.0.0 Changes
Three database tools replaced with data source equivalents:
- `post-database-query` -> `query-data-source`
- `update-a-database` -> `update-a-data-source`
- `create-a-database` -> `create-a-data-source`

## Key Design Decisions

1. **Notion-Flavored Markdown**: Custom markup supporting callouts, columns, nested pages, database blocks, rich-text. Provides "efficient content density per LLM token" vs hierarchical JSON.

2. **Code generation pipeline**: Automation converting OpenAPI schemas to Zod for defining tool specifications.

3. **Restricted operations**: Cannot delete databases via MCP. Users can further restrict to read-only.

4. **No image/file uploads** via MCP (on roadmap).

5. **OAuth-only auth**: No bearer token support. Requires user interaction for initial authorization.

## Local Server (Deprecated Path)

The open-source GitHub version supports STDIO and Streamable HTTP transports but Notion is prioritizing the hosted server, indicating potential sunset of local version.

## Supported Clients
- Claude Desktop / Claude.ai
- Cursor
- ChatGPT Pro
- Claude Code
- VS Code

## Implications for Agent-Native Knowledge Platforms

Notion's MCP server is specifically optimized for AI agent workflows, converting block data to markdown to reduce token consumption. This represents a significant investment in making Notion content accessible to external AI agents. However, the OAuth requirement means fully automated agent workflows without human-in-the-loop authorization are not possible. The hosted model also means Notion controls the interface between agents and content.
