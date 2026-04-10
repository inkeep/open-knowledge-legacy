# Evidence: Cursor and Windsurf Tool Surfaces

**Dimension:** 2 (Cursor), 6a (Windsurf)
**Date:** 2026-03-20
**Sources:** Leaked system prompts, official docs, blog posts, community analysis

---

## Key sources referenced

- https://gist.github.com/sshh12/25ad2e40529b269a88b80e7cf1c38084 — Cursor agent system prompt (March 2025)
- https://cursor.com/blog/instant-apply — Cursor fast-apply architecture
- https://fireworks.ai/blog/cursor — Speculative edits performance
- https://cursor.com/docs/agent/overview — Cursor agent docs
- https://cursor.com/docs/context/codebase-indexing — Cursor indexing
- https://cursor.com/blog/tab-update — Cursor Tab/Fusion model
- https://github.com/jujumilk3/leaked-system-prompts/blob/main/codeium-windsurf-cascade-R1_20250201.md — Windsurf system prompt
- https://docs.windsurf.com/windsurf/cascade/cascade — Windsurf Cascade docs
- https://docs.windsurf.com/windsurf/cascade/mcp — Windsurf MCP

---

## Findings

### Finding: Cursor agent exposes ~15 core tools with a two-stage edit architecture
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompt + official docs

Core tools:
- `codebase_search` — semantic search (query, target_directories?, explanation?)
- `grep_search` — regex search (query, include_pattern?, exclude_pattern?, case_sensitive?, explanation?) — max 50 results
- `file_search` — fuzzy path search (query, explanation?) — max 10 results
- `read_file` — read with line ranges (target_file, start_line_one_indexed?, end_line_one_indexed_inclusive?, should_read_entire_file?, explanation?) — max 250 lines
- `edit_file` — semantic diff (target_file, instructions, code_edit with "// ... existing code ..." markers)
- `search_replace` — find-and-replace (newer, v0.50+, ~2x faster than edit_file)
- `run_terminal_cmd` — shell (command, is_background?, require_user_approval?, explanation?)
- `list_dir` — directory listing (relative_workspace_path, explanation?)
- `delete_file` — delete (target_file, explanation?)
- `reapply` — re-attempt failed edit with smarter model (target_file)
- `web_search` — web search (search_term, explanation?)
- `fetch_rules` — load user rules (rule_names[])
- `diff_history` — recent file modifications (explanation?)
- Browser tools: navigate, click, type, scroll, screenshot, console_output, network_traffic

### Finding: Cursor uses a fine-tuned "fast-apply" model for diff application
**Confidence:** CONFIRMED
**Evidence:** cursor.com/blog/instant-apply, fireworks.ai/blog/cursor

Two-stage architecture:
1. Frontier model generates "semantic diff" — code with `// ... existing code ...` markers for unchanged regions
2. Fine-tuned apply model (Llama 3 70B) converts semantic diff into complete file

Performance: ~1000 tokens/s via speculative edits on Fireworks AI (~13x speedup). Base: DeepSeek Coder + Llama 3.

Chose full-file rewrite over diffs because LLMs see complete files more in pretraining, struggle with line numbers, and full rewrite outperforms diff formats for files <400 lines.

### Finding: Cursor indexes codebases via Merkle tree + Turbopuffer cloud vectors
**Confidence:** CONFIRMED
**Evidence:** cursor.com/blog/secure-codebase-indexing, read.engineerscodex.com

Process: AST chunking → Merkle tree hashing → incremental sync (every 10 min) → cloud embedding → Turbopuffer vector storage → nearest-neighbor search at query time. Only embeddings stored in cloud; source code stays local. File paths obfuscated with client-side encryption.

### Finding: Windsurf Cascade exposes 14 tools with separate write_file for new files
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompt (Feb 2025), gists

Core tools:
- `codebase_search` — semantic search (query, target_directories?)
- `grep_search` — text search (search_directory, query, match_per_line?, includes?, case_insensitive?)
- `find_by_name` — file/dir search (search_directory, pattern, excludes?, type?, max_depth?, extensions?, full_path?)
- `view_file` — read file (absolute_path, start_line?, end_line?, include_summary_of_other_lines?) — max ~200 lines
- `view_code_item` — AST-based code item view (file, node_path e.g. "ClassName.method_name")
- `edit_file` — edit (target_file, instruction, code_edit, code_markdown_language?, blocking?)
- `write_file` — create new file (target_file, code_content, empty_file?)
- `run_command` — shell (command_line, current_working_directory?, blocking?, wait_ms_before_async?, safe_to_auto_run?)
- `command_status` — async command status (command_id, output_priority?, output_character_count?)
- `list_directory` — dir listing (directory_path)
- `read_url_content` — fetch URL (url)
- `search_web` — web search (query, domain?)
- `view_web_document_content_chunk` — chunk web content (url, position)
- `create_memory` — persist context (id, title, content, corpus_names?, tags?, action)

Constraints: 20 tool calls per prompt, max one code edit per turn.

### Finding: Windsurf stores embeddings locally (768-dim), unlike Cursor's cloud storage
**Confidence:** CONFIRMED
**Evidence:** windsurf.com/security, docs.windsurf.com

Local indexing: AST parsing → semantic chunking (function/class boundaries) → 768-dim embeddings → local vector store. Remote indexing available for Teams/Enterprise.

### Finding: Cursor Tab uses custom sparse MoE "Fusion" model, separate from agent
**Confidence:** CONFIRMED
**Evidence:** cursor.com/blog/tab-update, cursor.com/blog/tab-rl

Completely separate system: custom sparse language model, 13K token context, ~260ms p50 latency, 400M+ requests/day. Can modify existing code around cursor (not just insert). Trained via online RL (21% fewer suggestions, 28% higher accept rate).

### Finding: Both Cursor and Windsurf use "semantic diff" with natural language instructions for edits
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompts for both

Both use edit_file with `instruction` (NL description) + `code_edit` (code content). Cursor uses `// ... existing code ...` markers explicitly. Windsurf's format is similar. Key difference: Cursor shows preview before writing; Windsurf writes immediately.

---

## Comparative summary

| Feature | Cursor | Windsurf |
|---------|--------|----------|
| Agent tools | ~15 + browser + MCP | 14 + MCP |
| Read file max | 250 lines | ~200 lines |
| Edit format | Semantic diff + apply model | instruction + code_edit |
| Apply model | Llama 70B fine-tuned, ~1000 tok/s | Not documented |
| File creation | edit_file (creates if needed) | write_file (separate tool) |
| AST code view | No | view_code_item |
| Memory tool | No | create_memory |
| Index storage | Cloud (Turbopuffer) | Local |
| MCP tool limit | 40 | 100 |
| Rules format | .cursor/rules/*.mdc | .windsurf/rules/*.md |
| Tools/turn limit | Not documented | 20 |

---

## Implications for virtual filesystem adapter

1. Both use semantic search over embeddings — a virtual FS would need to support indexing or provide pre-computed context
2. Line-range reads (250/200 lines max) are standard — the adapter must support partial reads
3. Cursor's edit model is fundamentally different from Claude Code's exact-match — it generates natural language instructions + code, not oldString/newString
4. Windsurf's view_code_item (AST navigation) is unique — a virtual FS could optionally support AST-aware queries
5. Both support MCP — a virtual FS MCP server would integrate with both

---

## Gaps / follow-ups

* Cursor's search_replace tool (v0.50+) — exact parameter schema not fully documented
* Windsurf's internal apply model — undisclosed architecture
* How Cursor handles edit failures (the reapply mechanism details)
* Cursor cloud agents — exact tool surface differences from local agent
