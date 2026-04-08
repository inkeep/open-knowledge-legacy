# Evidence: Agent Context Loading Strategies

**Dimension:** D3 — Agent context loading strategies (avoiding context bloat)
**Date:** 2026-04-08
**Sources:** Claude Code docs, Cursor docs, Codex/AGENTS.md spec, MCP spec, Windsurf docs, llms.txt spec, Obsidian Skills, Anthropic engineering blog, JetBrains NeurIPS research

---

## Key files / pages referenced

- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory)
- [Anthropic Blog - Using CLAUDE.md](https://claude.com/blog/using-claude-md-files)
- [AGENTS.md Specification](https://agents.md/)
- [MCP Blog - Server Instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)
- [llms.txt Specification](https://llmstxt.org/)
- [Anthropic - Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [JetBrains Research - Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)

---

## Findings

### Finding: Tiered loading (always-on + conditional) is the universal consensus
**Confidence:** CONFIRMED
**Evidence:**

| System | Always-on | Conditional/Lazy |
|--------|-----------|-----------------|
| Claude Code | Root CLAUDE.md + unconditional rules | Subdirectory CLAUDE.md + path-scoped rules |
| Cursor | `alwaysApply: true` rules | Glob-matched `.mdc` rules |
| Codex/AGENTS.md | All AGENTS.md in path (dump-all) | None |
| Windsurf | Global + project rules | Glob-matched rules + semantic retrieval |
| llms.txt | H1 + summary | Optional sections → llms-full.txt |

**Implications:** Open-knowledge's AGENTS.md should contain minimal orientation context; detailed guidance should be in per-directory or per-topic files loaded on demand.

### Finding: Path/glob scoping is the dominant progressive disclosure primitive
**Confidence:** CONFIRMED
**Evidence:** Claude Code (`.claude/rules/` with `paths:` frontmatter), Cursor (`.mdc` with `globs:`), Windsurf (glob-matched rules) all converge on: context loads when the agent touches matching files.

**Implications:** Open-knowledge catalog files per directory provide natural path-scoped context without needing a separate rules system.

### Finding: Hard size limits force good design
**Confidence:** CONFIRMED
**Evidence:** Codex: 32 KiB combined max (hard). Windsurf: 6K chars/file, 12K total (hard). Claude Code: 200 lines soft, 25KB/200-line hard cap for auto memory. GitHub MCP testing: instructions improved GPT-4 Mini from 20% to 80% task success.

**Implications:** The root catalog file should target under 200 lines / 32KB. Per-directory catalogs should be concise summaries with pointers, not exhaustive content.

### Finding: Index-then-retrieve beats dump-all
**Confidence:** CONFIRMED
**Evidence:** llms.txt (summary + links), Karpathy's librarian pattern (summaries + index files), Claude Code auto memory (MEMORY.md index + topic files). JetBrains NeurIPS research: observation masking (rolling window) outperformed LLM summarization in 4/5 settings; context elongation is actively harmful.

**Implications:** The catalog file hierarchy (root `_INDEX.md` → per-folder `_INDEX.md`) is exactly this pattern. Agents orient via the index, then retrieve specific files via search/read.

### Finding: Sub-agent delegation preserves context budgets
**Confidence:** CONFIRMED
**Evidence:** Anthropic's own guidance: sub-agents with clean windows return 1,000-2,000 token summaries rather than full exploration results. This architectural pattern is more powerful than any file-format convention.

**Implications:** For large KBs, agents should be able to spawn sub-agents that focus on specific sections rather than loading everything into one context.

### Finding: AGENTS.md is converging as the cross-tool standard
**Confidence:** CONFIRMED
**Evidence:** 60,000+ repos, Linux Foundation stewardship. Adopted by Codex, Jules, Cursor, Devin, Copilot, Aider. Claude Code bridges via `@AGENTS.md` import. Distinct from README.md (human-facing).

**Implications:** Open-knowledge should scaffold AGENTS.md (not just CLAUDE.md) for cross-agent compatibility.

### Finding: MCP instructions field improves agent performance but has no progressive disclosure
**Confidence:** CONFIRMED
**Evidence:** MCP spec: `instructions` string returned at initialization, injected into system prompt. Guidance: cover cross-tool relationships, workflow sequencing, constraints. Keep concise. GitHub testing showed +25% improvement across models. But no lazy/on-demand mechanism within instructions.

**Implications:** The MCP server's `instructions` field should contain navigation conventions only (read catalog first, then grep, then read). Detailed KB metadata should be discoverable via tools.

---

## Gaps / follow-ups

- What's the optimal token budget for the root catalog file? (Needs empirical testing)
- How should the catalog file change as KB size grows from 10 → 100 → 1000 articles?
