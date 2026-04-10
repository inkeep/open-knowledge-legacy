---
title: Open-Source vs Proprietary Model Comparison
type: evidence
sources:
  - url: https://arxiv.org/html/2406.13713v2
    title: "Comparison of Open-Source and Proprietary LLMs for Machine Reading Comprehension"
    year: 2024
  - url: https://arxiv.org/abs/2502.00977
    title: "Context-Aware Hierarchical Merging for Long Document Summarization"
    venue: ACL Findings 2025
  - url: https://arxiv.org/abs/2404.10774
    title: "MiniCheck: Efficient Fact-Checking of LLMs on Grounding Documents"
    venue: EMNLP 2024
  - url: https://vellum.ai/blog/llama-3-3-70b-vs-gpt-4o
    title: "Llama 3.3 70B vs GPT-4o"
  - url: https://qlogix.blog/2025/04/04/comparing-the-top-open-source-llms-in-2025/
    title: "Comparing the Top Open-Source LLMs in 2025"
---

# Open-Source vs Proprietary Model Comparison for Consolidation

## Summarization Quality Gap

### Machine Reading Comprehension
| Model | Exact Match | ROUGE-2 | Cost/M tokens |
|---|---|---|---|
| GPT-4 | 87.0% | 83.0% | $5-30 (varies by variant) |
| Mistral-7B-OpenOrca | 83.0% | 80.0% | $0.20-0.40 |
| Llama-2-7B-Chat | ~80% | ~77% | $0.10-0.20 |

**Quality gap:** 7B open-source reaches ~95% of GPT-4 MRC performance at 1/50th-1/150th the cost.

### Long Document Summarization (Llama 3.1 family)
| Model | Multi-LexSum PRisma | SuperSummary PRisma |
|---|---|---|
| Llama 3.1 8B (Extract-Support) | 47.5 | 39.2 |
| Llama 3.1 70B (Extract-Support) | 49.7 | 45.6 |

**Note:** Llama 3.1 70B with Extract-Support performs comparably to GPT-4o for zero-shot text summarization (per direct comparison studies).

### Performance Gap Trend (2024-2025)
- Late 2025: open-source alternatives within 0.3pp of proprietary on key benchmarks
- Llama 3.1 405B matches or exceeds GPT-4 on ARC (96.9) and GSM8K (96.8)
- Fine-tuned smaller models often outperform general-purpose larger models on specific tasks

## Per-Stage Model Recommendations

### Decomposition/Chunking
| Model Class | Quality | Cost | Recommendation |
|---|---|---|---|
| Open-source 7-8B | Good | Very low | **Default choice** — well-defined extraction task |
| Open-source 13B | Better | Low | Good if higher extraction quality needed |
| Proprietary mid-tier | Best | Moderate | Overkill for most decomposition |

### Deduplication
| Model Class | Quality | Cost | Recommendation |
|---|---|---|---|
| Embedding model (e.g., BGE) | Good for semantic similarity | Very low | **Use for initial clustering** |
| Open-source 13B | Good for fine-grained dedup | Low | Arbitrate embedding-based clusters |
| Proprietary | Unnecessary | High | Over-specced |

### Conflict Resolution
| Model Class | Quality | Cost | Recommendation |
|---|---|---|---|
| Open-source 7B | Inadequate | Very low | Insufficient reasoning |
| Open-source 70B | Good | Moderate | Viable for clear conflicts |
| Proprietary frontier | Best | High | **Required for subtle/complex conflicts** |

### Verification
| Model Class | Quality | Cost | Recommendation |
|---|---|---|---|
| MiniCheck-FT5 (770M) | GPT-4 level | ~$0.01/M | **Default — 400x cheaper than GPT-4** |
| Proprietary frontier | GPT-4 level | ~$4/M | Escalation target for ambiguous claims |

### Recomposition
| Model Class | Quality | Cost | Recommendation |
|---|---|---|---|
| Open-source 13B | Adequate | Low | Serviceable prose |
| Open-source 70B | Good | Moderate | Good coherence |
| Proprietary mid-tier | Best | Moderate | **Best cost/quality for final output** |

## Mixed-Model Pipeline (Optimal Cost-Fidelity)

| Stage | Model | Estimated Cost/100 docs |
|---|---|---|
| Decomposition | Llama 3.1 8B (self-hosted or hosted) | $0.30-0.75 |
| Deduplication | Embedding model + Llama 13B arbiter | $0.10-0.30 |
| Conflict resolution | Claude Sonnet 4.6 | $0.45 |
| Recomposition | Claude Sonnet 4.6 | $0.38 |
| Verification (bulk) | MiniCheck-FT5 | $0.01 |
| Verification (escalation) | Claude Sonnet 4.6 | $0.11 |
| **Total** | | **~$1.35-2.00** |

vs. all-proprietary (Claude Sonnet for everything): ~$5.37
vs. all-frontier (Claude Opus for everything): ~$25+

**Savings from mixed pipeline: 60-75% vs homogeneous mid-tier, 90%+ vs homogeneous frontier.**
