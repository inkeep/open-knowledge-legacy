# Evidence: GBrain Retrieval & Knowledge Graph (D2 + D3)

**Dimension:** D2 (Retrieval parity) + D3 (Knowledge graph parity)
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README (master); WebSearch reporting on `BRAINBENCH-v1` (docs/benchmarks/2026-04-18-brainbench-v1.md)

---

## Key pages referenced
- https://github.com/garrytan/gbrain (README — Hybrid Search section, Knowledge Graph section)
- https://github.com/garrytan/gbrain/blob/master/docs/benchmarks/2026-04-18-brainbench-v1.md
- littlemight.com/g-brain/ (third-party explainer, 2026)

---

## Findings

### Finding: Hybrid search pipeline — vector (pgvector HNSW cosine) + keyword (tsvector) + RRF + graph + backlink boost
**Confidence:** CONFIRMED
**Evidence:** README "Hybrid Search (Vector + Keyword + RRF)":

> "Keyword alone misses conceptual matches. Vector alone misses exact phrases. RRF gets both."
>
> Pipeline: intent classifier → multi-query expansion → vector (HNSW cosine) + keyword (tsvector) → RRF fusion → cosine re-scoring → compiled-truth boost → backlink boost → 4-layer dedup.

CLI surface: `gbrain search <query>` (keyword tsvector only); `gbrain query <question>` (full hybrid pipeline).

**Implications:**
- The split between **`search` (deterministic keyword)** and **`query` (LLM-friendly hybrid w/ semantic)** is a deliberate two-tool design. OK's current MCP `search` is keyword-only (grep + frontmatter enrichment); OK has no semantic-retrieval tool today.
- **Compiled-truth boost** — the above-the-line content is weighted higher than below-the-line timeline. This makes the convention from D1 load-bearing for retrieval, not just human-readability.
- **Backlink boost** — well-connected pages rank higher. OK has backlink data (`get-backlinks` MCP tool) but does not feed it into search ranking.

### Finding: BrainBench v1 — P@5 49.1%, R@5 97.9%; graph layer is +31.4 P@5 ablation delta
**Confidence:** CONFIRMED
**Evidence:** WebSearch result (BrainBench-v1 doc, 2026-04-18):

> "On v0.12.1, gbrain achieves P@5 49.1%, R@5 97.9% — beating its own graph-disabled variant by +31.4 points P@5, grep-only by 32 points, and vector by 38 points, showing the graph layer is load-bearing."

README confirms: "Graph-only F1: 86.6% (ablation shows pure graph performance)." "Bulk throughput reaches import at 5,848 pages/sec and addLink at 8,752 links/sec at 10K scale, with P95 search latency well under the 200ms threshold."

**Implications:**
- The graph layer (typed links + backlink boost) is the single biggest contributor to retrieval quality — bigger than vector or keyword alone.
- OK can match keyword-only baseline today (grep already gets close to "grep-only" baseline) but is **38+ P@5 points behind on full hybrid retrieval**. Closing this gap requires: (1) embeddings, (2) vector index, (3) RRF fusion, (4) typed-link graph, (5) backlink boost — in that approximate priority order.
- **Latency target:** P95 < 200ms across hybrid query. Achievable with PGLite locally.

### Finding: Auto-extracted typed knowledge graph — zero LLM calls, regex + heuristics
**Confidence:** CONFIRMED
**Evidence:** README "Knowledge Graph (Auto-Linking, Zero LLM)":

> "Every page write extracts entity references and creates typed links (`attended`, `works_at`, `invested_in`, `founded`, `advises`) with zero LLM calls."
>
> Mechanisms:
> - **Regex patterns** (markdown links, bare slugs)
> - **Code-fence stripping** (no false positives in code)
> - **Type inference cascade** (FOUNDED → INVESTED → ADVISES → WORKS_AT)
> - **Page-role priors** (partner-bio language → invested_in)
> - **Within-page dedup**, **stale-link reconciliation**, **multi-type constraints**

