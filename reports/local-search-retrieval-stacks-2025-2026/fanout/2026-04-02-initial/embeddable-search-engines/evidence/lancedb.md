# Evidence: LanceDB

**Dimension:** D6 — LanceDB
**Date:** 2026-04-03
**Sources:** GitHub lancedb/lancedb, npm @lancedb/lancedb, LanceDB docs, blog posts

---

## Key files / pages referenced

- [GitHub: lancedb/lancedb](https://github.com/lancedb/lancedb) — embeddable vector DB
- [npm: @lancedb/lancedb](https://www.npmjs.com/package/@lancedb/lancedb) — v0.27.1
- [LanceDB hybrid search docs](https://lancedb.com/docs/search/hybrid-search/)
- [LanceDB FTS docs](https://docs.lancedb.com/search/full-text-search)
- [LanceDB FTS blog](https://lancedb.com/blog/feature-full-text-search/)
- [Continue case study](https://lancedb.com/blog/the-future-of-ai-native-development-is-local-inside-continues-lancedb-powered-evolution/)
- [Tigris LanceDB 101](https://www.tigrisdata.com/blog/lancedb-101/)

---

## Findings

### Finding: LanceDB is fully embeddable in-process with no daemon or server
**Confidence:** CONFIRMED
**Evidence:** [GitHub README](https://github.com/lancedb/lancedb), [Tigris blog](https://www.tigrisdata.com/blog/lancedb-101/)

Storage uses Lance columnar format on local disk. In-process via Apache Arrow + DataFusion. Rust core compiled into native binaries shipped with SDK. Only indexes and metadata in RAM — raw data memory-mapped from disk.

**Implications:** True in-process embedding for Node.js. Very low memory footprint since data is disk-mapped. Ideal for memory-constrained laptops.

### Finding: LanceDB has native hybrid search combining BM25 FTS + vector search
**Confidence:** CONFIRMED
**Evidence:** [Hybrid search docs](https://lancedb.com/docs/search/hybrid-search/)

Built-in FTS via Tantivy (Rust). Create FTS index with `table.createIndex("text", { config: lancedb.Index.fts() })`. Hybrid search returns merged results. Supports RRFReranker (default), Cohere, CrossEncoder, and custom rerankers.

**Implications:** First-class hybrid search — not a workaround. Single API for combined BM25 + vector results.

### Finding: TypeScript SDK is first-class, v0.27.1, actively maintained
**Confidence:** CONFIRMED
**Evidence:** [npm @lancedb/lancedb](https://www.npmjs.com/package/@lancedb/lancedb) — published ~9 days before research date

`npm install @lancedb/lancedb` downloads platform-specific native Rust binary. Full TypeScript types. Async/await API. Used in production by Continue (IDE coding assistant).

**Implications:** Only embedded vector DB with a native TypeScript library and local disk storage. Strong fit for the target use case.

### Finding: At 1,000 docs, no vector index needed — flat search well under 100ms
**Confidence:** CONFIRMED
**Evidence:** [LanceDB FAQ](https://docs.lancedb.com/faq/faq-oss) — "For small datasets of ~100K records or applications that can accept ~100ms latency, a vector index is usually not necessary"

Memory: only indexes and metadata RAM-resident. 1,000 docs at 1,536-dim float32 = ~6MB raw vectors. Trivially small.

**Implications:** No indexing overhead needed. Brute-force vector search is sufficient and fast at this scale.

### Finding: LanceDB FTS is moving away from Tantivy toward native implementation
**Confidence:** CONFIRMED
**Evidence:** [LanceDB FTS blog](https://lancedb.com/blog/feature-full-text-search/) — "No more Tantivy!"

Tantivy-based FTS was historically Python-only sync API. LanceDB announced move to native Lance FTS. Current TypeScript SDK has FTS documented with examples. Status of Tantivy → native migration in TypeScript SDK is uncertain.

**Implications:** FTS implementation may change. API should remain stable. Worth verifying against changelog before shipping.

---

## Gaps / follow-ups

- LanceDB Tantivy → native FTS migration status in TypeScript SDK needs verification
- FTS index does not auto-update when data changes — re-indexing must be triggered manually
- LanceDB is VC-backed — long-term sustainability depends on company viability
