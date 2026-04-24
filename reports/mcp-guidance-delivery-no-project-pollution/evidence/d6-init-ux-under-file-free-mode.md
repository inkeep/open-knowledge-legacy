# Evidence: D6 — `open-knowledge init` UX under file-free guidance mode

**Dimension:** If guidance delivery moves off the project dir, what does `init` do? Is there a no-CLI install path?
**Date:** 2026-04-22
**Sources:** Open Knowledge codebase (packages/cli/src/commands/init.ts, content/init.ts), MCP install research report, Claude Code plugin marketplace docs

---

## Key files / pages referenced

- [packages/cli/src/commands/init.ts](/Users/timothycardona/inkeep/open-knowledge/packages/cli/src/commands/init.ts) — current init steps
- [packages/cli/src/content/init.ts](/Users/timothycardona/inkeep/open-knowledge/packages/cli/src/content/init.ts) — current scaffold files
- [reports/mcp-server-auto-install-harnesses/REPORT.md](/Users/timothycardona/inkeep/open-knowledge/reports/mcp-server-auto-install-harnesses/REPORT.md) — cross-harness install landscape
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — no-CLI distribution

---

## Findings

### Finding: Current `ok init` does 5 distinct things; removing file scaffolding drops 2

**Confidence:** CONFIRMED
**Evidence:** Reading `packages/cli/src/commands/init.ts:runInit`:

Current steps:
1. `ensureProjectGit(cwd)` — auto-init `.git/` if missing (SPEC R2 / D9)
2. `initContent(cwd)` — scaffold `.open-knowledge/` with `AGENTS.md`, `.gitignore`, `config.yml`
3. `writeEditorMcpConfig(target, ...)` — register MCP server per editor (user-scoped by default)
4. `scaffoldLaunchJson(cwd, ...)` — create/merge `.claude/launch.json` for Claude Code preview (Claude-specific)
5. `upsertRootInstructions(cwd, ...)` — write/append Open Knowledge section in root `AGENTS.md` + `CLAUDE.md`

File-free mode drops: (2)'s `AGENTS.md` scaffold inside `.open-knowledge/` AND (5) entirely.

Remaining steps:
1. Ensure project git ✓
2. Write `.open-knowledge/config.yml` + `.open-knowledge/.gitignore` only (no `AGENTS.md`) ✓
3. Register MCP server per editor ✓
4. Scaffold launch.json (Claude-only) ✓
5. NEW: Install user-global skill + per-host mirrors

Net: init becomes slightly lighter on the project dir, slightly heavier on `$HOME` (but only once per machine, not per project).

---

### Finding: Skills install is a one-time per-machine operation, not per-project

**Confidence:** CONFIRMED (from D2 + D3 analysis)
**Evidence:** User-global skill paths (`~/.agents/skills/`, `~/.claude/skills/`, `~/.codeium/windsurf/skills/`) are $HOME-scoped. The OK skill bundle installs once per user machine. Every subsequent `ok init` in a different project uses the same skill — no per-project writes needed.

**Implications:** If the skill install is idempotent and version-aware, `ok init` in a second project can short-circuit skill-install entirely (detect existing version, skip). UX payoff: second+ projects have near-instant init. First project pays the skill-install cost.

---

### Finding: Plugin marketplace install is a CLI-free path — `/plugin install` from inside Claude Code

**Confidence:** CONFIRMED
**Evidence:** Claude Code plugins docs: once a plugin is submitted to a marketplace (Claude.ai plugins or an OSS marketplace), users install via `/plugin install <name>` inside Claude Code itself. No terminal required. Bundles MCP + skill in one install.

> "To submit a plugin to the official Anthropic marketplace, use one of the in-app submission forms: Claude.ai or Console."

**Implications for OK:** OK could publish as a Claude Code plugin on the official marketplace — user experience becomes: open Claude Code, type `/plugin install open-knowledge`, done. This is the lightest-touch install possible. Cursor has a similar one-click install URI (per mcp-server-auto-install-harnesses report). Non-Claude non-Cursor hosts still need `npx @inkeep/open-knowledge init` or an `~/.agents/skills/` manual unpack.

This is an OPTIONAL distribution channel — doesn't replace the CLI but adds a lighter onboarding path.

---

### Finding: The "no CLI" minimal path uses `mcp add-json` + skill unpacking

**Confidence:** INFERRED
**Evidence:** Per the mcp-server-auto-install-harnesses report, every host supports MCP registration via config-file write OR `claude mcp add-json` / `codex mcp add` / Cursor deep-link. A user could theoretically:

1. Run the editor's "add MCP server" flow pointing at `npx @inkeep/open-knowledge mcp`
2. Download `open-knowledge-skill.zip` from a releases URL and unzip into `~/.agents/skills/`

This is a zero-CLI install but requires two manual steps. Less elegant than `npx @inkeep/open-knowledge init` which does both. The `init` command is still the blessed path; plugin-marketplace install is the fully automated alternative for Claude Code/Cursor users.

---

## Gaps / follow-ups

- **Skill version management:** When OK ships v0.5 with updated guidance, how does the installed skill get updated? If it's a static file, `ok init --force` could re-write it. Plugin-marketplace install handles this via `/plugin update`. For manual installs, user responsibility.
- **Skill-to-MCP correlation:** The MCP server could, at startup, check for the presence of `~/.agents/skills/open-knowledge` and warn if missing or out of date. Defense-in-depth.
- **Uninstall path:** `ok uninstall` currently unknown scope. Should remove the skill + unregister MCP + remove `.open-knowledge/` optionally. Deserves its own design.
