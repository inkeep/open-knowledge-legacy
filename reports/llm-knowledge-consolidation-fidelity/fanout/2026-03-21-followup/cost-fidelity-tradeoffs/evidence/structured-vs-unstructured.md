---
title: Structured vs Unstructured Intermediate Representations
type: evidence
sources:
  - url: https://arxiv.org/html/2410.09342v1
    title: "LLMxMapReduce: Simplified Long-Sequence Processing using Large Language Models"
    venue: arXiv 2024
  - url: https://arxiv.org/html/2501.10868v1
    title: "Generating Structured Outputs from Language Models: Benchmark and Studies"
    year: 2025
  - url: https://medium.com/@michael.hannecke/beyond-json-picking-the-right-format-for-llm-pipelines-b65f15f77f7d
    title: "Beyond JSON: Picking the Right Format for LLM Pipelines"
  - url: https://www.tensorlake.ai/blog-posts/toon-vs-json
    title: "TOON vs JSON: A Token-Optimized Data Format for Reducing LLM Costs"
---

# Structured vs Unstructured Intermediate Representations

## LLMxMapReduce: Structured Protocol Impact

Removing the structured information protocol from LLMxMapReduce caused the largest performance drops:

| Metric | Full Pipeline | Without Structured Protocol | Delta |
|---|---|---|---|
| En.Avg | 41.23 | 25.93 | -15.30pp |
| Co.De | 62.94 | 46.45 | -16.49pp |
| Ma.Fi | 91.43 | 56.00 | -35.43pp |

The structured protocol requires "Extracted Information" + "Rationale" fields for each chunk, enabling the reduce model to integrate cross-chunk answers. This is by far the highest-impact component in the pipeline.

## JSON Structured Output: Cost vs Quality Tradeoff

### Token Overhead
- JSON uses approximately 2x the tokens as equivalent TSV/plain text for the same data
- TOON format achieves 40% fewer tokens than JSON
- TOON achieved 73.9% accuracy vs 69.7% for JSON on data retrieval (both cheaper AND better)

### Quality Impact by Task Type
| Task Type | Impact of Forcing JSON | Recommendation |
|---|---|---|
| Reasoning tasks | -10 to -15% performance | Free-form → structured conversion |
| Classification | Significant boost | Direct structured output |
| Data extraction | Neutral to positive | Direct structured output |
| Consolidation/synthesis | Negative if constrained during reasoning | Two-step approach |

### The Two-Step Approach
**Pattern:** Free reasoning → structured formatting
- Preserves LLM reasoning capability during synthesis
- Structures output for downstream pipeline consumption
- Cost: ~1.3x single-step (extra formatting pass)
- Quality: preserves full reasoning performance

## Implications for Consolidation Pipeline

### Where Structure Helps (worth the cost)
1. **Chunk decomposition output** — structured claims/facts enable deduplication
2. **Cross-chunk dependency tracking** — LLMxMapReduce shows +15-35pp from structured protocol
3. **Verification input** — claims need structured format for MiniCheck
4. **Confidence scores** — calibrated scores enable intelligent conflict resolution

### Where Structure Hurts
1. **Initial synthesis/reasoning** — constraining format during generation reduces quality
2. **Final recomposition** — natural prose output shouldn't be forced into structure

### Cost-Fidelity Recommendation
- **Structured intermediate representations are high-ROI**: the +15-35pp fidelity gain from structured protocol far exceeds the ~2x token overhead
- **Use TOON or minimal JSON** to reduce token overhead while preserving structure benefits
- **Two-step pattern** for synthesis stages: reason freely, then extract structured output
- **Net cost impact**: +30-100% tokens for intermediates, but prevents 15-35pp quality loss in final output
