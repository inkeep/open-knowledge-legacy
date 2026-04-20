# Design Challenge Findings

**Artifact:** `specs/2026-04-16-bridge-correctness/SPEC.md`
**Challenge date:** 2026-04-16
**Total findings:** 11 (4 High, 5 Medium, 2 Low)

---

## Scope of this review

I read SPEC.md, both evidence files (`bridge-surface-map.md`, `seed-1776386718697-characterization.md`), the two sister research reports the spec cites (`reports/yjs-transaction-settlement-hooks/REPORT.md`, `reports/three-way-merge-content-preservation/REPORT.md`), the adjacent `reports/peritext-on-yjs-feasibility/REPORT.md`, and the actual bridge source at `packages/server/src/server-observers.ts` (current Observer A/B implementations, paired-write branch, debounce sites) and `packages/core/src/bridge/merge-three-way.ts` (the target of the post-condition). I cross-checked claims made in SPEC against the source, not just against the evidence files.

The spec's Decision Log records five LOCKED decisions (D1-D5). The challenge questions asked me to probe whether those rejections hold; I also surfaced issues not present in the Decision Log that a cold reader would raise. Findings are grouped by the challenge questions below, with severity and "what it would reopen" called out per finding.

---

## High Severity

### [H] Finding 1 — Bucket 0 addresses the observer's response to RGA corruption, not the RGA corruption itself; Bucket A + B alone do not close the causal chain either

**Category:** DESIGN
**Source:** DC3 (framing validity) + DC2 (stakeholder gap)
**Location:** SPEC.md §1 Complication + §6 R0 (Bucket 0); evidence `seed-1776386718697-characterization.md` §Mechanism step 3

**Issue:** The seed characterization identifies two distinct mechanisms chained into the failure, and the spec's Resolution folds them into "Observer B asymmetry":

1. **Position corruption.** Op 12 inserts from client 0 whose local Y.Text reflects pre-pause state (M0-M3). Yjs RGA resolves the insert at an Item reference that no longer means "end of document" on the server (post-file-watcher wholesale replace of M0-M3 → M5). The insert lands *inside* `M5-delta charlie delta`, splitting it into `M` + `5-delta charlie delta` with `\n\nM6-charlie delta\n` wedged between them.
2. **Path-B preservation of corruption.** After the split, subsequent Observer A Path B firings run `mergeThreeWay` against the corrupted Y.Text. Instead of healing, it preserves the split and further duplicates `M7-alpha charlie hotel`.

Bucket 0 (Observer B paired-write symmetry) addresses **neither** mechanism directly. It prevents Observer B from *later* running with a stale baseline against the already-corrupted Y.Text — which means Observer B won't re-sync the corruption back into XmlFragment. But the corruption is **already in Y.Text** after op 12, placed there by the RGA protocol, not by any observer. The characterization file's §3 acknowledges this chain but the spec's §1 Complication rolls it up as "asymmetry is the proximate cause," which understates how much of the chain is *structural* (CRDT Items resolving to obsolete positions) rather than *observer logic* (asymmetric origin handling).

This matters because Q4 asks "Is seed `1776386718697` closed by Bucket 0 alone?" — and the resolution plan (run 100× in a row, see if it passes) treats this as an empirical question. But the mechanism analysis suggests Bucket 0's effect is *downstream* of the corruption. The corruption may still occur; the observable oracle failure may be different (e.g., `M5` content still intact on-Y.Text but Observer B doesn't paper over it, so it surfaces as an XmlFragment-vs-Y.Text divergence caught by `attachBridgeInvariantWatcher` instead of oracle (d)).

**Current design:** "Bucket 0 — Observer B paired-write symmetry (proximate fix). [...] This is the minimal diff to close the characterized seed-`1776386718697` race" (SPEC §1 Resolution).

**Alternative framing:** Reframe Bucket 0 as **necessary but not sufficient for this seed**. The RGA-position-corruption mechanism is closed only by making the paused client's update fail-safe on resume — e.g., server-side rebase of the pending inbound update against post-paired-write XmlFragment state before the RGA applies. That's a different change (network-layer / Yjs-sync-protocol level, not Observer B). If such a change isn't in scope, the spec should be explicit that Bucket 0 is a **harm-reduction** fix — it prevents Observer B from propagating corruption across cycles, but does not prevent the initial corruption.

