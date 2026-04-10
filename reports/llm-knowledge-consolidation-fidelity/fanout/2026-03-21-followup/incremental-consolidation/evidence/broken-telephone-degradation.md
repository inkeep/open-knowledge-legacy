---
title: "LLM as Broken Telephone: Empirical Distortion in Iterative Generation"
source_type: academic_paper
url: https://arxiv.org/abs/2502.20258
accessed: 2026-03-21
relevance: Direct empirical evidence that sequential LLM refinement degrades quality; quantifies the core risk in refine-chain incremental consolidation
---

# LLM as a Broken Telephone: Iterative Generation Distorts Information

## Source
"LLM as a Broken Telephone: Iterative Generation Distorts Information." ACL 2025. arXiv:2502.20258.

## Key Findings

1. **Distortion accumulates progressively** with each iteration — the longer the chain, the more divergence from original source
2. **Rate of degradation** is influenced by:
   - Language/domain familiarity of the model (weaker training signal = faster degradation)
   - Chain complexity (more nodes = faster degradation)
3. **Degradation is "inevitable"** but can be partially mitigated via anchor-based prompting that keeps original text in context
4. The effect is particularly strong for information types the model has weaker training signal on

## Recursive Dialogue Memory (arXiv:2308.15022) — Complementary Finding

Rolling summary pattern: M_i = LLM(S_i, M_{i-1}, P_m)

Manual evaluation on 100 dialogue samples found:
- Fabricated facts: 2.7% of content
- Incorrect relationships: 3.2%
- Missing details: 3.9%
- Total inaccuracy: under 10%

**Critical finding**: Incorrect information does not compound at a catastrophic rate. The bounded output (20-sentence cap) acts as a regularizer that prevents runaway error accumulation.

## Practical Implication

For incremental consolidation, pure sequential refinement (refine chain over N documents) is not viable for large N. But bounded, structured output can cap degradation. The solution: use structured claims rather than free-text summaries, so that each incremental step operates on discrete units rather than rewriting prose.

## Refine Chain Quality Benchmarks (LangChain)

| Chain Type | Coherence | Relevance | Speed | Scale |
|---|---|---|---|---|
| Stuff | 8/10 | 9/10 | 5 sec | ~4K tokens max |
| Map-Reduce | 6/10 | 7/10 | 28 sec | Unlimited |
| Refine | 9/10 | 8/10 | 92 sec | ~50K tokens |

Refine achieves highest coherence but suffers from early-document bias — the first document anchors the frame disproportionately.
