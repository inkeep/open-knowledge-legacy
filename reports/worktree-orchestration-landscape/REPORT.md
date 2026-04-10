---
title: "Worktree Orchestration Landscape: How AI Coding Tools Manage Parallel Work and the Unsolved Merge Problem"
description: "How AI coding tools and agent orchestration systems use git worktrees for parallel work isolation, what merge strategies exist for consolidating N agent branches, and where the industry gaps are. Covers Claude Code, Codex, Cursor, Devin, SWE-agent, and orchestration tools (dmux, Superset, Composio). Includes git worktree mechanics reference, merge strategy analysis, and recommendations for engine-level merge primitives."
createdAt: 2026-03-30
updatedAt: 2026-04-03
subjects:
  - Claude Code
  - OpenAI Codex
  - Cursor
  - Devin
  - SWE-agent
  - dmux
  - Superset
  - Composio Agent Orchestrator
  - git worktree
  - Sandcastle
  - git merge-tree
  - git-octopus
topics:
  - git worktrees
  - parallel agent isolation
  - merge strategies
  - conflict detection
  - agent orchestration
---

# Worktree Orchestration Landscape: How AI Coding Tools Manage Parallel Work and the Unsolved Merge Problem

**Purpose:** Document how AI coding tools use git worktrees for parallel work isolation, what merge strategies exist for consolidating N agent branches into an integration branch, and where the industry gaps are -- so an engine-level orchestrator can make informed design decisions about worktree lifecycle and merge primitives.

---

## Executive Summary

Git worktrees have become the dominant isolation mechanism for parallel AI coding agents in 2026. Every major local-first coding tool -- Claude Code, Codex CLI, Cursor, and the orchestration layer (dmux, Superset, Composio) -- either provides built-in worktree support or has converged on worktrees as the standard pattern. Cloud-first tools (Devin, SWE-agent) use container/VM isolation instead, which provides stronger process-level boundaries but heavier overhead.

However, the merge problem -- how to consolidate N agent branches back into an integration branch -- remains largely unsolved across the entire landscape. Every tool examined follows the same pattern: provide isolation through worktrees, then delegate merge to the human. No tool provides programmatic merge primitives with conflict detection, optimal ordering, or automated resolution.

**Key Findings:**

- **Worktree isolation is solved and standardized.** Claude Code's `--worktree` flag, Codex's per-thread worktrees, and Cursor's automatic worktree creation all use the same underlying `git worktree add` mechanics. The implementation details vary (cleanup semantics, hook systems, `.worktreeinclude` for env files) but the core pattern is identical.

- **The merge gap is the industry's blind spot.** No tool provides pre-flight conflict detection (`git merge-tree`), optimal merge ordering, or conflict resolution delegation. Devin's MultiDevin (manager merges workers) is the closest to automated merge, but it's enterprise-only and VM-based. Composio has a "reconciler" on its roadmap but hasn't built it.

- **`git merge-tree --write-tree` is the key primitive for pre-flight conflict detection.** It performs a full merge in memory without touching the working tree or index, returns exit status 0 for clean merge and 1 for conflicts, and supports `--stdin` mode for batch checking. An O(N^2) conflict matrix across all agent branches is computationally cheap (seconds for 10 branches, 10K files).

- **Sequential merge into an integration branch is the most practical strategy.** Octopus merge refuses on any conflict. Cherry-pick breaks ancestry. Rebase rewrites history. The integration branch pattern (create temp branch, merge branches one-by-one, resolve conflicts at each step, then merge integration into main) gives the best tradeoff of safety, traceability, and automation potential.

- **The optimal merge algorithm is a graph-coloring problem on the conflict matrix.** Non-conflicting branches can be merged in any order (or octopus-merged). Conflicting branch pairs must be sequenced, with the losing branch either retried with an updated base or escalated to a human. This algorithm is straightforward to implement but no existing tool does it.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Claude Code worktree management | Deep | P0 |
| D2 | Other AI coding tools' parallel isolation | Moderate | P0 |
| D3 | Git worktree mechanics (reference) | Deep | P0 |
| D4 | Worktree merge strategies | Deep | P0 |
| D5 | Prior art in orchestration systems | Moderate | P1 |
| D6 | The merge problem for sequential/parallel agents | Deep | P0 |

