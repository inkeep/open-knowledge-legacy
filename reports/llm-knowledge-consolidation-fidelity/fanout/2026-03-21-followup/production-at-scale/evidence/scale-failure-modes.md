---
title: Scale-Specific Failure Modes in Multi-Document LLM Consolidation
type: primary-source-synthesis
sources:
  - url: https://arxiv.org/abs/2410.13961
    title: "From Single to Multi: How LLMs Hallucinate in Multi-Document Summarization"
    publisher: arXiv / NAACL 2025 Findings
    authors: Catarina G. Belem et al.
    year: 2025
  - url: https://arxiv.org/abs/2307.03172
    title: "Lost in the Middle: How Language Models Use Long Contexts"
    publisher: arXiv
    authors: Liu et al.
  - url: https://arxiv.org/html/2511.12869v1
    title: "On the Fundamental Limits of LLMs at Scale"
    publisher: arXiv
    year: 2025
  - url: https://arxiv.org/abs/2511.13900
    title: "What Works for Lost-in-the-Middle in LLMs?"
    publisher: arXiv
    year: 2025
  - url: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
    title: "Context Engineering for AI Agents: Lessons from Building Manus"
    publisher: Manus
date_accessed: 2026-03-21
---

## Multi-Document Hallucination (Belem et al., 2025)

### Hallucination Rates by Domain
- News domain: 20-45% hallucination rates (macro-FDR)
- Conversation domain: 52-75% hallucination rates
- GPT-4o: ~45% (news), ~75% (conversation)
- Llama 3.1 70B: generally lowest hallucination rates

### Scaling Effects (2 → 10 documents)
- Contrary to expectations: only marginal changes (±5%) in hallucinated content
- Gemini-1.5-Flash: up to 10% increase
- **Recall declined significantly** (up to 33%) while error rates stayed "almost constant"
- Key finding: more documents → less coverage, not more hallucination

### Non-Existent Topic Fabrication
- GPT-3.5-Turbo generated summaries 79.35% of the time for absent topics
- GPT-4o: 44% of the time
- Llama 3.1 70B: abstained 71% (best performer)

### Error Taxonomy (from 700+ manual annotations)
1. **Pedantic** (50-80%): overly generic, uninformative, paraphrases
2. **Instruction Inconsistency** (40-87%): off-topic, redundant, non-shared content
3. **Context Inconsistency** (10-37%): overgeneralization, oversimplification
4. **Fabrication** (0-9%): contradicts/unsupported by sources — rare but critical

### Position Effects
- Accuracy declines with insight position in output
- Earlier insights more accurate; later insights increasingly hallucinated
- Models append concluding/takeaway insights with poor accuracy

### Mitigation Results
- Top-k truncation: best approach, ~2.5% F1 improvement
- Redundancy removal: ~0% impact
- Combined heuristics: ±3% F1 variance
- Conclusion: simple heuristics insufficient without sacrificing coverage

## Lost-in-the-Middle Problem

### Core Effect
- Performance highest for information at beginning/end of context
- Significant degradation for mid-context information
- Root cause: Rotary Position Embedding (RoPE) decay effect

### Scale Impact
- 20-50% accuracy drops from 10K to 100K tokens
- 30%+ accuracy drop when answer document moves from position 1 to position 10 in 20-doc context (Liu et al., 2024)
- Adding full history (~113K tokens) → 30% accuracy drop vs focused 300-token version
- Claude models decay slowest but are not immune

### Production Mitigations
- Two-stage retrieval: broad recall + cross-encoder reranking
- Strategic ordering: top evidence at start AND end of context
- Multi-scale Positional Encoding (Ms-PoE): 20-40% middle-position accuracy improvement, no compute overhead

## Context Window Saturation

### Production Observations (from ZenML 1,200 deployment study)
- "Context rot" universally appears between 50K-150K tokens
- Manus: staged compaction (reversible) → summarization (irreversible)
- File system offloading for large datasets
- Input-to-output ratio: 100:1 in agentic systems

### Token Budget Dilemma
- Relevance–Coverage trade-off under hard context limits
- Increased recall → prompt dilution and generation drift
- Strict precision → excludes essential peripheral evidence
- Mutual information with target decays as retrieval breadth increases

## Fundamental Scaling Limits (arXiv 2511.12869)
- Hallucination is mathematically inevitable: diagonalization over enumerable model classes
- Uncomputability yields infinite failure sets
- Finite information capacity forces distortion on complex/rare facts
