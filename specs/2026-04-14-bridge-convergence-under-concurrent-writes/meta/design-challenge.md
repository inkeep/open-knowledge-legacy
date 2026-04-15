# Design Challenge Findings (Second Pass — post §7f expansion)

**Artifact:** specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md (887 lines, post-expansion)
**Challenge date:** 2026-04-14
**Prior pass:** `meta/_changelog.md` records first-pass findings (6 audit + 7 challenge) against FR-1..FR-8 / D1..D11. Two challenger findings were acted on (Bug-D handoff, `syncTextToFragment` deletion). This pass scrutinises the new content: §7e (Bug-D handoff), §7f (FR-11..FR-17 harness hardening), D12..D17, scope-expansion implications.
**Total findings:** 9 (3 H, 4 M, 2 L)

The findings focus on architectural precedents introduced by §7f and on whether the scope expansion is correctly classified. Where the original bridge fix (FR-1..FR-8, D1..D10) is unchanged and already survived first-pass scrutiny, those decisions are not re-litigated — they are carried forward.

---

## High Severity

### [H] Finding 1: §7f is a separate spec, not the same problem — bundling creates a two-body spec that neither body properly constrains

**Category:** DESIGN
**Source:** DC3 (Framing validity) + DC1 (Simpler alternative)
**Location:** §1 (Complication), §6 (FR-11..FR-17), §7f, §12 (Future Work), `_changelog.md` entry 2026-04-14 "Iterative-loop expansion"
**Issue:** The spec's Complication is framed as two bridge-convergence bugs (Bug-A, Bug-B) + Bug-D handoff. The §7f content (FR-11..FR-17, D14..D17) is not solving that Complication — it is retrospectively reasoning that "finding these bugs was hard, therefore the harness is a bug of its own." That inference is sound as a principle but does not make §7f the same problem. The Complication does not require invariant watchers, scheduler DI, WebSocket-layer network control, or a PBT fuzzer to be closed: Bug-A (§7a) and Bug-B (§7b) are complete, self-contained technical fixes with a concrete acceptance harness (the existing 4-test reproducer file, FR-8). The §7f additions are architectural precedents motivated by the experience of this spec but are not in the causal chain from Complication to Resolution.

Evidence the two bodies do not share constraints:

- **Different acceptance criteria.** FR-1..FR-8 are measurable via the reproducer file. FR-11..FR-17 require inventing new oracles (invariant-violation false-positive rate, fuzzer iteration budget, seed calibration) that are not measurable against the 4 bugs — a passing fuzzer does not prove Bug-A's fix is correct, only that it didn't find an additional bug in 100 seeds.
- **Different stakeholders.** The Complication's stakeholders are V0-14 (Miles), human WYSIWYG users, MCP agents, peer users. §7f's stakeholders are future observer-pipeline developers (P4 only) and the fuzzer itself.
- **Different reversibility.** The bridge fixes are mostly reversible (can revert if V0-14 turns up something new). §7f's scheduler DI (FR-15) and the bridge-invariant watcher's origin-gating (FR-11) touch production `ObserverDeps` shape and test-harness defaults — one-way doors once merged (see Finding 3).
- **Different iteration loops.** The 4 bugs have a complete acceptance harness today — the reproducer file either passes or it doesn't. The harness hardening items genuinely need iteration against real usage: first bugs found after shipping tell you whether the fuzzer's op set is right; false-positive rates on real CI runs tell you whether the quiescence window is tuned; scheduler-DI behavior differences only surface when tests actually migrate. A spec cannot iterate on §7f without first shipping §7a+§7b and watching them operate.

**Current design:** §7f opening ("Why this is in scope under greenfield rules"): "Finding these 4 bugs required rebuilding the same three scaffolding patterns each time. That's not 'missing nice-to-haves' — it's the signature of missing infrastructure that forces ad-hoc re-invention per bug. Absence of this infrastructure IS tech debt... Two staff engineers would agree that the correct architectural precedent is: bridge invariants are continuously enforced (watchers) and property-verified (PBT), not relied upon by convention and sampled by example."

**Alternative:** Two specs:
1. **This spec (trimmed):** FR-1..FR-10 + §7e Bug-D handoff. All surgical, all directly motivated by the Complication, all measurable by the reproducer file. Keep D1..D13.
2. **Sibling spec `bridge-harness-hardening`:** FR-11..FR-17 as a dedicated architectural spec. Starts from the *observed* gap ("we rebuilt the same scaffolding for 4 bugs in 3 specs — evidence attached"), iterates on its own merits, has its own audit loop where scheduler-DI behavior differences and fuzzer op-set completeness get real scrutiny.

