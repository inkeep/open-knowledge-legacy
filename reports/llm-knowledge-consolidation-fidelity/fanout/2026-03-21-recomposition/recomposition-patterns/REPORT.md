# Recomposition Patterns: Turning Verified Claims into Coherent Documents

**Date**: 2026-03-21
**Parent report**: llm-knowledge-consolidation-fidelity
**Research question**: How do you turn a bag of verified, deduplicated atomic claims back into a coherent, well-structured document that maintains fidelity, nuance, emphasis, and relationships from the original sources?

---

## Executive Summary

Recomposition — reconstructing coherent prose from atomic claims — is the least-studied and hardest step in knowledge consolidation pipelines. Production systems (Perplexity, Elicit, Google AI Overviews) overwhelmingly **avoid deep synthesis**, opting instead for per-source extractions or shallow composition with heavy citation anchoring. The academic literature offers strong techniques from adjacent fields (data-to-text generation, discourse planning, controlled generation) but no single system solves the full problem.

This report synthesizes findings across 12 research areas to recommend a concrete recomposition strategy for the `/consolidate` skill. The core recommendation is a **four-phase pipeline**: Cluster → Outline → Draft → Verify, with specific techniques at each phase drawn from empirical evidence.

**Key findings**:
1. Outline-first generation produces measurably better structure than direct generation (+25% organization, 3.6x human preference ratio)
2. Prompt chaining (separate draft/critique/refine) achieves 77/100 wins vs single-prompt stepwise approaches, which suffer from "simulated refinement"
3. LLMs systematically inflate confidence during generation — hedging and epistemic markers must be explicitly preserved
4. The decompose→recompose cycle introduces ~8-13% inherent information loss even with best practices
5. Refinement degrades after 2-3 iterations — cap at one critique pass
6. GPT-4 covers only ~40% of diverse multi-source content without explicit claim tracking
7. No production system attempts deep claim→reconcile→synthesize; this is the frontier
8. A 140M-parameter PlanGen model outperformed a 2.8B T5-3B — explicit planning dramatically outweighs model scale
9. MetaFaith prompting achieves 61% improvement in faithful uncertainty expression
10. Multi-Review Fusion-in-Context (FiC) is the closest existing system to our problem — pre-highlighted spans → coherent passage

---

## 1. Claim-to-Document Generation

### 1.1 The Analogous Problem: Data-to-Text

The closest research paradigm to claim recomposition is **data-to-text generation (D2T)** — generating natural language from structured inputs like knowledge graph triples, tables, or key-value pairs. The field's core challenge mirrors ours: bridging the structural gap between input representation and output text.

The **WebNLG challenge** uses RDF triple sets as input and evaluates generated text descriptions. The **DART dataset** (Nan et al., NAACL 2021) provides 82,191 examples of structured data records paired with text, spanning open-domain content from WikiTableQuestions, WikiSQL, and WebNLG [1]. Recent work unifies different structured data types into graph format for pre-training [2].

**Key insight**: Systems that explicitly plan the mapping (which facts go in which sentence, what order) consistently outperform end-to-end approaches. This directly applies to claim recomposition.

### 1.2 How Claim-to-Document Differs

| Aspect | Traditional Text Gen | Claim-to-Document |
|--------|---------------------|-------------------|
| Input | Freeform prompt | Structured set of verified facts |
| Constraint | Open-ended | Must include all claims, introduce nothing |
| Ordering | Model decides freely | Must reflect logical/importance structure |
| Faithfulness | Nice to have | Critical requirement |
| Attribution | Optional | Required for traceability |

The critical difference is the **bidirectional fidelity constraint**: the output must be entailed by the input claims (no hallucination) AND must entail all input claims (no omission). Traditional text generation only loosely targets the first.

---

## 2. Discourse Planning and Content Ordering

### 2.1 Theoretical Foundations

**Rhetorical Structure Theory (RST)** provides the theoretical vocabulary for how claims should relate — elaboration, contrast, cause-effect, condition, sequence [3]. A comprehensive review by Guz & Catal (2020) covers RST's application across NLG tasks [4]. Recent work shows LLMs (Llama 2 70B) achieve state-of-the-art RST discourse parsing [5], meaning RST relations could be automatically identified between claims.

The **Reiter & Dale (2000) NLG architecture** separates document planning (what to say and in what order) from microplanning (how to say it) and surface realization (generating text) [6]. The document planning stage directly maps to our recomposition challenge.

### 2.2 Entity-Based Coherence

Barzilay & Lapata's **Entity Grid** model, inspired by Centering Theory, represents texts as matrices tracking how entities transition between grammatical roles across sentences [7]. Coherent texts exhibit characteristic entity transition patterns. This provides:

