---
title: "Existing MCP Servers for Knowledge/Documentation: Comparative Analysis"
type: evidence
dimension: D8
facet: existing-mcp-servers
confidence: high
sources:
  - url: https://github.com/upstash/context7
    title: "Context7 Platform — GitHub"
    type: source-code
  - url: https://upstash.com/blog/context7-mcp
    title: "Context7 MCP: Up-to-Date Docs for Any Cursor Prompt — Upstash Blog"
    type: product-blog
  - url: https://github.com/makenotion/notion-mcp-server
    title: "Official Notion MCP Server — GitHub"
    type: source-code
  - url: https://developers.notion.com/docs/mcp
    title: "Notion MCP — Notion Developers"
    type: product-docs
  - url: https://github.com/cyanheads/obsidian-mcp-server
    title: "Obsidian Knowledge-Management MCP Server — GitHub"
    type: source-code
  - url: https://github.com/dp-veritas/mcp-obsidian-tools
    title: "mcp-obsidian-tools — GitHub"
    type: source-code
  - url: https://github.com/tcsenpai/mcpbook
    title: "MCPBook — GitBook MCP Server — GitHub"
    type: source-code
  - url: https://gitbook.com/docs/developers/gitbook-api/api-reference/docs-sites/site-mcp-servers
    title: "GitBook Site MCP Servers — GitBook Docs"
    type: product-docs
date_collected: 2026-04-03
---

# Existing MCP Servers for Knowledge/Documentation

## Comparative Analysis

### Context7 (Upstash)
**Purpose**: Up-to-date documentation for code libraries
**Tools exposed**:
1. `resolve-library-id` — converts library name to Context7 ID
2. `query-docs` — fetches documentation by library ID + query

**Design philosophy**: Minimal tool surface. Two-step: identify → query. Only loads when triggered ("use context7"). Zero context tokens when idle.

**Strengths**: Simple, purpose-built, lazy loading
**Gaps**: No index/browse capability, no progressive disclosure (binary: nothing or query result), no bulk read, no structural overview

---

### Notion MCP (Official)
**Purpose**: Workspace access for AI tools
**Tools exposed**: Auto-discovered from Notion API — read pages, query databases, search workspace content

**Design philosophy**: Mirrors Notion API through MCP. Permission-scoped. Limited scope (no delete databases).

**Strengths**: Permission model, rich workspace integration
**Gaps**: Not optimized for knowledge consumption — general workspace tool, not KB-specific

---

### Obsidian MCP Server (cyanheads)
**Purpose**: Full vault interaction for AI agents
**Tools exposed**:
1. `read_note` — get content + metadata of a note
2. `modify_note` — append/prepend/overwrite
3. `search_replace` — within a note (string or regex)
4. `vault_search` — full vault search (text or regex), filterable by path and date, paginated
5. `list_directory` — list notes and subdirectories, with tree view
6. `manage_frontmatter` — atomically manage YAML frontmatter

**Design philosophy**: Filesystem-inspired. Full CRUD. Treats vault as a rich knowledge base.

**Strengths**: Comprehensive tool surface, frontmatter-aware, search + browse + read pattern
**Gaps**: No semantic search (text/regex only), no summary/outline layer, no relevance scoring

---

### mcp-obsidian-tools (dp-veritas)
**Purpose**: Read-only vault metadata exploration
**Tools exposed**: `obsidian_`-prefixed tools for tags, links, frontmatter, filenames, full-text content

**Design philosophy**: Read-only, metadata-first. Rich tag and link graph access.

**Strengths**: Metadata-rich, link-aware, read-only safety
**Gaps**: Same as cyanheads — no semantic search

---

### GitBook MCP (Official, Sept 2025)
**Purpose**: Auto-generated MCP server for any GitBook docs site
**Tools exposed**:
- Search content
- Retrieve pages
- Get code blocks
- Explain sections (AI-generated tutorials)
- Content refresh

**Design philosophy**: Auto-generated from docs structure. No setup required.

**Strengths**: Zero-config, AI explanation tool built in
**Gaps**: Tied to GitBook platform, limited customization

---

### MCPBook (tcsenpai)
**Purpose**: Scrape any docs site into searchable MCP
**Tools exposed**: 7 tools with automatic prefixing — search, retrieve pages, get code blocks, explain sections, refresh

**Design philosophy**: Platform-agnostic scraper. Works with any docs site.

**Strengths**: Universal, persistent caching
**Gaps**: Depends on scraping quality, no semantic search

---

## Pattern Synthesis: What These Servers Expose

| Capability | Context7 | Notion | Obsidian | GitBook | MCPBook |
|---|---|---|---|---|---|
| Search (keyword) | via query | Yes | Yes | Yes | Yes |
| Search (semantic) | Implied | Implied | No | No | No |
| Browse/List | No | Yes | Yes | Limited | Limited |
| Read full article | via query | Yes | Yes | Yes | Yes |
| Get summary/outline | No | No | No | Yes (explain) | Yes (explain) |
| Frontmatter/metadata | No | Limited | Yes | No | No |
| Index/TOC | No | Limited | Yes (list_directory) | No | No |
| Bulk read | No | Limited | No | No | No |
| Relevance scoring | No | No | No | No | No |

## What's Missing Across All

1. **Semantic/hybrid search** — most rely on keyword-only
2. **Progressive disclosure** — no explicit index → summary → full content layering
3. **Relevance scoring** — no confidence/relevance metadata in results
4. **Corpus overview** — no "here's the shape of this KB" meta-tool
5. **Guided discovery** — no tool hints or recommended starting points
6. **Chunk-level retrieval** — all return full documents, not relevant sections
