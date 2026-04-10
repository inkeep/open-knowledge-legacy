---
title: Token Cost Modeling at Scale
type: evidence
sources:
  - url: https://pricepertoken.com/
    title: "LLM API Pricing 2026"
  - url: https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025
    title: "LLM API Pricing Comparison 2025"
  - url: https://inventivehq.com/blog/llm-api-cost-comparison
    title: "LLM API Cost Comparison: GPT-4 vs Claude vs Llama (2026)"
  - url: https://costgoat.com/compare/llm-api
    title: "LLM API Pricing Comparison & Cost Guide (Mar 2026)"
---

# Token Cost Modeling at Scale

## Current API Pricing (March 2026)

### Per Million Tokens (Input / Output)

| Tier | Model | Input | Output |
|---|---|---|---|
| Frontier | Claude Opus 4.6 | $5.00 | $25.00 |
| Frontier | GPT-5.2 | $1.75 | $14.00 |
| Mid-tier | Claude Sonnet 4.6 | $3.00 | $15.00 |
| Budget | Claude Haiku 4.5 | $0.25 | $1.25 |
| Budget | GPT-4o mini | $0.15 | $0.60 |
| Open-source (hosted) | Llama 3.1 70B (Together) | $0.20 | $0.90 |
| Open-source (hosted) | Mistral Medium 3 | $0.40 | $2.00 |
| Ultra-budget | DeepSeek V3.2 | $0.14 | $0.28 |
| Specialized | MiniCheck (self-hosted) | ~$0.01 | ~$0.01 |

## Token Budget Estimates per Document

Assumptions:
- Average source document: ~5,000 tokens
- Average chunk: ~2,000 tokens
- Average output summary per chunk: ~500 tokens
- Average final consolidated output: ~3,000 tokens

## Pipeline Cost Model

### Per-Stage Token Consumption

| Stage | Input Tokens | Output Tokens | Scaling |
|---|---|---|---|
| Chunk decomposition | N * chunk_size | N * 0.3 * chunk_size | Linear in docs |
| Deduplication | N * claims | N * 0.1 * claims | ~Linear (pairwise with embedding shortcut) |
| Conflict resolution | K * conflicting_claims | K * resolution_size | Linear in conflicts |
| Recomposition | total_claims | final_output | Sub-linear (bounded output) |
| Verification | final_claims * source_refs | verdict_per_claim | Linear in claims |

Where N = number of chunks, K = number of conflicts detected

### Cost Estimates by Scale (Claude Sonnet 4.6)

#### 10 Documents (~50K tokens input)
| Stage | Input Tokens | Output Tokens | Cost |
|---|---|---|---|
| Decomposition (25 chunks) | 50,000 | 15,000 | $0.37 |
| Deduplication | 15,000 | 1,500 | $0.07 |
| Conflict resolution | 5,000 | 2,000 | $0.05 |
| Recomposition | 15,000 | 3,000 | $0.09 |
| Verification (MiniCheck) | 20,000 | 2,000 | ~$0.00 |
| **Total** | | | **~$0.58** |

#### 100 Documents (~500K tokens input)
| Stage | Input Tokens | Output Tokens | Cost |
|---|---|---|---|
| Decomposition (250 chunks) | 500,000 | 150,000 | $3.75 |
| Deduplication | 150,000 | 15,000 | $0.67 |
| Conflict resolution | 50,000 | 20,000 | $0.45 |
| Recomposition | 100,000 | 5,000 | $0.38 |
| Verification (MiniCheck) | 50,000 | 5,000 | ~$0.01 |
| LLM-as-judge (20% escalation) | 10,000 | 5,000 | $0.11 |
| **Total** | | | **~$5.37** |

#### 1,000 Documents (~5M tokens input)
| Stage | Input Tokens | Output Tokens | Cost |
|---|---|---|---|
| Decomposition (2,500 chunks) | 5,000,000 | 1,500,000 | $37.50 |
| Deduplication | 1,500,000 | 150,000 | $6.75 |
| Conflict resolution | 500,000 | 200,000 | $4.50 |
| Hierarchical recomposition (multi-level) | 500,000 | 50,000 | $2.25 |
| Verification (MiniCheck) | 200,000 | 20,000 | ~$0.05 |
| LLM-as-judge (20% escalation) | 40,000 | 20,000 | $0.42 |
| **Total** | | | **~$51.47** |

### Scaling Behavior

| Scale | Total Cost | Cost per Source Doc | Scaling Pattern |
|---|---|---|---|
| 10 docs | ~$0.58 | $0.058 | Baseline |
| 100 docs | ~$5.37 | $0.054 | ~Linear (slight efficiency) |
| 1,000 docs | ~$51.47 | $0.051 | ~Linear (hierarchical recomp helps) |

**Key finding:** Costs scale approximately linearly because:
1. Decomposition is embarrassingly parallel (linear)
2. Deduplication uses embedding similarity (avoids O(n^2) pairwise LLM comparison)
3. Recomposition is bounded by output size, not input size
4. Only conflict resolution could be super-linear, but conflicts are typically sparse

### Where Costs Concentrate

At 100 docs:
- Decomposition: 70% of cost
- Deduplication: 12%
- Conflict resolution: 8%
- Recomposition: 7%
- Verification: 2%

**Decomposition dominates cost at every scale.** This is the primary target for model-tier optimization (use cheaper models for chunking).
