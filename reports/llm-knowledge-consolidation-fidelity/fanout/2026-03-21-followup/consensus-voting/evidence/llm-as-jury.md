---
title: LLM-as-Jury Patterns and Ensemble Disagreement
type: evidence
sources:
  - title: "Replacing Judges with Juries: Evaluating LLM Generations with a Panel of Diverse Models"
    authors: "Pat Verga, Sebastian Hofstätter, Sophia Althammer, Yixuan Su, Aleksandra Piktus, et al."
    venue: "arXiv 2404.18796, Cohere"
    url: "https://arxiv.org/abs/2404.18796"
  - title: "A Survey on LLM-as-a-Judge"
    venue: "arXiv 2411.15594"
    url: "https://arxiv.org/abs/2411.15594"
  - title: "Multi-Agent Verification: Scaling Test-Time Compute with Multiple Verifiers"
    authors: "Shalev Lifshitz, Sheila A. McIlraith, Yilun Du"
    venue: "arXiv 2502.20379"
    url: "https://arxiv.org/abs/2502.20379"
---

## Panel of LLM Evaluators — PoLL (Verga et al., 2024)

### Method
Ensemble of three smaller LLM-evaluators from disparate model families:
- Command R (35B, Cohere)
- Claude Haiku (Anthropic)
- GPT-3.5 (OpenAI)

Each model independently scores outputs. Aggregation methods:
- **Max voting** for binary judgments (all must agree for correctness)
- **Average pooling** for scalar scores (1-5 range)

### Quantitative Results vs. Single GPT-4 Judge

| Benchmark | PoLL (κ) | GPT-4 (κ) |
|-----------|----------|-----------|
| Natural Questions | 0.763 | 0.627 |
| TriviaQA | 0.906 | 0.841 |
| HotpotQA | 0.867 | 0.830 |

Chatbot Arena Pearson correlation: PoLL 0.917 vs GPT-4 0.817

### Cost and Bias
- **7-8x cheaper** than single GPT-4 judge
- Standard deviation across model evaluations: PoLL 2.2 vs GPT-3.5 alone 6.1
- Individual judges show intra-model bias (highest positive delta when judged by self)
- PoLL mitigates self-preference bias through heterogeneous composition

### Key Insight for /consolidate
"There is not a single 'best' judge across all settings, while PoLL performs well consistently." Model diversity is the mechanism — not model size.

## Multi-Agent Verification — BoN-MAV (Lifshitz et al., 2025)

### Algorithm
1. Sample n candidate outputs from generator LLM
2. Collect binary True/False approvals from m aspect verifiers
3. Select output with most approvals (sum of binary scores)

### Aspect Verifier Construction
20 total verifiers, varying across three dimensions:
- **Base LLM**: GPT-4o-mini or Gemini-1.5-Flash
- **Aspects**: Mathematical correctness, logical soundness, factuality, unit conversions, general correctness, domain knowledge
- **Strategies**: Direct approval, step-by-step verification, solution rephrasing, edge case checking, common mistake identification

### Quantitative Results
| Benchmark | BoN-MAV | Self-Consistency | Reward Model |
|-----------|---------|-----------------|--------------|
| MATH (Gemini Flash) | 66.0% | 59.0% | 61.7% |

At n=256 candidates: BoN-MAV reached 69% vs baselines plateauing at ~61%.

### Weak-to-Strong Generalization
Using weaker verifiers on stronger generators:
- GPT-4o on MATH: 76.3% (BoN-MAV) vs 68.3% (pass@1)
- Same-model self-improvement: GPT-4o-mini +7% on MATH, +8% on GPQA

### Scaling Properties
- Gains of up to 10% for large LLMs, up to 20% for small ones when scaling verifiers from 0 to full domain-specific sets
- Demonstrates stronger scaling patterns than self-consistency and reward model verification

## Disagreement as Signal

From the LLM-as-jury literature:
- In high-stakes use cases (medical, customer comms), a **single disagreement** can justify blocking output or escalating to human review
- Panels smooth borderline decisions where single models flip
- Jury expertise is context-dependent — static averaging fails because reliability changes based on the specific text being evaluated
- MAJ-EVAL framework emphasizes multi-dimensional human-like evaluation rather than single-score aggregation
