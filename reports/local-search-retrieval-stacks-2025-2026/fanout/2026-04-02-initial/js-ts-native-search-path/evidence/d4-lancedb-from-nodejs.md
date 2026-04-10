# Evidence: LanceDB from Node.js

**Dimension:** D4 — @lancedb/lancedb npm package, hybrid search, embeddability, maturity
**Date:** 2026-04-03
**Sources:** npm registry, LanceDB GitHub, official docs, DeepWiki analysis

---

## Key files / pages referenced

- [npm @lancedb/lancedb](https://www.npmjs.com/package/@lancedb/lancedb) — package metadata
- [LanceDB GitHub](https://github.com/lancedb/lancedb) — monorepo
- [LanceDB Hybrid Search docs](https://docs.lancedb.com/search/hybrid-search)
- [LanceDB FTS docs](https://docs.lancedb.com/search/full-text-search)
- [JS API Reference](https://lancedb.github.io/lancedb/js/globals/)
- [DeepWiki analysis](https://deepwiki.com/lancedb/lancedb/1-overview) — architecture
- [Streamlining SDKs blog](https://lancedb.com/blog/streamlining-our-sdks/) — TS parity
- [Continue.dev case study](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/)
- [Issue #2138](https://github.com/lancedb/lancedb/issues/2138) — 91MB binary, class pattern
- [Migration Guide](https://lancedb.github.io/lancedb/migration/) — vectordb → @lancedb/lancedb

---

## Findings

### Finding: @lancedb/lancedb is a mature npm package with ~636K weekly downloads
**Confidence:** CONFIRMED
**Evidence:** [npm](https://www.npmjs.com/package/@lancedb/lancedb)

v0.27.2 (March 2026), Apache-2.0. Replaces deprecated `vectordb` package. 9,800+ GitHub stars. Requires Node.js >= 18, peer dep on apache-arrow 15-18.

### Finding: LanceDB runs fully in-process with a Rust core via NAPI-RS
**Confidence:** CONFIRMED
**Evidence:** [DeepWiki](https://deepwiki.com/lancedb/lancedb/1-overview)

No separate server. Rust core with NAPI-RS bindings. Data exchange via Apache Arrow IPC. Platform-specific `.node` binaries distributed as optional npm dependencies for 8 platforms.

### Finding: Native binary is ~91MB per platform
**Confidence:** CONFIRMED
**Evidence:** [Issue #2138](https://github.com/lancedb/lancedb/issues/2138)

Maintainer confirmed: "wraps a 91MB native Rust library." Makes serverless (Lambda) challenging — exceeds 50MB zip limit. Container deployment recommended.

**Implications:** Significant install footprint for a developer laptop tool. Not a concern for functionality but may feel heavy for a ~1K-doc use case.

### Finding: Hybrid search works from TypeScript with BM25 + vector + RRF reranking
**Confidence:** CONFIRMED
**Evidence:** [Hybrid Search docs](https://docs.lancedb.com/search/hybrid-search)

```typescript
const results = await table
  .query()
  .fullTextSearch("search terms")
  .nearestTo(queryVector)
  .rerank(reranker)
  .limit(10)
  .toArray();
```

RRFReranker is the default. LinearCombinationReranker (deprecated). Custom rerankers supported. FTS supports fuzzy, phrase, boolean queries, field boosting.

### Finding: Lance-native FTS uses BM25, available from TypeScript
**Confidence:** CONFIRMED
**Evidence:** [FTS docs](https://docs.lancedb.com/search/full-text-search)

Not Tantivy (that's Python-only legacy). Lance-native BM25 with fuzzy search, phrase matching, boolean queries, n-gram tokenization.

### Finding: No JS-specific performance benchmarks exist
**Confidence:** CONFIRMED
**Evidence:** Exhaustive search of docs, blog, GitHub

All published benchmarks are Python or Rust. No data on NAPI boundary overhead, JS cold start time, or JS vs Python performance comparison. General benchmarks: ~25ms vector search, <50ms with filtering at million-scale.

### Finding: TypeScript is near feature parity with Python
**Confidence:** CONFIRMED
**Evidence:** [Streamlining SDKs blog](https://lancedb.com/blog/streamlining-our-sdks/)

Both SDKs are thin wrappers around shared Rust core. Same-day releases. Gaps: multimodal embeddings (Python more mature), some reranker docs are Python-only examples, fewer community recipes/tutorials for TS.

### Finding: Continue.dev uses LanceDB from TypeScript in production
**Confidence:** CONFIRMED
**Evidence:** [Continue.dev blog](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/)

Note: vendor-incentive bias — this is a LanceDB blog post about their own customer.

---

## Gaps / follow-ups

* Cold start time from Node.js completely unknown (91MB binary load)
* JS-specific query latency overhead from NAPI boundary unknown
* Apache Arrow peer dependency adds complexity to dependency management
