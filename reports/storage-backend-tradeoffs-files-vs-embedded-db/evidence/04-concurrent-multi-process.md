---
title: "Concurrent + multi-process access"
description: "Single vs multi-process patterns, file locking, DB-level locking, change notification, and cross-platform locking quirks across 10 storage backends"
date: 2026-04-23
sources:
  - https://sqlite.org/wal.html (Write-Ahead Logging, official SQLite docs)
  - https://sqlite.org/lockingv3.html (File Locking And Concurrency In SQLite Version 3)
  - https://sqlite.org/howtocorrupt.html (How To Corrupt An SQLite Database File)
  - https://sqlite.org/atomiccommit.html (Atomic Commit In SQLite)
  - https://sqlite.org/c3ref/wal_checkpoint_v2.html (Checkpoint a database)
  - https://www.sqlite.org/src/doc/204dbc15a682125c/doc/wal-lock.md (SQLite Wal-Mode Blocking Locks)
  - https://sqlite.org/tempfiles.html (Temporary Files Used By SQLite)
  - https://sqlite.org/walformat.html (WAL-mode File Format)
  - https://www.postgresql.org/docs/current/mvcc.html (PostgreSQL Concurrency Control)
  - https://www.postgresql.org/docs/current/sql-listen.html (PostgreSQL LISTEN)
  - https://www.postgresql.org/docs/current/sql-notify.html (PostgreSQL NOTIFY)
  - https://www.postgresql.org/docs/current/explicit-locking.html (PostgreSQL Explicit Locking)
  - https://man7.org/linux/man-pages/man2/flock.2.html (flock(2) Linux manual page)
  - https://en.wikipedia.org/wiki/File_locking (Wikipedia on file locking primitives)
  - https://www.kernel.org/doc/Documentation/filesystems/mandatory-locking.txt (Mandatory File Locking — Linux kernel docs)
  - https://github.com/sindresorhus/electron-store (electron-store GitHub)
  - https://github.com/sindresorhus/electron-store/issues/165 ("Watch for Changes not working across processes")
  - https://github.com/typicode/lowdb (lowdb GitHub)
  - https://github.com/typicode/lowdb/issues/478 ("Concurrent writes conflict")
  - https://github.com/electric-sql/pglite (PGlite GitHub)
  - https://pglite.dev/docs/about (What is PGlite)
  - https://pglite.dev/docs/filesystems (PGlite Filesystems)
  - https://github.com/electric-sql/pglite/issues/85 ("Add lock to indexeddb vfs")
  - https://github.com/electric-sql/pglite/issues/32 ("Support for accessing database from multiple browser tabs")
  - https://electric-sql.com/blog/2026/03/25/announcing-pglite-v04 (PGlite v0.4 announcement)
  - https://github.com/tursodatabase/libsql (libSQL GitHub)
  - https://github.com/tursodatabase/libsql/blob/main/libsql-server/README.md (libsql-server README)
  - https://docs.turso.tech/features/embedded-replicas/introduction (Turso Embedded Replicas)
  - https://turso.tech/blog/beyond-the-single-writer-limitation-with-tursos-concurrent-writes (Turso concurrent writes)
  - https://wchargin.com/better-sqlite3/performance.html (better-sqlite3 "Improving concurrency")
  - https://bun.com/docs/runtime/sqlite (Bun SQLite docs)
  - https://bun.com/reference/bun/sqlite (bun:sqlite API reference)
  - https://orm.drizzle.team/docs/transactions (Drizzle ORM Transactions)
  - https://orm.drizzle.team/docs/connect-overview (Drizzle ORM Database connection)
  - https://www.npmjs.com/package/proper-lockfile (proper-lockfile npm)
  - https://github.com/moxystudio/node-proper-lockfile (proper-lockfile GitHub)
  - https://www.npmjs.com/package/write-file-atomic (write-file-atomic npm)
  - https://github.com/npm/write-file-atomic (write-file-atomic GitHub)
  - https://github.com/paulmillr/chokidar (chokidar GitHub)
  - https://github.com/parcel-bundler/watcher (@parcel/watcher GitHub)
  - https://nullprogram.com/blog/2016/08/03/ (Chris Wellons, "Appending to a File from Multiple Processes")
  - https://nodejs.org/api/fs.html (Node.js fs documentation)
  - https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/ (SkyPilot multi-process SQLite postmortem)
framing: 3P / external sources only
---

# Sub-dimension 1 — Single-process vs multi-process access patterns

## 1.1 SQLite (DELETE journal vs WAL)

