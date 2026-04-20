# Evidence: Cowork Agent-Side Escape Paths

**Dimension:** Can an agent bootstrap an MCP for itself mid-session in Cowork? What workarounds actually function?
**Date:** 2026-04-18
**Sources:** Anthropic docs, GitHub issue tracker (`anthropics/claude-code`), dev.to community guide, Composio/Cua product docs, Cloudflare docs

**Vendor-bias flags:** Anthropic primary sources; dev.to/murat-a-a is single-author community; Composio / Cua / Lume cited for their own product docs (flagged where relied upon).

---

## What IS supported (confirmed functional)

- **In-VM bash available.** Cowork agent can run `npm i -g supergateway`, `npx -y <stdio-mcp>`, `curl`, `cloudflared`, etc. against `localhost` *inside the VM*
- **Inherited MCP list from host `claude_desktop_config.json`** — servers defined there are auto-bridged to the Cowork VM as `"type": "sdk"` entries
- **Skills at `~/.claude/skills/<name>/SKILL.md` shared between Claude Code and Cowork** — YAML-frontmatter + markdown; Claude auto-invokes when description matches intent ([support.claude.com/skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude))

## What is NOT supported (confirmed negative)

- **No `/mcp` runtime-register in Cowork.** `/plugin install <name>` works in Claude Code sessions, not Cowork task mode. Cowork surfaces MCPs only via host Settings UI.
- **No agent self-registration API.** No Anthropic doc, issue, or community post documents an in-session API for the VM agent to mutate its own MCP roster mid-conversation. Issue [#42453](https://github.com/anthropics/claude-code/issues/42453) confirms the VM spawner's MCP list is **fixed at spawn time** and can't be extended.
- **No computer-use in Cowork.** Desktop's computer-use tool only controls the host GUI — the VM cannot remote-control the host to click Settings → Connectors UI on the user's behalf ([code.claude.com/sandboxing](https://code.claude.com/docs/en/sandboxing))
- **No VM-to-host config write path** — files written inside VM do NOT sync to host `claude_desktop_config.json` unless the user explicitly mapped that exact path (NOT the Cowork default)

---

## Skills as a boot/connect mechanism

**Critical finding — skills work but don't auto-run:**

- Skills at `~/.claude/skills/` are shared between Claude Code and Cowork
- **Skills are NOT auto-run at session start.** They load only when triggered by conversation context or explicit `/` invocation
- **Project-root `SKILL.md` is NOT auto-picked-up like Claude Code CLI's `CLAUDE.md`** — user must install into `~/.claude/skills/` first
- Feature request [#10282](https://github.com/anthropics/claude-code/issues/10282) (auto-execute slash commands on session start) is **still open**
- **`CLAUDE.md` / `AGENTS.md` in project root are NOT documented as read by Cowork task mode**

**Practical boot-skill shape that DOES work today:** A skill whose description says "use this when the user first connects MCP XYZ in Cowork" and instructs Claude to `npx supergateway --stdio <pkg> --port <N>` inside the VM, then print the localhost URL for the user to paste into Settings → Connectors. **The user still clicks through connector setup.**

---

## Workarounds — verified vs refuted

### (a) In-VM supergateway bootstrap

**Feasibility:** FUNCTIONAL in-VM, but **limited utility**
**Evidence:** [GH #28018](https://github.com/anthropics/claude-code/issues/28018), [dev.to/murat-a-a](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc)

- `npm i -g supergateway; supergateway --stdio "npx -y <mcp>" --port 8001` runs fine inside the Cowork VM
- **In-VM `localhost:8001` is reachable from other in-VM processes** — the #28018 loopback block is a host-to-VM / sandbox-to-host problem, NOT intra-VM
- **Reality check:** the dev.to guide that popularized this actually runs supergateway on the **host**, not in the VM, and points the Cowork custom connector at the **host** URL. In-VM-only supergateway only functions if the MCP doesn't need host resources

### (b) Auto-tunnel (cloudflared quick tunnel)

**Feasibility:** FUNCTIONAL
**Evidence:** [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

- `cloudflared tunnel --url http://localhost:8001` inside the VM mints ephemeral `*.trycloudflare.com` URL, no Cloudflare account needed
- MCP must use Streamable HTTP transport (quick tunnels don't support SSE)
- **UX:** Agent starts supergateway + cloudflared in-VM → prints fresh URL → user copies into Settings → Custom Connector
- **Ephemeral** — URL changes every restart; user re-edits the connector entry every session
- No uptime SLA

### (c) Cloud-hosted MCP

**Feasibility:** FUNCTIONAL and **most robust path**
**Evidence:** [support.claude.com/custom-connectors](https://support.claude.com/en/articles/11175166)

- Custom Connectors explicitly support public URLs + OAuth on Free/Pro/Max/Team/Enterprise
- Proven production pattern: Rube, Composio, Lansweeper all deliver this way
- **UX:** Paste URL once, OAuth, done
- **Per-tool approval on first use still applies per-session** (#24433)
- **Privacy caveat:** All user data round-trips through your cloud — disqualifies MCPs that need local filesystem access

### (d) `dangerouslyDisableSandbox`

**Feasibility:** DOES NOT apply to Cowork
**Evidence:** [code.claude.com/sandboxing](https://code.claude.com/docs/en/sandboxing)

- Per-bash-command flag in **Claude Code's** OS-level Seatbelt/bubblewrap sandbox — applies to Claude Code CLI's per-command layer
- Cowork isolation is a full Apple Virtualization / WSL2-HCS **VM**, not per-command Seatbelt
- `dangerouslyDisableSandbox` gives you nothing against a VM boundary — **no VM escape hatch documented**
- The #28018 loopback block is Claude Code's sandbox; in Cowork the equivalent barrier is the VM's network NAT

### (e) Fully in-VM MCP

**Feasibility:** FUNCTIONAL but limited
**Evidence:** dev.to/murat-a-a, [cua.ai/claude-cowork](https://cua.ai/docs/lume/examples/claude-cowork/sandbox) (Cua vendor doc)

- MCPs that only touch VM resources (files in mapped workspace, VM-local processes) run fine
- Node/Python MCPs started from `claude_desktop_config.json` already run this way under SDK bridge
- **Limitation:** No access to host-only resources — macOS Keychain, host `~/.ssh` outside workspace map, host-side Docker, host browsers
- For host access: use paths (a)/(b)/(c) or Cua/Lume MCP (runs on host, manages VMs as a connector)

### (f) `/mcp` command in Cowork

**Feasibility:** REFUTED
**Evidence:** [code.claude.com/mcp](https://code.claude.com/docs/en/mcp), [Composio guide](https://composio.dev/content/how-to-better-your-claude-cowork-experience-with-mcps)

- `/plugin install <slug>` exists for Claude Code CLI and subset of Cowork plugin flows
- **No slash command lets the agent self-register an arbitrary MCP mid-task**
- Plugin marketplace is curated, not open runtime API

---

## Hot-reload

- **Edit `claude_desktop_config.json` → restart required.** Full quit + relaunch of Claude Desktop (and thus Cowork VM) is the supported path
- **Developer → Reload MCP Configuration** on Claude Desktop's host menu avoids a full quit; **not a programmatic API**
- **Claude Code's `/reload-plugins`** works for plugins mid-session but does NOT apply to Cowork task mode
- **No VM-to-host config write path documented**

---

## Per-tool approval bypass (#24433) — NEW DEFINITIVE

**Confidence:** CONFIRMED NEGATIVE (stronger than prior "stale" finding)
**Evidence:** [GH #24433](https://github.com/anthropics/claude-code/issues/24433)

> Issue #24433 is **closed as not-planned**

This is a stronger statement than "closed as stale." Anthropic has officially declined to fix per-tool approval persistence.

- No `alwaysAllow` config key shipped or planned
- No enterprise pre-approval mode
- No admin auto-approve
- Session state sits at `~/Library/Application Support/Claude/local-agent-mode-sessions/`, blank each time
- `--permission-mode` / `--allowed-tools` are Claude Code CLI flags, **not wired into Cowork task startup**

**Best palliative:** servers that expose 1–2 tools rather than 40 cut approval clicks. Skills bundle instructions so the agent asks for right tools in right order — user isn't guessing what to approve.

---

## Scenario verdicts

| Scenario | Achievable? | Notes |
|---|---|---|
| **A — user pre-installed MCP on host → fresh Cowork session, agent helps bootstrap** | **PARTIAL** | If MCP in `claude_desktop_config.json`, SDK bridge makes it available (modulo #42453 regressions). Agent can coach approvals. No connection work by agent. |
| **B — nothing installed, agent installs mid-session** | **NOT ACHIEVABLE for host-backed MCPs** | Agent can install/run anything in-VM but can't reach host to edit config or click Connectors UI. For in-VM-only MCPs: feasible. |
| **C — project ships `SKILL.md`, Cowork reads it** | **PARTIAL** | Cowork reads skills from `~/.claude/skills/` ✓, but project-root `SKILL.md` requires user to install into `~/.claude/skills/` first (NOT like Claude Code's `CLAUDE.md`). Skills don't auto-run at session start (FR #10282 open). Skill CAN instruct Claude to run boot commands on first turn, but needs user-initiated invocation. |
| **D — public-hosted MCP + Custom Connector** | **ACHIEVABLE** | Paste URL → OAuth → done. Per-session tool approvals remain. Best UX today, paid by privacy tax of cloud routing. |

---

## Bottom-line

**Is there ANY path for Cowork that works today? YES, but none are "agent installs its own MCP in a stock session with no prior user setup."**

Ranked by friction:

1. **Cloud-hosted MCP + Custom Connector (D)** — single paste + OAuth, works
2. **Pre-configured host `claude_desktop_config.json` → SDK bridge (A)** — works for most Desktop MCPs; agent can still coach
3. **Host-side supergateway + Custom Connector** — works, requires user to install supergateway + pm2 on host once
4. **In-VM MCP for VM-only work** — works, narrow utility
5. **Ephemeral cloudflared tunnel** — works mechanically, fresh URL every session

**No path gets past #24433's per-tool approval re-prompting.** **No path lets an agent mutate host config from within the VM.**

For a product author, the least-friction shape is:
- Ship MCP as a public HTTP server (cloud-hosted), OR
- Provide a one-command host-side installer + ship a SKILL.md that tells Cowork how to use it post-install

---

## Gaps / UNCERTAIN

- **Windows `\\wsl$\...` config write from VM** — whether a VM write to `/mnt/c/Users/<name>/AppData/Roaming/Claude/` propagates to hot-reload not live-verified
- **`plugin install` in Cowork vs Claude Code** — Composio implies it works in Cowork; Anthropic docs only clearly show it in Claude Code
- **Auto-run skills FR #10282** — if it lands, Scenario C becomes fully achievable

---

## Sources (all accessed 2026-04-18)

- [Claude Cowork sandbox issue #28018 (host loopback)](https://github.com/anthropics/claude-code/issues/28018)
- [Claude Cowork SDK bridge issue #42453 (MCP disabled)](https://github.com/anthropics/claude-code/issues/42453)
- [MCP approval persistence issue #24433 (closed not-planned)](https://github.com/anthropics/claude-code/issues/24433)
- [Auto-run slash commands FR #10282](https://github.com/anthropics/claude-code/issues/10282)
- [Claude Code sandboxing + `dangerouslyDisableSandbox`](https://code.claude.com/docs/en/sandboxing)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Use Skills in Claude (Cowork)](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [dev.to — Local MCPs in Cowork (supergateway pattern)](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) — UNCERTAIN, single author, pm2/supergateway promotion
- [Cua/Lume Claude Cowork MCP](https://cua.ai/docs/lume/examples/claude-cowork/sandbox) — vendor bias
- [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Composio — MCPs in Cowork](https://composio.dev/content/how-to-better-your-claude-cowork-experience-with-mcps) — vendor bias
- [Claude Code MCP (`/reload-plugins`, `/plugin install`)](https://code.claude.com/docs/en/mcp)
