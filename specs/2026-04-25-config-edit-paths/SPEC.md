---
title: "Config Edit Paths — Modal UI + MCP Tools + IDE Intellisense over .open-knowledge/config.yml"
status: Draft
owner(s): Nick (CPO/CTO)
created: 2026-04-25
updated: 2026-04-25
baseline_commit: 49eda816
---

# Config Edit Paths — Spec

**Status:** Draft
**Owner(s):** Nick
**Last updated:** 2026-04-25
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
| Must | **FR-6**: MCP `set_config` tool — single upsert with deep-partial input + optional `scope` param | Tool registered; agent can patch one or many fields in a single call; `scope` defaults to `'workspace'`; per-field `.describe()` from Zod surfaces in `inputSchema` | See `reports/config-edit-paths/REPORT.md` D4 for shape |
| Must | **FR-7**: MCP `get_config` tool — read full config or sub-path | Tool registered; optional `path` param (dotted) returns sub-tree | Read tool, no `identityRef` |
| Must | **FR-8**: `outputSchema` on `set_config` returns Zod-style discriminated union | `{ok: true, applied: string[]}` or `{ok: false, errors: ZodIssue[]}`; both `structuredContent` and serialized `content[].text` present per MCP 2025-06-18 spec | Forward-compat error shape (G7) |
| Must | **FR-9**: `applyConfigPatch` shared write primitive in `@inkeep/open-knowledge-server` | Single function consumed by HTTP endpoint, MCP tools, and any future caller; uses yaml@2 Document layer to preserve comments | All three surfaces funnel through this |
| Must | **FR-10**: Comment-preserving round-trip via `yaml@2` Document layer | `parseDocument()` → `setIn(path, value)` → `doc.toString()` → atomic tmp+rename write; comments, blank lines, anchors preserved | Per `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` |
| Must | **FR-11**: Server-side validation runs after every patch (full doc, not slice) | Merged result validated against `ConfigSchema.safeParse()`; on failure, no write happens; structured errors returned | Catches cross-field invariants |
| Must | **FR-12**: HTTP `POST /api/config/patch` endpoint registered in `api-extension.ts` route registry | Route at line ~4960; calls `extractAgentIdentity(body)` at entry (attribution sweep test enforces); `{scope, patch}` body; returns `{ok, applied[]}` or `{ok: false, errors[]}` | New multi-error shape — see Decision Log |
| Must | **FR-13**: HTTP `GET /api/config?scope=...&path=...` endpoint | Returns current resolved config sub-tree; `scope` defaults to `'workspace'` | Used by Modal first-open + reload-on-CC1 |
| Must | **FR-14**: CC1 `'config'` channel broadcast on every successful write | `applyConfigPatch` calls `cc1Broadcaster.signal('config')` after write; `SystemDocSubscriber` adds parallel client routing for `'config'` → query invalidation | Live refresh across open surfaces |
| Must | **FR-15**: File watcher detects external edits to `.open-knowledge/config.yml` (workspace + user) and emits CC1 `'config'` | New watcher (chokidar or @parcel/watcher) on the config file paths; debounced 100ms to match CC1; deduped against internal writes via writeTracker pattern | New code; not part of existing content watcher |
| Must | **FR-16**: `ok config validate` CLI subcommand | `new Command('config').addCommand(new Command('validate'))`; loads config; validates; exit 0 on success, non-zero with multi-line errors on failure; `--cwd` flag inherited | Tier 1 (P3, P5) |
| Must | **FR-17**: `ok init` scaffolds magic comment at the top of generated `config.yml` | `CONFIG_YML_CONTENT` constant in `packages/cli/src/content/init.ts:5` gets a new line BEFORE the existing `# Open Knowledge — workspace configuration` header: `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge/dist/config-schema.json`. Existing `# Schema reference: packages/cli/src/config/schema.ts` prose comment stays (human-readable hint for editors without LSP). | Tier 1 (P3); both directives coexist (LSP directive on line 1, human comment in body) |
| Must | **FR-25**: Settings UI exposes an "Integrations" section with an "Install in Claude Desktop" row that opens the existing `InstallInClaudeDesktopDialog`. Hidden on Linux (no Claude Desktop) per Tim's FR10 in `specs/2026-04-24-skill-dual-track-install/SPEC.md`. | Row labeled "Install in Claude Desktop" in the Integrations section; click opens `<InstallInClaudeDesktopDialog>` (already imported); detection via `window.okDesktop?.detectClaudeDesktop?.()` (Electron) or always-show (web). Fulfills Tim's D13 destination — Help submenu + HelpPopover + CommandPalette entries from #318 remain as secondary entry points for discoverability. | Cheap addition; reuses existing dialog component; honors Tim's original D13 placement intent |
| Must | **FR-18**: Build step emits `dist/config-schema.json` from `z.toJSONSchema(ConfigSchema, {target: 'draft-07'})` | New `build:schema` npm script; chained into `build`; emits valid JSON Schema draft-07; shipped via npm `files: ['dist']` | Tier 1; powers magic-comment + SchemaStore |
| Must | **FR-19**: SchemaStore PR submitted | One-time PR to `SchemaStore/schemastore` adds catalog entry: name, description, url (unpkg-hosted), fileMatch `['**/.open-knowledge/config.yml','**/.open-knowledge/config.yaml']` | Tier 1 (P3) — one-time external work |
| Must | **FR-20**: Settings menu item hidden/disabled in Electron Navigator window | `mode === 'navigator'` → don't render menu entry; or render disabled with tooltip "Open a project to access settings" | NG7 alignment |
| Should | **FR-21**: Per-field "Reset to default" works on every field with a Zod default | Walker-side: detect `.default()` wrapper; render reset icon; clicking writes the default value | Polish item |
| Should | **FR-22**: Inline field documentation surfaced from Zod `.describe()` calls | Hover/popover on each field shows the `.describe()` text | Reuses same source as MCP per-field descriptions + IDE hover |
| Should | **FR-23**: Modal layout responsive (mobile + desktop browsers) | shadcn Dialog handles responsive sizing | Standard shadcn behavior |
| Could | **FR-24**: Local UI prefs (theme, editor mode, pin) surfaced in same Settings dialog | Separate "Preferences" tab; reads/writes localStorage; clearly demarcated as browser-local vs project | See OQ — storage-class split |

