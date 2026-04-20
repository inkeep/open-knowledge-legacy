# Evidence: Localhost HTTP/SSE MCP Install — Per-Harness Mechanics

**Dimension:** Does localhost HTTP transport change the install friction picture per harness?
**Date:** 2026-04-18
**Sources:** Vendor docs, MCP spec, GitHub issue trackers (`anthropics/claude-code`, `openai/codex`, `cursor/cursor`), forum threads, third-party integration guides

**Vendor-bias flag:** Each vendor documents their own behavior; corroborated with GitHub issues + third-party guides where possible.

---

## 1. Localhost URL acceptance per harness

| Harness | Accepts `http://localhost:<port>`? | Notes |
|---|---|---|
| **Claude Code terminal** | **YES** | Documented: `claude mcp add --scope user pieces --transport http http://localhost:39300/...` ([Pieces guide](https://docs.pieces.app/products/mcp/claude-desktop), [OpenObserve](https://openobserve.ai/docs/integration/mcp/claude/)) |
| **Claude Code Desktop** (`claude_desktop_config.json`) | **NO** | "Claude Desktop launches MCP servers as child processes over stdio (the only transport the client supports natively). Remote servers must be proxied through a launcher that exposes a stdio interface, such as `mcp-remote`" ([Netdata guide](https://learn.netdata.cloud/docs/netdata-ai/mcp/mcp-clients/claude-desktop), [claude-ai-mcp#9](https://github.com/anthropics/claude-ai-mcp/issues/9)). Requires HTTPS with CA-signed cert for any remote form. |
| **Claude Cowork Custom Connector UI** | **NO** | URLs must be "reachable over the public internet from Anthropic's IP ranges" — Anthropic's cloud originates the connection, not the local machine ([support.claude.com/11503834](https://support.claude.com/en/articles/11503834)) |
| **Codex terminal** | **YES** | Documented TOML: `url = "http://localhost:3000/mcp"` ([developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference)) |
| **Codex desktop** (VS Code ext) | **YES** | Shared config with CLI |
| **Cursor CLI** | **YES** | Duck-typed `url` vs `command` |
| **Cursor Desktop** | **YES** | Same |

**Headline:** 5 of 7 harness surfaces accept localhost HTTP directly. **Claude Code Desktop + Claude Cowork Custom Connector UI reject it outright.**

---

## 2. Auth relaxation for localhost — no spec carve-out, but most harnesses empirically accept no-auth localhost

**MCP spec:** *"MCP servers that use the HTTP transport are called remote MCP servers, whether the MCP server lives on localhost, a private URL or a public URL."* Spec does NOT carve out a localhost auth exemption — OAuth is "strongly recommended" for all HTTP-transport servers ([modelcontextprotocol.io/specification/2025-06-18/basic/authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)).

But auth is *optional* per spec; what each client *accepts* from a no-auth server is empirical:

| Harness | No-auth localhost HTTP works? | Caveat |
|---|---|---|
| Claude Code terminal | YES | No OAuth discovery forced if server returns 200 to POSTs without challenging |
| Claude Code Desktop | Moot — rejects `http://` entirely |
| Claude Cowork | Moot — rejects localhost entirely |
| Codex terminal/desktop | YES | `bearer_token_env_var` / `http_headers` / `[.oauth]` blocks are optional |
| Cursor CLI/desktop | YES with caveat | **Forum #156054: when a server advertises `/.well-known/oauth-protected-resource`, Cursor ignores `headers` and forces OAuth.** Localhost servers wanting bearer-only must NOT advertise PRM |

**Headline:** A no-auth localhost HTTP MCP server works in 5 of 7 surfaces. Claude Desktop / Cowork require a different path.

---

## 3. Process lifecycle — installer owns it

**No harness has a "spawn this binary AND connect to its HTTP port" hybrid syntax.** Config is either `command+args` (stdio child-process) or `url` (harness is a dumb HTTP client). **No harness probes, restarts, or supervises an HTTP server peer.**

Standard patterns when shipping sidecar HTTP MCP:
- macOS: `launchd` LaunchAgent plist with `RunAtLoad=true`, `KeepAlive=true`
- Windows: Task Scheduler `ONLOGON` trigger or NSSM for service-style supervision
- Linux: `systemd --user` unit with `Restart=always`
- Cross-platform dev: `pm2`, `forever`, Docker container

**No mDNS/Bonjour auto-discovery.** No harness scans for local MCP. Every config entry is explicit.

**Port selection:** all harnesses require a hardcoded port in the `url`. No dynamic port discovery.

**Server-not-running behavior:**
- **Codex** has `required=true` to fail CLI startup + `startup_timeout_sec`; spawns MCP connections once at `McpConnectionManager::new` and **never retries** ([openai/codex#4955](https://github.com/openai/codex/issues/4955), [#7767](https://github.com/openai/codex/issues/7767)) — if sidecar is down at Codex launch, tool list is empty until full Codex restart
- **Claude Code + Cursor** reconnect opportunistically but don't start the server

---

## 4. Cowork VM networking — DEFINITIVE NEGATIVE

**Confidence:** CONFIRMED (primary-source GitHub issue)
**Evidence:** [anthropics/claude-code#28018](https://github.com/anthropics/claude-code/issues/28018)

> "The sandbox blocks outbound TCP connections to localhost/127.0.0.1/::1 even when these are listed in `sandbox.network.allowedDomains`. The `sock.connect()` syscall gets `EPERM` (Operation not permitted)."

**The Cowork VM cannot reach host-localhost.** Open feature request; no workaround except `dangerouslyDisableSandbox: true` (defeats sandbox purpose).

**No `host.docker.internal` equivalent documented.** All VM egress forced through `localhost:3128` (HTTP proxy) and `localhost:1080` (SOCKS5), where *inside-VM* localhost is the VM's own loopback, not host's. The proxies enforce Anthropic's managed allowlist; `allowedDomains` ignored when `allowManagedDomainsOnly: true` ([#37970](https://github.com/anthropics/claude-code/issues/37970)).

**Does localhost HTTP fix #26259 (stdio bridge race)?** **NO.** It replaces failing SDK-proxy-stdio with a different ingress (Custom Connector UI), but that ingress requires public URLs. Localhost label is misleading.

**Does localhost HTTP fix #24433 (per-tool approval)?** **NO.** Approval is keyed by server identifier, not transport. Per-server state in `local-agent-mode-sessions/*.json`, overwritten on every new task regardless of transport.

### dev.to/murat-a-a workaround — clarification

The guide describes `.mcp.json` **inside the Cowork VM** carrying `http://localhost:8001/mcp` — this only works if supergateway runs **inside the same VM**. The author explicitly notes: for host-side supergateway, "replace localhost with the Tailscale IP" — i.e. tunnel to public. Single community datapoint; consistent with #28018 blocking host-loopback.

**Translation:** the "localhost HTTP rescues Cowork" hypothesis is FALSE. The only Cowork path is a public-HTTPS tunnel (Tailscale/ngrok), which isn't localhost in any meaningful sense.

---

## 5. Cursor CLI CI approval gap — NOT transport-specific

**Confidence:** CONFIRMED
**Evidence:** [forum #138036](https://forum.cursor.com/t/138036), [forum #143045](https://forum.cursor.com/t/143045)

Gating is on `.workspace-trusted` + `mcp-approvals.json` files, which track **server identifier** (name-based). `--force` / `--yolo` flags bypass tool-permission prompts but NOT MCP approval. Pre-staging `mcp-approvals.json` with correct key is the only headless workaround; works identically for stdio and HTTP entries.

**Switching to localhost HTTP does NOT rescue Cursor CLI in CI.**

---

## 6. Claude Code Windows concurrent-writes — transport-irrelevant

**Confidence:** CONFIRMED
All 5 corruption bugs ([#28842](https://github.com/anthropics/claude-code/issues/28842), [#28847](https://github.com/anthropics/claude-code/issues/28847), [#29036](https://github.com/anthropics/claude-code/issues/29036), [#29153](https://github.com/anthropics/claude-code/issues/29153), [#29217](https://github.com/anthropics/claude-code/issues/29217)) are in the `.claude.json` writer (non-atomic rename on Windows — `EPERM` when target handle held). Config file written regardless of transport.

**v2.1.61 ships a fix** (atomic `.claude.json.tmp` + rename). Pre-2.1.61 clients remain in the wild. UNCERTAIN whether fix is on Windows MSIX channel yet.

---

## 7. Claude Desktop native HTTP in config — CONFIRMED NOT SUPPORTED

**Canonical localhost-HTTP pattern for Claude Desktop/Cowork host config:**

```json
{
  "mcpServers": {
    "LocalSidecar": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:47821/mcp", "--allow-http"]
    }
  }
}
```

- `--allow-http` REQUIRED (default rejects plain HTTP)
- Adds `node` + `npx` dependency
- Re-creates stdio-bridge failure modes in Cowork (#26259)

**Cowork Custom Connector UI remains a separate, public-URL-only ingress.**

---

## 8. MCPB with embedded HTTP server — NOT SUPPORTED

[MCPB MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) declares `server.type ∈ {node, python, uv, binary}` and `server.mcp_config = { command, args, env }` — **exclusively a stdio launcher spec**. No fields for `url`, `port`, or HTTP-connect params. Per manifest: *"Stdio should be chosen when you want the simplest possible local setup with no open ports."*

---

## 9. Bottom-line friction diff per harness

| Harness | Stdio friction (existing) | Localhost HTTP friction | Net change |
|---|---|---|---|
| Claude Code terminal | Zero clicks; `claude mcp add` scripts it | Zero clicks; same CLI + `--transport http` | **Neutral** — both headless |
| Claude Code Desktop | JSON edit; node runtime; Windows race (fixed 2.1.61) | **BLOCKED — rejects `http://`. Must bridge via `mcp-remote --allow-http`, reintroduces stdio** | **WORSE** (adds bridge dep) |
| Claude Cowork | Intermittent stdio bridge (#26259); no approval persistence (#24433) | **BLOCKED for localhost — VM can't reach host-loopback (#28018); Custom Connector UI demands public URL.** Only works via public tunnel | **WORSE**, or Better iff accepting public-tunnel cost |
| Codex terminal | TOML edit + env var; fully scriptable | TOML edit only (no env var if no-auth) | **Slightly better** |
| Codex desktop | Same TOML; occasional surfacing bug | Same TOML; same bug | Neutral |
| Cursor CLI | No `mcp add` verb; pre-stage `mcp.json`; CI approval gate | Same; approval gate persists | Neutral |
| Cursor Desktop | JSON edit; DCR OAuth on one-click | No-auth localhost avoids OAuth UI round-trip | **Slightly better** |

**Headline:**
- **2/7 mildly better** (Codex terminal, Cursor Desktop)
- **2/7 materially worse** (Claude Code Desktop, Claude Cowork)
- **3/7 neutral** (Claude Code terminal, Codex desktop, Cursor CLI)

---

## 10. NEW friction introduced by localhost HTTP

| Friction | Detail |
|---|---|
| **Port conflict** | Installer picks port; no negotiation. High-random ports surprise users scanning `lsof`; low ports (3000/8080) crowded on dev machines |
| **Process lifecycle** | Must ship supervisor (launchd/systemd/pm2). Crash = silent tool-list drop on next client refresh. No harness supervises |
| **macOS Firewall prompt** | Binding `0.0.0.0` triggers "accept incoming" dialog. Binding `127.0.0.1` avoids it on modern macOS. **Unsigned interpreters (python, node) are silently blocked unless codesigned** — major UX trap |
| **Windows Defender / SmartScreen** | Long-running listener binaries trigger first-run warnings unless codesigned |
| **Race — sidecar startup vs client launch** | No harness waits/retries. Codex `required=true` + slow sidecar = startup failure |
| **DNS-rebinding / Origin header** | Compliant MCP SDKs 403 clients with missing/mismatched `Origin` per spec ([Python SDK #1798](https://github.com/modelcontextprotocol/python-sdk/issues/1798), [Go SDK commit](https://github.com/modelcontextprotocol/go-sdk/commit/67bd3f2e)). Installer-side whitelist needed |
| **Uninstall coverage** | stdio has no process to kill on uninstall (harness GCs). HTTP sidecar runs until supervisor torn down — uninstall script must know about supervisor entry |
| **Upgrade coupling** | stdio upgrades via package manager. HTTP sidecar upgrades need supervisor to restart — more complex than config bump |
| **IPv4 vs IPv6 loopback mismatch** | Bind `127.0.0.1` only → invisible to client resolving `localhost` to `::1` |

---

## Bottom-line verdict

- **Does localhost HTTP rescue Cowork?** **NO.** VM sandbox blocks host-loopback; Custom Connector UI demands public URL. Only Cowork path is a public-HTTPS tunnel (which isn't localhost). Per-tool approval (#24433) is transport-agnostic.
- **Does it rescue Cursor CLI CI?** **NO.** Approval gating by server identifier, not transport.
- **Does it add value elsewhere?** **Yes, modestly** — Codex terminal gets slightly lower friction; Cursor Desktop gets no-OAuth-popup benefit. Claude Code terminal neutral.
- **What new problems does it create?** Port allocation; process supervision (launchd/systemd/pm2); macOS firewall prompts on first bind; codesigning requirements for clean UX; sidecar-startup-vs-client-launch race; DNS-rebinding `Origin` handshake; harder uninstall/upgrade. **The stdio ecosystem's biggest advantage — harness-managed process lifecycle — is entirely forfeited.**

**Recommendation implication:** Localhost HTTP is worth shipping **alongside** stdio for harnesses that benefit (Codex, Cursor), but does NOT unblock the two genuine pain points (Cowork stdio bridge #26259, Cursor CI approval gate #138036). A sidecar-only strategy would STRICTLY WORSEN Claude Code Desktop (HTTP rejection) and Cowork (VM egress blocked) — both need stdio-via-`mcp-remote` anyway, so the stdio server is still mandatory.

---

## Gaps / UNCERTAIN

- Whether Claude Code 2.1.61+'s atomic `.claude.json` fix ships on Windows MSIX channel yet
- Whether Codex's `required=true` + HTTP `startup_timeout_sec` can be scripted to wait on a not-yet-bound sidecar
- dev.to `murat-a-a` supergateway-inside-VM claim cannot be independently corroborated
- Cursor's CIMD (Nov 2025 spec DCR replacement) localhost behavior undocumented
- Whether MCPB host loader will ever support an HTTP-connect `server.type` — nothing in manifest repo commits as of 2026-04-18

---

## Sources (all accessed 2026-04-18)

- [MCP Authorization spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP Transports spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Codex Config Reference](https://developers.openai.com/codex/config-reference), [Codex MCP](https://developers.openai.com/codex/mcp)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Cursor MCP docs](https://cursor.com/docs/mcp), [Cursor CLI MCP](https://cursor.com/docs/cli/mcp)
- [Claude Desktop Custom Connectors](https://support.claude.com/en/articles/11503834)
- [Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351)
- [MCPB MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
- [claude-ai-mcp#9 — Claude Desktop rejects HTTP on localhost](https://github.com/anthropics/claude-ai-mcp/issues/9)
- [Netdata Claude Desktop guide](https://learn.netdata.cloud/docs/netdata-ai/mcp/mcp-clients/claude-desktop)
- Cowork sandbox: [#28018](https://github.com/anthropics/claude-code/issues/28018), [#37970](https://github.com/anthropics/claude-code/issues/37970), [#26259](https://github.com/anthropics/claude-code/issues/26259), [#24433](https://github.com/anthropics/claude-code/issues/24433)
- Claude Code Windows race: [#28842](https://github.com/anthropics/claude-code/issues/28842), [#29036](https://github.com/anthropics/claude-code/issues/29036), [#29217](https://github.com/anthropics/claude-code/issues/29217)
- Cursor CLI CI: [forum #138036](https://forum.cursor.com/t/mcp-servers-are-not-recognized-with-cursor-cli-in-a-ci-environment/138036), [forum #143045](https://forum.cursor.com/t/cursor-cli-mcp-the-non-interactive-mode-cannot-be-used/143045)
- Cursor OAuth-force bug: [forum #156054](https://forum.cursor.com/t/mcp-headers-config-ignored-when-server-has-oauth-discovery/156054)
- DNS-rebinding: [Python SDK #1798](https://github.com/modelcontextprotocol/python-sdk/issues/1798), [Go SDK commit 67bd3f2](https://github.com/modelcontextprotocol/go-sdk/commit/67bd3f2e)
- Codex MCP connection init: [#4955](https://github.com/openai/codex/issues/4955), [#7767](https://github.com/openai/codex/issues/7767)
- [dev.to/murat-a-a — Cowork localhost guide](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) (UNCERTAIN, single author)
- [Pieces MCP guide](https://docs.pieces.app/products/mcp/claude-desktop)
- [OpenObserve MCP](https://openobserve.ai/docs/integration/mcp/claude/)
