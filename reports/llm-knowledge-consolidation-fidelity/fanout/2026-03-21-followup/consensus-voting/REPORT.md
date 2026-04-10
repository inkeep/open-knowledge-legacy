# Consensus and Voting Mechanisms for Multi-Agent Knowledge Consolidation

**Follow-up to:** LLM Knowledge Consolidation Fidelity Report
**Date:** 2026-03-21
**Scope:** How do agents reach agreement when their findings conflict? What mechanisms should a /consolidate skill implement?

---

## Executive Summary

Multi-agent consensus for knowledge consolidation is a rapidly maturing field with clear, actionable findings. The core tension: **voting excels at reasoning tasks (+13.2%), while consensus excels at knowledge tasks (+2.8%)**. Since /consolidate primarily handles knowledge claims, consensus-style mechanisms should dominate, but with voting-based fallbacks for contested claims.

Seven key mechanisms emerge as candidates for implementation, organized by increasing complexity and cost:

| Mechanism | Best For | Cost | Accuracy Gain |
|-----------|----------|------|---------------|
| Self-consistency voting | Claim verification | Low (1 model, N samples) | +6-18% |
| Majority voting | Quick claim triage | Low | Baseline |
| Weighted/ranked voting | Heterogeneous agents | Low | +3-14% over MV |
| Panel of judges (PoLL) | Claim assessment | Medium (3 models) | +10-14% κ over single |
| Structured debate | Conflict resolution | High (N agents × rounds) | +12.7 pp |
| Delphi iterative refinement | Deep disagreements | High | +21.3 pp (ICE) |
| Devil's advocate (Catfish) | False consensus detection | Medium | +12.7 pp, -50 pp silent agreement |

The most dangerous failure mode is **false consensus** (61-91% of multi-agent failures), not disagreement. A /consolidate skill must actively probe for silent agreement rather than treating convergence as evidence of correctness.

---

## 1. Formal Voting Protocols

### 1.1 Seven Decision Protocols Compared

