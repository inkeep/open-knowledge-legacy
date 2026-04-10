# Evidence: Claude Code Worktree Management

**Dimension:** D1 — Claude Code worktree management
**Date:** 2026-03-30
**Sources:** Official Claude Code docs (code.claude.com), GitHub issues, community blog posts

---

## Key pages referenced

- https://code.claude.com/docs/en/common-workflows — official worktree documentation
- https://github.com/anthropics/claude-code/issues/36205 — EnterWorktree ignores hooks bug
- https://github.com/anthropics/claude-code/issues/31969 — feature requests for worktree improvements
- https://github.com/tfriedel/claude-worktree-hooks — community hook examples
- https://www.damiangalarza.com/posts/2026-03-10-extending-claude-code-worktrees-for-true-database-isolation/ — database isolation extension
- https://mattbrailsford.dev/replacing-my-custom-git-worktree-skill-with-claude-code-hooks — hook patterns

---

## Findings

### Finding: `--worktree` flag creates isolated git worktrees at `.claude/worktrees/<name>`
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Use the --worktree (-w) flag to create an isolated worktree and start Claude in it.
The value you pass becomes the worktree directory name and branch name.

Worktrees are created at <repo>/.claude/worktrees/<name> and branch from the
default remote branch, which is where origin/HEAD points. The worktree branch
is named worktree-<name>.
```

**Implications:** Standard git worktree mechanics under the hood. Branch base is `origin/HEAD`, not configurable via flag — only via `git remote set-head` or WorktreeCreate hook.

### Finding: Subagent worktree isolation via `isolation: worktree` frontmatter
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Subagents can also use worktree isolation to work in parallel without conflicts.
Ask Claude to "use worktrees for your agents" or configure it in a custom subagent
by adding isolation: worktree to the agent's frontmatter. Each subagent gets its
own worktree that is automatically cleaned up when the subagent finishes without changes.
```

**Implications:** Each subagent gets its own branch and working directory. Cleanup is automatic when no changes exist.

### Finding: Cleanup semantics — auto-remove if clean, prompt if dirty
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
No changes: the worktree and its branch are removed automatically
Changes or commits exist: Claude prompts you to keep or remove the worktree.
Keeping preserves the directory and branch so you can return later.
Removing deletes the worktree directory and its branch, discarding all
uncommitted changes and commits.
```

**Implications:** Clean-exit-only auto-removal. No automatic merge, no automatic PR creation.

### Finding: `.worktreeinclude` copies gitignored files to new worktrees
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
Git worktrees are fresh checkouts, so they don't include untracked files like
.env or .env.local from your main repository. To automatically copy these files
when Claude creates a worktree, add a .worktreeinclude file to your project root.

The file uses .gitignore syntax to list which files to copy. Only files that match
a pattern and are also gitignored get copied, so tracked files are never duplicated.
```

**Implications:** Solves the environment file problem. Does NOT solve database isolation, port conflicts, or runtime environment isolation.

### Finding: WorktreeCreate/WorktreeRemove hooks replace default git behavior
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows + community sources

```
For other version control systems like SVN, Perforce, or Mercurial, configure
WorktreeCreate and WorktreeRemove hooks to provide custom worktree creation and
cleanup logic. When configured, these hooks replace the default git behavior when
you use --worktree, so .worktreeinclude is not processed.
```

The hooks receive JSON on stdin and must print the worktree path to stdout. WorktreeCreate supports exit code 2 to abort creation. WorktreeRemove hooks are informational and cannot prevent removal (feature request open: issue #31969).

**Implications:** Full flexibility for custom worktree setup. But hooks are mutually exclusive with `.worktreeinclude` — if you use hooks, you must handle file copying yourself.

### Finding: Known bug — EnterWorktree tool ignores hooks
**Confidence:** CONFIRMED
**Evidence:** https://github.com/anthropics/claude-code/issues/36205

```
When WorktreeCreate and WorktreeRemove hooks are configured in .claude/settings.json,
the claude --worktree CLI flag correctly invokes them. However, the in-session
EnterWorktree tool (used when asking Claude to switch to a worktree mid-conversation,
or via Agent(isolation: "worktree")) ignores these hooks entirely and uses built-in
git worktree add instead.
```

**Implications:** Repos requiring custom worktree setup (git-crypt, sparse checkout, post-checkout deps) work with `--worktree` but fail mid-session.

### Finding: Claude Code does NOT do merge, conflict detection, or consolidation
**Confidence:** CONFIRMED
**Evidence:** Official docs (absence of any merge/conflict documentation)

The official docs describe worktree creation, cleanup, and `.worktreeinclude`. There is zero mention of:
- Merging worktree branches back to main
- Detecting conflicts between worktree branches
- Creating PRs from worktree branches
- Any post-completion consolidation

The docs state: "For automated coordination of parallel sessions with shared tasks and messaging, see agent teams." Agent teams handle task coordination, not code merging.

**Implications:** Merge is entirely the user's responsibility. This is a deliberate design choice — Claude Code provides isolation, not integration.

---

## Gaps / follow-ups

- How agent teams (when used with worktrees) handle the merge step
- Whether any community tools (ccswarm, etc.) add merge automation on top of Claude Code worktrees
