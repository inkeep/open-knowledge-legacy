---
title: "LLMxMapReduce: Divide-and-Conquer Framework for Long Sequences"
source_type: academic_paper
url: https://arxiv.org/abs/2410.09342
authors: THUNLP, OpenBMB, AI9STARS
year: 2024-2025
relevance: Core map-reduce architecture for long-document processing with structured information protocol
---

## Summary

LLMxMapReduce is a three-stage divide-and-conquer framework for extending LLM processing to sequences exceeding context windows (tested up to 1.28M tokens). It addresses the fundamental challenge of preserving long-range information when splitting documents.

## Architecture

### Map Stage
Documents divided into chunks {x₁, x₂, ..., xₙ}. Each chunk processed independently:
sᵢ = fmap(xᵢ, Q; θ)

### Collapse Stage
When mapped results exceed context length, grouped and compressed iteratively:
cⱼ = fcollapse(gⱼ, Q; θ)
Output structure mirrors map stage format.

### Reduce Stage
Final answers generated from compressed results:
a = freduce({c₁, ..., cₖ}, Q; θ)

## Structured Information Protocol (Key Innovation)

Four components for information transfer across stages:
1. **Extracted Information**: Key facts/data relevant to query
2. **Rationale**: Analytical reasoning explaining answer derivation
3. **Answer**: Intermediate response (or "NO INFORMATION" if irrelevant)
4. **Confidence Score**: Score (out of 5) reflecting completeness/reliability

## In-Context Confidence Calibration

Resolves inter-chunk conflicts. Scoring principles via few-shot examples:
- Text-supported claims: 5 points
- Inferred claims: 3-3.5 points
- Unsupported claims: 0 points

## Handling Disrupted Long-Range Information

- **Inter-chunk Dependency**: Extracted information and rationale supply supplementary details for integrating answers across chunks
- **Inter-chunk Conflict**: Calibrated confidence scores guide merging decisions during collapse/reduce stages

## Empirical Results

On InfiniteBench (100K+ tokens), Llama3-70B + LLMxMapReduce:
- 68.66% average accuracy
- Outperformed GPT-4 (57.34%), Claude 2 (51.62%), Qwen2-72B (54.74%)
- Fewer GPUs required (2 vs 4 for 128K-token documents)

## V2 Extension

LLMxMapReduce-V2 introduces entropy-driven convolutional test-time scaling for integrating extremely large volumes of information. Powers the SurveyGO system for automated survey generation.
