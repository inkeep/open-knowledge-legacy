# Evidence: Other Coding Agents' Isolation Models

**Dimension:** D2 -- How other coding agents handle isolation
**Date:** 2026-04-02
**Sources:** Official docs, product announcements, community analysis

---

## Key pages referenced

- https://cursor.com/docs/configuration/worktrees -- Cursor parallel agents docs
- https://www.digitalapplied.com/blog/cursor-3-agents-window-design-mode-complete-guide -- Cursor 3 features
- https://developers.openai.com/codex/app/features -- Codex app features
- https://developers.openai.com/codex/agent-approvals-security -- Codex sandbox
- https://blog.replit.com/whats-changed-agent3-to-agent4 -- Replit Agent 4
- https://docs.devin.ai/release-notes/overview -- Devin docs
- https://windsurf.com/changelog/windsurf-next -- Windsurf changelog
- https://github.com/microsoft/vscode/issues/300366 -- Copilot worktree feature request
- https://www.kenmuse.com/blog/workspace-vs-worktree-isolation-in-copilot-cli/ -- Copilot CLI isolation modes

---

## Findings

### Finding: Industry convergence on git worktrees for local-first tools
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

| Tool | Isolation Model | Worktree Support | Year Added |
|------|----------------|------------------|------------|
| **Claude Code** | Git worktree | Built-in (`--worktree`, `isolation: worktree`) | Feb 2026 (v2.1.49) |
| **Codex CLI/App** | Worktree + OS sandbox | Built-in (per-thread) | 2025 |
| **Cursor 3** | Git worktree (cloud + local) | Built-in (auto-create per agent) | Apr 2026 |
| **Windsurf Wave 13** | Git worktree | Built-in (per-cascade pane) | 2026 |
| **Copilot CLI** | Workspace or Worktree (user choice) | Built-in | Mar 2026 |
| **Devin** | Cloud VM | N/A (VM-based, not worktree) | 2024 |
| **Replit Agent 4** | Micro VM | N/A (cloud VM, not worktree) | 2026 |

### Finding: Cursor 3 uses worktrees for best-of-N model comparison
**Confidence:** CONFIRMED
**Evidence:** https://www.digitalapplied.com/blog/cursor-3-agents-window-design-mode-complete-guide

```
The best-of-N pattern works like this: select multiple models from the dropdown,
submit your prompt, and each model generates a solution in an isolated Git worktree,
with results appearing side by side in Agent Tabs.
```

Cursor 3 (April 2026) makes worktree-based parallel execution a first-class feature:
- Agents Window: standalone workspace for running many agents in parallel
- Each agent runs in its own worktree with isolated files
- Cloud-local handoff: start local, push to cloud, pull results back

### Finding: Codex layers OS sandbox on top of worktrees
**Confidence:** CONFIRMED
**Evidence:** https://developers.openai.com/codex/agent-approvals-security

```
OS-level mechanisms enforce sandbox policies with defaults including no network
access and write permissions limited to the active workspace.
```

Codex uniquely combines:
1. Git worktree isolation (code-level)
2. OS-level sandbox (process-level -- no network, restricted writes)
3. Approval policies (permission gates)

### Finding: Copilot CLI offers workspace vs worktree choice
**Confidence:** CONFIRMED
**Evidence:** https://www.kenmuse.com/blog/workspace-vs-worktree-isolation-in-copilot-cli/

Two modes:
- **Workspace**: agent operates directly in working directory (shared desk)
- **Worktree**: VS Code creates separate git worktree (private office)

Worktree mode automatically sets permission to Bypass Approvals (cannot change).
Workspace mode allows all permission levels.

### Finding: Replit Agent 4 uses micro VMs for task isolation
**Confidence:** CONFIRMED
**Evidence:** https://blog.replit.com/whats-changed-agent3-to-agent4

```
When you start a new task in Agent 4, Replit creates an isolated copy of your project
in the cloud. The agent works in that copy without touching your main version.
When you're happy, you apply the changes back. If you're not, you abandon it.

Isolation is created using micro VMs, which create isolated task environments that
spin up in seconds.
```

Key insight: Replit's "task isolation" is conceptually similar to worktrees (isolated copy, apply-back pattern) but implemented via VMs, not git.

Parallel tasks are safe -- can't overwrite each other. Conflicts flagged and resolved by agent.

### Finding: Devin uses VM-based isolation, not worktrees
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

```
Devin can delegate to a team of managed Devins that work in parallel, where each
managed Devin is a full Devin with its own isolated virtual machine.
```

Each Devin session = separate VM. MultiDevin: coordinator scopes work, monitors progress, resolves conflicts, compiles results. Enterprise-only.

### Finding: Windsurf Wave 13 adds worktree support
**Confidence:** CONFIRMED
**Evidence:** https://windsurf.com/changelog/windsurf-next + community sources

```
Wave 13 brings first-class support for parallel, multi-agent sessions,
along with Git worktrees, side-by-side Cascade panes.
```

Also uses worktrees for "arena battles" (model comparison) -- each model gets isolated worktree, winner's changes merged back.

### Finding: No tool has solved the merge problem
**Confidence:** CONFIRMED
**Evidence:** Cross-tool analysis

Every tool provides isolation, none provides automated merge:
- Claude Code: no merge, no conflict detection
- Cursor: "Apply" button (manual)
- Codex: no merge
- Copilot CLI: no merge
- Windsurf: winner-merge in arena only
- Devin: coordinator merges workers (opaque, enterprise-only)
- Replit: conflict flagging + agent resolution (closest to automated)

---

## Gaps / follow-ups

- Augment Code -- another tool that may have isolation features
- How Cursor 3's cloud-local handoff works technically
- Whether any tool plans explicit merge primitives in their roadmap
