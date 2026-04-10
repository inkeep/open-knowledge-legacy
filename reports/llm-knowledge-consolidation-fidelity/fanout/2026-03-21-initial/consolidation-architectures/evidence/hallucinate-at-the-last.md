---
title: "Hallucinate at the Last in Long Response Generation"
source_type: academic_paper
url: https://arxiv.org/abs/2505.15291
authors: Multiple
year: 2025
relevance: Empirical evidence for positional hallucination bias — faithfulness degrades toward end of long outputs
---

## Summary

Demonstrates a consistent pattern across models: faithfulness scores decline significantly toward the end of long summaries, with specific attention mechanism explanations.

## Key Empirical Findings

- Models (Llama, Gemma) show faithfulness dropping below 0.75 in final sections
- Effect intensifies as summary length increases (~800 words shows pronounced degradation)
- Pattern persists across Wikipedia, arXiv, PubMed, GovReport datasets (not domain-specific)
- Persists across decoding strategies (temperature, top-k, entropy-based)

## Sensitivity Metric

Outputs divided into five bins:
- Most models (except Qwen) show negative faithfulness trajectories
- Stable/improving early sections → sharp drops in final fifth
- One model exceeded sensitivity score of 10 (substantial end-bias)
- **Exception**: Qwen maintained consistent faithfulness (attributed to sliding window attention)

## Root Causes

### Attention Dynamics
- Llama allocated ~3x more attention to final sentences vs earlier ones
- Excessive self-attention to generated tokens rather than source material correlates with hallucination increases

### Structural vs Mechanical
- Human summaries recover faithfulness toward the end; model outputs don't
- Rules out summarization structure as sole cause — it's a model-level issue

## Mitigations

**BooookScore chunking approach** (chunk input → generate partial summaries independently → merge):
- Achieved sensitivity near zero
- Maintained faithfulness throughout including final sections
- Workaround via circumventing direct long-context generation

## Validation

Human evaluation: 94.8% inter-annotator agreement across 543 atomic facts.
