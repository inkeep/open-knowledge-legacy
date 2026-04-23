---
title: Vite dev plugin — call `createServer()` directly (Approach A)
description: Refactor `packages/app/src/server/hocuspocus-plugin.ts` to call `createServer()` from `@inkeep/open-knowledge-server` instead of re-implementing the wiring by hand. Eliminates dev/prod divergence across reconciliation, principal-auth, rescue-buffer, head-watcher, managed-rename-recovery, SyncEngine, keepalive grace, and presence-ts refresh. Scope is plugin-only; test-harness dedup becomes Future Work.
tags: [spec, server, vite, dev-plugin, dedup, createServer, bootServer, plugin-only]
status: Draft — 2026-04-23
---

# Vite dev plugin — call `createServer()` directly (Approach A) — Spec

**Status:** Approved — ready for implementation
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-23
**Baseline commit:** `050dfe53` (post-finalize; ready for /ship)
**Links:**
- Sibling spec that explicitly carves out this work: [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../2026-04-21-m6-cli-and-mcp-wiring/SPEC.md) §1 "Scope clarification — what M6 does not touch" names this exact refactor as out-of-scope for M6, handing it off here.
- Evidence: `./evidence/` (spec-local findings)
- Tracking: Slack thread (2026-04-22, Dima → Andrew) — "we should remove hocuspocus from vite, code duplication"

---

## 1) Problem statement

**Situation.** The repo has **one canonical server-wiring factory** — `createServer()` in `packages/server/src/standalone.ts` (1452 LOC) — plus an HTTP+WebSocket wrapping layer `bootServer()` in `packages/server/src/boot.ts` (514 LOC). Three known consumers share this canonical path today: CLI `ok start` (via `bootServer`), the Electron utility process (via `bootServer`), and the integration test harness (via `createServer` + hand-rolled HTTP layer mirroring `boot.ts`). Every server-side subsystem — persistence, file watcher, HEAD watcher, agent sessions, CC1 broadcaster, shadow repo, principal auth, managed-rename recovery, SyncEngine, reconciliation with rescue buffers — lives in this one path.

**Complication.** The Vite dev plugin that powers `bun run dev` (`packages/app/src/server/hocuspocus-plugin.ts`, 594 LOC) is the lone outlier — it does **not** call `createServer()`. It independently imports ~11 server primitives and wires its own `Hocuspocus` instance by hand, but stops short of the full set. Prior exploration (2026-04-22 session) confirmed it is missing nine server-side subsystems (`startHeadWatcher`, `recoverPendingManagedRename`, `principalAuthExtension`, `SyncEngine`, `saveInMemoryCheckpoint`, `incrementRescueBuffer`, `PARK_SNAPSHOT_ORIGIN`, `parkBranch`, `readParkedState`) and six HTTP-layer primitives (`keepaliveGraceMs`, `keepaliveGraceTimers`, `bumpPresenceTs`, `parseKeepaliveConnectionId`, `ensureProjectGit`, `closeAllForAgent`). It also uses the simple `createExternalChangeHandler` path for disk-watch events instead of the rich `handleDiskEvent` in `standalone.ts` that performs three-way `reconcile()`, saves rescue buffers, and flips lifecycle conflict markers.

Practical consequences (post-audit, per DC-H2: separating observed pain from structural risk):

**Observed pain — maintenance tax.** Every new agent API endpoint / observer extension / CC1 channel has to be added in **both** places or dev silently diverges from prod. Three documented "wire in dev" follow-ups visible in the recent PR history: #272 back-ported `/api/config`; #280 back-ported a keepalive routing fix; a "wire `AgentPresenceBroadcaster` in dev" follow-up (`fc80318a`) was needed after the shared-server multi-agent-presence work.

**Structural risk — not yet an observed incident.** The 9-subsystem gap (reconciliation, principal-auth, managed-rename recovery, SyncEngine, etc.) means a developer debugging those behaviors under `bun run dev` runs a different code path than `ok start`. Divergence is provable from code — no cited user-reported "cannot reproduce" incident. This spec future-proofs against a structural gap, not a documented failure mode. DC-H2 flagged the earlier framing as over-claiming correctness pain; the structural argument stands on its own merit (the maintenance tax alone is sufficient justification) so we retain Option A but are honest about the evidence base.