**Trade-off:** Honesty about mechanism vs. simplicity of presentation. The current framing risks leaving the team surprised if 100× reruns show residual failure after Bucket 0 — the response "characterize residual and pin as T9+" (Q4 resolution plan) is fine for another seed, but if the 1776386718697 seed itself still reproduces at, say, 10% rate, that's a signal the proximate-fix hypothesis was wrong.

**Status:** CHALLENGED
**Suggested resolution:** Expand SPEC §1 Complication to distinguish "RGA-position corruption (occurs during op 12 network arrival; Bucket 0 does not prevent it)" from "Observer-B propagation of corruption across cycles (Bucket 0 prevents this)." Add an explicit hypothesis in Q4 resolution plan: if 100× rerun is <100/100 pass, the residual is RGA-level, not observer-level, and Buckets A/B/C do not fix it either. That reopens the question of whether *any* dual-CRDT patch addresses this seed end-to-end, or whether single-CRDT collapse (FW-1) is the only correct fix.

**Reopens:** D1 (Bucket 0 framing) and D4 (single-CRDT scope boundary).

---

### [H] Finding 2 — Paired-write origin set is incomplete; `ROLLBACK_ORIGIN` and `MANAGED_RENAME_ORIGIN` are also paired writes but not in `isPairedWriteOrigin`

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE/debug perspective)
**Location:** SPEC.md §6 R0 (Bucket 0); evidence `bridge-surface-map.md` Origins table (lines 63-74)

**Issue:** The bridge-surface-map evidence enumerates FIVE server-side origins that atomically write both XmlFragment and Y.Text inside their own `doc.transact()` block (or are potential paired writers):
- `AGENT_WRITE_ORIGIN` (agent-sessions.ts:52) — IN `isPairedWriteOrigin`
- `FILE_WATCHER_ORIGIN` (external-change.ts:27) — IN `isPairedWriteOrigin`
- `ROLLBACK_ORIGIN` (api-extension.ts:104) — NOT IN
- `MANAGED_RENAME_ORIGIN` (api-extension.ts:110) — NOT IN

The bridge-surface-map §75 explicitly flags this: `"BRIDGE_ENFORCING_ORIGINS (test-harness.ts:526-533): 6 entries — all except MANAGED_RENAME_ORIGIN. Surfaces a question: is the omission intentional or an oversight?"`

The spec's Bucket 0 replicates Observer A's `isPairedWriteOrigin` branch into Observer B — but both observers use the same incomplete origin set. `ROLLBACK_ORIGIN` fires from `api-extension.ts:794` (per bridge-surface-map §114), and `applyManagedRenameToLoadedDocument` also wraps `doc.transact(...)`. If either writes both Y.Text and XmlFragment atomically and a concurrent paused-client source-type insertion races with it, the exact same failure class reproduces — just with a different seed.

**Current design:** `"isPairedWriteOrigin matches AGENT_WRITE_ORIGIN || FILE_WATCHER_ORIGIN (line 82-83)"` (server-observers.ts:82-83, quoted from bridge-surface-map).

**Alternative:** Expand `isPairedWriteOrigin` to include every paired-write origin. More structurally, replace the hardcoded pair with a **type-level marker** on the origin object itself — e.g., `origin.paired: true` — so adding a new paired-writer origin is an additive schema change, not a hidden requirement to edit `server-observers.ts`. This aligns with precedent #1 (typed origin objects over raw strings) and gives us compile-time safety that new origins declare their paired-write semantics.

**Trade-off:** A type-level marker is more disciplined but requires touching every origin definition. A runtime set is quick but duplicates knowledge (each new origin author must remember to add themselves to the set).

**Status:** CHALLENGED
**Suggested resolution:** Either (a) enumerate every paired-write origin and add to `isPairedWriteOrigin` in both observers, or (b) introduce `LocalTransactionOrigin.paired?: boolean` and have `isPairedWriteOrigin` check the marker. Explicitly test the rollback and managed-rename paths under the same "concurrent paused-client source-type insertion" interleaving that reproduces seed 1776386718697. If either reproduces the corruption, T9/T10 are named regressions.

**Reopens:** D1 scope — Bucket 0 needs to cover ALL paired writes, not just the AGENT/FILE_WATCHER pair.

---

### [H] Finding 3 — Four buckets of state-based patches preceding a known single-CRDT migration is the exact shape of deferred tech debt the greenfield directive rejects

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** SPEC.md §3 Non-goals ("Collapse to single CRDT (D4-LOCKED)") + §15 FW-1 + D4 rationale

