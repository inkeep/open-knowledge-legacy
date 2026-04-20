# Audit Findings

**Artifact:** `specs/2026-04-16-bridge-correctness/SPEC.md`
**Audit date:** 2026-04-16
**Total findings:** 15 (2 High, 7 Medium, 6 Low)

Scope verified: every file:line citation in the SPEC and evidence files against actual source at baseline commit `432a834b`; every `§D*` citation against `reports/yjs-transaction-settlement-hooks/REPORT.md` and `reports/three-way-merge-content-preservation/REPORT.md`; every numbered requirement (R0, R0b, R0c, R1-R12) for resolution-completeness-gate applicability; internal cross-consistency between §1 Resolution, §6 Requirements, §10 Decision Log, §11 Open Questions, §15 Future Work.

---

## High Severity

### [H] Finding 1: Cited `specs/2026-04-15-lossless-bridge-merge/CONSIDER.md` does not exist in this worktree

**Category:** FACTUAL (pure correction)
**Source:** T1 (own codebase)
**Location:** SPEC.md line 8 (header), line 22 (§1 Complication)
**Issue:** The SPEC header lists `specs/2026-04-15-lossless-bridge-merge/CONSIDER.md` as a "Related spec" (hand-off) and §1's Complication sources the flake characterization from this file. The file does NOT exist at `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness/specs/2026-04-15-lossless-bridge-merge/` (the directory has only `SPEC.md` + `evidence/`). It does exist in a different worktree (`.claude/worktrees/ship-lossless-bridge-merge/specs/2026-04-15-lossless-bridge-merge/CONSIDER.md`), which is inaccessible from this working tree.

**Current text (line 8):** `- specs/2026-04-15-lossless-bridge-merge/CONSIDER.md (hand-off from ship-lossless-bridge-merge worktree; flake context)`
**Current text (lines 22-23):** `A post-ship investigation (specs/2026-04-15-lossless-bridge-merge/CONSIDER.md) reproduced a fuzz-convergence flake at seed 1776386718697...`

**Evidence:**
```
$ ls /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness/specs/2026-04-15-lossless-bridge-merge/
evidence
SPEC.md
$ ls /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/ship-lossless-bridge-merge/specs/2026-04-15-lossless-bridge-merge/
CONSIDER.md
evidence
SPEC.md
```

