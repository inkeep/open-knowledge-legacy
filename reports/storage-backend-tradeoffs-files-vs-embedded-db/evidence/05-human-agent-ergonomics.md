---
title: "Human + agent ergonomics"
description: "Hand-editability, IDE intellisense, comment preservation, inspectability, patch semantics, agent ergonomics, and schema-driven UI rendering across 10 storage backends"
date: 2026-04-23
sources:
  - https://github.com/redhat-developer/yaml-language-server
  - https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml
  - https://code.visualstudio.com/docs/languages/json
  - https://eemeli.org/yaml/
  - https://www.npmjs.com/package/yaml
  - https://github.com/eemeli/yaml/issues/345
  - https://datatracker.ietf.org/doc/html/rfc6902
  - https://datatracker.ietf.org/doc/html/rfc7396
  - https://erosb.github.io/json-patch-vs-merge-patch/
  - https://zuplo.com/learning-center/json-patch-vs-json-merge-patch
  - https://github.com/rjsf-team/react-jsonschema-form
  - https://github.com/alibaba/formily
  - https://jsonforms.io/docs/integrations/react
  - https://jsonc.org/
  - https://json5.org/
  - https://jqlang.org/manual/
  - https://github.com/mikefarah/yq
  - https://orm.drizzle.team/docs/drizzle-kit-studio
  - https://orm.drizzle.team/drizzle-studio/overview
  - https://github.com/dbcli/litecli
  - https://github.com/dbcli/pgcli
  - https://www.jetbrains.com/help/datagrip/auto-completing-code.html
  - https://sqlite.org/cli.html
  - https://sqlite.org/lang_comment.html
  - https://github.com/asg017/sqlite-docs
  - https://bun.com/docs/runtime/sqlite
  - https://www.npmjs.com/package/better-sqlite3
  - https://docs.turso.tech/libsql
  - https://github.com/tursodatabase/libsql
  - https://pglite.dev/
  - https://pglite.dev/docs/repl
  - https://www.npmjs.com/package/lowdb
  - https://github.com/typicode/lowdb
  - https://www.npmjs.com/package/electron-store
  - https://github.com/sindresorhus/electron-store
  - https://ndjson.com/
  - https://jsonl.help/faq/
  - https://orm.drizzle.team/
  - https://github.com/drizzle-team/drizzle-orm/issues/800
  - https://blogs.oracle.com/developers/comparing-file-systems-and-databases-for-effective-ai-agent-memory-management
  - https://arize.com/blog/agent-interfaces-in-2026-filesystem-vs-api-vs-database-what-actually-works/
  - https://research.aimultiple.com/text-to-sql/
  - https://www.k2view.com/blog/llm-text-to-sql/
  - https://www.arcade.dev/blog/sql-tools-ai-agents-security/
  - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
  - https://www.merge.dev/blog/mcp-tool-schema
  - https://apxml.com/courses/building-advanced-llm-agent-tools/chapter-1-llm-agent-tooling-foundations/tool-input-output-schemas
  - https://yaml.org/spec/1.2.2/
  - https://www.red-gate.com/simple-talk/databases/sql-server/t-sql-programming-sql-server/handling-constraint-violations-and-errors-in-sql-server/
  - https://github.com/yaml-schema/yaml-schema
framing: 3P / external sources only
---

## Sub-dimension 1 — Hand-editability (vim / cat round-trip safety)

