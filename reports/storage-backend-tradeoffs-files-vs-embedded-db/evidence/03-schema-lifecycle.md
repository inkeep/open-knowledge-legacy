---
title: "Schema lifecycle"
description: "Schema definition, migrations, versioning, compat windows, codegen, and migration tooling UX across 10 storage backends"
date: 2026-04-23
sources:
  - https://orm.drizzle.team/docs/migrations
  - https://orm.drizzle.team/docs/drizzle-kit-generate
  - https://orm.drizzle.team/docs/drizzle-kit-migrate
  - https://orm.drizzle.team/docs/drizzle-kit-push
  - https://orm.drizzle.team/docs/drizzle-kit-pull
  - https://orm.drizzle.team/docs/kit-overview
  - https://orm.drizzle.team/docs/connect-pglite
  - https://orm.drizzle.team/docs/get-started/turso-new
  - https://github.com/drizzle-team/drizzle-orm/discussions/2532
  - https://github.com/drizzle-team/drizzle-orm/issues/3826
  - https://github.com/sindresorhus/electron-store
  - https://github.com/sindresorhus/electron-store/blob/main/readme.md
  - https://github.com/sindresorhus/electron-store/issues/108
  - https://github.com/sindresorhus/electron-store/pull/143
  - https://github.com/sindresorhus/conf
  - https://github.com/typicode/lowdb
  - https://github.com/typicode/lowdb/issues/39
  - https://github.com/typicode/lowdb/issues/505
  - https://github.com/typicode/lowdb/issues/554
  - https://www.sqlite.org/lang_altertable.html
  - https://www.sqlitetutorial.net/sqlite-alter-table/
  - https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/
  - https://github.com/BlackGlory/better-sqlite3-migrations
  - https://github.com/patlux/bun-sqlite-migrations
  - https://github.com/sequelize/umzug
  - https://github.com/sequelize/umzug/releases/tag/v3.0.0
  - https://www.npmjs.com/package/umzug
  - https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model
  - https://www.prisma.io/docs/concepts/components/prisma-migrate/db-push
  - https://www.prisma.io/docs/cli/migrate/deploy
  - https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
  - https://www.postgresql.org/docs/current/sql-altertable.html
  - https://www.enterprisedb.com/blog/adding-new-table-columns-default-values-postgresql-11
  - https://pglite.dev/docs/filesystems
  - https://pglite.dev/docs/orm-support
  - https://github.com/proj-airi/drizzle-orm-browser
  - https://github.com/rphlmr/drizzle-on-indexeddb
  - https://zod.dev/api
  - https://zod.dev/v4/changelog
  - https://www.jcore.io/articles/schema-versioning-with-zod
  - https://github.com/AndrewBastin/verzod
  - https://github.com/loderunner/zod-file
  - https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html
  - https://protobuf.dev/best-practices/dos-donts/
  - https://protobuf.dev/programming-guides/proto3/
  - https://github.com/eemeli/yaml
  - https://eemeli.org/yaml/
  - https://www.npmjs.com/package/yaml
  - https://github.com/bcherny/json-schema-to-typescript
  - https://github.com/ThomasAribart/json-schema-to-ts
  - https://ajv.js.org/
  - https://jsonlines.org/
  - https://www.npmjs.com/package/lowdb
  - https://andriisherman.medium.com/migrations-with-drizzle-just-got-better-push-to-sqlite-is-here-c6c045c5d0fb
framing: 3P / external sources only
---

This evidence file documents how 10 storage backends handle the schema lifecycle: definition, evolution, versioning, compat windows, codegen, tooling UX, and failure modes. Sources are the maintainer-published docs and tracked-issue discussion for each backend, plus general schema-evolution literature (Avro/Protobuf/Confluent) for compat-window concepts. No recommendations.

---

## 1. Schema definition

How each backend lets you declare the shape of stored data.

### 1.1 TypeScript-first (Drizzle, Zod-validated files, Verzod)

