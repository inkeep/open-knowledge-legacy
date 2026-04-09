# Design Challenge Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/crdt-stress-hardening/specs/2026-04-08-crdt-stress-testing/SPEC.md`
**Challenge date:** 2026-04-08
**Total findings:** 12 (5 high, 4 medium, 3 low)

Summary of severity distribution:
- **High:** S7 rationale doesn't match Yjs pattern, fuzz-harness framing mismatch, D14 flip is a false dichotomy, scale-tier axis is unsound, missing helper infrastructure.
- **Medium:** Layer C multi-turn arbitrariness, D1 separation of correctness from perf, 48-test-at-once vs tracer-bullet, A2 complexity claim is factually wrong.
- **Low:** Adversarial tier value, captureTimeout divergence unchallenged, scale ladder numbers.

---

## High Severity

### [H] Finding 1: S7 `mergeUpdates` round-trip is structurally incapable of catching a new bug class in our single-doc setup

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** SPEC.md §9 scenario table S7, §10 D12/D13, `evidence/yjs-stress-patterns.md` §"`toString()` equality is NOT sufficient"
**Issue:** The spec adds S7 (`Y.mergeUpdates` round-trip) across Layers A + B + all 3 realistic tiers (6 test cases, per D12) based on the claim that it "catches bugs where live-sync state can't serialize and re-hydrate correctly." Trace the Yjs reference the evidence cites — `testHelper.js:449-502` — and the round-trip assertion is only meaningful in the **multi-user convergence compare()** path: users have *received different subsets of updates* over a simulated network, and `mergeUpdates(user.updates)` merges those received updates into a fresh doc. That's a **merge** test, not a serialize/deserialize test.

In our single-doc single-user setup, `Y.encodeStateAsUpdate(doc) → Y.applyUpdate(freshDoc)` is a trivial round-trip that Yjs itself guarantees as a core invariant of the CRDT. It exercises the same struct-store that live observers already see. There is no code path a "serialize + rehydrate" test reaches that isn't already reached by the bridge-invariant assertion.

**Current design:** D12: "Add S7: `Y.mergeUpdates` round-trip scenario as a core correctness check" — "Agent flagged `Y.mergeUpdates` as 'a separate code path from live sync' — catches bugs where live-sync state can't serialize and re-hydrate. Yjs's own `compare()` tests this explicitly for the same reason."
**Alternative:** Drop S7 from Layers A + B (removes 6 test cases). If a merge-path test is wanted, it belongs in **multi-client concurrent stress** (currently NG3 Future Work) — that's the only setting where `mergeUpdates` has non-trivial work to do.
**Trade-off:**
- Gained: -6 test cases, removes a scenario whose rationale was imported from a multi-user harness without re-grounding.
- Lost: A defensive check that's cheap in wall-clock. If the author wants it anyway, it should be relabeled "sanity check" not "catches a bug class live-sync misses" — the claim as written overstates the signal.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) drop S7 and move to NG3 (multi-client stress), or (b) keep but re-label: it's a belt-and-suspenders sanity check, not a distinct bug-class probe. The spec rationale should not cite Yjs's multi-user `compare()` as precedent because the code paths are not analogous.

---

### [H] Finding 2: Fuzz harness (Layer D) inherits Yjs vocabulary without its core mechanism — it's not `applyRandomTests`, it's a loop

**Category:** DESIGN
**Source:** DC1 + DC3
**Location:** SPEC.md §9 "Layer D — Randomized fuzz", D15, D16; `evidence/yjs-stress-patterns.md` §"The canonical pattern"
**Issue:** The spec (D15, §9) adds Layer D because "randomized fuzz is standard practice in the Yjs ecosystem" and "Yjs's `applyRandomTests`" is the precedent. The actual Yjs pattern (`testHelper.js:568-593`) is:
```
applyRandomTests(tc, mods, iterations) {
  const { testConnector, users } = init(tc, { users: 5 });
  for (let i = 0; i < iterations; i++) {
    // 2% disconnect/reconnect, 1% flushAll, 50% flush a random message
    // pick a random user, apply a random mutator
  }
  compare(users);   // convergence check across 5 users
}
```
The entire point of `applyRandomTests` is **randomized network scheduling across N users** — the `TestConnector.flushRandomMessage` call surfaces bugs that only manifest when packet delivery order interleaves with mutations. Our spec's Layer D has no `TestConnector`, no multiple users, and no random packet flush. It's a single-doc mutator loop that the spec acknowledges ("adapted to single-doc single-user scenario"). That's fine — but it's not the Yjs canonical pattern. The pattern's bug-finding power comes from network interleaving, which we don't have.

