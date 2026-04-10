# Evidence: Continue, OpenHands, and Cline Tool Surfaces

**Dimension:** 6c (Continue), 6d (Cline), 6e (OpenHands)
**Date:** 2026-03-20
**Sources:** Source code analysis (Continue, OpenHands), web research (Cline)

---

## Key files referenced

- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/tools/builtIn.ts — Tool name enum
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/tools/definitions/ — Tool definitions
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/edit/searchAndReplace/performReplace.ts — Edit implementation
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/edit/lazy/streamLazyApply.ts — LLM lazy apply
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/diff/streamDiff.ts — Streaming Myers diff
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/indexing/LanceDbIndex.ts — Vector index
- /Users/edwingomezcuellar/.claude/oss-repos/continue/core/context/mcp/MCPConnection.ts — MCP client
- /Users/edwingomezcuellar/.claude/oss-repos/OpenHands/openhands/agenthub/codeact_agent/tools/ — Tool definitions
- /Users/edwingomezcuellar/.claude/oss-repos/OpenHands/openhands/events/action/ — Action classes
- /Users/edwingomezcuellar/.claude/oss-repos/OpenHands/openhands/events/observation/ — Observation classes
- /Users/edwingomezcuellar/.claude/oss-repos/OpenHands/openhands/runtime/action_execution_server.py — Sandbox execution
- /Users/edwingomezcuellar/.claude/oss-repos/OpenHands/openhands/mcp/client.py — MCP client
- https://docs.cline.bot/exploring-clines-tools/cline-tools-guide — Cline tools reference
- https://cline.bot/blog/improving-diff-edits-by-10 — Cline diff improvements

---

## Findings

### Finding: Continue exposes 19 built-in tools via OpenAI function-calling format
**Confidence:** CONFIRMED
**Evidence:** continue/core/tools/builtIn.ts, continue/core/tools/definitions/

File I/O: read_file(filepath), read_file_range(filepath, startLine, endLine), read_currently_open_file(), create_new_file(filepath, contents).
File Edit: edit_existing_file(filepath, changes), single_find_and_replace(filepath, old_string, new_string, replace_all?), multi_edit(filepath, edits[]).
Search: grep_search(query), file_glob_search(pattern), codebase(query — semantic search).
Shell: run_terminal_command(command, waitForCompletion?).
Web: search_web(query), fetch_url_content(url).
Navigation: ls(dirPath?, recursive?), view_repo_map(), view_subdirectory(directory_path), view_diff().
Config: create_rule_block(...), request_rule(name), read_skill(skillName).

### Finding: Continue has three distinct edit strategies
**Confidence:** CONFIRMED
**Evidence:** Source code analysis of edit implementations

