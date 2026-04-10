---
title: "AutoNuggetizer: Nugget-Based Evaluation for TREC 2024 RAG Track"
source_url: https://arxiv.org/html/2411.09607v1
source_type: academic_paper
authors: Ronak Pradeep, Nandan Thakur, Sahel Sharifymoghaddam, Eric Zhang, Ryan Nguyen, Daniel Campos, Nick Craswell, Jimmy Lin
date_accessed: 2026-03-21
relevance: D7 — Nugget-based claim coverage evaluation directly applicable to consolidation completeness
---

## Key Findings

The AutoNuggetizer framework decomposes reference information into atomic "nuggets" and measures what percentage of those nuggets appear in system-generated responses. This is the closest existing framework to measuring consolidation completeness.

### Nugget Creation
- **Automatic**: GPT-4o iteratively extracts atomic information units from up to 10 relevant documents per iteration, capped at 30 nuggets per topic
- **Semi-Manual**: Human assessors at NIST refine auto-generated nuggets (~1 hour per topic)
- **Importance Classification**: Each nugget labeled "vital" (must be present) or "okay" (supplementary)

### Nugget Assignment
- **Listwise approach**: GPT-4o evaluates whether each nugget is "support" (fully captured), "partial_support" (partially captured), or "not_support" (absent)
- **Batch processing**: Maximum 10 nuggets per LLM call

### Six Scoring Metrics
1. **All (A)**: Average score across all nuggets (support=1.0, partial=0.5, not_support=0)
2. **All Strict (A_strict)**: Binary, only full support counts
3. **Vital (V)**: Average restricted to vital nuggets
4. **Vital Strict (V_strict)**: Binary on vital nuggets (primary metric)
5. **Weighted (W)**: vital weight=1, okay weight=0.5
6. **Weighted Strict (W_strict)**: Binary with differential weighting

### Correlation with Human Assessment
- **Run-level**: Kendall's τ = 0.783 (strong)
- **Per-topic average**: Kendall's τ = 0.518 (moderate)
- **All topic/run combinations**: Kendall's τ = 0.324 (weak-moderate)

### Relevance to Consolidation
- **Direct applicability**: Nuggets = atomic facts from sources. Nugget recall = consolidation completeness
- **Vital/okay distinction** maps to scope-aware consolidation: vital nuggets = in-scope information, okay nuggets = supplementary
- **Partial support scoring** captures paraphrased/reformulated information preservation
- **Automated pipeline** with strong run-level correlation enables practical evaluation at scale
- **The framework explicitly measures information coverage**, making it the most directly relevant evaluation paradigm for consolidation fidelity
