---
title: Evaluation of Recomposition Quality
type: evidence
date: 2026-03-21
tags: [evaluation, coherence, UniEval, DiscoScore, BARTScore, readability]
---

# Evaluation of Recomposition Quality

## Beyond Factual Fidelity: Multi-Dimensional Evaluation

Recomposition quality encompasses: coherence, readability, structure quality, emphasis accuracy, and whether output reads as an original work vs patchwork.

## UniEval (EMNLP 2022)

Unified evaluation framework recasting every dimension as a Boolean QA task. Pre-trained encoder-decoder model produces binary "Yes"/"No" answers normalized to soft scores.

### Dimensions
- **Coherence**: Logical flow and organization
- **Consistency**: Factual alignment with source
- **Fluency**: Grammatical and stylistic quality
- **Relevance**: Topical coverage

### Performance
On SummEval: average Spearman correlation 0.377 (vs BARTScore's 0.305) — 23% improvement.

- **Source**: Zhong et al. (2022). "Towards a Unified Multi-Dimensional Evaluator for Text Generation." EMNLP 2022. https://aclanthology.org/2022.emnlp-main.131.pdf

## DiscoScore (EACL 2023)

Discourse-aware evaluation metric using BERT to model coherence from multiple perspectives, driven by Centering Theory.

### Variants
- **DS_Focus**: Models entity focus transitions
- **DS_SENT**: Models sentence-level discourse relations
- Both variants support Noun and Semantic Entity focus types

### Performance
Surpasses BARTScore by >10 correlation points on average at system-level. Strong correlation with human ratings not only for coherence but also factual consistency.

### Included Metrics
Range of discourse metrics: LC (Lexical Chain), RC, EntityGraph, LexicalGraph.

- **Source**: Zhao & Strube (2023). "DiscoScore: Evaluating Text Generation with BERT and Discourse Coherence." EACL 2023. https://aclanthology.org/2023.eacl-main.278/
- **Code**: https://github.com/AIPHES/DiscoScore

## BARTScore (2021)

Uses BART sequence-to-sequence model to evaluate generated text via weighted log probability. Covers 7 evaluation aspects: informativeness, coherence, factuality, etc. Outperformed existing metrics in 16/22 settings.

Limitation: Weak at system-level evaluation compared to DiscoScore.

- **Source**: Yuan et al. (2021). "BARTScore: Evaluating Generated Text as Text Generation." https://arxiv.org/abs/2106.11520

## Entity-Based Coherence (Barzilay & Lapata)

Entity Grid represents texts as matrices tracking entity transitions (Subject, Object, Other, Absent) across sentences. Coherent texts have characteristic transition patterns. Well-suited for ranking claim orderings.

- **Source**: Barzilay & Lapata (2008). "Modeling Local Coherence: An Entity-Based Approach." *Computational Linguistics*, 34(1). https://direct.mit.edu/coli/article/34/1/1/1969/

## Patchwork Detection

No single metric directly measures whether output "feels" like patchwork vs original writing. Proxy signals:
- **Lexical diversity**: Patchwork text often has inconsistent vocabulary/register
- **Discourse coherence**: Low DiscoScore indicates disjointed transitions
- **Entity consistency**: Entity grid analysis reveals when entities are introduced and dropped abruptly
- **Sentence-level perplexity variance**: Patchwork text shows high variance in per-sentence perplexity (some sentences are direct from sources, others are original bridges)

## Emphasis Accuracy Evaluation

No established metric exists for "emphasis accuracy" — whether the output proportionally represents input claim density. Possible approaches:
1. **Topic proportion comparison**: Topic model both input claims and output; compare topic distributions
2. **Word count allocation**: Compare % of output devoted to each claim cluster vs % of input claims
3. **Claim-level coverage scoring**: For each input claim, measure how prominently it appears in output (mentioned once vs elaborated vs hedged)

## Recommended Evaluation Stack for /consolidate

| Dimension | Metric | Purpose |
|-----------|--------|---------|
| Factual fidelity | FActScore / NLI-based AIS | Are all claims faithfully represented? |
| Coherence | DiscoScore (DS_Focus) | Does the text flow logically? |
| Multi-dimensional | UniEval | Overall quality across dimensions |
| Coverage | Claim-level NLI checklist | Is every input claim present? |
| Attribution | ALCE-style citation recall/precision | Are citations correct? |
| Readability | Flesch-Kincaid / MAUVE | Is the output readable? |
| Emphasis | Topic proportion comparison | Is emphasis proportional? |
