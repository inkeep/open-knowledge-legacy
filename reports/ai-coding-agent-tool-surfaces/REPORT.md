---
title: "AI Coding Agent Tool Surfaces: How Agents Interface with Codebases"
description: "Comprehensive documentation of the exact tools, parameter schemas, return formats, and diff mechanisms used by 11 AI coding agents (Claude Code, OpenCode, Cursor, Codex CLI, Lovable, Devin, Windsurf, Aider, Continue, Cline, OpenHands) to read, write, and navigate files. Designed to inform the construction of a virtual filesystem adapter that agents cannot distinguish from a real filesystem."
createdAt: 2026-03-20
updatedAt: 2026-03-20
subjects:
  - Claude Code
  - OpenCode
  - Cursor
  - OpenAI Codex CLI
  - Lovable
  - Devin
  - Windsurf
  - Aider
  - Continue
  - Cline
  - OpenHands
  - MCP
topics:
  - agent tool surfaces
  - diff mechanisms
  - virtual filesystem
  - codebase navigation
  - Model Context Protocol
---

# AI Coding Agent Tool Surfaces: How Agents Interface with Codebases

**Purpose:** Document the precise tool surfaces that AI coding agents use to interact with codebases — every tool name, parameter schema, return format, and diff mechanism — at sufficient detail to build a virtual filesystem adapter that an AI agent cannot distinguish from a real filesystem.

---

## Executive Summary

After analyzing 11 AI coding agents (6 via source code, 5 via web research and leaked system prompts), we find that **the tool surface for codebase interaction has converged around a remarkably small set of operations**, despite significant architectural differences between agents. This convergence makes a universal virtual filesystem adapter feasible.

**Key Findings:**

- **The minimum viable tool surface is 5 operations:** read file (with line ranges), write file (full replacement), edit file (string replacement), search content (regex), and search paths (glob). Every agent implements variants of these five. A virtual filesystem implementing just these operations would support all 11 agents studied.

- **String replacement ("old_string → new_string") is the dominant edit mechanism.** 8 of 11 agents use exact-string-match replacement as their primary or sole edit tool. The remaining 3 (Cursor, Windsurf, Lovable) use "semantic diff" formats that are converted to edits by specialized apply models. All approaches ultimately resolve to find-text-replace-text at the file level.

- **Three tool communication formats exist:** JSON function-calling (Claude Code, OpenCode, Continue, OpenHands, Cursor, Windsurf, Devin, Codex), XML tags in response text (Cline, Lovable), and unstructured text parsing (Aider). JSON function-calling is by far the most common and is the format used by MCP.

- **MCP is the universal tool extension layer.** 10 of 11 agents support MCP (Aider being the exception). A virtual filesystem MCP server implementing the standard filesystem tool interface would work with all MCP-compatible agents without any agent-specific integration.

- **AGENTS.md is the most portable instruction mechanism.** Read by Codex (primary), Cursor, Windsurf, Copilot, Claude Code (fallback), Cline, OpenHands, Continue, Aider, and Devin. Combined with `.mcp.json` for tool configuration, these two files provide maximum cross-agent coverage.

- **Fuzzy matching sophistication varies dramatically.** Claude Code uses strict exact match (no fallback). OpenCode has a 9-level fuzzy replacer chain. Aider uses diff-match-patch + git cherry-pick + relative indentation. Cline has order-invariant multi-block application. A virtual filesystem adapter that ensures clean, unambiguous file content would sidestep most fuzzy matching complexity.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| 1 | Claude Code tool surface | P0 | Deep | CONFIRMED |
| 2 | Cursor tool surface | P0 | Deep | CONFIRMED |
| 3 | OpenAI Codex CLI tool surface | P0 | Deep | CONFIRMED |
| 4 | Lovable tool surface | P0 | Deep | CONFIRMED |
| 5 | Devin tool surface | P0 | Deep | CONFIRMED |
| 6 | Other agents (Windsurf, Aider, Continue, Cline, OpenHands, OpenCode) | P0 | Deep | CONFIRMED |
| 7 | Diff application mechanisms (cross-cutting) | P0 | Deep | CONFIRMED |
| 8 | File system navigation patterns (cross-cutting) | P0 | Deep | CONFIRMED |
| 9 | MCP tool surface | P0 | Deep | CONFIRMED |
| 10 | Context/instruction mechanisms | P0 | Deep | CONFIRMED |

**Stance:** Factual. **Non-goals:** Marketing claims, pricing, model quality, prompt engineering, UI/UX evaluation.

---

## Detailed Findings

