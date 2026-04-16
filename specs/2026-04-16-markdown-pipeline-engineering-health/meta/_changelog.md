# Changelog — markdown-pipeline-engineering-health

## 2026-04-16 — Spec scaffolded

- Baseline commit: `2de299b` (post-merge of PR #161 lossless bridge merge, squashed to main as `3491f03`)
- Intake confirmed: Option B (full engineering-health scope)
- Sequencing confirmed: parallel with tolerant-parsing spec
- Worktree: `.claude/worktrees/markdown-pipeline-engineering-health` on branch `spec/markdown-pipeline-engineering-health`
- Related research cherry-picked: `reports/collaborative-editor-timing-best-practices/` (commit da12105 from prior branch)
- Prior investigation captured via /assess-findings (see conversation with Tier 1 deep-dive subagents):
  - Measured perf baseline: 12.8ms / 104.6ms / 590.2ms / 1486.2ms at 100/1K/5K/10K blocks
  - CommonMark corpus: 13/19 NORMALIZE sections actually idempotent; 6 sections with 4-9% failure rates
  - NG coverage: NG5/6/9/10 pinned; NG1 and NG11 unpinned
  - PR #83 squash commit: `ee030b5` (not 95 commits ago, 88)

## 2026-04-16 — Scope expansion (18 → 20 requirements) + ordering + corrections

Applied "strictly more correct per evidence" filter after adversarial completeness review (conversation with user + 2 Explore subagents + code probes).

**Added (4 new, evidence-backed):**
- **R18** — Synthetic benchmark corpus specification. Without pinned block-type mix, R1/R2/R4 measurements aren't comparable run-over-run.
- **R19** — Parse-health regression gate (`parseFallback.wholeDoc === 0` + `blockLevel` tolerance). Catches silent degrade-not-crash regressions from R16/R17 that R4 (latency-only) would miss.
- **R20** — Byte-for-byte mdast diff gate for R17's merged-walker landing. The only safe correctness proof for ordering-sensitive merge.
- **R23** — `parseWithFallback` perf + `MAX_SPLIT_DEPTH` boundary coverage. Closes a concrete gap (11 tests exist, 0 perf tests, only 1 non-parametric depth test; O(2^20) worst case unprobed).

**Split:**
- **R5** → **R5a** (CommonMark corpus tightening + lower `KNOWN_CRASH_CEILING` to 0) + **R5b** (@tiptap/markdown cleanup — 7 refs across 4 files). Different risk profiles.

**Declined (considered, not evidence-backed):**
- R21 (type hardening at interstage boundaries) — stays as FW-N1 with existing trigger. Interstage boundaries are internal function composition, not cross-boundary contracts.
- R24 (`parseSafe` coverage) — moot; `parseSafe` was already removed as a redundant alias per greenfield precedent (see `packages/core/src/markdown/index.ts:126-127`).
- R25 (PBT for remaining transformers) — moved to FW-N2. Existing example-based coverage is thorough; PBT would be test-count inflation without marginal bug capture.

**Downgraded:**
- R22 (memory baseline) → rolled into R16's post-fix validation. Code audit confirmed ~5 MarkdownManager instance sites in production (not multi-hundred). Per-instance heap measurement right-sized as R16 validation step, not a separate requirement.

**Reclassified (moved from R-item to §Non-functional):**
- R10 (all existing tests pass) → precondition.
- R11 (update sister Rust spec numbers) → sister-spec coordination Should (cross-worktree; sister spec lives in `.claude/worktrees/markdown-source-text-fidelity/`).
- R12 (mergeThreeWay/applyFastDiff unaffected) → blast-radius boundary declaration.

**Corrections:**
- **R16** expanded — audit found TWO plugins mutate `data().micromarkExtensions`, not one. Both `remarkMdxAgnostic` (`remark-mdx-agnostic.ts:25`) and `remarkWikiLink` (`wiki-link-micromark.ts:239`) need the check-before-push idempotency refactor. Spec's prior single-plugin framing was incomplete.
- **R17** corrected from "merge 5 into 1" to 2-phase visitor — Pass 1 (`restoreFromMdx`) must complete PUA-sentinel restoration before Pass 2 (`autolinkPromotionPlugin`) runs its regex. A single same-node visitor cannot satisfy this ordering. Net is still 2 phases (down from current 5); significant win preserved.
- **R7** NG11 example corrected — `---\n\n---` parses as two `thematicBreak` nodes (renderable), not as ignore-typed nodes. `ensureNonEmptyDoc` does NOT fire on that input; the canonical output (`***\n\n---\n`) reflects NG10's doc-start normalization, which is already pinned by 3 existing tests. Real NG11 trigger is yaml-alone: `---\ntitle: X\n---\n` → `""` (empty paragraph synthesized, serializes empty).
- **R4** threshold reframed as calibration-first (`max(2× p99 variance, 10% absolute floor)`) rather than pre-committed 20%. Gate lands AFTER variance measurement.
- **R9** tier budgets calibrated against measured baselines (current ~2.5 min cold) rather than aspirational.
- **R15** extended from "fix the one O(n²) pattern" to "audit all regex passes in R23 guard; fix every super-linear pattern."

**Added (§6.5):** Explicit requirement-ordering graph with dependencies (R18 → R1 → R2 → R4, R8 → R7/R13/R14/R18, R6 → R5a/R14, R15 → R16 → R17 → R20).

**New evidence files:**
- `evidence/r6-failure-modes.md` — root causes for all 6 R6 bugs (3 newly characterized via direct probe).
- `evidence/ng-pinned-canonicals.md` — NG1 + NG11 canonicals observed via direct probe; corrects prior NG11 example misclassification.
- `evidence/pipeline-refactor-audit.md` — plugin idempotency matrix (R16) + visitor-pass ordering constraints (R17).
- `evidence/perf-baseline-measured.md` — extended with 20K-block row (3,593.8ms measured at 2de299b).

**New Decision Log entries:** MH-D14 through MH-D22 — capture every scope/framing decision with its evidence anchor.

**Re-baseline required** once R1 lands with final methodology (warm-up, GC, Bun pin, hardware class documented).

## 2026-04-16 — Audit pass corrections

Nested-Claude `/audit` on the rewritten SPEC.md surfaced 15 findings (3 HIGH / 6 MEDIUM / 6 LOW). All legitimate; all addressed. Report committed to `meta/audit-findings.md`.

**HIGH (3 addressed):**
- **H1 — requirement count:** prior draft said "19 P0 requirements" but §6 table has 20 rows. Reconciled arithmetic: baseline had 18 rows (R3a/R3b counted separately), +4 new (R18/R19/R20/R23), +1 split (R5 → R5a/R5b), -3 reclassified (R10/R11/R12 → Non-functional) = **20**. Updated §1, §6 header, §14, MH-D14, and §7 M2 to say "20."
- **H2 — visit() claim:** "runs unist-util-visit 5 separate times" was factually wrong. Only 3 of 5 passes use `visit` (restoreFromMdx, autolinkPromotion, positionSlice); docStartThematicFix inspects `tree.children[0]`, unknownMdastGuard uses a custom `walk`. Rephrased §1 as "5 separate post-parse tree traversals" with explicit mechanism breakdown.
- **H3 — un-sourced perf numbers:** "76% of 10K-block parse time" (§1) and "slope 1.54 at 10K→20K" (FW-E1) weren't in any committed evidence file. Reworded to "early profiling indicates remarkParse dominates; precise attribution is R3b's deliverable" — de-commits to specific numbers until R3b publishes `evidence/perf-profile.md`.

**MEDIUM (6 addressed):**
- **M4:** §1's "no conflicting files" contradicted §13's acknowledged `pipeline.ts` conflict with tolerant parsing. Reworded §1 to say "shares `pipeline.ts` but touches disjoint regions — merge mechanical per §13."
- **M5:** "~2.5 min cold" misattributed to CLAUDE.md. CLAUDE.md actually says `bun run check` ~20-30s warm, `bun run check:full:parallel` ~2 min warm. R9 AC + MH-D22 updated to cite correct numbers.
- **M6:** §7 metrics didn't cover R3a/R3b/R4/R8/R9. Added M12-M15; made M2 explicitly the umbrella for items without specific observables.
- **M7:** invariant count inconsistent (§1 said 11, §8 said I1-I10+pending, CLAUDE.md says 7). Reconciled to "10 active (I1-I10), I11 pending, 11 total planned"; noted CLAUDE.md staleness as docs-update follow-up (not this spec's scope).
- **M8:** §9 R17 pseudo-code understated ordering constraints. Expanded to enumerate all three (Pass 2 → Phase A restoration; pass 4 → post-splice visibility; pass 5 → pass-4 data) with evidence-file pointer.
- **M9:** J1's "~350ms" for 2,350-block transcript contradicted measured baseline (~200ms interpolated at 2.5K). Reworded to cite baseline and explain the denser-prose variance; real-transcript number pinned post-R1.

**LOW (6 addressed):**
- **L10:** R23 "11 tests" → "12 tests."
- **L11:** "4-9% failure rates" → "1.1-8.3%" (matches evidence).
- **L12:** M1 clarified R1 covers 5 block counts, R2 covers 7.
- **L13:** Added R18 → R3a ordering edge in §6.5 graph; R3a AC explicitly states "consumes R18 corpus."
- **L14:** "~2,200 LOC" → "~2,900 LOC" (actual).
- **L15:** Sister-spec reference now uses branch name (durable) rather than worktree path alone.

**Confirmed on audit:** R17 2-phase claim (autolink-promotion.ts:30 + autolink-void-html-guard.ts:296-297); R16 two-plugin finding (remark-mdx-agnostic.ts:25 + wiki-link-micromark.ts:239); R7 NG11 correction; R5b 7 reference locations; baseline commit `2de299b`; PR #83 commit `ee030b5`; perf baseline table; R5a section counts; parseSafe removal; I3 arbitrary gap at arbitraries.ts:287-289; R15 O(n²) pattern at autolink-void-html-guard.ts:194.

