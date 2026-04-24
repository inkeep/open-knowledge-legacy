# Evidence: Cursor Harnesses (CLI + Desktop)

**Dimension:** Cursor CLI (`cursor-agent`) and Cursor Desktop App — install surfaces
**Date:** 2026-04-18
**Sources:** docs.cursor.com, cursor.com/blog, Cursor forum, third-party guides (TrueFoundry, aiengineerguide, Corcava)

---

## Key sources

- [Cursor — MCP (context)](https://cursor.com/docs/context/mcp) — canonical MCP config reference
- [Cursor — MCP for CLI](https://cursor.com/docs/cli/mcp) — `agent mcp` subcommands, `--approve-mcps`
- [Cursor — MCP Install Links](https://cursor.com/docs/context/mcp/install-links) — deep-link spec
- [Cursor — Deeplinks](https://cursor.com/docs/integrations/deeplinks) — URI scheme registration
- [Cursor — CLI Installation](https://cursor.com/docs/cli/installation) — `cursor-agent` binary install
- [Cursor — Agent CLI blog](https://cursor.com/blog/cli) — CLI launch announcement
- [aiengineerguide TIL — One-Click MCP Install with Cursor Deeplinks](https://aiengineerguide.com/til/cursor-mcp-deeplink/)
- [Cursor forum — Disabled MCP servers re-enabled after restart](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009) — community, UNCERTAIN
- [Cursor forum — DXT extension support request](https://forum.cursor.com/t/support-for-custom-dxt-extension-in-cursor-ai/122935) — community, confirms no DXT
- [Cursor forum — Can't install MCP with deeplinks on Debian](https://forum.cursor.com/t/cant-install-mcp-servers-with-deeplinks-on-debian/114195) — edge-case, community
- [TrueFoundry — MCP Servers in Cursor 2026 Guide](https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide) — third-party corroboration

**Vendor-bias flag:** All primary-source material is Cursor/Anysphere-authored. Third-party sources corroborate config shape + deep-link behavior but none independently tested.

---

## Findings

### Finding 1: Cursor CLI and Desktop share one config surface
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP for CLI](https://cursor.com/docs/cli/mcp)

> "MCP in the CLI uses the same configuration as the editor."

Both read `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (user-global) with identical schemas and precedence (project → global → nested).

**Implication:** One file-write installs into both. Reduces the Cursor install surface to a single target file regardless of which interface the user is on.

### Finding 2: No `mcp add` CLI subcommand; install is file-write-driven
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP for CLI](https://cursor.com/docs/cli/mcp)

The `agent mcp` command group exposes: `list`, `list-tools <id>`, `login <id>`, `enable <id>`, `disable <id>`. **No `add` / `install` subcommand exists.**

Install-time non-interactive flag: `agent --approve-mcps` auto-approves all MCP servers (skips tool-call prompts at runtime).

**Implication:** Cursor does not match Claude Code's `claude mcp add` or Codex's `codex mcp add` ergonomics. Programmatic install relies on direct `.cursor/mcp.json` editing.

### Finding 3: Minimal stdio + HTTP config shapes
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP](https://cursor.com/docs/context/mcp)

stdio:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "mcp-server"],
      "env": { "API_KEY": "${env:MY_KEY}" }
    }
  }
}
```

HTTP/SSE:
```json
{ "mcpServers": { "asana": { "url": "https://mcp.asana.com/mcp" } } }
```

Interpolation supported: `${env:NAME}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`.

### Finding 4: All 3 MCP transports supported (stdio, SSE, streamable HTTP)
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP](https://cursor.com/docs/context/mcp)

Cursor is one of the broadest-transport-supporting harnesses. Same schema asymmetry as every MCP client: `command`+`args`+`env`+`envFile` for stdio vs. `url`+`headers`+`auth` for remote.

### Finding 5: Deep-link install spec — `cursor://anysphere.cursor-deeplink/mcp/install`
**Confidence:** CONFIRMED for URI format; NOT FOUND for scope destination
**Evidence:** [Cursor — MCP Install Links](https://cursor.com/docs/context/mcp/install-links), [aiengineerguide TIL](https://aiengineerguide.com/til/cursor-mcp-deeplink/)

Format: `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG`

- `config` = `base64(JSON.stringify(configObj))` where `configObj` matches an `mcp.json` entry
- Example: `cursor://anysphere.cursor-deeplink/mcp/install?name=Asana&config=eyJ1cmwiOiJodHRwczovL21jcC5hc2FuYS5jb20vbWNwIn0=` decodes to `{"url":"https://mcp.asana.com/mcp"}`
- URL max length: 8000 chars
- Docs explicitly state: **"Cursor prompts to install the server"** — one-click install still requires a user confirmation click
- Desktop-only — `cursor-agent` CLI does not register/respond to the `cursor://` scheme
- Whether target is user vs. project `mcp.json` is **not documented**

**Implication:** Deep-links reduce install friction to "one click in the OS default browser" but cannot be fully non-interactive. For a headless installer without the Cursor app running, deep-links are not a path.

### Finding 6: No DXT-equivalent / packaged-extension manifest for Cursor
**Confidence:** CONFIRMED (as absent)
**Evidence:** [Cursor forum — DXT support request](https://forum.cursor.com/t/support-for-custom-dxt-extension-in-cursor-ai/122935)

Community forum thread explicitly asks for DXT (`.dxt` / `.mcpb`) support in Cursor; no staff response indicating it's planned. JSON-file-write + deep-link remain the only documented install paths.

### Finding 7: Two UI gates per install — Settings toggle + per-tool approval
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP](https://cursor.com/docs/context/mcp)

After install (file-write or deep-link):

1. **Enable toggle:** Server appears in Settings → Tools & MCP and must be toggled on (unless already enabled in a prior workspace)
2. **Tool-call approval:** "By default, when Agent wants to use an MCP tool, it will display a message asking for your approval."

Both gates overridable:
- CLI: `agent --approve-mcps` (per-run, auto-approves all)
- Desktop: `~/.cursor/permissions.json` pre-staged for auto-run

**Implication:** For fully-scripted desktop install, `permissions.json` must be pre-staged in the same installer step; otherwise first-run requires two clicks minimum.

### Finding 8: Enable/disable state lives in a per-workspace database, not in `mcp.json`
**Confidence:** UNCERTAIN (community source; staff have not confirmed in primary docs)
**Evidence:** [Cursor forum thread 141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)

> "The disabled/enabled state is stored per workspace in the database, not globally."

Community report of a bug: disabled servers re-enable across workspace restarts. **Implication for programmatic install:** a file-write can add the server entry but cannot reliably pre-set enabled state on first desktop launch. Only CLI has a scriptable `agent mcp enable <id>` equivalent.

### Finding 9: Hot-reload UNCERTAIN; community says restart required
**Confidence:** UNCERTAIN
**Evidence:** [Corcava troubleshooting note](https://corcava.com/docs/mcp-troubleshooting-cursor-wont-reload) (community)

> "Cursor only reads the MCP configuration file on startup, simply saving the file isn't enough — you need to restart or reload."

No primary-source confirmation of file-watcher behavior. An installer would need to prompt the user to reload Cursor after writing the file.

### Finding 10: `cursor-agent` CLI install path + detection
**Confidence:** CONFIRMED
**Evidence:** [Cursor — CLI Installation](https://cursor.com/docs/cli/installation)

Shell install:
```bash
curl https://cursor.com/install -fsS | bash
```
Default binary path: `~/.local/bin/cursor-agent`. Windows PowerShell: `irm 'https://cursor.com/install?win32=true' | iex`. Auto-updates on by default; `agent update` forces upgrade.

**Detection:** `which cursor-agent` / `where.exe cursor-agent` + presence of `~/.cursor/`. Desktop app detection: `/Applications/Cursor.app` (macOS), `%LOCALAPPDATA%\Programs\Cursor\Cursor.exe` (Windows), AppImage/`.deb` on Linux.

### Finding 11: Uninstall / update
**Confidence:** CONFIRMED
**Evidence:** [Cursor — MCP](https://cursor.com/docs/context/mcp)

Per-MCP-server uninstall: delete the entry from `mcp.json`, or `agent mcp disable <id>` to deactivate without removing. Desktop auto-updates via Electron updater; no per-server versioning surface.

---

## Negative searches / NOT FOUND

- Dedicated `cursor-agent mcp add <name> -- <command>` style CLI subcommand — searched docs.cursor.com CLI pages; does not exist
- Project vs. user scope target for deep-link install — not documented in `install-links` page
- Schema validation / duplicate-key behavior when `.cursor/mcp.json` is ill-formed — not in primary docs
- npm/Homebrew `cursor-agent` distribution paths beyond the `curl|bash` installer — not found

---

## Gaps / follow-ups

- Exact hot-reload behavior on file change — primary-source confirmation needed
- Deep-link install destination (user vs project `mcp.json`) — vendor to clarify
- Whether the per-workspace enable-state persistence bug affects fresh installs — reproducible test needed
- Any differences between `agent` vs. `cursor-agent` binary naming across versions
