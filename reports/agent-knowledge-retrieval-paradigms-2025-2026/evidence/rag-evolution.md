# Evidence: RAG Evolution and Current State (D1)

**Dimension:** D1 — RAG Evolution and Current State
**Date:** 2026-04-03
**Sources:** Academic papers, lab publications, production case studies
**Sub-report evidence:** fanout/2026-04-02-fanout/rag-evolution-lab-publications/evidence/ (10 files)

---

## Key Findings

### Finding: Classic RAG has seven documented failure modes rooted in chunking

**Confidence:** CONFIRMED
**Evidence:** Barnett et al., "Seven Failure Points When Engineering a RAG System," arXiv:2401.05856, January 2024

Seven failure modes: missing content, missed top-k, consolidation failure, extraction failure, wrong format, incorrect specificity, incompleteness. Root cause is fixed-size chunking destroying semantic boundaries.

### Finding: Advanced RAG (contextual retrieval + hybrid search + reranking) reduces failure by 67%

**Confidence:** CONFIRMED
**Evidence:** [Anthropic Contextual Retrieval blog](https://www.anthropic.com/news/contextual-retrieval), September 2024

Results: contextual embeddings alone = 35% failure reduction; + BM25 hybrid = 49%; + reranking = 67%.

### Finding: Agentic RAG with keyword search achieves >90% of vector RAG performance

**Confidence:** CONFIRMED (single study)
**Evidence:** Amazon Science, arXiv:2602.23368, 2025/2026

Specific numbers: 94.52% faithfulness, 88.05% context recall, 91.48% answer correctness. Uses keyword search via agentic tool use without vector database.

### Finding: Self-RAG improves multi-hop accuracy from ~34% to ~78%

**Confidence:** CONFIRMED
**Evidence:** Asai et al., NeurIPS 2023 / ICLR 2024, arXiv:2310.11511

### Finding: GraphRAG costs ~$33K for large dataset indexing; lightweight alternatives reduce to 0.1%

**Confidence:** CONFIRMED
**Evidence:** Edge et al., EMNLP 2024, arXiv:2404.16130; Microsoft LazyGraphRAG blog, November 2024

### Finding: Long context and RAG are complementary, not competing

**Confidence:** CONFIRMED (multiple studies)
**Evidence:** LaRA (ICML 2025); Liu et al. "Lost in the Middle" (TACL 2024, arXiv:2307.03172)

RAG costs \~$0.00008/query vs \~$0.10 for long context (1,250x). Lost-in-the-middle effect persists. LaRA: no universal winner.

### Finding: The 2025-2026 consensus is agent-controlled retrieval with hybrid search as baseline

**Confidence:** INFERRED (convergence across multiple independent sources)
**Evidence:** Multiple — Singh et al. survey (arXiv:2501.09136), Amazon Science paper, Anthropic context engineering, Claude Code production data

---

## Negative Searches

* Searched for: rigorous benchmarks comparing RAG vs context-stuffing at exactly 100-1000 article scale → NOT FOUND (evidence exists at extremes but not at this specific scale)
* Searched for: academic consensus statement or meta-analysis on RAG approaches → NOT FOUND (individual papers converge but no formal meta-analysis exists)

