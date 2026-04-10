---
title: "FABLES: Evaluating Faithfulness and Content Selection in Book-Length Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2404.01261
authors: Multiple
year: 2024
relevance: Comprehensive taxonomy of faithfulness and content selection errors in long-form summarization
---

## Summary

First large-scale human evaluation of faithfulness and content selection errors in book-length summarization, with 3,158 annotated claims across 26 books ($5.2K USD).

## Faithfulness Error Rates by Model

| Model | Faithful Claims | Unfaithful Claims |
|-------|----------------|------------------|
| Claude-3-Opus | 90.66% | 2.03% |
| GPT-4-Turbo | 78.16% | 7.62% |
| GPT-4 | 78.55% | 4.54% |
| GPT-3.5-Turbo | 72.07% | 10.52% |
| Mixtral | 70.04% | 10.46% |

## Unfaithful Claim Categories

### By Claim Type
- Character/relationship states: 38.6%
- Specific events: 31.5%
- Cause-effect relationships: 11.2%
- High-level narrative structure: 11.2%
- Character introspection: 7.5%

### By Reasoning Requirement
- 50.2% required indirect reasoning (multi-hop inference)
- 36.8% involved direct contradictions
- Remainder: subjective assessment or external information

## Content Selection Errors (Beyond Faithfulness)

### Omission Errors (all models)
- Key events missing: 33.3%-65.4% of summaries
- Important character details omitted: 16.7%-38.5%
- Crucial characters entirely absent: up to 23.1%

### Chronological Problems
Every model made temporal ordering errors; less pronounced in long-context models.

### Generic Content
Weaker models (GPT-3.5-Turbo, Mixtral): overly vague statements at 38.5% rate.

## Key Differences from Short-Document Summarization

1. **Complexity**: Unfaithful claims predominantly require "multi-hop reasoning over evidence" vs simpler entity-centric verification
2. **Context dependency**: Claims involve implicit narrative information difficult to localize
3. **Auto-rater failure**: LLM auto-raters achieved only 47.5 F1 on detecting unfaithful claims (vs strong performance on shorter docs)
4. **Recency bias**: Long-context models (Claude-3-Opus, GPT-4-Turbo) showed systematic over-emphasis on book endings
