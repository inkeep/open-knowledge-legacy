# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md`
**Audit date:** 2026-04-22
**Total findings:** 11 (3 HIGH, 5 MEDIUM, 3 LOW)

Findings are ordered weakest-claim-first within each severity tier.

---

## High Severity

### [H] Finding 1: FR4 is under-scoped — spec cites 3 `projectDir` leak sites but source has 5

**Category:** FACTUAL / COHERENCE
**Source:** T1 (own codebase) + L5 (summary coherence between FR4 and §9 pseudocode)
**Location:** §6 FR4; §9 System Design "Site 1 pseudocode"; `evidence/projectdir-couplings.md`; §16 SCOPE
**Issue:** FR4 asserts that "Under `isTestIsolated`, `BacklinkIndex.projectDir`, `getCurrentBranch()`, and `acquireServerLock.worktreeRoot` all resolve against `CONTENT_DIR`" and the §9 pseudocode modifies exactly those three sites. The evidence file `projectdir-couplings.md` also enumerates three sites. But `packages/app/src/server/hocuspocus-plugin.ts` contains **five** `PROJECT_ROOT` call sites that are unconditional-not-gated-on-`isTestIsolated`:

| Line | Site | In spec? |
|---|---|---|
| 121 | `acquireServerLock` `worktreeRoot` | ✓ (D9) |
| 196 | `BacklinkIndex({ projectDir: PROJECT_ROOT })` | ✓ (D3) |
| 208 | persistence wiring `getCurrentBranch` | ✓ (D4) |
| **245** | api-extension wiring `getCurrentBranch` | **✗ not mentioned** |
| **250** | api-extension wiring `projectDir: PROJECT_ROOT` | **✗ not mentioned** |
| **275** | `createServerObserverExtension` `getCurrentBranch` | **✗ not mentioned** |

