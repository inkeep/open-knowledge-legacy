# Design Challenge Findings

**Artifact:** specs/2026-04-16-zero-ceremony-resume/SPEC.md
**Challenge date:** 2026-04-16
**Total findings:** 11 (5 H, 4 M, 2 L)

Cold-read stance: I read the spec, the two evidence files, the parent project, the §D4 report, Hocuspocus source in `node_modules/`, and the current `start.ts` / `mcp.ts` / `init.ts` / `agent-sessions.ts` / `standalone.ts` / `preview-url.ts` / `config/schema.ts`. The spec is thoughtful and internally coherent, but several load-bearing assumptions don't hold up against the codebase or against documented client behavior.

---

## High Severity

### [H] Finding 1: Idle-shutdown cannot use naive Hocuspocus client-count — the server always holds ≥ 1 DirectConnection

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE)
**Location:** §6 FR-1.6; §10 D-017; §11 OQ-A7; §9 `attachIdleShutdown` sketch; evidence/ui-client-tracking.md
**Issue:** OQ-A7 asks whether `onConnect` / `onDisconnect` count `DirectConnection` usage. The spec frames this as an open question. It isn't — it has a *verified* answer, and the answer flips the design premise.

Reading `node_modules/@hocuspocus/server/src/`:
- `DirectConnection.ts:26` — constructor calls `this.document.addDirectConnection()`, which increments `directConnectionsCount`.
- `DirectConnection.ts:69-82` — `onDisconnect` hook fires **only** in the `.disconnect()` path, and **only if** `getConnectionsCount() === 0` afterward.
- `ClientConnection.ts:343-344` — `onConnect` fires **only** for WebSocket paths. DirectConnection never fires `onConnect`.
- `Hocuspocus.ts:148-163` — `getConnectionsCount()` sums unique WebSocket socket IDs **plus** `directConnectionsCount` across every loaded document.

In the current server, at least two persistent DirectConnections exist for the server's entire lifetime:
1. `standalone.ts:861` opens a DirectConnection on `__system__` (CC1 broadcaster) at startup. It's only disconnected in Phase 1b of shutdown (`standalone.ts:694`).
2. `AgentSessionManager` (`agent-sessions.ts:147`) stores persistent `AgentDirectConnection`s in a `Map` keyed by `(docName, agentId)`. They are **only** closed by `closeSession` / `closeAll`, which is invoked in shutdown Phase 2 (`standalone.ts:708`) or explicitly by `api-extension.ts:658`/`1623`. There is no timeout, no LRU, no "close this agent's connection after N minutes of no activity."

**Consequence for FR-1.6:** If `attachIdleShutdown` polls `hocuspocus.getConnectionsCount()` (the obvious API), it will be ≥ 1 forever — the CC1 connection alone guarantees this — and idle-shutdown will **never fire**. Orphan processes accumulate silently. Goal G5 fails.

Even a more clever design that ignores the `__system__` doc's DirectConnection still has to handle AgentSessions: a user who runs `write_document` at t=0 and closes the editor at t=0+5min leaves a DirectConnection open on the edited doc until the server shuts down. The current code never garbage-collects these sessions based on activity.

**Current design:** "Hocuspocus hooks authoritative" (D-017); OQ-A7 Open "needs spec-time investigation"; FR-1.6 `attachIdleShutdown({hocuspocus, thresholdMs, onShutdown})`.

**Alternative:** Either (a) replace the "Hocuspocus client count" signal with a WebSocket-only counter (ignoring DirectConnections entirely, which means we're explicitly deciding agent DirectConnections + `__system__` don't block idle), OR (b) add explicit activity tracking on `AgentSessionManager` with a per-session idle timeout that calls `closeSession` (the primitive already exists) and gate shutdown on both `(WebSocket count == 0) AND (AgentSessionManager.size == 0)`. Option (b) is more defensible: an agent mid-write should not be cut down, but an agent that last wrote 30 min ago is genuinely idle.

**Trade-off:** (a) is simpler but risks killing an active agent workflow. (b) is more code but correctly scopes "idle" to the application-level notion, not the CRDT-protocol notion. The spec's D-017 picked the simplest design by tying UI lifetime to collab, but didn't carry the investigation through to "what's collab's actual idle signal?" — that shortcut is the hole.

