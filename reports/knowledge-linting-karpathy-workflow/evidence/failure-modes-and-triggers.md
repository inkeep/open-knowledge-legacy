# Evidence: Failure Modes & When-To-Lint Triggers

**Dimension:** What goes wrong with a Karpathy-style KB if lint isn't run, and what events should trigger lint
**Date:** 2026-04-27
**Sources:** `compiled-truth-timeline-content-conventions/` (this repo) failure-modes evidence; community implementation cadence guidance; Karpathy gist; ByteRover paper

---

## Findings

### Finding: All KB failure modes trace to one root cause — *compiled truth decoupling from its evidence base*
**Confidence:** CONFIRMED
**Evidence:** From this repo's `compiled-truth-timeline-content-conventions/evidence/failure-modes.md`:

> "Across all six historical systems surveyed (NIE, PDB, ICD 203, ACH, Wikipedia, Zettelkasten), the critical failure mode is the same: the compiled zone gets decoupled from its evidence zone — through time pressure (NIE), format constraints (PDB), hidden synthesis (Wikipedia), or stale chains (Zettelkasten). The compiled truth becomes unauditable."

**Implications:** Knowledge linting is fundamentally about **maintaining the chain from claim → evidence → source**. Every concrete check is a different probe of that chain.

### Finding: Eight specific failure modes are documented across systems
**Confidence:** CONFIRMED
**Evidence:** From `compiled-truth-timeline-content-conventions/evidence/failure-modes.md` (verbatim, this repo):

| # | Failure | Mechanism |
|---|---|---|
| 1 | **Stale compiled truth** | Timeline advances but compiled truth not recompiled |
| 2 | **Lost nuance in rewrites** | LLM compresses during rewrite, dropping caveats and conditions |
| 3 | **Unbounded timeline growth** | Append-only by design, no compaction |
| 4 | **Conflicting rewrites** | Two agents synthesize from same base version, last-writer-wins |
| 5 | **Circular compilation** | Compiled truth used as input to its own recompilation |
| 6 | **Hallucination amplification** | Error in compiled truth reinforced through subsequent compilations |
| 7 | **Over-confident summaries** | Epistemic qualifiers stripped — "Source A says X" → "X" |
| 8 | **Orphaned timelines** | After major rewrite, historical entries no longer relate to current compiled truth |

**Implications:**
- **Failures 1, 5, 6, 8** are detectable by *temporal* / *graph* checks (mtime drift, citation-back, claim-traceability).
- **Failures 2, 3, 7** are **only** detectable by semantic comparison (LLM-required).
- **Failure 4** is a CRDT / merge concern — solved by infrastructure (single-writer or version-CAS), not by lint.

### Finding: Three trigger classes determine *when* to lint
**Confidence:** CONFIRMED
**Evidence:**

1. **Activity-based** — every N ingests / writes:
   > NicholasSpisak/second-brain README: "After every 10 ingests."
   > Karpathy gist: "A single source might touch 10-15 wiki pages."
   > Implication: lint after each ~10× compilation cycle (= ~100-150 page touches).

2. **Time-based** — at least monthly:
   > NicholasSpisak/second-brain: "Or monthly — whichever comes first."
   > Mitigates the case where the KB is read-heavy / write-light and activity-based triggers don't fire.

3. **Use-based** — before downstream consumption:
   > NicholasSpisak/second-brain: "Before any major query or synthesis work."
   > Karpathy gist: queries can produce new pages; querying stale state corrupts the new pages too.

ByteRover's **AKL importance decay** adds a fourth, **continuous** trigger:
   > Per `open-knowledge-prior-art-eight-sources/evidence/d3-byterover-paper.md`: "0.995^dt per day" decay; entries demote `core` → `validated` → `draft` automatically without explicit lint runs.

**Implications:** A robust lint cadence interleaves all four:
- Activity (every 10 ingests) catches recent decay.
- Time (monthly) catches slow decay in low-activity periods.
- Use (before query) prevents query-time corruption.
- Continuous decay surfaces *graceful degradation* rather than binary stale/fresh.

### Finding: Sleep Consolidation is an emerging fifth trigger
**Confidence:** CONFIRMED
**Evidence:** Karpathy gist comment thread (web fetch):

> "DPC Messenger introduced 'Sleep Consolidation' — agents periodically reviewing archives to identify contradictions, propose refinements, and distinguish weak from important memories. This parallels human cognitive consolidation."

**Implications:** Background scheduled lint passes (overnight cron, or session-end) get the LLM doing *deep* lint when the user isn't waiting. Lighter activity-based lint runs cover the synchronous path; sleep consolidation covers the deeper semantic checks.

### Finding: Quality-gates-at-ingest are a *preventive* alternative to post-hoc lint
**Confidence:** CONFIRMED
**Evidence:** Karpathy gist comment (7xuanlu's Origin):

> "7xuanlu's Origin emphasized **quality gates before storage** matter more than retrieval improvements. Not everything belongs in the wiki; filtering noise at ingestion beats later optimization."

**Implications:** Many failure modes can be prevented by ingest-time checks rather than detected by lint:
- Source duplication → check existing `raw/` before ingest.
- Low-quality source → reject before compilation.
- Missing source metadata → reject ingest if `source_url` / `date` / `author` absent.
This shifts lint left — instead of "fix it after the wiki rots," "don't let the bad input in."

### Finding: Drift-and-rebuild is the lifecycle alternative to incremental lint
**Confidence:** CONFIRMED
**Evidence:** Ar9av/obsidian-wiki:

> "When the wiki drifts too far from your sources, you can archive the whole thing (timestamped snapshot, nothing lost) and rebuild from scratch."

This is only safe because `raw/` is immutable — the wiki is purely derived. A full rebuild is equivalent to "re-execute all ingests in order" — assuming the LLM is deterministic enough to reproduce equivalent compilation, which it isn't perfectly, but is *mostly*.

**Implications:** Past a certain decay threshold, **rebuild is cheaper than lint**. Open question: at what decay level does this flip? No quantitative data exists. Heuristic: when more than ~30% of pages have lint findings, rebuild is likely cheaper than fix-in-place.

---

## Gaps / follow-ups

- No quantitative data on **how fast** decay accumulates per ingest. Anecdotally: each ingest touches 10-15 pages, but how many cross-page contradictions does it introduce per ingest? Empirical study would shape activity-based thresholds.
- No surveyed system implements **per-page decay scoring** that's user-visible. ByteRover's AKL has the infra but its weights are zero. A visible "this page hasn't been touched since N ingests ago" UI signal doesn't exist anywhere.