What Layer D actually does is randomize the **order of local operations** (push paragraph, delete paragraph, insertYText, undo, markTyping, flush). For our bridge, that's a mutator-ordering stress test. Whether it catches bugs the deterministic tiers miss depends on whether our bridge has ordering bugs that deterministic S1-S5 don't exercise. Deterministic S4 (`Agent undo during active user typing`) already covers the one documented multi-actor interleaving. The non-determinism Layer D adds is: "what order do mutators fire across 50-500 iterations?" — which is useful, but the claim "it's Yjs's standard practice" is a vocabulary carry-over, not a structural match.

**Current design:** D15: "Yjs ecosystem's canonical pattern, used by yjs + y-prosemirror + y-codemirror.next. Catches rare interleavings that deterministic tests miss."
**Alternative:** Frame Layer D honestly as "Bridge mutator sequencer — randomized local-op ordering against our XmlFragment↔Y.Text bridge." Acknowledge it is NOT `applyRandomTests` (which is a multi-user network simulator). Keep it if the author believes local-op ordering is a real bug surface; drop or defer to Future Work if the spec can't point to a concrete ordering interleaving that S1-S5 don't already exercise.
**Trade-off:**
- Gained: Honest framing unlocks the real question — "is local-op ordering actually a bug surface, or did we adopt a pattern name?" If yes, keep. If the answer is ambiguous, defer to Future Work along with fast-check (already there).
- Lost: Nothing, if Layer D stays. Just accurate framing.
**Status:** CHALLENGED
**Suggested resolution:** Rewrite D15 rationale to remove the "canonical pattern" claim. Layer D may still be justified — but on the grounds that OUR bridge has a bug surface (mutator ordering) that the deterministic matrix doesn't exercise, not on a Yjs inheritance argument. If the author can't name a concrete bug class only Layer D would catch, defer to Future Work alongside fast-check (which is already deferred for similar reasons per §15 Explored).

---

### [H] Finding 3: D14 flip (dedicated S8 vs spreading Unicode) is a false dichotomy — both attribution AND coverage are achievable

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §10 D14 (new), §9 S8; `meta/_changelog.md` 2026-04-08 iterate follow-up section
**Issue:** The changelog records that D14 was flipped from "Unicode spread across all scenarios" to "Unicode in a dedicated S8 only" because "spreading Unicode destroys failure attribution." This framing presents two options that don't need to be mutually exclusive. A third option: **ASCII-only generator by default + Unicode-only generator for S8 + parameterize S1/S2/S4 over `{ascii, unicode}`** gives both attribution (test name encodes the content kind) AND coverage (concurrent typing with Unicode is exercised).

The current D14 states "failure attribution — if S1 passes and S8 fails, it's a Unicode bug." But if S8 tests only propagation (S1-shaped) and concurrent typing (S2-shaped) is NOT tested with Unicode, there's a coverage gap: a Unicode bug that only manifests under concurrent typing will not surface in S8. The spec even calls this out implicitly — S8 is a single scenario (propagation + strict convergence) across 3 tiers (9 cases), while concurrent typing / undo chains / rapid writes stay ASCII-only.

This is a real gap the /tdd rationale ("tests should describe WHAT failed, not be forensic puzzles") does NOT resolve. Parameterized scenarios with unambiguous names (`S2_concurrent_typing_ascii`, `S2_concurrent_typing_unicode`) give both attribution AND coverage. The test name tells you which parameter failed.

**Current design:** D14: "Synthetic generator: ASCII-only by default. Unicode handled via a dedicated S8 scenario, not spread across all scenarios" — "Spreading destroys attribution."
**Alternative:** Keep the generator separated (ASCII and Unicode as two modes). Parameterize each core scenario over `{content: ascii, content: unicode}`. Test names encode the parameter so attribution is preserved. Fewer scenarios than naively spreading; more than just S8.
**Trade-off:**
- Gained: Closes coverage gaps for `{concurrent typing, undo during typing, rapid writes} × Unicode`. Attribution preserved via named parameters.
- Lost: More test cases. If there are K realistic tiers × N scenarios, you add another K×N Unicode cases (worst case). For small/medium realistic only (10K Unicode is overkill) with S1/S2/S4 = 2 tiers × 3 scenarios = 6 extra cases on top of S8's 3.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D14. The "spreading destroys attribution" argument is wrong if you parameterize properly. Decide based on actual coverage need, not on a false either/or.

