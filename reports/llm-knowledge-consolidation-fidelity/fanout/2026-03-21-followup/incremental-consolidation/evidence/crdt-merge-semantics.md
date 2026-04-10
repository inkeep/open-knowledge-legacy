---
title: "CRDTs: Conflict-Free Merge Semantics for Distributed Knowledge"
source_type: reference_architecture
url: https://crdt.tech/
accessed: 2026-03-21
relevance: Mathematical framework for guaranteed-convergent merges; applicable to distributed/concurrent consolidation
---

# CRDTs for Knowledge Consolidation

## Source
Shapiro et al. Various papers on CRDTs. https://crdt.tech/

## Core Properties

CRDTs ensure that no matter what modifications are made on different replicas, data can always be merged into a consistent state automatically, without special conflict resolution code.

Merge function requirements (semilattice):
- **Commutative**: merge(A, B) = merge(B, A)
- **Associative**: merge(merge(A, B), C) = merge(A, merge(B, C))
- **Idempotent**: merge(A, A) = A

## Two Approaches

### State-Based CRDTs
- Share full state between replicas
- Merge function computes join of replica states
- Example: G-Counter (grow-only counter), LWW-Register (last-writer-wins)

### Operation-Based CRDTs
- Share operations (deltas) between replicas
- Operations must be commutative
- Example: OR-Set (observed-remove set)

## Relevant CRDT Types for Knowledge

- **LWW-Register**: Last-Writer-Wins — temporal recency resolution for conflicting claims
- **MV-Register**: Multi-Value — preserves all conflicting values (like KEEP_SEPARATE)
- **OR-Set**: Can add and remove elements; concurrent adds and removes resolve deterministically
- **LWW-Map**: Maps with last-writer-wins per key — natural fit for claim key-value stores

## Applicability to Incremental Consolidation

CRDTs provide a formal framework for thinking about knowledge merge operations:
- Claim set as a grow-only set (G-Set): claims can only be added, never lost
- Claim versions as LWW-Registers: latest version wins per claim key
- Multi-source claims as MV-Registers: preserve all versions when resolution is ambiguous

## Practical Limitation

CRDTs guarantee convergence but not semantic quality. Merging two knowledge bases mechanically produces a consistent result, but the semantic coherence of the merged knowledge requires LLM-level reasoning that CRDTs can't provide.

## Key Insight for /consolidate

CRDTs suggest that the claim inventory in a consolidated body should be modeled as a set with well-defined merge semantics. Even if LLM reasoning handles the semantic decisions, the underlying data structure should guarantee convergence properties (idempotent re-application of same source, commutative processing order).
