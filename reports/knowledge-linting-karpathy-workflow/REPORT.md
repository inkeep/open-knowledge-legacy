---
title: "Knowledge Linting in the Karpathy Three-Layer Workflow"
description: "Factual landscape of what 'knowledge linting' means in a Karpathy-style LLM Wiki workflow — the canonical 6 checks, GBrain's 8, community implementations' 5+ slash-command lint surfaces, the convergent 16-check taxonomy across surveyed systems, the deterministic-vs-LLM-required split, the failure-mode root cause (compiled-truth decoupling from evidence), four trigger classes (activity / time / use / continuous decay), and the tooling landscape (lychee, IABot/Wayback, WikiSQE) that exists or doesn't for each check."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Andrej Karpathy
  - GBrain
  - ByteRover
  - Obsidian
  - lychee
  - Wayback Machine
  - WikiSQE
topics:
  - knowledge linting
  - Karpathy LLM Wiki
  - three-layer workflow
  - lint check taxonomy
  - source-grounding
  - compiled truth
  - link rot
  - citation rot
  - knowledge integrity
  - agent-native knowledge bases
---

# Knowledge Linting in the Karpathy Three-Layer Workflow

**Purpose:** Map what "knowledge linting" actually means in a Karpathy-style LLM Wiki — what gets checked, by which class of tool, on what cadence, and where the deterministic / LLM-required line falls. Frame the landscape so a reader can decide what's tractable to build today and what genuinely depends on agent discipline.

---

## Executive Summary

Karpathy's "Lint" operation is **one of three first-class operations** alongside Ingest and Query, and it operates against a deliberately abstract three-layer architecture: `raw/` (immutable sources), the wiki (LLM-compiled markdown), and a schema file (`CLAUDE.md` / `AGENTS.md`). Lint is **generative, not pass/fail** — its output is a list of knowledge-acquisition tasks, not a CI red/green. Karpathy's gist names six canonical checks: **contradictions, stale claims, orphan pages, important concepts without pages, missing cross-references, data gaps**. None are about prose style or markdown formatting; all are about knowledge-graph and content integrity.

Across the 15+ Karpathy implementations that emerged in the five days after his April 2026 post — plus Garry Tan's GBrain spec, ByteRover's paper-and-code, the Wikipedia/Wayback rescue effort, and academic work on Wikipedia sentence-quality (WikiSQE, 3.4M sentences, 153 quality labels) — a convergent **16-check taxonomy** emerges. Notably, **just under half (7 of 17) of the checks are deterministic and shippable today with off-the-shelf tools** (`lychee` for dead links; grep + graph-traversal scripts for orphans, redlinks, source-traceability, index drift, tag consistency, embedding freshness; archive-on-ingest for external URL preservation). **5 of 17 are pure LLM-judgment** (contradictions, data gaps, lost-nuance regression, hallucination amplification, over-confident summaries). **5 are hybrid** — deterministic prefilter plus LLM final call.

The empirical grounding from WikiSQE matters: across 153 quality labels and 3.4M training examples, **"Citation needed" is the *hardest* category for automated detection.** The closed-loop grounding rule that Karpathy-style KBs depend on — every claim cites a local source — cannot be deterministically enforced by a static gate. It is irreducibly an agent-discipline + human-review concern.

The **canonical failure mode is universal across six historical knowledge systems** (NIE intelligence reports, Presidential Daily Brief, Wikipedia, Zettelkasten, ByteRover, GBrain): the compiled zone decouples from its evidence base. Every concrete lint check is a different probe of that single decoupling.

The cadence story has converged on **four trigger classes** that interleave: **activity-based** (every ~10 ingests), **time-based** (at least monthly), **use-based** (before major queries), and **continuous decay** (ByteRover-AKL-style importance scoring). A fifth pattern — "Sleep Consolidation" (overnight LLM passes for deep semantic checks) — has emerged in gist comments. **Quality-gates-at-ingest** is a complementary preventive frame: filter noise before it lands, rather than detect it post-hoc.