**Status:** CHALLENGED
**Suggested resolution:** Promote OQ-A7 from "open" to a decision that specifies *which* count drives shutdown, document that `__system__` DirectConnection and persistent agent sessions are explicitly excluded (or explicitly count), and if agent sessions count, add a `closeIdleSessions(thresholdMs)` primitive to `AgentSessionManager` invoked on a timer. STOP_IF in §16 already says "OQ-A7 resolves with `DirectConnection` NOT counted → extend primitive" — but the spec underestimates how much extension is needed. This is not a minor tweak; it's a second tracking system.

**If true, implications:** FR-1.6 changes shape. Needs a new primitive in `agent-sessions.ts` (idle-based session close). `attachIdleShutdown` needs a second input (AgentSessionManager handle) or has to read it from the Hocuspocus instance. The 30-min threshold must be set higher than the longest expected agent operation (agents do multi-minute writes during research/ingest tools — 30 min may be too tight if any single tool call exceeds that, which an `ingest` of a large source could).

---

### [H] Finding 2: Port 3000 hardcode ignores Claude Code's native `autoPort: true` — the spec reinvents what the client already does

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §6 FR-1.1; §10 D-021; evidence/launch-json-and-port.md; §9 failure modes "Port 3000 busy"
**Issue:** Claude Code's `launch.json` has a first-class field `autoPort: true` (verified at https://code.claude.com/docs/en/desktop Configuration fields table). When `autoPort: true`, Claude Code:
- Finds a free port if the configured port is busy,
- **Passes the chosen port via the `PORT` environment variable** to the spawned subprocess.

The spec's evidence file (launch-json-and-port.md) does not mention `autoPort` anywhere. D-021 LOCKS "default port = 3000 (fixed, configurable via `--port`)" citing "matches existing launch.json port contract." There is no "existing launch.json contract" in the external sense — Claude Code's own docs explicitly offer a way around the contract. The spec's port-3000-hardcode is a design constraint the spec imposed on itself, not a constraint the client imposes.

**Current design:** Scaffold `launch.json` with `port: 3000`; force `ok ui` to bind port 3000; fail with an error log if port 3000 is busy; user must manually fix.

**Alternative:** Scaffold `launch.json` with `port: 3000, autoPort: true`. Teach `ok ui` to respect `process.env.PORT`. Call `updateUiLockPort(realPort)` post-listen so MCP discovery reads the real port. This eliminates the failure mode entirely for the Claude Code path (which the spec calls the primary one per §5) without any downstream change — `previewUrl` already reads from `ui.lock`, so it always points at whatever port `ok ui` actually bound.

Non-Claude clients (Cursor / Windsurf / VS Code) don't launch `ok ui` at all; MCP stdio spawns it. For those clients, passing `--port 0` (kernel-allocated) gives the same win and uses the same lock-based discovery the MCP server already does. Port 3000 is not load-bearing for anyone.

Port 3000 is famously conflict-prone — it's Next.js / Create React App / Ruby on Rails default (dhiwise.com, httplocalhost.com, tech.amikelive.com all document this). Any user with a frontend dev server running in another project will hit this failure mode on first use.

**Trade-off:** Auto-port costs: `ok ui` must read `PORT` env var, call `updateUiLockPort` post-listen. Gains: eliminates "port 3000 busy" failure mode globally; matches existing `ok start` port-discovery pattern; no user-facing port tinkering. Cost: essentially zero.

**Status:** CHALLENGED
**Suggested resolution:** Flip D-021 to "default port = kernel-allocated, `autoPort: true` in launch.json; `ok ui` reads `process.env.PORT` then falls back to kernel." The "fallback port via `--port`" mitigation in §14 becomes unnecessary. Update FR-1.1 AC. Remove the "port 3000 busy → UI unreachable" failure mode from §9 and the risk table.

**If true, implications:** FR-1.1 changes default. FR-1.13's injection reads `ui.lock.port` (same as collab URL injection). `previewUrl` always correct regardless of actual port. `launch.json` scaffold gets one more key (`autoPort: true`). Removes one P0 risk row. Cursor/Windsurf/Codex/VS Code users don't notice the change; Claude Code users never see the port-3000-busy error.

