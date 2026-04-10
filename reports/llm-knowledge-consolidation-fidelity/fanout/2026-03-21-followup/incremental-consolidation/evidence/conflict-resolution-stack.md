---
title: "Conflict Resolution Stack: Truth Discovery Library, Temporal Classification, and Claim Matching"
source_type: mixed_sources
url: https://truthdiscovery.readthedocs.io/en/latest/
accessed: 2026-03-21
relevance: Concrete implementations for conflict resolution, temporal classification, and claim matching in incremental consolidation
---

# Conflict Resolution and Claim Matching Stack

## Truth Discovery: Python Library

The `truthdiscovery` library provides production-ready implementations of five algorithms:

```bash
truthdiscovery run --algorithm sums --dataset mydata.csv
truthdiscovery run --algorithm truthfinder --dataset mydata.csv
truthdiscovery run --algorithm investment --params g=1.15 --dataset mydata.csv
```

Algorithms: Sums, Average-Log, Investment, PooledInvestment, TruthFinder.
Source: https://truthdiscovery.readthedocs.io/en/latest/

## Knowledge-Based Trust (Google, VLDB 2015)

Replaces exogenous trust signals (PageRank) with endogenous ones — the factual accuracy of what a source claims. EM-style algorithm iterates data veracity and source trustworthiness. Validated at 2.8B facts across 119M web pages.
Source: https://arxiv.org/abs/1502.03519

## TCR: Transparent Conflict Resolution in RAG (arXiv 2601.06842)

Dual encoder: semantic encoder (topical coherence) + factual encoder (factual validity). Three scalar signals weighted by signal-to-noise ratio. Adds only 0.3% parameters. +5–18 F1 improvement on conflict detection.
Source: https://arxiv.org/abs/2601.06842

## Recency-Weighted Scoring Formula

```
score(q, d, t) = α · cos(q, d) + (1 - α) · 0.5^(age_days(t) / h)
```
- α = 0.7 (semantic weight), h = 14-day half-life default
- α ≤ 0.7 → accuracy 1.0; α ≥ 0.9 → accuracy degrades to 0.667
- Pure cosine similarity achieves 0.0 accuracy on freshness queries
Source: https://arxiv.org/pdf/2509.19376

## Temporal Claim Classification (OpenAI Temporal Agents Cookbook)

Three categories determining invalidation behavior:
- **Static**: Point-in-time events. Valid from occurrence, never expire. "John was appointed CEO on 4 Jan 2024"
- **Dynamic**: Ongoing states. Valid for period, invalidated by static facts. "John is the CEO"
- **Atemporal**: Universal truths. No temporal bounds.

Resolution: opinions cannot invalidate facts; predictions don't expire facts directly.
Source: https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents

## TempValid: Learnable Decay Rates (ACL 2024)

Treats confidence and decay coefficients as learnable parameters, not hand-tuned:
```
confidence(rule, t) = base_confidence × decay_factor^(Δt / half_life)
```
Different relation types learn different decay rates.
Source: https://aclanthology.org/2024.acl-long.580/

## Claim Matching Stack (Three Layers)

| Layer | Tool | What It Catches | Cost |
|-------|------|----------------|------|
| 1. Exact/near-exact dedup | Bloom filter | Hash-identical claims | O(1) per query, ~10 bits/element |
| 2. Near-duplicate detection | MinHash LSH (datasketch) | Textually similar claims | Incremental insert, no rebuild |
| 3. Semantic matching | FAISS (IVF + PQ) | Semantically equivalent claims | `index.add()` without rebuild |

**Critical**: Annoy (Spotify) has immutable indexes — disqualified for incremental use. FAISS supports online insertion.

## Drift Detection: Domain Classifier as Default

- Train binary classifier: reference-period vs current-period embeddings
- ROC AUC ≥ 0.55 → meaningful drift; AUC > 0.65 → full rebuild
- PSI > 0.2 warrants investigation
- K-means achieved only 0.08 F1 for topic drift — empirically useless

Source: https://www.evidentlyai.com/blog/embedding-drift-detection