**Issue:** Three-way-merge-content-preservation/REPORT.md §D3 concludes unambiguously: **no purely-state-based three-way merge can guarantee content preservation under arbitrary interleavings** (Khanna-Pierce 2007). The spec acknowledges this (Q5 RESOLVED, §15 FW-1 rationale). It then chooses to ship four buckets of state-based patches (Buckets 0, A, B, C) with the explicit acknowledgment that Bucket C's escalation-path (operation-based merge via Yjs state vectors) is ALSO inadequate (Q2 RESOLVED: state vectors don't apply at Y-type boundary).

So the chain of reasoning is:
- Research proves the current algorithm is fundamentally inadequate.
- The in-scope escalation path (Bucket C operation-based) is proven not applicable.
- The only structurally correct fix (Peritext / single-CRDT) is deferred to FW-1.
- Meanwhile, ship 4 state-based buckets with loss assertions and telemetry.

The peritext-on-yjs-feasibility report estimates Yjs-14-path Architecture C at **2-4 weeks**. Buckets 0, A, B, C combined are realistically 1-2 weeks of implementation + test + docs. The marginal cost to go *directly* to single-CRDT is 1-2 weeks more — and the 4 buckets are then thrown away because they're built for the dual-CRDT bridge that no longer exists.

The greenfield directive is explicit: **"NO DEFERRED TECH DEBT — instead, optimize for best architecture and correctness-based evidence-based decisions."** The decision log D4's rationale for OUT-OF-SCOPE is:

> "Ship the 4 buckets first; the post-condition (R1) + elevated fuzz (R2) generate production data that calibrates urgency of the collapse. Not 'deferred debt' — it's the next spec, separable by design."

