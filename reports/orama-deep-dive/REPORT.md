---
title: "Orama Deep Dive: A Source-Code-Level Assessment for Agent-Native Knowledge Platforms"
description: "Comprehensive deep dive into Orama v3 (the pure-TypeScript in-memory search engine) evaluated for use in a local-first, agent-native knowledge platform. Covers: hybrid search fusion mechanics (weighted-sum, not RRF), brute-force vector search internals, schema/document model, persistence formats (JSON/binary/dpack/seqproto), match highlighting, plugin ecosystem (19 packages), Fumadocs integration pattern, production maturity (2.1M npm downloads/month, Apache 2.0), v3 vs v2 breaking changes (sync-by-default), and a detailed gap analysis for what Orama does NOT provide (reranking, backlinks, MCP server, filesystem watching, incremental persistence)."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Orama
  - OramaSearch Inc
  - Orama Cloud
  - OramaCore
  - Fumadocs
topics:
  - hybrid search internals
  - in-memory search engine
  - TypeScript search library
  - vector search implementation
  - search engine gap analysis
---

# Orama Deep Dive: A Source-Code-Level Assessment for Agent-Native Knowledge Platforms

**Purpose:** Provide a mechanical, source-code-grounded understanding of exactly what Orama v3 provides and does not provide, evaluated specifically for use as the search engine in a local-first, agent-native knowledge platform (Node.js/TypeScript, ~100-1000 markdown articles, hybrid BM25 + vector search).

---

## Executive Summary

Orama v3 is a pure-TypeScript, in-memory search engine that delivers hybrid search (BM25 full-text + vector similarity) from a single `search()` call with zero native dependencies. At the ~1,000-document scale of our knowledge platform, it is more than adequate: full-text search completes in microseconds, hybrid search in 5-15ms, and the entire index fits in <10 MB of RAM. The library is mature (2.1M npm downloads/month, Apache 2.0, backed by OramaSearch Inc.) and actively maintained at v3.1.18.

Source code analysis reveals three architectural realities that are not obvious from documentation:

1. **Hybrid search fusion is weighted-sum with min-max normalization, not Reciprocal Rank Fusion (RRF).** Both text and vector scores are min-max normalized to [0,1], then combined as `textScore * textWeight + vectorScore * vectorWeight`. Default weights are 0.5/0.5, configurable per query via `hybridWeights`. This is simpler than RRF and can produce different ranking behavior -- particularly when one modality returns far more results than the other.

2. **Vector search is brute-force cosine similarity -- no ANN index.** Orama iterates every vector in the index, computing cosine similarity via dot product. This is O(n*d) per query. At 1,000 documents with 384-dim vectors, this takes <1ms. At 10,000 it takes <5ms. Beyond ~50K documents, an approximate nearest neighbor (HNSW, IVF) index would be needed, but Orama does not provide one.

3. **The v3 sync-by-default design is a meaningful architectural choice.** All core operations (create, insert, search) return synchronously when no async hooks are registered. Async behavior activates only when plugins with async hooks are present. This eliminates microtask overhead for the common case and makes Orama feel like a native data structure rather than a database client.

The gaps that matter for our use case are moderate and well-scoped: no frontmatter-aware parsing (we handle this), no filesystem watcher (we build this), no MCP server (we build this), no reranking (optional), no incremental persistence (unnecessary at 1K docs). None of these gaps are architectural blockers -- they represent the expected boundary between a search engine library and a complete knowledge platform.

**Key Findings:**

- **Hybrid search is configurable weighted-sum fusion** -- not RRF. Text and vector weights adjustable per query. Default is 50/50.
- **Vector search is brute-force cosine similarity** -- adequate at 1K docs, limits scaling past ~50K without replacement.
- **19 packages in the monorepo** including persistence (4 serialization formats), match highlighting (character positions), stemmers for 30 languages, tokenizers for Japanese/Chinese.
- **v3 is sync-by-default** -- major performance improvement over v2's all-async API. Operations return `T | Promise<T>`.
- **External embeddings fully supported** -- just pass `number[]` to the vector field. No coupling to any embedding provider.
- **Schema is fixed at creation** -- no field addition without rebuilding the index.
- **Update is remove + insert** -- not an in-place patch.
- **2.1M monthly npm downloads, Apache 2.0 license, venture-backed company.**