**Trade-off:** Bundling gains: one PR, one audit cycle, shared review context. Bundling costs: the two bodies dilute each other — audit attention focused on §7f misses §7a correctness concerns, and audit attention focused on §7a misses §7f's architectural implications. The §7f body has grown to ~40% of the spec's length; two reasonable staff engineers would disagree on whether it belongs (which is the signal the protocol calls out for surfacing).

The first-pass audit ran only against FR-1..FR-8 / D1..D11 and found issues in the core fix (H1 origin attribution, M1-M4 framing gaps). That's the scrutiny density FR-1..FR-8 needs. §7f has had one pass of cold-reader audit (this one) against ~440 lines of new architectural scope — proportionally thinner. Splitting would give each body the scrutiny it warrants.

**Status:** CHALLENGED
**Suggested resolution:** Nick's call. Options: (a) Keep bundled, accept the scrutiny-density asymmetry, and flag §7f sections as "ship with placeholders; iterate in follow-up PRs against real usage." (b) Split into two specs, defer §7f to a sibling spec that opens after §7a+§7b ship. (c) Contract §7f to its narrowest subset — the one piece that §7a/§7b/§7e actually require as infrastructure, and move FR-13/FR-14/FR-15/FR-16/FR-17 to the sibling spec. My recommendation is (c) — see Finding 2 for which sub-item is load-bearing.

---

### [H] Finding 2: FR-11 bridge-invariant watcher quiescence mode will fire false positives on CI and couples the watcher's utility to an implicit-time heuristic

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap — CI)
**Location:** §7f.1 (FR-11), D14, R-0 in §11 (risk re: false positives)
**Issue:** FR-11 proposes a hybrid: per-transaction assertion for "enforcing" origins + quiescence check (400ms timer after last tx, no new activity → assert). The per-tx mode is sound — it's origin-gated, synchronous, race-free. The quiescence mode is where the failure modes live:

1. **400ms is a magic number.** The spec derives it as `max(DEBOUNCE_MS=50, TYPING_DEFER_MS=300) + 50ms slack`. But CI runners run at variable speed, the test-harness debounce is already overridden to 200ms (`createTestServer` uses `debounce: 200` not production 2s), and Observer A's 50ms debounce can drift under event-loop pressure. A quiescence check firing 400ms after last tx can land mid-Observer-B's 300ms typing defer on a slow runner — flagging a transient state as a violation. The spec's own Risk R-0 acknowledges this ("Medium likelihood") but the mitigation ("investigate; if flaky, extend quiescence") converts flakiness into a tunable, which is the shape of implicit time coupling the spec explicitly rejects in D15/D16.

2. **Quiescence is trying to catch "user stopped typing and nothing is reconciling it" — but the only case where that's a real bridge violation is if Observer A doesn't fire. If Observer A fires, its per-tx check under `ORIGIN_TREE_TO_TEXT` already asserts the invariant at exactly the right moment (post-debounce-drain). The quiescence check adds coverage only for "Observer A is broken and doesn't fire." But Observer A not firing is caught by the per-tx check's absence of `ORIGIN_TREE_TO_TEXT` transactions — the test times out on its own assertions, which is a clearer signal than a quiescence-check failure.

3. **The spec justifies "belt + suspenders" but doesn't specify what the suspenders catch that the belt misses.** If the answer is "local WYSIWYG typing that Observer A is supposed to reconcile but doesn't," that's diagnosable via per-tx check + a missing `ORIGIN_TREE_TO_TEXT` transaction within a bounded window (which is what `assertAllConverged(clients, { timeout })` in FR-14 already provides). The quiescence watcher doesn't add a capability beyond what per-tx + timeout-bounded convergence asserts already provide — it adds a noise surface.

**Current design:** §7f.1 "Two assertion modes: (a) per-transaction — if `tx.origin` is in {enforcing origins}, assert invariant immediately after afterTransaction; (b) quiescence — after max(DEBOUNCE_MS, TYPING_DEFER_MS) + 50ms since last transaction with no new activity, assert invariant." R-0 mitigation: "Medium likelihood of false positives; during rollout investigate whether violation is (a) genuine, (b) legitimate transient, (c) intentionally-drifting test."

**Alternative (DC1 simpler):** Drop the quiescence mode entirely. Keep the per-tx mode. For cases where "nothing was reconciling" is the actual bug, use `assertAllConverged(clients, { timeout })` — which is already in FR-14 and is the natural shape of the assertion ("after this timeout, the system should have settled"). That gives:

