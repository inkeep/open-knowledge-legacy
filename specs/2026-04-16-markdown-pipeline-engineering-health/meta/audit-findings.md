# Audit Findings

**Artifact:** `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md`
**Audit date:** 2026-04-16
**Auditor mode:** headless (/audit)
**Baseline commit verified:** `2de299b` (matches spec)
**Total findings:** 15 (3 high, 6 medium, 6 low)

---

## High Severity

### [H] Finding 1: Requirement count mismatches the table — spec says "19 P0 requirements" but §6 table has 20 rows

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L5 (summary coherence)
**Location:** §1 Resolution (line 30), §6 Functional header (line 91), §14 In Scope (line 350), §3 NG1 wording, MH-D14
**Issue:** The spec asserts "19 P0 functional requirements" in multiple places, but the §6 Requirements table enumerates 20 distinct requirement rows: R1, R2, R3a, R3b, R4, R5a, R5b, R6, R7, R8, R9, R13, R14, R15, R16, R17, R18, R19, R20, R23. §1's Resolution bullets also enumerate 20 items (7 Measure + 6 Fix + 5 Tighten + 2 Restructure). §14's "R1-R9, R13-R20, R23" range notation would arithmetically give 9 + 8 + 1 = 18 if R-letters collapse, or 20 if R3a/R3b and R5a/R5b each count as 2. No arithmetic interpretation yields exactly 19.
**Current text:**
- §1: "19 P0 functional requirements"
- §6: "Functional (19 P0 requirements)"
- §14: "See §6 requirements (R1-R9, R13-R20, R23) — 19 P0 functional items"
- MH-D14: "Scope expanded 17 → 19 requirements"
- Changelog: narrative of +4 adds + 1 split from 17 → 19 (doesn't reconcile with R3a/R3b pre-existing as 2 rows)
**Evidence:** Manual row-count of §6 table (20 rows); enumeration of §1 Resolution bullets (20 items); ordering graph §6.5 shows all 20 items as distinct nodes (R3a, R3b, R5a, R5b all appear as separate nodes).
**Status:** INCOHERENT
**Suggested resolution:** Pick a single convention and apply it uniformly. Either (a) declare R3a+R3b and R5a+R5b each count as sub-items of R3 and R5 respectively, then state "19 requirements (20 deliverables)"; or (b) accept the count as 20 and update every occurrence of "19 P0 requirements" (§1, §6 header, §14, MH-D14, changelog arithmetic). The scope expansion narrative in the changelog also needs to reconcile: if starting from 17 and adding R18/R19/R20/R23 (+4) + splitting R5 (+1) = 22, not 19, unless R3a/R3b were already split in the "17" baseline (in which case the original count was 18, not 17, or R3a/R3b collapse in both counts).

---

### [H] Finding 2: "Parse pipeline runs `unist-util-visit` 5 separate times" is factually wrong — only 3 of 5 passes use it

**Category:** FACTUAL
**Source:** T1 (own codebase verification)
**Location:** §1 Complication, item 4 (line 26)
**Issue:** The SPEC claims the parse pipeline runs `unist-util-visit` 5 separate times and cites "the library README explicitly warns against this pattern" as motivation for R17. Verification against source code shows only 3 of the 5 post-parse passes actually invoke `unist-util-visit`:
- Pass 1 (`restoreFromMdx`) — uses `visit` (autolink-void-html-guard.ts:272) ✓
- Pass 2 (`autolinkPromotionPlugin`) — uses `visit` (autolink-promotion.ts:39) ✓
- Pass 3 (`docStartThematicFixPlugin`) — does NOT use `visit` (doc-start-thematic-fix.ts — operates only on `tree.children[0]`)
- Pass 4 (`positionSlicePlugin`) — uses `visit` (position-slice.ts:57) ✓
- Pass 5 (`unknownMdastGuardPlugin`) — does NOT use `visit`; uses a custom `walk()` function (unknown-mdast-guard.ts:134+)

The evidence file `pipeline-refactor-audit.md` correctly describes this as "5 passes" without attributing all to `unist-util-visit`. The motivating "library README warns against this pattern" framing only applies to the 3 passes that do use `visit`.
**Current text:** "The parse pipeline runs `unist-util-visit` 5 separate times per document — the library README explicitly warns against this pattern."
**Evidence:** Direct source reads at autolink-void-html-guard.ts:16 (import visit), autolink-promotion.ts:24 (import visit), position-slice.ts (import visit) — 3 imports of unist-util-visit. `grep -l "unist-util-visit"` in `packages/core/src/markdown/` confirms 3 consumer files only (plus mdast-augmentation.ts which is types-only, and test files).
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) rephrase as "5 separate tree traversals" (accurate; the heterogeneity of traversal mechanisms — visit + root-child check + custom walk — is itself an architectural smell and arguably strengthens R17's case), or (b) narrow to "3 separate `unist-util-visit` passes plus 2 ad-hoc traversals." The "library README warns against" citation should be either dropped or tied to the 3 `visit` passes specifically. The 2-phase target in R17 still holds — the merged Phase B would dispatch all 4 post-restoration passes regardless of their current traversal mechanism.

---

### [H] Finding 3: "76% of 10K-block parse time" in §1 is not sourced in any evidence file

**Category:** FACTUAL
**Source:** L7 (inline source attribution), T1 (codebase verification)
**Location:** §1 Complication, item 1 (line 20)
**Issue:** The spec states "Profiling shows the dominant super-linear term is in `remarkParse` (micromark core, upstream code we don't own) — 76% of 10K-block parse time." The "76%" is a load-bearing quantitative claim that justifies classifying remarkParse super-linearity as Future Work (upstream) rather than in-scope. However, searching the evidence directory finds no file substantiating this number. The only perf evidence file is `perf-baseline-measured.md`, which reports end-to-end parse timings but no per-stage breakdown. R3b's deliverable is literally "`evidence/perf-profile.md` contains: per-stage timing table, slope analysis, super-linear terms identified" — meaning this evidence does not yet exist; it is a future artifact. FW-E1 also cites a concrete slope number ("1.54 at 10K→20K blocks") that is not in any committed evidence file.
**Current text:**
- §1 line 20: "76% of 10K-block parse time"
- §15 FW-E1: "profiling shows `remarkParse` slope 1.54 at 10K→20K blocks (super-linear)"
**Evidence:** `ls specs/.../evidence/` shows: commonmark-corpus-gaps.md, ng-coverage-audit.md, ng-pinned-canonicals.md, perf-baseline-measured.md, pipeline-refactor-audit.md, r6-failure-modes.md. No perf-profile.md or equivalent stage-breakdown file. `perf-baseline-measured.md` contains end-to-end measurements only (header "Measured via `/assess-findings` P0-10 investigation subagent" — possibly the source of the 76% figure, but the file itself doesn't include it).
**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) commit a per-stage profile evidence file now (the R3b deliverable) and cite from it, or (b) rephrase §1 to make the un-sourced nature explicit: "early profiling indicates remarkParse dominates; R3b will publish the precise breakdown," and drop the specific "76%" number until R3b lands. Same for FW-E1's "slope 1.54" — move to R3b and cite the evidence file once it exists, or mark as an investigation artifact pending commit. As-is, a reader verifying the spec cold has no way to corroborate the number, and the load-bearing "can't commit to 50% improvement in code we don't own" argument (MH-D4) rests on it.

---

## Medium Severity

### [M] Finding 4: §1 claims "no conflicting files" with tolerant parsing; §13 acknowledges pipeline.ts conflict

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §1 Resolution last paragraph (line 39) vs §13 Risks (last row of risk table)
**Issue:** §1 states categorically: "All work is independent of the tolerant-parsing merge (different subdirectories, no conflicting files). Delivers production value whether or not the Rust port ever ships." But §13's risk table explicitly enumerates a conflict on `pipeline.ts`: "Tolerant parsing touches `pipeline.ts:26-27` (removes `remarkDirective`) and `parse-with-fallback.ts`. This spec touches `pipeline.ts:createParseProcessor` function + adds merged walker. Merge mechanical." The risk is tagged Low/Low but is a concrete file conflict, contradicting "no conflicting files."
**Current text:**
- §1: "different subdirectories, no conflicting files"
- §13: "Tolerant parsing touches `pipeline.ts:26-27` ... This spec touches `pipeline.ts:createParseProcessor`"
**Evidence:** Both texts are in the same spec; directly contradict each other on whether pipeline.ts is a shared file. The sister spec `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md` is referenced at §1 line 8 as a "parallel workstream."
**Status:** INCOHERENT
**Suggested resolution:** Rephrase §1 to match §13's more accurate framing: "shares `pipeline.ts` with tolerant parsing but touches disjoint regions — merge resolution is mechanical (§13)." Keeping the "independent / no conflicts" claim invites a reader to believe the work can proceed with zero coordination, which §13 explicitly contradicts.

---

### [M] Finding 5: "Current warm run is ~2.5 min cold (CLAUDE.md)" misattributes — CLAUDE.md says `bun run check` is 20-30s warm

**Category:** FACTUAL
**Source:** T1 (codebase verification)
**Location:** R9 acceptance criteria (line 105) and MH-D22 (line 304)
**Issue:** R9's AC states "Tier budgets set at 2× measured p95 of current warm run (currently ~2.5min cold) with 1.5× headroom." MH-D22 cites CLAUDE.md: "Current warm run is ~2.5 min cold (CLAUDE.md); aspirational '<5 min tier 1' is below the measured baseline." This is inconsistent on two fronts:
1. "Warm run (currently ~2.5 min cold)" mixes warm and cold — they are not the same measurement.
2. CLAUDE.md does not state "~2.5 min cold." CLAUDE.md's actual numbers are: `bun run check` is "~20-30s warm" and `bun run check:full:parallel` is "~2 min warm" (plus "warm replay when nothing changed is <50ms").
**Current text:**
- R9: "current warm run (currently ~2.5min cold)"
- MH-D22: "Current warm run is ~2.5 min cold (CLAUDE.md)"
- CLAUDE.md (per project instructions): "~20-30s warm" for `bun run check`, "~2 min warm" for full suite
**Evidence:** CLAUDE.md contents (embedded in this audit's system reminder; also present on disk): "`bun run check` ... — lint + typecheck + unit + integration + fidelity (~20-30s warm)" and "`bun run check:full:parallel` ... (turbo parallel, ~2 min warm)".
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) cite the correct CLAUDE.md number (~20-30s warm for `bun run check`, or ~2 min warm for the full suite) and use it as the tier-1 vs tier-2 budget anchor; or (b) commit an actual cold-run measurement as evidence and re-attribute away from CLAUDE.md. As-is the budget calibration hangs on a number that doesn't exist in the cited source.

---

### [M] Finding 6: §7 success metrics don't cover R3a, R3b, R4, R8, R9 explicitly

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction: requirements vs. metrics), L5 (summary coherence)
**Location:** §7 Success metrics M1-M11 (lines 166-177)
**Issue:** §7 lists M1-M11 as success metrics. Mapping each metric to its governing requirements:
- M1 → R1, R2
- M2 → umbrella check-green
- M3 → R5a, R5b, R6
- M4 → R7, R13
- M5 → R14
- M6 → R15
- M7 → R16
- M8 → R17, R20
- M9 → R18 (+ consumers)
- M10 → R19
- M11 → R23

