# Test Isolation & Parallelism — Spec

**Status:** Draft (v2 — post-investigation pass)
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-10
**Baseline commit:** `main` @ post-PR-#34 merge
**Delivery:** **Single PR** covering local multi-agent parallelism, harness isolation, CI + local turbo-task parallelism, per-doc production state, and coordination-state symmetry across both editor modes.
**Guiding criteria:** Scope decisions filter on (a) **evidence-based correctness** — a measured bug or observed failure class, or (b) **strictly-better quality** — a change that is well-defined, objectively superior on a named dimension (fewer race surfaces, fewer serialization points, simpler invariants, better inner-loop DX), and supported by evidence the current shape is inferior. This is a greenfield project with AI-assisted implementation — **cost, effort, and LOC are not filters.** The filter is "what's correct" measured against evidence.
**Links:**
- Prior spec: `specs/2026-04-09-bridge-integration-matrix/SPEC.md` (PR #34)
- Measurements: end-to-end timings captured in session 2026-04-10
- Related risk: R7 (observer race during rapid mode toggles) from bridge-integration-matrix spec

---

## 1) Problem statement

**Situation.** PR #34 landed a comprehensive integration test suite — 174 tests across unit, integration (Tier 1 bridge matrix), conversion fidelity, stress (scale-graded), fuzz (seeded mutators), and Playwright (Tier 2 browser E2E). End-to-end timings from session 2026-04-10:

| Tier | Tests | Time |
|---|---|---|
| `bun run test` cold | 174 | ~65s |
| `bun run test` warm (turbo cache) | 174 | ~1s |
| Stress (`observers.stress.test.ts`) | 32 + 2 todo | **~417s (~7 min)** |
| Fuzz (`observers.fuzz.test.ts`) | 3 + 1 todo | ~133s (~2 min) |
| Playwright (`crdt-stress` + `ux-interactions`) | 5 | ~15s |
| **Sequential total** | **214** | **~11 min** |

**Complication.** Parallelism is needed in three independent places, and all three are blocked today by the same root causes:

1. **Local multi-agent workflows.** Multiple AI agents operate on this repo concurrently — sometimes in sibling worktrees, sometimes attached to the same worktree but in different shells. An agent running `bun run check` must not interfere with another agent running `bun run test:stress`, and neither must collide with a developer running `bun run dev` for manual verification. Today, most of this *already works* (per-process ports via `getFreePort()`, per-server tmpdirs via `mkdtempSync()`), except for two hot spots: (a) every integration test targets the hardcoded `'test-doc'` document name, so two tests in one process (and by extension, two concurrent `bun test` invocations against the same file) clobber each other via `/api/test-reset`; (b) Playwright tests use the repo's real `packages/content/` directory, so a manual `bun run dev` writing to `packages/content/test-doc.md` contends with Playwright's dev-server doing the same thing. **This was observed directly during the measurement run** — a Playwright stress test timed out at 60s because our manual dev server and Playwright's dev server were both hitting the same file.

2. **CI exists but runs nothing heavy.** A single-job `ci.yml` on main runs `bun run check` (typecheck + lint + broad `test` which covers unit + integration + fidelity). No stress, no fuzz, no Playwright coverage in CI at all. Stress at ~7 min sequential would dominate once added; the fan-out to matrix jobs is trivial but requires splitting stress into independent files first AND converting the existing single-job workflow into the symmetric matrix structure.

3. **Tests are serialized by shared module-level state.** `packages/app/src/editor/observers.ts` has a module-level `let lastUserTypedAt = 0` reset by `__resetCoordinationState()` in test beforeEach hooks. This forbids intra-file parallelism (bun `test.concurrent()`) because two concurrent tests in the same process would trample each other's coordination window. It also represents a latent production bug: two Y.Doc instances in one process (reconnect scenarios, multi-tab, future multi-doc editors) share typing state, which is architecturally wrong.

**Resolution.** One PR. Five architectural layers applied consistently, each validated empirically during the spec investigation phase:

1. **Harness isolation with client-in-body lifecycle.** Per-test docName via `randomUUID()`. Client lifecycle moves from shared `beforeEach/afterEach` hooks into each test body via `try/finally`. Kills the shared mutable `let client: TestClient` closure variable — a pattern that **empirically breaks under `bun test.concurrent()`** (proven via spike: the describe-level `let client` races across concurrent tests, crashes when afterEach nulls the ref mid-test). The new pattern is strictly better for both sequential and concurrent tests.
2. **Playwright content dir isolation via module-scope `mkdtempSync`.** `hocuspocus-plugin.ts` honors `process.env.OK_TEST_CONTENT_DIR`. `playwright.config.ts` creates the per-run tmpdir at module-load time (NOT `globalSetup` — empirically verified against Playwright 1.59.1 source that `createPluginSetupTasks` runs the webServer spawn BEFORE `config.globalSetups`, so mutating `process.env` in globalSetup is too late). Cleanup via `globalTeardown` which runs after tests complete.
3. **Turbo task-based parallelism (one mechanism, local + CI).** Split `observers.stress.test.ts` into 4 scenario-group files; add per-shard turbo tasks; add root `check:full:parallel = turbo run test:stress:* test:fuzz test:integration test:e2e --concurrency=100%`. **Empirically validated**: turbo mechanism works (3 parallel tasks, process-isolated, grouped output, exit codes propagate), cold run produces ~6 min local wall clock under 4-way CPU contention, **warm cache replay runs in 33ms** (transformative for inner loop when nothing changed). CI gets ~2-3 min wall clock because each shard lands on its own runner without contention. Same task graph powers both surfaces — no separate CI-only abstraction.
4. **Coordination-state symmetry: WeakMap + SourceEditor listeners.** Move `lastUserTypedAt` from module scope into `WeakMap<Y.Doc, TypingState>` (unblocks `test.concurrent()` for observer tests). **Additionally**: add `markUserTyping(doc)` calls from `SourceEditor.tsx` DOM events (keydown/paste/drop/cut). The prior spec claimed the WYSIWYG-only stamp was deliberate — re-reading the code proves otherwise. `setupObservers()` is a singleton per HocuspocusProvider bound to the Y.Doc, both editors mount simultaneously via React 19 `<Activity>` (EditorArea.tsx:20-37), and Observer B runs continuously regardless of visible mode. With only TiptapEditor stamping the typing window, source-mode typing runs Observer B without coordination. **This is the real R7 bug** — not "rapid mode toggles rewire observers" as previously framed. The fix is R7 Option C: add the mirror listeners. Composes cleanly with the WeakMap move.
5. **Full removal of `__resetCoordinationState`.** After the WeakMap move, fresh Y.Docs have no typing-state entry by default — the reset helper is vacuous. Remove the import + call from all 6 test files that currently use it. No test-helper API leaks remain in `observers.ts`.

The five layers ship together because they form one architectural statement: **"test isolation failures should be impossible by construction, not by convention, and the supporting production state should be symmetric across both edit modes."** Every claim above was validated empirically: the concurrent-pattern spike, the Playwright source code trace, the turbo mechanism spike with cold+warm measurements, the code read proving the SourceEditor asymmetry was accidental not deliberate. No "should work" remains.

## 2) Goals

- **G1: Local multi-agent parallelism by construction.** Two agents running any test command simultaneously — in the same worktree, different shells, or separate worktrees — cannot interfere. A manual `bun run dev` running in one shell cannot interfere with Playwright stress tests running in another. No "please turn off your dev server first" rules.
- **G2: Local `check:full:parallel` replaces sequential `check:full` as the default full-suite command.** Measured wall clock on a 16-core M-series laptop: **~6 min under 4-way CPU contention** (vs ~11 min sequential baseline). Empirically validated during spec investigation. **Warm cache replay: 33 ms** when nothing has changed — the inner-loop DX win.
- **G3: PR CI wall clock ≤ 5 minutes.** Same turbo task graph as local; each shard runs on its own GitHub Actions runner with no cross-shard CPU contention → per-shard time drops to ~2-3 min from the locally-measured ~4-6 min. Wall clock ≤ 5 min including runner startup.
- **G4: Agent inner loop (`bun run check`) stays fast AND gets fine-grained cache invalidation.** `bun run check` composes three turbo tasks (`check`, `test:integration`, `test:conversion`) with independent cache keys. Editing a single test file invalidates only its dedicated task, not the whole gate — warm replay drops from "whole check tier" to "one task". Cold run ~30s; warm replay after editing `conversion-fidelity.test.ts` is ~16s (was ~30s under the broad-task design). **Turbo cache replay of the full test suite is 33 ms** when nothing changed. **No CI duplication** — each test runs exactly once per PR because the CI matrix is one job per turbo task, and every turbo task is in exactly one matrix job.
- **G5: Test isolation failures are impossible by construction.** No shared `'test-doc'` docName. No shared module-level mutable state reachable from tests. No shared `packages/content/` directory between manual dev servers and Playwright test runs. Client lifecycle is per-test `try/finally`, not a closure-variable `let client` that races under concurrent mode.
- **G6: R7 (source-mode coordination asymmetry) fully fixed.** `markUserTyping(doc)` is called from both `TiptapEditor.tsx` (WYSIWYG keystrokes) AND `SourceEditor.tsx` (CodeMirror keystrokes), via mirrored DOM listeners. Observer B's typing-defer window applies uniformly regardless of which editor has focus. This is strictly better: coordination behavior is symmetric across both surfaces of the bridge.
- **G7: Intra-file `test.concurrent()` safe.** `bun test.concurrent()` confirmed supported (docs + empirical spike). With client-in-body lifecycle + per-doc WeakMap state, eligible integration and fidelity tests drop to ~5s from ~13s / ~16s. Cannot run concurrently with tests that explicitly verify shared-state behavior (initial sync, test-reset semantics) — those opt out via plain `test()`.
- **G8: No test-helper API leaks in production code.** `__resetCoordinationState` is removed entirely. Nothing in `observers.ts` exists purely to support tests. Production state management is self-contained.

## 3) Non-goals

- **[NEVER]** NG1: **Migrate off `bun test`.** Stay on bun's native runner.
- **[NOT NOW]** NG2: **Post-merge jobs.** Per team constraint, nothing runs after merge to main. All verification is pre-merge.
- **[NOT NOW]** NG3: **`writeTracker` refactor.** Audit showed it's content-addressed — two test servers writing identical content both correctly self-suppress; two with different content don't collide. No observed or measurable bug and no dimension where the current shape is *strictly* inferior. Both the correctness filter and the strictly-better filter reject this.
- **[NOT NOW]** NG4: **Canonicalizing `mdManager`/`schema` into a single shared instance.** Flagged in PR #34 review. 14 instances across 3 packages, all stateless per audit. Deduplication is a real improvement (single source of truth, less drift surface), but it's architecturally orthogonal to test isolation — it's a cross-package code hygiene refactor with its own distinct blast radius. Belongs in its own PR driven by the code hygiene story, not bundled with test isolation. **This deferral is NOT cost-based** (cost is irrelevant); it's coherence-based — mixing two independent architectural stories in one PR makes review and rollback harder.
- **[NOT NOW]** NG5: **Playwright per-test docName with URL routing.** Requires adding `?doc=<uuid>` routing to the React app — substantial app-level refactor unrelated to test infrastructure. Playwright content dir isolation (in scope) removes the *cross-process* contention; the *intra-Playwright* parallelism question is separate. Addressed long-term by NG5's follow-up spec.
- **[NOT NOW]** NG6: **Playwright multi-worker parallelism within a single run.** Current total Playwright runtime is ~15s. Not worth per-worker webServer plumbing.
- **[NOT NOW]** NG7: **Turbo per-file content hashing.** Too complex, no first-party support.
- **[NOT NOW]** NG8: **Concurrent Vite dev servers against the same repo with shared content dir.** Addressed by the Playwright env-var pattern, but the "multiple humans dev-serving the same worktree" use case is separate and not driven by test isolation. File a follow-up if anyone actually hits it.
- **[NOT NOW]** NG9: **Extracting a `check:agent` thin-gate script.** Measured: `bun run check` is ~20s warm. Fast enough for the inner loop. Optimize only if it becomes a bottleneck.
- ~~**[NOT NOW]** NG10: **Partial/complete fix of R7.**~~ **REMOVED from non-goals.** Investigation revealed R7's actual root cause is not "rapid mode toggles rewire observers" (the observers are singletons bound to the Y.Doc and don't rewire). The real cause is **coordination-state asymmetry**: `markUserTyping()` is only called from `TiptapEditor.tsx` DOM events, so source-mode typing never stamps the typing-defer window, and Observer B runs without coordination during source-mode edits. The fix is to add mirrored DOM listeners in `SourceEditor.tsx` calling `markUserTyping(doc)` on keydown/paste/drop/cut. This is R7 Option C per the complete-fix analysis: ~15 LOC, LOW risk, composes cleanly with the WeakMap move. **Now in scope as part of Commit 6.** The "observer lifecycle rework" framing was based on incorrect analysis of the component architecture and has been discarded.