- Deterministic per-tx invariant enforcement (origin-gated, no time coupling)
- Explicit convergence assertion at test-author-chosen points (via FR-14's `assertAllConverged`, which already encodes the bridge invariant in its final check)
- Zero quiescence timer, zero magic 400ms number, zero implicit-time coupling in the watcher
- The same coverage the quiescence mode would have provided, but pulled to the test author's explicit choice of where to assert settled-state

**Trade-off:** Losing quiescence means tests that silently don't call `assertAllConverged` would miss a settled-state bridge violation that happens to land on the local-typing path (origin=undefined). But: (a) the per-tx mode catches every reconciliation — when Observer A debounces and fires `ORIGIN_TREE_TO_TEXT`, the per-tx check asserts; the only missed case is "Observer A never fired at all" which is already a test failure mode on its own (Y.Text never contains the typed content); (b) FR-17's fuzzer runs `assertAllConverged` as its oracle, so the continuous fuzzer coverage is unaffected.

**Status:** CHALLENGED
**Suggested resolution:** Replace the hybrid with per-tx only, and promote `assertAllConverged` (FR-14) as the canonical "assert settled state" surface. Add a paragraph to §7f.1 explaining why quiescence is not part of the watcher contract. Alternatively, if the quiescence mode is kept for the belt-and-suspenders justification, calibrate it based on observed CI runner latency over a week of data before shipping, not pick 400ms a priori.

---

### [H] Finding 3: FR-15 scheduler DI adds a production-shape change for test-determinism benefit that parameterizing `DEBOUNCE_MS` would already buy

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap — future test flakiness)
**Location:** §7f.5 (FR-15), D15, §13 SCOPE entry for observers.ts
**Issue:** FR-15 adds `scheduler?: Scheduler` to `ObserverDeps`. The stated architectural precedent is "subsystems with time-sensitivity depend on injected schedulers, not global setTimeout." But:

1. **`ObserverDeps` is currently non-exported** (`interface ObserverDeps` at `observers.ts:112` — not `export interface`). FR-15 either exports it or routes the scheduler via `setupObservers` call shape. Both change the module's public surface. PR #128 just stabilized this module; every test file (7 stress files, the integration harness, observers.test.ts) consumes `setupObservers` and will need to pass the scheduler option when they want determinism. This is a one-way door once the shape is locked (see also Finding 9 re: concurrent contributors).

2. **Two-path behavior gap.** The scheduler default (`globalThis.setTimeout` passthrough) and the manual scheduler (`createManualScheduler`) use the same contract on the wire, but the test path has synchronous-flush semantics while production has event-loop semantics. A bug that manifests under event-loop ordering (e.g., microtask queue interleaving between `setTimeout` callback and a subsequent tx) will be invisible under the manual scheduler. The spec's Risk R acknowledges this ("a scheduler DI bug") but the mitigation ("Playwright E2E cross-check") is already the test layer we expect to catch this class of bug without scheduler DI. Adding scheduler DI adds a surface for a class of bug that Playwright already catches.

3. **The determinism gain is specific to a small test set.** The tests that need scheduler control are "debounce-fires-at-exact-timing" tests — primarily Observer A's Path A vs Path B dispatch assertions and the drift-catcher assertion (FR-3). Every other integration test is happy with `assertAllConverged(clients, { timeout })` which already has a timeout budget and doesn't care exactly when the debounce fired. So FR-15's ROI is narrow: it makes a specific subset of tests cleaner, at the cost of a public-shape change to observers.ts.

4. **The simpler alternative is already partially in place.** `test-harness.ts` already overrides production debounce (`debounce: 200` instead of `2000`). The test harness could parameterize `DEBOUNCE_MS` and `TYPING_DEFER_MS` via a test-only env var or an additional option to `createTestClient`. That keeps the determinism benefit (shorter waits in tests, no wall-clock pressure) without introducing a DI abstraction that changes event-loop semantics.

**Current design:** §7f.5: "observers have a scheduler dependency, not a global `setTimeout` dependency. Future observers adopt the same shape." D15: "Implicit time-coupling is the most common source of test flakiness in bridge tests... Scheduler DI converts implicit time dependency into an explicit dependency on an injected abstraction."

**Alternative (DC1 simpler):**
- **Option A (smallest):** Parameterize `DEBOUNCE_MS` (currently hardcoded at `observers.ts:XX`) as an optional field on `ObserverDeps`. Default: 50. Tests set it to 0 for synchronous-ish behavior. Production untouched. This removes the wall-clock-wait-for-debounce pattern from tests without a DI layer.
- **Option B (if manual scheduler is really needed):** Scope scheduler DI to test-only code. Don't add `scheduler?` to `ObserverDeps`; instead, the test harness wraps `setupObservers` with a shim that replaces `setTimeout`/`clearTimeout` only for observer timers. Production code stays exactly as it is.

Both keep the determinism gain. Neither changes `observers.ts`'s public shape.