**Stance:** Factual with targeted recommendations for engine-level orchestration.

**Non-goals:** Container-based isolation in depth (covered in existing coding-agent-workspace-lifecycle report). LLM-level parallelism mechanics (covered in existing agent-parallelism-mechanics report).

---

## Detailed Findings

### D1. Claude Code Worktree Management

**Finding:** Claude Code provides comprehensive worktree isolation with automatic cleanup, but deliberately stops short of any merge or consolidation functionality.

**Evidence:** [evidence/d1-claude-code-worktrees.md](evidence/d1-claude-code-worktrees.md)

The `--worktree` (`-w`) flag creates an isolated worktree at `<repo>/.claude/worktrees/<name>` with a branch named `worktree-<name>`, branching from `origin/HEAD`. The worktree is a standard git worktree sharing the same object database.

**Core mechanisms:**

| Feature | Mechanism | Notes |
|---------|-----------|-------|
| CLI creation | `claude --worktree <name>` | Name optional; auto-generates if omitted |
| Subagent isolation | `isolation: worktree` in agent frontmatter | Each subagent gets own worktree |
| Env file copying | `.worktreeinclude` file (gitignore syntax) | Only copies gitignored files that match |
| Custom setup | `WorktreeCreate` / `WorktreeRemove` hooks | Replaces default git behavior entirely |
| Cleanup (no changes) | Auto-remove worktree + branch | Silent, no user interaction |
| Cleanup (with changes) | Prompt: keep or remove | Keeping preserves directory + branch |

**What Claude Code does NOT do:**

