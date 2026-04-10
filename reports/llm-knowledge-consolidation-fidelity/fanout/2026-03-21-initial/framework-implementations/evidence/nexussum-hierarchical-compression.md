---
title: "NexusSum Hierarchical Summarization Architecture"
source_type: academic_paper
sources:
  - url: "https://arxiv.org/abs/2505.24575"
    title: "NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization"
  - url: "https://aclanthology.org/2025.acl-long.500/"
    title: "ACL 2025 Proceedings"
date_collected: "2026-03-21"
---

# NexusSum Hierarchical Summarization

## Three-Stage Sequential Pipeline

```
[Stage 1: Preprocessor P] → [Stage 2: Summarizer S] → [Stage 3: Compressor C]
    N' = P(n1)+P(n2)+...+P(nk)    S0 = S(n'1)+...+S(n'j)    Si = Ci(si-1,1)+...
```

`+` = string concatenation. Each agent processes chunks independently.

## Chunking Strategies

| Stage | Method | Size |
|---|---|---|
| Preprocessor | Scene-based | 8 scenes per chunk |
| Summarizer | Scene-based | 8 scenes per chunk |
| Compressor | Sentence-based | delta tokens per chunk |

## Iterative Compression with Rollback

```python
for i in range(1, max_iterations + 1):  # max 10 iterations
    Si = Ci(si-1,1) + Ci(si-1,2) + ... + Ci(si-1,li-1)
    if word_count(Si) <= theta:
        return S(i-1)  # PREVIOUS iteration (prevents over-compression)
return S(max_iterations)
```

Key: when compression crosses below target theta, returns PREVIOUS iteration's output.

## Agent Prompts

- Preprocessor: "You are an expert script-to-narrative converter."
- Summarizer: "You are an expert storyteller. Create a concise summary."
- Compressor: "You are an expert storyteller. Create a concise meta summary of the given previous summary."

## Factual Fidelity Mechanisms

1. Chunk-based grounding (8-scene chunks maintain local context)
2. Progressive refinement (each stage has narrow transformation task)
3. Iteration rollback (prevents over-compression)
4. No explicit fact-checking agent

## Human Evaluation Results (K-Drama)

| Metric | NexusSum | Zero-Shot |
|---|---|---|
| Key Events | 4.17 | 3.50 |
| Factuality | 4.00 | 3.50 |
| Readability | 2.17 | 4.17 |

## NexusSumR (Reflection Stage)

Fourth agent rewrites for fluency:
- Readability: +1.5 points on 5-point scale
- Maintains factual accuracy
- Output: 234 words (vs NexusSum's 609)

## Design Characteristics

- No inter-chunk communication within a stage
- No cross-stage feedback loops (except iterative compression)
- Strictly forward information flow
- "Hierarchical" = progressive compression, not agent hierarchy
