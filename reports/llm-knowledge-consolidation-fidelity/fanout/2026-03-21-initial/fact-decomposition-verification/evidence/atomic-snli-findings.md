---
title: "Atomic-SNLI: Fine-Grained NLI Performance Gap"
source_type: academic_paper
url: "https://arxiv.org/abs/2601.06528"
authors: "Atomic-SNLI authors"
venue: "arXiv preprint, January 2025"
accessed: 2026-03-21
relevance: "Models perform worse on atomic vs sentence-level inference — implications for claim-level verification accuracy"
---

# Atomic-SNLI: Fine-Grained NLI through Atomic Fact Decomposition

## Key Finding
Models perform substantially worse on atomic-level inference compared to sentence-level tasks. The conventional assumption that "a hypothesis is entailed only when all its atomic facts are entailed" fails in practice due to models' poor fine-grained reasoning.

## Dataset Construction

### Decomposition Statistics
From SNLI test set: 9,824 valid hypotheses extracted
- 89.2% (8,767) contain only a single atomic fact
- 0.3% (27) contain 4 or more atomic facts

### Label-Specific Generation

**Entailment pairs**: Direct automatic pairing from decomposed facts, filtered using NLI model with confidence threshold τₑ > 0.5.

**Neutral pairs**: Hybrid approach — direct filtering + BM25 retrieval for lexically similar atomic facts from other instances, re-ranked via cross-encoder (τₙ > 0.5).

**Contradiction pairs**: Direct extraction + LLM-generated (Qwen3-32B) minimally altered versions that contradict while preserving grammaticality, validated by ensemble NLI models.

### Scale
Expands from 9,824 sentence-level examples to 625,281 training pairs through decomposition and enrichment.

## Performance Gap

DeBERTa-v3-base:
- Sentence-level accuracy: 92.38%
- Atomic-level accuracy: 91.65%
- Gap widens significantly for multi-fact hypotheses

### Multi-Fact Improvements After Fine-Tuning on Atomic-SNLI
- 2-fact cases: +1.48 to +1.71% accuracy
- 3-fact cases: +7.38 to +10.07% accuracy
- 4-fact cases: Performance degrades (data sparsity — only 25 test instances)

## Interpretability Benefit
Atomic-level analysis reveals that overall contradiction judgment stems from a single critical conflict, while other components are correctly identified as entailed or neutral — providing transparent reasoning.

## Implications for Consolidation

1. **Verification at atomic level is harder than sentence level** — plan for lower accuracy when verifying individual atomic claims
2. **Specialized fine-tuning helps significantly** — models trained on atomic-level data close the performance gap
3. **Multi-fact claims require special attention** — verification accuracy drops sharply as claim complexity increases
4. **Interpretability advantage**: atomic decomposition enables identifying exactly which sub-claim is problematic, rather than flagging entire statements
5. **For consolidation verification**: decompose both source and output into atomic facts, then verify pairwise — but expect ~1-8% accuracy drop vs sentence-level verification
