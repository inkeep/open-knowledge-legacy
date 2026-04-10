# Evidence: Search Capabilities (D2)

**Dimension:** D2 — Search capabilities
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev docs, web search

---

## Key files referenced

- `packages/core/src/search/orama/create-db.ts` — Orama DB schemas (simple + advanced)
- `packages/core/src/search/orama/search/simple.ts` — Simple search implementation
- `packages/core/src/search/orama/search/advanced.ts` — Advanced search with embeddings
- `packages/core/src/search/mixedbread.ts` — Mixedbread vector search integration
- `packages/core/src/search/algolia.ts` — Algolia integration
- `packages/core/src/search/flexsearch.ts` — FlexSearch integration
- `packages/core/src/search/server/build-index.ts` — Search index building from StructuredData
- `packages/core/src/search/client.ts` — Client-side search APIs
- `packages/core/src/mdx-plugins/remark-structure.ts` — StructuredData extraction

---

## Findings

### Finding: Orama advanced schema includes vector embeddings natively
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/search/orama/create-db.ts`

```typescript
export const advancedSchema = {
  content: 'string',
  page_id: 'string',
  type: 'string',
  breadcrumbs: 'string[]',
  tags: 'enum[]',
  url: 'string',
  embeddings: 'vector[512]',
} as const;
```

Fumadocs has TWO Orama search modes:
1. **Simple** — full-text search over title, description, content, breadcrumbs, keywords
2. **Advanced** — includes `embeddings: 'vector[512]'` for semantic/hybrid search, plus tag-based filtering

The advanced mode splits documents by headings (per-section indexing), not per-page.

**Implications:** Semantic search is already architecturally supported in Fumadocs via the advanced Orama schema. The embeddings field means you can combine full-text and vector search. For a Karpathy-style knowledge base with ~400K words, this per-section indexing is essential for relevance.

### Finding: Mixedbread SDK provides external vector search with reranking
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/search/mixedbread.ts`

```typescript
export interface MixedbreadSearchOptions {
  client: Mixedbread;
  storeIdentifier: string;
  topK?: number;
  rerank?: boolean;         // Re-rank for relevance
  rewriteQuery?: boolean;   // Query rewriting
  scoreThreshold?: number;
  transform?: (results, query) => SortedResult[];
}
```

Mixedbread provides cloud-hosted vector search with built-in reranking and query rewriting. Results are normalized to Fumadocs' `SortedResult` format.

**Implications:** For production semantic search at scale, Mixedbread is the managed option. The reranking and query rewriting features are particularly relevant for LLM Q&A workloads where user queries are natural language.

### Finding: Search indexing is built from remarkStructure's StructuredData
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-structure.ts`, `packages/core/src/search/server/build-index.ts`

remarkStructure extracts:
```typescript
interface StructuredData {
  headings: StructuredDataHeading[];  // {id, content}
  contents: StructuredDataContent[];  // {heading, content}
}
```

Each content block is associated with its nearest heading. `buildIndexDefault(page)` assembles SharedIndex objects from this structured data. The search index is heading-aware, meaning searches return results anchored to specific sections, not just pages.

**Implications:** The structured data extraction is the bridge between MDX content and search. For LLM-compiled wiki content, this means search results link to specific sections — much more useful than page-level results for a ~100 article knowledge base.

### Finding: Unified SearchAPI interface enables pluggable providers
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/search/server/endpoint.ts` and search implementations

All search providers conform to a single `SearchAPI` interface with `search(query, options)` and `export()` methods. This means:
- Orama (local, free, default)
- Orama Cloud (managed)
- Algolia v5 (managed)
- FlexSearch (lightweight, static)
- Mixedbread (vector, managed)
- Custom (any implementation of SearchAPI)

**Implications:** You could build a custom SearchAPI that wraps any vector database (Pinecone, Qdrant, pgvector, etc.) and plug it into Fumadocs without touching any other code. For an LLM knowledge base, you'd likely want a hybrid search (BM25 + vector) — achievable by composing providers.

### Finding: Static search export works for CDN-deployed sites
**Confidence:** CONFIRMED
**Evidence:** Orama and FlexSearch both support static mode, pre-rendering indexes as cached JSON files. This means search works without a server — the entire index is downloaded to the client.

**Implications:** For a small knowledge base (~100 articles), client-side search is viable. For larger bases, server-side or cloud search is needed. The threshold is approximately 2,400 notes based on the Obsidian wiki report's findings about search relevance discrimination.

---

## Gaps / follow-ups

- Orama advanced mode: how are embeddings generated? (build-time or external?)
- Performance of static Orama search with 100+ pages
- Could you combine multiple search providers (full-text + semantic) in a single query?
