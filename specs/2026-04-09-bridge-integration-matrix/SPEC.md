# Bridge Integration Test Matrix — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-09
**Baseline commit:** `67f8257`
**Links:**
- Prior spec: `specs/2026-04-08-crdt-stress-testing/SPEC.md`
- Prior PR: #20 (CRDT stress testing suite + Observer A baseline fix + undo scope fix)
- Evidence: `./evidence/`
- Research: `reports/crdt-observer-bridge-latency-analysis/REPORT.md`

---

## 1) Problem statement

**Situation.** Open Knowledge's dual-representation CRDT editor maintains Y.XmlFragment (WYSIWYG) and Y.Text (source mode) connected by bidirectional observers. Content also flows through a disk bridge (file watcher ↔ persistence) and a server-side agent write API. PR #20 built a 4-layer stress test suite (46 scenarios) and fixed two production bugs (Observer A baseline staleness, UndoManager scope divergence). All unit and stress tests pass (68 unit + 35 stress + 3 fuzz).

**Complication.** Three interrelated problems remain:

1. **Layer C (the only full-stack E2E test) fails.** Server-side undo works correctly (verified via API: ytext=0 after undo), but the Playwright browser test times out at 60s. Something in the browser's observer chain or CRDT sync re-inserts undone content. No browser-level instrumentation exists to trace it. Port conflicts (stale dev servers from other worktrees, open browser tabs) further contaminate tests.

2. **No integration test covers the full propagation matrix.** The system has 4 write surfaces (WYSIWYG, source mode, agent API, disk) × 3 read targets = 12 propagation paths, plus undo/redo. Today: 5 paths have good coverage, 4 are thin (1 test each), 2 are untested, and 1 is failing. The untested paths include critical production flows (agent write → disk persistence, redo → XmlFragment).

3. **Concurrent AI-driven development is fragile.** Multiple worktrees run `bun run dev` on hardcoded port 5173 and collide silently. Playwright's `reuseExistingServer: true` picks up the wrong server. Open browser tabs sync stale CRDT state after test-reset. This blocks the team's workflow of multiple Claude Code sessions on different features.

**Resolution.** This spec covers:
1. Diagnose and fix the Layer C browser-side undo propagation failure
2. Design and implement a comprehensive integration test matrix covering all 12 propagation paths + undo/redo
3. Establish port randomization and test isolation for concurrent AI-driven development

## 2) Goals

- **G1:** Layer C E2E test passes reliably — browser-side undo propagation works within timeout at large-realistic scale.
- **G2:** Every propagation path in the 4×3 matrix has at least one integration test that exercises the real server + browser pipeline (not just unit-level Y.Doc mocking).
- **G3:** Tests run cleanly in concurrent AI-driven development — no port conflicts, no stale state contamination from other worktrees or browser tabs.
- **G4:** Test infrastructure supports parallel execution across worktrees without coordination.

## 3) Non-goals

- **[NOT NOW]** NG1: **Performance optimization of `updateYFragment`** — the O(N) full-tree traversal is the documented latency bottleneck, but fixing it requires forking `@tiptap/y-tiptap`. Revisit if: Layer C timeout is caused by `updateYFragment` latency (not a logic bug).
- **[NOT NOW]** NG2: **Multi-client concurrent stress** — testing two+ browser sessions editing the same doc simultaneously. Revisit if: hosted multi-user deployment becomes P0.
- **[NOT NOW]** NG3: **Modal architecture** — pausing observers when inactive mode is not visible. Revisit if: architectural decision spec is created.
- **[NEVER]** NG4: **Fuzzing the CRDT itself** — Yjs internals, operation ordering, state vector math.

## 4) Personas / consumers

- **P1: AI coding agent** (Claude Code) — runs tests in a worktree while other worktrees also have dev servers running. Needs clean, isolated test execution.
- **P2: Developer** — runs `bun run dev` + `bun run test:stress:e2e` locally. May have browser tabs open. Expects tests to pass without manual cleanup.
- **P3: CI runner** — runs `bun run check` on PR. Must not fail due to port conflicts or stale state.

## 5) User journeys

### P1: AI coding agent runs integration tests

1. Agent creates a worktree for a feature branch
2. Agent runs `bun run test:stress:e2e` — Playwright starts a dev server on a random port
3. Tests execute against the isolated server — no interference from other worktrees
4. All 12 propagation paths + undo/redo verified
5. Agent pushes; CI runs the same tests on a clean runner

