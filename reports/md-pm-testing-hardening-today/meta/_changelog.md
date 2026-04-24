# Changelog — md-pm-testing-hardening-today

## 2026-04-19 — Initial fanout + consolidation

### Fanout run: 2026-04-19-initial
- Directions pursued: mutation-testing-ts-parsers, differential-testing-js-parsers, whitespace-edge-cases-commonmark, pathological-inputs-divergence-corpus
- Sub-reports: 4 successful, 0 failed
- Consolidation: `/consolidate` (fork-session) produced 1321-line REPORT.md + 21 evidence files + CLAIMS.md inventory
- Claims inventory: fanout/2026-04-19-initial/CLAIMS.md
- Sub-reports preserved at: fanout/2026-04-19-initial/

### Evidence files (21 total, preserved from sub-reports)
- Mutation testing (5): adopter-examples.md, mutation-operators-parsers.md, runtime-cost-strategies.md, stryker-fastcheck-interaction.md, stryker-ts-integration.md
- Differential testing (5): d2-1-differential-harness-patterns.md, d2-2-commonmark-spec-fixture.md, d2-3-ast-diff-normalization.md, d2-4-concrete-harness-examples.md, d2-5-fast-check-pbt.md
- Whitespace edge cases (4): d3-bom-handling.md, d4-line-endings.md, d5-tabs-indented-code.md, test-vector-corpus.md
- Pathological + divergence corpus (7): d6.1-cves-ghsas.md, d6.2-stack-overflow-bugs.md, d6.3-redos-quadratic.md, d6.4-giant-document-scaling.md, d7.1-d7.2-babelmark-commonmark-divergences.md, d7.3-gfm-divergences.md, divergence-corpus.md

### REPORT.md sections
- Executive Summary (11 numbered findings)
- Research Rubric
- Part I: Mutation Testing for TS Parser/Serializer Code (5 dimensions)
- Part II: Differential Testing within the JS Markdown Ecosystem (5 dimensions)
- Part III: Whitespace / BOM / Line-Ending / Tab Edge Cases (5 sub-sections + test vector corpus)
- Part IV: Pathological Inputs + Cross-Parser Divergence Corpus (7 sub-sections)
- Cross-Cutting Synthesis (3 themes)
- Limitations & Open Questions
- References
- Appendix A — 28-vector whitespace test corpus
- Appendix B — 59-snippet cross-parser divergence corpus (13 test families)

### Audit resolved (2 High, 5 Medium, 2 Low)
- [H1] Divergence corpus count: 45 → 59 across frontmatter, Exec Summary #11, IV.7, Appendix B heading + body (was under-counting by 14)
- [H2] remark#660 characterization softened in Exec Summary #6, III.2, Theme C (attribution stronger than issue body supports)
- [M3] CVE-2026-2327 range: "v13.x" → "< 14.1.1 (13.x and 14.x pre-14.1.1)" (was implying 14.x safe)
- [M4] DOMPurify CVE-2024-48910 CVSS qualified: "CVSS v3 9.1 / CVSS v4 9.3" (was unqualified "9.3")
- [M5] bun#26191 close date: 2026-01-17 → 2026-01-21 (off by 4 days)
- [M6] autolinks count in IV.7: 10 → 11 entries (resolved as part of H1)
- [M7] Call-stack ceiling numbers replaced with "single-digit thousands for V8, tens of thousands for SpiderMonkey" + evidence-file link (specific numbers uncited inline)
- [L8] Adopter-table star counts annotated "as of 2026-04-19"
- [L9] Exec Summary #5 extended with string-vs-stream BOM divergence (was eliding TextDecoder stripping)

## 2026-04-19 — Followup fanout + consolidation

### Fanout run: 2026-04-19-followup
- Directions pursued: FU1 (stryker-bun-vs-vitest-economics, Moderate) and FU2 (micromark-fuzzing-target, Deep)
- Sub-reports: 2 successful, 0 failed (FU1 17.7K; FU2 46.8K)
- Consolidation: parent-inline (consolidation child died during SessionStart:resume; parent agent read sub-reports directly and performed surgical enrichment)
- Claims inventory: fanout/2026-04-19-followup/CLAIMS.md (28 primary claims)
- Sub-reports preserved at: fanout/2026-04-19-followup/

