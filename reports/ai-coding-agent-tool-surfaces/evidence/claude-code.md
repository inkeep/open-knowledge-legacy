# Evidence: Claude Code Tool Surface

**Dimension:** 1 (Claude Code tool surface)
**Date:** 2026-03-20
**Sources:** Claude Code system prompt (direct observation), official docs (code.claude.com), community analysis

---

## Key sources referenced

- https://code.claude.com/docs/en/tools-reference — Official tools reference
- https://code.claude.com/docs/en/permissions — Permission model
- https://code.claude.com/docs/en/memory — CLAUDE.md and memory
- https://code.claude.com/docs/en/sub-agents — Subagent system
- https://github.com/Piebald-AI/claude-code-system-prompts — System prompt documentation
- Direct observation of tool schemas in current session

---

## Findings

### Finding: Claude Code exposes 30+ tools across 8 categories
**Confidence:** CONFIRMED
**Evidence:** Direct observation of tool definitions in current session + official docs

Complete tool inventory:

**File tools:**
- `Read` — read files (text, images, PDFs, notebooks). Params: `{file_path: string, offset?: number, limit?: number, pages?: string}`. Returns cat -n format (line numbers starting at 1). Default 2000 lines. Must use absolute paths.
- `Write` — create/overwrite files. Params: `{file_path: string, content: string}`. Must-read-before-write enforced for existing files.
- `Edit` — exact string replacement. Params: `{file_path: string, old_string: string, new_string: string, replace_all?: boolean}`. Must read first. old_string must be unique (or use replace_all). Exact match required including whitespace.
- `NotebookEdit` — Jupyter cell operations. Params: `{notebook_path: string, new_source: string, cell_id?: string, cell_type?: "code"|"markdown", edit_mode?: "replace"|"insert"|"delete"}`.

**Search tools:**
- `Glob` — file pattern matching. Params: `{pattern: string, path?: string}`. Returns paths sorted by mtime.
- `Grep` — content search via ripgrep. Params: `{pattern: string, path?: string, output_mode?: "content"|"files_with_matches"|"count", glob?: string, type?: string, -i?: boolean, -n?: boolean, -A?: number, -B?: number, -C?: number, context?: number, multiline?: boolean, head_limit?: number, offset?: number}`.

**Execution:**
- `Bash` — shell commands. Params: `{command: string, description?: string, timeout?: number (max 600000), run_in_background?: boolean, dangerouslyDisableSandbox?: boolean}`. Working dir persists, shell state does NOT.

**Orchestration:**
- `Agent` — spawn subagent. Params: `{prompt: string, description: string, subagent_type?: string, model?: string, run_in_background?: boolean, isolation?: "worktree"}`. No nesting (subagents can't spawn subagents).
- `Skill` — invoke skill. Params: `{skill: string, args?: string}`.

**Web:**
- `WebSearch` — web search. Params: `{query: string, allowed_domains?: string[], blocked_domains?: string[]}`.
- `WebFetch` — fetch URL + process with prompt. Params: `{url: string, prompt: string}`. Fails for authenticated URLs.

**Task management:**
- `TodoWrite` — non-interactive task list. Params: `{todos: [{content: string, status: "pending"|"in_progress"|"completed", activeForm: string}]}`.
- `TaskCreate/TaskGet/TaskList/TaskUpdate/TaskStop/TaskOutput` — interactive task management.

**Code intelligence:**
- `LSP` — language server operations. Operations: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls, getDiagnostics. Params: `{operation: string, filePath: string, line: number, character: number}`.

**Git isolation:**
- `EnterWorktree` — create isolated git worktree. Params: `{name?: string}`.
- `ExitWorktree` — leave worktree. Params: `{action: "keep"|"remove", discard_changes?: boolean}`.

**Planning:**
- `EnterPlanMode` / `ExitPlanMode` — switch to/from read-only plan mode.

**MCP:**
- `ToolSearch` — discover deferred MCP tools. Params: `{query: string, max_results?: number}`.
- `ListMcpResourcesTool` / `ReadMcpResourceTool` — MCP resource access.
- `mcp__<server>__<tool>` — dynamic MCP tools.

**Scheduling:**
- `CronCreate/CronDelete/CronList` — session-scoped scheduled tasks.

### Finding: Edit tool uses exact string matching — no fuzzy fallback
**Confidence:** CONFIRMED
**Evidence:** Direct observation of Edit tool behavior

Claude Code's Edit tool is strict exact-match only:
- `old_string` must match file content byte-for-byte including whitespace/indentation
- If not found → error
- If multiple occurrences and replace_all=false → error asking for more context
- No fuzzy matching, no line-trimming, no indentation normalization (unlike OpenCode's 9-level chain)

### Finding: Read-before-write/edit is session-tracked and enforced
**Confidence:** CONFIRMED
**Evidence:** Write tool description states "This tool will fail if you did not read the file first"

Both Write (for existing files) and Edit require prior Read call on the same file in the session. This is a server-side enforcement, not just guidance.

### Finding: Permission model uses deny > ask > allow evaluation with 5 precedence levels
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/permissions

Settings precedence: Managed → CLI args → Local project (.claude/settings.local.json) → Shared project (.claude/settings.json) → User (~/.claude/settings.json). Denial at any level cannot be overridden.

Rule syntax: `Tool` or `Tool(specifier)` with glob patterns. Bash rules parse command structure. Read/Edit rules follow gitignore spec.

### Finding: CLAUDE.md loaded from hierarchical directory walk
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/memory

Discovery hierarchy: managed policy → ~/.claude/CLAUDE.md → ~/.claude/rules/*.md → ./CLAUDE.md → ./.claude/CLAUDE.md → ./.claude/rules/*.md → ./CLAUDE.local.md → parent directories (walking up) → subdirectories (on demand).

Supports @import syntax for including other files (max depth 5). Path-scoped rules use YAML frontmatter with glob patterns.

### Finding: All file paths must be absolute
**Confidence:** CONFIRMED
**Evidence:** Read, Write, Edit, NotebookEdit all require absolute paths

**Implications for virtual filesystem:** The adapter must present files with absolute paths. Relative path resolution happens at the agent level, not the tool level.

---

## Implications for virtual filesystem adapter

1. Must implement: Read (with offset/limit/line-number format), Write (with read-tracking), Edit (exact string match), Glob (pattern matching, mtime sort), Grep (ripgrep-compatible regex with multiple output modes)
2. Must track which files have been Read in the session (for write/edit validation)
3. Must return Read output in `cat -n` format (line numbers starting at 1)
4. All paths must be absolute
5. Glob results must be sorted by modification time
6. Edit failures must return clear error messages about "not found" or "multiple occurrences"

---

## Gaps / follow-ups

* Exact truncation behavior for large files (is it exactly 2000 lines? what about very long lines?)
* How the sandbox model restricts filesystem access (Seatbelt/bubblewrap details)
* Whether Edit has any fuzzy matching in newer versions (system prompt says exact, but implementation may differ)
