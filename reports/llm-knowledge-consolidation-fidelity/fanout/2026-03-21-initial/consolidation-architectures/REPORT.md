# Consolidation Architectures & Failure Modes for AI/LLM Knowledge Consolidation

**Dimensions Covered:** D1 (Consolidation Architectures), D4 (Information Loss & Hallucination Failure Modes)
**Priority:** P0
**Date:** 2026-03-21

---

## Executive Summary

This report maps the full landscape of architectures for consolidating knowledge from multiple sources using LLMs, and catalogs their failure modes. Five distinct architecture families emerge — stuff-it-all, map-reduce, hierarchical merging, progressive refinement, and tree-structured merging — each with characteristic tradeoffs between fidelity, cost, latency, and context utilization. The failure mode analysis reveals that multi-stage consolidation amplifies hallucinations, with empirical rates reaching 75% in multi-document summarization. Positional bias, ordering sensitivity, and insufficient synthesis (as opposed to mere concatenation) are pervasive problems. The most promising mitigations combine context-aware augmentation with structured information protocols that maintain explicit provenance between sources and consolidated output.

---

## D1: Consolidation Architectures

### 1. Stuff-It-All (Single-Pass)

**How it works:** Feed all source documents into a single LLM context window and generate consolidated output in one pass.

**When viable:** Total source material fits within effective context window (<32K tokens for most models, per empirical evidence).

