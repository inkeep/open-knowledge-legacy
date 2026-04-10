# Evidence: Graphify — Knowledge Graph Builder for Claude Code (DEEP)

**Dimension:** D1 — safishamsi/graphify
**Date:** 2026-04-07
**Sources:** Cloned repo at `~/.claude/oss-repos/prior-art-open-knowledge/graphify` (5,941 LOC Python), README, deep source-code investigation by Explore subagent
**Repo metrics:** 3.4K stars, 321 forks, pure Python, 4 releases as of April 2026

---

## Findings

### Finding: Graphify is a Claude Code skill packaged as a pip package, with a 1,214-line SKILL.md as the orchestration layer
**Confidence:** CONFIRMED
**Evidence:** `graphify/skill.md:1-5` — frontmatter:
```yaml
---
name: graphify
description: any input (code, docs, papers, images) → knowledge graph → clustered communities → HTML + JSON + audit report
trigger: /graphify
---
```
The skill.md is the orchestration layer (1,214 lines). The Python library `graphify/` (5,941 LOC across 16 modules) provides the data pipeline. Skill orchestrates parallelism, caching, user feedback; library handles deterministic data operations.

**Implications for open-knowledge:** This is the **clearest separation of "skill" vs "library"** in the prior art. The library is stateless and pure-Python (importable, testable). The skill is a long markdown file with embedded bash command blocks that Claude Code executes. **Open-knowledge's reference skills should follow the same pattern**: a thin TypeScript library for data ops + a fat SKILL.md for orchestration.

### Finding: Two-pass extraction architecture — deterministic AST (Pass 1, no LLM) parallelized with Claude subagents (Pass 2, LLM)
**Confidence:** CONFIRMED
**Evidence:** `graphify/skill.md:111` — "Parallelizes AST + semantic (5-15s speedup on large corpora)"
- **Pass 1** (extract.py, 1,733 lines): Tree-sitter AST extraction across 17 languages. Outputs `EXTRACTED` edges with `confidence_score=1.0`. Pure deterministic, no LLM.
- **Pass 2** (skill.md:181-245): Splits files into chunks of 20-25, dispatches ALL Claude Agent tool calls in a SINGLE message for parallel execution. Each subagent extracts semantic concepts, marks INFERRED/AMBIGUOUS edges with confidence scores.

**Two-pass call graph extraction:**
- Pass 1 (in-file, lines 622-683): Walk function bodies, find call nodes, create EXTRACTED edges
- Pass 2 (cross-file, lines 1487-1650): Use import statements + stem_to_entities map to add INFERRED edges between local class and imported entities

**Implications for open-knowledge:** This validates open-knowledge's PQ13 Option D ("smart conventions + batteries-included skills") — the deterministic-first/LLM-second pattern is the right architecture. Specific applications:
1. **Reference compile skill should be two-pass**: AST/structural pass (free, fast) → LLM pass (semantic, batched). Open-knowledge's frontmatter parsing + wiki-link extraction is already structural; the LLM-only work is for the actual content compilation.
2. **Parallel agent dispatch in a single message** is a Claude Code-specific optimization — open-knowledge's reference skills should adopt the same pattern for any operation that touches multiple files.

### Finding: Edge confidence is a first-class typed schema with strict scoring rules and validation
**Confidence:** CONFIRMED
**Evidence:** `graphify/validate.py:5` — `valid_confidences = {"EXTRACTED", "INFERRED", "AMBIGUOUS"}`
`graphify/test_confidence.py:45-98` — round-trip JSON tests verify confidence_score persistence

Scoring rules (from skill.md:236-242 + tests):
- **EXTRACTED**: confidence_score == 1.0 always (test enforces)
- **INFERRED**: 0.6-0.9 (strong evidence 0.8-0.9, reasonable inference 0.6-0.7, weak/speculative 0.4-0.5)
- **AMBIGUOUS**: ≤ 0.4 (test line 75 enforces score ≤ 0.4)

Surprise scoring weights confidence inversely: AMBIGUOUS +3, INFERRED +2, EXTRACTED +1 (`analyze.py:134-187`). Uncertain edges are *more interesting* for surprise rankings.

**Implications for open-knowledge:** The 3-tier provenance model is more sophisticated than open-knowledge's current binary "wiki-link exists / doesn't exist." Specific design implications:
1. **`suggest_links` (S10)** should produce INFERRED edges, not EXTRACTED. The agent that authors a wiki-link by hand (or in a deliberate write_file call) creates EXTRACTED. The agent that suggests "X seems related to Y" creates INFERRED.
2. **The frontmatter `related:` field could carry type hints**: `related: [- {target: foo.md, confidence: extracted}]` instead of bare links. Or simpler: a separate `suggested_related:` field.
3. **The schema is enforced by validation tests** in graphify — open-knowledge's reference skills should ship with validation tests for any schema they author.