---

### [H] Finding 4: Scale tiers measure the wrong axis — content size doesn't exercise the bugs §8 identifies as the surface

**Category:** DESIGN
**Source:** DC1 + DC3
**Location:** SPEC.md §9 scale tiers table, D2; §8 "Where the bugs live"; `observers.ts:125-226` `applyUserDelta`
**Issue:** The spec's §8 names the bug surfaces precisely: `applyUserDelta` (three-way delta reconciliation), bidirectional observer races with origin guards + typing-defer windows, server-side per-origin UndoManager with concurrent users. It then names exactly one bug — gap 2 — where content size was a factor (and even there, the bug was whitespace/line-boundary alignment, not size per se; small content also exhibited it).

The scale tiers (500 / 2000 / 10000 / 50000 lines) primarily stress **serialization throughput** (`mdManager.serialize`, `yXmlFragmentToProsemirrorJSON`) and **diff alignment math** (`diffLines`). That is not the same surface as the observer race conditions. A 10K-line test with NO concurrent mutations exercises large-content throughput; it doesn't exercise the race paths unless you also inject concurrent typing DURING the write.

The axes that actually exercise our stated bug surface:
1. **Mutation count / concurrency depth** at constant content size — how many interleaved `markUserTyping` + observer firings happen inside a single large write?
2. **Time under load** — does the typing defer window ever get stuck? (Observer B self-reschedules — a stuck scheduler bug needs sustained pressure, not big content.)
3. **Ops-per-scenario ratio** — how many user delta passes happen for one agent write?

Content size touches all of these indirectly (bigger content = longer debounce windows = more interleaving opportunities), but indirectly is weaker signal than direct. The spec admits this implicitly: S2 at 50K is excluded from adversarial because "sustained typing for 30+ seconds — flaky," yet that IS the test that would exercise the sustained-pressure bug class.

**Current design:** D2: "Graded scale across 4 tiers" chosen because "User explicitly wants to know the limits." Content-size as the primary axis (500/2000/10000/50000 lines). All other dimensions (mutation density, concurrency depth, time under load) are held constant.
**Alternative:** Keep ONE content-size tier (medium-realistic, 2000 lines — the PQ11 product case) and vary the orthogonal axes:
- `tier A: 2000 lines × 1 user mutation interleaved`
- `tier B: 2000 lines × 10 mutations interleaved`
- `tier C: 2000 lines × 50 mutations interleaved (sustained)`
- `tier D: 2000 lines × 10 mutations × 5 undo round trips`
These test the three named bug surfaces directly. Content at 10K/50K becomes a single smoke test for throughput only.
**Trade-off:**
- Gained: Test matrix targets the documented bug surfaces. Fewer tier cells. "What are the limits" is answered by the smoke test.
- Lost: The author loses "show me the limits" across 4 scales, which was an explicit product goal. And "10K lines" is the realistic `architecture.md` case — if that works, the product works.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D2. The author's stated goal ("find the limits") is legitimate but conflates content-size limits with race-condition limits. Propose a two-axis matrix: `{content-size: small / medium / large} × {concurrency-depth: low / medium / high}` with probe-tier adversarial for both corners. Cheaper than the current 4 tiers and more targeted.

---

### [H] Finding 5: Layer C Playwright helpers do not exist in the codebase — this is a spec-time implementability gap

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — implementer)
**Location:** SPEC.md §9 Layer C step 3, 5, 7, 9, 11 — references `helpers.startConsoleCapture`, `helpers.waitForDOMStabilization`, `helpers.getConsoleErrors`
**Issue:** Grep across `init_spike/tests/` returns zero matches for `waitForDOMStabilization`, `startConsoleCapture`, `getConsoleErrors`. These helpers don't exist in the codebase. The spec's Playwright sequence depends on them as if they were a stable internal API. This isn't a nit — the Playwright step sequence is load-bearing for D10 ("Playwright E2E is multi-turn, not smoke test") and the fix is non-trivial: an agent implementer will either invent helpers on the fly (creating drift from any intended shared API), or have to build them first (hidden scope not called out in FR4 or next-actions).

