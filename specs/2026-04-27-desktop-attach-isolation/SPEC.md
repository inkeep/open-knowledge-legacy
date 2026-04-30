---
title: "Desktop Attach Isolation — Don't attach the editor to MCP-spawned servers"
status: Draft
owner(s): Andrew
created: 2026-04-27
updated: 2026-04-27
baseline_commit: 30a42966
---
# Desktop Attach Isolation — Spec

**Status:** Draft
**Owner(s):** Andrew
**Last updated:** 2026-04-27
**Baseline commit:** `30a42966`

> _Superseded 2026-04-30 by [`specs/2026-04-29-mcp-shim/SPEC.md`](../2026-04-29-mcp-shim/SPEC.md): the implemented shared-server model keeps `OK_LOCK_KIND` for lock classification, but removes `OK_PARENT_PID`, `parentPid`, and the parent-death watcher. Idle-shutdown is now the only teardown trigger; the MCP-spawn/parent-death requirements below are retained as historical design context, not live behavior._

**Links:**

- Prior art: [[reports/orphan-process-prevention/evidence/process-enumeration]] (the 11-orphan tally that motivated this)
- Related precedents: [[PRECEDENTS]] #25 (writer-ID taxonomy), and the server.lock contract in [[packages/server/src/server-lock]]
- Originating session: live diagnosis — desktop attached to MCP-spawned `ok start` whose `/collab` WS never `synced`. All 32 docs in `aang` workspace failed with `PreSyncDisconnectError` then `SyncTimeoutError`.

---

## 1) Problem statement

**Situation.** Open Knowledge runs a Hocuspocus collab server (`ok start`) per-contentDir, exclusive via `<contentDir>/.open-knowledge/server.lock`. Two independent components want to be that server:

1. **MCP** — when an LLM agent (Claude Code, Cursor, Codex) attaches its OK MCP for a project, the MCP detach-spawns `ok start` on first tool call so reads/writes go through the live CRDT (`packages/cli/src/mcp/server-discovery.ts:218`). The MCP keeps running for the duration of the agent session.
2. **Desktop** — when the user opens a project window, the Electron main process either spawns its own utility-process server **or** finds an existing `server.lock` and attaches the renderer to that URL (`packages/desktop/src/main/window-manager.ts:339` `tryAttachExistingServer`).

By design, attaching is the right move: one workspace, one server, multiple consumers (MCP + browser tabs + Electron renderers + CLI sibling clients) all multiplex through Hocuspocus. The `runClean` + lock-takeover dance handles stale-lock cases.

**Complication.** Three things conspire to make this fragile.

- **A — MCP-spawned `ok start` writes the same `server.lock` shape as a user-spawned one.** `ProcessLockMetadata` is `{pid, hostname, port, startedAt, worktreeRoot}` — no `kind`, no `parentPid`, no capability flags (`packages/server/src/process-lock.ts:28`). The desktop has no way to know whether the lock-holder is "a full Hocuspocus server an end-user started" or "a sibling auto-spawned by an MCP connection."
- **B — Desktop's attach probe is too permissive.** It checks: lock parses, hostname matches, `isProcessAlive(pid)` is true, `port > 0` (`window-manager.ts:581`). Nothing verifies that `/collab` actually accepts WS upgrades. A server that returns 200 on HTTP `/api/server-info` but silently drops WS upgrades passes every check.
- **C — MCP-spawned `ok start` is detached + reparented to launchd on MCP exit.** Once the originating Claude session ends, the spawned server is orphaned — `ppid=1`, no liveness link to anything still running. It keeps the lock indefinitely. Successive desktop launches keep finding and attaching to the orphan. Prior art: `reports/orphan-process-prevention/` enumerated 11 such orphans across 10 worktrees in a single sweep.

