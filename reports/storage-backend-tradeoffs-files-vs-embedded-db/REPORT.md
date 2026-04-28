---
title: "Storage backend tradeoffs: files vs embedded DBs vs in-memory + flush"
description: "3P factual landscape across 10 dimensions of 11 candidate backends — performance, durability, schema lifecycle, concurrency, ergonomics, distribution, query/relational, hierarchical, operational, append-only — for local-first / desktop / agent-runtime apps. No 1P recommendations."
date: 2026-04-23
sources:
  - "Per-dimension evidence files in `evidence/01..10` plus `evidence/11-duckdb-deep-dive.md`"
  - "DuckDB official docs (duckdb.org); DuckLake; Mother Duck blog"
  - "TOML 1.0 spec; Cargo manifest; PyPA pyproject; Terraform/OpenTofu HCL2; Helm + Kustomize docs"
  - "SQLite official docs (sqlite.org): wal.html, atomiccommit.html, lockingv3.html, howtocorrupt.html, lang_altertable.html, fts5.html, partialindex.html"
  - "PostgreSQL official docs: mvcc.html, listen/notify, sql-altertable.html, app-pgdump.html, pgcrypto"
  - "PGlite docs (pglite.dev): about, filesystems, api, multi-tab-worker"
  - "Drizzle ORM docs (orm.drizzle.team): migrations, drizzle-kit-{generate,migrate,push,pull}, transactions, sql, perf-queries"
  - "Bun SQLite reference (bun.com/docs/runtime/sqlite, bun.com/reference/bun/sqlite)"
  - "Turso/libSQL docs (docs.turso.tech, github.com/tursodatabase/libsql)"
  - "lowdb (github.com/typicode/lowdb)"
  - "electron-store (github.com/sindresorhus/electron-store) + conf"
  - "yaml@2 (eemeli.org/yaml, github.com/eemeli/yaml)"
  - "JSON Lines spec (jsonlines.org), NDJSON, JSONL.help"
  - "OpenTelemetry SemConv: db, db.sql, db.postgresql"
  - "Kafka log compaction (Confluent docs); Honeycomb engineering blog"
  - "Apple App Sandbox + Electron security docs"
  - "Confluent schema-evolution taxonomy; Protobuf best practices; Avro compat docs"
  - "ESLint flat config docs; Renovate config-presets; Prettier configuration; cosmiconfig"
  - "VS Code settings docs; git-config docs"
  - "Linear sync engine reverse-engineering (wzhudev, fujimon, marknotfound)"
  - "Notion engineering blog (sharding-postgres-at-notion)"
framing: 3P / external sources only
---

# Storage backend tradeoffs

## Executive summary

This report surveys eleven storage-shape candidates — **YAML files**, **JSON files**, **JSONL append-only files**, **better-sqlite3**, **bun:sqlite**, **libSQL** (embedded + server), **PGlite**, **Drizzle ORM** (over either SQLite or PGlite), **lowdb**, **electron-store**, and **DuckDB** — across ten dimensions: per-op performance, durability + crash safety, schema lifecycle, concurrent + multi-process access, human + agent ergonomics, distribution + footprint, query + relational capabilities, hierarchical + multi-scope semantics, operational concerns, and append-only patterns.

The candidates split into four families with sharply different cost/benefit profiles: **(a) text files** (YAML / JSON / JSONL) optimize for hand-edit, IDE intellisense, git-diff legibility, and zero install footprint at the cost of no native query/index/FK/transaction surface; **(b) row-oriented embedded SQL engines** (better-sqlite3, bun:sqlite, libSQL embedded, PGlite, Drizzle over either) optimize for query/index/transaction/multi-reader-single-writer semantics at the cost of binary on-disk format, native-binding distribution friction (or 3 MB+ WASM footprint), and the historical SQL-migration toolchain; **(c) typed JSON-blob wrappers** (lowdb, electron-store) add minor ergonomic conveniences over raw JSON files but inherit every JSON-file limitation while adding their own schema-version-bug history; **(d) embedded analytical / columnar** (DuckDB) inverts (b)'s profile — 1-2 orders of magnitude slower for indexed point lookups but 20-50× faster on million-row aggregations, with native ATTACH across SQLite + Postgres + MySQL + MotherDuck and Parquet integration. The differences across families are larger and better-documented than the differences within each family — the within-family differences are mostly ecosystem (Bun vs Node), distribution (WASM vs native), and operational tooling.

This report is **3P factual landscape only**. No backend is recommended for any specific use case; the consumer is expected to apply the matrix against their own workload and constraints. A 1P fit-matrix mapping each backend to the consumer's actual state surfaces lives in a separate follow-up.

---

## Scope, methodology, and stance

**Stance.** External 3P sources only. Confidence labels — CONFIRMED (multiple sources or upstream maintainer docs), INFERRED (single source or reasoned extrapolation), UNCERTAIN (sources disagree or are silent) — apply to every load-bearing claim and are preserved in the per-dimension evidence files.

**Backends evaluated.** Eleven in total:

| Backend | Family | Distribution shape |
|---|---|---|
| YAML files (`yaml@2` Document layer) | Text file | Pure JS, no native binding |
| JSON files (atomic-rename) | Text file | Built into runtime |
| JSONL append-only files | Text file | Built into runtime |
| better-sqlite3 | Row-oriented SQL (sync Node binding) | Native `.node` via `prebuild-install` |
| bun:sqlite | Row-oriented SQL (Bun built-in) | Built into Bun runtime |
| libSQL (`@libsql/client`, `@libsql/client-wasm`, `sqld` server) | Row-oriented SQL (Turso fork of SQLite) | Native or WASM (~5.5 MB) |
| PGlite (`@electric-sql/pglite`) | Row-oriented SQL (Postgres in WASM) | ~3 MB gzipped WASM |
| Drizzle ORM | Query layer (engine-agnostic) | Pure TS, ~7.4 KB minified+gzipped |
| lowdb | Typed JSON wrapper | Pure JS |
| electron-store | Typed JSON wrapper (Electron-targeted) | Pure JS, requires Electron 30+ |
| DuckDB | Embedded analytical / columnar | Native `.node` (`@duckdb/node-api`); WASM build (~6.4 MB site-headline / ~18 MB npm-aggregator) |

**Dimensions.** Ten clusters with one evidence file each:

| # | Cluster | Evidence file |
|---|---|---|
| 1 | Per-op performance | [`evidence/01-per-op-performance.md`](evidence/01-per-op-performance.md) |
| 2 | Durability + crash safety | [`evidence/02-durability-crash-safety.md`](evidence/02-durability-crash-safety.md) |
| 3 | Schema lifecycle | [`evidence/03-schema-lifecycle.md`](evidence/03-schema-lifecycle.md) |
| 4 | Concurrent + multi-process access | [`evidence/04-concurrent-multi-process.md`](evidence/04-concurrent-multi-process.md) |
| 5 | Human + agent ergonomics | [`evidence/05-human-agent-ergonomics.md`](evidence/05-human-agent-ergonomics.md) |
| 6 | Distribution + footprint + cross-platform | [`evidence/06-distribution-footprint.md`](evidence/06-distribution-footprint.md) |
| 7 | Query + relational capabilities | [`evidence/07-query-relational.md`](evidence/07-query-relational.md) |
| 8 | Hierarchical + multi-scope semantics | [`evidence/08-hierarchical-multi-scope.md`](evidence/08-hierarchical-multi-scope.md) |
| 9 | Operational concerns | [`evidence/09-operational-concerns.md`](evidence/09-operational-concerns.md) |
| 10 | Append-only patterns | [`evidence/10-append-only-patterns.md`](evidence/10-append-only-patterns.md) |
| — | DuckDB across all 10 dimensions (added 2026-04-26) | [`evidence/11-duckdb-deep-dive.md`](evidence/11-duckdb-deep-dive.md) |

