# Evidence: Claude Desktop Agent Skills — Install Mechanisms

**Dimension:** Claude Desktop skill install paths (programmatic vs manual)
**Date:** 2026-04-22
**Sources:** Anthropic official docs, anthropics/claude-code GitHub issues, Anthropic Help Center, Admin API docs, MCP/DXT docs, community projects

---

## Primary-source anchor

**Authoritative statement from Anthropic** (docs.claude.com/platform.claude.com Agent Skills overview page):

> **Custom Skills do not sync across surfaces. Skills uploaded to one surface are not automatically available on others:**
> - Skills uploaded to Claude.ai must be separately uploaded to the API
> - Skills uploaded via the API are not available on Claude.ai
> - Claude Code Skills are filesystem-based and separate from both Claude.ai and API

> **Claude.ai** (which includes Claude Desktop): *"Custom Skills: Upload your own Skills as zip files through Settings > Features. Available on Pro, Max, Team, and Enterprise plans with code execution enabled. Custom Skills are individual to each user; they are not shared organization-wide and cannot be centrally managed by admins."*

*(Note: this "cannot be centrally managed" claim is contradicted by a later Anthropic support article — see Dimension 4 below. The primary claim about per-user manual upload remains accurate.)*

**Source:** https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (verbatim via WebFetch 2026-04-22)

---

## Key files / pages referenced

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — canonical install-surface documentation
- https://platform.claude.com/docs/en/build-with-claude/skills-guide — /v1/skills API reference
- https://platform.claude.com/docs/en/build-with-claude/administration-api — Admin API scope (proves NO skill endpoint)
- https://github.com/anthropics/claude-code/issues/40558 — "Support local filesystem skills in Claude Desktop" (CLOSED, invalid)
- https://github.com/anthropics/claude-code/issues/20697 — "Sync Skills between Claude Desktop and Claude Code CLI" (OPEN, no Anthropic response)
- https://github.com/anthropics/claude-code/issues/26952 — "Claude Desktop: custom URL schemes not opened by OS" (CLOSED, not planned)
- https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization — org-wide provisioning (Team/Enterprise only)
- https://github.com/modelcontextprotocol/mcpb — DXT/.mcpb bundle format (MCP servers only, NOT skills)
- https://github.com/instavm/open-skills — community workaround (exposes skills via MCP server)
- https://github.com/aaddrick/claude-desktop-debian — extracts app.asar; Linux reverse-engineered port (confirms Electron)

---

## Findings

### Finding 1: Consumer-tier Claude Desktop has NO programmatic skill install path
**Confidence:** CONFIRMED
**Evidence:** Primary source — Anthropic Agent Skills overview:
> "Custom Skills: Upload your own Skills as zip files through Settings > Features"

GitHub Issue #40558 closed 2026 by Anthropic as "invalid" with label `invalid` — the feature request was "support reading skills from `~/.claude/skills/` or a local `skills:` field in `claude_desktop_config.json`." No workaround offered; no timeline; no official counter-proposal.

Zero mentions of a URL scheme, CLI flag, `claude://skills/install` deep-link, or config-file path that installs skills in Claude Desktop.

