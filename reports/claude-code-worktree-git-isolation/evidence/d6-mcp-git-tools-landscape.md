# Evidence: MCP Tools That Expose Git Operations

**Dimension:** D6 -- MCP tools that expose git operations
**Date:** 2026-04-02
**Sources:** GitHub repos, npm packages, MCP server directories

---

## Key pages referenced

- https://github.com/github/github-mcp-server -- GitHub's official MCP server
- https://github.com/modelcontextprotocol/servers/tree/main/src/git -- Anthropic's official git MCP server
- https://github.com/cyanheads/git-mcp-server -- Community git MCP server (28 tools)
- https://www.npmjs.com/package/@cyanheads/git-mcp-server -- npm package
- https://apidog.com/blog/top-10-mcp-servers-for-git-tools/ -- MCP git tools landscape overview

---

## Findings

### Finding: Three tiers of git MCP servers exist
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

**Tier 1: Anthropic's official git MCP server (12 tools)**
Part of `@modelcontextprotocol/servers` monorepo. Python-based.

Tools:
1. `git_status` -- working tree status
2. `git_diff_unstaged` -- unstaged changes
3. `git_diff_staged` -- staged changes
4. `git_diff` -- diff between branches/commits
5. `git_commit` -- commit changes
6. `git_add` -- stage files
7. `git_reset` -- unstage all
8. `git_log` -- commit log with date filtering
9. `git_create_branch` -- create branch
10. `git_checkout` -- switch branches
11. `git_show` -- show commit contents
12. `git_branch` -- list branches

Notable OMISSIONS: No merge, no rebase, no push, no pull, no worktree operations.

**Tier 2: GitHub's official MCP server (GitHub platform operations)**
Go-based. Focuses on GitHub platform, not local git.

Tool categories:
- Repository operations (browse code, search files, analyze commits)
- Issue & PR management (create, update, manage)
- CI/CD workflow intelligence (Actions, build analysis)
- Code security (Dependabot, security findings)
- Team collaboration (discussions, notifications)

Notable: This is GitHub-the-platform, not git-the-tool. No local git operations. No worktree support.

**Tier 3: Community git MCP server -- @cyanheads/git-mcp-server (28 tools)**
TypeScript/Bun-based. Most comprehensive.

Tools by category:
- Repository: `git_init`, `git_clone`, `git_status`, `git_clean`
- Staging & Commits: `git_add`, `git_commit`, `git_diff`
- History: `git_log`, `git_show`, `git_blame`, `git_reflog`
- Branching & Merging: `git_branch`, `git_checkout`, `git_merge`, `git_rebase`, `git_cherry_pick`
- Remote: `git_remote`, `git_fetch`, `git_pull`, `git_push`
- Advanced: `git_tag`, `git_stash`, `git_reset`, **`git_worktree`**, `git_set_working_dir`

Notable: Has `git_worktree` tool AND `git_merge`. This is the most complete git MCP server.

### Finding: GitHub MCP server does NOT expose local git operations
**Confidence:** CONFIRMED
**Evidence:** https://github.com/github/github-mcp-server

The GitHub MCP server is for GitHub-the-platform:
- Read repository files (via API)
- Create/manage issues and PRs
- Monitor Actions workflows
- Security analysis

It does NOT:
- Run local git commands
- Create/manage worktrees
- Perform local merges
- Handle local branch operations

**Implications:** For a knowledge platform, the GitHub MCP server would be useful for PR/issue management but not for local draft management.

### Finding: The community git MCP server includes worktree support
**Confidence:** CONFIRMED
**Evidence:** https://github.com/cyanheads/git-mcp-server

```
Comprehensive Git operations including clone, commit, branch, diff, log,
status, push, pull, merge, rebase, worktree, tag management, and more.
```

The `git_worktree` tool provides programmatic worktree management via MCP. This means an AI agent connected via MCP could create, list, and remove worktrees.

Safety features: checks for destructive operations (`git clean`, `git reset --hard`), GPG/SSH signing support.

### Finding: A draft management MCP server could wrap git operations
**Confidence:** INFERRED
**Evidence:** Architectural analysis

A purpose-built MCP server for draft management could expose:

```
create_draft(name, base_branch?) -> { draft_id, worktree_path, branch_name }
  // Wraps: git worktree add .claude/worktrees/<name> -b draft-<name>

list_drafts() -> [{ draft_id, branch, status, last_modified }]
  // Wraps: git worktree list + branch metadata

get_draft_diff(draft_id) -> { files_changed, insertions, deletions, diff_text }
  // Wraps: git diff main..draft-<name>

publish_draft(draft_id, merge_strategy?) -> { success, conflicts? }
  // Wraps: git merge draft-<name> (or rebase, or squash)

discard_draft(draft_id) -> { success }
  // Wraps: git worktree remove + git branch -D

preview_draft(draft_id) -> { preview_url }
  // Wraps: serve files from worktree directory
```

This would provide:
- Higher-level abstractions than raw git commands
- Validation (e.g., prevent publishing a draft with merge conflicts)
- Metadata tracking (draft author, creation date, description)
- Integration with the platform's auth/permissions model

**Implications:** This MCP server would replace the need for CRDT-based draft management tools. The agent calls `create_draft()` instead of managing Yjs namespaces.

### Finding: MCP tools complement but don't replace Bash git access
**Confidence:** INFERRED
**Evidence:** Claude Code's architecture

Claude Code has full Bash access to git. MCP git tools add value when:
1. The caller doesn't have direct CLI access (e.g., a web UI calling via MCP)
2. You want validation/guardrails on git operations
3. You want higher-level abstractions (draft lifecycle vs raw git commands)
4. You want to expose git operations to other MCP clients (not just Claude Code)

For the knowledge platform specifically, MCP tools would be the primary interface for the web UI, while agents like Claude Code could use either MCP or direct Bash.

---

## Gaps / follow-ups

- Whether the community git MCP server's `git_worktree` tool is production-ready
- Performance characteristics of MCP-mediated git operations vs direct CLI
- How to handle authentication/authorization in a git MCP server for multi-tenant drafts
