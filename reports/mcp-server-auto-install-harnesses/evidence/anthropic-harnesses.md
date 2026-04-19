# Evidence: Anthropic Harnesses (Claude Code CLI + Claude Code Desktop + Claude Cowork)

**Dimension:** Claude Code terminal, Claude Code Desktop tab, Claude Cowork tab — install surfaces
**Date:** 2026-04-18
**Sources:** code.claude.com, support.claude.com, github.com/anthropics, modelcontextprotocol.io

**Vendor-bias flag:** Every primary source cited is Anthropic-operated. No independent third-party corroboration for install-surface behavior was found.

---

## Key sources

- [Connect Claude Code to tools via MCP — code.claude.com](https://code.claude.com/docs/en/mcp)
- [CLI reference — code.claude.com](https://code.claude.com/docs/en/cli-reference)
- [Use Claude Code Desktop — code.claude.com](https://code.claude.com/docs/en/desktop)
- [Desktop quickstart — code.claude.com](https://code.claude.com/docs/en/desktop-quickstart)
- [Getting Started with Local MCP Servers on Claude Desktop — support.claude.com](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Custom connectors with remote MCP — support.claude.com](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [anthropics/mcpb — github.com](https://github.com/anthropics/mcpb) (MCPB / formerly DXT)
- [MCPB manifest spec](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md)
- [Issue #26259 (Cowork stdio bridge)](https://github.com/anthropics/claude-code/issues/26259)
- [Issue #26952 (`claude://` scheme — closed "not planned")](https://github.com/anthropics/claude-code/issues/26952)
- [Connect to local MCP servers — modelcontextprotocol.io](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

---

## Finding 1: The 3 "Anthropic harnesses" collapse to 2 install surfaces
**Confidence:** CONFIRMED
**Evidence:** [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop) — "Shared configuration" section

- **Claude Code Desktop is actually the Code tab** inside one Electron app distributed at `claude.ai/api/desktop/...`. The same app has Chat + Cowork + Code tabs but the Code tab reads a different config from the Chat/Cowork tabs.
- **Claude Cowork is also a tab** inside the same app. It's not a separate binary.
- Install surfaces:
  - **Surface 1 (Code tab + CLI):** `~/.claude.json` + project `.mcp.json`
  - **Surface 2 (Chat + Cowork):** `claude_desktop_config.json` + MCPB bundles

> "MCP servers configured for the Claude Desktop chat app in `claude_desktop_config.json` are separate from Claude Code and will not appear in the Code tab. To use MCP servers in Claude Code, configure them in `~/.claude.json` or your project's `.mcp.json` file."

**Implication:** For programmatic install targeting all 3 "Anthropic harnesses," an installer must write both files. The naming is misleading — the two config files don't share a schema or purpose.

---

## Finding 2: Claude Code CLI has a mature non-interactive install surface
**Confidence:** CONFIRMED
**Evidence:** [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), [MCP docs](https://code.claude.com/docs/en/mcp)

CLI commands (flags MUST precede name; `--` separates name from server command):
```bash
claude mcp add [--transport stdio|sse|http] [--scope local|project|user] \
  [--env K=V ...] [--header "H: v"] <name> -- <command> [args...]
claude mcp add-json <name> '<json>'
claude mcp list
claude mcp get <name>
claude mcp remove <name>
claude mcp reset-project-choices
claude mcp add-from-claude-desktop   # macOS + WSL only, interactive
```

**For strict non-interactive CI usage:** `--mcp-config <file>` + `--strict-mcp-config` flags let a caller ignore all ambient config and load only a specified file.

**Duplicate-name handling:** Re-adding same name with identical transport replaces the entry (idempotent for config, but OAuth tokens persist). Cross-scope duplicates fall back to hierarchy `local > project > user > plugin > claude.ai`.

**Snippet:**
```bash
claude mcp add --transport stdio --env KEY=val myserver -- python server.py --port 8080
```

---

## Finding 3: Stdio / HTTP / SSE config shapes
**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)

Stdio entry:
```json
{"type":"stdio","command":"npx","args":["-y","pkg"],"env":{}}
```
HTTP entry:
```json
{"type":"http","url":"https://mcp.example.com/mcp","headers":{"Authorization":"Bearer x"}}
```
SSE entry (deprecated per spec):
```json
{"type":"sse","url":"..."}
```

Env-var expansion `${VAR}` / `${VAR:-default}` works in `command`, `args`, `env`, `url`, `headers`.

**Transport-level reliability difference:** HTTP/SSE auto-reconnect with exponential backoff (5 attempts); stdio does not auto-reconnect.

**Windows caveat:** Native `npx` must be wrapped as `cmd /c npx ...`.

HTTP can also specify an `oauth` sub-object (`clientId`, `callbackPort`, `scopes`, `authServerMetadataUrl`) or a `headersHelper` (a command printing a JSON header map at connect time; 10s timeout) — useful for rotating tokens.

---

## Finding 4: Project-scope `.mcp.json` has a one-time workspace-trust gate
**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)

Writing a project-scope `.mcp.json` is non-interactive, but the **first** session in that workspace prompts a TTY dialog to approve loading it. `claude mcp reset-project-choices` revokes prior approvals. No documented keyboard/CLI bypass for pre-approving.

**Implication:** Project-scope `.mcp.json` is NOT fully non-interactive on first install.

---

## Finding 5: No `claude://` deep-link scheme for MCP install
**Confidence:** CONFIRMED NEGATIVE
**Evidence:** [Issue #26952 (closed "not planned")](https://github.com/anthropics/claude-code/issues/26952)

Claude Desktop does not register an OS-level `claude://` URI handler. The Electron app's OAuth redirect uses `http://localhost:<port>/callback`, not a custom scheme. Registry-driven "Popular MCP servers" table on the MCP docs page produces `claude mcp add ...` copy-paste commands, not deep-link URIs.

**Implication:** Cursor's `cursor://` install-link model has no Anthropic analogue.

---

## Finding 6: Claude Desktop (Chat / Cowork) uses MCPB bundles for desktop install
**Confidence:** CONFIRMED
**Evidence:** [anthropics/mcpb](https://github.com/anthropics/mcpb), [MCPB manifest spec](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md)

MCPB (formerly DXT) bundle format:
- `.mcpb` = ZIP containing `manifest.json` + server bundle
- `manifest_version: "0.3"`
- Server types: `node`, `python`, `uv`, `binary`
- `user_config` schema lets the bundle prompt for string/number/boolean/file/directory values (with `sensitive: true` masking for secrets)
- Variable substitution: `${__dirname}`, `${HOME}`, `${user_config.KEY}`
- Build chain: `npm install -g @anthropic-ai/mcpb` → `mcpb init` → `mcpb pack`

**Install path:** Settings → Extensions → "Browse extensions" OR double-click a `.mcpb` file → triggers in-app confirmation dialog.

**NOT supported by MCPB:**
- Silent/headless install (no documented CLI or URI flow)
- Installation into Claude Code Desktop (Code tab) — MCPB is scoped to Chat/Cowork only, per docs carve-out

**Trust/signing:** Repo README references verification code but publishes no signature-verification spec. UNCERTAIN whether bundles ship signed today.

---

## Finding 7: Claude Cowork has a known stdio-bridge bug (#26259)
**Confidence:** CONFIRMED (bug exists); UNCERTAIN (current fix status)
**Evidence:** [Issue #26259](https://github.com/anthropics/claude-code/issues/26259)

Claude Cowork runs the agent in a sandboxed cloud/local VM. MCP servers from `claude_desktop_config.json` are bridged into the VM via an SDK proxy layer. Per the issue:

> "The Cowork VM spawner constructs `--mcp-config` arguments, but only includes SDK-type servers"

Stdio Desktop Extensions are NOT reliably bridged into Cowork at issue time. Third-party reports as of 2026-04-18 reference the bug as active; Anthropic has not publicly confirmed a fix.

**Implication:** A stdio MCP server installed via `claude_desktop_config.json` works in Chat but may not work in Cowork. Installer should document this caveat.

---

## Finding 8: Claude Desktop Chat custom-connectors UI (remote MCP only)
**Confidence:** CONFIRMED
**Evidence:** [support.claude.com article 11175166](https://support.claude.com/en/articles/11175166)

Remote MCP servers (HTTP/SSE) install into Chat via Settings → Connectors → "Add custom connector" which takes a URL + optional OAuth. Account-brokered (Anthropic login), not config-file-based. GUI-only — no documented scriptable path.

---

## Finding 9: Bridge command `claude mcp add-from-claude-desktop`
**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference)

One-way interactive import: reads `claude_desktop_config.json` and adds selected servers to the CLI/Code tab's `~/.claude.json`. macOS + WSL only. Interactive picker — not scriptable.

---

## Finding 10: Detection heuristics
**Confidence:** CONFIRMED (CLI); INFERRED (desktop paths)
**Evidence:** [cli-reference](https://code.claude.com/docs/en/cli-reference)

- **CLI:** Binary on PATH as `claude`; `which claude` or `claude --version`. Config dir: `~/.claude.json` or `~/.claude/settings.json`.
- **Desktop app (all tabs):** `/Applications/Claude.app` (macOS), `%LOCALAPPDATA%\Programs\Claude\` (Windows, inferred from Electron install convention). Config dirs: `~/Library/Application Support/Claude/` (macOS), `%APPDATA%\Claude\` (Windows), `~/.config/Claude/` (Linux).
- **No Linux support** for Claude Desktop — Code/Cowork tabs do not exist on Linux.

---

## Finding 11: Update / uninstall
**Confidence:** CONFIRMED
**Evidence:** [cli-reference](https://code.claude.com/docs/en/cli-reference)

- **CLI:** `claude update` for binary; `claude mcp remove <name>` for server entries.
- **MCP-server versioning:** No first-party pinning. Stdio pinned via `args` (e.g. `npx -y @pkg@1.2.3`). HTTP server versioning is external to the harness.
- **MCPB bundles:** Repo README mentions "automatic updates" — mechanism not documented.

---

## Cross-harness observations

- **Two install surfaces, not three.** Code tab = `~/.claude.json` + `.mcp.json`; Chat + Cowork = `claude_desktop_config.json` + MCPB. An installer targeting "all Anthropic harnesses" must write both.
- **Cowork is not an independent install target.** It's a proxy layer over the Chat config, with a known stdio-bridge bug.
- **The Claude Code CLI binary is the cleanest programmatic install path** for Code tab + terminal. For Chat/Cowork, MCPB or direct JSON-write are the only paths, and neither is fully non-interactive for first-time install.
- **No deep-link URI** anywhere in the Anthropic ecosystem for MCP install — contrasts sharply with Cursor.

---

## Negative searches / NOT FOUND

- `claude://` URI handler — confirmed absent (issue #26952 closed "not planned")
- CLI or scriptable path to install a `.mcpb` bundle without user confirmation — not found
- Linux support for any Claude Desktop tab — confirmed absent
- Exit-code semantics for `claude mcp add` — not documented on primary pages
- Signed MCPB verification spec — repo references code but no spec published

---

## Gaps / follow-ups

- Empirical test of `claude mcp add` exit codes and duplicate-name behavior
- Hot-reload semantics when `~/.claude.json` or `.mcp.json` is edited mid-session (docs imply re-read on new session only)
- Current status of Cowork stdio bridge bug (#26259) — needs check
- Whether MCPB bundles can be pre-staged in `~/Library/Application Support/Claude/Extensions/` (or equivalent) to skip the confirmation dialog
