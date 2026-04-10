---
title: "AGM Belief Revision Semantics for AI Agent Memory (2026)"
source_type: academic_paper
url: https://arxiv.org/html/2603.17244
accessed: 2026-03-21
relevance: Formal framework for contradiction handling with immutable revisions and provable guarantees; the only system with formal correctness properties
---

# Graph-Native Cognitive Memory with Belief Revision Semantics

## Source
"Graph-Native Cognitive Memory for AI Agents." arXiv:2603.17244 (2026).

## Architecture

- **Working memory**: Redis
- **Long-term memory**: Neo4j knowledge graph
- **Structure**: item → revision → tag
  - Revisions are immutable snapshots
  - Tags are mutable pointers to current "active belief"

## Supersedes Mechanism

When a contradiction arrives:
1. Create new revision r_{i(k+1)} with `Supersedes` edge to prior revision r_{i(k)}
2. Update tag pointer to new revision
3. Old revision remains in graph but excluded from normal retrieval via `WHERE NOT item.deprecated`
4. Full revision history is auditable

## Formal Guarantees

Provably satisfies AGM postulates K*2–K*6 plus Hansson's Relevance and Core-Retainment.

**Recovery postulate intentionally rejected**: Archived revisions are not automatically recoverable — requires explicit opt-in. This avoids paradoxical belief restoration.

## Update Mechanism

Agents issue complete revised content through `memory_ingest` MCP tool — atomic full-replacement strategy (no partial patch). Simplifies consistency guarantees at cost of requiring LLM to re-issue full content.

## Key Insight for /consolidate

This is the only system found with formal correctness properties for belief revision. The immutable revision + mutable tag pattern provides a clean model for claim versioning: when a claim is superseded, the old version is preserved (for provenance) but the tag points to the current version. The Recovery rejection is important — it means "undo" requires explicit action, not automatic restoration.
