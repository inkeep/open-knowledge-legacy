# Project: Zero-Ceremony Resume

**Last verified:** 2026-04-16
**Traces to:** User direction (session 2026-04-16). Answers [reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md) Open Question #1. Sibling to [[stories/init-and-project-switching]] Part B.
**Appetite:** No formal time-box. Greenfield — speed > rigor where they conflict (user-stated).
**Status:** Phase 3 synthesis complete — ready for spec-level sharpening.

## Strategic context

**Situation.** `ok init` + `ok start` + `ok mcp` + `server.lock` already ship. `init` scaffolds `.open-knowledge/{AGENTS.md, config.yml, cache/, .gitignore}`, writes `.mcp.json` at project root, scaffolds `.claude/launch.json` so Claude Code's `preview_start("open-knowledge")` auto-runs `ok start`. `ok start` assembles Hocuspocus + the React UI into **one** HTTP server, with `server.lock` (`{pid, port, hostname, worktreeRoot}`) advertising port for MCP discovery. `ok mcp` reads that lock and connects — or falls back to disk-only when no live server exists. `get_preview_url`, `write_document`, and `edit_document` already return `previewUrl` in structured responses; the shared helper lives at `packages/cli/src/mcp/tools/preview-url.ts`. Other tools (\~14 of 17 total) do not. (evidence/current-state.md)

**Complication.** Three compounding gaps collapse the "local-first MCP-native" pitch into a "great in Claude Code, degraded elsewhere" reality:

1. **Asymmetric client treatment.** `.claude/launch.json` auto-start is Claude-Code-only. Users on Cursor / Windsurf / Codex / VS Code open their editor, the MCP handshake succeeds, but finds no live `server.lock` — MCP drops to disk-only and writes silently skip the CRDT layer. Prior research ([reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md)) argued against MCP auto-starting because it would fight Claude Code's child-process-kill-on-session-end model. That concern is real — and specifically resolved by **detached** spawn (`detached:true + stdio:'ignore' + unref()`), which prior research did not evaluate. §D4's Open Question #1 ("what about environments where a separate `start` isn't practical?") is what this project answers. (evidence/worldmodel-synthesis.md)
2. **UI URL surfacing is partial.** Three tools emit `previewUrl`; \~14 others don't. Every preview-pane-capable MCP client has to make a second `get_preview_url` round-trip to render the doc an agent just operated on — and for list-producing tools (`search`, `list_documents`, backlink/hub queries), the pane has no way to know which URL to open at all.
3. **Init defaults favor Claude Code.** `runInit` without `--editor` selects `['claude']` only (non-TTY) or opens a TTY prompt preselecting non-Claude entries by config-dir existence. A first-time Cursor user running `bunx @inkeep/open-knowledge init` in a non-TTY shell gets no Cursor MCP config. The cross-client ambition of MCP is undercut at the first command. (evidence/current-state.md)

**The intersection.** Each gap is individually small. Together they produce a "works great in Claude Code" perception for a product whose thesis is any-MCP-client. Story 1 alone (hybrid-spawn) doesn't fix preview panes. Story 2 alone (URL contract) doesn't help users whose server isn't running. Story 3 alone (init defaults) just spreads half-broken UX to more clients. The three must ship as a coherent bundle for the "open editor → KB ready → edits land live" outcome to materialize across clients.

**Resolution.** Three sibling stories bundled into one project because their value only compounds together. Greenfield (no production users) means no backward-compat cost — and this project **also** commits to splitting the UI process out of `ok start` (PQ4), positioning the architecture for a future "global UI, multiple collab servers" step without foreclosing the [[specs/2026-04-11-electron-desktop-app/SPEC]] lifecycle.

### Multi-dimensional value

