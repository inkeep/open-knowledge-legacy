---
title: "Knowledge Graph Incremental Updates: Temporal Versioning, Entity Resolution, and Claim Fusion"
description: "Comprehensive research on how knowledge graph systems handle incremental updates — covering temporal/bitemporal models (RDF, OSTRICH, Wikidata), entity resolution in streaming/incremental modes (LSH, ANN, embedding similarity), LLM-based KG construction incremental patterns (GraphRAG, LightRAG, iText2KG, Neo4j), contradictory claim resolution across multi-source inputs, and efficient indexing strategies for incremental entity matching."
createdAt: 2026-03-21
updatedAt: 2026-03-21
subjects:
  - OSTRICH
  - COBRA
  - ConVer-G
  - GraphRAG
  - LightRAG
  - iText2KG
  - Neo4j
  - Wikidata
  - FAISS
  - RDF-star
  - CRDL
  - CausalFusion
  - Ca2KG
  - FastER
  - RotatH
topics:
  - temporal knowledge graphs
  - incremental entity resolution
  - knowledge graph versioning
  - claim conflict resolution
  - ANN indexing for KG
  - knowledge graph construction
  - LLM knowledge extraction
---
# Knowledge Graph Incremental Updates: Temporal Versioning, Entity Resolution, and Claim Fusion

**Purpose:** This report answers the question of how KG systems handle incremental updates across five dimensions: how facts are versioned over time, how new entities are matched against existing ones, how LLM-based tools handle incremental graph construction, how contradictory claims are resolved, and how indexing supports efficient incremental matching. Intended for engineers designing or extending an incremental KG pipeline.

---

## Executive Summary

Incremental knowledge graph construction is a solved-in-theory, partially-solved-in-practice problem. The academic literature has robust answers for temporal versioning and entity resolution blocking; the LLM-based tooling ecosystem (GraphRAG, LightRAG, Neo4j) has recently made meaningful progress but still has gaps, especially in community recomputation costs and conflict resolution fidelity.

**Key Findings:**

- **Temporal versioning** has two mature storage approaches: OSTRICH's hybrid snapshot+delta chain (optimized for versioned queries, slow ingestion) and ConVer-G's bitstring condensed representation (efficient concurrent version querying). Wikidata's rank system (Preferred/Normal/Deprecated) is the most widely deployed practical model — it never deletes facts, it demotes them. RDF-star (RDF 1.2) provides the upcoming standard for edge-level provenance annotation, superior to named-graph workarounds.

- **Incremental entity resolution** converges on a two-phase pipeline: blocking (LSH/ANN to generate candidate pairs) followed by pairwise classification (embedding similarity, rule-based, or LLM). The 0.7 cosine similarity threshold (iText2KG, validated on 1500 pairs) is a useful starting point. FAISS IVF supports incremental add without full rebuild but degrades with distribution shift; HNSW is better for dynamic KGs. LoRA-based incremental KGE (FastKGE, IJCAI 2024) is the current efficient approach for updating embeddings without full retraining.

