# Scope-Aware Consolidation & Evaluation Metrics

> **Parent report**: LLM Knowledge Consolidation with Factual Fidelity
> **Dimensions covered**: D6 (Scope-Aware Consolidation), D7 (Evaluation & Quality Metrics)
> **Date**: 2026-03-21

---

## Executive Summary

This report investigates two critical dimensions for building a generalizable `/consolidate` skill: (1) how to make consolidation scope-aware — preserving completeness within a defined goal while filtering noise — and (2) how to evaluate whether consolidation succeeded. The key finding is that **traditional summarization metrics are fundamentally misaligned with consolidation goals**, and the most promising evaluation paradigm combines nugget-based claim coverage (measuring completeness) with LLM-as-judge faithfulness checks (measuring accuracy) — a composite we term **"lossless within scope."**

---

## D6: Scope-Aware Consolidation

### 6.1 Query-Focused Multi-Document Summarization (QFMDS)

QFMDS is the closest established research area to scope-aware consolidation. It produces summaries from document clusters guided by a user query, facing challenges directly relevant to consolidation: cross-document redundancy, query relevance, and topic diversity ([ACM Computing Surveys, 2023](https://dl.acm.org/doi/abs/10.1145/3597299)).

**Critical distinction**: QFMDS optimizes for *brevity within scope* — producing the shortest summary that answers the query. Consolidation optimizes for *completeness within scope* — preserving all relevant information. This inversion means QFMDS techniques need adaptation: their relevance filtering is useful, but their compression objective must be replaced with a preservation objective.

Three QFMDS approaches are most relevant:

| Approach | Mechanism | Consolidation Applicability |
|----------|-----------|---------------------------|
| **GraphRAG** ([Microsoft Research, 2024](https://arxiv.org/html/2404.16130v2)) | Hierarchical graph communities + map-reduce with helpfulness scoring | Community structure enables natural scope boundaries; helpfulness scoring filters irrelevant content |
| **Knowledge-Intensive QFS** ([ICPR 2024](https://arxiv.org/abs/2408.10357)) | Dynamic retrieval from large corpus + LLM summarizer with tailored prompt | Eliminates dependence on predefined document sets; prompt engineering guides scope |
| **Semantic Diversity** ([Expert Systems, 2024](https://onlinelibrary.wiley.com/doi/full/10.1111/exsy.13462)) | Knowledge-based vectorial representation for query-relevance scoring | Captures semantic relevance beyond lexical overlap |

**Evidence**: [graphrag-qfmds.md](evidence/graphrag-qfmds.md), [qfmds-knowledge-intensive.md](evidence/qfmds-knowledge-intensive.md)

### 6.2 Relevance Filtering That Maintains Completeness

The core tension in scope-aware consolidation is filtering noise without accidentally dropping relevant information. Research points to several techniques:

**Hierarchical scope boundaries** (GraphRAG): The Leiden algorithm's community detection creates natural topic clusters. Information is relevant if it belongs to communities that match the consolidation scope. GraphRAG's intermediate community levels (C1-C2) achieved the best balance of comprehensiveness (72-83% win rate over vector RAG) and token efficiency (97% fewer tokens than full-text approaches).

**Iterative extraction for completeness**: Since initial LLM extraction is typically incomplete, iterating the extraction process improves completeness — having the LLM process documents again to search for entities not yet extracted. This maps to a consolidation pattern: extract → check coverage → re-extract missed information.

**Sentence-window retrieval**: Dividing documents into contextually coherent segments with surrounding context maintains coherence and completeness. Filtering applies constraints based on keywords or metadata to filter irrelevant chunks while prioritizing those aligned with query intent.

### 6.3 Goal-Directed and Rubric-Scoped Extraction

**Goal-directed extraction** specifies what the consolidation is FOR and uses that to guide preservation decisions. Two paradigms:

1. **Query-as-scope**: The consolidation goal is expressed as a question or set of questions. Information is in-scope if it helps answer the questions. This is the QFMDS paradigm adapted for completeness.

2. **Rubric-as-scope**: The consolidation goal is expressed as a structured rubric with dimensions and criteria. Information is in-scope if it satisfies any rubric dimension. Recent work on "nugget-as-rubric" paradigms ([arxiv, 2025](https://arxiv.org/html/2510.14660v1)) treats atomic information points as structured evaluation criteria, with automatic rubric construction pipelines based on query rewriting.

**Schema-guided extraction** from scientific information extraction provides a relevant pattern: a schema defines expected fields/dimensions, and the LLM performs constrained extraction conforming to the schema ([Nature Communications, 2024](https://www.nature.com/articles/s41467-024-45563-x)). For consolidation, the schema would define the scope dimensions and expected information types.

### 6.4 Detecting Accidental Scope-Filtering Drops

A consolidation system must detect when scope-filtering has accidentally discarded relevant information. Techniques:

1. **Bidirectional coverage checking**: Generate questions from both source documents and consolidated output (QuestEval pattern). If a source-derived question can't be answered from the consolidation, information may have been dropped.

2. **Nugget recall auditing**: Extract atomic facts (nuggets) from sources, classify as in-scope/out-of-scope using the rubric, then verify all in-scope nuggets appear in the consolidation (AutoNuggetizer pattern, see §7.4).

3. **Iterative scope-expansion**: If initial consolidation misses information, expand the scope definition slightly and re-consolidate to see if new information appears — indicating the scope boundary was too aggressive.

4. **Multi-pass extraction**: Run extraction multiple times with different prompts/framings. Information that consistently appears across passes is likely relevant; information that appears in some but not others warrants human review.

---

## D7: Evaluation & Quality Metrics

### 7.1 Traditional Overlap Metrics: ROUGE and BLEU

ROUGE (Recall-Oriented Understudy for Gisting Evaluation) and BLEU are the most widely used automated metrics in summarization research. They measure n-gram overlap between generated text and reference text.

**Why they are insufficient for consolidation**:

| Limitation | Impact on Consolidation |
|-----------|------------------------|
| Penalize paraphrasing | Consolidation inherently restructures and rephrases |
| Require reference text | No "reference consolidation" exists for multi-document inputs |
| Reward extractive copying | Consolidation should synthesize, not extract |
| BLEU yields scores <<0.01 for summarization models | Essentially unusable |
| ROUGE-2 correlates only 0.2-0.4 with human judgment | Too unreliable for quality decisions |
| Cannot measure factual accuracy | A hallucinated summary can score high on ROUGE |

A comparative study on patent documents found "very weak or non-significant correlation" between SummaC/ROUGE/BERTScore and human evaluations in domain-specific contexts ([Singh et al., 2024](https://arxiv.org/html/2407.00747v1)).

**Evidence**: [rouge-bleu-limitations.md](evidence/rouge-bleu-limitations.md)

### 7.2 Semantic Similarity Metrics: BERTScore and MoverScore

These improve on overlap metrics by using contextual embeddings:

**BERTScore** ([Zhang et al., ICLR 2020](https://arxiv.org/abs/1904.09675)): Computes token-level cosine similarity using BERT embeddings, producing precision, recall, and F1 scores. Captures synonyms and paraphrasing that ROUGE misses.

**MoverScore** ([Zhao et al., 2019](https://ar5iv.labs.arxiv.org/html/1909.02622)): Uses Earth Mover's Distance for many-to-one token alignment via constrained optimization. Measures minimum effort to transform one text into another. On CNN/DailyMail, MoverScore achieved 0.72 correlation with human ratings vs. 0.61-0.63 for ROUGE variants.

**Limitations for consolidation**: While better than ROUGE, these metrics still compare against a reference text and measure similarity rather than factual fidelity. A factually wrong but semantically similar text scores well. They also cannot measure completeness — whether all source claims are preserved.

### 7.3 Factual Consistency Metrics

These metrics directly address whether generated text is faithful to the source, measuring the absence of hallucination. Three families:

#### Entailment-Based

| Metric | Mechanism | Granularity | Key Advantage |
|--------|-----------|-------------|---------------|
| **FactCC** ([Kryscinski et al., 2020](https://arxiv.org/abs/1910.12840)) | Weakly-supervised NLI with rule-based training data | Sentence + span | Provides span-level evidence |
| **DAE** ([Goyal & Durrett, 2020](https://github.com/tagoyal/dae-factuality)) | Dependency arc entailment — predicts whether each dependency relation is supported | Dependency arc | Localizes errors to specific relations |
| **SummaC-ZS** ([Laban et al., 2022](https://github.com/tingofurro/summac)) | Sentence-level NLI matrix, retains max entailment per sentence | Sentence-pair | Zero-shot, no training needed |
| **SummaC-Conv** | Convolutional aggregation over NLI score distributions | Sentence-pair | Reduces noise from outlier scores |
| **TrueTeacher** | Distilled NLI using 1.4M synthetic labels from FLAN-PaLM | Document | Improved ROC-AUC from 82.7→87.8 |

#### QA-Based

| Metric | Mechanism | Key Property |
|--------|-----------|-------------|
| **QuestEval** | Generates questions from both source and summary, compares answers | Bidirectional (precision + recall) |
| **QAFactEval** ([Fabbri et al., 2022](https://aclanthology.org/2022.naacl-main.187/)) | Optimized QG with BART-large | 15% improvement over prior QA metrics |
| **FEQA/QAGS** | Question generation + answer comparison | Foundational QA-based approaches |

#### LLM-Based

| Metric | Mechanism | Correlation with Humans |
|--------|-----------|----------------------|
| **G-Eval** ([Liu et al., 2023](https://www.confident-ai.com/blog/g-eval-the-definitive-guide)) | CoT-prompted LLM scores on multiple dimensions | Spearman ρ=0.514 (SummEval) |
| **UniEval** ([Zhong et al., 2022](https://arxiv.org/abs/2210.07197)) | Boolean QA over dimensions (coherence, consistency, fluency, relevance) | 23% higher correlation than prior unified evaluators |
| **FineSurE** | Fine-grained: faithfulness + completeness + conciseness | More granular than G-Eval |
| **GPT-4/Llama-3 as judge** | Direct LLM scoring with custom criteria | 0.8-0.9 Spearman on accuracy/coverage |

**Key finding**: Simpler NLI approaches with larger models can outperform complex QA-based systems. Current SOTA achieves 60-75% balanced accuracy on standard benchmarks. LLM-as-judge with GPT-4 or comparable models achieves the highest correlation with human judgment (0.8-0.9 on accuracy and coverage dimensions).

**Evidence**: [factual-consistency-taxonomy.md](evidence/factual-consistency-taxonomy.md), [dae-factcc-entailment.md](evidence/dae-factcc-entailment.md), [unieval-multidimensional.md](evidence/unieval-multidimensional.md), [geval-llm-judge.md](evidence/geval-llm-judge.md)

### 7.4 Claim Coverage Metrics

Claim coverage measures what percentage of source information survives in the output — the **recall** dimension that faithfulness metrics miss. This is the most critical metric for consolidation.

#### AutoNuggetizer / TREC 2024 RAG Track

The most directly applicable framework for consolidation evaluation. The AutoNuggetizer ([Pradeep et al., 2024](https://arxiv.org/html/2411.09607v1)) decomposes source documents into atomic "nuggets" and measures their presence in system outputs:

1. **Nugget extraction**: GPT-4o extracts up to 30 atomic information units per topic from relevant documents
2. **Importance classification**: Each nugget labeled "vital" or "okay"
3. **Nugget assignment**: Each nugget rated as "support" (1.0), "partial_support" (0.5), or "not_support" (0)
4. **Scoring**: Six metrics combining strict/soft scoring with vital/all/weighted nugget subsets

Run-level correlation with human assessment: Kendall's τ = 0.783. The framework explicitly measures information coverage, making it the most directly relevant evaluation paradigm for consolidation completeness.

#### FActScore Adaptation

FActScore ([Min et al., EMNLP 2023](https://arxiv.org/abs/2305.14251)) decomposes text into atomic facts and computes the percentage supported by a knowledge source. For consolidation, this can be inverted: decompose *source* documents into atomic facts and compute what percentage appear in the *consolidation*.

#### ICE (Information Coverage Estimate)

ICE ([Expert Systems with Applications, 2022](https://www.sciencedirect.com/science/article/abs/pii/S0957417421014044)) measures the portion of crucial information retained using keyword extraction, cosine similarity, and source/target length normalization.

**Evidence**: [autonuggetizer-trec-rag.md](evidence/autonuggetizer-trec-rag.md), [factscore-atomic-evaluation.md](evidence/factscore-atomic-evaluation.md)

### 7.5 Human Evaluation Frameworks

#### The Pyramid Method

The gold standard for human evaluation of content coverage ([Nenkova & Passonneau, 2007](https://dl.acm.org/doi/10.1145/1233912.1233913)):

1. **SCU extraction**: Experts identify Semantic Content Units from reference summaries
2. **Frequency weighting**: SCUs weighted by how many annotators include them
3. **Presence detection**: Binary judgment of whether output contains each SCU
4. **Normalized scoring**: Weighted sum / maximum achievable score

**QAPyramid** (2024) modernizes this by decomposing into QA pairs instead of SCUs, achieving high inter-annotator agreement without expert annotations — bridging toward automated evaluation.

#### Human Annotation Dimensions

The consensus framework for human evaluation of summarization uses four dimensions:
- **Clarity/Fluency**: Grammaticality and readability (1-5 Likert)
- **Accuracy/Consistency**: Factual alignment with source (1-5 Likert)
- **Coverage/Completeness**: Important information preservation (1-5 Likert)
- **Overall quality**: Holistic judgment (1-5 Likert)

For consolidation, an additional dimension is needed: **Scope adherence** — does the output stay within the defined scope without including irrelevant information?

**Evidence**: [pyramid-method-human-eval.md](evidence/pyramid-method-human-eval.md)

### 7.6 Composite Metrics for "Lossless Within Scope"

No single metric captures consolidation quality. The goal requires a composite:

```
Consolidation Quality = f(Faithfulness, Completeness, Scope Adherence, Coherence)
```

| Dimension | What it measures | Best automated approach | Metric type |
|-----------|-----------------|----------------------|-------------|
| **Faithfulness** | No hallucinated claims | LLM-as-judge or SummaC | Precision |
| **Completeness** | All in-scope claims preserved | Nugget recall (AutoNuggetizer pattern) | Recall |
| **Scope adherence** | No out-of-scope content | LLM-as-judge with rubric | Precision |
| **Coherence** | Logical structure and flow | UniEval or LLM-as-judge | Quality |
| **Non-redundancy** | No unnecessary repetition | Automated n-gram/embedding overlap detection | Quality |

A consolidation is "lossless within scope" when:
- **Faithfulness ≥ threshold** (no introduced errors)
- **Completeness ≥ threshold** (all in-scope nuggets present)
- **Scope adherence ≥ threshold** (minimal out-of-scope content)

### 7.7 Vectara Hallucination Leaderboard

The Vectara leaderboard ([vectara/hallucination-leaderboard](https://github.com/vectara/hallucination-leaderboard)) benchmarks 130+ LLMs on factual consistency in summarization using HHEM-2.3:

- **Dataset**: 7,700+ articles across law, medicine, finance, education, technology (not publicly available)
- **Protocol**: Models generate summaries capped at 20% of source length; HHEM scores consistency (0-1, <0.5 = hallucination)
- **Metrics**: Hallucination rate, factual consistency rate, answer rate, average summary length

**Limitations for consolidation**: Measures only faithfulness (no hallucination), not completeness. Specific to summarization task. Relies entirely on model-based evaluation. However, the methodology — automated consistency scoring at scale with periodic dataset refresh — is a useful template for continuous consolidation quality monitoring.

**Evidence**: [vectara-hallucination-leaderboard.md](evidence/vectara-hallucination-leaderboard.md)

### 7.8 Multi-Document Consolidation-Specific Evaluation

Standard summarization metrics assume single-document input. Multi-document consolidation introduces additional evaluation challenges:

1. **Cross-document claim deduplication**: The same fact appearing in multiple sources should appear once in the consolidation. Metrics must not penalize for merging duplicate claims.

2. **Contradictory source handling**: When sources disagree, the consolidation should acknowledge the contradiction rather than silently picking one version. Evaluation must check for this.

3. **Source attribution**: Can each claim in the consolidation be traced to at least one source? This goes beyond faithfulness to provenance.

4. **Proportional representation**: If one source has 10 relevant claims and another has 2, the consolidation should reflect this proportion, not give equal weight.

The **Coverage-Based Fairness** framework for multi-document summarization introduces "Equal Coverage" and "Coverage Parity" measures that account for redundancy within documents and fair representation across sources — directly applicable to consolidation across heterogeneous source types.

---

## Practical Evaluation Pipeline for a /consolidate Skill

Based on the research findings, here is a recommended evaluation architecture:

### Tier 1: Every Consolidation Run (Automated)

```
Sources → [Nugget Extraction] → In-Scope Nuggets
                                       ↓
Consolidation Output → [Nugget Assignment] → Claim Coverage Score
                    → [LLM Judge: Faithfulness] → Faithfulness Score
                    → [LLM Judge: Scope Adherence] → Scope Score
                    → [Statistics] → Compression ratio, source coverage
```

- **Nugget extraction**: GPT-4o or comparable model extracts atomic claims from sources, filters by scope rubric
- **Nugget assignment**: Check each in-scope nugget against consolidation output (support/partial/not_support)
- **LLM faithfulness judge**: Check each claim in consolidation against sources (no hallucination)
- **LLM scope judge**: Check each claim in consolidation against rubric (no out-of-scope content)

### Tier 2: Periodic Validation (Human + Automated)

- Human review of 10-20 random consolidations per validation cycle
- Annotate on 5 dimensions: faithfulness, completeness, scope adherence, coherence, overall quality
- Compare automated scores to human scores for calibration
- Compute inter-rater reliability

### Tier 3: Regression Testing (Golden Set)

- Maintain curated set of source documents + known-good consolidations
- Run on each model/prompt change
- Alert on score degradation beyond threshold

### Implementation Notes

- **Model selection for evaluation**: LLM-as-judge achieves 0.8-0.9 correlation with human judgment for accuracy/coverage; open-source models (Llama-3-8B) perform comparably to GPT-4 for evaluation tasks
- **Cost management**: Nugget extraction is the expensive step; cache nuggets per source document and reuse across consolidation runs
- **Failure modes to monitor**: Scope creep (consolidation includes irrelevant information), silent drops (relevant information filtered out), hallucinated synthesis (consolidation creates claims not in any source), attribution errors (claims attributed to wrong source)

---

## Key Implications for /consolidate Skill Design

1. **Scope must be explicit**: Express consolidation scope as a rubric with dimensions, not just a topic. This enables automated evaluation via nugget classification.

2. **Bidirectional verification is essential**: Check both directions — every claim in the output is in the sources (faithfulness), and every in-scope claim in the sources is in the output (completeness).

3. **No single metric suffices**: The composite of faithfulness + completeness + scope adherence is the minimum. Add coherence for quality.

4. **LLM-as-judge is the practical path**: Traditional metrics are unreliable for consolidation. LLM-based evaluation with custom criteria achieves the best correlation with human judgment.

5. **Nugget-based evaluation is the breakthrough**: The AutoNuggetizer paradigm — decompose into atomic claims, classify by importance, check coverage — is directly applicable to consolidation completeness measurement.

6. **Iterative extraction improves completeness**: A single extraction pass misses information. Multiple passes with different prompts/framings catches more, and the difference between passes reveals scope-boundary ambiguity.

---

## Evidence Index

| File | Topic | Dimension |
|------|-------|-----------|
| [graphrag-qfmds.md](evidence/graphrag-qfmds.md) | GraphRAG query-focused summarization | D6 |
| [qfmds-knowledge-intensive.md](evidence/qfmds-knowledge-intensive.md) | QFMDS survey and knowledge-intensive approach | D6 |
| [factscore-atomic-evaluation.md](evidence/factscore-atomic-evaluation.md) | FActScore atomic fact evaluation | D7 |
| [factual-consistency-taxonomy.md](evidence/factual-consistency-taxonomy.md) | Taxonomy of factual consistency metrics | D7 |
| [autonuggetizer-trec-rag.md](evidence/autonuggetizer-trec-rag.md) | AutoNuggetizer nugget-based evaluation | D7 |
| [vectara-hallucination-leaderboard.md](evidence/vectara-hallucination-leaderboard.md) | Vectara HHEM leaderboard methodology | D7 |
| [pyramid-method-human-eval.md](evidence/pyramid-method-human-eval.md) | Pyramid Method human evaluation framework | D7 |
| [unieval-multidimensional.md](evidence/unieval-multidimensional.md) | UniEval multi-dimensional evaluation | D7 |
| [rouge-bleu-limitations.md](evidence/rouge-bleu-limitations.md) | ROUGE/BLEU limitations | D7 |
| [geval-llm-judge.md](evidence/geval-llm-judge.md) | G-Eval and LLM-as-judge | D7 |
| [dae-factcc-entailment.md](evidence/dae-factcc-entailment.md) | DAE and FactCC entailment methods | D7 |
| [practical-eval-pipeline.md](evidence/practical-eval-pipeline.md) | Production evaluation pipeline design | D7 |

---

## Confidence Assessment

| Finding | Confidence | Basis |
|---------|------------|-------|
| ROUGE/BLEU are insufficient for consolidation evaluation | **High** | Multiple comparative studies, consensus across literature |
| LLM-as-judge achieves highest correlation with human judgment | **High** | Multiple independent studies showing 0.8-0.9 Spearman correlation |
| Nugget-based evaluation is best fit for completeness measurement | **High** | TREC 2024 RAG track validation, strong run-level correlation (τ=0.783) |
| Bidirectional verification (faithfulness + completeness) is necessary | **High** | Established principle in QuestEval and information retrieval |
| Composite metrics are needed (no single metric suffices) | **High** | Consensus across all evaluation literature |
| Iterative extraction improves completeness | **Moderate** | Supported by IE literature but not specifically validated for consolidation |
| GraphRAG community structure enables natural scope boundaries | **Moderate** | Strong results on comprehensiveness but tested only in general QA contexts |
| Open-source LLMs match GPT-4 for evaluation | **Moderate** | One study showed comparable performance; may depend on evaluation complexity |
