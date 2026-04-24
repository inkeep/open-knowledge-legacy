# Evidence: D4 — How comparable MCP servers deliver agent guidance

**Dimension:** Do other MCP servers inject instructions into the user's project dir? Ship companion skills? Rely on handshake?
**Date:** 2026-04-22
**Sources:** Linear, Notion, Figma, GitHub, Playwright, XcodeBuildMCP, Stripe, Anthropic plugin marketplace

---

## Key files / pages referenced

- [Figma MCP: Create skills](https://developers.figma.com/docs/figma-mcp-server/create-skills/) — user-authored skills pattern
- [XcodeBuildMCP SKILLS.md](https://github.com/getsentry/XcodeBuildMCP/blob/main/docs/SKILLS.md) — ships companion skills via init command
- [Notion hosted MCP inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look) — tool-description-centric
- [GitHub MCP install-claude guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md) — MCP config only, no CLAUDE.md injection
- [Linear MCP docs](https://linear.app/docs/mcp) — registration only
- [Playwright MCP Claude Code guide (Builder.io)](https://www.builder.io/blog/playwright-mcp-server-claude-code) — notes "explicitly say Playwright MCP in your first message"
- [Claude Code: Create plugins](https://code.claude.com/docs/en/plugins) — plugin = skills + MCP + agents + hooks bundle

---

## Findings

### Finding: No surveyed "serious" MCP server injects CLAUDE.md or AGENTS.md content into user's project

**Confidence:** CONFIRMED
**Evidence:** Linear, GitHub, Notion, Figma, Playwright, Stripe, Vercel MCP servers all document installation as config-file registration only. None document writing or patching a root CLAUDE.md / AGENTS.md. The common install shape is:

1. User runs `claude mcp add <name> <transport-args>` OR edits `~/.claude.json` / `~/.cursor/mcp.json` directly.
2. MCP server starts up and returns `instructions` on initialize.
3. User relies on agent to consume tool descriptions + instructions.

**Implications for OK:** Open Knowledge's current pattern of writing to root `CLAUDE.md` / `AGENTS.md` is an OUTLIER in the MCP ecosystem. Every comparable server expects the agent to pick up guidance from MCP handshake + tool descriptions alone. Dropping the project-file injection aligns OK with ecosystem norm.

---

### Finding: Figma MCP explicitly tells users to author their OWN skills, not auto-install

**Confidence:** CONFIRMED
**Evidence:** Figma's Create Skills docs:

- Claude Code: "Users create `.claude/skills/<skill-name>/SKILL.md` manually"
- Codex: "Users run `$skill-creator` to scaffold a new skill"
- Cursor: "Users run `/create-skill` in chat to generate a skill scaffold"

Figma provides example skill content (e.g. `figma-apply-palette`) as templates — users copy them. Figma does NOT auto-install the skill.

**Implications:** The incumbent pattern for dev-tool MCP is "tool descriptions + suggested skills the user adopts voluntarily." No auto-installation. This is the LEAST intrusive end of the spectrum.

---

### Finding: XcodeBuildMCP (Sentry) ships companion skills via its own `init` command — closest precedent to what OK should do

**Confidence:** CONFIRMED
**Evidence:** XcodeBuildMCP docs/SKILLS.md:

- `xcodebuildmcp init` installs the MCP server registration AND optionally a companion skill.
- Two skill variants: "MCP Skill" (primes agent on MCP tool usage) and "CLI Skill" (primes agent on CLI usage).
- User-global installation — targets Claude Code, Cursor, Codex skill directories (not project-local).
- `xcodebuildmcp init --print` dumps skill content for review.
- Installer uses `--dest` flag for custom paths.
- Critically, the docs note: "The CLI skill is recommended for CLI usage, while the MCP skill is optional when using the MCP server, as Claude already receives MCP guidance through server instructions."

**Implications for OK:** XcodeBuildMCP implements exactly the pattern this research is considering for OK — a single `init` command that (a) registers MCP, (b) optionally installs a global skill. Their stated rationale for making the MCP-skill optional ("instructions already carry that") validates the skill-as-supplement posture. For OK, a user might reasonably consider the skill content essential if our `instructions` string hits Claude Code's 2KB cap, per D1.

---

### Finding: Notion emphasizes tool-description quality over instructions field

**Confidence:** CONFIRMED
**Evidence:** Notion's blog on their hosted MCP server:
- "AI-friendly tool descriptions to avoid rough edges"
- "prompts give your MCP client context on when and how to use each tool"
- "Notion-flavored Markdown spec, creating a powerful markup language tailored to Notion's broad set of blocks"

They embed guidance IN the tool descriptions (per-tool) rather than in the global `instructions` string. Notion does not ship CLAUDE.md / AGENTS.md.

**Implications for OK:** Tool descriptions are another delivery surface. OK's current `exec` / `read_document` / `search` / `write_document` / `edit_document` / `get_preview_url` tool descriptions could carry per-tool-specific behavioral guidance (e.g. "write_document: before calling, you MUST first call get_preview_url + open the URL in preview browser").

---

### Finding: Playwright MCP ships no guidance file — agent STILL defaults to Bash

**Confidence:** CONFIRMED (empirical community observation)
**Evidence:** Builder.io and other Playwright MCP setup guides consistently advise: "Explicitly say 'Playwright MCP' in your first message, as Claude sometimes defaults to running Playwright through Bash commands instead."

This is direct empirical evidence that MCP `instructions` alone is NOT sufficient to override a strong agent prior (here: "use Bash to run `playwright` CLI"). The agent falls back to its default tool preferences even with Playwright's MCP instructions in context.

**Implications for OK:** The SAME failure mode is exactly what OK's current guidance is trying to prevent — agent defaulting to native `Read`/`Grep` on `.md` files when OK MCP is connected. Playwright's experience suggests pure-`instructions` delivery MAY be insufficient for behavior-steering of this specific kind. Skills + tool-description-embedded guidance may be needed together.

Caveat: Playwright's advice is from community guides, not Anthropic's official guidance. The rate of occurrence is not quantified.

---

### Finding: Claude Code's "plugin" format is the official pattern for bundling skills + MCP + agents together

**Confidence:** CONFIRMED
**Evidence:** Claude Code plugins docs — plugin = `.claude-plugin/plugin.json` + `skills/` + `agents/` + `.mcp.json` + `hooks/` + `bin/` + `settings.json`. Install via marketplace or `/plugin install`. Playwright is distributed as a Claude Plugin (claude.com/plugins/playwright) per Anthropic's marketplace.

Install destination: when a user runs `/plugin install`, Claude Code installs the plugin bundle under its plugin directory. Skills + MCP get registered as a unit. Single install command, unified version, clean uninstall.

**Implications for OK:** OK could distribute as a Claude Code plugin — single `.claude-plugin/plugin.json` manifest + `skills/open-knowledge/SKILL.md` + `.mcp.json` (the MCP server registration). User runs `/plugin install open-knowledge` in Claude Code. Zero project-dir pollution. BUT: this is Claude Code-specific; non-Claude hosts would still need the separate skill-install path for those hosts.

---

### Finding: No MCP server found that writes ANYTHING to user's project git-tracked files

**Confidence:** CONFIRMED (by exhaustive survey)
**Evidence:** Surveyed Linear, GitHub, Notion, Figma, Playwright, Stripe, Vercel, Sentry XcodeBuildMCP, Render MCP, Context7 documentation. None documented patching root CLAUDE.md / AGENTS.md. The ecosystem strongly norms toward:
- MCP config (user-global, editor-specific)
- MCP handshake `instructions`
- Tool descriptions
- Optionally: companion skills (user-global path)

OK is currently the only MCP server I found in a non-trivial catalogue that writes to the project's root git-tracked file set during install. This is a material ecosystem outlier.

---

## Gaps / follow-ups

- **GitBook's docs-to-skill bridge:** GitBook reportedly auto-generates `skill.md` from documentation. Haven't confirmed scope — if a docs platform ships auto-generated skills, how does it deliver? Likely as downloadable artifacts, not auto-install.
- **Anthropic / Cowork enterprise plugin install:** Cowork admins can push plugins to users. Unclear if that implies silent plugin install without user consent. Probably within the enterprise-marketplace model only.
- **`llms.txt` as an alternative channel:** Covered in `reports/llms-txt-content-negotiation-agent-readable-web/`. Complementary to `instructions`, but for publishable docs not local MCP install.
