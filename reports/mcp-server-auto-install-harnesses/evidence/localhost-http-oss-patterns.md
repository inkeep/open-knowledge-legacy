# Evidence: OSS Localhost-HTTP MCP Server Patterns + Bootstrap UX

**Dimension:** Localhost HTTP MCP server install — ecosystem patterns and real-world bootstrap UX
**Date:** 2026-04-18
**Sources:** OSS MCP server repos (Playwright, Chrome DevTools, Supergateway, mcp-proxy, mcpm router, mcp-remote), MCP spec, vendor docs, community guides

**Vendor-bias flag:** Most cited repos are vendor- or community-maintained; flagged where single-source.

---

## Real-world OSS servers shipping as localhost HTTP

| Server | Port strategy | Transport | Bootstrap | Auth | Install-into-harness pattern |
|---|---|---|---|---|---|
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | Static `8931` (flag-overridable); host defaults `localhost`, `0.0.0.0` opt-in | SSE (`/sse` + `/messages`); Streamable HTTP in newer builds | `npx @playwright/mcp@latest --port 8931` OR Docker | None by default | User hand-writes `{"url":"http://localhost:8931/sse"}` |
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | **Stdio by default**; HTTP only via experimental `--experimental-webmcp` (Chrome 149+) | stdio; HTTP experimental | `npx -y chrome-devtools-mcp@latest` spawned by harness | None | Hand-written stdio config; HTTP users wrap via `mcp-proxy` |
| [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) | Config-driven (`MCP_PORT` env) | SSE + Streamable HTTP | Docker or local Python process | DB connection string; no MCP-layer auth | Hand-written URL config |
| [docker/mcp-gateway](https://github.com/docker/mcp-gateway) (Docker MCP Toolkit) | Static gateway port | Streamable HTTP | Docker Desktop 4.59+ auto-starts | Per-server (OAuth for Google/Atlassian) | Docker Desktop writes the harness config for Claude, Cursor, VS Code, Windsurf |
| [mcpm.sh router](https://github.com/pathintegral-institute/mcpm.sh) | Static `localhost:6276` | Streamable HTTP + SSE | `mcpm router start` → background daemon | Optional | `mcpm client import <claude\|cursor>` writes harness config pointing at `:6276` |
| [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway) | Default `8000` (overridable) | SSE / WS / Streamable HTTP wrap around stdio | `npx -y supergateway --stdio "<cmd>" --port 8000` | None; pass-through | Manual |
| [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) | **Dynamic random** default, host `127.0.0.1` | Streamable HTTP ↔ stdio | `uv tool install mcp-proxy` then `mcp-proxy --transport streamablehttp` | None default | Manual |
| [geelen/mcp-remote](https://github.com/geelen/mcp-remote) | Static `3334` OAuth callback (falls back to random) | stdio client, HTTP OAuth callback | Spawned on-demand by harness as stdio subprocess | OAuth to upstream remote | Written into `.mcp.json` as stdio command |

### Key observations on the OSS landscape

- **Static ports dominate.** Playwright (8931), mcpm router (6276), mcp-remote OAuth (3334), Chrome CDP (9222), Supergateway (8000). Easy to document but collision-prone.
- **No public MCP server writes its port to a canonical discovery file.** This is an ecosystem gap. (The user's repo already has `.open-knowledge/server.lock` — ahead of the curve.) The closest analog is Chrome's `DevToolsActivePort` in the user-data-dir, but that's CDP not MCP.
- **No MCP server ships first-party launchd/systemd scaffolding.** Users wire auto-start by hand.
- **mcpm router is the closest to the "one-daemon-many-harnesses" pattern** — static port + per-harness config-writer (`mcpm client import claude`).

---

## Launch / lifecycle patterns in practice

| Pattern | Examples | Notes |
|---|---|---|
| Manual `npx` / `uvx` | Playwright MCP, Supergateway, mcp-proxy | Default. Users re-launch per session. |
| Harness-spawned stdio subprocess | Chrome DevTools MCP, mcp-remote, most `modelcontextprotocol/servers` catalog | Lifecycle is harness's problem |
| Docker / Docker Compose | Playwright MCP, Supergateway, entire Docker MCP Toolkit catalog | Docker Desktop 4.59+ runs gateway as tray-level lifecycle. Most durable on macOS/Windows. |
| Background daemon via CLI `start` | `mcpm router start` | No shipped systemd/launchd scaffolding |
| launchd / systemd user services | None shipped first-party | End users wire by hand |
| Electron tray app | `tamagokakedon/electron-mcp`; Docker Desktop MCP Toolkit | Claude Desktop itself is the ambient Electron process |
| IDE-extension-embedded server | VS Code's `chat.mcp.autoStart` auto-restarts stdio (not HTTP) | HTTP servers must be pre-running |

---

## Port management strategies (survey)

- **Static port** — dominant. Collision-prone.
- **Dynamic port + flag override** — `mcp-proxy` (random default + `--port`). No port-file emitted.
- **Config-driven env var** — `electron-mcp` uses `MCP_PORT`. Postgres MCP uses connection URLs.
- **Port-file / lockfile on disk** — **NO public MCP server implements this today.** Obvious ecosystem gap.
- **mDNS / Bonjour** — zero precedent.
- **Port-range probe with fallback** — `mcp-remote` internally (falls back to random if `3334` taken) but not exposed.

---

## Graceful bootstrap / discovery contracts

**Critical finding:** **No harness supports URL-from-file / URL-from-command discovery as of 2026-04-18.**

- **Claude Code:** Has [`headersHelper`](https://code.claude.com/docs/en/mcp) (command that prints JSON *headers* at connect time, 10s timeout) and `authServerMetadataUrl` (OAuth URL discovery). The `url` field itself is a **static string**. `${VAR}` interpolation works against process env, not per-session file.
- **Cursor:** No URL-from-command mechanism.
- **VS Code:** `chat.mcp.autoStart` for stdio; no HTTP discovery.
- **Codex:** No URL-from-command mechanism.

**MCP spec proposals (unmerged as of 2026-04-18):**
- [SEP-1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) — `/.well-known/mcp/server-card.json` for server-capability discovery (not URL resolution)
- [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) — HTTP discovery PR

The MCP Registry's `server.json` format is for catalog listing, NOT runtime URL discovery.

**Origin validation:** MCP spec *requires* servers to validate `Origin` header to prevent DNS-rebinding attacks. Load-bearing for any localhost HTTP server.

---

## CRITICAL — Claude Desktop HTTPS requirement

**Confidence:** CONFIRMED (but 2025 source — may have shifted)
**Evidence:** [modelcontextprotocol/discussions #16](https://github.com/orgs/modelcontextprotocol/discussions/16); community guidance at multiple blog sources

Claude **Desktop** (Chat + Cowork) custom connectors **require `https://` URLs**. Plain `http://localhost:<port>` is blocked.

**Claude Code terminal** is the outlier that accepts plain `http://localhost` in its `~/.claude.json` / `.mcp.json`.

**Implication:** The localhost-HTTP path is NOT symmetric across the Claude family. Going through `mcp-remote` stdio bridge is the workaround; pointing Claude Desktop at a true local HTTP server requires fronting with a trusted TLS cert (expensive for a shipped install).

---

## Common gotchas in localhost HTTP MCP

1. **OAuth callback port collision** — [claude-code #15320](https://github.com/anthropics/claude-code/issues/15320): multiple `mcp-remote` instances race for `127.0.0.1:3519`/`3334`; one wins, others `EADDRINUSE`
2. **IPv4 vs IPv6 loopback** — servers binding only `127.0.0.1` invisible to clients resolving `localhost` to `::1`. [Docker for Mac #7269](https://github.com/docker/for-mac/issues/7269) is the canonical case. Best practice: bind both, OR use the explicit `127.0.0.1` literal on both ends.
3. **macOS Application Firewall quirks** — servers launched via `node`/`python` interpreters get attributed to the interpreter binary; macOS often [silently suppresses](https://medium.com/@sdntechdemo/macos-application-firewall-allowing-incoming-connections-for-python-command-line-servers-ecbd4623524f) the "accept incoming" prompt. Same reason [Cursor can't reach a local MCP even when `curl` works](https://github.com/cursor/cursor/issues/3314).
4. **Origin-header + DNS-rebind attacks** — mandatory per MCP security guidance; hand-rolled servers get this wrong
5. **Cold-start race** — harness dispatches tool call before HTTP server is listening; no retry contract specified
6. **Port reuse / stale listeners** — generic `EADDRINUSE` on re-launch
7. **Session-ID handling** — spec requires `Mcp-Session-Id` to be cryptographically secure and echoed on every subsequent request
8. **Claude Desktop HTTPS gate** — see above

---

## Stdio vs localhost HTTP — headless-install pros/cons

### Localhost HTTP pros
- **One running server, many harnesses** (Claude Code + Cursor + Codex + VS Code share a URL) — mcpm router's whole value proposition
- **Persistent state** — cached DB connections, warmed browser profiles, loaded models, auth tokens
- Faster per-tool latency (no per-invocation process spawn)
- **Works in sandboxed environments** where `node`/`npx` isn't on PATH (corporate laptops without global npm) — sidecar runs once, outside the sandbox
- Richer OAuth / streaming / session behavior per 2025-06-18 spec

### Localhost HTTP cons
- Port management (see above)
- Lifecycle management (crash, restart, cold start)
- First-run macOS firewall prompt for GUI users
- **Claude Desktop's HTTPS requirement** — localhost HTTP is Claude Code-only in the Claude family
- Hard to bundle in an `npm postinstall` step (postinstalls shouldn't leave daemons running)
- DNS-rebinding surface; `Origin` validation mandatory
- Multi-user machines: loopback is shared across UIDs; no kernel-level user scoping

### Stdio pros
- Harness owns lifecycle; no daemon to babysit
- No port conflict, no firewall prompt
- Fresh per-invocation env
- Universally supported — every harness speaks stdio first

### Stdio cons
- Requires executable on PATH (fails in sandboxed VMs / corporate laptops)
- Per-invocation startup cost
- No shared state across harnesses

**Net for headless install:** Stdio still wins for "installer drops config file and leaves." Localhost HTTP is worth the overhead only when at least one of: shared state across harnesses, persistent auth session, slow cold start, or sandbox-PATH problem is load-bearing.

---

## Practical verdict — best-practice bootstrap pattern

**For a product shipping a localhost HTTP MCP server today (2026-04):**

1. Ship as `npx`-runnable stdio binary **first**. Every harness handles this.
2. If localhost HTTP is load-bearing, add a `start` subcommand that:
   - Binds `127.0.0.1` on a **static, documented port**
   - Validates `Origin` header
   - Writes a `server.lock` containing `{pid, port, startedAt}` to a known directory
   - Is launched by the user via `<tool> start`
3. Provide a Docker image as the portable alternative
4. For multi-harness reuse, follow **mcpm router**'s shape: one local daemon, static port, `<tool> client import <harness>` writes per-harness config
5. **Do NOT rely on harness-side URL-from-file discovery** — it doesn't exist in Claude Code, Cursor, Codex, or VS Code as of 2026-04-18
6. For per-session auth, use `headersHelper` (Claude Code) or bearer-token `${ENV_VAR}` interpolation

**User-visible install steps:**
1. `npm i -g <your-cli>` OR `brew install`
2. `<your-cli> start` (first run → macOS firewall prompt; user clicks Allow)
3. `<your-cli> install --client claude-code` OR use `add-mcp`/`install-mcp` — writes `.mcp.json` with static URL
4. Restart harness; server is discovered on next tool call

**Main risk profile:**
- macOS firewall prompt on first run (can't headless-skip without codesigned binary at `/usr/local/bin`)
- Port collision if static port is occupied
- Cold-start race (harness hits URL before `listen()` returns)
- Ongoing lifecycle (no shipped launchd/systemd plist in MCP ecosystem means user re-runs `start` per boot)
- **Claude Desktop HTTPS gate closes that harness entirely** unless fronting a local TLS cert

---

## Gaps / UNCERTAIN

- `~/openbolts` project (mentioned by user) not found publicly — Google + GitHub search surfaced no repository. Treated as out-of-scope for this survey.
- Claude Desktop HTTPS-only rule for custom connectors — 2025-era source; may have shifted in 2026. UNCERTAIN.
- Exact current shape of `chrome-devtools-mcp --experimental-webmcp` — README references without listing port or endpoint
- Whether mcpm router daemon writes a port file — not documented; relies on static 6276
- Two MCP spec discovery proposals (SEP-1649, SEP-2127) unmerged

---

## Sources (all accessed 2026-04-18)

- [MCP Transports 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [chrome-devtools-mcp #1194 — localhost:9222 confusion](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1194)
- [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway)
- [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)
- [pathintegral-institute/mcpm.sh](https://github.com/pathintegral-institute/mcpm.sh)
- [geelen/mcp-remote](https://github.com/geelen/mcp-remote)
- [claude-code #15320 — mcp-remote port conflict](https://github.com/anthropics/claude-code/issues/15320)
- [SEP-1649 — .well-known MCP server cards](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)
- [SEP-2127 — HTTP discovery PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)
- [Docker MCP Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
- [docker/mcp-gateway](https://github.com/docker/mcp-gateway)
- [VS Code — chat.mcp.autoStart](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [modelcontextprotocol/discussions #16 — Claude Desktop HTTPS-only](https://github.com/orgs/modelcontextprotocol/discussions/16)
- [Cursor #3314 — local MCP unreachable despite curl](https://github.com/cursor/cursor/issues/3314)
- [macOS App Firewall — Python server prompt](https://medium.com/@sdntechdemo/macos-application-firewall-allowing-incoming-connections-for-python-command-line-servers-ecbd4623524f)
- [Docker for Mac #7269 — localhost → ::1 resolution](https://github.com/docker/for-mac/issues/7269)
- [Auth0 — Why MCP moved away from SSE](https://auth0.com/blog/mcp-streamable-http/)
- [Streamable HTTP security considerations](https://medium.com/@yany.dong/mcp-streamable-http-transport-security-considerations-and-guidance-2797cfbc9b19)
- [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp)
