---
title: Emphasis, Proportionality, and Nuance Preservation
type: evidence
date: 2026-03-21
tags: [emphasis, proportionality, nuance, hedging, coverage, salience]
---

# Emphasis, Proportionality, and Nuance Preservation

## Content Selection and Coverage in Multi-Document Summarization

### Principled Content Selection with DPPs (2025)

Uses Determinantal Point Processes (DPP) for content selection in multi-document summarization. Three-step approach: (1) reduce document collections to atomic key points, (2) use DPP to select key points prioritizing diverse content, (3) rewrite to final summary.

Key finding: LLMs exhibit "lost in the middle" phenomenon — unevenly attending to different parts of context, hindering coverage of diverse source material.

- **Source**: Hosking et al. (2025). "Principled Content Selection to Generate Diverse and Personalized Multi-Document Summaries." ACL 2025. https://arxiv.org/abs/2505.21859

**Relevance**: DPPs provide a principled approach to selecting which claims to emphasize when there are too many for the output length. The diversity-promoting property ensures proportional representation.

### Coverage-Based Fairness (2024)

Proposes Equal Coverage metric as alternative to Proportional Representation for evaluating multi-document summarization fairness. Considers redundancy within documents.

- **Source**: (2024). "Coverage-based Fairness in Multi-document Summarization." https://arxiv.org/abs/2412.08795

**Key distinction**:
- **Proportional Representation**: If 5 sources discuss topic A and 1 discusses topic B, give 5x weight to A
- **Equal Coverage**: Account for redundancy — 5 sources may say the same thing about A, so A doesn't deserve 5x weight
- **Importance-weighted**: Some topics are inherently more significant regardless of source count

### LLM Coverage Limitations

Research shows GPT-4 only covers under 40% of diverse information on average when summarizing multiple news articles.

- **Source**: Kim et al. (2024). "Embrace Divergence for Richer Insights: A Multi-document Summarization Benchmark." NAACL 2024. https://aclanthology.org/2024.naacl-long.32/

**Relevance**: Even frontier models systematically under-cover diverse content. Explicit claim tracking is necessary — you cannot rely on the LLM to "naturally" represent all claims proportionally.

## Salience Detection

### PEGASUS-XL with Saliency-Guided Scoring

Saliency-guided scoring for multi-document abstractive summarization, using importance signals to weight content selection.

- **Source**: (2025). "PEGASUS-XL with saliency-guided scoring and long-input encoding for multi-document abstractive summarization." *Scientific Reports*. https://www.nature.com/articles/s41598-025-11062-2

### Maximal Marginal Relevance (MMR)

Classic technique for balancing relevance and diversity in content selection. Applied in multi-document summarization to reduce redundancy while maintaining coverage.

## Nuance and Hedging Preservation

### The Confidence Inflation Problem

LLMs systematically fail to preserve uncertainty language during generation:

- Models use decisive words even when unsure, with a propensity to generate hallucinations expressed with "striking confidence"
- Evaluation of five frontier models (Claude Opus 4.5, GPT-5.2, DeepSeek-V3.2, Qwen3-235B, Kimi-K2) found systematic overconfidence in all models
- "Faithful response uncertainty" is formalized based on the gap between intrinsic confidence and expressed decisiveness

- **Source**: Zhao et al. (2025). "Anthropomimetic Uncertainty: What Verbalized Uncertainty in Language Models is Missing." https://arxiv.org/html/2507.10587v1
- **Source**: (2025). "Humans overrely on overconfident language models, across languages." https://arxiv.org/html/2507.06306
- **Source**: Xiong et al. (2024). "Can Large Language Models Faithfully Express Their Intrinsic Uncertainty in Words?" https://arxiv.org/abs/2405.16908

### Epistemic Marker Instability

Marker confidence shifts significantly under distribution changes. Models struggle to maintain consistent marker rankings across datasets.

- **Source**: (2025). "Revisiting Epistemic Markers in Confidence Estimation." https://arxiv.org/html/2505.24778

### Cross-Linguistic Hedging Challenges

Hedging function is perceived differently across languages — e.g., Japanese speakers more likely to discount uncertainty expressions.

**Relevance to recomposition**: When claims carry hedging (e.g., "preliminary evidence suggests," "in limited studies"), recomposition MUST explicitly preserve these markers. LLMs will naturally inflate confidence during generation. The recomposition prompt should include explicit instructions to preserve original epistemic markers verbatim.

## Practical Proportionality Strategy for /consolidate

1. **Count-based weighting**: Track how many independent sources support each claim cluster
2. **Redundancy discount**: Multiple sources saying the same thing increase confidence but not output space
3. **Importance override**: Some claims are inherently more significant (user can specify priorities)
4. **Explicit allocation**: Map claim clusters to output sections with target word counts before generation
5. **Post-hoc audit**: After generation, verify word-count allocation matches intended proportionality
