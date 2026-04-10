# Evidence: Filesystem Tools vs Semantic Tools

**Dimension:** D1 — Filesystem tools vs semantic tools — benchmarks and evidence
**Date:** 2026-04-02
**Sources:** Cursor blog, Augment/Jason Liu blog, SWE-agent, Mini-SWE-agent, SocratiCode, Letta, Amazon Science, Schema First APIs paper

---

## Key files / pages referenced

- https://cursor.com/blog/semsearch — Cursor A/B test: semantic search vs grep-only
- https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/ — Augment's grep-over-embeddings finding
- https://github.com/SWE-agent/mini-swe-agent — Mini-SWE-agent: 74% on SWE-bench with bash only
- https://github.com/giancarloerra/SocratiCode — SocratiCode: hybrid search vs grep benchmark
- https://www.letta.com/blog/benchmarking-ai-agent-memory — Letta: filesystem-based memory achieves 74% on LoCoMo
- https://arxiv.org/abs/2603.13404 — Schema First Tool APIs: controlled study of tool interface design
- https://arxiv.org/abs/2602.23368 — Amazon Science: keyword search with agentic tool use

---

## Findings

### Finding: Grep/bash-only agents achieve competitive performance on SWE-bench
**Confidence:** CONFIRMED
**Evidence:** Mini-SWE-agent GitHub README, SWE-agent project

Mini-SWE-agent achieves 74% on SWE-bench Verified using only bash — no function calling, no specialized tools. The agent "does not have any tools other than bash" and "doesn't even need to use the tool-calling interface of the LMs." Created by the Princeton/Stanford SWE-bench team. Adopted by Meta, NVIDIA, Essential AI.

The SWE-agent creators note: "Back in 2024, there was emphasis on tools and special interfaces for the agent, but one year later, as LMs have become more capable, a lot of this is not needed at all to build a useful agent."

**Implications:** For coding tasks on small-to-medium repos, filesystem tools are sufficient. Agent model capability matters more than tool sophistication.

---

### Finding: Semantic search provides measurable but modest improvements over grep in production
**Confidence:** CONFIRMED
**Evidence:** Cursor blog (https://cursor.com/blog/semsearch)

Cursor conducted a controlled A/B test:
- Offline benchmark (Cursor Context Bench): 12.5% higher accuracy with semantic search (6.5%-23.5% depending on model)
- Online A/B test code retention: +0.3% overall, +2.6% on codebases with 1,000+ files
- User dissatisfaction: +2.2% more dissatisfied follow-ups without semantic search

Key caveat: "The effect size is lower here since the A/B test is on all agent queries and not all requests require search." The combination of grep AND semantic search produces the best outcomes.

**Implications:** Semantic search helps, especially on large codebases, but the effect is incremental, not transformational. The optimal approach is both grep AND semantic search.

---

### Finding: Hybrid search uses dramatically fewer tokens than grep-only at scale
**Confidence:** CONFIRMED
**Evidence:** SocratiCode GitHub (https://github.com/giancarloerra/SocratiCode)

On VS Code's 2.45M-line codebase: hybrid semantic+BM25 search uses 61% fewer tokens, 84% fewer tool calls, and is 37x faster than standard AI grep for architectural questions.

SocratiCode combines dense vector (semantic) search with BM25 lexical search via Reciprocal Rank Fusion (RRF). Files are split at function/class boundaries using AST parsing, not arbitrary line counts.

**Implications:** At enterprise scale (millions of lines), hybrid search dramatically outperforms grep-only. The advantage is primarily in token efficiency, not accuracy per se.

---

### Finding: Agent persistence compensates for tool simplicity — but doesn't scale
**Confidence:** CONFIRMED
**Evidence:** Jason Liu / Augment (https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/)

Augment's SWE-bench agent: "Agent would use simple tools like grep and find persistently, trying different approaches until it found what it needed." Agent persistence compensated for less sophisticated tools.

But this doesn't scale to: (1) large codebases (millions of files), (2) unstructured natural language content, (3) third-party code outside training data, (4) non-text media retrieval.

SWE-bench repos are small; 90% of problems take <1 hour for a good engineer. Real-world codebases are much larger.

**Implications:** "Grep is enough" is true for SWE-bench but not necessarily for production knowledge bases with 100-1000 articles of natural language content.

---

### Finding: Filesystem-based memory achieves 74% on LoCoMo benchmark
**Confidence:** CONFIRMED
**Evidence:** Letta blog (https://www.letta.com/blog/benchmarking-ai-agent-memory)

"Letta agents running on gpt-4o-mini achieve 74.0% accuracy on LoCoMo by simply storing conversation histories in files." Suggests memory is more about context management than retrieval mechanism.

**Implications:** For memory/retrieval tasks, simple filesystem abstractions can perform well. But LoCoMo may not adequately test the scenarios where specialized tools shine.

---

### Finding: Schema-based tool interfaces reduce format errors but don't improve task completion
**Confidence:** CONFIRMED
**Evidence:** Sigdel et al., arXiv:2603.13404

Controlled study comparing three interface conditions: (1) free-form documentation, (2) JSON Schema specs, (3) JSON Schema + structured diagnostics. "Schema conditions reduce interface misuse but not semantic misuse." Task success "remains zero across conditions" — semantic action quality and timeout-sensitive tasks dominate.

**Implications:** Structured tool schemas prevent format errors (good hygiene) but the real challenge is semantic — does the agent know WHAT to do, not HOW to call the tool.

---

### Finding: Keyword search with agentic tool use achieves >90% of vector RAG performance
**Confidence:** CONFIRMED
**Evidence:** Amazon Science, arXiv:2602.23368

Agentic tool use with keyword search achieves 94.5% faithfulness, 88% context recall, 91.5% answer correctness — over 90% of RAG-level performance without a vector database.

**Implications:** If the agent controls the retrieval strategy (chooses queries, refines, retries), even simple keyword search is sufficient. The intelligence is in the agent, not the retrieval infrastructure.

---

## Gaps / follow-ups

* No head-to-head benchmark of filesystem-style MCP tools vs domain-specific semantic MCP tools for knowledge retrieval (not code). The existing evidence is mostly about code navigation.
* Cursor's A/B test is the only controlled experiment in production; more would strengthen conclusions.
* The Amazon Science finding and the SocratiCode benchmark test different things (QA vs code navigation) but both point to hybrid approaches being optimal.
