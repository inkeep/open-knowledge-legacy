---
title: "BooookScore: Systematic Exploration of Book-Length Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2310.00785
authors: Lilak et al.
year: 2024
venue: ICLR 2024
relevance: Foundational evaluation of hierarchical merging vs incremental updating architectures with coherence error taxonomy
---

## Summary

First systematic study of coherence in LLM-based book-length summarizers, comparing two prompting workflows and identifying eight coherence error types from 1,193 fine-grained human annotations across 100 books.

## Two Prompting Workflows

### Hierarchical Merging
- Chunks individually summarized
- Progressively merged through multiple levels
- Simpler instructions, may lose long-range dependencies
- Higher coherence scores

### Incremental Updating (Running Summary)
- Running summary continuously updated per chunk
- Preserves context, requires complex prompting
- More detailed but more errors

## Eight Coherence Error Types (per-sentence prevalence)

| Error Type | Incremental | Hierarchical |
|---|---|---|
| Entity omission | 7.3% | 3.7% |
| Event omission | 4.3% | 2.3% |
| Causal omission | 2.8% | 1.2% |
| Discontinuity | 2.2% | 1.6% |
| Salience issues | 1.4% | 1.0% |
| Language errors | 0.8% | 0.7% |
| Inconsistency | 1.0% | 1.0% |
| Duplication | 2.1% | 1.2% |

## Model Rankings

1. Claude 2: 91.1 (hierarchical), 90.9 (incremental with 88K chunks)
2. GPT-4: close second
3. GPT-3.5-Turbo: moderate
4. Mixtral-8x7B: approaching GPT-3.5-Turbo
5. LLaMA 2: significant repetition issues

## Critical Findings

- Hierarchical: higher coherence but reduced detail
- Incremental: more detail but more errors (especially omissions)
- Chunk size significantly impacts incremental updating effectiveness
- High BooookScore does NOT necessarily correlate with human preference

### Human Preference
- Preferred incremental for **detail**: 83%
- Preferred hierarchical for **logical consistency**: 53%

This reveals a fundamental architecture-level tradeoff between detail preservation and coherence.
