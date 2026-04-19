---
title: "E2E Test Isolation + Broadcaster Lifecycle: Dual-Track Architectural Evaluation"
description: "Evidence-based evaluation of two related architectural questions for projects embedding a CRDT/WebSocket backend (Hocuspocus) inside a Vite dev server: (a) Playwright test isolation across parallel workers — single shared webServer vs per-worker servers vs hybrid; (b) async broadcaster-to-closing-socket race handling — readyState filter vs Hocuspocus patch vs consumer-side wrapper vs defensive error handler. Primary-source research across Playwright docs, Hocuspocus source, Node/ws library maintainer guidance, and Hocuspocus-consumer production codebases (Outline, Docmost). Ranked recommendations with trade-offs for each track."
createdAt: 2026-04-18
updatedAt: 2026-04-18
subjects:
  - Playwright
  - Hocuspocus
  - Vite
  - WebSocket
  - Yjs
  - Outline
  - Docmost
  - Next.js
  - SvelteKit
  - React Router
  - tldraw
  - websockets/ws
  - Node.js
topics:
  - E2E test isolation architecture
  - Playwright worker-scoped fixtures
  - per-worker server spawning
  - WebSocket broadcaster lifecycle
  - EPIPE ECONNRESET handling
  - async socket error patterns
  - adapter-wrapper pattern
---

# E2E Test Isolation + Broadcaster Lifecycle: Dual-Track Architectural Evaluation

**Purpose:** For projects embedding a CRDT/WebSocket backend (Hocuspocus) inside a dev server (Vite), decide the architecturally-correct approach to two coupled questions: (A) Playwright test isolation across parallel workers, and (B) async broadcaster → closing-socket race handling. The reader is a staff-level engineer weighing architectural choices against evidence, not a junior debugging a flake.

---

## Executive Summary

The two tracks in this report surface **independent architectural problems with different answers**. Separating them — which the original debug framing conflated — changes the conclusions materially.

**Track A (Test isolation):** For a Playwright suite that exercises a Vite-embedded WebSocket server under concurrent parallel workers, **per-worker server spawning via worker-scoped Playwright fixtures is the architecturally-correct pattern**. Single shared `webServer` is the structural source of cross-worker CPU contention; whether per-worker isolation eliminates a specific observed flake is empirical (measurable only after migration), but the architectural premise — that shared-server contention is a real flake class under parallel workers — is well-precedented across the consumer ecosystem (see A2/A3). Among three per-worker options, **Option A (N child Vite processes via `{ scope: 'worker' }` fixture + `getFreePort()` + `workerInfo.workerIndex`-scoped tmpdirs)** is the evidence-backed choice. It has the strongest primary-source precedent ([React Router v7 integration tests](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts) ship a `webServer`-less, `get-port`-driven per-test fixture pattern), the simplest migration from today's architecture (reuses the existing `getFreePort()` utility already present in Tier 1 integration harnesses), and the smallest blast radius (no refactor of module-level server init required if you spawn child processes instead of in-process instances).