**Implication:** For Pro/Max individual users (Open Knowledge's primary Claude Desktop audience), the ONLY install path is manual Settings > Features > Upload ZIP.

---

### Finding 2: Claude Desktop reads NO local skill directory (unlike MCP servers)
**Confidence:** CONFIRMED
**Evidence:** Issue #40558 body:
> "Claude Desktop can load MCP servers from local filesystem (claude_desktop_config.json), but skills can only be added via cloud upload (Customize > Skills > Upload ZIP)."

Issue #20697 (still OPEN, no Anthropic comment since 2026-01-25):
> "Skills added in Claude Desktop app (Settings → Features → Skills) are stored in a different location than skills for Claude Code CLI (`~/.claude/skills/`). Skills created in Desktop are not available in CLI. Skills created in CLI are not available in Desktop."

**Counter-signal (third-party blog, UNRELIABLE):** One search snippet from www.agensi.io claimed "Claude Desktop reads from the same `~/.claude/skills/` directory as Claude Code." This claim is NOT substantiated by any primary Anthropic source and is contradicted by both GitHub issues above. Likely aspirational/confused writing.

**Confirmed filesystem paths actually used by Claude Desktop:**
- `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) — MCP config only
- `~/.config/Claude/` (Linux) — application data, logs, singleton lock; NO skills subdirectory
- `%APPDATA%\Claude\` (Windows) — analogous

**Implication:** Pre-populating a filesystem path to seed skills is impossible because no such path is read.

---

### Finding 3: Skills uploaded via Settings > Features are stored server-side on Anthropic's infrastructure
**Confidence:** INFERRED (strong)
**Evidence:**
- Anthropic doc: *"Skills sync across all devices once uploaded"* (implies server storage, not per-device local)
- Issue #48963 (referenced in search): "Skills in `~/.claude/skills/` not being discovered" — bug reports never mention any local Desktop skill directory
- The official workaround for re-syncing is "re-upload the file" (no "clear local cache" option exists)
- Claude Desktop itself is a thin Electron app; claude.ai is webview-rendered inside the Electron shell (confirmed via HN comment by Boris Cherny that Claude Desktop is Electron, and app.asar extraction work at anthropics/claude-desktop-debian doesn't reveal any local skill-storage logic)

**Implication:** The "upload zip" action at Settings > Features is effectively `POST https://claude.ai/api/<org>/skills` (undocumented internal endpoint). Skills persist on Anthropic's servers, keyed to the user's account.

---

### Finding 4: Team/Enterprise admin console CAN provision skills org-wide — but NOT individual accounts
**Confidence:** CONFIRMED
**Evidence:** Support article "Provision and manage Skills for your organization" (support.claude.com/en/articles/13119606):
> "When you upload a skill through organization settings, it automatically becomes available to all users in your organization in Customize > Skills, which means individual users no longer need to manually upload the same skills. Admin-provisioned skills are enabled by default for everyone in your organization."

> "Navigate to Organization settings > Skills, and in the Organization skills section, click '+ Add' to select a .zip file containing your skill."

**Crucial limits:**
- Requires Team or Enterprise plan (not Pro, not Max individual, not Free)
- Still a UI-based zip upload (not API-driven)
- Anthropic's Admin API (`/v1/organizations/*`) has NO skill endpoint — only users, invites, workspaces, API keys. (Verified via full Admin API docs at platform.claude.com/docs/en/build-with-claude/administration-api)
- Provisioned skills DO appear in Claude Desktop for member users (Desktop renders claude.ai's Customize > Skills view)

**Implication:** The only "programmatic-ish" install path is: customer has a Team/Enterprise workspace + their admin manually provisions once via the admin console UI. Not helpful for consumer Open Knowledge users; potentially helpful for Enterprise customers if/when OK targets that tier.

---

### Finding 5: /v1/skills API uploads DO NOT surface in Claude.ai/Desktop
**Confidence:** CONFIRMED
**Evidence:** Anthropic Agent Skills overview:
> "Custom Skills do not sync across surfaces… Skills uploaded via the API are not available on Claude.ai"

Skills uploaded via `POST /v1/skills` (with beta headers `skills-2025-10-02` + `code-execution-2025-08-25` + `files-api-2025-04-14`) are confined to the Claude API (Workbench/Agent SDK) context. The API and claude.ai are separate data planes.

**Implication:** We can't register an OK skill via the API and have it show up in Desktop. Programmatic API upload solves a different problem (Claude API → Workbench), not the consumer Desktop problem.

---

### Finding 6: `claude://` URL scheme is for Claude Code session resume, NOT skill install
**Confidence:** CONFIRMED
**Evidence:** Issue #26952 (closed "not planned"):
> Claude Desktop does not open custom URL schemes from MCP server responses. The link handler filters to http/https only.

Issue #41015 + deepwiki notes confirm `claude://` is the scheme registered by the Claude Code URL Handler app (installed at `~/Applications/`) for:
- Session resume (`claude://resume?session=X`)
- OAuth callbacks
- CLI-to-Desktop handoff

NO `claude://skills/install` or similar operation exists. The scheme has no install-verb surface.

**Implication:** We can't use a `claude://skills/install?url=<zip>` one-click pattern analogous to `cursor://anysphere.cursor-deeplink/mcp/install?...`. There is no precedent for Anthropic implementing this — and Issue #26952 being closed "not planned" for custom-scheme support is a weak-to-moderate signal they're not inclined to add it.

---

### Finding 7: DXT / .mcpb bundles are for MCP servers only — NOT skills
**Confidence:** CONFIRMED
**Evidence:** modelcontextprotocol/mcpb README (formerly anthropic-ai/dxt):
> "Zip archives containing a local MCP server and a `manifest.json` that outlines the server's specifications and features."
> "No mention of agent skills being packaged within bundles. The documentation focuses exclusively on MCP servers."

Install model: user double-clicks `.mcpb` → Claude Desktop shows install dialog → writes to `claude_desktop_config.json`. This is a one-click install for MCP servers, but the format has no slot for `SKILL.md` or skill metadata.

**Implication:** We could ship OK as a `.dxt`/.`mcpb` bundle (one-click install for the MCP server), BUT this doesn't install the OK skill — it only installs the MCP server. The skill would still need separate manual upload.

**Sub-implication:** A clever alternative — bundle OK guidance INTO the MCP server's `instructions` field (loaded automatically on MCP init). This bypasses the skill surface entirely. See Finding 10.

---

### Finding 8: Claude Code's `~/.claude/skills/` does NOT sync to Claude Desktop
**Confidence:** CONFIRMED
**Evidence:** Anthropic docs: *"Claude Code Skills are filesystem-based and separate from both Claude.ai and API."*

Issue #20697 (open, unactioned) explicitly requests this as a feature. If it already worked, the issue wouldn't exist. No Anthropic response since 2026-01-25.

**Implication:** Installing OK via `~/.claude/skills/` (the `npx skills` CLI target) solves Claude Code but NOT Claude Desktop. They are disjoint surfaces.

---

### Finding 9: Claude Desktop updates preserve server-side skills (confirms server-side storage)
**Confidence:** INFERRED (strong)
**Evidence:** No user reports of skill loss on Claude Desktop version bumps in issue searches. Issue #48963 reports a bug where plugin-provided skills disappear from the `/` menu after v2.1.110 — but those are Claude Code plugin skills (filesystem-based), not Desktop-uploaded ones. Desktop-uploaded skills are tied to the Anthropic account, not the local install.

**Implication:** Good news for users who upload OK manually — they only do it once per account, not once per machine or per Desktop version.

---

### Finding 10: Community workaround — expose skills via MCP server instructions field
**Confidence:** CONFIRMED
**Evidence:** Issue #40558 workaround:
> "Pack schema into the MCP server's `instructions` field (loads for every conversation regardless of topic)"

instavm/open-skills takes this further: runs a local MCP server that wraps skill execution, invokable from Claude Desktop via `claude_desktop_config.json`.

MCP spec defines `instructions` on server init — Claude Desktop loads this into every conversation's system prompt when the server is active.

**Implication:** Open Knowledge's MCP server ALREADY has an `instructions` field (or can add one). Populating it with OK's guidance text is the closest thing to "programmatic skill install" for Claude Desktop. Caveat: this loads on every conversation (no progressive disclosure — consumes tokens always), not just when relevant. Might fit if OK guidance is small.

---

## Negative searches

- Searched: "claude desktop" skill install CLI automation URL scheme → no programmatic paths found
- Searched: "/v1/organizations/*/skills" Admin API → confirmed endpoint does NOT exist (Admin API scope verified verbatim)
- Searched: `~/Library/Application Support/Claude/skills/` → no official doc or community post confirms this path is read
- Searched: reverse-engineered `claude.ai/api/skills/upload` endpoint → no public docs, no community HAR captures, no Anthropic documentation (would violate ToS to reverse-engineer)
- Searched: DXT bundle format skill support → MCP-server-only, confirmed explicitly
- Searched: AppleScript / launchctl / IPC for Claude Desktop skill install → no such surface exists

---

## Gaps / follow-ups

- **UNCERTAIN:** Whether `.mcpb` bundles could theoretically be extended to include skills. No Anthropic signal either way. This is a product-roadmap question for Anthropic, not something we can influence.
- **UNCERTAIN:** Whether scripting Settings > Features ZIP upload via Electron DevTools / AppleScript UI automation is feasible. Possible but ugly; likely to break on any UI change; violates the spirit of "programmatic."
- **NOT FOUND:** Any official or unofficial one-click Desktop skill install mechanism.

---

## Ranked options for Open Knowledge (most-programmable to least)

| Rank | Approach | Programmability | Caveats |
|------|----------|-----------------|---------|
| 1 | **Bundle guidance into OK's MCP server `instructions` field** — loads on every conversation when MCP server is active | FULLY AUTOMATED (user already connects MCP via `claude_desktop_config.json`, which OK's init flow handles) | Token cost on every conversation; no progressive disclosure; must keep guidance concise |
| 2 | **Ship a `.dxt`/.`mcpb` one-click install for OK's MCP server** (which in turn carries the `instructions` payload) | FULLY AUTOMATED via double-click | User still needs to double-click the .dxt file once; not a URL-scheme one-click; requires separate build pipeline |
| 3 | **Team/Enterprise admin-console provisioning** of OK as an org-wide skill | PARTIAL (admin does it once; auto-applies to all org members' Desktops) | Team/Enterprise tier only; zero utility for Pro/Max individual users |
| 4 | **Manual Settings > Features > Upload ZIP** with clear user instructions + a `ok pack-skill` CLI command that generates the zip | MANUAL (one-time per account) | Baseline fallback; matches what every other skill provider does on Claude Desktop |
| 5 | **Script the Settings UI via Electron DevTools / AppleScript UI automation** | THEORETICALLY AUTOMATED, pragmatically fragile | Breaks on any UI change; likely violates ToS; not production-safe |

**Our read:** #1 + #2 together are the pragmatic answer. OK's MCP server is already the install vector on Claude Desktop; richer guidance belongs in the `instructions` field with progressive disclosure implemented at the MCP tool level (e.g., a `get_guidance` tool Claude can call on-demand rather than eager-loading everything). Skill-format install is genuinely manual-only on consumer Claude Desktop, so for anything we can't fit in MCP instructions, document the zip upload as a one-time user step.

---

## Red team section

### "It's manual-only for sure" — strongest evidence
1. **Primary source** (Anthropic Agent Skills overview) explicitly enumerates three install paths: claude.ai UI zip upload, /v1/skills API, Claude Code filesystem — and explicitly states they do NOT cross-sync. Claude Desktop is covered under "claude.ai" (manual zip only).
2. **Issue #40558 closed as "invalid"** by Anthropic. Feature request for filesystem skills was not accepted or roadmapped.
3. **Issue #20697 open for 3 months with zero Anthropic response** — if there were an undocumented sync mechanism, they'd either ship it or document it.
4. **Admin API has NO skill endpoint** — a conscious design choice. If Anthropic wanted programmatic org-wide skill install, they'd expose it.
5. **Issue #26952 closed "not planned"** on custom URL scheme support — rules out the `cursor://` analogue.
6. **Skills are server-side storage** (update behavior preserves them cross-device) — not a filesystem to pre-populate.

Collective weight: **HIGH.** Anthropic has made explicit product decisions to keep the consumer-tier skill install manual.

### "There's a programmatic path" — what would that path look like?
1. **Reverse-engineered `claude.ai` web API** — POST zip with session cookie. Would work technically; almost certainly violates ToS; brittle against frontend changes; not defensible as OK's supported install path.
2. **DXT extension to the bundle format** to carry skills + MCP. No Anthropic signal for this; possible future direction but no timeline.
3. **AppleScript / UI-automation hack** to drive Settings > Features > Upload ZIP. Pragmatically fragile; breaks on every Electron update; hostile UX.
4. **Browser extension** that hooks into claude.ai web app and handles upload. Would need per-browser distribution; doesn't address the Desktop-specific app; not worth it when Desktop users can just use the MCP path.

Most plausible future programmatic path: **.dxt/.mcpb extended to carry skills** (speculative). Next-most: Anthropic builds an actual `/v1/user/skills` consumer API or publishes the claude.ai internal endpoint (no signal this is coming).

### Calibrated verdict

**Consumer Claude Desktop skill install is manual-only as of 2026-04-22.** No URL scheme, no CLI, no public API, no filesystem path reads. The only programmatic-adjacent surfaces are (a) Team/Enterprise admin-console provisioning (requires paid org tier + still UI-based), (b) the `/v1/skills` API (API-only, doesn't surface to Desktop), and (c) MCP server `instructions` field (not technically "skills" but functionally equivalent for guidance delivery).

For OK's primary user segment (Pro/Max individuals on Claude Desktop), the canonical answer is: **install guidance via MCP server `instructions` + progressive-disclosure MCP tools; document a one-time manual zip upload for anything that genuinely needs the skill surface.**