- A **signal for claim ordering**: Claims sharing entities should be adjacent
- An **evaluation metric**: Entity grid analysis can detect incoherent orderings in recomposed output

### 2.3 Outline-First Generation

Two complementary lines of evidence support outline-first approaches:

**WritingPath** (Yang et al., 2024): Five-step process generating metadata → outline → augmented outline → final text. Both LLM and human evaluators confirmed superior logical fluency, specificity, and coherence over direct generation [8].

**Planning-augmented generation** (Petrik et al., 2024): Training LLMs with auxiliary planning tasks yields +2.5% ROUGE-Lsum improvement and a 3.60 win/loss ratio in human evaluation, with clear wins in organization, relevance, and verifiability [9].

**Practical implication**: The recomposition prompt should **never** directly generate prose from claims. It should first produce a structural outline that groups and orders claims, then fill each section.

### 2.4 Plan-then-Generate: The Parameter Efficiency Result

Su et al.'s **PlanGen** (2021) separates data-to-text into a content planner and sequence generator. The content planner determines both intra-sentence structure (which claims go in the same sentence) and inter-sentence structure (sentence ordering). A striking finding: **a 140M-parameter PlanGen model outperformed the 2.8B-parameter T5-3B** [34]. This demonstrates that explicit planning is dramatically more parameter-efficient than brute-force scaling — planning is not optional but architecturally necessary.

### 2.5 Aggregation and Sentence Fusion

Simply concatenating atomic claims produces choppy, repetitive prose. Two NLG techniques address this:

**Linguistic aggregation** merges claims sharing constituents: syntactic aggregation ("A went to X" + "A bought Y" → "A went to X and bought Y"), embedding aggregation (subordination), and set aggregation (listing) [35].

**Sentence fusion** (Barzilay & McKeown, 2005) synthesizes common information across multiple sentences via multisequence alignment, creating genuinely new sentences capturing the semantic union of inputs [36]. This is essential when claims were originally decomposed from the same source sentence — fusion can partially reconstruct the original.

These techniques bridge the gap between a sequence of atomic claims and natural prose. The recomposition system should identify aggregation opportunities during the outline phase.

---

## 3. Emphasis and Proportionality

### 3.1 The Coverage Problem

A sobering finding: **GPT-4 only covers ~40% of diverse information on average** when summarizing multiple sources (Kim et al., NAACL 2024) [10]. LLMs exhibit a "lost in the middle" phenomenon, unevenly attending to context and systematically under-representing diverse content.

This means you **cannot rely on the LLM to naturally represent all claims proportionally**. Explicit claim tracking is mandatory.

### 3.2 The Pyramid Method

Nenkova & Passonneau's **Pyramid Method** (HLT-NAACL 2004) provides a direct model for this. Each claim receives a weight equal to the number of sources containing it, creating a Zipfian distribution — a few claims appear everywhere (top tier), many appear once (base tier) [43]. A recomposition system should include all top-tier claims first, then fill remaining space with lower tiers.

### 3.3 Proportionality Strategies

Three competing approaches exist:

**Proportional Representation**: Weight topics by source count. Simple but ignores redundancy — five sources may say the same thing.

**Equal Coverage**: Accounts for redundancy within documents. Proposed as a fairness measure for multi-document summarization [11]. More principled.

**Importance-weighted**: Some topics are inherently more significant regardless of source count.

**DPPs** (Determinantal Point Processes) offer a mathematical framework for balancing relevance and diversity [12].

### 3.4 Models Don't Naturally Get Proportionality Right

DeYoung et al. (TACL 2024) tested whether MDS models properly aggregate information. Key finding: models are **over-sensitive to input ordering** and **under-sensitive to input composition** — changing the ratio of positive to negative evidence barely changes the output [44]. Their fix: **generate-then-select** — produce multiple candidate outputs, then pick the one whose emphasis distribution best matches the input claim distribution.

### 3.5 Recommended Strategy

For `/consolidate`, use a **two-tier approach**:
1. **Claim clustering**: Group related claims, count unique information units per cluster (not raw claim count)
2. **Pyramid-weighted allocation**: Map clusters to output sections with target word counts proportional to Pyramid tier weights
3. **Generate-then-select**: Produce 2-3 candidate recompositions and select the best-calibrated one
4. **Post-hoc audit**: Verify word-count allocation matches intended proportionality

---

## 4. Preserving Nuance During Reassembly

### 4.1 The Confidence Inflation Problem

LLMs systematically fail to preserve uncertainty language. Research demonstrates:

- Models use decisive language even when uncertain, generating hallucinations with "striking confidence" [13]
- Evaluation of five frontier models (Claude Opus 4.5, GPT-5.2, DeepSeek-V3.2, Qwen3-235B, Kimi-K2) found **systematic overconfidence in all models** [14]
- "Faithful response uncertainty" can be formalized as the gap between intrinsic confidence and expressed decisiveness [15]
- Epistemic marker confidence shifts significantly under distribution changes [16]

