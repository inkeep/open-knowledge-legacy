---
title: "Knowledge-Intensive Query-Focused Summarization and QFMDS Survey"
source_url: https://dl.acm.org/doi/abs/10.1145/3597299
source_type: academic_paper
authors: Various (ACM Computing Surveys review, plus ICPR 2024 knowledge-intensive approach)
date_accessed: 2026-03-21
relevance: D6 — Foundational techniques for query-focused multi-document summarization
---

## Key Findings

### QFMDS Definition and Challenges
Query-focused multi-document summarization (QFMDS) extracts a summary from a document cluster based on a user query. Key challenges:
- Handling differences and similarities across related document sets
- High degree of redundancy across multiple sources
- Maintaining relevance to the given query
- Ensuring topic diversity in the output
- Managing small source-to-summary compression ratios

### Approaches

**Extractive**: Select sentences directly from sources based on query relevance scores
**Abstractive**: Generate new text that synthesizes information from sources around the query
**Hybrid**: Extract relevant passages, then generate abstractive summaries from them

### Knowledge-Intensive Approach (ICPR 2024)
- Retrieves potentially relevant documents from large-scale knowledge corpus based on textual query
- Eliminates dependence on pre-existing document sets
- Integrates LLM-based summarizer with carefully tailored prompt
- Ensures output is comprehensive and relevant to query

### QuerySum Dataset
- 27,041 data samples covering diverse topics
- Quality guaranteed through human verification
- Augmented with similar query clusters for robustness

### Semantic Diversity Approach (SDbQfSum)
- Combines semantically parsed document text with knowledge-based vectorial representation
- Extracts effective sentence importance and query-relevance features

### Relevance to Consolidation
- QFMDS is the closest established research area to "scope-aware consolidation"
- The query in QFMDS is analogous to the consolidation scope/goal
- Key difference: QFMDS aims for brevity within scope; consolidation aims for completeness within scope
- Redundancy handling in QFMDS directly applicable: consolidation must also deduplicate across sources
- The knowledge-intensive approach's dynamic retrieval is relevant when consolidation sources are not predefined