**Evidence:** `grep -n "PROJECT_ROOT" packages/app/src/server/hocuspocus-plugin.ts` produced 13 hits including the three unmentioned sites above. `projectdir-couplings.md` §1 acknowledges this gap in a TODO: "Parallel fix at `api-extension.ts:250` if similar wiring exists there (spec iterate to audit)." That audit never happened. The `api-extension.ts:250` site IS the `projectDir` passed into `createApiExtension` at `hocuspocus-plugin.ts:250` (inline); and lines 245, 275 contain additional `getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git'))` definitions the spec is silent on.
**Status:** INCOHERENT (FR4's acceptance criteria can be met textually — tests observing ONE correct branch — while two observable sites still read parent-repo). Also factually stale — the projectdir-couplings.md TODO item was never closed.
**Suggested resolution:** Either (a) expand FR4 + the §9 pseudocode to name all five leak sites with an exhaustive inventory, OR (b) explicitly pick one site's output to be authoritative and document why the other sites are allowed to drift. **Decision reopen needed** because the single-branch-name and single-backlink-cache invariants both depend on the full inventory, not the partial one.

---

### [H] Finding 2: Spec cites the wrong `persistence-fan-out.test.ts` file — two exist, only one is a harness hand-fork

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §1 Problem statement; §16 SCOPE; D7 evidence; §13 Next actions item 3; §14 Risks row 3
**Issue:** Two test files share the name `persistence-fan-out.test.ts`:

1. `packages/server/src/persistence-fan-out.test.ts` — a **server-tier unit test** that does NOT import `test-harness.ts` at all. It calls `createServer` directly from `./standalone.ts`. Uses `swapContributors()` (preferred API).
2. `packages/app/tests/integration/persistence-fan-out.test.ts` — the **integration-tier test** that DOES hand-fork the harness pattern. Uses `clearContributors()` (deprecated).

SPEC §1: "`packages/server/src/persistence-fan-out.test.ts` hand-forks the harness to get shadow back." — **Wrong file.** The server-tier file never uses the app-integration harness; it's a sibling unit test in a different package.

SPEC §16 SCOPE: "`packages/server/src/persistence-fan-out.test.ts`" — **Wrong file path.** Should be `packages/app/tests/integration/persistence-fan-out.test.ts` for the hand-fork migration target.

SPEC D10 evidence: "`persistence-fan-out.test.ts:33, 37` (reference)" — points at `clearContributors()` calls at lines 33, 37. Those lines exist ONLY in `packages/app/tests/integration/persistence-fan-out.test.ts`. The server-tier file uses `swapContributors()` at lines 26, 30. So the D10 citation is implicitly pointing at the integration file, but the §1 / §16 prose points at the server file. **Internal contradiction** within the spec about which file is the subject.

SPEC D7 evidence citation "`persistence-fan-out.test.ts:41-90`" is also imprecise — the actual `initShadowRepo` call is at line 38 in the integration file (line 45 is the `historyHandle` variable assignment inside the first test body). Line range covers the first test block but boundary lines are wrong.
**Evidence:** `ls packages/server/src/persistence-fan-out.test.ts packages/app/tests/integration/persistence-fan-out.test.ts` — both exist (7975 bytes vs 8220 bytes). The header comment of the integration file says: "Mirrors packages/server/src/persistence-fan-out.test.ts but imports from `@inkeep/open-knowledge-server` (the published package) so regressions in the compiled artifact surface at integration tier (not just server unit tier)."
**Status:** CONTRADICTED (the spec is pointing at two different files with the same casual name, and picks the wrong one in the primary Problem-statement prose). Load-bearing: `§16 SCOPE` drives implementer behavior — migrating the wrong file, or both files, would be a different implementation than the spec intends.
**Suggested resolution:** Disambiguate every `persistence-fan-out.test.ts` mention in the spec with the full package-relative path. The integration-tier file is the hand-fork target (D7 / FR6 subject); the server-tier file is a *sibling unit test* that is deliberately independent and should stay. Update §16 SCOPE, §1, §13, §14, D7.

---

### [H] Finding 3: `/api/timeline` is not an endpoint — the correct name is `/api/history`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §9 "Affected routes / pages" table row 3; §5 "TimelinePanel UI" user journeys (colloquial)
**Issue:** SPEC §9 "Affected routes/pages" table lists `/api/timeline (test call)` as a harness contract for FR8 T1. Grep on `api-extension.ts` confirms **no route exists at `/api/timeline`** — the timeline view is powered by `/api/history` (handler: `handleHistory` at line 2444, route mapping at line 4941). `TimelinePanel.tsx:4` confirms: "Fetches GET /api/history on open, polls every 10s while open." Line 319: `fetch(\`/api/history?docName=...\`)`.
**Current text:** "| `/api/timeline` (test call) | Harness contract | Post-FR8 T1, timeline returns non-empty for worker that did an agent-write |"
**Evidence:** `grep -n "'/api/timeline'" packages/server/src/api-extension.ts` → no results. `grep "api/history" packages/app/src/components/TimelinePanel.tsx` confirms client endpoint. PR #269's own commit log for T5 says: "`/api/history` returns 'History unavailable' in the dev fixture's OK_TEST_CONTENT_DIR mode" — the actual endpoint name.
**Status:** CONTRADICTED. An implementer writing T1 based on the §9 table would hit 404.
**Suggested resolution:** Change `/api/timeline` to `/api/history` in the §9 Affected Routes table. (The UI component `TimelinePanel` is correctly named — component stays "Timeline," endpoint is "history." No further cascade.)

---

## Medium Severity

### [M] Finding 4: `§3 NG5` text describes it as "SILENT degraded mode" — but NG5's stated rejected behavior is NOT silent in code

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity) + T1
**Location:** §3 NG5 ("Fall back to a silent degraded mode if `git` is unavailable"), §9 Failure modes row 1 + row 2
**Issue:** NG5 rejects "silent degraded mode" — yet the §9 Failure modes table shows that under a non-`ProjectGitInitError` (e.g. disk full), the handler still degrades with a `[dev]` warn log (row 2: "degraded warn (Playwright) / rethrow (Tier 1)"). This is exactly the pre-existing `handleDevShadowInitError` behavior from `dev-shadow-init.ts:52` which logs `[dev] Shadow repo init failed (timeline features unavailable)` then continues. So "silent" is inaccurate — the production path IS already degraded-with-warn, and the spec doesn't change that. NG5's framing implies fail-fast is universal; in practice it's only `ProjectGitInitError` that is fail-fast (per D6), and other errors degrade.
**Evidence:** `dev-shadow-init.ts:46-54`: only `ProjectGitInitError` calls `io.exit(1)`; all other errors go through `logWarn('[dev] Shadow repo init failed (timeline features unavailable):', err)` and server continues. §9 row 2 of Failure modes explicitly acknowledges this degraded branch for disk-full / EEXIST races.
**Status:** INCOHERENT — NG5's "Fall back to a silent degraded mode" scope is narrower than written. The spec rejects silent-degraded on `git` BINARY missing; it tolerates degraded-with-warn on disk/FS failure. Reader gets a false absolute.
**Suggested resolution:** Rewrite NG5 as: "Fall back to degraded mode on missing `git` binary." Remove "silent" since even today's code logs a warn. Clarifies that the spec's scope is the `ProjectGitInitError` branch specifically, consistent with D6 and SPEC 2026-04-21 R6.