**Trade-off:** Keeping scheduler DI gains: a named precedent that future timers adopt. Removing scheduler DI gains: no public-shape change, no two-path behavior gap, no one-way door for a new observer-pipeline contributor. The precedent is a genuine good — but the spec is building it on a module that just stabilized, and the precedent can be established later (sibling spec, Finding 1) without blocking §7a.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) defer scheduler DI to the sibling spec and ship FR-1..FR-10 + FR-11 (per-tx only) + FR-12 + FR-13 + FR-14 now; (b) scope scheduler DI to test-only (Option B) to avoid changing observers.ts's public shape; (c) accept the precedent-setting value and document the two-path behavior gap as a known limitation, with Playwright as the cross-check.

---

## Medium Severity

### [M] Finding 4: FR-16 network-control middleware is a simulation environment, not a test of real sync behavior — 20% of the API achieves 80% of the bug-reproduction value

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §7f.6 (FR-16), D16, §8 OQ references
**Issue:** FR-16 exposes `pauseSync()`, `resumeSync()`, `delaySync(ms)`, `dropInbound(predicate)`, `inspectSyncQueue()` — five methods plus a full `ControllableWebSocket` wrapper class. D16 justifies this as "the same mechanism Y.js core, Automerge, and Hocuspocus's own test suite use."

Challenge: the diagnostic artifacts cited (Bug-C real-reachability, Bug-D V0-14 flow) needed exactly two operations: "pause inbound on client X" and "resume inbound on client X." The other three (delay, drop, inspect) are speculative — for races we have not yet encountered. The spec's own rationale ("Bug-C real-reachability reproducer had to disable a function inside running code") is a one-line mechanism — `pauseSync`/`resumeSync` would have sufficed.

A minimal alternative would ship:
- `pauseSync()` and `resumeSync()` on `TestClient`
- Implementation: a boolean flag + a message queue, intercept `onmessage` via the existing `WebSocketPolyfill` option that `HocuspocusProvider` already accepts

That is ~30 lines of code with one binary state. `delaySync`, `dropInbound`, `inspectSyncQueue` are:
- **delay:** equivalent to pause-for-N-ms then resume; can be implemented as `await wait(ms); client.resumeSync()` at the test author's call site.
- **drop:** adds a predicate mechanism for "simulate network loss" — but CRDTs are designed to heal from loss on reconnect, which is a reconnect test, not a drop test. There is no bridge-convergence bug that requires simulating dropped awareness updates in the test harness today.
- **inspect:** debugging aid for the fuzzer; can be added in follow-up when the fuzzer reports a confusing failure.

Shipping all 5 methods + the `ControllableWebSocket` class sets the expectation that the fuzzer and future tests will use them — but they haven't yet, which means we don't know whether the API shape is right. The precedent in D16 ("bridge tests reproduce races structurally, not temporally") is correct; the manifestation ("5-method network-control API") is speculative.

**Current design:** D16: "Message-ordering control (pause/resume queued inbound WebSocket messages) is the same mechanism Y.js core, Automerge, and Hocuspocus's own test suite use." §7f.6 implements pause/resume/delay/drop/inspect.

**Alternative (DC1 simpler):**
- Ship `pauseSync` + `resumeSync` on TestClient now.
- Add `delaySync`, `dropInbound`, `inspectSyncQueue` in follow-up specs when a concrete test motivates each one. "Extensible later" is cheap for the simple pause/resume wrapper; adding methods to a thin class is not architectural debt.

**Trade-off:** Shipping the full API now gains: one PR for the network-control story. Losing: over-fitting the API to hypotheticals; the fuzzer's op set (FR-17) lists `sync-delay` and `sync-drop-awareness` as ops, which creates a circular dependency — the fuzzer uses the API, but the API is designed for the fuzzer, with no independent validation of either. Shipping the minimal surface first breaks that circularity.

**Status:** CHALLENGED
**Suggested resolution:** Trim FR-16 to `pauseSync`/`resumeSync` only. Update FR-17 fuzzer op set to match. Add `sync-delay`/`sync-drop` in follow-up when a bug or product scenario needs them.

---

### [M] Finding 5: FR-17 PBT fuzzer's minimal op-set is under-specified and risks shipping a fuzzer that doesn't actually catch the bugs its precedent claims

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC3 (Framing validity — PBT precedent claim)
**Location:** §7f.7 (FR-17), D17, §12 (Extend FR-17 fuzzer operation set)
**Issue:** D17 claims "Y.js core, Automerge, and Riak DT verify convergence by property-based testing." That claim is true for the CRDT primitives themselves (the operation-interleaving proofs for AW-map, RGA, etc.), but the spec is using it to justify PBT at the application-bridge layer — a conflation.

What Y.js, Automerge, and Riak DT PBT-test:
- Pure CRDT state machines: insert/delete operations, convergence of two replicas receiving the same ops in different order.
- Invariant: state equality after delivery of the same op set in any order.

What FR-17 fuzzes:
- Multi-client random operations across two CRDT types (XmlFragment and Y.Text) plus server-side handlers plus network middleware plus debounce timers.
- Invariant: bridge equality + client convergence + origin preservation.

