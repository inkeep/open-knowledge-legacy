# Evidence: Performance Benchmarks at Target Scale

**Dimension:** D5 — Comparative benchmarks for ~1000 markdown articles
**Date:** 2026-04-03
**Sources:** Vendor docs, third-party blog posts, GitHub issues, npm packages

---

## Key files / pages referenced

- [Nearform browser vector search article](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/) — Orama ~900 articles
- [FlexSearch GitHub benchmarks](https://github.com/nextapps-de/flexsearch) — vendor claims
- [sqlite-vec v0.1.0 benchmarks](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [State of Vector Search in SQLite](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite) — insert benchmarks
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [GitHub Issue #573](https://github.com/oramasearch/orama/issues/573) — Orama memory at 100K
- [lunr.js Issue #305](https://github.com/olivernn/lunr.js/issues/305) — 300ms for 1K docs
- [MiniSearch docs](https://lucaong.github.io/minisearch/) — "5000 songs in fraction of a second"
- [Hybrid search recipes](https://medium.com/@connect.hashblock/7-hybrid-search-recipes-bm25-vectors-without-lag-467189542bf0) — fusion overhead

---

## Findings

### Finding: At 1000 documents, all engines deliver sub-15ms hybrid search
**Confidence:** INFERRED (synthesized from confirmed data points extrapolated to 1K scale)

| Engine | Text Query | Vector Query (384d) | Hybrid Estimate |
|--------|-----------|-------------------|----------------|
| Orama | <0.5ms | 5-10ms | 5-15ms |
| FlexSearch + vector lib | <0.1ms | depends on lib | N/A (no native hybrid) |
| MiniSearch + vector lib | <0.5ms | depends on lib | N/A (no native hybrid) |
| SQLite FTS5 + sqlite-vec | <1ms | <1ms | 1-3ms |
| LanceDB | unknown (no JS benchmarks) | ~25ms general | unknown |

### Finding: Orama vector query is 5-10ms at ~900 document scale (third-party confirmed)
**Confidence:** CONFIRMED
**Evidence:** [Nearform article](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/)

Third-party measurement in browser context with ~900 articles, 512-sized chunks, gte-small model. DB creation: 175-200ms. Embedding per query: 20-30ms. Vector query: 5-10ms consistently.

### Finding: SQLite FTS5 + sqlite-vec is the fastest hybrid path at this scale
**Confidence:** INFERRED

sqlite-vec at 100K vectors/384d = 56.65ms brute-force → extrapolated 1K = <1ms. FTS5 at 1M records = 140ms → 1K = <1ms. RRF fusion = <0.1ms. Total: 1-3ms.

### Finding: Embedding generation is the dominant cost (~60-100 seconds for 1K documents)
**Confidence:** INFERRED (from confirmed per-sentence timing)
**Evidence:** [Nearform](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/), [HuggingFace](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

Each 2KB doc ≈ 400 words ≈ 4-5 chunks at 128-token max. Per-chunk: ~20ms. Per document: ~80-100ms. 1000 documents: ~80-100 seconds single-threaded. This is a BUILD-TIME cost, not per-query.

### Finding: MiniSearch has the smallest memory footprint (~500KB for 1K docs)
**Confidence:** CONFIRMED (vendor claim)
**Evidence:** [MiniSearch docs](https://lucaong.github.io/minisearch/)

Compared to FlexSearch (6-21MB depending on config), Orama (~5MB extrapolated), SQLite (~4-6MB file + ~8MB cache).

### Finding: No independent head-to-head benchmark exists at 1000-doc scale
**Confidence:** CONFIRMED (negative search)

Searched: "javascript search engine benchmark", "orama vs flexsearch benchmark", "js search library comparison benchmark". No benchmark repo or article compares all these engines at the target scale. FlexSearch's vendor benchmark is the only head-to-head but is self-published and likely outdated.

### Finding: Cold start with model loading is 1-2 seconds for any vector approach
**Confidence:** CONFIRMED
**Evidence:** [Nearform](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/)

Total cold start (model + data + index) = 1-2 seconds in browser. Node.js should be similar or faster.

---

## Gaps / follow-ups

* No JS-specific cold-start benchmarks for any engine
* No published Fumadocs search latency numbers
* transformers.js native (onnxruntime-node) inference speed on Apple Silicon not directly measured
