---
title: "Hierarchical + multi-scope semantics"
description: "Multi-file precedence merge, DB-as-views, per-scope storage layout, project-local-personal overrides, cascade semantics, and real-world multi-scope adoption across 10 storage backends"
date: 2026-04-23
sources:
  - VS Code settings docs (code.visualstudio.com/docs/configure/settings)
  - ESLint flat config docs + blog posts (eslint.org/blog/2022/08/new-config-system-part-2/)
  - Renovate config presets docs (docs.renovatebot.com/config-presets/)
  - Mintlify docs.json reference (mintlify.com/docs/organize/settings)
  - Astro configuration guide (docs.astro.build/en/guides/configuring-astro/)
  - Cursor MDC rules forum + community guides
  - git-config docs (git-scm.com/docs/git-config)
  - Vite, Webpack, dotenv, dotenv-flow, dotenvx documentation
  - PostgreSQL search_path docs (postgresql.org/docs/current/ddl-schemas.html)
  - SQLite ATTACH DATABASE docs (sqlite.org/lang_attach.html)
  - PGlite docs (pglite.dev/docs/about), libSQL/Turso docs
  - Drizzle ORM multi-tenant tutorials, electron-store/lowdb GitHub issues
  - cosmiconfig README, Prettier configuration docs (prettier.io/docs/configuration)
framing: 3P / external sources only
---

> **Stance.** This file enumerates how mature tools and storage engines compose multiple configuration scopes — file-based and DB-based — into a single resolved view. It does **not** recommend a backend for any particular use case. Confidence labels: **CONFIRMED** (primary docs / source code / clear consensus across multiple sources), **INFERRED** (consistent secondary sources / well-established convention), **UNCERTAIN** (single source, ambiguous, or inconsistent across sources). Where mature tools diverge, the divergence is preserved rather than averaged.

---

## 1. Multi-file precedence merge

The canonical pattern is `~/.appname/config.yml` (user) + `./.appname/config.yml` (workspace) + ENV + CLI flags. **CONFIRMED** that "more specific wins" is the dominant convention across mature tools, but the *unit* of specificity (whole-file replace vs deep-merge vs per-key) varies.

**Reference precedence chains observed in mature tools:**