## 4) Scope filter (applied throughout)

Every item in this spec passed one of these gates:

1. **Evidence-based correctness** — there is a measured bug, an observed failure class, or a concrete race exposed by the test suite or measurement work. Examples: per-test docName (observed testReset contention); Playwright content dir isolation (observed Layer C timeout during measurement); per-doc coordination state (prerequisite for `test.concurrent()` which exposes the module-state race).
2. **Strictly-better quality** — the change is well-defined and objectively superior on a named dimension, with evidence the current shape is inferior. Examples: WeakMap per-doc state (fewer shared-state surfaces, enables multi-doc-per-process); stress sharding (fewer serialization points, enables parallel matrix jobs); async `cleanup()` (correctly awaits doc unload, fewer leak surfaces).

Items that fail both gates are deferred regardless of how "principled" they sound. `writeTracker` refactor is the canonical example: correct today, no observed bug, no strictly-better dimension named — deferred.

This filter applies equally to test code and production code. The filter is *not* a budget — **cost, LOC, and effort are not inputs**. A correct improvement is worth making regardless of line count, because AI does the work. The question is only "is this the right architecture?" measured against evidence.

### 4.5) Explicit non-concerns (surfaced during investigation)

- **`agent-sim.ts` and Playwright coexistence.** Investigation (A5) confirmed that `agent-sim.ts` is hardcoded to `http://localhost:5173` with no env-var override (`packages/app/src/server/agent-sim.ts:20`). Playwright in this spec uses `VITE_PORT=13579`. The port separation IS the isolation guarantee:
  - Manual dev (5173) + Playwright (13579) + agent-sim → agent-sim hits 5173, Playwright untouched, no collision.
  - No manual dev + Playwright (13579) + agent-sim → agent-sim gets ECONNREFUSED on 5173 and fails loudly (`agent-sim.ts:74-76`), never silently reaches Playwright's server.
  The hardcoded-port "smell" is in fact the right design for this coexistence. No spec changes needed for `agent-sim.ts`.

## 5) Personas / consumers

- **P1: AI coding agent (single)** — Claude Code in `/implement` loop. Runs `bun run check` every iteration. Needs sub-90s feedback. Most iterations hit warm turbo cache → ~15-25s typical. Cares about: no flakes, deterministic output, fast failure messages.
- **P2: Developer running tests locally** — runs `bun run check` before commit (~20s warm); runs `bun run check:full:parallel` at natural checkpoints (**~6 min cold first run, 33 ms warm cache replay** via shared turbo task graph). Cares about: can still `bun run dev` in another shell while tests run (now true for Playwright too via Commit 5); reliability across a long session; fast feedback when nothing changed.
- **P3: Multiple AI agents in the same repo (local multi-agent)** — two or more Claude Code sessions concurrently active on the machine. Sub-cases:
  - **P3a: Same worktree, different shells.** Agent X runs `bun run check`, agent Y runs `bun run test:stress:s5-s6` in parallel. Both spawn separate bun processes; each gets its own port (`getFreePort`), its own Hocuspocus server tmpdir (`mkdtempSync`), its own Y.Docs. After this spec: they also each get their own docNames within those processes and their own content dir if running Playwright.
  - **P3b: Separate worktrees.** Agent X in `.claude/worktrees/feature-a`, agent Y in `.claude/worktrees/feature-b`. Stronger isolation because worktrees are separate directories on disk. Already works today for non-Playwright tests.
  - **P3c: One agent + one manual dev server.** Agent X runs `bun run test:stress:e2e` (Playwright). Developer has `bun run dev` open against the same worktree for manual verification. Today this contends on `packages/content/test-doc.md`. After this spec: Playwright gets its own content dir, no contention.
- **P4: CI runner (GitHub Actions)** — runs parallel matrix jobs on PR. Target: ≤5 min wall clock. Bottlenecked by stress, parallelized via sharding.

## 6) User journeys

### J1: Single agent runs `/implement` iteration (P1)
1. Agent edits `packages/app/src/editor/observers.ts`.
2. Agent runs `bun run check`.
3. Turbo invalidates `open-knowledge-app` and downstream packages.
4. ~25s later, check passes (warm cache).
5. Agent commits and moves on.

### J2: Two agents, same worktree (P3a)
1. Agent X (shell 1) runs `bun test packages/app/tests/integration/bridge-matrix.test.ts`. Bun spawns process Pₓ. Pₓ calls `createTestServer()` → `mkdtempSync(/tmp/ok-test-abc123/)` + `getFreePort() → 51234`.
2. Agent Y (shell 2) runs `bun test packages/app/tests/stress/observers.stress.s5-s6.test.ts`. Bun spawns process Pᵧ. Pᵧ calls `createTestServer()` (or its local equivalent) → `mkdtempSync(/tmp/ok-test-def456/)` + `getFreePort() → 51235`.
3. Pₓ's 15 tests each generate a per-test docName (`test-${uuid1}`, `test-${uuid2}`, …). Pᵧ's scenarios create their own Y.Docs with their own doc names.
4. No shared ports, no shared filesystem paths, no shared module state (separate processes, separate module instances).
5. Both agents get independent, deterministic test results. Neither sees the other's output.

### J3: Two agents, different worktrees (P3b)
1. Agent X operates in `.claude/worktrees/feature-a/`, agent Y in `.claude/worktrees/feature-b/`.
2. Worktrees have independent working copies of `packages/content/`, so even operations that touch this directory (manual writes, Playwright) do not overlap.
3. Each worktree's test harness allocates its own tmpdir, port, and module state regardless of what the other is doing.
4. Both worktrees run `bun run check:full` simultaneously with no cross-contamination.

### J4: Agent runs Playwright while developer has dev server open (P3c)
1. Developer has `bun run dev` attached to `packages/content/` (production content), editing `test-doc.md` manually to verify a UI change.
2. Agent runs `bun run test:stress:e2e` in another shell.
3. Playwright config sets `OK_TEST_CONTENT_DIR=/tmp/ok-playwright-xyz123/` before launching its webServer.
4. Playwright's dev server writes to `/tmp/ok-playwright-xyz123/test-doc.md`. Manual dev server writes to `packages/content/test-doc.md`. No contention.
5. Both flows succeed.

### J5: PR CI verifies changes (P4)
1. Developer pushes a branch.
2. GitHub Actions triggers `.github/workflows/test.yml`.
3. Jobs run in parallel on separate runners — one symmetric matrix plus dedicated `lint` and `playwright` jobs:
   - `lint` (dedicated): biome check . (~15s)
   - `test (matrix: typecheck)`: turbo run typecheck (~30s)
   - `test (matrix: test)`: unit tests via narrowed `bun test src/` (~35s)
   - `test (matrix: test:integration)`: bridge-matrix.test.ts (~45s)
   - `test (matrix: test:conversion)`: conversion-fidelity.test.ts (~45s)
   - `test (matrix: test:stress:s1-s8-s9)`: single-writer baselines (~2 min)
   - `test (matrix: test:stress:s2)`: ASCII + Unicode concurrent typing (~2 min)
   - `test (matrix: test:stress:s4)`: undo during active typing (~2 min)
   - `test (matrix: test:stress:s5-s6)`: race conditions, multi-turn (~2-3 min — longest shard)
   - `test (matrix: test:fuzz)`: all fuzz tests (~2 min)
   - `playwright` (dedicated job — needs browser install): Layer C + UX (~2 min)
4. Wall clock: `max(jobs) ≈ 3 min` (bottlenecked by longest stress shard). Each test runs exactly once across all runners — no duplication by construction.
5. CI reports green, PR mergeable.

### Failure / recovery

- **Two agents, same worktree, both hit the file-watcher simultaneously during a stress test.** Mitigated: `createTestServer()` uses `mkdtempSync()` for content dir, so there is no shared file-watcher target. The production `writeTracker` is content-addressed, so even in the pathological case where two watchers point at one directory, identical writes self-suppress correctly. No recovery needed.
- **Playwright webServer fails to read `OK_TEST_CONTENT_DIR` env var and falls back to the repo content dir.** Manifests as a dev-server contention flake. Mitigation: defensive `hocuspocus-plugin.ts` logs the resolved content dir at startup so the cause is obvious from Playwright stdout.
- **`test.concurrent()` exposes a previously-latent race in production code.** Not a failure to recover from — a real bug to fix. Treat the flake as a valid finding: investigate, don't just revert the flag.

