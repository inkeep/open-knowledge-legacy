# Evidence: D2 — Schema source-of-truth direction (Zod ↔ JSON Schema)

**Dimension:** D2 — Schema source-of-truth direction
**Date:** 2026-04-25
**Sources:** Zod v4 official docs, zod-to-json-schema (deprecated) GitHub, json-schema-to-zod GitHub, redhat-developer/yaml-language-server issues, RJSF docs, SchemaStore CONTRIBUTING.md

---

## Key files / pages referenced

- [Zod v4 — JSON Schema docs](https://zod.dev/json-schema) — `z.toJSONSchema()` API + coverage matrix
- [Zod v4 release notes](https://zod.dev/v4) — migration story
- [Zod migration guide v3 → v4](https://zod.dev/v4/changelog) — breaking changes
- [zod-to-json-schema (deprecated)](https://github.com/StefanTerdell/zod-to-json-schema) — Nov 2025 deprecation notice
- [json-schema-to-zod (deprecation)](https://github.com/StefanTerdell/json-schema-to-zod) — Mar 2026 deprecation
- [SchemaStore CONTRIBUTING.md](https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md) — submission process
- [yaml-language-server (Red Hat)](https://github.com/redhat-developer/yaml-language-server) — JSON Schema draft support
- [yaml-language-server #780](https://github.com/redhat-developer/yaml-language-server/issues/780) — `$schema` honored vs draft-07 meta
- [RJSF Validation docs](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/validation/) — draft selection
- [colinhacks/zod #5239](https://github.com/colinhacks/zod/issues/5239) — v3 republish with v4 (open)
- [oh-my-openagent #3151](https://github.com/code-yeongyu/oh-my-openagent/issues/3151) — v3/v4 mixed-mode crash

---

## Findings

### Finding: `z.toJSONSchema()` (Zod v4 native) covers most primitive + container constructs losslessly; explicitly throws on transforms / brands / refinements / custom

**Confidence:** CONFIRMED
**Evidence:** [Zod v4 JSON Schema docs](https://zod.dev/json-schema)

**Lossless coverage:**
- Primitives: `z.string()`, `z.number()`, `z.boolean()`, `z.null()`, `z.literal()`, `z.enum()`
- Containers: `z.object()`, `z.array()`, `z.tuple()`, `z.record()`
- Unions: `z.union()`, `z.discriminatedUnion()` → `oneOf`/`anyOf`; `z.nullable(T)` → `oneOf: [T, {type:"null"}]`
- Numeric subtypes: `z.int()`, `z.int32()`, `z.float32/64()` → `type` + `exclusiveMinimum/Maximum`
- String formats with native JSON-Schema mapping: `email`, `iso.datetime/date/time/duration`, `ipv4/6`, `uuid` (also `guid` → `format:"uuid"`), `url` (→ `format:"uri"`), `base64` (via `contentEncoding`)
- Pattern-only formats: `cuid/cuid2/ulid/nanoid/emoji/base64url/cidrv4/cidrv6/mac` → emit `pattern` regex
- Refinements: `.regex(...)`, `.min/.max`, `.length`
- `.meta()` and `.describe()` → copied to `title`/`description`/`examples` plus arbitrary custom keys

**Object policy:** `z.object()` emits `additionalProperties: false` by default (mirrors property-stripping). `z.looseObject()` omits the field; `z.strictObject()` always sets it. Under `io: "input"`, `additionalProperties: false` is suppressed.

**Mode-dependent (`io: "input" | "output"` flag):**
- `.default(v)` and `.optional()` — input/output divergence; default is `"output"`
- `z.lazy()` cycles — `cycles: "ref"` (default) emits `$defs`+`$ref`; `cycles: "throw"` errors
- Reused schemas — `reused: "inline"` (default) duplicates; `reused: "ref"` extracts

**Explicitly unrepresentable (throws by default):** `z.bigint()`, `z.int64()`, `z.symbol()`, `z.undefined()`, `z.void()`, `z.date()`, `z.map()`, `z.set()`, `z.transform()` (incl. `.pipe()`), `z.nan()`, `z.custom()`. Custom `.refine()` predicates and `.brand<>()` are listed under transforms — they have no JSON Schema correlate.

Two escape hatches:
- `unrepresentable: "any"` — collapse to `{}`
- `override: (ctx) => ...` — patch the JSON Schema per node before emit

**UNCERTAIN:** Whether `.brand()` silently passes through as the underlying type or throws. The docs list it under "transforms and `.pipe()`" but the behavior may be plain pass-through; not explicitly stated.

**Implications:** OK's current config schema uses `.regex()`, `.min()`, `.max()`, `.default()`, `.optional()`, `.strict()`, nested `z.object()`, arrays, and unions — all lossless under `toJSONSchema`. No transforms or brands or `.refine()` in the current schema, so the bridge is clean today. **Adding** any of those would require schema review or `override:` patches.

---

### Finding: `zod-to-json-schema` (StefanTerdell) deprecated November 2025; redirects to Zod v4 native

**Confidence:** CONFIRMED
**Evidence:** [zod-to-json-schema README](https://github.com/StefanTerdell/zod-to-json-schema)

Verbatim notice: *"As of November 2025, this project will no longer be actively maintained. Zod v4 natively supports generating JSON schemas, so I recommend you switch to the new major."*

Final supported pattern: in v3.25, code on Zod v4 can still get *v3-shaped* schemas converted by importing `import { z } from "zod/v3"` and feeding them to the legacy converter — but v4-native schemas are NOT supported by the legacy package.

**Implications:** Greenfield code on Zod v4 has one canonical path: native `z.toJSONSchema()`. The community alternative is gone.

---

### Finding: `json-schema-to-zod` (reverse direction) is codegen-only; will sunset March 2026

**Confidence:** CONFIRMED
**Evidence:** [json-schema-to-zod README](https://github.com/StefanTerdell/json-schema-to-zod)

Code-generation CLI / programmatic API that emits Zod *source code*, not a runtime adapter. Default target is Zod v4 (`--zodVersion 4`), v3 selectable.

Limitations stated by maintainer:
- Factored schemas (`oneOf`/`allOf`/`anyOf`) "only partially supported. Here be dragons."
- `$ref` resolution requires external `json-refs` preprocessing
- Recursive schemas need `--depth N` (default 0)
- Maintainer recommends Ajv for runtime JSON-Schema validation, not this tool
- Round-tripping zod→json→zod is explicitly **not recommended** — README points at `zod-to-json-schema` for the forward direction with a "details may be lost" caveat

Deprecation notice: *"As of March 2026, this project will no longer be actively maintained."*

**Implications:** Bidirectional bridge is dead. Forward direction (Zod → JSON Schema) is healthy via Zod v4 native. Reverse direction is a codegen one-shot, not a runtime conversion, and even that is sunsetting.

---

### Finding: Zod v3 → v4 migration is binary; no v3 polyfill of `toJSONSchema`

**Confidence:** CONFIRMED (no polyfill); INFERRED (mixed-mode crashes)
**Evidence:** [colinhacks/zod #5239](https://github.com/colinhacks/zod/issues/5239), [oh-my-openagent #3151](https://github.com/code-yeongyu/oh-my-openagent/issues/3151)

`z.toJSONSchema()` is v4-only. Issue #5239 requests publishing a `zod@3.x` minor that re-exports v4.x — open, no commitment. No polyfill / backport exists.

**Mixed-mode crash pattern (oh-my-openagent #3151):** environments with both v3 and v4 schemas crash because `_def` moved to `_zod.def` in v4; v3's converter probes `_zod.def` on v4 schemas and fails. Practical migration is "upgrade the package to Zod v4," with `nicoespeon/zod-v3-to-v4` codemod available.

Other v4 breaking changes touching schema introspection:
- Error-customization API unification
- `_def` → `_zod.def` internals move
- `.optional().default()` semantics shift

**Implications:** OK is on Zod v4 (per `bun.lock` `^4.3.6`), so this is not a current blocker. Anyone wiring in a transitive dep that's still on v3 will need to converge before `toJSONSchema` becomes coherent.

---

### Finding: Zod v4 emits draft-2020-12 by default; consumer ecosystem is fragmented across drafts

**Confidence:** CONFIRMED
**Evidence:** [Zod v4 JSON Schema docs](https://zod.dev/json-schema), [yaml-language-server #1112](https://github.com/redhat-developer/yaml-language-server/issues/1112), [RJSF Validation docs](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/validation/), [SchemaStore CONTRIBUTING.md](https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md)

**Emit side (Zod v4):** `target` defaults to `"draft-2020-12"`. Other accepted: `"draft-04" | "draft-4"`, `"draft-07" | "draft-7"`, `"openapi-3.0"`. (No `draft-2019-09` emit target listed.)

**Consumer side:**
- **redhat-developer/yaml-language-server**: supports drafts 04, 07, 2019-09, 2020-12. Historical issue #780 noted that the server validates the *schema document itself* against draft-07 meta-schema regardless of `$schema` — affects schema-authoring lint, not whether YAML docs get intellisense from a 2020-12 schema.
- **RJSF (`@rjsf/validator-ajv8`)**: defaults to draft-07. draft-2019-09 and draft-2020-12 selectable via `AjvClass` option on `customizeValidator()`, but RJSF docs state draft-2020-12 *"has breaking changes and hasn't been fully tested"* with RJSF.
- **SchemaStore.org** (CONTRIBUTING.md): explicitly recommends draft-07 — *"Later versions of JSON Schema are not yet recommended for use in SchemaStore until IDE and language support improves."*

**Implications:** Emitting Zod's default 2020-12 and pointing it at SchemaStore-driven tooling will surface compatibility friction. Pinning `target: "draft-07"` in `z.toJSONSchema(schema, { target: 'draft-07' })` keeps the IDE/form ecosystem happy. Fragmentation is real; pinning is cheap.

---

### Finding: End-to-end pipeline (Zod → JSON Schema → host → YAML LSP intellisense) is feasible; no canonical end-to-end report exists

**Confidence:** INFERRED (component pieces all CONFIRMED individually; full pipeline not measured in any single source)
**Evidence:** Composition of Zod v4 docs + yaml-language-server `$schema` recognition (#894) + magic-comment convention

Component pieces confirmed:
- Zod v4 emits 2020-12 (or draft-07 under `target`)
- YAML LSP accepts draft-07 + 2019-09 + 2020-12
- `# yaml-language-server: $schema=URL` is the YAML LSP's documented schema-binding annotation
- yaml-language-server #894 confirms `$schema` *inside* the YAML document is also recognized

No single third-party blog post or test-report walks the full pipeline as a measurement. The mechanism is a compose of independently-documented features.

**Confirmed gotcha:** the `# yaml-language-server: $schema=...` magic comment is a yaml-language-server *extension*, not part of YAML or JSON Schema specs — other YAML toolchains (e.g. ajv-cli, generic linters) won't honor it.

**Implications:** Wiring an OK config schema → `z.toJSONSchema()` → host JSON at a stable URL → reference via magic comment OR `$schema` inside YAML is technically straightforward. Monitor the meta-schema validation noise (LSP issue #780) on first integration.

---

### Finding: SchemaStore registry submission requires draft-07 schema, file-pattern catalog entry, optional test fixtures; no stated review SLA

**Confidence:** CONFIRMED
**Evidence:** [SchemaStore CONTRIBUTING.md](https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md)

Submission requirements:
1. **Two hosting modes:** (a) self-host the JSON, register only a catalog entry pointing at your URL; (b) commit the schema to `src/schemas/json/<name>.json` for local hosting at `json.schemastore.org`
2. **Required catalog fields:** `name`, `description`, `url`, `fileMatch` (array of filename glob patterns). Optional `versions` map for version-pinned URLs
3. **Test files** (positive at `src/test/<name>/`, negative at `src/negative_test/<name>/`) — formats: JSON / YAML / TOML. "Strongly recommended," not formally required
4. **`fileMatch` guidance:** avoid generic patterns (`config.toml` causes false-positives); prepend directory names; prefer multiple simple patterns over complex alternations
5. **Draft recommendation:** draft-07 (per finding above)
6. **No stated review/merge SLA** — "history of accepting most pull requests" is the only timing signal
7. **Submission entry point:** `node cli.js new-schema` automated scaffolder

**Implications:** Submitting an OK schema to SchemaStore would give every IDE-aware developer free intellisense without OK shipping any extension or directive. Cost: maintain draft-07 emit, host the JSON Schema at a stable URL, submit a small PR.

---

## Negative searches

- **Searched:** "Zod v4 toJSONSchema branded type behavior"; sources: zod.dev, GitHub issues → result: docs list `.brand` under transforms/`.pipe`; explicit behavior on emit (throw vs pass-through) not stated
- **Searched:** "json-schema-to-zod Zod v4 round-trip lossless"; sources: package README, GitHub issues → result: maintainer explicitly disclaims round-trippability
- **Searched:** "SchemaStore submission review time SLA"; sources: CONTRIBUTING.md, recent merged PRs → result: not stated

---

## Cross-cutting observations

- **Deprecation pincer:** Both `zod-to-json-schema` (Nov 2025) and `json-schema-to-zod` (Mar 2026) sunset by the same maintainer (StefanTerdell), redirecting to Zod v4 native. Bridge ecosystem is consolidating onto v4-native `toJSONSchema()`.
- **One-way street by design:** Zod's superset over JSON Schema (transforms, brands, refinements, `z.custom`) is not round-trippable. Forward direction is well-supported in v4; reverse is codegen-only with explicit "lossy / partial" disclaimers.
- **Draft-version cliff:** Zod v4 emits 2020-12 by default; the IDE/form ecosystem (SchemaStore, RJSF default, parts of YAML LSP tooling) anchors on draft-07. Pinning `target: "draft-07"` is the workaround.
- **`io: "input" | "output"` is load-bearing** for any schema with `.default()`, `.transform()`, or `.pipe()`. Picking the wrong mode silently produces a JSON Schema for the wrong shape (post-defaults vs pre-defaults).
- **Editor magic comment is non-portable.** `# yaml-language-server: $schema=URL` is yaml-language-server-specific. JSON files use a `$schema` field inside the document — broadly portable across LSPs.

---

## Gaps / follow-ups

- Empirical test of `.brand()` behavior under `z.toJSONSchema()` on Zod 4.3.6 (the version in OK)
- Whether `override: (ctx) => ...` is documented well enough to handle custom refinements as cleanly as the default path handles primitives
- Whether SchemaStore submission for a config like OK's would meet their `fileMatch` guidance (`.open-knowledge/config.yml` and `~/.open-knowledge/config.yml` — both directory-rooted, which the docs explicitly recommend)