| Tool | Precedence (lowest → highest) | Source |
| --- | --- | --- |
| git | system (`/etc/gitconfig`) → global (`~/.gitconfig`) → local (`<repo>/.git/config`) | [git-config docs](https://git-scm.com/docs/git-config); secondary [Atlassian](https://www.atlassian.com/git/tutorials/setting-up-a-repository/git-config) |
| VS Code | Default → User → Remote → Workspace → Workspace Folder; language-specific variants of each | [VS Code settings](https://code.visualstudio.com/docs/configure/settings) |
| Vite | `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local` | [Vite env docs](https://vite.dev/guide/env-and-mode) |
| dotenv-flow | `.env` → `.env.local` → `.env.[NODE_ENV]` → `.env.[NODE_ENV].local` | [dotenv-flow npm](https://www.npmjs.com/package/dotenv-flow) |
| Ruby `dotenv` (gem) | First file loaded **wins**; `.env` has lowest precedence (last loaded) | [bkeepers/dotenv](https://github.com/bkeepers/dotenv) |
| dotenvx | First `-f` file wins | [dotenvx docs](https://dotenvx.com/docs/quickstart/environments) |
| Renovate | Global → Inherited → Resolved presets in `extends` → Repository config; last preset in `extends` array wins | [Renovate config-overview](https://docs.renovatebot.com/config-overview/) |
| Cursor | Team Rules → Project Rules → User Rules; *earlier* sources take precedence on conflict | Cursor docs / [forum guide](https://forum.cursor.com/t/my-best-practices-for-mdc-rules-and-troubleshooting/50526) |

**Two divergent precedence directions exist in the wild.** Most tools say *"closer-to-the-target wins"* (git local > global; VS Code workspace > user; Renovate repo > preset). Ruby's dotenv and dotenvx invert this — *"first declared wins"* — which means callers control precedence by ordering arguments rather than by file location ([dotenv README](https://github.com/bkeepers/dotenv); [dotenvx](https://dotenvx.com/docs/quickstart/environments)). A consumer reading "user vs workspace precedence" cannot assume either direction without checking the tool.

**CONFIRMED** that for file-based configs, the resolution algorithm is always **app-defined** — the file format itself (YAML, JSON, JSONL, TOML) carries no merge semantics. The merge happens in app code after all files are loaded.

---

## 2. DB-as-views over multiple tables

Relational engines can express "merged config" as a SQL view selecting from multiple `(scope, key, value)` rows with a precedence-aware `ROW_NUMBER()` or `DISTINCT ON`. This is structurally different from file-based merging — the merge is declarative SQL, not imperative code.

**SQLite views are read-only.** [SQLite CREATE VIEW docs](https://www.sqlite.org/lang_createview.html) state views cannot be the target of `INSERT`, `UPDATE`, or `DELETE` (CONFIRMED). This means a "merged config view" must be paired with separate write paths to the underlying tables.

**Materialized views: not natively supported in SQLite.** [SQLite forum thread](https://news.ycombinator.com/item?id=40074323) and [pgloader issue #699](https://github.com/dimitri/pgloader/issues/699) confirm SQLite has no native materialized views. Workarounds:

- `CREATE TABLE AS SELECT ...` snapshots a query result (manual refresh).
- Trigger-based simulation: `BEFORE INSERT/UPDATE/DELETE` triggers maintain a derived table by hand.

[madflex post](https://madflex.de/SQLite-triggers-as-replacement-for-a-materialized-view/) walks through the trigger pattern (CONFIRMED that this is community-standard, INFERRED that it's brittle without code generation).

**PostgreSQL** supports both regular views (live, recomputed per query) and `MATERIALIZED VIEW` (snapshot, refreshed via `REFRESH MATERIALIZED VIEW`). This makes "merged config" a one-liner: `CREATE VIEW resolved_config AS SELECT key, value FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY key ORDER BY scope_priority DESC) FROM config_kv) WHERE rn = 1;`. PGlite [supports multi-schema](https://pglite.dev/docs/about) (`public`, `pg_catalog`, `information_schema`) — CONFIRMED — so this pattern carries through to the embedded WASM build.

**Cross-database queries via `ATTACH DATABASE`.** [SQLite ATTACH docs](https://www.sqlite.org/lang_attach.html) confirm: separate `.sqlite` files can be attached as named schemas (`ATTACH DATABASE 'user.db' AS user; ATTACH DATABASE 'workspace.db' AS workspace`) and joined as if they were one database. [Simon Willison's writeup](https://simonwillison.net/2021/Feb/21/cross-database-queries/) and [Jamie Tanna's example](https://www.jvt.me/posts/2024/06/19/cross-sqlite-query/) both demonstrate the pattern. Transactions across attached DBs are atomic *when the main DB is not `:memory:` and journal_mode is not WAL* (CONFIRMED — [SQLite docs](https://www.sqlite.org/lang_attach.html); this is a load-bearing constraint).

**`SQLITE_LIMIT_ATTACHED`** caps the number of attachable databases per connection (default 10, max 125). For per-scope DB layouts beyond that limit, applications fall back to logical scoping inside one DB.

---

## 3. Per-scope storage layout: one DB or many; one YAML or many

| Layout | File-based example | DB-based example | Trade-offs (per cited sources) |
| --- | --- | --- | --- |
| **One artifact** | Single `config.yml`, single `mint.json` | Single `.sqlite` with `(scope, key, value)` rows | Simpler backups; one lock; harder to gitignore individual scopes |
| **Many artifacts** | `~/.config/git/config` + `<repo>/.git/config`; `.env` + `.env.local` | Separate `user.db` + `workspace.db` ATTACHed; PGlite schemas per scope | Per-scope locking; clear gitignore boundary; merge logic lives in app or in SQL view |

[VS Code multi-root workspace docs](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) describe per-folder `.vscode/settings.json` files merged into a `.code-workspace` file at the workspace level. CONFIRMED that VS Code uses many small files, one per folder.

**electron-store**: [README](https://github.com/sindresorhus/electron-store) and [issue #169](https://github.com/sindresorhus/electron-store/issues/169) confirm one `Store` instance per file; multiple scopes require multiple `new Store({ name })` instances. No built-in cross-store merge — caller composes them.

**lowdb**: [issue #154](https://github.com/typicode/lowdb/issues/154) and [issue #184](https://github.com/typicode/lowdb/issues/184) confirm that combining 3+ `db.json` files requires creating multiple `Low` instances and manually merging. The maintainer recommends collections-within-one-file as the idiomatic alternative.

**libSQL**: [docs](https://docs.turso.tech/libsql) describe a server-side **namespace** abstraction where each namespace gets its own DB file with independent configuration; the [DeepWiki summary](https://deepwiki.com/tursodatabase/libsql) describes a `NamespaceStore` cache and `MetaStore` for namespace persistence. CONFIRMED for server-side; embedded libsql still relies on `ATTACH` for multi-file (INFERRED).

**Backup boundary.** Multi-file layouts let users back up one scope without the others (gitignore the local DB but commit the project DB). One-DB layouts force backup of everything together unless the engine supports schema-level export — CONFIRMED for Postgres `pg_dump --schema=...`, INFERRED for SQLite (typical workaround: `.dump` filtered).

---

## 4. Project-local-personal override patterns

The `.local` suffix convention — `.env.local`, `settings.local.json` — typically signals a *gitignored personal override*. Confirmation across ecosystems:

- **dotenv-flow**: `.env.local` priority over `.env`, except `NODE_ENV=test` (where `.env.local` is *not* loaded). [npm page](https://www.npmjs.com/package/dotenv-flow) calls this out as a deliberate test-determinism choice.
- **Vite / Webpack**: both load `.env.local` after `.env`, and `.env.[mode].local` after `.env.[mode]`; `.local` files override mode-specific files ([Vite docs](https://vite.dev/guide/env-and-mode), [Webpack template](https://webpack.js.org/configuration/dotenv/)).
- **VS Code**: User settings are themselves a personal override of workspace settings; no separate `.local` convention beyond that ([settings docs](https://code.visualstudio.com/docs/configure/settings)).
- **Renovate**: no `.local` convention — repository config *is* the most-specific layer ([config-overview](https://docs.renovatebot.com/config-overview/)).
- **git**: `~/.gitconfig` *is* the personal layer; no `.local` suffix.

**INFERRED** that the `.local` convention is most consistent in the JS ecosystem (dotenv lineage); other ecosystems use directory location (`~` vs `.`) instead of filename suffix to encode the same gitignore semantics.

---

## 5. Cascade vs override semantics

This is the sub-dimension where mature tools diverge most sharply.

**Type-aware merge (VS Code).** [VS Code docs](https://code.visualstudio.com/docs/configure/settings) and [issue #19219](https://github.com/Microsoft/vscode/issues/19219) confirm: *"values with primitive types and Array types are overridden, but values with Object types are merged"* (CONFIRMED). The same key can behave as replace or as deep-merge depending on the value's type. Language-specific settings within workspace take precedence over user, but the merge follows the same primitive-vs-object split.

**Whole-object replace (Prettier).** [Prettier configuration docs](https://prettier.io/docs/configuration) and [the cosmiconfig design](https://github.com/cosmiconfig/cosmiconfig) state Prettier searches up the directory tree and uses **the first config file found** — no merging across directory levels (CONFIRMED). Prettier *intentionally doesn't support global configuration* to keep `.prettierrc` deterministic across machines.

**Mergeable-by-key (Renovate).** [Renovate config-presets docs](https://docs.renovatebot.com/config-presets/) describe per-option mergeability: *"When an array or object configuration option is mergeable, it means that values inside it will be added to any existing object or array that existed with the same name."* The mergeability flag is per-option (declared in Renovate's schema), not a global behavior — CONFIRMED that this lets `extends` cascade pile up `packageRules[]` entries while `branchPrefix` stays a clean override.

**Flat-array cascade (ESLint).** [ESLint flat config blog](https://eslint.org/blog/2022/08/new-config-system-part-2/) describes a single `eslint.config.js` exporting an array; ESLint walks the array top-to-bottom and merges objects whose `files`/`ignores` glob matches the file being linted (CONFIRMED). The cascade is *intentionally collapsed into one file* — directory-tree cascade was deliberately removed, [issue #18385](https://github.com/eslint/eslint/issues/18385) notes the friction this creates for monorepos.

**Reference-merge (Mintlify).** [Mintlify docs.json reference](https://www.mintlify.com/docs/organize/settings) supports `$ref` to split one logical config across multiple files; resolution is at build time. Not a precedence cascade — more like include-by-reference.

**Append-only (JSONL semantics).** With JSONL, the natural merge is *last-line-wins* per key (or *additive* per record), and there's no native "scope" concept; scope is encoded inside each line by the writer. [JSONL log-processing guide](https://jsonl.help/use-cases/log-processing/) frames JSONL as event-sourced; cascade requires reading every line and folding.

**INFERRED** that "deep-merge by default" is a minority position outside Eleventy ([data-deep-merge](https://v0.11ty.dev/docs/data-deep-merge/)) and Renovate; "primitive replace, object merge" (VS Code) and "whole replace at the file boundary" (Prettier, dotenv) are the more common defaults.

**Lodash `_.merge()` array gotcha.** [Multiple sources](https://thesyntaxdiaries.com/lodash-merge-a-comprehensive-guide) clarify that `_.merge()` does **not** concatenate arrays — it merges by index, so `[a,b,c]` merged with `[x]` gives `[x,b,c]`. Tools building on lodash inherit this surprising behavior unless they use `_.mergeWith` with a customizer.

---

## 6. Scope discovery

| Backend | Discovery mechanism |
| --- | --- |
| YAML / JSON files (cosmiconfig style) | Walk **up** the directory tree from the target file until the first match or until home directory; cosmiconfig stops at first found and does not auto-merge ([cosmiconfig README](https://github.com/cosmiconfig/cosmiconfig)) |
| Prettier | Same upward walk; first match wins ([Prettier docs](https://prettier.io/docs/configuration)) |
| ESLint flat config | No upward walk — *the user passes one config file path* (default `eslint.config.js` at CWD) and the cascade is internal to that array ([ESLint docs](https://eslint.org/docs/latest/use/configure/configuration-files)) |
| Cursor MDC rules | Globs in each `.mdc` file's frontmatter declare which files the rule attaches to (auto-attached, manually requested, or always-applied) — community guides on [forum](https://forum.cursor.com/t/my-best-practices-for-mdc-rules-and-troubleshooting/50526) |
| dotenv | Library is *handed* a list of files explicitly; no discovery |
| git | Hard-coded path ladder: `/etc/gitconfig` → `~/.gitconfig` (or XDG path) → `.git/config` |
| SQLite (single DB) | All scopes are rows; `WHERE scope IN (...)` filters |
| SQLite (`ATTACH`-based multi-DB) | Caller passes file paths to `ATTACH`; nothing implicit |
| PostgreSQL `search_path` | Comma-separated schema list; first schema with the name wins for an unqualified reference ([Postgres schemas docs](https://www.postgresql.org/docs/current/ddl-schemas.html)) |
| PGlite | Same Postgres semantics; multi-schema confirmed ([PGlite docs](https://pglite.dev/docs/about)) |
| libSQL | Server-side namespaces resolved by the `NamespaceStore`; embedded relies on caller-supplied file paths |
| Drizzle ORM | No discovery — caller wires the connection per scope; tutorials show middleware reading tenant ID from URL → `pgSchema(tenantSchema)` for per-tenant Drizzle instances ([Medium writeup](https://medium.com/@vimulatus/schema-based-multi-tenancy-with-drizzle-orm-6562483c9b03)) |
| lowdb | No discovery; one `Low` per file, caller composes |
| electron-store | Each `new Store({ name })` resolves to `<userData>/<name>.json`; no cross-store discovery |

CONFIRMED that **directory-tree walking is the file-config discovery norm** (cosmiconfig + Prettier + many CLI tools), and **schema/namespace-list lookup is the SQL discovery norm** (Postgres `search_path`, libSQL `NamespaceStore`).

---

## 7. Reload semantics

When one scope changes, does the merged view update reactively?

- **File-based**: not by default. Tools either (a) re-read on each invocation (Prettier on each format, ESLint on each lint), (b) accept a `SIGHUP` to reload (Traefik, Logstash, OpenTelemetry Collector — [SIGHUP overview](https://blog.devtrovert.com/p/sighup-signal-for-configuration-reloads)), or (c) watch with `fsnotify`/`chokidar` and rebuild the merged view in memory. [Vorner's writeup](https://vorner.github.io/2019/08/11/runtime-configuration-reloading.html) and [Last9 hot-reload guide](https://last9.io/blog/hot-reload-for-opentelemetry-collector/) both note the *partial-write hazard* — `inotify` sees a save in the middle of an editor write and reloads inconsistent state.
- **SQLite views**: a `VIEW` always reflects current underlying-table state — no explicit reload. Materialized snapshots (`CREATE TABLE AS`) need manual `REFRESH`-equivalent. CONFIRMED via [SQLite views docs](https://www.sqlite.org/lang_createview.html).
- **Postgres views**: live; `MATERIALIZED VIEW` requires `REFRESH MATERIALIZED VIEW` or `REFRESH MATERIALIZED VIEW CONCURRENTLY`. PGlite inherits this.
- **Postgres `LISTEN`/`NOTIFY`** is the canonical reactive primitive for scope-change broadcasts inside a Postgres-family backend.
- **electron-store**: built-in `onDidChange(key, cb)` watches the underlying JSON file ([README](https://github.com/sindresorhus/electron-store)) — main-process changes propagate to renderers via this hook. CONFIRMED.
- **lowdb**: no built-in watch; caller wires `fs.watch` if needed.
- **JSONL**: append-only naturally supports incremental tailing — readers can `tail -f` and re-fold the projection. CONFIRMED via [JSONL log-processing guide](https://jsonl.help/use-cases/log-processing/).

---

## 8. Conflict resolution: type mismatches across scopes

Documented behavior when two scopes set the same key with different types:

- **VS Code**: type-aware — primitive/array overrides, object merges. If user defines a key as a string and workspace defines it as an object, [issue #5796](https://github.com/microsoft/vscode/issues/166685) shows the override behavior is per-key per-scope, not a structural type-check error. UNCERTAIN whether VS Code refuses the load or silently overrides — sources don't show an explicit error path.
- **Renovate**: *"if there is a logical conflict between presets, then the last preset in the `extends` array 'wins'"* ([Renovate docs](https://docs.renovatebot.com/config-presets/)) — last-write-wins on the offending key, no type-check failure.
- **ESLint flat config**: same — later array entry wins per-key.
- **JSON Schema-validated configs (Mintlify, Renovate, ESLint plugins)**: schema validation rejects type mismatches at load time *if the schema is authoritative*. CONFIRMED that Mintlify enforces this via `$schema: https://mintlify.com/docs.json` ([starter docs](https://starter.mintlify.com/essentials/settings)).
- **lowdb / electron-store / SQLite-with-JSON-blob-column**: no schema enforcement by default; type drift surfaces only at read-time deserialization.
- **Drizzle ORM**: schema is TypeScript at compile time; cross-scope conflict between two Drizzle DBs is *the application's problem* — Drizzle has no opinion ([discussion #3199](https://github.com/drizzle-team/drizzle-orm/discussions/3199) shows this is delegated to app-level glue).
- **PGlite / libSQL / better-sqlite3**: SQL `CHECK` constraints + `JSONB`/`JSON` validators exist but are caller-defined; no implicit cross-scope merge.

**INFERRED** that *"silently overrides on type mismatch"* is the dominant behavior for layered file configs. Schema-validated configs are stricter but only enforce *within* a scope, not across — the merged view's type can shift if scopes disagree.

---

## 9. Real-world multi-scope adoption table

| Tool | Scope levels | Cascade direction | Merge semantics | Discovery | Reload | Source |
| --- | --- | --- | --- | --- | --- | --- |
| **VS Code** | Default → User → Remote → Workspace → Workspace Folder; +language overrides per level | More-specific wins | Primitive/array replace; object deep-merge | Hard-coded paths + open-folder context | Live (in-process settings store) | [VS Code docs](https://code.visualstudio.com/docs/configure/settings) |
| **Mintlify** | Single `docs.json`; optional `$ref` includes | N/A (single file) | Resolved at build time via `$ref` | Hard-coded `docs.json` (legacy `mint.json`) | Build-time only | [Mintlify settings](https://www.mintlify.com/docs/organize/settings) |
| **Astro** | Single `astro.config.mjs`; integrations are an array | More-specific wins for integration options; `astro:config` hook can mutate at init | Caller-defined; integrations are factories returning option objects | Hard-coded filename | Vite-driven HMR for some keys; restart for most | [Astro config](https://docs.astro.build/en/guides/configuring-astro/) |
| **Renovate** | Global → Inherited → Resolved presets in `extends` → Repository | Repository wins (most specific); within `extends`, last array entry wins | Per-option mergeability flag — some arrays/objects merge, others replace | Caller passes preset names; presets can extend more presets | Per-run (Renovate is batch) | [Renovate config-presets](https://docs.renovatebot.com/config-presets/) |
| **ESLint flat config** | Single array in `eslint.config.js`; entries selected by `files`/`ignores` globs | Top-to-bottom array order — later wins on overlap | Object merge with per-rule replace | Single file at CWD | Re-read per `eslint` invocation | [ESLint flat config blog](https://eslint.org/blog/2022/08/new-config-system-part-2/) |
| **Cursor** | Team Rules → Project Rules (`.cursor/rules/*.mdc`) → User Rules; nested AGENTS.md combine with parent | *Earlier* sources take precedence on conflict (Team > Project > User) | All applicable rules merged | Glob attach per `.mdc` file's frontmatter | Live | Cursor docs / [forum guide](https://forum.cursor.com/t/my-best-practices-for-mdc-rules-and-troubleshooting/50526) |
| **Prettier** | Single config file per directory tree walk | First found wins (no merge across levels) | N/A — only one file used | Upward directory walk via cosmiconfig | Per-format invocation | [Prettier configuration](https://prettier.io/docs/configuration) |
| **git** | system → global → local (worktree-specific overrides since git 2.20) | Most-specific wins | Last-write-wins per key | Hard-coded path ladder | Per-command | [git-config](https://git-scm.com/docs/git-config) |

---

## 10. Hidden cost of cascade: debugging "why is this value X?"

When a value is wrong in the merged view, debugging requires (a) knowing the precedence chain, (b) querying every scope, (c) computing the merge by hand. Tooling support for this is uneven.

**Tools that provide explicit provenance:**

- **VS Code**: settings UI shows per-setting which scope contributed (User vs Workspace badges in the Settings editor, [docs](https://code.visualstudio.com/docs/configure/settings)). CONFIRMED — this is a deliberate UX feature.
- **git**: `git config --show-origin --show-scope <key>` returns the file path and scope name for each contributing layer (CONFIRMED, [git-config docs](https://git-scm.com/docs/git-config)).
- **ESLint**: `--print-config <file>` outputs the fully-resolved config for one file; ESLint inspector tooling ([Anthony Fu's eslint-config-inspector](https://eslint.org/blog/2022/08/new-config-system-part-2/) referenced in flat config blog) visualizes the array slice that applies.
- **Renovate**: produces a "Renovate-Resolved" log artifact per run that shows preset resolution order ([config-overview](https://docs.renovatebot.com/config-overview/)).

**Tools where provenance is implicit (caller's responsibility):**

- dotenv variants: most do not log which file set which key; debugging means re-running with `--verbose` or printing `process.env` diffs.
- Prettier: since only one file wins, the question reduces to *which* file — answered by an upward walk by hand.
- electron-store, lowdb: no provenance; multiple stores are entirely caller-managed.

**SQL-backed multi-scope** can answer provenance queries directly: `SELECT scope, value FROM config_kv WHERE key = ? ORDER BY scope_priority DESC` shows the contributing rows. **INFERRED** that this is structurally easier to debug than a deep-merge across N JSON files, *if* the schema is `(scope, key, value)` rather than nested JSONB blobs per scope.

[VS Code remote-release issue #1371](https://github.com/microsoft/vscode-remote-release/issues/1371) and [VS Code issue #228983](https://github.com/microsoft/vscode/issues/228983) — both linked from the official precedence docs — show real-world precedence confusion even for users of a tool with explicit provenance UI. CONFIRMED that *understanding the cascade is hard even with good tooling*; without provenance tooling, it is materially harder.

---

## 11. Per-backend rollup (10 backends)

Each entry summarizes how the backend handles multi-scope, citing primary source where possible. No recommendation — only what the backend supports natively vs requires the caller to build.

### 11.1 YAML files

- **Multi-scope native support:** none. Files are inert; merge is entirely app-defined.
- **Discovery:** typically cosmiconfig-style upward walk ([cosmiconfig](https://github.com/cosmiconfig/cosmiconfig)) or explicit ladder (`~/.appname/config.yml` + `./.appname/config.yml`).
- **Cascade:** caller uses `lodash.merge`, `deepmerge`, `Object.assign`, or hand-written merge — divergent behavior on arrays (concat vs replace vs by-index).
- **Reload:** caller wires `fs.watch` / `chokidar`; partial-write hazard documented ([Vorner](https://vorner.github.io/2019/08/11/runtime-configuration-reloading.html)).
- **Provenance:** no native — caller logs which file set which key, or builds `--show-origin`-style tooling.

### 11.2 JSON files

- Same characteristics as YAML for multi-scope semantics — the format is still inert, merge is app-defined.
- Stricter parser (no anchors, no comments) makes cascade-output easier to diff. CONFIRMED via [Mintlify's choice of JSON for `docs.json`](https://www.mintlify.com/blog/refactoring-mint-json-into-docs-json) (the migration writeup discusses JSON's tooling advantages).

### 11.3 JSONL append-only

- **Multi-scope native support:** none — there are no scopes, only events.
- **Cascade interpretation:** either *last-line-wins* per key (folding produces the latest value) or *additive per record* (every line is a fact, no folding).
- **Discovery:** caller passes file paths.
- **Reload:** natural — tail and re-fold ([JSONL log-processing](https://jsonl.help/use-cases/log-processing/)).
- **Provenance:** strong — every value's origin line/timestamp is in the log, by construction. CONFIRMED.
- **Trade-off:** no random access; reading the merged view requires folding the entire log unless a snapshot is maintained.

### 11.4 better-sqlite3

- Sync-only Node binding to SQLite. Inherits all SQLite multi-scope semantics:
  - **Single-DB:** `(scope, key, value)` table + view (read-only) for merged projection ([CREATE VIEW](https://www.sqlite.org/lang_createview.html)).
  - **Multi-file:** `ATTACH DATABASE` + cross-DB joins; `SQLITE_LIMIT_ATTACHED` cap; transactions atomic only when main DB ≠ `:memory:` and journal_mode ≠ WAL ([ATTACH docs](https://www.sqlite.org/lang_attach.html)).
- **Reload:** views reflect underlying tables live; no `LISTEN`/`NOTIFY`. App-level `update_hook` C-API exists; better-sqlite3 exposes it as `db.function`-based hooks (UNCERTAIN — caller-built reactivity is the norm).
- **Provenance:** trivial — a `scope` column gives direct attribution.

### 11.5 bun:sqlite

- Built-in SQLite binding for Bun runtime. Same SQLite semantics as better-sqlite3 (CONFIRMED — both ship the SQLite engine, ATTACH and views behave identically).
- Differences from better-sqlite3 are operational (Bun process model, perf characteristics) — multi-scope semantics are SQLite-native.

### 11.6 libSQL

- **Embedded:** SQLite-compatible — `ATTACH`, views, materialized-via-trigger all carry over.
- **Server-side:** introduces **namespaces** ([Turso libSQL docs](https://docs.turso.tech/libsql)) — each namespace is a separate DB file with independent config, managed by `NamespaceStore`. CONFIRMED that namespaces model multi-tenancy more cleanly than `ATTACH`-stacking.
- **Edge-replicated:** Hrana protocol over WebSockets ([DeepWiki](https://deepwiki.com/tursodatabase/libsql)). Replication operates per-DB-file, so per-scope DB files replicate independently — INFERRED implication for multi-scope deployments.

### 11.7 PGlite

- Embedded WASM PostgreSQL ([PGlite docs](https://pglite.dev/docs/about)). Inherits Postgres multi-scope idioms:
  - **Schemas:** `search_path` resolves unqualified names left-to-right ([Postgres schemas docs](https://www.postgresql.org/docs/current/ddl-schemas.html)). CONFIRMED `public`, `pg_catalog`, `information_schema` supported.
  - **Views + materialized views:** Postgres-native; `REFRESH MATERIALIZED VIEW` for snapshots.
  - **`LISTEN`/`NOTIFY`:** Postgres reactive primitive — CONFIRMED works in PGlite ([PGlite repo](https://github.com/pglite/pglite) examples cover it).
  - **`ATTACH`:** Postgres has `dblink` / Foreign Data Wrappers (FDW) instead of SQLite-style `ATTACH`. UNCERTAIN whether PGlite ships FDW (need primary-doc check beyond the surfaced sources).

### 11.8 Drizzle ORM

- **No opinion on multi-scope.** Drizzle is a TypeScript schema layer over SQLite/Postgres/MySQL drivers; multi-scope is whatever the underlying engine supports.
- Multi-tenant patterns documented:
  - **Per-tenant DB:** loop over tenants and build a new Drizzle client per ([Turso multi-tenant blog](https://turso.tech/blog/creating-a-multitenant-saas-service-with-turso-remix-and-drizzle-6205cf47)) — described as *"a bit of a pain"* by Drizzle community.
  - **Schema-per-tenant:** `pgSchema(tenantSchema)` returns a Drizzle instance scoped to one schema ([Medium writeup](https://medium.com/@vimulatus/schema-based-multi-tenancy-with-drizzle-orm-6562483c9b03)).
  - **Tenant context via AsyncLocalStorage:** middleware reads tenant ID, stores in ALS for downstream queries ([discussion #1539](https://github.com/drizzle-team/drizzle-orm/discussions/1539)).
- Discovery, reload, provenance: all delegated to the SQL underneath.

### 11.9 lowdb

- **Single JSON file per `Low` instance.** [Issue #154](https://github.com/typicode/lowdb/issues/154) and [issue #184](https://github.com/typicode/lowdb/issues/184) confirm: combining N files requires N `Low` instances + manual merge.
- Maintainer's idiomatic alternative: **collections-within-one-file** (`{users: [...], posts: [...]}`).
- No discovery, no built-in cascade, no built-in reload, no provenance.

### 11.10 electron-store

- One `Store` instance per name → one JSON file at `<userData>/<name>.json`. [Issue #169](https://github.com/sindresorhus/electron-store/issues/169) confirms multi-scope = multiple `new Store({ name })` instances.
- Built-in `onDidChange` watches the file ([README](https://github.com/sindresorhus/electron-store)) — provides reactive reload per-store.
- No cross-store cascade or merge; caller composes.
- Provenance: implicit (caller knows which Store they read from).

---

## 12. Cross-cutting observations

- **Schema-based vs row-based multi-scope** (CONFIRMED across SQL backends): schema-per-scope (Postgres schemas, libSQL namespaces) gives clean isolation and per-scope ownership but caps tenant count (~thousands per [Crunchy Data multi-tenant blog](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)); `(scope, key, value)` rows scale further but mix scopes in one table.
- **The `extends` keyword convention** appears in Renovate, ESLint legacy, TypeScript `tsconfig`, JSON Schema — all use *array order* for cascade with *most-recent-wins* semantics. INFERRED that this is now an industry-wide pattern.
- **"Closer-to-target wins" vs "earlier-wins"** is the deepest divergence. Most file-config tools (git, VS Code, Prettier, Vite) use closer-wins; Cursor, Ruby `dotenv`, dotenvx use first-declared-wins. There is no universal answer; consumers must check per-tool.
- **JSON Schema `$ref` (Mintlify) is fundamentally include-by-reference, not cascade.** It splits one logical config across many files for organization but doesn't compose multiple precedence layers.
- **File-watcher reload is a partial-write minefield.** [Vorner](https://vorner.github.io/2019/08/11/runtime-configuration-reloading.html) and [SIGHUP article](https://blog.devtrovert.com/p/sighup-signal-for-configuration-reloads) both document why production tools (Traefik, Logstash, OpenTelemetry Collector) prefer SIGHUP-or-explicit-trigger over `inotify`-driven auto-reload — editor saves mid-write produce inconsistent reads. CONFIRMED.
- **Provenance tooling is rare but high-value.** `git config --show-origin --show-scope` and VS Code's per-setting badges are the gold standard; most ecosystems leave debugging to the caller. INFERRED that SQL-backed `(scope, key, value)` schemas surface provenance for free.

---

## 13. Notes on confidence + gaps

- CONFIRMED items are backed by primary docs (engine documentation, official tool reference) or by multiple independent secondary sources agreeing.
- INFERRED items synthesize the pattern from one strong source plus consistent supporting context — flagged where engine semantics are clear but specific behavior wasn't directly cited.
- UNCERTAIN items: PGlite's FDW status; better-sqlite3's update-hook ergonomics; whether VS Code raises a structured error or silently overrides on cross-scope type mismatch. These would need primary-source code reads to confirm.
- **Not researched here:** XDG Base Directory Specification details. (TOML, HCL2, Helm, Kustomize, and Cursor MDC are now covered in §14.)

---

## 14. Adjacent formats: TOML, HCL2, Helm, Kustomize

This section covers cascade systems that the rest of the file's backends do not exhibit: language-level inheritance keywords (Cargo `workspace = true`), explicit-pass module composition (HCL2/Terraform), declarative subchart scoping (Helm), and patch-as-overlay (Kustomize). Confidence labels follow the same convention as the rest of the file.

### 14.1 TOML

**Format-level (TOML 1.0).** TOML the format defines no inheritance, no `extends`, no merging across files. The [TOML 1.0 spec](https://toml.io/en/v1.0.0) is silent on multi-file composition; "inline tables are fully self-contained and define all keys and sub-tables within them. Keys and sub-tables cannot be added outside the braces" (CONFIRMED — direct quote). All cascade behavior in the TOML ecosystem is **app-defined**, identical to YAML/JSON in §11.1–11.2.

**Cargo workspaces.** Cargo introduces an in-format inheritance keyword via `workspace = true`. Per [Cargo workspaces docs](https://doc.rust-lang.org/cargo/reference/workspaces.html): "The `workspace.package` table is where you define keys that can be inherited by members of a workspace. These keys can be inherited by defining them in the member package with `{key}.workspace = true`" (CONFIRMED). [Cargo dependencies docs](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) extend this to `[workspace.dependencies]`. Cascade direction: **member opts in by name**, not closer-wins. A field with `workspace = true` is sourced from `[workspace.package]`; absent that opt-in, the workspace's value is invisible to the member (CONFIRMED).

Override surface is narrow. Only two keys may sit alongside `workspace = true` on a dependency: `optional` and `features`. `features` is **additive** with `[workspace.dependencies]`'s features, not replace ([Cargo deps docs](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html), CONFIRMED). All other keys (`version`, `default-features`, `git`, `path`) cannot be overridden at the member level.

Three sections live root-only and are silently ignored if a member declares them: `[patch]`, `[replace]`, `[profile.*]` ([Cargo workspaces docs](https://doc.rust-lang.org/cargo/reference/workspaces.html), CONFIRMED). This is an inversion of the §1 "more-specific-wins" default — for these sections the **root wins exclusively**, no merge.

**pyproject.toml.** PEP 517/518 + [PyPA pyproject.toml spec](https://packaging.python.org/en/latest/specifications/pyproject-toml/) define a single-file format with namespaced `[tool.<name>]` sections, one per consumer ("A project can use the subtable `tool.$NAME` if, and only if, they own the entry for `$NAME` in the Cheeseshop/PyPI" — CONFIRMED). The PyPA spec defines no inheritance between nested `pyproject.toml` files (CONFIRMED — silent on the topic).

**Tool-level divergence is sharp.** Within the same `[tool.*]` namespace convention, individual tools implement opposite directory-walk semantics:

- **Ruff:** "supports hierarchical configuration, such that the 'closest' config file in the directory hierarchy is used for every individual file. However, in locating the 'closest' `pyproject.toml` file for a given path, Ruff ignores any `pyproject.toml` files that lack a `[tool.ruff]` section" ([Ruff configuration docs](https://docs.astral.sh/ruff/configuration/), CONFIRMED). Closer-wins; tool-section absence is a skip signal.
- **Black:** "stops looking when it finds a `pyproject.toml` file, even though that file doesn't contain any black config section" ([psf/black#2863](https://github.com/psf/black/issues/2863), CONFIRMED). First-found-wins; tool-section absence is a stop signal that produces a no-op config.

Two tools, same file format, same `[tool.*]` namespace convention, opposite handling of `pyproject.toml` files lacking their section. Consumer of the cascade cannot generalize from "the file format is TOML" — the resolution algorithm is per-tool.

**Other TOML-using cascades.** Hugo accepts `config.toml` (one of three accepted formats), Cursor MDC frontmatter is YAML inside `.mdc` files (not TOML — see §14.5). Cargo's `workspace = true` keyword has no analog in pyproject's tool namespace.

### 14.2 HCL2 (Terraform / OpenTofu)

**Variable precedence.** [Terraform variables docs](https://developer.hashicorp.com/terraform/language/values/variables) state the exact precedence order, lowest to highest (CONFIRMED — direct list):

1. `default` argument of the `variable` block
2. Environment variables (`TF_VAR_<name>`)
3. `terraform.tfvars` file
4. `terraform.tfvars.json` file
5. Any `*.auto.tfvars` or `*.auto.tfvars.json` files in **lexical order**
6. Any `-var` and `-var-file` options on the command line **in the order provided**, plus variables from HCP Terraform

Two distinct ordering rules in one chain: lexical (auto.tfvars) and CLI-argument (`-var`, `-var-file`). Both are documented as "later wins" within their tier (CONFIRMED). This is uncommon in the §1 cascade survey — most tools use either path-position or array-position, not both at different tiers.

**Module composition is explicit-pass, not inheritance.** [Terraform modules syntax docs](https://developer.hashicorp.com/terraform/language/modules/syntax) describe variables flowing parent → child only via the `module` block's argument list. Child modules declare what they accept via `variable` blocks; the parent passes specific values; nothing implicit (CONFIRMED). Outputs flow back via `module.<label>.<output>`. There is no scope-cascade — variable names in the parent do not shadow or fall through to children.

**Module sources.** [Terraform module sources docs](https://developer.hashicorp.com/terraform/language/modules/sources) enumerate: public/private Terraform Registry, generic Git repos (with `?ref=` for branch/tag/SHA), GitHub, BitBucket, S3, GCS, HTTP, local filesystem (CONFIRMED). Source type carries no cascade — each `module` block resolves one source. Version constraints on registry sources behave like dependency resolution, not like config cascade.

**Cross-state references.** [`terraform_remote_state`](https://developer.hashicorp.com/terraform/language/state/remote-state-data) reads root-module outputs from another state file: "uses the latest state snapshot from a specified state backend to retrieve the root module output values from some other Terraform configuration" (CONFIRMED). Hashicorp explicitly **deprecates this as the recommended approach**: "We recommend using the `tfe_outputs` data source in the HCP Terraform/Enterprise Provider to access remote state outputs in HCP Terraform or Terraform Enterprise" (CONFIRMED — direct quote). The docs caution that consumers receive the entire state snapshot, not just the requested outputs, which often contains sensitive data — alternatives like DNS, S3, Parameter Store, Consul are listed as preferred for cross-config data sharing.

**Workspaces.** Terraform CLI workspaces (`terraform workspace`) isolate state files only; they do not change variable precedence or module resolution. `terraform.workspace` is exposed as a built-in expression and must be threaded through configuration explicitly. INFERRED that this differs from the "scope" notion in §1 — workspaces are state-storage scopes, not config-resolution scopes.

### 14.3 Helm (Helm 3)

**Values precedence.** [Helm values files docs](https://helm.sh/docs/chart_template_guide/values_files/) state the precedence chain in order of specificity, lowest to highest (CONFIRMED — direct quote): "`values.yaml` is the default, which can be overridden by a parent chart's `values.yaml`, which can in turn be overridden by a user-supplied values file, which can in turn be overridden by `--set` parameters."

Multiple `-f` files: the official docs leave the multi-`-f` order ambiguous; the dominant secondary-source consensus ([Helm advanced guide](https://medium.com/@bavicnative/helm-advanced-values-overrides-and-dependencies-35976b996143), [oneuptime guide](https://oneuptime.com/blog/post/2026-01-17-helm-values-files-multi-environment/view), [Argo CD docs](https://argo-cd.readthedocs.io/en/latest/user-guide/helm/)) is **last `-f` wins** — `helm install -f a.yaml -f b.yaml` resolves with `b.yaml` overriding `a.yaml` (INFERRED — multi-source agreement, no primary-doc quote).

**Merge semantics differ by container type.** Maps deep-merge (later files override per-key but preserve unspecified keys); arrays/lists are **replaced wholesale**, not concatenated ([Helm advanced guide](https://medium.com/@bavicnative/helm-advanced-values-overrides-and-dependencies-35976b996143), CONFIRMED across multiple secondary sources). This matches the §5 VS Code "primitive replace, object merge" pattern but extends "primitive replace" to arrays.

**Subcharts.** [Helm subcharts docs](https://helm.sh/docs/chart_template_guide/subcharts_and_globals/) define a one-way scope: "A subchart is considered 'stand-alone', which means a subchart can never explicitly depend on its parent chart" and "a subchart cannot access the values of its parent" (CONFIRMED — direct quotes). Parent overrides subchart values by writing under a top-level key matching the subchart's name; the subchart's templates still reference `.Values.<key>` unchanged — scope adjustment happens during value passing (CONFIRMED).

**Globals.** A reserved `global:` namespace propagates across all charts: "Globals require explicit declaration. You can't use an existing non-global as if it were a global" ([Helm subcharts docs](https://helm.sh/docs/chart_template_guide/subcharts_and_globals/), CONFIRMED). This is an explicit opt-in escape hatch from the strict subchart isolation.

**Library charts vs application charts.** Library charts provide reusable template helpers but cannot be installed directly; application charts are deployable units. UNCERTAIN whether values cascade differs between the two — the surfaced docs cover application-chart semantics only.

### 14.4 Kustomize

**Base + overlays.** [Kustomize base/overlays guide](https://kubectl.docs.kubernetes.io/guides/introduction/kustomize/) describes the model: "An overlay is just another kustomization, referring to the base, and referring to patches to apply to that base" (CONFIRMED — direct quote). Per-environment cascade is structural — separate overlay directories (`overlays/dev/`, `overlays/prod/`) each contain a `kustomization.yaml` plus patch files, both pointing at the same base.

**Patch types.** Two patch styles, with different semantics ([kustomize builtins reference](https://kubectl.docs.kubernetes.io/references/kustomize/builtins/#_strategicmergepatchtransformer_), CONFIRMED):

- **Strategic merge patch:** Kubernetes-native semantics, partial-resource patches that name-match against base resources. "The names in these (possibly partial) resource files must match names already loaded via the `resources` field. These entries are used to _patch_ (modify) the known resources." Limitation: "kustomize does not support more than one patch for the same object that contain a _delete_ directive" (CONFIRMED).
- **JSON patch (RFC 6902):** explicit operation list (`add`, `replace`, `remove`, `move`, `copy`, `test`) against JSON paths. More verbose, more deterministic — does not depend on Kubernetes type information.

Strategic-merge is the default when the patch file matches a known type's schema; JSON-patch is selected via the `patches[]` entry's `patch:` field carrying RFC 6902 ops. CONFIRMED that both can coexist in one overlay.

**Cascade direction.** Overlay-on-base is **most-specific-wins** at the patch level, but the unit of "specific" is the patch operation, not the file. A strategic-merge patch can merge into a Deployment's `spec.template.spec.containers[0].env`, leaving the rest of the Deployment intact. INFERRED that this is structurally closer to Renovate's per-option mergeability (§5) than to VS Code's type-aware merge — kustomize's mergeability is per-Kubernetes-resource-type, encoded in upstream Kubernetes schema annotations (`patchStrategy`, `patchMergeKey`).

**No live reload.** `kustomize build` is a one-shot transform pipeline; the merged output is materialized at build time. There is no in-cluster runtime reload — config-change propagation requires a re-apply (`kubectl apply -k`).

### 14.5 Cursor MDC rules

The §1 table and §9 already cite Cursor's Team → Project → User precedence with **earlier-wins** semantics. Verified against [Cursor rules docs](https://cursor.com/docs/context/rules) (CONFIRMED — direct quotes): "Rules are applied in this order: Team Rules → Project Rules → User Rules" and "All applicable rules are merged; earlier sources take precedence when guidance conflicts."

Adding the rule-type taxonomy that wasn't in §1 (CONFIRMED — direct from same docs):

- **Always Apply:** loaded into every chat session regardless of file context
- **Apply Intelligently** (Agent Requested): the system decides relevance from the rule's description
- **Apply to Specific Files** (Auto Attached): activated when files match glob patterns in the rule's frontmatter
- **Apply Manually:** invoked via `@mention`

Nested `AGENTS.md` adds directory-level granularity, "with more specific instructions taking precedence" (CONFIRMED). This is an inversion within the same product — Team/Project/User uses **earlier-wins**, but nested `AGENTS.md` within a project uses **closer-wins**. Two cascade directions in one tool.

### 14.6 Continuation of §9 multi-scope adoption table

| Tool | Scope levels | Cascade direction | Merge semantics | Discovery | Reload | Source |
| --- | --- | --- | --- | --- | --- | --- |
| **Cargo** | Workspace `Cargo.toml` → member `Cargo.toml` (with `workspace = true` opt-in); `[patch]/[replace]/[profile.*]` root-only | Root-only for some sections; opt-in inheritance for others; member additive on `features` | Per-key inheritance via `workspace = true` keyword; features **additive**, other keys non-overridable | Root manifest declared via `[workspace] members = [...]`; `cargo` walks up to find it | Per-build (Cargo recomputes lockfile) | [Cargo workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html), [Cargo deps](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) |
| **pyproject.toml (PyPA)** | Single file per project; `[tool.<name>]` namespaced sections; no spec-level inheritance | N/A at format level — per-tool | N/A — each tool reads its own subtable | Hard-coded `pyproject.toml` filename | Per-invocation | [PyPA spec](https://packaging.python.org/en/latest/specifications/pyproject-toml/) |
| **Ruff** (TOML consumer) | `pyproject.toml` ladder up the directory tree; only files containing `[tool.ruff]` count | Closer-to-target wins; section-absence skips | Per-rule; closest file replaces | Upward directory walk, filter on `[tool.ruff]` presence | Per-invocation | [Ruff config](https://docs.astral.sh/ruff/configuration/) |
| **Black** (TOML consumer) | First `pyproject.toml` found ascending the tree | First-found wins; section-absence stops the search | N/A — only one file used | Upward directory walk, stops at first `pyproject.toml` regardless of `[tool.black]` presence | Per-invocation | [psf/black#2863](https://github.com/psf/black/issues/2863) |
| **Terraform / OpenTofu** | `default` → env (`TF_VAR_*`) → `terraform.tfvars` → `terraform.tfvars.json` → `*.auto.tfvars` (lexical) → `-var-file` / `-var` (CLI order) | Mixed: lexical at the auto.tfvars tier, CLI-order at the flags tier; later wins within each tier | Per-variable replace; module composition is explicit-pass via `module` block args (no inheritance) | Auto-loaded files: hard-coded filename glob in CWD; `-var-file`: caller-supplied path | Per-`plan`/`apply`; state changes via `terraform_remote_state` are read-time | [Terraform variables](https://developer.hashicorp.com/terraform/language/values/variables), [Terraform modules](https://developer.hashicorp.com/terraform/language/modules/syntax), [terraform_remote_state](https://developer.hashicorp.com/terraform/language/state/remote-state-data) |
| **Helm 3** | Chart `values.yaml` → parent chart `values.yaml` → `-f <file>` (multiple, later-wins) → `--set` CLI | More-specific wins; `--set` highest | Maps deep-merge per key; lists/arrays **replace wholesale**; `global:` is reserved namespace propagated to all subcharts | Chart-relative paths; `-f` caller-supplied; subcharts under `charts/<name>/` | Per-`install`/`upgrade` (Helm is render-and-apply, no live cascade) | [Helm values files](https://helm.sh/docs/chart_template_guide/values_files/), [Helm subcharts](https://helm.sh/docs/chart_template_guide/subcharts_and_globals/) |
| **Kustomize** | Base → overlay (overlays can be stacked) | Overlay wins; per-patch operation, not per-file | Strategic-merge (Kubernetes-schema-aware, per-field merge with `patchStrategy`/`patchMergeKey`) **or** JSON-patch (RFC 6902 explicit ops); both can mix | `kustomization.yaml` declares `resources:` and `patches:` paths; `bases:` (legacy) / `resources:` reference base directories | Build-time only; `kubectl apply -k` re-runs the pipeline | [Kustomize guide](https://kubectl.docs.kubernetes.io/guides/introduction/kustomize/), [Kustomize builtins](https://kubectl.docs.kubernetes.io/references/kustomize/builtins/#_strategicmergepatchtransformer_) |
| **Cursor (rule types)** | Team → Project (`.cursor/rules/*.mdc`) → User; nested `AGENTS.md` overlays | Team/Project/User: **earlier wins**; nested `AGENTS.md`: **closer wins** (opposite direction within same tool) | All applicable rules merged; rule-type taxonomy: Always / Auto Attached (glob) / Agent Requested (description-driven) / Manual (@mention) | Glob attach per `.mdc` frontmatter; `AGENTS.md` discovered by directory walk | Live | [Cursor rules](https://cursor.com/docs/context/rules) |

### 14.7 Cross-format observations

- **In-format inheritance keywords are rare.** Cargo's `workspace = true` is the only example surveyed in this section where the file format itself carries an opt-in inheritance marker. Helm, Terraform, Kustomize, and Cursor all keep cascade resolution in the consuming tool, not the format. CONFIRMED.
- **"Closer-to-target wins" remains dominant, but with carve-outs.** Cargo `[patch]/[replace]/[profile.*]` are root-only (opposite of closer-wins). Cursor's Team/Project/User chain is earlier-wins, but its nested `AGENTS.md` is closer-wins — a single tool with two directions. INFERRED that "what counts as 'closer'" is per-feature within a tool, not per-tool.
- **Array merge semantics divide the field.** Helm replaces lists wholesale; Cargo features are additive; Kustomize strategic-merge consults Kubernetes schema annotations (`patchMergeKey`) to choose per-list. Lodash `_.merge()` index-merges (§5). No two of these match. CONFIRMED that array handling is the single most divergent merge sub-dimension across §5 + §14.
- **Render-time vs runtime cascade.** Helm and Kustomize materialize the merged output at build/render time — there is no runtime re-resolution after apply. This is structurally different from VS Code, Cursor, and PostgreSQL `LISTEN`/`NOTIFY` (§7), which keep cascade live. INFERRED that GitOps tooling (ArgoCD, Flux) re-renders on input changes to simulate runtime cascade externally.
- **Explicit-pass vs implicit-inherit.** Terraform module composition is explicit-pass (every variable a child needs must be named in the parent's `module` block). Cargo workspace inheritance is named-opt-in (`workspace = true`) but only for sanctioned keys. Helm subcharts use parent-keyed-by-name (write under `mysubchart:` to override). Kustomize is patch-by-resource-name. Four formats, four different name-binding mechanisms. CONFIRMED — none is "implicit fall-through" of the JS/Python module-system style.
- **Provenance tooling parity with §10.** Helm has `helm template --debug` to show merged values; Kustomize has `kustomize build` (the merged output is itself the artifact); Terraform has `terraform plan` showing resolved variable values; Cargo has `cargo metadata` for the resolved manifest tree. INFERRED that build-time-render formats inherit provenance for free — the merged artifact is inspectable as a file. Live-cascade systems (VS Code, Cursor) need explicit provenance UI to expose the same information.
