---
run_id: 2026-04-19-initial
consolidation_date: 2026-04-19
parent_report: /Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/REPORT.md
sources_consolidated: 4
stance: Factual/Landscape (zero recommendation language)
---

# Claim Inventory — md-pm-testing-hardening-today

This file is a **process artifact** scoped to the 2026-04-19-initial fanout consolidation pass. It records the analytical decomposition of source material, conflict detection results, and coverage audit. The consolidated REPORT.md is the reader-facing deliverable; this file exists for auditability.

## Source Inventory

| Sub-report | Path | REPORT.md size | Evidence files | Est. claims |
|---|---|---|---|---|
| C-MUT (Mutation Testing) | fanout/2026-04-19-initial/mutation-testing-ts-parsers/ | 39K | 5 | ~65 |
| C-DIFF (Differential Testing) | fanout/2026-04-19-initial/differential-testing-js-parsers/ | 27K | 5 | ~55 |
| C-WS (Whitespace Edge Cases) | fanout/2026-04-19-initial/whitespace-edge-cases-commonmark/ | 23K | 4 (incl. 28 test vectors) | ~80 |
| C-PATH (Pathological + Divergence) | fanout/2026-04-19-initial/pathological-inputs-divergence-corpus/ | 29K | 7 (incl. 45-entry corpus) | ~150 |

**Total source material:** ~118K REPORT.md + ~140K evidence files = ~258K. Per-cluster claim inventories (exhaustive) are preserved as tool-result outputs at `/Users/edwingomezcuellar/.claude/projects/-Users-edwingomezcuellar-team-skills/5f1802da-5d29-4631-aed3-2bc2892c2ed7/tool-results/toolu_01Miezhp2SULVbS2dgscRuwr.json` (mutation), `toolu_013DBASw6PfQzJ8eFpFMk6GC.json` (differential), `toolu_0157iEYhmnSQ7LUSAgaMzw63.json` (whitespace), `toolu_019oSRmQqmKKG7Nvmja8dp4j.json` (pathological).

## Claim ID Namespace

- **C-MUT-NNN** — Mutation testing claims (I.1–I.5 in consolidated REPORT)
- **C-DIFF-NNN** — Differential testing claims (II.1–II.6)
- **C-WS-NNN** — Whitespace/BOM/line-ending/tab claims (III.1–III.4, Appendix A)
- **C-PATH-NNN** — Pathological input + divergence claims (IV.1–IV.7, Appendix B)

Individual claim records (Span, Normalized, Confidence, Content type, Primary source URL) are persisted in the per-cluster tool-result JSON files referenced above. Reproducing them inline here would exceed 200K — the JSON files serve that purpose.

## Cross-Source Analysis

### Deduplication results

Zero semantic duplicates detected across clusters. Non-trivial cross-references surfaced:

- C-MUT-D1.4 and C-DIFF-D2.5 both reference fast-check (Parameters API, QualifiedParameters.ts source). Complementary — mutation cluster addresses seed propagation under Stryker; differential cluster addresses recursive arbitrary generation. Both preserved.
- C-WS-D4 and C-PATH-D6.2 both reference micromark README (500 KB input cap recommendation). Complementary — whitespace cluster addresses line-ending architecture; pathological cluster addresses depth-limit defense. Both preserved.
- C-WS-D5 and C-DIFF-D2.3 both reference `mdast-util-to-markdown` roundtrip disclaimer. Complementary — whitespace addresses `fences: true` default; differential addresses broader "no roundtrip guarantee" position. Both preserved.
- C-PATH-D7.5 (spec-silent edge cases) and C-WS-D3/D4/D5 (BOM, CRLF, tab spec silence) converge into Cross-Cutting Theme D ("CommonMark spec silence is where divergence concentrates"). Both cited.

### Conflict detection

**Zero factual conflicts detected** across the 4 clusters. The clusters investigate distinct subject areas; overlaps are complementary, not contradictory.

**Three conclusion-level tensions** (both positions valid under different framings) surfaced during synthesis and are explicitly documented in the consolidated REPORT.md's "Conflicts & Disagreements" section:

