---
title: Self-Consistency and Chain-of-Thought Voting
type: evidence
sources:
  - title: "Self-Consistency Improves Chain of Thought Reasoning in Language Models"
    authors: "Xuezhi Wang, Jason Wei, Dale Schuurmans, Quoc Le, Ed Chi, Sharan Narang, Aakanksha Chowdhery, Denny Zhou"
    venue: "ICLR 2023, arXiv 2203.11171"
    url: "https://arxiv.org/abs/2203.11171"
  - title: "Ranked Voting based Self-Consistency of Large Language Models"
    authors: "Weiqin Wang, Yile Wang, Hui Huang"
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2505.10772"
  - title: "Refining LLMs outputs with iterative consensus ensemble (ICE)"
    venue: "ScienceDirect, 2025"
    url: "https://www.sciencedirect.com/science/article/abs/pii/S0010482525010820"
---

## Self-Consistency (Wang et al., ICLR 2023)

### Core Mechanism
A complex reasoning problem typically admits multiple different reasoning paths leading to the correct answer. Self-consistency:
1. Samples diverse set of reasoning paths (not just greedy decoding)
2. Selects the most consistent answer by marginalizing out sampled reasoning paths
3. Uses majority voting across the sampled answers

### Performance Gains (over standard CoT)
| Benchmark | Improvement |
|-----------|-------------|
| GSM8K | +17.9% |
| SVAMP | +11.0% |
| AQuA | +12.2% |
| StrategyQA | +6.4% |
| ARC-challenge | +3.9% |

### Key Properties
- Training-free, works with any LLM
- More reasoning paths → higher accuracy (diminishing returns)
- Majority voting typically matches or outperforms more complex probability-based selection
- Applicable to single-agent scenarios (multiple samples from one model)

## Ranked Voting Self-Consistency (Wang et al., ACL 2025)

### Innovation over Standard Self-Consistency
Standard SC generates one answer per reasoning attempt. Ranked Voting SC generates ranked possibility ordering of ALL options in each attempt, then applies ranked voting across responses.

### Three Methods
1. **Instant-Runoff Voting (IRV)**: Elimination-based, iteratively removes lowest first-choice candidates
2. **Borda Count Voting (BCV)**: Positional weighting — BordaCount(A) = Σ(m − rank + 1)
3. **Mean Reciprocal Rank Voting (MRRV)**: MRR(A) = (1/k)Σ(1/rank)

### Key Advantage
Weighting-based methods (BCV, MRRV) less likely to produce ties than elimination-based (IRV), because they assign varying confidence scores rather than binary elimination.

### Results
- Consistent improvements across model sizes (2B to GPT-4)
- MRRV strongest overall, especially on open-ended tasks
- Largest gains on Date Understanding (+10.84-12.46%)

## Iterative Consensus Ensemble — ICE (2025)

An ensemble of LLMs exchanges reasoning steps and converges on a consensus answer. Raised performance from 46.9% to 68.2% on a PhD-level reasoning benchmark (+21.3 pp). Demonstrates that iterative exchange plus voting outperforms single-pass aggregation.

## Relevance to /consolidate

Self-consistency applies directly to claim verification in consolidation:
- For each factual claim, sample multiple verification reasoning paths
- Apply majority voting (or ranked voting) across paths
- Claims where self-consistency fails (no majority) are candidates for "disagree" flagging
- The gap between top-1 and top-2 vote counts serves as a confidence proxy