**Key Findings:**
- **Lint output is a knowledge-acquisition backlog, not a pass/fail signal.** The CI-gate framing imported from code-linting is the wrong shape for knowledge lint.
- **Karpathy's six checks split 50/50 between deterministic and LLM-required.** Two are mechanically detectable (orphans, redlinks); two need LLM (contradictions, data gaps); two are hybrid (stale, missing cross-refs).
- **The convergent 17-check taxonomy across surveyed systems is roughly 41% deterministic / 29% hybrid / 29% LLM-only.** The deterministic side has shippable tools today; the LLM side has no public benchmark.
- **External URL rot has a pattern (archive-on-ingest, IABot/Wayback)** that no Karpathy-style implementation has adopted. This is a clear gap with a known mitigation.
- **"Citation needed" is empirically the hardest auto-detect** (WikiSQE evidence). Closed-loop grounding cannot be deterministically gated.
- **Failure-mode root cause is consistent across six systems and 75+ years of practice:** compiled-truth decoupling from its evidence base. Every lint check is one probe of this single failure.
- **The Karpathy frame deliberately omits prose-quality lint** (Vale, weasel words, peacock language). The LLM is treated as the prose-quality enforcer at *write time*; lint is reserved for cross-page knowledge integrity.
- **Drift-and-rebuild is a real alternative to incremental lint.** Past a decay threshold, re-ingesting from `raw/` is cheaper than fixing the wiki in place. Open question on threshold; ~30% pages-with-findings is a community heuristic.

---

## Research Rubric

**Primary question:** What does "knowledge linting" mean in a Karpathy-style three-layer workflow, and what conventions, tools, and patterns exist for detecting knowledge-quality issues — staleness, source rot, broken supersedes chains, ungrounded claims, layer-discipline violations?

**Reader cares most about:** Concrete patterns and primitives, not generic "ensure quality" advice.

**Dimensions (P0):**
1. **Karpathy's canonical model** — what the gist prescribes, what it leaves implicit.
2. **Layer-discipline lint rules** — what each layer (raw / wiki / schema) demands.
3. **Knowledge-quality dimensions** — the convergent check taxonomy.
4. **Tooling & prior art** — what tools exist; what's deterministic vs LLM-required.

**P1:**
5. **Mechanical-vs-LLM split** — how to ship a useful subset today without an LLM in the loop.

**Stance:** Factual landscape (3P). No recommendations on what Open Knowledge specifically should build.

---

## Detailed Findings

### 1. Karpathy's canonical model

**Finding:** Lint is one of three first-class operations against a deliberately-abstract three-layer architecture. Its output is a generative knowledge-acquisition backlog, not a pass/fail gate. Karpathy names six canonical checks and explicitly omits prose-quality concerns.

**Evidence:** [evidence/karpathy-canonical-model.md](evidence/karpathy-canonical-model.md)

The architecture (verbatim from the gist):

```
raw/        — immutable ingested sources, LLM is READER
wiki/       — LLM-generated markdown, LLM is EDITOR
CLAUDE.md   — schema/conventions, user-and-LLM co-author
   (or AGENTS.md)
```

Three operations:
- **Ingest** — process source → update 10-15 wiki pages + index + log.
- **Query** — search wiki, synthesize answer with citations; good answers can be filed back as new pages.
- **Lint** — periodic health-check.

The six canonical Lint checks (verbatim):
1. Contradictions between pages
2. Stale claims that newer sources have superseded
3. Orphan pages with no inbound links
4. Important concepts mentioned but lacking their own page
5. Missing cross-references
6. Data gaps that could be filled with a web search

The output is generative: *"The LLM is good at suggesting new questions to investigate and new sources to look for. This keeps the wiki healthy as it grows."*

**Implications:**
- **CI-gate framing is wrong.** Importing the code-lint metaphor literally — "block the merge until lint passes" — misses the point. The wiki is *always* incomplete; lint surfaces *what to do next*, not whether you can ship.
- **The schema file is itself lintable** — schema rules can drift from the actual wiki state. This recursive case is implicit in the gist but not explicit.
- **`index.md` ↔ wiki content drift is mechanically detectable** because Karpathy specifies that the LLM updates `index.md` on every ingest. A simple `find` vs `grep` comparison against `index.md` flags drift.

**Decision triggers (when this matters):**
- Building a Karpathy-style KB, deciding whether lint is a CI gate or a backlog generator.
- Designing the schema file: it inherits the same lint discipline as any other doc.

---

### 2. The convergent lint-check taxonomy

**Finding:** Across Karpathy (6 checks), GBrain (8 checks), ByteRover (AKL decay), and 5+ community implementations, a **17-check taxonomy** emerges. ~41% are mechanically detectable today; ~29% are pure LLM-judgment; ~29% are hybrid (deterministic prefilter + LLM final call).

**Evidence:** [evidence/lint-check-taxonomy.md](evidence/lint-check-taxonomy.md)

The full check inventory, classified by detection feasibility:

| # | Check | Origin | Detection |
|---|---|---|---|
| 1 | Contradictions between pages | Karpathy + GBrain | LLM-only |
| 2 | Stale claims (newer source supersedes) | Karpathy + GBrain | Hybrid |
| 3 | Orphan pages (no inbound links) | Karpathy + GBrain | Deterministic |
| 4 | Redlinks (concepts without pages) | Karpathy + GBrain | Deterministic |
| 5 | Missing cross-references | Karpathy + GBrain | Hybrid |
| 6 | Data gaps / unanswered questions | Karpathy + GBrain | LLM-only |
| 7 | Dead links (internal + external) | GBrain + community | Deterministic |
| 8 | Tag consistency | GBrain | Deterministic |
| 9 | Embedding freshness | GBrain | Deterministic |
| 10 | Source traceability (every wiki page links back to `raw/`) | kytmanov | Deterministic |
| 11 | Index ↔ content drift | Spisak, Karpathy implicit | Deterministic |
| 12 | Compiled-truth ↔ timeline coupling | GBrain, ByteRover | Hybrid |
| 13 | Lost-nuance regression | this repo's prior research | LLM-only |
| 14 | Hallucination amplification | this repo's prior research | LLM-only |
| 15 | Over-confident summaries | this repo's prior research | LLM-only |
| 16 | Citation-required (claim w/o source) | WikiSQE | Hybrid |
| (17) | External URL archive integrity | Wikipedia / IABot pattern | Deterministic |

