---
title: "Agent Host Hooks & Auto-Research Surfaces: Cross-Host Capability Matrix (April 2026)"
description: "Factual landscape of hook / lifecycle / trigger surfaces across the agent hosts the Open Knowledge skill targets — Claude Code, Cursor, OpenAI Codex, Windsurf Cascade, GitHub Copilot CLI, Continue.dev, Aider, Claude Desktop, Claude Cowork. Maps which support PreToolUse/PostToolUse-pattern hooks (5 hosts converged on a near-identical schema in the past 6 months), which have narrower mechanisms (Aider's lint-cmd, Continue's SDK), and which have nothing (Claude Desktop, Cowork). Covers MCP-portable alternatives (server-pushed notifications, elicitation, sampling, tool-result sentinels) and auto-research surfaces (cloud agents, GitHub Actions as universal substrate)."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Claude Code
  - Cursor
  - OpenAI Codex
  - Windsurf Cascade
  - GitHub Copilot CLI
  - Continue.dev
  - Aider
  - Claude Desktop
  - Claude Cowork
  - Model Context Protocol
topics:
  - agent host hooks
  - lifecycle events
  - PreToolUse PostToolUse
  - cross-host portability
  - MCP elicitation
  - MCP sampling
  - auto-research
  - cloud agents
  - GitHub Actions agents
  - knowledge linting infrastructure
---

# Agent Host Hooks & Auto-Research Surfaces: Cross-Host Capability Matrix

**Purpose:** Map what hook / lifecycle / trigger surfaces exist for invoking deterministic actions (like running a knowledge linter) outside the agent's discretion across every host the Open Knowledge skill targets, what's MCP-portable regardless of host, and what surfaces exist for triggering autonomous *background* work (auto-research). Frame the picture so a reader can decide which mechanism to invest in for which user population.

---

## Executive Summary

**The hooks landscape converged sharply in the past six months.** As of April 2026, **five major hosts** ship full PreToolUse/PostToolUse-pattern hooks with a near-identical schema: **Claude Code** (~30 events, six scopes), **Cursor 1.7** (~17 events, explicit Claude-Code-compat for exit-code-2 = deny), **OpenAI Codex** (~6 events, hooks.json + config.toml), **Windsurf Cascade** (workflow-specific events with cloud configuration for enterprise), and **GitHub Copilot CLI** (GA February 2026, `.github/hooks/`). All five accept JSON on stdin, return JSON on stdout (or use exit codes), support project-and-user scopes, and offer some form of managed-config for enterprise. **The schema convergence means a single hook script can target all five with thin per-host config adapters.**

**Two hosts have narrower / different-shape hook mechanisms.** **Aider** has `auto-lint` + `auto-test` post-edit triggers (no PreToolUse equivalent), which is fundamentally suited to OK's deterministic-7 lint set. **Continue.dev** exposes `onPreToolUse` / `onPostToolUse` via SDK rather than file-config, and ships a CLI mode that runs in CI on every PR.

**Two of OK's stated compatibility targets have zero hooks: Claude Desktop and Claude Cowork.** Claude Desktop's "zero automation hooks (no URL scheme, no file association, no deep-link, no drop-target)" was confirmed in this repo's prior `agent-skills-zip-distribution-ux/` research. Cowork's VM isolation precludes any host-side hook configuration. **A hooks-only knowledge-lint strategy would not cover the OK skill's own stated compatibility matrix** — the skill names Claude Code, Claude Desktop, Cowork, and Claude.ai web; only Claude Code has hooks.

**The MCP server itself is the only cross-host-universal mechanism.** Four MCP-protocol primitives work on every compliant host: **sampling** (server requests an LLM completion from the client — bypasses host hooks entirely; works for the LLM-required lint checks), **elicitation** (server requests user input, including URL mode for out-of-band ops), **server-pushed notifications** (`notifications/tools/list_changed`, etc.), and **tool-result content sentinels** (the pattern OK already uses for `attach-preview-once`). These work across Claude Code, Cursor, Codex, Windsurf, Copilot, Claude Desktop, Cowork, and Claude.ai — the entire OK target matrix.

