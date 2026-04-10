---
title: "MiniCheck: Efficient Fact-Checking of LLMs on Grounding Documents"
source_type: academic_paper
url: "https://arxiv.org/abs/2404.10774"
authors: "Liyan Tang, Philippe Laban, Greg Durrett"
venue: "EMNLP 2024"
accessed: 2026-03-21
relevance: "Cost-effective verification engine for checking consolidated output against source documents"
---

# MiniCheck: Architecture and Technical Details

## Overview
MiniCheck shows how to build small fact-checking models with GPT-4-level performance at 400x lower cost, addressing the core task: "Does document D support claim c?"

## Model Variants

| Model | Base | Parameters | Balanced Accuracy |
|-------|------|-----------|-------------------|
| MiniCheck-FT5 | Flan-T5-Large | 770M | 74.7% |
| MiniCheck-Dbta | DeBERTa-v3-large | 355M | Lower |
| MiniCheck-Rbta | RoBERTa-large | 355M | Lower |

All use standard cross-entropy loss for binary classification (supported/unsupported).

## Synthetic Training Data Generation

14,395 training instances via two complementary methods:

### Claim-to-Document (C2D) — 7,076 examples
1. Decompose claims into atomic facts using GPT-3.5
2. Generate sentence pairs for each fact via GPT-4 (both sentences required for support)
3. Create supporting documents by synthesizing all sentence pairs
4. Generate non-supporting documents by omitting critical sentences
5. Augment via power sets of atomic facts

### Document-to-Claim (D2C) — 7,319 examples
1. Divide documents into three chunks
2. Summarize each chunk with GPT-4
3. Decompose summaries into atomic facts
4. Create variants by removing sentences and cross-document pairings
5. Use GPT-4 for entailment verification

**Key insight**: The structured generation of realistic yet challenging factual errors teaches models to check each fact and recognize information synthesis across sentences.

## LLM-AggreFact Benchmark
- Unifies 10 datasets covering 13,128 test instances
- Documents from: Wikipedia, interviews, web sources
- Domains: news, dialogue, science, healthcare
- Uses balanced accuracy as evaluation metric

## Performance Comparison

- **MiniCheck-FT5**: 74.7% average balanced accuracy
- **GPT-4**: 75.3% (matched within 0.6%)
- **Prior SOTA (AlignScore)**: ~70.4% (surpassed by 4.3pp)
- **Cost**: ~$0.24 vs ~$107 for GPT-4 on test set (400x cheaper)

## Fact-Checking Process
- Binary classification: 1 (supported) or 0 (unsupported)
- Sentence-level evaluation without context decomposition
- Takes maximum score across multiple documents per sentence
- Threshold at t=0.5

## Implications for Consolidation
- Ideal as a post-consolidation verification step: check each sentence in output against source documents
- 400x cost reduction vs GPT-4 makes it practical for checking every claim
- Binary output integrates cleanly with claim-level tracking
- Can verify against multiple source documents (takes max score)
- Training approach (synthetic data from GPT-4) is replicable for domain-specific fine-tuning

## GitHub
https://github.com/Liyan06/MiniCheck
