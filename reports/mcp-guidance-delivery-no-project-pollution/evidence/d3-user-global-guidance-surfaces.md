# Evidence: D3 — User-global guidance surfaces per host

**Dimension:** What's the "user-global, not per-project" guidance surface in each host? Can we target it cleanly?
**Date:** 2026-04-22
**Sources:** Claude Code memory docs, Cursor User Rules, Codex AGENTS.md docs, Windsurf memories docs, VS Code/Copilot docs, agentskills.io

---

## Key files / pages referenced

- [Claude Code memory docs — user-global CLAUDE.md](https://code.claude.com/docs/en/memory) — `~/.claude/CLAUDE.md`
- [Cursor Rules docs](https://cursor.com/docs/rules) — User Rules (settings-stored) + Project Rules (`.cursor/rules/*.mdc`)
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — `~/.codex/AGENTS.md` global + project AGENTS.md
- [Windsurf memories](https://docs.windsurf.com/windsurf/cascade/memories) — `~/.codeium/windsurf/memories/global_rules.md`
- agentskills.io — cross-host skills (see D2)

---

## Findings

### Finding: Every major host has a user-global guidance surface — but they're all different

**Confidence:** CONFIRMED
**Evidence:** Per-host docs (cited above)

| Host | User-global guidance path | Size cap | Format |
|------|---------------------------|----------|--------|
| Claude Code | `~/.claude/CLAUDE.md` | — | Markdown |
| Claude Code (alt) | `~/.claude/skills/*/SKILL.md` | 1,536 chars desc | Markdown + frontmatter |
| Cursor | Settings → Rules → User Rules (stored in editor settings, not filesystem) | — | Plain text |
| Cursor (alt) | `~/.cursor/skills/*/SKILL.md` or `~/.agents/skills/*/SKILL.md` | — | Markdown + frontmatter |
| Codex CLI | `~/.codex/AGENTS.md` (or `AGENTS.override.md`) | — | Markdown |
| Codex CLI (alt) | `~/.agents/skills/*/SKILL.md` | — | Markdown + frontmatter |
| Windsurf | `~/.codeium/windsurf/memories/global_rules.md` | 6,000 chars | Plain markdown |
| Windsurf (alt) | `~/.codeium/windsurf/skills/*/SKILL.md` | — | Markdown + frontmatter |
| VS Code Copilot | `~/.copilot/skills/*` / `~/.claude/skills/*` / `~/.agents/skills/*` | 1,024 chars desc | Markdown + frontmatter |

**Observation: two families of surfaces.**

1. **Always-on text files** (Claude `CLAUDE.md`, Cursor User Rules, Codex `AGENTS.md`, Windsurf `global_rules.md`) — loaded into context every session, counts against context window every turn. Each host has a different path; none of them share.

2. **Skills** (cross-host convergence via `~/.agents/skills/` + host-specific fallbacks) — progressive disclosure, metadata-only until activated.

**Implications for OK:** The "always-on" surface family has zero cross-host share — four writes to four different paths. The skills family has strong cross-host convergence around `~/.agents/skills/`. For a guidance bundle intended to be session-active for markdown work, skills win on distribution cost.

---

### Finding: Cursor's User Rules are NOT filesystem-based — stored inside the Cursor app

**Confidence:** CONFIRMED
**Evidence:** Cursor forum (community member asking where user rules live on disk for version control): "User Rules are saved inside the Cursor application itself at Settings > Rules > User Rules, rather than in a specific directory like `~/.cursor`."

**Implications:** We cannot programmatically write Cursor User Rules. The ONLY programmatic global-guidance path in Cursor is Project Rules (`.cursor/rules/*.mdc`, per-project) OR skills. Skills it is.

---

### Finding: Codex `~/.codex/AGENTS.md` IS filesystem-based and writable

**Confidence:** CONFIRMED
**Evidence:** Codex docs: "Codex reads AGENTS.override.md if it exists in your Codex home directory (defaults to ~/.codex), otherwise it reads AGENTS.md." GitHub Issue #4354: "seems like codex will read AGENTS.md in ~/.codex/AGENTS.md".

But caveat: GitHub Issue #8759 reports "CLI fails to read AGENTS.md from the global location by default" — behavior is buggy or inconsistent across Codex CLI versions.

**Implications:** Installer COULD programmatically write `~/.codex/AGENTS.md` or `AGENTS.override.md`, but the feature is unstable + we'd still be "writing to someone's global AGENTS.md" which conflicts with the user's "don't pollute" stance even at user scope. A user might have their own `~/.codex/AGENTS.md` they manage.

---

### Finding: Windsurf `global_rules.md` has a 6,000 char cap — tight for behavior-shaping content

**Confidence:** CONFIRMED
**Evidence:** Windsurf docs: "The global rules file is limited to 6,000 characters."

Our current `CLAUDE_MD_SECTION` is ~3,500 chars. Adding MCP-instructions-scale content on top would push against the cap; the user could have their own global_rules content sharing the budget.

**Implications:** If we went the `global_rules.md` route for Windsurf, we'd be eating into a shared-with-user budget. Skills don't have this constraint (per-skill 5,000 token post-compaction allocation per D2).

---

### Finding: The skills surface is the ONLY surface with reasonable cross-host uniformity

**Confidence:** CONFIRMED (by comparison — every other surface is host-specific)
**Evidence:** Summary table above. Skills converge to 2 paths (`~/.agents/skills/*` and `~/.claude/skills/*` + `~/.codeium/windsurf/skills/*` as host-specific mirrors). The always-on-file surfaces require 4 distinct writes to 4 different paths.

**Skill install topology** for covering Claude Code + Cursor + Codex + Windsurf + VS Code + Copilot:
- Write `~/.agents/skills/open-knowledge/SKILL.md` → Cursor, Codex, VS Code Copilot (3 hosts)
- Symlink `~/.claude/skills/open-knowledge` → Claude Code, and also VS Code/Cursor fallback (already covered)
- Symlink `~/.codeium/windsurf/skills/open-knowledge` → Windsurf

Two symlinks + one file. That's the install footprint vs four separate file writes for the always-on-file approach.

---

### Finding: Claude Desktop (consumer) — no public skills surface

**Confidence:** INFERRED (absence of documentation)
**Evidence:** Claude consumer app (claude.ai / desktop) lists in the agentskills.io carousel with instructionsUrl to platform.claude.com/docs/en/agents-and-tools/agent-skills/overview, but Claude Desktop's MCP config is separate from Claude Code's — skills availability unclear. Anthropic's official skills docs mention the Anthropic API + Claude Code primarily.

**Implications:** Claude Desktop users may only have the MCP `instructions` path available. If OK supports Claude Desktop (it does, per the editors config), we need to keep the MCP handshake string well-tuned regardless of the skill strategy.

---

## Gaps / follow-ups

- **Zed, JetBrains Junie, JetBrains AI Assistant, Gemini CLI:** All list on agentskills.io but not analyzed here. Claimed support — paths unknown.
- **Cursor skills path precedence:** If a skill exists in BOTH `~/.agents/skills/open-knowledge` and `~/.cursor/skills/open-knowledge`, which wins? Undocumented.
- **Corporate / managed-settings precedence:** Claude Code has "enterprise" skill settings that override personal skills. Similar mechanisms may exist elsewhere. Irrelevant for OK right now.
