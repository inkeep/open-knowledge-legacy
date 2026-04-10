---
title: "Information Loss and Hallucination Failure Modes in Multi-Stage LLM Consolidation"
description: "Evidence compilation of seven failure modes in LLM consolidation: hallucination amplification (up to 75% in MDS), information omission (33-65% key events missing), semantic drift, detail flattening, false synthesis, positional bias (lost-in-the-middle, end-of-output), and duplication. Includes empirical rates per architecture, model-specific findings (FABLES taxonomy), and mitigation strategies."
created: 2026-03-21
last-updated: 2026-03-21
---

## 1. Hallucination Amplification in Multi-Document Summarization

**Source**: Multiple authors (2024-2025). "From Single to Multi: How LLMs Hallucinate in Multi-Document Summarization." NAACL 2025 Findings. [arXiv:2410.13961](https://arxiv.org/abs/2410.13961)

First systematic study of hallucination behavior specific to multi-document summarization (MDS), evaluating 5 LLMs across news and conversation domains.

### Hallucination Rates by Model and Domain

- **News domain**: 20-45% across models
- **Conversation domain**: 52-75% across models
- **Domain gap**: Conversation domain exhibits 20-30% higher hallucination rates than news. News focuses on entities and quantitative facts; conversations involve contextual, multi-turn interactions.

### Non-Existent Topic Generation (critical finding)

- GPT-3.5-Turbo: generates summaries ~79.45% of the time for non-existent topics
- GPT-4o: generates summaries ~44% of the time
- Llama 3.1 (70B): best performer, abstains 71.08% of the time

### Hallucination Taxonomy (from 700+ manual annotations)

| Error Category | Prevalence Range | Description |
|---------------|-----------------|-------------|
| Pedantic errors | 28-79% | Overly generic, paraphrasing, lacking informativeness |
| Instruction Inconsistency | 23-87% | Off-topic, redundant, violating prompt conditions |
| Context Inconsistency | 9-37% | Misrepresentation via overgeneralization/oversimplification |
| Fabrication | 0-9% | Information contradicting or unsupported by sources |

### Impact of Document Count

As document combinations increase from 2 to 10:

- Most models: marginal changes (+/-5%) in hallucinated content
- Gemini-1.5-Flash: up to 10% increase
- Recall drops significantly but error rates remain relatively stable
- Models increasingly prone to generating summaries for non-existent subtopics

### Mitigation Attempts

Simple post-processing methods showed minimal effectiveness:

- Truncating to top-5 insights: improved F1 by only 2.51% maximum
- Redundancy removal and paraphrase detection: largely ineffective

---

## 2. Positional Bias: End-of-Output Hallucination

**Source**: Multiple authors (2025). "Hallucinate at the Last in Long Response Generation." [arXiv:2505.15291](https://arxiv.org/abs/2505.15291)

Demonstrates a consistent pattern across models: faithfulness scores decline significantly toward the end of long summaries.

### Key Empirical Findings

- Models (Llama, Gemma) show faithfulness dropping below 0.75 in final sections
- Effect intensifies as summary length increases (~800 words shows pronounced degradation)
- Pattern persists across Wikipedia, arXiv, PubMed, GovReport datasets (not domain-specific)
- Persists across decoding strategies (temperature, top-k, entropy-based)

### Sensitivity Analysis

Outputs divided into five bins:

- Most models (except Qwen) show negative faithfulness trajectories
- Stable/improving early sections followed by sharp drops in final fifth
- One model exceeded sensitivity score of 10 (substantial end-bias)
- **Exception**: Qwen maintained consistent faithfulness (attributed to sliding window attention)

### Root Causes: Attention Dynamics

- Llama allocated ~3x more attention to final sentences vs. earlier ones
- Excessive self-attention to generated tokens rather than source material correlates with hallucination increases
- Human summaries recover faithfulness toward the end; model outputs don't -- rules out summarization structure as sole cause (it is a model-level issue)

### Mitigation

**BooookScore chunking approach** (chunk input -> generate partial summaries independently -> merge):

- Achieved sensitivity near zero
- Maintained faithfulness throughout including final sections
- Workaround via circumventing direct long-context generation

**Validation**: Human evaluation: 94.8% inter-annotator agreement across 543 atomic facts.

---

## 3. Positional Bias: Lost in the Middle

**Source**: Liu et al. (2024). "Lost in the Middle: How Language Models Use Long Contexts." TACL 2024. [arXiv:2307.03172](https://arxiv.org/abs/2307.03172)

Demonstrates that LLM performance degrades by >30% when relevant information is in the middle of long contexts, following a U-shaped curve.

### Key Findings

- Performance highest when relevant info at beginning or end of context
- Degradation >30% when info shifts to middle positions
- U-shaped performance curve across multi-document QA and key-value retrieval
- Effect persists even for explicitly long-context models

### Root Cause

Rotary Position Embedding (RoPE) introduces long-term decay:

- Models prioritize tokens at beginning and end of sequences
- De-emphasize middle content
- Analogous to psychological serial-position effect (primacy/recency)

### Practical Implications for Consolidation

- "Stuff it all in" approach suffers from systematic information loss for middle-positioned content
- Performance saturates far before retriever recall capacity
- Summarizing documents <32K tokens works well for most LLMs
- Beyond 32K: summarization quality degrades model-dependently (e.g., Llama 3.1 405B degrades after 32K)

### Architectural Implication

This finding provides strong evidence against naive single-pass consolidation for large source sets. Even with sufficient context windows, positional bias will systematically underweight middle-positioned sources. Chunked/staged approaches are architecturally necessary for fidelity, not just for fitting within context limits.

---

## 4. Information Omission and Content Selection Errors (FABLES)

**Source**: Multiple authors (2024). "FABLES: Evaluating Faithfulness and Content Selection in Book-Length Summarization." [arXiv:2404.01261](https://arxiv.org/abs/2404.01261)

First large-scale human evaluation of faithfulness and content selection errors in book-length summarization, with 3,158 annotated claims across 26 books ($5.2K USD).

### Faithfulness Error Rates by Model

| Model | Faithful Claims | Unfaithful Claims |
|-------|----------------|------------------|
| Claude-3-Opus | 90.66% | 2.03% |
| GPT-4-Turbo | 78.16% | 7.62% |
| GPT-4 | 78.55% | 4.54% |
| GPT-3.5-Turbo | 72.07% | 10.52% |
| Mixtral | 70.04% | 10.46% |

### Unfaithful Claim Categories

**By claim type**:

- Character/relationship states: 38.6%
- Specific events: 31.5%
- Cause-effect relationships: 11.2%
- High-level narrative structure: 11.2%
- Character introspection: 7.5%

**By reasoning requirement**:

- 50.2% required indirect reasoning (multi-hop inference)
- 36.8% involved direct contradictions
- Remainder: subjective assessment or external information

### Content Selection Errors (Beyond Faithfulness)

**Omission errors (all models)**:

- Key events missing: 33.3%-65.4% of summaries
- Important character details omitted: 16.7%-38.5%
- Crucial characters entirely absent: up to 23.1%

**Chronological problems**: Every model made temporal ordering errors; less pronounced in long-context models.

**Generic content**: Weaker models (GPT-3.5-Turbo, Mixtral): overly vague statements at 38.5% rate.

### Key Differences from Short-Document Summarization

1. **Complexity**: Unfaithful claims predominantly require "multi-hop reasoning over evidence" vs. simpler entity-centric verification
2. **Context dependency**: Claims involve implicit narrative information difficult to localize
3. **Auto-rater failure**: LLM auto-raters achieved only 47.5 F1 on detecting unfaithful claims (vs. strong performance on shorter docs)
4. **Recency bias**: Long-context models (Claude-3-Opus, GPT-4-Turbo) showed systematic over-emphasis on book endings

---

## 5. False Synthesis: Ordering and Composition Sensitivity

**Source**: DeYoung, Martinez, Marshall, Wallace (2024). "Do Multi-Document Summarization Models Synthesize?" TACL. [arXiv:2301.13844](https://arxiv.org/abs/2301.13844)

Tests whether MDS models actually synthesize cross-document information or merely concatenate/copy. Finds models are oversensitive to input ordering and undersensitive to input composition changes.

### Ordering Sensitivity (should be invariant)

- Synthesis should be order-invariant (critic consensus doesn't change based on review reading order)
- When inputs permuted 100 times, generated summaries exhibited "wide spread in sentiment"
- For systematic reviews: models "flip the report conclusion" based on different input orderings
- Indicates unstable aggregation, not true synthesis

### Composition Sensitivity (should be proportional)

- When ratio of positive/negative reviews changed, models required "large change in input distribution to substantially change sentiment"
- Models "generally undersensitive to changes in their input" compared to human summaries
- Human summaries exhibited near-proportional response to composition shifts

### Model Rankings (R-squared of Sentiment Correlation)

| Model | R-squared | Notes |
|-------|-----------|-------|
| GPT-4 | 0.808 | Substantially outperformed specialized models |
| PRIMERA | 0.608 | Best fine-tuned model |
| Flan-T5-XL | 0.611 | Close to PRIMERA |
| PlanSum | <0.25 | Specialized for opinion, underperformed |
| AceSum | <0.25 | Specialized for opinion, underperformed |
| Human baseline | 0.697 | |

### Key Implication for Consolidation

Models designed specifically for synthesis (PlanSum, AceSum) underperformed general-purpose models. GPT-4 achieved Pearson's r of 0.900 -- suggesting large general-purpose models may be better synthesizers than specialized architectures.

Current systems inadequately synthesize conflicting evidence -- problematic for domains where accurate aggregation determines outcomes.

---

## 6. Hallucination Amplification in Hierarchical Merging

**Source**: Ou & Lapata (2025). "Context-Aware Hierarchical Merging for Long Document Summarization." ACL 2025 Findings. [arXiv:2502.00977](https://arxiv.org/abs/2502.00977)

Baseline hierarchical merging amplifies hallucination at each merge level because intermediate abstractive summaries progressively drift from source material.

### Empirical Impact of Context-Aware Mitigations

| Metric | Dataset | Best Method | Baseline | Gain |
|--------|---------|------------|----------|------|
| PRisma | Multi-LexSum | Extract-Support | HMerge | +2.0 |
| PRisma | SuperSummary | Extract-Support | HMerge | +2.4 |
| SummaC | Multi-LexSum | Cite-Replace | HMerge | +5.7 |
| AlignScore | SuperSummary | Cite-Replace | HMerge | +15.1 |

**Manual evaluation**: Extract-Support achieved 72.7% correct atomic claims vs. baseline hierarchical merging at 59.1% -- a 13.6 percentage point improvement from source context augmentation alone.

### Mitigation Strategies (three augmentation approaches)

1. **Extract**: RL-based extractive summarizer (MemSum) identifies key sentences from original source at each level
2. **Retrieve**: BM25 retrieval using intermediate summaries as queries against ~100-word source passages
3. **Cite**: Generate summaries with explicit citations, rank source passages by citation frequency

Each paired with either **Replace** (substitute abstractions with source context) or **Support** (retain abstractions, use source context as proofreading evidence).

---

## 7. Failure Mode Summary Matrix

| Failure Mode | Empirical Rate | Architecture Most Affected | Primary Mitigation |
|---|---|---|---|
| Hallucination amplification (MDS) | 20-75% depending on domain | All multi-document approaches | Domain-specific prompting; model selection (Claude-3-Opus: 2.03% unfaithful) |
| Information omission | 33-65% key events missing | Hierarchical merging, incremental updating | Context-aware merging (Extract-Support: +13.6pp) |
| Positional bias (middle) | >30% degradation | Stuff-it-all, single-pass | Chunked/staged approaches |
| Positional bias (end-of-output) | Faithfulness <0.75 in final sections | Any long-output generation | Chunk-then-merge (BooookScore approach); sliding window attention (Qwen) |
| False synthesis (order sensitivity) | Conclusion flips on permutation | All MDS models | GPT-4-class models (R-squared 0.808); explicit conflict resolution protocols |
| Detail flattening / generic content | 38.5% overly vague (weaker models) | Hierarchical merging | Chain of Density post-processing; entity-level accounting |
| Duplication | 1.2-2.1% per sentence | Incremental updating (2.1%) > hierarchical (1.2%) | Deduplication passes; hierarchical merging preferred |
| Chronological errors | Present in all models | All long-form summarization | Long-context models reduce but don't eliminate |
| Non-existent topic fabrication | 44-79% (model-dependent) | Multi-document, topic-guided | Llama 3.1 70B abstains 71%; explicit "no information" protocols |
| Auto-rater blindness | 47.5 F1 for unfaithful claim detection | Automated evaluation pipelines | Human evaluation required for book-length; multi-hop verification |
