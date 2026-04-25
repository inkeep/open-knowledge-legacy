---
title: "MCP Guidance Delivery Without Project-Dir Pollution"
description: "How should an MCP server like Open Knowledge deliver behavior-shaping agent guidance — STOP rules, tool-call prerequisites, authoring conventions — without writing to the user's project directory? Evaluates MCP `instructions` handshake, Agent Skills (cross-host SKILL.md), per-host global-rule surfaces, companion-skill precedents, and layered hybrid strategies."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - Model Context Protocol
  - Agent Skills
  - agentskills.io
  - Claude Code
  - Cursor
  - OpenAI Codex
  - Windsurf
  - VS Code Copilot
  - GitHub Copilot
  - Claude Desktop
  - XcodeBuildMCP
  - Figma MCP
  - Playwright MCP
  - Notion MCP
  - AGENTS.md
  - CLAUDE.md
  - Open Knowledge
topics:
  - MCP instructions field
  - cross-host agent guidance
  - SKILL.md distribution
  - user-global agent surfaces
  - project-directory pollution
  - progressive disclosure
  - companion-skill pattern
  - tool-description-embedded guidance
  - init command UX
---

# MCP Guidance Delivery Without Project-Dir Pollution

**Purpose:** Open Knowledge currently writes an "Open Knowledge" section into the user's root `AGENTS.md` and `CLAUDE.md` at `ok init` time. The user finds this intrusive — project-root files are user territory — and asked whether guidance can move entirely off the project directory while still reliably steering agent behavior (STOP rules on native tool usage, preview-before-edit sequence, wiki-link authoring, etc.). This report maps the delivery surfaces available across the major agent hosts, surveys what comparable MCP servers do, and recommends a path.

---

## Executive Summary

**Open Knowledge's current project-file injection is an ecosystem outlier.** Surveyed MCP servers (Linear, GitHub, Notion, Figma, Playwright, Vercel, Stripe, Sentry XcodeBuildMCP, Render) share one norm: register the MCP server in user-global editor config, ship behavioral guidance via (a) the MCP `instructions` handshake string and/or (b) tool `description` fields and/or (c) a companion SKILL.md installed to `$HOME`. **None** were found writing to the user's project-tracked `CLAUDE.md` / `AGENTS.md`. Dropping project-dir writes aligns OK with the ecosystem — no novel distribution risk.

**Recommendation — layered hybrid centered on a cross-host skill.** Ship guidance via three complementary surfaces, each tuned to its delivery contract:

1. **MCP `instructions` handshake** — ≤ 1500 bytes, STOP rules only + pointer to the skill. Always-on when OK MCP is connected. Binds Claude Code's documented 2KB per-server truncation cap.
2. **Per-tool `description` fields** — each tool's description carries its own call-site prerequisites (e.g. `write_document`'s description names the `get_preview_url`-first contract). Always in context when tool is callable. Mirrors Notion's documented approach.
3. **User-global Agent Skill** — a single SKILL.md installed to `~/.agents/skills/open-knowledge/` (covers Cursor + Codex + VS Code Copilot) with symlinks to `~/.claude/skills/` (Claude Code) and `~/.codeium/windsurf/skills/` (Windsurf). Description matches markdown-editing intent; `paths: '**/*.md,**/*.mdx'` (Claude Code) locks auto-activation to markdown work. Carries the full content currently living in CLAUDE_MD_SECTION.

**Total project-dir footprint: zero root-level writes.** `.open-knowledge/config.yml` + `.open-knowledge/.gitignore` remain (they're OK's own directory, scaffolded on opt-in). The `.open-knowledge/AGENTS.md` internal README — which nothing actually reads — goes away.

**Key Findings:**

