# Changelog

Append-only log of substantive changes to the spec.

---

## 2026-04-08 — Spec scaffolded

**Session context:** User asked to `/spec` a stress testing effort after finishing PR #7 merge and fixing the gap 2 Observer A race condition.

**Created:**
- `SPEC.md` — initial scaffold with 8 locked decisions from intake (D1-D8)
- `evidence/` — directory for spec-local findings
- `meta/_changelog.md` — this file

**Baseline commit:** `9380859` — codebase state at scaffold. Overwrites at finalization.

**Locked decisions from intake:**
- D1: Primary goal = correctness, not performance benchmarking
- D2: Graded scale across 4 tiers (small/medium/large-realistic + adversarial)
- D3: Three test layers — observer unit + API script + one Playwright E2E
- D4: Pass = no bugs/crashes + strict convergence
- D5: Adversarial tier = probe, not gate
- D6: Start stress in separate file; profile; fold if fast enough
- D7: Synthetic generator + checked-in real fixture
- D8: `bun test:stress` initially; profile; fold if fast enough

**Open questions carrying forward:** Q1-Q12 — see SPEC.md §11.

**Prior art from recent work (informs this spec):**
- Gap 2 bug: `applyUserDelta` had `diffLines` alignment artifact with unterminated final lines. Fixed in current worktree.
- Observer A baseline staleness: `lastSyncedXmlMd` wasn't updated after Observer B propagated external content. Fixed in current worktree.
- captureTimeout: 0 divergence from spec Q11 ("use default 500ms"). Documented in code comment.

---

## 2026-04-08 — Iterate phase, P0 open questions resolved

**All 12 P0 open questions resolved.** Four via user confirmation (Q1→D9, Q4→D10, Q9→D11, scope choices), eight autonomously (Q2, Q3, Q5, Q6, Q7, Q8, Q10, Q11, Q12).

**New decisions captured (D9-D14):**
- D9: API-level stress uses real HocuspocusProvider client (not test-only endpoint), per user "closest to real chain"
- D10: Playwright E2E is multi-turn (not smoke test), per user "multi-turn stuff"
- D11: Current observer timings hold provisionally; adjust empirically
- D12: Add S7 `Y.mergeUpdates` round-trip scenario (from yjs stress survey)
- D13: Two-tier convergence assertion (bridge invariant + serialization round-trip)
- D14: Synthetic generator includes Unicode variety (emoji, CJK, combining marks)

**Evidence files written:**
- `evidence/mdmanager-determinism.md` — verified serialize is deterministic but strips trailing newlines
- `evidence/test-reset-isolation.md` — verified `/api/test-reset` is thorough for stress scenarios using 'test-doc'
- `evidence/yjs-stress-patterns.md` — landscape of CRDT stress testing in yjs ecosystem (from /worldmodel subagent)

**Key worldmodel findings that shaped the spec:**
1. Yjs + all bindings use `applyRandomTests` + `TestConnector` + `compare()` pattern with seeded PRNG
2. `toString()` equality alone is insufficient — Yjs tests state vectors, delete sets, struct stores, and `mergeUpdates` round-trip
3. `applyUserDelta` IS the bug surface (not Yjs itself) — concentrate scenario variety there
4. BlockSuite's "trust Yjs" approach is a cautionary tale — bugs live in the glue code
5. No major JS CRDT project uses fast-check — rolling custom harnesses is the norm

**Scope decisions (informed by worldmodel):**
- **NOT adding to scope:** randomized fuzz harness (Yjs-style `applyRandomTests`) — deferred to Future Work.Explored. The deterministic tier-based suite is more targeted for the known bug classes; randomized fuzz is the follow-up after the baseline.
- **NOT adding to scope:** fast-check model-based testing for the bridge — deferred to Future Work.Explored. Worth considering once randomized fuzz catches hard-to-minimize failures.
- **ADDED to scope:** S7 mergeUpdates round-trip, two-tier convergence assertion, Unicode variety in generator.

**Spec is feature-complete for Iterate phase.** Ready for Audit (Phase 6).

---

## 2026-04-08 — Iterate phase follow-up: scope expanded after user pushback

User reviewed the worldmodel findings and pushed back on two of my recommendations:

**Scope promotion — randomized fuzz harness → In Scope (D15, D16, FR4a)**
- User: "reliably is key. lets add. is this standard practice?"
- Answer: Yes, standard practice in the Yjs ecosystem. Sources: `~/.claude/oss-repos/yjs/tests/testHelper.js` (`applyRandomTests`, `TestConnector`, `compare`), y-prosemirror and y-codemirror.next both import from it.
- Added: new Layer D, new file `observers.fuzz.test.ts`, seeded PRNG + mutator arrays + scheduler + scale ladder (10/50/200/500 iterations).
- Failure attribution mechanics (D16): per-op logging always on, error message includes replay command, env-var replay mode (`STRESS_FUZZ_SEED`, `STRESS_FUZZ_MAX_ITER`), on-failure Y.Doc snapshot dump to `tmp/fuzz-failure-*.ydoc`, manual bisect via `STRESS_FUZZ_MAX_ITER` binary search.

**Recommendation flipped — Unicode handling (D14, FR4b, S8)**
- User pushback: "how will we know when it fails? what's the value of spreading vs specific?"
- I loaded `/tdd` skill for guidance. /tdd's principle: "tests should describe WHAT failed, not be forensic puzzles."
- Old D14: "Synthetic generator includes Unicode variety spread across all scenarios."
- New D14: "Synthetic generator is ASCII-only by default. Unicode handled via a **dedicated** S8 scenario."
- Rationale: Spreading Unicode across all scenarios destroys failure attribution. If a concurrent-typing test fails with Unicode content, you can't tell if the typing logic or Unicode normalization broke. Dedicated S8 isolates: S1-S5 pass + S8 fails → Unicode bug; both fail → structural.
- Added: S8 (Unicode-heavy content propagation) at all 3 realistic tiers. FR4b.

**Final scope totals:**
- 16 locked decisions (D1-D16)
- 11 functional requirements (FR1-FR11, including FR4a fuzz + FR4b unicode)
- 8 core scenarios (S1-S8)
- 4 test layers (A observer unit, B API, C Playwright E2E, D fuzz)
- Total test cases: ~48 (23 Layer A + 21 Layer B + 1 Layer C + 4 Layer D scale points)
- Evidence files: 3 (mdmanager-determinism, test-reset-isolation, yjs-stress-patterns)
- Future Work.Explored: 2 items remaining (fast-check model-based testing, performance benchmarking)

---

## 2026-04-08 — Audit + design challenge complete (27 findings resolved)

**Parallel subprocesses dispatched:**
- `/audit` (cold reader, factual/coherence) — 16 findings (5 high, 7 medium, 4 low) → `meta/audit-findings.md`
- Design challenger (rejection validity) — 12 findings (5 high, 4 medium, 3 low) → `meta/design-challenge.md`

