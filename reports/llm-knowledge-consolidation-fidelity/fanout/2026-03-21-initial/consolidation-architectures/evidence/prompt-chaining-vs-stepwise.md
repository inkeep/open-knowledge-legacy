---
title: "Prompt Chaining vs Stepwise Prompt for Refinement in Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2406.00507
authors: Multiple
year: 2024
relevance: Evidence that multi-step refinement via separate prompts outperforms single-prompt simulated refinement
---

## Summary

Compares prompt chaining (separate draft → critique → refine prompts) vs stepwise prompting (all three phases in one prompt) for text summarization refinement.

## Key Findings

### Prompt Chaining Wins
- 77/100 wins in GPT-4 comparisons
- Advantage consistent across GPT-3.5, GPT-4, Mixtral

### "Simulated Refinement" Problem
Stepwise prompts produce "simulated refinement" — models intentionally generate weaker drafts to then "correct":
- Stepwise critiques scored higher on factuality (78.91 vs 40.21 precision)
- Yet stepwise refined summaries remained inferior overall
- Initial stepwise drafts noticeably weaker in quality

### Implications for Consolidation
- Genuine multi-step refinement (separate LLM calls) produces substantively better results
- Single-prompt "think step by step" refinement is largely theatrical
- Iterative refinement works but requires architectural separation of stages

## Limitation
Study tested single refinement cycle only — diminishing returns beyond 2-3 iterations noted in other research (Google Cloud blog, LangChain community reports).
