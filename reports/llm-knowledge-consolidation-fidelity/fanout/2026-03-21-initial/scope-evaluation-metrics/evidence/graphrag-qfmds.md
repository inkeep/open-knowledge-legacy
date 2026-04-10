---
title: "GraphRAG: Graph-Based Query-Focused Summarization"
source_url: https://arxiv.org/html/2404.16130v2
source_type: academic_paper
authors: Darren Edge, Ha Trinh, Newman Cheng, Joshua Bradley, Alex Chao, Apurva Mody, Steven Truitt, Jonathan Larson (Microsoft Research)
date_accessed: 2026-03-21
relevance: D6 — Scope-aware consolidation via graph-structured query-focused summarization
---

## Key Findings

GraphRAG demonstrates a graph-based approach to query-focused multi-document summarization (QFMDS) that outperforms vector RAG on comprehensiveness and diversity metrics.

### Methodology
1. **Text Chunking**: Documents divided into ~600 token chunks with 100-token overlaps
2. **Entity/Relationship Extraction**: LLM extracts entities, descriptions, relationships, and claims from each chunk, with self-reflection to improve extraction completeness
3. **Knowledge Graph Assembly**: Extracted elements deduplicated and aggregated into a unified graph where nodes = entities, edges = relationships
4. **Hierarchical Community Detection**: Leiden algorithm recursively partitions the graph into nested community levels
5. **Community Summaries**: Report-like summaries generated for each community, prioritized by node prominence

### Query-Focused Summarization Process (Map-Reduce)
- **Map phase**: LLM generates intermediate answers from each community summary chunk, scoring helpfulness (0-100)
- **Reduce phase**: Intermediate answers sorted by helpfulness, iteratively combined, then synthesized into final answer

### Performance Results
- All GraphRAG conditions significantly outperformed vector RAG on comprehensiveness (72-83% win rates, p<.001) and diversity (62-82% win rates, p<.001)
- Intermediate community levels (C1-C2) performed best
- Root-level GraphRAG (C0) achieved 72% comprehensiveness wins over vector RAG while requiring 97% fewer tokens than source text summarization

### Relevance to Consolidation
- Demonstrates how hierarchical structure enables scope-aware extraction at multiple granularity levels
- Community detection naturally clusters related information, enabling relevance filtering by topic proximity
- Map-reduce with helpfulness scoring provides a mechanism for scope-aware filtering during consolidation
