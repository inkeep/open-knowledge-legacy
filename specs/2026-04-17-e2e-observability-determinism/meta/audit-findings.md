---
name: audit-findings
description: /audit findings on SPEC.md during spec Phase 5
---

# Audit findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/e2e-observability/specs/2026-04-17-e2e-observability-determinism/SPEC.md`
**Audit date:** 2026-04-17
**Total findings:** 24 (7 High, 9 Medium, 8 Low)

## Summary

The spec is substantive and largely well-grounded: its load-bearing technical claims about markdown/clipboard code (D-Q16, D-Q17, D-Q18) and about Y.js/Hocuspocus timer compatibility (D-Q4, D-Q29) verify correctly against source and research evidence. The decision log is well-organized with sensible clustering, and the greenfield posture is mostly held.

However, the spec carries **significant staleness from two major state changes** that happened before/during Phase 5 and were not propagated back through §1, §8, §10, §11, and the evidence files:

1. Commit `940d5a0a` removed all 4 `test.skip(browserName === 'webkit', ...)` calls and collapsed the project list to chromium-only — yet §1 SCR, §8 Current State, US-10, AC-5, and multiple evidence files still describe 5 webkit skips at stale line numbers as live problems.
2. The `waitUntil: 'networkidle'` count is claimed as 8 throughout (§8, US-17, AC-4, evidence inventory), but actual grep shows only **1** occurrence in the entire test suite.

Additionally, the Phase 5 "inventory correction" to 73 waitForTimeout entries is itself wrong — the actual count is 74, and `source-polish.e2e.ts` still has 1 entry (not 0 as §8 table row 217 claims). The SPEC now carries three competing counts: 74 (US sum), 73 (§8 narrative, §9 scope hypothesis), 55 (§1 SCR paragraph). Several user story text claims and ACs depend on these counts being correct.

There are also internal contradictions around the retries/trace/failOnFlakyTests config shape: §1 SCR, US-8, §7 Non-Goals, D-Q5, and R4 each describe different intended settings. These must reconcile before /ship executes.

The spec's verified strengths are strong — the mdast/clipboard analysis, the `page.clock` compatibility matrix, and the evidence-grounding for D-Q4/D-Q16/D-Q18 are high quality. The staleness is fixable with a re-verification pass against the post-baseline tree.

---

## Critical findings

