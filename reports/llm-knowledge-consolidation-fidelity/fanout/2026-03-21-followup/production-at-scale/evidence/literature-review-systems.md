---
title: Automated Literature Review and Enterprise Consolidation Systems
type: primary-source-synthesis
sources:
  - url: https://www.semanticscholar.org/product/tldr
    title: "Semantic Scholar TLDR Feature"
    publisher: Semantic Scholar (Allen Institute for AI)
  - url: https://digitalorientalist.com/2025/03/18/tools-for-literature-mapping/
    title: "Tools for Literature Mapping"
    publisher: The Digital Orientalist
  - url: https://arxiv.org/abs/2507.03226
    title: "Towards Practical GraphRAG: Efficient Knowledge Graph Construction at Scale"
    publisher: arXiv
    year: 2025
  - url: https://xenoss.io/blog/enterprise-knowledge-base-llm-rag-architecture
    title: "Building an Enterprise AI Knowledge Base with RAG and Agentic AI"
    publisher: Xenoss
  - url: https://slite.com/learn/llm-knowledge-base
    title: "Our Guide to an LLM Knowledge Base"
    publisher: Slite
date_accessed: 2026-03-21
---

## Semantic Scholar TLDR

- Auto-generates single-sentence paper summaries
- Uses GPT-3 style techniques for concise "decide whether to read" summaries
- Single-document summarization only — no cross-paper consolidation
- Foundation layer for downstream tools (Litmaps, Elicit)

## Litmaps

- Sources 270M+ articles from Semantic Scholar, Crossref, OpenAlex
- Covers PubMed, arXiv, bioRxiv, medRxiv, Web of Science, Scopus
- Visualizes academic relationships via bibliographic coupling and co-citation analysis
- Interactive citation maps: forward (citing) and backward (cited) relationships
- Visual approach to literature discovery — not synthesis/consolidation

## GraphRAG at Scale

### Production Architecture
- Dependency parsing instead of LLM-based extraction: 94% of LLM performance (61.87% vs 65.83%) at dramatically reduced cost
- Hybrid retrieval: vector similarity + graph traversal via Reciprocal Rank Fusion (RRF)
- Separate embeddings for entities, chunks, and relations (multi-granular matching)
- Hierarchical Leiden clustering → community summaries by LLM
- Up to 15% improvement over vanilla vector retrieval baselines

### Scale Efficiency
- LightRAG: comparable accuracy with 10x token reduction via dual-level retrieval
- 1,500+ documents/month: 65-80% cost savings while maintaining quality
- LinkedIn GraphRAG: ticket resolution time reduced from 40 hours to 15 hours (63% improvement)

## Enterprise Knowledge Consolidation

### Common Pattern
- Most organizations: 10-20+ knowledge systems simultaneously (wikis, tickets, docs, chat, email, HR)
- Each system is a silo with own search, access rules, organizational logic
- RAG gives model access to searchable knowledge base at inference time

### Production Results
- From answering 7,000 queries → answering "essentially any question" across 100,000 documents
- RAG-based internal knowledge: discovery to production in 4-6 weeks
- Immediate reduction in employee search time

### DoorDash Support Consolidation
- Hundreds of thousands of daily support calls
- 2.5-second response latency
- Claude 3 Haiku via Amazon Bedrock
- 50x increase in testing capacity
- Two-tiered guardrails: 90% hallucination reduction, 99% compliance improvement
- GetRagResult API: shared infrastructure for team-specific chatbots with isolated collections

### Amazon Finance Automation
- RAG accuracy: 49% → 86% through iterative improvement
- Key levers: document chunking, prompt engineering, embedding model selection