**Current design:** §9 Layer C step 3: "Start `helpers.startConsoleCapture(page)` — catch silent errors" — presented as if calling an existing utility.
**Alternative:** Either (a) build a `tests/e2e/helpers/` module as an explicit pre-requisite In-Scope item (and enumerate its contract), or (b) inline the helper behavior in the test (bare `page.on('console', ...)` + simple poll for DOM stabilization).
**Trade-off:**
- Gained: The implementer has a viable path. Option (a) creates reusable infrastructure; option (b) is lightweight but duplicated.
- Lost: Nothing — this is a completeness fix, not a scope challenge.
**Status:** CHALLENGED
**Suggested resolution:** Add to §9 In Scope list: either "Create `tests/e2e/helpers/` with `startConsoleCapture`, `waitForDOMStabilization`, `getConsoleErrors`" (with contract) OR rewrite Layer C step list to use direct Playwright APIs only. The spec as written has an implementability gap that §16 Agent Constraints (TBD) cannot paper over.

---

## Medium Severity

### [M] Finding 6: "3 turns" in Layer C is arbitrary — the number has no grounding in the bug surface

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §9 Layer C step 10, D10 rationale
**Issue:** The spec mandates "Repeat steps 4-9 **three times** (multi-turn) with increasingly complex content." D10's rationale is user input ("I think we need to test like multi-turn stuff"), which justifies multi-turn existing but not specifically **3**. Why 3 and not 2 or 5?

The honest answer is probably "3 is enough to see steady-state behavior (first turn is cold, subsequent turns exercise repeat patterns)." That is a defensible answer but the spec doesn't say it. And it doesn't explain why the N is fixed rather than parameterized. For a Playwright test that already takes minutes, 3 is a conservative choice; for a deterministic unit test, 3 is arbitrary.

**Current design:** "Repeat steps 4-9 three times (multi-turn)"
**Alternative:** Either (a) document the rationale ("first turn has cold-start behavior, turns 2+ exercise steady-state repetition — 3 is the minimum to see both") or (b) parameterize `N_TURNS` as a constant with a comment explaining the floor.
**Trade-off:**
- Gained: Future readers understand why it isn't 2 or 5.
- Lost: Nothing.
**Status:** CHALLENGED
**Suggested resolution:** Low-cost clarification in D10 or FR4. Not a scope change.

---

### [M] Finding 7: "Correctness vs performance" separation (D1) is artificial — slow stress IS a correctness signal

**Category:** DESIGN
**Source:** DC3
**Location:** SPEC.md §2 G1/G3, §3 NG1, D1, §14 Risk row 3 (diffLines O(n·m))
**Issue:** D1 locks "primary goal = correctness, not performance benchmarking" and moves perf to NG1 (Not Now). But the spec also acknowledges (§14 Risk 3) that diffLines performance at 10K lines could "force a diff strategy change" — which is both a correctness AND performance concern. The §14 Risk 3 mitigation is "measure during iterate." That measurement IS performance benchmarking by another name — just not instrumented.

Furthermore, FR8 ("Empirical timing report: Stress suite emits per-scenario wall-clock timing + a summary") already emits performance data. The spec is collecting performance data while claiming performance is out of scope. The distinction collapses: the suite will measure perf; the author has just chosen not to set SLAs on it. That's a different posture from "perf is out of scope."

**Current design:** D1: "Primary goal = correctness, not performance benchmarking" — "Performance → Future Work (NG1)"
**Alternative:** Rephrase D1 as "Primary goal = correctness. Performance is observed but not gated. SLA-setting is Future Work." This is honest about what FR8 does.
**Trade-off:**
- Gained: D1 stops drawing a line that FR8 walks across.
- Lost: Nothing. Same behavior, more coherent framing.
**Status:** CHALLENGED
**Suggested resolution:** Low-cost edit to D1 phrasing. The current framing is not wrong enough to reopen scope, but it creates reader confusion.

---

### [M] Finding 8: 48 test cases at once conflicts with /tdd tracer-bullet guidance referenced in D14

