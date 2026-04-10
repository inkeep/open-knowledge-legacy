---
title: "From Single to Multi: How LLMs Hallucinate in Multi-Document Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2410.13961
authors: Multiple
year: 2024-2025
venue: NAACL 2025 Findings
relevance: Primary empirical study quantifying hallucination rates and taxonomy in multi-document summarization
---

## Summary

First systematic study of hallucination behavior specific to multi-document summarization (MDS), evaluating 5 LLMs across news and conversation domains.

## Hallucination Rates by Model and Domain

### News Domain
- Hallucination rates: 20-45% across models

### Conversation Domain
- Hallucination rates: 52-75% across models

### Non-Existent Topic Generation (Critical Finding)
- GPT-3.5-Turbo: generates summaries ~79.45% of time for non-existent topics
- GPT-4o: generates summaries ~44% of time
- Llama 3.1 (70B): best performer, abstains 71.08% of time

## Hallucination Taxonomy (from 700+ manual annotations)

| Error Category | Prevalence Range | Description |
|---------------|-----------------|-------------|
| Pedantic errors | 28-79% | Overly generic, paraphrasing, lacking informativeness |
| Instruction Inconsistency | 23-87% | Off-topic, redundant, violating prompt conditions |
| Context Inconsistency | 9-37% | Misrepresentation via overgeneralization/oversimplification |
| Fabrication | 0-9% | Information contradicting or unsupported by sources |

## Positional Bias

"Insights positioned earlier in the summary are more likely to be accurate than those located later."
- Accuracy declines substantially toward summary conclusions
- Later bullet points show higher hallucination rates

## Impact of Document Count

As document combinations increase from 2 to 10:
- Most models: marginal changes (±5%) in hallucinated content
- Gemini-1.5-Flash: up to 10% increase
- Recall drops significantly but error rates remain relatively stable
- Models increasingly prone to generating summaries for non-existent subtopics

## Domain Differences

Conversation domain: 20-30% higher hallucination rates than news
- News: focuses on entities and quantitative facts
- Conversations: contextual, multi-turn interactions

## Mitigation Attempts

Simple post-processing methods showed minimal effectiveness:
- Truncating to top-5 insights: improved F1 by only 2.51% maximum
- Redundancy removal and paraphrase detection: largely ineffective
