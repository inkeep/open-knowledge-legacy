---
title: "DuckDB deep-dive across the 10 dimensions"
description: "DuckDB as an embedded-analytical alternative: per-op performance, durability, schema lifecycle, concurrency, ergonomics, distribution, query/relational, hierarchical, operational, append-only — alongside the row-oriented backends already covered."
date: 2026-04-23
sources:
  - https://duckdb.org/
  - https://duckdb.org/docs/current/internals/storage
  - https://duckdb.org/docs/current/connect/concurrency
  - https://duckdb.org/2024/10/30/analytics-optimized-concurrent-transactions
  - https://duckdb.org/docs/current/guides/troubleshooting/crashes
  - https://duckdb.org/2025/11/19/encryption-in-duckdb
  - https://duckdb.org/2025/09/16/announcing-duckdb-140
  - https://duckdb.org/docs/current/sql/indexes
  - https://duckdb.org/2022/07/27/art-storage
  - https://duckdb.org/docs/current/sql/statements/alter_table
  - https://duckdb.org/docs/lts/sql/constraints
  - https://duckdb.org/docs/current/sql/query_syntax/with
  - https://duckdb.org/2024/01/26/multi-database-support-in-duckdb
  - https://duckdb.org/docs/current/data/appender
  - https://duckdb.org/docs/current/data/parquet/overview
  - https://duckdb.org/docs/current/clients/cli/overview
  - https://duckdb.org/docs/current/clients/cli/dot_commands
  - https://duckdb.org/docs/current/core_extensions/full_text_search
  - https://duckdb.org/docs/current/core_extensions/vss
  - https://duckdb.org/docs/current/core_extensions/spatial/overview
  - https://duckdb.org/docs/stable/operations_manual/securing_duckdb/overview
  - https://duckdb.org/community_extensions/extensions/otlp
  - https://duckdb.org/2021/10/29/duckdb-wasm
  - https://duckdb.org/2024/12/18/duckdb-node-neo-client
  - https://duckdb.org/docs/current/dev/release_cycle
  - https://duckdb.org/faq
  - https://github.com/duckdb/duckdb/issues/77
  - https://github.com/duckdb/duckdb/issues/46
  - https://github.com/duckdb/duckdb-wasm
  - https://github.com/duckdb/duckdb-node
  - https://github.com/duckdb/duckdb/discussions/4899
  - https://github.com/duckdb/duckdb/discussions/3371
  - https://github.com/duckdb/duckdb/discussions/2368
  - https://github.com/duckdb/duckdb/discussions/13371
  - https://github.com/duckdb/duckdb-node/issues/132
  - https://github.com/leonardovida/drizzle-duckdb
  - https://www.npmjs.com/package/@duckdbfan/drizzle-duckdb
  - https://github.com/evanwashere/duckdb
  - https://github.com/abhidg/duckdb-react-electron
  - https://motherduck.com/learn/duckdb-vs-sqlite-databases/
  - https://www.datacamp.com/blog/duckdb-vs-sqlite-complete-database-comparison
  - https://www.lukas-barth.net/blog/sqlite-duckdb-benchmark/
  - https://www.timestored.com/data/duckdb/insert-benchmark
  - https://arrow.apache.org/blog/2025/03/10/fast-streaming-inserts-in-duckdb-with-adbc/
  - https://github.com/marvelousmlops/database_comparison
  - https://simonwillison.net/2022/Sep/1/sqlite-duckdb-paper/
  - https://x.com/iavins/status/1954400316893618376
  - https://github.com/duckdb/ducklake/discussions/103
  - https://github.com/jeff-gorelick/csvdb
  - https://news.ycombinator.com/item?id=29039235
  - https://github.com/duckdb/duckdb-wasm/discussions/1241
  - https://github.com/tobilg/ducklings
framing: 3P / external sources only
---

> **Conventions.** Confidence labels apply to load-bearing claims. CONFIRMED = official docs corroborated by at least one independent source, or multiple authoritative sources. INFERRED = single official source or extrapolated from documented behavior. UNCERTAIN = source disagreement, vendor-only claim with documented dispute, or insufficient public documentation. This file is read alongside `01..10-*.md`; backends already covered there are referenced for comparison without re-citing their primary sources.

DuckDB is an in-process column-oriented analytical (OLAP) DBMS. It first reached v1.0 ("SnowDuck") on 2024-06-03 ([DuckDB 1.0 release][duckdb-100]) and v1.4.0 LTS ("Andium") on 2025-09-16 ([DuckDB 1.4.0 LTS release][duckdb-140]); v1.5.2 was current at the time of writing per the [release feed][duckdb-152]. Below it is evaluated against the same 10 dimensions used for the row-oriented embedded SQL backends in the rest of this report.

