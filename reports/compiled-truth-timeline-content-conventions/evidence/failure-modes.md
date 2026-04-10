# Evidence: Failure Modes (D5)

**Dimension:** What goes wrong with the compiled truth + timeline pattern?
**Date:** 2026-04-07
**Sources:** GBrain spec, ByteRover paper, event sourcing literature, LLM memory research, Wikipedia policies, Zettelkasten analysis

---

## Findings

### Finding: Eight distinct failure modes identified across systems
**Confidence:** CONFIRMED
**Evidence:**

1. **Stale compiled truth** — Timeline advances but compiled truth not recompiled. GBrain's maintain skill explicitly detects this: "Flag pages where the State section hasn't been updated but timeline has new entries." Event sourcing materialized views have the same issue.

2. **Lost nuance in rewrites** — LLM compresses during rewrite, dropping caveats and conditions. Research on iterative LLM summarization confirms: "iterative summarization can lead to accumulation of errors and loss of nuanced information." Confidence levels stripped in compression (low-confidence becomes assertion).

3. **Unbounded timeline growth** — Append-only by design, no compaction. Event sourcing practitioners recognize this: "processing a long chain of events can be resource-intensive." Mitigated by snapshot strategy.

4. **Conflicting rewrites** — Two agents synthesize simultaneously from same base version, last-writer-wins. Multi-agent memory research confirms: "agents can arrive at incompatible conclusions about the same fact and attempt to write conflicting entries."

5. **Circular compilation** — Compiled truth used as input to its own recompilation. LLM self-reflection research found agents that "rely on prior self-generated content as ground truth become unable to distinguish their own outputs from external evidence."

6. **Hallucination amplification** — Error in compiled truth reinforced through subsequent compilations. "A single incorrect reflection in a short-lived agent causes limited damage; the same incorrect reflection persisting in a long-running production agent can be catastrophic."

7. **Over-confident summaries** — Epistemic qualifiers stripped in favor of definitive statements. "Source A says X, Source B says Y" becomes "X" after compilation.

8. **Orphaned timelines** — After major rewrite, historical entries no longer relate to current compiled truth. Future compilation may incorrectly re-introduce abandoned framings.

### Finding: The canonical failure is compiled truth decoupling from its evidence base
**Confidence:** CONFIRMED
**Evidence:** Across all six historical systems surveyed (NIE, PDB, ICD 203, ACH, Wikipedia, Zettelkasten), the critical failure mode is the same: the compiled zone gets decoupled from its evidence zone — through time pressure (NIE), format constraints (PDB), hidden synthesis (Wikipedia), or stale chains (Zettelkasten). The compiled truth becomes unauditable.

### Finding: GBrain's maintain skill is the only system with explicit staleness detection
**Confidence:** CONFIRMED
**Evidence:** GBrain: "check if compiled_truth references dates > 6 months old without newer timeline entries." ByteRover's AKL provides automatic importance decay and maturity tier demotion but doesn't specifically detect compiled-truth staleness.

---

## Gaps / follow-ups

- No quantitative data on how often staleness occurs in practice
- No system provides automated detection of "lost nuance" — this requires semantic comparison between pre- and post-rewrite compiled truth