### 4.2 The RLHF Mechanism

Research on epistemic integrity reveals the root cause: **RLHF training inadvertently rewards confident-sounding responses** over appropriately hedged ones, because human raters rate uncertain-sounding responses as less helpful [37]. When rewriting text, LLMs systematically increase confidence markers ("may cause" → "causes," "preliminary evidence suggests" → "research shows").

### 4.3 Practical Risk

When input claims carry hedging — "preliminary evidence suggests," "in limited studies," "one model showed" — recomposition will naturally **strip these qualifiers** and produce more confident prose. This is a systematic bias baked into the training process, not a random error.

### 4.4 Mitigation Techniques

**MetaFaith** (EMNLP 2025) uses metacognitive prompting to achieve up to **61% improvement in faithfulness of uncertainty expression**, with an 83% win rate over original generations in human evaluation. It is black-box, task-agnostic, and requires no prompt tuning [45].

**Selective Abstraction** (Goren et al., 2026) offers an alternative to binary include/exclude decisions for uncertain claims: replace low-confidence claims with higher-confidence, less-specific abstractions (e.g., "March 15" → "mid-March"). This yields **27.73% improvement in risk-coverage AURC** over simple claim removal [46].

The recomposition prompt must also include **explicit instructions to preserve original epistemic markers**:
- Copy hedging language verbatim from input claims
- Never upgrade "suggests" to "shows" or "indicates" to "demonstrates"
- When synthesizing across sources with different confidence levels, preserve the lowest confidence level
- Post-generation: diff epistemic markers between input claims and output prose

---

## 5. Structured vs Prose Output

### 5.1 Format Impact on Quality

Tam et al. (2024) found that structured output format restrictions (JSON, XML) **significantly degrade reasoning quality**, while improving classification accuracy [17]. This suggests recomposition should use the least restrictive format that meets the use case.

### 5.2 The Hybrid Approach

The most effective recomposition outputs use **hybrid formats** — prose for nuanced synthesis with embedded structured elements:

- **Prose** for: nuanced arguments, contradictory evidence, contextual framing, uncertainty
- **Tables** for: comparisons across sources, quantitative data
- **Lists** for: discrete sequential steps, taxonomies
- **Headers** for: navigability, structural scaffolding

### 5.3 Format Selection Heuristic

| Claim Count | Recommended Format |
|-------------|-------------------|
| < 10 | Prose with inline citations |
| 10-50 | Sectioned prose with headers (from claim clusters) |
| 50+ | Hierarchical document with executive summary |
| Comparison claims | Auto-detect → table |
| Contradictory claims | Always prose (requires careful framing) |

---

## 6. Controlled Text Generation for Faithfulness

### 6.1 Constrained Decoding

**NeuroLogic Decoding** (Lu et al., 2021) enables neural LMs to generate text satisfying complex lexical constraints via predicate logic and beam search modifications [18]. **NeuroLogic A*esque** (2022) extends this with lookahead heuristics [19].

**Key tradeoff**: Hard lexical constraints degrade naturalness. Soft constraints (entailment-based verification) are more practical for recomposition.

### 6.2 Chain of Density as Recomposition Technique

Adams et al.'s **Chain of Density** (CoD) prompting forces entity-level accounting: iteratively incorporating missing salient entities without increasing output length [20]. Key findings:

- Optimal density is intermediate — between vanilla-sparse and maximally-dense
- Fundamental tradeoff between informativeness and readability
- CoD summaries show more fusion and less lead bias

CoD's entity-accounting approach can be adapted: iteratively ensuring all claims are represented while maintaining readability.

### 6.3 Source Anchoring

The Broken Telephone research (see Section 9) demonstrates that **keeping source text available during generation dramatically reduces drift**. For recomposition, this means:

- Include original source excerpts alongside claims in the recomposition prompt
- Don't force the LLM to generate purely from abstracted claims — provide the surrounding context

---

## 7. Draft-Critique-Refine for Recomposition

### 7.1 The Case for Prompt Chaining

Jiang et al. (ACL Findings 2024) provide the definitive comparison. Prompt chaining (separate draft → critique → refine) achieved **77 out of 100 wins** versus stepwise prompting (single prompt) [21].

The critical finding: stepwise prompts produce **"simulated refinement"** — the LLM generates deliberate flaws to demonstrate self-correction within a single response. Initial drafts from chaining performed as well as final drafts from stepwise, despite stepwise critiques having higher precision/recall scores.

