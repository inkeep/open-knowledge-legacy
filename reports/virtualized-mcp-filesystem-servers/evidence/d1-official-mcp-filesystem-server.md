# Evidence: Official MCP Filesystem Server vs Claude Code Native Tools

**Dimension:** D1 — The standard filesystem MCP server
**Date:** 2026-04-02
**Sources:** modelcontextprotocol/servers GitHub repo, Claude Code system prompt analysis, prior report (ai-coding-agent-tool-surfaces)

---

## Key files / pages referenced

- https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem — Official MCP filesystem server
- https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md — Tool documentation
- Prior report: `ai-coding-agent-tool-surfaces/REPORT.md` — Claude Code tool surface (lines 80-107)

---

## Findings

### Finding: The official MCP filesystem server exposes 14 tools that partially overlap with Claude Code's native tools
**Confidence:** CONFIRMED
**Evidence:** Official README + npm @modelcontextprotocol/server-filesystem@2025.3.28

Official MCP filesystem server tools:

| Tool | Parameters | Category |
|------|-----------|----------|
| `read_text_file` | path, head?, tail? | Read |
| `read_media_file` | path | Read |
| `read_multiple_files` | paths[] | Read |
| `list_directory` | path | Navigation |
| `list_directory_with_sizes` | path, sortBy? | Navigation |
| `directory_tree` | path, excludePatterns? | Navigation |
| `search_files` | path, pattern, excludePatterns? | Search |
| `get_file_info` | path | Metadata |
| `list_allowed_directories` | (none) | Meta |
| `write_file` | path, content | Write |
| `edit_file` | path, edits[{oldText, newText}], dryRun? | Write |
| `create_directory` | path | Write |
| `move_file` | source, destination | Write |

### Finding: There is a significant gap between the MCP filesystem server and Claude Code's native tools
**Confidence:** CONFIRMED
**Evidence:** Comparison of tool surfaces

| Capability | Claude Code Native | MCP Filesystem Server | Gap |
|-----------|-------------------|----------------------|-----|
| Read file | `Read(file_path, offset?, limit?)` — cat -n format, line numbers | `read_text_file(path, head?, tail?)` — raw content | Different return formats, different pagination model |
| Write file | `Write(file_path, content)` — requires prior Read | `write_file(path, content)` — no read prerequisite | Session tracking differs |
| Edit file | `Edit(file_path, old_string, new_string, replace_all?)` — single replacement | `edit_file(path, edits[], dryRun?)` — batch edits, dry run | Different paradigms (single vs batch, no dry run in CC) |
| Glob search | `Glob(pattern, path?)` — mtime-sorted results | Not present (search_files is regex path search) | **No equivalent** |
| Content search (grep) | `Grep(pattern, ...)` — 13+ params, ripgrep-based | `search_files(path, pattern, excludePatterns?)` — path matching only | **No content grep** — search_files matches file NAMES, not contents |
| Directory listing | Not a separate tool (Bash `ls`) | `list_directory`, `list_directory_with_sizes`, `directory_tree` | MCP has more directory tools |
| Bash execution | `Bash(command, timeout?, run_in_background?)` | Not present | **No equivalent** |
| File metadata | Not a separate tool | `get_file_info(path)` | Only in MCP |
| Media reading | Part of Read tool (multimodal) | `read_media_file(path)` — separate tool | Different approach |

**Critical gaps in MCP filesystem server vs Claude Code:**
1. No `Grep` equivalent (content search)
2. No `Glob` equivalent (file path pattern matching)
3. No `Bash` equivalent (command execution)
4. Different response formats (no `cat -n` line numbering)
5. No read-before-write enforcement

### Finding: MCP edit_file uses batch edits; Claude Code Edit uses single replacement
**Confidence:** CONFIRMED
**Evidence:** API comparison

MCP: `edit_file(path, edits: [{oldText, newText}, ...], dryRun?: boolean)`
- Supports multiple edits per call
- Has dry run mode
- Pattern matching (unclear if regex)

Claude Code: `Edit(file_path, old_string, new_string, replace_all?: boolean)`
- Single old/new pair per call
- No dry run
- Exact string match only (no regex)
- `replace_all` flag for multiple occurrences

**Implications:** An MCP server mimicking Claude Code's native Read/Write/Edit would need to match the exact parameter names, return formats, and behavioral constraints (like read-before-write tracking) to feel identical.

---

## Gaps / follow-ups

- The MCP filesystem server has no content search tool — this is the biggest gap for coding workflows
- Tool annotations (readOnlyHint, destructiveHint) are set on MCP tools but not on Claude Code native tools
- The `search_files` tool in MCP searches file *paths* not file *contents*, which is fundamentally different from grep