### 1. Claude Code Tool Surface

**Finding:** Claude Code exposes 30+ tools across 8 categories, using JSON function-calling with strict exact-match string replacement for edits.

**Evidence:** [evidence/claude-code.md](evidence/claude-code.md)

#### Core File Tools

| Tool | Parameters | Returns | Key Constraint |
|------|-----------|---------|----------------|
| `Read` | `file_path: string`, `offset?: number` (1-based line), `limit?: number` (default 2000) | `cat -n` format (line numbers starting at 1) | Must use absolute paths |
| `Write` | `file_path: string`, `content: string` | Success/error | Must Read file first (session-tracked) |
| `Edit` | `file_path: string`, `old_string: string`, `new_string: string`, `replace_all?: boolean` | Success/error | Must Read first; old_string must be unique unless replace_all=true; exact match only |

#### Navigation Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `Glob` | `pattern: string`, `path?: string` | File paths sorted by mtime |
| `Grep` | `pattern: string`, `path?: string`, `output_mode?: "content"\|"files_with_matches"\|"count"`, plus `-i`, `-A`, `-B`, `-C`, `multiline`, `glob`, `type`, `head_limit`, `offset` | Matching lines/files/counts (ripgrep-based) |

#### Execution & Orchestration

| Tool | Parameters | Key Behavior |
|------|-----------|-------------|
| `Bash` | `command: string`, `timeout?: number` (max 600000ms), `run_in_background?: boolean` | Working dir persists; shell state does NOT |
| `Agent` | `prompt: string`, `description: string`, `subagent_type?: string`, `model?: string` | No nesting (subagents can't spawn subagents) |
| `LSP` | `operation: string`, `filePath: string`, `line: number`, `character: number` | Diagnostics auto-pushed after edits |

#### Permission Model

Deny > Ask > Allow evaluation chain. Settings precedence: Managed > CLI > Local project > Shared project > User. Rule syntax: `Tool(specifier)` with glob patterns (gitignore-spec for files, command matching for Bash).

**Implications for virtual FS:** Must return Read output in `cat -n` format. Must track read-before-write per session. Edit failures must report "not found" or "multiple occurrences" clearly. All paths absolute.

---

### 2. Cursor Tool Surface

**Finding:** Cursor exposes ~15 agent tools with a unique two-stage edit architecture: frontier model generates semantic diffs, fine-tuned apply model (Llama 3 70B at ~1000 tok/s) converts them to complete files.

**Evidence:** [evidence/cursor-windsurf.md](evidence/cursor-windsurf.md)

#### Core Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `codebase_search` | `query: string`, `target_directories?: string[]` | Semantic search results (vector embeddings via Turbopuffer) |
| `grep_search` | `query: string`, `include_pattern?: string`, `exclude_pattern?: string`, `case_sensitive?: boolean` | Max 50 matching lines |
| `file_search` | `query: string` | Up to 10 fuzzy-matched file paths |
| `read_file` | `target_file: string`, `start_line_one_indexed?: int`, `end_line_one_indexed_inclusive?: int`, `should_read_entire_file?: boolean` | File contents (max 250 lines per call) |
| `edit_file` | `target_file: string`, `instructions: string`, `code_edit: string` | Applied changes |
| `search_replace` | *(v0.50+, ~2x faster than edit_file)* | Find-and-replace |
| `run_terminal_cmd` | `command: string`, `is_background?: boolean`, `require_user_approval?: boolean` | Command output |
| `list_dir` | `relative_workspace_path: string` | Directory listing |
| `delete_file` | `target_file: string` | Deletion confirmation |
| `reapply` | `target_file: string` | Re-attempts failed edit with smarter model |
| `web_search` | `search_term: string` | Search results |
| `fetch_rules` | `rule_names: string[]` | Rule content |
| `diff_history` | — | Recent file modifications |

#### The "Apply" Architecture

The model outputs code with `// ... existing code ...` markers for unchanged regions. A fine-tuned apply model (DeepSeek Coder / Llama 3 family) expands this into the complete file. Speculative edits on Fireworks AI achieve ~13x speedup. Cursor chose full-file rewrite over diffs because LLMs struggle with precise line numbering and encounter complete files more often in pretraining.

#### Codebase Indexing

AST chunking → Merkle tree hashing → incremental sync (every 10 min) → cloud embeddings → Turbopuffer vector storage. Only embeddings stored in cloud; source code stays local. File paths obfuscated with client-side encryption.

**Implications for virtual FS:** Cursor's edit model is fundamentally different from str_replace — it sends natural language instructions + code. A virtual FS would need to handle the apply model's output (complete file content) rather than parsing the intermediate semantic diff.

---

### 3. OpenAI Codex CLI Tool Surface

**Finding:** Codex CLI is architecturally minimal — a single `shell` tool through which all operations flow, plus a custom `apply_patch` diff format intercepted internally.

**Evidence:** [evidence/codex-devin-lovable.md](evidence/codex-devin-lovable.md)

#### Tools

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `shell` | `command: string`, `workdir: string`, `timeout_ms: number`, `with_escalated_permissions: boolean` | All operations — reads via `cat`, searches via `rg`, edits via `apply_patch` |
| `update_plan` | Plan text | Multi-step task tracking |
| `web_search` | Query text | Web search (cached by default) |

#### The `apply_patch` Format

```
*** Begin Patch
*** Add File: <path>        # New file (lines prefixed +)
*** Delete File: <path>     # Remove file
*** Update File: <path>     # Patch existing
*** Move to: <newPath>      # Optional rename
@@ context line             # Hunk anchor
 context (space prefix)
-removed line
+added line
*** End Patch
```

3 lines of context, relative paths only. Progressive fallback: exact → whitespace-insensitive. The CLI intercepts `apply_patch` internally rather than executing as shell command.

#### Sandbox

OS-level: Seatbelt (macOS), Landlock + seccomp (Linux). Network blocked by default. Writable roots: CWD, `/tmp`, configured dirs. `.git` always protected. Four policy levels: ReadOnly, WorkspaceWrite (default), DangerFullAccess, ExternalSandbox.

**Implications for virtual FS:** Since Codex routes everything through shell, a virtual FS needs to intercept common CLI commands (`cat`, `rg`, `ls`) or provide the filesystem MCP server. The `apply_patch` format is also used by OpenCode (for GPT models) and Aider's `patch` format.

---

### 4. Lovable Tool Surface

**Finding:** Lovable uses XML-tagged tools with a two-tier diff model: `<lov-line-replace>` for surgical edits and `<lov-write>` with Morph Fast Apply (7B model at 10,500 tok/s) for file reconstruction.

**Evidence:** [evidence/codex-devin-lovable.md](evidence/codex-devin-lovable.md)

#### Core Tools (XML Tag Format)

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `<lov-write>` | `file_path` | Create/overwrite file. Uses `// ... keep existing code (name)` markers |
| `<lov-line-replace>` | `file_path`, `search`, `first_replaced_line`, `last_replaced_line`, `replace` | Line-number-based search/replace (preferred for existing files) |
| `<lov-rename>` | `original_file_path`, `new_file_path` | Rename |
| `<lov-delete>` | `file_path` | Delete |
| `<lov-view>` | `file_path`, `lines?` (e.g., "1-500, 1001-1500") | Read file (default first 500 lines) |
| `<lov-search-files>` | `query` (regex), `include_pattern`, `exclude_pattern`, `case_sensitive` | Regex search |
| `<lov-add-dependency>` | Package name@version | npm install |
| `<lov-fetch-website>` | `url`, `formats` | Fetch web content |
| `<lov-read-console-logs>` | `search?` | Application console output |
| `<lov-read-network-requests>` | `search?` | Network request/response data |
| `generate_image` | `prompt`, `target_path`, `width`, `height`, `model` | AI image generation |

#### Visual Editing Round-Trip

`lovable-tagger` Vite plugin injects `data-lov-id` attributes at compile time → user clicks DOM element → traces to source JSX → client-side AST processing (Babel/SWC) → modify AST → convert back to clean JSX → minimal diff → Vite HMR. This is the pattern most relevant to a "vibe design" editor.

#### Execution Environment

StackBlitz WebContainers — full Node.js runtime in WebAssembly within the browser tab. Not a remote VM.

**Implications for virtual FS:** Lovable's `lovable-tagger` OID injection pattern is directly relevant to the vibe design editor. The `<lov-line-replace>` tool uses line numbers (not just string matching) — the virtual FS needs stable line numbering. Morph Fast Apply handles `// ... existing code ...` marker expansion.

---

### 5. Devin Tool Surface

**Finding:** Devin operates in a full cloud VM (Devbox) with rich specialized tools including LSP integration, a compound AI system (Planner, Coder, Critic, Browser Agent), and `str_replace` as primary edit mechanism.

**Evidence:** [evidence/codex-devin-lovable.md](evidence/codex-devin-lovable.md)

#### Core Tools (from leaked system prompt)

| Category | Tools |
|----------|-------|
| **Editor** | `open_file`, `create_file`, `str_replace`, `insert`, `remove_str`, `find_and_edit` |
| **Search** | `find_filecontent`, `find_filename`, `semantic_search` |
| **LSP** | `go_to_definition`, `go_to_references`, `hover_symbol` |
| **Browser** | Navigate, view, click, type, interact |
| **Deploy** | `expose_port` (creates `.devinapps.com` URLs) |
| **Reasoning** | `<think>` tag for reflection |
| **Interaction** | `message_user`, `wait`, `list_secrets` |

The prompt explicitly prohibits using vim/cat/echo for editing — structured editor tools are mandatory.

#### API (for programmatic access)

Base URL: `https://api.devin.ai`. Key endpoints: `POST /v1/sessions` (create), `POST /v1/sessions/{id}/messages` (send message), `POST /v1/attachments` (upload files). Session params include `structured_output_schema` for JSON Schema validation.

**Implications for virtual FS:** Devin's `str_replace` is conceptually identical to Claude Code's Edit — same virtual FS adapter works. LSP tools suggest a virtual FS could optionally expose type information.

---

### 6. Other Agents

#### 6a. Windsurf (Codeium)

**Finding:** Windsurf Cascade exposes 14 tools with a unique `view_code_item` (AST-based navigation) and `create_memory` (cross-session persistence). Stores embeddings locally (768-dim), unlike Cursor's cloud storage.

**Evidence:** [evidence/cursor-windsurf.md](evidence/cursor-windsurf.md)

Key tools: `codebase_search`, `grep_search`, `find_by_name` (regex file search), `view_file` (max ~200 lines), `view_code_item` (AST: `ClassName.method_name`), `edit_file`, `write_file` (separate from edit), `run_command` + `command_status` (async), `list_directory`, `read_url_content`, `search_web`, `create_memory`.

Constraints: 20 tool calls per prompt, max one code edit per turn.

#### 6b. Aider

**Finding:** Aider does NOT use structured tool calls. The LLM outputs specially-formatted text that is parsed. 12 edit format variants, with SEARCH/REPLACE blocks as primary. Codebase context via tree-sitter + PageRank "repo map."

**Evidence:** [evidence/opencode-aider.md](evidence/opencode-aider.md)

Primary edit format (SEARCH/REPLACE):
```
path/to/file.py
<<<<<<< SEARCH
exact lines to find
=======
replacement lines
>>>>>>> REPLACE
```

Fuzzy matching chain: exact str.replace → git cherry-pick (creates temp commits) → diff-match-patch (Google library). Each tried with 4 preprocessing combos: `{strip_blank_lines, relative_indent}` × `{True, False}`.

Also supports: whole file replacement, unified diff, Codex-style patch format, and architect mode (two-pass: plan → implement).

No MCP support. Git deeply integrated (auto-commit every edit, undo via git).

#### 6c. Continue

**Finding:** 19 built-in tools via OpenAI function-calling. Three distinct edit strategies: LLM-based streaming diff, exact str_replace, and batched multi_edit. Indexes via LanceDB vectors + tree-sitter + full-text search.

**Evidence:** [evidence/continue-openhands-cline.md](evidence/continue-openhands-cline.md)

Notable: `edit_existing_file` sends code with `// ... existing code ...` placeholders that a secondary LLM expands, then streaming Myers diff applies changes.

#### 6d. Cline

**Finding:** 12 tools using XML tags in response text (not JSON function-calling). Uses SEARCH/REPLACE blocks (Aider-inspired) with order-invariant multi-diff application and fuzzy whitespace matching. Early MCP adopter with dedicated `use_mcp_tool` and `access_mcp_resource` tools.

**Evidence:** [evidence/continue-openhands-cline.md](evidence/continue-openhands-cline.md)

#### 6e. OpenHands

**Finding:** 10 tools via OpenAI function-calling (LiteLLM). `str_replace_editor` (from `openhands-aci` package) supports 5 commands: view, create, str_replace, insert, undo_edit. Runs in Docker containers with HTTP-based action execution. All tools include `security_risk` parameter.

**Evidence:** [evidence/continue-openhands-cline.md](evidence/continue-openhands-cline.md)

#### 6f. OpenCode

**Finding:** 20+ tools via Zod-validated function calls. Edit tool uses a 9-level fuzzy replacer fallback chain (simple → line-trimmed → block-anchor → whitespace-normalized → indentation-flexible → escape-normalized → trimmed-boundary → context-aware → multi-occurrence). Full MCP client with stdio, SSE, HTTP, and OAuth. LSP integrated into edit/write tools.

**Evidence:** [evidence/opencode-aider.md](evidence/opencode-aider.md)

---

### 7. Diff Application Mechanisms (Cross-Cutting)

**Finding:** Five distinct diff mechanisms exist across the 11 agents, but all ultimately resolve to "find text, replace text" at the file level. The mechanisms differ in how the LLM specifies changes and how the agent applies them.

**Evidence:** All evidence files (cross-cutting synthesis)

#### Mechanism Taxonomy

| Mechanism | How It Works | Agents Using It |
|-----------|-------------|-----------------|
| **Exact string replacement** | `old_string` → `new_string`, must match byte-for-byte | Claude Code, OpenCode, Continue, OpenHands, Devin |
| **SEARCH/REPLACE blocks** | Text-formatted find/replace in LLM output | Aider (primary), Cline |
| **Custom patch format** | `*** Begin Patch / *** End Patch` with hunks | Codex CLI, OpenCode (GPT models), Aider (V4A) |
| **Semantic diff + apply model** | NL instructions + code with `// ... existing code ...` → specialized model expands | Cursor, Windsurf, Continue (edit_existing_file) |
| **Line-number-based replace** | `first_replaced_line` / `last_replaced_line` + content | Lovable |

#### Fuzzy Matching Sophistication (ranked)

| Agent | Matching Strategy | Fallback Depth |
|-------|------------------|----------------|
| **Claude Code** | Exact only | None — fails if not found |
| **Devin** | Exact only (str_replace) | None |
| **OpenHands** | Exact only (openhands-aci) | None |
| **Codex CLI** | Exact → whitespace-insensitive | 2 levels |
| **Cline** | Exact → fuzzy whitespace → order-invariant | 3 levels |
| **Continue** | Exact (single_find_and_replace) | None for str_replace; LLM-based for edit_existing_file |
| **Aider** | Exact → git cherry-pick → diff-match-patch × 4 preprocessing combos | 12+ combinations |
| **OpenCode** | 9-level chain (simple → trimmed → anchor → whitespace → indent → escape → boundary → context → multi) | 9 levels |

#### Error Recovery Patterns

| Pattern | Used By |
|---------|---------|
| Fail with descriptive error, let agent retry | Claude Code, OpenCode, OpenHands |
| Suggest similar lines on failure | Aider (SequenceMatcher, threshold 0.6) |
| Reapply with smarter model | Cursor (`reapply` tool) |
| LLM-based draft expansion as fallback | Continue, OpenHands (deprecated) |
| Progressive whitespace relaxation | Codex, Cline, OpenCode |

**Implications for virtual FS:** A virtual filesystem that produces clean, well-formatted files will work with all agents — even the strict exact-match ones. The key is ensuring the file content the agent reads via Read is exactly what it will reference in Edit. Avoid introducing whitespace variations, encoding differences, or line-ending inconsistencies.

---

### 8. File System Navigation Patterns (Cross-Cutting)

**Finding:** Agents use three complementary navigation strategies: path-based search (glob/find), content-based search (grep/regex), and semantic search (embeddings). A virtual FS must support at least the first two.

**Evidence:** All evidence files (cross-cutting synthesis)

#### How Agents Discover Project Structure

| Strategy | Tool | Used By |
|----------|------|---------|
| **Glob/pattern matching** | `Glob`, `file_glob_search`, `file_search`, `find_by_name` | Claude Code, OpenCode, Continue, Cursor, Windsurf |
| **Directory listing** | `ls`, `list_dir`, `list_directory`, `list_files` | Claude Code (Bash), OpenCode, Cursor, Windsurf, Cline |
| **Tree view** | `directory_tree`, `list` (tree-style) | MCP filesystem, OpenCode |

#### How Agents Search File Contents

| Strategy | Tool | Used By |
|----------|------|---------|
| **Regex search** | `Grep`, `grep_search`, `search_files`, `lov-search-files` | Claude Code, OpenCode, Cursor, Windsurf, Cline, Lovable |
| **Semantic search** | `codebase_search`, `codebase`, `semantic_search` | Cursor, Windsurf, Continue, Devin |
| **Code structure** | `list_code_definition_names`, `view_code_item`, LSP tools | Cline, Windsurf, Devin, Claude Code (LSP) |

#### How Agents Read Files

| Feature | Claude Code | OpenCode | Cursor | Windsurf | Cline | Lovable | Others |
|---------|------------|----------|--------|----------|-------|---------|--------|
| **Partial read** | offset/limit (line-based) | offset/limit (1-indexed) | start_line/end_line | start_line/end_line | Full file only | Line ranges ("1-500") | Varies |
| **Max per read** | 2000 lines | 2000 lines / 50KB | 250 lines | ~200 lines | Unlimited | 500 lines default | Varies |
| **Line format** | `cat -n` (numbered) | `N: content` | Raw content | Raw content | Raw content | Raw content | Varies |
| **Binary handling** | Images displayed (multimodal) | Base64 attachment | Image vision analysis | Not documented | Not documented | Not documented | Varies |

#### How Agents Handle Large Files

Most agents impose read limits (200-2000 lines). Strategies for large files:
- **Partial reads with offset/limit:** Claude Code, OpenCode, Cursor, Windsurf, Lovable
- **Truncation with continuation hint:** OpenCode (50KB cap, "more content available" message)
- **Context window management:** Aider uses repo map (tree-sitter + PageRank) to select most relevant code, staying within token budget

**Implications for virtual FS:** Must support partial reads with line ranges. Must return consistent line numbering. Should support regex search. Semantic search is a nice-to-have but not required for basic operation.

---

### 9. MCP Tool Surface

**Finding:** MCP is the universal tool extension layer, supported by 10 of 11 agents studied. The official filesystem MCP server exposes 11 tools. A virtual filesystem MCP server would work with all MCP-compatible agents.

**Evidence:** [evidence/mcp-tool-surface.md](evidence/mcp-tool-surface.md)

#### MCP Tool Definition Schema

```json
{
  "name": "tool_name",
  "description": "Human-readable description",
  "inputSchema": {
    "type": "object",
    "properties": { ... },
    "required": [...]
  }
}
```

Discovery: `tools/list` (JSON-RPC). Invocation: `tools/call` with `{name, arguments}`. Response: `{content: [{type: "text"|"image"|"resource", ...}], isError: boolean}`.

#### Official Filesystem MCP Server Tools

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `read_file` | `path: string` | Read complete file |
| `read_multiple_files` | `paths: string[]` | Batch read |
| `write_file` | `path: string, content: string` | Create/overwrite |
| `edit_file` | `path: string, edits: array, dryRun?: boolean` | Search/replace edits |
| `create_directory` | `path: string` | mkdir -p |
| `list_directory` | `path: string` | List dir contents |
| `directory_tree` | `path: string` | Recursive tree |
| `move_file` | `source: string, destination: string` | Move/rename |
| `search_files` | `path: string, pattern: string` | File search |
| `get_file_info` | `path: string` | Metadata |
| `list_allowed_directories` | — | List allowed dirs |

#### MCP Agent Support

| Agent | MCP Support | Config Location |
|-------|------------|-----------------|
| Claude Code | Native, first-class | `.mcp.json` |
| Cursor | Yes | `.cursor/mcp.json` |
| Windsurf | Yes (100 tool limit) | `~/.codeium/windsurf/mcp_config.json` |
| Cline | Yes (early adopter) | VS Code settings |
| OpenHands | Yes | SDK/UI configuration |
| Continue | Yes | `.continue/config.yaml` |
| Codex CLI | Yes | Configuration |
| VS Code Copilot | Yes | `.vscode/mcp.json` |
| Devin | Yes (DeepWiki MCP) | API |
| Aider | **No** | N/A |

#### Virtual Filesystem MCP Design

A virtual filesystem MCP server would:
1. Implement the same 11 tools as `@modelcontextprotocol/server-filesystem`
2. Back the storage with in-memory state, database, or the visual editor's internal representation
3. Present files as absolute paths (matching Claude Code's requirement)
4. Return content in plain text (agents add their own formatting)
5. Handle `edit_file` by supporting search/replace patterns
6. Use `.mcp.json` at the project root for zero-config discovery

---

### 10. Context/Instruction Mechanisms

**Finding:** AGENTS.md has the broadest cross-agent support (read by 10+ agents). CLAUDE.md has the richest hierarchical loading. Path-scoped rules are converging across all major agents.

**Evidence:** [evidence/context-instruction-mechanisms.md](evidence/context-instruction-mechanisms.md)

#### Cross-Agent Compatibility

| Config File | Primary For | Also Read By |
|-------------|------------|--------------|
| `AGENTS.md` | Codex | Cursor, Windsurf, Copilot, Claude Code (fallback), Cline, OpenHands, Continue, Aider, Devin |
| `CLAUDE.md` | Claude Code | — |
| `.cursorrules` / `.cursor/rules/` | Cursor | — |
| `.windsurfrules` / `.windsurf/rules/` | Windsurf | — |
| `.github/copilot-instructions.md` | Copilot | — |
| `.clinerules` / `.roo/` | Cline/Roo | — |
| `.openhands/microagents/` | OpenHands | — |
| `.aider.conf.yml` | Aider | — |
| `.mcp.json` | (tool config) | Claude Code, VS Code, Codex, Amazon Q, Windsurf, Cursor |

#### Path-Scoped Rules (Converging Pattern)

All major agents now support glob-scoped rules via YAML frontmatter:

```yaml
# Claude Code (.claude/rules/*.md)    # Cursor (.cursor/rules/*.mdc)
---                                    ---
paths:                                 globs: ["src/**/*.tsx"]
  - "src/**/*.tsx"                     alwaysApply: false
---                                    ---
```

**Implications for virtual FS:** Include `AGENTS.md` to provide project context to all agents. Optionally include `CLAUDE.md` for Claude Code-specific guidance. Use `.mcp.json` to configure the virtual filesystem MCP server.

---

## Cross-Cutting Analysis: The Universal Tool Surface

### Minimum Viable Virtual Filesystem

Based on this research, a virtual filesystem adapter needs to implement these operations to support all 11 agents:

| Operation | Claude Code | Cursor | Codex | Others | MCP FS |
|-----------|------------|--------|-------|--------|--------|
| **Read file** (full) | `Read` | `read_file` | `cat` (shell) | All have it | `read_file` |
| **Read file** (partial, line range) | `Read` offset/limit | `read_file` start/end | N/A | Most support it | N/A (reads full) |
| **Write file** (full replacement) | `Write` | `edit_file` (creates) | `apply_patch` Add | All have it | `write_file` |
| **Edit file** (string replace) | `Edit` old/new | `edit_file` semantic | `apply_patch` Update | All have it | `edit_file` |
| **Search content** (regex) | `Grep` | `grep_search` | `rg` (shell) | All have it | N/A (use shell) |
| **Search paths** (glob) | `Glob` | `file_search` | `find` (shell) | Most have it | `search_files` |
| **List directory** | `Bash ls` | `list_dir` | `ls` (shell) | All have it | `list_directory` |
| **Delete file** | `Bash rm` | `delete_file` | `rm` (shell) | Most have it | N/A |
| **Create directory** | `Bash mkdir` | N/A | `mkdir` (shell) | Via shell | `create_directory` |

### The Two Integration Strategies

**Strategy A: Native Tool Adapter** — For agents with dedicated file tools (Claude Code, OpenCode, Continue, OpenHands, Devin), implement the tools directly in the agent's expected format. Highest fidelity, most effort per agent.

**Strategy B: MCP Filesystem Server** — Implement a single MCP server with the standard filesystem interface. Works with 10 of 11 agents. Lower per-agent effort but may lack features like Claude Code's `cat -n` line numbering or Cursor's semantic search.

**Recommended: Both.** Use MCP as the universal layer and add thin native adapters for Claude Code and Cursor where the MCP interface is insufficient (partial reads with line numbers, semantic search).

### Edit Format Decision Tree

When the virtual FS receives an edit, it will come in one of these formats:

```
Is it a tool call with old_string/new_string?
  → Yes: Direct string replacement (Claude Code, OpenCode, Continue, OpenHands, Devin)
Is it a SEARCH/REPLACE text block?
  → Yes: Parse and apply (Aider, Cline)
Is it a *** Begin Patch format?
  → Yes: Parse patch and apply (Codex, OpenCode/GPT, Aider/V4A)
Is it a semantic diff with instructions?
  → Yes: The agent's apply model will produce the complete file; accept the full write (Cursor, Windsurf)
Is it an XML-tagged operation?
  → Yes: Parse XML and apply (Lovable, Cline)
```

---

## Appendix: Wire Format Examples

Every core operation with concrete request/response JSON for each agent. See [evidence/wire-format-examples.md](evidence/wire-format-examples.md) for the complete reference.

### Read File — Response Format Comparison

| Agent | Line format | Example |
|-------|-----------|---------|
| Claude Code | `     1→content` (spaces + number + tab) | `     1→import React from 'react';` |
| OpenCode | `N: content` inside XML wrapper | `1: import React from 'react'` |
| Cursor | Raw content (no line numbers) | `import React from 'react';` |
| MCP Filesystem | Raw text in JSON `content[0].text` | `{"type":"text","text":"import React..."}` |
| Lovable | Raw content (XML tag response) | Content returned inline |

### Edit File — The Three Mechanisms

**1. Exact string replacement** (Claude Code, OpenCode, Continue, OpenHands, Devin):
```json
{
  "old_string": "bg-blue-500 text-white",
  "new_string": "bg-blue-500 text-white hover:bg-blue-600"
}
```

**2. Semantic diff with apply model** (Cursor, Windsurf, Continue edit_existing_file):
```json
{
  "instructions": "Add hover state",
  "code_edit": "// ... existing code ...\n<button className=\"hover:bg-blue-600\">\n// ... existing code ..."
}
```

**3. Patch/block format** (Codex, Aider):
```
<<<<<<< SEARCH
bg-blue-500 text-white
=======
bg-blue-500 text-white hover:bg-blue-600
>>>>>>> REPLACE
```

### Virtual Filesystem Response Contract

For an adapter supporting all agents, return:

| Response | Format |
|----------|--------|
| File content | Raw text string (agent adds its own numbering) |
| Edit success | `"Edit applied successfully."` |
| Edit fail (not found) | Clearly state search string not found |
| Edit fail (ambiguous) | State multiple occurrences found |
| File paths | Absolute (Claude Code, OpenCode) or relative (Cursor, Codex) — support both |
| Search results | `filepath:line:content` (ripgrep-compatible) |
| MCP response | `{ content: [{ type: "text", text: "..." }], isError: false }` |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Cursor's `search_replace` tool (v0.50+):** Exact parameter schema not publicly documented yet. Known to be ~2x faster than `edit_file`.
- **Windsurf's internal apply model:** Architecture undisclosed. We know it takes `instruction` + `code_edit` but not how it converts to file changes.
- **Devin's `str_replace` fuzzy matching:** Unclear whether it has any fallback beyond exact match.
- **Lovable's `<lov-line-replace>` behavior with shifted line numbers:** The prompt says "always reference original line numbers" but edge case handling is unclear.

### Out of Scope (per Rubric)

- Model quality comparisons
- Pricing and commercial terms
- UI/UX evaluation
- Prompt engineering effectiveness
- Performance benchmarks beyond what's directly relevant to tool surface design

---

## References

### Evidence Files
- [evidence/claude-code.md](evidence/claude-code.md) — Claude Code complete tool surface
- [evidence/cursor-windsurf.md](evidence/cursor-windsurf.md) — Cursor and Windsurf tool surfaces
- [evidence/codex-devin-lovable.md](evidence/codex-devin-lovable.md) — Codex CLI, Devin, and Lovable tool surfaces
- [evidence/opencode-aider.md](evidence/opencode-aider.md) — OpenCode and Aider tool surfaces
- [evidence/continue-openhands-cline.md](evidence/continue-openhands-cline.md) — Continue, OpenHands, and Cline tool surfaces
- [evidence/wire-format-examples.md](evidence/wire-format-examples.md) — Concrete request/response JSON for every core operation across all agents: read, edit (3 mechanisms), write, search, glob, bash, MCP, Cline XML, Lovable XML, Aider SEARCH/REPLACE
- [evidence/mcp-tool-surface.md](evidence/mcp-tool-surface.md) — MCP specification and filesystem server
- [evidence/context-instruction-mechanisms.md](evidence/context-instruction-mechanisms.md) — Cross-agent instruction mechanisms

### External Sources
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) — Model Context Protocol spec
- [Claude Code Tools Reference](https://code.claude.com/docs/en/tools-reference) — Official Claude Code docs
- [Cursor Blog: Instant Apply](https://cursor.com/blog/instant-apply) — Cursor's apply model architecture
- [Codex CLI apply_patch](https://github.com/openai/codex/blob/main/codex-rs/apply-patch/apply_patch_tool_instructions.md) — Codex patch format
- [Lovable Visual Edits](https://lovable.dev/blog/visual-edits) — lovable-tagger and AST round-trip
- [Morph Fast Apply](https://www.morphllm.com/fast-apply-model) — Morph's 7B apply model
- [AGENTS.md](https://agents.md/) — Universal agent instruction format
- [Aider Edit Formats](https://aider.chat/docs/more/edit-formats.html) — Aider's edit format documentation

### Related Research
- [ai-agent-codebase-navigation/](../ai-agent-codebase-navigation/) — Higher-level survey of search/navigation strategies (less tool-schema detail)
- [coding-agent-capability-matrix/](../coding-agent-capability-matrix/) — Operational primitives comparison (skills, subagents, hooks — different angle)
- [oss-visual-editors-vibe-design/](../oss-visual-editors-vibe-design/) — OSS visual editor architectures for the vibe design use case
- [local-agent-tool-execution-patterns/](../local-agent-tool-execution-patterns/) — MCP transport patterns for local tool execution
