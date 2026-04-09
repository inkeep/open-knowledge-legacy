# CRDT Stress Testing — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-08
**Baseline commit:** `9380859`
**Links:**
- Evidence: `./evidence/`
- Prior spec: `specs/2026-04-08-presence-awareness-ux/SPEC.md`
- Prior spec: `specs/2026-04-07-bidirectional-observer-sync/SPEC.md`
- Baseline test suite: `init_spike/src/editor/observers.test.ts` (26 tests)

---

## 1) Problem statement

**Situation.** PR #7 (presence & awareness UX) shipped a real-time CRDT system: bidirectional observers between `Y.XmlFragment('default')` and `Y.Text('source')`, server-side per-origin `UndoManager`, an agent write API, and flash UX. The system has 100+ unit tests and 38 QA scenarios. All tests use small, hand-crafted content (~100-500 chars) and tightly timed sequences. The demo workflow is "agent writes one paragraph, user does one thing."

**Complication.** The real production usage is different:
- Agents produce **batch rewrites** — hundreds to thousands of markdown lines in one transaction (PQ11 is LOCKED — batch mode is the product).
- Users type continuously while agents work, often on the same document.
- Undo chains span multiple large agent actions ("oh no, undo those last three").
- The CRDT layer has subtle timing assumptions (50ms Observer A debounce < 300ms Observer B typing defer, `lastSyncedXmlMd` tracking external writes, `diffLines` line-alignment behavior). We just found a latent `diffLines` alignment bug with *small* content — scale will expose more.

Without explicit stress tests, latent bugs land in production. The demo works; the first real agent workflow with a 2000-line file may not.

**Resolution.** Build a stress test suite that:
1. Validates CRDT **correctness at graded scales** (small-realistic → medium-realistic → large-realistic → adversarial).
2. Exercises **concurrent human edits + agent writes + undos** under adversarial timing.
3. Is **reproducible** and allows data-driven integration decisions (fold into main suite if fast enough).
4. Covers **three test layers** — observer unit, API integration, and one Playwright E2E at large-realistic scale.

## 2) Goals

- **G1:** Catch CRDT correctness regressions (content loss, duplication, divergence) before they reach production, under realistic agent content sizes.
- **G2:** Establish confidence that concurrent user typing + large agent writes + undos compose correctly.
- **G3:** Surface the empirical limits of the current CRDT architecture — where does it start failing, at what scale, under what timing pressure.
- **G4:** Produce a reproducible harness that developers run before landing CRDT-layer changes (`observers.ts`, `hocuspocus-plugin.ts`, agent write paths).

## 3) Non-goals

- **[NOT NOW]** NG1: **Performance benchmarking** — latency/memory metrics, SLA-setting, propagation time budgets. Revisit if: the stress harness surfaces unexpected slowness or a user-facing latency complaint.
- **[NOT NOW]** NG2: **CI automation** — running the suite on every commit/PR. Revisit if: the profiling data (from D6/D8) shows the suite is fast enough to include in `check` or `test` without meaningful slowdown.
- **[NOT NOW]** NG3: **Multi-client concurrent stress** — two+ browser sessions editing the same doc with HocuspocusProvider relaying between them. Revisit if: hosted deployment makes real multi-user a P0 concern.
- **[NOT NOW]** NG4: **Persistence/disk-bridge stress** — file watcher + git pipeline under heavy write volume. Revisit if: disk bridge becomes a production path or we see data loss reports.
- **[NOT NOW]** NG5: **Adversarial/malformed content** — injection, pathological markdown, binary-in-text. Out of scope for correctness stress. Revisit if: a security review flags it.
- **[NEVER]** NG6: **Fuzzing the CRDT itself** — yjs internals, operation ordering, state vector math. Yjs is the dependency; stress it as a black box through the product's API only.

## 4) Personas / consumers

- **P1: CRDT-layer developer** — modifying `observers.ts`, `hocuspocus-plugin.ts`, agent write endpoints, or the server-side `UndoManager`. Runs the stress suite before landing changes.
- **P2: Spec author (future)** — specifies new agent behaviors (streaming, multi-file). Uses the stress suite results to understand current architectural limits.
- **P3: Incident investigator** — if a CRDT bug is reported in production, runs the stress suite with the reported scale to try to reproduce.

## 5) User journeys

### P1: CRDT-layer developer (primary)

1. Opens a PR that touches `observers.ts` or `hocuspocus-plugin.ts`.
2. Runs `bun test:stress` locally. Suite executes across all 4 scale tiers.
3. Reviews the pass/fail summary per tier and per scenario.
4. If the adversarial tier reports failures: these are informational (probe-only, per D5), not blockers.
5. If small/medium/large-realistic tiers fail: investigates, fixes, re-runs.
6. Lands the PR when small/medium/large-realistic all pass.

**Aha moment:** A correctness regression in `diffLines` alignment surfaces at the 2000-line tier before the PR ships — the exact class of bug that previously shipped undetected.

**Debug experience:** Failing tests log: which scenario, which tier, the first divergent assertion (e.g., "Y.Text != XmlFragment body at end of scenario X"), and the first ~10 lines of each side for visual diff.

### P3: Incident investigator

1. Gets a bug report: "agent rewrote my 3000-line doc and some of my edits disappeared."
2. Runs `bun test:stress --tier medium-realistic --scenario concurrent-typing-agent-write`.
3. If it reproduces locally → has a minimal repro to debug against.
4. If it doesn't → knows the bug is outside the observer path (browser state? HMR? timing sensitivity?) and investigates elsewhere.

### Interaction state matrix