---

### [H] Finding 3: Story 2 (previewUrl generalization) is structurally independent and should ship first, alone

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** §1 intersection framing; §13 In Scope; PROJECT.md "Stories" → "Now"
**Issue:** The spec's intersection claim in §1 is that the three stories must ship as a bundle because their value compounds. That's true for US-001 ↔ US-003 (US-003 is load-bearing for US-001 reaching non-Claude users). It is **not** obviously true for US-002.

US-002 (previewUrl on every docName-producing tool) works today for the 3 tools that already emit it — Claude Code users have been consuming `previewUrl` from `write_document` / `edit_document` / `get_preview_url` already. Extending the helper to 14 more tools does exactly one thing: eliminates a second round-trip per tool call. It does **not** depend on the lifecycle refactor; it does **not** depend on `ui.lock` existing (today it reads `server.lock` — FR-2.4 says post-split it reads `ui.lock`, but the helper is path-agnostic).

US-002 alone delivers the platform dimension ("every docName-producing tool emits `previewUrl`"), cements the contract for future tools, and helps every client that already has a preview pane (Cursor's browser, Claude Code). If US-002 ships first on main, it:
- Works against today's `server.lock` (no coupling to split).
- Is ~mechanical: apply shared helper to 14 more handlers + smoke test.
- Reduces risk scope of the bigger lifecycle PR.

The bundling argument in §1 is weak specifically on US-002. The PROJECT's "If execution reveals the bundle is too large, candidate split: push Story 2 to Next" already concedes this. But "too large" isn't the question — the question is "does shipping Story 2 first *cost* anything." It doesn't, and it de-risks the rest.

**Current design:** All three stories ship as one coherent release (§1 Resolution, §13 Ownership, PROJECT.md "Now").

**Alternative:** Phase US-002 as a standalone PR shipped first. US-001 + US-003 ship next as the lifecycle bundle. Story 2's post-split edit (FR-2.4: read `ui.lock` instead of `server.lock`) is a one-line change during the US-001 PR.

**Trade-off:** Bundle loses the "coherent release" story (but greenfield — no customer is watching). Splitting gains: smaller PR, faster review, independent rollout if lifecycle design reveals issues post-implementation. The spec argues against phasing due to value intersection; but US-002's value doesn't actually intersect with US-001 beyond "URL needs to resolve to something" — and US-002 returns `null` gracefully when the lock is absent (FR-2.3). That's graceful degradation, not broken UX.

**Status:** CHALLENGED
**Suggested resolution:** Explicitly ship-sequence: PR1 = US-002 (preview-url.ts generalization + 14 tools + FR-2.5 smoke test). PR2 = US-001 + US-003 together. Update §13 to reflect this. The spec's "Ship the 3-story bundle as coherent release" is a product-narrative claim, not a technical constraint.

**If true, implications:** Next actions list (§13) reorders: Story 2 items before Story 1's invasive lifecycle work. Reduces the P0 design risks in §14 that block Story 2 (MCP response schema reject — Low × High — gets resolved independently, de-risking Story 1 at the same time).

---

### [H] Finding 4: Agent sessions accumulate DirectConnections with no per-agent idle cleanup — orphaned inside each live process

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE + future maintainer)
**Location:** §6 FR-1.6; §14 risk "openDirectConnection not counted"; evidence/ui-client-tracking.md; §10 D-017
**Issue:** Adjacent to Finding 1 but orthogonal: even if idle-shutdown correctly ignores DirectConnections, the **live process** accumulates agent sessions indefinitely. `AgentSessionManager.sessions: Map<string, AgentDirectConnection>` (`agent-sessions.ts:147`) has one entry per `(docName, agentId)` combination, and entries are only removed by:

- `closeSession` (explicit, called nowhere in production code except server shutdown).
- `closeAllForDoc` (called from `api-extension.ts:658` on `/api/test-reset` + `/api/agent-undo`/`/api/agent-redo`).
- `closeAll` (called only from `standalone.ts:708` during shutdown).