No metric explicitly asserts success on: R3a (profile harness committed), R3b (profile findings published), R4 (perf regression gate firing correctly on calibrated thresholds), R8 (fixture externalization complete), R9 (CI tier structure lives in turbo.json + workflows). R3a/R3b's absence is especially notable because R4 depends on them per §6.5 ordering ("R2 + R3a (profile) → R4"), and R4 is the load-bearing regression gate. A reviewer following §7 top-down cannot confirm these requirements have an observable success signal.
**Current text:** §7 enumerates M1-M11; no Mx directly says "R3a harness committed," "R4 gate fires on synthetic regression," "R8 fixtures in canonical location with no residual fixture strings in test files," "R9 tiers wired up in turbo.json."
**Evidence:** Direct reading of §7.
**Status:** INCOHERENT
**Suggested resolution:** Add explicit metrics:
- M12: R3a harness committed + R3b profile report published with per-stage breakdown.
- M13: R4 regression gate live in tier-2 with calibrated threshold; synthetic-regression test proves the gate fires.
- M14: R8 fixtures in single canonical location; `rg` for fixture strings in test files returns zero matches outside loader helpers.
- M15: R9 tier definitions live in `turbo.json` + workflow YAML with budget comments matching measured baselines.
Or alternatively: accept that M2 ("`bun run check` green across all 19 requirements") is the umbrella for the otherwise-unlisted items, and explicitly state so in M2's text.