## 7) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria |
|---|---|---|
| Must | R1: Per-test unique docName in integration harness | `createTestClient(port, docName?)` accepts optional docName; default = `test-${randomUUID()}`; `agentWriteMd/agentUndo/agentRedo/testReset/readTestDoc` accept docName param |
| Must | R2: `/api/test-reset` endpoint parameterized by docName | Server endpoint accepts `?docName=X` query param; defaults to `'test-doc'` for backward compat with Playwright; closes connections + unloads doc for the specified name only |
| Must | R3: `bridge-matrix.test.ts` uses per-test docNames | No `beforeEach` testReset; each test gets a fresh docName; tests that explicitly verify test-reset behavior continue using the fixed `'test-doc'` name |
| Must | R4: `conversion-fidelity.test.ts` disk tests share a single client via per-test docNames | Disk round-trip section uses one `beforeAll` server; each test writes to its own unique-named file |
| Must | R5: Playwright content dir isolation via `OK_TEST_CONTENT_DIR` env var | `hocuspocus-plugin.ts` reads `process.env.OK_TEST_CONTENT_DIR` and uses `realpathSync(value)` when set, falling back to `resolve(__dirname, '../../../content')`; `playwright.config.ts` creates a per-run tmpdir via `mkdtempSync` at **module-load time** (NOT in `globalSetup` — empirically too late per Playwright 1.59.1 task ordering) and passes it via `webServer.env`; `globalTeardown` captures the path via closure and `rmSync`s it; a manual `bun run dev` running against the default content dir cannot contend with a concurrent Playwright run |
| Must | R6: Observer A coordination state is per-doc | `lastUserTypedAt` moved from module scope to `WeakMap<Y.Doc, TypingState>`; `markUserTyping(doc)` accepts a Y.Doc parameter |
| Must | R7: Coordination state symmetry — `markUserTyping(doc)` stamped from BOTH editors | `TiptapEditor.tsx` continues to call `markUserTyping(provider.document)` on its ProseMirror DOM events. **NEW**: `SourceEditor.tsx` adds mirrored DOM listeners on `view.contentDOM` (keydown/paste/drop/cut) that call `markUserTyping(provider.document)`. Verified by a new test case: typing in source mode defers Observer B's tree replacement by the same `TYPING_DEFER_MS` window as WYSIWYG typing. This is the real R7 fix. |
| Must | R8: `__resetCoordinationState()` removed entirely | No longer needed — per-doc state is naturally isolated via WeakMap GC when Y.Doc instances are released. Removed from `observers.ts` export and from all 6 callers (`test-harness.ts`, `conversion-fidelity.test.ts`, 4 split stress files, `observers.fuzz.test.ts`, `observers.test.ts`). |
| Must | R8a: Client lifecycle inside test body via `try/finally` | `bridge-matrix.test.ts` and `conversion-fidelity.test.ts` tests create their client inside the test body and wrap in `try/finally` — NOT via `beforeEach/afterEach` + describe-level `let client`. This is the **only pattern compatible with `test.concurrent()`** (empirically proven — the shared-`let` pattern crashes under concurrent mode when afterEach nulls the ref mid-test). |
| Must | R9: Memory leak prevention for per-test docs | `client.cleanup()` calls `testReset(port, docName)` to unload the doc; verified no growing heap over a 100-iteration soak test |
| Must | R10: CI wall clock ≤ 5 min on PR | `.github/workflows/test.yml` exists using the shared turbo task graph; measured `max(job_duration)` on the PR's diff is ≤ 5 min |
| Must | R11: Stress tests split into 4 balanced scenario-group files | `observers.stress.test.ts` replaced with 4 files. Grouping rebalanced based on measured shard times (see §9 Target state table). Each shard ≤ ~180s runtime when run alone in CI. All 32 tests present and passing. |
| Must | R12a: Cross-process isolation in same worktree (regression guard) | **Empirically validated** during investigation: two bun processes running `bun test bridge-matrix.test.ts` in parallel in the same worktree both pass 15/15 in 13.29s (no wall-clock penalty). This requirement ensures the migrations in Commits 3-5 don't regress it. |
| Must | R12b: Intra-process concurrency via per-test docName + client-in-body lifecycle | Within one bun test process, tests using `test.concurrent()` cannot collide on docName, module state, or `/api/test-reset` side effects. **Empirically validated** by the investigation spike (client-in-body pattern passes 4 concurrent tests with true parallelism in 159ms; shared-`let` pattern crashes). New capability enabled by R5 + R6 + R8a. |
| Must | R13: Each test tier has its own turbo task, and every turbo task runs in exactly one CI matrix job | Turbo tasks: `typecheck`, `test` (narrow — unit only via `bun test src/`), `test:integration`, `test:conversion`, `test:stress:s1-s8-s9`, `test:stress:s2`, `test:stress:s4`, `test:stress:s5-s6`, `test:fuzz`, `test:e2e`. Each has independent `inputs` so cache invalidation is precise. CI workflow has one symmetric matrix with one job per task (plus a dedicated `lint` job running biome, and a dedicated Playwright job for browser install). **Property: each test runs exactly once per PR — no duplication by construction.** No `check` turbo task exists — composition happens in the root `package.json` script. |
| Must | R14: `bun run check` composes the broad gate, `check:full:parallel` layers stress/fuzz/e2e on top | Root `package.json`: `"check": "biome check . && turbo run typecheck test test:integration test:conversion"` (broad local semantics preserved — lint + typecheck + unit + integration + fidelity; the package-level `test` script is narrowed to unit-only via Commit 2); `"check:full:parallel": "biome check . && turbo run typecheck test test:integration test:conversion test:stress:s1-s8-s9 test:stress:s2 test:stress:s4 test:stress:s5-s6 test:fuzz test:e2e --concurrency=100% --output-logs=errors-only"`. Cold run ~6 min on 16-core M-series (measured). **Warm cache replay ~33ms for the subset already measured; cold partial-invalidation (e.g., edit one test file) re-runs only the affected task(s).** Lint composition is OQ8 — the default is the sequential biome prefix shown here. |
| Should | R15: CI job dependency caching | GitHub Actions `actions/cache` for `~/.bun/install/cache` (keyed on `bun.lock`); saves ~20-30s per job |
| Should | R16: Playwright browser caching in CI | `actions/cache` for `~/.cache/ms-playwright`; saves ~30s per Playwright run |
| Must | R17: `test.concurrent()` in `bridge-matrix.test.ts` | All eligible tests use `test.concurrent()`; 10/10 reliability holds; file runtime drops from ~13s to ~5s. Support confirmed via [bun.com/docs/test](https://bun.com/docs/test) AND empirical spike (the client-in-body pattern delivers ~3x actual speedup on 4 concurrent tests). Promoted from Should to Must given the evidence. |
| Must | R18: `test.concurrent()` in conversion-fidelity unit sections | Non-disk sections (74 unit tests) use `test.concurrent()`; runtime drops ~16s → ~5s. Same justification as R17. |
| Must | R19: `createTestServer()` awaits `srv.ready` before returning | Verified against `packages/server/src/standalone.ts:415-444` (initAsync): shadow-repo initialization, file watcher startup, and HEAD watcher startup all run inside `initAsync()`, which is invoked via `const ready = initAsync()` and returned as `srv.ready`. **`initAsync` is NOT gated on `gitEnabled: false`** — it runs unconditionally. Current test-harness (unchanged from PR #34) destructures `{ hocuspocus, destroy }` and does not await `ready`. Sequential tests survive this latent race because their `wait(500)` buffers give watchers time to start; under R18 (`test.concurrent()`), multiple tests start simultaneously with no buffer and will race the watcher startup. **Fix**: `createTestServer()` awaits `srv.ready` before returning the `TestServer` handle. One-line change. Costs ~10-50ms per test server (shadow-repo init on empty tmpdir) — negligible. |

### Non-functional requirements

- **Reliability:** 10/10 local reliability runs of `bridge-matrix.test.ts` and `conversion-fidelity.test.ts` after all changes land. Plus 10/10 runs of R12 (two concurrent bun processes in the same worktree).
- **Determinism:** CI runs produce identical results for identical code. No timing-dependent flakes.
- **Observability:** CI matrix job names are descriptive (`stress-s4-undo-during-typing`, not `stress-2`). Failure messages clearly identify the shard. `hocuspocus-plugin.ts` logs the resolved content dir at dev-server startup so isolation failures are diagnosable from Playwright stdout.
- **Local DX:** Nothing in the test suite requires "please close your dev server first" as a precondition. No env var must be set by hand for normal workflows. `bun run test:stress:e2e` works from a clean repo with no prior setup.
- **Cost:** Not a filter per the spec's guiding criteria. Runner-minutes per PR are whatever the architecture requires; correctness and clarity take precedence.

## 8) Current state

### Serialization points (why tests can't run fully in parallel today)

1. **bun test runs files sequentially within a package**, one at a time.
2. **bun test runs tests within a file sequentially** — no `test.concurrent()` in use.
3. **Turbo parallelizes package `test` tasks across packages**, but within a package, tasks are sequential.
4. **CI exists but is a single sequential job** — `.github/workflows/ci.yml` runs `bun run check`. No matrix, no per-tier parallelization, no stress/fuzz/Playwright coverage.
5. **Every integration test targets `'test-doc'`** — shared within a process via testReset.
6. **Playwright webServer points at `packages/content/`** (the production content dir) — shared between manual dev and test runs.

### Module-level state audit (pain points for intra-file parallelism)

| File | Module-level mutable state | Issue | Fix |
|---|---|---|---|
| `packages/app/src/editor/observers.ts` | `let lastUserTypedAt = 0` | Two concurrent tests race | **Fix in this PR** via WeakMap |
| `packages/server/src/file-watcher.ts` | `writeTracker: Map` | Appears shared but content-addressed — correct behavior for concurrent writers | **Leave alone** (NG3) |
| `packages/server/src/agent-sessions.ts` | `mdManager`, `schema` | Stateless | Safe |
| `packages/app/src/editor/observers.ts` | `mdManager`, `schema` at module scope in test files | Stateless | Safe |
| `packages/server/src/persistence.ts` | `mdManager`, `schema` | Stateless | Safe |
| `packages/app/src/server/hocuspocus-plugin.ts` | `CONTENT_DIR` (resolved at import time) | **Hardcoded to `packages/content/`** — not a mutation race, a contention surface | **Fix in this PR** via env-var override |
| All other files | (none with mutable module state) | — | — |

**Conclusion:** `lastUserTypedAt` is the only module-level mutable state that breaks in-process test isolation. `CONTENT_DIR` in the Vite plugin is an additional cross-process contention surface specific to Playwright. Two surgical fixes.

### Shared test-doc convention

Every integration test today targets `'test-doc'` as the document name. This creates:
- Shared document state between tests — mitigated by `/api/test-reset` in `beforeEach`.
- A race window: test A's cleanup happens async, test B's setup starts — if they overlap (e.g., under `bun test.concurrent()`), state collision.
- A file system race only if the content dir is also shared. `createTestServer()` gives each server its own tmpdir, so in-process bridge-matrix/fidelity tests are safe today at the filesystem layer; the race is purely at the doc-state layer.
- A cross-process file system race in Playwright, because Playwright uses the hardcoded repo content dir. Observed during measurement (Layer C timeout).

### Existing isolation that already works

- `createTestServer()` uses `mkdtempSync(join(tmpdir(), 'ok-test-'))` for a per-process content dir — integration tests are already filesystem-isolated from each other and from manual dev servers.
- `getFreePort()` uses kernel-allocated random ports — no port collisions between processes.
- Turbo's task scheduler handles cross-package build concurrency safely.
- bun's module cache is per-process — separate processes cannot share mutable module state.

These guarantees are preserved; the spec adds to them rather than replacing them.

## 9) Target state

### After this PR

```
Before (measured baseline):
  bun run check                 →  ~20s warm / ~65s cold
  bun run check:full            →  ~11 min (sequential: check + stress 7m + fuzz 2m + pw 15s)
  Two agents, same worktree     →  works for integration, contends for Playwright
  CI                            →  doesn't exist
  test.concurrent() safe        →  NO (shared `let client` + module state)
  Source-mode typing-defer      →  broken (markUserTyping never stamped from SourceEditor)

After (empirically validated during spec investigation):
  bun run check                 →  Composed turbo invocation: `turbo run check test:integration test:conversion`
                                    ~30s first cold run (unit + integration + fidelity in parallel under turbo)
                                    ~16s warm replay after editing `conversion-fidelity.test.ts` (ONLY test:conversion invalidated)
                                    ~15s warm replay after editing `bridge-matrix.test.ts` (ONLY test:integration invalidated)
                                    ~30s warm replay after editing `observers.ts` (all three tasks invalidated)
                                    <1s warm replay after editing an unrelated file (full cache hit)
  bun run check:full:parallel   →  Same three tasks + stress/fuzz/e2e
                                    ~6 min local first cold run under 4-way CPU contention
                                    33 ms warm cache replay  ← transformative inner-loop DX
  Two agents, same worktree     →  works for all tests (Playwright included)
  CI wall clock                 →  ~2-3 min (per-shard runners, no cross-shard CPU contention)
  test.concurrent() safe        →  YES (empirical spike confirmed — client-in-body pattern)
  Source-mode typing-defer      →  symmetric (markUserTyping stamped from both editors)

Isolation guarantees (all enforced by construction, all validated empirically):
  Shared module state           →  Per-doc WeakMap<Y.Doc, TypingState>
  Shared 'test-doc' name        →  Per-test randomUUID()
  Shared Playwright content dir →  Per-run module-scope mkdtempSync + globalTeardown cleanup
  Shared `let client` closure   →  Client lifecycle in test body via try/finally
  test-helper API leaks         →  NONE — __resetCoordinationState removed entirely
```

### Measured 4-way stress shard times (from investigation spike)

Running 4 shards via `--test-name-pattern` in parallel on one M-series 16-core laptop (worst case — CPU contention):

| Shard | Tests | Concurrent time | Alone estimate |
|---|---|---|---|
| S1/S8/S9 (baselines) | 7 | 3:40 | ~1:40 |
| S2 (concurrent typing) | 6 | 3:45 | ~1:40 |
| S4/S4b (undo during typing) | 9 | 3:58 | ~1:50 |
| **S3/S5/S5b/S6 (rapid writes)** | 10 | **5:55** ← dominant | ~2:40 |

**Note on shard 4 imbalance:** The S3/S5/S5b/S6 shard is ~50% heavier than the other three because S3-large (66s alone) + S5-ASCII-large (42s) + S5-Unicode-large (37s) concentrate in one shard. The spec's proposed grouping should rebalance — either split S3 into its own shard, or move S3 into the S1/S8/S9 shard (which has ~2:00 of headroom). Final balance is chosen based on the measurement after Commit 1 actually splits the file.

### CI matrix structure — symmetric, one job per turbo task (plus lint + playwright)

```
┌────────────────────────────────────────────────────────────────────────┐
│              .github/workflows/ci.yml (REPLACED, not added)            │
├────────────────────────────────────────────────────────────────────────┤
│  lint                              biome check .              ~15s    │ (dedicated; biome is monorepo-wide)
│  test (matrix: typecheck)          turbo run typecheck        ~30s    │
│  test (matrix: test)               turbo run test  (unit)     ~35s    │
│  test (matrix: test:integration)   turbo run test:integration ~45s    │
│  test (matrix: test:conversion)    turbo run test:conversion  ~45s    │
│  test (matrix: test:stress:s1-s8-s9)                          ~2m     │
│  test (matrix: test:stress:s2)                                ~2m     │
│  test (matrix: test:stress:s4)                                ~2m     │
│  test (matrix: test:stress:s5-s6)                             ~3m     │ ← longest
│  test (matrix: test:fuzz)                                     ~2m     │
│  playwright                        turbo run test:e2e         ~2m     │ (dedicated; needs browser install)
└────────────────────────────────────────────────────────────────────────┘
     max wall clock ≈ 3 min + runner startup (GHA-cache warm)

Architectural property: every matrix job invokes exactly one turbo task.
Every turbo task runs in exactly one matrix job. Every test runs exactly
once per PR. The SAME turbo tasks power the local `check:full:parallel`
command — one task graph, two execution surfaces. No duplication.

Lint is a dedicated job (biome is monorepo-wide, single config, doesn't fit
the per-package turbo task model). Playwright is a dedicated job because it
needs browser install before the turbo task runs. Everything else is one
symmetric matrix.
```

### Local multi-agent topology

```
Worktree A (agent X)                  Worktree A (agent Y, same dir, different shell)
├─ bun test bridge-matrix             ├─ bun test observers.stress.s5-s6
│   ├─ port 51234 (getFreePort)       │   ├─ port 51235 (getFreePort)
│   ├─ tmpdir /tmp/ok-test-abc        │   ├─ tmpdir /tmp/ok-test-def
│   ├─ per-test docNames              │   ├─ its own Y.Docs
│   └─ own module state               │   └─ own module state
│                                     │
└── parallel, independent ────────────┘

Worktree A (developer)                Worktree A (agent, Playwright)
├─ bun run dev                        ├─ bun run test:stress:e2e
│   └─ content: packages/content/     │   ├─ OK_TEST_CONTENT_DIR=/tmp/ok-pw-xyz
│                                     │   └─ content: /tmp/ok-pw-xyz
└── parallel, independent ────────────┘
```

## 10) Proposed solution

### Single PR with sequenced commits

Each commit in the PR stands alone: typechecks, runs, and doesn't leave the codebase in a broken state. Reviewers can follow the architectural argument commit by commit.

#### Commit 1: test: split `observers.stress.test.ts` into 4 scenario-group files

**Files touched:**
- `packages/app/tests/stress/observers.stress.test.ts` → deleted
- `packages/app/tests/stress/observers.stress.s1-s8-s9.test.ts` → NEW (scenarios S1, S8, S9 — single-writer baselines)
- `packages/app/tests/stress/observers.stress.s2.test.ts` → NEW (S2 ASCII + S2 Unicode — concurrent typing)
- `packages/app/tests/stress/observers.stress.s4.test.ts` → NEW (S4 + S4b — undo during active typing)
- `packages/app/tests/stress/observers.stress.s5-s6.test.ts` → NEW (S5/S5b/S6 — race conditions, multi-turn)

Each file imports the same shared helpers (stabilize, assertBridgeInvariant, generateMarkdown, CONTENT cache). The module-level `__resetCoordinationState()` in `beforeEach` still works per-file at this point because each file runs in its own bun test process in CI (and after Commit 6 the reset is no longer needed at all — the import + call become dead code to be removed).

**Rationale for the grouping:** Balance runtime, not test count. S5/S6 are the heaviest scenarios (multi-turn, race conditions) and go together. S2 unicode variants belong with S2 ASCII. S4 variants belong together. S1/S8/S9 are single-writer baselines that pair well.

**Validation:** Run each file individually; all 32 scenarios present; `bun test:stress` script updated to glob the new files; 10/10 reliability per file.

#### Commit 2: chore(turbo): narrow `test`, add per-tier task graph, update root scripts

**Key architectural decision:** every test tier gets its own turbo task with narrow `inputs`. The package-level `test` script is narrowed to unit tests only (`bun test src/`). Integration and conversion-fidelity remain in the **existing** `test:integration` and `test:conversion` scripts (they already exist on main from PR #34 work), now wrapped as dedicated turbo tasks. The root `bun run check` script preserves its broad inner-loop semantics by composing the narrowed `test` + dedicated tier tasks via one turbo invocation — no regression in coverage, but **fine-grained cache keys**: editing a single test file re-runs only its dedicated task, not the whole `check` tier.

This architecture eliminates CI duplication by construction: each test runs exactly once per PR in its own matrix job, because every tier has its own turbo task and the CI workflow (Commit 3) has a single symmetric matrix with one job per task.

**Files touched:**
- `turbo.json` — add `test:integration`, `test:conversion`, per-shard stress tasks, `test:fuzz`, `test:e2e` (all with explicit `inputs`). **Do NOT add a `check` turbo task** — the existing `test` turbo task (narrowed to unit-only via the package script change) plus the new dedicated tier tasks are sufficient.
- `package.json` (root) — update `check` script to compose tier tasks in one turbo invocation; add `check:full:parallel` that layers stress/fuzz/e2e on top
- `packages/app/package.json` — **narrow existing `test` script** from `bun test --path-ignore-patterns 'tests/stress'` to `bun test src/` (unit only); add per-stress scripts (`test:stress:s1-s8-s9`, `test:stress:s2`, `test:stress:s4`, `test:stress:s5-s6`, `test:fuzz`, `test:e2e`). The existing `test:integration` and `test:conversion` scripts are unchanged — they already have the right commands.

**turbo.json (full new shape):**

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^build"] },

    // Narrow `test` — the package-level `test` script is narrowed to
    // `bun test src/` (unit tests only), so this turbo task now has a tight
    // input set. Integration + fidelity are their own dedicated tasks below,
    // not bundled here.
    "test": {
      "dependsOn": ["^build"],
      "cache": true,
      "inputs": ["src/**/*.ts", "src/**/*.tsx"]
    },

    // No `check` turbo task — the root `bun run check` script composes
    // `turbo run typecheck test test:integration test:conversion` + lint.
    // Each tier is independently cacheable.

    // Dedicated integration + fidelity tasks — own cache keys, own inputs.
    // Editing `bridge-matrix.test.ts` invalidates ONLY `test:integration`.
    "test:integration": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/integration/bridge-matrix.test.ts",
        "tests/integration/test-harness.ts",
        "../server/src/**/*.ts",
        "../core/src/**/*.ts"
      ]
    },
    "test:conversion": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/integration/conversion-fidelity.test.ts",
        "tests/integration/test-harness.ts",
        "../core/src/**/*.ts"
      ]
    },

    // Per-shard stress tasks — each runs in its own process, cacheable, independent
    "test:stress:s1-s8-s9": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/stress/observers.stress.s1-s8-s9.test.ts",
        "tests/stress/synthetic.ts"
      ]
    },
    "test:stress:s2": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/stress/observers.stress.s2.test.ts",
        "tests/stress/synthetic.ts"
      ]
    },
    "test:stress:s4": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/stress/observers.stress.s4.test.ts",
        "tests/stress/synthetic.ts"
      ]
    },
    "test:stress:s5-s6": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/stress/observers.stress.s5-s6.test.ts",
        "tests/stress/synthetic.ts"
      ]
    },
    "test:fuzz": {
      "dependsOn": [],
      "cache": true,
      "inputs": [
        "src/**/*.ts", "src/**/*.tsx",
        "tests/stress/observers.fuzz.test.ts",
        "tests/stress/synthetic.ts"
      ]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

**Key points on the turbo task graph:**
- **`check` is narrow** — typecheck + lint + `test` (unit only). No more bundling of integration + fidelity under `check`.
- **Each test tier is its own cacheable task** with tight `inputs` that reflect its actual code dependencies. Editing a file outside a task's inputs leaves it cached.
- **Cross-package inputs are explicit** (`../server/src/**/*.ts`, `../core/src/**/*.ts`) — turbo invalidates the integration task only when the relevant workspace package changes.
- **`test:e2e` keeps `dependsOn: ["^build"]`** because Playwright loads the built app; all other test tasks skip the build step (bun runs TS directly from workspace packages' `src/` exports).

**Root `package.json`:**

```json
{
  "scripts": {
    "check": "biome check . && turbo run typecheck test test:integration test:conversion",
    "check:full:parallel": "biome check . && turbo run typecheck test test:integration test:conversion test:stress:s1-s8-s9 test:stress:s2 test:stress:s4 test:stress:s5-s6 test:fuzz test:e2e --concurrency=100% --output-logs=errors-only"
  }
}
```

**`bun run check` semantic preservation:**
The root-level `check` script runs lint (biome) then invokes turbo with four parallel tasks. Locally, `bun run check` still runs the broad inner-loop gate (lint + typecheck + unit + integration + fidelity) — no coverage regression for agents. The difference is **architectural**: the four turbo tasks have independent cache keys. Editing `conversion-fidelity.test.ts` re-runs only `test:conversion` (~16s), not the entire gate (~30s). Editing `packages/core/src/*.ts` re-runs all three test tasks (correct cross-package invalidation via the explicit cross-package inputs).

**On lint composition**: this composition (biome sequential → turbo parallel) is one of three viable options — see OQ8 in §12. The implementer should pick empirically during Commit 2 based on measured lint/turbo interaction. The spec shows the simplest option (sequential biome prefix) as the default; if empirical measurement shows it's worth adding biome to the turbo graph as a root task, the implementer may do so without re-spec.

**`packages/app/package.json` additions:**

```json
{
  "scripts": {
    "// BEFORE — narrow now": "",
    "test": "bun test src/",
    "// NEW dedicated tier scripts": "",
    "test:integration":     "bun test tests/integration/bridge-matrix.test.ts",
    "test:conversion":      "bun test tests/integration/conversion-fidelity.test.ts",
    "test:stress:s1-s8-s9": "bun test tests/stress/observers.stress.s1-s8-s9.test.ts",
    "test:stress:s2":       "bun test tests/stress/observers.stress.s2.test.ts",
    "test:stress:s4":       "bun test tests/stress/observers.stress.s4.test.ts",
    "test:stress:s5-s6":    "bun test tests/stress/observers.stress.s5-s6.test.ts",
    "test:fuzz":            "bun test tests/stress/observers.fuzz.test.ts",
    "test:e2e":             "node node_modules/@playwright/test/cli.js test tests/stress/"
  }
}
```

**Note on `test`:** the old `test` script was `bun test --path-ignore-patterns 'tests/stress'` which picked up unit tests AND integration AND fidelity. After this change, `test` runs ONLY unit tests (the files under `src/`, principally `observers.test.ts`). Integration + fidelity move to their dedicated scripts. This is the single source of the "no duplication" property: each file has exactly one script that runs it, each script has exactly one turbo task that invokes it, each turbo task runs in exactly one CI matrix job.

**Empirically validated during spec investigation:**
- Turbo spawns parallel tasks in separate processes with grouped output (`[pkg#task]` prefix)
- Exit codes propagate — any task failure produces non-zero exit
- **Cold run: ~6 min on 16-core M-series under 4-way contention** (shard measurements: S1/S8/S9=3:40, S2=3:45, S4=3:58, S5/S5b/S6=5:55 dominant)
- **Warm cache replay: 33 ms** via full turbo cache hit — transformative inner-loop DX
- Rebalancing: shard 4 (S5-S6 group) is 50% heavier than others because S3-large (66s) + S5-ASCII-large (42s) + S5-Unicode-large (37s) concentrate there. Commit 1's file-split should move S3 into the S1/S8/S9 shard (which has headroom), making the 4 shards roughly balanced at ~2 min each.

#### Commit 3: ci: **replace** `.github/workflows/ci.yml` with symmetric matrix + add playwright job

**Files touched:**
- `.github/workflows/ci.yml` → **REPLACE** (existing single-job workflow running `bun run check` → new symmetric matrix + dedicated playwright job)

**Note on file strategy**: `ci.yml` already exists on main and runs a single-job sequential `bun run check`. We REPLACE it (not add a second workflow file) so the repo has one source of truth for CI. The new workflow uses the same turbo task graph defined in Commit 2.

**Architectural property: every matrix job runs exactly one turbo task. Every turbo task runs in exactly one matrix job. Zero duplication by construction.** The matrix is the turbo task list from `check:full:parallel`, one-to-one.

**Action version pinning**: Per the existing `ci.yml` convention on main, action versions are pinned to full commit SHAs with a trailing version comment (e.g., `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`). This is a supply-chain security practice; the new workflow must follow it.

**Workflow structure:**

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.1
        with:
          bun-version: "1.3.11"
          cache: true
      - run: bun install --frozen-lockfile
      - run: biome check .

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        task:
          - typecheck
          - test                # narrow: unit tests only (bun test src/)
          - test:integration    # bridge-matrix.test.ts
          - test:conversion     # conversion-fidelity.test.ts
          - test:stress:s1-s8-s9
          - test:stress:s2
          - test:stress:s4
          - test:stress:s5-s6
          - test:fuzz
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.1
        with:
          bun-version: "1.3.11"
          cache: true
      - uses: actions/cache@13aacd865c20de90d75de3b17ebe84f7a17d57d2 # v4.0.2
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ matrix.task }}-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-${{ matrix.task }}-
      - run: bun install --frozen-lockfile
      - run: bunx turbo run ${{ matrix.task }}

  playwright:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.1
        with:
          bun-version: "1.3.11"
          cache: true
      - uses: actions/cache@13aacd865c20de90d75de3b17ebe84f7a17d57d2 # v4.0.2
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - env:
          VITE_PORT: '13579'
        run: bunx turbo run test:e2e