**Track B (Broadcaster → closing-socket race):** The original framing — "should we pre-filter by readyState, add a pre-close drain hook, or patch Hocuspocus?" — was **built on a false premise**. Primary-source reading of Hocuspocus (`~/.claude/oss-repos/hocuspocus/packages/server/src/Connection.ts:154-168`) shows that **`Connection.send()` already pre-filters by `readyState`** before every `webSocket.send()` call, AND wraps the send in a try/catch. The EPIPE/ECONNRESET logs that appear in consumer projects are **async kernel-level emissions from the underlying TCP socket after the userspace `send()` call has already returned control** — a race that NO userspace filter can prevent ([websockets/ws maintainer @lpinca, issue #1017 canonical thread](https://github.com/websockets/ws/issues/1017)). The correct design is **the defensive error listener pattern that the consumer codebase already implements**. The only gap vs the production-Hocuspocus ecosystem is a cosmetic one: Outline classifies known-safe error codes (EPIPE/ECONNRESET) before logging to prevent observability noise. Patching Hocuspocus is unnecessary and unprecedented (zero public patchfile results for `@hocuspocus/server`). Alternative wrapper designs (Docmost's `WebSocketLike` wrapper) exist and are stronger against a documented recursion bug ([Hocuspocus #1017](https://github.com/ueberdosis/hocuspocus/issues/1017)), but for consumers not affected by that specific recursion, the defensive-listener pattern is sufficient.

**Key Findings:**

- **Track A — per-worker via fixture is a proven pattern.** [React Router v7](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts) ships without a `webServer` entry; server spawning moves entirely into per-test fixtures using `get-port` + `cross-spawn`. Playwright's [worker-scoped fixture API](https://playwright.dev/docs/test-fixtures) (`{ scope: 'worker' }` tuple syntax) supports this pattern first-class. No documentation gap, no undocumented behavior.
- **Track A — worker reuse amortizes cold-start cost.** Playwright reuses a worker across multiple test files when fixtures match ([test-parallel docs](https://playwright.dev/docs/test-parallel)). With 4 workers running 13+ test files, per-worker Vite cold-start (~2s each = 8s one-time) amortizes over the full suite — ~1-2% CI overhead vs the flake tax it eliminates.
- **Track A — no Hocuspocus consumer does this yet.** Outline uses Jest (not Playwright) with per-test `TestServer` at port 0. Tiptap uses Cypress with shared port 3000. Docmost has no real E2E. Slate-yjs has unit tests only. Adopting the React Router pattern + scoping to `worker` for a Hocuspocus consumer is a new position — but derivable from two well-precedented patterns.
- **Track B — Hocuspocus already does readyState filtering.** `Connection.send` ([`packages/server/src/Connection.ts:154-168`](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Connection.ts)) checks `readyState` against `Closing` and `Closed` before every `webSocket.send()`, then wraps in try/catch. The proposed "pre-filter by readyState" is functionally redundant with this built-in guard.
- **Track B — EPIPE is a kernel-level TCP race, not a library bug.** [ws maintainer @lpinca, issue #2148](https://github.com/websockets/ws/issues/2148): *"`readyState` pre-check doesn't help. Those are probably buffered writes that can't go through."* No userspace library can eliminate EPIPE from TCP socket writes.
- **Track B — the defensive error listener pattern IS the canonical consumer-side design.** Both Outline ([`server/services/collaboration.ts:82-108`](https://github.com/outline/outline/blob/main/server/services/collaboration.ts)) and the [ws library's own canonical guidance](https://github.com/websockets/ws/issues/1017) converge on: attach `socket.on('error', ...)` at upgrade time + classify known-safe error codes before surfacing to observability.
- **Track B — `broadcastStateless`'s `filter` parameter exists but serves a different purpose.** [`Document.ts:238-251`](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Document.ts) — the filter is for sender-identity exclusion, not lifecycle filtering. Using it for readyState is not a documented pattern and would be redundant with `Connection.send`'s built-in check.
- **Track B — v4 blesses a stronger adapter-wrapper pattern.** Hocuspocus v4's `WebSocketLike` interface (RELEASE_NOTES_V4) is the "blessed" extension point for consumers who want stronger pre-send guards. Docmost's `WsSocketWrapper` pattern implements this and additionally short-circuits the recursion vulnerability at [Hocuspocus #1017](https://github.com/ueberdosis/hocuspocus/issues/1017). This is stronger than the defensive-listener pattern for consumers affected by the recursion; for consumers not affected, the simpler pattern is sufficient.

---

## Research Rubric

| # | Dimension | Track | Priority | Depth | Status |
|---|---|---|---|---|---|
| A1 | Playwright worker-scoped fixture mechanics | A | P0 | Deep | CONFIRMED |
| A2 | Hocuspocus-consumer Playwright prior art (Outline, Docmost, Tiptap, Hocuspocus own) | A | P0 | Deep | CONFIRMED |
| A3 | Framework Playwright patterns (Next.js, SvelteKit, React Router, tldraw) | A | P0 | Moderate | CONFIRMED |
| A4 | Per-worker Options A/B/C comparison | A | P0 | Deep | ANSWERED |
| A5 | Residual flake surface after per-worker | A | P1 | Moderate | ANSWERED |
| B1 | Hocuspocus `broadcastStateless` source-level internals | B | P0 | Deep | CONFIRMED |
| B2 | Connection lifecycle hooks; pre- vs post-close ordering | B | P0 | Deep | CONFIRMED |
| B3 | TCP half-closed socket fundamentals; sync vs async error emission | B | P0 | Moderate | CONFIRMED |
| B4 | Upstream status (GitHub issues, maintainer stance) | B | P0 | Moderate | CONFIRMED |
| B5 | Patch feasibility + consumer-side wrapper patterns | B | P1 | Moderate | CONFIRMED |
| B6 | Pre-close drain via lifecycle hook — design trade-offs | B | P0 | Deep | ANSWERED (NEGATIVE — not possible) |
| C1 | Design-precedent framing: when to eliminate-race vs accept-async-defense | cross | P1 | Moderate | ANSWERED |

**Stance:** Conclusions-bearing. Options ranked with evidence; alternatives documented with trade-offs.

**Non-goals:** Evaluating Playwright vs alternatives; general CI strategy; CRDT correctness; first-party implementation details beyond minimal grounding; Node.js upgrade implications.

---

## Detailed Findings

### Track A: Playwright Test Isolation Across Parallel Workers

#### A1. Playwright worker-scoped fixture API

**Finding:** Playwright's `test.extend<TestFixtures, WorkerFixtures>()` API with the `[asyncFn, { scope: 'worker' }]` tuple syntax supports per-worker-lifecycle fixtures first-class. `webServer` config is optional — it can be removed entirely, with fixtures driving all server spawning.

**Evidence:** [evidence/a1-playwright-fixture-mechanics.md](evidence/a1-playwright-fixture-mechanics.md)

**Key mechanics:**

```ts
export const test = base.extend<TestFixtures, WorkerFixtures>({
  server: [
    async ({}, use, workerInfo) => {
      const port = await getFreePort();
      const contentDir = mkdtempSync(join(tmpdir(), `ok-worker-${workerInfo.workerIndex}-`));
      const proc = spawn('bun', ['run', 'dev'], {
        env: { ...process.env, VITE_PORT: String(port), OK_TEST_CONTENT_DIR: contentDir },
      });
      await waitForStdoutRegex(proc, /ready on/);
      await use({ port, contentDir });
      proc.kill();
      rmSync(contentDir, { recursive: true, force: true });
    },
    { scope: 'worker' }
  ],
  page: async ({ page, server }, use) => {
    await page.goto(`http://localhost:${server.port}`);
    await use(page);
  },
});
```

**Implications:**

- `workerInfo.workerIndex` provides a unique identifier for per-worker resources (tmpdirs, logs). For ports specifically, prefer kernel-assigned random allocation (`getFreePort()`) over `workerIndex`-derived ports to avoid the long-running-suite retry case where `workerIndex` monotonically increases past any fixed port range.
- Worker reuse across test files means one cold-start per worker, amortized over all test files that worker handles (confirmed: [playwright.dev/docs/test-parallel](https://playwright.dev/docs/test-parallel): *"Playwright Test reuses a single worker as much as it can to make testing faster, so multiple test files are usually run in a single worker one after another."*)
- Fixture teardown runs on worker process exit; graceful cleanup must handle async completion.

**Decision triggers (when this matters):**
- If the backing server has meaningful startup cost (Vite's ~1-3s cold start), worker reuse is load-bearing for cost — per-test would be prohibitive.
- If tests have shared state requirements (initial sync, test-reset semantics), worker-scoped enables a single content dir per worker with per-test doc-level isolation inside.

**Remaining uncertainty:** None at the API level. This is documented primary-source behavior.

---

#### A2. Hocuspocus-consumer Playwright prior art

**Finding:** **No Hocuspocus consumer in the surveyed OSS ecosystem uses Playwright with per-worker server isolation.** The closest precedent is Hocuspocus's own AVA-based test harness that spawns per-test. Tiptap uses Cypress with a shared hardcoded port. Adopting per-worker for a Hocuspocus+Playwright project is a new position but derivable from well-precedented primitives.

**Evidence:** [evidence/a2-a3-prior-art.md](evidence/a2-a3-prior-art.md)

| Project | E2E framework | Server strategy | Port |
|---|---|---|---|
| Hocuspocus (own tests) | AVA | Per-test, port 0 | Dynamic |
| Outline | Jest (no Playwright) | Per-test TestServer, port 0 | Dynamic |
| Tiptap | Cypress | Shared static on port 3000 | Hardcoded |
| Docmost | NestJS boilerplate (no real E2E) | N/A | N/A |
| Slate-yjs | Vitest (unit only) | N/A | N/A |

**Implications:**

- The Hocuspocus ecosystem's canonical test pattern is **per-test port 0 allocation** — reflected in Hocuspocus's own [`tests/utils/newHocuspocus.ts`](https://github.com/ueberdosis/hocuspocus/blob/main/tests/utils/newHocuspocus.ts:1-39).
- `port: 0` + OS allocation is strongly precedented across both Hocuspocus's own tests and Outline's test harness — same pattern used by the consumer codebase's Tier 1 integration harness.
- Tiptap's Cypress shared-port approach is a counterexample of the **shared-server, cross-worker-contamination-accepted** pattern. It works for Tiptap because their e2e tests don't exercise WebSocket state in ways that contend across workers.

**Decision triggers:**
- If tests exercise shared Hocuspocus CC1/broadcast state (the Open Knowledge case), the shared-server pattern creates cross-worker contention.
- If tests are pure client-side rendering (Tiptap's case), shared-server is fine.

---

#### A3. Framework Playwright patterns

**Finding:** Among major meta-frameworks, **React Router v7 provides the strongest primary-source precedent for Playwright E2E without a `webServer` config**. Next.js built its own harness (not Playwright). SvelteKit uses shared `webServer` per feature dir. tldraw requires an external pre-existing dev server.

**Evidence:** [evidence/a2-a3-prior-art.md](evidence/a2-a3-prior-art.md)

| Framework | `webServer`? | Per-worker? | State strategy |
|---|---|---|---|
| **Next.js** | N/A (Jest) | Per-test tmpdir + random port | Full app scaffold in `os.tmpdir()` |
| **SvelteKit** | Yes, shared per-feature-dir | No | Workers share server |
| **React Router v7** | **No** | **Per-test** (stronger than per-worker) | `get-port` + `cross-spawn` in `.tmp/` |
| **tldraw** | No (external) | N/A | Client-side reset |

[React Router's `integration/playwright.config.ts`](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts) has no `webServer` entry at all. All server spawning lives in `integration/helpers/create-fixture.ts` via `spawnTestServer()` using `get-port` + `cross-spawn` + per-test `.tmp/integration/<unique>` tmpdirs. This is the strongest primary-source evidence that `webServer` can be completely removed in favor of fixture-driven spawning.

**Implications:**
- Removing `webServer` is a documented, load-bearing pattern, not a deviation.
- React Router spawns per-TEST (finer granularity than per-worker) because each test needs a different Vite app shape. For a consumer that can amortize across tests, per-worker is strictly cheaper while still eliminating the cross-worker contention class.

---

#### A4. Per-worker Options A/B/C comparison

**Finding:** Among three possible per-worker approaches, **Option A (N child Vite processes per worker) is the recommended choice**. Options B and C are more invasive or unprecedented.

| Option | Description | Evidence-backed precedent | Blast radius | Recommendation |
|---|---|---|---|---|
| **A: N child Vite processes** | Each Playwright worker spawns its own `bun run dev` (or equivalent) on a kernel-allocated port + unique test content directory | React Router v7 (per-test variant); Hocuspocus own tests (per-test); Next.js (per-test) | **Smallest** — reuses the port-allocation primitive (one-line helper that returns a free port), doesn't refactor module-level server init | **✓ Recommended** |
| **B: Single process, N in-process Hocuspocus instances** | One Vite, many Hocuspocus instances differentiated by port | No precedent found | **Largest** — refactor `hocuspocus-plugin.ts` from module-level state to factory function; reconsider server lock; reconsider Vite middleware | Not recommended |
| **C: Hybrid — shared Vite, per-worker Hocuspocus via URL namespacing** | `/collab/worker-N` routes into different Hocuspocus instances | No precedent found in the ecosystem | **Medium** — requires routing layer inside plugin; WebSocket URL rewrites | Not recommended |

**Relationship to in-process integration test harnesses.** If a project already has a programmatic integration-test harness that spins up the backend in-process on a kernel-allocated port (a common pattern for CRDT-server projects), Option A operates at a different layer — it spawns **child dev-server processes** for Playwright browser tests. The in-process harness pattern is untouched by this migration. The two patterns share only the port-allocation primitive (kernel-assigned free port), not the process model. Callers should not interpret "reuses `getFreePort()`" as "the Tier 1 harness becomes the Playwright harness" — they remain architecturally distinct.

**Cost analysis for Option A** (4-worker CI baseline):

| Cost dimension | Overhead | Mitigation |
|---|---|---|
| Cold-start time | ~2s × 4 workers = **8s one-time** (amortized over worker lifetime, not per test). On a 7-minute CI baseline, this is ~1.9% overhead (8s / 420s); on a 15-minute nightly tier, ~0.9%. Figures are illustrative — actual Vite cold-start time varies with project size and plugin chain; measure against your own baseline before committing. | Worker reuse across files; Vite warm-start patterns |
| Memory footprint | Vite + Hocuspocus ≈ ~50-80 MB per worker → **~200-320 MB total** | Trivial on typical CI runner tiers (16GB+) |
| Port allocation | Zero — `getFreePort()` is kernel-assigned, collision-free | Already implemented in Tier 1 harness |
| Complexity | Replace `webServer` config with worker-scoped fixture | Reuses patterns from React Router |

**Why not Option B:**
- Requires refactoring `hocuspocus-plugin.ts`'s module-level state into factory functions. This is a second-order change affecting the production dev-server path (risky).
- No precedent. Unknown edge cases. Hocuspocus's `openDirectConnection`, file watcher, and CC1 broadcaster would need to be multi-instance-safe.
- The production server lock (one Hocuspocus per contentDir) becomes ambiguous.

**Why not Option C:**
- WebSocket URL namespacing sounds clean but requires a routing layer inside `hocuspocus-plugin.ts`. The `/collab` route handler would need to dispatch to different Hocuspocus instances by URL prefix.
- Clients (HocuspocusProvider) assume a single `/collab` endpoint; the client-side would need to know which worker's URL to connect to.
- No ecosystem precedent.

**Implications:** Option A is the only option with primary-source precedent, smallest blast radius, and cleanest mapping to existing repo patterns.

**Decision triggers:**
- If memory / cold-start time is a hard constraint (unlikely on modern CI), reconsider.
- If the production dev-server path is already being refactored for other reasons, Option B becomes cheaper.

---

#### A5. Residual flake surface after per-worker isolation

**Finding:** Eliminating shared-server contention removes one class of flakes but does not eliminate all nondeterminism. Per-worker isolation makes **`retries: 2` + `failOnFlakyTests: true` re-evaluable** but does not automatically justify dropping both. A phased approach is advisable.

**Evidence:** Cross-reference with PR #206 observations + the debug report.

Residual flake classes that survive per-worker isolation:

| Class | Survivability | Mitigation |
|---|---|---|
| **Browser-level nondeterminism** (Chromium keystroke ordering, focus-race) | Low rate but present | Condition-based waits (already convention per CLAUDE.md §20) |
| **CRDT convergence variance** (Y.js sync ordering under concurrent writes) | Observable but bounded | Existing `assertAllConverged` polling pattern |
| **Test-logic timing** (race between action and poll condition) | Application-specific | Test rewrites as needed |
| **Network stack variance** (loopback latency jitter) | Negligible | None needed |
| **CI runner CPU variance** (preemption by sibling jobs) | Low with worker isolation | None — external to test infra |

**Recommendation:** After landing Option A, **keep `retries: 1` temporarily** (not 2, not 0) as a safety net during the transition. Observe flake rate over ~10 green runs. If residual rate is <0.1%, drop retries to 0. If ≥0.1%, investigate each residual individually.

`failOnFlakyTests: isCI` should remain — it's the gate that prevents retry-masking silent regressions. Per-worker isolation doesn't change the value of this gate; it changes what trips it.

**Remaining uncertainty:** The actual post-per-worker flake rate is empirical — must be measured after landing. No prior-art data on this specific transition exists.

---

### Track B: Async Broadcaster → Closing-Socket Race Handling

#### B1. `broadcastStateless` internals

**Finding:** `Document.broadcastStateless` ([`packages/server/src/Document.ts:238-251`](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Document.ts)) accepts an optional per-connection filter callback and iterates `getConnections()` to call `connection.sendStateless(payload)` on each. The heavy-lifting readyState guard is NOT in `broadcastStateless` — it's in `Connection.send` one layer deeper, which pre-filters by `readyState` before every `webSocket.send()` and wraps in try/catch.

**Evidence:** [evidence/b1-broadcaststateless-internals.md](evidence/b1-broadcaststateless-internals.md)

Critical `Connection.send` excerpt:
```ts
send(message: Uint8Array): void {
  if (
    this.webSocket.readyState === WsReadyStates.Closing ||
    this.webSocket.readyState === WsReadyStates.Closed
  ) {
    this.close();
    return;
  }
  try {
    this.webSocket.send(message);
  } catch (exception) {
    this.close();
  }
}
```

**Implications:**

- A consumer-side `filter: (c) => c.webSocket.readyState === OPEN` passed to `broadcastStateless` is **functionally redundant** with the built-in `Connection.send` readyState check. Both would stop the write at the same boundary.
- The try/catch catches synchronous exceptions only. Asynchronous EPIPE/ECONNRESET emitted after the `ws.send()` call returned control propagates to the raw socket's `'error'` event — outside this catch.
- This explains why consumer projects still see EPIPE in logs despite Hocuspocus's pre-filter: the race is below the userspace-check level (see B3).

**Decision triggers:**
- If application semantics require filtering by sender-identity or application-level criteria (not readyState), the `filter` parameter is the right tool.
- For readyState concerns alone, no consumer action needed — Hocuspocus handles it.

---

#### B2. Connection lifecycle hooks; pre- vs post-close ordering

**Finding:** `onDisconnect` fires **after** the WebSocket has already closed, not before. Hocuspocus has no pre-close hook in its documented API. This forecloses any "flush pending broadcasts before the socket closes" design at the Hocuspocus-hook layer — the socket is already closed by the time the hook runs.

**Evidence:** [evidence/b2-connection-lifecycle-hooks.md](evidence/b2-connection-lifecycle-hooks.md)

Firing sequence (from source):
1. Client sends FIN (or server-side close called)
2. ws library emits `close` event on the WebSocket
3. `ClientConnection.handleClose` runs
4. `Connection.close()` fires registered onClose callbacks
5. Hocuspocus `onDisconnect` hook dispatches from inside those callbacks

**Implications:**

- Pre-close drain design at the Hocuspocus layer is **architecturally not possible**. The hook fires post-close.
- The ONLY way to achieve pre-close behavior is at the `WebSocketLike` layer — below Hocuspocus — by wrapping the underlying ws and short-circuiting sends when a close event is *imminent but not yet processed*. Docmost's pattern does this.
- This finding invalidates one of the original Track B options.

---

#### B3. TCP half-closed socket fundamentals

**Finding:** EPIPE/ECONNRESET is a **kernel-level TCP race** that cannot be prevented by userspace `readyState` checks. The ws library's maintainer has explicitly documented this in [issue #1017](https://github.com/websockets/ws/issues/1017) (the canonical thread) and [#2148](https://github.com/websockets/ws/issues/2148).

**Evidence:** [evidence/b3-tcp-async-race.md](evidence/b3-tcp-async-race.md)

Maintainer @lpinca, [ws#1172](https://github.com/websockets/ws/issues/1172):
> *"EPIPE means you're writing to a socket when the other end has terminated the connection. It's a runtime error and there is nothing you can do to avoid it."*

[ws#2148](https://github.com/websockets/ws/issues/2148) — maintainer on why userspace pre-checks fail:
> lpinca: *"Those are probably buffered writes that can't go through. There is not much to do apart from checking the `websocket.bufferedAmount` and stop writing if it grows too much."*

(Context: the reporter's setup was a pre-send `readyState === OPEN` check that still produced EPIPE. lpinca's response accepts the premise and points at the root cause — the kernel write buffer can accept the call synchronously and emit the failure asynchronously.)

EPIPE fires through three async channels (Node.js behavior, documented in nodejs/node issues #6083, #24111, #11918):
1. Sync throw from `net.Socket.write()` (sometimes; inconsistent)
2. `'error'` event on the underlying `net.Socket`
3. `'error'` event on the `ws.WebSocket` wrapper

**Implications:**
- `readyState === OPEN` + try/catch + async listeners is the **full defensive pattern**. Any one alone is insufficient.
- Hocuspocus has (1) sync throw → `close()` handling AND (2) readyState pre-check. Consumers must supply (3) async listeners on raw socket + ws wrapper.
- **No library-level change** (Hocuspocus patch, ws patch, etc.) can eliminate EPIPE. It's a property of TCP.

**Cross-ecosystem validation:** [koajs/koa#1089](https://github.com/koajs/koa/issues/1089) (HTTP framework) and [BloopAI/vibe-kanban#830](https://github.com/BloopAI/vibe-kanban/issues/830) (Vite proxy) document the same pattern. Universal Node.js networking.

---

#### B4. Upstream status

**Finding:** The EPIPE class is known upstream in Hocuspocus via adjacent-symptom issues, but **no proposal to filter `broadcastStateless` recipients by readyState has been made**. The maintainer's stance is to fix lifecycle bugs at major-version boundaries (v2, v3, v4) rather than patches, and to direct consumers toward the `WebSocketLike` adapter extension point.

**Evidence:** [evidence/b4-upstream-status.md](evidence/b4-upstream-status.md)

- [Hocuspocus #1017](https://github.com/ueberdosis/hocuspocus/issues/1017) — exact class ("AwarenessUpdate triggers close on closing socket"). Marked closed with a "fixed by PR #1032" pointer that is inapplicable ([PR #1032](https://github.com/ueberdosis/hocuspocus/pull/1032) touches only `packages/extension-redis/src/Redis.ts` + `.gitignore`, per `gh pr view 1032 --json files`). The `send() → close() → onClose → awareness → send()` recursion is still present in [`packages/server/src/Connection.ts:154-168` on main](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Connection.ts#L154-L168).
- [#264](https://github.com/ueberdosis/hocuspocus/issues/264) — maintainer acknowledges readyState lag: *"`WebSocket.readyState` still shows 1 = Connected, even when the client is offline"*.
- [#618](https://github.com/ueberdosis/hocuspocus/issues/618) — only discovered use of `filter` parameter; for sender-identity exclusion, not readyState.
- RELEASE_NOTES_V4.md — introduces `WebSocketLike` interface via `crossws`; session awareness default; ordered message processing. Nothing on send-side EPIPE.

**Decision triggers:** For consumers building on Hocuspocus v4+, the `WebSocketLike` interface is the intended extension point for consumer-specific guards.

---

#### B5. Patch feasibility + consumer-side wrapper patterns

**Finding:** Two canonical consumer-side patterns exist, neither is "patch Hocuspocus." Patching `@hocuspocus/server` has **zero public precedents** in npm or GitHub code search.

**Evidence:** [evidence/b5-consumer-patterns.md](evidence/b5-consumer-patterns.md)

| Pattern | Codebase | Shape | Strength |
|---|---|---|---|
| **Pattern A: Node-layer error listener + observability filter** | [Outline](https://github.com/outline/outline/blob/main/server/services/collaboration.ts) | `socket.on('error', ...)` at upgrade + `if (error.code === 'EPIPE'/'ECONNRESET') return;` at Sentry boundary | Simple, minimal-change, matches the "defensive listener" canonical guidance |
| **Pattern B: `WebSocketLike` wrapper with readyState short-circuit** | [Docmost](https://github.com/docmost/docmost) | Custom `WebSocketLike` class with `readyState` tracking + `send` no-op on non-OPEN | Stronger — v4-aligned; prevents the #1017 recursion; wraps at the adapter boundary |

Neither pattern uses `broadcastStateless`'s `filter` callback or `beforeBroadcastStateless` hook. The readyState concern is handled at the **send layer** (inside `Connection.send` or inside a wrapping `WebSocketLike.send`), not at the broadcast layer.

**Implications:**

- **Outline's Pattern A** is simpler and directly addresses observability noise. For consumers whose main concern is the log spam, this is sufficient. Cost: ~5 lines (classify error codes before `console.error`).
- **Docmost's Pattern B** is stronger and v4-aligned. For consumers who need defense against the [#1017 recursion](https://github.com/ueberdosis/hocuspocus/issues/1017) or who are refactoring for multi-instance, this is the blessed path. Cost: refactor the upgrade handler to inject a `WebSocketLike` wrapper.
- **Patching Hocuspocus is unnecessary** given the existing extension points.

**Decision criteria for choosing Pattern A vs Pattern B:**

A consumer should adopt **Pattern B** if ANY of these apply:
1. **Affected by the #1017 awareness-recursion path.** Symptoms: double `onDisconnect` fires; log pattern where `send()` errors appear inside an awareness-update stack trace. Diagnostic: grep your logs for `onAwarenessUpdate` or awareness-related stack frames within the same error as EPIPE/ECONNRESET.
2. **Multi-instance deployment.** Running more than one Hocuspocus process with Redis or similar pubsub — the wrapper pattern aligns with Docmost's multi-instance setup.
3. **Planning v5+ migration.** The `crossws` / `WebSocketLike` adapter path is where Hocuspocus is heading; adopting Pattern B now aligns the codebase with that trajectory.

Otherwise, **Pattern A** is sufficient:
1. **Single-instance deployment** + **failure path is broadcaster-timer-driven** (e.g., a debounced broadcast from a file-watcher or timer calling `broadcastStateless`) — not awareness-driven. Broadcaster-timer paths hit EPIPE via the straight `doc.broadcastStateless()` → `Connection.send` → kernel-race chain, not through the `send()` → `close()` → `onClose` → awareness → `send()` recursion that #1017 describes.
2. **Log noise is the primary concern**, not structural correctness of the dispatch path.

For a consumer whose failure path is timer-driven and single-instance, Pattern A's ~5-line change (classify EPIPE/ECONNRESET before `console.error`) is the whole fix. Pattern B adds architectural protection against a different failure class that the consumer's stack traces do not exhibit.

---

#### B6. Pre-close drain via lifecycle hook

**Finding:** Architecturally not possible at the Hocuspocus-hook layer. `onDisconnect` fires post-close (B2). The only way to achieve pre-close behavior is at the `WebSocketLike` adapter layer (Pattern B above), which is a different design from "use the hook API."

**Implications:** Strike this option from the original framing. It is not realizable with documented Hocuspocus API surface.

---

#### C1. Design-precedent framing: when to eliminate a race structurally vs accept it with defensive handlers

**Finding:** The decision turns on **where the race lives**.

| Race location | Correct response |
|---|---|
| **Userspace** (two timers, two observers, competing state machines in application code) | Eliminate structurally — single-writer, typed origins, explicit ordering |
| **Library boundary** (library callbacks fire in an order you can influence) | Use the library's extension points (filter callbacks, hooks) |
| **Kernel / protocol** (TCP RST, IP-layer packet drop, NIC buffer exhaustion) | Defensive handler pattern — catch at all emission points; classify known-safe codes for observability hygiene |

EPIPE/ECONNRESET on WebSocket close falls in the **kernel/protocol** bucket. No userspace check can eliminate it. The defensive listener pattern is not "accepting tech debt" — it's the architecturally-correct response for that class.

**This contrasts with Track A's flake class**: the cross-worker contention is a **userspace** race (worker → shared server → timer), structurally eliminable by changing the shared surface (shared server → per-worker server). Per-worker isolation IS the structural fix for that class.

**Precedent framing for downstream repos:**

> "Broadcaster recipients have asynchronous error conditions that cannot be prevented by userspace pre-filtering alone. Hocuspocus already pre-filters `readyState` internally. Consumer design: attach defensive error listeners at upgrade time + classify known-safe error codes for observability. Patching or library-level filtering is neither needed nor precedented."

This is appropriate to document as a design precedent in consumer codebases' AGENTS.md / CLAUDE.md, particularly for any future async-broadcaster → lifecycle interaction.

---

## Ranked Recommendations

### Track A: E2E Test Isolation

**Recommended: Option A — per-worker child Vite processes via worker-scoped fixture.**

Migration shape:
1. Delete `webServer` block from `playwright.config.ts`.
2. Create a worker-scoped fixture that spawns `bun run dev` on `getFreePort()` + unique `OK_TEST_CONTENT_DIR`.
3. Pass fixture's `port` + `contentDir` through to per-test fixtures (page, baseURL).
4. On worker teardown: kill process + rm tmpdir.
5. Phase retries: `retries: 2` → `retries: 1` → `retries: 0` over ~2 weeks of observation.
6. Keep `failOnFlakyTests: isCI` (structural gate, not a tax).

Primary reference: [React Router v7 integration config](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts) + [helpers/create-fixture.ts](https://github.com/remix-run/react-router/blob/main/integration/helpers/create-fixture.ts).

**Not recommended:** Options B (in-process N instances) or C (shared Vite + per-worker namespaced Hocuspocus) — no precedent, larger blast radius.

---

### Track B: Broadcaster → Closing-Socket Race

**Recommended: Keep the existing defensive listener pattern. Add Outline-style error-code classification (Pattern A) as a cosmetic improvement.**

Migration shape (minimal — ~5 LOC):
1. In the upgrade handler's `socket.on('error', ...)` callback, filter out known-safe codes (EPIPE, ECONNRESET) before `console.error`. Log at `debug` level or skip entirely.
2. Keep the catch-all fallback for unknown error codes — they may indicate real problems.
3. No patches to `@hocuspocus/server`. No filter callback on `broadcastStateless`. No refactor.

**Optional upgrade path: Pattern B (`WebSocketLike` wrapper)** — see §B5 decision criteria. Use if affected by the #1017 awareness recursion, running multi-instance with Redis pubsub, or aligning with v5+ `crossws` adapter trajectory. The 5-line Pattern A fix does not address #1017's recursion; Pattern B does, at the cost of an adapter-layer refactor (wrap the raw `ws` into a `WebSocketLike` before passing to `hocuspocus.handleConnection`).

**Cost comparison (Pattern A vs Pattern B):**

| Dimension | Pattern A | Pattern B |
|---|---|---|
| LOC change | ~5 (error-code filter in upgrade handler) | ~40-60 (new `WebSocketLike` class + upgrade-handler wiring) |
| Affected files | 1 (upgrade handler) | 2-3 (wrapper class + upgrade handler + possible tests) |
| Test surface added | None (pure noise suppression) | Unit test for wrapper state machine; integration test for close-race semantics |
| Addresses #1017 recursion? | No | Yes (wrapper `send` is no-op on non-OPEN, breaking the loop at the boundary) |
| v5+ migration alignment | Neutral | Stronger (matches `crossws` direction) |
| Rollback cost if wrong | Trivial | Moderate (revert adapter, retest upgrade flow) |

**Not recommended:**
- Patching `@hocuspocus/server` — unprecedented, and the existing extension points suffice.
- Passing `filter: (c) => c.readyState === OPEN` to `broadcastStateless` — functionally redundant with `Connection.send`'s built-in check.
- Pre-close drain via `onDisconnect` hook — architecturally impossible (hook fires post-close).

---

## Limitations & Open Questions

### Dimensions fully covered
A1, A2, A3, A4, A5, B1, B2, B3, B4, B5, B6, C1.

### Remaining uncertainty

- **Empirical post-per-worker flake rate** is not measurable without landing Option A. The report ranks based on architectural fit; the actual improvement is observable-only.
- **Hocuspocus v5 roadmap** is not public. If major changes to `Connection` semantics ship, the "defensive listener is sufficient" conclusion should be re-verified.
- **Exact cold-start cost of Vite+Hocuspocus in a per-worker configuration** was not measured here. Estimates (~2s per worker, ~50-80MB) are based on comparable Vite documentation. Measuring in a staging environment before committing is advisable.

### Out of scope (per rubric)
- Evaluating Playwright vs agent-browser vs other frameworks (settled in [agent-browser-vs-playwright-crdt-testing](../agent-browser-vs-playwright-crdt-testing/REPORT.md)).
- General CI strategy (sharding, caching).
- CRDT correctness semantics.
- Node.js major-version upgrade implications.

---

## References

### Evidence Files

- [evidence/a1-playwright-fixture-mechanics.md](evidence/a1-playwright-fixture-mechanics.md) — Playwright worker-scoped fixture API
- [evidence/a2-a3-prior-art.md](evidence/a2-a3-prior-art.md) — Hocuspocus-consumer + framework Playwright patterns
- [evidence/b1-broadcaststateless-internals.md](evidence/b1-broadcaststateless-internals.md) — Source-level `broadcastStateless` + `Connection.send` analysis
- [evidence/b2-connection-lifecycle-hooks.md](evidence/b2-connection-lifecycle-hooks.md) — Hook firing order
- [evidence/b3-tcp-async-race.md](evidence/b3-tcp-async-race.md) — TCP half-closed socket fundamentals
- [evidence/b4-upstream-status.md](evidence/b4-upstream-status.md) — Hocuspocus GitHub issues + maintainer stance
- [evidence/b5-consumer-patterns.md](evidence/b5-consumer-patterns.md) — Outline + Docmost patterns

### External Sources

**Playwright:**
- [Fixtures | Playwright](https://playwright.dev/docs/test-fixtures)
- [Parallelism | Playwright](https://playwright.dev/docs/test-parallel)
- [Web Server | Playwright](https://playwright.dev/docs/test-webserver)
- [WorkerInfo | Playwright](https://playwright.dev/docs/api/class-workerinfo)

**Hocuspocus (ueberdosis):**
- [Hocuspocus Server Examples](https://tiptap.dev/docs/hocuspocus/server/examples)
- [Configure Hocuspocus Provider](https://tiptap.dev/docs/hocuspocus/provider/configuration)
- [Issue #1017: AwarenessUpdate triggers close on closing socket](https://github.com/ueberdosis/hocuspocus/issues/1017)
- [Issue #803: provider.destroy reopens connection](https://github.com/ueberdosis/hocuspocus/issues/803)
- [Issue #762: Fallback gracefully from initial connection issues](https://github.com/ueberdosis/hocuspocus/issues/762)
- [Issue #618: broadcastStateless exclude Connection param](https://github.com/ueberdosis/hocuspocus/issues/618)
- [Issue #558: multi-node broadcastStateless crashed](https://github.com/ueberdosis/hocuspocus/issues/558)
- [Issue #264: Check disconnecting state](https://github.com/ueberdosis/hocuspocus/issues/264)
- [Issue #881: ioredis ECONNRESET unhandled](https://github.com/ueberdosis/hocuspocus/issues/881)

**websockets/ws (canonical async-error guidance):**
- [Issue #1017: EPIPE write canonical discussion](https://github.com/websockets/ws/issues/1017)
- [Issue #1172: EPIPE recurrence patterns](https://github.com/websockets/ws/issues/1172)
- [Issue #2148: readyState pre-check insufficient](https://github.com/websockets/ws/issues/2148)

**Node.js (socket error semantics):**
- [nodejs/node #6083](https://github.com/nodejs/node/issues/6083)
- [nodejs/node #24111](https://github.com/nodejs/node/issues/24111)
- [nodejs/node #11918](https://github.com/nodejs/node/issues/11918)

**Framework prior art:**
- [vercel/next.js — contributing/core/testing.md](https://github.com/vercel/next.js/blob/canary/contributing/core/testing.md)
- [vercel/next.js — test/lib/e2e-utils/index.ts](https://github.com/vercel/next.js/blob/canary/test/lib/e2e-utils/index.ts)
- [sveltejs/kit — packages/kit/test/utils.js](https://github.com/sveltejs/kit/blob/main/packages/kit/test/utils.js)
- [remix-run/react-router — integration/playwright.config.ts](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts)
- [remix-run/react-router — integration/helpers/create-fixture.ts](https://github.com/remix-run/react-router/blob/main/integration/helpers/create-fixture.ts)
- [tldraw/tldraw — apps/examples/e2e/playwright.config.ts](https://github.com/tldraw/tldraw/blob/main/apps/examples/e2e/playwright.config.ts)

**Consumer patterns (source reads):**
- `~/.claude/oss-repos/outline/server/services/collaboration.ts:82-108` — Pattern A
- `~/.claude/oss-repos/outline/server/logging/sentry.ts:50` — observability filter
- `~/.claude/oss-repos/docmost/apps/server/src/collaboration/extensions/redis-sync/ws-socket-wrapper.ts` — Pattern B

**Cross-project evidence:**
- [koajs/koa #1089](https://github.com/koajs/koa/issues/1089) — ECONNRESET/EPIPE on streaming
- [BloopAI/vibe-kanban #830](https://github.com/BloopAI/vibe-kanban/issues/830) — Vite proxy EPIPE/ECONNRESET

**MDN:**
- [WebSocket.readyState](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState)

### Related Research

- [agent-browser-vs-playwright-crdt-testing](../agent-browser-vs-playwright-crdt-testing/REPORT.md) — Settled the tool-choice question (Playwright wins); does not address isolation architecture.
- [ts-monorepo-ci-test-pipeline-patterns](../ts-monorepo-ci-test-pipeline-patterns/REPORT.md) — 26-repo survey; covers CI tier sharding but not per-worker server isolation.
- [parcel-watcher-crdt-disk-bridge](../parcel-watcher-crdt-disk-bridge/REPORT.md) — Hocuspocus `openDirectConnection` + document lifecycle; does not address `broadcastStateless` or close-hook ordering.
