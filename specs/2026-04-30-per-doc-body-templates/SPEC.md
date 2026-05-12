# Per-Doc Body Templates — Spec

**Status:** Draft — pending user direction on §11 Q1 (dual-truth frontmatter materialization)
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-30
**Baseline commit:** 0a28681a
**Links:**
- Research report: [`reports/per-doc-body-templates-karpathy-journals/REPORT.md`](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md)
- Evidence: [`evidence/`](./evidence/)
- Related: [`reports/obsidian-karpathy-workflow-deep-dive/`](../../reports/obsidian-karpathy-workflow-deep-dive/), [`reports/config-driven-folder-frontmatter/`](../../reports/config-driven-folder-frontmatter/), [`reports/config-edit-paths/`](../../reports/config-edit-paths/)
- Tracking: branch `spec/per-doc-body-templates`

---

## 1) Problem statement

**Situation:** Open Knowledge already encodes per-folder defaults in `config.yml` `folders[]` rules — each rule pairs a glob (`match:`) with default `frontmatter:` (title, description, tags). Today these defaults surface as a virtual overlay in MCP read-side tools (`exec`, `read_document`, `search`) — they enrich agent responses but don't write into the file on disk. The Karpathy three-layer starter pack (`STARTER_FOLDERS`: `external-sources/`, `research/`, `articles/`) plus the hardcoded `LOG_MD_TEMPLATE` in `packages/server/src/seed/starter.ts` are the only existing precedent for "body content scaffolded into a new file at known path." The Obsidian-canonical daily-journal pattern — open today's note, see `# {{date}}` + stable section headings + empty bullets ready for typing — has no native expression in OK today. Users coming from Obsidian Daily Notes, Templater, Logseq journals, or any LLM-power-user daily/journal flow have nowhere in OK to declare "every new file in `journals/daily/**` should start with this scaffold."

**Complication:** Karpathy's anti-RAG insight ("the LLM has been pretty good about auto-maintaining index files") relies on **structural predictability** — the LLM's downstream maintenance is upstream-fed by every new file having a known shape. Without per-doc body templates, two failure modes compound: (1) human friction at create time — every new daily note starts blank, no scaffold, no muscle memory; (2) agent-side variance — when MCP `create_page` or `write_document` creates a file, there's no folder-rule shape to fall back on, so each agent invents its own structure. Three nearby tools (Hugo archetypes, Obsidian Templater folder-template-pairs, Notion DB templates) prove the per-folder body-template pattern is durable and well-understood. The cost of inaction grows as more starter packs and folder taxonomies ship — every new "shape policy" gets baked as another hardcoded `*_TEMPLATE` constant rather than declarative config. The first "materialize at create" feature also unlocks a path for `folders[].frontmatter` to graduate from virtual overlay to actual on-disk default (covered in §10 D2).

**Resolution:** Add two optional sibling fields to each `folders[]` rule — **`body:` (inline string)** and **`bodyPath:` (path relative to project root, file-reference variant)** — that carry the markdown body to materialize when a file is created at a path matching the rule. Variable substitution uses Obsidian-canonical `{{var}}` and `{{var:format}}` syntax. Variables in MVP: `date`, `date:FORMAT` (moment.js), `title`, `path`, `user`. Materialization happens at file creation time only — through `POST /api/create-page` and MCP `write_document`/`create_page` when target doesn't exist and agent-supplied body is empty. Agent-supplied non-empty body wins. Last-match-wins among `folders[]` rules. JS execution is a bright-line non-goal. The feature ships purely additive — when no rule matches or no body fields are set, current empty-file behavior is preserved.

---

## 2) Goals

- **G1:** A user can declare in `.open-knowledge/config.yml` that any file created at a folder-glob-matched path starts with a markdown scaffold (frontmatter+body), with at least date/title/path/user variable substitution.
- **G2:** Karpathy-style ingest folders + Obsidian-canonical daily-journal patterns are both expressible through one mechanism, with no new abstraction needed beyond the existing `folders[]` array.
- **G3:** The feature is invisible by default — users with no `body:`/`bodyPath:` set on any rule see exactly today's behavior.
- **G4:** Templates are agent-readable + agent-writable via the existing config-edit primitives (`set_folder_rule`, `applyFolderRulesUpsert`, `set_config`).
- **G5:** The mechanism establishes a clean migration path for future template-shape work — interactive prompts, multi-template chooser, recurring schedule, `{{cursor}}` marker — without re-shaping the field surface.

## 3) Non-goals

- **[NEVER]** NG1: Arbitrary JavaScript / expression evaluation in templates. Templater's distinguishing feature; refused by every other surveyed tool. Security surface plus complexity OK is not paying for. — Revisit: never; if scripting is needed, dispatch a separate spec for an explicit "template macros" surface, not via expression eval.
- **[NEVER]** NG2: Auto-applying templates to existing files (re-running a template against a file that already has body content). Materialization is at creation only. Re-application would be destructive without conflict resolution. — Revisit: never as part of this feature; a separate "scaffold this existing file" command is a different shape.
- **[NEVER]** NG3: Per-doc sidecar template files (e.g., `.template.md` next to user content). Violates the "no OK sidecars in user-content paths" STOP rule. Templates live in `config.yml` (inline) or `.open-knowledge/templates/` (file-ref).
- **[NOT NOW]** NG4: `{{prompt:label}}` interactive prompts at file creation. Requires editor modal UX; cleanly addable as a new variable form later. — Revisit if: the editor grows a template-application modal (covered by a separate spec).
- **[NOT NOW]** NG5: Multi-template-per-folder + chooser UX (Notion/GitHub-issue-templates style). Useful but adds a layer; MVP is one template per matching rule. — Revisit if: user feedback shows the same folder regularly needs >1 distinct shapes.
- **[NOT NOW]** NG6: Recurring schedule (Notion-style "create a new daily-journal entry every day at 9am"). Different feature; needs scheduler. — Revisit if: a recurring-create surface ships separately.
- **[NOT NOW]** NG7: "Open today's daily note" command (filename-pattern + `today` semantics). Cleanly separable feature; needs command-palette UX. — Revisit if: editor adds command-palette infra.
- **[NOT NOW]** NG8: `{{cursor}}` placement marker. Useful in editors but cosmetic; needs editor-side coordination. — Revisit when: editor templating UI exists.
- **[NOT UNLESS]** NG9: Migrating existing `folders[].frontmatter` from virtual overlay to materialize-at-create semantics (D2 in §10). — Only if: user explicitly directs this in §11 Q1.
- **[NOT NOW]** NG10: Implicit body-template stacking (parent-then-child concatenation). — Revisit if: a real use case emerges where users repeatedly request layered scaffolds. The clean addition shape is opt-in `bodyPrepend:` / `bodyAppend:` fields, which don't reshape MVP. Until then: composition is explicit via shared `bodyPath:` references. (See D22.)
- **[NOT NOW]** NG11: Migrating existing MCP virtual-overlay sites (`exec.ts`, `read-document.ts`, `search.ts`) to use the new shared `resolveEffectiveFolderRule` resolver. — Revisit when: the resolver has stabilized through body-template usage; or when Q1 (frontmatter materialization) lands and the existing sites need to change behavior anyway. (See D23 + Future Work — Identified.)

## 4) Personas / consumers

### P1: Daily-journal user (Obsidian-refugee)

- **JTBD:** When I open OK in the morning to start my journal entry... But every new file is blank and I have to remember the same headings every time... Help me have today's journal pre-scaffolded with `# {{date}}` and my standard sections... So I can get straight to typing without ceremony.
- **Current workflow + workarounds:** Manually copy-paste a template from another file; type the date heading by hand; use Obsidian's Daily Notes plugin (which OK doesn't replicate today).
- **Pain points:** Friction at "I want to start writing now"; inconsistent shape across days; no LLM-readable structure.
- **Trust/security sensitivities:** Templates must produce plain markdown the user owns; no app-locked shape.
- **Success in their terms:** Creating `journals/daily/2026-04-30.md` produces a populated scaffold immediately, indistinguishable in shape from yesterday's entry.

### P2: Karpathy-style ingest user

