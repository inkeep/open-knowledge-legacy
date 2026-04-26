---
title: "Config-File CRUD Architecture: YAML Round-Trip, Schema Bridges, Form Libraries, MCP Tool Patterns"
description: "Factual landscape of the choices facing a developer-tool that wants to support three CRUD paths (file-like editor, MCP tools, settings form UI) over a hand-edited YAML config validated by Zod. Covers YAML AST/round-trip libraries, Zod ↔ JSON Schema bridges, JSON-Schema-driven form libraries, MCP-tool design conventions for structured-config edits, in-app schema-aware YAML editors, and the dual-surface (graphical + raw) convergence architecture."
createdAt: 2026-04-25
updatedAt: 2026-04-25
lastUpdate: "Empirical Zod test (D2 Finding 8) + production case studies (D6 Finding 6) added 2026-04-25"
subjects:
  - yaml@2 (eemeli/yaml)
  - js-yaml
  - Zod v4
  - zod-to-json-schema
  - json-schema-to-zod
  - react-jsonschema-form
  - JSON Forms
  - react-formgen
  - uniforms
  - monaco-yaml
  - codemirror-json-schema
  - yaml-language-server
  - JSON Pointer (RFC 6901)
  - JSON Patch (RFC 6902)
  - JSON Merge Patch (RFC 7396)
  - VS Code ConfigurationEditingService
  - SchemaStore
  - Renovate
  - GitLab Pipeline Editor
  - CircleCI in-app editor
topics:
  - YAML round-trip
  - schema-driven editing
  - JSON Schema form libraries
  - MCP tool design
  - dev-tool config UX
  - dual-surface editing
---

# Config-File CRUD Architecture: YAML Round-Trip, Schema Bridges, Form Libraries, MCP Tool Patterns

**Purpose:** Map the factual landscape of choices facing a developer-tool that wants to support three CRUD paths over a hand-edited YAML config validated by Zod: (1) a file-like editor UX in the host app, (2) MCP tools for agents, (3) a settings form UI. Stance: factual landscape only — what each option does, what it preserves, what it costs, with decision triggers for when each finding matters. No recommendations.

---

## Executive Summary

Six dimensions structure the decision space. Each has a small set of named options with documented capabilities and costs.

**Key findings:**

- **Storage format / round-trip integrity (D1):** Comment-preserving round-trip in JS is a single-library decision — `yaml@2`'s Document layer is the only mainstream option that natively preserves comments, anchors, key order, and scalar style across edits. `js-yaml` has no comment preservation by design (multi-year unresolved feature requests). The "AST-as-system-of-record / JS object as derived view" architectural fork is the central tradeoff: keeping the Document AST canonical preserves user formatting through tool-mediated edits; treating the validated JS object as canonical sacrifices it. No prior-art argues for converting YAML→JSON internally before validation — the canonical pattern is `yaml.parse() → schema.parse()` on JS objects directly.

- **Schema source-of-truth direction (D2):** The bridge ecosystem has consolidated onto Zod v4's native `z.toJSONSchema()`. `zod-to-json-schema` (community, deprecated Nov 2025) and `json-schema-to-zod` (deprecated Mar 2026) both redirect to v4 native. Forward direction (Zod → JSON Schema) is well-supported and lossless for primitives, containers, refinements, defaults, regex. **Empirical test against Zod 4.3.6 reveals only `.transform()` (and pipes containing transforms) hard-throws** — `.brand()` and `.refine()` silently emit the underlying type, dropping their metadata. The "silent" behavior is the consequential one for design: a `.refine()` predicate visible to Zod-direct form libraries is invisible to anything consuming the JSON Schema export. Reverse direction (JSON Schema → Zod) is codegen-only, not round-trippable. Zod v4 emits draft-2020-12 by default; SchemaStore + RJSF default + parts of YAML LSP tooling anchor on draft-07 — pinning `target: 'draft-07'` is a one-line workaround. `z.number().int()` without bounds emits implicit `Number.MIN/MAX_SAFE_INTEGER` constraints (every int gets bounds whether the schema specified them or not).

- **Form library landscape (D3):** Four named libraries with sharply different shapes. **RJSF** (15.8k★, 504K weekly downloads, 10 official themes including `@rjsf/shadcn`) — JSON Schema input; `z.toJSONSchema()` bridge required; tri-state booleans require custom widgets. **JSON Forms** (2.7k★, enterprise-backed) — JSON Schema input + separate UI Schema for layout; first-class tri-state via `failWhenUndefined`. **react-formgen** (69★, alpha, single-maintainer) — fully headless; Zod-direct input via `@react-formgen/zod`; no theme to migrate from for shadcn integration; tri-state structurally distinguished. **uniforms** (2.1k★, multi-bridge incl. `uniforms-bridge-zod`) — Zod-direct via bridge package; theme set covers MUI/Bootstrap/AntD/Plain HTML, no shadcn. The Zod-direct path narrows to two libraries (react-formgen, uniforms); the others require a one-way `z.toJSONSchema()` bridge. Maintenance signal varies by ~250x across the set.

- **MCP tool CRUD design (D4):** No purpose-built MCP server exists for "edit a YAML config with JSON Schema validation." The space is greenfield, but assemblable from primitives: RFC 6901 (JSON Pointer) + RFC 6902 (JSON Patch) or RFC 7396 (JSON Merge Patch) + `yaml@2` Document or `yamlpatch`/`yaml-diff-patch` for comment-preserving YAML AST mutations. Five granularity choices have adjacent precedent: single-tool-with-path (cheapest tokens), tool-per-domain (best typed input), whole-replace, JSON-Patch document, code-mode. Token cost is real — typical MCP tools cost 550–1400 tokens of context each. Two community JSON-editor MCP servers exist (both use ad-hoc dot-paths, not RFC 6901). VS Code's `jsonc-parser.modify(text, JSONPath, value)` is the closest architectural model — text-edits-against-original-bytes preserve formatting.