**Auto-research has converged on cloud / async agents at every major host.** Cursor (background agents), Codex (Cloud), GitHub Copilot (cloud agent with separate hook surface), Continue (CLI mode runs in CI on every PR), Cowork (Anthropic's hosted async surface), Windsurf (Wave 13 parallel agents). **The cross-host LCD for auto-research is GitHub Actions** — every agent has a CLI version, OK MCP can boot in CI, and findings can be filed as PR comments / wiki pages without depending on any specific host's cloud-agent API. **MCP sampling is the in-session auto-research primitive** for the LLM-required lint checks that need to run when the user is connected.

**Key Findings:**
- **5 hosts ship PreToolUse/PostToolUse-pattern hooks with convergent schema** (Claude Code, Cursor, Codex, Windsurf, GitHub Copilot CLI). Cursor explicitly cites Claude Code compat.
- **2 hosts have narrower mechanisms** that fit OK's deterministic-lint use case (Aider's `lint-cmd`, Continue's SDK hooks).
- **2+ hosts have zero hooks** (Claude Desktop, Cowork) — and these are **inside the OK skill's stated compatibility matrix**, so hooks alone can't cover it.
- **MCP-protocol primitives travel cross-host**: sampling, elicitation, notifications, tool-result sentinels. The OK skill already uses one (`attach-preview-once`); same pattern can carry lint findings.
- **Hook config files are per-host**, but **hook scripts are largely portable** thanks to convergent stdin/stdout JSON envelopes.
- **GitHub Actions is the cross-host LCD for auto-research**, and **MCP sampling is the in-session auto-research primitive**.
- **The recommended layered strategy** mixes (a) per-host hooks for users on hook-supporting hosts (best UX, deterministic), (b) MCP server-side response sentinels as the universal floor, (c) GitHub Actions for scheduled deep auto-research that runs regardless of host.

---

## Research Rubric

**Primary question:** Across the agent hosts the OK skill targets, what hook / lifecycle / trigger surfaces exist for invoking deterministic actions outside the agent's discretion? What's MCP-portable, and what auto-research surfaces are available?

**Reader cares most about:** Whether a "hook fires after every wiki write to run lint" pattern is portable, what falls through, and what universal floor exists for hosts with no hooks.

**Dimensions (P0):**
1. **Per-host hook surface inventory** — Claude Code, Cursor, Codex, Windsurf, Copilot CLI, Continue, Aider, Claude Desktop, Cowork.
2. **Trigger event coverage** — which lifecycle events are exposed where; schema convergence.
3. **MCP-portable alternatives** — sampling, elicitation, notifications, sentinels.
4. **Gaps & portability** — hosts with nothing; cross-host write-once strategies.
5. **Auto-research surfaces** — cloud agents, async runs, GitHub Actions, MCP sampling.

**Stance:** Factual landscape (3P). The recommended layered strategy is a synthesis aid for the reader, not a prescription.

---

## Detailed Findings

### 1. Per-host hook surface inventory

**Finding:** Five hosts ship full hooks with a convergent schema; two have narrower mechanisms; two have zero hooks. The schema convergence means scripts are largely portable; only config files differ.

**Evidence:** [evidence/claude-code-cursor-hooks.md](evidence/claude-code-cursor-hooks.md), [evidence/codex-windsurf-copilot-hooks.md](evidence/codex-windsurf-copilot-hooks.md), [evidence/aider-continue-narrower-hosts.md](evidence/aider-continue-narrower-hosts.md), [evidence/zero-hook-hosts.md](evidence/zero-hook-hosts.md)

The full matrix:

| Host | Hooks tier | Config file(s) | Event count | Handler types | Notable feature |
|---|---|---|---|---|---|
| **Claude Code** | A (full) | `.claude/settings.json` `hooks` block; six scopes | ~30 | command, http, mcp_tool, prompt, agent | Most feature-rich; `mcp_tool` handler; six scopes |
| **Cursor 1.7+** | A (full) | `~/.cursor/hooks.json` or `<project>/.cursor/hooks.json` | ~17 | command | Explicit Claude-Code-compat (exit code 2 = deny) |
| **OpenAI Codex** | A (full) | `hooks.json` files OR `[hooks]` in `config.toml` | ~6 | command | Concurrent hook execution; managed hooks via dir |
| **Windsurf Cascade** | A (full) | Cloud-config (enterprise) + local | Workflow-specific (`pre_write_code`, `post_cascade_response`, ...) | command (any executable) | Cloud-configurable for enterprise |
| **GitHub Copilot CLI** | A (full) | `.github/hooks/*.json` | ~6 | command, HTTP webhook, prompt string (sessionStart) | Cross-surface (CLI + IDE + cloud agent); GA Feb 2026 |
| **Continue.dev** | B (SDK) | TypeScript SDK (`onPreToolUse`/`onPostToolUse`) | ~handful | programmatic | Higher floor; CLI runs in CI |
| **Aider** | B (narrow) | `.aider.conf.yml` (`lint-cmd`, `test-cmd`) | post-edit only | shell | Already does "edit → lint → fix" loop |
| **Claude Desktop** | C (none) | — | 0 | — | "Zero automation hooks" (per prior research) |
| **Claude Cowork** | C (none) | — (VM-isolated) | 0 | — | Per-tool re-approval bug compounds |

**Implications:**
- A hook script that writes JSON to stdout / uses exit code 2 can target all five Tier-A hosts; only the per-host config file differs.
- The OK skill's stated compatibility matrix (`Claude Code, Claude Desktop, Claude Cowork, Claude.ai web`) is **not covered** by hooks alone — only Claude Code among those four has hook support.
- Tier-B hosts (Aider, Continue) have natural fits for OK's deterministic lint set even without full hooks.

**Decision triggers:**
- If your user population skews to Claude Code: hooks ship the highest-fidelity UX.
- If your user population includes Claude Desktop / Cowork users: MCP-server-side mechanisms are mandatory.

---

### 2. Trigger event coverage & schema convergence

**Finding:** Five hosts converged on a near-identical event taxonomy and stdin/stdout JSON envelope within ~6 months (Claude Code → Cursor 1.7 Oct 2025 → Copilot CLI GA Feb 2026 → Codex / Windsurf maturation). The differences are in event count and naming, not in the underlying shape.

**Evidence:** [evidence/claude-code-cursor-hooks.md](evidence/claude-code-cursor-hooks.md), [evidence/codex-windsurf-copilot-hooks.md](evidence/codex-windsurf-copilot-hooks.md)

Cross-host event mapping for the events most relevant to OK's lint use case:

| Event class | Claude Code | Cursor | Codex | Windsurf | Copilot CLI |
|---|---|---|---|---|---|
| Tool call about to fire | `PreToolUse` | `preToolUse` | `PreToolUse` | (workflow-specific pre-events) | `preToolUse` |
| Tool call just fired | `PostToolUse` | `postToolUse` / `postToolUseFailure` | `PostToolUse` | (workflow-specific post-events) | `postToolUse` |
| File about to be written | `PreToolUse` (matched on tool) | `beforeReadFile` (read) | `PreToolUse` (matched on tool) | `pre_write_code` | `preToolUse` (matched on tool) |
| File just written | `PostToolUse` (matched on tool) | `afterFileEdit` | `PostToolUse` (matched on tool) | `post_write_code` | `postToolUse` (matched on tool) |
| Session start | `SessionStart` | `sessionStart` | `SessionStart` | (user_prompt hook) | `sessionStart` (prompt string supported) |
| Session end | `SessionEnd` | `sessionEnd` | `Stop` | — | `Stop` |
| User submitted prompt | `UserPromptSubmit` | `beforeSubmitPrompt` | `UserPromptSubmit` | (user_prompt hook) | `userPromptSubmit` |
| Permission gate | `PermissionRequest` | (permission field on `preToolUse`) | `PermissionRequest` | — | `permissionRequest` |

**Convergent envelope:**
- Stdin JSON with event-specific fields.
- Stdout JSON with `permission: allow|deny` (Cursor), `continue: true/false` (Codex), or exit code 2 = deny (Claude Code, Cursor — explicit compat).

**Divergent details:**
- Cursor lacks Claude Code's `mcp_tool` handler type (it's command-only).
- Codex runs hooks **concurrently**; Claude Code runs them serially.
- Windsurf's events are workflow-specific (e.g., `pre_write_code`) rather than the generic `PreToolUse` model.