Over a 30-min idle window during which:
- User edits 20 documents in the editor → each document has a WebSocket session (cleaned up on disconnect) AND potentially agent sessions if agents edited those docs.
- An MCP agent wrote to 10 different docs across 20 MCP tool calls → 10 persistent DirectConnections live in `sessions`.

Nothing frees these until the process exits. The spec never asks: "does the accumulated session list in AgentSessionManager interact with idle-shutdown correctly?" The answer under the current design is "idle-shutdown doesn't fire because sessions count as DirectConnections" (Finding 1), but even if idle-shutdown is fixed to fire, there's a second bug: on FR-1.6's shutdown path, `sessionManager.closeAll()` runs before `destroy()` — fine. But during normal operation, long-running server processes are accumulating memory from dead agent sessions that no one writes to anymore. This isn't fatal (session state is small), but it's leaked state that no spec requirement addresses.

**Current design:** §14 risk acknowledges `openDirectConnection` may not be counted — mitigated by "extend primitive to track bridge count." That mitigation addresses *counting* but not *cleanup*.

**Alternative:** Add an explicit activity timestamp in `AgentDirectConnection` (last transact time). Add `sessionManager.closeIdleSessions(idleMs)` method that iterates and closes sessions idle longer than threshold. Call it from a periodic timer (every 5 min). This is a small, local change and is the natural extension of the idle-shutdown primitive.

**Trade-off:** ~50 LOC for the cleanup primitive + a timer handle. Gains: bounded session memory; sessions that agents abandoned (failed MCP handshakes, browser closes mid-edit) don't leak; idle-shutdown semantics align with agent-level idleness, not CRDT-protocol idleness.

**Status:** CHALLENGED
**Suggested resolution:** Add to Story 1: per-session idle cleanup with a configurable threshold (lower than process-level idle-shutdown — e.g., 10 min of no transact for a session vs. 30 min process-level). Spec this in FR-1.6 or a sibling FR. Connects to Finding 1's Option (b).

**If true, implications:** New primitive in `AgentSessionManager`. Small additional test surface. Removes a leaked-state source the audit would otherwise flag.

---

### [H] Finding 5: Per-project UI stepping-stone forecloses global UI more than the spec admits

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §3 NG1; §15 "Future Work — Explored — Global UI"; PROJECT.md Rabbit Hole "Global UI now"; §1 "per-project two-process split positions a future"
**Issue:** The spec repeatedly claims per-project UI is a "stepping stone" to global UI. Checking: what does the per-project design actually commit to that the global design would want to undo?

The per-project commitments:
1. UI reads `server.lock` at request time to inject `window.__OK_COLLAB_URL__` (FR-1.13 / D-027).
2. `ok ui` binds a port scoped to one project's content dir (D-021).
3. UI lifetime is tied to collab via SIGTERM (D-017 / FR-1.6).
4. UI lockfile lives at `<contentDir>/.open-knowledge/ui.lock` — per-contentDir path (§3 NG1 Revisit row).

Global UI would want:
1. UI does NOT hardcode which collab to connect to; instead accepts `?collab=<url>` query or a project selector (§15 Explored).
2. UI binds one port, serves any number of collabs.
3. UI lifetime independent of any single collab.
4. UI lockfile at `~/.open-knowledge/ui.lock` (singleton).

Almost every per-project decision is **work that has to be undone** for global UI. The spec frames "splitting the UI out of `ok start`" as the shared stepping-stone, but the split *only* splits processes — it doesn't pre-design the global shape. The global shape (§15 Explored) needs:
- URL routing (`/<project>/<docName>` or `?collab=`).
- Session/project identity outside the UI server.
- Cross-project awareness (which project is active now? are other projects live?).

None of these are in the spec. The argument "per-project positions global without foreclosing" would require either (a) evidence that the per-project UI server code ports to global with minimal change, or (b) acknowledgment that a meaningful rewrite is expected when global ships and this spec is paying a cost now for an optionality that isn't cheap to realize.

