# Evidence: Context and Instruction Mechanisms

**Dimension:** 10 (Context/instruction mechanisms)
**Date:** 2026-03-20
**Sources:** Official docs for each agent, community analysis

---

## Key sources referenced

- https://code.claude.com/docs/en/memory — Claude Code CLAUDE.md
- https://agents.md/ — AGENTS.md specification
- https://developers.openai.com/codex/guides/agents-md — Codex AGENTS.md
- https://docs.cursor.com/context/rules — Cursor rules
- https://docs.windsurf.com/windsurf/cascade/memories — Windsurf rules
- https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot — Copilot instructions
- https://docs.continue.dev/customize/deep-dives/rules — Continue rules
- https://aider.chat/docs/config/aider_conf.html — Aider config
- https://docs.roocode.com/features/custom-instructions — Cline/Roo rules
- https://docs.all-hands.dev/usage/prompting/microagents-repo — OpenHands microagents

---

## Findings

### Finding: AGENTS.md has become the universal cross-agent instruction format
**Confidence:** CONFIRMED
**Evidence:** agents.md official site, 60,000+ OSS projects adopted

Read by: Codex (primary), Cursor, Windsurf, Copilot, Claude Code (fallback), Cline/Roo, OpenHands, Continue, Aider, Amp, Devin, Google Jules. Stewarded by Linux Foundation's Agentic AI Foundation.

### Finding: CLAUDE.md has the richest hierarchical loading of any agent config
**Confidence:** CONFIRMED
**Evidence:** code.claude.com/docs/en/memory

Discovery: managed policy → ~/.claude/CLAUDE.md → ~/.claude/rules/*.md → ./CLAUDE.md → ./.claude/CLAUDE.md → ./.claude/rules/*.md → ./CLAUDE.local.md → parent dirs (walk up) → subdirs (on demand). Supports @import syntax (max depth 5). Path-scoped rules via YAML frontmatter.

### Finding: Path-scoped rules are converging across agents
**Confidence:** CONFIRMED
**Evidence:** Multiple agent docs

All use YAML frontmatter with glob patterns:
- Claude Code: .claude/rules/*.md with `paths:` frontmatter
- Cursor: .cursor/rules/*.mdc with `globs:` frontmatter
- Windsurf: .windsurf/rules/*.md with glob patterns
- Copilot: .github/instructions/*.instructions.md with `applyTo:` frontmatter
- Continue: .continue/rules/ with globs/alwaysApply frontmatter

### Finding: Cross-agent compatibility matrix shows fragmented but converging landscape
**Confidence:** CONFIRMED
**Evidence:** Comprehensive cross-referencing of docs

| Config | Primary for | Also read by |
|--------|------------|--------------|
| CLAUDE.md | Claude Code | — |
| AGENTS.md | Codex | Cursor, Windsurf, Copilot, Claude Code (fallback), Cline, OpenHands, Continue, Aider |
| .cursorrules/.cursor/rules/ | Cursor | — |
| .windsurfrules/.windsurf/rules/ | Windsurf | — |
| .github/copilot-instructions.md | Copilot | — |
| .mcp.json | (tool config) | Claude Code, VS Code, Codex, Amazon Q, Windsurf, Cursor |

**Minimal multi-tool setup:** AGENTS.md + .mcp.json covers the widest surface.

---

## Implications for virtual filesystem adapter

1. The virtual filesystem project should include AGENTS.md (and optionally CLAUDE.md) to give agents project context
2. Path-scoped rules could tell agents about component structure, naming conventions
3. .mcp.json could configure the virtual filesystem MCP server itself
4. The instruction mechanism is how we tell agents "this is a React/Tailwind project" — critical for code generation quality

---

## Gaps / follow-ups

* How deeply agents actually use instruction files (do they follow all guidelines?)
* Whether AGENTS.md content affects tool selection behavior
* How instruction files interact with the virtual filesystem (do agents try to read/edit them?)
