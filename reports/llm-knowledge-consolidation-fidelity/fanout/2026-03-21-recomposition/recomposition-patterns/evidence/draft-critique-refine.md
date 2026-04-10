---
title: Draft-Critique-Refine Strategies for Recomposition
type: evidence
date: 2026-03-21
tags: [self-refine, prompt-chaining, iterative-refinement, multi-pass]
---

# Draft-Critique-Refine for Recomposition

## Self-Refine (Madaan et al., 2023)

Iterative refinement where a single LLM generates output, provides feedback, and refines — in a FEEDBACK → REFINE → FEEDBACK loop. No supervised training data or reinforcement learning required.

### Key Results
- Outputs preferred by humans and automatic metrics over one-step generation
- ~20% absolute improvement in task performance across 7 tasks
- Works across dialog response generation, mathematical reasoning, code optimization

- **Source**: Madaan et al. (2023). "Self-Refine: Iterative Refinement with Self-Feedback." NeurIPS 2023. https://arxiv.org/abs/2303.17651
- **Code**: https://github.com/madaan/self-refine

**Relevance**: The FEEDBACK → REFINE loop is directly applicable to recomposition critique. The critique step should focus on: (1) claim coverage — are all input claims represented? (2) faithfulness — does the prose add unsupported claims? (3) nuance preservation — are hedges/qualifiers maintained?

## Prompt Chaining vs Stepwise Prompting (ACL 2024)

Controlled comparison of prompt chaining (separate draft → critique → refine prompts) versus stepwise prompting (single prompt combining all three phases).

### Key Findings
- Prompt chaining achieved **77 out of 100 wins** vs stepwise
- Initial drafts from chaining performed as well as final drafts from stepwise
- Stepwise produces **"simulated refinement"** — the LLM generates deliberate flaws to demonstrate self-correction
- Stepwise critiques had higher precision/recall but paradoxically didn't improve output
- The simulated refinement problem means single-prompt self-correction is often theatrical

- **Source**: Jiang et al. (2024). "Prompt Chaining or Stepwise Prompt? Refinement in Text Summarization." ACL Findings 2024. https://aclanthology.org/2024.findings-acl.449/

**Relevance**: Critical finding for /consolidate — recomposition MUST use separate prompts for draft and critique, not a single "write and self-correct" prompt. The simulated refinement problem means single-prompt approaches create artificial errors.

## Iteration Depth: The Diminishing Returns Problem

Multiple sources confirm that refinement quality degrades after 2-3 iterations:
- Progressive refinement yields diminishing returns rapidly
- Each additional pass risks introducing new errors while fixing old ones
- The "Broken Telephone" effect compounds across iterations
- Temperature and prompt constraint reduce but don't eliminate degradation

**Practical recommendation**: Cap recomposition refinement at 2 iterations (draft → critique → single revision). The critique should be a targeted checklist, not open-ended.

## What the Critique Should Focus On

For recomposition specifically, the critique pass should evaluate:

1. **Coverage**: Is every input claim represented in the output? (Checklist-style)
2. **Faithfulness**: Does the output introduce any claims not in the input set?
3. **Nuance**: Are qualifiers, hedges, and uncertainty markers preserved?
4. **Attribution**: Are sources correctly linked to claims?
5. **Coherence**: Do transitions between claim-clusters read naturally?
6. **Proportionality**: Does emphasis match the density/importance of input claims?

These map to measurable criteria, unlike vague "improve the writing" prompts.