But the research already gives us the urgency answer: the failure class is **provably unbounded** (Fact 4.2.2 non-idempotence, 4.3.2 non-near-success, 4.4.2 non-stability in Khanna-Pierce). Telemetry will produce a nonzero incidence rate; the exact number doesn't change the structural conclusion. The "separable by design" argument is weakened by the fact that FW-1's implementation explicitly deletes most of Buckets 0/A/B/C:
- Bucket 0 (Observer B paired-write symmetry) — observers disappear entirely under Peritext.
- Bucket A (`mergeThreeWay` post-condition) — `mergeThreeWay` disappears; there is no type-boundary translation.
- Bucket B (settlement migration) — still relevant (it's a test-harness discipline fix), but it's orthogonal to bridge correctness.
- Bucket C (characterization + pinning) — the pinned regressions test an algorithm that no longer exists.

This is not "separable by design" — it's "built on a foundation we know will be replaced."

**Alternative (DC1):** Ship Peritext-on-Yjs-14 (Architecture C, 2-4 weeks per `peritext-on-yjs-feasibility`) as THIS spec's scope. Retain Bucket B (settlement migration + test-harness cleanup) because it's architecturally correct independent of the bridge's shape. Delete Buckets 0/A/C. Net effort probably +1-2 weeks compared to the current plan, but the code lasts instead of being thrown away, and the failure class is closed structurally, not harm-reduced via logging.

**Trade-off:** The current plan lets us ship the characterized seed fix in days (Bucket 0) and iterate. The alternative invests 2-4 weeks before anything lands, during which the known flake continues to reproduce at ~40% in fuzz. *But* — Bucket 0 by itself is a 30-LOC patch; it can ship as a hotfix independent of the spec's scope. The question isn't "hotfix vs. long spec"; it's "hotfix + 4 more buckets of dual-CRDT work vs. hotfix + single-CRDT migration."

**Status:** CHALLENGED
**Suggested resolution:** Treat Bucket 0 as a hotfix landable immediately (whether or not the spec's scope changes), then reconsider whether the spec's in-scope work should be (a) Buckets A/B/C on the dual-CRDT model as currently planned, or (b) FW-1 (single-CRDT collapse) pulled forward. Evaluate the 4-bucket plan's throwaway cost concretely: list each file/test/doc that gets deleted or rewritten under FW-1. If that list is most of Bucket A and C, the greenfield directive points toward pulling FW-1 in.

**Reopens:** D4 (single-CRDT scope boundary). Possibly D1 (Bucket 0 may become a pre-requisite hotfix to FW-1 rather than part of the in-scope work).

---

### [H] Finding 4 — D3 log+continue fallback forecloses user-facing recovery agency without evidence it's what users want

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer perspective) + DC3 (framing validity)
**Location:** SPEC.md §10 D3 rationale + §15 FW-1

**Issue:** D3's rationale cites "collaborative editors (Google Docs, Notion, Figma, Linear) prioritize 'keep typing' over surfacing errors; version-history + shadow-git primitives provide user-facing recovery if loss is noticed." Two problems:

1. **"If loss is noticed"** is load-bearing. In a dual-view editor (WYSIWYG + source), the user who loses content likely sees it happen *live* — their typed-and-visible M5 content disappears from their screen when a remote update arrives. That's not "noticed later via version history"; that's "visible in-the-moment, no explanation, no recovery affordance." Version history is a forensic tool, not an in-moment recovery. None of the cited editors (Google Docs, Notion, Figma, Linear) have the specific failure mode we're optimizing for — bridge-level merge loss on transient concurrent edits — because they're single-CRDT or OT-based (no type-boundary translation). The analogy is weak.

2. **Silent continuation after a known-lossy operation foreclose user agency.** A user cannot choose to re-attempt the edit, cannot see that their edit was dropped, cannot be nudged toward version history. The greenfield directive says "optimize for best product experience without over-engineering something users wouldn't expect." Users of a collaborative editor DO expect an indication when their input is at risk — that's the signal they need to decide whether to retype, refresh, or check version history.

The middle ground proposed in the challenge question (subtle toast — "your edit may have been affected by a concurrent change") is:
- Not a "hard error" (doesn't interrupt typing).
- Dismissable.
- Clicks to version history or shows the lost substring.
- Rendered only when `BridgeMergeContentLossError` fires (which is already instrumented).

Implementation cost is 1-2 days (existing toast infrastructure in the app, per `packages/app/src`). The greenfield directive explicitly rejects pragmatism-at-correctness-cost; D3 is pragmatism-at-transparency-cost.

**Current design:** "Prod (D3-LOCKED): `console.warn(JSON.stringify({event: 'bridge-merge-content-loss', ...}))` with structured payload; increment metrics counter; return result as-computed." (SPEC §6 R1)

**Alternative:** Combine D3 with a user-visible conflict indicator. On `BridgeMergeContentLossError` in prod: log, count, **broadcast an awareness event** (`{kind: 'bridge-loss', docName, lostSubstring, timestamp}`) that the client renders as a dismissable toast with "see in version history" CTA. Keep returning result-as-computed (no throw in prod, users keep typing). This satisfies the Google-Docs-style-keep-typing constraint AND gives the user-facing engineer a way to close the loop.

**Trade-off:** +1-2 days implementation, +1 awareness message type, +1 toast component. Gains: user agency on known-lossy merges, telemetry signal correlates with user-reported issues, greenfield-correct.

**Status:** CHALLENGED
**Suggested resolution:** Explicitly evaluate in the decision log whether a user-visible conflict indicator is overengineering (users wouldn't expect it) or underengineering relative to the failure mode. The Google-Docs analogy underjustifies pure silent-loss; either (a) cite a competitor that has the exact same dual-CRDT/dual-view failure mode and silently continues, or (b) add the indicator. Either resolves the tension; leaving it unaddressed weakens D3's rationale.

**Reopens:** D3 production-fallback policy.

---

## Medium Severity

### [M] Finding 5 — Bucket B is framed as "architectural cleanup" but closes a correctness class beyond Bucket 0

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** SPEC.md §1 Resolution (Bucket B) + §6 R4 ("Observer A/B on `afterAllTransactions`")

**Issue:** The spec labels Bucket B "Architectural cleanup" and Bucket 0 "Proximate fix." This framing understates Bucket B's correctness contribution. Bucket 0 closes the specific `isPairedWriteOrigin` asymmetry between Observer A and Observer B. Bucket B closes the **entire class** of "concurrent Y.Text mutation lands in the debounce window" races by eliminating the window. That's a correctness result, not just cleanup.

Specifically: after Bucket 0, Observer B still has a 50ms debounce (`server-observers.ts:387`) for non-paired-write origins. A source-mode edit from a non-paused client arriving during that window can still race — e.g., client A source-typing while client B also source-types, server debounce coalesces, Observer B fires against a state that's no longer the state the debounce was scheduled against. The evidence (challenge question F) says "settlement-based propagation eliminates the 50ms window." That's correctness-significant; framing it as cleanup cedes the argument to the D4 camp that says "we fixed the proximate seed, everything else is polish."

**Current design:** Bucket B labeled "Architectural cleanup" (SPEC §1 Resolution).

**Alternative framing:** Rename Bucket B to "Debounce-window race closure." Keep the settlement migration intact but argue for it on correctness grounds, not precedent grounds. This may also surface whether Bucket 0 is truly necessary post-Bucket-B — if settlement-based propagation handles the asymmetry via `transactions[].some(tr => isPairedWriteOrigin(tr.origin))`, the asymmetry class disappears with the settlement migration.

**Trade-off:** None — renaming doesn't change the shipped code, it changes how reviewers evaluate the decision.

**Status:** CHALLENGED
**Suggested resolution:** Check whether Bucket B subsumes Bucket 0. If yes, the ship order might invert (ship Bucket B first; Bucket 0 becomes an optional belt-and-suspenders). If no, document why the proximate asymmetry persists under settlement semantics. Either answer tightens the spec.

**Reopens:** Ship order between Bucket 0 and Bucket B.

---

### [M] Finding 6 — Invariant (c) does not catch reordering loss; the spec should call this out alongside D2

**Category:** DESIGN
**Source:** DC1 (simpler alternative — alternative invariants)
**Location:** SPEC.md §10 D2 rationale; `reports/three-way-merge-content-preservation/REPORT.md` §D8

**Issue:** D2-LOCKED selects invariant (c) — maximal-unique-substring subset — as the post-condition. The research report §D8 grid shows (c) catches "contiguous content loss" but MISSES "order changes." For markdown documents with many similar blank lines and headings (the exact shape the Khanna-Pierce counter-example targets), reordering is a real failure mode:
- Input: `M5-foo\n\nM7-bar`
- Lossy merge output: `M7-bar\n\nM5-foo` (both substrings preserved; order flipped)
- Invariant (c) says: CORRECT (both substrings are contained in result)
- Reality: document content re-ordered; semantically corrupted

The challenge question probed alternatives:
- **Checksum/hash-based invariant:** structurally equivalent to (c) without substring-locations; strictly weaker for diagnosis — rejected.
- **Semantic (canonical mdast equivalence):** parses merge result, compares mdast to union(mdast(mine), mdast(theirs)). Catches reordering within mdast structure. BUT: introduces false positives from remark normalization (e.g., `\n`-count changes between paragraphs, which we already have NG1/NG2 irreducible gaps for). Too brittle.
- **(c) + line-order check:** invariant (c) plus "the relative order of mine's maximal-unique substrings in result matches their order in mine (when both are in result), same for theirs." This is strictly stronger than (c) but weaker than Pijul's full patch-theory order-preservation. O(n log n).

The three-way-merge report §D8 table places "(c) max-unique-substring" as RECOMMENDED and "Pijul order-preservation" as "out of reach for state-based." That's true for full Pijul semantics, but the "(c) + line-order check" middle ground isn't evaluated.

**Current design:** "D2 (LOCKED) — Post-condition invariant inside `mergeThreeWay`: invariant (c) maximal-unique-substring subset. [...] On violation: throw in dev/test, log in prod."

**Alternative:** Add a weaker order-preservation side-check alongside (c): "For each pair of maximal-unique substrings (s1, s2) from mine both contained in result, if s1 precedes s2 in mine, then s1 precedes s2 in result." O(k^2) where k is the number of maximal-unique substrings — typically ≤10 per merge.

**Trade-off:** +small CPU cost, potentially more false positives if order is deliberately changed by the merge (e.g., a user moves a paragraph while an agent appends). For line-level edits where order is intrinsic to meaning, this catches a class (c) silently passes.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) accept (c) as-is and document the reordering limitation as known-miss (update D2 rationale), or (b) add the weak order-preservation side-check. The current spec doesn't surface the reordering limitation at all — that's the minimum fix.

**Reopens:** D2 post-condition (clarify or extend).

---

### [M] Finding 7 — R0b deterministic test for seed 1776386718697 may be overclaimed; scheduler-DI alone doesn't control network-ordering race

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — test engineer perspective)
**Location:** SPEC.md §6 R0b; evidence `seed-1776386718697-characterization.md` §Reproduction

**Issue:** R0b says the T8 regression test reproduces the failure "deterministically using the server-observer scheduler injection seam precedent." But the characterization file is explicit:

> "Op sequence is RNG-deterministic for this seed, but execution timing (real-clock CRDT propagation + 50ms server debounce) is non-deterministic — failure rate matches the CONSIDER.md observation."

The race involves:
1. Op 10's FILE_WATCHER paired write triggering Observer B debounce.
2. Op 12's paused-client outbound CRDT update traversing network → server's sync-plugin → `applyUpdate` → Y.Text mutation.
3. Timing between the two determines whether Observer B's deferred fire runs BEFORE or AFTER the paused-client update arrives.

Scheduler DI controls (1) and Observer B's deferred fire timing. It does NOT control (2) — the network arrival of the paused-client outbound update. That's driven by the server's WebSocket receive queue drain, which is on Node.js event-loop timing (not Scheduler).

In theory, setting up a manual scheduler AND pausing/resuming the paused client's outbound via `ControllableWebSocket` (which already exists, see `network-control.ts:48`) lets us fully control the race. But the spec's current fuzz harness pauses INBOUND at the client's socket, not OUTBOUND — so the test would need a NEW primitive: pause outbound on a specific client's socket, drain server state to known-good position, resume outbound.

The `network-control.ts` file as-is (166 lines, only pauseInbound/resumeInbound) doesn't support outbound control. R5's "structural quiescence gate" doesn't address this either — it's about waiting for doc quiescence, not about controlling the *timing* of a specific message's arrival.

**Current design:** "R0b. T8 regression test. Hand-written integration test that reproduces the seed-`1776386718697` failure class (FILE_WATCHER_ORIGIN paired write + concurrent paused-client source-type insertion) deterministically using the server-observer scheduler injection seam precedent (`packages/server/src/server-observers.test.ts` seed-1776325179241 pattern)."

**Alternative:** Either (a) introduce `pauseOutbound`/`resumeOutbound` in `ControllableWebSocket` as part of Bucket 0's T8 test work (+1-2 days), or (b) accept that T8 is a *probabilistic* regression test (runs many times, fails ≥5% if bug reproduces; passes 100/100 if Bucket 0 closes it). The existing seed-1776325179241 pattern the spec cites uses scheduler DI + single-client writing — the multi-client network-race class is new.

**Trade-off:** (a) is more work but gives strictly-deterministic T8 parallel to the existing seed-1776325179241 test. (b) is cheaper but couples T8 to CI flake budget.

**Status:** CHALLENGED
**Suggested resolution:** Validate R0b's "deterministic" claim in a spike before committing. If the seed-1776325179241 pattern truly scales to multi-client network-race reproduction, fine — but the characterization explicitly says the current fuzz harness is non-deterministic in timing, which is evidence against the claim.

**Reopens:** R0b implementation scope — may need outbound network control.

---

### [M] Finding 8 — R6 greppability test is brittle and doesn't cover Scheduler-abstracted setTimeout

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — maintenance engineer perspective)
**Location:** SPEC.md §6 R6; evidence `bridge-surface-map.md` debounce topology (table at lines 44-55)