1. edit_existing_file — LLM-based streaming diff: agent sends draft with "// ... existing code ..." placeholders → secondary LLM expands → streaming Myers diff applied
2. single_find_and_replace — exact string match, old_string must be unique (like Claude Code's Edit)
3. multi_edit — batched find-and-replace, sequential application, atomic

### Finding: Continue indexes codebases via LanceDB vectors + tree-sitter + full-text search
**Confidence:** CONFIRMED
**Evidence:** continue/core/indexing/

Three systems: LanceDB vector index (embeddings, semantic search for `codebase` tool), tree-sitter code snippets (AST nodes for structure), full-text search (for grep_search).

### Finding: OpenHands exposes 10 tools via OpenAI function-calling format (LiteLLM)
**Confidence:** CONFIRMED
**Evidence:** OpenHands/openhands/agenthub/codeact_agent/tools/

Core tools: execute_bash(command, security_risk, is_input?, timeout?), execute_ipython_cell(code, security_risk), str_replace_editor(command, path, security_risk, ...), edit_file(path, content, security_risk, start?, end?), browser(code, security_risk), think(thought), finish(message), request_condensation(), task_tracker(command, task_list?), plus dynamic MCP tools.

All tools include `security_risk` parameter (enum: low/medium/high/unknown).

### Finding: OpenHands str_replace_editor supports 5 commands via openhands-aci
**Confidence:** CONFIRMED
**Evidence:** OpenHands/openhands/runtime/action_execution_server.py

Commands: view (read file/directory), create (new file with file_text), str_replace (exact old_str→new_str, must be unique), insert (new_str after insert_line), undo_edit (revert last edit).

Runs inside Docker sandbox. External `openhands_aci` package provides the OHEditor.

### Finding: OpenHands has a deprecated LLM-based draft editing system
**Confidence:** CONFIRMED
**Evidence:** OpenHands/openhands/runtime/utils/edit.py

edit_file tool sends draft with "# ... existing code ..." placeholders, secondary LLM expands via <update_snippet>/<updated_code> tags. Supports auto-linting and lint-error correction loops. Marked deprecated in favor of str_replace_editor.

### Finding: OpenHands runs in Docker containers with HTTP-based action execution
**Confidence:** CONFIRMED
**Evidence:** OpenHands/openhands/runtime/

Architecture: Host sends actions via HTTP to FastAPI server inside Docker container. Workspace mounted at /workspace. Runtime implementations: DockerRuntime, KubernetesRuntime, RemoteRuntime, LocalRuntime, CLIRuntime.

### Finding: Cline uses XML tags (not JSON function-calling) with 12 primary tools
**Confidence:** CONFIRMED
**Evidence:** docs.cline.bot/exploring-clines-tools/cline-tools-guide, leaked system prompt

Tools (XML tag format):
- read_file(path) — full file read
- write_to_file(path, content) — complete file overwrite
- replace_in_file(path, diff) — SEARCH/REPLACE blocks (Aider-inspired)
- search_files(path, regex, file_pattern?) — regex search
- list_files(path, recursive?) — directory listing
- list_code_definition_names(path) — tree-sitter code structure
- execute_command(command, requires_approval?) — shell
- browser_action(action, url?, coordinate?, text?) — Puppeteer browser control
- use_mcp_tool(server_name, tool_name, arguments) — MCP tool call
- access_mcp_resource(server_name, uri) — MCP resource read
- ask_followup_question(question, options?) — user interaction
- attempt_completion(result, command?) — task completion

### Finding: Cline uses SEARCH/REPLACE blocks (Aider-inspired) with fuzzy matching
**Confidence:** CONFIRMED
**Evidence:** cline.bot/blog/improving-diff-edits-by-10, deepwiki analysis

replace_in_file uses <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks. Supports multiple blocks per call. Order-invariant multi-diff apply algorithm. Fuzzy matching for whitespace differences. Different format variants for different models (Anthropic vs Gemini).

### Finding: All three agents support MCP with different integration patterns
**Confidence:** CONFIRMED
**Evidence:** Source code analysis

Continue: MCP tools converted to function-calling Tool objects, prefixed with server name. Supports tools, resources, prompts.
OpenHands: MCP tools converted to ChatCompletionToolParam, become MCPAction objects. Tools only.
Cline: Dedicated XML tools (use_mcp_tool, access_mcp_resource). Early MCP adopter.

---

## Cross-system comparison

| Feature | Continue | OpenHands | Cline |
|---------|----------|-----------|-------|
| Tool format | OpenAI function-calling JSON | OpenAI function-calling JSON (LiteLLM) | XML tags in response |
| Edit: full write | create_new_file (new only) | FileWriteAction | write_to_file (always full) |
| Edit: str_replace | single_find_and_replace, multi_edit | str_replace_editor (OH_ACI) | replace_in_file (SEARCH/REPLACE) |
| Edit: LLM-based | edit_existing_file (streaming diff) | edit_file (deprecated) | N/A |
| Line insert | N/A | str_replace_editor insert | N/A |
| Undo | N/A | str_replace_editor undo_edit | N/A |
| Sandbox | None (VS Code process) | Docker container | None (VS Code process) |
| Browser | N/A | BrowserGym actions | Puppeteer |
| MCP transports | stdio, SSE, HTTP, WebSocket | stdio, SSE, HTTP | stdio, SSE |

---

## Implications for virtual filesystem adapter

1. Three tool communication formats exist: JSON function-calling (Continue, OpenHands), XML tags (Cline), and text parsing (Aider). A virtual FS adapter needs to support the JSON schema approach at minimum.
2. The str_replace pattern (exact match, must be unique) is nearly universal — Claude Code, OpenCode, Continue, OpenHands, Devin all use variants.
3. Cline's SEARCH/REPLACE blocks are text-based (like Aider) rather than structured JSON — the virtual FS needs to handle this format too.
4. OpenHands' Docker sandbox means the virtual FS would need to be mounted or proxied into the container.
5. Continue's LLM-based draft editing (// ... existing code ... → expand) shows another pattern the virtual FS might encounter.

---

## Gaps / follow-ups

* Continue's edit_existing_file — which secondary LLM is used for draft expansion?
* OpenHands' openhands_aci package — exact str_replace matching behavior (fuzzy or strict?)
* Cline's fuzzy matching specifics — how much whitespace deviation is tolerated?
* How Continue's codebase search compares in quality to Cursor's Turbopuffer approach