### [H1] Finding: §1 SCR, §8 Current State, and US-10 describe 5 webkit `test.skip` calls that no longer exist

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §1 Complication bullet 3 (lines 19-27), §8 "E2E test suite shape" bullet 3 (line 218), US-10 (line 165), AC-5 (line 188), G3 Resolution (line 27), `evidence/current-state-inventory.md` §3, `evidence/webkit-cors-trace.md` header
**Issue:** The spec repeatedly treats "5 `test.skip(browserName === 'webkit', ...)` calls at lines 224, 270, 477, 713 + 1 describe block" as a current-state problem requiring migration work. Actual grep of the tree returns **zero** matches for any `test.skip(browserName === 'webkit'`. Commit `940d5a0a` ("perf(ci): revert multi-browser to chromium-only") on 2026-04-16 deleted all four skips and collapsed the project list. The cherry-pick base `6a4c92ea` lives on top of that commit. Changelog Phase-2 scope-reshape entry acknowledges "G3 collapses from 'fix webkit CORS race' to 'remove dead test.skip(webkit) calls as cleanup'" — but that reshape was not propagated back to §1, §8, US-10, AC-5, or the evidence files.
**Current text:** §8 line 218: "5 `test.skip(browserName === 'webkit', ...)` calls, all in `slash-command.e2e.ts`. 3 are the `/api/documents` CORS race (lines 224, 270, 477), 1 is the accessibility describe-block covering 5 accessibility tests, and 1 is the overflow-scroll webkit rendering skip at line 713."
**Evidence:** `grep -rn "test.skip(browserName === 'webkit'" packages/app/tests/stress/` → 0 matches. `git show 940d5a0a -- packages/app/tests/stress/slash-command.e2e.ts` shows all 4 `test.skip` guards deleted 2026-04-16. The line numbers 224/270/477/713 no longer point to skips; line 262 now has a residual comment ("Same pre-existing webkit CORS issue on `/api/documents` during page.reload") but no skip.
**Status:** CONTRADICTED / STALE
**Suggested resolution:**
- §1 Complication bullet 3: delete or rewrite to "All webkit skips were deleted in commit 940d5a0a (chromium-only revert). G3 is reduced to (a) the dead residual comment cleanup in slash-command.e2e.ts:262 and (b) the STOP rule preventing re-introduction."
- §1 Resolution G3: delete entirely or collapse — chromium-only already removed webkit coverage, so "restore webkit coverage" is not a goal.
- §8 bullet 3: rewrite to "Zero active `test.skip(browserName === 'webkit')` calls in the tree (all removed by commit 940d5a0a)."
- US-10: delete or pivot to "Remove the residual stale comment at slash-command.e2e.ts:262 that refers to the deleted CORS skip."
- AC-5: keep (it's a ratchet confirming zero — the ratchet is useful even when already zero).
- evidence/current-state-inventory.md §3: rewrite.
- evidence/webkit-cors-trace.md: re-caption as historical context or delete; the race is not reachable in the current chromium-only config.

---

### [H2] Finding: `waitUntil: 'networkidle'` count is 1, not 8 as claimed throughout the spec

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §8 line 219 ("used in `resetEditor` … and ~7 other navigation paths across the suite"), US-17 line 172 ("Replace 8 occurrences across the suite"), AC-4 line 187 (implicit via the grep ratchet), `evidence/current-state-inventory.md` §4 ("Grep result: 8 total instances"), §12 table summary
**Issue:** `grep -rn "networkidle" packages/app/tests/stress/` returns exactly 1 match: `slash-command.e2e.ts:38`. Nothing else. The claim "8 total instances" in the inventory and "~7 other navigation paths" in §8 is fabricated or predates a cleanup that removed them. The evidence file §4 explicitly lists "list-keymap.e2e.ts, mid-type-recovery.e2e.ts, paste-fidelity.e2e.ts, reveal-on-activate.e2e.ts, source-polish.e2e.ts" as having similar patterns — none of them actually contain `networkidle` per grep.
**Current text:** §8 line 219: "`waitUntil: 'networkidle'`: used in `resetEditor` (`slash-command.e2e.ts:25`) and ~7 other navigation paths across the suite"; US-17 line 172: "Replace 8 occurrences across the suite."
**Evidence:** `grep -rn "networkidle" packages/app/tests/stress/` → `slash-command.e2e.ts:38`. That's the full universe. Referenced line is 38 (not 25).
**Status:** CONTRADICTED
**Suggested resolution:**
- §8 bullet 4: rewrite to "1 `waitUntil: 'networkidle'` occurrence in `resetEditor` at slash-command.e2e.ts:38 (post-#185 migration eliminated the others). Still flagged as DISCOURAGED per Playwright docs."
- US-17: rewrite to "Replace the single `waitUntil: 'networkidle'` in `slash-command.e2e.ts:38`'s `resetEditor` with `domcontentloaded` + explicit readiness wait. Keeps the STOP rule applicable across the full suite."
- AC-4: keep (ratchet).
- evidence/current-state-inventory.md §4 + §12: rewrite to match.

---

### [H3] Finding: `waitForTimeout` count is 74, not 73 as the Phase 5 "correction" claims

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §8 line 217, §9 "Scope hypothesis" lines 467+482 (73/73), §11 walk-through probe line 596 ("73 occurrences"), `meta/_changelog.md` Phase 5 entry ("73 across 6 files"), US-16 text note
**Issue:** Direct grep of current tree: `grep -c "waitForTimeout" packages/app/tests/stress/*.e2e.ts` sums to **74**, not 73:

| File | Count |
|---|---|
| docs-open.e2e.ts | 2 |
| list-keymap.e2e.ts | 5 |
| mid-type-recovery.e2e.ts | 1 |
| paste-fidelity.e2e.ts | 19 |
| reveal-on-activate.e2e.ts | 2 |
| slash-command.e2e.ts | 44 |
| **source-polish.e2e.ts** | **1** |
| **Total** | **74** |

The Phase 5 changelog entry claims `source-polish.e2e.ts` now has 0 — it has 1. The claim "inventory re-verified" is itself incorrect. US-16 text ("Replace 1 `waitForTimeout` in `mid-type-recovery.e2e.ts`. (Note: `source-polish.e2e.ts` had 1 in prior snapshots but currently has zero…)") is wrong — source-polish still has 1.
**Current text:** §8 line 217 "73 `page.waitForTimeout(N)` calls across 6 files"; §9 line 467 "66 of 73 `waitForTimeout`"; US-16 "Replace 1 `waitForTimeout` in `mid-type-recovery.e2e.ts`. (Note: `source-polish.e2e.ts` had 1 in prior snapshots but currently has zero…)".
**Evidence:** `grep -c "waitForTimeout" packages/app/tests/stress/source-polish.e2e.ts` → `1`. Aggregate `grep -o | wc -l` → 74.
**Status:** CONTRADICTED
**Suggested resolution:**
- §8: revert to 74 across 7 files.
- §9 scope hypothesis: revert to 74; source-polish remains in-scope.
- §11 Q1: revert count.
- US-16: rewrite to "Replace 1 `waitForTimeout` in `mid-type-recovery.e2e.ts` and 1 in `source-polish.e2e.ts` (batched because single-occurrence files)."
- _changelog Phase 5 entry: retract the inventory-correction claim.
- The §1 SCR intro claims "55 `page.waitForTimeout(N)` magic sleeps across 6 files" — this also contradicts §8. Reconcile to 74/7.

---

### [H4] Finding: Multiple internal contradictions on `retries` / `trace` / `failOnFlakyTests` — three different settings live in the spec

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §1 Resolution (line 26), §7 Non-Goals (line 207), US-8 (line 163), D-Q5 (line 506), R4 (line 696)
**Issue:** The same three config values are prescribed incompatibly in at least four places:

| Setting | §1 SCR | US-8 / D-Q5 | §7 Non-Goals | R4 |
|---|---|---|---|---|
| `retries` on CI | **1** | **2** | (unstated) | (unstated) |
| `trace` mode | **`retain-on-failure`** | **`on-first-retry`** | (unstated) | (unstated) |
| `failOnFlakyTests` | (unstated) | **`!!process.env.CI`** (i.e. true on CI) | **default OFF at merge; flip later** | **start with false; flip after N clean days** |

§1 Resolution is the narrative anchor of the spec. US-8 is the implementation contract. §7 Non-Goals and R4 both commit to launching with `failOnFlakyTests: false` and flipping after stabilization. These cannot all be correct simultaneously.

Specifically problematic:
- US-8 locks in `failOnFlakyTests: !!process.env.CI` per D-Q5 — this is ON on CI from day one.
- §7 says the opposite ("default OFF at this spec's merge — flip later").
- R4 mitigation strategy assumes §7's stance ("Land with `failOnFlakyTests: false` initially").
- D-Q5 rationale is "Research: Playwright v1.52+ supports failOnFlakyTests. retries=2 absorbs infrastructure noise; failOnFlakyTests surfaces retry-success" — but the research report explicitly notes **"None of the surveyed projects use `failOnFlakyTests`"** (evidence/oss-config-survey.md line 62). So D-Q5's claim that this follows research is inaccurate; it's pioneering.

**Current text:** §1 line 26: "`retries` (1 on CI, 0 locally), `video: 'retain-on-failure'`, `trace: 'retain-on-failure'`"; US-8 line 163: "`retries: process.env.CI ? 2 : 0`, `failOnFlakyTests: !!process.env.CI`, … `use.trace: 'on-first-retry'`"; §7 line 207: "`failOnFlakyTests: true` adoption. Tracked as §11 OQ; default OFF at this spec's merge"; R4: "Land with `failOnFlakyTests: false` initially".
**Evidence:** Direct inspection of the SPEC.
**Status:** INCOHERENT
**Suggested resolution:** Reconcile to one coherent config in §1, §7, US-8, D-Q5, and R4. Recommended (respecting research):
- `retries: process.env.CI ? 2 : 0` (matches 6-of-7 OSS convention per research).
- `trace: 'on-first-retry'` (matches Playwright plurality per research).
- `failOnFlakyTests: false` at spec merge (matches §7 + R4 prudence; flip post-stability).
Then delete OQ#14 as resolved, and qualify D-Q5's rationale — the decision is stricter than research, not following it.

---

### [H5] Finding: `source-polish.e2e.ts` is incorrectly listed with 0 `waitForTimeout` in §8 playwright-stability overlap table

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §8 overlap table line 279 (`F7 source-polish.e2e.ts 0`), US-16 note, §9 scope-hypothesis derivation ("`source-polish.e2e.ts` inventory now reports 0; file drops out of G1 scope")
**Issue:** The overlap table at line 273-281 lists source-polish as having 0 waitForTimeout. It has 1. This is the same staleness as [H3] but expressed in the overlap table, user story, and scope hypothesis — each of which uses that "0" to justify a distinct decision (dropping the file from G1 scope, shrinking the STOP rule allowlist, etc.).
**Current text:** Line 279 "F7 | `source-polish.e2e.ts` | 0"; §9 line 467 "`source-polish.e2e.ts` inventory now reports 0; file drops out of G1 scope."
**Evidence:** `grep -c "waitForTimeout" packages/app/tests/stress/source-polish.e2e.ts` → 1.
**Status:** CONTRADICTED
**Suggested resolution:** Update the overlap table row to "F7 | source-polish.e2e.ts | 1". In §9 scope hypothesis, put source-polish back IN scope for G1 (it is already in US-16). Adjust downstream counts.

---

### [H6] Finding: D-Q33 references `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md §13 "QA-046 (cross-browser testing)"` — QA-046 does not exist in that spec

**Category:** FACTUAL
**Source:** T1 (codebase) + spec cross-reference
**Location:** D-Q33 line 550, §11 OQ#33 line 658, §1 probe 1 ("SPEC QA-046"), §15 Future Work reference
**Issue:** D-Q33 commits to "Update `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md §13 to re-classify QA-046 (cross-browser testing) as Deferred". Grep of the clipboard spec shows **no "QA-046" anywhere**. The clipboard spec's §13 is titled "In Scope (implement now)", not an AC/QA section. §1's probe 1 references "Act-5 (SPEC QA-046)" — also unverifiable in the clipboard spec. This creates a follow-up task that cannot be executed as written because the target doesn't exist.
**Current text:** D-Q33: "Update `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md` §13 to re-classify QA-046 (cross-browser testing) as **Deferred**…".
**Evidence:** `grep -n "QA-046" specs/2026-04-16-clipboard-mdast-canonical/SPEC.md` → no matches. `grep -n "^## " specs/2026-04-16-clipboard-mdast-canonical/SPEC.md` → §13 is "In Scope (implement now)", not an AC list.
**Status:** CONTRADICTED / UNVERIFIABLE
**Suggested resolution:** Either (a) locate the actual cross-browser requirement in the clipboard spec — it appears on line 420 as a Future Work bullet ("Playwright cross-browser clipboard virtualization edge cases") rather than a QA-046 AC — and update D-Q33's target reference, or (b) if no formal cross-browser commitment was made in the clipboard spec, delete D-Q33 entirely (no reversal needed because no commitment exists). Option (b) is more likely correct.

---

### [H7] Finding: Evidence-file line-number anchors for DEV-gating are stale (line 217/216-225 → actual line 247)

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §3 Hard constraints (line 66, "`DocumentContext.tsx:217`"), §8 Test-only app hooks (line 229, "`DocumentContext.tsx:216-225`"), §11 OQ#13 footer, evidence/current-state-inventory.md §6 ("DocumentContext.tsx:216-225"), D-Q13 rationale, research evidence files ("`DocumentContext.tsx:217`")
**Issue:** The actual DEV-gating `if (import.meta.env.DEV)` block in `packages/app/src/editor/DocumentContext.tsx` is at **line 247** (extends to ~line 266). The spec's repeated "217" / "216-225" references are stale by ~30 lines. Secondary: the spec's inlined code snippet at line 232 claims the block contains `window.__providerPool = p; Object.defineProperty(window, '__activeProvider', {…}); window.__test_rejectSyncPromise = …; window.__test_armPendingRejection = …; window.__test_closeActiveWebSocket = …;`. Current line 247+ contains all five hooks, so the content claim is correct — only the anchors are wrong.
**Current text:** §3 line 66: "Existing precedent: `packages/app/src/editor/DocumentContext.tsx:217` (`window.__activeProvider` etc.)." §8 line 229: "`DocumentContext.tsx:216-225` establishes the canonical DEV-gating pattern".
**Evidence:** Read of DocumentContext.tsx shows the `if (import.meta.env.DEV) {` guard on line 247. Lines 216-225 are actually part of the `useCollabUrl()` destructure and `useTransition` initialization — unrelated.
**Status:** STALE
**Suggested resolution:** Replace every `217` and `216-225` line anchor with `247` (or, better, drop line numbers and use symbol references like "the `if (import.meta.env.DEV)` block in `DocumentContext.tsx`'s main `useEffect`"). Same correction in `evidence/current-state-inventory.md` §6.

---

## Major findings

### [M1] Finding: AC-12 (Full Playwright suite ≤15 min CI budget) has no corresponding user story

**Category:** COHERENCE
**Source:** L5 (summary coherence) / AC coverage
**Location:** AC-12 line 195
**Issue:** AC-12 asserts the suite stays under 15 min CI budget. No US in §6b is dedicated to wall-clock performance of the suite, nor does any US mention runtime budget verification. The spec assumes the `--workers=4` setting + condition-wait migration will satisfy this, but there is no explicit testing / measurement gate. If CI runtime exceeds 15 min due to (a) chunked-paste QA-022 baseline addition, (b) video + trace capture overhead, (c) retries=2 on a failing run — no user story surfaces that failure. The AC is effectively unenforced.
**Current text:** AC-12 "Full Playwright suite completes in ≤15 min CI budget per current workflow timeout."
**Evidence:** No US in §6b mentions wall-clock measurement, budget monitoring, or runtime instrumentation. The `.github/workflows/ci.yml` timeout-minutes: 15 is a hard cutoff — hitting it = red CI. That is the gate, but the spec doesn't make the measurement explicit.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add a user story US-X that explicitly measures & gates suite runtime (e.g., "Add CI timing assertion: full suite completes in ≤14 min p95 across 5 runs"), or (b) reclassify AC-12 as an "envelope constraint, not a pass/fail gate" with a note that the CI workflow's 15-min timeout is the backstop. Option (b) is probably correct given the existing timeout.

---

### [M2] Finding: The `mode: 'replace'` → `position: 'replace'` body-key fix is mentioned without noting the API-layer semantic

**Category:** COHERENCE / completeness
**Source:** L1/L3
**Location:** §5 Out of Scope (line 99), §6a note, §7 Non-Goals
**Issue:** The spec repeatedly notes "`mode:` → `position:` body-key bug fixes. Done by PR #185; baseline." But AGENTS.md documents the API-layer semantic (`the API body key for write mode is position (not mode) — mode: 'replace' silently falls back to append`). The spec doesn't note that this is a *silent* body-parse fallback that was causing tests to write append-mode when they thought they wrote replace-mode. Without that context, a future reader may not realize that the cherry-pick's `position: 'replace'` usages in paste-fidelity.e2e.ts actually embed the body-key fix dependency. Not blocking; minor understandability issue.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Add a one-sentence note in §5 or §8 citing AGENTS.md convention so future readers understand the load-bearing nature of the fix.

---

### [M3] Finding: D-Q14 (STOP rule patterns) lists 4 ban patterns; US-22 lists 3 — subset mismatch

**Category:** COHERENCE
**Source:** L1
**Location:** D-Q14 line 511 vs US-22 line 177
**Issue:** D-Q14 (LOCKED) says "Ban these patterns: `page.waitForTimeout(`, `waitUntil: 'networkidle'`, `new Promise(resolve => setTimeout(resolve,`, `page.pause(`". US-22 says "asserting zero `page.waitForTimeout(`, zero `waitUntil: 'networkidle'`, and zero `test.skip(browserName === 'webkit'`". The two lists only share 2 patterns. US-22 adds `test.skip(browserName === 'webkit'`, which is not in D-Q14. D-Q14's `new Promise(resolve => setTimeout` and `page.pause(` are missing from US-22. Since D-Q14 is LOCKED, US-22 should match.
**Current text:** US-22 line 177: "`e2e-stop-rules.test.ts` asserting zero `page.waitForTimeout(`, zero `waitUntil: 'networkidle'`, and zero `test.skip(browserName === 'webkit'` in `tests/stress/*.e2e.ts`. No allowlist."
**Evidence:** Direct comparison.
**Status:** INCOHERENT
**Suggested resolution:** Make US-22 match D-Q14 — add `new Promise(resolve => setTimeout(resolve,` and `page.pause(` to the banned set. Keep `test.skip(browserName === 'webkit'` as a fifth pattern (a useful ratchet even though count is currently 0), and update D-Q14 to match.

---

### [M4] Finding: D-Q5 rationale claims "Research confirmed" `failOnFlakyTests` adoption but research explicitly notes zero surveyed projects use it

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity)
**Location:** D-Q5 rationale (line 506)
**Issue:** D-Q5's rationale reads "Research: Playwright v1.52+ supports failOnFlakyTests. retries=2 absorbs infrastructure noise; failOnFlakyTests surfaces retry-success as failure so quiet flakes don't rot. Combined = tolerant runner, strict verdict." This frames the decision as research-supported. The research evidence (`reports/.../evidence/oss-config-survey.md` line 62 and REPORT.md §Dimension 5 line 246) says the opposite: "None of the surveyed projects use `failOnFlakyTests`. Teams treat `flaky` as a soft signal to investigate, not a hard failure." The decision is pioneering versus the community norm, not following it.
**Current text:** D-Q5 rationale.
**Evidence:** `reports/playwright-e2e-observability-determinism-best-practices/evidence/oss-config-survey.md` line 62; REPORT.md §Dimension 5 line 246.
**Status:** INCOHERENT (prose misaligned with cited evidence)
**Suggested resolution:** Rewrite D-Q5 rationale to acknowledge the novelty: "Playwright v1.52+ supports `failOnFlakyTests`. Community survey found zero surveyed projects use it — the pattern is pioneering. We adopt it because OK's greenfield-discipline prefers flakes surfaced loudly over silent retry-success. R4 tracks the rollout risk." The honest framing also strengthens R4's rationale.

