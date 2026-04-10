---
title: "UniEval: Unified Multi-Dimensional Evaluator for Text Generation"
source_url: https://arxiv.org/abs/2210.07197
source_type: academic_paper
authors: Ming Zhong, Yang Liu, Da Yin, Yuning Mao, Yizhu Jiao, Pengfei Liu, Chenguang Zhu, Heng Ji, Jiawei Han
date_accessed: 2026-03-21
relevance: D7 — Multi-dimensional evaluation framework combining consistency, coherence, relevance, fluency
---

## Key Findings

UniEval provides a unified framework for evaluating text generation across multiple quality dimensions simultaneously.

### Technical Approach
- Recasts every evaluation dimension as a Boolean QA task
- Poses each aspect (coherence, consistency, relevance, fluency) as a natural language question
- Pre-trained encoder-decoder model produces binary "Yes"/"No" answer, normalized to soft score
- Unified format enables intermediate learning from multiple related tasks

### Evaluation Dimensions for Summarization
- **Coherence**: Requires source document context
- **Consistency** (factual): Requires source document context
- **Fluency**: Requires only the output text
- **Relevance**: Requires reference summaries (only non-reference-free dimension)

### Performance
- 23% higher correlation with human judgments on summarization vs. prior unified evaluators
- 43% higher on dialogue response generation
- UniEval-fact specifically for factual consistency evaluation

### UniSumEval (2024 Extension)
- Fine-grained, multi-dimensional summarization evaluation specifically for LLMs
- Addresses limitations of UniEval when applied to modern LLM outputs

### Relevance to Consolidation
- Multi-dimensional evaluation is essential for consolidation: faithfulness alone is insufficient
- Boolean QA framing could be adapted: "Does the consolidation contain information about X?" for each scope dimension
- The unified approach avoids needing separate models for each evaluation dimension
- Reference-free operation (except relevance) is practical for consolidation where no reference consolidation exists