**Implication**: Recomposition MUST use separate prompts for draft and critique. Single-prompt "write and self-correct" approaches create artificial errors.

### 7.2 Self-Refine — With a Critical Caveat

Madaan et al.'s **Self-Refine** (NeurIPS 2023) demonstrates the FEEDBACK → REFINE → FEEDBACK loop with ~20% improvement across 7 tasks [22]. However, Huang et al. (ICLR 2024) show that **intrinsic self-correction without external feedback does not reliably improve outputs** and can degrade performance [38]. Kamoi et al. (TACL 2024) find that self-correction works only when: (a) tasks have decomposable, verifiable sub-parts, (b) reliable external feedback is available, or (c) models are fine-tuned for self-correction [39].

Claim-to-document may be one of the "decomposable" tasks where self-correction can work — each claim is independently verifiable. But the critique phase **must use structured verification** (claim checklist + NLI model) rather than open-ended self-assessment. **SummaC** (Laban et al., TACL 2022) addresses this by computing pairwise entailment between source and output sentences [40]. **PrefixNLI** (2024) extends this to detect inconsistencies mid-generation, enabling real-time steering [41].

### 7.3 Context-Aware Merging

Ou & Lapata (ACL 2025) tested three context-enrichment methods for preventing drift during hierarchical merging. **Extract-Support** (using source passages as evidence alongside intermediate drafts) achieved **72.7% claim correctness vs 59.1% for vanilla hierarchical merging** [42]. This confirms that source anchoring during the critique/revision phase — not just during initial drafting — is essential.

### 7.4 Iteration Depth: The 2-3 Limit

Multiple sources converge on the finding that **refinement quality degrades after 2-3 iterations**:
- The Broken Telephone paper shows degradation compounds with each transformation
- LLMxMapReduce-V2 found optimal performance at 3 self-refinement iterations [23]
- Additional passes risk introducing new errors while fixing old ones

**Recommendation**: Cap recomposition at **one critique pass** (draft → critique → single revision). The critique should be a targeted checklist, not open-ended.

### 7.4 What the Critique Should Evaluate

For recomposition, the critique pass should use a **structured checklist**:

1. **Coverage**: Is every input claim represented in the output?
2. **Faithfulness**: Does the output introduce any claims not in the input set?
3. **Nuance**: Are qualifiers, hedges, and uncertainty markers preserved?
4. **Attribution**: Are sources correctly linked to claims?
5. **Coherence**: Do transitions between claim-clusters read naturally?
6. **Proportionality**: Does emphasis match the density of input claims?

---

## 8. Cross-Claim Coherence

### 8.1 Cross-Document Structure Theory (CST)

Radev (2000) defines a taxonomy of cross-document relations that directly applies to claim juxtaposition: **Equivalence** (claims can be merged), **Subsumption** (one claim contains another), **Contradiction** (claims conflict), **Elaboration** (one adds detail), **Attribution** (source matters), **Modality** (certainty differs) [47]. Before recomposing, the system should classify claim pairs by CST relationship and handle each type differently.

### 8.2 Multi-Review Fusion-in-Context (FiC)

Slobodkin et al. (NAACL 2024) created the closest existing system to atomic claim recomposition: FiC takes multiple documents with **pre-highlighted spans** and generates "a coherent passage that includes all and only the highlighted content" [48]. For contradicting claims, the output must aggregate appropriately (e.g., "the service received mixed reviews"). GPT-4 achieved 4.7/5 coherence and 4.5/5 redundancy scores.

### 8.3 The Juxtaposition Problem

Claims that are individually true may require careful framing when placed together:

- **Temporal claims**: "System X was state-of-the-art in 2023" alongside "System Y surpassed X in 2024" — must establish temporal context
- **Contextual claims**: "Technique A works well for short documents" alongside "Technique A fails on long documents" — must establish scope
- **Confidence-varying claims**: "Strong evidence supports X" alongside "Preliminary results suggest Y" — must preserve confidence gradient

### 8.4 Transition Strategies

Effective cross-claim coherence requires RST-informed discourse markers and framing:

1. **Discourse markers**: "However," "In contrast," "Building on this" — RST relations made explicit
2. **Temporal framing**: Establish a clear timeline when claims span time periods
3. **Scope framing**: Explicitly state the conditions under which each claim holds
4. **Source framing**: When claims come from different source types, acknowledge provenance

### 8.5 Entity Consistency

Following Barzilay & Lapata's entity-based coherence model [7], entities should be:
- **Introduced** before being referenced
- **Maintained** across adjacent sentences (not abruptly appearing/disappearing)
- **Referred to consistently** (not switching between "the system," "the tool," "the framework" for the same entity)

---

## 9. The Telephone Game Problem

### 9.1 Empirical Evidence

