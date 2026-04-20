# Evidence: Deep-link Install Schemes + Cross-Harness Registries/Installers

**Dimension:** Dim 4 (deep-link / one-click install URIs) + Dim 10 (cross-harness install tooling / registries)
**Date:** 2026-04-18
**Sources:** Vendor docs (Cursor, VS Code, Anthropic), OSS repos (Smithery, add-mcp, mcp-get, MCPB), MCP Registry, security advisories

**Vendor-bias flags:**
- Smithery is a commercial startup — client-support claims marketing-tinged; verified against their CHANGELOG and README
- `add-mcp` is a Neon (database vendor) marketing artifact — 156 stars; repo inspection corroborates functionality

---

## Part A — Deep-link install URI schemes

### Cursor: `cursor://anysphere.cursor-deeplink/mcp/install`
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/context/mcp/install-links](https://cursor.com/docs/context/mcp/install-links), [GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv)

- **Target harness(es):** Cursor Desktop only (Cursor CLI has no deep-link handler)
- **URI format:** `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG`
- **`config` encoding:** URL-safe base64 of `JSON.stringify({command, args, env})` (stdio) OR `{url, headers?}` (HTTP/SSE)
- **What happens on click:** Opens Cursor Desktop → confirmation dialog showing server name + config → user clicks "Install" → server appended to global `~/.cursor/mcp.json`
- **Non-interactive potential:** **NO.** `open "cursor://..."` on macOS focuses Cursor but still surfaces the modal. A May-2026 security advisory (`GHSA-r22h-5wp2-2wfv`) hardened the dialog to always display full args — the UI gate is now treated as a security surface, not optional.
- **Schema:** Same as `.cursor/mcp.json` entry
- **Known issues:** On Debian the scheme handler itself is reported broken ([forum thread 114195](https://forum.cursor.com/t/cant-install-mcp-servers-with-deeplinks-on-debian/114195)); URL max 8000 chars

### VS Code: `vscode:mcp/install` / `vscode-insiders:mcp/install`
**Confidence:** CONFIRMED (out of scope for our 7 but relevant as template Cursor copied)
**Evidence:** [code.visualstudio.com/api/extension-guides/ai/mcp](https://code.visualstudio.com/api/extension-guides/ai/mcp), [den.dev/blog/vs-code-mcp-install-consent](https://den.dev/blog/vs-code-mcp-install-consent/)

- **URI format:** `vscode:mcp/install?${encodeURIComponent(JSON.stringify({name, command, args, env}))}` — URL-encoded JSON, not base64 (shape difference from Cursor)
- **What happens on click:** Opens VS Code → consent dialog → writes to user profile `mcp.json`
- **CLI equivalent:** `code --add-mcp '<json>'` — still shows prompt
- **Non-interactive potential:** NO; consent prompt mandatory

### Claude Desktop / Claude Code: `claude://` — NONE FOR MCP INSTALL
**Confidence:** CONFIRMED (negative)
**Evidence:** [Issue #26952 (closed "not planned")](https://github.com/anthropics/claude-code/issues/26952), [anthropic.com/engineering/desktop-extensions](https://www.anthropic.com/engineering/desktop-extensions)

Anthropic has not shipped a `claude://mcp/install` deep-link. Claude Desktop's Electron shell doesn't forward custom URL schemes at all. Claude Desktop "one-click install" is MCPB file-open (double-click), not a URI scheme. Claude Cowork relies on the same `claude_desktop_config.json`; no separate Cowork URI exists.

### Codex: `codex://` — NO MCP-INSTALL PATH
**Confidence:** CONFIRMED (negative)
**Evidence:** [developers.openai.com/codex/llms-full.txt](https://developers.openai.com/codex/llms-full.txt)

`codex://` exists with paths: `settings`, `skills`, `automations`, `threads/<id>`, `new`. **No `codex://mcp/install?...`** analogue.

### Universal / cross-harness URI scheme — NONE EXISTS
**Confidence:** CONFIRMED
**Evidence:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)

The MCP Registry spec (v0.1 frozen 2025-10-24) standardizes server **metadata** via REST+OpenAPI, not a launch URI. Each harness owns its own scheme or has none.

---

## Part B — Cross-harness registries & installers

### Smithery (`@smithery/cli`, smithery.ai)
**Confidence:** CONFIRMED (supports Cursor + Codex + Claude Desktop programmatically); UNCERTAIN on Claude Code terminal vs Desktop disambiguation
**Evidence:** [github.com/smithery-ai/cli](https://github.com/smithery-ai/cli), [smithery.ai/docs/concepts/cli](https://smithery.ai/docs/concepts/cli), [CHANGELOG](https://github.com/smithery-ai/cli/blob/main/CHANGELOG.md)

**What:** Commercial MCP registry + CLI installer.
**Install command:** `npx @smithery/cli install <server> --client <name> [--config '<json>']`

| Harness | Supported | Mechanism | Notes |
|---------|-----------|-----------|-------|
| Claude Code terminal | PARTIAL | config-write | `claude` target routes to Desktop config, not `~/.claude.json` |
| Claude Code Desktop | YES (`--client claude`) | config-write to `claude_desktop_config.json` | Actually writes the Chat/Cowork config |
| Claude Cowork desktop | NO | — | No distinct target; inherits via Desktop |
| Codex terminal | YES | config-write to `~/.codex/config.toml` | TOML support added per CHANGELOG |
| Codex desktop | INFERRED YES | config-write | Same TOML |
| Cursor CLI | YES (`--client cursor`) | config-write | Shared `~/.cursor/mcp.json` |
| Cursor desktop | YES | config-write | Same file |

- **Non-interactive:** YES — `--config '<json>'` skips prompts; `--client` flag required
- **Maturity:** 675 stars, v4.8.1 released 2026-04-16, active
- **Limitation:** No explicit "Claude Code terminal" target. Cowork not addressed directly.

### mcp-get (`michaellatman/mcp-get`) — DEPRECATED
**Confidence:** CONFIRMED (archived)
**Evidence:** [github.com/michaellatman/mcp-get](https://github.com/michaellatman/mcp-get)

- Early MCP installer, npm-distributed
- Supported matrix: Claude Desktop only (explicit)
- **Archived.** README recommends Smithery instead.

### DXT / MCPB (`modelcontextprotocol/mcpb`, formerly `anthropics/dxt`)
**Confidence:** CONFIRMED
**Evidence:** [github.com/modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb), [desktopextensions.com](https://www.desktopextensions.com/), [support.claude.com/articles/12922929](https://support.claude.com/en/articles/12922929-building-desktop-extensions-with-mcpb)

- **What:** `.mcpb` (formerly `.dxt`) zip-bundle spec — server code + `manifest.json`, install by double-click
- **Supported matrix:** Claude Desktop primary (Chat tab); Claude Cowork inherits via SDK bridge. Spec is open but no other harness ships a loader today.
- **Install mechanism:** File-association / UI. **Programmatic install via CLI `--install` flag not documented.**
- **Non-interactive:** NO from user perspective. Bundle authoring (`mcpb pack`) is scriptable; install into Claude Desktop is a UI action.
- **Maturity:** 1.8k stars, v2.1.2 released 2025-12-04. Active. Move from `anthropics/dxt` to `modelcontextprotocol/mcpb` org signals standardization intent.

### `add-mcp` (`neondatabase/add-mcp`) — the most headless-friendly cross-harness installer
**Confidence:** CONFIRMED
**Evidence:** [github.com/neondatabase/add-mcp](https://github.com/neondatabase/add-mcp), [neon.com/blog/add-mcp](https://neon.com/blog/add-mcp)

- **What:** OSS cross-harness installer — `npx add-mcp <url> -a <agent>` detects installed agents and writes each's native config

| Harness | Supported |
|---------|-----------|
| Claude Code terminal | YES (`claude-code`) |
| Claude Code Desktop | YES (`claude-desktop`) |
| Claude Cowork | INFERRED via `claude-desktop` (same config path) |
| Codex terminal | YES (`codex`) |
| Codex desktop | INFERRED YES (shared TOML) |
| Cursor CLI | YES via `cursor` (shared `mcp.json`) |
| Cursor desktop | YES (`cursor`) |

- **Non-interactive:** **YES** — `-y, --yes` flag skips all prompts. The closest thing in the ecosystem to a true "install to all my tools" scripted installer.
- **Maturity:** 156 stars, 123 commits, TypeScript — active but not broadly adopted (Neon marketing artifact)
- **Limitations:** No deep-link UI; purely CLI-driven. Must be run on target machine with npx available.

### Cursor MCP Directory (`cursor.com/mcp` / cursormcp.com)
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/context/model-context-protocol](https://cursor.com/docs/context/model-context-protocol)

- Cursor's curated in-docs directory + third-party `cursormcp.com`
- Each entry has "Add to Cursor" button emitting `cursor://anysphere.cursor-deeplink/mcp/install?...`
- Cursor Desktop only (CLI shares config but no deep-link handler)

### MCP Registry (`registry.modelcontextprotocol.io`)
**Confidence:** CONFIRMED
**Evidence:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/), [blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/), [github.com/modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)

- **Community-owned MCP server catalog.** API-driven, OpenAPI spec published. Contributors: Anthropic, GitHub, PulseMCP, Microsoft
- **Install mechanism:** **None in-registry** — metadata-only. Harnesses/installers query it and write config themselves
- **Non-interactive:** N/A (read API is scriptable; no install flow)
- **Maturity:** v0.1 API frozen 2025-10-24, preview status, GA pending
- VS Code Insiders is the most aggressive adopter of "install from registry" flows — still shaky ([issue #276579](https://github.com/microsoft/vscode/issues/276579))

### In-product curated directories
**Confidence:** CONFIRMED
**Evidence:** [gentoro.com/blog/what-is-anthropics-new-mcp-registry](https://www.gentoro.com/blog/what-is-anthropics-new-mcp-registry)

- **Anthropic Claude directory:** In-product only (Claude Desktop Settings → Extensions). Not a separate `mcp.anthropic.com` endpoint.
- **OpenAI:** NONE. Codex docs reference MCP servers by example; no curated index.
- **Cursor:** `cursor.com/mcp` + community `cursormcp.com`.

### Community alternatives (lower maturity)
- `anaisbetts/mcp-installer` — MCP server that installs other MCP servers via tool call; conversational, not OS-scriptable
- `cursor-mcp-installer` (matthewdcage) — Cursor-only git-URL-driven
- Universal MCP Installer (branded web dashboard claiming 6 clients) — UNCERTAIN, no verified repo
- **Glama** (glama.ai/mcp/servers) — 21,740+ server index, no installer
- **PulseMCP** (pulsemcp.com) — 12,860+ index, no installer

---

## Cross-harness observations

1. **State of the art is fragmented.** Every harness ships its own CLI: `claude mcp add`, `codex mcp add`, `cursor agent mcp` (limited — no `add`), `code --add-mcp`. No common launch URI. The only two OSS tools attempting true cross-harness install:
   - **`add-mcp` (Neon)** for scripted multi-agent writes
   - **Smithery** for registry-backed per-client installs

   Both operate by writing native config files, not by triggering harness UIs.

2. **Deep-links require human clicks by design.** Cursor's 2026 security advisory locked down the install dialog. VS Code's consent prompt is deliberate. `open <uri>` can focus a harness but never complete install unattended. **For programmatic one-shot installs, config-file-write is the only path.**

3. **Harness coverage ranked by 3rd-party tool support:**
   - Best-covered: **Cursor Desktop** (deep-link + directory + Smithery + add-mcp), **Claude Code Desktop** (MCPB + Smithery + add-mcp)
   - Well-covered: **Codex terminal** (Smithery + add-mcp + CLI), **Cursor CLI** (add-mcp + shared config), **Claude Code terminal** (add-mcp + CLI)
   - Underserved: **Codex desktop** (inferred-only via shared TOML), **Claude Cowork** (no direct target; inherits Desktop config)

4. **The MCP Registry is an index, not an installer.** GA pending. VS Code Insiders is the most aggressive "install from registry" adopter. No other harness in our 7 pulls from it directly as of 2026-04-18.

5. **DXT/MCPB is Claude-specific and UI-only.** Spec is open for adoption; no other harness implements a loader. The `.dxt` → `.mcpb` rename + move to `modelcontextprotocol` org (Dec 2025) signals intent to standardize.

---

## Gaps / follow-ups

- Claude Cowork dedicated install path distinct from Desktop config bridging — no authoritative source confirms one exists. A 2026-01 dev.to post treats Desktop-config-bridging as a workaround
- Smithery `list clients` runtime output (20-client listing) not directly verified against 4.8.1 binary
- Codex desktop MCP install UX not documented publicly — treated as "same config.toml as CLI" without confirmation
- Universal MCP Installer (6-client web dashboard) repo/authoritative source not found
- Cursor CLI (`cursor agent mcp`) has `list / list-tools / login / enable / disable` but no `add` — CLI-only machines rely on direct file-write