**What's out of scope (but adjacent).** Hosted/server-side databases (RDS Postgres, PlanetScale, Supabase managed) — local-first focus. KV stores (Redis, etcd) — operationally heavy for desktop. Mobile-only stores (Realm, WatermelonDB) — out of scope for Electron+web. The OK-specific (1P) fit-matrix mapping each of OK's state surfaces (config, backlinks, telemetry, Y.Doc CRDT, etc.) to a recommended backend is deferred to a follow-up artifact, per the "research reports stay portable" framing.

---

## Headline findings

These are the highest-leverage observations across the dimension clusters. Every claim is sourced from at least one evidence file; see the per-dimension synthesis below for full citations.

1. **Atomic-write granularity is the sharpest split between text-file and SQL-family backends.** SQL engines provide single-row atomicity by default (SQLite autocommit, Postgres MVCC); JSON/YAML/lowdb/electron-store are whole-file-only — every "key update" rewrites the entire file. JSONL is the lone text-format with sub-file atomicity (single line, in a single-process `O_APPEND` write on Linux ≥ 3.14; Windows lacks a documented guarantee). Multi-step transaction support follows the same split. (Evidence: §2.)

2. **No published per-op benchmark covers all 10 backends under a single harness.** The closest is the SQG harness (better-sqlite3 vs node:sqlite vs libSQL JS-client vs Turso), with PGlite publishing only against wa-sqlite. lowdb and electron-store publish vendor-disclaimer wall thresholds (10–100 MB and 1 MB respectively) but no numbers. Cross-table comparisons are unsafe due to hardware divergence (MacBook 2014 → M2 → i9-12900K across the cited corpus). (Evidence: §1.)

3. **libSQL's JS client is dramatically slower than better-sqlite3 for local-file writes.** Issue [tursodatabase/libsql#1850](https://github.com/tursodatabase/libsql/issues/1850) reproduces a ~60–130× insert regression on local files, traced to the Rust core (#1458). The SQG harness shows ~20× slower indexed-lookups. The regression does not affect `sqld` server mode or Turso's hosted edge-replicated mode. (Evidence: §1, §4.)

4. **PGlite is single-process by Emscripten constraint, not by choice.** Programs compiled with Emscripten cannot fork; PGlite v0.4 added "connection multiplexing" but routes all logical connections through one engine. Multi-tab in browser requires the official multi-tab-worker pattern. Multi-OS-process is not supported. This is the largest concurrency restriction in the surveyed set. (Evidence: §4.)

5. **SQLite WAL mode is documented as unsafe over network filesystems.** SQLite's official corruption catalog and WAL docs both state WAL requires shared memory across processes on the same host, and that POSIX advisory locking is buggy on NFS. The same caution applies to syncing live SQLite files via Dropbox / iCloud Drive. JSON / YAML / JSONL files have no format-level locking restriction (text-file sync conflicts at the service layer still apply, but the format itself is sync-friendly). (Evidence: §2, §6.)

