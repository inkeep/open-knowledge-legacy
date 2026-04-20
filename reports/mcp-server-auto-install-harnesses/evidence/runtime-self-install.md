# Evidence: Runtime MCP Self-Install Across 7 Harnesses

**Dimension:** Which harnesses support runtime MCP self-registration via conversation / tool call / slash command / skill?
**Date:** 2026-04-18
**Sources:** Vendor docs, GitHub issue trackers, Cursor + Anthropic forum threads, community projects (`mcp-installer`, `mcp-server-restart`)

**Vendor-bias flags:** Each vendor's docs describe their own behavior; cross-referenced with GitHub issues + community reports.

---

## Capability matrix

| Harness | Mid-session add | Hot-reload on config change | Skill/project bootstrap | Agent-invoked CLI takes effect in session? | Runtime API |
|---|---|---|---|---|---|
| Claude Code terminal | `/mcp` UI only — no `/mcp add` verb | **NO** (#46426 open) | Skills/plugins exist but install doesn't hot-apply | **NO** — `claude mcp add` writes config, current session ignores | None |
| Claude Code Desktop | No | No | Same as terminal + plugins | No | VS Code's `registerMcpServerDefinitionProvider` exists but Claude Code ext doesn't wire it |
| Claude Cowork | No (sandbox blocks host) | No — requires Desktop restart | Skills yes, MCP register no | No — VM cannot reach host config | None |
| Codex terminal | No | **NO — explicitly "not planned" (#7767)** | AGENTS.md (prose only) | No — `codex mcp add` writes config, session ignores | None |
| Codex desktop | No | No — requires VS Code window reload | AGENTS.md | No | Could use VS Code provider API, Codex doesn't wire it |
| Cursor CLI | No `add` verb — only `enable/disable/list/login` | No reliable detection ([forum #148397](https://forum.cursor.com/t/cursor-cli-does-not-detect-mcp-settings/148397)) | `.cursor/rules/` (prose only) | No | None |
| **Cursor desktop** | No from chat | Partial (known-buggy file-watcher — [#3887 `ReloadClient` empty command, 60s timeout](https://github.com/cursor/cursor/issues/3887)) | Rules (prose only) | No from chat | **YES — `vscode.cursor.mcp.registerServer()`** |

**Headline:** Only **Cursor Desktop** has a genuine programmatic runtime-register API. Every other harness requires session or app restart.

---

## Per-harness deep dive

### Claude Code terminal
- **Mid-session add:** `/mcp` opens a management panel (list/enable/disable/reconnect/OAuth). **No `/mcp add` slash command exists.**
- **Hot-reload:** [Issue #46426](https://github.com/anthropics/claude-code/issues/46426) (open, April 2026) is the canonical feature request — not shipped
- **Dynamic tool discovery within connected server:** MCP `notifications/tools/list_changed` supported — but re-lists tools on existing server, does NOT register new server
- **Best interactive UX today:** agent writes `.mcp.json`, prints instructions, user restarts — OR agent invokes `mcp-installer` MCP to write config + asks for restart. Every path ends at user-side restart.
- **Plugins:** [#18174](https://github.com/anthropics/claude-code/issues/18174), [#32399](https://github.com/anthropics/claude-code/issues/32399) confirm plugins load only at session start. [#28310](https://github.com/anthropics/claude-code/issues/28310) requests marketplace auto-install — not shipped.

### Claude Code Desktop (VS Code extension)
Inherits all terminal limitations. VS Code has `lm.registerMcpServerDefinitionProvider` with `onDidChangeMcpServerDefinitions` event for runtime MCP changes — but this is VS Code's native MCP surface for Copilot/Agent mode, not a hook Claude Code's chat UI exposes to its own agent.

### Claude Cowork
- **Sandboxed Ubuntu VM** — local stdio MCPs bridged in by Claude Desktop's SDK layer from `claude_desktop_config.json`. VM cannot install host-side stdio server itself.
- **Mid-session add:** None. Adding MCP requires editing host config + full Desktop restart. `non-dirty/mcp-server-restart` MCP automates the restart step but still loses in-session context.
- **Skills:** Exist, but cannot alter MCP registration
- **Best UX:** Ship a DXT/MCPB bundle; user double-clicks once. "One-click install," not "agent-installs-itself."

### Codex terminal
- **Mid-session add:** CLI verb `codex mcp add` writes `~/.codex/config.toml`; **running session does NOT reload**
- **Hot-reload:** [Issue #7767](https://github.com/openai/codex/issues/7767) ("reload MCP server") closed as **not planned** — strongest negative signal among all harnesses
- **Related:** [#7318](https://github.com/openai/codex/issues/7318) requests dynamic HTTP-header reload on 401 — also not shipped
- Even `codex mcp remove && codex mcp add` requires restarting Codex process
- **AGENTS.md:** Can instruct agent behavior, cannot trigger MCP registration

### Codex desktop (VS Code extension)
Same config contract as terminal (`~/.codex/config.toml`). Bug reports indicate full VS Code window reload needed. No runtime-register API wired into Codex's extension.

### Cursor CLI (`cursor-agent`)
- **Slash commands:** `/mcp list`, `/mcp enable <name>`, `/mcp disable <name>`, `/mcp login`. **No `add` verb** — servers must preexist in `mcp.json`
- **Hot-reload:** Forum reports ([#148397](https://forum.cursor.com/t/cursor-cli-does-not-detect-mcp-settings/148397)) say Cursor CLI does NOT detect `mcp.json` changes reliably. Workaround: agent edits `.cursor/mcp.json`, user restarts `cursor-agent`

### Cursor desktop — the ONLY exception
- **Extension API (UNIQUE):** [`vscode.cursor.mcp.registerServer(config)`](https://cursor.com/docs/context/mcp-extension-api) accepts `StdioServerConfig` or `RemoteServerConfig`, registers at runtime from extension code
- **Docs silent on session-persistence** — unclear whether registration survives restart
- **File-watcher reload:** Cursor attempts auto-reload `mcp.json` on change, but [#3887](https://github.com/cursor/cursor/issues/3887) documents `ReloadClient` empty-command bug that times out after 60s
- **VSIX install at runtime:** `cursor --install-extension foo.vsix` works, but official guidance is to exit Cursor first; newly-installed extensions activate only after "Developer: Reload Window" — which dumps the agent conversation

**Three frictions on the Extension API path:**
1. Extension must already be installed — agent running `cursor --install-extension foo.vsix` needs Reload Window, which kills chat
2. `registerServer()` persistence not documented
3. Users must trust third-party extension

**UX ceiling:** Enterprise could ship a signed, pre-installed extension that, on agent request, calls `registerServer()` with tenant-specific credentials — closest thing to "dynamic MCP attach without restart."

---

## Skills / project-instruction bootstrap

| Harness | Skill/project file | Can trigger MCP install? | Same-session usable? |
|---|---|---|---|
| Claude Code | `SKILL.md`, plugins | Can run `claude mcp add` | **NO** — current session ignores |
| Claude Code plugins | `/plugin install <slug>` | Bundles MCP servers | NO — plugins load only at session start |
| Codex | AGENTS.md | Text instructions only | N/A |
| Cursor rules | `.cursor/rules/` | Text instructions only | N/A |
| Cowork | Skills (shared) | Can instruct but not register | N/A |

**Verdict:** No harness exposes a project file that auto-registers MCP at session-start **and** makes it usable **in that first session**. Closest is Claude Code plugins — if user runs `/plugin install` at start of conv N, the plugin's MCPs are live starting at conv N+1.

---

## Precedents in the wild

- **[`anaisbetts/mcp-installer`](https://github.com/anaisbetts/mcp-installer):** Works end-to-end for **writing config**. Natural-language prompts ("install filesystem MCP server") trigger config edits. README does NOT claim mid-session availability. Community pairs with `non-dirty/mcp-server-restart` so Claude Desktop restarts itself. UX is "conversational install, conversation ends, open new conversation."
- **DXT (Desktop Extensions):** One-click install for Claude Desktop — user-driven, not agent-driven
- **Claude Code plugin marketplace:** Closer to "agent installs MCP" (agent can run `/plugin install`) but still needs session restart

---

## OS-level escape hatches

- **`launchctl` / `systemd` signal to reload:** None of the 7 harnesses document a reload signal (e.g., `SIGHUP`) for MCP config
- **Kill + respawn:** Agent bash can `kill` parent harness, but terminates conversation — not self-install, self-destruct with config persisted
- **`mcp-server-restart` package:** Uses AppleScript to quit + relaunch Claude Desktop. Works, but loses conversation

---

## Cross-harness pattern

**Best-possible generalizable UX today:** **Two-conversation flow** — conv 1 = install, conv 2 = use. With a project CLAUDE.md/AGENTS.md/.cursor/rules steering conv-2 automatically into task resumption.

**Hard wall per harness:** None of Claude Code / Codex / Cursor CLI treat MCP registration as a runtime-mutable session-scoped concept. All three lazy-load server set at session start from disk config.

**Only real escape:** Cursor Extension API path, gated on pre-installed extension. Not a general pattern.

---

## Bottom line

- **Which harnesses support genuine runtime MCP self-install today?** **Exactly one partial case: Cursor Desktop via pre-installed extension calling `vscode.cursor.mcp.registerServer()`.** Every other harness requires session or app restart before new server is usable.
- **Which require restart/rerun?** All 7 for the general case. Claude Code + Codex explicitly "not planned" or "open feature request" on hot-reload. Cursor CLI has no `add` verb at all.
- **Is the "agent installs MCP during first conversation" paradigm viable across the 7?** **No — not today, not as a single-conversation flow.**

**Viable degraded patterns:**
1. **Two-conversation flow:** conv 1 = install (agent writes config), conv 2 = use. Ship bootstrap doc (CLAUDE.md / AGENTS.md / .cursor/rules) so conv 2 is automatic.
2. **DXT/plugin one-click:** user-initiated not agent-initiated, but closest to "frictionless first-use"
3. **Cursor Extension + `registerServer()`:** only one-conversation path, gated on prior extension install — flips bootstrap problem from MCP to extension

**Strategic note:** This is a known gap every vendor tracks (open feature requests across all three). If the paradigm matters, betting on it becoming available within 6-12 months is reasonable; building on current state requires accepting the two-conversation flow as baseline UX.

---

## Gaps / UNCERTAIN

- **Cursor `registerServer()` session persistence** — docs silent on whether registration survives restart or is lost
- **Claude Cowork research-preview status** — MCP registration semantics inside VM vs host may evolve
- **MCP spec dynamic-registration proposals** — no clear 2026 RFC for "session-scoped server add-to-running-client." `tools/list_changed` covers within-server tool churn, not new-server registration
- **Claude Code Desktop path through VS Code `registerMcpServerDefinitionProvider`** — unverified whether Anthropic's extension publishes `onDidChangeMcpServerDefinitions` events

---

## Sources (all accessed 2026-04-18)

- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Claude Code #46426 — hot-reload MCP without restart (open)](https://github.com/anthropics/claude-code/issues/46426)
- [Claude Code #18174 — plugin hot-reload](https://github.com/anthropics/claude-code/issues/18174)
- [Claude Code #32399 — plugin hot-reload FR](https://github.com/anthropics/claude-code/issues/32399)
- [Claude Code #28310 — marketplace default plugins](https://github.com/anthropics/claude-code/issues/28310)
- [Claude Code #13646 — list_changed not refreshed](https://github.com/anthropics/claude-code/issues/13646)
- [Claude Code plugins reference](https://code.claude.com/docs/en/discover-plugins)
- [Anthropic DXT announcement](https://www.anthropic.com/engineering/desktop-extensions)
- [Codex MCP docs](https://developers.openai.com/codex/mcp)
- [Codex config reference](https://github.com/openai/codex/blob/main/docs/config.md)
- [Codex #7767 — reload MCP server (NOT PLANNED)](https://github.com/openai/codex/issues/7767)
- [Codex #7318 — dynamic reload on 401](https://github.com/openai/codex/issues/7318)
- [Codex #13056 — per-project MCP config](https://github.com/openai/codex/issues/13056)
- [Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)
- [Cursor MCP docs](https://docs.cursor.com/en/context/mcp)
- [Cursor MCP Extension API](https://cursor.com/docs/context/mcp-extension-api)
- [Cursor CLI MCP docs](https://cursor.com/docs/cli/mcp)
- [Cursor #3887 — ReloadClient bug on mcp.json modify](https://github.com/cursor/cursor/issues/3887)
- [Cursor forum #148397 — CLI does not detect MCP settings](https://forum.cursor.com/t/cursor-cli-does-not-detect-mcp-settings/148397)
- [Cursor forum #133031 — registerMcpServerDefinitionProvider parity req](https://forum.cursor.com/t/support-vs-codes-register-mcp-server-definition-provider-api/133031)
- [anaisbetts/mcp-installer README](https://github.com/anaisbetts/mcp-installer)
- [non-dirty/mcp-server-restart](https://github.com/non-dirty/mcp-server-restart)
- [VS Code MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