**YAML files (yaml@2 Document layer).** Plain text; openable in any editor. CONFIRMED by the yaml@2 docs that "the [Document] interface" is required to "preserve such metadata" as comments and formatting on programmatic edits ([eemeli.org/yaml](https://eemeli.org/yaml/), [npm: yaml](https://www.npmjs.com/package/yaml)). Hand edit + library round-trip is the explicit design goal of the Document layer; the cheaper `parse`/`stringify` API does **not** preserve comments or formatting and will erase them on rewrite (CONFIRMED, eemeli/yaml docs and discussions).

**JSON files.** Plain text, hand-editable. JSON spec disallows comments and trailing commas, so any human-added annotation is invalid JSON; round-trip safe through any conformant parser/serializer (CONFIRMED, [JSON spec / VS Code JSON docs](https://code.visualstudio.com/docs/languages/json)).

**JSONL / NDJSON.** Plain text, one JSON object per line; "easily appendable—you can add new data by appending a line with no parsing or rewriting required" ([NDJSON.com](https://ndjson.com/)). Hand-editing single lines is mechanically simple but each line must remain valid JSON with no embedded literal newlines (CONFIRMED, [JSONL.help FAQ](https://jsonl.help/faq/)).

**better-sqlite3 / bun:sqlite / libsql (embedded SQLite file).** Binary file format; not hand-editable in vim/cat. Inspection requires the `sqlite3` CLI or a GUI tool ([SQLite CLI docs](https://sqlite.org/cli.html)). INFERRED that this is universally true of all SQLite-format engines—the on-disk file is the SQLite database file format regardless of the JS binding.

**PGlite.** Runs Postgres compiled to WASM with persistence to "the file system (Node/Bun) or indexedDB (browser)" ([pglite.dev](https://pglite.dev/)). The on-disk artifact is a Postgres data directory or an IndexedDB blob; not hand-editable. CONFIRMED by PGlite docs.

**Drizzle ORM.** Drizzle is a TypeScript ORM, not a storage format—it sits on top of one of the SQLite/Postgres engines above. Hand-editability inherits from the underlying engine.

**lowdb.** "Simple to use local JSON database" with "the entire file rewritten on every `db.write()`" ([npm: lowdb](https://www.npmjs.com/package/lowdb), [github: typicode/lowdb](https://github.com/typicode/lowdb)). The on-disk artifact is a single JSON file; hand-editable like any JSON file. CONFIRMED.

**electron-store.** "The data is saved in a JSON file named `config.json` in `app.getPath('userData')`" ([npm: electron-store](https://www.npmjs.com/package/electron-store)). Same hand-editability as JSON; the on-disk shape is a JSON object. CONFIRMED.

## Sub-dimension 2 — IDE intellisense ($schema and friends)

**YAML.** The Red Hat `yaml-language-server` (used by VS Code's "YAML" extension and several other editors via LSP) supports schema association via two routes: (1) modeline `# yaml-language-server: $schema=https://my.url.to/the/schema` inside the file, (2) `yaml.schemas` mapping in editor settings ([yaml-language-server README](https://github.com/redhat-developer/yaml-language-server)). It supports JSON Schema drafts 04, 07, 2019-09, and 2020-12; provides hover docs from `description` fields; autocomplete uses defaults from the schema. CONFIRMED. WARN: the modeline string differs across editors—JetBrains uses `# $schema=...` instead of the `# yaml-language-server: $schema=...` form (CONFIRMED, [yaml-language-server issue #950 / vscode-yaml issue discussion](https://github.com/redhat-developer/yaml-language-server/issues/950)).

**JSON.** VS Code resolves JSON schemas in two ways: in-file `"$schema": "..."` property or `json.schemas` settings mapping with a `fileMatch` pattern ([VS Code JSON docs](https://code.visualstudio.com/docs/languages/json)). Hover and completion descriptions come from the schema; `markdownDescription` is a VS Code extension supporting markdown formatting. CONFIRMED. NOTE: adding `$schema` "changes the JSON itself, which systems consuming the JSON might not expect, for example, schema validation might fail" ([VS Code JSON docs](https://code.visualstudio.com/docs/languages/json))—UNCERTAIN whether downstream consumers of any specific config will tolerate the extra key.

**JSONL.** No first-class IDE support for "one schema per line"; tooling treats `.jsonl` as plain text or as a JSON file with errors at every newline. INFERRED—neither the NDJSON site nor JSONL.help mention IDE schema integration; community guidance is to "validate each line against a JSON Schema using libraries like jsonschema" at runtime ([NDJSON.com / JSONL.help FAQ](https://jsonl.help/faq/)).

**JSONC / JSON5 (escape hatches for comments + trailing commas).** Microsoft's `jsonc-parser` is the parser VS Code uses for `settings.json`, `tasks.json`, `launch.json`; supports `//` and `/* */` and (with `allowTrailingComma`) trailing commas ([jsonc.org](https://jsonc.org/), [VS Code JSON docs](https://code.visualstudio.com/docs/languages/json)). JSON5 is a separate, broader superset that adds unquoted keys, single-quoted strings, multi-line strings, hex literals, etc. ([json5.org](https://json5.org/)). $schema works in JSONC because VS Code routes it through the same JSON-schema infrastructure (CONFIRMED).

**SQL (better-sqlite3 / bun:sqlite / libsql / PGlite).** Editor SQL completion is provided by add-ons rather than the language itself: VSCode SQLTools, JetBrains DataGrip ("contextual code completion, refactoring, query analysis, and real-time syntax validation across connected databases" — [DataGrip Code completion docs](https://www.jetbrains.com/help/datagrip/auto-completing-code.html)). DataGrip requires a live database connection so it can introspect the schema; offline completion of an arbitrary `.sql` file is keyword-only.

**Drizzle ORM.** TypeScript-first: "fully typed—queries against columns will autocomplete and validate types" ([orm.drizzle.team](https://orm.drizzle.team/), [softwaremill blog](https://softwaremill.com/5-reasons-to-choose-drizzle-orm-over-traditional-javascript-orms/)). Type errors at compile time, IntelliSense for table/column/method names, refactoring support when schema changes. CONFIRMED. WARN: known performance issue at scale—"IntelliSense can get unusably slow when providing the schema in the drizzle instantiation, with delays … approaching 8 seconds for 40 tables" ([drizzle-orm issue #800](https://github.com/drizzle-team/drizzle-orm/issues/800)).

**lowdb / electron-store.** Both expose typed entry points (`Low<Data>` in lowdb, generic `Store<T>` in electron-store) so the in-memory `data`/`store` object gets full TS autocomplete ([typicode/lowdb README](https://github.com/typicode/lowdb), [electron-store README](https://github.com/sindresorhus/electron-store)). The on-disk JSON file does not get a `$schema` injected automatically—the dev wires that up in the editor mapping if desired. CONFIRMED for typed wrapper, INFERRED for $schema absence.

## Sub-dimension 3 — Comment preservation

**YAML.** Comments are first-class. "Users chose this library because it's the only one that would support preserving comments in YAML files" ([eemeli/yaml community discussion](https://eemeli.org/yaml/)). Achieved through the Document layer (`Document.setIn`, `Document.deleteIn`, etc.); the lower-level `parse/stringify` path drops them. CONFIRMED. WARN: anchors and aliases are "a serialization detail and are discarded once composing is completed" ([yaml.org spec 1.2.2 §3.2.2.2](https://yaml.org/spec/1.2.2/))—programmatic edits may not faithfully reproduce them, depending on processor.

**JSON.** No comments allowed by the JSON spec ([json.org](https://json.org/)). CONFIRMED. There is no `$comment` survival contract at the JSON level (some JSON Schema authors use `$comment` for schema-author notes, but that is a JSON Schema convention, not a JSON convention).

**JSONC / JSON5.** Both formats explicitly support comments. JSONC adds `//` and `/* */` comments to JSON; the round-trip behaviour depends on the consumer—`jsonc-parser` exposes the comment positions, but most JSON serializers strip them on re-emit. CONFIRMED, [jsonc.org](https://jsonc.org/), [json5.org](https://json5.org/). UNCERTAIN: no widely-deployed library guarantees comment preservation through programmatic mutation the way yaml@2 does for YAML.

**JSONL.** No comment support; each line must be valid JSON. CONFIRMED, [NDJSON.com](https://ndjson.com/).

**SQL (any engine).** SQLite supports `--` and `/* */` comments in DDL/DML statements ([SQLite lang_comment](https://sqlite.org/lang_comment.html)) but those are statement-level annotations executed at the CLI/client and do not persist to rows. SQLite "does not have a dedicated COMMENT syntax like some other SQL databases (MySQL, PostgreSQL, etc.) for attaching metadata comments to columns or tables" ([w3resource SQLite comments](https://www.w3resource.com/sqlite/snippets/sqlite-comments.php)). The `sqlite-docs` extension by Alex Garcia adds a doc-comment convention parsed at extension load ([github: asg017/sqlite-docs](https://github.com/asg017/sqlite-docs)), but it is third-party. CONFIRMED.

**PostgreSQL (PGlite).** Has `COMMENT ON TABLE`/`COMMENT ON COLUMN` schema-level statements (CONFIRMED via Postgres docs reference). No row-level comment column unless application-modeled.

**Drizzle ORM.** No first-class comment-on-row support (CONFIRMED via [orm.drizzle.team](https://orm.drizzle.team/)); inherits Postgres `COMMENT ON COLUMN` for schema annotations.

**lowdb / electron-store.** Stores JSON—no comment support, same as JSON. CONFIRMED.

## Sub-dimension 4 — Inspectability + debuggability

**YAML files.** Tools: `yq` (Mike Farah's Go binary — "portable command-line YAML, JSON, XML, CSV, TOML, HCL and properties processor", "uses jq-like syntax", [github: mikefarah/yq](https://github.com/mikefarah/yq)); `kislyuk/yq` (Python wrapper that converts YAML→JSON and pipes to `jq`, [github: kislyuk/yq](https://github.com/kislyuk/yq)); `yamllint`. Editor preview is ubiquitous (any text editor renders YAML legibly).

**JSON files.** `jq` is the canonical tool: "lightweight and flexible command-line JSON processor akin to sed, awk, grep, and friends for JSON data" ([jqlang.org](https://jqlang.org/)). Installable via Homebrew, apt, etc.; portable C, zero runtime deps. Pretty-print via `jq .`, filter via `jq '.foo[].bar'`, debug with the `debug` builtin.

**JSONL.** Same `jq` tooling works (`jq -c .` for streaming). NDJSON.com lists JSONL-specific validators and CLI parsers ([NDJSON.com tools](https://ndjson.com/tools/)). CONFIRMED.

**SQLite (better-sqlite3 / bun:sqlite / libsql).** `sqlite3` CLI is universal — `.tables` lists tables, `.schema` shows DDL, `.dump` exports as SQL, `.help` lists meta-commands ([SQLite CLI docs](https://sqlite.org/cli.html)). GUI options:
- DB Browser for SQLite — "high quality, visual, open source tool ... gives a familiar spreadsheet-like interface" ([sqlitebrowser.org](https://sqlitebrowser.org/)).
- DBeaver — "free and open source tool to inspect and manipulate databases of nearly any type" ([dbeaver.io](https://dbeaver.io/)).
- TablePlus — "polished multi-database sqlite gui with a clean and modern interface and fast query execution" (third-party review).
- `litecli` — DBCLI suite member; "CLI for SQLite Databases with auto-completion and syntax highlighting" ([github: dbcli/litecli](https://github.com/dbcli/litecli)).

**libsql.** Adds the `turso` CLI for cloud-side ops ([docs.turso.tech](https://docs.turso.tech/libsql)). Embedded mode files remain SQLite-format and accept all SQLite tooling. CONFIRMED.

**PGlite.** `psql` does not work directly — PGlite is in-process WASM, not a TCP-listening Postgres. PGlite ships its own "REPL component ... built with React, it's also available as a web component" for in-app debug terminals ([pglite.dev/docs/repl](https://pglite.dev/docs/repl)). Inspection of the on-disk persistence is limited; `pglite.dev/debugging` documents WASM-DWARF debugging for the engine itself, not for inspecting user data. INFERRED gap: outside the in-app REPL, no off-the-shelf GUI database browser opens a PGlite directory.

**Drizzle ORM.** Drizzle Studio is a "lightweight, browser-based database browser and admin UI that launches with a single command (npx drizzle-kit studio)" ([orm.drizzle.team/docs/drizzle-kit-studio](https://orm.drizzle.team/docs/drizzle-kit-studio)). "Browse tables, filter data, edit records inline, run SQL queries, and inspect relationships". Reads `drizzle.config.ts` for connection. Hosted on `local.drizzle.studio` (your data does not leave your machine; the UI is loaded from the hosted domain). CONFIRMED.

**lowdb.** No dedicated tool; just the JSON file → use `jq` ([typicode/lowdb README](https://github.com/typicode/lowdb)). The root data lives under `db.data` if accessed via the library.

**electron-store.** Same — JSON file at `~/Library/Application Support/<App>/config.json` (macOS) / `%APPDATA%\<App>\config.json` (Windows) / `~/.config/<App>/config.json` (Linux); inspect with any JSON tool ([electron-store README](https://github.com/sindresorhus/electron-store), [Cameron Nokes blog](https://cameronnokes.com/blog/how-to-store-user-data-in-electron/)).

## Sub-dimension 5 — Patch semantics

**YAML.** yaml@2's Document layer exposes `setIn(path, value)`, `addIn`, `deleteIn`, `getIn`, `hasIn` ([eemeli.org/yaml](https://eemeli.org/yaml/)). `setIn` "creates any missing intermediary maps & sequences if they're not yet present" (CONFIRMED via library docs; also see [eemeli/yaml issue #345](https://github.com/eemeli/yaml/issues/345) on path edge cases). Comments and formatting on touched paths are preserved when using the Document API.

**JSON.** Two RFC standards (CONFIRMED, [erosb's comparison](https://erosb.github.io/json-patch-vs-merge-patch/), [Zuplo learning center](https://zuplo.com/learning-center/json-patch-vs-json-merge-patch)):
- **JSON Patch (RFC 6902)** — array of operations: `add`/`remove`/`replace`/`move`/`copy`/`test`. Atomic: "if one operation in the document fails, then no operation will be carried out". Content type `application/json-patch+json`.
- **JSON Merge Patch (RFC 7396)** — partial JSON object; `null` means delete. Limitations: "cannot express certain modifications, e.g., changing an array element at a specific index, or setting a specific object value to null". Simpler but less expressive.

**JSONL.** Append-only is the core write semantics. To "edit" historical records you typically write a new line with the same key; readers fold the stream. There is no patch standard for JSONL; some logs use a `tombstone` event convention.

**SQL (any engine).** `UPDATE table SET col = value WHERE predicate` is the canonical partial update; expressive over arbitrary subsets via WHERE; transaction-bounded atomicity. Comparable in expressive power to JSON Patch's `replace` op but operating across rows ([dev.mysql.com partial JSON update worklog 8963](https://dev.mysql.com/worklog/task/?id=8963)). Engine-internal optimization can avoid full-row rewrites; this is invisible to the calling code.

**Drizzle ORM.** `db.update(table).set({ col: value }).where(...)` mirrors raw SQL; types check the column shape. CONFIRMED via [orm.drizzle.team](https://orm.drizzle.team/).

**lowdb.** Mutate `db.data` directly in TS, then `await db.write()`. Whole-file rewrite each time ([npm: lowdb](https://www.npmjs.com/package/lowdb)). NOTE the perf caveat from the README: "If you have large JavaScript objects (~10-100MB) you may hit some performance issues because whenever you call db.write, the whole db.data is serialized using JSON.stringify and written to storage."

**electron-store.** `store.set(key, value)`, `store.delete(key)`; supports dot-notation paths. Whole-file rewrite per write. CONFIRMED via README.

## Sub-dimension 6 — Agent / LLM ergonomics

This is genuinely contested across the literature. Both sides are well represented; report both.

**Pro-file shape (LLM-friendly).** Several recent posts argue file-system memory matches LLMs' training distribution. From [Arize blog "Agent interfaces in 2026: Filesystem vs API vs Database"](https://arize.com/blog/agent-interfaces-in-2026-filesystem-vs-api-vs-database-what-actually-works/): "Filesystems win as an interface (LLMs already know how to use them)". Anthropic's design pattern for Claude Code Skills explicitly uses markdown files: "Claude uses bash to read SKILL.md from the filesystem, and if those instructions reference other files (like FORMS.md or a database schema), Claude reads those files too using additional bash commands" ([Claude Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)). Read-whole-file → grep → edit is a small, low-risk action surface. From [Towards Data Science "memweave"](https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/) and [Medium "Beyond the Vector Store"](https://medium.com/@memU_ai/beyond-the-vector-store-why-agentic-memory-needs-a-file-system-not-just-a-library-e13edce6a20b): markdown + SQLite is the "zero-infra" baseline; vector stores add complexity that often is not needed.

**Pro-SQL shape (LLM-friendly).** Other sources argue SQL is more deterministic. From the Arize post, the same article argues: "Databases win as a substrate (concurrency, auditability, semantic search)" — i.e. file as interface, DB as substrate is the synthesis position, not file-only. Text-to-SQL benchmarks show degradation: "Models often struggled to correctly identify and implement the necessary JOIN operations between tables, sometimes omitting them entirely or misusing less optimal subqueries", four error types are common ("faulty joins, aggregation mistakes, missing filters, and syntax errors") and "performance degrades sharply with question complexity increases" ([aimultiple text-to-SQL 2026 review](https://research.aimultiple.com/text-to-sql/), [k2view text-to-SQL solutions blog](https://www.k2view.com/blog/llm-text-to-sql/)). The common safety guidance is to **not** let an LLM construct arbitrary SQL: "tools specifically designed for a use case will be more reliable and less prone to errors than allowing the LLM to construct arbitrary SQL queries. Always utilize prepared SQL statements to prevent SQL injection vulnerabilities, with the AI agent providing parameters that are then bound to the pre-compiled statement rather than constructing raw SQL queries" ([Arcade.dev blog on SQL tools for AI agents](https://www.arcade.dev/blog/sql-tools-ai-agents-security/)).

**Hybrid is the synthesis.** From the Oracle Developers blog: "Many recent implementations blend both approaches: A tiered memory architecture where the filesystem is used for working memory, with a vector database used for semantic recall, and a relational database as the source of truth" ([Oracle developers blog](https://blogs.oracle.com/developers/comparing-file-systems-and-databases-for-effective-ai-agent-memory-management)). LangSmith is cited as an example: "stores data in a database but exposes it to the agent as files; the interface layer (what the agent sees) is decoupled from the storage layer (what actually persists)".

**MCP tool design corollary.** MCP best practices are independent of storage shape: tools should be "stateless functions that receive a typed input, execute a deterministic action (API call, SQL query, file read), and return a structured output" ([Merge.dev MCP tool schema blog](https://www.merge.dev/blog/mcp-tool-schema), [apxml: tool input/output schemas](https://apxml.com/courses/building-advanced-llm-agent-tools/chapter-1-llm-agent-tooling-foundations/tool-input-output-schemas)). The schema discipline — flat over nested, narrow over wide — is recommended regardless of whether the underlying storage is a file or a DB: "While JSON Schema supports deep nesting and complex validation logic, it is advisable to keep tool schemas as flat as possible. Deeply nested structures increase the token count and cognitive load for the LLM."

**Per-backend implications:**
- YAML / JSON / JSONC / JSONL files: agent reads with native filesystem `Read`, edits with `Edit`. Easy if the file is small enough to fit in context.
- lowdb / electron-store: same shape as JSON for read/write; the wrapper adds nothing for an LLM unless the agent specifically learns the API.
- SQLite (better-sqlite3, bun:sqlite, libsql, PGlite): agent must be exposed via either purpose-built tools (`get_user(id)`, `list_documents(folder)`) or generic `run_sql(query)`. Both patterns appear in practice; the latter has the text-to-SQL accuracy concerns above.
- Drizzle ORM: closer to SQL semantics from the agent's perspective; the TS-typed surface is for the developer, not the LLM.

## Sub-dimension 7 — Schema-driven UI rendering

**JSON Schema → form (well-trodden).** Multiple mature libraries exist:
- **react-jsonschema-form (RJSF)** — "A React component for building Web forms from JSON Schema." Themes for Bootstrap 3/4, MUI 4/5, fluent-ui, antd, Semantic-ui, chakra-ui ([github: rjsf-team/react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form), [introduction docs](https://rjsf-team.github.io/react-jsonschema-form/docs/)).
- **JSON Forms (jsonforms.io)** — Provides a separate UI Schema layer for layout decisions ("VerticalLayout"/"HorizontalLayout"); separates "data and UI" more cleanly than RJSF ([jsonforms.io React integration](https://jsonforms.io/docs/integrations/react), [jsonforms community comparison](https://jsonforms.discourse.group/t/compare-to-react-jsonschema-form/553)).
- **Uniforms** — "schema adapters" architecture; supports multiple validation libraries; "Uniforms provides a high level of customization and flexibility, but this can lead to a steeper learning curve for new users" ([dev.to comparison](https://dev.to/yanggmtl/schema-driven-forms-in-react-comparing-rjsf-json-forms-uniforms-formio-and-formitiva-2fg2)).
- **Formily** — Alibaba's "Cross Device & High Performance Normal Form/Dynamic(JSON Schema) Form/Form Builder" for React/React Native/Vue 2/Vue 3 ([github: alibaba/formily](https://github.com/alibaba/formily)).
- **FormEngine, Form.io, Formitiva** — additional commercial / OSS alternatives surfaced in the dev.to comparison.

CONFIRMED that RJSF auto-generates a working form from a `schema` prop; `uiSchema` overrides per-field rendering; validation runs against the schema ([rjsf api uiSchema docs](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema/)).

**YAML → form.** Same JSON-Schema libraries can target YAML (validate after YAML→JSON conversion), but no widely-adopted "render a form from YAML" library exists in the same way. Editing tooling typically renders the YAML in a code editor with schema-aware completion and lets the user type. INFERRED — searches for "YAML schema form generator React" return JSON-Schema results almost exclusively.

**SQL → form.** Less standardized; ORM-specific. Several patterns:
- Admin scaffolding: Django Admin, Rails ActiveAdmin, react-admin (which has a `<JsonSchemaForm>` component but also supports model-driven CRUD pages via its own conventions) ([react-admin JsonSchemaForm docs](https://marmelab.com/react-admin/JsonSchemaForm.html)).
- Drizzle Studio is the inspection UI but does not generate end-user forms ([orm.drizzle.team studio overview](https://orm.drizzle.team/drizzle-studio/overview)).
- No widely-adopted "render a form from a SQL `CREATE TABLE`" library in the React ecosystem; UNCERTAIN whether this is structural or just market preference.

**Drizzle.** Schema → Zod via `drizzle-zod` is published; Zod schemas → form via libraries like react-hook-form + zod resolver. INFERRED that this lets a Drizzle schema drive a form, but with two layers in between.

## Sub-dimension 8 — Onboarding curve

**File-shape (YAML / JSON / JSONL / lowdb / electron-store).** Onboarding asks: "Where is the file? Open it in a text editor." The mental model is the file system — universally familiar to developers. CLI tools (`cat`, `jq`, `yq`, `vim`) are part of any Unix-like development environment.

**SQLite (better-sqlite3 / bun:sqlite / libsql).** Onboarding asks: "Install the `sqlite3` CLI ([SQLite CLI docs](https://sqlite.org/cli.html)) or DB Browser ([sqlitebrowser.org](https://sqlitebrowser.org/))" — one extra step, but `sqlite3` ships preinstalled on macOS and most Linuxes. Once installed, the dev needs to learn the meta-commands (`.tables`, `.schema`, `.dump`, `.mode column`) — half a dozen muscle-memory items to acquire. CONFIRMED via SQLite CLI doc.

**Drizzle ORM.** Onboarding asks: "Run `npx drizzle-kit studio` to spin up the browser UI" ([orm.drizzle.team/docs/drizzle-kit-studio](https://orm.drizzle.team/docs/drizzle-kit-studio)). Web UI; spreadsheet-like grid; minimal SQL knowledge required. Beneath that, the dev still needs to learn Drizzle's TS query API for code-level changes.

**libsql.** Adds the optional `turso` CLI ([docs.turso.tech](https://docs.turso.tech/libsql)) for cloud sync / replica management; for pure embedded use, the surface is identical to SQLite.

**PGlite.** Onboarding gap: "psql does not work" because PGlite is in-process WASM. Inspection happens via the embedded REPL component the app developer must add ([pglite.dev/docs/repl](https://pglite.dev/docs/repl)). New devs can be confused that their existing Postgres tooling does not connect.

**Comparative summary (3P observations).** From [SQLite User Forum "Flat files vs SQLite"](https://sqlite.org/forum/forumpost/3d7be1ad3d?t=c) and [pl-rants "When JSON Sucks"](https://pl-rants.net/posts/when-not-json/): SQLite scales beyond JSON's reach (concurrency, indices, partial writes, transactions), but the JSON file is the "nothing to install / nothing to learn" choice for prototypes and trivial datasets. The PowerSync blog frames it as substrate-vs-interface ([powersync.com local-first state with SQLite](https://www.powersync.com/blog/local-first-state-management-with-sqlite)).

## Sub-dimension 9 — Error legibility

**YAML.** Validation errors via the Red Hat language server include line/column and a descriptive message; Yamale-style validators "throw a YamaleError with a message containing all the invalid nodes" ([github: 23andMe/Yamale](https://github.com/23andMe/Yamale)). Schema-driven validators can include custom error messages: "Unsupported retry strategy. Supported retry strategies are: 'fixed' or 'double'". Whitespace/indentation errors are notoriously confusing for newcomers; well-known YAML pitfalls (the Norway problem, octal interpretation of leading zeros) are surfaced inconsistently across parsers. UNCERTAIN how legible the per-parser surfacing is — CONFIRMED that it depends heavily on parser choice and schema annotations.

**JSON.** Parser errors usually report byte offset and a syntactic expectation. Schema validators (Ajv, jsonschema, ajv-i18n) emit per-instance-path messages. CONFIRMED.

**JSONC / JSON5.** Same parser-error shape as JSON, with JSONC's `jsonc-parser` reporting comments and trailing commas at known positions ([jsonc.org](https://jsonc.org/), [VS Code JSON docs](https://code.visualstudio.com/docs/languages/json)).

**JSONL.** Per-line errors localize cleanly: "best practices for JSONL include parsing line-by-line, logging errors with line numbers" ([NDJSON.com](https://ndjson.com/), [JSONL.help FAQ](https://jsonl.help/faq/)). One bad line does not invalidate the rest of the file.

**SQL constraint violations.** Notoriously cryptic. Multiple sources document the gap: "It is rare to see this handled well. SQL error messages about constraint violations are often cryptic and technical" ([red-gate Simple Talk](https://www.red-gate.com/simple-talk/databases/sql-server/t-sql-programming-sql-server/handling-constraint-violations-and-errors-in-sql-server/)); "instead of 'SQL Error 1062: Duplicate entry...', show 'Username johndoe is already taken.'" — i.e. the application layer is expected to translate. SQLite's UNIQUE constraint message names the column but is terse. PostgreSQL surfaces constraint name, table, and offending value but expects callers to present them. Engine-side error codes are well-defined (SQLSTATE) but rarely user-facing. CONFIRMED.

**Drizzle ORM.** TypeScript catches schema mismatches at compile time before they reach the runtime — a class of error that JSON files cannot catch until `JSON.parse` time or a runtime validator runs. Runtime DB errors from Drizzle pass through the underlying driver verbatim; same caveat as raw SQL above.

**lowdb / electron-store.** A malformed JSON file → `JSON.parse` throws with byte offset; the wrapper does not add field-level validation unless you wire a separate schema validator (Zod, Ajv) on top.

**PGlite.** Postgres error messages, surfaced through the WASM bridge. Inherit Postgres's overall legibility (better than SQLite for constraint messages: explicit table/column/value, but still requires translation for end users).

## Sub-dimension 10 — Mental model load

This is necessarily a 3P-summary of an opinionated topic. Sources lean toward two stances; report both.

**File shape.** "Project state lives in N files; I open them, read them, edit them." The mental model is one file per concern (config, state, log) and the file path is the identity. Predictable failure mode: state spread across files becomes hard to query atomically (no JOIN equivalent). From [pl-rants "When JSON Sucks"](https://pl-rants.net/posts/when-not-json/) and [SQLite User Forum "Flat files vs SQLite"](https://sqlite.org/forum/forumpost/3d7be1ad3d?t=c): scaling beyond a few hundred KB of JSON typically motivates the move to SQLite. The JSON-as-database guide [JSONlite vs SQLite](https://www.stackshare.io/stackups/jsonlite-vs-sqlite) frames the divide similarly.

**Table shape.** "Project state lives in N tables; I write a query, the engine returns rows." The mental model is relational — tables, primary keys, foreign keys, indices, JOINs. Higher upfront learning curve; pays off when state grows past the size where loading "the whole file" each time is acceptable. From [PowerSync local-first state blog](https://www.powersync.com/blog/local-first-state-management-with-sqlite): "SQLite is the defacto choice for local-first programs that use a local SQL database for storage." From the Arize blog: "Databases win as a substrate (concurrency, auditability, semantic search)" — substrate, not interface.

**Hybrid stance.** Several sources argue files-as-interface, DB-as-substrate is the synthesis ([Oracle blog](https://blogs.oracle.com/developers/comparing-file-systems-and-databases-for-effective-ai-agent-memory-management), [Arize post](https://arize.com/blog/agent-interfaces-in-2026-filesystem-vs-api-vs-database-what-actually-works/)). The user/dev/agent sees files; persistence is a database. LangSmith is one example.

**Per-backend mapping:**
- YAML / JSONC: file shape with first-class human annotation (comments, structure).
- JSON / JSONL: file shape, machine-friendly.
- lowdb / electron-store: file shape disguised behind a typed wrapper; mental model is still "the JSON file".
- SQLite / libsql / better-sqlite3 / bun:sqlite / PGlite: table shape; opaque file artifact.
- Drizzle ORM: TS-shape on top of table-shape; can feel like "typed JS" until a query crosses a JOIN.

## Hand-edit affordance matrix

Backend → [tools available, comment support, $schema support, agent friendliness]

| Backend | Hand-edit | CLI / GUI tools | Comment support | $schema / IDE intellisense | Agent friendliness (3P-reported) |
|---|---|---|---|---|---|
| YAML files (yaml@2) | Yes | `yq` (mikefarah), `kislyuk/yq`, `yamllint`, any text editor | Yes (preserved by Document API) | Yes (modeline + `yaml.schemas`); JSON Schema drafts 04/07/2019-09/2020-12 | High — "filesystems win as an interface" ([Arize blog](https://arize.com/blog/agent-interfaces-in-2026-filesystem-vs-api-vs-database-what-actually-works/)); read-edit-write |
| JSON files | Yes | `jq`, any text editor | No (spec disallows) | Yes (`$schema` in-file or `json.schemas` mapping) | High — same as YAML; no comment-channel |
| JSONC | Yes | `jq` if `--allowComments` extension, `jsonc-parser` (Microsoft) | Yes (`//`, `/* */`) | Yes (VS Code uses jsonc for `settings.json`/`tasks.json`/`launch.json`) | High — superset of JSON |
| JSONL / NDJSON | Yes (per-line) | `jq -c`, `ndjson` validators | No (per line is JSON) | Limited (no per-line `$schema` standard) | High for append/scan; harder for random update |
| better-sqlite3 | No (binary file) | `sqlite3` CLI, DB Browser, DBeaver, TablePlus, `litecli` | Statement-level `--`/`/* */` only, no per-row | Editor SQL via DataGrip / SQLTools (needs DB connection) | Mixed — see Sub-dim 6; recommend purpose-built tools, not raw `run_sql` |
| bun:sqlite | No (binary file) | Same as better-sqlite3 (SQLite-format file) | Same as SQLite | Same as SQLite | Same as SQLite (the API is bun-only at runtime; storage is SQLite) |
| libsql | No (binary file) | `sqlite3` + `turso` CLI ([docs.turso.tech](https://docs.turso.tech/libsql)) | Same as SQLite | Same as SQLite | Same as SQLite |
| PGlite | No (Postgres data dir / IndexedDB blob) | In-app PGlite REPL ([pglite-repl npm](https://www.npmjs.com/package/@electric-sql/pglite-repl)); `psql` does NOT connect | Postgres `COMMENT ON` schema-level | Postgres-side via DataGrip if you proxy; otherwise weak | Mixed — opaque substrate; agents typically interact via app-defined queries |
| Drizzle ORM | Inherits from underlying engine | Drizzle Studio (browser UI on local.drizzle.studio), plus engine-native tools | Inherits engine | Strong TS IntelliSense ([orm.drizzle.team](https://orm.drizzle.team/)); WARN slow at large schema sizes | TS-typed for devs; for agents, looks like SQL |
| lowdb | Yes (one JSON file) | `jq`, any text editor | No (JSON) | Typed `Low<Data>` wrapper for TS; no auto `$schema` injection | High — same as JSON |
| electron-store | Yes (one JSON file at OS-specific userData path) | `jq`, any text editor | No (JSON) | Typed generic; no auto `$schema` injection | High — same as JSON |

## Notes on confidence labels and divergence

- **CONFIRMED** items are sourced to vendor docs, RFCs, or library READMEs.
- **INFERRED** items are reasoned from primary docs but not stated verbatim (e.g. "no widely-adopted YAML→form library" — search returns essentially zero hits, but absence of evidence is not evidence of absence).
- **UNCERTAIN** items are explicitly contested or under-documented (e.g. comment-preservation guarantees of `jsonc-parser` through edits, the precise IDE schema-modeline behavior across editors).
- **Genuine contestation:** Sub-dim 6 (agent ergonomics) — file-as-interface vs SQL-as-deterministic-query is an active debate; both sides are cited above. Sub-dim 10 (mental model) inherits the same contestation.
- **Synthesis position** (file-as-interface, DB-as-substrate) is reported by multiple sources and is not itself a recommendation; it is the most-cited reconciliation in the surveyed material.