1. **bun retention vs. `coverageAnalysis: "perTest"`** — incompatible options where each forecloses the other without a runner migration.
2. **Byte-identity vs. AST-equivalence round-trip assertion** — both defensible; neither "correct."
3. **HTML oracle vs. AST oracle for differential testing** — each catches different bug classes.

These are resource/design-choice tensions, not factual disagreements.

### Scope filter

All claims in sources are in-scope. Non-goals per rubric (Rust pre-work, codebase analysis beyond Applicability callouts, recommendation rankings) were honored by all four sub-reports and by the consolidation. No scope violations detected.

## Topic Map

Consolidated sections organize source content into 4 Parts + 4-Theme cross-cutting synthesis + 2 Appendices:

| Section | Source clusters | Claim coverage |
|---|---|---|
| Part I: Mutation Testing | C-MUT (all 5 dimensions D1.1–D1.5) | All C-MUT claims |
| Part II: Differential Testing | C-DIFF (all 5 dimensions D2.1–D2.5) + Part II.6 cross-cutting | All C-DIFF claims |
| Part III: Whitespace | C-WS (D3, D4, D5 + test vector corpus) | All C-WS claims |
| Part IV: Pathological + Divergence | C-PATH (D6.1–D6.4 + D7.1–D7.4) | All C-PATH claims |
| Cross-Cutting Synthesis | All 4 clusters | Themes A–D span all clusters |
| Appendix A (28 whitespace vectors) | C-WS evidence/test-vector-corpus.md | All 28 vectors preserved verbatim |
| Appendix B (45 divergence snippets) | C-PATH evidence/divergence-corpus.md | ~15 representative + link to complete file |

## Coverage Audit

### Faithfulness (precision) — Does every REPORT claim trace to a source?

Spot-check sample of 15 factual claims in consolidated REPORT.md:

| REPORT claim | Traces to | Verified |
|---|---|---|
| "Stryker-js v9.6.1 released 2026-04-10" | C-MUT REPORT §Executive Summary | ✓ |
| "Bun test runner is CLI-only" | C-MUT §D1.1 | ✓ |
| "8 high-signal mutator categories for parsers" | C-MUT §D1.2 | ✓ (table preserved) |
| "Sentry JS SDK 25-60 min per package" | C-MUT §D1.3 | ✓ |
| "fast-check default seed is Date.now() ^ Math.random()" | C-MUT §D1.4 | ✓ |
| "remark/unified/markdown-it public repos do not use mutation testing" | C-MUT §D1.5 | ✓ |
| "No public JS repo runs ≥2 markdown parsers for equivalence" | C-DIFF §D2.4 | ✓ |
| "CommonMark spec is ~627 JSON objects via `commonmark-spec` npm" | C-DIFF §D2.2 | ✓ |
| "micromark strips only a single leading BOM" | C-WS §D3 | ✓ |
| "remark-stringify emits LF only per remark #660" | C-WS §D4 | ✓ |
| "SKIP_SECTIONS caused by mdast-util-to-markdown `fences: true` default" | C-WS §D5 | ✓ |
| "20 CVEs/GHSAs captured in 2020+ window" | C-PATH §D6.1 | ✓ |
| "marked(\">\".repeat(5000)) crashes Node" | C-PATH §D6.2 | ✓ (code block preserved) |
| "9 of 20 advisories are ReDoS" | C-PATH §D6.1 | ✓ |
| "45 divergence snippets across 13 test families" | C-PATH §D7.4 | ✓ |

No hallucinations detected. All sampled claims trace to sources.

### Completeness (recall) — Does every important source claim appear in REPORT?

Spot-check by dimension coverage:

- **C-MUT D1.1–D1.5:** Each sub-dimension present with at least one claim in REPORT Part I. ✓
- **C-DIFF D2.1–D2.5 + cross-cutting:** Each sub-dimension present in REPORT Part II. ✓
- **C-WS D3 + D4 + D5 + test vectors:** D3/D4/D5 present in REPORT Part III; 28 test vectors preserved in Appendix A verbatim. ✓
- **C-PATH D6.1–D6.4 + D7.1–D7.4:** All sub-dimensions present in REPORT Part IV. D7.4 full corpus preserved in evidence/divergence-corpus.md; representative entries from all 13 test families in Appendix B. ✓