- **In-app file-like editor UX (D5):** Two substrates with different cost shapes. **Monaco + monaco-yaml** wraps Red Hat `yaml-language-server`; feature-rich (autocomplete, validation, hover, fold, anchors); requires bundler + worker wiring; Monaco base is ~4 MB; bundle size grew significantly in v4 alpha. **CodeMirror 6** has no off-the-shelf YAML+schema integration — three paths: `@codemirror/lang-yaml` alone (grammar only), `codemirror-json-schema` (lighter, in-process linter+completion), or LSP bridge (`@codemirror/lsp-client`) wrapping yaml-language-server. The same JSON Schema document drives both Monaco and CodeMirror paths.

- **Convergence architecture (D6):** The dual-surface pattern (graphical UI + raw file kept in sync) is implemented as **one shared write primitive consumed by N surfaces** in IDE/Electron hosts (VS Code's `ConfigurationEditingService`, JetBrains's `PersistentStateComponent`). The browser-hosted dev-tool equivalent is much narrower: every surveyed web YAML editor (GitLab Pipeline Editor, CircleCI in-app editor, GitHub workflow web editor) collapses the multi-surface problem by making git commits the only write path — no in-process shared write API, because there is only one commit pipeline. **None of the three implements live concurrent-editor presence.** Conflict detection is purely commit-time, gated on `lastCommitId` / stale-base / fast-forward checks. Storybook represents the simpler "read-only GUI over config file" alternative (no write-back). HTTP-layer placement choices (HTTP endpoint, websocket, direct FS, MCP-tool indirection) — only the first two have surveyed precedent for browser-hosted GUIs.

**Cross-cutting observation:** Every layer of this stack converges on JSON Schema as the lingua franca. Zod exports to it; YAML LSPs consume it; form libraries consume it; SchemaStore registers it; AJV validates it. Whatever the source-of-truth choice, the JSON Schema artifact is the substrate every surface speaks.

---

## Research Rubric

**Stance:** Factual landscape, no recommendations. Each dimension reports what exists, what each option does/costs, and decision triggers (conditions under which each finding becomes load-bearing).

| ID | Dimension | Priority | Source diversity |
|---|---|---|---|
| D1 | Storage format & validation chain — YAML AST round-trip, comment preservation, write-back semantics, comparable systems | P0 | High |
| D2 | Schema source-of-truth direction — Zod ↔ JSON Schema bridges, draft compatibility, IDE consumption | P0 | High |
| D3 | Form library pick — RJSF vs JSON Forms vs react-formgen vs uniforms, capability matrix vs OK config shape | P0 | High |
| D4 | MCP tool CRUD design — path addressing, mutation format, granularity, validation flow, error surface | P0 | Multi-source |
| D5 | File-like editor UX — Monaco vs CodeMirror substrates with JSON Schema awareness | P1 | Moderate |
| D6 | Convergence architecture — dual-surface dev-tool prior art, shared write primitives, file-watcher integration | P1 | Moderate |

**Non-goals:** TypeScript-config-as-schema (Astro/Storybook style); generic visual CMS form patterns (TinaCMS, Webstudio); VS Code extension authoring; auth/permissions for the form UI; general schema-driven form theory; what fields go in OK's config (schema is settled).

---

## Detailed Findings

### D1 — Storage format & validation chain

**Finding 1: `yaml@2` (eemeli/yaml) Document layer is the canonical comment-preserving round-trip path.** The library exposes a three-tier API — plain `parse`/`stringify`, Document AST, low-level CST. The Document layer carries `comment`, `commentBefore`, `spaceBefore`, `anchor`, `tag`, `range`, `type`, `flow` as node properties. Mutation API is `setIn` / `deleteIn` / `getIn` plus collection-level `add`/`set`/`get`/`has`/`delete`. Canonical pattern (maintainer-confirmed): `parseDocument(file)` → `doc.setIn(path, value)` → `fs.writeFileSync(path, doc.toString())`. Critical detail: use `doc.toString()` or `String(doc)`, NOT `yaml.stringify()` — the latter strips anchor metadata. [CONFIRMED]