- **Customer (returning user / new non-Claude user):** open any supported MCP client days after `ok init` → knowledge base is ready without terminal ceremony. Edit / search / preview all work from the first tool call.
- **Platform (MCP response contract):** `previewUrl` becomes the convention **every** docName-producing tool emits, not just 3 of 17. Future MCP tools (e.g., `get_activity`, `get_version_history`) inherit the pattern — one shared helper, one place to update. Load-bearing: third-party MCP integrations over OK's API will consume this field.
- **GTM (multi-client parity):** removes the "Claude-Code-first" perception. Demos, enterprise evaluations, and the "bring-your-editor" positioning all work from the default install.
- **Internal (lifecycle discipline):** the two-process split + shared idle-shutdown primitive + detached-spawn pattern are reusable for Electron desktop lifecycle (when that project lands) and any future background services OK grows.

**Intersection reasoning.** The platform dimension (response contract) **INTERSECTS** customer (auto-preview) because without the contract, every client integration reinvents URL surfacing — fragmentation. Define once, everyone inherits. The GTM dimension (multi-editor init) **INTERSECTS** the customer returning-user UX because Story 1's spawn-on-absent value only materializes for clients that have MCP configured — Story 3 is a **precondition** for Story 1 delivering to non-Claude users, not just a parallel polish item.

### Bet-level non-goals (temporally tagged)