| Scenario | Empty state | Steady state | Concurrent state | Failure state |
|---|---|---|---|---|
| Agent write propagation | Y.Text empty → agent writes large content → Y.Text + XmlFragment match | Ongoing writes extend both sides consistently | User typing mid-write → both sides converge | Observer exception → suite reports stack + scale tier |
| Undo chain | Stack empty | N agent writes → stack has N entries → N undos → stack empty | Undo fires during user typing → user content preserved | Undo at scale causes drift → suite reports which tier failed |
| Rapid sequential writes | First write lands | N writes at X ms interval → all visible | Writes interleaved with typing | Debounce/defer chain stalls → test times out, reports timeout |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: Synthetic markdown generator | Generates reproducible markdown at any requested line count with realistic structure (headings, paragraphs, lists, code blocks). Stable across runs given same seed. | Used by observer + API stress tests. |
| Must | FR2: Observer unit stress suite | Runs 7 scenarios (S1-S5, S8, S9) across up to 4 scale tiers. See §9 scenario matrix for the exact test-case count (23 cases as of current spec). Asserts two-tier convergence (bridge invariant + applyUpdate-restore semantics via S9). Reports timing per test. | `init_spike/tests/stress/observers.stress.test.ts` (moved — see M5 fix) |
| Must | FR3: API-level stress script (HTTP + server-side CRDT only) | Runs against dev server, exercises `/api/agent-write-md` + `/api/agent-undo` + `/api/agent-undo-status` + `/api/test-reset`. **Does NOT assert the bridge invariant** (that is Layer A's job). Focus: HTTP contract at scale + server-side UndoManager behavior. Opens a **fresh HocuspocusProvider per scenario** (destroy + reconnect each time) for isolation. Reads **Y.Text only** via `provider.document.getText('source').toString()`. See H3 reframing. | `init_spike/scripts/stress-api.ts` |
| Must | FR4: Playwright E2E at large-realistic | One E2E test: load browser, inject large-realistic markdown via agent API, type in WYSIWYG concurrently, click undo, verify final DOM + Y.Doc state. Multi-turn (3 turns) per D10. Uses **stock `@playwright/test` APIs with `page.waitForFunction` for deterministic condition-based waits** — no helper dependencies. See H1 reframing. | `init_spike/tests/stress/crdt-stress.spec.ts` (moved — see M5 fix) |
| Must | FR4a: Randomized fuzz harness (Layer D) | Seeded-PRNG mutator sequence driving the bridge. Mutators target applyUserDelta + observer interactions + server-side UndoManager. Scale ladder 10/50/200/500 iterations. Failure attribution via seed + replay mode + per-op log + Y.Doc snapshot dump. **Not the Yjs `applyRandomTests` pattern** (see C2 reframing) — this is a local mutator-ordering loop against the single-doc bridge, justified on its own merits. | `init_spike/tests/stress/observers.fuzz.test.ts` (moved; per D15, D16) |
| Must | FR4b: Parameterized Unicode variants | Bridge-critical scenarios (S2 concurrent, S4 undo-during-typing, S5 rapid writes) run in **two variants**: ASCII (default) and Unicode (emoji + CJK + combining marks). Separate test cases give attribution; parameterization gives coverage. S1, S3 keep single variant. See C3 reframing. | Layer A, per revised D14 |
| Must | FR5: Checked-in realistic fixture | A copy of an existing ~2K-line report markdown in `init_spike/tests/fixtures/large-realistic.md`. Used by Playwright E2E and available for ad-hoc testing. | Per D7. |
| Must | FR5a: Gap 2 trigger fixture | Synthetic generator MUST produce at least one content variant **without a trailing newline** so the `applyUserDelta` unterminated-final-line path is exercised. S4b scenario consumes this fixture. See M6 fix. | Layer A |
| Must | FR5b: Adversarial baseline comparison | First successful adversarial run captures `init_spike/tests/stress/adversarial-baseline.json` (wall time + pass/fail per scenario). Subsequent runs compare and report deltas. CLAUDE.md documents running before CRDT-layer changes. See C10 enhancement. | Layer A adversarial tier only |
| Must | FR6: Test runner integration | New `bun run test:stress` script in `init_spike/package.json`. Runs observer stress suite + API script + Playwright stress test. Default `test` and `test:e2e` scripts updated with ignore patterns to exclude `tests/stress` so stress runs stay opt-in. See M5 fix. | Per D8. |
| Must | FR7: Adversarial tier is probe, not gate | Adversarial tier (50K+ lines) runs in the harness, logs pass/fail, but failures do NOT fail the suite exit code. A separate summary line reports adversarial results. | Per D5. |
| Must | FR8: Empirical timing report | Stress suite emits per-scenario wall-clock timing + a summary. Used to decide whether to fold stress into the main suite (D6/D8). | Simple console output; no dashboards. |
| Should | FR9: Debugging output on failure | Failing tests print scenario name, tier, first divergence point, and first ~10 lines of both sides. | Developer ergonomics. |
| Should | FR10: Reproducibility | Synthetic generator uses a fixed seed by default. Timing-dependent scenarios use deterministic sleep/yield, not wall-clock assertions. | Flaky tests are worse than no tests. |
| Could | FR11: `--tier` and `--scenario` flags | Allow developers to run a specific tier or scenario for debugging. | Nice-to-have; not required for MVP. |

### Non-functional requirements

- **Performance:** Unit stress suite total wall-clock should ideally be < 60 seconds. API script + Playwright E2E can take longer (up to a few minutes combined). Actual numbers will drive D6/D8 integration decision.
- **Reliability:** Zero flaky tests. If a scenario is timing-sensitive and can't be made deterministic, it's removed, not tolerated.
- **Observability:** Console output is sufficient. Test runner must distinguish "hard failure" (small/medium/large-realistic) from "probe result" (adversarial).
- **Cost:** Zero external services. Runs fully local against bun + embedded Hocuspocus.

## 7) Success metrics & instrumentation

- **M1:** Stress suite passes on current main (post PR #7 merge + gap 2 fix).
  - Baseline: Unknown — never run before.
  - Target: All small/medium/large-realistic scenarios pass. Adversarial results logged.
  - Instrumentation: Test runner exit code + console summary.
- **M2:** Developer ran stress suite before landing a CRDT-layer PR.
  - Baseline: 0 (doesn't exist yet).
  - Target: Documented in `CLAUDE.md` as a required step for `init_spike/src/editor/observers.ts` or `init_spike/src/server/hocuspocus-plugin.ts` changes.
  - Instrumentation: None (cultural/process, not measured).
- **M3:** Wall-clock runtime of stress suite.
  - Baseline: Unknown.
  - Target: < 60s for observer stress alone. If met → fold into main suite (D6/D8).
  - Instrumentation: Built into the suite (FR8).

## 8) Current state (how it works today)

### CRDT architecture recap

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap WYSIWYG
├── Y.Text('source')          ← CodeMirror source mode
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution

Observer A: XmlFragment → Y.Text
  - Debounce: 50ms
  - Origin guard: skips ORIGIN_TEXT_TO_TREE
  - Delta-based: tracks `lastSyncedXmlMd`, applies user delta via applyUserDelta
Observer B: Y.Text → XmlFragment
  - Debounce: 50ms
  - Typing defer: 300ms window after markUserTyping
  - Early exit: if XmlFragment body === Y.Text body, skip updateYFragment
  - Updates lastSyncedXmlMd after propagation (new, from gap 2 fix)

Server-side UndoManager per doc:
  - trackedOrigins: Set(['agent-write'])
  - captureTimeout: 0 (each transaction = separate undo entry)
  - Lives on server because HocuspocusProvider overwrites remote origins
```

### Known gaps/bugs discovered during recent work

- **Gap 2 bug (fixed just before this spec):** `applyUserDelta` used `diffLines` which produced spurious `removed: X` + `added: X + Y` pairs for unterminated final lines. Fix: pad with `\n` + trim overlapping prefix between paired removed/added blocks.
- **Observer A baseline staleness (fixed just before this spec):** `lastSyncedXmlMd` was not updated when Observer B propagated external content to XmlFragment. Observer A would then re-propagate that content as a "user delta" on its next run. Fix: Observer B now updates `lastSyncedXmlMd` at the end of its sync (both early-exit and updateYFragment paths).
- **captureTimeout divergence:** Spec Q11 decided "use default 500ms" but code uses `0ms`. Documented in code comment; revisit when streaming agent writes land.

### Where the bugs live (informs scenario design)

Per the Yjs ecosystem survey (see `evidence/yjs-stress-patterns.md`):

> **Yjs is well-fuzzed upstream. Our custom code — `applyUserDelta`, bidirectional observers, XmlFragment↔Text bridge, server-side per-origin UndoManager — is the bug surface.**

The three places to concentrate test variety are exactly the three novel things in our stack:

1. **`applyUserDelta`** — three-way delta reconciliation that isn't a standard Yjs pattern. Already caught one bug (gap 2).
2. **Bidirectional observers with origin guards + typing-defer windows.** Custom to our project. Race conditions already surfaced (gap 2 fix cascade).
3. **Server-side per-origin `UndoManager` with concurrent "users"** (agents + humans). The Yjs agent flagged this as "genuinely uncharted territory" — no yjs/y-prosemirror upstream tests exercise this path.

BlockSuite's cautionary tale: they trusted Yjs and skipped CRDT-layer fuzzing of their reactive proxy layer. Real bugs lived in the glue code, not the core. **Same risk profile as ours.**

### Existing test coverage

- `observers.test.ts` — 26 tests (initial sync, origin guards, frontmatter, agent write chain, per-origin undo, concurrent edit race regression). All small content.
- 24 Playwright E2E tests in `tests/e2e/` (`sync.spec.ts` + `qa-scenarios.spec.ts`, 12 each) — sync behavior, multi-tab, cross-mode. Small content.
- 38 QA scenarios documented during PR #7 work in `tmp/ship/qa-progress.json` (ephemeral / worktree-local / gitignored — not part of the committed test suite, but represents the full QA plan that passed before PR #7 merged).

**What's missing:** Anything beyond small content. No concurrent-at-scale tests. No undo-chain tests at scale. No large-content roundtrip tests. No adversarial probes.

## 9) Proposed solution (vertical slice)

### Test layers

**Layer A: Observer unit stress suite** (`init_spike/src/editor/observers.stress.test.ts`)
- Runs in `bun test` runtime, no server, no browser.
- Uses the same Y.Doc + Observer setup as `observers.test.ts`.
- Each test case parameterized by `(scenario, tier)`.
- Asserts strict convergence + content preservation after all operations settle.

**Layer B: API-level stress script** (`init_spike/scripts/stress-api.ts`)
- Standalone script (not a bun test) that expects the dev server running.
- Runs each scenario via HTTP (`/api/agent-write-md`, `/api/agent-undo`, `/api/agent-undo-status`, `/api/test-reset`).
- Reads final state via a new `/api/dump-ydoc` endpoint OR via the existing agent-undo-status + content-read path (TBD during iterate).
- Asserts strict convergence.
- Reports timing per scenario.

**Layer C: Playwright E2E at large-realistic scale** (`init_spike/tests/e2e/crdt-stress.spec.ts`)
- One test only (for now). Loads the app, injects large-realistic fixture via the agent API, then simulates user typing via Playwright keyboard events, then clicks the undo button, verifies final state.
- Purpose: catch bugs in the full pipeline that API-level stress can't (ProseMirror reconciliation, React re-renders, cursor behavior, DOM sync).

### Scale tiers

| Tier | Line count | ~Byte size | Intent |
|---|---|---|---|
| **Small-realistic** | 100-500 | ~5-20KB | Current test baseline extended — fast sanity. |
| **Medium-realistic** | 2000 | ~50KB | The product's "small report" case — first real scale. |
| **Large-realistic** | 10000 | ~200KB | The product's "architecture.md" case — realistic upper bound. |
| **Adversarial (probe-only)** | 50000+ | ~1MB+ | Limit-finding. Failures are informational. Per D5/FR7. |

### Core scenarios (run at each applicable tier)

| ID | Scenario | Small-realistic (500L) | Medium-realistic (2000L) | Large-realistic (10K L) | Adversarial (50K L, probe) |
|---|---|:---:|:---:|:---:|:---:|
| **S1** | Single agent write → Observer B propagates → strict convergence | ✓ | ✓ | ✓ | ✓ |
| **S2** | Concurrent user typing + agent write → both preserved (**ASCII + Unicode variants** per C3) | ✓×2 | ✓×2 | ✓×2 | ✓ (ASCII only) |
| **S3** | Undo chain: N agent writes, N undos → returns to initial state | ✓ (N=5) | ✓ (N=5) | ✓ (N=3) | — |
| **S4** | Agent undo during active user typing (**renamed — no longer "gap 2 at scale"** per M6; ASCII + Unicode variants per C3) | ✓×2 | ✓×2 | ✓×2 | — |
| **S4b** | **applyUserDelta unterminated-final-line regression** — content without trailing newline exercises the actual gap 2 code path at scale (per M6 + FR5a) | ✓ | ✓ | ✓ | — |
| **S5** | Rapid sequential writes (N=5 at 100ms intervals) — debounce coalescing at typical cadence (**ASCII + Unicode variants**) | ✓×2 | ✓×2 | ✓×2 | — |
| **S5b** | **High-throughput burst** — N=100 writes at ~1ms intervals, small content only. Tests observer backpressure + lastSyncedXmlMd race + Y.Doc update accumulation (per C4 analysis) | ✓ | — | — | — |
| **S6** | Multi-turn (Layer C only): 3 turns of agent→user→undo, each with varied content | — | — | ✓ (1 Playwright test) | — |
| ~~S7~~ | ~~Y.mergeUpdates round-trip~~ — **removed per C1 analysis.** In single-doc setup, `Y.encodeStateAsUpdate → Y.applyUpdate` is a Yjs invariant, not a bridge test. See S9 for the reframed scenario. | — | — | — | — |
| **S8** | Unicode-heavy propagation at S1 shape (dedicated pure-Unicode baseline, complements the parameterized S2/S4/S5 variants for attribution) | ✓ | ✓ | ✓ | — |
| **S9** | **Observer initialization from applyUpdate-restored doc** — encode source doc state, apply to fresh doc, run `setupObservers` on fresh doc (non-empty init path), perform additional operations, assert bridge invariant. Tests the production reconnect flow that runs setupObservers on a pre-populated doc (`TiptapEditor.tsx` calls `setupObservers` on `synced` event, AFTER sync has populated both halves — currently untested). Per C1 reframing. | — | ✓ | — | — |

**Scenarios excluded from adversarial (per Q8 resolution):**
- S3 at 50K would need 50K undos per step — pointless
- S4 at 50K would need sustained typing for 30+ seconds — flaky
- S5 at 50K would need 5× 50K writes in quick succession — blows up Y.Doc state vector without testing correctness

**Adversarial tier runs S1 + S2 only.** Both are probe-status per D5 — failures logged + compared to baseline JSON (per C10 enhancement), not gating.

### Scenarios broken down by layer

**Layer A (`tests/stress/observers.stress.test.ts`)** — **tests the bridge invariant.** Runs deterministic scenarios at scale:
- **S1** ×4 tiers = 4 cases
- **S2** (ASCII) ×4 tiers + **S2** (Unicode) ×3 realistic tiers = 7 cases
- **S3** ×3 realistic tiers = 3 cases
- **S4** (ASCII) ×3 realistic tiers + **S4** (Unicode) ×3 realistic tiers = 6 cases
- **S4b** (unterminated-final-line gap 2 regression) ×3 realistic tiers = 3 cases
- **S5** (ASCII) ×3 realistic tiers + **S5** (Unicode) ×3 realistic tiers = 6 cases
- **S5b** (high-throughput burst) ×1 tier (small only) = 1 case
- **S8** (dedicated Unicode propagation) ×3 realistic tiers = 3 cases
- **S9** (observer init on restored doc) ×1 tier (medium only) = 1 case

**Layer A total: 34 test cases.**

Convergence assertion after each test:
1. **Primary (bridge invariant):** `stripTrailingWhitespace(ytext.toString()) === stripTrailingWhitespace(mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment)))`
2. **Content preservation:** every user keystroke and every non-undone agent insertion is `.toContain()`-verified.

S9 uses a modified form: the bridge invariant is asserted on the **restored** fresh doc after additional operations, not the source doc.

**Layer A local UndoManager note:** S3/S4/S4b/S5/S5b use a locally-instantiated `Y.UndoManager(ytext, { trackedOrigins: new Set(['agent-write']), captureTimeout: 0 })` that mirrors the server's config. This is **not** the same instance as the real server-side UndoManager — the real one is only exercised by Layer B. (per L4)

**Layer B (`tests/stress/stress-api.ts`)** — **tests HTTP contract + server-side CRDT at scale.** Does **NOT** test the bridge invariant (Layer A's job). Per H3 reframing:
- Opens a **fresh** `Y.Doc()` + `HocuspocusProvider` per scenario (destroys both at teardown)
- Does **not** call `setupObservers` — Layer B doesn't care about XmlFragment
- Reads **Y.Text only** via `provider.document.getText('source').toString()`
- Assertions are **containment-based** (not exact equality): "after agent write, Y.Text contains expected content"; "after undo, Y.Text does not contain agent content"; "after N writes, undo status reports `canUndo: true` with N entries"
- Tests the **real server-side UndoManager** (the "genuinely uncharted territory" from §8) via `/api/agent-undo` and `/api/agent-undo-status`

**Applicable scenarios (dropped scenarios that require client-side typing simulation):**
- **S1** (propagation) ×3 realistic tiers = 3 cases
- **S3** (undo chain) ×3 realistic tiers = 3 cases
- **S5** (rapid sequential writes) ×3 realistic tiers = 3 cases
- **S8** (Unicode propagation) ×3 realistic tiers = 3 cases

**Layer B total: 12 test cases.**

Scenarios **dropped from Layer B** (can't be tested via HTTP+WebSocket alone): S2, S4, S4b, S5b, S6, S9. These require simulating concurrent typing / client-side observer initialization, which isn't Layer B's purpose.

**Runtime note:** Fresh provider per scenario adds ~500ms-2s of WebSocket connect + initial sync per test case. 12 cases × avg 1.5s overhead = ~20s pure overhead. Acceptable given D8 (stress is opt-in).

**Layer D — Randomized fuzz (observers.fuzz.test.ts):** runs a seeded-PRNG mutator sequence against a single Y.Doc with observers. Borrows the Yjs `applyRandomTests` architecture but adapted to single-doc single-user scenario (we don't have N clients; our stress surface is the bridge between XmlFragment and Y.Text).

**Fuzz mutators (targeting our bug surface per §8):**
- `pushXmlParagraph(doc, prng)` — user typing: append a random-content paragraph to XmlFragment
- `deleteXmlParagraph(doc, prng)` — user deletion: remove a random existing paragraph
- `insertYText(doc, prng)` — agent write: insert random content into Y.Text with origin `'agent-write'` (in a dc.transact block)
- `agentUndo(undoManager)` — trigger `undoManager.undo()` if canUndo is true
- `agentRedo(undoManager)` — trigger `undoManager.redo()` if canRedo is true
- `flushObservers(wait)` — advance time past TYPING_DEFER_MS so observers drain
- `markTyping()` — call markUserTyping() to simulate the typing-defer window

**Fuzz scale ladder (separate test cases):**
- `test: fuzz 10 iterations (smoke)` — fast CI signal
- `test: fuzz 50 iterations (baseline)` — standard run
- `test: fuzz 200 iterations (deep)` — extended run
- `test: fuzz 500 iterations (nightly probe)` — marked as `.todo` or skipped by default, runnable via env var

**Failure attribution (per D16):**

```ts
// Per-operation log (always on)
console.log(`[fuzz] iter=${i} seed=${seed} op=${opName}`);

// On assertion failure, print replay instructions
if (!bridgeInvariantHolds(doc)) {
  const snapshotPath = `/tmp/fuzz-failure-${Date.now()}.ydoc`;
  writeFileSync(snapshotPath, Y.encodeStateAsUpdate(doc));
  throw new Error(
    `Fuzz bridge invariant violated at iter=${i}, seed=${seed.toString(16)}\n` +
    `Replay:  STRESS_FUZZ_SEED=${seed.toString(16)} STRESS_FUZZ_MAX_ITER=${i} bun test observers.fuzz\n` +
    `Snapshot: ${snapshotPath}\n` +
    `Manual bisect: halve STRESS_FUZZ_MAX_ITER until it passes`
  );
}
```

Environment variables for replay:
- `STRESS_FUZZ_SEED=<hex>` — reuse a specific seed (default: `Date.now()`)
- `STRESS_FUZZ_MAX_ITER=<N>` — stop at iteration N (default: full ladder)
- `STRESS_FUZZ_VERBOSE=1` — enable extra logging for debugging

**Layer C (`tests/stress/crdt-stress.spec.ts`)** — one Playwright test, large-realistic scale. Runs **S6 only** (multi-turn). Uses **stock `@playwright/test` APIs with `page.waitForFunction` for deterministic condition-based waits** — no helper dependencies, no `waitForDOMStabilization` heuristic polling. Per H1 reframing.

**Why stock APIs + waitForFunction:** stabilization polling returns on "no change for N ms" — a heuristic that can return early during a brief pause mid-write. `waitForFunction(() => condition)` waits for exact state, not elapsed time. Existing `sync.spec.ts:343-347` already uses the `page.evaluate` on `window.__hocuspocusProvider` pattern — validated.

**Sequence (reference implementation, not copy-paste):**

```typescript
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.STRESS_BASE_URL ?? 'http://localhost:5173';
const FIXTURE = readFileSync('init_spike/tests/fixtures/large-realistic.md', 'utf8');

test('multi-turn stress — large content + user edits + undos', async ({ page }) => {
  // 1. Capture console errors during the full flow
  const logs: Array<{ type: string; text: string }> = [];
  page.on('console', m => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', e => logs.push({ type: 'uncaught', text: e.message }));

  // 2. Reset server state (POST, not default GET — per H2 fix)
  await fetch(`${BASE}/api/test-reset`, { method: 'POST' });

  // 3. Navigate + wait for singleton provider (set lazily in TiptapEditor.tsx)
  await page.goto(BASE);
  await page.waitForFunction(() => Boolean((window as any).__hocuspocusProvider));
  await page.waitForSelector('.ProseMirror');

  // 4-9. Three turns
  const markers = ['USER-MARK-1', 'USER-MARK-2', 'USER-MARK-3'];
  for (const marker of markers) {
    // Inject via agent API
    await page.evaluate(async (md) => {
      await fetch('/api/agent-write-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: md }),
      });
    }, FIXTURE);

    // Wait for Observer B propagation — deterministic condition
    await page.waitForFunction(
      (expected) => (window as any).__hocuspocusProvider.document.getText('source').toString().length >= expected,
      FIXTURE.length - 100, // tolerance for whitespace normalization
      { timeout: 15000 },
    );

    // Simulate user typing (real keyboard events)
    await page.locator('.ProseMirror').focus();
    await page.keyboard.type(marker, { delay: 5 });

    // Wait for Observer A sync — content contains the marker
    await page.waitForFunction(
      (m) => (window as any).__hocuspocusProvider.document.getText('source').toString().includes(m),
      marker,
      { timeout: 5000 },
    );

    // Click undo
    await page.locator('[data-undo-state="ready"]').click();

    // Wait for undo propagation — agent content removed, user marker still present
    await page.waitForFunction(
      (m) => {
        const txt = (window as any).__hocuspocusProvider.document.getText('source').toString();
        return !txt.includes('Source of Truth') && txt.includes(m); // 'Source of Truth' is in the fixture header
      },
      marker,
      { timeout: 5000 },
    );
  }

  // 10. Final assertions
  const errors = logs.filter(l => l.type === 'error' || l.type === 'uncaught');
  expect(errors).toEqual([]);

  const finalState = await page.evaluate(() => {
    const provider = (window as any).__hocuspocusProvider;
    return {
      ytext: provider.document.getText('source').toString(),
    };
  });

  // All three user markers preserved
  for (const marker of markers) {
    expect(finalState.ytext).toContain(marker);
  }
});
```

The test is self-contained. No `helpers.*` imports, no custom wait utilities, no `/browser` skill dependency. Uses `page.on('console')` (4 lines) instead of `helpers.startConsoleCapture`. Uses `page.waitForFunction` with specific state conditions instead of `helpers.waitForDOMStabilization`.

### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (editor) | TipTap WYSIWYG + CodeMirror source | Large-content rendering, cursor behavior during writes, undo button state |
| `POST /api/agent-write-md` | Agent write path | Large payload handling, UndoManager entry creation |
| `POST /api/agent-undo` | Undo action | Multi-step undo chain correctness |
| `POST /api/test-reset` | Test isolation | Clean state between scenarios |

### Data flow diagram

**Primary flow (stress scenario S2 — concurrent typing + agent write):**

```
[Stress harness] → [Agent write: 2000 lines via Y.Text transaction, origin 'agent-write']
                     ↓
         Y.Text mutation (atomic)
                     ↓
    Observer B fires (50ms debounce)
                     ↓
[Stress harness] → [User typing: mutate XmlFragment via fragment.push]
                     ↓
    Observer A fires (50ms debounce)
    Observer B: defers while markUserTyping recent
                     ↓
    Observer A syncs XmlFragment delta → Y.Text (applyUserDelta)
    User stops typing → Observer B runs → rebuilds XmlFragment from Y.Text
                     ↓
[Stress harness] asserts strict convergence + content preservation
```

**Shadow paths to test:**
- **nil / missing:** Y.Text empty when agent writes (initial sync path)
- **empty:** User pushes empty paragraph during agent write
- **wrong size:** Content that straddles debounce/defer boundaries (50ms-100ms write intervals)
- **timeout:** Observer B defers forever because typing never stops → test harness must detect stall
- **conflict:** User and agent modifying overlapping lines simultaneously
- **partial failure:** Agent write throws mid-transaction (simulated via mdManager.parse error)

### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact (in test) |
|---|---|---|---|---|
| `applyUserDelta` diff alignment | Spurious re-insertion of removed content | Strict convergence assertion fails | Fail the test, report tier + scenario | Test suite reports bug |
| Observer B stall | Typing never stops, `updateYFragment` never runs | Scenario timeout (e.g., 10s per tier) | Fail the test with timeout marker | Test suite reports stall |
| Y.Doc memory growth | Agent writes fill Y.Doc faster than debounce clears | (N/A for correctness) | (N/A) | Logged in adversarial tier only |
| Observer origin guard miss | External write appears with wrong origin, infinite loop | Test time-boxed | Fail with loop marker | Test suite reports |
| Undo beyond stack | Extra undo after stack empty | `canUndo: false` → return gracefully | No-op (already tested) | Test verifies graceful no-op |

### Alternatives considered

- **Alternative: "Skip Layer C Playwright entirely, rely on A+B"** — Rejected because Layer C catches a class of bugs the others can't reach (ProseMirror reconciliation under load, React re-render storms, cursor disruption during large content, DOM sync issues). User specifically wanted "multi-turn stuff" that exercises the full browser pipeline.
- **Alternative: "Add a test-only `/api/dump-ydoc` endpoint for Layer B"** — Rejected per D9 because it doesn't exercise the real sync chain; a correctness regression in the HocuspocusProvider → Y.Doc → observer path might not surface through a server-side endpoint that bypasses it.
- **Alternative: "Layer B uses fresh provider per scenario + setupObservers on the client's Y.Doc (bridge invariant via HTTP path)"** — Considered as the original H3 resolution. Rejected in favor of the narrower Option E (see D9 amended): running `setupObservers` in Node is feasible but **duplicates Layer A's bridge coverage** through more infrastructure. Layer B's unique value is HTTP contract + server-side UndoManager testing, not "Layer A through the wire." Narrowing Layer B is cleaner than duplicating Layer A.
- **Alternative: "Use `fast-check` property-based testing"** — Deferred to Future Work. Worth considering for follow-up, but the immediate need is catching the classes of bugs we already know about (race conditions, delta alignment, stale baselines). Property-based would add setup overhead without solving the immediate goal.
- **Alternative: "Stress test via existing Playwright E2E suite extension, not a new file"** — Rejected. Stress scenarios are slow and should be opt-in (`bun test:stress`). Mixing them into the existing fast E2E suite (`tests/e2e/*.spec.ts`) would slow down normal test runs and muddy the intent.
- **Alternative: "Port `/browser` skill's helpers (`waitForDOMStabilization`, `startConsoleCapture`) into `init_spike/tests/e2e/helpers.ts`"** — Rejected per H1 analysis. The helpers' underlying pattern (DOM-stabilization polling) is a weaker heuristic than `page.waitForFunction` with specific state conditions, which is what the rewritten Layer C uses. Porting would enshrine a worse pattern.
- **Alternative: "Adopt full Yjs `applyRandomTests` + `TestConnector` multi-user harness for Layer D"** — Rejected per C2 analysis. That pattern's power comes from simulating N async network-connected docs — our setup is single-doc, single-user. A local mutator-ordering loop against our bridge is a different (and appropriate) thing; the Yjs vocabulary was misleading in the original D15 framing.
- **Alternative: "Spread Unicode content across all synthetic scenarios (D14 original)"** — Rejected per C3. Attribution becomes a forensic puzzle when a test fails with mixed Unicode + structural stress. Parameterized `S2_ascii` + `S2_unicode` variants give both coverage AND clean attribution.
- **Alternative: "Drop S7 entirely (original C1 resolution)"** — Rejected in favor of reframing as S9 (D17). The drop would lose meaningful coverage of the production reconnect path where `setupObservers` runs on a pre-populated doc. The reframed S9 tests something genuinely untested in `observers.test.ts`.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Primary goal = correctness, not performance benchmarking | P | LOCKED | No | Gap 2 regression test caught a live bug. Batch agent writes are PQ11-locked. Benchmarking is separate concern. | Conversation (2026-04-08) | Performance → Future Work (NG1) |
| D2 | Graded scale across 4 tiers (small/medium/large-realistic + adversarial) | T | LOCKED | No | User explicitly wants to know the limits. Tiered approach lets us catch easy bugs fast and surface scale-specific issues. | Conversation (2026-04-08) | Test matrix size grows 4x |
| D3 | Test infrastructure = A + B + 1×C + D (observer unit + HTTP/server CRDT + one Playwright E2E + fuzz) | T | LOCKED | No | Each layer catches different bugs. See D15 for Layer D addition. | Conversation (2026-04-08) + H5 audit fix | **Four files to build + maintain** (Layer A, B, C, D). Amended post-audit (H5): D3's original "three files" framing predated D15. |
| D4 | Pass criteria = no bugs/crashes + strict convergence | T | LOCKED | No | Strict is the binary signal; content preservation is the user-visible concern. Both are needed. | Conversation (2026-04-08) | Assertions must check both |
| D5 | Adversarial tier is probe, not gate | T | LOCKED | No | Adversarial failures are informational. Suite exit code tied only to realistic tiers. | Conversation (2026-04-08) | Separate exit-code path for probe results |
| D6 | Stress tests start in separate file; measure runtime; fold into main suite if fast | T | LOCKED | Reversible | Data-driven integration decision. Build first, profile, then decide. | Conversation (2026-04-08) | Must emit timing (FR8) |
| D7 | Fixture strategy = synthetic generator + checked-in real fixture | T | LOCKED | No | Synthetic = reproducible + scalable, real = catches parser quirks. Both cheap. | Conversation (2026-04-08) | FR1 + FR5 |
| D8 | Test runner integration = `bun test:stress` initially; profile; fold if fast | T | LOCKED | Reversible | Same data-driven logic as D6. | Conversation (2026-04-08) | FR6 |
| D9 | API-level stress (Layer B) uses real HocuspocusProvider client, reads **Y.Text only**, asserts **HTTP contract + server-side CRDT behavior** — NOT the bridge invariant | T | LOCKED | No | User: "closest to real chain is best" — still honored (real HTTP + real WebSocket sync). Audit (H3) revealed original plan was broken: without `setupObservers` on the client script's Y.Doc, XmlFragment stays empty while Y.Text fills, breaking bridge-invariant assertions. Plus CRDT merge re-adds prior scenario state on reconnect. **Resolution:** narrow Layer B to HTTP + server-side UndoManager testing (the unique coverage Layer A can't provide); drop bridge invariant assertions from Layer B. Fresh `Y.Doc()` + `HocuspocusProvider` per scenario for isolation. Runs on Bun (native WebSocket) or Node 22+; for earlier Node, pass `WebSocketPolyfill: require('ws')` per M7. | Conversation + H3 audit + M7 audit + `HocuspocusProviderWebsocket.ts:179-181` | Layer B shrinks from 21 → 12 test cases. Fresh provider per scenario adds ~20s overhead total. Server-side UndoManager ("uncharted territory" per §8) gets exercised here. |
| D10 | Playwright E2E does multi-turn stress using **stock `@playwright/test` + `page.waitForFunction`** (no helpers) | T | LOCKED | No | User: "I think we need to test like multi-turn stuff." Original plan referenced `helpers.*` functions from /browser skill that don't exist in `init_spike/tests/`. Audit (H1) caught this. Audit (L3) caught the singleton provider race. **Resolution:** rewrite Layer C using stock Playwright APIs. `page.waitForFunction` with specific state conditions (e.g., `ytext.length >= expected` or `ytext.includes(marker)`) — more deterministic than heuristic DOM-stabilization polling. `page.on('console', ...)` for error capture (4 lines). `page.waitForFunction(() => window.__hocuspocusProvider)` guard before any evaluate (L3). `fetch('/api/test-reset', { method: 'POST' })` (H2 — the default GET is rejected 405). Pattern validated against existing `sync.spec.ts:343-347`. | Conversation + H1/H2/L3 audit findings | Self-contained test file with no external dependencies |
| D11 | Current timing assumptions (50ms debounce, 300ms typing defer) hold provisionally; adjust only if stress suite fails | T | LOCKED | Reversible | User agreed: "sounds good" on empirical-first approach. The stress suite's purpose is to find this out. If large-realistic scenarios stall, widen windows then. | Conversation (2026-04-08) | Start implementation with current observer timings |
| ~~D12~~ | ~~Add S7: Y.mergeUpdates round-trip~~ **Superseded by D17.** Original framing was meaningless in single-doc (verified via runtime: `Y.encodeStateAsUpdate → Y.applyUpdate` produces identical state — a Yjs invariant, not a bridge test). Challenger C1 caught the meta-pattern: "spec imports Yjs vocabulary without re-grounding in our bridge context." Yjs's `compare()` uses mergeUpdates in a **multi-user** context where users received different update subsets — structurally different from our single-doc setup. | T | SUPERSEDED | No | C1 analysis + runtime test | — |
| D13 | Convergence assertion is two-tier: (1) bridge invariant (normalized toString equality on both halves), (2) content preservation via `.toContain()` for user keystrokes. **Previously said "mergeUpdates round-trip" as tier 2 — corrected per C1.** **Scoped to Layer A only** (Layer B doesn't assert the bridge invariant per D9/H3; Layer D fuzz uses primary only per M1). | T | LOCKED (amended) | No | Challenger C1 reframing + M1 scope fix | Every Layer A test case runs both assertions; Layer B asserts containment-only; Layer D asserts primary-only. |
| D14 | **Parameterized Unicode variants** for bridge-critical scenarios (S2, S4, S5). Each runs in two variants: ASCII (default) and Unicode (emoji + CJK + combining marks). S1/S3 keep single ASCII variant. S8 remains as a dedicated pure-Unicode propagation baseline. | T | LOCKED (reversed twice — first flipped to dedicated-only, then flipped again to parameterized after C3) | No | First flip: user pushback on spreading; second flip: challenger C3 — parameterized gives BOTH coverage AND attribution (test names carry attribution). Per `/tdd`: "tests should describe WHAT failed" — `S4_ascii` and `S4_unicode` as separate cases do exactly this. | C3 analysis + /tdd skill | Layer A adds Unicode variants for S2/S4/S5 (~6 test cases) |
| D15 | Add **local seeded-PRNG fuzz harness** (Layer D) — NOT the Yjs `applyRandomTests` pattern | T | LOCKED (framing amended per C2) | No | User: "reliably is key. lets add." **Original framing was misleading** — the Yjs `applyRandomTests` pattern's power comes from `TestConnector` simulating 5 async network-connected docs (multi-user network simulation). Our adaptation is a **local mutator-ordering loop against a single doc** — justified on its own merits (catches interleaving bugs in our custom `applyUserDelta` + observer bridge that deterministic tests don't imagine), but NOT the canonical Yjs harness. | `evidence/yjs-stress-patterns.md` + C2 reframing | New file `tests/stress/observers.fuzz.test.ts`, ~200 lines. Fuzz catches unknown bugs; deterministic tiers catch regressions for known bugs. |
| D16 | Fuzz failure attribution = seeded PRNG + per-op logging + replay mode + manual bisect + failure snapshot | T | LOCKED | No | Answers "how will we know when it fails" directly. Deterministic replay from seed + per-op log + snapshot dump is the Yjs pattern. fast-check would add auto-shrinking but is rejected per Future Work (scope). | /tdd + worldmodel findings | Fuzz test harness includes logging infrastructure from day 1 |
| D17 | **Add S9: observer initialization from applyUpdate-restored doc** (replaces dropped S7) | T | LOCKED | No | Reading `TiptapEditor.tsx:71-87` — `setupObservers` is called in the `synced` event handler, AFTER HocuspocusProvider has already received the server state and applied it. **The Y.Doc has content BEFORE `setupObservers` runs in production.** But `observers.test.ts` has no test that populates both halves via `applyUpdate` before calling `setupObservers`. This is an untested production path. S9 exercises it: encode source doc state → apply to fresh doc → setupObservers → additional operations → assert bridge invariant. Medium-realistic tier only (1-2 test cases). Layer A only. | `TiptapEditor.tsx:71-87` + C1 analysis | Tests observer init from non-empty state (production reconnect scenario) |
| D18 | **`/api/test-reset` must force-flush Hocuspocus debouncer before unloading** | T | LOCKED | Reversible | Audit M2 — verified in `Hocuspocus.ts:545-552`: `shouldUnloadDocument` returns false if `debouncer.isDebounced(...) || isCurrentlyExecuting(...) || saveMutex.isLocked()`. Our config: `debounce: 2000, maxDebounce: 10000`. Any agent write within 2s before test-reset leaves pending debounced work → unload silently skipped → server's Y.Doc stays loaded with prior state. The evidence file `test-reset-isolation.md` claimed "full state reset" but missed this race. **Resolution:** amend `/api/test-reset` handler to force-flush pending `onStoreDocument` work before unload. Pre-req fix for the stress suite's isolation protocol. Touches `init_spike/src/server/hocuspocus-plugin.ts`. | `Hocuspocus.ts:545-552` + M2 audit | Pre-req to Layer B + Layer C reliability. Small patch to existing endpoint. |
| D19 | **Add S4b: gap 2 unterminated-final-line regression scenario** | T | LOCKED | No | Audit M6 — S4 "gap 2 at scale" conflated two bugs. The actual gap 2 fix was about `diffLines` alignment when `oldXmlMd` has an unterminated final line — NOT specifically about undo-during-typing. Q3 deterministic generator likely always ends content in `\n` → S4 bypasses the gap 2 code path entirely. **Resolution:** add S4b that explicitly constructs content without trailing newline, triggering the `oldPadded`/`newPadded` + prefix-trim code path at scale. Adds FR5a (generator must produce at-least-one no-trailing-newline variant). | M6 audit + `observers.ts:131-184` | 3 test cases (one per realistic tier) |
| D20 | **Add S5b: high-throughput burst** — N=100 writes at ~1ms intervals, small content | T | LOCKED | No | Challenger C4 — content-size tiers stress serialization throughput, not race paths. Current S5 (N=5 at 100ms intervals) is barely rapid — not true mutation-count stress. S5b scales up N and compresses the interval to exercise observer backpressure, `lastSyncedXmlMd` update races, Y.Doc update accumulation. Small content only (larger content would make this a size test, not a throughput test). 1 test case. Complements Layer D fuzz (fuzz finds unknown bugs; S5b is deterministic regression cover). | C4 analysis | Adds 1 Layer A test case at small tier only |
| D21 | **Adversarial tier uses baseline comparison, not just "probe-only"** | T | LOCKED | No | Challenger C10 — "probe-only" outputs have no consumer. Without baseline, "took 45s" is meaningless. With baseline, "took 45s vs 30s baseline = 50% regression" is actionable. **Resolution:** first successful adversarial run captures `init_spike/tests/stress/adversarial-baseline.json` (wall time + pass/fail per scenario). Subsequent runs compare and report deltas. Consumer documented in CLAUDE.md: "author runs adversarial before modifying `observers.ts`/`hocuspocus-plugin.ts`/`applyUserDelta`/diff library." | C10 analysis | Adds FR5b. Baseline file checked in. |
| D22 | **Implementation follows /tdd tracer-bullet order**, not bulk 48-tests-at-once | T | LOCKED | No | Challenger C8 — /tdd skill was loaded for guidance but §13 Next Actions listed all test cases as a batch. /tdd explicitly warns against horizontal slicing: "Write a test for first behavior → test fails → GREEN: minimal code to pass → repeat." **Resolution:** §13 Next Actions documents build order: "S1 small → pass → S1 medium → pass → ... S1 all tiers → S2 small → ..." Each test case is a tracer bullet. | /tdd skill + C8 critique | Implementation guidance only; no scope change |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | How does the API layer (Layer B) read final Y.Doc state? | T | P0 | Yes | → Resolved as D9: real HocuspocusProvider client | RESOLVED |
| Q2 | What's the timeout per scenario? | T | P0 | No | Start 10s for small/medium-realistic, 30s for large-realistic, 60s for adversarial. **Caveat (M3):** adversarial S2 at 50K interleaved inputs may exceed 60s given Myers O(N·D) worst case (approaches O(N²)). Adjust empirically. Adversarial-tier failures that hit timeout are reported in a distinct "did not converge in time" bucket vs. "converged but assertion failed" — both informational per D5, but the distinction matters for debugging. | RESOLVED |
| Q3 | Synthetic generator — seeded randomness or deterministic? | T | P0 | No | **Fully deterministic** — line N always has content `## Section N — <fixed-lorem-blob>`. Reproducibility trumps variety for correctness tests. | RESOLVED |
| Q4 | How does Layer C simulate fast user typing + multi-turn? | T | P0 | Yes | → Resolved as D10: multi-turn via `page.keyboard.type()` + real undo click + `page.evaluate()` for state read | RESOLVED |
| Q5 | Is `/api/test-reset` sufficient for test isolation? | T | P0 | No | **Yes — verified via code read.** Closes all agent sessions, destroys UndoManagers, unloads doc, resets content file. See `evidence/test-reset-isolation.md`. Call test-reset at the START of every scenario. Use single doc name `'test-doc'`. | RESOLVED |
| Q6 | Fixture file location | T | P0 | No | Committed at `init_spike/tests/fixtures/large-realistic.md` (new dir). Source: copy of an existing ~2K-line report from `reports/`. | RESOLVED |
| Q7 | Console output vs JSON summary | T | P2 | No | Console for MVP; upgrade to JSON if tooling needs it. Each test logs `[stress] scenario=<name> tier=<tier> elapsed=<ms> result=<pass/fail>`. | RESOLVED |
| Q8 | Adversarial tier matrix subset | T | P0 | No | **Subset: S1 (propagation) + S2 (concurrent) only.** S3 (undo chain) at 50K would need 50K undos — pointless. S4 (undo during typing) at 50K would need sustained typing for 30+ seconds — flaky. S5 (rapid writes) at 50K would blow up Y.Doc size. | RESOLVED |
| Q9 | Do current observer timings (50/300ms) hold at scale? | T | P0 | Yes | → Resolved as D11: provisional, adjust only if stress fails | RESOLVED |
| Q10 | Is `mdManager.serialize` deterministic? | T | P0 | Yes | **Yes — verified via runtime test.** Deterministic across runs, but strips trailing newlines. See `evidence/mdmanager-determinism.md`. Convergence assertions must normalize trailing whitespace. | RESOLVED |
| Q11 | Content check style | T | P0 | No | **Two tiers:** (1) substring `.toContain(userKeystroke)` for preservation checks; (2) exact equality after trailing-whitespace normalization for strict convergence. | RESOLVED |
| Q12 | Cleanup between scenarios | T | P0 | No | **`afterEach` hook** destroys Y.Doc + UndoManager + calls observer cleanup function. Observer stress file owns the cleanup. | RESOLVED |

_(All P0 questions resolved. None remain open.)_

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Current observer architecture scales linearly with content size up to large-realistic (10K lines) | MED | The stress suite itself will verify | Before finalization | Active |
| A2 | `diffLines` from `diff@7+` uses Myers **O(N·D)** where N = sequence length and D = edit distance. Best-case (mostly aligned inputs) is ~O(N). Worst-case (highly interleaved or divergent inputs) approaches O(N²). Acceptable at 10K aligned lines (~1-2s); adversarial S2 at 50K interleaved may exceed the 60s timeout. **Corrected from spec's earlier O(n·m) claim (auditor M3 + challenger C9).** | MED | Profile during iterate; adversarial tier has baseline comparison (D21) to catch regression | Before finalization | Active |
| A3 | `mdManager.serialize` + `yXmlFragmentToProsemirrorJSON` round-trip is stable (same input → same output) | HIGH | Quick test during iterate (Q10) | Before finalization | Active |
| A4 | Playwright can drive keyboard events fast enough to exercise typing race conditions | MED | Try it during iterate (Q4) | Before finalization | Active |
| A5 | `/api/test-reset` fully resets observer + undo manager state between scenarios **after the D18 force-flush patch**. Without the patch, test-reset has a 2s race window where pending `onStoreDocument` debounced work causes `unloadDocument` to early-return silently. | MED (HIGH once D18 ships) | Verified via `Hocuspocus.ts:545-552` code read (M2 audit) — see `evidence/test-reset-isolation.md` for corrected semantics | Blocks Layer B + Layer C until D18 is implemented | Active (conditional on D18) |
| A6 | Bun test runner handles 60s+ suites cleanly (no timeout overrides needed) | HIGH | Verify with an intentionally long test during iterate | Before finalization | Active |

## 13) In Scope (implement now)

- **Goal:** Build the stress test suite described in §9, covering all locked decisions.
- **Non-goals:** Performance benchmarking, CI automation, multi-client stress, disk-bridge stress, adversarial content validation (per §3).
- **Requirements with acceptance criteria:** See §6 FR1-FR11.
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Nick Gomez (spec author); implementation TBD.
- **Next actions (in tracer-bullet order per D22):**
  1. **Pre-req:** Implement D18 — force-flush `hocuspocus.debouncer.executeNow('onStoreDocument-test-doc')` in `/api/test-reset` handler (`init_spike/src/server/hocuspocus-plugin.ts`). Without this, Layer B + Layer C isolation is unreliable.
  2. Scaffold `init_spike/tests/stress/` directory + fixture dir. Move forthcoming files into `tests/stress/` NOT `src/editor/` or `tests/e2e/` (M5 fix).
  3. Update `package.json` scripts: `"test": "bun test --path-ignore-patterns 'tests/e2e' --path-ignore-patterns 'tests/stress'"`, `"test:e2e": "npx playwright test --test-ignore='tests/stress/**'"`, `"test:stress": "bun test tests/stress/observers.stress.test.ts tests/stress/observers.fuzz.test.ts && bun run tests/stress/stress-api.ts && npx playwright test tests/stress/crdt-stress.spec.ts"` (M5 fix).
  4. Build `tests/stress/synthetic.ts` — the deterministic markdown generator (FR1, FR5a).
  5. Copy a ~2K-line report markdown to `tests/fixtures/large-realistic.md` (FR5).
  6. **Layer A tracer bullets** (per D22, /tdd): S1 at small-realistic → make it pass → then S1 at medium → ... → S1 done → S2 ASCII at small → ... Keep going one test at a time. DO NOT bulk-write all 34 test cases upfront.
  7. Layer D: scaffold `observers.fuzz.test.ts` with 3 tiny mutators + 10-iteration ladder. Make it pass. Then add mutators + expand ladder.
  8. Layer B: scaffold `stress-api.ts` with S1-small against a running dev server. Prove isolation (D18 prerequisite verified). Then expand.
  9. Layer C: write the single Playwright test per §9 sequence. Verify multi-turn passes.
  10. Run full suite. Capture FR8 timing. Decide D6/D8 integration based on measured runtime.
  11. Capture adversarial baseline (FR5b / D21). Commit `tests/stress/adversarial-baseline.json`.
  12. Document in CLAUDE.md: "Before modifying `observers.ts`/`hocuspocus-plugin.ts`/`applyUserDelta`/diff library, run `bun run test:stress` and compare adversarial results to baseline."
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** Per-scenario wall-clock time (FR8), pass/fail per tier, adversarial probe results.

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Stress suite is too slow to run regularly | MEDIUM | HIGH — suite stops being run, value decays | Profile first (D6/D8), gate integration on measured runtime | Nick |
| Stress suite is flaky (non-deterministic timing) | MEDIUM | HIGH — flaky tests get ignored, real bugs lost | Use deterministic sleep/yield patterns; FR10 reproducibility requirement | Nick |
| `diffLines` O(N·D) Myers cost approaches O(N²) on highly divergent/interleaved inputs — large-realistic or adversarial may exceed timeouts | LOW (small/medium tiers), MEDIUM (large), HIGH (adversarial S2) | MEDIUM-HIGH — would force a diff strategy change | Q2 timeouts are initial guesses; adjust empirically. Adversarial baseline comparison (D21) surfaces regressions. If timeouts consistently exceeded, consider swapping diffLines for `diff-match-patch` or a structural diff. | Nick |
| Playwright E2E is so flaky it has to be dropped | MEDIUM | MEDIUM — lose one layer of coverage | Accept it if flaky; rely on A+B and fold learnings back into observer tests | Nick |
| Adversarial tier reveals fundamental scaling issues that block other work | LOW | HIGH — may force architecture rework | Probe-only classification (D5) contains blast radius; document findings as Future Work | Nick |
| Scenarios don't actually exercise the bug we just fixed (gap 2 regression) | LOW (post-D19) | MEDIUM — false confidence | **Explicitly include S4b** (D19) that constructs unterminated-final-line content and exercises the `applyUserDelta` `oldPadded`/prefix-trim code path at scale. S4 alone (undo-during-typing) is insufficient — M6 audit caught this conflation. | Nick |
| Layer B / Layer C isolation fails silently because of test-reset race (M2 audit) | MEDIUM (pre-D18), LOW (post-D18) | HIGH — scenarios cross-contaminate, results become noise | D18 patches `/api/test-reset` to force-flush debouncer before unload. Layer B uses fresh provider per scenario as additional defense. | Nick |
| Layer C Playwright test is flaky due to timing-based waits | LOW (new design) | MEDIUM — lose one layer of coverage | Use `page.waitForFunction` with specific state conditions (not stabilization polling). H1 reframing validated against existing `sync.spec.ts` pattern. | Nick |

## 15) Future Work

### Explored

- **Property-based testing with `fast-check` for the bridge layer**
  - What we learned: `fast-check` has `fc.commands()` model-based testing that auto-shrinks failing command sequences. Yjs's custom harness doesn't shrink — when a 300-iter test fails you get a seed, not a minimized counterexample. `fast-check` would save hours of debugging when a long sequence fails.
  - Recommended approach: Scope to the bridge layer specifically — `applyUserDelta`, Observer A/B interactions. Model: a simplified state machine (what Y.Text has, what XmlFragment has, what lastSyncedXmlMd is). Commands: mutate XmlFragment, mutate Y.Text, run Observer A, run Observer B. Invariant: after all observers settle, the bridge invariant holds.
  - Why not in scope now: Adds a dependency (fast-check). Steeper learning curve. The Yjs ecosystem has explicitly avoided it for 5+ years, so the prior-art pool is thin.
  - Triggers to revisit: If the randomized fuzz harness (above) catches bugs that are hard to minimize manually.

- **Performance benchmarking suite**
  - What we learned: Different concern from correctness. Needs latency instrumentation, memory profiling, SLA targets. Would reuse the scale tiers from this spec.
  - Recommended approach: Add `console.time`/`performance.now` marks around each observer pass. Emit JSON summary with p50/p95/p99 per scenario. Compare against a baseline captured during initial run.
  - Why not in scope now: Correctness is the priority (D1). Benchmarking is a separate discipline with its own tooling needs.
  - Triggers to revisit: The stress harness surfaces unexpected slowness, or a user-facing latency complaint.

### Identified

- **CI automation of stress suite**
  - What we know: Deferred (D6/D8) until profiling data shows it's fast enough.
  - Why it matters: Without CI, stress suite decays — developers forget to run it.
  - What investigation is needed: Profile runtime (M3), decide fold strategy, wire into GitHub Actions.

- **Multi-client concurrent stress**
  - What we know: Two browsers editing same doc via HocuspocusProvider. Different failure modes than single-client stress. Would need Playwright multi-context setup. Yjs ecosystem tests this via `TestConnector` simulating N users — pattern directly applicable.
  - Why it matters: Real multi-user deployment is coming (hosted target). Also, the Yjs agent flagged disconnect/reconnect timing as "where real bugs live" — we currently don't exercise this at all.
  - What investigation is needed: Hosted deployment timing, multi-client awareness protocol behavior at scale, how to simulate disconnect/reconnect at the Hocuspocus layer.

- **Server-side UndoManager stress with interleaved users**
  - What we know: The Yjs agent flagged this as "genuinely uncharted territory — no yjs/y-prosemirror upstream tests exercise this path." We test undo-during-typing (gap 2) but not more exotic interleavings.
  - Why it matters: Undo is a safety net; if it ever silently corrupts state, trust collapses.
  - What investigation is needed: Enumerate undo interleavings worth testing (partial undo, redo-after-edit, undo-across-disconnects), then decide which are tractable at unit level vs integration.

### Noted

- **Disk-bridge stress** — file watcher + git pipeline under heavy write volume. May surface different race conditions than observer-level stress.
- **Adversarial/malformed content** — injection, pathological markdown, very long single lines. Separate from correctness stress.
- **Agent streaming writes** — when agents produce output in token bursts rather than single transactions, `captureTimeout: 0` behavior may need to become `500ms` (see spec Q11 divergence note).
- **Disconnect/reconnect timing tests** — Yjs's `TestConnector` tests this via 2% dice-roll probability. We don't currently exercise this because our stress is single-client. Pattern is portable.

## 16) Agent constraints

- **SCOPE:**
  - `init_spike/tests/stress/observers.stress.test.ts` (Layer A — new file)
  - `init_spike/tests/stress/observers.fuzz.test.ts` (Layer D — new file)
  - `init_spike/tests/stress/stress-api.ts` (Layer B — new file)
  - `init_spike/tests/stress/crdt-stress.spec.ts` (Layer C — new file)
  - `init_spike/tests/stress/synthetic.ts` (deterministic markdown generator — new file)
  - `init_spike/tests/stress/adversarial-baseline.json` (generated on first successful adversarial run — new file)
  - `init_spike/tests/fixtures/large-realistic.md` (checked-in fixture — new file)
  - `init_spike/package.json` (add `test:stress` script, update `test` + `test:e2e` ignore patterns)
  - `init_spike/src/server/hocuspocus-plugin.ts` (D18 — add force-flush call in `/api/test-reset` handler ONLY)
  - `init_spike/CLAUDE.md` (add documentation for when to run stress + baseline update protocol)
- **EXCLUDE:**
  - `init_spike/src/editor/observers.ts` (no changes — the stress suite tests it, doesn't modify it)
  - `init_spike/src/editor/extensions/` (out of scope)
  - `init_spike/src/presence/` (out of scope)
  - `init_spike/src/App.tsx` and other editor React components (out of scope)
  - Any existing test files in `init_spike/src/editor/` or `init_spike/tests/e2e/` (do not modify — stress suite is additive)
  - Any production code outside `hocuspocus-plugin.ts` test-reset handler
- **STOP_IF:**
  - Implementation requires modifying `observers.ts`, `applyUserDelta`, or Observer A/B core logic → stop (that's a production code change, not a stress test change; needs its own spec)
  - Implementation requires a new 3P dependency (beyond what `init_spike/package.json` already has) → stop and ask first
  - Implementation requires changing the `diff` library or markdown parser → stop (affects production behavior)
  - Stress suite wall-clock at small-realistic tier exceeds 30 seconds → stop and report (likely indicates a bug in the suite or an observer change)
  - Bridge invariant assertion fails at small-realistic tier → stop (indicates a real CRDT bug; root-cause before proceeding)
- **ASK_FIRST:**
  - Any change to `hocuspocus-plugin.ts` beyond the D18 force-flush patch (e.g., new endpoints, changing existing handlers)
  - Any change to `package.json` dependencies (not scripts)
  - Deciding whether to fold stress suite into default `bun test` after profiling (D6/D8 — data-driven, but the decision itself should be confirmed)
  - Adding test layers beyond A/B/C/D (spec locks 4 layers; additions need spec amendment)
