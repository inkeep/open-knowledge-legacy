---
title: Verification Pass Diminishing Returns
type: evidence
sources:
  - url: https://dev.to/yannick555/iterative-review-fix-loops-remove-llm-hallucinations-and-there-is-a-formula-for-it-4ee8
    title: "Iterative review-fix loops remove LLM hallucinations, and there is a formula for it"
    year: 2025
  - url: https://arxiv.org/abs/2303.17651
    title: "Self-Refine: Iterative Refinement with Self-Feedback"
    venue: NeurIPS 2023
  - url: https://arxiv.org/abs/2404.10774
    title: "MiniCheck: Efficient Fact-Checking of LLMs on Grounding Documents"
    venue: EMNLP 2024
  - url: https://aclanthology.org/2024.emnlp-main.499/
    title: "MiniCheck EMNLP 2024"
---

# Verification Pass Diminishing Returns

## Mathematical Model (Yang et al. 2025, EMNLP)

Core convergence formula for iterative review-fix loops:

```
Acc_t = Acc_{t-1} * CL + (1 - Acc_{t-1}) * CS
```

Closed-form solution:
```
Acc_t = Upp - α^t * (Upp - Acc_0)
```

Where:
- CL (Confidence Level) = probability model preserves correct content
- CS (Critique Score) = probability model fixes an error
- Upp = CS / (1 - CL + CS) = theoretical accuracy ceiling
- α = CL - CS = convergence rate

## Quantitative Diminishing Returns (CL=0.9, CS=0.4)

| Round | Share of Total Improvement | Cumulative |
|-------|---------------------------|------------|
| 1 | 50% | 50% |
| 2 | 25% | 75% |
| 3 | 12.5% | 87.5% |
| 4 | 6.25% | 93.75% |
| 5 | 3.125% | 96.875% |

**Critical finding:** Rounds 1-2 capture 75% of maximum possible improvement.

## Error Survival Rates (CS=0.4 per pass)

- After 1 pass: 60% of errors survive
- After 2 passes: 36% survive
- After 3 passes: ~22% survive

## Accuracy Ceiling

The ceiling Upp depends entirely on model capability:
- With CL=0.9, CS=0.4: ceiling = 0.80 (20% errors are blind spots)
- More capable models raise both CL and CS, shifting the ceiling higher
- Beyond the ceiling, additional passes yield zero improvement

## Self-Refine Results (Madaan et al. 2023)

- Average ~20% absolute improvement across 7 tasks vs single-pass generation
- Task-specific gains range from 5% to 40%
- GPT-4 + Self-Refine outperforms GPT-3.5 + Self-Refine across all tasks
- Even GPT-4 benefits from refinement (0.7% on Math Reasoning with oracle feedback)

## MiniCheck Tiered Verification Economics

- MiniCheck-FT5 (770M params): GPT-4-level accuracy, 400x lower cost
- Cost: $0.8/GPU-hr on 13K test set
- GPT-4 equivalent: ~$107 on same test set (400x ratio)
- Implication: ~80% of claims can be verified cheaply; only ambiguous claims need LLM-as-judge escalation

## Practical Recommendations

- **2 passes** for standard consolidation (captures 75% of improvement)
- **3 passes** for high-stakes content (captures 87.5%)
- **>3 passes** only justified for safety-critical or published content
- Tiered verification (cheap model first, expensive model for hard cases) is the dominant strategy
