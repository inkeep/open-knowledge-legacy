# Evidence: How Coding Agents Retrieve Context (D2)

**Dimension:** D2 — How Coding Agents Retrieve Context
**Date:** 2026-04-03
**Sources:** Official documentation, practitioner blogs, benchmarks, OSS repos
**Sub-report evidence:** fanout/2026-04-02-fanout/coding-agent-local-kb-retrieval/evidence/ (7 files)

---

## Key Findings

### Finding: Claude Code dropped RAG for agentic search (grep/glob/read)
**Confidence:** CONFIRMED
**Evidence:** Boris Cherny quote via [vadim.blog](https://vadim.blog/claude-code-no-indexing): "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better."

Three-tool hierarchy: Glob (cheapest, path patterns) -> Grep (medium, ripgrep content) -> Read (expensive, full file). Compensates with parallel triangulation searches. Explore sub-agents on Haiku, up to 7 simultaneously, read-only.

### Finding: Cursor adds 12.5% accuracy with semantic search on large codebases
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/blog/semsearch](https://cursor.com/blog/semsearch)

Custom embedding model trained on agent session traces. Architecture: tree-sitter chunking -> Merkle tree change detection -> cloud embedding -> Turbopuffer storage -> two-stage retrieval (vector + AI reranking).

### Finding: At enterprise scale, grep-only is dramatically inferior to hybrid
**Confidence:** CONFIRMED
**Evidence:** [SocratiCode benchmark](https://github.com/giancarloerra/SocratiCode) on VS Code 2.45M-line codebase

Hybrid semantic+BM25: 5 steps. Grep-only: 31 steps. 61% fewer tokens, 84% fewer tool calls, 37x faster.

### Finding: SWE-bench validates grep/find as sufficient for task-scoped retrieval
**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/research/swe-bench-sonnet](https://www.anthropic.com/research/swe-bench-sonnet); Augment/SWE-bench interview with Jason Liu via [jxnl.co](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/)

### Finding: Agentic search offloads embedding model semantics to LLM reasoning
**Confidence:** INFERRED
**Evidence:** Morph analysis (community blog)

"The question is not grep vs embeddings but who does the semantic reasoning — a frozen embedding model or a live reasoning model?"

### Finding: Cognition's SWE-grep uses RL-trained models for retrieval at 8 parallel tool calls/turn
**Confidence:** CONFIRMED
**Evidence:** [cognition.ai/blog/swe-grep](https://cognition.ai/blog/swe-grep)

---

## Negative Searches

* Searched for: Steve Krouse (Val Town) primary source for "grep is all you need" → NOT FOUND (widely attributed but no verifiable primary source)
* Searched for: Windsurf detailed retrieval architecture documentation → Partial (privacy-first local embeddings confirmed, but internal architecture undocumented)
