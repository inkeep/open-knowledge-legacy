---
title: Controlled Text Generation and Faithfulness Techniques
type: evidence
date: 2026-03-21
tags: [controlled-generation, constrained-decoding, faithful-generation, plan-based]
---

# Controlled Text Generation for Faithful Recomposition

## NeuroLogic Decoding

A family of constrained decoding algorithms that enable LLMs to generate fluent text while satisfying lexical constraints.

### NeuroLogic Decoding (2021)
Enables neural language models to generate fluent text while satisfying complex lexical constraints. Uses predicate logic to express constraints and beam search modifications to enforce them.

- **Source**: Lu et al. (2021). "NeuroLogic Decoding: (Un)supervised Neural Text Generation with Predicate Logic Constraints." NAACL 2021. https://aclanthology.org/2021.naacl-main.339.pdf

### NeuroLogic A*esque (2022)
Extends NeuroLogic with lookahead heuristics, incorporating future cost estimates. Combines constraint flexibility with A*-style search.

- **Source**: Lu et al. (2022). "NeuroLogic A*esque Decoding: Constrained Text Generation with Lookahead Heuristics." NAACL 2022. https://aclanthology.org/2022.naacl-main.57/

### Key Finding
There is a fundamental trade-off between generated text quality and hard constraint satisfaction. Lexically constrained methods have high computational complexity and can impact naturalness.

**Relevance**: Hard lexical constraints (forcing specific claim content) may be too brittle for recomposition. Soft faithfulness constraints (entailment-based verification) are more practical.

## Grammar-Aligned Decoding (NeurIPS 2024)

Adaptive sampling with approximate expected futures (ASAp) guarantees grammatical output while matching the conditional probability distribution.

- **Source**: Park et al. (2024). "Grammar-Aligned Decoding." NeurIPS 2024. https://proceedings.neurips.cc/paper_files/paper/2024/file/2bdc2267c3d7d01523e2e17ac0a754f3-Paper-Conference.pdf

**Relevance**: Structured output constraints (JSON, markdown) can be enforced during decoding without quality loss, useful for structured recomposition formats.

## Future-Constrained Generation (2024)

Formalizes text generation as a future-constrained problem, using LLMs to estimate future constraint satisfaction and guide generation.

- **Source**: (2024). "Unlocking Anticipatory Text Generation: A Constrained Approach for Faithful Decoding with Large Language Models." https://openreview.net/forum?id=774elYc5tw

## Chain of Density (CoD) Prompting

Iterative densification that forces entity-level accounting. GPT-4 generates an initial sparse summary, then iteratively incorporates missing salient entities without increasing length. Creates progressively denser summaries.

### Key Findings
- CoD summaries are more abstractive, exhibit more fusion, less lead bias
- Humans prefer summaries that are more dense than vanilla but almost as dense as human-written
- Fundamental tradeoff: informativeness vs readability
- Optimal density exists at an intermediate point

- **Source**: Adams et al. (2023). "From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting." NewSum Workshop, EMNLP 2023. https://arxiv.org/abs/2309.04269
- **Data**: 500 annotated + 5,000 unannotated summaries on HuggingFace

**Relevance**: CoD's entity-accounting approach can be adapted for recomposition — iteratively ensuring all claims are represented while maintaining readability.

## Relation-Constrained Decoding (NeurIPS 2022)

Constrains generation based on semantic relations rather than lexical tokens.

- **Source**: (2022). "Relation-Constrained Decoding for Text Generation." NeurIPS 2022. https://proceedings.neurips.cc/paper_files/paper/2022/file/ab63a1a325670278ba9b87fbc3e95e33-Paper-Conference.pdf

**Relevance**: Relation constraints better match the recomposition need — ensuring semantic relationships between claims are preserved rather than exact words.
