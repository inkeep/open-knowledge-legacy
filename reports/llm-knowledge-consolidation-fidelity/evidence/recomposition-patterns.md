---
title: "Recomposition Patterns: Turning Verified Claims into Coherent Documents"
description: "Evidence on techniques for recomposing verified, deduplicated atomic claims into coherent, well-structured prose while maintaining fidelity, nuance, emphasis, and attribution."
created: 2026-03-21
last-updated: 2026-03-21
---

# Recomposition Patterns Evidence

## Core Problem

Recomposition — reconstructing coherent prose from atomic claims — is the least-studied and hardest step in knowledge consolidation pipelines. The closest research paradigm is **data-to-text generation (D2T)**, but claim-to-document imposes a **bidirectional fidelity constraint**: output must be entailed by input claims (no hallucination) AND must entail all input claims (no omission).

No production system (Perplexity, Elicit, Google AI Overviews) attempts deep claim→reconcile→synthesize. They either present per-source extractions, pick winners, or do shallow synthesis with citation anchoring.

## Outline-First Generation

Two complementary lines of evidence:

**WritingPath** (Yang et al., 2024): Five-step metadata → outline → augmented outline → final text. LLM and human evaluators confirmed superior logical fluency, specificity, and coherence over direct generation. [arXiv:2404.13919](https://arxiv.org/abs/2404.13919)

**Planning-augmented generation** (Petrik et al., 2024): +2.5% ROUGE-Lsum and 3.60 win/loss ratio in human evaluation, with wins in organization, relevance, and verifiability. [arXiv:2410.06203](https://arxiv.org/abs/2410.06203)

**PlanGen** (Su et al., 2021): A 140M-parameter model with explicit planning outperformed a 2.8B-parameter T5-3B on data-to-text generation. Planning is architecturally necessary, not optional. [arXiv:2108.13740](https://ar5iv.labs.arxiv.org/html/2108.13740)

## Prompt Chaining vs. Stepwise Refinement

Jiang et al. (ACL Findings 2024): Separate draft → critique → refine achieved **77/100 wins** vs. single-prompt stepwise. Stepwise prompts produce "simulated refinement" — models generate deliberate flaws to demonstrate self-correction. [ACL 2024](https://aclanthology.org/2024.findings-acl.449/)

Self-correction works only when: (a) tasks have decomposable, verifiable sub-parts, (b) reliable external feedback is available, or (c) models are fine-tuned for it (Kamoi et al., TACL 2024). Claim-to-document qualifies under (a) — each claim is independently verifiable. [TACL 2024](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177)

Refinement quality degrades after 2-3 iterations across multiple sources. Cap at one critique pass.

## Nuance Preservation: Confidence Inflation

LLMs systematically fail to preserve uncertainty language. RLHF training inadvertently rewards confident-sounding responses over appropriately hedged ones. When rewriting text, LLMs systematically upgrade confidence markers ("may cause" → "causes").

**MetaFaith** (EMNLP 2025): Metacognitive prompting achieves **61% improvement in faithfulness of uncertainty expression**, 83% win rate over original generations. Black-box, task-agnostic. [arXiv:2505.24858](https://arxiv.org/abs/2505.24858)

**Selective Abstraction** (Goren et al., 2026): Replaces low-confidence claims with higher-confidence, less-specific abstractions. **27.73% improvement in risk-coverage AURC** over simple claim removal. [arXiv:2602.11908](https://arxiv.org/abs/2602.11908)

## The ~8-13% Inherent Information Loss

Combining DecMetrics and Broken Telephone findings:

| Stage | Estimated Fidelity | Source |
|-------|-------------------|--------|
| Decomposition | 92-94% claim coverage | DecMetrics |
| Deduplication | 0-2% additional loss | Merging may lose nuance |
| Recomposition (single pass, anchored) | 95-98% faithfulness | Broken Telephone mitigated |
| **Combined pipeline** | **~87-92%** | Multiplicative |

Rephrasing within a single language shows faster degradation than cross-language translation chains. Source anchoring, low temperature (0-0.3), and constrained prompts are the primary mitigations.

## Coverage Problem

GPT-4 covers only **~40% of diverse information** when summarizing multiple sources without explicit claim tracking (Kim et al., NAACL 2024). [NAACL 2024](https://aclanthology.org/2024.naacl-long.32/)

Models are over-sensitive to input ordering and under-sensitive to input composition — changing the ratio of positive to negative evidence barely changes output (DeYoung et al., TACL 2024). Fix: generate-then-select.

The **Pyramid Method** (Nenkova & Passonneau, HLT-NAACL 2004) provides a weighting model: claims receive weight equal to the number of sources containing them. Top-tier claims first, then fill with lower tiers.

## Structured vs. Prose Output

Format restrictions (JSON, XML) significantly degrade reasoning quality while improving classification (Tam et al., 2024). [arXiv:2408.02442](https://arxiv.org/html/2408.02442v1)

Recommended hybrid approach:
- **Prose** for nuanced arguments, contradictions, uncertainty
- **Tables** for comparisons across sources, quantitative data
- **Lists** for sequential steps, taxonomies
- **Headers** for navigability and structural scaffolding

## Attribution in Recomposed Output

**AIS Framework** (Rashkin et al., 2023): NLG output pertaining to the external world must be verifiable against provided sources. [Comp. Linguistics 49(4)](https://direct.mit.edu/coli/article/49/4/777/116438/)

**ALCE Benchmark** (Gao et al., EMNLP 2023): Even the best models lack complete citation support 50% of the time.

Recommended: inline numerical citations `[n]` per-claim, with post-hoc NLI verification that cited sources actually support attributed claims.

## Cross-Claim Coherence and FiC

**Cross-Document Structure Theory** (Radev, 2000): Taxonomy of cross-document relations — Equivalence, Subsumption, Contradiction, Elaboration, Attribution, Modality. Claims should be classified by CST relationship before recomposition. [ACL/SIGDIAL 2000](https://www.semanticscholar.org/paper/7d567a104ed5e206229c6d98e4190135f336448d)

**Multi-Review Fusion-in-Context** (Slobodkin et al., NAACL 2024): Pre-highlighted spans → coherent fused passage. Handles contradictions ("received mixed reviews"). GPT-4 achieved 4.7/5 coherence, 4.5/5 redundancy. The closest existing system to atomic claim recomposition. [arXiv:2403.15351](https://arxiv.org/abs/2403.15351)

**Entity-based coherence** (Barzilay & Lapata, 2008): Entity Grid model tracks how entities transition between grammatical roles. Claims sharing entities should be adjacent; entity grid analysis detects incoherent orderings. [Comp. Linguistics 34(1)](https://direct.mit.edu/coli/article/34/1/1/1969/)

## Evaluation of Recomposition Quality

Recomposition requires evaluation beyond factual fidelity — coherence, readability, proportionality, and whether output reads as original writing vs. patchwork.

Key metrics:
- **DiscoScore** (Zhao & Strube, EACL 2023): BERT + discourse coherence, surpasses BARTScore by >10 correlation points
- **SEVal-Ex** (2025): Statement-level alignment, 0.580 correlation with human judgment, surpassing GPT-4 evaluators (0.521)
- **CoCo** (Liu et al., EMNLP 2023): Coherence graph + contrastive learning for patchwork detection
- **QuestEval** (Scialom et al., EMNLP 2021): Bidirectional QA with Weighter module for emphasis accuracy
- **G-Eval** (Liu et al., EMNLP 2023): Custom criteria e.g. "Does the text integrate facts naturally?"

## Recommended Four-Phase Pipeline

1. **Cluster & Allocate**: Topic clustering → hierarchy construction → proportionality allocation → format detection
2. **Outline Generation** (separate prompt): Section headers, claim-to-outline mapping, transition notes, format annotations
3. **Section-by-Section Draft** (separate prompt per section): Claim checklist, inline citations, hedging preservation, source anchoring, temperature 0-0.3
4. **Verify & Critique** (single critique pass): Coverage audit, faithfulness audit, nuance check, attribution check, coherence scan, proportionality check
