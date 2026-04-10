# Evidence: Unix Commands Relevance for KB Agents

**Dimension:** D7 — Which of 100+ commands matter for knowledge base operations?
**Date:** 2026-04-02
**Sources:** just-bash command registry, grep/rg implementation analysis, Claude Code Grep tool signature comparison

---

## Key files referenced

- `src/commands/registry.ts` — Full command list
- `src/commands/grep/grep.ts` — grep flag support
- `src/commands/rg/rg.ts` — rg (ripgrep) flag support
- `src/commands/search-engine/matcher.ts` — SearchOptions interface

---

## Findings

### Finding: Core KB agent commands — 12 commands cover 90%+ of knowledge work
**Confidence:** INFERRED
**Evidence:** Analysis of coding agent workflows (Claude Code, Cursor) mapped to KB operations

**Tier 1 — Essential (daily use by any KB agent):**
1. `cat` — read file content (with -n for line numbers)
2. `grep` (-r, -n, -i, -l, -c, --include, --exclude, -A/-B/-C context) — content search
3. `ls` (-la, -R) — directory listing
4. `find` (-name, -type, -newer, -exec) — file discovery
5. `head` / `tail` (-n) — partial file reading
6. `wc` (-l, -w, -c) — counting

**Tier 2 — Important (frequent for content manipulation):**
7. `sed` (s/old/new/, -i in-place) — content editing
8. `sort` / `uniq` — content deduplication and ordering
9. `jq` — JSON/frontmatter processing
10. `diff` — content comparison
11. `tree` — directory visualization
12. `awk` — field extraction

**Tier 3 — Occasional (specialized workflows):**
- `cut`, `tr`, `paste` — text transformation
- `xargs` — batch operations
- `rg` (ripgrep) — advanced search with type filters and .gitignore
- `yq` — YAML processing

**Tier 4 — Rarely needed for KB:**
- `gzip`, `tar` — compression (KB content is typically uncompressed)
- `sqlite3` — database operations (already handled by Orama)
- `python3`, `js-exec` — scripting (overkill for KB operations)
- `curl` — network (KB content is local)
- `chmod`, `ln`, `stat` — filesystem metadata

### Finding: just-bash grep supports most flags Claude Code's Grep tool uses
**Confidence:** CONFIRMED
**Evidence:** Comparison of `src/commands/grep/grep.ts` flags vs Claude Code Grep tool parameters

| Claude Code Grep parameter | just-bash grep equivalent | Status |
|---------------------------|--------------------------|--------|
| `pattern` (regex) | Positional arg | YES |
| `path` | Positional arg | YES |
| `-i` (case insensitive) | `-i, --ignore-case` | YES |
| `-n` (line numbers) | `-n, --line-number` | YES |
| `-A` (after context) | `-A NUM` | YES |
| `-B` (before context) | `-B NUM` | YES |
| `-C` (context) | `-C NUM` | YES |
| `output_mode: "content"` | Default | YES |
| `output_mode: "files_with_matches"` | `-l` | YES |
| `output_mode: "count"` | `-c` | YES |
| `glob` (file filter) | `--include=GLOB` | YES |
| `type` (file type filter) | Not in grep, YES in `rg --type` | PARTIAL |
| `head_limit` (result pagination) | `-m NUM, --max-count` | PARTIAL (per-file, not global) |
| `offset` (skip results) | Not supported | NO |
| `multiline` | Not in grep, YES in `rg -U --multiline` | YES (via rg) |

just-bash's `rg` command additionally supports:
- `--type` (file type filtering like "js", "py", "ts")
- `-U, --multiline` (patterns spanning lines)
- `--json` (JSON Lines output)
- `--column` (column number of match)
- `--stats` (search statistics)
- `-S, --smart-case` (auto case sensitivity)

### Finding: just-bash grep is EXHAUSTIVE, not ranked — matches real grep behavior
**Confidence:** CONFIRMED
**Evidence:** `src/commands/grep/grep.ts` and `src/commands/search-engine/matcher.ts`

grep processes all files and returns all matching lines. There is no relevance ranking, no result scoring, no "best N results" mode. This matches real grep behavior, which is what coding agents expect.

For a KB platform, this means:
- grep over the virtual filesystem gives exhaustive results (every line that matches)
- Orama search gives ranked results (most relevant first)
- Both are useful — grep for precision ("find every occurrence of X"), search for recall ("find content about topic Y")

### Finding: Parallel batch processing in grep (batch size 50) and find (batch size 500)
**Confidence:** CONFIRMED
**Evidence:** `src/commands/grep/grep.ts` line 302, `src/commands/find/find.ts` line 13

```typescript
// grep
const BATCH_SIZE = 50;
for (let i = 0; i < filesToSearch.length; i += BATCH_SIZE) {
  const batch = filesToSearch.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(batch.map(async (fileEntry) => { ... }));
}

// find
const FIND_BATCH_SIZE = 500;
```

This means grep/find on a custom IFileSystem will issue parallel readFile/stat calls. The IFileSystem implementation needs to handle concurrent reads efficiently.

### Finding: The sed command supports in-place editing (-i) through the filesystem
**Confidence:** CONFIRMED
**Evidence:** `src/commands/sed/sed.ts` lines 30-39

sed with `-i` reads from `ctx.fs.readFile()` and writes back via `ctx.fs.writeFile()`. This means `mcp__openkb__edit(path, old, new)` could be implemented as `bash.exec('sed -i "s/old/new/g" path')` — but sed's regex escaping requirements make this fragile for arbitrary content. A custom edit command would be safer.

---

## Gaps / follow-ups

* Actual agent command usage distribution (which commands agents use most) from real logs not available
* Performance of grep over a large (1000+ page) virtual filesystem not benchmarked