### Finding: 7 MCP tools exposed via stdio server — graph primitives, not domain operations
**Confidence:** CONFIRMED
**Evidence:** `graphify/serve.py:117-188` — Tool registry:

| Tool | Input Schema | Purpose |
|------|-----|---------|
| `query_graph` | `question` (string), `mode` (bfs\|dfs), `depth` (1-6), `token_budget` | BFS/DFS traversal from keyword-matched nodes, returns text subgraph |
| `get_node` | `label` (string) | Full node details: ID, source file, type, community, degree |
| `get_neighbors` | `label` (string), `relation_filter` (optional) | All neighbors with edge relation + confidence |
| `get_community` | `community_id` (integer) | All nodes in a community |
| `god_nodes` | `top_n` (integer, default 10) | Top N most-connected nodes |
| `graph_stats` | (none) | Node/edge/community counts + confidence breakdown |
| `shortest_path` | `source` (string), `target` (string), `max_hops` (1-8) | Shortest path with relation/confidence per hop |

The MCP server is purely READ-ONLY — no tool writes to the graph. Writes happen via the CLI/skill (`/graphify`, `/graphify --update`).

**Implications for open-knowledge:** 
- Graphify's MCP surface is **smaller and lower-level** than open-knowledge's planned 10 tools (S4). 7 tools, all read-only graph primitives. Compare:
  - Open-knowledge: read_file, write_file, edit_file, list_directory, search_files + 5 knowledge-specific
  - Graphify: query_graph, get_node, get_neighbors, get_community, god_nodes, graph_stats, shortest_path
- **Read/write split**: Graphify's CLI (`/graphify add <url>`) handles writes; the MCP server handles reads. Open-knowledge currently treats both via MCP. Worth considering: should the "compile" reference skill be CLI-only with a read-only MCP surface for consumers, or should it expose write tools through MCP?
- **`shortest_path` and `get_neighbors` are graph navigation** open-knowledge could adopt for `suggest_links`. The "graph as first-class navigation surface" pattern.

### Finding: Pre-tool-use hook in Claude Code settings.json forces graph-aware navigation
**Confidence:** CONFIRMED
**Evidence:** `graphify/hooks.py:9-21`:
```python
_SETTINGS_HOOK = {
    "matcher": "Glob|Grep",
    "hooks": [{"type": "command", "command": "[ -f graphify-out/graph.json ] && echo 'graphify: ...'"}]
}
```

Before EVERY Glob or Grep call, Claude Code injects: "graphify graph exists. Read GRAPH_REPORT.md first." This steers navigation by structure before falling back to file searching.

**Implications for open-knowledge:** **This is a novel pattern for open-knowledge to consider.** A pre-tool-use hook can inject context that says "your knowledge base has an index — read .openknowledge/index.md before running grep." This makes the agent's navigation tier-aware without requiring the agent to explicitly call the index tool first. Open-knowledge currently relies on the MCP `instructions` field + AGENTS.md for this; graphify proves the hook approach works in production.

This is also a **distribution model**: graphify's `graphify hook install` writes to the user's Claude Code settings.json. Open-knowledge could ship a similar `npx openknowledge hook install` to wire the index-first navigation pattern automatically.

### Finding: NetworkX undirected graph with `_src`/`_tgt` direction metadata preserved
**Confidence:** CONFIRMED
**Evidence:** `graphify/build.py:45-48`:
```python
attrs["_src"] = edge["source"]  # preserve direction even though graph is undirected
attrs["_tgt"] = edge["target"]
G.add_edge(edge["source"], edge["target"], **attrs)
```

Decision: graph is undirected for Leiden clustering (Leiden requires undirected), but display/query functions read `_src`/`_tgt` to render arrows correctly.

**Implications for open-knowledge:** This is a clever workaround. Open-knowledge's wiki-link backlink architecture (S10) needs to preserve direction (A links to B, not vice versa) but may want bidirectional traversal for "find all related." Graphify's pattern works: store direction as metadata, traverse undirected for connectivity queries.

### Finding: Leiden clustering on the graph — communities are topology-based, NOT embedding-based
**Confidence:** CONFIRMED
**Evidence:** `graphify/cluster.py:44-117` + README:30 — "Clustering is graph-topology-based — no embeddings. Leiden finds communities by edge density. The semantic similarity edges that Claude extracts are already in the graph, so they influence community detection directly."

Steps:
1. Try graspologic Leiden first; fall back to networkx Louvain
2. Handle isolates (degree-0 nodes become single-node communities)
3. Split oversized communities (>25% of graph) recursively
4. Re-index communities by size descending (deterministic)

**Cohesion score per community** (lines 116-117): `subgraph.number_of_edges() / possible_edges` — fraction of possible edges present.

