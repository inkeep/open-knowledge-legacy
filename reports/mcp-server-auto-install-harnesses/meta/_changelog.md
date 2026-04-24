# Changelog

## 2026-04-18 — Follow-up pass (run: 2026-04-18-followup)

Closed three gaps in the initial pass.

### New evidence files
- [enable-by-default.md](../evidence/enable-by-default.md) — across all 7 harnesses, is an MCP server live immediately after config-write / CLI add, or does it need separate activation?
- [cli-vs-file-write.md](../evidence/cli-vs-file-write.md) — deep comparison of `claude mcp add` / `codex mcp add` / Cursor CLI (no `add`) vs direct file-write. Includes Codex Rust source-code-level findings.
- [extended-tooling-survey.md](../evidence/extended-tooling-survey.md) — 5 additional OSS installers beyond initial pass (`install-mcp`, `mcpm.sh`, `ToolHive`, Docker MCP Toolkit, MCPBar); implementation patterns worth borrowing; revised DIY-vs-reuse ranking.

### Meaningful corrections / upgrades to initial pass

1. **Claude Code project-scope trust prompt IS scriptable-bypassable.** Pre-stage `.claude/settings.local.json` with `enabledMcpjsonServers: ["<name>"]` per issue #9189. Initial pass flagged this as a non-interactive blocker; it is not.
2. **Claude Cowork has a worse-than-bridge-bug problem.** Per-tool approvals re-prompt every new session (issue #24433); "Always allow" is never persisted. Effectively unusable for headless install even when stdio bridge works.
3. **Cursor Desktop enable-state lives in `state.vscdb` SQLite**, not in `mcp.json`. Fresh workspace defaults to enabled (community-sourced; vendor docs silent).
4. **Codex `enabled` field defaults to true when omitted** (strongly inferred from issue #16439 language + docs framing).
5. **Claude Code has 5 documented concurrent-write corruption bugs** (#28842, #28847, #29036, #29153, #29217). Direct file-write with known atomic-rename is sometimes SAFER than `claude mcp add` under contention.
6. **Idempotency divergence (source-confirmed).** Codex `BTreeMap::insert` → overwrites silently. Claude Code → errors `"already exists"`. Wrapping installers must normalize.
7. **Codex `codex mcp add --url` has an OAuth post-write side-effect** (probes server, triggers browser flow) — verified from source. File-write cannot replicate.
8. **Cursor Extension API (`vscode.cursor.mcp.registerServer()`) is a documented fourth install mechanism** beyond CLI / file-write / marketplace. Aimed at "enterprise environments and automated setup workflows."
9. **Cursor CLI is effectively unusable for headless MCP install.** Forum #138036: requires `.workspace-trusted` + `mcp-approvals.json` files that CI runners lack; workarounds involve reverse-engineering approval hashes.

### Expanded tool landscape

Initial pass identified `add-mcp`, Smithery, MCPB, mcp-get. Follow-up adds:
- **`install-mcp` (supermemoryai)** — MIT, 183 stars, covers **ALL 7 of our harnesses** + 11 others
- **`mcpm.sh` (pathintegral-institute)** — MIT, 928 stars, **best automation story** with `MCPM_NON_INTERACTIVE` + `llm.txt`
- **ToolHive (stacklok)** — Apache-2.0, 1.7k stars, enterprise containerization
- **Docker MCP Toolkit** — Apache-2.0, part of Docker Desktop 4.59+
- **MCPBar** — UNCERTAIN, blog-only

Anti-recommendation: `mcpm` (ascii27, NOT `mcpm.sh`) — GPLv3, 1 star, bus-factor-of-1.

---

## 2026-04-18 — Gap-closure pass (run: 2026-04-18-gaps)

Deep-dived the two UNCERTAIN items blocking a confident headless-install decision.

### New evidence files
- [cowork-deep-dive.md](../evidence/cowork-deep-dive.md) — comprehensive Cowork status, 12 tracking GitHub issues, VM architecture, community workarounds, bottom-line verdict
- [cursor-first-run-reliability.md](../evidence/cursor-first-run-reliability.md) — Cursor `state.vscdb` schema, staff-confirmed default-enabled behavior, `permissions.json` schema, Extension API, recommended two-file install pattern

### Key upgrades

1. **Claude Cowork verdict: NO, headless stdio install is NOT achievable today.** HIGH confidence.
   - #24433 CLOSED as stale (2026-03-15), auto-locked, zero Anthropic-staff response ever
   - #26259 still OPEN, stale label, zero staff engagement, community reports "essentially blocking our entire organisation"
   - #47371 (explicit `alwaysAllow` reopen-request) opened 2026-04-13, zero comments, zero staff response
   - **#48909 (opened 2026-04-16) explicitly acknowledges "Support custom stdio MCP servers in Cowork" as a feature request** — Anthropic's own issue filing treats stdio in Cowork as unsupported
   - Cowork runs in a LOCAL VM (Apple Virtualization Framework / Microsoft HCS), not cloud
   - Community workaround (supergateway + pm2 HTTP bridge, dev.to/murat-a-a) exists but requires host-side process-manager infrastructure AND doesn't solve per-tool approval persistence
   - 12 related issues in `anthropics/claude-code` with ZERO Anthropic-staff comments on the open ones

2. **Cursor Desktop verdict: MOSTLY YES, zero-click first-run enable is reliable.** MEDIUM-HIGH confidence (UPGRADED from UNCERTAIN).
   - **Staff-confirmed:** Dean Rie (Cursor) in forum #141009 — *"When you open an empty Cursor window, all MCP servers default to enabled. This is expected behavior."* Previous evidence was community-only.
   - **Recommended install pattern confirmed:** (1) write `.cursor/mcp.json`; (2) write `~/.cursor/permissions.json` with `mcpAllowlist: ["<server>:*"]`
   - `state.vscdb` schema documented (ItemTable + `$.composerState.*` fields); per-server enable-state location still UNCERTAIN but workspace-scoped
   - `permissions.json` schema fully documented (`mcpAllowlist`, `terminalAllowlist`)
   - Extension API (`vscode.cursor.mcp.registerServer()`) is real but auto-enable semantics undocumented
   - **Key watch-item: feature request #135172** — if Cursor flips default-enable to disabled-by-default, every current installer breaks silently

### Three residual gaps closed
1. Cowork bug status — CLOSED. Picture is worse than initial pass suggested
2. Cursor fresh-workspace default — CLOSED. Staff-confirmed enabled-by-default
3. Cursor `state.vscdb` pre-staging feasibility — CLOSED. NOT feasible pre-first-launch; feasible post-launch when Cursor closed

---

## 2026-04-18 — Localhost HTTP/SSE deep-dive (run: 2026-04-18-localhost-http)

Answered: "Does switching from stdio to localhost HTTP/SSE change the friction picture, especially for Cowork + Cursor CLI CI?"

### New evidence files
- [localhost-http-per-harness.md](../evidence/localhost-http-per-harness.md) — per-harness localhost URL acceptance, auth relaxation, lifecycle, Cowork VM networking (#28018), friction diff, new friction introduced
- [localhost-http-oss-patterns.md](../evidence/localhost-http-oss-patterns.md) — OSS companion-app patterns, port strategies, bootstrap UX, "best practice" shape for a sidecar install

### Decisive findings

1. **Localhost HTTP does NOT rescue Cowork.** HIGH confidence.
   - **#28018:** Cowork VM sandbox denies outbound TCP to host-localhost/127.0.0.1/::1 with `EPERM`. `dangerouslyDisableSandbox: true` is the only bypass (defeats purpose).
   - Custom Connector UI demands public URLs reachable from Anthropic cloud IPs.
   - The dev.to/murat-a-a workaround actually requires supergateway INSIDE the VM or a public tunnel (Tailscale/ngrok) — "localhost" framing was misleading.
   - Per-tool approval persistence bug (#24433) is transport-agnostic — localhost HTTP doesn't help.

2. **Localhost HTTP does NOT rescue Cursor CLI CI.** CONFIRMED.
   - Approval gate (`.workspace-trusted` + `mcp-approvals.json`) is keyed by server identifier, not transport.

3. **Claude Code Desktop REJECTS plain `http://localhost`.** Canonical workaround is `mcp-remote --allow-http` stdio bridge, which reintroduces all the stdio failure modes.

4. **Net friction diff across 7 surfaces:**
   - 2/7 mildly better (Codex terminal, Cursor Desktop — skip OAuth UI for no-auth localhost)
   - 2/7 materially worse (Claude Code Desktop + Cowork — localhost blocked)
   - 3/7 neutral (Claude Code terminal, Codex desktop, Cursor CLI)

5. **NEW friction from localhost HTTP:** port allocation, process supervision (launchd/systemd/pm2), macOS firewall prompts on first bind, codesigning expectations for clean UX, sidecar-startup-vs-client-launch race (Codex `required=true` never retries), DNS-rebinding `Origin` handshake, harder uninstall/upgrade.

### Strategic implication

Stdio remains the correct primary transport for headless install. Localhost HTTP should ship **alongside** stdio for harnesses that benefit (Codex, Cursor) but cannot replace stdio — Claude Code Desktop and Cowork literally require stdio-via-`mcp-remote` at the end of any HTTP story. The "sidecar-only" approach strictly worsens 2 of 7 surfaces.

### Notable ecosystem gaps surfaced
- No public MCP server writes port to a discovery file (our own `.open-knowledge/server.lock` is ahead of the curve)
- No harness supports URL-from-file / URL-from-command discovery
- No launchd/systemd scaffolding shipped first-party by any MCP server
- MCPB manifest format has no HTTP-connect server type

---

## 2026-04-18 — Runtime MCP self-install + Cowork escape paths (run: 2026-04-18-runtime-install)

Answered two related questions:
1. Can a Cowork agent bootstrap an MCP for itself mid-session? What workarounds work?
2. Across all 7 harnesses — which support genuine runtime MCP self-registration via conversation?

### New evidence files
- [cowork-escape-paths.md](../evidence/cowork-escape-paths.md) — verification of 6 Cowork workarounds (in-VM supergateway, auto-tunnel, cloud-hosted, `dangerouslyDisableSandbox`, in-VM-only MCP, `/mcp` command). Skill/project-bootstrap behavior.
- [runtime-self-install.md](../evidence/runtime-self-install.md) — per-harness runtime-register capability matrix, skill-bootstrap analysis, precedents in the wild (`mcp-installer`, `mcp-server-restart`), strategic outlook.

### Definitive findings

1. **#24433 is closed as "NOT PLANNED"** (upgraded negative from prior "stale" finding). Anthropic officially will not ship `alwaysAllow` persistence for Cowork per-tool approvals.

2. **Codex #7767 ("reload MCP server") closed as "not planned".** Strongest negative signal of the three vendors.

3. **Cursor Desktop is the ONLY harness with a runtime MCP registration API** — `vscode.cursor.mcp.registerServer()` via Extension API. Gated on pre-installed extension. Three frictions: extension install triggers Reload Window (kills chat); persistence not documented; user trust required.

4. **All other 6 harnesses require session/app restart** to pick up newly-added MCP. None support the "agent writes config, uses it mid-conversation" pattern.

5. **`SKILL.md` + Cowork** — skills ARE shared between Claude Code and Cowork, but:
   - Skills do NOT auto-run at session start ([FR #10282 open](https://github.com/anthropics/claude-code/issues/10282))
   - Project-root `SKILL.md` is NOT auto-picked-up like Claude Code's `CLAUDE.md` — user must install to `~/.claude/skills/` first
   - A skill can instruct the agent to run boot commands, but needs user-initiated invocation

6. **Cowork paths that work TODAY** (ranked by friction):
   - Cloud-hosted MCP + Custom Connector (best, but privacy tax)
   - Pre-configured host `claude_desktop_config.json` → SDK bridge (modulo #42453)
   - Host-side supergateway + Custom Connector (requires one-time user install)
   - In-VM MCP for VM-only work (narrow utility)
   - Cloudflared ephemeral tunnel (fresh URL every session)

7. **Cowork-specific confirmed negatives:**
   - No agent self-registration API
   - No `/mcp add` slash command
   - No computer-use tool (can't click Connectors UI on user's behalf)
   - `dangerouslyDisableSandbox` does NOT apply to Cowork (it's Claude Code's sandbox, not Cowork's VM boundary)
   - No VM-to-host config write path

### "Agent installs MCP during first conversation" paradigm — verdict

**Not viable today as a single-conversation flow across any of the 7 harnesses.**

The viable degraded patterns:
1. **Two-conversation flow** — conv 1 = install, conv 2 = use. With bootstrap doc (`CLAUDE.md` / `AGENTS.md` / `.cursor/rules`) auto-steering conv 2.
2. **DXT/plugin one-click** — user-initiated, not agent-initiated
3. **Cursor Extension + `registerServer()`** — only one-conversation path, gated on prior extension install (flips bootstrap problem from MCP to extension)

**Strategic outlook:** This is a known gap every vendor tracks (open feature requests across all three). Betting on it becoming available in 6-12 months is reasonable; building on current state requires accepting two-conversation flow as baseline UX.

---

## 2026-04-24 — Path C pass: Agent Skills dimension + 6-day staleness refresh (run: 2026-04-24-skills-dim)

Added Dim 12 to the rubric + refreshed the 6-day-old Cowork MCP findings.

### New evidence files
- [cowork-skills-surface-update-2026-04-24.md](../evidence/cowork-skills-surface-update-2026-04-24.md) — programmatic Agent Skills install per harness. Verdict for Cowork: **NO** (HIGH confidence, CONFIRMED).
- [refresh-check-2026-04-24.md](../evidence/refresh-check-2026-04-24.md) — spot-check on bugs #26259 / #24433 / #26952 + Claude Code v2.1.116–v2.1.119 release notes.

### New finding: Agent Skills install surface is Claude-Code-only among our 7 harnesses

1. **`npx skills@~1.5.0` covers ~45 agent IDs** — `claude-code`, `cursor-agent`, `codex`, `gemini-cli`, `amp`, `opencode`, and many others — but **none of them is Cowork, Claude Desktop, or a transitive alias that reaches Cowork.**
2. **Cowork VM filesystem isolation is total for skills.** The VM does not mount the host's `~/.claude/skills/`. It boots with a per-session synthetic filesystem that only resolves 6 built-in Anthropic skills; user-created skills land in ephemeral `local_<uuid>/.claude/skills/` directories that get wiped on session cleanup (claude-code#31422).
3. **Sanctioned Cowork install paths are human-UI only** — per-user ZIP upload via `Customize > Skills > +` in Claude Desktop, or org-admin ZIP upload / GitHub-sync for Team+ plans. Neither is scriptable.
4. **Known bug class: "registered but not mounted"** — #26254, #31542, #39400 report metadata-registered skills not actually loading inside the VM. Zero Anthropic-staff engagement as of 2026-04-24.
5. **Cursor / Codex do not implement the Skills spec.** Cursor has `.cursor/rules/` (different convention); Codex's AGENTS.md is per-project, not user-global. Cross-harness skill reach beyond Claude Code is not achievable today without re-encoding guidance into per-tool MCP descriptions or per-project AGENTS.md.

### 6-day refresh verdict

**Parent report is still accurate.** Bug #26259 (stdio bridge) still open. Bug #24433 (per-tool re-approval) still CLOSED "not planned" (earlier 2026-04-18 `cowork-escape-paths.md` already captured this; new refresh confirms unchanged). Bug #26952 (`claude://` MCP install) still closed "not planned". Claude Code v2.1.116–v2.1.119 (Apr 20–23) shipped MCP-adjacent work (OAuth, header env-var substitution, hook→MCP invocation) but zero Cowork-specific fixes in the official changelog.

### Scope note

This Path C pass was driven by a specific question — "does `npx skills add --agent '*'` transitively cover Cowork?" — raised while building an Electron-app auto-installer (Open Knowledge). The answer is NO with high confidence. The broader ecosystem conclusion (Skills install is Claude-Code-only) also holds for any third-party developer tool evaluating cross-harness reach.