Mohamed et al. (ACL 2025) provide the most rigorous measurement of distortion through iterative LLM generation [24]:

- **Semantic drift**: Information progressively deviates from source material
- **Factual degradation**: Atomic facts lost or altered
- **Fabrication**: New details emerge (e.g., "lorry driver" → "bus," "$50,000 car" → "$50,000 compensation")
- **Latin script pairs**: -0.004 to -0.011 FActScore per iteration
- **Complex chains** (5 languages): -0.038 ± 0.02 per iteration
- After 100 iterations: factuality collapses to 0.04-0.075

Critical finding: **Rephrasing shows faster degradation than translation** — the decompose→recompose cycle within a single language loses information faster than cross-language translation chains.

### 9.2 Estimated End-to-End Fidelity Budget

Combining DecMetrics [25] and Broken Telephone findings:

| Stage | Estimated Fidelity | Source |
|-------|-------------------|--------|
| Decomposition | 92-94% claim coverage | DecMetrics |
| Deduplication | 0-2% additional loss | Merging may lose nuance |
| Recomposition (single pass, anchored) | 95-98% faithfulness | Broken Telephone mitigated |
| **Combined pipeline** | **~87-92%** | Multiplicative |

~8-13% information loss is inherent. The key is **minimizing transformation depth** and **anchoring each step to source material**.

### 9.3 Mitigation Strategies

| Strategy | Evidence | Impact |
|----------|----------|--------|
| Minimize passes | Each iteration adds -0.004 to -0.04 FActScore | High |
| Source anchoring | Include original text during generation | High |
| Low temperature (0-0.3) | "Extremely low temperatures stabilize outputs" | High |
| Constrained prompts | "More constrained → higher preservation" | Medium |
| Post-hoc verification | FActScore-style check on output | Detection, not prevention |

---

## 10. Attribution in Recomposed Output

### 10.1 The AIS Framework

Rashkin et al.'s **Attributable to Identified Sources (AIS)** framework defines that NLG output pertaining to the external world must be verifiable against provided sources [26]. NLI-based models serve as automated AIS metrics.

### 10.2 ALCE Benchmark Results

The ALCE benchmark (Gao et al., EMNLP 2023) evaluates citation quality via recall and precision using NLI verification [27]. **Even the best models lack complete citation support 50% of the time** on ELI5. Chain-of-thought reasoning improves citation accuracy [28].

### 10.3 Production System Patterns

| System | Citation Style | Granularity |
|--------|---------------|-------------|
| Perplexity | Inline footnotes [1] with expandable snippets | Per-claim |
| Google AI Overviews | Card-based citations with grounding metadata | Per-segment |
| Elicit | Quotes/tables from source papers | Per-extraction |

### 10.4 Recommended Citation Strategy

For `/consolidate`:
- **Format**: Inline numerical citations `[1]` with end-of-document sources section
- **Granularity**: Per-claim (each claim carries its source)
- **Multi-source**: Use `[1,3,5]` format for claims supported by multiple sources
- **Density**: Every factual claim cited; transition prose and structural framing uncited
- **Verification**: Post-hoc NLI check that cited sources actually support the claims attributed to them

---

## 11. Evaluation of Recomposition Quality

### 11.1 Beyond Factual Fidelity

Recomposition quality requires evaluating coherence, readability, structure, emphasis, and whether the output reads as original writing vs patchwork.

**Coherence**: **DiscoScore** (Zhao & Strube, EACL 2023) uses BERT and discourse coherence theory. Surpasses BARTScore by >10 correlation points at system level [29].

**Multi-dimensional quality**: **UniEval** (Zhong et al., EMNLP 2022) recasts coherence, consistency, fluency, and relevance as Boolean QA tasks. 23% correlation improvement over BARTScore on SummEval [30].

**LLM-as-judge**: **G-Eval** (Liu et al., EMNLP 2023) uses GPT-4 with chain-of-thought prompting for evaluation, achieving 0.514 Spearman correlation with human judgments — outperforming all prior automated methods. Custom criteria can be defined for claim recomposition (e.g., "Does the text integrate facts naturally without feeling like a list?") [49].

**Factual verification at scale**: **SAFE** (Google DeepMind, NeurIPS 2024) breaks responses into individual facts and evaluates each via multi-step reasoning with search queries. Agrees with humans 72% of the time; on disagreements, SAFE is correct 76%. Over **20x cheaper than human annotation** [50].

**Emphasis accuracy**: **QuestEval** (Scialom et al., EMNLP 2021) generates questions from source and output, checks answerability in both directions. Its **Weighter module** selects questions about important facts, providing a signal for emphasis accuracy [51].

