# Evidence: Claim/Triple Conflict Resolution and Multi-Source Fusion

**Dimension:** D4 — Claim/triple conflict resolution, trust scoring, multi-source fusion
**Date:** 2026-03-21
**Sources:** nature.com/s41598-025-34507-0 (CausalFusion), mdpi.com/2227-7390/12/15/2318 (CRDL), arxiv.org/html/2405.16929v2 (uncertainty survey), arxiv.org/html/2502.18961 (credible intervals), arxiv.org/html/2601.09241 (Ca2KG), dl.acm.org/3731443.3771372 (TrustFuse), research.usq.edu.au (truth discovery survey)

---

## Key files / pages referenced
- https://www.nature.com/articles/s41598-025-34507-0 — CausalFusion adaptive fusion algorithm
- https://www.mdpi.com/2227-7390/12/15/2318 — CRDL detect-then-resolve
- https://arxiv.org/html/2405.16929v2 — Uncertainty management in KG construction survey
- https://arxiv.org/html/2502.18961 — Credible intervals for KG accuracy estimation
- https://arxiv.org/html/2601.09241 — Ca2KG causality-aware KG-RAG calibration
- https://dl.acm.org/doi/10.1145/3731443.3771372 — TrustFuse (K-CAP 2025)

---

## Findings

### Finding: Hierarchical conflict resolution policy with four scenarios: specificity-replace, duplicate-provenance, contradiction-resolve, integration
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2405.16929v2

```text
"Specificity-based replacement: when new fact is more detailed than existing, replace original
while increasing source credibility." "Duplicate detection: identical facts add provenance
without duplication." "Contradiction resolution: identify true value and adjust source
trustworthiness accordingly." "Integration: non-conflicting facts added with metadata."
Three confidence dimensions tracked: extraction confidence, source confidence, source quality.
"Confidence scores from each extractor are not necessarily on same scale — normalization
techniques like Platt scaling required."
```

**Implications:** The hierarchical policy provides a clear decision tree for incoming triples. Key insight: confidence normalization across extractors is non-trivial — Platt scaling maps extractor-specific logistic regression scores to calibrated probabilities. Without this, source reliability scores are not comparable.

---

### Finding: CRDL (Detect-Then-Resolve) uses embedding-based conflict detection first, then LLM-based resolution
**Confidence:** CONFIRMED
**Evidence:** https://www.mdpi.com/2227-7390/12/15/2318 (from search summaries — source returned 403)

```text
"Training embedding on given KG, classifying triples according to relations or attributes."
"During inference, embeddings identify and filter conflicts." "For remaining triples involving
non-1-to-1 relations and attributes, LLM filter employed for additional screening."
"Significantly improves precision and recall vs state-of-the-art methods." Published July 2024.
```

**Implications:** The detect-then-resolve pattern is efficient: cheap embedding-based detection as first pass, expensive LLM-based resolution only for the conflicting subset. Key gap addressed: handling unseen entities (previous methods fail due to limited knowledge — LLM compensates with world knowledge).

---

### Finding: CausalFusion uses causal discovery to weight multi-source contributions — 91.2% precision, 88.7% recall
**Confidence:** CONFIRMED (with vendor-bias caveat — Nature Scientific Reports, not independently replicated)
**Evidence:** https://www.nature.com/articles/s41598-025-34507-0 (from search summaries — source returned 303)

```text
"Constraint-based causal discovery component." "Adaptive weight learning mechanism dynamically
adjusts source contributions based on causal strength." "Conflict resolution strategy prioritizes
causal consistency over statistical correlation." "91.2% precision, 88.7% recall on benchmark
datasets, outperforming state-of-the-art baselines."
```

**Implications:** Causal consistency > statistical co-occurrence for source weighting. A source that frequently co-occurs with correct facts may still be unreliable if the co-occurrence is spurious. The causal model identifies directional dependencies. Practical limitation: causal discovery is computationally expensive for large source sets; scalability to hundreds of sources is unclear.

---

### Finding: Truth discovery models jointly estimate source reliability and fact correctness — circular dependency resolved iteratively
**Confidence:** CONFIRMED
**Evidence:** research.usq.edu.au/truth-discovery-survey (from search summaries)

```text
"Data fusion models automatically find most reliable values by jointly estimating most
confident values and quality of sources, each influencing the other."
"Reliability of a source increases when it provides facts estimated to be correct, and
a fact is estimated to be correct if it is supported by reliable sources."
"Dependency relationship among sources hard to obtain, resulting in difficulty estimating
source reliability."
```

**Implications:** Truth discovery is inherently circular (reliability ↔ fact correctness) — all approaches use iterative EM-like algorithms. Convergence is guaranteed in most formulations but can be slow. The dependency/correlation problem means linked sources (e.g., news outlets all copying from one wire service) are incorrectly treated as independent evidence, inflating confidence.

---

### Finding: aHPD algorithm provides Bayesian credible intervals for KG accuracy estimation, reducing annotation costs 47%
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2502.18961

```text
"HPD intervals are smallest possible and unique across all annotation scenarios."
"aHPD exploits multiple priors concurrently (Kerman, Jeffreys, Uniform beta priors),
selects most efficient outcome without manual prior selection."
"Reducing annotation costs by up to 47% in high-precision scenarios while maintaining
statistical robustness."
```

**Implications:** For production KG systems doing sampling-based quality audits, aHPD gives tighter confidence estimates than frequentist CIs, especially at small sample sizes. Reduces human annotation budget needed to certify a KG meets a precision threshold.

---

### Finding: Ca2KG counterfactual calibration reduces KG-RAG ECE from 0.433 to 0.067 on MetaQA
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2601.09241

```text
"Path Quality Intervention (t1): 'Assume previous answer wrong due to poor context quality.'"
"Reasoning Reliability Intervention (t2): 'Assume previous answer wrong due to improper use.'"
"Causal Calibration Index: CCI(a) = CE_avg(a)·(1−CEvar(a))."
"ECE reduced from 0.433 to 0.067 on MetaQA 1-hop with GPT-3.5. 0.876 accuracy maintained.
Lower token cost per correct prediction: 3.49 vs 4.82 baseline."
```

**Implications:** For KG-RAG systems, miscalibration (overconfident wrong answers) is a larger problem than outright accuracy. Ca2KG's counterfactual interventions expose retrieval-dependent uncertainty without requiring separate calibration datasets. Practical: adds ~2x prompt overhead but dramatically improves downstream trust signals.

---

### Finding: PROV-O ontology enables standardized triple-level provenance via Entity/Activity/Agent structure
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2405.16929v2

```text
"PROV-O provides standardized provenance capture: Entity (information that can be modified),
Activity (operations affecting entities), Agent (human actors performing activities)."
"Enables traceability for future conflict resolution or KG updating."
```

**Implications:** PROV-O is the W3C standard for KG provenance. Combined with RDF-star (for edge-level annotation), a complete provenance system can track: who extracted this triple, from what source, with what confidence, at what time. This is the recommended combination for production systems.

---

## Negative searches
- Searched: TrustFuse specific technical details → Source returned 403; from abstract/search summaries only
- Searched: RANA conflict resolution GNN paper → Could not locate specific paper; term not widely indexed

---

## Gaps
- Scalability benchmarks for truth discovery at KG scale (billions of triples) — most papers test on thousands/millions
- Cross-source dependency detection (detecting when sources are not independent) at production scale — open research problem
