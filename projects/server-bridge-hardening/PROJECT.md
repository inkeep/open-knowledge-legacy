# Project: Harden the server / observer / disk-bridge subsystem

**Last verified:** 2026-04-11 (afternoon revision — PQ3 reframe)
**Traces to:** PR #38 `/ship` deferred scope (tmp/ship/pr-future-work.md) + origin/main audit (2026-04-11)
**Appetite:** Narrow — committed scope is the **Now** phase only (\~2.5-3 engineering days). Next/Later are tracked but not committed; re-audit when capacity or triggers warrant.
**Downstream spec:** [specs/2026-04-11-server-bridge-hardening-now/SPEC.md](../../specs/2026-04-11-server-bridge-hardening-now/SPEC.md)

---

## Strategic context

### Situation

PR #38 shipped test isolation + parallelism across the server, observer bridge, and disk-bridge subsystems. The `/review-local` + `/review-cloud` loops surfaced \~20 deferred items. A 2026-04-11 audit against origin/main (`3a5ee59`, the PR #38 merge commit) confirmed **16 findings still fully valid** on a clean tree, **4 partially resolved** (shadow-lock isolation, provider-pool test coverage, git-failure threshold alert, biome warning count), and **9 effectively closed** (evidence/audit-2026-04-11.md).

### Complication

Every remaining finding is individually deferrable — none is a hard production blocker today — but the set shares a structural property: it's the unpaid tax of having shipped a major subsystem refactor (per-doc state, per-test isolation, observer bridge hardening, Hocuspocus v4 rc.1 adoption) without yet amortizing the follow-up. The 5-probe stress test revealed an asymmetric cost structure: one regression in `external-change.ts` (zero direct test coverage) silently corrupts documents across the entire `applyExternalChange` path, while every other item has a graceful failure mode. The narrowest wedge — just adding tests for one 69-line file — closes \~80% of the data-integrity risk; the rest is leverage, not critical path.

At the same time, Miles's PR #39 (Timeline + Rollbacks) is about to land on three of the files in the broader backlog (`standalone.ts`, `hocuspocus-plugin.ts`, `api-extension.ts`), which makes any architectural refactor on those files actively wasteful until #39 merges.

### Resolution

Ship the narrow wedge now — three zero-conflict stories from three different outcome workstreams that can run end-to-end in \~2-3 engineering days — and defer everything else as Later with explicit promotion triggers. Re-audit the deferred set when (a) Miles's PR #39 merges, or (b) a subsequent subsystem change makes one of the latent items acute.

### Multi-dimensional value

**Immediate (customer → engineer/ops).** S1's tests catch silent data corruption before it reaches real markdown files on disk (engineers, indirectly user documents). S4's init-throw guarding means a broken provider surfaces as a user-visible error instead of a mysteriously frozen editor (end users). S7's CLAUDE.md codification means the next AI agent session touching the observer bridge inherits the multi-client lesson instead of re-learning it (cost per future change).

**Lateral.** S1 depends on the `file-watcher.test.ts` patterns already in place and uses the existing test harness from PR #38 — no new infrastructure. S4 shares teardown semantics with existing `provider-pool.test.ts`. S7 lives in documentation; no code dependency.

**Forward.** S1 unblocks all future `external-change.ts` refactoring — right now, any change to that file is a blind edit. S4 is the final missing piece in provider-pool fault tolerance (the rest was added in the `onSyncError` callback). S7 prevents the 40% of `/review-cloud` drift we saw during PR #38 when main's PR #43 flipped the applyUserDelta verdict.

### What we are NOT doing (bet-level non-goals)

