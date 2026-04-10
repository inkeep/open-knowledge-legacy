# Evidence: Comparison — just-bash MCP vs Custom MCP Tools

**Dimension:** D14 — Side-by-side comparison: just-bash MCP vs custom MCP tools for each core operation
**Date:** 2026-04-02
**Sources:** Synthesis of D1-D13 findings, MCP spec, tool design research

---

## Key sources referenced

- Evidence files D1-D13 (synthesis)
- MCP spec 2025-11-25 (structuredContent)
- Mintlify MCP (2 tools: search, get_page) as production reference
- GitHub Copilot tool reduction study (40→13 tools)
- CLI-vs-MCP token analysis (Reinhard 2026)

---

## Findings

### Finding: Side-by-side comparison for READ operation

**Confidence:** CONFIRMED / INFERRED (mixed)

| Aspect | just-bash exec `cat path` | Custom `read(path)` |
|---|---|---|
| **Implementation** | `bash.exec('cat path')` → parse → interpret → cat → fs.readFile | `fs.readFile(path)` → enrich → return |
| **What agent gets** | Raw file content (stdout string) | File content + frontmatter + backlinks + metadata |
| **Latency** | ~5-15ms overhead (shell parse + interpret) + readFile | readFile + ~2-5ms (enrichment) |
| **Enrichment** | None — stdout is a string, no sideband | Full — structuredContent carries metadata |
| **Composability** | Yes — `cat file | grep pattern | head -5` | No — separate tool calls needed |
| **Error handling** | Exit code + stderr (Unix convention) | Structured error with context |

**Verdict:** Custom read wins for enrichment; exec wins for composability. If agents rarely compose reads with downstream commands, custom read is strictly better.

### Finding: Side-by-side comparison for SEARCH operation

**Confidence:** CONFIRMED / INFERRED (mixed)

| Aspect | just-bash `grep -rn pattern path` | Custom `search(query)` backed by Orama |
|---|---|---|
| **Implementation** | bash.exec('grep -rn ...') → grep iterates files → fs.readFile per file | orama.search(query) → ranked results |
| **What agent gets** | All matching lines with file:line format (exhaustive) | Top-N ranked results with scores, snippets, metadata |
| **Latency** | O(N files) — reads every file, regex matches every line | O(1) — index lookup, typically < 10ms |
| **Result quality** | Exhaustive but unranked — every match is equal | Ranked by relevance — best results first |
| **Use case** | "Find every occurrence of X" (precision) | "Find content about topic Y" (recall + ranking) |
| **Enrichment** | None — grep output is lines | Relevance scores, frontmatter, snippets |

**Verdict:** These serve different purposes. grep is for precise, exhaustive text search; Orama is for semantic/ranked search. A KB platform needs BOTH. The custom search tool provides the primary search experience; grep (via exec or custom tool) provides the "find every occurrence" escape hatch.

### Finding: Side-by-side comparison for LIST operation

**Confidence:** CONFIRMED / INFERRED (mixed)

| Aspect | just-bash `ls -la path` | Custom `list(path)` |
|---|---|---|
| **Implementation** | bash.exec('ls -la path') → ls → fs.readdir + fs.stat | fs.readdir(path) → enrich each entry |
| **What agent gets** | Unix listing (permissions, size, date, name) in text format | Structured array of entries with frontmatter, tags, descriptions |
| **Latency** | ~5-15ms overhead + readdir + N*stat | readdir + N*stat + N*enrichment |
| **Enrichment** | None — standard ls output | Per-file frontmatter, document type, tag arrays |
| **Composability** | Yes — `ls -la | grep "\.md$" | sort -k5 -rn` | No — separate tool calls |

**Verdict:** Custom list wins when agents need to understand WHAT documents contain (tags, descriptions), not just their filesystem metadata. ls provides standard metadata (size, date) but nothing content-aware.

### Finding: Side-by-side comparison for WRITE/EDIT operation

**Confidence:** INFERRED

| Aspect | just-bash `sed -i 's/old/new/' path` | Custom `edit(path, old, new)` |
|---|---|---|
| **Implementation** | bash.exec('sed -i ...') → sed → fs.readFile + fs.writeFile | fs.readFile → string replace → CRDT-aware write |
| **CRDT routing** | fs.writeFile must handle CRDT translation internally | Write handler explicitly applies Yjs operations |
| **Permission check** | IFileSystem level (EROFS or custom) | MCP handler level (explicit permission model) |
| **Escaping** | Regex escaping required — `s/old/new/` breaks on `/`, `&`, `\` in content | Parameters are strings — no escaping issues |
| **Conflict resolution** | None — sed overwrites | CRDT merge semantics preserve concurrent edits |
| **Validation** | None — sed executes blindly | Can validate old content still matches before editing |

**Verdict:** Custom edit is significantly safer. sed's regex escaping makes it fragile for arbitrary content. A custom edit tool can validate the old content exists before applying the change, apply CRDT-aware merges, and enforce permissions at the application level rather than the filesystem level.

### Finding: The hybrid architecture is optimal — semantic tools + bash escape hatch
**Confidence:** INFERRED
**Evidence:** Synthesis of all comparisons

The pattern that emerges:

```
MCP Server (openkb)
├── read(path)              → Direct: enriched read with frontmatter/backlinks
├── search(query)           → Direct: Orama ranked search with snippets
├── list(path)              → Direct: enriched directory listing with tags
├── edit(path, old, new)    → Direct: CRDT-aware validated edit
├── write(path, content)    → Direct: CRDT-aware create/overwrite
├── grep(pattern, path)     → Direct OR just-bash: exhaustive text search
└── bash(command)           → just-bash: power-user escape hatch
```

Total: 6-7 tools. Well within the 5-15 tool sweet spot.

The bash tool is ADDITIVE — it doesn't replace semantic tools, it complements them. Use cases:
- Complex pipelines: `grep -r "TODO" /kb | sort | uniq -c`
- Compound operations: `find /kb -name "*.md" -newer /kb/changelog.md`
- Format-specific agents: Coding agents that think in bash
- Edge cases: Any operation not covered by the 5 semantic tools

### Finding: Latency comparison summary
**Confidence:** INFERRED

| Operation | just-bash exec | Custom direct | Delta |
|---|---|---|---|
| Read file | 10-25ms (parse+interpret+readFile) | 5-15ms (readFile+enrich) | +5-15ms for exec |
| Search (500 docs) | 500-1000ms (grep scans all files) | 5-15ms (Orama index) | 50-100x faster for custom |
| List directory | 10-20ms (parse+interpret+readdir+stat) | 5-15ms (readdir+stat+enrich) | +5-10ms for exec |
| Edit file | 15-30ms (parse+interpret+sed+read+write) | 10-20ms (read+validate+write) | +5-15ms for exec |

The parse+interpret overhead is 5-15ms per call. For individual operations this is negligible. For batch operations (grep over many files), the overhead is amortized because the parse happens once and the inner loop is readFile-level.

The DRAMATIC difference is search: grep is O(N files) while Orama is O(1 index lookup). This cannot be closed by optimizing just-bash — it's a fundamental algorithmic difference.

---

## Gaps / follow-ups

* Head-to-head benchmark with real agent completing a KB task using both approaches
* Whether the 5-15ms parse overhead matters for agent-perceived latency (agent round-trips are typically 1-3 seconds)
* Real-world distribution of operations (what % of agent KB actions are read vs search vs list vs edit)
