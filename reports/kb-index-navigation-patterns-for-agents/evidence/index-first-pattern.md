# Evidence: CLAUDE.md, AGENTS.md, and the Index-First Pattern

**Dimension:** D2 — CLAUDE.md / AGENTS.md as "index-first" navigation; D3 — Aider's repo-map
**Date:** 2026-04-02
**Sources:** Anthropic docs, OpenAI docs, Aider docs, existing research reports, practitioner blogs

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — Anthropic context engineering
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — Agent Skills blog post
- https://openai.com/index/harness-engineering/ — OpenAI Harness Engineering
- https://developers.openai.com/codex/guides/agents-md — Codex AGENTS.md docs
- https://aider.chat/docs/repomap.html — Aider repo-map documentation
- https://seylox.github.io/2026/03/05/blog-agents-meta-repo-pattern.html — Agents Meta-Repository Pattern
- https://arxiv.org/abs/2602.20478 — Codified Context infrastructure paper
- /Users/edwingomezcuellar/reports/agent-repo-config-files/REPORT.md — Prior research on agent config files

---

## Findings

### Finding: CLAUDE.md functions as a "hot-memory constitution" — always loaded, providing orientation
**Confidence:** CONFIRMED
**Evidence:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents, prior report agent-repo-config-files

CLAUDE.md is "naively dropped into context up front" — it's always loaded at the start of every session. Best practice is 150-300 lines, containing: tech stack, build/test commands, coding conventions, critical warnings. It does NOT contain a full file map or comprehensive index. Instead, it provides orientation that enables the agent to use tools (grep, glob) to discover specifics. The progressive disclosure pattern: CLAUDE.md → tool exploration → file reading.

**Implications:** CLAUDE.md is an orientation document, not an index. It tells the agent "what kind of project this is and how to work in it" — not "here's everything in the project."

### Finding: AGENTS.md in the OpenAI Harness pattern IS an index — a table of contents pointing to docs/
**Confidence:** CONFIRMED
**Evidence:** https://openai.com/index/harness-engineering/, https://developers.openai.com/codex/guides/agents-md

The Harness team explicitly describes AGENTS.md as "a table of contents pointing to a structured docs/ directory." The docs/ directory contains "maps of the system, execution plans, and design specifications." AGENTS.md is kept short (~100 lines) and serves as a map. "Give Codex a map, not a 1,000-page instruction manual." Codex reads AGENTS.md files in a discovery hierarchy: home dir → project root → CWD, with override support.

**Implications:** This is the clearest production evidence that the "index-first" pattern works for coding agents at scale (1M lines, 1500 PRs). The index is lightweight, machine-readable, and points to deeper content.

### Finding: Aider's repo-map is the most explicit "enriched catalog" — auto-generated, compressed
**Confidence:** CONFIRMED
**Evidence:** https://aider.chat/docs/repomap.html, https://aider.chat/2023/10/22/repomap.html

Aider's repo-map is auto-generated from the codebase using tree-sitter. Contains: file list, key symbol definitions (classes, functions, types), and their signatures. Uses PageRank to rank by importance. Default 1K tokens. Dynamically sized based on chat state. The LLM can see "classes, methods and function signatures from everywhere in the repo" — either sufficient to solve the task directly, or enabling it to request specific files.

**Implications:** Aider demonstrates that an auto-generated, compressed index CAN fit in ~1K tokens and provide sufficient context for navigation. This is the most direct analog to "auto-maintained index files" for a markdown KB.

### Finding: The "Agents Meta-Repository" pattern extends the index to cross-repo navigation
**Confidence:** CONFIRMED
**Evidence:** https://seylox.github.io/2026/03/05/blog-agents-meta-repo-pattern.html

A dedicated repository serving as an agent's knowledge base for navigating multi-repo codebases. Contains: AGENTS.md (entry point with repo map), repos.yaml (machine-readable config), conventions/ (cross-repo standards), workflows/ (multi-repo playbooks), scripts/ (CI tooling). Agents read AGENTS.md first, then consult repos.yaml. An "active-work directory" provides cross-session memory. Case study: 8-merge-request fix across 6 repos over 5 sessions without context loss.

**Implications:** The meta-repo pattern is the "index" pattern taken to its logical extreme — a separate repository that serves purely as an index for other repositories.

### Finding: "Codified Context" paper describes a 3-tier index architecture for persistent agent memory
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2602.20478

Three tiers: (1) Hot-memory constitution — always in context, encoding conventions and retrieval hooks (analog to CLAUDE.md); (2) 19 domain-expert agents for specialized areas; (3) Cold-memory knowledge base of 34 on-demand specification documents. Developed for a 108K-line C# system across 283 sessions. The hot memory includes "retrieval hooks" that tell the agent how to find information in the cold memory.

**Implications:** This academic validation confirms the practitioner pattern: a lightweight always-loaded index that includes pointers ("retrieval hooks") to deeper knowledge, with the agent dynamically loading what it needs.

### Finding: Anthropic's Agent Skills implement progressive disclosure as the canonical navigation pattern
**Confidence:** CONFIRMED
**Evidence:** https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

Agent Skills use a three-level progressive disclosure system: (1) Metadata — only name+description loaded at startup (the "index"); (2) Instructions — full SKILL.md body loaded when triggered; (3) Resources — scripts/, references/, assets/ loaded on demand. "The amount of context that can be bundled into a skill is effectively unbounded" because of this progressive pattern. This is Anthropic's own implementation of the index-first pattern.

**Implications:** Anthropic has productized the index-first pattern in Agent Skills. The skill name+description IS the index entry. The SKILL.md IS the deeper document. The resources/ IS the full content. This is exactly the pattern needed for a KB.

---

## Gaps / follow-ups

* How do practitioners structure their AGENTS.md in practice? (beyond Harness team)
* Token consumption comparison: CLAUDE.md-style (always loaded) vs Aider repo-map (compressed) vs progressive disclosure (on demand)
