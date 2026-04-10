# Evidence: How Coding Agents Navigate Codebases

**Dimension:** D1 — How coding agents navigate codebases
**Date:** 2026-04-02
**Sources:** Anthropic docs, OpenAI docs, Cursor docs, Aider docs, Augment Code blog, Windsurf docs, Devin docs, academic papers

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — Anthropic's context engineering guide
- https://developers.openai.com/codex/guides/agents-md — OpenAI Codex AGENTS.md documentation
- https://openai.com/index/harness-engineering/ — OpenAI Harness Engineering blog post
- https://docs.cursor.com/context/codebase-indexing — Cursor codebase indexing docs
- https://aider.chat/docs/repomap.html — Aider repo-map documentation
- https://aider.chat/2023/10/22/repomap.html — Aider repo-map technical deep dive
- https://docs.windsurf.com/context-awareness/overview — Windsurf context awareness docs
- https://docs.devin.ai/onboard-devin/repo-setup — Devin repo setup docs
- https://www.augmentcode.com/context-engine — Augment Code Context Engine
- https://arxiv.org/abs/2505.21577 — RepoMaster: Autonomous Exploration and Understanding (NeurIPS 2025)
- https://arxiv.org/abs/2512.20957 — RepoNavigator: One Tool Is Enough
- https://arxiv.org/abs/2603.20432 — Coding Agents are Effective Long-Context Processors
- https://github.com/giancarloerra/socraticode — SocratiCode benchmarks

---

## Findings

### Finding: Claude Code uses real-time exploration with no pre-built index
**Confidence:** CONFIRMED
**Evidence:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Claude Code uses CLAUDE.md files as upfront context, then "glob and grep" primitives for just-in-time navigation. The system "bypasses issues of stale indexing and complex syntax trees." Claude Code navigates "the same way a senior developer would — starting from entry points, following the dependency graph, building a working model of how components interact." The Explore agent is a read-only specialist that uses Glob, Grep, Read, and limited Bash commands for codebase search.

**Implications:** Claude Code's approach represents the "agentic exploration" end of the spectrum — no index, real-time tool use. Works well for codebases where the agent has sufficient tools and context window.

### Finding: Cursor uses cloud-based vector search with AST-aware chunking
**Confidence:** CONFIRMED
**Evidence:** https://docs.cursor.com/context/codebase-indexing, https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast

Cursor indexes the codebase by computing embeddings for each file. Files are split into syntactic chunks via AST traversal using tree-sitter. A Merkle tree of file hashes is synchronized with Cursor's server for efficient change detection. Embeddings stored in Turbopuffer vector DB. Custom embedding model trained on developer sessions. Source code is NOT stored on Cursor servers — only embeddings and encrypted metadata.

**Implications:** Cursor represents the "pre-built index" end of the spectrum. Heavy upfront investment in indexing, but enables semantic search across large codebases.

### Finding: OpenAI Codex uses AGENTS.md as a "table of contents" pointing to structured docs/
**Confidence:** CONFIRMED
**Evidence:** https://openai.com/index/harness-engineering/, https://developers.openai.com/codex/guides/agents-md

Codex reads AGENTS.md before doing any work, following a discovery hierarchy (home dir → project root → CWD). The Harness Engineering team's key insight: "give Codex a map, not a 1,000-page instruction manual." AGENTS.md serves as "a table of contents pointing to a structured docs/ directory — not an encyclopedia file." The repository must be the single source of truth: "from the agent's point of view, anything it cannot access in-context effectively does not exist." With 3 engineers, they produced ~1M lines of code and 1,500 merged PRs.

**Implications:** This is the most explicit "index-first" pattern in production: a lightweight index file that points to deeper documents, with the agent choosing what to load.

### Finding: Aider uses tree-sitter + PageRank for a concise repository map
**Confidence:** CONFIRMED
**Evidence:** https://aider.chat/docs/repomap.html, https://aider.chat/2023/10/22/repomap.html

Aider creates a concise map of the git repository showing file names, key symbols (classes, functions), and their signatures. Uses tree-sitter to parse source code into ASTs, extracting definitions and references. Builds a dependency graph where files are nodes and dependencies are edges. Applies PageRank to rank files/symbols by importance. The --map-tokens parameter controls map size (default 1K tokens). Map is dynamically adjusted based on chat state. Supports 130+ languages.

**Implications:** Aider's repo-map is the most explicit "enriched catalog" implementation — a compressed representation of the entire codebase that fits in a small token budget, enabling the LLM to request specific files.

### Finding: Augment Code builds a real-time knowledge graph with semantic indexing
**Confidence:** CONFIRMED
**Evidence:** https://www.augmentcode.com/context-engine, https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable

The Context Engine "semantically indexes and maps your code, understanding relationships between hundreds of thousands of files." It builds a graph of dependencies, analyzes commit history, and uses embeddings for semantic relationships. Indexes in real-time as you edit. Also indexes commit history, external sources (docs, tickets), and "tribal knowledge." Made search 40% faster for 100M+ line codebases using quantized vector search.

**Implications:** Augment represents the most ambitious indexing approach — a full knowledge graph that goes beyond code to include context, history, and external knowledge.

### Finding: Windsurf uses RAG + "Codemaps" for structured code navigation
**Confidence:** CONFIRMED
**Evidence:** https://docs.windsurf.com/context-awareness/overview, https://cognition.ai/blog/codemaps

Windsurf's Cascade agent reads the entire codebase, understands file relationships, and coordinates multi-file edits. The "Fast Context" technology indexes the full codebase and learns project patterns over ~48 hours. "Codemaps" are "AI-annotated structured maps of your code" that provide "hyper-contextualized codebase understanding grounded in precise code navigation."

**Implications:** Codemaps represent an evolution beyond simple indexing — AI-generated navigational artifacts that explain code structure.

### Finding: Devin uses DeepWiki for AI-generated documentation and navigation
**Confidence:** CONFIRMED
**Evidence:** https://docs.devin.ai/onboard-devin/repo-setup, DeepWiki documentation

Devin analyzes project structure, source code, configuration files, and existing documentation when entering a repository. DeepWiki "combines large language models with graph-style analysis of a repository's structure to extract key concepts, relationships, and workflows." Produces interactive file explorers with module-level explanations and auto-generated architectural diagrams. Maintains a personalized "knowledge base" of project-specific facts.

**Implications:** Devin's approach goes furthest toward "AI-generated metadata/catalogs" — the system creates its own navigational documentation rather than relying on human-authored indexes.

### Finding: SocratiCode benchmark shows hybrid search uses 61% fewer tokens than grep
**Confidence:** CONFIRMED
**Evidence:** https://github.com/giancarloerra/socraticode

SocratiCode benchmark on 2.45M-line codebase: grep required 31 steps across 5 questions (6-7 per question), while hybrid semantic search needed only 5 steps total (1 per question). 61% less tokens, 84% fewer tool calls, 37x faster. Uses AST-aware chunking (ast-grep) and Reciprocal Rank Fusion for hybrid BM25+vector search.

**Implications:** At scale (millions of lines), pre-built indexes dramatically reduce token consumption and tool calls. The "grep is all you need" approach from Claude Code has clear scaling limits.

---

## Gaps / follow-ups

* Devin's internal navigation strategy (beyond DeepWiki) is not well-documented publicly
* Continue.dev and Cody approaches not deeply investigated in this pass
* Quantitative comparison across all tools on the same benchmark would be valuable
