---
title: Pipeline Stage Ablation Studies
type: evidence
sources:
  - url: https://arxiv.org/html/2410.09342v1
    title: "LLMxMapReduce: Simplified Long-Sequence Processing using Large Language Models"
    venue: arXiv 2024
  - url: https://arxiv.org/abs/2505.24575
    title: "NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization"
    venue: ACL 2025
  - url: https://arxiv.org/abs/2502.00977
    title: "Context-Aware Hierarchical Merging for Long Document Summarization"
    venue: ACL Findings 2025
---

# Pipeline Stage Ablation Studies

## LLMxMapReduce Ablation (Llama3-70B-Instruct)

| Configuration | Re.Avg | En.Avg | Co.De | Ma.Fi |
|---|---|---|---|---|
| Full Pipeline | 99.56 | 41.23 | 62.94 | 91.43 |
| -Confidence Calibration | 96.00 | 39.18 | 58.12 | 90.00 |
| -Structured Protocol | 97.14 | 25.93 | 46.45 | 56.00 |

**Key deltas when removing components:**
- Removing structured protocol: En.Avg drops 15.30pp, Co.De drops 16.49pp, Ma.Fi drops 35.43pp
- Removing confidence calibration: Re.Avg drops 3.56pp, En.Avg drops 2.05pp, Co.De drops 4.82pp

**Conclusion:** Structured protocol contributes 2-7x more fidelity than confidence calibration across tasks.

## NexusSum Progressive Pipeline Ablation (MENSA Dataset)

| Configuration | BERTScore (F1) | Delta |
|---|---|---|
| Zero-Shot baseline | 54.81 | -- |
| + Preprocessor (P) | 57.26 | +2.45 |
| + Summarizer (P+S) | 62.12 | +4.86 |
| + Compressor (S+C) | 63.90 | +1.78 |
| Full NexusSum (P+S+C) | 65.73 | +1.83 |

**Key insight:** The summarizer stage (+4.86pp) contributes the most fidelity. Preprocessing adds +2.45pp. The compression/refinement stage adds +1.78-1.83pp. Total pipeline improvement: +10.92pp over zero-shot.

## Context-Aware Hierarchical Merging (Llama 3.1 8B, Multi-LexSum)

| Method | ROUGE | BERTScore | PRisma |
|---|---|---|---|
| Zero-shot | 24.6 | 60.6 | 42.7 |
| HMerge (baseline) | 24.4 | 61.7 | 45.5 |
| Extract-Support | 25.8 | 63.3 | 47.5 |

**Human evaluation (Llama 3.1 70B):**
- Extract-Support: 72.7% correct claims, 18.2% incorrect, 9.1% absent
- HMerge baseline: 59.1% correct, 27.3% incorrect, 13.6% absent
- Delta: +13.6pp in correct claims, -9.1pp in incorrect claims

**70B model results (Multi-LexSum):**
| Method | ROUGE | BERTScore | PRisma |
|---|---|---|---|
| Zero-shot | 23.6 | 60.7 | 41.5 |
| HMerge | 26.7 | 64.3 | 48.2 |
| Extract-Support | 27.6 | 64.1 | 49.7 |

**70B model results (SuperSummary):**
| Method | ROUGE | BERTScore | PRisma |
|---|---|---|---|
| Zero-shot | 18.9 | 58.1 | 35.2 |
| HMerge | 21.8 | 65.4 | 42.2 |
| Extract-Support | 22.9 | 67.2 | 45.6 |
