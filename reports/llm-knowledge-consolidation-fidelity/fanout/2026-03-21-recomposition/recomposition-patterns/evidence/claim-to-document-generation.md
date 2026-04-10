---
title: Claim-to-Document Generation - Data-to-Text and Knowledge Graph-to-Text
type: evidence
date: 2026-03-21
tags: [data-to-text, KG-to-text, WebNLG, DART, structured-generation]
---

# Claim-to-Document Generation

## The Analogous Problem: Data-to-Text Generation

Data-to-text generation (D2T) aims to generate textual natural language from structured data (graphs, tables, key-value pairs). This is the closest existing research paradigm to claim-to-document recomposition.

### WebNLG Challenge

WebNLG uses RDF triple sets as source data with text descriptions as target output. Involves categories like cities, artists, politicians, etc.

- **Source**: Gardent et al. (2017). "The WebNLG Challenge: Generating Text from RDF Data." https://webnlg-challenge.loria.fr/
- Recent work (2024-2025) using LLMs on WebNLG shows average improvement of 1.79%

### DART Dataset (Yale-LILY, 2021)

Large open-domain structured data record to text generation corpus. 82,191 examples with input being semantic RDF triple sets derived from tables, annotated with sentence descriptions covering all facts. Merged from WikiTableQuestions, WikiSQL, WebNLG 2017, and Cleaned E2E.

- **Source**: Nan et al. (2021). "DART: Open-Domain Structured Data Record to Text Generation." NAACL 2021. https://aclanthology.org/2021.naacl-main.37/
- **Code/Data**: https://github.com/Yale-LILY/dart

### Unified Structured Data Pre-training

Recent work unifies different structured data types (table, key-value, knowledge graph) into graph format with structure-enhanced pre-training for D2T generation.

- **Source**: Li et al. (2024). "Unifying Structured Data as Graph for Data-to-Text Pre-Training." *TACL*. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00641/119991/

## Knowledge Graph-to-Text (KG2T)

### Cross-Structure Attention Distillation

Recent approach for enhancing KG-to-text generation using cross-structure attention mechanisms to bridge the structural gap between graph input and sequential text output.

- **Source**: (2024). "Enhancing text generation from knowledge graphs with cross-structure attention distillation." *Engineering Applications of AI*. https://www.sciencedirect.com/science/article/abs/pii/S0952197624011291

### LLGM (Linear Latent Graph Model)

Achieved competitive performance with state-of-the-art models while requiring up to 37% fewer parameters on WebNLGv2.0 and EventNarrative datasets.

- **Source**: (2025). "Efficient knowledge graph to text powered by LLGM." *Complex & Intelligent Systems*. https://link.springer.com/article/10.1007/s40747-025-01985-8

## How This Differs from Traditional Text Generation

| Aspect | Traditional Text Gen | Claim-to-Document |
|--------|---------------------|-------------------|
| Input | Freeform prompt | Structured set of verified facts |
| Constraint | Open-ended | Must include all claims, add nothing |
| Ordering | Model decides | Must reflect logical/importance structure |
| Faithfulness | Nice to have | Critical requirement |
| Attribution | Optional | Required for traceability |

## Key Insight for Recomposition

The D2T literature shows that the structural gap between input representation and output text is the core challenge. Systems that explicitly plan the mapping (which facts go in which sentence, what order) outperform end-to-end approaches. This directly applies to claim recomposition — the claims are the "structured data" and the challenge is generating fluent, faithful prose from them.