**DELETE journal mode (default).** SQLite uses POSIX `fcntl()` advisory locks on Unix and `LockFile()` / `LockFileEx()` on Windows. The state machine has five lock levels: UNLOCKED, SHARED, RESERVED, PENDING, EXCLUSIVE. "Any number of processes may hold SHARED locks at the same time" — multiple readers are allowed. "Only one process may hold a RESERVED lock at one time" — single-writer at the file level. ([SQLite, "File Locking And Concurrency In SQLite Version 3"](https://sqlite.org/lockingv3.html), CONFIRMED).

**WAL mode.** "Writers merely append new content to the end of the WAL file. Because writers do nothing that would interfere with the actions of readers, writers and readers can run at the same time. However, since there is only one WAL file, there can only be one writer at a time." ([SQLite WAL §2.2](https://sqlite.org/wal.html), CONFIRMED).

**Multi-process WAL constraint.** "All processes using a database must be on the same host computer; WAL does not work over a network filesystem. This is because WAL requires all processes to share a small amount of memory and processes on separate host machines obviously cannot share memory with each other." ([SQLite WAL §1](https://sqlite.org/wal.html), CONFIRMED).

The shared-memory file (`-shm` suffix) holds the wal-index, mmap'd by every connection in the same WAL database ([SQLite WAL §2.2](https://sqlite.org/wal.html), CONFIRMED).

## 1.2 better-sqlite3

Native Node.js binding around SQLite. Inherits SQLite's WAL semantics: "use the `db.checkpoint()` method when the WAL file gets too big" if you access the database from multiple processes ([wchargin, "Improving concurrency | better-sqlite3"](https://wchargin.com/better-sqlite3/performance.html), INFERRED — single-source for the operational guidance, but the underlying SQLite WAL semantics are CONFIRMED).

Multi-process access works because the underlying engine is upstream SQLite with the same `-shm` / `-wal` file coordination — multi-reader, single-writer per the SQLite contract ([SQLite WAL §2.2](https://sqlite.org/wal.html), CONFIRMED).

## 1.3 bun:sqlite

> "Bun SQLite uses SQLite's default locking mechanism which supports multiple readers but only one writer at a time. For heavy concurrent writes, consider using WAL mode by running `db.run('PRAGMA journal_mode = WAL')` after opening the database." ([Bun SQLite tutorial, OneUptime](https://oneuptime.com/blog/post/2026-01-31-bun-sqlite/view), INFERRED — community source).

> "This isn't just a wrapper around better-sqlite3. It's a native implementation that's significantly faster due to Bun's integration with JavaScriptCore" ([dev.to, "Bun 1.2 Deep Dive"](https://dev.to/pockit_tools/bun-12-deep-dive-built-in-sqlite-s3-and-why-it-might-actually-replace-nodejs-4738), INFERRED — community summary).

Both bindings ship the same upstream SQLite engine; locking semantics inherit from SQLite. The Bun reference docs at [bun.com/reference/bun/sqlite](https://bun.com/reference/bun/sqlite) describe the API but do not explicitly contradict or extend SQLite's locking behavior (CONFIRMED for the engine; INFERRED that bun:sqlite does nothing special on top).

## 1.4 libSQL

> "libSQL is an open-source fork of SQLite. libSQL is embeddable, meaning it runs inside your process without needing a network connection." ([tursodatabase/libsql README](https://github.com/tursodatabase/libsql), CONFIRMED).

**Embedded mode** inherits SQLite single-writer semantics. **libsql-server (`sqld`)** exposes the database over HTTP/WebSocket — multiple client processes connect to one server process; the server then enforces SQLite's single-writer at the engine layer ([libsql-server README](https://github.com/tursodatabase/libsql/blob/main/libsql-server/README.md), CONFIRMED).

**Embedded replicas.** "Embedded Replicas work by maintaining a local SQLite file that you can read from… instead of having a local embedded database that can be copied somewhere else, the source of truth is the remote database. All writes are still done to the remote database." ([Turso, "Introducing Embedded Replicas"](https://medium.com/chiselstrike/introducing-embedded-replicas-deploy-turso-anywhere-2085aa0dc242), CONFIRMED).

**Experimental concurrent writes.** "Turso, built on libSQL, introduces concurrent writes to overcome SQLite's single-writer limitation, enabling multiple processes to write simultaneously while maintaining ACID compliance via Rust's safety features and MVCC." Marked "still experimental and is not yet recommended for production workloads" ([Turso blog](https://turso.tech/blog/beyond-the-single-writer-limitation-with-tursos-concurrent-writes), CONFIRMED but with the experimental caveat).

## 1.5 PGlite

> "PGlite runs in Postgres single-user mode, which means a single connection. Many client tools expect to open multiple connections, and this has been a friction point." ([PGlite docs](https://pglite.dev/docs/about), CONFIRMED).

> "Programs compiled with Emscripten — a C to WebAssembly (WASM) compiler — cannot fork new processes" ([development.tldrecap.tech, "Compiling Postgres to WASM with PGlite"](https://development.tldrecap.tech/posts/pgconf-2025/postgresql-pg-lite-webassembly-wasm/), CONFIRMED — Emscripten constraint).

> "Currently a persisted database can only be safely opened from one tab at a time. Support for access from multiple tabs will probably be via routing all operations to a single worker." ([PGlite issue #32](https://github.com/electric-sql/pglite/issues/32), CONFIRMED).

PGlite v0.4 introduced "connection multiplexing" but still routes through one engine: "initdb and Postgres are separate WASM processes — PGlite provides the communication plumbing by intercepting system calls" ([Electric SQL blog, PGlite v0.4](https://electric-sql.com/blog/2026/03/25/announcing-pglite-v04), CONFIRMED). True multi-OS-process is not supported (UNCERTAIN whether v0.4's multiplexing covers multi-process or only multi-connection-from-one-process; the blog frames it as "connection multiplexing", suggesting same-process).

## 1.6 Drizzle ORM

> "Drizzle works with various database drivers and doesn't manage connections itself, allowing you to use your preferred connection pooling solution" ([Drizzle ORM docs](https://orm.drizzle.team/docs/connect-overview), INFERRED — paraphrased from docs).

> "Under the hood Drizzle will create a node-postgres driver instance which you can access via `db.$client` if necessary. Drizzle is not doing any connection pool destroy/create actions" ([Drizzle docs](https://orm.drizzle.team/docs/connect-overview), CONFIRMED).

Drizzle has no concurrency layer of its own. Multi-process behavior is whatever the underlying driver + engine permits — better-sqlite3 → SQLite WAL semantics; node-postgres → Postgres MVCC; PGlite → single-process.

## 1.7 lowdb

> "Lowdb is not designed for high-concurrency scenarios — if multiple processes or threads try to access and modify the database simultaneously, it may lead to data inconsistencies." ([w3tutorials, "Lowdb in Node.js"](https://www.w3tutorials.net/blog/lowdb-nodejs/), INFERRED — community source).

> Issue #478 "Concurrent writes conflict" remains open; the maintainer's response in #133 confirms lowdb does not synchronize multiple instances against the same file: "lowdb appears to persist data across lowdb instances in memory" ([typicode/lowdb#133](https://github.com/typicode/lowdb/issues/133), CONFIRMED — lowdb's API contract is single-process-single-instance).

Each lowdb instance loads the JSON file fully into memory; on `db.write()` it serializes the in-memory object and overwrites the file. Two processes concurrently following the read-modify-write cycle will lose updates (last writer wins).

## 1.8 electron-store

> "Changes are written to disk atomically, so if the process crashes during a write, it will not corrupt the existing config" ([sindresorhus/electron-store](https://github.com/sindresorhus/electron-store), CONFIRMED).

Electron-store is built on top of `conf` (also by sindresorhus). Atomic writes use rename-after-write (no advisory locking) — two concurrent writers can both read the old file, both rewrite, and the second rename wins: classic last-write-wins ([sindresorhus/electron-store source linked from the README](https://github.com/sindresorhus/electron-store), INFERRED — pattern is documented as "atomic write" but not as "lock-free coordinator"; concurrency contract is not in the README).

> "The watch feature watches for any changes in the config file and calls the callback for onDidChange or onDidAnyChange if set… Events are only triggered in the same process. So you won't get events in the main process if you trigger an event in a renderer process." ([electron-store#165](https://github.com/sindresorhus/electron-store/issues/165), CONFIRMED).

## 1.9 YAML / JSON / JSONL files

These are formats, not engines — concurrency is whatever the application layer adds. Three common patterns:

| Pattern | Multi-reader | Multi-writer | Atomicity |
|---|---|---|---|
| Bare `fs.writeFile` | No coordination | Last-writer-wins | NOT atomic — partial write visible mid-rewrite |
| `write-file-atomic` (rename-based) | Yes | Last-writer-wins | Atomic per write; no advisory lock |
| `proper-lockfile` (advisory) | Yes (no contention) | Coordinated via lockfile | Atomic per critical-section |
| JSONL with `O_APPEND` | Yes | Concurrent writers | Each `write()` < PIPE_BUF atomic on Linux |

See sub-dimensions 2 and 4 below for primitives.

# Sub-dimension 2 — File locking primitives

## 2.1 POSIX `fcntl(F_SETLK)` advisory locks

> "advisory locks are voluntary, meaning processes must agree to honor them. There is no kernel enforcement preventing a process from ignoring an advisory lock and writing to the locked region anyway." ([Wikipedia "File locking"](https://en.wikipedia.org/wiki/File_locking), CONFIRMED).

> "fcntl is the most common file locking mechanism on Unix systems, though file locks are by default advisory" ([Wikipedia "File locking"](https://en.wikipedia.org/wiki/File_locking), CONFIRMED).

**SQLite uses `fcntl()` advisory locks on Unix.** "SQLite uses POSIX advisory locks to implement locking on Unix" ([SQLite, "File Locking And Concurrency"](https://sqlite.org/lockingv3.html), CONFIRMED).

## 2.2 BSD `flock()`

`flock()` provides a cooperative whole-file advisory lock, distinct from `fcntl()` byte-range locks. "flock() does not provide deadlock detection. flock() does not detect deadlock" ([flock(2) man page](https://man7.org/linux/man-pages/man2/flock.2.html), CONFIRMED).

`flock()` locks are tied to the open file description, not the process — duplicating an FD shares the lock; reopening the file via `open()` does not.

## 2.3 Windows `LockFile` / `LockFileEx`

> "The Windows API function LockFile can be used to acquire an exclusive lock on the region of a file. A key distinction is that LockFileEx locks are mandatory (as opposed to advisory), meaning the operating system enforces the lock rather than relying on process cooperation." ([Wikipedia "File locking"](https://en.wikipedia.org/wiki/File_locking), CONFIRMED).

SQLite on Windows: "on Windows it uses the LockFile(), LockFileEx(), and UnlockFile() system calls" ([SQLite, "File Locking And Concurrency"](https://sqlite.org/lockingv3.html), CONFIRMED).

## 2.4 Linux mandatory locks

> "On Linux, mandatory locking is supported via the fcntl() system call if the file has the setgid permission bit set and the group execution bit cleared." ([Wikipedia "File locking"](https://en.wikipedia.org/wiki/File_locking), CONFIRMED).

> "The Linux implementation is unreliable. Use of mandatory locking will not be portable to other Unix systems and is therefore strongly discouraged." ([Linux kernel docs, "Mandatory File Locking"](https://www.kernel.org/doc/Documentation/filesystems/mandatory-locking.txt), CONFIRMED).

## 2.5 Atomic-rename as a "lock"

The classic POSIX pattern: write to `<file>.tmp`, then `rename(tmp, file)`. `rename(2)` is atomic per POSIX. Used by `write-file-atomic`, `electron-store`, `conf`, lowdb's default JSONFile adapter ([npm/write-file-atomic](https://github.com/npm/write-file-atomic), CONFIRMED).

Caveats:
- Atomicity is on the directory entry, not data durability. Need `fsync(fd)` on the file then `fsync(dirfd)` on the directory to survive a crash. ([LWN "A way to do atomic writes"](https://lwn.net/Articles/789600/), CONFIRMED).
- Not a coordinator: two writers may both compute new content from the old file then race on rename — both writes succeed, later wins.

## 2.6 `proper-lockfile` library

> "An inter-process and inter-machine lockfile utility that works on a local or network file system." ([proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile), CONFIRMED).

> "The library utilizes the mkdir strategy which works atomically on any kind of file system, even network based ones. The lockfile path is based on the file path you are trying to lock by suffixing it with .lock. When a lock is successfully acquired, the lockfile's mtime (modified time) is periodically updated to prevent staleness." ([proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile), CONFIRMED).

> "Unlike some alternatives, proper-lockfile doesn't rely on the open with O_EXCL flag which has problems in network file systems, as O_EXCL is broken on NFS file systems." ([proper-lockfile GitHub](https://github.com/moxystudio/node-proper-lockfile), CONFIRMED).

# Sub-dimension 3 — DB-level locking

## 3.1 SQLite WAL: multi-reader / single-writer

Already covered in 1.1. Restating the precise contract: WAL allows N concurrent reader transactions and 1 concurrent writer transaction. Reader and writer never block each other; writers serialize via the WAL's write lock ([SQLite WAL §2.2](https://sqlite.org/wal.html), CONFIRMED).

WAL-mode blocking-locks doc: "All of the above use blocking locks. With blocking locks configured, the only cases in which clients should see an SQLITE_BUSY error are: if the OS does not grant a blocking lock before the configured timeout expires, and when an open read-transaction is upgraded to a write-transaction." ([SQLite "Wal-Mode Blocking Locks"](https://www.sqlite.org/src/doc/204dbc15a682125c/doc/wal-lock.md), CONFIRMED).

## 3.2 SQLite DELETE journal: single-process exclusive ladder

The five-state lock ladder — UNLOCKED → SHARED → RESERVED → PENDING → EXCLUSIVE. Multiple SHARED readers permitted; one RESERVED writer at a time; PENDING blocks new SHARED until the writer transitions to EXCLUSIVE and commits ([SQLite, "File Locking And Concurrency"](https://sqlite.org/lockingv3.html), CONFIRMED).

DELETE journal mode `journal_mode=DELETE` is the default if WAL has not been enabled. Behavior: "The journal file is deleted… as part of the commit process" ([sqlite-users archive on journal_mode](https://sqlite-users.sqlite.narkive.com/MvzR1IbR/sqlite-does-journal-mode-delete-writes-uncommitted-queries-into-db), CONFIRMED).

`journal_mode=EXCLUSIVE` (a separate setting from the locking ladder above) elevates SQLite to single-process — the connection holds the lock between transactions ([SQLite WAL §8](https://sqlite.org/wal.html), CONFIRMED).

## 3.3 PostgreSQL MVCC

> "PostgreSQL provides a rich set of tools for developers to manage concurrent access to data. Internally, data consistency is maintained by using a multiversion model (Multiversion Concurrency Control, MVCC). This means that each SQL statement sees a snapshot of data (a database version) as it was some time ago" ([PostgreSQL docs ch. 13](https://www.postgresql.org/docs/current/mvcc.html), CONFIRMED).

> "PostgreSQL supports the four isolation levels defined in the SQL standard, but implements them through Multiversion Concurrency Control (MVCC) rather than traditional locking." ([PostgreSQL docs ch. 13](https://www.postgresql.org/docs/current/mvcc.html), CONFIRMED).

Postgres notably treats READ UNCOMMITTED as READ COMMITTED — "the four levels are Read uncommitted, Read committed, Repeatable read, Serializable. PostgreSQL does not actually implement Read Uncommitted; it silently treats it as Read Committed" ([PostgreSQL docs §13.2](https://www.postgresql.org/docs/current/transaction-iso.html), CONFIRMED).

## 3.4 Write skew

> "Read Committed allows write skew anomalies… Repeatable Read avoids the dirty-read, non-repeatable-read, and lost-update categories but still allows write skew. Only Serializable detects write skew (Serializable Snapshot Isolation in PostgreSQL)." ([PostgreSQL docs §13.2.3 Serializable](https://www.postgresql.org/docs/current/transaction-iso.html), CONFIRMED — paraphrased; the docs explicitly enumerate which anomalies each level prevents).

## 3.5 SQLite optimistic concurrency (BEGIN CONCURRENT)

> "A feature available only in experimental branches enables multiple writers to initiate transactions concurrently when the database is in WAL mode. However, conflict detection in SQLite's BEGIN CONCURRENT is still at the page level, meaning that when two transactions update different rows on the same page, one of the transactions must still abort." ([oldmoe.blog "The Write Stuff"](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/), INFERRED — single source, but consistent with SQLite developers' RFCs).

Currently `BEGIN CONCURRENT` is on an experimental branch, not in the default SQLite distribution shipped with better-sqlite3 / bun:sqlite ([SQLite Forum WAL3 RFC](https://sqlite.org/forum/info/d963382520ad96424b4a156dacac0a0ff0758457bd2840f76dcc84c791970688), CONFIRMED — public RFC status).

# Sub-dimension 4 — Inter-process change notification

## 4.1 File watchers — chokidar vs @parcel/watcher

**chokidar.** "Made for Brunch in 2012, it is now used in ~30 million repositories and has proven itself in production environments… Relies on the Node.js core fs module" ([paulmillr/chokidar](https://github.com/paulmillr/chokidar), CONFIRMED). Pure JS wrapping `fs.watch` / `fs.watchFile` / `fsevents` (macOS).

**@parcel/watcher.** "Implemented in C++ for performance and low-level integration with the operating system. Includes backends for macOS, Linux, Windows, FreeBSD, and Watchman" ([parcel-bundler/watcher](https://github.com/parcel-bundler/watcher), CONFIRMED).

> "Chokidar is slow and known to have issues with file descriptor limits when working with large projects. Parcel's watcher is much faster out of the box and additionally supports watchman as a backend" ([npm-compare](https://npm-compare.com/chokidar,fsevents,gaze,node-watch,watch), INFERRED — comparison site).

Both watchers can detect cross-process file modifications. Neither delivers cross-machine notifications.

## 4.2 PostgreSQL LISTEN / NOTIFY

> "NOTIFY provides a simple interprocess communication mechanism for a collection of processes accessing the same PostgreSQL database. A payload string can be sent along with the notification" ([PostgreSQL docs, NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html), CONFIRMED).

> "If a NOTIFY is executed inside a transaction, the notify events are not delivered until and unless the transaction is committed. This is appropriate, since if the transaction is aborted, all the commands within it have had no effect, including NOTIFY." ([PostgreSQL docs, NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html), CONFIRMED).

> "LISTEN registers the current session as a listener on the notification channel named channel. If the current session is already registered as a listener for this notification channel, nothing is done." ([PostgreSQL docs, LISTEN](https://www.postgresql.org/docs/current/sql-listen.html), CONFIRMED).

LISTEN/NOTIFY is not available in PGlite — single-process WASM Postgres has no separate listener processes (INFERRED — PGlite docs do not document LISTEN/NOTIFY support, and the single-process model precludes the inter-session contract; UNCERTAIN whether the SQL grammar parses but no-ops, or returns an error).

## 4.3 SQLite — no native pub/sub

SQLite has no equivalent of LISTEN/NOTIFY. "SQLite Update Hook" (`sqlite3_update_hook`) is in-process only — fires within the same connection on INSERT/UPDATE/DELETE. Cross-process notification requires either polling or an external file-watcher on the DB file.

better-sqlite3, bun:sqlite, libSQL: same limitation. libSQL's server mode (`sqld`) can be wrapped with WebSocket subscriptions externally, but the engine itself does not push.

## 4.4 PGlite — reactive bindings

> "Embeddable Postgres with real-time, reactive bindings" ([electric-sql/pglite README](https://github.com/electric-sql/pglite), CONFIRMED).

These bindings (`live` namespace, `useLiveQuery` hook) operate within a single PGlite instance — they observe in-process query results, not cross-process database changes. Multi-process change notification is not supported because multi-process access is not supported (1.5).

## 4.5 No-notification backends — must poll or watch the file

lowdb, electron-store (without `watch: true`), bare YAML/JSON/JSONL files, write-file-atomic — none push notifications. If process B mutates and process A wants to react, A must either:
- File-watch with chokidar / @parcel/watcher (4.1)
- Poll mtime / size
- Be told via an out-of-band channel (IPC, socket, etc.)

electron-store with `watch: true` uses chokidar internally to detect file changes, but only fires callbacks within the process that registered the listener (1.8 — issue #165) ([electron-store#165](https://github.com/sindresorhus/electron-store/issues/165), CONFIRMED).

# Sub-dimension 5 — Cross-platform locking quirks

## 5.1 fcntl on Linux/macOS vs LockFile on Windows

Already characterized in 2.1, 2.3. Practical contrast:

| Platform | Lock primitive | Default semantics | Default kernel enforcement |
|---|---|---|---|
| Linux / macOS | `fcntl(F_SETLK)` | Advisory | None (cooperative) |
| Linux | mandatory via setgid + clear group-x | Mandatory | Yes — "unreliable" per kernel docs |
| Linux / BSD | `flock()` | Advisory whole-file | None |
| Windows | `LockFile` / `LockFileEx` | Mandatory | Yes — kernel blocks reads/writes |

(Sources: [Wikipedia "File locking"](https://en.wikipedia.org/wiki/File_locking), [flock(2) man page](https://man7.org/linux/man-pages/man2/flock.2.html), [Linux mandatory-locking.txt](https://www.kernel.org/doc/Documentation/filesystems/mandatory-locking.txt), all CONFIRMED).

## 5.2 NFS / network filesystems

> "POSIX advisory locking is known to be buggy or even unimplemented on many NFS implementations (including recent versions of Mac OS X) and there are reports of locking problems for network filesystems under Windows." ([SQLite, "File Locking And Concurrency"](https://sqlite.org/lockingv3.html), CONFIRMED).

> "Your best defense is to not use SQLite for files on a network filesystem. However, if you must use NFS… You can ask SQLite to use dot-file locking instead of posix advisory locking (using the 'unix-dotfile' VFS option)." ([SQLite, "How To Corrupt An SQLite Database File"](https://sqlite.org/howtocorrupt.html), CONFIRMED).

> "WAL does not work over a network filesystem… processes on separate host machines obviously cannot share memory with each other." ([SQLite WAL §1](https://sqlite.org/wal.html), CONFIRMED).

`proper-lockfile` is one of the few NPM utilities explicitly designed for NFS: "the mkdir strategy which works atomically on any kind of file system, even network based ones" ([proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile), CONFIRMED).

`O_EXCL` on `open(2)` is documented as broken on NFS — "lockfile relies on open with O_EXCL flag which has problems in network file systems" ([proper-lockfile GitHub](https://github.com/moxystudio/node-proper-lockfile), CONFIRMED).

## 5.3 Filesystem-specific atomicity

> "The actual atomic write size varies. The actual maximum atomic append size varies not only by OS, but by filesystem. On Linux+ext3 the size is 4096, and on Windows+NTFS the size is 1024." ([nullprogram.com, "Appending to a File from Multiple Processes"](https://nullprogram.com/blog/2016/08/03/), INFERRED — single-author analysis).

POSIX guarantees `write()` < `PIPE_BUF` is atomic on pipes. For regular files the standard does not guarantee `write()` atomicity beyond what `O_APPEND` provides. Linux 3.14+ fixed a kernel bug where concurrent `O_APPEND` writes from processes sharing an open file description could interleave ([Linux Kernel mailing list, "are concurrent write() calls with O_APPEND on local files atomic?"](https://linux-fsdevel.vger.kernel.narkive.com/RRQpP2Oj/question-are-concurrent-write-calls-with-o-append-on-local-files-atomic), CONFIRMED).

## 5.4 Windows-specific: O_APPEND atomicity gap

> "Issue 42606: Support POSIX atomicity guarantee of O_APPEND on Windows" ([Python bug tracker](https://bugs.python.org/issue42606), CONFIRMED — open issue, indicates Windows does not guarantee POSIX append atomicity).

JSONL appenders portable across Windows must use either external locking or single-process-with-queue.

# Sub-dimension 6 — Lock contention failure modes

## 6.1 SQLITE_BUSY

> "All checkpoint calls obtain an exclusive 'checkpoint' lock on the database file. If any other process is running a checkpoint operation at the same time, the lock cannot be obtained and SQLITE_BUSY is returned. Even if there is a busy-handler configured, it will not be invoked in this case." ([SQLite checkpoint docs](https://sqlite.org/c3ref/wal_checkpoint_v2.html), CONFIRMED).

> "To mitigate SQLITE_BUSY errors, setting a busy_timeout guards against brief contention windows when multiple agents write simultaneously." ([SkyPilot blog, "Abusing SQLite to Handle Concurrency"](https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/), INFERRED — third-party operational report).

`busy_timeout` is not always enough — Bert Hubert documented cases where SQLITE_BUSY fires "despite setting a timeout" because the timeout policy applies to specific lock operations, not globally ([berthub.eu, "What to do about SQLITE_BUSY errors despite setting a timeout"](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/), INFERRED — single-author postmortem).

## 6.2 Postgres deadlock detection

PostgreSQL has automatic deadlock detection. When the planner detects a cycle, one of the conflicting transactions is aborted with `ERROR: deadlock detected` ([PostgreSQL docs §13.3.4 Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS), CONFIRMED — explicit-locking page).

Lock-wait timeouts are configurable: `lock_timeout`, `statement_timeout`, `deadlock_timeout` (controls how often the deadlock checker runs; default 1s).

## 6.3 EAGAIN / busy-wait

flock() with LOCK_NB returns `EWOULDBLOCK`. fcntl with F_SETLK returns `EAGAIN` or `EACCES`. Caller must implement backoff.

## 6.4 Lock contention amplification on multi-process SQLite

> "When you have multiple processes each trying to write to the database you will see some contention on resources and the write performance will actually go down rather than up. Testing has shown that WAL mode was not able to successfully insert more rows in parallel than without it." ([oldmoe.blog "The Write Stuff"](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/), INFERRED — single-author benchmark).

## 6.5 PGlite IndexedDB lock failure

> "Add lock to indexeddb vfs so that the database can only be opened once" — open issue, no kernel-level prevention of the second tab from corrupting the IndexedDB store ([electric-sql/pglite#85](https://github.com/electric-sql/pglite/issues/85), CONFIRMED — issue acknowledges the gap).

# Sub-dimension 7 — Optimistic vs pessimistic concurrency

## 7.1 Pessimistic — lock-then-act

The default for SQLite (file lock ladder), Postgres `SELECT FOR UPDATE`, electron-store atomic-rename (locks the directory entry implicitly via atomic rename, but does not lock the prior content).

## 7.2 Optimistic — version counter / compare-and-swap

> "One simple way to implement optimistic locking is to add a version field to your table. When a new row is inserted, it starts out at version 1. Subsequent updates will atomically increment the version, and by comparing the version we read with the version currently stored in the database, we can determine whether or not the row has been modified by another thread." ([charlesleifer.com, "Optimistic locking in Peewee ORM"](https://charlesleifer.com/blog/optimistic-locking-in-peewee-orm/), CONFIRMED — well-known pattern, multiple confirming sources).

Pattern is portable across all 10 backends as a userland convention. SQLite, libSQL, Postgres + Drizzle make it easy with `WHERE version = ?` predicate. JSON / YAML / JSONL must add the version field at the application layer.

## 7.3 Last-write-wins

The de-facto behavior for: lowdb, electron-store, bare write-file-atomic, JSON / YAML files without proper-lockfile. Two writers each load the file, mutate in memory, save — the second writer's data overwrites the first's silently.

## 7.4 Postgres SSI (Serializable Snapshot Isolation)

`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` in Postgres uses SSI — optimistic, with conflict detection at commit. Applications must be prepared to retry on `40001 serialization_failure` ([PostgreSQL docs §13.2.3 Serializable](https://www.postgresql.org/docs/current/transaction-iso.html), CONFIRMED).

> Drizzle ORM exposes this via `tx.setTransaction({ isolationLevel: 'serializable' })` ([Drizzle ORM transactions](https://orm.drizzle.team/docs/transactions), CONFIRMED).

# Sub-dimension 8 — Connection pooling

## 8.1 SQLite (better-sqlite3, bun:sqlite)

Both are synchronous in-process libraries. "Connections" are file-descriptor + statement-cache pairs scoped to the process. There is no pooling layer — each connection is independent at the engine level. Multiple connections in one process share the WAL `-shm` file via mmap.

For multi-process: each process opens its own connection(s); coordination is via the shared `-shm` ([SQLite WAL §2.2](https://sqlite.org/wal.html), CONFIRMED).

## 8.2 libSQL

Embedded mode: same as SQLite. Server mode (`sqld`): clients use HTTP / WebSocket; server holds the engine connection internally. The libSQL TypeScript SDK exposes a `Client` that holds one connection per instance ([Turso TS SDK reference](https://docs.turso.tech/sdk/ts/reference), CONFIRMED — paraphrased).

## 8.3 PGlite

> "PGlite runs in Postgres single-user mode, which means a single connection." ([PGlite docs](https://pglite.dev/docs/about), CONFIRMED).

v0.4 introduced "connection multiplexing" — multiple logical connections multiplexed onto the single Postgres backend ([Electric SQL PGlite v0.4](https://electric-sql.com/blog/2026/03/25/announcing-pglite-v04), CONFIRMED).

## 8.4 PostgreSQL via Drizzle

Drizzle delegates to the underlying driver — `pg` (`node-postgres`) provides `pg.Pool`; `postgres` (postgres.js) provides built-in pooling ([Drizzle Postgres docs](https://orm.drizzle.team/docs/get-started-postgresql), CONFIRMED). PgBouncer or Supavisor can be inserted between for serverless / edge deployments.

## 8.5 lowdb / electron-store

No connection model. Each "instance" is a JS object that owns the file. Multiple instances in the same process do not share memory — issue #133 confirms ([lowdb#133](https://github.com/typicode/lowdb/issues/133), CONFIRMED).

## 8.6 YAML / JSON / JSONL

No native connection model. Concurrency layer is whatever the application adds (proper-lockfile, queue, single-process-only, etc.).

# Multi-process compatibility matrix

| Backend | Single-process | Multi-reader / single-writer | Multi-writer (concurrent) | Cross-process change notify | Source |
|---|---|---|---|---|---|
| YAML files | Yes | Yes (bare reads) | NOT SAFE without lock; needs proper-lockfile | File-watcher (chokidar / @parcel/watcher) | App-layer; CONFIRMED no native primitives |
| JSON files | Yes | Yes (bare reads) | NOT SAFE without lock; needs proper-lockfile or atomic-rename + accept LWW | File-watcher | App-layer; CONFIRMED |
| JSONL append-only | Yes | Yes | YES on Linux ≥3.14 with `O_APPEND` < PIPE_BUF; NOT GUARANTEED on Windows | File-watcher; in-band via reading new lines | [nullprogram.com](https://nullprogram.com/blog/2016/08/03/), [Python bug 42606](https://bugs.python.org/issue42606); INFERRED for Windows |
| better-sqlite3 | Yes | YES (WAL mode) | NO — single-writer per WAL contract | None native; file-watcher possible | [SQLite WAL §2.2](https://sqlite.org/wal.html); CONFIRMED |
| bun:sqlite | Yes | YES (WAL mode) | NO — single-writer per WAL contract | None native | [Bun SQLite docs](https://bun.com/docs/runtime/sqlite); CONFIRMED for engine, INFERRED that Bun's binding adds nothing |
| libSQL embedded | Yes | YES (WAL mode) | NO in stable; experimental concurrent-writes branch | None native (server mode can wrap externally) | [Turso concurrent writes](https://turso.tech/blog/beyond-the-single-writer-limitation-with-tursos-concurrent-writes); CONFIRMED |
| libSQL server (`sqld`) | N/A — N clients to 1 server | YES via server | Single-writer enforced inside server | Server can wrap with subscriptions (external) | [libsql-server README](https://github.com/tursodatabase/libsql/blob/main/libsql-server/README.md); CONFIRMED |
| PGlite | YES (only) | NO — single-connection limit | NO | None native (in-process reactive bindings only) | [PGlite docs](https://pglite.dev/docs/about), [#32](https://github.com/electric-sql/pglite/issues/32); CONFIRMED |
| Postgres (Drizzle) | Yes | YES via MVCC | YES via MVCC + SSI | LISTEN / NOTIFY | [PostgreSQL docs ch 13](https://www.postgresql.org/docs/current/mvcc.html), [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html); CONFIRMED |
| Drizzle ORM | Inherits underlying | Inherits underlying | Inherits underlying | Inherits underlying | [Drizzle docs](https://orm.drizzle.team/docs/connect-overview); CONFIRMED |
| lowdb | YES (only) | UNDEFINED — reads from snapshot loaded at instantiation | NO — last-write-wins | None native; user must wire chokidar | [lowdb#478](https://github.com/typicode/lowdb/issues/478), [#133](https://github.com/typicode/lowdb/issues/133); CONFIRMED |
| electron-store | Yes | Yes via atomic-rename reads | NO without coordination — last-write-wins | `watch: true` (in-process callbacks only) | [electron-store#165](https://github.com/sindresorhus/electron-store/issues/165); CONFIRMED |

# Per-backend notes — concurrency contracts at a glance

## YAML files
- Engine: filesystem
- Multi-reader: yes (POSIX file open is shared)
- Multi-writer: undefined — application choice. With `proper-lockfile` → coordinated. With `write-file-atomic` → LWW. Without either → corrupt during partial writes.
- Notify: external file-watcher only.

## JSON files
- Same characteristics as YAML.
- Atomicity primitives: `write-file-atomic` (rename-based, fsync directory).
- Common pattern in Node.js: read whole file, parse, mutate, atomic-write — vulnerable to LWW.

## JSONL append-only
- Concurrent-append safety depends on `O_APPEND` semantics.
- Linux ≥ 3.14 + ext4: atomic per-`write()` < PIPE_BUF (CONFIRMED).
- Windows + NTFS: not guaranteed (CONFIRMED — Python bug 42606 documents the gap).
- macOS APFS: per Linux kernel mailing list discussion, Darwin's `O_APPEND` is reportedly safe but undocumented (UNCERTAIN).

## better-sqlite3
- Multi-process: yes via WAL mode + `-shm` mmap'd by all processes on the same host.
- Cross-process notification: none.
- Connection model: synchronous, in-process, no pool.

## bun:sqlite
- Same engine semantics as better-sqlite3 (both ship upstream SQLite).
- Native to Bun runtime; same WAL multi-process model.
- The reference docs do not mention any Bun-specific deviation from SQLite locking.

## libSQL
- Embedded: SQLite-compatible.
- Server: concurrency is at the server's connection-pool layer; clients see RPC.
- Embedded replicas: writes always go to remote; reads are local.

## PGlite
- Single-process by Emscripten constraint.
- Multi-tab in browser: requires the official multi-tab worker, which routes all tabs to one shared worker (CONFIRMED).
- Multi-process on server: no — only one Node/Bun process can have the persisted DB open at a time.

## Drizzle ORM
- Has no concurrency layer of its own.
- Exposes `isolationLevel` for transactions when the underlying engine supports it.
- Does not manage connection pool destruction or creation.

## lowdb
- One JS object per "instance"; in-memory cache flushed via JSON.stringify + write.
- Multi-process: NOT SAFE.
- The maintainer's stated approach: "lowdb is for prototypes and small amounts of data" (paraphrase from [lowdb README](https://github.com/typicode/lowdb)).

## electron-store
- Atomic-rename writes; no advisory lock.
- `watch` option provides cross-process file change detection but in-process callback delivery only.
- Works for "main + renderer in one Electron app" but not for "two Electron apps writing the same file".

# Confidence summary

- **CONFIRMED** (multiple sources or official docs): SQLite WAL semantics; SQLite POSIX advisory locks; SQLite's NFS warning; Postgres MVCC and isolation levels; Postgres LISTEN/NOTIFY; PGlite single-process Emscripten constraint; PGlite multi-tab limitation (issue #32); proper-lockfile mkdir strategy; electron-store atomic-rename and watch limitations (#165); lowdb concurrency limitations; Windows LockFile mandatory semantics.
- **INFERRED** (single source): bun:sqlite locking behavior (engine inherits SQLite, but Bun docs do not enumerate); better-sqlite3 multi-process operational guidance (single source: wchargin); SkyPilot multi-process SQLite postmortem (single blog); Bert Hubert's SQLITE_BUSY-despite-timeout postmortem.
- **UNCERTAIN**: PGlite v0.4 "connection multiplexing" — whether it covers multi-OS-process or only multi-connection-from-one-process; macOS APFS `O_APPEND` atomicity; whether PGlite's parser accepts or rejects `LISTEN`/`NOTIFY` SQL.