The flake-context content that CONSIDER.md contains (seed `1776386718697` reproduction at 40-60%, seed `1776368799815` in CI run `24530510201`, PR #172 bisect exoneration) is load-bearing for §1 Complication and §11 Q4, and none of it is redundantly captured elsewhere in this worktree's evidence.

**Status:** CONTRADICTED
**Suggested resolution:** Either (a) copy `CONSIDER.md` into this worktree (e.g. under `evidence/` or as `specs/2026-04-15-lossless-bridge-merge/CONSIDER.md`) and keep the citation, (b) absorb the flake characterization into a new `evidence/flake-handoff.md` in this spec and re-cite, or (c) drop the CONSIDER.md citation and inline the ~5-sentence flake summary the SPEC actually uses. Option (b) is cleanest for greenfield traceability — an auditor in this worktree should not need to navigate sibling worktrees.

---

### [H] Finding 2: SPEC §3 and D4 cite `§D3` for single-CRDT collapse; §D3 covers Khanna-Kunal-Pierce impossibility, §D5 covers single-CRDT collapse

**Category:** FACTUAL (with DECISION-IMPLICATING second-order concern)
**Source:** T3 / T4 (cross-report verification)
**Location:** SPEC.md line 96 (§3 Non-goals), line 354 (D4 rationale)
**Issue:** Both citations point to `reports/three-way-merge-content-preservation/REPORT.md §D3` as the evidence that single-CRDT collapse is "the only structurally-correct long-term answer." But in the actual report:
- **§D3** = "Khanna-Kunal-Pierce 2007 formally characterizes diff3's negative properties" (line 92) — the *impossibility result*, not the escape mechanism.
- **§D5** = "Peritext / Automerge collapse the bridge by being a single CRDT" (line 117) — the single-CRDT-collapse argument.

The report's own §Recommendation 4 says "Per D3, no purely-plaintext three-way merge can guarantee content preservation... the only structural escape is to eliminate the type boundary — adopt a single CRDT" — it connects D3 (impossibility) to the collapse recommendation, but the concrete single-CRDT section is D5.

**Current text (line 96):** `per reports/three-way-merge-content-preservation/REPORT.md §D3 but is a subsequent spec`
**Current text (line 354):** `per research (reports/three-way-merge-content-preservation/REPORT.md §D3), only single-CRDT collapse provides STRUCTURAL content-preservation`

**Evidence:** `reports/three-way-merge-content-preservation/REPORT.md` line 117: `### D5: Peritext / Automerge collapse the bridge by being a single CRDT`

**Status:** CONTRADICTED (minor citation inaccuracy)
**Suggested resolution:** Change `§D3` to `§D3 + §D5` (or `§D5 and Recommendation 4`) in both locations. D3 establishes the impossibility; D5 establishes the escape mechanism. D4's rationale is most precisely grounded in `D3 (impossibility) → D5 (single-CRDT as escape) → Recommendation 4 (OUT-OF-SCOPE here, IN-SCOPE framing for post-condition)`.

**Why this is DECISION-IMPLICATING:** D4-LOCKED's rationale rests on the chain "research proves dual-CRDT cannot be correct → single-CRDT collapse is the only answer → defer to subsequent spec." If the evidence anchor is mis-cited (D3 vs D5), a careful reader cross-referencing the report will lose confidence in the premise. The rationale itself is sound; the citation precision is off.

---

## Medium Severity

### [M] Finding 3: SPEC R5 describes `pauseInbound`/`resumeInbound` as "wall-clock pause" — they are boolean-flag-gated atomic queue/flush primitives with no wall-clock component

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md line 186-189 (R5)
**Issue:** R5 reads: `"Replace pauseInbound/resumeInbound wall-clock pause in packages/app/tests/integration/network-control.ts with a structural gate..."`. But `network-control.ts:48-58` implements these primitives as:
```
pauseInbound(): void { this.paused = true; }
resumeInbound(): void {
  this.paused = false;
  while (this.inboundQueue.length > 0) { /* flush */ }
}
```
No `setTimeout`, no `Date.now()`, no wall-clock. The wall-clock coupling that R5 wants to eliminate is in the *surrounding* `wait(ms)` calls that interleave with pause/resume (e.g., fuzz.test.ts op-handlers call `wait(500)` between pause and subsequent edits). The primitives themselves are already structural.

**Current text (lines 186-189):** `Replace pauseInbound/resumeInbound wall-clock pause in packages/app/tests/integration/network-control.ts with a structural gate that waits for Y.Doc quiescence (no pending transactions).`

**Evidence:** `packages/app/tests/integration/network-control.ts:48-58` (paused-flag + FIFO queue — no wall-clock).

**Status:** CONTRADICTED
**Suggested resolution:** Rewrite R5 to match intent. Two interpretations:
- If the intent is "replace `wait(ms)` calls in the fuzz harness that surround `pauseSync`/`resumeSync` usage with `awaitDocQuiescence`", say that directly — the primitives stay; the wall-clock-pause pattern in the *harness* goes away.
- If the intent is "add something additional to `pauseInbound`/`resumeInbound` (e.g. pause-outbound)", that's a different scope and should be its own R-number.

(Related finding: the fuzz harness actually uses `pauseSync`/`resumeSync` — the user-facing API at `test-harness.ts:289-295` — not the low-level `pauseInbound`/`resumeInbound` directly. R5's naming targets the wrong layer.)

---

### [M] Finding 4: D5's citation omits §D4 despite invoking "ecosystem precedent (y-prosemirror production use)" as rationale

**Category:** FACTUAL
**Source:** T4 (report cross-reference)
**Location:** SPEC.md lines 362-367 (D5 rationale)
**Issue:** D5 cites `yjs-transaction-settlement-hooks/REPORT.md §D1, §D2, §D3`. The rationale text explicitly claims "ecosystem precedent (y-prosemirror production use)" — but y-prosemirror is the topic of §D4 ("Observer composition pattern (ecosystem prior art)"), not §D1/D2/D3. §D3 is Hocuspocus WebSocket ingestion.

**Current text (lines 362-367):**
> D5 (LOCKED, evidence-based, MEDIUM confidence) — Bucket B Yjs hook: ... Rationale: one Hocuspocus WebSocket message = one outermost transact() = one afterAllTransactions fire; ecosystem precedent (y-prosemirror production use). Evidence: reports/yjs-transaction-settlement-hooks/REPORT.md §D1, §D2, §D3.

**Evidence:** `reports/yjs-transaction-settlement-hooks/REPORT.md` line 119 `### D4. Observer composition pattern (ecosystem prior art)` which cites `y-prosemirror/src/plugins/sync-plugin.js:666-667` using `afterAllTransactions` in production.

**Status:** CONTRADICTED
**Suggested resolution:** Append `§D4` to D5's evidence citation. Corrected: `Evidence: ... §D1, §D2, §D3, §D4.`

---

### [M] Finding 5: SPEC §6 R12 ("No deferred debt. No future-work list at ship time.") directly contradicts §15 which enumerates FW-1, FW-2, FW-3

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md line 227-228 (R12) vs SPEC.md lines 460-478 (§15 Future Work)
**Issue:** R12 reads: `"No deferred debt. No future-work list at ship time. Every item in scope lands before completion."` But §15 is a list of three "FW-*" items. The SPEC attempts to resolve the tension via §15's subtitle "Subsequent specs (not 'deferred' — separable by design per greenfield directive)". This rewords the concept but does NOT satisfy the literal claim of R12.

This is a real coherence issue because:
1. A cold reader scanning §6 sees "no future-work list at ship time" and expects §15 to be empty.
2. §15's header is literally "Future Work" (not "Subsequent specs").
3. The tokens `FW-1`, `FW-2`, `FW-3` (= "Future Work" labels) are inconsistent with the prose claim.
4. In particular, FW-2 ("Upstream remarkParse super-linearity. Not owned by us") is not even a subsequent spec for us — it's a third-party tracking item, and by R12's strict reading it shouldn't be in the SPEC at all.

**Current text (R12):** `R12. No deferred debt. No future-work list at ship time. Every item in scope lands before completion.`

**Status:** INCOHERENT
**Suggested resolution:** Pick one:
- (a) Rename §15 to "Subsequent Specs" and relabel FW-1/2/3 → SS-1/2/3. Reword R12 to "No deferred debt. Subsequent specs are separate specs, not future-work buckets in this one."
- (b) Accept the terminology tension and rewrite R12 to distinguish "deferred debt" (forbidden) from "subsequent specs" (allowed) explicitly. E.g., `R12. No deferred debt. §15's 'subsequent specs' are not debt — they are bounded, separable successors. Every in-scope item lands before completion.`
Option (a) is greenfield-clean; option (b) is documentation-clean.

---

### [M] Finding 6: SPEC A1, A2 list open verification paths for questions that are already CONFIRMED in the cited research reports

**Category:** COHERENCE (stale conditionality)
**Source:** L3 (missing/stale conditionality)
**Location:** SPEC.md lines 423-430 (§12 Assumptions)
**Issue:**
- **A1:** `"doc.on('afterAllTransactions', ...) is a stable Yjs API and fires deterministically. To verify via /research."` — but Q1 one section up (line 386-389) is marked RESOLVED: `"Evidence: reports/yjs-transaction-settlement-hooks/REPORT.md §D1, §D3."` The research has already been done. A1's "To verify" is stale.
- **A2:** `"Removing setTimeout from the bridge does not create a reentrancy issue with Yjs transaction nesting. To verify via /explore + test."` — `reports/yjs-transaction-settlement-hooks/REPORT.md §D5` ("Reentrancy and nesting") covers exactly this with a confirmed finding: "A handler calling doc.transact(...) inside afterAllTransactions starts a NEW outermost drain... batch-skip predicate returns true... Handler exits without re-firing." A2's "To verify" is stale.

A3 ("applyFastDiff's DMP is CORRECT") and A4 (fuzz oracle semantics) are genuinely still open assumptions.

**Current text (lines 424-430):**
> - A1. doc.on('afterAllTransactions', ...) is a stable Yjs API and fires deterministically. To verify via /research.
> - A2. Removing setTimeout from the bridge does not create a reentrancy issue with Yjs transaction nesting. To verify via /explore + test.

**Status:** STALE
**Suggested resolution:** Promote A1 and A2 to confirmed via the research reports (e.g., mark "(CONFIRMED via yjs-transaction-settlement-hooks/REPORT.md §D1, §D3; §D5)") or remove them (they're no longer assumptions after research resolved). If the spec author wants to retain the verification trail for test-time confirmation, keep the statement but change "To verify via /research" to "Verified by §Dx; production re-verification during Bucket B implementation."

---

### [M] Finding 7: SPEC §8 Current state is a placeholder ("_To be completed after /explore pass_") yet the /explore pass has already been completed per `_changelog.md`

**Category:** COHERENCE
**Source:** L5 (summary coherence) + Phase 2 reader pass
**Location:** SPEC.md line 249 (§8 Current state)
**Issue:** §8 starts: `"_To be completed after /explore pass._"` But `meta/_changelog.md` entry "2026-04-16 — Worldmodel + 4 parallel Opus investigations complete" records the /explore pass has already been run, and `evidence/bridge-surface-map.md` is the authoritative current-state artifact per its own header ("Authoritative for current-state SPEC §8"). The "key surfaces" bullet list that follows in §8 (lines 251-260) is a rough file inventory, not a narrative.

**Current text (line 249):** `_To be completed after /explore pass._`

**Status:** STALE
**Suggested resolution:** Delete the `_To be completed..._` placeholder. Either (a) copy the narrative from `evidence/bridge-surface-map.md` into §8, or (b) explicitly cite bridge-surface-map.md as the current-state artifact and keep §8 as a pointer + "key surfaces" quick-reference.

---

### [M] Finding 8: SPEC §5 User journeys and §14 In Scope and §16 Agent Constraints are all placeholders, yet the spec is being audited

**Category:** COHERENCE (missing content)
**Source:** L5 (summary coherence)
**Location:** SPEC.md lines 125-128 (§5), lines 455-457 (§14), lines 482-484 (§16)
**Issue:**
- §5 User journeys: `"To be expanded during /spec iteration — user-facing impact is transparent..."`
- §14 In Scope: Only says `"(Numbered from §6.)"` — no actual enumeration.
- §16 Agent Constraints: `"To be populated in /spec finalize phase."`

The spec's §1 Resolution and §6 requirements are detailed; the summary / scope-consolidation sections are still empty. A spec entering audit normally has at least §14 enumerated (it's the In Scope roll-up that the Resolution Completeness Gate evaluates).

**Status:** INCOHERENT (partially-written artifact presented as audit-ready)
**Suggested resolution:** Before finalize, populate:
- §5 — one-paragraph user journey per persona (P1 is the load-bearing one; P2/P3/P4 can be short).
- §14 — explicit enumeration: Bucket 0 = {R0, R0b, R0c}; Bucket A = {R1, R2, R3}; Bucket B = {R4, R5, R6}; Bucket C = {R7, R8, R9}; Cross-cutting = {R10, R11, R12}. Lets the Resolution Completeness Gate run mechanically.
- §16 — SCOPE / EXCLUDE / STOP_IF / ASK_FIRST per the /spec template.
These placeholders are acceptable during iteration but block the Resolution Completeness Gate.

---

### [M] Finding 9: SPEC §6 R11 proposes CLAUDE.md updates but does not enumerate which precedent texts must change — implementation risk

**Category:** COHERENCE (missing acceptance criteria)
**Source:** L7 (inline source attribution)
**Location:** SPEC.md lines 219-226 (R11)
**Issue:** R11 lists five CLAUDE.md sections affected: "Precedent #11b", "Precedent #13(b)", "Propagation matrix (W1/W2 columns)", "Origin-guard truth table", "STOP rules". But only as a bullet list, no before/after text. The load-bearing claim is "STOP rules: remove debounce-related warnings if any; add settlement-hook requirement" — this is a change to a safety-critical section. An implementer needs to know *which* STOP rules to touch.

The precedent #13(b) at `CLAUDE.md:93` currently reads: `"Implicit time-coupling is a test smell. Observer debounces go through an injected Scheduler so tests are deterministic; production gets setTimeout passthrough. wait(ms) in new bridge tests requires justification."` After Bucket B, "Observer debounces go through an injected Scheduler" is false (the bridge no longer debounces). The acceptance criterion for R11 should specify the target text.

**Current text (R11):** Five bullets listing affected sections without target text.

**Status:** INCOHERENT (acceptance criteria not verifiable)
**Suggested resolution:** For each affected CLAUDE.md section, add the target text or at minimum a verification: "After R4 ships, precedent #13(b) must say X." This makes R11 verifiable — an implementer can diff CLAUDE.md against the target and assert match.

---

## Low Severity

### [L] Finding 10: SPEC Q5 reorders "not idempotent, not stable, not near-success" but Fact numbers are listed in 4.2.2/4.3.2/4.4.2 order — mismatched pairing

**Category:** FACTUAL (minor)
**Source:** L7 (inline source attribution) + T4
**Location:** SPEC.md line 401 (Q5)
**Issue:** The text reads: `"Facts 4.2.2 / 4.3.2 / 4.4.2"` after listing three properties in this order: `"not idempotent, not stable, not near-success-on-similar-replicas"`. But per `reports/three-way-merge-content-preservation/REPORT.md` §D3 lines 97-99:
- 4.2.2 = NOT idempotent
- 4.3.2 = does NOT guarantee near-success on similar replicas
- 4.4.2 = NOT stable

So SPEC's order-pairing is: idempotent→4.2.2 (correct), stable→4.3.2 (should be 4.4.2), near-success→4.4.2 (should be 4.3.2).

**Current text (Q5, line 399-402):**
> Q5 (RESOLVED). Yes — Khanna-Kunal-Pierce 2007 formally proves diff3 is not idempotent, not stable, not near-success-on-similar-replicas (Facts 4.2.2 / 4.3.2 / 4.4.2).

**Status:** CONTRADICTED (minor)
**Suggested resolution:** Either reorder the properties to `"not idempotent, not near-success-on-similar-replicas, not stable (Facts 4.2.2 / 4.3.2 / 4.4.2)"` OR reorder the Facts to `"(Facts 4.2.2 / 4.4.2 / 4.3.2)"`.

---

### [L] Finding 11: SPEC R6 mandates a grep-based test for `setTimeout`/`setInterval` — naively brittle, but the SPEC does not call out the retained-`Scheduler` surfaces the grep must NOT trigger on

**Category:** COHERENCE (implementation ambiguity)
**Source:** L3 (missing conditionality)
**Location:** SPEC.md lines 190-194 (R6)
**Issue:** R6 calls for a `check` test that greps `server-observers.ts` and `observers.ts` for `setTimeout` etc. But per SPEC R4 (line 181-184), "retain [injected Scheduler's role] only where still needed elsewhere, e.g., client observers.ts typing-defer timing" — so client `observers.ts` is NOT fully clean. R6's grep will false-positive on those retained timers.

See also `evidence/bridge-surface-map.md` line 52-55 documenting four client-side setTimeout sites (lines 292, 315, 321, 410 in `observers.ts`); R4 only promises removal of the server bridge's debounce (lines 234, 240, 286, 387 in `server-observers.ts`), not the client's.

**Status:** INCOHERENT (internal acceptance ambiguity)
**Suggested resolution:** R6 should either (a) target only `server-observers.ts` (since client typing-defer is retained), or (b) target both files with an explicit allow-list for the three client setTimeout sites R4 preserves (typing-defer + remote-tree-grace reschedules), or (c) switch the enforcement from grep to an AST check against `Scheduler.setTimeout` calls only. Clarify before implementation to avoid false-positive CI blocks.

(Design-challenge.md Finding 8 covers this same concern at medium severity; pure coherence finding here.)

---

### [L] Finding 12: Evidence file `bridge-surface-map.md` line 57 claim of "269 occurrences across 36 files" for `wait(ms)` does not match live codebase (190 / 28)

**Category:** FACTUAL (evidence, not SPEC directly)
**Source:** T1
**Location:** `evidence/bridge-surface-map.md:57`
**Issue:** `evidence/bridge-surface-map.md` line 57 reads: `"Test-side wait(ms): 269 occurrences across 36 files in packages/app/tests/."` Actual count at baseline `432a834b`:
```
$ grep -rn "wait(" packages/app/tests/ | grep -c "wait("
190
$ grep -rln "wait(" packages/app/tests/ | wc -l
28
```
The numeric claim is overstated by ~40%. Not load-bearing for SPEC conclusions (R5 targets the pattern, not the count), but miscalibrates reader expectations about the cleanup surface.

**Status:** CONTRADICTED (minor)
**Suggested resolution:** Update `evidence/bridge-surface-map.md:57` to `"190 occurrences across 28 files"` (or re-run the grep at the commit you want to cite and pin it).

---

### [L] Finding 13: Evidence `bridge-surface-map.md` line 57 also says "Load-bearing in fuzz harness (lines 354 wait(1500) initial settle, 388 wait(800) per convergence-poll attempt)" — off-by-one against actual lines 353/387

**Category:** FACTUAL (evidence, not SPEC)
**Source:** T1
**Location:** `evidence/bridge-surface-map.md:57`
**Issue:** Actual line numbers in `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`:
- `await wait(1500);` at **line 353** (evidence claims 354)
- `await wait(800);` at **line 387** (evidence claims 388)

**Status:** CONTRADICTED (cosmetic)
**Suggested resolution:** Correct to 353 / 387.

---

### [L] Finding 14: Evidence `seed-1776386718697-characterization.md` quotes `server-observers.ts:381-384` with a different comment than the actual source

**Category:** FACTUAL (evidence, not SPEC)
**Source:** T1
**Location:** `evidence/seed-1776386718697-characterization.md:88-91`
**Issue:** The evidence file reads:
> Observer B (server-observers.ts:378-388) — does NOT special-case paired-write origins. Comment at lines 381-384:
> > // We do NOT skip AGENT_WRITE_ORIGIN/FILE_WATCHER_ORIGIN here — instead, runObserverBSync's
> > // already-in-sync gate handles the early-exit harmlessly.

Actual source at `server-observers.ts:382-384` is:
> // Already-paired writes: agent-write and file-watcher both write both
> // sides atomically. runObserverBSync will early-exit at the already-in-sync
> // gate, but we skip scheduling entirely to avoid unnecessary work.

The substantive claim (Observer B does not special-case paired-write origins) is correct — both comments describe the same design choice, and the behavior at lines 386-387 does schedule a debounce regardless. But the comment text is paraphrased, not quoted verbatim. (Notably, the real comment's claim "we skip scheduling entirely to avoid unnecessary work" is actually misleading in-source — the code at 386-387 schedules regardless — but that's a source-code comment bug, not an evidence-file bug.)

**Status:** CONTRADICTED (quote is paraphrased, not verbatim)
**Suggested resolution:** Replace the paraphrased quote with the actual source comment. Consider also noting the in-source comment's self-contradiction ("we skip scheduling entirely" vs. the unconditional schedule at line 387) as an additional piece of evidence — it reinforces the asymmetry claim and surfaces a documentation bug for the implementation pass to fix.

---

### [L] Finding 15: SPEC §15 "Future Work" uses FW- prefix while prose declares them "Subsequent specs (not 'deferred')" — label/prose mismatch

**Category:** COHERENCE (editorial)
**Source:** L6 (stance consistency)
**Location:** SPEC.md lines 461-478 (§15)
**Issue:** §15 header is "Future Work". Subheader says `"Subsequent specs (not 'deferred' — separable by design per greenfield directive)"`. Item labels are `FW-1`, `FW-2`, `FW-3` — where "FW" is conventionally "Future Work" (deferred). The prose distinguishes "subsequent specs" from "future work / deferred"; the labels collapse them. See also Finding 5 for the cross-reference with R12.

**Status:** INCOHERENT (editorial)
**Suggested resolution:** Rename §15 "Subsequent Specs" and relabel items `SS-1`, `SS-2`, `SS-3`. Update §11 Q6's "Answers FW-1 urgency" → "Answers SS-1 urgency" and §1 Resolution's Bucket C reference likewise. Resolves Findings 5 + 15 together.

---

## Confirmed Claims (summary)

The following were spot-checked and verified:

**File:line citations against source** (all baseline commit `432a834b`):
- `server-observers.ts:214` is the `isPairedWriteOrigin` branch in Observer A (SPEC D1, R0) ✓
- `server-observers.ts:82-83` is the `isPairedWriteOrigin` definition ✓
- `server-observers.ts:56-60` is `OBSERVER_SYNC_ORIGIN` declaration ✓
- `server-observers.ts:204-241` is Observer A callback range ✓
- `server-observers.ts:378-388` is Observer B callback range ✓
- `server-observers.ts:234, 240, 286, 387` are the four DEBOUNCE_MS setTimeout sites ✓
- `agent-sessions.ts:52-56` is `AGENT_WRITE_ORIGIN` ✓
- `external-change.ts:27-31` is `FILE_WATCHER_ORIGIN` ✓
- `api-extension.ts:104-108` is `ROLLBACK_ORIGIN` ✓
- `observers.ts:57-61`, `observers.ts:67-71` are client `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` ✓
- `test-harness.ts:526-533` is `BRIDGE_ENFORCING_ORIGINS` Set (6 entries, includes `OBSERVER_SYNC_ORIGIN`) ✓
- `test-harness.ts:572-611` is `attachBridgeInvariantWatcher`, uses `afterTransaction` (not `afterAllTransactions`) ✓
- `packages/server/src/server-observers.test.ts:449` is the seed-1776325179241 regression test ✓
- `scheduler.ts:38` is `globalThis.setTimeout` in `defaultScheduler` ✓
- `merge-three-way.ts` is the hybrid diff3+DMP merge ✓
- `apply-diff.ts` exports `applyFastDiff` ✓

**Research report citations:**
- `reports/yjs-transaction-settlement-hooks/REPORT.md §D1` = "afterAllTransactions precise firing semantics" ✓
- `§D3` = "Hocuspocus WebSocket update ingestion" ✓ (matches SPEC Q1/D5 intent)
- `§D4` = "Observer composition pattern (ecosystem prior art)" — y-prosemirror uses afterAllTransactions ✓
- `§D5` = "Reentrancy and nesting" ✓ (addresses A2)
- `reports/three-way-merge-content-preservation/REPORT.md §D3` = Khanna-Kunal-Pierce impossibility ✓ (but see Finding 2)
- `§D4` = Yjs state vectors per-doc not per-type ✓ (matches SPEC Q2)
- `§D5` = Peritext/Automerge single-CRDT collapse ✓ (should be cited in D4 per Finding 2)
- `§D8` = "Invariant (c) — maximal-unique-substring — is the right post-condition" ✓ (matches SPEC D2)
- 2-4 weeks Yjs-14 estimate ✓ (`peritext-on-yjs-feasibility/REPORT.md` line 40, 45)
- 12-20 weeks Automerge estimate ✓ (`automerge-prosemirror-migration-assessment/REPORT.md` line 36)

**PR references:**
- PR #161 "feat: lossless bridge merge" (commit `3491f034`) ✓
- PR #172 "Markdown pipeline engineering health" (commit `e8f4dd8c`) ✓

**Baseline commit `432a834b`** is valid, on branch `spec/bridge-correctness` ✓.

**Worktree path** `.claude/worktrees/bridge-correctness` matches the current working directory ✓.

**CLAUDE.md precedent references:**
- Precedent #11(b) at line 87 ✓
- Precedent #13(b) at line 93 ✓
- Precedent #14 (server-authoritative bridge) ✓

**Internal requirement numbering:** R0, R0b, R0c, R1-R12 appear once each; no duplicate or missing numbers. The unusual `R0b/R0c` suffix scheme (vs. R1/R1b/R1c) is a stylistic choice, not an inconsistency.

**Metric M1-M7 cross-references to requirements:** All seven metrics trace to specific R-numbers or to explicit behavior (M1↔R2; M2↔R2; M3↔R0c; M5↔R6; M7↔R11). No orphan metrics.

**Decision Log locks (D1-D5):** Each has rationale + confidence + evidence pointer. D6-D7 are correctly marked pending/agent-resolvable (implementation-phase choices). All 1-way-door decisions have explicit confirmation.

---

## Unverifiable Claims

**Q4 empirical outcome** ("Is seed 1776386718697 closed by Bucket 0 alone?"). By design — this is the load-bearing empirical question the spec preserves for implementation. Resolution plan (100× rerun) is explicit in Q4.

**M4** (`BridgeMergeContentLossError` never fires in prod telemetry over 30 days post-ship). Cannot be verified pre-ship — this is the success criterion, not a claim.

**D7 CI time-budget arithmetic** ("1000 seeds = ~80 min parallel on 5-client setup"). 1000 × 5s = 83 min serial, which matches "~80 min parallel" only if "parallel" means "running as one fuzz-test job in parallel with other CI jobs" rather than "seeds evaluated in parallel." The wording is ambiguous but non-blocking — D7 is explicitly marked agent-resolvable during implementation.

**"40-60% failure rate locally"** (SPEC §1, evidence reproduction table 2/5). The sample n=5 is too small to distinguish 40% from 60% with any confidence; the range is informally stated. Not a factual claim that can be confirmed/contradicted without a larger sample.
