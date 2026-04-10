---
title: The Telephone Game Problem - Fidelity Gaps in Decompose-Recompose Cycles
type: evidence
date: 2026-03-21
tags: [telephone-game, fidelity-gap, distortion, iterative-generation, broken-telephone]
---

# The Telephone Game Problem in Recomposition

## LLM as a Broken Telephone (ACL 2025)

Systematic study of information distortion through iterative LLM generation, directly analogous to the decompose→recompose cycle.

### Distortion Types Identified
1. **Semantic drift**: Information progressively deviates from source material
2. **Factual degradation**: Atomic facts lost or altered
3. **Lexical/syntactic changes**: Word-level omissions compound iteratively
4. **Fabrication**: New details emerge that weren't in the original (e.g., "lorry driver" becomes "bus," "$50,000 car" becomes "$50,000 compensation," fabricated "explosion")

### Measured Degradation Rates (FActScore gradients per iteration)
- **Latin script pairs** (EN↔FR, EN↔DE, EN↔NL): -0.004 to -0.011
- **Non-Latin script pairs** (EN↔TH): -0.015 to -0.040
- **Complex chains** (5 languages): -0.038 ± 0.02
- After 100 iterations: factuality collapses to 0.04-0.075 across all chain types

### Mitigation Strategies Tested
1. **Temperature control**: Lower temperatures substantially reduce distortion. Extremely low temperatures (1×10⁻⁶) stabilize outputs after initial iterations
2. **Prompt constraints**: More constrained prompts → higher relevance and factuality preservation
   - Simple prompts: highest distortion
   - Base (moderate): moderate distortion
   - Constrained (detailed preservation instructions): best performance
3. **Model pairing**: Effects are asymmetric — Llama+Mistral reduced Thai distortion but amplified French distortion

### Key Finding for Recomposition
"Rephrasing shows faster degradation than translation" — textual relevance metrics show steeper decline without clear convergence by iteration 100. This means claim→prose→claim round-trips lose information even within a single language.

- **Source**: Mohamed et al. (2025). "LLM as a Broken Telephone: Iterative Generation Distorts Information." ACL 2025. https://arxiv.org/abs/2502.20258
- **Code**: https://github.com/amr-mohamedd/LLM-as-a-Broken-Telephone

## Decomposition Quality Metrics (DecMetrics, 2025)

Three metrics for measuring claim decomposition quality:
- **COMPLETENESS**: NLI-based entailment between merged atomic claims and original
- **CORRECTNESS**: Fraction of atomic claims entailed by original (no fabrication)
- **SEMANTIC ENTROPY**: Cluster diversity to penalize redundant paraphrasing

### Decomposition Failure Modes
1. Missing information (incomplete breakdowns)
2. Hallucinated details (new facts absent from source)
3. Semantic overlap (redundant claims)

DecModel variants achieved 92-94% completeness and 99% correctness. Larger LLMs (Qwen3-32B) showed high diversity but low completeness — more claims but worse coverage.

- **Source**: (2025). "DecMetrics: Structured Claim Decomposition Scoring for Factually Consistent LLM Outputs." https://arxiv.org/abs/2509.04483

## FActScore: Decompose-Then-Verify (EMNLP 2023)

FActScore breaks generation into atomic facts and computes percentage supported by a knowledge source. Two-stage approach: decompose → verify. Automated model estimates FActScore with <2% error rate.

- **Source**: Min et al. (2023). "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.741/
- **Code**: https://github.com/shmsw25/FActScore

## The Empirical Fidelity Gap

No paper has directly measured the full decompose→recompose fidelity gap (source → atomic claims → prose → compare to source). However, combining findings:

1. **Decomposition** loses ~6-8% completeness (DecMetrics finding)
2. **Recomposition** introduces semantic drift proportional to transformation complexity
3. **Single-pass recomposition** (not iterative) minimizes telephone-game effects
4. **Source anchoring** (keeping original text available during generation) dramatically reduces drift

### Estimated Fidelity Budget
- Decomposition: ~92-94% claim coverage
- Deduplication: ~0-2% additional loss (merging related claims may lose nuance)
- Recomposition (single pass, source-anchored): ~95-98% faithfulness
- **Combined pipeline**: ~87-92% end-to-end fidelity

This means ~8-13% information loss is inherent in the decompose-recompose cycle, even with best practices. The key is minimizing the number of transformations and anchoring each step to source material.

## Mitigation Strategies for /consolidate

1. **Minimize transformation depth**: Single-pass recomposition, no iterative rephrasing
2. **Source anchoring**: Include original source excerpts in the recomposition prompt
3. **Low temperature**: Use temperature 0-0.3 for recomposition generation
4. **Constrained prompts**: Explicit preservation instructions in the recomposition prompt
5. **Post-hoc verification**: FActScore-style decompose-verify on the recomposed output
6. **Claim checklist**: Provide the claim list as a literal checklist the model must address