6. **Schema-migration tooling diverges sharply by family.** Drizzle (over SQLite or Postgres/PGlite) and Prisma both ship `generate → migrate` workflows with TS schema as source of truth and recorded executed-migrations tables. SQLite's `ALTER TABLE` has well-documented limitations (no DROP COLUMN with FK references; 12-step rebuild for column-type changes) that cascade to every SQLite-family backend. electron-store and conf ship a built-in migrations API but the maintainer disclaims support and there's a documented historical bug ([#108](https://github.com/sindresorhus/electron-store/issues/108)) where the package version was tracked instead of the application version. lowdb has shipped multiple library-API breaking changes that broke users' migration code. (Evidence: §3.)

7. **Comment preservation is a yaml@2-specific property in the surveyed set.** SQLite has no per-row COMMENT analog (only schema-level); Postgres has `COMMENT ON COLUMN` but no per-row; JSON/JSONL disallow comments. JSONC + `jsonc-parser` support comments but no library guarantees their preservation through programmatic mutation the way yaml@2's Document layer does. This is the single largest determining factor when "user-authored, hand-edited" is a hard requirement. (Evidence: §5.)

8. **`$schema`-driven IDE intellisense is mature and consistent across YAML and JSON.** The Red Hat `yaml-language-server` (used by VS Code's YAML extension and other LSP-compatible editors) supports JSON Schema drafts 04/07/2019-09/2020-12 via in-file modeline or editor-settings mapping. VS Code's JSON support is symmetric. Drizzle provides strong TS-typed query autocompletion at the code level — but a known performance issue exists when the schema is provided to the drizzle instantiation at scale (~40 tables → 8s IntelliSense delays per [drizzle-orm#800](https://github.com/drizzle-team/drizzle-orm/issues/800)). SQL-side completion via DataGrip/SQLTools requires a live DB connection. (Evidence: §5.)

9. **The agent/LLM ergonomics question is genuinely contested.** File-as-interface arguments (Anthropic Claude Skills, Arize, Towards Data Science memweave, Oracle developers blog) point to LLMs being trained on filesystem operations and SKILL.md-shaped artifacts. SQL-as-deterministic-substrate arguments (Arcade.dev, K2view text-to-SQL accuracy reviews, AImultiple text-to-SQL benchmarks) cite text-to-SQL accuracy degradation, JOIN-construction errors, and the safety guidance to never let an LLM generate arbitrary SQL. The synthesis position cited by multiple sources is **files-as-interface, DB-as-substrate** — but it's a synthesis, not a recommendation. (Evidence: §5.)

10. **Cross-machine sync via dotfiles / Git / Dropbox / iCloud splits the candidate list cleanly.** Text formats round-trip safely; SQLite / libSQL / PGlite are documented as **incompatible** with file-sync services for live databases (Zotero, GoToSocial, sqlite.org/howtocorrupt all confirm). The safe pattern for SQL-family is dump-then-sync, not sync-the-database-file. (Evidence: §6, §9.)

11. **Hierarchical multi-scope merge is uniformly app-defined for files.** No file format carries merge semantics — cosmiconfig, Prettier, dotenv, Vite, ESLint flat config, VS Code, git, Renovate all encode their own precedence and merge rules in app code. SQL backends can express "merged config" as a `(scope, key, value)` table + view, surfacing **provenance for free** via `SELECT scope, value WHERE key = ?`. The cost: SQLite views are read-only (writes target underlying tables); cross-DB joins via `ATTACH DATABASE` are capped at `SQLITE_LIMIT_ATTACHED` (default 10, max 125). (Evidence: §8.)

12. **Append-only is well-fitted for telemetry and audit, contested for derived state.** Kafka log compaction (key-based), Honeycomb sample-and-aggregate, Datadog tiered retention, OTLP push, Postgres INSERT-only + range partitioning all use the append-only shape for time-ordered, rarely-mutated, time-ranged-query workloads. CQRS / event sourcing as a hybrid (append-only log + mutable projection) is widely adopted but actively contested for whether it's worth the complexity outside narrow business domains; eventual-consistency UX is the recurring pain point. (Evidence: §10.)

13. **DuckDB inverts the row-oriented profile and adds heterogeneous `ATTACH`.** Per [evidence/11](evidence/11-duckdb-deep-dive.md), DuckDB is reported 1–2 orders of magnitude slower for indexed point lookups but 20–50× faster on million-row aggregations vs row-oriented SQLite-family backends. Its `ATTACH` is materially more capable than SQLite's: native + SQLite + Postgres + MySQL + MotherDuck targets all attach as schemas of one connection (single transaction still writes to one attached DB only). v1.4 LTS (Sept 2025) added AES-GCM-256 at-rest encryption + per-record WAL checksums. DuckLake (MIT-licensed Parquet + SQL catalog) is the team's open-format response to vendor lock-in. Cross-process **single-writer** rule is explicit and "unlikely to ever change" per maintainers — matching SQLite's serialization but not PGlite's single-process-by-design.

14. **TOML and HCL2 extend the cascade-divergence map without resolving it.** Per [evidence/08 §14](evidence/08-hierarchical-multi-scope.md), the same TOML format gets closer-wins discovery (Ruff, Cargo packages) and first-found-wins discovery (Black, Cargo workspace `[patch]`) across different tools. HCL2 / Terraform layers tfvars by alphabetical-loading order with `-var` last-wins. Helm uses map-deep-merge for nested values but list-replace-wholesale — a hybrid mode. Cursor MDC has Team > Project > User earlier-wins precedence at the rules-array level but closer-wins at the nested AGENTS.md level — two directions in one tool. Sources confirm that "closer-to-target wins" is **the dominant convention but not a universal one**; consumers must check per-tool. (Evidence: §8.)

---

## Per-dimension synthesis

Each subsection compresses the corresponding evidence file into 2–4 paragraphs of headline findings. For full citations, methodology, and contested-claim handling, follow the link to the evidence file.

### 1. Per-op performance — [evidence/01](evidence/01-per-op-performance.md)

The headline number for SQLite-family bindings is the SQG harness ([sqg.dev](https://sqg.dev/blog/sqlite-driver-benchmark/)): on i9-12900K, Linux x64, Node v25.3.0, indexed point lookups land at ~1.22M ops/sec for better-sqlite3, ~1.07M for node:sqlite (Node 22+ built-in), ~707K for Turso (HTTP local), and ~61K for libSQL JS client — a ~20× spread within the SQLite-driver family alone, before considering cross-family options. Single-row INSERT is similarly ordered (better-sqlite3 ~53K, libSQL ~28K, Turso edges ahead at 63K). PGlite's published per-op numbers come from its own harness against wa-sqlite (M2 MacBook Air, in-memory mode): single-row insert 0.058 ms, single-row select 0.088 ms; the IDB-persistence variant is 200–400× slower per op due to per-write IndexedDB flush. wa-sqlite outperforms PGlite for in-memory CRUD per the PGlite team's own publication.

bun:sqlite's vendor benchmark ("3-6× faster than better-sqlite3 for read queries") is methodology-disputed: the test uses `SELECT *` which measures JS-engine row-conversion speed (JavaScriptCore vs V8), not SQLite engine throughput. Issue [oven-sh/bun#4776](https://github.com/oven-sh/bun/issues/4776) shows that on queries that spend time inside SQLite rather than in row conversion, better-sqlite3 outperforms. Both numbers are reported with their conditions disclosed. For full-text search, SQLite FTS5 lands at sub-6 ms on production site-search ([SQLite-AI](https://blog.sqlite.ai/real-time-full-text-site-search-with-sqlite-fts5-extension)) and 140 ms on a 1M-record dataset; ripgrep scans the Linux kernel source (~75K files) at 0.349 s. No FTS5-specific head-to-head with ripgrep on the same corpus is published, but the architectural shape (inverted-index vs scan) is well-documented: head-to-head benchmarks of trigram/sparse-n-gram inverted indexes vs ripgrep on the same corpus + query show the inverted index winning by 1.6×–2,700× on warm-cache query latency, with build cost amortized after roughly 10 queries (evidence/01 §5).

For text-file backends, the salient numbers are **wall thresholds rather than per-op latencies**: yaml@2 takes 6,900 ms to parse a 14k-line file with anchors (vs 50 ms for js-yaml on the same file); standard JSON parsers throughput-bound at 50–100 MB/s; lowdb's vendor warns at 10–100 MB; electron-store's at 1 MB (whole-file rewrite per `set()`).

**DuckDB inverts the row-oriented profile.** Per [evidence/11](evidence/11-duckdb-deep-dive.md), DuckDB is reported 1–2 orders of magnitude slower than SQLite for indexed point lookups, but 20–50× faster on million-row aggregations — the columnar trade-off. Parquet scan throughput is the canonical sweet-spot workload. One published time-series benchmark reports DuckDB ~10× slower than SQLite for narrow-time-window selects, illustrating that "embedded analytical" doesn't mean "always faster". The wall is OLAP-shaped: aggregations win, point lookups lose.

### 2. Durability + crash safety — [evidence/02](evidence/02-durability-crash-safety.md)

The smallest atomic unit per backend is the cleanest summary: **single row** for SQL engines (SQLite autocommit per statement, Postgres autocommit, libSQL inherited, Drizzle inherited, PGlite inherited); **single line** for JSONL within a single-process `O_APPEND` write; **whole file** for JSON, YAML, lowdb, electron-store. Multi-step transactions are first-class for SQL families (`BEGIN/COMMIT/ROLLBACK`, multi-database via SQLite `ATTACH DATABASE` + super-journal); whole-file rewrite for the JSON-derived family.

The fsync story is more subtle than it appears. SQLite's documented default is `synchronous=FULL`, but many wrapper bindings — notably better-sqlite3 — compile with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, which downgrades WAL mode to `NORMAL` (sync at checkpoint, not commit). Multiple commentators ([avi.im](https://avi.im/blag/2025/sqlite-fsync/), [agwa.name](https://www.agwa.name/blog/post/sqlite_durability)) argue this creates a documentation/reality gap where the same SQLite version provides different durability depending on which binary you loaded. Postgres's `synchronous_commit=on` is the default and well-documented; `=off` is per-transaction overridable. PGlite's `relaxedDurability: true` defers IndexedDB flush asynchronously.

Crash recovery is automatic in every cited engine (SQLite hot-journal or WAL replay; Postgres WAL replay; atomic-rename leaves the original file intact). Repair tooling exists for SQLite (`sqlite3 .recover` rebuilds from page-level scan) and Postgres (`pg_resetwal` as last resort, with mandatory dump+reload after). PGlite docs do not document a separate repair tool. Backup is the same family-level split: SQLite's `VACUUM INTO`, Online Backup API, and `db.serialize()` all produce live-DB-safe single-file backups; `pg_dump` is live-safe and cross-version portable; PGlite's `dumpDataDir()` produces a Postgres-incompatible tarball that only PGlite can re-import (sharply different from `pg_dump`'s portability story).

### 3. Schema lifecycle — [evidence/03](evidence/03-schema-lifecycle.md)

Schema definition splits into TypeScript-first (Drizzle, Zod-validated files, Verzod), SQL-first (raw `CREATE TABLE` with `@blackglory/better-sqlite3-migrations` or `bun-sqlite-migrations`), JSON Schema for files (electron-store with ajv under the hood), no-schema (lowdb), and YAML files paired with a separate validator. Drizzle and Prisma both converge on TS-as-source-of-truth with a `generate → migrate` workflow plus a "skip migration files for prototyping" flag (`push` / `db push`). Pulling in the other direction, Drizzle's `pull` introspects an existing DB into a `schema.ts` for the database-first workflow.

SQLite's documented `ALTER TABLE` limitations cascade to every SQLite-family backend: no `DROP COLUMN` if FK/CHECK references the column; the 12-step rebuild for column-type changes; `ADD COLUMN` with `NOT NULL` requires a non-NULL default. Postgres ≥ 11 makes `ADD COLUMN` with a non-volatile default constant-time (default stored in metadata). PGlite ships drizzle-kit support, but the in-browser migration flow requires a community shim — `drizzle-orm/pglite/migrator` uses Node APIs not available in the browser ([Drizzle discussion #2532](https://github.com/drizzle-team/drizzle-orm/discussions/2532)).

The compat-window taxonomy (BACKWARD / FORWARD / FULL / TRANSITIVE) comes from streaming-system literature (Avro, Protobuf, Confluent) and is not formalized on the file-DB side. electron-store / conf migrations are forward-only with no documented `down`. lowdb has shipped multiple library-API breaking changes (`db.defaults()` removal, `JSONFile` import-path split, `JSONPreset` → `JSONFilePreset` rename) that broke users' migration code. JSONL handles schema evolution by per-envelope versioning (`{ v: 1, ... }`) — older lines never rewrite, readers branch on `v`.

### 4. Concurrent + multi-process access — [evidence/04](evidence/04-concurrent-multi-process.md)

Three engine families with fundamentally different concurrency models. SQLite-derivatives (better-sqlite3, bun:sqlite, libSQL embedded) all converge on **multi-reader / single-writer** with WAL + on-disk `-shm` mmap'd by every process on the same host; multi-writer requires SQLite's experimental `BEGIN CONCURRENT` branch (not in default distributions) or Turso's "concurrent writes" feature (still flagged experimental). PGlite is **single-process-only** by Emscripten constraint — it cannot fork; v0.4's "connection multiplexing" routes multiple logical connections through one engine. Postgres-via-Drizzle is full MVCC with `LISTEN` / `NOTIFY` for cross-process push.

File-locking primitives split cleanly by platform: POSIX `fcntl(F_SETLK)` advisory + BSD `flock()` advisory on Linux/macOS; Windows `LockFileEx` mandatory. SQLite uses `fcntl()` on Unix and `LockFile`/`LockFileEx` on Windows. The `proper-lockfile` library uses a `mkdir`-based strategy that works on NFS (where `O_EXCL` is broken). Atomic-rename (write-tmp → rename) is the default for `write-file-atomic`, electron-store, conf, and lowdb's JSONFile adapter — but it provides directory-entry atomicity only, not coordination, so two writers can both compute new content from the old file and race on rename (last-write-wins).

`O_APPEND` semantics for JSONL: Linux ≥ 3.14 + ext4 atomically appends per `write()` < `PIPE_BUF` (CONFIRMED by Linux kernel mailing list). Windows + NTFS does not guarantee POSIX append atomicity ([Python bug 42606](https://bugs.python.org/issue42606)). macOS APFS is reportedly safe but undocumented. electron-store has a load-bearing limitation: `watch:true` cross-process file change detection only fires callbacks **in the process that registered the listener** ([electron-store#165](https://github.com/sindresorhus/electron-store/issues/165)). lowdb's documented contract is single-process-single-instance — concurrent processes lose updates ([lowdb#478](https://github.com/typicode/lowdb/issues/478), [#133](https://github.com/typicode/lowdb/issues/133)).

**DuckDB's concurrency model.** Per [evidence/11](evidence/11-duckdb-deep-dive.md), DuckDB enforces a strict cross-process single-writer rule that maintainers describe as "unlikely to ever change". This matches SQLite's serialization semantics but contrasts with PGlite's single-process-by-Emscripten-design. Multi-reader access works; multi-writer does not.

### 5. Human + agent ergonomics — [evidence/05](evidence/05-human-agent-ergonomics.md)

Hand-editability splits cleanly by family: text formats are openable in any editor; SQLite/libSQL/PGlite produce binary files requiring `sqlite3` CLI / DB Browser / DBeaver / TablePlus / `litecli` / Drizzle Studio / `psql` (which does NOT connect to PGlite — PGlite is in-process WASM). The yaml@2 Document layer uniquely preserves comments through programmatic round-trip; SQLite has no per-row COMMENT analog; Postgres has `COMMENT ON COLUMN` for schema-level only. JSONC supports comments via `jsonc-parser` (Microsoft's parser used by VS Code for `settings.json`), but no library guarantees preservation through arbitrary mutation.

`$schema`-driven IDE intellisense is mature for YAML (Red Hat `yaml-language-server`, supports modeline + `yaml.schemas` mapping; JSON Schema drafts 04/07/2019-09/2020-12) and JSON (VS Code native, `$schema` in-file or `json.schemas` mapping). Drizzle's TS-typed queries autocomplete column names, types, methods, and detect compile-time errors on schema changes — but performance degrades at scale (~40 tables → 8s IntelliSense delays per [drizzle-orm#800](https://github.com/drizzle-team/drizzle-orm/issues/800)). SQL completion via DataGrip/SQLTools requires a live DB connection.

Patch semantics: yaml@2 Document layer exposes `setIn(path, value)` / `addIn` / `deleteIn` with comment preservation; JSON Patch (RFC 6902) and JSON Merge Patch (RFC 7396) are the standardized patch formats for JSON; SQL `UPDATE table SET col = value WHERE predicate` is the canonical partial update for SQL backends. The agent/LLM ergonomics debate is genuinely contested and reported on both sides without flattening: file-as-interface arguments (Anthropic Claude Skills, Arize, Towards Data Science memweave) point to LLM training distribution; SQL-as-deterministic arguments (Arcade.dev safety guidance, K2view text-to-SQL accuracy reviews) cite text-to-SQL JOIN-construction errors and the recommendation never to let an LLM generate arbitrary SQL. The synthesis position cited by Oracle and Arize is **files-as-interface, DB-as-substrate** — but it's a third-party synthesis, not a recommendation in this report.

Schema-driven UI rendering is well-trodden for JSON Schema → form (react-jsonschema-form, JSON Forms, Uniforms, Formily, FormEngine, Form.io). The same libraries can target YAML via YAML→JSON conversion. SQL → form is less standardized; ORM-specific (Django Admin, Rails ActiveAdmin, react-admin); Drizzle Studio is for inspection but doesn't generate end-user forms.

### 6. Distribution + footprint + cross-platform — [evidence/06](evidence/06-distribution-footprint.md)

Install sizes (where surfaced): better-sqlite3 10.3 MB install / 11 MB unpacked (includes prebuilt `.node` for the host tuple); `@libsql/client-wasm` ~5.53 MB; PGlite ~3 MB gzipped headline / ~3.7 MB per npm aggregator (with documented growth across versions, [pglite#477](https://github.com/electric-sql/pglite/issues/477)); Drizzle ORM ~7.4 KB minified+gzipped, zero deps, tree-shakeable. yaml@2, lowdb, electron-store are pure JS (exact unpacked sizes UNCERTAIN). bun:sqlite is built into Bun (zero added install).

Native binding distribution adds three concrete frictions for Electron deployments: (a) `electron-rebuild` requirement on Node ABI mismatch (`NODE_MODULE_VERSION` errors); (b) per-platform prebuilds + source-build fallback (`prebuild-install || node-gyp rebuild`); (c) per-`.node` code-signing on macOS — `electron-builder` must sign each native binary inside the unpacked-from-asar directory or you see "code signature not valid for use in process" on Apple Silicon. WASM (PGlite, `@libsql/client-wasm`) avoids all three but pays a 3–5.5 MB download cost and may require a Worker thread for the engine.

Cross-platform locking quirks: Windows `MAX_PATH` is 260 chars (opt-out via registry + manifest); Win32 `LockFileEx` is mandatory while POSIX `fcntl` is advisory; `flock(2)` on Linux/macOS is the BSD primitive; SQLite over NFS is officially unsupported (WAL needs shared memory across host processes). For text-file sync via Dropbox/iCloud Drive, all three text formats round-trip safely; SQLite is documented as incompatible (Zotero, GoToSocial, sqlite.org/howtocorrupt all warn). Git-friendliness: text formats give line-by-line diffs and merge conflicts; SQLite needs `textconv` filters or `git-sqlite` for diff (no first-class merge). Bun support: bun:sqlite is Bun-only; better-sqlite3 has no plans for Bun support; libSQL and PGlite work everywhere.

**DuckDB distribution shape** (per [evidence/11](evidence/11-duckdb-deep-dive.md)): native binding via `@duckdb/node-api`; WASM build (`@duckdb/duckdb-wasm`) at ~6.4 MB site-headline / ~18 MB per npm aggregator (size disagreement preserved). Same `electron-rebuild` + signing concerns as better-sqlite3 for the native path; same WASM tradeoffs as PGlite for the WASM path. DuckDB v1.4 LTS (Sept 2025) added per-record WAL checksums and AES-GCM-256 encryption — recent enough that older surveys may not reflect them.

### 7. Query + relational capabilities — [evidence/07](evidence/07-query-relational.md)

The capability cliff is sharp. SQL backends (better-sqlite3, bun:sqlite, libSQL, PGlite, Drizzle) all check every box natively: filter, sort, aggregate, joins, foreign keys (with `PRAGMA foreign_keys = ON` per-connection on SQLite — a documented foot-gun across SQLAlchemy / EF Core / SQLite forum threads), unique constraints (composite + named), CHECK constraints, triggers, partial indexes (`CREATE INDEX … WHERE`), expression indexes (`CREATE INDEX … ON tbl(json_extract(data, '$.draft'))`), CTEs (recursive + non-recursive), window functions (11 built-ins in SQLite alone), and full-text search (FTS5 for SQLite; tsvector + pg_trgm for PGlite). File backends + lowdb + electron-store check **zero** — every capability is "via application code" or "external library required" (Lunr / Fuse / FlexSearch / MiniSearch for FTS).

JSON inside SQL blurs the line. SQLite's JSON1 extension (built-in since 3.38.0, 2022) plus expression indexes on `json_extract` give document-shaped storage with index support. Postgres JSONB + GIN indexes (`jsonb_ops` 60–80% of table size; `jsonb_path_ops` 20–30%) provide the same with richer operator coverage. SQL backends can store JSON-shaped data while keeping query / index / FK / FTS surfaces — the choice is rarely "documents OR rows" anymore.

When SQL pays off is debated across sources without a single threshold. DoltHub reports 18 GB JSON consolidates to 4.8 GB SQLite. PL-Rants frames the qualitative trigger as "when full-file writes become a latency problem" or "when the file no longer fits in RAM". Notion ran on a single Postgres from 2015–2020 before sharding to 32 (then 96) instances at "tens of billions of blocks" — high-end signal that document-shaped data still benefits from SQL when the query surface is broad. Linear's local-first sync engine uses SQLite on the client. Counter-cases (HN: "JSON has replaced SQLite, with a large reduction in code and complexity") apply to small, document-shaped, no-ad-hoc-query workloads. The aggregate consensus: SQL pays off when (a) data outgrows RAM, (b) ad-hoc queries are needed, (c) joins/referential integrity are needed, (d) partial updates without rewriting the whole file are needed.

### 8. Hierarchical + multi-scope semantics — [evidence/08](evidence/08-hierarchical-multi-scope.md)

For file-based configs the resolution algorithm is always app-defined — no file format carries merge semantics. The dominant convention is "more-specific wins" (git: system → global → local; VS Code: User → Workspace; Vite: `.env` → `.env.local`; Renovate: presets → repo). Two divergences exist: Ruby's `dotenv` and `dotenvx` use **first-declared-wins** (callers control precedence by argument order, not file location); Cursor uses **earlier-source-wins** for Team > Project > User. The cascade direction is therefore not safely assumed.

Cascade semantics also diverge sharply. VS Code uses **type-aware merge** (primitives + arrays replace; objects deep-merge). Prettier uses **whole-object replace at the file boundary** — searches up the directory tree, takes the first found, no cross-file merge. Renovate uses **per-option mergeability** (some arrays merge, others replace, declared in Renovate's schema). ESLint flat config uses **flat-array cascade** (top-to-bottom, later wins on glob overlap). Mintlify uses `$ref` for include-by-reference (organization, not precedence). Lodash `_.merge()` has the documented foot-gun that arrays merge by index, not concatenation.

SQL backends can express "merged config" as a `(scope, key, value)` table + view (read-only in SQLite) or `MATERIALIZED VIEW` (Postgres). Multi-file SQL via `ATTACH DATABASE` (SQLite, libSQL embedded) — capped at `SQLITE_LIMIT_ATTACHED` (default 10, max 125), atomicity restricted unless main DB ≠ `:memory:` and journal_mode ≠ WAL. PGlite uses Postgres's `search_path` for schema lookup. libSQL server uses **namespaces** (each gets its own DB file with independent config). DuckDB's `ATTACH` is materially more capable: native + SQLite + Postgres + MySQL + MotherDuck targets all attach as schemas of one connection ([evidence/11](evidence/11-duckdb-deep-dive.md)) — one DuckDB process can query across heterogeneous engines, though a single transaction can write to only one attached DB at a time. Provenance debugging is materially easier with SQL: `SELECT scope, value FROM config_kv WHERE key = ?` returns every contributor; for files, `git config --show-origin --show-scope` is the gold-standard external tool, plus VS Code's per-setting badge UI — most ecosystems leave provenance to the caller.

**TOML and HCL2 extend the file-format cascade landscape** (per [evidence/08 §14](evidence/08-hierarchical-multi-scope.md), added 2026-04-26). TOML's adoption profile is split: Cargo's `[workspace]` + `workspace = true` inheritance is well-formalized, but `[patch]`, `[replace]`, and `[profile.*]` are root-only — inverting Cargo's default closer-wins direction. Ruff (Python lint) uses closer-wins discovery while Black (same Python ecosystem, same TOML format) uses first-found-wins per [psf/black#2863](https://github.com/psf/black/issues/2863) — a tool-level divergence on the same format. HCL2 (Terraform/OpenTofu) layers `terraform.tfvars` + `*.auto.tfvars` (alphabetical loading) + CLI `-var`/`-var-file` (last-wins). Helm composes `values.yaml` (chart default) + `-f` overrides (multiple, later wins) + `--set` (highest precedence) with map-deep-merge but **list-replace-wholesale** semantics. Kustomize's `base + overlays` model uses strategic-merge by default (with per-field hints) and JSON-patch as the explicit fallback. The cascade-direction divergence and merge-semantics divergence visible in the original §8 set are not flattened by these additions — they're amplified.

### 9. Operational concerns — [evidence/09](evidence/09-operational-concerns.md)

Test isolation is well-supported across the set: SQLite-family `:memory:` per connection; PGlite `memory://` default filesystem; lowdb `Memory` / `MemorySync` adapters (auto-substituted when `NODE_ENV=test` for `JSONPreset`); electron-store per-instance via `name` + `cwd`; file-based via `mock-fs` / `memfs` / fresh tmpdir per test. OpenTelemetry semantic conventions cover SQL DBs (`db.system.name`, `db.statement`, `db.namespace`, `db.operation.name`, `db.client.operation.duration`); a community auto-instrumentation package exists for better-sqlite3 (`opentelemetry-plugin-better-sqlite3`); bun:sqlite, libSQL, and PGlite OTel auto-instrumentation status is UNCERTAIN. Drizzle has a built-in pluggable logger (no first-party OTel; tracked in [issue #371](https://github.com/drizzle-team/drizzle-orm/issues/371)).

Encryption at rest: SQLCipher (Zetetic) for full-DB AES-256, with multiple Node forks (`better-sqlite3-multiple-ciphers`, `better-sqlcipher`, `node-sqlcipher`); SQLite3 Multiple Ciphers extension recommends ChaCha20-Poly1305 over SQLCipher's AES; libSQL ships first-party encryption (Turso). Postgres `pgcrypto` provides column-level `pgp_sym_encrypt`/`pgp_sym_decrypt` (default AES-128; supports up to AES-256). PGlite ships pgcrypto in its curated extension set; persisted IndexedDB has no documented at-rest encryption layer in PGlite itself. electron-store's built-in `encryptionKey` defaults to `aes-256-cbc` (no tamper detection) — `aes-256-gcm` is the AEAD option but the documented limitation is that "encryption is used purely for obscurity" because the key is commonly hardcoded in the app. OS-level FileVault / BitLocker / FDE applies to all backends transparently.

Snapshot / point-in-time-restore: SQLite Online Backup API + `VACUUM INTO` + `serialize()` give live-DB-safe snapshots; Turso/libSQL ships **branching + timestamp-based PITR** (24h Starter, 30 days Scaler, custom Enterprise); Postgres `pg_dump` is live-non-blocking and cross-version portable; PGlite's `dumpDataDir()` is PGlite-only re-importable. Live migrations: SQLite uses `PRAGMA user_version` + transactional DDL; Postgres supports DDL inside transactions on most operations; electron-store's `migrations` map runs handlers on first read after a version bump (no atomicity guarantee across handlers); file backends use read-old-write-new with atomic rename.

### 10. Append-only patterns — [evidence/10](evidence/10-append-only-patterns.md)

JSONL (= NDJSON = LDJSON) is the canonical append-only on-disk format. Lines are independent JSON, separated by `\n`/`\r\n`, UTF-8. New records append bytes (no whole-file rewrite); the file is streamable without loading into memory. Concurrent-append safety depends on `O_APPEND` semantics — Linux ≥ 3.14 + ext4 atomic for `write()` < `PIPE_BUF`; Windows lacks a documented guarantee; macOS APFS undocumented. Node's `fs.appendFile` is **not** automatically equivalent to a single-syscall `O_APPEND` write — multi-process JSONL writers should use either single-syscall `O_APPEND` + locking, or write-tmp-rename. Documented corruption reports include `claude.json` and JSONL session files in the Claude Code repo itself.

Telemetry / time-series workloads strongly favor append-only because writes are time-ordered, records are rarely mutated, and queries are aggregation-dominated. Honeycomb stores raw events ("every field intact, run aggregation at query time") and uses Refinery for deterministic-on-trace-ID dynamic sampling. Datadog uses a tiered model (hot 0–30 days, warm 31–180, Flex Frozen 7+ years) with rehydration on demand. OTLP wraps batches in protobuf and ships gRPC unary or HTTP POST. Pino emits NDJSON by default. Apache Kafka offers two retention policies — time/size-based deletion **or** **log compaction** (key-based retention via tombstones); the two are alternatives, not stacked.

Hybrid patterns are widely adopted but contested: event sourcing + materialized projection (Linear's `SyncAction` model is the canonical local-first example, with snapshot strategies bounding replay cost); CDC inverts the relationship (mutable DB is source of truth, transaction log is exposed downstream — Debezium argues this is "usually a better alternative to event sourcing"); WAL-as-internal-log is the storage-layer hybrid both Postgres and SQLite use. The contested claim across multiple sources is whether event sourcing's complexity is justified outside narrow business domains; eventual-consistency UX bugs are the recurring pain point. Cardinality bounds: SQLite append-only INSERT can hit 635M rows/min on unindexed tables (avi.im benchmark); time-series cardinality "walls" come from index footprint rather than absolute size; "compaction storms" are a documented failure mode for time-series LSM systems.

---

## Cross-cutting observations

These are patterns that emerged in multiple dimensions and are worth naming once at the report level.

**(a) "Same engine, different binding" matters less than the binding choice suggests.** better-sqlite3, bun:sqlite, and libSQL embedded all ship the same upstream SQLite engine — locking, atomicity, FTS5, JSON1, ALTER TABLE limitations are inherited identically. The differences are operational (Bun runtime vs Node, native vs WASM, prebuilt vs compile, vendor support model) and ecosystem (Drizzle compatibility, Turso platform features). Within-family substitution is generally low-cost; cross-family substitution (SQLite ↔ Postgres) requires schema translation but Drizzle's TS-typed schemas mitigate that significantly.

**(b) The "TS schema as source of truth" pattern is converging.** Drizzle and Prisma both ship TS-DSL schemas + drizzle-kit/prisma-migrate, both expose `push`/`db push` for prototyping vs `migrate` for production, both record executed migrations in dedicated tables. Zod-validated YAML/JSON files via libraries like `zod-config` and `zod-file` extend the same TS-as-truth pattern to file backends. Verzod adds versioned-entity migrations on top of Zod. The pattern is now near-universal in the TS ecosystem; the remaining divergence is whether to commit the migration files (Drizzle/Prisma docs both say yes; community articles split between push-everywhere-in-dev and always-generate).

**(c) Provenance is rare but high-value.** `git config --show-origin --show-scope` and VS Code's per-setting Workspace/User badges are the gold standard for "why is this value X?" debugging. Most ecosystems leave provenance to the caller. SQL-backed `(scope, key, value)` schemas surface provenance for free via `SELECT scope, value WHERE key = ?`. JSONL also gives strong provenance (every value's origin line/timestamp is in the log by construction).

**(d) Multi-process coordination is the structurally weakest link.** Across the surveyed set, only Postgres MVCC + LISTEN/NOTIFY (and by inheritance, Drizzle-on-Postgres) supports true multi-writer with cross-process push notification. SQLite-family is multi-reader / single-writer. PGlite is single-process. lowdb and electron-store are single-process. JSON / YAML / JSONL coordinate via app-level locks (`proper-lockfile`, `os-lock`, atomic-rename, single-process-with-queue). For desktop apps with one main process plus N renderers, this is rarely binding; for server-side or multi-CLI scenarios it's a major axis.

**(e) The append-only family rewards workload alignment, punishes mismatch.** JSONL plus a writer that respects `O_APPEND` semantics is among the cheapest, most robust, most observable storage primitives for telemetry / audit / event-log workloads. The same primitive applied to small mutable state (config, derived index, current-user-state) is a documented anti-pattern — every mutation writes a new line, current state requires folding the whole log, and log compaction becomes load-bearing. The split is inherent to the shape, not a property of any particular implementation.

**(f) Two distinct families of "comment preservation" exist.** yaml@2 Document layer is the only library in the surveyed set that preserves comments through arbitrary programmatic mutation. JSONC + `jsonc-parser` preserves comment positions on parse but no library guarantees preservation through `setIn`-style mutations. SQLite/Postgres support schema-level COMMENT but no per-row analog. This is a stronger differentiator than IDE intellisense (which is broadly mature for both YAML and JSON) when the use case is "user-authored, hand-edited" config that the storage layer should round-trip without erasing the user's annotations.

**(g) The candidate set is shaped by Bun-vs-Node ecosystem choice.** bun:sqlite is Bun-only; better-sqlite3 has no Bun support and no plans for it; libSQL works in both. Drizzle works everywhere. PGlite works everywhere. lowdb / electron-store / yaml / JSON / JSONL work everywhere. For projects standardizing on Bun, the SQLite-family choice is bun:sqlite vs libSQL vs PGlite (no better-sqlite3); for projects mixed or Node-only, the choice broadens.

---

## Unresolved / Adjacent / Inaccessible

Per the worldmodel skill's incompleteness taxonomy, these are gaps and adjacent threads from the surveyed material.

### UNRESOLVED — found it, couldn't get sharp

- **Direct ripgrep-vs-FTS5 head-to-head benchmark with the same corpus + same query.** Still not found in the surveyed sources after a focused 2026-04-26 follow-up pass. What the follow-up did surface — and is now in evidence/01 §5 sub-section "Inverted-index vs scan-based head-to-head" — is a 14-row cluster of direct **inverted-index-vs-ripgrep** benchmarks ([codedb on Cloudflare-docs 1.6 GB](https://curtis-arch.github.io/ai-search-benchmarks/), [ngi on Linux kernel 92,916 files](https://github.com/erogol/ngi), [trigrep on git.git](https://github.com/PythonicNinja/trigrep), [Cursor Instant Grep](https://cursor.com/blog/fast-regex-search), [Sourcegraph zoekt](https://github.com/sourcegraph/zoekt/blob/main/doc/faq.md), [livegrep](https://github.com/livegrep/livegrep), [Russ Cox codesearch](https://swtch.com/~rsc/regexp/regexp4.html)) showing inverted-index search beats ripgrep by 1.6×–2,700× on warm-cache query latency at corpus scales from 20 files to 1M+ files, with build cost amortized after roughly 10 queries. FTS5 transfers from these benchmarks by INFERENCE — it is structurally an inverted index — but the exact FTS5 number on a code-search-shaped corpus remains unmeasured. The architectural conclusion is now CONFIRMED via proxy; the FTS5-specific number is the remaining gap.
- **Quantitative cardinality wall for lowdb / electron-store.** Vendors disclaim qualitatively (lowdb "10-100MB", electron-store "1MB+ may be slow") but no benchmark publishes the actual transition point. Searched npm aggregators, community blogs, and GitHub issues; only vendor-disclaimer language surfaced.
- **bun:sqlite OTel auto-instrumentation status.** A community auto-instrumentation package exists for better-sqlite3 ([opentelemetry-plugin-better-sqlite3](https://www.npmjs.com/package/opentelemetry-plugin-better-sqlite3)). No equivalent surfaced for bun:sqlite. UNCERTAIN whether one exists outside the surveyed sources or whether the Bun runtime needs custom instrumentation for the JSC binding.
- **PGlite v0.4 "connection multiplexing" coverage.** The Electric SQL announcement frames it as connection multiplexing but doesn't explicitly state whether it covers multi-OS-process or only multi-connection-from-one-process. The single-process-by-Emscripten constraint suggests the latter, but no primary-doc confirmation surfaced.
- **macOS APFS `O_APPEND` atomicity.** Linux 3.14+ + ext4 is CONFIRMED atomic per `write()` < `PIPE_BUF`. Windows + NTFS lacks the guarantee per Python bug 42606. macOS APFS is reportedly safe per Linux kernel mailing list discussion but undocumented. Would need a primary-doc check on Apple's filesystem reference.
- **Drizzle nested transaction limitations on better-sqlite3.** Issue [drizzle-orm#1170](https://github.com/drizzle-team/drizzle-orm/discussions/1170) reports `TransactionRollbackError` for some nested-transaction scenarios; whether this is fully resolved in current Drizzle versions is UNCERTAIN.
- **`write-file-atomic` directory-fsync coverage.** Issue [npm/write-file-atomic#64](https://github.com/npm/write-file-atomic/issues/64) discusses POSIX guidance that durable rename requires `fsync` of the containing directory after the rename. Whether this happens in current `write-file-atomic` releases by default is not clearly documented in the README. Would need a source-code read.
- **PGlite repair tooling.** PGlite docs do not document `pg_resetwal` or other Postgres repair tools. UNCERTAIN whether these are exposed in the WASM build or how a corrupted PGlite data directory is recovered beyond Postgres's own WAL replay.

### ADJACENT — connected threads outside topic scope

- **CRDT-based stores (Y.js, Automerge, Loro).** OK already uses Y.js for CRDT collaboration. Not surveyed because the question is about state storage backends, not collaboration substrate. Relevant to the consumer's 1P fit-matrix decision for CRDT-shaped state.
- **Vector / embeddings stores (sqlite-vec, vectorlite, PGlite + pgvector).** Touched in §1 (FTS5 sub-section) via the search-engine-related internal report cross-references. Out of scope for the storage-shape question; would matter for a separate "do we want semantic search" decision.
- **TOML config (Cargo, pyproject.toml).** Not in the candidate set; precedence semantics likely similar to YAML/JSON but the format adds different ergonomics. Adjacent to §8 (hierarchical multi-scope).
- **Kubernetes ConfigMap layering / Helm values cascade / HashiCorp HCL2.** Adjacent to §8; would extend the multi-scope adoption table if the consumer's deployment model includes K8s.
- **XDG Base Directory Specification details.** Adjacent to §6 (cross-platform conventions for `~/.config/`, `~/.local/state/`).
- **Kafka, EventStoreDB, Pulsar as primary stores.** Touched in §10 as adoption examples; not surveyed as candidate backends for desktop / local-first apps because they are operationally heavy.
- **CRDT-as-storage (Y.Doc persistence to disk via y-leveldb / y-sqlite).** Adjacent to OK's existing Y.Doc + markdown persistence; not in the candidate set because the question is about non-CRDT state.
- **Filesystem snapshots (APFS, btrfs, ZFS) as a snapshot primitive.** Touched in §9; orthogonal to the backend choice — applies to all file-based backends and to SQLite databases.

### INACCESSIBLE — can't reach the source

- **Linear's actual production sync-engine code.** Reverse-engineering writeups exist (wzhudev, fujimon, marknotfound) and Linear's CTO has endorsed the most thorough one. The actual implementation is closed-source. Surveyed sources document the SyncAction model but not the storage implementation details.
- **Notion's Postgres sharding internals.** Notion's engineering blog documents the high-level architecture (32 → 96 instances over time, doubling rate, partitioning strategy). The full schema, indexing strategy, and query patterns are not public.
- **Honeycomb's columnar storage internals.** Honeycomb's blog documents the event-shape and Refinery sampler. The columnar storage engine is proprietary; the only publicly-discussed details are the high-level architecture.
- **PGlite source-code-level Emscripten constraints.** Surveyed via PGlite docs and Electric SQL blog; the deep Emscripten compilation constraints would require reading the PGlite build pipeline to fully characterize. Not pursued.

---

## Confidence summary

**CONFIRMED** (multiple independent third-party sources or upstream maintainer docs):
- SQLite WAL semantics, locking ladder, hot-journal recovery, FTS5, JSON1, ALTER TABLE limitations, partial + expression indexes, foreign-key PRAGMA gotcha
- Postgres MVCC, LISTEN/NOTIFY mechanics, pgcrypto cipher options, pg_dump portability, ALTER TABLE constant-time defaults since v11
- PGlite single-process Emscripten constraint, multi-tab worker requirement, IndexedDB-flush durability tradeoffs, dumpDataDir non-portability to stock Postgres
- libSQL JS-client write regression vs better-sqlite3 (~60-130×); SQG harness numbers for indexed lookups across better-sqlite3, node:sqlite, libSQL, Turso
- Drizzle generate/migrate/push/pull workflow; Prisma migrate dev/deploy/db push; electron-store migrations API + the historical version-tracking bug; lowdb library-API breaking changes
- yaml@2 Document layer comment preservation; JSON Patch RFC 6902 + JSON Merge Patch RFC 7396; Red Hat yaml-language-server JSON Schema support
- Kafka log compaction + tombstones; Honeycomb event-based + Refinery sampling; Datadog tiered retention; OTLP transport shape; pino NDJSON default
- Apple App Sandbox file entitlement model; Electron renderer sandbox + IPC delegation; macOS hardened-runtime + per-`.node` signing inside asar; Windows SmartScreen reputation behavior since March 2024
- Confluent compat-window taxonomy (BACKWARD/FORWARD/FULL/TRANSITIVE); Protobuf "never change field numbers" rules; Avro forward/backward-compat patterns
- Multi-scope precedence chains for git, VS Code, Vite, dotenv, dotenv-flow, Renovate, ESLint flat config, Prettier
- mock-fs / memfs for test isolation; SQLite `:memory:` per connection; PGlite `memory://` default; lowdb auto-Memory on `NODE_ENV=test`

**INFERRED** (consistent across sources but not centrally codified or extrapolated from documented capabilities):
- "Indexes dominate insert cost" generalization across SQL engines
- The hybrid shape of WAL-as-internal-log applies to both SQLite and Postgres
- Absolute cardinality thresholds for "when SQL pays off" (qualitative consensus, no single number)
- bun:sqlite locking inherits SQLite engine semantics (Bun docs don't enumerate)
- SQLite default-durability documentation/reality gap depending on compile-time options
- "Dropbox sync of live SQLite is unsafe" generalizes to other file-sync services by analogy
- Cursor's earlier-source-wins precedence (cited from a community forum guide; not maintainer doc)

**UNCERTAIN** (sources disagree, are silent, or contested):
- bun:sqlite "3-6× faster than better-sqlite3" — methodology disputed (`SELECT *` vs query-time-in-engine)
- Event sourcing complexity vs benefit — actively contested across Debezium, Hugo Rocha, "Production Was a Nightmare" vs axoniq, Kurrent, eventsourcingdb
- Eventual consistency intrinsic to event sourcing — axoniq says no; "drowning in bugs" reports say yes-in-practice
- Agent / LLM ergonomics for files vs SQL — file-as-interface vs SQL-as-deterministic; synthesis is "files-as-interface, DB-as-substrate" but it's a synthesis, not a winner
- POSIX `O_APPEND` atomicity — works in practice on mainstream Linux/macOS, but spec language is weaker than commonly assumed
- VS Code structured error vs silent override on cross-scope type mismatch
- Direct FTS5-vs-tsvector head-to-head benchmark; direct ripgrep-vs-FTS5 benchmark
- PGlite OTel through `pg`-shim drivers in WASM environments — end-to-end pipeline coverage in browser WASM not surfaced in primary searches

---

## Evidence files

All evidence files use the same frontmatter shape (title, description, date, sources list, framing) and the same confidence-label conventions. Each file is self-contained for its dimension.

| # | File | Coverage |
|---|---|---|
| 1 | [`evidence/01-per-op-performance.md`](evidence/01-per-op-performance.md) | Lookup, write, batched, range scans, FTS, workload skew, cardinality scaling |
| 2 | [`evidence/02-durability-crash-safety.md`](evidence/02-durability-crash-safety.md) | Atomic writes, fsync semantics, journal modes, crash recovery, repair tools, transactions, backup |
| 3 | [`evidence/03-schema-lifecycle.md`](evidence/03-schema-lifecycle.md) | Schema definition, migrations, versioning, compat windows, codegen, tooling UX, failure modes |
| 4 | [`evidence/04-concurrent-multi-process.md`](evidence/04-concurrent-multi-process.md) | Multi-process patterns, file locking, DB locking, change notification, cross-platform quirks |
| 5 | [`evidence/05-human-agent-ergonomics.md`](evidence/05-human-agent-ergonomics.md) | Hand-edit, IDE intellisense, comment preservation, inspectability, patch semantics, agent ergonomics, schema-driven UI |
| 6 | [`evidence/06-distribution-footprint.md`](evidence/06-distribution-footprint.md) | Install size, native binding, cross-platform, code signing, bundling, git-friendliness, Bun/Node/WASM compat |
| 7 | [`evidence/07-query-relational.md`](evidence/07-query-relational.md) | Filter/sort/aggregate, joins, FK, unique, multi-table invariants, CTE, window, indexing, FTS, when SQL pays off |
| 8 | [`evidence/08-hierarchical-multi-scope.md`](evidence/08-hierarchical-multi-scope.md) | Multi-file precedence, DB-as-views, per-scope layout, cascade semantics, real-world adoption |
| 9 | [`evidence/09-operational-concerns.md`](evidence/09-operational-concerns.md) | Test isolation, OTel, encryption, sandbox, audit, failure injection, snapshots, live migration, lock-in |
| 10 | [`evidence/10-append-only-patterns.md`](evidence/10-append-only-patterns.md) | JSONL, time-series, log compaction, cardinality, hybrid event-sourcing, when append-only outperforms |
| 11 | [`evidence/11-duckdb-deep-dive.md`](evidence/11-duckdb-deep-dive.md) | DuckDB across all 10 dimensions (added 2026-04-26): columnar OLAP profile, multi-engine `ATTACH`, v1.4 LTS encryption + WAL checksums, DuckLake portability |

---

## Internal-report cross-references

Prior research that informs this report (referenced in evidence files but not duplicated):

- [`reports/search-engine-decision/REPORT.md`](../search-engine-decision/REPORT.md) — qualitative claims about SQLite per-branch index lifecycle (~1–5 ms file open/close vs Orama's 50–100 ms vs PGlite's 200–500 ms instance teardown/startup); evaluated SQLite vs PGlite for OK's search use case
- [`reports/local-search-retrieval-stacks-2025-2026/REPORT.md`](../local-search-retrieval-stacks-2025-2026/REPORT.md) — per-op latency benchmarks for FTS5, sqlite-vec, Orama
- [`reports/vec1-vs-sqlite-vec-ecosystem/REPORT.md`](../vec1-vs-sqlite-vec-ecosystem/REPORT.md) — sqlite-vec ecosystem context for vector workloads
- [`reports/auto-persistence-version-history-patterns/REPORT.md`](../auto-persistence-version-history-patterns/REPORT.md) — auto-persistence and version-history patterns
- [`reports/search-engine-advanced-capabilities/REPORT.md`](../search-engine-advanced-capabilities/REPORT.md) — advanced search capabilities

These are cited as internal context, not as primary 3P sources for this report's findings.