**Key constraint — Lost in the Middle:** Even when sources fit within context, LLMs exhibit a U-shaped attention curve. Performance degrades >30% when relevant information is positioned in the middle of the context ([Liu et al., TACL 2024](https://arxiv.org/abs/2307.03172)). Rotary Position Embedding (RoPE) introduces long-term decay that systematically de-emphasizes middle content. This means that even with sufficient context windows, positional bias will underweight middle-positioned sources.

**Key constraint — End-of-Output Hallucination:** Faithfulness scores decline toward the end of long outputs. Models like Llama allocate ~3x more attention to final generated sentences vs earlier ones, correlating with hallucination increases ([Hallucinate at the Last, 2025](https://arxiv.org/abs/2505.15291)). Effect intensifies beyond ~800 words of output.

**Practical threshold:** Summarizing documents <32K tokens works well for most LLMs. Llama 3.1 405B degrades after 32K tokens. Beyond this threshold, chunked approaches become architecturally necessary for fidelity — not just for fitting within context limits.

**Tradeoffs:**
| Dimension | Rating |
|-----------|--------|
| Fidelity | Moderate (positional bias) |
| Cost | Low (single call) |
| Latency | Low |
| Context efficiency | Poor (entire source set loaded) |
| Best for | Small source sets (<32K), homogeneous sources |

---

### 2. Map-Reduce

**How it works:** Documents split into chunks → each chunk processed independently (map) → results combined into final output (reduce). Optional intermediate collapse stages compress mapped results when they exceed context.

#### 2a. Flat Map-Reduce (LangChain-style)

The canonical implementation from [LangChain](https://python.langchain.com/docs/how_to/summarize_refine/) offers three chain types:

- **Stuff Chain:** All chunks concatenated and processed together (degenerates to stuff-it-all)
- **Map-Reduce Chain:** Each chunk summarized independently (map), then summaries combined (reduce). Parallelizable but may lose cross-chunk context, producing disjointed output.
- **Refine Chain:** See Progressive Refinement below.

**Key limitation:** Flat map-reduce treats chunks as independent, losing inter-chunk dependencies and struggling with cross-document contradictions.

#### 2b. Structured Map-Reduce (LLMxMapReduce)

[LLMxMapReduce](https://arxiv.org/abs/2410.09342) (THUNLP/OpenBMB, 2024) addresses flat map-reduce's limitations with a **Structured Information Protocol** — a four-component schema for information transfer across stages:

1. **Extracted Information**: Key facts relevant to the query
2. **Rationale**: Analytical reasoning explaining derivation
3. **Answer**: Intermediate response (or "NO INFORMATION")
4. **Confidence Score**: 0-5 scale reflecting completeness/reliability

**Inter-chunk conflict resolution** uses In-Context Confidence Calibration: text-supported claims receive 5 points, inferred claims 3-3.5, unsupported claims 0. This enables the reduce stage to resolve contradictions based on evidence strength rather than position.

**Three-stage pipeline:** Map → Collapse (iterative compression when mapped results exceed context) → Reduce.

**Empirical results on InfiniteBench (100K+ tokens):**
- Llama3-70B + LLMxMapReduce: 68.66% avg accuracy
- GPT-4 alone: 57.34% (−11.3pp)
- Processed sequences up to 1.28M tokens

**V2 extension** introduces entropy-driven convolutional test-time scaling for extremely large information volumes, powering the automated SurveyGO system.

**Tradeoffs:**
| Dimension | Rating |
|-----------|--------|
| Fidelity | High (structured protocol preserves provenance) |
| Cost | Medium-High (multiple LLM calls + collapse stages) |
| Latency | Medium (map stage parallelizable) |
| Context efficiency | High (only intermediate representations flow forward) |
| Best for | Large heterogeneous source sets, query-driven consolidation |

---

### 3. Hierarchical Merging

**How it works:** Documents chunked → each chunk summarized → consecutive summaries merged pairwise/grouped → merging continues recursively until single final summary produced.

#### 3a. Baseline Hierarchical Merging

[BooookScore (ICLR 2024)](https://arxiv.org/abs/2310.00785) provides foundational evaluation. Documents divided into fixed-size chunks (typically 8K tokens), summaries generated per chunk, then iteratively merged.

**Eight coherence error types identified** (per-sentence prevalence in incremental vs hierarchical):
| Error | Incremental | Hierarchical |
|-------|------------|-------------|
| Entity omission | 7.3% | 3.7% |
| Event omission | 4.3% | 2.3% |
| Causal omission | 2.8% | 1.2% |
| Discontinuity | 2.2% | 1.6% |
| Duplication | 2.1% | 1.2% |

**Critical tradeoff:** Hierarchical merging produces higher coherence but reduced detail. Humans preferred incremental approaches for detail (83%) but hierarchical for logical consistency (53%).

#### 3b. Context-Aware Hierarchical Merging

[Ou & Lapata (ACL 2025 Findings)](https://arxiv.org/abs/2502.00977) addresses hallucination amplification through three context augmentation strategies:

**Augmentation strategies:**
1. **Extract**: RL-based extractive summarizer (MemSum) identifies key sentences from source. Contexts always originate from original source material.
2. **Retrieve**: BM25 retrieval using intermediate summaries as queries against ~100-word source passages.
3. **Cite**: Generate summaries with explicit citations, rank passages by citation frequency.

**Integration methods:**
- **Replace**: Substitute abstractive summaries with source contexts entirely
- **Support**: Retain summaries, use source contexts for "proofreading only"

**Key results:**
| Method | Correct Atomic Claims (Manual Eval) |
|--------|-------------------------------------|
| Extract-Support | **72.7%** |
| Baseline HMerge | 59.1% |

AlignScore improvements up to +15.1 points with Cite-Replace on SuperSummary.

**Critical insight:** Input-based faithfulness metrics favor Replace (grounded in source), but reference-based metrics and manual annotation favor Support (comprehensive coverage). This reveals a tension between groundedness and completeness — both matter for consolidation.

#### 3c. Dynamic Tree Construction

[Dynamic Tree Construction for Recursive Summarization (ACL 2025)](https://aclanthology.org/2025.acl-long.536.pdf) adapts tree structure dynamically rather than using fixed-depth hierarchies, improving adaptation to varying document structures.

**Tradeoffs:**
| Dimension | Rating |
|-----------|--------|
| Fidelity | Low-Medium baseline; Medium-High with context augmentation |
| Cost | High (O(n log n) LLM calls for tree depth) |
| Latency | High (sequential merging stages) |
| Context efficiency | Medium (intermediate summaries progressively compressed) |
| Best for | Very long single documents, narrative/book content |

---

### 4. Progressive Refinement (Refine Chains)

**How it works:** Start with initial summary of first chunk → iteratively update running summary by incorporating each subsequent chunk one at a time.

**LangChain Refine Chain:** Passes all non-document inputs, current document chunk, and latest intermediate answer to LLM for each iteration.

**Key properties:**
- Preserves temporal/sequential context better than map-reduce
- Slower than map-reduce (inherently sequential)
- Older segments may gain more emphasis than newer ones (primacy bias)
- Quality may degrade after 2-3 refinement iterations

**Prompt chaining vs stepwise refinement:** [Research (2024)](https://arxiv.org/abs/2406.00507) demonstrates that separating draft/critique/refine into distinct LLM calls (prompt chaining) significantly outperforms consolidating them into one prompt (stepwise). Prompt chaining achieved 77/100 wins vs stepwise in GPT-4 evaluation. Stepwise prompts produce "simulated refinement" — models intentionally generate weaker drafts to then "correct."

**Chain of Density (CoD):** [Adams et al. (2023)](https://arxiv.org/abs/2309.04269) provides a specific refinement technique for compression stages: 5 iterations of adding 1-3 missing salient entities while maintaining constant length. Produces more abstractive, entity-dense, less lead-biased summaries than vanilla prompts.

**Chain of Summaries (CoS):** Dialectical approach — thesis (initial summary) → antithesis (identify limitations via questioning) → synthesis (general-purpose summary addressing gaps).

**Tradeoffs:**
| Dimension | Rating |
|-----------|--------|
| Fidelity | Medium (primacy bias, degradation after 2-3 iterations) |
| Cost | Medium (one LLM call per chunk, sequential) |
| Latency | High (cannot parallelize) |
| Context efficiency | Good (only running summary + current chunk in context) |
| Best for | Sequential/chronological sources, story-like structures, progressive updates |

---

### 5. Tree-Structured Merging

**How it works:** Leverages inherent document hierarchy (headings, sections) to construct a tree representation, then performs bottom-up aggregation with conflict resolution at each level.

#### 5a. ToM (Tree-oriented MapReduce)

[ToM (EMNLP 2025)](https://arxiv.org/abs/2511.00489) constructs a DocTree via Hierarchical Semantic Parsing:

1. **Segment** documents into 1K-8K token chunks
2. **Parse** internal semantic hierarchies per chunk using distilled 3B model
3. **Embed** root nodes using pre-trained models
4. **Cluster** embeddings via Leiden algorithm
5. **Summarize** each cluster → parent node
6. Recurse until single root

**Map phase:** Child nodes generate {key_info, rationale, answer, confidence}.
**Reduce phase:** Sibling results aggregated at parent, conflicts resolved via confidence scores. Same-level nodes process in parallel.

**Performance vs baselines (GPT-4o):**
| Task | ToM | LongAgent | RAG |
|------|-----|-----------|-----|
| Inf.QA (192K tokens) | **41.17%** | 38.00% | 26.03% |
| Inf.MC (184K tokens) | **85.0%** | 72.0% | 65.0% |

Removing confidence measures: −6.9%. Removing bottom-up aggregation: −2.0% to −6.0%.

#### 5b. NexusSum (Multi-Agent Hierarchical Pipeline)

[NexusSum (ACL 2025)](https://arxiv.org/abs/2505.24575) uses specialized agents in sequence:
1. **Preprocessor**: Dialogue-to-Description transformation (source normalization)
2. **Summarizer**: Hierarchical summarization preserving key elements
3. **Compressor**: Iterative controlled compression

Achieved up to 30% improvement in BERTScore (F1) for narrative content.

#### 5c. CoTHSSum

[CoTHSSum (2025)](https://link.springer.com/article/10.1007/s44443-025-00041-2) integrates Chain-of-Thought prompting within hierarchical segmentation — documents decomposed into semantically coherent segments, then CoT-guided intermediate reasoning at each level.

**Tradeoffs:**
| Dimension | Rating |
|-----------|--------|
| Fidelity | High (preserves document structure, confidence-based conflict resolution) |
| Cost | High (tree construction + multi-level reasoning) |
| Latency | Medium (within-level parallelism) |
| Context efficiency | High (query-aware compression selects relevant chunks) |
| Best for | Well-structured documents, multi-hop reasoning tasks |

---

### Architecture Comparison Matrix

| Architecture | Fidelity | Cost | Latency | Parallelizable | Cross-Doc Synthesis | Source Types |
|-------------|----------|------|---------|----------------|-------------------|-------------|
| Stuff-it-all | Medium | Low | Low | N/A | Poor (positional bias) | Small, homogeneous |
| Flat Map-Reduce | Low-Medium | Medium | Low | Yes (map) | Poor (no cross-chunk) | Any, parallel-friendly |
| Structured Map-Reduce | High | Medium-High | Medium | Yes (map) | Good (confidence calibration) | Large, heterogeneous |
| Hierarchical Merging | Low→Medium | High | High | Partial (within-level) | Medium (recursive amplification risk) | Very long documents |
| Context-Aware HMerge | Medium-High | High | High | Partial | Medium-High | Long docs needing faithfulness |
| Progressive Refinement | Medium | Medium | High | No | Medium (order-dependent) | Sequential, chronological |
| Tree MapReduce | High | High | Medium | Yes (within-level) | High (structural conflict resolution) | Well-structured documents |

### How Architectures Handle Different Source Types

**Structured agent outputs (e.g., JSON, structured reports):**
- Best: Structured Map-Reduce (LLMxMapReduce's protocol naturally maps to structured intermediates)
- Good: Tree-structured merging (can leverage output schema as hierarchy)
- Poor: Progressive refinement (loses structure during sequential integration)

**Unstructured articles/books:**
- Best: Context-Aware Hierarchical Merging (handles narrative coherence)
- Good: Progressive refinement (preserves narrative flow)
- Poor: Flat map-reduce (loses narrative continuity)

**Mixed source types:**
- Best: NexusSum-style preprocessing + structured map-reduce (normalize sources before consolidation)
- Key insight: Source-type-specific preprocessing into a common intermediate format before any architecture yields significant gains

---

## D4: Information Loss & Hallucination Failure Modes

### Taxonomy of Failure Modes

Based on empirical research across multiple studies, we identify seven distinct failure modes during multi-stage consolidation:

#### FM1: Hallucination Amplification
**Description:** Each stage of recursive processing can introduce hallucinations that subsequent stages treat as factual, compounding errors.

**Empirical rates:**
- Multi-document summarization: up to 75% of content hallucinated ([From Single to Multi, NAACL 2025](https://arxiv.org/abs/2410.13961))
- Book-length summarization: 2.03% (Claude-3-Opus) to 10.52% (GPT-3.5-Turbo) unfaithful claims ([FABLES, 2024](https://arxiv.org/abs/2404.01261))
- Non-existent topic generation: GPT-3.5-Turbo generates summaries 79.45% of the time for topics that don't exist in source documents

**Most susceptible architectures:** Baseline hierarchical merging (no context augmentation), deep recursive pipelines.

**Mitigations:**
- Context-aware augmentation (Extract-Support achieves 72.7% vs 59.1% correct claims)
- Structured information protocol with confidence scores
- Explicit citation/provenance tracking through stages

#### FM2: Information Omission
**Description:** Salient information from source documents is dropped during consolidation, never appearing in the final output.

**Empirical rates:**
- Key events missing: 33.3%-65.4% of book summaries
- Important character details omitted: 16.7%-38.5%
- Crucial characters entirely absent: up to 23.1%
- Entity omission: 3.7% (hierarchical) to 7.3% (incremental) per sentence

**Most susceptible architectures:** Hierarchical merging (detail lost at each merge level), stuff-it-all (middle content ignored).

**Mitigations:**
- Chain of Density for explicit entity accounting
- Extractive anchoring (Extract strategy from context-aware merging)
- Multi-pass verification against source material

#### FM3: Semantic Drift
**Description:** Meaning gradually shifts across consolidation stages as intermediate representations diverge from source semantics.

**Mechanisms:**
- Recursive summarization compounds small deviations
- Intermediate representations lose nuance at each compression step
- "Knowledge collapse" — narrowing of semantic diversity in recursive processing
- Embedding drift weakens retrieval grounding over time

**Most susceptible architectures:** Deep hierarchical merging (more levels = more drift), progressive refinement (later sources processed against already-drifted context).

**Mitigations:**
- Context-aware merging (anchor to source at each level)
- Contraction mapping operators (RKS framework's transparency audit)
- Session-level role decomposition to prevent implicit state propagation

#### FM4: Detail Flattening
**Description:** Specific, nuanced information is replaced by generic, surface-level statements during compression.

**Empirical evidence:**
- Pedantic/generic errors: 28-79% of MDS insights
- Weaker models (GPT-3.5, Mixtral): overly vague statements at 38.5% rate
- Hierarchical merging specifically produces "higher coherence but reduced detail"

**Most susceptible architectures:** All architectures during compression stages, especially hierarchical merging and stuff-it-all with long inputs.

**Mitigations:**
- Chain of Density (forces entity-level accounting during compression)
- Structured information protocol (explicit fact extraction before compression)
- Support integration (retain abstractive summaries alongside source context)

#### FM5: False Synthesis
**Description:** Model generates plausible-sounding connections, correlations, or conclusions that don't exist in any source document.

**Empirical evidence:**
- Models "flip report conclusions" based on input ordering alone
- Ordering sensitivity: random permutations produce "wide spread in sentiment" despite synthesis being order-invariant
- Composition undersensitivity: models require "large change in input distribution" to change output sentiment
- GPT-4 achieves R² of 0.808 for true synthesis; specialized models <0.25

**Most susceptible architectures:** All architectures performing cross-document reasoning. Map-reduce (no cross-chunk context) and progressive refinement (order-dependent) are worst.

**Mitigations:**
- Confidence-calibrated conflict resolution (LLMxMapReduce, ToM)
- Order-invariance testing (permute inputs, verify stable output)
- General-purpose large models outperform specialized synthesis models (GPT-4 R²=0.808 vs PlanSum R²<0.25)

#### FM6: Positional Bias (Primacy/Recency)
**Description:** Systematic over-representation of content from certain positions in source material or generated output.

**Three manifestations:**
1. **Lost in the Middle:** >30% performance degradation for middle-positioned content in long contexts
2. **Hallucinate at the Last:** Faithfulness drops below 0.75 in final output sections; Llama allocates 3x more attention to final sentences
3. **Recency bias in book summarization:** Long-context models over-emphasize endings

**Most susceptible architectures:** Stuff-it-all (lost in the middle), any architecture producing long outputs (end-of-output hallucination), progressive refinement (primacy bias — older segments over-emphasized).

**Mitigations:**
- Chunked independent generation + merge (BooookScore approach achieves sensitivity near zero)
- Sliding window attention (Qwen maintains consistent faithfulness)
- Source ordering randomization + stability checks

#### FM7: Duplication and Redundancy
**Description:** Same information appears multiple times in consolidated output, wasting space and potentially creating false emphasis.

**Empirical rates:** 1.2% (hierarchical) to 2.1% (incremental) per sentence in book summaries.

**Most susceptible architectures:** Progressive refinement (running summary accumulates redundancy), flat map-reduce (no cross-chunk dedup).

**Mitigations:**
- Cross-reference deduplication during merge stages
- Entity-tracking across chunks (structured protocol)

---

### Failure Mode × Architecture Susceptibility Matrix

| Failure Mode | Stuff-All | Flat MR | Structured MR | Hier. Merge | Context-Aware HM | Refine | Tree MR |
|-------------|-----------|---------|---------------|-------------|-------------------|--------|---------|
| Hallucination Amplification | Low | Medium | Low | **High** | Medium | Medium | Low |
| Information Omission | **High** (middle) | Medium | Low | **High** | Medium | Medium | Low |
| Semantic Drift | Low | Low | Low | **High** | Medium | Medium | Low |
| Detail Flattening | Medium | Medium | Low | **High** | Medium | Medium | Low |
| False Synthesis | Medium | **High** | Medium | Medium | Medium | **High** | Low |
| Positional Bias | **High** | Low | Low | Medium | Medium | **High** | Low |
| Duplication | Low | Medium | Low | Low | Low | **High** | Low |

### How Failure Modes Differ by Source Type

**Contradictions across external sources (articles, web, books):**
- False synthesis is the dominant risk — models must reconcile genuinely conflicting claims
- Ordering sensitivity means presentation order affects which claim "wins"
- Mitigation: confidence-calibrated conflict resolution + explicit contradiction flagging

**Redundancy across agent outputs (structured, overlapping):**
- Duplication and detail flattening dominate — agents produce overlapping information that gets compressed into generic statements
- Information omission when unique details from one agent are drowned by repeated themes
- Mitigation: structured information protocol + entity-level deduplication before merge

**Mixed sources (agent outputs + external research):**
- All failure modes active simultaneously
- Source-type mismatch creates additional risk: structured agent output may be "flattened" to match unstructured narrative style
- Mitigation: source-type-specific preprocessing (NexusSum approach) + provenance tracking

---

### Key Quantitative Anchors for Consolidation System Design

| Metric | Value | Source | Implication |
|--------|-------|--------|-------------|
| Max effective single-pass context | ~32K tokens | Lost in the Middle; Llama 3.1 benchmarks | Beyond this, chunked approaches required |
| Hallucination rate in MDS | Up to 75% | From Single to Multi (2025) | Multi-doc consolidation needs aggressive verification |
| Faithfulness improvement from context augmentation | +13.6pp (59.1% → 72.7%) | Context-Aware HMerge (2025) | Source anchoring is the strongest single mitigation |
| Prompt chaining vs stepwise win rate | 77/100 | Prompt Chaining study (2024) | Multi-call refinement >> single-call "think step by step" |
| Best synthesis correlation (R²) | 0.808 (GPT-4) | Do MDS Models Synthesize? (2024) | General-purpose large models best at true synthesis |
| Refinement quality degradation | After 2-3 iterations | Multiple sources | Cap refinement loops; diminishing returns are real |
| End-of-output faithfulness drop | Below 0.75 in final section | Hallucinate at the Last (2025) | Generate shorter segments independently, then merge |
| Convergence rate for tri-agent audit | 89% at 12.3 mean iterations | RKS Framework (2025) | Formal stability guarantees come at high iteration cost |

---

## Implications for Consolidation Skill Design

### Architecture Selection Heuristic

1. **Small source set (<32K tokens total):** Stuff-it-all with positional bias mitigation (randomize source order, verify middle-content coverage)
2. **Large homogeneous sources (agent outputs):** Structured map-reduce with deduplication and entity tracking
3. **Large heterogeneous sources (mixed types):** Source-type-specific preprocessing → structured map-reduce → context-aware merge for final consolidation
4. **Very long single documents:** Context-aware hierarchical merging with Extract-Support augmentation
5. **Well-structured documents:** Tree-structured merging (ToM) for maximum fidelity

### Essential Fidelity Mechanisms

Regardless of architecture, the following mechanisms appear consistently across the highest-performing systems:

1. **Structured information protocol** — force intermediate representations to include facts, rationale, and confidence scores (not just text)
2. **Source provenance tracking** — maintain explicit links from consolidated claims back to source material through all stages
3. **Confidence-calibrated conflict resolution** — resolve contradictions based on evidence strength, not position
4. **Context-aware augmentation** — anchor intermediate stages to source material to prevent drift
5. **Output segmentation** — generate shorter segments independently and merge, rather than producing long continuous output (mitigates end-of-output hallucination)
6. **Iteration caps** — limit refinement to 2-3 iterations before quality degrades

---

## Sources

### Primary Papers

- [LLMxMapReduce (2024)](https://arxiv.org/abs/2410.09342) — Structured map-reduce framework
- [Context-Aware Hierarchical Merging (2025)](https://arxiv.org/abs/2502.00977) — Augmentation strategies for faithful merging
- [ToM: Tree-oriented MapReduce (2025)](https://arxiv.org/abs/2511.00489) — Tree-structured merging
- [From Single to Multi: MDS Hallucination (2025)](https://arxiv.org/abs/2410.13961) — Hallucination rates in multi-doc summarization
- [FABLES: Book-Length Faithfulness (2024)](https://arxiv.org/abs/2404.01261) — Faithfulness error taxonomy
- [BooookScore (ICLR 2024)](https://arxiv.org/abs/2310.00785) — Coherence evaluation framework
- [Hallucinate at the Last (2025)](https://arxiv.org/abs/2505.15291) — End-of-output positional bias
- [Do MDS Models Synthesize? (TACL 2024)](https://arxiv.org/abs/2301.13844) — Synthesis vs concatenation
- [Lost in the Middle (TACL 2024)](https://arxiv.org/abs/2307.03172) — Positional bias in long contexts
- [Prompt Chaining vs Stepwise (2024)](https://arxiv.org/abs/2406.00507) — Multi-call refinement superiority
- [Chain of Density (2023)](https://arxiv.org/abs/2309.04269) — Iterative entity densification
- [NexusSum (ACL 2025)](https://arxiv.org/abs/2505.24575) — Multi-agent narrative summarization
- [CoTHSSum (2025)](https://link.springer.com/article/10.1007/s44443-025-00041-2) — CoT + hierarchical segmentation
- [Recursive Knowledge Synthesis (2025)](https://arxiv.org/abs/2601.08839) — Tri-agent stability framework

### Implementations

- [LLMxMapReduce GitHub](https://github.com/thunlp/LLMxMapReduce)
- [LangChain Summarization](https://python.langchain.com/docs/how_to/summarize_refine/)
- [BooookScore GitHub](https://github.com/lilakk/BooookScore)

---

## Evidence Files

All evidence files are in the `evidence/` subdirectory:

| File | Topic |
|------|-------|
| `llmxmapreduce.md` | Structured map-reduce architecture |
| `context-aware-hierarchical-merging.md` | Context augmentation for hierarchical merging |
| `tom-tree-mapreduce.md` | Tree-oriented MapReduce |
| `hallucination-mds.md` | Multi-document hallucination rates |
| `fables-book-faithfulness.md` | Book-length faithfulness taxonomy |
| `booookscore.md` | Coherence evaluation and error types |
| `hallucinate-at-the-last.md` | End-of-output positional bias |
| `synthesis-models.md` | Whether MDS models truly synthesize |
| `prompt-chaining-vs-stepwise.md` | Multi-call vs single-call refinement |
| `recursive-knowledge-synthesis.md` | Tri-agent stability framework |
| `lost-in-the-middle.md` | Positional bias in long contexts |
| `nexussum.md` | Multi-agent narrative summarization |
| `chain-of-density.md` | Iterative entity densification |
