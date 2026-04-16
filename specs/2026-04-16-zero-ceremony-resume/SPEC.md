# Zero-Ceremony Resume — Spec

**Status:** Draft — post-audit, pending final verification
**Owner(s):** TBD (implementer) — product direction from session 2026-04-16
**Last updated:** 2026-04-16
**Baseline commit:** 5dab8683
**Links:**
- Parent project: [../../projects/zero-ceremony-resume/PROJECT.md](../../projects/zero-ceremony-resume/PROJECT.md)
- Evidence (project-level): [../../projects/zero-ceremony-resume/evidence/current-state.md](../../projects/zero-ceremony-resume/evidence/current-state.md), [../../projects/zero-ceremony-resume/evidence/worldmodel-synthesis.md](../../projects/zero-ceremony-resume/evidence/worldmodel-synthesis.md)
- Evidence (spec-local): [./evidence/ui-client-tracking.md](./evidence/ui-client-tracking.md), [./evidence/launch-json-and-port.md](./evidence/launch-json-and-port.md), [./evidence/idle-shutdown-directconnection.md](./evidence/idle-shutdown-directconnection.md)
- Audit trail: [./meta/audit-findings.md](./meta/audit-findings.md), [./meta/design-challenge.md](./meta/design-challenge.md)
- Superseded research: [../../reports/zero-config-bunx-cli-packaging/REPORT.md](../../reports/zero-config-bunx-cli-packaging/REPORT.md) §D4 (answers Open Question #1)
- Sibling bet: [../../stories/init-and-project-switching/STORY.md](../../stories/init-and-project-switching/STORY.md) Part B
- Adjacent: [../2026-04-11-electron-desktop-app/SPEC.md](../2026-04-11-electron-desktop-app/SPEC.md) (Electron lifecycle)

---

## 1) Problem statement

**Situation.** Open Knowledge ships a working CLI: `ok init` scaffolds `.open-knowledge/{AGENTS.md, config.yml, cache/, .gitignore}`, writes per-editor MCP config files (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, `.vscode/mcp.json` for VS Code, `~/.codeium/windsurf/mcp_config.json` for Windsurf — user-global), and scaffolds `.claude/launch.json` so Claude Code's `preview_start("open-knowledge")` auto-runs `ok start`. `ok start` assembles Hocuspocus + the React UI into ONE HTTP server, defaulting to port 3000 (`config/schema.ts:17`), advertising its port via `<contentDir>/.open-knowledge/server.lock` (`{pid, port, hostname, startedAt, worktreeRoot}`). `ok mcp` reads that lock and connects via `ws://localhost:<port>` — or falls back to disk-only when no live server exists. Of 21 MCP tools total, `get_preview_url`, `write_document`, and `edit_document` already return `previewUrl` in structured responses via a shared helper at `packages/cli/src/mcp/tools/preview-url.ts`; the other 18 do not.

**Complication.** Three compounding gaps collapse the "any-MCP-client" pitch into a "great in Claude Code, degraded elsewhere" reality. (1) **Asymmetric client treatment.** Only Claude Code has a `launch.json` auto-start hook; Cursor / Windsurf / Codex / VS Code users opening their editor hit a successful MCP handshake that silently drops to disk-only — writes skip the CRDT layer. Prior research ([reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md)) argued against MCP auto-starting because it would fight Claude Code's child-process-kill-on-session-end model — concern specifically resolved by **detached sibling-process** spawn (`detached:true + stdio:'ignore' + unref()`). §D4's Open Question #1 asked about embedding Hocuspocus **inside** the MCP process; this spec does NOT embed — it spawns a **separate**, detached sibling. That architectural difference (not detachment alone) is what neutralizes §D4's stdio-lifecycle concern: a sibling process has no parent-lifetime dependency on MCP stdio to begin with. (2) **UI URL surfacing is partial** — 3 of 21 tools (~14%) emit `previewUrl`; the other 18 don't. Every preview-pane-capable MCP client has to make a second `get_preview_url` round-trip to render the doc an agent just operated on; list-producing tools (`search`, `list_documents`, backlink/hub queries) offer no URL at all. (3) **Init defaults favor Claude** — non-TTY `ok init` selects `['claude']` only; Cursor/Windsurf/VS Code users have to discover `--editor all`.

**Resolution.** Three sibling user stories shipped as one coherent release. **US-001** splits the React UI out of `ok start` into its own `ok ui` process with a `ui.lock`, teaches `ok mcp` to detach-spawn `ok start` (which auto-spawns UI on cold-start) when the lock is absent (hybrid with `launch.json` + `preview_start` for Claude Code's visible UI launch), applies an idle auto-shutdown primitive keyed on **WebSocket client count only** (DirectConnections excluded) that also SIGTERMs UI on exit, and adds `ok stop` + `ok clean`. **US-002** extends the existing `previewUrl` convention via the shared helper to the 18 docName-producing tools that lack it. **US-003** flips init default from `['claude']` to all detected editors (accounting for each editor's distinct config path). Greenfield means no backward-compat cost; the per-project two-process split is justified on its own merits (cleaner `launch.json` semantics; alignment with Electron lifecycle) rather than as a "direct stepping stone" to global UI — any future global-UI bet will rewrite per-project decisions (URL routing, lock location, lifetime coupling).

## 2) Goals

- **G1:** A user who ran `ok init` ≥1 time prior can open any MCP-capable editor (Claude Code / Cursor / Windsurf / Codex / VS Code) and reach a fully working knowledge base (CRDT writes + preview UI) without opening a terminal. *(Measurable via manual P1 acceptance — telemetry for fleet-wide measurement is Future Work §15 per NG9.)*
- **G2:** Every MCP tool response that operates on a docName includes a `previewUrl` field in `structuredContent` — single-doc tools at top level, list-producing tools per result. *(Measurable: 100% coverage across the 21-tool inventory.)*
- **G3:** `bunx @inkeep/open-knowledge init` on a machine with Cursor / Windsurf / VS Code installed writes their MCP config at the correct per-editor paths by default, not just Claude's. *(Measurable: non-TTY invocation writes to every detected editor's correct config path.)*
- **G4:** Multiple projects on one machine run concurrently without port/lock/orphan-process conflicts. *(Measurable: 3+ `ok mcp` spawns in different `contentDir`s each produce live `{server,ui}.lock` pairs with unique ports and no collisions.)*
- **G5:** No orphaned UI or collab processes accumulate after 24h of normal usage. *(Measurable: `ps | grep open-knowledge` shows zero processes after idle-shutdown threshold passes with zero WebSocket clients.)*

## 3) Non-goals