**Implications:**
- A portable knowledge-lint hook that needs to fire "before write to wiki" or "after write to wiki" can target all five Tier-A hosts.
- Order-sensitive hooks need to handle Codex's concurrent model differently.
- The convergent schema means OK could ship a single hook script bundled in the OK MCP install, with per-host config templates that drop it into each host's expected location.

**Decision triggers:**
- Tier-A hosts can have a "fail closed" knowledge-lint gate (PreToolUse blocks bad writes).
- Tier-B hosts (Aider) can have a "fail soft" model (lint runs after edits, agent iterates on fix).

---

### 3. MCP-portable alternatives — the universal floor

**Finding:** Four MCP-protocol primitives work on every compliant host, regardless of hook support. These are the only mechanisms that cover the OK skill's full compatibility matrix (Claude Code, Claude Desktop, Cowork, Claude.ai web).

**Evidence:** [evidence/mcp-portable-alternatives.md](evidence/mcp-portable-alternatives.md)

The four primitives:

1. **Sampling** (`sampling/createMessage`) — the MCP server requests an LLM completion from the client. **Bypasses host hooks entirely.** This is the right mechanism for the LLM-required lint checks: contradictions, data gaps, lost-nuance, hallucination amplification, over-confident summaries. The server orchestrates; the client provides the LLM.

