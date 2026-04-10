---
title: "Pyramid Method and QAPyramid: Human Evaluation Frameworks for Content Coverage"
source_url: https://dl.acm.org/doi/10.1145/1233912.1233913
source_type: academic_paper
authors: Ani Nenkova, Rebecca Passonneau
date_accessed: 2026-03-21
relevance: D7 — Gold standard human evaluation framework for content selection and coverage
---

## Key Findings

The Pyramid Method is the foundational human evaluation framework for measuring content coverage in summarization, directly applicable to consolidation completeness evaluation.

### Core Methodology
1. **SCU Generation**: Experts analyze multiple human reference summaries to extract fine-grained Semantic Content Units (SCUs)
2. **Weight Assignment**: SCUs weighted by frequency across reference summaries — information mentioned by more annotators is more important
3. **Presence Detection**: Binary judgment of whether system summary contains each SCU
4. **Score Computation**: Weighted sum of present SCUs normalized by maximum achievable score

### Key Properties
- Incorporates human content selection variation (different annotators emphasize different things)
- Empirically assigns importance weights rather than treating all information equally
- Enables both quantitative and qualitative evaluation

### QAPyramid (2024 Evolution)
- Decomposes reference summaries into question-answer pairs using QA-SRL framework
- More systematic and fine-grained than original SCU approach
- High inter-annotator agreement without requiring expert annotations
- Bridges toward automated evaluation while maintaining human evaluation principles

### Relevance to Consolidation
- **Direct applicability**: SCUs from source documents = the atomic units that consolidation should preserve
- **Importance weighting** maps to scope-aware consolidation: frequently mentioned information = higher priority
- **Presence detection** is exactly the operation needed to measure consolidation completeness
- **QAPyramid's QA-pair decomposition** could be automated with LLMs for scalable evaluation
- The framework naturally handles the case where multiple valid consolidations exist (by weighting by annotator agreement)