- **JTBD:** When I clip an article into `external-sources/`... But each clip needs the same metadata fields (`source:`, `clipped:`, `status:`, etc.)... Help me have those frontmatter fields and a `## Source` / `## Highlights` / `## My notes` scaffold pre-populated... So my downstream LLM compile step has predictable shape to consume.
- **Current workflow + workarounds:** Hand-write the frontmatter + section headings every clip; rely on agent prompt-engineering to get consistent output.
- **Pain points:** Variance across clips; agent-side inconsistency that breaks downstream `consolidate` / Q&A.
- **Trust/security sensitivities:** Templates apply at creation only — never overwrite existing content.
- **Success in their terms:** Every new file in `external-sources/**` starts with the team-agreed metadata + section scaffold.

### P3: LLM agent (MCP client)

- **JTBD:** When I create a new doc on behalf of a user via `create_page` or `write_document`... But the user has expressed shape preferences via `folders[]` rules... Help me have those preferences materialized into the file automatically when I don't supply a body... So my downstream tools can read predictable structure without me re-implementing the scaffold logic per agent.
- **Current workflow + workarounds:** Each agent client re-implements scaffolds in its own prompt or tool layer.
- **Pain points:** N agents × M templates per project = combinatorial drift.
- **Trust/security sensitivities:** Agent-supplied non-empty body MUST win — templates never overwrite agent intent.
- **Success in their terms:** Calling `create_page` with no body in a templated folder produces the project's scaffold; calling with a body produces exactly the body sent.

### P4: KB owner / OSS contributor seeding a new project

- **JTBD:** When I run `ok seed` on a fresh repo... But the resulting starter has folder-frontmatter rules but blank file contents... Help me have starter `body:` defaults so new clips immediately have shape... So onboarding for new contributors is "just create a file in the right folder."
- **Current workflow + workarounds:** Hardcoded `LOG_MD_TEMPLATE` (one-shot during seed); no body templates per starter folder today.
- **Pain points:** New contributors don't know the project's shape conventions.
- **Trust/security sensitivities:** Starter templates must be non-prescriptive — easy to remove or override.
- **Success in their terms:** `ok seed` produces folder rules with `body:` defaults that match the project's conventions; new files in those folders inherit them.

## 5) User journeys

### P1: Daily-journal user

1. **Discovery** — User reads OK docs / blog post / kepano-aligned content describing per-folder body templates. Or hits the field while editing `config.yml` with autocomplete from the JSON schema.
2. **Setup** — User adds to `.open-knowledge/config.yml`:
   ```yaml
   folders:
     - match: "journals/daily/**"
       frontmatter:
         tags: [ journal, daily ]
       body: |
         ---
         date: {{date}}
         ---

         # {{date:dddd, MMMM Do YYYY}}

         ## Today
         -

         ## Decisions
         -

         ## Open questions
         -
   ```
3. **First use** — User creates `journals/daily/2026-04-30.md` (via editor "new file," CLI, or MCP). The file lands populated with the substituted scaffold. User starts typing under `## Today`.
4. **Ongoing use** — Every new daily-journal file starts identically; user's typing flow is uniform.
5. **Failure / debug** — User changes the template; existing files don't change (creation-only semantics, by design). User mistakes a variable name (`{{tody}}`); the literal string `{{tody}}` ends up in the file with a console warning. User edits config.yml YAML wrong; existing config-validation error path catches it.
6. **Growth** — User adds `journals/weekly/**` with a different template referencing `{{date:gggg-[W]ww}}`. Adds an `external-sources/**` rule for clips with full metadata.

### P2: Karpathy-style ingest user

1. **Discovery** — Reads `external-sources/` folder description on `ls external-sources` (existing description-overlay path) → "every new clip should carry source/clipped/status frontmatter." Discovers body-template field as the way to encode that.
2. **Setup** — Updates `external-sources/**` rule:
   ```yaml
   - match: "external-sources/**"
     frontmatter:
       tags: [ source, immutable, layer-ingest ]
     body: |
       ---
       source: 
       clipped: {{date}}
       status: raw
       ---

       ## Source

       ## Highlights

       ## My notes
   ```