---

### [M] Finding 7: Invariant-count inconsistency — §1 says "11 fidelity invariants"; §8 says "I1-I10 (I11 pending)"; CLAUDE.md documents only 7

**Category:** COHERENCE / FACTUAL
**Source:** L1 (cross-section consistency), T1 (codebase)
**Location:** §1 Situation (line 16), §8 Test architecture state (line 208), CLAUDE.md §Storage-layer fidelity contract
**Issue:** Three different invariant counts appear across the artifact + repo:
- §1: "11 fidelity invariants (I1-I11 — I11 pending tolerant parsing merge)"
- §8: "Invariants I1-I10 (I11 pending tolerant parsing)"
- CLAUDE.md: "Seven fidelity invariants" (I1-I7 listed with specific definitions)

The test files in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts` support the I1-I10 figure (10 files exist on disk). I11 is pending per both §1 and §8. So the accurate in-tree count is 10 active + 1 pending = 11 total planned. But CLAUDE.md's "Seven fidelity invariants" is stale-on-disk (CLAUDE.md lists I1-I7 as the canonical set while the codebase has I1-I10). Readers consulting CLAUDE.md for ground truth will find a different number than the spec.
**Current text:**
- §1: "11 fidelity invariants (I1-I11 — I11 pending tolerant parsing merge)"
- §8: "Invariants I1-I10 (I11 pending tolerant parsing)"
**Evidence:** `ls packages/app/tests/fidelity/invariant-i*.test.ts` shows I1-I10 files exist; read of I8/I9/I10 confirms they are real (crash resistance, guard completeness, structural crash resistance). CLAUDE.md (§Storage-layer fidelity contract) enumerates exactly 7 invariants (I1 Identity through I7 Cross-path consistency).
**Status:** INCOHERENT (across sections); STALE (CLAUDE.md lag)
**Suggested resolution:** Either (a) make §1 and §8 agree (both say "I1-I10 active, I11 pending"); or (b) note CLAUDE.md is stale and needs an update to enumerate I8-I10 alongside I1-I7 so external readers don't trip on the mismatch. This is not fatal to the spec's conclusions but undermines L7 inline attribution — a careful reader cross-checking against CLAUDE.md will hit a dead end.

---

### [M] Finding 8: R17 "2-phase" claim is more defensible than the spec's separate wording in §9 — dispatcher ordering is load-bearing but §9 doesn't foreground it

**Category:** CLARITY / COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §9 Proposed solution R17 block (lines 238-262) vs R17 AC (line 110) vs `evidence/pipeline-refactor-audit.md` §R17
**Issue:** The R17 row in the §6 table correctly says "2-phase dispatcher" with internal ordering "pass-4-before-pass-5 for `.data.sourceRaw` dependency." §9's Phase B pseudo-code lists the four calls in order (autolinkPromotion → docStartThematicFix → positionSlice → unknownMdastGuard) and states "The dispatcher order within the Phase B callback is load-bearing (positionSlice → unknownMdastGuard)." However, the phrasing "is load-bearing" appears only once and without the full dependency enumeration from the evidence file. The evidence file (`pipeline-refactor-audit.md` §R17) lists each pass's dependencies explicitly: pass 2 depends on pass 1 (PUA restoration), pass 4 must run after 2/3 (to see restructured tree), pass 5 depends on pass 4 (.data.sourceRaw). The spec compresses this to a single "pass-4-before-pass-5" rule, which is correct but understates the other ordering constraints (pass-2-before-pass-4 is implied but not stated; pass-3-ordering is not discussed).
**Current text:** §9 R17: "The dispatcher order within the Phase B callback is load-bearing (positionSlice → unknownMdastGuard)."
**Evidence:** `evidence/pipeline-refactor-audit.md` lines 54-88 enumerate each pass's ordering constraints in detail; the spec condenses this to one dependency.
**Status:** INCOHERENT (partial — spec is not wrong, but R20 diff-gate is the full guarantee, not the single dispatcher ordering rule spelled out in §9)
**Suggested resolution:** Strengthen §9 R17's ordering discussion to enumerate all three ordering constraints (pass 2 needs post-restoration tree [Phase-A gate]; pass 4 must see post-splice structure; pass 5 needs pass-4 data) with a direct pointer to `evidence/pipeline-refactor-audit.md`. This matters because R20 is the diff-gate, but a spec reader implementing R17 needs the mental model before writing the dispatcher, not after it fails the gate.

---

### [M] Finding 9: J1 user journey cites "~350ms" for 2,350-block transcript, but measured baseline at 2.5K blocks is 213.7ms

**Category:** FACTUAL / CLARITY
**Source:** L4 (evidence-synthesis fidelity), T1 (codebase)
**Location:** §5 J1 user journey (line 81)
**Issue:** J1 states: "User pastes 5,400-line YouTube transcript (~2,350 blocks). Current parse measured at ~350ms." The measured baseline in `evidence/perf-baseline-measured.md` puts 2,500 blocks at 213.7ms. Linear interpolation for 2,350 blocks would yield ≈200ms, not 350ms. The number "~350ms" appears without citation. One plausible explanation is that a real transcript (denser paragraphs, fewer headings) parses slower than the synthetic heading+paragraph corpus; another is that the 350ms number is from earlier benchmark runs that used different methodology. As stated, the claim doesn't reconcile with committed evidence.
**Current text:** "User pastes 5,400-line YouTube transcript (~2,350 blocks). Current parse measured at ~350ms."
**Evidence:** `evidence/perf-baseline-measured.md` table: 2,500 blocks = 213.7ms at 2de299b.
**Status:** UNVERIFIABLE / partially CONTRADICTED
**Suggested resolution:** Either cite the source of 350ms (a different measurement with documented corpus/methodology) or reconcile with the committed baseline (e.g., "≈200ms per measured baseline; real-transcript content density may raise this to the 300-400ms range — confirmed post-R1"). Don't leave an un-sourced number in a user journey that the greenfield directive forbids in evidence-backed sections.

---

## Low Severity

### [L] Finding 10: R23 claims "11 tests exist" — actual count is 12

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** R23 AC (line 114)
**Issue:** R23 states: "Currently 11 tests exist with zero perf coverage and only one non-parametric depth test." Direct count of test files shows 12 `test(...)` invocations in `packages/core/src/markdown/parse-with-fallback.test.ts`.
**Current text:** "Currently 11 tests exist with zero perf coverage and only one non-parametric depth test."
**Evidence:** `grep -n "^  test" packages/core/src/markdown/parse-with-fallback.test.ts` returns 12 matches (lines 12, 22, 34, 42, 52, 67, 79, 88, 95, 125, 140, 152).
**Status:** CONTRADICTED (off-by-one)
**Suggested resolution:** Update to "12 tests." The substantive claim (zero perf coverage, one non-parametric depth test) is accurate — the depth test is at line 52 ("MAX_SPLIT_DEPTH exceeded falls to whole-doc fallback"). Only the count is off.

---

### [L] Finding 11: "4-9% idempotence failure rates" characterization broader than evidence

**Category:** FACTUAL
**Source:** L4 (evidence fidelity)
**Location:** §1 Complication (line 22), G4 (line 48)
**Issue:** §1 and G4 describe the 6 partial-idempotence sections as "4-9% idempotence failure rates." Evidence file `commonmark-corpus-gaps.md` lists the actual pass rates: 91.7% (Backslash, 8.3% fail), 95.5% (Images, 4.5% fail), 96.2% (Emphasis + Lists, 3.8% fail), 97.7% (HTML blocks, 2.3% fail), 98.9% (Links, 1.1% fail). Actual failure range is 1.1%-8.3%. The spec's "4-9%" compresses the high end accurately (8.3% ≈ 9%) but overstates the low end (1.1% is below 4%).
**Current text:** "6 sections have 4-9% idempotence failure rates hiding specific bugs"
**Evidence:** `commonmark-corpus-gaps.md` table (lines 44-51) has all 6 pass rates.
**Status:** CONTRADICTED (imprecise)
**Suggested resolution:** Replace with "1-9% idempotence failure rates" or "1.1% to 8.3% failure rates" (matches evidence). Does not affect scope — the 6 sections are still in-scope for R6 regardless of exact failure rate.

---

### [L] Finding 12: M1 says "R2 baseline captured at all 5 block counts" — R2 covers 7 block counts

**Category:** FACTUAL / COHERENCE
**Source:** L1 (cross-section consistency)
**Location:** §7 M1 (line 167) vs R1 AC (line 95) vs R2 AC (line 96)
**Issue:** R1 measures at 100/1K/5K/10K/20K blocks (5 counts). R2 requires baselines at 100/500/1K/2.5K/5K/10K/20K blocks (7 counts — note the bolded **20K** emphasis in R2's text). M1 states "R2 baseline captured at all 5 block counts including 20K," which matches R1's set, not R2's. The §8 current-state table also shows 7 rows (100/500/1K/2.5K/5K/10K/20K), matching R2 not R1.
**Current text:** "M1: R1 benchmark harness committed, passing in tier-2, consuming R18 corpus. R2 baseline captured at all 5 block counts including 20K."
**Evidence:** R1 text "100/1K/5K/10K/20K" (5 counts); R2 text "100/500/1K/2.5K/5K/10K/**20K**" (7 counts); §8 baseline table has 7 rows.
**Status:** INCOHERENT
**Suggested resolution:** Clarify M1: "R1 benchmark harness committed at 5 block counts (100/1K/5K/10K/20K); R2 baseline captured at 7 block counts (adds 500/2.5K for smoothed curve)." Or: align R1 and R2 to the same set and update M1.

---

### [L] Finding 13: M9 says R3a consumes from `fixtures/perf/` but §6.5 ordering graph doesn't show this edge

**Category:** COHERENCE
**Source:** L1 (cross-section consistency)
**Location:** §7 M9 (line 175) vs §6.5 ordering graph (lines 130-155)
**Issue:** M9 asserts "R18 corpus committed; R1/R2/R3a/R4 all consume from fixtures/perf/." The §6.5 ordering graph shows `R18 → R1 → R2` and `R2 + R3a → R4`, but no edge from R18 to R3a. R3a's AC text says "Runs at 100/1K/5K/10K/20K blocks" but doesn't explicitly say "consumes R18 corpus" — it says the harness is committed to `evidence/perf-profile-harness.ts`, not to `packages/core/tests/perf/`. Whether R3a uses R18's pinned corpus or generates its own is left ambiguous.
**Current text:**
- R3a AC: "Diagnostic harness committed to `evidence/perf-profile-harness.ts` (reproducible; not promoted to `packages/core/tests/`). Runs at 100/1K/5K/10K/20K blocks with per-stage timing."
- M9: "R18 corpus committed; R1/R2/R3a/R4 all consume from fixtures/perf/."
- §6.5 graph: no R18 → R3a edge.
**Evidence:** Direct reading of spec sections.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add the R18 → R3a dependency to §6.5's graph and state in R3a's AC "consumes R18 corpus from `fixtures/perf/`"; or (b) reword M9 to drop R3a from the consumer list. The former keeps the three perf measurements (R1, R2, R3a) comparable; the latter accepts that R3a is a one-shot diagnostic with its own corpus.

---

### [L] Finding 14: SPEC §1 claims pipeline is "~2,200 LOC" — actual non-test LOC is ~2,925

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §1 Situation (line 16)
**Issue:** §1 describes the pipeline as "`packages/core/src/markdown/`, ~2,200 LOC." Measuring non-test TypeScript LOC in that directory yields 2,925 lines (via `find ... -not -name "*.test.ts" | xargs wc -l`). The "~2,200" number is about 25% below the current reality — likely a pre-tolerant-parsing number before recent handler additions and the unknown-mdast-guard.
**Current text:** "packages/core/src/markdown/`, ~2,200 LOC"
**Evidence:** `find packages/core/src/markdown -name "*.ts" -not -name "*.test.ts" | xargs wc -l` = 2,925 total.
**Status:** STALE
**Suggested resolution:** Update to "~2,900 LOC" or "~3,000 LOC." Not scope-impacting; just precision.