### Non-functional requirements

- **Performance**: Modal first-open <200ms (single GET); per-field auto-save commit <100ms (single POST + yaml roundtrip on small file); CC1 propagation <500ms end-to-end (100ms debounce + WS hop + re-render).
- **Reliability**: Atomic file writes via tmp+rename. No partial writes ever land on disk. Validation always precedes write (server-side as final safety net).
- **Security/privacy**: `POST /api/config/patch` and `GET /api/config` use `checkLocalOpSecurity` (loopback + Host-header + DNS-rebinding gate) — same precedent as `/api/local-op/*`. Config is per-machine state; never exposed to non-loopback clients.
- **Operability**: CC1 'config' broadcasts logged; errors structured (existing `[CC1]` bracket-prefix convention); `applyConfigPatch` errors logged with `bridge-merge-content-loss` analog if comment preservation fails.
- **Cost**: One MCP tool added (~600-800 tokens of context). One new HTTP endpoint. One new CC1 channel. One new file watcher. ~150 LoC for the schema walker; ~300 LoC for the Modal renderer; ~50 LoC for `applyConfigPatch`; ~100 LoC for the validate CLI command. Total: ~600 LoC + Modal UI.

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

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Storage stays YAML on disk; `yaml@2` Document layer for round-trip | T | LOCKED | Yes | Comment preservation requires Document AST; `js-yaml` disqualified | `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` | All write paths use `parseDocument` + `setIn` + `toString` |
| D2 | Zod schema is the single source of truth; `z.toJSONSchema()` is export side-product | T | LOCKED | Yes | Bridge ecosystem consolidated on Zod v4 native; reverse direction is codegen-only | `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md` | All consumers (MCP `inputSchema`, IDE schema, form walker) derive from one Zod source |
| D3 | Single MCP `set_config` upsert tool with deep-partial input | T | LOCKED | Yes | 2-6 tools/server optimum; per-domain explosion violates MCP design | `reports/config-edit-paths/REPORT.md` D4 | Future per-section tools would be additive; can't easily refactor away |
| D4 | Custom shadcn form walking Zod schema (no form library) | T | LOCKED | No | RJSF/JSON Forms drop `.refine()`; react-formgen alpha; ~150 LoC walker for our scale | `reports/config-edit-paths/evidence/d3-form-libraries.md` | Walker is ours to maintain; offsets external dependency risk |
| D5 | All three CRUD surfaces funnel through `applyConfigPatch` shared write primitive | X | LOCKED | Yes | Single source of validation truth; cascade via CC1 to all surfaces | VS Code `ConfigurationEditingService` precedent | Adding new surfaces is mechanical (just call applyConfigPatch) |
| D6 | CC1 'config' channel for external-edit refresh | T | LOCKED | No | Reuses existing `__system__` push primitive | `evidence/codebase-integration-points.md` §5 | Adds one channel literal; SystemDocSubscriber routing update |
| D7 | Modal UI shape: shadcn `<Dialog>` overlay | P | DIRECTED | No | Already installed; multiple precedents (CloneDialog, NewItemDialog); modal blocks editor underneath cleanly | `evidence/codebase-integration-points.md` §1 | Could swap to `<Sheet>` or page route later if needed |
| D8 | Auto-save with per-control commit (matches VS Code Settings UI) | P | LOCKED | No | Dissolves dirty-state-vs-external-edit conflict; matches well-known precedent | VS Code `ConfigurationEditingService` | No Save button; field commits on blur (text) or change (boolean/select) |
| D9 | Per-field Reset to default (hover icon, VS Code pattern) | P | DIRECTED | No | Cheap; covers "undo my mistake" without global undo stack | VS Code Settings UI | Walker must detect `.default()` wrappers per field |
| D10 | Block writes while invalid (validate-before-commit) | P | DIRECTED | No | Matches form-library pattern; keeps disk clean; instant feedback | RJSF/JSON Forms canonical pattern | Server-side safeParse is final safety net |
| D11 | Scope: workspace + user-global, both via Modal scope picker | P | LOCKED | Yes | Honors "Electron users never use CLI" principle; user-global is real today | Investigation: `loader.ts:67-98` reads both | Modal needs scope tabs; HTTP/MCP take `scope` param; OK becomes first writer to `~/.open-knowledge/config.yml` |
| D12 | Bundle Tier 1 (SchemaStore + magic-comment + `ok config validate`) into this spec | P | DIRECTED | No | Same Zod source; same build step; ships value before Modal lands | Stakeholder pref | ~3-4 incremental days; no new spec/audit overhead |
| D13 | CLI command name: `ok config validate` (not `ok validate config`) | T | LOCKED | Yes (CLI consumers) | Per-domain top-level commands is the dominant pattern; no umbrella in surveyed cohort | `evidence/validation-cli-patterns-3p.md` | Future siblings: `ok validate-links`, etc. — peer commands |
| D14 | Error shape contract: `{path: (string\|number)[], message, code, severity?}` (Zod-style) | T | LOCKED | Yes (CLI + MCP consumers) | Reusable across config/links/frontmatter validators; matches Zod `.path` natively | `evidence/validation-cli-patterns-3p.md` cross-cutting | All future validators adopt this; precedent for `errors[]` array (vs current `error: string`) |
| D15 | `runConfigValidation()` lives in `@inkeep/open-knowledge-server` (not CLI-only) | T | DIRECTED | No | Single source for CLI command + `applyConfigPatch` + future surfaces | `evidence/codebase-integration-points.md` §5-6 | Core/server adopts the validator runner shape |
| D16 | Settings entry hidden in Electron Navigator window | P | LOCKED | No | Navigator has no utility, no contentDir; project-scoped settings have nothing to bind to | `evidence/codebase-integration-points.md` §8 | Renderer checks `mode === 'navigator'` |
| D17 | HTTP endpoints behind `checkLocalOpSecurity` (DNS-rebind + loopback + Host) | T | DIRECTED | No | Config is per-machine sensitive state; matches `/api/local-op/*` precedent | `evidence/codebase-integration-points.md` §6 | Stricter than the `/api/workspace` loopback-only gate |
| D18 | New file watcher for `.open-knowledge/config.yml` (workspace + user) | T | DIRECTED | No | Existing watcher is content-only; external-edit detection is new code | `evidence/codebase-integration-points.md` §9 | One new file watcher subscription; debounced 100ms; CC1 'config' on change |
| D19 | Zod walker uses `schema._zod` introspection with explicit per-tag type-guards + JSON-text editor fallback for unknown tags. Zod pinned to exact `4.3.6`. | T | DIRECTED | No | Empirical: `_zod` is published TypeScript-typed introspection surface in Zod v4 (not "internal" in v3 sense). Pin protects against intra-v4 schema-internals changes. | `node_modules/zod/v4/core/schemas.d.cts` line ~1080 + scan of `_zod:` exports | Walker degrades gracefully on schema constructs we don't yet handle |
| D21 | Settings entry points (final set): (i) HelpPopover entry, (ii) Cmd-, shortcut, (iii) CommandPalette entry, (iv) Electron App menu item ("Settings…" in **macOS app menu** between About and first separator; **File menu** on Windows/Linux). Skip dedicated icon. | P | LOCKED | No (UX additive) | Cmd-, = muscle-memory for known destination; omnisearch = discovery for unknown destination — every surveyed unified-Cmd-K app (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps both. Apple HIG places Settings in the app menu specifically (not Help). HelpPopover covers casual user discovery + web users (no menu bar). CommandPalette entry is forward-compatible (becomes a "Commands" source under future omnisearch). **Diverges from Tim's #318 Help-submenu placement for Install** — different items, different conventions: Install is a custom action (Help is reasonable); Settings is HIG-blessed for the app-name menu. | `evidence/electron-cmdk-omnisearch-3p.md` + Apple HIG + `evidence/tim-precedents-from-main.md` Pattern 4 | All four implementation surfaces wired in v0; integration patterns mirror `InstallInClaudeDesktopDialog` per #318 |
| D22 | Settings UI surfaces Install in Claude Desktop as a row in an "Integrations" section, fulfilling Tim's D13 (`specs/2026-04-24-skill-dual-track-install/SPEC.md:185`) original destination intent. Existing #318 entry points (Help submenu, HelpPopover, CommandPalette) stay as secondary discoverability — no removal. | P | DIRECTED | No | Tim's D13 explicitly placed Install at "Settings panel row (primary)"; Help/CommandPalette were interim because the Settings panel didn't exist. When ours ships, the destination intent fulfills naturally. Reuses existing `<InstallInClaudeDesktopDialog>` component — zero new dialog surface. | Tim's spec D13 + `evidence/tim-precedents-from-main.md` Pattern 4 | Adds FR-25; one row in Integrations section; same hash-trigger pattern |
| D20 (proposed) | Apply VS Code's settings-vs-state topology to OK. User-tunable preferences move to config.yml under a new `userPrefs` section: `userPrefs.theme: 'light' \| 'dark' \| 'system'` and `userPrefs.editorModeDefault: 'wysiwyg' \| 'source'` — both optional with sensible defaults. Per-tab transient UI state (pin, graph panel state) stays in localStorage and NEVER appears in Settings UI. FOUC scripts in `index.html` read localStorage as a first-paint cache; config.yml is authoritative. localStorage `ok-theme-v1` and `ok-editor-mode-v1` keys become derived caches; silent migration on next theme/mode toggle. | T | DIRECTED (pending Q4 confirm) | Yes (schema addition is additive but the precedent is set once) | Matches VS Code's well-thought-through split. Multi-window theme sync becomes free via CC1. Theme toggle latency goes from ~1ms (localStorage) to ~50-100ms (HTTP roundtrip + Zod validate + atomic write) — acceptable for an occasional UX action. See `reports/config-edit-paths/REPORT.md` D5 + the conversation thread that surfaced this. | Resolves Q4 if confirmed; cascades into Modal scope-tab content (user scope tab gets theme + mode fields); Settings UI exposes only config.yml (no separate "Preferences" tab) |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Multi-error response shape `{ok, errors[]}` is new — should we propagate to existing routes (refactor) or only for new ones? | T | P0 | No | Consistency choice; prefer additive (new routes use new shape; existing routes unchanged). Confirm. | Open |
| Q2 | Identity threading semantics: agent-attributed config edits OR admin-style without per-agent attribution? Both call `extractAgentIdentity`; question is whether shadow-repo logs config changes per-agent | X | P0 | No | Investigate: does shadow-repo apply to non-content files? Probably not; config edits would be in pino logs only. Confirm. | Open |
| Q3 | ~~Settings entry-point selection~~ | P | P0 | No | RESOLVED 2026-04-25: ship all four — HelpPopover submenu, Cmd-, shortcut, CommandPalette entry, Electron App menu item. Skip dedicated icon (clutter). Cmd-, and omnisearch are complementary cognitive modes (muscle-memory vs discovery) — every unified-Cmd-K app surveyed (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps both. CommandPalette entry is forward-compatible — becomes a "Commands" source under future omnisearch. Apple HIG requires App menu Settings…. See D21 + `evidence/electron-cmdk-omnisearch-3p.md`. | RESOLVED |
| Q4 | Local UI prefs (theme, editor mode, pin) — VS Code settings-vs-state topology: move user-tunable preferences (theme, editor-mode-default) to config.yml under a new `userPrefs` section; keep transient UI state (pin, graph state) in localStorage and never surface in Settings UI | P | P0 | No | Apply VS Code's well-thought-through split (settings.json = user-tunable; state.vscdb memento = UI state). Adds `ConfigSchema.userPrefs.{theme, editorModeDefault}` (optional). FOUC scripts read localStorage as cache; config.yml is authoritative. Multi-window theme sync becomes free via CC1. See proposed D20. | Open (proposed D20; awaiting confirm) |
| Q10 | Should v0 introduce a fourth config scope `<project>/.open-knowledge/config.local.yml` (gitignored by `ok init`, sits between workspace and ENV in precedence)? | T | P0 | No | Per `reports/config-surfaces-vscode-and-claude-code/REPORT.md` D10: dominant ecosystem pattern (Next.js `.env.local`, lefthook `lefthook-local.yml`, Claude Code `.claude/settings.local.json`); pattern correlates with multi-file merge pipeline (which we have). Notably absent from VS Code (5 community requests since 2017, all backlog). Greenfield: cheap to add now, costly to retrofit. **Recommend (a) add in v0** — gitignored by `ok init`; precedence `defaults → user → workspace → LOCAL → ENV → CLI`; Modal gets a "Just this machine" tab; MCP `set_config` accepts `scope: 'workspace' \| 'user' \| 'local'`. ~50 LoC additional. | Open |
| Q11 | Cross-scope array merge semantics for `folders`: replace (current behavior, VS Code semantic) or merge (Claude Code semantic)? | T | P0 | No | Per `reports/config-surfaces-vscode-and-claude-code/REPORT.md` D6 Choice 2: VS Code arrays *override*; Claude Code arrays *merge*. OK currently REPLACES per `loader.ts:33-48` `deepMerge`. For `folders` specifically, replace surprises users — user-global folder rules vanish whenever workspace defines its own `folders`. **Recommend (b) per-array semantic**: `folders` MERGES (concat + dedup by structural equality); `content.include`/`content.exclude` keep REPLACE (filter-set intent — replace is correct). Other scalar/object fields unchanged. | Open |
| Q5 | ~~Schema walker: Zod v4 internal API (`_zod.def`) vs public `_def`?~~ | T | P0 | No | RESOLVED 2026-04-25: empirical check on `node_modules/zod/v4/core/schemas.d.cts` confirms `_zod: $ZodTypeInternals` is the published TypeScript-typed introspection surface in Zod v4 (the `_def` of v3 was restructured to `_zod.def`). Walker uses `schema._zod` with explicit per-tag type-guards + JSON-text fallback for unknown tags. Pin Zod to exact `4.3.6`. See D19. | RESOLVED |
| Q6 | Folders array editor UX: replace-array (send full array) or add/remove explicit operations? | P | P0 | No | Replace is simpler; matches yaml-doc semantics and JSON Merge Patch. UI shows "+ Add folder" / "× Delete" buttons that internally rewrite the array. | Open |
| Q7 | First-time user UX: opening Settings on a project that has only Zod defaults (no config.yml on disk yet). Show defaults in form; on first edit, create the file? | P | P0 | No | Yes — `applyConfigPatch` writes a fresh file when missing. Confirm UX language ("Create config.yml?" or silent). | Open |
| Q8 | When validation rejects a server-side patch (race, schema drift between client + server): client shows error from server response. Specific UX for `errors[]` rendering — toast, inline per-field, modal? | P | P0 | No | Inline per-field via `errors[].path` mapping; toast for non-pathed errors. | Open |
| Q9 | Should the Modal's "All projects" tab show what fields are *overridden* by the workspace config? (Visual distinction: "this user-global value is overridden by your workspace setting") | P | P2 | No | Deferred to post-v0 polish; pure UX. | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Zod v4.3.6's `z.toJSONSchema()` produces JSON Schema draft-07 output usable by Red Hat YAML LSP, Schema Store, and any future RJSF/JSON Forms consumer | HIGH | Empirical test already done: `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md` (23 test cases on Zod 4.3.6) | Verified | Active |
| A2 | yaml@2 Document layer round-trip preserves user comments + blank lines through `setIn`/`deleteIn`/`toString()` cycles for OK's config shapes | HIGH | `reports/config-edit-paths/evidence/d1-yaml-storage-roundtrip.md` confirmed canonical pattern + production prior art | Verified | Active |
| A3 | Adding a CC1 'config' channel + parallel client routing is mechanical (one line each side) | HIGH | `evidence/codebase-integration-points.md` §5 confirmed | Verified | Active |
| A4 | `ok:menu-action` IPC channel works end-to-end for "Settings…" menu item without new IPC plumbing | HIGH | `evidence/codebase-integration-points.md` §8 — channel exists, preload subscribes, sendToRenderer dispatches | Before implementation | Active |
| A5 | unpkg URL hosting (`https://unpkg.com/@inkeep/open-knowledge/dist/config-schema.json`) is stable enough for IDE schema reference | MEDIUM | Standard npm-package CDN; widely used. Verify URL pattern works on first publish; document fallback (raw GitHub URL) if needed. | Before SchemaStore PR | Active |
| A6 | A new file watcher on `.open-knowledge/config.yml` (workspace + user paths) is cheap (~50 LoC chokidar subscription); deduping against internal writes via writeTracker pattern | MEDIUM | Reuse existing writeTracker pattern from `file-watcher.ts`. Verify chokidar can watch a single file (vs the directory) cleanly. | Before implementation | Active |
| A7 | SchemaStore PR will be accepted within ~1-2 weeks (no stated SLA but "history of accepting most pull requests") | MEDIUM | One-time external dependency; if delayed, the magic-comment fallback still gives users intellisense | Before launch | Active |
| A8 | shadcn Dialog handles long-form responsively (8-section form + nested arrays); no need to switch to Sheet | MEDIUM | Verify with prototype; can switch to Sheet without changing the rest of the architecture | After first prototype | Active |

## 13) In Scope (implement now)

- **Goal**: Ship the three CRUD surfaces (Modal, MCP, CLI/IDE) backed by `applyConfigPatch`, covering both workspace and user-global scope.
- **Non-goals (per §3)**: pluggable validator framework, CRDT routing for config, JSON intermediate format, external link checks, JSON output mode, live concurrent-editor presence, Navigator settings UI, alternate config formats.
- **Requirements with acceptance criteria**: see §6 (FR-1 through FR-20 must-haves).
- **Proposed solution**: see §9.
- **Owner(s)/DRI**: TBD.
- **Next actions** (will become implementation tickets after finalize):
  1. Add `applyConfigPatch` + scope-aware read in `@inkeep/open-knowledge-server`
  2. Add `POST /api/config/patch` + `GET /api/config` to `api-extension.ts` route registry behind `checkLocalOpSecurity`
  3. Add new file watcher for `.open-knowledge/config.yml` (workspace + user) emitting CC1 'config'
  4. Add CC1 'config' subscriber to `SystemDocSubscriber`
  5. Build the Zod-walker + Modal Settings UI in `packages/app`
  6. Wire Settings entry point: HelpPopover submenu, Cmd-, shortcut, Electron menu item via `ok:menu-action`
  7. Register MCP `set_config` + `get_config` tools in `packages/cli/src/mcp/tools/`
  8. Add `commands/config.ts` with `validate` subcommand
  9. Update `CONFIG_YML_CONTENT` template in `packages/cli/src/content/init.ts` with magic-comment line 1
  10. Add `build:schema` step to `packages/cli/package.json` emitting `dist/config-schema.json`
  11. Submit SchemaStore PR
- **Risks + mitigations**: see §14.
- **What gets instrumented/measured**: see §7.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Schema URL stability | Use unpkg pattern; document raw-GitHub fallback | First IDE intellisense session works |
| SchemaStore PR latency | Magic-comment scaffold provides fallback while PR is in flight | Magic-comment alone enables intellisense without SchemaStore |
| User-global file creation (first time) | `mkdirSync(homedir/.open-knowledge, recursive: true)` helper before write | First Modal save to user scope on a fresh machine |
| Multi-version Zod schema drift | Version `dist/config-schema.json` per npm publish; consumers pin to OK version | Old IDE intellisense data doesn't break new config fields |
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
| New `errors[]` shape becomes inconsistent with rest of API (singular `error: string`) | MED | MED | Add comment in api-extension.ts noting the divergence + plan for follow-up consistency pass | TBD |
| Concurrent edits race (rare but possible: agent + UI hit `applyConfigPatch` in same ms) | LOW | LOW | Atomic tmp+rename means one wins; loser's read may produce a stale-base merge that gets caught by validation; CC1 reconciles | TBD |

## 15) Future Work

### Explored
- **Per-field Reset to default works on every Zod-defaulted field** — investigated the walker mechanics; trivial to implement; just polish-tier nice-to-have. Triggers to revisit: post-v0 if users report missing defaults.

### Identified
- **`ok validate-links` (or `ok lint-content`)**: internal wiki-link integrity checking. Mintlify precedent (`mint broken-links`). Same Zod-style error shape (D14). Peer command, not subcommand of `validate`. **What we know**: internal `[[Page]]` references are already indexed (BacklinkIndex); broken-link detection is a query against this index. **Why it matters**: closes the IDE-feedback loop for content authors. **Investigation needed**: integrate with existing BacklinkIndex; CLI flag for "broken links since last commit" or scope by glob.
- **`ok validate-frontmatter`**: validate frontmatter conformance against `folders[].frontmatter` rules. Same error shape. **What we know**: `folders[]` schema already supports per-folder frontmatter requirements. **Why it matters**: enforces the documentation-quality rules users define. **Investigation needed**: integration with file watcher for live validation.
- **Settings UI in Electron Navigator** for global preferences (updater channel, recents cap, default editor mode). Different storage class (electron-store / state.json), not config.yml. **What we know**: Navigator has no utility process; would need Electron-main-process direct fs access. **Why it matters**: "first-launch global setup before opening any project" UX gap. **Investigation needed**: scope split between `state.json` prefs and `~/.open-knowledge/config.yml`.
- **Per-field "Valid Scopes" concept** (Claude Code's `Managed-only fields` + `Project-disallowed` fields; VS Code's `restricted` + `restrictedConfigurations[]` extension array). OK doesn't have credential-helper-shaped fields today (`github.oauthAppClientId` is a public client ID — intentionally shareable). **What we know**: `reports/config-surfaces-vscode-and-claude-code/REPORT.md` D9 documents both products' implementations; threat model is "prevent supply-chain attacks via PRs to a shared workspace config." **Why it matters**: if OK ever adds a credential-helper-shaped field (private token, API key path, sandbox-bypass flag), per-field scope validity becomes load-bearing. **Investigation needed**: schema annotation for `validScopes: ('user' | 'workspace' | 'local' | 'managed')[]`; loader-side enforcement; UI hint when a field is hidden in the wrong scope.
- **Right-click folder in sidebar → "Edit folder defaults…" modal.** Shape A (UX shortcut over `folders[]`) is the only viable shape: data model unchanged, MCP/HTTP surface unchanged, just a focused dialog over the existing primitives. Shape B (new `folderDefaults` data model field) is rejected for schema-duplication; Shape C (per-folder `.frontmatter.yml` files inside content) is rejected by NG10 (OK never pollutes user content). **What we know**: the right-click affordance maps to "find rules in `config.folders[]` matching this path; render frontmatter form; save via `applyConfigPatch` against the correct scope (workspace/user/local from Q10)." Picomatch already in client deps. **Why it matters**: the most natural per-folder UX gesture in any sidebar; doubles as the discoverability path for the `folders` feature. **Investigation needed**: rule-discovery UX for multi-match cases (most-specific rule? all rules with effective merged frontmatter?); identity for update vs add (`match` exact-equality is natural); scope picker (workspace by default; expert option for user-global / local). **Strengthens** the `add_folder_rule` MCP convenience tool entry below — right-click affordance is the primary motivation for that tool.
- **`add_folder_rule` / `set_folder_defaults` MCP convenience tool.** Single-call agent ergonomics for the common `folders[]` operation: agent passes `{path: 'specs/', frontmatter: {...}}`, server handles the get-then-add/update dance. Without it, agents need read-modify-write of the whole `folders[]` array. **Why it matters**: closes the primary agent-ergonomics gap of replace-array semantics (Q6). Becomes load-bearing if right-click-folder Future Work above ships and we want agents to drive equivalent operations. **Investigation needed**: should there be a paired `get_folder_defaults({path})` that returns the effective merged frontmatter (wraps existing `resolveFolderFrontmatter` from `packages/cli/src/content/folder-rules.ts`)? Same affordance class.

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
  - `packages/cli/src/config/` (schema, loader read paths)
  - `packages/cli/src/commands/config.ts` (NEW)
  - `packages/cli/src/content/init.ts` (CONFIG_YML_CONTENT magic-comment)
  - `packages/cli/src/mcp/tools/{set,get}-config.ts` (NEW)
  - `packages/cli/src/mcp/tools/index.ts` (registration)
  - `packages/cli/tsdown.config.ts` + `package.json` (build:schema script)
  - `packages/server/src/config-edit.ts` (NEW: `applyConfigPatch`)
  - `packages/server/src/api-extension.ts` (route additions)
  - `packages/server/src/cc1-broadcast.ts` (channel addition)
  - `packages/server/src/file-watcher.ts` OR new `config-watcher.ts` (NEW)
  - `packages/app/src/components/SettingsDialog.tsx` + walker + child components (NEW)
  - `packages/app/src/components/EditorHeader.tsx` (entry point)
  - `packages/app/src/components/CommandPalette.tsx` (entry point)
  - `packages/app/src/components/SystemDocSubscriber.tsx` (CC1 channel routing)
  - `packages/desktop/src/main/menu.ts` (Settings menu item)
- **EXCLUDE:**
  - `packages/server/src/external-change.ts` (CRDT-only, not config)
  - `packages/server/src/agent-sessions.ts` (CRDT writes, separate semantics)
  - `packages/app/src/editor/` (CRDT editor, not config UI)
- **STOP_IF:**
  - Schema requires migration (renaming or removing fields) — this spec assumes additive changes only
  - Routing config edits through CRDT layer (NEVER per NG2)
  - Adding a JSON intermediate format (NEVER per NG3)
  - Building a pluggable validator framework (NEVER per NG1)
- **ASK_FIRST:**
  - Adding a 3P form library dep (D4 deliberately rejects all four surveyed)
  - Changing the canonical error shape (D14 LOCKED)
  - Adding new HTTP endpoints not behind `checkLocalOpSecurity`
  - Refactoring existing `{ok, error: string}` routes to `{ok, errors[]}` (Q1 — additive only without explicit decision)
