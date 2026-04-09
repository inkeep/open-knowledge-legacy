# Drift Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/crdt-stress-hardening/specs/2026-04-08-crdt-stress-testing/SPEC.md`
**Audit type:** Targeted drift audit (post-rebase from `9380859` to `3f4d7b1`)
**Audit date:** 2026-04-08
**Total findings:** 4 (0 high, 3 medium, 1 low)

Scope: 10 targeted checks against the rebased + adapted spec (commit `f91d4c1`). The major path bulk-replace and semantic updates landed cleanly. Three internal incoherences caught (all pre-existing leftovers from earlier audit cycles that survived the rebase pass), one minor line-number drift.

---

## High Severity

_None._ All load-bearing factual claims about the rebased codebase verify against actual files.

---

## Medium Severity

### [M1] Finding: Layer B description in §9 still references rejected `/api/dump-ydoc` endpoint

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §9 "Test layers" Layer B (SPEC.md L244-249) vs §9 detailed Layer B (L310-322) and §10 D9 + Alternatives at L513
**Issue:** The "Test layers" introductory paragraph for Layer B still says the script "Reads final state via a new `/api/dump-ydoc` endpoint OR via the existing agent-undo-status + content-read path (TBD during iterate)" and "Asserts strict convergence." Both clauses are directly contradicted by the post-H3 reframing 60 lines later (L310-322): Layer B reads **Y.Text only** via `provider.document.getText('source').toString()`, uses **containment-based** assertions, and explicitly does **NOT** assert the bridge invariant. Furthermore, "Alternatives considered" at L513 explicitly says: "Add a test-only `/api/dump-ydoc` endpoint for Layer B — Rejected per D9." A cold reader hitting L247 first will get a materially wrong picture of Layer B.
**Current text:** L247: "Reads final state via a new `/api/dump-ydoc` endpoint OR via the existing agent-undo-status + content-read path (TBD during iterate)." L248: "Asserts strict convergence."
**Evidence:** Same spec, L310-322 (Layer B detailed section) and L513 (Alternatives considered).
**Status:** INCOHERENT
**Suggested resolution:** Update L244-249 to match the post-H3 framing — drop the `/api/dump-ydoc` reference, change "Asserts strict convergence" to "Asserts HTTP contract + server-side UndoManager behavior via containment checks against Y.Text only."

---

### [M2] Finding: FR2 test-case count and scenario list contradict the Layer A breakdown

**Category:** COHERENCE
**Source:** L1 + L5 (summary coherence)
**Location:** §6 FR2 (SPEC.md L93) vs §9 Layer A breakdown (L300)
**Issue:** This is the same H4 incoherence pattern from the original audit, recurring in updated form after the rebase pass. FR2 says: "Runs 7 scenarios (S1-S5, S8, S9) across up to 4 scale tiers. See §9 scenario matrix for the exact test-case count (**23 cases** as of current spec)." But the Layer A breakdown at L300 explicitly tallies **34 test cases**, and the breakdown enumerates **9 scenarios** (S1, S2, S3, S4, S4b, S5, S5b, S8, S9) — FR2 omits S4b and S5b. The "23 cases" figure is from a prior revision that pre-dates D19 (S4b) + D20 (S5b) + the parameterized Unicode variants in D14.

Additionally, FR2's "two-tier convergence (bridge invariant + **applyUpdate-restore semantics via S9**)" misrepresents D13. D13 (L538) defines two-tier as "(1) bridge invariant ... (2) content preservation via `.toContain()` for user keystrokes." S9 is a single scenario for restored-doc init testing, not an alternative tier-2 assertion definition.
**Current text:** FR2: "Runs 7 scenarios (S1-S5, S8, S9) across up to 4 scale tiers. See §9 scenario matrix for the exact test-case count (23 cases as of current spec). Asserts two-tier convergence (bridge invariant + applyUpdate-restore semantics via S9)."
**Evidence:** §9 L300 "Layer A total: 34 test cases." Layer A breakdown at L290-300 enumerates S1, S2_ascii, S2_unicode, S3, S4_ascii, S4_unicode, S4b, S5_ascii, S5_unicode, S5b, S8, S9 totaling 34. D13 at L538 defines two-tier convergence.
**Status:** INCOHERENT
**Suggested resolution:** Update FR2 to: "Runs 9 scenarios (S1-S5, S4b, S5b, S8, S9) with parameterized Unicode variants for S2/S4/S5 across up to 4 scale tiers — 34 test cases total per §9 Layer A breakdown. Asserts two-tier convergence (bridge invariant + content preservation via `.toContain()` per D13)."