- **The MCP `instructions` field is a spec-level "hint," not a guarantee.** Per the 2025-11-25 MCP schema it's `OPTIONAL` and described as something clients `MAY` include in the system prompt. Claude Code includes it at up to 2KB per server, recomputed every turn. Cursor's handling is undocumented. Non-Claude hosts' behavior varies.
- **Agent Skills is a cross-host open standard with 36+ adopting products.** Originally released by Anthropic, now community-governed at agentskills.io. Claude Code, Claude (consumer), Cursor, OpenAI Codex, GitHub Copilot, VS Code, Windsurf (Cascade), Amp, OpenCode, OpenHands, Goose, Gemini CLI, Kiro, Junie (JetBrains), and ~20 more all implement the same SKILL.md format with progressive disclosure.
- **Skill install paths converge on `~/.agents/skills/`** — Cursor, Codex, VS Code Copilot all read this path. Claude Code (`~/.claude/skills/`) and Windsurf (`~/.codeium/windsurf/skills/`) remain host-specific. Two symlinks + one write covers 5-of-6 major hosts.
- **Skills survive compaction better than MCP `instructions`.** Claude Code allocates 5,000 tokens per invoked skill post-compaction (25,000 tokens total across all skills). MCP `instructions` is re-injected fresh every turn at 2KB/server. Skills carry ~10× the content of handshake-only delivery for ~same per-turn cost.
- **Claude Code "plugin" format bundles skills + MCP + agents + hooks for marketplace install.** OK could ship as a Claude Plugin installable via `/plugin install open-knowledge` — zero terminal, zero project-dir writes. Claude Code-only path, but additive.
- **Sentry's XcodeBuildMCP is the closest existing precedent** — `xcodebuildmcp init` installs MCP registration AND optionally installs a companion user-global skill, with `--print`/`--dest` affordances. Their docs explicitly note the MCP-skill is "optional when using the MCP server, as Claude already receives MCP guidance through server instructions." OK's situation differs — our current CLAUDE_MD_SECTION is ~3.5KB, exceeding the 2KB handshake cap — so skill content is load-bearing.
- **Pure-`instructions` delivery has an empirically-documented failure mode.** Playwright MCP guides consistently advise "Explicitly say 'Playwright MCP' in your first message, as Claude sometimes defaults to running Playwright through Bash commands instead." Same failure shape as OK trying to prevent native-Read on `.md`. Skills + tool-description-embedded guidance are complementary mitigations.
- **MCP `prompts` cannot replace always-on guidance** — they're user-invoked by spec (`"an MCP client will never automatically invoke a prompt"`). They're an orthogonal, user-driven workflow surface — useful for `/ok:consolidate` etc. but not a CLAUDE.md replacement.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | MCP `instructions` field — spec, lifecycle, host behavior | P0 | Deep |
| D2 | Agent Skills / SKILL.md as distribution mechanism | P0 | Deep |
| D3 | Cursor / Windsurf / Codex / VS Code global surfaces | P0 | Moderate |
| D4 | Comparable MCP servers' guidance delivery patterns | P0 | Deep |
| D5 | Minimal-anchor patterns (one-liner, prompts, tool descriptions) | P1 | Moderate |
| D6 | `open-knowledge init` UX under file-free mode | P1 | Moderate |

Stance: **Conclusions** (user explicitly asked for a recommendation).

Non-goals: detailed content of the new skill/instructions string; actual code changes to `packages/cli/src/`; migration path for users who already have the injected section in their CLAUDE.md.

---

## Detailed Findings

### D1 — MCP `instructions` field: a useful hint, not a contract

**Finding:** The `instructions` field on MCP `InitializeResult` is formally optional per the spec and described as a "hint" the client `MAY` add to the system prompt. In practice, Claude Code includes it (up to 2KB per server, recomputed every turn), Cursor's handling is undocumented, and other hosts are best-effort. Not load-bearing enough alone for multi-point behavior steering.

**Evidence:** [evidence/d1-mcp-instructions-field.md](evidence/d1-mcp-instructions-field.md)

**Implications:**

- OK's current CLAUDE_MD_SECTION is ~3.5KB. If that content lived entirely in the MCP `instructions` string, Claude Code would silently truncate everything past ~2KB. STOP rules on native tool usage (which sit early) survive; wiki-link authoring conventions (which sit late) get cut.
- Cross-host variance means you cannot rely on `instructions` being consumed uniformly. Cursor/Codex/Windsurf — we have no empirical evidence they reliably inject the full string.
- `instructions` is well-suited for STOP rules that MUST be present in every session, BUT the content must be ruthlessly compressed (≤1500 bytes target) with the most load-bearing content front-loaded.

**Decision triggers:** Critical when total guidance exceeds ~2KB OR when guidance must survive on non-Claude hosts. Less critical when the full guidance fits in ~1500 bytes AND Claude Code is the primary target.

**Remaining uncertainty:**

- Claude Desktop's handling of `instructions` (no decompilation analysis available).
- Long-session drop behavior under compaction across hosts — the "recomputed every turn" contract suggests it survives, but this is Claude Code-specific documentation.

---

### D2 — Agent Skills is a cross-host standard that carries extended guidance via progressive disclosure