**Finding 2: Document layer preserves comments, blank lines, anchors, key order, scalar style; does NOT preserve byte-level whitespace.** Maintainer in [Discussion #510](https://github.com/eemeli/yaml/discussions/510): *"For that you'll need to work with the CST API, as the Document level does not preserve whitespace."* Trailing-comment association is documented as not completely stable. For ~99% of "user wrote a config with comments and reasonable formatting" cases, Document is sufficient. [CONFIRMED]

**Finding 3: `js-yaml` has no comment preservation by design — multi-year unresolved feature requests confirm.** Issues #282 (2016), #196, #549, #624, #689, #709 — all open, no roadmap commitment. Third-party comment-preserving wrappers (`preserve-yaml-comments`, `enhanced-yaml`) are themselves built on top of `eemeli/yaml`, not js-yaml. js-yaml remains usable for one-way reads. [CONFIRMED]

**Finding 4: No prior-art argues for converting YAML → JSON internally before validation.** `yaml.parse(str)` returns plain JS objects with the same shape Zod consumes for any other JS object. Inserting a JSON-serialize-then-parse step adds cost without functional benefit. If the Document layer is in use, `doc.toJS()` resolves anchors/aliases (preserving JS object identity for repeated references) and produces a Zod-validatable plain object. [CONFIRMED — negative search]

**Finding 5: Two write-back semantics — AST-mutation (preserves comments) vs stringify-validated-object (loses comments). Production prior art (firebase-tools, Discourse Ruby psych) uses AST-mutation.** firebase-tools PR #6987 explicit: *"Edit configs at the AST level to preserve formatting and comments."* For partial UI patches, AST-mutation is the only option that retains the "human-edited config file" property. [CONFIRMED]

**Finding 6: No comparable system in the surveyed set ships a dedicated GUI editor for its config file.** Renovate (JSON), GitHub Actions (YAML), Mintlify (JSON), Kubernetes/Kustomize (YAML) all rely on `$schema`-driven IDE intellisense + CLI validation + (sometimes) PR-based "reconfigure" workflows. No first-party GUI editor for any. Validation is layered (editor → CLI → server-runtime), never single-stage. [CONFIRMED]

**Finding 7: Anchors, aliases, custom tags survive `yaml@2` round-trip but are flattened by the time Zod validates.** `parseDocument()` retains anchors as `node.anchor`; `doc.toString()` re-emits them faithfully; `doc.toJS()` resolves aliases to JS object-identity references (`===`). Zod sees the resolved JS object — anchors look like ordinary repeated values. If anchor preservation matters for write-back, the Document AST must be the system-of-record. [CONFIRMED]

**Evidence:** [evidence/d1-yaml-storage-roundtrip.md](evidence/d1-yaml-storage-roundtrip.md)

**Decision triggers (when these findings matter most):**
- If users routinely add comments/blank lines to config — round-trip integrity becomes load-bearing → AST-mutation pattern, `yaml@2` Document layer
- If config is mostly mechanical and never user-annotated — stringify-validated-object is acceptable; library choice is less constrained
- If anchors/aliases are anywhere in the schema — AST is the system-of-record by necessity
- If the answer is "we'll never patch the file from a tool" — the question collapses; only need a YAML parser

---

### D2 — Schema source-of-truth direction (Zod ↔ JSON Schema)

**Finding 1: `z.toJSONSchema()` (Zod v4 native) covers most primitive + container constructs losslessly; only `.transform()` (and pipes containing transforms) hard-throws.** Lossless: primitives, containers, unions, numeric subtypes, native string formats (email, uuid, url, datetime), `.regex()`, `.min/.max`, `.length`, `.meta()`, `.describe()`. Mode-dependent (`io: "input" | "output"`): `.default()`, `.optional()`, `z.lazy()` cycles. Hard-throws: `z.bigint()`, `z.symbol()`, `z.undefined()`, `z.date()`, `z.map()`, `z.set()`, `z.transform()`. **Silent pass-through (loss is unobservable in emit):** `.brand<>()` and `.refine()` — empirical test against Zod 4.3.6 confirms both emit the underlying type with metadata dropped (originally documented ambiguously as "throws by default"; behavior is actually pass-through). Two escape hatches: `unrepresentable: "any"` collapses to `{}`; `override: (ctx) => ...` patches per node. [CONFIRMED — empirically verified, see [evidence/d2-empirical-zod-tojsonschema.md](evidence/d2-empirical-zod-tojsonschema.md)]

**Finding 2: `zod-to-json-schema` (StefanTerdell, community) deprecated November 2025; redirects to Zod v4 native.** Verbatim: *"As of November 2025, this project will no longer be actively maintained. Zod v4 natively supports generating JSON schemas, so I recommend you switch to the new major."* [CONFIRMED]

**Finding 3: `json-schema-to-zod` (reverse direction) is codegen-only and sunsets March 2026.** Code-generation CLI emitting Zod source code. Maintainer disclaims round-trippability ("here be dragons" for `oneOf/allOf/anyOf`). Reverse direction is not a runtime adapter. [CONFIRMED]

**Finding 4: Zod v3 → v4 migration is binary; no v3 polyfill of `toJSONSchema`.** Issue #5239 requests v3 republish — open, no commitment. Mixed v3/v4 environments crash because `_def` moved to `_zod.def` in v4. Practical migration: upgrade to Zod v4 (codemod `nicoespeon/zod-v3-to-v4` available). [CONFIRMED]

**Finding 5: Zod v4 emits draft-2020-12 by default; consumer ecosystem is fragmented.** Zod v4 `target` accepts `draft-04 | draft-07 | draft-2020-12 | openapi-3.0`. Red Hat YAML LSP supports drafts 04, 07, 2019-09, 2020-12 — but historically validated schema docs against draft-07 meta-schema regardless. RJSF `@rjsf/validator-ajv8` defaults to draft-07; draft-2020-12 selectable but "hasn't been fully tested." SchemaStore CONTRIBUTING.md explicitly recommends draft-07. Pinning `target: 'draft-07'` is the cross-ecosystem workaround. [CONFIRMED]

**Finding 6: End-to-end pipeline (Zod → JSON Schema → host → YAML LSP intellisense) is feasible; no canonical end-to-end report exists.** Component pieces all confirmed; no third-party blog measures the full pipeline. The `# yaml-language-server: $schema=URL` magic comment is a yaml-language-server *extension* (not part of YAML or JSON Schema specs) — non-portable across YAML toolchains. JSON files use a `$schema` field inside the document — broadly portable. [INFERRED]

**Finding 7: SchemaStore registry submission requires draft-07 schema, file-pattern catalog entry, optional test fixtures; no stated review SLA.** Submission entry: `node cli.js new-schema`. Two hosting modes (self-hosted URL or commit to schemastore repo). `fileMatch` guidance prefers directory-rooted patterns over generic ones. [CONFIRMED]

**Finding 8 (empirical follow-up): Three corrections + one new finding from running `z.toJSONSchema()` against Zod 4.3.6.** (1) `.brand<>()` silently emits the underlying type — the brand is unobservable in the JSON Schema artifact (resolves the original UNCERTAIN). (2) `.refine()` silently emits the underlying type — the predicate is dropped, NOT thrown (correction to original docs synthesis). (3) `z.nullable(T)` emits `anyOf: [T, {type:"null"}]` — NOT `oneOf` as the docs paraphrased. (4) **New:** `z.number().int()` without explicit bounds emits implicit `minimum: -9007199254740991, maximum: 9007199254740991` (`Number.MIN_SAFE_INTEGER` / `MAX_SAFE_INTEGER`) — every int gets implicit safe-integer bounds regardless of whether the schema author specified them. The `.transform()` throw is confirmed. The `.default()` mode behavior (output mode → field in `required[]`; input mode → not required + `additionalProperties: false` suppressed) is confirmed empirically. For OK's actual schema (no `.brand()`, `.refine()`, or `.transform()` use today), emit is fully lossless. [CONFIRMED — empirical, [evidence/d2-empirical-zod-tojsonschema.md](evidence/d2-empirical-zod-tojsonschema.md)]

**Implication of Findings 1+8:** The most consequential silent-loss is `.refine()` — a developer who validates input via Zod `.refine()` and assumes the same predicate runs in a form library that consumes the JSON Schema export will be surprised. The predicate is dropped on emit; downstream JSON Schema consumers (RJSF, JSON Forms, monaco-yaml schema) do not see it. For runtime safety on the write path, the Zod schema (not the JSON Schema artifact) must remain the validator. Zod-direct form libraries (D3 — react-formgen, uniforms) preserve `.refine()` and `.brand()`; JSON-Schema-driven libraries do not.

**Evidence:** [evidence/d2-zod-jsonschema-bridge.md](evidence/d2-zod-jsonschema-bridge.md), [evidence/d2-empirical-zod-tojsonschema.md](evidence/d2-empirical-zod-tojsonschema.md)

**Decision triggers:**
- If the schema uses (or will use) transforms, branded types, or custom `.refine()` — Zod-direct paths (D3 react-formgen, uniforms) sidestep the bridge problem; JSON-Schema-driven libraries (RJSF, JSON Forms) need `override:` patches per affected node
- If `# yaml-language-server: $schema=URL` is a desired feature — yaml-language-server-specific; portability isn't free
- If SchemaStore registration is desired — draft-07 emit is required; pin `target: 'draft-07'`
- If `.default()` is heavily used and read appears in the form UI — the `io: "output"` mode is correct (form sees post-default values); for write-back validation, `io: "input"` is correct (raw values pre-defaulting)

---

### D3 — Form library pick

**Finding 1: Schema input is the cleanest first-cut axis.** Two libraries take Zod direct: **react-formgen** (via `@react-formgen/zod`, targets Zod v4 internal `_zod.def` API) and **uniforms** (via `uniforms-bridge-zod` v4.0.0, sits at the public Zod API). Two require JSON Schema: **RJSF** and **JSON Forms** — both consume the output of `z.toJSONSchema()` directly. The Zod-direct path forecloses the loss of refinements/transforms/brands during the bridge step. [CONFIRMED]

**Finding 2: Tri-state boolean handling diverges sharply across the four.** **JSON Forms** is the only one with explicit `failWhenUndefined` semantics in its rules engine — `undefined` is structurally distinct from `false`. **react-formgen** distinguishes structurally via `isOptional()` walker; UI rendering is consumer-owned. **RJSF** and **uniforms** collapse `undefined` and `false` at the widget level; tri-state requires a 3-value enum workaround (`z.enum(['auto', 'on', 'off'])` or JSON Schema `enum: [true, false, null]`). [CONFIRMED]

**Finding 3: shadcn/Tailwind support is asymmetric.** **RJSF**'s `@rjsf/shadcn` (requires `@rjsf/core >= 6`) is the only batteries-included shadcn theme. **react-formgen**'s headless shape makes shadcn integration trivial (the consumer writes templates using shadcn components directly). **JSON Forms** and **uniforms** have no official Tailwind/shadcn theme; uniforms's "Plain HTML" is the unstyled escape hatch. [CONFIRMED]

**Finding 4: Maintenance signal varies by ~250×.** RJSF: 15.8k★, 504K weekly downloads, v6.5.1 active. JSON Forms: 2.7k★, v3.7.0, enterprise-backed (Eclipse Source). uniforms: 2.1k★, 1737 commits, Vazco-maintained. **react-formgen: 69★, version `0.0.0-alpha.27`, single-maintainer (`m6io`).** react-formgen's Zod-v4 internal-API dependency (`zod/v4/core`, `_zod.def`) is sharp coupling — any Zod 4.x bump that changes that surface area would require library updates. uniforms's Zod bridge sits at the public Zod API level, so it's less brittle. [CONFIRMED]

**Finding 5: JSON Forms' UI Schema dual-document model is the most expressive layout primitive.** Layout (groups, tabs, conditional sections) lives in a separate UI schema, not embedded in the data schema via `ui:*` keys (RJSF's pattern). The other three derive layout from the data schema directly. JSON Forms' rules engine has first-class HIDE/SHOW/DISABLE/ENABLE effects keyed off JSON Pointer expressions. [CONFIRMED]