### Structural completeness — Did content types survive?

- **Tables:** 12 source tables preserved in consolidated REPORT (mutation operator signal ranking, per-parser BOM/line-ending/tab behavior, mitigation knob inventory, CVE reproducer patterns, Sentry wall-clock data, mutant states, oracle choice matrix, throughput ops/sec, Stryker maintenance signals, rubric summary, etc.). ✓
- **Code blocks:** 4 code blocks preserved verbatim (git-diff bash snippet, marked stack-overflow reproducers, micromark reproducer, Git autocrlf behavior table). ✓
- **Examples (YAML test vectors):** 28 whitespace vectors preserved in full (Appendix A); representative divergence snippets preserved with test_family tags (Appendix B). Complete 45-entry corpus preserved in evidence/divergence-corpus.md. ✓
- **Primary-source URLs:** All CVE advisory links, GitHub issue links, spec section links, npm package links, CommonMark forum threads preserved with their inline URLs. ✓

**Intentional partial preservation:** Appendix B contains ~15 of 45 divergence snippets inline, with the remaining 30 referenced via evidence/divergence-corpus.md. This matches the structure of the source C-PATH REPORT.md itself (which also had representative entries plus an evidence-file pointer) and keeps the consolidated REPORT navigable. The full corpus is accessible at evidence/divergence-corpus.md as a lift-and-shift YAML fixture.

### Confidence-prose alignment

All epistemic qualifiers preserved from sources. Examples:

- "UNCERTAIN" → "uncertain" in REPORT (PR #5931 merge status, bun-runner perf benchmarks)
- "INFERRED" → "inferred" in REPORT (mutator signal ranking, equivalent-mutant patterns, double-BOM failure mode)
- "CONFIRMED" statements use declarative language (CVE IDs, spec section references, GitHub issue URLs)
- No hedging upgrades. No declarative statements on inferred claims.

## Consolidation Brief Compliance

| Brief directive | Compliance |
|---|---|
| Zero recommendation language | ✓ (no "you should", "we recommend", "the right approach") |
| Layout of options with tradeoffs only | ✓ (each section has Tradeoffs subsection where applicable) |
| One top-level section per sub-cluster | ✓ (Part I/II/III/IV) |
| Preserve concrete test-vector snippets with source citations | ✓ (28 vectors Appendix A verbatim + 13-family corpus catalogue in Appendix B + full corpus in evidence/) |
| Applicability callouts as small insets | ✓ (blockquote format under relevant sections, not dominant narrative) |
| All citations must be external primary sources | ✓ (zero fanout/ paths in REPORT.md body; only in evidence-file references which point to the parent evidence/ dir, not fanout/) |
| Do not delete fanout/ directory | ✓ (preserved at fanout/2026-04-19-initial/ for auditability) |
| Do not write changelog or regenerate catalogue | ✓ (parent agent handles) |

## Artifacts Produced

1. `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/REPORT.md` — consolidated report (~80K, Executive Summary + 4 Parts + Cross-Cutting Synthesis + 2 Appendices)
2. `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/evidence/` — 21 evidence files copied from fanout sub-reports
3. `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-initial/` — preserved fanout sub-reports with this CLAIMS.md
4. `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/meta/runs/2026-04-19-initial/RUN.md` — run coordination artifact

## Audit Trail

- Per-cluster claim extraction performed by 4 parallel Agent (Explore) subagents via Task tool
- Cross-source synthesis performed by the orchestrator (this claim inventory author) with access to full per-cluster REPORTs via Read tool
- Claim-level conflict detection performed against the analytical claim inventories (no conflicts detected)
- Coverage audit performed by spot-checking 15 sampled claims across all 4 clusters against REPORT.md

## Open Items

None blocking consolidation. All Open Questions from sub-reports are preserved verbatim in the consolidated REPORT.md "Limitations & Open Questions" section, organized by Part.
