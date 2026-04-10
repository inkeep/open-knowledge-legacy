---
title: "Incremental Consolidation Patterns"
description: "Evidence on incremental knowledge consolidation architectures: agent memory systems (Mem0, Zep/Graphiti, Agent Zero, MemGPT, LangMem, CrewAI), knowledge graph incremental updates (LightRAG, GraphRAG), conflict resolution strategies (temporal recency, LLM-arbitrated, union), drift detection, claim matching stacks, the LSM-tree compaction analogy, and three-layer hot/warm/cold architecture."
created: 2026-03-21
last-updated: 2026-03-21
---

## 1. Agent Memory Systems — Convergent Architectures

Six independent systems converge on the same core pattern: extract claims → match via embedding similarity → LLM decides update action → apply with safety guards.

### Agent Zero: Five-Action Taxonomy

**Source:** [Agent Zero docs](https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations)

| Action | Trigger | Safety Guard |
|--------|---------|-------------|
| SKIP | Redundant/low-value | — |
| KEEP_SEPARATE | Related but distinct | — |
| MERGE | Complements existing | — |
| REPLACE | Supersedes existing | **0.9 cosine similarity threshold** |
| UPDATE | Augments existing | — |

Pipeline: extract keywords → hybrid search → top-8 candidates → LLM decides action → safety validation.

### Mem0: Dual-Phase Extraction-Update