2. **Elicitation** (`elicitation/create`) — server requests user input from client. Two modes (per spec 2025-11-25): **Form** (structured data via JSON schema) and **URL** (out-of-band external URLs for auth, payment, sensitive operations). Server can prompt the user — *"3 dead links found, fix automatically?"* — without depending on the host's UX surface.

3. **Server-pushed notifications** — `notifications/tools/list_changed`, `notifications/resources/updated`, `notifications/resources/list_changed`. Server pushes state updates without an originating client request.

4. **Tool-result content sentinels** — structured fields embedded in tool responses that the agent reads and acts on. **OK already uses this pattern**: every `write_document` response can include `warning: { action: "attach-preview-once", previewUrl, message }`, and the OK skill prescribes "open immediately, one-shot" when present. The same pattern can carry lint findings: `lint: { findings: [...] }` fires the agent to fix.

The constraint: server-initiated requests (sampling, elicitation) can only fire **in association with an originating client request** — the server can't push them while the user is offline. But it can fire on every user interaction, which is the synchronous knowledge-lint trigger.

**Implications:**
- The OK MCP server can ship the **deterministic 7 lint checks** as inline content in every `write_document` response. Cross-host. No hook config required. Already-established pattern.
- The **LLM-required 5 checks** can fire via sampling on (a) explicit `lint` tool invocation, (b) every Nth `write_document` (activity trigger), (c) every `query`-class tool call (use-based trigger).
- This stack covers all OK target hosts — Claude Code, Cursor, Codex, Windsurf, Copilot, Claude Desktop, Cowork, Claude.ai web.