**Finding 6: Test-schema coverage matrix.**

| Test-schema feature | RJSF | JSON Forms | react-formgen (zod) | uniforms (zod) |
|---|---|---|---|---|
| Nested objects | ✓ | ✓ | ✓ | ✓ |
| Optional fields with defaults | ✓ | ✓ | ✓ | ✓ |
| Array-of-objects (`folders: FolderRule[]`) | ✓ built-in move/add/remove | partial | requires-custom (headless) | ✓ ListField (no reorder) |
| Regex strings | ✓ | ✓ | ✓ | ✓ |
| Tri-state boolean | requires-custom | ✓ first-class | ✓ structural | requires-custom |
| Conditional enable/disable | ✓ via `oneOf`/`dependencies` | ✓ first-class Rules | requires-custom | partial |
| Direct Zod input | ✗ requires bridge | ✗ requires bridge | ✓ native | ✓ via bridge package |
| Read-only "view config" mode | ✓ | ✓ | ✓ | ✓ |
| shadcn/Tailwind theme | ✓ `@rjsf/shadcn` (v6+) | ✗ | ✓ trivially (headless) | ✗ |

**Evidence:** [evidence/d3-form-libraries.md](evidence/d3-form-libraries.md)

**Decision triggers:**
- If "headless + we own templates" is acceptable — react-formgen and JSON Forms are the only two with that posture (one-and-a-half, since react-formgen is fully headless and JSON Forms permits custom renderers)
- If maintenance/stability is heavily weighted — RJSF is the only mature mainstream option; the others have lower velocity or alpha status
- If tri-state booleans are common in the schema — JSON Forms and react-formgen are the only two with structural support
- If the schema includes transforms or brands — Zod-direct (react-formgen, uniforms) avoids the bridge; JSON-Schema-first (RJSF, JSON Forms) requires `override:` callbacks
- If shadcn/Tailwind is required — RJSF (`@rjsf/shadcn`) or react-formgen (write your own) are the only two

---

### D4 — MCP tool CRUD design

**Finding 1: JSON Pointer (RFC 6901) is the standard string-form path-addressing primitive.** Slash-separated tokens (`/sync/pushIntervalSeconds`, `/content/exclude/0`); `~0` escapes `~`, `~1` escapes `/`. TypeScript libraries: `json-pointer`, `json-ptr`, `jsonpointer`, `@hyperjump/json-pointer`. Used in JSON Schema `$ref`, AJV `instancePath`, JSON Patch operation paths. [CONFIRMED]

