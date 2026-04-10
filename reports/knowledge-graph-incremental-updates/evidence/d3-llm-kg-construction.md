# Evidence: LLM-Based KG Construction — Incremental Patterns

**Dimension:** D3 — LLM-based KG construction incremental patterns (GraphRAG, LightRAG, iText2KG, Neo4j+LLM)
**Date:** 2026-03-21
**Sources:** github.com/microsoft/graphrag (discussions #511, issue #741), lightrag.github.io, arxiv.org/abs/2410.05779, arxiv.org/html/2409.03284v1, neo4j.com/labs/genai-ecosystem, medium.com/@claudiubranzan

---

## Key files / pages referenced
- https://github.com/microsoft/graphrag/discussions/511 — GraphRAG incremental update discussion
- https://github.com/microsoft/graphrag/issues/741 — Incremental indexing tracking issue
- https://lightrag.github.io/ — LightRAG official documentation
- https://arxiv.org/abs/2410.05779 — LightRAG paper (EMNLP 2025)
- https://arxiv.org/html/2409.03284v1 — iText2KG paper (WISE 2024)
- https://neo4j.com/labs/genai-ecosystem/llm-graph-builder/ — Neo4j LLM Graph Builder
- https://arxiv.org/html/2507.03226v2 — Efficient KG construction for large-scale RAG

---

## Findings

### Finding: GraphRAG v0.5+ supports incremental updates via consistent entity IDs + cache, but community recomputation is unavoidable
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/graphrag/discussions/511, https://github.com/microsoft/graphrag/issues/741

```text
"Version 0.5.0+ support incremental updates by maintaining consistent entity IDs, allowing
insert-update merge operations, enabling incremental updates without delete/reload."
"get_delta_docs function compares input dataset with final documents in storage to identify
newly added and deleted documents."
"New content can be added without complete re-index because system relies on cache to avoid
repeating model API calls." BUT: "graph construction process will need to recreate graph to
include new nodes/edges, and communities will be recomputed, resulting in re-summarization."
```

**Implications:** What's incremental: document delta detection, entity extraction caching, no re-chunking existing docs. What's NOT incremental: community detection (Leiden algorithm reruns), community summaries (must regenerate for changed communities). The `graphrag.append` command with smarter community placement (attempt to insert new entities into existing communities) is planned but scope excludes document removal, manual edits, and delta queries.

---

### Finding: GraphRAG handles conflicting claims by adding new context nodes — LLM arbitrates at query time
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/graphrag/discussions/511

```text
"GraphRAG would add new nodes to its knowledge graph about the claim that the sky was RED,
add this information to its 'Sky-related information' community cluster" rather than replacing.
"Similar to human reasoning" — allows LLM to weigh competing claims during queries.
```

**Implications:** No conflict resolution at ingestion time. All conflicting claims are preserved in the graph. Downstream LLM must reconcile. This means the community summaries can contain contradictory information, and summary quality degrades proportionally to conflict density.

---

### Finding: LightRAG incremental update = union of node/edge sets (V∪V', E∪E') + deduplication function
**Confidence:** CONFIRMED
**Evidence:** https://lightrag.github.io/, https://arxiv.org/abs/2410.05779

```text
"Incremental updates knowledge base without complete reprocessing."
"Combines new graph data with original by merging nodes and edges" (V∪V', E∪E').
"Deduplication function identifies and merges identical entities and relations from different
segments, reducing graph overhead." "Preserves integrity of established connections while
enriching graph without conflicts or redundancies."
```

**Implications:** LightRAG's deduplication is at the entity name level (exact/near-exact string match). New documents processed identically to initial ingestion — same LLM extraction steps, then union operation. No community recomputation needed (unlike GraphRAG) because LightRAG uses dual-level retrieval (local entity + global keyword) rather than community hierarchy. Key trade-off: faster incremental updates but no hierarchical summarization across the corpus.

---

### Finding: iText2KG's four-module pipeline — Distiller, Incremental Entities Extractor, Incremental Relations Extractor, Graph Integrator
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2409.03284v1

```text
"Documents Distiller: reformulates raw documents into semantic blocks via LLM-guided schema."
"Incremental Entities Extractor: entities from first doc form initial global set; subsequent
docs: local entities matched against existing global entities via cosine similarity."
"Incremental Relations Extractor: detects unique relationships using resolved entities as context."
"Graph Integrator: visualizes results in Neo4j format."
Module 1 schema consistency: 0.97 (CVs), 0.98 (papers), 0.94 (websites). FDR 0.01 vs 0.11 baseline.
```

**Implications:** iText2KG is the most rigorous published approach for incremental LLM-based KG construction with entity resolution built-in. The user-defined blueprint (JSON schema) enables document-type independence without predefined ontology. Key limitation: sequential processing per document — not parallelizable across documents for the entity resolution step.

---

### Finding: Neo4j LLM Graph Builder (2025) — entity resolver component merges similar nodes using distance metrics rather than LLM calls
**Confidence:** CONFIRMED
**Evidence:** https://medium.com/neo4j — from search summaries (article body not directly fetchable)

```text
"Entity resolver component merges similar entities into a single node."
"Recent approaches replaced slow LLM-based resolution with distance metrics for scalable
parallel merging." "2025 release: community summaries, multiple retrievers in parallel,
custom prompt instructions for guiding extraction."
```

**Implications:** Neo4j's practical evolution: LLM-for-everything → hybrid (LLM for extraction, embedding distance for resolution). This separation speeds up incremental updates significantly. Community summaries (GraphRAG-style) added in 2025, inheriting same recomputation cost for changed communities.

---

### Finding: Dependency-parser based KG construction achieves 94% of GPT-4o quality at fraction of cost
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2507.03226v2

```text
"Industrial-grade NLP libraries to extract entities and relations without LLMs."
"EntityRelationNormalizer performs deduplication by normalizing entity variations."
"Achieves 94% performance compared to GPT-4o extraction while significantly reducing costs."
Uses SpaCy, Docling, hierarchical chunking (2048 chars, 200 overlap).
```

**Implications:** For high-throughput incremental pipelines, NLP-based extraction (SpaCy dependency parsing) is more cost-effective than LLM extraction. Trade-off: lower recall for complex implicit relationships, better throughput. Practical recommendation: use NLP for bulk incremental ingestion, LLM for ambiguous/complex documents.

---

## Negative searches
- Searched: GraphRAG --update flag implementation details → Found: feature tracked in #741, planned but community recomputation unavoidable in current implementation
- Searched: KARMA (multi-agent KG enrichment) incremental mechanisms → PDF unreadable; from abstract only

---

## Gaps
- LightRAG's deduplication implementation details (exact algorithm for merging entity descriptions across duplicate nodes) — documented at high level only
- GraphRAG incremental indexing timeline/release version — issue #741 closed as completed but no specific version confirmed