- No automatic merge of worktree branches back to any target
- No conflict detection between worktree branches
- No PR creation from worktree branches
- No post-completion consolidation of any kind
- The [official docs](https://code.claude.com/docs/en/common-workflows) state: "For automated coordination of parallel sessions with shared tasks and messaging, see agent teams" -- but agent teams handle task coordination, not code merging

**Known limitation:** The in-session `EnterWorktree` tool (used by `isolation: worktree` subagents) [ignores WorktreeCreate/WorktreeRemove hooks](https://github.com/anthropics/claude-code/issues/36205), falling back to plain `git worktree add`. This means custom setup (git-crypt, sparse checkout, dependency installation) works with `--worktree` but fails for subagent worktrees.

**Decision triggers:**
- If building worktree-aware orchestration on Claude Code: the hook system provides sufficient control for worktree creation, but merge must be implemented externally
- If using subagent worktrees with custom setup: the EnterWorktree hook bug is a blocker until fixed

### D2. Other AI Coding Tools' Parallel Isolation

**Finding:** The landscape has converged on two models -- git worktrees for local-first tools and containers/VMs for cloud-first tools. Merge automation ranges from "nonexistent" to "basic notification forwarding."

**Evidence:** [evidence/d2-other-ai-tools.md](evidence/d2-other-ai-tools.md)

**Tool-by-tool summary:**

| Tool | Isolation Model | Worktree Support | Merge Automation | Max Parallel |
|------|----------------|------------------|------------------|--------------|
| **Claude Code** | Git worktree | Built-in (`--worktree`) | None | Unlimited (user-managed) |
| **Codex CLI/App** | Worktree + OS sandbox | Built-in (per-thread) | None | 6 threads default |
| **Cursor 2.0** | Worktree (cloud VM) | Built-in (auto-create) | "Apply" button (manual) | 8 agents |
| **Devin/MultiDevin** | Cloud VM | N/A (VM-based) | Manager merges workers | 10 workers (enterprise) |
| **OpenCode** | Plugin-based | Community plugin (OCX) | None | Plugin-dependent |
| **SWE-agent** | Docker container | N/A (container-based) | None | 100+ (SWE-ReX) |
| **Aider** | None built-in | External only | None | External only |
| **Bolt.new** | WebContainer | N/A (browser-based) | Direct push to git | 1 per project |
| **Sandcastle** | Docker + git worktree | Built-in (3 modes) | Temp-branch auto-merge | Unlimited (Promise.allSettled) |

**Key patterns observed:**

1. **Codex** is unique in layering OS-level sandboxing (Firecracker, elevated users, bwrap) on top of worktrees. This provides both code isolation AND process isolation -- the most comprehensive model in the landscape.

2. **Cursor** is the only tool with a built-in merge-back action ("Apply"), though it's user-initiated rather than automated.

3. **Devin's MultiDevin** has the most automated merge: the manager agent creates workers, distributes tasks, and "merges the changes from all successful worker Devins into one branch or pull request." But it's enterprise-only, VM-based, and the merge logic is opaque.

4. **Orchestration tools** (dmux, Superset, Composio) add merge workflows on top of agent-agnostic worktree isolation. [dmux](https://github.com/standardagents/dmux) provides lifecycle hooks (pre-merge, post-merge) and mentions "AI-assisted resolution." [Composio](https://github.com/ComposioHQ/agent-orchestrator) forwards merge conflicts to agents as notifications and has a "reconciler" on its roadmap.

5. **[Sandcastle](https://github.com/mattpocock/sandcastle)** (Matt Pocock) is the most complete worktree lifecycle implementation in the landscape. It layers Docker container isolation on top of git worktrees with a 3-mode discriminated union (`none` / `temp-branch` / explicit `branch`), and provides several worktree lifecycle features no other tool implements programmatically:

   - **Branch collision detection:** Checks `git worktree list --porcelain` before creation; fails with user-friendly error if branch already checked out elsewhere (`WorktreeManager.ts:142`)
   - **Stale worktree pruning:** `pruneStale()` runs automatically before every worktree creation, removing references where the directory was deleted but git still tracks the worktree
   - **Dirty worktree preservation:** On `close()`, checks `hasUncommittedChanges()` — if dirty, preserves the worktree and returns `preservedWorktreePath` to the caller instead of deleting. SIGINT/SIGTERM handlers apply the same logic.
   - **Temp-branch auto-merge:** Default mode creates a temp branch, merges back to host branch via `git merge` (not cherry-pick — preserves ancestry), then deletes the temp branch
   - **Reflink-aware file copy:** `copyToSandbox` uses `cp -R --reflink=auto` for near-instant copy-on-write transfer of large directories (e.g., `node_modules`), falling back to regular copy if the filesystem doesn't support it
   - **Resource bracket:** All of the above is wrapped in `Effect.acquireUseRelease` — guaranteed cleanup even on crash

   **Limitation:** Sandcastle only merges ONE branch back (temp-branch → host). For N-branch parallel work, the merge phase is delegated to a "merge agent" in template code (the parallel-planner template demonstrates this), not handled by the framework.

**Remaining uncertainty:** The "AI-assisted resolution" in dmux and the Composio reconciler are both underspecified. Neither has published details on how they detect or resolve conflicts programmatically.

### D3. Git Worktree Mechanics

**Finding:** Git worktrees provide lightweight, per-branch working directories that share the object database. They are well-suited for agent parallelism but have notable limitations with submodules and disk usage.

**Evidence:** [evidence/d3-git-worktree-mechanics.md](evidence/d3-git-worktree-mechanics.md)

**Architecture:**

```
repo/                          # Main worktree
  .git/                        # Shared: objects, refs, hooks, config, rerere
    worktrees/
      feature-a/               # Per-worktree metadata
        HEAD                   # Independent HEAD
        index                  # Independent index
        gitdir                 # Link back to main .git
  .claude/worktrees/
    feature-a/                 # Working tree (full file checkout)
    feature-b/                 # Another working tree
```

**Key properties:**

| Property | Behavior |
|----------|----------|
| Object database | Shared across all worktrees |
| Refs (branches, tags) | Shared -- visible from all worktrees |
| HEAD, index | Per-worktree -- independent checkout state |
| Sparse checkout config | Per-worktree (cone mode recommended) |
| Submodules | Experimental/incomplete -- must init separately |
| Same branch checkout | Blocked (safety) -- use `-b` new branch or `--detach` |
| `git fetch` | Updates shared objects for all worktrees |
| `git worktree prune` | Cleans stale references from deleted worktrees |

**Performance considerations:**

- **Creation:** Fast -- no object duplication, just file checkout
- **Disk usage:** Linear with working tree size. Each worktree duplicates the full checkout (or sparse subset). Build artifacts, `node_modules`, and caches are NOT shared.
- **Reported cost:** Cursor users measured 9.82 GB for a 2GB codebase in 20 minutes of automated worktree creation
- **Mitigation:** Several approaches exist at different layers:
  - **Package manager level (best):** [pnpm's global virtual store](https://pnpm.io/next/git-worktrees) (`enableGlobalVirtualStore: true`) shares a single content-addressable store across worktrees — each worktree's `node_modules` contains only symlinks (~63% disk savings with 3 worktrees). pnpm published an official git worktrees guide in March 2026. Bun uses clonefile (CoW) on macOS by default with a fallback chain (clonefile → hardlink → copyfile), making `bun install` in fresh worktrees already fast.
  - **Worktree config level:** Cline and Roo Code implement `.worktreeinclude` — gitignore-style patterns specifying which ignored files to copy into worktrees. Cline Kanban uses symlinks instead of copies.
  - **Raw filesystem level:** `cp -R --reflink=auto` for CoW transfer of large directories. Sandcastle implements this pattern (`CopyToSandbox.ts`). Near-instant on APFS/Btrfs — only changed blocks are physically duplicated.
  - **Build cache level:** Turborepo 2.8 added git worktree support with shared task caches across worktrees (build artifacts get cache hits, but `node_modules` is delegated to the package manager).

**Limitations for agent orchestration:**

1. **Submodules are problematic.** Support is explicitly described as "experimental" in the git docs. Each worktree needs separate `git submodule update --init`. The `--update-submodules` flag can corrupt the `.git` directory.

2. **Same-branch restriction** means each agent MUST use a unique branch. This is natural (each agent = feature branch) but prevents "multiple agents reviewing the same branch" patterns.

3. **Build tool caches often don't work across worktrees** due to absolute path differences (e.g., ccache with cmake). Build tools should be configured with shared cache directories.

### D3b. Worktree Lifecycle Patterns — Ecosystem Survey

**Finding:** Five operational patterns are critical for production worktree orchestration. The ecosystem is mature for dependency setup and signal handling, weak for crash recovery and GC, and non-existent for proactive collision detection.

**Evidence:** [evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md](evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md), [evidence/d2-sandcastle-worktree-patterns.md](evidence/d2-sandcastle-worktree-patterns.md)

| Pattern | Ecosystem maturity | Best-in-class | Key insight |
|---------|-------------------|---------------|-------------|
| Dependency setup | Mature | pnpm global store, Bun clonefile | Package-manager-level solution is superior to raw filesystem copy |
| Dirty preservation on crash | Weak | Sandcastle (programmatic), JetBrains (always-preserve) | Must check unpushed commits AND uncommitted changes — Claude Code only checks the latter ([issue #38287](https://github.com/anthropics/claude-code/issues/38287)) |
| Branch collision detection | Non-existent | Sandcastle only | ~10ms proactive check, nobody else bothers (unique name generation avoids by convention) |
| Stale worktree GC | Basic | git gc (3-month default) | Docker's tiered policy (time + size + reference count) is the reference design for agent worktrees |
| Signal handling | Mature | [Temporal](https://docs.temporal.io/encyclopedia/workers/worker-shutdown) (graceful period + activity completion) | Process groups for subprocess cleanup, AbortController for async work, grace period before forced cleanup |
| Dynamic prompt context | Emerging | [Agent Situations](https://github.com/dave1010/agent-situations) (YAML, CC0), Cursor (file patterns), Sandcastle (`!`command``) | Pattern is well-established in build/deploy tools (GitHub Actions `${{ }}`, Terraform data sources); novel for agent prompts |

**Dirty worktree preservation is the biggest gap.** Claude Code's implementation has known data loss bugs: cleanup checks uncommitted changes but NOT unpushed commits, leading to silent branch deletion. The safe pattern is: always check both, never auto-delete without confirmation, use git reflog/fsck as recovery backstop.

**Signal handling for agent orchestration** follows the Temporal model: (1) stop accepting new work, (2) let in-flight work complete within grace period, (3) cancel context after timeout. In Node.js: wire SIGINT/SIGTERM handlers, use process groups (`options.detached = true`, `process.kill(-pid)`) for subprocess cleanup, and AbortController for async work.

---

### D4. Worktree Merge Strategies

**Finding:** Five distinct strategies exist for merging N worktree branches. Sequential merge into an integration branch is the most practical for agent orchestration. `git merge-tree` enables cheap pre-flight conflict detection. `git rerere` can help with repeated resolution patterns.

**Evidence:** [evidence/d4-merge-strategies.md](evidence/d4-merge-strategies.md)

**Strategy comparison:**

| Strategy | Mechanism | Conflict Handling | History | Agent Suitability |
|----------|-----------|-------------------|---------|-------------------|
| Sequential two-way | `git merge B1; git merge B2; ...` | Resolve at each step | N merge commits | Good -- simple, predictable |
| Octopus | `git merge -s octopus B1 B2 B3` | Refuses on ANY conflict | 1 merge commit, N parents | Poor -- too fragile |
| Integration branch | Create temp, merge all, then merge to main | Isolated in temp branch | Clean main history | Best -- safe, traceable |
| Rebase + FF | `git rebase main; git merge --ff` | Resolve at each commit | Linear (rewritten) | Risky -- rewrites history |
| Cherry-pick | `git cherry-pick <commits>` | Per-commit resolution | Duplicated commits | Bad -- breaks ancestry |

**Recommended pattern for agent orchestration -- Integration branch with pre-flight detection:**

```
Phase 1: Pre-flight (in-memory, no side effects)
  For each pair (Bi, Bj):
    git merge-tree -q Bi Bj → build conflict matrix

Phase 2: Order (graph coloring on conflict matrix)
  Group non-conflicting branches → can merge in any order
  Sequence conflicting groups → merge most independent first

Phase 3: Execute (on integration branch)
  git checkout -b integration <base>
  For each branch in merge order:
    git merge <branch>
    If conflict:
      Option A: delegate to agent (retry with updated base)
      Option B: escalate to human
      Option C: skip branch, continue

Phase 4: Validate
  Run tests on integration branch
  If pass: git checkout main && git merge integration
  If fail: identify failing branch, remove, re-merge
```

**`git merge-tree` as the pre-flight primitive:**

`git merge-tree --write-tree B1 B2` performs a full merge in memory. Exit status: 0 = clean (no conflicts), 1 = conflicts detected. Supports `--stdin` for batch processing (pipe multiple branch pairs), though with `--stdin` the exit status is 0 for both clean and conflicted merges -- the output must be parsed instead. The `-q` flag enables early exit on first conflict for fast checking.

Critical caveats from the [official docs](https://git-scm.com/docs/git-merge-tree):
- Do NOT parse the result tree for conflicts -- use the Conflicted file info section
- Do NOT interpret an empty conflict list as clean -- check exit status
- Some conflicts (directory rename permutations) have no per-file conflict markers

**`git rerere` for repeated resolutions:**

[`git rerere`](https://git-scm.com/book/en/v2/Git-Tools-Rerere) records conflict resolutions and replays them automatically. Useful when an orchestrator needs to re-merge after an agent retry. Resolutions stored in `.git/rr-cache`, expire after 60 days.

**LesFurets `git-octopus` as prior art:**

[LesFurets](https://github.com/lesfurets/git-octopus) ran a continuous merge workflow at production scale (40-70 branches, 3-10 per deployment, 1 deployment/day). Key pattern: merge all feature branches into a throwaway `octopus` branch, run CI on it, force-push next merge. The `git-conflict` tool records resolutions as refs (pushable/fetchable). This is the closest existing model to what an agent orchestrator would need.

### D5. Prior Art in Orchestration Systems

**Finding:** Workflow orchestration systems (Temporal, Inngest) and build systems (Bazel, Turborepo, Nx) solve adjacent but fundamentally different problems. No existing orchestration system provides filesystem-level parallelism with merge semantics.

**Evidence:** [evidence/d5-prior-art-orchestration.md](evidence/d5-prior-art-orchestration.md)

**Comparison with agent worktree orchestration:**

| System Category | Parallelism Model | Output Model | Merge Concept |
|----------------|-------------------|--------------|---------------|
| **Workflow orchestration** (Temporal, Inngest) | Activity-level parallelism | Return values | None -- no filesystem state |
| **Build systems** (Bazel, Turborepo, Nx) | Task-level parallelism | Isolated output directories | None -- tasks don't mutate source |
| **CI/CD merge** (GitHub merge queue, GitLab trains) | PR-level serialization | Tested merge commits | Sequential validation |
| **Agent worktree orchestration** (this problem) | Agent-level parallelism | Source tree mutations | Merge N mutated trees |

The fundamental difference: workflow systems and build systems produce ARTIFACTS from source. Coding agents MODIFY source. This creates the merge problem that no existing orchestration category addresses.

**Closest analogies:**

- **GitHub merge queue:** Batches multiple PRs, tests them together, merges in sequence. But each PR is independent -- no cross-PR conflict detection. If a batch fails, it bisects to find the culprit.
- **GitLab merge trains:** Pipelines run against speculative merge results. Each MR's pipeline runs against "what main would look like if all MRs ahead of me merge." Similar to the integration branch pattern.
- **LesFurets git-octopus:** The closest direct analogy. Merges all feature branches into a throwaway branch for CI. Production-proven at 40-70 branch scale.

### D6. The Merge Problem for Sequential/Parallel Agents

**Finding:** The optimal strategy depends on dependency information between stories. For independent stories, a pre-flight conflict matrix using `git merge-tree` enables safe parallel execution with informed merge ordering. For dependent stories, sequential execution with base-branch updating is the correct approach.

**Evidence:** [evidence/d6-merge-problem.md](evidence/d6-merge-problem.md)

**Three execution models for N stories:**

**Model A: Fully Sequential (safest, slowest)**
```
Story 1 branches from integration → completes → merges
Story 2 branches from updated integration → completes → merges
Story N branches from updated integration → completes → merges
```

Each story sees all prior code. Zero conflict risk. Maximum serialization.

**Model B: Fully Parallel (fastest, riskiest)**
```
Stories 1..N all branch from same base, execute simultaneously
After all complete: merge in optimal order based on conflict matrix
```

Maximum parallelism. Conflict risk proportional to file overlap. Requires post-completion merge resolution.

**Model C: Hybrid (recommended)**
```
Declare dependencies: Story 3 depends on Story 1's API
Independent stories (1, 2, 4) execute in parallel
Dependent story (3) waits for Story 1 to merge
Pre-flight conflict check before starting parallel batch
```

Balances parallelism with correctness. Requires dependency information.

**The conflict detection algorithm:**

```
function buildConflictMatrix(branches: string[]): boolean[][] {
  // O(N^2) merge-tree checks, each O(files) time
  const matrix = new Array(N).fill(null).map(() => new Array(N).fill(false));
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      // git merge-tree exits 0 on clean, 1 on conflict
      const hasConflict = exec(`git merge-tree -q ${branches[i]} ${branches[j]}`).exitCode === 1;
      matrix[i][j] = hasConflict;
      matrix[j][i] = hasConflict;
    }
  }
  return matrix;
}
```

From the conflict matrix, optimal merge order is determined by graph coloring:
1. Find independent sets (branches with no conflicts between them)
2. Merge each independent set (octopus or sequential -- both work for non-conflicting branches)
3. After each set merge, re-check remaining branches against updated integration
4. Continue until all branches are merged or conflicts require resolution

**Conflict resolution strategies (ordered by automation):**

| Strategy | When to Use | Automation Level |
|----------|-------------|------------------|
| Retry with updated base | Stories touch overlapping areas but conflict is structural (imports, exports) | Full -- agent re-executes against merged base |
| Agent-assisted resolution | Conflict requires domain understanding | Semi -- agent sees conflict markers, resolves |
| Human escalation | Conflict reflects design disagreement | Manual -- human decides, engine waits |
| Branch exclusion | One story's changes are low-priority or experimental | Full -- skip branch, merge remainder |

**Decision triggers for the executing orchestrator:**

- If all stories are known-independent (different packages, different modules) → Model B (parallel)
- If dependency graph is available → Model C (hybrid)
- If dependency graph is unknown → Model A (sequential) or Model B with pre-flight check
- If a story MUST see prior stories' APIs → sequential for that dependency chain
- If conflict is detected in pre-flight → either re-sequence or plan for post-merge resolution

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **LLM-based conflict resolution:** Emerging research on using LLMs to resolve git merge conflicts was not investigated. This could change the "conflict resolution delegation" picture significantly.
- **GitHub merge queue internals:** The exact batching algorithm and bisection logic were not examined in depth.
- **Gemini CLI, GitHub Copilot agent mode, Windsurf:** These tools were not individually investigated for worktree support.

### Out of Scope (per Rubric)

- Container-based isolation in depth (covered in existing coding-agent-workspace-lifecycle report)
- LLM-level parallelism mechanics (covered in existing agent-parallelism-mechanics report)
- Token cost of parallel vs. sequential agent execution

---

## References

### Evidence Files
- [evidence/d1-claude-code-worktrees.md](evidence/d1-claude-code-worktrees.md) - Claude Code worktree features, hooks, cleanup, limitations
- [evidence/d2-other-ai-tools.md](evidence/d2-other-ai-tools.md) - Tool-by-tool comparison of parallel isolation approaches
- [evidence/d3-git-worktree-mechanics.md](evidence/d3-git-worktree-mechanics.md) - Git worktree internals, performance, submodule issues
- [evidence/d4-merge-strategies.md](evidence/d4-merge-strategies.md) - Merge strategies, merge-tree, rerere, git-octopus
- [evidence/d5-prior-art-orchestration.md](evidence/d5-prior-art-orchestration.md) - Temporal, build systems, CI/CD, orchestration tools
- [evidence/d2-sandcastle-worktree-patterns.md](evidence/d2-sandcastle-worktree-patterns.md) - Sandcastle worktree lifecycle: 3 modes, collision detection, dirty preservation, stale pruning, reflink copy, temp-branch merge-back
- [evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md](evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md) - Ecosystem survey: pnpm global store, dirty preservation gaps, signal handling (Temporal/K8s), dynamic prompt context (Agent Situations), stale GC patterns
- [evidence/d6-merge-problem.md](evidence/d6-merge-problem.md) - Sequential/parallel agent merge analysis, conflict matrix algorithm

### External Sources
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows) - Official worktree documentation
- [git-worktree docs](https://git-scm.com/docs/git-worktree) - Official git worktree reference
- [git-merge-tree docs](https://git-scm.com/docs/git-merge-tree) - In-memory merge for conflict detection
- [git-rerere docs](https://git-scm.com/book/en/v2/Git-Tools-Rerere) - Recorded conflict resolutions
- [LesFurets git-octopus](https://github.com/lesfurets/git-octopus) - Continuous merge workflow at production scale
- [Codex CLI Features](https://developers.openai.com/codex/cli/features) - Codex worktree + sandbox model
- [Cursor Parallel Agents](https://cursor.com/docs/configuration/worktrees) - Cursor worktree documentation
- [MultiDevin docs](https://docs.devin.ai/working-with-teams/multidevin) - Manager-worker merge pattern
- [SWE-ReX](https://github.com/SWE-agent/SWE-ReX) - Container-based agent runtime
- [dmux](https://github.com/standardagents/dmux) - Dev agent multiplexer with merge UI
- [Superset](https://github.com/superset-sh/superset) - Parallel agent editor with diff viewer
- [Composio Agent Orchestrator](https://github.com/ComposioHQ/agent-orchestrator) - Parallel agents with CI/conflict forwarding
- [OpenCode Worktree Plugin](https://github.com/kdcokenny/opencode-worktree) - Community worktree plugin for OpenCode
- [Claude Code Worktree Hooks](https://github.com/tfriedel/claude-worktree-hooks) - Community hook examples
- [EnterWorktree ignores hooks (issue #36205)](https://github.com/anthropics/claude-code/issues/36205) - Known bug
- [Sandcastle](https://github.com/mattpocock/sandcastle) - Docker + worktree agent orchestration with full lifecycle management
- [pnpm Git Worktrees guide](https://pnpm.io/next/git-worktrees) - Official pnpm guide for worktree workflows (March 2026)
- [Agent Situations](https://github.com/dave1010/agent-situations) - Shell expression evaluation at prompt time (CC0)
- [Temporal Worker Shutdown](https://docs.temporal.io/encyclopedia/workers/worker-shutdown) - Graceful shutdown model for workflow engines
- [Cline Worktrees docs](https://docs.cline.bot/features/worktrees) - `.worktreeinclude` pattern for dependency copying

### Related Research
- [reports/coding-agent-workspace-lifecycle/](../coding-agent-workspace-lifecycle/) - Broader workspace lifecycle across 10 agents (isolation, persistence, cleanup, consolidation)
- [reports/claude-code-agent-teams/](../claude-code-agent-teams/) - Agent teams architecture, worktree integration, cost analysis
- [reports/agent-parallelism-mechanics/](../agent-parallelism-mechanics/) - LLM-level and framework-level parallelism mechanics
