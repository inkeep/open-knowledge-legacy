---
name: Agentic RAG — Self-RAG, CRAG, and Agent-Controlled Retrieval
description: The shift from hardcoded retrieval pipelines to agent-controlled retrieval decisions (2023-2026)
type: evidence
dimension: D1.3
confidence: high
sources:
  - title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection"
    authors: "Asai et al."
    venue: "NeurIPS 2023 (presented), ICLR 2024 (published), arXiv:2310.11511"
    date: "2023-10"
    url: "https://arxiv.org/abs/2310.11511"
  - title: "Corrective Retrieval Augmented Generation (CRAG)"
    authors: "Yan et al."
    venue: "arXiv:2401.15884"
    date: "2024-01"
    url: "https://arxiv.org/abs/2401.15884"
  - title: "Agentic RAG Survey"
    authors: "Singh et al."
    venue: "arXiv:2501.09136"
    date: "2025-01"
    url: "https://arxiv.org/abs/2501.09136"
  - title: "RAG is Dead. Long Live Agentic Retrieval"
    authors: "LlamaIndex"
    venue: "LlamaIndex blog"
    date: "2025"
    url: "https://www.llamaindex.ai/blog/rag-is-dead-long-live-agentic-retrieval"
  - title: "Keyword Search is All You Need"
    authors: "Amazon Science"
    venue: "arXiv:2602.23368"
    date: "2025-12 / 2026-02"
    url: "https://www.amazon.science/publications/keyword-search-is-all-you-need-achieving-rag-level-performance-without-vector-databases-using-agentic-tool-use"
---

# Agentic RAG

## The Core Shift

Pipeline RAG: a fixed sequence (query → embed → retrieve top-k → generate). The retrieval decisions are made by the system designer at build time.

Agentic RAG: the agent decides **what** to retrieve, **when** to retrieve, and **how** to retrieve. Retrieval becomes a tool the agent uses, not a pipeline it's embedded in.

LlamaIndex's framing: "RAG isn't 'always retrieve k chunks.' It's a decision stack." The agent decides its own search strategy, can reformulate queries when results are poor, and iterates until confident.

## Self-RAG (Asai et al., NeurIPS 2023 / ICLR 2024)

**Key idea**: Train the LLM to decide whether retrieval is needed, and if so, to critique the retrieved results before using them.

The model generates special "reflection tokens":
- **Retrieve token**: Should I retrieve? (yes/no)
- **IsRel token**: Is the retrieved passage relevant?
- **IsSup token**: Does the passage support my generation?
- **IsUse token**: Is my overall response useful?

This makes the model self-aware about retrieval quality. It can skip retrieval when it already knows the answer and reject irrelevant retrieved passages instead of hallucinating from them.

**Impact**: Pushed complex multi-hop reasoning accuracy from ~34% (naive RAG) toward ~78%.

## CRAG — Corrective Retrieval Augmented Generation (Yan et al., 2024)

**Key idea**: Add a "retrieval evaluator" that assesses whether retrieved documents are relevant before passing them to the generator.

Three actions based on evaluation:
1. **Correct** — retrieved docs are relevant, use them
2. **Incorrect** — retrieved docs are irrelevant, trigger web search as fallback
3. **Ambiguous** — partially relevant, refine the query and retrieve again

**Results**: +19% improvement on PopQA benchmark over standard RAG.

**Broader finding from the CRAG benchmark** (Meta, June 2024): Even SOTA RAG only answers 63% of questions without hallucination. Naive LLMs hit 34%. This establishes how much room remains for improvement.

## The Agentic RAG Survey (Singh et al., January 2025)

**arXiv:2501.09136** — First comprehensive survey of the agentic RAG paradigm.

Key taxonomy:
- **Single-agent agentic RAG**: One agent with retrieval tools (closest to what an MCP-connected agent does)
- **Multi-agent agentic RAG**: Specialized agents for retrieval, reasoning, validation
- **Hierarchical agentic RAG**: Manager agent delegates to specialist retrieval agents

The survey documents the shift from "retrieve then generate" to "plan, retrieve, evaluate, re-retrieve, generate, verify."

## Amazon Science: Keyword Search is All You Need (2025/2026)

**Landmark finding**: Agentic tool use with simple keyword search achieves **over 90% of RAG-level performance** without vector databases.

Specific numbers:
- 94.52% faithfulness
- 88.05% context recall
- 91.48% answer correctness

The approach: give the agent a keyword search tool over the knowledge base. The agent decides what to search, evaluates results, refines queries, and iterates. No embeddings, no vector store, no reranking.

**Implication**: The intelligence is in the agent's retrieval strategy, not the retrieval infrastructure. Simple tools + smart agents beat complex pipelines + dumb queries.

## Production Examples (2025-2026)

- **Twitch**: Uses agentic RAG for content moderation knowledge retrieval
- **Healthcare/Insurance**: Multi-step retrieval agents that pull policy documents, cross-reference with clinical guidelines, and synthesize answers
- **Claude Code**: Arguably the highest-profile production agentic RAG — glob/grep/read tools used by an agent that decides what to search and when (see evidence/agent-retrieval-production.md)

## Relevance to Knowledge Platform Design

The agentic RAG paradigm directly informs MCP server design:

1. **Expose search tools, not pre-built pipelines** — Let the agent decide what/when/how to search
2. **Simple keyword search may be sufficient** — Amazon Science shows 90%+ performance without vectors
3. **Return metadata before content** — Let the agent decide which articles to read in full
4. **Support iterative refinement** — The agent may search, read, then search again with refined queries
5. **Don't over-engineer retrieval** — The agent's reasoning compensates for simpler retrieval infrastructure
