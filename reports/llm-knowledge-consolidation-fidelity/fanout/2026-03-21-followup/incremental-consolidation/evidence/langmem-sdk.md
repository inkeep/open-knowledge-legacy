---
title: "LangMem SDK: Purpose-Built Incremental Memory with Trustcall Extraction"
source_type: open_source_project
url: https://blog.langchain.com/langmem-sdk-launch/
accessed: 2026-03-21
relevance: Production memory SDK with INSERT/UPDATE/DELETE via schema-typed extraction; Profile vs Collection pattern for conflict resolution
---

# LangMem SDK (LangChain, February 2025)

## Source
LangMem SDK Launch. LangChain Blog, February 2025.
Conceptual Guide: https://langchain-ai.github.io/langmem/concepts/conceptual_guide/

## Architecture

Three memory categories:

| Type | Storage Pattern | Update Behavior |
|---|---|---|
| Semantic (Collections) | Multiple discrete documents | INSERT / UPDATE / DELETE via LLM reasoning |
| Semantic (Profiles) | Single document, schema-driven | Entire document replaced in-place |
| Episodic | Few-shot examples | Appended (successful interaction records) |
| Procedural | System prompt text | Optimized via prompt optimizer feedback loop |

## Trustcall Extractor

Uses `trustcall.create_extractor` — parallel tool-calling wrapper enabling schema-typed structured extraction. The LLM receives new conversation messages alongside existing memories and issues:

- **INSERT**: Novel fact with no existing equivalent
- **UPDATE**: Fact modifies/extends existing memory (preserves original ID)
- **DELETE**: Existing memory contradicted; returns `RemoveDoc(json_doc_id=...)` for old memory's ID

**Key design**: DELETE is a soft signal — `RemoveDoc` is returned to caller who decides hard-delete, soft-delete, or down-weight. Memory manager is storage-agnostic.

## Profile vs Collection (Core Conflict Resolution Design)

- **Collection**: Multiple independent memory objects. LLM can UPDATE contradictory ones, DELETE superseded ones, or INSERT alongside. Supports temporal reasoning.
- **Profile**: Single document replaced wholesale. No accumulation. Best when only current state matters.

## Memory Formation Modes

- **Active (hot path)**: Updates inline during conversation. Immediate consistency, added latency.
- **Background (cold path)**: Conversations processed asynchronously after completion. No latency impact, updates lag.

## Recall Scoring

Composite: semantic similarity + importance + strength (recency + frequency of use)

## Key Insight for /consolidate

The Profile vs Collection distinction maps directly to two consolidation modes: Profile = "give me the current state of knowledge" (replace); Collection = "maintain the full evidence base" (accumulate with conflict tracking). The trustcall extractor pattern (schema-typed extraction with existing memories as context) is a clean API design.