Counterargument: the spec's split *does* deliver independent customer value (the two-process lifecycle) beyond the "stepping stone" framing — it enables Claude Code's `preview_start` to cleanly target the UI (evidence/launch-json-and-port.md's rationale for why the UI goes into `launch.json`, not collab). That value is real and local to the current scope. The "stepping stone to global UI" claim in §1 is additional, and isn't needed to justify the split.

**Current design:** §1 uses "stepping stone" as part of the resolution rationale. §10 D-002 marks "Two processes per project" as LOCKED with "User direction; stepping-stone" as rationale.

**Alternative:** Drop the stepping-stone framing. Justify the split on its own standalone value: `launch.json` semantics (preview pane targets the UI; collab is not a visible surface) + cleaner process boundaries for Electron lifecycle alignment. Acknowledge openly that global UI (§15 Explored) is a future rewrite, not a migration.

**Trade-off:** Lose a narrative prop (stepping-stone). Gain: honest framing; avoids future maintainer's false expectation that "we paid for this optionality" when in fact most of the per-project UI code will be rewritten. Also defuses Finding 9's concern about bundle scope.

**Status:** CHALLENGED
**Suggested resolution:** Edit §1 to drop "positioning a future 'global UI'" and replace with the standalone split rationale (launch.json semantics + Electron alignment). Update D-002 rationale. §15 Explored "Global UI" becomes a "future rewrite opportunity" rather than a "natural extension."

**If true, implications:** Minor editorial. But prevents a class of future maintainer misunderstanding — a future global-UI PR shouldn't feel like it's violating the spec's direction.

---

## Medium Severity

### [M] Finding 6: `OK_MCP_AUTOSTART=0` env-var opt-out has worse ergonomics than a config-file flag

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §6 FR-1.4; §10 D-009; §9 "OK_MCP_AUTOSTART=0" error
**Issue:** The opt-out is an env var. Env vars are per-shell. Scenarios that break:
1. User opts out once (e.g., a one-time debug session where they want MCP to just use the live server and not spawn a new one). Their next shell doesn't have the var set; auto-spawn resumes. They meant "never again for this project" but got "just this shell."
2. User opts out because they want to use `launch.json` only (Claude Code + manual `ok start`). They add `OK_MCP_AUTOSTART=0` to their shell rc. This affects every project on the machine, including ones where they *do* want auto-spawn.
3. User tries to persist the opt-out for a specific project via `.envrc`, `direnv`, `.env`. But the MCP stdio process is spawned by the editor (Claude Code / Cursor), not by their shell — so the editor's env doesn't see the `.envrc`. Fails silently.

`.open-knowledge/config.yml` already exists and is per-project. A `mcp.autostart: false` flag would be:
- Per-project (correct scope).
- Persistent across shells (correct semantics).
- Visible in the committed repo (team can agree).
- Easy to check (`if config.mcp?.autostart === false) return null`).

**Current design:** D-009 "Env var is standard opt-out." Rationale is thin: "standard" is claimed without evidence the *env var* is the standard (config files are equally standard; many CLIs prefer them).

**Alternative:** Add `mcp.autostart: boolean` to config schema. Precedence: env var (for quick debug) > config (persistent) > default (true). Env var still works for power users.

**Trade-off:** Config schema gets one more field. Implementation reads config in `ensureServerRunning`. Minor bloat. Gains: the opt-out actually works for the use cases that motivated it.

**Status:** CHALLENGED
**Suggested resolution:** Change D-009 to `mcp.autostart` config field as primary, env var as secondary override. Update FR-1.4 AC and §9 error-message flow.

**If true, implications:** Config schema change. FR-1.4 acceptance criteria change. Minor docs change in `ok init`'s root AGENTS.md section.

---

### [M] Finding 7: Detached spawn from MCP stdio surfaces errors fragilely via poll-for-error-log

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §6 FR-1.4; §10 D-018; §9 MCP spawn call site sketch
**Issue:** D-018's error-log pattern works like this: the spawned `ok start` child process, on startup failure, writes to `<contentDir>/.open-knowledge/last-spawn-error.log`. The MCP stdio parent polls `server.lock` for ≤ 5s; on timeout, it reads `last-spawn-error.log` and surfaces the content in the first tool-result error.

Concrete fragility cases:
1. **Race condition:** child crashes before writing the log. Node detached children crash in many ways that occur before the child's own try/catch is installed — `require()` error, native-module load failure, `bunx` package-not-found. The child exits with nothing to show.
2. **Stale log:** previous crash wrote a log; new spawn succeeds normally; but on the *next* spawn attempt, if it times out for an unrelated reason (slow startup, not a crash), the parent reads the stale log from the previous incident and surfaces a misleading error.
3. **Race with log rotation:** two concurrent MCP handshakes spawn two children (TQ8 ServerLockCollisionError path); both attempt to write `last-spawn-error.log`; whichever wrote last wins. Parent reads one error, not both.
4. **File not created:** `stdio:'ignore'` means the child has no stderr pipe to the parent. If the child crashes before reaching its log-write code (common for Node startup failures), the parent times out with "No error log" — the failure mode the error message in §9 explicitly handles, but with zero diagnostic value.

These aren't all catastrophic — option 4's "No error log" message is the current worst case and tells the user something wrong happened. But the detached-spawn recipe has a better alternative that's well-documented: spawn detached, redirect `stdio` to a pair of filenames (`{stdio: ['ignore', fd_out, fd_err]}`), so ALL stdout/stderr from the child is captured to disk from the kernel (not from child code). Node docs: https://nodejs.org/api/child_process.html#optionsdetached — "Note that the parent's stdin must not be inherited." This keeps unref semantics intact while capturing all stderr.

**Current design:** D-018 "Preserves `stdio:'ignore'`; simple." Child writes log *from its own code*, after the crash must have completed enough of its startup.

**Alternative:** Use `stdio: ['ignore', openSync(outFile, 'a'), openSync(errFile, 'a')]` — kernel-level stderr capture. Parent polls the error file path; on timeout, reads the captured stderr. Covers all crash modes including pre-code crashes.

**Trade-off:** Two file descriptors per spawn. Kernel-captured stderr is strictly more useful than child-written logs. `unref()` still works.

**Status:** CHALLENGED
**Suggested resolution:** Change D-018 to kernel-captured stderr; update FR-1.4 AC and §9 sketch. Preserves `detached:true` + `unref()` (both load-bearing for §D4 supersession).

**If true, implications:** FR-1.4 implementation detail change. `last-spawn-error.log` becomes `last-spawn-stderr.log`. Log rotation concern still exists (races); mitigate by appending timestamps + using per-pid filenames.

---

### [M] Finding 8: `window.__OK_COLLAB_URL__` injection is an implicit runtime contract that belongs on `/api/config`

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — future maintainer)
**Location:** §6 FR-1.13; §9 `ok ui` HTML injection sketch; §10 D-027
**Issue:** FR-1.13 injects a global on `window` by string-replace on `index.html` at request time. This creates an implicit, invisible contract:
1. The React app reads `window.__OK_COLLAB_URL__` in its bootstrap. This only works if `index.html` was served by `ok ui` (not served by a static CDN, a Vercel preview, an extracted zip the user is running).
2. Build-time static analysis can't see the contract — Vite / tsc has no way to know `window.__OK_COLLAB_URL__` exists.
3. TypeScript has to `declare global { interface Window { __OK_COLLAB_URL__: string | null } }` somewhere to type it.
4. Dev mode (`bun run dev`) doesn't use this path — the Vite plugin serves `index.html` from Vite, not from `ok ui`'s HTTP handler. There's an implicit dev/prod divergence in how the collab URL is discovered.

