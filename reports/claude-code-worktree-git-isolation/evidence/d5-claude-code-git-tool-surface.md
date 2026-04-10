# Evidence: Claude Code Git Tool Surface

**Dimension:** D5 -- Claude Code's git tool surface
**Date:** 2026-04-02
**Sources:** Official Claude Code docs, tool definitions, community skills

---

## Key pages referenced

- https://code.claude.com/docs/en/common-workflows -- workflows docs
- https://code.claude.com/docs/en/skills -- skills system
- https://github.com/anthropics/claude-code/blob/main/.claude/commands/commit-push-pr.md -- built-in commit-push-pr command
- https://claudefa.st/blog/guide/development/git-integration -- community git integration guide

---

## Findings

### Finding: Claude Code has NO git-specific tools beyond EnterWorktree/ExitWorktree
**Confidence:** CONFIRMED
**Evidence:** Tool definitions in the system (direct observation)

The only git-specific tools in Claude Code's tool surface are:
1. **EnterWorktree** -- create and enter a git worktree
2. **ExitWorktree** -- leave a worktree (keep or remove)

All other git operations are performed via the **Bash tool** -- Claude Code runs `git` commands directly in the terminal. This is by design: Claude Code has full terminal access, so it doesn't need specialized tools for git operations.

### Finding: Git operations Claude Code performs via Bash
**Confidence:** CONFIRMED
**Evidence:** Official docs + system prompt

Claude Code routinely performs all of these via Bash:
- `git status` -- check working tree
- `git diff` -- see changes (staged, unstaged, between branches)
- `git log` -- view commit history
- `git add <files>` -- stage files
- `git commit -m "message"` -- create commits
- `git branch` -- list/create branches
- `git checkout` / `git switch` -- switch branches
- `git merge` -- merge branches
- `git push` -- push to remote
- `git pull` -- pull from remote
- `git stash` -- stash changes
- `gh pr create` -- create pull requests (via GitHub CLI)

The system prompt includes specific guidelines for git operations:
- Prefer specific file staging over `git add -A`
- Create new commits rather than amending
- Never skip hooks or force push to main
- Include co-author attribution in commits

### Finding: The /commit skill pattern
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/skills + community analysis

The `/commit` skill is a markdown file that:
1. Pre-executes `git diff --staged` and `git status` via `!` command syntax
2. Feeds the actual diff data to Claude's context
3. Claude analyzes the changes and generates a conventional commit message
4. Claude runs `git commit -m "..."` via Bash

The `!<command>` syntax runs shell commands before the skill content is sent to Claude. Output replaces the placeholder. Claude sees actual data, not the command.

Skills can include `disable-model-invocation: true` to prevent automatic triggering -- important for side-effect operations like /commit.

### Finding: Built-in commit-push-pr command
**Confidence:** CONFIRMED
**Evidence:** https://github.com/anthropics/claude-code/blob/main/.claude/commands/commit-push-pr.md

Claude Code ships with a built-in `/commit-push-pr` slash command that:
1. Checks git status
2. Stages relevant files
3. Generates a commit message
4. Commits
5. Pushes to remote
6. Creates a PR via `gh pr create`

This is a Bash-driven workflow -- no specialized git tools needed.

### Finding: Session linkage to PRs
**Confidence:** CONFIRMED
**Evidence:** https://code.claude.com/docs/en/common-workflows

```
When you create a PR using `gh pr create`, the session is automatically linked
to that PR. You can resume it later with `claude --from-pr <number>`.
```

Claude Code tracks PR associations at the session level, enabling resumption from a PR number.

### Finding: No git-aware semantic tools
**Confidence:** CONFIRMED
**Evidence:** Confirmed absence in tool surface

Claude Code does NOT have:
- A "create branch" tool (uses `git branch` via Bash)
- A "merge" tool (uses `git merge` via Bash)
- A "diff" tool with semantic understanding (uses `git diff` via Bash, then reads the output)
- A "resolve conflict" tool (reads conflict markers, edits files manually)
- A "rebase" tool (uses `git rebase` via Bash)

The philosophy is: git CLI is the tool. Claude Code provides the intelligence layer on top of raw git output.

---

## Implications for knowledge platform

For a knowledge platform, this means:
1. **No need for specialized git tools** -- Claude Code can perform any git operation via Bash
2. **MCP tools for git could add value** -- by providing higher-level abstractions (create_draft, publish_draft) that wrap git operations
3. **The /commit skill pattern is reusable** -- a /create-draft skill could use `!git worktree add` pre-execution
4. **PR-linked sessions could be adapted** -- draft-linked sessions (resume working on a draft)

---

## Gaps / follow-ups

- Whether Claude Code's Bash-based git approach is sufficient for a managed platform (vs. MCP tools with validation)
- How to implement git operations that require user confirmation (e.g., merge with conflicts)