**Implications:**
- The five edge types (`attended`, `works_at`, `invested_in`, `founded`, `advises`) reflect Garry's domain (people/company knowledge for a YC president). For OK, the canonical edge set would be different (e.g., `references`, `supersedes`, `derived_from`, `child_of`, `mentions`).
- **Zero-LLM extraction** is the headline performance win. Means link extraction runs on every write at no marginal cost. This is achievable in OK with the same regex + frontmatter approach — Open Knowledge already has `[[wiki-link]]` syntax; the missing piece is a **typed-edge convention** (e.g., `[[Foo|references]]` or frontmatter-declared edge types).
- The "type inference cascade" is the novel piece — if a page declares `FOUNDED Acme`, that implies `INVESTED_IN Acme` and `ADVISES Acme` are likely false; the cascade prevents over-claiming.

### Finding: Graph-query CLI/MCP — typed traversal with depth and direction parameters
**Confidence:** CONFIRMED
**Evidence:** README:

```bash
gbrain graph-query people/alice --type attended --depth 2
# returns who Alice met with, transitively
```

> "Questions answerable: 'who works at Acme AI?', 'what has Bob invested in?', 'find the connection between Alice and Carol' — graph alone can reach these; vector search cannot."

Symbol-graph variant: `gbrain query "..." --near-symbol BrainEngine.searchKeyword --walk-depth 2` for code symbol graph.

**Implications:**
- Graph traversal is **the qualitatively different capability**. Vector retrieval finds "documents semantically near X"; graph traversal finds "entities reachable from X via specific edge types within N hops." These are not substitutable.
- OK's `get-backlinks` and `get-forward-links` MCP tools are 1-hop graph queries. Adding `--type` and `--depth` parameters extends them toward GBrain parity.
- **Find-the-connection-between** queries (shortest path between two entities) are not in OK at all today.

### Finding: Backfill / extraction — `gbrain extract links|timeline|all` for retroactive enrichment
**Confidence:** CONFIRMED
**Evidence:** README:

```
gbrain extract links|timeline|all  — Batch backfill from existing pages
                                     (--source db|fs, --type, --since, --dry-run)
```

**Implications:** Critical for adoption. A new GBrain instance with imported markdown files needs a one-shot extraction pass to populate the graph. OK would need an equivalent — a "build the index from current content" verb — to bootstrap parity features on existing KBs.

### Finding: Embedding management is explicit — `gbrain embed` with `--all|--stale|<slug>`
**Confidence:** CONFIRMED
**Evidence:** README: `gbrain embed [<slug>|--all|--stale]` — Generate/refresh embeddings.

Embedding cost: original spec quoted ~$0.50 for 7,500 pages × 3 chunks each at OpenAI text-embedding-3-small ($0.02/1M tokens). Effectively free at personal-KB scale.

**Implications:** Embedding lifecycle is first-class — explicit `--stale` flag implies tracking which pages have stale embeddings vs. fresh. OK has no embedding pipeline today; adding one requires: embedding model choice (cloud vs. local), chunk strategy, freshness tracking, batch CLI verb. The `embedding freshness` lint check (D9) depends on this.

---

## Negative searches

- Searched for "reranker", "cross-encoder", "BM25" specifically → confirmed RRF (Reciprocal Rank Fusion) is the fusion method, not learned reranking. RRF is parameter-free and robust.
- Searched for whether `gbrain query` exposes a streaming response or is one-shot → not specified in README. CLI invocation appears one-shot.

---

## Gaps / follow-ups

- Exact embedding chunking strategy not in README. Spec quoted "~3 chunks per page average" — implies semantic or fixed-size chunking. Source: `src/embeddings/` in repo (not fetched).
- The "intent classifier" front-end is mentioned but not described. Whether it's an LLM call, regex, or learned classifier affects parity cost.
- Graph storage details (adjacency list in `links` table, edge typed via column) inferred from spec but not re-confirmed in shipped state.
