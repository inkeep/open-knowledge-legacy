# Atomic Fact Decomposition & Factuality Verification for Knowledge Consolidation

**Research area:** D2 (Atomic Fact Decomposition & Claim-Level Extraction) and D3 (Factuality Verification & Grounding)
**Parent report:** LLM Knowledge Consolidation with Factual Fidelity
**Date:** 2026-03-21
**Status:** Initial deep research

---

## Executive Summary

Atomic fact decomposition and factuality verification are the two mechanical pillars of high-fidelity knowledge consolidation. Decomposition converts source material into a normalized claim inventory; verification ensures the consolidated output faithfully represents those claims. This report synthesizes findings from 15+ primary sources across both areas, organized for direct applicability to a generalizable `/consolidate` skill.

**Key actionable findings:**

1. **FActScore's decompose-then-verify pattern** is the foundational architecture, but must be adapted from evaluation-only to active consolidation (decompose → deduplicate → resolve → recompose → verify).
2. **Iterative extraction** (AFEV) outperforms one-shot decomposition by conditioning each fact extraction on prior verified facts, reducing error accumulation — critical for long/complex sources.
3. **Extractive decomposition preserves provenance** (JEDI) while abstractive decomposition enables cross-source normalization. A hybrid approach is optimal for consolidation.
4. **MiniCheck provides GPT-4-level verification at 400x lower cost** (770M params, 74.7% balanced accuracy), making claim-by-claim verification economically viable.
5. **No single verification method is sufficient** — a tiered pipeline (MiniCheck → LLM-as-judge → human/search escalation) balances cost vs. accuracy.
6. **Inter-context conflicts are poorly handled by LLMs** by default. Explicit conflict detection, source trust weighting, and transparent conflict surfacing are required.

---

## D2: Atomic Fact Decomposition & Claim-Level Extraction

### 2.1 What Constitutes an "Atomic Fact"

