# Evidence: D2 — Agent Skills / SKILL.md as distribution mechanism

**Dimension:** Can we ship a globally-installable skill that carries the OK-specific agent guidance? Cross-host portability.
**Date:** 2026-04-22
**Sources:** agentskills.io, Claude Code skills docs, Cursor skills docs, Codex skills docs, Windsurf skills docs, VS Code Copilot skills docs

---

## Key files / pages referenced

- [agentskills.io overview](https://agentskills.io) — open spec, 36+ adopting products listed in client carousel
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills) — most detailed skill docs
- [Cursor skills](https://cursor.com/docs/context/skills) — activation + user-level path
- [Codex skills](https://developers.openai.com/codex/skills/) — `~/.agents/skills` convention
- [Windsurf Cascade Skills](https://docs.windsurf.com/windsurf/cascade/skills) — `~/.codeium/windsurf/skills/`
- [VS Code Copilot agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) — multi-path support

---

## Findings

### Finding: Agent Skills / SKILL.md is an OPEN standard adopted by 36+ agent products

**Confidence:** CONFIRMED
**Evidence:** agentskills.io client carousel lists (non-exhaustive): Claude Code, Claude (consumer), Cursor, OpenAI Codex, GitHub Copilot, VS Code, Windsurf (via Cascade), Amp, OpenCode, OpenHands, Goose, Junie (JetBrains), Gemini CLI, Mux (Coder), Kiro, Laravel Boost, Roo Code, Factory, Databricks Cortex Code, Snowflake Cortex Code, Trae, Spring AI, Firebender, Letta, Mistral Vibe, pi, Ona, Workshop, Emdash, Piebald, Qodo, fast-agent, nanobot, and more. Format was originally released by Anthropic and is now community-governed via agentskills/agentskills on GitHub.

**Implications:** A single skill directory is portable across essentially every host an OK user might reach for, without per-host forks. This is a fundamentally different distribution shape than CLAUDE.md (Claude-only) or AGENTS.md (broad support but file-per-project not user-global).

---

### Finding: User-level skill paths vary per host but are standardizing on `~/.agents/skills/`

**Confidence:** CONFIRMED
**Evidence:** Per-host documentation

| Host | User-level skill path(s) |
|------|--------------------------|
| Claude Code | `~/.claude/skills/<skill-name>/SKILL.md` |
| Cursor | `~/.agents/skills/`, `~/.cursor/skills/`, + legacy `~/.claude/skills/` |
| Codex CLI | `$HOME/.agents/skills` |
| Windsurf (Cascade) | `~/.codeium/windsurf/skills/` |
| VS Code Copilot | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| GitHub Copilot | Covered by VS Code path for the editor, separate handling for github.com agents |

Cursor, VS Code, and Codex all read from `~/.agents/skills/` — positioning this path as the emerging cross-host convention. Windsurf and Claude Code still use host-specific paths but neither is at `~/.agents/`. **Installing one file at `~/.agents/skills/open-knowledge/SKILL.md` covers Cursor + Codex + VS Code in a single write.** Claude Code and Windsurf require either symlinks or additional writes.

**Implications for OK:** A one-file install at `~/.agents/skills/open-knowledge/SKILL.md` is 3-of-6-host coverage; adding symlinks to `~/.claude/skills/` and `~/.codeium/windsurf/skills/` takes it to 5-of-6. The `init` command's job reduces to: (a) write the skill directory once; (b) create symlinks for hosts that don't read `~/.agents`; (c) register the MCP server in each host's MCP config.

---

### Finding: Skills auto-activate via description-matching — agents decide autonomously

**Confidence:** CONFIRMED
**Evidence:** All five host docs describe the same activation model:

1. **Discovery:** At session start, each skill's `name` + `description` (and optional `when_to_use`) loads into context metadata. The body of SKILL.md does NOT load yet.
2. **Activation:** Agent evaluates relevance of each registered skill against every turn's intent. If description matches, agent loads the full SKILL.md body into context.
3. **Execution:** Loaded skill content stays in context for the rest of the session.

Progressive disclosure is the contract. Claude Code's specific detail: descriptions are truncated at **1,536 characters** per skill (combined `description` + `when_to_use` field). VS Code Copilot: **1,024 characters** per description. This is the discovery-time budget — if the description doesn't match relevance signals within that budget, the skill doesn't activate.

**Implications for OK:** A skill named `open-knowledge` with description like "Active whenever Open Knowledge MCP is connected — STOP rules for markdown edits, preview-before-write sequence, wiki-link conventions" would auto-load whenever the agent begins a session with OK tools attached. The description is the activation lever — must include trigger phrases like "markdown", "write_document", "edit_document", "MCP tool" so the agent matches common user intents.

---

### Finding: Skills are scope-aware — can load only when `paths:` glob matches

**Confidence:** CONFIRMED (Claude Code)
**Evidence:** Claude Code skills frontmatter reference:

```yaml
paths: "**/*.md, **/*.mdx"  # Only loads when working with matching files
```

> "When set, Claude loads the skill automatically only when working with files matching the patterns."

**Implications for OK:** The STOP rules for native-tool usage on `.md` files are most relevant when the user is in fact working with markdown. `paths: **/*.md, **/*.mdx` locks the skill activation to markdown-touching turns. This is exactly the auto-scoping OK needs — guidance appears only when it's load-bearing, not always-on.

Caveat: `paths:` is Claude Code-specific (not yet in the open spec). Cross-host fallback is description-matching alone, which is looser.

---

### Finding: Skills survive compaction better than MCP `instructions`

**Confidence:** CONFIRMED (Claude Code, with documented numbers)
**Evidence:** Claude Code skills docs:

> "Auto-compaction carries invoked skills forward within a token budget. When the conversation is summarized to free context, Claude Code re-attaches the most recent invocation of each skill after the summary, keeping the first 5,000 tokens of each. Re-attached skills share a combined budget of 25,000 tokens. Claude Code fills this budget starting from the most recently invoked skill."

Compare to MCP `instructions`: recomputed every turn, 2KB cap per server (in Claude Code).

Net differences:
- **Skill body:** once activated, gets a **5,000-token allocation per skill** post-compaction, up to 25,000 tokens across all invoked skills.
- **MCP `instructions`:** 2KB (~500 tokens) per server, every turn.

**Implications for OK:** The skill can carry ~10x the content of the MCP `instructions` string while paying roughly the same token cost per turn (because progressive disclosure). This is a material capacity argument for skills over handshake-only delivery when guidance is non-trivial.

---

### Finding: Skills can embed dynamic context via `!`command`` pre-execution

**Confidence:** CONFIRMED (Claude Code)
**Evidence:** Claude Code skills docs:

> "The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder, so Claude receives actual data, not the command itself."

Example: a skill could include `!`open-knowledge config print`` to inject the resolved `content.dir` / `include` / `exclude` rules at activation time, giving the agent session-accurate rules even if the user's config changed.

**Implications for OK:** A skill could be a pure static file (simple case) OR could run `open-knowledge config print` on activation to dynamically surface resolved path rules — matching what our MCP server currently does via `buildInstructions`. This makes skills at least as capable as the handshake string for dynamic content.

Caveat: dynamic injection is Claude Code-specific. Cross-host, skills are static text.

---

### Finding: Skills live-update mid-session — no restart needed

**Confidence:** CONFIRMED (Claude Code, Cursor, Windsurf)
**Evidence:** Claude Code docs: "Adding, editing, or removing a skill under `~/.claude/skills/`... takes effect within the current session without restarting."

**Implications for OK:** Updating the skill (e.g. via `open-knowledge upgrade` or a version bump) is seamless — no "quit and relaunch" required like MCP config changes sometimes need for Claude Desktop.

---

## Gaps / follow-ups

- **Cursor `paths:` equivalent:** Cursor's skills docs don't yet document a `paths:` scoping attribute. Unclear if it's planned.
- **Skill signing / trust:** No public discussion of whether skills auto-install or require confirmation. Claude Code's "disable the Skill tool in `/permissions`" implies some trust model but it's agent-level, not install-time.
- **Conflict policy:** When `~/.agents/skills/open-knowledge` and `.claude/skills/open-knowledge` both exist (project vs user), precedence is: enterprise > personal > project (Claude Code docs). Cursor/Codex/Windsurf precedence not documented — assume similar.
