---
title: "FActScore: Atomic Fact Decomposition Pipeline"
source_type: academic_paper
url: "https://arxiv.org/abs/2305.14251"
authors: "Sewon Min, Kalpesh Krishna, Xinxi Lyu, Mike Lewis, Wen-tau Yih, Pang Wei Koh, Mohit Iyyer, Luke Zettlemoyer, Hannaneh Hajishirzi"
venue: "EMNLP 2023"
accessed: 2026-03-21
relevance: "Foundational decompose-then-verify framework for atomic fact evaluation"
---

# FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation

## Core Concept

FActScore breaks a long-form generation into a series of **atomic facts** and computes the percentage of atomic facts supported by a reliable knowledge source. An atomic fact is defined as a minimal, independent piece of information that can be individually verified as true or false.

## Pipeline Stages

### Stage 1: Atomic Fact Decomposition
- Uses an LLM (InstructGPT or ChatGPT) with prompt-based instruction to decompose sentences into atomic facts
- Example: "Thierry Henry is a French professional football coach and pundit" → ["Thierry Henry is French", "Thierry Henry is a football coach", "Thierry Henry is a football pundit"]
- Each fact should be self-contained and independently verifiable
- Default generation prompt: `"Question: Tell me a bio of <entity>."`

### Stage 2: Evidence Retrieval
- Dense retriever (GTR-based passage retriever) extracts relevant knowledge snippets from external source
- Default knowledge source: Wikipedia dump from 2023/04/01
- Custom knowledge sources supported via `.jsonl` files with title/text pairs

### Stage 3: Fact Validation
- Each atomic fact paired with retrieved evidence
- Classified as "Supported", "Not-supported", or "Irrelevant"
- Two recommended verifiers: `retrieval+ChatGPT` (default) and `retrieval+llama+npm`
- Achieves 0.99 Pearson correlation between verifier options

### Stage 4: Score Computation
- FActScore = percentage of atomic facts labeled "Supported"
- Automated pipeline achieves less than 2% error relative to human annotation
- Length penalty hyperparameter (gamma, default=10) adjustable

## Key Configuration
- `--gamma`: Length penalty (default 10, can be 0)
- `--use_atomic_facts`: Reuse pre-generated decompositions
- `--abstain_detection`: Optional response filtering ("generic" or "perplexity_ai")

## Evaluated Models
GPT-4, ChatGPT, Alpaca (7B/13B/65B), Vicuna, InstructGPT, MPT Chat, Oasst Pythia, Dolly, StableLM

## Implications for Consolidation
- Decomposition stage directly applicable to breaking source texts into claim inventories
- The retrieval+verify pattern can be repurposed for post-consolidation verification
- Score provides quantitative fidelity metric for consolidated outputs
- Custom knowledge sources enable verification against specific source documents

## GitHub
https://github.com/shmsw25/FActScore
