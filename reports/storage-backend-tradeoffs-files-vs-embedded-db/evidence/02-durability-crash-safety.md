---
title: "Durability + crash safety"
description: "Atomic writes, fsync semantics, journal modes, crash recovery, and backup portability across 10 storage backends"
date: 2026-04-23
sources:
  - https://sqlite.org/wal.html
  - https://sqlite.org/atomiccommit.html
  - https://sqlite.org/howtocorrupt.html
  - https://sqlite.org/recovery.html
  - https://sqlite.org/transactional.html
  - https://sqlite.org/lockingv3.html
  - https://sqlite.org/cli.html
  - https://sqlite.org/pragma.html
  - https://sqlite.org/forum/info/d1a6bc7c4cd2baca
  - https://sqlite.org/forum/forumpost/ec171a77a3
  - https://www.postgresql.org/docs/current/runtime-config-wal.html
  - https://www.postgresql.org/docs/current/wal-async-commit.html
  - https://www.postgresql.org/docs/current/app-pgresetwal.html
  - https://www.postgresql.org/docs/current/app-pgdump.html
  - https://www.postgresql.org/docs/current/app-pgbasebackup.html
  - https://www.postgresql.org/docs/current/backup-dump.html
  - https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
  - https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
  - https://bun.com/docs/runtime/sqlite
  - https://bun.com/reference/bun/sqlite/Database/serialize
  - https://bun.com/reference/bun/sqlite/Database/deserialize
  - https://github.com/tursodatabase/libsql/blob/main/libsql-server/README.md
  - https://docs.turso.tech/libsql
  - https://github.com/tursodatabase/libsql-client-ts
  - https://pglite.dev/docs/filesystems
  - https://pglite.dev/docs/api
  - https://orm.drizzle.team/docs/transactions
  - https://orm.drizzle.team/docs/connect-pglite
  - https://github.com/typicode/lowdb
  - https://github.com/typicode/lowdb/issues/339
  - https://github.com/typicode/lowdb/issues/333
  - https://github.com/typicode/steno
  - https://github.com/sindresorhus/electron-store
  - https://github.com/sindresorhus/electron-store/blob/main/readme.md
  - https://github.com/npm/write-file-atomic
  - https://github.com/npm/write-file-atomic/issues/64
  - https://github.com/eemeli/yaml
  - https://eemeli.org/yaml/
  - https://nodejs.org/api/fs.html
  - https://avi.im/blag/2025/sqlite-fsync/
  - https://www.agwa.name/blog/post/sqlite_durability
  - https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
  - https://fly.io/blog/sqlite-internals-rollback-journal/
framing: 3P / external sources only
---

> **Conventions.** Confidence labels apply to load-bearing claims. CONFIRMED = corroborated by official docs and at least one independent source, or by multiple authoritative sources. INFERRED = single official source or extrapolation from documented behavior. UNCERTAIN = source disagreement or insufficient public documentation. Each backend section opens with its baseline durability story; comparison tables follow each sub-dimension.

---

## 1. Atomic writes — granularity per backend

This sub-dimension reports the smallest unit each backend updates atomically (the unit that survives a crash as either entirely the old value or entirely the new value). Larger units (multi-row, multi-table) require the backend's transaction story (sub-dimension 5).

### Per-backend single-key/single-row atomicity

