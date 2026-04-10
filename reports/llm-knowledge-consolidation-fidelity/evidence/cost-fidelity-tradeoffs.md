---
title: "Cost-Fidelity Tradeoff Curves for Knowledge Consolidation"
description: "Evidence on pipeline stage ablation, model size vs quality, verification diminishing returns, structured vs unstructured intermediates, token cost modeling at scale, prompt engineering vs pipeline complexity, caching and amortization, open-source vs proprietary per stage, and three quality tier presets (Fast/Standard/Thorough)."
created: 2026-03-21
last-updated: 2026-03-21
---

## 1. Pipeline Stage Ablation

### LLMxMapReduce (Llama3-70B-Instruct)

**Source:** [arXiv:2410.09342](https://arxiv.org/html/2410.09342v1)

| Configuration | En.Avg | Co.De | Ma.Fi | Relative Importance |
|---|---|---|---|---|
| Full Pipeline | 41.23 | 62.94 | 91.43 | Baseline |
| -Structured Protocol | 25.93 (-15.30) | 46.45 (-16.49) | 56.00 (-35.43) | **Critical** |
| -Confidence Calibration | 39.18 (-2.05) | 58.12 (-4.82) | 90.00 (-1.43) | Important |

Structured information protocol contributes 3-25x more fidelity than confidence calibration.

### NexusSum Progressive Ablation

**Source:** [NexusSum, ACL 2025](https://arxiv.org/abs/2505.24575)

| Added Stage | BERTScore Delta | % of Total Gain |
|---|---|---|
| Preprocessing | +2.45 | 22% |
| Summarizer | +4.86 | 45% |
| Iterative Compression | +1.78-1.83 | 33% |

### Stage Importance Ranking

| Rank | Stage | Fidelity Contribution | Skippability |
|---|---|---|---|
| 1 | Structured intermediate format | +15-35pp | Never skip |
| 2 | Source-grounded verification | +13.6pp correct claims | Skip only for drafts |
| 3 | Core summarization/synthesis | +4.9pp BERTScore | Cannot skip |
| 4 | Confidence calibration | +2-5pp | Safe to skip |
| 5 | Preprocessing/normalization | +2.5pp | Safe for uniform inputs |
| 6 | Iterative compression | +1.8pp | Skip unless length control needed |

## 2. Model Size vs Quality

### 8B vs 70B Direct Comparison

**Source:** [Context-Aware Hierarchical Merging, ACL 2025](https://arxiv.org/abs/2502.00977)

| Method | 8B PRisma | 70B PRisma | Gap |
|---|---|---|---|
| Zero-shot | 33.2 | 35.2 | 2.0 |
| HMerge | 37.8 | 42.2 | 4.4 |
| Extract-Support | 39.2 | 45.6 | 6.4 |

**Model size gap widens with pipeline sophistication** — larger models extract more value. But 8B+Extract-Support (39.2) beats 70B zero-shot (35.2). **Pipeline quality > model size.**

7B models reach 92-95% of GPT-4 quality on comprehension at 1/50th-1/150th cost.

### Minimum Viable Model per Stage

| Stage | Minimum | Recommended | Rationale |
|---|---|---|---|
| Chunk decomposition | 7-8B | 8-13B | Well-constrained extraction |
| Deduplication | Embedding model | Embedding + 13B | Embedding-native |
| Conflict resolution | 70B | Frontier API | Nuanced reasoning |
| Recomposition | 13B | 70B or mid-tier API | Coherence demands scale |
| Fact verification | 770M (MiniCheck) | 770M | Purpose-built dominates |
| Quality check | 70B | Frontier API | Must catch subtle errors |

## 3. Verification Diminishing Returns

### Mathematical Model

**Source:** Yang et al. EMNLP 2025. Acc_t = Upp - α^t × (Upp - Acc_0), where Upp = CS/(1-CL+CS), α = CL-CS.

| Pass | Improvement Share | Cumulative | Errors Surviving |
|---|---|---|---|
| 1 | 50% | 50% | 60% |
| 2 | 25% | 75% | 36% |
| 3 | 12.5% | 87.5% | ~22% |
| 4 | 6.25% | 93.75% | ~13% |

**Passes 1-2 capture 75% of maximum improvement.** Self-Refine (NeurIPS 2023): ~20% absolute improvement vs single-pass.

### Tiered Verification Economics

**Source:** [MiniCheck, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.499/)

MiniCheck-FT5 (770M params): ~$0.24 per 13K claims vs GPT-4 ~$107. GPT-4-level accuracy at 400x lower cost. Optimal: route ~80% through MiniCheck, escalate ~20% ambiguous to LLM-as-judge. Total ~$1-2 for 100-doc verification.

## 4. Structured vs Unstructured Intermediates

LLMxMapReduce structured protocol: +15.30pp (English), +16.49pp (code), +35.43pp (math).

| Format | Token Overhead | Parseability | Quality Impact |
|---|---|---|---|
| Plain text | 1.0x | Low | Baseline |
| TOON | 1.4x | High | +4.2pp over JSON |
| JSON | 2.0x | High | Baseline structured |

**Source:** [TOON vs JSON](https://www.tensorlake.ai/blog-posts/toon-vs-json)

Forcing structured output during reasoning reduces performance by 10-15%. Solution: reason freely, then extract structured output (~1.3x cost).

## 5. Token Cost Modeling

### Cost at Scale (Claude Sonnet 4.6, homogeneous)

| Scale | Total Cost | Per Document | Primary Cost Driver |
|---|---|---|---|
| 10 docs | ~$0.58 | $0.058 | Decomposition (70%) |
| 100 docs | ~$5.37 | $0.054 | Decomposition (70%) |
| 1,000 docs | ~$51.47 | $0.051 | Decomposition (70%) |

Costs scale linearly (decomposition is parallel, dedup uses embeddings, output is bounded).

### Mixed-Model Pipeline (Optimized)

| Scale | Homogeneous | Mixed Pipeline | Savings |
|---|---|---|---|
| 10 docs | $0.58 | ~$0.15 | 74% |
| 100 docs | $5.37 | ~$1.50 | 72% |
| 1,000 docs | $51.47 | ~$12.00 | 77% |

Mixed: Llama 3.1 8B for decomposition, embeddings for dedup, Sonnet for conflict/recomposition, MiniCheck for verification.

## 6. Prompt Engineering vs Pipeline Complexity

**Source:** [arXiv:2406.00507](https://arxiv.org/abs/2406.00507)

Prompt chaining (draft→critique→refine): 77/100 wins vs stepwise at ~3x token cost. Stepwise induces "simulated refinement" — model generates errors anticipating self-correction.

| Scenario | Approach | Cost |
|---|---|---|
| <5 docs, draft quality | CoT single prompt | 1x |
| <5 docs, high quality | Prompt chaining | 3x |
| 5-50 docs, mixed domains | Map-reduce + chaining | 10-20x |
| 50+ docs, high fidelity | Full pipeline | 30-50x |

## 7. Caching and Amortization

Anthropic: 90% cost reduction, 85% latency reduction on cached input (min 1,024 tokens). OpenAI: 50% on cached input.

Cacheable pipeline computations: source decomposition (~40% savings), embeddings (~10%), MiniCheck results (~15%), structured extraction (~10%). Total on incremental re-runs: ~50-65%.

GPTSemCache: 61-69% hit rates at 0.8 similarity threshold with 92-97% accuracy.

## 8. Quality Tier Presets

### Fast (~$0.02-0.05/10 docs)
Stuff-all-in-context + CoT, budget model, no verification. Exploratory/drafts only. ~20 doc limit.

### Standard (~$0.15-0.50/10 docs)
Map-reduce → embedding dedup → prompt chaining → MiniCheck. Llama 8B decomposition, Sonnet synthesis, MiniCheck verification. 1-2 refinement passes, ~500 docs.

### Thorough (~$1.50-5.00/100 docs)
Full decompose → structured intermediates → deduplicate → conflict resolution → recompose → tiered verification → 2-3 passes. Frontier model for conflicts, MiniCheck+LLM verification. ~5,000+ docs.

| Dimension | Fast | Standard | Thorough |
|---|---|---|---|
| Relative fidelity | 1.0x | ~2.5-3.0x | ~3.5-4.0x |
| Deduplication | None | Embedding | LLM-verified |
| Conflict resolution | None | Implicit | Explicit (frontier) |
| Verification | None | MiniCheck | Tiered |