**Category:** DESIGN
**Source:** DC1 (simpler alternative for implementation)
**Location:** SPEC.md §13 Next actions; `meta/_changelog.md` notes /tdd was loaded during iterate
**Issue:** The changelog records that `/tdd` skill was loaded and informed D14. /tdd's core rule is "vertical slicing via tracer bullets — RED→GREEN one test at a time, never bulk-write tests first" (tdd/SKILL.md:108-134). The spec's final state is **48 test cases across 4 files** plus a synthetic generator plus fixtures plus helpers plus runner integration. The Next Actions list in §13 is:
```
- Build synthetic generator (FR1)
- Build observer stress file with core scenario matrix (FR2)
- Build API stress script (FR3)
- Build Playwright E2E test (FR4)
- Add test:stress script (FR6)
```
This is horizontal slicing: build the generator, then build the stress file with its ~23 cases, then build the API script with its ~21 cases. A tracer-bullet approach would be: build ONE scenario end-to-end across Layer A → Layer B → Layer C, learn from it, then broaden.

This isn't an abstract preference — the horizontal approach here risks specific failure modes:
- If the synthetic generator has a flaw that's only visible downstream (e.g., Unicode normalization edge case, frontmatter parsing), it gets baked into all 23 Layer A cases before Layer B surfaces it.
- If `applyUserDelta` has a bug at 10K lines that changes the shape of required assertions (e.g., normalization needed beyond trailing whitespace), all upstream test cases are already written against the wrong assertion.
- If Layer C's missing-helpers gap (Finding 5) is discovered during implementation, it blocks the whole Playwright layer after Layers A + B are done.

**Current design:** Implicit horizontal-slicing via enumeration of FR1-FR11 in Next Actions.
**Alternative:** Rewrite Next Actions as a tracer-bullet sequence:
```
1. Tracer: S1 (single agent write) + small-realistic tier, Layer A only. Generator minimum, assertion minimum. GREEN.
2. Add S7/S8 at same scale in Layer A. GREEN.
3. Widen scale to medium-realistic, still Layer A. GREEN. (learn what scales.)
4. Pull S1 into Layer B. GREEN. (learn what API layer needs.)
5. Pull S1 into Layer C as smoke test. GREEN. (learn what Playwright helpers need.)
6. Now broaden: add S2-S5 at Layer A, then Layer B.
7. Multi-turn S6 in Layer C.
8. Layer D fuzz (if kept per Finding 2).
```
Each tracer-bullet cycle is a single RED→GREEN.
**Trade-off:**
- Gained: Bugs in the generator or assertions surface before being baked into 48 test cases. Matches /tdd, which the author explicitly loaded.
- Lost: The spec's §13 next-actions list is more work to rewrite. Nothing material.
**Status:** CHALLENGED
**Suggested resolution:** Reopen §13 Next Actions. Present as a tracer-bullet sequence, not a horizontal enumeration. Same final state, different order of operations.

---

### [M] Finding 9: A2 assumption ("diffLines is O(n·m)") is factually wrong — Myers is O(N·D)

**Category:** FACTUAL (decision-implicating)
**Source:** DC3 (the risk that motivates scale tiers at all is mis-specified)
**Location:** SPEC.md §12 A2, §14 Risk row 3; `node_modules/diff/README.md` (Myers 1986)
**Issue:** A2: "`diffLines` performance is O(n·m) but acceptable at 10K lines." The `diff` library's README cites `An O(ND) Difference Algorithm (Myers, 1986)` — it's O(N·D) where D is edit distance, not O(n·m). For near-identical content (small delta between old and new XmlFragment md, which is the common case after the gap 2 fix), D is small and the algorithm is near-linear. For content with big deltas, D grows — but the `applyUserDelta` pre-processing already trims overlap (observers.ts:146-184), so the effective D is small.

This matters because §14 Risk 3 ("diffLines O(n·m) would force a diff strategy change at large-realistic") is derived from the wrong complexity class. A more accurate statement: "diffLines is O(N·D), near-linear when the user delta is small. The concern is pathological cases where the delta is a full rewrite (O(N²) worst case)." The stress test should specifically target the pathological delta case, which is distinct from "big content."

**Current design:** A2: "O(n·m) but acceptable" — a conservative and wrong statement.
**Alternative:** Correct A2 to "O(N·D) — near-linear for typical user deltas, pathological worst case when delta is a full rewrite. Stress should verify typical-delta scaling at large-realistic." This also informs S2 scenario design: the "concurrent typing" case is a small delta on big content, which is the near-linear path. The dangerous path is "agent rewrites the entire 10K-line file" — S1's happy case, not S2.
**Trade-off:**
- Gained: Correct mental model of what could break. S1 becomes the perf-risk scenario, not S2 (because S1 replaces the entire content, maximizing D).
- Lost: Nothing — this is a correction, not a scope change.
**Status:** CHALLENGED (factual, decision-implicating)
**Suggested resolution:** Correct A2 and §14 Risk 3. Verify during iterate whether large-delta S1 is the real perf risk, not S2.