- **GraphRAG** supports incremental ingestion (v0.5+) via consistent entity IDs and caching, but community detection (Leiden algorithm) and community summary regeneration are unavoidable costs for changed communities. LightRAG handles incremental updates more cheaply (V∪V' union + deduplication) because it has no community hierarchy. iText2KG is the most rigorous published approach, achieving near-zero false discovery rate (0.01 vs. 0.11 baseline).

- **Conflict resolution** best practice is detect-then-resolve: cheap embedding-based detection as first pass, expensive LLM-based resolution only for the conflicting subset (CRDL pattern). Trust scoring follows the truth discovery paradigm: source reliability and fact correctness are estimated jointly and iteratively. The circular dependency (reliable sources → correct facts → reliable sources) requires EM-like iteration. The key practical gap: source correlation detection (multiple sources all copying from one origin) is an open problem at scale.

- **Efficient incremental indexing** at scale requires HNSW for dynamic insert patterns (O(log N) insertion, no periodic retraining), or FAISS IVF with periodic quantizer refresh (every 10-20% growth). The blocking quality metrics to track: Pairs Completeness (recall on true duplicates) and Reduction Ratio (fraction of pairs eliminated). Degrading PC signals the blocking strategy no longer covers new entity types.

**Bottom line for implementation:** A production incremental KG pipeline should combine (1) OSTRICH or Wikidata-rank-style versioning for temporal facts, (2) HNSW + cosine similarity blocking + LLM disambiguation for entity resolution, (3) LightRAG-style V∪V' union for fast incremental KG updates (or GraphRAG if hierarchical summaries are needed, accepting community recomputation cost), (4) CRDL detect-then-resolve for conflict handling, and (5) Bayesian credible intervals (aHPD) for quality estimation of the resulting graph.

---

## Research Rubric

| #  | Dimension                                                | Priority | Section   |
| -- | -------------------------------------------------------- | -------- | --------- |
| D1 | Temporal/versioned KG models                             | P0       | Section 1 |
| D2 | Incremental entity resolution                            | P0       | Section 2 |
| D3 | LLM-based KG construction incremental patterns           | P0       | Section 3 |
| D4 | Claim/triple conflict resolution and multi-source fusion | P0       | Section 4 |
| D5 | Efficient incremental indexing                           | P0       | Section 5 |

**Non-goals:** Full KG system implementation; SPARQL/Cypher tutorial; batch-only KG construction; KG reasoning/inference engines.

---

## Detailed Findings

### Section 1: Temporal and Versioned Knowledge Graph Models

**Finding:** Three storage paradigms dominate — hybrid snapshot+delta (OSTRICH), bitstring condensed representation (ConVer-G), and rank-based demotion without deletion (Wikidata). RDF-star is the emerging provenance annotation standard.

**Evidence:** [evidence/d1-temporal-versioning.md](evidence/d1-temporal-versioning.md)

#### 1.1 OSTRICH — Hybrid IC/CB/TB Storage

OSTRICH (Offset-enabled STore for TRIple CHangesets) stores a single materialized HDT snapshot followed by an aggregated delta chain. Each delta is independent of preceding deltas — any version requires at most one delta + one snapshot lookup, making version materialization (VM) O(1) regardless of version count.

Storage components:

- **Snapshot:** Full HDT-compressed graph for version 0
- **Delta chain:** Six B+Tree indexes (SPO, POS, OSP × additions/deletions) per delta
- **Streaming ingestion algorithm:** Sort-merge join over three streams (input, deletions, additions) with seven categorized triple-state cases

The critical trade-off: OSTRICH processes and stores significant metadata at ingestion time (\~125x slower than HDT) to dramatically improve query performance. On BEAR-A (10 versions, 30-66M triples each), VM queries run \~2x faster than HDT-CB; on BEAR-B-hourly (1,299 versions), VQ queries run nearly an order of magnitude faster.

[COBRA](https://rdfostrich.github.io/article-swj2020-cobra/) (2022) improves on OSTRICH by splitting the single long delta chain into two shorter chains pointing at a shared intermediary snapshot — bidirectional deltas. This significantly reduces ingestion time while maintaining query performance.

#### 1.2 ConVer-G — Bitstring Concurrent Versioning

[ConVer-G](https://arxiv.org/html/2409.04499) takes a different approach: each quad (subject, predicate, object, graph) is stored once with a bitstring where bit i=1 means the quad exists in version i. Adding a new version appends one bit to every relevant bitstring.

Query mechanism: bitwise AND operations determine quad presence across versions. This enables efficient concurrent queries across multiple versions simultaneously without the overhead of materializing each version. Implemented as QuaDer (PostgreSQL) + QuaQue (modified Fuseki with SPARQL GRAPH support).

**Trade-off vs. OSTRICH:** ConVer-G is better for concurrent multi-version queries; OSTRICH is better for single-version materialization with offset support. ConVer-G's main limitation: partial SPARQL operator support and untested scalability beyond 1000 versions.

#### 1.3 Wikidata's Practical Temporal Model

Wikidata never deletes superseded facts. Instead, it uses a three-tier rank system:

| Rank           | Meaning                     | SPARQL behavior                   |
| -------------- | --------------------------- | --------------------------------- |
| **Preferred**  | Current/most accurate value | Returned by default               |
| **Normal**     | Valid but not preferred     | Returned when no Preferred exists |
| **Deprecated** | Known incorrect or outdated | Hidden unless explicitly queried  |

Temporal qualifiers layer valid-time onto statements:

- **P580** (start time) / **P582** (end time): explicit interval for a statement's validity
- **P1319** (earliest) / **P1326** (latest): bounded uncertainty on point events

Example: Fernando Torres' membership in Atlético Madrid has two Normal-rank statements (2001-2007, 2016-2018) — both preserved in the graph. The current Preferred-rank statement reflects the most recently valid membership. This is effectively a bitemporal model: rank approximates transaction time, qualifiers represent valid time.

#### 1.4 RDF-star for Edge-Level Provenance

[RDF-star](https://blog.metaphacts.com/citation-needed-provenance-with-rdf-star) extends RDF with embedded triple syntax, enabling direct annotation of individual statements without reification overhead or named-graph workarounds:

```turtle
# Annotation syntax (RDF 1.2):
:Obama :presidentOf :USA {| :startTime "2009-01-20"^^xsd:date ;
                              :endTime "2017-01-20"^^xsd:date ;
                              :source :Wikipedia |} .
```

Named graphs were designed for collections of triples — using one named graph per statement is a workaround. RDF-star annotation syntax attaches metadata directly to the triple. The W3C RDF-star WG (active 2024, RDF 1.2 in progress) has standardized this for versioning, unconfirmed data, and temporal annotation use cases.

**Decision triggers:**

- If you need per-triple provenance (source, confidence, extraction timestamp): use RDF-star annotation syntax
- If you need full version history with time-travel queries: use OSTRICH or COBRA
- If you need concurrent multi-version queries: ConVer-G
- If you need a pragmatic "keep old facts, promote new ones" without timestamps: Wikidata-rank pattern

---

### Section 2: Entity Resolution in Incremental Mode

**Finding:** Incremental ER converges on a two-phase pipeline: blocking (candidate pair generation) followed by classification. The industry has moved from string-matching to embedding-similarity for the blocking phase, and from GCN-based alignment to LLM-based disambiguation for the classification phase.

**Evidence:** [evidence/d2-entity-resolution.md](evidence/d2-entity-resolution.md)

#### 2.1 The Two-Phase Pipeline

For a KG with N entities, naive pairwise comparison is O(N²). Blocking reduces this to a tractable candidate set:

```
Phase 1 — Blocking (candidate generation):
  Input: new entity e_new + existing KG with N entities
  Output: candidate set C ⊂ KG where |C| << N
  Mechanism: LSH (name-based) or ANN (embedding-based)

Phase 2 — Classification (match/no-match):
  Input: (e_new, c_i) pairs for c_i ∈ C
  Output: best match or "new entity"
  Mechanism: cosine similarity, rule-based, or LLM
```

The blocking quality ceiling matters critically: any true match missed during blocking is permanently lost (no second chance). This makes **Pairs Completeness** (recall on true duplicates) the primary blocking metric.

#### 2.2 iText2KG: Cosine Similarity with Validated Threshold

[iText2KG](https://arxiv.org/html/2409.03284v1) (WISE 2024) provides the most rigorous published incremental entity resolution for LLM-extracted KGs:

1. Entities from document 1 form the initial global set
2. For each subsequent document: extract local entities
3. Exact match → add to matched set
4. No exact match → compute cosine similarity vs. all global entities
5. If max similarity > 0.7 → merge with highest-matching global entity
6. Else → add as new entity

The 0.7 threshold was derived from 1,500 similar entity pair evaluations using text-embedding-3-large (mean cosine sim = 0.60 ± 0.12). Result: False Discovery Rate of 0.01 vs. 0.11 for OpenAI function-calling baseline.

**Key trade-off:** Using local (within-document) entities as context for relation extraction achieves 0.94 precision; using global entities achieves 0.83 precision — local context is more precise but less complete. Sequential document processing is the main throughput bottleneck.

#### 2.3 Incremental Knowledge Graph Embedding

For systems that maintain embedding representations of entities, two approaches exist:

**RotatH** (IEEE 2021): Projects new entities onto relation-specific hyperplanes within the existing trained vector space. Avoids full retraining. Limitation: new entities are geometrically constrained to fit existing structure — truly novel entities with no similar counterparts may be poorly represented.

**FastKGE / Incremental LoRA** ([IJCAI 2024](https://dl.acm.org/doi/10.24963/ijcai.2024/243)): Freezes backbone embeddings, trains only low-rank adapter parameters for each new knowledge batch. Addresses the catastrophic forgetting problem while minimizing compute. Marks the shift from full retraining → parameter-efficient fine-tuning for KGE updates.

#### 2.4 Streaming Entity Resolution

Streaming ER faces three additional challenges beyond batch ER: concept drift (entity distribution changes over time), infinite data (cannot store all historical comparisons), and real-time latency requirements. Most published ER work is batch-mode — streaming variants lag by 2-3 years in maturity.

Key systems:

- [BrewER](https://dl.acm.org/doi/BrewER) (VLDB 2023): On-demand ER without batch preprocessing
- [FastER](https://arxiv.org/html/2504.01557v3) (2025): GDD rules + blocking graph + progressive scheduling achieves near-linear complexity and 1.000 recall on most datasets, 0.052s vs 0.464s (Ditto) on DBLP-ACM

**LLM-based entity alignment (2025 frontier):** EasyEA (ACL 2025) and HLMEA (AAAI 2025) demonstrate LLM-only entity alignment, displacing GCN-based approaches on quality. Practical systems still use embedding similarity for first-pass blocking (cost constraint) and LLM for disambiguation of ambiguous candidates.

---

### Section 3: LLM-Based Knowledge Graph Construction — Incremental Patterns

**Finding:** The three major LLM-based KG tools take fundamentally different approaches to incremental updates. LightRAG has the cheapest incremental update (graph union + deduplication). GraphRAG has the most powerful knowledge structure (community hierarchy) but requires community recomputation on every update. iText2KG has the best entity resolution fidelity. Neo4j LLM Graph Builder (2025) represents the production-grade hybrid.

**Evidence:** [evidence/d3-llm-kg-construction.md](evidence/d3-llm-kg-construction.md)

#### 3.1 GraphRAG (Microsoft) — Incremental Indexing Status

[GraphRAG](https://microsoft.github.io/graphrag/) v0.5+ supports incremental updates with consistent entity IDs. The pipeline:

1. **Delta detection:** `get_delta_docs` compares input dataset against stored documents → identifies new/deleted docs
2. **Cached extraction:** New documents undergo entity extraction; existing documents use cached results (no re-chunking, no re-extraction)
3. **Graph reconstruction:** New nodes/edges added to the graph structure — unavoidable
4. **Community recomputation:** Leiden algorithm reruns; communities are re-detected → changed communities regenerate summaries

**What's truly incremental:** Document delta detection, entity extraction caching.
**What's NOT incremental:** Community detection + summary generation — these rerun for any change affecting community membership.

The planned `graphrag.append` command aims to insert new entities into existing communities without full re-clustering, using configurable thresholds for when full re-clustering becomes necessary. Explicitly out of scope: document removal, manual graph editing, delta analysis queries.

**Conflict handling:** GraphRAG adds new context nodes for conflicting claims (e.g., two documents disagreeing on a fact) rather than resolving at ingestion. The downstream LLM query arbitrates. This means community summaries can contain contradictory information — summary quality degrades proportionally to conflict density in the source corpus.

#### 3.2 LightRAG — Fast Incremental via Graph Union

[LightRAG](https://lightrag.github.io/) (EMNLP 2025, [arXiv:2410.05779](https://arxiv.org/abs/2410.05779)) incrementally updates via:

```
New graph G' = (V', E') from new document
Updated graph G_new = (V ∪ V', E ∪ E')
Apply deduplication D(·) to merge identical entities/relations
```

No community hierarchy means no recomputation overhead. LightRAG uses dual-level retrieval (local entity embedding + global keyword) rather than hierarchical community summaries. The deduplication function operates at entity name level — exact and near-exact string matches are merged.

**Strength:** Fastest incremental update among the three (no community recomputation).
**Weakness:** No hierarchical summarization across corpus means it cannot answer "give me a high-level summary of everything about topic X" as effectively as GraphRAG. Deduplication is name-level, not semantic — semantically equivalent entities with different surface forms may not merge.

#### 3.3 iText2KG — Blueprint-Guided Incremental Construction

[iText2KG](https://arxiv.org/abs/2409.03284) (WISE 2024) is the most rigorous published incremental LLM-based KG construction system:

| Module                          | Function                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| Document Distiller              | LLM reformulates raw docs into semantic blocks per user-defined JSON schema |
| Incremental Entities Extractor  | Cosine similarity-based matching against global entity set (threshold 0.7)  |
| Incremental Relations Extractor | Extracts relations using resolved entities as context                       |
| Graph Integrator                | Outputs to Neo4j                                                            |

Key performance: FDR 0.01 (iText2KG) vs. 0.11 (OpenAI baseline). The user-defined blueprint enables schema-guided extraction without a predefined ontology.

**Main limitation:** Sequential document processing — entity resolution step is not parallelizable across documents because later documents depend on entity resolutions from earlier ones.

#### 3.4 Neo4j LLM Graph Builder (2025) — Production-Grade Hybrid

The [Neo4j LLM Graph Builder](https://neo4j.com/labs/genai-ecosystem/llm-graph-builder/) 2025 release reflects the state of the art in production hybrid approaches:

- **Extraction:** LLM-based entity/relation extraction with schema guidance
- **Entity resolution:** Distance metrics (embedding similarity) replace slow LLM-based resolution for deduplication → enables parallel merging at scale
- **Community summaries:** Added in 2025 (GraphRAG-style), with same recomputation cost caveat
- **Multiple retrievers in parallel:** Combines vector, graph, and community summary retrieval

The evolution from LLM-for-everything to LLM-for-extraction + embeddings-for-resolution reflects the performance reality: LLM calls are too expensive for the deduplication step at scale. Embeddings handle lexical variation ("United States" / "USA" / "U.S.A.") that pure string matching misses.

**Dependency-parser alternative** ([arXiv:2507.03226](https://arxiv.org/html/2507.03226v2)): For high-throughput incremental ingestion, SpaCy-based dependency parsing achieves 94% of GPT-4o extraction quality at a fraction of the cost. Recommended for bulk incremental ingestion; use LLM extraction for complex/ambiguous documents.

---

### Section 4: Claim/Triple Conflict Resolution and Multi-Source Fusion

**Finding:** Best practice is detect-then-resolve (CRDL pattern): embedding-based conflict detection as cheap first pass, LLM-based resolution only for the conflicting subset. Trust scoring follows truth discovery paradigms with iterative EM-like estimation. The main open problem at scale: source correlation (multiple sources copying from one origin) is hard to detect and breaks the independence assumption.

**Evidence:** [evidence/d4-conflict-resolution.md](evidence/d4-conflict-resolution.md)

#### 4.1 Conflict Types and Detection

The uncertainty management survey ([arXiv:2405.16929](https://arxiv.org/html/2405.16929v2)) identifies four conflict scenarios when an incoming triple is evaluated against an existing KG:

| Scenario                                             | Action                                        |
| ---------------------------------------------------- | --------------------------------------------- |
| New fact is more specific than existing              | Replace existing, increase source credibility |
| Identical fact with different source                 | Add provenance without duplication            |
| Contradictory fact (same predicate, different value) | Resolve truth, adjust source trustworthiness  |
| Non-conflicting new fact                             | Add with metadata                             |

#### 4.2 CRDL: Detect-Then-Resolve

[CRDL](https://www.mdpi.com/2227-7390/12/15/2318) (2024) separates conflict detection from resolution:

1. **Detection:** Train KGE on existing graph; classify all incoming triples by relation/attribute type; use embeddings to identify conflicts (triples that contradict existing embedding structure)
2. **Resolution:** For non-1-to-1 relations and attributes: LLM-based filter for additional screening

Result: "Significantly improves precision and recall vs. state-of-the-art." The key insight: using embeddings for detection means the expensive LLM is only invoked for genuinely ambiguous cases (not for clearly consistent or clearly contradictory triples). Addresses the unseen entity problem where prior methods fail (LLM contributes world knowledge).

#### 4.3 Truth Discovery — Joint Source/Fact Reliability Estimation

The [truth discovery framework](https://research.usq.edu.au) models the circular dependency:

```
Reliable sources → support correct facts
Correct facts → are supported by reliable sources
```

All truth discovery algorithms resolve this via iterative EM-like estimation:

1. Initialize source reliabilities uniformly
2. Estimate fact confidence from source reliability-weighted votes
3. Update source reliability from estimated fact confidence
4. Repeat until convergence

**Critical limitation:** Sources are assumed independent. When multiple sources all copy from one origin (common in web-crawled KGs), the origin's reliability is inflated. Detecting source correlation at scale is an open research problem.

Confidence normalization is required: different extractors produce confidence scores on different scales (e.g., logistic regression scores from ReVerb are not comparable to cosine similarity scores from embedding-based extractors). [Platt scaling](https://en.wikipedia.org/wiki/Platt_scaling) is the standard normalization technique.

#### 4.4 CausalFusion — Source Weighting via Causal Discovery

[CausalFusion](https://www.nature.com/articles/s41598-025-34507-0) (Scientific Reports 2025) improves on statistical source weighting by using causal discovery to assess source contributions:

- Constraint-based causal discovery identifies directional dependencies between sources and facts
- Adaptive weight learning adjusts source contributions based on causal strength (not statistical correlation)
- Conflict resolution prioritizes causal consistency

Results: 91.2% precision, 88.7% recall on benchmark datasets. **Caveat:** Causal discovery is computationally expensive for large source sets; scalability to hundreds of sources is unclear.

#### 4.5 Confidence Tracking Per Triple

PROV-O combined with RDF-star provides the recommended implementation pattern:

```turtle
# Track per-triple confidence + provenance:
:Obama :presidentOf :USA {|
    prov:wasAttributedTo :WikipediaSource ;
    kg:extractionConfidence "0.95"^^xsd:decimal ;
    kg:sourceReliability "0.88"^^xsd:decimal ;
    kg:extractedAt "2026-01-15T10:00:00Z"^^xsd:dateTime
|} .
```

Three confidence dimensions to track per triple:

- **Extraction confidence:** Reliability of the extraction algorithm (logistic regression score, LLM probability)
- **Source confidence:** Trustworthiness of this specific source based on truth discovery history
- **Source quality:** Overall credibility rating of the source type

#### 4.6 Calibration for KG-RAG Systems

[Ca2KG](https://arxiv.org/html/2601.09241) demonstrates that for KG-RAG systems, miscalibration (overconfident wrong answers) is often a larger problem than raw accuracy. The counterfactual calibration approach reduces ECE from 0.433 → 0.067 while maintaining 0.876 accuracy on MetaQA. For incremental KGs where some facts are stale, calibrating model confidence to match actual reliability is essential for downstream decision quality.

---

### Section 5: Efficient Incremental Indexing

**Finding:** The standard architecture is HNSW (or FAISS IVF) for approximate nearest neighbor search during entity blocking, with periodic quantizer refresh for IVF variants. Two-phase blocking+classification is universal. The key operational metrics are Pairs Completeness (recall) and Reduction Ratio (precision of blocking).

**Evidence:** [evidence/d5-incremental-indexing.md](evidence/d5-incremental-indexing.md)

#### 5.1 The Two-Phase Incremental Matching Architecture

```
Incoming entity e_new (with name, description, aliases):
  ↓
Phase 1: Blocking
  ├── LSH/MinHash (name n-grams) → candidate set C_name
  └── ANN/HNSW (embedding) → candidate set C_embed
  → C = C_name ∪ C_embed  (union of blocking results)
  ↓
Phase 2: Classification
  For each c_i ∈ C:
    ├── Cosine similarity(embed(e_new), embed(c_i)) > threshold → match
    ├── Rule-based: attribute constraints (FastER GDD approach)
    └── LLM: for ambiguous candidates only
  → best match m* or "new entity"
  ↓
Action:
  ├── match found → merge e_new into m* (add provenance, update embeddings)
  └── no match → add e_new to KG as new entity
```

#### 5.2 Index Selection for Dynamic KGs

| Index Type  | Insert Complexity | Query Complexity | Rebuild Needed?             | Best For                          |
| ----------- | ----------------- | ---------------- | --------------------------- | --------------------------------- |
| HNSW        | O(log N)          | O(log N)         | No                          | Dynamic KGs, frequent inserts     |
| FAISS IVF   | O(1) amortized    | O(√N per probe)  | Yes (on distribution shift) | Memory-constrained, mostly-static |
| LSH/MinHash | O(1)              | O(k) per band    | No                          | Name/string blocking specifically |
| Exact KNN   | O(1) insert       | O(N)             | No                          | Small KGs (<100K entities)        |

**For incremental KG scenarios:** HNSW is recommended. Logarithmic insertion, no periodic retraining required, maintained quality as graph grows. Memory overhead (graph structure) is the trade-off — at 100M+ entities, FAISS IVF+PQ may be necessary for memory budgets.

FAISS IVF incremental add: new vectors are appended to existing Voronoi cells without redistribution. Quality degrades when distribution of new entities differs from training distribution. Rule of thumb: retrain IVF quantizer when \~10-20% of index is appended data.

[Milvus](https://milvus.io/) wraps FAISS with segment-level indexing, better handling distribution shift for production KGs without manual quantizer refresh triggers.

#### 5.3 Blocking Quality Metrics

Three metrics to monitor for incremental KG entity blocking:

| Metric                      | Formula                                               | Target   | Alert Condition                                 |
| --------------------------- | ----------------------------------------------------- | -------- | ----------------------------------------------- |
| **Pairs Completeness (PC)** | true duplicates in candidates / total true duplicates | >0.95    | PC declining → blocking misses new entity types |
| **Reduction Ratio (RR)**    | 1 - (candidate pairs / total pairs)                   | >0.99    | RR declining → too many false positives         |
| **F-measure**               | harmonic mean(PC, RR)                                 | Maximize | Overall blocking quality                        |

Degrading PC over time is the critical signal: it means the blocking strategy (name-based LSH or embedding ANN) no longer captures newly-introduced entity types. This happens when new documents introduce a domain vocabulary shift not represented in the original embedding/blocking key distribution.

**Meta-blocking** post-processes initial blocking results: assigns weights to edges in the bipartite entity-candidate graph (e.g., ARCS weighting in FastER), then prunes low-weight edges. This improves RR without significantly hurting PC. [JedAI3](https://github.com/jedai-framework) implements this for scalable distributed ER.

#### 5.4 FastER Performance Profile

[FastER](https://arxiv.org/html/2504.01557v3) (2025) achieves near-linear complexity O(m + βC + C'log C' + N·k') where β < 0.1 empirically:

- Removing GDD rule filtering: 453-1000x more comparisons
- Removing blocking graph: 10-30x more comparisons
- Removing PPS pruning: 1.6-3x more comparisons

This generalizes: any rule-based pre-filter reducing candidates by 90%+ gives 10x efficiency gain over blocking-only approaches. The rules are the efficiency multiplier — embedding-only approaches cannot match this unless the embedding discriminates as well as domain rules.

#### 5.5 Production Recommendations

For a new incremental KG pipeline at medium scale (1M-100M entities):

1. **Blocking index:** HNSW (e.g., via Qdrant or Milvus) on entity embeddings (text-embedding-3-large or equivalent)
2. **Supplemental name blocking:** MinHash LSH on entity name n-grams (catches cases where embedding similarity is insufficient for name-matching)
3. **Classification:** Cosine similarity ≥ 0.7 → automatic merge; 0.5-0.7 → LLM disambiguation; < 0.5 → new entity
4. **Monitoring:** Track PC and RR weekly; alert on >5% drop in PC
5. **Quantizer maintenance:** Not needed with HNSW; trigger periodic HNSW index rebuilds only if query latency degrades (>50% slower than baseline)

---

## Limitations and Open Questions

### Dimensions Not Fully Covered

- **BiTRDF (MDPI 2025):** MDPI source returned 403. Details of bitemporal RDF data model with valid-time + transaction-time as first-class references inferred from search summaries only. Confidence: INFERRED.
- **TrustFuse (K-CAP 2025):** Source returned 403. Details of uncertain knowledge reconciliation testbed inferred from abstract.
- **RANA conflict resolution:** Could not locate specific paper. Term not well-indexed; may be a workshop paper.
- **Streaming ER latency benchmarks at scale:** Quantitative benchmarks for ER at >1M entities in streaming mode not found in accessible sources.
- **Source correlation detection at scale:** Identified as critical open problem; no production-ready solution found.

### Out of Scope (per Rubric)

- Graph query language (SPARQL/Cypher) tutorial
- Non-incremental batch KG construction
- KG reasoning/inference engines (SPARQL OWL reasoners, etc.)
- Full KG system implementation guide

---

## References

### Evidence Files

- [evidence/d1-temporal-versioning.md](evidence/d1-temporal-versioning.md) — OSTRICH, COBRA, ConVer-G, Wikidata ranks, RDF-star, temporal KG survey
- [evidence/d2-entity-resolution.md](evidence/d2-entity-resolution.md) — iText2KG, FastER, RotatH, FastKGE, blocking survey, streaming ER
- [evidence/d3-llm-kg-construction.md](evidence/d3-llm-kg-construction.md) — GraphRAG, LightRAG, iText2KG, Neo4j LLM Graph Builder
- [evidence/d4-conflict-resolution.md](evidence/d4-conflict-resolution.md) — CRDL, CausalFusion, truth discovery, aHPD, Ca2KG, PROV-O
- [evidence/d5-incremental-indexing.md](evidence/d5-incremental-indexing.md) — FastER, FAISS, HNSW, blocking metrics, production recommendations

### External Sources

#### Temporal Versioning

- [OSTRICH: Triple Storage for Random-Access Versioned Querying of RDF Archives](https://rdfostrich.github.io/article-jws2018-ostrich/) — OSTRICH architecture and benchmarks
- [COBRA: Bidirectional Delta Chains for RDF Archives](https://rdfostrich.github.io/article-swj2020-cobra/) — COBRA improvement to OSTRICH
- [ConVer-G: Concurrent Versioning of Knowledge Graphs](https://arxiv.org/html/2409.04499) — Bitstring condensed representation
- [Wikidata Help:Ranking](https://www.wikidata.org/wiki/Help:Ranking) — Preferred/Normal/Deprecated rank system
- [Citation needed: provenance with RDF-star](https://blog.metaphacts.com/citation-needed-provenance-with-rdf-star) — RDF-star vs. named graphs
- [A Survey on Temporal Knowledge Graph Representation Learning](https://arxiv.org/html/2403.04782v1) — Four temporal KG paradigms
- [Towards Probabilistic Bitemporal Knowledge Graphs](https://dl.acm.org/doi/fullHtml/10.1145/3184558.3191637) — BiTKG model
- [A Survey for Managing Temporal Data in RDF](https://www.sciencedirect.com/science/article/abs/pii/S0306437924000267) — Comprehensive RDF temporal survey
- [Time Travel with the BiTemporal RDF Model](https://www.mdpi.com/2227-7390/13/13/2109) — BiTRDF model (2025)

#### Entity Resolution

- [iText2KG: Incremental Knowledge Graphs Construction Using Large Language Models](https://arxiv.org/html/2409.03284v1) — Four-module pipeline with cosine similarity ER
- [FastER: On-Demand Entity Resolution in Property Graphs](https://arxiv.org/html/2504.01557v3) — GDD rules + blocking graph
- [Incremental Update of Knowledge Graph Embedding by Rotating on Hyperplanes](https://ieeexplore.ieee.org/document/9590193) — RotatH incremental KGE
- [Fast and Continual Knowledge Graph Embedding via Incremental LoRA](https://dl.acm.org/doi/10.24963/ijcai.2024/243) — FastKGE LoRA-based approach
- [Knowledge Graph Embedding Methods for Entity Alignment: Experimental Review](https://dl.acm.org/doi/10.1007/s10618-023-00941-9) — Entity alignment survey
- [Entity Resolution for Streaming Data with Embeddings](https://hal.science/hal-05245956/document) — Streaming ER challenges
- [A Scalable Approach to Incrementally Building Knowledge Graphs](https://usc-isi-i2.github.io/papers/gleb16-tpdl.pdf) — USC ISI incremental KG building
- [Knowledge-Graph Tutorials and Papers: Entity Resolution](https://github.com/heathersherry/Knowledge-Graph-Tutorials-and-Papers/blob/master/topics/Entity%20Resolution,%20Entity%20Matching%20and%20Entity%20Alignment.md) — Comprehensive ER literature index
- [A Survey of Blocking and Filtering Techniques for Entity Resolution](https://arxiv.org/pdf/1905.06167) — Blocking survey

#### LLM-Based KG Construction

- [GraphRAG: Welcome](https://microsoft.github.io/graphrag/) — Microsoft GraphRAG documentation
- [GraphRAG Incremental Update Discussion #511](https://github.com/microsoft/graphrag/discussions/511) — Community discussion on incremental updates
- [GraphRAG Incremental Indexing Issue #741](https://github.com/microsoft/graphrag/issues/741) — Feature tracking
- [LightRAG: Simple and Fast Retrieval-Augmented Generation](https://arxiv.org/abs/2410.05779) — LightRAG paper (EMNLP 2025)
- [LightRAG Official Documentation](https://lightrag.github.io/) — Incremental update mechanism
- [iText2KG: WISE 2024](https://dl.acm.org/doi/10.1007/978-981-96-0573-6_16) — Published paper
- [Neo4j LLM Knowledge Graph Builder](https://neo4j.com/labs/genai-ecosystem/llm-graph-builder/) — Neo4j Labs tooling
- [Efficient Knowledge Graph Construction for Large-Scale RAG](https://arxiv.org/html/2507.03226v2) — Dependency-parser based approach
- [From LLMs to Knowledge Graphs: Production-Ready Systems in 2025](https://medium.com/@claudiubranzan/from-llms-to-knowledge-graphs-building-production-ready-graph-systems-in-2025-2b4aff1ec99a) — Practitioner guide

#### Conflict Resolution and Multi-Source Fusion

- [Detect-Then-Resolve: CRDL for KG Conflict Resolution](https://www.mdpi.com/2227-7390/12/15/2318) — CRDL approach
- [CausalFusion: Adaptive Fusion for Multi-Source Heterogeneous KGs](https://www.nature.com/articles/s41598-025-34507-0) — CausalFusion
- [Uncertainty Management in KG Construction: A Survey](https://arxiv.org/html/2405.16929v2) — Four-scenario conflict policy, confidence tracking
- [Credible Intervals for Knowledge Graph Accuracy Estimation](https://arxiv.org/html/2502.18961) — aHPD Bayesian approach
- [Ca2KG: Causality-Aware Calibration for KG-RAG](https://arxiv.org/html/2601.09241) — ECE reduction 0.433→0.067
- [TrustFuse: Uncertain Knowledge Reconciliation Testbed](https://dl.acm.org/doi/10.1145/3731443.3771372) — K-CAP 2025
- [Multi-source Knowledge Fusion: A Survey](https://link.springer.com/article/10.1007/s11280-020-00811-0) — Source reliability and truth discovery
- [Triple Trustworthiness Measurement for Knowledge Graph](https://arxiv.org/pdf/1809.09414) — Per-triple confidence
- [A Survey on Truth Discovery](https://www.kdd.org/exploration_files/Article1_17_2.pdf) — Truth discovery fundamentals
- [KARMA: Multi-Agent LLMs for Automated KG Enrichment](https://arxiv.org/pdf/2502.06472) — KARMA multi-agent approach

#### Efficient Indexing

- [FastER: On-Demand Entity Resolution in Property Graphs](https://arxiv.org/html/2504.01557v3) — Near-linear ER complexity
- [High-Throughput Vector Similarity Search in Knowledge Graphs](https://dl.acm.org/doi/10.1145/3589777) — KG-native vector indexing
- [The FAISS Library](https://arxiv.org/html/2401.08281v4) — FAISS incremental add capabilities
- [Embedding-Assisted Entity Resolution for Knowledge Graphs](https://openreview.net/forum?id=7CTQYejUClq) — Embedding+blocking combination
- [Neural Networks for Entity Matching: A Survey](https://arxiv.org/pdf/2010.11075) — DeepER and AutoBlock approaches
- [Matching KGs in Entity Embedding Spaces](https://openreview.net/pdf?id=qIuDCK3Yzi5) — Experimental study
- [Scaling Semantic Search with FAISS: Billion-Scale Challenges](https://medium.com/@deveshbajaj59/scaling-semantic-search-with-faiss-challenges-and-solutions-for-billion-scale-datasets-1cacb6f87f95) — Production FAISS guidance

### Related Research

- [/Users/edwingomezcuellar/.claude/reports/llm-knowledge-consolidation-fidelity/](llm-knowledge-consolidation-fidelity/) — Covers LLM consolidation architectures, GraphRAG community structure for scope-aware consolidation, and factuality verification pipelines. Complementary to this report's Section 3 but focused on output fidelity rather than graph infrastructure.

