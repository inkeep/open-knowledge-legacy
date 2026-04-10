---
title: "AFEV: Iterative Atomic Fact Extraction and Verification"
source_type: academic_paper
url: "https://arxiv.org/abs/2506.07446"
authors: "Fact in Fragments authors"
venue: "Expert Systems with Applications (ScienceDirect), 2025"
accessed: 2026-03-21
relevance: "Iterative extraction that mitigates error accumulation — key pattern for consolidation decomposition"
---

# AFEV: Atomic Fact Extraction and Verification Framework

## Problem: Static Decomposition Failures

Static (one-shot) decomposition strategies fail because they:
- Prioritize syntactic fragmentation over contextual understanding
- Cannot adapt to semantic granularity and contextual dependencies
- Amplify error propagation, especially in multi-hop reasoning scenarios
- Lack explicit supervision during decomposition

## Iterative Extraction Mechanics

At each iteration t, AFEV:

1. **Decides continuation**: Assesses whether previously extracted facts F₁:ₜ₋₁ adequately cover the original claim C
2. **Generates next fact**: `Fₜ = Extractor(C, F₁:ₜ₋₁, y₁:ₜ₋₁, r₁:ₜ₋₁)` — conditioned on prior facts, their verification labels (y), and rationales (r)
3. **Verifies the fact**: Retrieves evidence, generates verification label and rationale
4. **Feeds back**: Incorporates verification outcomes to inform subsequent decomposition

### Key Innovation: Feedback Loop
Each extraction benefits from understanding of previously verified facts. Rationales reveal implicit information (entity relationships) that refine subsequent decompositions.

**Example**: Fact2 improves by replacing generic "football club" with specific "FC Barcelona" based on Fact1's verification rationale.

## Three-Stage Architecture

### Stage 1 — Dynamic Atomic Fact Extraction
Iteratively breaks complex claims into manageable atomic facts with coverage assessment at each step.

### Stage 2 — Refined Evidence Retrieval
- Dense retrieval identifies top-k′ candidates via cosine similarity
- Pre-trained reranker filters noise using InfoNCE loss training
- Dynamic instance retrieval selects contextually relevant demonstrations from training data

### Stage 3 — Adaptive Atomic Fact Verification
`yt, rt = Reasoner(Ft, C, Et, At)` where Et = evidence, At = demonstrations
Final aggregation synthesizes individual atomic fact verdicts into overall judgment.

## Performance Results

| Dataset | Metric | AFEV | Previous Best |
|---------|--------|------|---------------|
| LIAR-PLUS | Macro-F1 | 83.12 | 81.46 (VMASK) |
| HOVER | Macro-F1 | 78.76 | 73.69 (VMASK) |
| PolitiHop | Macro-F1 | 57.69 | 55.80 (VMASK) |
| LIAR | F1 | 43.9 | 42.0 (RAFTS) |
| RAWFC | F1 | 60.2 | 57.3 (RAFTS) |

Ablation: iterative extraction outperforms one-shot decomposition (78.74 vs 77.04 accuracy on HOVER).

## Prompting Strategies
- **Dynamic prompts**: Context-specific instructions adapted per atomic fact
- **Few-shot demonstrations**: Dynamically retrieved similar training examples (1-2 per fact)
- **Structured outputs**: Prompts elicit both factuality labels AND rationales simultaneously
- Implementation uses GPT-3.5 for extraction and verification

## Efficiency
- Two-stage retrieval (bi-encoder then cross-encoder) reduces search from O(N) to O(log N)
- 0.94 hours for full HOVER test set with iterative extraction
- Parallel processing across independent claims

## Implications for Consolidation
- The iterative extract-verify loop is directly applicable to source decomposition during consolidation
- Conditioning each extraction on prior verified facts reduces redundancy and improves coherence
- The rationale feedback mechanism could be adapted to propagate provenance information
- Coverage assessment mechanism ensures completeness of decomposition
