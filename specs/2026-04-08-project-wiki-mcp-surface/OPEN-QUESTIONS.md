# Open Questions — Project Wiki MCP Surface

Living document for design questions that arise during implementation.
Questions are investigated and answered inline as they come up.

---

## Q1: Multiple AGENTS.md files in the same repo — does it make sense?

**Date:** 2026-04-10
**Status:** Answered

### Context

The open-knowledge `init` command scaffolds `.open-knowledge/AGENTS.md` inside user repos. But the open-knowledge repo itself could also have a `.open-knowledge/` directory (dogfooding). Does having multiple AGENTS.md files make sense? How do different tools handle them?

### Findings

**Tool support for hierarchical AGENTS.md:**

| Tool | File | Subdirectory scoping | Hierarchy |
|---|---|---|---|
| **Claude Code** | `CLAUDE.md` (not `AGENTS.md`) | Yes — subdirectory files scope to that subtree | `.gitignore`-like: global → root → subdirectory, stacking |
| **OpenAI Codex** | `AGENTS.md` | Yes — subdirectory files scope to that subtree | Merges with parent; deeper files add context, don't replace |
| **Cursor** | `.cursorrules` / `.cursor/rules/` | No | Single root-level file (or rules directory) |
| **Windsurf** | `.windsurfrules` | No | Single root-level file |

**Key takeaways:**

1. **Claude Code ignores `AGENTS.md` entirely** — it only reads `CLAUDE.md`. So `.open-knowledge/AGENTS.md` is invisible to Claude Code. It's read by agents as a regular file (via Read tool), not auto-loaded as instructions.

2. **Codex treats `.open-knowledge/AGENTS.md` as a scoped subdirectory file** — it applies only when Codex is working within `.open-knowledge/`. This is actually useful: when an agent operates inside the wiki directory, it gets wiki-specific conventions automatically.

3. **AGENTS.md and CLAUDE.md coexist without conflict** — each tool reads its own file. You can have both at repo root with different (tool-specific) instructions.

4. **The self-referential case (dogfooding) is fine** — the open-knowledge repo having its own `.open-knowledge/` is just development config. User repos get their own via scaffolding. Scoping rules handle it naturally.

### Answer

**Yes, it makes sense.** `.open-knowledge/AGENTS.md` is the right place for wiki navigation conventions because:

- For **Codex users**: it scopes wiki conventions to the wiki directory automatically via Codex's hierarchy
- For **Claude Code users**: the MCP server's `instructions` field delivers the same conventions on connect; `AGENTS.md` is a fallback readable by any agent via the Read tool, even without MCP
- For **all agents**: it's the first thing an agent reads when exploring `.open-knowledge/` — serves as a README for the wiki's structure and conventions

**For the open-knowledge repo itself**: having `.open-knowledge/` is fine for dogfooding. It's a separate concern from the scaffolded user-facing wiki.