These are fundamentally different systems. The CRDT primitive layer is provably convergent under Y.js's semantics (causal delivery). The bridge layer's convergence is a property of the handlers and observers we wrote — which is exactly what the 4 bugs this spec identifies were failures of.

The spec's minimum-viable op set:
```
{ wysiwyg-type, source-type, agent-write, agent-patch, external-change, sync-pause, sync-resume, sync-drop-random }
```

Missing ops that would actually exercise the bridge's real state space:
- **undo/redo** — V0-14's whole point. The spec acknowledges this (§12: "When V0-14 adds the `agent-undo` operation type, it extends FR-17's fuzzer generator to include it") but ships FR-17 without it. A fuzzer that can't fire undo is not sampling the race space that Bug-D lives in. It validates only forward writes.
- **tab-close** / reconnect — a production failure mode that's been flagged in prior specs. CRDT reconnect races are a known bug class.
- **network-partition-heal** — two clients diverge for N ops with sync paused, then converge. Y.js/Hocuspocus PBT suites cover this class of race. The fuzzer's current `sync-pause` + `sync-resume` approximates this only if test authors deliberately stage it.
- **concurrent-frontmatter-write** — separate Y.Map, but shares the bridge invariant (Y.Text has frontmatter).

The spec's own language is honest: "Minimal initial operation set — extensible as new operation types are added." But the justification for calling this PBT at all (D17) requires an op set that samples the race space meaningfully. Shipping a minimal op set is fine; claiming architectural precedent #11 and "PBT for bridge convergence" is too strong a claim for what's being shipped.

Second concern — iteration budget and replay discipline:
- 100 iterations × 2-5 clients × 50 ops. Each iteration spins up a Hocuspocus server, 2-5 clients, 50 ops, convergence assertion. Napkin math: if a single iteration takes 2-5 seconds, 100 iterations = 200-500 seconds. That's inside `bun run check:full:parallel` budget but not negligible. Under CI runner load, expect flakes (R in §11 agrees: "Medium likelihood of CI flakes").
- Seed replay mechanism is specified but not exercised. The spec doesn't describe what happens when a fuzzer flake occurs in CI: does CI fail? Does it retry with the same seed? Does the seed snapshot get uploaded as a CI artifact? Without that pipeline design, "deterministic replay" is a promise the fuzzer makes but the CI environment may not honor.

**Current design:** D17: "Bridge convergence is property-based-verified... Every serious CRDT library (Y.js core, Automerge, Riak DT) verifies convergence by property-based testing." §7f.7: 8 op types, 100 iterations × 50 ops, seed snapshot on failure.

**Alternative (DC3 reframing):**
- Be honest about what FR-17 is: **a randomized multi-client stress test** at the bridge layer, not PBT in the theoretical sense. That's still useful — the 4 bugs would have been caught by a randomized stress test with a bridge-invariant oracle. But it's not "property-based testing" in the CRDT-primitive sense D17 invokes.
- Reframe D17: "Bridge convergence is randomized-stress-tested with oracles (bridge invariant, convergence, origin preservation)." Drop the "PBT" claim and the claim of alignment with Y.js core's discipline — those are different test disciplines.
- Drop precedent #11's "property-verified" language. Replace with "randomized-stress-verified" or simply describe the fuzzer by its mechanism ("continuous multi-client convergence fuzzing") without invoking PBT theory.
- For iteration budget, specify the CI behavior contract explicitly: 25 seeds on PR (fast feedback), 100 seeds on main (nightly), seed snapshot uploaded as CI artifact on failure, replay documented in contributor guide.

**Trade-off:** Keeping "PBT" in the language is aspirational and sets a precedent. Dropping it is honest and calibrates expectations. The fuzzer mechanic (random ops + invariant oracles) is fine regardless of what it's called. The architectural precedent (#11) can still be "bridge changes extend the fuzzer generator" — that's the useful discipline, independent of whether we call it PBT.

**Status:** CHALLENGED
**Suggested resolution:** (a) Reframe D17 as randomized-stress-testing with oracles; drop the PBT claim and the implied alignment with CRDT-primitive PBT suites. (b) Specify initial op set explicitly — ship with {wysiwyg-type, agent-write, agent-patch, sync-pause, sync-resume, wait} only for v1; add `source-type`, `external-change`, `agent-undo`, `reconnect` in follow-up. (c) Specify CI behavior: seed budget on PR vs main, artifact upload, replay documentation. (d) Validate the fuzzer catches the 4 known bugs by running it against the pre-fix state before shipping — if it doesn't catch all 4 within 25 seeds, either the op generator is under-sampling or the oracle is under-specified; both invalidate the precedent claim.

---