---

### [M5] Finding: §11 has 42 OQs; changelog says 30 decisions captured, actual count is 33 D-Q entries

**Category:** COHERENCE / COUNT
**Source:** L5
**Location:** §10 Decision Log, `_changelog.md` Phase 4 entry ("30 total")
**Issue:** The changelog entry for Phase 4 says "Decisions captured (30 total)" and enumerates them. The actual table count: Cluster 1 (10) + Cluster 2 (6) + Cluster 3 (3) + Cluster 4 (3) + Cluster 8 (7) + Cluster 9 (4) = **33**. The changelog's enumerated list also sums to 33, not 30 — the "30 total" summary is just wrong arithmetic.
**Current text:** `_changelog.md` line 91: "Decisions captured (30 total):"
**Evidence:** Counted entries.
**Status:** INCOHERENT (minor count error)
**Suggested resolution:** Fix the changelog number to 33.

---

### [M6] Finding: §4 "First-pass open questions" references `flakyTestsFail` — research's [H1] audit finding already corrected this name to `failOnFlakyTests`

**Category:** FACTUAL / STALE
**Source:** L4 / research-audit consistency
**Location:** §4 OQ#14 line 92
**Issue:** §4 is a Phase-1 artifact and left as-is. But it references `flakyTestsFail` — the research report's own audit (`reports/.../meta/audit-findings.md` [H1]) identifies this as a hallucinated API name; the correct name is `failOnFlakyTests`. The spec's §11 OQ#14 at line 603 uses the CORRECT name, but §4 OQ#14 at line 92 does not. Minor but worth fixing to prevent future readers from propagating the bad name.
**Current text:** §4 line 92: "Should we count `flakyTestsFail` (Playwright setting) to surface retries as explicit flake signal rather than silent retry success?"
**Evidence:** Research audit finding [H1].
**Status:** STALE
**Suggested resolution:** Replace `flakyTestsFail` with `failOnFlakyTests` in §4 OQ#14.