---

## Research Rubric

**Report Type:** Technology Deep-Dive / Capability Assessment
**Primary Question:** What exactly does Orama v3 provide and not provide for a local-first agent-native knowledge platform?
**Audience:** Engineering team building a knowledge platform with Orama as the search engine
**Stance:** Factual -- mechanical assessment of capabilities, not recommendation

| # | Dimension | Depth | Priority | Kind |
|---|-----------|-------|----------|------|
| D1 | Core search capabilities | Deep | P0 | Mechanical + Primary source |
| D2 | Schema and document model | Deep | P0 | Mechanical + Primary source |
| D3 | Vector / embedding support | Deep | P0 | Mechanical + Primary source |
| D4 | Snippet / highlight extraction | Deep | P0 | Mechanical + Primary source |
| D5 | Performance at our scale | Deep | P0 | Quantitative |
| D6 | Persistence and serialization | Deep | P0 | Mechanical + Primary source |
| D7 | The Orama ecosystem and plugins | Deep | P0 | Primary source |
| D8 | Integration patterns | Deep | P0 | Practical |
| D9 | What Orama does NOT do (gaps) | Deep | P0 | Adversarial |
| D10 | Production usage and maturity | Deep | P0 | Quantitative |
| D11 | Orama v3 vs v2 | Deep | P0 | Mechanical |

**Non-goals:** Orama Cloud evaluation (we use OSS only); comparison with alternative search engines (covered in separate report); 1P codebase analysis; pricing analysis.

---

## Detailed Findings

### D1: Core Search Capabilities

**Finding:** Orama provides a complete search feature set including BM25 full-text, vector similarity, hybrid fusion, faceted search, geosearch, boolean filters, fuzzy matching, and field boosting. The search API is a single `search()` function with mode selection.

**Evidence:** [evidence/core-search-capabilities.md](evidence/core-search-capabilities.md)

#### Full-Text Search

Full-text search uses BM25 scoring with configurable parameters (k=1.2, b=0.75, d=0.5 by default). Tokenization follows a pipeline: lowercase, split on language-specific regex, remove stop words (optional), stem (optional), remove diacritics, deduplicate. Only the English stemmer is bundled in the core package; other languages require `@orama/stemmers`.

The `threshold` parameter controls AND/OR behavior: 0 means all query terms must match (AND), 1 means any term can match (OR). Values between act as a sliding scale. This naming is counterintuitive -- it does not represent a minimum score cutoff.

Field boosting allows per-property score multipliers: `boost: { title: 2 }` doubles the score contribution of title matches.

#### Hybrid Search Fusion

The hybrid search algorithm works as follows:

1. Run full-text search (BM25) and vector search independently
2. Min-max normalize full-text scores to [0, 1]
3. Combine using weighted sum: `finalScore = textScore * textWeight + vectorScore * vectorWeight`
4. Default weights: 0.5 text, 0.5 vector (configurable via `hybridWeights`)
5. Sort by combined score descending

This is a simpler fusion method than Reciprocal Rank Fusion (RRF). The key difference: weighted-sum is sensitive to the score distributions of each modality, while RRF is rank-based and distribution-agnostic. For our use case (consistent document types, similar content length), weighted-sum should work well. If we observe ranking quality issues, we could implement RRF as a post-processing step.

The source code includes a comment: "In the next versions of Orama, we will ship a plugin containing a ML model to adjust the weights based on whether the query is keyword-focused, conceptual, etc." This has not shipped yet.

#### Filtering and Boolean Logic