**Observed failure.** With two concurrent Claude Code sessions each running an OK MCP, two `ok start` processes were live (one per `cwd`). The user opened the desktop on the `aang` workspace. The MCP-spawned server held the lock; desktop attached; `/collab` WS handshakes completed but `synced` never fired; every doc surfaced `PreSyncDisconnectError` ("Connection dropped") then `SyncTimeoutError` ("Couldn't load document") on retry. HTTP `/api/server-info` and `/api/pages` worked the entire time, masking the failure from any caller that didn't actually try to load a doc through Y.js. Killing the orphan server immediately got it respawned by the parent MCP within seconds — same broken state.

**Resolution.** Three mutually-reinforcing changes (defense in depth):

1. **Lock metadata gains `kind`, `parentPid`, `capabilities`.** Single source of truth so the desktop's attach decision can be evidence-based instead of optimistic.
2. **Desktop's `tryAttachExistingServer` validates capability + spawning-process liveness before attaching, and runs a fast WS-upgrade probe as the final gate.** Mismatch falls through to `runClean` → spawn a fresh utility-process server.
3. **MCP-spawned `ok start` polls its spawning MCP's pid and exits when stranded.** Releases the lock; the next attach attempt finds no lock and spawns cleanly.

Any one of the three would close the symptom for most cases. We ship all three because each guards against a different failure mode and the engineering cost is small relative to the diagnostic cost the user just paid.

## 2) Goals

- **G1 — The desktop never attaches to a server it cannot use for collab.** Every attach is preceded by a verifying probe that catches the failure mode observed today (HTTP-up, WS-hung).
- **G2 — Stranded MCP-spawned servers self-terminate within seconds of their parent's death.** The lock is released without manual intervention; reconnection works on next attach.
- **G3 — Lock metadata is expressive enough that future consumers (sync daemon, mobile, alternate IDE) can make capability decisions without ad-hoc probes.** `kind`, `parentPid`, `capabilities` are stable contract fields.
- **G4 — The user sees a specific, actionable error if attach fails after the new validation, not a 30-second silent timeout.** The error names the kind mismatch or probe failure.

## 3) Non-goals

- **[NEVER] NG1**: Distinguishing per-document collab capability ("this server supports ws but not awareness"). Hocuspocus is monolithic; if it's running it serves everything. `capabilities` is array-of-string for forward-compat, but only `"ws"` is meaningful at v1.
- **[NEVER] NG2**: Multi-version-server coexistence. We assume any two servers on the same machine speak the same protocol — the existing precedent (`expectedServerInstanceId` rejection in `standalone.ts:329`) covers protocol/branch divergence at the auth layer. This spec is about *kind* of process, not protocol version.
- **[NEVER] NG3**: A central "OK process supervisor" that owns server lifecycle across all clients. The lock-file design is intentionally ambient and per-machine; we strengthen it in place rather than introducing a daemon.
- **[NOT NOW] NG4**: Forcing MCP to never spawn a server, only connecting to existing ones. Today's auto-spawn is load-bearing for the "agent in a fresh checkout" UX. Revisit if MCP-spawn proves to be a recurring source of bad servers even after this fix.
- **[NOT NOW] NG5**: Backward compatibility with locks written by older `ok start` binaries that don't have `kind`/`parentPid`/`capabilities`. The lock is per-machine, short-lived, and gets rewritten on every server start; we'll treat absent fields as legacy and conservatively spawn-fresh rather than attach. Revisit if the rollout window reveals real users running mixed binaries against the same project.
- **[NOT UNLESS] NG6**: A separate `mcp-server.lock` filename so MCP-spawned servers never compete with user-spawned ones. Only if the in-place metadata approach proves insufficient (e.g., desktop misclassifies under load).

## 4) Personas / consumers