**Statement-level alignment**: **SEVal-Ex** (2025) decomposes output into atomic statements and aligns them against source. Achieves 0.580 correlation with human consistency judgments, surpassing GPT-4-based evaluators (0.521). Directly parallels the claim-to-document pipeline [52].

**Patchwork detection**: **CoCo** (Liu et al., EMNLP 2023) constructs coherence graphs and uses contrastive learning to detect whether text reads as stitched together. The coherence graph patterns serve as a quality diagnostic [53]. Additional proxy signals: lexical diversity inconsistency, entity grid discontinuities, and high per-sentence perplexity variance.

### 11.2 Recommended Evaluation Stack

| Dimension | Metric | What It Catches |
|-----------|--------|----------------|
| Factual fidelity | FActScore / SAFE | Hallucination, omission |
| Coherence | DiscoScore (DS_Focus) | Incoherent transitions |
| Multi-dimensional | UniEval or G-Eval | Overall quality (coherence, consistency, fluency, relevance) |
| Coverage | SEVal-Ex / claim-level NLI | Missing claims |
| Attribution | ALCE-style recall/precision | Citation errors |
| Emphasis | QuestEval (Weighter) | Disproportionate coverage |
| Patchwork | CoCo coherence graph | Stitched-together feeling |
| Readability | MAUVE / Flesch-Kincaid | Dense/unreadable output |

---

## 12. Existing Implementations

### 12.1 The Production Gap

The most striking finding across all research: **no production system attempts deep claim→reconcile→synthesize**. Systems either:

1. **Present per-source extractions** (Elicit, Consensus)
2. **Pick winners** among sources
3. **Shallow synthesis** with heavy citation anchoring (Perplexity, Google)

This is the frontier `/consolidate` targets.

### 12.2 Academic Systems Closest to Our Problem

| System | Approach | Key Innovation | Limitation |
|--------|----------|---------------|------------|
| STORM [31] | Perspective-guided research → outline → article | Multi-perspective discourse simulation | "Source bias transfer and over-association" |
| LLMxMapReduce-V2 [23] | Entropy-driven skeleton refinement → topology-aware generation | Leaf vs parent node differentiation | Requires extremely long input |
| NexusSum [32] | Preprocessor → Summarizer → Compressor with rollback | Iterative compression with rollback on overshoot | Narrative-focused, not knowledge synthesis |
| FiC [48] | Pre-highlighted spans → coherent fused passage | Explicit contradiction handling in synthesis | Review-domain focused |
| 3A-COT [54] | Attend → Arrange → Abstract chain-of-thought | Explicitly models contradictions, redundancies, and complementarities between claims | MDS-focused |
| Chain of Density [20] | Iterative entity-accounting densification | Forced entity coverage without length increase | Single-document only |

---

## Recommended Recomposition Strategy for `/consolidate`

Based on the evidence, the `/consolidate` skill should implement a **four-phase recomposition pipeline**:

### Phase 1: Cluster & Allocate

**Input**: Set of verified, deduplicated atomic claims with source attribution and metadata (hedging level, confidence, temporal context).

1. **Topic clustering**: Group claims by semantic similarity (embedding-based clustering)
2. **Hierarchy construction**: Identify parent-child relationships between claim clusters (some clusters elaborate on others)
3. **Proportionality allocation**: Assign target word counts per cluster based on unique information density (not raw claim count)
4. **Format detection**: Auto-detect comparison claims (→ table), sequential claims (→ list), nuanced/contradictory claims (→ prose)

### Phase 2: Outline Generation (Separate Prompt)

Generate a structural outline from the claim clusters:
- Section headers derived from cluster topics
- Sub-sections from cluster hierarchy
- Claim IDs mapped to outline nodes (which claims go where)
- Transition notes between sections (discourse relations: contrast, elaboration, sequence)
- Format annotations per section (prose, table, list, hybrid)

This outline is the **planning artifact** that bridges claims and prose.

### Phase 3: Section-by-Section Draft (Separate Prompt per Section)

For each outline section, generate prose constrained by:
- The specific claims assigned to that section (provided as a literal checklist)
- Source attribution requirements (inline `[n]` citations)
- Explicit hedging preservation instructions ("preserve all epistemic markers verbatim")
- The target word count for the section
- Adjacent section summaries for transition coherence
- Original source excerpts for anchoring (reduce telephone-game drift)

**Temperature**: 0-0.3 for maximum fidelity.

Generate sections independently to prevent cross-contamination, then join.

### Phase 4: Verify & Critique (Separate Prompt)

Single critique pass using a **structured checklist**:

1. **Coverage audit**: For each input claim, does the output contain it? (Claim-level NLI)
2. **Faithfulness audit**: Does the output introduce unsupported claims? (Reverse NLI)
3. **Nuance check**: Are all hedging/uncertainty markers preserved?
4. **Attribution check**: Do cited sources actually support the attributed claims?
5. **Coherence scan**: Do cross-section transitions read naturally?
6. **Proportionality check**: Does word allocation match intended distribution?

