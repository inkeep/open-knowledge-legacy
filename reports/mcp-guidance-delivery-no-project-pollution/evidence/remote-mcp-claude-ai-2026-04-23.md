# Evidence: Remote MCP as a distribution path for Open Knowledge on claude.ai / Cowork / Claude Desktop

**Date:** 2026-04-23
**Scope:** Is hosted remote MCP a cleaner path for OK than stdio + npx + skills?
**Sources:** Anthropic support docs, modelcontextprotocol.io, anthropics/claude-ai-mcp issues, Linear/Notion MCP docs
**Time-box:** 8 min, partial-by-design

---

## Q1. Does claude.ai / Claude Desktop / Cowork support Remote MCP?

**Finding: YES (CONFIRMED).** Custom connectors using remote MCP are GA on claude.ai, Claude Desktop, Cowork, and mobile apps across Free, Pro, Max, Team, and Enterprise plans (Free limited to 1 connector).

**Transports:**
- **Streamable HTTP** — recommended / current default (OAuth 2.1 native)
- **SSE** — deprecated but still functional for legacy servers
- **stdio** — local-only, separate install path

**Auth models:**
- **OAuth 2.1 with PKCE + Dynamic Client Registration (DCR)** — the canonical path for claude.ai UI. Linear is cited as the reference implementation of this pattern.
- **Bearer token / API key** — supported by the Claude API `mcp_servers` connector block, but NOT the primary claude.ai UI path (claude.ai expects OAuth redirect flow).
- Notion explicitly requires OAuth (no bearer).

**Critical constraint:** When a user adds a custom connector, **Anthropic's cloud infrastructure connects TO the MCP server from Anthropic IP ranges** — not the user's device. Servers behind VPN, firewall, or on localhost CANNOT be used as remote connectors. Public HTTPS endpoint required.

**Source:** https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp, https://support.claude.com/en/articles/11503834-build-custom-connectors-via-remote-mcp-servers, https://platform.claude.com/docs/en/agents-and-tools/remote-mcp-servers

---

## Q2. Install UX for a remote MCP server

**Finding: Manual URL entry, not one-click (for custom connectors). OAuth handshake for auth.**

**Pro/Max flow (individual):**
1. Settings → Connectors → "Add custom connector"
2. Enter server name + URL (e.g., `https://mcp.inkeep.com/open-knowledge`)
3. Optional: Advanced settings → paste OAuth Client ID / Secret (if server uses pre-registered client; otherwise DCR auto-handles)
4. Click Add → redirected to OAuth consent → Claude receives token → connector enabled

**Team/Enterprise flow (admin-gated):**
1. Org Owner must FIRST add the connector at Organization settings → Connectors
2. Only then can individual members enable it in their personal Settings → Connectors
3. Each user still runs their own OAuth handshake (scoped to their identity)

**One-click install is NOT available for custom remote connectors on claude.ai.** One-click `.mcpb` bundles exist — but they are **Desktop Extensions (stdio)**, not remote. Anthropic has a curated Connectors Directory that provides one-click install, but getting in requires Anthropic verification.

**Activation handshake:** Standard MCP `initialize` RPC over Streamable HTTP. Server returns `capabilities` and optional `instructions`. OAuth token attached via `Authorization: Bearer <token>` header on every request after initial handshake.

**Source:** https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp, https://www.anthropic.com/engineering/desktop-extensions, https://support.claude.com/en/articles/11596036-anthropic-connectors-directory-faq

---

## Q3. Does Remote MCP inject `instructions` differently than stdio?