**Source:** [arXiv:2504.19413](https://arxiv.org/abs/2504.19413)

Extraction: process new message with context → LLM generates candidate memories. Update: for each candidate, retrieve top-10 similar existing → LLM chooses ADD/UPDATE/DELETE/NOOP. Graph variant adds entity-level matching. 26% improvement over OpenAI baseline, 91% lower latency, 90%+ token savings.

### Zep/Graphiti: Temporal Knowledge Graph

**Source:** [arXiv:2501.13956](https://arxiv.org/abs/2501.13956)

Most complete incremental pipeline found (11 steps): ingest episode → extract entities → embed → resolve duplicates → extract facts → deduplicate → extract temporal metadata → identify contradictions → **invalidate overlapping edges** → integrate → assign communities.

Bi-temporal versioning: t_valid, t_invalid (real-world), t'_created, t'_expired (system). Prioritizes new information for edge invalidation. Single-step label propagation for communities but "periodic community refreshes remain necessary."

### MemGPT/Letta: Tiered Memory

**Source:** [arXiv:2310.08560](https://arxiv.org/abs/2310.08560)

LLM as memory manager, four tiers (core/buffer/archival/recall). **Sleep-time compute** pattern: background agents reorganize during idle periods, producing higher-quality consolidations than lazy in-conversation updates.

### LangMem SDK

**Source:** [LangChain blog, Feb 2025](https://blog.langchain.com/langmem-sdk-launch/)

Profile vs Collection distinction. Collection: INSERT/UPDATE/DELETE via `trustcall` extractor with schema-typed extraction. Profile: single document replaced wholesale. DELETE is a soft signal.

### CrewAI: Dual-Threshold

**Source:** [CrewAI docs](https://docs.crewai.com/en/concepts/memory)

0.98 cosine: pure vector dedup (no LLM). 0.85 cosine: triggers LLM consolidation (Keep/Update/Delete/Insert). Recall scoring: 0.5×semantic + 0.3×recency_decay + 0.2×importance, decay = 0.5^(age_days/30).

### AGM Belief Revision

**Source:** [arXiv:2603.17244](https://arxiv.org/html/2603.17244) (2026)

Immutable revisions + mutable tag pointers. New contradictions create new revision with `Supersedes` edge. Provably satisfies AGM postulates K*2–K*6 — only system with formal correctness guarantees.

## 2. Knowledge Graph Incremental Updates

### LightRAG

**Source:** EMNLP 2025 Findings. [arXiv:2410.05779](https://arxiv.org/abs/2410.05779)

Simplest viable: extract → union new nodes/edges → update affected elements. 70% reduction in update time vs full rebuild. No contradiction handling or temporal versioning.

### GraphRAG

**Source:** [Microsoft Research](https://www.microsoft.com/en-us/research/blog/moving-to-graphrag-1-0-streamlining-ergonomics-for-developers-and-users/)

v1.0 `graphrag update` CLI: delta computation, LLM caching, targeted Leiden updates. Community summary problem persists: "adding brand new content can alter community structure such that much of an index needs re-computed." 2025: 77% cost reduction via dynamic community selection (query-time lazy evaluation).

## 3. Conflict Resolution Strategies

| Strategy | Used By | Mechanism |
|----------|---------|-----------|
| Temporal recency wins | Zep/Graphiti | New edge invalidates old |
| LLM-arbitrated | Agent Zero, Mem0 | LLM examines both, decides |
| Union (preserve both) | LightRAG, GraphRAG | Conflicting claims coexist |

### Truth Discovery Algorithms

**Source:** Yin et al. KDD 2007. [ACM](https://dl.acm.org/doi/10.1145/1281192.1281309)

Iterative: claim true if stated by trustworthy sources, source trustworthy if provides true claims. TruthFinder: ~10% improvement over naive majority voting.

### Temporal Claim Classification

**Source:** [OpenAI Temporal Agents Cookbook](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents)

Static (point-in-time, never expire), Dynamic (ongoing, invalidated by newer facts), Atemporal (universal truths, no bounds).

## 4. Incremental Claim Matching

Three-layer stack:
1. **Exact dedup:** Bloom filter, O(1), ~10 bits/element
2. **Near-duplicate:** MinHash LSH, incremental insert supported
3. **Semantic matching:** FAISS IVF+PQ, online insertion, no rebuild. HNSW outperforms for dynamic KGs with O(log N) insert.

Annoy (Spotify) disqualified — immutable indexes. Thresholds: iText2KG 0.7 for entity resolution, Agent Zero 0.9 for REPLACE, CrewAI 0.85 for LLM consolidation / 0.98 for vector-only dedup.

## 5. Drift Detection

Three drift types:
- **Structural:** Community/cluster boundaries shift (Zep: periodic refresh needed)
- **Semantic:** Consolidated output drifts from sources (DriftLens: embedding distribution comparison)
- **Coverage:** Incrementally-added claims leave gaps (retrieval recall measurement)

| Trigger | Metric | Threshold |
|---------|--------|-----------|
| Conflict rate | % new claims contradicting existing | >15-20% |
| Coverage decay | Retrieval recall | <80% |
| Staleness | % claims past TTL | >30% |
| Domain classifier AUC | Reference vs current embeddings | ≥0.55 cluster reprocess; >0.65 full rebuild |

### Global vs Local Boundary

Systems using global clustering (GMM, Leiden) cannot be truly incremental. Systems using local merging (set union, vector similarity, Markov chains) achieve true O(new-document) cost.

## 6. Recommended Architecture: Three-Layer (Hot/Warm/Cold)

LSM-tree analog: write=extract claims, flush=add to staging, compaction=merge into consolidated body, tombstone=invalidated claim.

- **Hot:** Newly extracted claims, embeddings generated, not yet matched. Trigger: each new source.
- **Warm:** Claims matched and actioned (ADD/UPDATE/MERGE/SKIP), conflicts recorded. Trigger: per-source or batch.
- **Cold:** Fully consolidated prose, all claims integrated. Trigger: drift threshold or scheduled rebuild.

Hot→Warm is cheap (Agent Zero/Mem0 pattern). Warm→Cold is expensive (GraphRAG rebuild equivalent).

Recommended pattern: **hot-eager, cold-lazy** — process each new source through extraction and matching immediately, defer prose re-generation until requested or drift exceeds threshold.

## 7. Key Findings

1. Pure sequential summarization (refine chains) degrades after 2-3 iterations — "Broken Telephone" effect confirmed ([arXiv:2502.20258](https://arxiv.org/abs/2502.20258))
2. Bounded output caps error accumulation at ~10% — structured representations resist degradation better than prose
3. Six agent memory systems independently converge on extract→match→decide→apply with 4-5 action taxonomy
4. Three-layer architecture with drift-triggered compaction provides best balance of freshness and quality
5. On-demand with drift warnings is recommended compaction strategy
