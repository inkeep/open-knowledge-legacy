# Evidence: ByteRover — Agent-Native Memory Through LLM-Curated Hierarchical Context (arxiv:2604.01599)

**Dimension:** D3 — The academic paper (backing theory for byterover-cli D2)
**Date:** 2026-04-07
**Sources:** arxiv:2604.01599 PDF (19 pages, 3 figures, 7 tables), submission date April 2, 2026
**Authors:** Andy Nguyen, Danh Doan, Hoang Pham, Bao Ha, Dat Pham, Linh Nguyen, Hieu Nguyen, Thien Nguyen, Cuong Do, Phat Nguyen, Toan Nguyen (ByteRover, https://www.byterover.dev)

⚠ **Vendor caveat:** ByteRover is a commercial product. The authors evaluate their own system. Benchmarks (LoCoMo, LongMemEval-S) are public, and they re-evaluate competitors under a unified harness, but the framing and conclusions are incentive-aligned with product launch. Treat architectural details as ground truth (they're operational) but benchmark deltas as directional.

---

## Key pages referenced
- Page 1 — Abstract, introduction to the external-service critique
- Page 2 — Three failure modes (semantic drift / lost coordination context / recovery fragility) + contributions list
- Page 3 — Background (MAG formalism: y_t ∼ f_θ(φ(o_t, s_t) ⊕ ψ(M_t; q_t))), taxonomy of existing approaches
- Page 4 — The Context Tree architecture; three logical layers; entry structure formalization n_i = ⟨R_i, C_i, V_i, S_i, L_i⟩
- Page 5 — Architecture diagram (Figure 1: TUI/CLI/MCP → daemon → task queue + agent pool → 3 layers); relation graph, symbol tree
- Page 6 — Adaptive Knowledge Lifecycle (AKL) details; compound retrieval score
- Page 7 — 5-tier retrieval table (Table 2); stateful feedback loop JSON example
- Page 8 — Retrieval flowchart (Figure 2); OOD detection
- Page 9 — Experimental setup: benchmarks, baselines, metrics; Algorithm 1 (pseudocode)
- Page 10 — LoCoMo results table (Table 3); overall comparison
- Page 11 — LongMemEval-S results (Table 4); operational latency profile (Table 5)
- Page 12 — Ablation study (Table 6); limitations discussion
- Page 13 — Conclusion
- Page 18 — Full hyperparameter configuration (Table 7)
- Page 19 — Figure 3: complete Context Tree entry example

---

## Findings

### Finding: The paper's core claim — "the system that stores knowledge does not understand it" is the fundamental critique of all prior MAG systems
**Confidence:** CONFIRMED
**Evidence:** Page 3 §2.3 — "Despite their architectural diversity, all systems in the taxonomy above share a common interaction pattern: the agent communicates with memory through an API boundary. The agent serializes data, the memory service processes it through its own pipeline (chunking, embedding, entity extraction, graph construction), and the agent later queries the service to retrieve results. This pattern has a fundamental consequence: the system that stores knowledge does not understand it."

**Implications for open-knowledge:** This critique applies broadly to any "memory service" approach — including systems that store files but run their own parsing/indexing pipelines. Open-knowledge is *somewhat* safe here because:
1. The product parses frontmatter mechanically (no semantic interpretation)
2. Orama BM25 search operates on agent-written text (no re-chunking)
3. Backlinks are structurally extracted from wiki-links (not LLM-inferred)

But there's a subtle risk: open-knowledge's **index.md auto-generation** IS a kind of secondary interpretation pipeline. If the index.md format differs from how the agent would naturally describe the KB, the agent may look at index.md and see something *different* from what it "meant" to store. ByteRover's answer to this: make curation itself an agent tool, so the agent's understanding IS the storage.

### Finding: Three failure modes of external-memory systems — semantic drift, lost coordination context, recovery fragility
**Confidence:** CONFIRMED
**Evidence:** Page 2 §1 — Listed as three numbered failure modes:
1. **Semantic drift** — "The agent's understanding of what it stored diverges from what the memory service actually captured."
2. **Lost coordination context** — "When multiple agents share an external memory service, they share data but not understanding. Agent A stores a finding with reasoning and rationale. Agent B retrieves the data but lacks the why—what reasoning led to the conclusion."
3. **Recovery fragility** — "When an autonomous agent crashes mid-task, it must reconstruct state by querying the memory service, interpreting results, and inferring where it left off. With stateful, file-based memory, the state is in the files—per-operation status, timestamps, and the knowledge structure itself tells the agent exactly what was completed."

**Implications for open-knowledge:** All three are directly relevant:
1. **Semantic drift** — open-knowledge needs to make sure that whatever the agent stores is what the agent sees on re-read. The Yjs CRDT helps here (live sync), but the derived indexes (index.md, Orama index) introduce a second interpretation layer. This is a risk to track.
2. **Lost coordination context** — open-knowledge's multi-agent story (multiple agents, hosted cloud agent + BYO agent) is exactly this scenario. ByteRover argues that files-with-provenance beats "memory service" for multi-agent. This is a strong argument for storing `provenance` metadata in frontmatter.
3. **Recovery fragility** — open-knowledge's "everything is a file + git commit" is already well-positioned here. Agent crashes mid-curation → git history tells you exactly what was committed. This is actually a strength the paper gives us language for.

### Finding: Architectural diagram — three logical layers (Agent / Execution / Knowledge) with daemon + per-project agent pool
**Confidence:** CONFIRMED
**Evidence:** Page 5 Figure 1 — "Clients (TUI, CLI, MCP) connect via Socket.IO to a daemon that manages a per-project task queue and agent pool. Each agent process contains three logical layers: (1) an Agent Layer where `curate` and `search_knowledge` are first-class tools in the LLM's reasoning loop; (2) an Execution Layer with a query executor for 5-tier progressive retrieval and a sandboxed curation environment; and (3) a Knowledge Layer with the Context Tree, BM25 full-text index, and query cache, all backed by the local filesystem with no external infrastructure."

```
Clients:  TUI  CLI  MCP   (via Socket.IO)
              ↓
Daemon:  Task Queue + Agent Pool
              ↓
Agent Process (one per project):
  ┌─ Agent Layer:     LLM Loop ←→ curate / search_knowledge
  ├─ Execution Layer: QueryExecutor + CurateExecutor + Sandbox
  └─ Knowledge Layer: Context Tree + MiniSearch + Cache
                      (local filesystem, no external services)
```

**Implications for open-knowledge:** 
- **Daemon model** is a third alternative to the "everything in Vite dev server" (CC5) or "Hocuspocus as embedded server" approaches. The daemon serves multiple client surfaces; open-knowledge's S4 (MCP) + S1 (editor) + S5 (presence) are three surfaces that could follow the same pattern.
- **Sandboxed curation environment** — the curation (write path) runs in a sandbox with controlled file access via a ToolsSDK. Open-knowledge's MCP write path currently has permission checks but no sandbox. For agents that generate code (e.g., the "compile" skill), a sandbox layer may be warranted.
- **Per-project agent pool** — ByteRover runs ONE agent per project, managed by a pool. Open-knowledge's architecture assumes MANY agents (Claude Code, Cowork, Cursor) connect simultaneously. The sequential task queue pattern may not translate directly.

### Finding: Context Tree structure — Domain > Topic > Subtopic > Entry, each entry is a markdown file
**Confidence:** CONFIRMED
**Evidence:** Page 4 §3.2 — "The Context Tree is a hierarchical file-based knowledge graph organized as Domain > Topic > Subtopic > Entry. We formalize it as a directed graph G = (N, E) where nodes N are knowledge entries (markdown files) and edges E are explicit cross-references declared via @domain/topic/file.md relation annotations."

Page 19 Appendix C shows a complete example file at `.brv/context-tree/architecture/module_boundaries/auth_billing_cycle.md` — **directory structure IS the Domain/Topic/Subtopic hierarchy.**

**Implications for open-knowledge:** 
- The Domain > Topic > Subtopic > Entry pattern is a **4-level canonical structure**. Open-knowledge currently is flat folders + frontmatter (PQ7 parked). ByteRover's bet is that a fixed canonical hierarchy reduces decision fatigue for the agent. The counter-argument (in open-knowledge's PROJECT.md rabbit hole #4): "the conventions should emerge from real skill usage, not be designed top-down."
- ByteRover's evidence suggests a **canonical hierarchy helps at scale**. At 272 docs (LoCoMo) and 23,867 docs (LongMemEval-S), the hierarchy holds up.
- The `@domain/topic/file.md` cross-reference syntax is an alternative to wiki-links. It's more explicit (full path) and more parseable. But it's NOT compatible with Obsidian or the wider markdown ecosystem.

### Finding: Knowledge Entry is formally n_i = ⟨R_i, C_i, V_i, S_i, L_i⟩ — 5 structured components
**Confidence:** CONFIRMED
**Evidence:** Page 4 §3.2.1 — "Each entry n_i ∈ N is a standalone markdown file with structured content (Equation 4, Appendix C):
n_i = ⟨R_i, C_i, V_i, S_i, L_i⟩
where R_i denotes the relation set (explicit edges to other entries), C_i is the raw concept (provenance: task, changes, sources, timestamp, author), V_i is the narrative (interpreted structure: dependencies, rules, examples, diagrams), S_i contains snippets (code, formulas, raw data), and L_i is the lifecycle metadata."

Page 19 example shows these as markdown sections:
```
## Relations       ← R_i
## Raw Concept     ← C_i (provenance)
## Narrative       ← V_i
(snippets go inline)← S_i
(frontmatter)      ← L_i
```

**Implications for open-knowledge:** This is a richer schema than open-knowledge's current "frontmatter + body markdown" convention. The separation of **raw concept (provenance) vs narrative (interpreted)** is novel — it distinguishes "what triggered this entry to be written" from "what the entry explains." Open-knowledge could adopt this distinction as a convention in reference skills (ingest/compile skills write provenance into a `## Source` section, compiled content into `## Summary`).

### Finding: Relations are EXPLICITLY AUTHORED, not embedding-derived
**Confidence:** CONFIRMED
**Evidence:** Page 5 §3.2.2 — "The edge set E is constructed from explicit @relation annotations in the Relations section of each entry. Unlike embedding-based implicit similarity, these edges represent author-stated semantic connections—the LLM that created the entry decided that these concepts are related and stated why."

**Implications for open-knowledge:** This is an important stance for the `suggest_links` tool (mentioned in S10). Open-knowledge should distinguish:
- **Author-stated relations** (wiki-links typed by a human or LLM explicitly) — load-bearing edges
- **Inferred relations** (similarity-based suggestions) — navigational hints

Mixing these two without provenance leads to trust problems (the agent can't tell "was this link written by the author, or inferred by a later scan?"). This connects to Graphify's EXTRACTED/INFERRED/AMBIGUOUS edge typing — the same pattern is emerging independently.

### Finding: Bidirectional reference index + hierarchical symbol tree, both with O(1) lookup
**Confidence:** CONFIRMED
**Evidence:** Page 5 §3.2.2 — "A bidirectional reference index maintains both forward links (source → targets it references) and backlinks (target → sources that reference it), enabling graph traversal in both directions with O(1) lookup per entry. A hierarchical symbol tree provides O(1) lookup from relative paths to knowledge entries and hosts the reference index above."

**Implications for open-knowledge:** This is *exactly* what open-knowledge's S10 wiki-links + backlinks architecture specifies (dual adjacency list, forward + backward indexes). ByteRover's implementation is at production scale and the data structure is publicly described. **Open-knowledge has independently arrived at the same data structure the SOTA memory paper validates.** This is strong confidence evidence that S10's design is correct.

### Finding: Symbol tree is injected into the system prompt (up to 200 entries) for agent ambient awareness
**Confidence:** CONFIRMED
**Evidence:** Page 5 §3.2.2 — "For query and curate operations, a lightweight representation of the tree structure is injected into the agent's system prompt: either a directory listing of domain and topic names (up to 200 entries) or, when full-text search is available, a compact instruction to use the search tool. This gives the agent ambient awareness of what knowledge exists without dumping full contents."

**Implications for open-knowledge:** 
- This is the "orient" phase of progressive disclosure, done via prompt injection rather than tool call.
- Open-knowledge's equivalent: `read_file(".openknowledge/index.md")` returns the full KB map. The agent has to ASK for it.
- **ByteRover's optimization: inject the tree into the system prompt automatically**, so the agent always knows what's available. This is the "MCP server's instructions field" pattern open-knowledge already uses (via CC5 + MCP Apps).
- Concrete tradeoff: up to 200 entries in the system prompt is ~ 2-5K tokens of always-loaded context. At 1000+ entries, this pattern breaks — which is why ByteRover falls back to "use the search tool." Open-knowledge's scale (100-1000 articles per KB per PROJECT.md) sits exactly at the boundary where this pattern transitions.

### Finding: Adaptive Knowledge Lifecycle (AKL) — importance, maturity, recency
**Confidence:** CONFIRMED
**Evidence:** Page 6 §3.2.3 with exact parameters:
- **Importance score** i ∈ [0, 100]. Access events +3, update events +5. Daily decay factor 0.995 (from Page 18 Table 7).
- **Maturity tiers**: `draft → validated → core` with hysteresis. Promotion: validated at i ≥ 65, core at i ≥ 85. Demotion: draft when i < 35, validated when i < 60. Gaps of 30 and 25 respectively prevent rapid oscillation.
- **Recency decay**: r_i = exp(-Δt_i / τ) where τ = 30 days (~21-day half-life).
- **Compound score**: `Score(n_i, q) = w_r · BM25(n_i, q) + w_i · î_i + w_t · r_i`

**Implications for open-knowledge:** 
- Open-knowledge has NO equivalent to AKL. Every article is equal; there's no "draft/validated/core" lifecycle beyond git branches.
- **This is a genuinely novel angle for open-knowledge to consider.** A few ways to adopt it:
  1. **Lightweight frontmatter convention** — reference skills can add `importance: N` and `maturity: draft|validated|core` fields, and rank search results by a blended score.
  2. **Decay as a UI signal** — in the sidebar, dim articles that haven't been accessed recently (hint that they may be stale).
  3. **Maturity as a permission signal** — PQ9 (permission-based draft) could use maturity: agents get `editor` on draft content, `proposer` on validated, cannot touch core without explicit approval.
- **Tradeoff**: ByteRover's AKL is aggressively time-based. Open-knowledge's audience (IC knowledge workers) may not want their reference material decaying just because they haven't looked at it recently. The "maturity tier" concept is probably more useful than the "recency decay."

### Finding: 5-tier progressive retrieval — Tier 0 exact cache, Tier 1 fuzzy cache, Tier 2 direct MiniSearch, Tier 3 LLM call with pre-fetch, Tier 4 full agentic loop
**Confidence:** CONFIRMED
**Evidence:** Page 7 Table 2:

| Tier | Mechanism | Latency | Condition |
|---|---|---|---|
| 0 | Exact cache hit | ~0 ms | Hash match + valid fingerprint |
| 1 | Fuzzy cache (Jaccard) | ~50 ms | Jaccard ≥ θ_fuzzy (0.6) |
| 2 | Direct MiniSearch | ~100 ms | BM25 score ≥ θ_high (0.93), sufficient gap |
| 3 | Optimized LLM call | <5 s | BM25 score ≥ θ_med (0.85) |
| 4 | Full agentic loop | 8-15 s | All other queries |

Algorithm 1 (Page 9) gives full pseudocode.

**Implications for open-knowledge:** 
- This is a much more fine-grained progressive disclosure model than open-knowledge currently has. Open-knowledge's S8 `search` is a single-tier (hybrid BM25 + semantic). ByteRover's 5-tier is an optimization: cache first, then direct search, then escalate.
- **The key insight: TIERS 0-2 BYPASS THE LLM ENTIRELY.** The agent never calls into the search tool for 60%+ of queries (per the benchmarks) — the cache returns directly. This is a massive cost/latency savings.
- Open-knowledge's S8 `search` tool could adopt this internally: when the agent calls `mcp__openkb__search(query)`, the implementation tries cache → direct search → cache the results → return. The agent sees ~100ms for cache hits and ~500ms for searches.
- **The "OOD detection" at page 8** is novel: "When significant query terms (length ≥ 4 characters) do not match any entry in the knowledge base and the normalized score falls below a threshold (θ_OOD = 0.85), the system explicitly signals 'this query appears outside the scope of stored knowledge.'" This prevents agents from hallucinating answers from tangential results. Open-knowledge should consider adding this: when search returns nothing relevant, the tool should explicitly say "no matches in KB" rather than returning an empty result set that the agent might treat as "need to look harder."

### Finding: Five atomic curate operations — ADD, UPDATE, UPSERT, MERGE, DELETE — each with a `reason` field
**Confidence:** CONFIRMED
**Evidence:** Page 6 Table 1:
| Operation | Behavior |
|---|---|
| ADD | Create new entry; auto-generate context.md at each hierarchy level |
| UPDATE | Replace content of an existing entry |
| UPSERT | Add if new, update if exists (reduces pre-check overhead) |
| MERGE | Combine two entries intelligently; delete the source |
| DELETE | Remove a single entry or an entire subtree |

"Every operation carries a `reason` field that serves as an audit trail."

**Implications for open-knowledge:** 
- Open-knowledge's MCP write tools are filesystem-style: `write_file`, `edit_file` (S4). These are LOWER level than ByteRover's curate operations.
- **MERGE is particularly interesting** — open-knowledge has no equivalent. Two articles on the same topic stay separate forever unless a skill explicitly consolidates them. ByteRover treats MERGE as a first-class operation.
- **UPSERT reduces round-trips** — instead of `read_file` → check → `write_file`, the agent calls `upsert`. Open-knowledge's `edit_file` already does this implicitly but doesn't expose the semantic.
- **The `reason` field on every operation** is a great idea — it's an inline audit trail. Open-knowledge should consider adding this to `write_file` / `edit_file` as an optional parameter, recorded in the git commit message. Combined with git's blame semantics, this would give perfect provenance.

### Finding: Stateful feedback loop — every curate call returns per-operation status
**Confidence:** CONFIRMED
**Evidence:** Page 7 §4.1.2 with JSON example:
```json
{
  "applied": [
    {"type": "UPSERT", "path": "analysis/semi", "status": "success"},
    {"type": "MERGE", "path": "analysis/energy", "status": "failed",
     "message": "Source file not found"}
  ],
  "summary": {"added": 0, "deleted": 0, "updated": 1, "merged": 0, "failed": 1}
}
```
"The agent sees which operations succeeded, which failed, and why. It can reason about failures and adapt—skip the operation, retry with corrections, or flag the gap for later resolution. This feedback loop is impossible when memory is an external service returning HTTP status codes."

**Implications for open-knowledge:** Open-knowledge's MCP tool responses are currently per-call (one tool call = one write). A batched curate with per-operation status is a different pattern — the agent asks to do 5 things, gets back which succeeded and which failed, and can react. This reduces round-trips and enables error-recovery patterns. Worth considering for a future `mcp__openkb__batch_edit` tool or as part of a higher-level `curate` tool.

### Finding: Atomic writes via write-to-temp-then-rename — no partial entries possible
**Confidence:** CONFIRMED
**Evidence:** Page 7 §4.1.3 — "All file operations use an atomic write-to-temp-then-rename pattern. If the process crashes mid-write, the Context Tree remains consistent—no partial entries or corrupted knowledge."

**Implications for open-knowledge:** This is table stakes and open-knowledge's Hocuspocus persistence (CC2) already provides similar guarantees via the debounced write → disk → git pipeline. But the write-to-temp-then-rename pattern is simpler than CRDT persistence for the file-on-disk case. Worth noting as the reference pattern for any non-CRDT writes.

### Finding: Experimental results — SOTA on LoCoMo (96.1% overall, beats HonCho by 6.2 pts), competitive on LongMemEval-S (92.8%)
**Confidence:** CONFIRMED (benchmarks are public; ByteRover re-evaluated competitors under a unified harness)
**Evidence:** Page 10 Table 3 (LoCoMo), Page 11 Table 4 (LongMemEval-S)

LoCoMo (4 categories, 1,982 questions):
| Method | Single-Hop | Multi-Hop | Open-Domain | Temporal | Overall |
|---|---|---|---|---|---|
| HonCho | 93.2 | 84.0 | 77.1 | 88.2 | 89.9 |
| Hindsight | 86.2 | 70.8 | **95.1** | 83.8 | 89.6 |
| Memobase | 70.9 | 46.9 | 77.2 | 85.1 | 75.8 |
| Zep | 74.1 | 66.0 | 67.7 | 79.8 | 75.1 |
| Mem0 | 67.1 | 51.2 | 72.9 | 55.5 | 66.9 |
| OpenAI Memory | 63.8 | 42.9 | 62.3 | 21.7 | 52.9 |
| **BYTEROVER** | **97.5** | **93.3** | 85.9 | **97.8** | **96.1** |

**⚠ Vendor caveat:** ByteRover's harness and judge (Gemini 3 Flash) were used to re-evaluate all competitors. The paper acknowledges: "Results marked with † use different backbone and judge configurations" on LongMemEval-S. BUT the LoCoMo table uses a unified harness for all systems, which is the stronger comparison.

**Implications for open-knowledge:** 
- The pattern "LLM curates its own memory + file-based storage + 5-tier retrieval" is empirically better than Mem0, Zep, Letta, OpenAI Memory at these benchmarks by a large margin.
- **The strongest gains are on multi-hop and temporal queries** — exactly the cases where a flat vector store loses provenance. The Context Tree's explicit relations provide "navigable paths between distant sessions" (§5.2).
- Open-knowledge's wiki-links + backlinks give the same structural benefit for multi-hop queries. The hypothesis: **a human+AI-authored wiki is at least as good as an agent-only curated wiki, because humans catch relationships the agent misses.** Worth validating if open-knowledge ever runs LoCoMo-style benchmarks on skill-authored KBs.

### Finding: Operational latency — p50 cold query 1.2-1.6s, p99 1.7-2.5s, stable across 272-doc to 23,867-doc scale
**Confidence:** CONFIRMED
**Evidence:** Page 11 Table 5:

| Metric | LoCoMo (272 docs) | LongMemEval-S (23,867 docs) |
|---|---|---|
| p50 | 1.2 s | 1.6 s |
| p95 | 1.4 s | 2.3 s |
| p99 | 1.7 s | 2.5 s |

"Despite a substantially larger context tree on LongMemEval-S (23,867 documents vs. 272 on LoCoMo), median query latency remains low at 1.6 s, suggesting that the tiered retrieval architecture effectively bounds search cost as the corpus grows."

**Implications for open-knowledge:** 
- These latencies are **including LLM calls** (Tier 3 is <5s, Tier 4 is 8-15s). For tiers 0-2 (cache + direct search), ByteRover reports sub-100ms. That's in the same ballpark as open-knowledge's TQ17 finding (JS regex on CRDT content: 2-8ms at 1000 files).
- The tiered retrieval architecture holds up from 272 to 23,867 documents. This is the scale open-knowledge claims to support (100-1000 articles per KB) with comfortable headroom.

### Finding: Ablation study — tiered retrieval is the biggest contribution; OOD detection and relation graph each contribute ~0.4 pp overall
**Confidence:** CONFIRMED
**Evidence:** Page 12 Table 6:

| Configuration | Overall accuracy | Δ |
|---|---|---|
| w/o Tiered Retrieval | 63.4 | **−29.4** |
| w/o OOD Detection | 92.4 | −0.4 |
| w/o Relation Graph | 92.4 | −0.4 |
| BYTEROVER (Full) | 92.8 | — |

**Implications for open-knowledge:** 
- **Tiered retrieval (caching + search + escalation) is the dominant contribution.** Removing it drops accuracy by 29.4 points. Removing the relation graph only drops by 0.4.
- **But:** the paper notes "The relation graph's contribution may be more pronounced on benchmarks with explicit multi-hop reasoning demands (e.g., LoCoMo's multi-hop category, where relations provide navigable paths across conversation boundaries)." In other words: LongMemEval-S doesn't stress multi-hop, so the relation graph's benefit doesn't show in the overall score. **For multi-hop knowledge work (the open-knowledge use case), relations are load-bearing.**
- This is important context: **"relation graph only adds 0.4 points" is a benchmark-specific artifact, not a general finding.** Open-knowledge's wiki-link architecture is not invalidated.

### Finding: Four acknowledged limitations
**Confidence:** CONFIRMED
**Evidence:** Page 13 §7:
1. **Write path is expensive** — LLM-curated knowledge requires reasoning per curation event, slower/costlier than mechanical chunking+embedding.
2. **Novel queries are slower than vector search** — when queries miss cache and index (Tier 3-4), ByteRover requires an LLM call that vector search does not.
3. **Curation quality depends on backbone model capability** — "ByteRover's deeper reliance on LLM reasoning for both storage and retrieval amplifies the impact of backbone sensitivity. Open-weight models with higher error rates may produce lower-quality knowledge entries."
4. **File-based storage may face scaling challenges at very large knowledge bases** — "The in-memory MiniSearch index and sequential task queue are designed for knowledge bases of up to ~10K entries. Beyond this scale, sharding strategies or alternative indexing backends may be needed."
5. **Sequential task queue limits write throughput** — "deployments with many agents writing simultaneously may experience queuing delays."

**Implications for open-knowledge:** 
- **Limitation #4 (10K entries ceiling)** is directly relevant. Open-knowledge targets 100-1000 articles, which is comfortably within ByteRover's tested range. But open-knowledge's cloud/enterprise Later phase may need to support 10K+ per KB — worth noting the ceiling.
- **Limitation #5 (sequential task queue)** is the opposite of open-knowledge's CRDT approach. Multiple concurrent writers are fine in Yjs, but they pay the CRDT complexity cost. ByteRover pays the queuing-delay cost.
- **Limitation #1 (expensive write path)** applies to any LLM-curated approach. Open-knowledge's zero-LLM-in-core principle means the PRODUCT doesn't pay this cost — but skills that DO curation (the compile skill, ingest skill) will. Worth budgeting.

### Finding: Hyperparameter configuration includes specific choices worth noting
**Confidence:** CONFIRMED
**Evidence:** Page 18 Table 7 (full config)
- **Search index:** MiniSearch v7, field boosting title (5×), content (1×), path (1.5×)
- **Max retrieval results:** 32
- **Max content length:** 8,000 chars (truncation for search)
- **Fuzzy ratio:** 0.2
- **Score normalization:** s/(1+s) — maps BM25 to [0,1]
- **Direct response thresholds:** high 0.93, min 0.85, gap 0.08
- **OOD detection:** min relevance 0.6, unmatched term threshold 0.85
- **Curation:** max 5 files per op, max 40,000 chars per file
- **Compression:** L1 normal summarization, L2 0.6× token budget
- **Inference backbone:** Gemini 3 Flash (temperature 0.0)
- **Evaluation judge:** Gemini 3 Flash (8,192 tokens)
- **Evaluation justifier:** Gemini 3.1 Pro (32,768 tokens)

**Implications for open-knowledge:** Open-knowledge's search layer (Orama) should take note of the field boosting weights. Title boost at 5× and path boost at 1.5× are sensible defaults. The 8,000-char truncation on search index content is a pragmatic choice that caps index size.

### Finding: Real Context Tree entry example (Figure 3, Page 19)
**Confidence:** CONFIRMED
**Evidence:** Page 19 Figure 3 — complete entry at `.brv/context-tree/architecture/module_boundaries/auth_billing_cycle.md`:

```yaml
---
title: Auth-Billing Circular Dependency
tags: [architecture, circular-dependency, tech-debt]
keywords: [auth, billing, import-cycle, tree-shaking]
related:
  - architecture/module_boundaries/auth_service_deps.md
  - tech_debt/prioritization/q1_2026_assessment.md
importance: 82
maturity: validated
recency: 0.91
accessCount: 7
updateCount: 3
createdAt: 2026-02-03T11:20:00Z
updatedAt: 2026-02-15T09:45:00Z
---

## Relations
@architecture/module_boundaries/auth_service_deps.md
@architecture/module_boundaries/billing_integration.md
@tech_debt/prioritization/q1_2026_assessment.md

## Raw Concept
**Task:** Map circular dependency between auth, billing,
and user-management modules after v1.8 release.
**Changes:** PR #847 introduced auth -> billing import.
**Files:** src/auth/middleware/auth.ts, src/billing/subscriptionCheck.ts
**Timestamp:** 2026-02-03T11:20:00Z
**Author:** architecture-agent

## Narrative
### Structure
The dependency cycle forms a triangle:
auth -> billing -> user-management -> auth.

### Rules
Circular deps with runtime imports are severity: high.
Type-only circular imports are severity: low.
```

**Implications for open-knowledge:** This is a GOLD STANDARD reference for what an agent-authored knowledge entry looks like. Things to steal:
1. **`related:` list in frontmatter AND `## Relations` section with @paths** — dual representation (machine-readable + human-readable)
2. **Lifecycle metadata in frontmatter** — importance, maturity, recency as numeric fields (even if open-knowledge doesn't use them for retrieval, they're useful for UI sorting and skill filtering)
3. **Access/update counters** — `accessCount`, `updateCount` — useful signals open-knowledge doesn't currently track
4. **Separation of `## Raw Concept` (provenance) from `## Narrative` (interpretation)** — this is a strong convention that open-knowledge's reference skills could adopt. "What triggered me to write this" vs "what I want to say" are different things; keeping them apart helps future agents update intelligently.

---

## Gaps / follow-ups
- Full hyperparameter configuration mentions "Query cache TTL: 0 (disabled)" — caches are per-session, not persisted. Why disable them? (Probably because the benchmark is single-session.)
- The "context.md at each hierarchy level" auto-generation — mentioned in Table 1 (ADD behavior) but not detailed in the paper. What's in a context.md? (This is equivalent to open-knowledge's index.md per folder.)
- The exact prompt template for curation is not in the paper — would need the byterover-cli source to see it.
- How does BRV handle human edits to the Context Tree files? Is there a file watcher to re-index, or are human edits out-of-scope?

## Related open-knowledge material
- **S10 (wiki-links + backlinks)** — ByteRover's bidirectional index with O(1) lookup is the same architecture. Strong validation.
- **TQ18 (Orama + regex are complementary)** — ByteRover's MiniSearch + tiered retrieval is the same pattern at a finer grain.
- **XQ1 (MCP interface design)** — ByteRover's 2-tool MCP surface (`curate`, `query`) is the extreme Approach B data point.
- **PQ13 (end-to-end Karpathy workflow)** — ByteRover IS the Karpathy workflow, productized, with SOTA benchmark evidence.
- **CC6 (derived data)** — ByteRover's in-memory MiniSearch + query cache maps to Orama + backlinks cache.
- **CC1 (CRDT)** — ByteRover's sequential task queue is the alternative to CRDTs. Different tradeoff (no human co-editing, no real-time sync, but simpler).
- **Potential new direction: Adaptive Knowledge Lifecycle as a convention layer** — importance, maturity, recency fields in frontmatter. Not in PROJECT.md yet.
