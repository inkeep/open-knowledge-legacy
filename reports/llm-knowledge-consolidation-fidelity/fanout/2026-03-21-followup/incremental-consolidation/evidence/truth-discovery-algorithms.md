---
title: "Truth Discovery Algorithms for Multi-Source Conflict Resolution"
source_type: academic_survey
url: https://www.kdd.org/exploration_files/Article1_17_2.pdf
accessed: 2026-03-21
relevance: Established algorithms for resolving contradictions from multiple sources; directly applicable to conflict resolution in incremental consolidation
---

# Truth Discovery Algorithms

## Source
Li et al. "A Survey on Truth Discovery." ACM SIGKDD Explorations, 2015. Also: Yin et al. "Truth Discovery with Multiple Conflicting Information Providers on the Web." KDD 2007.

## Core Principle

A piece of information is likely true if provided by many trustworthy sources. A source is trustworthy if it provides many true pieces of information. This circular dependency is resolved iteratively.

## Key Algorithms

### TruthFinder (Yin et al., 2007)
- Iterates between truth computation and source weight estimation
- Single-truth assumption: one true value per property
- Heuristics: true facts are similar across sources; false facts differ
- 10% relative improvement over naive majority voting

### Sums / Average-Log
- Source trustworthiness = sum of confidence scores of its claims
- Claim confidence = sum of trustworthiness of supporting sources
- Iterative convergence

### Investment
- Sources "invest" their trustworthiness into claims
- Claims distribute returns to sources proportionally
- Models the "investment" metaphor for source-claim relationships

## Algorithm Template

All truth discovery methods follow:
1. Initialize source weights (uniform or prior-based)
2. **Truth computation step**: Compute claim confidence from source weights
3. **Source weight estimation step**: Update source weights from claim confidence
4. **Stopping criteria**: Check convergence of truths or source weights
5. Repeat until convergence

## Applicability to Incremental Consolidation

When a new source contradicts existing consolidated knowledge:
- Source trust scores provide principled way to weight new vs existing information
- Accumulated consensus (many sources agree) naturally outweighs single contradicting source
- But can be combined with temporal recency weighting for domains where newer = more likely correct
- Incremental variant: update source weights when new source arrives without full recomputation

## Key Insight for /consolidate

Truth discovery provides a principled framework for the conflict resolution problem. For the /consolidate skill, a simplified version could assign trust weights to sources and use them to decide whether contradicting new claims should UPDATE, REPLACE, or be KEPT_SEPARATE alongside existing claims.
