# Evidence: GBrain Code-Knowledge Bridge (D12)

**Dimension:** D12 — Code-knowledge bridge (GStack integration)
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README "Code Integration" section

---

## Findings

### Finding: GStack bridge — code symbols are first-class brain queries
**Confidence:** CONFIRMED
**Evidence:** README "Code Integration (GStack Bridge)":

> When GStack-powered agent codes, it queries the brain first:
> - `gbrain code-callers searchKeyword` — Who calls this symbol?
> - `gbrain code-callees searchKeyword` — What does this symbol call?
> - `gbrain code-def BrainEngine` — Where is X defined?
> - `gbrain code-refs BrainEngine` — All reference sites
> - `gbrain query "..." --near-symbol BrainEngine.searchKeyword --walk-depth 2` — Symbol-graph-aware retrieval

Search hit (BRAINBENCH benchmark doc): "Cathedral II (v0.21.0) shipping call-graph edges and two-pass retrieval for commands like /investigate, /review, /plan-eng-review, and /office-hours."

> "Emits JSON on non-TTY for agent subagent shell integration."

**Implications:**
- **The brain becomes a code index too.** Symbols, call graphs, definition sites, reference sites all live in the same Postgres + pgvector substrate as documents. This unifies "what does my code do?" and "what do my notes say?" under one query interface.
- **`--near-symbol` retrieval** is qualitatively novel: when an agent is reading a code symbol, the brain returns documents semantically related to that symbol's call graph. Useful for: "given that I'm editing `BrainEngine.searchKeyword`, what spec/decision/notes touch this?"
- **Same retrieval pipeline, two corpora.** Documents and code share the hybrid-retrieval pipeline (vector + keyword + graph). This is more than markdown-aware code search; it's code-aware document search and document-aware code search.
- **OK has nothing here.** OK's MCP `search` is grep-on-markdown. Source code, function definitions, call graphs are out of scope today.
- **GStack is a sibling project** by the same author. The integration assumes GStack provides the symbol-extraction layer. For OK to match this, you'd either:
  - Pair OK with a code-symbol-extracting tool (tree-sitter? LSP-based indexer?) and feed extracted symbols into the same index.
  - Or accept that this is GBrain's "code agent + knowledge" pairing and OK targets a different audience.

### Finding: Cathedral II (v0.21.0) — call-graph edges as a typed-link variant
**Confidence:** INFERRED
**Evidence:** Search hit (BRAINBENCH 2026-04-18): "Cathedral II (v0.21.0) shipping call-graph edges and two-pass retrieval for commands like /investigate, /review, /plan-eng-review, and /office-hours."

**Implications (uncertain):**
- "Cathedral" appears to be a code/knowledge feature codename. v0.21.0 added call-graph edges — likely the same typed-link table extended with edge types like `calls`, `defined_in`, `references` for code symbols.
- "Two-pass retrieval" likely means: first pass retrieves a candidate set using hybrid search; second pass walks the call graph from those candidates to expand context. Same pattern as document graph traversal, applied to code symbols.
- Slash commands (`/investigate`, `/review`, `/plan-eng-review`, `/office-hours`) suggest GStack-side workflow integration — the user types a slash command in their coding agent, and the workflow queries GBrain's code-symbol graph.

**Confidence on Cathedral details is INFERRED.** The benchmark doc (which would have the authoritative description) returned 404 on raw fetch.

### Finding: Multi-source brain — single Postgres, multiple Git repos via `gbrain sources`
**Confidence:** CONFIRMED
**Evidence:** README "Multi-Source Brain (v0.18)":

> Single Postgres backend, multiple Git-backed brain repos. `gbrain sources add <repo> --strategy code|markdown` indexes separate repos. Unified search across all.

CLI: `gbrain sources list|add|remove|...`.

**Implications:**
- This is the architectural piece that **enables a single brain across personal notes + multiple codebases**. One Postgres, many sources, federated retrieval.
- The `--strategy code|markdown` flag is the dispatch — code repos use AST/symbol indexing; markdown repos use document indexing. Both flow into the same index.
- OK is single-content-dir today (one git repo, one Hocuspocus instance). Multi-source would require: (1) source registry, (2) per-source index strategy, (3) federated query layer.

---

## Negative searches

- Searched for whether GBrain code indexing requires GStack or works standalone → unclear. README implies "GStack-powered agent" provides the symbol layer; whether `gbrain code-def` works without GStack-extracted data is not specified.
- Searched for LSP integration → NOT MENTIONED. Symbol extraction appears to come from GStack-side tooling, not Language Server Protocol.

---

## Gaps / follow-ups

- The actual code-symbol storage schema (Postgres tables, columns) not in fetched content.
- How code symbols are extracted (tree-sitter? AST walker? GStack-emitted JSON?) requires reading source.
- Whether the call-graph is built incrementally on git push or on-demand on query is unclear.
