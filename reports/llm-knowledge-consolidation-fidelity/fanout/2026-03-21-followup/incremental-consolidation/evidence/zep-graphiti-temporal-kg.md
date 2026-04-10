---
title: "Zep Graphiti: Temporal Knowledge Graph with Bi-Temporal Versioning"
source_type: academic_paper
url: https://arxiv.org/abs/2501.13956
accessed: 2026-03-21
relevance: Most complete incremental ingestion pipeline found; temporal versioning and contradiction handling via edge invalidation
---

# Zep / Graphiti Temporal Knowledge Graph Architecture

## Source
Zep: A Temporal Knowledge Graph Architecture for Agent Memory. arXiv:2501.13956 (January 2025).

## Three-Tier Subgraph Structure

**Episode Subgraph (G_e)**: Raw data storage containing message nodes with actor information and reference timestamps. Episodic edges connect episodes to extracted semantic entities. Non-lossy data retention.

**Semantic Entity Subgraph (G_s)**: Extracted entity nodes and semantic edges representing relationships between entities.

**Community Subgraph (G_c)**: Highest abstraction level where community nodes represent clusters of strongly connected entities with high-level summarizations.

## Complete Incremental Ingestion Pipeline (11 steps)

1. Ingest episode with reference timestamp
2. Extract entities (including speaker) with n=4 context window
3. Embed entities into 1024-dimensional vectors; perform cosine + full-text candidate search
4. Resolve duplicates via LLM comparison — generates updated name and summary
5. Extract facts between entity pairs with key predicate
6. Generate fact embeddings; deduplicate via constrained hybrid search (constrained to entity pairs)
7. Extract temporal metadata (t_valid, t_invalid) using t_ref
8. Identify contradictions via LLM comparison of new edges against semantically related existing edges
9. Invalidate overlapping edges — set t_invalid of old edge to t_valid of new edge
10. Integrate into graph via deterministic Cypher queries
11. Assign new entities to communities via single recursive label propagation step; update community summaries

## Bi-Temporal Versioning

Two timelines tracked:
- **Timeline T**: Chronological ordering of actual events ("next Thursday," "two weeks ago")
- **Timeline T'**: Transactional ordering of data ingestion for audit trails

Four timestamps per fact edge:
- t'_created, t'_expired ∈ T' (system transaction times)
- t_valid, t_invalid ∈ T (periods when facts held true)

## Contradiction Handling

**Key design decision**: "Graphiti consistently prioritizes new information when determining edge invalidation" — a deterministic resolution strategy favoring temporal recency.

When new edges enter the graph, the system employs an LLM to compare new edges against semantically related existing edges to identify potential contradictions. Upon detecting temporally overlapping conflicts, invalidated edges receive their t_invalid set to the t_valid of the invalidating edge.

## Community Subgraph Dynamics

Incremental community assignment: When new entity node arrives, system surveys communities of neighboring nodes and assigns to the community held by the plurality of neighbors. Uses single recursive step in label propagation rather than full Leiden algorithm.

**Critical caveat**: "Periodic community refreshes remain necessary" since dynamic updating gradually diverges from complete label propagation results.

## Performance

- LongMemEval benchmark: up to 18.5% accuracy improvement
- 90% response latency reduction vs baseline
- Outperforms MemGPT on Deep Memory Retrieval benchmark

## Key Insight for /consolidate

Graphiti's pipeline is the most complete incremental ingestion architecture found. The bi-temporal versioning, edge invalidation for contradictions, and community-level incremental updates provide a blueprint for claim-level incremental consolidation. The periodic refresh caveat maps directly to drift detection triggers.
