---
title: "CrewAI Memory: Dual-Threshold Consolidation with Recency Decay"
source_type: open_source_project
url: https://docs.crewai.com/en/concepts/memory
accessed: 2026-03-21
relevance: Practical dual-threshold pattern (0.85 for LLM consolidation, 0.98 for vector-only dedup) with composite recall scoring
---

# CrewAI Memory System

## Source
CrewAI Memory Documentation. https://docs.crewai.com/en/concepts/memory

## Dual-Threshold Consolidation

Memory consolidation triggers automatically on `remember()` when new content similarity exceeds thresholds:

1. **Vector-only dedup (0.98 cosine)**: Runs in `remember_many()` batch mode. Pure vector math, no LLM call. Catches near-exact duplicates cheaply.

2. **LLM consolidation (0.85 cosine)**: When similarity is above 0.85 but below 0.98. LLM decides:
   - **Keep** existing records unchanged
   - **Update** existing record with merged content
   - **Delete** outdated/superseded records
   - **Insert** as separate new record

## Composite Recall Scoring

```
composite = 0.5 × semantic_similarity + 0.3 × recency_decay + 0.2 × importance
```

where `recency_decay = 0.5^(age_days / half_life_days)` (default half-life: 30 days)

## Other Features

- **Memory extraction**: `extract_memories()` breaks raw text into discrete atomic facts before storage
- **Non-blocking writes**: `remember_many()` runs in background threads; `recall()` drains pending writes first
- **Recall depths**: Shallow (~200ms, vector-only) vs Deep (multi-step with LLM analysis)

## Key Insight for /consolidate

The dual-threshold pattern is a practical engineering trade-off: cheap vector-only dedup catches obvious duplicates (0.98), while more expensive LLM reasoning handles the ambiguous middle ground (0.85-0.98). The recency decay scoring is also relevant — claims from older sources naturally score lower in recall unless they have high importance.
