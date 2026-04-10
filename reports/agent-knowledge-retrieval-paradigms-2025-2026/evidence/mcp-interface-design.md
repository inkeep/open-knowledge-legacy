# Evidence: MCP Interface Design Implications (D8)

**Dimension:** D8 — Implications for a Knowledge Platform MCP Interface
**Date:** 2026-04-03
**Sources:** MCP server implementations, practitioner blogs, tool documentation
**Sub-report evidence:** fanout/2026-04-02-fanout/emerging-patterns-mcp-interface/evidence/ (10 files)

---

## Key Findings

### Finding: Progressive disclosure achieves same results in ~800 tokens vs ~4,000-6,000 for traditional RAG
**Confidence:** CONFIRMED
**Evidence:** [Honra](https://www.honra.io/articles/progressive-disclosure-for-ai-agents); [Linkly AI](https://linkly.ai/blog/outlines-index-progressive-disclosure-for-ai-agents)

"Agents get dumber when given too much information upfront." Three layers: index -> summary -> full read. Claude Code's skill system uses this pattern: metadata at startup, full content on demand.

### Finding: Every existing MCP KB server lacks semantic search, progressive disclosure, relevance scoring
**Confidence:** CONFIRMED
**Evidence:** Gap analysis of Context7, Notion MCP, Obsidian MCP, GitBook MCP

Context7: no browse/list, no summary layer, no corpus overview. Notion MCP: no semantic search documented, limited metadata. Obsidian MCP: no semantic search, no scoring. GitBook MCP: no semantic search, limited browse.

### Finding: Markdown is the optimal content format for agent consumption (15-30% token savings vs JSON/XML)
**Confidence:** CONFIRMED
**Evidence:** [DEV Community](https://dev.to/lingodotdev/how-to-serve-markdown-to-ai-agents-making-your-docs-more-ai-friendly-4pdn); [Medium analysis](https://medium.com/@kanishk.khatter/markdown-a-smarter-choice-for-embeddings-than-json-or-xml-70791ece24df)

De facto LLM native language. Better embedding quality. Human-writable. Use JSON envelope for structured metadata (scores, pagination, filtering).

### Finding: MCP best practice is 10-15 tools maximum; 4 core tools is optimal for KB
**Confidence:** INFERRED
**Evidence:** Anthropic context engineering guidance; analysis of successful MCP servers

"If a human can't tell which tool to use, neither can the AI." Core 4: get_overview, search, list_articles, read_article. Optional 2: get_article_summary, search_by_metadata.

### Finding: Context7's two-tool pattern (resolve -> query) proven at scale
**Confidence:** CONFIRMED
**Evidence:** [github.com/upstash/context7](https://github.com/upstash/context7) — 51.6K stars, 240K weekly npm downloads

Simplest successful MCP knowledge interface in production. Two tools only. Server-side reranking handles quality.

### Finding: Google Developer Knowledge MCP Server validates two-phase search -> read architecture
**Confidence:** CONFIRMED
**Evidence:** [developers.google.com/knowledge/mcp](https://developers.google.com/knowledge/mcp), February 2026

SearchDocumentChunks -> GetDocument/BatchGetDocuments. Markdown output. 24-hour re-indexing. Streamable HTTP.

### Finding: At 100-1000 articles, full articles are the retrieval unit (not chunks)
**Confidence:** INFERRED
**Evidence:** Convergence of Karpathy pattern, Claude Code read pattern, article-level progressive disclosure

Most articles at this scale are 500-2000 tokens. Article-level retrieval avoids all chunking failure modes documented by Barnett et al. Chunk-level retrieval becomes necessary at 10K+ or for very long articles.

---

## Gaps / Follow-ups

* MCP Resource vs Tool for index — Resources are passively available but less discoverable in some clients; needs testing
* Optimal embedding model for markdown articles at 100-1000 scale — no specific benchmark exists
* Pre-computed vs on-demand article summaries — tradeoff depends on update frequency
