---
title: "Agent Zero: Five-Action Memory Consolidation with Safety Threshold"
source_type: open_source_project
url: https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations
accessed: 2026-03-21
relevance: Five-action taxonomy closest to incremental consolidation skill design; 0.9 similarity safety rail for REPLACE
---

# Agent Zero Memory Consolidation System

## Source
Agent Zero open-source project. Documentation via DeepWiki. https://github.com/agent0ai/agent-zero

## Five-Action Taxonomy

1. **SKIP**: Discards the new memory as redundant or low-value
2. **KEEP_SEPARATE**: Stores the new memory independently without merging
3. **MERGE**: Combines the new memory with existing similar memories into one entry
4. **REPLACE**: Substitutes an existing memory with the new one (requires 0.9 cosine similarity safety threshold)
5. **UPDATE**: Modifies an existing memory to incorporate new information

## Two-Layer Deduplication

**Phase 1 — Keyword-Based Search**: Generates search keywords via LLM analysis to identify candidate memories.

**Phase 2 — Semantic Similarity Search**: Performs hybrid retrieval combining keyword matches with vector similarity scoring using cosine distance.

## Consolidation Pipeline

1. Extract search keywords from the new memory using an LLM
2. Execute hybrid search (keyword + semantic) against the vector database
3. Retrieve up to 8 similar memories (fragments) or 6 (solutions)
4. Send new memory plus top candidates (max 4 for fragments, 3 for solutions) to LLM
5. Parse JSON response into ConsolidationResult (action, target memory ID, reasoning)
6. Execute chosen action with safety validation checks

## Safety Rails

- REPLACE requires 0.9 cosine similarity threshold to prevent inadvertent overwrites
- LLM response includes reasoning for auditability
- Separate thresholds for fragment vs solution memory types

## Memory Types

- **Fragment memories**: General information snippets (up to 8 candidates)
- **Solution memories**: Successful problem-solution pairs (up to 6 candidates)
- Both receive metadata: consolidation_action, timestamp, area classification

## Key Insight for /consolidate

Agent Zero's five-action taxonomy maps naturally to incremental consolidation operations. The REPLACE safety threshold at 0.9 is a concrete, tested guard rail. The two-layer search (keyword + semantic) provides practical claim matching.