- **P1 — Desktop user with a Claude Code session attached** (the failure case): runs `claude` in a project, agent calls a tool, MCP spawns `ok start`, user double-clicks Open Knowledge.app to open the same project. Today: silent broken state. Goal: desktop refuses to attach to a no-WS server, spawns its own.
- **P2 — Desktop user without any agent session**: opens a project; `tryAttachExistingServer` finds nothing; spawn-path runs unchanged. No regression.
- **P3 — Two desktop windows on the same project**: second window finds the first's lock, attaches. `kind: "interactive"` matches; capability includes `"ws"`; probe passes; attach succeeds. No regression.
- **P4 — MCP after agent session ends**: spawned server detects parent gone, releases the lock cleanly. No restart loop, no re-spawn (the parent that would respawn is already dead).
- **P5 — Two concurrent agent sessions on different projects**: each MCP spawns its own `ok start` for its own contentDir; locks are per-contentDir; no cross-contention. No change.

## 5) User journeys

### J1 — Desktop opens a project that has an MCP-spawned server (P1)

1. Agent session is running; MCP has spawned `ok start` (pid X) with `kind: "mcp-spawned"`, `parentPid: <mcp pid>`, `capabilities: ["http"]`.
2. User opens the desktop app on the same project.
3. `tryAttachExistingServer` reads the lock. Sees `kind: "mcp-spawned"` and `capabilities: ["http"]` (no `"ws"`). Returns null.
4. Desktop falls through to `runClean({lockDir})` — but the MCP server is alive and owns the lock, so `runClean` does nothing destructive (doesn't kill foreign processes; only clears stale lock files for dead pids).
5. Desktop attempts `acquireServerLock` via its utility process. Collision: the MCP's lock is held. The utility process throws `ServerLockCollisionError`.
6. **New behavior**: the utility process inspects the colliding lock; if `kind: "mcp-spawned"` AND its `parentPid` is checked-alive, the utility process kills `lock.pid` (with grace period), waits for the lock to release, and retries acquire. Rationale: MCP-spawned servers exist for the agent's convenience, but the desktop is the user-facing surface and takes precedence when it cold-starts. The MCP will respawn its own when it next needs one.
7. Utility process acquires the lock, boots Hocuspocus with full extensions, writes `kind: "interactive"`, `capabilities: ["http", "ws"]`. WS-upgrade probe passes. Renderer attaches to the utility process's URL. All 32 docs sync.

### J2 — Desktop opens a project; existing server is broken (HTTP up, WS hung) (defense in depth)

1. Lock claims `capabilities: ["http", "ws"]` (e.g., by an old binary that always claims this, or by a server that legitimately had WS but lost it).
2. Desktop's WS-upgrade probe to `ws://localhost:<port>/collab` fails (no `OPEN` event within 500ms).
3. Desktop treats this as if it found a stale lock: kills the holder pid (after `kind` check — only kill `kind: "mcp-spawned"` automatically; for `kind: "interactive"` show a user-facing dialog), runs `runClean`, spawns its own utility process.

### J3 — MCP spawn detects parent death (P4)

1. `ok start` boots; reads `OK_PARENT_PID` env passed by the MCP spawn (new contract).
2. Every 5s, `ok start` calls `isProcessAlive(parentPid)`. While true, no-op.
3. Parent dies. Next poll: false. `ok start` initiates graceful shutdown (closes Hocuspocus, releases the lock, exits 0).
4. Lock file is gone. Next desktop attempt or next MCP tool call spawns fresh.

### J4 — Two desktop windows, same project (P3)

1. First window's utility process holds the lock with `kind: "interactive"`, `capabilities: ["http", "ws"]`.
2. Second window's `tryAttachExistingServer` reads the lock. `kind: "interactive"` ✓, `parentPid` alive ✓, `capabilities` includes `"ws"` ✓, WS-upgrade probe completes within 500ms ✓.
3. Attach proceeds. No regression vs today.

### Interaction state matrix

| Surface                                                        | Today's path                                       | New path                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Desktop attach when no lock                                    | spawn utility process                              | unchanged                                                                 |
| Desktop attach when lock is `kind:"interactive"` + WS healthy  | attach (works)                                     | attach (verified by probe)                                                |
| Desktop attach when lock is `kind:"mcp-spawned"`               | attach (silently broken)                           | refuse → kill MCP-server → spawn utility                                  |
| Desktop attach when lock is `kind:"interactive"` but WS broken | attach (silently broken)                           | refuse → user dialog ("Server is not responding to collab — restart it?") |
| MCP starts agent, no server                                    | spawn `ok start`                                   | unchanged, but pass `OK_PARENT_PID` and write `kind:"mcp-spawned"`        |
| MCP parent dies                                                | spawned server orphans (ppid=1, lock held forever) | spawned server detects, exits, releases lock                              |

## 6) Functional requirements

### Lock metadata (workstream A)

- **FR-A1.** Extend `ProcessLockMetadata` with three new optional fields, written by every `acquireProcessLock` call going forward:
  - `kind: "interactive" | "mcp-spawned"` — who started this server. Required-on-write for new locks.
  - `parentPid: number` — pid of the *spawner*, not `process.ppid` (which can reparent to launchd). For `interactive`: the user-facing CLI/Electron main pid that called `bootServer`. For `mcp-spawned`: the MCP server's pid (passed via `OK_PARENT_PID` env from `server-discovery.ts`).
  - `capabilities: string[]` — at v1, `["http", "ws"]` for any server booted via `bootServer()`. Future-proof for variants.
- **FR-A2.** Reading code (`readProcessLock`, `readServerLock`, `readUiLock`) MUST tolerate locks lacking these fields (legacy `ok start` from older binaries) and surface them as `kind: undefined`, `parentPid: undefined`, `capabilities: undefined`.
- **FR-A3.** `ServerLockMetadata` is the same shape as `ProcessLockMetadata`. The new fields apply to both `server.lock` and `ui.lock`. (UI lock writes `kind: "interactive"` always; MCP doesn't spawn UI processes.)

### Desktop attach validation (workstream B)

- **FR-B1.** `tryAttachExistingServer` (in `packages/desktop/src/main/window-manager.ts`) MUST refuse to return a lock when:
  - `lock.kind` is `undefined` (legacy lock — conservatively spawn fresh)
  - `lock.kind === "mcp-spawned"`
  - `lock.capabilities !== undefined && !lock.capabilities.includes("ws")`
  - `lock.parentPid !== undefined && !isProcessAlive(lock.parentPid)`
- **FR-B2.** When `tryAttachExistingServer` accepts the metadata gates, it MUST run a final WS-upgrade probe to `ws://localhost:<lock.port>/collab/<probe-doc-name>` with a 500ms deadline. The probe is a fresh `WebSocket(url)` that resolves on `open` and rejects on `close` or timeout. On rejection, return null (forces spawn-fresh path).
- **FR-B3.** When the spawn-fresh path encounters `ServerLockCollisionError` AND the colliding lock is `kind: "mcp-spawned"` AND its `parentPid` is alive, the desktop's utility-process boot path MUST: (a) send SIGTERM to `lock.pid`, (b) wait up to 3s for the lock file to disappear, (c) retry `acquireServerLock`. If the lock still doesn't release, surface a user-facing error in the boot pipeline (`type: "error"` from the utility init handshake) with kind `mcp-server-stuck`.
- **FR-B4.** When the spawn-fresh path encounters `ServerLockCollisionError` AND the colliding lock is `kind: "interactive"` (another desktop), the desktop MUST NOT auto-kill it. Show a modal dialog: "Open Knowledge is already running for this project (window opened \{startedAt}). Switch to existing window?" with primary action that focuses the holder PID's window if discoverable, else copies the lock pid to clipboard. Secondary: "Quit". This preserves user agency for inter-desktop conflicts (real ones, not orphans).

### MCP self-cleanup (workstream C)

- **FR-C1.** `server-discovery.ts:ensureServerRunning` MUST set `OK_PARENT_PID=<process.pid>` and `OK_LOCK_KIND=mcp-spawned` in the spawned child's environment.
- **FR-C2.** `bootServer` (in `packages/server/src/boot.ts`) MUST read `OK_PARENT_PID` and `OK_LOCK_KIND` from `process.env` and write them into the lock metadata at acquire-time. Default `OK_LOCK_KIND` to `"interactive"` when unset.
- **FR-C3.** When `OK_PARENT_PID` is set, `bootServer` MUST install a 5-second-interval poller that calls `isProcessAlive(parentPid)`. On false, initiate graceful shutdown (the same path triggered by SIGTERM in `boot.ts:117`).
- **FR-C4.** The poller MUST handle pid-reuse defensively: at startup, capture `parentStartTime` from `/proc/<pid>/stat` (Linux) or `ps -o lstart` (Darwin) when feasible; on each tick, re-read and compare. If the (pid, startTime) pair changes, the original parent is gone — exit. (Pid-reuse on macOS is not theoretical — this guards against racing with a new process landing on the same pid number.)
- **FR-C5.** Process-launching audit: every spawn of `ok start` from non-MCP code paths (e.g. `api-extension.ts:4516` `local-op/clone`, `local-op/open`, `desktop`'s utility process fork) MUST set `OK_LOCK_KIND=interactive` explicitly so the kind is unambiguous regardless of env inheritance.

### User-facing errors (workstream D — cross-cutting)

- **FR-D1.** `DocumentErrorBoundary.errorCopy` (`packages/app/src/components/DocumentErrorBoundary.tsx:89`) gains a new arm for `ServerCapabilityMismatchError` — class added to `sync-promise.ts` — surfaced when the renderer detects post-attach that the server it's connected to lacks WS. Copy: title `"Server can't open documents"` / summary `"This project's running server doesn't support live editing. Restart Open Knowledge to fix."`.
- **FR-D2.** The desktop's utility-init `error` IPC message gains a `kind` field. `mcp-server-stuck` and `mcp-server-killed` get distinct user-facing copy in the project-window error UI.

## 7) Non-functional requirements

- **NFR1.** WS-upgrade probe (FR-B2) MUST complete within 500ms wall-clock on a healthy server (loopback). If this proves flaky on slow CI, raise to 1000ms behind a config knob `OK_DESKTOP_ATTACH_PROBE_MS`.
- **NFR2.** Parent-death poll (FR-C3) MUST not consume measurable CPU while the parent is alive. 5s interval × `isProcessAlive` (a `kill(pid, 0)` syscall) is well below noise floor.
- **NFR3.** Lock metadata (FR-A1) MUST stay under 1KB for forward-compat with future fields. Current shape \~200 bytes; budget is 5x.
- **NFR4.** No new external dependencies. All probes use Node built-ins (`ws` is already in the tree via `@hocuspocus/provider`; the WS probe can reuse that or use the platform `WebSocket`).

## 8) Decisions

- **D1 [LOCKED]**: Three workstreams ship together, not separately. They reinforce each other: A enables B, B catches the cases C misses, C reduces how often B has to act. Splitting them into separate PRs invites a half-shipped fix that re-introduces the symptom under a different code path.
- **D2 [LOCKED]**: Lock format is additive, not breaking. Old readers ignore unknown fields (`ProcessLockMetadata` is parsed by `JSON.parse`, no schema enforcement at read-time). New readers tolerate missing fields per FR-A2. No migration script needed.
- **D3 [LOCKED]**: Desktop kills `mcp-spawned` lock-holders without prompting (FR-B3); does NOT kill `interactive` lock-holders without prompting (FR-B4). Rationale: an MCP-spawned server is an agent's transient implementation detail, not a user's open work; an interactive server might be the user's other window with unsaved state.
- **D4 [LOCKED]**: Parent-death poll lives in `bootServer`, not in a separate "stranded-server-watchdog" extension. Reason: the polling is a property of *being* a child server, not of any one feature. Centralizing in `bootServer` makes it impossible to forget when a future code path adds another server-spawn site.
- **D5 [DIRECTED — Andrew]**: WS-upgrade probe target is `/collab/__attach_probe__`. Server-side, this docName MUST be excluded from persistence + observers (treat as `__system__`-class via `isSystemDoc()`). The probe creates a transient empty Y.Doc that's discarded; we never want it in `pages` listings or shadow repo. Sibling pattern to existing `__system__` doc.
- **D6 [NOT NOW]**: Don't auto-restart the killed `mcp-spawned` server after the desktop takes over. The next MCP tool call will trigger respawn naturally via existing `decideAutoStart` logic; pre-emptive respawn just doubles the work. Revisit if agent-side latency becomes a complaint.
- **D7 [NOT UNLESS]**: Don't add a "force-attach anyway" UI escape hatch when probes fail. The whole point is that bypassing the gates was the original failure. Revisit only if a real workflow surfaces where the user knows better than the probe (extremely unlikely).

## 9) Implementation approach

### Phase 1 — Lock metadata (A) + MCP env contract (C1)

Smallest blast radius. Pure write-side: `process-lock.ts:writeLockFile` adds the three new fields; `server-discovery.ts:ensureServerRunning` sets `OK_PARENT_PID` + `OK_LOCK_KIND` in spawn env; `bootServer` reads env at acquire-time. No reader behavior changes. Ships behind no flag — every new lock file gets the new fields. Unit tests update the lock fixture; integration test in `packages/server/src/process-lock.test.ts` verifies env-driven kind.

### Phase 2 — MCP self-cleanup poll (C3, C4)

Adds the runtime poller to `bootServer`. Behind feature flag `OK_PARENT_DEATH_WATCH=1` for the first nightly cycle to validate no false positives in the dev loop (the dev plugin's `createServer()` reuses pids across Vite restarts). After one stable nightly, on by default whenever `OK_PARENT_PID` is set. Test: `packages/server/src/boot.test.ts` mocks `isProcessAlive` to flip false at tick N; assert graceful shutdown fires within `(N+1) × 5000ms + ε`.

### Phase 3 — Desktop attach validation (B1, B2)

Touches only `packages/desktop/src/main/window-manager.ts`. New `validateAttachLock(lock)` helper: kind/capabilities/parentPid checks. New `probeWsUpgrade(url, timeoutMs)` helper: fresh WebSocket, resolves on open, rejects otherwise. `tryAttachExistingServer` calls both; returns null on any failure. Test: `packages/desktop/src/main/window-manager.test.ts` already mocks `readServerLock` + `isProcessAlive`; add fixture cases for each rejection branch.

### Phase 4 — Lock collision handling (B3, B4)

Adds the auto-kill-on-mcp-collision branch in the utility process boot. Modifies `boot.ts` collision handler to read `lock.kind` + `lock.parentPid` and conditionally SIGTERM. Modal dialog wiring for FR-B4 in `packages/desktop/src/main/index.ts`. Test: end-to-end scenario in `packages/desktop/tests/smoke/attach-isolation.e2e.ts` (new) — spawn a fake `mcp-spawned` lock-holder, open desktop, assert utility process boots and acquires.

### Phase 5 — Error UX (D1, D2)

New `ServerCapabilityMismatchError` class in `packages/app/src/editor/sync-promise.ts`; new arm in `errorCopy`; new IPC error kinds. Pure copy + error-routing changes; existing snapshot tests cover.

## 10) Acceptance criteria

- **AC1.** Repro the original failure: spawn `ok start` with `OK_LOCK_KIND=mcp-spawned` and a fake parent-pid; open the desktop; verify the desktop refuses to attach (log line `[window-manager] refusing attach: kind=mcp-spawned`) and successfully spawns its own utility process within 5s of the project-window create call.
- **AC2.** Probe-based fallback: spawn a server that writes a lock claiming `capabilities: ["http", "ws"]` but blocks `/collab` upgrades (test fixture); open the desktop; verify it falls through to spawn-fresh after the 500ms probe deadline.
- **AC3.** MCP self-cleanup: start an MCP that spawns `ok start`; kill the MCP with SIGKILL; within 10s, the spawned `ok start` exits and the lock file is removed.
- **AC4.** Pid-reuse defense: simulate a (pid, startTime) flip mid-poll; assert `ok start` exits even though the new pid is alive.
- **AC5.** No regression in J2 (no lock present) or J4 (two desktops, both `interactive`): both paths complete attach without the new gates rejecting.
- **AC6.** No regression in MCP tool-call latency: `bun run measure:mcp-spawn-roundtrip` (existing) shows no statistically significant change vs baseline.
- **AC7.** Telemetry: every gate rejection emits a structured `console.warn` JSON with `event: "desktop-attach-refused"` and `reason: "kind-mcp-spawned" | "ws-probe-failed" | "parent-dead" | "legacy-lock"`. One operator-grep can answer "how often is this firing in the wild?"
- **AC8.** No new lint, no new test failures in `bun run check`.

## 11) Open questions

- **Q1 [BLOCKING].** **Why does MCP-spawned `ok start` not serve `/collab` WS upgrades on this machine?** All evidence today points to the spawned server being a *full* `ok start` (no `--http-only` flag in `server-discovery.ts:218`); HTTP works fine; WS upgrade silently never completes. This spec's defenses (B + C) make the symptom go away regardless, but if the root cause is a bug in spawn-time env inheritance (e.g. an `OK_*` env var that disables Hocuspocus), it'll bite again somewhere else. Investigation: capture spawned-process env vs interactively-started env on the same project; diff. Tracking artifact: `reports/mcp-spawned-server-ws-hang/` (TBD).
- **Q2.** Should we extend `runClean` to honor `kind: "mcp-spawned"` proactively — i.e., always clean up MCP-spawned locks on desktop boot, even when not colliding? Pro: faster recovery from the orphan accumulation pattern. Con: races with a healthy live MCP that the desktop should peacefully share with (well, peacefully *avoid* sharing, since we now spawn our own).
- **Q3.** Does Tim's signed/Notarized desktop build (per recent precedents) inherit env from launchd in a way that breaks `OK_PARENT_PID`-style env contracts? Spot-check after Phase 1 lands.
- **Q4.** The 500ms WS probe deadline (NFR1) was picked by feel. Empirical: what's the p99 `open`-event latency on a known-healthy local Hocuspocus? If it's >100ms we have low margin.

## 12) Out-of-scope follow-ups

- Surface `kind` in the `/api/server-info` response so a server can identify itself to remote inspectors (currently only `serverInstanceId` + branch).
- Add a `bunx ok doctor` command that walks `~/.open-knowledge/` and known content dirs, finds orphan lockfiles, and offers to clean them up. Generalizes the manual fix the user just ran.
- Capture this spec's repro flow as a recipe in `packages/desktop/tests/smoke/` so the regression is permanently locked.
- Investigate whether `decideAutoStart` itself should refuse to spawn `ok start` when an existing lock is `kind: "interactive"` and capability-matches (i.e., MCP should *connect*, not respawn). Symmetric to the desktop's logic.

---

## Appendix — referenced code sites (baseline `30a42966`)

- `packages/server/src/process-lock.ts:28` — `ProcessLockMetadata` shape (extend per FR-A1)
- `packages/server/src/server-lock.ts:35` — `acquireServerLock` (no change needed; passes through)
- `packages/server/src/boot.ts` — `bootServer`; new env-read + parent-death poll lives here
- `packages/cli/src/mcp/server-discovery.ts:218` — MCP spawn site; set `OK_PARENT_PID` + `OK_LOCK_KIND` here
- `packages/desktop/src/main/window-manager.ts:339` — `tryAttachExistingServer` call site
- `packages/desktop/src/main/window-manager.ts:581` — current attach probe (replace per FR-B1/B2)
- `packages/desktop/src/main/index.ts` — utility-process boot + IPC error routing
- `packages/app/src/editor/sync-promise.ts` — new `ServerCapabilityMismatchError` class
- `packages/app/src/components/DocumentErrorBoundary.tsx:89` — `errorCopy` arm