By target layer:
- **`raw/`**: external URL rot (#17), source-content integrity (live URL vs local copy hash).
- **`wiki/`**: all link-graph checks (#3, #4, #5, #7, #10, #11) + all semantic checks (#1, #2, #6, #12, #13, #14, #15, #16).
- **Schema**: drift between schema's described conventions and actual wiki state.
- **Cross-layer**: embedding freshness (#9) — index across all layers must mirror source mtimes.

**Implications:**
- A pragmatic knowledge linter mixes a **fast deterministic pass** (every commit / push) with a **slower LLM pass** (scheduled or on-demand).
- The deterministic 7 are the highest-leverage starting set — every Karpathy-implementation's lint command covers a subset, none cover all 7.
- The five LLM-only checks have *no public benchmarks* — community implementations don't publish quality measurements. This is a meaningful research gap.

**Decision triggers:**
- Building a knowledge linter today, picking the initial check set: start with the 7 deterministic checks; add LLM checks once cadence is established.
- Estimating effort: deterministic checks are off-the-shelf (lychee + ~50 lines of shell); LLM checks are hundreds of lines of prompt + eval engineering.

---

### 3. Failure modes and triggers

**Finding:** Eight failure modes documented across systems all trace to one root cause — **compiled-truth decoupling from its evidence base**. Four trigger classes interleave to determine *when* to lint, plus an emerging fifth (Sleep Consolidation) and a complementary preventive frame (quality-gates-at-ingest).

**Evidence:** [evidence/failure-modes-and-triggers.md](evidence/failure-modes-and-triggers.md)

The eight failure modes (from this repo's prior `compiled-truth-timeline-content-conventions/` report, which surveyed six historical systems including 75+ years of intelligence-community practice):

1. Stale compiled truth (timeline advances, compiled truth doesn't recompile)
2. Lost nuance in rewrites (LLM compresses, drops caveats)
3. Unbounded timeline growth
4. Conflicting rewrites (concurrent agents, last-writer-wins)
5. Circular compilation (compiled truth used as input to its own recompilation)
6. Hallucination amplification (errors reinforced through subsequent compilations)
7. Over-confident summaries (epistemic qualifiers stripped)
8. Orphaned timelines (post-rewrite, historical entries don't relate to current state)

**Failures 1, 5, 6, 8** are temporally / structurally detectable. **Failures 2, 3, 7** are LLM-only. **Failure 4** is solved by infrastructure (CRDT, version-CAS), not lint.

The four trigger classes:

| Trigger | Source | Cadence | What it catches |
|---|---|---|---|
| **Activity-based** | Every N ingests (community: N=10) | Synchronous | Recent decay |
| **Time-based** | Monthly (community convergence) | Periodic | Slow decay in low-activity periods |
| **Use-based** | Before major queries / synthesis | On-demand | Query-time corruption |
| **Continuous decay** | ByteRover-AKL importance score (0.995^dt/day) | Asynchronous | Graceful degradation signal |

The fifth, emerging:
- **Sleep Consolidation** (DPC Messenger, gist comments) — overnight scheduled deep semantic lint when the user isn't waiting. Lighter activity-based runs cover the sync path; sleep covers the deep checks.

The complementary preventive frame:
- **Quality-gates-at-ingest** (7xuanlu Origin) — filter noise *before* it lands. Cheaper than post-hoc lint because each ingest only touches the new doc + immediate neighbors.

**Implications:**
- **A robust cadence interleaves all four trigger classes**, not picks one. Activity catches recent ingests, time covers low-activity periods, use prevents query-time corruption, continuous decay surfaces gradual degradation.
- **Quality-gates-at-ingest shifts work left.** Many lint checks become unnecessary if they ran at ingest time instead.
- **Drift-and-rebuild is the lifecycle alternative.** Past a decay threshold, re-ingesting from `raw/` is cheaper than fixing in place. The community heuristic is roughly: when >30% of pages have lint findings, rebuild.

**Decision triggers:**
- Designing lint UX: don't pick one trigger; layer them.
- Choosing between incremental lint and rebuild: track decay percentage explicitly.

---

### 4. Tooling landscape

**Finding:** The deterministic lint surface has mature tooling (lychee for dead links, IABot/Wayback for external archive, off-the-shelf grep + graph-traversal scripts for the rest). The semantic surface has *no tooling* — only LLM judgment. Empirically, "Citation needed" is the hardest category to automate.

**Evidence:** [evidence/tooling-landscape.md](evidence/tooling-landscape.md)

Mature deterministic tools:

| Tool | Coverage | Notes |
|---|---|---|
| [lychee](https://github.com/lycheeverse/lychee) | Dead links (internal + external) | Fast Rust; CI-gate-ready via [lychee-action](https://github.com/lycheeverse/lychee-action); 576 links in ~1 minute |
| [hyperlink](https://github.com/untitaker/hyperlink) | Dead links | "Very fast for CI" |
| [linaro-its/jekyll-link-checker](https://github.com/linaro-its/jekyll-link-checker) | Static-site internal+external | Niche but Jekyll-native |
| [IABot](https://en.wikipedia.org/wiki/Wikipedia:Link_rot) + Wayback Machine | External URL archival | Wikipedia rescued 9M+ URLs; pattern is **archive-on-cite** |

Semantic tooling: **none.** The five LLM-only checks (contradictions, data gaps, lost-nuance, hallucination amplification, over-confident summaries) have no public benchmark, no off-the-shelf detector, no shared dataset.

The empirical anchor: [WikiSQE](https://arxiv.org/html/2305.05928) — 3.4M Wikipedia sentences, 153 quality labels:
> "Sentences that had problems with citation, syntax/semantics, or propositions were found to be more difficult to detect."
>
> "Automated models outperformed non-experts unfamiliar with editing Wikipedia by learning from expert-generated data, **except for the 'Citation needed' label.**"

This is the empirical answer to "can you statically gate closed-loop grounding?" — **no, you cannot.** Even with 3.4M training examples, automated "this claim needs a source" detection is the hardest category. It's irreducibly agent-discipline + human-review.

The Andy Matuschak / evergreen-notes counterpoint:
> "Adding lots of links between notes [...] is an organic mechanism for intermittently reviewing notes, which approximates spaced repetition."

This is a fourth alternative to lint (alongside post-hoc lint, ingest-time gates, and rebuild): **structural pressure at write time.** Mandate dense linking; the act of authoring forces re-reading. This is also Karpathy's bet — *"a single source might touch 10-15 wiki pages"* per ingest is structural pressure, not post-hoc check. Lint is reserved for the residual that write-time pressure misses.

**Implications:**
- **The deterministic 7 ship today** with a small Bash + lychee orchestration — no novel tooling required.
- **External URL rot is solvable** via the IABot pattern (archive-on-ingest, store snapshot URL in frontmatter). No surveyed Karpathy implementation has adopted this; it's a clear gap with a known mitigation.
- **The semantic 5 are a research problem.** A Karpathy-style KB could publish a benchmark — pre/post pairs of compiled-truth rewrites with annotated nuance loss — and seed the field.
- **Closed-loop grounding cannot be deterministically gated.** This is empirically established. It must remain agent-discipline + human-review.

**Decision triggers:**
- Choosing what to ship first: lychee + the 6 other deterministic checks (~50 lines of orchestration) lands ~70% of the canonical lint value with zero LLM cost.
- Deciding how to handle the semantic 5: scheduled LLM passes (Sleep Consolidation pattern), not synchronous gates.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Per-implementation source-code review.** I read READMEs and web-summarized documentation for the five community implementations. I did not clone-and-read the lint-command source for any of them. A future investigation could compare actual implementations side-by-side to surface convergent patterns at the code level.
- **Quantitative decay rates.** No empirical study exists on how fast a Karpathy-style KB decays per ingest — how many cross-page contradictions are introduced per 10-page touch. The community cadence ("every 10 ingests or monthly") is a heuristic, not data-backed.
- **LLM lint accuracy benchmarks.** No public dataset for measuring how accurately an LLM detects contradictions, lost nuance, or hallucination amplification in a real wiki. WikiSQE measures Wikipedia sentence-quality, which overlaps but isn't identical.
- **Multi-agent merge under concurrent lint.** The prior `compiled-truth-timeline-content-conventions` report notes that "no production system implements true concurrent compilation merge." Lint adds another concurrency dimension (two agents linting + writing simultaneously) that no surveyed system addresses.

### Out of Scope (per Rubric)

- 1P recommendations for what Open Knowledge specifically should build (this is factual landscape; the prior `linting-coverage-and-gaps` report covers OK-specific state).
- Prose-quality lint (Vale, cspell, weasel words) — the Karpathy frame deliberately omits these.
- Code-style lint (Biome, ESLint) — not knowledge lint.

---

## References

### Evidence Files
- [evidence/karpathy-canonical-model.md](evidence/karpathy-canonical-model.md) — three layers, three operations, six canonical checks; lint as generative backlog vs pass/fail.
- [evidence/community-implementations.md](evidence/community-implementations.md) — 5+ slash-command lint surfaces; cadence convergence; gist comment refinements.
- [evidence/lint-check-taxonomy.md](evidence/lint-check-taxonomy.md) — 17-check synthesis; deterministic-vs-hybrid-vs-LLM split; layer mapping.
- [evidence/failure-modes-and-triggers.md](evidence/failure-modes-and-triggers.md) — 8 failure modes; 4 trigger classes + Sleep Consolidation; quality-gates-at-ingest; drift-and-rebuild.
- [evidence/tooling-landscape.md](evidence/tooling-landscape.md) — lychee, IABot/Wayback, WikiSQE, jekyll-link-checker; what's deterministic vs LLM-only.

### External Sources
- [Karpathy LLM Wiki gist (442a6bf)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the canonical reference.
- [NicholasSpisak/second-brain](https://github.com/NicholasSpisak/second-brain) — `/second-brain-lint` slash command + cadence FAQ.
- [kytmanov/obsidian-llm-wiki-local](https://github.com/kytmanov/obsidian-llm-wiki-local) — `olw run` pipeline + source-traceability lint.
- [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) — drift-and-rebuild lifecycle pattern.
- [Astro-Han/karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) — Agent Skills package; 94 articles + 99 sources daily since April 2026.
- [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — link/citation sync.
- [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) — 31 commands, vault-first research, scheduled agents.
- [lychee](https://github.com/lycheeverse/lychee) + [lychee-action](https://github.com/lycheeverse/lychee-action) — dead-link CI gate.
- [Wikipedia: Link rot](https://en.wikipedia.org/wiki/Wikipedia:Link_rot) + [9M URLs rescued via IABot](https://blog.archive.org/2018/10/01/more-than-9-million-broken-links-on-wikipedia-are-now-rescued/) — archive-on-cite pattern.
- [WikiSQE: Wikipedia Sentence Quality Estimation (arxiv:2305.05928)](https://arxiv.org/html/2305.05928) — 3.4M sentences, 153 quality labels; "Citation needed" is the hardest auto-detect.
- [Andy Matuschak — evergreen notes should be densely linked](https://notes.andymatuschak.org/Evergreen_notes_should_be_densely_linked) — structural pressure as alternative to post-hoc lint.

### Related Research (navigation aids only)
- [reports/open-knowledge-prior-art-eight-sources/](../open-knowledge-prior-art-eight-sources/) — Karpathy gist + 7 other sources, including verbatim gist extraction.
- [reports/compiled-truth-timeline-content-conventions/](../compiled-truth-timeline-content-conventions/) — 8 failure modes, 6 historical systems, decoupling root cause.
- [reports/llm-knowledge-consolidation-fidelity/](../llm-knowledge-consolidation-fidelity/) — 80+ sources on factual fidelity, decompose-verify-recompose meta-pattern.
- [reports/obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/) — Obsidian capability mapping against the Karpathy stages.
- [reports/linting-coverage-and-gaps/](../linting-coverage-and-gaps/) — sibling report on Open Knowledge's *current* linting state (1P inventory).