Where clauses support AND, OR, NOT composition:

```typescript
where: {
  and: [
    { category: { eq: 'tutorial' } },
    { or: [
      { difficulty: { lte: 3 } },
      { featured: true }
    ]}
  ]
}
```

Numeric filters: gt, gte, lt, lte, eq, between. Enum filters: eq, in, nin. Enum array filters: containsAll, containsAny. String filters match on exact token values. Geopoint filters support radius and polygon queries.

#### Additional Search Features

- **Faceted search**: String facets (count, sort), number facets (range buckets), boolean facets
- **GroupBy**: Group results by properties with optional reduce function
- **DistinctOn**: Deduplicate results by a property
- **Preflight**: Returns just count and facets without fetching documents (fast metadata queries)
- **Exact match**: Case-sensitive exact string matching (added by popular demand)
- **Tolerance**: Levenshtein distance-based fuzzy matching
- **SortBy**: Sort by any field (ascending/descending) or custom comparator

**Decision triggers:**
- If you need RRF fusion instead of weighted-sum, you'd implement it as a post-processing wrapper.
- If you need per-field numeric range filters (e.g., "published after 2024"), these work natively.
- If you need full-text AND/OR/NOT combined with numeric filters, the where clause handles this.

---

### D2: Schema and Document Model

**Finding:** Schema is a plain JavaScript object with string type descriptors, supporting 10 field types including nested objects. Schema is fixed at creation time with no evolution. Update is remove + insert. Batch insert supports configurable batch size with event-loop yielding.

**Evidence:** [evidence/schema-document-model.md](evidence/schema-document-model.md)

The schema definition is straightforward:

```typescript
const db = create({
  schema: {
    title: 'string',         // full-text indexed
    content: 'string',       // full-text indexed
    tags: 'enum[]',          // filterable array
    publishedAt: 'number',   // numeric filter (store as Unix timestamp)
    embedding: 'vector[384]', // vector search
    metadata: {
      author: 'string',     // nested, searchable as 'metadata.author'
      difficulty: 'number'
    }
  }
})
```

Ten types are supported: string, number, boolean, enum, geopoint, string[], number[], boolean[], enum[], vector[N]. Nested objects are flattened to dot-notation paths internally.

There is no schema evolution. Adding a field requires creating a new database and re-inserting all documents. For our use case with ~1,000 documents, full re-index takes <1 second, so this is not a practical limitation.

Documents get auto-generated string IDs by default. The ID generation function can be overridden via custom components (e.g., to use the article slug as the document ID).

`insertMultiple` batches documents in groups of 1,000 by default, with an optional `timeout` parameter that yields to the event loop between batches. This prevents UI freezing in browser environments.

**Decision triggers:**
- If you need to add a field, you rebuild the index. This is fast at 1K docs but would be slow at 100K+.
- If you need partial document updates (patch a single field), you must re-insert the full document.
- If you want deterministic IDs (e.g., file path), override `getDocumentIndexId` in components.

---

### D3: Vector / Embedding Support

**Finding:** Orama supports any-dimension vectors with brute-force cosine similarity search. External embeddings are first-class -- just pass `number[]`. The built-in embedding plugin uses TensorFlow.js USE (lower quality than modern alternatives). Vector search supports pre-filtering via where clauses.

**Evidence:** [evidence/vector-embedding-support.md](evidence/vector-embedding-support.md)

The vector index is implemented as a `Map<InternalDocumentID, [Magnitude, Float32Array]>`. Magnitudes are pre-computed at insert time for efficient cosine computation. Search iterates every vector (or only filtered vectors if a where clause is provided), computing `dotProduct / (queryMagnitude * documentMagnitude)` and returning results above the similarity threshold (default 0.8).

External embeddings from `@huggingface/transformers` (or any other source) work directly:

```typescript
const embedding = await embedder('Some text')  // returns number[384]
insert(db, { title: 'Article', content: '...', embedding })
```

