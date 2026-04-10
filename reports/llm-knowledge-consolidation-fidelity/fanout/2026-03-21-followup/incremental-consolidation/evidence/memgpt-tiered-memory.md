---
title: "MemGPT/Letta: OS-Inspired Tiered Memory with Self-Directed Management"
source_type: academic_paper
url: https://arxiv.org/abs/2310.08560
accessed: 2026-03-21
relevance: Tiered memory architecture with LLM-as-memory-manager; compression via summarization and eviction
---

# MemGPT / Letta Tiered Memory Architecture

## Source
MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560 (October 2023). Now developed as Letta (https://docs.letta.com).

## Memory Tiers

Four memory blocks analogous to CPU cache hierarchy:
1. **Core memory** (L1): Tiny but high-priority; no loss for most vital data
2. **Message buffer** (L2): Recent events; older details dropped unless explicitly saved
3. **Archival memory** (L3): Explicitly formulated knowledge in external databases (vector DB)
4. **Recall memory**: Raw conversation history

## Incremental Consolidation Mechanism

The LLM itself serves as the memory manager through self-directed memory editing via tool calling:
- Decides what to store, what to summarize, what to forget
- When context window reaches capacity, intelligent eviction strategies determine what to remove
- Important details are summarized and stored in archival memory before removal from active context

## Compression Strategy

Each layer is a lossy filter:
- Core memory: no loss for highest-priority data
- Message buffer: time-based eviction, older details dropped
- Archival memory: everything in theory, but retrieval is approximate (semantic search)

## Sleep-Time Compute (2024-2025)

Sleep-time agents handle memory management asynchronously:
- Memory consolidation happens outside of user-facing interactions
- Improves both response times and memory quality
- Separates the "thinking about what to remember" from "responding to the user"

## Key Insight for /consolidate

The sleep-time compute pattern is directly applicable: consolidation can run asynchronously after new sources are ingested, rather than blocking the user interaction. The tiered architecture also suggests that consolidated knowledge could exist at multiple abstraction levels.
