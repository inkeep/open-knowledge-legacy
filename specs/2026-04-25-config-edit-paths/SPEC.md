---
title: "Config Edit Paths — Modal UI + MCP Tools + IDE Intellisense over .open-knowledge/config.yml"
status: Draft
owner(s): Nick (CPO/CTO)
created: 2026-04-25
updated: 2026-04-28
baseline_commit: 49eda816
---

# Config Edit Paths — Spec

**Status:** Draft
**Owner(s):** Nick
**Last updated:** 2026-04-28
**Baseline commit:** `49eda816`
**Links:**
- Research report: [`reports/config-edit-paths/REPORT.md`](../../reports/config-edit-paths/REPORT.md) (415 lines, 7 evidence files)
- Spec evidence: [`evidence/`](evidence/)
- Validation-CLI 3P patterns: [`evidence/validation-cli-patterns-3p.md`](evidence/validation-cli-patterns-3p.md)
- Codebase integration points: [`evidence/codebase-integration-points.md`](evidence/codebase-integration-points.md)
- Tim precedents from main: [`evidence/tim-precedents-from-main.md`](evidence/tim-precedents-from-main.md)
- Cmd-K omnisearch 3P research: [`evidence/electron-cmdk-omnisearch-3p.md`](evidence/electron-cmdk-omnisearch-3p.md)
- Empirical Zod toJSONSchema test: [`reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md`](../../reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md)
- **Related work (sibling specs)**: [`specs/2026-04-24-skill-dual-track-install/SPEC.md`](../2026-04-24-skill-dual-track-install/SPEC.md) (Tim's PR #318 — established the dialog-from-multiple-entry-points pattern we mirror; D13 expects our Settings UI to host Install as a row); [`reports/config-driven-folder-frontmatter/REPORT.md`](../../reports/config-driven-folder-frontmatter/REPORT.md) (Tim's PR #297 — design rationale for `folders` array; informs Q6 replace-array UX)

---

## 1) Problem statement

**Situation.** OK's `.open-knowledge/config.yml` (workspace) and `~/.open-knowledge/config.yml` (user-global) is a Zod-validated YAML file controlling content scope, sync cadence, server bind, MCP autoStart, OAuth client ID, persistence debounce, preview URL, folder rules, and MCP tool tuning. It's read at every server boot via a documented precedence chain (Zod defaults → user YAML → workspace YAML → ENV → CLI flags), with a 1s TTL cache for long-lived MCP sessions. The schema is the single source of truth; the file is hand-edited.

**Complication.** There is no validated edit path from anywhere except a human typing YAML in an IDE.

- **Agents (MCP) have zero write capability for config.** `exec` is read-only by design (`tools/exec.ts` allowlist excludes mutating commands). `write_document` mangles non-markdown (mdast pipeline). No other tool reaches the file. Today's fallback is "tell the user to edit the file" or "use unvalidated host file tools that bypass the schema entirely." (Confirmed in prior research: `reports/config-edit-paths/REPORT.md` D4.)
- **The Electron / web React app has no settings surface.** Users wanting to change anything beyond defaults must leave the app, find the file, hand-type YAML, restart the server.
- **Validation is server-only and runs at boot.** Agents and any future UI cannot pre-validate a proposed change before writing.
- **The file watcher does not watch `.open-knowledge/config.yml`.** External edits land silently — no UI re-render, no MCP-session notification, only the next server boot picks them up.
- **No IDE intellisense.** No `$schema` published, no SchemaStore registration, no magic-comment scaffolding. IDE-savvy users who edit in VS Code/JetBrains/etc. get zero autocomplete or validation feedback.

**Resolution.** Three CRUD surfaces over `config.yml`, all backed by one shared `applyConfigPatch` write primitive in `@inkeep/open-knowledge-server`:

1. **Modal Settings UI** in the React app — schema-driven shadcn Dialog rendered by walking the Zod schema directly (no form library). Auto-save model with per-control commit + per-field Reset to default + validate-before-commit. Workspace + user-global scope picker.
2. **MCP tools**: `set_config` (single upsert with deep-partial input + scope param) + `get_config` (read with optional path). Schema-validated agent-callable surface.
3. **CLI + IDE intellisense (Tier 1)**: `ok config validate` standalone command + `# yaml-language-server: $schema=...` magic comment scaffolded by `ok init` + SchemaStore registration. Same Zod schema is the source for all three (via `z.toJSONSchema(target: 'draft-07')`).

**File on disk stays the source of truth.** yaml@2 Document layer preserves comments + formatting through tool-mediated edits. CC1 broadcast on `__system__` Y.Doc fires on file change → live refresh in any open surface.

## 2) Goals

- **G1 — Close the agent-edit gap.** Agents can read AND edit config with full schema validation in one round-trip via MCP tools.
- **G2 — Ship a non-IDE-user UX path.** Electron and web users can edit config from inside the app without leaving for a text editor.
- **G3 — Honor "Electron users never use CLI or other editors."** Every config field is reachable from the Modal — for both workspace and user-global scopes.
- **G4 — Single shared write primitive.** All three surfaces (UI, MCP, CLI) funnel through one validated, comment-preserving write path.
- **G5 — Live-refresh across open surfaces.** External edits (CLI, hand-edit, MCP from another session) propagate to open Modals via CC1.
- **G6 — IDE intellisense as a free side-product.** Tier 1 publishes JSON Schema; IDE-savvy users get autocomplete + validation in their editor of choice (VS Code, JetBrains, Helix, Zed, vim) without OK shipping any extension.
- **G7 — Forward-compat error shape.** Lock the Zod-style `{path: (string|number)[], message, code, severity?}` error shape across all validators (config now, future link/frontmatter validators) so future siblings don't trigger CLI consumer breaking changes.

## 3) Non-goals

- **[NEVER] NG1**: A pluggable validator framework (plugin registry, validator extension API). No prior-art tool in the cohort (Mintlify, Astro, Renovate, actionlint) has one. Premature abstraction risk.
- **[NEVER] NG2**: Routing config edits through the CRDT layer. Config is per-machine local state, not collaborative content. The Y.Doc bridge is for content; config has different semantics (no merge, no awareness, no presence).
- **[NEVER] NG3**: Storing config in JSON internally then re-emitting YAML. The canonical pattern is `yaml.parse() → schema.parse()` directly on the JS object. No prior-art argues for the JSON intermediate (`reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md`).
- **[NEVER] NG10**: Writing OK-managed metadata files anywhere in the user's content tree outside `<contentDir>/.open-knowledge/**`. No per-folder `.frontmatter.yml` sidecars (Shape C from the right-click-folder analysis); no per-doc `.<filename>.metadata.json` companions; no implicit `_meta.json` / `_index.md` (Astro/Hugo style). Folder defaults live in `config.yml`'s `folders[]` array — sole source of truth. **Per-machine principle: OK pollutes nothing in user content.** Should be added to AGENTS.md STOP rules (see proposed wording below).
- **[NOT NOW] NG4**: External link liveness checks (HTTP HEAD probes for URLs in `preview.baseUrl` etc.). No prior-art doc tool does this. — **Revisit if** users report broken-link debugging as a pain.
- **[NOT NOW] NG5**: `--json` output mode for `ok config validate`. Only actionlint exposes structured CLI output in the cohort. — **Revisit if** a CI consumer asks.
- **[NOT NOW] NG6**: Live concurrent-editor presence in the Settings UI ("another tab is editing this field"). No web-host dev tool does this; commit-time conflicts (last-writer-wins) are the universal pattern. — **Revisit if** multi-user simultaneous config-editing becomes a real workflow (unlikely; per-machine config).
- **[NOT NOW] NG7**: Settings UI in the Electron Navigator window. Navigator has no utility process; needs a project to scope config to. — **Revisit if** "global preferences before opening a project" becomes a top-cited UX gap.
- **[NOT UNLESS] NG8**: A second config file format (TOML, JSON5). — **Only if** users explicitly request a non-YAML on-ramp; current YAML pain is editor-side, addressed by Tier 1.
- **[NOT UNLESS] NG9**: Conflict-merge UX (auto-resolve concurrent edits). — **Only if** auto-save model surfaces real-world conflicts.

## 4) Personas / consumers

- **P1 — Electron desktop user (non-IDE-savvy)**: opens the OK desktop app, picks a project, never touches a terminal. Wants config changes to happen in-app. Cannot fall back to CLI or text editor by design (G3).
- **P2 — Web/`ok ui` user**: runs `ok start` from terminal, opens browser to the React app at `localhost:3000`. May or may not be IDE-savvy. Has CLI as a fallback but Settings UI is the primary edit path.
- **P3 — IDE-savvy developer (terminal + editor)**: runs `ok start` from CLI, edits config in VS Code / JetBrains / Helix. Primary path is the IDE with `$schema`-driven autocomplete; uses `ok config validate` from CI scripts.
- **P4 — AI agent (MCP client)**: an LLM agent (Claude, Codex, Cursor, etc.) connected via MCP stdio. Wants to programmatically edit config with full schema validation, structured error responses, and minimal token cost.
- **P5 — CI / automation script**: invokes `ok config validate` in a PR check or pre-commit hook, expects non-zero exit + structured errors on failure.

## 5) User journeys

### P1 — Electron user changes sync interval
1. User clicks Help icon (or App menu → Settings… on macOS / Cmd-, anywhere) in the editor header.
2. Modal Dialog opens with the schema-driven settings form. Tabs at top: **This project** (default) | **All projects**.
3. User scrolls to "Sync" section, changes `pushIntervalSeconds` from `60` to `90`.
4. On blur, the field auto-commits via `applyConfigPatch({scope:'workspace', patch:{sync:{pushIntervalSeconds:90}}})`.
5. Server validates, writes (`yaml@2` Document layer preserves comments), broadcasts CC1 `'config'` channel.
6. Modal re-renders from new state (no-op since the user's change is already there).
7. Other open surfaces (another browser tab, another window in Electron) re-fetch + re-render.
8. **Failure path:** invalid value (e.g., `0` for an int with `.min(1)`) — local validation blocks the write; field shows inline error + remains in dirty state until valid; nothing hits disk.

### P4 — Agent edits config
1. Agent decides to enable auto-sync. Calls `set_config({patch: {sync: {enabled: true, autoCommit: true, autoPush: true}}})` (no `scope` param → defaults to workspace).
2. MCP tool reads `server.lock`, finds collab server, POSTs to `/api/config/patch`.
3. Server-side `applyConfigPatch` reads current YAML, merges patch, validates full result, writes via yaml@2 Document layer.
4. Response: `{structuredContent: {ok: true, applied: ['sync.enabled', 'sync.autoCommit', 'sync.autoPush']}}` + matching text block.
5. CC1 broadcast → any open Modal in any surface refreshes.
6. **Failure path:** invalid patch (e.g., `pushIntervalSeconds: "fast"`) — server returns `isError: true` with `{ok: false, errors: [{path:['sync','pushIntervalSeconds'], message:'expected integer', code:'invalid_type'}]}`. Agent reads the structured error and retries with corrected value.

### P3 — IDE user opens config in VS Code
1. User runs `ok init` to scaffold a new project. Config.yml is generated with line 1: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge/dist/config-schema.json`
2. User opens config.yml in VS Code (Red Hat YAML LSP installed).
3. Types `sync.` — autocomplete pops up with all sync fields, descriptions from Zod `.describe()` calls.
4. Types `pushIntervalSeconds: "60"` — squiggle: "expected number, got string."
5. Saves; the running server's file watcher detects the change → CC1 broadcast → any open Modal refreshes.
6. **Alternative onboarding (no `ok init`)**: SchemaStore PR landed; VS Code auto-discovers schema via Schema Store match for `**/.open-knowledge/config.yml` filename pattern. Same intellisense without the magic comment.

### P5 — CI runs `ok config validate`
1. CI workflow runs `ok config validate` after PR checkout.
2. If valid: exit 0, nothing on stdout, "✓ Configuration valid (sources: …)" on stderr.
3. If invalid: exit 1, structured error per line on stderr ("server.port: expected integer, got '60s'"), `--json` flag (deferred to Future Work) would write JSON to stdout.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Modal first-open | Skeleton form while fetching `/api/config?scope=workspace` | n/a (config has Zod defaults) | "Couldn't load config: <reason>" with retry button | Form rendered with current values | n/a |
| Modal field commit (auto-save) | Brief inline spinner on the field | n/a | Inline field error (validation or server reject); field stays dirty | Field state matches disk; brief checkmark | n/a |
| External edit detected (CC1 'config') | n/a | n/a | n/a | Form re-renders silently from new state | n/a (no dirty-state to conflict — auto-save means no batching) |
| MCP `set_config` call | n/a (server-side) | n/a | `isError: true` + structured errors | `structuredContent: {ok:true, applied: [...]}` | n/a (atomic patch) |
| `ok config validate` | n/a | n/a | Multi-line error to stderr, exit 1 | Exit 0, nothing on stdout | n/a |
| User-global scope (Modal) | Same as workspace | n/a (Zod defaults) | Same | Same | n/a |
| Settings link in Navigator (Electron) | n/a | n/a | n/a | Hidden / disabled | n/a |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-1**: Modal Settings UI accessible from EditorHeader (HelpPopover entry), Cmd-, shortcut, CommandPalette entry, and Electron App menu item ("Settings…"). Mirror the integration patterns established by `InstallInClaudeDesktopDialog` per PR #318 (see [`evidence/tim-precedents-from-main.md`](evidence/tim-precedents-from-main.md) Pattern 1). | Cmd-, opens Modal in Electron + browser; HelpPopover uses `useState` + sibling-dialog pattern; CommandPalette uses `window.location.hash = '#settings'` with App.tsx-mounted `SettingsTrigger` listening to `hashchange`; menu item adds `openSettingsDialog?(): void` to `MenuDeps` (`packages/desktop/src/main/menu.ts`) and wires it via `ok:menu-action` channel | Implementation: copy `InstallInClaudeDesktopDialog` integration shape verbatim; same hash-routing infrastructure as existing `#/<docName>` navigation |
| Must | **FR-2**: Modal supports both `workspace` and `user` scopes via tabs/picker | User can switch scopes; correct file is read/written based on scope; both scopes show all schema sections | Scope = `'workspace'` (default) or `'user'`; Modal hidden in Electron Navigator |
| Must | **FR-3**: Auto-save with per-control commit (matches VS Code Settings UI) | Text inputs commit on blur or Enter; booleans/selects commit on change; no Save button | `applyConfigPatch` fires after local validation passes |
| Must | **FR-4**: Per-field "Reset to default" affordance | Hover icon next to any modified field; click resets to schema default; commits via auto-save | Matches VS Code's reset-on-hover pattern |
| Must | **FR-5**: Local validation blocks invalid intermediate values from writing | Field with invalid value shows inline error; no `applyConfigPatch` call until value validates against the field's schema slice | Server-side `safeParse` is the safety net |
| Must | **FR-6**: MCP `set_config(patch, expectedVersion?)` tool — single upsert with deep-partial input over the **agent-settable allowlist** (D26). **No `scope` parameter exposed to agents** — server picks the target scope via per-field `defaultScope` Zod metadata + inspectConfig inference (D25). Paths outside the allowlist are rejected with `error.code: 'NOT_AGENT_SETTABLE'`. Per-field `.describe()` surfaces in `inputSchema`; the `inputSchema` is narrowed to only the allowlisted paths so agents see the bounded surface, not the full schema. **Annotations**: `idempotentHint: true` (a patch matching current state is a no-op), `destructiveHint: false`, `readOnlyHint: false`. **Optional `expectedVersion: string`** (the ETag from the agent's most recent `get_config`) — if supplied and mismatched, returns `CONFLICT` envelope variant per D33; if omitted, proceeds without concurrency check. **Dual-emit on success and failure** per the [2025-06-18 MCP spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools): `structuredContent` carries the typed result; `content[]` carries serialized JSON (success) or actionable error text with LLM-retry framing (failure). **Description**: drafted in §9.7.2, opens with purpose + when-to-use + sibling-tool discriminator + idempotency note + return-value description; covers the 3-5-sentence template from the MCP-tool-description-as-AI-contract literature (descriptions are the LLM contract, read every turn). **Response shape (success)**: `structuredContent: {ok: true, applied: string[], scope: 'workspace'\|'user', current: Config, etag: string}` — `current` echoes the effective merged config so the agent stays in sync without a separate `get_config` round-trip; `scope` is informational (tells the agent where it landed); `etag` is the new state's hash for the agent's next `expectedVersion`. **`folders[]` shape resolved by D38** (state-based replace + per-rule convenience tools). | See D25 + D26 + D33 + D38; §9.7.2 for the full input/output schemas and the description draft |
| Must | **FR-6b**: Always-array transactional folder upsert primitive — 3-layer operation per D38, shared across HTTP/MCP/UX. **Server helper**: `applyFolderRulesUpsert({rules: Array<{match, frontmatter, new_match?}>, scope?, expectedVersion?, contentDir})` in `packages/server/src/config-edit.ts`. Reads current `folders[]` for the chosen scope; for each input rule, find-or-append-or-rename in a working array; calls `applyConfigPatch` once with the resulting full array. Returns the same `Result<T, E>` shape (D35). **All-or-nothing**: if validation fails on the merged result, no writes happen — `applyConfigPatch`'s D32 two-validator + atomic write give transactional semantics for free; no per-row partial-success machinery. **HTTP endpoint**: `POST /api/config/folders/upsert` (NEW) behind `checkLocalOpSecurity`, EXEMPT from `extractAgentIdentity` per D23 (joins `EXEMPT_HANDLERS` allowlist). Body: `{rules: [...], scope?, expectedVersion?}`. Returns same envelope shape as `POST /api/config/patch` (success: `{ok: true, applied[], etag}`; failure: `{ok: false, error: ApiError}`). **MCP tool**: `set_folder_rule({rules: Array<{match, frontmatter, new_match?}>, expectedVersion?})` — thin `httpPost` wrapper around the HTTP endpoint, matching OK's canonical MCP pattern (every existing tool wraps an HTTP endpoint; see `edit-document.ts` for the reference shape). Annotations: `idempotentHint: true`, `destructiveHint: false`, `readOnlyHint: false`. **Always accept an array, even for N=1** — agents wrap a single rule in `[{...}]`; the consistent shape avoids mutex between scalar and array forms and evolves cleanly if we later add per-row metadata (e.g. `position?`). **Description (drafted in §9.7.2)**: opens with the operation (upsert one or more folder rules), names the sibling (`set_config({patch: {folders: [...]}})` for whole-array replace), notes transactional semantics ("if any rule fails validation, no rules are applied"), notes that removal goes through `set_config`. **Removal explicitly NOT a separate tool**: removal is rare enough that read-modify-write through `set_config({patch: {folders: [<filtered>]}})` is fine; convenience savings don't justify surface bloat for once-in-a-blue-moon ops. The future right-click-folder UX uses `POST /api/config/patch` for removal, the dedicated upsert endpoint only for add/update/rename. | Resolves Q6 via D38 (state-based + ONE always-array transactional upsert primitive). Mechanical glue: server helper ~40 LoC (iterate rules, single `applyConfigPatch` call), HTTP endpoint ~20 LoC, MCP wrapper ~15 LoC. The right-click-folder UX in Future Work becomes pure UI work — posts `{rules: [{match, frontmatter}]}` directly. Modal continues using `POST /api/config/patch` for full-form save (state-based remains the right shape for the full settings form, where the user is editing many fields at once). |
| Must | **FR-6c**: MCP `get_config(path?)` tool — read effective merged config (defaults → user → workspace applied). Input: `{path?: string[]}` (e.g. `['folders']` or `['mcp', 'tools']` returns sub-tree; omit for full config). **No allowlist gating on read** — agent can read any field; allowlist only constrains writes. **Annotations**: `readOnlyHint: true`, `idempotentHint: true`. **Output**: `structuredContent: {value: <resolved JSON>, etag: string}` + serialized JSON in `content[].text`. The `etag` is the agent's handle for `set_config`'s optional `expectedVersion` (D33) — if the agent reads, decides, then writes, threading the etag through gives lost-update protection. Initial context comes via MCP instructions handshake; this tool is for mid-session re-reads when state may have changed (file watcher, Modal edits, another agent). **Description**: drafted in §9.7.2 — opens with purpose, distinguishes from `set_config` (read vs write), notes the etag's role for concurrency, and signals when to use vs. when to rely on session-start context. | Standard inspect+update verb pair (Stripe `retrieve`+`update`, VS Code `inspect`+`update`, git `config --get`+`config`); read-all + write-narrow matches the `read_document`+`write_document` pattern already in OK |
| Must | **FR-7**: MCP `get_config` tool — read full config or sub-path | Tool registered; optional `path` param (dotted) returns sub-tree | Read tool, no `identityRef` |
| Must | **FR-8**: `outputSchema` on `set_config` is the success/error projection of the canonical `ApiError` envelope (D14, D30). Success branch: `{ok: true, applied: string[], scope, current, etag}`. Error branch: `{ok: false, error: ApiError}` — the discriminated union of `VALIDATION_FAILED \| NOT_AGENT_SETTABLE \| CONFLICT \| PARSE_ERROR \| WRITE_ERROR \| <forward-compat tail>`. **Dual-emit on success AND error paths** per the 2025-06-18 MCP spec: `structuredContent` carries the typed result; `content[].text` carries serialized JSON (on success) or `humanFormat(error) + "\n\nPlease fix and try again."` (on error). The trailing prose is LLM-retry framing — without it, agents abandon the call after one failure rather than reading the actionable text and retrying. Note: `z.toJSONSchema(z.discriminatedUnion(...))` emits `oneOf` only (no formal `discriminator` keyword); MCP TS SDK forces `type: 'object'` wrapper to satisfy `ListToolsResultSchema` — both behaviors verified for Zod 4.3.6 + MCP TS SDK ^1.x. | One source of truth across HTTP, MCP, CLI; G7 forward-compat shape; `concerns/errors.md` §"Single envelope, multiple wire renderings" — define once, render per consumer |
| Must | **FR-9**: `applyConfigPatch` shared write primitive in `@inkeep/open-knowledge-server`. **PATCH dialect**: RFC 7396 JSON Merge Patch (D31) — recursive merge, null-as-delete, arrays replace; `folders[]` cross-scope merge is the documented exception. **Two-validator pattern** (D32, FR-11): patch payload validator → yaml@2 merge → merged-document validator; either failure returns `VALIDATION_FAILED` envelope, no write. **Concurrency**: optional `expectedVersion` for ETag/If-Match check (D33); mismatch returns `CONFLICT` envelope. **Return type**: `Result<T, E>` — `Promise<{ok: true, applied, effective, etag, scope} \| {ok: false, error: ApiError}>` (D35). Internal modules may throw for programmer errors; the public boundary returns Result. **Write mechanics**: yaml@2 `parseDocument` → walk patch tree applying `setIn`/`deleteIn` → `doc.toString()` → atomic tmp+rename. Document layer preserves comments + blank lines + anchors through the round-trip (proven in production at `seed/apply.ts:88-104`). **Single function** consumed by HTTP endpoint, MCP tools (set_config + folder convenience tools), CLI (`ok config validate`, `ok config migrate`), and any future caller. | All write surfaces funnel through this (D5 + FR-9b). The Result-shaped boundary makes adding a fifth consumer (future SDK, future hook) a one-translation-function task. §9.6 + §9.7 + §9.8 carry the architectural detail. |
| Must | **FR-9b**: Migrate `packages/server/src/seed/apply.ts:85-113` (`folders[]` write path, shipped in Tim's #319 / `e1f3adcf`) to call `applyConfigPatch` instead of the in-handler `parseDocument` → mutate → `writeFileSync` block | After `applyConfigPatch` lands, seed/apply imports + calls it; existing seed unit tests pass; new test asserts seed/apply now signals CC1 `'config'` (currently doesn't); no behavior change for the seed user-facing flow | Closes the D5 invariant gap — without this, FR-14 (CC1 broadcast on every successful write) is structurally violated by the seed code path |
| Must | **FR-9c**: Schema cleanup + loose-mode + codemod. **Remove from `ConfigSchema`** (per D29, P32 opinionated simplicity): `sync.*` (all 7 fields — engine opinionated about full sync lifecycle), `persistence.{debounceMs, maxDebounceMs}` (2 fields — engine has well-considered defaults), `server.port` (per-machine only, env+CLI handle the use case). **Add to `ConfigSchema`**: `appearance.theme`, `appearance.editorModeDefault` (per D20). **Switch every `z.object({...})` to `z.looseObject({...})`** per D34 — forgiveness on unknown fields; users mid-upgrade with stale `sync.*` set don't get rejected at load time. **Fix doc/schema mismatch**: `packages/cli/src/content/init.ts:61` template comment says `port: 3000` but schema defaults to `0` (kernel-allocated) — drop the `port` line from the template entirely since `server.port` is no longer a schema field. **Ship `ok config migrate` codemod (FR-26) in the same release** so users have a one-shot cleanup path instead of dead text accumulating on disk. | After this FR: `ConfigSchema` has 7 sections (`content`, `github`, `server` (host + openOnAgentEdit only), `preview`, `folders[]`, `mcp`, `appearance`) and ~12 leaf fields, all in loose-mode. All schema fields are wired end-to-end (no half-implemented features). Tests pass with the dropped fields removed; an integration test asserts a config file with `sync.pushIntervalSeconds: 30` (a dropped field) loads successfully via loose-mode and is preserved on disk through round-trip writes. | Per P31 (no half-implemented) + P32 (opinionated for 90% case) + D34 (forgiveness over strictness) + D37 (same-day codemod, ESLint v9 lesson). The dropped 10 fields fall into two categories: (a) vestigial/half-wired (sync.*, persistence.* — 9 fields) — engine doesn't read them; documentation hazard; (b) per-machine-only (server.port — 1 field) — env+CLI is the natural override path; no clean 2-tier-ladder home. Adding any back later is purely additive. With loose-mode, users mid-upgrade aren't broken; with codemod, they get explicit cleanup. |
| Must | **FR-3b**: Modal renders a per-setting "modified at this scope" indicator (subtle 2-3px colored bar on left edge OR small dot near the field label) for every field whose value at the currently-viewed scope tab differs from default. | Field row gets `data-modified="true"` attribute when `inspectConfig(path)[currentScope] !== undefined`; CSS renders the bar/dot. Universal across mature editor-class products (VS Code colored bar, JetBrains blue text, Cursor inherits). Foundational, not polish. | Distinct from Q9 (the cross-scope override-by-workspace badge, which IS polish-tier). Cheap (~10 LoC + CSS); foundational UX. Q9 deferred separately. |
| Must | **FR-10**: Comment-preserving round-trip via `yaml@2` Document layer | `parseDocument()` → `setIn(path, value)` → `doc.toString()` → atomic tmp+rename write; comments, blank lines, anchors preserved | Per `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md`; in-repo proof-of-pattern at `seed/apply.ts:88-104` |
| Must | **FR-11**: Two-validator pattern — patch payload validator + merged-document validator (D32). Pass 1: `ConfigPatchSchema.safeParse(rawPatch)` validates the deep-partial input shape (and gates to the agent-settable allowlist for MCP-originated calls). Pass 2: `ConfigSchema.safeParse(merged)` validates the merged result with all refinements. Either failure returns `VALIDATION_FAILED` envelope variant; no write. Both passes run server-side as the final safety net (Modal's local validation is for UX only — it's NOT the authoritative check). | Catches cross-field invariants AND the null-as-clear class of bug (a patch that validates against the partial shape but produces a merged document with required fields missing). Without pass 1, allowlist gating leaks into the merge logic; without pass 2, refinements and required-with-default constraints aren't enforced. Kubernetes admission webhook precedent. |
| Must | **FR-12**: HTTP `POST /api/config/patch` endpoint registered in `api-extension.ts` route registry. **`Content-Type: application/merge-patch+json`** signals the RFC 7396 dialect (D31). **Concurrency**: requires `If-Match: <etag>` header (D33); mismatch → 412 Precondition Failed with `CONFLICT` envelope variant; missing → 428 Precondition Required with same envelope. **EXEMPT from `extractAgentIdentity`** (config-edit operates on the local user's machine settings, not agent content — same rationale as `handleSeedPlan`/`handleSeedApply` per `attribution-sweep-coverage.test.ts:82-86`); add `handleConfigPatch` to the sweep `EXEMPT_HANDLERS` set. **Body**: `{scope: 'workspace'\|'user', patch: ConfigPatch}`. **Response (success)**: `200 OK` + `ETag: <new-etag>` header + body `{ok: true, applied[], etag}`. **Response (failure)**: appropriate 4xx status (422 VALIDATION_FAILED, 400 PARSE_ERROR, 412 CONFLICT, 403 NOT_AGENT_SETTABLE, etc. per D30 status mapping) + body `{ok: false, error: ApiError}`. | One canonical error envelope (D14, D30) — Q1 resolved as align all routes; identity-exempt rationale ratified by Q2 resolution; ETag/If-Match per RFC 7232 (D33). |
| Must | **FR-13**: HTTP `GET /api/config?scope=...&path=...` endpoint. Returns `output` view (resolved values, `z.output<typeof ConfigSchema>`). **`ETag: <sha256-of-canonical-bytes>`** header on every response — feeds the agent's `expectedVersion` (FR-6) and the Modal's `If-Match` flow (FR-12). Also supports `If-None-Match` for 304 conditional revalidation (the polling-cheap pattern; Modal's CC1 'config' subscriber uses CC1 push primarily but conditional GET is the fallback). | Returns current resolved config sub-tree; `scope` defaults to `'workspace'`. Used by Modal first-open + reload-on-CC1 + agent get_config (the MCP tool reads through this same endpoint internally). The `output` view (resolved defaults) is correct because consumers want the effective value; the `input` view is for the IDE LSP target only (FR-18). |
| Must | **FR-14**: CC1 `'config'` channel broadcast on every successful write | `applyConfigPatch` calls `cc1Broadcaster.signal('config')` after write; `SystemDocSubscriber` adds parallel client routing for `'config'` → query invalidation | Live refresh across open surfaces |
| Must | **FR-15**: File watcher detects external edits to `.open-knowledge/config.yml` (workspace + user) and emits CC1 `'config'` | New watcher (chokidar or @parcel/watcher) on the config file paths; debounced 100ms to match CC1; deduped against internal writes via writeTracker pattern | New code; not part of existing content watcher |
| Must | **FR-16**: `ok config validate` CLI subcommand | `new Command('config').addCommand(new Command('validate'))`; loads config; validates; exit 0 on success, non-zero with multi-line errors on failure; `--cwd` flag inherited | Tier 1 (P3, P5) |
| Must | **FR-17**: `ok init` scaffolds magic comment at the top of generated `config.yml`. **Pin the `$schema` URL to the installed package's major.minor version** so the user's autocomplete surface stays in lockstep with what they wrote against. `CONFIG_YML_CONTENT` constant in `packages/cli/src/content/init.ts:5` gets a new line BEFORE the existing `# Open Knowledge — workspace configuration` header: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json` (the major.minor portion is templated at scaffold time from the running CLI's `PACKAGE_VERSION`). Existing `# Schema reference: packages/cli/src/config/schema.ts` prose comment stays (human-readable hint for editors without LSP). | Tier 1 (P3). Pinned version follows the [Biome `$schema` URL](https://biomejs.dev/guides/configure-biome/) precedent (`https://biomejs.dev/schemas/1.8.3/schema.json`). Without the version pin, the IDE's schema cache drifts from what the user wrote against — they upgrade the tool, the cloud schema changes, autocomplete shifts under them with no migration signal. With the pin, schema and runtime stay locked together; on upgrade the user re-runs `ok init` (or the codemod from FR-26) to bump the URL. The `--save-exact` discipline applies. Both directives coexist (LSP directive on line 1, human comment in body). |
| Must | **FR-25**: Settings UI exposes an "Integrations" section with an "Install in Claude Desktop" row that opens the existing `InstallInClaudeDesktopDialog`. Hidden on Linux (no Claude Desktop) per Tim's FR10 in `specs/2026-04-24-skill-dual-track-install/SPEC.md`. | Row labeled "Install in Claude Desktop" in the Integrations section; click opens `<InstallInClaudeDesktopDialog>` (already imported); detection via `window.okDesktop?.detectClaudeDesktop?.()` (Electron) or always-show (web). Fulfills Tim's D13 destination — Help submenu + HelpPopover + CommandPalette entries from #318 remain as secondary entry points for discoverability. | Cheap addition; reuses existing dialog component; honors Tim's original D13 placement intent |
| Must | **FR-18**: Build step emits `dist/config-schema.json` from `z.toJSONSchema(ConfigSchema, {io: 'input', target: 'draft-07'})`. **`io: 'input'` is load-bearing**: a field with `.default('localhost')` has Zod input type `string \| undefined` (the user can omit it) and output type `string` (the server fills it in). The IDE LSP target must show the user what they **type** (input view), not what the runtime resolves (output view) — otherwise a defaulted field appears falsely required in autocomplete. New `build:schema` npm script; chained into `build`; emits valid JSON Schema draft-07; shipped via npm `files: ['dist']`. **Add CI test** asserting that the emitted JSON Schema and `ConfigSchema.parse()` accept/reject the same set of representative fixtures — guards against `.transform()` or `.coerce()` slipping into the schema and silently breaking IDE/runtime equivalence (today's schema is transform-free; the test prevents regression). | Tier 1; powers magic-comment + SchemaStore. The `io: 'input'` flag is the single-line difference between "IDE shows the right shape" and "IDE wrongly insists every defaulted field is required." `concerns/schemas.md` §"Input vs output types" + `special/schemas-across-boundaries.md` §"Publish JSON Schema for the shape only". |
| Must | **FR-19**: SchemaStore PR submitted | One-time PR to `SchemaStore/schemastore` adds catalog entry: name, description, url (unpkg-hosted), fileMatch `['**/.open-knowledge/config.yml','**/.open-knowledge/config.yaml']` | Tier 1 (P3) — one-time external work |
| Must | **FR-20**: Settings menu item hidden/disabled in Electron Navigator window | `mode === 'navigator'` → don't render menu entry; or render disabled with tooltip "Open a project to access settings" | NG7 alignment |
| Must | **FR-26**: `ok config migrate` CLI subcommand — same-day codemod paired with D29 schema cleanup (per D37). Reads workspace + user config, removes the 10 dropped fields (`sync.*`, `persistence.{debounceMs,maxDebounceMs}`, `server.port`), writes back via `applyConfigPatch`. **Idempotent** — running twice on a clean file is a no-op. **Flags**: `--dry-run` (preview without writing), `--scope <workspace\|user\|both>` (default `both`). Uses yaml@2 Document layer to preserve all comments + structure for fields not being removed. Funnels through `applyConfigPatch` so all D5/CC1/two-validator/atomic-write invariants apply automatically. **Implementation site**: `packages/cli/src/commands/config.ts` (same file as `ok config validate`); subcommands hang off the `config` parent. Future codemods extend this command (e.g., `ok config migrate --to v0.5`) rather than spawning new ones. | The ESLint v9 retrospective is the decisive evidence — `@eslint/migrate-config` shipped a month after the breaking release and the migration dragged for 20 months. *"Prioritize tooling over documentation."* Turborepo 2.0's `pipeline → tasks` rename was smooth because `@turbo/codemod migrate` shipped same-day. With FR-9c (loose-mode passthrough) + FR-26 (codemod) both shipping, users mid-upgrade aren't broken AND get explicit cleanup. |
| Must | **FR-27**: Source-located error messages for config validation (per D36). Switch loader from `parseYaml` (string → JS object) to `parseDocument` (yaml@2's source-position-preserving parser — already in production at `seed/apply.ts:88-104`). When `ConfigSchema.safeParse` fails, walk each issue's `.path` back to source positions via the Document AST: `doc.getIn(path)` returns the `Node` whose `.range` carries `[startByte, endByte]` offsets; translate to line/col against the source string. Emit errors in the `file:line:col` + snippet format (see §9.6.4). Applies to `loadConfig`, `ok config validate`, `applyConfigPatch` (HTTP/MCP failure rendering), and the Modal's display of validation rejections (issue path → rendered field mapping). | Today's loader emits `Invalid configuration:\n  path: message\n...` with no file:line:col — user has a JSON-pointer path and has to grep. Biome's lint output is the bar (`file:line:col` + code snippet with offending token highlighted). One source-position-preserving parser, three consumers benefit. Test asserts `ok config validate` on a fixture with `pushIntervalSeconds: "fifty"` emits an error containing the literal substring `config.yml:<line>:`. |
| Must | **FR-28**: Single canonical `ApiError` Zod discriminated union exported from `@inkeep/open-knowledge-server` (per D14, D30). Schema in `packages/server/src/api-error.ts` (NEW). All HTTP routes (config-edit + the ~50 existing routes using `{ok, error: string}` + the 2 seed routes using `{ok: false, error: {kind, message}}`) refactor to return `{ok: false, error: ApiError}` as part of v0 implementation. Per-consumer rendering helpers in the same file: `humanFormat(error: ApiError): string` (CLI/MCP text), `statusFor(error: ApiError): number` (HTTP status mapping). MCP `set_config`/`get_config` tools wrap via `asMcpToolResult(result)`. Forward-compat tail variant `z.object({ code: z.string(), message: z.string().optional() }).catchall(z.unknown())` ensures unknown future codes don't break old clients. **Test**: every existing route's error path now returns the new envelope shape; integration test asserts each error code maps to the documented HTTP status. | Resolves Q1 → align all routes (not "additive only"). One source of truth for error contract; new error codes update HTTP status mapping, MCP rendering, CLI text in one place. The discriminated union gives compile-time exhaustive matching at every consumer site. ~50 routes × ~5 LoC + helper functions = one focused day of work. RFC 9457 Problem Details + Stripe typed-error-class hierarchy converge on the same "define once, render per consumer" pattern. |
| Should | **FR-21**: Per-field "Reset to default" works on every field with a Zod default | Walker-side: detect `.default()` wrapper; render reset icon; clicking writes the default value | Polish item |
| Should | **FR-22**: Inline field documentation surfaced from Zod `.describe()` calls | Hover/popover on each field shows the `.describe()` text | Reuses same source as MCP per-field descriptions + IDE hover |
| Should | **FR-23**: Modal layout responsive (mobile + desktop browsers) | shadcn Dialog handles responsive sizing | Standard shadcn behavior |
| Could | **FR-24**: Local UI prefs (theme, editor mode, pin) surfaced in same Settings dialog | Separate "Preferences" tab; reads/writes localStorage; clearly demarcated as browser-local vs project | See OQ — storage-class split |

### Non-functional requirements

- **Performance**: Modal first-open <200ms (single GET); per-field auto-save commit <100ms (single POST + yaml roundtrip on small file); CC1 propagation <500ms end-to-end (100ms debounce + WS hop + re-render).
- **Reliability**: Atomic file writes via tmp+rename. No partial writes ever land on disk. Validation always precedes write (server-side as final safety net).
- **Security/privacy**: `POST /api/config/patch` and `GET /api/config` use `checkLocalOpSecurity` (loopback + Host-header + DNS-rebinding gate) — same precedent as `/api/local-op/*`. Config is per-machine state; never exposed to non-loopback clients.
- **Operability**: CC1 'config' broadcasts logged; errors structured (existing `[CC1]` bracket-prefix convention); `applyConfigPatch` errors logged with `bridge-merge-content-loss` analog if comment preservation fails.
- **Cost**: 5 new MCP tools added (~3-4K tokens of context: `set_config`, `get_config`, plus the 3 folder convenience tools per D38 — ⚠ the latter 3 may consolidate to 1 per the D38 follow-up). Two new HTTP endpoints + ETag/If-Match flow on both. One new CC1 channel. One new file watcher subscription. **Code budget** (rough — refined during implementation): `applyConfigPatch` core ~120 LoC (RFC 7396 merge + two-validator + ETag + atomic write + Result return); `ApiError` envelope + helpers (`humanFormat`, `statusFor`, `asMcpToolResult`) ~150 LoC; refactor of ~50 existing routes to the new envelope ~250 LoC (5 LoC × 50); MCP tools (`set_config`, `get_config`, 3 folder tools) ~200 LoC; CLI commands (`validate` + `migrate` codemod) ~150 LoC; source-located error machinery ~80 LoC; Modal renderer + Zod walker ~300 LoC; entry-point wiring (HelpPopover, Cmd-,, CommandPalette, menu) ~80 LoC; CC1 'config' channel + watcher ~60 LoC; tests (integration coverage for two-validator, ETag flow, codemod, envelope alignment) ~200 LoC. **Total: ~1,600 LoC + Modal UI.** The headline addition vs the original ~600 LoC estimate is the existing-routes envelope refactor (~250 LoC) and the breadth of supporting infrastructure (Result, ETag, codemod, source-located errors) — all of which were "deferrals" in the original draft and are in-scope under the greenfield-no-deferred-tech-debt stance.

## 7) Success metrics & instrumentation

- **M1 — Agent config-edit success rate.** % of MCP `set_config` calls that succeed (vs `isError: true`). Baseline: 0% (capability doesn't exist). Target after launch: >80% on first attempt; structured errors carry agent through retries.
- **M2 — Settings UI engagement.** % of OK sessions (Electron + web) where the Settings dialog is opened. Baseline: 0% (no UI). Target: instrumentation only for v0; threshold-setting after observation.
- **M3 — IDE intellisense adoption.** Indirect signal via SchemaStore catalog file's GitHub stars (the OK schema entry); SchemaStore submission acceptance latency.
- **M4 — Config validation feedback latency.** Time from "user changes config" to "user sees error if invalid". Baseline (hand-edit): server boot time (~seconds). Target (Modal): <100ms inline; (CLI validate): <500ms full validation.
- **What gets logged**:
  - Server: every `applyConfigPatch` call (path, scope, agent, success/fail) — pino structured.
  - Server: CC1 'config' broadcasts (channel, seq) — pino structured.
  - Renderer: Settings dialog opens (event only, no PII) — existing telemetry pattern.
  - MCP: tool-call logging (existing `createLoggedServer` pattern).
- **How we'll know adoption/value**:
  - Successful agent-driven config edits in real sessions (M1 above).
  - Reduction in "edit your config.yml manually" type instructions in agent transcripts.
  - SchemaStore PR merged + listed.

## 8) Current state (how it works today)

- **Config loading**: `loadConfig(cwd)` in `packages/cli/src/config/loader.ts:67-98`. Reads `~/.open-knowledge/config.yml` (user) then `<cwd>/.open-knowledge/config.yml` (workspace). Deep-merges. Validates via `ConfigSchema.safeParse()`. Throws on parse failure with multi-line error message.
- **Caching**: 1s TTL via `createProjectConfigResolver` (loader.ts:144-182) for long-lived MCP sessions. Cache miss → re-read from disk. No fs watcher behind the cache.
- **Writing**: NO write path exists. Loader is read-only. Users hand-edit YAML in their editor of choice.
- **MCP read access**: Indirect via `exec("cat .open-knowledge/config.yml")` only. No structured read; no schema-validated parse from MCP.
- **MCP write access**: NONE. `exec` is read-only by design; `write_document` is markdown-only.
- **React app**: No Settings surface exists today. EditorHeader has Theme toggle (localStorage), Help popover (links only), no project-config UI.
- **CLI**: No `ok config` command. `loadConfig` is invoked by `ok start`'s `preAction` hook; failure prints stack and exits non-zero. No standalone validate path.
- **IDE**: No `$schema` published. No magic-comment scaffolded by `ok init`. No SchemaStore registration. Users editing config.yml in any IDE get zero schema-driven help.
- **External-edit detection**: NONE. File watcher (`packages/server/src/file-watcher.ts:725-746`) watches `contentDir` only — explicitly does NOT watch `.open-knowledge/`. External edits to config.yml are invisible to the running server until next boot.
- **Key constraints**:
  - Hocuspocus's CRDT layer is for content (Y.XmlFragment + Y.Text), not config. Config isn't merge-able state.
  - Electron utility process is bound to one project (one `contentDir` per editor window per Electron spec D6).
  - Navigator window has no utility — no collab server reachable.
  - Web-host (`ok ui`) proxies `/api/*` to the collab server; same backend reachable from browser as from Electron renderer.
- **Known gaps discovered during research**:
  - Existing write-handler response shape is `{ok, error: string}` (singular). The `{ok, errors: ZodIssue[]}` array shape we want is **new** and would establish a precedent.
  - `extractAgentIdentity` is enforced by attribution sweep test — new mutating handler MUST call it. Threading agent identity through config edits matches the existing pattern but raises a question about *what attribution means for config* (admin-style edit vs agent-authored content edit).
  - `~/.open-knowledge/` directory has no "ensure exists" helper today; `ok init` only creates workspace dir.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Modal Settings UI** (Electron + web): shadcn `<Dialog>` opened from EditorHeader (HelpPopover submenu or new Settings icon), Cmd-, shortcut, Electron App menu ("Settings…" via `ok:menu-action` channel). Top-level scope tabs ("This project" / "All projects"). Schema-driven custom form walking `ConfigSchema` directly (no form library). Per-section grouping matches schema top-level keys (content, sync, server, persistence, mcp, folders, github, preview). Auto-save on per-control commit. Per-field Reset to default (hover icon). Inline `.describe()` tooltips. Local validation blocks invalid commits.
- **MCP tools**:
  - `set_config({patch, scope?})` — single upsert; deep-partial input; `outputSchema` discriminated union; `isError: true` + structured errors on validation failure
  - `get_config({path?, scope?})` — full config or sub-tree
- **CLI**:
  - `ok config validate [--cwd PATH]` — load + validate; exit 0/non-zero; pretty errors to stderr
  - `--json` flag deferred to Future Work
- **HTTP API**:
  - `POST /api/config/patch` — body `{scope: 'workspace'|'user', patch: object}`; returns `{ok: true, applied: string[]}` or `{ok: false, errors: ZodIssue[]}`
  - `GET /api/config?scope=&path=` — returns sub-tree
  - Both behind `checkLocalOpSecurity` (loopback + Host-header + DNS-rebinding)
- **`ok init` magic-comment scaffold**: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge/dist/config-schema.json` on line 1 of generated `config.yml`
- **SchemaStore submission**: One-time PR; unlocks zero-config IDE intellisense for every Red Hat YAML LSP user
- **Error messages**: Field-inline (Modal); structured per-line (CLI stderr); structured `errors[]` array (HTTP + MCP); never raw stack traces

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| EditorHeader → Settings entry | React (Electron + web) | Cmd-, fires; HelpPopover "Settings…" link works; menu item on macOS opens Modal |
| Modal — Workspace tab | React | All schema fields render; defaults shown; auto-save on blur; CC1 reload on external edit |
| Modal — User-global tab | React | Switches scope; reads/writes correct file; same render |
| `POST /api/config/patch` | Server HTTP | Returns 200 with `applied[]`; 400 with `errors[]` on Zod fail; 403 on non-loopback |
| `GET /api/config` | Server HTTP | Returns current config; respects `scope` and `path`; 403 on non-loopback |
| MCP `set_config` | MCP stdio | Tool registered; deep-partial input validates; `outputSchema` returns structured |
| MCP `get_config` | MCP stdio | Returns full or sub-tree |
| `ok config validate` | CLI | Exit 0 on valid; non-zero with errors on invalid |
| Generated `config.yml` (post-`ok init`) | Disk | Line 1 has magic comment |
| IDE editing `.open-knowledge/config.yml` (any LSP-aware editor) | External | Autocomplete + validation work via magic comment OR SchemaStore match |
| Electron Navigator | Renderer | No Settings entry visible |

### System design

#### Architecture overview

```
                                                CALLERS
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ Settings Modal   │  │ MCP set_config   │  │ ok config        │  │ External edit    │
   │ (React app,      │  │ / get_config     │  │ validate (CLI)   │  │ (IDE, hand-edit, │
   │ Electron + web)  │  │ (agent)          │  │                  │  │ another MCP)     │
   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
            │ fetch                │ httpPost            │ direct              │ fs change
            ▼                      ▼                     ▼                     ▼
        POST /api/config/patch + GET /api/config    loadConfig() +     File watcher
        (existing api-extension.ts route registry)  ConfigSchema       (NEW: watches
        + checkLocalOpSecurity gate                                    .open-knowledge/
                       │                                               config.yml)
                       ▼                                                       │
            ┌──────────────────────────────────────────────┐                  │
            │ applyConfigPatch({scope, patch, contentDir}) │                  │
            │ in @inkeep/open-knowledge-server             │                  │
            │                                              │                  │
            │ 1. Read current YAML at correct path         │                  │
            │ 2. parseDocument() → AST                     │                  │
            │ 3. Apply patch via setIn/deleteIn            │                  │
            │ 4. doc.toJS() → safeParse(ConfigSchema)      │                  │
            │ 5. If valid: doc.toString() → atomic write   │                  │
            │ 6. If invalid: return errors[], no write     │                  │
            │ 7. cc1Broadcaster.signal('config') on success│                  │
            └──────────────────────────────────────────────┘                  │
                       │                                                       │
                       └──── on disk change ─────────────────────► debounced ─┘
                                                                  signal('config')
                       │
                       ▼
            ┌──────────────────────────────────────────────┐
            │ __system__ Y.Doc broadcastStateless           │
            │ {v:1, ch:'config', seq:N}                    │
            └──────────────────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────────────────────────┐
            │ SystemDocSubscriber (every open client)      │
            │ ch === 'config' → invalidate config query    │
            │                  → Modal re-fetches + re-    │
            │                    renders                   │
            └──────────────────────────────────────────────┘
```

#### Data model

- On disk: `<contentDir>/.open-knowledge/config.yml` (workspace) + `~/.open-knowledge/config.yml` (user-global). YAML format. Schema: `ConfigSchema` in `packages/cli/src/config/schema.ts`.
- In memory (server): `ConfigSchema`-typed object. Cached per-cwd via `createProjectConfigResolver` (1s TTL).
- AST during write: `yaml@2` `Document` (in-process, transient per `applyConfigPatch` call).
- Wire: HTTP body `{scope: 'workspace'|'user', patch: DeepPartialConfig}`. MCP input: `z.object({scope: z.enum(['workspace','user']).optional(), patch: ConfigPatchSchema})`.

#### API/transport

- HTTP: `POST /api/config/patch`, `GET /api/config?scope=&path=` — both behind `checkLocalOpSecurity` gate. JSON body/response.
- MCP: stdio; tool input via Zod; output via Zod `outputSchema` discriminated union; structured errors via `isError: true` + `structuredContent`.
- CLI: stdin/stdout; pretty errors to stderr; exit codes (0 success, 1 failure).
- WebSocket: `__system__` Y.Doc broadcastStateless for CC1 'config' channel.

#### Auth/permissions

- All HTTP endpoints loopback-gated via `checkLocalOpSecurity` (precedent: `/api/local-op/*`). Config is per-machine; non-loopback access never permitted.
- MCP tools rely on the existing MCP transport boundary (stdio, local subprocess). `extractAgentIdentity` threads agent metadata for attribution logging; no permission gating beyond identity capture.
- CLI runs in-process; no auth boundary (user has process access = user can edit config).

#### Enforcement points

- **HTTP layer**: `checkLocalOpSecurity` (loopback + Host + DNS-rebinding) at endpoint entry.
- **applyConfigPatch**: `extractAgentIdentity(body)` at HTTP-handler entry (attribution sweep test enforced); full-doc Zod validation before write.
- **MCP tool**: input parsed against Zod schema by SDK; reject before reaching the handler.
- **Modal renderer**: per-field local validation against schema slice; invalid values held in dirty state, never POSTed.
- **CLI**: `ConfigSchema.safeParse` on loaded merged config; failure → non-zero exit.

#### Observability

- Pino structured logs on every `applyConfigPatch` call: `{level: 'info', event: 'config-patch', scope, agent, applied, durationMs}`.
- Pino on validation failures: `{level: 'warn', event: 'config-patch-rejected', scope, agent, errors}`.
- Pino on CC1 broadcasts: `{level: 'debug', event: 'cc1-signal', ch: 'config', seq}`.
- Renderer telemetry: Settings dialog open events (no PII).
- MCP tool-call logging via existing `createLoggedServer` wrapper.

#### Data flow diagram

- **Primary flow**: Caller → POST /api/config/patch (or MCP set_config) → applyConfigPatch → yaml@2 read → setIn → safeParse → atomic write → CC1 'config' broadcast → all subscribers re-fetch.
- **Shadow paths to test**:
  - **nil / missing**: config.yml doesn't exist → applyConfigPatch creates it from scratch (with the patch as the initial content + schema defaults).
  - **empty**: empty YAML file → loadConfig returns Zod defaults; patch applies to defaults; new file written.
  - **wrong type**: agent sends `{sync: {pushIntervalSeconds: "60"}}` → server-side safeParse rejects; structured error returned; no write.
  - **timeout**: yaml.parse on a malformed file → applyConfigPatch returns `{ok: false, errors: [{message: 'YAML parse error: ...'}]}`; no write.
  - **conflict**: two concurrent POST /api/config/patch calls → atomic tmp+rename means one wins; the other reads stale state and may produce a stale-base merge; CC1 broadcast covers both.
  - **partial failure**: write succeeds but CC1 broadcast fails → no rollback; logged as warning; subscribers will pick up changes on next read or next CC1 signal.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `applyConfigPatch` | YAML parse fails on read (file corrupted) | `parseDocument` throws | Return `{ok: false, errors: [{message: 'YAML parse error', code: 'parse_error'}]}`; no write | Modal shows error; user must fix file manually OR Modal offers "Reset to defaults" |
| `applyConfigPatch` | Validation fails after merge | `safeParse` returns `success: false` | Return `errors[]`; no write | Modal: inline errors per field; MCP: structured errors; CLI: pretty errors |
| `applyConfigPatch` | Atomic write fails (disk full, permission) | `fs.rename` throws | Return `{ok: false, errors: [{message, code: 'write_error'}]}`; tmp file may remain | Modal: error toast; user must investigate |
| File watcher | Loses connection (FS event delivery breaks) | parcel/chokidar error event | Restart watcher; log warning | External edits temporarily not detected; recovers on watcher restart |
| CC1 broadcaster | `__system__` Y.Doc not yet materialized | `cc1Broadcaster.signal` checks doc; logs warn if not ready | No broadcast; subscribers don't refresh | Stale Modal state until next manual interaction or page reload |
| HTTP endpoint | Non-loopback request | `checkLocalOpSecurity` gate returns 403 | Reject with structured error | External attacker can't edit config (security boundary held) |
| MCP tool | Server unreachable | `httpPost` rejects | Tool returns `textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true)` | Agent sees clear error message; can prompt user to start server |
| Renderer | Modal opens with config that's invalid against current schema | `safeParse` on loaded config fails | Show error state with reset option | "Your config has invalid fields: X. Reset to defaults?" |

### Alternatives considered

- **Per-domain MCP tools** (`set_sync_config`, `set_server_config`, ... ~12 tools) — REJECTED. Tool-count is the strongest predictor of agent failure (Microsoft Research, cited in `reports/mcp-tool-interface-design-agent-performance/REPORT.md`). 12 tools blows past the 2-6 optimum; cross-section edits require N calls.
- **Discriminated-union per-section** (`set_config({payload: discUnion(per-section)})`) — REJECTED. Forces one-section-per-call (config sections aren't mutually exclusive). Plus SDK bug #1643 silently drops top-level discriminated unions.
- **`set_config_field({path, value: unknown})`** — REJECTED. Weakly typed; model often guesses wrong types. Single-upsert with deep-partial is sharper.
- **Use an existing form library (RJSF, JSON Forms, react-formgen, uniforms)** — REJECTED. Custom shadcn walker is cheaper for ~30 fields. RJSF: `@rjsf/shadcn` is alpha + drops `.refine()`. JSON Forms: no shadcn theme. react-formgen: alpha + single-maintainer. uniforms: no shadcn theme.
- **Auto-save vs explicit Save** — Auto-save (per-control commit, matching VS Code) chosen. Eliminates dirty-state-vs-external-edit conflict class entirely. Cost: no preview before commit.
- **CLI escape hatch (`ok config set --global`) for global config** — REJECTED. Violates "Electron users never use CLI" principle. Modal scope picker covers global instead.

## 9.5) Configuration Architecture Framework (durable precedent)

This section formalizes the rules OK uses to decide:
1. **Whether a setting deserves to be configurable at all** (vs. hardcoded with engine opinion).
2. **Where a configurable setting lives** (config.yml file, env var, state file, OS keychain).
3. **What scope it defaults to** when in config.

Future schema additions cite this section. Full evidentiary backing in [`evidence/config-architecture-framework.md`](evidence/config-architecture-framework.md) (P1–P33 with sources) and per-field /explore traces in `evidence/eval-group-{A,B,C,D}-*.md`.

### 9.5.1 Foundational principles (capsule)

**Storage architecture**
- **P1. Settings vs state separation.** Declarative user intent → YAML config files (only writer is `applyConfigPatch`). Runtime observations → dedicated JSON state files, gitignored, never user-settable. Never overlap.
- **P2. The user's file is authoritative.** Config files accept whatever valid YAML allows. Runtime is opinionated about effective values. Never reject-on-write.
- **P4. Single shared write primitive.** All writers funnel through `applyConfigPatch` (D5).
- **P8. Open writes, opinionated reads.** If we ever add per-field scope restrictions, enforce at read layer (skip invalid layers) — never at write layer.
- **P33. Secrets never in config or process env.** OS keychain (preferred) or chmod-0600 file (fallback). Public identifiers (OAuth client IDs) are OK in config; tokens are not.

**Greenfield discipline**
- **P31. No deferred tech debt.** Don't leave half-implemented features. Schema-says-but-runtime-doesn't is the forbidden pattern.
- **P32. Opinionated for the 90% case.** When ≥90% of users won't tune a knob, ship without it. Schema simplicity > speculative configurability. Engine has well-considered defaults; per-machine override (when needed) goes through env+CLI. Adding back later is purely additive — that's not deferred debt, it's evolution.

**Scope ladder (v0 = 2 tiers, future +local)**
- **P5. Two-tier ladder + env + CLI.** Resolution: `defaults → user-global → workspace → ENV → CLI`. `.local.yml` lands when a real per-machine schema field requires it (Future Work).
- **P6. Closer-to-target wins on read; write back to most-specific-set scope** (per VS Code precedent, D25).
- **P7. `defaultScope` is an inference hint, not enforcement.** Per-field metadata declares the field's natural home; loader uses it only when the field is unset everywhere.

**Agent surface**
- **P18. Agent contract is path-only, scope-blind.** Agents pass paths; server picks scope via inference (D25).
- **P19. Agent-settable allowlist via schema metadata.** `.meta({ agentSettable: true })` is the only gate. Read side unrestricted (D26).

### 9.5.2 Decision tree — does the field deserve to be configurable, and where does it live?

Apply in order. First match wins.

```
1. Is the field a credential / token / secret?
   → DROP from schema. Use OS keychain or auth.yml fallback (P33).

2. Is the field documented in schema but unwired (no production read site)?
   Apply P31 + P32:
     2a. Will 90%+ users want to tune this if wired?
         NO  → DROP from schema (engine becomes opinionated).
         YES → wire engine end-to-end + keep in schema.

3. Is the field an array or record?
   → CONFIG-ONLY (P14). Env can't represent it.

4. Is the field a scalar that 90%+ users will leave at default?
   Apply P32:
     4a. Per-deployment scenario AND well-known env name (PORT, HOST, DEBUG)?
         AND no clean 2-tier (user/workspace) home?
         → ENV-ONLY (drop from config).
     4b. Persistent identity / fork use case OR clean 2-tier home?
         → KEEP IN CONFIG. Optionally hybrid with env override.

5. Is the field a scalar with a real team-shared workspace use case?
   → CONFIG (workspace defaultScope). Optional env override (P15+P16).

6. Is the field a scalar persistent UX / user-preference value?
   → CONFIG (user defaultScope). Per P15.
```

### 9.5.3 Per-scope tolerance taxonomy

For each kept field, classify per scope:

| Marker | Meaning |
|---|---|
| ✅ | Natural home (set `defaultScope` here) |
| 👍 | Acceptable / valid |
| ⚠ | Unusual but not broken |
| ❌ | Would actively misbehave (machine-scoped equivalent — would break teammates or cause cross-project collision) |

**❌ entries** indicate fields where, in a future P8 (read-side enforcement) iteration, the loader would skip values from invalid scopes. v0 trusts users (Architecture A); the marker still surfaces the misuse case in docs.

### 9.5.4 Per-field summary — current schema (post-D29)

The full v0 schema with verdict + scope tolerance + plain-language explanation:

| Field | Type | Default | Verdict | defaultScope | User | Workspace | Env | Explanation |
|---|---|---|---|---|---|---|---|---|
| `content.dir` | string | `'.'` | config-only | workspace | ⚠ | ✅ | — | Project-relative path for the content tree; defined per-project; rare user-global override. Array shape excluded; team-shared by definition. |
| `content.include` | string[] | `['**/*.md', '**/*.mdx']` | config-only | workspace | ⚠ | ✅ | — | Globs defining which files are content; team conventions land here; arrays can't be env. |
| `content.exclude` | string[] | `[]` | config-only | workspace | 👍 | ✅ | — | Globs defining what to skip; user-global plausible for "exclude my scratch dir"; arrays can't be env. |
| `github.oauthAppClientId` | string | `'Ov23liqlSd0V1MwR6rhI'` (OK's published app) | config-only | user | ✅ | ⚠ corp fork | — | Public OAuth app identity. 99% use OK's default; the 1% who fork (corp/self-hosted) commit their own client ID to workspace. NOT a credential — those go in keychain (P33). |
| `server.host` | string | `'localhost'` | config + env override | user | ✅ | ⚠ team-wide bind | — | Bind interface for HTTP server. User's machine network setup is uniform across projects (some always `0.0.0.0` for LAN, some `127.0.0.1` for isolation). Workspace setting forces all teammates to same bind → situational team decision. Env `HOST` per-process override; `--host` CLI per-invocation. |
| `server.openOnAgentEdit` | bool | `false` | config-only | user | ✅ | ⚠ | — | UX preference: should preview open when an agent edits? User-pref by nature; persistent across sessions. No env override (no per-process scenario). |
| `preview.baseUrl` | URL? | unset | config + env override | workspace | ❌ each project differs | ✅ team's deployed wiki | — | URL the preview tab points at when no local UI is running. Team's deployed wiki URL is the canonical workspace value. User-global makes no sense (each project has its own deployed wiki). Env `OPEN_KNOWLEDGE_PREVIEW_BASE_URL` for per-developer local override. ui.lock supersedes when local `ok ui` is running. |
| `folders[]` | array of `{match: glob, frontmatter: {title?, description?, tags?}}` | `[]` | config-only | workspace | 👍 global conventions | ✅ team rules | — | Per-folder rules merged across scopes (Q11): `folders` MERGES (concat + dedup); user can ship global "specs/**" conventions. Workspace is the canonical home; user-global is for portable conventions. |
| `mcp.autoStart` | bool | `true` | config + env override | user | ✅ | ⚠ project opt-out | — | Whether `ok mcp` auto-spawns `ok start`. User installation preference (uniform across projects). Per-project opt-out exists for the .git auto-init concern (engine's `ensureProjectGit` side-effect). Env `OK_MCP_AUTOSTART=0` per-process override. |
| `mcp.tools.read_document.historyDepth` | int ≥ 0 | `5` | config-only | user (`agentSettable: true`) | ✅ | 👍 team standard | — | Agent self-tuning preference: how many history entries `read_document` returns. Agent can tune via `set_config`. Team standardization possible at workspace. |
| `mcp.tools.search.maxResults` | int ≥ 1 | `50` | config-only | user (`agentSettable: true`) | ✅ | 👍 team standard | — | Same shape as historyDepth. Search result cap. The tool's truncation hint literally tells the agent to raise this knob; D26 lets agents do that. |
| `appearance.theme` | `'light' \| 'dark' \| 'system'` | `'system'` | config-only | user | ✅ | 👍 team brand | — | UI theme. Personal preference (most users); team-brand override valid (workspace). NEW per D20. localStorage `ok-theme-v1` stays as derived FOUC cache + write-through cache. |
| `appearance.editorModeDefault` | `'wysiwyg' \| 'source'` | `'wysiwyg'` | config-only | user | ✅ | 👍 team default | — | Default editor mode for new docs. Same shape as theme. |

### 9.5.5 Per-field — fields NOT in v0 schema

| Field | Status | Why dropped / not added | Re-add path |
|---|---|---|---|
| `sync.enabled` | DROPPED | UI toggle writes to `sync-state.json` directly today; dual-home would split ownership. Engine reads from state file. | Future Work: paired with `.local.yml`; D28 settings-vs-state migration moves toggle to config |
| `sync.pushIntervalSeconds` | DROPPED | 90%+ users leave default 60s; engine has well-considered jitter+backoff; was schema-only-not-wired (P31 violation). | Future Work: re-add when engine wiring + slow-network user evidence justifies |
| `sync.pullIntervalSeconds` | DROPPED | Same: default 30s; was schema-only-not-wired. | Future Work: paired with above |
| `sync.autoCommit` | DROPPED | Engine has no skip-commit code path today; schema documented a knob that didn't work. P31 + P32. | Future Work: requires engine feature work (~50 LoC) — add when manual-review workflow demand surfaces |
| `sync.autoPush` | DROPPED | Same shape as autoCommit; engine always pushes. | Future Work: paired |
| `sync.autoPull` | DROPPED | Same: engine always pulls. | Future Work: paired |
| `sync.commitMessage` | DROPPED | Engine builds messages itself; no template support today. | Future Work: requires engine template support (~30 LoC) |
| `persistence.debounceMs` | DROPPED | 99%+ users won't touch CRDT-disk debounce; engine has well-considered 2000ms default. P32. | Future Work: re-add on slow-disk evidence |
| `persistence.maxDebounceMs` | DROPPED | Same: 10000ms default holds for the cardinality OK targets. | Future Work: paired |
| `server.port` | DROPPED | Per-machine only (workspace = teammate-breaking; user-global = cross-project port collision); env `PORT` + CLI `--port` are the natural override path; no clean 2-tier home. | Future Work: re-add under `defaultScope: 'local'` paired with `.local.yml` |

### 9.5.6 Cross-scope merge semantics (Q11 territory)

When a field is set at multiple scopes, how does the loader merge?

| Field shape | Merge across scopes | Rationale |
|---|---|---|
| `folders[]` | **Concat + dedup** by structural equality | Per-rule additive across user-global + workspace. Renovate's per-option-mergeability pattern. User's global folder conventions stack on team's workspace folder rules. |
| `content.include` / `content.exclude` | **Replace** (workspace wins, falls back to user) | Filter-set intent — replace is correct; appending to "include" doesn't have clear semantics. |
| All scalar / object fields | **Replace** (most-specific scope wins) | VS Code's array-replace + scalar-replace defaults. |

### 9.5.7 Settings vs state vs secret — three storage classes

| Class | What lives here | Where on disk | Mutated by | Gitignored? |
|---|---|---|---|---|
| **Settings** (declarative user intent) | Schema-shaped fields users tune via Modal / file / `applyConfigPatch` | `~/.open-knowledge/config.yml`, `<project>/.open-knowledge/config.yml`, future `.local.yml` | `applyConfigPatch` only (D5) | User-global: caller's choice. Workspace: usually committed. Local: gitignored. |
| **State** (runtime observations) | Engine-computed values: timestamps, counters, state-machine values, lock metadata | `<project>/.open-knowledge/sync-state.json`, `server.lock`, `ui.lock`, `cache/` | Engine writes; user never edits | **Yes** (per `init.ts:165`) |
| **Secrets** (credentials) | Tokens, API keys, OAuth tokens, passwords | OS keychain (`@napi-rs/keyring`) primary; `~/.open-knowledge/auth.yml` chmod 0600 fallback | Auth flow (login command, callback handler) | **Yes** (auth.yml gitignored at user-global) |

**Grandfathered exception**: `syncEnabled` currently lives in `sync-state.json` (settings-shaped value in state file) because the toggle UI predates `applyConfigPatch`. Documented per P1 with a Future Work entry to migrate when `.local.yml` lands.

### 9.5.8 How to add a new schema field (the precedent in action)

When proposing a new config field, walk the framework:

1. **Is it a secret?** → keychain. Stop.
2. **Will 90%+ users tune?** → If no, hardcode in engine. Stop.
3. **Is it array/record?** → config-only. Pick scope, add to schema.
4. **Is it scalar with team-shared use case?** → config (workspace defaultScope), optional env override.
5. **Is it scalar with user-pref nature?** → config (user defaultScope).
6. **Is it scalar per-machine-only with no clean 2-tier home?** → env-only. Triggers `.local.yml` Future Work re-evaluation.
7. **Tag agent-settable?** → If agent has natural domain knowledge + low blast radius → `.meta({ agentSettable: true })` (D26).
8. **Document in `init.ts` template** if the field is one users will reasonably set.
9. **Add an integration test** asserting config-to-runtime contract (every leaf field gets one — prevents the half-wired drift that bit `sync.*`).

This precedent is durable — every PR adding/removing/moving a config field cites this section.

## 9.6) Mutation contract

This section formalizes the wire contract for `applyConfigPatch` and the HTTP/MCP/CLI surfaces that funnel through it. Three concerns: which PATCH dialect we implement, how we validate, and how we prevent concurrent writers from silently overwriting each other. Together these form the v0 mutation contract — adopted now to set the precedent before fan-out across more routes makes consistency expensive.

### 9.6.1 PATCH dialect: RFC 7396 JSON Merge Patch, with `folders[]` as documented exception (D31)

**Wire contract.** `applyConfigPatch` implements [RFC 7396 JSON Merge Patch](https://datatracker.ietf.org/doc/html/rfc7396) — the IETF-standardized partial-update dialect. The HTTP endpoint signals this via `Content-Type: application/merge-patch+json`. Semantics:

| Client sends | Server does |
|---|---|
| Top-level key with a value | Override that key's value |
| Top-level key absent | Leave that key unchanged |
| Top-level key with `null` | Delete that key |
| Nested object | Recursively apply the same rules to the sub-tree |
| Array | **Replace wholesale** (per RFC 7396 §1) |

**Why pick a dialect at all.** The default behavior in TypeScript backends — "spread the partial body into the existing record" — replaces nested objects rather than merging them recursively. A client that sends `{ mcp: { tools: { search: { maxResults: 100 } } } }` expecting partial update would otherwise wipe out `mcp.tools.read_document.historyDepth`. RFC 7396 standardizes the recursive merge with null-as-delete, which is what consumers actually expect. The same shape ships in production at GitHub (resource PATCH endpoints), Stripe (most endpoints; metadata is a key-level variant), Linear, and Shopify.

**Why arrays replace by default.** RFC 7396 treats arrays as atomic. Element-wise merge requires an identity model — an answer to "is this element in the patch the same as that element in the current state?" — that doesn't exist for most arrays. `content.include: ['*.md']` has no concept of "this glob is the same as that glob." For `folders[]`, the `match` field IS the identity (each rule is keyed by its glob pattern), so merge is well-defined; that's the carve-out below.

**The `folders[]` exception.** Within a single scope's value, `folders[]` still replaces wholesale per RFC 7396 — when an agent or user submits a patch with `folders: [...]`, they're declaring the new state of that array at that scope. The exception applies to **cross-scope merge** (D25 inference): when the user-global config sets `folders[]` and the workspace config also sets `folders[]`, the loader concatenates and dedupes by `match`, rather than letting workspace replace user-global wholesale. This is the per-rule additivity pattern Renovate uses for its `packageRules`. (See §9.5.6 for the full cross-scope merge table; this section just states the per-write behavior.)

**Failure on a malformed patch.** If `parseDocument` throws on a malformed YAML or the patch is structurally invalid, the response is a `PARSE_ERROR` envelope variant — see §9.7. No partial state lands on disk; atomic tmp+rename ensures all-or-nothing at the file system layer.

### 9.6.2 Two-validator pattern: patch payload + merged document (D32)

**Rule.** Every `applyConfigPatch` call runs two distinct Zod validation passes:

1. **Patch validator** (`ConfigPatchSchema.safeParse(rawPatch)`) — the deep-partial input is well-formed. Types match; per-field constraints hold; agent-callable surface gated to the allowlist (D26); unknown fields handled per the schema's mode.
2. **Merged-document validator** (`ConfigSchema.safeParse(merged)`) — the merged result (current state + patch applied via RFC 7396) is a valid full `ConfigSchema`: cross-field invariants hold (any `.refine` calls), no required fields missing, defaults coherent.

Both passes run server-side. A failure in either returns a `VALIDATION_FAILED` envelope (§9.7) with the issue path mapped back to the source position (§9.6.4); no write happens.

**Why two passes.** Schema libraries validate what the consumer sent, not what the resulting document is. Two failure modes are uncatchable by patch-only validation:

- **Required-field clear via null.** `{ "mcp": { "autoStart": null } }` validates against the patch shape (the field is optional and clearable in a patch) but produces a merged document with `autoStart` missing, which violates the full schema's required-with-default constraint.
- **Cross-field invariants.** If a future schema refinement says "if `appearance.theme === 'system'`, then `appearance.systemThemeFollowsOs` must be `true`," a patch changing only `theme` produces a merged document that violates the refinement; the patch validator (which doesn't know about other fields' current values) cannot catch it.

Kubernetes admission webhooks formalize this split — *mutating webhook sees partial state, validating webhook sees the merged document.* In TypeScript, application code assembles the two passes from `(merge logic) + (full schema parse)` because Zod doesn't ship merge-then-validate as a primitive.

**Implementation sketch:**

```ts
async function applyConfigPatch(opts: ApplyConfigPatchOpts): Promise<ApplyConfigPatchResult> {
  // Pass 1: patch payload validator
  const patch = ConfigPatchSchema.safeParse(opts.rawPatch);
  if (!patch.success) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', issues: toWireIssues(patch.error) } };
  }

  // Apply RFC 7396 merge via yaml@2 Document layer
  const currentDoc = parseDocument(currentYaml);
  const merged = mergePatch7396(currentDoc, patch.data);

  // Pass 2: merged-document validator
  const result = ConfigSchema.safeParse(merged.toJS());
  if (!result.success) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', issues: toWireIssues(result.error) } };
  }

  // Atomic write
  await atomicWrite(merged.toString());
  return { ok: true, applied: extractPaths(patch.data), effective: result.data, etag: hash(merged.toString()) };
}
```

**Test invariant.** A patch like `{ "mcp": { "autoStart": null } }` is rejected with a clear path-anchored error. The integration test in `packages/server/src/config-edit.test.ts` asserts pass 2 catches this.

### 9.6.3 Concurrency control: ETag/If-Match (HTTP), `expectedVersion` (MCP) (D33)

**The failure mode.** Atomic tmp+rename writes prevent file corruption (one writer wins the rename). They do NOT prevent lost updates. Concrete scenario: agent calls `get_config`, receives current state at version v7, decides to set `mcp.tools.search.maxResults: 100`, calls `set_config({patch})`. Meanwhile, the user toggles the same field to `25` via the Modal. Both writes succeed; the second writer silently overwrites the first; nobody knows which value won. Atomic write tells you nothing about which.

**HTTP contract.** [RFC 7232](https://datatracker.ietf.org/doc/html/rfc7232) defines the standard primitive:

- `GET /api/config?scope=...` returns an `ETag: "<sha256-of-canonical-bytes>"` header alongside the body.
- `POST /api/config/patch` requires `If-Match: <etag>` on every request. The server compares the supplied ETag to the current state's hash.
- **Match** → apply the patch atomically, return `200 OK` + new `ETag` header.
- **Mismatch** → return `412 Precondition Failed` with body `{ ok: false, error: { code: 'CONFLICT', detail, currentEtag } }`. Client refetches via `GET /api/config` and reconsiders the change.
- **Header missing** → return `428 Precondition Required` (RFC 6585) with the same envelope. Server refuses unconditional writes on this endpoint.

**MCP contract.** The protocol has no headers on tool calls, so the equivalent goes in the input schema:

- `set_config` accepts an optional `expectedVersion?: string` (the ETag from the agent's most recent `get_config`).
- **Supplied and matched** → apply the patch.
- **Supplied and mismatched** → return `isError: true`, `structuredContent: { ok: false, error: { code: 'CONFLICT', detail, currentEtag } }`, plus actionable text in `content[]`: *"Config changed since you last read it (your version: <x>, current: <y>). Call get_config to see the current state, then retry your patch."*
- **Omitted** → write proceeds without concurrency check. The server can't enforce something the agent didn't opt into.

The optionality matters: a one-shot edit (agent decides to change one field, sends one patch, doesn't intend to read first) can omit `expectedVersion` and accept last-writer-wins. A careful agent doing read-modify-write threads the ETag through and gets safety. Same shape as filesystem MCP's `edit_file` (no idempotency primitive — caller's responsibility) vs `write_file` (PUT-of-whole-state, idempotent by construction).

**Modal interaction.** Auto-save (D8) means small per-field commits. On 412, the Modal silently refetches via `GET /api/config`, re-applies the user's pending field change against the new baseline, and retries the POST. The dirty-state for the in-flight field is preserved through the refetch — auto-save means there's only ever one field in flight at a time.

**LLM-retry framing.** The error message text on conflict is deliberately shaped to teach the agent that retry IS the appropriate response: *"Config changed since you last read it. Call get_config and retry."* Without the actionable framing, agents abandon the call after one failure.

### 9.6.4 Source-located error messages (D36)

Validation failures surface the offending file path, line, and column — not just a JSON pointer. Applies to `loadConfig`, `ok config validate`, `applyConfigPatch`, and the Modal's display of validation rejections.

**Why.** Today's loader (`loader.ts:88-95`) throws `Error('Invalid configuration:\n  path: message\n...')` with no file:line:col. The user sees `mcp.tools.search.maxResults: Expected number, got string` and has to grep for the field in their YAML. Biome's lint errors include `file:line:col` plus a code snippet with the offending token highlighted; that's the bar.

**Implementation.** The loader switches from `parseYaml` (string → JS object) to `parseDocument` (yaml@2's source-position-preserving parser — already in production at `seed/apply.ts:88-104` for write paths). When `ConfigSchema.safeParse` fails, walk each issue's `.path` back to source positions via the Document AST: `doc.getIn(path)` returns the `Node` whose `.range` carries `[startByte, endByte]` offsets; translate to line/col against the source string.

**Output format:**

```
Error: Invalid configuration at /home/alice/proj/.open-knowledge/config.yml:14:7
  mcp.tools.search.maxResults: Expected number, got string

  12 |   tools:
  13 |     search:
  14 |       maxResults: "fifty"
     |       ^^^^^^^^^^^^^^^^^^
```

**Modal mapping.** Each Zod issue's `.path` array maps directly to a rendered field. The Modal scrolls to the field, highlights it, and surfaces the message inline — same machinery as the source-located CLI error, applied to the form representation.

**Test.** Integration test asserts that `ok config validate` on a fixture file with `pushIntervalSeconds: "fifty"` emits an error message containing the literal string `config.yml:<line>:` with the correct line number.

## 9.7) Error envelope: single source, multiple wire renderings

**Decision (D30, resolves Q1).** One canonical Zod discriminated union — `ApiError` — defines every error shape across HTTP, MCP, and CLI surfaces. Existing route handlers using `{ok, error: string}` (singular, ~50 routes) and seed handlers using `{ok: false, error: {kind, message}}` (singular discriminated, 2 routes) refactor to the new envelope as part of v0 implementation. After this spec lands, the repository ships one error contract.

### 9.7.1 The canonical envelope

```ts
export const ApiError = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('VALIDATION_FAILED'),
    issues: z.array(z.object({
      // Coerced from Zod's PropertyKey[] for JSON-serializability:
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
      issueCode: z.string(),  // Zod's iss.code, preserved when available
      params: z.record(z.string(), z.unknown()).optional(),  // Domain-specific code escape hatch
    })),
  }),
  z.object({ code: z.literal('NOT_FOUND'), resource: z.string() }),
  z.object({ code: z.literal('FORBIDDEN'), reason: z.string().optional() }),
  z.object({ code: z.literal('CONFLICT'), detail: z.string(), currentEtag: z.string().optional() }),
  z.object({ code: z.literal('NOT_AGENT_SETTABLE'), path: z.array(z.string()) }),
  z.object({ code: z.literal('PARSE_ERROR'), detail: z.string() }),
  z.object({ code: z.literal('WRITE_ERROR'), detail: z.string() }),
  // Forward-compat tail variant — old clients render new codes generically rather than crashing
  z.object({ code: z.string(), message: z.string().optional() }).catchall(z.unknown()),
]);

export type ApiError = z.output<typeof ApiError>;
```

**Path coercion at the wire boundary.** Zod's `issue.path` is `PropertyKey[]` (`string | number | symbol`). Symbols are not JSON-serializable — `.join('.')` either throws on symbol segments or produces unparseable `"Symbol(name)"` strings. The helper `toWireIssues(zodError)` coerces every segment via `seg => typeof seg === 'symbol' ? String(seg) : seg`. This is the same gotcha every framework that exposes Zod errors at HTTP boundaries hits (Hono `zValidator`, tRPC `errorFormatter`, next-safe-action all carry equivalent coercions).

**Forward-compat tail variant.** The final `z.object({ code: z.string(), ... }).catchall(z.unknown())` is the catch-all that lets old clients render new error codes generically — they won't crash on `code: 'RATE_LIMITED'` (added in v0.5) when they only know about `code: 'NOT_FOUND'` (the v0 set). Without it, every new error variant is a breaking change for pinned-version SDK consumers.

### 9.7.2 Per-consumer rendering

The envelope is defined once. Each boundary translates it into its consumer's expected shape at the route layer. The translations are mechanical and isolated to four files; consumers share zero translation code.

**HTTP**:
```ts
function statusFor(error: ApiError): number {
  switch (error.code) {
    case 'VALIDATION_FAILED': return 422;  // parsed but failed validation
    case 'PARSE_ERROR':       return 400;  // malformed input
    case 'NOT_FOUND':         return 404;
    case 'FORBIDDEN':         return 403;
    case 'CONFLICT':          return 412;  // RFC 7232 If-Match mismatch
    case 'NOT_AGENT_SETTABLE': return 403; // path is gated for agents
    case 'WRITE_ERROR':       return 500;
    default:                  return 500;  // forward-compat tail variant
  }
}

// In the handler:
if (!result.ok) return json(res, statusFor(result.error), { ok: false, error: result.error });
return json(res, 200, { ok: true, applied: result.applied, etag: result.etag });
// The 'application/json' Content-Type is sufficient — no need for application/problem+json
// since the envelope itself is a discriminated union (clients can route on `code`).
```

**MCP** (dual-emit pattern per the [2025-06-18 spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)):
```ts
function asMcpToolResult(result: ApplyConfigPatchResult) {
  if (result.ok) {
    return {
      structuredContent: { ok: true, applied: result.applied, current: result.effective, scope: result.scope },
      content: [{ type: 'text', text: JSON.stringify({ ok: true, applied: result.applied, scope: result.scope }, null, 2) }],
    };
  }
  return {
    isError: true,
    structuredContent: { ok: false, error: result.error },
    content: [{ type: 'text', text: humanFormat(result.error) + '\n\nPlease fix and try again.' }],
  };
}
```

The trailing `"Please fix and try again"` is the LLM-retry framing — it tells the model that retry IS the appropriate response, rather than abandoning the call after one failure. The `humanFormat()` helper renders the discriminated union to readable prose (essentially the same shape as `z.prettifyError` for `VALIDATION_FAILED`, and direct prose for the other variants).

**CLI** (`ok config validate`):
```ts
function exitWithError(error: ApiError): never {
  process.stderr.write(humanFormat(error) + '\n');
  process.exit(error.code === 'VALIDATION_FAILED' ? 1 : 2);  // 1 = validation, 2 = misuse
}
```

For `VALIDATION_FAILED`, `humanFormat` uses the source-position machinery from §9.6.4 to emit `file:line:col` plus code snippet. For other variants, plain prose to stderr.

### 9.7.3 Why one envelope (not three)

The spec previously recommended "additive only" — keep the existing singular and discriminated-singular shapes; add the plural shape only on new routes. That's pragmatic but architecturally wrong for greenfield: it commits the codebase permanently to multiple translation layers, and every future error variant requires N updates across N adapters.

**Three concrete benefits of one envelope:**

1. **Type-safe exhaustive handling.** TypeScript narrows the discriminated union; `switch (error.code)` with a `default: never` clause catches unhandled variants at compile time when a new variant is added.
2. **Single source of code-set truth.** Adding `RATE_LIMITED` once updates HTTP status mapping, MCP rendering, CLI text, and any future SDK in one PR. With three shapes, each adds is a 4-place edit.
3. **No "which shape am I parsing today?" question for consumers.** Modal, MCP client, future SDK all key on `code`. Onboarding cost drops; failure-mode breadth drops.

**Refactor scope.** ~50 existing routes returning `{ok, error: string}` get rewritten to `{ok: false, error: { code: '...', ...}}`. Each is ~5 LoC. The 2 seed routes' `{ok: false, error: {kind, message}}` shape maps onto `ApiError` variants where `kind` becomes `code`. One day of focused work for a clean precedent.

**What we don't adopt.** RFC 9457 Problem Details (`type` URI, `title`, `status`, `detail`, `instance`) is overkill for OK's local-only API surface — its value is cross-language interop, which we don't need. The discriminated-union JSON envelope is sufficient and lighter. We can add RFC 9457 rendering later (additive — same envelope, new translation function) if a public-API need emerges.

## 9.8) Boundary discipline

This section formalizes three rules that govern code at every boundary touched by this spec. Each is a foundational pattern; together they make `applyConfigPatch` and its consumers compose cleanly.

### 9.8.1 `applyConfigPatch` returns `Result<T, E>`; throws reserved for programmer errors only (D35)

**Type signature:**
```ts
type ApplyConfigPatchResult =
  | { ok: true; applied: string[]; effective: Config; etag: string; scope: 'workspace' | 'user' }
  | { ok: false; error: ApiError };

export async function applyConfigPatch(opts: {
  rawPatch: unknown;            // not yet parsed — applyConfigPatch parses it
  scope: 'workspace' | 'user';  // required for HTTP/CLI; MCP server-side inferred per D25
  expectedVersion?: string;     // optional ETag for concurrency check (D33)
  contentDir: string;
  homedir?: string;             // override for testing
  agentSettableOnly?: boolean;  // true for MCP-originated calls, false for HTTP/CLI
}): Promise<ApplyConfigPatchResult>;
```

`applyConfigPatch` does not throw for any expected failure mode (validation, concurrency conflict, write error, malformed input, scope inference failure). It throws only for **programmer errors** — assertion failures, broken invariants, contract violations. Internal modules within `applyConfigPatch`'s own implementation may still throw; the throw-vs-return rule is at the boundary the consumers see.

**Why.** Thrown errors are invisible in TypeScript signatures (no `throws` clause). A function that throws `ValidationError | ConflictError | WriteError` forces every caller to read the implementation to know what to catch, and any caller that misses a case has a runtime bug the compiler can't help with. Discriminated `Result<T, E>` makes the failure modes part of the type contract — the compiler forces every caller to address them via the `if (!result.ok)` branch.

**Per-consumer translation:**

```ts
// HTTP handler (api-extension.ts)
async function handleConfigPatch(req, res, body) {
  const result = await applyConfigPatch({
    rawPatch: body.patch,
    scope: body.scope ?? 'workspace',
    expectedVersion: req.headers['if-match'],
    contentDir,
    agentSettableOnly: false,
  });
  if (result.ok) return json(res, 200, { ok: true, applied: result.applied, etag: result.etag });
  return json(res, statusFor(result.error), { ok: false, error: result.error });
}

// MCP tool (set-config.ts)
server.tool('set_config', SET_CONFIG_DESCRIPTION, SetConfigInputSchema, async (args) => {
  const result = await applyConfigPatch({
    rawPatch: args.patch,
    scope: inferScope(args.patch, currentConfig),  // D25 inference
    expectedVersion: args.expectedVersion,
    contentDir,
    agentSettableOnly: true,
  });
  return asMcpToolResult(result);
});

// CLI (commands/config.ts validate subcommand)
const result = await applyConfigPatch(...);
if (!result.ok) exitWithError(result.error);
```

One function, three boundaries, three renderings. The translations are isolated to the route files; the core logic doesn't know which surface called it.

**Internal modules** (within `config-edit.ts`'s own implementation) may still throw — `assert(typeof patch === 'object')` is appropriate. The discipline is at the public-export boundary.

### 9.8.2 Schema as single source of truth, projected per role (D30 cross-cutting)

`ConfigSchema` plays at least seven roles in this codebase: HTTP wire format, user-authored YAML, MCP tool input, Modal form validator, IDE LSP target via JSON Schema, CLI input source, compile-time TypeScript types. Each role has a different design pressure, but all derive from one shared definition.

**The pattern:**

```ts
// Pure shape — no .default(), no .transform(), no .coerce() in the shared definition
const baseConfigShape = {
  content: z.looseObject({
    dir: z.string(),
    include: z.array(z.string()).min(1),
    exclude: z.array(z.string()),
  }),
  // ... other sections
};

// Role: on-disk YAML + read effective config (defaults applied)
export const ConfigSchema = z.looseObject(baseConfigShape).default({...});
export type Config = z.output<typeof ConfigSchema>;

// Role: HTTP/MCP/CLI patch input (deep-partial of allowlisted paths, agent-settable filtered for MCP)
export const ConfigPatchSchema = configPatchSchemaFromAllowlist(ConfigSchema);
export type ConfigPatch = z.input<typeof ConfigPatchSchema>;

// Role: IDE LSP target (input view — what the user types, not what the runtime resolves)
export function emitJsonSchemaForIde(): JSONSchema {
  return z.toJSONSchema(ConfigSchema, { io: 'input', target: 'draft-07' });
}
```

**Three rules that make this safe:**

1. **No transforms or coercions in the shared schema.** `z.string().transform(s => new Date(s))` produces a runtime type (`Date`) that JSON Schema cannot describe — the IDE shows `string`, the LLM sees `string`, but the parse returns `Date`. Today's schema is clean (good); a guardrail test (load `dist/config-schema.json`, parse a sample with both ajv and `ConfigSchema.parse()`, assert equivalence) prevents regressions.

2. **`z.input<>` ≠ `z.output<>` under `.default()`.** A field with `.default('localhost')` has input type `string | undefined` (the user can omit it) and output type `string` (the server fills it in). The IDE schema must use `io: 'input'` so users see "this field is optional"; the engine works with `Config = z.output<typeof ConfigSchema>` because it sees resolved values. FR-18 specifies `io: 'input'` explicitly.

3. **`z.looseObject` (D34), not `z.object` or `z.strictObject`.** Forgiveness over strictness — see §9.8.3.

### 9.8.3 `z.looseObject` for forgiveness on human-authored configs (D34)

**Decision.** `ConfigSchema` and all nested object schemas use `z.looseObject({...})` (Zod v4 idiom — equivalent to `z.object({...}).catchall(z.unknown())`).

**Why.** Human-authored configs accumulate stale fields across upgrades. A user who set `sync.pushIntervalSeconds: 30` six months ago — before D29 dropped the field — has the line still in their workspace YAML. Three options:

| Schema mode | Behavior on file with stale field | Cost |
|---|---|---|
| `z.strictObject` | Validation fails outright; loader rejects the file. | User can't load OK at all until they manually edit. |
| `z.object` (strip — Zod default) | Field passes validation but is silently dropped from the parsed object. | The next `applyConfigPatch` write may erase the field from disk; user's text is silently deleted. |
| `z.looseObject` | Field passes validation, sits on disk untouched (yaml@2 round-trip preserves unknown keys), engine ignores it. | User's text is preserved; the codemod (D37) is the proactive cleanup path. |

**Loose** is the only mode that preserves user text without breaking on upgrade. This is Biome's lesson from its v2 migration, and it's the dominant pattern across mature config-driven tools.

**Critical interaction with D37 (codemod).** Loose-mode passthrough is the safety net so users mid-upgrade aren't broken. The codemod (`ok config migrate`) is the proactive cleanup that removes dropped fields explicitly with the user's consent. Both layers are needed: without loose mode, users are broken until they run the codemod; without the codemod, dead text accumulates in config files indefinitely.

**Strict mode IS still valid** for specific narrow sub-objects where typos are more likely than forward-compat fields (e.g., a known-small enum's options block). Default is loose; strict is opt-in per sub-object.

**Test.** Integration test asserts that a config file with `sync.pushIntervalSeconds: 30` (a dropped field) loads successfully, the engine ignores it, and a subsequent `applyConfigPatch` write preserves the field on disk in the original position with comments intact.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Storage stays YAML on disk; `yaml@2` Document layer for round-trip | T | LOCKED | Yes | Comment preservation requires Document AST; `js-yaml` disqualified | `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` | All write paths use `parseDocument` + `setIn` + `toString` |
| D2 | Zod schema is the single source of truth; `z.toJSONSchema()` is export side-product | T | LOCKED | Yes | Bridge ecosystem consolidated on Zod v4 native; reverse direction is codegen-only | `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md` | All consumers (MCP `inputSchema`, IDE schema, form walker) derive from one Zod source |
| D3 | Single MCP `set_config` upsert tool with deep-partial input | T | LOCKED | Yes | 2-6 tools/server optimum; per-domain explosion violates MCP design | `reports/config-edit-paths/REPORT.md` D4 | Future per-section tools would be additive; can't easily refactor away |
| D4 | Custom shadcn form walking Zod schema (no form library) | T | LOCKED | No | RJSF/JSON Forms drop `.refine()`; react-formgen alpha; ~150 LoC walker for our scale | `reports/config-edit-paths/evidence/d3-form-libraries.md` | Walker is ours to maintain; offsets external dependency risk |
| D5 | All `config.yml` writers — Modal, MCP `set_config`, HTTP, AND existing `seed/apply.ts:85-113` `folders[]` writer (shipped in #319) — funnel through `applyConfigPatch` shared write primitive. Seed currently bypasses (pre-existed our spec); refactoring `seed/apply.ts` onto `applyConfigPatch` is **in-scope for v0 implementation** (see FR-9b). | X | LOCKED | Yes | Single source of validation truth; cascade via CC1 to all surfaces; preserves FR-14 invariant (every successful write signals CC1 `'config'`) — seed/apply currently doesn't, which is the structural reason refactor is in-scope, not future work. | VS Code `ConfigurationEditingService` precedent + in-repo `seed/apply.ts:88-104` (Tim's #319, merged 2026-04-27) proves the `parseDocument` → mutate → `toString` round-trip pattern works in production | Migrating seed/apply unifies the primitive; assumption A2 upgrades from research-verified to repo-verified |
| D6 | CC1 'config' channel for external-edit refresh | T | LOCKED | No | Reuses existing `__system__` push primitive | `evidence/codebase-integration-points.md` §5 | Adds one channel literal; SystemDocSubscriber routing update |
| D7 | Modal UI shape: shadcn `<Dialog>` overlay | P | DIRECTED | No | Already installed; multiple precedents (CloneDialog, NewItemDialog); modal blocks editor underneath cleanly | `evidence/codebase-integration-points.md` §1 | Could swap to `<Sheet>` or page route later if needed |
| D8 | Auto-save with per-control commit (matches VS Code Settings UI) | P | LOCKED | No | Dissolves dirty-state-vs-external-edit conflict; matches well-known precedent | VS Code `ConfigurationEditingService` | No Save button; field commits on blur (text) or change (boolean/select) |
| D9 | Per-field Reset to default (hover icon, VS Code pattern) | P | DIRECTED | No | Cheap; covers "undo my mistake" without global undo stack | VS Code Settings UI | Walker must detect `.default()` wrappers per field |
| D10 | Block writes while invalid (validate-before-commit) | P | DIRECTED | No | Matches form-library pattern; keeps disk clean; instant feedback | RJSF/JSON Forms canonical pattern | Server-side safeParse is final safety net |
| D11 | Scope: workspace + user-global, both via Modal scope picker | P | LOCKED | Yes | Honors "Electron users never use CLI" principle; user-global is real today | Investigation: `loader.ts:67-98` reads both | Modal needs scope tabs; HTTP/MCP take `scope` param; OK becomes first writer to `~/.open-knowledge/config.yml` |
| D12 | Bundle Tier 1 (SchemaStore + magic-comment + `ok config validate`) into this spec | P | DIRECTED | No | Same Zod source; same build step; ships value before Modal lands | Stakeholder pref | ~3-4 incremental days; no new spec/audit overhead |
| D13 | CLI command name: `ok config validate` (not `ok validate config`) | T | LOCKED | Yes (CLI consumers) | Per-domain top-level commands is the dominant pattern; no umbrella in surveyed cohort | `evidence/validation-cli-patterns-3p.md` | Future siblings: `ok validate-links`, etc. — peer commands |
| D14 | Error shape contract: a single Zod discriminated union `ApiError` (keyed on `code` literal) defines every error variant. Per-issue shape inside `VALIDATION_FAILED`: `{path: (string\|number)[], message, issueCode, params?}` (Zod path symbols coerced to strings at the wire). Forward-compat tail variant included so future codes don't break pinned clients. The envelope is rendered per consumer at the boundary (HTTP envelope body + status code, MCP `isError + structuredContent + content[].text`, CLI `prettifyError` to stderr). See §9.7. | T | LOCKED | Yes (CLI + MCP consumers) | One source of truth for error contract — adding a code updates HTTP status mapping, MCP rendering, CLI text, and any future SDK in one place. Discriminated union gives compile-time exhaustive matching. Path coercion at wire avoids the Zod `PropertyKey[]` symbol-serialization gotcha. Tail variant prevents new error codes from breaking pinned clients (open-enum discipline). | RFC 9457 Problem Details (one envelope shape, multiple consumer renderings); Stripe's typed-error-class hierarchy with serializable `type: string` discriminator (the stripe-node #1374 lesson) | All future validators adopt the same shape; D30 establishes that existing `{ok, error: string}` and seed `{ok: false, error: {kind, message}}` routes refactor to this envelope as part of v0 implementation (resolves Q1 → align). |
| D15 | `runConfigValidation()` lives in `@inkeep/open-knowledge-server` (not CLI-only) | T | DIRECTED | No | Single source for CLI command + `applyConfigPatch` + future surfaces | `evidence/codebase-integration-points.md` §5-6 | Core/server adopts the validator runner shape |
| D16 | Settings entry hidden in Electron Navigator window | P | LOCKED | No | Navigator has no utility, no contentDir; project-scoped settings have nothing to bind to | `evidence/codebase-integration-points.md` §8 | Renderer checks `mode === 'navigator'` |
| D17 | HTTP endpoints behind `checkLocalOpSecurity` (DNS-rebind + loopback + Host) | T | DIRECTED | No | Config is per-machine sensitive state; matches `/api/local-op/*` precedent | `evidence/codebase-integration-points.md` §6 | Stricter than the `/api/workspace` loopback-only gate |
| D18 | New file watcher for `.open-knowledge/config.yml` (workspace + user) | T | DIRECTED | No | Existing watcher is content-only; external-edit detection is new code | `evidence/codebase-integration-points.md` §9 | One new file watcher subscription; debounced 100ms; CC1 'config' on change |
| D19 | Zod walker uses `schema._zod` introspection with explicit per-tag type-guards + JSON-text editor fallback for unknown tags. Zod pinned to exact `4.3.6`. | T | DIRECTED | No | Empirical: `_zod` is published TypeScript-typed introspection surface in Zod v4 (not "internal" in v3 sense). Pin protects against intra-v4 schema-internals changes. | `node_modules/zod/v4/core/schemas.d.cts` line ~1080 + scan of `_zod:` exports | Walker degrades gracefully on schema constructs we don't yet handle |
| D21 | Settings entry points (final set): (i) HelpPopover entry, (ii) Cmd-, shortcut, (iii) CommandPalette entry, (iv) Electron App menu item ("Settings…" in **macOS app menu** between About and first separator; **File menu** on Windows/Linux). Skip dedicated icon. | P | LOCKED | No (UX additive) | Cmd-, = muscle-memory for known destination; omnisearch = discovery for unknown destination — every surveyed unified-Cmd-K app (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps both. Apple HIG places Settings in the app menu specifically (not Help). HelpPopover covers casual user discovery + web users (no menu bar). CommandPalette entry is forward-compatible (becomes a "Commands" source under future omnisearch). **Diverges from Tim's #318 Help-submenu placement for Install** — different items, different conventions: Install is a custom action (Help is reasonable); Settings is HIG-blessed for the app-name menu. | `evidence/electron-cmdk-omnisearch-3p.md` + Apple HIG + `evidence/tim-precedents-from-main.md` Pattern 4 | All four implementation surfaces wired in v0; integration patterns mirror `InstallInClaudeDesktopDialog` per #318 |
| D22 | Settings UI surfaces Install in Claude Desktop as a row in an "Integrations" section, fulfilling Tim's D13 (`specs/2026-04-24-skill-dual-track-install/SPEC.md:185`) original destination intent. Existing #318 entry points (Help submenu, HelpPopover, CommandPalette) stay as secondary discoverability — no removal. | P | DIRECTED | No | Tim's D13 explicitly placed Install at "Settings panel row (primary)"; Help/CommandPalette were interim because the Settings panel didn't exist. When ours ships, the destination intent fulfills naturally. Reuses existing `<InstallInClaudeDesktopDialog>` component — zero new dialog surface. | Tim's spec D13 + `evidence/tim-precedents-from-main.md` Pattern 4 | Adds FR-25; one row in Integrations section; same hash-trigger pattern |
| D20 | Apply VS Code's settings-vs-state topology to OK. User-tunable preferences move to config.yml under a new `appearance` section: `appearance.theme: 'light' \| 'dark' \| 'system'` and `appearance.editorModeDefault: 'wysiwyg' \| 'source'` — both optional with sensible defaults. **Section name `appearance` (not `userPrefs`) chosen 2026-04-28** because per D25 these fields can be written at any scope (user / workspace / local); naming them `userPrefs` would have implied user-only scope. Per-tab transient UI state (pin, graph panel state) stays in localStorage and NEVER appears in Settings UI. FOUC scripts in `index.html` read localStorage as a first-paint cache; config.yml is authoritative. localStorage `ok-theme-v1` and `ok-editor-mode-v1` keys become derived caches; silent migration on next theme/mode toggle. | T | LOCKED | Yes (schema addition is additive but the section-name precedent is set once) | Matches VS Code's well-thought-through split. Multi-window theme sync becomes free via CC1. Theme toggle latency goes from ~1ms (localStorage) to ~50-100ms (HTTP roundtrip + Zod validate + atomic write) — acceptable for an occasional UX action. See `reports/config-edit-paths/REPORT.md` D5. | Resolves Q4. `appearance.*` fields' `defaultScope` per D25: `'user'` (theme + editor-mode are user-pref by default; team can still override at workspace; user can override on a single machine via `.local.yml`). Settings UI exposes only config.yml (no separate "Preferences" tab) |
| D23 | Config-edit handlers (HTTP `/api/config/patch`, MCP `set_config`) are EXEMPT from `extractAgentIdentity` — same rationale as `handleSeedPlan` / `handleSeedApply` / sync / local-op handlers: they operate on the local user's machine settings, not agent content. `handleConfigPatch` joins the `EXEMPT_HANDLERS` set in `attribution-sweep-coverage.test.ts`. | T | LOCKED | No (test-asserted) | Direct in-repo precedent set by Tim's #319 (`e1f3adcf`, merged 2026-04-27) — `attribution-sweep-coverage.test.ts:82-86` exempts seed handlers with the same rationale. Resolves Q2. | In-repo: `packages/app/tests/integration/attribution-sweep-coverage.test.ts:82-86` | FR-12 dropped `extractAgentIdentity`; sweep-test allowlist appended on implementation |
| D24 | Settings Modal long-form layout adopts SeedDialog's scrollable-region pattern (post-#340): pinned `<DialogHeader>` + scrollable `<div className="subtle-scrollbar -mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4">` body + pinned `<DialogFooter>`. Required because the Modal renders 8 schema sections + `folders[]` array-of-records — overflows on small Electron windows without this pattern. | P | DIRECTED | No (UX) | Shadcn `<Dialog>` was rewritten in #340 (`698f104b`) from `grid` to `flex flex-col` + `overflow-hidden` + `max-h-[calc(100dvh-2rem)]`; SeedDialog (`packages/app/src/components/SeedDialog.tsx:182-190`) is the canonical post-#340 long-form pattern. | `packages/app/src/components/SeedDialog.tsx:182-190` + `packages/app/src/components/ui/dialog.tsx:55` (post-#340) | Modal renderer (FR-1) inherits the layout invariant; do NOT blanket-override `flex flex-col` |
| D25 | Agent-facing MCP tools (`set_config`, `get_config`) expose **no scope concept**. Server picks the write target via per-field `defaultScope` Zod metadata + `inspectConfig` inference. Algorithm (2-tier ladder per D27 deferral): `inspectConfig(path).workspace ?? inspectConfig(path).user ?? schema.meta.defaultScope ?? 'user'` — most-specific-already-set scope wins (workspace → user-global), with the field's `defaultScope` as fallback when unset everywhere (final fallback `'user'` if no `defaultScope` declared). Per-field `defaultScope` (verified by 4 subagent /explore evaluations 2026-04-28): **workspace** — `folders[]`, `content.*`, `preview.baseUrl`; **user** — `github.oauthAppClientId`, `server.host`, `server.openOnAgentEdit`, `mcp.autoStart`, `mcp.tools.*`, `appearance.*`. **Modal scope tabs and HTTP endpoint still accept explicit `scope`** — those are user-driven gestures with deliberate scope choice. Only the agent-facing MCP tools drop `scope`. | T | LOCKED | Yes (1-way: dropping `scope` from agent surface; adding it later as optional override is additive non-breaking; retracting an exposed `scope` is breaking) | Algorithm precedent: VS Code `Configuration.update()` Layer-B `deriveConfigurationTargets` ([microsoft/vscode `configurationService.ts:1087-1115`](https://github.com/microsoft/vscode)) — write-back-to-current-scope with USER fallback. ~50 LoC server-side: `inspectConfig` (~20 — 2-tier) + per-field `defaultScope` metadata (~25) + algorithm (~5). `inspectConfig` is internal-only — never exposed via MCP/HTTP. Per-field `defaultScope` doubles as schema documentation ("this field's natural home"). | `evidence/electron-cmdk-omnisearch-3p.md` + 2026-04-27 /explore VS Code source + `evidence/eval-group-{A,B,C,D}-*.md` (per-field /explore tracing 2026-04-28) | Agent surface stays minimal (no scope concept anywhere in agent contract — category-aligned with `read_document`/`write_document`/etc.); Modal renderer + chrome inline toggles call `applyConfigPatch` without scope and inherit the inference; FR-6 + FR-6c reflect this. When `.local.yml` ships in Future Work, `defaultScope` gains a `'local'` value for any newly-added per-machine fields — purely additive change. |
| D27 | ~~Ship `.local.yml` as a fourth scope tier in v0~~ **REVISED 2026-04-28 → DEFERRED to Future Work** (resolves Q10 in the negative). Per the 4-subagent /explore audit + per-field schema-grounded analysis, after dropping `sync.*` and `persistence.*` (FR-9c) and removing `server.port` from config (env+CLI handles it), no remaining schema field has a natural home that requires `local` scope. The 2-tier ladder (user-global + workspace) cleanly homes every retained field per the D25 `defaultScope` mapping. Adding `.local.yml` later when a real per-machine schema field needs it is **purely additive**: extend loader chain (~10 LoC), add Modal third tab, declare `defaultScope: 'local'` on the new field. No precedent shifts. | T | DEFERRED (Future Work) | No (additive when added later) | The original LOCK rationale (Cluster B per-machine fields need a home) collapses once `sync.{push,pull}IntervalSeconds` are dropped (engine opinionated) and `server.port` is dropped (env+CLI). `server.host` defaultScope: `user` works in 2-tier; `preview.baseUrl` defaultScope: `workspace` works in 2-tier; `mcp.autoStart` defaultScope: `user` works in 2-tier. Verified by `evidence/eval-group-{A,B,C,D}-*.md` 2026-04-28. | 2026-04-28 verified /explore traces of multi-project port coordination + preview URL semantics + mcp.autoStart consumer | Modal has 2 scope tabs (User, Workspace) in v0; loader has 4 sources (defaults → user → workspace → ENV → CLI). When a future field needs `'local'` scope, this entire decision flips back additively. |
| D26 | Agent-settable allowlist (resolves Q12). Five paths in `ConfigSchema` are tagged `.meta({ agentSettable: true })` and accepted by `set_config`: `folders[]`, `content.include`, `content.exclude`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`. All other paths are rejected with `errors[].code: 'not-agent-settable'`. Modal still shows everything; humans edit anything via UI / file / CLI / HTTP / `applyConfigPatch` direct call. Rationale: agents have direct domain knowledge for content-org (folders, include/exclude) + agent self-tuning (their own MCP tool params); identity / network / UX-preference / system-tuning fields are user-only and agent-driven mistakes there have higher blast radius. Read side (`get_config`) is unrestricted — agents can inspect any field. | T | LOCKED | Yes (1-way: widening the allowlist is additive non-breaking; retracting breaks agents that adopted the wider surface) | Schema-grounded analysis 2026-04-27 (no `embedding.openai.endpoint` field; only 3 fields with real attack surface — `github.oauthAppClientId`, `preview.baseUrl`, `server.host` — all gated out by allowlist). The 2 user-pref fields in the allowlist (`mcp.tools.*`) match agent-self-tuning use cases; their `defaultScope` is `'user'` per D25 so they don't accidentally land in workspace. | Schema in `packages/cli/src/config/schema.ts` + Q12 backing analysis | `set_config` walker traverses patch paths, checks `.meta({agentSettable})` on each leaf; rejects on first non-allowed; ~20 LoC. `inputSchema` registered with MCP narrows to only allowlisted paths so agents discover the bounded surface, not the full schema. |
| D29 | **Schema cleanup — drop 10 fields, add 2.** Remove from `ConfigSchema`: `sync.*` (all 7 fields — engine opinionated about full sync lifecycle: 30/60s intervals + jitter + backoff; auto-commit/push/pull always on; commit messages engine-generated), `persistence.{debounceMs, maxDebounceMs}` (engine opinionated about CRDT-disk debounce: 2000/10000ms), `server.port` (per-machine only; env+CLI are the natural override path; no clean 2-tier home). Add: `appearance.{theme, editorModeDefault}` per D20. Net: 7 sections, ~12 leaf fields. Per P31 (no half-implemented features) + P32 (opinionated for the 90% case). **Ships paired with `ok config migrate` codemod (D37)** so users with stale fields get a one-shot cleanup instead of dead text accumulating on disk. Each dropped field can be added back later as a purely additive change when evidence justifies. | T | LOCKED | Yes (1-way: removing fields is breaking for users who set them; D37 codemod + D34 loose-mode passthrough means the breakage surfaces as cleanup, not failure) | 2026-04-28 4-subagent /explore audit + framework application; verified each removal is correct via `evidence/eval-group-{A,B,C,D}-*.md`; verified `sync.*` half-wired pattern + `persistence.*` rare-tune profile + `server.port` 2-tier-incompat. Greenfield principle (P31) + opinionated simplicity (P32). The codemod ships in the same release as the schema cleanup — same-day-codemod discipline, ESLint v9's 20-month migration vs Turborepo 2.0's same-day-codemod is the canonical lesson. | `evidence/config-architecture-framework.md` + 4 eval files | Schema source `packages/cli/src/config/schema.ts` shrinks; `init.ts:61` template loses the `port: 3000` line; `ok start` boot path no longer threads `config.persistence.debounceMs/maxDebounceMs` (engine has hardcoded constants); `SyncEngine` constructor remains parameterized but boot path passes nothing (defaults always hit). With D34 loose-mode, existing user configs with stale fields still load; with D37 codemod, users get explicit cleanup. Future Work entries flag each as additive re-introduction when justified. |

| D30 | **Single canonical `ApiError` envelope across all OK routes (resolves Q1).** One Zod discriminated union keyed on `code` literal defines every error variant. Existing route handlers using `{ok, error: string}` (~50 routes) and seed handlers using `{ok: false, error: {kind, message}}` (2 routes) refactor to the new envelope as part of v0 implementation. Forward-compat tail variant included so unknown future codes don't crash old clients. Per-consumer rendering (HTTP body + status code, MCP `isError + structuredContent + content[].text`, CLI `prettifyError`) is mechanical and isolated to four files. See §9.7 for the full schema and renderers. | T | LOCKED | Yes (1-way: aligning all routes is a one-shot refactor; reverting to multiple shapes re-introduces drift) | Three coexisting error shapes today is debt — every new error code requires N updates across N adapters, every consumer hand-writes its own translation. With one envelope, each rendering is a pure function of the envelope plus the consumer. Stripe's typed-error-class hierarchy proves the pattern; RFC 9457 Problem Details proves it's worth standardizing the wire shape (we adopt the discriminated-union variant, lighter than full RFC 9457 since OK is local-only). The `code` field is the contract; the path-coercion + `params.domainCode` escape hatch handles Zod's symbol-path and custom-check edge cases. | `concerns/errors.md` §"Single envelope, multiple wire renderings" + production survey of 8 SDKs showing zero convergence at the wire (the cost we avoid by aligning now) | ~50 routes × ~5 LoC = one day of refactor for a clean precedent. New consumers (future SDK, future CLI tools) get exhaustive matching for free. The catch-all tail variant is the open-enum discipline applied to error unions. |
| D31 | **PATCH dialect: RFC 7396 JSON Merge Patch with `folders[]` exception.** `applyConfigPatch` implements RFC 7396 semantics: top-level keys present override; absent unchanged; `null` deletes; nested objects recursively merged the same way; arrays REPLACED. HTTP endpoint signals via `Content-Type: application/merge-patch+json`. Within a single scope, `folders[]` still replaces wholesale; the cross-scope merge (D25 inference, Q11 resolution) concatenates and dedupes by `match`. See §9.6.1. | T | LOCKED | Yes (1-way: changing PATCH semantics post-launch is breaking for every consumer that relies on the dialect) | The default in TypeScript backends — "spread the partial body into the existing record" — replaces nested objects rather than merging recursively, dropping consumer data silently. RFC 7396 is the IETF-standardized recursive-merge dialect with null-as-delete; it's what consumers actually expect, and the same shape ships in production at GitHub, Stripe (most endpoints), Linear, Shopify. Arrays-replace is RFC 7396's atomic-array rule; element-wise merge requires an identity model that doesn't exist for `content.include[]` etc. The `folders[]` carve-out is well-defined because `match` IS the rule identity. | RFC 7396; `seed/apply.ts:88-104` proves the yaml@2 round-trip pattern works in production | `Content-Type` makes the dialect introspectable. Documentation is unambiguous about array behavior; no surprise deletions of nested keys. The yaml@2 Document layer preserves comments + blank lines + anchors through the round-trip. |
| D32 | **Two-validator pattern: patch payload + merged document.** Every `applyConfigPatch` call runs two distinct Zod validation passes. Pass 1 validates the patch payload (deep-partial input shape, allowlist gating for MCP). Pass 2 validates the merged document against the full `ConfigSchema` with all refinements. Both pass server-side; either failure returns `VALIDATION_FAILED` envelope with no write. See §9.6.2. | T | LOCKED | No (test-asserted invariant) | Schema libraries validate what the consumer sent, not what the resulting document is. Two failure classes are uncatchable by patch-only validation: required-field clear via null (`{mcp: {autoStart: null}}` validates against the patch but breaks the merged doc) and cross-field invariants (refinements that depend on multiple fields' final values). Kubernetes admission webhooks formalize this as mutating-then-validating sequencing. In TS, application code assembles the two passes from `(merge logic) + (full schema parse)` because Zod doesn't ship merge-then-validate as a primitive. | Kubernetes admission webhook precedent; `concerns/mutation-shape.md` §"Two-validator pattern" | `applyConfigPatch` implementation is two `safeParse` calls bracketing the yaml@2 merge. Test asserts the null-as-clear case is rejected with a clear path-anchored error. |
| D33 | **Concurrency control: ETag/If-Match (HTTP), `expectedVersion` (MCP).** `GET /api/config` returns `ETag` header; `POST /api/config/patch` requires `If-Match`; mismatch → 412 Precondition Failed with `CONFLICT` envelope variant. Missing header → 428 Precondition Required. MCP `set_config` accepts optional `expectedVersion: string` — if supplied and mismatched, `isError: true` + `CONFLICT` envelope + LLM-retry text in `content[]`. If omitted, write proceeds without concurrency check. See §9.6.3. | T | LOCKED | No (additive — existing routes adopt incrementally) | Atomic tmp+rename writes prevent file corruption (one writer wins the rename) but do NOT prevent lost updates. Concrete failure: agent reads config, decides to set `mcp.tools.search.maxResults: 100`, writes; meanwhile user toggles same field to `25` via Modal; both writes succeed; second silently overwrites first. RFC 7232 ETag/If-Match is the standard primitive. For MCP, the protocol has no headers, so the equivalent threads through input schema. Optionality on MCP matters: one-shot edits omit it (last-writer-wins acceptable); careful read-modify-write agents pass it through (safety). LLM-retry framing on 409 ensures agents retry rather than abandon. | RFC 7232 (ETag/If-Match); RFC 6585 (428 Precondition Required); MCP filesystem server's `edit_file` (no idempotency primitive — caller's responsibility) vs `write_file` (PUT-of-whole-state) precedent | Modal handles 412 transparently: refetch `GET /api/config`, re-apply pending field change, retry POST. Auto-save model means only one field is ever in flight; the dirty-state survives the refetch. Agents trade safety for terseness; the choice is theirs. |
| D34 | **`z.looseObject` for the on-disk config schema.** `ConfigSchema` and all nested object schemas use `z.looseObject({...})` (Zod v4 idiom; equivalent to `z.object({...}).catchall(z.unknown())`). Strict mode is opt-in per sub-object only when typos are more likely than forward-compat fields. See §9.8.3. | T | LOCKED | Yes (1-way: tightening to strict later breaks every config file with stale fields) | Human-authored configs accumulate stale fields across upgrades. With strict, validation rejects the file outright. With strip (Zod default), the field passes validation but is silently dropped, and the next `applyConfigPatch` write may even erase it from disk. With **loose**, the field passes validation, sits on disk untouched (yaml@2 round-trip preserves unknown keys), and the engine ignores it. This is the foundational forgiveness pattern — Biome's lesson from its v2 migration and the dominant default across mature config-driven tools. Critical interaction: D34 (loose passthrough) is the safety net so users mid-upgrade aren't broken; D37 (codemod) is the proactive cleanup. Both layers needed. | `classes/human-authored.md` §"Forgiveness vs strictness"; Biome v2 migration retrospective; the `experimental.*` namespace pattern across Next.js + Astro relies on the same loose-object idiom for forward-compat | Without the loose-mode change, D29's schema cleanup would break every existing user config that has `sync.*` set — even if the engine ignores the field at runtime. With it, users mid-upgrade have a smooth path. The codemod (D37) is the explicit cleanup step. |
| D35 | **`applyConfigPatch` returns `Result<T, E>`, not throws.** Type signature: `Promise<{ok: true; applied; effective; etag; scope} \| {ok: false; error: ApiError}>`. Each consumer (HTTP handler, MCP tool, CLI, seed/apply migration) translates this discriminated union to its boundary's envelope at the route layer. Internal modules within `applyConfigPatch`'s implementation may still throw (programmer errors only). See §9.8.1. | T | LOCKED | No | Thrown errors are invisible in TypeScript signatures (no `throws` clause) — every caller must read the implementation to know what to catch, and any caller that misses a case has a runtime bug the compiler can't help with. Discriminated `Result<T, E>` makes failure modes part of the type contract — the compiler forces every caller to address them via the `if (!result.ok)` branch. Stripe's internal-vs-public-surface lesson: their underlying request layer returns Result-style envelopes; the SDK exposes typed error classes for ergonomics. The translation isolation lets us add a fourth consumer (e.g., a future SDK) by writing one translation function, not by re-deriving error handling across the codebase. | `concerns/errors.md` §"Per-class recommendations"; SKILL.md principle #5 (errors as values at library boundaries) | One function, three boundaries, three renderings. Each boundary's translation is ~10 LoC isolated to its handler file. Future surfaces inherit the same pattern. |
| D36 | **Source-located error messages for config validation.** Errors include `file:line:col` plus a snippet of the offending source. Applies to `loadConfig`, `ok config validate`, `applyConfigPatch`, and the Modal's display of validation rejections. Implementation: switch loader from `parseYaml` (string) to `parseDocument` (yaml@2's source-position-preserving parser); on `safeParse` failure, walk issue paths back to source positions via the Document AST. See §9.6.4. | P | DIRECTED | No | Today's loader emits `Invalid configuration:\n  path: message\n...` with no file:line:col — the user has a JSON-pointer path and has to grep for the field. Biome's lint errors include `file:line:col` plus a code snippet with the offending token highlighted; that's the bar for any tool whose primary surface is a user-edited file. The yaml@2 `parseDocument` is already in production for write paths (`seed/apply.ts:88-104`); reusing it for reads is mechanical. | `classes/human-authored.md` §"Error messages with source locations"; Biome lint output as the reference quality bar | One source-position-preserving parser, three consumers benefit (loader, CLI, Modal). Modal maps issue paths to rendered fields; the source-position machinery is reused for the YAML-editing surfaces and the form-rendering surface. |
| D37 | **Ship `ok config migrate` codemod paired with D29 schema cleanup.** Same-day codemod discipline. CLI subcommand `ok config migrate` reads workspace + user config, removes the 10 dropped fields (preserving comments + structure for everything else via yaml@2 Document layer), writes back via `applyConfigPatch`. Idempotent — running twice on a clean file is a no-op. `--dry-run` flag previews changes. `--scope <workspace\|user\|both>` flag scopes the migration. | T | LOCKED | No (additive — running the codemod is opt-in, recommended) | The ESLint v9 retrospective is the decisive evidence: `@eslint/migrate-config` shipped a month after the breaking release, and the migration dragged for 20 months because users had to read release notes and edit by hand. *"Prioritize tooling over documentation"* is ESLint's own lesson. Turborepo 2.0's `pipeline → tasks` rename was smooth because `@turbo/codemod migrate` shipped with v2. With D34 (loose passthrough), users mid-upgrade aren't broken; with D37 (codemod), they get proactive cleanup with one command. Without both, dead text accumulates indefinitely on disk. | ESLint v9 retrospective; Turborepo 2.0 codemod release; `@next/codemod` and `biome migrate` precedents | The codemod uses the same `applyConfigPatch` write primitive — all D5/CC1/two-validator/atomic-write invariants apply automatically. Future codemods (e.g., `--to v0.5`) extend this command rather than spawning new ones. |
| D38 | **`folders[]` API: state-based replace + ONE always-array transactional upsert primitive shared across HTTP/MCP/UX (resolves Q6).** The `folders[]` array is mutated through two operations exposed at three layers each:<br><br>**Operation 1 — Whole-array state-based** (used by Modal's full-form save):<br>• Server helper: `applyConfigPatch({patch: {folders: [...]}})` (FR-9)<br>• HTTP: `POST /api/config/patch` with `{patch: {folders: [...]}}` body<br>• MCP: `set_config({patch: {folders: [...]}})` (FR-6)<br><br>**Operation 2 — Per-rule upsert** (used by right-click-folder UX and agent flows):<br>• Server helper: `applyFolderRulesUpsert({rules: Array<{match, frontmatter, new_match?}>, scope?, expectedVersion?})` — for each rule: if entry with `match` exists → replace `frontmatter` (and rename to `new_match` if supplied); if no entry exists → append. All rules processed inside a single `applyConfigPatch` call → atomic, transactional all-or-nothing.<br>• HTTP: `POST /api/config/folders/upsert` (NEW endpoint, FR-6b)<br>• MCP: `set_folder_rule({rules: Array<{match, frontmatter, new_match?}>, expectedVersion?})` — thin `httpPost` wrapper, matches OK's canonical MCP pattern.<br><br>**Always-array, transactional all-or-nothing.** Even N=1 callers wrap in `[{...}]`. If any rule causes the merged config to fail Zod validation (D32 two-validator), NO writes happen — the response is `{ ok: false, error: ApiError }` with the validation issues. No `207 Multi-Status`, no per-item discriminated union, no per-row idempotency keys, no per-row concurrency primitives — the partial-success machinery doesn't apply because validation runs against the merged document, not per-row.<br><br>The `match` field is immutable element identity. Renames go through `new_match` (Pattern A — GitHub label-rename precedent). Both operations have `idempotentHint: true`. **Removal** uses `set_config({patch: {folders: [<filtered>]}})` at all layers (rare op; no dedicated remove primitive). | T | LOCKED | Yes (1-way: the array shape becomes a public agent + UI contract; widening is fine, retracting breaks) | `folders[]` is the only schema field that's a list-of-records; all other allowlisted fields are scalars or primitive maps. **Two consumers want the operation**: agent's "add description to specs/" flow (often N=1, sometimes N=several), and right-click-folder UX (typically N=1, but a multi-select-folders → batch-edit gesture is plausible). Always-array unifies them — single shape, no mutex between scalar and array forms, evolves cleanly. **Bulk semantic = transactional all-or-nothing**, not per-row fail-soft, because: (a) validation runs against the merged config (cross-rule invariants matter — D32), (b) `applyConfigPatch` is atomic by construction (one yaml round-trip, one validate, one tmp+rename), (c) folder rules are declarative — partial application would leave the config in an unintended state. This sidesteps the entire bulk-mutations complexity surface (`207 Multi-Status`, per-item DU, per-row keys) while still serving N>1 cases. **Vs. the prior 3-tool draft** (`add_folder_rule`/`remove_folder_rule`/`update_folder_rule`): consolidates to one upsert tool by recognizing that "add" and "update" are the same intent (the user/agent declares "this match should have this frontmatter" — whether it exists is incidental). Removal stays via `set_config` (rare op; read-modify-write fine). **Naming**: renamed from `set_folder_defaults` to `set_folder_rule` because "defaults" is half-true — title/description are fall-back defaults (file's own value wins; folder's fills in if absent), but `tags` are *unioned* (folder tags concat with file tags, deduped — see `resolveFolderFrontmatter` in `packages/cli/src/content/folder-rules.ts`). "Folder rule" is the precise entity name (matches `FolderRule` type, `FolderRuleSchema`, the rest of OK's vocabulary). **Tool count budget**: `set_config`, `get_config`, `set_folder_rule` — 3 new MCP tools, under the 2-6/server domain optimum. | GitHub label rename via `new_name` field; OK's existing MCP-tool pattern (`edit_document`, `write_document`, `set_config` all wrap HTTP endpoints via `httpPost`); MCP-tool consolidation rule (collapse calls always made together); the right-click-folder UX motivation from §15 Future Work; the bulk-mutations transactional-all-or-nothing pattern (Hasura multi-mutation precedent for declarative configs) | Modal continues using `POST /api/config/patch` for full-form save. The right-click-folder UX (Future Work) becomes pure UI work — posts `{rules: [{match, frontmatter}]}` (array of length 1 for the common single-rule case). The `applyFolderRulesUpsert` server helper is ~40 LoC (parse rules → for each: find-or-append-or-rename in working array → single `applyConfigPatch` call). The HTTP endpoint is ~20 LoC. The MCP wrapper is ~15 LoC. Total surface: ~75 LoC. Agents that need to upsert N rules atomically use one tool call instead of read-modify-write through `set_config`; the always-array shape covers N=1 (the dominant case) without forcing bulk callers to pick a different tool. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | ~~Multi-error response shape — propagate to existing routes or only for new ones?~~ **RESOLVED 2026-04-28 → align all routes (D30, D14, FR-28).** Define one canonical `ApiError` Zod discriminated union; rewrite the ~50 existing `{ok, error: string}` routes and the 2 seed `{ok: false, error: {kind, message}}` routes to return `{ok: false, error: ApiError}` as part of v0 implementation. Greenfield stance: three coexisting shapes is debt — every new error code requires N updates across N adapter layers. With one envelope, each rendering (HTTP body+status, MCP `isError + structuredContent + content[].text`, CLI `prettifyError`) is a pure function of the envelope plus the consumer. ~50 routes × ~5 LoC = one focused day for a clean precedent. The forward-compat tail variant (`z.object({ code: z.string(), ... }).catchall(z.unknown())`) ensures unknown future codes don't crash old clients. See §9.7 for the full schema and renderers. | T | P0 | RESOLVED |
| Q2 | ~~Identity threading semantics: agent-attributed config edits OR admin-style?~~ **RESOLVED 2026-04-27 by in-repo precedent.** Config-edit handlers are EXEMPT from `extractAgentIdentity`, same rationale as sibling project-level handlers (`handleSeedPlan`, `handleSeedApply`, sync, local-op): operate on the local user's machine settings, not agent content. `attribution-sweep-coverage.test.ts:82-86` already exempts seed handlers with identical rationale. Add `handleConfigPatch` to the `EXEMPT_HANDLERS` set; FR-12 dropped the `extractAgentIdentity` requirement. Resolution recorded as D23. | X | P0 | No | Direct in-repo precedent set by Tim's #319 (commit `e1f3adcf`, merged 2026-04-27). | RESOLVED |
| Q3 | ~~Settings entry-point selection~~ | P | P0 | No | RESOLVED 2026-04-25: ship all four — HelpPopover submenu, Cmd-, shortcut, CommandPalette entry, Electron App menu item. Skip dedicated icon (clutter). Cmd-, and omnisearch are complementary cognitive modes (muscle-memory vs discovery) — every unified-Cmd-K app surveyed (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps both. CommandPalette entry is forward-compatible — becomes a "Commands" source under future omnisearch. Apple HIG requires App menu Settings…. See D21 + `evidence/electron-cmdk-omnisearch-3p.md`. | RESOLVED |
| Q4 | ~~Local UI prefs topology~~ **RESOLVED 2026-04-28 → D20 LOCKED.** Apply VS Code's settings-vs-state split: user-tunable preferences (theme, editor-mode-default) in config.yml under `appearance.*` section; transient UI state (pin, graph state) in localStorage. Section named `appearance` (not `userPrefs`) because the field can be written at any scope. | P | P0 | — | VS Code precedent + D25 (no scope opinion in field name). | RESOLVED |
| Q10 | ~~Should v0 introduce a fourth config scope `config.local.yml`?~~ **RESOLVED 2026-04-28 → D27 (DEFERRED to Future Work)**. After FR-9c drops `sync.*` and `persistence.*` (engine opinionated, P32) and removes `server.port` (env+CLI is the per-machine path), every remaining schema field cleanly homes at the 2-tier ladder (user-global + workspace) per D25 `defaultScope`. No current field forces a 3rd tier. Adding `.local.yml` later when a real per-machine schema field requires it is purely additive (extend loader, add Modal tab, set `defaultScope: 'local'` on the new field). | T | P0 | — | 4-subagent /explore audit 2026-04-28 verified each retained field's natural scope home; only `server.port` had no clean 2-tier home, and was dropped from config in the same pass. | RESOLVED |
| Q11 | ~~Cross-scope array merge semantics for `folders`~~ **RESOLVED 2026-04-28 → per-array semantic.** `folders` MERGES (concat + dedup by `match`); `content.include`/`content.exclude` keep REPLACE (filter-set intent — replace is correct); all other scalar/object fields unchanged (replace per RFC 7396, also per VS Code default). The `folders` merge runs in the LOADER (`loader.ts` deepMerge replacement) when combining user-global + workspace; D31 documents this as the single explicit exception to the otherwise-uniform RFC 7396 array-replace rule. **Within a single scope**, `folders[]` still replaces wholesale per RFC 7396 (a patch with `folders: [...]` declares the new state of that scope's array). The cross-scope merge produces a single effective `folders[]` array fed to the engine. Renovate's per-rule additivity for `packageRules` is the closest external precedent. | T | P0 | RESOLVED |
| Q5 | ~~Schema walker: Zod v4 internal API (`_zod.def`) vs public `_def`?~~ | T | P0 | No | RESOLVED 2026-04-25: empirical check on `node_modules/zod/v4/core/schemas.d.cts` confirms `_zod: $ZodTypeInternals` is the published TypeScript-typed introspection surface in Zod v4 (the `_def` of v3 was restructured to `_zod.def`). Walker uses `schema._zod` with explicit per-tag type-guards + JSON-text fallback for unknown tags. Pin Zod to exact `4.3.6`. See D19. | RESOLVED |
| Q6 | ~~Folders API design across MCP, HTTP, UI~~ **RESOLVED 2026-04-28 → D38** (state-based replace + ONE always-array transactional upsert primitive shared across HTTP/MCP/UX). The agent's primary use case ("add description to specs/") and the right-click-folder UX are the same operation: per-folder upsert. The operation exists as a 3-layer primitive — server helper (`applyFolderRulesUpsert`), HTTP endpoint (`POST /api/config/folders/upsert`), MCP tool (`set_folder_rule`). Always-array shape covers both N=1 (right-click UX, agent adding one description) and N>1 (agent batch-reorganizing folders) without forcing callers to pick between two tools. **Transactional all-or-nothing**: validation runs against the merged config; if any rule fails, NO writes happen — sidesteps the entire bulk-mutations partial-success machinery. The Modal continues using `POST /api/config/patch` for full-form save. Removal goes through `set_config({patch: {folders: [<filtered>]}})` at all layers (rare op; read-modify-write fine). The `match` field is immutable element identity; renames go through `set_folder_rule`'s per-rule `new_match` field (Pattern A — GitHub label-rename precedent). **Renamed from `set_folder_defaults`** — "defaults" was half-true (title/description fall-back, but tags are unioned across folder + file); "rule" matches the `FolderRule` type and the rest of OK's vocabulary. MCP surface: 3 new tools (`set_config`, `get_config`, `set_folder_rule`) — under the 2-6/server domain optimum. | P | P0 | RESOLVED |
| Q7 | ~~First-time user UX: silent file create or prompt?~~ **RESOLVED 2026-04-28 → silent.** When `applyConfigPatch` is called against a scope where `config.yml` doesn't yet exist, the helper creates the parent directory if needed (`mkdirSync(dirname(path), {recursive: true})`) and writes the file with the patch applied to schema defaults. No "Create config.yml?" prompt — the user already signaled intent by editing in the Modal or invoking `set_config` via MCP. The file's first line is the magic comment from FR-17 (with the version-pinned `$schema` URL). The `~/.open-knowledge/` user-global directory is the first writer's responsibility — `applyConfigPatch` ensures the directory exists for both workspace and user-global scopes. **UX surface**: no banner, no toast, no confirmation; the field commits, the file appears on disk, the watcher emits a CC1 'config' broadcast for any open Modals to refresh from. The first appearance of a workspace `config.yml` typically coincides with `ok init` anyway; the user-global file is the more interesting case (first writer is whoever first edits a `defaultScope: 'user'` field in the Modal). | P | P0 | RESOLVED |
| Q8 | ~~Server-side validation rejection UX — toast, inline, modal?~~ **RESOLVED 2026-04-28 → inline per-field + toast for envelope-level errors.** The canonical `ApiError` envelope (D30, FR-28) makes this mechanical. For `VALIDATION_FAILED`: each `issue.path` array maps directly to a rendered field in the Modal's Zod walker; the field gets a red border + the message inline; the Modal's source-position machinery from FR-27 gives the same `file:line:col` framing internally as the CLI. For envelope-level errors that don't have a path (`CONFLICT`, `WRITE_ERROR`, `PARSE_ERROR`): toast with the error's `humanFormat` text + a "Reload from disk" action button (which calls `GET /api/config` and re-renders). For `CONFLICT` specifically: toast says *"Config changed. Reloading..."* and the Modal silently refetches + re-applies the user's pending field change against the new baseline. No separate confirmation dialog — auto-save (D8) means there's only ever one field in flight, and the dirty-state survives the refetch. | P | P0 | RESOLVED |
| Q9 | Should the Modal's "All projects" tab show what fields are *overridden* by the workspace config? (Visual distinction: "this user-global value is overridden by your workspace setting") | P | P2 | No | Deferred to post-v0 polish; pure UX. | Open |
| Q12 | ~~MCP `set_config` field-level gating: which paths are agent-settable?~~ **RESOLVED 2026-04-28 → D26**. Allowlist of 5 paths via `.meta({ agentSettable: true })`: `folders[]`, `content.include`, `content.exclude`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`. Combined with D25 (no `scope` exposed to agents), the agent contract is "patch one of these 5 paths; server picks the scope." | T | P0 | — | Schema-grounded analysis confirmed only 3 real-attack-surface fields (`github.oauthAppClientId`, `preview.baseUrl`, `server.host`) — all gated out by allowlist. | RESOLVED |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Zod v4.3.6's `z.toJSONSchema()` produces JSON Schema draft-07 output usable by Red Hat YAML LSP, Schema Store, and any future RJSF/JSON Forms consumer | HIGH | Empirical test already done: `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md` (23 test cases on Zod 4.3.6) | Verified | Active |
| A2 | yaml@2 Document layer round-trip preserves user comments + blank lines through `setIn`/`deleteIn`/`toString()` cycles for OK's config shapes | HIGH | `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` confirmed canonical pattern + production prior art; **upgraded 2026-04-27 to repo-verified** — pattern shipped at `packages/server/src/seed/apply.ts:88-104` (Tim's #319) | Verified in repo | Active |
| A3 | Adding a CC1 'config' channel + parallel client routing is mechanical (one line each side) | HIGH | `evidence/codebase-integration-points.md` §5 confirmed | Verified | Active |
| A4 | `ok:menu-action` IPC channel works end-to-end for "Settings…" menu item without new IPC plumbing | HIGH | `evidence/codebase-integration-points.md` §8 — channel exists, preload subscribes, sendToRenderer dispatches | Before implementation | Active |
| A5 | unpkg URL hosting (`https://unpkg.com/@inkeep/open-knowledge/dist/config-schema.json`) is stable enough for IDE schema reference | MEDIUM | Standard npm-package CDN; widely used. Verify URL pattern works on first publish; document fallback (raw GitHub URL) if needed. | Before SchemaStore PR | Active |
| A6 | A new file watcher on `.open-knowledge/config.yml` (workspace + user paths) is cheap (~50 LoC chokidar subscription); deduping against internal writes via writeTracker pattern | MEDIUM | Reuse existing writeTracker pattern from `file-watcher.ts`. Verify chokidar can watch a single file (vs the directory) cleanly. | Before implementation | Active |
| A7 | SchemaStore PR will be accepted within ~1-2 weeks (no stated SLA but "history of accepting most pull requests") | MEDIUM | One-time external dependency; if delayed, the magic-comment fallback still gives users intellisense | Before launch | Active |
| A8 | shadcn Dialog handles long-form responsively (8-section form + nested arrays); no need to switch to Sheet | MEDIUM | Verify with prototype; can switch to Sheet without changing the rest of the architecture | After first prototype | Active |

## 13) In Scope (implement now)

- **Goal**: Ship the three CRUD surfaces (Modal, MCP, CLI/IDE) backed by `applyConfigPatch`, covering both workspace and user-global scope.
- **Non-goals (per §3)**: pluggable validator framework, CRDT routing for config, JSON intermediate format, external link checks, JSON output mode, live concurrent-editor presence, Navigator settings UI, alternate config formats.
- **Requirements with acceptance criteria**: see §6 (FR-1 through FR-28 must-haves).
- **Proposed solution**: see §9, with architectural detail in §9.6 (mutation contract: PATCH dialect, two-validator, concurrency), §9.7 (error envelope), §9.8 (boundary discipline).
- **Owner(s)/DRI**: TBD.
- **Next actions** (will become implementation tickets after finalize):
  1. **Foundational schemas** (Day 1): Define `ApiError` discriminated union (FR-28 / D14 / D30) in `packages/server/src/api-error.ts` with `humanFormat`, `statusFor`, `asMcpToolResult` helpers. Apply schema cleanup (FR-9c / D29) — drop the 10 fields, add `appearance.{theme, editorModeDefault}`, switch every `z.object` to `z.looseObject` (D34), add `.meta({defaultScope, agentSettable})` annotations (D25/D26).
  2. **`applyConfigPatch` core** (Day 1-2): Implement in `packages/server/src/config-edit.ts` with the `Result<T, E>` shape (D35), RFC 7396 PATCH dialect (D31), two-validator pattern (D32 / FR-11), ETag computation (D33), atomic tmp+rename. Migrate `seed/apply.ts:85-113` onto `applyConfigPatch` per FR-9b.
  3. **HTTP routes** (Day 2): Add `POST /api/config/patch` + `GET /api/config` to `api-extension.ts` route registry behind `checkLocalOpSecurity`. ETag/If-Match flow (FR-12 / FR-13). Add `handleConfigPatch` to attribution sweep `EXEMPT_HANDLERS`.
  4. **Existing-routes error envelope refactor** (Day 2-3): Refactor the ~50 existing `{ok, error: string}` routes and the 2 seed `{ok: false, error: {kind, message}}` routes to return `{ok: false, error: ApiError}`. One focused PR; integration test asserts every error code maps to the documented HTTP status. Resolves Q1 / FR-28.
  5. **CC1 'config' channel** (Day 3): Extend `DerivedViewChannel` enum in `packages/core/src/schemas/cc1.ts`. Wire `signalChannel('config')` calls in `applyConfigPatch`. Add new file watcher for `.open-knowledge/config.yml` (workspace + user) emitting CC1 'config'. Add CC1 'config' subscriber to `SystemDocSubscriber`.
  6. **Source-located errors** (Day 3): Switch loader from `parseYaml` to `parseDocument`; thread Document AST through `safeParse` failures to compute `file:line:col`. Reuse for HTTP/MCP/CLI/Modal renderings (FR-27 / D36).
  7. **MCP tools + folder upsert primitive** (Day 3-4): Register `set_config`, `get_config` in `packages/cli/src/mcp/tools/{set,get}-config.ts`. Register `set_folder_rule` in `packages/cli/src/mcp/tools/set-folder-rule.ts` (D38 / FR-6b — always-array `{rules: [...]}` shape; thin `httpPost` wrapper around the new HTTP endpoint). Add `applyFolderRulesUpsert` server helper to `packages/server/src/config-edit.ts` (iterates rules, single `applyConfigPatch` call, transactional all-or-nothing). Add `POST /api/config/folders/upsert` HTTP route to `api-extension.ts` (joins `EXEMPT_HANDLERS`). Wire `idempotentHint`/`readOnlyHint` annotations honestly. Author the tool descriptions inline with the implementation (descriptions are the LLM contract, drafted in §9.7.2).
  8. **Modal Settings UI** (Day 4-5): Build the Zod-walker + Modal Settings UI in `packages/app`. Auto-save (D8); per-field reset (D9); modified-at-scope indicator (FR-3b); inline issue rendering (Q8); ETag/If-Match concurrency handling (silent refetch on 412).
  9. **Entry points** (Day 5): Wire HelpPopover submenu, Cmd-, shortcut, CommandPalette entry, Electron menu item via `ok:menu-action`. Hidden in Navigator window per D16/FR-20.
  10. **CLI** (Day 5-6): Add `commands/config.ts` with `validate` subcommand AND `migrate` subcommand (FR-26 / D37 codemod). Funnels through `applyConfigPatch`.
  11. **Init template + schema export** (Day 6): Update `CONFIG_YML_CONTENT` template in `packages/cli/src/content/init.ts` with version-pinned `$schema` URL (FR-17). Add `build:schema` step to `packages/cli/package.json` emitting `dist/config-schema.json` with `io: 'input'` (FR-18). Add CI test asserting JSON-Schema↔runtime equivalence.
  12. **External**: Submit SchemaStore PR (FR-19).
- **Risks + mitigations**: see §14.
- **What gets instrumented/measured**: see §7.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Schema URL stability | Pin to package major.minor (`https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json`); the codemod from FR-26 bumps the URL on upgrade | First IDE intellisense session works; `ok config migrate --to <version>` updates the URL alongside any field migrations |
| SchemaStore PR latency | Magic-comment scaffold provides fallback while PR is in flight | Magic-comment alone enables intellisense without SchemaStore |
| User-global file creation (first time) | `applyConfigPatch` calls `mkdirSync(dirname(path), {recursive: true})` before atomic write — handles both workspace + user-global directories. Resolves Q7 (silent file create). | First Modal save to user scope on a fresh machine |
| Multi-version Zod schema drift | Version `dist/config-schema.json` per npm publish; consumers pin to OK version. CI test asserts JSON-Schema↔runtime equivalence per FR-18. | Old IDE intellisense data doesn't break new config fields; transforms can never silently slip into the schema |
| Stale fields after schema cleanup | D34 `z.looseObject` accepts unknown fields (preserved on disk); D37 `ok config migrate` codemod cleans them up explicitly when user opts in | A pre-D29 config with `sync.pushIntervalSeconds: 30` loads successfully; `ok config migrate` removes the line; running the codemod twice is a no-op |
| Existing routes' error shape refactor | One focused PR per FR-28 — all ~50 routes + 2 seed routes refactor to the canonical `ApiError` envelope; integration test asserts every error code maps to the documented HTTP status | All error responses across HTTP/MCP/CLI use the same envelope after this spec lands |
| Concurrent agent + Modal edits to the same field | ETag/If-Match (HTTP) + `expectedVersion` (MCP) per D33; mismatch produces `CONFLICT` envelope; Modal silently refetches and retries; agent gets LLM-retry framing | Two concurrent writes to `mcp.tools.search.maxResults` produce one win + one 412; both writers see consistent state after; no silent overwrite |
| MCP token cost regression | One new tool ~600-800 tokens; well under any meaningful threshold | Measure in real session |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| `yaml@2` Document layer round-trip subtly mangles complex configs (anchors, custom tags) on real user files | LOW | MED | Comprehensive round-trip tests on representative config corpus; preserved bytes-equality for the simple cases | TBD |
| Zod walker breaks on a future Zod schema construct (e.g., recursive types via `z.lazy()`) | MED | MED | Walker handles known constructs; unknown constructs render generic JSON-text editor as fallback | TBD |
| File watcher misses external edits (parcel-watcher quirk on macOS/Windows) | LOW | LOW | Chokidar fallback (already used elsewhere in OK); polling fallback if needed | TBD |
| Auto-save creates surprising commits ("I tabbed away from a half-typed value") | MED | LOW | Local validation blocks invalid → field stays dirty; valid intermediate values like `60` for `pushIntervalSeconds` ARE intentional commits | TBD |
| User-global config UI is the first writer to `~/.open-knowledge/`; permission errors on uncommon shells | LOW | MED | Explicit error message with `ok config validate --user` (post-v0) as remediation | TBD |
| SchemaStore PR rejected or delayed | LOW | LOW | Magic-comment fallback works without SchemaStore; just needs unpkg URL stable | TBD |
| ~~New `errors[]` shape becomes inconsistent with rest of API~~ | — | — | RESOLVED — D30/FR-28 aligns all routes to the canonical `ApiError` envelope in this spec; one-shot refactor of ~50 routes + 2 seed routes during v0 implementation. | — |
| ~~Concurrent edits race (agent + UI hit `applyConfigPatch` in same ms)~~ | — | — | RESOLVED — D33 ships ETag/If-Match (HTTP) + `expectedVersion` (MCP); mismatch returns `CONFLICT` envelope; Modal silently refetches; agent gets LLM-retry framing. Atomic tmp+rename remains the file-corruption guard but is no longer the only line of defense. | — |
| Existing-routes error envelope refactor (FR-28) introduces inconsistencies between PRs that haven't yet caught up | MED | MED | One focused PR per FR-28; integration test asserts EVERY route returns the new envelope; CI fails until alignment is complete | TBD |
| `applyConfigPatch` returns `Result<T, E>` but a caller forgets to check `result.ok` and crashes downstream | LOW | MED | TypeScript discriminated union forces narrowing — `result.applied` only typechecks inside the `result.ok === true` branch. Linting via `@typescript-eslint/no-unsafe-member-access` catches accidental property access on the union. | TBD |
| `z.looseObject` (D34) lets users carry stale fields silently after a schema removal — they don't notice the field is dead | LOW | LOW | The `ok config migrate` codemod (FR-26) makes the cleanup explicit; on schema-cleanup releases, `ok` emits a one-line "your config has N deprecated fields — run `ok config migrate` to clean up" message at boot. | TBD |
| Source-position lookup (FR-27/D36) is incorrect for deeply-nested paths or fields with anchors | LOW | LOW | yaml@2 Document API (`doc.getIn(path).range`) is the canonical mechanism; integration tests assert correct line/col for representative fixtures including nested objects and arrays | TBD |
| ~~`set_folder_rule` style consolidation (D38 follow-up)~~ | — | — | RESOLVED in this iteration — D38 ships the consolidated 1-tool design (`set_folder_rule`, always-array transactional) in v0; no agents have adopted the wider 3-tool surface yet, so no breakage risk. | — |
| Right-click-folder UX (Future Work) finds `POST /api/config/folders/upsert` insufficient when shipped | LOW | MED | The endpoint covers the upsert case the UX needs (per D38 design). If multi-match UX (one path matches multiple rules) requires server-side resolution help, add a paired `get_folder_frontmatter({path})` endpoint at that point — additive, non-breaking. | TBD |

## 15) Future Work

### Explored
- **Per-field Reset to default works on every Zod-defaulted field** — investigated the walker mechanics; trivial to implement; just polish-tier nice-to-have. Triggers to revisit: post-v0 if users report missing defaults.

### Identified

- **`.local.yml` third scope tier (per-machine override of workspace).** When a future schema field needs a per-machine override that doesn't fit the 2-tier ladder, ship `<project>/.open-knowledge/config.local.yml`. **What we know**: gitignored by `ok init`; precedence `defaults → user → workspace → LOCAL → ENV → CLI`; `applyConfigPatch` accepts `scope: 'local'`; per-field `defaultScope` extends to include `'local'`; Modal gets a third scope tab. **Why it matters**: closes the per-machine cluster (Cluster B) that today is empty after the v0 schema cleanup. **Investigation needed**: which new field triggers the need (candidate: a future `embedding.localLLMEndpoint` or `telemetry.optIn` per-machine knob).
- **Re-add `sync.*` fields when engine grows skip-modes + templates.** `sync.{enabled, pushIntervalSeconds, pullIntervalSeconds, autoCommit, autoPush, autoPull, commitMessage}`. **What we know**: schema fields are pure plumbing; engine work is the real cost (~150 LoC for skip-modes + template support). **Why it matters**: power users with slow networks / large repos / manual-review workflows / team-style commit conventions get configurability. **Investigation needed**: user signal — until users complain about engine opinions, defaults stand.
- **Re-add `persistence.{debounceMs, maxDebounceMs}` when slow-disk evidence arrives.** **What we know**: trivial schema additions (~5 LoC plumbing). **Why it matters**: edge cases (spinning rust, real-time-backup workflows). **Investigation needed**: user complaints + measurable latency cost.
- **Re-add `server.port` to config under `defaultScope: 'local'`.** Paired with `.local.yml` Future Work above. **What we know**: trivial schema addition; loader chain already accommodates env override. **Why it matters**: the rare "I want stable port for IDE bookmarks" use case. **Investigation needed**: how often this comes up; today shell rc / direnv handle it.
- ~~Per-rule folder MCP tools~~ **Resolved by D38 (in v0).** `set_folder_rule` ships with v0 as the always-array transactional upsert primitive shared across HTTP/MCP/UX. No further per-rule MCP tools are planned for v0 — `set_config` covers whole-array state-based replace; `set_folder_rule` covers per-rule upsert (N=1 or N>1, transactional); removal is via `set_config`.
- **Cross-scope override visual indicator** (Q9 — VS Code's `Modified elsewhere` pattern). When User has a value but Workspace overrides, inline text link with click-to-jump-to-other-tab. **What we know**: VS Code source verified at `settingsTreeModels.ts:435-485`; ~30 LoC + CSS. **Why it matters**: closes the "where did my value go?" gotcha — VS Code originally didn't have this either and added it after user pain. **Investigation needed**: defer until OK has 3-tier ladder + real user reports of override confusion.
- **Per-field scope read-side enforcement** (VS Code's `machine` / `window` analog — Architecture B at the read layer). Add `scope: 'machine' | 'window' | 'resource'` Zod metadata to fields where wrong-scope-write is genuinely problematic (currently `server.host` at workspace forces all teammates to same network bind — situational but possible misuse; future `server.port` re-add would be the canonical case). Loader's effective-value computation skips invalid layers; UI shows warning marker per VS Code precedent (`preferencesRenderers.ts:666-693`). Per P8: open writes, opinionated reads, never reject. **Why it matters**: prevents silent misconfigurations as schema grows. **Investigation needed**: schema field count + classes that justify per-field scope tags.
- **Settings-vs-state separation completion** (D28 principle, full migration). Today `syncEnabled` lives in `sync-state.json` (toggle UI writes there). Once `.local.yml` exists, migrate `syncEnabled` to config (settings-shaped). Until then it's grandfathered in state file with documented exception per P1. **Why it matters**: D5 single-write-primitive invariant cleanly applies. **Investigation needed**: paired with `.local.yml` Future Work above.
- **`ok validate-links` (or `ok lint-content`)**: internal wiki-link integrity checking. Mintlify precedent (`mint broken-links`). Same Zod-style error shape (D14). Peer command, not subcommand of `validate`. **What we know**: internal `[[Page]]` references are already indexed (BacklinkIndex); broken-link detection is a query against this index. **Why it matters**: closes the IDE-feedback loop for content authors. **Investigation needed**: integrate with existing BacklinkIndex; CLI flag for "broken links since last commit" or scope by glob.
- **`ok validate-frontmatter`**: validate frontmatter conformance against `folders[].frontmatter` rules. Same error shape. **What we know**: `folders[]` schema already supports per-folder frontmatter requirements. **Why it matters**: enforces the documentation-quality rules users define. **Investigation needed**: integration with file watcher for live validation.
- **Settings UI in Electron Navigator** for global preferences (updater channel, recents cap, default editor mode). Different storage class (electron-store / state.json), not config.yml. **What we know**: Navigator has no utility process; would need Electron-main-process direct fs access. **Why it matters**: "first-launch global setup before opening any project" UX gap. **Investigation needed**: scope split between `state.json` prefs and `~/.open-knowledge/config.yml`.
- **Per-field "Valid Scopes" concept** (Claude Code's `Managed-only fields` + `Project-disallowed` fields; VS Code's `restricted` + `restrictedConfigurations[]` extension array). OK doesn't have credential-helper-shaped fields today (`github.oauthAppClientId` is a public client ID — intentionally shareable). **What we know**: `reports/config-surfaces-vscode-and-claude-code/REPORT.md` D9 documents both products' implementations; threat model is "prevent supply-chain attacks via PRs to a shared workspace config." **Why it matters**: if OK ever adds a credential-helper-shaped field (private token, API key path, sandbox-bypass flag), per-field scope validity becomes load-bearing. **Investigation needed**: schema annotation for `validScopes: ('user' | 'workspace' | 'local' | 'managed')[]`; loader-side enforcement; UI hint when a field is hidden in the wrong scope.
- **Right-click folder in sidebar → "Edit folder rule…" modal.** Shape A (UX shortcut over `folders[]`) is the only viable shape: data model unchanged, MCP/HTTP surface unchanged, just a focused dialog over the existing primitives. Shape B (new `folderDefaults` data model field) is rejected for schema-duplication; Shape C (per-folder `.frontmatter.yml` files inside content) is rejected by NG10 (OK never pollutes user content). **Server surface already exists**: D38/FR-6b ships the `POST /api/config/folders/upsert` HTTP endpoint and `applyFolderRulesUpsert` server helper in v0 specifically so this future UX is pure UI work — no schema/server changes needed. The right-click affordance maps to: identify the matching rule (via picomatch — already in client deps), render frontmatter form scoped to that rule, save via the existing endpoint as `{rules: [{match, frontmatter, new_match?}]}`. The same primitive supports a future multi-select-folders → batch-edit gesture (N>1 in the rules array). **Why it matters**: the most natural per-folder UX gesture in any sidebar; doubles as the discoverability path for the `folders` feature. The 3-layer primitive (server helper + HTTP endpoint + MCP tool) was designed with this consumer in mind — see D38 rationale. **Investigation needed (UI-only)**: rule-discovery UX for multi-match cases (most-specific rule? all rules with effective merged frontmatter?); scope picker (workspace by default; expert option for user-global). Removal UX uses `POST /api/config/patch` with the filtered array (Modal's existing pattern), not the upsert endpoint.
- ~~`add_folder_rule` / `set_folder_rule` MCP convenience tool~~ **Resolved by D38 (in v0).** `set_folder_rule` ships with v0 as a thin MCP wrapper around `POST /api/config/folders/upsert`, accepting an always-array `{rules: [...]}` shape (transactional all-or-nothing). **Possible v1 follow-up** if it proves load-bearing: paired `get_folder_frontmatter({path})` MCP read tool that returns the effective merged frontmatter for a given path (wraps existing `resolveFolderFrontmatter` from `packages/cli/src/content/folder-rules.ts`). Today's `get_config({path: ['folders']})` covers the read case sufficiently for v0 — it returns the rules array, and the agent can apply picomatch matching client-side to find the rules for a given path. The dedicated read tool only becomes load-bearing if the agent's "what frontmatter applies to file X?" query becomes common enough to justify pre-computing on the server.
- **`seed` MCP wrapper around shared seed module.** Per `specs/2026-04-23-ok-seed-scaffold/SPEC.md` §3 NG: *"Not an MCP tool. The scaffolder is CLI + Electron only for V1. If it needs an MCP surface later (agent-triggered seeding), that's a thin wrapper around the same shared module — out of scope now."* After our spec's FR-9b unifies seed/apply onto `applyConfigPatch`, an MCP `seed` tool becomes mechanical: thin wrapper around `planSeed` / `applySeed`, returns the same `{ok, error: {kind, message}}` shape the HTTP routes already ship. **Why it matters**: agent-triggered project bootstrap (the `init-content` use case the seed-scaffold spec deleted) becomes available again — but with side effects (real folder creation + config write) instead of pure instruction. The original `init-content` removal rationale (purely instructional → tool-surface pollution) doesn't apply to a real-side-effects `seed` tool. **Investigation needed**: which seed sub-operations are agent-appropriate (probably `apply` after a user-confirmed `plan`, not unsupervised `apply`); how the tool composes with the agent-settable allowlist of Q12.

*(Removed: "Modal Preferences tab with localStorage UI prefs" — superseded by proposed D20, which puts user-tunable preferences in `userPrefs` config.yml section directly, no separate tab needed. Transient localStorage state, e.g. pin, never appears in Settings UI per VS Code's settings-vs-state model.)*

### Noted
- **External link liveness checks** (HTTP HEAD probes) — no surveyed tool does this; complex error model (timeouts, rate limits, transient failures); deferred indefinitely.
- **`--json` output mode for `ok config validate`** — only actionlint exposes structured CLI output; wait until first CI consumer asks.
- **Live concurrent-editor presence in Modal** — no web-host dev tool does this; commit-time conflicts are universal pattern; deferred indefinitely.
- **Conflict-merge UX** (auto-resolve concurrent edits) — auto-save model means rare in practice; defer until real complaints.
- **TypeScript-config-as-schema migration** (Astro/Storybook style) — explicitly NEVER per NG; users have already chosen YAML.

## 16) Agent constraints

*(Derived during finalization; placeholder for now.)*

- **SCOPE:**
  - `packages/cli/src/config/schema.ts` (D29 schema cleanup; `z.looseObject` for D34; `.meta` annotations for D25/D26)
  - `packages/cli/src/config/loader.ts` (switch `parseYaml` → `parseDocument` for source positions per FR-27/D36; cross-scope `folders[]` merge per D31/Q11)
  - `packages/cli/src/commands/config.ts` (NEW — `ok config validate` + `ok config migrate` codemod for FR-26/D37)
  - `packages/cli/src/content/init.ts` (CONFIG_YML_CONTENT magic-comment with version-pinned `$schema` URL per FR-17)
  - `packages/cli/src/mcp/tools/set-config.ts` (NEW — FR-6)
  - `packages/cli/src/mcp/tools/get-config.ts` (NEW — FR-6c)
  - `packages/cli/src/mcp/tools/set-folder-rule.ts` (NEW — always-array transactional upsert tool per D38/FR-6b; thin `httpPost` wrapper around the HTTP endpoint)
  - `packages/cli/src/mcp/tools/index.ts` (registration of the new tools)
  - `packages/cli/tsdown.config.ts` + `package.json` (build:schema script for FR-18; CI test asserting JSON-Schema↔runtime equivalence)
  - `packages/server/src/config-edit.ts` (NEW — `applyConfigPatch` returning `Result<T, E>` per D35/FR-9; two-validator pattern per D32/FR-11; ETag computation per D33; RFC 7396 merge per D31)
  - `packages/server/src/api-error.ts` (NEW — canonical `ApiError` Zod discriminated union per D14/D30/FR-28; `humanFormat`, `statusFor`, `asMcpToolResult` rendering helpers)
  - `packages/server/src/api-extension.ts` (NEW route additions: `POST /api/config/patch`, `GET /api/config` with ETag/If-Match per D33, `POST /api/config/folders/upsert` per D38/FR-6b; refactor of ~50 existing routes' error responses to use the new envelope per FR-28)
  - `packages/server/src/config-edit.ts` also exports `applyFolderRulesUpsert` helper per D38/FR-6b (iterates rules, find-or-append-or-rename in working array, single `applyConfigPatch` call — transactional all-or-nothing)
  - `packages/server/src/seed/apply.ts` (FR-9b — migrate the `parseDocument` → mutate → `writeFileSync` block onto `applyConfigPatch`; refactor seed error responses to the canonical envelope)
  - `packages/server/src/cc1-broadcast.ts` + `packages/core/src/schemas/cc1.ts` (extend `DerivedViewChannel` enum to include `'config'`; add the new channel)
  - `packages/server/src/file-watcher.ts` OR new `config-watcher.ts` (NEW — watch `<contentDir>/.open-knowledge/config.yml` + `~/.open-knowledge/config.yml`; debounced 100ms; deduped against internal writes via writeTracker)
  - `packages/app/src/components/SettingsDialog.tsx` + walker + child components (NEW — Zod walker per D19; auto-save per D8; per-field reset per D9; D24 scrollable layout; FR-3b modified-at-scope indicator; inline issue rendering per Q8)
  - `packages/app/src/components/EditorHeader.tsx` (entry point — Cmd-, + HelpPopover entry per D21)
  - `packages/app/src/components/CommandPalette.tsx` (entry point per D21)
  - `packages/app/src/components/SystemDocSubscriber.tsx` (CC1 'config' channel routing — invalidate config query)
  - `packages/desktop/src/main/menu.ts` (Settings menu item via `ok:menu-action` per D21)
  - `packages/app/tests/integration/attribution-sweep-coverage.test.ts` (add `handleConfigPatch` to `EXEMPT_HANDLERS` per D23)
- **EXCLUDE:**
  - `packages/server/src/external-change.ts` (CRDT-only, not config)
  - `packages/server/src/agent-sessions.ts` (CRDT writes, separate semantics)
  - `packages/app/src/editor/` (CRDT editor, not config UI)
- **STOP_IF:**
  - Schema requires migration that ISN'T covered by `ok config migrate` codemod (D37) — drop-and-rewrite-without-codemod is the documented anti-pattern (ESLint v9 lesson)
  - Routing config edits through CRDT layer (NEVER per NG2)
  - Adding a JSON intermediate format (NEVER per NG3)
  - Building a pluggable validator framework (NEVER per NG1)
  - `applyConfigPatch` throws across the boundary instead of returning `Result<T, E>` (D35)
  - PATCH semantics drift from RFC 7396 (D31) — e.g., adding silent array-merge for fields other than `folders[]`
  - Any HTTP route emits an error shape NOT conforming to the canonical `ApiError` envelope (D30/FR-28)
- **ASK_FIRST:**
  - Adding a 3P form library dep (D4 deliberately rejects all four surveyed)
  - Changing the canonical `ApiError` envelope (D14/D30 LOCKED — the wire shape is the contract for HTTP, MCP, and CLI all simultaneously)
  - Tightening any `z.looseObject` to `z.strictObject` (D34 — strict-mode-on-human-authored-config breaks forward compat)
  - Refactoring existing routes' error shapes outside the FR-28 batch (the alignment is one focused day; piecemeal is worse than nothing)
  - Adding a route that bypasses `checkLocalOpSecurity`
  - Adding new HTTP endpoints not behind `checkLocalOpSecurity`
  - Refactoring existing `{ok, error: string}` routes to `{ok, errors[]}` (Q1 — additive only without explicit decision)
