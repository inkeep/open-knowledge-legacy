# Evidence: Transport Support (Stdio / SSE / HTTP) + OAuth Headless Friction

**Dimension:** Dim 5 (transport install-shape) + Dim 7 (OAuth headless friction)
**Date:** 2026-04-18
**Sources:** modelcontextprotocol.io spec, per-harness docs, community forums (flagged as UNCERTAIN)

**Vendor-bias flag:** Each harness's docs describe their own behavior; corroborated where possible with third-party deep-dives (TrueFoundry, Natoma, Den Delimarsky).

---

## Part A — Transport Support Matrix

| Harness | stdio | SSE | Streamable HTTP | Notes |
|---------|-------|-----|-----------------|-------|
| Claude Code terminal | CONFIRMED | CONFIRMED (deprecated) | CONFIRMED | `claude mcp add --transport {stdio\|sse\|http}`; SSE flagged deprecated in docs |
| Claude Code Desktop | CONFIRMED (`claude_desktop_config.json`) | CONFIRMED (native + via `mcp-remote`) | CONFIRMED (via Connectors UI + `"type":"http"`) | Two surfaces: local stdio (JSON) vs remote (Connectors UI) |
| Claude Cowork desktop | CONFIRMED (inherited via SDK bridge) | NOT FOUND as native; supported via supergateway + `"type":"streamable-http"` | CONFIRMED (via project-scope `.mcp.json` inside VM) | Sandboxed VM; host config stdio auto-bridged as `"type":"sdk"` |
| Codex terminal | CONFIRMED | NOT FOUND | CONFIRMED | TOML `[mcp_servers.<n>]` discriminates via `command` vs `url` |
| Codex desktop | CONFIRMED | NOT FOUND | CONFIRMED (via shared config) | GH issues #6465/#7820 report VS Code extension sometimes fails to surface MCPs the CLI sees |
| Cursor CLI | CONFIRMED | CONFIRMED | CONFIRMED | Forum bug #143045: MCP has no effect in `--print` non-interactive mode |
| Cursor desktop | CONFIRMED | CONFIRMED | CONFIRMED | No `type` field; `url` vs `command` duck-types |

### Per-harness HTTP/SSE config shapes

**Claude Code terminal** — explicit `type` discriminator (`~/.claude.json` or `.mcp.json`):
```json
{"mcpServers":{"stripe":{"type":"http","url":"https://mcp.stripe.com"}}}
```
CLI: `claude mcp add --transport http notion https://mcp.notion.com/mcp`
Source: [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)

