---
title: "AI/LLM Knowledge Consolidation with Factual Fidelity: Patterns, Techniques, and Implementation"
description: "Comprehensive research on patterns for using AI/LLMs to consolidate knowledge from multiple sources into a single distilled output while maintaining factual fidelity. Covers consolidation architectures, atomic fact decomposition, factuality verification, failure modes, framework implementations, scope-aware consolidation, evaluation metrics, consensus and voting mechanisms, production implementations at scale, incremental consolidation, cost-fidelity tradeoff curves, and recomposition patterns."
createdAt: 2026-03-21
updatedAt: 2026-03-21
subjects:
  - FActScore
  - MiniCheck
  - LLMxMapReduce
  - LangChain
  - LangGraph
  - AutoGen
  - CrewAI
  - Agent Zero
  - NEXUSSUM
  - GraphRAG
  - Perplexity
  - Elicit
  - Consensus
  - NotebookLM
  - Mem0
  - Zep/Graphiti
  - MemGPT
  - MetaFaith
  - FiC
  - WritingPath
  - PlanGen
topics:
  - knowledge consolidation
  - factual fidelity
  - multi-document synthesis
  - claim-level verification
  - information preservation
  - consensus mechanisms
  - multi-agent voting
  - incremental consolidation
  - cost-fidelity tradeoffs
  - production systems
  - recomposition patterns
  - outline-first generation
  - nuance preservation
  - confidence inflation
  - claim-to-document generation
---

# AI/LLM Knowledge Consolidation with Factual Fidelity

## Executive Summary

This report synthesizes findings from 80+ primary sources across twelve research dimensions to answer a single design question: **how should an AI agent consolidate knowledge from multiple sources into a single faithful output?**

The central finding is the **decompose-verify-recompose meta-pattern** — the highest-fidelity consolidation approaches, regardless of architecture, share a common structure: decompose sources into atomic claims, verify and deduplicate at the claim level, resolve conflicts with explicit strategies, recompose into coherent output, then verify the output against the source claim inventory. This pattern unifies the best results from consolidation architectures (Section 1), fact decomposition (Section 3), verification pipelines (Section 4), and evaluation metrics (Section 7).

**Key findings across the twelve dimensions:**

1. **Consolidation Architectures (Section 1):** Five architecture families serve different source profiles. Structured map-reduce (LLMxMapReduce) achieves the highest fidelity for heterogeneous sources; context-aware hierarchical merging is best for long single documents. Architecture selection should be source-type-aware.

2. **Failure Modes (Section 2):** Seven distinct failure modes threaten consolidation fidelity. Multi-document summarization hallucinates up to 75% of content. Unstructured multi-agent networks amplify errors 17.2x. The dominant mitigations are source anchoring (+13.6pp faithfulness) and structured information protocols with confidence scoring.

3. **Atomic Fact Decomposition (Section 3):** FActScore's decompose-then-verify pipeline is foundational but must be inverted for consolidation — decomposing inputs to build from them, not decomposing outputs to check them. Iterative extraction (AFEV) outperforms one-shot decomposition. A hybrid extractive-abstractive approach preserves provenance while enabling cross-source normalization.

4. **Factuality Verification (Section 4):** No single verification method suffices. A tiered pipeline — MiniCheck (GPT-4-level accuracy at 400x lower cost) for first-pass filtering, LLM-as-judge for nuanced cases, SAFE for external corroboration — balances cost and accuracy. MiniCheck resolves ~80% of claims at $0.24 per test set.

5. **Framework Implementations (Section 5):** No mainstream framework ships high-fidelity consolidation by default. LangChain's reduce is "write a concise summary." CrewAI's aggregation is string concatenation. The frameworks that achieve genuine fidelity — LLMxMapReduce (95.5% reference precision) and Agent Zero (5-action decision taxonomy with safety rails) — do so through custom, purpose-built logic.

6. **Scope-Aware Consolidation (Section 6):** QFMDS techniques must be inverted from brevity-optimization to completeness-preservation. GraphRAG's community structure enables natural scope boundaries with 72-83% comprehensiveness win rates. Rubric-scoped extraction and bidirectional coverage checking prevent accidental information drops.

7. **Evaluation Metrics (Section 7):** Traditional metrics (ROUGE, BLEU) correlate only 0.2-0.4 with human judgment and cannot measure factual accuracy. The "lossless within scope" composite — nugget-based claim coverage (AutoNuggetizer, tau=0.783) + LLM-as-judge faithfulness (0.8-0.9 Spearman correlation) + scope adherence — is the right evaluation framework for consolidation.

8. **Consensus & Voting Mechanisms (Section 8):** Voting excels at reasoning tasks (+13.2%) while consensus excels at knowledge tasks (+2.8%). The most dangerous failure mode is **false consensus** — 61-91% of multi-agent failures are caused by silent agreement, not disagreement. A tiered consensus architecture (self-consistency → jury → structured debate → contested register) balances cost and accuracy.

9. **Production Implementations at Scale (Section 9):** Production systems (Perplexity, Elicit, Consensus, NotebookLM) converge on retrieve → extract → constrain → cite. No production system resolves contradictions algorithmically. Source grounding reduces hallucination 3x (40% → 13%), but even the best model achieves only 68.8% factuality (FACTS benchmark). Recall, not hallucination, collapses with scale.

10. **Incremental Consolidation (Section 10):** Six agent memory systems (Mem0, Zep/Graphiti, Agent Zero, MemGPT, LangMem, CrewAI) independently converge on the same pattern: extract → match → decide → apply. A three-layer architecture (hot/warm/cold) inspired by LSM-tree compaction, with drift-triggered rebuilds, provides the best balance of freshness and quality.

11. **Cost-Fidelity Tradeoff Curves (Section 11):** Structured intermediates are the highest-ROI investment (+15-35pp at ~2x token overhead). Decomposition dominates cost at 70% but tolerates cheap models — mixed-model pipelines save 72-77%. Three quality tier presets (Fast/Standard/Thorough) enable cost-appropriate fidelity from $0.02/10 docs to $5/100 docs.

12. **Recomposition Patterns (Section 12):** Turning verified claims back into coherent prose is the least-studied pipeline step and the point where production systems stop short. A four-phase pipeline (Cluster → Outline → Draft → Verify) with outline-first generation (+25% organization, 3.6x human preference), prompt chaining (77/100 wins vs. single-prompt), and MetaFaith-based nuance preservation (61% improvement) addresses the key risks. The full decompose→recompose cycle introduces ~8-13% inherent information loss — a hard floor that source anchoring and low temperature mitigate but cannot eliminate. The FiC pattern (pre-highlighted spans → coherent passage) is the closest existing system to the recomposition problem.

**Bottom line:** A generalizable `/consolidate` skill should implement the decompose-verify-recompose pipeline with source-type-aware architecture selection, structured information protocols at every stage boundary, tiered verification, composite evaluation, tiered consensus for multi-agent convergence, a four-phase recomposition pipeline (Cluster → Outline → Draft → Verify) with nuance preservation, incremental mode with drift-triggered rebuilds, and cost-calibrated quality presets. The ~8-13% inherent information loss in the recomposition step represents a hard floor that pipeline design can approach but not eliminate. No existing framework provides this — the skill fills a genuine gap.

---

## Research Rubric

| # | Dimension | Priority | Covered In |
|---|-----------|----------|------------|
| D1 | Consolidation Architectures | P0 | Section 1 |
| D2 | Atomic Fact Decomposition & Claim-Level Extraction | P0 | Section 3 |
| D3 | Factuality Verification & Grounding | P0 | Section 4 |
| D4 | Information Loss & Hallucination Failure Modes | P0 | Section 2 |
| D5 | Framework Implementations | P0 | Section 5 |
| D6 | Scope-Aware Consolidation | P0 | Section 6 |
| D7 | Evaluation & Quality Metrics | P0 | Section 7 |
| D8 | Consensus & Voting Mechanisms | P0 | Section 8 |
| D9 | Production Implementations at Scale | P0 | Section 9 |
| D10 | Incremental Consolidation | P0 | Section 10 |
| D11 | Cost-Fidelity Tradeoff Curves | P0 | Section 11 |
| D12 | Recomposition Patterns | P0 | Section 12 |

---

## Section 1: Consolidation Architectures

> **Evidence:** [consolidation-architectures.md](evidence/consolidation-architectures.md)

Five distinct architecture families emerge for multi-source LLM consolidation, each with characteristic tradeoffs between fidelity, cost, latency, and context utilization.

### 1.1 Stuff-It-All (Single-Pass)

All source documents fed into a single LLM context window and consolidated in one pass.

**When viable:** Total source material <32K tokens. Beyond this threshold, chunked approaches become architecturally necessary for fidelity — not just for fitting within context limits.

