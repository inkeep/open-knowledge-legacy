# Incremental Consolidation Patterns

**Follow-up to**: LLM Knowledge Consolidation Fidelity report
**Date**: 2026-03-21
**Question**: How can knowledge consolidation work incrementally — adding new sources to an existing consolidated body without reprocessing everything?

---

## Executive Summary

Incremental consolidation is a solved problem at the architectural level but an open problem at the semantic quality level. Every major AI agent memory system (Mem0, Zep/Graphiti, Agent Zero, MemGPT) implements some form of incremental knowledge update, and their approaches converge on a remarkably similar pattern: **extract claims from new input → match against existing knowledge via embedding similarity → use LLM reasoning to decide the update action → apply the action with safety guards**.

The critical finding is that three distinct system families — agent memory, knowledge graphs, and RAG indexes — have independently converged on the same core operation taxonomy. Agent Zero uses 5 actions (SKIP/KEEP_SEPARATE/MERGE/REPLACE/UPDATE). Mem0 uses 4 (ADD/UPDATE/DELETE/NOOP). Zep/Graphiti uses edge invalidation with temporal versioning. These are surface variations of the same underlying decision: given a new claim and a set of similar existing claims, should the system ignore it, add it alongside, merge it in, or replace what exists?

For the `/consolidate` skill, the recommended incremental mode uses a **three-layer architecture** (hot/warm/cold) inspired by LSM-tree compaction, with claim-level granularity, embedding-based matching, and LLM-arbitrated conflict resolution. Full re-consolidation is triggered by drift detection metrics rather than on a fixed schedule.

---

## 1. Incremental Summarization and Running Knowledge Bases

### 1.1 The Refine Chain Problem

LangChain's `ConversationSummaryBufferMemory` keeps recent interactions in raw form and compiles older ones into a running summary. When the buffer exceeds a token threshold, old messages are summarized and the summary replaces them. This is the simplest incremental pattern: **append until overflow, then compress**.