**Merged: 27 unique findings** (H1 + Challenger #5 describe the same issue).

**Applied via /assess-findings + /analyze (ultrathink on 5 escalations):**

### Auto-applied corrections (18)

| ID | Fix |
|---|---|
| H2 | `fetch('/api/test-reset')` → `{method: 'POST'}` |
| H4 | FR2 test count updated (was "4×4=16", now references §9 matrix) |
| H5 | D3 implications amended: "Four files" + supersession note pointing to D15 |
| M1 | D13 scope corrected — "every test case runs both assertions" is Layer A only, NOT Layer D (which uses primary only) |
| M2 | **Critical:** test-reset race with Hocuspocus debouncer verified (`Hocuspocus.ts:545-552`). New D18 adds force-flush patch to `/api/test-reset` handler. Evidence file corrected. |
| M3 | Q2 timeout caveats added (adversarial may exceed given Myers O(N·D) worst case) |
| M4 | `mdManager.serialize` "strips trailing newlines" framing corrected to "current extension set convention, not a guarantee." Evidence file updated. |
| M5 | File placement fixed — stress files move to `tests/stress/` (not `src/editor/` or `tests/e2e/`). `package.json` scripts updated with ignore patterns. |
| M6 | S4 renamed (dropped "gap 2 at scale" subtitle — conflated two bugs). New S4b (D19) explicitly exercises the unterminated-final-line code path. FR5a added: generator must produce no-trailing-newline variant. |
| M7 | D9 amended with Bun/Node-22+ runtime caveat + `WebSocketPolyfill` fallback |
| L1 | Playwright test count corrected (23 → 24) |
| L2 | `tmp/ship/qa-progress.json` reference clarified as ephemeral/gitignored |
| L3 | Layer C sequence now includes `page.waitForFunction(() => window.__hocuspocusProvider)` guard |
| L4 | §9 Layer A documents that local `Y.UndoManager` instances mirror (but aren't) the server-side UndoManager |
| C2 | D15 framing corrected — Layer D is "local mutator-ordering loop," NOT the Yjs `applyRandomTests` pattern |
| C8 | D22 added: implementation follows /tdd tracer-bullet order; §13 Next Actions documents build sequence |
| C9 | A2 corrected from "O(n·m)" to Myers "O(N·D), worst-case approaches O(N²) on interleaved inputs" |
| C11 | captureTimeout: 0 explicit assertion noted in S1/S3 behavior |

### Escalated items resolved (5, via /analyze ultrathink pass)

Three of five initial recommendations **changed meaningfully** under deeper analysis:

| ID | Initial | After analyze | Resolution |
|---|---|---|---|
| **H1** | Stock APIs | Stock APIs + `waitForFunction` (refined) | Layer C rewritten using `page.waitForFunction` with specific state conditions — more deterministic than `waitForDOMStabilization` heuristic polling. Reference implementation committed to §9. Pattern validated against `sync.spec.ts:343-347`. |
| **H3** | Fresh provider + setupObservers per scenario | **Option E: reframe Layer B entirely** | Layer B drops bridge-invariant assertions. New scope: HTTP contract + server-side UndoManager testing. Reads Y.Text only. Shrinks from 21 → 12 test cases. D9 amended. |
| **C1** | Drop S7 | **Reframe as S9 (D17)** | Reading `TiptapEditor.tsx:71-87` revealed `setupObservers` runs AFTER sync (on the `synced` event) — i.e., on a pre-populated doc. That production path is currently untested. S9 exercises it: encode state → apply to fresh doc → setupObservers → additional ops → assert bridge invariant. 1-2 test cases, Layer A medium tier only. |
| **C4** | Layer D fuzz only | **Add S5b high-throughput variant (D20)** | Current S5 (N=5 at 100ms) is barely rapid. S5b: N=100 writes at ~1ms intervals, small content only. Tests observer backpressure + `lastSyncedXmlMd` race at mutation-count scale. Deterministic regression cover complements Layer D fuzz. |
| **C10** | Define consumer | **Baseline comparison (D21, FR5b)** | Adversarial tier captures `adversarial-baseline.json` on first run, compares and reports deltas on subsequent runs. Gives the tier a concrete regression-tracking job instead of informational noise. CLAUDE.md documents run-before-CRDT-layer-changes protocol. |

### Declined (2)

| ID | Finding | Reason |
|---|---|---|
| C7 | "D1 correctness/perf split is artificial" | FR8 is wall-clock timing for D6/D8 integration decision, not SLA measurement. The split is real — benchmarking has different tooling (p50/p95/p99, baseline, SLA targets) we're not building. |
| C12 | "Fuzz ladder 10/50/200/500 doesn't match Yjs's tuned ladder" | Our ops are heavier than Yjs's tiny inserts. Copying would be cargo-culting. Defensible on own merits. |

### New decisions (D17-D22)

- **D17** Add S9 (observer init on applyUpdate-restored doc) — tests production reconnect path
- **D18** `/api/test-reset` force-flush patch (M2 race condition fix) — pre-req to Layer B/C
- **D19** Add S4b (gap 2 unterminated-final-line regression) — M6 fix
- **D20** Add S5b (high-throughput burst, N=100 @ 1ms) — C4 mutation-axis coverage
- **D21** Adversarial baseline comparison — C10 consumer-gap fix
- **D22** /tdd tracer-bullet implementation order — C8 methodology fix

### Superseded decisions

- **D12** (Add S7 mergeUpdates round-trip) — superseded by D17 after C1 analysis proved the single-doc round-trip is a Yjs invariant

### Revised scope totals

- **22 locked decisions** (D1-D22, with D12 marked superseded)
- **13 functional requirements** (FR1-FR11 + FR5a fixture variant + FR5b baseline + FR4a fuzz + FR4b Unicode variants)
- **10 core scenarios** (S1-S9 + S4b + S5b; S7 removed)
- **4 test layers** (A, B (reframed), C (rewritten), D (framing corrected))
- **Total test cases: ~48** (34 Layer A + 12 Layer B + 1 Layer C + 4 Layer D scale points)
- **Evidence files: 3** (all corrected per audit)
- **Spec contradictions resolved** (H4, H5, M1, M5)
- **Runtime correctness pre-req (D18)** identified that was missing from the original spec

Spec is now audit-resolved and ready for finalization after main drift check.



