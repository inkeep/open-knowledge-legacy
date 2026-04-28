---
title: "Operational concerns"
description: "Test isolation, storage observability, encryption, sandbox model, audit trail, failure injection, snapshots, live migration, and vendor lock-in across 10 storage backends"
date: 2026-04-23
sources:
  - https://sqlite.org/inmemorydb.html
  - https://sqlite.org/backup.html
  - https://sqlite.org/wal.html
  - https://sqlite.org/pragma.html
  - https://sqlite.org/howtocorrupt.html
  - https://sqlite.org/testing.html
  - https://sqlite.org/c3ref/serialize.html
  - https://www.zetetic.net/sqlcipher/
  - https://github.com/sqlcipher/sqlcipher
  - https://utelle.github.io/SQLite3MultipleCiphers/
  - https://github.com/m4heshd/better-sqlite3-multiple-ciphers
  - https://github.com/threema-ch/better-sqlcipher
  - https://github.com/journeyapps/node-sqlcipher
  - https://www.postgresql.org/docs/current/pgcrypto.html
  - https://www.postgresql.org/docs/current/encryption-options.html
  - https://www.postgresql.org/docs/current/app-pgdump.html
  - https://www.postgresql.org/docs/current/backup-dump.html
  - https://opentelemetry.io/docs/specs/semconv/database/sql/
  - https://opentelemetry.io/docs/specs/semconv/db/database-spans/
  - https://opentelemetry.io/docs/specs/semconv/db/database-metrics/
  - https://opentelemetry.io/docs/specs/semconv/db/postgresql/
  - https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/
  - https://orm.drizzle.team/docs/goodies
  - https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts
  - https://github.com/drizzle-team/drizzle-orm/issues/371
  - https://github.com/drizzle-team/drizzle-orm/issues/2916
  - https://github.com/sjinks/opentelemetry-plugin-better-sqlite3
  - https://www.npmjs.com/package/opentelemetry-plugin-better-sqlite3
  - https://github.com/sindresorhus/electron-store
  - https://github.com/sindresorhus/electron-store/blob/main/test.js
  - https://blog.jse.li/posts/electron-store-encryption/
  - https://github.com/typicode/lowdb
  - https://github.com/tschaub/mock-fs
  - https://www.npmjs.com/package/memfs
  - https://pglite.dev/docs/api
  - https://pglite.dev/docs/filesystems
  - https://pglite.dev/docs/pglite-tools
  - https://github.com/electric-sql/pglite
  - https://github.com/electric-sql/pglite/discussions/455
  - https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
  - https://github.com/WiseLibs/better-sqlite3/issues/573
  - https://bun.sh/docs/runtime/sqlite
  - https://bun.com/reference/bun/sqlite/Database/serialize
  - https://bun.com/reference/bun/sqlite/Database/deserialize
  - https://docs.turso.tech/libsql
  - https://turso.tech/blog/turso-now-supports-database-branching-and-point-in-time-restore-eaadb8c4dce5
  - https://turso.tech/blog/fully-open-source-encryption-for-sqlite-b3858225
  - https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox
  - https://developer.apple.com/documentation/security/app_sandbox_entitlements
  - https://www.electronjs.org/docs/latest/tutorial/sandbox/
  - https://www.electronjs.org/docs/latest/tutorial/security
  - https://www.electronjs.org/docs/latest/api/safe-storage
  - https://github.com/atom/node-keytar
  - https://en.wikipedia.org/wiki/Security-Enhanced_Linux
  - https://securitylabs.datadoghq.com/articles/container-security-fundamentals-part-5/
  - https://en.wikipedia.org/wiki/BitLocker
  - https://litestream.io/tips/
  - https://github.com/wzhudev/reverse-linear-sync-engine
  - https://stack.convex.dev/object-sync-engine
  - https://git-scm.com/docs/git-stash
  - https://en.wikipedia.org/wiki/Btrfs
  - https://ahl.dtrace.org/2016/06/19/apfs-part2/
  - https://en.wikipedia.org/wiki/Copy-on-write
  - https://nodejs.org/api/errors.html
  - https://jsonl.help/
  - https://ndjson.com/faq/
framing: 3P / external sources only
---

This file catalogs operational characteristics of 10 storage backends across 10 sub-dimensions. Confidence labels — CONFIRMED (vendor docs / canonical reference), INFERRED (composed from primary sources), UNCERTAIN (conflicting or sparse evidence).

---

## 1. Test isolation

### File-based backends

