---
title: "Distribution + footprint + cross-platform"
description: "Install size, native binary requirements, cross-platform locking, code signing, bundling, git-friendliness, and Bun/Node/WASM compatibility across 10 storage backends"
date: 2026-04-23
sources:
  - https://www.npmjs.com/package/better-sqlite3
  - https://www.npmjs.com/package/yaml
  - https://www.npmjs.com/package/lowdb
  - https://www.npmjs.com/package/electron-store
  - https://www.npmjs.com/package/@electric-sql/pglite
  - https://www.npmjs.com/package/@libsql/client
  - https://www.npmjs.com/package/@libsql/client-wasm
  - https://www.npmjs.com/package/libsql
  - https://www.npmjs.com/package/drizzle-orm
  - https://bundlephobia.com/package/better-sqlite3
  - https://bundlephobia.com/package/sqlite3
  - https://bundlephobia.com/package/js-yaml
  - https://bun.com/docs/runtime/sqlite
  - https://bun.com/reference/bun/sqlite
  - https://github.com/WiseLibs/better-sqlite3/discussions/1057
  - https://github.com/oven-sh/bun/issues/16050
  - https://github.com/electric-sql/pglite
  - https://github.com/electric-sql/pglite/issues/477
  - https://github.com/electric-sql/pglite/issues/324
  - https://pglite.dev/docs/
  - https://pglite.dev/docs/multi-tab-worker
  - https://pglite.dev/docs/filesystems
  - https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
  - https://www.electronjs.org/docs/latest/tutorial/asar-archives
  - https://www.electronforge.io/config/plugins/auto-unpack-natives
  - https://www.electronforge.io/guides/code-signing/code-signing-macos
  - https://www.electron.build/configuration.html
  - https://github.com/electron/rebuild/issues/591
  - https://github.com/electron/electron-rebuild/issues/886
  - https://github.com/WiseLibs/better-sqlite3/issues/1027
  - https://github.com/WiseLibs/better-sqlite3/issues/1382
  - https://github.com/WiseLibs/better-sqlite3/issues/1384
  - https://github.com/WiseLibs/better-sqlite3/issues/1111
  - https://developer.apple.com/documentation/security/resolving-common-notarization-issues
  - https://developer.apple.com/developer-id/
  - https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/
  - https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
  - https://learn.microsoft.com/en-us/answers/questions/5584097/how-to-bypass-windows-defender-smartscreen-even-af
  - https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation
  - https://signmycode.com/resources/bypass-smartscreen-for-signed-application-on-windows-8
  - https://github.com/evanw/esbuild/issues/1051
  - https://www.npmjs.com/package/esbuild-node-externals
  - https://vite.dev/config/build-options
  - https://orm.drizzle.team/
  - https://github.com/drizzle-team/drizzle-orm
  - https://en.wikipedia.org/wiki/File_locking
  - https://github.com/mohd-akram/os-lock
  - https://www.npmjs.com/package/os-lock
  - https://github.com/moxystudio/node-proper-lockfile
  - https://sqlite.org/howtocorrupt.html
  - https://sqlite.org/whynotgit.html
  - https://forums.zotero.org/discussion/66980/dropbox-a-prompt-for-a-solution
  - https://docs.gotosocial.org/en/latest/advanced/sqlite-networked-storage/
  - https://sqlite.org/forum/info/867dc34083a418d5
  - https://ongardie.net/blog/sqlite-in-git/
  - https://github.com/cannadayr/git-sqlite
  - https://garrit.xyz/posts/2023-11-01-tracking-sqlite-database-changes-in-git
  - https://jsonlines.org/
  - https://en.wikipedia.org/wiki/JSON_streaming
  - https://git-scm.com/docs/git-checkout
  - https://github.com/nodejs/node/issues/18518
  - https://github.com/nodejs/node/issues/45404
  - https://github.com/vitejs/vite/issues/16317
framing: 3P / external sources only
---

## 1. Install size

### YAML files (`yaml@2`)