**Finding: NO DIFFERENCE — claude.ai drops `instructions` on BOTH transports (CONFIRMED via issue #131).**

From anthropics/claude-ai-mcp issue #131 (https://github.com/anthropics/claude-ai-mcp/issues/131):

> "Claude.ai (web) silently drops the instructions field from the MCP server's InitializeResult. The model only sees tool descriptions — server-level instructions never reach the LLM context."

- **Claude Code** (CLI): DOES inject `instructions` into the system prompt. Confirmed behavior.
- **Claude.ai web / Claude Desktop / Cowork**: Silently drops `instructions` from `InitializeResult`. Only tool descriptions reach the LLM.
- **Remote vs stdio**: The drop happens at the **claude.ai/Desktop client layer**, not at the transport layer. Switching from stdio to remote HTTP does **not fix this** — same client, same drop.

**Requested fix (open, not shipped as of search):** A toggle "Include server instructions" in the custom connector configuration UI. Not implemented.

**Current workaround for all non-Code clients:** Duplicate key instructions into individual tool descriptions (Anthropic recommends ≤2KB per tool description; Claude Code truncates at 2KB).

**Implication for OK:** Moving from stdio to remote MCP does NOT solve the "how do we inject authoring guidance" problem on claude.ai/Desktop/Cowork. The only channels that reach the model are (a) tool descriptions on each tool and (b) tool-call return payloads (the `instructions` echo OK does on tool responses already works on both transports).

---

## Q4. Constraints

**Auth server requirement.** claude.ai custom connectors strongly prefer OAuth 2.1 + DCR. Bearer-token-only servers work via the Claude API's `mcp_servers` block but are second-class in the claude.ai UI. **OK would need to run an OAuth 2.1 authorization server** (or use a provider like Auth0/Clerk/WorkOS) to hit the canonical UX.

**Public-internet requirement.** Anthropic cloud egresses to the MCP server. No localhost, no VPN-gated, no private-network deployments. This is a hard blocker for the "OK runs alongside your local knowledge directory" model — a hosted `mcp.inkeep.com/open-knowledge` would have to either (a) proxy to a user-run local server via tunneling, or (b) host user knowledge directories centrally, which conflicts with OK's local-first thesis.

**Security / verification.** Custom connectors are explicitly "not verified by Anthropic." Anthropic warns users. The Anthropic Connectors Directory (one-click install, verified badge) requires partner onboarding. No formal certification program surfaced in search; Directory inclusion is editorial.

**Rate limits.** Not surfaced in search results as numeric SLAs. Team/Enterprise admins can disable specific tool calls org-wide. Token usage counts against user's Claude plan quota.

**Precedent (Linear, Notion, GitHub):**
- **Linear**: Streamable HTTP + OAuth 2.1 + DCR. Fully hosted, centrally managed. Listed in Connectors Directory (one-click). https://linear.app/docs/mcp
- **Notion**: Hosted OAuth-only MCP. No bearer tokens. https://developers.notion.com/guides/mcp/get-started-with-mcp
- **Docker MCP Toolkit**: Catalog of 60+ remote MCP servers with OAuth, positioning itself as the "install from trusted catalog" layer. https://www.docker.com/blog/connect-to-remote-mcp-servers-with-oauth/

All three run centrally-hosted SaaS-style MCP endpoints. None of them mirror OK's "your files, your machine" model.

---

## Synthesis: Is hosted remote MCP cleaner for OK?

**Net assessment: NO — not cleaner for OK's current thesis. Mixed signal.**

**Cleaner on:** install friction (URL paste + OAuth vs `open-knowledge init` + npx + .mcp.json edit), zero-install upgrades, cross-device sync of auth, Team/Enterprise admin provisioning (one connector URL pushes to whole org).

**Worse on / blocked on:**
1. **`instructions` drop is identical** on remote and stdio in claude.ai/Desktop/Cowork (issue #131). Remote does not unlock better guidance injection.
2. **Public-internet requirement breaks local-first.** OK's CRDT server + file watcher lives on the user's machine reading their git-tracked markdown. A remote MCP at `mcp.inkeep.com/open-knowledge` would have to either host user content (thesis-breaking) or implement a tunneling control-plane (large engineering lift, adds a new single point of failure and auth surface).
3. **OAuth 2.1 server is net-new infra** OK does not run today. Not trivial — DCR, token rotation, scope design, revocation.
4. **No verification program to ride.** Custom connectors carry "unverified" warning in the UI; getting into the Connectors Directory is a partnership conversation with Anthropic.

**Where remote MCP would help:** A *complementary* hosted endpoint (e.g., "OK Cloud" for users who want centrally-hosted knowledge bases) — not a replacement for the local stdio + `ok` CLI path. The local path remains the right answer for users whose knowledge base IS their git repo.

**Status of the instructions-injection problem:** Remote MCP does NOT solve it. The canonical workaround remains the same on both transports — rich `description` fields on individual tools, plus echoing authoring guidance in `write_document` / `edit_document` tool return payloads (OK already does this).

---

## Gaps / follow-ups

- Did not verify current (2026-04) state of issue #131 (may have shipped between search snapshot and today — worth checking the issue thread directly before acting).
- Did not search for Anthropic Partner / Connectors Directory onboarding criteria in depth (would matter if OK pursued one-click path).
- Did not examine whether Cowork's containerized execution environment changes the remote-MCP calculus (Cowork runs in Anthropic-managed sandbox — could conceptually reach a local tunnel differently than claude.ai web does).
- Tunneling approaches (Cloudflare Tunnel, ngrok, Tailscale Funnel) as a "local OK, remote MCP" hybrid were not researched — potentially relevant middle path.
