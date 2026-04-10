---
title: "JEDI: Extractive vs Abstractive Fact Decomposition"
source_type: academic_paper
url: "https://arxiv.org/abs/2509.18901"
authors: "JEDI authors"
venue: "EMNLP 2025"
accessed: 2026-03-21
relevance: "Extractive decomposition preserves source wording — critical tradeoff for consolidation fidelity"
---

# JEDI: Extractive Fact Decomposition for Interpretable NLI

## Extractive vs Generative Decomposition

### Extractive Approach (JEDI)
- Identifies **spans in the premise** corresponding directly to atomic facts
- Produces explicit pointers to relevant portions of input text
- Enables direct traceability to source
- Reduces hallucination risks inherent in generated facts
- Uses significantly more lightweight encoder architectures

### Generative Approach (FActScore, AFEV, FGLR)
- Generates new natural language statements as atomic facts
- Can normalize and rephrase for consistency
- Risks introducing hallucinated content not in source
- Requires heavier generative models at inference

## JEDI Architecture

Encoder-only model performing joint decomposition + inference in one forward pass:

1. **Global Classification**: Group bilinear layers on [CLS] and [SEP] tokens → neutral/entailed/contradicted
2. **Span Extraction**: Identifies start tokens, then pairs with end tokens using binary classifiers
3. **Span-wise Classification**: Each span evaluated against hypothesis
4. **Logical Reasoning**: Rule-based inference traces predictions to specific spans

## Performance Tradeoffs

| Metric | JEDI (Extractive) | FGLR (Generative) | SLR-NLI |
|--------|-------------------|-------------------|---------|
| ANLI Accuracy | 65.6% | 67.7% | 64.1% |
| HANS Robustness | 76.9% | N/A | ~54.7% |
| Inference Speed | Fast (encoder) | Slow (LLM) | N/A |

**Key finding**: Despite lower in-distribution accuracy, JEDI demonstrates significantly improved out-of-distribution robustness, particularly on adversarial tests. "Robustness improvements may not inherently depend on abstraction via generation, but rather on structured reasoning."

## Training Data: SYRP Corpus
- Synthetic rationales generated via Qwen2.5-32B
- 69% intersection-over-union with manual annotations
- ~1.5 million samples across 8 NLI datasets

## Implications for Consolidation

### Tradeoffs Matrix

| Dimension | Extractive | Abstractive |
|-----------|-----------|-------------|
| Source fidelity | High — preserves exact wording | Medium — may drift from source |
| Hallucination risk | Low — constrained to source spans | Higher — generates new text |
| Cross-source normalization | Poor — different sources use different terms | Good — can unify terminology |
| Deduplication support | Harder — requires semantic matching of spans | Easier — normalized forms compare well |
| Provenance tracking | Trivial — spans point to exact locations | Requires additional metadata |
| Computational cost | Lower (encoder only) | Higher (generative model) |

### Recommendation for Consolidation
A hybrid approach: use extractive decomposition to preserve source fidelity and provenance, then optionally apply lightweight abstractive normalization only for deduplication matching — keeping both the original span reference and normalized form.