Alternative: expose `/api/config` (or `/api/collab`) on `ok ui` that returns `{ collabUrl: "ws://localhost:<port>" | null }`. The React app fetches on mount. Benefits:
- Explicit contract: GET endpoint, typed shape, tested like any other API.
- Dev-mode parity: Vite plugin implements the same endpoint (or proxies).
- Recoverable: if `server.lock` changes during runtime (server crash + restart on a new port), UI can re-fetch. Injection is baked at first request.
- No HTML string replacement — no parsing edge cases around minified `</head>` or missing `</head>`.

**Current design:** D-027 "Post-split, UI is on different port than collab; React app needs to know collab URL." LOCKED. Rationale limited to "simpler, no proxy, no new endpoint."

**Alternative:** Small `/api/config` endpoint on `ok ui`. React app fetches at boot; reconnects on server restart by re-fetching.

**Trade-off:** One endpoint more than the injection path. Gain: explicit contract + testable + dev/prod parity + recovery-from-crash. The "no new endpoint" argument in D-027 is thin — `ok ui` needs an HTTP server anyway, and endpoints are cheap.

**Status:** CHALLENGED
**Suggested resolution:** Flip D-027 to `/api/config` endpoint. FR-1.13 becomes "the React app fetches GET /api/config on boot." No `window.__OK_COLLAB_URL__` global.

