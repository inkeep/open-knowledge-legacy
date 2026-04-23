# Per-worker shadow-repo + git support in the test harness — Spec

**Status:** Approved — ready for implementation
**Owner(s):** Miles (server package)
**Last updated:** 2026-04-23
**Baseline commit:** 8d0f423d
**Links:**
- Evidence: `./evidence/` (spec-local findings — `worldmodel.md`, `projectdir-couplings.md`)
- Process history: `./meta/_changelog.md`
- Prior spec this completes: `specs/2026-04-21-shadow-repo-single-mode/SPEC.md`
- Tracking: (to be filed post-ship)

---

## 1) Problem statement

**Situation.** The Playwright E2E harness at `packages/app/tests/stress/_helpers/fixtures.ts:196-245` spawns one `bun run dev` per worker, each with a tmpdir passed via `OK_TEST_CONTENT_DIR`. The Vite dev plugin at `packages/app/src/server/hocuspocus-plugin.ts:146-163` reads that env var as "test isolation" and skips BOTH `runDevShadowInit` AND sets `gitEnabled: false` on persistence. The in-code rationale is narrow — persistence's `git add <contentRoot>` fails against external tmpdir paths — but the guard over-applies, disabling the shadow repo entirely even though the shadow-repo locks are already per-directory (`<shadowDir>/lock`, `<contentDir>/.open-knowledge/server.lock`, both `pid`+`hostname` gated).

The Tier 1 integration harness at `packages/app/tests/integration/test-harness.ts:127` is half-wired: it calls `ensureProjectGit(contentDir)` (added by SPEC 2026-04-21-shadow-repo-single-mode) but then passes `gitEnabled: false`, so every fresh tmpdir has a real `.git/` that persistence is told to ignore. `packages/app/tests/integration/persistence-fan-out.test.ts` hand-forks the harness to get shadow back — duplication that IS the signal that the harness is the wrong shape. (A sibling server-tier unit test exists at `packages/server/src/persistence-fan-out.test.ts` — **deliberately independent** of the app-integration harness, stays out of scope.)

**Complication.** Three forces compound:
1. Every feature built on the shadow-repo layer — timeline panel, Save Version, rollback, branch-switch UX, classified-writer attribution, external-change reconciliation, commit-subject prefix scheme, `ok-actor:` body, agent-change-notes — is uncoverable by automated tests because the test server has no shadow repo. Open PRs #277 (Miles, agent-change-notes), #268 (Andrew, agent-write-summaries), #186 (Mike, graph-demo time-travel) all layer features on this substrate with no automated gate.
2. The workaround is delete-or-skip: PR #269's T5 test was first skipped when `/api/history` returned "History unavailable" under `OK_TEST_CONTENT_DIR` (the test was later deleted during an unrelated D9 design reversal, but the skip was the shadow-gap workaround this spec addresses). Manual-QA fallback is slow and easy to forget.
3. Per `/tdd` principles, `gitEnabled: false` is mocking an OK-owned internal module — an anti-pattern that means coverage tests against a non-production topology. Greenfield directive is explicit: no deferred tech debt.

