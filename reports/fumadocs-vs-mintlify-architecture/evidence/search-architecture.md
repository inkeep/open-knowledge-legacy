# Evidence: Search Architecture

**Dimension:** Search Architecture
**Date:** 2026-04-02
**Sources:** fumadocs.dev, mintlify.com, techintelpro.com

---

## Key files / pages referenced

- https://fumadocs.dev/docs/headless/search/orama — Fumadocs Orama search
- https://fumadocs.dev/docs/search/flexsearch — Fumadocs FlexSearch
- https://fumadocs.dev/docs/headless/search/algolia — Fumadocs Algolia
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs
- https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation — Trieve acquisition

---

## Findings

### Finding: Fumadocs has a pluggable, multi-provider search architecture with Orama as default
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/headless/search/orama

Supported search providers:
- **Orama** (default, recommended): Can run as API endpoint (server) or static cached JSON (static sites). Same engine used by Node.js docs.
- **Orama Cloud**: Managed Orama with cloud indexing
- **Algolia v5**: Creates per-paragraph records. Algolia-recommended approach.
- **Mixedbread SDK**: Vector/semantic search option
- **FlexSearch**: Alternative local search, supports static export

Unified API: `createFromSource()` abstraction with SearchAPI interface
Modes: Static (browser-based, pre-rendered index) and fetch (server-side)
i18n support: Per-locale indexes with custom tokenizers

**Implications:** Fumadocs treats search as a pluggable concern. You can swap providers without changing application code. The static mode is critical for git-backed, CDN-deployed sites.

### Finding: Mintlify uses hybrid search with Trieve (acquired) plus agentic retrieval via ChromaFs
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

Search layers:
1. **Keyword + semantic search**: Powered by Trieve (acquired company). Combines dense vector semantic search with cross-encoder re-ranking.
2. **AI Assistant (agentic retrieval)**: Uses tool calling instead of traditional RAG. The LLM chooses how to search and what context to retrieve.
3. **ChromaFs virtual filesystem**: Unix commands (grep, cat, ls, find) translated to Chroma vector DB queries. Powers the AI assistant.

ChromaFs performance:
- Boot time: ~100ms (vs 46 seconds with sandboxes)
- Cost: ~$0/conversation (vs $0.0137 with sandboxes)
- Scale: 30,000+ conversations/day, 850,000/month
- Built on "just-bash" (Vercel Labs TypeScript bash implementation)
- Read-only filesystem with EROFS for write attempts
- Chunk reassembly for documents split across Chroma chunks

**Implications:** Mintlify's search is deeply integrated with their AI assistant. ChromaFs is a novel approach — giving agents the illusion of filesystem navigation over a vector database. This is architecturally relevant to the knowledge platform concept.

---

## Gaps / follow-ups

- Fumadocs' search relevance quality compared to Mintlify is not benchmarked
- Whether ChromaFs is available as an open-source component is unclear (likely proprietary)
