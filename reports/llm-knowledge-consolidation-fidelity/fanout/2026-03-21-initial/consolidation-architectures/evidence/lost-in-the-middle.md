---
title: "Lost in the Middle: How Language Models Use Long Contexts"
source_type: academic_paper
url: https://arxiv.org/abs/2307.03172
authors: Liu et al.
year: 2024
venue: TACL 2024
relevance: Foundational evidence for positional bias in long-context processing — directly impacts stuff-it-all consolidation approaches
---

## Summary

Demonstrates that LLM performance degrades by >30% when relevant information is in the middle of long contexts, following a U-shaped curve. This fundamentally constrains "stuff it all in" consolidation strategies.

## Key Findings

- Performance highest when relevant info at beginning or end of context
- Degradation >30% when info shifts to middle positions
- U-shaped performance curve across multi-document QA and key-value retrieval
- Effect persists even for explicitly long-context models

## Root Cause

Rotary Position Embedding (RoPE) introduces long-term decay:
- Models prioritize tokens at beginning and end of sequences
- De-emphasize middle content
- Analogous to psychological serial-position effect (primacy/recency)

## Practical Implications for Consolidation

- "Stuff it all in" approach suffers from systematic information loss for middle-positioned content
- Performance saturates far before retriever recall capacity
- Summarizing documents <32K tokens works well for most LLMs
- Beyond 32K: summarization quality degrades model-dependently (e.g., Llama 3.1 405B degrades after 32K)

## Implication for Architecture Choice

This finding provides strong evidence against naive single-pass consolidation for large source sets. Even with sufficient context windows, positional bias will systematically underweight middle-positioned sources. Chunked/staged approaches are architecturally necessary for fidelity, not just for fitting within context limits.
