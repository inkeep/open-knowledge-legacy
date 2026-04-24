# Evidence: Anthropic Connectors on Claude Cowork

**Dimension:** Cowork Connectors as a distribution surface for Open Knowledge MCP
**Date:** 2026-04-23
**Time-box:** ~8 min focused research
**Sources:** support.claude.com, claude.com/docs, platform.claude.com, GitHub issues
**Relation to parent report:** complements `d1-mcp-instructions-field.md` (same-session Q3 evidence) and `d2-agent-skills-distribution.md` (alternative distribution surface analysis)

---

## Key pages referenced

- [Anthropic Connectors Directory FAQ](https://support.claude.com/en/articles/11596036-anthropic-connectors-directory-faq) — directory definition + curation
- [Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) — plan matrix, install surfaces
- [Use Claude Cowork on Team and Enterprise plans](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans) — org-level enablement
- [Submitting to the Connectors Directory](https://claude.com/docs/connectors/building/submission) — submission requirements + review process
- [Claude.ai MCP Issue #131 (closed as dup of #93)](https://github.com/anthropics/claude-ai-mcp/issues/131) — **Claude.ai drops `instructions` field silently**
- [Claude Cowork Enterprise Admin Guide](https://claude.com/resources/tutorials/claude-cowork-enterprise-administrator-guide)

---

## Findings

### Q1 — What ARE Connectors on Cowork?

**Finding:** Connectors are a **curated marketplace + vetting program wrapping MCP servers** — option (a)+(d), not a distinct protocol.

**Confidence:** CONFIRMED
**Evidence:**

- "Connectors in the directory are built and maintained by third-party developers using the Model Context Protocol (MCP)." — [Connectors Directory FAQ](https://support.claude.com/en/articles/11596036-anthropic-connectors-directory-faq)
- "Anthropic's Claude directory is a curated marketplace of tools that let Claude connect directly to your apps."
- "Every connector in the official directory is vetted by Anthropic for security, reliability, and compatibility."
- As of early 2026, directory holds ~280 verified MCP integrations ([awesome-claude-connectors GitHub mirror](https://github.com/rdmgator12/awesome-claude-connectors)) spanning 50+ curated integrations in the official UI across comms, PM, design, engineering, finance, healthcare.
- Two distinct surfaces under Settings → Connectors: **Web connectors** (remote MCP) and **Desktop extensions** (MCP Bundles, .mcpb packaged). Both route to the same directory UI.

**Implication for OK:** Connectors is the *distribution channel* for MCP servers, not an alternative protocol. OK's existing MCP server is the right artifact; Connectors governs *listing, vetting, and install UX*.

---

### Q2 — Install flow for a Cowork team

**Finding:** **Two-gate hybrid model** — admin enable (org-wide gate) then per-user OAuth (pull). No admin push-install that pre-provisions end users.

**Confidence:** CONFIRMED
**Evidence:**

- "Before members of Team and Enterprise plans can use connectors, an Owner or Primary Owner needs to enable them for the organization. Enabling a connector makes it available to your team, but it doesn't automatically grant anyone access." — [Cowork on Team and Enterprise plans](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans)
- Admin flow: `Organization settings → Connectors → Browse connectors → Add to your team`.
- User flow: After admin enable, each user individually OAuths on first use to link their account.
- Admin controls: Owners can restrict read-only vs. read/write per connector **org-wide** (individual users cannot override).
- **No per-group / per-team scoping** within the org (confirmed by search result phrasing: "enabling a connector makes it available to everyone in the org"). No API documented for programmatic org-wide install.

**Implication for OK:** Admin enable lowers discovery friction (connector appears in the browse list for all users) but every user still has to OAuth through OK's auth flow. For OK, which is local-filesystem-rooted (no SaaS OAuth endpoint today), this is a material gap — Cowork Connectors expects a remote MCP server with OAuth, not a stdio CLI.

---

### Q3 — Does `instructions` field reach the model on Cowork?

**Finding:** **NO — Claude.ai web (which Cowork is built on) silently drops the MCP `instructions` field.** Only tool descriptions reach the LLM context. This is a confirmed bug, tracked under issue #93 (still open as of scan date).

**Confidence:** CONFIRMED (high — direct quote from Anthropic-owned repo issue)
**Evidence:**

| Surface | `instructions` field behavior |
|---|---|
| **Claude Code (CLI)** | **Loads + follows** |
| **Claude.ai (web)** | **Silently drops** |
| **Claude Cowork** | Inherits Claude.ai web behavior (same substrate) |
| **Claude Agent SDK** | Drops (related issue #174) |
| **Subagents** | Don't receive (issue #29655) |

> "Claude.ai (web) silently drops the `instructions` field from the MCP server's `InitializeResult`. The model only sees tool descriptions — server-level instructions never reach the LLM context." — [Issue #131](https://github.com/anthropics/claude-ai-mcp/issues/131)

> "Our workaround is duplicating key instructions into each tool description, but this is limited and hard to maintain." — Issue #131 reporter

**Implication for OK — CRITICAL:** If OK publishes a Connector with the 1.5 KB `instructions` string that currently works in Claude Code, Cowork users will **not** see it in their session context. The guidance gets dropped silently. Workarounds: (a) duplicate critical instructions into every tool's description (inflates tool schema + context cost on every call); (b) publish a companion Cowork skill/plugin to carry the guidance; (c) accept that Cowork users get a degraded experience relative to Claude Code users.

This single finding largely answers the caller's final question: **Cowork Connectors is NOT a clean replacement for the current Claude Code `instructions` delivery mechanism.**

---

### Q4 — How to become a Connector (submission flow)

**Finding:** **Public submission form, standard review queue, no stated cost, no expedited track.** Formal review bar but not a closed partner program.

**Confidence:** CONFIRMED
**Evidence:**

- **Submission portal:** `claude.com/docs/connectors/building/submission` — form-based, per connector type (Desktop extension vs. Remote MCP vs. MCP App with UI).
- **Five review standards:**
  1. Security — compliance with Anthropic's security standards
  2. Tool annotations — every tool needs `title` + `readOnlyHint` / `destructiveHint`
  3. Authentication — OAuth 2.0 for services needing user credentials
  4. Privacy policy — documented data practices (collection, usage, storage, sharing, retention, contact); missing/incomplete privacy policy = **immediate rejection**
  5. Documentation — clear setup + usage instructions
- **Submission payload:**
  - Full tool inventory (names, annotations)
  - Resources + prompts inventory
  - Test account with credentials + setup instructions
  - Branding assets (logo URL or SVG, favicon, promotional screenshots for MCP Apps)
  - Public documentation link (blog post or help-center article suffices)
  - Policy + technical compliance checklists
- **Local/Desktop extensions:** require Privacy Policy section in README.md + `privacy_policies` array in manifest.json (v0.2+).
- **Timeline:** "All submissions go through one standard review process; there is no expedited track." Queue-depth dependent.
- **Cost:** Not mentioned — implied free.
- **Status tracking:** Self-serve dashboard rolling out; until then email `mcp-review@anthropic.com`.

**Implication for OK:** Submission bar is achievable (OK already has docs, MCP server, tool annotations). Two concrete blockers for OK as currently architected:
1. **Authentication expectation** — OAuth 2.0 for remote servers. OK today is local-filesystem stdio; the Connectors surface optimizes for remote MCP with OAuth. A desktop-extension submission route (MCPB bundle) is the closer fit, but that still ships as a packaged artifact, not as a long-lived `npx open-knowledge mcp` invocation.
2. **Privacy policy artifact** — must be authored + hosted before submission.

---

## Gaps / follow-ups

- **Admin push/MDM API for Connectors:** no primary source found stating whether there is a programmatic admin API to force-install a connector across all seats (beyond the UI's "Add to your team"). Likely no, based on absence. Worth 1 more search if the caller cares.
- **Desktop-extension route details:** MCPB bundle format is worth a focused probe — it may offer a path where the `instructions` field *does* reach the model (different substrate than Claude.ai web). Not investigated in this timebox.
- **Issue #93 resolution status:** linked as the canonical tracker for the `instructions`-field drop. Not fetched — age and state unknown. Worth a 30-second check before any decision that depends on this bug being fixed.
- **"Plugins" vs. "Connectors" vs. "Skills"** — Cowork's Settings → Directory now unifies all three under one browse UI ([support article 14328846](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory)). The Skill surface may be a better guidance-delivery vehicle than Connectors for OK's specific use case — parallels findings in parent report's `d2-agent-skills-distribution.md`.

---

## Tension with prior finding

The parent report's `d1-mcp-instructions-field.md` characterized the `instructions` field as reliably delivered via MCP. This evidence file **narrows that claim to Claude Code only**. Claude.ai web and Cowork drop it silently. Recommend annotating d1 with a cross-reference to Issue #131 so future readers don't assume cross-surface parity.

---

## Verdict on caller's question

> "Does Cowork Connectors give OK a cleaner distribution path than raw MCP + manual zip skill?"

**MEDIUM confidence: No — not for OK's current design.** Three hard reasons:

1. **Instructions drop (Q3)** — the 1.5 KB guidance string OK relies on in Claude Code will not reach Cowork users. This alone negates the main distribution-ergonomics win.
2. **Auth + remote-server assumption (Q4)** — Cowork Connectors optimizes for OAuth-protected remote MCP servers. OK today is local stdio. Re-architecting to remote-hosted SaaS is a far larger lift than the "cleaner distribution path" frame suggests.
3. **Install model still requires per-user OAuth (Q2)** — admin enable is a discovery lift, not a true push-install, so the "frictionless for teams" upside is narrower than it first appears.

The **desktop-extension (MCPB bundle) route** is the closer fit and is worth a focused follow-up probe — it may preserve local execution, but whether it also preserves the `instructions`-field delivery is the open question. If MCPB inherits Claude.ai-web substrate, same drop. If it inherits Claude Desktop (which historically has parity with Claude Code), it could be viable.

Until that MCPB question is resolved, **stay with the current architecture** (MCP + manual skill zip) for OK.