**Drizzle ORM.** Schema is declared in TS using Drizzle's column-builder DSL (`pgTable`, `sqliteTable`, etc.). The schema file is the source of truth; SQL DDL is derived from it [CONFIRMED — multiple Drizzle docs].
- "When you define your schema, it serves as the source of truth for future modifications in queries and migrations" ([Drizzle - Migrations](https://orm.drizzle.team/docs/migrations)).
- The same TS schema definitions are consumed by both the runtime query builder and `drizzle-kit` for snapshot/migration generation ([drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)).

**Zod schemas applied to file content.** Libraries such as `zod-config` (YAML/JSON adapters) and `zod-file` ("type-safe file persistence with Zod validation and schema migrations for Node.js. Supports JSON, YAML, and TOML.") wrap the parse → validate → access pipeline ([zod-file repo](https://github.com/loderunner/zod-file)) [CONFIRMED]. The Zod schema is the canonical declaration; files are typed via `z.infer<typeof Schema>`.

**Verzod.** A small library on top of Zod that lets you declare "versioned entities" — multiple Zod schemas plus migration `up()` functions — and then validate-and-migrate in one call ([verzod README](https://github.com/AndrewBastin/verzod)) [CONFIRMED].

### 1.2 SQL-first (raw `CREATE TABLE`)

**better-sqlite3, bun:sqlite (without ORM).** The schema is defined by hand-written SQL DDL. Tables are created via `db.exec("CREATE TABLE ...")`; migration files contain raw SQL [CONFIRMED — better-sqlite3 / bun:sqlite migration packages].
- `@blackglory/better-sqlite3-migrations` defines migrations as objects with a `version: number` plus `up`/`down` SQL strings ([better-sqlite3-migrations repo](https://github.com/BlackGlory/better-sqlite3-migrations)).
- `bun-sqlite-migrations` reads sequentially-named SQL files (`0001_init.sql`, `0002_add_users_table.sql`, …) from a `./migrations` directory ([patlux/bun-sqlite-migrations](https://github.com/patlux/bun-sqlite-migrations)).

### 1.3 JSON Schema for files (electron-store)

**electron-store.** The schema is a JSON-Schema-shaped object passed at construction time and is validated by `ajv` under the hood ([electron-store README](https://github.com/sindresorhus/electron-store/blob/main/readme.md)) [CONFIRMED]. Per-property defaults live in the schema or in a separate `defaults` option (`defaults` overrides the schema-level default).

```js
const schema = { foo: { type: 'number', maximum: 100, minimum: 1, default: 50 }, ... };
const store = new Store({ schema });
```

### 1.4 No schema (lowdb)

**lowdb.** No schema layer — `db.data` is a plain JavaScript object. Type discipline is whatever the host TS project layers on top (e.g., a top-level `Low<T>` generic) [CONFIRMED — lowdb README, [npm package](https://www.npmjs.com/package/lowdb)]. The library does not validate.

### 1.5 No-schema with envelope versioning (JSONL append-only)

**JSONL.** The format itself ([jsonlines.org](https://jsonlines.org/)) defines no schema layer. Each line is independent JSON. Per-line "envelope" patterns ([gist on JSON schema versioning](https://gist.github.com/mattyod/3608613); ["each schema must include a schemaVersion property"]) typically wrap the payload as `{ v: 1, type: "...", data: {...} }` [INFERRED — multiple writeups; not standardized in the format itself].

### 1.6 YAML files (yaml@2 Document layer + Zod)

**`yaml` npm package.** Three-layer API: (1) `parse`/`stringify` (JSON.parse-equivalent), (2) `Document` API (preserves comments, anchors, blank lines via `parseDocument`), (3) lexer/parser/composer ([eemeli/yaml docs](https://eemeli.org/yaml/), [npm yaml](https://www.npmjs.com/package/yaml)) [CONFIRMED]. The schema layer is supplied externally — typically Zod, JSON Schema, or a hand-rolled type-guard.

---

## 2. Schema migrations

How each backend transforms data when the schema changes.

### 2.1 Drizzle: `generate` + `migrate` (file-based) or `push` (direct)

**Generate-then-migrate workflow** [CONFIRMED — [Drizzle - Migrations](https://orm.drizzle.team/docs/migrations), [generate](https://orm.drizzle.team/docs/drizzle-kit-generate), [migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)]:

1. `drizzle-kit generate` reads the TS schema, composes a JSON snapshot, diffs it against the previous snapshot in `meta/`, and emits a numbered SQL migration file plus an updated snapshot [CONFIRMED].
2. `drizzle-kit migrate` applies pending SQL migrations and records them in a `__drizzle_migrations` table [CONFIRMED].

The `meta/` folder structure (illustrative):
```
migrations/
  0001_init.sql
  meta/
    _journal.json
    0000_snapshot.json
```

**Push (direct apply)** [CONFIRMED — [drizzle-kit push](https://orm.drizzle.team/docs/drizzle-kit-push)]: "reads through your Drizzle schema file(s) and composes a json snapshot, pulls the database schema, generates SQL migrations based on differences, and applies them to the database … recommended only for local development."

**Pull (introspect)** [CONFIRMED — [drizzle-kit pull](https://orm.drizzle.team/docs/drizzle-kit-pull)]: walks an existing database and emits a `schema.ts` plus snapshot. Database-first workflow.

### 2.2 Prisma Migrate: `migrate dev`, `migrate deploy`, `db push`

**`prisma migrate dev`** generates a new SQL migration file from a schema diff and applies it; intended for local dev ([Prisma mental model](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model)) [CONFIRMED].

**`prisma migrate deploy`** applies pending migration files in non-dev environments; "will not prompt … will just try to apply any pending migrations … will simply abort and ask you to resolve conflicts if it detects drift." Uses advisory locking with a 10-second timeout ([prisma migrate deploy](https://www.prisma.io/docs/cli/migrate/deploy), [Production deployment](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)) [CONFIRMED].

**`prisma db push`** syncs schema to database without persisting a migration file ([db push docs](https://www.prisma.io/docs/concepts/components/prisma-migrate/db-push)). Documented warning: "When db push was used instead of migrate dev, those migration files were never generated. The production database has never seen the change." [CONFIRMED — same docs page + community Q&A].

### 2.3 Raw `ALTER TABLE` (better-sqlite3, bun:sqlite, libsql)

The application owns migration sequencing; each release ships a `db.exec(...)` block guarded by a version check.

### 2.4 SQLite ALTER TABLE: documented limitations

[CONFIRMED — [SQLite ALTER TABLE docs](https://www.sqlite.org/lang_altertable.html), [SQLite tutorial](https://www.sqlitetutorial.net/sqlite-alter-table/)]:
- Supported: `RENAME TABLE`, `RENAME COLUMN` (since 3.20.0), `ADD COLUMN`, `DROP COLUMN`.
- `DROP COLUMN` "will fail if there are any traces of the column in other parts of the schema that will prevent the schema from parsing after the CREATE TABLE statement has been modified."
- `ADD COLUMN` with `NOT NULL` requires a non-NULL default; expressions and `CURRENT_TIMESTAMP`/`CURRENT_DATE`/`CURRENT_TIME` are disallowed as defaults.
- For richer changes (drop column with FK, reorder columns, add CHECK/FK/NOT NULL constraints, change types), the docs prescribe a "12-step" rebuild: create new table → copy data → drop old → rename. A simpler alternative path covers no-disk-content changes (removing CHECK/FK/NOT NULL constraints, adding/removing/changing defaults).

### 2.5 Postgres `ALTER TABLE ADD COLUMN` (PGlite, libsql via Postgres-compat is N/A; this is for Postgres-flavored backends)

[CONFIRMED — [PostgreSQL ALTER TABLE docs](https://www.postgresql.org/docs/current/sql-altertable.html), [EnterpriseDB blog on PG11](https://www.enterprisedb.com/blog/adding-new-table-columns-default-values-postgresql-11)]:
- Since PostgreSQL 11, `ADD COLUMN` with a non-volatile DEFAULT stores the default in table metadata; "no rewrite of the table required" (constant-time on existing rows).
- Volatile defaults (`clock_timestamp()`), stored generated columns, identity columns, or columns with constrained domain types still trigger a full table-and-index rewrite.

### 2.6 Umzug (framework-agnostic migration runner)

[CONFIRMED — [umzug repo](https://github.com/sequelize/umzug), [npm](https://www.npmjs.com/package/umzug)]:
- Migration files expose `up`/`down` async functions; runner invokes them in order.
- `umzug.up()` returns the array of executed migration names; `umzug.down()` reverts the last one.
- Storage backends for the executed-migrations log: `JSONStorage` (writes a `umzug.json` file), `SequelizeStorage` (`SequelizeMeta` table in any Sequelize-supported DB), `memoryStorage` (tests).
- v3 (`migrations.glob`) replaces v2's `path`/`pattern`/`traverseDirectories`. Sort order is lexicographic on path: `m1, m10, m11, …, m2` is a documented foot-gun unless filenames are zero-padded or timestamped ([umzug v3 release notes](https://github.com/sequelize/umzug/releases/tag/v3.0.0)).

### 2.7 File rewrites (lowdb, JSON files, YAML files)

No tooling — the application reads, transforms in-memory, and writes back.
- lowdb: "db.data is just a JavaScript object with no magic, so you can modify it using standard JavaScript" ([lowdb #39](https://github.com/typicode/lowdb/issues/39)) [CONFIRMED].
- For multi-file migrations (per-doc JSON files), the application loops the directory and rewrites each file.

### 2.8 JSONL: append-only, no in-place migration

[CONFIRMED — [jsonlines.org](https://jsonlines.org/), schema-versioning gist]:
- The format is append-friendly by design; in-place rewrites of older lines defeat that property.
- Standard practice: keep all envelope versions readable forever, OR run a one-shot "rewrite to new file" pass under a version-cutover flag.

### 2.9 electron-store built-in migrations API

[CONFIRMED — [electron-store README](https://github.com/sindresorhus/electron-store/blob/main/readme.md), [issue #19](https://github.com/sindresorhus/electron-store/issues/19), [PR #143](https://github.com/sindresorhus/electron-store/pull/143)]:

```js
import Store from 'electron-store';
const store = new Store({
  migrations: {
    '0.0.1': store => { store.set('debugPhase', true); },
    '1.0.0': store => { store.delete('debugPhase'); store.set('phase', '1.0.0'); },
    '1.0.2': store => { store.set('phase', '1.0.2'); }
  }
});
```

The current persisted version is recorded inside the store; on upgrade, `electron-store` runs each handler whose key (or semver range) is greater than the recorded version. README warns: "I cannot provide support for this feature. It has some known bugs. I have no plans to work on it, but pull requests are welcome." [CONFIRMED]. Historical bug tracked the *electron-store package version* rather than the *application version*, causing future migrations not to fire ([issue #108](https://github.com/sindresorhus/electron-store/issues/108)); fixed in [PR #143](https://github.com/sindresorhus/electron-store/pull/143).

**conf** (the underlying library — sindresorhus/conf) exposes the same migrations interface; "`projectVersion` option is now required if you use the migration option." ([conf repo](https://github.com/sindresorhus/conf)) [CONFIRMED].

### 2.10 lowdb: no migrations API

[CONFIRMED — [lowdb #39](https://github.com/typicode/lowdb/issues/39)]: lowdb does not expose migrations. Users hand-write a one-time transform after `db.read()`. The library has itself broken back-compat (v1→v3 removed `db.defaults()`; later versions split the `JSONFile` import into `lowdb/node`; `JSONPreset` was renamed `JSONFilePreset`) — see [issue #505](https://github.com/typicode/lowdb/issues/505) and [issue #554](https://github.com/typicode/lowdb/issues/554) [CONFIRMED].

---

## 3. Versioning + breaking-change strategy

### 3.1 Schema-version columns / fields

**SQL backends.** SQLite has the built-in `PRAGMA user_version` (a free 32-bit int stored at a fixed offset in the file) — every documented SQLite-migration article uses it as the canonical version cursor ([Lev Lazinskiy](https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/), [BlackGlory/better-sqlite3-migrations](https://github.com/BlackGlory/better-sqlite3-migrations)) [CONFIRMED]. ORMs (Drizzle, Prisma, Sequelize via Umzug) instead use a dedicated table (`__drizzle_migrations`, `_prisma_migrations`, `SequelizeMeta`).

**Document-store / NoSQL pattern (general literature).** Add a `schemaVersion` field to each document; reader code branches on it ([Confluent schema evolution docs](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html); MongoDB / Cosmos DB schema-versioning pattern docs) [CONFIRMED].

### 3.2 JSON envelope versioning

[CONFIRMED — Confluent docs, OneUptime event-schema-design article, Avro/Protobuf practice]:
- Wrap each payload as `{ v: 1, type: "...", data: {...} }` (or an explicit `schema_version` semver string).
- Allows readers to dispatch on version and consumers to see "the nature of changes (major, minor, patch) without examining schema details."

### 3.3 Filename versioning

[INFERRED — common practice; not formalized in any single source]: `config.v2.yml`, `state.v3.json`. Breaks the "one well-known file" property; readers must scan for the highest version present.

### 3.4 Per-record vs whole-store versioning

**Per-record** (JSONL, NoSQL, document-store with mixed migrations): each row carries its own version; reader normalizes on read.

**Whole-store** (electron-store, conf, SQLite via `user_version`): one version cursor for the whole file/database; on open, run all forward migrations.

### 3.5 Drizzle's snapshot ledger

[CONFIRMED — [Drizzle - Migrations](https://orm.drizzle.team/docs/migrations)]: Drizzle stores per-migration snapshot JSON in `meta/`. The next `generate` call diffs the new TS schema against the most recent snapshot, not against any live database state. The **executed** migrations are recorded in `__drizzle_migrations` inside the database. Prisma (`_prisma_migrations`) and Sequelize/Umzug (`SequelizeMeta`) follow the same dual-state model.

---

## 4. Compat windows

The general-purpose vocabulary comes from the schema-registry literature [CONFIRMED — [Confluent schema evolution](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)]:

- **BACKWARD compat:** new code reads old data. Add new fields with defaults; do not remove or rename without aliases.
- **FORWARD compat:** old code reads new data (ignoring extra fields). Add only optional fields.
- **FULL compat:** both. Most restrictive; pure additive optional changes only.
- **TRANSITIVE variants** check across all prior versions, not just N-1.

### 4.1 What each backend's idioms imply

**Protobuf** [CONFIRMED — [protobuf.dev best practices](https://protobuf.dev/best-practices/dos-donts/), [proto3 guide](https://protobuf.dev/programming-guides/proto3/)]:
- Adding fields is safe (old code ignores new tags; new code sees defaults).
- "Never change field numbers." Field 1–15 are 1-byte; reserve them for hot-path fields.
- When removing, use `reserved` for both number and name to prevent accidental reuse.
- Enum values should not be removed; `reserved` again.
- Result: forward + backward compat for schemas that only add or `reserved`-out fields.

**Avro** [CONFIRMED — Confluent docs, Java Code Geeks article]:
- Backward-compat: new fields require defaults.
- Forward-compat: new optional fields only; consumers ignore unknown fields.
- FULL compat: only purely additive optional changes.

**Zod** [CONFIRMED — [Zod versioning page](https://zod.dev/v4/versioning), [JCore article](https://www.jcore.io/articles/schema-versioning-with-zod), [Verzod](https://github.com/AndrewBastin/verzod)]:
- No native versioning. Patterns observed in the wild:
  - Discriminated union of versions (`z.discriminatedUnion('v', [V1Schema, V2Schema, ...])`) plus a normalize function that lifts old shapes to the latest.
  - Verzod formalizes this with `defineVersion()` + `up()` migration functions per version.
  - Strip-vs-passthrough on extra keys (default Zod behavior is strict for `.object`, `.passthrough()` for forward-compat read).

**electron-store / conf migrations API** are forward-only; no documented `down` migrations [CONFIRMED — README]. Old binaries running with a newer store fail validation against the old schema unless the schema is permissive.

**SQL ALTER TABLE patterns:**
- Postgres add-with-default since 11 is constant-time for non-volatile defaults — application code can read both shapes during the deployment window if it `SELECT col` post-migration ([PostgreSQL 11 add-column blog](https://www.enterprisedb.com/blog/adding-new-table-columns-default-values-postgresql-11)) [CONFIRMED].
- SQLite `ADD COLUMN` is similarly cheap (default is stored in metadata); but `DROP COLUMN` is documented to "take time that is proportional to the amount of content in the table being altered" ([SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)) [CONFIRMED].

### 4.2 Cost of breaking compat (what each ecosystem documents)

- **Drizzle/Prisma:** breaking a column requires either (a) a deploy gate (migrate before code) or (b) an additive shim release first (add new column, dual-write, backfill, drop old) — Prisma's "Patching & hotfixing" guide is built around this ([Prisma patching docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)) [CONFIRMED].
- **electron-store:** the upgrade path is forward-only; downgrading (user reinstalls older app) leaves the store in a state the old code's schema may reject.
- **JSONL:** old envelopes never re-write, so consumers must keep readers for every version emitted historically.
- **lowdb:** no built-in story; the library itself has shipped breaking changes that broke users' migration code [CONFIRMED — [lowdb #505](https://github.com/typicode/lowdb/issues/505), [lowdb #554](https://github.com/typicode/lowdb/issues/554)].

---

## 5. Codegen story

### 5.1 Drizzle (TS schema → query types)

[CONFIRMED — [Drizzle docs](https://orm.drizzle.team/docs/sql-schema-declaration)]:
- `pgTable("users", { id: integer().primaryKey(), name: text() })` — the table object is both the runtime query target and the source of static types. No separate codegen step is required for query types.
- `drizzle-kit generate` produces SQL migration files + a JSON snapshot — that is the only filesystem artifact codegen produces.

### 5.2 Prisma (`prisma generate` → `@prisma/client`)

[CONFIRMED — Prisma docs]:
- Schema in `schema.prisma` (a custom DSL).
- `prisma generate` writes a typed client into `node_modules/@prisma/client` (or a configurable output).
- Types are derived from the schema's models, fields, and relations.

### 5.3 Zod (type inference, no codegen)

[CONFIRMED — [Zod API](https://zod.dev/api), [intro](https://zod.dev/)]:
- `type T = z.infer<typeof Schema>` — pure TS type inference; no build step.
- `z.input<typeof S>` / `z.output<typeof S>` for transforms.
- Extension pattern: `BaseSchema.extend({ ... })`, `.partial()`, `.omit()`, `.pick()`.

### 5.4 JSON Schema → TS

Three documented routes [CONFIRMED — [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript), [json-schema-to-ts](https://github.com/ThomasAribart/json-schema-to-ts)]:

1. **`json-schema-to-typescript` (json2ts).** CLI/programmatic codegen that compiles a JSON Schema to a `.d.ts` file. `json2ts foo.json > foo.d.ts`.
2. **`json-schema-to-ts` (FromSchema).** Pure-TS type inference: `type Dog = FromSchema<typeof dogSchema>` against an `as const` schema literal. "Zero impact on the compiled code."
3. **quicktype** (multi-language; can emit TS interfaces + runtime validators).

Tradeoff documented across these projects: codegen at build-time vs type-inference at type-check-time; the inference route requires `as const` and skips runtime validation entirely (which a separate validator like ajv must provide).

### 5.5 electron-store (schema as runtime + types via TS generics)

[CONFIRMED — [Snyk advisor / Whoisryosuke writeup](https://whoisryosuke.com/blog/2022/using-typescript-with-electron-store/)]: the schema is JSON Schema for ajv validation; TS types are supplied separately via `new Store<MyType>({...})`. There is no automatic schema→type generation in the package itself.

### 5.6 lowdb (no codegen)

`Low<T>` is a generic; the user provides `T`. No automated derivation [CONFIRMED — [lowdb npm](https://www.npmjs.com/package/lowdb)].

---

## 6. Migration tooling UX

### 6.1 Devloop ergonomics

| Backend | Auto-generate migration? | Hand-write needed for? | Iteration speed |
|---|---|---|---|
| Drizzle | Yes — `drizzle-kit generate` diffs TS schema → SQL [CONFIRMED] | Renames (prompts for confirmation), data backfills, complex DDL | Fast; or use `push` for direct apply in dev |
| Prisma | Yes — `migrate dev` from `schema.prisma` [CONFIRMED] | Data backfills, custom SQL needs `--create-only` then edit | Fast; or `db push` for prototyping |
| better-sqlite3 + Umzug | No — write `up`/`down` SQL by hand | All DDL | Manual |
| bun:sqlite | No — write `up`/`down` SQL by hand | All DDL | Manual |
| libsql + Drizzle | Yes — Drizzle generate [CONFIRMED] | Same as Drizzle | Fast |
| PGlite + Drizzle | Partial — Drizzle generates SQL; browser-side `migrate` needs JSON-format workaround [CONFIRMED — [Drizzle discussion #2532](https://github.com/drizzle-team/drizzle-orm/discussions/2532)] | Same as Drizzle + browser shim | Slower in browser |
| electron-store | No — write a per-version handler function | All transforms | Fast (single-process state) |
| lowdb | No — write transform code by hand | All transforms | Fast |
| YAML + Zod | No — write a transform | All transforms | Fast |
| JSONL | No tooling | All transforms | Either rewrite-pass or per-line dispatch |

### 6.2 Drizzle rename detection (prompted)

[CONFIRMED — [Drizzle Migrations](https://orm.drizzle.team/docs/migrations), [issue #3826](https://github.com/drizzle-team/drizzle-orm/issues/3826), Answer Overflow thread]:
- "Drizzle Kit detects renames when using strict mode in config."
- Prompts `Is projects.description renamed from projects.summary?` during generate.
- Documented bug: when a column is both renamed AND its config (data type / nullability) changes in the same generate, only the rename SQL is emitted; the type-change SQL is dropped ([drizzle-orm #3826](https://github.com/drizzle-team/drizzle-orm/issues/3826)) [CONFIRMED].

### 6.3 CI gating

**Drift detection (Drizzle).** [CONFIRMED — Drizzle docs / community pitfalls writeups]: `drizzle-kit check` validates that the journal/snapshots are consistent. CI pattern: regenerate, fail if `git diff` is non-empty (i.e., somebody changed the schema without committing the migration).

**Prisma.** [CONFIRMED — [migrate deploy docs](https://www.prisma.io/docs/cli/migrate/deploy)]:
- "ideally migrate deploy should be part of an automated CI/CD pipeline."
- Deploy aborts on drift (won't auto-resolve).
- Advisory locking with 10s timeout serializes concurrent deploys.

**electron-store / conf** ship no CI tooling — version-bump discipline is owned by the application's release process.

**Umzug** exposes `umzug.executed()` and `umzug.pending()` for assertions; CI can fail if pending migrations exist outside expected windows [CONFIRMED — [umzug npm](https://www.npmjs.com/package/umzug)].

### 6.4 Production safety

- **Prisma `migrate deploy`:** advisory lock + abort-on-drift + idempotent re-runs of already-applied migrations [CONFIRMED — [docs](https://www.prisma.io/docs/cli/migrate/deploy)].
- **Drizzle `migrate`:** records each successful migration in `__drizzle_migrations`; idempotent by name [CONFIRMED — [migrate docs](https://orm.drizzle.team/docs/drizzle-kit-migrate)].
- **Drizzle bug:** "Drizzle kit applies multiple migration files in the same transaction" ([issue #3249](https://github.com/drizzle-team/drizzle-orm/issues/3249)) — partial-failure surface [INFERRED from issue title; not validated against current behavior].
- **electron-store:** runs migrations on first read after a version bump; no atomicity guarantee across handlers [INFERRED — README + #108 history].

---

## 7. Migration failure modes

### 7.1 Partial migration

- **SQL ORMs (Drizzle, Prisma, Umzug):** failure mid-migration leaves the database in a partial state unless wrapped in a transaction. Postgres supports transactional DDL for most operations; SQLite supports it for most ALTER TABLE operations [CONFIRMED — [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html); Postgres docs].
- **electron-store migrations:** "It has some known bugs." The historical version-tracking bug ([#108](https://github.com/sindresorhus/electron-store/issues/108)) caused later migrations not to run [CONFIRMED].
- **lowdb:** the library writes the entire JSON file on every `db.write()`. An interrupted write can corrupt the file if the OS-level write isn't atomic [INFERRED — observed pattern; not explicitly documented in lowdb README].
- **JSONL one-shot rewrite:** if the rewrite crashes mid-pass, application is left with a partial file unless it writes to a tmp + atomic rename.

### 7.2 Irreversible ALTER (SQLite)

[CONFIRMED — [SQLite ALTER TABLE docs](https://www.sqlite.org/lang_altertable.html)]:
- `ADD COLUMN` cannot be reversed without the 12-step rebuild (since `DROP COLUMN` has parsing-ambiguity restrictions).
- The 12-step rebuild itself is irreversible without a backup.

### 7.3 ENUM addition vs removal (Postgres / Protobuf)

**Postgres ENUMs.** `ALTER TYPE ... ADD VALUE` is supported (Postgres 9.1+); removing a value is not a single statement and requires the rebuild dance [CONFIRMED — Postgres docs, multiple ALTER TYPE references].

**Protobuf enums.** [CONFIRMED — [protobuf.dev](https://protobuf.dev/best-practices/dos-donts/)]: "Don't remove enum values because old messages with that value will break; instead reserve both the number and name."

### 7.4 Column-rename gotchas

**SQLite.** [CONFIRMED — [SQLite ALTER TABLE docs](https://www.sqlite.org/lang_altertable.html)]: `RENAME COLUMN` (3.20.0+) updates references inside table-definition CHECK constraints and inside views/triggers. "If the column name change would result in a semantic ambiguity in a trigger or view, then the RENAME COLUMN fails with an error."

**Drizzle.** Detected via prompt; bug noted at §6.2 above where rename-plus-type-change loses the type-change SQL [CONFIRMED].

**Generic guidance** (Confluent, Avro, Protobuf): rename = drop + add. Use **aliases** or **add new field, deprecate old, dual-write, drop later** to preserve forward/backward compat.

### 7.5 PGlite browser migration

[CONFIRMED — [Drizzle discussion #2532](https://github.com/drizzle-team/drizzle-orm/discussions/2532), [pglite.dev ORM support](https://pglite.dev/docs/orm-support), [proj-airi/drizzle-orm-browser](https://github.com/proj-airi/drizzle-orm-browser), [drizzle-on-indexeddb](https://github.com/rphlmr/drizzle-on-indexeddb)]:
- "The migrate function exported from `drizzle-orm/pglite/migrator` uses Node APIs, making it incompatible with browser environments."
- Workaround: compile generated SQL migrations into a JSON bundle at build time, then apply via a browser-side runner (`@proj-airi/drizzle-orm-browser-migrator` is one community implementation).
- IndexedDB filesystem flushes after each query unless `relaxedDurability: true` is set ([PGlite filesystems](https://pglite.dev/docs/filesystems)) — implication for migration atomicity is not explicitly addressed in PGlite docs [UNCERTAIN].

### 7.6 lowdb breaking changes (library-level)

[CONFIRMED — [lowdb #505](https://github.com/typicode/lowdb/issues/505), [#554](https://github.com/typicode/lowdb/issues/554)]:
- v1 → modern: `db.defaults()` removed; lodash chaining moved out.
- Import path: `lowdb` → `lowdb/node` for `JSONFile`.
- Preset rename: `JSONPreset` → `JSONFilePreset`.

These are library-API breakages, not data-schema breakages, but they hit users who rely on lowdb's runtime as part of their migration pipeline.

---

## 8. No-schema-needed regime

When does "skip the schema layer" hold up?

### 8.1 Append-only telemetry / event logs (JSONL)

[CONFIRMED — [jsonlines.org](https://jsonlines.org/)]: each line independent; new fields can be added per envelope version with no rewrite of older lines. Readers branch on `v` field. Aligns with Avro/Confluent forward-compat practice.

### 8.2 Single-key config (lowdb, electron-store with permissive schema)

For a small, application-internal blob (window position, last-opened-file, feature-flag overrides), defaults-on-read is often the only "migration" that's documented:
- electron-store's `defaults` option auto-fills missing keys on read [CONFIRMED — README].
- lowdb users typically merge against a defaults object after `db.read()` [CONFIRMED — [lowdb #592](https://github.com/typicode/lowdb/issues/592)].

### 8.3 Internal-tool-only / single-user data

When there is exactly one writer and one reader (the same process across versions), the cost of breaking compat is bounded — a one-shot rewrite on first launch suffices. This is the regime electron-store's migrations API was designed for.

### 8.4 Where "no-schema" stops working (per the consulted literature)

- Multi-writer / multi-process: schema discipline prevents one writer from invalidating another's reads (Confluent compat-mode rationale).
- Long retention: even append-only telemetry needs schema discipline if old envelopes will ever be re-read by new code (BACKWARD_TRANSITIVE in Confluent's taxonomy).
- Cross-team / public surface: the protobuf "never change field numbers, always add (never remove), test both directions" rules [CONFIRMED — [protobuf.dev](https://protobuf.dev/best-practices/dos-donts/)] become load-bearing.

---

## 9. Migration tooling matrix

Representative scenario: **"Add a column / field with a non-NULL default."** What does each backend require?

| Backend | Required steps | Cost on existing data | Codegen / type sync | Reversible? |
|---|---|---|---|---|
| **YAML files (yaml@2 + Zod)** | Update Zod schema with `.default(...)`; on read, missing key fills from default | None (transform on read) | `z.infer` re-derives type | Trivial (just remove field from schema) |
| **JSON files (Zod or JSON Schema)** | Same as YAML — schema gets default, reader fills in | None on read; persist back fills on next write | `z.infer` or `FromSchema` | Trivial |
| **JSONL append-only** | Bump envelope `v`; new writers emit field; readers default on missing | None — older lines stay as-is | Per-version Zod or hand-rolled types | New envelopes carry it; old don't |
| **better-sqlite3 (manual ALTER)** | `db.exec("ALTER TABLE t ADD COLUMN c TYPE NOT NULL DEFAULT '...';")` | Constant-time per SQLite docs (default in metadata) [CONFIRMED] | Hand-update TS row interfaces | `DROP COLUMN` may fail if FK/CHECK references; otherwise 12-step |
| **bun:sqlite (manual ALTER)** | Same as above | Same | Same | Same |
| **libsql + Drizzle** | Edit `schema.ts`; `drizzle-kit generate`; commit migration; `drizzle-kit migrate` | SQLite-class constant-time | Drizzle row types update from schema [CONFIRMED] | Depends on diff next iteration generates |
| **PGlite + Drizzle** | Same generate; in browser, run JSON-format migration (community shim) [CONFIRMED — [#2532](https://github.com/drizzle-team/drizzle-orm/discussions/2532)] | Postgres 11+ constant-time for non-volatile defaults [CONFIRMED] | Drizzle row types | Yes via next migration |
| **Drizzle ORM (any dialect)** | `generate` + `migrate`; or `push` in dev | Per-dialect rules above | Auto-typed | Yes |
| **lowdb** | Add field to TS type; loop `db.data.items.forEach(i => i.x = i.x ?? default); await db.write()` | Reads + rewrites entire JSON file | Hand-update generic `T` | Yes (loop again to remove field) |
| **electron-store** | Bump `projectVersion`; add `migrations: { 'X.Y.Z': store => store.set('field', default) }`; or rely on `defaults` to fill on read | Single-process write; not atomic across handlers | Hand-update `Store<T>` generic | Forward-only API; no `down` |

---

## 10. Cross-cutting observations

**1. "TS schema as source of truth" is converging across ORMs.** Drizzle and Prisma both now offer a "diff TS-DSL → DB" workflow, and both expose a "skip migration files for prototyping" command (`push`/`db push`) alongside the file-based path ([Drizzle - `push`](https://orm.drizzle.team/docs/drizzle-kit-push), [Prisma db push](https://www.prisma.io/docs/concepts/components/prisma-migrate/db-push)) [CONFIRMED]. The Prisma engineering blog frames this as convergence ([Prisma "Plot Twist"](https://www.prisma.io/blog/convergence)) [CONFIRMED — single source].

**2. Schema-evolution literature is dominated by streaming/event systems.** The compat-window taxonomy (BACKWARD / FORWARD / FULL / TRANSITIVE) comes from Avro/Protobuf/Confluent — there is no comparable formalization on the file-DB side. Local-first storage docs reference these concepts implicitly (electron-store's "forward-only migrations", lowdb's "no concept") rather than naming the modes.

**3. "Should you commit migration files?" — sources broadly agree, with one caveat.** Drizzle docs and community articles say yes ("migration files in src/schema/ and meta/ must be committed to version control") [CONFIRMED]. Prisma docs say the same for `migrate dev` output [CONFIRMED]. The only dissent is for the `push`/`db push` flow — by design, those produce no file to commit, and that's documented as a tradeoff: "the production database has never seen the change." [CONFIRMED — Prisma docs + community discussions].

**4. SQLite's documented limitations cascade to all SQLite-family backends.** `better-sqlite3`, `bun:sqlite`, libsql, and Drizzle-on-SQLite all inherit `ALTER TABLE`'s 12-step rebuild requirement for column-drops with FKs, type changes, etc. [CONFIRMED — [sqlite.org](https://www.sqlite.org/lang_altertable.html)].

**5. Browser-side migration is an open gap for embedded-DB-in-browser stacks.** PGlite's documented orm-support page covers Drizzle but the in-browser migration flow requires a community shim ([proj-airi/drizzle-orm-browser](https://github.com/proj-airi/drizzle-orm-browser), [drizzle-on-indexeddb](https://github.com/rphlmr/drizzle-on-indexeddb)) [CONFIRMED]. The JSON-bundle workaround was identified by community blog posts and Drizzle Discussions, not as a first-class API.

**6. electron-store / conf are the only file-DB libraries shipping a migrations API in this set.** Both lowdb and the YAML/JSON+Zod patterns ship validation but not migration tooling — applications hand-roll the transform [CONFIRMED — README/docs scan].

**7. Sources diverge on `push` vs `migrate` for shared dev databases.** Drizzle docs say `push` is "recommended only for local development" [CONFIRMED]; community articles ([makerkit](https://makerkit.dev/docs/nextjs-drizzle/database/migrations), [Medium piece on convergence](https://andriisherman.medium.com/migrations-with-drizzle-just-got-better-push-to-sqlite-is-here-c6c045c5d0fb)) split between "push everywhere in dev, generate at deploy time" and "always generate, even locally, so the migration log is the audit trail." Prisma's docs cite a similar tension and explicitly warn that mixing the two has caused production drift [CONFIRMED].
