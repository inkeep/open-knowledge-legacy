---
title: "SAFE: Search-Augmented Factuality Evaluator"
source_type: academic_paper
url: "https://arxiv.org/abs/2403.18802"
authors: "Jerry Wei, Chengrun Yang, et al. (Google DeepMind, Stanford)"
venue: "NeurIPS 2024"
accessed: 2026-03-21
relevance: "Agent-based decompose-search-verify pipeline for long-form factuality — post-consolidation verification pattern"
---

# SAFE: Search-Augmented Factuality Evaluator

## Pipeline Architecture

### Step 1: Decompose
- LLM splits each sentence in a long-form response into individual facts
- Replaces vague references with specific entities for self-containment
- Each fact becomes an independently verifiable unit

### Step 2: Search and Verify (per fact)
- LLM agent generates search queries based on the fact and previously obtained search results
- Iteratively queries Google Search
- Multi-step reasoning: agent can refine queries based on initial results
- Continues until sufficient evidence accumulated

### Step 3: Rate
- Agent reasons whether accumulated search evidence supports or contradicts the claim
- Three outputs per prompt-response pair:
  - Number of supported facts
  - Number of irrelevant facts (filtered by relevance to original prompt)
  - Number of unsupported facts

## F1@K Metric
Extension of F1 score adapted for long-form settings:
- Incorporates "recall from human-preferred length"
- Balances factual precision with response completeness
- K parameter adjusts for length preferences

## Performance
- On ~16k individual facts: agrees with human annotators 72% of the time
- On 100 disagreement cases: SAFE wins 76% of the time
- More than 20x cheaper than human annotators
- Conclusion: LLM agents can outperform human annotators for factuality evaluation

## LongFact Benchmark
- 2,280 fact-seeking prompts
- 38 topics
- Generated using GPT-4
- Designed for benchmarking long-form factuality in open domains

## Key Finding
"Larger LLMs are more factual" — benchmarked 13 models across Gemini, GPT, Claude, and PaLM-2 families.

## Implications for Consolidation
- The decompose-search-verify pattern applies directly to verifying consolidated output
- Unlike source-grounded verification (MiniCheck, NLI), SAFE uses web search — useful when sources are incomplete
- Agent-based iterative search can dig deeper on uncertain claims
- For consolidation: can verify claims against both source documents AND external knowledge
- Cost-effective alternative to human review of consolidated outputs
- Multi-step reasoning handles nuanced/complex claims better than single-pass verification

## GitHub
https://github.com/google-deepmind/long-form-factuality
