---
title: "Chain of Density: GPT-4 Summarization with Iterative Entity Densification"
source_type: academic_paper
url: https://arxiv.org/abs/2309.04269
authors: Adams, Fabbri, Ladhak, Lehman, Elhadad
year: 2023
relevance: Progressive refinement technique that increases information density without increasing length — applicable to consolidation compression stages
---

## Summary

Chain of Density (CoD) transforms summarization into iterative densification: starting with entity-sparse summary, then progressively incorporating 1-3 missing salient entities per iteration without increasing length (5 iterations total).

## How It Works

1. Generate initial entity-sparse summary (1-3 entities)
2. Per iteration: identify 1-3 missing salient entities
3. Compress/rephrase existing content to make space
4. Integrate new entities without growing length
5. Repeat 5x total

## Key Properties

- **Controlled compression**: Constant token count forces prioritization
- **More abstractive**: CoD summaries exhibit more fusion than vanilla prompts
- **Less lead bias**: Reduces tendency to over-represent document beginnings
- **Entity-dense**: Higher information density per token

## Human Evaluation

- Humans prefer summaries more dense than vanilla prompts
- Preferred density approaches but doesn't exceed human-written summaries
- Optimal density exists — too dense becomes hard to read

## Relevance to Consolidation

CoD provides a principled approach for the compression stage of consolidation:
- Can be applied after initial merging to increase information density
- Forces explicit prioritization of salient entities
- Prevents detail flattening by requiring entity-level accounting
- The iterative approach provides natural checkpoints for quality validation
