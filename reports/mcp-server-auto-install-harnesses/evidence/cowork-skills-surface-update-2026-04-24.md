# Evidence: Cowork Agent Skills install surface (Path C update 2026-04-24)

**Dimension:** D-Skills-Cowork — Agent Skills in Claude Cowork
**Date:** 2026-04-24
**Sources:** Anthropic support articles (first-party); `anthropics/claude-code` GitHub issues (#31422, #31542, #26254, #26998, #24859, #25278, #39400); `vercel-labs/skills` repo + npm registry; Anthropic Skills API docs; community reverse-engineering (`pvieito`, `aaddrick`, `agensi.io`).
**Vendor-bias flag:** Anthropic is the vendor. `support.claude.com` / `code.claude.com` / `platform.claude.com` sources are first-party. Vercel is the author of the `skills` npm package we ship against — `github.com/vercel-labs/skills` and `npmjs.com/package/skills` are first-party for that tool. Community sources (`agensi.io`, `findskill.ai`, `pvieito.com`) flagged where used.

---

## Key sources referenced

- [https://github.com/anthropics/claude-code/issues/31422](https://github.com/anthropics/claude-code/issues/31422) — "\[Cowork] User-created skills stored in ephemeral session dirs" — primary evidence of Cowork skills filesystem paths (T2, first-party tracker, no staff response)
- [https://github.com/anthropics/claude-code/issues/31542](https://github.com/anthropics/claude-code/issues/31542) — "Personal plugin skills not mounted in Cowork container despite being enabled in UI" (T2, first-party tracker)
- [https://github.com/anthropics/claude-code/issues/26254](https://github.com/anthropics/claude-code/issues/26254) — "User and Organization Skills — Metadata Registered in System Prompt but SKILL.md Files Not Mounted in Container" (T2, first-party tracker)
- [https://github.com/anthropics/claude-code/issues/26998](https://github.com/anthropics/claude-code/issues/26998) — "Claude Cowork Windows 11 Home - Skills not saving/loading" (T2, first-party tracker)
- [https://github.com/anthropics/claude-code/issues/24859](https://github.com/anthropics/claude-code/issues/24859) — "Claude Cowork for Windows, plugin skills searched at wrong location" (T2)
- [https://github.com/anthropics/claude-code/issues/25278](https://github.com/anthropics/claude-code/issues/25278) — "Claude Code plugins (e.g. frontend-design) should be available in Cowork sessions" (T2)
- [https://github.com/anthropics/claude-code/issues/39400](https://github.com/anthropics/claude-code/issues/39400) — "Marketplace plugins fail to load skills in Cowork -- zip upload of same plugin works fine" (T2)
- [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude) — "Use Skills in Claude" (T1, first-party)
- [https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization) — Org-admin skill provisioning (T1)
- [https://support.claude.com/en/articles/13837440-use-plugins-in-claude-cowork](https://support.claude.com/en/articles/13837440-use-plugins-in-claude-cowork) — "Use plugins in Claude Cowork" (T1)
- [https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization) — Org-admin Cowork plugin management (T1)
- [https://code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — "Extend Claude with skills" (T1, Claude Code docs)
- [https://github.com/vercel-labs/skills](https://github.com/vercel-labs/skills) — `skills` npm package source (T1 for the tool we use)
- [https://www.npmjs.com/package/skills](https://www.npmjs.com/package/skills) — npm registry listing (T1)
- [https://www.agensi.io/learn/where-are-claude-skills-stored](https://www.agensi.io/learn/where-are-claude-skills-stored) — third-party path catalog (T4, cross-check only)
- [https://pvieito.com/2026/01/inside-claude-cowork](https://pvieito.com/2026/01/inside-claude-cowork) — Cowork VM reverse-engineering (T4, cross-check only)

---

## Findings

### Finding 1: Cowork does NOT read skills from `~/.claude/skills/`

**Confidence:** CONFIRMED (bug reporters' empirical evidence across four independent issues; Anthropic has not contradicted).
**Evidence:** Issue #31422 (investigation table); #26998 ("user skills directory empty or inaccessible" on Windows — Cowork never populates the host path); #24859 (skills searched at wrong location on Windows); #25278 ("Claude Code plugins in `~/.claude/plugins/` are invisible to Cowork. Cowork's built-in skills are invisible to Claude Code"); #31422 quote: *"Knowledge built up in Claude Code is invisible to Cowork, and vice versa."*
**Implications:** The existing Open Knowledge install flow — `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy` — drops a skill into `~/.claude/skills/<name>/SKILL.md` for Claude Code. That file is **not** picked up by Cowork. Cowork is structurally isolated from Claude Code's user-global skills namespace despite being Anthropic's own product.

### Finding 2: Cowork reads skills from its own VM-session-scoped synthetic filesystem

**Confidence:** CONFIRMED (filesystem paths observed and documented in #31422 by users; cross-confirmed by #31542).
**Evidence:** Issue #31422 reports the concrete Cowork skills layout:

- **Built-in Anthropic skills** (persistent, read-only to user): `~/.config/Claude/local-agent-mode-sessions/skills-plugin/.../skills/` on Linux; macOS equivalent is under `~/Library/Application Support/Claude/local-agent-mode-sessions/...`. Only the 6 Anthropic-provided skills live here: `docx`, `pdf`, `pptx`, `schedule`, `skill-creator`, `xlsx`.
- **User-created skills (during session)**: `~/.config/Claude/local-agent-mode-sessions/.../local_<uuid>/.claude/skills/` — **ephemeral**, wiped on session cleanup with no warning.
- **Session VM internal path**: `/sessions/<name>/mnt/.skills/skills/` (observed from inside the VM).

The VM is constructed per-session and mounts the user's chosen project folder at `~/.config/Claude/local-agent-mode-sessions/sessions/<session-name>/mnt/` via symlink.
**Implications:** Skills for Cowork require writing into an internal Cowork-managed directory, not `~/.claude/skills/`. The paths involve per-session UUID suffixes that are allocated at session start, so a third-party installer cannot pre-populate a deterministic location. The `skills-plugin/.../skills/` root would be the only potentially persistent target — but it is undocumented and Anthropic reserves it for the 6 built-in skills.

### Finding 3: The only Anthropic-sanctioned install paths for Cowork skills are (a) UI upload and (b) org-admin ZIP / GitHub-sync provisioning

**Confidence:** CONFIRMED (first-party Anthropic support articles).
**Evidence:**

- *Use Skills in Claude* ([https://support.claude.com/en/articles/12512180](https://support.claude.com/en/articles/12512180)): "navigate to **Customize > Skills**, click the **+** button, then **+ Create skill** and upload a ZIP file containing your skill folder."
- *Provision and manage Skills for your organization* ([https://support.claude.com/en/articles/13119606](https://support.claude.com/en/articles/13119606)): "select a .zip file containing your skill (which must include a SKILL.md file), and the skill is immediately provisioned to all users in your organization. Only Organization Owners can add or remove organization-wide Skills."
- *Manage Claude Cowork plugins for your organization* ([https://support.claude.com/en/articles/13837433](https://support.claude.com/en/articles/13837433)): two paths: manual ZIP upload per plugin, or GitHub-sync a marketplace repo in `owner/repo` format.
- No HTTP API, no CLI, no filesystem path is documented as a supported install surface for individuals.
  **Implications:** Even Anthropic's own documented flows require a human in the UI. There is no documented programmatic individual-user install surface. The org-admin path requires Team/Enterprise plan + Owner role — not usable by a standalone CLI bundling its own skill.

### Finding 4: Even when the org-provisioned path is used, skills frequently fail to mount in the Cowork VM container

**Confidence:** CONFIRMED (three independent issue reports, all OPEN).
**Evidence:**

- \#26254 (OPEN): *"User and Organization Skills — Metadata Registered in System Prompt but SKILL.md Files Not Mounted in Container"* — Cowork advertises the skill in the `<available_skills>` system-prompt block but the file is missing from the VM filesystem, so invocation fails.
- \#31542 (OPEN): *"Personal plugin skills not mounted in Cowork container despite being enabled in UI. The MCP connector part of the same plugin loads correctly — only the skill is missing."*
- \#39400 (OPEN): *"Marketplace plugins fail to load skills in Cowork -- zip upload of same plugin works fine"* — proves the marketplace-sync path is less reliable than the direct-ZIP path.
- Zero Anthropic-staff comments across these three issues (consistent with the #26259/#24433 staffing pattern documented in `cowork-deep-dive.md`).
  **Implications:** Even if Open Knowledge had a way to push a skill through the org-admin flow, there is empirical evidence it would frequently fail to reach the agent at runtime. Anthropic has not acknowledged or fixed the mount race since at least early 2026.

### Finding 5: `npx skills@~1.5.0` has no `claude-cowork`, `cowork`, or `claude-desktop` agent ID

**Confidence:** CONFIRMED (via README + package-listing).
**Evidence:** The `vercel-labs/skills` agents list enumerates: `amp`, `antigravity`, `augment-code`, `bolt`, `clawdbot`, `claude-code`, `cline`, `codebuddy`, `codegpt`, `commandcode`, `continue`, `codex`, `crush`, `cursor`, `droid`, `factory`, `gemini`, `gemini-cli`, `github-copilot`, `goose`, `hermes-agent`, `kilo`, `kilo-code`, `kiro-cli`, `lovable`, `mcpjam`, `mux`, `neovate`, `openclaw`, `opencode`, `openhands`, `pi`, `playcode`, `qoder`, `qwen`, `replit-agent`, `roo`, `roo-code`, `tabby`, `tabnine`, `trae`, `vercel`, `windsurf`, `zencoder`, plus "universal" — **no `claude-cowork`, no `cowork`, no `claude-desktop`**. The `claude-code` target writes to `~/.claude/skills/` (global) or `./.claude/skills/` (project) — per Finding 1, neither path reaches Cowork.
**Implications:** `--agent '*'` today does NOT install into any Cowork-visible location. There is no feature-gap issue upstream for Cowork support (I searched the repo; if filed, it would be pending since Vercel would need a target path that doesn't exist yet).

### Finding 6: There is no cross-surface skill sharing across Anthropic's own products

**Confidence:** CONFIRMED (Anthropic's own documentation + bug reporters).
**Evidence:** Issue #31422: *"there is no shared skill or memory storage across Claude's four desktop products. Each product uses its own isolated storage silo."* Consistent with the Cowork/Claude Code MCP-config isolation documented in the parent report's `cowork-deep-dive.md`.
**Implications:** Even if Anthropic added `claude-desktop` as an install target to `skills` and mapped it to `~/.claude/skills/`, Cowork would still not see it — Cowork reads only from the VM-session synthetic filesystem. This is architectural, not a config gap.

### Finding 7: Agent Skills spec-compliance does not imply Cowork visibility

**Confidence:** CONFIRMED via Anthropic Skills docs + empirical evidence.
**Evidence:** *Agent Skills — Claude API Docs* ([https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)) defines the Agent Skills spec (SKILL.md, YAML frontmatter, progressive disclosure). Cowork runs Claude Code inside its VM, and Claude Code implements this spec. But per Findings 1-6, Cowork's *host-to-VM skills delivery* is a closed, undocumented, buggy pipeline — spec-compliance upstream does not help.
**Implications:** The distinction matters: "does Cowork consume SKILL.md files that arrive in its VM at the expected path?" is YES (via built-in + org-admin paths). "Can a third-party programmatically put a SKILL.md at a path Cowork will read?" is NO.

---

## What `npx skills@~1.5.0` actually targets (enumeration)

Per the `vercel-labs/skills` README + agents table:

| Agent ID                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Project path      | Global path         | Reaches Cowork?                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------- | ------------------------------------------------------ |
| `claude-code`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `.claude/skills/` | `~/.claude/skills/` | **NO** (Cowork ignores both paths; per #31422, #25278) |
| `cursor`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `.cursor/skills/` | `~/.cursor/skills/` | N/A                                                    |
| `codex`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `.codex/skills/`  | `~/.codex/skills/`  | N/A                                                    |
| `amp`, `antigravity`, `augment-code`, `bolt`, `clawdbot`, `cline`, `codebuddy`, `codegpt`, `commandcode`, `continue`, `crush`, `droid`, `factory`, `gemini`, `gemini-cli`, `github-copilot`, `goose`, `hermes-agent`, `kilo`, `kilo-code`, `kiro-cli`, `lovable`, `mcpjam`, `mux`, `neovate`, `openclaw`, `opencode`, `openhands`, `pi`, `playcode`, `qoder`, `qwen`, `replit-agent`, `roo`, `roo-code`, `tabby`, `tabnine`, `trae`, `vercel`, `windsurf`, `zencoder` | agent-specific    | agent-specific      | N/A                                                    |
| `universal`                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `.skills/`        | `~/.skills/`        | **NO** (Cowork does not scan this)                     |
| `claude-cowork` / `cowork`                                                                                                                                                                                                                                                                                                                                                                                                                                            | **NOT PRESENT**   | **NOT PRESENT**     | —                                                      |
| `claude-desktop`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **NOT PRESENT**   | **NOT PRESENT**     | —                                                      |

**Bottom line on `--agent '*'`:** The wildcard currently enumerates \~45 agents; **zero of them reach Cowork**. `claude-code` is the closest Anthropic-branded target, but its host-global path (`~/.claude/skills/`) is not in Cowork's read surface.

---

## Feasibility verdict

- **Programmatic skills install for Cowork today: NO.** (HIGH confidence.) The only documented install paths are:

  1. Per-user ZIP upload via `Customize > Skills > +` in the Claude Desktop UI (not scriptable).
  2. Org-admin ZIP upload or GitHub-sync via `Organization settings > Plugins` (requires Team/Enterprise plan + Owner role; not scriptable from an individual user's CLI).
  3. Session-ephemeral user-created skills (wiped on cleanup per #31422; not usable as a distribution channel).

  Even these sanctioned paths show an open "metadata listed but SKILL.md not mounted in the VM container" bug class (#26254, #31542, #39400) with zero Anthropic engagement.

- **Does the existing `npx skills … --agent '*'` flow transitively cover Cowork via Claude Code inside the VM?** NO. Per Finding 1 and #31422/#25278, the Cowork VM's Claude Code instance is a fresh install that does **not** mount the host's `~/.claude/skills/`. The host-to-VM skills channel is Anthropic's `skills-plugin` symlink path and per-session ephemeral directories, neither of which the host's `~/.claude/skills/` feeds into.

- **Recommended path for a host app (Open Knowledge CLI) shipping a skill:**
  - **Primary:** Treat Cowork as **out-of-scope for automated skills install.** Document the Cowork limitation in the README; offer users a manual path: *"To use the Open Knowledge skill in Cowork, download `<bundled skill>.zip` and upload it via `Customize > Skills` in Claude Desktop."* Ship the ZIP as a release artifact alongside the npm package.
  - **Secondary (optional):** If a user is on a Team/Enterprise plan and wants org-wide provisioning, instruct the Organization Owner to upload the skill via `Organization settings > Plugins` — but warn this may intermittently fail per #26254 / #31542.
  - **Do not** attempt to write into `~/.config/Claude/local-agent-mode-sessions/...` — the paths use per-session UUID suffixes allocated at session start, and the `skills-plugin` directory is Anthropic-reserved. An installer that dropped files there would be unsupported, likely overwritten on next Cowork update, and in violation of the product's architecture.
  - **Monitor:** #31422, #25278, #26254, #31542 for any signal that Anthropic adds cross-surface skill sharing or a documented host-to-VM install path. No movement as of 2026-04-24.

---

## Negative searches

- Searched npm/GitHub for any `claude-cowork` or `cowork` agent ID in the `skills` package registry → NOT FOUND.
- Searched Anthropic docs for any "CLI install" / "API" / "programmatic" path for Skills into Claude Desktop or Cowork → NOT FOUND. Every documented path is UI-mediated (`Customize > Skills` for users, `Organization settings > Plugins` for admins).
- Searched `anthropics/claude-code` issues for any Anthropic-staff response on #31422, #31542, #26254 → NONE.
- Searched for a `claude skill` subcommand on Claude Desktop (analogue of `claude mcp add`) → NOT FOUND. Issue #50148 (April 2026) explicitly proposes `gh skill` as a fix because "Desktop users currently have no remote source option at all."
- Searched `agentskills.io` / `agentsmd.net` specification registry for a "Cowork" signatory → Agent Skills spec exists but does not enumerate Cowork as a distinct consumer. Anthropic's API docs claim Claude Code implements it; Cowork by transitivity inherits the spec but not a reachable install path.

---

## Gaps / follow-ups

- **Unverified:** Whether a symlink from `~/.claude/skills/<name>/` into `~/.config/Claude/local-agent-mode-sessions/skills-plugin/.../skills/` would survive across sessions. #31422's original reporter claims they *"successfully symlinked skills from a centralized `~/.claude/skills/` directory into Cowork's skills-plugin directory and verified they were readable inside the VM."* This is a **single-reporter, community-source** workaround on an undocumented internal directory; Anthropic could break it on any Claude Desktop update. Not recommended as a shipped-product install path.
- **Unverified:** Whether the Cowork `skills-plugin` directory layout is identical on macOS vs. Linux vs. Windows. #26998 (Windows) reports the skills directory is "empty or inaccessible" — so even the symlink workaround may not be cross-platform.
- **Unverified:** Whether Anthropic's January–April 2026 plugin/skill rollout will converge surfaces (#31422's proposed fix: "Skills created in any product should be discoverable and usable in all others"). As of 2026-04-24 there is no roadmap signal.
- **Scope:** This evidence file focuses solely on host→Cowork skills install surface. The existing parent report (`REPORT.md` + `cowork-deep-dive.md`) covers MCP install surface and stdio bridge reliability; nothing in this update changes those findings.

---

## Confidence summary

| Claim                                                                     | Confidence                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Cowork does not read `~/.claude/skills/`                                  | CONFIRMED                                                           |
| `npx skills@~1.5.0 --agent '*'` does not cover Cowork                     | CONFIRMED                                                           |
| Cowork's sanctioned install paths are UI-only                             | CONFIRMED                                                           |
| Org-admin provisioning exists but often fails to mount SKILL.md in the VM | CONFIRMED (3 open issues, no staff fix)                             |
| Skills in the Cowork VM are architecturally isolated from the host        | CONFIRMED                                                           |
| No Anthropic roadmap signal for Cowork programmatic skills install        | HIGH (absence of evidence across 4 issues with zero staff comments) |
| Symlink workaround into `skills-plugin/` survives session cleanup         | UNCERTAIN (single community data point)                             |