The built-in `@orama/plugin-embeddings` uses TensorFlow.js Universal Sentence Encoder (512 dimensions). This is significantly lower quality than `bge-small-en-v1.5` via `@huggingface/transformers`. For our use case, we should generate embeddings externally and pass them in.

Vector search can be used standalone (`mode: 'vector'`), in hybrid mode (`mode: 'hybrid'`), or full-text only (default). All three modes support where clause pre-filtering.

**Scaling analysis:**
- 1K docs, 384-dim: ~1.5 MB memory, <1ms search
- 10K docs, 384-dim: ~15 MB memory, <5ms search
- 100K docs, 384-dim: ~150 MB memory, 50-100ms search (brute-force becomes noticeable)
- Beyond ~50K: would need an ANN index (not provided by Orama)

**Decision triggers:**
- At our 1K-doc scale, brute-force vector search is ideal (simple, exact, fast).
- If we grow to 50K+ documents, we'd need to replace the vector index with HNSW or switch to a different search engine.
- The `@orama/plugin-embeddings` is not recommended -- use `@huggingface/transformers` directly.

---

### D4: Snippet / Highlight Extraction

**Finding:** The `@orama/plugin-match-highlight` returns character-level positions of matched tokens but does NOT produce ready-to-use text snippets. Snippet construction (extracting text windows around matches) must be implemented by the consumer. Highlighting only works with full-text search, not hybrid or vector.

**Evidence:** [evidence/snippet-highlight-extraction.md](evidence/snippet-highlight-extraction.md)

The plugin records token positions at insert time via an `afterInsert` hook. For each document, it stores every token's position as `{ start: number, length: number }` per property.

At search time, `searchWithHighlight()` returns standard search results augmented with position data:

```typescript
hit.positions = {
  content: {               // property name
    search: [              // matched token
      { start: 45, length: 6 },  // position in original text
      { start: 234, length: 6 }
    ]
  }
}
```

To build a snippet like "...the best **search** engine for local...", you would:
1. Read the original document text
2. Find the first match position
3. Extract a window around it (e.g., 50 chars before and after)
4. Wrap the matched range in highlight markup

This is a ~20-line utility function to write. Not provided by Orama, but the raw positions make it straightforward.

The plugin adds memory overhead (all token positions for all documents stored in `orama.data.positions`) and only works with full-text search (`SearchParamsFullText`). Hybrid search results do not include highlight positions.

**Decision triggers:**
- If highlighting is needed, budget ~20 lines of snippet extraction code.
- If highlighting for hybrid search results is needed, you'd need to implement position matching independently (the plugin only hooks into full-text search).

---

### D5: Performance at Our Scale

**Finding:** At 1,000 documents, Orama delivers microsecond full-text search, sub-millisecond vector search, and 5-15ms hybrid search. Index creation with 1,000 documents takes <1 second. Total memory footprint is estimated at 5-10 MB. Performance is not a concern at this scale.

**Evidence:** [evidence/performance-at-scale.md](evidence/performance-at-scale.md)

| Operation | 100 docs | 1,000 docs | 10,000 docs |
|-----------|----------|------------|-------------|
| Full-text search | <0.1ms | ~0.02ms | ~0.2ms |
| Vector search (384-dim) | <0.1ms | <1ms | <5ms |
| Hybrid search | <1ms | 5-15ms | 10-30ms |
| Insert (single doc) | <0.1ms | <0.1ms | <0.1ms |
| Insert 1,000 docs (batch) | <50ms | <100ms | <500ms |
| Full serialization (JSON) | <10ms | 50-100ms | 500ms-1s |

v3's sync-by-default design eliminates async overhead for the common case. The benchmark harness in the repo shows v3 operations called synchronously (no `await`), while v2 operations required `await`.