- **[NEVER]** NG1: **Global UI app (machine-wide, serving multiple collab servers).** User-stated direction; future bet. This spec ships per-project split justified on its own merits (launch.json semantics + Electron alignment), not as a pre-staged global-UI migration. Per-project decisions (URL injection shape, per-contentDir port, lifetime-coupled-to-collab) would all be rewritten for global UI. Revisit: in a follow-up bet after v0 ships.
- **[NEVER]** NG2: **MCP Apps iframe as primary UI surface.** Worldmodel confirmed iframes are ephemeral + state-losing. User brief explicitly wants localhost browser pane.
- **[NEVER]** NG3: **Cross-machine shared lockfiles / registries.** Trust model fundamentally different; lockfiles are local-host only.
- **[NEVER]** NG4: **`.mcp.json` at `~/.claude/` as user-global fallback.** User-locked; project root only for Claude. (Windsurf remains user-global at `~/.codeium/...` — that's Windsurf's own convention, not ours.)
- **[NOT NOW]** NG5: **Windows platform support.** Node detached-spawn has known bugs on Windows ([nodejs/node#5614](https://github.com/nodejs/node/issues/5614), [#51018](https://github.com/nodejs/node/issues/51018)). Spec scopes to macOS + Linux; documents gotchas. Revisit if: Windows demand emerges OR Electron lifecycle needs it.
- **[NOT NOW]** NG6: **Project registry / cross-project switcher.** Owned by sibling bet [[stories/init-and-project-switching]] Part B. Revisit when: v0 ships.
- **[NOT NOW]** NG7: **Onboarding UX (welcome screen, empty-state CTA).** Owned by [[projects/day-0-editor-completeness]] ED-4.
- **[NOT NOW]** NG8: **Process supervisor / systemd / launchd auto-restart.** Revisit if: field telemetry shows recurring crashes.
- **[NOT NOW]** NG9: **Telemetry infrastructure to measure M1 (terminal-free resume rate).** OK has no telemetry today (grep: no analytics libs). Manual acceptance only. Revisit when telemetry infra lands.
- **[NOT NOW]** NG10: **`AgentSessionManager` per-session idle cleanup.** Agent sessions hold persistent DirectConnections that accumulate across client reconnects ([meta/design-challenge.md](./meta/design-challenge.md) H4). Not a blocker for zero-ceremony UX (G1 intact — idle-shutdown excludes DirectConnections per D-017 revised). Revisit if: memory profile shows problematic growth, OR agent session lifecycle becomes visible to users.
- **[NOT UNLESS]** NG11: **Changes to `server.lock` JSON schema.** Existing `{pid, hostname, port, startedAt, worktreeRoot}` shape is additive-only here. Only if: some field is proven insufficient.
- **[NOT UNLESS]** NG12: **Reimplementing MCP tool dispatch to auto-inject `previewUrl`.** Per-tool invocation of the shared helper is enough. Only if: per-tool integration proves more error-prone.

## 4) Personas / consumers

- **P1: Returning user on any MCP editor.** Ran `ok init` days/weeks ago; reopens Claude Code / Cursor / Windsurf / Codex / VS Code.
- **P2: New user on non-Claude MCP editor.** First install on Cursor / Windsurf / VS Code.
- **P3: Multi-project user.** 2+ KBs concurrently.
- **P4: Agent operator.** LLM agent calls tools; expects `previewUrl` in responses.
- **P5: Implementer / future maintainer.** Must not regress the §D4 supersession; D-003 documents the architectural distinction (detached sibling ≠ embedded).
- **P6: Terminal-first user.** Types `ok start` manually; expects both processes up.

## 5) User journeys

### P1 — Returning user (Claude Code)

- **Happy path:**
  1. User opens Claude Code in a project `ok init`ed 10 days ago.
  2. Claude Code reads `.mcp.json` → invokes `npx @inkeep/open-knowledge mcp`.
  3. MCP stdio reads `server.lock`: absent. `OK_MCP_AUTOSTART != 0`. Spawns `ok start` detached; polls `server.lock` for port (≤5s).
  4. `ok start` checks `ui.lock`: absent → spawns `ok ui` detached. UI attempts bind port 3000; respects `PORT` env var if set by Claude Code's `autoPort:true`.
  5. User clicks preview (or agent returns `previewUrl`) → Claude Code's `preview_start` invokes `launch.json` entry → runs `ok ui` → sees live `ui.lock` → exits 0 with "UI already running at http://localhost:<port>". Claude Code connects to the port Claude Code resolved via autoPort OR the `ui.lock.port` (verification planned — OQ-1.4).
  6. First tool call succeeds; response includes `previewUrl`; preview pane renders.
- **Failure / recovery:** MCP spawn failure surfaces in first tool-result via kernel-captured stderr (D-018 revised, M7). `preview_start` collision with MCP-spawned UI → `ok ui` exits 0; port is live.
- **Debug:** `cat .open-knowledge/{server,ui}.lock`. `ok status` lists live.

### P1 — Returning user (Cursor / Windsurf / Codex / VS Code)

- **Happy path:**
  1. Editor reads its MCP config (per-editor path — see FR-3.1) → invokes MCP stdio.
  2. MCP stdio spawns `ok start` detached (→ which auto-spawns `ok ui`).
  3. Polls `server.lock` for port (≤5s); connects.
  4. Tool response → `previewUrl` → Cursor's/Windsurf's built-in browser opens.
- **Failure / recovery:**
  - Spawn ENOENT / EACCES → kernel-captured stderr surfaces in first tool-result error (M7).
  - Port 3000 taken → `autoPort:true` in launch.json path finds free port (Claude only); non-Claude clients: `ok ui`'s `--port` flag fallback or config.yml setting.
  - `OK_MCP_AUTOSTART=0` env OR `mcp.autoStart: false` config → disk-only with helpful hint.

### P3 — Multi-project user

Two editors/projects → two `<contentDir>/.open-knowledge/{server,ui}.lock` pairs → unique ports → independent idle-shutdown.

### P4 — Agent operator

All 21 docName-producing tools emit `previewUrl` (or per-result arrays). Preview pane renders without second round-trip.

### P5 — Implementer / future maintainer

Reads §1, §9, §10 D-003 carefully. Understands: §D4 OQ#1 was about embedding Hocuspocus inside MCP process; this spec does sibling-process detached spawn. Different architectures — the sibling doesn't have a parent-lifetime dependency on MCP stdio at all, so Claude Code's kill-on-session-end is orthogonal.

### P6 — Terminal-first user

`ok start` → collab + auto-spawns UI. `ok stop` → SIGTERM both. `ok clean` → prune stale locks (separate from stop per M9).

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `ok mcp` connect | "MCP: no running instance — spawning..." (stderr) | n/a | "OK: spawn failed: {stderr from kernel redirect}" | `ws://localhost:<port>` | lock exists, port=0 → poll timeout |
| `ok start` auto-spawn UI | `ui.lock.port=0` briefly | n/a | kernel-captured stderr in `ok-ui-spawn-error.log` | `ui.lock.port=3000` (or PORT env), UI reachable | collab up, UI failed — `previewUrl` null |
| Idle shutdown | "N min remaining" (WARN at 25min WebSocket-idle) | n/a | n/a | clean exit; collab SIGTERMs UI as final step | DirectConnection present but no WebSocket clients → still fires (D-017 revised) |
| MCP response `previewUrl` | n/a | `null` | n/a | valid URL | `ui.lock.port=0` → null |
| `ok init --editor all` | n/a | n/a | "editor X config: permission denied" | all detected editors written at correct paths | some editors missing config dir — skipped silently |
| `ok ui` solo lock collision | n/a | n/a | n/a | "UI already running at http://localhost:<port>"; exit 0 | stale lock → replace, bind |
| `ok stop` / `ok clean` | n/a | "no running processes" | fail on kill EPERM | both SIGTERM'd (`stop`); stale locks pruned (`clean`) | one live / one stale → handle each |

## 6) Requirements

### Functional requirements — US-001: Lifecycle split + MCP-mediated spawn

| ID | Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| FR-1.1 | Must | Add `ok ui` top-level Commander command serving the React UI with its own `ui.lock` at `<contentDir>/.open-knowledge/ui.lock`. Default port 3000; respects `PORT` env var (set by Claude Code's `autoPort:true`); `--port` flag overrides. | `ok ui` binds port 3000 by default; if `PORT` env set, binds that; writes `ui.lock` via shared factory; graceful SIGINT/SIGTERM releases lock. Lock collision with live pid: prints "UI already running at http://localhost:<port>" exit 0. Stale lock: replaced. | TQ6, D-010, D-021 revised, D-022. |
| FR-1.2 | Must | Extract UI asset serving from `ok start` — `ok start` serves Hocuspocus (WebSocket + API + content filter) only. `ok start` default port changes to `0` (kernel-allocated); config schema default updated from `3000`. | Post-change: `curl http://<start-port>/` returns 404 or API-only. `curl http://localhost:<ui-port>/` returns React app. `config/schema.ts:17` default = `0`. | PQ4, D-021 revised (port separation). |
| FR-1.3 | Must | Abstract lockfile acquisition into shared factory `acquireProcessLock({lockName, contentDir, metadata})` used by both lockfiles. | Both call sites use factory; existing `server.lock` tests pass; factory handles port:0 sentinel, `isProcessAlive`, `ServerLockCollisionError`, ownership-guarded `updatePort`. | CC-A. Factory in `@inkeep/open-knowledge-server`. |
| FR-1.4 | Must | `ok mcp` spawns `ok start` detached when `server.lock` absent/stale AND (`OK_MCP_AUTOSTART != 0` AND `config.mcp.autoStart != false`). Spawn stderr captured via kernel `stdio: [ignore, ignore, <temp-fd>]` redirect; on 5s poll timeout, MCP reads temp file and surfaces stderr in first tool-result error. | Integration test: no lock → spawn succeeds; timeout → error message contains actual stderr content. ENOENT/EACCES → clear error. | TQ1, TQ4, TQ8, D-009 revised, D-018 revised (M7), D-023. |
| FR-1.5 | Must | MCP spawn does NOT directly spawn `ok ui`. UI is spawned indirectly via `ok start`'s auto-spawn (FR-1.9). | Integration test: MCP spawns `ok start` in dir with no `ui.lock`; after 5s, BOTH `server.lock` AND `ui.lock` are live. | D-023. |
| FR-1.6 | Must | `attachIdleShutdown({ webSocketClientCount, thresholdMs, onShutdown, log })` counts **WebSocket clients ONLY** (not DirectConnections). Attach to `ok start`'s `httpServer.on('upgrade')` handler at the `/collab` path; maintain own counter; decrement on `ws.close`. Threshold 30 min. On shutdown, send SIGTERM to `ui.lock.pid` as final step before releasing `server.lock`. | With 0 WebSocket clients for 30 min (even if CC1 DirectConnection + agent sessions still open): collab logs WARN at 25min, INFO at shutdown, SIGTERMs UI, releases server.lock. WebSocket reconnect within threshold resets timer. DirectConnection count has zero effect on the timer. | XQ1, D-017 revised (from H1/F-006), D-030 (OQ-A7 resolved). |
| FR-1.7 | Must | Add `ok stop` command: read both locks; SIGTERM live pids; DO NOT touch stale locks. Failure to kill live pid surfaces as non-zero exit. | `ok stop` with both locks live: terminates both; logs. `ok stop` with no live locks: "no running processes" exit 0. `ok stop` with EPERM on kill: exit 1 with message. Stale locks remain for `ok clean`. | PQ8, D-005 revised (stop ≠ clean per M9). |
| FR-1.7b | Must | Add `ok clean` command: scan both locks; for each, if `isProcessAlive == false` OR JSON is corrupt, remove the lock file. Does NOT kill live processes. | `ok clean` with all stale: removes both locks, reports "pruned 2 stale locks." With mix live/stale: prunes only stale, leaves live. With only live: "no stale locks." | D-024 revised (M9). |
| FR-1.8 | Must | Update `scaffoldLaunchJson` to scaffold `runtimeArgs: ['@inkeep/open-knowledge', 'ui']`, `port: 3000`, **`autoPort: true`**. Migration only on `--force`. | Fresh `ok init`: launch.json has correct runtimeArgs + port + autoPort. `init.ts:144` hardcode updated (line confirmed via audit F-LOW). | TQ7, D-020, D-031 (M7/H2). |
| FR-1.9 | Must | `ok start` auto-spawns `ok ui` as detached child if `ui.lock` absent or stale. If live, logs "UI already running at port <N>" and does not spawn. | Integration test: `ok start` in fresh dir → both processes up. `ok start` with pre-existing live `ui.lock` → only collab starts. | D-023, D-025. |
| FR-1.10 | Must | Explicit "Prior Decision Revisited" subsection in §10 Decision Log (D-003) clarifying: §D4's Open Question #1 proposed **embedding Hocuspocus inside the MCP process**; this spec answers it with **detached sibling-process spawn** — a different architecture. Detachment alone doesn't resolve §D4; the fact that ok-start is a SIBLING (no parent-lifetime dependency on MCP stdio) does. | §10 D-003 clearly distinguishes embedding vs sibling-spawn. Linked bidirectionally from [reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md) and this spec. | XQ2, F-007 audit finding. |
| FR-1.11 | Must | macOS + Linux only. Document Windows gotchas. | README note + CI macOS+Linux only. | PQ6, D-006. |
| FR-1.12 | Must | `bun run dev` monorepo workflow continues to work. | Full `packages/app/tests/integration/` passes. | XQ6, A4. |
| FR-1.13 | Must | `ok ui` serves a `/api/config` endpoint returning `{collabUrl: string | null, previewUrl: string}`. React app calls it on mount and uses the returned `collabUrl` for `HocuspocusProvider`. No `window.__*` globals. | React app's boot: GET `/api/config` → `{collabUrl: "ws://localhost:<port>/collab"}` → provider configured. With absent `server.lock`: `collabUrl: null`; React shows "connecting — collab unreachable" state. | NEW post-M8 challenger finding. Replaces earlier `window.__OK_COLLAB_URL__` design. |
| FR-1.14 | Should | `ok status` command prints live lock state. | `ok status` → `{server: {pid, port, alive}, ui: {pid, port, alive}}`. | L11. |
| FR-1.15 | Must | MCP auto-spawn opt-out: **both** env var AND config setting. Env var `OK_MCP_AUTOSTART=0` wins over config `mcp.autoStart: false`; either disables spawn. | Integration tests cover both paths. Config flag persists across shells; env var is per-session. | D-009 revised, M6. |

### Functional requirements — US-002: `previewUrl` on every docName-producing MCP response

| ID | Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| FR-2.1 | Must | Every single-doc-producing MCP tool includes `previewUrl: string | null` in `structuredContent`. Tool inventory (21 total, 3 existing + 18 to add): | Single-doc tools getting `previewUrl`: `read_document`, `rename_document`, `ingest`, `research`, `consolidate`, `rollback-to-version`, `suggest-links`, `save-version`, `get_history`. Integration tests assert field presence + shape. | TQ2, D-007, F-001 audit correction. |
| FR-2.2 | Must | Every list-producing MCP tool includes per-result `previewUrl: string | null` in array entries. | List tools: `search`, `list_documents`, `exec`, `get_backlinks`, `get_forward_links`, `get_hubs`, `get_dead_links`, `get_orphans`, `init-content`. Each row: `{docName, previewUrl, ...}`. | TQ3, D-008. |
| FR-2.3 | Must | `previewUrl` is `null` when `ui.lock` absent / stale / port:0. | All tools graceful-degrade when UI down. Clients MUST accept null. | Graceful degradation. |
| FR-2.4 | Must | Shared helper at `packages/cli/src/mcp/tools/preview-url.ts` reads `ui.lock` (not `server.lock`). URL shape: `http://localhost:<ui-port>/#/<docName>` per-segment `encodeURIComponent` (existing at `preview-url.ts:33-56`). | Helper returns `{url, source: 'env'|'lock'|'config'}` where 'lock' reads `ui.lock`. Existing 3 tools migrate; behavior unchanged (URL still points at UI server). | TQ2, D-007, D-015, D-016. Sequencing: Story 2 depends on Story 1's `ui.lock` existing; bundled per D-013. |
| FR-2.5 | Must | Smoke-test `previewUrl` field against Claude Code + Cursor + Windsurf clients. | Integration harness; no schema-validation rejects. | XQ3, A2 (MEDIUM — MCP spec SEP-1624 still clarifying; F-008 calibration). |
| FR-2.6 | Should | List-producing tool responses include top-level `ui: {baseUrl, port}`. | Low marginal cost. | Optional. |

### Functional requirements — US-003: Init default — all detected editors

| ID | Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| FR-3.1 | Must | Non-TTY `ok init` (no `--editor`) defaults to writing MCP config for ALL detected editors at their correct paths. | Non-TTY: writes to every editor whose config dir exists. Per-editor paths: **Claude → `<cwd>/.mcp.json`** (project root); **Cursor → `<cwd>/.cursor/mcp.json`**; **VS Code → `<cwd>/.vscode/mcp.json`**; **Windsurf → `~/.codeium/windsurf/mcp_config.json`** (user-global — Windsurf's own convention). Editors without config dir: skipped silently. | PQ7, F-003 audit correction. |
| FR-3.2 | Must | TTY-interactive `ok init` pre-selects all detected editors. | Today's init.ts:540 preselects Claude + detected. Change: all detected including Claude pre-selected. | D-013. |
| FR-3.3 | Must | `--editor <specific>` + `--editor all` preserved. | `--editor cursor` → only Cursor. `--editor all` → all 4 regardless of detection. | Unchanged. |
| FR-3.4 | Must | "No editors detected" fallback — non-TTY exits 1; TTY shows all 4 unselected with hint. | Per D-019 session decision. | D-019. |
| FR-3.5 | Should | `--editor` help text updated. | `ok init --help` reflects new default. | Docs. |

### Non-functional requirements

- **Performance:** MCP spawn p50 ≤ 3s, p99 ≤ 8s (cold bunx cache warm). `previewUrl` construction ≤ 1ms. Idle check resolution 60s.
- **Reliability:** No leaks at 24h (G5). Spawn failures surface via kernel-captured stderr. Idle-shutdown MUST NOT fire if any WebSocket client active in last 30 min.
- **Security:** Lockfile shape unchanged, no secrets. `OK_MCP_AUTOSTART=0` OR `config.mcp.autoStart: false` opt-out. Detached-spawn stdio kernel-redirect to temp file (D-018 revised — M7) — not inherited from parent.
- **Operability:** Log spawn attempts, WebSocket connects/disconnects, idle WARN / INFO, opt-out usage. `ok status`. Spawn-failure stderr in `<contentDir>/.open-knowledge/last-spawn-error.log` (kernel-captured, not child-written — M7).
- **Cost:** No new infra. ~80MB collab, ~40MB UI.

## 7) Success metrics & instrumentation

- **M1: Terminal-free resume rate.** Manual P1 acceptance only. (NG9 defers telemetry-backed measurement.)
  - **Target:** ≥ 95% across all clients per manual test.
- **M2: `previewUrl` coverage.** 3/21 today (~14%); target 21/21 (100%).
- **M3: Orphan-process count at 24h.** Manual: `ps | grep open-knowledge` after 24h normal usage.
  - **Target:** 0.
- **M4: Spawn failure rate.** Manual during acceptance.
  - **Target:** ≤ 1% normal conditions; all failures surface in tool-result.
- **What we log/trace:** spawn attempts, lock acquisitions, idle-shutdown firings, WebSocket client count transitions, opt-out invocations.

## 8) Current state (how it works today)

- **Summary:** One HTTP server per project (`ok start`). Default port 3000 (`config/schema.ts:17`). `ok mcp` discovers via `server.lock` (5 fields: `{pid, hostname, port, startedAt, worktreeRoot}`). 3 of 21 MCP tools emit `previewUrl`; 18 don't. Init non-TTY default `['claude']`. Per-editor MCP config paths: Claude `.mcp.json`, Cursor `.cursor/mcp.json`, VS Code `.vscode/mcp.json`, Windsurf `~/.codeium/windsurf/mcp_config.json`.
- **Key constraints:**
  - `server-lock.ts` battle-tested.
  - Existing `preview-url.ts` helper (`packages/cli/src/mcp/tools/preview-url.ts:33-56`) reads `server.lock`; URL shape `{base}/#/<docName>`; per-segment `encodeURIComponent`.
  - Hocuspocus `getConnectionsCount()` includes DirectConnection (verified in challenger H1); CC1 broadcaster at `standalone.ts:861` + AgentSessionManager hold persistent DirectConnections.
  - `onConnect`/`onDisconnect` hooks: NOT wired in `packages/server/src/` (verified by grep; was incorrectly "CONFIRMED" in evidence — F-005 fix).
- **Known gaps:**
  - `init.ts:144` hardcodes `port: 3000` in launch.json scaffold (line confirmed).
  - No test for concurrent `ok start` in multiple `contentDir`s (A1).
  - OK has no telemetry infrastructure.

See [evidence/current-state.md](../../projects/zero-ceremony-resume/evidence/current-state.md) for full trace at baseline commit `5dab8683`.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:**
  - New: `ok ui` (default port 3000, respects `PORT` env).
  - New: `ok stop` (live-only kill).
  - New: `ok clean` (stale-only prune — separated from `ok stop` per M9).
  - New: `ok status` (state inspection).
  - Modified: `ok start` — collab only; default port **0** (kernel); auto-spawns UI.
  - Modified: `ok init` — default all detected editors; launch.json → `ok ui` with `autoPort: true`.
- **MCP tool surface:** 18 additional tools emit `previewUrl` (or per-result arrays).
- **Config files:** Written per editor-specific path (see FR-3.1). `.claude/launch.json` runtimeArgs + `autoPort: true` added.
- **UI:** Served by `ok ui`. React app fetches `/api/config` on mount for `collabUrl`.
- **Docs:** README update — Windows note; `ok stop` + `ok clean` + `ok status`; per-editor init paths.
- **Error messages:**
  - "OK: spawn failed — {stderr from kernel redirect}" (first tool result).
  - "OK: server not running. Set `OK_MCP_AUTOSTART=1`, `config.mcp.autoStart: true`, or run `ok start`."
  - "UI already running at http://localhost:<port>" (ok ui lock collision).
  - "No MCP-capable editors detected..." (init edge).
  - "Pruned N stale locks" (ok clean).

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/collab` (WebSocket) | `ok start` | CRDT sync post-split; also triggers idle counter decrement on `ws.close` |
| `/api/*` (existing) | `ok start` | `/api/document`, `/api/agent-write*`, etc. still respond |
| `/api/config` | `ok ui` | NEW — returns `{collabUrl}`; React reads on mount |
| `/` (HTML root) | `ok ui` | Static index.html — NO script injection (M8 correction) |
| `/assets/*` | `ok ui` | Static |
| `/<docName>` (SPA hash) | `ok ui` | `/#/<docName>` preview URLs |

### System design

#### Architecture overview

```
<contentDir>/
└── .open-knowledge/
    ├── config.yml              (now supports mcp.autoStart: boolean)
    ├── AGENTS.md
    ├── cache/
    ├── server.lock             ← collab (ok start) — port 0 (kernel)
    ├── ui.lock                 ← UI (ok ui) — port 3000 default
    └── last-spawn-error.log    ← kernel-captured stderr on spawn failure

Flow on `ok mcp` handshake (non-Claude client, cold):

  MCP client → spawns `ok mcp` stdio
    ├─▶ reads server.lock: absent
    ├─▶ OK_MCP_AUTOSTART != 0 AND mcp.autoStart != false
    ├─▶ spawn(npx ok start, {detached, stdio:[ignore, ignore, tempFd]}).unref()
    │     ├─▶ acquireServerLock → port:0 → listen(0) → updateServerLockPort
    │     ├─▶ reads ui.lock: absent
    │     └─▶ spawn(npx ok ui, {detached, stdio:[ignore, ignore, tempFd]}).unref()
    │           └─▶ acquireUiLock → listen(3000 or PORT env) → updateUiLockPort
    ├─▶ polls server.lock for port>0 (≤5s)
    ├─▶ timeout → reads tempFd → surfaces in first tool-result error
    └─▶ success → ws://localhost:<collab>/collab
```

#### Lockfile factory (FR-1.3)

```typescript
// packages/server/src/process-lock.ts (new)
export function acquireProcessLock(opts: {
  lockName: 'server' | 'ui';
  contentDir: string;
  metadata: Pick<ProcessLockRecord, 'worktreeRoot' | 'startedAt'>;
}): { lockDir: string; release: () => void; updatePort: (port: number) => void };
```

#### Idle-shutdown primitive — WebSocket-only (FR-1.6 revised per H1/F-006)

```typescript
// packages/server/src/idle-shutdown.ts
export function attachIdleShutdown(opts: {
  httpServer: http.Server;         // to hook 'upgrade' for /collab
  thresholdMs: number;             // 30 * 60 * 1000
  onShutdown: () => Promise<void>; // invokes destroy() + SIGTERM UI
  log?: Logger;
}): { detach: () => void } {
  let webSocketClientCount = 0;
  let timer: NodeJS.Timeout | null = null;

  function resetTimer() {
    if (timer) clearTimeout(timer);
    if (webSocketClientCount === 0) {
      timer = setTimeout(async () => {
        log?.info('idle shutdown firing (0 WebSocket clients, 30 min elapsed)');
        await opts.onShutdown();
      }, opts.thresholdMs);
      // WARN at 25 min
      setTimeout(() => {
        if (webSocketClientCount === 0) log?.warn('idle shutdown in 5 min');
      }, opts.thresholdMs - 5 * 60 * 1000);
    }
  }

  const onUpgrade = (req: http.IncomingMessage, socket: Duplex) => {
    if (!req.url?.startsWith('/collab')) return;
    webSocketClientCount++;
    if (timer) { clearTimeout(timer); timer = null; }
    socket.once('close', () => {
      webSocketClientCount--;
      resetTimer();
    });
  };
  opts.httpServer.on('upgrade', onUpgrade);

  resetTimer();  // start timer (0 clients)

  return {
    detach: () => {
      opts.httpServer.off('upgrade', onUpgrade);
      if (timer) clearTimeout(timer);
    }
  };
}

// Usage in ok start:
attachIdleShutdown({
  httpServer,
  thresholdMs: 30 * 60 * 1000,
  onShutdown: async () => {
    const uiLock = readUiLock(lockDir);
    if (uiLock && isProcessAlive(uiLock.pid)) {
      process.kill(uiLock.pid, 'SIGTERM');
    }
    await destroy();
  },
});
```

**Key property:** DirectConnections (CC1 broadcaster, AgentSessionManager) are invisible to this primitive. WebSocket upgrade at `/collab` is the sole signal.

#### MCP spawn call site with kernel stderr redirect (FR-1.4 revised per M7)

```typescript
// packages/cli/src/commands/mcp.ts
import fs from 'node:fs';
async function ensureServerRunning(contentDir: string): Promise<string | undefined> {
  if (process.env.OK_MCP_AUTOSTART === '0') return undefined;
  if (config.mcp?.autoStart === false) return undefined;

  const lockDir = resolveLockDir(contentDir);
  const existing = readServerLock(lockDir);
  if (existing?.port > 0 && isProcessAlive(existing.pid)) {
    return `ws://localhost:${existing.port}`;
  }

  const stderrPath = join(lockDir, 'last-spawn-error.log');
  const stderrFd = fs.openSync(stderrPath, 'w');
  const child = spawn('npx', ['@inkeep/open-knowledge', 'start'], {
    detached: true,
    stdio: ['ignore', 'ignore', stderrFd],
    cwd: contentDir,
  });
  child.unref();
  fs.closeSync(stderrFd);  // child now owns fd

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await sleep(100);
    const lock = readServerLock(lockDir);
    if (lock?.port > 0) return `ws://localhost:${lock.port}`;
  }

  const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf-8').trim() : '';
  throw new Error(`OK: server did not start within 5s.${stderr ? ` stderr:\n${stderr}` : ''}`);
}
```

#### `/api/config` endpoint (FR-1.13 revised per M8)

```typescript
// ok ui HTTP handler
app.get('/api/config', (_req, res) => {
  const serverLock = readServerLock(lockDir);
  res.json({
    collabUrl: serverLock?.port ? `ws://localhost:${serverLock.port}/collab` : null,
  });
});
```

React app's `provider-pool.ts` fetches this on mount; retries if `collabUrl` is null.

#### `ok ui` lock-collision handler — unchanged

```typescript
try {
  const lock = acquireProcessLock({ lockName: 'ui', contentDir, metadata });
} catch (err) {
  if (err instanceof ServerLockCollisionError) {
    const existing = readUiLock(lockDir);
    console.log(`UI already running at http://localhost:${existing.port}`);
    process.exit(0);
  }
  throw err;
}
```

#### Data flow / shadow paths

- **Shadow paths:**
  - Absent / port=0 / corrupt / spawn-timeout / cold-spawn-race / partial failure — all handled per state matrix.
  - **Idle-shutdown under active subagent:** DirectConnection from agent-sessions doesn't block WebSocket-count-based timer. If WebSocket clients are 0 for 30 min, shutdown fires — and agent session state is lost. Acceptable per G1 priority (zero-ceremony UX > long-idle agent persistence). Documented as NG10.
  - **`ok ui` collision under Claude Code `preview_start`:** exit 0 + message. OQ-1.4 runtime verification remains.

#### Failure modes

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| MCP spawn `ok start` | ENOENT / EACCES | kernel stderr → tempfile → MCP reads | First tool-result error includes stderr | Clear error |
| `ok start` auto-spawn `ok ui` | Port 3000 busy (non-autoPort path) | kernel stderr → log | Collab up; UI failed; `previewUrl` null | Agent tools work; preview broken until port freed |
| Cold-spawn race | Two MCPs spawn | `ServerLockCollisionError` loser | Bounded retry + jitter | None |
| Idle-shutdown | Fires with DirectConnection active | By design — WebSocket count is 0 | Agent session state lost | NG10 explicit |
| `ok ui` solo collision | Lock live | Handler exits 0 | — | None |
| Claude Code preview_start on collision | `ok ui` exits 0 | OQ-1.4 runtime test | Fallback: idle-process placeholder if exit-0 rejected | None or minor |

### Alternatives considered

Per [meta/design-challenge.md](./meta/design-challenge.md) + [meta/audit-findings.md](./meta/audit-findings.md):

- **Option A: MCP stdio embeds Hocuspocus (§D4 OQ#1).** Rejected — reproduces stdio-lifetime kill risk. Also contradicts modularity: MCP stdio is short-lived-per-session; Hocuspocus is long-lived-per-project. Different lifetimes → separate processes.
- **Option B: Keep single-process `ok start`; MCP spawns it.** Rejected — `launch.json` pointing at collab wouldn't have the UI visible in preview pane. Also forecloses independent scaling.
- **Option C: Per-project UI lock in `~/.open-knowledge/projects/<slug>/ui.lock`.** Rejected — registry dependency.
- **Option D: No auto-start; invest in `launch.json` for every MCP client.** Rejected — only Claude has equivalent.
- **Option E: Heartbeat file for UI idle detection.** Rejected — tying UI lifetime to collab (D-017) is simpler.
- **Option F: Aggregator `ok up`.** Rejected — Claude Code tracks top-level pid; child propagation is uncertain.
- **Option G: Two separate launch.json entries.** Rejected — preview pane cluttered.
- **Option H: `ok start` = collab only; MCP spawns both.** Rejected per user choice — manual `ok start` should start both.
- **Option I: Total-connection-count idle (original FR-1.6).** Rejected per H1/F-006 — CC1 DirectConnection prevents firing.
- **Option J: Port 3000 hardcoded for all.** Rejected per H2 — use `autoPort:true` + port:0 for collab.
- **Option K: `window.__OK_COLLAB_URL__` HTML injection.** Rejected per M8 — `/api/config` endpoint cleaner; less React app coupling.
- **Option L: `ok stop` combined with stale-lock prune.** Rejected per M9 — separate `ok clean` for hygiene.
- **Chosen:** Hybrid detached sibling-process spawn; WebSocket-only idle; `/api/config` endpoint; two separate utility commands.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D-001 | Hybrid spawn model | P | **LOCKED** | No | Worldmodel D3 | PROJECT PQ3 | FR-1.4 |
| D-002 | Two processes per project, each with own lockfile | P | **LOCKED** | No | User direction | PROJECT PQ4 | FR-1.1, FR-1.2, FR-1.3 |
| D-003 | **Prior Decision Revisited — §D4 supersession via sibling spawn (not embedding).** §D4 OQ#1 suggested embedding Hocuspocus inside MCP process; this spec spawns a **detached sibling process**. The architectural distinction is what matters: siblings have no parent-lifetime dependency on MCP stdio, regardless of detachment. Claude Code's kill-on-session-end therefore cannot affect `ok start`. | X | **LOCKED** | No | Embedded-child + detached stdio could still be killed when child's process group gets signaled; sibling in a different process group is independently alive | §D4 OQ#1; canonical Node detach recipe; F-007 audit correction | FR-1.10; guards against P5 revert |
| D-004 | 30-min idle auto-shutdown | T | **DIRECTED** | No | User choice | PROJECT PQ5 | FR-1.6 |
| D-005 | `ok stop` — live-kill only (M9 split from prune) | P | **DIRECTED** | No | Single responsibility; `ok clean` separately handles stale | Session M9 | FR-1.7 |
| D-006 | macOS + Linux only | P | **LOCKED** | No | Node Windows detach gotchas | PROJECT PQ6 | FR-1.11 |
| D-007 | Extend existing `previewUrl`; shared helper | T | **LOCKED** | Yes (additive) | Convention established | PROJECT TQ2 | FR-2.1, FR-2.4 |
| D-008 | List tools: per-result `previewUrl` | T | **DIRECTED** | No | | PROJECT TQ3 | FR-2.2 |
| D-009 | MCP auto-spawn opt-out: env AND config (M6) | T | **DIRECTED** | No | Both session-scoped and persistent escape hatches | M6 | FR-1.15 |
| D-010 | `ok ui` as new top-level command | T | **DIRECTED** | No | | PROJECT TQ6 | FR-1.1 |
| D-011 | ~~launch.json starts both~~ | — | **SUPERSEDED** | — | Superseded by D-020 | F-011 audit | — |
| D-012 | Cold-spawn race: `ServerLockCollisionError` + retry | T | **DIRECTED** | No | | PROJECT TQ8 | FR-1.4 |
| D-013 | Init default = all detected editors | P | **DIRECTED** | Yes | Cross-client parity | PROJECT PQ7 | FR-3.1 |
| D-014 | Native `Write` for worktree artifacts | X | **ASSUMED** | No | Session-specific | Session | All worktree writes |
| D-015 | URL shape `{base}/#/<docName>` per-segment encoded | T | **LOCKED** | Yes | Existing `preview-url.ts:33-56` | CONFIRMED | FR-2.4 |
| D-016 | `previewUrl` absolute URLs | T | **LOCKED** | Yes | Existing helper | CONFIRMED | FR-2.1, FR-2.2 |
| D-017 | **UI idle tied to collab via WebSocket count only (H1/F-006 fix).** `attachIdleShutdown` counts WebSocket upgrades at `/collab`, NOT `hocuspocus.getConnectionsCount()`. DirectConnections (CC1 broadcaster, AgentSessionManager) explicitly excluded. | T | **LOCKED** | No | Verified: `Hocuspocus.getConnectionsCount()` includes DirectConnection; permanent CC1 connection at `standalone.ts:861` would prevent idle-shutdown forever | [meta/design-challenge.md](./meta/design-challenge.md) H1; [meta/audit-findings.md](./meta/audit-findings.md) F-006; [evidence/idle-shutdown-directconnection.md](./evidence/idle-shutdown-directconnection.md) | FR-1.6 |
| D-018 | **Spawn stderr via kernel `stdio` redirect to tempfile (M7 upgrade from child-written log).** Parent sets `stdio: ['ignore', 'ignore', <fd>]`; captures child's stderr at OS level. Survives child crash before writeable user-space log. | T | **DIRECTED** | No | Kernel-level fd inheritance survives child crashes; child-written log requires child to survive long enough to write | M7 challenger; Node fs.openSync | FR-1.4 |
| D-019 | `ok init` TTY + zero detected: show all 4 unselected with hint | P | **DIRECTED** | No | Preserves escape hatch | Session | FR-3.4 |
| D-020 | `.claude/launch.json` → single entry `['@inkeep/open-knowledge', 'ui']` | T | **LOCKED** | No | UI is what preview pane renders | [evidence/launch-json-and-port.md](./evidence/launch-json-and-port.md); session | FR-1.8 |
| D-021 | **Port model (revised per H2/F-002): `ok ui` default=3000 + `autoPort:true`; `ok start` default=0 (kernel-allocated).** Claude Code's autoPort:true finds a free port and passes `PORT` env var. Both processes independently discoverable via lockfiles. | T | **LOCKED** | No | `autoPort:true` verified at https://code.claude.com/docs/en/desktop; `config/schema.ts:17` `ok start` default changes to `0` | Official Claude Code launch.json docs; H2 challenger; F-002 audit | FR-1.1, FR-1.2, FR-1.8 |
| D-022 | `ok ui` lock collision → exit 0 with message | T | **DIRECTED** | No | Cooperate with already-running UI | Synthesis | FR-1.1 |
| D-023 | `ok start` auto-spawns UI when `ui.lock` absent | T | **DIRECTED** | No | Manual UX + MCP spawn symmetry | User answer | FR-1.9 |
| D-024 | `ok clean` separate from `ok stop` (M9) | T | **DIRECTED** | No | Single responsibility | M9 challenger | FR-1.7b |
| D-025 | `ok ui` safety-net 12h self-shutdown | T | **DIRECTED** | No | Crash case backstop | [evidence/ui-client-tracking.md](./evidence/ui-client-tracking.md) | FR-1.6 |
| D-026 | M1 telemetry deferred | P | **LOCKED** | No | No telemetry infra | Grep: no analytics | NG9, §7 |
| D-027 | **`/api/config` endpoint (M8 revision of `window.__OK_COLLAB_URL__`).** `ok ui` serves GET `/api/config` returning `{collabUrl}`. React app fetches on mount; no HTML injection. | T | **DIRECTED** | Yes (React-side contract) | Cleaner API-shape than injected globals; easier to extend; survives index.html caching | M8 challenger | FR-1.13 |
| D-028 | **A2 MCP spec confidence lowered to MEDIUM (F-008).** "MCP clients ignore unknown fields in structuredContent" remains plausible but SEP-1624 is still clarifying. Smoke-test gate preserved. | X | **ASSUMED MEDIUM** | No | F-008 audit | F-008 | A2 |
| D-029 | **H4 agent-session cleanup is OUT of scope; Future Work Identified.** Idle-shutdown ignores agent DirectConnections; doesn't leak from UX perspective. Per-session memory growth acknowledged but not-blocking. | P | **LOCKED** | No | User confirmation 2026-04-16 | H4 challenger | NG10 |
| D-030 | **OQ-A7 resolved: DirectConnection IS counted by Hocuspocus `getConnectionsCount()`; we don't use that method.** FR-1.6 bypasses it entirely with `httpServer.on('upgrade')`. | T | **LOCKED** | No | Challenger H1 + auditor F-006 independently verified | H1, F-006 | FR-1.6 |
| D-031 | `autoPort: true` added to launch.json scaffold | T | **DIRECTED** | No | Port 3000 graceful fallback when busy | Official Claude Code docs | FR-1.8 |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan / action | Status |
|---|---|---|---|---|---|---|
| OQ-1.4 | Claude Code `preview_start` behavior when launched subprocess exits code 0 quickly (lock-collision path) — treat as success, retry, or error? | T | P0 | No | Manual test against current Claude Code. Fallback: idle-process-placeholder. autoPort's PORT env var suggests Claude Code re-resolves port after spawn; exit-0 may still work if port is live. | **Open (runtime-verifiable at implementation)** |

All other prior OQs resolved via D-015 through D-031.

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Existing `server.lock` handles N concurrent projects cleanly | HIGH | Stress test: 5 concurrent `ok mcp` spawns across 5 content dirs | Before Story 1 merge | Active |
| A2 | MCP clients ignore unknown fields in `structuredContent` (SEP-1624 clarifying — MEDIUM per F-008) | MEDIUM | Smoke test against Claude Code + Cursor + Windsurf | Before Story 2 merge | Active |
| A3 | Detached-spawn + unref severs parent-child lifetime on macOS + Linux (Node ≥ 18, Bun) | HIGH | Integration test: parent spawn → parent exit → child alive 10s later | Before Story 1 merge | Active |
| A4 | `bun run dev` adapts to two-process split without regressing app test suite | MEDIUM | Vite plugin investigation + full test pass | During Story 1 | Active |
| A5 | Claude Code `preview_start` tolerates subprocess exit-0 (OQ-1.4) | MEDIUM | Manual test with current version | Before OQ-1.4 resolved | Active |
| A6 | MCP spawn p50 ≤ 3s cold-start | MEDIUM | Instrument spawn timing | Before merge | Active |
| A7 | **RESOLVED (D-030):** Hocuspocus `onConnect/onDisconnect` hooks for DirectConnection — we no longer depend on this. FR-1.6 uses raw WebSocket upgrade count. | N/A | Not applicable | — | **Resolved** |

## 13) In Scope (implement now)

- **Goal:** Ship US-001 + US-002 + US-003 as coherent release (bundled per D-013 / user H3 confirmation).
- **Non-goals:** §3.
- **Requirements:** §6.
- **Proposed solution:** §9.
- **Owner:** TBD.
- **Next actions:**
  1. Lockfile factory (FR-1.3).
  2. `ok ui` entry point + FR-1.1 + FR-1.2 + FR-1.13 (`/api/config`).
  3. Idle-shutdown primitive (FR-1.6) — WebSocket-count based per D-017 revised.
  4. `ok stop` (FR-1.7) + `ok clean` (FR-1.7b) + `ok status` (FR-1.14).
  5. `ok start` auto-spawn UI (FR-1.9) + port default change to 0 (FR-1.2).
  6. MCP spawn wiring with kernel stdio redirect (FR-1.4 + D-018) + dual opt-out (FR-1.15).
  7. `.claude/launch.json` update with `autoPort:true` (FR-1.8).
  8. §D4 "Prior Decision Revisited" prose + cross-link (FR-1.10).
  9. `previewUrl` generalization to 18 tools (FR-2.1, FR-2.2) + helper migration to `ui.lock` (FR-2.4) + smoke test (FR-2.5).
  10. Init default flip + per-editor path corrections (FR-3.1, FR-3.2, FR-3.4).
  11. Multi-project stress test (A1).
  12. `bun run dev` compat (A4).
  13. OQ-1.4 manual test against Claude Code (A5).
- **Risks + mitigations:** §14.
- **Instrumentation:** §7.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| Per-editor `.mcp.json` paths | Unchanged (Claude) + other editor-specific paths | Existing configs keep working |
| `.claude/launch.json` migration | `ok init --force` rewrites with new runtimeArgs + autoPort | Integration test |
| `ok start` port default change (3000 → 0) | Breaking change; users who relied on 3000 for collab must update — document in README | Manual regression test |
| `bun run dev` | Plugin adapts or dev-bundled mode | App test suite passes |
| `server.lock` shape (`startedAt` already present) | No change | Unchanged |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Orphan processes if WebSocket tracking buggy | Medium | High | `ok stop`/`ok clean` manual; WARN at 25min-idle; `ok status` | Implementer |
| Cold-spawn race | Medium | Low | `ServerLockCollisionError` + retry | Implementer |
| MCP response schema reject | Low-Medium | High | A2 MEDIUM confidence; smoke test 3 clients | Implementer |
| §D4 supersession reverted | Medium | High | D-003 explicit + bidirectional cross-link with prior report | Implementer, reviewer |
| `bun run dev` silent breakage | Medium | Medium | A4 test | Implementer |
| Spawn fails silently | Low-Medium | High | D-018 kernel stderr redirect (M7) | Implementer |
| Claude Code rejects exit-0 on collision | Medium | Medium | A5/OQ-1.4 test; idle-process fallback | Implementer |
| Port 3000 conflict (non-Claude clients don't have autoPort) | Medium | Medium | `ok ui --port N` flag fallback; document | Implementer |
| `ok start` port default change breaks existing users | Low (greenfield) | Medium | README note; error on 3000 if it's not what users expect | Implementer |
| Agent DirectConnection accumulation | Low | Low-Medium | NG10 documented Future Work; not blocking | — |
| List-producing tools double response size | Low | Low | Helper deterministic | Implementer |

## 15) Future Work

### Explored

- **Global UI app (machine-wide, multiple collabs).** Direction set, deferred. Per-project decisions (URL injection, per-contentDir port, SIGTERM-coupled lifetime) will be rewritten for global UI — framing revised per H5 (not a direct stepping stone).
- **Windows support.** Detach-spawn gotchas. Revisit when demand emerges or Electron lifecycle lands.
- **Agent-session idle cleanup (NG10).** Extending `attachIdleShutdown` to close inactive agent sessions after N minutes. Doesn't block zero-ceremony UX. Investigation: read `agent-sessions.ts` for session lifecycle + memory profile; profile growth under realistic usage.

### Identified

- **Cross-project registry + switcher.** Sibling bet [[stories/init-and-project-switching]] Part B.
- **Telemetry for M1.** Opt-in CLI telemetry; design TBD.
- **Process supervisor / auto-restart.** Revisit with field crash telemetry.

### Noted

- **CC1 broadcaster as liveness signal** — alternative to lockfile polling. Parked.
- **Onboarding UX** — owned by day-0-editor-completeness ED-4.
- **MCP Apps iframe** — ecosystem may evolve.
- **User-global `~/.claude/.mcp.json`** — user-locked away.

## 16) Agent constraints

- **SCOPE:**
  - `packages/cli/src/commands/{mcp,start,init,ui,stop,clean,status}.ts` (new: ui/stop/clean/status; modified: mcp/start/init)
  - `packages/cli/src/mcp/tools/*.ts` (18 handlers + `preview-url.ts` shared helper)
  - `packages/server/src/{server-lock,process-lock,idle-shutdown,ui-lock}.ts` (new + refactor)
  - `packages/server/src/standalone.ts` (remove static asset serving; wire idle-shutdown via `httpServer.on('upgrade')`)
  - `packages/cli/src/commands/editors.ts` (already correct — per-editor paths)
  - `packages/cli/src/content/init.ts` (launch.json `runtimeArgs` + `autoPort:true`)
  - `packages/cli/src/config/schema.ts` (`port` default 3000 → 0; add `mcp.autoStart: boolean`)
  - `packages/app/src/editor/provider-pool.ts` (fetch `/api/config` on mount for `collabUrl`)
  - Test additions
- **EXCLUDE:**
  - `packages/server/src/persistence.ts`
  - `packages/server/src/{server-observers,server-observer-extension}.ts`
  - `packages/server/src/agent-sessions.ts` (NG10 out of scope)
  - `packages/core/src/**`
  - Electron spec code paths
  - Registry / switcher (sibling bet)
  - Global UI work
- **STOP_IF:**
  - `server.lock` JSON schema change required (NG11).
  - Idle-shutdown primitive proves unreliable on macOS or Linux.
  - A1 (multi-project lock) or A3 (detach-spawn) refuted.
  - OQ-1.4 resolves with Claude Code rejecting exit-0 → fallback to idle-process-placeholder before merging.
  - DirectConnection accumulation forces H4 in-scope — consult before scope growth.
- **ASK_FIRST:**
  - New 3P dependencies.
  - MCP tool response shape changes beyond `previewUrl`.
  - `.open-knowledge/` directory layout beyond new `ui.lock` + `last-spawn-error.log`.
  - `bun run dev` plugin architecture rewrites.
  - Changes to `preview-url.ts` URL shape (D-015 LOCKED).