**Decision triggers:**
- If you ship knowledge-lint via host hooks: best UX for Tier-A hosts, no coverage for Tier-C hosts.
- If you ship knowledge-lint via MCP-server-side mechanisms: covers everyone but UX is limited to whatever the agent decides to do with surfaced findings.
- The optimal strategy ships both: **hooks for Tier-A users (best UX), MCP-server-side sentinels as the universal floor**.

---

### 4. Auto-research surfaces

**Finding:** Auto-research (background / scheduled / async agent runs that proactively investigate data gaps) is broadly supported in 2026 — every major host now has a cloud or async agent surface. **GitHub Actions is the cross-host LCD; MCP sampling is the in-session primitive.**

**Evidence:** [evidence/mcp-portable-alternatives.md](evidence/mcp-portable-alternatives.md) §Auto-research surfaces

Per-host auto-research surfaces:

| Host | Auto-research mechanism | Triggered by |
|---|---|---|
| Cursor | Cursor 1.7+ background agents | UI, API |
| OpenAI Codex | Codex Cloud / Codex async | UI, API |
| GitHub Copilot | Cloud agent (separate hook surface at `docs.github.com/.../cloud-agent/use-hooks`) | GitHub events, API |
| Continue.dev | CLI mode in CI; async on every PR | GitHub Actions, GitLab CI, etc. |
| Claude Cowork | Anthropic's hosted async-agent surface | UI, API |
| Windsurf | Wave 13: Parallel Agents & Arena Mode | UI, API |
| Claude Code | `claude --print` headless mode + cron / GitHub Actions | Any external scheduler |

**The cross-host LCD: GitHub Actions.** Every agent has a CLI version that runs in CI. OK MCP can boot in headless mode (`open-knowledge start` + Claude Code in `--print` mode, or any agent CLI). Findings file as wiki pages or PR comments. **This story works for every host — it doesn't depend on the host's cloud-agent API.**

**The in-session primitive: MCP sampling.** When the user is connected, the server can use `sampling/createMessage` to request LLM evaluations: "are these two pages contradictory?", "what data gap does this paragraph imply?". Bypasses host hooks. Works on every MCP-compliant host. Subject to the spec's "originating client request" constraint — fires on user interaction, not on independent server schedules.

**The Sleep Consolidation pattern (from the prior knowledge-linting research) maps to:**
- **Synchronous (user connected)**: MCP sampling triggered by activity-based or use-based triggers.
- **Asynchronous (user offline)**: GitHub Actions cron job that boots OK MCP + an agent CLI, runs lint, files findings.