Memory estimates at 1,000 documents with 384-dim vectors:
- Document store: ~1-2 MB (depends on article content size)
- Vector index: ~1.5 MB (1000 * 384 * 4 bytes for Float32Array + magnitude)
- Text index (Radix tree): ~2-5 MB (depends on vocabulary size)
- Total: **5-10 MB** (well within acceptable limits for a local app)

**Decision triggers:**
- At our scale, performance is not a differentiating factor. All operations are effectively instant.
- If we grow to 10K+ docs, re-evaluate vector search latency and persistence serialization time.
- Memory usage stays manageable up to ~50K documents.

---

### D6: Persistence and Serialization

**Finding:** Orama is in-memory with explicit save/load. The core provides `save()` (returns a plain JS object) and `load()` (hydrates an instance). The `@orama/plugin-data-persistence` adds 4 serialization formats: JSON, binary (msgpack), dpack, and seqproto (custom binary). No incremental persistence -- every save is a full snapshot. `persistToFile`/`restoreFromFile` are deprecated.

**Evidence:** [evidence/persistence-serialization.md](evidence/persistence-serialization.md)

The persistence workflow:

```typescript
import { create, insert, save, load } from '@orama/orama'
import { persist, restore } from '@orama/plugin-data-persistence'
import { writeFileSync, readFileSync } from 'node:fs'

// Save
const serialized = await persist(db, 'binary')  // returns string (hex-encoded msgpack)
writeFileSync('index.bin', serialized)

// Load
const data = readFileSync('index.bin', 'utf-8')
const db = await restore('binary', data)
```

Four formats available:

| Format | Library | Size | Speed | Use case |
|--------|---------|------|-------|----------|
| `json` | JSON.stringify | Largest | Moderate | Debugging, interoperability |
| `binary` | msgpack (hex) | Medium | Moderate | General purpose |
| `dpack` | dpack | Medium | Moderate | Alternative to msgpack |
| `seqproto` | seqproto | Smallest | Fastest | Production (schema-aware binary) |

The `seqproto` format is a custom binary protocol with dedicated serializers for Orama's internal data structures (Radix trees, Flat trees, vector indices). It avoids the overhead of generic serialization.

A known issue exists with large databases: GitHub issue #554 reports "Cannot create a string longer than 0x1fffffe8 characters" when serializing very large indices with the binary format. This is a JavaScript engine limitation on string length. At our 1K-doc scale, this is not a concern.

The `persistToFile` and `restoreFromFile` methods have been removed in v3 (they throw errors). The consumer must handle file I/O.

**Decision triggers:**
- Use `seqproto` format for production persistence (smallest, fastest).
- Use `json` for debugging and inspection.
- Full serialization at 1K docs should take 50-100ms -- acceptable for save-on-change or periodic saves.
- If incremental persistence becomes important (very frequent saves), you'd need to implement delta tracking yourself.

---

### D7: The Orama Ecosystem and Plugins

**Finding:** The Orama monorepo contains 19 packages covering search, persistence, embeddings, highlighting, analytics, documentation framework integrations, language support, and a unified Cloud/OSS interface. The plugin architecture allows replacing core components (index, document store, tokenizer, sorter).

**Evidence:** [evidence/ecosystem-plugins.md](evidence/ecosystem-plugins.md)

#### Packages directly relevant to our use case:

| Package | What it does | Our use? |
|---------|-------------|----------|
| `@orama/orama` | Core search engine | Yes (primary) |
| `@orama/plugin-data-persistence` | Serialize/deserialize to JSON/binary/seqproto | Yes (index persistence) |
| `@orama/plugin-match-highlight` | Token position tracking for highlighting | Likely (search result snippets) |
| `@orama/stemmers` | Stemmers for 30 languages | If multi-language needed |
| `@orama/stopwords` | Stop words for 30+ languages | If multi-language needed |
| `@orama/tokenizers` | Japanese/Mandarin tokenizers | If CJK support needed |

#### Packages NOT relevant to our use case:

| Package | Why not |
|---------|---------|
| `@orama/plugin-embeddings` | Uses TF.js USE (lower quality); we use @huggingface/transformers |
| `@orama/plugin-secure-proxy` | Routes through Orama Cloud; we're local-first |
| `@orama/plugin-analytics` | Sends telemetry to Orama Cloud |
| `@orama/plugin-docusaurus*` | Docusaurus-specific |
| `@orama/plugin-astro` | Astro-specific |
| `@orama/plugin-nextra` | Nextra-specific |
| `@orama/plugin-vitepress` | VitePress-specific |
| `@orama/switch` | Unified Cloud/OSS interface; we only use OSS |

#### The component/plugin architecture:

Orama's `create()` accepts a `components` parameter and a `plugins` array. Components can replace core building blocks:

- **tokenizer**: Custom tokenization (e.g., for domain-specific vocabulary)
- **index**: Custom index implementation (e.g., replace Radix tree with something else)
- **documentsStore**: Custom document storage
- **sorter**: Custom sorting
- **getDocumentIndexId**: Custom ID generation (e.g., use file path as ID)
- **validateSchema**: Custom schema validation

Plugins register lifecycle hooks (beforeInsert, afterInsert, beforeSearch, afterSearch, etc.). This is how the match-highlight and embeddings plugins work.

#### OramaCore and Orama Cloud:

