---
title: "Claude Code: Agentic Search Architecture"
type: evidence
dimension: D2
source_type: primary
confidence: high
date_collected: 2026-04-03
sources:
  - url: https://vadim.blog/claude-code-no-indexing
    title: "Claude Code Doesn't Index Your Codebase. Here's What It Does Instead."
    type: blog
  - url: https://code.claude.com/docs/en/overview
    title: "Claude Code overview - Claude Code Docs"
    type: official_docs
  - url: https://code.claude.com/docs/en/sub-agents
    title: "Create custom subagents - Claude Code Docs"
    type: official_docs
  - url: https://github.com/Piebald-AI/claude-code-system-prompts
    title: "Claude Code system prompts (all versions)"
    type: github_repo
  - url: https://www.humanlayer.dev/blog/writing-a-good-claude-md
    title: "Writing a good CLAUDE.md"
    type: blog
  - url: https://x.com/bcherny/status/2017824286489383315
    title: "Boris Cherny on X: RAG vs agentic search"
    type: social_media
  - url: https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny
    title: "Pragmatic Engineer: Building Claude Code with Boris Cherny"
    type: newsletter
  - url: https://grantslatton.com/claude-code
    title: "Grant Slatton: Claude Code analysis"
    type: blog
  - url: https://www.anthropic.com/research/swe-bench-sonnet
    title: "Claude SWE-Bench Performance"
    type: official_research
  - url: https://github.com/anthropics/claude-code/issues/4556
    title: "Feature request: Add codebase indexing"
    type: github_issue
---

# Claude Code: Agentic Search Architecture

## Core Design: No Pre-Indexing

Claude Code uses **zero pre-indexing**. No embeddings, no vector database, no build step. Boris Cherny, Claude Code's creator (principal software engineer at Anthropic), stated:

> "Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better. It is also simpler and doesn't have the same issues around security, privacy, staleness, and reliability."

A Claude engineer confirmed this was "surprising" — they expected semantic embeddings to outperform grep-based retrieval.

## Three-Tool Hierarchy

Claude Code's retrieval operates through a strict cost hierarchy:

1. **Glob** (cheapest): File system pattern matching via fast indexing. Returns only file paths sorted by modification time. Example: `workers/**/*.toml`. Narrows search space before expensive operations.

2. **Grep** (medium): Content search via ripgrep with parallel processing. Returns matching lines with context. Claude Code chains multiple grep calls progressively — e.g., searching for `createD1HttpClient`, then refining to `D1HttpClient` in `src/db/`, then targeting specific imports.

3. **Read** (most expensive): Loads complete files into context at 500-1,500 tokens per file. Reserved for files already identified as relevant through prior searches.

System prompt explicitly instructs: "Do NOT use the Bash to run find, grep, cat, head, tail — use dedicated tools instead."

## Agentic Search Loop

Operates on a **think-act-observe-repeat (ReAct) cycle**:
- Model decides what to find based on the task
- Selects appropriate tool (glob → grep → read)
- Analyzes results
- Iterates with refined queries until task completion

Key behavior: Claude Code compensates for lack of semantic search by running **multiple searches in parallel** — e.g., searching "auth", "session", "token", "middleware", "jwt", "bearer" to triangulate toward a module. This multi-step reasoning is something static embedding retrieval cannot do (a vector DB returns top-k hits and stops).

## Sub-Agent Architecture

For deeper exploration, Claude Code spawns **Explore sub-agents**:

- **Model**: Runs on Haiku (cheaper/faster)
- **Tools**: Glob, Grep, Read, LS, NotebookRead, WebFetch, WebSearch — NO Edit/Write (read-only)
- **Isolation**: Separate context window from main conversation
- **Thoroughness levels**: quick, medium, very thorough
- **Output**: Returns summaries, not raw contents — preserves insights while discarding tokens

Up to **7 sub-agents** can run simultaneously via the Task tool.

## CLAUDE.md as Retrieval Mechanism

CLAUDE.md is delivered as a **user message** (in `<system-reminder>` tags), not system prompt. Five-level hierarchy:

1. **Managed Policy** (Enterprise): `/Library/Application Support/ClaudeCode/CLAUDE.md` — cannot be overridden
2. **Project**: `./CLAUDE.md` or `./.claude/CLAUDE.md` — shared via version control
3. **Local**: `./CLAUDE.local.md` — gitignored, personal preferences
4. **User**: `~/.claude/CLAUDE.md` — personal across all projects
5. **Auto Memory**: `~/.claude/projects/<project>/memory/MEMORY.md` — agent-generated

All discovered files are **concatenated** (not overriding). Subdirectory CLAUDE.md files load **on demand** when Claude reads files in those directories. Best practice: <200 lines per file.

**Key behaviors**:
- **Survives compaction**: When context window fills and auto-compaction occurs, CLAUDE.md is **re-read from disk** and re-injected fresh
- **Import syntax**: `@path/to/import` pulls in external files (README, package.json) at launch; max 5-hop depth
- **Path-scoped rules**: `.claude/rules/*.md` files with YAML frontmatter (`paths: ["src/api/**/*.ts"]`) load only when Claude reads matching files

In monorepos, CLAUDE.md tells Claude "what the apps are, what the shared packages are, and what everything is for so that it knows where to look."

Source: [Boris Cherny on X](https://x.com/bcherny/status/2017824286489383315), [Claude Code Docs - Memory](https://code.claude.com/docs/en/memory)

## Token Economics

Architecture viable through Anthropic's **prefix caching**:
- 92% of requests reuse same system prompt + tool definitions
- Cache read tokens: 0.1x base price (vs 1.25x for writes)
- Creates ~81% cost reduction on typical sessions

## SWE-Bench Performance

Claude 3.7 Sonnet achieves **70.3%** on SWE-bench Verified (n=489 verified tasks on Anthropic infrastructure). Key finding: "embedding-based retrieval tools were explored but found not to be the bottleneck for SWE-bench tasks — grep and find were sufficient."

## Known Limitations

1. **Token burn with common terms**: Searching `useState` in a React codebase generates hundreds of matches requiring refinement loops
2. **Semantic misses**: Grep cannot understand that `authenticate_user` and `verify_credentials` are related — requires multiple triangulation searches
3. **No cross-reference graph**: Without indexing, no call graph, dependency tree, or type hierarchy. "What calls this function?" requires searching every file
4. **Speed**: Community reports indicate Claude Code takes **2-2.5x longer** than Cursor/Copilot on equivalent tasks in large repos due to iterative search overhead
5. **Context rot**: CLAUDE.md adherence degrades over long sessions. Grant Slatton documented "remarkably poor adherence to the rules over the course of a long session"
6. **SWE-bench minimal scaffolding**: Original Claude 3.5 Sonnet agent used only Bash + Edit tools (no Glob/Grep) and still achieved 49%, suggesting model reasoning matters more than retrieval sophistication

## Why Agentic Search Won Over RAG

Four key advantages:
1. **Precision**: Grep finds exact symbols without fuzzy false positives
2. **Simplicity**: No index to build or maintain
3. **Freshness**: Searches read current filesystem state during active editing
4. **Privacy**: No data leaves the machine for embedding computation

Amazon Science paper (arXiv 2602.23368) validated: keyword search via agentic tool use achieves **over 90% of RAG-level performance** without vector databases.