`yaml@2` ships as pure JavaScript with **no external dependencies** ([npm/yaml](https://www.npmjs.com/package/yaml)). The package describes itself as "A complete JavaScript implementation" and reports ~85M weekly downloads. CONFIRMED no native binding. Bundlephobia carries a sizing page for the comparable `js-yaml@4.1.0` ([Bundlephobia/js-yaml](https://bundlephobia.com/package/js-yaml)); exact gzipped figures should be read off that page directly. INFERRED from the "no external dependencies" claim that the unpacked size is dominated by source + types alone.

### JSON files

JSON parsing uses the V8/JSC built-in `JSON.parse` / `JSON.stringify`. **Zero install footprint** beyond the runtime itself. CONFIRMED.

### JSONL append-only

JSONL ("JSON Lines" / NDJSON) is a wire format ([jsonlines.org](https://jsonlines.org/), [Wikipedia: JSON streaming](https://en.wikipedia.org/wiki/JSON_streaming)). No mandatory library — line-by-line parsing can be implemented over the same `JSON.parse` built-in. Optional helpers (e.g. `ndjson` / `JSONStream`) add small JS-only payloads. CONFIRMED zero mandatory binary footprint.

### `better-sqlite3`

npm reports an install size of **10.3 MB (11 MB unpacked)** for `better-sqlite3@12.9.0` ([npm/better-sqlite3](https://www.npmjs.com/package/better-sqlite3) — surfaced via search aggregator citing the npm sidebar). This figure includes the prebuilt native `.node` binary downloaded by `prebuild-install` for the host's `(target, runtime, arch, libc, platform)` tuple. CONFIRMED size; INFERRED that only the matching prebuild is unpacked at install (others are skipped). The package's npm install command is `npm i better-sqlite3` ([npm/better-sqlite3](https://www.npmjs.com/package/better-sqlite3)).

### `bun:sqlite`

Built into the Bun runtime — **no separate install, zero added install footprint** in a Bun project ([Bun: SQLite docs](https://bun.com/docs/runtime/sqlite), [Bun API reference](https://bun.com/reference/bun/sqlite)). Costs are amortized into the Bun binary download. CONFIRMED.

### libSQL

Two physical packages:

- `@libsql/client` — battle-tested driver with native bindings; supports Bun, Deno, and Node on macOS, Linux, and Windows ([npm/@libsql/client](https://www.npmjs.com/package/@libsql/client)). Specific install size not surfaced in the npm overview returned by search; UNCERTAIN.
- `@libsql/client-wasm` — WebAssembly variant reported at **5.53 MB** package size ([npm/@libsql/client-wasm](https://www.npmjs.com/package/@libsql/client-wasm), surfaced via search aggregator). CONFIRMED for the WASM build.

### PGlite (`@electric-sql/pglite`)

Package described as "**3mb gzipped**" by the project README ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite); also surfaced as "3.7mb gzipped" via the npm aggregator for `@electric-sql/pglite` ([npm/@electric-sql/pglite](https://www.npmjs.com/package/@electric-sql/pglite))). The two figures represent slightly different points (project headline vs. an aggregator measurement of the npm tarball). Issue #477 explicitly flags **install-size growth across versions** as a deployment-limit problem ([electric-sql/pglite#477](https://github.com/electric-sql/pglite/issues/477)). CONFIRMED ~3-3.7 MB gzipped order of magnitude; UNCERTAIN exact unpacked size by version.

### Drizzle ORM

Drizzle ORM is **~7.4 KB minified+gzipped** with **zero dependencies** and is **tree-shakeable** ([orm.drizzle.team](https://orm.drizzle.team/), [GitHub drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)). It does not bundle a database itself — it is a TypeScript ORM layer that delegates I/O to a separately installed driver (`better-sqlite3`, `@libsql/client`, `pg`, etc.). CONFIRMED.

### lowdb

Pure-ESM JavaScript with "plain JavaScript with safe atomic writes and hackable adapters" ([npm/lowdb](https://www.npmjs.com/package/lowdb)). Lodash is **not a required dependency** — the docs describe extending `lowdb` with lodash, ramda, etc. as optional, so the core package does not ship lodash by default. CONFIRMED no native binding; exact unpacked size not surfaced — UNCERTAIN.

### electron-store

Pure-JS package; "data is saved in a JSON file named `config.json` in `app.getPath('userData')`" ([npm/electron-store](https://www.npmjs.com/package/electron-store)). Latest version 11.0.2, MIT license, ~686K downloads at the time of the fetch; native ESM only — CommonJS consumers must convert. CONFIRMED no native binding; exact unpacked size not surfaced — UNCERTAIN.

## 2. Native binary requirements

### Pure-JS / built-in (no native binding)

- **YAML / JSON / JSONL files** — no native code path. CONFIRMED.
- **Drizzle ORM** — TypeScript-only library with zero dependencies ([GitHub drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)). The driver underneath may be native; Drizzle itself is not.
- **lowdb** — pure JS adapters ([npm/lowdb](https://www.npmjs.com/package/lowdb)). CONFIRMED.
- **electron-store** — pure JS over `app.getPath('userData')` ([npm/electron-store](https://www.npmjs.com/package/electron-store)). CONFIRMED.

### Native + prebuild distribution

- **`better-sqlite3`** — distributes prebuilt `.node` binaries via `prebuild-install`. The install script runs `prebuild-install || node-gyp rebuild --release`, falling back to a source build if no prebuild matches the host tuple ([GitHub WiseLibs/better-sqlite3#1027](https://github.com/WiseLibs/better-sqlite3/issues/1027), [#1382](https://github.com/WiseLibs/better-sqlite3/issues/1382), [#1384](https://github.com/WiseLibs/better-sqlite3/issues/1384)). Source-build fallback requires Python and a C++ compiler. CONFIRMED.
- **`@libsql/client` (native)** — native bindings for macOS/Linux/Windows under Node, Deno, and Bun ([npm/@libsql/client](https://www.npmjs.com/package/@libsql/client)). Specific prebuild platform matrix not surfaced in the npm overview captured — UNCERTAIN.

### Built-in (runtime-bundled)

- **`bun:sqlite`** — built directly into Bun; "zero additional dependencies, instant setup" ([Bun: SQLite docs](https://bun.com/docs/runtime/sqlite)). Powered by JavaScriptCore integration "avoiding the N-API overhead that Node.js addons face" ([WiseLibs/better-sqlite3#1057](https://github.com/WiseLibs/better-sqlite3/discussions/1057)). CONFIRMED.

### WASM (no native binding)

- **PGlite** — "WASM Postgres build packaged into a TypeScript client library that enables you to run Postgres in the browser, Node.js, Bun and Deno, with no need to install any other dependencies" ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite)). Programs compiled with Emscripten "cannot fork new processes, and operates strictly in a single-process mode" — PGlite "introduces an input/output pathway that facilitates interaction with PostgreSQL when it is compiled to WASM within a JavaScript environment". CONFIRMED.
- **`@libsql/client-wasm`** — "compiles to wasm32-unknown-unknown target … great driver for environments that run on WebAssembly" ([npm/@libsql/client-wasm](https://www.npmjs.com/package/@libsql/client-wasm)). CONFIRMED.

### `electron-rebuild` requirement

Native modules built against Node's ABI "must be recompiled against the Electron headers immediately after installation" because Electron has a different ABI from Node ([Electron docs: native node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)). The canonical symptom is `NODE_MODULE_VERSION` mismatch — e.g. "compiled against … NODE_MODULE_VERSION 115, while this version of Node.js requires NODE_MODULE_VERSION 121" ([electron/rebuild#591](https://github.com/electron/rebuild/issues/591), [electron/electron-rebuild#886](https://github.com/electron/electron-rebuild/issues/886)). The official tool is `@electron/rebuild`, hooked into `npm install`. CONFIRMED.

## 3. Cross-platform considerations

### Windows path quirks

The Win32 `MAX_PATH` limit is **260 characters**, including drive letter, separators, filename, and the terminating null ([Microsoft Learn: maximum file path limitation](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)). Starting in Windows 10 v1607 the limit can be removed for many Win32 file/directory functions, but **the application must opt in** via a registry value AND a `longPathAware` element in the application manifest. Node tooling under deeply nested `node_modules` is a frequent victim. CONFIRMED.

For long paths Node.js uses **namespaced (`\\?\`-prefixed) paths** when creating absolute symlinks, so symlinks to long-filename targets are creatable on Windows ([nodejs/node@3b46e7f commit](https://github.com/nodejs/node/commit/3b46e7f148)). CONFIRMED.

### ELOOP and symlinks

`ELOOP` ("too many symbolic links encountered") arises from circular symlink chains where a symlink ultimately points back to itself ([Vite#16317](https://github.com/vitejs/vite/issues/16317), [nodejs/node#45404](https://github.com/nodejs/node/issues/45404)). `fs.rm` historically could not delete a symlink that was part of a loop ([nodejs/node#45404](https://github.com/nodejs/node/issues/45404)). CONFIRMED.

### Windows symlink semantics

- "The symlink 'dir' on Windows does not behave the same way as a POSIX style symlink. The proper symlink for windows is a Junction" ([gulpjs/vinyl-fs#210](https://github.com/gulpjs/vinyl-fs/issues/210)).
- "Symlinks of type 'Dir' cannot be created on windows without a Run As verb" — file symlinks work without elevation; directory symlinks fail with `EPERM` ([nodejs/node#18518](https://github.com/nodejs/node/issues/18518)).
- `fs.symlink`'s `type` argument is **only respected on Windows** and accepts `'dir' | 'file' | 'junction'`; with `'junction'`, the target is normalized to an absolute path ([nodejs/node#18518](https://github.com/nodejs/node/issues/18518)).

CONFIRMED.

### FAT/NTFS vs APFS/ext4 — SQLite networked-storage warning

SQLite WAL mode "**does not work over a network filesystem**" because WAL requires shared memory across processes and "processes on separate host machines obviously cannot share memory" ([SQLite Forum](https://sqlite.org/forum/info/867dc34083a418d5)). The WAL mechanism uses an `-shm` file that is unreliable on NFS, CIFS, or other network file systems. Even non-WAL mode is "neither recommended nor supported by the SQLite maintainers" over network filesystems ([GoToSocial docs: SQLite on networked storage](https://docs.gotosocial.org/en/latest/advanced/sqlite-networked-storage/)). The recommended workaround is DELETE journal mode for databases on network storage. CONFIRMED.

The official "How to corrupt a SQLite database" page enumerates locking-protocol violations as a primary cause ([sqlite.org/howtocorrupt](https://sqlite.org/howtocorrupt.html)). CONFIRMED.

### Windows `LockFileEx` vs Unix `fcntl`

The two platforms expose different file-locking primitives:

- **Unix**: `fcntl()` for advisory locking — "you can read or write-lock a file using a function called `fcntl`, but only programs which use this function regard and respect the file lock" ([Wikipedia: file locking](https://en.wikipedia.org/wiki/File_locking)).
- **Windows**: `LockFileEx` / `UnlockFileEx` for **mandatory** locking — "no other processes have access to the locked file" ([Wikipedia: file locking](https://en.wikipedia.org/wiki/File_locking)).

Cross-platform Node abstractions:

- **`os-lock`** — uses `fcntl` on UNIX and `LockFileEx`/`UnlockFileEx` on Windows ([GitHub mohd-akram/os-lock](https://github.com/mohd-akram/os-lock), [npm/os-lock](https://www.npmjs.com/package/os-lock)).
- **`proper-lockfile`** — uses an `mkdir` strategy that is "atomic on any kind of file system, even network based ones" ([GitHub moxystudio/node-proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)).
- **`file-guard`** — "On Unix systems `fcntl` is used to perform the locking, and on Windows, `LockFileEx`" ([GitHub kalamay/file-guard](https://github.com/kalamay/file-guard)).

CONFIRMED.

## 4. Code signing + notarization

### macOS Gatekeeper / Apple notarization — hardened runtime

From macOS 10.15 (Catalina) onward, applications must be both **code signed and notarized** ([Apple Developer ID](https://developer.apple.com/developer-id/), [Kilian Valkhof: notarizing Electron](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/)).

Notarization requires "a time stamped signature with the **hardened runtime** flags set" using a Developer ID certificate. The hardened runtime "protects the runtime integrity of your software by preventing certain classes of exploits" ([Eclectic Light Co: notarization and the hardened runtime](https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/)). Electron apps under hardened runtime typically need at least the entitlements `allow-unsigned-executable-memory` and `allow-jit` ([Electron Forge: code signing macOS](https://www.electronforge.io/guides/code-signing/code-signing-macos)).

Native `.node` binaries inside an Electron app interact with signing in a specific way:

- The default `asarUnpack` glob `'**/{.,**}/**/*.node'` extracts native binaries from the asar archive, because `process.dlopen` "requires extra unpacking" ([Electron docs: ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives), [Electron Forge: auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives)).
- If `electron-builder` "has not signed the .node binary that node has packaged in the .app application", on Apple Silicon you can see "code signature not valid for use in process: mapped file has no Team ID and is not a platform binary (signed with custom identity or adhoc?)" ([electron-userland/electron-builder#1285](https://github.com/electron-userland/electron-builder/issues/1285)).

CONFIRMED that native modules increase signing surface area in Electron; pure-JS backends avoid this entirely.

### Windows Defender SmartScreen

SmartScreen warns when the EXE has "no valid digital signature" or comes from "an unknown or untrusted publisher" ([Advanced Installer: prevent SmartScreen](https://www.advancedinstaller.com/prevent-smartscreen-from-appearing.html), [Microsoft Q&A on SmartScreen](https://learn.microsoft.com/en-us/answers/questions/5584097/how-to-bypass-windows-defender-smartscreen-even-af)).

Signing is necessary but **not sufficient**:

- Standard code-signing certificates "need to have a positive reputation in order to pass the SmartScreen filter" — Microsoft establishes reputation "based upon the number of installations worldwide" ([SignMyCode: bypass SmartScreen for signed app](https://signmycode.com/resources/bypass-smartscreen-for-signed-application-on-windows-8)).
- "**Since March 2024, Microsoft has changed the way SmartScreen interacts with EV Code Signing certificates, and EV certificates no longer instantly remove SmartScreen warnings**" ([SignMyCode](https://signmycode.com/resources/bypass-smartscreen-for-signed-application-on-windows-8)).

CONFIRMED. The signing requirement applies to the application binary regardless of which storage backend it ships with; what changes is the **number of binaries** that need signing inside the bundle (each `.node` file).

## 5. Bundling story

### `.node` modules cannot be bundled

`.node` files are platform-specific compiled binaries; they are typically **marked external** rather than bundled into a JS chunk:

- **esbuild** does not bundle `.node` files; the project tracks "Support for native `.node` modules" in [evanw/esbuild#1051](https://github.com/evanw/esbuild/issues/1051). Plugins like `esbuild-node-externals` mark `node_modules` as external so they are loaded at runtime ([npm/esbuild-node-externals](https://www.npmjs.com/package/esbuild-node-externals)).
- **Vite** uses Rollup's external configuration in production; Vite "revolutionized frontend development with instant server starts and lightning-fast HMR using native ES modules during development and Rollup for production builds" ([Vite build options](https://vite.dev/config/build-options)).
- For Electron in particular, "you must treat `better-sqlite3` as an **external dependency** so that Electron loads the compiled binary from the `node_modules` folder at runtime" ([Electron docs: native node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)).

CONFIRMED.

### Tree-shake friendliness

- **Drizzle ORM** is explicitly designed for tree-shaking with zero dependencies ([orm.drizzle.team](https://orm.drizzle.team/), [drizzle-team/drizzle-orm#2722](https://github.com/drizzle-team/drizzle-orm/issues/2722) tracks bundle size for `drizzle-kit`). "Only what you use is bundled." CONFIRMED.
- **`yaml@2`** is pure JS with no dependencies, suitable for tree-shaking ([npm/yaml](https://www.npmjs.com/package/yaml)). CONFIRMED.
- **PGlite** is "a TypeScript client library" — bundleable in WASM environments ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite)).

### Electron renderer vs main process

Native modules using `process.dlopen` are loaded in the main process (or a utility process) and exposed to the renderer via IPC; they cannot run inside the sandboxed renderer directly without context isolation tradeoffs (Electron-wide convention; see [Electron docs: ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)). Pure-JS backends (yaml, JSON, JSONL, lowdb, electron-store, Drizzle, PGlite WASM) impose no main-vs-renderer constraint at the bundling layer. INFERRED from Electron's general process model + the docs cited.

## 6. Cross-machine sync (dotfiles)

### Files (YAML / JSON / JSONL)

Plain-text config files can be shared via Git, Dropbox, or iCloud Drive without format-specific corruption risks beyond what those services impose on any text file. CONFIRMED at the level of the file format (no SQLite-style locking concerns).

### SQLite under file sync

Multiple authoritative sources warn against syncing live SQLite databases:

- "Dropbox is not suitable for SQLite databases because it has its own sync mechanism and tries to be intelligent about it, which does not work with a shared database file" ([Zotero Forums](https://forums.zotero.org/discussion/66980/dropbox-a-prompt-for-a-solution)).
- "It's not safe to copy a database file which is currently open in some process since it can change within the reading operation" ([Zotero Forums](https://forums.zotero.org/discussion/66980/dropbox-a-prompt-for-a-solution)).
- The official corruption catalog enumerates locking-protocol violations as a primary cause ([sqlite.org/howtocorrupt](https://sqlite.org/howtocorrupt.html)).
- iCloud and Dropbox can interfere with each other on the same SQLite file, producing "permission denied" symptoms.

For SQLite/libSQL on a network filesystem, WAL mode is unsupported (see §3). CONFIRMED that SQLite-class backends are **incompatible with file-sync services for live databases**; the safe pattern is to export to a portable form (SQL dump, JSONL backup) before syncing.

### PGlite

PGlite stores data either in memory, the filesystem (Node/Bun/Deno), or IndexedDB (browser) ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite), [PGlite filesystems docs](https://pglite.dev/docs/filesystems)). The filesystem backend is a directory tree of Postgres data files — not designed for arbitrary external sync. INFERRED that the SQLite-style cautions apply by analogy; explicit guidance not found in the sources captured — UNCERTAIN.

## 7. Version control git-friendliness

### Text files (YAML/JSON/JSONL)

Standard text-diff workflow: line-by-line diffs, conflict markers in 3-way merges, normal `git blame`. JSONL has the structural property that **each line is independent JSON, so individual lines can be edited, added, or removed safely**, with append-only writes producing minimal diffs ([jsonlines.org](https://jsonlines.org/), [Wikipedia: JSON streaming](https://en.wikipedia.org/wiki/JSON_streaming)). CONFIRMED.

### SQLite — binary, not git-friendly out of the box

"SQLite database files are binary files, which makes it difficult to see what changed using `git diff` commands" ([Adam Dunkels: git diff sqlite3](https://dunkels.com/adam/git-diff-sqlite3/), [Garrit Franke: tracking SQLite changes in git](https://garrit.xyz/posts/2023-11-01-tracking-sqlite-database-changes-in-git)). "Sometimes SQLite's binary database will change, but the actual database contents remain the same" — page-level binary churn vs. logical-content churn diverge ([Adam Dunkels](https://dunkels.com/adam/git-diff-sqlite3/)).

The SQLite project itself has documented why **SQLite does not use Git** for its own development ([sqlite.org/whynotgit](https://sqlite.org/whynotgit.html)) — though that page is about the project's own VCS choice, not a directive about checking SQLite files into Git.

Workarounds exist:

- **`textconv` filter** — `git config diff.sqlite3.textconv "sh -c 'sqlite3 \$0 .dump'"` makes `git diff` print a SQL dump ([Adam Dunkels](https://dunkels.com/adam/git-diff-sqlite3/), [Garrit Franke](https://garrit.xyz/posts/2023-11-01-tracking-sqlite-database-changes-in-git)).
- **`git-sqlite`** — custom diff/merge driver using `sqldiff` ([GitHub cannadayr/git-sqlite](https://github.com/cannadayr/git-sqlite)).
- **`sqlite-diffable`** — outputs a diffable copy of the data for storage in Git.

These require explicit setup and do not give first-class merge-conflict resolution. CONFIRMED.

### PGlite

PGlite stores data as a directory of Postgres binary files (or as an IndexedDB blob in the browser) ([PGlite filesystems docs](https://pglite.dev/docs/filesystems)). Same binary-diff problem as SQLite, by analogy. INFERRED.

## 8. Restore from version control

### Files

`git checkout HEAD -- config.yml` restores the last-committed version of a single file ([git-checkout docs](https://git-scm.com/docs/git-checkout)). Since Git 2.23, the recommended modern equivalent is `git restore` ([git-checkout docs](https://git-scm.com/docs/git-checkout)). Either works at file granularity for plain-text formats. CONFIRMED.

### Binary databases

Binary DBs under Git restore at the **file** level — `git checkout HEAD~1 -- app.db` brings back the entire previous binary blob, not a logical row-level rollback. Logical rollback requires either a DB-level snapshot mechanism (e.g. Postgres `pg_dump` + restore, SQLite `.dump`) or per-table replay from a textual export. The textconv mechanism cited above gives **read-only diffs** of binary DBs but does not provide structural merge resolution. CONFIRMED via the same Adam Dunkels / Garrit Franke / git-sqlite sources in §7.

## 9. Bun-vs-Node compatibility

- **`bun:sqlite`** — Bun-only built-in. "Unlike Node.js where you need third-party packages like better-sqlite3 or sqlite3, Bun includes SQLite bindings directly in its runtime" ([Bun: SQLite docs](https://bun.com/docs/runtime/sqlite)). Node-only or cross-runtime projects cannot consume `bun:sqlite`. CONFIRMED.
- **`better-sqlite3`** — Node-targeted via N-API. Bun support has been requested but **not delivered**: "The better-sqlite3 dependency doesn't support Bun as a runtime, and from what has been found there aren't any plans to support it since Bun has its own SQLite driver" ([WiseLibs/better-sqlite3#1057](https://github.com/WiseLibs/better-sqlite3/discussions/1057), [oven-sh/bun#16050](https://github.com/oven-sh/bun/issues/16050)). CONFIRMED.
- **`@libsql/client`** — supports Bun, Deno, and Node on macOS/Linux/Windows ([npm/@libsql/client](https://www.npmjs.com/package/@libsql/client)). CONFIRMED.
- **PGlite** — runs in "the browser, Node.js, Bun and Deno, with no need to install any other dependencies" ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite)). CONFIRMED.
- **YAML / JSON / JSONL / Drizzle / lowdb** — pure JS, run wherever the runtime supports the JS feature set. CONFIRMED.
- **electron-store** — requires Electron 30+ and is ESM-only ([npm/electron-store](https://www.npmjs.com/package/electron-store)). Tied to Electron's main process via `app.getPath('userData')`. CONFIRMED.

### Performance side-note

`bun:sqlite` reports being "roughly 3-6x faster than better-sqlite3 and 8-9x faster than `deno.land/x/sqlite` for read queries" ([WiseLibs/better-sqlite3#1057](https://github.com/WiseLibs/better-sqlite3/discussions/1057)) — attributed to JavaScriptCore integration avoiding N-API overhead. CONFIRMED.

## 10. WASM vs native

### WASM benefits

- **No native rebuild** — same artifact runs across platforms and across Node/Bun/Deno/browser without `electron-rebuild` or `node-gyp` ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite)).
- **No code-signing per `.node` binary** in Electron bundles (the WASM blob is a regular asset, no `process.dlopen`).

### WASM costs

- **Download size** — PGlite is ~3 MB gzipped at the project headline ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite)); `@libsql/client-wasm` is reported at ~5.53 MB ([npm/@libsql/client-wasm](https://www.npmjs.com/package/@libsql/client-wasm)). Issue #477 explicitly tracks PGlite install-size growth across versions ([electric-sql/pglite#477](https://github.com/electric-sql/pglite/issues/477)).
- **Single-process / single-connection** — PGlite "operates strictly in a single-process mode … [and] is single connection only" ([GitHub electric-sql/pglite](https://github.com/electric-sql/pglite), [PGlite multi-tab worker docs](https://pglite.dev/docs/multi-tab-worker)). Concurrency requires running PGlite in a Worker and proxying multiple consumers to it ([electric-sql/pglite#324](https://github.com/electric-sql/pglite/issues/324)).
- **Worker thread requirement (browser)** — "it's likely that you will want to run PGlite in a Web Worker so that it doesn't block the main thread" ([PGlite getting started](https://pglite.dev/docs/)). In Node/Bun, worker usage appears optional in the docs captured — UNCERTAIN whether it is required.

### Native benefits

- **Speed** — bun:sqlite 3-6× faster than better-sqlite3 ([WiseLibs/better-sqlite3#1057](https://github.com/WiseLibs/better-sqlite3/discussions/1057)).
- **Smaller process footprint** for the same SQL feature set (no WASM runtime loaded into the JS engine).

### Native costs

- **Per-platform prebuilds + fallback build chain** ([WiseLibs/better-sqlite3#1027](https://github.com/WiseLibs/better-sqlite3/issues/1027)).
- **`electron-rebuild`** required when the Electron-bundled Node ABI doesn't match the prebuild ([Electron docs: native node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [electron/rebuild#591](https://github.com/electron/rebuild/issues/591)).
- **Per-`.node` signing** complications inside Electron asar bundles ([electron-userland/electron-builder#1285](https://github.com/electron-userland/electron-builder/issues/1285)).

CONFIRMED.

## Install footprint matrix

Columns: **Unpacked size**, **Native binding**, **Signing required (per native artifact)**, **Electron-friendly**, **Bun-friendly**.

| Backend | Unpacked size | Native binding | Per-binary signing | Electron-friendly | Bun-friendly |
| --- | --- | --- | --- | --- | --- |
| YAML files (`yaml@2`) | Pure JS, no native; exact unpacked size UNCERTAIN [npm/yaml] | **No** [npm/yaml] | N/A | Yes — pure JS [INFERRED] | Yes — pure JS [INFERRED] |
| JSON files | Built into runtime (`JSON.parse`) — **0 added** | **No** | N/A | Yes | Yes |
| JSONL append-only | Built-in `JSON.parse` per line — **0 added** mandatory [jsonlines.org] | **No** | N/A | Yes | Yes |
| `better-sqlite3` | **10.3 MB install / 11 MB unpacked** [npm/better-sqlite3] | **Yes — prebuilds via `prebuild-install`, source-build fallback** [WiseLibs/better-sqlite3#1027] | Yes — `.node` binary inside asar must be signed [electron-userland/electron-builder#1285] | Yes, but requires `electron-rebuild` on ABI mismatch [Electron docs] | **No** — explicit non-support [WiseLibs#1057, oven-sh/bun#16050] |
| `bun:sqlite` | **0** added (built into Bun) [Bun docs] | **N/A — runtime built-in** | N/A | Bun-only — not directly applicable in Electron's Node-based main process [INFERRED from Bun-only scope] | **Yes — built-in** |
| libSQL `@libsql/client` (native) | UNCERTAIN size (npm overview did not surface) | **Yes — native bindings on macOS/Linux/Windows** [npm/@libsql/client] | Yes — same `.node` signing concerns as better-sqlite3 [INFERRED by analogy] | Yes — same `electron-rebuild` consideration as better-sqlite3 [INFERRED] | **Yes** — Bun + Deno + Node [npm/@libsql/client] |
| libSQL `@libsql/client-wasm` | **~5.53 MB** [npm/@libsql/client-wasm] | **No — WASM** | N/A | Yes — WASM is bundled as asset, no `process.dlopen` [INFERRED] | Yes [npm/@libsql/client-wasm] |
| PGlite `@electric-sql/pglite` | **~3 MB gzipped headline** [GitHub electric-sql/pglite]; **~3.7 MB gzipped** per npm aggregator; install-size growth flagged in [#477] | **No — WASM** | N/A | Yes — WASM, no native rebuild [INFERRED] | **Yes** — Browser/Node/Bun/Deno [GitHub electric-sql/pglite] |
| Drizzle ORM | **~7.4 KB minified+gzipped** [orm.drizzle.team] | **No — pure TS, zero deps** | N/A | Yes — pure JS [INFERRED] | Yes [INFERRED] |
| lowdb | Pure ESM JS; lodash optional, not bundled [npm/lowdb]; exact unpacked size UNCERTAIN | **No** | N/A | Yes [INFERRED] | Yes [INFERRED] |
| electron-store | Pure JS atop a JSON file [npm/electron-store]; exact unpacked size UNCERTAIN | **No** | N/A | **Electron-only** (uses `app.getPath('userData')`); requires Electron 30+ [npm/electron-store] | Not applicable — designed for the Electron main process [INFERRED from `app.getPath` dependency] |

### Notes on the matrix

- "Per-binary signing" refers to the macOS code-signing requirement when an Electron app's asar has its native `.node` files unpacked (the default `asarUnpack` glob covers `**/*.node`) ([Electron Forge: auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives), [electron-userland/electron-builder#1285](https://github.com/electron-userland/electron-builder/issues/1285)). The Apple notarization requirement applies to the **app bundle as a whole**; pure-JS backends do not add additional signed artifacts beyond the Electron framework itself.
- "Bun-friendly" tracks runtime support, not whether a Bun-native equivalent exists.
- Sizes measured in different units (gzipped vs unpacked tarball vs install) are not directly comparable cell-to-cell; each cell preserves the unit reported by its source.