---

### [L] Finding 15: Spec cross-reference to sister-spec location is inconsistent — one mention says the sister is in `.claude/worktrees/markdown-source-text-fidelity/`, no cross-validation

**Category:** CLARITY / FACTUAL
**Source:** L1 (cross-section consistency)
**Location:** §1 Related (line 7), §Non-functional Sister-spec coordination (line 122), §13 Risks (last row)
**Issue:** §1's Related link points to `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md`. The Non-functional section says this "lives in `.claude/worktrees/markdown-source-text-fidelity/`." The current worktree is `.claude/worktrees/markdown-pipeline-engineering-health`, and neither the spec nor the changelog confirms that `markdown-source-text-fidelity/` actually contains the Rust sister spec — a reader cannot verify the cross-worktree path without leaving the current worktree. If that worktree has moved / been renamed / been merged back, the instruction "submit as follow-up PR to sister branch" is ambiguous.
**Current text:**
- §Non-functional: "Update `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` (lives in `.claude/worktrees/markdown-source-text-fidelity/`)"
**Evidence:** This audit runs inside `markdown-pipeline-engineering-health/` worktree; the sister worktree is referenced but not validated within this audit.
**Status:** UNVERIFIABLE (from inside current worktree)
**Suggested resolution:** Either include the branch name (not just worktree path) for the sister spec — branch is durable, worktree path is ephemeral — or explicitly note "worktree path may change; canonical reference is branch `<name>`." This is a minor hygiene issue, not a correctness blocker.

