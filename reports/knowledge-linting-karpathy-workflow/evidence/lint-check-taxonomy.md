# Evidence: The Lint-Check Taxonomy

**Dimension:** Synthesizing the convergent set of knowledge-lint checks across Karpathy + GBrain + community implementations
**Date:** 2026-04-27
**Sources:** Karpathy gist; GBrain spec (Garry Tan); ByteRover paper; community implementations (Spisak, kytmanov, Ar9av, Astro-Han); WikiSQE academic dataset; this repo's `compiled-truth-timeline-content-conventions/` failure-mode evidence

---

## Findings

### Finding: Eleven distinct knowledge-lint check categories appear across surveyed systems
**Confidence:** CONFIRMED
**Evidence:** Cross-referencing Karpathy's six, GBrain's eight, kytmanov's source-traceability lint, and gist comments:

| # | Check | Karpathy | GBrain `maintain` | Community impls | Mechanically detectable? |
|---|---|---|---|---|---|
| 1 | **Contradictions between pages** | ✅ | ✅ | mentioned | ❌ LLM-required |
| 2 | **Stale claims** (newer sources supersede older) | ✅ | ✅ (stale info) | mentioned | ⚠ partially (file-age + source-date heuristic; final judgment LLM) |
| 3 | **Orphan pages** (no inbound links) | ✅ | ✅ | broken-`[[wikilinks]]` scans | ✅ |
| 4 | **Important concepts without pages** (redlinks) | ✅ | ✅ (open-thread audit) | mentioned | ✅ |
| 5 | **Missing cross-references** | ✅ | ✅ | mentioned | ⚠ (LLM judges *which* refs are missing; the check itself is "find concept names in body that aren't linked" — grep + concept list) |
| 6 | **Data gaps / unanswered questions** | ✅ | ✅ (open-thread audit) | "boundary-first autoresearch" | ❌ LLM-required |
| 7 | **Dead links** (internal & external) | implicit | ✅ | ✅ Spisak `/second-brain-lint` | ✅ |
| 8 | **Tag consistency** | — | ✅ | — | ✅ |
| 9 | **Embedding freshness** (vector index drift) | — | ✅ | — | ✅ (timestamp diff against source mtime) |
| 10 | **Source traceability** (every wiki page links back to `raw/`) | implicit | implicit | ✅ kytmanov | ✅ |
| 11 | **Index ↔ content drift** (`index.md` lists pages that don't exist; pages exist but not in index) | implicit | implicit | ✅ Spisak | ✅ |

(Karpathy's six = #1–6. GBrain adds #7–9. Community adds #10–11. ByteRover's AKL maturity-decay pattern overlaps with #2.)

**Implications:**
- The canonical "what to lint" set is roughly 11 checks across two camps:
  - **5 mechanically detectable** (with deterministic logic + the wiki contents): #3, #4, #7, #8, #9, #10, #11 — that's seven in fact.
  - **2 LLM-required** (genuine semantic judgment): #1, #6.
  - **2 hybrid** (deterministic prefilter + LLM final call): #2, #5.
- Of Karpathy's canonical six, **two are deterministic** (#3 orphans, #4 redlinks/missing-pages), **one is hybrid** (#2 stale, #5 missing cross-refs), **two are LLM-only** (#1 contradictions, #6 data gaps). So even Karpathy's six has a 50/50 split between "agent does it" and "static analysis can do it."

### Finding: Five additional lint dimensions emerge from agent-native KB literature beyond Karpathy/GBrain
**Confidence:** INFERRED
**Evidence:** Cross-referenced from `compiled-truth-timeline-content-conventions/` (this repo) + `llm-knowledge-consolidation-fidelity/` (this repo) + ByteRover paper + WikiSQE dataset:

| # | Check | Source | Mechanically detectable? |
|---|---|---|---|
| 12 | **Compiled truth ↔ timeline coupling** (does the compiled-truth zone reflect the timeline below it?) | GBrain explicit; ByteRover via AKL | ⚠ hybrid (mtime check is deterministic; semantic alignment is LLM) |
| 13 | **Lost-nuance regression** (LLM compressed evidence and dropped caveats / confidence levels) | `compiled-truth-timeline` failure mode #2 | ❌ LLM-required (semantic comparison) |
| 14 | **Hallucination amplification** (claim in compiled truth not traceable to any timeline entry) | `compiled-truth-timeline` failure mode #6 | ⚠ hybrid (claim extraction + timeline match — both LLM-assisted) |
| 15 | **Over-confident summaries** (epistemic qualifiers stripped: "Source A says X" → "X") | `compiled-truth-timeline` failure mode #7 | ❌ LLM-required |
| 16 | **Citation-required** (claim presented without source) | WikiSQE "Citation needed" label | ⚠ hybrid (deterministic: every paragraph has at least one link / footnote; LLM: which claims need citation) |

**Implications:**
- These extend lint beyond *structure* (links, indexes) into *content fidelity* — was the compilation faithful to its sources?
- WikiSQE's empirical finding is highly relevant: **"Citation needed" is the *hardest* category for automated detection**, even with 3.4M training examples. This is empirical grounding for the claim that closed-loop grounding (a load-bearing rule in OK's skill) cannot be fully automated.

### Finding: The check set splits cleanly by *target layer*
**Confidence:** CONFIRMED
**Evidence:** Re-grouping the 16 checks by which Karpathy layer they apply to:

**`raw/` layer (immutable sources):**
- External-URL rot — original source still alive at `source_url`?
- Source preservation integrity — file contents match what was ingested?
- Source-archive snapshot — has the source been Wayback-archived as a fallback against rot?

**`wiki/` layer (LLM-compiled content):**
- All link-graph checks: orphan pages (#3), redlinks (#4), dead links (#7), missing cross-refs (#5), source-traceability (#10), index drift (#11)
- All semantic checks: contradictions (#1), stale claims (#2), data gaps (#6), compiled-truth/timeline coupling (#12), lost-nuance (#13), hallucination amplification (#14), over-confidence (#15), citation-required (#16)
- Tag consistency (#8)

**Schema layer (`CLAUDE.md` / `AGENTS.md` / config):**
- Drift between schema's described conventions and actual wiki state (e.g., schema says "every article in `articles/` has frontmatter `title`" — does it?)
- Schema size / load-cost (the OK repo's AGENTS.md size cap is one example; loadable schemas degrade instruction adherence past size thresholds).

**Cross-layer:**
- Embedding freshness (#9) — index across all layers must mirror source mtimes.

**Implications:** A complete knowledge linter operates on **three different artifact classes** with different rule shapes:
- **Sources**: immutability + preservation checks (archive rot, file integrity).
- **Compiled content**: link-graph integrity + semantic fidelity.
- **Schema**: self-consistency between rules and ruled.

### Finding: Karpathy's six omit prose-quality and style — deliberately
**Confidence:** INFERRED
**Evidence:** No Karpathy-implementation lint surface includes prose-quality checks (no Vale, no spell-check, no inclusive-language scanner, no markdown-style linter). All implementations focus exclusively on **knowledge integrity** (the 16 dimensions above).

WikiSQE's research surfaces 153 distinct quality labels Wikipedia editors use, including "Weasel words", "Peacock", "Puffery", "Tone", "Awkward". None of these appear in any Karpathy-style lint check.

**Implications:** The Karpathy frame treats the LLM as the prose-quality enforcer at *write time*, not at lint time. Lint is reserved for issues the LLM cannot self-correct in the moment — graph-level inconsistency, cross-page contradictions, index drift. This is a deliberate scope.

---

## Negative searches

- I searched for "knowledge linting" tools that combine all 16 checks into a single integrated runner — none exist as of April 2026. Every implementation covers a subset (typically 4-8 of the 11 Karpathy/GBrain checks).
- I searched for academic literature on automated detection of "lost nuance" and "compiled-truth/timeline coupling" — no quantitative studies exist. These remain LLM-judgment-only with no empirical baseline.

---

## Gaps / follow-ups

- ByteRover's AKL (Adaptive Knowledge Lifecycle) does importance/maturity/recency decay — but `compound-score weights are set to 0` per the prior-art report, so AKL ranking is "infrastructure built, behavior disabled." A working AKL implementation would add quantitative grounding for stale-claim detection.