```

**Note**: the `actions/cache` SHA above (`13aacd865c20... # v4.0.2`) must be verified against the actual version used by the repo convention during implementation — pull the latest pinned SHA from `actions/cache@vN` tag at Commit 3 implementation time.

**Key details:**

- **8 matrix jobs + 1 playwright job = 9 total.** Each job invokes exactly one turbo task via `bunx turbo run ${{ matrix.task }}`.
- **`check` is one of the matrix tasks**, not a special "fast-gate" pseudo-job. It runs alongside the other tasks with no privilege. This keeps the workflow symmetric — no special-casing.
- **Playwright is a separate dedicated job** (not in the matrix) because it requires `bunx playwright install --with-deps chromium` before the turbo task runs. Cleaner to keep it on its own than to conditionally add install steps inside a matrix job.
- **Per-task turbo cache keys**: `${{ runner.os }}-turbo-${{ matrix.task }}-${{ github.sha }}` with fallback to `${{ matrix.task }}-` prefix. Each task's cache is isolated — no contention between matrix jobs writing to the same cache entry.
- `fail-fast: false` so all failing shards are visible in one run.
- GitHub Actions `actions/cache` for `~/.bun/install/cache`, `~/.cache/ms-playwright`, and per-task `.turbo`. Turbo cache sharing across jobs is opportunistic — not required for correctness.
- Playwright uses `VITE_PORT=13579` to avoid any possible conflict with other runners.
- Content dir isolation for Playwright arrives in Commit 5; CI runners don't have competing dev servers so the default path is fine at this point.
- No post-merge jobs — `push` to main only re-verifies what landed.