**Critical constraints:**
- **Lost in the Middle:** Performance degrades >30% when relevant information is positioned in the middle of the context ([Liu et al., TACL 2024](https://arxiv.org/abs/2307.03172)). Rotary Position Embedding introduces long-term decay that systematically de-emphasizes middle content.
- **End-of-Output Hallucination:** Faithfulness scores decline toward the end of long outputs. Models allocate ~3x more attention to final generated sentences, correlating with hallucination increases. Effect intensifies beyond ~800 words ([Hallucinate at the Last, 2025](https://arxiv.org/abs/2505.15291)).

**Verdict:** Acceptable only for small, homogeneous source sets. Even within context limits, positional bias introduces systematic information loss.

### 1.2 Map-Reduce

Documents split into chunks, each processed independently (map), results combined (reduce). Two variants:

**Flat Map-Reduce (LangChain-style):** Each chunk summarized independently, summaries combined. Parallelizable but loses inter-chunk dependencies and struggles with cross-document contradictions.

**Structured Map-Reduce (LLMxMapReduce V1):** Addresses flat map-reduce's limitations with a four-component Structured Information Protocol ([LLMxMapReduce, 2024](https://arxiv.org/abs/2410.09342)):
1. **Extracted Information** — key facts relevant to the query
2. **Rationale** — analytical reasoning explaining derivation
3. **Answer** — intermediate response (or "NO INFORMATION")
4. **Confidence Score** — 0-5 scale reflecting completeness/reliability

In-Context Confidence Calibration resolves inter-chunk conflicts: text-supported claims receive 5 points, inferred claims 3-3.5, unsupported claims 0. This enables the reduce stage to resolve contradictions based on evidence strength rather than position.

**Results on InfiniteBench (100K+ tokens):** Llama3-70B + LLMxMapReduce achieved 68.66% average accuracy vs. GPT-4 alone at 57.34% (−11.3pp). Processed sequences up to 1.28M tokens.

**Recommendation:** Structured map-reduce is the default choice for large, heterogeneous source sets. The structured information protocol is the single most impactful fidelity mechanism identified in this research.

### 1.3 Hierarchical Merging

Documents chunked and summarized, then summaries merged pairwise/grouped recursively until a single final output is produced.

**Baseline hierarchical merging** ([BooookScore, ICLR 2024](https://arxiv.org/abs/2310.00785)) produces higher coherence than incremental approaches but at the cost of reduced detail. BooookScore identified eight coherence error types: entity omission (3.7% hierarchical vs. 7.3% incremental per sentence), event omission (2.3% vs. 4.3%), and causal omission (1.2% vs. 2.8%).

**Context-Aware Hierarchical Merging** ([Ou & Lapata, ACL 2025 Findings](https://arxiv.org/abs/2502.00977)) addresses hallucination amplification through three augmentation strategies (Extract, Retrieve, Cite) and two integration methods (Replace, Support):

| Method | Correct Atomic Claims (Manual Eval) |
|--------|-------------------------------------|
| Extract-Support | **72.7%** |
| Baseline HMerge | 59.1% |

AlignScore improvements up to +15.1 points with Cite-Replace on SuperSummary.

**Critical insight:** Input-based faithfulness metrics favor Replace (grounded in source), but reference-based metrics and manual annotation favor Support (comprehensive coverage). This reveals a fundamental tension between groundedness and completeness — both matter for consolidation.

### 1.4 Progressive Refinement

Start with initial summary of first chunk, iteratively update running summary by incorporating each subsequent chunk.

**Key properties:**
- Preserves temporal/sequential context better than map-reduce
- Inherently sequential (no parallelism)
- Primacy bias — older segments gain more emphasis than newer ones
- Quality degrades after 2-3 refinement iterations

**Prompt chaining vs. stepwise refinement:** Separating draft/critique/refine into distinct LLM calls (prompt chaining) significantly outperforms consolidating them into one prompt. Prompt chaining achieved 77/100 wins in GPT-4 evaluation. Stepwise prompts produce "simulated refinement" — models intentionally generate weaker drafts to then "correct" ([Prompt Chaining Study, 2024](https://arxiv.org/abs/2406.00507)).

**Chain of Density (CoD):** 5 iterations of adding 1-3 missing salient entities while maintaining constant length. Produces more abstractive, entity-dense, less lead-biased summaries ([Adams et al., 2023](https://arxiv.org/abs/2309.04269)).

### 1.5 Tree-Structured Merging

Leverages inherent document hierarchy (headings, sections) to construct a tree, then performs bottom-up aggregation with conflict resolution at each level.

**ToM (Tree-oriented MapReduce)** ([EMNLP 2025](https://arxiv.org/abs/2511.00489)) constructs a DocTree via Hierarchical Semantic Parsing: segment → parse → embed → cluster (Leiden algorithm) → summarize → recurse. Map phase generates `{key_info, rationale, answer, confidence}`. Reduce phase aggregates sibling results at parent, conflicts resolved via confidence scores.

**Performance (GPT-4o):**

| Task | ToM | LongAgent | RAG |
|------|-----|-----------|-----|
| Inf.QA (192K tokens) | **41.17%** | 38.00% | 26.03% |
| Inf.MC (184K tokens) | **85.0%** | 72.0% | 65.0% |

Removing confidence measures: −6.9%. Removing bottom-up aggregation: −2.0% to −6.0%.

### Architecture Comparison Matrix

| Architecture | Fidelity | Cost | Latency | Cross-Doc Synthesis | Best Source Types |
|-------------|----------|------|---------|-------------------|-------------------|
| Stuff-it-all | Medium | Low | Low | Poor (positional bias) | Small, homogeneous (<32K) |
| Flat Map-Reduce | Low-Medium | Medium | Low | Poor (no cross-chunk) | Any, parallel-friendly |
| Structured Map-Reduce | **High** | Medium-High | Medium | Good (confidence calibration) | Large, heterogeneous |
| Hierarchical Merging | Low→Medium-High | High | High | Medium | Very long documents |
| Progressive Refinement | Medium | Medium | High | Medium (order-dependent) | Sequential, chronological |
| Tree-Structured | **High** | High | Medium | High (structural conflict resolution) | Well-structured documents |

### Source-Type Routing

- **Structured agent outputs (JSON, structured reports):** Use Structured Map-Reduce. LLMxMapReduce's protocol naturally maps to structured intermediates.
- **Unstructured articles/books:** Use Context-Aware Hierarchical Merging. Handles narrative coherence.
- **Mixed source types:** Use NexusSum-style preprocessing to normalize all sources into a common intermediate format, then Structured Map-Reduce.
- **Key principle:** Source-type-specific preprocessing into a common intermediate format before any architecture yields significant gains.

---

## Section 2: Information Loss & Hallucination Failure Modes

> **Evidence:** [failure-modes.md](evidence/failure-modes.md)

Seven distinct failure modes threaten consolidation fidelity. Understanding these is critical for building a defensive `/consolidate` skill.

### FM1: Hallucination Amplification

Each stage of recursive processing can introduce hallucinations that subsequent stages treat as factual, compounding errors.

**Empirical rates:**
- Multi-document summarization: up to 75% of content hallucinated ([From Single to Multi, NAACL 2025](https://arxiv.org/abs/2410.13961))
- Book-length summarization: 2.03% (Claude-3-Opus) to 10.52% (GPT-3.5-Turbo) unfaithful claims ([FABLES, 2024](https://arxiv.org/abs/2404.01261))
- Non-existent topic generation: GPT-3.5-Turbo generates summaries 79.45% of the time for topics that don't exist in source documents

**Most susceptible:** Baseline hierarchical merging (no context augmentation), deep recursive pipelines.

**Primary mitigation:** Context-aware augmentation (Extract-Support achieves 72.7% vs. 59.1% correct claims, a +13.6pp improvement).

### FM2: Information Omission

Salient information from source documents is dropped and never appears in the final output.

**Empirical rates:**
- Key events missing: 33.3%-65.4% of book summaries
- Important character details omitted: 16.7%-38.5%
- Crucial characters entirely absent: up to 23.1%
- Entity omission: 3.7% (hierarchical) to 7.3% (incremental) per sentence

**Most susceptible:** Hierarchical merging (detail lost at each merge level), stuff-it-all (middle content ignored).

### FM3: Semantic Drift

Meaning gradually shifts across consolidation stages as intermediate representations diverge from source semantics. Recursive summarization compounds small deviations. "Knowledge collapse" narrows semantic diversity in recursive processing.

**Most susceptible:** Deep hierarchical merging (more levels = more drift), progressive refinement (later sources processed against already-drifted context).

### FM4: Detail Flattening

Specific, nuanced information replaced by generic, surface-level statements during compression. Pedantic/generic errors affect 28-79% of MDS insights. Weaker models produce overly vague statements at 38.5% rate.

### FM5: False Synthesis

Model generates plausible-sounding connections, correlations, or conclusions not present in any source document. Models "flip report conclusions" based on input ordering alone. GPT-4 achieves R-squared of 0.808 for true synthesis; specialized models score below 0.25 ([Do MDS Models Synthesize?, TACL 2024](https://arxiv.org/abs/2301.13844)).

### FM6: Positional Bias (Primacy/Recency)

Three manifestations:
1. **Lost in the Middle:** >30% performance degradation for middle-positioned content
2. **Hallucinate at the Last:** Faithfulness drops below 0.75 in final output sections; models allocate 3x more attention to final sentences
3. **Recency bias in book summarization:** Long-context models over-emphasize endings

**Mitigation:** Generate shorter segments independently and merge (BooookScore approach achieves sensitivity near zero).

### FM7: Duplication and Redundancy

Same information appears multiple times — 1.2% (hierarchical) to 2.1% (incremental) per sentence.

### Failure Mode x Architecture Susceptibility Matrix

| Failure Mode | Stuff-All | Flat MR | Structured MR | Hier. Merge | Context-Aware HM | Refine | Tree MR |
|-------------|-----------|---------|---------------|-------------|-------------------|--------|---------|
| Hallucination Amplification | Low | Medium | Low | **High** | Medium | Medium | Low |
| Information Omission | **High** | Medium | Low | **High** | Medium | Medium | Low |
| Semantic Drift | Low | Low | Low | **High** | Medium | Medium | Low |
| Detail Flattening | Medium | Medium | Low | **High** | Medium | Medium | Low |
| False Synthesis | Medium | **High** | Medium | Medium | Medium | **High** | Low |
| Positional Bias | **High** | Low | Low | Medium | Medium | **High** | Low |
| Duplication | Low | Medium | Low | Low | Low | **High** | Low |

**Design implication:** Structured Map-Reduce and Tree-Structured Merging show consistently low susceptibility across all failure modes. These should be the default architectures for a `/consolidate` skill, with other architectures available as fallbacks for specific source types.

---

## Section 3: Atomic Fact Decomposition & Claim-Level Extraction

> **Evidence:** [fact-decomposition.md](evidence/fact-decomposition.md)

Atomic fact decomposition converts source material into a normalized claim inventory — the foundation of the decompose-verify-recompose pattern.

### 3.1 What Constitutes an "Atomic Fact"

An atomic fact is a minimal, independent piece of information that can be individually verified as true or false. FActScore ([Min et al., EMNLP 2023](https://arxiv.org/abs/2305.14251)) operationalizes this by decomposing sentences into claims where each contains exactly one verifiable assertion.

Atomic-SNLI ([arXiv 2025](https://arxiv.org/abs/2601.06528)) quantifies the distribution: 89.2% of hypotheses contain only a single atomic fact, while only 0.3% contain 4 or more. Most natural sentences are already near-atomic, but multi-fact sentences require decomposition for reliable verification.

### 3.2 The FActScore Pipeline — Inverted for Consolidation

FActScore's four stages (Decompose → Retrieve → Verify → Score) were designed for evaluation. For consolidation, the pipeline inverts: decompose the *inputs* to build from them, not decompose the *output* to check it.

**Inverted pipeline for consolidation:**

```
Sources → Decompose each → Claim inventory
  ↓
Deduplicate semantically equivalent claims
  ↓
Detect conflicting claims
  ↓
Resolve conflicts (weighted by source trust, recency, consensus)
  ↓
Recompose into coherent output
  ↓
Verify output against claim inventory
```

FActScore achieves <2% error vs. human annotation, and 0.99 Pearson correlation between automated and human verification.

### 3.3 Extractive vs. Abstractive Decomposition

This is the central tradeoff for consolidation fidelity.

| Dimension | Extractive (JEDI) | Abstractive (FActScore, AFEV) |
|-----------|-------------------|-------------------------------|
| Source fidelity | High — exact wording | Medium — may drift |
| Hallucination risk | None | Present |
| Cross-source normalization | Poor | Good |
| Deduplication support | Harder | Easier |
| Provenance tracking | Trivial (span offsets) | Requires metadata |
| Computational cost | Lower (encoder-only) | Higher (generative) |

**JEDI performance:** 65.6% accuracy on ANLI (vs. 67.7% for generative FGLR), but 76.9% on adversarial HANS robustness test — extractive approaches are more robust despite slightly lower in-distribution accuracy ([JEDI, EMNLP 2025](https://arxiv.org/abs/2509.18901)).

**Recommendation:** Use a **hybrid approach** — extractive decomposition to preserve source fidelity and provenance, with abstractive normalization solely for deduplication matching. Maintain both original span reference and normalized form per claim: `{claim_text, source_id, source_span, normalized_form}`.

### 3.4 Iterative Extraction (AFEV)

Static one-shot decomposition fails on complex, multi-hop claims. AFEV ([Expert Systems with Applications, 2025](https://arxiv.org/abs/2506.07446)) introduces an iterative extract-verify loop where each extraction is conditioned on previously verified facts and their rationales.

**Mechanism:** At iteration *t*, `F_t = Extractor(C, F_1:t-1, y_1:t-1, r_1:t-1)` where C = original claim, F = prior facts, y = verification labels, r = rationales. Rationale feedback reveals implicit entity relationships that refine subsequent decompositions.

**Results:** 78.74 vs. 77.04 accuracy (one-shot) on HOVER. AFEV achieves SOTA on 5 benchmarks (LIAR-PLUS: 83.12 F1, HOVER: 78.76 F1). Efficiency: 0.94 hours for full HOVER test set.

**For consolidation:** Directly applicable to source decomposition. When processing long documents, each fact extraction benefits from context established by previously verified facts, producing more coherent and complete claim inventories.

### 3.5 Claim Deduplication Pipeline

Detecting semantically equivalent claims across sources requires going beyond lexical matching:

1. Decompose all sources into atomic claims (with provenance metadata)
2. Embed each claim using sentence transformer (e.g., all-MiniLM-L6-v2)
3. Cluster by cosine similarity (threshold ~0.85-0.92)
4. Within each cluster: verify semantic equivalence via NLI entailment check
5. Select representative claim, retain all source attributions
6. Flag near-duplicates with subtle semantic differences for conflict resolution

Fine-tuned transformers achieve up to 28% improvement in recall vs. traditional methods (minhash, simhash). Semantic deduplication at scale is supported by libraries like [SemHash](https://github.com/MinishLab/semhash).

### 3.6 Source-Type Adaptation

| Dimension | Structured Agent Outputs | Unstructured Articles/Books |
|-----------|------------------------|---------------------------|
| Claim density | High — agents produce claim-rich output | Variable — narrative buries claims in context |
| Decomposition difficulty | Lower — statements tend toward atomic | Higher — requires disentangling from rhetoric |
| Trust level | Higher — generated from controlled prompts | Variable — requires verification |
| Provenance | Known (agent ID, prompt, timestamp) | May be ambiguous (author, publication, date) |
| Recommended approach | Light decomposition + direct extraction | Full iterative decomposition (AFEV-style) |

---

## Section 4: Factuality Verification & Grounding

> **Evidence:** [factuality-verification.md](evidence/factuality-verification.md)

No single verification method handles all consolidation needs. The research converges on a tiered pipeline.

### 4.1 NLI-Based Verification

Natural Language Inference classifies premise-hypothesis pairs as Entail/Neutral/Contradict. For verification: premise = source document, hypothesis = claim from consolidated output.

**Key models:**
- **DeBERTa-v3-large-MNLI:** Trained on 433k MultiNLI pairs, disentangled attention. Available on [HuggingFace](https://huggingface.co/potsawee/deberta-v3-large-mnli).
- **AlignScore** ([ACL 2023](https://arxiv.org/abs/2305.16739)): Unified alignment function trained on 4.7M examples across 7 tasks. 355M params. Matches GPT-4 on 22 evaluation datasets.

**Critical limitation:** Research shows 84% of factually supporting pairs do NOT map to NLI entailment, and 63% of factually undermining pairs do NOT constitute NLI contradiction ([Kavtaradze, 2024](https://arxiv.org/abs/2406.16842)). NLI captures a narrower relationship than "factual support." NLI alone is insufficient.

### 4.2 MiniCheck: The Cost-Effective First Pass

MiniCheck ([Tang et al., EMNLP 2024](https://arxiv.org/abs/2404.10774)) achieves GPT-4-level fact-checking at 400x lower cost.

- **Architecture:** Flan-T5-Large (770M params) fine-tuned on 14,395 synthetically generated instances
- **Performance:** 74.7% balanced accuracy (vs. GPT-4's 75.3%) on LLM-AggreFact benchmark (13,128 instances across 10 datasets)
- **Cost:** ~$0.24 vs. ~$107 for GPT-4 on the same test set
- **Process:** Binary classification — `Does document D support claim c?` Takes maximum score across multiple documents per sentence

**For consolidation:** MiniCheck is the optimal first-pass verification engine. Its binary output (supported/unsupported) integrates cleanly with claim-level tracking. The multi-document max-score approach handles claims that synthesize across sources.

### 4.3 LLM-as-Judge Verification

Using a capable LLM (GPT-4 class) as a factual consistency judge.

**Effective strategies:**
- **Chain-of-thought:** Explain reasoning before verdict; improves quality and enables debugging
- **Few-shot:** Including examples increases GPT-4 consistency from 65.0% to 77.5%
- **Binary evaluation:** "Supported"/"Not supported" more reliable than numeric scoring
- **Meta-judging:** Three-stage pipeline (judge → meta-evaluate → select trustworthy outputs) yields 15.55% precision increase

**Unique advantage for consolidation:** LLM-as-judge can verify both factual accuracy AND information completeness — unlike NLI/MiniCheck which only check what's present. For consolidation, completeness checking (are important facts from sources missing in output?) is critical.

**Trust or Escalate** ([ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/file/08dabd5345b37fffcbe335bd578b15a0-Paper-Conference.pdf)): Framework where judges express uncertainty and escalate difficult cases, improving reliability by routing ambiguous cases upward.

### 4.4 SAFE: Search-Augmented Verification

SAFE ([Wei et al., NeurIPS 2024](https://arxiv.org/abs/2403.18802)) from Google DeepMind uses an LLM agent that iteratively queries Google Search to verify facts.

- Agrees with human annotators 72% of the time; on disagreements, SAFE wins 76%
- 20x cheaper than human annotators
- Verifies against the open web, not just source documents — suitable for checking whether consolidated claims are factually accurate in an absolute sense

### 4.5 Source Attribution & Citation Tracking

Maintaining provenance through consolidation requires tracking which source supports each claim.

- **ALCE benchmark** ([Gao et al., EMNLP 2023](https://arxiv.org/abs/2305.14627)): Even the best models lack complete citation support 50% of the time
- **SourceCheckup** ([Nature Communications, 2025](https://www.nature.com/articles/s41467-025-58551-6)): 50-90% of LLM responses are not fully supported by their cited sources
- **Citation-Aware RAG** ([Tensorlake](https://www.tensorlake.ai/blog/rag-citations)): Demonstrates an unbroken provenance chain from source → parsed elements → anchored chunks → retrieved context → LLM output → resolved citations

**Practical patterns:**
1. **Claim-Source Index:** Assign each claim a `(source_id, location)` tuple. Carry tuples through consolidation. Final output includes attribution per statement.
2. **Dual Representation:** Store both original source span (extractive) and normalized claim (abstractive). Use normalized for dedup/merge; preserve original for attribution.
3. **Post-hoc Attribution Verification:** After generating output, verify each attribution using MiniCheck. Flag claims where the cited source doesn't actually support the statement.

### 4.6 The Tiered Verification Pipeline

**Recommended architecture:**

```
Consolidated output
  │
  ├─ Step 1: Decompose output into atomic claims
  │
  ├─ Step 2: MiniCheck first pass (fast, cheap, 74.7% accuracy)
  │   └─ SUPPORTED → accept; UNSUPPORTED → escalate
  │
  ├─ Step 3: LLM-as-judge with CoT for escalated claims
  │   └─ SUPPORTED → accept; CONTRADICTED → flag; UNCERTAIN → escalate
  │
  ├─ Step 4: Completeness check (LLM-as-judge)
  │   └─ Compare source claim inventory against output claims
  │   └─ Identify important source claims not present in output
  │
  ├─ Step 5 (optional): SAFE web search for low-trust source claims
  │
  └─ Output: Verified text with confidence scores and attributions
```

**Cost profile:** ~80% of claims resolved in Step 2 (MiniCheck). Steps 3-5 handle the remaining ~20% at higher cost but higher accuracy.

### 4.7 Trust-Tier-Aware Verification

| Source Trust Tier | Examples | Verification Strategy |
|-------------------|----------|----------------------|
| **High** | Own agent outputs, controlled experiments | NLI/MiniCheck for contradiction checking; focus on internal consistency |
| **Medium** | Secondary articles, documentation, books | Standard tiered pipeline; cross-reference across medium-trust sources |
| **Low** | Web articles, user-generated content | Require corroboration from >=1 other source; SAFE web search; higher escalation rate |

---

## Section 5: Framework Implementations

> **Evidence:** [framework-implementations.md](evidence/framework-implementations.md)

The critical finding: **no mainstream framework ships a high-fidelity consolidation step by default.** Architecture, not model capability, determines consolidation quality.

### 5.1 LangChain / LangGraph: Recursive Collapse

Both generations share the same core algorithm: **recursive collapse until token budget is met, then final combine.**

```python
while num_tokens > token_max:
    groups = split_list_of_docs(docs, length_func, token_max)
    docs = [collapse_via_llm(group) for group in groups]
    num_tokens = length_func(docs)
```

**Default prompts:** Map and reduce both use `"Write a concise summary"` — no structured output contract, no conflict resolution, no confidence scoring, no fidelity verification.

LangGraph's innovation is typed state reducers with `operator.add` for fan-in and `Send()` for runtime-determined parallelism. Custom reducers (e.g., deduplication) are supported but not provided by default.

### 5.2 LLMxMapReduce: The Gold Standard

The most sophisticated consolidation implementation found. Two versions:

**V1 (Oct 2024):** Structured Information Protocol with In-Context Confidence Calibration. Removing confidence calibration reduced accuracy from 99.56 to 96.00. Removing the structured protocol reduced comprehension from 41.23 to 25.93.

**V2 (Apr 2025):** Entropy-Driven Convolutional Test-Time Scaling for long-to-long generation. 7 convolution layers with kernel width 3, entropy scoring, top-k pruning, best-of-N selection.

| Metric | LLMxMapReduce V2 | AutoSurvey | Vanilla |
|---|---|---|---|
| Reference Precision | **95.50%** | 50.12% | 25.48% |
| Reference Recall | **95.80%** | 51.73% | 26.46% |
| Content Density | **474.90** | — | 78.75 |
| Human Win Rate vs AutoSurvey | **75%** | — | — |

### 5.3 CrewAI: The Cautionary Example

CrewAI's aggregation is **pure string concatenation**:

```python
DIVIDERS: Final[str] = "\n\n----------\n\n"
def aggregate_raw_outputs_from_task_outputs(task_outputs):
    return DIVIDERS.join(output.raw for output in task_outputs)
```

No LLM summarization at the aggregation layer. Pydantic structured outputs are supported per-task but **flattened back to `.raw` text** at the aggregation boundary. This is a cautionary pattern — structured outputs must flow through as structured data, not serialized text.

### 5.4 AutoGen: Summary Carryover

Consolidates through conversation summaries with three methods: `"last_msg"` (default — just the last message), `"reflection_with_llm"` (LLM summarizes chat history with `"Summarize the takeaway"`), or a custom callable. Sequential chats accumulate all prior summaries as carryover. GroupChat has no automatic consolidation.

### 5.5 Agent Zero: The Safety-First Approach

The most sophisticated per-item consolidation system. Uses a FAISS vector database with an LLM-driven decision pipeline.

**Five-action taxonomy:**
| Action | Behavior | Safety Gate |
|---|---|---|
| SKIP | Insert new memory unchanged | None |
| KEEP_SEPARATE | Insert alongside existing | None |
| MERGE | Delete originals, insert consolidated | Tracks `consolidated_from` IDs |
| REPLACE | Delete old, insert new version | **Requires >0.9 similarity** or auto-downgrades to KEEP_SEPARATE |
| UPDATE | Delete old, insert updated versions | Validates existence before update |

The **REPLACE safety rail** (0.9 similarity threshold with automatic downgrade) is the key design pattern — the system is biased toward keeping more data rather than risking information loss through incorrect consolidation. This is the "first, do no harm" approach.

### 5.6 NexusSum: Progressive Compression with Rollback

Three-stage sequential pipeline (Preprocessor → Summarizer → Compressor with max 10 iterations). Key design: when compression crosses below the target word count, the system returns the **previous** iteration's output, preventing over-compression.

Human evaluation: 4.0/5.0 on factuality (vs. 3.5 for zero-shot). Up to 30% improvement in BERTScore (F1) for narrative content.

### 5.7 Error Amplification Data

A December 2025 study from Google DeepMind/MIT ([arXiv:2512.08296](https://arxiv.org/abs/2512.08296)) quantifies the stakes:

| Architecture | Error Amplification Factor |
|---|---|
| Unstructured multi-agent network | **17.2x** |
| Centralized coordination | 4.4x |
| Single agent baseline | 1.0x |

Gains plateau beyond 4 agents. Explicit I/O contracts at every boundary are essential.

### Cross-Framework Comparison

| Framework | LLM in Reduce? | Structured Output? | Fidelity Mechanism |
|---|---|---|---|
| LangChain/LangGraph | Yes (generic prompt) | No (free text) | None |
| LLMxMapReduce V1 | Yes (purpose-built) | Yes (4-field format) | Confidence calibration |
| LLMxMapReduce V2 | Yes (multi-layer) | Yes (skeleton + digests) | Entropy scoring + top-k |
| CrewAI | **No** | Pydantic (flattened) | None |
| AutoGen | Optional | No | None |
| Agent Zero | Yes (structured JSON) | Yes (JSON with metadata) | Similarity threshold + safety rails |
| NexusSum | Yes (per-stage) | Scene headers | Iteration rollback |
| OpenAI Agents SDK | Yes (implicit) | Pydantic via `output_type` | None |
| Anthropic Orchestrator | Yes (implicit) | XML-structured contracts | Citation agent (post-hoc) |

---

## Section 6: Scope-Aware Consolidation

> **Evidence:** [scope-aware-consolidation.md](evidence/scope-aware-consolidation.md)

Scope-aware consolidation preserves completeness within a defined goal while filtering noise.

### 6.1 QFMDS Adapted for Completeness

Query-Focused Multi-Document Summarization is the closest research area, but with a critical inversion: QFMDS optimizes for **brevity within scope** (shortest summary that answers the query); consolidation optimizes for **completeness within scope** (preserve all relevant information). QFMDS relevance filtering is useful, but the compression objective must be replaced with a preservation objective.

### 6.2 GraphRAG Community Structure

GraphRAG ([Microsoft Research, 2024](https://arxiv.org/html/2404.16130v2)) uses hierarchical graph communities as natural scope boundaries. The Leiden algorithm's community detection creates topic clusters. Information is relevant if it belongs to communities matching the consolidation scope.

**Results:** Intermediate community levels (C1-C2) achieved 72-83% comprehensiveness win rate over vector RAG and 97% fewer tokens than full-text approaches. This balance of comprehensiveness and efficiency makes it directly applicable to scope filtering.

### 6.3 Goal-Directed Extraction Paradigms

Two paradigms for expressing consolidation scope:

1. **Query-as-scope:** Goal expressed as question(s). Information is in-scope if it helps answer the questions. The QFMDS paradigm adapted for completeness.

2. **Rubric-as-scope:** Goal expressed as a structured rubric with dimensions and criteria. Information is in-scope if it satisfies any rubric dimension. "Nugget-as-rubric" paradigms ([arXiv, 2025](https://arxiv.org/html/2510.14660v1)) treat atomic information points as structured evaluation criteria.

**Recommendation:** Express consolidation scope as a rubric with dimensions, not just a topic. This enables automated evaluation via nugget classification and makes scope boundaries explicit.

### 6.4 Detecting Accidental Scope-Filtering Drops

A consolidation system must detect when scope-filtering has accidentally discarded relevant information:

1. **Bidirectional coverage checking:** Generate questions from both source documents and consolidated output (QuestEval pattern). If a source-derived question can't be answered from the consolidation, information may have been dropped.

2. **Nugget recall auditing:** Extract atomic facts from sources, classify as in-scope/out-of-scope using the rubric, verify all in-scope nuggets appear in the consolidation (AutoNuggetizer pattern).

3. **Multi-pass extraction:** Run extraction multiple times with different prompts/framings. Information that consistently appears across passes is likely relevant; information appearing in some but not others warrants review.

---

## Section 7: Evaluation & Quality Metrics

> **Evidence:** [evaluation-metrics.md](evidence/evaluation-metrics.md)

### 7.1 Why Traditional Metrics Fail

ROUGE and BLEU are fundamentally misaligned with consolidation goals:

| Limitation | Impact on Consolidation |
|-----------|------------------------|
| Penalize paraphrasing | Consolidation inherently restructures and rephrases |
| Require reference text | No "reference consolidation" exists for multi-document inputs |
| ROUGE-2 correlates only 0.2-0.4 with human judgment | Too unreliable for quality decisions |
| Cannot measure factual accuracy | A hallucinated summary can score high on ROUGE |
| BLEU yields scores <<0.01 for summarization | Essentially unusable |

A comparative study on patent documents found "very weak or non-significant correlation" between SummaC/ROUGE/BERTScore and human evaluations in domain-specific contexts ([Singh et al., 2024](https://arxiv.org/html/2407.00747v1)).

Semantic similarity metrics (BERTScore, MoverScore) improve on ROUGE — MoverScore achieves 0.72 correlation with human ratings vs. 0.61-0.63 for ROUGE ([Zhao et al., 2019](https://ar5iv.labs.arxiv.org/html/1909.02622)) — but still cannot measure factual fidelity or completeness.

### 7.2 Factual Consistency Metrics

Three families address whether generated text is faithful to the source:

**Entailment-Based:**
- **FactCC** ([Kryscinski et al., 2020](https://arxiv.org/abs/1910.12840)): Weakly-supervised NLI with span-level evidence
- **DAE** ([Goyal & Durrett, 2020](https://github.com/tagoyal/dae-factuality)): Dependency arc entailment, localizes errors to specific relations
- **SummaC** ([Laban et al., 2022](https://github.com/tingofurro/summac)): Sentence-level NLI matrix with max entailment (SummaC-ZS) or convolutional aggregation (SummaC-Conv)

**QA-Based:**
- **QuestEval:** Bidirectional (precision + recall) via question generation from both source and summary
- **QAFactEval** ([Fabbri et al., 2022](https://aclanthology.org/2022.naacl-main.187/)): Optimized QG, 15% improvement over prior QA metrics

**LLM-Based:**
- **G-Eval** ([Liu et al., 2023](https://www.confident-ai.com/blog/g-eval-the-definitive-guide)): CoT-prompted LLM scoring, Spearman rho=0.514
- **UniEval** ([Zhong et al., 2022](https://arxiv.org/abs/2210.07197)): Boolean QA over dimensions, 23% higher correlation than prior unified evaluators
- **GPT-4/comparable as judge:** 0.8-0.9 Spearman correlation on accuracy/coverage dimensions

### 7.3 Claim Coverage: The Critical Metric for Consolidation

Claim coverage measures what percentage of source information survives — the **recall** dimension that faithfulness metrics miss.

**AutoNuggetizer** ([Pradeep et al., 2024](https://arxiv.org/html/2411.09607v1)) from the TREC 2024 RAG Track provides the most directly applicable framework:

1. **Nugget extraction:** GPT-4o extracts up to 30 atomic information units per topic from relevant documents
2. **Importance classification:** Each nugget labeled "vital" or "okay"
3. **Nugget assignment:** Each nugget rated as "support" (1.0), "partial_support" (0.5), or "not_support" (0)
4. **Scoring:** Six metrics combining strict/soft scoring with vital/all/weighted nugget subsets

**Run-level correlation:** Kendall's tau = 0.783 with human assessment.

**FActScore adaptation:** Decompose *source* documents into atomic facts and compute what percentage appear in the *consolidation* (inverted from the original evaluation-only usage).

### 7.4 The "Lossless Within Scope" Composite Metric

No single metric captures consolidation quality. The composite:

| Dimension | What it measures | Best automated approach | Type |
|-----------|-----------------|----------------------|------|
| **Faithfulness** | No hallucinated claims | LLM-as-judge or SummaC | Precision |
| **Completeness** | All in-scope claims preserved | Nugget recall (AutoNuggetizer) | Recall |
| **Scope adherence** | No out-of-scope content | LLM-as-judge with rubric | Precision |
| **Coherence** | Logical structure and flow | UniEval or LLM-as-judge | Quality |
| **Non-redundancy** | No unnecessary repetition | Embedding overlap detection | Quality |

A consolidation is "lossless within scope" when:
- Faithfulness >= threshold (no introduced errors)
- Completeness >= threshold (all in-scope nuggets present)
- Scope adherence >= threshold (minimal out-of-scope content)

### 7.5 Practical 3-Tier Evaluation Pipeline

**Tier 1 — Every Consolidation Run (Automated):**
- Nugget extraction from sources → in-scope nugget set
- Nugget assignment against consolidation output → claim coverage score
- LLM judge for faithfulness → faithfulness score
- LLM judge for scope adherence → scope score

**Tier 2 — Periodic Validation (Human + Automated):**
- Human review of 10-20 random consolidations per cycle
- Annotate on 5 dimensions: faithfulness, completeness, scope adherence, coherence, overall quality
- Calibrate automated scores against human scores

**Tier 3 — Regression Testing (Golden Set):**
- Curated source documents + known-good consolidations
- Run on each model/prompt change
- Alert on score degradation beyond threshold

**Cost management:** Nugget extraction is the expensive step. Cache nuggets per source document and reuse across consolidation runs.

---

## Section 8: Consensus & Voting Mechanisms

> **Evidence:** [consensus-voting.md](evidence/consensus-voting.md)

When multiple agents or verification passes produce conflicting claims, the consolidation system must decide how to converge. Seven consensus mechanisms span a cost-accuracy spectrum, and the choice between them depends on whether the task involves knowledge claims or reasoning.

### 8.1 Voting vs. Consensus Protocols

[Kaesberg et al. (ACL 2025)](https://arxiv.org/abs/2502.19130) tested four voting and three consensus protocols across six tasks. The core finding: **voting outperforms consensus by 13.2% on reasoning tasks**, while **consensus outperforms voting by 2.8% on knowledge tasks**. Since `/consolidate` primarily handles knowledge claims, consensus-style mechanisms should dominate, with voting-based fallbacks for contested claims that require reasoning to resolve.

A critical warning: Approval Voting collapsed in 59% of cases because agents "like to agree with each other" and voted for all answers. Permissive voting mechanisms are dangerous in consolidation.

### 8.2 Weighted and Ranked Voting

Standard majority voting is suboptimal for heterogeneous agent ensembles. [Ai et al. (MIT/Harvard, 2025)](https://arxiv.org/abs/2510.01499) proved that Optimal Weight (OW) — inverse sigmoid weighting based on individual agent accuracies — is Bayesian-optimal and outperformed majority voting in 97.92% of tested combinations. Inverse Surprising Popularity (ISP) achieves +5.35pp without ground truth labels.

**Theoretical constraint:** For homogeneous agents (same model), majority voting is optimal. Aggregation benefits *require* heterogeneity. If using the same model for all verification passes, use self-consistency instead of multi-agent voting.

[Ranked voting (MRRV)](https://arxiv.org/abs/2505.10772) yields +3.3-5.3% over standard majority voting, with largest gains on ambiguous tasks (+10.8-12.5%).

### 8.3 LLM-as-Jury (PoLL Pattern)

[Verga et al. (Cohere, 2024)](https://arxiv.org/abs/2404.18796) formalized the jury pattern: an ensemble of 3 heterogeneous LLMs independently evaluate, then aggregate. PoLL achieved +0.065-0.136 Cohen's kappa improvement over a single GPT-4 judge across benchmarks, at 7-8x lower cost. Model diversity is the mechanism, not model size — individual judges show intra-model bias (std dev 6.1) that PoLL mitigates through heterogeneous composition (std dev 2.2).

[BoN-MAV](https://arxiv.org/abs/2502.20379) demonstrated weak-to-strong generalization: weaker verifiers (Gemini Flash, GPT-4o-mini) improved stronger generators (GPT-4o: 76.3% vs 68.3% pass@1).

### 8.4 Self-Consistency as Cheapest Effective Mechanism

[Self-consistency voting (Wang et al., ICLR 2023)](https://arxiv.org/abs/2203.11171) — sampling diverse reasoning paths from a single model and applying majority voting — achieves +6-18% accuracy gains across benchmarks. It is training-free, works with any LLM, and maps directly to claim verification: sample N reasoning paths per claim, vote, use the margin as a confidence proxy.

Self-consistency is the **cheapest effective mechanism** — single model, N samples, majority vote. Use as the first pass before escalating contested claims to multi-agent debate.

### 8.5 Structured Debate for Contested Claims

For claims that survive initial voting without resolution, structured debate provides the highest accuracy gains:

- **Society of Minds** ([Du et al., ICML 2024](https://arxiv.org/abs/2305.14325)): 3 agents × 2 rounds, significantly reduces hallucinations
- **MAD-Fact** ([Ning et al., 2025](https://arxiv.org/abs/2510.22967)): Role-based debate with dynamic retrieval — F1 = 0.88, 80% win rate over single-agent baselines
- **Catfish Agent** ([Wang et al., 2025](https://arxiv.org/abs/2505.21503)): +12.73pp accuracy by injecting structured dissent to combat false consensus

### 8.6 False Consensus: The Dominant Failure Mode

**61-91% of multi-agent failures** are caused by silent agreement, not by disagreement ([Wang et al., 2025](https://arxiv.org/abs/2505.21503)). Agents converge without substantive discussion, especially on complex or ambiguous cases. [CONSENSAGENT](https://aclanthology.org/2025.findings-acl.1141/) confirmed that sycophancy inflates costs while degrading accuracy.

The absence of disagreement is a warning sign, not evidence of correctness. A `/consolidate` skill must actively probe for silent agreement rather than treating convergence as validation.

### 8.7 When Consensus Should Fail Gracefully

Six heuristics for stopping consensus attempts and surfacing disagreement:

1. **Round budget exhaustion:** After 2 rounds with no convergence, surface the split
2. **Vote margin threshold:** Top-2 answers within epsilon → flag as contested
3. **Confidence bimodality:** Scores cluster at extremes → genuinely ambiguous evidence
4. **Tone escalation without resolution:** Even "strong" Catfish challenges fail to shift positions
5. **Cross-domain expert persistence:** Different domain experts consistently disagree → genuine knowledge boundary
6. **Controlled disagreement optimum:** Moderate disagreement achieves best performance; maximal adversarial stances hurt

### Tiered Consensus Architecture for /consolidate

| Tier | Mechanism | Cost | When |
|------|-----------|------|------|
| **1: Self-Consistency** | 1 model × N=5 samples, majority vote | Low | All claims (first pass) |
| **2: Jury Verification** | 3 heterogeneous models, PoLL pattern | Medium | Claims with <80% majority |
| **3: Structured Debate** | Role-based + devil's advocate, 2 rounds | High | Claims split after Tier 2 |
| **4: Contested Register** | Record both positions with evidence | None | After Tier 3 without consensus |

---

## Section 9: Production Implementations at Scale

> **Evidence:** [production-at-scale.md](evidence/production-at-scale.md)

Production knowledge consolidation systems — Perplexity, Elicit, Consensus, Google AI Overviews, NotebookLM — converge on a shared meta-architecture: **retrieve → extract/rank → constrain generation → cite**. None have solved high-fidelity consolidation with contradictions. The dominant strategy is avoidance: rank sources and pick winners (Perplexity), preserve per-source extractions for human judgment (Elicit), or constrain generation to user-provided documents (NotebookLM).

### 9.1 System Architectures and Contradiction Strategies

| System | Source Scale | Contradiction Strategy | Consolidation Pattern |
|---|---|---|---|
| **Perplexity** | 200B URLs | Authority-weighted ranking | Sequential dependent retrieval |
| **Elicit** | 1K papers/search | Don't resolve — preserve per-source | Structured extraction table |
| **Consensus** | 220M papers | Evidence-agreement scoring | Planning → reading → analysis agents |
| **NotebookLM** | User uploads | Closed-world (no external) | Constrained RAG on user docs |
| **DoorDash** | Support corpus | N/A (single-answer domain) | RAG + 2-tier guardrail cascade |

**Key insight:** No production system resolves contradictions algorithmically. A `/consolidate` skill that explicitly surfaces and categorizes contradictions would be differentiated.

### 9.2 Source Grounding Reduces Hallucination 3x

Source grounding — constraining generation to provided documents — is the strongest hallucination mitigation available. NotebookLM achieves ~13% hallucination rate vs ~40% for ungrounded LLMs (3x reduction). Every production system implements citations as table stakes.

However, even the best factuality benchmark (Google FACTS) shows the top model (Gemini 3 Pro) achieves only **68.8% accuracy** — a hard ceiling that makes post-generation verification essential.

### 9.3 Scale-Specific Failure Modes

| Scale | Primary Failure | Root Cause |
|---|---|---|
| 10 docs | Lost-in-the-middle | Positional attention bias (>30% degradation) |
| 100 docs | Recall collapse | Token budget forces triage (recall drops 33%) |
| 1,000 docs | Claim inventory explosion | Deduplication intractable without hierarchy |

Scaling from 2 to 10 documents produces a counterintuitive result: **hallucination rates stay constant (±5%), but recall drops up to 33%** ([Belem et al., NAACL 2025](https://arxiv.org/abs/2410.13961)). More documents means *less coverage*, not more hallucination.

The [lost-in-the-middle effect](https://arxiv.org/abs/2307.03172) creates 20-50% accuracy drops scaling from 10K to 100K tokens, with 30%+ drops when the answer moves from position 1 to position 10. Multi-scale Positional Encoding (Ms-PoE) improves middle-position accuracy 20-40% with no compute overhead.

**Context rot** universally appears between 50K-150K tokens ([ZenML, 1,200 production deployments](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)). No production system handles 1,000+ documents in a single pass — all use hierarchical decomposition.

### 9.4 Operational Patterns from Production

**Staged context management** (Manus pattern): compaction (reversible) before summarization (irreversible). Threshold: summarize oldest 20 turns when context >128K tokens, always keep last 3 turns raw.

**Multi-tier caching:** Exact-match → semantic (31% of queries exhibit similarity) → prefix/prompt (90% cost reduction on Anthropic). Combined savings >80%.

**Circuit breakers:** Cost and iteration limits prevent cascading failures. GetOnStack experienced a $47K/week cost spike from undetected agent loops. DoorDash defaults to human agents on latency issues.

**Model regression risk:** NotebookLM's [critical regression in February 2026](https://discuss.ai.google.dev/t/critical-regression-gemini-3-1-pro-update-feb-19-completely-broke-notebooklm-s-rag-grounding/126857) where a Gemini 3.1 Pro update "completely broke" grounding demonstrates that consolidation systems must version-pin models and maintain regression tests.

### 9.5 Enterprise Scale Lesson

From [ZenML's 457 case studies](https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works): infrastructure > model intelligence, lean contexts > large contexts, architectural guardrails > prompt-based safety. Elicit's approach — structured extraction with per-source preservation — validates that **separating extraction (per-source) from synthesis (cross-source)** is the highest-fidelity production pattern.

---

## Section 10: Incremental Consolidation

> **Evidence:** [incremental-consolidation.md](evidence/incremental-consolidation.md)

Incremental consolidation — adding new sources to an existing consolidated body without reprocessing everything — is a solved problem at the architectural level but an open problem at the semantic quality level. Six independent agent memory systems (Mem0, Zep/Graphiti, Agent Zero, MemGPT, LangMem, CrewAI) have converged on a remarkably similar pattern: **extract claims from new input → match against existing knowledge via embedding similarity → LLM decides update action → apply with safety guards**.

### 10.1 Convergent Action Taxonomy

Three system families — agent memory, knowledge graphs, and RAG indexes — independently arrived at the same core operation set:

| System | Actions | Key Safety Mechanism |
|---|---|---|
| Agent Zero | SKIP / KEEP_SEPARATE / MERGE / REPLACE / UPDATE | 0.9 cosine threshold for REPLACE |
| Mem0 | ADD / UPDATE / DELETE / NOOP | Top-10 semantic retrieval per candidate |
| Zep/Graphiti | Edge invalidation with temporal versioning | Bi-temporal timestamps (4 per fact) |
| LangMem | INSERT / UPDATE / DELETE (soft signal) | Schema-typed extraction via `trustcall` |
| CrewAI | Keep / Update / Delete / Insert | Dual threshold (0.85 LLM / 0.98 vector-only) |

These are surface variations of the same underlying decision: given a new claim and similar existing claims, should the system ignore it, add it alongside, merge it in, or replace what exists?

### 10.2 The Refine Chain Problem

Pure sequential summarization is not viable for incremental consolidation over many sources. The "Broken Telephone" paper ([ACL 2025](https://arxiv.org/abs/2502.20258)) confirmed that **distortion accumulates progressively and inevitably with chain length**. Bounded output caps error accumulation at ~10% ([arXiv:2308.15022](https://arxiv.org/html/2308.15022v3)), suggesting that structured, bounded representations resist degradation better than open-ended prose.

**Implication:** The consolidated body must be structured (claims, entities, relationships) rather than free text, so incremental updates can target specific elements rather than rewriting the whole.

### 10.3 Conflict Resolution Strategies

| Strategy | Used By | Best For |
|---|---|---|
| **Temporal recency wins** | Zep/Graphiti | Fast-changing domains (news, prices) |
| **LLM-arbitrated** | Agent Zero, Mem0 | General-purpose consolidation |
| **Union (preserve both)** | LightRAG, GraphRAG | When conflict resolution should be deferred |

[Truth discovery algorithms](https://dl.acm.org/doi/10.1145/1281192.1281309) provide a principled framework: a claim is likely true if stated by trustworthy sources; a source is trustworthy if it provides true claims. TruthFinder achieves ~10% improvement over naive majority voting.

[Temporal claim classification](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents) determines how conflicts resolve: **static** facts are permanent, **dynamic** facts are superseded by newer static facts, **atemporal** facts require consensus-based resolution.

### 10.4 Incremental Claim Matching

Production systems converge on a three-layer matching stack with increasing cost:

1. **Exact dedup:** Bloom filter — O(1), ~10 bits/element
2. **Near-duplicate:** MinHash LSH — incremental insert, catches textual similarity
3. **Semantic matching:** FAISS IVF+PQ or HNSW — online insertion without rebuild

Empirically validated thresholds: 0.7 for entity resolution (iText2KG), 0.85 for LLM consolidation (CrewAI), 0.9 for REPLACE safety (Agent Zero), 0.98 for vector-only dedup (CrewAI). Pattern: **lower thresholds for discovery, higher for destructive operations**.

### 10.5 Drift Detection and Rebuild Triggers

Incremental updates accumulate approximation errors. Three drift types require monitoring:

| Drift Type | Signal | Threshold |
|---|---|---|
| **Structural** | Community/cluster boundary shifts | Periodic Leiden refresh |
| **Semantic** | Embedding distribution divergence (DriftLens) | Domain classifier AUC ≥0.55 |
| **Coverage** | Retrieval recall decay against sources | <80% triggers rebuild |

Systems using **global clustering** (GMM, Leiden) cannot be truly incremental — a new document can reassign any existing node. Systems using **local merging** (set union, vector similarity) achieve true O(new-document) cost.

### 10.6 Three-Layer Architecture (Hot/Warm/Cold)

The recommended architecture uses an LSM-tree analog:

```
HOT LAYER — Newly extracted claims, embeddings generated, not yet matched
  Trigger: each new source ingestion

WARM LAYER — Claims matched and actioned (ADD/UPDATE/MERGE/SKIP)
  Conflicts recorded, claim inventory updated
  Trigger: per-source or batch matching pass

COLD LAYER — Fully consolidated prose, all claims integrated
  Trigger: drift threshold exceeded or user requests rebuild
```

**Hot→Warm** is cheap (Agent Zero/Mem0 pattern). **Warm→Cold** is expensive (equivalent to GraphRAG community summary rebuild). The recommended pattern is **hot-eager, cold-lazy**: process each new source through extraction and matching immediately, defer prose re-generation until explicitly requested or triggered by drift metrics.

### 10.7 Formal Correctness

[AGM belief revision (2026)](https://arxiv.org/html/2603.17244) formalizes memory conflict handling with **immutable revisions + mutable tag pointers**. New contradictions create a new revision with a `Supersedes` edge. The system provably satisfies AGM postulates K*2-K*6 — the only system found with formal correctness guarantees for belief revision.

---

## Section 11: Cost-Fidelity Tradeoff Curves

> **Evidence:** [cost-fidelity-tradeoffs.md](evidence/cost-fidelity-tradeoffs.md)

The full decompose-verify-recompose pipeline produces the highest fidelity but costs ~$5/100 docs with a mid-tier model. This section maps where fidelity degrades as pipeline stages are removed, identifies which stages contribute most to quality, and defines three cost-calibrated presets.

### 11.1 Pipeline Stage Ablation

[LLMxMapReduce ablation data](https://arxiv.org/html/2410.09342v1) reveals that the **structured information protocol is the single highest-impact component** — removing it causes catastrophic degradation:

| Removed Component | Fidelity Loss |
|---|---|
| Structured protocol | -15.30pp (English), -16.49pp (code), **-35.43pp (math)** |
| Confidence calibration | -2.05pp (English), -4.82pp (code), -1.43pp (math) |

Structured intermediates contribute **3-25x more fidelity** than confidence calibration. Stage importance ranking:

1. **Structured intermediate format** (+15-35pp) — never skip
2. **Source-grounded verification** (+13.6pp correct claims) — skip only for drafts
3. **Core summarization** (+4.9pp BERTScore) — cannot skip
4. **Confidence calibration** (+2-5pp) — safe to skip for cost savings
5. **Iterative compression** (+1.8pp) — skip unless length control needed

### 11.2 Model Size vs. Quality

An 8B model with Extract-Support (39.2) beats a 70B model with zero-shot (35.2) — **pipeline quality matters more than model size** ([Ou & Lapata, ACL 2025](https://arxiv.org/abs/2502.00977)). However, the model size gap widens with pipeline sophistication (6.4pp at Extract-Support vs 2.0pp at zero-shot), meaning larger models extract more value from better pipelines.

7B models reach 92-95% of GPT-4 quality on comprehension at 1/50th-1/150th the cost. For consolidation, the gap matters most at **conflict resolution** — the stage requiring the most nuanced reasoning. All other stages can safely use open-source models with minimal quality loss.

### 11.3 Verification Diminishing Returns

Iterative review-fix follows a Markov chain: passes 1-2 capture **75% of maximum possible improvement**. Beyond 3 passes, returns are negligible.

[MiniCheck](https://aclanthology.org/2024.emnlp-main.499/) (770M params) achieves GPT-4-level balanced accuracy at **400x lower cost** ($0.24 vs $107 per 13K claims). Optimal strategy: route ~80% of claims through MiniCheck, escalate ~20% ambiguous to LLM-as-judge. Total verification cost: ~$1-2 for 100-doc consolidation.

### 11.4 Token Cost at Scale

Costs scale **linearly**, not quadratically, because decomposition is embarrassingly parallel, deduplication uses embedding similarity, and output is bounded:

| Scale | Homogeneous (Sonnet 4.6) | Mixed Pipeline | Savings |
|---|---|---|---|
| 10 docs | $0.58 | ~$0.15 | 74% |
| 100 docs | $5.37 | ~$1.50 | 72% |
| 1,000 docs | $51.47 | ~$12.00 | 77% |

**Decomposition dominates cost at 70%** of total pipeline spend but tolerates cheap models (7-8B open-source). Mixed-model pipelines (Llama 8B for decomposition, Sonnet for synthesis, MiniCheck for verification) save 72-77%.

### 11.5 Structured Intermediates: Non-Negotiable ROI

JSON intermediates use ~2x the tokens of plain text. Token-optimized formats like [TOON](https://www.tensorlake.ai/blog-posts/toon-vs-json) reduce this to ~1.4x while achieving +4.2pp accuracy over JSON. Forcing structured output *during reasoning* reduces performance by 10-15% — the solution is a two-step pattern: reason freely, then extract structured output (~1.3x cost).

### 11.6 Caching and Amortization

Cacheable computations save 50-65% on incremental re-runs when sources partially overlap:

| Computation | Cacheability | Savings on Re-run |
|---|---|---|
| Source claim decomposition | High (keyed on source hash) | ~40% |
| Embedding computation | High | ~10% |
| MiniCheck verification | High (keyed on claim+source hash) | ~15% |
| Conflict resolution | Low (context-dependent) | ~0% |

Anthropic prefix caching: 90% cost reduction, 85% latency reduction on cached input. Semantic caching (GPTSemCache): 61-69% hit rates at 0.8 similarity threshold.

### 11.7 Quality Tier Presets

Three presets for the `/consolidate` skill, enabling cost-appropriate fidelity:

| Dimension | Fast | Standard | Thorough |
|---|---|---|---|
| **Cost (10 docs)** | $0.02-0.05 | $0.15-0.50 | $1.50-5.00 |
| **Cost (100 docs)** | N/A (context limit) | $1.50-5.00 | $5-20 |
| **Pipeline** | Stuff-all + CoT | Map-reduce + chaining + MiniCheck | Full decompose-verify-recompose |
| **Decomposition model** | Budget (Haiku/mini) | Llama 8B | Llama 8B-13B |
| **Synthesis model** | Budget | Sonnet 4.6 | Sonnet 4.6 |
| **Conflict resolution** | None | Implicit (best-effort) | Frontier model (Opus/GPT-5) |
| **Verification** | None | MiniCheck only | Tiered (MiniCheck + LLM) |
| **Refinement passes** | 0 | 1-2 | 2-3 |
| **Structured intermediates** | No | Partial | Full (TOON/JSON) |
| **Max documents** | ~20 | ~500 | ~5,000+ |
| **Relative fidelity** | 1.0x | ~2.5-3.0x | ~3.5-4.0x |
| **When to use** | Exploratory, internal drafts | Regular consolidation, research | Published reports, high-stakes decisions |

Configuration knobs beyond tier presets: `verification_depth`, `refinement_passes`, `structured_intermediates`, `decomposition_model`, `synthesis_model`, `conflict_resolution_model`, `caching`.

---

## Section 12: Recomposition Patterns

> **Evidence:** [recomposition-patterns.md](evidence/recomposition-patterns.md)

Recomposition — reconstructing coherent prose from a set of verified, deduplicated atomic claims — is the least-studied step in the decompose-verify-recompose pipeline and the point where most production systems stop short. Perplexity, Elicit, and Google AI Overviews all avoid deep claim-to-document synthesis, opting instead for per-source extractions, winner-picking, or shallow composition with heavy citation anchoring. The academic literature on data-to-text generation, discourse planning, and controlled generation offers strong techniques, but no single system solves the full problem.

The critical difference between recomposition and ordinary text generation is the **bidirectional fidelity constraint**: the output must be entailed by the input claims (no hallucination) AND must entail all input claims (no omission). Traditional generation only loosely targets the first.

### 12.1 Outline-First Generation

Direct generation from claims produces poorly structured output. Three independent results converge on outline-first approaches:

**WritingPath** (Yang et al., 2024) uses a five-step metadata → outline → augmented outline → final text process. Both LLM and human evaluators confirmed superior logical fluency, specificity, and coherence — approximately +25% improvement in organization over direct generation ([arXiv:2404.13919](https://arxiv.org/abs/2404.13919)).

**Planning-augmented generation** (Petrik et al., 2024) yields +2.5% ROUGE-Lsum and a 3.60 win/loss ratio in human evaluation, with clear wins in organization, relevance, and verifiability ([arXiv:2410.06203](https://arxiv.org/abs/2410.06203)).

A striking parameter-efficiency result: Su et al.'s **PlanGen** (2021) showed a **140M-parameter model with explicit planning outperformed a 2.8B-parameter T5-3B** on data-to-text generation ([arXiv:2108.13740](https://ar5iv.labs.arxiv.org/html/2108.13740)). Planning is not optional — it is architecturally necessary and dramatically more parameter-efficient than brute-force scaling.

**Practical implication:** The recomposition prompt should never directly generate prose from claims. It should first produce a structural outline that groups and orders claims, then fill each section independently.

### 12.2 Prompt Chaining for Draft-Critique-Refine

Jiang et al. (ACL Findings 2024) provide the definitive comparison: separating draft → critique → refine into distinct LLM calls achieved **77/100 wins** versus single-prompt stepwise approaches ([ACL 2024](https://aclanthology.org/2024.findings-acl.449/)). The critical finding is that stepwise prompts produce **"simulated refinement"** — the model generates deliberate flaws in its initial draft to then demonstrate self-correction within a single response.

Self-correction without external feedback does not reliably improve outputs ([Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798)). However, claim-to-document is one of the "decomposable" tasks where self-correction can work, because each claim is independently verifiable ([Kamoi et al., TACL 2024](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177)). The critique pass must use **structured verification** — a claim checklist with NLI model verification — rather than open-ended self-assessment.

Refinement quality degrades after 2-3 iterations across multiple sources. Cap recomposition at **one critique pass**: draft → structured critique → single revision.

### 12.3 Nuance Preservation: The Confidence Inflation Problem

LLMs systematically strip hedging and uncertainty markers during recomposition. The root cause: RLHF training rewards confident-sounding responses over appropriately hedged ones, because human raters score uncertain-sounding text as less helpful ([Epistemic Integrity in LLMs, 2024](https://arxiv.org/abs/2411.06528)). When rewriting, models upgrade "may cause" → "causes," "preliminary evidence suggests" → "research shows." Evaluation of five frontier models found **systematic overconfidence in all models** ([arXiv:2505.24778](https://arxiv.org/html/2505.24778)).

Two mitigation techniques show strong results:

**MetaFaith** (EMNLP 2025) uses metacognitive prompting to achieve **61% improvement in faithfulness of uncertainty expression**, with an 83% win rate over original generations in human evaluation. It is black-box, task-agnostic, and requires no prompt tuning ([arXiv:2505.24858](https://arxiv.org/abs/2505.24858)).

**Selective Abstraction** (Goren et al., 2026) offers an alternative to binary include/exclude decisions: replace low-confidence claims with higher-confidence, less-specific abstractions (e.g., "March 15" → "mid-March"), yielding **27.73% improvement in risk-coverage AURC** over simple claim removal ([arXiv:2602.11908](https://arxiv.org/abs/2602.11908)).

The recomposition prompt must include explicit instructions to preserve original epistemic markers verbatim, never upgrade hedging language, and preserve the lowest confidence level when synthesizing across sources with different certainty.

### 12.4 The ~8-13% Inherent Information Loss

Combining DecMetrics ([arXiv:2509.04483](https://arxiv.org/abs/2509.04483)) decomposition fidelity measurements with the Broken Telephone findings ([Mohamed et al., ACL 2025](https://arxiv.org/abs/2502.20258)) yields an end-to-end fidelity budget for the full pipeline:

| Stage | Estimated Fidelity | Source |
|-------|-------------------|--------|
| Decomposition | 92-94% claim coverage | DecMetrics |
| Deduplication | 0-2% additional loss | Merging may lose nuance |
| Recomposition (single pass, anchored) | 95-98% faithfulness | Broken Telephone mitigated |
| **Combined pipeline** | **~87-92%** | Multiplicative |

A critical finding: **rephrasing within a single language shows faster degradation than cross-language translation chains** — the decompose→recompose cycle inherently loses information faster than translation. Each iteration adds -0.004 to -0.04 FActScore. After 100 iterations, factuality collapses to 0.04-0.075.

The key mitigations are minimizing transformation depth (never more than one recomposition pass), source anchoring (including original text alongside claims during generation), and low temperature (0-0.3).

### 12.5 Coverage and Proportionality

Without explicit claim tracking, GPT-4 covers only **~40% of diverse multi-source content** ([Kim et al., NAACL 2024](https://aclanthology.org/2024.naacl-long.32/)). Models are also over-sensitive to input ordering and under-sensitive to input composition — changing the ratio of positive to negative evidence barely changes the output ([DeYoung et al., TACL 2024](https://arxiv.org/abs/2301.13844)).

The **Pyramid Method** ([Nenkova & Passonneau, HLT-NAACL 2004](http://www.cs.columbia.edu/~ani/papers/pyramid.pdf)) provides a principled weighting model: each claim receives weight equal to the number of sources containing it. Top-tier claims (appearing in many sources) must all be included; lower tiers fill remaining space. A **generate-then-select** strategy — producing 2-3 candidate recompositions and selecting the one whose emphasis best matches the input claim distribution — compensates for models' poor natural proportionality.

### 12.6 Structured vs. Prose Output and Attribution

Format restrictions (JSON, XML) **significantly degrade reasoning quality** while improving classification accuracy ([Tam et al., 2024](https://arxiv.org/html/2408.02442v1)). Recomposition should use the least restrictive format that meets the use case:

| Claim Count | Recommended Format |
|-------------|-------------------|
| < 10 | Prose with inline citations |
| 10-50 | Sectioned prose with headers (from claim clusters) |
| 50+ | Hierarchical document with executive summary |
| Comparison claims | Auto-detect → table |
| Contradictory claims | Always prose (requires careful framing) |

For attribution, the **AIS framework** ([Rashkin et al., Computational Linguistics 2023](https://direct.mit.edu/coli/article/49/4/777/116438/)) establishes that NLG output must be verifiable against identified sources. However, the ALCE benchmark shows even the best models lack complete citation support 50% of the time ([Gao et al., EMNLP 2023](https://arxiv.org/abs/2305.14627)). Recommended pattern: inline per-claim citations `[n]` with post-hoc NLI verification that cited sources actually support the attributed claims.

### 12.7 Cross-Claim Coherence and the FiC Pattern

Claims that are individually true may require careful framing when juxtaposed. **Cross-Document Structure Theory** ([Radev, 2000](https://www.semanticscholar.org/paper/7d567a104ed5e206229c6d98e4190135f336448d)) defines a taxonomy of cross-document relations — Equivalence, Subsumption, Contradiction, Elaboration, Attribution, Modality — that determines how claim pairs should be handled during recomposition.

**Multi-Review Fusion-in-Context (FiC)** ([Slobodkin et al., NAACL 2024](https://arxiv.org/abs/2403.15351)) is the closest existing system to atomic claim recomposition. FiC takes multiple documents with **pre-highlighted spans** and generates "a coherent passage that includes all and only the highlighted content." For contradicting claims, the output aggregates appropriately (e.g., "the service received mixed reviews"). GPT-4 achieved 4.7/5 coherence and 4.5/5 redundancy scores on this task.

Entity-based coherence ([Barzilay & Lapata, 2008](https://direct.mit.edu/coli/article/34/1/1/1969/)) provides both an ordering signal (claims sharing entities should be adjacent) and an evaluation metric (entity grid analysis detects incoherent orderings). **Sentence fusion** techniques ([Barzilay & McKeown, 2005](https://www.researchgate.net/publication/220355341)) can partially reconstruct original sentences from claims that were decomposed from the same source — essential for avoiding choppy, list-like output.

### Recommended Four-Phase Recomposition Pipeline

| Phase | Input | Technique | Output |
|-------|-------|-----------|--------|
| **1. Cluster & Allocate** | Verified claim inventory | Embedding-based clustering, Pyramid weighting, format detection | Claim groups with target word counts |
| **2. Outline** (separate prompt) | Claim groups | RST-informed section planning, claim-to-outline mapping | Structural outline with transition notes |
| **3. Section Draft** (separate prompt per section) | Claims + outline + source excerpts | Source-anchored generation, temp 0-0.3, explicit hedging preservation | Per-section prose with inline citations |
| **4. Verify & Critique** (single pass) | Full draft + claim inventory | Coverage audit, faithfulness NLI, nuance check, attribution verification | Final recomposed document |

---

## Cross-Cutting Synthesis

### The Decompose-Verify-Recompose Meta-Pattern

Across all twelve dimensions, the highest-fidelity consolidation approaches share a common structure that we call **decompose-verify-recompose**:

1. **Decompose** sources into atomic claims (Section 3) — using iterative extraction for complex sources, hybrid extractive-abstractive for provenance + normalization
2. **Verify** the claim inventory — deduplicate semantically equivalent claims, detect conflicts via NLI contradiction checks and dual-perspective retrieval (Section 4, Section 5 conflict resolution)
3. **Resolve** conflicts using source trust weighting, temporal recency, tiered consensus mechanisms (Section 8), or transparent surfacing (Section 3.7)
4. **Recompose** into coherent output via the four-phase pipeline — cluster claims, generate outline, draft section-by-section with source anchoring, verify with structured critique (Section 12). Architecture selection (Section 1) determines the high-level strategy; recomposition patterns determine the prose generation approach.
5. **Verify** the output against the source claim inventory — tiered pipeline with MiniCheck first-pass, LLM-as-judge for completeness, scope adherence checks (Section 4, Section 7)

This pattern is the unifying insight across the research. It appears in:
- **Architectures** (Section 1): LLMxMapReduce's structured protocol and ToM's confidence-based aggregation both implement decompose-verify-recompose within their reduce steps
- **Verification** (Section 4): The tiered pipeline IS the verify step, applied to both input decomposition and output validation
- **Evaluation** (Section 7): The "lossless within scope" composite metric directly measures the fidelity of the decompose-verify-recompose pipeline
- **Frameworks** (Section 5): The gap between frameworks that work (LLMxMapReduce, Agent Zero) and those that don't (CrewAI, default LangChain) is exactly whether they implement this pattern
- **Consensus** (Section 8): Tiered consensus (self-consistency → jury → debate) IS the conflict resolution strategy within step 3, with cost-appropriate escalation
- **Production** (Section 9): Every production system implements some version of this pattern, even if they skip conflict resolution (Perplexity, Elicit)
- **Incremental** (Section 10): The hot/warm/cold architecture maps directly — hot is decompose, warm is verify+resolve, cold is recompose
- **Recomposition** (Section 12): The four-phase pipeline (Cluster → Outline → Draft → Verify) IS the recompose step, with outline-first generation and prompt chaining as the specific techniques. The ~8-13% inherent information loss quantifies the fidelity cost of the recompose step itself.
- **Cost-Fidelity** (Section 11): The ablation data quantifies exactly which steps of this pattern contribute most to fidelity, enabling cost-calibrated execution

### Recomposition Is the Fidelity Bottleneck

Section 12 reveals that recomposition — not decomposition or verification — is where production systems stop and where the most information is lost. The ~8-13% inherent loss is a multiplicative floor that cannot be reduced below ~87% fidelity regardless of how perfect the earlier pipeline stages are. This makes recomposition the binding constraint on end-to-end consolidation quality. The key insight is that recomposition quality depends more on explicit planning (outline-first, claim tracking) than on model capability: a 140M-parameter model with planning outperformed a 2.8B model without it. Combined with Section 11's finding that pipeline design matters more than model size, this reinforces that the `/consolidate` skill's value is architectural.

### No Framework Does This Well by Default

Every major framework's default consolidation is lossy summarization or string concatenation (Section 5). LangChain uses `"Write a concise summary"`. CrewAI concatenates strings. AutoGen takes the last message. The frameworks that achieve genuine fidelity — LLMxMapReduce (95.5% reference precision) and Agent Zero (5-action taxonomy with safety rails) — do so through custom, purpose-built consolidation logic that is orders of magnitude more sophisticated than any default.

This validates the need for a dedicated `/consolidate` skill. The skill fills a genuine gap in the AI agent ecosystem.

### Architecture Selection Is Source-Type-Aware

The source-type suitability matrix (Section 1) and source-type decomposition guidance (Section 3.6) combine into a routing decision:

| Source Profile | Architecture | Decomposition |
|---|---|---|
| Structured agent outputs | Structured Map-Reduce | Light extractive |
| Unstructured articles/books | Context-Aware Hierarchical Merging | Full iterative (AFEV) |
| Mixed types | Preprocessing → Structured Map-Reduce | Type-specific, then normalize |
| Small set (<32K tokens) | Stuff-it-all (with bias mitigation) | Full extractive |
| Well-structured documents | Tree-Structured (ToM) | Structure-preserving |

### False Consensus Is More Dangerous Than Disagreement

A finding from Section 8 that reshapes how the entire pipeline should handle multi-agent steps: **61-91% of multi-agent failures are caused by silent agreement**, not by disagreement. This means that whenever the pipeline uses multiple agents or multiple verification passes, the absence of disagreement should trigger active probing (Catfish-style) rather than being interpreted as validation. This applies to the verify steps (Sections 4, 7), conflict resolution (Section 3), and any multi-agent architecture (Section 5).

### Pipeline Quality > Model Size

Section 11's ablation data confirms a principle that has implications across all other dimensions: an 8B model with the right pipeline (Extract-Support) outperforms a 70B model with no pipeline (zero-shot). This means the `/consolidate` skill's value comes from its pipeline design, not from requiring frontier models. The practical consequence: decomposition (70% of cost) can use cheap models, reserving frontier models only for conflict resolution — the stage requiring the most nuanced reasoning.

### Batch and Incremental Are Two Modes of the Same System

Section 10 reveals that incremental consolidation is not a separate system but a different execution mode of the same decompose-verify-recompose pipeline. The hot/warm/cold architecture maps directly: hot = Phase 1 (decompose), warm = Phase 2 (verify + resolve), cold = Phase 3-4 (recompose + verify). The key architectural insight is that the claim inventory (warm layer) should persist between invocations, while prose output (cold layer) is a derived projection that can be lazily rebuilt.

### Production Systems Validate the Gap

Section 9's survey of production systems confirms that the gap identified in Section 5 is not just a framework limitation — even billion-dollar products (Perplexity, Elicit, Consensus) avoid resolving contradictions, choosing instead to pick winners, preserve all positions, or constrain to single sources. A `/consolidate` skill that implements tiered consensus (Section 8) for contradiction resolution, with explicit surfacing of unresolvable conflicts, would be genuinely differentiated.

---

## Recommendations for /consolidate Skill Design

Based on the research findings, the `/consolidate` skill should implement these design decisions:

### R1: Implement the Decompose-Verify-Recompose Pipeline

The core pipeline should be:

```
Phase 1: Source Decomposition
  ├─ Classify source type (structured/unstructured/mixed)
  ├─ For structured: light extractive decomposition (span identification)
  ├─ For unstructured: iterative abstractive decomposition (AFEV-style)
  ├─ For all: maintain dual representation (original span + normalized form)
  └─ Output: Claim inventory with {claim_text, source_id, source_span, normalized_form}

Phase 2: Claim Processing
  ├─ Deduplicate: embed claims → cluster (cosine ~0.85-0.92) → NLI entailment within clusters
  ├─ Conflict detection: NLI contradiction across non-duplicate claims
  ├─ Conflict resolution: source trust → consensus → transparent surfacing
  └─ Output: Deduplicated, conflict-resolved claim inventory

Phase 3: Recomposition
  ├─ Select architecture based on source profile (see routing table above)
  ├─ LLM synthesizes coherent output from claim inventory
  ├─ Maintain inline citation markers
  └─ Generate shorter segments independently, then merge (mitigate end-of-output hallucination)

Phase 4: Verification
  ├─ Tiered: MiniCheck → LLM-as-judge → SAFE (optional)
  ├─ Completeness check: source nuggets vs. output claims
  ├─ Attribution verification: confirm each citation supports its claim
  └─ Output: Verified text with confidence scores and attributions
```

**Confidence: High.** This pattern is validated across the entire research landscape — every high-fidelity system implements some version of it.

### R2: Use Structured Information Protocols at Every Boundary

Every intermediate representation should use a fixed schema with confidence scores — never free text between consolidation stages. The LLMxMapReduce four-field protocol (Extracted Information, Rationale, Answer, Confidence Score) is the proven template.

**Evidence basis:** Removing structured protocol reduced comprehension from 41.23 to 25.93. Unstructured multi-agent networks amplify errors 17.2x vs. 4.4x for centralized coordination.

### R3: Implement the Agent Zero Safety Rails

When consolidating overlapping information, use Agent Zero's action taxonomy (MERGE/REPLACE/UPDATE/KEEP_SEPARATE/SKIP) with the critical safety gate: REPLACE requires >0.9 similarity or auto-downgrades to KEEP_SEPARATE. Bias toward keeping more data over risking information loss.

### R4: Cap Refinement Iterations

Quality degrades after 2-3 refinement iterations. Cap consolidation loops at 3 iterations with explicit quality gates. Use NexusSum's rollback pattern: when compression crosses below target, return the previous iteration's output.

### R5: Express Scope as a Rubric, Not a Topic

Consolidation scope should be expressed as a structured rubric with dimensions and criteria. This enables:
- Automated nugget classification (in-scope/out-of-scope)
- Bidirectional coverage checking
- Scope adherence evaluation

### R6: Use MiniCheck as the Default Verification Engine

MiniCheck provides GPT-4-level accuracy at 400x lower cost. Use it as the first-pass filter for all claim verification, escalating only ~20% of claims to more expensive LLM-as-judge verification.

### R7: Evaluate with the "Lossless Within Scope" Composite

Implement the composite metric for every consolidation run:
- Faithfulness (no hallucination): MiniCheck + LLM-as-judge
- Completeness (claim coverage): AutoNuggetizer-style nugget recall
- Scope adherence: LLM-as-judge with rubric

Do not use ROUGE, BLEU, or BERTScore for evaluating consolidation quality.

### R8: Handle Conflicts as First-Class Concerns

Inter-source conflicts are the norm in multi-source consolidation, not an edge case. The skill must:
- Detect conflicts explicitly (NLI contradiction + dual-perspective retrieval)
- Apply resolution strategies based on source characteristics (trust weighting, recency, consensus)
- Surface unresolvable conflicts transparently rather than silently picking one version

### R9: Implement Tiered Consensus for Multi-Agent Convergence

When multiple agents or verification passes produce conflicting claims, use a tiered consensus architecture with escalating cost (Section 8):

1. **Self-consistency triage** (cheap): 1 model × N=5 samples, majority vote. Claims with >=80% majority pass.
2. **Jury verification** (medium): 3 heterogeneous models (PoLL pattern) for contested claims.
3. **Structured debate** (expensive, rare): Role-based debate with devil's advocate (Catfish pattern) for claims that survive Tier 2.
4. **Contested register** (no cost): Record both positions when consensus fails, with per-side confidence and evidence.

Actively probe for false consensus — the absence of disagreement is a warning sign requiring Catfish-style structured dissent, since 61-91% of multi-agent failures stem from silent agreement.

### R10: Support Incremental Mode with Claim Inventory Persistence

The skill should support two modes (Section 10):

- **Batch mode**: All sources provided at once. Full decompose-verify-recompose pipeline.
- **Incremental mode**: `--incremental --existing <path>`. Add new sources to existing consolidated body via extract → match → decide (ADD/UPDATE/MERGE/SKIP/REPLACE) → apply, with 0.9 cosine threshold for destructive operations.

Persist the claim inventory (warm layer) between invocations. Rebuild prose output (cold layer) only when drift metrics exceed thresholds or user requests it. Use content-hash gating to skip unchanged sources.

### R11: Implement Quality Tier Presets

Expose three cost-calibrated quality tiers (Section 11):

- **Fast** ($0.02-0.05/10 docs): Stuff-all + CoT, budget model, no verification. For exploratory drafts.
- **Standard** ($0.15-0.50/10 docs): Map-reduce + prompt chaining + MiniCheck. Llama 8B decomposition, Sonnet synthesis. 1-2 refinement passes.
- **Thorough** ($1.50-5.00/100 docs): Full pipeline with structured intermediates, frontier conflict resolution, tiered verification, 2-3 passes.

Mixed-model pipelines save 72-77% vs homogeneous deployment. Decomposition (70% of cost) tolerates cheap models. Always include MiniCheck verification (400x cheaper than GPT-4, same accuracy).

### R12: Recompose via the Four-Phase Pipeline

The recomposition step (Section 12) should implement a four-phase pipeline:

1. **Cluster & Allocate:** Group verified claims by semantic similarity, construct hierarchy, assign Pyramid-weighted target word counts per cluster, auto-detect format (prose/table/list) per cluster.
2. **Outline Generation** (separate prompt): Produce a structural outline mapping claims to sections, with RST-informed transition notes and format annotations. Never skip this step — outline-first generation yields +25% organization improvement and a 3.6x human preference ratio.
3. **Section-by-Section Draft** (separate prompt per section, temperature 0-0.3): Generate prose constrained by a literal claim checklist, inline `[n]` citations, explicit hedging preservation instructions, and original source excerpts for anchoring. Generate sections independently to prevent cross-contamination.
4. **Verify & Critique** (single pass): Structured checklist — coverage audit (claim-level NLI), faithfulness audit (reverse NLI), nuance check (epistemic marker diff), attribution check, coherence scan, proportionality check. Fix issues in a single revision. Do not iterate further.

Apply MetaFaith-style metacognitive prompting (61% improvement in uncertainty faithfulness) to preserve hedging. Use Selective Abstraction for low-confidence claims. Accept the ~8-13% inherent information loss as a known floor and optimize pipeline design to approach it rather than trying to eliminate it.

**Confidence: High.** The four-phase structure is supported by convergent evidence from data-to-text generation, discourse planning, prompt chaining, and the FiC system.

### R13: Build for Production Resilience

Based on production system lessons (Section 9) and recomposition findings (Section 12):

- **Version-pin models** and maintain regression tests. NotebookLM's grounding broke from an upstream model update.
- **Implement circuit breakers** on cost and iteration count. Agent loops caused $47K/week cost spikes in production.
- **Use staged context management**: compaction (reversible) before summarization (irreversible). Context rot appears between 50K-150K tokens.
- **Place critical evidence at start and end** of context, never exclusively in the middle (lost-in-the-middle mitigation).
- **Cache aggressively**: source decomposition, embeddings, and MiniCheck results are all cacheable (50-65% savings on re-runs).

---

## Limitations & Open Questions

### Limitations of This Research

1. **Evaluation gap:** The "lossless within scope" composite metric is derived from combining existing evaluation paradigms. It has not been validated as a unified metric in a controlled study.

2. **Scale testing:** Most papers evaluate on datasets with <100 documents. The decompose-verify-recompose pipeline has not been stress-tested at the scale of hundreds of sources, where claim inventory management becomes a bottleneck. Production systems (Section 9) confirm that no system handles 1,000+ documents in a single pass.

3. **Cost-fidelity tradeoff:** The full pipeline is compute-intensive. Section 11 provides empirical cost data and quality tier presets, but the optimal tier selection criteria for different domains remain under-characterized.

4. **Domain specificity:** Most evaluation data comes from news summarization and Wikipedia-based tasks. Performance on specialized domains (legal, medical, code documentation) is less characterized. One study found "very weak or non-significant correlation" between standard metrics and human evaluations on patent documents.

5. **Conflict resolution validation:** The tiered consensus architecture (Section 8) and five conflict resolution strategies are theoretically grounded and production-validated individually, but lack end-to-end comparative evaluation in a consolidation-specific context.

6. **Incremental semantic quality:** Section 10 shows incremental consolidation is architecturally solved (six convergent systems) but semantically open. The warm-layer overlay rendering and long-term drift accumulation effects are not well-characterized empirically.

7. **Inherent recomposition loss:** Section 12 establishes a ~8-13% inherent information loss floor in the decompose→recompose cycle. This is a multiplicative constraint — even perfect decomposition and verification cannot produce lossless output once claims are recomposed into prose. The fidelity budget (87-92%) represents a hard ceiling that pipeline design can approach but not exceed. Within-language rephrasing degrades faster than cross-language translation, suggesting that the semantic compression inherent in prose generation is the binding constraint.

### Open Questions

1. **Optimal claim granularity:** How atomic should claims be? Atomic-SNLI shows verification accuracy drops 1-8% at the atomic level vs. full sentences. Is there an optimal granularity that balances verifiability with coherence?

2. **Dynamic architecture routing:** Can a meta-model learn to select the optimal consolidation architecture based on source characteristics, or should routing remain rule-based?

3. ~~**Incremental consolidation:**~~ Addressed in Section 10. The three-layer hot/warm/cold architecture with drift-triggered rebuilds provides a concrete answer.

4. **Multi-modal sources:** This research covers text-only consolidation. Extending to tables, images, and code requires additional decomposition and verification strategies.

5. **User trust calibration:** How should the skill surface uncertainty to users? The "transparent surfacing" strategy for unresolvable conflicts needs UX design.

---

## References

### Academic Papers

- [FActScore: Fine-grained Atomic Evaluation of Factual Precision](https://arxiv.org/abs/2305.14251) — Min et al., EMNLP 2023
- [AFEV: Fact in Fragments — LLM-based Atomic Fact Extraction and Verification](https://arxiv.org/abs/2506.07446) — Expert Systems with Applications, 2025
- [JEDI: Extractive Fact Decomposition for Interpretable NLI](https://arxiv.org/abs/2509.18901) — EMNLP 2025
- [Atomic-SNLI: Fine-Grained NLI through Atomic Fact Decomposition](https://arxiv.org/abs/2601.06528) — arXiv 2025
- [MiniCheck: Efficient Fact-Checking of LLMs on Grounding Documents](https://arxiv.org/abs/2404.10774) — Tang et al., EMNLP 2024
- [SAFE: Long-form Factuality in Large Language Models](https://arxiv.org/abs/2403.18802) — Wei et al., NeurIPS 2024
- [AlignScore: Evaluating Factual Consistency with a Unified Alignment Function](https://arxiv.org/abs/2305.16739) — ACL 2023
- [Knowledge Conflicts for LLMs: A Survey](https://arxiv.org/abs/2403.08319) — Xu et al., EMNLP 2024
- [Contradiction to Consensus: Dual-Perspective Claim Verification](https://arxiv.org/abs/2602.18693) — arXiv 2025
- [ALCE: Enabling LLMs to Generate Text with Citations](https://arxiv.org/abs/2305.14627) — Gao et al., EMNLP 2023
- [LLMxMapReduce V1](https://arxiv.org/abs/2410.09342) — Structured Information Protocol, 2024
- [LLMxMapReduce V2](https://arxiv.org/abs/2504.05732) — Entropy-Driven Convolutional Scaling, 2025
- [ToM: Tree-oriented MapReduce](https://arxiv.org/abs/2511.00489) — EMNLP 2025
- [Context-Aware Hierarchical Merging](https://arxiv.org/abs/2502.00977) — Ou & Lapata, ACL 2025 Findings
- [BooookScore: Systematic Exploration of Book-Length Summarization](https://arxiv.org/abs/2310.00785) — ICLR 2024
- [NexusSum: Multi-Agent Hierarchical Summarization](https://arxiv.org/abs/2505.24575) — ACL 2025
- [From Single to Multi: MDS Hallucination](https://arxiv.org/abs/2410.13961) — NAACL 2025
- [FABLES: Evaluating Faithfulness and Content Selection in Book Summarization](https://arxiv.org/abs/2404.01261) — 2024
- [Hallucinate at the Last](https://arxiv.org/abs/2505.15291) — 2025
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — Liu et al., TACL 2024
- [Do MDS Models Synthesize?](https://arxiv.org/abs/2301.13844) — TACL 2024
- [Prompt Chaining vs Stepwise Refinement](https://arxiv.org/abs/2406.00507) — 2024
- [Chain of Density](https://arxiv.org/abs/2309.04269) — Adams et al., 2023
- [CoTHSSum](https://link.springer.com/article/10.1007/s44443-025-00041-2) — 2025
- [Recursive Knowledge Synthesis](https://arxiv.org/abs/2601.08839) — 2025
- [Dynamic Tree Construction for Recursive Summarization](https://aclanthology.org/2025.acl-long.536.pdf) — ACL 2025
- [GraphRAG](https://arxiv.org/html/2404.16130v2) — Microsoft Research, 2024
- [Knowledge-Intensive QFS](https://arxiv.org/abs/2408.10357) — ICPR 2024
- [Scaling Agent Systems: Error Amplification](https://arxiv.org/abs/2512.08296) — DeepMind/MIT, 2025
- [FactCC](https://arxiv.org/abs/1910.12840) — Kryscinski et al., 2020
- [SummaC](https://github.com/tingofurro/summac) — Laban et al., 2022
- [QAFactEval](https://aclanthology.org/2022.naacl-main.187/) — Fabbri et al., 2022
- [G-Eval](https://www.confident-ai.com/blog/g-eval-the-definitive-guide) — Liu et al., 2023
- [UniEval](https://arxiv.org/abs/2210.07197) — Zhong et al., 2022
- [BERTScore](https://arxiv.org/abs/1904.09675) — Zhang et al., ICLR 2020
- [MoverScore](https://ar5iv.labs.arxiv.org/html/1909.02622) — Zhao et al., 2019
- [AutoNuggetizer / TREC 2024 RAG Track](https://arxiv.org/html/2411.09607v1) — Pradeep et al., 2024
- [Pyramid Method](https://dl.acm.org/doi/10.1145/1233912.1233913) — Nenkova & Passonneau, 2007
- [A Survey on LLM-as-a-Judge](https://arxiv.org/abs/2411.15594) — 2024
- [Trust or Escalate: LLM Judges with Uncertainty](https://proceedings.iclr.cc/paper_files/paper/2025/file/08dabd5345b37fffcbe335bd578b15a0-Paper-Conference.pdf) — ICLR 2025
- [Exploring Factual Entailment with NLI](https://arxiv.org/abs/2406.16842) — Kavtaradze, 2024
- [QFMDS Survey](https://dl.acm.org/doi/abs/10.1145/3597299) — ACM Computing Surveys, 2023
- [SourceCheckup](https://www.nature.com/articles/s41467-025-58551-6) — Nature Communications, 2025
- [Voting or Consensus? Decision-Making in Multi-Agent Debate](https://arxiv.org/abs/2502.19130) — Kaesberg et al., ACL 2025 Findings
- [Beyond Majority Voting: LLM Aggregation by Leveraging Higher-Order Information](https://arxiv.org/abs/2510.01499) — Ai et al. (MIT/Harvard), 2025
- [Self-Consistency Improves Chain of Thought Reasoning](https://arxiv.org/abs/2203.11171) — Wang et al., ICLR 2023
- [Ranked Voting based Self-Consistency of Large Language Models](https://arxiv.org/abs/2505.10772) — Wang et al., ACL 2025 Findings
- [Improving Factuality and Reasoning through Multiagent Debate](https://arxiv.org/abs/2305.14325) — Du et al., ICML 2024
- [Replacing Judges with Juries: Panel of Diverse Models (PoLL)](https://arxiv.org/abs/2404.18796) — Verga et al. (Cohere), 2024
- [Confidence Calibration via Multi-Agent Deliberation](https://arxiv.org/abs/2404.09127) — Yang et al., 2024
- [Multi-Agent Verification: Scaling Test-Time Compute (BoN-MAV)](https://arxiv.org/abs/2502.20379) — Lifshitz et al., 2025
- [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) — Cemri et al., 2025
- [Silence is Not Consensus: Catfish Agent](https://arxiv.org/abs/2505.21503) — Wang et al., 2025
- [CONSENSAGENT: Efficient Multi-Agent LLM Interactions](https://aclanthology.org/2025.findings-acl.1141/) — Pitre et al., ACL 2025 Findings
- [MAD-Fact: Multi-Agent Debate for Factuality Evaluation](https://arxiv.org/abs/2510.22967) — Ning et al., 2025
- [KARMA: Multi-Agent LLMs for Knowledge Graph Enrichment](https://arxiv.org/abs/2502.06472) — Lu & Wang, NeurIPS 2025
- [CortexDebate: Sparse Multi-Agent Debate](https://arxiv.org/abs/2507.03928) — ACL 2025 Findings
- [Mem0: Scalable Long-Term Memory for AI Agents](https://arxiv.org/abs/2504.19413) — 2025
- [Zep/Graphiti: Temporal Knowledge Graph Architecture](https://arxiv.org/abs/2501.13956) — 2025
- [MemGPT: LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — 2023
- [RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval](https://arxiv.org/abs/2401.18059) — ICLR 2024
- [LightRAG: Simple and Fast RAG](https://arxiv.org/abs/2410.05779) — EMNLP 2025 Findings
- [LLM as a Broken Telephone: Iterative Generation Distorts Information](https://arxiv.org/abs/2502.20258) — ACL 2025
- [Truth Discovery with Multiple Conflicting Information Providers](https://dl.acm.org/doi/10.1145/1281192.1281309) — Yin et al., KDD 2007
- [AGM Belief Revision for AI Memory](https://arxiv.org/html/2603.17244) — 2026
- [WritingPath: Outline-guided Text Generation](https://arxiv.org/abs/2404.13919) — Yang et al., 2024
- [Planning-augmented Generation for Long-Form Text](https://arxiv.org/abs/2410.06203) — Petrik et al., 2024
- [PlanGen: Plan-then-Generate for Data-to-Text](https://ar5iv.labs.arxiv.org/html/2108.13740) — Su et al., 2021
- [MetaFaith: Faithful Uncertainty Expression in LLMs](https://arxiv.org/abs/2505.24858) — EMNLP 2025
- [Selective Abstraction for Reliable Long-Form Generation](https://arxiv.org/abs/2602.11908) — Goren et al., 2026
- [DecMetrics: Structured Claim Decomposition Scoring](https://arxiv.org/abs/2509.04483) — 2025
- [Multi-Review Fusion-in-Context (FiC)](https://arxiv.org/abs/2403.15351) — Slobodkin et al., NAACL 2024
- [Cross-Document Structure Theory](https://www.semanticscholar.org/paper/7d567a104ed5e206229c6d98e4190135f336448d) — Radev, ACL/SIGDIAL 2000
- [Entity-Based Coherence: Entity Grid Model](https://direct.mit.edu/coli/article/34/1/1/1969/) — Barzilay & Lapata, Computational Linguistics 2008
- [Sentence Fusion for Multidocument Summarization](https://www.researchgate.net/publication/220355341) — Barzilay & McKeown, Computational Linguistics 2005
- [AIS: Measuring Attribution in NLG Models](https://direct.mit.edu/coli/article/49/4/777/116438/) — Rashkin et al., Computational Linguistics 2023
- [Embrace Divergence: Multi-document Summarization Benchmark](https://aclanthology.org/2024.naacl-long.32/) — Kim et al., NAACL 2024
- [Impact of Format Restrictions on LLM Performance](https://arxiv.org/html/2408.02442v1) — Tam et al., 2024
- [Epistemic Integrity in Large Language Models](https://arxiv.org/abs/2411.06528) — 2024
- [Revisiting Epistemic Markers in Confidence Estimation](https://arxiv.org/html/2505.24778) — 2025
- [When Can LLMs Actually Correct Their Own Mistakes?](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177) — Kamoi et al., TACL 2024
- [DiscoScore: Evaluating with BERT and Discourse Coherence](https://aclanthology.org/2023.eacl-main.278/) — Zhao & Strube, EACL 2023
- [SEVal-Ex: Statement-Level Explainable Summarization Evaluation](https://arxiv.org/abs/2505.02235) — 2025
- [CoCo: Coherence-Enhanced Text Detection with Contrastive Learning](https://aclanthology.org/2023.emnlp-main.1005/) — Liu et al., EMNLP 2023
- [QuestEval: Fact-based Summarization Evaluation](https://aclanthology.org/2021.emnlp-main.529/) — Scialom et al., EMNLP 2021
- [STORM: Writing Wikipedia-like Articles with LLMs](https://arxiv.org/abs/2402.14207) — Shao et al., NAACL 2024
- [DART: Open-Domain Structured Data-to-Text](https://aclanthology.org/2021.naacl-main.37/) — Nan et al., NAACL 2021
- [3A-COT: Attend-Arrange-Abstract for MDS](https://link.springer.com/article/10.1007/s13042-024-02225-0) — IJMLC, 2024
- [PrefixNLI: Detecting Factual Inconsistencies as They Arise](https://arxiv.org/abs/2511.01359) — 2024
- [Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651) — Madaan et al., NeurIPS 2023
- [FACTS Grounding Benchmark](https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/) — Google DeepMind
- [FACTS Benchmark Suite](https://arxiv.org/html/2512.10791v1) — 2025
- [What Works for Lost-in-the-Middle](https://arxiv.org/abs/2511.13900) — 2025
- [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) — Manus, 2025
- [1,200 Production Deployments: LLMOps](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025) — ZenML, 2025
- [457 Case Studies of What Works](https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works) — ZenML, 2025

### Tools, Implementations, and Production Systems

- [FActScore GitHub](https://github.com/shmsw25/FActScore)
- [MiniCheck GitHub](https://github.com/Liyan06/MiniCheck)
- [SAFE / Long-form Factuality GitHub](https://github.com/google-deepmind/long-form-factuality)
- [ALCE GitHub](https://github.com/princeton-nlp/ALCE)
- [AlignScore GitHub](https://github.com/yuh-zha/AlignScore)
- [SemHash (Semantic Deduplication)](https://github.com/MinishLab/semhash)
- [DeBERTa-v3-large-MNLI](https://huggingface.co/potsawee/deberta-v3-large-mnli)
- [LLMxMapReduce GitHub](https://github.com/thunlp/LLMxMapReduce)
- [BooookScore GitHub](https://github.com/lilakk/BooookScore)
- [LangChain Summarization](https://python.langchain.com/docs/how_to/summarize_refine/)
- [Agent Zero Memory Consolidation](https://github.com/agent0ai/agent-zero/blob/main/python/helpers/memory_consolidation.py)
- [Vectara Hallucination Leaderboard](https://github.com/vectara/hallucination-leaderboard)
- [DAE Factuality](https://github.com/tagoyal/dae-factuality)
- [Knowledge Conflicts Survey](https://github.com/pillowsofwind/Knowledge-Conflicts-Survey)
- [Citation-Aware RAG (Tensorlake)](https://www.tensorlake.ai/blog/rag-citations)
- [TOON vs JSON for LLM Pipelines](https://www.tensorlake.ai/blog-posts/toon-vs-json)
- [Perplexity Architecture — ByteByteGo](https://blog.bytebytego.com/p/how-perplexity-built-an-ai-google)
- [Elicit Systematic Review](https://elicit.com/blog/systematic-review/)
- [Consensus on OpenAI](https://openai.com/index/consensus/)
- [NotebookLM RAG Regression](https://discuss.ai.google.dev/t/critical-regression-gemini-3-1-pro-update-feb-19-completely-broke-notebooklm-s-rag-grounding/126857) — Google AI Forum, 2026
- [LangMem SDK](https://blog.langchain.com/langmem-sdk-launch/) — LangChain, 2025
- [Graphiti GitHub](https://github.com/getzep/graphiti) — Zep
- [GraphRAG 1.0](https://www.microsoft.com/en-us/research/blog/moving-to-graphrag-1-0-streamlining-ergonomics-for-developers-and-users/) — Microsoft Research
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [GPT Semantic Cache](https://arxiv.org/abs/2411.05276) — 2024
- [Durable Execution meets AI — Temporal](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)