---

### [M] Finding 5: FR7 and D10 recommend `clearContributors()` — a deprecated API

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 FR7; §9 Site 2 pseudocode lines 198-200, 209-210; D10 in §10 Decision log
**Issue:** `clearContributors()` is marked `@deprecated` in `packages/server/src/contributor-tracker.ts:192-197`: "@deprecated Use swapContributors() for atomic drain. Kept for backward compatibility." The SPEC recommends auto-wiring `clearContributors()` as the harness primitive. The server-tier test (`packages/server/src/persistence-fan-out.test.ts`) uses `swapContributors()` (preferred); the integration-tier test uses `clearContributors()`. The spec's D10 citation is to the integration-tier file that chose the deprecated helper.
**Current text:** FR7: "auto-runs `clearContributors()` in setup/teardown"; §9 pseudocode: `if (shadow) clearContributors();` ... `if (shadow) clearContributors();`
**Evidence:** `contributor-tracker.ts:192-197` JSDoc literally says "@deprecated Use swapContributors() for atomic drain."
**Status:** STALE / FACTUAL — The spec is codifying a pattern using the deprecated surface. Implementer will follow the spec and introduce new deprecated-call callsites. A subsequent "@deprecated → removed" cleanup breaks the harness.
**Suggested resolution:** Switch FR7 and §9 pseudocode to `swapContributors()`. Note in D10 rationale that the server-tier reference uses the preferred API; the integration-tier reference pattern should be migrated in the same PR.

---

### [M] Finding 6: Q3 closure citation in §11 has wrong line numbers for `fixtures.ts`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §11 Open Questions Q3 row ("`fixtures.ts:207, 242`")
**Issue:** SPEC Q3's Plan-to-resolve column: "`fixtures.ts:207, 242` — `recursive: true` handles the bare-repo subtree." Line 207 is `env:` inside the `spawn()` call, NOT a `rmSync` invocation. Grep for `rmSync` in `packages/app/tests/stress/_helpers/fixtures.ts` returns lines **49** (import), **235** (error path cleanup), and **242** (post-use cleanup). So the correct cite is `235, 242`, not `207, 242`.
**Evidence:** `grep -n "rmSync" packages/app/tests/stress/_helpers/fixtures.ts` → 49, 235, 242. Line 207 is the `env:` object inside the worker-boot spawn() call.
**Status:** STALE — Q3 citation is a line-number typo. Doesn't affect the conclusion (recursive: true DOES cover the bare repo), but line pointer is wrong.
**Suggested resolution:** Correct `fixtures.ts:207, 242` to `fixtures.ts:235, 242`.

---

