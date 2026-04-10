---
title: Production Systems Using Voting/Consensus for Knowledge Consolidation
type: evidence
sources:
  - title: "KARMA: Leveraging Multi-Agent LLMs for Automated Knowledge Graph Enrichment"
    authors: "Yuxing Lu, Jinzhuo Wang"
    venue: "NeurIPS 2025 Spotlight, arXiv 2502.06472"
    url: "https://arxiv.org/abs/2502.06472"
  - title: "DelphiAgent: A trustworthy multi-agent verification framework for automated fact verification"
    venue: "Information Processing & Management, ScienceDirect"
    url: "https://www.sciencedirect.com/science/article/abs/pii/S0306457325001827"
  - title: "LLM-Driven Retrieval, Debate, and Verification for Robust Knowledge"
    venue: "SemTab Challenge 2025"
    url: "https://sem-tab-challenge.github.io/2025/papers/paper_1.pdf"
  - title: "From LLMs to Knowledge Graphs: Building Production-Ready Graph Systems in 2025"
    url: "https://medium.com/@claudiubranzan/from-llms-to-knowledge-graphs-building-production-ready-graph-systems-in-2025-2b4aff1ec99a"
---

## KARMA — Knowledge Graph Enrichment (Lu & Wang, NeurIPS 2025)

The closest production-grade system to what /consolidate needs, using multi-agent consensus for knowledge consolidation.

### Architecture: 9 Collaborative Agents
1. Document Retrieval Agent
2. Filtering Agent
3. Summarization Agent
4. Entity Extraction Agent
5. Relationship Extraction Agent
6. Schema Alignment Agent
7. **Conflict Resolution Agent** (CRA)
8. **Evaluator Agent**
9. Central Controller

### Conflict Resolution Mechanism
The CRA uses LLM-based debate when new triplets conflict with existing knowledge:
- Receives both new and existing conflicting triplet
- Classifies as: "Contradict," "Agree," or "Ambiguous"
- "Contradict" → discard or queue for expert review based on confidence

### Multi-Layer Assessment
Three-dimensional scoring for each candidate triplet:
- **Confidence C(t)**: Aggregated verification signals via weighted combination + logistic function
- **Clarity Cl(t)**: Terminological unambiguity assessment
- **Relevance R(t)**: Domain significance and KG alignment

Integration decision: integrate(t) = 1 if [C(t) + Cl(t) + R(t)]/3 ≥ Θ

### Cross-Agent Verification Pipeline
Sequential validation before KG integration:
Entity Extraction → Relationship Extraction → Schema Alignment → Conflict Resolution → Evaluator → Integration

### Results
- 1,200 PubMed articles across three domains
- 38,230 new entities identified
- 83.1% LLM-verified correctness
- 18.6% conflict edges removed through multi-layer assessment
- Ablation: removing CRA dropped correctness from 0.831 to 0.790

## DelphiAgent — Fact Verification (2025)

Multi-agent verification framework inspired by the Delphi method, specifically for automated fact verification. Uses multi-round deliberation with structured feedback integration to verify factual claims.

## Microsoft GraphRAG (2024)

While not directly a voting system, GraphRAG uses community detection to identify consensus clusters in extracted knowledge:
- Pioneered community-based summarization for knowledge consolidation
- Groups related entities and relationships, then generates community-level summaries
- Implicitly resolves conflicts by clustering semantically similar claims
- Production deployment: open-source in 2024, with organizations achieving 300-320% ROI

## Iterative Consensus Ensemble — ICE (2025)

Production-oriented pattern where an ensemble of LLMs exchanges reasoning steps and converges on consensus:
- Raised performance from 46.9% to 68.2% on PhD-level reasoning (+21.3 pp)
- Each model's reasoning is shared with others for iterative refinement
- Convergence detected when answers stabilize across rounds

## LLM-Based Delphi in Practice

Studies using LLM panels as simulated expert consensus:
- 93.3% consensus rate (vs 81.5% for human experts)
- Three-round protocol: independent → feedback integration → pairwise debate
- Applied in medical guideline consensus, technology forecasting
- Practical advantage: no engagement fatigue, unlimited rounds possible
