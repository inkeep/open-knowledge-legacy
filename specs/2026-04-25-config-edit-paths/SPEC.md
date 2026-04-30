---
title: "Config Edit Paths — Hocuspocus-bound Settings UI + TypeScript API over .open-knowledge/config.yml"
status: Draft (Release-Pivot Reframe — 2026-04-28)
owner(s): Andrew (CTO), Nick (CPO/CTO)
created: 2026-04-25
updated: 2026-04-28
baseline_commit: 7b0283c1
---

# Config Edit Paths — Spec

**Status:** Draft (Release-Pivot Reframe — 2026-04-28)
**Owner(s):** Andrew (CTO), Nick (CPO/CTO)
**Last updated:** 2026-04-28
**Baseline commit:** `7b0283c1`

> **2026-04-28 Release Pivot.** This spec was originally drafted around an HTTP-centric architecture: a single shared `applyConfigPatch` server primitive behind `POST /api/config/patch`, with the `ApiError` envelope refactored across ~50 routes. Andrew's intake on 2026-04-28 reframed the architecture to use **Hocuspocus Y.Text-only docs as the live transport** for the Modal Settings UI and **fs-direct writes** for headless writers (MCP / CLI / seed). The "config API" is now a frontend TypeScript contract (`ConfigBinding` + `writeConfigPatch`), not a REST API. Roughly 60-75% of the original decision surface collapses or shrinks; struck-through decisions in §10 are retained for audit. Captured in three release-pivot evidence files: [`evidence/_user_outcomes.md`](evidence/_user_outcomes.md), [`evidence/architectural-pivot-hocuspocus.md`](evidence/architectural-pivot-hocuspocus.md), [`evidence/api-shape-typescript-not-rest.md`](evidence/api-shape-typescript-not-rest.md).

**Links:**
- **Release-pivot evidence** (2026-04-28):
  - [`evidence/_user_outcomes.md`](evidence/_user_outcomes.md) — verbatim user direction + decoded outcomes + per-field scope map
  - [`evidence/architectural-pivot-hocuspocus.md`](evidence/architectural-pivot-hocuspocus.md) — fate map of all 38 prior decisions under the pivot
  - [`evidence/api-shape-typescript-not-rest.md`](evidence/api-shape-typescript-not-rest.md) — TypeScript-function-shaped API contract; /typescript-api-design applies
  - [`evidence/server-side-validation-pattern.md`](evidence/server-side-validation-pattern.md) — three-layer defense-in-depth (D45)
  - [`evidence/cross-process-write-strategy.md`](evidence/cross-process-write-strategy.md) — LWW for cross-process user-global writes (D46)
  - [`evidence/_init_worldmodel.md`](evidence/_init_worldmodel.md) — focused worldmodel pass on the pivot (739 lines)
- **External research** (2026-04-28):
  - [`reports/zod-v4-catalogs-registries/REPORT.md`](../../reports/zod-v4-catalogs-registries/REPORT.md) — Zod v4 registries + walker pattern for scope-as-constraint metadata (D47)