### [M] Finding 7: NFR "~50 tests" baseline is inherited-stale — actual test block count is ~209

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 Non-functional requirements "Performance" bullet; §14 Risk "Tier 1 +5-10s overhead"
**Issue:** SPEC §6 NFR Performance: "Tier 1 total overhead ~5-10s across ~50 tests (pre-accepted by SPEC 2026-04-21)." The ~50 figure comes from SPEC 2026-04-21 Q3's closure written ~1 day prior. Actual `bun test` block count in the integration folder today is 209 test blocks across 38 files (`grep -c 'test(' packages/app/tests/integration/*.test.ts`). If the per-test overhead is indeed ~100-200 ms as SPEC 2026-04-21 estimated, 209 tests = ~21-42 s, not 5-10 s. However, not every test calls `createTestServer()` — the actual cost depends on that subset. Without measurement, the claim is under-calibrated.
**Evidence:** `ls packages/app/tests/integration/*.test.ts | wc -l` → 38 files. `grep -rhc 'test(' ... | awk` → 209 blocks.
**Status:** STALE (inherited from a past spec's estimate; the count has grown, but the claim hasn't been updated). Marked medium because A3 ("< 500ms per worker") covers the operational bound; the aggregate 5-10s number is not strictly load-bearing for any invariant.
**Suggested resolution:** Either (a) cite SPEC 2026-04-21 Q3 explicitly as the source and add "(baseline ~50 tests, current count ~209; extrapolated ~20-40 s; actual subset using `createTestServer` unmeasured)", OR (b) promote this to an implementation-time measurement task paired with A3.

---

### [M] Finding 8: SPEC §1 characterizes PR #269 T5 deletion in a way that overstates the shadow-gap linkage

**Category:** FACTUAL / COHERENCE
**Source:** T5 (external via `gh`)
**Location:** §1 Problem statement ("PR #269's T5 test was deleted when timeline returned 'No history yet.'"); §7 M2 ("Baseline: 1 this month (T5 in PR #269)")
**Issue:** PR #269's commit log shows T5 had a more complicated history:
1. T5 was first **skipped** (not deleted) per commit `0bc5376`: "T5 scoping note: the test tries the full diff-entry flow ... but `/api/history` returns 'History unavailable' in the dev fixture's OK_TEST_CONTENT_DIR mode because runDevShadowInit (in hocuspocus-plugin.ts) targets PROJECT_ROOT for the shadow, not the per-worker tmpdir. Modifying the fixture is out of §15 SCOPE, so T5 skips gracefully with a detailed rationale..." — this **matches the spec's shadow-gap story**.
2. Later (commit `2a7a4ee` "revise editor-mode-persistence suite for D9 per-tab design") T5 was **deleted** because D9 superseded D7 (cross-window sync rejected entirely), and T5's invariant "diff exit preserves session pre-diff mode under concurrent cross-window flip" no longer existed at all.

So T5 was not deleted *because* of the "No history yet" gap — it was first skipped because of that gap, then later deleted because of an unrelated design reversal. The SPEC compresses two distinct removal events into one. An implementer reading M2 (baseline = 1 delete-or-skip workaround, T5 in PR #269) might count this correctly as a workaround (the skip IS a workaround), but the causal-order prose in §1 conflates the skip + delete.
**Evidence:** `gh pr view 269 --json commits` commit bodies quoted above. Key commits: `0bc5376` (T5 skip with shadow-gap rationale), `a8f3864` (D9 revert), `2a7a4ee` (T5 deletion under D9 suite revision).
**Status:** CONTRADICTED with nuance — the skip had the shadow-gap cause, the delete had a different cause. Mid-severity: doesn't invalidate M2 (there IS a workaround), but the prose compresses causally distinct events.
**Suggested resolution:** Tighten §1 to: "PR #269's T5 test was first skipped when `/api/history` returned 'History unavailable' under OK_TEST_CONTENT_DIR (later the test was deleted during a separate D9 design reversal, but the skip was the shadow-gap workaround this spec addresses)."

---

## Low Severity

### [L] Finding 9: `§3 Non-goals` numbering is non-monotonic (NG1, NG2, NG5, NG3, NG4, NG6)

**Category:** QUALITY-BAR
**Source:** L5 (summary coherence) / reader pass
**Location:** §3 Non-goals
**Issue:** Numbering order is 1, 2, 5, 3, 4, 6 — not monotonic. A cold reader expects sequential IDs; this creates momentary confusion and a sense of residue from iteration (probably NG5 came first, then NG3/NG4 were inserted earlier in the list but not renumbered).
**Evidence:** `§3 Non-goals` source text in SPEC.md lines 34-40.
**Status:** INCOHERENT (minor) — pure ordering hygiene.
**Suggested resolution:** Renumber 1, 2, 3, 4, 5, 6 by order-of-appearance. Cascade any in-doc back-references (search for NG1..NG6 elsewhere in the spec to catch ID-use sites).

---

### [L] Finding 10: Evidence file worldmodel.md claims `persistence-fan-out.test.ts:33, 37` calls `clearContributors()` — true only for one of two files with that name

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity)
**Location:** `evidence/worldmodel.md` §7g + §9 O9 ("`persistence-fan-out.test.ts:33, 37` calls `clearContributors()` in before/afterEach")
**Issue:** The worldmodel evidence conflates the two `persistence-fan-out.test.ts` files in the same way the SPEC does (Finding 2). The citation `:33, 37` is correct for the integration-tier file (`clearContributors()` at lines 33, 37) but not for the server-tier file (`swapContributors()` at lines 26, 30). This is the evidence-root cause for Finding 2.
**Evidence:** `grep -n "swap\|clear" packages/server/src/persistence-fan-out.test.ts` (swapContributors 15, 26, 30) vs `grep -n "swap\|clear" packages/app/tests/integration/persistence-fan-out.test.ts` (clearContributors 19, 33, 37).
**Status:** INCOHERENT — evidence file error propagates into the spec.
**Suggested resolution:** Clarify worldmodel §7g / §9 O9 with full path. Since this file is tagged "Status: Generated by /worldmodel" on 2026-04-22, treat it as a moment-in-time artifact per the spec's own corrigendum protocol — append a breadcrumb rather than rewrite.

---

### [L] Finding 11: §9 "Concurrent workers" claim conflates pid+hostname gating logic with directory-disjoint safety

**Category:** COHERENCE
**Source:** Reader pass + T1
**Location:** §9 Data flow diagram "Shadow paths to test → concurrent workers"
**Issue:** "4 workers × 4 tmpdirs × 4 shadows × 4 locks. Each lock is `pid`+`hostname`-gated on a distinct path. No contention possible." The pid+hostname gating is irrelevant when paths are disjoint — the gate fires on *same-path* contention. The correct argument is: paths are distinct (each worker's tmpdir is unique), therefore no lock-file-level contention. Stating "pid+hostname-gated" as the defense conflates two different isolation mechanisms. The A1 assumption row is already stated correctly ("scope purely per-directory with no shared global path"); §9's prose could match that phrasing.
**Evidence:** `shadow-lock.ts:28-68` — the pid+hostname check only runs when a lock at the same `lockPath` already exists. Distinct paths skip this check entirely.
**Status:** INCOHERENT (low impact). The conclusion is correct; only the stated reasoning is imprecise.
**Suggested resolution:** Rewrite as: "4 workers × 4 tmpdirs × 4 shadows × 4 locks. Each lock is at a distinct filesystem path — same-path pid+hostname gating is not even reached under disjoint-directory isolation (A1). No contention possible."

---

## Confirmed Claims (summary)

### Factual (T1 codebase verification)
- `hocuspocus-plugin.ts:121` passes `worktreeRoot: PROJECT_ROOT` to `acquireServerLock` — confirmed.
- `hocuspocus-plugin.ts:146-163` is the guard that disables `runDevShadowInit` + `gitEnabled` on `isTestIsolated` — confirmed (lines, behavior, and in-code rationale all match).
- `hocuspocus-plugin.ts:195-199` passes `projectDir: PROJECT_ROOT` to `BacklinkIndex` unconditionally — confirmed.
- `hocuspocus-plugin.ts:208` reads `PROJECT_ROOT/.git` via `getCurrentBranch` — confirmed.
- `test-harness.ts:119` calls `ensureProjectGit(contentDir)` — confirmed.
- `test-harness.ts:127` passes `gitEnabled: false` — confirmed.
- `packages/app/tests/integration/symlink-alias.test.ts:44` has `gitEnabled: false` — confirmed.
- `packages/app/tests/integration/provider-pool-reconnect.test.ts:74` has `gitEnabled: false` — confirmed.
- `boot.test.ts:37-111` uses `gitEnabled: false` across four test cases — confirmed (range accurate).
- `keepalive-presence-cleanup.test.ts:54` uses `gitEnabled: false` — confirmed.
- `dev-shadow-init.ts:46-91` is the error dispatch + pipeline, including the `ProjectGitInitError → exit(1)` branch — confirmed.
- `backlink-index.ts:767` reads `this.projectDir` for cache path — confirmed.
- Shadow-lock is at `<shadowDir>/lock`, server-lock is at `<contentDir>/.open-knowledge/server.lock`, both pid+hostname+`isProcessAlive` gated — confirmed.
- SPEC 2026-04-21 Q3 closure quote "~100-200ms × ~50 tests = ~5-10s overhead. No harness change needed" — confirmed verbatim.
- `ensureProjectGit` in `project-git.ts:43-76` runs `git init --initial-branch=main` — confirmed.
- `initShadowRepo` in `shadow-repo.ts:82-125` creates bare repo + acquireLock — confirmed.
- TimelinePanel does show "No history yet" empty state (`TimelinePanel.tsx:445`) — confirmed.
- `persistence.ts:248` declares `gitEnabled` option (default `true`) — confirmed.
- `persistence.ts:461` has the `if (!gitEnabled) return` short-circuit — confirmed.

### Factual (T5 external verification via `gh`)
- PR #277 exists, Miles, title "feat: agent change-notes..." — confirmed OPEN.
- PR #268 exists, Andrew, title "feat(agents): optional summary on MCP write tools..." — confirmed OPEN.
- PR #186 exists, Mike, title "feat(graph-demo): Stage 6 agent attribution + Stage 7 time-travel" — confirmed OPEN.
- PR #269 exists, Nick, MERGED, title "feat(app): editor mode persistence..." — confirmed (used for Finding 8 nuance).

### Coherence (L1-L7)
- L1 (cross-finding contradictions): no major contradictions between Decision Log and FR acceptance criteria (one minor finding — Finding 4 NG5 scope).
- L2 (confidence-prose alignment): A1 HIGH + source-confirmed; A3 MEDIUM + "measure at impl time"; A4 HIGH + closed. All confidence labels match prose.
- L3 (missing conditionality): FR5's production-path unchanged claim is scoped correctly.
- L6 (stance): factual/prescriptive stance is uniform; no mode-switching.
- L7 (inline source attribution): file:line citations are dense and useful. Most are correct (see "Confirmed Claims"); flagged errors in Findings 2, 6, 10.

---

## Unverifiable Claims

- NFR performance figure "Per-drain `commit-tree` ~10-30ms" — not measured by the spec; inherited from prior work. No expiry set. Recommend A5 + measurement at implementation time.
- NFR "Playwright fixture timeout (60s) unchanged" — verified the fixture defines `timeout: 60_000` at `fixtures.ts:244`; confirmed. (Moving to Confirmed list retroactively — re-verified.)
- Claim in §9 that `symlink-preserving` writes are unaffected — not exercised by any citation; out of the audit's blast radius.
- Risk table claim "No new flake class from git-subprocess timing" — aspirational; can only be verified post-implementation under the CI tier-1 reliability budget.

---

## Notes on what was NOT audited

- Challenger concerns are out of scope (handled by a separate subagent).
- Evidence file `projectdir-couplings.md` was spot-checked at §1-§3, all three primary citations validated.
- Meta `_changelog.md` was read for process audit but not scrutinized for claims.
- Related specs (2026-04-21-shadow-repo-single-mode, 2026-04-18-agent-identity-attribution-foundation, 2026-04-19-ci-signal-quality) were spot-checked for quoted citations but not full-audit scope.
