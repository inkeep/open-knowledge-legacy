---
title: Consensus.app Scientific Paper Synthesis Architecture
type: primary-source-synthesis
sources:
  - url: https://openai.com/index/consensus/
    title: "Consensus uses GPT-5 and the Responses API"
    publisher: OpenAI
  - url: https://pmc.ncbi.nlm.nih.gov/articles/PMC12318603/
    title: "The Use of Generative AI in Academic Research: A Review of the Consensus App"
    publisher: PMC
  - url: https://aarontay.substack.com/p/a-2025-deep-dive-of-consensus-promises
    title: "A 2025 Deep Dive of Consensus: Promises and Pitfalls"
    publisher: Aaron Tay (Substack)
date_accessed: 2026-03-21
---

## Multi-Agent Architecture (GPT-5 + Responses API)

- **Planning Agent**: Decomposes research queries into sub-tasks
- **Reading Agent(s)**: Process individual papers, extract structured data
- **Analysis Agent**: Synthesizes results, determines output structure/visuals, composes final output
- Each agent has narrow scope — keeps reasoning precise, minimizes hallucinations
- Modular: new agents can slot in as models improve (experiment replication, figure generation, statistical analysis)

## Corpus and Search

- 220 million+ peer-reviewed papers
- Hybrid search: semantic search (AI embeddings) + keyword search (BM25)
- AI applied *after* literature search — ensures grounding in citable research

## Claim Extraction

- Claims and Evidence Table: structured extraction of key claims + supporting/disputing papers
- Per-study extraction: methods, outcomes, populations, sample sizes
- Every claim linked directly to source paper
- "Research context pack": structured bundle of papers, metadata, key findings

## Context Engineering

- Team calls their approach "context engineering": assembling the right evidence before generation begins
- Evidence-agreement scoring system for claim support levels

## Limitations (from PMC review)

- No rigorous benchmarking exists for synthesis quality
- Potential oversimplification of complex academic arguments
- AI-generated summaries may not fully represent depth of academic arguments
- Limited to peer-reviewed literature (excludes grey literature)
