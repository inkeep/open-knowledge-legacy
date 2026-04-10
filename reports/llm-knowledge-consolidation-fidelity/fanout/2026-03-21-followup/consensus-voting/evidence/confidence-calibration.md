---
title: Confidence Calibration Across Heterogeneous Agents
type: evidence
sources:
  - title: "Confidence Calibration and Rationalization for LLMs via Multi-Agent Deliberation"
    authors: "Ruixin Yang, Dheeraj Rajagopal, Shirley Anugrah Hayati, Bin Hu, Dongyeop Kang"
    venue: "arXiv 2404.09127"
    url: "https://arxiv.org/abs/2404.09127"
  - title: "A Survey of Confidence Estimation and Calibration in LLMs"
    venue: "NAACL 2024"
    url: "https://aclanthology.org/2024.naacl-long.366.pdf"
  - title: "An LLM-based Delphi Study to Predict GenAI Evolution"
    venue: "arXiv 2502.21092"
    url: "https://arxiv.org/abs/2502.21092"
  - title: "The Human-AI Hybrid Delphi Model"
    venue: "arXiv 2508.09349"
    url: "https://arxiv.org/abs/2508.09349"
---

## Collaborative Calibration (Yang et al., 2024)

### Two-Stage Process

**Stage 1: Agent Ensemble and Stance Generation**
- Expert agents with different prompting strategies generate initial answers independently:
  - Chain-of-Thought (CoT)
  - Program-of-Thoughts (PoT)
  - Search-Augmented Self-Ask
  - GenRead
- Answers clustered into semantically unique stances with aggregated mean confidence and frequency counts

**Stage 2: Group Deliberation with Rationales**
- General agents assigned stances proportionally to original frequencies
- Each agent:
  1. Generates arguments defending their stance
  2. Rates peer arguments on: logical consistency, factuality, clarity, conciseness
  3. Receives feedback from supporting and opposing arguments
  4. Revises answers with confidence rationales
  5. Produces posterior confidence: C_post = P(Y_reference = Y_post | Y_post, R_conf, M)

### Handling Heterogeneous Models

**Dynamic Agent Selection** based on calibration scores computed on validation sets:
- Uncertainty-aware scoring: c'_i,j = (2·1_{a ∈ Y_ref} - 1)·c_i,j (or 0 if abstain)
- Agent slots distributed proportionally: ⌊N * Softmax(c)⌋
- Tested with: Mistral-7B, GPT-3.5-turbo, Cohere-Command

### Normalization Techniques
- All confidence estimates normalized to [0,1] regardless of source
- Open-source models: sequence perplexity → 1/PP(W) = P(w₁,...,w_N)^(1/N)
- Black-box APIs: verbalized confidence scaled to same [0,1] range
- This enables cross-model aggregation

### Calibration Results (ECE — lower is better)
| Task | Collaborative | Best Baseline | Better? |
|------|--------------|---------------|---------|
| GSM8K | 0.086 | 0.093 | Yes |
| TriviaQA | 0.070 | 0.055 | No |
| SciQ | 0.035 | 0.053 | Yes |
| AmbigQA | 0.026 | 0.052 | Yes |
| DateUnd | 0.055 | 0.092 | Yes |
| Biz-Ethics | 0.132 | 0.141 | Yes |

Superior on 5/6 tasks, particularly for arithmetic, symbolic reasoning, and ambiguity resolution.

### Key Finding
Hybrid approach (verbalized confidence + consistency-based ensemble) is more effective than either alone.

## Delphi Method for LLM Consensus

### LLM-Based Delphi Process (2025-2026 studies)
Three-round process with 8 LLMs:
1. **Round 1**: Independent assessment of statements
2. **Round 2**: Refinement based on feedback integration from other agents
3. **Round 3**: Pairwise debate on remaining disagreements

### Results
- LLMs achieved 93.3% consensus rate vs human experts at 81.5%
- Round 1: 117/135 statements reached consensus (86.7%)
- Round 2: +5 statements via feedback
- Round 3: +4 statements via structured debate
- Higher consensus rate is partially because LLMs lack the nuanced domain disagreements that real experts have

### Properties That Make Delphi Effective for AI
- **Diverse perspectives** through distinct expert personas
- **Iterative refinement** via multi-round protocols
- **Explicit rationale sharing** to surface disagreements
- **No diminishing engagement** (unlike human panels)
- **More rounds feasible** without fatigue constraints

### Hybrid Human-AI Delphi
AI provides consistent, evidence-aligned foundation; humans provide contextual interpretation and applied judgment.

## Confidence Estimation Approaches (NAACL 2024 Survey)

Two families for black-box LLMs:
1. **Consistency-based**: Repeated sampling, measuring agreement across outputs
2. **Verbalization-based**: Direct prompting ("How confident are you?")
3. **Hybrid**: Incorporating verbalized confidence into consistency-based ensemble (most effective)

Key challenge: LLMs are generally poorly calibrated and over-confident, especially after RLHF training.