---

### [M7] Finding: §5b claim of "6 inline copies" of sidebar locator in slash-command.e2e.ts is unverifiable post-baseline

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §5b line 111 ("Sidebar locator fix → extracted into `_helpers/sidebar.ts:sidebarFileButton(name)` (consolidates PR #188's 6 inline copies into 1 helper).")
**Issue:** §5b describes absorbing PR #188's "6 inline copies" sidebar locator fix. But §6a row 1 correctly notes this is obsolete: "Dropped during cherry-pick conflict resolution — PR #185 landed an architectural alternative (hash-URL navigation, no sidebar click) that eliminated the strict-mode vector entirely. Andrew's Fix 1 is obsolete post-#185." US-1 still calls for `sidebarFileButton` extraction. Grep confirms: no `getByRole('button'` targeting sidebar-file names exists in `slash-command.e2e.ts`. The "6 inline copies" existed pre-#185 but PR #185 made them moot. §5b presents the fix as active work; it is not.
**Current text:** §5b line 111.
**Evidence:** `grep -n "getByRole('button'" packages/app/tests/stress/slash-command.e2e.ts` → 0 matches. §6a row 1 describes the same fix as obsolete. US-1 references `ux-interactions.e2e.ts line ~223` as the remaining call-site, not slash-command.e2e.ts.
**Status:** STALE
**Suggested resolution:** Rewrite §5b line 111 to: "Sidebar locator fix → obsolete for slash-command.e2e.ts per §6a row 1 (PR #185 eliminated the strict-mode vector via hash-nav). US-1 still extracts `sidebarFileButton` for the one residual use in `ux-interactions.e2e.ts` + future tests." Keep US-1 as is.