**Issue:** R6 proposes "A `check` test that greps `packages/server/src/server-observers.ts` and `packages/app/src/editor/observers.ts` for `setTimeout`, `setInterval`, or debounce-like patterns and fails CI if found."

Current bridge-surface-map table shows 10 setTimeout sites across bridge code. After Bucket B, R4 deletes the bridge's usage of scheduler-debounce. But:
1. **Client `observers.ts:315, 321`** — client Observer B's typing-defer timing. The spec says (R4) "Remove the injected `Scheduler`'s role from the bridge (retain only where still needed elsewhere, e.g., client `observers.ts` typing-defer timing)." So some client setTimeouts remain. A naive grep fails CI on them, unless R6's regex is sophisticated enough to distinguish allowed vs. forbidden usages.
2. **`scheduler.ts:38`** defaultScheduler passthrough — under Bucket B's model, the Scheduler abstraction may still exist (for client-side typing-defer) but the bridge doesn't consume it. Grepping for `sched.setTimeout` catches server-side but may not catch `globalThis.setTimeout` in a future regression.
3. **Test files** — the 269 `wait(ms)` occurrences across 36 files. R5 says "Remove `wait(ms)` from bridge tests where wall-clock coupling is the only reason it exists" — which is vague. R6 doesn't say anything about test files.

