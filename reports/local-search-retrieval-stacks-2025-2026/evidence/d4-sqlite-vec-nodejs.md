# Evidence: sqlite-vec + better-sqlite3 from Node.js

**Dimension:** D3 — SQLite hybrid search, FTS5 + sqlite-vec, performance from Node.js
**Date:** 2026-04-03
**Sources:** sqlite-vec docs and GitHub, better-sqlite3 npm, Alex Garcia's blog

---

## Key files / pages referenced

- [sqlite-vec JS documentation](https://alexgarcia.xyz/sqlite-vec/js.html) — official Node.js docs
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — source and issues
- [Hybrid search blog post](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — RRF patterns
- [sqlite-vec v0.1.0 release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) — benchmarks
- [Official Node.js example](https://github.com/asg017/sqlite-vec/blob/main/examples/simple-node/demo.mjs)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — 5M weekly downloads
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [Simon Willison's coverage](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)
- [State of Vector Search in SQLite](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite) — benchmarks

---

## Findings

### Finding: sqlite-vec officially supports better-sqlite3 as a first-class binding
**Confidence:** CONFIRMED
**Evidence:** [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html)

```javascript
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";
const db = new Database(":memory:");
sqliteVec.load(db);
```

Prebuilt binaries for 8 platforms (macOS ARM64/x64, Linux x64/ARM64 glibc/musl, Windows x64/ARM64). Auto-downloads correct binary at install time.

### Finding: Alex Garcia published authoritative RRF hybrid search SQL patterns
**Confidence:** CONFIRMED
**Evidence:** [Hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)

Three methods documented: (1) RRF with configurable weights (recommended), (2) Keyword-first with semantic re-ranking, (3) Direct score combination. RRF formula: `score = 1/(k + rank)` where k=60. FTS5 BM25 returns negative values (more negative = better); sqlite-vec returns cosine distance (0 = identical).

### Finding: At 1000 documents, sub-millisecond query latency expected
**Confidence:** CONFIRMED (extrapolated from larger-scale benchmarks)
**Evidence:** [sqlite-vec benchmarks](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)

100K vectors × 384 dims = 56.65ms brute-force on M1 Pro. Linear extrapolation to 1K = <1ms. 100K vectors insert time = 1,179ms; extrapolated 1K = ~12ms.

**Implications:** At this scale, the entire dataset fits in SQLite's page cache. Vector search + FTS5 together likely <5ms total.

### Finding: better-sqlite3 synchronous API provides performance advantage for search
**Confidence:** CONFIRMED
**Evidence:** [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)

No async/await overhead, no event loop context switching. 5M weekly downloads, v12.8.0, actively maintained. WAL mode enables concurrent reads during writes.

### Finding: Memory footprint is tiny at 1K documents
**Confidence:** INFERRED (calculated)

- Vector data: 1K × 384 × 4 bytes = 1.5MB
- FTS5 index: ~1-2MB
- SQLite overhead: ~1-2MB
- Total DB file: ~4-6MB
- Runtime: SQLite default cache = ~8MB; sqlite-vec ~30MB default allocation

### Finding: sqlite-vec is pre-1.0 with brute-force only in stable releases
**Confidence:** CONFIRMED
**Evidence:** [GitHub releases](https://github.com/asg017/sqlite-vec/releases)

First stable: v0.1.0 (August 2024). Latest: v0.1.9 (March 2026). ANN indexes (IVF, DiskANN) in alpha only (v0.1.10-alpha). Brute-force irrelevant at 1K scale.

### Finding: Known limitations include KNN filtering order and no UPSERT for vec0
**Confidence:** CONFIRMED
**Evidence:** GitHub issues [#127](https://github.com/asg017/sqlite-vec/issues/127), [#99](https://github.com/asg017/sqlite-vec/issues/99)

WHERE clauses applied after KNN (not before). Must DELETE+INSERT instead of UPSERT. Windows has most reported loading issues. macOS ARM64 and Linux x64 are most stable.

---

## Gaps / follow-ups

* No published cold-start benchmarks for extension loading time
* TypeScript type story requires manual casting (better-sqlite3 returns unknown)
* sqlite-vec npm package may not ship its own TypeScript types
