---
title: When Consensus Fails — Detecting and Surfacing Irreconcilable Disagreements
type: evidence
sources:
  - title: "Why Do Multi-Agent LLM Systems Fail?"
    authors: "Mert Cemri, Melissa Z. Pan, Shuyi Yang, et al."
    venue: "arXiv 2503.13657"
    url: "https://arxiv.org/abs/2503.13657"
  - title: "Silence is Not Consensus: Disrupting Agreement Bias via Catfish Agent"
    authors: "Yihan Wang et al."
    venue: "arXiv 2505.21503"
    url: "https://arxiv.org/abs/2505.21503"
  - title: "CONSENSAGENT: Sycophancy Mitigation in Multi-Agent LLM Interactions"
    authors: "Priya Pitre, Naren Ramakrishnan, Xuan Wang"
    venue: "ACL 2025 Findings"
    url: "https://aclanthology.org/2025.findings-acl.1141/"
  - title: "Voting or Consensus? Decision-Making in Multi-Agent Debate"
    authors: "Kaesberg et al."
    venue: "ACL 2025 Findings"
    url: "https://arxiv.org/abs/2502.19130"
---

## Multi-Agent System Failure Taxonomy — MASFT (Cemri et al., 2025)

Analyzed 150+ execution traces across five popular MAS frameworks. Identified 14 failure modes in 3 categories.

### FC1: Specification and System Design Failures (5 modes)
1. Violations of task specifications
2. Role specification disobedience
3. Step repetition
4. Loss of conversation history
5. Unawareness of termination conditions

### FC2: Inter-Agent Misalignment (6 modes)
1. Conversation resets
2. Failure to seek clarification
3. Task derailment
4. Information withholding
5. **Ignoring other agents' input** — directly relevant to consensus
6. **Reasoning-action mismatches** — agent says it agrees but acts differently

### FC3: Task Verification and Termination (3 modes)
1. **Premature termination** — stopping before consensus is genuine
2. No or incomplete verification
3. Incorrect verification

### Key Statistics
- ChatDev baseline accuracy as low as 25%
- Inter-annotator agreement: Cohen's κ = 0.88
- Tactical interventions: only +14% improvement for ChatDev

### Critical Insight
"Many failures stem from challenges in inter-agent interactions rather than the limitations of individual agents."

## False Consensus — The Sycophancy Problem

### Silent Agreement (Wang et al., 2025)
- 61-91% of multi-agent failures caused by premature consensus
- Agents converge without sufficient critical analysis
- Especially dangerous in complex/ambiguous cases
- "Silent rate" metric: measures cases reaching conclusions without substantive discussion

### Sycophancy in Debate (CONSENSAGENT, Pitre et al., 2025)
- Agents reinforce each other's responses instead of critically engaging
- Inflates computational costs (more rounds needed to reach genuine consensus)
- Dynamic prompt refinement mitigates this behavior

### Approval Voting Collapse (Kaesberg et al., 2025)
- Agents "like to agree with each other" → voted for all answers → 59% decision failures
- Demonstrates that agreement bias corrupts certain voting mechanisms entirely

## When to Stop Trying for Consensus

### Heuristics for "Agree to Disagree"

**From the debate literature:**
1. **Round budget exhaustion**: After N rounds with no convergence, surface the split (Du et al. use 2 rounds)
2. **Vote margin threshold**: If top-2 answers are within ε votes, flag as contested rather than forcing a winner
3. **Confidence distribution bimodality**: When agent confidence scores cluster at extremes (high vs low on different claims), the underlying evidence genuinely supports multiple interpretations
4. **Controlled disagreement optimum**: "Moderate, not maximal, disagreement achieves best performance" — tit-for-tat strategies outperform both full agreement and full adversarial stances

**From the Catfish Agent work:**
5. **Tone escalation without resolution**: If even "strong" (assertive) challenges fail to shift positions, the disagreement is likely substantive rather than due to inertia
6. **Domain-specific differential persistence**: When agents with different domain expertise consistently disagree, it often reflects genuine knowledge boundaries

### Productive Use of Irreconcilable Disagreements
- Disagreements become explicit signals for where further evidence is needed
- Consensus becomes a high-precision prior on which directions are worth expensive real-world experiments
- Flag for human review rather than forcing AI resolution
- Include the split in the output with per-side confidence scores

## Implications for /consolidate

The failure literature strongly suggests:
1. **Never force consensus** — irreconcilable disagreements should be surfaced, not suppressed
2. **Detect false consensus** — silent agreement is more dangerous than explicit disagreement
3. **Budget debate rounds** — performance degrades with extended discussion; diminishing returns are real
4. **Differentiate task types** — knowledge tasks benefit from consensus, reasoning tasks from voting (Kaesberg)
5. **Use a Catfish/devil's advocate** — structured dissent is especially valuable with weaker agents
