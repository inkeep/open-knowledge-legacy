---
title: "Agent Zero Memory Consolidation System"
source_type: source_code_analysis
sources:
  - url: "https://github.com/agent0ai/agent-zero"
    title: "Agent Zero GitHub Repository"
  - url: "https://deepwiki.com/frdel/agent-zero/4.3-memory-consolidation-system"
    title: "DeepWiki — Memory Consolidation System"
  - url: "https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations"
    title: "DeepWiki — Memory Operations"
date_collected: "2026-03-21"
---

# Agent Zero Memory Consolidation

## Four-Stage Pipeline

1. **Similar Memory Discovery** — Hybrid search (semantic + keyword extraction via FAISS)
2. **Race Condition Validation** — Verify discovered memories still exist
3. **LLM Analysis** — Structured JSON decision with 5 possible actions
4. **Apply Consolidation** — Execute chosen action with safety checks

## Five Actions

```python
class ConsolidationAction(Enum):
    MERGE = "merge"
    REPLACE = "replace"
    KEEP_SEPARATE = "keep_separate"
    UPDATE = "update"
    SKIP = "skip"
```

## LLM Output Schema

```json
{
  "action": "merge|replace|keep_separate|update|skip",
  "memories_to_remove": ["id1", "id2"],
  "memories_to_update": [
    {"id": "memory_id", "new_content": "...", "metadata": {...}}
  ],
  "new_memory_content": "final consolidated memory text",
  "metadata": {
    "consolidated_from": ["id1", "id2"],
    "historical_notes": "summary of older information",
    "importance_score": 0.8,
    "consolidation_type": "description of consolidation performed"
  },
  "reasoning": "brief explanation"
}
```

## REPLACE Safety Rail

REPLACE requires >0.9 estimated similarity. Below this threshold, auto-downgrades to KEEP_SEPARATE.

```python
# Configuration thresholds
similarity_threshold: 0.7           # Discovery threshold
max_similar_memories: 10            # Initial search limit
max_llm_context_memories: 5         # Sent to LLM for analysis
replace_similarity_threshold: 0.9   # Safety gate for REPLACE
processing_timeout_seconds: 60      # Timeout with fail-safe
```

## Consolidation System Prompt (Key Sections)

### Similarity Score Awareness
- >0.9: suitable for replacement
- 0.7-0.9: related but distinct, use caution
- <0.7: topically related but different, avoid REPLACE

### Temporal Intelligence
- Newer information supersedes older
- Preserve historical context when consolidating

### Content Relationships
- Complementary → merge into comprehensive memories
- Contradictory → analyze which is more accurate/current
- Duplicate → consolidate to eliminate redundancy
- Distinct but related → keep separate

### Quality Assessment
- More detailed/complete information preserved
- Factual accuracy takes precedence over speculation

### Knowledge Source Awareness
- Imported files are more authoritative than conversation memories
- Avoid consolidating knowledge sources with conversation memories

## Two-Layer Deduplication

Extraction prompt (`memories_sum.sys.md`) already merges related facts:
> "Do not break information related to the same subject into multiple memories. Instead of three memories 'User's dog is Max', 'Max is 6 years old', 'Max is white and brown', create one memory 'User's dog is Max, 6 years old, white and brown.'"

## Metadata Tracking

- `consolidation_action`: action taken
- `consolidated_from`: list of merged memory IDs
- `replaced_memories`: list of replaced memory IDs
- `updated_from`: original memory ID for updates
- `importance_score`: LLM-assigned (0-1)

## Background Execution

- `DeferredTask` threads — never blocks agent loop
- 60-second timeout with fail-safe (memory not stored on timeout)
- Fallback on LLM failure: SKIP action (insert unchanged)
