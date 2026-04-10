# Test Isolation & Parallelism — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-10
**Baseline commit:** `main` @ post-PR-#34 merge
**Delivery:** **Single PR** covering local multi-agent parallelism, harness isolation, CI parallelism, and per-doc production state.
**Guiding criteria:** Scope decisions filter on (a) **evidence-based correctness** — a measured bug or observed failure class, or (b) **strictly-better quality** — a change that is well-defined, objectively superior on a named dimension (fewer race surfaces, fewer serialization points, simpler invariants), and supported by evidence the current shape is inferior. Both criteria cut against "nice to have" refactors that are merely principled.
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

2. **CI wall clock is bottlenecked by stress tests.** No CI workflow exists yet. Once added, stress at ~7 min dominates a sequential run (~11 min). The fan-out is trivial — GitHub Actions matrix jobs — but requires stress to be split into independent files first.

3. **Tests are serialized by shared module-level state.** `packages/app/src/editor/observers.ts` has a module-level `let lastUserTypedAt = 0` reset by `__resetCoordinationState()` in test beforeEach hooks. This forbids intra-file parallelism (bun `test.concurrent()`) because two concurrent tests in the same process would trample each other's coordination window. It also represents a latent production bug: two Y.Doc instances in one process (reconnect scenarios, multi-tab, future multi-doc editors) share typing state, which is architecturally wrong.

**Resolution.** One PR. Four architectural layers applied consistently:

1. **Harness isolation (test-only refactor).** Per-test docName via `randomUUID()`. Each test owns a unique document. Eliminates the testReset race class by making shared-state collisions impossible by construction. Enables intra-file `test.concurrent()` as a downstream effect.
2. **Playwright content dir isolation (test-only wiring).** `hocuspocus-plugin.ts` honors a `OK_TEST_CONTENT_DIR` env var. Playwright webServer points at a per-run `mkdtempSync()` directory. Manual `bun run dev` and Playwright tests no longer share a file. Closes the observed contention class.
3. **CI parallelism (mechanical).** Split stress into 4 scenario-group files, add `.github/workflows/test.yml` with parallel matrix jobs. PR CI wall clock: ~11 min sequential → **~3-5 min parallelized.** Identical splitting also enables concurrent local runs of different stress shards.
4. **Production architectural fix (touches `observers.ts`).** Move `lastUserTypedAt` from module scope into `WeakMap<Y.Doc, TypingState>`. Make `markUserTyping()` accept a Y.Doc parameter. This addresses R7 from the prior spec as an architectural improvement and unblocks `test.concurrent()`.

The four layers ship together because they form one architectural statement: **"test isolation failures should be impossible by construction, not sequential convention."** CI parallelism without fixing the module state treats symptoms. Harness isolation without fixing the production state leaves a latent bug. Local multi-agent parallelism without Playwright content-dir isolation forces a "turn off your dev server" rule in the docs instead of removing the failure class.

## 2) Goals

