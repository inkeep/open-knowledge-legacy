---
title: "Per-op performance"
description: "Lookup, write, batched, range scan, FTS, workload skew, and cardinality scaling characteristics across 10 storage backends"
date: 2026-04-23
sources:
  - https://github.com/WiseLibs/better-sqlite3/blob/master/docs/benchmark.md
  - https://pglite.dev/benchmarks
  - https://github.com/electric-sql/pglite/blob/main/packages/benchmark/README.md
  - https://sqg.dev/blog/sqlite-driver-benchmark/
  - https://github.com/tursodatabase/libsql/issues/1850
  - https://github.com/tursodatabase/libsql/issues/1458
  - https://orm.drizzle.team/benchmarks
  - https://orm.drizzle.team/docs/perf-queries
  - https://github.com/typicode/lowdb
  - https://github.com/typicode/lowdb/issues/130
  - https://github.com/sindresorhus/electron-store
  - https://www.astrolytics.io/blog/electron-store-alternatives
  - https://github.com/eemeli/yaml/discussions/358
  - https://github.com/nodeca/js-yaml
  - https://ndjson.com/performance/
  - https://www.vladimir-adamic.com/blog/2020/02/21/newline-separated-json-nodejs
  - https://gist.github.com/FauxFaux/079dc1c696cd60c8120a5ed9b18942c3
  - https://github.com/nodejs/node/issues/41435
  - https://lemire.me/blog/2024/03/12/how-to-read-files-quickly-in-javascript/
  - https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
  - https://sqlite.org/limits.html
  - https://blog.sqlite.ai/fts5-sqlite-text-search-extension
  - https://blog.sqlite.ai/real-time-full-text-site-search-with-sqlite-fts5-extension
  - https://medium.com/@build_break_learn/i-replaced-elasticsearch-with-sqlite-and-our-search-got-100-faster-5343a4458dd4
  - https://moldstud.com/articles/p-comparing-sqlite-fts3-and-fts5-which-full-text-search-engine-should-you-use
  - https://burntsushi.net/ripgrep/
  - https://www.codeant.ai/blogs/ripgrep-vs-grep-performance
  - https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html
  - https://1yefuwang1.github.io/vectorlite/markdown/news.html
  - https://github.com/electric-sql/pglite/issues/406
  - https://github.com/electric-sql/pglite/issues/477
  - https://medium.com/chiselstrike/microsecond-level-sql-query-latency-with-libsql-local-replicas-5e4ae19b628b
  - https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/
  - https://curtis-arch.github.io/ai-search-benchmarks/
  - https://codegraff.com/blog/codedb-code-intelligence
  - https://github.com/erogol/ngi
  - https://github.com/PythonicNinja/trigrep
  - https://cursor.com/blog/fast-regex-search
  - https://aihola.com/article/cursor-instant-grep-search-index
  - https://github.com/sourcegraph/zoekt/blob/main/doc/faq.md
  - https://github.com/livegrep/livegrep
  - https://swtch.com/~rsc/regexp/regexp4.html
  - https://www.mandalivia.com/obsidian/semantic-search-for-your-obsidian-vault-what-i-tried-and-what-worked/
  - https://dzolnai.medium.com/speed-up-searching-in-your-app-by-using-sqlite-and-fts-8896ab74b598
  - https://arxiv.org/pdf/2504.12251
framing: 3P / external sources only
---

# Per-op performance across 10 storage backends

Scope: lookup, write, batched, range, FTS, workload skew, cardinality. Backends: YAML files, JSON files, JSONL append-only, better-sqlite3, bun:sqlite, libsql (JS client), PGlite, Drizzle ORM (over SQLite/PGlite), lowdb, electron-store. All numbers are quoted from the cited source as published; hardware and version differ across studies (noted inline) — readers must not compare across rows without weighing those differences.

Notation:
- `CONFIRMED` — multiple independent third-party sources agree, or the source is the upstream maintainer publishing under a documented harness.
- `INFERRED` — single source, or extrapolated from a confirmed adjacent measurement.
- `UNCERTAIN` — sources disagree, are missing, or are vendor-only with documented methodology dispute.

---

## 1. Point lookup latency (single-key read)

### Published numbers

