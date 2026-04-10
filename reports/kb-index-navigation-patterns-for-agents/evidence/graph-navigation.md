# Evidence: Graph-Based Knowledge Navigation

**Dimension:** D5 — Graph-based knowledge navigation
**Date:** 2026-04-02
**Sources:** GraphRAG/LightRAG docs, Obsidian forum, MCP server repositories, academic papers

---

## Key files / pages referenced

- https://github.com/HKUDS/LightRAG — LightRAG repository (EMNLP 2025)
- https://www.meilisearch.com/blog/graph-rag — GraphRAG complete guide 2026
- https://github.com/drewburchfield/obsidian-graph-mcp — Obsidian Graph MCP (semantic graph navigation)
- https://blog.fsck.com/releases/2026/03/20/knowledge-graph/ — Knowledge Graph Tools
- https://github.com/cyanheads/obsidian-mcp-server — Obsidian MCP server with graph tools
- https://www.harness.io/blog/your-repo-is-a-knowledge-graph-you-just-dont-query-it-yet — Harness "repo as knowledge graph"
- https://infranodus.com/obsidian-plugin — InfraNodus Obsidian AI Graph View
- /Users/edwingomezcuellar/reports/agent-knowledge-retrieval-paradigms-2025-2026/REPORT.md — Prior report

---

## Findings

### Finding: GraphRAG costs ~$33K to index and is overkill at 100-1000 article scale
**Confidence:** CONFIRMED
**Evidence:** Prior report (agent-knowledge-retrieval-paradigms), https://www.meilisearch.com/blog/graph-rag

Microsoft's GraphRAG builds "large communities and traverses them during retrieval, providing strong global understanding but at extremely high token costs and slow update speeds." The indexing cost for production-scale corpora is approximately $33K. For 100-1000 articles, "frontmatter metadata (topics, tags, cross-references) provides lightweight graph functionality without the infrastructure."

**Implications:** Full GraphRAG is not viable for the ~100-1000 article KB scale. The overhead is not justified when simpler metadata-based approaches work.

### Finding: LightRAG implements lightweight graph construction during ingestion, not traversal-heavy retrieval
**Confidence:** CONFIRMED
**Evidence:** https://github.com/HKUDS/LightRAG

LightRAG (EMNLP 2025) "treats knowledge graph retrieval as an indexing problem, building a lightweight knowledge graph during ingestion rather than relying on traversal-heavy reasoning." Uses dual-level keyword extraction (high-level themes + low-level entities). BFS traversal for graph lookups. Supports incremental updates. 51K+ GitHub stars. Key distinction from GraphRAG: lighter-weight, faster updates, less expensive.

**Implications:** LightRAG shows that graph-based navigation CAN be lightweight enough for modest-scale KBs, but it's still infrastructure-heavy compared to frontmatter metadata.

### Finding: Obsidian's graph view is "more fun to look at than to actually navigate"
**Confidence:** CONFIRMED
**Evidence:** Multiple Obsidian forum posts, practitioner reports

The Graph View creates "a visual map of all your notes, showing them as little dots and the links between them as lines." But at scale, it becomes "a tangled web that's more fun to look at than to actually navigate." The local graph (showing connections around a single note) is more practical than the global graph. Backlinks plugin provides bidirectional navigation. InfraNodus adds betweenness centrality, community detection, and structural gap analysis using network science.

**Implications:** Graph visualization doesn't equal graph navigation. For agents, the backlinks structure IS useful as navigation data, but the visual graph view is a human affordance with limited agent utility.

### Finding: MCP servers implement graph tools for vaults but with varying architectures
**Confidence:** CONFIRMED
**Evidence:** https://github.com/drewburchfield/obsidian-graph-mcp, https://github.com/cyanheads/obsidian-mcp-server, https://blog.fsck.com/releases/2026/03/20/knowledge-graph/

Three distinct MCP architecture approaches: (1) REST API bridge (requires Obsidian running); (2) Filesystem direct (reads markdown files); (3) Native plugin (accesses Obsidian internal APIs including knowledge graph, Dataview, backlinks). obsidian-graph-mcp uses PostgreSQL+pgvector for semantic graph navigation. The knowledge graph tools parse vault into graph (files=nodes, wikilinks=edges), index into SQLite with vector embeddings, and provide operations like kg_node, kg_search, kg_paths (all connecting paths between nodes). 45+ Obsidian MCP servers exist.

**Implications:** Graph-based MCP tools exist but are fragmented. The most useful pattern for agents is "follow links between notes" rather than "traverse a visual graph." Backlinks as navigation data is practical; full graph algorithms are niche.

### Finding: Wikilinks in markdown create an implicit navigable graph that agents can traverse
**Confidence:** INFERRED
**Evidence:** Obsidian's linking model, multiple MCP server implementations

Every [[wikilink]] creates a directional edge in a document graph. Backlinks reverse these edges. An agent with tools to list backlinks and outgoing links can traverse the knowledge graph step by step. This is the simplest form of graph navigation — no separate graph database needed, just the markdown files themselves.

**Implications:** For a KB of 100-1000 articles, wikilinks + backlink tools may provide sufficient graph navigation without any graph infrastructure. The graph IS the link structure already embedded in the content.

---

## Gaps / follow-ups

* No quantitative evidence found comparing graph navigation vs search vs index for agent task completion in a KB context
* Roam Research / Logseq agent interaction patterns not deeply investigated
* Academic work on document graph navigation for LLMs is sparse — most work focuses on knowledge graphs, not document graphs