- **G1: Local multi-agent parallelism by construction.** Two agents running `bun run check` (or any test command) simultaneously — in the same worktree, different shells, or separate worktrees — cannot interfere. A manual `bun run dev` running in one shell cannot interfere with Playwright stress tests running in another. No "please turn off your dev server first" rules.
- **G2: PR CI wall clock ≤ 5 minutes.** Via stress sharding + parallel matrix jobs. Target: max shard ≤ 3 min, wall clock ≤ 5 min (including setup/teardown).
- **G3: Agent inner loop (`bun run check`) stays fast.** Current: ~20s warm, ~55-65s cold. Must not regress. Should improve marginally via shared client in conversion-fidelity disk tests (~15s saved).
- **G4: Test isolation failures are impossible by construction.** No shared `'test-doc'` docName across tests. No shared module-level mutable state reachable from tests. No shared `packages/content/` directory between manual dev servers and Playwright test runs.
- **G5: Production code benefits.** The per-doc `lastUserTypedAt` change is the architecturally correct shape — makes multi-doc-per-process feasible, **partially addresses R7** from the prior spec (removes one source of contention; complete fix requires observer lifecycle rework, see NG10/D18), eliminates a latent bug where two Y.Docs in one process would share typing state incorrectly. Strictly better on a named dimension.
- **G6: Intra-file parallelism unlocked.** `bun test.concurrent()` in `bridge-matrix.test.ts` (and the unit sections of `conversion-fidelity.test.ts`) is safe — not from a convention, but because the underlying shared state has been removed. Runtime drops: bridge-matrix ~13s → ~5s; fidelity unit sections ~16s → ~5s. bun `test.concurrent()` support confirmed via [docs](https://bun.com/docs/test) (OQ1 resolved).

## 3) Non-goals

- **[NEVER]** NG1: **Migrate off `bun test`.** Stay on bun's native runner.
- **[NOT NOW]** NG2: **Post-merge jobs.** Per team constraint, nothing runs after merge to main. All verification is pre-merge.
- **[NOT NOW]** NG3: **`writeTracker` refactor.** Audit showed it's content-addressed — two test servers writing identical content both correctly self-suppress; two with different content don't collide. No observed or measurable bug and no dimension where the current shape is *strictly* inferior. Both the correctness filter and the strictly-better filter reject this.
- **[NOT NOW]** NG4: **Canonicalizing `mdManager`/`schema` into a single shared instance.** Flagged in PR #34 review. 14 instances across 3 packages, all stateless per audit. This is borderline under the broadened criterion — deduplication is an objective improvement on a named dimension (memory, drift surface). Excluded because the scope is cross-package (`core`, `server`, `app`), the blast radius is independent of test isolation, and the "strictly better" gap is small enough that bundling it here muddles the PR's architectural argument. Own PR.
- **[NOT NOW]** NG5: **Playwright per-test docName with URL routing.** Requires adding `?doc=<uuid>` routing to the React app — substantial app-level refactor unrelated to test infrastructure. Playwright content dir isolation (in scope) removes the *cross-process* contention; the *intra-Playwright* parallelism question is separate. Addressed long-term by NG5's follow-up spec.
- **[NOT NOW]** NG6: **Playwright multi-worker parallelism within a single run.** Current total Playwright runtime is ~15s. Not worth per-worker webServer plumbing.
- **[NOT NOW]** NG7: **Turbo per-file content hashing.** Too complex, no first-party support.
- **[NOT NOW]** NG8: **Concurrent Vite dev servers against the same repo with shared content dir.** Addressed by the Playwright env-var pattern, but the "multiple humans dev-serving the same worktree" use case is separate and not driven by test isolation. File a follow-up if anyone actually hits it.
- **[NOT NOW]** NG9: **Extracting a `check:agent` thin-gate script.** Measured: `bun run check` is ~20s warm. Fast enough for the inner loop. Optimize only if it becomes a bottleneck.
- **[NOT NOW]** NG10: **Partial/complete fix of R7 (observer race during rapid mode toggles).** Commit 5 (per-doc state) removes one source of contention, which is a partial fix. The complete fix requires pausing observers when the inactive mode is not visible — a design change to `TiptapEditor` + `SourceEditor` mount/unmount lifecycle. Out of scope for this PR; tracked in future work.

## 4) Scope filter (applied throughout)

Every item in this spec passed one of these gates:

1. **Evidence-based correctness** — there is a measured bug, an observed failure class, or a concrete race exposed by the test suite or measurement work. Examples: per-test docName (observed testReset contention); Playwright content dir isolation (observed Layer C timeout during measurement); per-doc coordination state (prerequisite for `test.concurrent()` which exposes the module-state race).
2. **Strictly-better quality** — the change is well-defined and objectively superior on a named dimension, with evidence the current shape is inferior. Examples: WeakMap per-doc state (fewer shared-state surfaces, enables multi-doc-per-process); stress sharding (fewer serialization points, enables parallel matrix jobs); async `cleanup()` (correctly awaits doc unload, fewer leak surfaces).

Items that fail both gates are deferred regardless of how "principled" they sound. `writeTracker` refactor is the canonical example: correct today, no observed bug, no strictly-better dimension named — deferred.

This filter applies equally to test code and production code. The filter is *not* a budget — a correct improvement is worth making regardless of line count.

## 5) Personas / consumers

- **P1: AI coding agent (single)** — Claude Code in `/implement` loop. Runs `bun run check` every iteration. Needs sub-90s feedback. Most iterations hit warm turbo cache → ~15-25s typical. Cares about: no flakes, deterministic output, fast failure messages.
- **P2: Developer running tests locally** — runs `bun run check` before commit (~20s warm); runs `bun run check:full` at natural checkpoints (~11 min sequential today; CI parallelism is a CI improvement, not a local one — local sequential runtime is unchanged). Cares about: can still `bun run dev` in another shell while tests run; reliability across a long session.
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
3. Matrix jobs run in parallel on separate runners:
   - `fast-gate`: typecheck + lint + unit + integration + fidelity (~1 min)
   - `stress-s1-s8-s9`: single-writer baselines (~2 min)
   - `stress-s2`: ASCII + Unicode concurrent typing (~2 min)
   - `stress-s4`: undo during active typing (~2 min)
   - `stress-s5-s6`: race conditions, multi-turn (~2-3 min — largest shard)
   - `fuzz`: all fuzz tests (~2 min)
   - `playwright`: Layer C + UX (~1 min including browser install)
4. Wall clock: `max(jobs) ≈ 3 min` (bottlenecked by longest stress shard + Playwright setup).
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
| Must | R5: Playwright content dir isolation via `OK_TEST_CONTENT_DIR` env var | `hocuspocus-plugin.ts` reads `process.env.OK_TEST_CONTENT_DIR` and uses `realpathSync(value)` when set, falling back to `resolve(__dirname, '../../../content')`; `playwright.config.ts` uses `globalSetup` to create a per-run tmpdir via `mkdtempSync` and `globalTeardown` to `rmSync` it; the tmpdir path is passed to the webServer via `env`; a manual `bun run dev` running against the default content dir cannot contend with a concurrent Playwright run |
| Must | R6: Observer A coordination state is per-doc | `lastUserTypedAt` moved from module scope to `WeakMap<Y.Doc, TypingState>`; `markUserTyping(doc)` accepts a Y.Doc parameter |
| Must | R7: All existing `markUserTyping()` callers updated | `SourceEditor.tsx`, `TiptapEditor.tsx`, `observers.stress.*.test.ts` all pass Y.Doc; typecheck passes |
| Must | R8: `__resetCoordinationState()` removed | No longer needed — per-doc state is naturally isolated via WeakMap GC when Y.Doc instances are released |
| Must | R9: Memory leak prevention for per-test docs | `client.cleanup()` calls `testReset(port, docName)` to unload the doc; verified no growing heap over a 100-iteration soak test |
| Must | R10: CI wall clock ≤ 5 min on PR | `.github/workflows/test.yml` exists with parallelized matrix; measured `max(job_duration)` on the PR's diff is ≤ 5 min |
| Must | R11: Stress tests split into scenario-group files | `observers.stress.test.ts` replaced with 4 files; each ≤ 180s runtime in CI; all 32 tests still present and passing |
| Must | R12a: Cross-process isolation in same worktree (regression guard) | Two bun processes running `bun test packages/app/tests/integration/bridge-matrix.test.ts` in parallel in the same worktree both pass; validated across 10 consecutive runs; no port collisions, no tmpdir collisions. Already works pre-spec (verified in measurement session); this requirement ensures the migrations in Commits 3-5 don't regress it. |
| Must | R12b: Intra-process concurrency via per-test docName | Within one bun test process, two tests using `test.concurrent()` cannot collide on docName, module state, or `/api/test-reset` side effects. New capability enabled by Commits 3+5. Validated by 10/10 reliability of `bridge-matrix.test.ts` with `test.concurrent()` enabled (Commit 6). |
| Should | R13: `check:full` script in root `package.json` | `bun run check:full` = check + stress + fuzz + Playwright; exits 0 on clean |
| Should | R14: CI job dependency caching | GitHub Actions `actions/cache` for `~/.bun/install/cache` (keyed on `bun.lock`); saves ~20-30s per job |
| Should | R15: Playwright browser caching in CI | `actions/cache` for `~/.cache/ms-playwright`; saves ~30s per Playwright run |
| Should | R16: `test.concurrent()` in `bridge-matrix.test.ts` | All eligible tests use `test.concurrent()`; 10/10 reliability holds; file runtime drops from ~13s to ~5s. Confirmed supported in bun 2026 — [bun.com/docs/test](https://bun.com/docs/test) documents `test.concurrent()` + `--concurrent` flag. |
| Should | R17: `test.concurrent()` in conversion-fidelity unit sections | Non-disk sections (74 unit tests) use `test.concurrent()`; runtime drops ~16s → ~5s |

### Non-functional requirements

- **Reliability:** 10/10 local reliability runs of `bridge-matrix.test.ts` and `conversion-fidelity.test.ts` after all changes land. Plus 10/10 runs of R12 (two concurrent bun processes in the same worktree).
- **Determinism:** CI runs produce identical results for identical code. No timing-dependent flakes.
- **Observability:** CI matrix job names are descriptive (`stress-s4-undo-during-typing`, not `stress-2`). Failure messages clearly identify the shard. `hocuspocus-plugin.ts` logs the resolved content dir at dev-server startup so isolation failures are diagnosable from Playwright stdout.
- **Local DX:** Nothing in the test suite requires "please close your dev server first" as a precondition. No env var must be set by hand for normal workflows. `bun run test:stress:e2e` works from a clean repo with no prior setup.
- **Cost:** GitHub Actions billing impact acceptable (see OQ2).

## 8) Current state

### Serialization points (why tests can't run fully in parallel today)

1. **bun test runs files sequentially within a package**, one at a time.
2. **bun test runs tests within a file sequentially** — no `test.concurrent()` in use.
3. **Turbo parallelizes package `test` tasks across packages**, but within a package, tasks are sequential.
4. **No CI workflow exists** to fan tests out across matrix jobs.
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
Before:
  bun run check              →  ~20s warm / ~65s cold
  bun run check:full         →  ~11 min (sequential)
  Two agents, same worktree  →  works for integration, contends for Playwright
  CI                         →  doesn't exist

After:
  bun run check              →  ~20s warm / ~55-65s cold  (~10s saved via shared fidelity client)
  bun run check:full         →  ~11 min sequential (parallelism is CI + cross-process only)
  Two agents, same worktree  →  works for all tests (Playwright included)
  CI wall clock              →  ~3-5 min (parallel matrix)

Isolation guarantees (all enforced by construction):
  Shared module state        →  Per-doc WeakMap (production code)
  Shared 'test-doc' name     →  Per-test randomUUID()
  Shared Playwright content  →  Per-run mkdtempSync via env var
  test.concurrent() safe     →  YES (enabled in bridge-matrix + fidelity unit sections — OQ1 resolved)
  Multi-doc-per-process      →  Natively supported (was latent, now exercised)
```

### CI matrix structure

```
┌─────────────────────────────────────────────────────────┐
│                     .github/workflows/test.yml          │
├─────────────────────────────────────────────────────────┤
│  fast-gate            check (typecheck+lint+test)  ~1m  │
│  stress-s1-s8-s9      observers.stress.s1-s8-s9    ~2m  │
│  stress-s2            observers.stress.s2          ~2m  │
│  stress-s4            observers.stress.s4          ~2m  │
│  stress-s5-s6         observers.stress.s5-s6       ~3m  │ ← likely longest shard
│  fuzz                 observers.fuzz               ~2m  │
│  playwright           crdt-stress + ux-interactions ~1m │
└─────────────────────────────────────────────────────────┘
     max wall clock ≈ 3 min + runner startup
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

Each file imports the same shared helpers (stabilize, assertBridgeInvariant, generateMarkdown, CONTENT cache). The module-level `__resetCoordinationState()` in `beforeEach` still works per-file because each file runs in its own bun test process in CI (and after Commit 5 the reset is no longer needed at all).

**Rationale for the grouping:** Balance runtime, not test count. S5/S6 are the heaviest scenarios (multi-turn, race conditions) and go together. S2 unicode variants belong with S2 ASCII. S4 variants belong together. S1/S8/S9 are single-writer baselines that pair well.

**Validation:** Run each file individually; all 32 scenarios present; `bun test:stress` script updated to glob the new files; 10/10 reliability per file.

#### Commit 2: ci: add `.github/workflows/test.yml` + `check:full` script

**Files touched:**
- `.github/workflows/test.yml` → NEW
- `package.json` (root) → add `"check:full": "bun run check && bun run test:stress && bun run test:stress:e2e"`
- `packages/app/package.json` → update `test:stress` glob to cover all 4 stress files

**Workflow structure:**

```yaml
name: Tests
on:
  pull_request: { branches: [main] }
  push: { branches: [main] }

env:
  BUN_VERSION: '1.3.11'

jobs:
  fast-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: ${{ env.BUN_VERSION }} }
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bun run check

  stress:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [s1-s8-s9, s2, s4, s5-s6]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: ${{ env.BUN_VERSION }} }
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bun test packages/app/tests/stress/observers.stress.${{ matrix.shard }}.test.ts

  fuzz:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: ${{ env.BUN_VERSION }} }
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bun test packages/app/tests/stress/observers.fuzz.test.ts

  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: ${{ env.BUN_VERSION }} }
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
      - run: bun install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/bun.lock') }}
      - run: bunx playwright install --with-deps chromium
      - run: cd packages/app && VITE_PORT=13579 bun run test:stress:e2e
```

**Key details:**
- `fail-fast: false` so all failing shards are visible in one run.
- Caching for `bun install` saves ~20-30s per job after the first run.
- Caching for Playwright browsers saves ~30s.
- Playwright uses a fixed `VITE_PORT=13579` (not default 5173) to avoid conflict with any local dev server on the runner.
- Content dir isolation for Playwright arrives in Commit 4; until then, the workflow relies on runners having no competing dev servers (trivially true in CI).
- No post-merge jobs; `push` to main exists only to re-verify what landed.

#### Commit 3: test(harness): per-test docName isolation + parameterized `/api/test-reset`

**Files touched:**
- `packages/app/tests/integration/test-harness.ts` — `createTestClient` signature, helpers, async cleanup; **remove `__resetCoordinationState` call** (no longer needed per-test because each test owns a unique Y.Doc; the import + call become dead code and are removed)
- `packages/app/tests/integration/bridge-matrix.test.ts` — migrate to per-test docNames
- `packages/app/tests/integration/conversion-fidelity.test.ts` — migrate disk section to share the server with per-test docNames; **remove `__resetCoordinationState` calls** from the observer-roundtrip and full-stack describe blocks (lines 189-191, 234-236 today) for the same reason
- `packages/server/src/api-extension.ts` — parameterize `/api/test-reset` with docName query param
- `packages/server/src/agent-sessions.ts` — confirm/extend `closeAll(docName?)` signature to accept a target doc

**Why Commit 3 removes the reset calls even though `__resetCoordinationState` still exists at this point:** the reset is only semantically required when tests share a Y.Doc (they don't after the migration) or when module-level state persists across tests (it does until Commit 5). In Commit 3 the call becomes vacuous — harmless but noise. Deleting it now splits the refactor cleanly: Commit 3 owns harness migration, Commit 5 owns the production state change. Test-harness / conversion-fidelity no longer need to know about reset-state internals.

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

**Migration pattern for bridge-matrix.test.ts:**

```typescript
// BEFORE
describe('W1: WYSIWYG writes', () => {
  let client: TestClient;
  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });
  afterEach(() => { client?.cleanup(); });
  // ...
});

// AFTER
describe('W1: WYSIWYG writes', () => {
  let client: TestClient;
  beforeEach(async () => {
    client = await createTestClient(server.port);  // auto-generates test-${uuid}
  });
  afterEach(async () => { await client?.cleanup(); });  // now async — unloads the per-test doc
  // ...
});
```

The `initial sync` and `test-reset isolation` tests explicitly pass `'test-doc'` because they test the shared-state behavior. Those are the only exceptions.

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

#### Commit 4: feat(dev-server): Playwright content dir isolation via `OK_TEST_CONTENT_DIR`

**Files touched:**
- `packages/app/src/server/hocuspocus-plugin.ts` — read env var, resolve content dir dynamically
- `packages/app/playwright.config.ts` — wire `globalSetup`/`globalTeardown`, pass env var to webServer
- `packages/app/tests/stress/global-setup.ts` → NEW — creates the per-run tmpdir, writes an empty `test-doc.md`, exports the path via `process.env.OK_TEST_CONTENT_DIR` for the webServer
- `packages/app/tests/stress/global-teardown.ts` → NEW — `rmSync(dir, { recursive: true, force: true })` the tmpdir
- `CLAUDE.md` — update "Running Playwright + manual dev server" pitfall text (now resolved, not a pitfall)

**Plugin change:**

```typescript
// packages/app/src/server/hocuspocus-plugin.ts (excerpt)
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

**Playwright config change:**

```typescript
// packages/app/playwright.config.ts (excerpt)
export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: require.resolve('./tests/stress/global-setup'),
  globalTeardown: require.resolve('./tests/stress/global-teardown'),
  // ...
  webServer: {
    command: `VITE_PORT=${process.env.VITE_PORT ?? '5173'} bun run dev`,
    url: `http://localhost:${process.env.VITE_PORT ?? '5173'}`,
    reuseExistingServer: false,
    timeout: 30_000,
    // Env is inherited from the test runner process, which globalSetup has
    // already populated with OK_TEST_CONTENT_DIR.
  },
});
```

**globalSetup / globalTeardown:**

```typescript
// packages/app/tests/stress/global-setup.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function globalSetup(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'ok-playwright-'));
  writeFileSync(join(dir, 'test-doc.md'), '', 'utf-8');
  process.env.OK_TEST_CONTENT_DIR = dir;
  console.log(`[playwright] OK_TEST_CONTENT_DIR = ${dir}`);
}

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