Fix identified issues in a **single revision pass**. Do not iterate further — diminishing returns after one critique.

### Design Principles

1. **Separate prompts for each phase** — prompt chaining beats stepwise (77/100 wins)
2. **Maximum 2 total passes** — draft + one critique/revision (degradation after 2-3 iterations)
3. **Source anchoring** — include original text alongside claims (reduces telephone-game drift)
4. **Explicit claim checklist** — GPT-4 covers only ~40% of diverse content without tracking
5. **Low temperature** — fidelity over creativity
6. **Hybrid output format** — prose for nuance, tables for comparison
7. **Per-claim attribution** — inline citations following Perplexity/ALCE patterns
8. **Hedging preservation** — explicit instructions to copy epistemic markers verbatim

---

## Sources

[1] Nan et al. (2021). "DART: Open-Domain Structured Data Record to Text Generation." NAACL 2021. https://aclanthology.org/2021.naacl-main.37/

[2] Li et al. (2024). "Unifying Structured Data as Graph for Data-to-Text Pre-Training." *TACL*. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00641/119991/

[3] Mann, W.C. & Thompson, S.A. (1988). "Rhetorical Structure Theory." https://www.sfu.ca/rst/

[4] Guz & Catal (2020). "Rhetorical structure theory: A comprehensive review." *Expert Systems with Applications*. https://www.sciencedirect.com/science/article/abs/pii/S0957417420302451

[5] Liu et al. (2024). "Can we obtain significant success in RST discourse parsing by using Large Language Models?" EACL 2024. https://aclanthology.org/2024.eacl-long.171/

[6] Reiter, E. & Dale, R. (2000). *Building Natural Language Generation Systems*. Cambridge University Press.

[7] Barzilay, R. & Lapata, M. (2008). "Modeling Local Coherence: An Entity-Based Approach." *Computational Linguistics*, 34(1). https://direct.mit.edu/coli/article/34/1/1/1969/

[8] Yang et al. (2024). "Navigating the Path of Writing: Outline-guided Text Generation with Large Language Models." https://arxiv.org/abs/2404.13919

[9] Petrik et al. (2024). "Integrating Planning into Single-Turn Long-Form Text Generation." https://arxiv.org/abs/2410.06203

[10] Kim et al. (2024). "Embrace Divergence for Richer Insights: A Multi-document Summarization Benchmark." NAACL 2024. https://aclanthology.org/2024.naacl-long.32/

[11] (2024). "Coverage-based Fairness in Multi-document Summarization." https://arxiv.org/abs/2412.08795

[12] Hosking et al. (2025). "Principled Content Selection to Generate Diverse and Personalized Multi-Document Summaries." ACL 2025. https://arxiv.org/abs/2505.21859

[13] Xiong et al. (2024). "Can Large Language Models Faithfully Express Their Intrinsic Uncertainty in Words?" https://arxiv.org/abs/2405.16908

[14] (2025). "Revisiting Epistemic Markers in Confidence Estimation." https://arxiv.org/html/2505.24778

[15] (2025). "Anthropomimetic Uncertainty: What Verbalized Uncertainty in Language Models is Missing." https://arxiv.org/html/2507.10587v1

[16] (2025). "Humans overrely on overconfident language models, across languages." https://arxiv.org/html/2507.06306

[17] Tam et al. (2024). "Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models." https://arxiv.org/html/2408.02442v1

[18] Lu et al. (2021). "NeuroLogic Decoding: (Un)supervised Neural Text Generation with Predicate Logic Constraints." NAACL 2021. https://aclanthology.org/2021.naacl-main.339.pdf

[19] Lu et al. (2022). "NeuroLogic A*esque Decoding: Constrained Text Generation with Lookahead Heuristics." NAACL 2022. https://aclanthology.org/2022.naacl-main.57/

[20] Adams et al. (2023). "From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting." NewSum@EMNLP 2023. https://arxiv.org/abs/2309.04269

[21] Jiang et al. (2024). "Prompt Chaining or Stepwise Prompt? Refinement in Text Summarization." ACL Findings 2024. https://aclanthology.org/2024.findings-acl.449/

[22] Madaan et al. (2023). "Self-Refine: Iterative Refinement with Self-Feedback." NeurIPS 2023. https://arxiv.org/abs/2303.17651

[23] (2025). "LLM×MapReduce-V2: Entropy-Driven Convolutional Test-Time Scaling for Generating Long-Form Articles from Extremely Long Resources." https://arxiv.org/abs/2504.05732