**Expected wall clock (~3 min total, bounded by stress-s5-s6):**

| Job | Work | Wall clock (with runner overhead) |
|---|---|---|
| test (matrix: check) | typecheck + lint + unit | ~40s |
| test (matrix: test:integration) | bridge-matrix.test.ts | ~45s |
| test (matrix: test:conversion) | conversion-fidelity.test.ts | ~45s |
| test (matrix: test:stress:s1-s8-s9) | 7 stress scenarios | ~2 min |
| test (matrix: test:stress:s2) | S2 ASCII + Unicode | ~2 min |
| test (matrix: test:stress:s4) | S4 + S4b | ~2 min |
| test (matrix: test:stress:s5-s6) | S3 + S5 + S5b + S6 | **~3 min** ← dominant |
| test (matrix: test:fuzz) | Fuzz harness | ~2 min |
| playwright | Browser install + e2e | ~2 min |

All run in parallel → wall clock ≈ 3 min + runner startup.

#### Commit 4: test(harness): per-test docName isolation + client-in-body lifecycle + `await srv.ready` + parameterized `/api/test-reset`

**Files touched:**
- `packages/app/tests/integration/test-harness.ts` — `createTestClient` signature, helpers, async cleanup; **`createTestServer()` now destructures `{ hocuspocus, destroy, ready }` and `await ready` before returning** (R19 — see requirements table); remove `__resetCoordinationState` call (no longer needed per-test because each test owns a unique Y.Doc; the import + call become dead code and are removed)
- `packages/app/tests/integration/bridge-matrix.test.ts` — migrate to per-test docNames
- `packages/app/tests/integration/conversion-fidelity.test.ts` — migrate disk section to share the server with per-test docNames; **remove `__resetCoordinationState` calls** from the observer-roundtrip and full-stack describe blocks (lines 189-191, 234-236 today) for the same reason
- `packages/server/src/api-extension.ts` — parameterize `/api/test-reset` with docName query param
- `packages/server/src/agent-sessions.ts` — confirm/extend `closeAll(docName?)` signature to accept a target doc

**Why Commit 4 removes the reset calls even though `__resetCoordinationState` still exists at this point:** the reset is only semantically required when tests share a Y.Doc (they don't after the migration) or when module-level state persists across tests (it does until Commit 6). In Commit 4 the call becomes vacuous — harmless but noise. Deleting it now splits the refactor cleanly: Commit 4 owns harness migration, Commit 6 owns the production state change. Test-harness / conversion-fidelity no longer need to know about reset-state internals.

**Harness changes:**

```typescript
// BEFORE
export async function createTestClient(port: number): Promise<TestClient>
export async function agentWriteMd(port: number, markdown: string, position?: 'append' | 'prepend' | 'replace'): Promise<void>
export async function agentUndo(port: number): Promise<void>
export async function testReset(port: number): Promise<void>
export function readTestDoc(contentDir: string): string

// AFTER
export async function createTestClient(port: number, docName?: string): Promise<TestClient>
//    ↑ defaults to `test-${randomUUID()}`
export async function agentWriteMd(port: number, markdown: string, opts?: { docName?: string; position?: 'append' | 'prepend' | 'replace' }): Promise<void>
export async function agentUndo(port: number, docName?: string): Promise<void>
export async function testReset(port: number, docName?: string): Promise<void>
//    ↑ defaults to 'test-doc' for backward compat with Playwright
export function readTestDoc(contentDir: string, docName?: string): string
//    ↑ defaults to 'test-doc'

interface TestClient {
  doc: Y.Doc;
  ytext: Y.Text;
  fragment: Y.XmlFragment;
  provider: HocuspocusProvider;
  cleanup: () => Promise<void>;  // Now async — calls testReset to unload the doc
  docName: string;  // NEW — the per-test unique name
}
```

**API endpoint change:**

```typescript
// packages/server/src/api-extension.ts — handleTestReset
async function handleTestReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') { /* 405 */ return; }
  try {
    // NEW — parse docName from query param
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const docName = url.searchParams.get('docName') ?? 'test-doc';

    await sessionManager.closeAll(docName);
    hocuspocus.closeConnections(docName);
    const doc = hocuspocus.documents.get(docName);
    if (doc) await hocuspocus.unloadDocument(doc);
    // Delete the file for this docName (was: hardcoded 'test-doc.md')
    const filePath = resolve(contentDir, `${docName}.md`);
    if (existsSync(filePath)) writeFileSync(filePath, '', 'utf-8');

    json(res, 200, { ok: true });
  } catch (e) {
    console.error('[test-reset]', e);
    json(res, 500, { ok: false, error: String(e) });
  }
}
```

**Migration pattern for bridge-matrix.test.ts — client-in-body lifecycle (not beforeEach):**

```typescript
// BEFORE — shared `let client` + beforeEach/afterEach (breaks under test.concurrent())
describe('W1: WYSIWYG writes', () => {
  let client: TestClient;
  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });
  afterEach(() => { client?.cleanup(); });

  test('W1→Y.Text', async () => {
    applyMarkdownToFragment(client, '# Hello');
    await wait(500);
    expect(client.ytext.toString()).toContain('Hello');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// AFTER — client lifecycle in test body via try/finally
describe('W1: WYSIWYG writes', () => {
  test.concurrent('W1→Y.Text', async () => {
    const client = await createTestClient(server.port);  // per-test unique docName
    try {
      applyMarkdownToFragment(client, '# Hello');
      await wait(500);
      expect(client.ytext.toString()).toContain('Hello');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});
```

**Why this pattern is strictly better** (verified empirically via the investigation spike):

1. **Works under `test.concurrent()`.** The shared `let client` in describe closure is a single mutable variable — under concurrent mode, each `beforeEach` overwrites the previous client reference and tests race on `client.id === null` when `afterEach` nulls it mid-test. Client-in-body avoids this entirely.
2. **Works under sequential `test()`.** The `try/finally` is equivalent to `afterEach` cleanup, just inside the test instead of in a hook.
3. **Explicit lifecycle per test.** Read one test, understand the whole story — no implicit state from describe hooks.
4. **Exception isolation.** A setup error in one test doesn't poison the whole describe via a broken `client` ref.
5. **Concurrent mode opt-in is a one-line change** (`test` → `test.concurrent`) with zero other refactoring needed.

The `initial sync` and `test-reset isolation` tests explicitly pass `'test-doc'` because they test the shared-state behavior — they stay on plain `test()` (not `test.concurrent()`) and do not share docName with other tests. Those are the only exceptions.

**Conversion fidelity disk test sharing:**

```typescript
// AFTER: one server, per-test client with unique docName (no testReset race)
describe('disk round-trip', () => {
  for (const construct of CONSTRUCTS) {
    test(construct.name, async () => {
      const client = await createTestClient(server.port);  // unique docName
      try { /* ... */ }
      finally { await client.cleanup(); }
    });
  }
});
```

Savings: ~15s from eliminating the per-test `testReset` + `wait(300)` overhead.

**Validation:** 10/10 reliability on bridge-matrix + conversion-fidelity post-migration; 10/10 reliability for R12 (two concurrent bun processes in the same worktree running bridge-matrix).

#### Commit 5: feat(dev-server): Playwright content dir isolation via `OK_TEST_CONTENT_DIR`

**Files touched:**
- `packages/app/src/server/hocuspocus-plugin.ts` — read env var, resolve content dir dynamically, log resolved path at startup
- `packages/app/playwright.config.ts` — create per-run tmpdir at module-load time via `mkdtempSync`, pass via `webServer.env`, wire `globalTeardown` for cleanup
- `packages/app/tests/stress/global-teardown.ts` → NEW — reads path from `process.env.OK_TEST_CONTENT_DIR` (captured by the webServer spawn earlier) and `rmSync`s the tmpdir
- `CLAUDE.md` — update "Running Playwright + manual dev server" pitfall text (now resolved, not a pitfall)

**Why NOT `globalSetup` for the tmpdir creation** (empirically verified against Playwright 1.59.1 source during investigation):
- `lib/runner/tasks.js:100-109` — `createGlobalSetupTasks` pushes `createPluginSetupTasks(config)` (webServer spawn) BEFORE `config.globalSetups`
- `lib/plugins/webServerPlugin.js:87-93` — webServer captures `{ ...DEFAULT_ENV, ...process.env, ...options.env }` at spawn time
- **Therefore**: mutating `process.env.OK_TEST_CONTENT_DIR` inside `globalSetup` happens AFTER the child `bun run dev` has already spawned with the old env. The globalSetup approach silently falls back to `packages/content/` and contention returns.
- **Correct approach**: config-module-scope `mkdtempSync` runs when `playwright.config.ts` is evaluated (before any setup tasks), so the value is ready when `webServer.env` is read at spawn time.

**Plugin change** (layered on top of main's current shape — which already uses `createPersistenceExtension(...).extension` and a typed-DiskEvent `startWatcher` callback, both added in PR #13):

```typescript
// packages/app/src/server/hocuspocus-plugin.ts (excerpt — the CONTENT_DIR block)

// BEFORE (current main — hardcoded):
const CONTENT_DIR = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../../../content',
);

// AFTER (this commit — env-var override for Playwright):
import { realpathSync, mkdirSync } from 'node:fs';

const DEFAULT_CONTENT_DIR = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname,
  '../../../content',
);

const CONTENT_DIR = process.env.OK_TEST_CONTENT_DIR
  ? realpathSync(process.env.OK_TEST_CONTENT_DIR)
  : DEFAULT_CONTENT_DIR;

mkdirSync(CONTENT_DIR, { recursive: true });

console.log(`[hocuspocus] content dir: ${CONTENT_DIR}`);  // matches existing [hocuspocus] ... startup lines
```

**Rest of file is unchanged.** The downstream code on main already uses:
- `createPersistenceExtension({ contentDir: CONTENT_DIR, projectDir: resolve(CONTENT_DIR, '..') }).extension` — the `.extension` property access was added in PR #13 when `createPersistenceExtension` started returning `PersistenceHandle = { extension, flushPendingGitCommit, waitForPendingCommits }`. Our env var change is upstream of this line (it just changes what `CONTENT_DIR` resolves to) so no change needed.
- `startWatcher(CONTENT_DIR, async (event) => { if (event.kind === 'update' || event.kind === 'create') { await handleExternalChange(event.docName, event.content); } })` — the DiskEvent callback shape was added in PR #13. Our env var change doesn't touch this line.

Our only modification is the module-level `CONTENT_DIR` constant declaration.

**Playwright config change:**

```typescript
// packages/app/playwright.config.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Module-scope creation: runs at config-eval time, before any setup tasks.
// The webServer captures this via webServer.env at spawn time.
const contentDir = mkdtempSync(join(tmpdir(), 'ok-playwright-'));
writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
console.log(`[playwright] OK_TEST_CONTENT_DIR = ${contentDir}`);

const port = process.env.VITE_PORT ?? '5173';

export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  retries: 0,
  globalTeardown: require.resolve('./tests/stress/global-teardown'),
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: {
    command: `VITE_PORT=${port} bun run dev`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      OK_TEST_CONTENT_DIR: contentDir,  // ← captured at config-eval, available before spawn
    },
  },
});
```

**globalTeardown:**

```typescript
// packages/app/tests/stress/global-teardown.ts
import { rmSync } from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  const dir = process.env.OK_TEST_CONTENT_DIR;
  if (dir && dir.startsWith('/') && dir.includes('ok-playwright-')) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[playwright] removed ${dir}`);
  }
}
```

Note: `globalTeardown` reads `process.env.OK_TEST_CONTENT_DIR` — this works because Playwright sets env vars on the test runner process when spawning the webServer (verified empirically). The guard string check is defensive — prevents accidental `rmSync` of unrelated paths.

**Tradeoff acknowledged:** Module-scope `mkdtempSync` runs on every `playwright test` invocation including `--list` and `--dry-run` (which don't run actual tests). This leaks a (small, empty-except-for-test-doc.md) tmpdir on each metadata command. The alternative is a stale-env-var bug where Playwright silently falls back to `packages/content/`. **Leaky is strictly better than silently-broken** under the "what's correct" filter. For metadata commands, the leaked dirs are tiny and easy to clean via `rm -rf /tmp/ok-playwright-*`.

**Rationale:** This is a production-code change (`hocuspocus-plugin.ts` is in `src/server/`), but the blast radius is minimal: one env-var check, a log line. No behavior change for normal `bun run dev` (env var unset → default path). The strictly-better dimension is clear: under the current shape, running Playwright requires a global precondition ("no other dev server") that can't be enforced mechanically; under the new shape, the precondition is gone.

**Known limitation:** The Playwright `webServer` starts once per run, so all Playwright tests within a run share the same content dir. This is fine for the current suite (5 tests) but doesn't provide per-test Playwright isolation — that requires URL-based docName routing (NG5), not env-var plumbing.

**Validation:** Run `bun run dev` in one shell (writing to `packages/content/test-doc.md` manually), run `bun run test:stress:e2e` in another shell, both succeed. Re-run the full Playwright suite with `bun run dev` not active; unchanged behavior. Grep `hocuspocus-plugin` logs to confirm resolved path.

#### Commit 6: feat(observers): per-doc coordination state via WeakMap + source-mode typing-defer symmetry (R7 complete fix)

**Files touched:**
- `packages/app/src/editor/observers.ts` — WeakMap state, `markUserTyping(doc)` signature, remove `__resetCoordinationState` export
- `packages/app/src/editor/TiptapEditor.tsx` — pass `provider.document` to `markUserTyping` on existing ProseMirror DOM listeners
- `packages/app/src/editor/SourceEditor.tsx` — **NEW**: mirror the DOM listener wiring on `view.contentDOM` (keydown/paste/drop/cut) calling `markUserTyping(provider.document)`. This is R7 Option C — the real fix for source-mode coordination asymmetry.
- `packages/app/tests/stress/observers.stress.s1-s8-s9.test.ts` — remove `__resetCoordinationState` import + `beforeEach` call (inherited from the split in Commit 1)
- `packages/app/tests/stress/observers.stress.s2.test.ts` — pass `doc` to `markUserTyping`; remove `__resetCoordinationState` import + call
- `packages/app/tests/stress/observers.stress.s4.test.ts` — pass `doc` to `markUserTyping` (covers S4 and S4b, which both use `markUserTyping`); remove `__resetCoordinationState` import + call
- `packages/app/tests/stress/observers.stress.s5-s6.test.ts` — remove `__resetCoordinationState` import + `beforeEach` call
- `packages/app/tests/stress/observers.fuzz.test.ts` — pass `doc` to `markUserTyping` at the callsite; remove `__resetCoordinationState` import + call
- `packages/app/src/editor/observers.test.ts` — pass `doc` to the `markUserTyping` dynamic-import callsites (lines ~683, 686, 814, 815); remove the `beforeEach(() => __resetCoordinationState())` (line ~19-21) and the trailing reset call (line ~865)

**Coverage check for removal of `__resetCoordinationState`:** After Commits 1 and 4, the callers of `__resetCoordinationState` are exactly: (1) the 4 split stress files, (2) `observers.fuzz.test.ts`, (3) `observers.test.ts`. Commit 4 already removed it from `test-harness.ts` and `conversion-fidelity.test.ts`. Commit 6 removes it from the remaining 6 test files and the source definition in one atomic commit, so no intermediate state leaves an unused import.

**observers.ts changes:**

```typescript
// BEFORE
let lastUserTypedAt = 0;