---

### [M3] Finding: §8 captureTimeout line reference points to comment block end, not the actual code

**Category:** FACTUAL
**Source:** T1
**Location:** §8 "Known gaps/bugs" (SPEC.md L199)
**Issue:** §8 says "captureTimeout divergence: ... Documented in code comment at `packages/server/src/agent-sessions.ts:72`." Line 72 is the closing `*/` of the JSDoc block; the actual `captureTimeout: 0` line is **L80**, and the JSDoc explanation begins at L65. A reader following the citation will see only the closing `*/` of a comment, not the divergence note. Minor but worth tightening since the rest of §8's line citations are precise.
**Current text:** "Documented in code comment at `packages/server/src/agent-sessions.ts:72`."
**Evidence:** `packages/server/src/agent-sessions.ts` — JSDoc spans L61-72, `captureTimeout: 0` at L80. Confirmed via file read.
**Status:** STALE (drifted by 8 lines, likely because comment lines were added pre-rebase)
**Suggested resolution:** Change reference to `agent-sessions.ts:65-80` (covering both the JSDoc explanation and the actual `captureTimeout: 0` line) or just `agent-sessions.ts:80`.

---

## Low Severity

### [L1] Finding: Evidence file `test-reset-isolation.md` cites `agent-sessions.ts:~100` for `closeAll`, actual is L143

**Category:** FACTUAL
**Source:** T1
**Location:** `evidence/test-reset-isolation.md` L5
**Issue:** Evidence file lists "packages/server/src/agent-sessions.ts:~100 (closeAll — extracted from pre-monorepo closeAllAgentSessions)". The `closeAll` method is actually at L143. The `~` prefix signals approximate, but the drift is ~40 lines, large enough to be unhelpful for navigation.
**Current text:** "packages/server/src/agent-sessions.ts:~100 (closeAll — extracted from pre-monorepo closeAllAgentSessions)"
**Evidence:** `grep -n closeAll packages/server/src/agent-sessions.ts` returns L143.
**Status:** STALE
**Suggested resolution:** Update evidence file to `agent-sessions.ts:143`.

---

## Confirmed Claims

All 10 targeted checks resolved cleanly except the items above. Verified against actual codebase:

**Check 1 — Path correctness (all spot-checked paths exist):**
- `packages/app/src/editor/observers.ts` — exists, contains current observer code
- `packages/app/src/editor/observers.test.ts` — exists, **26 tests pass** (`bun test` confirmed)
- `packages/app/src/editor/observer-sync.test.ts` — exists (NEW on main per `99ea308`)
- `packages/app/src/server/agent-flow.test.ts` — exists (NEW on main per `99ea308`). NB: spec §8 L221 says `packages/app/src/server/agent-flow.test.ts` which is correct (note: it's `app/src/server`, not `packages/server` — spec gets this right).
- `packages/server/src/api-extension.ts` — exists, `handleTestReset` at **L273** exactly as claimed
- `packages/server/src/agent-sessions.ts` — exists, `syncTextToFragment` at **L39** exactly as claimed
- `packages/core/src/utils/identity.test.ts`, `packages/core/src/extensions/*.test.ts` — exist
- `packages/server/src/file-watcher.test.ts`, `packages/server/src/persistence.test.ts` — exist
- `packages/cli/src/config/*.test.ts` — exist
- `packages/app/tests/` — does **NOT** exist (correct — spec creates it; `tests/` is a new directory)

**Check 2 — Observer semantic claims verified against current code:**
- Observer A `transaction.local` guard at `observers.ts:331` (`if (!transaction.local) return;`) ✓
- Observer B `transaction.local` guard at `observers.ts:419` (`if (!transaction.local) return;`) ✓
- `syncTextToFragment` exists at `agent-sessions.ts:39`, exported, runs server-side ✓
- `handleTestReset` at `api-extension.ts:273`, does **NOT** call `debouncer.executeNow` (D18 patch confirmed not yet applied) ✓
- Gap 2 fix from `e3ff705`: `oldPadded`/`newPadded` at `observers.ts:135-139` is on our branch, **NOT on `3f4d7b1` main** (`git show 3f4d7b1:packages/app/src/editor/observers.ts` confirmed the unpadded version) ✓

**Check 3 — D18 scope verified:**
- `handleTestReset` at `api-extension.ts:273-291` reads: `closeAll() → closeConnections('test-doc') → unloadDocument(doc) → writeFileSync(test-doc.md, '')`. No flush/executeNow call anywhere in the function. D18's claim that the patch belongs in this file and has not been applied is correct.

**Check 4 — Layer B framing (post-H3 narrowing):**
- §9 Layer B detailed section L310-325 clearly states the Option E framing: fresh provider per scenario, reads Y.Text only, containment-based assertions, does NOT assert bridge invariant. The framing is internally clear in that section. **However**, the introductory L244-249 still has stale pre-H3 text (see M1 above). The detailed section is correct; the intro is contradictory.

**Check 5 — Playwright infrastructure:**
- `find packages -name "playwright.config*"` returns **zero results**.
- `find packages -name "*.spec.ts" | grep -v node_modules` returns **zero results**.
- `@playwright/test ^1.59.1` is in `packages/app/package.json` devDependencies.
- `test:e2e` script defined as `npx playwright test`.
- All matches the spec's §8 L228-229 claim that Layer C will be the first Playwright test in the new structure and §16 L668-669 claim that `packages/app/playwright.config.ts` is a NEW file.

**Check 6 — Scenario matrix integrity:**
- §9 matrix at L266-279 contains all expected scenarios: S1, S2 (with ASCII+Unicode), S3, S4 (with ASCII+Unicode), S4b, S5 (with ASCII+Unicode), S5b, S6, ~~S7 (struck through)~~, S8, S9. Layer A breakdown sums to 34 cases. Layer B breakdown sums to 12 cases. The bulk path replace did not mangle the table.

**Check 7 — Decision log integrity:**
- All 22 decisions present (D1-D22 with D12 superseded). Spot-checked D3 (test infrastructure), D9 (Layer B narrowing), D10 (Playwright), D13 (convergence assertion), D14 (Unicode parameterization), D18 (test-reset force-flush) — each is internally consistent and references the correct post-rebase paths. D9 explicitly references `HocuspocusProviderWebsocket.ts:179-181` for the WebSocket polyfill claim, D18 cites `Hocuspocus.ts:545-552` for the unload race — both upstream OSS source references survive the rebase.

**Check 8 — New test files referenced in §8:**
- `packages/app/src/editor/observer-sync.test.ts` exists ✓
- `packages/app/src/server/agent-flow.test.ts` exists ✓
- (Note: spec §8 does not explicitly state line counts or specific test names for these — only that they exist on main as cross-tab guard coverage. Existence verified; content not deeply audited per drift-audit scope.)

**Check 9 — Cross-finding coherence on `currentText === md` early-exit:**
- `observers.ts:289-306` contains the consolidated comment block that explicitly covers both the disk-bridge feedback loop AND the Observer B external-write propagation cases. The comment text reads exactly as the spec describes: "This guard covers two independent cases (both fixes converged on the same check): 1. Disk-bridge feedback loop ... 2. Observer B external-write propagation."
- §8 L198 spec text accurately describes the convergence: "Our fix ... converged with main's commit `b289cc6` (disk bridge feedback loop fix) which added the same `currentText === md` early-exit for a different reason. Both are now in the rebased code." Verified.

**Check 10 — Fresh-eyes catches:**
- Found M1, M2, M3, L1 above. No additional structural surprises. The rebase adaptation is mechanically sound: paths are right, semantic claims about main's state are right, the four leftover incoherences are pre-existing FR2/Layer-B-intro mismatches that survived the bulk update and a minor line-number drift in §8.

---

## Unverifiable Claims

None — all spot-checked claims either confirmed or flagged.

---

## Summary

**Drift audit verdict:** The rebase + adaptation pass landed cleanly on the substantive claims. Every load-bearing path verifies against the actual `packages/*` structure. The two major semantic shifts (`transaction.local` guards on both observers + server-side `syncTextToFragment` pairing) are accurately reflected in §8. D18's scope, the gap 2 fix isolation to our branch, and the 26/26 observers test pass are all verified.

**The 4 findings are all leftovers, not rebase-introduced regressions:**
- M1 (Layer B intro stale `/api/dump-ydoc` mention) — survived from pre-H3 audit
- M2 (FR2 test-case count "23 cases / 7 scenarios") — H4 pattern recurring; FR2 was not updated when D19/D20/D14 added scenarios
- M3 (`agent-sessions.ts:72` line drift) — comment block grew between revisions
- L1 (`closeAll` line drift in evidence file) — minor

None of the findings change scope or invalidate decisions. All four are quick text fixes; the parent's resolution pass should be a 5-minute edit.