**YAML files / JSON files / JSONL append-only**
- `mock-fs` (tschaub/mock-fs) patches Node's `fs` module via `process.binding('fs')`, replacing the underlying file system with an in-memory mock. Two default directories — `process.cwd()` and `os.tmpdir()` — are seeded; additional files, directories, and symlinks come from a config object. Library must be required before other modules that capture `fs`. CONFIRMED ([mock-fs README](https://github.com/tschaub/mock-fs)).
- `memfs` (npm `memfs`) implements an in-memory file system compatible with the Node.js `fs` module and the browser File System Access API. CONFIRMED ([memfs npm](https://www.npmjs.com/package/memfs)).
- For per-test isolation without mocking, fresh tmpdir per test (e.g., `fs.mkdtempSync(path.join(os.tmpdir(), 'test-'))`) is the default Node idiom — no mocking layer required. INFERRED.
- JSONL fixtures are line-addressable: tests can append a single record without rewriting prior fixtures, and corrupted lines do not invalidate the whole file. CONFIRMED ([JSONL FAQ](https://jsonl.help/faq/)).

### SQLite-family

**better-sqlite3**
- In-memory: `new Database(':memory:')` per SQLite's special filename. Each `:memory:` connection yields a distinct database — opening two such connections gives two independent databases. CONFIRMED ([SQLite In-Memory Docs](https://sqlite.org/inmemorydb.html)).
- Fixture loading: `db.serialize()` returns a buffer that can be passed back to `new Database(buffer)` for in-memory hydration of a pre-built fixture. CONFIRMED ([better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)).
- Snapshot semantics: each `:memory:` connection lifetime equals snapshot lifetime — closing the connection deletes the database. CONFIRMED ([SQLite In-Memory Docs](https://sqlite.org/inmemorydb.html)).

**bun:sqlite**
- In-memory: `new Database(':memory:')` (constructor inherits SQLite semantics) plus `Database.serialize()` returning `Uint8Array` and static `Database.deserialize()` for round-tripping. CONFIRMED ([bun:sqlite serialize](https://bun.com/reference/bun/sqlite/Database/serialize), [bun:sqlite deserialize](https://bun.com/reference/bun/sqlite/Database/deserialize)).

**libsql**
- Inherits SQLite `:memory:` semantics for the embedded path. CONFIRMED ([libSQL docs](https://docs.turso.tech/libsql)).
- Drizzle community thread notes embedded libSQL `:memory:` is supported as a Drizzle test target. CONFIRMED ([Drizzle "in memory tests with libsql"](https://www.answeroverflow.com/m/1147453395540652124)).

**PGlite**
- Default filesystem on start is the in-memory FS (`memory://`); explicit string `memory://` selects ephemeral storage on all platforms. CONFIRMED ([PGlite Filesystems docs](https://pglite.dev/docs/filesystems)).
- Fixture hydration via `pg.dumpDataDir()` (returns Gzipped tarball) + `loadDataDir` start option. CONFIRMED ([PGlite API docs](https://pglite.dev/docs/api)).
- Drizzle community guidance for in-memory Postgres testing recommends PGlite as the WASM build with no external dependencies. CONFIRMED ([Drizzle issue #4205](https://github.com/drizzle-team/drizzle-orm/issues/4205)).

**Drizzle ORM**
- No native test mode; relies on the underlying engine. With Bun's SQLite driver, `drizzle()` called without arguments yields an in-memory SQLite database. For test schema, `push` is documented as a substitute for `migrate` (skips migration files). CONFIRMED ([Drizzle SQLite get-started](https://orm.drizzle.team/docs/get-started/sqlite-new), [Drizzle/Bun discussion](https://github.com/drizzle-team/drizzle-orm/discussions/784)).

### Key-value / JSON-doc backends

**lowdb**
- Ships `Memory` and `MemorySync` adapters; instantiation: `new Low(new Memory(), {})` / `new LowSync(new MemorySync(), {})`. CONFIRMED ([lowdb README](https://github.com/typicode/lowdb)).
- `JSONPreset` from `lowdb/node` automatically substitutes the Memory adapter when `NODE_ENV=test`. CONFIRMED ([lowdb releases](https://github.com/typicode/lowdb/releases)).

**electron-store**
- Per-instance isolation via the `name` option (storage filename without extension); `cwd` overrides path (default `app.getPath('userData')`). The `name` option is documented for the multiple-storage-files use case. CONFIRMED ([electron-store readme](https://github.com/sindresorhus/electron-store/blob/main/readme.md)).
- The maintained test file uses fixtures under a known path and `fs.unlinkSync` cleanup after each test. CONFIRMED ([electron-store test.js](https://github.com/sindresorhus/electron-store/blob/main/test.js)).

### Test ergonomics matrix

| Backend            | In-memory mode               | Fixture loading                         | Parallel test isolation                              |
| ------------------ | ---------------------------- | --------------------------------------- | ---------------------------------------------------- |
| YAML files         | mock-fs / memfs              | seed FS via mock config                 | per-test tmpdir or fresh mock per test               |
| JSON files         | mock-fs / memfs              | seed FS via mock config                 | per-test tmpdir or fresh mock per test               |
| JSONL append-only  | mock-fs / memfs              | append fixture lines                    | per-test file path                                   |
| better-sqlite3     | `:memory:` per connection    | `serialize()` / new Database(buffer)    | distinct connections = distinct DBs                  |
| bun:sqlite         | `:memory:` per constructor   | `serialize()` / `deserialize()`         | distinct constructor calls = distinct DBs            |
| libsql             | `:memory:` (embedded path)   | inherits SQLite serialize               | per-connection isolation                             |
| PGlite             | `memory://` (default)        | `dumpDataDir()` / `loadDataDir`         | per-instance isolation                               |
| Drizzle ORM        | underlying-engine `:memory:` | underlying-engine fixture path; `push`  | inherits engine isolation model                      |
| lowdb              | `Memory` / `MemorySync`      | seed in-memory object                   | per-instance isolation; auto-mem on `NODE_ENV=test`  |
| electron-store     | n/a; use `name` + `cwd`      | construct with `defaults` + cleanup     | per-instance file path via `name`/`cwd`              |

---

## 2. Storage observability

### OpenTelemetry semantic conventions

The OpenTelemetry **SQL Database semantic conventions** define `db.system.name` (required) for SQL backends — enumerated values include `sqlite` and `postgresql`. Span kind SHOULD be `CLIENT`. The general database span conventions cover `db.statement`, `db.namespace`, `db.operation.name`, and `db.response.status_code`. CONFIRMED ([OTel SQL Semconv](https://opentelemetry.io/docs/specs/semconv/database/sql/), [OTel database spans](https://opentelemetry.io/docs/specs/semconv/db/database-spans/), [OTel PostgreSQL semconv](https://opentelemetry.io/docs/specs/semconv/db/postgresql/)).

OTel database **metrics** semconv defines instruments like `db.client.operation.duration` (histogram) and `db.client.connection.count` (gauge). CONFIRMED ([OTel database metrics](https://opentelemetry.io/docs/specs/semconv/db/database-metrics/)).

Migration guidance: instrumentations support `OTEL_SEMCONV_STABILITY_OPT_IN=database` to emit stable conventions, or `database/dup` to emit both old and new. CONFIRMED ([OTel db-migration](https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/)).

### Per-backend observability

**better-sqlite3**: `opentelemetry-plugin-better-sqlite3` (community package) provides automatic instrumentation; spans are emitted for query operations and configured via NodeTracerProvider. CONFIRMED ([sjinks/opentelemetry-plugin-better-sqlite3](https://github.com/sjinks/opentelemetry-plugin-better-sqlite3), [npm](https://www.npmjs.com/package/opentelemetry-plugin-better-sqlite3)).

**bun:sqlite**: No OTel auto-instrumentation package found in canonical sources. Manual span wrapping required. UNCERTAIN.

**libsql / Turso**: An official Doctrine DBAL driver exists; OTel auto-instrumentation status not surfaced in canonical search. UNCERTAIN.

**PGlite**: Standard `pg`-protocol drivers can apply (PGlite speaks the Postgres wire protocol via shim layers). UNCERTAIN for end-to-end OTel pipeline coverage in WASM.

**Postgres / pgcrypto-bearing**: OTel has stable `postgresql` semconv per the source above. CONFIRMED.

**Drizzle ORM**: Built-in logger pluggable as `drizzle({ logger: true })` for default console output, or via custom `Logger` interface (`logQuery(query, params)`); a `DefaultLogger` accepts a custom `LogWriter`. Issue #371 ("Observability support") tracks first-party OTel — proxy-based wrapping is documented as the community pattern. CONFIRMED ([Drizzle Goodies](https://orm.drizzle.team/docs/goodies), [Drizzle logger.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts), [Drizzle issue #371](https://github.com/drizzle-team/drizzle-orm/issues/371)).
- Slow-query logging is open at issue #2916 — no first-party slow-query log hook as of that issue. CONFIRMED ([Drizzle issue #2916](https://github.com/drizzle-team/drizzle-orm/issues/2916)).

**electron-store / lowdb**: No documented OTel instrumentation. JSON file I/O is observable only at the Node `fs` layer (no native auto-instrumentation on Bun runtime — see CLAUDE.md note about `@opentelemetry/instrumentation-fs` not working on Bun, oven-sh/bun#6546).

**File backends (YAML/JSON/JSONL)**: No backend layer; Node `fs` instrumentation is the closest hook. CONFIRMED.

### SQLite-specific operational metrics

Production SQLite monitoring requires custom instrumentation for: WAL size, checkpoint frequency/duration, lock-contention metrics, query latency percentiles, cache hit ratios. None are exposed by SQLite as first-party metrics. CONFIRMED ([Litestream Tips](https://litestream.io/tips/)).

`busy_timeout` PRAGMA is the documented knob to manage `SQLITE_BUSY` errors; recommendation is 5 seconds. CONFIRMED ([Bert Hubert on SQLITE_BUSY](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/)).

---

## 3. Encryption at rest

### SQLite-family

**SQLCipher** (Zetetic): a standalone fork of SQLite that adds 256-bit AES full database encryption — encrypts the entire database file including metadata, tables, indexes, and journal files. With no key, behaves as standard SQLite. Documented overhead: 5–15% on many operations. CONFIRMED ([SQLCipher GitHub](https://github.com/sqlcipher/sqlcipher), [Zetetic SQLCipher](https://www.zetetic.net/sqlcipher/)).

**SQLite3 Multiple Ciphers** (utelle): an extension to public-domain SQLite providing multi-cipher support. Recommended default cipher is ChaCha20-Poly1305 HMAC; SQLCipher and Ascon schemes are described as "almost equivalent" for cryptographic security; SQLCipher uses AES (typically lower runtime performance than ChaCha20-Poly1305). CONFIRMED ([SQLite3 Multiple Ciphers Overview](https://utelle.github.io/SQLite3MultipleCiphers/)).

**better-sqlite3 + encryption forks**:
- `better-sqlite3-multiple-ciphers` (m4heshd) ships better-sqlite3 with the SQLite3MultipleCiphers backend. CONFIRMED ([better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)).
- `better-sqlcipher` (threema-ch) is a fork of better-sqlite3 patched to use SQLCipher. CONFIRMED ([threema-ch/better-sqlcipher](https://github.com/threema-ch/better-sqlcipher)).
- `node-sqlcipher` (journeyapps): N-API 3 / N-API 6 prebuilt versions cover all Electron and Node versions. CONFIRMED ([journeyapps/node-sqlcipher](https://github.com/journeyapps/node-sqlcipher)).

**bun:sqlite**: Stock `bun:sqlite` does not document a SQLCipher build path in canonical Bun docs. UNCERTAIN.

**libsql / Turso**: Turso documents fully open-source encryption for SQLite via libSQL. CONFIRMED ([Turso encryption blog](https://turso.tech/blog/fully-open-source-encryption-for-sqlite-b3858225)).

### Postgres-family

**pgcrypto** (Postgres extension): provides cryptographic functions; column-level encryption via `pgp_sym_encrypt(data, psw [, options])` (returns `bytea`) and `pgp_sym_decrypt(msg, psw [, options])`. Supported ciphers: bf, aes128, aes192, aes256, 3des, cast5 — default `aes128`. All pgcrypto functions execute server-side; data and passwords cross the wire in cleartext absent SSL. CONFIRMED ([Postgres pgcrypto docs](https://www.postgresql.org/docs/current/pgcrypto.html), [Postgres encryption options](https://www.postgresql.org/docs/current/encryption-options.html)).

**PGlite**: ships with a curated extension set including pgcrypto; persisted IndexedDB data has no documented at-rest encryption layer in PGlite itself. PGlite docs guidance: use the browser `Crypto.subtle` API for additional encryption before write. CONFIRMED ([PGlite What is](https://pglite.dev/docs/about), [PGlite Filesystems](https://pglite.dev/docs/filesystems)).

### File-level / OS-level

**FileVault (macOS)**: XTS-AES 128-bit encryption for whole-disk; transparent to applications, encrypts in the background. CONFIRMED ([FileVault vs BitLocker comparison](https://www.donemax.com/wiki/filevault-vs-bitlocker.html)).
**BitLocker (Windows)**: full-disk encryption using AES (128 or 256-bit); low-level device driver encrypts/decrypts file operations transparently. CONFIRMED ([BitLocker Wikipedia](https://en.wikipedia.org/wiki/BitLocker)).

### electron-store / per-field crypto

**electron-store** built-in `encryptionKey`: defaults to `aes-256-cbc`; can be set to `aes-256-gcm` (authenticated, tamper-detected) or `aes-256-ctr`. With `aes-256-cbc` and `aes-256-ctr`, tampering is undetected. CONFIRMED ([electron-store readme](https://github.com/sindresorhus/electron-store/blob/main/readme.md)).
- Documented limitation: in practice the encryption is used "purely for obscurity" because the key is commonly hardcoded in the app. CONFIRMED ([Breaking electron-store encryption](https://blog.jse.li/posts/electron-store-encryption/)).

**lowdb / YAML / JSON / JSONL**: No first-party encryption. App-level crypto only.

### Encryption matrix

| Backend            | At-rest encryption path                                       | Tamper detection           |
| ------------------ | ------------------------------------------------------------- | -------------------------- |
| YAML / JSON files  | OS-level FDE (FileVault / BitLocker) or app-level crypto      | none unless app implements |
| JSONL append-only  | OS-level FDE or app-level crypto                              | none unless app implements |
| better-sqlite3     | SQLCipher / Multiple-Ciphers via fork                         | per-fork (typically yes)   |
| bun:sqlite         | OS-level FDE (no first-party SQLCipher build documented)      | n/a built-in               |
| libsql / Turso     | first-party libSQL encryption                                 | per Turso docs             |
| PGlite             | OS-level FDE or browser `SubtleCrypto`; pgcrypto column-level | depends on AEAD choice     |
| Drizzle ORM        | inherits underlying engine                                    | inherits underlying engine |
| lowdb              | OS-level FDE or app-level crypto                              | none unless app implements |
| electron-store     | built-in `encryptionKey` (aes-256-cbc/gcm/ctr); GCM = AEAD    | yes only with `aes-256-gcm`|
| Postgres + pgcrypto| pgcrypto column-level + OS-level FDE (and TDE on managed)     | depends on pgcrypto option |

---

## 4. Sandbox / permission model

### macOS App Sandbox

App Sandbox is enabled by code-signing the app with the sandbox entitlement. File access entitlements are namespaced under `com.apple.security.files.*`:
- `com.apple.security.files.user-selected.read-only` / `read-write` — open-panel-issued sandbox extensions
- `com.apple.security.files.downloads.read-write` — downloads folder
- Persistent access requires security-scoped bookmark + URL access. CONFIRMED ([Apple App Sandbox file access](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox), [Apple App Sandbox entitlements](https://developer.apple.com/documentation/security/app_sandbox_entitlements)).

### Linux MAC

**SELinux** uses a label-based access control model assigning rules to security contexts and object labels; default on Red Hat-based distros.
**AppArmor** uses a path-based model with profiles per application; default on Debian-derived distros.
Both implement Mandatory Access Control above traditional file permissions. CONFIRMED ([SELinux Wikipedia](https://en.wikipedia.org/wiki/Security-Enhanced_Linux), [Datadog container security pt 5](https://securitylabs.datadoghq.com/articles/container-security-fundamentals-part-5/)).

### Electron renderer sandbox

Since Electron 20, the sandbox is enabled by default for renderer processes. Sandboxed renderers cannot freely access the filesystem — privileged tasks (filesystem, system changes, subprocess spawn) must be delegated to the main process via IPC. Setting `nodeIntegration: true` disables the sandbox. Preload scripts can use `contextBridge` to expose typed IPC. CONFIRMED ([Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox/), [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)).

### OS keychain integration

**Electron `safeStorage`**: uses OS-provided cryptography. On macOS, encryption keys are stored in Keychain Access in a way that prevents other applications from loading them without user override. CONFIRMED ([Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage)).
**node-keytar**: native module for `getPassword` / `addPassword` / `replacePassword`; macOS uses Keychain. Documented constraint: should be called from the main process — calling from renderer prompts a permissions dialog on macOS. CONFIRMED ([atom/node-keytar](https://github.com/atom/node-keytar)).

### Per-backend implications

| Backend                    | Sandbox interaction                                                    |
| -------------------------- | ---------------------------------------------------------------------- |
| YAML/JSON/JSONL files      | sandbox file entitlement required for non-app-container paths          |
| better-sqlite3 / bun:sqlite| native module — IPC delegation pattern in Electron-sandboxed renderers |
| libsql                     | as above                                                                |
| PGlite                     | runs inside WASM sandbox; inherits browser/main-process boundary       |
| Drizzle ORM                | inherits underlying engine                                              |
| lowdb / electron-store     | file I/O subject to entitlement same as raw JSON                       |
| Postgres                   | network client; not local FS path, no FS entitlement need              |

INFERRED from Electron sandbox + Apple/Linux MAC docs.

---

## 5. Logging + audit trail

### File-based as audit primitive

**JSONL append-only** is naturally an audit log: append operations are instant (vs. JSON arrays which require full-file rewrites); line-delimited structure means a single corrupted line does not invalidate prior entries. CONFIRMED ([JSONL FAQ](https://jsonl.help/faq/), [NDJSON FAQ](https://ndjson.com/faq/)).

`jq` is documented for audit log inspection on Linux/macOS/Windows; `select` for boolean filtering, dot-prefixed field references for object members, ISO 8601 date filtering. CONFIRMED ([HashiCorp Vault audit log analysis with jq](https://support.hashicorp.com/hc/en-us/articles/19172751769235-Vault-Audit-Log-analysis-using-jq-CLI), [SANS Zeek JSON logs with jq](https://www.sans.org/blog/parsing-zeek-json-logs-with-jq)).

### File-in-git as audit trail

**git stash** stores file-level snapshots locally inside `.git/refs/stash`; entries enumerated as `stash@{0}`, `stash@{1}`, etc. — local-only, not a public history. CONFIRMED ([git-stash docs](https://git-scm.com/docs/git-stash)).

**git commit** as audit primitive: full append-only history with author, timestamp, message. Linear's reverse-engineered sync engine documents `lastSyncId` as the equivalent monotonic snapshot pointer in their model — concept is "persisting model snapshots for each create, update, or delete action which they call a SyncAction." CONFIRMED ([wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)).

### DB-level audit

For SQLite/Postgres, audit-log tables and triggers are the standard pattern (see Postgres documentation index for `event triggers`; pgcrypto can be combined with audit triggers — neither offers built-in audit). For commercial offerings, MySQL Enterprise Audit emits JSON-format events. CONFIRMED ([MySQL Enterprise audit JSON](https://dev.mysql.com/blog-archive/audit-logs-json-format-logging/)).

### Audit matrix

| Backend            | Built-in audit                       | Common pattern                                     |
| ------------------ | ------------------------------------ | -------------------------------------------------- |
| YAML / JSON files  | none                                 | `git log` if file is checked in                    |
| JSONL append-only  | append semantics ARE the audit       | jq for inspection                                  |
| better-sqlite3     | none                                 | trigger-driven audit table                         |
| bun:sqlite         | none                                 | trigger-driven audit table                         |
| libsql             | none in OSS path                     | trigger-driven; Turso adds platform-side history   |
| PGlite             | none built-in                        | audit table + triggers                             |
| Drizzle ORM        | logger captures every query          | route logger to JSONL or audit table               |
| lowdb              | none                                 | per-write hook in app code                         |
| electron-store     | none                                 | watch `change` events; mirror to log               |
| Postgres           | none in core (logical replication)   | audit triggers, `pgaudit` extension (3P)           |

---

## 6. Operational failure injection

### SQLite-specific (canonical)

SQLite's own test harness uses an OS abstraction layer that injects fake disk faults, reorders writes, and simulates power loss. After I/O error simulation, `PRAGMA integrity_check` is run to verify no corruption was introduced. A special VFS reorders / corrupts unsynchronized writes to simulate buffered filesystems. CONFIRMED ([SQLite testing.html](https://sqlite.org/testing.html), [SQLite howtocorrupt.html](https://sqlite.org/howtocorrupt.html)).

For application-level fault injection, `PRAGMA wal_checkpoint(TRUNCATE)` is documented to simulate WAL operations. Virtualization (VirtualBox, VMware) can inject errors at the virtual disk layer. CONFIRMED ([SQLite forum corruption testing](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies)).

### File-based

**ENOSPC** in Node: the canonical error on disk full. On Linux it can also signal inotify watch limit exhaustion, not just disk space — `chokidar` ENOSPC handling falls back to polling. CONFIRMED ([Node.js fix ENOSPC](https://oneuptime.com/blog/post/2026-01-22-nodejs-fix-enospc-error/view)).

**EACCES** in Node: permission-denied on read/write. Standard pattern is `error.code === 'EACCES'` branch + alternative location. CONFIRMED ([Node.js fix EACCES](https://oneuptime.com/blog/post/2026-01-22-nodejs-eacces-permission-denied/view)).

For "file locked by another process": Windows vs POSIX semantics differ; POSIX advisory locking via `flock(2)` is the typical primitive. INFERRED.

### Tools that simulate slow disk / disk-full

`fault-injection-fs` style mock layers (built atop `mock-fs` / `memfs`) are the documented community pattern. UNCERTAIN — vendor-neutral name varies.

### Per-backend matrix

| Backend            | Simulating disk-full        | Simulating slow disk       | Simulating corruption                |
| ------------------ | --------------------------- | -------------------------- | ------------------------------------ |
| YAML / JSON files  | mock-fs throws ENOSPC; tmpfs| sleep wrappers in writeFn  | direct edit of file bytes            |
| JSONL              | as above                    | as above                   | inject malformed line                |
| better-sqlite3     | tmpfs sized small           | OS-level via fuse/strace   | flip bytes per `howtocorrupt.html`   |
| bun:sqlite         | as above                    | as above                   | as above                             |
| libsql             | as above                    | as above                   | as above                             |
| PGlite             | mock IndexedDB throw        | `relaxedDurability` toggle | block-level edit                     |
| Drizzle ORM        | inherits engine             | inherits engine            | inherits engine                      |
| lowdb              | mock-fs                     | adapter wrapper            | inject malformed JSON                |
| electron-store     | mock-fs                     | adapter wrapper            | inject malformed JSON                |
| Postgres           | quota / tmpfs               | network / OS knobs         | corrupt page (rare)                  |

INFERRED from per-tool primary docs.

---

## 7. Snapshot / point-in-time restore

### SQLite

**Online Backup API**: copies one database to another file, with the target becoming a "bit-wise identical copy" snapshot of the source as of when the copy began. Incremental copying allows the source to remain unlocked except for brief read windows. The same API powers the `.backup` shell command — produces "an exact page-by-page replica of the database file at the point of invoking the command." CONFIRMED ([SQLite Backup API](https://sqlite.org/backup.html)).

**`sqlite3_serialize` / `sqlite3_deserialize`**: in-memory round-trip; useful for snapshot-into-buffer + buffer-back-to-DB workflows. CONFIRMED ([SQLite serialize](https://sqlite.org/c3ref/serialize.html)).

`PRAGMA wal_checkpoint(TRUNCATE)` and related modes (`PASSIVE`, `FULL`, `RESTART`) control WAL state at backup time. CONFIRMED ([SQLite WAL docs](https://sqlite.org/wal.html), [SQLite PRAGMA docs](https://sqlite.org/pragma.html)).

**better-sqlite3**: `db.serialize()` returns a buffer that can be written to disk (yielding a regular SQLite file) or passed to `new Database(buffer)`. CONFIRMED ([better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)). Issue #573 is the canonical request for `serialize`/`deserialize` API.

**bun:sqlite**: `Database.serialize()` returns `Uint8Array` (calls `sqlite3_serialize`); `Database.deserialize()` is static and accepts `ArrayBufferLike` / TypedArray plus `readonly`, `safeIntegers`, `strict` options. CONFIRMED ([bun:sqlite serialize](https://bun.com/reference/bun/sqlite/Database/serialize), [bun:sqlite deserialize](https://bun.com/reference/bun/sqlite/Database/deserialize)). No backup-API binding documented in the sources.

### Turso / libSQL

Turso supports database branching ("create a new database from an existing one") and point-in-time restore via timestamp:
```
turso db create new-db --from-db old-db --timestamp 2023-10-02T10:16:13-03:00
```
Retention by tier: Starter 24h, Scaler 30 days, Enterprise custom. CONFIRMED ([Turso branching + PITR](https://turso.tech/blog/turso-now-supports-database-branching-and-point-in-time-restore-eaadb8c4dce5)).

### Postgres / PGlite

**pg_dump**: backs up a live Postgres database without blocking other readers/writers; dumps are "internally consistent and represent a snapshot of the database at the time pg_dump began running." CONFIRMED ([Postgres pg_dump docs](https://www.postgresql.org/docs/current/app-pgdump.html), [Postgres backup-dump](https://www.postgresql.org/docs/current/backup-dump.html)).

**PGlite**: `pg.dumpDataDir()` returns a Gzipped tarball; `loadDataDir` start option restores. A WASM `pg_dump` is available via `@electric-sql/pglite-tools`. CONFIRMED ([PGlite API](https://pglite.dev/docs/api), [PGlite tools](https://pglite.dev/docs/pglite-tools), [PGlite pg_dump discussion](https://github.com/electric-sql/pglite/discussions/455)).

### File-based snapshots

**git stash / git commit**: file-level snapshots; stash for working-copy, commit for permanent history. CONFIRMED ([git-stash docs](https://git-scm.com/docs/git-stash)).

**Filesystem snapshots**: APFS, btrfs, ZFS use copy-on-write — snapshots created near-instantaneously, initially consume little disk space, with atomic linkage of new blocks; original data is preserved. CONFIRMED ([Btrfs Wikipedia](https://en.wikipedia.org/wiki/Btrfs), [APFS in Detail by Adam Leventhal](https://ahl.dtrace.org/2016/06/19/apfs-part2/), [Copy-on-write Wikipedia](https://en.wikipedia.org/wiki/Copy-on-write)).

### Snapshot matrix

| Backend            | Snapshot mechanism                                          | PITR                               |
| ------------------ | ----------------------------------------------------------- | ---------------------------------- |
| YAML / JSON files  | `cp`, FS snapshot, git commit                               | git history; FS snapshot history   |
| JSONL              | inherent (append-only); replay to any line                  | line-offset cursor                 |
| better-sqlite3     | online Backup API; `.backup`; `serialize()`                 | none built-in                      |
| bun:sqlite         | `serialize()` / `deserialize()`                             | none built-in                      |
| libsql / Turso     | branching + timestamp PITR                                  | yes (per-tier retention)           |
| PGlite             | `dumpDataDir()` + `pg_dump` WASM                            | none built-in                      |
| Drizzle ORM        | inherits engine                                              | inherits engine                    |
| lowdb              | file copy                                                    | none built-in                      |
| electron-store     | file copy of JSON                                            | none built-in                      |
| Postgres           | `pg_dump` (live, non-blocking) + WAL archive PITR           | yes via WAL replay                 |

---

## 8. Live migration without downtime

### SQLite

**Schema versioning** uses `PRAGMA user_version` + custom version table. Migration steps wrap in `BEGIN TRANSACTION` / `COMMIT` (rollback on failure) — atomicity at the migration step. Common startup pattern: define schema as CREATE statements in a single file; on startup compare current `user_version`; apply incremental migration scripts. `application_id` PRAGMA identifies database ownership. CONFIRMED ([SQLite forum migration strategies](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies), [SQLite PRAGMA docs](https://sqlite.org/pragma.html)).

For desktop apps with a long-running connection, transaction-wrapped migrations execute while the application is paused on its own connection — no concurrent process. INFERRED.

### Postgres

`pg_dump` while the database is live for backup purposes is documented above. Schema migrations on a live Postgres typically use tools (Flyway, Liquibase) with transactional DDL — Postgres supports DDL inside transactions on most operations, so failed migrations roll back. CONFIRMED ([SQLite forum, generic migration discussion](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies)).

### electron-store

**Migrations** documented as a `migrations` object: keys are version strings, values are handler functions. Conf (the underlying library) calls each handler in order whenever the stored version is older than the declared one. CONFIRMED ([electron-store readme](https://github.com/sindresorhus/electron-store/blob/main/readme.md)).

### File-based

**Read-old-write-new** is the documented migration pattern for YAML/JSON/JSONL: read the legacy file, transform in-memory, write the new file. Atomicity via temp-file-and-rename. Format conversion (YAML ↔ JSON) is a documented use case. CONFIRMED ([YAML/JSON conversion patterns](https://goteleport.com/resources/tools/yaml-to-json-converter/)).

### Live migration matrix

| Backend            | Migration model                                  | "User keeps working" capable?                |
| ------------------ | ------------------------------------------------ | -------------------------------------------- |
| YAML / JSON files  | read-old-write-new; rename atomic                | yes if app schedules during quiet window     |
| JSONL              | parser-versioned per-line                        | yes — append continues with new format       |
| better-sqlite3     | `user_version` + transactional DDL               | depends on long write locks                  |
| bun:sqlite         | as above                                         | as above                                     |
| libsql             | as above + Turso branching                       | branch + cutover possible                    |
| PGlite             | inherits Postgres migration model                | single-instance; no zero-downtime path       |
| Drizzle ORM        | `drizzle-kit` migrations; transactional          | inherits engine                              |
| lowdb              | adapter-side transform on read                   | yes for in-process; restart for adapter swap |
| electron-store     | `migrations` map keyed by version                | yes — runs before first read                 |
| Postgres           | transactional DDL; Flyway/Liquibase              | yes for backwards-compatible changes         |

---

## 9. Health checks

### SQLite

**`PRAGMA integrity_check`**: returns 'ok' on healthy DB; otherwise text descriptions of errors (default max 100 errors, configurable via `max_errors`). Cost: O(N log N) — reads every row + cross-references indexes. Documented case: 4.2GB database can take >20 minutes. Does NOT detect FOREIGN KEY violations — use `PRAGMA foreign_key_check` for those. CONFIRMED ([SQLite PRAGMA docs](https://sqlite.org/pragma.html), [SQLite forum integrity_check duration](https://sqlite.org/forum/info/631e8968e70b35bc)).

**`PRAGMA quick_check`**: O(N) instead of O(N log N); covers most of the same checks as `integrity_check` but faster. CONFIRMED ([SQLite PRAGMA docs](https://sqlite.org/pragma.html)).

For continuous health monitoring (responsiveness check vs. integrity), the documented pattern is a trivial `SELECT 1` round-trip. INFERRED.

### Postgres / PGlite

`SELECT 1` round-trip is the canonical liveness probe. INFERRED. PGlite with `relaxedDurability` mode returns query results immediately and schedules IndexedDB flush asynchronously — affects health-check semantics for write durability. CONFIRMED ([PGlite Filesystems docs](https://pglite.dev/docs/filesystems)).

### File-based

Liveness = `fs.stat` or `fs.access` on the file path. Integrity = re-parse + schema validate. INFERRED.

### Health-check matrix

| Backend            | Liveness                  | Integrity                                  | Performance class                       |
| ------------------ | ------------------------- | ------------------------------------------ | --------------------------------------- |
| YAML / JSON files  | `fs.access`               | parse + validate                           | O(file size)                            |
| JSONL              | `fs.access` + tail        | per-line JSON.parse                        | O(N lines) for full check               |
| better-sqlite3     | trivial `SELECT 1`        | `PRAGMA quick_check` / `integrity_check`   | O(N) quick / O(N log N) full            |
| bun:sqlite         | as above                  | as above                                   | as above                                 |
| libsql             | as above                  | as above                                   | as above                                 |
| PGlite             | `SELECT 1`                | `pg_dump` round-trip; pg_table_size checks | depends on durability mode              |
| Drizzle ORM        | inherits                  | inherits                                   | inherits                                |
| lowdb              | adapter `read()`          | re-validate JSON shape                     | O(JSON tree)                            |
| electron-store     | construct + first read    | per-key validation if schema set           | O(stored keys)                          |
| Postgres           | `SELECT 1`                | `pg_amcheck`, `VACUUM (VERBOSE, ANALYZE)`  | engine-dependent                        |

---

## 10. Vendor lock-in / portability

### SQLite-family interchange

SQLite file format is documented and stable. Migration paths within the SQLite-family:
- better-sqlite3 ↔ bun:sqlite: same file format; serialize / open path interchangeable.
- SQLite ↔ libSQL: libSQL is documented as an open-contribution fork — file-format-compatible. CONFIRMED ([libSQL docs](https://docs.turso.tech/libsql)).
- SQLite ↔ SQLCipher: SQLCipher behaves as standard SQLite when no key is provided; a SQLCipher-encrypted DB requires SQLCipher (or compatible cipher build) to read. CONFIRMED ([SQLCipher GitHub](https://github.com/sqlcipher/sqlcipher)).

### Postgres-family

PGlite is built on Postgres's source — `pg_dump` produced from PGlite imports into stock Postgres (and vice versa for schema dumps; data round-trips depend on enabled extensions). PGlite ships a curated extension set including pgcrypto and pgvector. CONFIRMED ([electric-sql/pglite README](https://github.com/electric-sql/pglite), [PGlite Filesystems](https://pglite.dev/docs/filesystems)).

### YAML ↔ JSON ↔ JSONL

YAML and JSON are both tree-shaped serializations; conversion tools (js-yaml, SnakeYAML) are widely available; documented gotchas include null representation differences and YAML's whitespace-sensitivity. CONFIRMED ([YAML/JSON conversion characteristics](https://goteleport.com/resources/tools/yaml-to-json-converter/)).

JSONL ↔ JSON-array conversion is mechanical (`jq -s '.'` for collect, `jq -c '.[]'` for split). CONFIRMED ([JSONL FAQ](https://jsonl.help/faq/)).

### electron-store / lowdb

Both write JSON to disk; the file is portable. Schema definitions (electron-store accepts a JSON Schema) are interchange-friendly. CONFIRMED ([electron-store readme](https://github.com/sindresorhus/electron-store/blob/main/readme.md), [lowdb README](https://github.com/typicode/lowdb)).

### Drizzle ORM

Drizzle is engine-agnostic across SQLite / Postgres / MySQL surfaces. The schema definition in TypeScript is reusable across drivers; raw SQL fragments are not. CONFIRMED ([Drizzle SQLite get-started](https://orm.drizzle.team/docs/get-started/sqlite-new), [Drizzle connection overview](https://orm.drizzle.team/docs/connect-overview)).

### Lock-in matrix

| Backend            | Switch cost                                      | Export format               |
| ------------------ | ------------------------------------------------ | --------------------------- |
| YAML / JSON files  | low — universal parsers                          | text                        |
| JSONL              | low — `jq` round-trip                            | line-delimited JSON         |
| better-sqlite3     | low within SQLite-family                         | SQLite file / SQL dump      |
| bun:sqlite         | low within SQLite-family                         | SQLite file / SQL dump      |
| libsql / Turso     | low to SQLite; Turso platform features lock-in   | SQLite file / SQL dump      |
| PGlite             | low to Postgres via pg_dump                      | SQL dump / Gzipped tar      |
| Drizzle ORM        | TS schema portable; raw SQL fragments not        | inherits engine             |
| lowdb              | low — JSON object on disk                        | JSON                        |
| electron-store     | low — JSON object on disk                        | JSON (encrypted if keyed)   |
| Postgres           | low within Postgres-family; high to other RDBMS  | SQL dump                    |

INFERRED switch costs based on canonical export-format docs cited above.

---

## Cross-cutting matrix

| Backend            | Test isolation       | OTel auto-instr  | At-rest crypto path             | Built-in PITR    | Live migration    | Health check          |
| ------------------ | -------------------- | ---------------- | ------------------------------- | ---------------- | ----------------- | --------------------- |
| YAML files         | mock-fs / tmpdir     | none (fs only)   | OS FDE / app crypto             | git / FS snap    | read-old-write-new| `fs.access` + parse   |
| JSON files         | mock-fs / tmpdir     | none (fs only)   | OS FDE / app crypto             | git / FS snap    | read-old-write-new| `fs.access` + parse   |
| JSONL append-only  | mock-fs / tmpdir     | none (fs only)   | OS FDE / app crypto             | inherent         | per-line versioned| line tail + parse     |
| better-sqlite3     | `:memory:`           | community plugin | SQLCipher / multi-cipher fork   | online Backup API| `user_version`    | quick_check / integrity_check |
| bun:sqlite         | `:memory:`           | none documented  | OS FDE (no first-party cipher)  | serialize() only | `user_version`    | quick_check / integrity_check |
| libsql             | `:memory:` embedded  | uncertain        | first-party libSQL encryption   | Turso branch+PITR| `user_version`+branch | quick_check / integrity_check |
| PGlite             | `memory://` default  | uncertain        | pgcrypto column / OS FDE        | dumpDataDir       | inherits Postgres | `SELECT 1`            |
| Drizzle ORM        | underlying engine    | logger + custom  | inherits engine                  | inherits engine   | drizzle-kit       | inherits engine       |
| lowdb              | `Memory` adapter     | none             | OS FDE / app crypto             | file copy         | adapter transform | adapter `read()`      |
| electron-store     | `name` per instance  | none             | `encryptionKey` (cbc/gcm/ctr)   | file copy         | `migrations` map  | construct + first read|
| Postgres + pgcrypto| separate test DB     | OTel `postgresql`| pgcrypto + TDE on managed       | WAL archive PITR  | transactional DDL | `SELECT 1`            |

---

## Open evidence gaps

- **bun:sqlite OTel auto-instrumentation**: no canonical package surfaced in primary searches. UNCERTAIN.
- **bun:sqlite SQLCipher build**: no first-party cipher build documented in canonical Bun docs. UNCERTAIN.
- **libsql OTel auto-instrumentation**: third-party DBAL drivers exist, but OTel package status not surfaced. UNCERTAIN.
- **PGlite OTel through `pg`-shim drivers in WASM**: end-to-end pipeline coverage in browser WASM environments not surfaced in primary searches. UNCERTAIN.
- **`fault-injection-fs`-class libraries**: vendor-neutral name varies; no single canonical reference surfaced. UNCERTAIN.
- **Per-Postgres `pgaudit` extension**: referenced in INFERRED context only; not directly searched in this evidence pass.
