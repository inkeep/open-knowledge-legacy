---
title: "Vectara Hallucination Leaderboard: HHEM Methodology"
source_url: https://github.com/vectara/hallucination-leaderboard
source_type: github_repo
authors: Vectara
date_accessed: 2026-03-21
relevance: D7 — Production-scale factual consistency benchmarking methodology
---

## Key Findings

The Vectara Hallucination Leaderboard provides continuous benchmarking of 130+ LLMs on factual consistency in summarization tasks using their proprietary HHEM model.

### HHEM (Hughes Hallucination Evaluation Model)
- **Current version**: HHEM-2.3 (commercial); HHEM-2.1-Open available on HuggingFace/Kaggle
- **Scoring**: 0-1 scale, any value < 0.5 classified as hallucination
- **Multilingual**: Supports 11 languages

### Dataset
- 7,700+ articles spanning law, medicine, finance, education, technology, news, science, sports, business
- Article length: 50 to 24,000 words
- **Not publicly available** to prevent LLM overfitting
- Periodically refreshed with new documents

### Evaluation Protocol
- **Prompt**: "Provide a concise and factual summary for the given passage" using only provided information
- **Length constraint**: Summary capped at 20% of original length
- **Temperature**: 0 where possible
- **Filtering**: Refusals and minimal responses excluded

### Metrics Reported
1. **Hallucination Rate**: % of summaries with factual inconsistencies
2. **Factual Consistency Rate**: 100% minus hallucination rate
3. **Answer Rate**: % of documents successfully summarized
4. **Average Summary Length**: Mean word count

### Limitations
- Evaluates summarization consistency only, not general factual accuracy
- Does not assess summary quality, only factual fidelity
- Relies on model-based evaluation, not human judgment
- Results specific to summarization task, may not generalize

### Relevance to Consolidation
- Demonstrates that factual consistency can be automatically measured at scale
- The HHEM model architecture (NLI-based) could be applied to consolidation outputs vs. source documents
- Answer rate metric is relevant: measures whether the model can successfully process the input (analogous to consolidation success rate)
- Limitation: measures only faithfulness, not completeness — insufficient alone for consolidation evaluation