**Docs drift.** The AGENTS.md bootServer section (sentence appears twice — `AGENTS.md:264` and `AGENTS.md:1384`, both sections describe `bootServer`'s consumer list) claims the plugin "calls `createServer()` directly" — a statement that was aspirational at the time of writing and describes the **target** state of this refactor, not the current reality. The docs got ahead of the code. `CLAUDE.md` is a symlink to `AGENTS.md`.

**Resolution.** Refactor the Vite plugin to call `createServer()` directly (Approach A from prior exploration). The plugin keeps only Vite-specific wiring: config.yml resolution, `OK_TEST_CONTENT_DIR` override, `sirv` filter-aware asset serving over `contentDir`, SPA-fallback guard for unknown `/api/*` routes, `/api/config` synthesis (dev-only analogue of `ok ui`), `/collab` upgrade handler attached to **Vite's** HTTP server, `prependListener` ordering vs HMR. Everything else — server construction, extensions, watchers, broadcasters, reconciliation, principal, SyncEngine, keepalive grace — comes from `createServer()`. Estimated net delete: **~300–400 LOC** from the plugin.

Goal: **single source of truth for Hocuspocus server wiring.** New agent API endpoints, observer extensions, CC1 channels, and future server subsystems land once and are automatically available in dev mode.

## 2) Goals

- **G1.** Vite dev plugin calls `createServer()` from `@inkeep/open-knowledge-server` for all server-side construction. No hand-rolled `new Hocuspocus(...)`, no hand-wired persistence / API / server-observer / live-derived-index extensions, no hand-instantiated `AgentSessionManager` / `AgentFocusBroadcaster` / `AgentPresenceBroadcaster` / `CC1Broadcaster` / `BacklinkIndex` / `createContentFilter` / `startWatcher`.
- **G2.** Developer running `bun run dev` gets the same server behavior as `ok start` across: external-change reconciliation (three-way merge), principal-auth token pinning, HEAD-watcher branch park/restore, managed-rename recovery, SyncEngine opt-in lifecycle, rescue-buffer creation on dirty-delete, `bumpPresenceTs` between MCP tool calls, `parseKeepaliveConnectionId` validation, `closeAllForAgent` on keepalive close, `ensureProjectGit` fail-fast.
- **G3.** Vite-specific behavior preserved: `bun run dev` stays a **single-process** dev workflow; `OK_TEST_CONTENT_DIR` isolation still works for Playwright; `/api/config` still served from the plugin before Hocuspocus routes are ready; `sirv` still serves filter-aware assets over `contentDir`; `server.lock` collision with `ok start` against the same contentDir still fires fast.
- **G4.** `prependListener('upgrade')` ordering vs Vite's HMR handler preserved (plugin still wins the `/collab` and `/collab/keepalive` routes).
- **G5.** HMR `configureServer` re-invocation behavior preserved or improved — whatever today's warn-and-continue path does, post-refactor must be equivalent or stricter (no *worse* HMR behavior).
- **G6.** AGENTS.md's stale Vite-plugin claim at both occurrences (`:264` and `:1384`) becomes **true** when this refactor merges, and the corrigendum breadcrumbs are removed in the same atomic edit.
- **G7.** `bun run check` stays green; `bun run check:full:parallel` stays green (no new Playwright regressions).

## 3) Non-goals

- **[NEVER] NG1.** Split `bun run dev` into two processes (Dima's "use Vite proxy" sketch, Approach C in prior exploration). That changes the dev UX, not just the wiring. If it ever becomes the right endpoint, it gets its own spec. *[NEVER — changes dev workflow in ways this spec deliberately avoids.]*
- **[NOT NOW] NG2.** Extract a shared `attachCollabHttpServer(httpServer, serverInstance, opts)` helper used by `boot.ts`, the plugin, and the test harness. Approach B from prior exploration; wider refactor with higher merge-surface risk. Not needed to eliminate the dev/prod divergence. *Revisit if:* a third consumer of the HTTP wiring layer emerges, or if boot.ts's keepalive-grace logic gets a third modification cycle.
- **[NOT NOW] NG3.** Migrate the integration test harness (`packages/app/tests/integration/test-harness.ts:createTestServer`) onto the same shared helper. Its HTTP-layer duplication is cosmetic (it already calls `createServer()`) and carrying it here bloats scope. *Revisit with NG2.*
- **[NEVER] NG4.** Remove `/api/config` synthesis from the dev plugin. It's a dev-only analogue of what `ok ui` provides in prod (separate process); the Vite plugin IS the UI host in dev.
- **[NEVER] NG5.** Gate SyncEngine off in dev. SyncEngine is already opt-in by default (`syncEnabled !== true` early-return at `sync-engine.ts:262`) — "wire it through" means two benign `git` subprocess calls at dev startup when the developer has not opted in, and actual sync if they have. No gating needed. *(Decision D2 below.)*
- **[NOT UNLESS] NG6.** Re-enable M6's scope-clarification enumeration ("seven entry points / three wiring paths") without independent verification. M6's own audit flagged this as unverified (`specs/2026-04-21-m6-cli-and-mcp-wiring/meta/audit-findings.md` finding #11). *Only if:* a future spec audits the full collab entry-point surface as its own deliverable.

## 4) Personas / consumers

1. **P1 — Claude Code agents (primary)** working in this repo, adding new agent API endpoints / observer extensions / CC1 channels / server subsystems. Pain today: changes silently miss dev because the plugin doesn't share the wiring. The Vite-plugin re-implementation is precisely the shadow tax every new server surface pays.
2. **P2 — Repo contributors** writing server-side features (e.g., the author of the multi-agent-presence work who had to open a follow-up PR to wire the broadcaster into the plugin separately). Pain: cannot trust `bun run dev` reproduces the prod path for verification.
3. **P3 — Developers running `bun run dev` for ad-hoc verification** of external-disk reconciliation, principal-auth, rename recovery, or branch-switching park/restore flows. Pain today: silent behavioral gap vs `ok start`.

Note: end-users of the shipping product (Electron desktop app, CLI) are **not** affected by this refactor. The change is internal to the dev workflow and has no user-visible product surface.

## 5) User journeys

*See §4 for persona framing. Journeys here are keyed to the three personas.*

**P1 — Claude Code agent adding a new agent API endpoint (happy path).**
1. *Discovery:* Agent reads CLAUDE.md + `packages/server/src/api-extension.ts`. Learns that API routes live in `createApiExtension`.
2. *Setup:* Agent adds a new route handler to `api-extension.ts`. `createServer()` wires it by default.
3. *Aha moment:* Running `bun run dev`, the new endpoint is immediately reachable at `http://localhost:5173/api/<new-route>` — no second wiring step, no follow-up PR.
4. *Debug:* If the handler fails, logs behave identically to `ok start` (same extension chain, same logger).
5. *Ongoing:* No "wire in dev" PR required. No drift.

*Failure path (today, pre-refactor):* Agent adds route to `api-extension.ts`. Route works in `ok start` + tests. `bun run dev` 404s because the dev plugin wires its *own* `createApiExtension` invocation and — for some primitives like `principalAuthExtension` — doesn't wire the surrounding chain at all. Agent must diff standalone.ts and hocuspocus-plugin.ts to find the missing wiring and port it over. This is the pain.

**P3 — Developer debugging external-change reconciliation.** *(Structural scenario per DC-H2 — not yet observed as an incident, but a demonstrable code-path divergence.)*
1. *Setup:* Developer runs `bun run dev`, edits `foo.md` on disk via another tool while the browser editor has unsaved local changes.
2. *Today:* Dev plugin's disk-watch handler calls `createExternalChangeHandler(hocuspocus)`, which uses `applyExternalChange` directly — no three-way merge, no rescue buffer. The browser's local edits are overwritten. Under `ok start` the same scenario runs `handleDiskEvent` with `reconcile()` + rescue buffer. A developer who tests the code path only via `bun run dev` gets a different outcome than a user running the shipped CLI.
3. *Post-refactor:* Dev plugin delegates to `createServer()`, which wires `handleDiskEvent` with `reconcile()` + rescue-buffer checkpoint. Behavior matches `ok start`. No silent overwrite.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1. Vite plugin calls `createServer()` exactly once and does not re-implement any server-wiring primitive | **Positive assertion (per DC-L6):** `rg "\bcreateServer\s*\(" packages/app/src/server/hocuspocus-plugin.ts` returns exactly 1 match. **Negative assertion (covers all 11 primitives per M2):** `rg "\b(new Hocuspocus|createApiExtension|createServerObserverExtension|createPersistenceExtension|createLiveDerivedIndexExtension|createContentFilter|AgentSessionManager|AgentFocusBroadcaster|AgentPresenceBroadcaster|CC1Broadcaster|BacklinkIndex|startWatcher)\b" packages/app/src/server/hocuspocus-plugin.ts` returns 0 matches (excluding `createServer` invocations). Rotation-resilient: new primitives added to `@inkeep/open-knowledge-server` are automatically absent from the plugin if it delegates to `createServer()`. | Structural assertion; caught by shell check in the refactor PR's verification notes, and reinforced by the existing knip-clean gate (which fires when dead-export surfaces appear) |
| Must | FR2. Dev mode inherits `handleDiskEvent` reconciliation | External disk edit while dev-server-browser has dirty buffer results in three-way merge outcome (noop/clean/merged/conflicts/refused) matching `ok start`. | Integration test covering reconcile path under `bun run dev` equivalent setup |
| Must | FR3. Dev mode wires `principalAuthExtension` | Browser client passing a principal-ID token via HocuspocusProvider gets `ctx.principalId` pinned server-side per the same rules as prod (D50/US-024). | Unit test on `onAuthenticate` behavior with stubbed context |
| Must | FR4. Dev mode wires `startHeadWatcher` + BatchBegin/BatchEnd | Branch switch during `bun run dev` parks WIP via `parkBranch` and restores on return. | Integration test simulating HEAD change |
| Must | FR5. Dev mode wires `recoverPendingManagedRename` on startup | Crash-mid-rename recovered on next `bun run dev` start. | Integration test |
| Must | FR6. Dev mode wires `SyncEngine` (opt-in default behavior) | `bun run dev` startup runs the same SyncEngine.start() lifecycle — `git remote -v` + `git rev-parse HEAD` + `syncEnabled` check + early-return when not enabled. No network, no mutation. | Startup log line `[sync] sync not enabled — staying inactive` appears in dev logs |
| Must | FR7. Dev mode wires keepalive grace-period timer (10s default) + `bumpPresenceTs` + validated `parseKeepaliveConnectionId` | MCP keepalive WS close → 10s grace → `closeAllForAgent` + `clearFocus` + `clearPresence`. Presence-ts refresh bumps every 3s while keepalive open. `connectionId` query-param validated against `AGENT_ID_RE`. | Integration test mirroring `session-cleanup.test.ts` under dev-plugin codepath, or shared unit test of the extracted wiring |
| Must | FR8. Dev mode calls `ensureProjectGit` before `createServer()` fires | Missing `.git/` in project root fails fast with the same error shape as `ok start`. | Unit test with stubbed `ensureProjectGit` throw |
| Must | FR9. `bun run dev` remains single-process | No additional process spawned by the plugin. Vite owns HTTP/WS; plugin attaches to it. | Process observation smoke (`ps aux` at dev startup shows one Vite-rooted process tree) |
| Must | FR10. `server.lock` collision still fires fast | `bun run dev` then `ok start` in the same contentDir: second invocation throws `ServerLockCollisionError`. | Existing lock test coverage (no regression) |
| Must | FR11. `OK_TEST_CONTENT_DIR` isolation still works | Playwright webServer sets the env var; plugin resolves contentDir against it; per-test isolation holds. | Existing Playwright suite (no regression) |
| Must | FR12. `/api/config` still served before Hocuspocus routes are ready | First `useCollabUrl` tick gets a valid `collabUrl` even during mid-boot races. | Existing test coverage (no regression) |
| Must | FR13. `sirv` filter-aware asset serving over `contentDir` preserved | Assets under contentDir reachable; excluded paths 404. | Existing test coverage (no regression) |
| Must | FR14. `prependListener('upgrade')` ordering preserved | `/collab` and `/collab/keepalive` routes take precedence over Vite HMR upgrade handler. | Existing `docs/m6-spec-sharpen`-adjacent keepalive test coverage |
| Should | FR15. Plugin's HMR `configureServer` re-invocation path at least preserves today's warn-and-log behavior | `configureServerInvocations > 1` logs warning matching today's phrasing; post-refactor server does not leak resources on the orphan path. | Behavioral inspection + log assertion |
| Should | FR16. AGENTS.md claim (both occurrences, `:264` and `:1384`) becomes true when refactor merges | After merge, `packages/app/src/server/hocuspocus-plugin.ts` grep for `createServer(` has 1+ match. Both corrigendum breadcrumbs (per D3 below) are removed in the same PR; sentence replaced with D7 target prose. | Structural check |
| Must | FR17. Net LOC delta from plugin + removed supporting files is clearly negative | `git diff --stat` shows plugin shrunk by ≥200 LOC, and `dev-shadow-init.ts` + `dev-shadow-init.test.ts` (263 LOC combined) are deleted. Expected total net delete: ~560-660 LOC. Hard floor: -400 LOC total | Mechanical gate |

### Non-functional requirements

- **Performance:** Dev-server startup latency must not regress by more than 500ms p50 (measured: plugin init → `configureServer` → first `/api/config` 200). Current plugin does ~11 primitive initializations at module-load; `createServer()` is similar work. Likely a wash.
- **Reliability:** `bun run dev` must not become *more* fragile. If `createServer()` throws during init, the plugin must release the server lock and surface the error cleanly (today's pattern via try/catch around extension wiring — preserve).
- **Security/privacy:** `principalAuthExtension` now runs in dev — same unauthenticated-token posture as prod (D50 LOCKED; principal ID pinned against loaded principal when loaded). No new security surface.
- **Operability:** Log-line parity with `ok start` is a feature, not a bug — debuggers should see the same log stream regardless of how they started the server. Logger identity (`getLogger('server')` vs bracket-prefixed `[hocuspocus]` plugin logs) should be made consistent or deliberately distinguished.
- **Cost:** Zero — local dev-machine resource use only.

## 7) Success metrics & instrumentation

- **Metric 1: Dev/prod wiring drift.**
  - Baseline: ~11 primitives wired in both places today; 9 subsystems missing from dev.
  - Target: 0 primitives wired in both places post-refactor. Dev inherits everything from `createServer()`.
  - Instrumentation notes: structural grep in CI or a knip-style check on the plugin file.
- **Metric 2: "Wire in dev" follow-up PRs after merging server-side features.**
  - Baseline: visible in recent git history (PR #272, PR #280, the multi-agent-presence follow-up).
  - Target: zero post-refactor. If one appears, the refactor has regressed.
  - Instrumentation notes: observational — if we see such a PR, retrospect on why `createServer()` didn't handle it.
- **What we will log/trace:**
  - Preserve all current `[hocuspocus] …` and `[collab] …` structured warn/info lines from the plugin.
  - Inherit all `[server] …` structured log lines from `createServer()` (new in dev).
  - Emit a one-time `[hocuspocus] using @inkeep/open-knowledge-server createServer() — dev-mode parity active` info log on plugin init so operators can confirm the post-refactor codepath at a glance.
- **How we'll know adoption/value:** The next server-side feature to land (whatever it is) ships without a companion "wire in dev" PR.

## 8) Current state (how it works today)

*Details backed by prior exploration session 2026-04-22 and `evidence/` files.*

**Summary of current behavior (high-level):**
- `packages/app/src/server/hocuspocus-plugin.ts` re-implements ~11 primitives from `@inkeep/open-knowledge-server` at module-load.
- Uses `new Hocuspocus(...)` directly. Calls `createPersistenceExtension`, `createApiExtension`, `createServerObserverExtension`, `createLiveDerivedIndexExtension`, instantiates `AgentSessionManager`, `AgentFocusBroadcaster`, `AgentPresenceBroadcaster`, `CC1Broadcaster`, `BacklinkIndex`, `createContentFilter`, `startWatcher`.
- Uses `createExternalChangeHandler(hocuspocus)` for disk-watch callback (simple path — no three-way merge).
- HTTP integration: Vite's `server.httpServer.prependListener('upgrade', ...)` routes `/collab` and `/collab/keepalive` before HMR. `/api/*` via `server.middlewares.use(...)` dispatch to `hocuspocus.hooks('onRequest')`.
- Lock acquisition at module-load; port-write on `'listening'` event; HMR `configureServer` re-invocation currently warn-and-continue.

**Key constraints (inherited by the refactor):**
- Vite owns the HTTP server lifecycle. Plugin cannot spawn its own.
- Vite plugin lifecycle: `configureServer` runs once per dev-server lifetime normally; may re-run on HMR in edge cases.
- `@parcel/watcher` native dep must load correctly in Bun (already working).

**Known gaps/bugs discovered during research (Current-state survey):**
- 9 subsystems + 6 HTTP-layer primitives missing (see §1 Complication).
- AGENTS.md:264 + AGENTS.md:1384 (both bootServer sections carry the same sentence verbatim) are stale-by-aspiration — describe the target state of this refactor.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

No end-user-facing surface changes. Developer-facing surfaces:
- `bun run dev` continues to behave as today from the outside (single-process, localhost:5173, HMR works).
- Log stream gains `[server] …` lines from the shared `createServer()` path.
- Previously-dormant behaviors (reconciliation, principal-auth, SyncEngine opt-in detection) now fire in dev.

### System design

**Architecture overview.** The Vite plugin becomes a thin adapter between `@inkeep/open-knowledge-server`'s `createServer()` and Vite's `configureServer` lifecycle. It retains:
- Config.yml resolution (plugin-local, pre-createServer).
- `OK_TEST_CONTENT_DIR` env-var override (pre-createServer).
- `/api/config` synthesis (Vite-only; `ok ui` handles this in prod).
- `sirv` filter-aware asset serving (Vite middleware chain).
- `/api/*` dispatch to `hocuspocus.hooks('onRequest', ...)` via `server.middlewares.use(...)` (instead of `bootServer`'s raw `httpServer` request handler — because Vite wants to own the middleware chain).
- `/collab` + `/collab/keepalive` upgrade routing on Vite's `server.httpServer.prependListener('upgrade', ...)`.
- HMR `configureServerInvocations > 1` detection + warn.

Delegates to `createServer()`:
- All extension wiring.
- All watcher lifecycle.
- Shadow repo init, principal load, managed-rename recovery, HEAD watcher, SyncEngine.
- Keepalive grace timer primitives — **open question:** borrowed from `boot.ts` (copy), or extracted as shared helper? *Tracked as OQ1 below; leaning copy-for-now to keep scope tight.*

**Data model.** No changes.

**API/transport.** No API/transport changes. Dev-mode API surface becomes a superset of today's (gains any route that was wired in `createServer()` but missing from the plugin — e.g., if `principalAuthExtension` adds observable behavior on `onAuthenticate`).

**Auth/permissions.** `principalAuthExtension` now active in dev. Token-based principal pinning mirrors prod.

**Enforcement point(s).** Structural grep gate in CI (FR1); net-LOC gate (FR17). Optional pre-commit or knip-adjacent check.

**Observability.** New `[server] …` log lines merge into dev output. Plugin's own `[hocuspocus] …` and `[collab] …` bracket-prefixed lines preserved.

### Alternatives considered

- **Option A (chosen) — Plugin calls `createServer()` directly.** Keeps Vite-specific wiring in the plugin; delegates server construction. Smallest behavioral delta beyond closing the divergence. ~300–400 LOC delete.
- **Option B — Extract shared `attachCollabHttpServer(httpServer, serverInstance, opts)` helper used by `boot.ts`, plugin, and test harness.** Larger refactor; merges the HTTP-upgrade + keepalive-grace logic into one helper. Cleaner architecturally, but widens merge-conflict surface (boot.ts, test-harness.ts, plugin.ts all touched simultaneously). Deferred to Future Work (NG2).
- **Option C — Vite `server.proxy` to a standalone `ok start`.** Zero duplication but changes dev UX to two processes. Out of scope (NG1); would be its own spec.

**Why Option A.** Matches the scope carved out by M6's "scope clarification" paragraph (baton-pass). Plugin is the actual site of functional divergence; test-harness + boot.ts duplication is cosmetic. Smallest wedge that delivers the goal.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Scope is plugin-only; test harness and boot.ts HTTP-layer duplication deferred as NG2/NG3 | Cross-cutting | **LOCKED** (user 2026-04-23) | No (reversible — can promote NG2 later) | Plugin is where functional divergence lives; test-harness duplication is cosmetic | Intake session 2026-04-23 | Scope stays narrow; Option B remains viable as Future Work |
| D2 | SyncEngine wired through to dev without gating | Technical | **LOCKED** (user 2026-04-23) | No | SyncEngine is opt-in by default (`sync-engine.ts:262` early-return); "wired" means two benign local `git` subprocess calls at startup unless user has opted in | `packages/server/src/sync-engine.ts:231-269` evidence/sync-engine-startup-behavior.md (to be written) | No new flag needed on `createServer()`; dev behavior matches prod for any developer who opted in |
| D3 | CLAUDE.md correction via corrigendum breadcrumb now; sentence rewrites to current target prose when refactor PR merges (matches repo's `<br>_[Corrected…]_` precedent) | Product/Docs | **LOCKED** (user 2026-04-23) | No | Option 3 from intake — strictly dominates "fix inline" (agents see warning immediately) and "separate doc PR" (no rewrite-then-rewrite churn) | Intake 2026-04-23; repo precedent at CLAUDE.md post-ship-corrigendum section | Breadcrumb lands in scaffolding commit; refactor PR removes breadcrumb + updates sentence in one atomic edit |
| D4 | Spec directory: `specs/2026-04-23-vite-plugin-createserver-dedup/` | Product | **LOCKED** (user 2026-04-23) | No | Default naming per CLAUDE.md specs path contract | — | — |
| D5 | Keepalive + presence-ts-refresh + parseKeepaliveConnectionId wiring is **copied from `boot.ts:244-396`** into the plugin rather than extracted to a shared helper in this refactor. The copy covers `boot.ts:244-254` (grace-timer state: `KEEPALIVE_GRACE_MS`, `keepaliveGraceTimers`, `keepaliveGraceInflight`, `shuttingDown`) AND `boot.ts:255-396` (the `httpServer.on('upgrade', ...)` handler using that state). Post-audit per DC-H1: the challenger proposed a narrower Option B' (extract scoped to boot.ts + plugin only; harness excluded). That alternative is plausible and the "third copy" framing in the original rationale was wrong per audit finding L10 — **post-refactor the copy exists in exactly two places (boot.ts + plugin); the test harness hand-rolls HTTP but does NOT wire these primitives today**. Retaining D5 LOCKED with updated rationale: extraction in this spec would add a new public API (`attachCollabHttpServer`) to `@inkeep/open-knowledge-server` — a different risk surface than copying known-safe code. NG2's trigger criterion is broadened (per DC-L8) to include "any hardening requirement that would need to apply to both copies" | Technical | **LOCKED** (user 2026-04-23; rationale strengthened post-audit 2026-04-23) | No | Copy preserves scope discipline: no public API surface changes to `@inkeep/open-knowledge-server`. Extraction is Future Work (NG2 Explored). The "third copy" framing from original rationale was a misread — corrected here | `evidence/collab-entry-point-taxonomy.md` + SPEC.md §15 Explored + `meta/design-challenge.md` DC-H1 + `meta/audit-findings.md` L10 | When NG2 (Option B') lands, both copies collapse to one shared helper call |
| D6 | Dev-plugin logger identity **unchanged** — plugin keeps bracket-prefixed `[hocuspocus] …` / `[collab] …` console lines for its own messages; `createServer()`'s pino `[server]` lines merge into dev output | Technical/Ops | **LOCKED** (user 2026-04-23) | No | Log unification is a separate polish concern; out of scope for the divergence fix. Added as Future Work Noted | Intake 2026-04-23; SPEC.md §15 Noted | Operators see dual log styles in dev. Accepted |
| D7 | Target prose for the CLAUDE.md/AGENTS.md sentence after refactor lands: *"**Vite dev plugin** (`packages/app/src/server/hocuspocus-plugin.ts`) — calls `createServer()` directly and attaches to Vite's existing HTTP server; it does not need `bootServer`'s HTTP-wrapping layer. Shares the `server.lock` contract so `bun run dev` and `ok start` against the same `contentDir` collide fast."* | Product/Docs | **LOCKED** (user 2026-04-23) | No | Refactor PR replaces the breadcrumb + stale sentence with this prose atomically | Breadcrumb anchor written 2026-04-23 | Implementer uses this exact string; no re-drafting at PR time |
| D8 | Plugin invokes `createServer()` **lazily inside `configureServer` on first invocation, gated by a module-scope singleton**. `ensureProjectGit(PROJECT_ROOT)` is awaited immediately before the first `createServer()` call in the non-test-isolated branch (mirrors `bootServer`'s `ensureProjectGitFn` hook; fail-fast via thrown `ProjectGitInitError`). In `isTestIsolated` branch, skip `ensureProjectGit` — test tmpdirs lack `.git/`, shadow init degrades silently. HMR re-invocation of `configureServer` reuses the existing `ServerInstance` via the singleton gate | Technical | **LOCKED (amended 2026-04-23 post-implementation)** — originally locked at module-load invocation; amended to lazy `configureServer` invocation after `vite build` was observed to hang for 10+ min because `createServer()`'s async init starts a `@parcel/watcher` subscription that keeps the event loop alive past the bundle step. The DC-M4 challenger finding from the audit anticipated this failure mode | No | Same-pid lock acquire is idempotent (`process-lock.ts:138-143`). `createServer()` itself does NOT call `ensureProjectGit` — every existing consumer calls it upstream (bootServer via `ensureProjectGitFn`; test harness explicitly at `test-harness.ts:119`). Plugin must preserve this contract for `.git/`-fail-fast UX. Lazy init means `vite build` can load the plugin module for config resolution without triggering any server side effects — `configureServer` only fires for `vite` / `vite dev`, not for build | `evidence/lifecycle-module-load-vs-configureServer.md` + `meta/design-challenge.md` DC-M4 + `meta/_changelog.md` 2026-04-23 Phase 3 amendment | `runDevShadowInit` deleted per D10. `configureServer` is now `async` (Vite supports async plugin hooks). The singleton gate `let srv: ServerInstance \| null = null` at module scope handles HMR re-entry safely |
| D9 | Shutdown wiring — plugin's `server.httpServer.on('close')` handler calls `await srv.destroy()` (Hocuspocus + watchers + shadow + lock, via `createServer()`'s unified teardown). Process-level `process.once('exit', ...)` retains a sync `releaseServerLock(srv.lockDir)` as defensive fallback for crashes that skip the HTTP close event. No separate SIGINT/SIGTERM handlers — Vite owns signal routing and fires `httpServer.close` on shutdown | Technical | **LOCKED** (agent investigation 2026-04-23) | No | Today's plugin tears down via TWO paths (watcher/CC1 cleanup in httpServer 'close' handler; lock release in process signal handler). Post-refactor, `srv.destroy()` consolidates both into one await'd async path. Sync `exit` handler stays as defense-in-depth for non-graceful exits | — | ~30 LOC of today's signal handler + httpServer close handler code consolidates to a single `async () => { await srv.destroy(); }` |
| D10 | **Files to delete** in the refactor PR: `packages/app/src/server/dev-shadow-init.ts` (91 LOC) + `packages/app/src/server/dev-shadow-init.test.ts` (172 LOC). Both have exactly one consumer (the plugin) and their responsibilities are fully absorbed by explicit `ensureProjectGit` + `createServer()`'s internal `initShadowRepo`. `api-config-handler.ts` + its test stay — still needed for dev-mode `/api/config` synthesis. `agent-flow.test.ts` unaffected (standalone; uses raw `Hocuspocus`) | Technical | **LOCKED** (agent investigation 2026-04-23) | No | grep verified: `dev-shadow-init` imported only from `hocuspocus-plugin.ts`. `agent-flow.test.ts` imports from `@hocuspocus/server` directly, not the plugin | `rg -n dev-shadow-init packages/ --include="*.ts"` output | Total net delete: plugin shrink (~300-400) + dev-shadow-init.ts+test (263) = **~560-660 LOC**. Revise FR17 accordingly |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Keepalive grace-period + presence-ts-refresh + parseKeepaliveConnectionId — copy from `boot.ts` verbatim into the plugin, or extract as a shared helper now? If copy: incurs the second-copy cost. If extract: approaches NG2 territory. | Technical | P0 | Yes (blocks implementation shape) | Done. Resolved by D5 LOCKED — copy from boot.ts. Partial extract undermines NG2 scope discipline; Option B is the extraction vehicle. | **Resolved** 2026-04-23 |
| Q2 | Lock/init lifecycle — does `createServer()` run at module-load (today's plugin pattern) or inside `configureServer` (Vite-idiomatic)? Module-load preserves HMR behavior; `configureServer` aligns with Vite plugin lifecycle but HMR re-invocation needs explicit server-reuse logic. | Technical | P0 | Yes | Done. Resolved by D8 LOCKED — module-load. Same-pid lock acquire is idempotent; matches current plugin shape; no singleton-gate complexity; HMR warn-and-continue preserved. See `evidence/lifecycle-module-load-vs-configureServer.md`. | **Resolved** 2026-04-23 |
| Q3 | Logger identity — `createServer()` uses pino `[server]` namespace; plugin uses `console.log('[hocuspocus] …')` bracket style. Post-refactor, do we unify (everything via pino) or keep plugin-local lines bracket-prefixed for operator legibility? | Technical | P0 | No (affects operability NFR but not correctness) | Done. Resolved by D6 LOCKED — preserve dual style. Log unification added to Future Work Noted. | **Resolved** 2026-04-23 |
| Q4 | Verify the M6 audit's "seven entry points / three wiring paths" taxonomy. Two entries (`ok mcp` as spawner; Electron attach mode) were not verified during prior exploration — are they actual third-wiring-path consumers or do they route through `bootServer` / `createServer`? | Technical | P0 | No (surfaces NG2 correctness) | Done. `evidence/collab-entry-point-taxonomy.md`. M6 errata: `ok mcp` spawns `ok start` (consumer of P1, not a new path); Electron attach mode reads server.lock (consumer); Playwright fixture spawns `bun run dev` (consumer of P3). Corrected count: **3 producer paths, 4 producer callers**. Post-refactor: 2 producer paths. | **Resolved** 2026-04-23 |
| Q5 | AGENTS.md stale-sentence correction — what's the exact replacement? Draft it now so the breadcrumb points at concrete target prose. | Product/Docs | P0 | No | Done. Resolved by D7 LOCKED — prose drafted and stored in Decision Log. Refactor PR applies exact string at both occurrences (`:264` and `:1384`). | **Resolved** 2026-04-23 |
| Q6 | `createServer()`'s `onAgentWrite` option — plugin doesn't set it today; should it? Test harness sets it. | Technical | P2 | No | Defer — only matters if dev has a consumer. | Deferred |
| Q7 | `localOpCliArgs` — plugin doesn't pass it today; `createServer()` uses it to wire SyncEngine credential args. | Technical | P2 | No | Defer — relevant only when user has opted into sync in dev contentDir. | Deferred |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `createServer()` can be invoked from the Vite plugin's module-load path without incompatible Node/Bun runtime differences from its current CLI/Electron/test-harness consumers | **HIGH** (upgraded post-D8 investigation) | Traced via `evidence/lifecycle-module-load-vs-configureServer.md` — same-pid lock is idempotent; test-harness already invokes createServer directly; no boot.ts-specific wrapping assumption | — (verified) | **Verified** 2026-04-23 |
| A2 | Vite's `server.middlewares.use(async (req, res, next) => { ... await hocuspocus.hooks('onRequest', ...); ... })` dispatch is semantically equivalent to boot.ts's raw `httpServer` request handler for the /api/* surface | HIGH | Middleware chain and raw handler both terminate at `hocuspocus.hooks('onRequest', ...)` — current plugin already does this pattern and it works | Continuous | Active |
| A3 | The M6 branch (`docs/m6-spec-sharpen`) will not land code changes to `packages/server/` or `packages/app/src/server/` between now and merge | HIGH | Already verified via `git diff main..origin/docs/m6-spec-sharpen --stat` (zero LOC in both paths) | Until M6 merges | Active |
| A4 | Dima's earlier refactor-attempt blocker was a local-env Bun/Node issue unrelated to this refactor's technical approach | HIGH | Confirmed by Andrew in intake session 2026-04-23 | — | Confirmed |
| A5 | Post-refactor dev-mode behavior is strictly a superset of today's — no existing dev-mode capability is lost | HIGH | `createServer()` is a superset of what the plugin wires today (confirmed by prior exploration subsystem enumeration) | Iterate phase | Active |

## 13) In Scope (implement now)

- **Goal:** Delete ~300–400 LOC from `packages/app/src/server/hocuspocus-plugin.ts` + delete `dev-shadow-init.ts` + test (263 LOC) per D10; make the plugin call `createServer()` from `@inkeep/open-knowledge-server` for all server-side wiring. Net delete target: ~560–660 LOC.
- **Non-goals:** See §3.
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Andrew Mikofalvy.
- **Next actions:** complete Scaffold → Worldmodel → Backlog → Iterate phases; populate detailed In-Scope section at Verify-and-Finalize.
- **Risks + mitigations:** see §14.
- **What gets instrumented/measured:** see §7.

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| R1. `createServer()`'s async init (shadow-repo open, HEAD-watcher start, file-watcher start) behaves differently under Vite's `configureServer` than under CLI/Electron due to lifecycle ordering | MED | MED | Investigate Q2 during iterate; run full Playwright suite on local branch before PR | Andrew |
| R2. HMR re-invocation of `configureServer` creates two `createServer()` calls that race on the server lock | MED | HIGH | `createServer()` already throws `ServerLockCollisionError` on double-acquire; plugin must either gate module-load or handle the HMR path explicitly | Andrew |
| R3. Test harness and Vite plugin share a lock-dir on the same contentDir when running concurrently (Playwright in-process + dev server) | LOW | MED | Existing `OK_TEST_CONTENT_DIR` isolation handles this; no new risk introduced by refactor | Andrew |
| R4. `principalAuthExtension` now active in dev accidentally breaks a test that didn't expect `ctx.principalId` to be set | LOW | LOW | Integration suite run pre-PR will catch; principal-auth is onAuthenticate-only so untokened connections are unaffected | Andrew |
| R5. Log-line shape changes from bracket-prefixed `[hocuspocus] …` to pino `[server]` break an operator's `grep` pattern | LOW | LOW | Preserve bracket-prefixed lines for plugin-local messages; only `[server]` lines are added, not substituted | Andrew |
| R6. `/collab` `prependListener('upgrade')` order changes relative to HMR under the new plugin structure | LOW | HIGH | Explicit test; keep `prependListener` shape intact; copy the current upgrade handler verbatim into the post-refactor plugin | Andrew |
| R7. Extract vs. copy decision (Q1) delays implementation | MED | LOW | Time-box Q1 resolution in iterate; default to copy if undecided at start of implementation | Andrew |

## 15) Future Work

### Explored

- **Extract `attachCollabHttpServer(httpServer, serverInstance, opts)` shared helper (Option B from prior exploration).**
  - What we learned: `boot.ts:244-396` has ~150 LOC of HTTP-upgrade + keepalive-grace + presence-ts-refresh wiring. The test harness has a simplified copy. The plugin (post-Approach-A) will have a third copy (or borrow from boot.ts).
  - Recommended approach: Extract a pure helper `attachCollabHttpServer({ httpServer, serverInstance, keepaliveGraceMs, log }): { detach: () => void }` that boot.ts, the plugin, and the test harness all call.
  - Why not in scope now: Wider merge surface; three consumer paths all need to migrate in one PR or accept an intermediate state. Plugin's divergence problem (Approach A's focus) is already solved without it.
  - Triggers to revisit: third consumer emerges, or keepalive-grace logic gets a third modification cycle (i.e., this helper is duplicated in three places).
  - Implementation sketch: Extract `boot.ts:244-396` (grace-timer state + `httpServer.on('upgrade', ...)` handler as a single unit — same range as D5's copy target) into a new `packages/server/src/collab-http-attach.ts`. `bootServer` calls it after `listen()`. Plugin calls it inside `configureServer` with `server.httpServer`. Test harness eventually migrates under NG3. Delete the parallel copies.
  - **Trigger clarification (post-audit, DC-L8):** Revisit NG2 if any of: (i) a third consumer of this HTTP wiring emerges, or (ii) `boot.ts`'s keepalive-grace logic receives a hardening change (bound the timer map, add rate limits, adjust grace duration) that would need to land in both the boot.ts and plugin copies, or (iii) any keepalive behavior drifts between the two sites.

### Identified

- **Migrate `createTestServer` onto the same helper (NG3).** Known to be duplicative; not deeply investigated. Needs own spec pass when NG2 lands.

### Noted

- **`localOpCliArgs` / `onAgentWrite` passthrough for dev-mode consumers.** Currently plugin doesn't pass these to a hypothetical `createServer()`. If a dev-mode feature emerges that needs them, plumb through.
- **Dev-mode `ensureProjectGit` UX polish.** `ensureProjectGit` auto-creates `.git/` via `git init` if absent, so fresh-clone scenarios are fine. Fail-fast only fires on a broken `git` binary / corrupt config (rare). Today's plugin uses `runDevShadowInit` (similar fail-fast path via `handleDevShadowInitError` which also `exit(1)`s on `ProjectGitInitError`) — so the refactor preserves today's behavior, not introduces a regression.
- **Unified logger namespace (DC-L7).** If the plugin's bracket-prefixed `[hocuspocus]` lines become annoying alongside pino `[server]` lines, consider migrating the plugin to pino with a `[dev-plugin]` sub-namespace. DC-L7 also flagged log-volume increase as a first-time-contributor UX concern — consider a `LOG_LEVEL=warn` default for dev-mode pino, with `LOG_LEVEL=info bun run dev` as the opt-in for debugging. Out of scope for this refactor.
- **Unbounded keepalive timer-map inheritance (DC-L8).** Post-refactor, both `boot.ts` and `hocuspocus-plugin.ts` carry the same unbounded `keepaliveGraceTimers: Map<string, Timeout>` from boot.ts:247. Not introduced by this spec but inherited from the copied block. If a future hardening (timer map cap, eviction policy, rate limit) lands, it must land in both sites until NG2's Option B' extraction collapses them. See NG2 triggers.
- **Module-load side effects on non-Vite plugin importers (DC-M4).** Today's plugin does module-load side effects already; the refactor adds `ensureProjectGit` + full `createServer()` init at module load via top-level `await`. No current test or tool imports the plugin module outside a Vite dev-server context (grep-verified). If a future use case requires factory-only imports (e.g., a lint rule that introspects the plugin's shape), switch to `configureServer + singleton gate` per the evidence file's Option (b). For now, module-load with top-level await is adequate.

## 16) Agent constraints

- **SCOPE:** `packages/app/src/server/hocuspocus-plugin.ts` primary (shrinks ~300-400 LOC). `packages/app/src/server/dev-shadow-init.ts` + `packages/app/src/server/dev-shadow-init.test.ts` — **DELETE** (absorbed per D10). `packages/app/src/server/api-config-handler.ts` + test — preserved unchanged. `AGENTS.md` (remove corrigendum breadcrumb at both occurrences + replace stale sentence with D7 target prose atomically).
- **EXCLUDE:** `packages/server/src/standalone.ts` (no changes to `createServer()` surface); `packages/server/src/boot.ts` (no changes to `bootServer()` surface); `packages/cli/src/commands/start.ts` / `mcp.ts` / `ui.ts` (unchanged); `packages/desktop/src/**` (unchanged); `packages/app/tests/integration/test-harness.ts` (NG3 — out of scope).
- **STOP_IF:** The refactor requires a *new* option on `createServer()`'s `ServerOptions` interface (e.g., a new opt-out flag). That's a public-surface change and needs its own mini-spec + user confirmation.
- **STOP_IF:** The refactor exposes a bug in `createServer()`'s async init path (race, lock-leak, double-acquire) that isn't fixable in the plugin alone. Fix belongs in `standalone.ts` + its own test.
- **ASK_FIRST:** Extracting a shared helper (Option B / NG2). Scope carve-out must be explicitly revisited.
- **ASK_FIRST:** Removing `runDevShadowInit` or collapsing its contract into `createServer()`. That file has its own unit tests and the UX branch matters.