[OramaCore](https://github.com/oramasearch/oramacore) is a separate Rust-based server runtime that powers Orama Cloud. It is not the same as the @orama/orama JS library. Orama Cloud is the commercial managed service; the JS library is the OSS foundation. The `@orama/switch` package provides a unified interface so apps can swap between local (OSS) and cloud backends.

---

### D8: Integration Patterns

**Finding:** Orama is a pure library with no framework coupling. It works identically in Node.js, browsers, Deno, and Bun. Incremental updates (add/update/remove single docs) are first-class operations. Fumadocs integration demonstrates the pattern of building search indexes from a content source. No existing Yjs/CRDT or MCP server integrations exist.

**Evidence:** [evidence/integration-patterns.md](evidence/integration-patterns.md)

#### The Fumadocs pattern (reference architecture):

Fumadocs demonstrates how to integrate Orama into a documentation framework:

1. Extract structured data from content source (title, description, URL, sections)
2. Build an Orama index at server startup or build time
3. Serve search via an API route (`createFromSource`)
4. Client-side uses a search hook (`useDocsSearch`)

For static sites, Fumadocs exports the serialized index as a JSON file that clients download and hydrate.

#### Integration pattern for our knowledge platform:

```
1. Startup: load persisted index from disk (restore())
2. File watcher: detect markdown changes (chokidar/fs.watch)
3. On change: parse markdown + frontmatter -> update Orama (remove old + insert new)
4. On search: call search() synchronously
5. Periodically: persist(db, 'seqproto') -> write to disk
```

Orama's hook system enables observability without modifying search logic:
- `afterInsert`: track indexing stats, update backlink maps
- `afterSearch`: log queries for analytics
- `beforeSearch`: inject query rewrites or expansions

#### Missing integration points:

- **Yjs/CRDT sync**: No existing integration. Would require: Yjs doc change -> parse affected article -> update Orama index.
- **MCP server**: No existing implementation. Would require: MCP tool definitions wrapping search(), insert(), etc.
- **React**: Orama is headless. The consumer builds the UI. Fumadocs provides a React search dialog component that could serve as a reference.

---

### D9: What Orama Does NOT Do (Gaps We'd Fill)

**Finding:** Orama is a search engine library, not a knowledge platform. The gaps between what Orama provides and what our platform needs are well-defined and moderate in scope. None are architectural blockers.

**Evidence:** [evidence/gaps-what-orama-does-not-do.md](evidence/gaps-what-orama-does-not-do.md)

| Gap | What Orama provides | What we build | Effort |
|-----|---------------------|---------------|--------|
| **Frontmatter parsing** | Expects structured data input | Parse with gray-matter/remark, pass structured data to Orama | Small |
| **Filesystem watching** | No file awareness | chokidar/fs.watch + incremental re-index | Small |
| **MCP server** | No MCP support | MCP server wrapping search/insert/metadata tools | Medium |
| **Snippet extraction** | Character positions via plugin | Build snippets from positions + source text | Small |
| **Reranking** | BM25 + vector scoring only | Optional: cross-encoder via @huggingface/transformers | Medium |
| **Backlink indexing** | Forward indexing only | Compute backlinks during parsing, store as metadata | Small |
| **Query decomposition** | Single-query search | Optional: agent-side query planning | Medium |
| **Incremental persistence** | Full snapshot only | Debounced full saves (fast enough at 1K) | None needed |
| **Schema evolution** | Fixed at creation | Full rebuild on schema change (fast at 1K) | None needed |
| **ANN vector index** | Brute-force cosine | Not needed at 1K docs | None needed |

The key insight: every gap falls into one of three categories:
1. **Pre-processing** (parsing, watching) -- handled before data reaches Orama
2. **Post-processing** (snippets, reranking) -- handled after Orama returns results
3. **Wrapping** (MCP server) -- thin API layer around Orama

None require replacing or forking Orama itself.

---

### D10: Production Usage and Maturity

**Finding:** Orama is mature and widely adopted. 2.1M monthly npm downloads, Apache 2.0 license, backed by OramaSearch Inc. (venture-funded). Known production users include Fumadocs (default search), Deno docs, and numerous Docusaurus/VitePress documentation sites. Primary risk factor is low bus factor (small maintainer team).

**Evidence:** [evidence/production-usage-maturity.md](evidence/production-usage-maturity.md)

| Signal | Status |
|--------|--------|
| npm downloads | 2.1M/month (strong) |
| License | Apache 2.0 |
| Current version | 3.1.18 (actively patched) |
| Corporate backing | OramaSearch Inc. (venture-funded) |
| Known users | Fumadocs, Deno docs, Docusaurus sites |
| Documentation | docs.orama.com + JSDoc in source |
| Community | Slack channel |
| Bus factor | Low (small team, primary maintainer is founder) |
| OSS commitment | Strong signal: OSS library is the acquisition funnel for Cloud |

Known issues from GitHub:
- Issue #869: v3 migration caused search failures for some users
- Issue #876: data-persistence plugin has browser compatibility issues with transform streams
- Issue #554: serialization fails for very large databases (JS string length limit)

None of these affect our use case (Node.js runtime, ~1K documents, v3 from the start).

**Risk assessment for our use case:** Low. The primary risk is that OramaSearch Inc. shifts focus entirely to OramaCore (Rust) and Orama Cloud, reducing investment in the JS library. However, the JS library has 2.1M monthly downloads and serves as the company's primary OSS funnel -- abandoning it would be self-destructive. The Apache 2.0 license also means we could fork if needed.

---

### D11: Orama v3 vs v2

**Finding:** v3 is a significant improvement over v2. The biggest change is sync-by-default operations (v2 was all-async). v3 also added AnswerSession (RAG), pinning rules, upsert operations, and alternative search algorithm plugins. No official migration guide exists. v3 is stable at 3.1.18.

**Evidence:** [evidence/v3-vs-v2.md](evidence/v3-vs-v2.md)

#### Key v3 changes:

| Change | Impact |
|--------|--------|
| **Sync-by-default** | Major performance improvement. Operations return `T \| Promise<T>` instead of always `Promise<T>`. |
| **AnswerSession** | Built-in RAG/chat capability (requires OpenAI API via secure proxy) |
| **Pinning rules** | Merchandising: promote/anchor specific results for given queries |
| **Upsert** | Convenience addition: insert-or-update in one call |
| **PT15 / QPS plugins** | Alternative search algorithms optimized for different content types |

The sync-by-default design is the most architecturally significant change. In practice:

```typescript
// v2 (always async)
const results = await search(db, { term: 'query' })

// v3 (sync by default, async only if hooks are present)
const results = search(db, { term: 'query' })  // returns Results directly
// OR: const results = await search(db, { term: 'query' })  // still works
```

TypeScript properly types the return as `Results<T> | Promise<Results<T>>`. If you always `await`, both v2 and v3 code looks the same. The performance benefit comes from the synchronous execution path avoiding microtask scheduling.

Since we're starting fresh on v3, no migration is needed. The v2-to-v3 migration issues reported in GitHub issues are not relevant to us.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D5 (Performance):** No published benchmark numbers found in the repository. Estimates are based on algorithmic analysis and prior research. Actual benchmarks on our target hardware (MacBook Air) would require running our own tests.
- **D10 (Production usage):** Could not determine exact GitHub star count from the shallow clone. Community health metrics (issue response time, PR merge rate) were not assessed in depth.
- **D11 (v3 vs v2):** No official migration guide or changelog documenting all breaking changes. The exact list of v2-to-v3 API changes is inferred from source code analysis, not from documentation.

### Out of Scope (per Rubric)

- Orama Cloud evaluation (managed service pricing, features, SLA)
- Comparison with alternative search engines (covered in `local-search-retrieval-stacks-2025-2026`)
- 1P codebase analysis (how our platform would implement the integration)

---

## References

### Evidence Files
- [evidence/core-search-capabilities.md](evidence/core-search-capabilities.md) — BM25 params, hybrid fusion algorithm, boolean logic, facets, geosearch, fuzzy matching, full API parameters
- [evidence/schema-document-model.md](evidence/schema-document-model.md) — 10 field types, nested objects, schema fixedness, CRUD operations, batch insert
- [evidence/vector-embedding-support.md](evidence/vector-embedding-support.md) — Brute-force cosine similarity, Float32Array storage, any-dimension support, external embedding compatibility
- [evidence/snippet-highlight-extraction.md](evidence/snippet-highlight-extraction.md) — Position tracking, searchWithHighlight API, limitations (full-text only)
- [evidence/performance-at-scale.md](evidence/performance-at-scale.md) — Latency estimates, memory estimates, sync-by-default impact
- [evidence/persistence-serialization.md](evidence/persistence-serialization.md) — 4 formats (JSON/binary/dpack/seqproto), save/load API, no incremental persistence
- [evidence/ecosystem-plugins.md](evidence/ecosystem-plugins.md) — 19 packages inventory, plugin architecture, Cloud vs OSS relationship
- [evidence/integration-patterns.md](evidence/integration-patterns.md) — Fumadocs pattern, hook system, missing integrations (CRDT, MCP)
- [evidence/gaps-what-orama-does-not-do.md](evidence/gaps-what-orama-does-not-do.md) — Detailed gap inventory with severity and mitigation
- [evidence/production-usage-maturity.md](evidence/production-usage-maturity.md) — 2.1M npm downloads, Apache 2.0, known issues, risk assessment
- [evidence/v3-vs-v2.md](evidence/v3-vs-v2.md) — Sync-by-default, AnswerSession, pinning, migration issues

### External Sources
- [Orama GitHub Repository](https://github.com/askorama/orama) — Primary source for all source code analysis
- [Orama npm Package](https://www.npmjs.com/package/@orama/orama) — Download statistics
- [Orama Documentation](https://docs.orama.com/) — Official documentation
- [Fumadocs Orama Integration](https://www.fumadocs.dev/docs/headless/search/orama) — Reference architecture for Orama integration
- [OramaCore Repository](https://github.com/oramasearch/oramacore) — Rust-based server runtime (separate from JS library)
- [OramaSearch Inc. Crunchbase](https://www.crunchbase.com/organization/oramasearch) — Company and funding information

### Related Research
- [local-search-retrieval-stacks-2025-2026](/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/) — Comparative analysis of search stacks including Orama at survey level
