# Evidence: OpenCode and Aider Tool Surfaces

**Dimension:** 6b (Aider), 6f (OpenCode)
**Date:** 2026-03-20
**Sources:** Source code analysis of opencode (sst/opencode) and aider (aider-ai/aider)

---

## Key files referenced

- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/tool.ts` — Tool framework interface
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/registry.ts` — Complete tool registry
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/edit.ts` — Edit tool with 9-level fuzzy replacer chain
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/read.ts` — Read tool
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/write.ts` — Write tool
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/apply_patch.ts` — Codex-style patch tool (GPT models)
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/bash.ts` — Bash tool with tree-sitter parsing
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/tool/lsp.ts` — LSP integration
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/permission/next.ts` — Permission model
- `/Users/edwingomezcuellar/.claude/oss-repos/opencode/packages/opencode/src/mcp/index.ts` — MCP client
- `/Users/edwingomezcuellar/.claude/oss-repos/aider/aider/coders/__init__.py` — Edit format registry
- `/Users/edwingomezcuellar/.claude/oss-repos/aider/aider/coders/editblock_coder.py` — SEARCH/REPLACE parser
- `/Users/edwingomezcuellar/.claude/oss-repos/aider/aider/coders/search_replace.py` — Fuzzy matching engine
- `/Users/edwingomezcuellar/.claude/oss-repos/aider/aider/repomap.py` — Repo map (tree-sitter + PageRank)
- `/Users/edwingomezcuellar/.claude/oss-repos/aider/aider/repo.py` — Git integration

---

## Findings

### Finding: OpenCode exposes 20+ structured tools via Zod-validated function calls
**Confidence:** CONFIRMED
**Evidence:** opencode/packages/opencode/src/tool/registry.ts

OpenCode's tool framework uses `Tool.define(id, init)` with Zod schemas. Every tool returns `{title, metadata, output, attachments?}`. Output is auto-truncated at 2000 lines / 50KB.

Complete tool set: invalid, question, bash, read, glob, grep, edit, write, task, webfetch, todowrite, websearch, codesearch, skill, apply_patch, multiedit, lsp, batch, plan_enter, plan_exit, list.

Conditional availability: apply_patch replaces edit/write for GPT-o models; websearch/codesearch need Exa; lsp/batch/plan are experimental flags.

### Finding: OpenCode's Edit tool uses a 9-level fuzzy replacer fallback chain
**Confidence:** CONFIRMED
**Evidence:** opencode/packages/opencode/src/tool/edit.ts

Parameters: `{filePath: string, oldString: string, newString: string, replaceAll?: boolean}`

Replacer chain (tried in order):
1. SimpleReplacer — exact indexOf
2. LineTrimmedReplacer — .trim() per line
3. BlockAnchorReplacer — first/last line anchors + Levenshtein (threshold 0.0-0.3)
4. WhitespaceNormalizedReplacer — collapse all whitespace
5. IndentationFlexibleReplacer — normalize minimum indent
6. EscapeNormalizedReplacer — unescape \n, \t, \" etc.
7. TrimmedBoundaryReplacer — trim search string boundaries
8. ContextAwareReplacer — anchor lines + 50% middle match
9. MultiOccurrenceReplacer — all exact matches for replaceAll

Post-edit: runs LSP diagnostics, generates unified diff.

### Finding: OpenCode's Read tool supports partial reads with offset/limit
**Confidence:** CONFIRMED
**Evidence:** opencode/packages/opencode/src/tool/read.ts

Parameters: `{filePath: string, offset?: number (1-indexed), limit?: number (default 2000)}`
Returns lines in `N: content` format. Max line length 2000 chars. Max bytes 50KB.
Handles directories (sorted entry list), images/PDFs (base64 attachment), binary detection.

### Finding: OpenCode has full MCP client with stdio, SSE, and HTTP transports
**Confidence:** CONFIRMED
**Evidence:** opencode/packages/opencode/src/mcp/index.ts

Supports OAuth auth flow, dynamic tool discovery, tools surfaced alongside built-in tools via Vercel AI SDK's dynamicTool.

### Finding: Aider uses text-parsing (not tool calls) with 12 edit format variants
**Confidence:** CONFIRMED
**Evidence:** aider/aider/coders/__init__.py

Aider does NOT use structured tool/function calls. The LLM outputs specially-formatted text that is parsed. 12 edit formats: diff (SEARCH/REPLACE), diff-fenced, whole, udiff, udiff-simple, patch (V4A), architect, editor-diff, editor-whole, editor-diff-fenced, ask, help, context.

Primary format (SEARCH/REPLACE blocks):
```
path/to/file.py
<<<<<<< SEARCH
exact lines to find
=======
replacement lines
>>>>>>> REPLACE
```

### Finding: Aider's fuzzy matching uses 3 strategies with preprocessing combinations
**Confidence:** CONFIRMED
**Evidence:** aider/aider/coders/search_replace.py

Strategy chain for editblock format:
1. search_and_replace (exact str.replace)
2. git_cherry_pick_osr_onto_o (actual git cherry-pick with temp commits)
3. dmp_lines_apply (Google's diff-match-patch at line granularity)

Each tried with 4 preprocessing combos: {strip_blank_lines, relative_indent} x {True, False}.

RelativeIndenter converts absolute→relative indentation for indent-agnostic matching.

### Finding: Aider builds codebase context via tree-sitter + PageRank "repo map"
**Confidence:** CONFIRMED
**Evidence:** aider/aider/repomap.py

Process: tree-sitter extracts Tag(rel_fname, fname, line, name, kind="def"|"ref") → builds networkx graph → runs PageRank (chat files get higher personalization) → renders ranked map via TreeContext from grep_ast → fits within max_map_tokens (default 1024).

### Finding: Aider has no file reading tool — full files are included in chat context
**Confidence:** CONFIRMED
**Evidence:** aider/aider/coders/base_coder.py

Files read via `self.io.read_text(full_path)` — simple full-file reads. No partial read, offset, or line-range. Files added explicitly by user (/add) or via mention detection.

### Finding: Aider auto-commits every successful edit with LLM-generated messages
**Confidence:** CONFIRMED
**Evidence:** aider/aider/repo.py

After every edit: auto-commit with attribution (configurable author name, Co-authored-by trailer). Undo via /undo uses commit tracking. Uncommitted changes are preserved via "dirty commit" before AI edits.

---

## Key Architectural Differences

| Dimension | OpenCode | Aider |
|-----------|----------|-------|
| Tool invocation | LLM calls structured functions with JSON | LLM outputs formatted text, parsed |
| Edit mechanism | oldString/newString with 9 fuzzy replacers | Multiple format parsers; SEARCH/REPLACE primary |
| File reading | Partial reads (offset/limit, 2000 lines, 50KB) | Full file into chat context |
| Navigation | Dedicated glob, grep, list, codesearch tools | Repo map (tree-sitter + PageRank) in system prompt |
| Shell | Dedicated bash tool with permissions | Shell commands in response text, user confirms |
| LSP | Integrated into edit/write + standalone tool | Not integrated |
| MCP | Full client (stdio, SSE, HTTP, OAuth) | Not present |
| Git | Via bash tool | Deep: auto-commit, undo, attribution |

---

## Gaps / follow-ups

* OpenCode's `apply_patch` format for GPT models — need to verify if this is identical to Codex CLI's format
* Aider's `patch` (V4A) format — appears to be the same Codex format; need cross-reference
* OpenCode's plugin system for custom tools — how extensible is this for a virtual filesystem?