A grep-based CI gate is fragile. An AST-based check (via `tsc`'s program API or `ts-morph`) could match specific patterns more reliably — but that's more work. Alternatively, file-level allowlists (`server-observers.ts` and `observers.ts` must have zero `setTimeout`; `client-typing-defer.ts` extracted as a dedicated module is allowed) are cleaner.

**Current design:** "R6. Precedent #13(b) enforcement test. A `check` test that greps [...] for `setTimeout`, `setInterval`, or debounce-like patterns and fails CI if found."

**Alternative:** Move client Observer B typing-defer into a dedicated module (`packages/app/src/editor/typing-defer.ts`) with a clean boundary. Then R6's grep is unambiguous: ANY `setTimeout` in `server-observers.ts` or `observers.ts` fails CI. The typing-defer module has a different name, grep doesn't hit it. Bonus: the typing-defer module is now testable in isolation.

**Trade-off:** +1 module extraction in Bucket B. Cleaner semantics for R6.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) define R6's grep precisely (the full regex + the allowed exceptions), or (b) refactor to eliminate the need for exceptions via module extraction. The current wording "debounce-like patterns" is impossible to enforce mechanically.

**Reopens:** R4 scope (module boundary for typing-defer) + R6 test design.

---

### [M] Finding 9 — Oracle (d) vs invariant (c) vs invariant-watcher create three non-aligned checks; relationships not documented

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — test engineer debugging a fuzz failure)
**Location:** SPEC.md §6 R1 + R2; fuzz file `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` Oracle (d), Oracle (e); `test-harness.ts:526-611` `attachBridgeInvariantWatcher`

