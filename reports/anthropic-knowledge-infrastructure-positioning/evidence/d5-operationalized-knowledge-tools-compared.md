# Evidence: Operationalized Knowledge Tools Compared

**Dimension:** D5 — Sema4.ai Runbooks, kepano/obsidian-skills, Claude Code skills, agentskills.io compared
**Date:** 2026-04-02
**Sources:** sema4.ai, github.com/kepano, github.com/anthropics, agentskills.io

---

## Findings

### Finding: Four distinct approaches to operationalized knowledge for agents exist
**Confidence:** CONFIRMED
**Evidence:** Multiple primary sources

| Approach | Creator | Format | Agent Model | Knowledge Type | Execution Model |
|----------|---------|--------|-------------|----------------|-----------------|
| **agentskills.io / SKILL.md** | Anthropic (open standard) | Markdown + YAML frontmatter | Any skills-compatible agent | Procedural workflows | Progressive disclosure into context |
| **Sema4.ai Runbooks** | Sema4.ai | Natural language (Intent/Output/Recipe) | Sema4.ai platform agents | Business process automation | AI interprets natural language instructions |
| **kepano/obsidian-skills** | Steph Ango (Obsidian CEO) | SKILL.md (agentskills.io compliant) | Claude Code, Codex CLI, etc. | Tool-specific operational knowledge | Teaches agents tool conventions |
| **Claude Code skills** | Anthropic | SKILL.md with Claude-specific extensions | Claude Code (+ SDK) | Developer workflows | Three-tier progressive disclosure |

### Finding: These approaches sit on a spectrum from general to platform-specific
**Confidence:** INFERRED

- agentskills.io = platform-agnostic spec (minimal: name + description required)
- Claude Code skills = agentskills.io + Claude-specific extensions (model, effort, hooks, paths, shell)
- kepano/obsidian-skills = agentskills.io applied to a specific product domain
- Sema4.ai Runbooks = proprietary format, different philosophy (no-code, natural language-first for business users)

### Finding: Sema4.ai and agentskills.io represent fundamentally different theories of knowledge operationalization
**Confidence:** INFERRED

Sema4.ai: Business users write natural-language runbooks; AI interprets them. Knowledge is authored for humans, consumed by AI. Platform-locked.

agentskills.io: Developers/domain experts write markdown instructions for agents. Knowledge is authored for AI, consumed by AI. Cross-platform.

The philosophical split: Should operationalized knowledge be written in human-natural language that AI interprets (Sema4.ai), or in AI-native structured instructions (SKILL.md)?

---

## Gaps / Follow-ups

- No head-to-head performance comparison between these approaches
- Sema4.ai adoption numbers not found
