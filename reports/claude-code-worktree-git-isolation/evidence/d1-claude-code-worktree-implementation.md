# Evidence: Claude Code Worktree Implementation

**Dimension:** D1 -- Claude Code worktree implementation (deep, primary source)
**Date:** 2026-04-02
**Sources:** Official Claude Code docs (code.claude.com), GitHub issues, community posts

---

## Key pages referenced

- https://code.claude.com/docs/en/common-workflows -- official worktree documentation (primary)
- https://github.com/anthropics/claude-code/issues/36205 -- EnterWorktree ignores hooks bug
- https://github.com/anthropics/claude-code/issues/31969 -- feature requests for worktree improvements
- https://github.com/anthropics/claude-code/issues/33045 -- agent isolation: worktree bug for team agents
- https://www.kenmuse.com/blog/workspace-vs-worktree-isolation-in-copilot-cli/ -- Copilot CLI comparison (workspace vs worktree)
- https://www.damiangalarza.com/posts/2026-03-10-extending-claude-code-worktrees-for-true-database-isolation/ -- database isolation extension
- https://www.threads.com/@boris_cherny/post/DVAAnexgRUj -- Boris Cherny (Anthropic) announcing worktree support

---

## Findings

### Finding: Worktree creation mechanics
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Use the --worktree (-w) flag to create an isolated worktree and start Claude in it.
The value you pass becomes the worktree directory name and branch name.

Worktrees are created at <repo>/.claude/worktrees/<name> and branch from the
default remote branch, which is where origin/HEAD points. The worktree branch
is named worktree-<name>.
```

Key mechanics:
- Directory: `<repo>/.claude/worktrees/<name>`
- Branch: `worktree-<name>`, based on `origin/HEAD`
- Name optional -- auto-generates random name (e.g., "bright-running-fox")
- Base branch NOT configurable via flag -- only via `git remote set-head` or WorktreeCreate hook
- Standard `git worktree add` under the hood

**Implications:** A worktree is a real directory on disk with real files. Editors can open it, web servers can serve from it, file watchers work normally. This is a fundamental difference from CRDT namespaces (virtual).

### Finding: EnterWorktree / ExitWorktree tool mechanics
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows + tool definitions

EnterWorktree:
- Creates a git worktree inside `.claude/worktrees/` with a new branch based on HEAD
- Switches the session's working directory to the new worktree
- Can be triggered by asking Claude to "work in a worktree" or "start a worktree" mid-session
- Requires being in a git repo (or having WorktreeCreate/WorktreeRemove hooks)
- Cannot be used when already in a worktree

ExitWorktree:
- Two actions: "keep" (leave worktree + branch intact) or "remove" (delete both)
- If worktree has uncommitted files or unmerged commits, tool REFUSES to remove unless `discard_changes: true`
- Restores session's working directory to original location
- Clears CWD-dependent caches (system prompt sections, memory files, plans)

**Implications:** The keep/remove flow is a simple binary decision. No merge, no PR creation. The user's responsibility to integrate changes.

### Finding: Subagent worktree isolation
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Subagents can also use worktree isolation to work in parallel without conflicts.
Ask Claude to "use worktrees for your agents" or configure it in a custom subagent
by adding isolation: worktree to the agent's frontmatter. Each subagent gets its
own worktree that is automatically cleaned up when the subagent finishes without changes.
```

- Each subagent gets its own worktree (separate directory, separate branch)
- Auto-cleanup when no changes
- Known bug: `isolation: worktree` has no effect for team agents (issue #33045)
- Known bug: EnterWorktree ignores WorktreeCreate/WorktreeRemove hooks (issue #36205)

### Finding: Multiple worktrees can coexist
**Confidence:** CONFIRMED
**Evidence:** Official docs show running multiple `claude --worktree` instances

```bash
# Start Claude in a worktree named "feature-auth"
claude --worktree feature-auth

# Start another session in a separate worktree
claude --worktree bugfix-123
```

Each worktree is independent. No limit mentioned. All share the same .git object database.

### Finding: Cleanup semantics
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

- No changes: worktree + branch removed automatically
- Changes/commits exist: prompt to keep or remove
- Keeping preserves directory + branch
- Removing deletes everything, discards uncommitted changes and commits
- Subagent worktrees orphaned by crash: auto-removed after `cleanupPeriodDays` (only if no tracked-file modifications, no unpushed commits)
- User-created worktrees (`--worktree`) never auto-removed by this sweep

### Finding: .worktreeinclude for gitignored files
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Add a .worktreeinclude file to your project root.
Uses .gitignore syntax. Only files that match AND are gitignored get copied.
```

Solves: env files, secrets, local config
Does NOT solve: database isolation, port conflicts, runtime isolation

### Finding: WorktreeCreate/WorktreeRemove hooks
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

- Hooks replace default git behavior entirely
- WorktreeCreate receives JSON on stdin, must print worktree path to stdout
- Exit code 2 aborts creation
- WorktreeRemove hooks are informational (cannot prevent removal)
- Mutually exclusive with .worktreeinclude

### Finding: What Claude Code does NOT do with worktrees
**Confidence:** CONFIRMED
**Evidence:** Official docs (confirmed absence)

Zero mention of:
- Merging worktree branches back to main
- Detecting conflicts between worktree branches
- Creating PRs from worktree branches
- Post-completion consolidation
- Any diffing between worktree and main

The docs state: "For automated coordination of parallel sessions with shared tasks and messaging, see agent teams." Agent teams handle task coordination, not code merging.

---

## Gaps / follow-ups

- How agent teams interact with worktrees (coordination, not merge)
- Whether future Claude Code releases plan any merge/consolidation features
- Performance of worktree creation for repos of different sizes (no benchmarks in official docs)
