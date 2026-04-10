---
title: "Scope-Aware Consolidation: Relevance Filtering with Completeness Preservation"
description: "Evidence compilation covering Query-Focused Multi-Document Summarization (QFMDS) adapted for completeness rather than brevity, GraphRAG community structure for natural scope boundaries (72-83% comprehensiveness win rate, 97% fewer tokens), knowledge-intensive QFS, goal-directed and rubric-scoped extraction, and techniques for detecting accidental scope-filtering drops (bidirectional coverage checking, nugget recall auditing, iterative scope-expansion)."
created: 2026-03-21
last-updated: 2026-03-21
---

## 1. Query-Focused Multi-Document Summarization (QFMDS)

### Definition and Core Problem

Query-focused multi-document summarization (QFMDS) extracts a summary from a document cluster based on a user query. It is the closest established research area to "scope-aware consolidation" -- the query in QFMDS is analogous to the consolidation scope or goal.

**Key distinction**: QFMDS aims for brevity within scope; consolidation aims for completeness within scope. This inversion -- preserving all in-scope information rather than selecting the most salient subset -- is the fundamental adaptation required.

**Source**: ACM Computing Surveys review (https://dl.acm.org/doi/abs/10.1145/3597299)

### Core Challenges

- Handling differences and similarities across related document sets
- High degree of redundancy across multiple sources (directly applicable to consolidation deduplication)
- Maintaining relevance to the given query
- Ensuring topic diversity in the output
- Managing small source-to-summary compression ratios

### Approaches

| Approach | Description | Consolidation Applicability |
|----------|-------------|----------------------------|
| **Extractive** | Select sentences directly from sources based on query relevance scores | Limited -- loses coherence across sources |
| **Abstractive** | Generate new text synthesizing information from sources around the query | Primary approach for consolidation |
| **Hybrid** | Extract relevant passages, then generate abstractive summaries from them | Most practical for scope-aware consolidation |

### Redundancy Handling

QFMDS research on redundancy handling is directly applicable to consolidation: when multiple source documents contain overlapping information, the system must deduplicate while preserving all unique facets. This is a core requirement for consolidation fidelity.

---

## 2. GraphRAG: Graph-Based Scope-Aware Summarization

### Architecture

GraphRAG demonstrates a graph-based approach to QFMDS that uses hierarchical community structure to enable scope-aware extraction at multiple granularity levels.

**Source**: Edge et al. (Microsoft Research), "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (https://arxiv.org/html/2404.16130v2)

### Pipeline

1. **Text Chunking**: Documents divided into ~600 token chunks with 100-token overlaps
2. **Entity/Relationship Extraction**: LLM extracts entities, descriptions, relationships, and claims from each chunk, with self-reflection to improve extraction completeness
3. **Knowledge Graph Assembly**: Extracted elements deduplicated and aggregated into a unified graph (nodes = entities, edges = relationships)
4. **Hierarchical Community Detection**: Leiden algorithm recursively partitions the graph into nested community levels
5. **Community Summaries**: Report-like summaries generated for each community, prioritized by node prominence

### Query-Focused Map-Reduce Process

- **Map phase**: LLM generates intermediate answers from each community summary chunk, scoring helpfulness (0-100)
- **Reduce phase**: Intermediate answers sorted by helpfulness, iteratively combined, then synthesized into final answer

### Empirical Results

| Metric | GraphRAG Win Rate vs. Vector RAG | Significance |
|--------|----------------------------------|--------------|
| **Comprehensiveness** | 72-83% | p < .001 |
| **Diversity** | 62-82% | p < .001 |

- Intermediate community levels (C1-C2) performed best overall
- Root-level GraphRAG (C0) achieved **72% comprehensiveness wins** over vector RAG while requiring **97% fewer tokens** than source text summarization

### Scope-Aware Properties

- Community detection naturally clusters related information, enabling relevance filtering by topic proximity
- Hierarchical structure enables scope-aware extraction at multiple granularity levels -- broader scope uses higher community levels, narrower scope uses lower levels
- Map-reduce with helpfulness scoring provides a mechanism for scope-aware filtering during consolidation
- Community boundaries serve as natural scope boundaries, reducing the risk of accidental scope-filtering drops

---

## 3. Knowledge-Intensive Query-Focused Summarization

### Dynamic Retrieval Approach (ICPR 2024)

A knowledge-intensive approach to QFS eliminates dependence on pre-existing document sets by:

- Retrieving potentially relevant documents from large-scale knowledge corpora based on textual query
- Integrating an LLM-based summarizer with carefully tailored prompts
- Ensuring output is comprehensive and relevant to the query

**Source**: ICPR 2024 knowledge-intensive approach, referenced in ACM Computing Surveys (https://dl.acm.org/doi/abs/10.1145/3597299)

**Consolidation relevance**: When consolidation sources are not predefined, dynamic retrieval enables scope-aware gathering of source material before consolidation begins.

### QuerySum Dataset

- 27,041 data samples covering diverse topics
- Quality guaranteed through human verification
- Augmented with similar query clusters for robustness

---

## 4. Semantic Diversity in Query-Focused Extraction

### SDbQfSum Approach

Combines semantically parsed document text with knowledge-based vectorial representation to extract effective sentence importance and query-relevance features.

**Consolidation relevance**: Semantic diversity scoring can detect when scope filtering accidentally drops a topically distinct but in-scope cluster of information.

---

## 5. Techniques for Detecting Accidental Scope-Filtering Drops

### Bidirectional Coverage Checking

Scope-aware consolidation requires checking coverage in both directions:

1. **Forward check (faithfulness)**: Every claim in the output must be supported by a source document
2. **Backward check (completeness)**: Every in-scope claim in the source documents must appear in the output

The backward check is the critical one for detecting accidental drops -- information that was in-scope but got filtered out during the consolidation process.

### Nugget Recall Auditing

Adapting the AutoNuggetizer framework (see evaluation-metrics evidence) to scope-aware consolidation:

1. Decompose source documents into atomic nuggets
2. Classify each nugget as in-scope or out-of-scope relative to the consolidation goal
3. Verify that all in-scope nuggets appear in the consolidated output
4. Nuggets classified as "vital" (must be present) vs. "okay" (supplementary) map directly to scope priority

### Iterative Scope-Expansion

When initial scope definition is ambiguous, iterative expansion can prevent premature filtering:

1. Start with a narrow scope interpretation
2. Consolidate within that scope
3. Review borderline source material that was excluded
4. Expand scope if borderline material contains information necessary for completeness
5. Repeat until scope boundaries are stable

### GraphRAG Community Boundaries as Scope Detectors

GraphRAG's community structure provides a structural mechanism for scope boundary detection:

- Information within the same community is topically coherent and likely in-scope together
- Information crossing community boundaries may indicate scope boundary crossings
- Hierarchical community levels enable multi-resolution scope checking

---

## 6. Goal-Directed and Rubric-Scoped Extraction

### Adapting QFMDS for Completeness

The key adaptation from QFMDS to scope-aware consolidation is replacing the brevity objective with a completeness objective:

| QFMDS Objective | Consolidation Adaptation |
|-----------------|--------------------------|
| Select most salient information | Preserve all in-scope information |
| Minimize output length | Minimize information loss |
| Maximize relevance per token | Maximize coverage of in-scope claims |
| Score by informativeness | Score by completeness + faithfulness |

### Rubric-Scoped Extraction

Defining explicit rubrics for scope boundaries enables systematic extraction:

1. **Scope definition**: Explicit criteria for what is in-scope vs. out-of-scope
2. **Extraction pass**: Extract all information matching scope criteria
3. **Verification pass**: Check extracted information against scope rubric for false positives and false negatives
4. **Consolidation pass**: Merge deduplicated in-scope information into coherent output

---

## Primary Sources

1. Edge, D., Trinh, H., Cheng, N., Bradley, J., Chao, A., Mody, A., Truitt, S., & Larson, J. (Microsoft Research). "From Local to Global: A Graph RAG Approach to Query-Focused Summarization." https://arxiv.org/html/2404.16130v2

2. ACM Computing Surveys. "Query-Focused Multi-Document Summarization: Survey and Approaches." https://dl.acm.org/doi/abs/10.1145/3597299