---

### [M8] Finding: D-Q13 rationale cites "precedent #19(b) with DEV-gating" — precedent #19(b) is about clipboard hooks, not DEV-gating

**Category:** COHERENCE (cross-reference drift)
**Source:** L1 / cross-reference consistency
**Location:** D-Q13 rationale line 523 ("If investigation in Cluster 5/6/7 surfaces a need, add per precedent #19(b) with DEV-gating."), §15 "Identified" line 715 ("Precedent #19(b) + `DocumentContext.tsx:216` establishes the DEV-gating pattern.")
**Issue:** Precedent #19(b) in AGENTS.md line 129 reads: "WYSIWYG uses PM's documented clipboard hooks. `clipboardTextSerializer` … DOM-level `handleDOMEvents.copy/cut/dragstart` is **prohibited**". It is entirely about clipboard hook mechanisms in ProseMirror, not DEV-gating. The spec's multiple references to "precedent #19(b)" as the DEV-gating precedent appear to be crossed wires — likely meant to reference a different precedent or no precedent at all (the DEV-gating pattern is just idiomatic Vite, not an enumerated OK precedent).
**Current text:** §15 line 715: "Precedent #19(b) + `DocumentContext.tsx:216` establishes the DEV-gating pattern."; D-Q13: "add per precedent #19(b) with DEV-gating".
**Evidence:** AGENTS.md line 129 — precedent #19(b) content is clipboard hooks, not DEV-gating. The DEV-gating pattern isn't a numbered precedent in AGENTS.md at all.
**Status:** INCOHERENT
**Suggested resolution:** Remove "precedent #19(b)" references or replace with "existing DEV-gating convention established in `DocumentContext.tsx` line 247 block." US-23 proposes creating a "precedent #20" — that's the appropriate anchor. Don't claim it exists already.

