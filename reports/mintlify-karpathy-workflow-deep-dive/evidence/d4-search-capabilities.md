# Evidence: D4 — Search Capabilities

**Dimension:** Search quality, Trieve integration, semantic capabilities, external agent access
**Date:** 2026-04-02
**Sources:** Trieve acquisition blog, Mintlify search docs, ChromaFs blog, MCP documentation

---

## Key pages referenced
- https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation — Trieve acquisition
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs (AI Assistant search)
- https://www.mintlify.com/docs/ai/model-context-protocol — MCP search endpoint
- https://www.trieve.ai/ — Trieve documentation

---

## Findings

### Finding: Mintlify uses Trieve for hybrid semantic + keyword search
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation

Trieve (acquired July 2025) provides:
- Dense vector semantic search
- Cross-encoder re-ranking
- Date recency biasing
- Sub-sentence highlighting
- Hybrid search (semantic + keyword)

Claimed improvements: 50% faster search times, 40% better answer accuracy.

Trieve processes 23M+ queries/month across Mintlify's platform. Trieve Cloud was sunset November 1, 2025 — the technology is now fully integrated into Mintlify.

### Finding: AI Assistant uses ChromaFs for structured file exploration, not just search
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

The AI Assistant doesn't just do retrieval — it navigates a virtual filesystem:
1. Agent issues UNIX commands (grep, find, cat, ls)
2. ChromaFs translates to Chroma DB queries
3. Two-stage grep: coarse Chroma filter -> fine in-memory regex
4. Results cached in Redis for repeated access

This means the AI Assistant has a fundamentally different search model than simple RAG:
- It can browse hierarchically (ls, cd)
- It can search with regex (grep)
- It can read full pages (cat)
- It can discover structure (find)

### Finding: External agents CAN leverage search via MCP, with version and language filters
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/model-context-protocol

The MCP Search tool accepts:
- Free-text query
- pageSize (1-50)
- scoreThreshold (0-1 relevance cutoff)
- version filter
- language filter

Rate limit: 5,000 req/hr per user, 10,000 req/hr per site.

This is sufficient for an agent to do Q&A against documentation. But the search quality is whatever Trieve provides — the user has no control over:
- Embedding model
- Similarity metrics
- Re-ranking strategy
- Custom metadata filters (beyond version/language)
- Custom taxonomies or tags

### Finding: No custom embedding or vector search for users
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched Mintlify docs and API

Users cannot:
- Bring their own embeddings
- Configure search weights or ranking
- Add custom metadata fields for filtering
- Run custom search queries beyond the MCP Search tool
- Access raw search scores or relevance explanations

Search is a managed black box. This is a feature (zero config) and a limitation (no customization).

---

## Negative searches

* Searched: "Mintlify custom search configuration" — No user-configurable search settings found
* Searched: "Mintlify search API custom filters metadata" — Only version and language filters available

---

## Gaps / follow-ups

* Exact search quality comparison (Trieve semantic vs plain text vs custom embeddings) would require testing
* Whether MCP Search uses Trieve's full hybrid stack or a simpler index is not explicitly documented