export function markUserTyping(): void {
  lastUserTypedAt = Date.now();
}

export function __resetCoordinationState(): void {
  lastUserTypedAt = 0;
}

// Observer B internals:
if (Date.now() - lastUserTypedAt < TYPING_DEFER_MS) { /* defer */ }

// AFTER
interface TypingState {
  lastUserTypedAt: number;
}

const typingStates = new WeakMap<Y.Doc, TypingState>();

function getTypingState(doc: Y.Doc): TypingState {
  let state = typingStates.get(doc);
  if (!state) {
    state = { lastUserTypedAt: 0 };
    typingStates.set(doc, state);
  }
  return state;
}

export function markUserTyping(doc: Y.Doc): void {
  getTypingState(doc).lastUserTypedAt = Date.now();
}

// __resetCoordinationState REMOVED — per-doc state is naturally isolated
// via WeakMap GC when Y.Doc instances are released.

// Observer B internals (inside setupObservers, where `doc` is in scope):
if (Date.now() - getTypingState(doc).lastUserTypedAt < TYPING_DEFER_MS) { /* defer */ }
```

**Caller updates (all in the same commit to maintain atomicity):**

```typescript
// TiptapEditor.tsx — existing ProseMirror DOM listeners, updated signature
// (the listeners already exist at line ~179; just pass the doc)
const mark = () => markUserTyping(provider.document);

// SourceEditor.tsx — NEW: mirror the DOM listeners on CodeMirror's contentDOM
// Inside the existing `useEffect` where `viewRef.current = view` is set:
const mark = () => markUserTyping(provider.document);
const dom = view.contentDOM;
dom.addEventListener('keydown', mark);
dom.addEventListener('paste', mark);
dom.addEventListener('drop', mark);
dom.addEventListener('cut', mark);
// Add to the existing cleanup return:
return () => {
  dom.removeEventListener('keydown', mark);
  dom.removeEventListener('paste', mark);
  dom.removeEventListener('drop', mark);
  dom.removeEventListener('cut', mark);
  view.destroy();
  viewRef.current = null;
};

// observers.stress.s*.test.ts, observers.fuzz.test.ts
// Replace all `markUserTyping()` with `markUserTyping(doc)` — `doc` is already in scope per test.
// Remove `import { __resetCoordinationState } from '../../src/editor/observers'` and the
// `beforeEach(() => __resetCoordinationState())` hook.

