---
title: "Atomic Fact Decomposition and Claim-Level Extraction Techniques"
description: "Evidence compilation covering the FActScore decompose-then-verify pipeline, extractive vs. abstractive decomposition tradeoffs (JEDI), iterative extraction with verification feedback (AFEV), and atomic-level NLI findings. Includes decomposition quality metrics, hybrid approaches for consolidation, and claim deduplication pipelines."
created: 2026-03-21
last-updated: 2026-03-21
---

# Atomic Fact Decomposition and Claim-Level Extraction Techniques

## 1. FActScore: Decompose-Then-Verify Pipeline

**Source:** Min et al., "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation," EMNLP 2023. [arXiv:2305.14251](https://arxiv.org/abs/2305.14251) | [GitHub](https://github.com/shmsw25/FActScore)

### Core Concept

FActScore breaks long-form generation into **atomic facts** -- minimal, independent pieces of information individually verifiable as true or false -- and computes the percentage supported by a reliable knowledge source.

### Pipeline Stages

**Stage 1 -- Atomic Fact Decomposition.** Uses an LLM (InstructGPT or ChatGPT) with prompt-based instructions to decompose sentences into atomic facts. Example: "Thierry Henry is a French professional football coach and pundit" decomposes into ["Thierry Henry is French", "Thierry Henry is a football coach", "Thierry Henry is a football pundit"]. Each fact must be self-contained and independently verifiable.

**Stage 2 -- Evidence Retrieval.** Dense retriever (GTR-based passage retriever) extracts relevant knowledge snippets from an external source. Default knowledge source: Wikipedia dump (2023/04/01). Custom knowledge sources supported via `.jsonl` files with title/text pairs.

**Stage 3 -- Fact Validation.** Each atomic fact paired with retrieved evidence and classified as "Supported", "Not-supported", or "Irrelevant". Two recommended verifiers: `retrieval+ChatGPT` (default) and `retrieval+llama+npm`. These achieve 0.99 Pearson correlation with each other.

**Stage 4 -- Score Computation.** FActScore = percentage of atomic facts labeled "Supported". Automated pipeline achieves less than 2% error relative to human annotation. Length penalty hyperparameter (gamma, default=10) is adjustable.

### Key Configuration

- `--gamma`: Length penalty (default 10, can be 0)
- `--use_atomic_facts`: Reuse pre-generated decompositions
- `--abstain_detection`: Optional response filtering ("generic" or "perplexity_ai")

### Evaluated Models

GPT-4, ChatGPT, Alpaca (7B/13B/65B), Vicuna, InstructGPT, MPT Chat, Oasst Pythia, Dolly, StableLM.

### Consolidation Relevance

- Decomposition stage directly applicable to building claim inventories from source texts.
- The retrieval+verify pattern is repurposable for post-consolidation verification.
- FActScore provides a quantitative fidelity metric for consolidated outputs.
- Custom knowledge sources enable verification against specific source documents.

---

## 2. AFEV: Iterative Atomic Fact Extraction and Verification

**Source:** "Fact in Fragments," Expert Systems with Applications (ScienceDirect), 2025. [arXiv:2506.07446](https://arxiv.org/abs/2506.07446)

### Problem: Static Decomposition Failures

Static (one-shot) decomposition strategies fail because they prioritize syntactic fragmentation over contextual understanding, cannot adapt to semantic granularity and contextual dependencies, amplify error propagation in multi-hop reasoning, and lack explicit supervision during decomposition.

### Iterative Extraction Mechanics

At each iteration t, AFEV performs four steps:

1. **Continuation decision**: Assesses whether previously extracted facts F(1:t-1) adequately cover the original claim C.
2. **Next fact generation**: `Ft = Extractor(C, F(1:t-1), y(1:t-1), r(1:t-1))` -- conditioned on prior facts, their verification labels (y), and rationales (r).
3. **Fact verification**: Retrieves evidence, generates verification label and rationale.
4. **Feedback incorporation**: Verification outcomes inform subsequent decomposition.

**Key innovation -- Feedback loop:** Each extraction benefits from understanding of previously verified facts. Rationales reveal implicit information (entity relationships) that refine subsequent decompositions. Example: Fact2 improves by replacing generic "football club" with specific "FC Barcelona" based on Fact1's verification rationale.

### Three-Stage Architecture

**Stage 1 -- Dynamic Atomic Fact Extraction.** Iteratively breaks complex claims into manageable atomic facts with coverage assessment at each step.

**Stage 2 -- Refined Evidence Retrieval.** Dense retrieval identifies top-k' candidates via cosine similarity; a pre-trained reranker filters noise using InfoNCE loss training; dynamic instance retrieval selects contextually relevant demonstrations from training data.

**Stage 3 -- Adaptive Atomic Fact Verification.** `yt, rt = Reasoner(Ft, C, Et, At)` where Et = evidence, At = demonstrations. Final aggregation synthesizes individual atomic fact verdicts into overall judgment.

### Performance Results

| Dataset | Metric | AFEV | Previous Best |
|---------|--------|------|---------------|
| LIAR-PLUS | Macro-F1 | 83.12 | 81.46 (VMASK) |
| HOVER | Macro-F1 | 78.76 | 73.69 (VMASK) |
| PolitiHop | Macro-F1 | 57.69 | 55.80 (VMASK) |
| LIAR | F1 | 43.9 | 42.0 (RAFTS) |
| RAWFC | F1 | 60.2 | 57.3 (RAFTS) |

**Ablation:** Iterative extraction outperforms one-shot decomposition -- 78.74 vs 77.04 accuracy on HOVER.

### Prompting Strategies

- **Dynamic prompts**: Context-specific instructions adapted per atomic fact.
- **Few-shot demonstrations**: Dynamically retrieved similar training examples (1-2 per fact).
- **Structured outputs**: Prompts elicit both factuality labels AND rationales simultaneously.
- Implementation uses GPT-3.5 for extraction and verification.

### Efficiency

- Two-stage retrieval (bi-encoder then cross-encoder) reduces search from O(N) to O(log N).
- 0.94 hours for full HOVER test set with iterative extraction.
- Parallel processing across independent claims.

### Consolidation Relevance

- The iterative extract-verify loop is directly applicable to source decomposition during consolidation.
- Conditioning each extraction on prior verified facts reduces redundancy and improves coherence.
- The rationale feedback mechanism can propagate provenance information.
- Coverage assessment mechanism ensures completeness of decomposition.

---

## 3. JEDI: Extractive vs. Abstractive Fact Decomposition

**Source:** "JEDI: Extractive Fact Decomposition for Interpretable NLI," EMNLP 2025. [arXiv:2509.18901](https://arxiv.org/abs/2509.18901)

### Extractive Approach (JEDI)

- Identifies **spans in the premise** corresponding directly to atomic facts.
- Produces explicit pointers to relevant portions of input text.
- Enables direct traceability to source.
- Reduces hallucination risks inherent in generated facts.
- Uses significantly more lightweight encoder architectures.

### Generative Approach (FActScore, AFEV, FGLR)

- Generates new natural language statements as atomic facts.
- Can normalize and rephrase for consistency.
- Risks introducing hallucinated content not in source.
- Requires heavier generative models at inference.

### JEDI Architecture

Encoder-only model performing joint decomposition + inference in one forward pass:

1. **Global Classification**: Group bilinear layers on [CLS] and [SEP] tokens produce neutral/entailed/contradicted labels.
2. **Span Extraction**: Identifies start tokens, then pairs with end tokens using binary classifiers.
3. **Span-wise Classification**: Each span evaluated against hypothesis.
4. **Logical Reasoning**: Rule-based inference traces predictions to specific spans.

### Performance Tradeoffs

| Metric | JEDI (Extractive) | FGLR (Generative) | SLR-NLI |
|--------|-------------------|-------------------|---------|
| ANLI Accuracy | 65.6% | 67.7% | 64.1% |
| HANS Robustness | 76.9% | N/A | ~54.7% |
| Inference Speed | Fast (encoder) | Slow (LLM) | N/A |

**Key finding:** Despite lower in-distribution accuracy, JEDI demonstrates significantly improved out-of-distribution robustness, particularly on adversarial tests. "Robustness improvements may not inherently depend on abstraction via generation, but rather on structured reasoning."

### Training Data: SYRP Corpus

- Synthetic rationales generated via Qwen2.5-32B.
- 69% intersection-over-union with manual annotations.
- ~1.5 million samples across 8 NLI datasets.

### Extractive vs. Abstractive Tradeoff Matrix

| Dimension | Extractive | Abstractive |
|-----------|-----------|-------------|
| Source fidelity | High -- preserves exact wording | Medium -- may drift from source |
| Hallucination risk | Low -- constrained to source spans | Higher -- generates new text |
| Cross-source normalization | Poor -- different sources use different terms | Good -- can unify terminology |
| Deduplication support | Harder -- requires semantic matching of spans | Easier -- normalized forms compare well |
| Provenance tracking | Trivial -- spans point to exact locations | Requires additional metadata |
| Computational cost | Lower (encoder only) | Higher (generative model) |

### Recommended Hybrid Approach for Consolidation

Use extractive decomposition to preserve source fidelity and provenance, then optionally apply lightweight abstractive normalization only for deduplication matching -- keeping both the original span reference and normalized form.

---

## 4. Atomic-SNLI: Fine-Grained NLI Performance Gap

**Source:** "Atomic-SNLI: Fine-Grained NLI through Atomic Fact Decomposition," arXiv preprint, January 2025. [arXiv:2601.06528](https://arxiv.org/abs/2601.06528)

### Key Finding

Models perform substantially worse on atomic-level inference compared to sentence-level tasks. The conventional assumption that "a hypothesis is entailed only when all its atomic facts are entailed" fails in practice due to models' poor fine-grained reasoning.

### Dataset Construction

**Decomposition statistics** from SNLI test set: 9,824 valid hypotheses extracted. 89.2% (8,767) contain only a single atomic fact; 0.3% (27) contain 4 or more atomic facts.

**Label-specific generation:**

- **Entailment pairs**: Direct automatic pairing from decomposed facts, filtered using NLI model with confidence threshold tau_e > 0.5.
- **Neutral pairs**: Hybrid approach -- direct filtering + BM25 retrieval for lexically similar atomic facts from other instances, re-ranked via cross-encoder (tau_n > 0.5).
- **Contradiction pairs**: Direct extraction + LLM-generated (Qwen3-32B) minimally altered versions that contradict while preserving grammaticality, validated by ensemble NLI models.

**Scale:** Expands from 9,824 sentence-level examples to 625,281 training pairs through decomposition and enrichment.

### Performance Gap (DeBERTa-v3-base)

- Sentence-level accuracy: 92.38%
- Atomic-level accuracy: 91.65%
- Gap widens significantly for multi-fact hypotheses

### Multi-Fact Improvements After Fine-Tuning on Atomic-SNLI

- 2-fact cases: +1.48 to +1.71% accuracy
- 3-fact cases: +7.38 to +10.07% accuracy
- 4-fact cases: Performance degrades (data sparsity -- only 25 test instances)

### Interpretability Benefit

Atomic-level analysis reveals that overall contradiction judgment stems from a single critical conflict, while other components are correctly identified as entailed or neutral -- providing transparent reasoning.

### Consolidation Relevance

1. **Verification at atomic level is harder than sentence level** -- plan for lower accuracy when verifying individual atomic claims.
2. **Specialized fine-tuning helps significantly** -- models trained on atomic-level data close the performance gap.
3. **Multi-fact claims require special attention** -- verification accuracy drops sharply as claim complexity increases (1-8% accuracy drop, up to 7-10% for 3+ facts).
4. **Interpretability advantage**: Atomic decomposition enables identifying exactly which sub-claim is problematic, rather than flagging entire statements.
5. **For consolidation verification**: Decompose both source and output into atomic facts, then verify pairwise -- but expect accuracy to be lower than sentence-level verification.

---

## Cross-Cutting Themes

### Claim Deduplication Pipeline

Drawing from JEDI's hybrid recommendation and AFEV's iterative conditioning:

1. **Extract** claims from each source using extractive decomposition (preserving source spans).
2. **Normalize** each claim into an abstractive canonical form for matching purposes.
3. **Deduplicate** by comparing normalized forms (semantic similarity), merging claims with shared meaning.
4. **Preserve provenance** by retaining all original source span references for each merged claim.
5. **Verify coverage** using AFEV-style iterative assessment to ensure no source information is lost.

### Decomposition Quality Considerations

- FActScore's automated decomposition achieves <2% error vs. human annotation.
- AFEV's iterative approach outperforms one-shot by ~1.7% accuracy on HOVER.
- JEDI's extractive method trades 2.1% in-distribution accuracy for 22.2% robustness gain (HANS).
- Atomic-SNLI shows 89.2% of SNLI hypotheses contain only a single atomic fact, suggesting most natural-language claims are already near-atomic.
- Multi-fact decomposition accuracy degrades for claims with 4+ atomic facts due to data sparsity.