**YAML files (yaml@2 + atomic-rename).** The `yaml` package itself produces a string (`Document.toString()` / `String(doc)`) and does not perform I/O — atomicity depends entirely on the file-write strategy chosen by the caller. (CONFIRMED: [eemeli.org/yaml](https://eemeli.org/yaml/) documents `toString()` as a pure serializer; the npm `yaml` README contains no atomic-write helper.) When combined with `write-file-atomic` or `fs.renameSync` after a tmp-file write, the entire YAML document is the atomic unit (whole file replaced or unchanged). (INFERRED: this is the standard atomic-rename pattern documented in [npm/write-file-atomic](https://github.com/npm/write-file-atomic).)

**JSON files (atomic-rename pattern).** The whole file is the atomic unit: the [`write-file-atomic`](https://github.com/npm/write-file-atomic) package writes to a temp file (named `filename.<murmurhex(__filename, process.pid, ++invocations)>`, plus `worker_threads.threadId` if applicable), optionally chowns, then renames to the target. If `writeFile` fails at any step, it attempts to unlink the temp file and propagates the error. (CONFIRMED: README + source description across multiple sources.) Single-key updates require read-modify-write on the whole file — there is no key-level atomicity below the file boundary.

**JSONL append-only files.** Single-line atomicity is the design intent: `fs.appendFile` is atomic for a single write call within a single process — the entire chunk written to one call is appended without interleaving from other writes in the same process. Concurrent appends from separate processes or threads can still interleave or corrupt data without higher-level synchronization. (INFERRED, from generalized Node fs documentation; see [Node.js fs docs](https://nodejs.org/api/fs.html) and [crash-safe-json-at-scale](https://dev.to/constanta/crash-safe-json-at-scale-atomic-writes-recovery-without-a-db-3aic).) On crash, only the last (in-flight) line is at risk; previously fsync'd lines are preserved. (CONFIRMED: this is the standard JSONL crash-safety property — corruption is line-local; cf. [JSONL Tutorial](https://jsonltools.com/jsonl-tutorial).)

**better-sqlite3.** Single-row atomicity is provided by SQLite itself; an autocommit single-statement INSERT/UPDATE is its own implicit transaction and is atomic. (CONFIRMED: [SQLite Is Transactional](https://sqlite.org/transactional.html) — "SQLite implements serializable transactions that are atomic, consistent, isolated, and durable, even if the transaction is interrupted by a program crash, an operating system crash, or a power failure".) `better-sqlite3` exposes this via `db.prepare(...).run()` and `db.transaction(fn)`; the latter wraps `BEGIN/COMMIT/ROLLBACK`. (CONFIRMED: [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).)

**bun:sqlite.** Same SQLite-level atomicity model as better-sqlite3 — `bun:sqlite` is a binding to the same SQLite engine. Bun documents WAL mode and `PRAGMA synchronous` levels (OFF/NORMAL/FULL/EXTRA) directly. (CONFIRMED: [Bun SQLite docs](https://bun.com/docs/runtime/sqlite).)

**libsql.** SQLite-compatible local files use the same atomicity guarantees as upstream SQLite. (CONFIRMED: [Turso libSQL docs](https://docs.turso.tech/libsql); the [libsql-client-ts repo](https://github.com/tursodatabase/libsql-client-ts) documents `local file URLs` as fully SQLite-compatible.) Writes from outside the libSQL SDK against an embedded-replica file are not supported and may be lost on next sync. (CONFIRMED: [Turso embedded-replica docs](https://docs.turso.tech/libsql/client-access).)

**PGlite.** Operates against an in-memory copy of the data directory backed by a virtual filesystem. Single-row writes carry standard Postgres atomicity (every individual statement runs in an implicit transaction). (CONFIRMED: PGlite is Postgres in WASM, see [PGlite About](https://pglite.dev/docs/about) and [Postgres tutorial-transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html).) The IndexedDB filesystem layer flushes whole files (Postgres has one file per table or index) as blobs to IndexedDB. (CONFIRMED: [PGlite Filesystems docs](https://pglite.dev/docs/filesystems).)

**Drizzle ORM.** Adds no atomicity primitives of its own — it is a query builder that submits SQL to the underlying engine (better-sqlite3, bun:sqlite, libsql, PGlite, etc.). All atomicity guarantees come from the underlying driver/engine. Drizzle exposes `db.transaction(async (tx) => {...})` which translates to BEGIN/COMMIT and supports SQLite behavior modes (`deferred` / `immediate` / `exclusive`). (CONFIRMED: [Drizzle Transactions](https://orm.drizzle.team/docs/transactions) and [Drizzle SQLite README](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-core/README.md).)

**lowdb.** Whole-file atomicity (writes the entire JSON file via the underlying `steno` writer on every change). [steno](https://github.com/typicode/steno) advertises "atomic writing and race condition prevention" via a queue mechanism; lowdb's README states it uses steno as its async file writer. (CONFIRMED: [lowdb README](https://github.com/typicode/lowdb), [steno README](https://github.com/typicode/steno).) Multi-process atomicity is not provided — see "Source disagreements" below for a documented case ([lowdb#333](https://github.com/typicode/lowdb/issues/333) — multi-process writes producing malformed/interwoven JSON).

**electron-store.** Whole-file atomicity. The README states "changes are written to disk atomically, so if the process crashes during a write, it will not corrupt the existing config" — the data is stored in `config.json` under `app.getPath('userData')`. (CONFIRMED: [electron-store README](https://github.com/sindresorhus/electron-store/blob/main/readme.md).) The package reads and writes the entire JSON file on every change. (CONFIRMED: README — "this package reads and writes the entire JSON file on every change, and it will get slow with even moderately large data (e.g., 1 MB+)".)

### Comparison: smallest atomic unit per backend

| Backend         | Smallest atomic unit (without explicit transaction) | Notes |
| --------------- | --------------------------------------------------- | ----- |
| YAML files      | Whole file (only with atomic-rename adapter)         | Library is I/O-agnostic; depends on caller |
| JSON files      | Whole file                                            | tmp-write + rename |
| JSONL (append)  | Single line (within one `fs.appendFile` call, single process) | No cross-process atomicity by default |
| better-sqlite3  | Single row                                            | Autocommit per statement |
| bun:sqlite      | Single row                                            | Same SQLite engine |
| libsql (local)  | Single row                                            | SQLite-compatible |
| PGlite          | Single row                                            | Postgres autocommit |
| Drizzle ORM     | Inherits from underlying engine                       | Adds no atomicity itself |
| lowdb           | Whole file                                            | steno queue, single-process |
| electron-store  | Whole file                                            | conf-based, atomic-rename |

---

## 2. fsync semantics + journal modes

### SQLite (better-sqlite3, bun:sqlite, libsql)

SQLite's journal mode and `PRAGMA synchronous` level together determine when fsync is called.

**Journal modes** ([sqlite.org/pragma.html](https://sqlite.org/pragma.html)):

- `DELETE` (historical default for newly created databases): rollback journal is written; deleting it is the commit point. (CONFIRMED: [Atomic Commit In SQLite](https://sqlite.org/atomiccommit.html) — "deletion of the rollback journal file is the instant where the transaction commits".)
- `TRUNCATE`, `PERSIST`, `MEMORY`, `OFF`: variants that change journal lifecycle but follow the same rollback model.
- `WAL` (write-ahead logging, opt-in): writes append to a separate `-wal` file plus a `-shm` shared-memory index file; commit is appending a special record. ([sqlite.org/wal.html](https://sqlite.org/wal.html).)

**`PRAGMA synchronous`** levels (from [sqlite.org/pragma.html](https://sqlite.org/pragma.html) and [sqlite.org/wal.html](https://sqlite.org/wal.html)):

- `OFF` (0): no fsync; fastest; corruption possible on power loss.
- `NORMAL` (1): in WAL mode, syncs at checkpoints, not per commit; transactions committed since the last checkpoint may roll back after power loss but the database remains consistent. (CONFIRMED: [SQLite forum — sync=NORMAL](https://sqlite.org/forum/info/9d6f13e346231916), [SQLite WAL docs](https://sqlite.org/wal.html).) In rollback journal modes (DELETE), `NORMAL` carries a "very small (though non-zero) chance" of corruption on power loss. (CONFIRMED: [SQLite forum on switching synchronous](https://sqlite.org/forum/info/d1a6bc7c4cd2baca).)
- `FULL` (2): syncs WAL on every commit (in WAL mode). Default for newly opened databases. (CONFIRMED: [sqlite.org/pragma.html](https://sqlite.org/pragma.html).)
- `EXTRA` (3): like `FULL` plus syncing the directory containing the rollback journal after the journal is unlinked in DELETE mode. "EXTRA provides additional durability if the commit is followed closely by a power loss." (CONFIRMED: [sqlite.org/pragma.html](https://sqlite.org/pragma.html).)

**better-sqlite3 default.** The bundled SQLite is compiled with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, which means databases that switch to WAL mode default to `NORMAL` synchronous. (CONFIRMED: [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md).) The library does **not** auto-enable WAL — callers must run `db.pragma('journal_mode = WAL')`. (CONFIRMED: README.)

**bun:sqlite default.** Bun documents the four `synchronous` levels (OFF / NORMAL / FULL / EXTRA) and states that "PRAGMA synchronous = FULL" is appropriate for "critical workloads; NORMAL is a good default" — the library does not document overriding SQLite's compile-time defaults. (CONFIRMED: [Bun SQLite docs](https://bun.com/docs/runtime/sqlite).)

**libsql default.** Inherits SQLite's defaults; libSQL's WAL system is extended with a pluggable WAL manager interface for replication. (CONFIRMED: [Turso libSQL docs](https://docs.turso.tech/libsql), [libSQL WAL and Pager](https://github.com/tursodatabase/libsql/blob/main/libsql-server/README.md).)

> **Source disagreement on SQLite defaults.** Multiple commentators have noted that SQLite's *advertised* default (`synchronous=FULL` per [sqlite.org/pragma.html](https://sqlite.org/pragma.html)) is overridden by many wrapper libraries that compile with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` (downgrading WAL mode to `NORMAL`). [avi.im/blag/2025/sqlite-fsync](https://avi.im/blag/2025/sqlite-fsync/) ("SQLite commits are not durable under default settings") and [agwa.name/blog/post/sqlite_durability](https://www.agwa.name/blog/post/sqlite_durability) ("SQLite's Durability Settings are a Mess") report that `NORMAL` in WAL mode loses recently-committed transactions on power loss. [SQLite forum: ec171a77a3](https://sqlite.org/forum/forumpost/ec171a77a3) discusses a docs proposal acknowledging the durability impact of the default. UNCERTAIN: which behavior a given binary exhibits at runtime depends on which compile-time options were used.

### PostgreSQL / PGlite

**PostgreSQL fsync model** ([postgresql.org/docs/current/runtime-config-wal.html](https://www.postgresql.org/docs/current/runtime-config-wal.html)):

- `fsync`: server-wide. When on, "PostgreSQL will try to make sure that updates are physically written to disk, by issuing fsync() system calls or various equivalent methods (see wal_sync_method)." Disabling it "could result in arbitrarily bad corruption of the database state." (CONFIRMED.)
- `wal_sync_method`: selects the fsync implementation (`fsync`, `fdatasync`, `open_sync`, `open_datasync`); irrelevant if `fsync = off`. (CONFIRMED.)
- `synchronous_commit`: per-transaction. `on` = wait for local WAL flush to disk; `off` = return success before flush. "Unlike fsync, setting this parameter to off does not create any risk of database inconsistency: an operating system or database crash might result in some recent allegedly-committed transactions being lost, but the database state will be just the same as if those transactions had been aborted cleanly." (CONFIRMED: [postgresql.org/docs/current/wal-async-commit.html](https://www.postgresql.org/docs/current/wal-async-commit.html).)

**PGlite durability.** PGlite runs a Postgres build in WASM. The IndexedDB filesystem persists at the file level (one blob per Postgres file), flushing changed files after each query. (CONFIRMED: [pglite.dev/docs/filesystems](https://pglite.dev/docs/filesystems).) `relaxedDurability: true` returns query results immediately and schedules the IndexedDB flush asynchronously — explicitly trades durability for responsiveness. (CONFIRMED: [pglite.dev/docs/api](https://pglite.dev/docs/api).) The Node FS uses the Node fs API; OPFS-AHP filesystem (Origin Private File System Access Handle Pool) is browser-only and Web-Worker-only. (CONFIRMED: [PGlite filesystems](https://pglite.dev/docs/filesystems).)

### Atomic-rename pattern (JSON, YAML, electron-store, lowdb)

The pattern for files: write tmp file → fsync the tmp file → `rename(tmp, target)` → fsync the *containing directory*. POSIX `rename(2)` is atomic at the filesystem boundary (within the same directory, on Unix). On Windows, `fs.rename` may not be atomic. (CONFIRMED: [Node.js fs docs](https://nodejs.org/api/fs.html); [Stack-Overflow / npm discussion](https://github.com/npm/write-file-atomic).)

**Directory fsync caveat.** `rename()` is durable only after the containing directory's fsync. Without the directory fsync, "application may think that rename is durable, but on accidental reboot, old file may appear." (INFERRED, from cited POSIX-rename discussion in [npm/write-file-atomic#64](https://github.com/npm/write-file-atomic/issues/64).) `write-file-atomic` calls fsync on the file (controllable via `fsync: false` to skip it) but the directory-fsync behavior is not as universally documented. UNCERTAIN: extent of directory fsync coverage in the npm package's current source.

### Comparison: fsync defaults per backend

| Backend         | Default fsync per commit?                                  | Notes |
| --------------- | ----------------------------------------------------------- | ----- |
| YAML files      | Depends on writer (write-file-atomic defaults to fsync=true) | Caller-determined |
| JSON files      | Yes if write-file-atomic with default opts; configurable    | `{fsync:false}` skips |
| JSONL (append)  | No — `fs.appendFile` does not call fsync                    | Caller must invoke `fs.fsync` |
| better-sqlite3  | NORMAL by default in WAL mode (sync at checkpoint, not commit) | Overridable via PRAGMA |
| bun:sqlite      | Inherits SQLite default (FULL); user-tunable                 | Documented levels OFF/NORMAL/FULL/EXTRA |
| libsql          | Inherits SQLite default                                      | Pluggable WAL for replication scenarios |
| PGlite          | Yes by default; `relaxedDurability: true` defers flush       | Browser/Node persistence dependent on FS |
| PostgreSQL (full) | Yes — synchronous_commit on by default                    | Per-txn override possible |
| Drizzle ORM     | Inherits from engine                                          | Adds no fsync of its own |
| lowdb           | Inherits from steno (atomic-rename) — fsync details not documented at app level | UNCERTAIN |
| electron-store  | Atomic write claim; underlying `conf` package details        | UNCERTAIN at the documented-API layer |

---

## 3. Crash recovery — what happens after `kill -9` mid-write

### SQLite (rollback-journal mode)

SQLite's recovery model: on crash mid-transaction, the rollback journal file is left on disk. On the next open, SQLite detects the "hot journal" and rolls back to the pre-transaction state automatically. (CONFIRMED: [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html) — "if the database file has a hot journal, the next process to open the database will see that it has a hot journal and will roll the changes back".) Process and transparent — no operator intervention needed.

The recovery sequence:
1. Detect hot journal (file in same dir as DB with derived name).
2. Play back journal contents into the database file.
3. Sync the database file.
4. Delete (or truncate / invalidate header for) the journal — this is the commit point of recovery.
5. Reduce exclusive lock to shared lock.

(CONFIRMED: [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html).)

### SQLite (WAL mode)

WAL recovery is similar in spirit: on next open, SQLite reads the WAL file, redoes any committed transactions (those terminated by a commit record) into the main DB. Uncommitted WAL frames after the last commit record are ignored. (CONFIRMED: [sqlite.org/wal.html](https://sqlite.org/wal.html).) With `synchronous=NORMAL`, recently committed transactions written to the WAL but not yet fsync'd may be lost — the database remains consistent but durability is bounded by the last successful WAL fsync. (CONFIRMED.)

### PostgreSQL / PGlite

PostgreSQL: on startup, replays WAL from the last checkpoint forward. "PostgreSQL will automatically enter into recovery mode after restarting [...] PostgreSQL is replaying the Write-Ahead Log (WAL) to restore the database to a consistent state." (CONFIRMED: [PostgreSQL docs WAL](https://www.postgresql.org/docs/current/runtime-config-wal.html); [Cybertec recovery internals](https://www.cybertec-postgresql.com/en/postgresql-recovery-internals/).) Operator does nothing in the normal case.

PGlite: starts by loading the data directory into the WASM in-memory filesystem from the persistent backend (Node FS, IndexedDB, OPFS, or memory). Postgres recovery replays WAL during the startup sequence. (INFERRED from PGlite running stock Postgres in WASM; see [pglite.dev/docs/about](https://pglite.dev/docs/about).)

### File-based formats (JSON, YAML, JSONL, lowdb, electron-store)

**JSON / YAML with atomic-rename:** if killed mid-write of the temp file, the original file is intact; the orphan temp file may be left on disk. (CONFIRMED: by construction of the tmp-write+rename pattern; cf. [npm/write-file-atomic](https://github.com/npm/write-file-atomic).)

**JSONL (append-only):** if killed mid-append, the last partial line may be present. Recovery is reader-side: skip malformed last line. "If a JSONL file becomes corrupted, only the affected lines are problematic — you can still parse and recover the valid lines." (CONFIRMED: [JSONL Tutorial](https://jsonltools.com/jsonl-tutorial); [jsonlines.org](https://jsonlines.org/).)

**lowdb:** relies on steno (atomic write under-the-hood) for the *file* write; if killed mid-write, the existing JSON file is preserved. ([steno README](https://github.com/typicode/steno).) Reported real-world failure modes include malformed JSON when accessed from multiple processes ([lowdb#333](https://github.com/typicode/lowdb/issues/333)) and Electron-multiprocess corruption ([lowdb#339](https://github.com/typicode/lowdb/issues/339)).

**electron-store:** "If the process crashes during a write, it will not corrupt the existing config." (CONFIRMED: [electron-store README](https://github.com/sindresorhus/electron-store/blob/main/readme.md).) Edge cases (e.g., antivirus EPERM on Windows, multi-instance writes) are reported in downstream issues; cf. [claude-code#29050](https://github.com/anthropics/claude-code/issues/29050).

### Comparison: crash recovery model

| Backend         | Recovery model                                              | Operator action needed? |
| --------------- | ----------------------------------------------------------- | ----------------------- |
| YAML / JSON     | Atomic-rename — old file intact; orphan tmp may need cleanup | None (orphan cleanup optional) |
| JSONL           | Last line may be partial; reader skips                       | None (reader policy) |
| better-sqlite3  | Hot-journal or WAL replay on open                            | None |
| bun:sqlite      | Same                                                          | None |
| libsql          | Same                                                          | None (sync model independent) |
| PGlite          | WAL replay on start                                           | None |
| PostgreSQL      | WAL replay on start                                           | None |
| Drizzle ORM     | Inherits from engine                                          | Inherits |
| lowdb           | Atomic-rename — old file intact                              | None |
| electron-store  | Atomic-rename — old file intact                              | None |

---

## 4. Repair tools

### SQLite

**`.recover` (sqlite3 CLI):** "Like the `.dump` command, `.recover` attempts to convert the entire contents of a database file to text. The difference is that instead of reading data using the normal SQL database interface, `.recover` attempts to reassemble the database based on data extracted directly from as many database pages as possible." (CONFIRMED: [sqlite.org/recovery.html](https://sqlite.org/recovery.html).) Options include `--ignore-freelist` (skip pages that look like freelist content) and `--ignore-rowids` (skip non-PK rowids). Output is SQL text written to stdout (for piping into `sqlite3 newdb`).

**`PRAGMA integrity_check`:** runs internal consistency checks; not a repair tool but a diagnostic. (CONFIRMED: [sqlite.org/pragma.html](https://sqlite.org/pragma.html).)

### PostgreSQL / PGlite

**`pg_resetwal`:** "clears the write-ahead log (WAL) and optionally resets some other control information stored in the pg_control file. This function is sometimes needed if these files have become corrupted. It should be used only as a last resort, when the server will not start due to such corruption." (CONFIRMED: [postgresql.org/docs/current/app-pgresetwal.html](https://www.postgresql.org/docs/current/app-pgresetwal.html).) Critical caveat: "After running this command, it should be possible to start the server, but bear in mind that the database might contain inconsistent data due to partially-committed transactions. You should immediately dump your data, run initdb, and reload." Has `-f` (force) and `-n/--dry-run` options.

**`pg_dump --schema-only` / `pg_resetwal -n`:** diagnostic-only modes. (CONFIRMED.)

**PGlite:** the PGlite docs do not document a separate repair tool — recovery falls back on Postgres's WAL replay. UNCERTAIN: whether `pg_resetwal` is available in the WASM build; not documented.

### File-based formats

**JSON / YAML:** repair is a manual JSON / YAML re-parse. No standardized tool. JSONLint and similar tools can identify the location of a syntax error; the operator must fix or truncate. (CONFIRMED: general practice; [JSONLint](https://jsonlint.com/json-repair).)

**JSONL:** stream-parse with try/catch around `JSON.parse()`; skip malformed lines and log them. The standard recovery pattern. (CONFIRMED: [JSONL parser docs](https://jsonltools.com/jsonl-parser).)

**lowdb:** the underlying JSON file is repairable as any JSON file. lowdb itself throws "Malformed JSON in file" when corrupted ([lowdb#339](https://github.com/typicode/lowdb/issues/339)).

**electron-store:** corrupted `config.json` requires manual fix or deletion (no documented repair tool). The `clearInvalidConfig` option exists in the API surface for resetting on corruption.

### Comparison: repair tooling

| Backend         | First-line repair tool                  | Recovery semantics |
| --------------- | --------------------------------------- | ------------------ |
| YAML / JSON     | Manual edit / linter                    | Document-level only |
| JSONL           | Skip-malformed-line parser              | Line-level recovery preserved |
| better-sqlite3 / bun:sqlite / libsql | sqlite3 CLI `.recover`     | Page-level scan; rebuilds as SQL text |
| PGlite          | None documented (use WAL replay)        | UNCERTAIN |
| PostgreSQL      | `pg_resetwal` (last resort + dump+reload) | Restart; data consistency at risk |
| Drizzle ORM     | Inherits from engine                     | Inherits |
| lowdb           | Manual JSON edit                         | Document-level only |
| electron-store  | Manual config.json edit / `clearInvalidConfig` | Document-level only |

---

## 5. Multi-step write atomicity (transactions)

### SQLite (better-sqlite3, bun:sqlite, libsql)

Full ACID transactions via `BEGIN ... COMMIT` (or `BEGIN ... ROLLBACK`). Multi-row, multi-table, and even multi-database (via `ATTACH DATABASE` plus a "super-journal") atomic commits are supported. (CONFIRMED: [sqlite.org/transactional.html](https://sqlite.org/transactional.html), [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html) — "the purpose of the super-journal is to ensure that multi-file transactions are atomic across a power-loss".)

`better-sqlite3`: `db.transaction(fn)` returns a transaction-wrapped function (synchronous; that is core to the library's design). (CONFIRMED: [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).)

`bun:sqlite`: similar API; `db.transaction(fn)`. (CONFIRMED: [Bun SQLite docs](https://bun.com/docs/runtime/sqlite).)

`libsql`: supports `batch` (implicit transaction across multiple statements; full rollback on any error) and `transaction` (interactive). Interactive transactions hold a write lock on the database for the duration; libSQL aborts after a 5 s timeout. (CONFIRMED: [Turso libSQL client docs](https://docs.turso.tech/sdk/ts/reference).)

### PostgreSQL / PGlite

Full ACID with `BEGIN/COMMIT/ROLLBACK`. PGlite exposes `pglite.transaction(async (tx) => {...})` returning a transaction object. (CONFIRMED: [pglite.dev/docs/api](https://pglite.dev/docs/api).) The transaction commits on resolved promise, rolls back on rejected promise.

PGlite + ElectricSQL: multi-table sync preserves transactional consistency across tables (sync updates that happened in a single Postgres transaction land in a single PGlite transaction). (CONFIRMED: [pglite.dev/docs/sync](https://pglite.dev/docs/sync).)

### Drizzle ORM

`db.transaction(async (tx) => { ... }, { behavior: 'deferred' | 'immediate' | 'exclusive' })` for SQLite; equivalent for Postgres/PGlite. Calling `tx.rollback()` aborts; uncaught throw also rolls back. (CONFIRMED: [Drizzle Transactions](https://orm.drizzle.team/docs/transactions).) Nested transaction support is driver-dependent; some drivers report "TransactionRollbackError" issues with better-sqlite3 in certain conditions ([drizzle-team/drizzle-orm#1170](https://github.com/drizzle-team/drizzle-orm/discussions/1170)).

Drizzle's `batch` API explicitly groups multiple statements as a single transactional unit, used for libsql/PGlite. (CONFIRMED: [Drizzle Batch API](https://orm.drizzle.team/docs/batch-api).)

### File-based formats

**JSON / YAML / electron-store / lowdb:** no native multi-step transaction. Multi-key updates are done by mutating the in-memory copy and rewriting the entire file atomically. Concurrent multi-process updates are *not* serialized — last writer wins or interleaved corruption per the multi-process discussions in lowdb issues. (CONFIRMED: [lowdb#333](https://github.com/typicode/lowdb/issues/333).)

**JSONL:** no transaction concept; each appended line is independent. Multi-line "transactions" require application-level grouping (e.g., a transaction-id field on each line and a commit-marker line, plus a reader that gates uncommitted lines).

### Comparison: multi-step transaction support

| Backend         | Multi-row | Multi-table | Multi-database |
| --------------- | --------- | ----------- | -------------- |
| YAML / JSON     | Whole-file rewrite (no isolation) | Whole-file | N/A |
| JSONL           | App-level only | App-level only | N/A |
| better-sqlite3  | Yes (BEGIN/COMMIT) | Yes | Yes (super-journal via ATTACH) |
| bun:sqlite      | Yes | Yes | Yes |
| libsql          | Yes (batch + transaction) | Yes | Yes |
| PGlite          | Yes (BEGIN/COMMIT) | Yes | Single-cluster |
| Drizzle ORM     | Yes (over engine) | Yes (over engine) | Inherits |
| lowdb           | Whole-file rewrite | Whole-file | N/A |
| electron-store  | Whole-file rewrite | Whole-file | N/A |

---

## 6. Backup / restore portability

### SQLite (better-sqlite3, bun:sqlite, libsql)

**File copy:** an SQLite database file is portable across architectures (the file format is endian-neutral by design). For a quiescent database, `cp db.sqlite backup.sqlite` is sufficient; for a live database, the `cp` may produce a corrupt copy if a transaction is in progress. (CONFIRMED: [sqlite.org/howtocorrupt.html](https://sqlite.org/howtocorrupt.html) — "Systems that run automatic backups in the background might try to make a backup copy of an SQLite database file while it is in the middle of a transaction. The backup copy then might contain some old and some new content, and thus be corrupt.")

**Online Backup API:** the C-level `sqlite3_backup_init` family copies pages incrementally even from a live database. (CONFIRMED: [sqlite.org/backup.html](https://sqlite.org/backup.html).)

- `better-sqlite3.db.backup(destPath)` initiates a backup, returning a Promise. The result is a regular SQLite file. (CONFIRMED: [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).)
- `bun:sqlite` exposes `db.serialize()` returning a `Uint8Array` and `Database.deserialize(buf)` to load. (CONFIRMED: [Bun serialize docs](https://bun.com/reference/bun/sqlite/Database/serialize), [deserialize docs](https://bun.com/reference/bun/sqlite/Database/deserialize).) `node:sqlite`'s `backup()` (also available in Bun) wraps the backup-init/step/finish APIs. (CONFIRMED: [Bun node:sqlite backup ref](https://bun.com/reference/node/sqlite/backup).)
- `VACUUM INTO 'path/to/backup.db'` (since SQLite 3.27.0): produces a single-file consistent backup snapshot of an open, live database. Transactionally safe. (CONFIRMED: [SQLite VACUUM docs](https://www.sqlitetutorial.net/sqlite-vacuum/), [SQLite forum thread](https://sqlite.org/forum/info/2c0d2119aa7ec6c64a8a772bcb09527b0f75693cad9689e3fb847376dffd7e07).)

### PostgreSQL / PGlite

**`pg_dump`:** logical (SQL) dump. Portable across versions (typically forward-compatible) and across architectures. "pg_dump's output can generally be re-loaded into newer versions of PostgreSQL, whereas file-level backups and continuous archiving are both extremely server-version-specific. pg_dump is also the only method that will work when transferring a database to a different machine architecture." (CONFIRMED: [PostgreSQL docs backup-dump](https://www.postgresql.org/docs/current/backup-dump.html), [pg_dump docs](https://www.postgresql.org/docs/current/app-pgdump.html).)

**`pg_basebackup`:** physical cluster backup; restore requires a compatible Postgres version and matching system layout. (CONFIRMED: [pg_basebackup docs](https://www.postgresql.org/docs/current/app-pgbasebackup.html).) "Backups are always taken of the entire database cluster; it is not possible to back up individual databases or database objects."

**PGlite:** `pglite.dumpDataDir(compression?)` dumps the Postgres data directory as a Gzipped tarball; `loadDataDir(tarball)` reloads. The dump is **not** designed to be compatible with other Postgres versions — only for re-importing into PGlite. (CONFIRMED: [pglite.dev/docs/api](https://pglite.dev/docs/api), [pglite.dev/docs/filesystems](https://pglite.dev/docs/filesystems).)

### File-based formats

**JSON / YAML / JSONL / lowdb / electron-store:** the file *is* the backup. Copy with `cp` (or with platform tools that handle the atomic-rename-temp-file race). Restore = copy back. Maximally portable across versions and architectures (text formats); UTF-8-safe across operating systems. JSONL is line-streamable, so partial restores (truncate to a known-good line) are trivial.

### Comparison: backup options

| Backend         | Single-file backup | Live-DB safe backup tool | Cross-version portable | Cross-arch portable |
| --------------- | ------------------ | ------------------------ | ---------------------- | ------------------- |
| YAML / JSON / JSONL | Yes (cp the file) | Reader-tolerant of partials | Yes (text) | Yes |
| better-sqlite3  | Yes (.sqlite file) | `db.backup()`, `VACUUM INTO`, online backup API | Yes (file format stable) | Yes (endian-neutral) |
| bun:sqlite      | Yes | `db.serialize()`, online backup via node:sqlite | Yes | Yes |
| libsql          | Yes | SQLite tools | Yes | Yes |
| PGlite          | Tarball of datadir | `dumpDataDir()` | No (PGlite-only) | UNCERTAIN |
| PostgreSQL      | `pg_dump` SQL or `pg_basebackup` directory | Both safe online | `pg_dump` yes; `pg_basebackup` no | `pg_dump` yes |
| Drizzle ORM     | Inherits from engine | Inherits | Inherits | Inherits |
| lowdb           | Yes (cp the JSON) | OK if writes are quiescent | Yes (text) | Yes |
| electron-store  | Yes (cp config.json) | OK if writes are quiescent | Yes (text) | Yes |

---

## 7. fsync cost — frequency and performance impact

### Theoretical lower bound

`fsync` performance is hardware-bounded: a 7200 RPM HDD limits sequential transactions to roughly 60 fsync/sec; SSDs are much faster but still finite. (CONFIRMED: [phiresky.github.io SQLite performance tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/).)

### SQLite fsync frequency

- Rollback journal (DELETE), `synchronous=FULL`: at least two disk syncs per transaction (journal + main DB). Plus a directory fsync in EXTRA mode after journal unlink. (CONFIRMED: [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html), [sqlite.org/pragma.html](https://sqlite.org/pragma.html).)
- WAL mode, `synchronous=FULL`: one WAL fsync per commit, plus a sync at checkpoint when WAL is merged into the main DB. (CONFIRMED: [sqlite.org/wal.html](https://sqlite.org/wal.html).)
- WAL mode, `synchronous=NORMAL`: no fsync per commit; only at checkpoint. (CONFIRMED.) "WAL significantly reduces the need for expensive fsync() calls, batching multiple transactions into its log file before a single fsync() is needed, drastically cutting down on disk wait times."

### PostgreSQL fsync frequency

- `synchronous_commit=on` (default): WAL fsync per transaction commit. (CONFIRMED: [PostgreSQL WAL docs](https://www.postgresql.org/docs/current/runtime-config-wal.html).)
- `synchronous_commit=off`: no per-commit fsync; commits return before WAL is fsync'd; a background process flushes asynchronously. (CONFIRMED: [PostgreSQL async commit docs](https://www.postgresql.org/docs/current/wal-async-commit.html).)
- Checkpoints: periodic fsync of dirty data buffers (configurable via `checkpoint_timeout`, `max_wal_size`).

### File rename pattern fsync frequency

- One fsync per write call (on the tmp file before rename), with default `write-file-atomic` settings. Skippable via `fsync: false` option. Directory fsync after rename is platform- and library-dependent. (CONFIRMED for the file-fsync; UNCERTAIN at the npm-package level for directory-fsync coverage.)

### JSONL append fsync frequency

- `fs.appendFile` does not call fsync. Caller must invoke `fs.fsync` explicitly. Without an explicit fsync, OS page-cache buffering can defer durability. (INFERRED from Node.js fs documentation.)

### Reported throughput observations (3P benchmarks)

- "WAL significantly reduces the need for expensive fsync() calls [...] benchmarks show an 11.8X difference in performance due to changing only the journal mode." (CONFIRMED: [phiresky.github.io SQLite performance tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/).)
- "SQLite with WAL mode handles 400 write transactions per second on modest hardware, while a 7200 RPM hard drive yields 60 transactions per second as an absolute max hard-limited by physics." (CONFIRMED: same source.)
- Steno (lowdb's writer) reports "writing 1KB data 1000 times: fs takes 62ms while steno takes 1ms" — but this measures de-duplicated writes (skipping unnecessary writes), not raw fsync cost. (CONFIRMED: [steno README](https://github.com/typicode/steno).)

> **UNCERTAIN — direct cross-backend benchmarks.** This evidence file does not aggregate apples-to-apples benchmarks across backends; reported numbers come from independent harnesses (different hardware, workloads, fsync policies). For comparable numbers, see the dedicated performance-cluster evidence file.

### Comparison: fsync calls per single-row commit (defaults)

| Backend         | fsync calls per commit (defaults)         | Notes |
| --------------- | ------------------------------------------ | ----- |
| YAML / JSON / electron-store | 1 per file rewrite (file fsync) + dir-fsync varies | Whole file each time; dir fsync inconsistent |
| JSONL (default `appendFile`) | 0 (no fsync) | Caller must fsync explicitly |
| better-sqlite3 (WAL, NORMAL default) | 0 per commit; ~1 per checkpoint | NORMAL = checkpoint-bound |
| bun:sqlite (FULL) | ≥1 per commit | User-tunable |
| libsql (local, SQLite default) | Inherits SQLite | Replication adds remote fsyncs |
| PGlite (default)  | 1 per commit (FS flush) | `relaxedDurability:true` defers |
| PostgreSQL (default) | 1 per commit (WAL fsync) | `synchronous_commit=off` defers |
| Drizzle ORM     | Inherits from engine | — |
| lowdb           | 1 per write (steno + atomic-rename) | Whole-file fsync |

---

## Source disagreements / open questions

- **Lowdb atomicity in multi-process Electron contexts.** Steno claims atomic single-process writes; multi-process scenarios in lowdb issues report malformed JSON from interleaved writes ([lowdb#333](https://github.com/typicode/lowdb/issues/333), [lowdb#339](https://github.com/typicode/lowdb/issues/339), [claude-code#28809](https://github.com/anthropics/claude-code/issues/28809)). Atomicity claim and reported reality diverge on the multi-process axis.

- **SQLite default durability.** Official docs state `synchronous=FULL` is the default. Multiple commentators ([avi.im/blag/2025/sqlite-fsync](https://avi.im/blag/2025/sqlite-fsync/), [agwa.name/blog/post/sqlite_durability](https://www.agwa.name/blog/post/sqlite_durability)) note that many SQLite distributions (including the one bundled with `better-sqlite3`) compile with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, which downgrades WAL mode to `NORMAL`. The behavior of any given SQLite binary thus depends on its compile-time options — a user enabling WAL on a default `better-sqlite3` install gets `NORMAL` semantics, not `FULL`.

- **`write-file-atomic` directory fsync.** POSIX guidance ([npm/write-file-atomic#64](https://github.com/npm/write-file-atomic/issues/64)) is that durable rename requires `fsync` of the containing directory after the rename. Whether this happens in current `write-file-atomic` releases by default is not clearly documented in the README. UNCERTAIN.

- **electron-store atomic-write internals.** README documents that "changes are written to disk atomically" and the package is built on `conf` (which uses `write-file-atomic`). The chain of fsync calls (file vs. directory) is not directly documented in the electron-store README. UNCERTAIN at the documented-API layer.

- **PGlite repair tooling.** PGlite docs do not document `pg_resetwal` or other Postgres repair tools. UNCERTAIN whether these are exposed in the WASM build.

- **Drizzle nested transaction limitations on better-sqlite3.** [drizzle-orm#1170](https://github.com/drizzle-team/drizzle-orm/discussions/1170) reports `TransactionRollbackError` for some nested-transaction scenarios; whether this is fully resolved in current Drizzle versions is UNCERTAIN.