The parent report already identified that refine chains (processing documents one at a time, iteratively updating a running summary) degrade after 2-3 iterations. This is now empirically confirmed by the "Broken Telephone" paper ([arXiv:2502.20258](https://arxiv.org/abs/2502.20258), ACL 2025), which directly measures information distortion across chained LLM calls and finds that **distortion accumulates progressively and inevitably with chain length**. The rate of degradation depends on domain familiarity and chain complexity. Anchor-based prompting (keeping original text in context) partially mitigates but does not eliminate the effect.

A complementary finding from recursive dialogue memory research ([arXiv:2308.15022](https://arxiv.org/html/2308.15022v3)) offers a nuance: when output is bounded (e.g., 20-sentence cap), error accumulation is capped at ~10% inaccuracy rather than growing without bound. The bounded output acts as a regularizer. This suggests that **structured, bounded representations resist degradation better than open-ended prose summaries**.

**Implication**: Pure sequential summarization is not viable for incremental consolidation over many sources. The consolidated body must be structured (claims, entities, relationships) rather than a free-text summary, so that incremental updates can target specific elements rather than rewriting the whole.

### 1.2 Progressive Summarization (Human Pattern)

Tiago Forte's Progressive Summarization methodology provides a useful human analog ([Forte Labs](https://fortelabs.com/blog/basboverview/)). Knowledge is distilled in four layers:

1. **Layer 1**: Raw captured excerpts
2. **Layer 2**: Bold key points within excerpts (~10-20% of Layer 1)
3. **Layer 3**: Highlight within bold (~10-20% of Layer 2)
4. **Layer 4**: Executive summary in your own words (most valuable sources only)

Key design insight: **distillation happens at point of use, not at capture time**. Notes accumulate at Layer 1, and deeper layers are only created when the note is revisited. This suggests that incremental consolidation doesn't need to fully process each new source immediately — a lighter initial integration followed by deeper consolidation on demand may be more practical.

### 1.3 RAPTOR: Hierarchical Trees (Batch-Only)

RAPTOR ([Sarthi et al., ICLR 2024](https://arxiv.org/abs/2401.18059)) builds recursive summarization trees via soft clustering (GMMs) and abstractive summarization at each level. It achieves strong retrieval results (20% accuracy improvement on QuALITY benchmark) but **provides no mechanism for incremental updates**. Adding a new leaf document could shift cluster boundaries, requiring cascade updates through parent summaries. This is the same problem Microsoft GraphRAG faces with community summaries.

**Implication**: Hierarchical summarization structures are powerful for retrieval but inherently batch-oriented. Incremental approaches must solve the "cascade update" problem or accept lazy/deferred updates at higher abstraction levels.

---

## 2. Agent Memory Systems: Convergent Architectures

### 2.1 Agent Zero: Five-Action Taxonomy

Agent Zero implements the most explicit incremental consolidation taxonomy found ([Agent Zero docs](https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations)):

| Action | Trigger | Safety Guard |
|--------|---------|-------------|
| **SKIP** | New memory is redundant or low-value | — |
| **KEEP_SEPARATE** | New memory is related but distinct | — |
| **MERGE** | New memory complements existing | — |
| **REPLACE** | New memory supersedes existing | **0.9 cosine similarity threshold** |
| **UPDATE** | New memory augments existing | — |

The pipeline: extract keywords → hybrid search (keyword + semantic) → retrieve up to 8 candidates → LLM decides action with reasoning → execute with safety validation.

The 0.9 similarity threshold for REPLACE is a critical safety rail — it prevents accidental overwrites when the LLM is uncertain about whether two memories truly refer to the same thing.

### 2.2 Mem0: Dual-Phase Extraction-Update

Mem0 ([arXiv:2504.19413](https://arxiv.org/abs/2504.19413)) cleanly separates extraction from update:

**Extraction phase**: Process new message pair with conversation summary and recent context → LLM generates candidate salient memories.

**Update phase**: For each candidate, retrieve top 10 semantically similar existing memories → LLM chooses action via function-calling:
- **ADD**: No semantic equivalent exists
- **UPDATE**: Complementary information for existing memory
- **DELETE**: New info contradicts existing memory
- **NOOP**: No action needed

The graph-based variant (Mem0^g) adds entity-level matching: compute embeddings for source/destination entities, search for existing nodes exceeding similarity threshold, create or reuse nodes, detect conflicting relationships, resolve via LLM.

**Performance**: 26% improvement over OpenAI baseline, 91% lower latency, 90%+ token savings.

### 2.3 Zep/Graphiti: Temporal Knowledge Graph

Zep's Graphiti engine ([arXiv:2501.13956](https://arxiv.org/abs/2501.13956)) provides the **most complete incremental ingestion pipeline found**:

1. Ingest episode with reference timestamp
2. Extract entities (including speaker) with n=4 context window
3. Embed entities (1024-dim); cosine + full-text candidate search
4. Resolve duplicates via LLM comparison → updated name and summary
5. Extract facts between entity pairs with key predicate
6. Generate fact embeddings; deduplicate via constrained hybrid search
7. Extract temporal metadata (t_valid, t_invalid) from context
8. Identify contradictions via LLM comparison against existing edges
9. **Invalidate overlapping edges**: set t_invalid of old edge to t_valid of new edge
10. Integrate via deterministic Cypher queries
11. Assign new entities to communities via single label propagation step

**Bi-temporal versioning**: Each fact tracks four timestamps — system transaction times (t'_created, t'_expired) and real-world validity times (t_valid, t_invalid). This enables both audit trails and temporal reasoning.

**Contradiction resolution**: "Graphiti consistently prioritizes new information when determining edge invalidation" — a deterministic temporal-recency strategy.

**Community updates**: New entities are assigned to communities via single-step label propagation (survey neighboring communities, assign to plurality). But "periodic community refreshes remain necessary" since this approximation gradually diverges from full Leiden algorithm results.

### 2.4 MemGPT/Letta: Tiered Memory with Async Consolidation

MemGPT ([arXiv:2310.08560](https://arxiv.org/abs/2310.08560)) uses the LLM itself as the memory manager, with four tiers (core/buffer/archival/recall) analogous to CPU cache. The key architectural insight for incremental consolidation is the **sleep-time compute** pattern (2024-2025): dedicated background agents run during idle periods to proactively reorganize memory blocks, producing higher-quality consolidations than lazy in-conversation updates.

### 2.5 LangMem SDK: Schema-Typed Extraction with Profile/Collection Split

LangMem ([LangChain blog, Feb 2025](https://blog.langchain.com/langmem-sdk-launch/)) replaces LangChain's legacy memory classes with a purpose-built SDK. Its key design innovation is the **Profile vs Collection** distinction:

- **Collection mode**: Multiple independent memory objects. LLM can INSERT new facts, UPDATE existing ones, or DELETE superseded ones. Supports temporal reasoning and evidence accumulation.
- **Profile mode**: A single document replaced wholesale on each update. No accumulation, no conflicts possible. Best when only current state matters.

The `trustcall` extractor enables schema-typed structured extraction: the LLM receives new messages alongside existing memories and issues typed operations (INSERT/UPDATE/DELETE). DELETE is a soft signal — the caller decides whether to hard-delete, soft-delete, or down-weight.

### 2.6 CrewAI: Dual-Threshold Consolidation

CrewAI Memory ([docs](https://docs.crewai.com/en/concepts/memory)) introduces a practical **dual-threshold** pattern:

- **0.98 cosine similarity**: Pure vector dedup, no LLM call. Catches near-exact duplicates cheaply in batch mode.
- **0.85 cosine similarity**: Triggers LLM consolidation. The LLM decides: Keep / Update / Delete / Insert.

Recall scoring uses a composite: `0.5 × semantic_similarity + 0.3 × recency_decay + 0.2 × importance`, where `recency_decay = 0.5^(age_days / 30)`.

### 2.7 AGM Belief Revision: Formal Guarantees

A 2026 paper ([arXiv:2603.17244](https://arxiv.org/html/2603.17244)) formalizes memory conflict handling using AGM belief revision theory. Key innovation: **immutable revisions + mutable tag pointers**. When a contradiction arrives, a new revision is created with a `Supersedes` edge to the prior revision. The tag pointer updates to the new revision, but the old one remains auditable. The system provably satisfies AGM postulates K*2–K*6 — the only system found with formal correctness guarantees for belief revision.

---

## 3. Knowledge Graph Incremental Updates

### 3.1 LightRAG: Union-Based Graph Merge

LightRAG ([EMNLP 2025 Findings](https://arxiv.org/abs/2410.05779)) uses the simplest viable incremental approach:
1. Process new documents through the same extraction pipeline as original documents
2. Union new nodes and edges into the existing graph
3. Only update specifically affected nodes and relationships

**Performance**: Up to 70% reduction in update processing time vs full rebuild.

**Trade-off**: Simple and fast, but no explicit contradiction handling or temporal versioning. Entity resolution during union relies on implicit name/embedding matching.

### 3.2 Microsoft GraphRAG: The Community Summary Problem

GraphRAG v0.5.0+ supports incremental entity updates via consistent entity IDs ([GitHub](https://github.com/microsoft/graphrag/discussions/511)). GraphRAG 1.0 (December 2024) introduced a `graphrag update` CLI command that computes deltas between existing index and new content, uses LLM caching to reduce re-processing cost, and updates community structure via Leiden algorithm only where needed ([Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/moving-to-graphrag-1-0-streamlining-ergonomics-for-developers-and-users/)).

However, the **community summary problem** persists: the blog acknowledges that "adding brand new content can alter the community structure such that much of an index needs to be re-computed." The update command minimizes this but does not eliminate it — documents spanning multiple communities or introducing new themes still approach full reprocessing cost.

GraphRAG's 2025 update achieves 77% cost reduction via **dynamic community selection** — assessing report relevance at query time rather than eagerly updating summaries. This is a lazy-evaluation approach: defer summary updates until query time, then filter irrelevant community reports.

**Implication**: For hierarchical consolidated knowledge, lazy evaluation at query time may be more practical than eager summary propagation.

### 3.3 LlamaIndex: Document-Level Refresh

LlamaIndex provides production-ready incremental indexing ([docs](https://developers.llamaindex.ai)):
- `refresh(documents)`: Compare document IDs, detect changed content, re-process only modified documents
- Document-to-node mapping tracks constituent nodes per document
- Property Graph Index (May 2024) adds LLM-based knowledge graph construction with incremental insert

**Limitation**: Operates at document granularity, not claim granularity. A single changed sentence in a document triggers re-processing of the entire document.

---

## 4. Conflict Resolution in Incremental Mode

### 4.1 Temporal Recency vs Accumulated Consensus

The systems surveyed use three distinct conflict resolution strategies:

| Strategy | Used By | Mechanism |
|----------|---------|-----------|
| **Temporal recency wins** | Zep/Graphiti | New edge invalidates old edge; t_invalid set to t_valid of new |
| **LLM-arbitrated** | Agent Zero, Mem0 | LLM examines both claims and decides action |
| **Union (preserve both)** | LightRAG, GraphRAG | Conflicting claims coexist as separate entries |

### 4.2 Truth Discovery Algorithms

The truth discovery literature ([Yin et al., KDD 2007](https://dl.acm.org/doi/10.1145/1281192.1281309)) provides a principled framework for multi-source conflicts:

**Core principle**: A claim is likely true if stated by trustworthy sources. A source is trustworthy if it provides true claims. Resolved iteratively.

**Algorithm template**:
1. Initialize source weights
2. Compute claim confidence from source weights
3. Update source weights from claim confidences
4. Repeat until convergence

**TruthFinder** achieves ~10% improvement over naive majority voting. For incremental consolidation, source trust scores provide a principled way to weight new vs existing information without requiring full recomputation.

### 4.3 Temporal Claim Classification

The OpenAI Temporal Agents cookbook ([OpenAI](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents)) defines three claim categories with different invalidation behaviors:

- **Static**: Point-in-time events. Valid from occurrence, never expire. *"John was appointed CEO on 4 Jan 2024"*
- **Dynamic**: Ongoing states. Invalidated by newer static facts. *"John is the CEO"*
- **Atemporal**: Universal truths. No temporal bounds. *"Water boils at 100°C at sea level"*

This classification determines how conflicts should be resolved: static facts are permanent, dynamic facts are superseded by newer static facts, and atemporal facts require consensus-based resolution.

### 4.4 Recommended Approach for /consolidate

A hybrid strategy combining temporal recency with source trust:

1. **Default**: New source claims that contradict existing claims trigger LLM arbitration
2. **High-confidence existing claims** (supported by multiple prior sources): Require stronger evidence to override — new claim is KEPT_SEPARATE unless source trust score exceeds threshold
3. **Single-source existing claims**: More easily updated by newer information (temporal recency)
4. **Domain-dependent**: Some domains favor recency (news, prices), others favor consensus (scientific facts, historical events)

A concrete recency-weighted scoring formula from recent research ([arXiv:2509.19376](https://arxiv.org/pdf/2509.19376)):

```
score(q, d, t) = α · cos(q, d) + (1 - α) · 0.5^(age_days(t) / h)
```

With α = 0.7 (semantic weight) and h = 14-day half-life. Pure cosine similarity (α = 1.0) achieves 0.0 accuracy on freshness queries — temporal signal is not optional for domains with time-sensitive facts.

---

## 5. Staleness and Decay

### 5.1 Temporal Validity Windows

Zep's bi-temporal model (real-world validity + system transaction time) is the most complete approach found. Each fact carries:
- `t_valid`: When the fact became true in the real world
- `t_invalid`: When the fact stopped being true (null if still valid)
- `t'_created`: When the system recorded the fact
- `t'_expired`: When the system marked the fact as obsolete

### 5.2 Confidence Decay Functions

No production system surveyed implements explicit confidence decay functions, but the literature suggests three approaches:

- **Exponential decay**: confidence(t) = initial_confidence × e^(-λt). Fast-changing domains (news, social media)
- **Step function**: confidence drops to zero after a fixed TTL. Appropriate for time-bounded facts (event schedules, prices)
- **No decay**: Confidence only changes when contradicting evidence arrives. Appropriate for stable domains (historical facts, scientific principles)

### 5.3 Practical Recommendation

For the `/consolidate` skill, implement staleness as metadata rather than automatic decay:
- **Timestamp each claim** with source date and ingestion date
- **Flag stale claims** based on domain-appropriate TTL (configurable)
- **Don't auto-delete**: Let the user or a verification step decide whether stale claims should be removed or refreshed

---

## 6. Incremental Claim Matching

### 6.1 The Matching Problem

When a new source is decomposed into claims, each claim must be compared against the existing claim inventory to determine the appropriate action (ADD/UPDATE/MERGE/SKIP/REPLACE). Naive pairwise comparison is O(n×m) where n = new claims and m = existing claims.

### 6.2 Three-Layer Claim Matching Stack

Production systems converge on a layered approach with increasing cost and semantic depth:

| Layer | Tool | What It Catches | Cost |
|-------|------|----------------|------|
| **1. Exact dedup** | Bloom filter | Hash-identical claims | O(1), ~10 bits/element |
| **2. Near-duplicate** | MinHash LSH ([datasketch](https://ekzhu.com/datasketch/lsh.html)) | Textually similar claims | Incremental insert supported |
| **3. Semantic matching** | FAISS IVF+PQ | Semantically equivalent claims | `index.add()` without rebuild |

**Critical**: Annoy (Spotify) has immutable indexes — disqualified for incremental use. FAISS supports online insertion. HNSW outperforms FAISS IVF for dynamic KGs with O(log N) insert and no periodic retraining.

**Empirically validated thresholds**: iText2KG uses cosine 0.7 for entity resolution (validated on 1500 pairs, FDR 0.01). Agent Zero uses 0.9 for REPLACE safety. CrewAI uses 0.85 for LLM consolidation and 0.98 for vector-only dedup. The pattern: lower thresholds for matching/discovery, higher thresholds for destructive operations.

All production agent memory systems use embedding-based similarity as the primary matching stage:
- **Mem0**: text-embedding-3-small, top-10 retrieval per candidate
- **Agent Zero**: Cosine similarity via vector database, top-8 retrieval
- **Zep/Graphiti**: 1024-dim embeddings with cosine + full-text hybrid search

### 6.3 Hybrid Search (Keyword + Semantic)

Agent Zero's two-layer approach combines:
1. **Keyword extraction**: LLM generates search keywords from the new claim
2. **Semantic similarity**: Vector cosine distance
3. **Hybrid ranking**: Combine keyword and semantic scores

This addresses a known weakness of pure embedding search: semantically similar but factually different claims may have high cosine similarity. Keyword matching adds precision.

### 6.4 Constrained Search (Zep Pattern)

Zep constrains fact deduplication to entity pairs: when checking if a new fact "A relates-to B" already exists, search is limited to existing facts involving entities A and B. This dramatically reduces the search space and prevents false positive matches.

**Implication for /consolidate**: If claims are decomposed with subject-object structure, matching can be constrained to claims sharing at least one entity, reducing computational cost.

---

## 7. Drift Detection

### 7.1 When to Trigger Full Re-Consolidation

Incremental updates accumulate approximation errors over time. Three categories of drift signal:

**Structural drift**: Community/cluster boundaries shift as new entities are added. Zep acknowledges this: "periodic community refreshes remain necessary" since single-step label propagation diverges from full Leiden algorithm results.

**Semantic drift**: The consolidated output drifts from source material. DriftLens ([arXiv:2406.17813](https://arxiv.org/abs/2406.17813)) detects this by comparing embedding distributions of incrementally-updated representations vs a reference distribution.

**Coverage drift**: Incrementally-added claims may not integrate well with existing consolidated structure, leaving gaps. Measurable by sampling source claims and checking retrieval recall against the consolidated body.

### 7.2 Practical Drift Triggers

| Trigger | Metric | Threshold |
|---------|--------|-----------|
| **Conflict rate** | % of new claims contradicting existing | >15-20% suggests domain shift |
| **Coverage decay** | Retrieval recall of source claims against consolidated body | <80% triggers rebuild |
| **Staleness accumulation** | % of claims past TTL without refresh | >30% triggers review |
| **Update count** | Number of incremental updates since last full rebuild | Domain-dependent cap |
| **Community coherence** | Intra-cluster similarity in graph-based systems | Declining trend triggers refresh |
| **Domain classifier AUC** | Binary classifier: reference vs current embeddings | AUC ≥ 0.55 → cluster reprocess; >0.65 → full rebuild |

### 7.3 The Global vs Local Boundary

The fundamental architectural determinant of whether incremental updates are possible is whether the system uses **global** or **local** knowledge organization:

| Approach | Incremental? | Why |
|----------|-------------|-----|
| Refine chain | Yes | Markovian — only needs previous summary |
| Mem0 / Agent Zero | Yes | Top-k retrieval bounds cost to O(1) vs knowledge base size |
| LightRAG | Yes | Additive graph union |
| Progressive Summarization | Yes (by design) | Lazy, layered, non-destructive |
| RAPTOR | **No** | GMM clustering is corpus-wide |
| GraphRAG (pre-1.0) | **No** | Community detection is corpus-wide |
| GraphRAG 1.0 | Partial | Delta command, but community updates cascade |

Systems using **global clustering algorithms** (GMM, Leiden) cannot be truly incremental because a new document can reassign any existing node to a different cluster. Systems using **local merging** (set union, vector similarity lookup, Markov chains) achieve true O(new-document) incremental cost.

### 7.4 Partial vs Full Rebuild

Not every drift signal requires full re-consolidation:

- **Affected-cluster rebuild**: Only re-process claims in drifted clusters/communities
- **Cascade-limited rebuild**: Re-process changed leaves and propagate up only N levels
- **Periodic refresh**: Full rebuild on a schedule (e.g., every 10 incremental updates), regardless of drift signals

---

## 8. Practical Architectures for Incremental Consolidation

### 8.1 The LSM-Tree Analog

Log-structured merge-trees provide the clearest architectural metaphor for incremental knowledge consolidation:

| LSM Concept | Knowledge Consolidation Analog |
|-------------|-------------------------------|
| Write to memtable | Extract claims from new source |
| Flush to SSTable | Add claims to staging area |
| Compaction | Merge staged claims into consolidated body |
| Tombstone | Invalidated/contradicted claim |
| Read amplification | Query cost across un-compacted claim layers |
| Write amplification | Cost of re-consolidating already-processed claims |

Three compaction strategies map to consolidation patterns:

- **Size-tiered** (accumulate, batch merge): Collect incremental updates, merge when batch size threshold is reached
- **Leveled** (eager merge): Merge each new claim immediately into consolidated body
- **Time-windowed** (temporal cohorts): Consolidate claims within temporal batches

### 8.2 Recommended Three-Layer Architecture for /consolidate

```
┌──────────────────────────────────────────────┐
│                 HOT LAYER                     │
│  Newly extracted claims from latest source    │
│  • Claim decomposition complete               │
│  • Embeddings generated                       │
│  • Not yet matched against existing claims     │
│  Trigger: Each new source ingestion            │
├──────────────────────────────────────────────┤
│                 WARM LAYER                    │
│  Claims matched and actioned but not yet      │
│  integrated into consolidated prose           │
│  • Match results: ADD/UPDATE/MERGE/SKIP/etc   │
│  • Conflict resolutions recorded              │
│  • Claim inventory updated                    │
│  Trigger: Matching pass (per-source or batch)  │
├──────────────────────────────────────────────┤
│                 COLD LAYER                    │
│  Fully consolidated knowledge base            │
│  • Coherent prose output                      │
│  • All claims integrated and cross-referenced │
│  • Community/cluster summaries current         │
│  Trigger: Compaction (drift threshold or       │
│           scheduled rebuild)                   │
└──────────────────────────────────────────────┘
```

**Hot → Warm transition** (per source, cheap): Extract claims, generate embeddings, match against existing claim inventory, record actions. This is the Agent Zero / Mem0 pattern.

**Warm → Cold transition** (periodic, expensive): Re-render the consolidated prose from the updated claim inventory. This is the expensive step — equivalent to GraphRAG community summary rebuild or RAPTOR tree reconstruction. Triggered by drift metrics or schedule.

### 8.3 Production Hybrid Pattern

The dominant production architecture is a **triple-layer hybrid** exemplified by Glean ([connector framework docs](https://www.glean.com/resources/product-videos/working-ai-glean-connector-framework-for-enterprise-search)):

1. **Full crawl** on initial connection
2. **Real-time webhooks/CDC** for instant updates (sub-minute latency)
3. **Scheduled incremental sync** as safety net for missed events

Notion AI uses Debezium CDC on Postgres → Kafka → Apache Hudi, processing block-level changes incrementally every 30 minutes — abandoning full snapshots that took 10+ hours at 2x the cost ([Notion engineering blog](https://www.notion.com/blog/building-and-scaling-notions-data-lake)).

**Content hash gating** (LangChain's `SQLRecordManager` pattern) provides cheap change detection: a SQLite ledger stores `file_path → content_hash`. In a corpus where 95% of documents are stable, 95% of compute is eliminated — from 45-minute full reprocessing to 2-3 second overhead ([Particula](https://particula.tech/blog/update-rag-knowledge-without-rebuilding)).

### 8.4 Event-Driven vs Batch Processing for /consolidate

| Pattern | Hot→Warm | Warm→Cold | Best For |
|---------|----------|-----------|----------|
| **Fully event-driven** | Per source | Per source | Small, high-value corpus |
| **Hot-eager, cold-lazy** | Per source | On demand / scheduled | Growing research corpus |
| **Fully batched** | Batch window | Batch window | Large document streams |

The **hot-eager, cold-lazy** pattern is recommended for `/consolidate`:
- Process each new source through claim extraction and matching immediately (maintain accurate claim inventory)
- Defer prose re-generation until explicitly requested or triggered by drift metrics
- This avoids the refine-chain quality degradation while keeping the claim inventory current

For the event-sourcing variant: maintain an append-only log of all source documents. Serving layer (consolidated output) is a derived projection that can be rebuilt by replaying the log. This pays its largest dividend during "model upgrades" — if the claim extraction prompt changes, replay the log through the new pipeline without touching the source store (Kappa architecture pattern).

### 8.5 The Compaction Trigger Decision

When should warm-layer claims be compacted into a cold-layer rebuild? Three strategies:

1. **Threshold-based**: Rebuild when >N new claims have accumulated in warm layer
2. **Drift-based**: Rebuild when conflict rate, coverage, or coherence metrics cross thresholds
3. **On-demand**: Rebuild only when user requests fresh consolidated output

For the `/consolidate` skill, **on-demand with drift warnings** is recommended: the skill maintains the claim inventory incrementally, and when the user requests output, it checks drift metrics and either serves the existing cold layer (if drift is low) or triggers a rebuild (if drift is high).

---

## 9. Synthesis: What Incremental Mode Should /consolidate Support?

### 9.1 Core Operations

Adopt a **five-action taxonomy** (synthesized from Agent Zero and Mem0):

| Action | When | Effect on Consolidated Body |
|--------|------|----------------------------|
| **SKIP** | New claim is redundant with existing | No change |
| **ADD** | New claim covers new ground | Add to claim inventory |
| **UPDATE** | New claim augments existing claim | Modify existing claim text |
| **REPLACE** | New claim supersedes existing (0.9 similarity guard) | Replace existing claim, archive old |
| **CONTRADICT** | New claim conflicts but resolution is ambiguous | Keep both, flag for review |

### 9.2 Incremental Pipeline

```
New Source → Decompose into Claims → Generate Embeddings
    → For each claim:
        → Retrieve top-K similar existing claims (hybrid search)
        → If no matches above threshold: ADD
        → If matches found: LLM arbitrates action
            → SKIP / UPDATE / REPLACE / CONTRADICT
    → Update claim inventory (warm layer)
    → Check drift metrics
    → If drift exceeds threshold: trigger cold-layer rebuild
    → Else: serve existing consolidated output with warm-layer overlay
```

### 9.3 Claim Inventory Structure

Each claim in the inventory should carry:

```
{
  claim_text: string,
  claim_embedding: vector,
  source_ids: string[],          // which sources support this claim
  source_dates: date[],          // when sources were published
  ingestion_date: date,          // when claim was added to inventory
  confidence: float,             // derived from source count and trust
  status: "active" | "superseded" | "contradicted" | "stale",
  superseded_by: claim_id?,      // if REPLACED, pointer to replacement
  contradicted_by: claim_id?,    // if CONTRADICTED, pointer to conflicting claim
  entities: string[],            // extracted entities for constrained search
  last_verified: date?,          // for staleness tracking
}
```

### 9.4 What This Means for /consolidate Invocation

Two modes for the skill:

**Batch mode** (existing, from parent report): All sources provided at once. Full decompose-verify-recompose pipeline.

**Incremental mode** (new):
- `--incremental --existing <path-to-prior-output>`: Add new sources to existing consolidated body
- Reads prior consolidated output + claim inventory (if available)
- Processes new sources through incremental pipeline
- Outputs updated consolidated body + updated claim inventory
- Optional: `--rebuild` flag forces full re-consolidation from all sources

### 9.5 Open Questions

1. **Claim inventory persistence format**: JSON? SQLite with vector extension? Dedicated vector DB? For a CLI skill, a single JSON file with claims + a numpy array of embeddings may be simplest.

2. **Embedding model dependency**: Incremental mode requires consistent embeddings across invocations. Model choice must be stable.

3. **Source identity**: How to identify "the same source updated" vs "a new source"? LlamaIndex's `doc_id` + content hash pattern is practical.

4. **Warm-layer overlay rendering**: When serving consolidated output before a cold-layer rebuild, how should warm-layer claims be presented? Options: inline annotations, appendix section, or transparent integration.

---

## Evidence Index

| File | System/Topic |
|------|-------------|
| [mem0-architecture.md](evidence/mem0-architecture.md) | Mem0 dual-phase extraction-update |
| [zep-graphiti-temporal-kg.md](evidence/zep-graphiti-temporal-kg.md) | Zep/Graphiti 11-step incremental pipeline |
| [agent-zero-consolidation.md](evidence/agent-zero-consolidation.md) | Agent Zero five-action taxonomy |
| [lightrag-incremental-graph.md](evidence/lightrag-incremental-graph.md) | LightRAG union-based graph merge |
| [graphrag-incremental-challenges.md](evidence/graphrag-incremental-challenges.md) | GraphRAG community summary problem |
| [memgpt-tiered-memory.md](evidence/memgpt-tiered-memory.md) | MemGPT/Letta tiered memory + async consolidation |
| [truth-discovery-algorithms.md](evidence/truth-discovery-algorithms.md) | TruthFinder and multi-source conflict resolution |
| [progressive-summarization.md](evidence/progressive-summarization.md) | Forte's progressive distillation methodology |
| [raptor-tree-structure.md](evidence/raptor-tree-structure.md) | RAPTOR hierarchical tree (batch-only limitation) |
| [drift-detection-methods.md](evidence/drift-detection-methods.md) | DriftLens, AdWin, prototype-based detection |
| [lsm-tree-compaction-analog.md](evidence/lsm-tree-compaction-analog.md) | LSM-tree compaction as architectural analog |
| [llamaindex-document-management.md](evidence/llamaindex-document-management.md) | LlamaIndex insert/update/refresh API |
| [crdt-merge-semantics.md](evidence/crdt-merge-semantics.md) | CRDT convergent merge properties |
| [broken-telephone-degradation.md](evidence/broken-telephone-degradation.md) | Empirical distortion in iterative LLM generation |
| [langmem-sdk.md](evidence/langmem-sdk.md) | LangMem SDK trustcall extraction + Profile/Collection pattern |
| [crewai-dual-threshold.md](evidence/crewai-dual-threshold.md) | CrewAI dual-threshold consolidation (0.85/0.98) |
| [agm-belief-revision.md](evidence/agm-belief-revision.md) | Formal belief revision with immutable revisions |
| [production-architectures.md](evidence/production-architectures.md) | Glean, Notion, IncRML, quality monitoring thresholds |
| [conflict-resolution-stack.md](evidence/conflict-resolution-stack.md) | Truth discovery library, temporal classification, claim matching stack |

## Sources

- [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) — arXiv:2504.19413 (2025)
- [Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956) — arXiv:2501.13956 (2025)
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — arXiv:2310.08560 (2023)
- [RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval](https://arxiv.org/abs/2401.18059) — ICLR 2024
- [LightRAG: Simple and Fast Retrieval-Augmented Generation](https://arxiv.org/abs/2410.05779) — EMNLP 2025 Findings
- [Agent Zero Memory Operations](https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations) — DeepWiki
- [Microsoft GraphRAG Incremental Updates Discussion](https://github.com/microsoft/graphrag/discussions/511) — GitHub
- [Truth Discovery with Multiple Conflicting Information Providers](https://dl.acm.org/doi/10.1145/1281192.1281309) — KDD 2007
- [A Survey on Truth Discovery](https://www.kdd.org/exploration_files/Article1_17_2.pdf) — ACM SIGKDD Explorations
- [From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting](https://arxiv.org/abs/2309.04269) — arXiv:2309.04269 (2023)
- [Unsupervised Concept Drift Detection from Deep Learning Representations](https://arxiv.org/abs/2406.17813) — arXiv (2024)
- [LlamaIndex Document Management](https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/) — LlamaIndex docs
- [LangChain Conversational Memory](https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/) — Pinecone
- [Letta/MemGPT Concepts](https://docs.letta.com/concepts/memgpt/) — Letta docs
- [Mem0 AI Memory Layer](https://mem0.ai/research) — Mem0
- [Building a Second Brain](https://fortelabs.com/blog/basboverview/) — Forte Labs
- [Incremental Updates in RAG Systems](https://dasroot.net/posts/2026/01/incremental-updates-rag-dynamic-documents/) — DasRoot (2026)
- [CRDT.tech](https://crdt.tech/) — CRDT specification and resources
- [LSM-Tree Compaction Strategies](https://medium.com/@rastogi.shivank16/lsm-tree-database-compaction-strategies-when-to-use-size-tiered-leveled-or-time-windowed-f40b5f839e3c) — Medium
- [GraphRAG 1.0 Ergonomic Updates](https://www.microsoft.com/en-us/research/blog/moving-to-graphrag-1-0-streamlining-ergonomics-for-developers-and-users/) — Microsoft Research
- [LLM as a Broken Telephone: Iterative Generation Distorts Information](https://arxiv.org/abs/2502.20258) — ACL 2025
- [Recursively Summarizing Enables Long-Term Dialogue Memory](https://arxiv.org/html/2308.15022v3) — arXiv:2308.15022 (2023)
- [LangChain Refine Chain Deep Dive](https://kioku-space.com/en/langchain-summarization-3/) — Kioku Space
- [LangChain Summarization Chain Types Benchmarks](https://www.mikeysharma.com/blogs/langchain-summarization-chain-types-guide) — Mikey Sharma
- [LangMem SDK Launch](https://blog.langchain.com/langmem-sdk-launch/) — LangChain Blog (2025)
- [Long-term Memory Conceptual Guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) — LangMem
- [CrewAI Memory Documentation](https://docs.crewai.com/en/concepts/memory) — CrewAI
- [Graph-Native Cognitive Memory for AI Agents](https://arxiv.org/html/2603.17244) — arXiv:2603.17244 (2026)
- [Graphiti GitHub](https://github.com/getzep/graphiti) — Zep
- [Mem0 Graph Memory](https://docs.mem0.ai/open-source/features/graph-memory) — Mem0 docs
- [How Notion Builds Their Data Lake](https://www.notion.com/blog/building-and-scaling-notions-data-lake) — Notion Engineering
- [Glean Connector Framework](https://www.glean.com/resources/product-videos/working-ai-glean-connector-framework-for-enterprise-search) — Glean
- [Update RAG Knowledge Without Rebuilding](https://particula.tech/blog/update-rag-knowledge-without-rebuilding) — Particula
- [IncRML: Incremental KG Construction](https://www.semantic-web-journal.net/content/incrml-incremental-knowledge-graph-construction-heterogeneous-data-sources) — Semantic Web Journal
- [Kappa Architecture](https://milinda.pathirage.org/kappa-architecture.com/) — Milinda Pathirage
- [Embedding Drift: The Quiet Killer of RAG Quality](https://dev.to/dowhatmatters/embedding-drift-the-quiet-killer-of-retrieval-quality-in-rag-systems-4l5m) — DEV Community
- [Quality Assessment for Evolving Knowledge Bases](https://semantic-web-journal.net/content/quality-assessment-approach-evolving-knowledge-bases) — Semantic Web Journal
- [Python truthdiscovery library](https://truthdiscovery.readthedocs.io/en/latest/) — Sums, TruthFinder, Investment implementations
- [Knowledge-Based Trust](https://arxiv.org/abs/1502.03519) — Google, VLDB 2015
- [TCR: Transparent Conflict Resolution in RAG](https://arxiv.org/abs/2601.06842) — arXiv (2026)
- [Solving Freshness in RAG with Recency Prior](https://arxiv.org/pdf/2509.19376) — arXiv (2025)
- [TempValid: Confidence is not Timeless](https://aclanthology.org/2024.acl-long.580/) — ACL 2024
- [OpenAI Temporal Agents Cookbook](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents) — OpenAI
- [datasketch MinHash LSH](https://ekzhu.com/datasketch/lsh.html) — Incremental near-duplicate detection
- [5 Methods for Embedding Drift Detection](https://www.evidentlyai.com/blog/embedding-drift-detection) — Evidently AI