### Failure / recovery path
- Port already in use → `strictPort: true` fails fast with clear error → agent picks a different port
- Stale server from another worktree → test infrastructure detects port mismatch, refuses to connect

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | R1: Layer C browser undo propagation fixed | crdt-stress.spec.ts passes all 3 turns within 120s total | Root cause diagnosed with browser-level instrumentation |
| Must | R2: All 12 propagation paths have integration tests | Each path in evidence/propagation-matrix.md has ≥1 test | Tests exercise real server + browser or real server + CRDT client |
| Must | R3: Undo + redo integration tests | Agent write → undo → verify all 3 surfaces; agent write → undo → redo → verify | Both Y.Text and XmlFragment verified |
| Must | R4: Dynamic port allocation for test isolation | Dev server uses env-var-controlled port with `strictPort: true`; Playwright discovers port | No hardcoded port 5173 in test infrastructure |
| Must | R5: Test reset clears ALL client state | `/api/test-reset` disconnects all clients, unloads doc, empties file, flushes debouncer | No stale state from browser tabs or previous test runs |
| Should | R6: Disk → browser propagation tested | Write to .md file → verify content appears in Y.Text + XmlFragment on browser client | Exercises file watcher + handleExternalChange |
| Should | R7: Browser → disk propagation tested | Type in WYSIWYG/source → verify .md file on disk is updated | Exercises persistence layer |
| Could | R8: Integration tests parallelizable | Multiple test files can run concurrently without port conflicts | Each test file uses its own port |

### Non-functional requirements

- **Performance:** Integration tests complete in < 5 minutes total (excluding stress tests)
- **Reliability:** Tests must pass 10/10 times locally, not flaky
- **Operability:** Clear error messages when port conflicts or stale state detected

## 7) Current state

See `evidence/propagation-matrix.md` for the full 4×3 matrix with coverage assessment.
See `evidence/test-infrastructure.md` for current test harness, helpers, runners, port config.

### Coverage gaps (summary)

| Gap | Impact | Priority |
|---|---|---|
| Layer C undo failing | No E2E verification of the most complex flow | P0 |
| W3→Disk untested | Agent writes may not persist correctly | P0 |
| Redo→XmlFragment untested | Redo may leave XmlFragment stale | P0 |
| W1→Disk thin (1 test, only path traversal) | WYSIWYG edits may not round-trip to disk | P0 |
| W4→Y.Text and W4→XmlFragment thin | Disk changes may not reach browser correctly | P0 |
| Port hardcoded at 5173 | Concurrent worktrees collide | P0 |

## 8) Target state

### Test architecture

```
Integration Test Layer (NEW)
├── Port allocation: STRESS_PORT env var → Vite server.port + strictPort
├── Test harness: Real Hocuspocus server (via Vite dev) on random port
├── Client: HocuspocusProvider connecting to real WebSocket
├── Assertions: Check ALL 3 surfaces (Y.Text, XmlFragment, disk file)
└── Cleanup: Full test-reset between scenarios

Propagation paths tested:
├── W1→Y.Text (WYSIWYG → source): Observer A path
├── W1→Disk (WYSIWYG → file): persistence path
├── W2→XmlFragment (source → WYSIWYG): Observer B path
├── W2→Disk (source → file): persistence path
├── W3→Y.Text (agent → source): CRDT sync path
├── W3→XmlFragment (agent → WYSIWYG): syncTextToFragment path
├── W3→Disk (agent → file): persistence path
├── W4→Y.Text (file → source): handleExternalChange path
├── W4→XmlFragment (file → WYSIWYG): handleExternalChange path
├── Undo→Y.Text + XmlFragment + Disk
└── Redo→Y.Text + XmlFragment + Disk
```

## 9) Proposed solution

### Architecture: Two-tier integration testing

The critical insight: the difference between Layer A tests and production isn't "browser vs no browser" — it's **transaction locality**. In-process Y.Doc mutations are `transaction.local === true` (observers fire for everything). Over-the-wire mutations via HocuspocusProvider WebSocket arrive as `transaction.local === false` (observers SKIP them). Layer A exercises a fundamentally different code path than production.

#### Tier 1: Programmatic integration tests (12-path matrix + undo/redo)

**File:** `packages/app/tests/integration/bridge-matrix.test.ts`

Start a real Hocuspocus server programmatically via `createServer()` from `@inkeep/open-knowledge-server`. Connect a real HocuspocusProvider client over WebSocket. Call `setupObservers()` on the client Y.Doc — identical observer chain as the browser, but no ProseMirror/React overhead.

```
beforeAll:
  tmpDir = mkdtempSync()
  port = await getFreePort()  // Node.js net.createServer().listen(0) → OS-assigned random
  server = new Server({       // @hocuspocus/server Server class (NOT Hocuspocus)
    port,
    quiet: true,
    extensions: [
      createPersistenceExtension({ contentDir: tmpDir }),
      createApiExtension({ hocuspocus: server.hocuspocus, sessionManager, contentDir: tmpDir }),
    ],
  })
  await server.listen(port)   // port > 0, passes Server.listen()'s `if (port)` guard
  // server.address.port === port

beforeEach:
  POST http://localhost:${port}/api/test-reset
  doc = new Y.Doc()
  provider = new HocuspocusProvider({ url: ws://localhost:${port}, name: 'test-doc', document: doc })
  await waitForSync(provider)
  cleanup = setupObservers({ doc, xmlFragment, ytext, mdManager, schema })

[propagation path tests + undo/redo tests]

afterEach: cleanup(), provider.disconnect(), doc.destroy()
afterAll:  await server.destroy(), rmSync(tmpDir)
```

