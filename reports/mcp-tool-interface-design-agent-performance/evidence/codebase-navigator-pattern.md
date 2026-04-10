# Evidence: Agent as Codebase Navigator — File Tools + Semantic Tools

**Dimension:** D4 — The "agent as codebase navigator" pattern
**Date:** 2026-04-02
**Sources:** Claude Code, Cursor, OpenCode, SWE-agent, LSP research, GitHub issues

---

## Key files / pages referenced

- https://cursor.com/blog/semsearch — Cursor: semantic search A/B test
- https://github.com/SWE-agent/mini-swe-agent — Mini-SWE-agent bash-only
- https://amirteymoori.com/lsp-language-server-protocol-ai-coding-tools/ — LSP as secret weapon for AI tools
- https://github.com/anthropics/claude-code/issues/5495 — Claude Code LSP request (100-1000x perf)
- https://github.com/anthropics/claude-code/issues/24249 — Claude Code: expose host IDE LSP capabilities
- https://karanbansal.in/blog/claude-code-lsp/ — Claude Code LSP upgrade guide
- Prior report: /Users/edwingomezcuellar/reports/ai-coding-agent-tool-surfaces/REPORT.md

---

## Findings

### Finding: The minimum viable codebase tool surface has converged to 5 operations
**Confidence:** CONFIRMED
**Evidence:** Prior report (ai-coding-agent-tool-surfaces), analysis of 11 agents

From the existing report analyzing 11 AI coding agents: "The minimum viable tool surface is 5 operations: read file (with line ranges), write file (full replacement), edit file (string replacement), search content (regex), and search paths (glob)."

Every agent implements variants of these five. 8 of 11 use exact-string-match replacement for edits. 10 of 11 support MCP.

**Implications:** File tools are the universal primitive. Any virtual filesystem must implement these 5 operations.

---

### Finding: LSP provides 900x speed improvement over grep for semantic code navigation
**Confidence:** INFERRED
**Evidence:** Amir Teymoori blog, Claude Code GitHub issues

"Finding all call sites of a function takes approximately 50ms with LSP compared to 45 seconds with traditional text search. LSP is 900x faster than grep for semantic code understanding."

Token savings: "In a 100-file project, grep-based reference finding might consume 2000+ tokens scanning output. LSP returns exact matches in around 500 tokens."

LSP understands scope, types, and relationships — distinguishes between process the function, process the variable, and "process" in a comment.

**Note:** The 900x claim appears in practitioner blog posts, not peer-reviewed benchmarks. The directional claim is strong but the specific multiplier should be treated as illustrative.

**Implications:** Semantic tools (go_to_definition, find_references) are dramatically more efficient than grep for code navigation. The analogy to knowledge retrieval: domain-specific search tools can be more efficient than text grep.

---

### Finding: Claude Code uses grep/glob/read without LSP — and there's demand for LSP integration
**Confidence:** CONFIRMED
**Evidence:** Claude Code GitHub issues #5495 (1000+ upvotes), #24249

Claude Code issue #5495 titled "Enable VSCode LSP APIs: 100-1000x Performance Improvement for Code Navigation" has significant community demand. Claude Code currently relies on grep/glob/read without LSP semantic tools.

The community feedback suggests that for large codebases, the grep-only approach hits performance walls — too many tokens, too many tool calls, missed context.

**Implications:** Even the most successful coding agent (Claude Code) faces limitations with file-tools-only approach at scale. The path forward is file tools PLUS semantic tools.

---

### Finding: Cursor combines grep + semantic search for best outcomes
**Confidence:** CONFIRMED
**Evidence:** Cursor blog (semsearch)

"Cursor's agent makes heavy use of grep as well as semantic search, and the combination of these two leads to the best outcomes."

Offline benchmark: 12.5% higher accuracy with semantic search.
Online A/B: +2.6% code retention on 1,000+ file codebases.

**Implications:** The answer is not "filesystem OR semantic" — it's both. File tools are the foundation; semantic tools are the enhancement layer.

---

## Gaps / follow-ups

* No published benchmark comparing "agent with grep only" vs "agent with grep + LSP tools" on the same task set.
* The LSP integration for Claude Code is still community-requested, not officially shipped — so the performance claims are projected, not measured.
* How the LSP comparison maps to knowledge retrieval (where the "semantic" tools are search, not go_to_definition) is an analogy, not a direct finding.
