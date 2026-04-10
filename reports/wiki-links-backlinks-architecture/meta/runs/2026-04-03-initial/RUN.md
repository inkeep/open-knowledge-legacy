# Run: 2026-04-03-initial

**Status:** Closed
**Intent:** Fanout
**Created:** 2026-04-03

## Parent Context
**Purpose:** Research wiki-link and backlink infrastructure for an agent-native knowledge platform — covering link format conventions, backlink index architecture (source-code depth), editor integration, AI agent interaction patterns, git compatibility, link graph as knowledge structure, and derived index design for a CRDT+git+MCP system.
**Primary question:** How should wiki-links and backlinks be implemented in an agent-native knowledge platform built on CRDT + git + MCP?
**Non-goals:** General knowledge management tool comparison (covered in prior competitive landscape report), Obsidian capability assessment (covered in prior reports), full knowledge graph implementation (covered in knowledge-graph-incremental-updates report), agent navigation patterns (covered in kb-index-navigation-patterns-for-agents report)

## Selected Fanout Directions

| # | Direction | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|
| 1 | Link format conventions (D1) + Git compatibility (D5) | 8+ facets | Multi-tool (Obsidian, Logseq, Notion, Confluence, MediaWiki, GitHub, Fumadocs, Docusaurus) | Heavy |
| 2 | Backlink index architecture — source-code depth (D2) | 8+ facets | Multi-repo (Obsidian, Logseq, Outline, AFFiNE, Foam, Dendron, Marksman) | Heavy |
| 3 | Wiki-links in ProseMirror/TipTap editor (D3) | 6+ facets | Multi-repo (TipTap extensions, ProseMirror plugins, remark-wiki-link, tiptap-markdown) | Heavy |
| 4 | Backlinks + AI agents (D4) + Link graph as knowledge structure (D6) | 8+ facets | Multi-source (Obsidian MCP, Cognee, Graphiti, GraphRAG, Roam, Zettelkasten, Wikipedia) | Heavy |
| 5 | Derived index architecture for our system (D7) | 5+ facets | Multi-source (CRDT, git branching, MCP tools, Orama, architectural patterns) | Heavy |

## Sub-instance Tracking

| Direction | Status | Report Path | Notes |
|---|---|---|---|
| link-formats-git-compat | complete | fanout/2026-04-03-initial/link-formats-git-compat/ | D1+D5, 345 lines, 7 evidence |
| backlink-index-source-code | complete | fanout/2026-04-03-initial/backlink-index-source-code/ | D2, 346 lines, 7 evidence |
| wikilinks-prosemirror-tiptap | complete | fanout/2026-04-03-initial/wikilinks-prosemirror-tiptap/ | D3, 567 lines, 5 evidence |
| backlinks-ai-agents-graph | failed | fanout/2026-04-03-initial/backlinks-ai-agents-graph/ | D4+D6, timed out, 0 evidence. Covered by parent synthesis. |
| derived-index-architecture | complete | fanout/2026-04-03-initial/derived-index-architecture/ | D7, 577 lines, 5 evidence |

## Fanout Directory
`wiki-links-backlinks-architecture/fanout/2026-04-03-initial/`