---

## 1. Per-op performance

DuckDB's performance shape is the inverse of SQLite/PGlite: aggregation, joins, and scans dominate; single-row point lookups underperform row-stores even with an index.

- **Point lookup vs row-stores.** Independent benchmarks find SQLite "outperforms DuckDB consistently by one or two orders of magnitude" for indexed point lookups ([Lukas Barth, "Benchmarking DuckDB vs SQLite for Simple Queries"][barth-bench]; CONFIRMED); the [DataCamp comparison][datacamp] frames this as "SQLite remains the king of point lookups". Cause is the columnar storage layout — even an indexed lookup must reassemble row state from per-column blocks ([endjin "DuckDB in Depth"][endjin]; INFERRED).
- **ART index for points.** From [DuckDB 1.4 LTS docs][duckdb-art]: an Adaptive Radix Tree is "mainly used to ensure primary key constraints and to speed up point and very highly selective (i.e., < 0.1%) queries". ART indexes are auto-created for `PRIMARY KEY` / `UNIQUE` columns and persist on disk ([DuckDB blog "Persistent Storage of ART"][art-persist]; CONFIRMED). ART must fit in memory at creation time ([DuckDB indexes guide][duckdb-indexing]; CONFIRMED).
- **Aggregation / OLAP.** Multiple comparators report DuckDB beating SQLite by **20-50× on million-row analytical workloads** ([DataCamp][datacamp]; CONFIRMED) and SSB at 3-8× low / 30-50× high margin ([Hakuna Matata Tech][hakuna]; CONFIRMED). Vectorized execution + columnar layout is the cited mechanism ([endjin][endjin]; CONFIRMED).
- **Batched insert throughput.** DuckDB's [Appender][duckdb-appender] commits every 204,800 rows by default and is the recommended bulk-insert primitive in C/C++/Go/Java/Rust. A reproduced laptop benchmark hit ~63k rows/sec via Appender ([Apache Arrow blog "Fast Streaming Inserts in DuckDB with ADBC"][arrow-adbc]; CONFIRMED for that hardware); the same post argues ADBC + bulk batching reaches ~20k inserts/sec from app-layer batching with potential 10× more from Appender. The [timestored DuckDB Insert Benchmark][timestored-insert] characterizes batched inserts as "10× faster" than row-by-row "even on small data sets".
- **Time-series caveat.** A user report on a time-series benchmark found "duckdb 10 times slower than sqlite" for one workload ([DuckDB discussion #2368][duckdb-2368]; UNCERTAIN — single thread, workload-specific, contested in replies). DuckDB's own positioning is "happiest when it can stream from Parquet with predicate + column pruning" rather than be used as an OLTP time-series sink (community-derived, INFERRED).
- **Range scan / FTS.** Range scans are a sweet spot — column pruning + min/max zonemaps reduce I/O ([endjin][endjin]; CONFIRMED). FTS is provided by the [`fts` extension][duckdb-fts] (BM25 + inverted index); it is not a built-in primitive like SQLite's FTS5 (CONFIRMED). Vector search via the [`vss` extension][duckdb-vss] (HNSW over fixed-size `ARRAY` type, marked experimental; CONFIRMED).
- **Cardinality scaling.** Columnar compression and zonemaps make DuckDB's per-column working set sub-linear in many analytical scans ([endjin][endjin]; INFERRED for "zonemap" terminology, CONFIRMED for compression).

## 2. Durability + crash safety

DuckDB has its own write-ahead log and a documented checkpoint/recovery protocol. v1.4 LTS materially hardened the WAL.

- **WAL model.** Per the [DuckDB Crashes troubleshooting page][duckdb-crashes]: changes are written to a `.wal` sidecar file at commit; on restart "DuckDB will replay the write-ahead log and perform a checkpoint operation". Checkpoint default trigger is **WAL size 16 MB**, plus shutdown ([Crashes guide][duckdb-crashes]; CONFIRMED).
- **WAL hardening (v1.4 LTS).** External review (Aviral Srivastava on X, [@iavins/1954400316893618376][iavins-tweet]) catalogues per-record checksums, explicit error on checksum failure, configurable behavior, partial replay through a corrupt record, and safe-truncation semantics — "everything I was asking for in my blog post" (INFERRED — single-source post about a multi-feature change; the [DuckDB 1.4.0 LTS release notes][duckdb-140] confirm WAL improvements at the headline level).
- **Atomic commit unit.** A transaction (single or multi-statement) is the atomic unit; row updates use HyPer-style in-place writes with undo buffers ([DuckDB "Analytics-Optimized Concurrent Transactions"][duckdb-analytics-mvcc]; CONFIRMED).
- **Multi-step transactions.** Standard SQL `BEGIN/COMMIT/ROLLBACK` over a single attached database. Cross-attach transactions are restricted: "the system only supports writing to a single attached database in a single transaction" ([Multi-Database Support][duckdb-attach]; CONFIRMED).
- **Backup portability.** DuckDB does not have a stable cross-version on-disk format guarantee until very recently — backward compatibility began with v0.10 (read older files only, [v0.10 announcement context][datacamp]; CONFIRMED). For portable backups DuckDB supports `EXPORT DATABASE` / `IMPORT DATABASE` (Parquet-preferred) ([DuckDB docs export/import, INFERRED from CLI tutorials][cli-discussion-8508]). Native file is a single binary file ([DuckDB Internals - Part 1: File Format Overview][alibaba-fileformat]; CONFIRMED).
- **fsync cost.** Not separately published as a per-op number; the [DuckDB FAQ][duckdb-faq] notes durability tradeoffs are configurable. INFERRED.
- **Lockfile cleanup edge.** A historical issue ([duckdb#10002][duckdb-10002]) reported the `.wal` file persisting after `connection.close()` in some flows; this is a process-shutdown ordering question rather than a corruption risk (UNCERTAIN — issue specifics depend on language binding).

## 3. Schema lifecycle

DuckDB supports standard SQL DDL but is materially behind PostgreSQL on `ALTER TABLE` breadth.

- **DDL surface.** [`ALTER TABLE`][duckdb-alter] supports add/drop/rename column and rename table; transactional and revertible. **Notable gaps**: no change-column-type, no add/remove constraints, no modify-default in current docs (CONFIRMED).
- **Schema evolution under MVCC.** ALTER creates a new `DataTable` version while the old continues to serve in-flight transactions ([DuckDB DeepWiki "Table Storage and Transactions"][deepwiki-table]; INFERRED — single source).
- **Drizzle support.** No first-party Drizzle dialect. Two community efforts exist:
  - [`drizzle-duckdb`][drizzle-duckdb-repo] (leonardovida): "experimental status, with core query building, migrations, and type inference working well", based on Drizzle's Postgres client (CONFIRMED — repo README).
  - [`@duckdbfan/drizzle-duckdb`][drizzle-duckdb-npm] on npm pinned against `@duckdb/node-api@1.4.4-r.1` and `1.5.1-r.1` (CONFIRMED — npm metadata).
  - Drizzle's official statement on X ([@DrizzleORM/1830271376181383390][drizzle-tweet]): Drizzle Studio Gateway gained DuckDB/MotherDuck support but "Drizzle ORM does not yet have DuckDB driver" — community packages above are the workaround (CONFIRMED — vendor public statement).
- **Codegen / introspection.** Drizzle introspection is documented in the community fork's docs ([drizzle-duckdb troubleshooting][drizzle-duckdb-trouble]; INFERRED).
- **Migration tooling.** No DuckDB-equivalent of `drizzle-kit` for native DuckDB; `drizzle-duckdb` borrows the Postgres path. The [Drizzle migrations doc][drizzle-migrations] does not list DuckDB as a supported dialect (CONFIRMED via absence).

## 4. Concurrent + multi-process access

DuckDB is single-process for writes — closer to SQLite's `EXCLUSIVE` lock window than to PGlite's WAL-based reader concurrency.

- **Single-process write rule.** From the [Concurrency docs][duckdb-concurrency]: "DuckDB supports multiple concurrent readers, but only one writer at a time" across processes; file-level locking enforces it (CONFIRMED). One process may hold the file in `READ_WRITE` mode; others may open it `READ_ONLY`.
- **Cross-process write rejection.** Cited as out of scope by the maintainers in [issue #77][duckdb-issue-77]: "Concurrent writes to the same DuckDB file from multiple processes are not supported and are unlikely to be supported in the future" — even disjoint-table writes contend on WAL/blocks (CONFIRMED — maintainer statement).
- **Same-process multi-thread writes.** Supported via MVCC + optimistic concurrency control. DuckDB implements HyPer-style serializable MVCC ([DuckDB "Analytics-Optimized Concurrent Transactions"][duckdb-analytics-mvcc]; CONFIRMED). Append-only writes "will never conflict, even on the same table" (CONFIRMED).
- **Connection model.** A single `Database` may host many `Connection` objects in one process; threading rules vary per binding ([duckdb-rs#378 thread][duckdb-rs-378]; INFERRED — Rust-specific but referenced by other bindings).
- **Change notification.** No built-in row-level pub/sub or `LISTEN/NOTIFY` (PostgreSQL-style) is documented. UNCERTAIN — absence of doc rather than confirmed absence.
- **Reader staleness.** Read-only attaches see a snapshot from when they opened the file; updates from another process are not visible without re-opening ([discussion #11155][duckdb-11155]; INFERRED).

## 5. Human + agent ergonomics

DuckDB's CLI is well-regarded — it is `sqlite3`-style with extra dot commands and richer output formats.

- **CLI binary.** `duckdb path/to/file.duckdb` opens an interactive REPL ([CLI overview][duckdb-cli]; CONFIRMED). On macOS distributed via Homebrew (`brew install duckdb`) and as a single static binary download from duckdb.org.
- **Schema inspection.** `.tables`, `.schema`, `DESCRIBE table` (and aliases `DESC`, `SHOW`) work as a developer would expect ([DuckDB Dot Commands][duckdb-dot]; CONFIRMED).
- **Output modes.** `.mode line | json | csv | markdown | box` etc. — the [Hassan Abedi tutorial][habedi-cli] documents `.mode json` as "much better for nested values" (CONFIRMED). Helpful when an LLM agent reads CLI output as structured text.
- **No comment preservation.** SQL DDL comments are not round-tripped (same as SQLite/PGlite — INFERRED, no source contradicts).
- **Inspectability.** Single-file binary; the [csvdb tool][csvdb-repo] specifically exists to convert SQLite/DuckDB binary files to CSV-per-table for git-readable diffs — confirms there is no built-in human-readable export beyond `EXPORT DATABASE` (which still produces CSV/Parquet).
- **Agent-friendliness.** Same shape as SQLite for an agent: open file, run SQL. The OTel community extension (see §9) makes traces queryable from inside the same CLI session.

## 6. Distribution + footprint

DuckDB's binary is materially larger than SQLite's; the WASM build is large enough that minimal-footprint distributions exist as a separate project.

- **Native binary.** The DuckDB CLI ships as a single static executable. Sizes are not headlined on the homepage but the v1.4.0 LTS release announcement and download page reflect tens-of-MB scale (INFERRED — release-page sizing not directly cited; the discussion threads about install times reference build-from-source pain in `duckdb#9113`).
- **Node.js bindings.** The "neo" client ([`@duckdb/node-api`][duckdb-node-neo-blog]) is the supported path; the legacy [`duckdb` npm package][duckdb-node] is deprecated after v1.4.x. Per the neo announcement, "package manager will only install optionalDependencies for supported platforms, so you only get exactly the binaries you need" — bytes-on-disk scales per-platform (CONFIRMED).
- **Bun support.** A community Bun binding exists ([evanwashere/duckdb][evan-bun]) advertising "JIT optimized bindings, 2-6× faster than node & deno" (CONFIRMED — repo README; speed claim is vendor and UNCERTAIN absent independent harness). The official `@duckdb/node-api` is N-API and works under Bun's Node compat mode (INFERRED).
- **Electron compat.** Works as a native module in Electron; documented friction on Windows in [duckdb-node#132][duckdb-electron-issue]. Template repo at [abhidg/duckdb-react-electron][duckdb-electron-template] (CONFIRMED).
- **WASM build.** [`@duckdb/duckdb-wasm`][duckdb-wasm-repo] — official WebAssembly build. Sizes vary by variant:
  - "DuckDB Shell demo with loading of extensions requires about 3.2 MB of compressed Wasm files" ([duckdb-wasm announcement][duckdb-wasm-announce]; CONFIRMED).
  - The eh.wasm file is reported as ~6.4 MB on duckdb.org but as much as ~18 MB on npm depending on variant ([discussion #1241][duckdb-wasm-1241]; CONFIRMED — multi-source).
  - Minimal alternative [`tobilg/ducklings`][ducklings-repo] reports "~6.0 MB for browser, ~8.1 MB for workers, gzipped WASM (optimized with -Oz, LTO, wasm-opt)" (CONFIRMED — repo README).
  - Compare PGlite at "~3 MB gzipped" — DuckDB WASM is roughly 2-6× larger depending on variant.
- **Git-friendliness.** Native `.duckdb` files are binary blocks (256 KB) ([Alibaba file-format internals][alibaba-fileformat]; CONFIRMED). Diff/merge in git is impractical without an export pipeline like csvdb. Same posture as SQLite/PGlite vs YAML/JSON.

## 7. Query + relational capabilities

DuckDB has the broadest SQL surface of the embedded options short of full PostgreSQL.

- **SQL features.** Window functions, recursive CTEs, full aggregate set, lateral joins, set operations, table functions, pivot/unpivot ([WITH clause docs][duckdb-cte]; CONFIRMED). DuckDB shipped a SIGMOD paper on `USING KEY` for recursive CTEs ([DuckDB blog "USING KEY in Recursive CTEs"][duckdb-using-key]; CONFIRMED).
- **Foreign keys.** Long-tracked at [issue #46][duckdb-fk-issue]. The current [Constraints docs][duckdb-constraints] state FOREIGN KEY "enforces that the key exists in the other table" — CONFIRMED that FK syntax exists. **Caveat**: FK semantics are documented as more limited than PostgreSQL; older issues report partial enforcement, and the [DuckLake Constraints page][ducklake-constraints] explicitly notes FK enforcement nuances. Treat FK enforcement as CONFIRMED-but-narrower than PostgreSQL until specific cases are tested.
- **PRIMARY KEY / UNIQUE.** Enforced with auto-created ART indexes ([Constraints docs][duckdb-constraints]; CONFIRMED). PK constraints additionally enforce NOT NULL.
- **FTS.** [`fts` extension][duckdb-fts] — BM25 + inverted index + `match_bm25()` macro after `PRAGMA create_fts_index(...)` (CONFIRMED).
- **Vector search.** [`vss` extension][duckdb-vss] — HNSW over `ARRAY` type, experimental flag (CONFIRMED).
- **Spatial.** [`spatial` extension][duckdb-spatial] — PostGIS-like via GEOS/GDAL/PROJ; 50+ geospatial formats (CONFIRMED).
- **JSON.** Built-in `JSON` logical type; `json` extension auto-loaded (CONFIRMED — DuckDB JSON docs).
- **External format scanners.** Read CSV, Parquet, JSON, Arrow, Excel directly via table functions; Parquet pushes down filters and column pruning ([Parquet docs][duckdb-parquet]; CONFIRMED).

## 8. Hierarchical + multi-scope semantics

DuckDB's `ATTACH` is a strong multi-DB primitive — closer to PostgreSQL's foreign-data-wrapper layer than SQLite's `ATTACH`.

- **`ATTACH` syntax and types.** From the [Multi-Database Support announcement][duckdb-attach]: `ATTACH 'file.db' AS file_db;` for native; `ATTACH 'sqlite_file.db' AS s (TYPE SQLITE);` for SQLite; PostgreSQL and MySQL via the `postgres` / `mysql` extensions; MotherDuck via cloud (CONFIRMED).
- **Schemas inside attached DBs.** `CREATE SCHEMA new_db.my_schema; CREATE TABLE new_db.my_schema.my_table(col INTEGER);` is supported syntax (CONFIRMED).
- **Cross-DB queries.** Joins / unions across attached databases work in a single SELECT (CONFIRMED).
- **Cross-DB write transactions.** **Restriction**: "the system only supports writing to a single attached database in a single transaction" ([Multi-Database Support][duckdb-attach]; CONFIRMED). Multiple read transactions across attaches are fine.
- **Per-scope storage layout.** Each attached file is its own independent on-disk DB; no shared catalog (INFERRED from `ATTACH` docs).
- **Use case fit.** Maps well to "one DB per project / per user / per scope" patterns. Open-multiple, write-one-at-a-time is the operational shape.

## 9. Operational concerns

- **Test isolation (`:memory:`).** DuckDB supports `:memory:` as the database path for ephemeral in-RAM databases — same idiom as SQLite/PGlite. From the [DuckDB FAQ][duckdb-faq] and [Persistent Testing docs][duckdb-persistent-test]: "By default, all tests are run in in-memory mode (unless --force-storage is enabled)" (CONFIRMED). Memory-mode DBs cannot offload data to disk by default; `SET temp_directory` enables spillover ([discussion on disk spilling][duckdb-2859-spill]; CONFIRMED).
- **OTel observability.** No first-party tracing in the database engine itself; community extension [`otlp`][duckdb-otlp-ext] provides table functions to **read** OTLP traces/metrics/logs from JSON or protobuf into DuckDB (CONFIRMED — duckdb.org community extensions catalog). DuckDB-as-OTel-sink is documented; DuckDB-as-traced-component is not (no spans on `query.execute`, `wal.commit` etc. in the official client). UNCERTAIN whether N-API bindings expose hooks suitable for `@opentelemetry/instrumentation-*` packages.
- **Encryption at rest.** Added in [v1.4.0 LTS][duckdb-encryption]: AES-GCM-256 (recommended) and AES-CTR-256, encrypts main file + WAL + temporary files. Activated via `ATTACH 'enc.db' AS e (ENCRYPTION_KEY 'secret');`. Two implementations (Mbed TLS built-in; OpenSSL via `httpfs` for hardware-accelerated speed) (CONFIRMED).
- **Sandbox model.** [Securing DuckDB][duckdb-securing] documents lockable settings, disabling extension auto-install, restricting file-system paths. CONFIRMED.
- **Audit trail.** No built-in audit log; would need to be application-built (INFERRED — absence of doc).
- **Snapshots.** No built-in snapshot/clone; backup via `EXPORT DATABASE` to Parquet, or file-system copy when the DB is closed (INFERRED).
- **Vendor lock-in.** Documented community concern: "DuckDB files are supported only by DuckDB" while Parquet is "supported by pretty much every query engine" ([DuckLake discussion #103][ducklake-103]; CONFIRMED). DuckLake itself is the team's open-format response — uses Parquet + a SQL catalog instead of native `.duckdb` ([DuckLake site][ducklake-site]; CONFIRMED). For OLAP workloads, exporting to Parquet is the de-facto interop path.
- **Storage version compatibility.** Backward compat began with v0.10; forward compat (older reader → newer file) is **not** guaranteed across major versions ([Storage Versions and Format docs][duckdb-storage-format]; CONFIRMED). v1.2 added a `STORAGE_VERSION` ATTACH option for explicit pinning.

## 10. Append-only patterns

DuckDB's Appender API is its native bulk-write primitive; for true append-only / time-series patterns the strong recommendation is to pair it with Parquet for cold storage.

- **Appender.** From the [Appender docs][duckdb-appender]: "By default, the appender performs commits every 204,800 rows" — designed for high-throughput streaming inserts, available in C, C++, Go, Java, Rust (CONFIRMED). Node.js does not list Appender in the same first-class form; the neo client exposes it via lower-level bindings (INFERRED).
- **Throughput baseline.** ~63k rows/sec on laptop hardware for a streaming workload via Appender ([Apache Arrow ADBC blog][arrow-adbc]; CONFIRMED for that hardware/workload).
- **Append-only INSERT cost.** A documented degradation pattern at scale ([duckdb#17210][duckdb-17210]: "insert/copy performance degrade with growing DB size") and a guide ([Optimizing DuckDB Insert Performance discussion][duckdb-13371]) recommend row-group + parallelism tuning. INFERRED that naive append is not as cheap as SQLite's append.
- **Parquet pairing.** DuckDB's strongest append-only story is **append to Parquet partitions**, query directly via `read_parquet('partitions/*.parquet')`. Filter and column pushdown are automatic; remote/HTTPS/S3 reads via `httpfs` extension ([Parquet docs][duckdb-parquet]; CONFIRMED). DuckDB caches Parquet metadata + statistics so warm starts are millisecond-scale (CONFIRMED — the marginalia.nu post and the MotherDuck object-store cache notes both report this; the [Performance Guide][duckdb-perf-guide] documents the cache).
- **vs JSONL/SQLite for "log + scan later".** JSONL is text-only and requires a parse step; SQLite scales row-storage cheaply for writes but not for OLAP scan. DuckDB → Parquet is positioned as the "stream-then-analyze" pattern across the ecosystem (community-derived; INFERRED).
- **Concurrent writers caveat.** Append-only does not relax the single-writer rule; parallel writers from multiple processes still contend on the WAL ([issue #4899][duckdb-4899]; CONFIRMED).

---

## DuckDB position vs the 10-backend matrix

| Dimension | DuckDB position | Closest matrix neighbor |
|---|---|---|
| 1. Per-op performance | Inverse of SQLite/PGlite — slow point lookups (1-2 OOM behind SQLite even with ART), 20-50× wins on million-row analytical queries. ART helps but does not close the point-lookup gap. | **better-sqlite3** at the opposite end of the spectrum (point-lookup champion); **PGlite** is the closer mirror for "in-process SQL with persistence cost". |
| 2. Durability + crash safety | Own WAL + checkpoint at 16 MB; v1.4 LTS added per-record checksums and partial replay. Single binary file. Cross-attach writes restricted to one DB per transaction. | **PGlite** for "WAL-backed in-process Postgres-like"; durability story is broadly comparable post-1.4. |
| 3. Schema lifecycle | `ALTER TABLE` materially narrower than PostgreSQL (no type change, no constraint mod). Drizzle support is community-only and experimental. | **PGlite + Drizzle** is the comparable in-process SQL-first ORM combo; DuckDB lags here. |
| 4. Concurrent + multi-process | Multi-thread writes within one process via HyPer-style MVCC; **strict single-writer-process** at the OS level. Multi-reader processes OK. | **better-sqlite3** for cross-process semantics (also serialized writers); PGlite differs in being single-process by design. |
| 5. Human + agent ergonomics | `sqlite3`-style CLI, dot commands, JSON/markdown output modes, schema inspection via `DESCRIBE`. No comment preservation. | **better-sqlite3 + sqlite3 CLI** — same shape, larger feature surface in DuckDB. |
| 6. Distribution + footprint | Single static native binary (tens of MB); WASM 6-18 MB depending on variant (vs PGlite ~3 MB gzipped). Bun + Electron supported with documented friction. | **PGlite** for WASM comparison (DuckDB is roughly 2-6× larger); **better-sqlite3** for native (DuckDB is larger than libsqlite3). |
| 7. Query + relational | Broadest SQL surface of the embedded options: window functions, recursive CTEs (with `USING KEY`), lateral joins, FK (narrower than PG), FTS via extension, vector via extension, spatial via extension. | **PGlite** is the only matrix peer with similar SQL breadth; PGlite has FK and constraint depth advantage, DuckDB has analytical execution advantage. |
| 8. Hierarchical + multi-scope | `ATTACH` is rich: native, SQLite, PostgreSQL, MySQL, MotherDuck. Cross-DB read joins free; **single-DB-per-write-transaction** restriction. | **better-sqlite3 ATTACH** as a primitive; DuckDB's is materially more capable across formats. |
| 9. Operational | `:memory:` for tests; AES-GCM-256 encryption at rest as of v1.4 LTS; OTel = read-OTLP, not emit-OTLP. Vendor-lock-in concern documented and answered by DuckLake (Parquet-based open format). | **PGlite** for `:memory:` parity; **better-sqlite3** has older but more battle-tested encryption story via SQLCipher; **PGlite** has no vendor-lock concern (PG dialect is portable). |
| 10. Append-only | Appender API at 63k+ rows/sec; native append degrades with DB size at scale; **Parquet partitions** is the canonical cold-tier append-only pattern. | **JSONL** (append-only file format) for the write side; DuckDB-over-Parquet replaces the read-time scan story. |

[duckdb-100]: https://github.com/duckdb/duckdb/releases
[duckdb-140]: https://duckdb.org/2025/09/16/announcing-duckdb-140
[duckdb-152]: https://duckdb.org/2026/04/13/announcing-duckdb-152
[barth-bench]: https://www.lukas-barth.net/blog/sqlite-duckdb-benchmark/
[datacamp]: https://www.datacamp.com/blog/duckdb-vs-sqlite-complete-database-comparison
[hakuna]: https://www.hakunamatatatech.com/our-resources/blog/sqlite
[endjin]: https://endjin.com/blog/2025/04/duckdb-in-depth-how-it-works-what-makes-it-fast
[duckdb-art]: https://duckdb.org/docs/lts/sql/indexes
[art-persist]: https://duckdb.org/2022/07/27/art-storage
[duckdb-indexing]: https://duckdb.org/docs/current/guides/performance/indexing
[duckdb-appender]: https://duckdb.org/docs/current/data/appender
[arrow-adbc]: https://arrow.apache.org/blog/2025/03/10/fast-streaming-inserts-in-duckdb-with-adbc/
[timestored-insert]: https://www.timestored.com/data/duckdb/insert-benchmark
[duckdb-2368]: https://github.com/duckdb/duckdb/discussions/2368
[duckdb-fts]: https://duckdb.org/docs/current/core_extensions/full_text_search
[duckdb-vss]: https://duckdb.org/docs/current/core_extensions/vss
[duckdb-spatial]: https://duckdb.org/docs/current/core_extensions/spatial/overview
[duckdb-crashes]: https://duckdb.org/docs/current/guides/troubleshooting/crashes
[iavins-tweet]: https://x.com/iavins/status/1954400316893618376
[duckdb-analytics-mvcc]: https://duckdb.org/2024/10/30/analytics-optimized-concurrent-transactions
[duckdb-attach]: https://duckdb.org/2024/01/26/multi-database-support-in-duckdb
[duckdb-faq]: https://duckdb.org/faq
[cli-discussion-8508]: https://github.com/duckdb/duckdb/discussions/8508
[alibaba-fileformat]: https://www.alibabacloud.com/blog/602511
[duckdb-10002]: https://github.com/duckdb/duckdb/issues/10002
[duckdb-alter]: https://duckdb.org/docs/current/sql/statements/alter_table
[deepwiki-table]: https://deepwiki.com/duckdb/duckdb/7.1-python-api
[drizzle-duckdb-repo]: https://github.com/leonardovida/drizzle-duckdb
[drizzle-duckdb-npm]: https://www.npmjs.com/package/@duckdbfan/drizzle-duckdb
[drizzle-tweet]: https://x.com/DrizzleORM/status/1830271376181383390
[drizzle-duckdb-trouble]: https://leonardovida.github.io/drizzle-duckdb/reference/troubleshooting.html
[drizzle-migrations]: https://orm.drizzle.team/docs/migrations
[duckdb-concurrency]: https://duckdb.org/docs/current/connect/concurrency
[duckdb-issue-77]: https://github.com/duckdb/duckdb/issues/77
[duckdb-rs-378]: https://github.com/duckdb/duckdb-rs/issues/378
[duckdb-11155]: https://github.com/duckdb/duckdb/discussions/11155
[duckdb-cli]: https://duckdb.org/docs/current/clients/cli/overview
[duckdb-dot]: https://duckdb.org/docs/current/clients/cli/dot_commands
[habedi-cli]: https://habedi.medium.com/top-duckdb-cli-commands-that-you-should-know-7783af9c1fb4
[csvdb-repo]: https://github.com/jeff-gorelick/csvdb
[duckdb-node-neo-blog]: https://duckdb.org/2024/12/18/duckdb-node-neo-client
[duckdb-node]: https://github.com/duckdb/duckdb-node
[evan-bun]: https://github.com/evanwashere/duckdb
[duckdb-electron-issue]: https://github.com/duckdb/duckdb-node/issues/132
[duckdb-electron-template]: https://github.com/abhidg/duckdb-react-electron
[duckdb-wasm-repo]: https://github.com/duckdb/duckdb-wasm
[duckdb-wasm-announce]: https://duckdb.org/2021/10/29/duckdb-wasm
[duckdb-wasm-1241]: https://github.com/duckdb/duckdb-wasm/discussions/1241
[ducklings-repo]: https://github.com/tobilg/ducklings
[duckdb-cte]: https://duckdb.org/docs/stable/sql/query_syntax/with
[duckdb-using-key]: https://duckdb.org/2025/05/23/using-key
[duckdb-fk-issue]: https://github.com/duckdb/duckdb/issues/46
[duckdb-constraints]: https://duckdb.org/docs/lts/sql/constraints
[ducklake-constraints]: https://ducklake.select/docs/stable/duckdb/advanced_features/constraints
[duckdb-parquet]: https://duckdb.org/docs/current/data/parquet/overview
[duckdb-persistent-test]: https://duckdb.org/docs/current/dev/sqllogictest/persistent_testing
[duckdb-2859-spill]: https://github.com/duckdb/duckdb-web/issues/2859
[duckdb-otlp-ext]: https://duckdb.org/community_extensions/extensions/otlp
[duckdb-encryption]: https://duckdb.org/2025/11/19/encryption-in-duckdb
[duckdb-securing]: https://duckdb.org/docs/stable/operations_manual/securing_duckdb/overview
[ducklake-103]: https://github.com/duckdb/ducklake/discussions/103
[ducklake-site]: https://ducklake.select/
[duckdb-storage-format]: https://duckdb.org/docs/current/internals/storage
[duckdb-17210]: https://github.com/duckdb/duckdb/issues/17210
[duckdb-13371]: https://github.com/duckdb/duckdb/discussions/13371
[duckdb-perf-guide]: https://duckdb.org/docs/lts/guides/performance/overview
[duckdb-4899]: https://github.com/duckdb/duckdb/discussions/4899