**If true, implications:** FR-1.13 AC change. React bootstrap gains one network round-trip on mount (≤ 1ms localhost — negligible). Adds one endpoint to `ok ui`. No `<script>` injection complexity.

---

### [M] Finding 9: `ok stop` pruning stale locks overloads the command — mixing "stop running things" with "clean up"

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §6 FR-1.7; §10 D-024
**Issue:** FR-1.7's `ok stop` has three behaviors:
1. Both locks live: SIGTERM both.
2. No locks: print "no running processes" AND prune stale locks.
3. One live, one stale: warn about stale, kill live, prune stale.

Behavior 2 is surprising. A user running `ok stop` expects "stop the servers." If no servers are running, they expect "noop, nothing to stop." The command silently doing lock-cleanup is side-effectful in a way the UX vocabulary doesn't signal.

Worse: if the user wrote a script `ok stop && ok start` expecting to cycle, and a stale lock exists, `ok stop` silently mutates state that `ok start` would also handle on its own (current `acquireServerLock` auto-replaces stale locks). The side-effect is invisible but non-idempotent in log output.

**Current design:** D-024 "`ok stop` is the 'clean up state' command." Combines termination + cleanup.

**Alternative:** `ok stop` strictly terminates running processes. Stale-lock cleanup happens in `acquireProcessLock` automatically (already the current pattern per `server-lock.ts`). If explicit cleanup is needed, add `ok clean` or `ok doctor` as a separate command with its own semantics.

**Trade-off:** Two commands instead of one. Gain: each command has a single, obvious meaning. No side effects from `ok stop` when nothing is running.

**Status:** CHALLENGED
**Suggested resolution:** Flip D-024 — `ok stop` only terminates. Remove the stale-prune side effect. If future telemetry shows users *need* an explicit cleanup path, add `ok clean` then.

**If true, implications:** FR-1.7 AC simplifies. The "no locks + prune stale" error path becomes "no locks → print 'no running processes', exit 0, no side effects."

---

## Low Severity

### [L] Finding 10: Graceful degradation when `ui.lock.port:0` is indistinguishable from "UI failed to bind" in client UX

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer)
**Location:** §5 Interaction state matrix; §6 FR-2.3
**Issue:** `previewUrl: null` is emitted by every list-producing and single-doc tool when `ui.lock.port == 0` or lock is absent. The state matrix in §5 shows several partial states that all resolve to `previewUrl: null` from the client's perspective:
- UI is starting (lock has port:0 for <100ms).
- UI died (lock stale).
- UI spawn failed (port 3000 busy).
- Collab crashed (UI self-shuts down).

The agent receives `previewUrl: null` in all cases. It can't distinguish "try again in 1s" (transient) from "UI is broken, stop trying" (terminal). Goal G4 has a measurable clause "each produces unique ports and no collisions" but no clause for "diagnostic quality of `previewUrl: null`."

**Current design:** One `null` means "UI not reachable." Clients must accept null.

**Alternative:** Return `{ previewUrl: null, previewUrlStatus: 'starting' | 'absent' | 'error' }`. Agents get a hint whether to retry. Clients that ignore the field still work (just like `previewUrl: null` today).

**Trade-off:** One more string field per response. Additive. Gain: diagnostic; agents can back off or retry intelligently.

**Status:** CHALLENGED
**Suggested resolution:** Consider adding `previewUrlStatus` to the response shape if easy; otherwise note as Future Work.

