---
title: "FActScore: Fine-grained Atomic Evaluation of Factual Precision"
source_url: https://arxiv.org/abs/2305.14251
source_type: academic_paper
authors: Sewon Min, Kalpesh Krishna, Xinxi Lyu, Mike Lewis, Wen-tau Yih, Pang Wei Koh, Mohit Iyyer, Luke Zettlemoyer, Hannaneh Hajishirzi
date_accessed: 2026-03-21
relevance: D7 — Atomic fact decomposition as evaluation paradigm for factual fidelity
---

## Key Findings

FActScore (Factual precision in Atomicity Score) decomposes generated text into atomic facts and computes the percentage supported by a reliable knowledge source.

### Methodology
1. **Atomic Fact Decomposition**: Break generated text into minimal, independently verifiable factual claims
2. **Knowledge Source Verification**: Each atomic fact checked against a reliable source (e.g., Wikipedia)
3. **Scoring**: Percentage of atomic facts that are supported = FActScore

### Automated Pipeline
- Uses retrieval + strong language model for verification
- Less than 2% error rate compared to human evaluation
- Available via `pip install factscore`

### Key Results
- ChatGPT achieves only 58% FActScore on biography generation
- Evaluated 6,500 generations from 13 LMs (would have cost $26K with human evaluation)
- GPT-4 and ChatGPT outperform public models; Vicuna and Alpaca strongest among public models

### Relevance to Consolidation
- Atomic fact decomposition is directly applicable to measuring information preservation in consolidation
- The paradigm of "what percentage of source facts survive in the output" maps exactly to consolidation fidelity
- Can be adapted: instead of checking against Wikipedia, check against source documents
- Provides a blueprint for "claim coverage" metrics in consolidation evaluation
