---
title: "Microsoft GraphRAG: Incremental Update Challenges and Community Summary Problem"
source_type: open_source_project
url: https://github.com/microsoft/graphrag/discussions/511
accessed: 2026-03-21
relevance: Documents the hard problem of incremental community summary updates in hierarchical graph systems
---

# Microsoft GraphRAG Incremental Updates

## Source
Microsoft GraphRAG project. GitHub Discussion #511 and release notes for v0.5.0+.

## Current State (v0.5.0+)

Version 0.5.0 and above supports incremental updates by maintaining consistent entity IDs, enabling insert-update merge operations in the database. Earlier versions required complete reload due to inconsistent IDs.

## The Community Summary Problem

When new documents introduce new entities that join existing community clusters, the community summaries need updating. GraphRAG's approach:

- New nodes are added to the knowledge graph
- New information is integrated into relevant community clusters
- Community summaries can report both old and new perspectives

However, as discussed in GitHub Discussion #511, conflicting information (e.g., "sky was BLUE" vs "sky is RED") gets integrated as separate claims within the same community clusters.

## Current Limitations

- No native partial rebuild mechanism for community summaries
- Full re-indexing required for comprehensive updates (tracked in issue #741)
- Dynamic community selection (2025 update) reduces computational costs by 77% by assessing relevance of community reports to queries, but this is a query-time optimization, not an indexing optimization

## Key Insight for /consolidate

GraphRAG illustrates the fundamental tension in hierarchical summarization: leaf-level incremental updates are straightforward, but propagating changes up through community/cluster summaries is expensive. The 77% cost reduction via dynamic community selection suggests that lazy evaluation at query time may be more practical than eager summary updates.