The "boundary-first autoresearch" pattern (AgriciDaniel/claude-obsidian — score frontier pages to suggest investigation candidates) maps cleanly to:
- **Deterministic prefilter** (server-side, runs continuously): score all wiki pages by orphan-distance, source-age, citation-count, etc.
- **LLM evaluation** (via sampling on user interaction, or via scheduled GitHub Action): "for the top-10 boundary pages, which would benefit most from a research expansion?"
- **Auto-research execution** (via the agent's existing `research` MCP tool / `WebFetch`): run the research, ingest sources, file results back to the wiki.

**Implications:**
- OK doesn't need to invent auto-research infra — it can ride on every host's existing async surface, with GitHub Actions as the universal floor.
- The hardest part of auto-research isn't the infrastructure — it's the **trust model** for autonomous writes. (The OK shadow-repo writer-ID taxonomy already has `agent-<connId>` and `git-upstream` as distinct writer classes per precedent #25; an "autonomous-lint-agent" class would fit naturally.)

**Decision triggers:**
- For *every-edit* lint: hook + MCP-server-side sentinels.
- For *user-connected* deeper checks: MCP sampling.
- For *overnight / weekly* deep auto-research: GitHub Actions + headless agent CLI.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Exact JSON envelope parity across hosts** wasn't traced at the field-name level. Cursor's `permission: allow|deny`, Codex's `continue: false`, Claude Code's exit code 2 — a portable hook needs adapters; the per-host JSON shape differences are real.
- **MCP sampling support quality across hosts** wasn't end-to-end tested. The MCP spec mandates support; real-world implementations vary. A 1-hour spike with a minimal server that triggers `sampling/createMessage` would establish actual cross-host parity.
- **Claude Desktop / Cowork sampling support** — should work per spec; not confirmed in practice.
- **Continue's SDK API contract** for `onPreToolUse` / `onPostToolUse` wasn't deep-traced.

### Out of Scope (per Rubric)

- 1P recommendations on what OK specifically should build.
- Detailed per-host UX of how lint findings render to the user (would belong to a UX-focused report).
- Performance characteristics of hook execution under load (would belong to a perf-focused report).

---

## References

### Evidence Files
- [evidence/claude-code-cursor-hooks.md](evidence/claude-code-cursor-hooks.md) — Tier-A: Claude Code's ~30 events × 6 scopes; Cursor 1.7's ~17 events with explicit Claude-Code compat.
- [evidence/codex-windsurf-copilot-hooks.md](evidence/codex-windsurf-copilot-hooks.md) — Tier-A: Codex (concurrent execution, hooks.json + config.toml), Windsurf (workflow-specific events, cloud-configurable), GitHub Copilot CLI (GA Feb 2026, `.github/hooks/`).
- [evidence/aider-continue-narrower-hosts.md](evidence/aider-continue-narrower-hosts.md) — Tier-B: Aider's `auto-lint`/`auto-test`; Continue's SDK hooks + CI mode.
- [evidence/zero-hook-hosts.md](evidence/zero-hook-hosts.md) — Tier-C: Claude Desktop and Cowork have no hook surface; impact on OK's stated compatibility matrix.
- [evidence/mcp-portable-alternatives.md](evidence/mcp-portable-alternatives.md) — Sampling, elicitation, notifications, tool-result sentinels; auto-research surfaces; GitHub Actions as cross-host LCD.

### External Sources
- [Claude Code Hooks docs](https://code.claude.com/docs/en/hooks)
- [Cursor Hooks docs](https://cursor.com/docs/hooks)
- [Cursor 1.7 announcement (InfoQ)](https://www.infoq.com/news/2025/10/cursor-hooks/)
- [OpenAI Codex Hooks docs](https://developers.openai.com/codex/hooks)
- [Codex Hooks System (DeepWiki)](https://deepwiki.com/openai/codex/3.11-hooks-system)
- [Windsurf Cascade Hooks](https://docs.windsurf.com/windsurf/cascade/hooks)
- [GitHub Copilot CLI Hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [GitHub Copilot Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [VS Code Agent hooks (Preview)](https://code.visualstudio.com/docs/copilot/customization/hooks)
- [Continue.dev — Agent Mode How It Works](https://docs.continue.dev/ide-extensions/agent/how-it-works)
- [Aider lint and test docs](https://aider.chat/docs/usage/lint-test.html)
- [MCP Elicitation spec](https://modelcontextprotocol.io/specification/draft/client/elicitation)
- [MCP 2025-11-25 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx)
- [MCP cheat sheet](https://www.webfuse.com/mcp-cheat-sheet)

### Related Research (navigation aids)
- [reports/config-surfaces-vscode-and-claude-code/](../config-surfaces-vscode-and-claude-code/) — deep dive on Claude Code's settings.json topology including hooks, permissions, and the six-scope hierarchy.
- [reports/mcp-server-auto-install-harnesses/](../mcp-server-auto-install-harnesses/) — programmatic MCP install across 7 harnesses; useful for distributing OK's bundled hook templates.
- [reports/agent-skills-zip-distribution-ux/](../agent-skills-zip-distribution-ux/) — Claude Desktop's "zero automation hooks" finding originates here.
- [reports/knowledge-linting-karpathy-workflow/](../knowledge-linting-karpathy-workflow/) — sibling report on **what** to lint; this report covers **where** to fire it.
- [reports/linting-coverage-and-gaps/](../linting-coverage-and-gaps/) — sibling report on Open Knowledge's *current* linting state.
