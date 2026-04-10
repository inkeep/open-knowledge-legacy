---
title: "LightRAG: Incremental Knowledge Graph Union for RAG"
source_type: academic_paper
url: https://arxiv.org/abs/2410.05779
accessed: 2026-03-21
relevance: Demonstrates practical incremental graph update via node/edge union without full rebuild
---

# LightRAG Incremental Graph Updates

## Source
LightRAG: Simple and Fast Retrieval-Augmented Generation. EMNLP 2025 Findings. arXiv:2410.05779.

## Incremental Update Mechanism

LightRAG processes new documents using the same graph-based indexing steps as initial construction, then combines new graph data with the original by merging (unioning) the nodes and edges.

### Key Design Properties

1. **Consistent methodology**: New documents go through identical extraction pipeline as original documents
2. **Union-based merge**: New nodes and edges are unioned into existing graph
3. **Selective update**: Only specific nodes and relationships affected by new data are updated
4. **No full rebuild**: Incremental updates add new nodes/edges without rebuilding entire index

### Performance

- Up to 70% reduction in update processing time vs traditional RAG systems with high update frequencies
- ~50% reduction in update time compared to full reprocessing

## Architecture

LightRAG uses dual-level retrieval:
- **Low-level**: Specific entity and relationship retrieval
- **High-level**: Topic-level and thematic retrieval

Both levels benefit from incremental graph updates since new entities and relationships are added to both retrieval layers.

## Limitations

- Entity resolution during union is implicit — relies on name/embedding matching
- No explicit contradiction handling between old and new edges
- No temporal versioning of facts
- Community/cluster summaries may need periodic refresh

## Key Insight for /consolidate

LightRAG demonstrates that the simplest incremental approach — process new documents identically to originals, then union the results — works well for graph-based knowledge. This is the "append and merge" pattern. Trade-off: fast and simple, but no conflict resolution.