**Why globalSetup and not module-scope `mkdtempSync`:** Playwright evaluates `playwright.config.ts` on metadata commands (`--list`, `--dry-run`, `--grep` discovery) as well as actual test runs. Module-scope `mkdtempSync` would create a tmpdir on every invocation, including the ones that never spawn the webServer. `globalSetup` runs only when tests actually execute; `globalTeardown` cleans up regardless of pass/fail. The guard string check in `globalTeardown` is defensive — prevents accidental `rmSync` of unrelated paths if the env var is hijacked.

**Rationale:** This is a production-code change (`hocuspocus-plugin.ts` is in `src/server/`), but the blast radius is minimal: one env-var check, a log line. No behavior change for normal `bun run dev` (env var unset → default path). The strictly-better dimension is clear: under the current shape, running Playwright requires a global precondition ("no other dev server") that can't be enforced mechanically; under the new shape, the precondition is gone.

**Known limitation:** The Playwright `webServer` starts once per run, so all Playwright tests within a run share the same content dir. This is fine for the current suite (5 tests) but doesn't provide per-test Playwright isolation — that requires URL-based docName routing (NG5), not env-var plumbing.

**Validation:** Run `bun run dev` in one shell (writing to `packages/content/test-doc.md` manually), run `bun run test:stress:e2e` in another shell, both succeed. Re-run the full Playwright suite with `bun run dev` not active; unchanged behavior. Grep `hocuspocus-plugin` logs to confirm resolved path.