**Finding 2: JSON Patch (RFC 6902) defines six mutation operations.** `add`, `remove`, `replace`, `move`, `copy`, `test` — applied as an ordered atomic array. JS libraries: `fast-json-patch`, `rfc6902`, immer's internal patches. **YAML-AST patch libraries exist:** `yamlpatch` (Go, int128) applies JSON Patch to YAML preserving comments; `yaml-diff-patch` (npm) attempts whitespace/comment preservation; `enhanced-yaml` operates on `yaml`-package AST. [CONFIRMED]

**Finding 3: JSON Merge Patch (RFC 7396) is a simpler partial-object format with explicit limitations.** Cannot express: array-element-at-index, null-overload (null means delete), move/copy, test-and-set. RFC explicitly: *"Suitable for documents that primarily use objects and don't make use of explicit null."* [CONFIRMED]

**Finding 4: MCP spec mandates nothing about edit-tool granularity; existing servers use four distinct patterns.** Spec is silent on granularity. Adjacent precedent:
- **GitHub MCP `update_file`**: whole-file by SHA
- **GitHub MCP `update_issue`**: `method` parameter naming the operation
- **Filesystem MCP `edit_file`**: line-based replacement, returns git-style diff
- **Community `json-editor-mcp`, `JSON-MCP-Server`**: ad-hoc dot-notation paths (NOT RFC 6901)

[CONFIRMED]

**Finding 5: VS Code's settings-UI write semantics use `jsonc-parser.modify()` — text-edit-against-original-bytes preserves comments.** `modify(text, JSONPath, value, options)` returns `Edit[]` (offset/length/content); `applyEdits(text, edits)` returns the new text. Path is **array of segments** (`['sync', 'pushIntervalSeconds']`), NOT JSON Pointer. Auto-creates missing path segments; `value === undefined` removes. **This is the canonical pattern** for "edit a structured config without losing comments" — parse to AST, compute textual edits against original bytes, apply. The YAML analog of this pattern is `yaml@2`'s Document layer + `setIn`/`deleteIn`/`toString()`. [CONFIRMED]

**Finding 6: Renovate's `renovate-config-validator` is validation-only; no structural-edit surface, no schema-aware suggestions.** Output: `{ errors: [{ topic, message }] }`. No "did you mean X?" suggestions. Discussion #36298 acknowledges output is not CI/automation-friendly. Closest in-class precedent for a config CLI validator, but read-only. [CONFIRMED]

**Finding 7: Three path-addressing notations have established precedent.**

| Notation | Example | Where used | Tradeoff |
|---|---|---|---|
| **Slash JSON Pointer (RFC 6901)** | `/sync/pushIntervalSeconds` | AJV `instancePath`, JSON Schema `$ref`, JSON Patch | Standard; `/`/`~` escape rules; LLM-friendly string |
| **Array of segments** | `['sync', 'pushIntervalSeconds']` | `jsonc-parser.modify`, Zod `path`, immer | No escaping; loses readability in JSON; TS-natural |
| **Dot notation** | `sync.pushIntervalSeconds` | VS Code `settings.json` keys, Lodash `_.get`, community MCPs | Familiar; ambiguous when keys contain `.`; no array-index syntax |

Zod uses array-of-segments in `.path`; AJV uses slash JSON Pointer in `.instancePath`. [CONFIRMED]

**Finding 8: Five granularity choices have adjacent precedent; tradeoffs are token-cost vs typed-input strength.**

| Pattern | Precedent | Tradeoff |
|---|---|---|
| **Single tool + `path` arg** | `json-editor-mcp`, `jsonc-parser.modify` | Lowest tool count → lowest context cost; weakest typed input (`value: any`) |
| **Tool per top-level domain** | GitHub MCP `update_issue` | Strong typed input; multiplies tool count → 550–1400 tokens/tool of context cost |
| **Whole-replace** | GitHub MCP `update_file` | Atomic; expensive in tokens; loses comments unless paired with structured-edit applier |
| **Patch document** | Kubernetes admission webhooks | Most expressive (incl. `test`/`move`/`copy`); model must construct the patch |
| **Code mode** | Cloudflare Code Mode (~100× token reduction claimed) | Most flexible; security surface (sandbox required) |

Token cost evidence: typical MCP tool def is 550–1400 tokens; aggressive servers consume 72% of a 200k context window on tool defs alone (Apideck). SEP-1576 in MCP spec acknowledges this. [CONFIRMED]

**Finding 9: Validation flow has four shapes.** Pre-write (validate proposed change before mutating); post-write (validate file as a whole after mutation); two-phase (`test` + apply + revalidate); schema-slice validation (limited library support — typically hand-rolled). JSON Patch's `test` op exists precisely for inline pre-condition assertions. [CONFIRMED]

**Finding 10: Zod and AJV expose structurally-similar but syntactically-different error shapes.** Zod: `ZodError.issues[]` with `path: (string|number)[]`. AJV: `errors[]` with `instancePath: string` (RFC 6901 JSON Pointer). Same information, different shapes. MCP spec maps both cleanly to `structuredContent` with `isError: true` plus a fallback text block. [CONFIRMED]

**Evidence:** [evidence/d4-mcp-config-crud.md](evidence/d4-mcp-config-crud.md)

**Decision triggers:**
- If the config is small (<20 fields) and tool-count budget is tight — single-tool-with-path is the cheapest token shape
- If the schema is large and per-domain typed input matters more than token cost — tool-per-domain is the precedent (GitHub MCP)
- If batch edits are common — JSON Patch document is more expressive than single-field tools
- If comment preservation is required — pair any of the above with `yaml@2` Document AST writes (analog of `jsonc-parser.modify`)
- If the validator is Zod — array-of-segments path notation matches Zod's `.path` natively; AJV would prefer RFC 6901 strings
- If "did you mean X?" is desired — out of scope for MCP today; would require schema-aware error layer beyond current libraries

---

### D5 — File-like editor UX

