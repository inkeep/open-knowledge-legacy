---
title: "Context-Aware Hierarchical Merging for Long Document Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2502.00977
authors: Ou & Lapata
year: 2025
venue: ACL 2025 Findings
relevance: Key technique for reducing hallucination amplification in hierarchical merging via source context augmentation
---

## Summary

Addresses hallucination amplification in recursive hierarchical merging by enriching intermediate summaries with source document context through three augmentation strategies and two integration methods.

## Baseline Algorithm

1. Divide document into fixed-size chunks (8K tokens in experiments)
2. Generate summary for each chunk
3. Iteratively merge consecutive summaries until single final summary produced
4. All steps use zero-shot LLM prompting (no fine-tuning)

## Three Context Augmentation Strategies

### Extract (Extractive Summarization)
- Uses MemSum (RL-based extractive summarizer) to identify key sentences from source
- At first level: operates on input chunks
- At subsequent levels: processes concatenated passages
- Contexts always originate from original source material

### Retrieve (RAG-style)
- Uses intermediate summaries as queries for BM25 retrieval
- Documents split into ~100-word passages
- Top-k passages selected to match average summary length

### Cite (Citation-Based)
- Generates intermediate summaries with explicit citations to source passages
- Extracts and ranks passages by citation frequency
- Prioritizes coverage across different input sections

## Two Integration Methods

### Replace
Substitutes abstractive summaries with extracted/retrieved contexts entirely during subsequent merging.

### Support
Retains abstractive summaries while using contexts as supporting evidence for "proofreading only."

## Key Empirical Results

| Metric | Dataset | Best Method | Baseline | Gain |
|--------|---------|------------|----------|------|
| PRisma | Multi-LexSum | Extract-Support | HMerge | +2.0 |
| PRisma | SuperSummary | Extract-Support | HMerge | +2.4 |
| SummaC | Multi-LexSum | Cite-Replace | HMerge | +5.7 |
| AlignScore | SuperSummary | Cite-Replace | HMerge | +15.1 |

### Manual Evaluation
- Extract-Support: 72.7% correct atomic claims
- Baseline hierarchical merging: 59.1% correct atomic claims

## Critical Insight

Fundamental tension between faithfulness metrics:
- **Input-based metrics** (SummaC, AlignScore) favor Replace (directly grounded in source)
- **Reference-based metrics** (PRisma, ROUGE, BERTScore) favor Support (comprehensive coverage)
- **Manual annotation** confirmed Support methods produce more factually accurate summaries

Increasing Replace context from 8K to 32K improved scores by +4.6 but still underperformed Support methods — abstractive summaries provide irreplaceable comprehensive coverage.