[Kaesberg et al. (ACL 2025)](https://arxiv.org/abs/2502.19130) conducted the most comprehensive comparison of decision-making protocols for multi-agent LLM debate, testing four voting and three consensus protocols across six knowledge and reasoning tasks.

**Voting protocols:**
- **Simple Voting**: Each agent casts one vote; highest count wins
- **Ranked Voting**: Agents rank all solutions; best cumulative rank wins
- **Cumulative Voting**: Agents distribute up to 25 points; highest total wins
- **Approval Voting**: Agents approve any number of solutions; most approvals wins

**Consensus protocols:**
- **Majority Consensus**: >50% agreement required
- **Supermajority Consensus**: >66% agreement required
- **Unanimity Consensus**: 100% agreement required

**Key finding**: Voting outperformed consensus by 13.2% on reasoning tasks (SQuAD 2.0: 56.7% vs 43.6% F1), while consensus outperformed voting by 2.8% on knowledge tasks (MMLU-Pro: +4.9%). The explanation: voting "allows exploration of multiple reasoning paths" while consensus "mitigates individual agent errors by requiring multiple agents to agree on the same statement."

**Critical failure**: Approval Voting collapsed in 59% of cases because agents "like to agree with each other" and voted for all answers, creating ties. This directly warns against permissive voting mechanisms in consolidation.

### 1.2 Beyond Majority Voting

[Ai et al. (MIT/Harvard, 2025)](https://arxiv.org/abs/2510.01499) proved that standard majority voting is suboptimal for heterogeneous agent ensembles and proposed two superior algorithms:

**Optimal Weight (OW)**: Uses inverse sigmoid weighting based on individual agent accuracies. Proven Bayesian-optimal among all possible aggregators. For agent i with accuracy x_i, weight = σ_K^{-1}(x_i).

**Inverse Surprising Popularity (ISP)**: Operates *without ground truth labels* by leveraging second-order information — conditional prediction probabilities ("what does agent j predict given agent i's answer?"). Achieved 90.48% vs majority voting's 85.13% (+5.35 pp). OW outperformed MV in 97.92% of tested ensemble combinations.

**Theoretical result**: For homogeneous agents with equal accuracy, majority voting is optimal. Aggregation benefits *require* heterogeneity. This is directly relevant to /consolidate: if using the same model for all agents, fancy voting adds nothing — use self-consistency instead.

### 1.3 Ranked Voting Self-Consistency

[Wang et al. (ACL 2025)](https://arxiv.org/abs/2505.10772) extended self-consistency by having LLMs generate ranked possibility orderings (not just single answers), then applying ranked voting:

- **Instant-Runoff Voting (IRV)**: Elimination-based
- **Borda Count Voting**: Positional weighting — BordaCount(A) = Σ(m − rank + 1)
- **Mean Reciprocal Rank Voting (MRRV)**: MRR(A) = (1/k)Σ(1/rank) — **strongest performer**

Improvements: +3.3-5.3% over standard majority voting across model sizes, with largest gains on ambiguous tasks (+10.8-12.5%).

### Implication for /consolidate

For claim-level verification, use **majority voting** as the default (simple, robust). Upgrade to **weighted voting** when agents are heterogeneous (different models, different retrieval sources). Use **ranked voting (MRRV)** when claims have multiple plausible interpretations.

---

## 2. LLM-as-Jury Patterns

### 2.1 Panel of LLM Evaluators (PoLL)

[Verga et al. (Cohere, 2024)](https://arxiv.org/abs/2404.18796) formalized the jury pattern: an ensemble of three smaller LLMs from different model families independently evaluate, then aggregate via max voting (binary) or average pooling (scalar).

**Panel composition**: Command R (35B), Claude Haiku, GPT-3.5 — deliberately heterogeneous.

**Results vs. single GPT-4 judge:**

| Benchmark | PoLL (κ) | GPT-4 (κ) |
|-----------|----------|-----------|
| Natural Questions | 0.763 | 0.627 |
| TriviaQA | 0.906 | 0.841 |
| HotpotQA | 0.867 | 0.830 |
| Chatbot Arena (Pearson) | 0.917 | 0.817 |

**Cost**: 7-8x cheaper than single GPT-4 judge. **Bias**: Individual judges show intra-model bias (highest positive delta when judged by self); PoLL mitigates through heterogeneous composition (std dev 2.2 vs 6.1).

**Key insight**: "There is not a single 'best' judge across all settings, while PoLL performs well consistently." Model diversity is the mechanism, not model size.

### 2.2 Multi-Agent Verification (BoN-MAV)

[Lifshitz et al. (2025)](https://arxiv.org/abs/2502.20379) introduced Aspect Verifiers — LLMs prompted to verify specific dimensions (mathematical correctness, logical soundness, factuality, domain knowledge) via binary True/False approval.

**Algorithm**: Sample n candidates → collect binary approvals from m verifiers → select candidate with most approvals.

20 total verifiers using two base models, six aspects, five strategies (direct approval, step-by-step verification, solution rephrasing, edge case checking, common mistake identification).

**Results**: On MATH, BoN-MAV achieved 66.0% vs self-consistency 59.0% vs reward model 61.7%. **Weak-to-strong generalization**: weaker verifiers (Gemini Flash, GPT-4o-mini) improved stronger generators (GPT-4o: 76.3% vs 68.3% pass@1).

### 2.3 Disagreement as Signal

From the jury literature, disagreement is informative, not just noise:
- A **single disagreement** in high-stakes domains justifies blocking output or escalating to human review
- Jury panels smooth borderline decisions where single models flip unpredictably
- Expert reliability is context-dependent — static averaging fails because model competence varies by claim type

### Implication for /consolidate

Implement a **claim verification jury**: 3 heterogeneous models assess each contested claim independently. Aggregate via majority vote for binary (true/false), average pooling for confidence scores. Track **disagreement rate** as a first-class quality signal — high disagreement = flag for human review, not force resolution.

---

## 3. Self-Consistency Voting

### 3.1 Core Mechanism

[Wang et al. (ICLR 2023)](https://arxiv.org/abs/2203.11171) established that sampling diverse reasoning paths from a single model and applying majority voting substantially improves accuracy:

| Benchmark | Improvement over CoT |
|-----------|---------------------|
| GSM8K | +17.9% |
| SVAMP | +11.0% |
| AQuA | +12.2% |
| StrategyQA | +6.4% |

Training-free, works with any LLM. More reasoning paths → higher accuracy with diminishing returns.

### 3.2 Application to Claim Verification

Self-consistency maps directly to consolidation claim verification:
1. For each factual claim, sample N verification reasoning paths
2. Apply majority voting across paths
3. Claims where no majority exists are candidates for "contested" flagging
4. The **margin** between top-1 and top-2 vote counts serves as a confidence proxy

### 3.3 Iterative Consensus Ensemble (ICE)

An ensemble of LLMs exchanging reasoning steps and converging raised performance from 46.9% to 68.2% on a PhD-level reasoning benchmark (+21.3 pp). This combines self-consistency with inter-model communication.

### Implication for /consolidate

Self-consistency is the **cheapest effective mechanism** — single model, N samples, majority vote. Use as the first pass for claim verification before escalating contested claims to multi-agent debate.

---

## 4. Structured Debate

### 4.1 Society of Minds (Du et al., ICML 2024)

[Du et al.](https://arxiv.org/abs/2305.14325) pioneered multi-agent debate where 3 LLM instances debate for 2 rounds:
1. Each agent independently generates response
2. Responses shared with all other agents
3. Each agent generates updated response incorporating others' reasoning
4. Consensus emerges through iterative argument refinement

Results: significantly improved factuality and reasoning, reducing hallucinations. Works across different LLM pairs (ChatGPT + Bard). Addresses "degeneration-of-thought" where single agents double down on errors.

### 4.2 MAD-Fact: Debate for Factuality Evaluation

[Ning et al. (2025)](https://arxiv.org/abs/2510.22967) applied multi-agent debate specifically to factuality evaluation of long-form text:

**Claim decomposition**: A Clerk Agent decomposes text into atomic fact-checkable claims, filtering out subjective statements.

**Role-based debate**: Six evaluator personas (General Public, Critic, News Author, Scientist, Psychologist, Data Analyst) debate each claim.

**Three debate rules**:
1. Autonomous retrieval + free debate
2. Mandatory retrieval + evidence-based debate
3. **Dynamic retrieval**: retrieval becomes mandatory if first-round consensus fails

**Judge resolution**: Majority voting across evaluators; tie-breaking via last-speaking evaluator (who has full debate context). F1 = 0.88 on factuality benchmarks; 80% win rate over single-agent baselines.

### 4.3 Catfish Agent: Structured Dissent

[Wang et al. (2025)](https://arxiv.org/abs/2505.21503) identified that 61-91% of multi-agent failures are caused by **silent agreement** — agents reaching conclusions without substantive discussion.

**Solution**: A Catfish Agent injects structured dissent with three escalating intensities:
- **Mild**: Reflective, non-confrontational prompts
- **Intermediate**: Targeted questions with constructive pressure
- **Strong**: Assertive challenges explicitly questioning group reasoning

**Three-tier role adaptation** scales intervention to case complexity:
- Basic: lightweight critique
- Intermediate: fixed domain role
- Advanced: free-roaming entity dynamically selecting expertise personas

**Results**: +12.73 pp average accuracy gain, silent agreement rate reduced from 61-89% to 11-17%. Outperforms GPT-4o by +30 pts on MedQA. **Critically, structured dissent is most valuable with weaker base models** — it compensates for individual agent limitations.

### 4.4 CortexDebate: Selective Debate Partners

[CortexDebate (ACL 2025)](https://arxiv.org/abs/2507.03928) demonstrated that not all agents need to debate all other agents. A sparse debate graph, optimized via the McKinsey Trust Formula (credibility, reliability, intimacy, self-orientation), reduces input length by 70.8% while maintaining accuracy.

### Implication for /consolidate

Structured debate should be reserved for **contested claims** that survive initial voting/self-consistency. Use role-based debate (MAD-Fact pattern) with claim decomposition. Include a devil's advocate agent to prevent false consensus. Budget debate to 2 rounds maximum (performance degrades with more). Use dynamic retrieval — mandatory evidence gathering when first-round consensus fails.

---

## 5. Confidence Calibration Across Agents

### 5.1 Collaborative Calibration

[Yang et al. (2024)](https://arxiv.org/abs/2404.09127) developed a two-stage process for calibrating confidence across heterogeneous models:

**Stage 1**: Expert agents with different prompting strategies (CoT, Program-of-Thoughts, Search-Augmented, GenRead) generate initial answers independently. Answers clustered into unique stances with aggregated mean confidence.

**Stage 2**: Agents assigned stances proportionally, then:
1. Generate arguments defending their stance
2. Rate peer arguments on logical consistency, factuality, clarity
3. Receive feedback from supporting and opposing arguments
4. Revise with posterior confidence

**Normalization for heterogeneous models**:
- Open-source models: sequence perplexity → 1/PP(W) = P(w₁,...,w_N)^{1/N}
- Black-box APIs: verbalized confidence
- All normalized to [0,1] range for cross-model aggregation

**Agent selection**: Dynamic allocation based on calibration scores on validation set: ⌊N × Softmax(c)⌋ slots per agent type.

**Results**: ECE improved on 5/6 benchmarks. Best on arithmetic (GSM8K: 0.086 vs 0.093), symbolic reasoning (DateUnd: 0.055 vs 0.092), and ambiguity (AmbigQA: 0.026 vs 0.052).

### 5.2 The Overconfidence Problem

LLMs are generally poorly calibrated and over-confident, especially after RLHF. The hybrid approach — verbalized confidence folded into consistency-based ensemble — outperforms either technique alone. This means /consolidate should never trust a single agent's self-reported confidence without calibration.

### 5.3 Delphi-Style Iterative Calibration

LLM-based Delphi studies (2025-2026) show iterative refinement improves calibration:
- Round 1: Independent assessment → 86.7% consensus
- Round 2: Feedback integration → +5 statements
- Round 3: Pairwise debate → +4 statements
- Final: 93.3% consensus rate (vs 81.5% for human experts)

### Implication for /consolidate

Normalize all confidence scores to [0,1] before aggregation, regardless of source model. Use the hybrid approach: combine verbalized confidence with consistency-based scoring. Apply dynamic agent weighting based on per-domain calibration performance. Never trust raw LLM confidence without cross-validation.

---

## 6. When Consensus Fails

### 6.1 Failure Taxonomy

[Cemri et al. (2025)](https://arxiv.org/abs/2503.13657) analyzed 150+ execution traces and identified 14 failure modes. The consensus-relevant failures:

- **Ignoring other agents' input** — agents proceeding without incorporating feedback
- **Reasoning-action mismatches** — agent says it agrees but acts differently
- **Premature termination** — stopping before consensus is genuine
- **Incorrect verification** — agents confirming wrong answers

**Critical finding**: "Many failures stem from challenges in inter-agent interactions rather than the limitations of individual agents." Organizational design matters more than model capability.

### 6.2 False Consensus is More Dangerous Than Disagreement

The Catfish Agent research found that **61-91% of multi-agent failures** are caused by silent agreement, not by disagreement. Agents converge without substantive discussion, especially on complex or ambiguous cases.

CONSENSAGENT found that sycophancy (agents reinforcing each other instead of critically engaging) inflates computational costs by requiring extra rounds while degrading accuracy.

### 6.3 Heuristics for "Agree to Disagree"

When should /consolidate stop trying for consensus and surface the disagreement?

1. **Round budget exhaustion**: After N rounds (recommended: 2) with no convergence, surface the split
2. **Vote margin threshold**: If top-2 answers are within ε votes, flag as contested rather than forcing a winner
3. **Confidence distribution bimodality**: Agent scores cluster at extremes → genuinely ambiguous evidence
4. **Controlled disagreement optimum**: Moderate disagreement achieves best performance; maximal adversarial stances hurt
5. **Tone escalation without resolution**: If even "strong" Catfish challenges fail to shift positions, the disagreement is substantive
6. **Cross-domain expert persistence**: When agents with different domain expertise consistently disagree, it reflects genuine knowledge boundaries

### 6.4 Productive Disagreement

Disagreements should be treated as **signals, not failures**:
- Explicit markers for where further evidence is needed
- High-precision priors on which claims deserve expensive verification
- Flags for human review rather than forced AI resolution
- Output should include the split with per-side confidence scores and reasoning

### Implication for /consolidate

Implement a **contested claims register**: when consensus fails after budget exhaustion, record both positions with confidence scores, supporting evidence, and the debate trace. Surface these to the user as explicit uncertainties rather than dropping the minority view. The absence of disagreement is itself a warning sign requiring active probing.

---

## 7. Production Examples

### 7.1 KARMA: Knowledge Graph Enrichment (NeurIPS 2025)

[Lu & Wang (Peking University)](https://arxiv.org/abs/2502.06472) built a 9-agent system for automated knowledge graph enrichment from PubMed literature — the closest production system to what /consolidate needs.

**Conflict Resolution Agent (CRA)**: Uses LLM-based debate when new triplets conflict with existing knowledge. Classifies interactions as "Contradict," "Agree," or "Ambiguous." Contradictions are discarded or queued for expert review based on confidence.

**Multi-layer assessment** for each candidate triplet:
- Confidence C(t): aggregated verification signals
- Clarity Cl(t): terminological unambiguity
- Relevance R(t): domain significance

Integration decision: if [C(t) + Cl(t) + R(t)]/3 ≥ Θ

**Results**: 38,230 new entities from 1,200 PubMed articles, 83.1% LLM-verified correctness, 18.6% conflict edges removed. Ablation: removing CRA dropped correctness from 83.1% to 79.0%.

### 7.2 BoN-MAV: Aspect-Based Verification at Scale

Demonstrated weak-to-strong generalization — weaker verifiers (Gemini Flash, GPT-4o-mini) improve stronger generators. Binary approval voting across aspect verifiers provides a production-ready pattern for claim-level verification.

### 7.3 MAD-Fact: Factuality Evaluation Pipeline

Clerk Agent → atomic claim decomposition → role-based debate → majority voting with judge resolution. F1 = 0.88 for TRUE claims; 80% win rate over single-agent approaches.

### 7.4 Microsoft GraphRAG

Community detection for implicit consensus — clusters semantically similar claims, generates community-level summaries. Resolves conflicts implicitly through clustering rather than explicit voting. Production-deployed, open-source since 2024.

---

## 8. Recommendations for /consolidate

Based on the evidence, /consolidate should implement a **tiered consensus architecture** with escalating cost and rigor:

### Tier 1: Self-Consistency Triage (Low Cost)
- For each factual claim from agent outputs, sample N=5 verification reasoning paths from a single model
- Apply majority voting; claims with clear majority (≥80%) pass automatically
- Claims with narrow majority (50-80%) or no majority advance to Tier 2
- **Cost**: 1 model × N samples per claim

### Tier 2: Jury Verification (Medium Cost)
- Contested claims assessed by a panel of 3 heterogeneous models (PoLL pattern)
- Binary approval + confidence score from each
- Aggregate via majority vote; track disagreement rate as quality signal
- Claims with unanimous agreement pass; split decisions advance to Tier 3
- **Cost**: 3 models × 1 call per claim

### Tier 3: Structured Debate (High Cost, Rare)
- Claims that survive Tier 2 without resolution enter structured debate
- Role-based debate (2-3 roles) with mandatory evidence retrieval
- Include a devil's advocate agent (Catfish pattern) to prevent false consensus
- Budget: maximum 2 rounds
- **Cost**: 3-6 models × 2 rounds per claim

### Tier 4: Contested Claims Register (No Additional Cost)
- After Tier 3, if still no consensus:
  - Record both positions with per-side confidence, evidence, and debate trace
  - Surface to user as explicit uncertainty with minority/majority labeling
  - Do not force resolution

### Cross-Cutting Concerns

**Confidence normalization**: Normalize all scores to [0,1] using hybrid approach (verbalized + consistency-based). Weight agents dynamically based on domain-specific calibration scores.

**False consensus detection**: Monitor for silent agreement patterns. Periodically inject Catfish-style probes even when consensus appears achieved. Track "silent rate" as a system health metric.

**Task-type routing**: Use consensus mechanisms for knowledge/factual claims (where consensus excels by +2.8%). Use voting mechanisms for reasoning-dependent claims (where voting excels by +13.2%).

**Voting method selection**:
- Homogeneous agents (same model) → standard majority voting
- Heterogeneous agents (different models) → weighted voting (OW or ISP)
- Multiple plausible interpretations → ranked voting (MRRV)

---

## Evidence Files

- [evidence/voting-protocols.md](evidence/voting-protocols.md) — Formal voting and consensus protocol comparison
- [evidence/llm-as-jury.md](evidence/llm-as-jury.md) — PoLL, BoN-MAV, and disagreement-as-signal
- [evidence/self-consistency.md](evidence/self-consistency.md) — Self-consistency voting and ranked variants
- [evidence/structured-debate.md](evidence/structured-debate.md) — Debate protocols, Catfish Agent, CortexDebate
- [evidence/confidence-calibration.md](evidence/confidence-calibration.md) — Cross-model calibration and Delphi methods
- [evidence/consensus-failures.md](evidence/consensus-failures.md) — MASFT taxonomy, false consensus, when to stop
- [evidence/production-systems.md](evidence/production-systems.md) — KARMA, MAD-Fact, GraphRAG, production patterns

## Key Citations

1. Kaesberg et al. "Voting or Consensus? Decision-Making in Multi-Agent Debate." ACL 2025 Findings. [arXiv:2502.19130](https://arxiv.org/abs/2502.19130)
2. Ai et al. "Beyond Majority Voting: LLM Aggregation by Leveraging Higher-Order Information." [arXiv:2510.01499](https://arxiv.org/abs/2510.01499)
3. Wang et al. "Self-Consistency Improves Chain of Thought Reasoning in Language Models." ICLR 2023. [arXiv:2203.11171](https://arxiv.org/abs/2203.11171)
4. Wang et al. "Ranked Voting based Self-Consistency of Large Language Models." ACL 2025 Findings. [arXiv:2505.10772](https://arxiv.org/abs/2505.10772)
5. Du et al. "Improving Factuality and Reasoning in Language Models through Multiagent Debate." ICML 2024. [arXiv:2305.14325](https://arxiv.org/abs/2305.14325)
6. Verga et al. "Replacing Judges with Juries: Evaluating LLM Generations with a Panel of Diverse Models." [arXiv:2404.18796](https://arxiv.org/abs/2404.18796)
7. Yang et al. "Confidence Calibration and Rationalization for LLMs via Multi-Agent Deliberation." [arXiv:2404.09127](https://arxiv.org/abs/2404.09127)
8. Lifshitz et al. "Multi-Agent Verification: Scaling Test-Time Compute with Multiple Verifiers." [arXiv:2502.20379](https://arxiv.org/abs/2502.20379)
9. Cemri et al. "Why Do Multi-Agent LLM Systems Fail?" [arXiv:2503.13657](https://arxiv.org/abs/2503.13657)
10. Wang et al. "Silence is Not Consensus: Disrupting Agreement Bias via Catfish Agent." [arXiv:2505.21503](https://arxiv.org/abs/2505.21503)
11. Pitre et al. "CONSENSAGENT: Towards Efficient and Effective Consensus in Multi-Agent LLM Interactions." ACL 2025 Findings. [ACL Anthology](https://aclanthology.org/2025.findings-acl.1141/)
12. Ning et al. "MAD-Fact: A Multi-Agent Debate Framework for Long-Form Factuality Evaluation." [arXiv:2510.22967](https://arxiv.org/abs/2510.22967)
13. Lu & Wang. "KARMA: Leveraging Multi-Agent LLMs for Automated Knowledge Graph Enrichment." NeurIPS 2025. [arXiv:2502.06472](https://arxiv.org/abs/2502.06472)
14. CortexDebate. "Debating Sparsely and Equally for Multi-Agent Debate." ACL 2025 Findings. [arXiv:2507.03928](https://arxiv.org/abs/2507.03928)