---

### [M9] Finding: §8 "Browser install: correct 3-command split" is stale (now single chromium install)

**Category:** FACTUAL / STALE
**Source:** T1 (codebase)
**Location:** §8 CI workflow line 258 ("Browser install: correct 3-command split (binary install + per-browser install-deps) — shipped in the clipboard PR.")
**Issue:** The actual `.github/workflows/ci.yml` playwright job step is `bunx playwright install --with-deps chromium` — a single command. The spec §8 describes the old state of "3-command split (binary install + per-browser install-deps)" as if it were still current. That state was reverted by commit `940d5a0a` (chromium-only).
**Current text:** §8 line 258.
**Evidence:** `.github/workflows/ci.yml` line 117: `bunx playwright install --with-deps chromium`.
**Status:** STALE
**Suggested resolution:** Rewrite to "Browser install: single `bunx playwright install --with-deps chromium` (chromium-only per commit 940d5a0a)."

---

## Minor / stylistic findings

### [L1] Finding: §1 Complication bullet 1 says "55 `page.waitForTimeout(N)` magic sleeps across 6 files" — contradicts §8's 74 across 7 files

**Category:** COHERENCE (count)
**Location:** §1 line 15
**Issue:** §1 SCR opens with "55 waitForTimeout … across 6 files". §8 says 73 (claimed) / 74 (actual) across 7 files. Three competing counts.
**Suggested resolution:** Reconcile §1's count to match §8 (after fixing [H3]).

