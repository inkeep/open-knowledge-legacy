# Evidence: DuckDB FTS + VSS

**Dimension:** D7 — DuckDB FTS + VSS
**Date:** 2026-04-03
**Sources:** DuckDB official docs, GitHub duckdb-fts, duckdb-vss, npm packages, blog posts

---

## Key files / pages referenced

- [DuckDB FTS docs](https://duckdb.org/docs/current/core_extensions/full_text_search) — BM25 scoring
- [DuckDB VSS blog May 2024](https://duckdb.org/2024/05/03/vector-similarity-search-vss) — HNSW introduction
- [DuckDB VSS update Oct 2024](https://duckdb.org/2024/10/23/whats-new-in-the-vss-extension) — persistence status
- [DuckDB VSS extension docs](https://duckdb.org/docs/current/core_extensions/vss) — API reference
- [DuckDB Node Neo client Dec 2024](https://duckdb.org/2024/12/18/duckdb-node-neo-client) — new TypeScript SDK
- [@duckdb/node-api npm](https://www.npmjs.com/package/@duckdb/node-api) — new official package
- [MotherDuck hybrid search tutorial](https://motherduck.com/blog/search-using-duckdb-part-3/) — SQL patterns
- [Hybrid search SQL post](https://www.markhneedham.com/blog/2024/07/28/hybrid-search-sql-duckdb/) — implementation example

---

## Findings

### Finding: DuckDB has an FTS extension with Okapi BM25 scoring
**Confidence:** CONFIRMED
**Evidence:** [DuckDB FTS docs](https://duckdb.org/docs/current/core_extensions/full_text_search)

Core extension, auto-loaded. Uses `PRAGMA create_fts_index()` and `match_bm25()` function. Porter stemmer with English stop words. Index does NOT auto-update on table changes — must recreate after modifications.

**Implications:** Adequate BM25 for a static/infrequently-updated corpus. The no-auto-update limitation is acceptable for 1,000 articles that change infrequently.

### Finding: DuckDB VSS extension (HNSW) has EXPERIMENTAL persistence — not production-ready
**Confidence:** CONFIRMED
**Evidence:** [VSS docs](https://duckdb.org/docs/current/core_extensions/vss) — `SET hnsw_enable_experimental_persistence = true` required

Based on usearch library. HNSW index persistence requires experimental flag. WAL recovery not implemented — crash during uncommitted changes can corrupt index. Documentation states: "not recommended for production environments."

**Implications:** For a read-mostly corpus rebuilt infrequently, this risk is manageable. For the target use case (1,000 docs, rebuild from scratch takes milliseconds), you can rebuild the index on each startup and skip persistence entirely.

### Finding: DuckDB is fully embeddable with zero-config — no server process
**Confidence:** CONFIRMED
**Evidence:** [DuckDB Node Neo blog](https://duckdb.org/2024/12/18/duckdb-node-neo-client)

Links directly into Node.js process via native bindings. Data in single `.duckdb` file. New official package: `@duckdb/node-api` (TypeScript-native, Promise support). Old `duckdb` package being deprecated.

**Implications:** True in-process embedding. Zero operational overhead. Strong TypeScript story with the new SDK.

### Finding: Hybrid search requires manual SQL composition — no built-in function
**Confidence:** CONFIRMED
**Evidence:** [MotherDuck tutorial](https://motherduck.com/blog/search-using-duckdb-part-3/), [Hybrid search blog](https://www.markhneedham.com/blog/2024/07/28/hybrid-search-sql-duckdb/)

Pattern: run `match_bm25()` for keyword candidates, `array_cosine_similarity()` for vector candidates, fuse via weighted combination or RRF in SQL CTEs. Well-documented community pattern.

Performance at 630K docs: BM25 ~0.1s, semantic ~0.6s, hybrid ~0.7s (without HNSW). At 1,000 docs with brute-force: well under 10ms total.

**Implications:** More work than Orama or LanceDB (write the fusion SQL yourself), but fully functional. The SQL is straightforward and well-documented.

---

## Gaps / follow-ups

- DuckDB VSS HNSW persistence timeline to stable is unclear
- Old `duckdb` npm package deprecation timeline — verify `@duckdb/node-api` has feature parity
- DuckDB is primarily an analytics engine — search is a secondary use case
