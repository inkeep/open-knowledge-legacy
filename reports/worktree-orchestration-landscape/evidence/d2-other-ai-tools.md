# Evidence: Other AI Coding Tools' Parallel Work Isolation

**Dimension:** D2 — Other AI coding tools
**Date:** 2026-03-30
**Sources:** Official docs, GitHub repos, community articles, web search

---

## Key pages referenced

- https://developers.openai.com/codex/cli/features — Codex CLI features
- https://developers.openai.com/codex/app/features — Codex app features
- https://docs.devin.ai/working-with-teams/multidevin — MultiDevin docs
- https://cursor.com/docs/configuration/worktrees — Cursor parallel agents
- https://github.com/SWE-agent/SWE-ReX — SWE-agent runtime
- https://github.com/standardagents/dmux — dmux multiplexer
- https://github.com/superset-sh/superset — Superset editor
- https://github.com/ComposioHQ/agent-orchestrator — Composio orchestrator
- https://github.com/kdcokenny/opencode-worktree — OpenCode worktree plugin

---

## Findings

### Finding: Codex CLI uses per-thread worktrees with OS-level sandboxing
**Confidence:** CONFIRMED
**Evidence:** https://developers.openai.com/codex/cli/features

```
By default, Codex scopes work to the current project. If your task requires work
across more than one repository or directory, prefer opening separate projects or
using worktrees rather than asking Codex to roam outside the project root.

A Codex "thread" is the conversation context; the work happens in an isolated
workspace (often a worktree); results land in a review flow.

A Worktrees setting was added to choose how many Codex-managed worktrees to keep
before older ones are cleaned up.
```

Codex adds OS-level sandboxing on top (Firecracker microVM for cloud, elevated sandbox users on Windows, bwrap on Linux). The maximum concurrent agent threads defaults to 6.

**Implications:** Codex combines two layers: git worktrees for code isolation + OS sandboxing for process isolation. Most comprehensive isolation model in the landscape.

### Finding: Cursor 2.0 auto-creates worktrees for parallel agents (up to 8)
**Confidence:** CONFIRMED
**Evidence:** https://cursor.com/docs/configuration/worktrees

```
Cursor automatically creates and manages git worktrees for parallel agents.
To run an agent in a worktree, you select the worktree option from the agent
dropdown. When the agent finishes, click Apply to merge its changes back to
your working branch.
```

Cloud-based background agents each run on their own VM with git worktrees for code isolation. Users reported 9.82 GB disk usage for a 2GB codebase in 20 minutes due to automatic worktree creation.

**Implications:** Cursor handles both worktree creation AND merge-back ("Apply"). The merge is a user-initiated action, not automatic.

### Finding: Devin/MultiDevin uses VMs with manager-merges-workers pattern
**Confidence:** CONFIRMED
**Evidence:** https://docs.devin.ai/working-with-teams/multidevin

```
MultiDevin is an enterprise-only version of Devin that constitutes 1 "manager"
Devin and up to 10 "worker" Devins. The manager Devin creates the worker Devins,
distributes a task to each worker Devin, then merges the changes from all
successful worker Devins into one branch or pull request.
```

Each session runs in its own isolated VM. Manager only incorporates successful worker runs. Devin also auto-notifies on merge conflicts in GitHub PRs.

**Implications:** Devin has the most mature merge automation — manager handles consolidation. But it's enterprise-only and VM-based, not worktree-based.

### Finding: OpenCode uses community worktree plugin (OCX), not built-in
**Confidence:** CONFIRMED
**Evidence:** https://github.com/kdcokenny/opencode-worktree

```
The opencode-worktree plugin provides zero-friction git worktrees for OpenCode.
The Worktree Plugin implements git worktree isolation with automatic terminal
spawning. The plugin registers two tools (worktree_create and worktree_delete)
that agents can use to create isolated development environments.
```

No built-in worktree support. Community plugin provides creation/deletion. No merge automation.

**Implications:** OpenCode delegates worktree management to plugins. The ecosystem is less mature than Claude Code or Codex.

### Finding: SWE-agent uses Docker containers (SWE-ReX), not worktrees
**Confidence:** CONFIRMED
**Evidence:** https://github.com/SWE-agent/SWE-ReX

```
Whether commands are executed locally or remotely in Docker containers, AWS
remote machines, Modal, or something else, the agent code remains the same.
Running 100 agents in parallel is no problem.
```

SWE-agent isolates at the container level, not the git worktree level. This provides full process/network/filesystem isolation but heavier overhead.

**Implications:** Container-based isolation is the alternative model to worktrees. Better for untrusted code execution; overkill for trusted local development.

### Finding: Aider has no built-in parallel work or worktree support
**Confidence:** INFERRED
**Evidence:** Web search — no Aider-specific worktree features found in official docs or community. Aider is single-session focused.

Users can manually set up worktrees and run Aider in each. The community articles about "git worktrees for AI coding agents" mention Aider as a tool that benefits from external worktree setup, not one that provides it.

**Implications:** Aider's architecture is single-session, single-directory. Parallelism requires external tooling (dmux, Superset, manual worktrees).

### Finding: Bolt.new/Stackblitz uses WebContainers (in-browser isolation), not worktrees
**Confidence:** CONFIRMED
**Evidence:** Prior research (coding-agent-workspace-lifecycle report)

Bolt.new runs in-browser using Stackblitz WebContainers. Each session gets an isolated in-browser filesystem. Work is consolidated via direct git push (no PR review gate). No worktree concept.

**Implications:** Browser-based agents have a completely different isolation model. Not comparable to worktree-based approaches.

### Finding: Orchestration tools (dmux, Superset, Composio) add merge workflows
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

- **dmux:** Press `m` in a pane menu to merge. Lifecycle hooks for pre-merge and post-merge. "AI-assisted resolution" for conflicts.
- **Superset:** Built-in diff viewer shows changes per worktree. User manually merges when satisfied.
- **Composio Agent Orchestrator:** Each agent gets worktree + branch + PR. CI failures auto-forwarded to agent. Merge conflicts forwarded to agent as "Your branch has merge conflicts." Reconciler for automatic conflict detection on roadmap (not yet implemented).

**Implications:** The merge problem is recognized industry-wide. No tool has solved it fully. dmux and Composio are closest to automated merge, but both still rely heavily on human judgment for conflicts.

---

## Gaps / follow-ups

- Gemini CLI / Google's approach to parallel work isolation
- GitHub Copilot agent mode worktree support
- Windsurf/Codeium parallel session capabilities