### [M] Finding 6: Bug-D handoff's `.skip`-guarded gate is a promise, not a contract — no mechanism enforces V0-14 unskips before shipping

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — V0-14 implementer incentives)
**Location:** FR-10, §7e, §8 OQ-5, STOP_IF "Bug-D regression test runs unskipped in CI"
**Issue:** The spec's handoff mechanism for Bug-D is:
1. Delete the buggy mechanism (`syncTextToFragment` — FR-9).
2. Rewrite CLAUDE.md STOP rule to point at `applyAgentMarkdownWrite`.
3. Commit a `.skip`-guarded regression test with "UNSKIP when V0-14 wires per-agent UM" comment.

Contributions 1 and 2 are strong — V0-14 can't inherit the buggy mechanism because it's gone, and the STOP rule directs Miles toward the correct pattern. But #3 is a soft gate:

- V0-14 is Miles's scope (D13). When Miles wires per-agent UM + `applyAgentUndo`, he controls whether to unskip the test.
- Nothing in the repo makes `test.skip` into a hard gate. A reviewer might notice the comment; a CI system does not check that `test.skip` pairs are still justified.
- The STOP_IF in §13 says "The Bug-D regression test runs unskipped in CI (FR-10 — must stay skip-guarded until V0-14 enables it)" — which is the *inverse* of what's needed. It tells V0-14's implementer when to keep it skipped, not when they must unskip it.

A stronger gate: a CI check that fails if the file path `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` contains `test.skip` AND the file `packages/server/src/agent-undo.ts` (or equivalent V0-14 addition) exists. That enforces "if you added the undo handler, you must have unskipped the test."

Alternatively: a named marker. The test file header comment includes `@unskip-when: V0-14 agent-undo handler lands` parsed by a pre-merge hook. Or: Miles's V0-14 spec (when written) lists "Unskip and pass bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts" as a required FR with acceptance criteria. That's a spec-layer gate, not a CI-layer gate, but it's at least a named requirement.

The spec's current gate relies on Miles remembering, the reviewer noticing, and social enforcement (D13's "Miles coordination codified"). In practice across multi-month specs, social gates decay.

**Current design:** FR-10: "Each `test(...)` becomes `test.skip(...)` with a top-of-file comment: 'UNSKIP when V0-14 wires per-agent UM'." STOP_IF: "The Bug-D regression test runs unskipped in CI — must stay skip-guarded until V0-14 enables it."

**Alternative (DC2 stakeholder-gap):**
- Add to §13 SCOPE an explicit requirement: "V0-14's spec must include 'Unskip bug-d-... test and make it pass' as a required FR with acceptance criteria."
- Alternative: a hook in `.husky/pre-push` or CI that scans all `test.skip` calls in the repo and requires a comment of the form `@unskip-when: <condition>`; fails if any `test.skip` lacks the annotation. Enforces discipline across all skipped tests, not just Bug-D's.
- Weakest-but-still-useful: a markdown registry at `docs/skipped-tests.md` listing every skipped test with rationale + unskip condition + owner. Updated in the same PR as the skip.