---

### [L2] Finding: Test suite LoC count in §8 is 5,406 — actual is 5,598 (off by 192)

**Category:** FACTUAL / minor
**Location:** §8 line 216 ("13 files, 5,406 LoC, 134 tests")
**Issue:** `wc -l packages/app/tests/stress/*.e2e.ts` → 5,598. Minor staleness likely from a pre-cherry-pick snapshot.
**Suggested resolution:** Update to 5,598.

---

### [L3] Finding: slash-command.e2e.ts LoC claim in surface-area map (§9) says "across 762" — actual is 720

**Category:** FACTUAL / minor
**Location:** Surface-area map row line 419 ("~200 LoC touched across 762")
**Issue:** Actual `wc -l` is 720. Similar staleness.
**Suggested resolution:** Update to 720.

---

### [L4] Finding: paste-fidelity.e2e.ts LoC claim in surface-area map says "across 1245" — actual is 1,308

**Category:** FACTUAL / minor
**Location:** Surface-area map row line 420 ("~100 LoC touched across 1245")
**Suggested resolution:** Update to 1,308.

---

### [L5] Finding: QA-022 test line is 958, not 954 as main-ci-failure-inventory.md claims

**Category:** FACTUAL / minor
**Location:** `evidence/main-ci-failure-inventory.md` row 13 ("paste-fidelity.e2e.ts:954")
**Issue:** Actual test definition is at line 958 (`test('QA-022 no frame exceeds ~16ms during chunked 1MB paste...`). The `.describe` that wraps it starts at 945.
**Suggested resolution:** Update to 958 for readability in future CI-triage sessions.

---

### [L6] Finding: §4 and §11 are two parallel OQ lists; no explicit statement that §11 supersedes §4

**Category:** COHERENCE (doc structure)
**Location:** §4 (lines 75-94, 15 items) vs §11 (lines 588-670, 42 items)
**Issue:** Spec readers will likely assume §4 is still active. §4 is a Phase-1 snapshot; §11 is the Phase-3 systematic extraction. The spec doesn't note that §4 is superseded. Minor structural clarity issue.
**Suggested resolution:** Add a one-line note at the top of §4: "Superseded by §11's systematic Phase-3 extraction. Kept here for changelog continuity."

---

### [L7] Finding: §14 section header is a dangling "N/A" placeholder

**Category:** COHERENCE
**Location:** Line 705 ("## §14 Interaction State Matrix — N/A (test-infra spec, no user-facing UX)")
**Issue:** Not an error — but a future spec reader might want to know what "§14 Interaction State Matrix" is for other specs. A one-line forward reference would help.
**Suggested resolution:** Append ", see the spec template for the generic intent." Or just leave as-is; it's acceptable.

---

### [L8] Finding: D-Q3 commits to "No new data-attribute needed" for slash menu — but §9 target-state diagram prominently adds `data-state=` attributes

**Category:** COHERENCE (internal)
**Location:** D-Q3 line 561 ("Signal: 'visible items count matches filtered results.' No new data-attribute needed."), §9 diagram "DATASTATE['data-state= attributes (new test-signal surface)']" styled green ("primary asset we build on")
**Issue:** D-Q3 says no new data-attributes are needed for the slash menu. §9's target-state diagram adds `data-state=` attributes as a new green-styled surface — suggesting they ARE part of the target architecture. Either the diagram overstates (D-Q3 wins) or D-Q3 under-commits. Not clearly a contradiction — D-Q3 could mean "for the slash-menu specifically" while the diagram refers to broader editor readiness — but the reader may conflate them.
**Suggested resolution:** Clarify in either §9 or D-Q3: "D-Q3 applies to slash menu only; editor-wide `data-state=` additions (if any) would be scoped per migration site per D-Q1's category (A-D)."

