# Audit Findings — Followup Pass

**Artifact:** /Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/REPORT.md
**Audit date:** 2026-04-19
**Scope:** Step-6 fanout followup content only — Exec Summary #12/13/14, new Rubric row V, §I.6 (bun-runner vs vitest economics), §IV.8 (coverage-guided fuzzing), Themes E and F, new Conflicts & Disagreements items, new evidence files `stryker-bun-vs-vitest-economics.md` and `micromark-fuzzing-target.md`. The original 9-finding audit (resolved 2026-04-19) is not re-evaluated here.
**Total findings:** 6 (0 High, 4 Medium, 2 Low)

**Coverage summary (followup):**
- Reader pass + claim extraction on Exec #12-14, §I.6, §IV.8, Themes E-F, Conflicts.
- Coherence lenses L1, L2, L4, L5, L6, L7 applied to new content; L3 light pass.
- Factual track T4 applied: Sentry blog (60→25 min), npm registry (4 packages: @jazzer.js/core, stryker-mutator-bun-runner, mdast-util-arbitrary), GitHub (jazzer.js#343, oss-fuzz#11652, fast-check#3399, menoncello/stryker-mutator-bun-runner releases), micromark/package.json raw read, ClusterFuzzLite docs, IJON paper benchmarks (web search), Zest paper (ar5iv).
- Stance check: hard pass on prescriptive language across §I.6, §IV.8, Themes E/F, Conflicts.
- Triangulation check: perTest contradiction confirmed in Exec #13 + §I.6 + Conflicts.
- Path-leakage check: zero `fanout/`, `2026-04-19-initial`, `sub-report`, `fork-session`, or `consolidat*` references in REPORT.md or new evidence files (the two `consolidated/consolidate` matches in REPORT.md are normal English usage, not workflow leakage).

---

## High Severity

*(none)*

The new content holds up to direct factual verification on the load-bearing datapoints — Sentry 60→25 min on a single Core SDK package (verified), Jazzer.js v4.0.0 release date 2026-04-15 (verified to the second via npm registry `time["4.0.0"]`), stryker-mutator-bun-runner npm download counts (4,390 monthly / 2,615 weekly — verified exactly), 0 GitHub Releases (verified), Bun#26191 close date 2026-01-21 (re-confirmed), Jazzer.js#343 open since 2023-02-23 (verified), micromark/package.json fuzz comment (verified verbatim), Zest 1.1×–1.6× syntactic AFL advantage + 10 syntactic bugs (3 Maven + 6 BCEL + 1 Rhino) (verified), IJON >20× maze speedup + 10/22 CGC crashes (verified), ClusterFuzzLite JS-not-supported (verified), fast-check#3399 open from 2022-11-10 (verified). The perTest contradiction is properly triangulated across Exec #13, §I.6, and the Conflicts section.

---

## Medium Severity

### [M] Finding 1: `mdast-util-arbitrary` "~40 weekly downloads" is 5× the live npm-registry value, and the source is not disclosed inline

**Category:** FACTUAL
**Source:** T4 (npm registry direct fetch) + L7 (inline source attribution)
**Location:** §IV.8 (line 778) "grammar-aware structured mutation" paragraph; cross-referenced in evidence/micromark-fuzzing-target.md (line 146)
**Issue:** REPORT.md states `mdast-util-arbitrary` has "~40 weekly downloads — low community investment." The npm registry returns **8 downloads** for the week of 2026-04-12 to 2026-04-18 (audit query date). The evidence file discloses the source as the unifiedjs.com listing — which does indeed show "40" — but REPORT.md itself does not name the source, so a reader cross-checking against npm finds a 5× mismatch with no way to reconcile.

**Current text (REPORT.md §IV.8):**
> "`mdast-util-arbitrary` is a fast-check *generator* (not a mutator), authored by an individual contributor outside the syntax-tree org, with ~40 weekly downloads — low community investment."

**Evidence:**
- `curl https://api.npmjs.org/downloads/point/last-week/mdast-util-arbitrary` → `{"downloads":8,"start":"2026-04-12","end":"2026-04-18"}`
- `curl https://www.unifiedjs.com/explore/package/mdast-util-arbitrary/` → "40" weekly downloads displayed (likely a longer-term average or stale snapshot)

**Status:** PARTIAL CONTRADICTION — the figure is faithful to its undisclosed source but contradicts the live primary data source most readers would consult.
**Suggested resolution:** Either (a) annotate inline as "~40 weekly downloads per unifiedjs.com listing (npm registry shows 8/week as of 2026-04-19)", (b) replace with the npm-registry value with disclosed query date, or (c) drop the specific number and characterize qualitatively ("fewer than 50 weekly downloads"). The qualitative conclusion ("low community investment") is unchanged either way.

---

### [M] Finding 2: New §I.6 corrections to perTest framing are not propagated back to §I.1 and §I.3 prose

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:** §I.1 line 102 (Tradeoffs), §I.1 line 106 (Applicability callout), §I.3 line 146 (Native lever #1), §I.3 line 177 (Tradeoffs); contradicted/refined by §I.6 line 264 + Exec #12 line 64
**Issue:** Exec #12 explicitly notes the parent finding "is refined rather than replaced" and the Conflicts section line 893 says perTest delivers "a measured 1.7–2.5× speedup (corrected in §I.6, down from the parent's initial 'largest multiplier' framing)" — but §I.1 and §I.3 still carry the un-refined original prose:

- §I.1 line 102: "Migrating to vitest or jest runners with `coverageAnalysis: 'perTest'` offers an **order-of-magnitude speedup**"
- §I.1 line 106: "`coverageAnalysis: 'perTest'`, **the largest runtime multiplier** (see I.3), is unavailable without a runner migration"
- §I.3 line 146: "**Largest single runtime multiplier** when supported by the runner"
- §I.3 line 177: "the **single largest lever** is gone"

A reader who stops in §I.1 or §I.3 will believe perTest is *the* dominant lever; the new §I.6 explicitly walks this back ("The amplifier is not `perTest` per se — it is switching to `@stryker-mutator/vitest-runner`...").

**Note on baseline:** Some of the apparent contradiction may be a baseline mismatch — §I.1's "order-of-magnitude" probably implicitly compared `perTest` vs *full-suite-per-mutant* (the command runner), not vs `coverageAnalysis: "all"` (which still tracks coverage but runs everything). The Stryker docs' "40–60%" figure is `perTest` vs `all`. So strictly, §I.1 and §I.6 cite *different* baselines, and Exec #12's characterization of §I.3 as "casual" mildly understates §I.3's intent. But the surface prose is genuinely inconsistent.

**Status:** INCOHERENT (mild) — refinement is acknowledged in two places but original prose is unchanged.
**Suggested resolution:** Either (a) add an inline "(see §I.6 for refinement)" pointer at each of the four locations, (b) edit the original prose to "largest single runtime multiplier among native config levers" and add "see §I.6 for runner-swap envelope vs perTest-alone breakdown", or (c) add a brief baseline-clarification footnote in §I.6 noting that "order-of-magnitude" applies vs full-suite-per-mutant while "1.7–2.5×" applies vs `coverageAnalysis: "all"`.

---

### [M] Finding 3: Sentry "60 → 25 min" datapoint scope is unqualified in §I.3 vs explicitly "single package" in new §I.6 + Exec #12

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** §I.3 line 177 (Tradeoffs); §I.5 line 236; corrected by Exec #12 line 64 + §I.6 line 266
**Issue:** Exec #12 and §I.6 both explicitly qualify the Sentry datapoint as "60 min → 25 min (2.4×) **on a single package**" / "cut **one package's** run from 60 min → 25 min." §I.3 line 177 reads as if this applied uniformly: "Sentry's Jest→Vitest switch produced a 2.4× speedup on identical code." The Sentry blog itself ("As a further experiment, we switched from Jest to Vitest in the Core SDK package") confirms the new framing is the accurate one — single-package only, not whole-monorepo. The unqualified §I.3 prose risks readers extrapolating the 2.4× to multi-package campaigns.

**Current text (§I.3 line 177):**
> "Test runner choice dominates: Sentry's Jest→Vitest switch produced a 2.4× speedup on identical code."

**Evidence (verbatim from Sentry blog via WebFetch):**
> "As a further experiment, we switched from Jest to Vitest in the Core SDK package... it reduced the MT runtime from 60 minutes to now much more manageable 25 minutes."

Plus: full monorepo runs took "35-45 minutes" — that's the parallel-per-package figure already in §I.3 line 172. So Sentry has *two* relevant datapoints: single-package 60→25 (the 2.4× figure) and per-package-in-CI 20-25 (already in the table). The §I.3 prose conflates them.

**Status:** INCOHERENT (mild) — same source data, different per-section framing precision.
**Suggested resolution:** Edit §I.3 line 177 to "Sentry's Jest→Vitest switch produced a 2.4× speedup on a single TS SDK package (Core SDK; see §I.6 for the full Option-3-envelope breakdown)." The §I.5 line 236 "migrated Jest → Vitest for 2.4× speedup" has the same gap and should likewise specify "(Core SDK package only)."

---

### [M] Finding 4: References evidence-file list does not include the two new evidence files added in the followup

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** References §"Evidence Files" lines 942-969 (specifically Part I and Part IV blocks)
**Issue:** The References section enumerates evidence files by Part: Part I lists 5, Part IV lists 7. The followup added `stryker-bun-vs-vitest-economics.md` (cited inline at §I.6 line 312, belongs in Part I block) and `micromark-fuzzing-target.md` (cited inline at §IV.8 line 843, belongs in Part IV block). Neither is added to the References list. The inline citations exist and work, but a reader scanning the References for a complete file inventory will under-count by 2 (showing 21 files when the directory now holds 23).

The Rubric was updated to reflect Part V (FU1/FU2), but the References "Evidence Files" listing is by Part-numbered block (Part I, II, III, IV) and has no Part V block — so the new files are orphaned in the References organization.

**Current text (lines 942-947 — Part I block, complete):**
> **Part I — Mutation testing:**
> - [evidence/stryker-ts-integration.md](evidence/stryker-ts-integration.md) — Stryker-js + TS integration, bun compatibility, real adopter configs
> - [evidence/mutation-operators-parsers.md](evidence/mutation-operators-parsers.md) — Mutator categories, parser-domain signal ranking, equivalent-mutant patterns
> - [evidence/runtime-cost-strategies.md](evidence/runtime-cost-strategies.md) — Incremental mode, glob scoping, concurrency, Sentry wall-clock data, CI tier patterns
> - [evidence/stryker-fastcheck-interaction.md](evidence/stryker-fastcheck-interaction.md) — Mutant lifecycle, seed determinism, shrinking under mutation, Vitest #5714 bug
> - [evidence/adopter-examples.md](evidence/adopter-examples.md) — Ecosystem adoption (remark/markdown-it/Prettier/ProseMirror), Sentry SDK case study, Stryker maintenance signals

**Evidence:**
- `ls evidence/` shows 23 .md files; References lists 21.
- §I.6 line 312 cites `[evidence/stryker-bun-vs-vitest-economics.md]` — file exists, not in References.
- §IV.8 line 843 cites `[evidence/micromark-fuzzing-target.md]` — file exists, not in References.

**Status:** INCOHERENT (organizational gap, not factual)
**Suggested resolution:** Add the two new evidence files to the References. Either (a) extend the existing Part I and Part IV blocks, or (b) add a new "Part V — Followup" block matching the Rubric's row V structure. The latter is more faithful to the Rubric organization.

---

## Low Severity

### [L] Finding 5: Theme E conflates two distinct Böhme et al. ICSE 2023 metrics ("most bugs after 15 min" vs "branches saturate at 15 min")

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), L5 (summary coherence)
**Location:** Theme E line 877 — "cadence governs the time-to-bug-discovery curve (per Böhme et al. 2023 saturation dynamics — most bugs after 15min in a 23h campaign, §IV.8)"
**Issue:** §IV.8 (line 810) accurately splits the two Böhme findings: "Most branches covered in first 15 min of 23h campaigns; **most bugs found AFTER saturation** (94% coverage territory)." Theme E summarizes this as "most bugs after 15min in a 23h campaign" — which fuses the *15-min branch-saturation* result and the *late-campaign bug-discovery* result into a single phrase that reads as "most bugs are found after the 15-minute mark." That reading is technically true (since bugs are found late in campaigns) but elides the actually-interesting framing that §IV.8 captures: bug discovery decouples from coverage growth — bugs concentrate in the 90%→94% coverage zone, which by definition arrives long after the first 15 minutes.

**Current text (Theme E):**
> "...cadence governs the time-to-bug-discovery curve (per Böhme et al. 2023 saturation dynamics — most bugs after 15min in a 23h campaign, §IV.8)."

**Evidence (§IV.8 line 810 + evidence/micromark-fuzzing-target.md line 215):**
> "branch coverage saturates such that 'increasing the number of generated test inputs by one order of magnitude does not change coverage anymore.' 100% reachable coverage typically reached before 10^6 inputs. **Most branches covered in 23 hours are covered in the first 15 minutes.** However, **>50% of bugs are found in the last two-thirds of the campaign** when coverage has moved from ~90% to ~94%."

**Status:** INCOHERENT (mild) — Theme synthesis is less precise than §IV.8 source paragraph.
**Suggested resolution:** Edit Theme E to "...the time-to-bug-discovery curve (per Böhme et al. 2023 saturation dynamics — branch coverage saturates within ~15 min of a 23h campaign, but >50% of bugs are found in the last two-thirds, §IV.8)." Preserves the load-bearing point that bug discovery decouples from coverage saturation — which is exactly the implication Theme E is drawing for cadence decisions.

---

### [L] Finding 6: IJON ">20× speedup on maze and Super Mario benchmarks" — Super Mario evidence is qualitative, not a 20× ratio

**Category:** FACTUAL (mild imprecision)
**Source:** T4 (web verification of IJON paper)
**Location:** §IV.8 line 765
**Issue:** Report says IJON delivers ">20× speedup over plain AFL on **maze and Super Mario** benchmarks." Per the IJON paper / RUB-SysSec/ijon README / search-confirmed summaries, the 20× figure is specifically the **maze** benchmark ("AFL in combination with IJON is more than 20 times faster than AFL without IJON when solving maze problems"). The Super Mario result is qualitative — "AFL becomes quite capable to play Super Mario Bros when exposing a single variable (the player's x coordinate)" — not a quantified speedup ratio. The sentence currently reads as if both benchmarks produce the >20× number.

**Current text:**
> "The established solution in native fuzzing is [IJON](https://github.com/RUB-SysSec/ijon) (Aschermann et al., IEEE S&P 2020): user-placed C macros (`IJON_STATE`, `IJON_SET`, `IJON_INC`) XOR state values into AFL's coverage bitmap, **delivering >20× speedup over plain AFL on maze and Super Mario benchmarks**."

**Evidence (web search of IJON paper materials):**
- Maze: ">20× faster than AFL without IJON when solving maze problems"; "solved nearly all levels in a matter of minutes"; "all but 3 levels"
- Super Mario: "AFL becomes quite capable to play Super Mario Bros" (qualitative; no ratio)
- CGC: "produce crashes in 10 [of 22] targets" (already correctly stated in evidence file)

**Status:** PARTIAL CONTRADICTION (minor)
**Suggested resolution:** Either (a) restrict the ratio to maze: "delivering >20× speedup over plain AFL on maze benchmarks (and qualitative ability to play Super Mario)", or (b) drop the Super Mario reference: "delivering >20× speedup over plain AFL on the maze benchmark." Evidence file `micromark-fuzzing-target.md` line 105 has the same wording and could be updated in the same edit.

---

## Confirmed Claims (followup-pass summary)

**T4 (web/registry verification) — confirmed as stated:**
- Sentry 60 → 25 min on Core SDK package; mutation score 0.62; weekly cadence; `coverageAnalysis: "perTest"` + `ignoreStatic: true`; Jest→Vitest switch ✓ (direct WebFetch of Sentry engineering blog).
- `@jazzer.js/core@4.0.0` release date 2026-04-15 ✓ (npm registry `time["4.0.0"]: "2026-04-15T14:10:03.857Z"`); jumped from 2.1.0 (skipped 3.x).
- `@jazzer.js/core` weekly downloads 1,486 (week of 2026-04-12) ✓ (npm registry exact match).
- `stryker-mutator-bun-runner@0.4.0` latest, Apache-2.0, 4,390 monthly / 2,615 weekly downloads ✓ (npm registry exact match).
- `stryker-mutator-bun-runner` 0 GitHub Releases published ✓ (WebFetch of releases page).
- `oven-sh/bun#26191` closed 2026-01-21 ✓ (re-verified; original audit corrected from 2026-01-17).
- `Jazzer.js#343` (Vitest support) open since 2023-02-23 ✓ (WebFetch).
- `OSS-Fuzz#11652` opened 2024-02 with "discontinued as open source" claim about Jazzer.js ✓ (WebFetch; minor: actual quote uses misspelled "discountinued").
- `fast-check#3399` "Hypothesis-like test case database" opened 2022-11-10, still open 2026-04 ✓ (WebFetch). The dubzzz "accepted feature" comment of 2022-12-18 is plausibly real (WebFetch couldn't render comments) — flagged only as not-independently-confirmed, not as defective.
- `micromark/package.json` fuzz comment "fuzzer turned off for now as `jazzer` is unmaintained, with sec vulns" ✓ (raw fetch, exact match modulo backticks).
- ClusterFuzzLite supported languages: `c`, `c++`, `go`, `rust`, `python`, `jvm`, `swift` — JavaScript NOT in list ✓ (WebFetch of build-integration docs). The evidence file lists "Java" instead of "jvm" — minor terminological imprecision but the load-bearing claim (JS not supported) is correct.
- Zest paper: Zest covers 1.03×–2.81× more semantic-stage branches; AFL achieves 1.1×–1.6× higher syntactic coverage; AFL found 10 syntactic bugs Zest missed (3 Maven + 6 BCEL + 1 Rhino) ✓ (ar5iv WebFetch; matches REPORT and evidence file exactly).
- IJON: >20× speedup on maze; crashes 10 of 22 CGC targets ✓ (web search summary).
- Stryker docs "40–60% improvement" framing for `perTest` vs `all` ✓ (consistent with the cited Stryker config docs URL).

**Triangulation check (perTest contradiction):**
- Exec Summary #13 line 66: ✓ contradiction explicitly named, both positions cited.
- §I.6 line 272: ✓ "contradicting I.1's stated `coverageAnalysis: 'off'` framing (see Exec Summary #13)" — explicit cross-reference.
- Conflicts & Disagreements line 887: ✓ "the parent's initial Part I framing stated... the plugin author's upstream-adoption issue advertises... Both positions cannot simultaneously be true." Triangulated correctly.

**Stance check (no recommendation language in new sections):**
- §I.6: "Tradeoff matrix (layout, not ranking)" framing held; Break-even sketch is arithmetic + caveat, not advocacy.
- §IV.8: "Tradeoffs (layout, not ranking)" framing held; four options enumerated without ranking.
- Themes E and F: observational, not prescriptive.
- Conflicts: one soft procedural phrase — "a reader making a runner decision should read the plugin source before committing" — applies to *how to use the report*, not *which option to choose*; not flagged as a stance violation.

**Path-leakage check (REPORT.md + new evidence files):**
- Zero matches for `fanout`, `2026-04-19-initial`, `sub-report`, `fork-session`. The two `consolidat*` matches in REPORT.md (line 719 "consolidated, lift-and-shift-ready library"; line 859 "consolidated test-vector library") are normal English usage referring to the library deliverables, not workflow leakage.

**Evidence-file fidelity (spot-checks):**
- `evidence/stryker-bun-vs-vitest-economics.md`: numerical claims (4,390 monthly / 2,615 weekly downloads; 0 GitHub Releases; 60→25 min Sentry; 0.62 mutation score; PkgPulse 50×10 benchmark numbers; 0.5–3 person-day migration estimate; ~9-month break-even arithmetic) all match REPORT.md §I.6 exactly. Source URLs in the evidence file are intact and resolvable. Negative-search section is preserved.
- `evidence/micromark-fuzzing-target.md`: numerical claims (Jazzer.js v4.0.0 ship date, 1,486 weekly downloads, ~100–200 state functions across 22 constructs, 4 thematic-break states, ~13 code-fenced states, 2 attention states + resolveAll, Zest ratios, IJON 20×/10-of-22, Superion +16.7%/+8.8%, Böhme saturation phrasing, OSS-Fuzz 36%/5%/2.19%) all match REPORT.md §IV.8 exactly. Source URLs intact. Negative-searches section preserved.

**L1–L7 (coherence lenses) — broad result on followup content:**
- L1: One material cross-section coherence issue (Findings 2, 3 — perTest framing not propagated and Sentry-scope qualifier not propagated). One mild theme/source-section conflation (Finding 5 — Böhme metrics). One factual gloss (Finding 6 — IJON Super Mario). Triangulation of the perTest-contradiction is correct.
- L2: Confidence labels in evidence files (CONFIRMED / INFERRED / UNCERTAIN) are honest; REPORT prose generally matches them. Where inferences are flagged (Break-even sketch as "arithmetic from published numbers"; mutation effort as "0.5–3 person-day estimate"), the prose says so.
- L3: New version-pinned claims carry dates (Stryker 9.6.1 / 2026-04-10; Jazzer.js 4.0.0 / 2026-04-15; npm download stats "as of 2026-04-19"; bun#26191 closed 2026-01-21). No new conditionality gaps.
- L4: Evidence files are faithfully consolidated. mdast-util-arbitrary download number is the one defect (Finding 1).
- L5: Exec #12, #13, #14 each cleanly summarize their respective body sections. New Rubric row V matches §I.6 + §IV.8 actual content.
- L6: Stance "factual / landscape, no recommendations" held uniformly across new sections.
- L7: Most new content has strong inline attribution (Sentry blog URL; Stryker docs URL; npm package URL; GitHub issue/PR URLs; paper DOIs; ClusterFuzzLite docs URL). One inline-attribution gap: mdast-util-arbitrary "~40 weekly downloads" omits the unifiedjs.com source (Finding 1).

---

## Unverifiable Claims (followup pass)

- **fast-check#3399 dubzzz "accepted feature" comment of 2022-12-18:** evidence file quotes it verbatim; WebFetch of the issue page returned the issue body but not subsequent comments. The issue is verifiably open since 2022-11-10; the comment quote is plausible and well-attributed but not directly re-fetched. No defect indicated.
- **PkgPulse 2026 benchmark "Jest 1.2s / Vitest 0.9s / Bun 0.08s on 50 tests × 10 files":** cited inline in §I.6 line 273. Not re-fetched in this audit; the broader claim ("Bun test 3-10× faster than vitest on pure-logic TS") is attributed and within plausible range.
- **FuzzChick throughput cost numbers (16,500 vs 82,000 tests/sec, ~4-5× cost):** cited in evidence file `micromark-fuzzing-target.md`; REPORT prose only states the qualitative "~4-5× throughput cost." Plausible from paper abstract but not directly verified against the paper PDF.
- **Superion benchmark ratios (+16.7% line, +8.8% function, 34 vs 6 bugs in 3 months):** cited inline; not re-fetched. Consistent with my prior knowledge of the paper but not independently verified in this audit.
- **OSS-Fuzz large-scale study percentages (36% first-session, drop to 5% by session 26, 2.19% steady state):** cited as `arxiv 2510.16433` in evidence file. Not re-fetched.
- **`stryker-mutator-bun-runner` repo metrics other than releases (5 stars, 29 commits, 0 open issues):** WebFetch verified 0 releases; the other GitHub-stat numbers were not independently re-queried via API in this pass (they were verified in the earlier audit).

---

## Notes for Parent Handler

- **Mediums cluster around the parent agent's choice to add new sections rather than retro-edit old ones.** Findings 2 and 3 are both instances of "the new content corrects/refines older prose, but the older prose was left as-is." The Conflicts section line 893 + Exec #12 explicitly own this trade-off ("refined rather than replaced"); whether to leave it as-is or push the refinements upward into §I.1/§I.3 prose is a deliberate authorial choice, not necessarily a defect. If the report's audience is expected to read top-to-bottom (where §I.6 retro-corrects §I.1/§I.3), the as-is state is defensible. If the audience may read sections out of order or quote from §I.1/§I.3 in isolation, the retro-edits are worth doing.

- **Finding 1 (mdast-util-arbitrary downloads) is the only first-order factual defect in this pass.** The number is faithful to the cited source (unifiedjs.com) but contradicts the live npm registry by 5×. Easy fix: name the source inline.

- **Finding 4 (References list incomplete) is purely a tidiness issue** — the inline citations work, only the per-Part summary block is missing the two new files. Adding a "Part V — Followup" block is the cleanest resolution and matches the Rubric.

- **No stance violations in new content.** The factual-landscape posture held under stress through both the economics analysis (§I.6) and the more speculative coverage-guided fuzzing tradeoffs (§IV.8). The "tradeoff matrix (layout, not ranking)" framing is consistent across both.

- **No path or workflow leakage.** New content reads as native to a single-author research report; there are no traces of fanout/consolidation machinery in either REPORT.md or the two new evidence files.