**Finding:** SKILL.md is an open-format standard adopted by 36+ agent products including Claude Code, Claude (consumer), Cursor, OpenAI Codex, GitHub Copilot, VS Code Copilot, Windsurf/Cascade, Amp, OpenCode, OpenHands, Goose, Gemini CLI, and ~24 more. The format is a directory with YAML-frontmatter markdown; `description` is loaded into metadata at session start (1,024–1,536 char budget per host), body loads only on activation-match. Skills survive compaction with a 5,000-token allocation each in Claude Code.

**Evidence:** [evidence/d2-agent-skills-distribution.md](evidence/d2-agent-skills-distribution.md)

**Implications:**

- A single `SKILL.md` file is portable across the six hosts OK explicitly supports (Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf) and ~30 more via the same format. This has no equivalent in the "always-on file" category (CLAUDE.md, AGENTS.md, User Rules, global_rules.md are all per-host).
- `description` + `when_to_use` is the activation lever. For OK: `description: "Guidance for Open Knowledge markdown workflows — STOP rules for native file tools, preview-before-edit sequence, wiki-link conventions. Use whenever writing/editing markdown, calling write_document/edit_document, or when Open Knowledge MCP tools are available."` — this matches on multiple common user intents.
- Claude Code's `paths: '**/*.md,**/*.mdx'` frontmatter locks auto-activation to markdown-touching turns, scoping cost precisely to relevance. (Cross-host fallback: description-matching alone, looser.)
- Dynamic injection via `!`command`` lets the skill pull resolved `content.dir`/`include`/`exclude` at activation time, matching current `buildInstructions` behavior (Claude Code-specific).

**Decision triggers:** Skills are the right primary surface when: guidance is >2KB, must work on >1 host, or benefits from progressive disclosure.

**Remaining uncertainty:**

- Cross-host `paths:` support (Claude Code-specific today).
- Skill install conflict policy when the same skill exists at multiple paths (`~/.agents/skills/` vs `~/.claude/skills/`).

---

### D3 — Every host has a different always-on guidance surface; skills are the only shared one

**Finding:** User-global guidance surfaces are host-specific and fragmented. Claude Code uses `~/.claude/CLAUDE.md`; Cursor uses Settings > Rules (not filesystem); Codex uses `~/.codex/AGENTS.md`; Windsurf uses `~/.codeium/windsurf/memories/global_rules.md` (6000-char cap). Only the Agent Skills paths converge (`~/.agents/skills/`).

**Evidence:** [evidence/d3-user-global-guidance-surfaces.md](evidence/d3-user-global-guidance-surfaces.md)

**Implications:**

- The "always-on file" surface family requires 4 separate writes to 4 different paths for full host coverage. Cursor's User Rules aren't even filesystem-writable — programmatic global-rule install in Cursor is fundamentally blocked. This rules out a "write one global file per host" strategy.
- The Agent Skills surface requires 1 write + 2 symlinks for 5-of-6 host coverage (Windows symlink caveats aside). This is the only tenable cross-host user-global channel.
- Windsurf's 6000-char cap on `global_rules.md` is tight — adding OK-scale content would eat into the user's own budget.
- Codex can read `~/.codex/AGENTS.md` but (a) the feature is reported-buggy across versions and (b) writing there is still "writing to someone's AGENTS.md," which conflicts with the user's "don't pollute" stance at user scope too.

**Decision triggers:** Always-on files are usable when targeting a single host AND OK accepts host-level fragmentation. Skills dominate whenever cross-host coverage matters.

---

### D4 — Comparable MCP servers deliver guidance via handshake + tool descriptions + optional companion skills; none write to project files

**Finding:** Linear, GitHub, Notion, Figma, Playwright, Stripe, Vercel, and Render MCP servers all deliver guidance via some combination of (a) MCP `instructions` handshake, (b) per-tool `description` fields, (c) optional companion SKILL.md the user installs voluntarily. None write `CLAUDE.md` / `AGENTS.md` sections. Sentry's XcodeBuildMCP is the closest to OK's current architecture — its `xcodebuildmcp init` registers the MCP server and optionally installs a companion global skill, explicitly noting the MCP-skill is supplementary to the always-present `instructions` string.

**Evidence:** [evidence/d4-comparable-mcp-server-patterns.md](evidence/d4-comparable-mcp-server-patterns.md)

**Implications:**

