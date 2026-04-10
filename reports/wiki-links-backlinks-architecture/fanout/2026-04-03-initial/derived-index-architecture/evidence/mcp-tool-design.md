# Evidence: MCP Tool Design for Knowledge Graph Exposure

## MCP Tool Schema (Spec v2025-06-18)

**Source**: [MCP Spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | [Schema JSON](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.json)

### Tool Definition Structure
```json
{
  "name": "get_backlinks",
  "title": "Get Backlinks",
  "description": "Get all articles that link TO a given article",
  "inputSchema": {
    "type": "object",
    "properties": {
      "slug": { "type": "string", "description": "Article slug/path" },
      "limit": { "type": "integer", "description": "Max results", "default": 20 }
    },
    "required": ["slug"]
  },
  "outputSchema": { ... },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true
  }
}
```

### Key Fields
- `name`: machine-friendly identifier
- `title`: human-readable display (added 2025-06-18)
- `description`: guides LLM tool selection — must explain what, when, and return shape
- `inputSchema`: JSON Schema, `type: "object"` at root
- `outputSchema`: optional structured response schema (added 2025-06-18)
- `annotations`: behavioral hints (readOnly, destructive, idempotent, openWorld)

---

## Existing Knowledge Graph MCP Servers

### Official Memory Server
- Source: [modelcontextprotocol/servers/src/memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- 9 tools: `create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`, `read_graph`, `search_nodes`, `open_nodes`
- JSONL storage, entity-relation-observation model

### Obsidian Graph MCP Servers
- [obsidian-graph-mcp](https://github.com/drewburchfield/obsidian-graph-mcp): 5 tools — `search_notes`, `get_similar_notes`, `get_connection_graph` (BFS, depth 1-5), `get_hub_notes`, `get_orphaned_notes`. PostgreSQL + pgvector + Voyage embeddings.
- [smart-connections-mcp](https://github.com/msdanyg/smart-connections-mcp): 6 tools — `search_notes`, `get_similar_notes`, `get_connection_graph` (depth + max_per_level), `get_embedding_neighbors`, `get_note_content`, `get_stats`
- [obsidian-mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin): 8 semantic groups including graph traversal, backlink/forward-link analysis, pathfinding

### Enhanced Knowledge Graph Servers
- [knowledgegraph-mcp](https://github.com/n-r-w/knowledgegraph-mcp): PostgreSQL/SQLite, fuzzy search, tags, batch queries
- [Memento MCP](https://github.com/gannonh/memento-mcp): Neo4j, vector embeddings, temporal versioning, 17 tools

---

## Recommended Tool Decomposition

**Source**: Analysis of 8+ MCP server implementations

| Tool | Purpose | Annotation |
|------|---------|------------|
| `search_articles` | Free-text/semantic search | readOnly |
| `get_article` | Retrieve specific article by slug | readOnly |
| `get_backlinks` | Articles linking TO a given article | readOnly |
| `get_outgoing_links` | Articles a given article links TO | readOnly |
| `get_link_graph` | Multi-hop BFS traversal | readOnly |
| `suggest_links` | Semantic similarity link suggestions | readOnly |

### Why Multiple Tools
1. LLM accuracy drops with overlapping tools — [Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)
2. Different context window costs per tool
3. Composability: search → select → get_backlinks → get_article
4. Avoid enum dispatch pattern (`action: "backlinks" | "search" | ...`)
5. Keep under ~10-12 tools per server

---

## Resources vs. Tools

**Source**: [MCP Spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | [Medium analysis](https://medium.com/@laurentkubaski/mcp-resources-explained-and-how-they-differ-from-mcp-tools-096f9d15f767)

| Dimension | Resources | Tools |
|-----------|-----------|-------|
| Control | Application-driven (user selects) | Model-driven (LLM invokes) |
| Analogy | Nouns — data you read | Verbs — actions you perform |
| Side effects | Read-only | May modify state |
| URI-addressed | Yes | No (name-identified) |
| Subscription | Yes | No |

**Recommendation**: Tools as primary (agent autonomy), resources as complement for article index browsing.

---

## Context Window Management

### Progressive Detail Retrieval
- First call: summaries (title, slug, snippet, link count) — ~50 tokens/item
- Follow-up: full article content — ~2000+ tokens/item
- Agent selects which items need full detail

### Cursor-Based Pagination
```json
{
  "backlinks": [ /* first 10 */ ],
  "pagination": { "hasMore": true, "nextCursor": "opaque-token", "total": 47 }
}
```
Source: [Pagination proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/799)

### Resource Links for Deferred Loading
```json
{
  "type": "resource_link",
  "uri": "kb://article/oauth2-pkce-flow",
  "name": "OAuth2 PKCE Flow",
  "mimeType": "text/markdown"
}
```
Client chooses whether to fetch full content.

---

## Agent Navigation Pattern: Explore → Narrow → Follow

1. **Explore**: `search_articles("authentication")` → ranked results with snippets
2. **Narrow**: `get_article("oauth2-pkce-flow")` → full content
3. **Follow**: `get_backlinks("oauth2-pkce-flow")` → discover related content
4. **Expand**: `get_link_graph("oauth2-pkce-flow", depth=2)` → broader context
5. **Suggest**: `suggest_links("oauth2-pkce-flow")` → find missing links