3. **First use** — Agent calls `create_page` for `external-sources/llms-2025-survey.md` with no body. File lands populated.
4. **Ongoing use** — Every clip — human or agent — has uniform shape.
5. **Failure / debug** — Agent calls `create_page` with a body argument. Template is bypassed (agent body wins). Logs note "agent body present, template skipped" at debug level for traceability.
6. **Growth** — Adds `research/**` with `status: provisional` + `sources: []` defaults. Adds `articles/**` with `status: canonical` + `supersedes: []`.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `POST /api/create-page` materialization | N/A (synchronous) | No matching rule → empty file (current behavior) | Template-render error → log warning, fall back to empty file (don't block create) | Matching rule + body field → file written with substituted content | `body:` set + `bodyPath:` set → `bodyPath:` wins; if `bodyPath:` unreadable, fall back to `body:` if set |
| MCP `write_document` materialization | N/A | Target doesn't exist + agent body empty + matching rule → template applied | Template render error → fall back to writing agent-supplied body (or empty if both empty) | Target doesn't exist + agent body non-empty → agent body wins | Target exists → no materialization (out of scope) |
| Variable substitution | N/A | Template has no `{{...}}` → content passes through verbatim | Undefined variable (`{{tody}}`) → warn + passthrough literal | All known vars → substituted | Mix of known + unknown → known substituted, unknown left literal |
| Schema validation | N/A | `folders[].body` and `bodyPath` both omitted (legacy rule) → accepted | Both `body:` and `bodyPath:` empty strings → accept; both absent is the no-template default | Both fields parse as optional strings | One set → use it |

## 6) Requirements

### Functional requirements

| ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| FR-1 | Schema accepts optional `body:` (string) and `bodyPath:` (string) on each `folders[]` rule. | `ConfigSchema.parse({ folders: [{ match: 'x/**', frontmatter: {}, body: '...' }] })` succeeds; same with `bodyPath`; both omitted also succeeds. Existing rule shape (no `body`/`bodyPath`) parses unchanged. Schema-jsonschema test fixtures updated. | D1 LOCKED |
| FR-2 | `POST /api/create-page` materializes the matching folder rule's body template into the new file at creation time. | Given `folders: [{ match: 'journals/daily/**', body: '# {{date}}' }]`, calling `POST /api/create-page {path:"journals/daily/2026-04-30.md"}` writes a file containing the substituted body. With no matching rule, file is created empty (current behavior preserved). | D3 LOCKED |
| FR-3 | MCP `write_document` materializes template when target doesn't exist AND agent-supplied body is empty (whitespace-only after frontmatter strip). | Calling `write_document` to a non-existent path under a templated folder with no body produces the substituted template. Calling with a non-empty body produces exactly the agent-supplied body. Existing files are never touched. | D5 LOCKED |
| FR-4 | Variable substitution supports `{{date}}`, `{{date:FORMAT}}` (moment.js tokens), `{{title}}`, `{{path}}`, `{{user}}`. Substitution is **single-pass** — substituted values are NOT re-scanned for `{{...}}`. | Unit tests cover each variable + `{{date:YYYY-MM-DD}}`, `{{date:dddd}}`, `{{date:gggg-[W]ww}}`; resolution context derived from request (creation timestamp, filename without extension, request path, principal-identity). Test: a value containing `"{{date}}"` placed via the substitution context comes through verbatim, not re-substituted. | D6 LOCKED |
| FR-5 | Undefined `{{var}}` references are left literal in output and emit a structured `console.warn`. | Test: rendering `"{{tody}}"` produces literal `"{{tody}}"` in output and a warn log. No exception thrown. | D7 LOCKED |
| FR-6 | When both `body:` and `bodyPath:` are set on the same rule, `bodyPath:` content wins. If `bodyPath:` is unreadable (file missing or read error), fall back to `body:` if set, else empty. Always emit a structured warning when fallback fires. | Tests: both set → bodyPath used; bodyPath missing + body set → body used + warning; bodyPath missing + body absent → empty + warning. | D8 LOCKED |
| FR-7 | `bodyPath:` is resolved relative to the project root (the directory containing `.open-knowledge/`). Recommended location is `.open-knowledge/templates/<name>.md`. Must NOT escape the project root. | Path-traversal test: `bodyPath: "../../etc/passwd"` rejected at template-load time with structured error; create-page falls back to empty (FR-6). | D9 LOCKED |
| FR-8 | **Per-field last-match-wins** among `folders[]` rules. `body:` and `bodyPath:` form ONE logical "body template" field (alternatives — D8). When multiple rules match a path: the LATEST matching rule that SETS either `body:` or `bodyPath:` provides the body template; rules that set NEITHER are transparent for body purposes (parent body template inherited). Explicit empty string (`body: ""` or `bodyPath: ""`) is treated as an INTENTIONAL CLEAR — no template applied at this subtree. Body never concatenates across rules (unlike tags). | Tests: (1) parent `journals/**` with body, child `journals/daily/**` with only `frontmatter.tags` → child path inherits parent body. (2) parent with body, child with `body: ""` → child path gets empty file. (3) parent with `bodyPath:`, child with `body:` → child's `body:` wins (one logical field). (4) parent with body, child with body → child wins (Case 2 in §9 nested-folder narrative). | D10 LOCKED — extends FR-8 with per-field semantics matching existing OK `frontmatter:` per-field merge |
| FR-9 | Materialization runs AFTER agent identity is established in the create-page flow, so `{{user}}` resolves to the **principal-identity display name** (per D11). | Test: principal-attributed create → `{{user}}` resolves to that principal's display name; non-principal create (agent-only, file-system, etc.) → `{{user}}` resolves to empty + emits `body-template-user-unresolved` warn. | D11 LOCKED |
| FR-10 | If the rendered template begins with a `---` YAML frontmatter block AND the rule's `frontmatter:` field is also set, the two are merged at materialization time using the existing per-folder rule semantics: **template-body scalars override rule scalars** (the template body becomes the file's initial frontmatter, and per existing OK semantics file frontmatter wins per-scalar over folder-rule frontmatter). Tags concatenate (rule tags + template tags, dedup, first-occurrence preserved). Result is ONE merged frontmatter block in the materialized file. | Test fixtures cover three combinations: rule-frontmatter-only / template-body-frontmatter-only / both with overlapping keys. Verifies template scalars beat rule scalars; tags concat without duplicates. | D12 LOCKED (corrected per audit A-H1) |
| FR-11 | Workspace `.open-knowledge/config.yml` ships a commented-out daily-journal example block (and an `external-sources/**` example) demonstrating the feature in the existing examples-style. | Visible diff in `.open-knowledge/config.yml` after the change. | D13 LOCKED |
| FR-12 | `set_folder_rule` MCP tool accepts `body:` and `bodyPath:` arguments and persists them through the existing `applyFolderRulesUpsert` primitive with YAML round-trip + comment preservation. | Existing `apply-folder-rules-upsert.test.ts` extended with cases that include `body:` and `bodyPath:`. YAML output preserves block-scalar form for multi-line bodies. | D14 DIRECTED |
| FR-13 | Template content (after `bodyPath:` load) MUST be ≤64KB. Templates exceeding the limit → reject + emit `body-template-too-large` warn + fall back to empty. | Test: a 100KB template rejected; 60KB template accepted; warn event fires with byte count. | NEW (audit A-M3) |
| FR-14 | The bundled OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`) is updated to teach agents about the body-template mechanism — extending the existing "Folder structure + metadata" section. The skill carries MECHANISM only (trigger, opt-out, variable inventory); concrete templates live in project `config.yml` per the existing skill-vs-policy split. | Skill section gains: (1) one paragraph + one example showing `body:` / `bodyPath:` alongside `frontmatter:`, (2) the "empty-body opt-out" rule for agents calling `create_page`/`write_document`, (3) the variable inventory list (`{{date}}`, `{{date:FORMAT}}`, `{{title}}`, `{{path}}`, `{{user}}`). Existing `description: ...` and 1024-char SKILL.md frontmatter limit not exceeded. | D20 LOCKED |

### Non-functional requirements

- **Performance:** Template render path adds ≤1ms median latency to `POST /api/create-page` for inline-string templates ≤2KB. `bodyPath:` resolution is one synchronous file read; templates are not cached in MVP (cache is a follow-up if/when needed).
- **Reliability:** Template render errors NEVER block file creation. Errors fall back to empty file + structured warning (existing behavior preserved). FR-2 + FR-6 + FR-9 cover the error envelope.
- **Security/privacy:** No JS execution (NG1). `bodyPath:` path-traversal-rejected (FR-7). Variable substitution is plain string replacement with date formatting; no template-engine vulnerabilities to harden against. `{{user}}` resolves to display names already exposed in attribution; no PII escalation.
- **Operability:** Structured warnings on undefined vars (FR-5), `bodyPath:` fallback (FR-6), and path-rejection (FR-7) use the existing `console.warn(JSON.stringify({event, ...}))` convention so they're countable in aggregate. No new metrics in MVP.
- **Cost:** Zero new dependencies. `picomatch` already present. moment-format substitution can use a tiny inline date-format implementation OR the `dayjs` dep if already present (verify in implementation; fall back to inline if not — see Open Question Q4).

## 7) Success metrics & instrumentation

- **Metric 1: Adoption — folder rules with body templates set.** Count of `folders[]` rules in shipped `.open-knowledge/config.yml` files (across user repos sampled via OK telemetry, if any) that have `body:` or `bodyPath:` set. Baseline: 0 (feature doesn't exist). Target: organic uptake; not a hard threshold. Instrumentation: optional, low-priority.
- **Metric 2: Reliability — template render failures.** Count of `console.warn` events with `event: "body-template-render-error"` per 1000 create-page calls. Baseline: 0. Target: <1 per 1000 (most renders should succeed).
- **What we will log/trace:** `body-template-render-error` (template render exception caught), `body-template-undefined-var` (variable not resolved), `body-template-path-rejected` (bodyPath traversal-rejected), `body-template-fallback` (bodyPath unreadable, body used or empty fallback).
- **How we'll know adoption/value:** User feedback in issues / Discord / direct conversation. Not metric-gated for MVP.

## 8) Current state (how it works today)

- `folders[]` rules are defined in `config.yml`, validated by `FolderRuleSchema` in `packages/core/src/config/schema.ts`. Each rule has `match` (glob) and `frontmatter` (title/description/tags).
- Folder-rule data is consumed at MCP-read-time as virtual overlay only — `packages/cli/src/mcp/tools/exec.ts:496`, `read-document.ts:144`, `search.ts:150`. No runtime materialization to disk happens.
- `POST /api/create-page` (`packages/server/src/api-extension.ts:~4080-4187`) writes empty content when creating a new file (line 4133: `const initialContent = ''`).
- The closest existing precedent for "body content per folder" is the `STARTER_FOLDERS` + `LOG_MD_TEMPLATE` pair in `packages/server/src/seed/starter.ts` — hardcoded, one-shot via `ok seed`, not configurable.
- Workspace `.open-knowledge/config.yml` ships 8 commented-out `folders[]` rules with `frontmatter:` only (specs/**, reports/**, stories/**, etc.).

**Constraints:**
- STOP rule: "no OK sidecars in user-content paths" (CLAUDE.md). Templates live in `config.yml` or `.open-knowledge/templates/`.
- STOP rule: "ConfigSchema leaves: `.register(fieldRegistry, ...)` BEFORE `.optional()`/`.default()`/`.nullable()`" (CLAUDE.md). New fields must follow the registration discipline.
- Glob lib: `picomatch` already used by `ContentFilter`. New code uses the same lib + options for consistency.

**Known gaps discovered during research:**
- The `reports/config-driven-folder-frontmatter/REPORT.md` claim that "frontmatter is materialized to disk at create time" is **incorrect** — verified by reading `packages/cli/src/mcp/tools/{exec,read-document,search}.ts` and the QA-002 test in `exec.test.ts`. `frontmatter:` today is purely a virtual overlay. The asymmetry between this and the proposed body-template materialize-at-create behavior is captured in §10 D2 + §11 Q1.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Editor "New file":** unchanged UX; under the hood, creating a new file at a templated folder path produces the materialized content. Visual indication of "template applied" is not MVP (NG-style — addable later).
- **Workspace `.open-knowledge/config.yml`:** ships two new commented-out example rules — `journals/daily/**` (Obsidian-canonical journal) and `external-sources/**` (Karpathy-style ingest). Existing 8 `folders[]` rules unchanged. Comment block above the new examples documents the variable inventory + the file-ref escape hatch.
- **MCP tools:**
  - `set_folder_rule`: extended to accept `body` and `bodyPath` args.
  - `write_document` / `create_page`: behavior change is invisible to the agent unless the target rule has a body template — then a no-body create produces a populated file.
  - `get_config`: returns the new fields naturally via the schema.
  - `set_config`: accepts patch updates including `body`/`bodyPath`.
- **CLI:** no new commands. `ok start` and `ok mcp` see the new fields through the shared schema. `ok seed` integration is NOT MVP (D15).
- **Docs/onboarding:** docs site (`docs/`) gets a "Body templates" page covering: variable inventory, inline vs file-ref, examples (daily journal + Karpathy ingest), precedence rules. (Doc updates are minor and planned with the implementation, not a separate spec.)
- **Bundled OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`):** updated per FR-14 / D20 / D21. The existing `## Folder structure + metadata` section gains a body-template extension covering: (1) the `body:` and `bodyPath:` fields alongside `frontmatter:` with one example, (2) the "empty-body opt-out" rule for agents creating files via MCP, (3) the variable inventory (`{{date}}`, `{{date:FORMAT}}`, `{{title}}`, `{{path}}`, `{{user}}`). Per the skill-vs-policy split, the skill teaches the mechanism only; per-project template content lives in `config.yml`. Skill ships in the same PR as the server-side implementation (D21).
- **Error messages:** structured `console.warn` events per FR-5/FR-6/FR-7. No user-facing dialogs.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `POST /api/create-page` | HTTP API | Materialization happens; no rule = empty file; matching rule = substituted content |
| MCP `write_document` | MCP | Empty body + non-existent path + matching rule → template applied; non-empty body → agent body wins |
| MCP `create_page` | MCP | Same as `write_document`; mirrors HTTP route |
| MCP `set_folder_rule` | MCP | Accepts `body`/`bodyPath` params; persists via YAML round-trip |
| MCP `get_config` / `set_config` | MCP | Round-trips new fields through the existing patch flow |
| Editor "New file" command | App UI | Newly created files in templated folders open populated |
| Settings pane | App UI (out of MVP) | Body-template field UI is NOT MVP; addable later via existing config-edit pipeline |

### System design

- **Architecture overview:** Two new optional fields on `FolderRuleSchema`; one new shared resolver in core (`packages/core/src/config/folder-rule-resolver.ts` per D23) exposing **layered composable primitives** for folder-rule inheritance — L1 (folder-only merge), L2 (compose with file frontmatter), L3 (read-time convenience wrapper). Body-template materialization (`packages/server/src/body-template.ts`) consumes **L1 only** because no file exists at create-time. The resolver is **the single source of truth for folder-rule inheritance** and is used by body templates today; existing MCP virtual-overlay sites (which currently inline both layers ad-hoc per `mcp/tools/{exec,read-document,search}.ts`) can migrate to L3 or L1+L2 in a follow-on (NG11). Insertion point at `POST /api/create-page` (and equivalent MCP write paths) immediately after agent-identity extraction and before the first `writeFileSync`.
- **Data model:** `FolderRuleSchema` gains two `z.string().optional()` fields, both `.register(fieldRegistry, ...)` BEFORE `.optional()` per STOP rule. No new Y.Doc shape, no new persistence-layer changes, no schema migration (purely additive).
- **API/transport:** No new HTTP routes. Existing routes' payloads unchanged — the materialized content is what's written to disk; HTTP responses unchanged.
- **Auth/permissions:** Identical to existing create-page handler. `extractAgentIdentity(body)` already runs at entry per attribution-sweep coverage.
- **Enforcement point(s):** Single materialization site in `body-template.ts` consumed by `create-page` HTTP handler + MCP write tools. No second template-render site is allowed (precedent #1 + #14 mindset — only ONE place that owns this transform).
- **Observability:** Four structured warnings (`body-template-render-error`, `body-template-undefined-var`, `body-template-path-rejected`, `body-template-fallback`). Existing `traced*` wrappers from `packages/server/src/fs-traced.ts` cover any `bodyPath:` file reads.

#### Data flow diagram

- **Primary flow:** Create request lands → identity extracted → folder-rule resolution (last-match-wins, picomatch) → template content loaded (`body:` inline OR `bodyPath:` file read) → variable substitution context built (date/title/path/user) → render → write file with rendered content.
- **Shadow paths to test:**
  - **nil / missing:** No matching rule → empty file (regression baseline — current behavior preserved).
  - **empty:** Matching rule with `body: ""` → empty file. Matching rule with `bodyPath:` → empty file → empty file (no warning, intentional empty body).
  - **wrong type:** Schema rejects non-string `body:`/`bodyPath:` at config-load time before this code runs.
  - **timeout:** N/A — synchronous path, no upstream calls.
  - **conflict:** File already exists → `EEXIST` returned by `writeFileSync({flag: 'wx'})` → 409 response (current behavior preserved; template never participates).
  - **partial failure:** Template render throws → catch, warn, fall back to empty file, continue. Path-traversal in `bodyPath:` → reject template, warn, fall back to empty (or `body:` inline if set).

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Folder-rule resolver | Glob match throws | try/catch around picomatch call | Treat as "no rule matches" → empty file | Current behavior; no template applied |
| Template loader (`body:` inline) | `body:` value too large (e.g., 1MB+) | Length check at render time | Reject + warn + fall back to empty | Logs the issue; user adjusts config |
| Template loader (`bodyPath:` file-ref) | File missing | `existsSync` / `readFileSync` ENOENT | Fall back to `body:` inline if set, else empty + warn | Logs "bodyPath unreadable, fallback applied" |
| Template loader (`bodyPath:` file-ref) | File outside project root | path normalization + prefix check | Reject + warn + fall back | Path-traversal blocked |
| Variable resolver | Undefined `{{var}}` | render-time keyset check | Leave literal + warn | User sees `{{tody}}` in their file; warns about typo |
| Variable resolver | `{{date:BAD_FORMAT}}` | format-token validation | Format error: leave literal + warn | User sees raw `{{date:BAD}}` |
| Materialization | `writeFileSync` throws (disk full, perm) | existing `EEXIST` catch + general error catch | Current 500 path | Current behavior; no template-specific handling |
| MCP write_document | Agent body present | length check after `stripFrontmatter` | Agent body wins; template not applied | Agent intent honored |

#### Nested folders — how multiple matching rules compose

OK's existing `folders[]` rules already compose by depth (parent rule + more-specific child rule both match a deep path). Body templates extend this with **per-field last-match-wins**, treating `body:`/`bodyPath:` as one logical field.

| Case | Setup | What materializes | Reasoning |
|---|---|---|---|
| **1: One rule, deep glob** | `match: "specs/**"` only | parent's template | Single match. |
| **2: Parent + child, both set body** | parent `body:A`, child more-specific `body:B` | child's template (`B`) | Last-match wins. |
| **3: Child narrows for tags only — no body field** | parent `body:A`, child `frontmatter.tags:[x]` | parent's template (`A`) inherited | Child has no body field set → transparent for body purposes. Per-field merge (matches existing `frontmatter:` semantics). |
| **4: `body:` and `bodyPath:` mixed across rules** | parent `bodyPath:.../journal.md`, child `body:"..."` | child's `body:` (one logical field; child's setting shadows parent's body template entirely) | `body`+`bodyPath` are alternatives, not orthogonal — one logical field for last-match-wins purposes. |
| **5: Explicit clear** | parent `body:A`, child `body:""` | empty file | `body: ""` is an intentional opt-out, not "inherit." Useful for noisy subtrees. |
| **6: Tags + body interaction** | parent `body:A` + `tags:[x]`, child `tags:[y]` (no body) | parent body `A`; merged tags `[x, y]` (concat per existing OK rules) | Body and frontmatter compose independently — tags concat per existing semantics; body inherits per-field. |

The mental model: each field on `folders[]` rules merges independently using its own merge rule. Tags concat. Scalars (title/description/body/bodyPath) last-match-wins. `body`+`bodyPath` are ONE logical field for the body merge.

### Alternatives considered

- **Option A — `body:` field only (no `bodyPath:`).** Simpler: one place to look, one syntax. Rejected: long templates (50+ lines) become unwieldy as YAML block scalars; users coming from Hugo archetypes / Obsidian template files expect file-ref. **Why rejected:** ergonomics on >20-line templates is bad enough to push users to inline workarounds.
- **Option B — `bodyPath:` field only (templates always file-references).** Forces users into a templates folder; no inline option. Rejected: trivial 3-line scaffolds become a 2-file ceremony. **Why rejected:** "make easy things easy."
- **Option C — Migrate `frontmatter:` to materialize-at-create (D2 alternative).** Symmetric model: both `frontmatter:` and `body:` materialize. Considered but explicitly NOT MVP — see D2. The asymmetry is documented in Q1; the user can direct migration as a follow-up after MVP ships.
- **Option D — Templater-style `<% expr %>` syntax with JS execution.** Most powerful. Rejected as NG1 (security + complexity).
- **Option E — Hugo-style `{{ .Date }}` Go-template syntax.** Familiar to Hugo users. Rejected: smaller user overlap with OK's audience than Obsidian's `{{date}}` syntax.
- **Option F — A separate top-level `templates:` config block (decoupled from `folders[]`).** Allows multiple templates with names, chooser semantics. Rejected for MVP: introduces a second binding layer (`folder → template name`) that's overkill for one-template-per-folder. Cleanly addable later via Option F's shape if multi-template-per-folder demand emerges (NG5).
- **Option G — Templates as Y.Docs in OK itself (CRDT templates).** Templates are markdown that OK already edits — why not store them as docs? Rejected: privileges editor-running for template resolution; breaks `bunx open-knowledge mcp`-only workflows; couples agent attribution to template authorship in confusing ways.

**Why we chose the proposed solution:** Two-field surface (`body:` + `bodyPath:`) covers the inline-vs-file-ref ergonomics tradeoff cleanly, mirrors the Obsidian Daily Notes template-path setting and Hugo archetypes file-ref pattern, and reuses OK's existing `folders[]` precedence/glob/edit machinery without introducing a new abstraction.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Schema: extend `FolderRuleSchema` with optional `body: string` and `bodyPath: string` siblings to `frontmatter:`. Both registered in `fieldRegistry` BEFORE `.optional()`. | T | LOCKED | Yes (config public surface) | Sibling fields preserve the existing `folders[]` mental model; one rule, all defaults. Hugo/Templater/Notion DB templates all use parallel structure. | [evidence/code-investigation.md](./evidence/code-investigation.md), [grounding report §D2-D3](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md) | Schema bump non-breaking; all existing configs valid. |
| D2 | This spec does NOT migrate `folders[].frontmatter` from virtual overlay to materialize-at-create. Body templates are the first materialize-at-create feature; frontmatter migration (and the dual-truth case for rules with both `frontmatter:` AND `body:` set — see Q1) is a separate concern with its own 1-way-door risk and gets a follow-up spec. | X | LOCKED for this spec's scope | Yes (semantic boundary for existing field) | Migrating frontmatter would be a 1-way door affecting every existing OK install with `frontmatter:` set. Body templates are net-new and don't carry that risk. The narrow "materialize frontmatter ONLY when same rule has body template" middle-path option is surfaced for user direction in Q1. | Verified by reading `mcp/tools/{exec,read-document,search}.ts` virtual-overlay sites + QA-002 test. | Until Q1 resolves, rules with both `frontmatter:` and `body:` produce on-disk content WITHOUT the rule's frontmatter — only `frontmatter:` blocks INSIDE the body template's `---` segment land on disk. Documented in §5 + Q1 + design-challenge C4. |
| D3 | Materialization site: `POST /api/create-page` HTTP handler in `packages/server/src/api-extension.ts`. Same module owns the logic; one render path. | T | LOCKED | No | Single insertion point keeps observability, attribution, and error handling consistent. Mirrors precedent #14 (only-one-implementation pattern). | [evidence/code-investigation.md](./evidence/code-investigation.md) | All MCP write tools route through the same materialization helper. |
| D4 | Materialization site (cont.): MCP `write_document` and `create_page` tools call the same materialization helper with the same "empty body + non-existent target" gate. | T | LOCKED | No | Consistency across create surfaces. Agent-side `create_page` with no body is the dominant "I'm creating a doc on behalf of the user" shape; opting into templating by default matches user expectations. Agents that want strict-verbatim creation supply a non-empty body (which always wins) — the empty-body gate IS the agent's opt-out mechanism. | [grounding report §D3](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md), design-challenge C3 | Spec applies uniformly to all create paths; agents inherit user shape preferences without re-implementing scaffolds per agent. |
| D5 | Definition of "body is empty" for MCP `write_document` template-application gate: after `stripFrontmatter()` on the agent-supplied content, if the body portion is whitespace-only (regex `/^\s*$/`), treat as empty and apply template. **Edge case (audit A-M2):** when agent sends frontmatter-only with no body (`"---\nfoo: bar\n---\n"`), the agent's frontmatter is preserved and the template body is appended; if the template body itself contains a `---` block, those merge with the agent frontmatter per FR-10 semantics (template-body scalars override rule scalars; agent-supplied frontmatter is the file's "frontmatter at this moment" and remains file-wins). | T | LOCKED | No | Whitespace-only is the user's intent ("no real content"); pure empty string is a strict subset. Matches Hugo archetype "create with no body" pattern. | [grounding report §D3 open question](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md), audit A-M2 | Agents that send `"\n\n"` get the template (intuitive); agents that send `"# something"` win (intuitive); agents that send frontmatter-only get template body appended with frontmatter-merge per FR-10. |
| D6 | Variable syntax: `{{var}}` and `{{var:format}}`. Variables in MVP: `date`, `date:FORMAT` (moment.js tokens), `title`, `path`, `user`. | T | LOCKED | Yes (public template surface) | Obsidian-canonical; lowest cognitive cost for the user-asked use case. Cleanly extensible to `{{prompt:label}}` and `{{cursor}}` later (NG4/NG8). | [grounding report §D2](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md) | Match pattern is simple; no template-engine library needed for MVP. |
| D7 | Undefined variables → leave literal + structured warn. Don't error, don't strip. | T | LOCKED | No | Forward-compatibility: a future variable rolled out before all configs migrate shouldn't break create. Warn so typos surface. | [grounding report §D2](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md) | Slight risk of typos staying in files; warn-log mitigates. |
| D8 | When both `body:` and `bodyPath:` set on same rule: `bodyPath:` wins. If `bodyPath:` unreadable, fall back to `body:` if set, else empty. Always warn on fallback. | T | LOCKED | No | "File is more 'active' than inline string"; fallback ensures no silent failure. | Spec author's call grounded in Hugo + Obsidian Daily Notes precedence. | Inline `body:` becomes a graceful default for short templates with optional file-ref upgrade path. |
| D9 | `bodyPath:` is project-root-relative. Path-traversal (`..`, absolute paths, paths escaping the project root after `realpath`) → reject + warn + fall back. | T | LOCKED | Yes (security boundary) | Path-traversal is a textbook attack surface; OK already does this for `content.dir`. Use existing `realpath`-based check pattern from `symlink-handling-file-sync-crdt`. | CLAUDE.md "Symlinks" section + existing OK realpath pattern | Implementer mirrors existing escape checks. |
| D10 | **Per-field last-match-wins** among `folders[]` rules — matching the existing OK `frontmatter:` semantics. `body` + `bodyPath` are treated as ONE logical "body template" field (since they're alternatives per D8). A more-specific child rule that sets NEITHER `body:` nor `bodyPath:` inherits the parent's body template; one that sets EITHER shadows the parent's whole body template. Explicit empty string is an intentional clear (no template applied). Body never concatenates across rules (unlike tags). **Override direction across all layers: file > more-specific folder rule > less-specific folder rule, for everything that can't combine; tags concat across all layers because lists can combine.** Specific-wins (not general-wins) is deliberate: the whole point of declaring a more-specific rule is to override the general one, and the whole point of putting `title:` in a file's own frontmatter is to override the folder default. Inverting either direction (general beats specific, or folder beats file) breaks the use case that motivated the override in the first place. This matches CSS specificity, Hugo archetype lookup, Obsidian folder-rule semantics, and every nested-config system OK-adjacent users have intuitions for. | T | LOCKED | No | Per-field merge matches the existing `frontmatter:` rule (scalars last-match-wins, tags concat). Per-rule merge would silently lose the parent's body template whenever a user added a more-specific rule for any other field — surprising and a footgun. Treating `body`+`bodyPath` as one logical field reflects that they're alternatives, not orthogonal. Explicit empty as opt-out is a useful escape hatch (e.g. `journals/scratch/**` with `body: ""` to skip templating in a noisy subtree). The specific-wins / file-wins direction is the only one that doesn't invert user intent. | `.open-knowledge/config.yml` lines 50-58 (existing per-field merge); user-surfaced nested-folder gap | Users can layer general rules with specific overrides without footguns. |
| D11 | `{{user}}` resolves ONLY to the **principal-identity display name**. If no principal identity is established (agent-only, file-system, git-upstream, openknowledge-service writer types), resolves to empty and emits `body-template-user-unresolved` warn. **Agent display name is intentionally NOT in the chain** — the user's daily journal shouldn't end up with `author: Claude Code`. | T | LOCKED | No | Per design-challenge C6: leaking agent client name into user-owned content is a semantic mismatch. The user is the user. If the writer isn't a principal, leave `{{user}}` empty rather than substitute a confusing default. | CLAUDE.md "writer-ID taxonomy" + design-challenge C6 | Templates that depend on `{{user}}` produce an empty string in non-principal writes; warn fires for traceability. |
| D12 | Frontmatter merge semantics when template body has its own `---` block: merge with rule's `frontmatter:` field per existing semantics — **template-body scalars override rule scalars** (template body becomes the file's initial frontmatter; existing OK rule says file frontmatter wins per-scalar over folder-rule frontmatter). Tags concatenate (rule tags + template tags, dedup, first-occurrence). | T | LOCKED (corrected per audit A-H1) | No | Single mental model: the rule's `frontmatter:` is the default; template `---` is the file's initial state; existing per-scalar precedence (file > folder) holds. The earlier draft had this inverted. | `.open-knowledge/config.yml` header comment lines 55-58, audit A-H1 | Materialization writes ONE merged frontmatter block to disk. (Note: only the part of frontmatter inside the template body's `---` lands on disk in MVP — the rule's `frontmatter:` stays virtual overlay per D2 until Q1 resolves.) |
| D13 | Workspace `.open-knowledge/config.yml` ships two new commented-out example rules: a `journals/daily/**` daily-journal example and an `external-sources/**` Karpathy-ingest example. | P | LOCKED | No | The existing 8 `folders[]` rules already document via commented examples; new feature follows established pattern. Onboarding is "look at the examples, uncomment one." | Existing config style | Adoption signal for users. |
| D14 | `set_folder_rule` MCP tool accepts `body`/`bodyPath` args; persists via existing `applyFolderRulesUpsert` with YAML comment-preservation round-trip. | T | DIRECTED | No | Implementer extends args + Zod schema in MCP tool; round-trip primitive already handles unknown keys via Zod `looseObject`. | [evidence/code-investigation.md](./evidence/code-investigation.md), [reports/config-edit-paths/REPORT.md](../../reports/config-edit-paths/REPORT.md) | Multi-line body becomes YAML block-scalar; existing round-trip lib (`yaml@2`) handles. |
| D15 | `ok seed` does NOT ship `body:` defaults for `STARTER_FOLDERS` in this spec. Seed integration is a follow-up. | P | LOCKED | No | Keeps MVP scope tight; the seed scaffolder already has its own design surface and one-shot semantics. Adding body templates to it requires touching `STARTER_FOLDERS[].body` schema and `LOG_MD_TEMPLATE` legacy migration — separate concerns. | Spec author's scope call | `LOG_MD_TEMPLATE` continues to ship as today's static string. |
| D16 | No template caching in MVP. Templates loaded fresh from disk on each create-page (negligible latency for typical sizes). | T | DIRECTED | No | Premature optimization. If `bodyPath:` proves to be a hot path with large templates, add a cache later — invalidation hook needed (file watcher already runs on `.open-knowledge/templates/`). | NFR performance budget | Easy to add later; no API impact. |
| D17 | No re-application of templates to existing files (NG2). Materialization is at creation only. | P | LOCKED | Yes (spec scope boundary) | Re-running a template on existing content needs conflict resolution UX that's a different feature shape. | [grounding report MVP locks](../../reports/per-doc-body-templates-karpathy-journals/REPORT.md) | "Scaffold this existing file" is a future spec if needed. |
| D18 | Per-user vs per-workspace templates: both supported via existing config precedence (`~/.open-knowledge/config.yml` user-level → `./.open-knowledge/config.yml` workspace-level). Workspace overrides user. | T | LOCKED | No | Existing OK config precedence; nothing new needed. | [reports/config-driven-folder-frontmatter/REPORT.md](../../reports/config-driven-folder-frontmatter/REPORT.md) | Users can ship their own daily-journal template across all projects via user-level config. |
| D19 | Telemetry: 4 structured `console.warn` events (`body-template-{render-error,undefined-var,path-rejected,fallback}`) + `body-template-too-large` (FR-13) + `body-template-user-unresolved` (D11). No new metrics in MVP. | T | DIRECTED | No | Existing logging convention (CLAUDE.md "Logging conventions"); structured-JSON style for events that may be aggregated. | CLAUDE.md "Logging conventions" | Implementer wires the six events. |
| D20 | The bundled OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`) MUST be updated to teach agents about body-template behavior. Skill carries MECHANISM (trigger, opt-out, variable inventory); concrete per-project templates remain in `config.yml`'s `folders[].body`/`bodyPath:` per the existing skill-vs-policy split (memory: "OK skill carries mechanism; seeded files carry policy"). | P | LOCKED | Yes (skill is the agent-facing public surface; what's in it shapes how every MCP-using agent behaves) | Without the skill update, agents calling `write_document`/`create_page` with empty body would be surprised when files land populated — and would have no way to discover the variable inventory or the empty-body opt-out. The skill is the agent's manual; new mechanism MUST land in the manual. | Memory `feedback_skill_vs_policy_split.md`; existing skill at `packages/server/assets/skills/open-knowledge/SKILL.md:156-184` already documents `folders[].frontmatter` — same section gains the body-template extension. | The skill is shipped via the MCP server's skill-install path (`reports/mcp-server-auto-install-harnesses/`); skill version bump propagates to all clients on next install/refresh. The 1024-char SKILL.md frontmatter limit + total-skill-size budget must be respected — extension is text-only, no new sections. |
| D21 | The skill update is **bundled with this spec's implementation** (single PR); it does NOT ship as a follow-on. | P | LOCKED | No | Releasing the mechanism (server/MCP code) without the agent-facing manual update would create a documentation gap window where agents trip on the new behavior. Bundled = the manual ships with the change. | Standard skill-update pattern in OK | Implementer's PR touches both `packages/server/src/body-template.ts` (and adjacent code) AND `packages/server/assets/skills/open-knowledge/SKILL.md` in the same change. |
| D22 | Body templates do NOT stack across nested matching rules. Last-match-wins (per D10's per-field merge); the latest matching rule that sets a body template fully shadows any parent's body template. Implicit stacking (parent-then-child concatenation) is a deliberate non-goal — see NG10. | T | LOCKED | No | Stacking sounds composable but: (1) two `---` frontmatter blocks would need a meta-merge layer; (2) ordering (parent-on-top vs child-on-top) has no obvious right answer per use case; (3) variable substitution context becomes ambiguous (substitute then concat, or concat then substitute); (4) prior art (Hugo / Daily Notes / Templater / Notion) doesn't stack — one scope = one template; (5) common case is one template per folder, optimizing for stacking taxes the common case. Users wanting shared scaffolding can compose via `bodyPath:` referencing a common template file from multiple specific rules. | Cross-tool prior art in `reports/per-doc-body-templates-karpathy-journals/REPORT.md` §D2; user discussion 2026-04-30 | Future spec can add opt-in `bodyPrepend:` / `bodyAppend:` if a real use case emerges — additive, doesn't reshape MVP. (Future Work — Identified.) |
| D23 | Build a **shared inheritance/merge resolver** in `packages/core/src/config/folder-rule-resolver.ts` exposing **layered composable primitives** — NOT one monolithic function. Two distinct merge layers exist; the resolver exposes each as its own primitive plus a convenience wrapper: **(L1) `resolveFolderRulesForPath(filePath, rules): MergedFolderRule`** — folder-rule layer only (no file required). **(L2) `mergeWithFileFrontmatter(folderRule, fileFm): EffectiveFrontmatter`** — composes layer 1 with the file's own frontmatter (file wins per-scalar; tags concat per existing semantics). **(L3) `resolveEffectiveForFile(filePath, rules, fileFm): EffectiveFrontmatter`** — convenience wrapper for read-time consumers (calls L1 then L2). Body templates consume **L1 only** (no file exists at create-time). MCP virtual-overlay sites would consume L3 (or L1+L2) when they migrate (NG11). Folder enrichment (e.g., `ls foo/` describing a folder) consumes L1 only (folders have no file frontmatter). | T | LOCKED | No (interface, not behavior) | Layered primitives are MORE generic than a monolithic function: (1) body-template materialization at create-time genuinely doesn't have a file to merge — forcing a single API to handle "optional file frontmatter" makes one function pretend to be three; (2) different consumers want different layer compositions — separate primitives let each consumer pick the right one without branching; (3) Q1's three options become **call-site decisions, not resolver changes** — option (a) virtual: body site uses L1, virtual-overlay uses L1+L2; option (b) narrow materialization: body site uses L1 + materializes folder frontmatter when rule has both fields set; option (c) full migration: body site always materializes L1's frontmatter. Resolver itself doesn't change in any of the three; only call patterns do. (4) Per-field merge functions (`mergeScalar`, `mergeTags`, `mergeBodyTemplate`) are internal helpers, exported for testing. | User architectural direction 2026-04-30; existing per-tool merge sites at `mcp/tools/{exec,read-document,search}.ts` (which currently inline both layers ad-hoc) | Implementer MUST go through the resolver (no inlined merge logic at any call site). Body-template module imports L1 only. Future migration of virtual-overlay sites adopts L3 or L1+L2 without behavior change. The Q1 follow-up changes call patterns at the create-page handler, NOT resolver internals. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Resolve the frontmatter virtual-vs-materialized dual-truth case for rules with both `frontmatter:` AND `body:` set. Three options: **(a)** Stay as drafted — only template body materializes; `frontmatter:` field stays virtual overlay (current D2 LOCKED). **(b)** Narrow materialization — when a rule has BOTH `frontmatter:` and `body:`/`bodyPath:`, materialize the rule's `frontmatter:` AS WELL at create time; rules with `frontmatter:`-only stay virtual-overlay-only. Closes the dual-truth gap for the templated case without migrating the global semantic. **(c)** Full migration — always materialize `frontmatter:` at create-time; deprecate the virtual overlay path (separate spec). | X | P0 (within MVP) | No (recommended option doesn't gate any other decision) | **Recommendation: (b)** — narrow materialization. Defensible middle path: small scope expansion (~30 LOC), preserves backwards-compat for `frontmatter:`-only rules, closes the dual-truth gap exactly where the user opted into templating. **(a)** is current draft; **(c)** is bigger scope (separate spec). User direction needed before finalization. | Open — needs user direction |
| Q2 | Should the workspace config.yml example block include a `bodyPath:` example referencing `.open-knowledge/templates/daily.md`, or only inline `body:` examples? | P | P2 | No | Default to inline-only in MVP examples (simpler onboarding); document `bodyPath:` in docs. Promote to MVP if user requests. | Recommend inline-only |
| Q3 | Do we want to ship a starter `.open-knowledge/templates/daily.md` reference template alongside the spec? | P | P2 | No | NO for MVP — empty `.open-knowledge/templates/` would set precedent for un-shipping; user creates their own when they uncomment a `bodyPath:` example. | Recommend NO |
| Q4 | Implementer choice: inline date-format helper (~30 lines) vs adding `dayjs` as a dep. | T | P2 | No | DELEGATED to implementer. If `dayjs` already transitively present, prefer it; else inline. The variable inventory is small enough that an inline helper is reasonable. | Delegated |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `picomatch` already in the dependency graph and matches OK's existing glob semantics for `folders[]` rules. | HIGH | Verified via `packages/server/src/content-filter.ts:13`. | At finalization | Verified |
| A2 | `extractAgentIdentity(body)` is called early enough in the create-page handler that `{{user}}` resolution has principal-identity available before materialization runs. | HIGH | Verified by reading `api-extension.ts:4096-4102` — identity extraction happens at line 4102 before file write at line 4135. | At finalization | Verified |
| A3 | `applyFolderRulesUpsert` + the `yaml@2` round-trip pipeline preserve YAML block-scalar form for multi-line `body:` values. | MED | `apply-folder-rules-upsert.test.ts` extension covers this (FR-12 acceptance). Implementer verifies with a >5-line `body:` test fixture. | At implementation | Verify via test |
| A4 | The existing virtual-overlay sites in MCP tools (exec, read-document, search) won't accidentally include `body:`/`bodyPath:` fields in their enrichment payloads. | MED | Implementer adds explicit field-allowlist in enrichment helpers (or verifies serialization filters these). Coverage test: enrich a directory; assert `body`/`bodyPath` not in response. | At implementation | Verify via test |
| A5 | The "body is empty" definition (D5: whitespace-only after stripFrontmatter) matches what every existing MCP `write_document` caller expects. | MED | If a current caller relies on whitespace-body NOT being templated, a regression risk exists. Mitigation: `write_document` template application gates on BOTH (a) target file does not yet exist AND (b) body is whitespace-only — existing callers writing to existing files are untouched. | At implementation | Mitigated |

## 13) In Scope (implement now)

- **Goal:** Ship `body:` + `bodyPath:` per-rule schema fields + materialization at create-page (HTTP + MCP) with FR-1 through FR-12 satisfied.
- **Non-goals:** §3 NG1-NG9.
- **Requirements with acceptance criteria:** see §6.
- **Proposed solution:** see §9.
- **Owner(s)/DRI:** Tim Cardona.
- **Next actions (tickets/tasks):**
  1. Schema extension in `packages/core/src/config/schema.ts` (FR-1).
  2. **Shared inheritance resolver** in `packages/core/src/config/folder-rule-resolver.ts` exporting three layered primitives (D23): **L1** `resolveFolderRulesForPath(filePath, rules): MergedFolderRule` (folder-only merge — what body templates need); **L2** `mergeWithFileFrontmatter(folderRule, fileFm): EffectiveFrontmatter` (composes with file's own frontmatter); **L3** `resolveEffectiveForFile(filePath, rules, fileFm): EffectiveFrontmatter` (convenience wrapper for read-time consumers). Per-field merge helpers (`mergeScalar`, `mergeTags`, `mergeBodyTemplate`) internal but exported for testing (D23, FR-8, FR-10).
  3. Materialization helper module (`packages/server/src/body-template.ts`) with: `loadTemplateContent(merged, contentDir)`, `renderTemplate(content, ctx)`, `buildSubstitutionContext(req)`. Imports **L1 only** from the resolver — no file frontmatter to merge at create-time. Does NOT re-implement folder-rule merging (FR-2 through FR-11).
  3. Wire helper into `POST /api/create-page` handler (FR-2).
  4. Wire helper into MCP `write_document`/`create_page` tools (FR-3, D5).
  5. Extend `set_folder_rule` MCP tool with `body`/`bodyPath` args (FR-12).
  6. Update workspace `.open-knowledge/config.yml` with two new commented examples (FR-11).
  7. **Update bundled OK skill at `packages/server/assets/skills/open-knowledge/SKILL.md` per FR-14 / D20 / D21** — same PR as server changes.
  8. Schema-jsonschema tests, unit tests, integration tests, fidelity test (acceptance criteria for each FR).
  9. Docs page in `docs/` covering body templates (variable inventory + examples).
- **Risks + mitigations:** see §14.
- **What gets instrumented/measured:** four `console.warn` event types (D19).

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing configs without `body:`/`bodyPath:` | Schema fields are optional; legacy rules parse unchanged. | Existing config-load tests pass; add a fixture covering "rule with no body fields." |
| Existing files in templated folders | Templates are creation-only; existing files untouched. | Integration test: create rule with body template; existing file in folder unchanged on next save. |
| User-level config (~/.open-knowledge/config.yml) carrying templates | Existing precedence rules apply; workspace overrides user. | Test: user-level body template; workspace adds different body for same glob → workspace wins. |
| Backwards compat: `folders[].frontmatter` virtual overlay | Unchanged. New body materialization is purely additive. | Existing virtual-overlay tests (QA-002 in `exec.test.ts`) pass unchanged. |
| Coordination with `ok seed` | Seed unchanged in this spec (D15). LOG_MD_TEMPLATE continues as today. | Seed tests pass unchanged; STARTER_FOLDERS untouched. |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Frontmatter-virtual / body-materialized asymmetry confuses users | MED | MED | Clear docs explanation; commented examples don't mix the two semantics; D2 explicitly documents the choice. | Tim |
| `bodyPath:` path-traversal exploit | LOW | HIGH | FR-7 + D9: realpath-based escape check; reject + warn + fall back. Mirror existing `content.dir` escape pattern. | Implementer |
| Variable substitution typo creates silent failure (literal `{{tody}}` in user file) | MED | LOW | FR-5 + D7: structured warn on undefined var; user sees the literal in their file as a visible signal. | Implementer |
| Template render exception blocks file creation | LOW | HIGH | FR-2 + FR-6: template render failures fall back to empty file + warn; create never fails because of templating. | Implementer |
| Asymmetric MCP `write_document` behavior surprises agents | MED | MED | D5 locks the gate definition (target doesn't exist + body whitespace-only); A5 mitigates via the dual gate. Logged in `body-template-fallback` if templating skipped. | Implementer |
| Template field bloat (`body:` + `bodyPath:` + future `bodyTemplates:` array) | LOW | LOW | NG5 explicitly defers multi-template; current two fields cover MVP cleanly. Future fields layer on top. | Tim |
| LOG_MD_TEMPLATE / STARTER_FOLDERS path drift if seed integrates later | LOW | MED | D15 keeps seed untouched; future spec covers the integration with explicit migration path. | Future spec |

## 15) Future Work

### Explored

- **Migrate `folders[].frontmatter` to materialize-at-create.**
  - What we learned: Currently `frontmatter:` is virtual overlay only. Body templates set the precedent for materialize-at-create. Aligning frontmatter would be a cleaner mental model.
  - Recommended approach: Spec a separate migration that adds materialize-at-create to `frontmatter:` while preserving the virtual overlay for read-time enrichment of EXISTING files (so the overlay survives for files that predate the rule).
  - Why not in scope now: 1-way door for an existing semantic; deserves its own spec with migration guidance.
  - Triggers to revisit: User feedback (Q1) that the asymmetry is confusing OR multiple user-side workarounds.
  - Implementation sketch: hoist the materialization helper to apply both `frontmatter:` and `body:`; make virtual-overlay enrichment skip files that have on-disk frontmatter matching the rule's defaults.

- **Seed integration: `STARTER_FOLDERS[]` with `body:` defaults + `LOG_MD_TEMPLATE` migration.**
  - What we learned: `LOG_MD_TEMPLATE` is the ancestor pattern; `STARTER_FOLDERS` already has `frontmatter:` defaults via `starterFolderRule()`.
  - Recommended approach: Add a `body:` field to the `StarterFolder` interface; `starterFolderRule()` writes it through; `ok seed` produces folder rules WITH body defaults.
  - Why not in scope now: D15 — keeps MVP tight; seed has its own design surface.
  - Triggers to revisit: After MVP stabilizes; or when adding a new starter folder kind.
  - Implementation sketch: extend `StarterFolder` interface; update `starterFolderRule()`; add tests; consider whether to retire `LOG_MD_TEMPLATE` constant in favor of a `log.md` body template.

- **Settings pane "Body template" field UI.**
  - What we learned: Existing config-edit pipeline (`reports/config-edit-paths/`) handles YAML round-trip with comment preservation. New textarea field for `body:` per rule.
  - Recommended approach: Add to existing folder-rule editor in Settings pane; multi-line textarea; `bodyPath:` is a path-input field with file picker.
  - Why not in scope now: UI work, separate from core mechanism.
  - Triggers to revisit: User adoption signal.

### Identified

- **`{{prompt:label}}` interactive prompts at file creation (NG4).** Needs editor modal UX; cleanly addable as a new variable form.
- **Multi-template-per-folder + chooser UX (NG5).** Notion/GitHub-issue-templates style.
- **Recurring schedule (NG6).** "Open today's daily note" command + scheduler.
- **`{{cursor}}` placement marker (NG8).** Editor-side coordination needed.
- **Filename-pattern dynamism (related to NG7).** Separable feature; "create today's daily note at `journals/daily/YYYY-MM-DD.md`."
- **Migrate existing MCP virtual-overlay sites to use the shared resolver (NG11, D23).** The new layered resolver in core ships with body templates in MVP. Existing per-tool ad-hoc merge implementations in `mcp/tools/{exec,read-document,search}.ts` (which currently inline both folder-merge AND file-frontmatter-merge) should migrate to **L3** (`resolveEffectiveForFile`) in a follow-on PR — same behavior, single source of truth. Likely bundled with the Q1 follow-up spec since both touch the same code paths.
- **Opt-in body-template stacking via `bodyPrepend:` / `bodyAppend:` (NG10, D22).** If a real use case for layered scaffolding emerges, the additive shape is two new optional fields. Not implicit; users opt in per rule.

### Noted

- **Template testing harness (`ok template render <rule-name>`).** A debug command to render a template against a synthetic context. Useful for development; not core feature.
- **MCP enrichment surfacing of body templates.** When `read_document` returns a file in a templated folder, optionally include the rule's `body:` reference in the response so agents can detect "this folder has a template." Out of MVP; useful for "scaffold this existing file" follow-ups.

## 16) Agent constraints

- **SCOPE:** `packages/core/src/config/schema.ts`, `packages/core/src/config/folder-rule-resolver.ts` (new shared resolver per D23), `packages/cli/src/config/schema.ts` (re-export shim), `packages/server/src/body-template.ts` (new module — consumes resolver), `packages/server/src/api-extension.ts` (`POST /api/create-page` handler), `packages/cli/src/mcp/tools/write-document.ts`, `packages/cli/src/mcp/tools/create-page.ts`, `packages/cli/src/mcp/tools/set-folder-rule.ts`, `.open-knowledge/config.yml` (workspace examples), `packages/server/assets/skills/open-knowledge/SKILL.md` (skill update per D20/D21), tests under `packages/core/src/config/`, `packages/server/src/`, `packages/cli/src/mcp/tools/`, docs under `docs/content/`.
- **EXCLUDE:** `packages/server/src/seed/` (no seed integration this spec — D15), `packages/desktop/` (no desktop-specific work), `packages/app/src/components/Settings*` (no Settings UI this spec — Q3 future work), the existing virtual-overlay enrichment logic in MCP read-side tools (changes there must be reviewed against A4).
- **STOP_IF:**
  - Implementation requires touching the existing `folders[].frontmatter` virtual-overlay path in `mcp/tools/{exec,read-document,search}.ts` for anything beyond the A4 allowlist check → STOP, escalate (D2 boundary). NOTE: the new resolver in core is intentionally consumable by these sites — but adopting it there is OUT of MVP scope (NG11), so don't migrate them in this PR.
  - Body-template merge logic is inlined at the call site instead of going through the shared resolver (D23) → STOP. The resolver MUST be the single source of truth for folder-rule inheritance.
  - Skill update (D20) would push SKILL.md over its 1024-char description limit OR add a new top-level `## ` section → STOP, escalate (FR-14 acceptance: text-only extension to existing "Folder structure + metadata" section).
  - Implementation requires altering the `extractAgentIdentity` flow or any agent-attribution path → STOP, escalate (precedent #25).
  - Implementation requires adding a new field to `FolderRuleSchema` beyond `body:` and `bodyPath:` → STOP, escalate.
  - Implementation requires JS execution / expression evaluation in templates → STOP (NG1 violation).
  - Test coverage gap for any P0 acceptance criterion → STOP, add tests before merge.
- **ASK_FIRST:**
  - New 3P dependency for date formatting (`dayjs`, `date-fns`, etc.) — Q4 is delegated but a new top-level dep is ASK_FIRST.
  - Deciding on the exact path-traversal rejection error message UX (warn-only vs HTTP 400 vs ...) — current spec says warn + fall back to empty.
  - Deciding the inline-vs-file-ref precedence message wording in user-facing warnings.