### Parent REPORT.md changes (1321 → 1498 lines)
- Exec Summary: added entries #12 (perTest 1.7-2.5× refinement), #13 (stryker-bun-runner perTest contradiction flagged), #14 (Jazzer.js state-transition coverage gap)
- Rubric: added row V (Followup — Economics + Fuzzing as PBT Complement)
- Part I: added subsection I.6 (Economics: bun-runner vs vitest-migration vs command runner, with tradeoff matrix + break-even sketch)
- Part IV: added subsection IV.8 (Coverage-guided fuzzing as a complement to PBT)
- Cross-Cutting Synthesis: added Themes E (runner-choice propagation) and F (coverage-guidance on semantic vs syntactic stages)
- Conflicts & Disagreements: expanded with contradiction documentation (perTest support)
- References: added Part V block listing 2 new evidence files

### New evidence files
- evidence/stryker-bun-vs-vitest-economics.md
- evidence/micromark-fuzzing-target.md

### Followup audit resolved (0 High, 4 Medium, 2 Low)
- [M1] `mdast-util-arbitrary` downloads: annotated both sources (unifiedjs.com ~40 vs npm registry 8 live as of 2026-04-19) with dated attribution
- [M2] `perTest` refinement propagated back to §I.1 (Applicability callout + Tradeoffs) and §I.3 (Native lever #1 + Tradeoffs) with inline §I.6 cross-refs; baseline distinction noted (vs "all" = 1.7-2.5× vs full-suite-per-mutant = order-of-magnitude)
- [M3] Sentry 60→25 min datapoint qualified as "Core SDK package only" in §I.3 line 177 and §I.5 line 236
- [M4] References gained Part V evidence-files block with 2 new entries + corpus count corrected from 45 → 59 (straggler from initial audit H1 fix)
- [L5] Theme E Böhme phrasing refined: "branch coverage saturates within ~15 min of a 23h campaign, but >50% of bugs are found in the last two-thirds" — preserves decoupling point
- [L6] IJON Super Mario phrasing softened in §IV.8 and evidence file: ">20× speedup on maze" + "qualitative ability to play Super Mario Bros"

### Note on consolidation recovery
Consolidation child spawned via `claude --continue --fork-session` died during a SessionStart:resume hook firing. Parent agent recovered by reading both sub-reports + their evidence files directly and performing surgical enrichment inline. All consolidation-brief requirements met (stance, structure preservation, new-section placement, references, no fanout leakage). CLAIMS.md written post-hoc. Sub-report directories preserved intact.

## 2026-04-19 — Contradiction resolution: Exec #13 (perTest plugin support)

### Source-read verification
- `npm pack stryker-mutator-bun-runner@0.4.0` → inspected tarball source directly
- `git clone --depth 1 https://github.com/menoncello/stryker-mutator-bun-runner` → inspected main branch in parallel
- Published 0.4.0 ships `src/coverage/` module (479 LOC across 4 files) implementing Stryker perTest protocol — `CoverageHookGenerator`, `MutantCoverageCollector`, `TestFilter`, `CoverageTypes`
- Main-branch HEAD is a v1.0.0 in-progress rewrite: `MutationActivator.activateMutation` is a `// TODO` stub; no `coverage/` directory despite being imported

### REPORT.md changes (1498 → 1514 lines)
- Exec Summary #1: corrected "coverageAnalysis: off" → "coverageAnalysis: perTest via __stryker__ preload hook + TestFilter regex"
- Exec Summary #13: rewritten from "contradiction exists" to "resolved; source-read confirms perTest"
- §I.1 Community option paragraph: expanded with source-read detail + main-branch-stub caveat
- §I.3 perTest bullet: removed "community bun runner is contested" phrasing
- §I.6 tradeoff matrix + break-even sketch: reframed around 1.0.0-rewrite-regression risk; "Per-mutant wall clock" row corrected
- New evidence file: evidence/stryker-bun-runner-source-read.md
- Contradiction addendum: fanout/2026-04-19-followup/CLAIMS-addendum-2026-04-19-resolution.md
- Zero fanout/ leakage maintained
