# Evidence: Semantic Search + Link Graph Integration

## Orama Search Engine

**Source**: [oramasearch/orama](https://github.com/oramasearch/orama) | [Orama Docs](https://docs.orama.com/)

### Architecture
- In-memory full-text search engine using radix tree + BM25 scoring
- Also supports QPS (Quantum Proximity Scoring) for proximity-focused queries
- Vector search and hybrid search (full-text + vector) supported
- Sub-2KB bundle size (client-side capable)
- Written in TypeScript

### Incremental Updates
- `insert(db, document)` — add single document
- `insertMultiple(db, documents)` — batch insert
- `update(db, id, newDocument)` — update existing document
- `remove(db, id)` — remove document
- No full rebuild required for individual changes

### Faceted Search / Filtering
- `where` clause supports: `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `in`
- Array fields (enum[]): `containsAll` operator
- Example: `{ where: { tags: { containsAll: ["backlink", "active"] } } }`
- Source: [Orama Filters docs](https://docs.orama.com/open-source/usage/search/filters)

### Hybrid Search
- Combines full-text BM25 with vector similarity
- Auto-selects mode based on query characteristics
- Source: [Orama search docs](https://docs.orama.com/open-source/usage/search/introduction/)

### Performance
- Sub-50ms responses with filtering, ranking, and scoring
- Example: 21μs query time in README demo
- In-memory: "sub-millisecond because there's no network latency—it's all in RAM"
- Source: [Orama GitHub](https://github.com/oramasearch/orama)

### OramaCore (Server Runtime)
- Rust-based server for production scale
- Full-text + vector + LLM pipeline
- Requires GPU for production (minimum NVIDIA A100)
- Different use case from in-process JS Orama
- Source: [oramasearch/oramacore](https://github.com/oramasearch/oramacore)

---

## Combining Search + Link Graph

### Pattern 1: Link-Aware Metadata in Search Index

Store link metadata as filterable fields in Orama:

```typescript
const db = await create({
  schema: {
    slug: 'string',
    title: 'string',
    content: 'string',
    outgoing_links: 'enum[]',   // slugs this article links to
    backlink_count: 'number',   // number of articles linking here
    tags: 'enum[]',
  }
})
```

Queries:
- "Find articles about auth that link to `oauth2-pkce`": `search(db, { term: "auth", where: { outgoing_links: { containsAll: ["oauth2-pkce"] } } })`
- "Find highly-connected articles": `search(db, { term: "", where: { backlink_count: { gte: 5 } } })`

### Pattern 2: Link Proximity as Ranking Signal

Custom scoring that boosts results closer in the link graph:

```
final_score = bm25_score * (1 + link_proximity_bonus)

where link_proximity_bonus:
  direct_link = 0.5      (article links to or is linked from query context)
  2_hops = 0.2           (reachable in 2 hops)
  same_cluster = 0.1     (in same community/cluster)
  no_connection = 0.0
```

### Pattern 3: Suggest New Links via Semantic Similarity

1. For each article, compute embedding vector
2. Use Orama vector search to find semantically similar articles
3. Filter out articles that already have explicit wiki-links
4. Remaining results = suggested new links

```
suggest_links(slug):
  article = get_article(slug)
  similar = vector_search(article.embedding, threshold=0.7, limit=20)
  existing_links = get_outgoing_links(slug) + get_backlinks(slug)
  suggestions = similar.filter(s => !existing_links.includes(s.slug))
  return suggestions
```

---

## Related Tools: Knowledge Graph + Search

### obra/knowledge-graph
- **Source**: [github.com/obra/knowledge-graph](https://github.com/obra/knowledge-graph)
- Parses Obsidian vault into graph (files=nodes, [[wikilinks]]=edges)
- Indexes into SQLite with vector embeddings + FTS5
- Semantic search via local embeddings
- Graph traversal + search in one system
- Claude Code plugin included

### @fluxgraph/knowledge
- **Source**: [npm @fluxgraph/knowledge](https://www.npmjs.com/package/@fluxgraph/knowledge)
- TypeScript knowledge graph with multiple DB backends (SQLite, Cloudflare D1, LibSQL)
- Built-in full-text search indexing
- Graph algorithms (path finding, centrality, community detection)
- Mermaid diagram generation
- Source: [npmjs.com](https://www.npmjs.com/package/@fluxgraph/knowledge)

---

## Dual-Index Architecture: Link Graph + Search

The optimal design maintains two complementary indexes:

| Index | Technology | Data | Query Patterns |
|-------|-----------|------|---------------|
| **Link Graph** | In-memory adjacency lists | Forward links, backlinks, edge metadata | get_backlinks, get_outgoing_links, BFS traversal, hub detection |
| **Search Index** | Orama (in-memory) | Title, content, tags, link metadata | Full-text search, semantic search, filtered queries |

Both indexes are derived from the same source of truth (article content in Y.Doc / markdown files).

### Synchronization
- Both indexes updated from the same event stream (Hocuspocus onChange / file watcher)
- Link graph: extract links from ProseMirror AST → update adjacency lists
- Search index: extract text/metadata → Orama insert/update
- Both are eventually consistent with the same latency (debounce window)

### Cross-Index Queries
- Search finds articles → link graph provides relationship context
- Link graph finds connected articles → search ranks by relevance
- Suggest links: search finds semantically similar → filter by link graph (exclude existing links)
