---
title: "Letta (MemGPT): Self-Editing Memory for Agents"
dimension: D3
facet: "LLM-as-OS memory management paradigm"
collected: 2026-04-03
confidence: high
---

# Letta (formerly MemGPT)

## Core Idea: LLM-as-Operating-System

Just as an OS manages RAM and disk to give programs the illusion of unlimited memory, MemGPT gives an LLM the illusion of unlimited context by managing data movement between fast (in-context) and slow (out-of-context) memory tiers.

**The agent itself decides** what to remember and forget -- no external orchestrator manages retrieval. This is fundamentally different from RAG or Mem0.

Paper: [MemGPT: Towards LLMs as Operating Systems (arXiv:2310.08560)](https://arxiv.org/abs/2310.08560)

## Two-Tier Architecture

**Tier 1: Main Context (RAM)** -- fixed context window containing system prompt, core memory blocks, recent conversation.

**Tier 2: External Context (Disk)**:

| Memory Type | Description | Analogy |
|-------------|-------------|---------|
| Core Memory | Always in-context, small editable blocks in system prompt | Registers/L1 cache |
| Recall Memory | Searchable conversation history DB (vector-backed) | Disk cache |
| Archival Memory | Long-term vector DB storage, explicitly archived/retrieved | Cold storage |

**Context overflow**: At ~70% of window, "memory pressure" warning injected. Agent saves important info, oldest messages evicted, agent retrieves evicted info later via recall/archival search.

## How It Differs from Alternatives

| Dimension | Letta | Mem0 | Vector DB |
|-----------|-------|------|-----------|
| What it is | Full agent runtime | Memory API layer | Storage infrastructure |
| Who manages memory | The LLM itself | Automatic extraction | Developer pipeline |
| Memory editing | Agent rewrites own blocks | System extracts automatically | Static after write |
| Commitment level | High -- agents run inside Letta | Low -- plug into framework | Low -- just a DB |

**Key differentiator**: Agent-driven memory (Letta) vs system-driven memory (Mem0) vs developer-managed retrieval (vector DB).

## Framework vs Memory System

Letta is a **full agent framework/platform**, not just a memory system:
- Agent Runtime (manages tool execution, reasoning loop, state)
- REST API Service (agents as services, not embedded libraries)
- Stateful Persistence (agents persist when app is not running)
- Python + TypeScript SDKs
- Agent Development Environment (ADE) GUI
- Letta Cloud (managed hosting)
- MCP support (Letta acts as MCP host connecting to external servers)

Recent additions: **Letta Code** (memory-first coding agent), **Context Repositories / MemFS** (git-backed memory filesystem), **Agent File (.af)** open format.

Source: [Letta Docs](https://docs.letta.com/core-concepts/)

## Benchmarks

- LoCoMo: 74.0% accuracy on GPT-4o mini (vs Mem0's 68.5%)
- Terminal-Bench: #4 overall, #1 for open-source
- **All vendor benchmarks are contested** -- each vendor benchmarks favorably for themselves

## Adoption

- GitHub: ~21.9k stars, 2.3k forks, 100+ contributors, v0.16.7 (March 31, 2026)
- Funding: $10M seed led by Felicis at $70M valuation
- Angels: Jeff Dean, Clem Delangue (HuggingFace), Cristobal Valenzuela (Runway)
- Team: Charles Packer (CEO, UC Berkeley PhD), Sarah Wooders (CTO, UC Berkeley PhD)
- Advisors: Ion Stoica (Spark/Ray), Joseph Gonzalez (UC Berkeley)
- Case studies: Kognitos ($500K contract expansion), 11x (3 -> 85 customers overnight), Hunt Club

Sources: [GitHub](https://github.com/letta-ai/letta), [TechCrunch](https://techcrunch.com/2024/09/23/letta-one-of-uc-berkeleys-most-anticipated-ai-startups-has-just-come-out-of-stealth/)

## Implications for Agent-Native KB Design

1. **Self-editing memory is a different paradigm** -- the agent manages its own knowledge, not a retrieval system serving the agent. For a KB MCP server, this is NOT the right model -- the KB should serve the agent, not be managed by it
2. **Core memory blocks** (always in-context, editable) could inspire a "pinned context" feature: key facts about the KB always in the agent's context
3. **The "memory pressure" pattern** is relevant: KB MCP servers should help agents manage context budgets by returning concise, ranked results
4. **Letta's higher commitment cost** (full runtime adoption) is a cautionary example -- KB tools should be pluggable, not require architectural buy-in
