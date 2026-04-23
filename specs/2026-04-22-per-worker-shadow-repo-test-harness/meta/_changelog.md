# Changelog — per-worker-shadow-repo-test-harness

Append-only process history. Write at the top of every substantive change.

---

## 2026-04-22 — Scaffold

- Created spec directory and SPEC.md skeleton at baseline commit `8d0f423d`.
- Captured draft SCR, initial scope questions (Q1–Q6), and D1 (PR #270 out of scope).
- Dispatched `/worldmodel` subagent to populate `evidence/worldmodel.md` with topology, adjacent-PR intersections, and 3P landscape.
- Loaded `/tdd` skill and surfaced intersection with the scope decision: shadow-repo is OK's own module, not a third-party boundary — `gitEnabled:false` is mocking an internal collaborator, which TDD calls an anti-pattern. This strengthens the case for lifting both Playwright AND integration tiers (Q1), with different rationales per tier:
  - Playwright: E2E user-journey coverage of timeline/attribution UX.
  - Integration: narrow-integration coverage of writer-ID taxonomy, commit-body schema, paired-write origins, reconciliation — tests that currently have no home because shadow is off.
- Intake incomplete: items 1 (scope breadth), 3 (value dimensions), 4 (spec name) carry forward into the iterate loop.

## 2026-04-22 — Intake findings (summary)

- **Claim verified.** Guard at `hocuspocus-plugin.ts:146-163` over-applies — the in-code rationale is persistence-specific, not shadow-specific.
- **Locks are per-directory.** `shadow-lock.ts` → `<shadowDir>/lock`; `server-lock.ts` → `<contentDir>/.open-knowledge/server.lock`. Both `pid`+`hostname`+`isProcessAlive()` gated.
- **Shadow-init is tmpdir-portable.** `runDevShadowInit(projectRoot) → ensureProjectGit → initShadowRepo`. Under isolation, `projectRoot = tmpdir` creates `<tmpdir>/.git/open-knowledge/`.
- **Miles is the primary DRI and primary consumer.** Currently shipping PR #277 (agent-change-notes) on top of this carve-out; previously shipped timeline (#39), attribution (#134), history tools (#122), GitHub Sync (#166). No currently-open Miles PR directly addresses the harness gap.
- **Adjacent PRs that compound on this gap:** #277 (Miles, agent-change-notes), #186 (Mike, graph-demo time-travel, draft), #268 (agent-write-summaries, draft). All layer features on shadow-repo that can't be E2E-tested today.
- `BacklinkIndex` at `hocuspocus-plugin.ts:194` passes `PROJECT_ROOT` unconditionally — under true isolation this probably leaks backlink cache across workers. Captured as Q2.

## 2026-04-22 — Decisions logged

- **D1 LOCKED:** PR #270's unify dev-plugin + createServer refactor is out of scope for this spec. Rationale: two separate problems sharing a boundary. Implication: guard-flip location must leave a seam for the future unification.

## 2026-04-22 — Andrew's "remove standalone" trajectory reviewed

- User asked whether any open/draft PRs from Andrew (amikofalvy) move toward removing the non-git standalone path.
- **Finding:** Andrew's work SHIPPED in PR #244 (merged 2026-04-21) — SPEC 2026-04-21-shadow-repo-single-mode. That PR deleted `ShadowRepoMode`, mode-conditional branches, `.gitignore` auto-mutation, and every runtime reference to `.openknowledge/`. R6: no fallback when `git` missing; fail-fast via `ensureProjectGit`.
- Vestigial: file name `packages/server/src/standalone.ts` persists; rename explicitly out of scope per #244 D12 ("ironic name; rename not in scope").
- Andrew's 8 open PRs: none continue the standalone-removal thread. #281 (Vite dev-server diagnostic) is IPv6 probe work — same file area as our guard but different concern. #268 (agent-write-summaries) is a primary CONSUMER of shadow — builds on the substrate Andrew just shipped.
- Interesting aside: Andrew's #268 and Miles's #277 are **both agent-summary features** — two authors, divergent branches + specs (`2026-04-21-agent-write-summaries/` vs `2026-04-21-agent-change-notes/`). Orthogonal to this spec; flagged for team awareness.
- Implication for this spec: **we're completing Andrew's direction, not racing him.** Andrew shipped the substrate + added `ensureProjectGit(contentDir)` to the integration harness, but stopped short of calling `initShadowRepo` + flipping `gitEnabled:true`. This spec finishes that edge.

## 2026-04-22 — Scope confirmations (D2-D5 LOCKED)

User confirmed all four recommendations from the §4 batch:

- **D2 LOCKED:** Both tiers (Playwright + Tier 1 integration) get shadow by default with `{ skipShadow: true }` opt-out. Completes SPEC 2026-04-21 Q3 intent.
- **D3 LOCKED:** BacklinkIndex `projectDir` fix is in-scope. Gate on `isTestIsolated` same pattern as persistence.
- **D4 LOCKED:** `getCurrentBranch` reads `CONTENT_DIR/.git` under isolation; parent repo otherwise.
- **D5 LOCKED:** Value dimensions = internal velocity + platform reliability.

## 2026-04-22 — Autonomous investigation on P0 investigables

Resolved without user input:
- **Q3 (teardown):** Fixture's `rmSync(contentDir, recursive:true)` covers `.git/open-knowledge/`. No-op.
- **Q5 (head-watcher on tmpdir):** `resolveGitDir(projectRoot)` already handles any projectRoot; fresh repo HEAD points to `refs/heads/main`; no spurious events.
- **Q6 (writer-lock cleanup):** `destroyShadowRepo` path handles clean exit; `rmSync` is the SIGKILL failsafe.
- **Q8 (CC1 under shadow):** CC1 on `__system__` doc is orthogonal; no change.
- **Q9 (bootServer usage):** Integration harness + dev plugin both call `createServer` directly. `bootServer` used only by CLI + Desktop utility. Spec doesn't touch bootServer.

Still needing user input:
- **Q4 (fail-fast vs degraded under isolation on missing git)** — CI UX judgment call.
- **Q10 (persistence-fan-out migration disposition)** — keep hand-fork or migrate to default harness.
- **Q13 (acceptance criteria anchor on T1-T3)** — scope confirmation.

Open with DIRECTED defaults (no batch needed unless user overrides):
- **Q7 (worktreeRoot diagnostic)** — flip to `CONTENT_DIR` under isolation.
- **Q11 (contributor-tracker auto-clearing in Tier 1)** — auto-wire in `createTestServer` lifecycle.
- **Q12 (`gitEnabled:false` site migration)** — harness default flips; 2 explicit Tier 1 sites migrate to `{ skipShadow: true }`; `boot.test.ts` + `keepalive-presence-cleanup.test.ts` stay inline.

## 2026-04-22 — Final decisions locked (user "sounds good")

- **D6 LOCKED:** Fail-fast on missing `git` under isolation. No degraded mode. Aligns with SPEC 2026-04-21 R6.
- **D7 LOCKED:** `persistence-fan-out.test.ts` migrates to default `createTestServer` (FR6). Delete hand-fork.
- **D8 LOCKED:** Acceptance criteria = T1-T3 smoke tests (FR8). T4 (rollback E2E) + T5 (TimelinePanel UI) = NG6 + Future Work Identified.
- **D9-D11 promoted from Open (DIRECTED) to confirmed DIRECTED:** worktreeRoot diagnostic flip; Tier 1 contributor-tracker auto-wire; `boot.test.ts` + `keepalive-presence-cleanup.test.ts` stay inline.

## 2026-04-22 — SPEC.md content convergence

- §5 (user journeys), §6 (FR1-FR8 + NFRs), §7 (M1-M4), §8 (current state summary), §9 (proposed solution + alternatives + failure modes), §13 (In Scope consolidation), §14 (risks refreshed), §15 (Future Work tiered), §16 (Agent constraints derived) all populated.
- Extracted load-bearing evidence to `evidence/projectdir-couplings.md` — the three site-specific couplings D3/D4/D9 depend on, with file:line sources.
- Spec content is stable. All P0 OQs resolved, scope stabilized.
- Transitioning to Step 6 (Audit): spawning parallel /audit + challenger subprocesses.

## 2026-04-22 — Audit + challenger findings assessed

Auditor subprocess returned 11 findings (3 HIGH / 5 MEDIUM / 3 LOW). Challenger subprocess returned 7 findings (3 HIGH / 3 MEDIUM / 1 LOW). After cross-cutting merge (F1 == CF1 on PROJECT_ROOT; F4 ≈ CF2 on D6 fail-fast) and assessment via `/assess-findings`:

**Mechanical corrections applied to SPEC.md and evidence/worldmodel.md:**

- F2 (wrong `persistence-fan-out.test.ts` file cited — two exist, spec prose pointed at server-unit file instead of app-integration hand-fork): fixed §1, §13 Next actions, §14 Risks, §16 SCOPE.
- F3 (`/api/timeline` doesn't exist; endpoint is `/api/history`): fixed §9 Affected Routes table.
- F5 (`clearContributors` is `@deprecated`; preferred API is `swapContributors`): fixed FR7, §9 Site 2 pseudocode (2x), D10 rationale.
- F6 (`fixtures.ts:207, 242` line-number typo; real `rmSync` sites are 235, 242): fixed Q3 row.
- F7 (NFR `~50 tests` is stale; current count is 38 files / 223 test blocks; realistic aggregate ~15-25s not 5-10s): added inline note with SPEC 2026-04-21 source + current measurement.
- F8 (PR #269 T5 history was skip-then-delete-under-unrelated-D9-reversal, not single delete): tightened §1.
- F9 (§3 NG numbering non-monotonic NG1,2,5,3,4,6): renumbered to 1,2,3,4,5,6.
- F10 (worldmodel evidence propagates the F2 file confusion): appended corrigendum breadcrumb per CLAUDE.md post-ship protocol.
- F11 (§9 "concurrent workers" prose conflates pid+hostname gating with path-disjoint safety): rephrased to note same-path gating never fires under disjoint-directory isolation.

**Decision reopens routed to §11a — require user judgment (3 HIGH + 4 LOW/MED):**

- **R1 (HIGH):** F1 + CF1 — PROJECT_ROOT enumeration is 3 sites short; L250 would cause `/api/save-version` to create real commits + `ok/v<N>` tags in dev's OK repo during tests. Options: (a) expand D3/D4/D9; (b) single `projectRoot` binding.
- **R2 (HIGH):** F4 + CF2 — D6 fail-fast only covers `ProjectGitInitError`; other shadow-init errors silently degrade. NG5 overclaims.
- **R3 (HIGH):** CF3 — `skipShadow` opt-OUT imposes cost + new flake class on 35/38 shadow-orthogonal Tier 1 tests. Alternative: Playwright default-on + Tier 1 opt-in.
- **S1 (MED):** CF6 — D7 migration drops nested-dir `projectDir`/`contentDir` coverage in fan-out test.
- **S2 (LOW-MED):** CF7 — add T6 timeline-query round-trip to FR8.
- **S3 (MED):** CF4 — reframe §1 as Q3 reopen, not completion.
- **S4 (LOW):** CF5 — re-examine D1 if PR #270 is close to shipping.

Task #6 (Assess findings) complete. Task #7 (Verify and finalize) blocked until user disposes of R1-R3 (HIGH) and the S-tier findings.

**Dismissed findings:** None. All findings survived investigation; every correction was applied or escalated for judgment.

## 2026-04-23 — /analyze pass + R3, S1, S2, S3 locked; S4 closed with corrected reasoning

User accepted greenfield-posture rejoinder on the remaining five findings. Ran /analyze on R3-S4 for rigor:

- **R3 — LOCKED via D2 amendment (tier-appropriate defaults).** Investigation strengthened the case: effective shadow-relevant Tier 1 test count is 1/38 (not 3/38 as challenger estimated). `attribution-sweep-coverage.test.ts` is static-analysis, `mdx-extension.test.ts` is `.mdx`-plumbing orthogonal. Only `persistence-fan-out.test.ts` asserts shadow state. Tier 1 default-off + `{ withShadow: true }` opt-in; Playwright unchanged (default-on via dev plugin). FR2/FR3 rewritten; `skipShadow` replaced with `withShadow`; `symlink-alias.test.ts` + `provider-pool-reconnect.test.ts` just delete their inline `gitEnabled: false` (no opt-out flag needed).
- **S1 — CLOSED.** `packages/server/src/persistence-fan-out.test.ts:35-43` already uses identical nested-dir structure (`projectDir = tmpDir; contentDir = join(tmpDir, 'content'); contentRoot: 'content'`). D7 migration of app-integration file to flat `createTestServer({ withShadow: true })` preserves coverage at the correct tier.
- **S2 — LOCKED via D14.** FR8 T1-T3 promoted from Could to Must; T6 (timeline query round-trip) added as Must. Four acceptance tests ship with spec. `Could`-tagged acceptance was expediency-shaped under greenfield posture. Write/read test pair (T1 simpleGit write-side + T6 HTTP read-side) is the correct integration-acceptance pattern.
- **S3 — LOCKED via D15.** §1 Resolution + D2 rationale rewritten as Q3 reopen (not completion). Corrigendum breadcrumb added to `specs/2026-04-21-shadow-repo-single-mode/SPEC.md` §Q3 per CLAUDE.md post-ship corrigendum protocol.
- **S4 — CLOSED with corrected reasoning.** Investigation (2026-04-23) found PR #270 is **MERGEABLE**, not draft, 13 reviews in progress, spec finalized — landing days. **Critically: PR #270 is NOT the unification** — it's a feature PR (asset + embed) that adds NEW `projectDir: baseDir` wiring to the dev plugin alongside existing sites, not a collapse. The unification is a separate future spec (unassigned, unwritten). D1 stands (reasoning corrected: PR #270 ≠ unification; sequencing is merge coordination with Nick, not scope absorption).

**Meta-observation from /analyze:** Two of my earlier recommendations (D2 uniform-default + FR8 Could-tier acceptance) were expediency-shaped — favored API symmetry over architectural fit. User's greenfield posture statement surfaced the pattern. Fixed both via D2 amendment + D14. Flagged the pattern for future vigilance in the same spec session.

## 2026-04-23 — Topology + follow-on ownership confirmed

Post-topology-analysis, user confirmed:

- **Unification refactor ownership: Andrew** (not Nick — user override of my initial suggestion). Rationale fits: Andrew authored SPEC 2026-04-21-shadow-repo-single-mode (remove standalone) and PR #281 (dev-server diagnostic), keeping him active in `hocuspocus-plugin.ts`.
- **Unification timing: starts after this spec merges.** User's greenfield no-deferred-debt posture honored — the debt gets scheduled, not backlogged.
- **Merge coordination: this spec's implementation PR merges first when possible.** If Nick's PR #270 merges first, Miles's rebase handles conflict resolution — ~15-30 min, low risk. No pre-merge Slack handshake; spec adds a post-rebase check for Nick's two new `projectDir: baseDir` consumers.

§15 Future Work updated with Andrew + post-this-spec timing. §13 Next Actions gained a merge-order protocol step (#7).

**Topology analysis key finding:** T-B (this spec) is non-throwaway under T-C (unification). Architectural insights + test suite + harness API + docs all survive; migration cost at T-C time is ~10 lines of source reshuffling. T-B actively pre-lubricates T-C by collapsing 7 PROJECT_ROOT sites into 1 binding — T-C inherits a single-site move rather than a 7-site sweep. Evidence file `projectdir-couplings.md` becomes T-C's cheat sheet.

Task 6 (Assess findings) complete. Transitioning to Task 7 (Verify and finalize).

## 2026-04-23 — Verified and finalized

Ran the Step 8 verification pass:

- **Mechanical adversarial checks:** zero ASSUMED decisions; all 15 decisions LOCKED or DIRECTED; 1-way door column uniformly "No" (spec is test-infrastructure, no public API / schema / security boundary); non-goal temporal tags stress-tested and accurate.
- **Resolution completeness gate:** G1 / G2 / G3 / G4 all pass — every decision made, no 3P dep additions, architectural viability source-verified (A1 locks per-directory), integration feasibility confirmed via FR8 T1-T6 acceptance tests, AC verifiable through `simpleGit` + HTTP fetch, zero Future Work dependencies.
- **Future Work maturity:** unification Identified (owner Andrew, post-this-spec timing); T4/T5 Identified (downstream feature tests).
- **Quality bar:** traceability §6 → §9 → §13 → §16 intact; evidence files (`worldmodel.md`, `projectdir-couplings.md`) cite file:line; `meta/_changelog.md` captures every substantive change.
- **Late corrections applied during verify:** scrubbed remaining `skipShadow` references (§5 happy path, interaction state matrix, §9 UX surfaces, §9 API/transport, §9 enforcement points, D8 rationale, D11 rationale, Q12 row, §16 ASK_FIRST); renamed FR3 title from negation ("No skipShadow needed") to constructive ("Clean up redundant test-level opt-outs").
- **Baseline commit:** 8d0f423d — unchanged from scaffold. No codebase drift during session.

**Status:** Draft → Approved. Spec ready for implementation via `/ship`.

Task 7 complete. All 7 spec-workflow tasks closed.