---

## Low Severity

### [L] Finding 10: Adversarial tier value is unclear — probe-only failures don't gate, and S1/S2 at 50K don't exercise novel paths

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §9 adversarial row, D5, Q8 resolution
**Issue:** The adversarial tier runs S1 (single agent write) + S2 (concurrent typing) at 50K lines but failures don't gate (D5, FR7). The user journey (§5 P1 step 4) says "If the adversarial tier reports failures: these are informational (probe-only, per D5), not blockers." So what's the failure signal FOR? If a developer sees adversarial failures in their PR's stress log, they either: (a) investigate and fix (in which case, why isn't it gating?), (b) ignore it (in which case, why run it?). There's no clear "what do I do with a probe failure" answer.

One defensible answer: adversarial results are **historical data** that build an empirical scaling baseline (M3 — "wall-clock runtime"). Another: adversarial is a canary for the next spec ("if this ever starts failing on main, something regressed"). Neither is explicit in the spec.

**Current design:** D5: "Adversarial failures are informational." FR7: "Failures do NOT fail the suite exit code."
**Alternative:** Either (a) drop adversarial entirely and document that 10K is the realistic upper bound, or (b) keep it and explicitly label the consumer: "adversarial results belong in a baseline log committed to the repo; when a developer sees a change, they investigate even though CI doesn't gate."
**Trade-off:**
- Gained: Clarity on what the probe is for. Drop it if the answer is "nothing."
- Lost: The "show me the limits" goal (D2) loses its teeth. But the spec can address that by adding "M4: empirical scaling limit as observed in adversarial tier."
**Status:** CHALLENGED
**Suggested resolution:** Either drop adversarial tier (simplification — removes 2 probe cases + special FR7 logic) or define its actual consumer explicitly in §7 metrics.

---

### [L] Finding 11: captureTimeout: 0 divergence is acknowledged but not tested, and the stress matrix won't surface the risk

**Category:** DESIGN
**Source:** DC2 (stakeholder: future maintainer at streaming-agent time)
**Location:** SPEC.md §8 "captureTimeout divergence" note, §15 Noted "Agent streaming writes"
**Issue:** §8 says the code diverges from a prior spec (Q11: "use default 500ms" vs actual code: `0ms`) and "Documented in code comment; revisit when streaming agent writes land." The stress suite does nothing to test the implication — what if a future test relies on burst-grouping (multiple transactions coalesced into one undo entry)? The current scenarios all assume 1 agent write = 1 transaction, which is consistent with `captureTimeout: 0` but gives no signal about what happens when that assumption breaks.

This is future-work territory (NG3 / streaming), so it's legitimately out of scope for THIS spec. But it's worth flagging: the stress suite's fixture structure (each S3 undo step = 1 agent write) bakes in the 0ms assumption without surfacing it in the scenario design. When streaming lands, the stress suite will need a distinct scenario, not a modification.

**Current design:** captureTimeout divergence noted in §8; future work in §15 Noted; no stress scenario tests burst grouping.
**Alternative:** Add a §12 assumption (A7): "Stress scenarios assume 1 agent write = 1 undo entry (matching `captureTimeout: 0`). When streaming agent writes land, a new scenario exercising multi-transaction grouping must be added." Makes the coupling explicit.
**Trade-off:**
- Gained: Future reader understands the scenario matrix is coupled to the current captureTimeout value.
- Lost: Nothing.
**Status:** CHALLENGED
**Suggested resolution:** Add A7 to §12 Assumptions. Cheap clarity.

---

### [L] Finding 12: Fuzz scale ladder (10/50/200/500) has no evidence grounding compared to Yjs's own ladder (5/30/40/50/70/90/300)

**Category:** DESIGN
**Source:** DC1
**Location:** SPEC.md §9 Layer D "Fuzz scale ladder"
**Issue:** Yjs's y-text tests run `applyRandomTests` at 5/30/40/50/70/90/300 (verified at `yjs/tests/y-text.tests.js:1996-2051`). The spec uses 10/50/200/500 without citing why these numbers differ. Evidence says "non-linear jumps — rare interleavings need long runs to surface" — but 10/50/200/500 is more jumpy than Yjs's actual ladder, and Yjs's ladder is tuned for its own mutator set. Our mutator set is different (single-doc, different ops), so the interleaving density at iteration N is different. The scale numbers were chosen without grounding.