An atomic fact is a minimal, independent piece of information that can be individually verified as true or false. FActScore ([Min et al., EMNLP 2023](https://arxiv.org/abs/2305.14251)) operationalizes this by decomposing sentences into claims where each contains exactly one verifiable assertion.

**Example decomposition:**
> "Thierry Henry is a French professional football coach and pundit"

Decomposes to:
- "Thierry Henry is French"
- "Thierry Henry is a football coach"
- "Thierry Henry is a football pundit"

Atomic-SNLI ([arXiv 2025](https://arxiv.org/abs/2601.06528)) quantifies the distribution: in their SNLI analysis, 89.2% of hypotheses contain only a single atomic fact, while only 0.3% contain 4 or more. This suggests most natural sentences are already near-atomic, but multi-fact sentences require decomposition for reliable verification.

### 2.2 The FActScore Pipeline: Mechanical Details

The FActScore pipeline operates in four stages:

**Stage 1 — Decomposition:** An LLM (InstructGPT/ChatGPT) receives a sentence and a prompt template instructing it to extract all atomic facts. Each fact is reformulated to be self-contained (replacing pronouns with entities).

**Stage 2 — Retrieval:** A GTR-based dense passage retriever fetches relevant knowledge snippets from a configurable knowledge source (default: Wikipedia dump). Custom sources supported via `.jsonl` with title/text pairs.

**Stage 3 — Verification:** Each atomic fact is paired with retrieved evidence and classified as Supported, Not-supported, or Irrelevant. Two verifier options: `retrieval+ChatGPT` and `retrieval+llama+npm`, achieving 0.99 Pearson correlation.

**Stage 4 — Scoring:** FActScore = percentage of supported atomic facts. Achieves <2% error vs. human annotation.

**For consolidation**, this pipeline inverts: instead of evaluating a generation against a knowledge source, we decompose source documents into atomic facts and then use verification to check the consolidated output against them.

> **Source:** [FActScore GitHub](https://github.com/shmsw25/FActScore) · [Paper](https://arxiv.org/abs/2305.14251) · Evidence: [factscore-decomposition.md](evidence/factscore-decomposition.md)

### 2.3 Extractive vs. Abstractive Decomposition

This is the central tradeoff for consolidation fidelity.

**Abstractive decomposition** (FActScore, AFEV) generates new natural language statements. Advantages: normalizes terminology, enables cross-source comparison. Risk: the generation step can introduce hallucinated content or subtle semantic drift.

**Extractive decomposition** (JEDI, [EMNLP 2025](https://arxiv.org/abs/2509.18901)) identifies spans in the source text that correspond to atomic facts. Advantages: zero hallucination risk, trivial provenance tracking (exact character offsets). Limitations: cannot normalize across sources using different terminology, harder to deduplicate.

| Dimension | Extractive | Abstractive |
|-----------|-----------|-------------|
| Source fidelity | High — exact wording | Medium — may drift |
| Hallucination risk | None | Present |
| Cross-source normalization | Poor | Good |
| Deduplication support | Harder | Easier |
| Provenance tracking | Trivial (span offsets) | Requires metadata |
| Computational cost | Lower (encoder-only) | Higher (generative) |

**JEDI performance:** 65.6% accuracy on ANLI (vs. 67.7% for generative FGLR), but 76.9% on adversarial HANS robustness test — demonstrating that extractive approaches are more robust despite slightly lower in-distribution accuracy.

**Recommendation for consolidation:** Use a **hybrid approach** — extractive decomposition to preserve source fidelity and provenance, with optional abstractive normalization solely for deduplication matching. Maintain both the original span reference and normalized form in the claim inventory.

> **Source:** [JEDI paper](https://arxiv.org/abs/2509.18901) · Evidence: [extractive-vs-abstractive-jedi.md](evidence/extractive-vs-abstractive-jedi.md)

### 2.4 Iterative Extraction: Mitigating Error Accumulation

Static (one-shot) decomposition fails on complex, multi-hop claims because it prioritizes syntactic fragmentation over contextual understanding. AFEV ([Expert Systems with Applications, 2025](https://arxiv.org/abs/2506.07446)) introduces an iterative extract-verify loop:

At iteration *t*:
```
Fₜ = Extractor(C, F₁:ₜ₋₁, y₁:ₜ₋₁, r₁:ₜ₋₁)
```
where C = original claim, F = prior facts, y = verification labels, r = rationales.

**Mechanism:** Each extraction is conditioned on previously verified facts and their rationales. The rationale feedback reveals implicit entity relationships that refine subsequent decompositions. Example: Fact₂ replaces "football club" with "FC Barcelona" based on Fact₁'s verification rationale.

**Quantified improvement:** Iterative extraction achieves 78.74 vs. 77.04 accuracy (one-shot) on HOVER. AFEV achieves SOTA on 5 benchmarks (LIAR-PLUS: 83.12 F1, HOVER: 78.76 F1).

**Efficiency:** 0.94 hours for full HOVER test set. Two-stage retrieval (bi-encoder → cross-encoder reranking) keeps latency manageable.

**For consolidation:** The iterative pattern is directly applicable to source decomposition. When processing a long document, each fact extraction benefits from the context established by previously extracted and verified facts, producing more coherent and complete claim inventories. The coverage assessment mechanism (deciding when decomposition is complete) prevents premature termination.

> **Source:** [AFEV paper](https://arxiv.org/abs/2506.07446) · Evidence: [afev-iterative-extraction.md](evidence/afev-iterative-extraction.md)

### 2.5 Decomposition DURING Consolidation

The literature primarily uses decomposition for evaluation (checking an existing output). For consolidation, decomposition becomes a construction tool. The proposed pipeline:

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

This inverts the FActScore pattern: instead of decomposing the output to check it, we decompose the *inputs* to build from them.

### 2.6 Claim-Level Deduplication

Detecting semantically equivalent claims across sources requires going beyond lexical matching.

**Traditional methods** (minhash, simhash) operate on character/word n-grams — they miss semantic duplicates with different wording.

**Semantic approaches:**
- **SemHash** ([GitHub](https://github.com/MinishLab/semhash)): Lightweight Python library for semantic deduplication at scale. Uses sentence embeddings + cosine similarity.
- **Fine-tuned transformers**: Achieve up to 28% improvement in recall vs. traditional methods (sBERT models for semantic evaluation).

**Recommended deduplication pipeline for consolidation:**
1. Decompose all sources into atomic claims (with provenance metadata)
2. Embed each claim using sentence transformer (e.g., all-MiniLM-L6-v2)
3. Cluster by cosine similarity (threshold ~0.85-0.92)
4. Within each cluster: verify semantic equivalence via NLI entailment check
5. Select representative claim, retain all source attributions
6. Flag near-duplicates with subtle semantic differences for conflict resolution

### 2.7 Handling Conflicting Claims

The Knowledge Conflicts survey ([Xu et al., EMNLP 2024](https://arxiv.org/abs/2403.08319)) identifies **inter-context conflicts** as the category most relevant to multi-source consolidation. Key findings:

- LLMs exhibit poor contradiction detection abilities by default
- Models display confirmation bias, favoring evidence aligned with parametric memory
- Performance degrades as conflicting reasoning chains lengthen
- No inherent confidence weighting by source reliability exists

**Conflict resolution strategies for consolidation:**

| Strategy | When to Use | Mechanism |
|----------|-------------|-----------|
| Source trust weighting | Sources have known reliability tiers | Prefer higher-trust source |
| Temporal recency | Time-sensitive facts | Prefer newer information |
| Consensus voting | Multiple independent sources | Count supporting sources |
| Transparent surfacing | High-stakes, ambiguous conflicts | Present all variants with sources |
| Confidence-weighted merge | Verification scores available | Select highest-confidence variant |

The **Contradiction to Consensus** framework ([arXiv 2025](https://arxiv.org/abs/2602.18693)) demonstrates that dual-perspective retrieval (generating negated counterparts of claims) improves conflict detection accuracy by 2-10%. Multi-source aggregation provides 29-69% relative gains over single-source verification.

> **Source:** [Knowledge Conflicts Survey](https://arxiv.org/abs/2403.08319) · [Contradiction to Consensus](https://arxiv.org/abs/2602.18693) · Evidence: [knowledge-conflicts-taxonomy.md](evidence/knowledge-conflicts-taxonomy.md), [multi-source-conflict-resolution.md](evidence/multi-source-conflict-resolution.md)

### 2.8 Structured Agent Outputs vs. Unstructured Sources

Decomposition strategies should adapt to source type:

| Dimension | Structured Agent Outputs | Unstructured Articles/Books |
|-----------|------------------------|---------------------------|
| Claim density | High — agents typically produce claim-rich output | Variable — narrative may bury claims in context |
| Decomposition difficulty | Lower — statements tend toward atomic already | Higher — requires disentangling from rhetoric |
| Trust level | Higher — generated from controlled prompts | Variable — requires verification |
| Provenance | Known (agent ID, prompt, timestamp) | May be ambiguous (author, publication, date) |
| Conflicts | Less likely within single agent; possible across agents | Common across sources |
| Recommended approach | Light decomposition + direct extraction | Full iterative decomposition |

---

## D3: Factuality Verification & Grounding

### 3.1 NLI-Based Verification

Natural Language Inference classifies premise-hypothesis pairs as Entail/Neutral/Contradict. Applied to verification: premise = source document, hypothesis = claim from consolidated output.

**Key models:**
- **DeBERTa-v3-large-MNLI**: Trained on 433k MultiNLI pairs. Uses disentangled attention. Available on HuggingFace ([potsawee/deberta-v3-large-mnli](https://huggingface.co/potsawee/deberta-v3-large-mnli)).
- **AlignScore** ([ACL 2023](https://arxiv.org/abs/2305.16739)): Unified alignment function trained on 4.7M examples from 7 tasks. 355M params. Matches GPT-4 on 22 evaluation datasets. More robust across diverse factual inconsistency types than single-task NLI.

**Critical limitation:** Research shows 84% of factually supporting pairs do NOT map to NLI entailment, and 63% of factually undermining pairs do NOT constitute NLI contradiction ([Kavtaradze, 2024](https://arxiv.org/abs/2406.16842)). NLI captures a narrower relationship than "factual support." This means NLI alone will miss many real factual consistency issues.

**Strengths:** Fast, cheap (runs locally), well-understood, good at catching direct contradictions.
**Weaknesses:** Misses omissions, struggles with multi-sentence reasoning, poor on nuanced factual drift.

> **Source:** [AlignScore](https://arxiv.org/abs/2305.16739) · [DeBERTa-v3-large-MNLI](https://huggingface.co/potsawee/deberta-v3-large-mnli) · Evidence: [nli-verification-approaches.md](evidence/nli-verification-approaches.md)

### 3.2 MiniCheck: Cost-Effective Grounding Verification

MiniCheck ([Tang et al., EMNLP 2024](https://arxiv.org/abs/2404.10774)) achieves GPT-4-level fact-checking at 400x lower cost.

**Architecture:** MiniCheck-FT5 fine-tunes Flan-T5-Large (770M params) on 14,395 synthetically generated training instances (two methods: Claim-to-Document and Document-to-Claim). The structured generation creates realistic yet challenging factual errors.

**Performance:** 74.7% balanced accuracy (vs. GPT-4's 75.3%) on LLM-AggreFact benchmark (13,128 instances across 10 datasets covering news, dialogue, science, healthcare).

**Process:** Binary classification — `Does document D support claim c?` Takes maximum score across multiple documents per sentence. Threshold at 0.5.

**Cost:** ~$0.24 vs. ~$107 for GPT-4 on the test set.

**For consolidation:** MiniCheck is the optimal first-pass verification engine. It can check each claim in consolidated output against source documents at minimal cost. Its binary output (supported/unsupported) integrates cleanly with claim-level tracking. The multi-document max-score approach handles claims that synthesize across sources.

> **Source:** [MiniCheck paper](https://arxiv.org/abs/2404.10774) · [GitHub](https://github.com/Liyan06/MiniCheck) · Evidence: [minicheck-architecture.md](evidence/minicheck-architecture.md)

### 3.3 LLM-as-Judge Verification

Using a capable LLM (GPT-4 class) as a factual consistency judge.

**Effective prompting strategies ([Survey, 2024](https://arxiv.org/abs/2411.15594)):**
- **Chain-of-thought**: Explain reasoning before verdict. Improves quality and enables debugging.
- **Few-shot**: Including examples increases GPT-4 consistency from 65.0% to 77.5%.
- **Binary evaluation**: "Supported"/"Not supported" more reliable than numeric scoring.
- **Meta-judging**: Three-stage pipeline (judge → meta-evaluate → select trustworthy outputs) yields 15.55% precision increase.

**Performance:** Advanced LLMs achieve Pearson correlations up to 0.85 with expert judgment. Significant deviations remain on ambiguous or complex tasks.

**Limitations:**
- Inherent noise in judgments → biased evaluations if uncorrected
- Position bias and self-preference bias
- Expensive for large-scale verification
- Rating indeterminacy: forced-choice eliminates uncertainty information

**Trust or Escalate** ([ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/file/08dabd5345b37fffcbe335bd578b15a0-Paper-Conference.pdf)): Framework where judges express uncertainty and escalate difficult cases, improving reliability by routing ambiguous cases upward.

**Unique advantage for consolidation:** LLM-as-judge can verify both factual accuracy AND information completeness — unlike NLI/MiniCheck which only check what's present. For consolidation, completeness checking is critical (are important facts from sources missing in output?).

> **Source:** [LLM-as-Judge Survey](https://arxiv.org/abs/2411.15594) · Evidence: [llm-as-judge-verification.md](evidence/llm-as-judge-verification.md)

### 3.4 SAFE: Search-Augmented Verification

SAFE ([Wei et al., NeurIPS 2024](https://arxiv.org/abs/2403.18802)) from Google DeepMind uses an LLM agent that iteratively queries Google Search to verify facts.

**Pipeline:**
1. **Decompose**: Split long-form response into individual facts; replace vague references with entities
2. **Search**: For each fact, agent generates search queries and iteratively queries Google Search
3. **Verify**: Agent reasons whether search evidence supports, contradicts, or is irrelevant to the claim

**Performance:** Agrees with human annotators 72% of the time. On disagreements, SAFE wins 76%. 20x cheaper than human annotators.

**Key distinction from source-grounded methods:** SAFE verifies against the open web, not against specific source documents. This makes it suitable for verifying claims that go beyond provided sources, or for checking whether consolidated claims are factually accurate in an absolute sense.

> **Source:** [SAFE paper](https://arxiv.org/abs/2403.18802) · [GitHub](https://github.com/google-deepmind/long-form-factuality) · Evidence: [safe-pipeline.md](evidence/safe-pipeline.md)

### 3.5 Source Attribution & Citation Tracking

Maintaining provenance through the consolidation pipeline requires tracking which source supports each claim in the output.

**ALCE benchmark** ([Gao et al., EMNLP 2023](https://arxiv.org/abs/2305.14627)): First benchmark for evaluating citation quality in LLM outputs. Evaluates fluency, correctness, and citation quality. Key finding: even the best models lack complete citation support 50% of the time.

**Citation-Aware RAG** ([Tensorlake](https://www.tensorlake.ai/blog/rag-citations)): Demonstrates an unbroken provenance chain: source document → parsed elements with spatial anchors → anchored chunks → retrieved context → LLM output → resolved citations with exact locations.

**SourceCheckup** ([Nature Communications, 2025](https://www.nature.com/articles/s41467-025-58551-6)): Automated evaluation finds 50-90% of LLM responses are not fully supported by their cited sources.

**Practical patterns for consolidation:**

1. **Claim-Source Index**: Assign each decomposed claim a `(source_id, location)` tuple. Carry tuples as metadata through consolidation. Final output includes attribution per statement.

2. **Dual Representation**: Store both original source span (extractive) and normalized claim (abstractive). Use normalized for dedup/merge; preserve original for attribution.

3. **Post-hoc Attribution Verification**: After generating output, verify each attribution using NLI/MiniCheck. Flag claims where cited source doesn't actually support the statement.

> **Source:** [ALCE](https://arxiv.org/abs/2305.14627) · [SourceCheckup](https://www.nature.com/articles/s41467-025-58551-6) · Evidence: [source-attribution-rag.md](evidence/source-attribution-rag.md)

### 3.6 Post-Consolidation Verification Pipeline

No single method handles all verification needs. The research points to a **tiered pipeline**:

```
Consolidated output
  │
  ├─ Step 1: Decompose output into atomic claims
  │
  ├─ Step 2: For each claim, check attribution
  │   └─ Does the cited source actually support this claim?
  │   └─ Tool: MiniCheck (fast, cheap, 74.7% accuracy)
  │   └─ Result: SUPPORTED → accept; UNSUPPORTED → escalate
  │
  ├─ Step 3: Escalated claims → LLM-as-judge with CoT
  │   └─ Receives claim + source text + reasoning instruction
  │   └─ Result: SUPPORTED → accept; CONTRADICTED → flag; UNCERTAIN → escalate
  │
  ├─ Step 4: Completeness check
  │   └─ Compare claim inventory (from source decomposition) against output claims
  │   └─ Identify important source claims not present in output
  │   └─ Tool: LLM-as-judge (uniquely capable of completeness assessment)
  │
  ├─ Step 5 (optional): External verification
  │   └─ SAFE-style web search for claims from low-trust sources
  │   └─ Independent corroboration of critical claims
  │
  └─ Output: Verified consolidated text with confidence scores and attributions
```

**Cost profile:** ~80% of claims resolved in Step 2 (MiniCheck, $0.24/test set). Steps 3-5 handle the remaining ~20% at higher cost but higher accuracy.

### 3.7 False Positive Rates and Practical Limitations

| Method | False Positive Pattern | False Negative Pattern | Approx. Error Rate |
|--------|----------------------|----------------------|-------------------|
| NLI (DeBERTa) | Marks plausible but unstated claims as supported | Rejects heavily paraphrased claims | ~8-12% on sentence tasks |
| AlignScore | Overfit to training distribution patterns | Misses domain-specific inconsistencies | ~25% balanced |
| MiniCheck-FT5 | Similar to GPT-4 error patterns | Binary output misses nuance | ~25% balanced |
| GPT-4 Judge | Parametric knowledge overrides source checking | Multi-step reasoning failures | ~25% balanced |
| SAFE | Search failure ≠ claim unsupported | Agent may not find evidence | ~28% disagreement with humans |

**Key insight from Atomic-SNLI:** Verification accuracy drops 1-8% when operating at the atomic claim level vs. full sentences. For multi-fact claims (3+ atomic facts), the gap is 7-10%. Specialized fine-tuning on atomic-level data significantly closes this gap.

### 3.8 Verification When Source Trust Varies

| Source Trust Tier | Examples | Verification Strategy |
|-------------------|----------|----------------------|
| **High** | Own agent outputs, controlled experiments | NLI/MiniCheck for contradiction checking; focus on internal consistency |
| **Medium** | Secondary articles, documentation, books | Standard pipeline; cross-reference across medium-trust sources |
| **Low** | Web articles, user-generated content | Require corroboration from ≥1 other source; SAFE web search; higher escalation rate |

For own agent outputs, the primary risk is hallucination within the agent's generation — verification should focus on claims the agent makes that go beyond its source material. For external sources, the risk is both factual error and bias — verification should focus on corroboration and contradiction detection across sources.

---

## Synthesis: Recommended Architecture for Consolidation

Based on the research, a consolidation skill should implement the following pipeline:

### Phase 1: Source Decomposition
- **For structured agent outputs**: Light extractive decomposition (span identification)
- **For unstructured sources**: Iterative abstractive decomposition (AFEV-style) with extractive provenance tracking
- **Output**: Claim inventory with `{claim_text, source_id, source_span, normalized_form}` per claim

### Phase 2: Claim Processing
- **Deduplication**: Embed claims → cluster by cosine similarity → NLI entailment verification within clusters
- **Conflict detection**: NLI contradiction check across non-duplicate claims; dual-perspective retrieval for subtle conflicts
- **Conflict resolution**: Source trust weighting → consensus voting → transparent surfacing for unresolvable conflicts

### Phase 3: Recomposition
- LLM synthesizes coherent output from deduplicated, conflict-resolved claim inventory
- Maintains inline citation markers pointing to source attributions
- Handles information gaps and transitions

### Phase 4: Verification
- **Tiered pipeline**: MiniCheck (fast/cheap) → LLM-as-judge (nuanced) → SAFE/human (critical)
- **Completeness check**: Source claim inventory vs. output claims (LLM-as-judge)
- **Attribution verification**: Confirm each citation actually supports its claim (MiniCheck)

---

## Evidence Index

| File | Topic | Key Finding |
|------|-------|-------------|
| [factscore-decomposition.md](evidence/factscore-decomposition.md) | FActScore pipeline | Foundational decompose-then-verify architecture |
| [afev-iterative-extraction.md](evidence/afev-iterative-extraction.md) | Iterative extraction | Conditioning on prior facts reduces error accumulation |
| [extractive-vs-abstractive-jedi.md](evidence/extractive-vs-abstractive-jedi.md) | Extractive decomposition | Preserves provenance; more robust on adversarial tests |
| [minicheck-architecture.md](evidence/minicheck-architecture.md) | MiniCheck | GPT-4-level verification at 400x lower cost |
| [safe-pipeline.md](evidence/safe-pipeline.md) | SAFE | Agent-based search verification for open-domain facts |
| [nli-verification-approaches.md](evidence/nli-verification-approaches.md) | NLI verification | Fast but captures only ~16% of factual support relationships |
| [knowledge-conflicts-taxonomy.md](evidence/knowledge-conflicts-taxonomy.md) | Knowledge conflicts | LLMs handle inter-context conflicts poorly by default |
| [source-attribution-rag.md](evidence/source-attribution-rag.md) | Source attribution | Unbroken provenance chain patterns for citation tracking |
| [llm-as-judge-verification.md](evidence/llm-as-judge-verification.md) | LLM-as-judge | CoT + few-shot improves consistency; uniquely checks completeness |
| [atomic-snli-findings.md](evidence/atomic-snli-findings.md) | Atomic-level NLI | 1-8% accuracy drop at atomic vs. sentence level |
| [multi-source-conflict-resolution.md](evidence/multi-source-conflict-resolution.md) | Conflict resolution | Dual-perspective retrieval + source trust weighting |
| [verification-limitations-comparison.md](evidence/verification-limitations-comparison.md) | Method comparison | Tiered pipeline balances cost vs. accuracy |

---

## Sources

### Academic Papers
- [FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation](https://arxiv.org/abs/2305.14251) — Min et al., EMNLP 2023
- [Fact in Fragments: Deconstructing Complex Claims via LLM-based Atomic Fact Extraction and Verification](https://arxiv.org/abs/2506.07446) — Expert Systems with Applications, 2025
- [Extractive Fact Decomposition for Interpretable Natural Language Inference in one Forward Pass (JEDI)](https://arxiv.org/abs/2509.18901) — EMNLP 2025
- [MiniCheck: Efficient Fact-Checking of LLMs on Grounding Documents](https://arxiv.org/abs/2404.10774) — Tang et al., EMNLP 2024
- [Long-form factuality in large language models (SAFE)](https://arxiv.org/abs/2403.18802) — Wei et al., NeurIPS 2024
- [Knowledge Conflicts for LLMs: A Survey](https://arxiv.org/abs/2403.08319) — Xu et al., EMNLP 2024
- [Atomic-SNLI: Fine-Grained Natural Language Inference through Atomic Fact Decomposition](https://arxiv.org/abs/2601.06528) — arXiv 2025
- [AlignScore: Evaluating Factual Consistency with a Unified Alignment Function](https://arxiv.org/abs/2305.16739) — ACL 2023
- [Enabling Large Language Models to Generate Text with Citations (ALCE)](https://arxiv.org/abs/2305.14627) — Gao et al., EMNLP 2023
- [Contradiction to Consensus: Dual-Perspective, Multi-Source Retrieval-Based Claim Verification](https://arxiv.org/abs/2602.18693) — arXiv 2025
- [A Survey on LLM-as-a-Judge](https://arxiv.org/abs/2411.15594) — arXiv 2024
- [Trust or Escalate: LLM Judges with Uncertainty](https://proceedings.iclr.cc/paper_files/paper/2025/file/08dabd5345b37fffcbe335bd578b15a0-Paper-Conference.pdf) — ICLR 2025
- [Exploring Factual Entailment with NLI: A News Media Study](https://arxiv.org/abs/2406.16842) — arXiv 2024
- [NLI under the Microscope: What Atomic Hypothesis Decomposition Reveals](https://aclanthology.org/2025.naacl-long.130/) — NAACL 2025

### Tools and Implementations
- [FActScore GitHub](https://github.com/shmsw25/FActScore)
- [MiniCheck GitHub](https://github.com/Liyan06/MiniCheck)
- [SAFE / Long-form Factuality GitHub](https://github.com/google-deepmind/long-form-factuality)
- [ALCE GitHub](https://github.com/princeton-nlp/ALCE)
- [Knowledge Conflicts Survey GitHub](https://github.com/pillowsofwind/Knowledge-Conflicts-Survey)
- [AlignScore GitHub](https://github.com/yuh-zha/AlignScore)
- [SemHash (Semantic Deduplication)](https://github.com/MinishLab/semhash)
- [DeBERTa-v3-large-MNLI on HuggingFace](https://huggingface.co/potsawee/deberta-v3-large-mnli)

### Other Sources
- [Citation-Aware RAG Architecture (Tensorlake)](https://www.tensorlake.ai/blog/rag-citations)
- [SourceCheckup: Automated Assessment of LLM Citations (Nature Communications, 2025)](https://www.nature.com/articles/s41467-025-58551-6)
- [Awesome LLM Attributions Survey](https://github.com/HITsz-TMG/awesome-llm-attributions)
