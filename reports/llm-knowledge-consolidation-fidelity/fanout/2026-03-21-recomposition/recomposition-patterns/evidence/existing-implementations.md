---
title: Existing Recomposition Implementations and Production Systems
type: evidence
date: 2026-03-21
tags: [STORM, NexusSum, LLMxMapReduce, production-systems, implementations]
---

# Existing Recomposition Implementations

## Academic Systems

### STORM (Stanford, NAACL 2024)

LLM-powered knowledge curation system generating Wikipedia-like articles from topics. Three-stage pre-writing process:
1. **Perspective discovery**: Identify diverse viewpoints by surveying related Wikipedia articles
2. **Simulated discourse**: Simulate conversations where writers with different perspectives question a topic expert grounded in Internet sources
3. **Outline curation**: Organize collected information into structured outline, then generate article

### Key Results
- 25% absolute improvement in organization vs baseline RAG
- 10% improvement in coverage breadth
- Identifies issues: "source bias transfer and over-association of unrelated facts"
- Cannot produce publication-ready articles but helps in pre-writing

- **Source**: Shao et al. (2024). "Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models." NAACL 2024. https://arxiv.org/abs/2402.14207
- **Code**: https://github.com/stanford-oval/storm
- **Co-STORM**: Accepted at EMNLP 2024, enables human-AI collaborative knowledge curation

### NexusSum (2025)

Hierarchical multi-agent framework for long-form narrative summarization with three-stage pipeline:
1. **Preprocessor**: Converts dialogues to structured narrative prose, reducing fragmentation
2. **Narrative Summarizer**: Generates comprehensive initial summary preserving key plot points
3. **Iterative Compressor**: Dynamic length reduction through controlled compression with rollback

### Key Design Choices
- Scene-based chunking for manageable units
- 10-iteration compression maximum with rollback if target overshot
- Each stage adds cumulative quality: preprocessing +2.45, summarization +4.86, compression +1.83 BERTScore
- 30% BERTScore (F1) improvement over previous state-of-the-art

- **Source**: (2025). "NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization." https://arxiv.org/abs/2505.24575

### LLMxMapReduce-V2 (2025)

Entropy-driven convolutional refinement with topology-aware generation for generating long-form articles from extremely long sources.

### Pipeline
1. **Skeleton generation**: Aggregate from clustered references
2. **Entropy-driven refinement**: Multi-layer convolution sampling modifications weighted by information entropy
3. **Best-of-N self-refinement**: Select highest-entropy modifications (optimal at 3 iterations)
4. **Topology-aware content generation**:
   - **Leaf sections**: Focused detail utilization and cross-work comparisons
   - **Parent sections**: Synthesize subsection outputs into overarching narratives

### Key Results
- Reference precision/recall: 95.50%/95.80% (vs AutoSurvey: 50.12%/51.73%)
- Unique claims: 71.99 (vs 68.39)
- Structure quality: 95.00/100 (vs 86.00)

- **Source**: (2025). "LLM×MapReduce-V2: Entropy-Driven Convolutional Test-Time Scaling for Generating Long-Form Articles from Extremely Long Resources." https://arxiv.org/abs/2504.05732

## Production Systems

### Perplexity AI
- **Approach**: Retrieval + synthesis with inline citations
- **Architecture**: Sonar LLM + real-time web retrieval; option for GPT-4o or Claude
- **Citation style**: Inline footnote numbers with expandable source snippets
- **Synthesis depth**: Moderate — creates composite answers but doesn't deeply reconcile contradictions
- **Source**: https://www.shapeof.ai/patterns/citations

### Google AI Overviews
- **Approach**: Multi-stage pipeline (retrieval → semantic ranking → LLM re-ranking → E-E-A-T → fusion)
- **Source count**: 5-15 sources per overview
- **Citation style**: Card-based citations with groundingSupports metadata
- **Source**: https://ai.google.dev/gemini-api/docs/google-search

### Elicit
- **Approach**: Evidence extraction, not deep synthesis
- **Strength**: 94-99% accuracy in data extraction
- **Weakness**: "Summaries lacked in-depth critical analysis on relationships between findings"
- Represents the "avoid deep synthesis" production pattern
- **Source**: https://elicit.com/

### Consensus
- **Approach**: Searches academic papers and presents results with "Yes/No/Possibly" meter
- Per-paper extraction rather than deep cross-paper synthesis
- **Source**: https://consensus.app/

## Key Pattern: Production Systems Avoid Deep Recomposition

A consistent finding: production systems overwhelmingly avoid deep synthesis. They either:
1. **Present per-source extractions** (Elicit, Consensus) — safest for fidelity
2. **Pick winners** among sources rather than synthesizing (early approaches)
3. **Shallow synthesis** with heavy citation anchoring (Perplexity, Google AI Overviews)

No production system attempts the full claim→reconcile→deeply synthesized prose pipeline that /consolidate targets. This is the frontier — and the reason careful recomposition design matters.
