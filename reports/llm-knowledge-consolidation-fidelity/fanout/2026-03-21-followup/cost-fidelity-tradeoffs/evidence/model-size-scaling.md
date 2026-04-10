---
title: Model Size vs Consolidation Quality Scaling
type: evidence
sources:
  - url: https://arxiv.org/abs/2502.00977
    title: "Context-Aware Hierarchical Merging for Long Document Summarization"
    venue: ACL Findings 2025
  - url: https://arxiv.org/html/2405.03146v2
    title: "Quantifying the Capabilities of LLMs across Scale and Precision"
    year: 2024
  - url: https://arxiv.org/html/2406.13713v2
    title: "Comparison of Open-Source and Proprietary LLMs for Machine Reading Comprehension"
    year: 2024
  - url: https://vellum.ai/blog/llama-3-70b-vs-gpt-4-comparison-analysis
    title: "Llama 3 70B vs GPT-4: Comparison Analysis"
  - url: https://labelyourdata.com/articles/llm-fine-tuning/llm-model-size
    title: "LLM Model Size: 2026 Comparison Chart"
---

# Model Size vs Consolidation Quality Scaling

## Direct 8B vs 70B Comparison (Context-Aware Hierarchical Merging)

### Multi-LexSum Dataset
| Method | 8B ROUGE | 70B ROUGE | 8B PRisma | 70B PRisma |
|---|---|---|---|---|
| Zero-shot | 24.6 | 23.6 | 42.7 | 41.5 |
| HMerge | 24.4 | 26.7 | 45.5 | 48.2 |
| Extract-Support | 25.8 | 27.6 | 47.5 | 49.7 |

### SuperSummary Dataset
| Method | 8B ROUGE | 70B ROUGE | 8B PRisma | 70B PRisma |
|---|---|---|---|---|
| Zero-shot | 18.1 | 18.9 | 33.2 | 35.2 |
| HMerge | 20.3 | 21.8 | 37.8 | 42.2 |
| Extract-Support | 21.2 | 22.9 | 39.2 | 45.6 |

**Key observations:**
- 70B consistently outperforms 8B by 1-2pp ROUGE, 2-6pp PRisma
- The 8B→70B gap is larger on harder tasks (SuperSummary: +6.4pp PRisma vs +2.2pp on Multi-LexSum)
- Pipeline sophistication (Extract-Support) closes part of the model size gap: 8B+Extract-Support (47.5 PRisma) beats 70B zero-shot (41.5 PRisma)

## Machine Reading Comprehension (Open-Source vs Proprietary)

| Model | Exact Match | ROUGE-2 |
|---|---|---|
| GPT-4 | 87.0% | 83.0% |
| Mistral-7B-OpenOrca | 83.0% | 80.0% |
| Llama-2-7B-Chat | competitive | lower memory |

**Key finding:** 7B models reach ~95% of GPT-4's MRC performance. Fine-tuned 7B models can approach GPT-4 on specific tasks.

## Summarization Quality vs Model Size

- 70B models maintain high ROUGE-1 even at 4-bit and 8-bit quantization
- 13B models deliver strong balance of speed, accuracy, cost
- Beyond 70B, improvements become incremental vs compute increase
- Fine-tuned 13B often outperforms general-purpose 70B on domain-specific tasks

## Model Size Recommendations per Pipeline Stage

| Pipeline Stage | Minimum Viable | Recommended | Notes |
|---|---|---|---|
| Chunk summarization | 7-8B | 13-70B | Well-defined subtask; 7B adequate |
| Deduplication/merging | 13B | 70B | Needs cross-reference reasoning |
| Conflict resolution | 70B | Frontier | Highest reasoning demand |
| Fact verification | 770M (MiniCheck) | 770M | Purpose-built beats general LLM |
| Recomposition | 13B | 70B | Coherence/style demands scale |
| Final quality check | 70B | Frontier | Catches subtle errors |

## Cost Implications

At March 2026 API pricing:
- Frontier (Claude Opus 4.6): $5/$25 per M tokens (in/out)
- Mid-tier (Claude Sonnet 4.6): $3/$15 per M tokens
- Budget (Haiku/GPT-4o mini): $0.15-$0.25/$0.60-$1.25 per M tokens
- Open-source via providers: $0.14-$0.90 per M tokens
- Self-hosted 7B: ~$0.02-0.05 per M tokens (GPU amortized)
- MiniCheck (770M self-hosted): ~$0.01 per M tokens