**Finding 1: monaco-yaml provides JSON-Schema-driven autocomplete, validation, hover, folding, anchor links — but requires bundler-side worker wiring.** Wraps Red Hat `yaml-language-server` for Monaco; feature parity is high. Schema supply: programmatic (`configureMonacoYaml({ schemas })`) or inline modeline (`# yaml-language-server: $schema=https://…`). Worker-based; requires Webpack/Vite worker setup. Monaco base ~4 MB; community reports of bundle-size growth in v4 alpha (parser switched to `yaml`). No UMD build — bundler required. ~310★, v4.0.0-alpha.1 Feb 2025. [CONFIRMED]

**Finding 2: CodeMirror 6 has no off-the-shelf YAML+JSON Schema integration; three separate paths exist.**
- **`@codemirror/lang-yaml` alone** — Lezer YAML grammar only; no schema awareness
- **`codemirror-json-schema` (jsonnext)** — JSON-Schema-driven validation/completion/hover built on `@codemirror/lang-yaml`; in-process (no worker); smaller than monaco-yaml
- **LSP bridge** — `@codemirror/lsp-client` (official) or `FurqanSoftware/codemirror-languageserver` wrapping yaml-language-server; closest behavior parity with VS Code, most code

[CONFIRMED]

**Finding 3: The same JSON Schema document drives both Monaco and CodeMirror paths.** Both consume JSON Schema verbatim. Editor choice does not lock in the schema authoring path. [CONFIRMED]

**Finding 4: Modeline `# yaml-language-server: $schema=…` portability varies.** Honored by VS Code, monaco-yaml (via embedded yaml-language-server), Zed. JetBrains uses different syntax (`# $schema=…`). Pure-CM6 (`codemirror-json-schema`) does not appear to honor the modeline — that capability lives inside yaml-language-server, so only available through the LSP bridge path. [INFERRED]

**Finding 5: Adjacent prior-art in-app YAML config editors all use JSON Schema as the substrate.** GitLab Pipeline Editor (schema specs in `spec/frontend/editor/schema/ci`, `$ref`-shared definitions, positive/negative test fixtures). CircleCI in-app editor (autocomplete tooltips with linked docs, built-in linter on every change). GitHub workflow web editor (validates against schemastore.org-published schema). **Pattern: every in-app YAML config editor surveyed uses JSON Schema as the validation substrate.** None ships a custom validator. [CONFIRMED]

**Evidence:** [evidence/d5-d6-editor-and-convergence.md](evidence/d5-d6-editor-and-convergence.md)

**Decision triggers:**
- If the host app already uses one of the editors heavily — the substrate choice may be settled (CodeMirror for an app already using CM6, Monaco for an app already shipping Monaco)
- If bundle size is heavily weighted — codemirror-json-schema is lighter than monaco-yaml; LSP bridge is heaviest
- If feature parity with VS Code is required — LSP bridge is the only path; monaco-yaml is closest "in-process" alternative
- If modeline honoring matters — anything wrapping yaml-language-server (monaco-yaml, LSP bridge); not pure CM6
- If "no editor at all, just IDE intellisense" is acceptable — publishing a JSON Schema with a `$schema` URL or magic comment provides this for free in red-hat YAML LSP environments

---

### D6 — Convergence architecture (the "shared write path")

**Finding 1: VS Code's settings UI and settings.json share a single write API (`ConfigurationEditingService`).** Both surfaces are views over `IConfigurationService` / `ConfigurationEditingService`. The `doWriteConfiguration` method validates dirty-file state, resolves the model reference, and writes either via the user-configuration file service or by directly updating the configuration model. **The Settings UI calls the same `writeConfiguration` primitive the JSON editor flush hits — there are not two write paths.** File watcher is hosted in a separate `UtilityProcess` (Parcel watcher recursive, NodeJS watcher non-recursive) and feeds change events back. [CONFIRMED]

**Finding 2: JetBrains uses `PersistentStateComponent` as the equivalent shared write primitive.** Project settings are XML files under `.idea/`; application settings under `~/.config/JetBrains/<IDE>/options/`. Settings dialog UI binds to the IntelliJ Platform Persistence Model — the dialog is one consumer of the same persistent state object that on-disk reload also feeds. Same architectural shape as VS Code. [CONFIRMED]

