# Evidence: Tool Surface Design for "Native Feel" MCP Servers

**Dimension:** D5 — What tool surface would make an MCP server feel native to the agent
**Date:** 2026-04-02
**Sources:** Claude Code system prompt analysis, MCP tool description research, Desktop Commander MCP, prior report (ai-coding-agent-tool-surfaces)

---

## Key files / pages referenced

- https://arxiv.org/html/2602.14878v1 — MCP Tool Description quality research (Feb 2026)
- https://github.com/wonderwhy-er/DesktopCommanderMCP — Desktop Commander MCP
- https://github.com/Piebald-AI/claude-code-system-prompts — Claude Code system prompt analysis
- Prior report: `ai-coding-agent-tool-surfaces/REPORT.md` — 11-agent tool surface analysis

---

## Findings

### Finding: Claude Code's native tool descriptions are extremely detailed instruction manuals, not brief summaries
**Confidence:** CONFIRMED
**Evidence:** System prompt analysis (Piebald-AI/claude-code-system-prompts), prior report

Claude Code's native `Read` tool description includes:
- Must use absolute paths, not relative
- Default reads up to 2000 lines from beginning
- Results returned in `cat -n` format with line numbers starting at 1
- Can read images (multimodal), PDFs (with page ranges), Jupyter notebooks
- Large PDFs must include `pages` parameter
- Cannot read directories (use `ls` via Bash instead)
- Empty file warning behavior

Claude Code's native `Grep` tool description includes:
- Built on ripgrep (not grep or rg)
- Full regex syntax support
- Output modes: content, files_with_matches, count
- Filter parameters: glob, type, multiline
- Pagination: head_limit (default 250), offset
- Context lines: -A, -B, -C
- Pattern syntax notes (literal braces need escaping for Go code)
- Explicit guidance: "ALWAYS use Grep for search tasks. NEVER invoke grep or rg as a Bash command."

These descriptions are 200-400 words each — far more detailed than typical MCP tool descriptions (which average 1-2 sentences).

### Finding: The minimum viable tool surface for a filesystem-like MCP server is 5 operations
**Confidence:** CONFIRMED
**Evidence:** Prior report `ai-coding-agent-tool-surfaces/REPORT.md` (March 2026)

Analysis of 11 AI coding agents found convergence around 5 core operations:
1. Read file (with line ranges)
2. Write file (full replacement)
3. Edit file (string replacement)
4. Search content (regex grep)
5. Search paths (glob/find)

Every agent implements variants of these five. A virtual filesystem implementing these would support all 11 agents studied.

### Finding: Desktop Commander MCP is the closest existing MCP server to mirroring Claude Code's native tool surface
**Confidence:** CONFIRMED
**Evidence:** https://github.com/wonderwhy-er/DesktopCommanderMCP

Desktop Commander provides:
- `read_file` / `write_file` — file operations
- `edit_block` — search/replace editing (uses <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format)
- `search_files` — pattern-based file search
- `list_directory` / `create_directory` / `move_file` — directory operations
- `execute_command` — terminal commands
- `get_file_info` — metadata

This comes closer to the Claude Code native surface than any other MCP server, but still differs in:
- `edit_block` uses diff markers rather than `old_string`/`new_string`
- No `Glob` equivalent
- No `Grep` equivalent (has `search_files` which searches paths, not content)
- Terminal tool is `execute_command` not `Bash`
- No line-numbered output format

### Finding: An MCP server that matches Claude Code's exact tool names and behaviors would need to mirror 5 specific conventions
**Confidence:** INFERRED
**Evidence:** Synthesis of system prompt analysis + tool surface research

To make an MCP server "feel native" to Claude Code, it would need to match these conventions:

1. **Return format:** Read must return `cat -n` format (line number + tab + content, line numbers starting at 1)
2. **Edit semantics:** Edit must accept `old_string`/`new_string` (exact match, not regex), with `replace_all` flag, and reject if old_string not found or not unique
3. **Read-before-write tracking:** Write should conceptually require a prior Read of the same file (or at least not error when the agent assumes this)
4. **Grep richness:** Must support output_mode, context lines, glob/type filters, multiline, pagination — not just basic pattern matching
5. **Path conventions:** All paths absolute; Glob returns paths sorted by mtime

However, the tool names in MCP will always be `mcp__<server>__<tool>`, not `Read`, `Write`, `Edit`. The agent sees these as different tools regardless of behavioral similarity.

### Finding: Tool descriptions that explicitly state "use this instead of [native tool] when..." improve selection
**Confidence:** INFERRED
**Evidence:** arxiv.org/html/2602.14878v1, Anthropic advanced tool use guidance

The research on MCP tool descriptions recommends:
- Clear Purpose: state what the tool does
- Usage Guidelines: specify WHEN to use it (vs alternatives)
- Stated Limitations: document constraints
- Parameter Explanation: define all inputs with intent

For an MCP filesystem server to compete with native tools, its descriptions should explicitly say something like:
"Use this tool to read files from the knowledge base. Unlike the built-in Read tool, this searches indexed content rather than the local filesystem."

This creates a clear distinction rather than a confusing overlap.

### Finding: CLAUDE.md instructions can guide tool routing but are not deterministic
**Confidence:** INFERRED
**Evidence:** Claude Code documentation, community examples

CLAUDE.md can include instructions like:
```
When accessing knowledge base content under /knowledge/*, use the mcp__kb__ tools instead of native Read/Write/Edit.
```

This is a strong signal but not a guarantee. The model may still reach for native tools when the path seems filesystem-like. Combining CLAUDE.md guidance with clear tool descriptions provides the best chance of consistent routing.

---

## Gaps / follow-ups

- No empirical testing exists on whether matching native tool behavior improves MCP tool adoption by agents
- The tradeoff between "mirror native tools exactly" vs "clearly differentiate from native tools" is untested
- CLAUDE.md routing guidance reliability needs measurement
- MCP ToolAnnotations could theoretically carry metadata about "preferred domain" but this doesn't exist today