- **Not touching files heavily modified by Miles's PR #39** (`standalone.ts`, `hocuspocus-plugin.ts`, `api-extension.ts`). \[NOT NOW — promotes when #39 merges.]
- **Not refactoring module-level mutable state** in `file-watcher.ts` or `persistence.ts`. \[NOT NOW — latent, unblocks multi-instance work which isn't on the roadmap.]
- **Not fixing the shadow-lock TOCTOU race.** \[NOT NOW — already partially mitigated via `isProcessAlive` in PR #38. Remaining race window is narrow and low-consequence.]
- **Not addressing the **`agent-flow.test.ts`** location issue.** \[NEVER in this project — pure housekeeping, zero code risk, belongs to whoever next edits it.]
- **Not upstreaming the Hocuspocus **`disconnect()`** TypeError.** \[NOT NOW — upstream bug, not our code.]

---

## Items

| ID   | Item                                                                | Type          | Priority | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------- | ------------- | -------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PQ1  | Appetite = Now phase only (3 stories, \~2-3 days)                   | Product       | P0       | Decided (Locked)   | User choice 2026-04-11. Trust the 5-probe narrow-wedge finding. Re-audit trigger: Miles's PR #39 merges OR next subsystem change makes a latent item acute.                                                                                                                                                                                                                                                                       |
| PQ2  | Decomposition axis = by beneficiary (outcome-framed)                | Product       | P0       | Decided (Locked)   | User choice 2026-04-11. Avoids technical-layer anti-pattern; accepts that delivery groupings cross file boundaries.                                                                                                                                                                                                                                                                                                               |
| PQ3  | Conflict-avoidance weight vs Miles's PR #39                         | Product       | P0       | Decided (Locked)   | **Evidence-based, not heavy.** Original "heavy" framing was empirically falsified: Miles's standalone.ts change is +1 line at line 138, zero textual overlap with our target edits. User reframe 2026-04-11 afternoon: "OK with making Miles rebase if architecturally right + evidence-based." Unblocks unification + S3 promotion. See specs/2026-04-11-server-bridge-hardening-now/evidence/pr39-conflict-surface-analysis.md. |
| TQ1  | S1 test approach: direct unit tests vs integration via test-harness | Technical     | P0       | Exploring          | Direct unit tests with a fake Hocuspocus document are cheaper, more targeted. Integration tests via test-harness exercise the full bridge. Recommendation: both — 4-5 unit tests for the handler's internal branches + 1 integration test asserting end-to-end disk→CRDT propagation. Resolve during S1 implementation.                                                                                                           |
| TQ2  | S7 codification location: CLAUDE.md vs AGENTS.md vs both            | Technical     | P0       | Exploring          | CLAUDE.md is project-level agent context (per-session). AGENTS.md documents runtime topology. Testing philosophy fits CLAUDE.md; JSDoc lives in source. Recommendation: CLAUDE.md for the lessons + source JSDoc for the triggers. Resolve during S7.                                                                                                                                                                             |
| XQ1  | S4 init-throw recovery: destroy-and-evict vs defer-to-caller        | Cross-cutting | P0       | Exploring          | Current onSyncError handles *runtime* errors. Init-time throws are a different failure mode — the provider is cached but broken. Destroy-and-evict mirrors the rest of the pool's lifecycle. Resolve during S4.                                                                                                                                                                                                                   |
| XQ2  | Re-audit trigger protocol for deferred items                        | Cross-cutting | P0       | Decided (Directed) | Re-audit when Miles's PR #39 merges (structural change in the deferred file set) OR when a subsequent subsystem change makes a latent item acute. Scope = rerun the 2026-04-11 audit methodology against current origin/main. Execution owner = whichever session picks this up next.                                                                                                                                             |
| TQ3  | Conversion-fidelity chain trim — 18s reclaim or keep                | Technical     | P2       | Parked             | Latent. Defer permanently or promote when check-run wall-clock becomes a bottleneck. Not committed in Now.                                                                                                                                                                                                                                                                                                                        |
| TQ4  | Module-level mutable state refactor (writeTracker et al.)           | Technical     | P2       | Parked             | Unblocks multi-instance server work. Promote when multi-instance work is on the roadmap. Not committed in Now.                                                                                                                                                                                                                                                                                                                    |
| TQ5  | `standalone.ts` silent-degradation signal                           | Technical     | P2       | Parked             | Deferred per PQ3. Promote when Miles's PR #39 merges. Originally flagged as Major severity — the only one in the backlog.                                                                                                                                                                                                                                                                                                         |
| TQ6  | `standalone.ts` god-function split                                  | Technical     | P2       | Parked             | Deferred per PQ3. Promote when Miles's PR #39 merges.                                                                                                                                                                                                                                                                                                                                                                             |
| TQ7  | Dev hocuspocus-plugin reconciliation-pipeline gap                   | Technical     | P2       | Parked             | Deferred per PQ3. Two paths on promotion: wire the pipeline OR document the gap. Investigation-first.                                                                                                                                                                                                                                                                                                                             |
| TQ8  | Bubble-menu markUserTyping latent gap                               | Technical     | P2       | Parked             | Promote when streaming agent writes land. No current production trigger.                                                                                                                                                                                                                                                                                                                                                          |
| TQ9  | Observer `console.log` noise                                        | Technical     | P2       | Parked             | Promote when test output drowns real signal. Gate behind DEBUG flag when addressed.                                                                                                                                                                                                                                                                                                                                               |
| TQ10 | Multi-client `afterEach wait(300)` fragility                        | Technical     | P2       | Parked             | Promote when CI flakes on it. Currently stable.                                                                                                                                                                                                                                                                                                                                                                                   |
| TQ11 | Biome warning `mirror-catalog.ts:234`                               | Technical     | P2       | Parked             | Single remaining biome warning. Fix on next unrelated PR touching that file.                                                                                                                                                                                                                                                                                                                                                      |
| TQ12 | Consecutive git failures flooding                                   | Technical     | P2       | Parked             | Now has one-shot CRITICAL alert at 3 failures (PR #38 drift). Full backoff + health endpoint is overbuild. Promote if oncall ticket surfaces.                                                                                                                                                                                                                                                                                     |
| TQ13 | `agent-flow.test.ts` at wrong architectural location                | Technical     | P2       | Parked             | Pure housekeeping. Fix on next unrelated PR touching that file.                                                                                                                                                                                                                                                                                                                                                                   |

---

## Cross-cutting concerns

**The Miles's PR #39 merge boundary** threads through six of the parked items (TQ4–TQ7, plus TQ12 indirectly). Three files — `standalone.ts`, `hocuspocus-plugin.ts`, `api-extension.ts` — are actively being modified in #39. Any architectural refactor there is wasteful until #39 merges. This is the dominant phasing constraint for Later.

**The test-harness investment from PR #38** is the leverage point for S1. The `createTestServer` + `createTestClient` + `pollUntil` pattern already handles the hard parts (per-test docName isolation, real @parcel/watcher, real Hocuspocus, content-based polling). S1 reuses it; no new infrastructure.

**The **`onSyncError`** callback added during PR #38's review loop** is the lateral surface that S4 completes. Runtime sync errors now call back (packages/app/src/editor/provider-pool.ts), but init-time throws during `setupObservers()` are still unguarded. S4 closes the symmetric gap.

:106-108

---

## Stories

### Now

**Phasing rationale (revised 2026-04-11 afternoon):** After PQ3 reframe + dual-copy finding, Now contains 5 stories instead of 3. Risk-first (S1 closes data-integrity gap + S3 closes Major-severity finding) + dependency-first (unification enables S1's simpler shape) + evidence-based conflict analysis (Miles's PR #39 has zero textual conflict — evidence/pr39-conflict-surface-analysis.md). All 5 stories are parallelizable modulo a logical commit order (S7 → unify → S1 → S3 → S4 by increasing code risk). Total budget: \~2.5-3 days. See `specs/2026-04-11-server-bridge-hardening-now/SPEC.md` for implementation-level detail.

#### U — Unify `standalone.ts applyToDoc` with `createExternalChangeHandler` (PROMOTED from NG1)

Replace `standalone.ts:177-205`'s inline `applyToDoc` function with `const applyToDoc = createExternalChangeHandler(hocuspocus);`. Collapses the drifted dual-copy that `external-change.ts` was originally extracted to prevent. \~20 line net change.

**Value.** Architecturally closes a half-finished extraction (engineer) AND enables S1 to test a single handler covering both dev-mode and CLI code paths instead of two drifted copies (platform). The drift is already active — fixing it is a forcing function, not speculative.

**Constraints.** Must preserve behavioral equivalence (existing bridge-matrix and conversion-fidelity tests pass unchanged — this is the verification oracle).

**Lateral.** Enables S1 simplification. Interacts with nothing else in this Now phase.

**Forward.** Unblocks future `external-change.ts` refactors. Makes the "extraction prevents drift" claim actually true.

**Files touched.** `packages/server/src/standalone.ts` (\~20 LOC).

---

#### S1 — Direct test coverage for the unified handler (SIMPLIFIED post-unification)

Write unit tests for `packages/server/src/external-change.ts`'s `createExternalChangeHandler` factory via a fake Hocuspocus fixture. Cover the 4 internal branches (document missing, frontmatter asymmetry, Y.Text no-op on match, transaction origin). Post-unification (U), bridge-matrix tests automatically exercise the same handler end-to-end, so no separate CLI integration test is needed.

**Value.** Closes the direct-test gap for the disk↔CRDT bridge (engineer) AND locks the frontmatter asymmetry invariant (platform) that a well-intentioned "cleanup" could silently break. Because U unifies the code paths, a single test file covers both dev-mode and CLI production.

**Constraints.** Must run after U lands so the tests describe the unified-handler code path. Scoped to the 4 named branches (encoding + concurrency are NG5).

**Lateral.** Depends on U (same PR, earlier commit).

**Forward.** Unblocks any future `external-change.ts` refactor.

**Files touched.** `packages/server/src/external-change.test.ts` (new).

---

#### S3 — Expose `server.degraded: string[]` signal (PROMOTED from Later)

Add a `degraded: string[]` field to `ServerInstance` (public type). Populate in `initAsync()` by push-on-catch in the three existing try/catch blocks (shadow repo init, file watcher, HEAD watcher). Backwards compatible — existing `await srv.ready` consumers work unchanged; new consumers can read `srv.degraded` after awaiting ready. Closes the only Major-severity finding from PR #38 review.

**Value.** Gives operators a programmatic signal that a server booted in a degraded state (ops) AND establishes the pattern for future health signals (platform) without breaking the existing `ready: Promise<void>` contract. Originally classified Major severity in PR #38 review because silent degradation = silent data integrity risk (external edits diverging from CRDT without signal).

**Constraints.** Must NOT change `ready` semantics (NG9). Must be additive to `ServerInstance` type. Must preserve existing console.error logs.

**Lateral.** Independent of U, S1, S4, S7. 1-way door on the public type.

**Forward.** Enables a follow-up CLI wiring story that warns the operator on degraded boot. Enables future dashboard / health-check integrations.

**Files touched.** `packages/server/src/standalone.ts` (type + init catches + return), `packages/server/src/standalone.test.ts` (new or extended).

---

---

#### S4 — Guard `provider-pool.ts` `setupObservers()` init-time throws

Wrap the synchronous `setupObservers()` call in `provider-pool.ts:100-108` with try/catch. On throw, destroy the provider, remove the entry from the pool, and re-throw so the caller sees the failure instead of getting a broken cached entry.

**Value.** Closes the symmetric fault-tolerance gap that PR #38's `onSyncError` callback left behind (end user) — currently, a schema mismatch or similar sync throw during init leaves a permanently-broken provider in the pool until page reload. Rare but user-visible when it happens. The `onSyncError` path (runtime errors) already exists; this completes the surface.

**Constraints.** Must match the destroy-and-evict semantics used elsewhere in the pool (`destroyEntry` is the existing cleanup path). Must not swallow the error — upstream callers need to know the provider is unavailable.

**Lateral.** Mirrors the `destroyEntry` cleanup path (lines 193-198). Shares the fault-tolerance posture with the existing `onSyncError` runtime callback.

**Forward.** Closes the pool's init-time fault handling completely; no further work on this surface unless the pool's internal structure changes.

**Files touched.** `packages/app/src/editor/provider-pool.ts` (\~10 lines). `packages/app/src/editor/provider-pool.test.ts` (add one test case).

---

#### S7 — Codify PR #38's learned lessons in CLAUDE.md + source JSDoc

Add two paragraphs to `CLAUDE.md`: (1) "Single-client observer coverage is insufficient — always add a multi-client case for observer bridge changes; the peer-WYSIWYG edit during local Observer A sync is the production trigger" and (2) "Playwright runs on every PR as a guard against DOM-binding regressions". Sharpen the JSDoc on `applyUserDelta` in `packages/app/src/editor/observers.ts:178-183` and the describe block in `observers.test.ts:1261` to name the specific peer-WYSIWYG multi-client scenario instead of the current abstract "other sources that wrote to Y.Text between Observer A syncs" framing.

**Value.** Prevents the PR #38 re-work cost from recurring (engineer) — during PR #38, main's PR #43 merge revealed that our single-client divergence tests were testing a real multi-client production path we hadn't recognized. The assumption cost us measurable re-work. Codifying the lesson so the next agent session inherits it is a one-paragraph investment that prevents a days-long recovery. Also sharpens the agent-readable surface of the code (AI consumer) — the abstract framing in JSDoc makes it harder for future agents to reason about the correct test coverage.

**Constraints.** Must not invent new framing — use the exact scenario that PR #43 revealed (peer WYSIWYG edit arrives as remote Y.Text-only transaction while local user is mid-sync on XmlFragment). Must not restate things derivable from git history.

**Lateral.** Touches the same `observers.ts` surface as S1 (indirectly, via `external-change.ts`'s use of `updateYFragment` which is observed by Observer A).

**Forward.** Raises the floor for every future observer bridge change. Reduces `/review-cloud` drift by pre-empting the "this is only single-client" assumption.

**Files touched.** `CLAUDE.md` (+\~10 lines). `packages/app/src/editor/observers.ts` (JSDoc only). `packages/app/src/editor/observers.test.ts` (describe block docstrings only).

---

### Next

**Phasing rationale:** Deferred from Now because the narrow-wedge appetite doesn't include them. Would re-enter scope if the project's appetite grows OR if one of the triggers below fires.

#### S2 — Commit to or trim `conversion-fidelity.test.ts` observer + full-stack chains

Two describe blocks in `conversion-fidelity.test.ts` (observer round-trip + full-stack chain) together account for \~18s of wall-clock. Either formally document why they're load-bearing (preventing a specific regression class) OR trim one/both of them. Currently ambiguous — the cost is real, the justification is implicit.

**Trigger to promote.** When `bun run check` wall-clock becomes a bottleneck, OR when someone other than the PR #38 author needs to reason about whether these chains are necessary.

#### S5 — Encapsulate module-level mutable state in `file-watcher.ts` + `persistence.ts`

Convert `writeTracker`, `lastKnownHash`, `reconciledBaseByBranch`, `activeBranch`, `batchInProgress`, `consecutiveGitFailures` from module-level `let`/`Map` to closure-scoped state returned by `startWatcher()` / `createPersistenceExtension()`. No conflict with Miles's PR #39 — but deferred because it's a \~half-day refactor with no forcing function today and multi-instance server work isn't on the roadmap.

**Trigger to promote.** When a need emerges to run multiple `createServer()` instances in the same process (parallel integration tests beyond current patterns, multi-tenant scenarios, hot-reload dev experience).

---

### Later

**Phasing rationale (revised):** Deferred on their own merits, NOT conflict-blocked anymore. S3 was promoted out of Later (moved to Now). The remaining Later items lack forcing functions — speculative refactors or work that another PR is partially doing.

#### S6 — Split `standalone.ts createServer()` into focused subsystem init helpers

Extract `initShadowSubsystem`, `initWatcherSubsystem`, `initHeadWatcherSubsystem`, `initPersistence` from the 688-line `createServer()` factory. Architectural refactor for readability.

**Trigger to promote.** Someone has an independent reason to touch the file (maintenance pain, a larger refactor, or a concrete reader complaint). No forcing function today.

#### S8 — Close the dev plugin reconciliation-pipeline gap

`packages/app/src/server/hocuspocus-plugin.ts` has the file watcher but (currently) no shadow repo, HEAD watcher, or reconciliation.

**Trigger to promote.** **Re-audit after Miles's PR #39 merges.** His changes add shadow repo init to the dev plugin, partially addressing this story. May close entirely or remaining gap may be small.

---

## Rabbit holes

**Over-testing **`external-change.ts`**.** S1's scope is the 4 internal branches plus one end-to-end case. The rabbit hole: adding combinatorial coverage for every possible frontmatter shape, every markdown construct, every encoding edge case. The handler is 69 lines — if testing takes more than a day, the scope has expanded beyond the narrow wedge. Stop at the 4 branches and defer the rest to a "when we have a concrete regression" trigger.

**Re-writing **`provider-pool.ts`** while adding S4.** S4 is a 10-line try/catch. The rabbit hole: noticing the pool's class structure could be cleaner and refactoring the whole thing. The pool works; the test file (`provider-pool.test.ts`) covers the happy path. S4 adds one defensive path. Everything else is out of scope.

**Expanding S7 into a testing philosophy document.** S7 is two paragraphs in CLAUDE.md + JSDoc sharpening. The rabbit hole: writing a full "how to test observer changes" guide, a decision tree, a checklist. The value is in naming the specific trigger scenario — more detail erodes signal.

**Pre-emptively touching **`standalone.ts`** to "prepare" for Miles's PR #39 merging.** The rabbit hole is convincing yourself that one tiny change ("just a JSDoc fix", "just renaming a local") in `standalone.ts` is zero-risk and saves future merge work. Any edit in that file before #39 merges creates conflict surface. Leave it alone.

---

## Pre-mortem

**If this project fails, the most likely cause is scope creep out of Now.** The narrow-wedge appetite is correct — but every story in Now is \~1 day or less, which creates the temptation to "just also fix the related thing while I'm there." S1 expands into rewriting the handler. S4 expands into refactoring the pool. S7 expands into a testing treatise. The discipline needed is saying "this is a different story" and leaving the adjacent work in the Items table.

**Secondary failure mode: Later phase never gets re-audited.** The re-audit trigger in XQ2 says "when Miles's PR #39 merges OR when a subsystem change makes a latent item acute." Both triggers are passive — they require someone to notice and invoke. If Later items sit in the project doc indefinitely, the audit loses relevance and the deferred findings get rediscovered the hard way. Mitigation: when Miles's PR #39 merges, whoever does the `/resolve-conflicts` pass should re-read this PROJECT.md and explicitly re-decide. Not guaranteed, but cheaper than periodic ceremony.

**Assumption most likely to be wrong:** That S1's narrow test scope (4 branches + 1 integration case) is sufficient to catch the regressions that matter. The 69-line handler is small but the interaction surface with Hocuspocus v4, Y.Text, and Observer A is broad. If S1 ships and a subsequent `external-change.ts` refactor introduces a regression we didn't catch, the project value drops significantly. Verification: run the new tests against a deliberately-broken handler before declaring S1 done.

---

## Evidence & References

### Evidence Files

_Populated as investigation surfaces findings. None yet — Phase 1 relied on the prior audit._

### Upstream Artifacts

- [tmp/ship/pr-future-work.md](../../tmp/ship/pr-future-work.md) — PR #38 deferred-scope enumeration (\~20 items with original classifications)
- [tmp/ship/review-status.json](../../tmp/ship/review-status.json) — `deferredFindings[]` with classifications and evidence chains from `/review-local` convergence
- [specs/2026-04-10-test-isolation-parallelism/SPEC.md](../../specs/2026-04-10-test-isolation-parallelism/SPEC.md) — parent spec that generated this deferred scope

### Code References (audited against origin/main `3a5ee59`)

- `packages/server/src/external-change.ts` — 69-line factory `createExternalChangeHandler`; zero direct tests — anchor for S1
- `packages/app/src/editor/provider-pool.ts:100-108` — unguarded `setupObservers()` init call — anchor for S4
- `packages/app/src/editor/observers.ts:178-183` — `applyUserDelta` JSDoc with abstract framing — anchor for S7
- `packages/app/src/editor/observers.test.ts:1261` — divergence describe block needing sharpening — anchor for S7
- `CLAUDE.md` — target for S7 codification paragraphs