**Port allocation detail:** `hocuspocus/Server.listen(port)` has a `if (port)` guard that's falsy for `0`, so port 0 does NOT work. Instead, pre-allocate a free port via Node.js `net.createServer().listen(0)`, close it, then pass the port number to `Server`. The port is burned (OS won't reassign for ~60s), so there's no TOCTOU race.

```typescript
import { createServer as createNetServer } from 'net';
async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}
```

**What this gives:**
- Real server with ALL extensions (persistence, API, file watcher, agent sessions)
- Real WebSocket — server changes arrive as `transaction.local === false` (production-accurate)
- Real observers via `setupObservers` — exact same code path as browser
- Random port — kernel-allocated, zero coordination between worktrees
- All 3 surfaces verifiable: Y.Text, XmlFragment (via serialize), disk file (via readFileSync)
- Fast: ~1-2s per test, entire matrix in ~30-60s
- `setupObservers` has no browser dependencies (verified: imports @inkeep/open-knowledge-core, @tiptap/markdown [type-only], @tiptap/pm/model [type-only], @tiptap/y-tiptap, yjs [type-only], diff-match-patch via diff-lines-fast — all Node.js compatible)

**Propagation tests (one per path):**

| Test | Write action | Verify |
|------|-------------|--------|
| W1→Y.Text | Push XmlElement to client fragment (local) | `ytext.toString()` contains content |
| W1→Disk | Push XmlElement to client fragment → wait for persistence debounce | `readFileSync(contentDir/test-doc.md)` contains content |
| W2→XmlFragment | Insert into client ytext (local) | `serialize(xmlFragment)` contains content |
| W2→Disk | Insert into client ytext → wait for persistence debounce | `readFileSync` contains content |
| W3→Y.Text | `POST /api/agent-write-md` | `ytext.toString()` contains content |
| W3→XmlFragment | `POST /api/agent-write-md` | `serialize(xmlFragment)` contains content |
| W3→Disk | `POST /api/agent-write-md` → wait for persistence debounce | `readFileSync` contains content |
| W4→Y.Text | `writeFileSync(contentDir/test-doc.md, newContent)` | `ytext.toString()` contains content |
| W4→XmlFragment | `writeFileSync(contentDir/test-doc.md, newContent)` | `serialize(xmlFragment)` contains content |
| Undo→Y.Text | agent-write-md → agent-undo | `ytext.toString()` does NOT contain content |
| Undo→XmlFragment | agent-write-md → agent-undo | `serialize(xmlFragment)` does NOT contain content |
| Redo→all | agent-write-md → agent-undo → agent-redo | Both surfaces contain content again |

**Disk timing strategy (TDD lens — test behavior, not implementation):**
- Content-based polling with timeout, not event timing
- `writeFileSync` → poll `ytext.toString()` until content appears (timeout 5s)
- Client edit → poll `readFileSync` until file contains content (timeout 5s, accounts for 2s persistence debounce)
- Real @parcel/watcher exercises full production path including writeTracker self-write detection

#### Tier 2: Playwright browser E2E (critical UX interactions)

**File:** `packages/app/tests/stress/crdt-stress.spec.ts` (fix existing) + potentially new `tests/integration/ux-interactions.spec.ts`

Uses Vite webServer with dynamic port allocation:

```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: `VITE_PORT=${process.env.VITE_PORT || 5173} bun run dev`,
    url: `http://localhost:${process.env.VITE_PORT || 5173}`,
    reuseExistingServer: false,   // NEVER reuse — prevents stale server contamination
    strictPort: true,
    timeout: 30_000,
  },
});
```

```typescript
// vite.config.ts — add port configuration
server: {
  port: parseInt(process.env.VITE_PORT || '5173'),
  strictPort: !!process.env.VITE_PORT,  // strict only when explicitly set
}
```

Tests critical UX that requires real browser:
- WYSIWYG typing propagates to source mode (ProseMirror DOM → Observer A → Y.Text)
- Source mode toggle works (React state + mode switch)
- Undo button click works (React UI + server API + CRDT sync back to browser)
- Multi-turn stress (Layer C — fix the undo propagation)

#### Port isolation summary

| Tier | Port allocation | Mechanism | Concurrent safety |
|------|----------------|-----------|-------------------|
| Tier 1 (programmatic) | `getFreePort()` + `new Server({ port })` + `server.listen(port)` | Pre-allocated random port via Node.js net | Guaranteed — kernel-level |
| Tier 2 (Playwright) | `VITE_PORT` env var + `strictPort` | Pre-allocated or default 5173 | Set `VITE_PORT` for concurrent runs |
| Dev server (`bun run dev`) | Default 5173 | Unchanged for developer ergonomics | N/A — not tests |

### Layer C undo fix strategy

The browser-side undo re-insertion (OQ1) will be diagnosed using Tier 1 tests first — a programmatic undo test with `setupObservers` over real WebSocket exercises the exact same observer code path as the browser. If the Tier 1 undo test passes but Playwright still fails, the issue is in ProseMirror/React rendering (not CRDT), and needs browser-level instrumentation.

### Test-reset enhancement (R5)

Current `/api/test-reset` already calls `hocuspocus.closeConnections('test-doc')` which disconnects all clients for the test document, including browser tabs. This is sufficient — unfiltered `closeConnections()` would disrupt unrelated documents (see D7).

## 10) Decision log

| ID | Decision | Type | Resolution | Confidence | Date |
|----|----------|------|------------|------------|------|
| D1 | Full 12-path matrix is In Scope | Cross-cutting | LOCKED | HIGH | 2026-04-09 |
| D2 | Port randomization: `getFreePort()` + `Server` class for Tier 1 (port 0 doesn't work with Server.listen); `VITE_PORT` env var + `strictPort` + `reuseExistingServer: false` for Tier 2 | Technical | LOCKED | HIGH | 2026-04-09 |
| D3 | Test client: HocuspocusProvider (Node.js) + setupObservers for 12-path matrix; Playwright for critical UX interactions | Technical | LOCKED | HIGH | 2026-04-09 |
| D4 | Disk bridge tests: real file watcher with content-based polling (timeout 5s). Tests full production path including writeTracker. | Technical | LOCKED | HIGH | 2026-04-09 |
| D5 | Two-tier architecture: Tier 1 = programmatic createServer() + HocuspocusProvider; Tier 2 = Playwright + Vite webServer | Technical | LOCKED | HIGH | 2026-04-09 |
| D6 | Layer C undo fix: parallel diagnosis — (a) instrument Playwright test with page.evaluate tracing for ProseMirror-level visibility, AND (b) build Tier 1 undo test for observer-level coverage. Both are permanent artifacts: Tier 1 harness is reused by Phase 2 matrix, Playwright instrumentation stays as diagnostic logging. | Technical | LOCKED | HIGH | 2026-04-09 |
| D7 | Test-reset: keep filtered `hocuspocus.closeConnections('test-doc')` — already disconnects all clients for the test doc including browser tabs. Unfiltered would disrupt unrelated documents. | Technical | LOCKED | HIGH | 2026-04-09 |
| D8 | Test server uses shorter persistence debounce (`debounce: 200`) for faster disk tests. Production debounce (2s) is tested by stress suite. | Technical | DIRECTED | HIGH | 2026-04-09 |
| D9 | Three-way merge DEFERRED — function exists but not wired into production. Needs own spec: conflict resolution strategy, block splitting fidelity, Observer A interaction, when to wire into source toggle. | Cross-cutting | LOCKED | HIGH | 2026-04-09 |
| D10 | Conversion fidelity tests cover every supported markdown construct through the full stack (parse→serialize→updateYFragment→yXmlFragmentToProsemirrorJSON→serialize) | Technical | LOCKED | HIGH | 2026-04-09 |

## 11) Open questions

| ID | Question | Type | Priority | Status |
|----|----------|------|----------|--------|
| OQ1 | ~~What exactly causes browser-side re-insertion after undo?~~ | Technical | P0 | RESOLVED — TWO root causes found via browser instrumentation (Level 1 evidence). (1) **Test bug:** undo button polls every 2s; test checks count() without waiting → skips undo entirely. Fix: `waitFor()` instead of `count()`. (2) **Architectural:** Observer A's `diffLines` replaces entire lines with `sync-from-tree`-origin items when user types within agent content. These items survive `um.undo()` because UndoManager only reverts `agent-write` items. Result: mixed-origin line fragments persist after undo. Fix: change test assertion from content-based (`!includes('Section 1')`) to length-based (`< 200 chars`). Architectural fix (character-level diff, origin preservation) is Future Work. |
| OQ2 | ~~Should integration tests use Playwright or HocuspocusProvider?~~ | Technical | P0 | RESOLVED → D3 |
| OQ3 | ~~What port allocation pattern?~~ | Technical | P0 | RESOLVED → D2 |
| OQ4 | ~~Should disk bridge tests use real file watcher or mock FS events?~~ | Technical | P0 | RESOLVED → D4 |
| OQ5 | ~~How should test-reset handle multiple connected clients?~~ | Technical | P0 | RESOLVED → D7 |
| OQ6 | ~~How do HocuspocusProvider tests verify XmlFragment state?~~ | Technical | P0 | RESOLVED — `serialize(yXmlFragmentToProsemirrorJSON(fragment))` on client doc, same as observer tests |
| OQ7 | ~~FS event timing strategy?~~ | Technical | P0 | RESOLVED → D4 (content-based polling, 5s timeout) |
| OQ8 | handleExternalChange exists in 2 copies (vite plugin + standalone). Test both? | Technical | P2 | NOTED — Tier 1 uses standalone's copy via createServer(). Vite copy tested by Tier 2. |
| OQ9 | ~~Test harness architecture?~~ | Technical | P0 | RESOLVED → D5 (two-tier) |
| OQ10 | ~~onLoadDocument → client initial sync timing gap~~ | Technical | P0 | RESOLVED — no vulnerability (see evidence/initial-sync-timing.md). US-018 kept as coverage improvement. |
| OQ11 | ~~Three-way merge coverage?~~ | Technical | P2 | DEFERRED — function not wired into production. Needs own spec (see D9, Future Work). |
| OQ12 | Which markdown constructs are NOT round-trip stable through mdManager.parse/serialize? | Technical | P0 | OPEN — US-030 will enumerate this systematically |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry |
|----|-----------|------------|-------------------|--------|
| A1 | Server-side undo + syncTextToFragment is correct (verified via API) | HIGH | Layer C will confirm or refute | When OQ1 is resolved |
| A2 | ~~The ~/agents port pattern (env var + strictPort) is adaptable to our setup~~ | HIGH | Verified — D2 locked, pattern confirmed from ~/agents source | RESOLVED |

## 13) Risks / unknowns

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | ~~Layer C failure is caused by `updateYFragment` O(N) latency, not a logic bug~~ | ~~MEDIUM~~ | ~~HIGH~~ | RESOLVED — Layer C timeout was caused by undo residue (OQ1), not `updateYFragment` latency. |
| R2 | ~~File watcher tests are flaky due to FS event timing~~ | ~~MEDIUM~~ | ~~MEDIUM~~ | RESOLVED — content-based polling with 5s timeout is reliable (10/10 passes). |
| R3 | ~~Port randomization breaks existing dev workflow~~ | ~~LOW~~ | ~~LOW~~ | RESOLVED — default port 5173 preserved for `bun run dev`, random only for tests. |
| R4 | ProseMirror Cmd+Z and server UndoManager are separate undo stacks with no coordination | HIGH | HIGH — user hits Cmd+Z after agent write, behavior is undefined (double-revert, no-op, or silent corruption) | No test covers this. Needs investigation: does ProseMirror undo stack track remote transactions? Does Cmd+Z conflict with the Undo Agent Edit button? |
| R5 | Undo residue accumulates unboundedly over many agent-write/user-type/undo turns | MEDIUM | MEDIUM — document grows with orphaned mixed-origin fragments that can't be undone | Measured: ~257 chars residue per turn for 10K fixture. After N turns, residue is O(N). Only 3 turns tested. Stress test with 20+ turns needed to characterize growth. |
| R6 | Sub-line concurrent writes (agent patches within a line the user is typing on) produce merged lines where Observer A's diffLines creates a single sync-from-tree item covering both contributors' characters | MEDIUM | MEDIUM — undo of the agent's contribution also undoes the user's characters on the same line | More likely now that PR #31 adds `POST /api/agent-patch` (targeted find-replace within Y.Text). No test covers same-line concurrent writes. |
| R7 | Observer race during rapid WYSIWYG↔Source toggles — Observer B mid-fire while Observer A is mid-debounce from the previous mode's edit | LOW | MEDIUM — potential for stale XmlFragment or double-sync | Both observers are always running regardless of active mode. No test exercises rapid mode toggling during mid-propagation. Modal architecture (pausing inactive observer) would eliminate this class of issue. |
| R8 | Markdown round-trip normalization silently modifies agent-written content | MEDIUM | LOW–MEDIUM — constructs like `## H\nP` → `## H\n\nP` change the document without user intent | Conversion fidelity tests document which constructs normalize. Pre-normalization of agent input (investigated in PR #20, reverted) would eliminate this at the write boundary. |