**Implications for open-knowledge:** 
- For S-L4 (knowledge graph visualization) and any future "find clusters" feature, graphify shows that **topology-based clustering on a wiki-link graph works without embeddings**. Open-knowledge's S10 backlink graph is enough — no separate embedding step needed for cluster detection.
- The "semantic similarity edges become structural" pattern: when Claude (via skill) authors `semantically_similar_to` edges, they participate in clustering directly. Open-knowledge could adopt this as a convention — let skills add explicit similarity wiki-links, and use those edges for graph algorithms.

### Finding: SHA256-based per-file caching with atomic temp+rename writes
**Confidence:** CONFIRMED
**Evidence:** `graphify/cache.py:10-61`:
```python
def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    h.update(b"\x00")  # separator
    h.update(str(p.resolve()).encode())  # resolved path
    return h.hexdigest()
```

Cache stored at `graphify-out/cache/{hash}.json`. Save uses `.tmp` + atomic move to avoid partial writes (lines 47-61). No TTL — purely content-based.

**Implications for open-knowledge:** Open-knowledge's CC6 (per-branch cache, regenerable from files) follows the same principle. Graphify's specific approach is:
- **Hash includes resolved path + content** — same content in different paths gets different cache entries (avoids cross-project cache pollution)
- **Atomic writes** — `.tmp` + `mv` pattern (ByteRover's paper claims this but doesn't actually do it; graphify actually does)
- **No TTL** — cache invalidation is purely content-driven

Open-knowledge could adopt the SHA256-based cache key for any reference skill that needs to cache LLM output per source file.

### Finding: Watch mode + git hooks for incremental rebuild on commit/branch switch
**Confidence:** CONFIRMED
**Evidence:** `graphify/watch.py:21-95` + `graphify/hooks.py:11-80`:
- `watch.py` `_rebuild_code()` runs AST + build + cluster + report in-process (no LLM, fast)
- `_notify_only()` writes a `needs_update` flag for mixed corpora (LLM needed → user must run `/graphify --update`)
- `hooks.py` installs post-commit hook (rebuild on commit) + post-checkout hook (rebuild on branch switch)
- Hook annotation: `# graphify-hook-start` / `# graphify-hook-end` for clean uninstall

**Implications for open-knowledge:** Open-knowledge's CC6 + S6 auto-persistence pipeline already covers the "rebuild on commit" case via Hocuspocus hooks (debounced 30-60s). The git-hook approach is a fallback for non-CRDT writes (e.g., user edits file in VS Code outside the editor). Worth implementing as the **"external write recovery"** pattern from CC1's "Three write paths" section.

### Finding: Token reduction claim (71.5x) is real but methodology-bound to a specific corpus
**Confidence:** UNCERTAIN (claim verified, methodology limited)
**Evidence:** `graphify/benchmark.py:64-101` — `run_benchmark()` is implemented and runs sample queries:
```python
_SAMPLE_QUESTIONS = [
    "how does authentication work",
    "what is the main entry point",
    "how are errors handled",
    "what connects the data layer to the api",
    "what are the core abstractions",
]
```

Methodology: 
- Compute corpus tokens as `nodes * 50 words * 100/75 tokens/word` (rough estimate)
- For each query: BFS from keyword-matched nodes → count subgraph tokens
- Reduction = corpus_tokens / query_tokens

Notes: 71.5x is README claim, not hardcoded in benchmark. The script doesn't fix the benchmark seed. Reduction varies 5-100x depending on corpus size and query specificity.

**⚠ Vendor caveat:** This is graphify's own benchmark with sample questions chosen by graphify's authors. Independent verification would require running on a different corpus with different queries.

**Implications for open-knowledge:** The token-reduction-via-graph-traversal thesis is plausible and matches what ByteRover's paper claims at the architectural level. **But the specific 71.5x number is not citable without methodology disclosure.** Open-knowledge should NOT cite "71.5x reduction" as a marketing claim — instead, frame it as "graph navigation reduces token cost relative to grep+read at scale, validated by graphify, byterover, and karpathy independently."

---

## Gaps / follow-ups
- Hyperedges (3+ node groups) — graphify supports them as a first-class concept but unclear how they're queried via MCP. They might be query-only via internal Python functions.
- The skill installs a Claude Code hook — what's the hook's actual exit behavior? (Does it block tool use? Just inject text?)
- The exact prompt template for semantic extraction subagents (skill.md:181-245) — how detailed is the schema instruction?

## Related open-knowledge material
- **PQ13 (smart conventions + skills) + PQ14 (reference skills as v1)** — Graphify is the strongest in-the-wild example of the pattern
- **CC6 (derived data, per-branch cache)** — Graphify's SHA256 cache is the same pattern
- **S10 (wiki-links + backlinks)** — edge confidence typing is a natural extension worth adding
- **S4 (MCP tool surface)** — Graphify's 7 read-only tools are a strong reference for the "graph navigation" subset of MCP tools
- **New pattern to consider: PreToolUse hook for index-first navigation** — `npx openknowledge hook install`
- **New pattern to consider: separate read-only MCP surface from write CLI** — agents read via MCP, skills write via CLI