// observers.test.ts — dynamic imports
const { markUserTyping } = await import('./observers');
markUserTyping(doc);  // was: markUserTyping()
```

**Why this is the R7 fix (reframed from the prior spec's incorrect analysis):**

The prior spec claimed R7 was about "observer race during rapid mode toggles" and that `setupObservers()` needed lifecycle management. **Code reading proves this framing was wrong:**

- `setupObservers()` is a **singleton** (TiptapEditor.tsx:57-96): called exactly once when `provider.on('synced')` first fires, then the handler unsubscribes. Observers bind to the Y.Doc, not to editor React components.
- **Both editors mount simultaneously** via React 19 `<Activity mode="hidden|visible">` (EditorArea.tsx:20-37). Neither unmounts on toggle; both keep their view state (cursor, scroll, selection).
- Observers run continuously against the Y.Doc regardless of which editor is visible.

The **real R7 bug** is coordination-state asymmetry: `markUserTyping()` is only called from TiptapEditor's ProseMirror listeners (TiptapEditor.tsx:176-190). When the user types in source mode, `lastUserTypedAt` never gets stamped, so Observer B's typing-defer window (`if elapsedSinceTyping < TYPING_DEFER_MS: defer`) immediately elapses. Observer B then runs `updateYFragment` against the XmlFragment during active source-mode edits, and if the user toggles to WYSIWYG mid-stream they land in a transient tree-replaced state.

Adding the mirror listeners to SourceEditor.tsx makes the defer window symmetric across both editors. The WeakMap change (per-doc state) is a prerequisite for `test.concurrent()`; the SourceEditor listeners are the actual R7 fix. Together they close both angles — concurrency isolation AND coordination symmetry — with zero architectural rework of the observer lifecycle.

**New test for the R7 fix:** `observers.test.ts` adds a test case that creates fresh Y.Doc + both fake editors, stamps `markUserTyping(doc)` in a loop (simulating source-mode typing), triggers a Y.Text write mid-stamp, and asserts Observer B defers its tree replacement by ~TYPING_DEFER_MS. Catches any future regression where SourceEditor listeners get removed.

**Why this is one commit, not two:** Splitting the signature change from the caller updates would leave an intermediate state where the code doesn't typecheck. One atomic commit maintains a green build.

**Validation:** Full stress suite (especially S2, S4 which exercise typing-defer) passes; 10/10 reliability across the integration + stress suite; manual browser verification of typing-defer behavior in WYSIWYG↔Source mode before merging.

#### Commit 7: test: enable `test.concurrent()` in integration and fidelity tests

**Support confirmed:** bun 2026 supports `test.concurrent()` per the [official docs](https://bun.com/docs/test) AND empirically via the investigation spike (4 concurrent tests with client-in-body pattern delivered true ~3× parallelism in 159 ms).

**Pattern prerequisite already met:** Commit 4 adopted client-in-body `try/finally` lifecycle. Commit 6 removed module-level `lastUserTypedAt` via WeakMap. Commit 7 is now a **mechanical flip** from `test(` to `test.concurrent(` on eligible tests — no refactoring needed.

**Files touched:**
- `packages/app/tests/integration/bridge-matrix.test.ts` — replace `test(` with `test.concurrent(` in W1-W4 describes
- `packages/app/tests/integration/conversion-fidelity.test.ts` — same for markdown/tree/observer/full-stack round-trip sections (NOT disk section — filesystem contention risk under very high concurrency)

**What's safe to parallelize:**
- Tests that create their own Y.Doc and cleanup — safe (per-doc WeakMap handles coordination state)
- Tests that share the integration server but use per-test docName — safe (Commit 4)
- Tests that don't touch file system — safe (Commits 3 + 5)

**What's NOT safe:**
- The initial sync test (depends on server state being empty)
- The test-reset isolation test (tests the shared-state behavior explicitly)
- Disk round-trip tests if the shared tmpdir has file-watcher contention under high concurrency — keep sequential out of caution

**Validation:** 10/10 reliability with concurrent mode enabled. If any flakes appear, revert the concurrent flag on the problematic tests and investigate whether the flake is a real latent bug.

#### Commit 8: docs: update CLAUDE.md Testing + Concurrent Development + Known Pitfalls

**Files touched:**
- `CLAUDE.md` (root)

**Content additions:**

> **Testing — per-test docName isolation**
>
> Integration tests use per-test docNames via `createTestClient(port)` which auto-generates `test-${randomUUID()}`. Tests are safe to run concurrently (`test.concurrent()`, multiple `bun test` processes in the same worktree) because:
> 1. Each test's Y.Doc is uniquely named and independent.
> 2. Observer A's typing-defer state is per-doc (WeakMap keyed by Y.Doc).
> 3. `/api/test-reset` is scoped to a specific docName.
>
> **Exception:** tests that verify shared-state behavior (initial sync, test-reset semantics) explicitly pass `'test-doc'` and do not run concurrently with each other.

> **Concurrent Development — multi-agent local workflows**
>
> This repo supports multiple agents (or agents + manual dev servers) running concurrently without coordination:
> - **Two agents, same worktree:** Each bun process gets its own port (`getFreePort`), its own Hocuspocus tmpdir (`mkdtempSync`), its own Y.Docs, and its own module state.
> - **Two agents, separate worktrees:** Stronger isolation via filesystem separation.
> - **Agent running Playwright + developer running `bun run dev`:** Playwright config sets `OK_TEST_CONTENT_DIR` to an isolated tmpdir; the manual dev server uses the default `packages/content/`. No contention.
>
> No environment variables must be set by hand for any of these scenarios.

> **Known Pitfalls — (removed)**
>
> The "do not run Playwright while a manual dev server is attached" rule is no longer needed — Playwright content dir isolation via `OK_TEST_CONTENT_DIR` eliminates the contention. Historical note kept for agents who may find old references.

> **Removed STOP rules:** `__resetCoordinationState` is no longer a public API. The typing-defer coordination state is per-doc via WeakMap; no manual reset required.

## 11) Decision log

| ID | Decision | Type | Resolution | Confidence | Date |
|----|----------|------|------------|------------|------|
| D1 | Deliver all four layers (harness isolation, Playwright content dir, CI parallelism, per-doc state) as a single PR | Cross-cutting | LOCKED | HIGH | 2026-04-10 |
| D2 | Scope filter is "evidence-based correctness OR strictly-better quality" (both filters must be satisfied to include; items must pass at least one) | Process | LOCKED | HIGH | 2026-04-10 |
| D3 | Local multi-agent parallelism is a first-class goal, not a CI-only concern | Architectural | LOCKED | HIGH | 2026-04-10 |
| D4 | Stress sharding by scenario group, not by test count | Technical | LOCKED | MEDIUM | 2026-04-10 |
| D5 | Per-test docName uses `test-${randomUUID()}`; defaults in test-harness.ts, explicit `'test-doc'` override for shared-state tests | Technical | LOCKED | HIGH | 2026-04-10 |
| D6 | Per-doc coordination state uses `WeakMap<Y.Doc, TypingState>` (not Map — GC hygiene) | Technical | LOCKED | HIGH | 2026-04-10 |
| D7 | `markUserTyping()` becomes a breaking API change (requires Y.Doc parameter) — no backward-compat overload; the "which doc?" question is unanswerable without the parameter | Technical | LOCKED | HIGH | 2026-04-10 |
| D8 | Playwright content dir isolation is done via env var (`OK_TEST_CONTENT_DIR`), read in `hocuspocus-plugin.ts`; preferred over per-test URL routing (NG5) | Technical | LOCKED | HIGH | 2026-04-10 |
| D9 | `writeTracker` refactor REMOVED from scope under both filters — content-addressed hashing is already correct for concurrent writers (no observed bug), and no "strictly better" dimension is identifiable (behavior is correct; refactor would be cosmetic) | Technical | LOCKED | HIGH | 2026-04-10 |
| D10 | `mdManager`/`schema` canonicalization REMOVED from scope — passes the "strictly better" filter (dedup across 14 call sites, objective improvement) but fails the "architectural coherence" test for this PR (cross-package refactor unrelated to isolation). Separate PR. | Technical | LOCKED | MEDIUM | 2026-04-10 |
| D11 | Playwright per-test docName with URL routing REMOVED from scope — requires app URL routing changes and a separate spec. Playwright content dir isolation (D8) covers the cross-process case without requiring this. | Technical | LOCKED | HIGH | 2026-04-10 |
| D12 | `test.concurrent()` enablement is Commit 7. bun support verified via docs AND empirical spike — no longer conditional. | Technical | LOCKED | HIGH | 2026-04-10 |
| D13 | `/api/test-reset` defaults to `'test-doc'` for Playwright backward compat; harness passes explicit docName | Technical | LOCKED | HIGH | 2026-04-10 |
| D14 | Commits 3 and 5 are atomic (all call sites updated in one commit) to maintain green build through history | Technical | LOCKED | HIGH | 2026-04-10 |
| D15 | CI workflow uses `fail-fast: false` to surface all failing shards | Technical | LOCKED | HIGH | 2026-04-10 |
| D16 | GitHub Actions cache for `bun install` and Playwright browsers is included from day one | Operational | LOCKED | HIGH | 2026-04-10 |
| D17 | No `check:agent` thin-gate script — measured warm check is already fast enough | Technical | LOCKED | HIGH | 2026-04-10 |
| D18 | R7 is **fully fixed** in Commit 6 via SourceEditor `markUserTyping(doc)` listeners (Option C). Prior framing as "observer lifecycle rework" was based on incorrect code reading — observers are a singleton bound to the Y.Doc, not re-wired on mode toggle. The real bug was coordination-state asymmetry between the two editors. | Scope | LOCKED | HIGH | 2026-04-10 |

## 12) Open questions

| ID | Question | Type | Priority | Status |
|----|----------|------|----------|--------|
| OQ1 | Does `bun test` actually support `test.concurrent()` at production quality? | Technical | P0 | **RESOLVED** — bun 2026 supports `test.concurrent()` (per-test opt-in) and `--concurrent` (file-global). Verified via [bun.com/docs/test](https://bun.com/docs/test) AND empirical spike during investigation (4 concurrent tests with client-in-body pattern, ~3× real parallelism in 159ms). **Also discovered**: the shared `let client` + `beforeEach` pattern breaks under concurrent mode — Commit 4 adopts client-in-body `try/finally` lifecycle, which is strictly better for both sequential and concurrent tests. Commit 7 is unblocked. |
| OQ2 | GitHub Actions billing cost — is the matrix job count acceptable? | Operational | N/A | **RESOLVED (not a concern)** — per the spec's guiding criteria, cost is not a filter. Architecturally: 9 jobs (8 matrix + 1 Playwright) × ~2-3 min wall clock = ~20 runner-minutes per PR. No action needed. |
| OQ3 | Does the S5/S6 shard actually fit in ≤3 min after sharding? | Technical | P1 | OPEN — measure after Commit 1 lands; rebalance if needed. |
| OQ4 | Does `AgentSessionManager.closeAll()` already accept a docName, or do we need to extend the signature? | Technical | P1 | **RESOLVED** — read during investigation: current signature is `async closeAll(): Promise<void>` (no parameter). Commit 4 must extend to `closeAll(docName?: string)` — simple addition. |
| OQ5 | Does `hocuspocus-plugin.ts` get re-imported on Vite HMR with env vars re-evaluated, or is `CONTENT_DIR` baked at first import? | Technical | P0 for Commit 5 | **RESOLVED** — investigated Vite 8.0.8 source (`vite/dist/node/chunks/node.js`): `server.restart()` re-bundles the config via rolldown into timestamp-hashed temp files, so each restart is a fresh module instance with fresh `process.env` reads. For Playwright's use case, `webServer` spawns a new Node process per run with env pre-set — no HMR concerns. Module-level `const CONTENT_DIR = process.env.X ? ... : ...` is safe. |
| OQ6 | Does Playwright `webServer.env` propagate env vars to the child `bun run dev` process? | Technical | P0 for Commit 5 | **RESOLVED with critical finding** — investigated Playwright 1.59.1 source. `webServer.env` DOES propagate, composed as `{ ...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...options.env }` at spawn time (`lib/plugins/webServerPlugin.js:87-93`). **BUT**: `globalSetup` runs AFTER the webServer plugin setup (`lib/runner/tasks.js:100-109`), so mutating `process.env` in `globalSetup` is too late. **Fix**: create the tmpdir in `playwright.config.ts` at module-load time (not in `globalSetup`) and pass via `webServer.env`. Commit 5 uses this corrected approach. |
| OQ7 | Does `bun run dev` correctly read `realpathSync` from a macOS `/var → /private/var`-style tmpdir path? | Technical | P1 for Commit 5 | **RESOLVED** — `test-harness.ts:59` already uses `realpathSync(mkdtempSync(join(tmpdir(), 'ok-test-')))` and the pattern works in production. Commit 5 mirrors it in `hocuspocus-plugin.ts`. |
| OQ8 | How should lint compose into the root `check` script? | Technical | P2 for Commit 2 | OPEN — three viable options: (a) **sequential biome prefix** (`"check": "biome check . && turbo run ..."`) — simplest, adds ~3-5s sequential overhead but biome runs once for the whole monorepo [DEFAULT shown in Commit 2 code sample]; (b) **turbo root task** (`"//#lint": {...}` in turbo.json) — parallel with other tasks, gains turbo cache but biome's internal caching already handles most of this; (c) **drop lint from check, rely on pre-commit hook** — fastest check, but regresses current behavior where `bun run check` catches lint errors. **Recommend**: start with (a) in Commit 2 implementation; measure the ~3-5s overhead; if it's noticeable for the inner loop, switch to (b). Option (c) is rejected because it weakens the local gate. |

## 13) Assumptions

| ID | Assumption | Confidence | Verification plan |
|----|-----------|------------|-------------------|
| A1 | `mdManager` and `schema` from `sharedExtensions` are pure/stateless | HIGH | Grep for mutations; read `@tiptap/markdown` source if ambiguous |
| A2 | `bun test` supports running a specific file via path arg | HIGH | Already works — `bun test <file>` in current scripts |
| A3 | `randomUUID()` is available in bun | HIGH | Verified — `crypto.randomUUID()` works |
| A4 | `WeakMap<Y.Doc, T>` entries GC when Y.Doc instances are released | HIGH | ECMA spec guarantee |
| A5 | Hocuspocus `documents.get(docName)` supports arbitrary doc names (not hardcoded to 'test-doc') | HIGH | Verified — 'test-doc' is a test convention, not a server constraint |
| A6 | `hocuspocus.unloadDocument(doc)` frees memory and allows re-loading | HIGH | Standard Hocuspocus API |
| A7 | Observer A's `lastSyncedXmlMd` is a closure variable inside `setupObservers`, not module state | HIGH | Verified via code read in prior session |
| A8 | Playwright `webServer.env` is honored by the child process and does not need additional exports | MEDIUM | OQ6 — verify with a small probe (log the env var on plugin startup) |
| A9 | `mkdtempSync` under `/tmp` gets `/private/tmp` after `realpathSync` on macOS (matching the integration harness behavior) | HIGH | Verified in existing `test-harness.ts` |
| A10 | Two bun processes in the same worktree can run concurrently without bun's package manifest or `node_modules` interfering | HIGH | Verified experimentally in the prior session (concurrent bridge-matrix runs) |
| A11 | The server's `initAsync` runs shadow-repo init + file-watcher startup + HEAD-watcher startup **unconditionally**, regardless of `gitEnabled: false`. Verified at `standalone.ts:415-444` on origin/main. Test-harness must await `srv.ready` to avoid racing watcher startup under `test.concurrent()`. The server's ignoring of `gitEnabled: false` for shadow-repo init is an **upstream server-side issue** (arguably a bug in the `createServer` factory — the option name implies shadow-repo should be disabled, but it isn't). **Out of scope for this spec** — we work around it by awaiting `ready`. Flagged as future work: fix the server so `gitEnabled: false` actually disables shadow-repo init. | HIGH | Code-verified |
| A12 | `createPersistenceExtension(...)` returns `PersistenceHandle = { extension, flushPendingGitCommit, waitForPendingCommits }` (added in PR #13) — not the extension directly. Callers must use `.extension` to access the Hocuspocus extension. | HIGH | Verified at `packages/server/src/persistence.ts:127,388` on origin/main |
| A13 | `startWatcher(dir, callback)`'s callback signature is `(event: DiskEvent) => Promise<void>` where DiskEvent is a tagged union (`create | update | delete | rename | conflict`), not a raw `(docName, content)` callback. Added in PR #13. | HIGH | Verified at `packages/server/src/file-watcher.ts` on origin/main |

## 14) Risks / unknowns

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | Per-doc coordination state (Commit 6) regresses production observer typing-defer behavior | LOW | HIGH — users' typing gets stomped by agent writes | Full stress suite (S2, S4) exercises the typing-defer window; 10/10 reliability required; manual browser verification of WYSIWYG↔Source mode toggling |
| R2 | `bun test.concurrent()` has latent bugs that flake tests (Commit 7) | LOW (support confirmed via docs + spike; impl quality at scale unknown) | LOW — reverting Commit 7 leaves Commits 1-6 intact | Validate with 10/10 before accepting; revert the flag per-file if issues arise |
| R3 | CI matrix uneven runtime — one shard dominates and blocks others | MEDIUM | LOW | `fail-fast: false` ensures other shards complete; rebalance S5/S6 if it exceeds 3 min |
| R4 | Per-test docName leaks memory if `cleanup()` doesn't properly unload the doc | MEDIUM | MEDIUM — long test runs grow heap | R9 requires unload in cleanup; validate with a 100-iteration soak test |
| R5 | `test.concurrent()` exposes a previously-latent race in production code | LOW | HIGH — unknown bug revealed | Treat any flake from Commit 7 as a real bug; investigate, don't just revert |
| R6 | `/api/test-reset` parameterization breaks Playwright tests that hardcode 'test-doc' | LOW | LOW | Default preserves backward compat; Playwright tests don't pass docName |
| R7 | GitHub Actions cache hits are lower than expected, CI runs don't speed up | LOW | LOW | Caching is additive optimization; baseline still parallelizes |
| ~~R8~~ | ~~bun doesn't support `test.concurrent()` at all~~ | N/A | N/A | **RESOLVED** — bun 2026 supports `test.concurrent()` per official docs. Risk closed. |
| R9 | `OK_TEST_CONTENT_DIR` env var is not honored by Vite HMR re-imports (OQ5) | MEDIUM | MEDIUM — Playwright content dir isolation silently falls back to `packages/content/` | Log the resolved content dir on startup so regressions are visible; add a Playwright pre-flight that curl-tests `/api/health` and asserts the expected content dir |
| R10 | Commit 5 introduces an import-time side effect into `hocuspocus-plugin.ts` that surprises downstream consumers of the plugin | LOW | LOW | The env-var read is gated; default behavior is unchanged |
| R11 | Two concurrent bun processes in the same worktree collide on turbo cache writes (R12 validation fails) | LOW | MEDIUM | Turbo claims internal locking; if R12 flakes, switch concurrent runs to target files directly with `bun test` (bypassing turbo) |

## 15) Future work

### Identified (scoped but not this PR)

- **Playwright per-test docName via URL routing.** Requires adding `?doc=<uuid>` routing to the React app. Separate spec. NG5.
- **Shared `mdManager`/`schema` canonicalization.** Strictly-better refactor deferred per D10. Own PR, driven by code hygiene not test isolation.
- ~~**Complete fix for R7.**~~ **REMOVED — now in scope as Commit 6 (R7 Option C: SourceEditor `markUserTyping` listeners).**
- **Multi-doc-per-process dev server UI.** Production architecture is ready after Commit 6 (per-doc WeakMap state). UI-level support (routing, switching between docs in one browser tab) is a separate feature.
- **Concurrent Vite dev servers with isolated content dirs.** Commit 5 ships the env-var hook; the "two humans dev-serving the same worktree" flow could be formalized with a `bun run dev:alt` script that sets `OK_TEST_CONTENT_DIR` automatically. NG8.
- **Turbo per-file content hashing.** Tooling complexity too high today; revisit if turbo adds first-party support.

### Noted (not a spec, just flagged for future consideration)

- **`writeTracker` cleanup remains correct-by-accident.** Content-addressed hashing works under concurrent writers today, but the design rationale is not documented in the module. Adding a comment-only PR that explains the invariant would reduce future confusion without crossing either filter gate.
- **Per-test tmpdir in addition to per-test docName** would fully isolate file system state even under pathological concurrent file-watcher events. Not needed today because per-test docName + per-server `mkdtempSync` is sufficient.
- **Architectural dual-observer approach questions** (from session discussion) are tracked separately — they are not blocking this PR and do not fit either filter gate in their current form.

## 16) Commit sequence within the PR

| # | Commit | Files touched | Validation |
|---|---|---|---|
| 1 | `test: split observers.stress.test.ts into 4 scenario-group files` | 4 new stress files, old file deleted, per-file package.json scripts added | Each new file runs independently; all 32 tests present and passing; 10/10 reliability per file |
| 2 | `chore(turbo): narrow check, add dedicated per-tier task graph, compose at root` | `turbo.json` (narrow `check`, new dedicated tasks with explicit inputs), root `package.json` (compose `check` + `check:full:parallel`), `packages/app/package.json` (narrow `test` to `bun test src/`; add per-tier scripts) | `bun run check` cold run ~30s; warm replay after editing a single test file ~15-16s (fine-grained invalidation); `bunx turbo run check:full:parallel` cold ~6 min under local 4-way contention; warm replay < 1s; no task runs the same test file twice |
| 3 | `ci: add .github/workflows/test.yml — symmetric matrix, one job per turbo task` | `.github/workflows/test.yml` | Every matrix job is `bunx turbo run ${{ matrix.task }}`; playwright is a dedicated job because it needs browser install; matrix list is one-to-one with turbo tasks; each test runs exactly once per PR |
| 4 | `test(harness): per-test docName isolation + client-in-body lifecycle + parameterized /api/test-reset` | `test-harness.ts`, `bridge-matrix.test.ts`, `conversion-fidelity.test.ts`, `api-extension.ts`, `agent-sessions.ts` (extend `closeAll(docName?)`) | 10/10 reliability on migrated tests including under `test.concurrent()` (dry-run); R12a regression guard (2x process) holds; typecheck + lint green |
| 5 | `feat(dev-server): Playwright content dir isolation via OK_TEST_CONTENT_DIR` | `hocuspocus-plugin.ts`, `playwright.config.ts` (module-scope `mkdtempSync`), `tests/stress/global-teardown.ts` (new) | `bun run dev` + `bun run test:stress:e2e` run concurrently in the same worktree, both pass; plugin startup log confirms resolved content dir; `/tmp/ok-playwright-*` is removed after the run |
| 6 | `feat(observers): per-doc WeakMap coordination state + SourceEditor markUserTyping symmetry (R7 fix)` | `observers.ts`, `TiptapEditor.tsx`, `SourceEditor.tsx` (NEW: mirror DOM listeners), 4 split stress files, `observers.fuzz.test.ts`, `observers.test.ts` | Full stress + integration suite passes; 10/10 reliability; new test case verifying source-mode typing defers Observer B; manual browser verification of typing-defer behavior under WYSIWYG↔Source rapid-toggle |
| 7 | `test: enable test.concurrent() in integration + fidelity tests` | `bridge-matrix.test.ts`, `conversion-fidelity.test.ts` (non-disk sections) | 10/10 reliability in concurrent mode. bun support confirmed via docs + empirical spike — no longer conditional. |
| 8 | `docs: update CLAUDE.md Testing + Concurrent Development + Known Pitfalls` | `CLAUDE.md` | Manual review; ensure obsolete references to `__resetCoordinationState` and "turn off dev server" pitfalls are removed |

**Rollback plan:** Commits 1, 2, 3, 7, 8 can be reverted independently. Commit 4 (harness) and Commit 6 (observers) are paired — both must revert together OR neither, because Commit 4's client-in-body pattern depends on Commit 6's per-doc state for `test.concurrent()` correctness. Commit 5 (Playwright content dir) can be reverted independently; reverting it restores the "turn off dev server first" precondition. Commit 2 (turbo tasks) depends on Commit 1 (stress file split) — revert Commit 2 first if rolling back both.

## 17) Agent constraints

### SCOPE
- `.github/workflows/test.yml` — NEW
- `packages/app/tests/stress/observers.stress.*.test.ts` — NEW (4 split files)
- `packages/app/tests/stress/observers.stress.test.ts` — DELETED
- `packages/app/tests/integration/test-harness.ts` — per-test docName support, async cleanup, remove `__resetCoordinationState` import + call
- `packages/app/tests/integration/bridge-matrix.test.ts` — migrate to per-test docNames
- `packages/app/tests/integration/conversion-fidelity.test.ts` — migrate + share disk test client, remove `__resetCoordinationState` calls in observer-roundtrip and full-stack describe blocks
- `packages/server/src/api-extension.ts` — parameterize `/api/test-reset` with docName query param
- `packages/server/src/agent-sessions.ts` — extend `closeAll(docName?)` signature if needed (read first)
- `packages/app/src/server/hocuspocus-plugin.ts` — read `OK_TEST_CONTENT_DIR` env var, log resolved path at startup
- `packages/app/playwright.config.ts` — module-scope `mkdtempSync` (NOT `globalSetup` per OQ6), wire `globalTeardown`, pass tmpdir path via `webServer.env`
- `packages/app/tests/stress/global-teardown.ts` — NEW — `rmSync` the tmpdir
- `turbo.json` — narrow `check` task; add dedicated `test:integration`, `test:conversion`, `test:stress:*`, `test:fuzz`, `test:e2e` tasks with explicit `inputs`
- `package.json` (root) — compose `check` script as `turbo run check test:integration test:conversion`; add `check:full:parallel` that layers stress/fuzz/e2e on top
- `packages/app/package.json` — narrow `test` to `bun test src/` (unit only); add per-tier scripts: `test:integration`, `test:conversion`, `test:stress:s1-s8-s9`, `test:stress:s2`, `test:stress:s4`, `test:stress:s5-s6`, `test:fuzz`, `test:e2e`
- `packages/app/src/editor/observers.ts` — per-doc `WeakMap<Y.Doc, TypingState>`; `markUserTyping(doc)` signature; remove `__resetCoordinationState` export
- `packages/app/src/editor/TiptapEditor.tsx` — pass `provider.document` to `markUserTyping`
- `packages/app/src/editor/observers.test.ts` — update dynamic-import `markUserTyping(doc)` callsites; remove `__resetCoordinationState` beforeEach and trailing reset call
- `packages/app/tests/stress/observers.stress.s1-s8-s9.test.ts` — remove `__resetCoordinationState` import + usage
- `packages/app/tests/stress/observers.stress.s2.test.ts` — pass `doc` to `markUserTyping`; remove `__resetCoordinationState` usage
- `packages/app/tests/stress/observers.stress.s4.test.ts` — pass `doc` to `markUserTyping` (S4 + S4b); remove `__resetCoordinationState` usage
- `packages/app/tests/stress/observers.stress.s5-s6.test.ts` — remove `__resetCoordinationState` import + usage
- `packages/app/tests/stress/observers.fuzz.test.ts` — pass `doc` to `markUserTyping`; remove `__resetCoordinationState` usage
- `CLAUDE.md` — Testing, Concurrent Development, Known Pitfalls sections

### EXCLUDE
- `packages/core/` — no changes
- `packages/cli/` — no changes
- `packages/server/src/file-watcher.ts` — `writeTracker` refactor explicitly OUT (D9)
- `packages/server/src/persistence.ts` — not touched
- `packages/server/src/standalone.ts` — not touched (no wiring changes needed)
- `docs/` — no changes
- Playwright per-test docName or multi-worker — OUT (D11, NG5, NG6)
- `mdManager`/`schema` canonicalization — OUT (D10, NG4) — architectural coherence, not cost
- ~~Complete R7 fix~~ — **IN scope** (Commit 6, R7 Option C); prior exclusion was based on incorrect code analysis
- `agent-sim.ts` URL/port configuration — OUT (self-isolating via hardcoded `localhost:5173`; see §4.5 non-concerns)

### STOP_IF
- `bun test.concurrent()` produces flakes that aren't explained by a real bug → skip Commit 7, investigate; commits 1-6 still deliver their value
- Commit 6 (per-doc coordination state + SourceEditor listeners) breaks existing stress S2/S4 tests that can't be fixed by updating callers → pause, understand the semantic, re-spec if needed
- `/api/test-reset` parameterization breaks Playwright tests → Playwright keeps using the default 'test-doc' path; revisit
- 10/10 reliability fails post-migration on bridge-matrix, conversion-fidelity, or R12a multi-process validation → halt, diagnose root cause before proceeding
- Commit 5 (Playwright content dir env var) fails empirical validation (dev-server contention still observed despite env var) → revisit OQ6 conclusion; fall back to CLAUDE.md precondition; don't ship a half-working isolation

### ASK_FIRST
- Any production code change beyond `observers.ts`, `SourceEditor.tsx`, `TiptapEditor.tsx`, `hocuspocus-plugin.ts` (e.g., `file-watcher.ts`, `persistence.ts`, `standalone.ts`) — scope creep alarm
- Any case where `test.concurrent()` turns out to be a fragile or unreliable abstraction in practice (despite the docs confirming support) — escalate rather than push through
- Any change to `packages/core/` or `packages/cli/` — out of scope