**Current design:** "10 / 50 / 200 / 500 iterations"
**Alternative:** Either (a) match Yjs's pattern directly (same numbers as the tuned reference), or (b) start with just `50` and `200` and grow the ladder only if profile data shows specific interleavings emerging at different iteration counts.
**Trade-off:**
- Gained: Fewer scale points until there's evidence they add signal. Cheaper to implement.
- Lost: Less "ladder" for a design that may or may not need one.
**Status:** CHALLENGED
**Suggested resolution:** Start with 50/200 only. Expand ladder if profiling shows bugs surfacing at specific iteration counts. Note this only matters if Finding 2 (fuzz harness framing) is resolved in favor of keeping Layer D.

---

## Confirmed Design Choices (summary)

The following decisions held up under challenge and are not surfaced as findings:

**DC1 (simpler alternative):**
- **D4 two-tier pass criteria** (bugs/crashes + strict convergence) — correct and minimal given the bug class we're targeting.
- **D7 synthetic generator + real fixture** — both artifacts serve distinct purposes (reproducibility + parser-quirk coverage) and are cheap.
- **D9 API-layer reads via real HocuspocusProvider** — rejection of test-only endpoint is well-grounded in the "exercise the real sync chain" invariant. The rationale explicitly names the failure mode a test endpoint would mask.
- **D3 Layer C Playwright kept** — Playwright catches a distinct class (ProseMirror reconciliation, React re-renders, DOM sync) that Layer A/B structurally can't reach. Rejection of "skip Playwright" holds.

**DC2 (stakeholder gaps):**
- **P3 Incident investigator journey** — the "reproduce bug reports locally" use case is explicit and the `--tier`/`--scenario` flags (FR11) support it even as Could-have.
- **Cleanup between scenarios (Q12)** — `afterEach` with observer cleanup + Y.Doc destroy is mechanically sufficient.
- **`/api/test-reset` isolation (Q5)** — verified by code read (evidence/test-reset-isolation.md). The `'test-doc'` single-name constraint is acknowledged as a scope boundary (multi-doc is NG3).

**DC3 (framing validity):**
- **SCR framing** (situation: presence+awareness shipped with 100+ tests at small content; complication: batch rewrites at production scale + gap 2 pattern suggests more latent bugs; resolution: stress suite) — holds. The gap 2 bug is concrete evidence the complication is real, and §8 traces the bug surfaces precisely.
- **P1 primary persona** (CRDT-layer developer running before PR) — grounded in the existing culture (no CI gating), which the spec honestly acknowledges.
- **NG6 NEVER: "Fuzzing the CRDT itself"** — the "black-box Yjs through product API" boundary is correct and well-defended. Fuzzing Yjs internals is not our job.

**Items that bypassed full challenge (noted, not surfaced as findings):**
- The `bun test:stress` runner integration (FR6) vs folding into `test` is a profile-driven reversible decision (D6/D8), so no challenge lens applies until the data exists.
- The observer timings (50ms/300ms) holding provisionally (D11) is explicitly a "verify via the suite itself" loop — self-correcting by design.

---

## Meta: patterns across findings

Several findings (1, 2, 3, 4) share a common thread: the spec imports **vocabulary and patterns from the Yjs ecosystem** (S7 mergeUpdates, Layer D applyRandomTests, fuzz scale ladder, scale-tier language) without re-grounding them in our specific bug surface. The evidence file `yjs-stress-patterns.md` does the mechanical survey but the spec translates it too literally — Yjs patterns were designed for a multi-user network-simulated CRDT harness, and we have a single-doc bidirectional bridge. The analogies work at the level of "seeded PRNG is good" but break at the level of "what bugs does this specific mechanism catch."

The author should re-read each Yjs-inspired decision with the question: "In the original Yjs setting, what concrete bug would this catch, and does that bug class exist in our single-doc bridge setting?" If yes, keep. If no, rename to reflect what it actually does in our setting, or defer to multi-client stress (NG3) where the original semantics apply.

This is the single most important meta-finding. Findings 1, 2, 4 are each specific instances. Finding 3 (D14 false dichotomy) is a separate pattern about over-applying a /tdd principle without working the design through.