---

## Confirmed Claims (summary)

Load-bearing technical claims that checked out on direct code verification:

**R17 two-phase claim (spec §6, §9, MH-D17) — CONFIRMED.** Pass 2 (`autolinkPromotionPlugin` at `autolink-promotion.ts:30`) matches the regex `/<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]+)>/g` on text values, which requires literal `<` and `>`. Pass 1 (`restoreFromMdx` at `autolink-void-html-guard.ts:270-290`) restores those characters from PUA sentinels `\uE000`/`\uE001` via `restoreString` (lines 296-297). Verified that Pass 1 must complete on all nodes before Pass 2 runs, so a single same-node visitor cannot absorb both — the 2-phase framing is technically required.

**R16 two-plugin claim (spec R16, MH-D16) — CONFIRMED.** Both `remarkMdxAgnostic` (`remark-mdx-agnostic.ts:25`, pushes `mdx()` to `data().micromarkExtensions`) and `remarkWikiLink` (`wiki-link-micromark.ts:239`, pushes `wikiLinkSyntax()` to same array) mutate the shared `data().micromarkExtensions` state. Idempotency refactor for both is load-bearing. `pipeline.ts:110-133` shows `createParseProcessor()` re-uses these plugins per-parse; caching the processor is the R16 fix.

**R7 NG11 correction (spec R7, MH-D20) — CONFIRMED.** `evidence/ng-pinned-canonicals.md` documents that `---\n\n---` parses as two `thematicBreak` nodes (renderable), so `ensureNonEmptyDoc` does NOT fire on that input. The accurate NG11 trigger is yaml-alone (`---\ntitle: X\n---\n` → `""`). `pipeline.ts:77-90` (`ensureNonEmptyDoc`) confirms the ignore-set is `{yaml, toml, footnoteDefinition}` — thematicBreak isn't in it. Spec's corrected example is semantically accurate.

