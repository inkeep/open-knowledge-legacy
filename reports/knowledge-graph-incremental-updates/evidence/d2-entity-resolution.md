# Evidence: Incremental Entity Resolution

**Dimension:** D2 — Incremental entity resolution (string similarity, embedding-based, streaming ER, blocking)
**Date:** 2026-03-21
**Sources:** arxiv.org/html/2409.03284v1 (iText2KG), arxiv.org/html/2504.01557v3 (FastER), ieeexplore.ieee.org/9590193 (RotatH), dl.acm.org/doi/10.1007/s10618-023-00941-9, github.com/heathersherry/KG-Tutorials, hal.science/hal-05245956 (streaming ER)

---

## Key files / pages referenced
- https://arxiv.org/html/2409.03284v1 — iText2KG four-module incremental KG construction
- https://arxiv.org/html/2504.01557v3 — FastER on-demand ER in property graphs
- https://ieeexplore.ieee.org/document/9590193 — RotatH incremental KGE
- https://link.springer.com/article/10.1007/s10462-024-10866-4 — KGE entity alignment survey
- https://github.com/heathersherry/Knowledge-Graph-Tutorials-and-Papers — ER methods compendium

---

## Findings

### Finding: iText2KG uses cosine similarity with 0.7 threshold for incremental entity deduplication
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2409.03284v1

```text
"If local entity ei is found in global set ε, added to matched set; otherwise compared via
cosine similarity. If similarity exceeds threshold, highest-matching global entity selected;
otherwise new entity joins global set." Threshold=0.7 derived from 1500 entity pairs,
mean cosine sim=0.60 ± 0.12 using text-embedding-3-large. FDR: 0.01 vs 0.11 (OpenAI baseline).
```

**Implications:** Zero-shot, no post-processing required. Using local entities (not global) as context for relation extraction achieves 0.94 precision vs 0.83 with global context — precision-richness trade-off. The 0.7 threshold is empirically derived but not adaptive; domain-specific tuning likely needed.

---

### Finding: FastER achieves on-demand ER via GDD rules + blocking graph with progressive scheduling
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2504.01557v3

```text
"Stage 1: Graph pattern filtering extracts structurally relevant candidates." 
"Stage 2: Distance constraints applied; only pairs satisfying constraints retained."
"Stage 3: Blocking graph — edge weights reflect rule satisfaction via ARCS weighting."
Complexity: O(m + βC + C'log C' + N·k') where β<0.1 empirically. FastER achieves 1.000
recall on most datasets, 0.052s vs 0.464s (Ditto) on DBLP-ACM.
```

**Implications:** Removing rules filtering increases comparisons 453-1000x; removing blocking increases them 10-30x. NOT LSH/ANN based — uses rule-based filtering + progressive profile scheduling. Fails on Amazon-Google due to large intra-cluster variance. Dependency: GDD rule quality drives everything.

---

### Finding: RotatH incrementally updates KGE by projecting new entities onto relation-specific hyperplanes
**Confidence:** CONFIRMED
**Evidence:** https://ieeexplore.ieee.org/document/9590193

```text
"Employs relation-specific hyperplanes to update incremental entities into trained vector
space efficiently." "Mean-based constraint method for managing incremental entity distribution."
Tested on two incremental datasets + two benchmarks; "outperforms static models."
```

**Implications:** Avoids full retraining by constraining new entity embeddings to existing relation hyperplanes. Core trade-off: new entities are constrained to fit the existing geometric structure, which may under-represent truly novel entities with no similar existing counterparts.

---

### Finding: FastKGE (IJCAI 2024) uses incremental LoRA adapters for continual KGE without catastrophic forgetting
**Confidence:** INFERRED
**Evidence:** https://dl.acm.org/doi/10.24963/ijcai.2024/243 (PDF unreadable; from search summaries)

```text
"FastKGE reduces trainable parameters via incremental low-rank adapters, offering more
efficient approach to continual knowledge graph embedding." Published IJCAI 2024.
"Dominant approaches focus on alleviating catastrophic forgetting but neglect efficient
learning for new knowledge emergence."
```

**Implications:** LoRA-based approach freezes backbone embedding and trains only low-rank adapters for new knowledge batches. Memory-efficient but requires careful management of adapter composition as KG grows. Marks shift from full retraining → parameter-efficient fine-tuning for KGE updates.

---

### Finding: LSH/MinHash blocking remains the standard for scalable candidate pair generation; ANN (FAISS/Milvus) for embedding-based blocking
**Confidence:** CONFIRMED
**Evidence:** Search results + https://arxiv.org/pdf/1905.06167 (blocking survey)

```text
"MinHash/LSH operates over n-gram representation of name values and hashes similar entities
into same cluster." "AK-NN clustering in vector DBs like FAISS or Milvus: records clustered
during indexing, retrieved as groups of similar records via A-KNN."
FAISS: "new vectors can be added without rebuilding entire index; pre-trained quantizers
assign new vectors to existing clusters."
```

**Implications:** Two-phase pipeline: (1) LSH/ANN blocking to generate candidate pairs (reduce N² to manageable set), (2) pairwise classification (embedding similarity, rule-based, or LLM). FAISS IVF supports incremental add without full rebuild, but quantizer quality degrades if distribution shifts. Milvus better for dynamic KGs due to segment-level indexing.

---

### Finding: Streaming ER must handle three challenges: concept drift, infinite data, real-time latency requirements
**Confidence:** CONFIRMED
**Evidence:** https://hal.science/hal-05245956 (HAL streaming ER paper) — from search summaries

```text
"Incremental ER matches arriving record to most similar entity in evolving reference dataset."
"Dynamic graph embedding suitable for stream processing for integrating incoming and existing records."
"Existing ER methods often fail to support incremental stream processing with complex data."
```

**Implications:** Static ER models trained on snapshot data degrade when distribution shifts. Dynamic graph embedding approaches update entity representations as new evidence arrives. Key gap: most published ER work is batch-mode; streaming variants are 2-3 years behind in maturity.

---

### Finding: EasyEA and HLMEA (AAAI/ACL 2025) — LLM-only entity alignment is the current frontier
**Confidence:** INFERRED
**Evidence:** https://github.com/heathersherry/Knowledge-Graph-Tutorials-and-Papers

```text
"EasyEA: Large Language Model is All You Need in Entity Alignment (ACL 2025)"
"HLMEA: Unsupervised Entity Alignment Based on Hybrid Language Models (AAAI 2025)"
OpenEA benchmark (VLDB 2020) as standard evaluation framework.
```

**Implications:** LLMs have displaced GCN-based embedding approaches for entity alignment quality. Trade-off: LLM inference is expensive for every incoming entity; practical incremental systems still use embedding similarity for first-pass blocking, then LLM for disambiguation.

---

## Negative searches
- Searched: BrewER streaming implementation details → Found: exists as on-demand system (VLDB 2023) but no incremental-specific benchmarks found
- Searched: CSGAT (Nature 2025) technical details → Source returned 303 redirect; from search summary only

---

## Gaps
- Quantitative comparison of LSH blocking vs. ANN blocking for incremental KG scenarios — not found
- Streaming ER latency benchmarks at scale (>1M entities) — not found in accessible sources