- **\[NEVER in this project] Global UI app (machine-wide, serving multiple collab servers).** User's stated direction; deferred to future bet. This project ships per-project UI + per-project collab — the split positions the next bet but doesn't attempt it. Revisit when: cross-project UI-switching UX demand emerges (sibling bet [[stories/init-and-project-switching]] Part B may trigger).
- **\[NEVER in this project] MCP Apps iframe as primary UI surface.** Worldmodel confirms iframes are complex-editor-hostile. User brief explicitly wants localhost browser pane. (evidence/worldmodel-synthesis.md)
- **\[NOT NOW] Windows platform support.** Node detached-spawn has known bugs on Windows ([nodejs/node#5614](https://github.com/nodejs/node/issues/5614), [#51018](https://github.com/nodejs/node/issues/51018)); Open Knowledge doesn't target Windows as primary today. Scope to macOS + Linux; document the gotchas in Story 1 spec. Revisit when: Windows user demand measurable OR Electron lifecycle needs it.
- **\[NOT NOW] Project registry / cross-project switcher.** Sibling bet [[stories/init-and-project-switching]] Part B. Revisit when: v0 ships and users have multiple projects.
- **\[NOT NOW] Onboarding UX (welcome screen, empty-state CTA).** Owned by [[projects/day-0-editor-completeness]] ED-4. Revisit when: that project sequences ED-4.
- **\[NOT NOW] User-global **`~/.claude/.mcp.json`** fallback.** User-locked PQ2. Revisit when: uncommitted / personal KB demand emerges.
- **\[NOT NOW] Process supervisor / systemd / launchd auto-restart.** Revisit when: field telemetry shows server crashes recurring.
- **\[NEVER] Cross-machine shared lockfiles.** Trust model fundamentally different.

## Items

| ID   | Item                                                                                                                                                                                                          | Type          | Priority | Status      | Notes                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PQ1  | Decomposition: 3 sibling stories (Lifecycle, UI URL contract, Init defaults)                                                                                                                                  | Product       | P0       | **Decided** | LOCKED. User brief + confirmed 2026-04-16.                                                                                                                                                                                                                                    |
| PQ2  | `.mcp.json` at project root only (no `~/.claude/` fallback)                                                                                                                                                   | Product       | P0       | **Decided** | LOCKED. User brief.                                                                                                                                                                                                                                                           |
| PQ3  | Hybrid spawn model — client-launched preferred; MCP stdio spawns detached as fallback                                                                                                                         | Product       | P0       | **Decided** | LOCKED. Answers [reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../reports/zero-config-bunx-cli-packaging/REPORT.md) Open Question #1. (evidence/worldmodel-synthesis.md)                                                                                           |
| PQ4  | UI + Collab as two processes per project, each with own lockfile in `<contentDir>/.open-knowledge/`                                                                                                           | Product       | P0       | **Decided** | LOCKED 2026-04-16. Per-project split is stepping stone; global UI is future bet (user direction).                                                                                                                                                                             |
| PQ5  | Idle auto-shutdown: 30 min after last client disconnect. Symmetric for UI and collab.                                                                                                                         | Product       | P0       | **Decided** | DIRECTED. Mechanism delegated to spec.                                                                                                                                                                                                                                        |
| PQ6  | Windows platform support                                                                                                                                                                                      | Product       | P0       | **Decided** | LOCKED \[NOT NOW]. macOS + Linux only. Document gotchas. Revisit on demand.                                                                                                                                                                                                   |
| PQ7  | Init default: all detected editors (Claude / Cursor / Windsurf / VS Code)                                                                                                                                     | Product       | P0       | **Decided** | DIRECTED. Story 3 scope. `--editor <specific>` preserves explicit override.                                                                                                                                                                                                   |
| PQ8  | `ok stop` command to explicitly terminate UI + collab                                                                                                                                                         | Product       | P0       | **Decided** | DIRECTED. In Story 1 scope. Low marginal cost; complements idle-shutdown; serves as manual escape hatch if idle-shutdown misbehaves.                                                                                                                                          |
| PQ9  | Appetite                                                                                                                                                                                                      | Product       | P0       | **Decided** | DELEGATED: no formal time-box. Greenfield; speed > rigor.                                                                                                                                                                                                                     |
| PQ10 | Process supervisor / auto-restart                                                                                                                                                                             | Product       | P2       | **Parked**  | \[NOT NOW]. Revisit when field crash telemetry warrants.                                                                                                                                                                                                                      |
| TQ1  | Detached-spawn Node.js recipe: `spawn({detached:true, stdio:'ignore'}).unref()`                                                                                                                               | Technical     | P0       | **Decided** | DIRECTED by worldmodel O6. Applied to both UI + collab spawn paths. (evidence/worldmodel-synthesis.md)                                                                                                                                                                        |
| TQ2  | UI URL response field: extend existing `previewUrl` in `structuredContent` (used by `get_preview_url` / `write_document` / `edit_document`) to all docName-producing tools via shared `preview-url.ts` helper | Technical     | P0       | **Decided** | DIRECTED. Helper already exists; Story 2 wires it into \~14 more tools. (evidence/current-state.md)                                                                                                                                                                           |
| TQ3  | List-producing tools (`search`, `list_documents`, `get_backlinks`, `get_forward_links`, `get_hubs`, `get_dead_links`, `get_orphans`) — per-result `previewUrl` in array                                       | Technical     | P0       | **Decided** | DIRECTED. Each result row gets `{docName, previewUrl, ...}`. Story 2 spec concern; clients choose which to open.                                                                                                                                                              |
| TQ4  | MCP spawn-detection logic: always-spawn when lock absent, with `OK_MCP_AUTOSTART=0` env opt-out                                                                                                               | Technical     | P0       | **Decided** | DIRECTED. Editor-specific detection rejected as brittle. `OK_MCP_AUTOSTART=0` lets Claude Code users who prefer `launch.json` fully opt out. Default on.                                                                                                                      |
| TQ5  | Port coordination under concurrent `ok mcp` spawns (N projects, N simultaneous spawns)                                                                                                                        | Technical     | P0       | **Assumed** | HIGH confidence existing `server.lock` handles this. Verify by: multi-project stress test in Story 1 acceptance. (evidence/worldmodel-synthesis.md)                                                                                                                           |
| TQ6  | UI app entry point post-split                                                                                                                                                                                 | Technical     | P0       | **Decided** | DIRECTED: new top-level command `ok ui` (symmetric with `ok start`). Discoverable via `--help`. MCP spawns `ok ui` alongside `ok start` (or via a single `ok up` that invokes both — TBD in spec).                                                                            |
| TQ7  | `.claude/launch.json` update                                                                                                                                                                                  | Technical     | P0       | **Decided** | DIRECTED: launch.json's `runtimeArgs` updated by Story 1 to also start UI (either `['open-knowledge', 'up']` or chained `[start, ui]`). `init.ts:145` port hardcode verified + corrected as part of Story 1.                                                                  |
| TQ8  | Two-MCP-clients race on cold spawn (both see no lock, both spawn)                                                                                                                                             | Technical     | P0       | **Decided** | DIRECTED: relies on `ServerLockCollisionError` + bounded retry with jitter. MCP stdio polls lockfile for \~5s after spawn attempt; loser retries once then connects to winner's server.                                                                                       |
| XQ1  | Shared idle-shutdown primitive (UI + collab symmetric)                                                                                                                                                        | Cross-cutting | P0       | **Decided** | DIRECTED. Helper in `@inkeep/open-knowledge-server`. Signature: `attachIdleShutdown({ onClientConnected, onClientDisconnected, thresholdMs, onShutdown })`. Hocuspocus `onConnect`/`onDisconnect` hooks for collab; WebSocket connection tracking for UI (or HTTP keepalive). |
| XQ2  | §D4 (prior "don't auto-start") explicit supersession                                                                                                                                                          | Cross-cutting | P0       | **Decided** | DIRECTED. Story 1 spec includes "Prior decision revisited" section citing §D4 + detached-spawn rationale. PR description links both.                                                                                                                                          |
| XQ3  | MCP response contract backward-compat when extending `previewUrl` to more tools                                                                                                                               | Cross-cutting | P0       | **Assumed** | HIGH. MCP spec (2025-11-25) says clients ignore unknown fields in structured content. Verify by: smoke-test against Claude Code + Cursor + Windsurf in Story 2 acceptance.                                                                                                    |
| XQ4  | Electron non-regression                                                                                                                                                                                       | Cross-cutting | P2       | **Parked**  | Two-process split (PQ4) aligns with [[specs/2026-04-11-electron-desktop-app/SPEC]] J1 direction. No action. Confirm during PR review.                                                                                                                                         |
| XQ5  | CC1 broadcaster as liveness signal (alternative to lockfile polling)                                                                                                                                          | Cross-cutting | P2       | **Parked**  | Worldmodel S5. \[NOT NOW]; Story 1 uses lockfile polling unless it proves insufficient.                                                                                                                                                                                       |
| XQ6  | `bun run dev` monorepo workflow compat                                                                                                                                                                        | Cross-cutting | P0       | **Decided** | DIRECTED: verify Vite plugin participates in BOTH lockfiles (collab + UI) OR keep a dev-only bundled mode as monorepo fallback. Story 1 acceptance.                                                                                                                           |

**Score:** 20 Decided, 0 Exploring, 0 Open, 1 Assumed (HIGH), 3 Parked. Ready for spec-level sharpening.

## Cross-cutting concerns

### CC-A: Lockfile discipline (extends existing `server-lock.ts`)

Covered by: **Story 1** (primary), **Story 2** (reads lock for URL resolution), **Story 3** (N/A).

Post-Story 1, `<contentDir>/.open-knowledge/` holds two lock files: `server.lock` (collab) and `ui.lock` (new). Both follow the existing shape (`{pid, hostname, port, startedAt, worktreeRoot}`), both use `port:0` → kernel-allocation → `update*LockPort` post-listen, both use `isProcessAlive()` stale detection, both released last in CC8 shutdown ordering. **Constraint:** reuse the lock-acquisition primitive; do not fork. A thin factory (`acquireProcessLock({lockName, contentDir})`) generalizes. (evidence/current-state.md)

### CC-B: Orphan-process cleanup (shared idle-shutdown primitive — XQ1)

Covered by: **Story 1** (owns primitive + applies to both UI and collab).

30-minute idle auto-shutdown after last client disconnects — same mechanism for both processes. **Constraint:** implement once as a shared helper; do not duplicate per-process. `ok stop` (PQ8) is the manual escape hatch if idle misbehaves.

### CC-C: MCP response contract — `previewUrl` field

Covered by: **Story 2** (primary), **Story 1** (URL points to spawned UI).

Extending existing convention; shared helper (`packages/cli/src/mcp/tools/preview-url.ts`) already exists. **Constraint:** single-doc tools return `{previewUrl: string|null}`; list-producing tools return per-result `{docName, previewUrl, ...}` in arrays (TQ3). Never invent a new field name. Backward-compat HIGH (XQ3).

### CC-D: Editor parity principle

Covered by: **Story 1** (hybrid-spawn treats all equally), **Story 3** (init default configures all).

Claude / Cursor / Windsurf / VS Code treated identically at every boundary. **Constraint:** no editor-specific code paths in spawn or response logic. The `launch.json` Claude-Code-specific scaffolding remains (it's a Claude Code feature, not a differentiator we added).

### CC-E: Detached-spawn pattern (Node.js)

Covered by: **Story 1**.

Canonical: `spawn(cmd, args, {detached:true, stdio:'ignore'}); child.unref();`. **Constraint:** all three pieces required. Windows gotchas documented but OOS (PQ6).

### CC-F: Greenfield break-free

Covered by: **all 3 stories**.

No production users. `ok start`'s "one HTTP server" contract breaks. `.claude/launch.json` `runtimeArgs` changes (TQ7). **Constraint:** coordinate CLI surface changes across all 3 stories so intermediate commits aren't broken. One coherent release; not phased across weeks.

## Stories

### Now

*Phasing rationale: all 3 stories are Now. **Risk-first** — the core bet's riskiest assumption is that detached-spawn + idle-shutdown delivers reliable resume in the field without orphan accumulation. Story 1 tests it directly; deferring it defers the risk. **Dependency-first** — Story 3 is a precondition for Story 1 delivering cross-client (CC-D intersection). **Value-first (conditional)** — the 3-story bundle's customer value is binary; shipping any subset delivers a partial UX that users would perceive as broken. **Capacity-first** — greenfield, no formal barrel constraint per PQ9; speed pressure favors bundling. **Walking-skeleton test:** Story 1 + Story 3 alone deliver returning-user UX (via second *`get_preview_url`* round-trip for preview pane). Story 2 is the "feels fluent" polish layer — but polish that's load-bearing for the platform dimension. All-3-now passes the "Now delivers standalone value" test because the Now IS the project.*

#### 1. Lifecycle split + MCP-mediated spawn

**What to build.** Split the React UI out of `ok start` into its own process backed by a new `ok ui` command with its own `ui.lock` in `<contentDir>/.open-knowledge/`. Teach `ok mcp` to spawn both `ok start` (collab) and `ok ui` (UI) as detached children when their respective locks are absent, using the canonical Node recipe (`detached:true + stdio:'ignore' + unref()`). Apply a shared 30-min idle auto-shutdown primitive to both processes. Add `ok stop` to terminate both explicitly.

**Value.** Returning users on Cursor / Windsurf / Codex / VS Code (and Claude Code users who disable `launch.json`) reopen their editor days later and the knowledge base is ready — tools work, UI auto-available, no terminal ceremony (customer). The two-process per-project architecture is the stepping stone to the future "global UI + multi-collab" bet without foreclosing it (platform direction — aligns with [[specs/2026-04-11-electron-desktop-app/SPEC]] J1). Removes the "works in Claude Code only" perception for Cursor / Windsurf / VS Code users doing evaluations (GTM). The detached-spawn + idle-shutdown pattern is reusable for Electron lifecycle and any future background services (internal). **Intersection:** customer value only materializes when Story 3 has delivered MCP configs to non-Claude editors — this story and Story 3 are a paired bundle, not independent parallelizable work.

**Constraints.**

- CC-A, CC-B, CC-D, CC-E, CC-F apply.
- Must explicitly supersede §D4 (XQ2) with detached-spawn rationale.
- macOS + Linux only (PQ6); document Windows gotchas but don't test.
- `bun run dev` monorepo workflow must keep working (XQ6) — Vite plugin participates in both lockfiles OR a dev-bundled mode is preserved.
- Two-client cold-spawn race handled via `ServerLockCollisionError` + bounded retry (TQ8).

**Lateral.** Shares lockfile discipline with the future Electron lifecycle. Shares spawn patterns with any future `ok <subservice>` command. Its `.claude/launch.json` update (TQ7) runs alongside Story 3's init-default change — coordinate the CLI surface.

**Forward.** Unblocks: sibling [[stories/init-and-project-switching]] Part B (multi-project registry needs the lockfile conventions this story locks in); future global UI bet (this project establishes per-project UI lockfile shape, next bet moves it to `~/`); future `ok status` / `ok restart` CLI surface.

---

#### 2. `previewUrl` on every docName-producing MCP response

**What to build.** Apply the existing `preview-url.ts` shared helper (already used by `get_preview_url` / `write_document` / `edit_document`) to every other docName-producing MCP tool: `read_document`, `search`, `exec`, `list_documents`, `get_backlinks`, `get_forward_links`, `get_hubs`, `get_dead_links`, `get_orphans`, `get_history`, `rename_document`, `ingest`, `research`, `consolidate`, `init-content`, `rollback-to-version`, `suggest-links`, `save-version`. Single-doc tools return `{..., previewUrl: string|null}` in `structuredContent`; list-producing tools return `{..., results: [{docName, previewUrl, ...}]}` (TQ3).

**Value.** Preview-pane-capable MCP clients render the affected doc on every tool response without a second round-trip — agent writes or reads, user sees it instantly (customer). The convention becomes a **real contract** future tools inherit with zero extra code (platform — load-bearing; third-party MCP integrations over OK's API consume this). Symmetric across all clients; no Claude-Code-specific shortcut (GTM — the convention works in Cursor's built-in browser, Windsurf's preview, VS Code Simple Browser identically). **Intersection:** only delivers customer value when Story 1 has produced a running UI for URLs to resolve against — Story 2's URL is a null if Story 1 hasn't spawned the UI, and the preview pane then has nothing to render. Paired dependency on Story 1, though structurally independent (Story 2 can merge before Story 1 lands; URLs just return null until then).

**Constraints.**

- CC-C, CC-F apply.
- Use the existing shared helper; do not duplicate per-tool.
- Backward-compat HIGH (XQ3); smoke-test against Claude Code + Cursor + Windsurf.
- List-producing tools must not increase response payload size beyond \~2x (response size regression check — shared helper's URL construction is deterministic, adds \~100 bytes per row).

**Lateral.** Depends on Story 1's UI lockfile shape only in that the helper reads the lock to construct the URL — interface already exists. Can ship in either order.

**Forward.** Establishes the pattern every future MCP tool inherits (`get_activity`, `get_version_history`, graph-query tools). Also the pattern third-party MCP integrations over OK's API build against.

---

#### 3. Init default — all detected editors

**What to build.** Change `ok init`'s default editor selection from `['claude']` to all detected editors (Claude / Cursor / Windsurf / VS Code) whose config dir exists on disk. TTY interactive prompt pre-selects all detected (today pre-selects by config-dir-exists + Claude-always). Non-TTY fallback uses all detected (not `['claude']`). `--editor <specific>` preserves explicit override. `--editor all` becomes equivalent to default.

**Value.** New users on Cursor / Windsurf / VS Code get MCP configured on first `bunx @inkeep/open-knowledge init` — no `--editor all` discovery required (customer). **Enables Story 1's value to reach non-Claude users** — without Story 3, Story 1 only benefits clients that already have MCP configured, which is a subset of Open Knowledge's audience (GTM — load-bearing for Story 1's effectiveness). **Intersection:** Story 3 is the **precondition** for Story 1's cross-client value. Alone it's a polish item; as a precondition, it's load-bearing for the whole bet.

**Constraints.**

- CC-D, CC-F apply.
- Existing editor-detection logic (init.ts:530-541) already pre-selects editors whose config dir exists for TTY — generalize to non-TTY default.
- Config-dir-exists heuristic is NOT the same as "user uses this editor" — a config dir may exist from an uninstalled-but-still-configured app. Leave as acceptable false positive (user can opt out in TTY prompt or via `--editor <specific>`).

**Lateral.** None — flag-flip is independent of other stories' code paths. Coordinate CLI surface changes (TQ7 via Story 1) so the release ships coherent changes.

**Forward.** Sets the default future editor support (Zed, JetBrains when they add MCP, etc.) inherits — "newly supported editor in `EDITOR_TARGETS` → pre-selected by default."

### Next

*No stories. The 3-story bundle IS the project. If execution reveals the bundle is too large, candidate split: push Story 2 to Next (URL contract is the "fluent polish" layer; Story 1 + Story 3 alone deliver baseline returning-user value via second *`get_preview_url`* round-trip). Do not split until Phase 2 execution surfaces a concrete scope problem.*

### Later

*No stories. Items parked in PQ10, XQ4, XQ5 surface when their revisit triggers fire.*

## Rabbit holes

- **"Replace **`server.lock`** with a real cross-project registry."** Tempting because PQ4 adds a second lockfile and the sibling bet needs registry infra. Don't — the sibling bet at [[stories/init-and-project-switching]] Part B owns registry scope; this project extends the existing per-contentDir pattern symmetrically. Doing registry work here would entangle two bets and slow both.
- **"Global UI now."** PQ4's answer said direction → future. Greenfield speed pressure may tempt toward "might as well ship global now." Don't — foreclosing the per-project split's stepping-stone property adds risk (URL routing conventions, multi-project coordination) for zero Story-1 customer value.
- **"Electron integration work."** [[specs/2026-04-11-electron-desktop-app/SPEC]] has its own lifecycle model; avoid touching Electron code even though this project's patterns serve it. Let Electron consume these patterns when that project starts.
- **"Windows support because detached-spawn is mostly working."** PQ6 is NOT NOW. Don't silently add Windows testing or attempt to work around [nodejs/node#5614](https://github.com/nodejs/node/issues/5614).
- **"Refactor MCP tool dispatch to auto-inject previewUrl."** Cleaner architecture but huge scope (touches 17 tools' response shapes). Don't — the shared helper per-tool is enough. Resist the "one place to rule them all" framing.
- **"Support arbitrary editors (Zed, JetBrains MCP, etc.)."** Out of scope; Claude / Cursor / Windsurf / VS Code are the 4 editor targets. Adding new editors is a future bet.
- **"Rewrite **`server-lock.ts`** to be generic first, then use it."** The existing code is 189 LOC and works. Extract a factory for Story 1's new lock; don't rewrite what's already shipping. Resist polish-as-refactor temptation.

## Pre-mortem

If this project fails, the most likely causes:

1. **Orphan-process accumulation in the wild.** Idle-shutdown misbehaves (false-idle under heavy background activity OR doesn't fire under hung connection), users accumulate zombies over weeks. Mitigation: ship `ok stop` (PQ8) as manual escape hatch; add `ok status` (future) to list locks on demand; surface idle-timer state in server logs at WARN on threshold approach.
2. **MCP spawn race on cold-start.** Two MCP clients open in quick succession, both find no lock, both spawn. One succeeds; the other gets `ServerLockCollisionError`. Mitigation: TQ8 bounded-retry-with-jitter on `ServerLockCollisionError`; poll for up to 5s for the winner's port to appear. Tested by Story 1's multi-project stress gate.
3. **Response contract backward-compat.** Some MCP client (unknown) strictly validates response shape and rejects unknown fields. Low probability (MCP spec says otherwise) but high blast radius. Mitigation: XQ3 smoke-test against Claude Code + Cursor + Windsurf before Story 2 merges.
4. **§D4 supersession is insufficiently documented.** Future maintainer sees the prior report's "don't auto-start" language, doesn't realize it's been revisited, tries to revert. Mitigation: XQ2 mandates a "Prior decision revisited" section in Story 1 spec + cross-link from [reports/zero-config-bunx-cli-packaging/REPORT.md](../../reports/zero-config-bunx-cli-packaging/REPORT.md) back to this project.
5. `bun run dev`** monorepo workflow breaks.** The Vite plugin currently participates in `server.lock`. If it doesn't participate in the new `ui.lock`, dev workflow diverges from production — silent footgun where dev works but prod doesn't (or vice versa). Mitigation: XQ6 validates both paths in Story 1 acceptance; CI test covers both invocation modes.
6. **First-time MCP spawn fails silently.** Spawn fails (permission denied, port exhausted, detach broken on weird shell), MCP stdio swallows error and drops to disk-only. User sees nothing. Mitigation: MCP spawn path MUST surface spawn-failure in the first tool-result error message the agent attempts; test with deliberately broken spawn in Story 1 acceptance.

What we're assuming (could be wrong):

- **TQ5 ASSUMED HIGH:** per-contentDir `server.lock` handles N concurrent projects cleanly. Worldmodel O8 supports but no stress test exists. Story 1 acceptance gate verifies.
- **XQ3 ASSUMED HIGH:** MCP clients ignore unknown fields per spec. Story 2 smoke-test verifies against 3 real clients.
- **CC-E canonical recipe applies:** `{detached:true, stdio:'ignore'}` + `unref()` is sufficient on macOS and Linux. Worldmodel O6 supports; Story 1 acceptance verifies with a "close parent, confirm child survives" smoke test.

## Implementer's veto (simulation)

A spec-level sharpening process reading this document should know without re-asking:

- ✅ What each story builds (2-3 sentence WHAT per story).
- ✅ Why each matters across 4 dimensions with intersection reasoning.
- ✅ What cross-cutting concerns each touches (CC-A through CC-F).
- ✅ Dependencies (lateral + forward) and sequencing flexibility (Story 1/2/3 structurally independent; value-paired).
- ✅ The §D4 prior decision is superseded, not ignored (XQ2).
- ✅ Platform scope (macOS + Linux; Windows NOT NOW).
- ✅ Which decisions are LOCKED vs DIRECTED vs ASSUMED.

The one question a spec-sharpener might still ask: **exact UX copy for **`ok stop`** and the idle-shutdown log messages.** That's legitimately spec-level — delegate to the implementer.

Implementer's veto: **passes**. Project-grade decomposition complete.

## Evidence & References

### Evidence Files

- [evidence/current-state.md](evidence/current-state.md) — Verified code trace of existing init / start / mcp / server-lock at baseline commit 5dab8683. CONFIRMED: 17 MCP tools total, 3 emit `previewUrl` today (`get_preview_url`, `write_document`, `edit_document`). Shared helper at `packages/cli/src/mcp/tools/preview-url.ts` already exists.
- [evidence/worldmodel-synthesis.md](evidence/worldmodel-synthesis.md) — Landscape discovery (/worldmodel --depth full 2026-04-16). Detached-spawn canonical recipe, §D4 prior decision + revisit rationale, MCP-as-starter prior art, client lifecycle variation.

### Research Reports

- [reports/zero-config-bunx-cli-packaging/REPORT.md](../../reports/zero-config-bunx-cli-packaging/REPORT.md) §D4 — **superseded** by this project with detached-spawn rationale. Answers its Open Question #1.
- [reports/onboarding-multiproject-ux/REPORT.md](../../reports/onboarding-multiproject-ux/REPORT.md) — adjacent (sibling-bet context).
- [reports/ai-coding-tools-embedded-browsers/REPORT.md](../../reports/ai-coding-tools-embedded-browsers/REPORT.md) — MCP Apps iframe non-goal context.
- [reports/mcp-tool-interface-design-agent-performance/REPORT.md](../../reports/mcp-tool-interface-design-agent-performance/REPORT.md) — MCP tool-response shape context.

### External Sources

- [MCP Tools spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — tool response content shape.
- [GitHub Issue #29315 — Claude Code preview URL field](https://github.com/anthropics/claude-code/issues/29315) — preview\_start localhost-only limitation (future concern).
- [nodejs/node#5614](https://github.com/nodejs/node/issues/5614), [nodejs/node#51018](https://github.com/nodejs/node/issues/51018) — Windows detached-spawn gotchas (documented; OOS).
- [Node.js child\_process docs](https://nodejs.org/api/child_process.html) — canonical detached-spawn recipe.

### Upstream Artifacts

- [[stories/init-and-project-switching]] Part B — sibling bet (multi-project registry + switcher). Sibling, not superset.
- [[projects/day-0-editor-completeness]] ED-4 — adjacent (owns onboarding UX). Not re-scoped.
- [[specs/2026-04-11-electron-desktop-app/SPEC]] — adjacent (owns Electron lifecycle). This project's two-process split aligns with but does not implement Electron direction.