- Dropping OK's CLAUDE.md / AGENTS.md writes aligns OK with ecosystem norm. No distribution-shape risk from the change.
- Notion's pattern — "embed guidance in tool descriptions" — is directly applicable. Per-tool `description` is ALWAYS in context when the tool is callable (subject to the same 2KB cap per tool description in Claude Code), so it's a reliable place for tool-call-local prerequisites ("call `get_preview_url` before `write_document`").
- XcodeBuildMCP provides empirical precedent for the companion-skill-via-init pattern: one `init` command sets up both MCP registration and skill. OK's `ok init` can follow the same shape.
- Playwright MCP's documented failure mode — agents defaulting to Bash despite `instructions` — is direct empirical evidence that handshake-only delivery is insufficient for strong behavioral priors. The same failure shape is what OK needs to prevent (native Read/Grep on `.md`).

**Decision triggers:** If OK's goal is ecosystem parity → drop project-file writes immediately. If goal is maximum reliability of behavior steering → layer surfaces, don't pick one.

---

### D5 — MCP `prompts` can't replace always-on guidance; tool descriptions are the reliable tool-local surface

**Finding:** MCP `prompts` are user-invoked by spec — hosts never auto-invoke them. They complement but don't replace always-on CLAUDE.md-style guidance. Per-tool `description` fields are ALWAYS in context when the server is connected (subject to host-specific caps, 2KB per tool in Claude Code) — making them the most reliable delivery surface for tool-call-local guidance. Dynamic/state-aware descriptions are possible via `tools/list` re-queries.

**Evidence:** [evidence/d5-minimal-anchor-patterns.md](evidence/d5-minimal-anchor-patterns.md)

**Implications:**

- Prompts are NOT a substitute for the guidance OK currently ships — they can still be useful as user-invoked workflow affordances (`/ok:start-research`, `/ok:consolidate`), but that's an orthogonal feature.
- Per-tool descriptions should carry tool-specific prerequisites. `write_document.description` should name the preview-first contract; `edit_document.description` likewise; `exec.description` should name that it routes markdown reads through OK (helping agents pick it over native Read/Grep for markdown).
- Dynamic tool-list capability (`tools.listChanged: true`) lets descriptions flex to runtime state — e.g. `write_document` description could say "NO PREVIEW CLIENT ATTACHED: call `get_preview_url` + open it first" only when no client is listening.
- The "one-liner in user's AGENTS.md" pattern (e.g. "This repo uses Open Knowledge; see MCP server instructions") is not recommended — it still requires writing to the user's project file, which is the thing they want to avoid. Community convention holds AGENTS.md entries should be author-authored, not tool-injected.

---

### D6 — `ok init` becomes lighter-footprint, not simpler-to-implement

**Finding:** File-free mode drops 2 of 5 `ok init` steps (the `.open-knowledge/AGENTS.md` internal README and the root `upsertRootInstructions`) and adds a new step (install user-global skill + per-host symlinks). Net complexity similar; net footprint on project dir goes from "writes inside `.open-knowledge/` + root AGENTS.md + root CLAUDE.md" to "writes inside `.open-knowledge/` only." Skill install is one-time per machine; subsequent `ok init` invocations in other projects can skip it via version detection.

**Evidence:** [evidence/d6-init-ux-under-file-free-mode.md](evidence/d6-init-ux-under-file-free-mode.md)

**Implications:**

- `ok init` continues to be the blessed install path. New steps: install skill at `~/.agents/skills/open-knowledge/` + create symlinks to `~/.claude/skills/` and `~/.codeium/windsurf/skills/` (or fallbacks per OS).
- A lighter-weight install path becomes available: Claude Code users can `/plugin install open-knowledge` from inside the editor (once OK is published to the Anthropic marketplace as a Claude Plugin). Zero terminal, zero project-dir writes. Plugin format bundles MCP + skill as one unit.
- Version update story: `ok init --force` overwrites the skill if a newer version ships. Plugin-marketplace installs get `/plugin update`. Static-file installs stay pinned until user re-runs.
- The server can defensively detect skill presence at startup and warn if missing/out-of-date ("Open Knowledge skill not detected — run `ok init` to install it for fuller guidance").

---

## Recommendation

**Execute this migration:**

1. **Remove root `CLAUDE.md` + `AGENTS.md` writes entirely.** Delete `upsertRootInstructions` from `packages/cli/src/commands/init.ts` and `CLAUDE_MD_SECTION` / related from `packages/cli/src/content/init.ts`. Existing injected sections in users' repos are left alone — users delete them on their own schedule. If we want to be extra polite, ship an `ok uninstall-guidance` subcommand that removes the marker block if present.

