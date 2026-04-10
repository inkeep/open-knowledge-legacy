---
title: "NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization"
source_type: academic_paper
url: https://arxiv.org/abs/2505.24575
authors: Kim & Kim
year: 2025
venue: ACL 2025
relevance: Multi-agent hierarchical pipeline with preprocessing, summarization, and iterative compression stages
---

## Summary

Multi-agent LLM framework for narrative summarization through a three-stage sequential pipeline without fine-tuning.

## Architecture

1. **Preprocessor Agent** (Dialogue-to-Description Transformation): Converts character dialogues into structured narrative prose, standardizing format
2. **Summarizer Agent** (Hierarchical Summarization): Generates comprehensive summary preserving key plot points and character interactions
3. **Compressor Agent** (Iterative Compression): Dynamically reduces summary length through controlled compression

## Key Innovations

- **Dialogue-to-Description Transformation**: Narrative-specific preprocessing that standardizes dialogue and descriptive text into unified format
- **Hierarchical Multi-LLM Summarization**: Structured pipeline optimizing chunk processing and controlling output length

## Performance

Up to 30.0% improvement in BERTScore (F1) across books, movies, and TV scripts.

## Relevance to Consolidation

Demonstrates the value of source-type-specific preprocessing before consolidation — different source types (dialogue vs narrative vs structured data) benefit from normalization into a common intermediate format before hierarchical merging.