**R5b stale-reference locations — CONFIRMED.** All 7 cited references exist at the exact line numbers claimed: `corpus-commonmark.test.ts:48,63`, `p0-entity-escape.test.ts:4,7,93`, `packages/core/src/markdown/index.ts:5`, `packages/app/src/server/agent-flow.test.ts:11`. (Caveat: line 93 of p0-entity-escape.test.ts reads "replaces old @tiptap/markdown pin" — a historical-context mention; cleanup may want to preserve that context rather than delete the line outright.)

**Commit SHAs — CONFIRMED.** Baseline `2de299b` matches current HEAD of `spec/markdown-pipeline-engineering-health` branch. PR #83 squash commit `ee030b5` title matches: "feat: markdown engine migration — marked + @tiptap/markdown → unified + remark + remark-prosemirror (#83)".

**Pipeline topology (§8) — CONFIRMED.** 12 stages match `createParseProcessor` in `pipeline.ts:110-133` plus the raw `remarkParse` entry.

**Perf baseline table (§8) — CONFIRMED.** Numbers in §8 (9.5ms/73.6ms/213.7ms/493.9ms/1,265.3ms/3,593.8ms at 100/1K/2.5K/5K/10K/20K) match `evidence/perf-baseline-measured.md` exactly.

**R5a section counts — CONFIRMED.** 19 NORMALIZE sections in `corpus-commonmark.test.ts:24-44`; 13 listed as "fully idempotent, ready to promote" matches evidence's 13/19 finding; remaining 6 (Emphasis, Backslash, Lists, HTML blocks, Links, Images) match exactly.