**Issue:** Three correctness checks now live in the bridge test infrastructure:
- **Fuzz oracle (d)** — "every marker prefix registered during op generation survives in final ytext"; prefix-only match (lines 503-517 of fuzz file).
- **Fuzz oracle (e)** — "full-body content equality" (lines 518-551 of fuzz file).
- **Bridge-invariant-watcher (existing, `attachBridgeInvariantWatcher`)** — normalized Y.Text === normalized serialize(XmlFragment) on every enforcing-origin transaction.
- **NEW post-condition (c)** — maximal-unique-substring subset asserted inside `mergeThreeWay` on every call.

Questions a cold reader can't answer from the spec:
1. **Does (c) subsume oracle (d)?** Oracle (d) is prefix-only; (c) is full-substring. If (c) is stronger, oracle (d) is redundant. If not, what gap?
2. **If the fuzz harness triggers (c) via `mergeThreeWay`, it throws in dev/test — does the fuzz harness catch the throw? Does it count as a fuzz failure?** The fuzz file catches and logs throws during `driveToConvergence`, but a throw inside `mergeThreeWay` during server-side observer work may hit a different catch path.
3. **Does the bridge-invariant-watcher fire on a merge that drops content?** A merge that drops content produces a valid Y.Text that matches serialize(XmlFragment) (because Observer B resyncs them both). So no — the watcher passes even on loss.

Without documenting these relationships, a fuzz failure might fire any of (c), (d), (e), or the watcher, and a debugger won't know which layer is the source of truth.

**Current design:** SPEC §6 R1 defines (c); R2 elevates fuzz sample count but doesn't discuss oracle relationships.

**Alternative:** Add to SPEC §6 or §9 a short table: "check → what it catches → fires on what write surface → relationship to others." Retire oracle (d) if (c) subsumes it. Document that the bridge-invariant-watcher catches STATE divergence but not CONTENT loss.

**Trade-off:** Documentation work, no code impact.

**Status:** CHALLENGED
**Suggested resolution:** Build the table. Decide which oracle(s) survive. A spec that adds a new check without reconciling it with existing ones accumulates check-sprawl.

**Reopens:** R2 fuzz harness design — may want to simplify if (c) subsumes (d).

---

## Low Severity

### [L] Finding 10 — afterTransaction vs afterAllTransactions — research is strong; no challenge holds

**Category:** CONFIRMED DESIGN CHOICE (included per DC protocol for completeness)
**Source:** DC1
**Location:** SPEC.md §10 D5

Research report `yjs-transaction-settlement-hooks/REPORT.md` §D1-D5 convincingly establishes: `afterAllTransactions` is the correct choice over `afterTransaction`. Key points the cold reader can verify:
- Observer-triggered sub-transactions cascade into the SAME drain (§D5 reentrancy).
- y-prosemirror production uses this hook (`sync-plugin.js:666`).
- One Hocuspocus WebSocket message = one drain = one fire (§D3 source-trace).
- Reentrancy semantics are well-defined.

The challenge question asked "what if a nested doc.transact from an observer produces content loss — would afterTransaction catch it sooner?" The research addresses this directly: nested transactions are absorbed into the same drain with the batch in `transactions[]`. `afterTransaction` would fire N times for one drain, each seeing only its own transaction — *less* info, not more. The batch shape at settlement is strictly superior for origin-aware handling.

No challenge holds. D5 is CONFIRMED.

---

### [L] Finding 11 — Spec references to reports use inconsistent paths; not load-bearing but a reviewer confusion risk

