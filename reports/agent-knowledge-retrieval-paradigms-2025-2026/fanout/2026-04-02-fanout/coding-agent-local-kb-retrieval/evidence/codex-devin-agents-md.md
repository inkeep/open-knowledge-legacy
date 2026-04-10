---
title: "OpenAI Codex CLI, Devin, and AGENTS.md Convention"
type: evidence
dimension: D2
source_type: primary
confidence: medium
date_collected: 2026-04-03
sources:
  - url: https://github.com/openai/codex
    title: "OpenAI Codex CLI GitHub repo"
    type: github_repo
  - url: https://developers.openai.com/codex/guides/agents-md
    title: "Custom instructions with AGENTS.md"
    type: official_docs
  - url: https://developers.openai.com/codex/cli/features
    title: "Features - Codex CLI"
    type: official_docs
  - url: https://github.com/agentsmd/agents.md
    title: "AGENTS.md open format specification"
    type: github_repo
  - url: https://agents.md/
    title: "AGENTS.md - official site"
    type: official_docs
  - url: https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/
    title: "How to write a great agents.md - GitHub Blog"
    type: blog
  - url: https://www.infoq.com/news/2025/08/agents-md/
    title: "AGENTS.md Emerges as Open Standard for AI Coding Agents"
    type: news
---

# OpenAI Codex CLI, Devin, and AGENTS.md Convention

## OpenAI Codex CLI Retrieval

### What's Known

Codex CLI documentation reveals limited technical details about retrieval mechanisms. The features guide states: "Codex launches into a full-screen terminal UI that can read your repository, make edits, and run commands as you iterate together."

### Documented Capabilities

- Review diffs and code syntax-highlighted in terminal UI
- Execute shell commands and examine results
- Access file paths via fuzzy search (using `@` in the composer)
- Read images and design specifications
- Full-screen interactive terminal mode

### What's NOT Documented

The documentation does not specify:
- Whether it uses grep, find, or similar tools for code search
- Whether embeddings or semantic analysis are used
- How it builds understanding of project structure
- Specific retrieval pipeline architecture

**Inference**: Given the CLI-based design and lack of indexing documentation, Codex likely uses shell-based retrieval similar to Claude Code, leveraging its foundation model's ability to construct appropriate search commands.

## AGENTS.md Convention

### Overview

AGENTS.md is "a README for agents" — a dedicated, predictable file for providing context and instructions to AI coding agents. Adopted by **20,000+ repositories** on GitHub as of 2025.

### Hierarchical Discovery (Codex Implementation)

Codex implements a strict instruction chain at startup:

1. **Global scope**: `~/.codex/AGENTS.override.md` → fallback to `~/.codex/AGENTS.md` (only first non-empty file loaded)
2. **Project scope**: Traverses from Git root downward to CWD, checking each level for:
   - `AGENTS.override.md`
   - `AGENTS.md`
   - Names in `project_doc_fallback_filenames`
   - At most one file per directory
3. **Merge order**: Concatenated root-to-CWD with blank line separators. Closer files override earlier guidance (appearing later in combined prompt).

### Key Constraints

- Empty files skipped
- Combined size: max `project_doc_max_bytes` (32 KiB default)
- Discovery halts at size limit
- Configurable fallback filenames via `~/.codex/config.toml`:
  ```toml
  project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
  project_doc_max_bytes = 65536
  ```

### Content Best Practices (GitHub Blog analysis of 2,500+ repos)

Core areas: commands, testing, project structure, code style, git workflow, boundaries.
- Should aim for ≤150 lines
- "Never commit secrets" is most common useful constraint
- Each package can have its own AGENTS.md; nearest file takes precedence

### AGENTS.md vs CLAUDE.md

| Aspect | AGENTS.md | CLAUDE.md |
|--------|-----------|-----------|
| Origin | OpenAI/community standard | Anthropic (Claude Code) |
| Adoption | 20,000+ repos | Claude Code ecosystem |
| Scope | Multi-agent (Codex, Copilot, etc.) | Claude Code specific |
| Discovery | Hierarchical traversal with overrides | CWD + parent dirs |
| Max size | 32 KiB default (configurable) | No official limit (<300 lines recommended) |
| Format | Plain markdown | Plain markdown |

## Devin (Cognition) — Three-Layer Retrieval Architecture

Devin uses the most sophisticated retrieval architecture of any coding agent, combining three distinct layers:

### Layer 1: DeepWiki (Pre-computed Repository Understanding)
- Auto-analyzes GitHub repos, generates structured wiki with architecture diagrams, dependency maps, source links
- Handles extreme scale: 5M lines of COBOL, 500GB repos, 400,000+ repos for one bank customer
- 30,000+ public repos indexed
- Access: replace `github.com` with `deepwiki.com` in any repo URL

### Layer 2: Knowledge Base (Trigger-Based Retrieval)
- Knowledge objects are instruction/advice collections referenced during sessions
- **Trigger-based, not embedding-based**: *"Knowledge is retrieved based on the Trigger you set. The more specific the trigger, the better the retrieval."*
- Auto-ingests `.rules`, `.mdc`, `.cursorrules`, `.windsurf`, `CLAUDE.md`, `AGENTS.md`
- Auto-generates knowledge from READMEs, file structure, repo contents
- Knowledge can be **pinned** (always active) or **unpinned** (trigger-activated)

### Layer 3: SWE-grep (RL-Trained Agentic Search)
Purpose-built models for fast parallel codebase search. Key details:

- **RL training**: Reward = weighted F1 with F-beta (beta=0.5, precision-weighted). Rationale: *"context pollution matters — irrelevant information degrades main agent performance more than missing context."*
- **Parallelism**: Up to **8 parallel tool calls per turn** across max **4 turns** (3 exploration + 1 answer)
- **Speed**: SWE-grep-mini: >2,800 tok/s. SWE-grep: >650 tok/s. (vs Claude Haiku 4.5 at 140 tok/s = 20x faster)
- **Tools**: Restricted to `grep`, `read`, `glob` (no shell access)
- **Output**: Returns file list with line ranges to main coding agent
- **Context retrieval drops from 20+ seconds to under 1 second** on 100K+ line codebases

Cognition **explicitly rejected embedding-based RAG**: *"Embedding search (RAG) suffers from inaccuracy on complex multi-hop queries and context poisoning."*

Sources: [cognition.ai/blog/swe-grep](https://cognition.ai/blog/swe-grep), [cognition.ai/blog/devin-2](https://cognition.ai/blog/devin-2), [docs.devin.ai/onboard-devin/knowledge-onboarding](https://docs.devin.ai/onboard-devin/knowledge-onboarding)

## Aider: The Graph-Based Alternative

Aider implements a distinct **repository map** approach using tree-sitter:

- **AST parsing**: Extracts symbol definitions/references across 40+ languages
- **Graph ranking**: NetworkX graph analysis with PageRank — each source file is a node, edges connect files with dependencies
- **Token-optimized**: Binary search to fit symbols within configurable token budgets (default: 1k tokens via `--map-tokens`)
- **Efficiency**: 4.3-6.5% context utilization while preserving architectural context
- **130+ languages** supported through tree-sitter parsers

This approach derives relevance from **structural relationships** (function calls, imports, inheritance) rather than semantic similarity — a fundamentally different philosophy from both grep-based and embedding-based retrieval.