**Claude Desktop / Cowork** — `claude_desktop_config.json`. Remote URLs **cannot** be first-class entries in most versions — canonical pattern is `mcp-remote` stdio bridge:
```json
{"mcpServers":{"Notion":{"command":"npx","args":["mcp-remote","https://mcp.notion.com/mcp"]}}}
```
Native `"type":"http"` supported only via Settings → Connectors UI (writes state outside the JSON file, handles OAuth interactively).
Sources: [support.claude.com/articles/10949351](https://support.claude.com/en/articles/10949351), [modelcontextprotocol.io/docs/develop/connect-remote-servers](https://modelcontextprotocol.io/docs/develop/connect-remote-servers)

**Codex terminal + desktop + IDE** — TOML at `~/.codex/config.toml`:
```toml
[mcp_servers.my_http_server]
url = "https://api.example.com/mcp"
bearer_token_env_var = "MY_API_TOKEN"
startup_timeout_sec = 10
[mcp_servers.my_http_server.http_headers]
"X-Custom-Header" = "static-value"
[mcp_servers.my_http_server.env_http_headers]
"Authorization" = "AUTH_TOKEN_ENV_VAR"
[mcp_servers.my_http_server.oauth]
scopes = ["scope1","scope2"]
```
Source: [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference)

**Cursor desktop + CLI** — JSON at `.cursor/mcp.json` / `~/.cursor/mcp.json`. No `type` field:
```json
{"mcpServers":{"make":{"url":"https://example.com/mcp","headers":{"Authorization":"Bearer ${env:MCP_TOKEN}"}}}}
```
Source: [cursor.com/docs/mcp](https://cursor.com/docs/mcp)

### SSE deprecation

- **MCP spec 2025-03-26** introduced Streamable HTTP as replacement for HTTP+SSE (protocol version 2024-11-05)
- **2025-06-18 transports page** explicitly calls SSE "deprecated"; legacy `/sse` + POST endpoint is backwards-compat only
- **Claude Code terminal:** Accepts SSE but in-docs warning
- **Cursor:** Accepts both, no deprecation callout in docs
- **Codex:** No SSE in config reference — stdio + Streamable HTTP only
- **Claude Desktop/Cowork:** Routes remote through `mcp-remote` stdio bridge (speaks either)

Source: [modelcontextprotocol.io/specification/2025-06-18/basic/transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

---

## Part B — OAuth / Auth Headless Friction Per Harness

### Claude Code terminal
**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp), [truefoundry.com/blog/mcp-authentication-in-claude-code](https://www.truefoundry.com/blog/mcp-authentication-in-claude-code)

- **Auth modes:** none / bearer-token-in-header / OAuth 2.1 (via `/mcp` interactive slash command)
- **OAuth flow:** Browser round-trip on first connection. Full DCR + PRM + PKCE per 2025-06-18 spec. Supports `--client-id`, `--client-secret`, `--callback-port` overrides
- **Headless install:** **YES with pre-provisioned bearer token** via `--header "Authorization: Bearer ${TOKEN}"`. OAuth flow is NOT headless — requires browser callback
- **Token storage:** macOS keychain (OAuth secrets); credentials file fallback
- **MCP 2025-06-18 OAuth compliance:** CONFIRMED (PRM + DCR + PKCE)

### Claude Code Desktop (Connectors + Desktop app)
**Confidence:** CONFIRMED
**Evidence:** [modelcontextprotocol.io/docs/develop/connect-remote-servers](https://modelcontextprotocol.io/docs/develop/connect-remote-servers), [support.claude.com/articles/11175166](https://support.claude.com/en/articles/11175166)

- **Auth modes:** OAuth 2.1 primary (Connectors UI); bearer via `mcp-remote` args
- **OAuth flow:** Browser redirect from Settings → Connectors. OAuth Client ID/Secret fields are optional overrides when DCR isn't available
- **Headless install:** NO for OAuth connectors (UI mandatory). Bearer tokens can be injected via `args` to `mcp-remote` if pre-provisioned
- **Token storage:** Anthropic-managed (claude.ai side), not user-visible; bridged into Desktop via SDK
- **MCP 2025-06-18 OAuth compliance:** PARTIAL — supports `authServerMetadataUrl` override when PRM discovery fails

### Claude Cowork desktop
**Confidence:** PARTIAL / UNCERTAIN
**Evidence:** [dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) (community)

- **Auth modes:** Inherited from host Claude Desktop config (stdio bridge); `.mcp.json` inside Cowork VM can carry `"type":"streamable-http"` + headers
- **OAuth flow:** Routes through host Claude Desktop — same browser flow
- **Headless install:** PARTIAL — pre-provisioned bearer tokens in host `claude_desktop_config.json` bridge through; OAuth still interactive
- **Token storage:** On host (keychain/config); VM consumes via SDK
- **MCP 2025-06-18 OAuth compliance:** UNCERTAIN — Cowork-specific behavior not separately documented

### Codex terminal
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference), [developers.openai.com/codex/mcp](https://developers.openai.com/codex/mcp)

- **Auth modes:** bearer-via-env (`bearer_token_env_var`), static headers (`http_headers`), env-ref headers (`env_http_headers`), OAuth (`[mcp_servers.X.oauth]` block + `codex mcp login <name>`)
- **OAuth flow:** Browser callback to local port configured via `mcp_oauth_callback_port` / `mcp_oauth_callback_url`
- **Headless install:** **YES for bearer/env-header mode** — pure TOML edit + env var. NO for OAuth — `codex mcp login` requires browser
- **Token storage:** `mcp_oauth_credentials_store = "keyring" | "file" | "auto"`. OS keyring default
- **MCP 2025-06-18 OAuth compliance:** CONFIRMED (DCR + PRM + PKCE via `oauth_resource` parameter per RFC 8707)

### Codex desktop (IDE extension)
Shares config with CLI. Same auth surface. Known defect: GH issues #6465/#7820 — VS Code extension sometimes fails to surface MCPs the CLI sees. MCP 2025-06-18 OAuth compliance inherited from CLI; UNCERTAIN in VS Code-extension surface due to open bugs.

### Cursor CLI (`cursor-agent`)
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/cli/mcp](https://cursor.com/docs/cli/mcp), [forum.cursor.com/t/143045](https://forum.cursor.com/t/cursor-cli-mcp-the-non-interactive-mode-cannot-be-used/143045)

- **Auth modes:** OAuth (via `agent mcp login`), bearer via headers, env var interpolation
- **OAuth flow:** Browser-based on first connection (shared with desktop)
- **Headless install:** PARTIAL — no `mcp add` CLI verb; must pre-write `mcp.json`. **Forum bug #143045: MCP doesn't activate in `--print` non-interactive mode at all**
- **Token storage:** Shared with Cursor desktop (OS keychain / app state)
- **MCP 2025-06-18 OAuth compliance:** PARTIAL — v1.0 (June 2025) shipped DCR + PKCE; forum reports note gaps on `/.well-known/oauth-protected-resource` scope discovery and RFC-7595 redirect URIs

### Cursor desktop
**Confidence:** CONFIRMED
**Evidence:** [cursor.com/docs/mcp](https://cursor.com/docs/mcp), [forum.cursor.com/t/91719](https://forum.cursor.com/t/we-need-cursor-to-support-oauth-flow-for-remote-mcp-servers/91719)

- **Auth modes:** OAuth 2.1 ("one-click install" since v1.0), bearer, static `auth` object for pre-registered OAuth clients, headers, env-var interpolation
- **OAuth flow:** Browser popup; DCR supported. Interactive only
- **Headless install:** YES for bearer (edit `mcp.json` + env vars); NO for OAuth
- **Token storage:** Keychain + app state
- **MCP 2025-06-18 OAuth compliance:** PARTIAL — DCR works; scope discovery from PRM and RFC-7595-compliant redirect URIs reported as gap areas

---

## Part C — Secret Injection Patterns

| Harness | `${ENV_VAR}` interpolation | `--env` flag on CLI | Explicit auth headers in config | Keychain write via CLI |
|---------|---------------------------|----------------------|----------------------------------|--------------------------|
| Claude Code terminal | YES (`${VAR}`, `${VAR:-default}` in command/args/env/url/headers) | YES (`--env KEY=value` on `claude mcp add`) | YES (`--header "Authorization: ..."`) | NO (keychain for OAuth only) |
| Claude Code Desktop | Partial — `env` object in stdio entries; remote URLs via `mcp-remote` args | NO (no install CLI) | YES via `mcp-remote` `--header` args | NO (Connectors UI only) |
| Claude Cowork desktop | Inherited from host | NO | YES via `.mcp.json` inside VM | NO |
| Codex terminal | YES via `env_vars` allowlist + `env_http_headers` pointing to env var names | NO (edit TOML or `codex mcp add -- <cmd>`) | YES (`http_headers` static, `env_http_headers` ref) | YES (implicit via `mcp_oauth_credentials_store="keyring"`) |
| Codex desktop | Same as CLI | NO | Same as CLI | Same as CLI |
| Cursor CLI | YES (`${env:MCP_TOKEN}` in `mcp.json` `headers`) | NO (no `agent mcp add`) | YES (`headers` field on HTTP entries) | NO |
| Cursor desktop | YES (`${env:VAR}`) | NO | YES (`headers`, static `auth` object for OAuth) | NO documented |

---

## Cross-harness observations

1. **Most headless-friendly for bearer-token HTTP MCP install:**
   - Claude Code terminal — single `claude mcp add --transport http --header "Authorization: Bearer ..." ...` writes config atomically, fully scriptable
   - Codex terminal — declarative TOML with `bearer_token_env_var` + `env_http_headers`, fully scriptable

2. **Least headless-friendly:**
   - Cursor CLI — no `add` verb; forum-confirmed bug with `--print` mode
   - Claude Desktop/Cowork — Connectors UI has no scripted equivalent

3. **OAuth browser round-trip is an absolute wall for all seven harnesses.** Every harness that implements MCP OAuth 2.1 follows the spec's authorization-code-with-PKCE redirect flow. None ship device-code or pre-provisioned refresh-token pathways. The 2025-06-18 spec permits DCR to eliminate pre-registered `client_id` friction, but user consent is inherently browser-bound.

4. **Secret injection divergence:**
   - Claude Code uniquely supports `${VAR:-default}` shell-style defaults
   - Codex uniquely separates `env_vars` (allowlist-forwarded to server process) from `env_http_headers` (referenced by env-var name rather than value — avoids secrets in `config.toml`)
   - Cursor uses `${env:VAR}` syntax distinct from both

5. **Config-shape polymorphism hurts installer generality:**
   - Claude Code: `"type"` discriminator
   - Cursor: `url`/`command` duck-typing
   - Codex: TOML table keys
   - A universal installer branches three ways on file format alone

6. **SSE is functionally dead-on-arrival for installers targeting post-March 2025.** Codex and the MCP spec both omit it from the happy path. Targeting SSE as primary is a liability.

---

## Negative searches / NOT FOUND

- Any harness with device-code OAuth (RFC 8628) flow for MCP — not implemented anywhere
- Pre-provisioned refresh-token install paths — none documented
- Native `"type":"http"` in `claude_desktop_config.json` without the Connectors UI (community source asserts it; Anthropic docs do not)
- Cursor CIMD (Client ID Metadata Documents) implementation — marketed, not doc-confirmed

## Gaps / follow-ups

- Empirical test: does `claude_desktop_config.json` accept `"type":"http"` directly (bypassing Connectors UI)?
- Codex `mcp_oauth_credentials_store="file"` on-disk format not documented — matters for air-gapped workflows
- Cursor's CIMD (Nov 2025 MCP spec revision replacement for DCR) — implementation status
- Claude Cowork with `"type":"http"` in host config — SDK bridge behavior undocumented