- **Original-direction evidence** (kept for audit): [`reports/config-edit-paths/REPORT.md`](../../reports/config-edit-paths/REPORT.md), [`evidence/validation-cli-patterns-3p.md`](evidence/validation-cli-patterns-3p.md), [`evidence/codebase-integration-points.md`](evidence/codebase-integration-points.md), [`evidence/tim-precedents-from-main.md`](evidence/tim-precedents-from-main.md), [`evidence/electron-cmdk-omnisearch-3p.md`](evidence/electron-cmdk-omnisearch-3p.md), [`evidence/config-architecture-framework.md`](evidence/config-architecture-framework.md), [`evidence/eval-group-{A,B,C,D}-*.md`](evidence/)
- **Related work (sibling specs)**: [`specs/2026-04-24-skill-dual-track-install/SPEC.md`](../2026-04-24-skill-dual-track-install/SPEC.md) (Tim's PR #318 — Settings UI hosts Install as a row, D22); [`reports/config-driven-folder-frontmatter/REPORT.md`](../../reports/config-driven-folder-frontmatter/REPORT.md) (Tim's PR #297 — `folders[]` design rationale)

---

## 1) Problem statement

**Situation.** OK's `.open-knowledge/config.yml` (workspace) and `~/.open-knowledge/config.yml` (user-global) is a Zod-validated YAML file controlling content scope, server bind, MCP autoStart, OAuth client ID, preview URL, folder rules, MCP tool tuning, and (post-pivot) appearance preferences. It's read at every server boot via a documented precedence chain (Zod defaults → user YAML → workspace YAML → ENV → CLI flags), with a 1s TTL cache for long-lived MCP sessions. The schema is the single source of truth; the file is hand-edited. **No write path exists today.**

**Complication.** Today there is no validated edit path from anywhere except a human typing YAML in an IDE — and the existing app's config-adjacent state is fragmented across surfaces with no unifying contract.

- **Agents (MCP) have zero write capability for config.** `exec` is read-only by design; `write_document` mangles non-markdown; no other tool reaches the file. Today's fallback is "tell the user to edit the file."
- **The Electron / web React app has no settings surface.** Theme + editor-mode default sit in `localStorage`; agent-tuning fields and folder rules require leaving the app, finding the file, hand-typing YAML, restarting the server.
- **Validation is server-only and runs at boot.** Agents and any future UI cannot pre-validate a proposed change before writing.
- **The file watcher does not watch `.open-knowledge/config.yml`.** External edits land silently — no UI re-render, no MCP-session notification.
- **No IDE intellisense.** No `$schema` published, no SchemaStore registration, no magic-comment scaffolding.
- **Scope is informally enforced.** The schema treats every field as scope-agnostic; the loader merges user + workspace tiers without per-field rules about which scope is *legal*. A user could put `appearance.theme` in workspace config and force every collaborator into dark mode — there's no schema-level constraint preventing it.

**Resolution.** Two CRUD surfaces over `config.yml`, plus IDE intellisense, all sharing one Zod schema, one validation core, and one transport spine via existing infrastructure:

1. **Modal Settings UI** — bound to Hocuspocus Y.Text-only docs admitted at well-known paths (`__config__/workspace`, `__user__/config.yml`). The Modal walks `ConfigSchema` to render the form; client-side Zod validation gates per-field commits; commits write to Y.Text via the existing collab WS; persistence-time validation on the server is defense-in-depth (D45 Layer 3). Identical code path in Electron and browser.
2. **Headless writers**: MCP `set_config` / `get_config` / `set_folder_rule` and CLI `ok config validate` / `ok config migrate` import `ConfigSchema` and validate before atomic fs writes. Server's file watcher detects → updates Y.Text → live UIs refresh. No HTTP layer for config.
3. **IDE intellisense (Tier 1)**: `# yaml-language-server: $schema=…` magic comment scaffolded by `ok init` + SchemaStore registration + `ok config validate` standalone command. Same Zod schema feeds the JSON Schema export via `z.toJSONSchema(target: 'draft-07')`.

**Schema-as-contract.** `ConfigSchema` migrates from `@inkeep/open-knowledge-server` to `@inkeep/open-knowledge-core` (D44) so it's reachable from the client bundle. Per-field `scope: 'user' | 'workspace' | 'either'` + `agentSettable: boolean` metadata declared via a custom Zod registry (D47) — the walker enforces scope as a constraint, not a hint, and the loader rejects illegal placements with a source-located error.

**File on disk stays the source of truth.** yaml@2 Document layer preserves comments + formatting through tool-mediated edits. The Y.Text observer in the Modal IS the live-refresh signal — the prior CC1 'config' broadcast channel (D6) is no longer needed; Y.Text observers fire on every external + local change.

## 2) Goals

- **G1 — Close the agent-edit gap.** Agents can read AND edit config with full schema validation via MCP tools (`set_config`, `get_config`, `set_folder_rule`). Validation happens before fs write; structured errors guide retries.
- **G2 — Ship a non-IDE-user UX path.** Electron and web users can edit config from inside the app without leaving for a text editor. Modal Settings UI is identical code in both surfaces (browser already speaks Hocuspocus).
- **G3 — Honor "Electron users never use CLI or other editors."** Every config field is reachable from the Modal — workspace-scope fields under the workspace tab; user-scope fields under the user tab; either-scope fields appear in both with a "modified at this scope" indicator.
- **G4 — One schema, one validation core, two writer shapes.** UI consumers get `ConfigBinding.patch()` over Y.Text; headless writers (MCP/CLI/seed) get `writeConfigPatch()` over fs. Both share `ConfigSchema` from `@inkeep/open-knowledge-core` and the same `Result<T, E>` envelope. /typescript-api-design discipline applies (not REST API design).
- **G5 — Live-refresh across open surfaces.** External edits (CLI, hand-edit, MCP from another session, another `ok start` instance) propagate to open Modals via the Y.Text observer that's already wired by Hocuspocus. No bespoke broadcast channel needed.
- **G6 — IDE intellisense as a free side-product.** Tier 1 publishes JSON Schema via `z.toJSONSchema(target: 'draft-07')`; IDE-savvy users get autocomplete + validation in any LSP-aware editor (VS Code, JetBrains, Helix, Zed, vim) without OK shipping an extension.
- **G7 — Scope-as-constraint, schema-enforced.** Each field's legal scope (`'user' | 'workspace' | 'either'`) is declared inline via a custom Zod registry (`fieldRegistry`); the walker enforces in the Modal (illegal-scope fields disabled in the wrong tab); the loader rejects illegal placements with `file:line:col` source-located errors. Adding a new field is a one-line schema change; the rest is mechanical.
- **G8 — One stop shop for entered config.** All user-configurable settings live in `config.yml` (workspace and/or user). Theme + editor-mode default migrate from localStorage into `appearance.*` (D20). Secret credentials (GitHub OAuth tokens) stay in `~/.open-knowledge/auth.yml` / OS keychain by design — different threat model.
- **G9 — Defense-in-depth validation.** Three layers (D45): client walker, headless writer, persistence-hook revert. A correctly-built client never sends invalid YAML; if one does, the server reverts Y.Text to last-known-good and emits a CC1 error broadcast.

## 3) Non-goals

- **[NEVER] NG1**: A pluggable validator framework (plugin registry, validator extension API). No prior-art tool in the cohort (Mintlify, Astro, Renovate, actionlint) has one. Premature abstraction risk.
- **[NEVER] NG2** *(reframed 2026-04-28 — was "no Hocuspocus for config")*: NEVER engage the markdown observer bridge for config docs; NEVER render awareness/presence in the Settings UI. Y.Text-only Hocuspocus admission with bridge bypass IS in scope (D39, D40, D41). The original NG2 conflated "Hocuspocus" with "the markdown CRDT bridge"; the bridge (Y.XmlFragment ↔ Y.Text via `@tiptap/y-tiptap`) is markdown-specific and never engaged for non-markdown docs. Y.Text as transport for live config refresh is exactly the right precedent — `__system__` already uses this pattern. Config docs get implicit CRDT merge on Y.Text, which is acceptable for per-machine config (concurrent same-field writes are vanishingly rare; LWW is the documented behavior per D46).
- **[NEVER] NG3**: Storing config in JSON internally then re-emitting YAML. The canonical pattern is `yaml.parseDocument() → schema.parse()` directly on the AST. No prior-art argues for the JSON intermediate.
- **[NEVER] NG10**: Writing OK-managed metadata files anywhere in the user's content tree outside `<contentDir>/.open-knowledge/**`. No per-folder `.frontmatter.yml` sidecars; no per-doc `.<filename>.metadata.json` companions; no implicit `_meta.json` / `_index.md` (Astro/Hugo style). Folder defaults live in `config.yml`'s `folders[]` array — sole source of truth. **Per-machine principle: OK pollutes nothing in user content.** STOP rule in AGENTS.md.
- **[NEVER] NG13** *(new 2026-04-28)*: Routing config edits through HTTP. The pivot replaces `POST /api/config/patch` with `ConfigBinding.patch()` over the collab WS (UI consumers) + `writeConfigPatch()` direct fs (headless writers). Re-introducing an HTTP layer for config writes would re-impose the all-routes `ApiError` envelope refactor (dropped per pivot), the PATCH dialect choice (D31, dropped), the ETag/If-Match concurrency machinery (D33, dropped), and the per-route security gating — all of which we're explicitly *not* paying for. **Only if** a non-Hocuspocus, non-fs writer emerges (e.g., a hosted multi-tenant scenario) — at which point this spec doesn't apply.
- **[NOT NOW] NG4**: External link liveness checks (HTTP HEAD probes for URLs in `preview.baseUrl` etc.). No prior-art doc tool does this. — **Revisit if** users report broken-link debugging as a pain.
- **[NOT NOW] NG5**: `--json` output mode for `ok config validate`. Only actionlint exposes structured CLI output in the cohort. — **Revisit if** a CI consumer asks.
- **[NOT NOW] NG6**: Live concurrent-editor presence in the Settings UI ("another tab is editing this field"). No web-host dev tool does this; LWW is the universal pattern. Reinforced by D46 — per-machine config makes presence-style coordination overkill. — **Revisit if** multi-user simultaneous config-editing becomes a real workflow (unlikely; per-machine config).
- **[NOT NOW] NG7**: Settings UI in the Electron Navigator window. Navigator has no utility process; needs a project to scope config to. — **Revisit if** "global preferences before opening a project" becomes a top-cited UX gap.
- **[NOT NOW] NG14** *(new 2026-04-28)*: Per-machine advisory lock (`proper-lockfile` or fcntl) on `~/.open-knowledge/config.yml` writes. v0 ships LWW per D46; lost-update window is ~2s and requires the same human editing the same field in two `ok start` instances within that window — vanishingly rare. — **Revisit if** real-world lost-update reports surface OR a feature emerges that legitimately requires synchronous cross-instance coordination.
- **[NOT UNLESS] NG8**: A second config file format (TOML, JSON5). — **Only if** users explicitly request a non-YAML on-ramp; current YAML pain is editor-side, addressed by Tier 1.
- **[NOT UNLESS] NG9**: Conflict-merge UX (auto-resolve concurrent edits). — **Only if** auto-save model surfaces real-world conflicts.
- **[NOT UNLESS] NG15** *(new 2026-04-28)*: Migrating non-secret per-host `auth.yml` metadata (`gitProtocol`, `name`, `email`) into `config.yml`. Today these live in `~/.open-knowledge/auth.yml` next to the GitHub token. They're identity bookkeeping written exclusively by `ok auth login`/`pat`/`signout` — not user-tunable settings. — **Only if** a real use case emerges where users want to edit these via the Settings UI; the file-separation cost is near-zero.

## 4) Personas / consumers

- **P1 — Electron desktop user (non-IDE-savvy)**: opens the OK desktop app, picks a project, never touches a terminal. Wants config changes to happen in-app. Cannot fall back to CLI or text editor by design (G3). The Modal binds to Hocuspocus over the existing utility-process IPC bridge → WS — same shape as binding to a markdown doc.
- **P2 — Web/`ok ui` user**: runs `ok start` from terminal, opens browser to the React app at `localhost:3000`. May or may not be IDE-savvy. **Reaches the Modal Settings UI via the same Hocuspocus WS that hosts the editor — no HTTP-specific code path.** Functional parity with Electron (P1). This is the load-bearing change from the original draft: no dedicated browser-server bridge.
- **P3 — IDE-savvy developer (terminal + editor)**: runs `ok start` from CLI, edits config in VS Code / JetBrains / Helix. Primary path is the IDE with `$schema`-driven autocomplete; uses `ok config validate` from CI scripts. Tier 1 ships unchanged.
- **P4 — AI agent (MCP client)**: an LLM agent (Claude, Codex, Cursor, etc.) connected via MCP stdio. Wants to programmatically edit config with full schema validation, structured error responses, and minimal token cost. **MCP `set_config` writes fs directly with imported schema validation** — no HTTP round-trip; works even when no Hocuspocus server is running (e.g., during init flows). Live UIs refresh via file watcher → Y.Text → Modal observer.
- **P5 — CI / automation script**: invokes `ok config validate` in a PR check or pre-commit hook, expects non-zero exit + structured errors on failure. Reads file + Zod safeParse; no transport.

## 5) User journeys

> **Release-pivot reframe (2026-04-28).** Journeys updated to reflect Settings-pane-not-Modal (D54), no HTTP for config (NG13), and dropped `sync.*` schema fields (D29). The architectural shape is: UI consumers go through `ConfigBinding.patch()` over collab WS; headless writers (MCP/CLI/seed) call `writeConfigPatch` direct fs; file watcher closes the loop for external edits.

### P1 — Electron user changes editor mode default to source mode
1. User invokes Settings entry point: App menu → Settings… (macOS) or Cmd-, anywhere.
2. The main editor pane navigates from current document → Settings pane (D54). Sub-tabs at top: **This project** (workspace) / **All projects** (user). User selects "All projects" since editor-mode-default is `scope: 'user'`.
3. Settings pane connects its `HocuspocusProvider` (D48) to `__user__/config.yml`; Y.Text loads (~100-300ms cold-mount per FR non-functional); walker renders the form.
4. User scrolls to "Appearance" section, changes `editorModeDefault` from "WYSIWYG" to "Source".
5. On change, field auto-commits via `userBinding.patch({appearance:{editorModeDefault:'source'}})`. L1 validation (D45) runs client-side; passes; Y.Text replace operation transmits over collab WS.
6. Server-side `onStoreDocument` config-doc branch (FR-34) re-validates (L3); passes; atomic tmp+rename writes `~/.open-knowledge/config.yml`; LKG cache updates.
7. The user-global Y.Text update propagates to all connected clients (other browser tabs, Electron windows of the same machine) via Yjs delta — Settings panes and any chrome controls bound to `userBinding` re-render.
8. User closes Settings pane (Esc, sidebar nav, or another entry point) → editor area returns to prior document.
9. **Failure path:** field with invalid value (e.g., theme set to a string outside the enum) — L1 walker blocks the commit; field shows inline error + stays in dirty state; no Y.Text mutation; no disk write.

### P4 — Agent edits config
1. Agent decides to update the search tool's max results. Calls `set_config({patch: {mcp: {tools: {search: {maxResults: 100}}}}})` (no `scope` param — server infers via D61 ladder).
2. MCP tool resolves cwd via `resolveProjectConfigContext(cwd)` (D62 — fs-direct, no server-discovery). Calls `writeConfigPatch({cwd, scope: <inferred>, patch})` from `@inkeep/open-knowledge-core`.
3. `writeConfigPatch` runs L2 validation (D45 Layer 2): yaml@2 `parseDocument` of existing file → walks patch tree applying setIn → re-serializes → `ConfigSchema.safeParse(merged)`. Atomic tmp+rename via `tracedRename`.
4. Server's file watcher (FR-15) detects the change → reads file → updates Y.Text via server-origin transaction → all connected Settings panes refresh via Y.Text observer.
5. Response: `{structuredContent: {ok: true, applied: ['mcp.tools.search.maxResults'], scope: 'user', current: <full Config>}}` + matching text block. (`current` echoes the effective merged config so the agent stays in sync without a separate `get_config` round-trip.)
6. **Failure path (validation):** invalid patch (e.g., `maxResults: "fast"`) — `writeConfigPatch` returns `{ok: false, error: ConfigValidationError}` with structured issues; tool emits `isError: true` + retry framing prose. Agent reads the structured error and retries with corrected value.
7. **Failure path (mixed scope, D61):** patch attempts to set fields that resolve to different scopes (e.g., one workspace-only field and one user-only field in the same call). `writeConfigPatch` rejects with `error.code: 'MIXED_SCOPE'`. Agent retries per-scope.
8. **Failure path (no server running, D62):** `writeConfigPatch` succeeds anyway — fs-direct write; live UIs simply don't refresh until next server start (file is correctly on disk).

### P3 — IDE user opens config in VS Code
1. User runs `ok init` to scaffold a new project. `config.yml` is generated with line 1: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json` (FR-17 version-pinned URL).
2. User opens config.yml in VS Code (Red Hat YAML LSP installed).
3. Types `mcp.` — autocomplete pops up with all mcp fields, descriptions from Zod `.describe()` calls (preserved through `z.toJSONSchema(schema, {metadata: fieldRegistry})` per D60 + FR-18).
4. Types `mcp.tools.search.maxResults: "100"` — squiggle: "expected number, got string."
5. Saves; the running server's file watcher (FR-15) detects the change → reads file → updates Y.Text → any open Settings pane refreshes via Y.Text observer. If the change produces invalid YAML, the persistence-hook L3 (FR-34) catches it and the file watcher's read fails to parse → Y.Text stays at LKG → next pane open shows the recovery toast.
6. **Alternative onboarding (no `ok init`)**: SchemaStore PR landed (FR-19); VS Code auto-discovers schema via Schema Store match for `**/.open-knowledge/config.yml` filename pattern. Same intellisense without the magic comment.

### P5 — CI runs `ok config validate`
1. CI workflow runs `ok config validate` after PR checkout.
2. If valid: exit 0, nothing on stdout, "✓ Configuration valid (sources: …)" on stderr.
3. If invalid: exit 1, source-located errors (FR-27) per line on stderr (`config.yml:12:18: invalid type — expected number, got 'fast'` plus a snippet showing the offending token), `--json` flag deferred to Future Work.

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

> **Release-pivot reframe (2026-04-28).** This section is rewritten from the HTTP-centric original. FRs 1–28 were rationalized: HTTP-related FRs (FR-12, FR-13, FR-14 'config' broadcast role, FR-28) are dropped per NG13; "Modal" terminology is replaced with "Settings pane" per D54; Two-validator collapses to three-layer per D45; new FRs 29–43 capture D39–D63. The original FR-1 through FR-28 numbering is preserved where the requirement survives; dropped FRs are marked `~~FR-N~~ DROPPED → reason`. New FRs continue from FR-29.

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-1**: Settings entry points trigger pane navigation in the main editor area (NOT a Dialog overlay per D54). Entry points: (i) HelpPopover submenu, (ii) Cmd-, shortcut, (iii) CommandPalette entry, (iv) Electron App menu item ("Settings…"). | Cmd-, navigates the editor area to Settings pane in Electron + browser; HelpPopover uses `useState` + click handler that sets the editor-area mode to `'settings'`; CommandPalette uses `window.location.hash = '#settings'` with App.tsx-mounted listener; Electron menu adds `openSettings?(): void` to `MenuDeps` (`packages/desktop/src/main/menu.ts`) and wires it via `ok:menu-action` channel; navigation away from Settings (Esc, sidebar doc click, another entry point) returns the editor area to its prior document | Mirrors integration shape of `InstallInClaudeDesktopDialog` per #318 — but the action target is pane navigation, not modal open. Same hash-routing infrastructure as existing `#/<docName>` navigation; `#settings/workspace` and `#settings/user` for sub-tab deep-links. |
| Must | **FR-2**: Settings pane has two sub-tabs ("This project" / "All projects") for workspace vs user scope. `'workspace'`-only fields appear only in the project tab; `'user'`-only fields appear only in the all-projects tab; `'either'` fields appear in both with the FR-3b modified-at-scope indicator (per D54). | User can switch sub-tabs; correct config doc is bound based on tab (workspace tab → `__config__/workspace`; all-projects tab → `__user__/config.yml`); fields are filtered/disabled by scope per `getFieldMeta(field).scope` | Scope = `'workspace'` (default) or `'user'`; Settings pane just doesn't render in Electron Navigator window per D16 + FR-20 |
| Must | **FR-3**: Auto-save with per-control commit (matches VS Code Settings UI) | Text inputs commit on blur or Enter; booleans/selects commit on change; no Save button | `ConfigBinding.patch()` fires after L1 client-side validation passes (D8 + D45) |
| Must | **FR-4**: Per-field "Reset to default" affordance | Hover icon next to any modified field; click resets to schema default; commits via auto-save | Matches VS Code's reset-on-hover pattern |
| Must | **FR-5**: Local validation blocks invalid intermediate values from writing (D45 Layer 1) | Field with invalid value shows inline error; no `ConfigBinding.patch()` call until merged-config Zod safeParse succeeds | Persistence-hook L3 is the server-side safety net (D45 Layer 3); MCP/CLI Layer 2 is the headless equivalent |
| Must | **FR-6**: MCP `set_config(patch)` tool — fs-direct upsert with deep-partial input over the **agent-settable allowlist** (D26 + D43 — paths tagged `agentSettable: true` in `fieldRegistry`). **No `scope` parameter** exposed to agents (D25 + D61 algorithm — server infers scope per-field via `inspectConfig` ladder + `getFieldMeta(field).defaultScope` fallback). **No `expectedVersion`** (D33 dropped — concurrency handled by CRDT for UI / LWW for cross-process per D46; agents that need read-modify-write safety re-`get_config` after their write to verify). **Mixed-scope patch rejection**: if the patch's leaves resolve to multiple scope targets, fail with `error.code: 'MIXED_SCOPE'` per D61. Paths outside the allowlist fail with `error.code: 'NOT_AGENT_SETTABLE'`. Per-field `.describe()` surfaces in `inputSchema`; `inputSchema` narrowed to allowlisted paths only. **Annotations**: `idempotentHint: true`, `destructiveHint: false`, `readOnlyHint: false`. **Implementation**: tool calls `writeConfigPatch({cwd, scope: <inferred>, patch})` from `@inkeep/open-knowledge-core` directly (no HTTP per NG13); works whether or not `ok start` is running. **Dual-emit per MCP spec**: `structuredContent` typed; `content[]` serialized JSON or `humanFormat(error) + "\n\nPlease fix and try again."` for retry framing. **Response shape (success)**: `structuredContent: {ok: true, applied: string[], scope: 'workspace'\|'user', current: Config}` — `current` echoes the effective merged config; `scope` informational (tells the agent where it landed). **Response shape (error)**: `structuredContent: {ok: false, error: ConfigValidationError}`. | D25 + D26 + D43 + D45 + D61 + D62; description prose drafted in §9.7.2 (still applies modulo HTTP/etag references — Step 8 finalize will sweep) |
| Must | **FR-6b**: Always-array transactional folder upsert primitive — 2-layer operation per D38 (reshaped) + D62, shared across MCP/UX (HTTP layer dropped per NG13). **Core helper**: `applyFolderRulesUpsert({cwd, rules: Array<{match, frontmatter, new_match?}>, scope?: 'workspace'\|'user'})` in `@inkeep/open-knowledge-core`. Reads current `folders[]` for the chosen scope (defaults to `'workspace'`); for each input rule, find-or-append-or-rename in a working array; calls `writeConfigPatch` once with the resulting full array. Returns the same `Result<T, ConfigValidationError>` shape (D35). **All-or-nothing**: if validation fails on the merged result, no writes happen — `writeConfigPatch`'s atomic write + Zod safeParse give transactional semantics for free; no per-row partial-success machinery. **MCP tool**: `set_folder_rule({rules: Array<{match, frontmatter, new_match?}>})` — thin wrapper around `applyFolderRulesUpsert(cwd, ...)` per D62; resolves contentDir via `resolveProjectConfigContext(cwd)` (NOT `resolveProjectServerContext`); works without a running OK server. Annotations: `idempotentHint: true`, `destructiveHint: false`, `readOnlyHint: false`. **Always accept an array, even for N=1** — agents wrap a single rule in `[{...}]`. Description (Step 8 sweep): operation (upsert one or more folder rules); sibling (`set_config({patch: {folders: [...]}})` for whole-array replace); transactional semantics ("if any rule fails validation, no rules are applied"); removal goes through `set_config`. Tool description tagged `[Operates on disk; no running OK server required]`. **Removal NOT a separate tool**: read-modify-write through `set_config({patch: {folders: [<filtered>]}})` is fine for the rare removal case; the future right-click-folder UX uses the same path for removal. | D38 (reshaped) + D62 + D63. Mechanical glue: helper ~40 LoC; MCP wrapper ~15 LoC. Live UIs refresh via the file watcher (D52) when a server IS running; when no server is running, no broadcast (write still lands cleanly on disk). |
| Must | **FR-6c**: MCP `get_config(path?)` tool — fs-direct read of effective merged config (defaults → user → workspace applied via existing `loadConfig`). Input: `{path?: string[]}` (e.g. `['folders']` or `['mcp', 'tools']` returns sub-tree; omit for full config). **No allowlist gating on read** — agent can read any field; allowlist (D26 + D43) only constrains writes. **Annotations**: `readOnlyHint: true`, `idempotentHint: true`. **Output**: `structuredContent: {value: <resolved JSON>}` + serialized JSON in `content[].text`. **No `etag`** (D33 dropped). Initial context still comes via MCP instructions handshake; this tool is for mid-session re-reads when state may have changed (file watcher detects external edits, another agent wrote). **Description (Step 8 sweep)**: opens with purpose, distinguishes from `set_config` (read vs write), notes when to use vs. relying on session-start context. Tool description tagged `[Operates on disk; no running OK server required]`. | Standard inspect+update verb pair (VS Code `inspect`+`update`, git `config --get`+`config`); read-all + write-narrow matches the `read_document`+`write_document` pattern already in OK; fs-direct via `loadConfig` (existing). |
| ~~FR-7~~ | ~~MCP `get_config` tool — read full config or sub-path~~ **🚫 MERGED into FR-6c 2026-04-28** — was a duplicate row in the original draft. | — | — |
| Must | **FR-8**: `outputSchema` on `set_config` is the success/error projection of `ConfigValidationError` (D14 shrunk + D45). Success branch: `{ok: true, applied: string[], scope, current}`. Error branch: `{ok: false, error: ConfigValidationError}` — discriminated union `YAML_PARSE \| SCHEMA_INVALID \| SCOPE_VIOLATION \| NOT_AGENT_SETTABLE \| MIXED_SCOPE \| WRITE_ERROR \| UNKNOWN`. Forward-compat tail: `z.object({code: z.string(), message: z.string().optional()}).catchall(z.unknown())`. **Dual-emit per MCP spec**: `structuredContent` typed; `content[].text` serialized JSON (success) or `humanFormat(error) + "\n\nPlease fix and try again."` (error). LLM-retry framing on error path. **Zod toJSONSchema note**: discriminated unions emit `oneOf` only (no formal `discriminator` keyword); MCP TS SDK forces `type: 'object'` wrapper to satisfy `ListToolsResultSchema` — verified for Zod 4.3.6 + MCP TS SDK ^1.x. | TS-only contract (no HTTP envelope per NG13); same shape used by `ConfigBinding.patch` (UI) and `writeConfigPatch` (headless). G7 forward-compat preserved. |
| ~~FR-9~~ (RESHAPED) | **🔁 FR-9 RESHAPES 2026-04-28 → split into FR-9 (writeConfigPatch) + FR-33 (ConfigBinding.patch).** Original FR-9 described `applyConfigPatch` as the single shared HTTP-backed primitive. Under the pivot, the equivalent is two functions sharing a validation core. **FR-9 now covers**: `writeConfigPatch({cwd, scope, patch}): Result<{effective, appliedPaths}, ConfigValidationError>` in `@inkeep/open-knowledge-core`. **PATCH semantics**: TypeScript `DeepPartial<Config>` with null-as-clear convention (per D31 RFC 7396 spirit, no wire format). **Single Zod safeParse** of the merged document (D32 → D45 collapse). **No ETag/expectedVersion** (D33 → D46 LWW). **Write mechanics**: yaml@2 `parseDocument` → walk patch tree applying `setIn`/`deleteIn` → `doc.toString()` → atomic tmp+rename via `tracedRename`/`tracedWriteFile`. Document layer preserves comments + blank lines + anchors. **Consumed by**: MCP `set_config`, MCP `set_folder_rule` (via `applyFolderRulesUpsert`), CLI `ok config validate` + `ok config migrate`, `seed/apply.ts` (per FR-9b retargeted), and any future fs-direct caller. | `writeConfigPatch` is the headless writer; `ConfigBinding.patch` is the UI writer (FR-33). They share `ConfigSchema`, `ConfigValidationError`, the yaml@2 round-trip helper, and the merged-document validation core. |
| Must | **FR-9b**: Migrate `packages/server/src/seed/apply.ts:85-113` `folders[]` write path to call `applyFolderRulesUpsert` (per D63). Replace the per-configPath append-loop + `parseDocument` + mutate + `writeFileSync` block with `applyFolderRulesUpsert({cwd, scope: 'workspace', rules: [...]})`. Atomic tmp+rename replaces the existing `writeFileSync`; validation strictness improvement (existing path bypasses Zod for the seed write — feature, not regression). | After landing: seed/apply imports + calls `applyFolderRulesUpsert`; existing seed unit tests pass with minor error-shape updates (string → `ConfigValidationError`); ~15 LoC delete + ~10 LoC add. | Closes the D5 invariant gap (RESHAPED) — every config write now goes through one validation/persistence path; the file watcher → Y.Text → Modal observer flow handles the live-refresh that the original FR-14 CC1 broadcast was for. |
| Must | **FR-9c**: Schema cleanup + loose-mode + codemod. **Remove from `ConfigSchema`** (per D29, P32 opinionated simplicity): `sync.*` (all 7 fields — engine opinionated about full sync lifecycle), `persistence.{debounceMs, maxDebounceMs}` (2 fields — engine has well-considered defaults), `server.port` (per-machine only, env+CLI handle the use case). **Add to `ConfigSchema`**: `appearance.theme`, `appearance.editorModeDefault` (per D20). **Switch every `z.object({...})` to `z.looseObject({...})`** per D34 — forgiveness on unknown fields; users mid-upgrade with stale `sync.*` set don't get rejected at load time. **Fix doc/schema mismatch**: `packages/cli/src/content/init.ts:61` template comment says `port: 3000` but schema defaults to `0` (kernel-allocated) — drop the `port` line from the template entirely since `server.port` is no longer a schema field. **Ship `ok config migrate` codemod (FR-26) in the same release** so users have a one-shot cleanup path instead of dead text accumulating on disk. | After this FR: `ConfigSchema` has 7 sections (`content`, `github`, `server` (host + openOnAgentEdit only), `preview`, `folders[]`, `mcp`, `appearance`) and ~12 leaf fields, all in loose-mode. All schema fields are wired end-to-end (no half-implemented features). Tests pass with the dropped fields removed; an integration test asserts a config file with `sync.pushIntervalSeconds: 30` (a dropped field) loads successfully via loose-mode and is preserved on disk through round-trip writes. | Per P31 (no half-implemented) + P32 (opinionated for 90% case) + D34 (forgiveness over strictness) + D37 (same-day codemod, ESLint v9 lesson). The dropped 10 fields fall into two categories: (a) vestigial/half-wired (sync.*, persistence.* — 9 fields) — engine doesn't read them; documentation hazard; (b) per-machine-only (server.port — 1 field) — env+CLI is the natural override path; no clean 2-tier-ladder home. Adding any back later is purely additive. With loose-mode, users mid-upgrade aren't broken; with codemod, they get explicit cleanup. |
| Must | **FR-3b**: Settings pane renders a per-setting "modified at this scope" indicator (subtle 2-3px colored bar on left edge OR small dot near the field label) for every field whose value at the currently-viewed sub-tab differs from default. | Field row gets `data-modified="true"` attribute when `inspectConfig(path)[currentScope] !== undefined`; CSS renders the bar/dot. Universal across mature editor-class products (VS Code colored bar, JetBrains blue text, Cursor inherits). Foundational, not polish. | Distinct from Q9 (the cross-scope override-by-workspace badge, which IS polish-tier). Cheap (~10 LoC + CSS); foundational UX. Q9 deferred separately. |
| Must | **FR-10**: Comment-preserving round-trip via `yaml@2` Document layer | `parseDocument()` → `setIn(path, value)` → `doc.toString()` → atomic tmp+rename write; comments, blank lines, anchors preserved | Per `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md`; in-repo proof-of-pattern at `seed/apply.ts:88-104` |
| Must | **FR-11**: Three-layer defense-in-depth validation (D45 — supersedes original two-validator pattern). **L1 (Modal walker, client)**: per-field commit gated by Zod safeParse on the merged config; invalid commits never leave the browser. **L2 (`writeConfigPatch`, headless)**: same Zod safeParse before fs write; MCP/CLI/seed all share this gate. **L3 (Hocuspocus persistence hook, server)**: `onStoreDocument` config-doc branch parses Y.Text → YAML → `ConfigSchema.safeParse` before disk write; on rejection, reverts Y.Text via `CONFIG_VALIDATION_REVERT_ORIGIN` server transaction (D58) using in-memory LKG cache; emits CC1 `'config-validation-rejected'` broadcast. All three layers share `ConfigSchema` from `@inkeep/open-knowledge-core` (D44 + D50) and `ConfigValidationError` discriminated union. | Single safeParse run at three entry points; uniform mechanism. L1 covers normal-flow correctness; L2 covers headless writers; L3 catches malicious/buggy clients, schema drift, hand-edits. ~75-90 LoC total per evidence/server-side-validation-pattern.md. |
| ~~FR-12~~ | ~~HTTP `POST /api/config/patch` endpoint~~ **🚫 DROPPED 2026-04-28 → no HTTP for config (NG13).** Equivalent functionality lives in `ConfigBinding.patch` (FR-33) over the collab WS for UI consumers and `writeConfigPatch` (FR-9) for headless writers. | — | — |
| ~~FR-13~~ | ~~HTTP `GET /api/config?scope=...&path=...` endpoint~~ **🚫 DROPPED 2026-04-28 → no HTTP for config (NG13).** UI consumers read via `ConfigBinding.current()`; MCP `get_config` reads via in-process `loadConfig` (per FR-6c). The dev-only `/api/config` handler at `packages/app/src/server/api-config-handler.ts` is unrelated (returns dev port info). | — | — |
| ~~FR-14~~ | ~~CC1 `'config'` channel broadcast on every successful write~~ **🚫 DROPPED 2026-04-28 → Y.Text observer IS the channel** (D6 superseded). Hocuspocus's existing Yjs delta propagation handles fan-out automatically once config docs are admitted. **Residual scope retained as FR-14b**: CC1 `'config-validation-rejected'` channel survives for surfacing L3 validation rejections to open Settings panes (per FR-39 / D56). | — | — |
| Must | **FR-14b**: CC1 `'config-validation-rejected'` channel for L3 validation rejection surfacing. Persistence hook emits broadcast with `{error: ConfigValidationError, docName: '__config__/workspace'\|'__user__/config.yml'}` payload. Settings pane subscribes; on receipt, walker maps `issue.path` to rendered field + triggers FR-39 toast + flash. | Channel registered in `cc1-broadcast.ts`; emitter in persistence hook D42 path; subscriber in Settings pane component. ~10 LoC + per-D54 the existing `__system__` doc carries it. | Single residual CC1 channel for config; the bulk of live-refresh now flows through Y.Text observer per the pivot. |
| Must | **FR-15**: File watcher detects external edits to `.open-knowledge/config.yml` (workspace + user). Per D52: chokidar single-file watch with `awaitWriteFinish: { stabilityThreshold: 100 }`. New API: `startConfigFileWatcher(absPath: string, onChange: (content: string) => void): () => void` — registered at boot for both workspace and user-global paths. On detected change, server reads file → updates Y.Text via server-origin transaction → all open Settings panes refresh via Y.Text observer. | Chokidar dependency added; ~30 LoC subscription module + 2 callsites in `boot.ts`; cleanup on server shutdown. Atomic-rename detection (write-tmp → rename) handled by `awaitWriteFinish` debounce — no separate handling needed. | New code; supplements (does not replace) the existing `@parcel/watcher`-based content watcher. |
| Must | **FR-16**: `ok config validate` CLI subcommand | `new Command('config').addCommand(new Command('validate'))`; loads config; validates; exit 0 on success, non-zero with multi-line errors on failure; `--cwd` flag inherited | Tier 1 (P3, P5) |
| Must | **FR-17**: `ok init` scaffolds magic comment at the top of generated `config.yml`. **Pin the `$schema` URL to the installed package's major.minor version** so the user's autocomplete surface stays in lockstep with what they wrote against. `CONFIG_YML_CONTENT` constant in `packages/cli/src/content/init.ts:5` gets a new line BEFORE the existing `# Open Knowledge — workspace configuration` header: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json` (the major.minor portion is templated at scaffold time from the running CLI's `PACKAGE_VERSION`). Existing `# Schema reference: packages/cli/src/config/schema.ts` prose comment stays (human-readable hint for editors without LSP). | Tier 1 (P3). Pinned version follows the [Biome `$schema` URL](https://biomejs.dev/guides/configure-biome/) precedent (`https://biomejs.dev/schemas/1.8.3/schema.json`). Without the version pin, the IDE's schema cache drifts from what the user wrote against — they upgrade the tool, the cloud schema changes, autocomplete shifts under them with no migration signal. With the pin, schema and runtime stay locked together; on upgrade the user re-runs `ok init` (or the codemod from FR-26) to bump the URL. The `--save-exact` discipline applies. Both directives coexist (LSP directive on line 1, human comment in body). |
| Must | **FR-25**: Settings pane exposes an "Integrations" section with an "Install in Claude Desktop" row that opens the existing `InstallInClaudeDesktopDialog`. Hidden on Linux (no Claude Desktop) per Tim's FR10 in `specs/2026-04-24-skill-dual-track-install/SPEC.md`. | Row labeled "Install in Claude Desktop" in the Integrations section of the pane; click opens `<InstallInClaudeDesktopDialog>` (already imported); detection via `window.okDesktop?.detectClaudeDesktop?.()` (Electron) or always-show (web). Fulfills Tim's D13 destination — Help submenu + HelpPopover + CommandPalette entries from #318 remain as secondary entry points for discoverability. | Cheap addition; reuses existing dialog component (the dialog itself stays a Dialog — it's a one-shot install flow, not editable settings); honors Tim's original D13 placement intent |
| Must | **FR-18**: Build step emits `dist/config-schema.json` from `z.toJSONSchema(ConfigSchema, {io: 'input', target: 'draft-07'})`. **`io: 'input'` is load-bearing**: a field with `.default('localhost')` has Zod input type `string \| undefined` (the user can omit it) and output type `string` (the server fills it in). The IDE LSP target must show the user what they **type** (input view), not what the runtime resolves (output view) — otherwise a defaulted field appears falsely required in autocomplete. New `build:schema` npm script; chained into `build`; emits valid JSON Schema draft-07; shipped via npm `files: ['dist']`. **Add CI test** asserting that the emitted JSON Schema and `ConfigSchema.parse()` accept/reject the same set of representative fixtures — guards against `.transform()` or `.coerce()` slipping into the schema and silently breaking IDE/runtime equivalence (today's schema is transform-free; the test prevents regression). | Tier 1; powers magic-comment + SchemaStore. The `io: 'input'` flag is the single-line difference between "IDE shows the right shape" and "IDE wrongly insists every defaulted field is required." `concerns/schemas.md` §"Input vs output types" + `special/schemas-across-boundaries.md` §"Publish JSON Schema for the shape only". |
| Must | **FR-19**: SchemaStore PR submitted | One-time PR to `SchemaStore/schemastore` adds catalog entry: name, description, url (unpkg-hosted), fileMatch `['**/.open-knowledge/config.yml','**/.open-knowledge/config.yaml']` | Tier 1 (P3) — one-time external work |
| Must | **FR-20**: Settings menu item hidden/disabled in Electron Navigator window | `mode === 'navigator'` → don't render menu entry; or render disabled with tooltip "Open a project to access settings" | NG7 alignment |
| Must | **FR-26**: `ok config migrate` CLI subcommand — same-day codemod paired with D29 schema cleanup (per D37). Reads workspace + user config, removes the 10 dropped fields (`sync.*`, `persistence.{debounceMs,maxDebounceMs}`, `server.port`), writes back via `applyConfigPatch`. **Idempotent** — running twice on a clean file is a no-op. **Flags**: `--dry-run` (preview without writing), `--scope <workspace\|user\|both>` (default `both`). Uses yaml@2 Document layer to preserve all comments + structure for fields not being removed. Funnels through `applyConfigPatch` so all D5/CC1/two-validator/atomic-write invariants apply automatically. **Implementation site**: `packages/cli/src/commands/config.ts` (same file as `ok config validate`); subcommands hang off the `config` parent. Future codemods extend this command (e.g., `ok config migrate --to v0.5`) rather than spawning new ones. | The ESLint v9 retrospective is the decisive evidence — `@eslint/migrate-config` shipped a month after the breaking release and the migration dragged for 20 months. *"Prioritize tooling over documentation."* Turborepo 2.0's `pipeline → tasks` rename was smooth because `@turbo/codemod migrate` shipped same-day. With FR-9c (loose-mode passthrough) + FR-26 (codemod) both shipping, users mid-upgrade aren't broken AND get explicit cleanup. |
| Must | **FR-27**: Source-located error messages for config validation (per D36). Switch loader from `parseYaml` (string → JS object) to `parseDocument` (yaml@2's source-position-preserving parser — already in production at `seed/apply.ts:88-104`). When `ConfigSchema.safeParse` fails, walk each issue's `.path` back to source positions via the Document AST: `doc.getIn(path)` returns the `Node` whose `.range` carries `[startByte, endByte]` offsets; translate to line/col against the source string. Emit errors in the `file:line:col` + snippet format (see §9.6.4). Applies to `loadConfig`, `ok config validate`, `applyConfigPatch` (HTTP/MCP failure rendering), and the Modal's display of validation rejections (issue path → rendered field mapping). | Today's loader emits `Invalid configuration:\n  path: message\n...` with no file:line:col — user has a JSON-pointer path and has to grep. Biome's lint output is the bar (`file:line:col` + code snippet with offending token highlighted). One source-position-preserving parser, three consumers benefit. Test asserts `ok config validate` on a fixture with `pushIntervalSeconds: "fifty"` emits an error containing the literal substring `config.yml:<line>:`. |
| Must | **FR-28**: Single canonical `ApiError` Zod discriminated union exported from `@inkeep/open-knowledge-server` (per D14, D30). Schema in `packages/server/src/api-error.ts` (NEW). All HTTP routes (config-edit + the ~50 existing routes using `{ok, error: string}` + the 2 seed routes using `{ok: false, error: {kind, message}}`) refactor to return `{ok: false, error: ApiError}` as part of v0 implementation. Per-consumer rendering helpers in the same file: `humanFormat(error: ApiError): string` (CLI/MCP text), `statusFor(error: ApiError): number` (HTTP status mapping). MCP `set_config`/`get_config` tools wrap via `asMcpToolResult(result)`. Forward-compat tail variant `z.object({ code: z.string(), message: z.string().optional() }).catchall(z.unknown())` ensures unknown future codes don't break old clients. **Test**: every existing route's error path now returns the new envelope shape; integration test asserts each error code maps to the documented HTTP status. | Resolves Q1 → align all routes (not "additive only"). One source of truth for error contract; new error codes update HTTP status mapping, MCP rendering, CLI text in one place. The discriminated union gives compile-time exhaustive matching at every consumer site. ~50 routes × ~5 LoC + helper functions = one focused day of work. RFC 9457 Problem Details + Stripe typed-error-class hierarchy converge on the same "define once, render per consumer" pattern. |
| Should | **FR-21**: Per-field "Reset to default" works on every field with a Zod default | Walker-side: detect `.default()` wrapper; render reset icon; clicking writes the default value | Polish item |
| Should | **FR-22**: Inline field documentation surfaced from Zod `.describe()` calls | Hover/popover on each field shows the `.describe()` text | Reuses same source as MCP per-field descriptions + IDE hover |
| Should | **FR-23**: Settings pane layout responsive (mobile + desktop browsers) | Inherits the editor area's existing responsive sizing; no special handling needed | Per D54 the pane uses editor-area scroll; trivial. |
| ~~FR-24~~ | ~~Local UI prefs surfaced in same Settings dialog~~ **🚫 SUPERSEDED 2026-04-28 → D55 dual-track.** Theme + editor-mode-default migrate from localStorage to `appearance.*` lazily per FR-40; localStorage stays as FOUC cache. No separate "Preferences" tab needed. | — | See FR-40. |
| Must | **FR-28-equivalent**: ~~Single canonical `ApiError` envelope across all OK routes~~ **🚫 DROPPED 2026-04-28 → no HTTP for config (NG13); D30 dropped.** The TS-only `ConfigValidationError` (per FR-8) covers config; existing routes' `{ok, error: string}` shape is left as-is for this spec. The all-routes envelope alignment is captured as Future Work (§15) — separate spec if pursued. | — | — |

**New FRs (added 2026-04-28 release pivot):**

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-29**: Admit `<contentDir>/.open-knowledge/config.yml` and `~/.open-knowledge/config.yml` as Y.Text-only Hocuspocus docs (D39, D40). Synthetic doc names `__config__/workspace` and `__user__/config.yml`. Boot-time admission via `hocuspocus.openDirectConnection()` mirroring `__system__` precedent. New `isConfigDoc(documentName: string): boolean` predicate sibling to `isSystemDoc`; ContentFilter bypass for these well-known paths. | Predicate + admission added to `boot.ts`; tests verify both docs receive Y.Text updates from connected clients; `__system__` doc not affected by the change. | ~30 LoC: predicate sibling, boot-time admission, ContentFilter bypass. |
| Must | **FR-30**: Bridge bypass for non-content docs. Single-line gate at `server-observer-extension.ts:50`: `if (isSystemDoc(name) \|\| isConfigDoc(name)) return` (D41). Markdown observer bridge (`@tiptap/y-tiptap` `yXmlFragmentToProseMirrorRootNode`) runs only for `.md`/`.mdx` content docs. | Test asserts that a Y.Text-only mutation on `__config__/workspace` does not invoke the bridge; existing markdown doc behavior unchanged. | One-line source change; cross-cutting precedent for any future non-markdown doc admission. |
| Must | **FR-31**: `ConfigSchema` migrates from `packages/cli/src/config/schema.ts` to `@inkeep/open-knowledge-core` (D44, D50). Two-PR gradual move: PR 1 copies schema source to core + adds re-export shim in cli; PR 2 updates the 17 importers to use the core path + removes the shim. Of the 17 importers, only 1 (`loader.ts`) is runtime; the rest are `import type` and erase at compile time. | After PR 2: `@inkeep/open-knowledge-core` exports `ConfigSchema`, `Config`, `FolderRule`, `FolderRuleSchema`; cli re-export shim removed; all importers reference core; tests pass; `packages/app` can import `ConfigSchema` from core for the Settings pane walker. | ~50 LoC PR 1 + ~150 LoC PR 2 (~50 sites × import-path update). |
| Must | **FR-32**: Custom `fieldRegistry` + `getFieldMeta` walker pattern in `@inkeep/open-knowledge-core` (D43, D47, D60). `Symbol.for('@inkeep/open-knowledge/field-registry')`-keyed `globalThis` singleton (mirrors `z.globalRegistry`). Every leaf field in `ConfigSchema` MUST `.register(fieldRegistry, {scope, agentSettable, defaultScope?})` BEFORE any wrappers (`.default()`, `.optional()`). Walker descends `_zod.def.innerType` to find leaf metadata. | Loader rejects illegal scope placements with source-located error (`file:line:col` format per FR-27); Settings pane disables fields whose `scope` doesn't match the current sub-tab; MCP `set_config` enforces `agentSettable: true` allowlist via `getFieldMeta(field).agentSettable`; JSON Schema export via `z.toJSONSchema(schema, {metadata: fieldRegistry})` includes scope/agentSettable as custom keys. | ~30 LoC for registry + walker + STOP rule in AGENTS.md. Per-field annotations span `ConfigSchema` definition (~15 fields × 1 line each = ~15 LoC). |
| Must | **FR-33**: `bindConfigDoc(provider: HocuspocusProvider, scope: 'workspace' \| 'user'): ConfigBinding` API in `@inkeep/open-knowledge-core` (D5 reshape Part A; per `evidence/api-shape-typescript-not-rest.md`). Returns `{current(): Config; patch(patch: DeepPartial<Config>): Result<{effective, appliedPaths}, ConfigValidationError>; subscribe(listener): Unsubscribe}`. The `patch()` method validates client-side (D45 L1), serializes via yaml@2 setIn → re-serialize, replaces Y.Text content; Yjs delta transmits over the existing collab WS. Per D48: each config doc gets its own `HocuspocusProvider` (NOT pool reuse). Per D59: no client-side y-indexeddb persistence for config docs. | Settings pane (FR-37) imports `bindConfigDoc` and subscribes; theme toggle in chrome (when migrated per FR-40) calls `userBinding.patch({appearance:{theme:...}})`; on disconnect/reconnect, providers re-fetch from server LKG; no IDB stale state. | ~80 LoC for `bindConfigDoc` + `ConfigBinding` interface + Y.Text observer wiring. |
| Must | **FR-34**: Persistence-time validation hook (D42, D45 L3) + LKG cache + revert via `CONFIG_VALIDATION_REVERT_ORIGIN` (D58). Hocuspocus `onStoreDocument` config-doc branch: parse Y.Text → YAML → `ConfigSchema.safeParse`. On success: atomic tmp+rename via `tracedRename`/`tracedWriteFile`; update LKG cache. On rejection: do NOT write disk; revert Y.Text via server-origin transaction marked with `CONFIG_VALIDATION_REVERT_ORIGIN` (frozen object literal `{context: {origin: 'config-validation-revert'}, skipStoreHooks: true}`); emit CC1 `'config-validation-rejected'` broadcast. Entry-gate at hook top: `if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return` — belt-and-suspenders alongside `skipStoreHooks: true`. | Test asserts: invalid YAML in Y.Text → no disk write; Y.Text reverts to prior LKG value; CC1 broadcast emitted; subsequent valid mutation succeeds. LKG cache initialized on doc load from current disk content + safeParse. | ~40 LoC hook branch + LKG cache + CC1 wiring; ~5 LoC for origin marker; ~3 LoC for entry-gate. |
| Must | **FR-35**: Cold-start recovery for invalid config files (D57). When server boot encounters a syntactically-broken or schema-failing user-global config: (a) parse with yaml@2 + safeParse, (b) on failure, attempt `tracedRename` to `~/.open-knowledge/config.yml.invalid-<ISO-timestamp>`, (c) if rename fails (read-only fs, etc.), keep file in place and log warning, (d) initialize Y.Doc with schema-default-serialized YAML + the FR-17 magic-comment header, (e) emit CC1 `'config-validation-rejected'` broadcast on first Modal connect. | Test asserts: invalid YAML at boot → file moved aside (or warning logged if rename fails) → Y.Doc loads with defaults → first Settings pane connect receives CC1 broadcast with recovery notification. | New `readConfigSafely` helper in core (~30 LoC); called by boot.ts + `loadConfig`. |
| Must | **FR-36**: Lazy first-write of `~/.open-knowledge/config.yml` via `writeConfigPatch` (D51, NOT eager via `ok init`). When a user-scope-targeted patch is applied and the file doesn't exist, `writeConfigPatch` creates parent dir + writes file with magic comment header (FR-17) + the patch applied to schema defaults. Atomic tmp+rename via `tracedRename`/`tracedWriteFile`. Mode: 0o644 (NOT 0o600 — config is not secret). | Test asserts: first user-scope `writeConfigPatch` call against missing `~/.open-knowledge/` creates dir + file with magic comment + applied patch; subsequent reads via `loadConfig` return the patched config. | Reuses `persistence.ts:881-884` atomic-write pattern; ~10 LoC in `writeConfigPatch`. |
| Must | **FR-37**: Settings pane component in `packages/app/src/components/SettingsPane.tsx` (NEW) replacing the prior Modal Dialog approach (D54). The editor area routes to either `<TiptapEditor>` (markdown content) or `<SettingsPane>` (config) based on a UI-state mode. Pane has User and Workspace sub-tabs (FR-2); each tab acquires its own `HocuspocusProvider` per FR-33; renders schema-driven form via the Zod walker; auto-saves per-field commits via `binding.patch`. Closing the pane (Esc, sidebar nav, another entry point) returns the editor area to its prior document. | Cmd-, opens pane in Electron + browser; pane displays User and Workspace sub-tabs; field commits flow through `binding.patch`; external edits (CLI, MCP, hand-edit) reflect via Y.Text observer; closing pane returns to prior document. | ~300 LoC (walker + sub-tab routing + auto-save + reset-icon + observer wiring). |
| Must | **FR-38**: Six OTel spans for config edits (D53). Spans: `config.bind` (every `bindConfigDoc` invocation), `config.patch` (every `ConfigBinding.patch` and `writeConfigPatch`), `config.validate` (each Zod safeParse pass — L1, L2, L3 — with `config.validation.layer` attribute), `config.persist` (the persistence-hook write), `config.revert` (the L3 revert-to-LKG transaction). All disk writes route through existing `tracedWriteFile`/`tracedRename` (which already emit `fs.*` spans). Bounded enum attributes only: `config.scope` (`'user'\|'workspace'`), `config.validation.layer` (`'L1'\|'L2'\|'L3'`), `config.outcome` (`'success'\|'rejected'\|'reverted'`), `config.transport` (`'ytext'\|'fs'`). Zod issue paths go in span events (not attributes — cardinality risk per `concerns/observability.md`). | Trace queries can correlate a user gesture → client-side validation → Y.Text replace → server-side validation → disk write → file watcher fan-out (or revert path) end-to-end. | ~80 LoC across new modules following the `withSpan` pattern from `telemetry.ts`. |
| Should | **FR-39**: Validation rejection UX in Settings pane (D56). When CC1 `'config-validation-rejected'` arrives (from L3 hook firing on a non-pane writer): toast with `humanFormat(error)` text + auto-dismiss after 8s; affected field (mapped from `issue.path`) flashes red briefly. User can retry from the form. | Toast renders for ≥6s and auto-dismisses by 9s; field flash uses CSS `animation` for 600ms; retry path identical to normal field commit. | ~20 LoC subscriber + flash CSS class. |
| Should | **FR-40**: Theme dual-track preserve (D55). `appearance.theme` and `appearance.editorModeDefault` default to UNSET in config.yml (no `'system'` / `'wysiwyg'` default). Existing chrome theme toggle keeps writing localStorage UNTIL the chrome toggle component is updated to call `userBinding.patch({appearance:{theme:...}})`. First explicit Settings-pane write of `appearance.*` canonicalizes the value into config.yml. localStorage updates as a derived cache on every config change (loader writes through). | Existing FOUC scripts unchanged; first explicit Settings write of `appearance.theme` lands in config.yml; subsequent toggles via Settings pane update both config + localStorage; chrome toggle (until updated) writes localStorage only. | No active migration code path; chrome toggle update can ship in a follow-up PR without blocking v0. |

### Non-functional requirements

- **Performance**: Settings pane first-open <300ms (Hocuspocus connect + Y.Text load + form render); per-field auto-save commit <100ms (Y.Text replace + WS roundtrip + re-render — no disk write on the critical path); persistence-hook disk write <200ms (yaml@2 round-trip + safeParse + atomic rename); file-watcher → Y.Text update propagation <500ms end-to-end.
- **Reliability**: Atomic file writes via tmp+rename (`tracedWriteFile`/`tracedRename`). No partial writes ever land on disk. Three-layer defense-in-depth validation (D45) — invalid mutations never reach disk. Persistence-hook revert-to-LKG handles rejection without server crash. Cold-start recovery (FR-35) handles invalid existing files without blocking boot.
- **Security/privacy**: No HTTP for config (NG13). Hocuspocus WS auth-gated by existing token-based handshake (D49 — no additional gating needed for config docs). Config is per-machine state; collab WS is loopback by default. Secrets stay in `~/.open-knowledge/auth.yml` / OS keychain (NG15 — not migrated to config.yml).
- **Operability**: Pino structured logs on every `writeConfigPatch` call (path, scope, success/fail, durationMs); persistence-hook validation events; CC1 `'config-validation-rejected'` broadcasts logged. OTel spans per FR-38 cover the full chain. Renderer telemetry: Settings pane open events (no PII).
- **Cost**: 3 new MCP tools (`set_config`, `get_config`, `set_folder_rule`) — ~3K tokens of context. **No new HTTP endpoints.** One new CC1 channel (`'config-validation-rejected'` only — Y.Text observer replaces the prior 'config' broadcast). Two new file-watcher subscriptions (workspace + user-global). Two new Hocuspocus doc admissions. **Code budget** (rough — refined during implementation):
  - `writeConfigPatch` core ~80 LoC (yaml@2 round-trip + single-validator + atomic write + Result return)
  - `bindConfigDoc` + `ConfigBinding` ~80 LoC
  - `ConfigValidationError` envelope + `humanFormat` helper ~50 LoC
  - MCP tools (`set_config`, `get_config`, `set_folder_rule`) ~120 LoC
  - CLI commands (`validate` + `migrate` codemod) ~150 LoC
  - Source-located error machinery ~80 LoC
  - Settings pane component + Zod walker ~300 LoC
  - Entry-point wiring (HelpPopover, Cmd-,, CommandPalette, Electron menu) ~80 LoC
  - File watcher subscription module + `boot.ts` callsites ~40 LoC
  - Persistence-hook config-doc branch + LKG cache + revert origin ~50 LoC
  - Cold-start recovery (`readConfigSafely`) ~30 LoC
  - Hocuspocus admission (predicate + boot integration + bridge bypass) ~30 LoC
  - `fieldRegistry` + walker + per-field annotations ~45 LoC
  - `ConfigSchema` migration to core (PR 1) ~50 LoC; (PR 2 import updates) ~150 LoC
  - OTel spans wiring ~80 LoC
  - Tests (integration coverage for three-layer validation, file-watcher fan-out, cold-start recovery, scope-as-constraint, theme dual-track) ~250 LoC
  - **Total: ~1,580 LoC.** Comparable to the original draft's ~1,600 LoC estimate but composed differently — heavier on UI walker + Hocuspocus integration, lighter on HTTP envelope alignment (which is dropped per NG13).

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

> **Release-pivot reframe (2026-04-28).** This section is rewritten to reflect the Hocuspocus + TypeScript API direction. Subsections 9.5–9.8 from the original draft (Configuration Architecture Framework / Mutation contract / Error envelope / Boundary discipline) are retained below for reference but their HTTP-boundary specifics are SUPERSEDED by D45 (three-layer validation), D46 (LWW), and D47 (scope-as-constraint). Implementation should follow this section + the new evidence files; the original §§9.5–9.8 are kept for audit trail.

### User experience / surfaces

- **Modal Settings UI** (Electron + web, **identical code**): shadcn `<Dialog>` opened from EditorHeader (HelpPopover submenu or Settings icon), Cmd-, shortcut, Electron App menu ("Settings…" via `ok:menu-action` channel). Top-level scope tabs ("This project" / "All projects"). Schema-driven custom form walking `ConfigSchema` from `@inkeep/open-knowledge-core` (D44). Auto-save on per-control commit (D8). Per-field Reset to default (D9). Inline `.describe()` tooltips. Client-side Zod validation gates commits (D10 + D45 Layer 1). **Scope-as-constraint enforcement** (D47): fields whose `scope: 'user'` are disabled in the workspace tab; fields whose `scope: 'workspace'` are disabled in the user tab; `scope: 'either'` fields appear in both with a "modified at this scope" indicator.
- **Theme + editor-mode quick controls** (chrome): editor header's existing theme toggle becomes a `ConfigBinding.patch({appearance:{theme:'dark'}})` call — same backend as the Modal. Multi-window theme sync becomes free via the user-global Y.Text observer.
- **MCP tools** (P4):
  - `set_config({patch, expectedVersion?})` — agent-settable allowlist (D26); no `scope` exposed (D25 evolved to D47); validates → fs write → file watcher closes the loop
  - `get_config({path?})` — read effective merged config; no allowlist on read
  - `set_folder_rule({rules: [...], expectedVersion?})` — always-array transactional upsert (D38, retained)
- **CLI** (P3, P5):
  - `ok config validate [--cwd PATH]` — load + Zod safeParse; exit 0/non-zero; source-located errors to stderr (D36)
  - `ok config migrate [--scope <workspace|user|both>] [--dry-run]` — same-day codemod for D29 schema cleanup (D37)
- **`ok init` magic-comment scaffold**: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json` on line 1 of generated `config.yml` (FR-17, retained)
- **SchemaStore submission**: One-time PR; unlocks zero-config IDE intellisense for every Red Hat YAML LSP user (FR-19, retained)
- **Error messages**: Field-inline (Modal walker maps `issue.path` → rendered field); source-located (`file:line:col` + snippet) for CLI/loader; `ConfigValidationError` discriminated union for in-process consumers
- **No HTTP endpoints for config writes** (NG13). The `ConfigBinding.patch()` call encodes a Y.Text mutation that travels over the existing collab WS; the `writeConfigPatch()` headless helper writes the file directly.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| EditorHeader → Settings entry | React (Electron + web) | Cmd-, fires; HelpPopover "Settings…" link works; menu item on macOS opens Modal |
| Modal — Workspace tab | React | All `scope: 'workspace'` and `scope: 'either'` fields render; defaults shown; auto-save via `ConfigBinding.patch({...})`; Y.Text observer reflects external edits |
| Modal — User-global tab | React | All `scope: 'user'` and `scope: 'either'` fields render; binds to `__user__/config.yml` Y.Doc; same render code |
| Theme toggle in editor header | React | Calls `userBinding.patch({appearance:{theme:'dark'}})`; multi-window sync verified |
| MCP `set_config` | MCP stdio | Tool registered; validates patch against `ConfigSchema` via imported `writeConfigPatch`; allowlist gating per D26; works with no `ok start` running |
| MCP `get_config` | MCP stdio | Returns full or sub-tree from fs read; no transport |
| MCP `set_folder_rule` | MCP stdio | Always-array shape; transactional all-or-nothing per D38 |
| `ok config validate` | CLI | Exit 0 on valid; non-zero with source-located errors on invalid |
| `ok config migrate` | CLI | Removes 10 deprecated fields per D29; idempotent; `--dry-run` previews; preserves comments via yaml@2 Document layer |
| Generated `config.yml` (post-`ok init`) | Disk | Line 1 has version-pinned magic comment |
| IDE editing `.open-knowledge/config.yml` | External | Autocomplete + validation work via magic comment OR SchemaStore match |
| Electron Navigator | Renderer | No Settings entry visible (D16, FR-20) |

### System design

#### Architecture overview (post-pivot)

```
                                                   CALLERS
   ┌──────────────────────────┐  ┌───────────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
   │ Settings Modal           │  │ Editor chrome controls    │  │ MCP set_config /     │  │ CLI ok config        │
   │ (React, Electron + web)  │  │ (theme toggle, etc.)      │  │ get_config /         │  │ validate / migrate   │
   │ ConfigBinding.patch(...) │  │ ConfigBinding.patch(...)  │  │ set_folder_rule      │  │ writeConfigPatch     │
   └────────────┬─────────────┘  └────────────┬──────────────┘  └──────────┬───────────┘  └──────────┬───────────┘
                │ Y.Text replace               │ Y.Text replace             │ writeConfigPatch        │ writeConfigPatch
                │ over collab WS               │ over collab WS             │ (in-process fs)         │ (in-process fs)
                ▼                              ▼                            │                         │
        ┌─────────────────────────────────────────────────────┐             │                         │
        │ Hocuspocus Y.Doc                                    │             │                         │
        │   __config__/workspace  (Y.Text only, no bridge)    │             │                         │
        │   __user__/config.yml   (Y.Text only, no bridge)    │             │                         │
        │ admitted via isConfigDoc() predicate (D39, D40)     │             │                         │
        │ persistence-time validation (D45 L3)                │             │                         │
        │   if invalid: revert Y.Text to LKG + emit CC1 error │             │                         │
        │   if valid: atomic tmp+rename to disk               │             │                         │
        └────────────────────────┬────────────────────────────┘             │                         │
                                 │ disk write                               │                         │
                                 ▼                                          │                         │
                          ┌─────────────────────────────────────────────────▼─────────────────────────▼──┐
                          │ <contentDir>/.open-knowledge/config.yml   (workspace, source of truth)        │
                          │ ~/.open-knowledge/config.yml              (user-global, LWW per D46)          │
                          │ atomic tmp+rename (existing precedent)                                        │
                          └────────────────────────────┬───────────────────────────────────────────────────┘
                                                       │ external edit (CLI, hand-edit, MCP from another instance)
                                                       ▼
                                          ┌──────────────────────────────────┐
                                          │ File watcher per server instance │
                                          │ (extends content watcher)        │
                                          └────────────────┬─────────────────┘
                                                           │ fs change → re-read → Y.Text update
                                                           ▼
                                      ┌──────────────────────────────────────────┐
                                      │ All connected clients see Y.Text update  │
                                      │ via existing Yjs delta propagation       │
                                      │ Modal observer re-renders                 │
                                      └──────────────────────────────────────────┘
```

**Key architectural facts:**
- The Y.Text observer replaces the prior CC1 'config' broadcast channel (D6 dropped). Hocuspocus's existing Yjs delta propagation handles fan-out automatically.
- A separate CC1 'config-validation-rejected' broadcast remains for surfacing validation errors from the persistence-time hook (D45 L3) — that's the only `__system__` channel needed.
- File watcher is per-server-instance. Multiple `ok start` instances on the same machine each watch `~/.open-knowledge/config.yml` independently; LWW per D46.
- No HTTP `/api/config/*` route. The dev-only `/api/config` handler at `packages/app/src/server/api-config-handler.ts` is unrelated (returns dev port info; left as-is).

#### Data model

- **On disk**: `<contentDir>/.open-knowledge/config.yml` (workspace) + `~/.open-knowledge/config.yml` (user-global). YAML format. Schema: `ConfigSchema` exported from `@inkeep/open-knowledge-core` (D44; relocated from `@inkeep/open-knowledge-server`).
- **In Hocuspocus**: Y.Doc per config file with synthetic name (`__config__/workspace` or `__user__/config.yml`). Single Y.Text holding the YAML source. No Y.XmlFragment, no markdown bridge engaged.
- **In memory (server)**: Per-doc LKG (last-known-good) cache holding the most recent successfully-validated YAML string (D45). In-memory only; rebuilt on doc load.
- **AST during write**: `yaml@2` `Document` (in-process, transient).
- **Wire**: Modal ↔ server is Yjs binary deltas over the existing Hocuspocus WS. MCP/CLI/seed don't have a wire — they call `writeConfigPatch()` in-process and write fs directly.

#### API/transport

The "API" is a TypeScript contract, not a network protocol. See [`evidence/api-shape-typescript-not-rest.md`](evidence/api-shape-typescript-not-rest.md) for the full surface; sketch:

```ts
// from @inkeep/open-knowledge-core (browser + node compatible)
export interface ConfigBinding {
  current(): Config;
  patch(patch: DeepPartial<Config>): Result<{ effective: Config; appliedPaths: string[] }, ConfigValidationError>;
  subscribe(listener: (config: Config) => void): Unsubscribe;
}
export function bindConfigDoc(provider: HocuspocusProvider, scope: 'workspace' | 'user'): ConfigBinding;

export function writeConfigPatch(opts: {
  cwd: string;
  scope: 'workspace' | 'user';
  patch: DeepPartial<Config>;
}): Result<{ effective: Config; appliedPaths: string[] }, ConfigValidationError>;
```

Both share `ConfigSchema`, `ConfigValidationError`, the `Result<T, E>` envelope, and the yaml@2 round-trip helper. /typescript-api-design discipline applies in Step 5 to lock the precise shapes.

- **WebSocket** (Modal/chrome consumers): existing collab WS, carries Yjs deltas for `__config__/workspace` and `__user__/config.yml` Y.Docs. No new WS handshake; admission via `isConfigDoc()` predicate.
- **Filesystem** (MCP/CLI/seed consumers): atomic tmp+rename to the canonical path. No transport layer.
- **MCP** (stdio): `set_config` / `get_config` / `set_folder_rule` tools; their wrappers internally call `writeConfigPatch` / read fs.

#### Auth/permissions

- **Hocuspocus WS** is already auth-gated (existing token-based handshake). Config docs admitted under the same gate — no new auth machinery.
- **MCP** runs in stdio (local subprocess); the boundary is "user has process access = user can edit config." Allowlist (D26) bounds *what* an agent can write, not *whether*.
- **CLI**: in-process; no auth boundary.
- **No HTTP** for config edits → no `checkLocalOpSecurity` needed for this spec (D17 dropped).

#### Enforcement points (D45 — three-layer defense-in-depth)

- **Layer 1 — Modal walker (client)**: client-side Zod safeParse on the merged config before every Y.Text replace. Invalid commits never leave the browser.
- **Layer 2 — Headless writer (`writeConfigPatch`)**: same Zod safeParse before fs write. MCP/CLI/seed all share this gate.
- **Layer 3 — Persistence hook (server)**: `onStoreDocument` config-doc branch parses Y.Text → YAML → `ConfigSchema.safeParse`. On rejection: do NOT write disk; revert Y.Text via server-origin transaction using the in-memory LKG cache; emit CC1 `'config-validation-rejected'` broadcast for UI feedback.
- **Scope enforcement (D47)**: `getFieldMeta(schema)` walker reads `fieldRegistry` metadata; Modal disables fields in illegal scope tabs; loader rejects illegal placements with `file:line:col` source-located error.
- **Allowlist (D26, retained)**: MCP `set_config` rejects writes to paths not tagged `agentSettable: true`. Read side is unrestricted.

See [`evidence/server-side-validation-pattern.md`](evidence/server-side-validation-pattern.md) for the full defense-in-depth design with the LKG cache lifecycle, error envelope shape, and code-cost estimate (~75-90 LoC server-side).

#### Observability

- **Pino structured logs**: every `writeConfigPatch` call (path, scope, success/fail). Every persistence-hook validation event. Every CC1 `'config-validation-rejected'` broadcast.
- **OTel spans** (per the OTel instrumentation conventions): `config.write`, `config.validate`, `config.persist`, `config.revert` — all under `withSpan` with `doc.name` attribute.
- **Renderer telemetry**: Settings dialog open events (no PII).
- **MCP tool-call logging**: existing `createLoggedServer` wrapper.

#### Data flow diagram

- **Primary flow (UI write)**: Modal field commit → client-side Zod validate → `Y.Text.delete + Y.Text.insert` (mutating bytes via yaml@2 setIn → re-serialize) → Yjs delta over WS → server's `onStoreDocument` validates → atomic tmp+rename → all clients see Y.Text update via Yjs delta propagation.
- **Primary flow (MCP/CLI write)**: agent or CLI calls `writeConfigPatch` → in-process Zod validate → atomic tmp+rename → file watcher detects → server re-reads → Y.Text update → all clients refresh.
- **Primary flow (external edit, e.g., hand-edit in IDE)**: user saves file → file watcher detects → server reads → server-origin Y.Text update → all clients refresh. If hand-edit produces invalid YAML, persistence-hook on next Y.Text mutation rejects → reverts to LKG.
- **Shadow paths to test**:
  - **nil / missing**: config.yml doesn't exist → first `writeConfigPatch` creates parent directory + writes file with patch applied to schema defaults. No prompt (Q7 already RESOLVED in original spec).
  - **empty**: empty YAML file → loader returns Zod defaults; first patch applies to defaults; new file written.
  - **invalid scope**: client tries to put `appearance.theme` in workspace config via raw Y.Text mutation → persistence-hook rejects with `SCOPE_VIOLATION` error code → Y.Text reverts → CC1 broadcast notifies Modal.
  - **wrong type**: agent sends `{appearance: {theme: 42}}` → `writeConfigPatch` returns `{ok: false, error: ConfigValidationError}` with structured issues; no fs write.
  - **YAML syntax error**: external hand-edit breaks YAML → file watcher reads → fails to parse → server keeps Y.Text at LKG; logs warning; emits CC1 broadcast for next-Modal-load notification.
  - **cross-process race**: two `ok start` instances both write `~/.open-knowledge/config.yml` within ~2s → LWW per D46; Future Work D14 if real-world reports surface.
  - **persistence-hook crash**: hook throws unexpected exception → Hocuspocus marks the doc dirty → next debounce cycle retries; if still failing, doc remains in Y.Text-mutated state without disk persistence (degraded but not data-loss).

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Modal walker (L1) | Invalid field value | Client-side Zod safeParse | Inline field error; no Y.Text mutation | User sees error inline; correctable |
| `writeConfigPatch` (L2) | Invalid patch | In-process Zod safeParse | Returns `Result.err`; no fs write | MCP: `isError: true`; CLI: source-located error to stderr, exit 1 |
| Persistence hook (L3) | Y.Text → YAML produces invalid config | yaml.parse OR ConfigSchema.safeParse | Revert Y.Text to LKG via server-origin transaction; emit CC1 'config-validation-rejected' | Modal sees revert via Y.Text observer; toast notification with error |
| Persistence hook | Disk write fails (permission, full disk) | fs.rename throws | Log error; Y.Text is in-memory only; LKG unchanged | Modal still shows new value (Y.Text); next Modal session may diverge until disk fixed |
| File watcher | Loses connection (OS event delivery breaks) | @parcel/watcher error event | Restart watcher; log warning | External edits temporarily not reflected in open Modals; recovers on watcher restart |
| File watcher | External hand-edit breaks YAML syntax | yaml.parse fails on read | Keep Y.Text at LKG; log warning; emit CC1 'config-validation-rejected' | Modal continues showing LKG; user sees error toast on next open |
| Cross-process write race | Two `ok start` instances write within ~2s | (None — accepted per D46) | None (LWW); converges via file watcher within ~100ms | One user's edit "doesn't stick"; user retries |
| Hocuspocus persistence | onStoreDocument throws | Hocuspocus marks doc dirty | Retry on next debounce | Edit may be delayed; Y.Text + LKG remain consistent |
| MCP tool | `writeConfigPatch` validation fails | Zod safeParse | Tool returns structured error to agent | Agent sees actionable error with path + message; retries with corrected patch |

### Alternatives considered (post-pivot)

- **HTTP endpoint with `applyConfigPatch` server primitive** — REJECTED 2026-04-28 (architectural pivot). Adds an entire transport layer for a problem the existing Hocuspocus WS solves for free; forces all-routes `ApiError` envelope refactor (~50 routes), PATCH dialect choice, ETag/If-Match concurrency, per-route security gating. Functionally equivalent to the new design; ~60-75% more decision surface. See [`evidence/architectural-pivot-hocuspocus.md`](evidence/architectural-pivot-hocuspocus.md) for the full fate map.
- **Per-machine advisory lock for cross-process writes** — DEFERRED 2026-04-28 to NG14. Lost-update window is ~2s and requires same human in same field in two `ok start` instances within window — vanishingly rare. Adding `proper-lockfile` infrastructure is purely additive when needed.
- **HTTP shim for browser only, fs-direct everywhere else** — REJECTED. Would require dual code paths (Modal-via-HTTP vs Modal-via-Hocuspocus) with no functional benefit, since browser already speaks Hocuspocus over the existing WS. The HTTP shim was the question that resolved the pivot ("can we just use Hocuspocus?" — yes).
- **Inline `.meta()` for scope metadata** — REJECTED. Zod v4 `.meta()` does NOT propagate through `.default()` / `.optional()` / `.nullable()` wrappers (verified empirically in [`reports/zod-v4-catalogs-registries/REPORT.md`](../../reports/zod-v4-catalogs-registries/REPORT.md)). Custom `fieldRegistry` + `getFieldMeta` walker (D47) descends `_zod.def.innerType` to find leaf metadata reliably.
- **Per-domain MCP tools** (`set_sync_config`, `set_server_config`, ... ~12 tools) — REJECTED in original spec, retained. Tool-count is the strongest predictor of agent failure.
- **Discriminated-union per-section** (`set_config({payload: discUnion(per-section)})`) — REJECTED in original spec, retained.
- **Use an existing form library (RJSF, JSON Forms, react-formgen, uniforms)** — REJECTED in original spec, retained.

---

> **🚫 SUPERSEDED 2026-04-28 — original HTTP-centric §9 content below.** Everything from this line through the end of §9.8 (start of §10 Decision log) is the pre-pivot draft, retained for audit trail per the §9 head note. The CURRENT proposed solution is the post-pivot content above (§9 §"User experience / surfaces" through §9 §"Alternatives considered (post-pivot)"). Do NOT use the content below as implementation guidance — it references HTTP routes, `applyConfigPatch` server primitive, ETag/If-Match, and `<Dialog>`-based Modal UX, all of which are SUPERSEDED.

#### Affected routes / pages [SUPERSEDED — see post-pivot table above]

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

### System design [SUPERSEDED — see post-pivot section above]

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

> **2026-04-28 Release Pivot — superseded decisions.** Decisions D5, D6, D14, D17, D30, D31, D32, D33 are SUPERSEDED by D45–D47. D38 is RESHAPED (HTTP route drops; MCP tool + helper retained). The strikethrough markings below preserve the original rationale for audit. New decisions D39–D47 codify the pivot.

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Storage stays YAML on disk; `yaml@2` Document layer for round-trip | T | LOCKED | Yes | Comment preservation requires Document AST; `js-yaml` disqualified | `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` | All write paths use `parseDocument` + `setIn` + `toString` |
| D2 | Zod schema is the single source of truth; `z.toJSONSchema()` is export side-product | T | LOCKED | Yes | Bridge ecosystem consolidated on Zod v4 native; reverse direction is codegen-only | `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md` | All consumers (MCP `inputSchema`, IDE schema, form walker) derive from one Zod source |
| D3 | Single MCP `set_config` upsert tool with deep-partial input | T | LOCKED | Yes | 2-6 tools/server optimum; per-domain explosion violates MCP design | `reports/config-edit-paths/REPORT.md` D4 | Future per-section tools would be additive; can't easily refactor away |
| D4 | Custom shadcn form walking Zod schema (no form library) | T | LOCKED | No | RJSF/JSON Forms drop `.refine()`; react-formgen alpha; ~150 LoC walker for our scale | `reports/config-edit-paths/evidence/d3-form-libraries.md` | Walker is ours to maintain; offsets external dependency risk |
| ~~D5~~ | ~~All `config.yml` writers — Modal, MCP `set_config`, HTTP, AND existing `seed/apply.ts:85-113` `folders[]` writer (shipped in #319) — funnel through `applyConfigPatch` shared write primitive. Seed currently bypasses (pre-existed our spec); refactoring `seed/apply.ts` onto `applyConfigPatch` is **in-scope for v0 implementation** (see FR-9b).~~ **🚫 RESHAPED 2026-04-28 → D45 + the API-shape pivot.** The "shared write primitive" splits into `ConfigBinding.patch()` (UI consumers, Y.Text over WS) + `writeConfigPatch()` (headless writers, fs-direct). Both share the same Zod validation core. `seed/apply.ts` migrates onto `writeConfigPatch` (FR-9b retained, retargeted). | X | LOCKED | Yes | Single source of validation truth; cascade via CC1 to all surfaces; preserves FR-14 invariant (every successful write signals CC1 `'config'`) — seed/apply currently doesn't, which is the structural reason refactor is in-scope, not future work. | VS Code `ConfigurationEditingService` precedent + in-repo `seed/apply.ts:88-104` (Tim's #319, merged 2026-04-27) proves the `parseDocument` → mutate → `toString` round-trip pattern works in production | Migrating seed/apply unifies the primitive; assumption A2 upgrades from research-verified to repo-verified |
| ~~D6~~ | ~~CC1 'config' channel for external-edit refresh~~ **🚫 SUPERSEDED 2026-04-28 → Y.Text observer IS the channel.** Hocuspocus's existing Yjs delta propagation handles fan-out automatically once config docs are admitted (D39, D40). One residual CC1 channel survives — `'config-validation-rejected'` — for surfacing persistence-hook validation errors (D45 L3) to the Modal. | T | LOCKED | No | Reuses existing `__system__` push primitive | `evidence/codebase-integration-points.md` §5 | Adds one channel literal; SystemDocSubscriber routing update |
| ~~D7~~ | ~~Modal UI shape: shadcn `<Dialog>` overlay~~ **🚫 SUPERSEDED 2026-04-28 → settings render as a pane in the main editor area, NOT a Dialog overlay.** User direction (NQ5 resolution): the schema-driven settings form replaces the document view in the main editor area when invoked via an entry point (Cmd-,, App menu, HelpPopover, CommandPalette). Same Hocuspocus binding (Y.Text-only config docs) — only the rendering surface changes. Per-scope rendering uses VS Code's pattern: User and Workspace sub-tabs inside the pane. Captured as D54 (proposed; formal entry pending). | P | DIRECTED | No | Already installed; multiple precedents (CloneDialog, NewItemDialog); modal blocks editor underneath cleanly | `evidence/codebase-integration-points.md` §1 | Could swap to `<Sheet>` or page route later if needed |
| D8 | Auto-save with per-control commit (matches VS Code Settings UI) | P | LOCKED | No | Dissolves dirty-state-vs-external-edit conflict; matches well-known precedent | VS Code `ConfigurationEditingService` | No Save button; field commits on blur (text) or change (boolean/select) |
| D9 | Per-field Reset to default (hover icon, VS Code pattern) | P | DIRECTED | No | Cheap; covers "undo my mistake" without global undo stack | VS Code Settings UI | Walker must detect `.default()` wrappers per field |
| D10 | Block writes while invalid (validate-before-commit) | P | DIRECTED | No | Matches form-library pattern; keeps disk clean; instant feedback | RJSF/JSON Forms canonical pattern | Server-side safeParse is final safety net |
| D11 | Scope: workspace + user-global, both via Modal scope picker | P | LOCKED | Yes | Honors "Electron users never use CLI" principle; user-global is real today | Investigation: `loader.ts:67-98` reads both | Modal needs scope tabs; HTTP/MCP take `scope` param; OK becomes first writer to `~/.open-knowledge/config.yml` |
| D12 | Bundle Tier 1 (SchemaStore + magic-comment + `ok config validate`) into this spec | P | DIRECTED | No | Same Zod source; same build step; ships value before Modal lands | Stakeholder pref | ~3-4 incremental days; no new spec/audit overhead |
| D13 | CLI command name: `ok config validate` (not `ok validate config`) | T | LOCKED | Yes (CLI consumers) | Per-domain top-level commands is the dominant pattern; no umbrella in surveyed cohort | `evidence/validation-cli-patterns-3p.md` | Future siblings: `ok validate-links`, etc. — peer commands |
| ~~D14~~ | **🚫 SHRINKS 2026-04-28 → `ConfigValidationError` (TS-only, no wire format).** With no HTTP layer (NG13), there's no envelope to standardize *across routes*. The discriminated-union error shape is retained as `ConfigValidationError` (`code: 'YAML_PARSE' \| 'SCHEMA_INVALID' \| 'SCOPE_VIOLATION' \| 'WRITE_ERROR' \| 'UNKNOWN'`) used by `ConfigBinding.patch()`, `writeConfigPatch()`, and the CC1 `'config-validation-rejected'` payload. The "all-routes alignment" ambition (D30) drops entirely. *Original: Error shape contract: a single Zod discriminated union `ApiError` (keyed on `code` literal) defines every error variant. Per-issue shape inside `VALIDATION_FAILED`: `{path: (string\|number)[], message, issueCode, params?}` (Zod path symbols coerced to strings at the wire). Forward-compat tail variant included so future codes don't break pinned clients. The envelope is rendered per consumer at the boundary (HTTP envelope body + status code, MCP `isError + structuredContent + content[].text`, CLI `prettifyError` to stderr). See §9.7. | T | LOCKED | Yes (CLI + MCP consumers) | One source of truth for error contract — adding a code updates HTTP status mapping, MCP rendering, CLI text, and any future SDK in one place. Discriminated union gives compile-time exhaustive matching. Path coercion at wire avoids the Zod `PropertyKey[]` symbol-serialization gotcha. Tail variant prevents new error codes from breaking pinned clients (open-enum discipline). | RFC 9457 Problem Details (one envelope shape, multiple consumer renderings); Stripe's typed-error-class hierarchy with serializable `type: string` discriminator (the stripe-node #1374 lesson) | All future validators adopt the same shape; D30 establishes that existing `{ok, error: string}` and seed `{ok: false, error: {kind, message}}` routes refactor to this envelope as part of v0 implementation (resolves Q1 → align). |
| D15 | `runConfigValidation()` lives in `@inkeep/open-knowledge-server` (not CLI-only) | T | DIRECTED | No | Single source for CLI command + `applyConfigPatch` + future surfaces | `evidence/codebase-integration-points.md` §5-6 | Core/server adopts the validator runner shape |
| D16 | Settings entry hidden in Electron Navigator window | P | LOCKED | No | Navigator has no utility, no contentDir; project-scoped settings have nothing to bind to | `evidence/codebase-integration-points.md` §8 | Renderer checks `mode === 'navigator'` |
| ~~D17~~ | ~~HTTP endpoints behind `checkLocalOpSecurity` (DNS-rebind + loopback + Host)~~ **🚫 DROPPED 2026-04-28** — no HTTP endpoints for config (NG13). The `checkLocalOpSecurity` gate is for /api/local-op routes; config doesn't need it. | T | DIRECTED | No | Config is per-machine sensitive state; matches `/api/local-op/*` precedent | `evidence/codebase-integration-points.md` §6 | Stricter than the `/api/workspace` loopback-only gate |
| D18 | New file watcher for `.open-knowledge/config.yml` (workspace + user) | T | DIRECTED | No | Existing watcher is content-only; external-edit detection is new code | `evidence/codebase-integration-points.md` §9 | One new file watcher subscription; debounced 100ms; CC1 'config' on change |
| D19 | Zod walker uses `schema._zod` introspection with explicit per-tag type-guards + JSON-text editor fallback for unknown tags. Zod pinned to exact `4.3.6`. | T | DIRECTED | No | Empirical: `_zod` is published TypeScript-typed introspection surface in Zod v4 (not "internal" in v3 sense). Pin protects against intra-v4 schema-internals changes. | `node_modules/zod/v4/core/schemas.d.cts` line ~1080 + scan of `_zod:` exports | Walker degrades gracefully on schema constructs we don't yet handle |
| D21 | Settings entry points (final set): (i) HelpPopover entry, (ii) Cmd-, shortcut, (iii) CommandPalette entry, (iv) Electron App menu item ("Settings…" in **macOS app menu** between About and first separator; **File menu** on Windows/Linux). Skip dedicated icon. | P | LOCKED | No (UX additive) | Cmd-, = muscle-memory for known destination; omnisearch = discovery for unknown destination — every surveyed unified-Cmd-K app (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps both. Apple HIG places Settings in the app menu specifically (not Help). HelpPopover covers casual user discovery + web users (no menu bar). CommandPalette entry is forward-compatible (becomes a "Commands" source under future omnisearch). **Diverges from Tim's #318 Help-submenu placement for Install** — different items, different conventions: Install is a custom action (Help is reasonable); Settings is HIG-blessed for the app-name menu. | `evidence/electron-cmdk-omnisearch-3p.md` + Apple HIG + `evidence/tim-precedents-from-main.md` Pattern 4 | All four implementation surfaces wired in v0; integration patterns mirror `InstallInClaudeDesktopDialog` per #318 |
| D22 | Settings UI surfaces Install in Claude Desktop as a row in an "Integrations" section, fulfilling Tim's D13 (`specs/2026-04-24-skill-dual-track-install/SPEC.md:185`) original destination intent. Existing #318 entry points (Help submenu, HelpPopover, CommandPalette) stay as secondary discoverability — no removal. | P | DIRECTED | No | Tim's D13 explicitly placed Install at "Settings panel row (primary)"; Help/CommandPalette were interim because the Settings panel didn't exist. When ours ships, the destination intent fulfills naturally. Reuses existing `<InstallInClaudeDesktopDialog>` component — zero new dialog surface. | Tim's spec D13 + `evidence/tim-precedents-from-main.md` Pattern 4 | Adds FR-25; one row in Integrations section; same hash-trigger pattern |
| D20 | Apply VS Code's settings-vs-state topology to OK. User-tunable preferences move to config.yml under a new `appearance` section: `appearance.theme: 'light' \| 'dark' \| 'system'` and `appearance.editorModeDefault: 'wysiwyg' \| 'source'` — both optional with sensible defaults. **Section name `appearance` (not `userPrefs`) chosen 2026-04-28** because per D25 these fields can be written at any scope (user / workspace / local); naming them `userPrefs` would have implied user-only scope. Per-tab transient UI state (pin, graph panel state) stays in localStorage and NEVER appears in Settings UI. FOUC scripts in `index.html` read localStorage as a first-paint cache; config.yml is authoritative. localStorage `ok-theme-v1` and `ok-editor-mode-v1` keys become derived caches; silent migration on next theme/mode toggle. | T | LOCKED | Yes (schema addition is additive but the section-name precedent is set once) | Matches VS Code's well-thought-through split. Multi-window theme sync becomes free via CC1. Theme toggle latency goes from ~1ms (localStorage) to ~50-100ms (HTTP roundtrip + Zod validate + atomic write) — acceptable for an occasional UX action. See `reports/config-edit-paths/REPORT.md` D5. | Resolves Q4. `appearance.*` fields' `defaultScope` per D25: `'user'` (theme + editor-mode are user-pref by default; team can still override at workspace; user can override on a single machine via `.local.yml`). Settings UI exposes only config.yml (no separate "Preferences" tab) |
| D23 | Config-edit handlers (HTTP `/api/config/patch`, MCP `set_config`) are EXEMPT from `extractAgentIdentity` — same rationale as `handleSeedPlan` / `handleSeedApply` / sync / local-op handlers: they operate on the local user's machine settings, not agent content. `handleConfigPatch` joins the `EXEMPT_HANDLERS` set in `attribution-sweep-coverage.test.ts`. | T | LOCKED | No (test-asserted) | Direct in-repo precedent set by Tim's #319 (`e1f3adcf`, merged 2026-04-27) — `attribution-sweep-coverage.test.ts:82-86` exempts seed handlers with the same rationale. Resolves Q2. | In-repo: `packages/app/tests/integration/attribution-sweep-coverage.test.ts:82-86` | FR-12 dropped `extractAgentIdentity`; sweep-test allowlist appended on implementation |
| ~~D24~~ | ~~Settings Modal long-form layout adopts SeedDialog's scrollable-region pattern~~ **🚫 N/A 2026-04-28 → settings render in editor pane, not Dialog (D7 superseded).** The pane uses the existing editor-area scroll behavior — no Dialog scrollable-region pattern needed. The substantive concern (8 schema sections + `folders[]` array overflowing on small windows) is satisfied by the editor-area's normal scroll handling. | P | DIRECTED | No (UX) | Shadcn `<Dialog>` was rewritten in #340 (`698f104b`) from `grid` to `flex flex-col` + `overflow-hidden` + `max-h-[calc(100dvh-2rem)]`; SeedDialog (`packages/app/src/components/SeedDialog.tsx:182-190`) is the canonical post-#340 long-form pattern. | `packages/app/src/components/SeedDialog.tsx:182-190` + `packages/app/src/components/ui/dialog.tsx:55` (post-#340) | Modal renderer (FR-1) inherits the layout invariant; do NOT blanket-override `flex flex-col` |
| D25 | Agent-facing MCP tools (`set_config`, `get_config`) expose **no scope concept**. Server picks the write target via per-field `defaultScope` Zod metadata + `inspectConfig` inference. Algorithm (2-tier ladder per D27 deferral): `inspectConfig(path).workspace ?? inspectConfig(path).user ?? schema.meta.defaultScope ?? 'user'` — most-specific-already-set scope wins (workspace → user-global), with the field's `defaultScope` as fallback when unset everywhere (final fallback `'user'` if no `defaultScope` declared). Per-field `defaultScope` (verified by 4 subagent /explore evaluations 2026-04-28): **workspace** — `folders[]`, `content.*`, `preview.baseUrl`; **user** — `github.oauthAppClientId`, `server.host`, `server.openOnAgentEdit`, `mcp.autoStart`, `mcp.tools.*`, `appearance.*`. **Modal scope tabs and HTTP endpoint still accept explicit `scope`** — those are user-driven gestures with deliberate scope choice. Only the agent-facing MCP tools drop `scope`. | T | LOCKED | Yes (1-way: dropping `scope` from agent surface; adding it later as optional override is additive non-breaking; retracting an exposed `scope` is breaking) | Algorithm precedent: VS Code `Configuration.update()` Layer-B `deriveConfigurationTargets` ([microsoft/vscode `configurationService.ts:1087-1115`](https://github.com/microsoft/vscode)) — write-back-to-current-scope with USER fallback. ~50 LoC server-side: `inspectConfig` (~20 — 2-tier) + per-field `defaultScope` metadata (~25) + algorithm (~5). `inspectConfig` is internal-only — never exposed via MCP/HTTP. Per-field `defaultScope` doubles as schema documentation ("this field's natural home"). | `evidence/electron-cmdk-omnisearch-3p.md` + 2026-04-27 /explore VS Code source + `evidence/eval-group-{A,B,C,D}-*.md` (per-field /explore tracing 2026-04-28) | Agent surface stays minimal (no scope concept anywhere in agent contract — category-aligned with `read_document`/`write_document`/etc.); Modal renderer + chrome inline toggles call `applyConfigPatch` without scope and inherit the inference; FR-6 + FR-6c reflect this. When `.local.yml` ships in Future Work, `defaultScope` gains a `'local'` value for any newly-added per-machine fields — purely additive change. |
| D27 | ~~Ship `.local.yml` as a fourth scope tier in v0~~ **REVISED 2026-04-28 → DEFERRED to Future Work** (resolves Q10 in the negative). Per the 4-subagent /explore audit + per-field schema-grounded analysis, after dropping `sync.*` and `persistence.*` (FR-9c) and removing `server.port` from config (env+CLI handles it), no remaining schema field has a natural home that requires `local` scope. The 2-tier ladder (user-global + workspace) cleanly homes every retained field per the D25 `defaultScope` mapping. Adding `.local.yml` later when a real per-machine schema field needs it is **purely additive**: extend loader chain (~10 LoC), add Modal third tab, declare `defaultScope: 'local'` on the new field. No precedent shifts. | T | DEFERRED (Future Work) | No (additive when added later) | The original LOCK rationale (Cluster B per-machine fields need a home) collapses once `sync.{push,pull}IntervalSeconds` are dropped (engine opinionated) and `server.port` is dropped (env+CLI). `server.host` defaultScope: `user` works in 2-tier; `preview.baseUrl` defaultScope: `workspace` works in 2-tier; `mcp.autoStart` defaultScope: `user` works in 2-tier. Verified by `evidence/eval-group-{A,B,C,D}-*.md` 2026-04-28. | 2026-04-28 verified /explore traces of multi-project port coordination + preview URL semantics + mcp.autoStart consumer | Modal has 2 scope tabs (User, Workspace) in v0; loader has 4 sources (defaults → user → workspace → ENV → CLI). When a future field needs `'local'` scope, this entire decision flips back additively. |
| D26 | Agent-settable allowlist (resolves Q12). Five paths in `ConfigSchema` are tagged `.meta({ agentSettable: true })` and accepted by `set_config`: `folders[]`, `content.include`, `content.exclude`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`. All other paths are rejected with `errors[].code: 'not-agent-settable'`. Modal still shows everything; humans edit anything via UI / file / CLI / HTTP / `applyConfigPatch` direct call. Rationale: agents have direct domain knowledge for content-org (folders, include/exclude) + agent self-tuning (their own MCP tool params); identity / network / UX-preference / system-tuning fields are user-only and agent-driven mistakes there have higher blast radius. Read side (`get_config`) is unrestricted — agents can inspect any field. | T | LOCKED | Yes (1-way: widening the allowlist is additive non-breaking; retracting breaks agents that adopted the wider surface) | Schema-grounded analysis 2026-04-27 (no `embedding.openai.endpoint` field; only 3 fields with real attack surface — `github.oauthAppClientId`, `preview.baseUrl`, `server.host` — all gated out by allowlist). The 2 user-pref fields in the allowlist (`mcp.tools.*`) match agent-self-tuning use cases; their `defaultScope` is `'user'` per D25 so they don't accidentally land in workspace. | Schema in `packages/cli/src/config/schema.ts` + Q12 backing analysis | `set_config` walker traverses patch paths, checks `.meta({agentSettable})` on each leaf; rejects on first non-allowed; ~20 LoC. `inputSchema` registered with MCP narrows to only allowlisted paths so agents discover the bounded surface, not the full schema. |
| D29 | **Schema cleanup — drop 10 fields, add 2.** Remove from `ConfigSchema`: `sync.*` (all 7 fields — engine opinionated about full sync lifecycle: 30/60s intervals + jitter + backoff; auto-commit/push/pull always on; commit messages engine-generated), `persistence.{debounceMs, maxDebounceMs}` (engine opinionated about CRDT-disk debounce: 2000/10000ms), `server.port` (per-machine only; env+CLI are the natural override path; no clean 2-tier home). Add: `appearance.{theme, editorModeDefault}` per D20. Net: 7 sections, ~12 leaf fields. Per P31 (no half-implemented features) + P32 (opinionated for the 90% case). **Ships paired with `ok config migrate` codemod (D37)** so users with stale fields get a one-shot cleanup instead of dead text accumulating on disk. Each dropped field can be added back later as a purely additive change when evidence justifies. | T | LOCKED | Yes (1-way: removing fields is breaking for users who set them; D37 codemod + D34 loose-mode passthrough means the breakage surfaces as cleanup, not failure) | 2026-04-28 4-subagent /explore audit + framework application; verified each removal is correct via `evidence/eval-group-{A,B,C,D}-*.md`; verified `sync.*` half-wired pattern + `persistence.*` rare-tune profile + `server.port` 2-tier-incompat. Greenfield principle (P31) + opinionated simplicity (P32). The codemod ships in the same release as the schema cleanup — same-day-codemod discipline, ESLint v9's 20-month migration vs Turborepo 2.0's same-day-codemod is the canonical lesson. | `evidence/config-architecture-framework.md` + 4 eval files | Schema source `packages/cli/src/config/schema.ts` shrinks; `init.ts:61` template loses the `port: 3000` line; `ok start` boot path no longer threads `config.persistence.debounceMs/maxDebounceMs` (engine has hardcoded constants); `SyncEngine` constructor remains parameterized but boot path passes nothing (defaults always hit). With D34 loose-mode, existing user configs with stale fields still load; with D37 codemod, users get explicit cleanup. Future Work entries flag each as additive re-introduction when justified. |

| ~~D30~~ | **🚫 DROPPED 2026-04-28** — the all-routes envelope refactor (~50 routes × ~5 LoC = one focused day) was the single largest implementation cost in the original spec. With NG13 (no HTTP for config), there's no new HTTP route forcing the alignment. Existing routes' `{ok, error: string}` shape is left as-is for this spec; cleaning them up is a separate concern. *Original: Single canonical `ApiError` envelope across all OK routes (resolves Q1).* One Zod discriminated union keyed on `code` literal defines every error variant. Existing route handlers using `{ok, error: string}` (~50 routes) and seed handlers using `{ok: false, error: {kind, message}}` (2 routes) refactor to the new envelope as part of v0 implementation. Forward-compat tail variant included so unknown future codes don't crash old clients. Per-consumer rendering (HTTP body + status code, MCP `isError + structuredContent + content[].text`, CLI `prettifyError`) is mechanical and isolated to four files. See §9.7 for the full schema and renderers. | T | LOCKED | Yes (1-way: aligning all routes is a one-shot refactor; reverting to multiple shapes re-introduces drift) | Three coexisting error shapes today is debt — every new error code requires N updates across N adapters, every consumer hand-writes its own translation. With one envelope, each rendering is a pure function of the envelope plus the consumer. Stripe's typed-error-class hierarchy proves the pattern; RFC 9457 Problem Details proves it's worth standardizing the wire shape (we adopt the discriminated-union variant, lighter than full RFC 9457 since OK is local-only). The `code` field is the contract; the path-coercion + `params.domainCode` escape hatch handles Zod's symbol-path and custom-check edge cases. | `concerns/errors.md` §"Single envelope, multiple wire renderings" + production survey of 8 SDKs showing zero convergence at the wire (the cost we avoid by aligning now) | ~50 routes × ~5 LoC = one day of refactor for a clean precedent. New consumers (future SDK, future CLI tools) get exhaustive matching for free. The catch-all tail variant is the open-enum discipline applied to error unions. |
| ~~D31~~ | **🚫 DROPPED 2026-04-28** — no HTTP wire format for config patches (NG13). The `DeepPartial<Config>` shape passed to `ConfigBinding.patch()` and `writeConfigPatch()` carries the same null-as-clear semantics in TypeScript; the `Content-Type: application/merge-patch+json` header is unused. The cross-scope `folders[]` merge in the loader stays (Q11 RESOLVED, retained). *Original: PATCH dialect: RFC 7396 JSON Merge Patch with `folders[]` exception.* `applyConfigPatch` implements RFC 7396 semantics: top-level keys present override; absent unchanged; `null` deletes; nested objects recursively merged the same way; arrays REPLACED. HTTP endpoint signals via `Content-Type: application/merge-patch+json`. Within a single scope, `folders[]` still replaces wholesale; the cross-scope merge (D25 inference, Q11 resolution) concatenates and dedupes by `match`. See §9.6.1. | T | LOCKED | Yes (1-way: changing PATCH semantics post-launch is breaking for every consumer that relies on the dialect) | The default in TypeScript backends — "spread the partial body into the existing record" — replaces nested objects rather than merging recursively, dropping consumer data silently. RFC 7396 is the IETF-standardized recursive-merge dialect with null-as-delete; it's what consumers actually expect, and the same shape ships in production at GitHub, Stripe (most endpoints), Linear, Shopify. Arrays-replace is RFC 7396's atomic-array rule; element-wise merge requires an identity model that doesn't exist for `content.include[]` etc. The `folders[]` carve-out is well-defined because `match` IS the rule identity. | RFC 7396; `seed/apply.ts:88-104` proves the yaml@2 round-trip pattern works in production | `Content-Type` makes the dialect introspectable. Documentation is unambiguous about array behavior; no surprise deletions of nested keys. The yaml@2 Document layer preserves comments + blank lines + anchors through the round-trip. |
| ~~D32~~ | **🚫 SHRINKS 2026-04-28 → D45 single-validator-at-three-layers.** With no HTTP boundary to gate, the patch-payload validation collapses (the patch IS in-process code; type system enforces shape). Only the merged-document `safeParse` survives, called at three entry points: client walker (L1), headless writer (L2), persistence hook (L3). Same end semantics; cleaner mechanism. *Original: Two-validator pattern: patch payload + merged document.* Every `applyConfigPatch` call runs two distinct Zod validation passes. Pass 1 validates the patch payload (deep-partial input shape, allowlist gating for MCP). Pass 2 validates the merged document against the full `ConfigSchema` with all refinements. Both pass server-side; either failure returns `VALIDATION_FAILED` envelope with no write. See §9.6.2. | T | LOCKED | No (test-asserted invariant) | Schema libraries validate what the consumer sent, not what the resulting document is. Two failure classes are uncatchable by patch-only validation: required-field clear via null (`{mcp: {autoStart: null}}` validates against the patch but breaks the merged doc) and cross-field invariants (refinements that depend on multiple fields' final values). Kubernetes admission webhooks formalize this as mutating-then-validating sequencing. In TS, application code assembles the two passes from `(merge logic) + (full schema parse)` because Zod doesn't ship merge-then-validate as a primitive. | Kubernetes admission webhook precedent; `concerns/mutation-shape.md` §"Two-validator pattern" | `applyConfigPatch` implementation is two `safeParse` calls bracketing the yaml@2 merge. Test asserts the null-as-clear case is rejected with a clear path-anchored error. |
| ~~D33~~ | **🚫 DROPPED 2026-04-28 → D46 LWW.** ETag/If-Match was an HTTP-layer mechanism; no HTTP, no headers. CRDT semantics on Y.Text handle intra-process concurrency (UI consumers); LWW handles cross-process (vanishingly rare per D46). MCP `expectedVersion` parameter dropped from `set_config` — agents that need read-modify-write safety can re-`get_config` after their write to verify. *Original: Concurrency control: ETag/If-Match (HTTP), `expectedVersion` (MCP).* `GET /api/config` returns `ETag` header; `POST /api/config/patch` requires `If-Match`; mismatch → 412 Precondition Failed with `CONFLICT` envelope variant. Missing header → 428 Precondition Required. MCP `set_config` accepts optional `expectedVersion: string` — if supplied and mismatched, `isError: true` + `CONFLICT` envelope + LLM-retry text in `content[]`. If omitted, write proceeds without concurrency check. See §9.6.3. | T | LOCKED | No (additive — existing routes adopt incrementally) | Atomic tmp+rename writes prevent file corruption (one writer wins the rename) but do NOT prevent lost updates. Concrete failure: agent reads config, decides to set `mcp.tools.search.maxResults: 100`, writes; meanwhile user toggles same field to `25` via Modal; both writes succeed; second silently overwrites first. RFC 7232 ETag/If-Match is the standard primitive. For MCP, the protocol has no headers, so the equivalent threads through input schema. Optionality on MCP matters: one-shot edits omit it (last-writer-wins acceptable); careful read-modify-write agents pass it through (safety). LLM-retry framing on 409 ensures agents retry rather than abandon. | RFC 7232 (ETag/If-Match); RFC 6585 (428 Precondition Required); MCP filesystem server's `edit_file` (no idempotency primitive — caller's responsibility) vs `write_file` (PUT-of-whole-state) precedent | Modal handles 412 transparently: refetch `GET /api/config`, re-apply pending field change, retry POST. Auto-save model means only one field is ever in flight; the dirty-state survives the refetch. Agents trade safety for terseness; the choice is theirs. |
| D34 | **`z.looseObject` for the on-disk config schema.** `ConfigSchema` and all nested object schemas use `z.looseObject({...})` (Zod v4 idiom; equivalent to `z.object({...}).catchall(z.unknown())`). Strict mode is opt-in per sub-object only when typos are more likely than forward-compat fields. See §9.8.3. | T | LOCKED | Yes (1-way: tightening to strict later breaks every config file with stale fields) | Human-authored configs accumulate stale fields across upgrades. With strict, validation rejects the file outright. With strip (Zod default), the field passes validation but is silently dropped, and the next `applyConfigPatch` write may even erase it from disk. With **loose**, the field passes validation, sits on disk untouched (yaml@2 round-trip preserves unknown keys), and the engine ignores it. This is the foundational forgiveness pattern — Biome's lesson from its v2 migration and the dominant default across mature config-driven tools. Critical interaction: D34 (loose passthrough) is the safety net so users mid-upgrade aren't broken; D37 (codemod) is the proactive cleanup. Both layers needed. | `classes/human-authored.md` §"Forgiveness vs strictness"; Biome v2 migration retrospective; the `experimental.*` namespace pattern across Next.js + Astro relies on the same loose-object idiom for forward-compat | Without the loose-mode change, D29's schema cleanup would break every existing user config that has `sync.*` set — even if the engine ignores the field at runtime. With it, users mid-upgrade have a smooth path. The codemod (D37) is the explicit cleanup step. |
| D35 | **`applyConfigPatch` returns `Result<T, E>`, not throws.** Type signature: `Promise<{ok: true; applied; effective; etag; scope} \| {ok: false; error: ApiError}>`. Each consumer (HTTP handler, MCP tool, CLI, seed/apply migration) translates this discriminated union to its boundary's envelope at the route layer. Internal modules within `applyConfigPatch`'s implementation may still throw (programmer errors only). See §9.8.1. | T | LOCKED | No | Thrown errors are invisible in TypeScript signatures (no `throws` clause) — every caller must read the implementation to know what to catch, and any caller that misses a case has a runtime bug the compiler can't help with. Discriminated `Result<T, E>` makes failure modes part of the type contract — the compiler forces every caller to address them via the `if (!result.ok)` branch. Stripe's internal-vs-public-surface lesson: their underlying request layer returns Result-style envelopes; the SDK exposes typed error classes for ergonomics. The translation isolation lets us add a fourth consumer (e.g., a future SDK) by writing one translation function, not by re-deriving error handling across the codebase. | `concerns/errors.md` §"Per-class recommendations"; SKILL.md principle #5 (errors as values at library boundaries) | One function, three boundaries, three renderings. Each boundary's translation is ~10 LoC isolated to its handler file. Future surfaces inherit the same pattern. |
| D36 | **Source-located error messages for config validation.** Errors include `file:line:col` plus a snippet of the offending source. Applies to `loadConfig`, `ok config validate`, `applyConfigPatch`, and the Modal's display of validation rejections. Implementation: switch loader from `parseYaml` (string) to `parseDocument` (yaml@2's source-position-preserving parser); on `safeParse` failure, walk issue paths back to source positions via the Document AST. See §9.6.4. | P | DIRECTED | No | Today's loader emits `Invalid configuration:\n  path: message\n...` with no file:line:col — the user has a JSON-pointer path and has to grep for the field. Biome's lint errors include `file:line:col` plus a code snippet with the offending token highlighted; that's the bar for any tool whose primary surface is a user-edited file. The yaml@2 `parseDocument` is already in production for write paths (`seed/apply.ts:88-104`); reusing it for reads is mechanical. | `classes/human-authored.md` §"Error messages with source locations"; Biome lint output as the reference quality bar | One source-position-preserving parser, three consumers benefit (loader, CLI, Modal). Modal maps issue paths to rendered fields; the source-position machinery is reused for the YAML-editing surfaces and the form-rendering surface. |
| D37 | **Ship `ok config migrate` codemod paired with D29 schema cleanup.** Same-day codemod discipline. CLI subcommand `ok config migrate` reads workspace + user config, removes the 10 dropped fields (preserving comments + structure for everything else via yaml@2 Document layer), writes back via `applyConfigPatch`. Idempotent — running twice on a clean file is a no-op. `--dry-run` flag previews changes. `--scope <workspace\|user\|both>` flag scopes the migration. | T | LOCKED | No (additive — running the codemod is opt-in, recommended) | The ESLint v9 retrospective is the decisive evidence: `@eslint/migrate-config` shipped a month after the breaking release, and the migration dragged for 20 months because users had to read release notes and edit by hand. *"Prioritize tooling over documentation"* is ESLint's own lesson. Turborepo 2.0's `pipeline → tasks` rename was smooth because `@turbo/codemod migrate` shipped with v2. With D34 (loose passthrough), users mid-upgrade aren't broken; with D37 (codemod), they get proactive cleanup with one command. Without both, dead text accumulates indefinitely on disk. | ESLint v9 retrospective; Turborepo 2.0 codemod release; `@next/codemod` and `biome migrate` precedents | The codemod uses the same `applyConfigPatch` write primitive — all D5/CC1/two-validator/atomic-write invariants apply automatically. Future codemods (e.g., `--to v0.5`) extend this command rather than spawning new ones. |
| ~~D38~~ (RESHAPED) | **🔁 RESHAPES 2026-04-28** — the HTTP route (`POST /api/config/folders/upsert`) drops with the rest of HTTP-for-config (NG13). The `applyFolderRulesUpsert` server-side helper and the `set_folder_rule` MCP tool **stay** — both call into `writeConfigPatch` instead of the HTTP route. Always-array shape, transactional all-or-nothing semantics, three-layer validation discipline: all preserved.

---

**Decisions D39–D47 — added 2026-04-28 release pivot:**

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D39 | **Admit `<contentDir>/.open-knowledge/config.yml` as a Y.Text-only Hocuspocus doc** with synthetic name `__config__/workspace`. Sibling predicate `isConfigDoc(documentName)` to `isSystemDoc` admits these via `hocuspocus.openDirectConnection()` at boot — same precedent `__system__` uses (`packages/server/src/standalone.ts:1246`). | T | LOCKED | Yes (1-way: doc naming convention becomes public for any future config-doc admission) | `__system__` precedent proves the pattern works for non-content docs; ContentFilter exclusion of `.open-knowledge/` is the existing constraint we sidestep with the same mechanism. | `evidence/_init_worldmodel.md` Track 1 + `packages/server/src/standalone.ts:1246` (precedent) + `packages/server/src/cc1-broadcast.ts:36` (`isSystemDoc` precedent) | ~30 LoC: predicate sibling, boot-time admission, ContentFilter bypass. Y.Text observer in Modal closes the loop. |
| D40 | **Admit `~/.open-knowledge/config.yml` as a synthetic Y.Doc `__user__/config.yml` per server instance.** Each `ok start` instance runs its own file watcher on the user-global path; cross-process fan-out happens via fs (atomic tmp+rename + file watcher). | T | LOCKED | Yes (1-way: synthetic doc name `__user__/config.yml` is a public contract for any client subscribing) | User-global config sits outside any project's `contentDir`; admitting it as a synthetic doc per instance is the simplest topology that preserves browser parity. Multi-window theme sync (the canonical use case) doesn't race — only one write per user gesture; LWW per D46 covers the rare case. | `evidence/_init_worldmodel.md` Track 4 + `evidence/cross-process-write-strategy.md` | One file watcher subscription per server instance for the user-global path; ~50 LoC including atomic-rename detection (already handled by @parcel/watcher per `file-watcher.ts:185-202`). |
| D41 | **Per-doc bridge bypass — markdown observer bridge runs ONLY for `.md`/`.mdx` admitted content docs**, never for system or config docs. Single-line gate at `server-observer-extension.ts:50`: `if (isSystemDoc(name) \|\| isConfigDoc(name)) return`. | T | LOCKED | No | NG2 (reframed) requires this. The bridge is markdown-specific (`@tiptap/y-tiptap`'s `yXmlFragmentToProseMirrorRootNode`); engaging it on non-markdown produces undefined behavior. The gate is mechanical. | `evidence/_init_worldmodel.md` Track 2 + `packages/server/src/server-observers.ts:1-100` | ~1 line of source change; cross-cutting precedent for any future non-markdown doc admission. |
| D42 | **Persistence-time validation hook for config docs** (D45 Layer 3). `onStoreDocument` config-doc branch parses Y.Text → YAML → `ConfigSchema.safeParse`. On failure: do NOT write disk; revert Y.Text via server-origin transaction using in-memory LKG cache; emit CC1 `'config-validation-rejected'`. | T | LOCKED | No (test-asserted invariant) | Hocuspocus has no atomic Y.Doc rollback on hook rejection (upstream-confirmed per worldmodel Track 3). Manual revert via server-origin transaction is the documented workaround. The LKG cache is in-memory per server instance, rebuilt on doc load, ~20 LoC. | `evidence/_init_worldmodel.md` Track 3 + `evidence/server-side-validation-pattern.md` | ~40 LoC in `persistence.ts` config-doc branch + LKG cache + CC1 broadcast wiring. Catches dev-tools mutations, schema drift, hand-edits breaking YAML. |
| D43 | **Scope-as-constraint Zod metadata via custom `fieldRegistry`** (not `z.globalRegistry`). Each schema field declares `scope: 'user' \| 'workspace' \| 'either'` + `agentSettable: boolean` + `defaultScope?: 'user' \| 'workspace'` via `.register(fieldRegistry, {...})` BEFORE any wrappers (`.default()`, `.optional()`). Walker enforces in Modal; loader rejects illegal placements with source-located error. | T | LOCKED | Yes (1-way: metadata API is a public schema contract; widening fields is fine, retracting breaks) | Custom registry keeps SchemaStore export clean (custom keys stay out of `z.toJSONSchema` global path); `.register()` returns same instance (`.meta()` clones — wraps lose the metadata). The `fieldRegistry` + walker pattern is ~30 LoC + per-field annotations. | `reports/zod-v4-catalogs-registries/REPORT.md` Dimensions 1, 2, 4 (empirical Zod 4.3.6 verification) | Supersedes D25's "metadata as inference hint" framing. The walker (`getFieldMeta`) descends `_zod.def.innerType` to find leaf metadata regardless of wrappers. |
| D44 | **`ConfigSchema` migrates from `@inkeep/open-knowledge-server` to `@inkeep/open-knowledge-core`.** Browser-compatible (no Node deps). All ~17 importers in `packages/cli` and `packages/server` switch import paths. Re-export bridge keeps existing imports working through the transition. | T | DIRECTED | No | Schema must be reachable from the client bundle (`packages/app`) for the Modal walker to import it. `packages/cli/src/config/schema.ts` is pure Zod with no Node deps — mechanical move. | `evidence/_init_worldmodel.md` Track 5 (browser-compat audit + import-graph analysis) | ~50 LoC of imports + a re-export bridge. Implementation precedent: how OK already structures shared types in `@inkeep/open-knowledge-core`. |
| D45 | **Three-layer defense-in-depth validation.** L1 — Modal walker validates per-field commits before Y.Text writes (D10 Layer 1). L2 — `writeConfigPatch()` validates merged config before fs writes (MCP/CLI/seed). L3 — Hocuspocus `onStoreDocument` config-doc branch validates Y.Text → YAML → `ConfigSchema.safeParse` before disk; on rejection, reverts Y.Text via server-origin transaction using in-memory LKG cache + emits CC1 `'config-validation-rejected'`. All three layers share `ConfigSchema` from `@inkeep/open-knowledge-core` and `ConfigValidationError` discriminated union. | T | LOCKED | Yes (1-way: changing the validation contract post-launch breaks every consumer; widening error codes is additive) | Layer 1 covers normal-flow correctness; Layer 2 covers headless writers; Layer 3 catches malicious/buggy clients, schema drift, hand-edits. Same Zod safeParse run at three entry points; mechanism is uniform. Persistence-hook revert-to-LKG handles Hocuspocus's lack of atomic rollback (D42). | `evidence/server-side-validation-pattern.md` | ~75-90 LoC server-side total (D42 hook + LKG cache + CC1 wiring + `writeConfigPatch` + `ConfigValidationError` envelope). Supersedes D32's HTTP-boundary two-validator framing. |
| D46 | **Last-write-wins for cross-process user-global config writes.** Atomic tmp+rename without per-machine advisory lock. Multi-`ok start` instances on the same machine that simultaneously edit `~/.open-knowledge/config.yml` may lose one write under a 2-second race window; file watcher converges all instances to the final disk state within ~100ms. Persistence-time validation (D45 L3) ensures lost-updates produce stale-but-valid YAML, never broken state. | T | LOCKED | No (additive — adding a lock later is a Future Work change) | Lost-update window is ~2s and requires the same human in the same field in two `ok start` instances within window — vanishingly rare. Multi-window theme sync (canonical user-global use case) doesn't race; only one write happens, the other window reads via file watcher. CRDT handles intra-process; LWW handles cross-process. | `evidence/cross-process-write-strategy.md` + `evidence/_init_worldmodel.md` Track 4 | Replaces dropped D33 (ETag/If-Match). NG14 captures the lock as Future Work. |
| D47 | **Custom `fieldRegistry` + `getFieldMeta` walker pattern is the canonical scope-metadata mechanism.** Every leaf field in `ConfigSchema` MUST `.register(fieldRegistry, {scope, agentSettable, defaultScope?})` BEFORE any wrappers. The walker descends `_zod.def.innerType` to find leaf metadata; the Modal walker enforces scope-as-constraint; the loader rejects illegal scope placements; the MCP `set_config` tool uses `agentSettable` to gate the write allowlist. | T | LOCKED | Yes (1-way: declaration order `.register() → wrappers` is canonical; flipping it breaks the walker) | Zod v4 `.meta()` does NOT propagate through `.default()` / `.optional()` / `.nullable()` wrappers (verified empirically in [`reports/zod-v4-catalogs-registries/REPORT.md`](../../reports/zod-v4-catalogs-registries/REPORT.md)). Custom registry + walker is the mechanical fix. Same JSON Schema export still works via `z.toJSONSchema(schema, {metadata: fieldRegistry})`. | `reports/zod-v4-catalogs-registries/REPORT.md` (full report) | Subsumes D19 (Zod walker uses `_zod` introspection — confirms approach). Subsumes D25's `defaultScope` framing — `defaultScope` is now one field of the metadata, not the only field. Subsumes D26's `agentSettable` framing — same registry, same walker. |
| D48 | **Modal binds via separate `HocuspocusProvider` per config doc** (NOT the editor's pooled provider). Mirrors `SystemDocSubscriber.tsx:46-48` precedent. Pool path requires gating `setupObservers` to avoid markdown-bridge engagement on Y.Text-only docs; separate-provider sidesteps that risk. Cost: +2 WS connections per session (workspace + user-global). | T | LOCKED | No | `evidence/cluster-a-foundational-investigations.md` NQ1 — pool's `setupObservers` would corrupt YAML through the markdown bridge unless gated; separate provider has no such risk and matches existing system-doc precedent. | `evidence/cluster-a-foundational-investigations.md` + `packages/app/src/components/SystemDocSubscriber.tsx:46-48` | Settings pane component creates and tears down its providers on mount/unmount; lifecycle bound to pane visibility. |
| D49 | **No additional auth gating for config docs over the collab WS.** Existing `principalAuthExtension` (`standalone.ts:366-453`) is documentName-agnostic; `expectedServerInstanceId` / `expectedBranch` cross-checks fire identically and correctly for config docs. Add `isConfigDoc()` short-circuits in `agent-sessions.ts` (mirroring the existing `isSystemDoc` short-circuits). WS layer has no per-doc admission gate; `checkLocalOpSecurity` is HTTP-only and not relevant for config (NG13). | T | LOCKED | No | `evidence/cluster-a-foundational-investigations.md` NQ2. | Same evidence file. | One predicate sibling + boot-time admission via `hocuspocus.openDirectConnection` (D39, D40). |
| D50 | **`ConfigSchema` migration to `@inkeep/open-knowledge-core` ships as a gradual two-PR move with a re-export bridge in `cli/`.** PR 1: copy schema source to core; export from core's index; add re-export shim at `packages/cli/src/config/schema.ts` (`export * from '@inkeep/open-knowledge-core/config-schema'`). PR 2: update the 17 importers to use the core path; remove the shim. Of the 17 importers, only 1 (`loader.ts`) is runtime; the rest are `import type` (type-erased), so PR 1 is risk-free. | T | DIRECTED | No | Big-bang move + simultaneous import update is feasible but risks merge conflicts with in-flight branches that touch any of the 17 importers. Gradual move with re-export bridge keeps every existing branch working through the transition. | `evidence/cluster-a-foundational-investigations.md` NQ4 | PR 1 ~50 LoC; PR 2 ~50 LoC × 17 sites = ~150 LoC of import-path updates. |
| D51 | **First-write of `~/.open-knowledge/config.yml` is lazy via `writeConfigPatch`** (NOT eager via `ok init`). When a user-scope-targeted patch is applied and the file doesn't exist, `writeConfigPatch` creates parent dir + writes file with magic comment header (FR-17) + the patch applied to schema defaults. Atomic tmp+rename via `tracedRename`/`tracedWriteFile`. **Mode: 0o644** (NOT 0o600 / 0o700 from token-store) — config is not secret; use the persistence-layer pattern from `persistence.ts:881-884`. Loader handles missing user-config gracefully (no error). | T | DIRECTED | No | `evidence/cluster-a-foundational-investigations.md` NQ8. Eager `ok init` write of user-global would couple workspace init to user-global state, which is wrong directionally — user-global outlives any single project. | Same evidence file + `packages/server/src/persistence.ts:881-884` for atomic-write pattern + `packages/cli/src/auth/token-store.ts:80-134` for the rejected secret-mode pattern. | `writeConfigPatch` checks for parent-dir existence; `mkdir -p` if missing. Magic comment is the FR-17 version-pinned `# yaml-language-server: $schema=...` line. |
| D52 | **File-watcher extension uses chokidar with `awaitWriteFinish: { stabilityThreshold: 100 }`** for both `<contentDir>/.open-knowledge/config.yml` and `~/.open-knowledge/config.yml`. Existing `@parcel/watcher` is directory-recursive and not suited to single-file watches. Two boot.ts callsites (workspace at server startup; user-global at server startup if the dir exists). Single new public API: `startConfigFileWatcher(absPath: string, onChange: (content: string) => void): () => void`. | T | DIRECTED | No | `evidence/cluster-a-foundational-investigations.md` NQ11. Chokidar's `awaitWriteFinish` debounces atomic-rename writes (write-tmp → rename) into a single change event; `@parcel/watcher` would fire two events (unlink + add). | Same evidence file. | New chokidar dependency; ~30 LoC subscription module + 2 callsites; cleanup on server shutdown. |
| D53 | **OTel span set for config edits.** Six new spans: `config.bind` (every `bindConfigDoc`), `config.patch` (every `ConfigBinding.patch` and `writeConfigPatch`), `config.validate` (each Zod safeParse pass — L1, L2, L3), `config.persist` (the persistence-hook write), `config.revert` (the L3 revert-to-LKG transaction). All disk writes route through existing `tracedWriteFile`/`tracedRename` (which already emit `fs.*` spans). **Bounded enum attributes only** on spans: `config.scope` (`'user'\|'workspace'`), `config.validation.layer` (`'L1'\|'L2'\|'L3'`), `config.outcome` (`'success'\|'rejected'\|'reverted'`), `config.transport` (`'ytext'\|'fs'`). Zod issue paths go in span **events** (not attributes — cardinality risk) per the existing `concerns/observability.md` discipline. | T | DIRECTED | No | `evidence/cluster-a-foundational-investigations.md` NQ18 + `packages/server/src/telemetry.ts` + `packages/server/src/fs-traced.ts`. | Same evidence file + telemetry source. | Mechanical instrumentation; ~80 LoC across the new modules. |
| D54 | **Settings render as a pane in the main editor area, NOT a Dialog overlay.** The schema-driven form replaces the document view in the main editor pane when the user invokes an entry point (Cmd-, App menu, HelpPopover, CommandPalette). The pane internally has User and Workspace sub-tabs (VS Code precedent — both tabs show their respective values via `inspectConfig`, with FR-3b "modified at this scope" indicator on `'either'` fields). Same Hocuspocus binding (D48) — only the rendering surface changes from `<Dialog>` to a pane component. Closing returns to the prior document or the doc list. **Cascade**: D7 superseded; D24 N/A; D21 entry points trigger pane navigation (not dialog open); D22 Install row renders in the pane's "Integrations" section; D16 (hidden in Navigator) — pane just doesn't render in Navigator window since there's no editor area there; FR-1, FR-2, FR-23 reframed in Step 5. | P | LOCKED | Yes (1-way: rendering shape becomes a public UX contract; users build mental model around it) | User direction 2026-04-28: "rather than a modal I think the config form should appear in the main editor pane." This is more coherent with the rest of the pivot — config IS a Y.Doc; the editor area already has multiple render paths (markdown WYSIWYG, source mode); adding a "config form" path is the same pattern. Avoids modal-overlay UX which fights the auto-save model (no obvious "done" moment). | User session 2026-04-28; VS Code precedent for User/Workspace sub-tabs and "modified at this scope" indicator | Pane component lives in `packages/app/src/components/SettingsPane.tsx` (NEW). Editor-area routing decides between `<TiptapEditor>` and `<SettingsPane>` based on a UI-state mode. Entry-point handlers set the mode rather than opening a dialog. Long-form scroll behavior inherits from editor area — no special scrollable-region pattern needed. |
| D55 | **Theme + editor-mode-default localStorage → `appearance.*` is dual-track, no proactive migration.** localStorage keys (`ok-theme-v1`, `ok-editor-mode-v1`) stay as the FOUC cache. `config.yml` becomes authoritative once `appearance.theme` (or `appearance.editorModeDefault`) is set. Until then, the existing chrome theme toggle continues writing localStorage. The first explicit Settings-pane write of `appearance.*` canonicalizes the value into config.yml; from that point forward, all writes flow through `userBinding.patch()` and localStorage updates as a derived cache. The chrome toggle should be updated to call `userBinding.patch()` so all writes go through one path; until that update lands, dual-track means a brief window where toggle and Settings can diverge — accepted trade-off. **Schema implication**: `appearance.theme` and `appearance.editorModeDefault` default to UNSET (not `'system'` / `'wysiwyg'`). | P | LOCKED | No (additive) | User direction 2026-04-28: "No migration, dual-track." Avoids the active-migration UX risk where users see their theme change unexpectedly on first boot post-upgrade. The dual-track period ends naturally as users explicitly visit Settings or as the chrome toggle is updated to write through. | User session 2026-04-28 | No migration code path. Chrome FOUC scripts unchanged. Loader fills `appearance.theme` → localStorage as a side effect when set (so chrome FOUC always has the latest cached value). |
| D57 | **LKG cold-start recovery on invalid `~/.open-knowledge/config.yml`.** When server boot encounters a syntactically-broken or schema-failing user-global config: (a) parse with yaml@2 + safeParse, (b) on failure, attempt `tracedRename` to `~/.open-knowledge/config.yml.invalid-<ISO-timestamp>`, (c) if rename fails (read-only fs, etc.), keep file in place and log warning, (d) initialize Y.Doc with schema-default-serialized YAML + the FR-17 magic-comment header, (e) emit CC1 `'config-validation-rejected'` broadcast on first Modal connect so user sees the recovery notification. LKG cache after recovery = the schema defaults. | T | DIRECTED | No (additive — recovery semantics can evolve) | `evidence/cluster-b-dependent-investigations.md` NQ3. The existing loader silently swallows parse-fail for some paths; the pivot extends that contract to schema-fail too. The sideline-the-broken-file pattern preserves the user's data for forensics. | Same evidence file. | Cold-start path in `boot.ts` calls into core's `readConfigSafely` helper (NEW, ~30 LoC) which encapsulates the recover + sideline + warn flow. |
| D58 | **`CONFIG_VALIDATION_REVERT_ORIGIN` — frozen-object origin marker for the L3 revert transaction.** Shape: `Object.freeze({ context: { origin: 'config-validation-revert' }, skipStoreHooks: true })`. The persistence hook's L3 entry-gate checks `if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return;` — belt-and-suspenders alongside `skipStoreHooks: true`. NOT a paired-write origin (bridge is bypassed for config docs per D41); no `paired: true` flag. | T | LOCKED | Yes (1-way: origin identity becomes part of the contract; changing the literal would re-fire validation on revert) | `evidence/cluster-b-dependent-investigations.md` NQ6. Direct copy of `OBSERVER_SYNC_ORIGIN` precedent (`packages/server/src/server-observers.ts:67-75`); per-session origin precedent #24 uses the same `Object.freeze` discipline. | `packages/server/src/server-observers.ts:67-75` + `packages/server/src/agent-sessions.ts:160-200` | Single export from a config-edit module; ~5 LoC declaration + ~3 LoC entry-gate. |
| D59 | **No client-side persistence (y-indexeddb) for config docs.** `bindConfigDoc` does NOT call `createClientPersistence`. Mirrors the `__system__` doc precedent (no IDB cache). Reasoning: a stale IDB cache would race with fresh disk state on reconnect (e.g., user-global theme set on machine A → machine B's IDB still has the old value → Yjs merge produces unexpected state). Since config docs reload on every connect (~100-300ms loader cost on cold Settings-pane mount), the staleness window is eliminated by construction. The existing `server-instance-mismatch` handshake still applies (becomes a no-op for config providers since there's no buffered state to clear). | T | LOCKED | No (additive — could add IDB caching later if cold-mount latency becomes a UX issue) | `evidence/cluster-b-dependent-investigations.md` NQ10. The Settings pane is opened ad-hoc; its mount latency is well below the 200ms first-open target (FR non-functional). | Same evidence file + `provider-pool.ts` IDB integration. | `bindConfigDoc(provider, scope)` skips the `IndexeddbPersistence` instantiation that content-doc providers do. |
| D60 | **`fieldRegistry` lives in `@inkeep/open-knowledge-core` as a `globalThis`-keyed singleton via `Symbol.for('@inkeep/open-knowledge/field-registry')`.** Mirrors Zod's `z.globalRegistry` discipline (`globalThis.__zod_globalRegistry`). Bun's `workspace:*` resolution + the Symbol key handle module-duplication edge cases (two copies of `@inkeep/open-knowledge-core` on disk would still share one registry via the Symbol). **STOP rule**: only ONE `fieldRegistry` per process; importers reuse the singleton; never instantiate a sibling registry. | T | LOCKED | Yes (1-way: registry identity is a process-wide singleton; introducing a second one breaks scope-as-constraint enforcement) | `evidence/cluster-b-dependent-investigations.md` NQ13. Symbol-keyed globalThis singleton is the canonical Zod pattern; verified against `node_modules/zod/src/v4/core/registries.ts`. | Same evidence file. | ~10 LoC singleton bootstrap in `@inkeep/open-knowledge-core/field-registry.ts`. STOP rule added to AGENTS.md. |
| D61 | **`scope: 'either'` default-write target for headless writers (MCP, CLI without explicit scope).** Algorithm (D25 ladder, validated to survive D43/D47): `inspectConfig(path).workspace ?? inspectConfig(path).user ?? fieldRegistry.get(field).defaultScope ?? 'user'`. Most-specific-already-set scope wins (workspace > user > field's `defaultScope` metadata > final fallback `'user'`). **For mixed-scope patches** (single `set_config` call attempting to write fields with conflicting scope inferences), REJECT with `error.code: 'MIXED_SCOPE'`; agent retries per-scope. This sidesteps the entire bulk-mutations partial-success machinery. | T | LOCKED | Yes (1-way: write-target inference becomes part of the agent contract; widening is fine, retracting breaks) | `evidence/cluster-b-dependent-investigations.md` NQ14. Direct survival of D25's algorithm under the new D43/D47 metadata API. The `MIXED_SCOPE` error rejection forces clean per-scope retries (consistent with D38's transactional-all-or-nothing for `folders[]`). | Same evidence file + `evidence/eval-group-{A,B,C,D}-*.md` (per-field scope analysis from original D25). | `writeConfigPatch` walks the patch tree, calls `getFieldMeta` per leaf, computes the inferred scope per leaf; if any two leaves disagree, fail before writing. |
| D62 | **MCP `set_folder_rule` is fs-direct (no HTTP, no server requirement).** Uses `applyFolderRulesUpsert` from `@inkeep/open-knowledge-core`; resolves contentDir via `resolveProjectConfigContext(cwd)` (NOT `resolveProjectServerContext` — the latter requires a running server.lock). Mirrors `read_document`'s fs-direct pattern. Tool description explicitly tags `[Operates on disk; no running OK server required]`. Live UIs refresh via the file watcher when a server IS running; when no server is running, no broadcast (write still lands cleanly on disk). | T | LOCKED | No (additive — could add HTTP-routed variant later for hosted scenarios, but NG13 forecloses for v0) | `evidence/cluster-b-dependent-investigations.md` NQ15. Establishes the precedent for any future fs-direct MCP tool: contentDir-via-cwd resolution + atomic-write. | Same evidence file + `packages/cli/src/mcp/tools/read_document.ts` for the fs-direct precedent. | The MCP tool is a thin wrapper around `applyFolderRulesUpsert(cwd, ...)`. ~15 LoC. |
| D63 | **Migrate `seed/apply.ts:85-113` `folders[]` write path to `applyFolderRulesUpsert`.** Replace the per-configPath append-loop + `parseDocument` + mutate + `writeFileSync` block with a single `applyFolderRulesUpsert({cwd, scope: 'workspace', rules: [{match, frontmatter}, ...]})` call. Atomic tmp+rename replaces the existing `writeFileSync`; validation strictness improvement (the existing path bypasses Zod for the seed write — a feature, not a regression). Existing seed unit tests need minor error-shape updates from `string` to `ConfigValidationError`. | T | LOCKED | No (in-scope refactor of existing code) | `evidence/cluster-b-dependent-investigations.md` NQ17. Closes the D5 invariant gap that originally motivated FR-9b. | Same evidence file + `packages/server/src/seed/apply.ts:85-113`. | ~15 LoC delete + ~10 LoC add + test updates. FR-9b retained, retargeted. |

> **Audit-fix 2026-04-28**: The D56 row below was previously smashed into D63's cells due to a formatting bug. Restored as its own row.

| D56 | **Settings-pane validation rejection UX: toast + brief field flash, auto-dismiss.** When L3 rejection (D45 persistence-hook revert) fires from a non-Settings-pane writer (CLI, MCP, hand-edit, dev-tools), the Settings pane (when open) shows a toast with `humanFormat(error)` + auto-dismisses after 8s. The affected field (mapped from `issue.path`) flashes red briefly. User can retry directly from the form. Pattern matches VS Code's settings.json validation. **Mechanism**: Settings pane subscribes to CC1 `'config-validation-rejected'` broadcasts; on event, walker maps the issue path to the rendered field and triggers the flash + toast. | P | LOCKED | No (UX) | User direction 2026-04-28: "Toast + brief field flash (Recommended)." | User session 2026-04-28 + VS Code precedent | Cheap implementation: ~20 LoC subscriber + flash CSS class. Routes through the residual CC1 'config-validation-rejected' channel (the only surviving config CC1 channel post-pivot — original `'config'` channel D6 is dropped per Y.Text-observer-replaces-it). |

<!-- Audit-fix 2026-04-28: D38 ghost-content (the prior 3-layer "Operation 1 / Operation 2" prose, originally part of D38 before the pivot reshaped it) was clipped here. The current shape of D38 is captured in the D38 RESHAPED row above; full original text remains in git history. -->

> **D38 (RESHAPED) original detail (preserved for audit):** The full original D38 prose (HTTP routes, two-validator references, `applyConfigPatch` framing, the 3-layer "Operation 1 — Whole-array state-based / Operation 2 — Per-rule upsert" prose, GitHub label-rename precedent, etc.) lives in the original draft commit prior to the pivot. The current D38 row in §10 reflects the RESHAPED state (HTTP route dropped; helper + MCP tool retained); the preserved-original prose was clipped during this audit fix to remove a row-formatting bug. Refer to git history at baseline `49eda816` (the pre-pivot commit) for the original D38 cell text in full.

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

> **Note on Q1 + Q8** — Q1's "align all routes to one ApiError envelope" resolution is **SUPERSEDED 2026-04-28** by NG13 (no HTTP for config). The new error shape is `ConfigValidationError` (TS-only), captured under D14 (shrunk) + D45. Q8's "inline per-field + toast" pattern still holds, but the envelope shape (`Reload from disk` button etc.) is reframed — see NQ9 below for the new resolution path.

---

**Post-pivot questions (added 2026-04-28 release pivot — NQ1–NQ18):**

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| ~~NQ1~~ | **🔁 RESOLVED 2026-04-28 → D48** (separate `HocuspocusProvider` per config doc, mirroring `SystemDocSubscriber.tsx:46-48` precedent; pool reuse rejected because it would require gating `setupObservers` to avoid markdown-bridge engagement). | T | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ1. | RESOLVED |
| ~~NQ2~~ | **🔁 RESOLVED 2026-04-28 → D49** (no additional auth gating for config docs; existing `principalAuthExtension` is documentName-agnostic; add `isConfigDoc()` short-circuits in `agent-sessions.ts` mirroring `__system__` precedent). | T | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ2. | RESOLVED |
| ~~NQ3~~ | **🔁 RESOLVED 2026-04-28 → D57** (LKG cold-start recovery: parse + safeParse → on fail, sideline to `.invalid-<timestamp>` + initialize Y.Doc with schema-default-serialized YAML + emit CC1 broadcast on first Modal connect). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ3. | RESOLVED |
| ~~NQ4~~ | **🔁 RESOLVED 2026-04-28 → D50** (gradual two-PR move with re-export bridge in `cli/`; PR 1 copies source + adds shim, PR 2 updates 17 importers + removes shim; only 1 importer is runtime). | T | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ4. | RESOLVED |
| ~~NQ5~~ | ~~Modal renders `scope: 'either'` fields~~ **🔁 RESOLVED 2026-04-28 with reframe → settings render as a pane in the main editor area, NOT a `<Dialog>` Modal.** User direction: the schema-driven form appears in the main editor pane (the same surface that hosts the document view) when the user invokes a settings entry point. Per-scope rendering uses VS Code's pattern (option b from the original NQ5): both User and Workspace sub-tabs inside the pane show their respective values via `inspectConfig`, with the FR-3b "modified at this scope" indicator. **Cascade implications**: D7 (Modal as Dialog) → SUPERSEDED; D24 (SeedDialog scrollable layout) → N/A (pane uses editor scroll); D21 entry points → trigger pane navigation, not dialog open; D22 (Install row) → renders in pane "Integrations" section; D16 (hidden in Navigator) → pane just doesn't render in Navigator window; FR-1, FR-2, FR-23 — reframe in Step 5 to drop "Modal" terminology. | P | RESOLVED | — | User direction 2026-04-28; rendering shape locked, scope-rendering pattern is VS Code precedent. | RESOLVED |
| ~~NQ6~~ | **🔁 RESOLVED 2026-04-28 → D58** (`CONFIG_VALIDATION_REVERT_ORIGIN` — frozen object literal `{context: {origin: 'config-validation-revert'}, skipStoreHooks: true}`; L3 entry-gate filters by origin equality; NOT a paired-write origin since bridge is bypassed for config docs per D41). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ6. | RESOLVED |
| ~~NQ7~~ | ~~Theme localStorage → `appearance.theme` migration UX~~ **🔁 RESOLVED 2026-04-28 → no proactive migration, dual-track.** localStorage stays as the FOUC cache; `config.yml` is authoritative once `appearance.theme` is set. Until then, the existing chrome theme toggle continues writing localStorage. The first explicit Settings-pane write of `appearance.theme` canonicalizes the value into config.yml; from that point forward, all writes flow through `userBinding.patch()` and localStorage becomes a derived cache. The chrome toggle should be updated to call `userBinding.patch()` so all writes go through one path; until that update lands, dual-track means a brief window where toggle and Settings can diverge — accepted trade-off per user direction. **Implication for §6 FRs**: appearance.theme defaults to UNSET in config.yml (not `'system'`); chrome FOUC reads localStorage as before; loader/binding fills appearance.theme→localStorage as a side effect when set. No banner, no migration toast. | P | RESOLVED | — | User direction 2026-04-28. | RESOLVED |
| ~~NQ8~~ | **🔁 RESOLVED 2026-04-28 → D51** (lazy first-write via `writeConfigPatch`, NOT eager via `ok init`; mode 0o644 not 0o600 — config is not secret; reuses `persistence.ts:881-884` atomic-write pattern; first-write includes FR-17 magic-comment header). | P | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ8. | RESOLVED |
| ~~NQ9~~ | ~~Validation rejection UX in Modal — pivot reframe of Q8~~ **🔁 RESOLVED 2026-04-28 → toast + brief field flash, auto-dismiss.** When L3 (D45) rejection fires from a non-Settings-pane writer (CLI, MCP, hand-edit, dev-tools), the Settings pane (when open) shows a toast with `humanFormat(error)` text + auto-dismiss after 8s. The affected field (mapped from `issue.path`) flashes red briefly. User can retry directly from the form. Pattern matches VS Code's settings.json validation. | P | RESOLVED | — | User direction 2026-04-28. | RESOLVED |
| ~~NQ10~~ | **🔁 RESOLVED 2026-04-28 → D59** (no client-side y-indexeddb persistence for config docs; always re-fetch on connect; mirrors `__system__` precedent; ~100-300ms cold-mount latency well within 200ms first-open target's tolerance). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ10. | RESOLVED |
| ~~NQ11~~ | **🔁 RESOLVED 2026-04-28 → D52** (chokidar single-file watch with `awaitWriteFinish: { stabilityThreshold: 100 }` — existing @parcel/watcher is directory-recursive only; new `startConfigFileWatcher(absPath, onChange)` API; two `boot.ts` callsites for workspace + user-global). | T | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ11. | RESOLVED |
| ~~NQ12~~ | **🔁 RESOLVED 2026-04-28 via FR-6/FR-6b/FR-6c rewrites** (FRs cascaded in Step 5; all three tool descriptions now reflect fs-direct via `writeConfigPatch` / `applyFolderRulesUpsert` / `loadConfig`, no HTTP, `Result<T, ConfigValidationError>` shape, `[Operates on disk; no running OK server required]` tag in tool descriptions). The MCP-tool-description-as-AI-contract literature reference from the original §9.7.2 is preserved for implementation drafting. | P | RESOLVED | — | FR-6, FR-6b, FR-6c (post-cascade) + §9.7.2 (original draft, retained for implementation reference). | RESOLVED |
| ~~NQ13~~ | **🔁 RESOLVED 2026-04-28 → D60** (`fieldRegistry` lives in `@inkeep/open-knowledge-core`; Symbol-keyed `globalThis` singleton via `Symbol.for('@inkeep/open-knowledge/field-registry')`; mirrors Zod's `z.globalRegistry` discipline; STOP rule: one registry per process). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ13. | RESOLVED |
| ~~NQ14~~ | **🔁 RESOLVED 2026-04-28 → D61** (D25 ladder survives D43/D47: `inspectConfig.workspace ?? inspectConfig.user ?? fieldRegistry.defaultScope ?? 'user'`; mixed-scope patches REJECTED with `error.code: 'MIXED_SCOPE'` to avoid partial-success machinery; agent retries per-scope). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ14. | RESOLVED |
| ~~NQ15~~ | **🔁 RESOLVED 2026-04-28 → D62** (`set_folder_rule` is fs-direct via `applyFolderRulesUpsert`; resolves contentDir via `resolveProjectConfigContext(cwd)`, NOT `resolveProjectServerContext`; mirrors `read_document`'s fs-direct pattern; works with no `ok start` running; tool description tagged `[Operates on disk; no running OK server required]`). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ15. | RESOLVED |
| NQ16 | **Schema versioning + future codemod paths** — `ok config migrate` currently only handles D29's one-shot cleanup. Future field renames or shape changes will need additional codemod versions. Should we introduce a `__schemaVersion: '1.0'` field now (declared in `ConfigSchema`, written by `ok init`, read by `ok config migrate`)? Or add it later when first non-D29 migration emerges? | T | P2 | None | Defer to Future Work unless evidence emerges that v0 needs it. | Open |
| ~~NQ17~~ | **🔁 RESOLVED 2026-04-28 → D63** (replace per-configPath append-loop + `parseDocument` + mutate + `writeFileSync` with single `applyFolderRulesUpsert({cwd, scope: 'workspace', rules: [...]})` call; ~15 LoC delete + ~10 LoC add; existing seed unit tests need minor error-shape update from string to `ConfigValidationError`). | T | RESOLVED | — | `evidence/cluster-b-dependent-investigations.md` NQ17. | RESOLVED |
| ~~NQ18~~ | **🔁 RESOLVED 2026-04-28 → D53** (6-span set: `config.bind`, `config.patch`, `config.validate` (with `validation.layer` attr), `config.persist`, `config.revert` + existing `fs.*` from `tracedWriteFile`; bounded enum attributes only; Zod issue paths in span events not attributes). | T | RESOLVED | — | `evidence/cluster-a-foundational-investigations.md` NQ18. | RESOLVED |

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
  2. **`ConfigSchema` migration to core** (Day 1, PR 1 + PR 2): Copy `packages/cli/src/config/schema.ts` to `@inkeep/open-knowledge-core`; add re-export shim in cli (PR 1, ~50 LoC). Update 17 importers to use core path (PR 2, ~150 LoC). Per D44 + D50 + FR-31. Apply schema cleanup (FR-9c / D29) — drop the 10 fields, add `appearance.{theme, editorModeDefault}`, switch to `z.looseObject` (D34). Add `fieldRegistry` + per-field `.register()` annotations (FR-32 / D43 / D47 / D60).
  3. **`writeConfigPatch` + `ConfigValidationError` core** (Day 1-2): Implement `writeConfigPatch` in `@inkeep/open-knowledge-core` with `Result<T, E>` shape (D35), TypeScript `DeepPartial<Config>` semantics, single Zod safeParse (D45 L2), atomic tmp+rename via `tracedRename`. Define `ConfigValidationError` discriminated union with `humanFormat()` helper. Per FR-9. Lazy first-write of `~/.open-knowledge/config.yml` per D51 / FR-36.
  4. **`bindConfigDoc` + `ConfigBinding` core** (Day 2): Implement `bindConfigDoc(provider, scope)` returning the `ConfigBinding` interface. Y.Text observer + yaml@2 setIn → re-serialize → Y.Text replace. Separate provider per config doc per D48; no client-side y-indexeddb per D59. Per FR-33.
  5. **Hocuspocus admission for config docs** (Day 2): Add `isConfigDoc()` predicate to `cc1-broadcast.ts` (sibling to `isSystemDoc`); admit `__config__/workspace` and `__user__/config.yml` synthetic docs at boot via `hocuspocus.openDirectConnection()` per D39 / D40 / FR-29. Add `isConfigDoc()` short-circuits in `agent-sessions.ts` per D49. Bridge bypass: gate at `server-observer-extension.ts:50` per D41 / FR-30.
  6. **Persistence-hook L3 validation + LKG cache + revert** (Day 2-3): Add config-doc branch to `onStoreDocument` in `persistence.ts` per FR-34. Implement in-memory LKG cache (per-server-instance, rebuilt on doc load). Define `CONFIG_VALIDATION_REVERT_ORIGIN` frozen object per D58. Wire CC1 `'config-validation-rejected'` broadcast on rejection per FR-14b. Cold-start recovery (FR-35 / D57) via new `readConfigSafely` helper.
  7. **File watcher for config paths** (Day 3): Add chokidar single-file watch with `awaitWriteFinish: { stabilityThreshold: 100 }` per D52 / FR-15. New `startConfigFileWatcher(absPath, onChange)` API; two `boot.ts` callsites (workspace + user-global). On detected change, server reads file → updates Y.Text via server-origin transaction → all open Settings panes refresh.
  8. **MCP tools (fs-direct)** (Day 3-4): Register `set_config`, `get_config`, `set_folder_rule` in `packages/cli/src/mcp/tools/`. All three are fs-direct — call `writeConfigPatch` / `applyFolderRulesUpsert` / `loadConfig` directly (no HTTP per NG13). Resolve contentDir via `resolveProjectConfigContext(cwd)` per D62. Tool descriptions tagged `[Operates on disk; no running OK server required]`. Per FR-6 + FR-6b + FR-6c.
  9. **Source-located errors** (Day 3): Switch loader from `parseYaml` to `parseDocument`; thread Document AST through `safeParse` failures to compute `file:line:col`. Reuse for CLI/Settings-pane renderings per FR-27 / D36.
  10. **Settings pane** (Day 4-5): Build `packages/app/src/components/SettingsPane.tsx` per FR-37 / D54. Editor area routes to either `<TiptapEditor>` or `<SettingsPane>` based on UI mode. Sub-tabs (FR-2). Zod walker enforcing scope-as-constraint via `getFieldMeta` (D43). Auto-save via `binding.patch` (D8). Per-field reset (D9). Modified-at-scope indicator (FR-3b). Inline issue rendering + toast for L3 rejections (FR-39 / D56).
  11. **Entry points + Integrations row** (Day 5): Wire HelpPopover submenu, Cmd-, shortcut, CommandPalette entry, Electron menu item via `ok:menu-action` — all trigger pane navigation per FR-1 / D21. Hidden in Navigator window per D16 / FR-20. Settings pane "Integrations" section with Install in Claude Desktop row per FR-25 / D22.
  12. **`seed/apply.ts` retarget** (Day 5): Migrate `seed/apply.ts:85-113` onto `applyFolderRulesUpsert` per FR-9b / D63. ~15 LoC delete + ~10 LoC add + minor test error-shape updates.
  13. **CLI** (Day 5-6): Add `commands/config.ts` with `validate` + `migrate` subcommands (FR-16 + FR-26 / D37). Both call `writeConfigPatch` / `loadConfig` from core.
  14. **Init template + schema export** (Day 6): Update `CONFIG_YML_CONTENT` template in `packages/cli/src/content/init.ts` with version-pinned `$schema` URL (FR-17). Add `build:schema` step emitting `dist/config-schema.json` via `z.toJSONSchema(ConfigSchema, {io: 'input', target: 'draft-07', metadata: fieldRegistry})` per FR-18. CI test asserting JSON-Schema↔runtime equivalence.
  15. **OTel spans** (Day 6): Add the 6-span set per FR-38 / D53 (`config.bind`, `config.patch`, `config.validate`, `config.persist`, `config.revert` + existing `fs.*` from `tracedWriteFile`). Bounded enum attributes only.
  16. **External**: Submit SchemaStore PR (FR-19).
- **Risks + mitigations**: see §14.
- **What gets instrumented/measured**: see §7.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Schema URL stability | Pin to package major.minor (`https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json`); the codemod from FR-26 bumps the URL on upgrade | First IDE intellisense session works; `ok config migrate --to <version>` updates the URL alongside any field migrations |
| SchemaStore PR latency | Magic-comment scaffold provides fallback while PR is in flight | Magic-comment alone enables intellisense without SchemaStore |
| User-global file creation (first time) | `writeConfigPatch` calls `mkdirSync(dirname(path), {recursive: true})` before atomic write — handles both workspace + user-global directories. Mode 0o644 per D51. Resolves Q7 (silent file create). | First Settings-pane save to user scope on a fresh machine |
| Cold-start with invalid existing config | Per D57 / FR-35: parse with yaml@2 + safeParse → on fail, sideline to `.invalid-<timestamp>` → init Y.Doc with schema-default-serialized YAML → emit CC1 `'config-validation-rejected'` on first connect | A pre-existing config with broken YAML or a removed schema field loads successfully; the original is preserved as `.invalid-<timestamp>` for forensics; user sees recovery toast on first Settings-pane open |
| Multi-version Zod schema drift | Version `dist/config-schema.json` per npm publish; consumers pin to OK version. CI test asserts JSON-Schema↔runtime equivalence per FR-18. | Old IDE intellisense data doesn't break new config fields; transforms can never silently slip into the schema |
| Stale fields after schema cleanup | D34 `z.looseObject` accepts unknown fields (preserved on disk); D37 `ok config migrate` codemod cleans them up explicitly when user opts in | A pre-D29 config with `sync.pushIntervalSeconds: 30` loads successfully; `ok config migrate` removes the line; running the codemod twice is a no-op |
| ~~Existing routes' error shape refactor~~ | **🚫 DROPPED** — D30/FR-28 dropped per pivot; existing routes' `{ok, error: string}` shape left as-is for this spec | — |
| Concurrent agent + Settings-pane edits to the same field | Per D46 LWW: CRDT handles intra-process; LWW handles cross-process (~2s window, vanishingly rare per evidence/cross-process-write-strategy.md). Persistence-hook L3 (FR-34) ensures lost-updates produce stale-but-valid YAML. | Two concurrent writes to `mcp.tools.search.maxResults` produce one win on disk; CRDT propagates both; final state is one of the two values; no broken YAML. |
| Cross-process Settings-pane writes (multi-window theme sync) | File watcher per server instance; chokidar `awaitWriteFinish: 100ms` debounces atomic-rename detection per D52 / FR-15 | Two browser tabs / two Electron windows of the same machine (same `ok start`) sync via Yjs delta; two browser tabs of different `ok start` instances sync via fs+watcher within ~100-300ms |
| MCP token cost regression | Three new tools (`set_config`, `get_config`, `set_folder_rule`) — well under the 2-6 tools/server domain optimum | Measure in real session |
| `ConfigSchema` import-graph migration | Two-PR gradual move per D50 / FR-31 — re-export shim in cli during transition keeps in-flight branches working | Each of the 17 importers migrates without breaking; no circular dependencies introduced |

## 14) Risks & mitigations

> **2026-04-28 release-pivot reframe.** Risks specific to the dropped HTTP layer are removed; new pivot-specific risks (NR1–NR7) added; surviving risks updated to reflect the new architecture.

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **NR1**: Hocuspocus has no atomic Y.Doc rollback on persistence-hook rejection (upstream-confirmed) — D42/FR-34 implements manual revert via server-origin transaction with LKG cache | HIGH | MED | Implement carefully + integration tests for revert-during-concurrent-mutation; entry-gate at hook top filters revert-origin updates from re-firing validation | TBD |
| **NR2**: Cross-process lost-update window for user-global writes (D46 LWW) — two `ok start` instances writing within ~2s lose one update | LOW | LOW | Accepted trade-off per D46; persistence-hook L3 ensures lost-updates produce stale-but-valid YAML; NG14 captures advisory-lock as Future Work if real reports emerge | TBD |
| **NR3**: Zod v4 `.meta()` does NOT propagate through `.default()` / `.optional()` / `.nullable()` wrappers — risk that an implementer forgets `.register()` order | MED | MED | D47 + D60 lock declaration order (`.register()` first, then wrappers); STOP rule in AGENTS.md; CI test that walks `ConfigSchema` and asserts every leaf has a `fieldRegistry` entry | TBD |
| **NR4**: Multi-window Y.Text concurrent edits (same field, same `ok start`) could produce CRDT-merged invalid YAML | LOW | MED | Persistence-hook L3 (FR-34) catches invalid YAML; reverts to LKG. Acceptable trade-off given per-machine, mostly-single-tab usage. | TBD |
| **NR5**: `ConfigSchema` package-relocation (D50/FR-31) breaks downstream importers if not handled carefully | MED | MED | Two-PR gradual move with re-export shim; CI test asserts every importer compiles after PR 1 + after PR 2 | TBD |
| **NR6**: Settings pane component lifecycle (mount/unmount of `HocuspocusProvider` per D48) leaks WS connections if cleanup is incomplete | LOW | MED | React effect cleanup pattern; integration test that opens + closes Settings 100x and asserts WS count returns to baseline; OTel `config.bind` span pairs with provider teardown | TBD |
| **NR7**: SchemaStore PR rejected or delayed | LOW | LOW | Magic-comment fallback works without SchemaStore; just needs unpkg URL stable | TBD |
| **NR8** (audit-surfaced 2026-04-28; explicitly accepted by user): D29 schema cleanup × D55 dual-track theme creates a UX gap on upgrade — user has `theme=dark` in localStorage; opens Settings; sees `appearance.theme` rendered as UNSET (default). Brief confusion; user toggles theme to canonicalize. | LOW | LOW | Accepted per user direction 2026-04-28 ("accept the gap, current spec position"); aligns with D55's no-proactive-migration framing. Documented in NR8. Mitigation if real-world reports surface: lazy localStorage→config migration on first Settings-pane mount (~10 LoC, additive). | TBD |
| **NR9** (challenger-surfaced 2026-04-28; explicitly accepted by user): Y.Text intra-doc concurrent writes — two simultaneous `binding.patch()` calls each do their own yaml@2 setIn → re-serialize → Y.Text replace. CRDT character-level merge on the resulting YAML strings could produce invalid YAML. | LOW | MED | L3 (D45 persistence-hook revert, FR-34) catches invalid YAML and reverts to LKG; CC1 emits validation-rejected toast (D56/FR-39); user retries. Per-machine, mostly-single-tab usage makes this rare. Accepted per user direction 2026-04-28 ("accept + L3 catches it"). Mitigation if cascading reverts surface: awareness-based "I'm editing this field" semaphore (~50 LoC) or coarse-grained Y.Map per field (loses comment preservation). | TBD |
| `yaml@2` Document layer round-trip subtly mangles complex configs (anchors, custom tags) on real user files | LOW | MED | Comprehensive round-trip tests on representative config corpus; preserved bytes-equality for the simple cases; the `seed/apply.ts` production precedent (Tim's #319) demonstrates the round-trip works at scale | TBD |
| Zod walker breaks on a future Zod schema construct (e.g., recursive types via `z.lazy()`) | MED | MED | Walker handles known constructs; unknown constructs render generic JSON-text editor as fallback | TBD |
| File watcher misses external edits (chokidar quirk on macOS/Windows) | LOW | LOW | `awaitWriteFinish: 100ms` per D52 handles atomic-rename detection; manual test on each OS during implementation | TBD |
| Auto-save creates surprising commits ("I tabbed away from a half-typed value") | MED | LOW | Local validation blocks invalid → field stays dirty; valid intermediate values like `25` for `mcp.tools.search.maxResults` ARE intentional commits | TBD |
| User-global config UI is the first writer to `~/.open-knowledge/config.yml`; permission errors on uncommon shells | LOW | MED | Explicit error message with `ok config validate --user` (post-v0) as remediation; D51 mode 0o644 (not 0o600) avoids over-restrictive permission edge cases | TBD |
| `writeConfigPatch` returns `Result<T, E>` but a caller forgets to check `result.ok` and crashes downstream | LOW | MED | TypeScript discriminated union forces narrowing — `result.applied` only typechecks inside the `result.ok === true` branch | TBD |
| `z.looseObject` (D34) lets users carry stale fields silently after a schema removal | LOW | LOW | `ok config migrate` codemod (FR-26) makes cleanup explicit; on schema-cleanup releases, `ok` emits a one-line "your config has N deprecated fields — run `ok config migrate` to clean up" message at boot | TBD |
| Source-position lookup (FR-27/D36) is incorrect for deeply-nested paths | LOW | LOW | yaml@2 Document API (`doc.getIn(path).range`) is the canonical mechanism; integration tests assert correct line/col for representative fixtures | TBD |
| Right-click-folder UX (Future Work) finds `applyFolderRulesUpsert` insufficient when shipped | LOW | MED | The helper covers the upsert case the UX needs (per D38 design). If multi-match UX requires server-side resolution help, add a paired `get_folder_frontmatter({path})` MCP read tool — additive, non-breaking. | TBD |
| ~~New `errors[]` shape becomes inconsistent with rest of API~~ | — | — | DROPPED — D30/FR-28 dropped per pivot; existing routes' `{ok, error: string}` shape left as-is for this spec; the all-routes envelope alignment is captured as Future Work in §15. | — |
| ~~Concurrent edits race (agent + UI hit `applyConfigPatch` in same ms)~~ | — | — | RESOLVED differently — CRDT handles intra-process per the pivot; D46 LWW accepts the cross-process race; persistence-hook L3 ensures broken state can't land. | — |

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
- **Live concurrent-editor presence in Settings pane** — no web-host dev tool does this; commit-time conflicts are universal pattern; deferred indefinitely (NG6 reinforced by D46).
- **Conflict-merge UX** (auto-resolve concurrent edits) — auto-save + LWW model means rare in practice; defer until real complaints.
- **TypeScript-config-as-schema migration** (Astro/Storybook style) — explicitly NEVER per NG; users have already chosen YAML.

### New Future Work entries (added 2026-04-28 release pivot)

- **All-routes `ApiError` envelope alignment** (was D30; now Future Work). Refactoring the ~50 existing `{ok, error: string}` routes and the 2 seed `{ok: false, error: {kind, message}}` routes to a canonical `ApiError` discriminated union remains a real engineering improvement — but it's no longer load-bearing for THIS spec's success once HTTP for config drops (NG13). **What we know**: spec design from the original draft is sound (D14 + D30 framing); ~50 routes × ~5 LoC = one focused day. **Why it matters**: every new error code today requires N updates across N adapter layers; with one envelope, each consumer rendering becomes a pure function. **Investigation needed**: when this lands, decide whether to also adopt RFC 9457 Problem Details wire format or stay with the discriminated-union shape.
- **Per-machine advisory lock** (`proper-lockfile` or fcntl) on `~/.open-knowledge/config.yml` writes (NG14). **What we know**: `proper-lockfile` is the Node ecosystem standard; ~20 LoC in the user-global write path; cross-platform handled. **Why it matters**: only if real-world lost-update reports surface OR a future feature legitimately requires synchronous cross-instance coordination. **Investigation needed**: monitor for user reports; the LWW window per D46 is ~2s and requires same human in same field across two `ok start` instances.
- **HTTP API for config edits** (NG13). **Why it matters**: only relevant if a non-Hocuspocus, non-fs writer emerges (e.g., a hosted multi-tenant scenario where browser ↔ server doesn't share filesystem). At which point this spec doesn't apply and a fresh design is needed.
- **Migrate non-secret `auth.yml` metadata into `config.yml`** (NG15). **What we know**: today `~/.open-knowledge/auth.yml` stores per-host `{login, token, gitProtocol, name, email}` — the latter four fields are non-secret identity bookkeeping. **Why it matters**: only if a user wants to edit them via Settings UI; today they're written exclusively by `ok auth login`/`pat`/`signout`. **Investigation needed**: do users want this? Probably not.

## 16) Agent constraints

> **Release-pivot reframe (2026-04-28).** SCOPE/EXCLUDE/STOP_IF/ASK_FIRST rewritten to reflect Hocuspocus + TypeScript API + Settings-pane architecture. References to dropped HTTP routes, ApiError envelope, ETag/If-Match all removed. Cross-cutting concerns from §10 D39–D63 surfaced inline.

- **SCOPE:**
  - **Core package (NEW SCOPE — D44/D50/FR-31):**
    - `packages/core/package.json` (add `yaml: ^2.x` dep — required by the new `write-config-patch.ts` for round-trip; current core does not import yaml; verified by audit 2026-04-28)
    - `packages/core/src/config/schema.ts` (NEW — moved from cli; D29 schema cleanup; `z.looseObject` per D34; `fieldRegistry` `.register()` annotations per D43/D47)
    - `packages/core/src/config/field-registry.ts` (NEW — Symbol-keyed `globalThis` singleton per D60; `getFieldMeta` walker descending `_zod.def.innerType` per D47/FR-32)
    - `packages/core/src/config/write-config-patch.ts` (NEW — headless writer per FR-9; yaml@2 `parseDocument` + setIn + safeParse + atomic tmp+rename via `tracedRename`; `Result<T, ConfigValidationError>` shape per D35; lazy first-write of `~/.open-knowledge/config.yml` per D51/FR-36; mode 0o644)
    - `packages/core/src/config/apply-folder-rules-upsert.ts` (NEW — per D38 reshaped/D62/FR-6b; iterates rules, single `writeConfigPatch` call, transactional all-or-nothing)
    - `packages/core/src/config/bind-config-doc.ts` (NEW — UI binding per FR-33; separate `HocuspocusProvider` per config doc per D48; no client-side y-indexeddb per D59; Y.Text observer + yaml@2 setIn → re-serialize → Y.Text replace)
    - `packages/core/src/config/config-validation-error.ts` (NEW — discriminated union per D14 shrunk; `humanFormat` helper)
    - `packages/core/src/config/read-config-safely.ts` (NEW — cold-start recovery per D57/FR-35; sideline-invalid-file pattern)
  - **CLI package:**
    - `packages/cli/src/config/schema.ts` (re-export shim per D50 PR 1; deleted in PR 2)
    - `packages/cli/src/config/loader.ts` (switch `parseYaml` → `parseDocument` for source positions per FR-27/D36; cross-scope `folders[]` merge unchanged per Q11; calls `readConfigSafely` per FR-35)
    - `packages/cli/src/commands/config.ts` (NEW — `ok config validate` + `ok config migrate` codemod for FR-16/FR-26/D37)
    - `packages/cli/src/content/init.ts` (CONFIG_YML_CONTENT magic-comment with version-pinned `$schema` URL per FR-17)
    - `packages/cli/src/mcp/tools/set-config.ts` (NEW — FR-6; fs-direct via `writeConfigPatch`; allowlist gating via `getFieldMeta(field).agentSettable`; scope inference per D61; `MIXED_SCOPE` rejection)
    - `packages/cli/src/mcp/tools/get-config.ts` (NEW — FR-6c; fs-direct via `loadConfig`; no allowlist on read)
    - `packages/cli/src/mcp/tools/set-folder-rule.ts` (NEW — fs-direct per D62; thin wrapper around `applyFolderRulesUpsert`; resolves contentDir via `resolveProjectConfigContext(cwd)`)
    - `packages/cli/src/mcp/tools/index.ts` (registration of the new tools)
    - `packages/cli/tsdown.config.ts` + `package.json` (build:schema script for FR-18 — `z.toJSONSchema(ConfigSchema, {io: 'input', target: 'draft-07', metadata: fieldRegistry})`; CI test asserting JSON-Schema↔runtime equivalence)
  - **Server package:**
    - `packages/server/src/cc1-broadcast.ts` (add `isConfigDoc()` predicate sibling to `isSystemDoc` per D39/FR-29; extend `DerivedViewChannel` enum to include `'config-validation-rejected'` per FR-14b — drop original `'config'` channel per D6 superseded)
    - `packages/server/src/agent-sessions.ts` (add `isConfigDoc()` short-circuits per D49/FR-29 — mirror `isSystemDoc` short-circuits)
    - `packages/server/src/server-observer-extension.ts:50` (single-line gate per D41/FR-30: `if (isSystemDoc(name) || isConfigDoc(name)) return`)
    - `packages/server/src/persistence.ts` (add config-doc branch to `onStoreDocument` per D42/FR-34; in-memory LKG cache; revert via `CONFIG_VALIDATION_REVERT_ORIGIN` server-origin transaction per D58; entry-gate filter on revert origin)
    - `packages/server/src/config-edit-origin.ts` (NEW — `CONFIG_VALIDATION_REVERT_ORIGIN` frozen object literal per D58; sibling to `OBSERVER_SYNC_ORIGIN`)
    - `packages/server/src/config-file-watcher.ts` (NEW — chokidar single-file watch with `awaitWriteFinish: 100ms` per D52/FR-15; `startConfigFileWatcher(absPath, onChange)` API)
    - `packages/server/src/boot.ts` (admit `__config__/workspace` + `__user__/config.yml` synthetic docs via `hocuspocus.openDirectConnection()` per D39/D40/FR-29; register two `startConfigFileWatcher` callsites)
    - `packages/server/src/seed/apply.ts` (FR-9b/D63 — migrate the `parseDocument` → mutate → `writeFileSync` block onto `applyFolderRulesUpsert`)
    - `packages/server/src/telemetry.ts` (no change; `withSpan` pattern reused for the 6 new spans per FR-38/D53)
  - **App package:**
    - `packages/app/src/components/SettingsPane.tsx` (NEW — pane component per FR-37/D54; replaces the prior planned Modal Dialog approach; sub-tabs per FR-2; Zod walker enforcing scope-as-constraint via `getFieldMeta`; auto-save via `binding.patch` per D8; per-field reset per D9; FR-3b modified-at-scope indicator; FR-39 toast + flash for rejections)
    - `packages/app/src/components/EditorArea.tsx` (route to either `<TiptapEditor>` or `<SettingsPane>` based on UI-state mode per FR-37)
    - `packages/app/src/components/EditorHeader.tsx` (entry points: Cmd-, + HelpPopover submenu per FR-1/D21 — trigger pane navigation, NOT dialog open)
    - `packages/app/src/components/CommandPalette.tsx` (entry point per FR-1/D21 — same)
    - `packages/app/src/components/SystemDocSubscriber.tsx` (CC1 `'config-validation-rejected'` channel routing per FR-14b; emits to Settings pane component)
    - `packages/desktop/src/main/menu.ts` (Settings menu item via `ok:menu-action` per FR-1/D21)
    - **NO `attribution-sweep-coverage.test.ts` change** — D23/FR-12 dropped along with HTTP `/api/config/patch`. There's no `handleConfigPatch` HTTP handler to add to `EXEMPT_HANDLERS`.
- **EXCLUDE:**
  - `packages/server/src/external-change.ts` (CRDT content-only, not config)
  - `packages/server/src/server-observers.ts` markdown bridge (config docs bypass per D41/FR-30)
  - `packages/app/src/editor/TiptapEditor.tsx` (markdown editor, not config UI — config has its own pane component)
  - All HTTP route files (`packages/server/src/api-extension.ts` config routes) — no HTTP for config per NG13
  - `packages/cli/src/auth/token-store.ts` (NG15 — auth.yml stays separate; secret threat model)
  - `packages/server/src/api-error.ts` (was planned for the all-routes envelope refactor; D30 dropped — file not needed for this spec)
- **STOP_IF:**
  - Schema requires migration that ISN'T covered by `ok config migrate` codemod (D37) — drop-and-rewrite-without-codemod is the documented anti-pattern (ESLint v9 lesson)
  - Engaging the markdown observer bridge for config docs (NG2 reframed — D41 enforces bypass)
  - Adding a JSON intermediate format (NEVER per NG3)
  - Building a pluggable validator framework (NEVER per NG1)
  - Routing config edits through HTTP (NG13 — FR-12/FR-13/FR-28 dropped; new HTTP routes for config require explicit re-decision)
  - `writeConfigPatch` or `ConfigBinding.patch` throws across the boundary instead of returning `Result<T, E>` (D35)
  - DeepPartial PATCH semantics drift from null-as-clear convention (D31 spirit retained)
  - A consumer instantiates a sibling `fieldRegistry` instead of importing the singleton (D60 — only one registry per process)
  - A schema field is added without `.register(fieldRegistry, ...)` BEFORE its `.default()` / `.optional()` wrappers (D47 declaration order)
  - Persistence-hook L3 revert uses any origin OTHER than `CONFIG_VALIDATION_REVERT_ORIGIN` (D58 — would re-trigger validation loop)
  - Client-side y-indexeddb persistence is added for config docs (D59 — eliminates the staleness window by construction)
  - Adding a `paired: true` flag to `CONFIG_VALIDATION_REVERT_ORIGIN` (D58 — bridge is bypassed; not a paired-write origin)
- **ASK_FIRST:**
  - Adding a 3P form library dep (D4 deliberately rejects all four surveyed)
  - Adding any new Hocuspocus admission beyond `__config__/workspace` and `__user__/config.yml` (D39/D40/FR-29 — admission set is the public contract)
  - Switching from chokidar back to @parcel/watcher for config file watching (D52 — chokidar's `awaitWriteFinish` is load-bearing for atomic-rename detection)
  - Adding a per-machine advisory lock (NG14 deferred to Future Work; revisit only if real-world lost-update reports surface)
  - Eager (not lazy) creation of `~/.open-knowledge/config.yml` (D51 — lazy via first `writeConfigPatch` is intentional; eager via `ok init` couples workspace init to user-global state)
  - Adding HTTP routes for config (NG13)
  - Migrating `auth.yml` non-secret fields into `config.yml` (NG15)
  - Tightening `z.looseObject` to strict mode for any sub-object (D34 — forgiveness on unknown fields is foundational)
  - Tightening any `z.looseObject` to `z.strictObject` (D34 — strict-mode-on-human-authored-config breaks forward compat)
  - Refactoring existing routes' error shapes outside the FR-28 batch (the alignment is one focused day; piecemeal is worse than nothing)
  - Adding a route that bypasses `checkLocalOpSecurity`
  - Adding new HTTP endpoints not behind `checkLocalOpSecurity`
  - Refactoring existing `{ok, error: string}` routes to `{ok, errors[]}` (Q1 — additive only without explicit decision)
