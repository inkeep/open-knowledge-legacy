---
title: "Do Multi-Document Summarization Models Synthesize?"
source_type: academic_paper
url: https://arxiv.org/abs/2301.13844
authors: DeYoung, Martinez, Marshall, Wallace
year: 2024
venue: TACL
relevance: Empirical evidence that MDS models inadequately perform true synthesis — critical failure mode for consolidation
---

## Summary

Tests whether multi-document summarization models actually synthesize cross-document information or merely concatenate/copy. Finds models are oversensitive to input ordering and undersensitive to input composition changes.

## Ordering Sensitivity (Should Be Invariant)

- Synthesis should be order-invariant (critic consensus doesn't change based on review reading order)
- When inputs permuted 100 times, generated summaries exhibited "wide spread in sentiment"
- For systematic reviews: models "flip the report conclusion" based on different input orderings
- This indicates unstable aggregation, not true synthesis

## Composition Sensitivity (Should Be Proportional)

- When ratio of positive/negative reviews changed, models required "large change in input distribution to substantially change sentiment"
- Models "generally undersensitive to changes in their input" compared to human summaries
- Human summaries exhibited near-proportional response to composition shifts

## Model Rankings (R² of Sentiment Correlation)

| Model | R² | Notes |
|-------|-----|-------|
| GPT-4 | 0.808 | Substantially outperformed specialized models |
| PRIMERA | 0.608 | Best fine-tuned model |
| Flan-T5-XL | 0.611 | Close to PRIMERA |
| PlanSum | <0.25 | Specialized for opinion, underperformed |
| AceSum | <0.25 | Specialized for opinion, underperformed |
| Human baseline | 0.697 | |

## Key Implication for Consolidation

Models designed specifically for synthesis (PlanSum, AceSum) underperformed general-purpose models.
GPT-4 achieved Pearson's r of 0.900 — suggesting large general-purpose models may be better synthesizers than specialized architectures.

Current systems inadequately synthesize conflicting evidence — problematic for domains where accurate aggregation determines outcomes.
