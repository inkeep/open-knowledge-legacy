# Evidence: Hosts Without Automation Hooks

**Dimension:** Hosts where the OK skill cannot rely on host-side hooks at all
**Date:** 2026-04-27
**Sources:** This repo's `agent-skills-zip-distribution-ux/` and `mcp-server-auto-install-harnesses/` reports; web search

---

## Findings

### Finding: Claude Desktop has zero automation hooks
**Confidence:** CONFIRMED
**Evidence:** This repo's `agent-skills-zip-distribution-ux/REPORT.md` description (verbatim from catalogue):

> "Claude Desktop's zero automation hooks (no URL scheme, no file association, no deep-link, no drop-target)"

This is the published-on-record finding from the Apr 2026 zip-distribution research. Claude Desktop is the macOS/Windows Electron chat app — distinct from Claude Code (CLI) and Cowork (cloud).

**Implications:**
- Knowledge-lint cannot be enforced via Claude Desktop hooks because Claude Desktop has none.
- Users on Claude Desktop are limited to:
  - The MCP server itself (server-side notifications, response sentinels) — see `mcp-portable-alternatives.md`.
  - Manual lint invocation via slash command or chat prompt.
  - External scheduled jobs (cron, GitHub Actions, etc.) that run lint outside the chat session entirely.

### Finding: Claude Cowork is VM-isolated; no hook surface mounts host-side
**Confidence:** CONFIRMED
**Evidence:** This repo's `mcp-server-auto-install-harnesses/REPORT.md`:

> "Cowork's VM runs its own per-session synthetic filesystem that does NOT mount the host's `~/.claude/skills/`; `npx skills`'s ~45-agent registry has no `cowork` / `claude-desktop` / `claude-cowork` entry; Anthropic's only sanctioned paths are manual ZIP upload via the Desktop UI or org-admin upload/GitHub-sync for Team+ plans."

> "Cowork has a per-tool re-approval bug (#24433)"

> "Cowork has [...] manual ZIP upload via `Customize > Skills > +` (personal) or org-admin upload/GitHub-sync (Team+ plans) — both human-UI-only, neither scriptable"

**Implications:**
- Cowork's VM isolation isolates the OK skill from any host-side hook configuration even if Cowork shipped one. Skills must be uploaded manually; hooks would have to come bundled in the skill itself.
- Cowork users can still access the OK MCP server (assuming the org configures it), so MCP-server-side mechanisms remain viable.

### Finding: The non-hook hosts collectively represent significant user populations
**Confidence:** INFERRED
**Evidence:** OK skill's stated cross-host targeting (per `packages/server/assets/skills/open-knowledge/SKILL.md`):

> "Compatibility: Claude Code, Claude Desktop, Claude Cowork, Claude.ai web. Requires Open Knowledge MCP server + code execution."

The skill explicitly targets Claude Desktop, Cowork, and Claude.ai web — none of which have hooks. Of the OK skill's named compatibility targets, only Claude Code has hook support.

**Implications:**
- A hooks-only knowledge-lint strategy would *not cover the OK skill's own stated compatibility matrix*. The OK skill's targeted hosts are Claude Code (hooks ✓), Claude Desktop (no hooks), Cowork (no hooks), Claude.ai web (no hooks).
- The MCP-server-side path is the **only** mechanism that covers all four targets uniformly.

### Finding: Generic hosts (Claude.ai web, ChatGPT) have no hook capability and likely never will
**Confidence:** INFERRED
**Evidence:** No web search surfaces any "hooks" feature for browser-based chat surfaces. The architectural model — chat UI in browser, no local execution surface — precludes shell-command hooks structurally. URL-scheme-elicitation and structured tool-result content are the only server-pushed mechanisms available.

**Implications:**
- Universal cross-host knowledge-lint must work without any client-side automation.
- The OK MCP server's existing `attach-preview-once` warning pattern (per `specs/2026-04-24-preview-attach-once-per-session/`) is a working precedent — server pushes a behavioral hint via tool-result content, agent honors it. Same pattern can ship lint findings.

---

## Negative searches

- "Claude Desktop hooks" — no results indicate hooks exist for Claude Desktop. Multiple results (this repo's prior reports + web search) confirm zero automation hooks.
- "Cowork hooks" / "Claude Cowork lifecycle" — no published hook surface.
- "ChatGPT desktop hooks" — App Intents and URL schemes exist (per this repo's `deep-linking-ai-desktop-apps-2026/`), but no agent-loop hook surface.

---

## Gaps / follow-ups

- The "Claude.ai web" target is sufficiently undocumented that hook-equivalents may exist via custom GPTs / skills that I haven't surveyed.
- Anthropic could ship Claude Desktop hooks at any time — this finding has a short shelf life. A re-check every 3 months is warranted.
