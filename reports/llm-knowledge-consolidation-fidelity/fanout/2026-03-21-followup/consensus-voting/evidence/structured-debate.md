---
title: Structured Debate Protocols for Factual Convergence
type: evidence
sources:
  - title: "Improving Factuality and Reasoning in Language Models through Multiagent Debate"
    authors: "Yilun Du, Shuang Li, Antonio Torralba, Joshua B. Tenenbaum, Igor Mordatch"
    venue: "ICML 2024, arXiv 2305.14325"
    url: "https://arxiv.org/abs/2305.14325"
  - title: "MAD-Fact: A Multi-Agent Debate Framework for Long-Form Factuality Evaluation in LLMs"
    authors: "Yucheng Ning, Xixun Lin, Fang Fang, Yanan Cao"
    venue: "arXiv 2510.22967"
    url: "https://arxiv.org/abs/2510.22967"
  - title: "Silence is Not Consensus: Disrupting Agreement Bias in Multi-Agent LLMs via Catfish Agent"
    authors: "Yihan Wang, Qiao Yan, Zhenghao Xing, Lihao Liu, Junjun He, Chi-Wing Fu, Xiaowei Hu, Pheng-Ann Heng"
    venue: "arXiv 2505.21503"
    url: "https://arxiv.org/abs/2505.21503"
  - title: "CortexDebate: Debating Sparsely and Equally for Multi-Agent Debate"
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2507.03928"
---

## Multiagent Debate — Society of Minds (Du et al., ICML 2024)

### Protocol
- 3 language model agents debate for 2 rounds (chosen for computational cost)
- Each agent independently generates response
- Responses shared with all other agents
- Each agent generates updated response incorporating others' reasoning
- Performance improves with more agents and more rounds

### Key Results
- Significantly enhances mathematical and strategic reasoning
- Improves factual validity, reducing hallucinations
- Works across different LLM pairs (e.g., ChatGPT + Bard)
- Applicable to black-box models with identical procedure/prompts for all tasks
- Addresses "degeneration-of-thought" where single agents double down on wrong answers

### How Consensus Emerges
Agents propose, critique, and revise over rounds. No explicit voting — convergence happens through iterative argument refinement. The "common final answer" emerges naturally when agents stop changing their responses.

## MAD-Fact — Factuality Evaluation via Debate (Ning et al., 2025)

### Role-Based Debate Protocol
Six distinct evaluator personas:
1. General Public
2. Critic
3. News Author
4. Scientist
5. Psychologist
6. Data Analyst

### Claim Decomposition
**Clerk Agent** decomposes long-form text into atomic fact-checkable claims, filtering out instructions, suggestions, and subjective statements.

### Three Debate Rules
1. **Autonomous Retrieval and Free Debate** — agents decide independently whether to retrieve
2. **Mandatory Retrieval and Evidence-Based Debate** — retrieval required before speaking
3. **Dynamic Retrieval and Adaptive Debate** — retrieval becomes mandatory if first-round consensus fails

### Judge Agent Resolution
- Applies majority voting across evaluator assessments
- Tie-breaking: last-speaking evaluator's opinion chosen (has access to complete debate process)
- Pearson correlation with human judgments: r = 0.701 (p = 0.036)

### Results
- F1 = 0.88 (TRUE claims) on FacToolQA and BingCheck
- 80% win rate over SAFE and FIRE single-agent baselines

## Catfish Agent — Structured Dissent (Wang et al., 2025)

### Problem: Silent Agreement
61-91% of multi-agent failures caused by agents reaching conclusions without substantive discussion.

### Three-Tier Role Adaptation
1. **Basic cases**: Lightweight critique, flagging overlooked differentials
2. **Intermediate cases**: Fixed domain role with predefined debate structure
3. **Advanced cases**: Free-roaming entity (C*) that dynamically selects expertise personas

### Tone-Calibrated Intervention (3 intensities)
1. **Mild**: Reflective, non-confrontational prompts
2. **Intermediate**: Targeted questions with constructive pressure
3. **Strong**: Assertive challenges explicitly questioning group reasoning

### Quantitative Results
- Average accuracy gain: +12.73 pp (39.2% relative improvement)
- Silent agreement rate: 61-89% → 11-17%
- Outperforms GPT-4o by +30 pts on MedQA
- Superior especially with lower-capacity base models

### Key Insight
Structured dissent compensates for individual agent limitations — the cheaper the agents, the more valuable the Catfish Agent becomes.

## CortexDebate — Sparse Dynamic Debate (ACL 2025)

### Innovation
Not all agents need to debate all other agents. CortexDebate builds a sparse debating graph optimized by McKinsey Trust Formula:
- **Credibility**: How well-founded are the agent's claims?
- **Reliability**: How consistent are the agent's answers?
- **Intimacy**: How well does the agent understand the domain?
- **Self-orientation**: How much is the agent optimizing for itself vs truth?

### Results
- Reduces input length by up to 70.8%
- Maintains or improves accuracy across eight benchmarks
- Demonstrates that selective debate partners outperform universal debate
