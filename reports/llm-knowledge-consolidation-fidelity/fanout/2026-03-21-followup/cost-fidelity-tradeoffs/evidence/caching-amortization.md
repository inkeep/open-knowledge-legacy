---
title: Caching and Amortization Strategies
type: evidence
sources:
  - url: https://arxiv.org/abs/2411.05276
    title: "GPT Semantic Cache: Reducing LLM Costs and Latency via Semantic Embedding Caching"
    year: 2024
  - url: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
    title: "Anthropic Prompt Caching Documentation"
  - url: https://promptbuilder.cc/blog/prompt-caching-token-economics-2025
    title: "Prompt Caching Guide 2025: Lower AI Costs"
  - url: https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025
    title: "Prompt Caching Infrastructure: Reducing LLM Costs"
    year: 2025
---

# Caching and Amortization Strategies

## Provider-Level Prefix Caching

### Anthropic
- **Cost reduction:** Up to 90% on cached input tokens
- **Latency reduction:** Up to 85% for long prompts
- **Pricing:** Cache reads $0.30/M tokens vs $3.00/M fresh (10x cheaper)
- **Minimum:** 1,024 tokens to trigger caching
- **Mechanism:** Reuses KV tensors from attention layers for repeated prompt prefixes

### OpenAI
- **Cost reduction:** 50% on cached tokens
- **Mechanism:** Automatic caching, no code changes required
- **Minimum:** 1,024 tokens

### Key Constraint
- Cache hit requires exact prefix match — changing data must go in suffix
- System prompts, reference documents, and tool definitions = ideal cache candidates

## Semantic Caching (Application-Level)

### GPTSemCache Results (per 500 queries)

| Category | Cache Hits | Positive Hits | Hit Rate | Accuracy |
|---|---|---|---|---|
| Python Basics | 335 | 310 | 67.0% | 92.5% |
| Network Support | 335 | 326 | 67.0% | 97.3% |
| Order/Shipping | 344 | 331 | 68.8% | 96.2% |
| Shopping QA | 308 | 298 | 61.6% | 96.8% |

**Average API call reduction:** 61.6-68.8%
**Optimal similarity threshold:** 0.8 (balances hit rate and accuracy)

### Industry Statistics
- 31% of LLM queries exhibit semantic similarity to previous requests
- This represents massive inefficiency in deployments without caching

## Cacheable Computations in Consolidation Pipeline

| Computation | Cacheability | Cache Key | Reuse Scenario |
|---|---|---|---|
| Source claim decomposition | **High** | hash(source_document) | Same source across multiple consolidations |
| Embedding computation | **High** | hash(text_chunk) | Deduplication, similarity search |
| MiniCheck verification | **High** | hash(claim + source) | Re-verification after edits |
| Structured extraction | **High** | hash(source + schema) | Schema-consistent extractions |
| Conflict resolution | **Low** | N/A | Context-dependent, hard to cache |
| Final recomposition | **None** | N/A | Always unique output |

## Amortization Model for Consolidation

### First Run (Cold)
All computations executed fresh. Cost = full pipeline cost.

### Subsequent Runs (Warm)
- Source decomposition: cached if sources unchanged (~40% of pipeline cost saved)
- Embeddings: cached (~10% saved)
- Verification of unchanged claims: cached (~15% saved)
- **Total savings on incremental runs: ~50-65%**

### Prefix Caching for Pipeline Prompts
- System prompts for each stage are identical across runs
- With Anthropic prefix caching: 90% savings on prompt tokens
- Pipeline prompts are typically 2-5K tokens each × 5 stages = 10-25K tokens
- Savings: ~$0.07 per run at Sonnet pricing (vs $0.75 without caching)

## Cost Impact Summary

| Strategy | Cost Reduction | Implementation Complexity |
|---|---|---|
| Provider prefix caching | 50-90% on input tokens | Near-zero (automatic or trivial) |
| Semantic result caching | 60-70% API call reduction | Moderate (embedding DB required) |
| Claim decomposition caching | ~40% pipeline cost on re-runs | Low (hash-based cache) |
| Embedding reuse | ~10% pipeline cost | Low (vector DB) |
| Verification result caching | ~15% pipeline cost on re-runs | Low (hash-based cache) |
