# Evidence: Knowledge Retrieval in Support/CX Agents (D4)

**Dimension:** D4 — Knowledge Retrieval in Support/CX Agents
**Date:** 2026-04-03
**Sources:** Vendor documentation, published research, case studies, benchmark papers
**Sub-report evidence:** fanout/2026-04-02-fanout/vector-db-cx-agent-retrieval/evidence/ (11 files)

---

## Key Findings

### Finding: Intercom Fin uses custom models at every retrieval stage with teacher-student distillation
**Confidence:** CONFIRMED
**Evidence:** [fin.ai/research](https://fin.ai/research/finetuning-retrieval-for-fin/); [Reranker research](https://fin.ai/research/how-we-built-a-world-class-reranker-for-fin/)

Pipeline: Query Refinement -> RAG (custom retrieval + reranking + generation) -> Validation. Custom `fin-cx-retrieval` (fine-tuned on 3K queries), `fin-cx-reranker` (ModernBERT, outperforms Cohere Rerank v3.5). Teacher-student: LLM reranker first, distilled into small model — 80% cost reduction, <1s latency.

### Finding: Content quality is the biggest lever — Anthropic went from 36% to 50.8% through KB optimization
**Confidence:** CONFIRMED
**Evidence:** [Intercom Fin AI Engine docs](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine); case study data

Anthropic (the company, as an Intercom customer) improved Fin resolution from 36% to 50.8% in one month primarily through content optimization, not architecture changes.

### Finding: Sierra's tau-3-Bench shows best models succeed on only ~25% of realistic CX tasks
**Confidence:** CONFIRMED
**Evidence:** [sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice](https://sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice)

Even with perfect information: ~40% success. Reasoning + execution is the bottleneck, not retrieval.

### Finding: Universal patterns across production CX agents
**Confidence:** CONFIRMED (multiple independent sources)
**Evidence:** Cross-analysis of Intercom, Sierra, Decagon, Zendesk, Ada

All share: hybrid search, custom reranking, multi-source retrieval, validation/grounding, citation generation, confidence-based escalation. Decagon adds knowledge graph; Sierra adds constellation of 15+ models; Zendesk adds content gap detection.

### Finding: CX resolution rate claims vary widely and use different definitions
**Confidence:** INFERRED
**Evidence:** Intercom 67%, Decagon 90%, Zendesk 80%, Ada 80%+. Different methodologies.

---

## Gaps / Follow-ups

* No standardized CX benchmark exists — each vendor measures differently
* Limited technical disclosure from Decagon (no published papers)