2. **Remove `.open-knowledge/AGENTS.md` scaffolding.** It's a static README nothing reads; `config.yml`'s inline comments cover the useful content.

3. **Author a single `open-knowledge` Agent Skill** at `~/.agents/skills/open-knowledge/SKILL.md`. Port the current CLAUDE_MD_SECTION content into the skill body. Frontmatter shape:

   ```yaml
   ---
   name: open-knowledge
   description: Guidance for working with Open Knowledge — a markdown-CRDT collaboration server exposed via MCP. STOP rules for native file tools on .md/.mdx (use exec/read_document/search instead), preview-before-edit sequence (get_preview_url → open browser → write_document), wiki-link authoring conventions. Active whenever you are reading, editing, or creating markdown in a project with Open Knowledge MCP connected.
   paths: "**/*.md, **/*.mdx"
   ---
   ```

4. **Update `ok init`** to (a) write the skill to `~/.agents/skills/open-knowledge/`, (b) create symlinks `~/.claude/skills/open-knowledge` and `~/.codeium/windsurf/skills/open-knowledge` pointing at the canonical copy (fallback to copy if symlinks aren't supported). This gives 5-of-6 host coverage in one write + two symlinks.

5. **Compress the MCP `instructions` string** (currently ~3.5KB via `buildInstructions`) to ≤1500 bytes. Keep only the top-priority STOP rules + a pointer: "Full guidance is in the `open-knowledge` Agent Skill (should auto-activate when editing markdown). If the skill isn't available, run `npx @inkeep/open-knowledge init` to install it."

6. **Embed tool-call-local guidance in per-tool descriptions.** `write_document`, `edit_document`, `exec`, `search`, `get_preview_url` each carry their own call-site prerequisites. Target ≤500 bytes per description.

7. **(Optional, additive) Publish as Claude Code plugin** on the Anthropic marketplace. Zero-terminal install path for Claude Code users.

**Why this layered posture vs picking one surface:**

- MCP `instructions` is the only always-on surface that works cross-host with zero user install (agent attaches MCP, gets instructions). It's the right carrier for critical STOP rules.
- Tool descriptions are the only surface guaranteed to be in context at the exact moment a tool is relevant. Right carrier for tool-call local prerequisites.
- Skills carry the extended content with progressive disclosure and cross-host portability. Right carrier for the full behavioral manual.
- These surfaces degrade gracefully: if the skill isn't installed, STOP-rules still deliver via `instructions`; if `instructions` gets truncated, the skill catches what's past the cap; if a host doesn't honor `instructions`, tool descriptions still fire when tools are called.

**Main trade-offs:**

| Trade-off | Assessment |
|-----------|------------|
| Skills require user-global install (one-time per machine) | Acceptable — `ok init` handles it, subsequent projects pay nothing. |
| Non-Claude hosts don't honor `paths:` frontmatter for skill auto-activation | Acceptable — cross-host activation via description matching is looser but functional. |
| Skill content can go stale vs current `buildInstructions` dynamic output | Mitigatable — skill can use `!`command`` injection on Claude Code; static-fallback for other hosts is a known tradeoff the ecosystem accepts. |
| No precedent for "pure MCP server without any project-dir writes doing serious behavior steering" as commonly as there is for the handshake-only pattern | Playwright MCP's documented "agents still default to Bash" failure is a real signal. Hybrid posture (skills + instructions + tool descs) is insurance against that failure class. |
| Shipping as a Claude Code plugin adds submission/review to Anthropic's marketplace | Optional — the CLI `ok init` path remains primary; plugin marketplace is an additive distribution channel for Claude Code users who prefer no-terminal install. |

**What it buys us:** alignment with MCP ecosystem norms; zero project-dir root-level writes; cross-host guidance delivery via one install artifact; resilience under Claude Code's 2KB `instructions` cap; empirical validation via the XcodeBuildMCP precedent.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Empirical adherence data:** No public study measures "agents follow MCP `instructions` guidance X% of the time vs Y%." Playwright's documented failure is qualitative. A quantitative study would strengthen the case for layered surfaces vs handshake-only, but isn't available.
- **Claude Desktop (consumer) skills support scope:** Listed on agentskills.io but no public docs detailing skill install paths for the consumer app specifically. Assumed to follow `~/.claude/skills/` but not confirmed.
- **Windows symlink behavior:** `ok init` creating symlinks across `~/.agents/skills/` ↔ `~/.claude/skills/` ↔ `~/.codeium/windsurf/skills/` works cleanly on macOS/Linux. Windows requires developer mode or admin for symlinks; fallback to file copy is likely needed. Execution detail, not research concern.

### Out of scope (per rubric)

- Implementation of the migration in OK's codebase (separate task).
- The actual content of the new skill/`instructions` string (user authoring task).
- Migration path for users with the existing injected CLAUDE_MD_SECTION in their `CLAUDE.md` / `AGENTS.md` (product design task).

### Gaps and follow-ups

- Claude Code's MCP "instruction delta mode" — newer delivery variant mentioned in decompilation analyses but not deeply documented. Could affect the 2KB cap.
- Agent Skills activation-reliability empirics — no public data on how often description-matching actually auto-activates vs misses. Anecdotal reports are positive but unquantified.
- Cross-host precedence when `~/.agents/skills/open-knowledge` and `~/.claude/skills/open-knowledge` both exist: Claude Code docs specify "enterprise > personal > project" but not across the two user-level paths. Likely depends on host-specific discovery order; a single-canonical + symlinks approach avoids the issue.

---

## References

### Evidence Files

- [evidence/d1-mcp-instructions-field.md](evidence/d1-mcp-instructions-field.md) — MCP `instructions` spec, Claude Code 2KB cap, cross-host behavior
- [evidence/d2-agent-skills-distribution.md](evidence/d2-agent-skills-distribution.md) — 36+ hosts, progressive disclosure, compaction survival
- [evidence/d3-user-global-guidance-surfaces.md](evidence/d3-user-global-guidance-surfaces.md) — per-host global paths, Cursor User Rules non-filesystem limitation
- [evidence/d4-comparable-mcp-server-patterns.md](evidence/d4-comparable-mcp-server-patterns.md) — Linear/GitHub/Notion/Figma/Playwright survey + XcodeBuildMCP precedent + Playwright failure mode
- [evidence/d5-minimal-anchor-patterns.md](evidence/d5-minimal-anchor-patterns.md) — prompts not auto-loaded; tool descriptions as reliable surface
- [evidence/d6-init-ux-under-file-free-mode.md](evidence/d6-init-ux-under-file-free-mode.md) — migration shape for `ok init`

### External Sources

- [MCP Specification 2025-11-25 — Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) — authoritative `instructions` field spec
- [MCP schema.ts (2025-11-25)](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-11-25/schema.ts) — field-level definition
- [Drew Breunig — How Claude Code Builds a System Prompt](https://www.dbreunig.com/2026/04/04/how-claude-code-builds-a-system-prompt.html) — decompiled prompt assembly
- [agentskills.io](https://agentskills.io) — open SKILL.md standard + client carousel
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills) — most detailed skills docs
- [Cursor Rules](https://cursor.com/docs/rules) + [Cursor Skills](https://cursor.com/docs/context/skills)
- [Codex Skills](https://developers.openai.com/codex/skills/) + [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Windsurf Cascade Skills](https://docs.windsurf.com/windsurf/cascade/skills) + [Windsurf Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- [VS Code Copilot Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Claude Code: Create plugins](https://code.claude.com/docs/en/plugins) — skills+MCP+agents bundle format
- [XcodeBuildMCP SKILLS.md](https://github.com/getsentry/XcodeBuildMCP/blob/main/docs/SKILLS.md) — companion-skill-via-init precedent
- [Figma MCP: Create skills](https://developers.figma.com/docs/figma-mcp-server/create-skills/) — user-authored skills norm
- [Notion hosted MCP: an inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look) — tool-description-centric
- [Playwright MCP / Claude Code guide (Builder.io)](https://www.builder.io/blog/playwright-mcp-server-claude-code) — handshake-insufficient empirical signal

### Related Research

- [reports/mcp-server-auto-install-harnesses/](../mcp-server-auto-install-harnesses/) — deep coverage of MCP config-file surfaces + programmatic install primitives across 7 harnesses
- [reports/anthropic-knowledge-infrastructure-positioning/](../anthropic-knowledge-infrastructure-positioning/) — Anthropic's skills+MCP+CLAUDE.md three-layer knowledge stack
- [reports/mcp-tool-interface-design-agent-performance/](../mcp-tool-interface-design-agent-performance/) — tool description and agent performance evidence (relevant to per-tool guidance)
- [reports/zero-config-bunx-cli-packaging/](../zero-config-bunx-cli-packaging/) — OK's CLI packaging + MCP integration history