**Resolution.** **Reopens SPEC 2026-04-21-shadow-repo-single-mode Q3** (which closed with "No harness change needed" — invalidated by audit finding F1: only 1/38 Tier 1 tests actually asserts shadow, plus three dependent PRs in flight and the T5 skip in PR #269). Flip the guard with **tier-appropriate defaults**: Playwright workers (via the dev plugin) run `ensureProjectGit(tmpdir) → initShadowRepo(tmpdir)` + `gitEnabled: true` by default (full-app topology matches production); Tier 1 integration tests via `createTestServer()` stay shadow-off by default, opt in via `{ withShadow: true }` (1 test does today; harness doesn't force 37 others to pay the cost). Seal the seven coupled `projectDir` leaks in `hocuspocus-plugin.ts` via a single module-level `projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT` binding threaded through all seven sites (D12). Broaden fail-fast to ALL shadow-init errors under isolation (D13). Surgical, not architectural — PR #270's dev-plugin / `createServer` unification remains out of scope (D1); that's a separate future spec.

## 2) Goals
- **G1:** Automated test coverage for history-adjacent features — timeline, Save Version, rollback, branch-switch UX, classified-writer attribution, external-change reconciliation — can be written without delete-or-skip workarounds or hand-forked harnesses.
- **G2:** Per-worker content isolation (the #212 / #38 intent) is preserved — no cross-worker state bleed through the shadow repo, the backlink cache, the server lock metadata, or the branch-name read.
- **G3:** No customer-visible behavior change; no CI runner config change; no regression in CI tier-1 green rate (SPEC 2026-04-19 G1 ≥95%).
- **G4:** The dev-plugin / `createServer()` divergence is not widened. Leaves a clean seam for PR #270's follow-on to converge the two entry points later (D1).

## 3) Non-goals
- **[NEVER] NG1:** Remove or weaken per-worker content isolation. Reverting #212/#38 intent is fundamentally misaligned.
- **[NEVER] NG2:** Turn the shadow-repo into a mock-friendly surface (e.g. inject a fake git). Mocking internal collaborators is the anti-pattern this spec corrects.
- **[NOT NOW] NG3:** Absorb PR #270's "unify dev-plugin + createServer" refactor into this spec (D1). — Revisit if: the unification ships and invalidates this spec's guard-flip location.
- **[NOT UNLESS] NG4:** Retroactively rewrite prior E2E tests that were deleted or skipped because of this gap (notably PR #269 T5). — Only if: the team consciously wants regression coverage for a specific prior feature; otherwise net-new tests for current features (T4 rollback, T5 TimelinePanel render in downstream work) are the higher-value path.
- **[NEVER] NG5:** Fall back to degraded mode on missing `git` binary under isolation. Aligns with SPEC 2026-04-21 R6: "does NOT fall back to a standalone shadow." The `ProjectGitInitError` branch of `handleDevShadowInitError` still fail-fasts (D6). Non-`ProjectGitInitError` shadow-init failures (EEXIST / disk full / corrupt git) retain the existing warn-and-continue behavior unless R2 is accepted — see §11.
- **[NOT NOW] NG6:** T4 (rollback end-to-end) + T5 (TimelinePanel UI render) smoke tests. Harness must support them; shipping them is downstream feature work (D8).

## 4) Personas / consumers
- **P1 — Engineer shipping a history-adjacent feature.** Today: cannot write a passing Playwright test for timeline/attribution/reconciliation UX. Falls back to manual QA on local dev. After: writes standard Playwright E2E with real shadow commits.
- **P2 — Engineer investigating a history-layer bug.** Today: cannot reproduce in CI; must reproduce locally against the dev's own OK repo. After: files a repro as a regular integration test.
- **P3 — CI itself.** Today: silently passes on history-adjacent code paths because the code paths aren't exercised. After: catches regressions in timeline / attribution / reconciliation / Save Version at PR-time.

Primary DRI: Miles (server package; author of the timeline stack — PRs #39, #122, #134, #166 — and currently shipping PR #277 on top of it).

## 5) User journeys

The "user" is an engineer authoring a test.

**Happy path — Playwright feature test (e.g. timeline UI render):**
1. Write a Playwright test that uses the existing `{ page, api }` fixture.
2. Call `api.writeAsAgent(...)` to drive an agent write.
3. Navigate to TimelinePanel; assert rendered row count / writer display name / commit subject.
4. Test runs: `bun run test:e2e`. Passes/fails based on real shadow commits.

Today: step 3 fails because TimelinePanel renders "No history yet" (no shadow commits exist).

**Happy path — Tier 1 integration test (e.g. classified-writer attribution):**
1. Call `const server = await createTestServer();` — shadow enabled by default.
2. Call `POST /api/agent-write-md` with a test identity.
3. `const commits = await simpleGit(server.shadowDir).log({ '--all': null });`
4. Assert `refs/wip/main/agent-<connId>` exists with `wip:` subject and valid `ok-actor:` body.

Today: hand-fork `persistence-fan-out.test.ts` pattern — manually call `initShadowRepo`, manually pass `shadowRepo` to `createServer`.

**Happy path — Tier 1 integration test that deliberately skips shadow (e.g. bridge-only unit-style):**
1. `const server = await createTestServer();` — no opt-in; shadow stays off (default).
2. Same harness surface, no shadow — shaves ~50-200ms per test.
3. `symlink-alias.test.ts` and `provider-pool-reconnect.test.ts` migrate here.

**Failure / recovery path — missing `git` binary:**
- `ensureProjectGit(tmpdir)` throws `ProjectGitInitError`.
- Dev plugin's `handleDevShadowInitError` logs + calls `exit(1)` (R6 fail-fast, unchanged from SPEC 2026-04-21).
- Playwright fixture's `waitForServerReady` times out; `killGracefully` + `rmSync(contentDir)` on the worker.
- Worker fails with clear error. CI run fails loud. No silent coverage loss (D6).

**Debug experience:**
- Shadow commits observable via `simpleGit(shadowDir).log(...)` inside any integration test.
- HTTP API surface (`/api/timeline`, `/api/save-version` response) works unchanged.
- Existing structured logs (`[persistence]`, `[shadow-lock]`, `[dev]`) work under isolation. No new log schemas.

### Interaction state matrix

| Surface / Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `createTestServer()` default (shadow off, per D2) | server boot (no git init) | n/a | server boot failure (rare) | `server.ready` resolves, `gitEnabled: false`, `shadowRepo: undefined` | N/A |
| `createTestServer({ withShadow: true })` opt-in | `ensureProjectGit` + `initShadowRepo` in flight | Fresh shadow, no commits | `ProjectGitInitError` or any shadow-init throw → test fails loud (D13) | `server.ready` resolves with `shadowDir` exposed | N/A |
| Playwright worker boot | `bun run dev` starting | tmpdir + fresh `.git/` | `waitForServerReady` timeout | `/` responds 200 | N/A |
| Cross-worker concurrency | 4 workers booting in parallel | n/a | lock collision (must not happen) | 4 independent shadows + locks | One worker fails ready probe |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR1 — Default shadow in Playwright.** When a Playwright worker spawns with `OK_TEST_CONTENT_DIR`, the dev plugin initializes a per-worker shadow repo at `<tmpdir>/.git/open-knowledge/` and sets `gitEnabled: true`. | Playwright test can call `fetch('/api/agent-write-md', ...)` + `simpleGit(shadowDir).log({ '--all': null })` and observe `refs/wip/main/agent-<connId>` with valid `wip:` subject. | Dev plugin change only; Playwright fixture API unchanged. |
| Must | **FR2 — Tier-appropriate Tier 1 default (D2 amended).** `createTestServer()` (no args) returns a server with `gitEnabled: false` and `shadowRepo: undefined` — preserves pre-spec behavior for the 37/38 shadow-orthogonal Tier 1 tests. `createTestServer({ withShadow: true })` is the opt-in for tests asserting `refs/wip/*`, checkpoints, timeline, attribution, reconciliation. | (a) `await createTestServer()` returns a working server with no shadow init; shadow-orthogonal tests unaffected. (b) `await createTestServer({ withShadow: true })` + an agent-write + `simpleGit(server.shadowDir).log({ '--all': null })` shows the expected `refs/wip/…` ref. | `test-harness.ts:127` keeps `gitEnabled: false` as the implicit default; `withShadow: true` flips to `gitEnabled: true` + `shadowRepo: handle` internally. |
| Must | **FR3 — Clean up redundant test-level opt-outs.** Under the R3 opt-in design (D2), tests that don't opt in are already shadow-off by default — so `symlink-alias.test.ts:44` and `provider-pool-reconnect.test.ts:74` delete their inline `gitEnabled: false` line (now redundant). | Both files post-migration pass `bun run test:integration`; no behavior change. Zero `gitEnabled: false` references remain in the Tier 1 integration directory except inside `createTestServer` itself. | Fewer test-level flags to reason about; only the sites that actually opt into shadow (`withShadow: true`) carry an explicit flag. |
| Must | **FR4 — `projectDir` consistency (D12).** Under `isTestIsolated`, ALL `PROJECT_ROOT`-derived bindings in `hocuspocus-plugin.ts` resolve against `CONTENT_DIR` via a **single module-level binding** `const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT` threaded through seven sites (see D12 + `evidence/projectdir-couplings.md`). Production path (parent repo) unchanged. | Playwright worker test: (a) backlink cache at `<tmpdir>/.open-knowledge/cache/…`, not `PROJECT_ROOT`; (b) WIP refs branch under `main`, not dev's current branch; (c) server-lock metadata points at tmpdir; (d) `/api/save-version` (FR8 T2) creates zero `ok/v*` tags and zero commits in the developer's OK repo — verified by `git status` + `git tag -l 'ok/v*'` after running the full Tier 1 suite + Playwright test:e2e locally. Evidence in `evidence/projectdir-couplings.md`. | Supersedes the earlier D3+D4+Q7 decomposition. |
| Must | **FR5 — Fail-fast on ALL shadow-init errors under isolation (D13).** Under `isTestIsolated`, `handleDevShadowInitError` calls `process.exit(1)` on any throw from `runDevShadowInit` — `ProjectGitInitError` (missing `git`), EEXIST race, disk full, lock collision, corrupt `.git/`, simple-git subprocess OOM. Production path retains the existing degraded-warn branch for non-`ProjectGitInitError`. | (a) Manual test: strip `git` from PATH, spawn a worker, worker exits non-zero. (b) Stub `initShadowRepo` to throw a generic `Error`, spawn a worker, worker exits non-zero (not silent). | No new error surface in production; reuses SPEC 2026-04-21 R6 fail-fast for the `git`-missing case and broadens test-path coverage for D13. |
| Should | **FR6 — `packages/app/tests/integration/persistence-fan-out.test.ts` migration.** Test migrates from hand-forked `initShadowRepo` + `shadowRepo: historyHandle` to `createTestServer({ withShadow: true })`. Nested-dir `projectDir`/`contentDir` coverage **is preserved at the server-tier sibling** `packages/server/src/persistence-fan-out.test.ts:35-43` (closed S1 — no harness option required). | Hand-fork boot code deleted; test still passes; commit log shows assertion targets unchanged. `clearContributors` → `swapContributors` migration (Auditor F5) lands in the same PR. | D7 LOCKED. |
| Should | **FR7 — Auto-wire contributor-tracker cleanup.** When shadow is enabled in Tier 1 integration, `createTestServer` auto-runs `swapContributors()` (atomic drain, preferred API; `clearContributors()` is `@deprecated` per `contributor-tracker.ts:192-197`) in setup/teardown so per-test module state doesn't leak. | Concurrent tests with different writers don't observe each other's contributors. Test running twice produces stable output. | Q11 DIRECTED; implementer picks exact lifecycle hook. Server-tier reference pattern: `packages/server/src/persistence-fan-out.test.ts` already uses `swapContributors`. |
| Must | **FR8 — T1-T6 acceptance tests ship with this spec (D14).** Each uses `createTestServer({ withShadow: true })`. (T1) Agent write → `refs/wip/main/agent-<connId>` + `wip:` subject via `simpleGit(server.shadowDir).log`. (T2) Save Version → `refs/checkpoints/<n>` + parent-repo commit + tag. (T3) External disk write → `refs/wip/main/file-system` + `reconcile:` subject. (T6) Agent write → `GET /api/history?docName=...` response includes the commit SHA from T1's assertion set. | All four tests pass in `bun run test:integration`. T1 (write side, simpleGit) + T6 (read side, HTTP) together prove the harness works end-to-end. | Proves harness covers the three primary write-surfaces + the primary read surface. D8 + D14 anchor acceptance here. T4 (rollback E2E) + T5 (TimelinePanel UI render) remain NG6 — downstream feature tests. |

### Non-functional requirements

- **Performance:** Shadow init < 500ms per worker (per SPEC 2026-04-21 Q3 estimate ~100-200ms for `ensureProjectGit` + `initShadowRepo`). Per-drain `commit-tree` ~10-30ms. Tier 1 aggregate: SPEC 2026-04-21 Q3 cited ~5-10s across "~50 tests"; current count is 38 integration files / 223 `test(...)` blocks (measured 2026-04-22). Not every test invokes `createTestServer`, so actual aggregate depends on the subset — extrapolated upper bound ~20-40s if every test booted shadow, realistic subset likely 15-25s. A3 (< 500ms per worker) remains the operational bound. Playwright fixture timeout (60s) unchanged.
- **Reliability:** Per-worker shadow-repo init must not introduce new flake classes. Targets SPEC 2026-04-19 G1 (≥95% PR-tier green on correct code). New failure modes: enumerated in §9 Failure modes table below; each deterministic.
- **Security/privacy:** No change — tmpdirs are already per-worker and untrusted; shadow repo lives inside tmpdir.
- **Operability:** Existing structured logs (`[persistence]`, `[shadow-lock]`, `[dev]`, `[file-watcher]`) continue to work under isolation. No new log schemas. Shadow state observable via `simpleGit(shadowDir).log(...)` in tests — same pattern as `persistence-fan-out.test.ts`.
- **Cost:** CI runner time impact: ~5-10s Tier 1; ~400ms-2s Playwright (4 workers × ~100-500ms shadow init). No new runner config.

## 7) Success metrics & instrumentation
- **M1 — Coverage of history-adjacent surfaces.** Baseline: 0 automated tests. Target post-ship: FR8 T1-T3 land (3 tests); per SPEC acceptance. M1 validates G1.
- **M2 — Delete-or-skip workarounds.** Baseline: 1 this month (T5 in PR #269). Target: 0 going forward. M2 validates G1 indirectly (no new carve-outs appear).
- **M3 — CI green rate stability.** Baseline: current PR-tier green rate on `main`. Target: within noise of baseline after shadow-per-worker lands (no new flake class). M3 validates G3 + NFR reliability.
- **M4 — Hand-fork test count.** Baseline: 1 (`persistence-fan-out.test.ts`). Target: 0 (FR6 migration deletes it). M4 validates G1 structurally.
- **Instrumentation:** Existing structured logs suffice. No new telemetry.

## 8) Current state (how it works today)

- **Playwright tier:** worker boots with `OK_TEST_CONTENT_DIR` → dev plugin detects `isTestIsolated` → skips `runDevShadowInit`, sets `gitEnabled: false`. No shadow on disk. TimelinePanel renders "No history yet" on any test navigation.
- **Tier 1 integration harness:** `test-harness.ts:119` calls `ensureProjectGit(contentDir)` (fresh `.git/` in every tmpdir) but line 127 passes `gitEnabled: false`. Half-wired. `persistence-fan-out.test.ts` hand-forks to get shadow back.
- **Three silent `projectDir` leaks** make the guard-flip unsafe without fix: BacklinkIndex cache, `getCurrentBranch` read, `worktreeRoot` diagnostic — all pass `PROJECT_ROOT` unconditionally. See `evidence/projectdir-couplings.md`.
- **Server unit tier** has mature shadow coverage via explicit `initShadowRepo` calls (`shadow-repo.test.ts`, `save-version.test.ts`, `timeline-query.test.ts`, etc.) — inheritance target for the harness design.

Full topology, lock semantics, adjacent PRs, 3P landscape, prior research references: `evidence/worldmodel.md`.

## 9) Proposed solution (vertical slice)

### User experience / surfaces
- **Test authoring (the only user-facing surface):**
  - `createTestServer()` — default is unchanged (shadow off, `gitEnabled: false`, `shadowRepo: undefined`). The 37/38 shadow-orthogonal Tier 1 tests continue working without modification.
  - `createTestServer({ withShadow: true })` — new opt-in flag. Enables shadow for tests that assert against `refs/wip/*`, checkpoints, timeline, attribution, reconciliation. `persistence-fan-out.test.ts` (FR6 migration) and FR8 T1-T3 + T6 use this.
  - Playwright fixture `workerServer` / `api` — no API change. Shadow comes transparently through the dev plugin.
- No CLI, SDK, docs-site, or end-user UX changes.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| (none) | No customer route touched | No customer-facing verification needed |
| `/api/agent-write-md` (test call) | Harness contract | Under FR2/FR3, writes produce expected shadow commits / don't produce them |
| `/api/history` (test call) | Harness contract | Post-FR8 T1, history returns non-empty for worker that did an agent-write |
| `/api/save-version` (test call) | Harness contract | Post-FR8 T2, checkpoint ref + parent-repo commit + tag all exist |

### System design

**Architecture overview.** Two code sites flip behavior; three `projectDir` leaks get sealed; one opt-out flag gets added.

```
Site 1 — Vite dev plugin (packages/app/src/server/hocuspocus-plugin.ts)

  // Single module-level binding (D12). Threaded through ALL PROJECT_ROOT consumers;
  // delete every other inline `isTestIsolated ? CONTENT_DIR : PROJECT_ROOT` ternary
  // so the wiring can't drift.
  const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT;

  // L121
  acquireServerLock(LOCK_DIR, { port: 0, worktreeRoot: projectRoot });

  // L160 — shadow init (D13 broadens error handling; production path unchanged)
  void runDevShadowInit(projectRoot, (shadow) => { shadowRef.current = shadow; },
    /* io default */, /* deps default */, { isTestIsolated });

  // L190 — contentFilter (was already gated; collapse to single binding)
  contentFilter = createContentFilter({ projectDir: projectRoot, contentDir: CONTENT_DIR, ... });

  // L196 — BacklinkIndex
  backlinkIndex = new BacklinkIndex({ projectDir: projectRoot, contentDir: CONTENT_DIR, ... });

  // L203-L213 — persistence
  createPersistenceExtension({
    projectDir: projectRoot,
    contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
    gitEnabled: true,
    shadowRef,
    getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
    ...
  });

  // L245-L250 — api-extension
  createApiExtension({
    projectDir: projectRoot,
    getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
    ...
  });

  // L275 — server-observer extension
  createServerObserverExtension({
    getCurrentBranch: () => readBranchFromHead(resolve(projectRoot, '.git')),
    ...
  });

Site 2 — Tier 1 integration harness (packages/app/tests/integration/test-harness.ts)

  export async function createTestServer(
    opts?: { keepContentDir?: boolean; withShadow?: boolean }
  ): Promise<TestServer> {
    // R3: Tier 1 default-off; explicit opt-in for the ~1/38 tests asserting shadow state.
    const withShadow = opts?.withShadow ?? false;

    // ... existing tmpdir + writeFileSync + ensureProjectGit(contentDir) ...

    let shadow: ShadowHandle | undefined;
    if (withShadow) {
      shadow = await initShadowRepo(contentDir);
    }

    const srv = createServer({
      contentDir,
      projectDir: contentDir,
      gitEnabled: withShadow,
      shadowRepo: shadow,
      ...
    });

    // FR7: atomic contributor-tracker drain when shadow enabled (swapContributors is the preferred API;
    // clearContributors is @deprecated per contributor-tracker.ts:192-197).
    if (withShadow) swapContributors();

    // ... rest unchanged ...

    return {
      ...,
      shadowDir: shadow?.gitDir,
      cleanup: async () => {
        await srv.destroy();
        if (shadow) await destroyShadowRepo(shadow);
        rmSync(contentDir, { recursive: true, force: true });
        if (withShadow) swapContributors();
      },
    };
  }

Site 3 — existing explicit sites (packages/app/tests/integration/)

  symlink-alias.test.ts:44       gitEnabled: false  → DELETE (default is now shadow-off; redundant)
  provider-pool-reconnect.test.ts:74  same
  persistence-fan-out.test.ts   → migrate to createTestServer({ withShadow: true }) (FR6)
  (NEW)  FR8 T1-T3 + T6 tests   → each uses createTestServer({ withShadow: true })
```

**Data model.** No change. Writer-IDs, commit subjects, `ok-actor:` body schema all preserved from SPEC 2026-04-21-shadow-repo-single-mode + SPEC 2026-04-18-agent-identity-attribution-foundation.

**API / transport.** No new HTTP/MCP API. One new optional test-harness parameter (`withShadow?: boolean`, default `false`).

**Auth / permissions.** No change.

**Enforcement points.**
- Dev-plugin module scope: single `projectRoot` binding from which `runDevShadowInit`, `backlinkIndex`, `persistence`, `getCurrentBranch`, and `acquireServerLock` all derive. No more scattered `PROJECT_ROOT` references under isolation.
- `createTestServer` composition: `withShadow` is read once, drives three bindings (`initShadowRepo` call, `gitEnabled`, `shadowRepo` option).

**Observability.** Existing structured logs. No new emissions. Tests observe shadow state via `simpleGit(server.shadowDir).log(...)` — same primitive `persistence-fan-out.test.ts` uses today.

#### Data flow diagram

- **Primary flow:** Test runner spawns worker → worker boots `bun run dev` (Playwright) or `createServer()` (Tier 1) → `ensureProjectGit(tmpdir)` → `initShadowRepo(tmpdir)` → `shadowRef.current` populated → persistence ready → test drives writes → L2 drain calls `commitWip(shadow, writer, ...)` → `refs/wip/<branch>/<writer-id>` visible to test via `simpleGit(shadowDir).log()`.
- **Shadow paths to test:**
  - **missing git binary:** `ensureProjectGit` throws `ProjectGitInitError` → `handleDevShadowInitError` → `exit(1)` (R6 fail-fast).
  - **empty:** test runs, doesn't write → `refs/wip/*` absent → assertions on "no commits" pass.
  - **concurrent workers:** 4 workers × 4 tmpdirs × 4 shadows × 4 locks. Each lock is at a distinct filesystem path; same-path pid+hostname gating is never reached under disjoint-directory isolation (A1). No contention possible.
  - **mid-test crash:** SIGKILL after 5s grace → shadow lock stays on disk → `rmSync(contentDir)` removes the whole subtree anyway.
  - **cross-worker backlink cache:** sealed by FR4. Before FR4: lost-update race; after: per-worker cache path.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `ensureProjectGit(tmpdir)` | `git` missing from PATH | throws `ProjectGitInitError` | `handleDevShadowInitError` → `exit(1)`; Playwright timeout + worker fail | Engineer sees R6 error + CI fail |
| `initShadowRepo(tmpdir)` | Disk full / EEXIST race | throws generic error | `handleDevShadowInitError` → degraded warn (Playwright) / rethrow (Tier 1) | Engineer sees `[dev]` warn log; test ready probe times out eventually |
| `acquireLock(shadowDir, ...)` | Residual lock from prior crash | `isProcessAlive(pid) === false` | Replace stale lock with warn (existing behavior) | Transparent |
| `commitWip` | git subprocess timeout (>30s) | `simple-git` rejects | Persistence logs `[persistence] Git commit failed` + backs off; `consecutiveGitFailures` increments | Test assertion may fail if it checks refs eagerly without the existing `flushPendingGitCommit` + `waitForPendingCommits` drain |
| `clearContributors()` missing in Tier 1 | Cross-test contributor leak | Non-deterministic assertion failure | Auto-wired in `createTestServer` (FR7) | Contained to this spec |
| `rmSync(contentDir)` on teardown | Shadow FD still open | FS race (rare) | Existing Playwright fixture handles with `force: true`; retry at process exit | Minor disk artifact, not functional |

### Alternatives considered

- **Option A — Playwright only, leave Tier 1 alone.** Rejected (D2). Would regress SPEC 2026-04-21 Q3's intent; Tier 1's `gitEnabled: false` continues to mock the internal collaborator; `persistence-fan-out.test.ts`'s hand-fork calcifies.
- **Option B — Fold into PR #270 unification.** Rejected (D1). Two separate problems sharing a boundary; folding in expands blast radius and blocks on PR #270 ship cadence.
- **Option C — Central `enableShadowForTests()` helper consumed by both harnesses.** Rejected. Adds abstraction for no benefit — the two harnesses have different shapes (dev plugin: module scope; integration: function composition). Each sets its own options cleanly.
- **Option D — Degraded fallback on missing `git`.** Rejected (D6 / NG5). Silent coverage loss; misaligned with SPEC 2026-04-21 R6.
- **Option E — Keep hand-fork of `persistence-fan-out.test.ts` as a "power user" pattern.** Rejected (D7 / FR6). Hand-fork becomes redundant once default harness supports shadow; leaving it calcifies duplication.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | PR #270's "unify dev-plugin + createServer" refactor is OUT of scope. | X | LOCKED | No | Two separate problems sharing a boundary ≠ one problem; folding in expands blast radius. | User turn 2026-04-22 Intake | Guard-flip location must leave a seam for the future unification. |
| D2 | **Tier-appropriate defaults (amended post-audit R3).** Playwright tier: shadow default-on via dev plugin (full-app topology matches production). Tier 1 integration tier: shadow default-off via `createTestServer()`; explicit `{ withShadow: true }` opt-in for tests asserting `refs/wip/*`, checkpoints, timeline, attribution, reconciliation. | X | LOCKED | No | **Reopens SPEC 2026-04-21 Q3** (closed with "No harness change needed" under the assumption shadow-off Tier 1 tests were adequate — invalidated by audit: only 1/38 Tier 1 tests actually asserts shadow state; PR #277/#268/#186 dependencies; T5 skip in PR #269). /tdd tier-selection pushes toward *tier-appropriate* defaults — narrow-integration tier tests module coordination at ONE boundary (shadow IS the boundary only when asserted); E2E tests full production topology. Uniform-default framing was expediency-shaped; split honors architectural intent. | `evidence/worldmodel.md` §2, §7b, §9 O2; SPEC 2026-04-21 Q3; challenger CF3 + auditor F1; user turn 2026-04-23 (R3 accept) | Playwright fixture API unchanged. `createTestServer()` stays shadow-off by default; `createTestServer({ withShadow: true })` opts in. FR6 migration (persistence-fan-out) + FR8 T1-T3+T6 all opt in. `symlink-alias.test.ts:44` + `provider-pool-reconnect.test.ts:74` delete their `gitEnabled: false` line (redundant under default-off). |
| D3 | `BacklinkIndex` `projectDir` gated on `isTestIsolated` in-scope. | T | LOCKED | No | Cross-worker cache race + dirty-tree artifacts in dev's OK repo; same plumbing pattern as persistence `projectDir` split. | `evidence/projectdir-couplings.md` §1; `hocuspocus-plugin.ts:195-199`; `backlink-index.ts:767` | 2-line dev-plugin change. |
| D4 | Under isolation, `getCurrentBranch` reads `CONTENT_DIR/.git`, not `PROJECT_ROOT/.git`. | T | LOCKED | No | Otherwise WIP refs land under dev's checked-out branch — environment-dependent tests. | `evidence/projectdir-couplings.md` §2; `hocuspocus-plugin.ts:208` | 1-line dev-plugin change. |
| D5 | Value dimensions = internal velocity + platform reliability. | P | LOCKED | No | User confirmation turn 2026-04-22. | — | Scope creep toward GTM/docs/onboarding out of bounds. |
| D6 | Fail-fast on missing `git` under isolation. `handleDevShadowInitError`'s `ProjectGitInitError` → `exit(1)` branch runs unchanged in test path. | T | LOCKED | No | Aligns with SPEC 2026-04-21 R6 ("does NOT fall back to a standalone shadow"). CI runners always have `git`; silent degraded mode defeats the spec's purpose. User turn 2026-04-22. | SPEC 2026-04-21 R6; `dev-shadow-init.ts:46-91`; user turn 2026-04-22 | No new error surface. |
| D7 | `persistence-fan-out.test.ts` migrates to default `createTestServer` (delete hand-fork). | T | LOCKED | No | "No deferred tech debt" directive; the hand-fork's existence IS the signal the harness was wrong shape. User turn 2026-04-22. | `persistence-fan-out.test.ts:41-90`; user turn 2026-04-22 | FR6 executes the migration. -4 lines of hand-fork boot code. |
| D8 | Acceptance criteria anchor = T1-T3 smoke tests (agent-write → WIP ref, Save Version → checkpoint, external disk write → `file-system` writer). T4 (rollback E2E) + T5 (TimelinePanel UI render) are downstream feature tests, not this spec's acceptance bar (NG6). **Amended by D14 to promote T1-T3 from Could to Must and add T6 (timeline query round-trip) as Must.** | X | LOCKED | No | Proves harness works for the three primary write surfaces without expanding scope to feature-test authoring. User turn 2026-04-22. | `evidence/worldmodel.md` §9 O11; user turn 2026-04-22 | FR8 (now Must per D14) + FR6 (persistence-fan-out migration) are the harness proof. |
| D9 | `acquireServerLock.worktreeRoot` flips to `CONTENT_DIR` under isolation. | T | DIRECTED | No | Diagnostic-only field; consistency with other `projectRoot` bindings. Low-stakes. | `evidence/projectdir-couplings.md` §3; user turn 2026-04-22 ("take your reccs") | Implementer owns detail. |
| D10 | Tier 1 harness auto-wires `swapContributors()` (preferred atomic-drain API; `clearContributors()` is `@deprecated`) in setup/teardown when shadow enabled. | T | DIRECTED | No | Avoids cross-test contributor-tracker module-state bleed. | `packages/server/src/persistence-fan-out.test.ts:15, 26, 30` uses the preferred `swapContributors`; `packages/app/tests/integration/persistence-fan-out.test.ts:19, 33, 37` uses deprecated `clearContributors` and is part of the FR6 migration. | Implementer picks exact lifecycle hook (beforeAll/afterEach/cleanup closure). |
| D11 | Existing `boot.test.ts` + `keepalive-presence-cleanup.test.ts` keep their inline `gitEnabled: false`. | T | DIRECTED | No | Those tests are about boot composition / WS lifecycle — shadow orthogonal. They don't use `createTestServer`, so the `withShadow` opt-in doesn't apply; their own inline `gitEnabled: false` stays. | `boot.test.ts:37-111`; `keepalive-presence-cleanup.test.ts:54` | No migration. |
| D12 | **Supersedes D3/D4/D9.** Collapse all `PROJECT_ROOT`-derived bindings in `hocuspocus-plugin.ts` to a **single** `const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT` declared at module scope. Thread through all seven sites: L121 `acquireServerLock.worktreeRoot`, L160 `runDevShadowInit`, L190 `contentFilter.projectDir`, L196 `BacklinkIndex.projectDir`, L208 persistence `getCurrentBranch`, L245 api-extension `getCurrentBranch`, L250 api-extension `projectDir`, L275 server-observer `getCurrentBranch`. | T | LOCKED | No | Auditor F1 + Challenger F1 both flagged that spec enumerated only 3 of 6 unconditional PROJECT_ROOT sites. L250 would write real `ok/v<N>` tags + commits to dev's OK repo on `/api/save-version` under isolation (FR8 T2). Single-binding eliminates the per-site gate pattern that keeps drifting. `evidence/projectdir-couplings.md` §1 TODO'd L250; never closed. | User turn 2026-04-22 accepted R1 recommendation | `evidence/projectdir-couplings.md` needs update to enumerate all 7 sites. FR4 AC expanded: "no `ok/v*` tags or commits appear in dev's OK repo after running Tier 1 integration or Playwright tests locally." `§16 ASK_FIRST` rule "adding a new `projectRoot`-derived binding" becomes even more important — any future PROJECT_ROOT introduction is now obviously wrong pattern. |
| D13 | **Amends D6.** Under `isTestIsolated`, `handleDevShadowInitError` fail-fasts (`exit(1)`) on ALL throws from `runDevShadowInit`, not just `ProjectGitInitError`. Thread `isTestIsolated` through helper signature. Production (non-isolated) path unchanged — retains degraded warn for operational resilience. | T | LOCKED | No | Auditor F4 + Challenger F2: D6 only exits on `ProjectGitInitError`; EEXIST / disk-full / lock-collision / corrupt-`.git/` silently degrade. Under the spec's `gitEnabled: true`, persistence L2 drain short-circuits when `shadowRef.current=undefined` → test passes but fails to produce `refs/wip/*`. NG5's "fail loud" framing is met only for the `git` binary case; broadening closes the gap. | User turn 2026-04-22 accepted R2 recommendation; `dev-shadow-init.ts:46-54` source read | Helper signature gains `{ isTestIsolated: boolean }`. Production callers pass `false`; dev-plugin passes real flag. FR5 AC broadens: "under isolation, ANY shadow-init throw produces `exit(1)` + worker failure." §9 Failure Modes row 2 updates from "degraded warn (Playwright) / rethrow (Tier 1)" to "exit(1) (both)." NG5 wording is already amended in §3 to be narrow-by-default. |
| D14 | **FR8 T1-T3 promoted from Could to Must; T6 (timeline query round-trip: agent-write → `GET /api/history` → assert commit appears) added as Must.** Four acceptance tests ship with this spec. | X | LOCKED | No | Under greenfield posture, acceptance criteria aren't optional. Tagging acceptance-bar tests as `Could` was expediency-shaped (matches the original uniform-default framing D2 corrected). Write/read test pair (T1 + T6) is the correct architectural precedent for integration-tier acceptance — T1 alone proves writes land; T6 proves reads return what writes produced. T6 would have caught R1's L245 `getCurrentBranch` leak (now fixed by D12, but T6 is regression guard for future similar classes). | Challenger S2 + user turn 2026-04-23 (S2 upgrade); user posture statement "NO DEFERRED TECH DEBT" | FR8 rows 1-3 flip `Could` → `Must`; T6 added as fourth `Must` row. §13 Next actions updates to include T6 authoring. Each test uses `createTestServer({ withShadow: true })` per D2. |
| D15 | **Reframe §1 Resolution and D2 rationale as "Q3 reopen," not "Q3 completion."** SPEC 2026-04-21-shadow-repo-single-mode's Q3 literally closed with "No harness change needed"; this spec IS a harness change. Add corrigendum breadcrumb to that spec's Q3 entry per CLAUDE.md post-ship corrigendum protocol. | X | LOCKED | No | Accuracy in breadcrumbs sets the right precedent for how the team handles spec supersession. Future reviewers reading SPEC 2026-04-21 Q3 see "no harness change needed" and would be confused without a corrigendum pointer. CLAUDE.md documents the corrigendum protocol for exactly this case. | Challenger S3 + user turn 2026-04-23 (S3 accept); CLAUDE.md "Post-ship corrigendum annotations" § | §1 Resolution rewritten. D2 rationale already amended (see above). SPEC 2026-04-21-shadow-repo-single-mode §Q3 gains breadcrumb: `<br>_[Corrected 2026-04-22 post-ship: Q3 reopened — new evidence (PR #277/#268/#186 dependencies, 1/38 Tier 1 tests actually asserts shadow) invalidated the "no harness change needed" closure. Authoritative fix in specs/2026-04-22-per-worker-shadow-repo-test-harness/]_` |

## 11) Open questions
*(All P0 OQs resolved, LOCKED, or DIRECTED. Table retained for audit cold-read.)*

| ID | Question | Type | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q3 | Shadow-repo teardown: `rmSync(contentDir)` covers `.git/open-knowledge/`? | T | P0 | No | `fixtures.ts:235, 242` — `recursive: true` handles the bare-repo subtree on both error + normal teardown paths. | Closed |
| Q4 | Fail-fast vs degraded on missing `git`. | T | P0 | — | D6 LOCKED: fail-fast. | Closed |
| Q5 | Head-watcher on tmpdir's fresh `.git/`. | T | P0 | No | `resolveGitDir(projectRoot)` at `head-watcher.ts:56-74` handles any root; fresh repo HEAD → `refs/heads/main`; no-op. | Closed |
| Q6 | Writer-lock cleanup on worker crash. | T | P0 | No | `destroyShadowRepo` handles clean exit; `rmSync` is SIGKILL failsafe. | Closed |
| Q7 | `worktreeRoot` diagnostic under isolation. | T | P0 | — | D9 DIRECTED: flip to `CONTENT_DIR`. | Closed |
| Q8 | CC1 broadcaster under shadow-enabled isolation. | T | P0 | No | Orthogonal to shadow; no change. | Closed |
| Q9 | `bootServer` vs `createServer` path. | T | P0 | No | Both harnesses use `createServer` direct. Spec doesn't touch `bootServer`. | Closed |
| Q10 | `persistence-fan-out.test.ts` migration. | T | P0 | — | D7 LOCKED: migrate to default harness. | Closed |
| Q11 | Contributor-tracker auto-clear in Tier 1. | T | P0 | — | D10 DIRECTED: auto-wire in `createTestServer` lifecycle. | Closed |
| Q12 | Which existing `gitEnabled: false` sites migrate? | T | P0 | — | D11 DIRECTED + D2 amendment: harness default stays off (tier-appropriate default under R3); `symlink-alias.test.ts` + `provider-pool-reconnect.test.ts` delete their redundant inline `gitEnabled: false` (default already off); `boot.test.ts` + `keepalive-presence-cleanup.test.ts` stay inline (don't use `createTestServer`). | Closed |
| Q13 | Acceptance criteria anchor. | X | P0 | — | D8 LOCKED: T1-T3 smoke tests; T4+T5 are downstream. | Closed |

## 11a) Audit + challenger decision reopens (2026-04-22 audit)

Audit pass by `/audit` + challenger subprocesses surfaced 11 + 7 findings. Mechanical corrections (wrong file citations, wrong endpoint name, deprecated API, stale line numbers, NG renumbering, prose tightenings) applied inline. Below are the findings that implicate existing decisions and require user judgment.

| ID | Finding | Implicates | Severity | Recommendation | Status |
|---|---|---|---|---|---|
| R1 | **PROJECT_ROOT enumeration incomplete.** Spec cites 3 fix sites (D3, D4, D9); `hocuspocus-plugin.ts` has 6 unconditional PROJECT_ROOT call sites. Three unpatched: L245 api-extension `getCurrentBranch`, L250 api-extension `projectDir` (would cause `/api/save-version` to write real commits + `ok/v<N>` tags to the dev's OK repo during local test runs), L275 server-observer `getCurrentBranch`. | D3, D4, D9, FR4, §9 Site 1 | **High** | — | **Closed — D12 LOCKED.** Single module-level `projectRoot` binding threaded through all 7 sites. D3/D4/D9 superseded. |
| R2 | **D6 fail-fast is half-enforced.** Only `ProjectGitInitError` exits; other shadow-init throws silently degrade under isolation. | D6, NG5, FR5 | **High** | — | **Closed — D13 LOCKED.** `handleDevShadowInitError` fail-fasts on ALL throws under isolation; production path unchanged. |
| R3 | Tier 1 default-off with `{ withShadow: true }` opt-in; Playwright default-on. | D2, §9 Site 2, FR2, FR3 | **High** | — | **Closed — D2 amended (tier-appropriate defaults).** Investigation surfaced effective ratio is 1/38 (not 3/38); attribution-sweep is static-analysis, mdx-extension is `.mdx`-plumbing orthogonal, only persistence-fan-out actually asserts shadow state. |
| S1 | Nested-dir `projectDir/contentDir` coverage preserved under D7 migration. | D7, FR6 | Medium | — | **Closed — no action needed.** Server-tier sibling `packages/server/src/persistence-fan-out.test.ts:35-43` already uses identical nested-dir structure (`contentRoot: 'content'`). Nested-dir invariant covered at correct tier. |
| S2 | FR8 T1-T3 promoted to `Must`; T6 (timeline query round-trip) added as `Must`. | FR8, D8 | **Must** (upgraded from Could) | — | **Closed — D14 LOCKED.** Greenfield posture rejects `Could`-tagged acceptance. Four acceptance tests ship with spec. |
| S3 | §1 Resolution + D2 rationale reframed as Q3 reopen; corrigendum added to SPEC 2026-04-21 §Q3. | §1 Resolution, D2, external spec | Medium | — | **Closed — D15 LOCKED.** Accuracy breadcrumb per CLAUDE.md corrigendum protocol. |
| S4 | PR #270 sequencing. D1 was argued on "blast radius" which doesn't survive greenfield posture. Real question: PR #270's landing ETA. | D1 | Low | Investigated 2026-04-23: PR #270 is **MERGEABLE**, not draft, 13 reviews in progress, spec finalized. Landing days. PR #270 is a FEATURE (asset embed), NOT the unification — it adds new `projectDir: baseDir` wiring to dev plugin alongside existing sites, doesn't collapse them. The unification is a separate future spec (unassigned, unwritten). | **Closed — D1 stands, reasoning corrected.** PR #270 ≠ unification. Sequencing question is merge coordination with Nick (see §15 Future Work / end-to-end interaction note), not scope-absorption. |

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `shadow-lock.ts` + `server-lock.ts` scope purely per-directory with no shared global path. | HIGH | Source confirmed (`shadow-lock.ts:1-80`, `server-lock.ts:1-80`); validated by one concurrency smoke test post-implementation. | Impl time | Active |
| A2 | `ensureProjectGit(tmpdir)` works cleanly against a freshly-created tmpdir (no `.git` exists). | HIGH | SPEC 2026-04-21 A2 already verified this; `test-harness.ts:119` calls it today and works. | Verified at SPEC 2026-04-21 | Closed |
| A3 | Per-worker shadow init adds < 500ms to worker startup. | MEDIUM | Measure locally once implementation lands. SPEC 2026-04-21 Q3 estimates ~100-200ms for `ensureProjectGit`. | Impl time | Active |
| A4 | CI runners always have `git` on PATH. | HIGH | Standard Ubuntu runner image includes git; verified by existing `ensureProjectGit` callers in production. | Verified | Closed |

## 13) In Scope (implement now)

- **Goal:** Automated test coverage for history-adjacent features unlocked at both test tiers (G1).
- **Non-goals:** See §3.
- **Requirements with acceptance criteria:** See §6 (FR1-FR8).
- **Proposed solution:** See §9.
- **Owner/DRI:** Miles (server package).
- **Next actions:**
  1. Implement dev-plugin change (Site 1 in §9 System design — single `projectRoot` binding threaded through 7 sites).
  2. Implement Tier 1 harness change (Site 2 — `withShadow?: boolean` opt-in).
  3. Migrate explicit sites (Site 3 — `packages/app/tests/integration/symlink-alias.test.ts`, `.../provider-pool-reconnect.test.ts`, `.../persistence-fan-out.test.ts`). **NOT** the server-tier sibling at `packages/server/src/persistence-fan-out.test.ts`.
  4. Add T1-T3 + T6 acceptance tests (FR8, all four Must-tier per D14).
  5. Run `bun run check:full:parallel` and `bun run test:e2e` locally against a history-sensitive scenario.
  6. PR with `evidence/projectdir-couplings.md` linked in body.
  7. **Merge-order protocol:** this spec's implementation PR merges BEFORE Nick's PR #270 when possible. If PR #270 merges first, this spec's implementer resolves rebase conflicts at rebase time (~15-30 min, low risk — see `meta/_changelog.md` 2026-04-23 topology). No pre-merge Slack handshake required; just a post-rebase check that Nick's two new `projectDir: baseDir` consumers (added in PR #270) also thread through the new `projectRoot` binding.
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** M1 (coverage count), M3 (CI green rate stability), M4 (hand-fork count → 0). No new structured logs.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Cross-worker concurrency under Playwright | Locks are per-directory (A1); each worker's tmpdir is distinct | Run `bunx playwright test --workers=4` against a shadow-sensitive test; assert no lock collisions |
| CI tier-1 green rate regression | FR4 seals the three silent `projectDir` leaks | Compare p95 CI time before/after; fail if >10% degradation |
| Developer dirty-tree artifacts | FR4 BacklinkIndex fix keeps cache in tmpdir | `git status` on OK repo after running Tier 1 tests shows no modified files in `.open-knowledge/cache/` |
| Missing `git` binary on contributor's dev machine | D6 fail-fast with clear R6 error (unchanged from SPEC 2026-04-21) | Manual: `PATH=/tmp bun run dev` exits with R6 message |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| New flake class from git-subprocess timing | Low | High | Existing `flushPendingGitCommit` + `waitForPendingCommits` primitives give tests deterministic gates; no wall-clock waits introduced | Miles |
| Cross-worker lock collision (hypothetical) | Very Low | High | A1 verified by source + one concurrency smoke test; locks scope per-directory | Miles |
| `packages/app/tests/integration/persistence-fan-out.test.ts` migration regresses coverage | Low | Medium | Before/after: same assertion targets, same commits; diff-reviewed. Challenge finding CF6 flags nested-`projectDir`/`contentDir` coverage risk — see §11 S1. | Miles |
| Developer's OK repo shows dirty `.open-knowledge/cache/` | Low→Zero | Low | FR4 seals the leak | Miles |
| Tier 1 `+5-10s` overhead trips CI-time alert | Low | Medium | Already pre-accepted by SPEC 2026-04-21 Q3 closure (~5-10s, "no harness change needed"); budget is 15-minute Tier 1 | Andrew (CI), Miles |
| Tier 1 test author forgets `{ withShadow: true }` and writes a test that silently fails to produce shadow commits | Low | Medium | Heuristic documented in `createTestServer` JSDoc: "opt in when your assertions touch `refs/wip/*`, checkpoints, `/api/history`, or writer-ID attribution." Grep-testable: `persistence-fan-out.test.ts` is the reference pattern. Under R3's opt-in design, the failure is loud at assertion time (ref doesn't exist) rather than silent — preferred failure mode over default-on's cost-without-benefit for 37 tests. | Miles |

## 15) Future Work

### Identified

- **`dev-plugin ↔ createServer()` unification** (NG3 / D1). **Owner: Andrew. Timing: starts after this spec merges.** Would collapse the two extension-wiring paths into one by making the dev plugin a thin wrapper around `createServer()`, deleting ~300 lines of duplicated wiring and absorbing D12's `projectRoot` binding into `createServer` options at a single call site. Migration cost for this spec's deliverables at T-C time: ~10 lines of source reshuffling (all architectural insights + tests + harness API survive; see `meta/_changelog.md` 2026-04-23 topology analysis). Triggers to revisit: if Andrew can't take it on, re-scope owner.
  - **Why owner = Andrew:** authored SPEC 2026-04-21-shadow-repo-single-mode (remove standalone), PR #281 (dev-server diagnostic) keeps him active in `hocuspocus-plugin.ts`, and the architectural-debt note about unification originates in this ownership circle. PR #270 (Nick, asset embed) is the adjacent work, not the unification owner.
- **T4 smoke test (rollback end-to-end)** (NG6). Next feature-level test once the harness is proven. Investigation: `/api/rollback` handler + TimelinePanel round-trip. Owner: whoever ships the next rollback-adjacent feature.
- **T5 smoke test (TimelinePanel UI render)** (NG6). Playwright-level; first consumer is Miles's PR #277 acceptance.

### Noted

- **Opt-out env var for Playwright shadow** — if a future Playwright test genuinely needs shadow off, add `OK_TEST_SKIP_SHADOW=1` env. YAGNI today.
- **Shadow repo GC under short-lived workers** — `gcShadowBranches()` is a nightly-ish concept; Playwright workers live seconds. Not a concern today; flag if a test ever needs GC assertions.
- **Multi-tier test for writer-lock contention** — one test that spawns N concurrent agents hitting the same doc and asserts N distinct `refs/wip/<branch>/agent-*` refs. Worth adding to FR8's smoke set if T1 alone doesn't feel like enough proof; defer to iterate post-ship.
- **Per-server-instance contributor-tracker** (replaces module-state `swap`/`clear`) — would make `test.concurrent()` + `withShadow: true` safe by eliminating the shared `pendingContributors` Map currently at module scope in `packages/server/src/contributor-tracker.ts`. The current constraint (serial execution per file, enforced by the STOP rule in `test-harness.ts:124-133`) is the convention-only enforcement until this lands. Natural convergence seam for the `dev-plugin ↔ createServer()` unification above — the unification wraps `createServer` at a single call site, which is the right place to hang per-instance tracker ownership. Also unblocks migrating the remaining `clearContributors` consumer at `packages/app/tests/integration/session-cleanup.test.ts:144`.

## 16) Agent constraints

- **SCOPE:** `packages/app/src/server/hocuspocus-plugin.ts`, `packages/app/tests/integration/test-harness.ts`, `packages/app/tests/integration/symlink-alias.test.ts`, `packages/app/tests/integration/provider-pool-reconnect.test.ts`, `packages/app/tests/integration/persistence-fan-out.test.ts` (the integration-tier hand-fork; NOT `packages/server/src/persistence-fan-out.test.ts` which is a sibling server-tier unit test and stays out of scope), and — for FR8 — new files in `packages/app/tests/integration/` implementing T1-T3.
- **EXCLUDE:** `packages/server/src/standalone.ts`, `packages/server/src/boot.ts`, `packages/server/src/server-observers.ts`, `packages/server/src/persistence.ts` (semantics), `packages/server/src/shadow-repo.ts`, `packages/server/src/shadow-lock.ts`, `packages/server/src/server-lock.ts`, any CRDT observer code (per SPEC 2026-04-21 §16 EXCLUDE; this spec inherits).
- **STOP_IF:** implementation would change per-worker content isolation semantics (NG1); implementation would touch shadow-lock or server-lock primitives themselves; implementation would touch CRDT observer bridge; implementation would add a new env var beyond what SPEC 2026-04-21 already exposed; implementation would route test config through a shared mutable global.
- **ASK_FIRST:** adding a new `createTestServer` option beyond `withShadow`; changing `BacklinkIndex` public API; changing `shadowRef` ownership semantics; adding a new `projectRoot`-derived binding (check `evidence/projectdir-couplings.md` first — new PROJECT_ROOT refs are obviously wrong pattern post-D12); touching `ensureProjectGit` failure branches (per D6 + D13 locked); broadening `handleDevShadowInitError`'s production path (test-path-only per D13).