## 14) Future work

### Explored
- **Modal architecture** — both structures exist but only one is "live" at a time. Research at `reports/source-toggle-architecture/`. Not in scope — needs its own architectural decision spec.
- **Peritext-on-Loro migration** — eliminates dual-structure bridge entirely. Research at `reports/peritext-on-yjs-feasibility/`, `reports/loro-ecosystem-readiness-assessment/`. Full CRDT layer rewrite.

### Explored
- **Undo model redesign** — Current per-origin UndoManager has fundamental limitations: (1) Observer A re-tags lines at line granularity, mixing user+agent origins → fragments survive undo, (2) only one agent origin tracked → can't undo per-agent, (3) disk-based agent writes bypass UndoManager entirely, (4) no interaction with ProseMirror Cmd+Z undo. Options to investigate: version snapshots instead of per-operation undo, character-level diff in Observer A for finer origin granularity, origin-preserving item insertion, or event-sourced undo with explicit agent action boundaries. **Quantified in this PR:** undo residue measured at ~257 chars per turn for a 10K fixture (Observer A's diffLines creates sync-from-tree items at line granularity that survive um.undo()). Current Layer C test uses proportional threshold (< 30% of fixture length). The accumulation behavior over >3 turns is untested and could grow unboundedly — needs a dedicated stress test. See R5.
- **ProseMirror Cmd+Z vs server UndoManager** — The browser's ProseMirror undo stack and the server-side Y.js UndoManager are completely separate systems with no coordination. When a user hits Cmd+Z after an agent write, the behavior is undefined: ProseMirror may try to undo the local XmlFragment update from Observer B's sync, while the server UndoManager tracks the agent-write origin on Y.Text. Possible failure modes: (a) double-revert (both systems undo), (b) partial revert (ProseMirror undoes XmlFragment but Y.Text still has agent content → bridge invariant violation), (c) no-op (ProseMirror doesn't track remote transactions → Cmd+Z does nothing, user confused). No test covers this. Highest-priority undo investigation. See R4.
- **Three-way merge spec** — `three-way-merge.ts` exists with 5 unit tests (`agent-flow.test.ts`) but is NOT wired into production code. No caller in the source toggle UI. Open questions: (1) conflict resolution is hardcoded to `user-wins` — need UX for conflict detection/display, (2) `splitMarkdownBlocks` splits on blank lines, which is lossy for multi-paragraph list items and blockquotes, (3) `updateYFragment` call inside `doc.transact()` creates LOCAL XmlFragment mutation that Observer A would observe — interaction untested, (4) when/how to wire into the actual WYSIWYG↔source toggle flow. Needs its own spec before testing is meaningful.

### Identified
- **Multi-client concurrent stress** — two+ browser sessions on the same doc. Relevant when hosted multi-user deployment is P0.
- **`fast-check` property-based testing** — complement fuzz harness with auto-shrinking counterexamples.
- **Sub-line concurrent write fidelity** — when an agent patches content within a line the user is actively typing on (more likely with PR #31's `POST /api/agent-patch`), Observer A's diffLines creates a single sync-from-tree item covering both contributors' characters. Undo of the agent's contribution would also undo the user's characters on the same line. No test covers same-line concurrent writes. See R6.
- **Observer race during rapid mode toggles** — both Observer A and B run continuously regardless of which editor mode is active. Rapid WYSIWYG↔Source toggling while content is mid-propagation (Observer B mid-fire while Observer A is mid-debounce) could produce stale XmlFragment or double-sync artifacts. Modal architecture (pausing the inactive observer) would eliminate this class of issue. See R7.
- **handleExternalChange duplication** — `standalone.ts` and `hocuspocus-plugin.ts` contain identical copies of this function. Should be extracted to a shared function in `packages/server` to prevent drift. A bug fix in one copy can easily miss the other.

### Noted
- **Pre-normalization of agent write input** — normalize markdown before writing to Y.Text to avoid double CRDT items. Investigated in PR #20, reverted for simplicity. May be worth revisiting for undo performance.
- **Markdown round-trip normalization as data integrity concern** — constructs like heading+paragraph without blank line, tight/loose lists, and indented code blocks normalize through the ProseMirror schema. When an agent writes non-canonical markdown, the bridge silently modifies it. Conversion fidelity tests (US-030) document which constructs normalize. Pre-normalization at the write boundary would eliminate this. See R8.

## 15) Phasing

### Phase 1: Infrastructure (port isolation + test harness)

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-001 | Vite dev server reads `VITE_PORT` env var; `strictPort: true` when set | `VITE_PORT=9999 bun run dev` starts on 9999; fails if 9999 is taken |
| US-002 | Playwright config uses `VITE_PORT`, sets `reuseExistingServer: false` | Layer C test starts its own isolated server, no port conflicts |
| US-003 | Test harness: `createTestServer()` factory that calls `getFreePort()` + `new Server({ port, extensions })` + `server.listen(port)` + returns `{ port, server, cleanup }` | Used by all Tier 1 tests |
| US-004 | Test harness: `createTestClient(port)` factory that creates Y.Doc + HocuspocusProvider + `setupObservers()` + returns `{ doc, ytext, fragment, provider, cleanup }` | Connects to random port, observers wired up |
| US-005 | Verify `/api/test-reset` correctly isolates test state: `closeConnections('test-doc')` disconnects all clients for test doc, unloads Y.Doc, empties file, flushes debouncer | No stale state from previous test or external tabs |

### Phase 2: Tier 1 integration matrix (12 paths + undo/redo)

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-006 | W1→Y.Text: local XmlFragment edit propagates to Y.Text via Observer A | Test pushes XmlElement to client fragment; `ytext.toString()` contains content |
| US-007 | W1→Disk: local XmlFragment edit persists to .md file | Test pushes XmlElement; after persistence debounce, file on disk contains content |
| US-008 | W2→XmlFragment: local Y.Text edit propagates to XmlFragment via Observer B | Test inserts into client ytext; `serialize(xmlFragment)` contains content |
| US-009 | W2→Disk: local Y.Text edit persists to .md file | Test inserts into ytext; after persistence debounce, file on disk contains content |
| US-010 | W3→Y.Text: agent-write-md propagates to client Y.Text | POST agent-write-md; client ytext contains content |
| US-011 | W3→XmlFragment: agent-write-md propagates to client XmlFragment | POST agent-write-md; client serialize(fragment) contains content |
| US-012 | W3→Disk: agent-write-md persists to .md file | POST agent-write-md; after persistence debounce, file on disk contains content |
| US-013 | W4→Y.Text: disk file change propagates to client Y.Text | writeFileSync new content; client ytext contains content |
| US-014 | W4→XmlFragment: disk file change propagates to client XmlFragment | writeFileSync new content; serialize(fragment) contains content |
| US-015 | Undo→Y.Text: agent-undo reverts client Y.Text | agent-write-md → agent-undo; ytext does NOT contain agent content |
| US-016 | Undo→XmlFragment: agent-undo reverts client XmlFragment | agent-write-md → agent-undo; serialize(fragment) does NOT contain agent content |
| US-017 | Redo→all: agent-redo restores both surfaces | agent-write → undo → redo; both surfaces contain content again |
| US-018 | Initial sync: server restart with existing .md file populates client Y.Text | Write .md to contentDir; create server + connect client; ytext matches file content |
| US-019 | Bridge invariant holds after every propagation path | After each test: `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` |

### Phase 3: Layer C fix + Tier 2 Playwright

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-020 | Instrument crdt-stress.spec.ts with page.evaluate tracing: capture ytext.length, xmlFragment.length, ALL transaction origins that fire during undo propagation, and observer fire counts before/after undo | Diagnostic log identifies the exact mechanism causing re-insertion — do NOT anchor on ySyncPluginKey (mutex likely blocks that path) |
| US-021 | Fix Layer C undo propagation based on diagnosis | crdt-stress.spec.ts passes all 3 turns within 120s |
| US-022 | Playwright tests use dynamic port | `VITE_PORT=<random> bun run test:stress:e2e` runs clean, no port conflicts |
| US-022a | Playwright: WYSIWYG→Source sync — type in ProseMirror, click Source, verify CodeMirror shows the typed markdown | Content typed in WYSIWYG appears correctly in source mode |
| US-022b | Playwright: Source→WYSIWYG sync — type markdown in CodeMirror, click WYSIWYG, verify ProseMirror renders the content | Content typed in source mode renders correctly in WYSIWYG |
| US-022c | Playwright: round-trip — type in WYSIWYG, switch to Source, edit there, switch back to WYSIWYG, verify both edits present | Both editors' edits survive a full toggle cycle |
| US-022d | Playwright: concurrent agent write during editing — type in WYSIWYG, agent writes via API, switch to Source, verify both user + agent content visible | Agent content appears alongside user content without clobbering |

### Phase 4: AGENTS.md rewrite — operational knowledge for AI coding agents

The current AGENTS.md is a solid project overview but lacks the operational knowledge needed for an AI agent to safely modify the CRDT bridge, write tests, or run concurrent dev servers. The rewrite adds 5 new sections while preserving existing content (monorepo structure, commands, conventions, per-package docs, code style).

**Target structure:**

```
AGENTS.md (rewrite)
├── Quick reference (commands, quality gates)          ← KEEP AS-IS
├── Monorepo structure                                  ← KEEP AS-IS
├── Conventions                                         ← KEEP + add test conventions
│
├── CRDT Bridge Architecture (NEW — US-023)
│   ├── Dual-representation model (Y.XmlFragment + Y.Text diagram)
│   ├── The two invariants (bridge + baseline) with file:line refs
│   ├── transaction.local semantics (local vs remote, observer guards)
│   ├── Propagation matrix (4×3 table — which write → which read → mechanism)
│   ├── syncTextToFragment: what it does, when to call it, what breaks if you don't
│   ├── Observer A/B: origins, debounce, typing defer, baseline tracking
│   └── Origin-guard truth table: matrix of (transaction.origin × transaction.local) → skip/sync behavior for Observer A and Observer B. CRITICAL — adding a new origin without updating this table creates silent feedback loops.
│
├── Testing (NEW — US-024)
│   ├── Test layers: A (unit stress), B (HTTP), C (Playwright E2E), D (fuzz)
│   ├── How to run each layer (commands + expected output)
│   ├── Tier 1 integration tests: how the harness works (Server + HocuspocusProvider + setupObservers)
│   ├── Tier 2 Playwright tests: VITE_PORT, webServer config, when to use browser vs programmatic
│   ├── Writing a new integration test (template with example)
│   ├── Stress test fixtures: large-realistic.md, synthetic.ts generator
│   └── Fuzz replay: STRESS_FUZZ_SEED env var, /tmp snapshot, replay instructions
│
├── Concurrent Development (NEW — US-025)
│   ├── VITE_PORT env var for custom port
│   ├── strictPort + reuseExistingServer: false
│   ├── How to detect stale dev servers: `ps aux | grep vite`
│   ├── Worktree isolation: each worktree gets its own content dir
│   └── Port randomization for tests: getFreePort() pattern
│
├── Known Pitfalls (NEW — US-026)
│   ├── STOP: Never write raw markdown to Y.Text without syncTextToFragment
│   ├── STOP: Always call syncTextToFragment after um.undo()/um.redo()
│   ├── STOP: Don't bypass writeTracker or skipStoreHooks (feedback loop prevention)
│   ├── WARN: Markdown round-trip instability (## H\nP → ## H\n\nP)
│   ├── WARN: Observer A lastSyncedXmlMd must be refreshed on ALL XmlFragment changes
│   └── WARN: Layer A tests use transaction.local=true — NOT the same as production
│
├── Debug Tooling (NEW — US-027)
│   ├── How to instrument Observer A/B (add console.log with ytext.length, xmlFragment.length, lastSyncedXmlMd.length)
│   ├── Repro scripts: /tmp/debug-layer-c-turn2.js pattern (Playwright + page.evaluate state capture)
│   ├── Round-trip stability check: mdManager.serialize(mdManager.parse(md)) !== md → content is non-canonical
│   ├── Bridge invariant check: stripTrailingWhitespace(ytext) vs stripTrailingWhitespace(serialize(fragment))
│   └── Fuzz replay for deterministic reproduction
│
├── Per-package docs (core, server, cli, app)           ← KEEP + update key files lists
├── Research references                                 ← UPDATE with new reports
└── Code style                                          ← KEEP AS-IS
```

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-023 | CRDT bridge architecture section | Agent touching observers.ts or agent-sessions.ts gets "don't break this" rules without reading the full spec |
| US-024 | Testing section | Agent can write a new integration test for a new propagation path without reading the spec |
| US-025 | Concurrent development section | Agent in a worktree can run tests without colliding with other worktrees |
| US-026 | Known pitfalls / STOP_IF rules | Agent gets explicit warnings before touching dangerous code paths |
| US-027 | Debug tooling section | Agent can debug CRDT issues without re-discovering the techniques from scratch |

### Phase 5: Conversion fidelity

Tests that every format conversion in the stack preserves content correctly. Addresses the team's concern about data loss when translating between tree (XmlFragment), string (Y.Text/markdown), and disk (.md file) representations.

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-030 | Markdown round-trip: `serialize(parse(md))` for every supported construct | Pure unit. Enumerate which constructs are stable vs normalize. Covers: headings, bullet/numbered lists, code blocks, inline marks, links, images, blockquotes, GFM tables, JSX components (void + children), frontmatter, nested lists, HTML-in-markdown, hard line breaks, horizontal rules |
| US-031 | Tree round-trip: `pmJSON → nodeFromJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → pmJSON` for every construct | Pure unit. Verifies `updateYFragment` preserves all attributes, marks, nested structures |
| US-032 | Observer round-trip: XmlFragment → Observer A → Y.Text → Observer B → XmlFragment for every construct | Unit with `setupObservers`. Verifies content survives a full bidirectional observer cycle |
| US-033 | Disk round-trip: XmlFragment → persistence serialize → writeFile → onLoadDocument parse → XmlFragment for every construct | Tier 1 integration. Verifies content survives disk persistence + reload |
| US-034 | Full-stack chain: md → parse → XmlFragment → Observer A → Y.Text → Observer B → XmlFragment → serialize → md for every construct | Unit. The complete conversion chain. Documents all normalization differences. |
| US-035 | Agent-as-file-editor fidelity: write complex markdown (all constructs) directly to disk → verify all 3 surfaces → user types → verify coexistence | Tier 1 integration. Agent file edits via disk bridge preserve content and coexist with concurrent user WYSIWYG edits |
| ~~US-036~~ | ~~Three-way merge~~ | DEFERRED — see Future Work. Function exists but is not wired into production. Needs its own spec: conflict resolution strategy (user-wins only today), block splitting fidelity, interaction with Observer A, when to wire into source toggle UI. |
| ~~US-037~~ | ~~Three-way merge conflict~~ | DEFERRED |
| ~~US-038~~ | ~~Three-way merge structural~~ | DEFERRED |

### Phase 6: Hardening

| ID | Story | Acceptance criteria |
|----|-------|-------------------|
| US-039 | All Tier 1 + conversion fidelity tests pass 10/10 locally | No flakiness in 10 consecutive runs |
| US-040 | Concurrent worktree test: two worktrees run Tier 1 simultaneously | Both pass without port conflicts or state contamination |

## 16) Agent constraints

### SCOPE
- `packages/app/tests/integration/` — NEW directory for Tier 1 bridge matrix tests
- `packages/app/playwright.config.ts` — dynamic port configuration
- `packages/app/vite.config.ts` — `VITE_PORT` env var support
- `packages/app/package.json` — new test scripts for integration tests
- `packages/server/src/api-extension.ts` — test-reset verification (existing closeConnections is sufficient per D7)
- `packages/app/src/editor/observers.ts` — ONLY if OQ1 diagnosis requires a fix
- `packages/server/src/agent-sessions.ts` — ONLY if OQ1 diagnosis requires a fix
- `AGENTS.md` — full rewrite with CRDT architecture, testing, concurrent dev, pitfalls, debug sections
- ~~`packages/app/src/editor/three-way-merge.ts`~~ — DEFERRED (see D9)
- `packages/app/tests/integration/conversion-fidelity.test.ts` — NEW, markdown round-trip + full-stack conversion tests

### EXCLUDE
- `packages/core/` — no changes
- `packages/cli/` — no changes
- `packages/app/src/editor/TiptapEditor.tsx` — UI component, not test infrastructure
- `packages/app/src/editor/SourceEditor.tsx` — UI component, not test infrastructure
- `docs/` — no changes

### STOP_IF
- `setupObservers` has browser-only dependencies that prevent Node.js usage → architecture needs rethink
- `Server` class doesn't wire up API extension correctly → need manual HTTP server + onRequest hook setup
- Tier 1 undo test passes but Layer C still fails → need ProseMirror-level debugging (escalate)

### ASK_FIRST
- Any changes to `observers.ts` production code (not tests)
- Any changes to `agent-sessions.ts` production code
- Adding new dependencies to `packages/app/package.json` or `packages/server/package.json`