**If true, implications:** FR-2.x minor addition. MCP response shape grows one field (additive — XQ3's "clients ignore unknown fields" applies).

---

### [L] Finding 11: "Greenfield → speed > rigor" conflicts with adding `ok status`, `ok stop`, `ok ui` all at once

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §6 FR-1.7, FR-1.14; PROJECT.md PQ9
**Issue:** PROJECT.md PQ9 and the appetite section locks "speed > rigor, greenfield." The spec bundles three new CLI commands: `ok ui`, `ok stop`, `ok status`. Each has its own error messages, help text, argument parsing, and tests. `ok status` in particular is tagged "Should" (FR-1.14) but still in Story 1's scope.

If speed is the priority, `ok status` is the most-deferable: `ok stop` alone can do state inspection as a side effect (kill signal + lock inspection). Users can `cat .open-knowledge/server.lock .open-knowledge/ui.lock` if they want detail.

**Current design:** All three new commands in Story 1.

**Alternative:** Ship `ok ui` + `ok stop` in Story 1. Defer `ok status` to a tiny follow-up PR or to Future Work. FR-1.14 is "Should" so this is within the spec's own priority model.

**Trade-off:** One fewer command in the bundle. Less help text, less test surface.

**Status:** CHALLENGED
**Suggested resolution:** Move FR-1.14 to Future Work "Identified" tier. If `ok status` is missed during implementation, add in follow-up.

**If true, implications:** Minor scope trim. No downstream effect.

---

## Confirmed Design Choices (summary)

- **DC1 (simpler alternative):** Two-process split (vs. single-process + launch.json aggregator) — the launch-json-and-port.md evidence convincingly justifies one entry pointing at UI. Alternative aggregator / two entries genuinely rejected.
- **DC1:** Hybrid spawn (vs. pure client-launched OR pure MCP-spawn) — D3 worldmodel finding convincingly establishes the MCP-spawn fallback is necessary for non-Claude clients; clean rejection.
- **DC1:** Extending existing `previewUrl` field (vs. new `ui` field) — D-007 is correct; the existing 3 tools have the shape and future tools inherit.
- **DC2 (stakeholder):** `ServerLockCollisionError` + bounded retry for cold-spawn race — existing machinery; battle-tested.
- **DC2:** Greenfield breaking changes — §D4 supersession is genuine and well-argued (FR-1.10 + D-003 cite the path).
- **DC3 (framing):** Complication in §1 — US-001 ↔ US-003 intersection ("Story 3 is precondition for Story 1 cross-client value") genuinely holds. The GTM dimension + customer dimension both depend on both stories.

---

## Key file references used in this challenge

- `/Users/andrew/Documents/code/open-knowledge/node_modules/@hocuspocus/server/src/Document.ts:135-147` — addDirectConnection/removeDirectConnection increments `directConnectionsCount`
- `/Users/andrew/Documents/code/open-knowledge/node_modules/@hocuspocus/server/src/Hocuspocus.ts:148-163` — `getConnectionsCount()` includes DirectConnections
- `/Users/andrew/Documents/code/open-knowledge/node_modules/@hocuspocus/server/src/DirectConnection.ts:26` — constructor increments; `:46-89` — disconnect path fires onDisconnect only on last connection
- `/Users/andrew/Documents/code/open-knowledge/node_modules/@hocuspocus/server/src/ClientConnection.ts:343-344` — `onConnect` fires only for WebSocket
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/server/src/standalone.ts:861` — CC1 `__system__` DirectConnection opened at startup
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/server/src/agent-sessions.ts:147,172-194` — persistent `AgentDirectConnection` per `(docName, agentId)`; never idle-closed
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/cli/src/config/schema.ts:17,24` — current server default port = 3000 (not port 0)
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/cli/src/commands/start.ts:222,226` — `httpServer.listen(config.server.port, ...)` — NOT port 0
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/cli/src/mcp/tools/preview-url.ts:67` — current helper reads `server.lock`
- `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/zero-ceremony-resume-spec/packages/app/src/server/hocuspocus-plugin.ts:108` — Vite plugin acquires `server.lock`
- https://code.claude.com/docs/en/desktop — `autoPort: true` field documented; `PORT` env var passed to subprocess
- https://nodejs.org/api/child_process.html — detached spawn with `stdio:[fd_out, fd_err]` for kernel-level stderr capture