**Trade-off:** The current soft gate is low-friction but relies on memory. Any of the alternatives adds some process overhead but provides a named mechanism. Given V0-14 is a known-named follow-up with a specific owner (D13), a lightweight gate (SPEC-level requirement in V0-14's forthcoming spec) is probably sufficient. An automated gate would be over-engineered unless there are many skipped tests repo-wide with similar semantics.

**Status:** CHALLENGED
**Suggested resolution:** Add to the Bug-D handoff a named requirement on V0-14's eventual spec: "V0-14 spec must list 'Unskip and pass bug-d-...' as a required FR." Document the expectation in FR-10's description and in `evidence/bug-d-mechanism.md`. If a stronger gate is wanted later, the skipped-test registry is the lightest-weight option.

---

### [M] Finding 7: D17's "extensible later" claim for the fuzzer op-set is pattern-matched to a class of precedents that ossify

**Category:** DESIGN
**Source:** DC3 (Framing validity — precedent operationalization)
**Location:** D17, §12 ("Extend FR-17 fuzzer operation set as new bridge surfaces land")
**Issue:** D17 stakes the minimal-initial-op-set on the precedent "extensible as new bridge surfaces appear." The spec cites this as a virtue ("Minimal initial op set is deliberately minimal — appending new op types when new bridge surfaces land is cheaper than designing the generator maximally up front").

Challenge: in practice, "extensible later" ossifies. Patterns:

- Fuzzers become "that thing that runs in CI." Engineers add a bug to the fuzzer when the bug fires in production and escapes the fuzzer. But they don't proactively add op types when a new bridge surface lands — because the fuzzer's "current coverage is fine" is harder to disprove than to extend.
- V0-14's agent-undo is the exact case. The spec says V0-14 will "extend FR-17's fuzzer generator." But V0-14's own acceptance criteria (§7e) are: unskip bug-d test + extend FR-4. The fuzzer extension is implicit. If Miles ships V0-14 without extending the fuzzer (and the fuzzer passes because it doesn't have agent-undo in the op set), the fuzzer gives false confidence.

The spec does have precedent #11 ("bridge changes extend the fuzzer generator or explain why not") — which is the right answer in principle. But precedent #11 is in CLAUDE.md/AGENTS.md and depends on contributors reading it. It's not enforced by any check.

Comparing to other "extensible" primitives in the repo:
- `LocalTransactionOrigin` (precedent #1) — adopted consistently because TypeScript types force it.
- `sharedExtensions` array — kept in sync because drift causes silent data corruption (explicit failure).
- Structured event schemas (precedent #3) — mostly adopted, some drift in older code.
- Fuzzer op-set — has no type-system enforcement, no drift-detection, no runtime check.

The spec claims the discipline will hold but has no enforcement mechanism. That's the "extensible later" anti-pattern: a precedent documented in a markdown file with no runtime or CI check to enforce it.

**Current design:** D17: "Initial op set is deliberately minimal (appending new op types when new bridge surfaces land is cheaper than designing the generator maximally up front). Precedent #11 in AGENTS.md codifies: bridge changes extend the fuzzer generator or explain why not."

**Alternative (DC3 reframing):**
- Ship the initial op set but add an explicit test: for every write surface (`agent-write*` endpoints + Observer A + Observer B + file-watcher), assert there's at least one op kind in the generator that reaches it. Fails at CI if a new write surface lands without a fuzzer op. That's the enforcement mechanism for precedent #11.
- Alternatively, accept that the op set will ossify and ship the maximal set we can justify *now* — including `agent-undo` even though V0-14 hasn't written it, with a TODO for V0-14 to fill in the op's implementation. A stub op is cheaper to extend than an absent one.

**Trade-off:** Enforcement adds infrastructure. Accepting ossification is honest but weakens the precedent. Shipping a maximal op set preempts V0-14 but is over-design. The middle ground: ship the minimal set, add a one-line CI check that counts write surfaces vs op kinds and warns (not fails) on mismatch. Low-cost, informational, better-than-nothing.

**Status:** CHALLENGED
**Suggested resolution:** Add a CI check (or an invariant test in the fuzzer suite) that verifies every named agent-write surface has a corresponding generator op. If the V0-14 spec adds a surface without extending the generator, CI flags it. This converts precedent #11 from a documented norm into a programmatic constraint, at the cost of ~30 lines of test code.

---

## Low Severity

### [L] Finding 8: FR-11 `enforcingOrigins` Set uses `unknown` type — precedent #1 says origins are `LocalTransactionOrigin` objects, but the watcher accepts strings

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — future contributor)
**Location:** §7f.1 watcher code sample, FR-11
**Issue:** The watcher's `enforcingOrigins` is typed `Set<unknown>` and includes `'file-watcher'` (a string). AGENTS.md precedent #1 (typed transaction origins) says "All Y.Doc transaction origins use `LocalTransactionOrigin` objects, never raw strings." The spec is reinforcing this precedent in other places (FR-12 origin probe is explicitly `LocalTransactionOrigin`-compatible, §7f.2) but the watcher itself accepts strings and objects interchangeably.

This is a minor inconsistency — the watcher works correctly either way, and `file-watcher` is a legacy string origin pending migration. But a developer reading the watcher code and then reading precedent #1 will see drift. If string origins are to be migrated to `LocalTransactionOrigin`, the watcher should declare that expectation in its type. If not, precedent #1 needs a footnote.

**Current design:** `const BRIDGE_ENFORCING_ORIGINS = new Set<unknown>([ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, 'file-watcher', ...])`

**Alternative:** Type as `Set<LocalTransactionOrigin | string>` with a TODO comment: "Migrate 'file-watcher' to a LocalTransactionOrigin object per precedent #1." That makes the drift explicit in code.

**Trade-off:** None significant; wording change.

**Status:** CHALLENGED
**Suggested resolution:** Tighten the type to `Set<LocalTransactionOrigin | string>` + TODO comment. Low-priority polish.

---

### [L] Finding 9: §13 SCOPE expansion silently changes observers.ts public shape — no 1-way-door callout

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — concurrent contributors)
**Location:** §13 (Agent Constraints SCOPE for observers.ts), FR-15
**Issue:** The spec classifies FR-15's addition of `scheduler?: Scheduler` to `ObserverDeps` as an in-scope edit but doesn't call out that this changes `observers.ts`'s interface for all downstream consumers. `setupObservers` is imported by 7 test files + `provider-pool.ts` + `test-harness.ts` (grep confirms). Adding an optional field to `ObserverDeps` is backward-compatible, so this isn't a breaking change — but:

1. The spec doesn't note the consumer list anywhere.
2. If the field becomes required later (e.g., the manual scheduler is the only one that exposes `.flush()` and some future feature depends on `.flush()`), it becomes a breaking change.
3. Nick's memory file says "PR #128 recently stabilized the module" — adding public API soon after stabilization is exactly the kind of churn that complicates the ProseMirror-model nested-worktree issue the repo already fights with.

This isn't a hard error; the change is safe as designed. But the "1-way door" classification in the decision protocol is load-bearing: once `ObserverDeps` includes scheduler and tests depend on it, reverting means rewriting tests.

**Current design:** §13 SCOPE for observers.ts: "Add `scheduler?: Scheduler` to `ObserverDeps` per FR-15; route all `setTimeout`/`clearTimeout` calls (debounce + typing defer) through it; default to global passthrough."

**Alternative:** Add to the spec a 1-way-door callout: "ObserverDeps public-shape change. Consumers: 7 stress tests + test-harness + provider-pool. Reverting requires removing scheduler field from all consumers. Mitigation: field is optional with sensible default, so forward-compatibility holds." Or per Finding 3, defer scheduler DI entirely and keep observers.ts stable.

**Trade-off:** Wording / classification. The technical change is sound; the classification should reflect that observers.ts's public shape is touching a consumer-rich module.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) tag FR-15 explicitly as a 1-way door in the Decision Log and document the consumer list; or (b) per Finding 3, defer it to the sibling spec.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative) — decisions that survived challenge:**
- **D1 (XmlFragment-authoritative composition):** Correct. The rejected alternatives (propagation-wait D2, Y.Text-only D3) are correctly rejected; the Complication's mechanism analysis (`evidence/bug-a-mechanism.md`, `updateYFragment-is-structural-diff.md`) confirms the fix direction. First-pass challenger arrived at this independently.
- **D4 (drift-catcher inline in observer callback):** Correct. Orthogonal timer (D5 rejection) is genuinely worse; the inline fix is ~6 lines and synchronous within the observer callback.
- **D6 (split not unified):** Correct. The bugs have different trigger contexts (server agent write vs client remote tx). Shared utility (`applyByPrefixSuffix`) is the right reuse level; a unified abstraction would be forced.
- **D8 (extract `applyByPrefixSuffix` to core):** Correct. Two consumers (client observers + server handler), pure Y.Text-public-API signature, browser+Node compatible. Aligns with precedent #4.
- **D9 (delete `syncTextToFragment`):** Strongly correct. The first-pass challenger's Finding 3 led directly to this decision. The dead code would otherwise mis-direct V0-14 toward the known-buggy pattern. Transitive-dependency trace + the STOP-rule rewrite + skip-guarded regression test is a clean handoff.

**DC2 (Stakeholder gap) — decisions that survived challenge:**
- **§7e Bug-D handoff (D12):** Correct design partition. Bug-D's fix is genuinely design-coupled to V0-14's undo contract (snapshot vs contribution-scoped semantics, UM topology, origin). Writing `applyAgentUndo` now would be speculative infrastructure. The handoff contributions (dead-code cleanup, STOP-rule rewrite, skip-guarded test, documented pattern) are the right subset to land now — but see Finding 6 re: the .skip gate's enforceability.
- **D13 (Miles PR #134 no architectural dependency):** Correct coordination read. Both merge orders work; the rebase cost is symmetric.

**DC3 (Framing validity) — decisions that survived:**
- **FR-1..FR-8 core fix:** The bridge-invariant violation is real, the mechanism analysis is correct, the acceptance harness is concrete. First-pass audit confirmed the mechanism claims.
- **Primary happy-path and secondary-path user journeys:** The 7-step primary journey correctly traces through the fix. First-pass challenger H1 already surfaced the Y.Text-origin-attribution window for the agent-mirror path; resolution of that finding sharpened the spec's G5 claim.

**What I didn't challenge (and why):**
- **PR #128's LOCKED decisions D1–D16:** Out of scope for this spec; not re-litigated.
- **The core fix's acceptance criteria (FR-8 reproducer file):** Concrete, passing/failing, not judgment-sensitive.
- **The `applyByPrefixSuffix` extraction (FR-2):** Clean mechanical move; no design tension.

**Net assessment:** The bridge fix (FR-1..FR-10, §7e handoff) is sound and ready. The architectural expansion (§7f, FR-11..FR-17) over-reaches what this spec can validate. Findings 1-3 converge on the same recommendation: split the spec, or contract §7f to its narrowest load-bearing subset (per-tx invariant watcher + multi-client factory + server-side state inspector, FR-11 minus quiescence + FR-13 + FR-14). Findings 4-7 are refinements within §7f whether it stays or splits. Findings 8-9 are polish.
