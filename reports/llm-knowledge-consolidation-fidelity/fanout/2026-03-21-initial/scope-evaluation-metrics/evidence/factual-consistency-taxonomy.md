---
title: "Taxonomy of Factual Consistency Evaluation Methods for Summarization"
source_url: https://eugeneyan.com/writing/abstractive/
source_type: technical_blog
authors: Eugene Yan
date_accessed: 2026-03-21
relevance: D7 — Comprehensive taxonomy of factual consistency metrics and practical recommendations
---

## Key Findings

Comprehensive overview of evaluation and hallucination detection methods organized into a practical taxonomy.

### Four Evaluation Dimensions
1. **Fluency**: Well-formed sentences, largely solved by modern LLMs
2. **Coherence**: Structural quality and logical flow
3. **Relevance**: Important content selection (most subjective)
4. **Consistency**: Factual alignment with source (primary challenge)

### Reference-Based Metrics
- **ROUGE**: N-gram overlap (ROUGE-N, ROUGE-L, ROUGE-S). Most widely used but penalizes paraphrasing
- **METEOR**: Relaxed matching with stemming, synonyms, paraphrases + fragmentation penalty
- **BERTScore**: Cosine similarity of contextual token embeddings. Captures synonyms/paraphrasing
- **MoverScore**: Many-to-one token matching via Earth Mover's Distance optimization

### Entailment-Based Consistency Metrics
- **SummaC-ZS**: Sentence-level NLI, retains max entailment score per summary sentence, then averages
- **SummaC-Conv**: Uses convolutional layers to convert NLI score distributions into single scores
- **TrueTeacher**: Distills NLI using 1.4M synthetic labels from FLAN-PaLM 540B. T5-11B improved ROC-AUC from 82.7 to 87.8

### QA-Based Consistency Metrics
- **QuestEval**: Generates questions from source + summary, compares answers bidirectionally. Uses learned query weighter
- **QAFactEval**: Improved upon QuestEval with BART-large for QG. 15% improvement over previous QA metrics

### Key Finding
Simpler NLI approaches with larger models can outperform complex QA-based systems. Current SOTA achieves 60-75% balanced accuracy on CNN/DailyMail and XSum.

### Practical Recommendations (Priority Order)
1. Start with reference-based metrics if references available
2. Adapt reference-based for source comparison (reference-free)
3. Fine-tune NLI models for consistency
4. Consider sampling-based approaches if inference budget allows
5. Use LLMs as evaluators (with bias caveats)
6. Train reward models if preference data exists
7. QA-based metrics only if complexity justified

### Critical Insight
CNN/DailyMail and XSum contain low-quality references that score worse than modern LLM outputs. Up to 92% hallucination rate in XSum. This necessitates moving beyond reference-based evaluation.
