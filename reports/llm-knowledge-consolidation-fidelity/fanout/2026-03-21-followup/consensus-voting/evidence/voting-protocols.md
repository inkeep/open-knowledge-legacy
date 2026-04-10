---
title: Formal Voting and Consensus Protocols for Multi-Agent LLM Systems
type: evidence
sources:
  - title: "Voting or Consensus? Decision-Making in Multi-Agent Debate"
    authors: "Lars Benedikt Kaesberg, Jonas Becker, Jan Philip Wahle, Terry Ruas, Bela Gipp"
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2502.19130"
  - title: "Beyond Majority Voting: LLM Aggregation by Leveraging Higher-Order Information"
    authors: "Rui Ai, Yuqi Pan, David Simchi-Levi, Milind Tambe, Haifeng Xu"
    venue: "arXiv 2510.01499"
    url: "https://arxiv.org/abs/2510.01499"
  - title: "Ranked Voting based Self-Consistency of Large Language Models"
    authors: "Weiqin Wang, Yile Wang, Hui Huang"
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2505.10772"
  - title: "CortexDebate: Debating Sparsely and Equally for Multi-Agent Debate"
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2507.03928"
  - title: "CONSENSAGENT: Towards Efficient and Effective Consensus in Multi-Agent LLM Interactions Through Sycophancy Mitigation"
    authors: "Priya Pitre, Naren Ramakrishnan, Xuan Wang"
    venue: "ACL 2025 Findings"
    url: "https://aclanthology.org/2025.findings-acl.1141/"
---

## Seven Decision Protocols Tested (Kaesberg et al., ACL 2025)

The most comprehensive comparison of voting vs. consensus protocols for multi-agent LLM debate.

### Voting Protocols (4)
1. **Simple Voting** — Each agent casts one vote; highest vote count wins
2. **Ranked Voting** — Agents rank all solutions; best cumulative rank wins
3. **Cumulative Voting** — Agents distribute up to 25 points among solutions; highest total wins
4. **Approval Voting** — Agents approve unlimited solutions; most approvals wins

### Consensus Protocols (3)
1. **Majority Consensus** — Requires >50% agent agreement
2. **Supermajority Consensus** — Requires >66% agreement
3. **Unanimity Consensus** — Requires 100% agreement

### Key Quantitative Results
| Task Type | Winner | Margin |
|-----------|--------|--------|
| Reasoning | Voting | +13.2% over consensus |
| Knowledge | Consensus | +2.8% over voting |
| SQuAD 2.0 | Voting | 56.7% vs 43.6% F1 |
| MMLU-Pro | Consensus | +4.9% average |

### Critical Failure Modes
- **Approval Voting collapse**: Failed to reach decisions in 59% of cases due to agents approving all answers
- **Extended discussion degradation**: More debate rounds *decreased* performance
- **Agent agreeableness bias**: Agents tend to improve first agent's answer rather than proposing independent ideas
- **Computational cost**: Consensus protocols require ~5x compute; voting protocols require ~10x vs CoT baseline

### Diversity Interventions
- All-Agents Drafting (AAD): +3.3% performance
- Collective Improvement (CI): +7.4% performance

## Beyond Majority Voting (Ai et al., MIT/Harvard)

### Optimal Weight (OW) Algorithm
Uses inverse sigmoid weighting based on individual LLM accuracies. For agent i with accuracy x_i:
- Weight = σ_K^(-1)(x_i)
- Proven to be Bayesian-optimal among all possible aggregators

### Inverse Surprising Popularity (ISP) Algorithm
Operates without ground truth labels by leveraging correlations between model predictions:
- Computes "advantage" score for each answer option based on patterns in how agents predict given others' predictions
- Requires only second-order information (conditional prediction probabilities)

### Quantitative Improvements
- ISP: 90.48% accuracy vs MV: 85.13% accuracy (+5.35 pp)
- OW variants outperform MV in 97.92% of tested ensemble combinations
- Absolute improvements range from 0.54% to 14.20%

### Key Theoretical Result
For homogeneous agents with equal accuracy, majority voting becomes optimal — aggregation benefits require heterogeneity.

## Ranked Voting Self-Consistency (Wang et al., ACL 2025)

### Method
Instead of generating single answers, prompts LLMs to generate ranked possibility ordering of all options in each reasoning attempt, then applies ranked voting across multiple responses.

### Three Voting Methods Compared
1. **Instant-Runoff Voting (IRV)** — Elimination-based; iteratively removes lowest first-choice candidates
2. **Borda Count Voting (BCV)** — Positional weighting: BordaCount(A) = Σ(m − rank + 1)
3. **Mean Reciprocal Rank Voting (MRRV)** — Averages reciprocal rankings: MRR(A) = (1/k)Σ(1/rank)

### Results over Standard Majority Voting
- 2B-4B models: +3.32-4.95% improvement
- 7B-9B models: +2.68-3.51%
- GPT-3.5: +5.33%
- GPT-4: +0.48%
- Best on Date Understanding: +10.84-12.46%
- **Winner**: Mean Reciprocal Rank Voting showed strongest overall performance

## CortexDebate (ACL 2025)

### Dynamic Sparse Debate Graph
Constructs sparse debating graph where each agent only debates with helpful partners, optimized by McKinsey-based Debate Matter (MDM) module.

### McKinsey Trust Formula for Edge Weights
Evaluates trustworthiness through four aspects:
1. Credibility
2. Reliability
3. Intimacy
4. Self-orientation

### Results
- Reduces input length by up to 70.8%
- Raises accuracy across eight benchmarks
- Final answer by majority voting on sparse-graph-refined responses

## CONSENSAGENT (Pitre et al., ACL 2025)

Addresses sycophancy (agents reinforcing each other instead of critical engagement) through dynamic prompt refinement based on agent interactions. Achieves state-of-the-art results across six benchmark reasoning datasets while improving computational efficiency by reducing unnecessary debate rounds.
