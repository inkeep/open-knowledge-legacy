# Evidence: Grep-Equivalent MCP Tools and Search-Backed Alternatives

**Dimension:** D6 — Grep implementations in MCP and search-backed alternatives
**Date:** 2026-04-02
**Sources:** mcollina/mcp-ripgrep, MCP filesystem search_files, Orama MCP server, Typesense MCP server

---

## Key files / pages referenced

- https://github.com/mcollina/mcp-ripgrep — MCP ripgrep wrapper by Matteo Collina
- https://glama.ai/mcp/servers/@mcollina/mcp-ripgrep/tools/advanced-search — Advanced search parameters
- https://mcpservers.org/servers/kpetrovsky/kp-ripgrep-mcp — Ripgrep MCP (alternative)
- https://github.com/avarant/typesense-mcp-server — Typesense MCP
- MCP filesystem `search_files` — Path-matching only

---

## Findings

### Finding: mcollina/mcp-ripgrep is the most complete Grep-equivalent MCP tool, with 16+ parameters on advanced-search
**Confidence:** CONFIRMED
**Evidence:** GitHub repo + Glama tool documentation

Tools exposed:
1. `search` — basic ripgrep search (pattern, path)
2. `advanced-search` — full ripgrep with options:
   - `pattern` (required): search pattern
   - `path` (required): search directory/file
   - `caseSensitive`: boolean
   - `filePattern`: glob filter
   - `fixedStrings`: treat pattern as literal
   - `fileType`: filter by type (js, py, etc.)
   - `maxResults`: result limit
   - `context`: context lines count
   - `invertMatch`: negate match
   - `wordMatch`: whole word matching
   - `includeHidden`: search hidden files
   - `followSymlinks`: boolean
   - `showFilenamesOnly`: files_with_matches mode
   - `showLineNumbers`: boolean
   - `useColors`: boolean
   - `countLines`: count mode
3. `count-matches` — pattern frequency
4. `list-files` — list searchable files
5. `list-file-types` — ripgrep type system reference

Comparison to Claude Code's native Grep:

| Feature | Claude Code Grep | mcp-ripgrep |
|---------|-----------------|-------------|
| Regex support | Full | Full |
| Output modes | content, files_with_matches, count | Via separate tools + flags |
| Context lines | -A, -B, -C (separate) | Single `context` param |
| Glob filter | `glob` param | `filePattern` param |
| Type filter | `type` param | `fileType` param |
| Multiline | `multiline` boolean | Not documented |
| Pagination | `head_limit` (default 250), `offset` | `maxResults` |
| Case sensitivity | `-i` flag | `caseSensitive` flag |
| Line numbers | `-n` flag (default true) | `showLineNumbers` flag |
| Word matching | Not explicit | `wordMatch` flag |
| Invert match | Not explicit | `invertMatch` flag |

The mcp-ripgrep `advanced-search` is the closest MCP equivalent to Claude Code's Grep, but it uses different parameter names and lacks multiline support and the pagination model (head_limit + offset).

### Finding: The official MCP filesystem server's search_files searches file PATHS, not file CONTENTS
**Confidence:** CONFIRMED
**Evidence:** MCP filesystem README

`search_files(path, pattern, excludePatterns)` — searches for files matching a pattern in their name/path. This is equivalent to `find` or `Glob`, NOT `grep`. There is no content search tool in the official MCP filesystem server.

This is the single biggest gap between the MCP filesystem server and Claude Code's native tool surface for coding workflows.

### Finding: Search-index-backed alternatives (Orama, Typesense) provide different semantics than grep
**Confidence:** CONFIRMED
**Evidence:** MCP servers for Orama and Typesense

**Orama MCP server:**
- Stores documents in embedded Orama vector database
- Hybrid search: full-text + vector similarity
- Document management and semantic search
- Local-first, no external service required

**Typesense MCP server:**
- Collection management, document indexing
- Keyword and vector similarity search
- External Typesense instance required

Neither is a "grep replacement" — they provide:
- **Ranked results** (relevance scoring) vs grep's **exhaustive matching**
- **Semantic search** (meaning-based) vs grep's **exact pattern matching**
- **Document-level results** vs grep's **line-level results**
- **Pre-indexed content** vs grep's **on-the-fly scanning**

### Finding: A Grep-over-search-index tool would need to reconcile fundamentally different result semantics
**Confidence:** INFERRED
**Evidence:** Analysis of grep vs search index behaviors

If implementing a `grep`-equivalent MCP tool over Orama (or similar search index):

| Aspect | Traditional Grep | Search-Index Grep |
|--------|-----------------|-------------------|
| Match guarantee | Exhaustive — finds ALL matches | Best-effort — may miss if not indexed |
| Result format | Line-by-line with context | Document/chunk-level with score |
| Pattern support | Full regex | Limited (depends on index) |
| Freshness | Always current (reads filesystem) | Depends on index freshness |
| Performance | Linear scan (slow on large codebases) | Sub-linear (fast on large content) |
| Ranking | No ranking (all matches equal) | Ranked by relevance |

The tradeoff: regex grep (exact matching, exhaustive) vs enriched search (ranked, semantic, faster). For a knowledge platform where content is already indexed, a search-backed "grep" would be faster but semantically different from what agents expect from grep.

A practical hybrid approach:
1. Use search index for coarse filtering (which documents contain pattern?)
2. Fetch full document content
3. Run actual regex grep on fetched content for precise line-level results
4. Return results in grep-compatible format (line numbers, context lines)

This mirrors ChromaFs's two-stage grep: Chroma query (coarse) + in-memory regex (fine).

---

## Gaps / follow-ups

- No MCP server implements grep over a search index (opportunity)
- The two-stage approach (index query + precise regex) is proven by ChromaFs but not packaged as MCP
- Multiline grep support is rare in MCP tools — Claude Code's Grep is unusual in supporting it
- The pagination model (head_limit + offset) is unique to Claude Code and not replicated in any MCP grep tool
