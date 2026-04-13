Dimension: D7 — Schema Evolution & Migration
Date: 2026-04-13
Sources: TinaCMS monorepo (schema-tools/, packages/@tinacms/cli/, packages/@tinacms/graphql/, packages/@tinacms/datalayer/), GitHub issues #6629, #5732, #5954, #6412

## Key Files Referenced

- `packages/@tinacms/schema-tools/src/schema/TinaSchema.ts` — core schema type definitions, no versioning fields
- `packages/@tinacms/cli/src/cmds/audit/` — audit command implementation (round-trip consistency check)
- `packages/@tinacms/graphql/src/resolver/index.ts` — GraphQL resolver, field name matching, resolveLegacyValues
- `packages/@tinacms/graphql/src/database/index.ts` — Database class, indexContent (full rebuild), no incremental migration
- `packages/@tinacms/cli/src/cmds/codemod/` — codemod command (single command: move-tina-folder)
- `packages/@tinacms/graphql/src/builder/index.ts` — GraphQL schema builder, SHA256 comparison

## Findings

### No schema versioning mechanism [Confidence: HIGH]

The `Version` type in TinaCMS tracks the TinaCMS package version (e.g., `"1.5.0"`), not a content schema version. There is no schema version field, no migration version counter, no version annotation on documents, and no way to express "this content was written against schema v2 but the current schema is v3."

The schema type system (`TinaField`, `TinaTemplate`, `TinaCollection`) contains no `deprecated`, `migrate`, `alias`, `previousName`, `renamedFrom`, or equivalent fields that would support declarative migration.

### Schema validation is structural-only [Confidence: HIGH]

Schema validation uses Zod for structural type checking (field types match expected shapes, required fields present, no type mismatches). There is no semantic validation that checks content against the schema — e.g., no check that existing documents conform to newly added required fields, no check that field values satisfy new constraints.

### tinacms audit is round-trip, not migration [Confidence: HIGH]

The `tinacms audit` command reads each document, parses it through the GraphQL resolver, serializes it back, and compares. It detects documents that fail to round-trip cleanly (parse errors, serialization differences). It does NOT detect:
- Documents with fields that exist in content but not in schema
- Documents missing fields that were added to schema
- Documents with field values that violate new schema constraints

With the `--clean` flag, audit re-serializes documents, which silently drops any fields not recognized by the current schema. This is a destructive operation disguised as a cleanup tool.

### tinacms codemod has exactly one command [Confidence: HIGH]

The `tinacms codemod` CLI has a single subcommand: `move-tina-folder`. This migrates the `.tina/` directory to `tina/` (a one-time structural change from an earlier version). There are no schema migration codemods, no field rename commands, no type change transforms.

### Database index rebuilt from scratch [Confidence: HIGH]

`indexContent()` in the Database class performs a full rebuild of the Level KV index on every call. It globs all content files, parses each through the current schema, and writes index entries. There is no incremental migration — if the schema changes, the index is simply rebuilt. Documents that fail to parse against the new schema produce indexing errors (visible in logs) but don't block other documents.

### Resolver behavior: strict on write, lenient on read [Confidence: HIGH]

During GraphQL mutations (create/update), the resolver validates all input fields against the schema and throws hard errors on unknown fields — the mutation fails entirely.

During reads (queries), the resolver is more lenient. Extra fields in the content file that don't match the schema are silently ignored — they don't appear in query results but remain in the file on disk (until the next write overwrites the file).

### resolveLegacyValues preserves unknown fields during updates [Confidence: HIGH]

The `resolveLegacyValues` function in the resolver handles a specific case: when updating a document, fields that exist in the current content but are not recognized by the current schema are preserved in the output. This prevents data loss when a schema change removes a field — existing documents retain their old field values through update cycles.

However, this protection does NOT apply to:
- `audit --clean` (re-serializes, dropping unrecognized fields)
- `createDocument` (starts fresh, no legacy values to preserve)
- Full re-indexing (the index only contains schema-recognized fields)

### Schema comparison uses GraphQL diff + SHA256 [Confidence: HIGH]

At build time, TinaCMS compares the current schema's generated GraphQL SDL against the previously built version using both structural GraphQL diff and SHA256 hash. If the schema changed, a full re-index is triggered. This comparison detects schema shape changes but does not generate migration logic — it's a cache invalidation mechanism, not a migration system.

### forestry-migrate is the only "migration" tool [Confidence: HIGH]

The `forestry-migrate` command is a one-time import tool for migrating from Forestry.io to TinaCMS. It converts Forestry's `.forestry/` configuration to `tina/config.ts`. It is not a general-purpose schema migration tool and has no relevance to ongoing schema evolution.

### Community pain is documented [Confidence: HIGH]

Multiple open GitHub issues confirm schema migration is a real production pain point:
- **#6629** — Request for schema migration tooling
- **#5732** — Content breaking after schema changes
- **#5954** — Fields lost after schema rename
- **#6412** — Audit --clean silently dropping data

These issues span 2023-2025 and remain open without resolution or maintainer commitment to address.

## Negative Searches

- No evidence of any schema migration CLI, UI, or API beyond `move-tina-folder` codemod
- No evidence of field aliasing, deprecation markers, or rename tracking in the schema type system
- No evidence of content-schema mismatch detection (beyond parse failures during indexing)
- No evidence of a "dry-run" mode for schema changes that would preview what content would break
- No `migrate`, `evolve`, `upgrade`, or `transform` commands in the CLI

## Gaps

- Whether Tina Cloud's closed-source backend has any additional schema migration tooling not visible in OSS — unlikely given the community pain signals, but not confirmed
- How large production deployments handle schema changes in practice — likely manual: change schema, re-index, fix broken documents by hand, run audit --clean
- Whether the GraphQL SDL diff at build time could be extended to generate migration stubs — architecturally possible but no evidence of plans