**`parseSafe` removal — CONFIRMED.** `packages/core/src/markdown/index.ts:125-126` comment documents the removal: "Supersedes the prior `parseSafe` API (removed as a redundant alias — one name per function, per greenfield precedent)."

**I3 `markdownDoc` arbitrary issue (spec MH-D6, R13) — CONFIRMED.** `packages/app/tests/fidelity/arbitraries.ts:287-289` shows `.map((blocks) => blocks.join('\n\n'))` — always exactly two newlines between blocks, so multi-blank-line inputs never reach I3.

**R15 O(n²) pattern (spec §9, R15) — CONFIRMED.** `autolink-void-html-guard.ts:194` shows `if (rest.includes(closeTag))` inside a `.replace(/</g, ...)` callback — per-`<` O(m) substring search yields O(n·m) worst case on documents with many unclosed `<` characters.

---

## Unverifiable Claims

- **§1 "76% of 10K-block parse time" and FW-E1 "slope 1.54 at 10K→20K blocks"** — no evidence file currently substantiates; R3b's deliverable (`evidence/perf-profile.md`) doesn't exist yet. (See Finding 3.)
- **§5 J1 "~350ms" for 2,350-block transcript** — measured baseline interpolation yields ~200ms; real-transcript measurement not committed. (See Finding 9.)
- **Sister-spec worktree path `.claude/worktrees/markdown-source-text-fidelity/`** — cannot verify from inside the current worktree without leaving it. (See Finding 15.)
- **"Industry-recommended pattern" / "Docusaurus #4978 anti-pattern"** (MH-D9) — external citation not spot-checked in this audit; plausible but not verified against Docusaurus issue tracker.
- **Turbo.json CI tier wiring for R9** — R9 AC says "three tiers defined in `turbo.json` + workflow files" — not verified that the current `turbo.json` lacks such structure or that one exists. Out of scope for this audit (R9 is a forward-looking requirement, not a claim about current state).