---

## What I verified as solid

**Strong, source-grounded claims:**

1. **D-Q16 (`resolved: false` hardcoding parity).** I verified `packages/core/src/markdown/mdast-to-hast-handlers.ts:57-79` — `wikiLinkHandler` indeed omits `data-resolved`. The spec's reasoning (two parseHTML rules serve different sources) checks out.

2. **D-Q17 (`wrapAsInlineCode` test matrix coverage).** I verified `packages/core/src/markdown/index.ts:217-239` — `wrapAsInlineCode` has exactly the 4 branches (empty, text-only, single-wrapper, heterogeneous) the 6-case matrix covers.

3. **D-Q18 (mark handler flatten-bug is isolated to `markHandlers.code`).** I verified `packages/core/src/markdown/index.ts:893-969`. `markHandlers.emphasis`, `.strong`, `.link`, `.escapeMark`, `delete`/`strike` all pass `children` through to structured mdast nodes via `fromPmMark` or preserve inline structure. Only `code` has the leaf-type flatten. D-Q18 is correct.

4. **D-Q4 (Hocuspocus reconnect timers must remain real for `crdt-stress.e2e.ts`).** The research evidence (`evidence/page-clock-crdt-compatibility.md` Findings 5-6) directly supports this — `setInterval` for connection checker, awareness heartbeat, force-sync, and `setTimeout` for reconnect-after-close are all overridden by `page.clock.install()`. D-Q4 correctly identifies the incompatibility.

5. **D-Q29 (`page.clock` scope for Observer A 50ms / Observer B 300ms / persistence 2s).** I verified:
   - Observer A 50ms debounce: AGENTS.md line 283 confirms "50ms debounce via injected Scheduler" for server observers.
   - Observer B 300ms: `packages/app/src/editor/observers.ts:82` confirms `const TYPING_DEFER_MS = 300`.
   - Persistence 2s: `packages/server/src/standalone.ts:127` confirms `debounce = 2000`.

6. **Greenfield directive adherence on main decisions.** The spec explicitly rejects deferred debt in §5c / _changelog.md Phase 2 reshape — e.g., REJECTED "overlap files deferred to follow-up" (subsume everything) and REJECTED "STOP rule with 2-file allowlist" (full enforcement). Consistent with CLAUDE.md greenfield directive.

7. **F11, S6, QA-022, sidebar-folder test locations.** All four locations verified:
   - F11: `docs-open.e2e.ts:428` — confirmed.
   - S6: `crdt-stress.e2e.ts:21` — confirmed.
   - QA-022: `paste-fidelity.e2e.ts:958` (spec says 954 — see [L5]).
   - sidebar-folder: `ux-interactions.e2e.ts:209` — confirmed.

8. **§6b US sum aligns with §8 inventory (pre-H3 correction).** US-11 (44) + US-12 (19) + US-13 (5) + US-14 (2) + US-15 (2) + US-16 (1+1) = 74. This matches the actual tree count. The "73" claim in §8, §9, and the Phase-5 changelog entry is internally wrong; the US sums are right.

9. **AC-to-US mapping is mostly complete.** Each of AC-1 through AC-13 maps cleanly to at least one US (except AC-12 per [M1]). No orphan ACs and no orphan-scale USes (US-7, US-18, US-23, US-24 are intentionally process-level, which is fine).

10. **Research evidence for `page.clock` incompatibility with WebSocket-driven CRDT tests** (D-Q4, D-Q29) is well-reasoned and the research file (`evidence/page-clock-crdt-compatibility.md`) matches the spec's claims with direct source evidence from `node_modules/yjs/` and `node_modules/@hocuspocus/provider/`. High confidence.

## Unverifiable Claims

- **QA-046 in clipboard spec.** I could not verify that the clipboard spec committed to cross-browser testing as "QA-046" — grep shows no such ID in that spec. [H6] flags this. Either the ID is misremembered or the commitment was made informally outside SPEC.md.
- **"6 inline copies" of sidebar locator in slash-command.e2e.ts pre-#185.** I cannot easily verify this count against pre-rebase history without a significant git archaeology dive. The claim is plausibly the original #188 scope; [M7] notes the scope is obsolete post-baseline.
- **Baseline CI variance (A5).** The spec's assumption A5 ("CI variance is bounded enough for `2× baseline` to be a signal") is rated LOW confidence with an empirical-measurement verification plan. That's appropriately calibrated — not an audit miss.