#### Commit 5: feat(observers): per-doc coordination state via WeakMap

**Files touched:**
- `packages/app/src/editor/observers.ts` — WeakMap state, `markUserTyping(doc)` signature, remove `__resetCoordinationState` export
- `packages/app/src/editor/TiptapEditor.tsx` — pass `provider.document` to `markUserTyping` (only WYSIWYG callsite; `SourceEditor.tsx` does NOT call `markUserTyping` because source-mode typing updates Y.Text directly — Observer B is syncing the user's own input, no deferral needed)
- `packages/app/tests/stress/observers.stress.s1-s8-s9.test.ts` — remove `__resetCoordinationState` import + `beforeEach` call (inherited from the split in Commit 1)
- `packages/app/tests/stress/observers.stress.s2.test.ts` — pass `doc` to `markUserTyping`; remove `__resetCoordinationState` import + call
- `packages/app/tests/stress/observers.stress.s4.test.ts` — pass `doc` to `markUserTyping` (covers S4 and S4b, which both use `markUserTyping`); remove `__resetCoordinationState` import + call
- `packages/app/tests/stress/observers.stress.s5-s6.test.ts` — remove `__resetCoordinationState` import + `beforeEach` call
- `packages/app/tests/stress/observers.fuzz.test.ts` — pass `doc` to `markUserTyping` at the callsite; remove `__resetCoordinationState` import + call
- `packages/app/src/editor/observers.test.ts` — pass `doc` to the `markUserTyping` dynamic-import callsites (lines ~683, 686, 814, 815); remove the `beforeEach(() => __resetCoordinationState())` (line ~19-21) and the trailing reset call (line ~865)

**Coverage check for removal of `__resetCoordinationState`:** After Commits 1 and 3, the callers of `__resetCoordinationState` are exactly: (1) the 4 split stress files, (2) `observers.fuzz.test.ts`, (3) `observers.test.ts`. Commit 3 already removed it from `test-harness.ts` and `conversion-fidelity.test.ts`. Commit 5 removes it from the remaining 6 test files and the source definition in one atomic commit, so no intermediate state leaves an unused import.

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
// TiptapEditor.tsx — the only production callsite (line ~179 today)
// Change `markUserTyping()` → `markUserTyping(props.editor.storage.collaboration?.doc ?? provider.document)`
// or equivalent — whichever exposes the Y.Doc at the callsite cleanly.
const mark = () => markUserTyping(provider.document);

// observers.stress.s2.test.ts, observers.stress.s4.test.ts, observers.fuzz.test.ts
// Replace all `markUserTyping()` with `markUserTyping(doc)` — `doc` is already in scope per test.
// Also remove `import { __resetCoordinationState } from '../../src/editor/observers'` and
// the `beforeEach(() => __resetCoordinationState())` hook.

// observers.test.ts — dynamic imports
const { markUserTyping } = await import('./observers');
markUserTyping(doc);  // was: markUserTyping()
```

**Note on SourceEditor.tsx:** Unlike `TiptapEditor.tsx`, the source-mode editor does NOT call `markUserTyping`. Source-mode typing flows user input directly into Y.Text; Observer B (Text→Tree) is synchronizing the user's own input in that case, not racing against it. Observer B's typing-defer window is specific to the WYSIWYG→Source direction and must remain so. This is a deliberate asymmetry, not an oversight.

**Why this is one commit, not two:** Splitting the signature change from the caller updates would leave an intermediate state where the code doesn't typecheck. One atomic commit maintains a green build.

**Validation:** Full stress suite (especially S2, S4 which exercise typing-defer) passes; 10/10 reliability across the integration + stress suite; manual browser verification of typing-defer behavior in WYSIWYG↔Source mode before merging.

#### Commit 6: test: enable `test.concurrent()` in integration tests

**Support confirmed:** bun 2026 supports `test.concurrent()` per the [official docs](https://bun.com/docs/test) and [Test.concurrentIf reference](https://bun.com/reference/bun/test/Test/concurrentIf). Per-test opt-in works without the `--concurrent` flag. No spike required.

**Files touched:**
- `packages/app/tests/integration/bridge-matrix.test.ts` — replace `test(` with `test.concurrent(` in W1-W4 describes
- `packages/app/tests/integration/conversion-fidelity.test.ts` — same for markdown/tree/observer/full-stack round-trip sections (NOT disk section — filesystem contention risk under very high concurrency)

**What's safe to parallelize:**
- Tests that create their own Y.Doc and cleanup — safe (per-doc WeakMap handles coordination state)
- Tests that share the integration server but use per-test docName — safe (Commit 3)
- Tests that don't touch file system — safe (Commits 3 + 5)

**What's NOT safe:**
- The initial sync test (depends on server state being empty)
- The test-reset isolation test (tests the shared-state behavior explicitly)
- Disk round-trip tests if the shared tmpdir has file-watcher contention under high concurrency — keep sequential out of caution

**Validation:** 10/10 reliability with concurrent mode enabled. If any flakes appear, revert the concurrent flag on the problematic tests and investigate whether the flake is a real latent bug.

#### Commit 7: docs: update CLAUDE.md Testing + Concurrent Development + Known Pitfalls

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
| D12 | `test.concurrent()` enablement is Commit 6. bun support verified via docs — no longer conditional. | Technical | LOCKED | HIGH | 2026-04-10 |
| D13 | `/api/test-reset` defaults to `'test-doc'` for Playwright backward compat; harness passes explicit docName | Technical | LOCKED | HIGH | 2026-04-10 |
| D14 | Commits 3 and 5 are atomic (all call sites updated in one commit) to maintain green build through history | Technical | LOCKED | HIGH | 2026-04-10 |
| D15 | CI workflow uses `fail-fast: false` to surface all failing shards | Technical | LOCKED | HIGH | 2026-04-10 |
| D16 | GitHub Actions cache for `bun install` and Playwright browsers is included from day one | Operational | LOCKED | HIGH | 2026-04-10 |
| D17 | No `check:agent` thin-gate script — measured warm check is already fast enough | Technical | LOCKED | HIGH | 2026-04-10 |
| D18 | R7 (observer race during rapid mode toggles) is only partially addressed by Commit 5; complete fix requires observer lifecycle rework and is out of scope | Scope | LOCKED | HIGH | 2026-04-10 |

## 12) Open questions

| ID | Question | Type | Priority | Status |
|----|----------|------|----------|--------|
| OQ1 | Does `bun test` actually support `test.concurrent()` at production quality? | Technical | P0 | **RESOLVED** — bun 2026 supports `test.concurrent()` (per-test opt-in) and `--concurrent` (file-global), with `--max-concurrency` limits. Verified via [bun.com/docs/test](https://bun.com/docs/test) and [Test.concurrentIf reference](https://bun.com/reference/bun/test/Test/concurrentIf). Commit 6 is confirmed supported. |
| OQ2 | GitHub Actions billing cost — is 7 matrix jobs per PR acceptable? | Operational | P1 | OPEN — estimated 7 jobs × ~2 min runtime = ~14 runner-minutes per PR. Confirm with billing dashboard. |
| OQ3 | Does the S5/S6 shard actually fit in ≤3 min after sharding? | Technical | P1 | OPEN — measure after Commit 1 lands; rebalance if needed. |
| OQ4 | Does `AgentSessionManager.closeAll()` already accept a docName, or do we need to extend the signature? | Technical | P1 | OPEN — read `agent-sessions.ts` during Commit 3 implementation. |
| OQ5 | Does `hocuspocus-plugin.ts` get re-imported on Vite HMR with env vars re-evaluated, or is `CONTENT_DIR` baked at first import? | Technical | P0 for Commit 4 | OPEN — verify that setting `OK_TEST_CONTENT_DIR` before Playwright starts the webServer is honored. Fallback plan: read the env var lazily on every request if HMR causes issues. |
| OQ6 | Does Playwright `webServer.env` propagate env vars to the child `bun run dev` process? | Technical | P0 for Commit 4 | OPEN — verify against current Playwright docs; mitigation is to set the env var before invoking Playwright if `webServer.env` is unreliable. |
| OQ7 | Does `bun run dev` correctly read `realpathSync` from a macOS `/var → /private/var`-style tmpdir path, matching the Hocuspocus `pathToDocName` resolution? | Technical | P1 for Commit 4 | OPEN — the integration harness already handles this via `realpathSync(mkdtempSync(...))`; mirror the pattern in the plugin. |

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

## 14) Risks / unknowns

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | Per-doc coordination state (Commit 5) regresses production observer typing-defer behavior | LOW | HIGH — users' typing gets stomped by agent writes | Full stress suite (S2, S4) exercises the typing-defer window; 10/10 reliability required; manual browser verification before merging |
| R2 | `bun test.concurrent()` has latent bugs that flake tests (Commit 6) | LOW (support confirmed; impl quality unknown) | LOW — reverting Commit 6 leaves Commits 1-5 intact | Validate with 10/10 before accepting; revert the flag per-file if issues arise |
| R3 | CI matrix uneven runtime — one shard dominates and blocks others | MEDIUM | LOW | `fail-fast: false` ensures other shards complete; rebalance S5/S6 if it exceeds 3 min |
| R4 | Per-test docName leaks memory if `cleanup()` doesn't properly unload the doc | MEDIUM | MEDIUM — long test runs grow heap | R9 requires unload in cleanup; validate with a 100-iteration soak test |
| R5 | `test.concurrent()` exposes a previously-latent race in production code | LOW | HIGH — unknown bug revealed | Treat any flake from Commit 6 as a real bug; investigate, don't just revert |
| R6 | `/api/test-reset` parameterization breaks Playwright tests that hardcode 'test-doc' | LOW | LOW | Default preserves backward compat; Playwright tests don't pass docName |
| R7 | GitHub Actions cache hits are lower than expected, CI runs don't speed up | LOW | LOW | Caching is additive optimization; baseline still parallelizes |
| ~~R8~~ | ~~bun doesn't support `test.concurrent()` at all~~ | N/A | N/A | **RESOLVED** — bun 2026 supports `test.concurrent()` per official docs. Risk closed. |
| R9 | `OK_TEST_CONTENT_DIR` env var is not honored by Vite HMR re-imports (OQ5) | MEDIUM | MEDIUM — Playwright content dir isolation silently falls back to `packages/content/` | Log the resolved content dir on startup so regressions are visible; add a Playwright pre-flight that curl-tests `/api/health` and asserts the expected content dir |
| R10 | Commit 4 introduces an import-time side effect into `hocuspocus-plugin.ts` that surprises downstream consumers of the plugin | LOW | LOW | The env-var read is gated; default behavior is unchanged |
| R11 | Two concurrent bun processes in the same worktree collide on turbo cache writes (R12 validation fails) | LOW | MEDIUM | Turbo claims internal locking; if R12 flakes, switch concurrent runs to target files directly with `bun test` (bypassing turbo) |

## 15) Future work

### Identified (scoped but not this PR)

- **Playwright per-test docName via URL routing.** Requires adding `?doc=<uuid>` routing to the React app. Separate spec. NG5.
- **Shared `mdManager`/`schema` canonicalization.** Strictly-better refactor deferred per D10. Own PR, driven by code hygiene not test isolation.
- **Complete fix for R7 (observer race during rapid mode toggles).** Commit 5 is a partial fix. The complete fix requires observer lifecycle management (pause observers on the inactive mode, resume on mode toggle). Design change to `TiptapEditor` + `SourceEditor` — out of scope here.
- **Multi-doc-per-process dev server.** Production architecture is ready after Commit 5. UI-level support (routing, switching between docs in one browser tab) is a separate feature.
- **Concurrent Vite dev servers with isolated content dirs.** Commit 4 ships the env-var hook; the "two humans dev-serving the same worktree" flow could be formalized with a `bun run dev:alt` script that sets `OK_TEST_CONTENT_DIR` automatically. NG8.
- **Turbo per-file content hashing.** Tooling complexity too high today; revisit if turbo adds first-party support.

### Noted (not a spec, just flagged for future consideration)

- **`writeTracker` cleanup remains correct-by-accident.** Content-addressed hashing works under concurrent writers today, but the design rationale is not documented in the module. Adding a comment-only PR that explains the invariant would reduce future confusion without crossing either filter gate.
- **Per-test tmpdir in addition to per-test docName** would fully isolate file system state even under pathological concurrent file-watcher events. Not needed today because per-test docName + per-server `mkdtempSync` is sufficient.
- **Architectural dual-observer approach questions** (from session discussion) are tracked separately — they are not blocking this PR and do not fit either filter gate in their current form.

## 16) Commit sequence within the PR

| # | Commit | Files touched | Validation |
|---|---|---|---|
| 1 | `test: split observers.stress.test.ts into 4 scenario-group files` | 4 new stress files, old file deleted, `test:stress` script updated | Each new file runs independently; all 32 tests present and passing; 10/10 reliability per file |
| 2 | `ci: add test workflow + check:full script` | `.github/workflows/test.yml`, root `package.json`, `packages/app/package.json` | CI workflow validates on this branch's first push |
| 3 | `test(harness): per-test docName isolation + parameterized /api/test-reset` | `test-harness.ts`, `bridge-matrix.test.ts`, `conversion-fidelity.test.ts`, `api-extension.ts`, maybe `agent-sessions.ts` | 10/10 reliability on migrated tests; R12 multi-process validation; typecheck + lint green |
| 4 | `feat(dev-server): Playwright content dir isolation via OK_TEST_CONTENT_DIR` | `hocuspocus-plugin.ts`, `playwright.config.ts`, `tests/stress/global-setup.ts` (new), `tests/stress/global-teardown.ts` (new) | `bun run dev` + `bun run test:stress:e2e` run concurrently in the same worktree, both pass; plugin startup log confirms resolved content dir; `/tmp/ok-playwright-*` is removed after the run |
| 5 | `feat(observers): per-doc coordination state via WeakMap` | `observers.ts`, `TiptapEditor.tsx`, 4 split stress files, `observers.fuzz.test.ts`, `observers.test.ts` (NOT `SourceEditor.tsx` — it doesn't call `markUserTyping`) | Full stress + integration suite passes; 10/10 reliability; manual browser verification of typing-defer behavior in WYSIWYG↔Source mode |
| 6 | `test: enable test.concurrent() in integration tests` | `bridge-matrix.test.ts`, `conversion-fidelity.test.ts` (non-disk sections) | 10/10 reliability in concurrent mode. bun support confirmed — no longer a stretch goal. |
| 7 | `docs: update CLAUDE.md Testing + Concurrent Development + Known Pitfalls` | `CLAUDE.md` | Manual review; ensure obsolete references to `__resetCoordinationState` and "turn off dev server" pitfalls are removed |

**Rollback plan:** Commits 1, 2, 6, 7 can be reverted independently. Commit 3 and Commit 5 depend on each other for intra-file parallelism correctness but can be reverted independently of each other. Commit 4 can be reverted independently; reverting it restores the "turn off dev server" precondition.

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
- `packages/app/playwright.config.ts` — wire `globalSetup`/`globalTeardown`
- `packages/app/tests/stress/global-setup.ts` — NEW — `mkdtempSync` and export path via `process.env.OK_TEST_CONTENT_DIR`
- `packages/app/tests/stress/global-teardown.ts` — NEW — `rmSync` the tmpdir
- `package.json` (root) — add `check:full` script
- `packages/app/package.json` — update `test:stress` glob for split files
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
- `mdManager`/`schema` canonicalization — OUT (D10, NG4)
- Complete R7 fix (observer lifecycle rework) — OUT (D18, NG10)

### STOP_IF
- `bun test.concurrent()` produces flakes that aren't explained by a real bug → skip Commit 6, document in future work
- Commit 5 (per-doc coordination state) breaks existing stress S2/S4 tests that can't be fixed by updating callers → pause, understand the semantic, re-spec if needed
- `/api/test-reset` parameterization breaks Playwright tests → Playwright keeps using the default 'test-doc' path; revisit
- 10/10 reliability fails post-migration on bridge-matrix, conversion-fidelity, or R12 multi-process validation → halt, diagnose root cause before proceeding
- Commit 4 (Playwright content dir env var) can't be made to work reliably with Vite HMR / Playwright webServer env propagation → fall back to documenting the precondition in CLAUDE.md; don't ship a half-working isolation

### ASK_FIRST
- Any production code change beyond `observers.ts`, `SourceEditor.tsx`, `TiptapEditor.tsx`, `hocuspocus-plugin.ts` (e.g., `file-watcher.ts`, `persistence.ts`, `standalone.ts`) — scope creep alarm
- Any case where `test.concurrent()` turns out to be a fragile or unreliable abstraction in practice (despite the docs confirming support) — escalate rather than push through
- Any change to `packages/core/` or `packages/cli/` — out of scope
