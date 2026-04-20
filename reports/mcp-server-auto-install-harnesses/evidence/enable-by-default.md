# Evidence: Enable-by-Default Behavior Across 7 Harnesses

**Dimension:** Dim 8 (trust/confirmation gates) — deep dive on "is an MCP server live immediately after config-file-write / CLI add, or does it need a separate activation step?"
**Date:** 2026-04-18 (follow-up pass)
**Sources:** Vendor docs + GitHub issue trackers + Cursor forum (community, flagged where used)

**Vendor-bias flag:** Anthropic + OpenAI + Cursor docs describe their own behavior; corroboration came from GitHub issues and community forum posts where official docs are silent.

---

## Summary matrix

| Harness | File-write → live? | CLI-add → live? | Activation step if NOT | Confidence |
|---------|-------------------|------------------|------------------------|------------|
| Claude Code terminal — user scope | YES | YES | — | INFERRED |
| Claude Code terminal — local scope | YES | YES | — | INFERRED |
| Claude Code terminal — project (`.mcp.json`) | **NO** — trust prompt on first session | **NO** — same | **Scriptable:** pre-stage `.claude/settings.local.json` with `enabledMcpjsonServers: ["<name>"]` | CONFIRMED |
| Claude Code Desktop ("Code tab") | Same as CLI (shared `~/.claude.json`) | Same | Same | INFERRED |
| Claude Cowork (local-agent-mode tab) | YES (server connects) — **but** per-tool approvals required every session (bug #24433) | N/A (no CLI) | Per-tool "Always allow" clicks; NOT persisted | CONFIRMED |
| Codex terminal | YES (`enabled` defaults true) | YES | — | INFERRED (issue #16439 language) |
| Codex desktop | Same as CLI (shared TOML) | Same | Same | INFERRED |
| Cursor CLI (`cursor-agent`) | **NO** — state stored separately | **NO** — same | **Scriptable:** `cursor-agent mcp enable <id>` | CONFIRMED |
| Cursor Desktop | **YES by default** on fresh workspace (community report) | Same | User toggle in Settings if disabled | CONFIRMED (community), UNCERTAIN (no vendor doc) |

---

## Key per-harness details

### Claude Code terminal — project scope (`.mcp.json`)
**Confidence:** CONFIRMED
**Evidence:** [anthropics/claude-code issue #9189](https://github.com/anthropics/claude-code/issues/9189)

> "Approval prompt appears: 'This project wants to use MCP servers: [list]. Approve?' On approval, `.claude/settings.local.json` is automatically created with enabled servers."

**Scriptable bypass:** Pre-stage `.claude/settings.local.json` with:
```json
{
  "enabledMcpjsonServers": ["<name>"]
}
```
This is the same file the prompt would have created — writing it preemptively eliminates the TTY gate.

**Known bug:** [Issue #12227](https://github.com/anthropics/claude-code/issues/12227) — trust prompt accepted but not persisted across sessions; "workspace trust not accepted" in debug logs even after approval.

### Claude Cowork — per-tool approval does NOT persist across sessions
**Confidence:** CONFIRMED
**Evidence:** [anthropics/claude-code issue #24433](https://github.com/anthropics/claude-code/issues/24433)

> Every new Cowork session starts with blank `enabledMcpTools: {"":true}` in `~/Library/Application Support/Claude/local-agent-mode-sessions/`. "Always allow" is never written back — per-tool click required per session.

**Implication:** Cowork is the worst-case harness for non-interactive install. A server can be installed via file-write but remains per-tool-gated on every session start. The requested `alwaysAllow` field in `claude_desktop_config.json` is proposed but not implemented.

**Updates the earlier finding** (from initial pass) that Cowork stdio bridge works "if bug #26259 doesn't block." The fuller story is: even if the bridge works, per-session per-tool approvals make it effectively not headless.

### Codex — `enabled` defaults to true when omitted
**Confidence:** INFERRED (strongly)
**Evidence:** [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference), [openai/codex issue #16439](https://github.com/openai/codex/issues/16439)

Config reference describes `mcp_servers.<id>.enabled` as optional boolean that "Disable[s] an MCP server without removing its configuration" — framing implies default is true.

Issue #16439 ("Add `codex mcp enable|disable` subcommands") confirms:
> "Toggling an MCP server on or off currently requires manually editing `~/.codex/config.toml`" with `enabled = true|false`. The `enabled` boolean field already exists in `RawMcpServerConfig`.

The feature request exists precisely *because* there is no enable/disable CLI verb — users rely on `add`'s default-enabled behavior.

**Scriptable explicit enable:** Set `enabled = true` in TOML or pass `-c 'mcp_servers.<name>.enabled=true'`.

### Cursor CLI — explicit `agent mcp enable <id>` required
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/cli/mcp](https://cursor.com/docs/cli/mcp)

Documented subcommands: `agent mcp list`, `list-tools`, `login`, **`agent mcp enable <identifier>`**, `agent mcp disable <identifier>`. The existence of the explicit `enable` verb confirms CLI-add (via file-write) does not auto-activate.

### Cursor Desktop — default enabled on fresh workspace; state in `state.vscdb` SQLite
**Confidence:** CONFIRMED (community); UNCERTAIN (no vendor primary)
**Evidence:**
- [forum.cursor.com #141009 (Dean Rie, Nov 5, 2025)](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009) — "when you open an empty Cursor window (no project), all MCP servers default to enabled"
- [forum.cursor.com #135172 (feature request)](https://forum.cursor.com/t/consider-having-all-mcp-servers-disabled-by-default-instead-of-enabled/135172) — asks to flip the default to disabled, confirming current = enabled
- [forum.cursor.com #133385](https://forum.cursor.com/t/disabled-tools-in-mcp/133385) — "The MCP config itself does not have it, it only has the config for connecting to the MCP… but nothing about enabled/disabled tools"

**Storage:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite). Per-workspace. Opening a new workspace resets state to enabled-by-default.

**Restart bugs:** Multiple reports (#141009, #129256, #132123) of disabled servers re-enabling after restart. `state.vscdb` persistence is unreliable. Pre-staging via SQLite write is theoretically possible but brittle.

---

## Cross-harness observations (new from this probe)

1. **Two distinct friction axes worth distinguishing:**
   - *Server-connect gating* — does the server process start? Is it in the tool catalog? **Cursor CLI is the only harness with an explicit CLI-level gate.**
   - *Per-tool-call approval* — does the user click approve each tool invocation? **Cowork re-prompts every session; Claude Desktop main has persistent "Always allow"; Claude Code has its own permission model.**

2. **Storage divergence matters for headless scripting:**
   - Codex: enable state **in-config** (scriptable TOML field)
   - Claude Code user/local: in-config
   - Claude Code project: separate `.claude/settings.local.json` (scriptable via file-write)
   - Cowork: session-state `~/Library/Application Support/Claude/local-agent-mode-sessions/` (per-session, not pre-stageable per #24433)
   - Cursor: out-of-config in `state.vscdb` SQLite (CLI verb required; DB writes brittle)

3. **"Config-file-write = live" for 5 of the 9 configurations above.** The exceptions:
   - Claude Code project scope (bypassable)
   - Cursor CLI (requires enable verb)
   - Cursor Desktop from the user's *intent* perspective (re-enable race defeats persisted disables)
   - Cowork (per-tool re-approval every session)

4. **The Cowork per-tool-approval bug is the biggest surprise** — it makes Cowork effectively unusable for non-interactive install even when the config-level bridge works.

---

## Gaps / still UNCERTAIN

1. **Codex `enabled` default in Rust source.** Could not fetch the `RawMcpServerConfig` struct directly; default is strongly inferable from issue #16439 language but a `#[serde(default = "…")]` quote from `codex-rs/core/src/config/mod.rs` would upgrade CONFIRMED.
2. **Cursor Desktop default state from vendor primary source.** All evidence is community forum — accurate but not primary.
3. **Claude Code Desktop "Code tab" vs CLI empirical parity.** Assumed identical; no Anthropic doc confirms fresh-install behavior matches.
4. **Cursor CLI enable-state storage location.** The `agent mcp enable` verb's persistence target is undocumented — likely `~/.cursor/…` but not confirmed.

---

## References (all accessed 2026-04-18)

- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference)
- [Codex MCP docs](https://developers.openai.com/codex/mcp)
- [openai/codex issue #16439 — Add `codex mcp enable|disable` subcommands](https://github.com/openai/codex/issues/16439)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [anthropics/claude-code issue #9189 — Project-scoped MCP approval prompt](https://github.com/anthropics/claude-code/issues/9189)
- [anthropics/claude-code issue #24433 — Cowork "Always allow" persistence](https://github.com/anthropics/claude-code/issues/24433)
- [anthropics/claude-code issue #12227 — workspace trust not persisting](https://github.com/anthropics/claude-code/issues/12227)
- [modelcontextprotocol.io — Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Cursor MCP docs](https://cursor.com/docs/context/mcp)
- [Cursor CLI MCP docs](https://cursor.com/docs/cli/mcp)
- [forum.cursor.com #141009 — Disabled MCP re-enables on restart](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)
- [forum.cursor.com #135172 — Feature req: disabled by default](https://forum.cursor.com/t/consider-having-all-mcp-servers-disabled-by-default-instead-of-enabled/135172)
- [forum.cursor.com #133385 — Disabled tools in MCP storage location](https://forum.cursor.com/t/disabled-tools-in-mcp/133385)