**Category:** CONFIRMED DESIGN CHOICE / DOCUMENTATION
**Source:** (incidental to DC2)
**Location:** SPEC.md §3 Non-goals, §10 D2/D5, §11 Q1/Q2/Q5

**Issue:** Spec references `reports/three-way-merge-content-preservation/REPORT.md` and `reports/yjs-transaction-settlement-hooks/REPORT.md` using repo-root relative paths. The reports exist in `/Users/edwingomezcuellar/projects/open-knowledge/reports/` (parent repo) but NOT in the worktree under `.claude/worktrees/bridge-correctness/reports/`. A reader running `ls reports/yjs-transaction-settlement-hooks` in the worktree will find it missing.

This is a worktree discipline issue (reports written in another worktree). Not a design problem — just noting for the review-process to either rebase the reports in or be aware that worktree isolation means citations point outside the tree.

**Status:** Documentation / worktree hygiene. LOW severity.

---

## Challenges that failed to stick

### D5 — `afterAllTransactions` per-drain over `afterTransaction` per-transaction
Research exhaustively grounds this decision. Finding 10 covers the rationale. **No challenge.**

### D2 — Invariant (c) as primary post-condition
Research eliminates the alternatives (a/b/d/Pijul) with specific reasons. Finding 6 raises the reordering-miss as a *gap within D2*, not a rejection of (c) itself. (c) stays; the gap should be documented. **Partial challenge (Finding 6).**

### Q2 (RESOLVED) — state-vector sync doesn't directly replace diff3+DMP
Research `three-way-merge-content-preservation/REPORT.md` §D4 source-traces `Y.encodeStateAsUpdate` and proves it operates at Y.Doc granularity, not Y-type. This closes operation-based bridge as an in-scope option. **No challenge.** (But Finding 3 uses this to argue single-CRDT collapse IS in scope, which is different — it's not that operation-based-within-dual-CRDT works, it's that single-CRDT makes dual-CRDT unnecessary.)

### Bucket B (settlement migration) has independent correctness value
Finding 5 challenges framing (cleanup → correctness), not the decision. The settlement migration itself is sound. **Framing challenge only.**

### D1 — Bucket 0 as the proximate fix
Observer A's `isPairedWriteOrigin` branch is a documented precedent; symmetry on Observer B is a natural minimal diff. Finding 1 challenges whether it's *sufficient* (not whether it's correct to add), and Finding 2 challenges the *scope* of paired-write origins. The decision to add Bucket 0 at all is sound. **Conditional challenges only (Findings 1, 2).**

### Test-harness Scheduler DI disappears under afterAllTransactions (from yjs report §217)
The research calls out ~30 integration tests need updating. The spec acknowledges this (Q6 implicit in R4's "Remove the injected Scheduler's role from the bridge"). Not challenged — just a cost to execute.

### Bucket C framed as "evidence-driven response"
The rationale ("if Bucket 0 alone closes the seed, T8 regression is sufficient") is structurally sound. Finding 1 challenges whether Bucket 0 alone closes the seed, which cascades into Bucket C's dependencies, but Bucket C's framing itself is fine. **No direct challenge.**

---

## Summary

**4 High severity:**
- Finding 1: Bucket 0 addresses observer response, not RGA corruption mechanism (reopens D1, D4).
- Finding 2: Paired-write origin set incomplete — ROLLBACK, MANAGED_RENAME missing (reopens D1 scope).
- Finding 3: 4-bucket state-based plan preceding known single-CRDT migration = deferred debt the greenfield directive rejects (reopens D4).
- Finding 4: D3 log+continue forecloses user-facing recovery agency (reopens D3).

**5 Medium severity:**
- Finding 5: Bucket B is correctness work, not cleanup — framing understates (reopens ship order).
- Finding 6: Invariant (c) doesn't catch reordering — D2 should document or extend.
- Finding 7: R0b deterministic-test claim may be overclaimed; needs spike validation.
- Finding 8: R6 greppability test brittle; needs precise regex or module extraction.
- Finding 9: Oracle-check relationships not documented — three+ checks, non-aligned semantics.

**2 Low severity:**
- Finding 10: D5 afterAllTransactions — CONFIRMED; no challenge.
- Finding 11: Report path hygiene — documentation only.

The highest-impact findings are Findings 3 (scope) and Finding 1 (mechanism) — both reopen D4 (single-CRDT scope). The spec has strong research backing every decision; the design challenges that stick are about whether the research's conclusions are being *applied consistently* with the greenfield directive, not about whether the research is correct.
