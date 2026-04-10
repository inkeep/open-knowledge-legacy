# Evidence: Prior Art in Orchestration Systems

**Dimension:** D5 — Prior art in orchestration systems
**Date:** 2026-03-30
**Sources:** Official docs, GitHub repos, community articles

---

## Key pages referenced

- https://temporal.io/blog/parallelism-and-concurrency-in-a-distributed-event-loop — Temporal parallelism
- https://www.inngest.com/compare-to-temporal — Inngest vs Temporal
- https://github.com/RinDig/Interpreted-Context-Methdology — ICM filesystem orchestration
- https://github.com/standardagents/dmux — dmux
- https://github.com/superset-sh/superset — Superset
- https://github.com/ComposioHQ/agent-orchestrator — Composio orchestrator

---

## Findings

### Finding: Temporal/Inngest/Trigger.dev do not handle filesystem-level parallelism
**Confidence:** CONFIRMED
**Evidence:** https://temporal.io/blog/parallelism-and-concurrency-in-a-distributed-event-loop

```
For a given Workflow, Temporal's SDKs only run one workflow task at a time.
Workflows have an internal, deterministic event loop, and a Workflow task will
make as much progress as possible on all of the items in its event loop,
cooperatively switching between the tasks until they are all blocked.
```

Temporal's model: Workflows are deterministic orchestrators, Activities are side-effecting workers. Parallelism is at the Activity level (multiple workers polling same queue). But Activities produce return values, not filesystem artifacts. There is no concept of "merge the filesystem output of two Activities."

Inngest takes a serverless approach — functions invoked via HTTP, no persistent filesystem state between steps. Trigger.dev similarly orchestrates HTTP-invokable tasks.

**Implications:** Workflow orchestration systems (Temporal, Inngest, Trigger.dev) operate at the function/service level, not the filesystem level. They cannot model "two agents editing the same codebase in parallel" because they don't have a filesystem-aware merge primitive. The gap OpenBolts would fill is precisely this: filesystem-level parallelism with merge semantics.

### Finding: Build systems (Bazel/Turborepo/Nx) handle parallel tasks with artifact caching
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

Build systems solve a different version of the problem: parallel tasks that produce BUILD ARTIFACTS, not source code modifications. Key patterns:

- **Bazel:** Hermetic builds. Each target declares inputs/outputs. Parallel execution with remote caching. BUT: tasks don't modify the source tree — they read source and write to isolated output directories.
- **Turborepo:** Dependency-graph-aware task scheduling. Parallel package builds. Caching via content hashing. Same pattern: tasks produce output artifacts, don't modify source.
- **Nx:** Similar to Turborepo with more features (affected analysis, distributed execution). Tasks are read-source, write-artifact.

None of these systems model "two parallel tasks that MODIFY the same source tree and must be reconciled."

**Implications:** Build systems avoid the merge problem entirely by making tasks produce isolated artifacts rather than mutating shared state. This is the fundamental architectural difference from coding agents, which MUST modify the source tree.

### Finding: ICM uses filesystem structure as orchestration primitive
**Confidence:** CONFIRMED
**Evidence:** https://github.com/RinDig/Interpreted-Context-Methdology

```
ICM enforces clear stage boundaries where each stage produces a distinct artifact
that a human might want to review or edit before proceeding. Stages communicate
through markdown files — no binary formats, no database connections.
```

ICM is sequential, not parallel. But its key insight is relevant: stages produce files, and those files are the coordination mechanism. The filesystem IS the state machine.

**Implications:** ICM validates the idea that file-based artifacts can serve as coordination primitives. But it doesn't address parallel execution or merging.

### Finding: dmux, Superset, and Composio are the closest to worktree-aware orchestration
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

**dmux (Standard Agents):**
- Creates tmux pane per task, each with its own worktree
- Supports 11 agents
- Has merge UI (press `m`) with lifecycle hooks (pre-merge, post-merge)
- "AI-assisted resolution" for conflicts (details unclear)

**Superset (superset.sh):**
- Electron-based terminal for 10+ parallel agents
- Built-in diff viewer for reviewing agent output
- Manual merge-when-satisfied workflow
- No automatic conflict resolution

**Composio Agent Orchestrator:**
- Each agent gets worktree + branch + PR
- CI failures auto-forwarded to agent for fixing
- Merge conflicts forwarded to agent as notification
- "Reconciler for automatic conflict detection" on roadmap, not yet built
- Agent-agnostic (Claude Code, Codex, Aider) and runtime-agnostic (tmux, Docker)

**Implications:** The industry is converging on a pattern: worktree isolation + human-supervised merge. Nobody has solved automated conflict resolution at the orchestrator level. Composio is the only tool with a roadmap item for it.

### Finding: No open-source agent orchestration system provides programmatic merge primitives
**Confidence:** CONFIRMED
**Evidence:** Comprehensive search across all identified tools

None of the tools surveyed expose a programmatic API for:
1. Pre-flight conflict detection between agent branches
2. Automated merge sequencing with conflict handling
3. Merge-back to integration branch with rollback semantics
4. Conflict resolution delegation (to agent or human)

All tools either: (a) provide a UI for manual merge, or (b) forward conflicts to the agent/human as notifications.

**Implications:** This is the precise gap that OpenBolts could fill with engine-level merge primitives.

---

## Gaps / follow-ups

- GitHub merge queue implementation details (batched PR testing)
- GitLab merge trains as prior art for sequential integration
- Whether any CI/CD system provides programmatic merge-tree integration
