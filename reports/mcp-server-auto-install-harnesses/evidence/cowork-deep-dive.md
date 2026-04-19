# Evidence: Claude Cowork Deep Dive — MCP Install Status

**Dimension:** Claude Cowork — follow-up pass closing UNCERTAIN items
**Date:** 2026-04-18
**Sources:** 12 GitHub issues in `anthropics/claude-code`; community workaround guides; product pages; Cowork VM architecture analysis

**Vendor-bias flag:** Anthropic is the vendor. All `support.claude.com` / `code.claude.com` / `claude.com` sources are first-party. Community sources (dev.to, aaddrick.com, winbuzzer.com) flagged where used.

---

## Bug status (as of 2026-04-18)

### #24433 — Cowork per-tool "Always allow" does not persist
- **Status: CLOSED** as stale on 2026-03-15; auto-locked 2026-03-24
- Last human comment: 2026-02-15
- **Anthropic-staff response: NONE** across entire thread
- PRs linked: none
- **Workaround: NONE confirmed.** Community: *"currently zero way to pre-approve or persistently approve MCP tools for local agent mode tasks"*
- Source: [anthropics/claude-code#24433](https://github.com/anthropics/claude-code/issues/24433)

### #26259 — Cowork stdio bridge for Desktop Extensions
- **Status: OPEN**, labeled `stale`, no Anthropic-staff engagement
- Last substantive comment: 2026-03-30 by `danielgreane` — *"essentially blocking our entire organisation"*
- **Anthropic-staff response: NONE** across 15-comment thread (Feb 17 → Mar 30)
- PRs linked: none
- **Workaround: PARTIAL and flaky:**
  1. MCPB repackaging (`tommy-gun`, 2026-04-15 on #42453): converting stdio server to `.mcpb` "looks like it helps in Cowork mode" — single data point
  2. Tool-count ≤40 per MCP (`francoios`, 2026-03-04): "Implementing a Proxy + lazy loading fix the thing"
  3. Mid-session verbal re-assertion (not headless-compatible)
- **Root cause identified:** `gileze33`'s 2026-03-25 log evidence pins it to a **race at VM spawn time** — `--mcp-config` is snapshotted before late-registering extensions complete their handshake. Resumed session picks them up; new session loses them
- `robrichardson13`'s 2026-03-19 evidence (three consecutive sessions, minutes apart, same machine): extension present → missing → present. Admins get it more reliably than non-admins
- Source: [anthropics/claude-code#26259](https://github.com/anthropics/claude-code/issues/26259)

### Related issues (12 total found)

| # | Title | State | Signal |
|---|-------|-------|--------|
| [#20377](https://github.com/anthropics/claude-code/issues/20377) | "Local/desktop MCP tools not exposed to Cowork" | CLOSED 2026-02-03 silently | No documented fix; #26259 is the regression |
| [#28695](https://github.com/anthropics/claude-code/issues/28695) | Cowork never requests `user:mcp_servers` OAuth scope | CLOSED 2026-03-01 | Token only `user:inference` — Claude.ai connectors permanently blocked |
| [#36405](https://github.com/anthropics/claude-code/issues/36405) | Intermittent MCP extension omission (race) | CLOSED 2026-03-19 | Same spawn-time race as #26259 |
| [#41432](https://github.com/anthropics/claude-code/issues/41432) | stdio MCP + JVM fails | CLOSED "not planned" | Staff: "Claude Desktop bug, filed here because Claude Code repo is the only public Anthropic bug-tracker" |
| [#42453](https://github.com/anthropics/claude-code/issues/42453) | "Tool has been disabled in your connector settings" | OPEN, 2.1.92 | Blocked at Cowork PreToolUse hook before MCP called |
| [#47371](https://github.com/anthropics/claude-code/issues/47371) | `alwaysAllow` config per MCP server | OPEN 2026-04-13 | Explicit reopen-request of #24433; **zero comments, zero staff response** |
| [#48909](https://github.com/anthropics/claude-code/issues/48909) | "Support custom stdio MCP servers in Cowork" | OPEN 2026-04-16 | Filed as feature request — **officially acknowledges stdio not supported** |
| [#43343](https://github.com/anthropics/claude-code/issues/43343) | Fedora 42 — config wiped, MCPs broken | OPEN | Confirms no Linux Cowork story |
| [#46519](https://github.com/anthropics/claude-code/issues/46519) | Cowork silently drops uvx plugins | OPEN | PyPI cold-start exceeds startup timeout |
| [#39125](https://github.com/anthropics/claude-code/issues/39125) | `user_config` env vars not injected into Cowork MCPs | OPEN | Breaks every MCPB using `${user_config.*}` |
| [#47614](https://github.com/anthropics/claude-code/issues/47614) | Custom MCPs use UUID as server name | OPEN | Display name not forwarded to model |
| [#48758](https://github.com/anthropics/claude-code/issues/48758) | `allowedMcpServers` schema conflicts with Cowork names | OPEN | Config schema rejects Cowork's own connector names |

**Key signal:** 12 issues, 4 open, 8 closed, **zero Anthropic-staff comments** on the open ones.

---

## Cowork architecture specifics

**Local VM, not cloud.** Community reverse-engineering ([aaddrick.com](https://aaddrick.com/blog/claude-desktop-cowork-mode-vm-architecture-analysis), UNCERTAIN):
- macOS Apple Silicon: Apple Virtualization Framework (`VZVirtualMachine`)
- Windows: Microsoft Host Compute System
- ~10GB Linux VM bundle managed by native `@ant/claude-swift` addon

**Stdio bridge mechanism: SDK-proxied only.** Host Claude Desktop spawns the stdio MCP server in its own process; Cowork orchestrator constructs a `--mcp-config` argument for the in-VM Claude Code process with `"type": "sdk"` proxy entries pointing at host-side servers. Per #26259, this is **intermittently dropped at spawn time**. No direct stdio socket forwarding, no port forward, no file mount.

**Transports supported:**
- HTTP custom connectors work (Cowork UI → "Add a Custom Connector")
- SSE/streamable-HTTP via supergateway-style bridges work as custom HTTP connectors
- **Stdio desktop extensions work only via the SDK proxy — the exact surface that fails intermittently**

**Config file:** purely `claude_desktop_config.json`-driven. Cowork session state at `~/Library/Application Support/Claude/local-agent-mode-sessions/*.json` is read-only derived state, not user-editable. **No Cowork-specific config file exists.**

**Cowork-only install path:** NONE for stdio. The Cowork UI supports custom HTTP connectors; no programmatic stdio path.

---

## Cowork install documentation

- **Official Anthropic MCP-in-Cowork page: does not exist.** [Get Started with Cowork article](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork) mentions MCP once, never describes install mechanics
- [Local MCP Servers article](https://support.claude.com/en/articles/10949351) **does not mention Cowork at all**
- [Enterprise MCP extensions article](https://support.claude.com/en/articles/12702546-deploying-enterprise-grade-mcp-servers-with-desktop-extensions) addresses MCPB packaging but not Cowork's SDK-bridge requirement
- **Gap:** No documented programmatic install path; no documented config schema for Cowork MCP inheritance; no documented troubleshooting for the #26259 race

---

## Community workarounds

### Supergateway + pm2 HTTP bridge (best candidate)
- Source: [dev.to/murat-a-a](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) — UNCERTAIN, single community author
- Wraps stdio MCPs in HTTP endpoints on `localhost:8001-N`
- `pm2` supervises the bridge processes
- Cowork consumes via custom HTTP connector with `"type": "streamable-http"`
- Reports 18+ servers running simultaneously
- **Fully headless after initial setup** — but requires a persistent host-side process-manager AND **does NOT solve the per-tool "Always allow" problem from #24433**

### MCPB repackaging
- Single data point (#42453 comment, `tommy-gun`, 2026-04-15)
- Wrapping stdio as `.mcpb` extension "looks like it helps in Cowork mode" on Claude 1.2581
- Regression-prone given the #26259 spawn race

### Tool-count trimming <40 per server
- #26259 comment, `francoios`, 2026-03-04
- Only applies if symptom is tool-count-related

### Pre-staging `local-agent-mode-sessions/` files
- NOT confirmed working. Per #24433, session JSON is overwritten on every new task

### SDK-type servers bypass #26259
- The one server that works reliably (`Claude in Chrome`) uses `type: "sdk"` with an internal IPC bridge
- **Not available to third-party MCPs** — no public "register as SDK-type" API

---

## Product-direction signals

- **Cowork is actively shipping and expanding** (not deprecated)
- Feb 2026: enterprise plugin launch with 13 plugins, private marketplaces, admin controls ([winbuzzer coverage](https://winbuzzer.com/2026/02/25/anthropic-claude-cowork-13-enterprise-plugins-google-workspace-docusign-xcxwbn/))
- Jan 30, 2026: [Plugins launch](https://almcorp.com/blog/claude-cowork-plugins-enterprise-guide/)
- **Anthropic positioning:** Cowork is "Claude Code power for knowledge work" — aimed at non-developers with GUI workflows. MCP positioned as extensibility via **curated HTTP connectors**, not stdio ecosystem
- **Roadmap commitments for stdio MCP: NONE**
- Stale label on #26259, "not planned" close on #41432, absence of staff comments on #24433/#47371/#48909/#42453/#46519/#39125/#47614/#48758 cluster signals this is not on the public roadmap

---

## Bottom-line verdict

**Is headless stdio MCP install achievable in Claude Cowork today?**

**NO.** High confidence.

**What specifically blocks it:**
1. No programmatic install surface for Cowork — only `claude_desktop_config.json` (host-global) or custom-connector UI (HTTP only)
2. Stdio servers reach the VM only via SDK proxy, which is intermittently dropped at spawn time (#26259, "essentially blocking our entire organisation")
3. Per-tool "Always allow" is session-scoped and non-persistable (#24433 closed without staff response; replacement #47371 has zero engagement)
4. No `alwaysAllow` field in `claude_desktop_config.json` despite being requested twice
5. OAuth scope gap (#28695) blocks Claude.ai-namespace connectors
6. No Linux support
7. `user_config` env-var injection broken (#39125) — breaks every MCPB using `${user_config.*}` templates
8. Headless HTTP-bridge workaround (supergateway + pm2) exists but requires host-side process-manager, doesn't fix approval persistence, un-documented by Anthropic

**Timeline for change:** No staff response on any of 4 tracking issues. No linked PRs. No release-note mention. The one fix activity addresses stdio-parsing issues *inside* the VM, not the host→VM stdio bridge. **No indication of imminent resolution.**

**Confidence level:** HIGH on the direct answer (NO). MEDIUM-HIGH on the precise failure boundary (some workarounds partially succeed for subsets of use cases).

---

## Practical interpretation

For a product shipping an stdio MCP server today:
- **Do not claim Cowork support.** The failure modes are visible to end-users (tools disappearing between sessions, approval clicks, tool-count ceilings).
- **The only headless-compatible path is the supergateway + pm2 HTTP bridge workaround** — requires shipping host-side infrastructure that's outside the normal "install this MCP" flow. Not zero-friction.
- **Monitor #47371 + #48909** for the leading indicator that Anthropic is addressing this class of problems. No movement as of 2026-04-18.

---

## Gaps / UNCERTAIN

- dev.to `murat-a-a` workaround guide is single-author, not independently replicated. "18+ servers running" claim plausible but unverified
- MCPB-repackaging fix for #42453 is one 2026-04-15 datapoint; no independent confirmation
- Whether Anthropic's Feb 2026 enterprise MCPB admin-push pipeline avoids the #26259 race is not documented — only `robrichardson13`'s observation that "admins seemed to get it more reliably"
- `type: "sdk"` proxy protocol between host Claude Desktop and in-VM Claude Code is not officially documented; community reverse-engineering only

---

## Sources (all accessed 2026-04-18)

- [Issue #24433 — Cowork "Always allow" persistence](https://github.com/anthropics/claude-code/issues/24433)
- [Issue #26259 — Cowork stdio bridge](https://github.com/anthropics/claude-code/issues/26259)
- [Issue #20377 — Prior closed duplicate](https://github.com/anthropics/claude-code/issues/20377)
- [Issue #28695 — Missing OAuth scope](https://github.com/anthropics/claude-code/issues/28695)
- [Issue #36405 — Intermittent MCP omission](https://github.com/anthropics/claude-code/issues/36405)
- [Issue #42453 — Tool disabled in Cowork](https://github.com/anthropics/claude-code/issues/42453)
- [Issue #47371 — alwaysAllow request](https://github.com/anthropics/claude-code/issues/47371)
- [Issue #48909 — Custom stdio MCP request](https://github.com/anthropics/claude-code/issues/48909)
- [Issue #43343 — Fedora Linux gap](https://github.com/anthropics/claude-code/issues/43343)
- [Issue #39125 — user_config env vars](https://github.com/anthropics/claude-code/issues/39125)
- [Cowork VM architecture analysis — aaddrick.com](https://aaddrick.com/blog/claude-desktop-cowork-mode-vm-architecture-analysis) (UNCERTAIN community)
- [Get Started with Claude Cowork — support.claude.com](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Local MCP Servers on Claude Desktop — support.claude.com](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Dev.to workaround guide — murat-a-a](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) (UNCERTAIN community)
- [Claude Cowork product page — claude.com](https://claude.com/product/cowork)
- [Enterprise plugin launch — winbuzzer.com](https://winbuzzer.com/2026/02/25/anthropic-claude-cowork-13-enterprise-plugins-google-workspace-docusign-xcxwbn/)