[24] Mohamed et al. (2025). "LLM as a Broken Telephone: Iterative Generation Distorts Information." ACL 2025. https://arxiv.org/abs/2502.20258

[25] (2025). "DecMetrics: Structured Claim Decomposition Scoring for Factually Consistent LLM Outputs." https://arxiv.org/abs/2509.04483

[26] Rashkin et al. (2023). "Measuring Attribution in Natural Language Generation Models." *Computational Linguistics*, 49(4). https://direct.mit.edu/coli/article/49/4/777/116438/

[27] Gao et al. (2023). "Enabling Large Language Models to Generate Text with Citations." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.398/

[28] (2024). "Chain-of-Thought Improves Text Generation with Citations in Large Language Models." AAAI 2024. https://ojs.aaai.org/index.php/AAAI/article/view/29794/31374

[29] Zhao & Strube (2023). "DiscoScore: Evaluating Text Generation with BERT and Discourse Coherence." EACL 2023. https://aclanthology.org/2023.eacl-main.278/

[30] Zhong et al. (2022). "Towards a Unified Multi-Dimensional Evaluator for Text Generation." EMNLP 2022. https://aclanthology.org/2022.emnlp-main.131.pdf

[31] Shao et al. (2024). "Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models." NAACL 2024. https://arxiv.org/abs/2402.14207

[32] (2025). "NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization." https://arxiv.org/abs/2505.24575

[33] Min et al. (2023). "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.741/

[34] Su et al. (2021). "Plan-then-Generate: Controlled Data-to-Text Generation via Planning." https://ar5iv.labs.arxiv.org/html/2108.13740

[35] Dalianis (1999). "Aggregation in Natural Language Generation." *Computational Intelligence*, 15(4). See also Reiter & Dale (2000).

[36] Barzilay & McKeown (2005). "Sentence Fusion for Multidocument News Summarization." *Computational Linguistics*, 31(3). https://www.researchgate.net/publication/220355341

[37] (2024). "Epistemic Integrity in Large Language Models." https://arxiv.org/abs/2411.06528

[38] Huang et al. (2024). "Large Language Models Cannot Self-Correct Reasoning Yet." ICLR 2024. https://arxiv.org/abs/2310.01798

[39] Kamoi et al. (2024). "When Can LLMs Actually Correct Their Own Mistakes?" TACL 2024. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177

[40] Laban et al. (2022). "SummaC: Re-Visiting NLI-based Models for Inconsistency Detection in Summarization." TACL. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00453/109470

[41] (2024). "PrefixNLI: Detecting Factual Inconsistencies as Soon as They Arise." https://arxiv.org/abs/2511.01359

[42] Ou & Lapata (2025). "Context-Aware Hierarchical Merging for Long Document Summarization." ACL Findings 2025. https://arxiv.org/abs/2502.00977

[43] Nenkova & Passonneau (2004). "Evaluating Content Selection in Summarization: The Pyramid Method." HLT-NAACL 2004. http://www.cs.columbia.edu/~ani/papers/pyramid.pdf

[44] DeYoung et al. (2024). "Do Multi-Document Summarization Models Synthesize?" TACL 2024. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00687/124262

[45] MetaFaith (2025). "Faithful Natural Language Uncertainty Expression in LLMs." EMNLP 2025. https://arxiv.org/abs/2505.24858

[46] Goren et al. (2026). "When Should LLMs Be Less Specific? Selective Abstraction for Reliable Long-Form Text Generation." https://arxiv.org/abs/2602.11908

[47] Radev (2000). "A Common Theory of Information Fusion from Multiple Text Sources." ACL/SIGDIAL 2000. https://www.semanticscholar.org/paper/7d567a104ed5e206229c6d98e4190135f336448d

[48] Slobodkin et al. (2024). "Multi-Review Fusion-in-Context." NAACL 2024 Findings. https://arxiv.org/abs/2403.15351

[49] Liu et al. (2023). "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.153/

[50] Wei et al. (2024). "Long-form factuality in large language models." NeurIPS 2024. https://arxiv.org/abs/2403.18802

[51] Scialom et al. (2021). "QuestEval: Summarization Asks for Fact-based Evaluation." EMNLP 2021. https://aclanthology.org/2021.emnlp-main.529/

[52] (2025). "SEVal-Ex: Statement-Level Explainable Summarization Evaluation." https://arxiv.org/abs/2505.02235

[53] Liu et al. (2023). "CoCo: Coherence-Enhanced Machine-Generated Text Detection Under Low Resource With Contrastive Learning." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.1005/

[54] (2024). "3A-COT: An Attend-Arrange-Abstract Chain-of-Thought for Multi-Document Summarization." *International Journal of Machine Learning and Cybernetics*. https://link.springer.com/article/10.1007/s13042-024-02225-0