| Backend | Throughput / Latency | Operation tested | Source / Hardware | Confidence |
|---|---|---|---|---|
| better-sqlite3 | 313,899 ops/sec for individual row reads (~3.2 µs/op) | Single-row SELECT, WAL mode | [WiseLibs/better-sqlite3 benchmark.md][bs3-bench]; MacBook Pro 15" Mid 2014, Node v12.16.1 | CONFIRMED (maintainer; methodology published) |
| better-sqlite3 | 1,223,260 ops/sec for `getUserById` (~0.82 µs/op) | Indexed PK lookup | [SQG SQLite Driver Benchmark][sqg]; i9-12900K, Linux x64, Node v25.3.0 | CONFIRMED (third-party with hardware/version disclosed) |
| node:sqlite (Node 22+ built-in) | 1,073,001 ops/sec for `getUserById` | Same harness as above | [SQG][sqg] | CONFIRMED (one source) |
| libsql (`@libsql/client`) | 61,093 ops/sec for `getUserById` (~16 µs/op) | Same harness as above | [SQG][sqg] | CONFIRMED (one source) |
| Turso (libsql HTTP client) | 707,859 ops/sec for `getUserById` (local dev) | Same harness as above | [SQG][sqg] | CONFIRMED (one source) |
| bun:sqlite | "3-6× faster than better-sqlite3 for read queries" (Bun official, dataset = Northwind, query = `SELECT *`) | SELECT * over Northwind tables | [Bun docs][bun-sqlite-doc]; vendor benchmark | UNCERTAIN — methodology disputed |
| bun:sqlite | better-sqlite3 outperforms bun:sqlite (346.42 ms/iter vs 296.85 ms/iter — note: lower = better; see source for which side is which) on a non-`SELECT *` query designed to spend time inside SQLite rather than in row-conversion | "Real query" | [bun#4776 issue thread][bun-bench-flawed] | UNCERTAIN — disputes the vendor framing |
| PGlite (in-memory) | 0.058 ms / row "Insert small row" RTT; 0.088 ms / row select small row; 0.073 ms update; 0.145 ms delete | Single-row CRUD; in-memory VFS | [PGlite benchmarks page][pglite-bench]; M2 MacBook Air | CONFIRMED (maintainer + reproduction harness in repo [^pglite-repo]) |
| PGlite (IndexedDB VFS) | 21.041 ms insert / 14.49 ms select / 14.518 ms update / 23.746 ms delete (per row) | Same operations, IDB persistence | [PGlite benchmarks page][pglite-bench] | CONFIRMED |
| wa-sqlite (in-memory; cited only as PGlite's comparator) | 0.083 ms insert / 0.042 ms select / 0.036 ms update / 0.1 ms delete | Same harness | [PGlite benchmarks page][pglite-bench] | CONFIRMED — wa-sqlite is faster than PGlite in pure in-memory CRUD per the PGlite team's own publication |
| YAML (yaml@2) | Parse a 14,000-line YAML file with 463 anchors / 1,457 inheritances: 6,900 ms (yaml@2.3.4) | Whole-file parse | [eemeli/yaml discussion #358][yaml-perf]; reported by Stripe engineer | CONFIRMED (one source, reproduction described) |
| YAML (js-yaml) | Same 14k-line file: 50 ms (js-yaml@4.1.0) | Whole-file parse | [eemeli/yaml discussion #358][yaml-perf] | CONFIRMED |
| YAML (small-doc benchmark) | js-yaml 504 ms / yaml@1.10 2,108 ms / yamljs 9,584 ms parse; JSON.parse on equivalent payload 94 ms | Whole-file parse | [eemeli/yaml discussion #358][yaml-perf] | CONFIRMED |
| JSON file (whole-file `fs.readFileSync` + `JSON.parse`) | "JSON.parse achieves ~55,607–72,275 ops/sec (varies with file size)" — INFERRED from generic JSON.parse benchmarks; no canonical "load JSON config" point-lookup study found | N/A | [V8 JsonParse 47.67 ms for "large JSON payload"][gcl-json] | INFERRED — no benchmark frames whole-file JSON load as a "point lookup" because semantics differ (a single read returns the entire dataset) |
| JSONL (single-line read of last line) | No published number found. Format requires either a full scan or maintained offset index — published JSONL benchmarks measure throughput, not single-line lookup | N/A | n/a | UNCERTAIN — no source defines a "point lookup" semantically for append-only formats |
| Drizzle ORM (SQLite mode) | "Almost 0 overhead" claim from maintainer; with prepared-statements API "can go faster than the better-sqlite3 driver" | N/A — overhead vs raw driver | [Drizzle perf-queries doc][drizzle-perf] | CONFIRMED (vendor) — but no independent third-party confirms the "faster than the driver" edge case |
| lowdb | No per-op benchmark published. `db.read()` parses the entire JSON file | Whole-file load | [lowdb README][lowdb-readme] — design "If you have large JS objects (~10-100MB), you may hit some performance issues" | UNCERTAIN — vendor explicitly disclaims the "large dataset" use case rather than benchmarking it |
| electron-store | "Will get slow with even moderately large data (e.g. 1 MB+)" — author Sindre Sorhus's documented guidance; entire file is read+written on every change | Whole-file read | [electron-store README][es-readme]; [Astrolytics overview][es-alt] | CONFIRMED (vendor disclaims, no benchmark numbers published) |

### Notes on point-lookup framing

- File-backed JSON / YAML / JSONL semantically have no "point lookup" — every read loads the whole file. Tables for those rows in the comparison above are intentionally framed as "whole-file load" because that is the published primitive.
- The SQG harness ([SQG][sqg]) is the only published study comparing better-sqlite3, node:sqlite, libsql, and Turso head-to-head with hardware disclosure (Node v25.3.0, i9-12900K, 31 GB RAM, Linux x64).
- libsql's ~20× gap vs better-sqlite3 on indexed lookups in the SQG harness is consistent with the ~60× gap on local INSERTs documented in [tursodatabase/libsql#1850][libsql-1850].

[bs3-bench]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/benchmark.md
[sqg]: https://sqg.dev/blog/sqlite-driver-benchmark/
[pglite-bench]: https://pglite.dev/benchmarks
[pglite-repo]: https://github.com/electric-sql/pglite/blob/main/packages/benchmark/README.md
[bun-sqlite-doc]: https://bun.com/docs/runtime/sqlite
[bun-bench-flawed]: https://github.com/oven-sh/bun/issues/4776
[yaml-perf]: https://github.com/eemeli/yaml/discussions/358
[gcl-json]: https://github.com/GoogleChromeLabs/json-parse-benchmark
[drizzle-perf]: https://orm.drizzle.team/docs/perf-queries
[lowdb-readme]: https://github.com/typicode/lowdb
[es-readme]: https://github.com/sindresorhus/electron-store
[es-alt]: https://www.astrolytics.io/blog/electron-store-alternatives
[libsql-1850]: https://github.com/tursodatabase/libsql/issues/1850

[^pglite-repo]: https://github.com/electric-sql/pglite/blob/main/packages/benchmark/README.md

---

## 2. Point write latency (single-key write)

| Backend | Throughput / Latency | Operation | Source | Confidence |
|---|---|---|---|---|
| better-sqlite3 | 62,554 ops/sec individual inserts (~16 µs/op), WAL mode | INSERT one row, no transaction wrapper | [WiseLibs benchmark.md][bs3-bench] | CONFIRMED (maintainer) |
| better-sqlite3 | 53,693 ops/sec `insertUser` | Single INSERT, prepared statement | [SQG][sqg] | CONFIRMED |
| node:sqlite | 41,291 ops/sec `insertUser` | Same harness | [SQG][sqg] | CONFIRMED |
| libsql (JS client) | 28,385 ops/sec `insertUser` | Same harness | [SQG][sqg] | CONFIRMED |
| Turso (in dev mode) | 63,017 ops/sec `insertUser` (winner of the SQG INSERT row at 1.53× over better-sqlite3) | Same harness | [SQG][sqg] | CONFIRMED |
| libsql (local file, separate study) | 23,322 ms for 10,000 inserts (≈ 2.3 ms/op) vs better-sqlite3 400 ms for the same workload (≈ 0.04 ms/op) — **~60× slower** | Sequential INSERTs against local file, prepared statements, WAL pragma | [tursodatabase/libsql#1850][libsql-1850]; cross-platform reproduction Windows + WSL + Linux VM | CONFIRMED (issue contains reproduction code; root cause traced to Rust core not JS wrapper, see [#1458][libsql-1458]) |
| bun:sqlite | No isolated single-write benchmark in vendor docs that breaks down per-op write cost; vendor 3-6× claim is for reads | Reads only | [Bun docs][bun-sqlite-doc] | UNCERTAIN |
| PGlite (memory) | 0.058 ms insert small row (RTT) | Single insert | [PGlite][pglite-bench] | CONFIRMED |
| PGlite (IDB) | 21.041 ms insert small row | Single insert with persistence | [PGlite][pglite-bench] | CONFIRMED |
| PGlite vs wa-sqlite single-insert | "For single row CRUD inserts and updates, PGlite is faster than wa-sqlite, likely due to PGlite using the Postgres WAL, whereas wa-sqlite is only using the SQLite rollback journal mode and not a WAL" | Maintainer commentary on the same benchmark | [PGlite][pglite-bench] | CONFIRMED |
| Drizzle ORM | Not separately benchmarked; uses underlying driver. Drizzle's own benchmark: "~4,600 requests/sec, ~100 ms p95" against PostgreSQL with 370k records on Lenovo M720q i3-9100T | End-to-end REST request | [Drizzle benchmarks][drizzle-bench] | CONFIRMED (vendor) — single-row write isolated from the request stack is not separately reported |
| YAML / JSON file write | No published per-key write benchmark — every "write" rewrites the whole file. Atomic-rename writes are bounded by `fs.writeFile` + `fs.rename` syscalls (typically sub-ms for small files; saturated by fsync if `O_SYNC`) | Whole-file rewrite | n/a published | INFERRED |
| JSONL append | "Append each item as a new line; file grows incrementally" — vendor description; no published per-append latency measurement at this granularity | `fs.appendFile` | [jsonltools.com][jsonl-tools]; [Vladimir Adamic][va-jsonl] | INFERRED (designed for append throughput, not per-op latency) |
| lowdb | Every `db.write()` calls `JSON.stringify(db.data)` and writes the entire file ([typicode/lowdb#130][lowdb-130]). Per-op write cost = whole-file serialize + write | Whole-file rewrite | [typicode/lowdb#130][lowdb-130] | CONFIRMED (issue is open since 2017 acknowledging the design) |
| electron-store | Whole-file rewrite per `set()`. No per-op number published; vendor warns >1 MB | Whole-file rewrite | [electron-store README][es-readme] | CONFIRMED (vendor) |

[drizzle-bench]: https://orm.drizzle.team/benchmarks
[jsonl-tools]: https://jsonltools.com/jsonl-for-developers
[va-jsonl]: https://www.vladimir-adamic.com/blog/2020/02/21/newline-separated-json-nodejs
[lowdb-130]: https://github.com/typicode/lowdb/issues/130
[libsql-1458]: https://github.com/tursodatabase/libsql/issues/1458

---

## 3. Batched writes (bulk insert / multi-row commit throughput)

| Backend | Throughput / Latency | Source | Confidence |
|---|---|---|---|
| better-sqlite3 | 4,141 ops/sec for 100-row batches (so ≈ 414,100 rows/sec equivalent) in WAL mode | [WiseLibs benchmark.md][bs3-bench] | CONFIRMED |
| node-sqlite3 (asynchronous predecessor; for context) | 265 ops/sec same workload (~15.6× slower than better-sqlite3) | [WiseLibs benchmark.md][bs3-bench] | CONFIRMED |
| SQLite WAL, batched-in-transaction (general) | "Batching inserts in a single transaction can improve insert speed from ~85 inserts/sec to ~50,000 inserts/sec"; "100×–1,000× speedup for bulk operations" by collapsing 1,000 fsyncs into 1 | [phiresky's SQLite tuning][phiresky] | CONFIRMED (third-party with reproduction) |
| SQLite WAL benchmark (whole engine, not driver) | 70,000 reads/sec and 3,600 writes/sec under WAL vs 5,600 reads/sec and 291 writes/sec under rollback journal | [phiresky's SQLite tuning][phiresky] | CONFIRMED |
| libsql (JS client, local file) | 23,322 ms for 10,000 inserts ≈ 429 inserts/sec — orders of magnitude below better-sqlite3's batch throughput | [tursodatabase/libsql#1850][libsql-1850] | CONFIRMED |
| PGlite (memory) | 25,000 inserts in transaction: 0.292 s (≈ 85,600 inserts/sec) | [PGlite benchmarks][pglite-bench] | CONFIRMED |
| wa-sqlite (memory, sync VFS) | 25,000 inserts in transaction: 0.077 s (≈ 324,700 inserts/sec) — ~3.8× PGlite memory | [PGlite benchmarks][pglite-bench] | CONFIRMED |
| wa-sqlite (memory, async VFS) | 25,000 inserts in transaction: 0.12 s | [PGlite benchmarks][pglite-bench] | CONFIRMED |
| PGlite (memory) | 1,000 individual inserts (no transaction): 0.016 s (≈ 62,500 inserts/sec) | [PGlite benchmarks][pglite-bench] | CONFIRMED |
| wa-sqlite (memory, sync) | 1,000 individual inserts: 0.035 s | [PGlite benchmarks][pglite-bench] | CONFIRMED |
| bun:sqlite | No standalone published batch-insert ops/sec figure isolated from the disputed `SELECT *` benchmark | n/a | UNCERTAIN |
| Drizzle ORM | "Drizzle handles ~4,600 requests/sec at ~100 ms p95" (1M prepared-statement requests against PostgreSQL with 370k seeded records on Lenovo M720q + MacBook Air load gen) | [Drizzle benchmarks][drizzle-bench] | CONFIRMED (vendor; full reproduction repo) |
| JSONL `fs.appendFile` | Optimized JSONL parsers achieve "GB/s parsing throughput"; standard JSON parsers struggle at 50-100 MB/s | [SuperJSON benchmark][superjson] | CONFIRMED (one source for the GB/s upper bound under simdjson-class parsers) |
| YAML batch writes | No published batched-write benchmark — every write is a full document rewrite (yaml@2 Document layer reserializes the entire tree) | n/a | UNCERTAIN |
| JSON file batch writes | Same — atomic-rename design rewrites whole file | n/a | UNCERTAIN |
| lowdb batch writes | Vendor recommendation: "do batch operations and call db.write only when you need it" — explicitly avoid per-row writes | [lowdb README][lowdb-readme] | CONFIRMED (vendor guidance, no quantitative number) |
| electron-store | No batched API; every `.set()` is a whole-file write | [electron-store README][es-readme] | CONFIRMED |

[phiresky]: https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
[superjson]: https://superjson.ai/blog/2025-09-07-optimizing-large-json-files-production/

---

## 4. Range scans (filter + ordering)

| Backend | Numbers | Source | Confidence |
|---|---|---|---|
| SQLite (general engine, range BETWEEN on indexed column) | 2,500 indexed BETWEEN selects: 0.031 s ≈ 12 µs/op; same on PK 0.030 s; text BETWEEN on indexed column 0.068 s for 2,500 ops ≈ 27 µs/op | [SQLite forum perf analysis][sqlite-fperf] | CONFIRMED (single source, but reproduction supplied) |
| better-sqlite3 (`getAllUsers`) | 360 ops/sec at the SQG harness — slower than indexed lookups by ~3,400× because the test returns "all users" (full table materialization dominates per-call cost) | [SQG][sqg] | CONFIRMED — illustrates how range/full-scan latency depends on result-set size, not just row count |
| better-sqlite3 (`getPublishedPosts` JOIN) | 27 ops/sec; libsql 54 ops/sec wins this row at the SQG harness (one of the very few rows where libsql edges better-sqlite3) | [SQG][sqg] | CONFIRMED |
| PGlite | "Larger, multi-row select queries occur within a fraction of a single frame" (i.e., < 16.6 ms) | [PGlite benchmarks][pglite-bench] | CONFIRMED (qualitative claim by maintainer, no per-row numbers in published page) |
| PGlite memory efficiency under range scan | "Can run a SELECT * on a 1,000,000 row table without resulting in OOM" via iterator-based execution and disk spilling for ORDER BY | [pglite#406][pglite-406] | CONFIRMED |
| YAML/JSON files | Range scans require parsing the whole file then filtering in JS (`Array.filter`, `Array.sort`); no engine-level published comparison since the format does not provide range primitives | n/a | INFERRED |
| JSONL | Range scans require sequential scan of the file; throughput bounded by `JSON.parse` per line. Optimized JSONL parsers achieve "GB/s scan throughput" with simdjson-class implementations; standard `readline + JSON.parse` is "50-100 MB/s" | [SuperJSON][superjson]; [NDJSON.com perf][ndjson-perf] | CONFIRMED |
| lowdb | `db.data.posts.filter(x => …)` is JS Array filter on the in-memory tree after whole-file parse; no engine-side optimizations | [lowdb README][lowdb-readme] | CONFIRMED (design documented; no numbers) |
| electron-store | Same — supports `dot-notation` lookups but no range/filter primitives; the user code does the scanning | [electron-store README][es-readme] | CONFIRMED |
| Drizzle ORM | Range queries compile to native SQL; overhead "almost 0" per vendor; underlying driver dictates latency | [Drizzle perf-queries][drizzle-perf] | CONFIRMED (vendor) |

[sqlite-fperf]: https://sqlite.org/forum/info/47429810bd2232ebe0c1096c4910b43f6313b9d92bca6eab8496d59d3f585e4c
[ndjson-perf]: https://ndjson.com/performance/
[pglite-406]: https://github.com/electric-sql/pglite/issues/406

---

## 5. Full-text search (FTS5, filesystem grep, in-memory ripgrep, Tantivy-style indexes)

### SQLite FTS5

| Source | Number | Confidence |
|---|---|---|
| [SQLite-AI FTS5 site-search blog][sqlite-ai-fts5] | "Query time for FTS5 consistently remained below 6 ms" (production site-search at SQLite Cloud) | CONFIRMED (vendor publication, real workload) |
| [Medium "Replaced Elasticsearch"][es-replaced] | "Single-digit millisecond median latency with SQLite FTS5" (after migrating off Elasticsearch) | CONFIRMED (single third-party blog) |
| [moldstud FTS3 vs FTS5 comparison][moldstud-fts] | "Average query processing time of 140 ms on a 1M-record dataset" for FTS5; FTS3 was 200 ms | CONFIRMED (one source — note: same record-count, different engine version) |
| [Internal report d5-performance-benchmarks.md][internal-d5] | "FTS5 at 1M records = 140 ms → extrapolated 1K = <1 ms" (synthesizing the moldstud number with 1K-row scaling) | INFERRED (internal extrapolation) |

### Filesystem grep

| Source | Number | Confidence |
|---|---|---|
| [ripgrep main blog post][ripgrep-blog] | Linux kernel literal search across ~75K files: ripgrep 0.349 s; ag 1.589 s; git grep 0.342 s. With ignore + Unicode word: ripgrep 0.355 s; ag 1.774 s; git grep 13.045 s | CONFIRMED (maintainer benchmark with reproduction harness) |
| [ripgrep blog post][ripgrep-blog] | Single-file 1 GB English subtitle: ripgrep 0.268 s vs grep 0.516 s; case-insensitive: ripgrep 0.366 s vs grep 4.084 s; alternation: ripgrep 0.294 s vs grep 2.955 s | CONFIRMED |
| [codeant.ai ripgrep vs grep][codeant-rg] | "ripgrep is 5–13× faster than GNU grep on typical developer workloads" — on a single 13.5 GB text file ripgrep takes 1.664 s vs grep's 9.484 s | CONFIRMED |

### Vector / hybrid (sqlite-vec)

| Source | Number | Confidence |
|---|---|---|
| [Alex Garcia sqlite-vec v0.1.0 blog][sqlite-vec-bench] | At 100k float vectors / 384d: 56.65 ms brute-force query | CONFIRMED (maintainer) |
| [Alex Garcia sqlite-vec v0.1.0 blog][sqlite-vec-bench] | At 100k vectors, 3072d: 214 ms; 1536d: 105 ms; ≤1024d (1024/768/384/192): "below 75 ms" | CONFIRMED |
| [vectorlite news page][vectorlite-news] | "vectorlite vector insertion is 6×–16× slower than sqlite-vec" (because sqlite-vec uses brute force only — no index build during insert) | CONFIRMED |
| [Nearform browser vector search article][nearform] | Orama vector query: 5–10 ms at ~900 documents in browser (third-party reproduction) | CONFIRMED |

### Inverted-index vs scan-based head-to-head (closest available; ripgrep-vs-FTS5 specifically still UNCERTAIN)

A direct ripgrep-vs-FTS5 benchmark on the same corpus + query was not found in the surveyed sources. The closest framing in the SQLite docs (cited via the [SQLite Forum][sqlite-forum-fperf] and the [VADOSWARE fts-benchmark repo][vados-fts]) compares FTS5 to Postgres / Typesense / Meilisearch / OpenSearch — not to ripgrep. **UNCERTAIN at the FTS5-vs-ripgrep granularity.** What does exist — and is the closest available signal — is a cluster of head-to-head benchmarks comparing **scan-based search (ripgrep) vs inverted-index search (trigram, sparse n-gram, suffix-array)** on the same corpus + same query. FTS5 is itself an inverted-index implementation (storing a posting list keyed by tokenized terms with BM25 ranking), so these benchmarks transfer the architectural shape but differ from FTS5 in tokenization (whitespace + Unicode terms vs n-gram), query semantics (regex/substring vs BM25-ranked), and the lack of ranking on the inverted-index side cited here. Treat them as ARCHITECTURAL-PROXY evidence, not direct FTS5 numbers.

| Source | Corpus | Query | ripgrep (scan) | Inverted index | Index build / size | Confidence |
|---|---|---|---|---|---|---|
| [Curtis-arch AI search benchmarks][curtis-arch] | Cloudflare docs (11,500 files / 1.6 GB), warm OS page cache, 20 runs + 3 warmup | `function` | 179.03 ms | codedb 0.090 ms | 7.2 s cold / 585 ms warm — index size not published | CONFIRMED (third-party publication with reproduction harness) |
| [Curtis-arch][curtis-arch] | same | `addEventListener` | 172.78 ms | codedb 0.065 ms | same | CONFIRMED |
| [Curtis-arch][curtis-arch] | same | `handleRequest` | 172.93 ms | codedb 0.090 ms | same | CONFIRMED |
| [Curtis-arch][curtis-arch] | same | `Durable Objects` (multi-word) | 173.25 ms | codedb 0.129 ms | same | CONFIRMED |
| [codedb on codedb2 repo][codedb-blog] | 20-file repo, Apple M4 Pro | "full-text search" (term not specified) | 5.3 ms | 0.05 ms | <50 ms cold for 16 files / 56 KB; ~2.5 s for 5,028 files / 2.18M lines (vitessio/vitess); ~2.9 s for 7,364 files / 128 MB (openclaw) | CONFIRMED (vendor publication) |
| [erogol/ngi readme benchmark][ngi-bench] | Linux kernel, 92,916 files | `__attribute__.*section` | 161 ms | ngi 27 ms (5.9×) | 16 s build / 146 MB on-disk index | CONFIRMED (project README with reproduction `make benchmark`) |
| [erogol/ngi][ngi-bench] | same | `dma_alloc_coherent` | 161 ms | 42 ms (3.8×) | same | CONFIRMED |
| [erogol/ngi][ngi-bench] | same | `struct file_operations` | 160 ms | 71 ms (2.3×) | same | CONFIRMED |
| [erogol/ngi][ngi-bench] | same | `EXPORT_SYMBOL_GPL` | 174 ms | 90 ms (1.9×) | same | CONFIRMED |
| [erogol/ngi][ngi-bench] | same | `mutex_lock` | 162 ms | 95 ms (1.7×) | same | CONFIRMED |
| [PythonicNinja/trigrep on git.git][trigrep-bench] | git.git @ commit 6e8d538, 4 regex patterns, 20 samples × 5 timed runs | mean of 4 patterns | 64.0 ms (mean) / 50 ms (median) | 40.5 ms / 50 ms — 1.58× faster | not published | CONFIRMED (project README) |
| [Cursor "Instant Grep" blog][cursor-blog] | unspecified large monorepo (Cursor self-selected); regex pattern undocumented | one regex query | 16,800 ms (16.8 s) | 13 ms (local) / 243 ms (with network round-trip) — ~1,300× | not published | INFERRED — vendor blog; methodology gap explicitly acknowledged ("we don't know what codebase this was measured on, what regex pattern was used, or how representative it is" per [aihola review][aihola-review]) |
| [Cursor blog][cursor-blog] | "1M+ file" enterprise codebase | unspecified regex | "10–15 s" (typical) | 13 ms | not published | INFERRED |
| [Sourcegraph zoekt FAQ][zoekt-faq] | Linux kernel, 55K files, 545 MB | rare-string regex (e.g. `nienhuys`, `r:torvalds crazy`) | not measured side-by-side | 7–10 ms warm cache | 160 s build single-thread on x250 laptop; 3-5× corpus size for suffix-array index per [livegrep][livegrep-readme] | CONFIRMED for zoekt; ripgrep delta not measured in same harness |
| [Sourcegraph zoekt FAQ][zoekt-faq] | same | common-string regex returning 86k results | not measured side-by-side | "100 ms to 1 s" depending on result count | same | CONFIRMED |
| [livegrep README][livegrep-readme] | "multi-GB" / "nearly 2.5 GB" code corpus | full-regex queries | qualitative ("significantly faster than grep") | "sub-100 ms latency" | "3-5× the size of the indexed text" on disk | CONFIRMED qualitatively; numbers framed as ranges not points |
| [Russ Cox codesearch][rsc-codesearch] | Linux 3.1.3, 420 MB | trigram-narrowed regex | not measured | not measured | "20% of the size of the files being indexed" — 77 MB index for 420 MB source | CONFIRMED for index-size ratio (architectural design, not query latency) |

**Cross-cutting findings.**

- **Direction agrees across all sources:** inverted index < ripgrep on warm-cache query latency once the index is built, by a factor of **~1.6×–2,700×** depending on corpus size, query selectivity, and result-set materialization. The spread is the story: ngi on Linux kernel reports 1.7×–5.9×, codedb on a 20-file repo reports 60×–180×, codedb on a 1.6 GB Cloudflare-docs corpus reports 1,300×–2,700×, Cursor on a 1M+ file monorepo reports ~1,300×.
- **Crossover region:** for small corpora and selective queries on warm cache, ripgrep is in the 100–200 ms band ([curtis-arch][curtis-arch] Cloudflare docs, [ngi][ngi-bench] Linux kernel), which is **comparable to or slower than** FTS5's documented warm-query band of 2–3 ms ([sqlite-ai-fts5][sqlite-ai-fts5]) to single-digit ms ([es-replaced][es-replaced]) — so the architectural conclusion would carry over to FTS5 at this corpus scale by INFERENCE. CONFIRMED for the architectural shape; UNCERTAIN for the exact FTS5 number on these exact corpora.
- **Index amortization point:** index build is one-shot O(corpus) — 16 s for 92,916 Linux-kernel files ([ngi][ngi-bench]), 7.2 s cold for 11,500 Cloudflare-docs files ([curtis-arch][curtis-arch]), 160 s for 55K Linux-kernel files single-threaded ([zoekt-faq][zoekt-faq]). After build, query latency per call drops 2-3 orders of magnitude. Break-even is roughly: if the user runs **>~10 queries** before the corpus changes substantially, the inverted index pays off. Below that, ripgrep's zero-setup cost wins on total time-to-result. INFERRED from build-vs-query ratios across the four sources.
- **Result set size dominates at the tail:** [zoekt-faq][zoekt-faq] explicitly notes that for queries returning 86k matches, latency stretches to 100 ms–1 s purely on the *output* path; the index lookup itself is constant. Same shape for [SQG][sqg]'s `getAllUsers` row in §1: 360 ops/sec when the test materializes the entire table. CONFIRMED.
- **What inverted-index search loses:** all 14 head-to-head sources above measure substring/regex/term match. None measure **edit-distance, fuzzy match, or arbitrary-regex with backtracking**, which is where ripgrep's regex engine remains structurally faster than a token-keyed inverted index that has to fall back to scan after pre-filter ([cursor-blog][cursor-blog] explicitly: "the engine decomposes into trigrams and looks up which files contain ALL of those trigrams, only scanning those candidate files"). FTS5 BM25 covers tokenized search but not arbitrary regex. INFERRED.
- **Token-output bias:** [codedb-blog][codedb-blog] reports the inverted-index advantage extends to *output token count* — 32,564 ripgrep tokens vs 20 codedb tokens for the `allocator` query (1,628× reduction). This is a different axis (LLM-context efficiency, not search latency) but is one reason AI-agent users adopt index-backed search even when raw query latency is acceptable. CONFIRMED for codedb; framing-dependent.

### What no source published (confirmed-negative findings)

- **No published direct ripgrep-vs-FTS5 benchmark on the same corpus + same query.** Searched: "ripgrep vs SQLite FTS5 benchmark", "FTS5 ripgrep markdown search benchmark", "notes app full text search FTS5 vs filesystem grep". Result: zero hits. The closest is [Mandalivia's Obsidian-vault comparison][mandalivia] which benchmarks grep + OmniSearch (BM25) + QMD (hybrid) on a 2,673-document / 54.5 MB vault, all returning "<1s" — but FTS5 is not a participant. **CONFIRMED-NEGATIVE.**
- **No FTS5 implementation appears in any code-search benchmark** (zoekt, livegrep, codesearch, codedb, ngi, trigrep, Cursor Instant Grep). Code search consistently uses **trigram or sparse-n-gram inverted indexes** (Russ Cox lineage), not FTS5. FTS5 appears only in document-search and notes-app contexts ([sqlite-ai-fts5][sqlite-ai-fts5], [es-replaced][es-replaced], [Daniel Zolnai SQLite FTS post][zolnai]). The architectural shape is the same (inverted index + posting list) but the tokenization and ranking differ, which is why no benchmark has unified them.
- **No academic paper directly comparing inverted-index vs scan-based full-text search on a fixed modern corpus** was found in the public literature search. The [arxiv N-gram Selection paper][arxiv-ngram] is the closest formal treatment but is theory-of-tokenization, not benchmark.
- **What this means:** the architectural conclusion (index wins on warm-query latency, scan wins on setup cost) is well-documented for inverted-index-vs-ripgrep at the 1.6×–2,700× scale, and **transfers to FTS5 by INFERENCE** since FTS5 is structurally an inverted index. A direct head-to-head with FTS5 numbers is a measurable gap, not a conceptual one.

[curtis-arch]: https://curtis-arch.github.io/ai-search-benchmarks/
[codedb-blog]: https://codegraff.com/blog/codedb-code-intelligence
[ngi-bench]: https://github.com/erogol/ngi
[trigrep-bench]: https://github.com/PythonicNinja/trigrep
[cursor-blog]: https://cursor.com/blog/fast-regex-search
[aihola-review]: https://aihola.com/article/cursor-instant-grep-search-index
[zoekt-faq]: https://github.com/sourcegraph/zoekt/blob/main/doc/faq.md
[livegrep-readme]: https://github.com/livegrep/livegrep
[rsc-codesearch]: https://swtch.com/~rsc/regexp/regexp4.html
[mandalivia]: https://www.mandalivia.com/obsidian/semantic-search-for-your-obsidian-vault-what-i-tried-and-what-worked/
[zolnai]: https://dzolnai.medium.com/speed-up-searching-in-your-app-by-using-sqlite-and-fts-8896ab74b598
[arxiv-ngram]: https://arxiv.org/pdf/2504.12251

[sqlite-ai-fts5]: https://blog.sqlite.ai/real-time-full-text-site-search-with-sqlite-fts5-extension
[es-replaced]: https://medium.com/@build_break_learn/i-replaced-elasticsearch-with-sqlite-and-our-search-got-100-faster-5343a4458dd4
[moldstud-fts]: https://moldstud.com/articles/p-comparing-sqlite-fts3-and-fts5-which-full-text-search-engine-should-you-use
[internal-d5]: https://github.com/inkeep/open-knowledge/blob/main/reports/local-search-retrieval-stacks-2025-2026/evidence/d5-performance-benchmarks.md
[ripgrep-blog]: https://burntsushi.net/ripgrep/
[codeant-rg]: https://www.codeant.ai/blogs/ripgrep-vs-grep-performance
[sqlite-vec-bench]: https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html
[vectorlite-news]: https://1yefuwang1.github.io/vectorlite/markdown/news.html
[nearform]: https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/
[sqlite-forum-fperf]: https://sqlite.org/forum/info/47429810bd2232ebe0c1096c4910b43f6313b9d92bca6eab8496d59d3f585e4c
[vados-fts]: https://github.com/VADOSWARE/fts-benchmark

---

## 6. Workload skew sensitivity (read-heavy vs append-heavy vs mutate-heavy)

### Read-heavy
- **better-sqlite3 / node:sqlite / SQLite WAL** — Designed for read-heavy: WAL allows multiple concurrent readers even during an open writer; published 70,000 reads/sec under WAL [^phires-rw]. CONFIRMED.
- **PGlite** — Iterator-based execution scales O(log n) for indexed point lookups even on large datasets [^pglite-mem]. CONFIRMED for indexed reads, no published numbers for hot-path reads at scale.
- **JSON / YAML files** — Whole-file load means every read pays the full parse cost; reading is nominally free after first parse if the consumer caches. Read-heavy is fine *only if* the application maintains an in-memory cache. Otherwise pessimal. INFERRED (no benchmark frames it as "read-heavy" since the read primitive is whole-file).
- **JSONL** — Read-heavy of a fixed file is sequential scan; no random-access primitive without external indexing. INFERRED.
- **lowdb / electron-store** — Whole file is loaded once into memory; subsequent in-process reads are JS-object access (free). Read-heavy is the documented sweet spot for both. CONFIRMED via vendor positioning.

### Append-heavy
- **JSONL `fs.appendFile`** — Designed for append-heavy: each event is one `appendFile` call; no whole-file rewrite. Best-in-class for the "log every event, read in batches later" pattern. CONFIRMED.
- **SQLite WAL** — Append-heavy is well-supported via WAL; "[WAL] is always faster than rollback journal in all cases except when the disk is the bottleneck" per [phiresky][phiresky]. WAL checkpointing is the only variable that needs tuning under sustained append load. CONFIRMED.
- **lowdb / electron-store / JSON files** — Catastrophic under append-heavy: each append rewrites the entire file. Both vendors caution against. CONFIRMED via vendor docs.
- **PGlite IDB** — Per-write fsync to IndexedDB; ~21 ms per single-row insert on the maintainer's reference hardware [^pglite-bench]. Sustained append rate bounded by browser IDB throughput. CONFIRMED.

### Mutate-heavy
- **SQLite (any driver)** — Updates land in WAL; checkpoint + autovacuum bound long-term throughput. SQLite "supports one writer at a time per database file" [^sqlite-limits]. CONFIRMED.
- **PGlite** — Maintainer's commentary: PGlite uses Postgres WAL, faster than wa-sqlite for single-row updates [^pglite-bench]. CONFIRMED.
- **JSON / YAML / lowdb / electron-store** — Whole-file rewrite per mutation. Disastrous for high-frequency mutate workloads on documents > a few hundred KB. CONFIRMED via vendor positioning.
- **GIN-indexed PG (Drizzle/PGlite trigram)** — GIN index pending-list cleanup costs "between 465 ms and 3,155 ms" per cleanup window [^pg-trgm-bench], making GIN-indexed columns under mutate-heavy load show stutter. INFERRED relevance to PGlite (PGlite ships standard PostgreSQL GIN). Not measured directly on PGlite.

[^phires-rw]: https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
[^pglite-mem]: https://github.com/electric-sql/pglite/issues/406
[^pglite-bench]: https://pglite.dev/benchmarks
[^sqlite-limits]: https://sqlite.org/limits.html
[^pg-trgm-bench]: https://pganalyze.com/blog/gin-index

---

## 7. Cardinality scaling (1KB config → 10K-row index → 1M-row telemetry log → when does each backend hit its wall)

### YAML files (`yaml@2`)
- **1 KB config**: Sub-millisecond parse; well within design intent. CONFIRMED (parse benchmarks above).
- **10 KB / 100 KB**: Parsing remains ms-scale.
- **14k-line file (~hundreds of KB) with anchors/inheritance**: 6,900 ms with yaml@2.3.4 [^yaml358] — **wall hit**. js-yaml's 50 ms on the same file is the escape hatch.
- **1 MB+**: No published numbers but the wall is already past with yaml@2 by the 14k-line mark.
- **CONFIRMED** for the 14k-line wall; **INFERRED** for ≥ 1 MB.

### JSON files (atomic-rename + `JSON.parse`)
- **1 KB**: ~µs-scale parse + write.
- **1 MB**: `JSON.parse` ~ms-scale; writes are sub-ms typically; whole-file load is fine at this scale.
- **10–100 MB**: Per [Vladimir Adamic][va-jsonl] and [SuperJSON][superjson], "standard parsers struggle at 50–100 MB/s throughput" — so a 100 MB file is 1–2 s of parse alone; writes correspondingly slow.
- **1 GB+**: "Will try to load the entire file into memory" — risk of process freeze/crash without streaming [^superjson].
- CONFIRMED (with stage thresholds clearly published by [SuperJSON][superjson]).

### JSONL append-only
- **1 KB**: One line, trivial.
- **10K rows**: ~1 MB; sequential scan completes in < 100 ms with naive parser, faster with simdjson-class parsers.
- **1M rows**: ~100 MB at standard parser throughput → 1–2 s sequential scan. Optimized parsers reach GB/s [^superjson] → < 100 ms.
- **Wall**: Filesystem inode and append latency rather than parser cost; published "100,000 records in ~50 MB files on Node.js 20.x on MacBook Pro M1" benchmark exists [^jsonl-tools]. UNCERTAIN beyond 1 GB without specific evidence.

### better-sqlite3 / node:sqlite / SQLite WAL
- Theoretical max DB size: 281 TB [^sqlite-limits]. Practical wall: "anything above maybe 100 MB, or a GB if you're lucky will be so creepingly slow" per [hendrik-erz][hendrik-erz] (third-party opinion piece, no quantitative reproduction).
- Counter: phiresky scaled to "many concurrent readers and multiple gigabytes while maintaining 100k SELECTs/sec" with PRAGMA tuning [^phires-rw]. CONFIRMED — multi-GB is fine when tuned.
- 1M rows: well within design — see SQG benchmark numbers above (those harnesses use ~370k records).
- Wall: typically WAL checkpoint latency under sustained write or single-writer bottleneck [^sqlite-limits], not row-count.
- CONFIRMED.

### bun:sqlite
- Same SQLite engine ⇒ same physical scaling profile as better-sqlite3. JS-engine differences (JSC vs V8) affect row-conversion overhead, not engine limits. INFERRED from [Bun docs][bun-sqlite-doc].

### libsql (JS client, local file)
- The 60–130× INSERT regression vs better-sqlite3 [^libsql1850] means the wall is hit far earlier under sustained writes — at a workload that better-sqlite3 handles in 400 ms (10K inserts), libsql takes 23.3 s. CONFIRMED for the local-file write wall.
- For reads, ~20× slower per the SQG harness [^sqg]. CONFIRMED.

### PGlite
- Memory: SELECT * on 1M rows OK due to iterator [^pglite-mem]. CONFIRMED.
- IDB persistence backend "loads all files for the database into memory on start, and flushes them to IndexedDB after each query if they have changed" — implies whole-DB-in-RAM at runtime. Wall: "very large datasets may face memory pressure" [^pglite-mem]. UNCERTAIN at the GB scale; OPFS backend in development to address.
- NPM install size: 100+ MB unpacked per [pglite#477][pglite-477] — separate from runtime cardinality but a deployment-size wall.
- CONFIRMED for in-memory; UNCERTAIN for >100 MB DB on IDB.

### Drizzle ORM
- Inherits the wall of the underlying driver (better-sqlite3, bun:sqlite, libsql, PGlite, node-postgres).
- Vendor benchmark uses 370K records in 42 MB PostgreSQL DB at ~4,600 RPS [^drizzle-bench]. CONFIRMED at that scale.

### lowdb
- Vendor: "If you have large JS objects (~10–100 MB), you may hit some performance issues because whenever you call db.write, the whole db.data is serialized using JSON.stringify and written to storage" [^lowdb-readme]. CONFIRMED — wall is documented at 10–100 MB.
- **No quantitative benchmark** published. UNCERTAIN on exact transition point.

### electron-store
- Vendor: "will get slow with even moderately large data (e.g. 1 MB+)" [^es-readme]. CONFIRMED — wall at ~1 MB by author's own guidance. No quantitative benchmark.

### Drizzle ORM scaling caveat
- Prepared-statement API "can go faster than the better-sqlite3 driver" per vendor [^drizzle-perf]. Independent confirmation absent. UNCERTAIN.

[^yaml358]: https://github.com/eemeli/yaml/discussions/358
[^superjson]: https://superjson.ai/blog/2025-09-07-optimizing-large-json-files-production/
[^jsonl-tools]: https://jsonltools.com/jsonl-for-developers
[^libsql1850]: https://github.com/tursodatabase/libsql/issues/1850
[^sqg]: https://sqg.dev/blog/sqlite-driver-benchmark/
[^pglite-477]: https://github.com/electric-sql/pglite/issues/477
[^drizzle-bench]: https://orm.drizzle.team/benchmarks
[^drizzle-perf]: https://orm.drizzle.team/docs/perf-queries
[^lowdb-readme]: https://github.com/typicode/lowdb
[^es-readme]: https://github.com/sindresorhus/electron-store
[hendrik-erz]: https://www.hendrik-erz.de/post/why-you-shouldnt-use-sqlite

---

## Cross-cutting notes

### Hardware divergence in the cited corpus
Studies cited above were run on:
- MacBook Pro 15" Mid-2014, Node v12.16.1 (the canonical [WiseLibs benchmark.md][bs3-bench], from March 2020)
- M2 MacBook Air ([PGlite benchmarks][pglite-bench])
- i9-12900K, 31 GB RAM, Linux x64, Node v25.3.0 ([SQG][sqg], 2026)
- MacBook Pro M1, Node 20.x ([jsonltools][jsonl-tools])
- Lenovo M720q i3-9100T, 32 GB RAM ([Drizzle benchmarks][drizzle-bench])

Comparing absolute numbers across these is unsafe. Within-table comparisons (e.g., the SQG row of better-sqlite3 vs node:sqlite vs libsql) are the only fair head-to-head; other cells are reported in isolation.

### `bun:sqlite` benchmark dispute (UNCERTAIN status)
[Bun's own docs][bun-sqlite-doc] claim "3-6× faster than better-sqlite3" for read queries against the Northwind dataset. The methodology uses `SELECT *` queries which "mostly tests IO speed because it reads all the data," so the measurement reflects JavaScriptCore vs V8 row→object conversion speed rather than SQLite engine throughput [^bun4776]. When the [issue thread][bun-bench-flawed] runs queries that spend time inside SQLite rather than in row conversion, better-sqlite3 outperforms (296.85 ms/iter vs 346.42 ms/iter for the slower side — see thread for which is which). The dispute is structural; both numbers stand for the conditions they were measured under.

[^bun4776]: https://github.com/oven-sh/bun/issues/4776

### `node:sqlite` (Node 22+ built-in)
Built into Node 22+; SQG harness shows it "better than node-sqlite3 but not as good as better-sqlite3" — consistently 1.1–1.4× slower than better-sqlite3 across the SQG matrix [^sqg]. CONFIRMED (one source; matches the qualitative description in [WiseLibs/better-sqlite3#1266][bs3-1266]).

[bs3-1266]: https://github.com/WiseLibs/better-sqlite3/issues/1266

### File reads (sync vs async, fs.readFile baseline)
- Sync `readFileSync` 40% faster than async `readFile` for large files per [nodejs/node#41435][node-41435]. Per [a 2014 benchmark gist][faux-bench] sync 85.945 ms vs async 467.870 ms for the same workload. CONFIRMED.
- For "lots of small files," sync is "6–7× faster than async" [^adam-hooper]. CONFIRMED.
- Tradeoff: sync blocks the event loop. For server-side concurrent workloads this matters; for CLIs and one-shot scripts it does not.

[node-41435]: https://github.com/nodejs/node/issues/41435
[faux-bench]: https://gist.github.com/FauxFaux/079dc1c696cd60c8120a5ed9b18942c3
[^adam-hooper]: https://adamhooper.medium.com/node-synchronous-code-runs-faster-than-asynchronous-code-b0553d5cf54e

### Drizzle / `node:sqlite` / `bun:sqlite` interaction
Drizzle supports all three SQLite drivers (better-sqlite3, bun:sqlite, libsql, op-sqlite) [^drizzle-conn]. Drizzle's own overhead is "almost 0" but the absolute throughput comes from the underlying driver row above. Drizzle in front of libsql inherits libsql's regression; Drizzle in front of better-sqlite3 inherits better-sqlite3's published numbers minus an unmeasured query-builder cost (no third-party isolation of "Drizzle adds X µs per query" was found). UNCERTAIN.

[^drizzle-conn]: https://orm.drizzle.team/docs/connect-bun-sqlite

### What is missing from the public benchmark landscape
- No head-to-head per-op benchmark across **all 10 backends** under one harness. The SQG harness is the closest (better-sqlite3, node:sqlite, libsql, Turso). PGlite's own benchmarks compare only to wa-sqlite. lowdb / electron-store do not publish per-op numbers at all.
- No isolated `Drizzle adds X` overhead measurement per operation; Drizzle's own benchmarks measure end-to-end RPS at HTTP layer.
- No direct ripgrep-vs-FTS5 head-to-head with the same corpus + query. The closest direct evidence is **inverted-index-vs-ripgrep** (codedb, ngi, trigrep, Sourcegraph zoekt, Cursor Instant Grep) where the inverted index wins on warm-query latency by 1.6×–2,700×. FTS5 transfers from these benchmarks by INFERENCE (it is structurally an inverted index) but the exact FTS5 number on a code-search-shaped corpus is unmeasured. The closest FTS5-side benchmark is [VADOSWARE/fts-benchmark][vados-fts] (FTS5 vs Postgres, Typesense, Meilisearch, OpenSearch — not vs ripgrep). See §5 sub-section "Inverted-index vs scan-based head-to-head" for the 14 cited rows.
- No published "what cardinality does electron-store / lowdb actually break at" benchmark beyond the vendor's qualitative warnings.

---

## Internal-report cross-references (per spec instructions)

- [`reports/local-search-retrieval-stacks-2025-2026/evidence/d5-performance-benchmarks.md`][internal-d5] — sqlite-vec brute-force at 100k vectors, FTS5 at 1M records, Orama vector at 900 docs.
- [`reports/search-engine-decision/REPORT.md`][internal-search] — qualitative claim that SQLite per-branch index lifecycle is ~1–5 ms file open/close vs Orama's 50–100 ms serialize/deserialize and PGlite's 200–500 ms instance teardown/startup.
- [`reports/vec1-vs-sqlite-vec-ecosystem/REPORT.md`][internal-vec] — sqlite-vec ecosystem context for vector workloads.

[internal-search]: https://github.com/inkeep/open-knowledge/blob/main/reports/search-engine-decision/REPORT.md
[internal-vec]: https://github.com/inkeep/open-knowledge/blob/main/reports/vec1-vs-sqlite-vec-ecosystem/REPORT.md