**Finding 3: Storybook `main.ts` is read-only relative to the GUI; no write-back path.** Config file is a TS/JS module loaded at server boot; the running Storybook server reads it once and exposes the resolved config to the manager UI. No GUI "edit `main.ts`" surface — addons display the loaded config but do not write it back. Watch-mode reload of `main.ts` is a long-standing feature request (#15873), not a built-in. **"Read-only GUI over a config file"** is the simpler precedent when bidirectional editing isn't required. [CONFIRMED]

**Finding 4: The "single write primitive shared by N surfaces" pattern has no sticky name in dev-tool literature.** Most commonly framed as "single source of truth" + a dedicated config-edit service (VS Code's `ConfigurationEditingService`, JetBrains's `PersistentStateComponent`). One emerging framing in AI-agent CLI design: "Discovery Document" pattern — one canonical schema/manifest feeds CLI, MCP, and other adapters. Standard reactive-update path: write primitive → file system → file watcher event → `IConfigurationService.onDidChangeConfiguration` → UI re-render. [INFERRED]

**Finding 5: HTTP-layer placement varies; (a) HTTP endpoint and (c) direct filesystem are the two dominant patterns.**

| Placement | Precedent | Notes |
|---|---|---|
| **(a) HTTP endpoint on dev server** | GitLab Pipeline Editor, CircleCI in-app editor | Editor SPA round-trips POST to backend lint/save endpoints |
| **(b) WebSocket** | CircleCI live-validation streaming | Not the primary write surface in any source surveyed |
| **(c) Direct filesystem (Electron only)** | VS Code | Writes through `IFileService` directly without HTTP hop |
| **(d) MCP-tool indirection** | No prior-art surfaced | Greenfield placement |

[INFERRED — (a) and (c) confirmed; (b) and (d) sparse evidence]

**Finding 6 (production case studies follow-up): GitLab + CircleCI + GitHub web YAML editors — three convergent patterns + four divergences.**

Three production web-based YAML config editors investigated in depth (GitLab Pipeline Editor, CircleCI in-app editor, GitHub workflow web editor + `github.dev`).

**Convergent patterns** across all three:

1. **Git is the source of truth.** None store YAML in editor-private storage — every web edit becomes a `git commit` operation against the user's repository.
2. **None implement live concurrent-editor presence (CRDT, OT, or "another tab is editing").** Conflict detection is purely commit-time, gated on branch-tip / `lastCommitId` / stale-base / fast-forward checks. The web editor is a stateless form over a git ref.
3. **Schema is JSON Schema delivered out-of-band.** GitLab + CircleCI publish first-party schemas (also mirrored on SchemaStore); GitHub relies entirely on SchemaStore community-maintenance.
4. **Two-tier validation: schema-level browser checks + server-side semantic validation.** GitLab and CircleCI expose this explicitly (Lint tab, Save-and-Run, `config validate` CLI hitting servers); GitHub's "second tier" is the runner's parse at push time.
5. **All three use the schema → autocomplete → hover docs LSP shape.** GitLab via monaco-yaml, CircleCI via its open-sourced Go language server, GitHub via the VS Code extension.

**Divergences:**
- **Write path mechanism.** GitLab: GraphQL `commitCIFile` mutation with explicit `$lastCommitId` (the conflict-detection primitive — rejects on stale base). CircleCI: VCS API call (commit lands in the user's GitHub/Bitbucket repo, not CircleCI). GitHub: server-mediated web-flow commit attributed to a service user.
- **First-party vs community schema.** GitLab + CircleCI maintain canonical schemas in their own repos. GitHub does not — SchemaStore is the de facto canonical source.
- **Validation tier surfacing.** GitLab exposes both tiers as distinct UI tabs (Edit, Validate, Lint). CircleCI exposes one validity bar plus a Linter tab. GitHub web editor exposes neither — feedback is push-time only.
- **Editor sophistication.** GitLab + CircleCI ship dedicated YAML editors with Monaco / LSP / inline squiggles. GitHub's plain web editor is closer to a syntax-highlighted textarea; the Monaco-grade experience is `github.dev` (a separate surface).

[CONFIRMED — see [evidence/d6-production-case-studies.md](evidence/d6-production-case-studies.md) for ~25 primary-source citations]

**Implication for D6:** The "shared write primitive" finding (VS Code's `ConfigurationEditingService`, JetBrains's `PersistentStateComponent`) is an **Electron / IDE-host** pattern. The **browser-host** equivalent is much narrower: every surveyed dev-tool web editor (GitLab, CircleCI, GitHub) collapses the multi-surface problem by making git commits the only write path — there is no in-process "shared write API" because there is only one commit pipeline. Cross-surface conflicts (another IDE has the file open, two browser tabs editing) are not detected; they manifest at git commit-time as stale-base rejections.

**Evidence:** [evidence/d5-d6-editor-and-convergence.md](evidence/d5-d6-editor-and-convergence.md), [evidence/d6-production-case-studies.md](evidence/d6-production-case-studies.md)

**Decision triggers:**
- If three CRUD paths (file, MCP, form UI) need lockstep behavior — a shared write primitive (analog of `ConfigurationEditingService`) is the canonical implementation; without it, drift is inevitable
- If the form UI is read-only "view config" — the Storybook precedent applies; no shared write API needed
- If the host is browser-only — HTTP endpoint is the precedent; Electron-only direct FS is unavailable
- If MCP is the only programmatic path — funneling form-UI writes through the MCP tool layer too is greenfield (no surveyed precedent) but composable

---

## Limitations & Open Questions

### Dimensions not fully covered

- **D2:** ~~Empirical behavior of `.brand()` under `z.toJSONSchema()` on Zod 4.3.6 is UNCERTAIN~~ **RESOLVED 2026-04-25** by empirical follow-up (Finding 8 + [evidence/d2-empirical-zod-tojsonschema.md](evidence/d2-empirical-zod-tojsonschema.md)) — `.brand()` and `.refine()` silently emit underlying type; only `.transform()` throws. Three corrections + one new finding (implicit safe-integer bounds on `int()`) folded into Finding 8.
- **D3:** Bundle-size measurements per library are INFERRED from package internals; no published benchmark for minimal-config + theme. React 19 / React Compiler compatibility is also unverified per library.
- **D4:** Whether MCP's `outputSchema` (newer in 2025-06-18 spec) helps surface validation errors more cleanly than ad-hoc text content blocks is unmeasured. Whether MCP elicitations offer a path for "did you mean X?" schema-aware suggestions is also untested.
- **D5:** Empirical bundle-size comparison of monaco-yaml v4 alpha vs codemirror-json-schema in a typical Webpack/Vite build is not surfaced. Whether `codemirror-json-schema` parses the `# yaml-language-server: $schema=…` modeline would require source inspection or maintainer query.
- **D6:** ~~Production case studies of dual-surface config editors (GitLab, CircleCI, GitHub) underspecified~~ **RESOLVED 2026-04-25** by case-studies follow-up (Finding 6 + [evidence/d6-production-case-studies.md](evidence/d6-production-case-studies.md)). Five convergent patterns + four divergences captured. One residual UNCERTAIN: whether `github.dev` consumes the SchemaStore URL or an internal copy.

### Out of scope (per rubric)

- TypeScript-config-as-schema (Astro/Storybook style)
- Visual CMS form patterns (TinaCMS, Webstudio, Sanity Studio)
- VS Code extension authoring for OK config
- Auth/permissions for the form UI
- General schema-driven form theory
- What fields go in the OK config schema (settled)

### Confirmed negatives

- **No purpose-built MCP server exists for "edit a YAML config with JSON Schema validation."** Two community JSON-editor MCPs (`json-editor-mcp`, `JSON-MCP-Server`) exist; both use ad-hoc dot-paths, not RFC 6901; neither handles YAML AST.
- **No comparable dev-tool surveyed (Renovate, GitHub Actions, Mintlify, Kubernetes/Kustomize) ships a first-party GUI editor for its config file.** Schema-driven IDE intellisense + CLI validation is the universal pattern.
- **No prior-art argues for converting YAML → JSON internally before validation.** The canonical chain is `yaml.parse() → schema.parse()` directly on the JS object.
- **`json-schema-to-zod` round-trip is explicitly disclaimed by the maintainer.** Reverse direction is codegen-only.
- **"MCP-tool indirection" as the form-UI write path** has no surveyed precedent. Plausible but greenfield.

---

## References

### Evidence files

- [evidence/d1-yaml-storage-roundtrip.md](evidence/d1-yaml-storage-roundtrip.md) — `yaml@2` Document API, js-yaml comment-preservation status, write-back semantics, comparable systems
- [evidence/d2-zod-jsonschema-bridge.md](evidence/d2-zod-jsonschema-bridge.md) — `z.toJSONSchema()` coverage matrix, deprecated bridges, draft fragmentation, SchemaStore submission
- [evidence/d3-form-libraries.md](evidence/d3-form-libraries.md) — RJSF / JSON Forms / react-formgen / uniforms capability matrix vs OK test schema
- [evidence/d4-mcp-config-crud.md](evidence/d4-mcp-config-crud.md) — JSON Pointer + JSON Patch + Merge Patch primitives, MCP granularity precedent, design-space matrix
- [evidence/d5-d6-editor-and-convergence.md](evidence/d5-d6-editor-and-convergence.md) — monaco-yaml + CodeMirror substrate comparison, VS Code / JetBrains / Storybook architectural precedent
- [evidence/d2-empirical-zod-tojsonschema.md](evidence/d2-empirical-zod-tojsonschema.md) — empirical follow-up: actual `z.toJSONSchema()` output for 23 test cases on Zod 4.3.6, with three corrections to D2 + one new finding
- [evidence/d6-production-case-studies.md](evidence/d6-production-case-studies.md) — production follow-up: GitLab Pipeline Editor + CircleCI in-app editor + GitHub workflow web editor, write paths + validation flows + conflict handling

### External sources

**YAML libraries + LSPs:**
- [eemeli/yaml (yaml@2)](https://github.com/eemeli/yaml) + [content-nodes docs](https://github.com/eemeli/yaml/blob/main/docs/05_content_nodes.md)
- [nodeca/js-yaml](https://github.com/nodeca/js-yaml)
- [redhat-developer/yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
- [remcohaszing/monaco-yaml](https://github.com/remcohaszing/monaco-yaml)
- [codemirror/lang-yaml](https://github.com/codemirror/lang-yaml)
- [jsonnext/codemirror-json-schema](https://github.com/jsonnext/codemirror-json-schema)
- [@codemirror/lsp-client](https://github.com/codemirror/lsp-client)
- [SchemaStore](https://github.com/SchemaStore/schemastore) + [CONTRIBUTING.md](https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md)

**Zod ↔ JSON Schema:**
- [Zod v4 JSON Schema docs](https://zod.dev/json-schema)
- [zod-to-json-schema (deprecated)](https://github.com/StefanTerdell/zod-to-json-schema)
- [json-schema-to-zod (sunsetting)](https://github.com/StefanTerdell/json-schema-to-zod)
- [colinhacks/zod #5239 — v3 republish request](https://github.com/colinhacks/zod/issues/5239)

**Form libraries:**
- [react-jsonschema-form (RJSF)](https://github.com/rjsf-team/react-jsonschema-form)
- [@rjsf/shadcn](https://www.npmjs.com/package/@rjsf/shadcn)
- [JSON Forms (eclipsesource)](https://github.com/eclipsesource/jsonforms) + [rules docs](https://jsonforms.io/docs/uischema/rules/)
- [vazco/uniforms](https://github.com/vazco/uniforms) + [uniforms-bridge-zod](https://www.npmjs.com/package/uniforms-bridge-zod)
- [m6io/react-formgen](https://github.com/m6io/react-formgen)
- [Schema-Driven Forms in React: comparing RJSF, JSON Forms, Uniforms (dev.to)](https://dev.to/yanggmtl/schema-driven-forms-in-react-comparing-rjsf-json-forms-uniforms-formio-and-formitiva-2fg2)

**RFCs + path/patch primitives:**
- [RFC 6901 — JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901)
- [RFC 6902 — JSON Patch](https://jsonpatch.com/)
- [RFC 7396 — JSON Merge Patch](https://datatracker.ietf.org/doc/html/rfc7396)
- [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch)
- [yamlpatch (Go)](https://github.com/int128/yamlpatch)
- [yaml-diff-patch](https://www.npmjs.com/package/yaml-diff-patch)

**MCP + adjacent CRUD precedent:**
- [MCP Tools spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Filesystem MCP server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [json-editor-mcp (community)](https://github.com/peternagy1332/json-editor-mcp)
- [SEP-1576 — Mitigating Token Bloat in MCP](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)
- [Cloudflare Code Mode for MCP](https://blog.cloudflare.com/code-mode-mcp/)

**Convergence architecture:**
- [VS Code configurationEditingService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configuration/common/configurationEditingService.ts)
- [VS Code File Watcher Internals wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)
- [JetBrains Settings Guide (Plugin SDK)](https://plugins.jetbrains.com/docs/intellij/settings-guide.html)
- [Storybook main-config docs](https://storybook.js.org/docs/api/main-config/main-config)
- [GitLab CI/CD Schema](https://docs.gitlab.com/development/cicd/schema/) + [Pipeline Editor](https://docs.gitlab.com/ci/pipeline_editor/)
- [CircleCI in-app config editor](https://circleci.com/docs/config-editor)
- [Renovate Config Validation](https://docs.renovatebot.com/config-validation/) + [Schema](https://docs.renovatebot.com/json-schema/)

**Comparable production prior art:**
- [firebase-tools PR #6987 — AST-level config edits](https://github.com/firebase/firebase-tools/pull/6987)
- [Discourse blog: Ruby psych comment preservation (2026)](https://blog.discourse.org/2026/02/how-we-fixed-yaml-comment-preservation-in-ruby-and-why-we-sponsored-it/)

### Related research (navigation aids only — not evidence)

- [reports/npm-global-cli-packaging/](../npm-global-cli-packaging/REPORT.md) — establishes OK's hierarchical YAML config convention; doesn't study editor UX
- [reports/frontmatter-schema-conventions-for-agent-readable-docs/](../frontmatter-schema-conventions-for-agent-readable-docs/REPORT.md) — YAML frontmatter schemas across documentation frameworks; adjacent context for "what schema fields look like in documentation YAML"
