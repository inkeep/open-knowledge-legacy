# Evidence: D4 Branch Management

**Dimension:** D4 — Branch picker, create, switch (dirty tree), delete, stash, worktree, detached HEAD
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GitKraken, Fork, Obsidian-Git (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/git/src/commands.ts` (lines 2852, 2930-2978, 3014-3036, 3142, 3284, 3330-3344) — branch picker, dirty-tree modal, delete
- `microsoft/vscode` `extensions/git/src/git.ts` (lines 3041-3042) — detached HEAD check
- `microsoft/vscode` `extensions/git/src/statusbar.ts` (lines 94-95) — `$(git-commit)` icon for detached
- `desktop/desktop` `app/src/ui/branches/group-branches.ts` — three-section list
- `desktop/desktop` `app/src/models/uncommitted-changes-strategy.ts` — strategy enum
- `desktop/desktop` `app/src/ui/create-branch/create-branch-dialog.tsx` — `StartPoint` enum, GitHub API ruleset check
- `desktop/desktop` `app/src/lib/sanitize-ref-name.ts` — name sanitization
- `jesseduffield/lazygit` `pkg/commands/git_commands/branch_loader.go` (lines 53-120) — three sort modes
- `jesseduffield/lazygit` `pkg/commands/git_commands/worktree.go` — collision detection
- `jesseduffield/lazygit` `pkg/gui/controllers/helpers/refs_helper.go` — autostash sequence
- `jesseduffield/lazygit` `pkg/gui/presentation/branches.go` — divergence symbols, `ShowDivergenceFromBaseBranch`
- `magit/magit` `lisp/magit-branch.el` — spinoff/spinout, dirty-tree `user-error`
- `magit/magit` `lisp/magit-stash.el` — 6 stash variants
- `magit/magit` `lisp/magit-worktree.el` — worktree transient
- `zed-industries/zed` `crates/git_ui/src/branch_picker.rs` — fuzzy picker
- `zed-industries/zed` `crates/git_ui/src/worktree_picker.rs` — worktree UI
- `JetBrains/intellij-community` `plugins/git4idea/shared/src/com/intellij/vcs/git/branch/popup/GitBranchesTreeModel.kt` — 5 Lazy*Holder subtrees
- `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/branch/GitCheckoutOperation.java` — Smart Checkout

---

## Findings

### Finding: Dirty-working-tree handling is the highest-variance UX decision
**Confidence:** CONFIRMED
**Evidence:** All 9 tools surveyed handle it differently

VS Code: 3-option modal (stash/migrate/force). GitHub Desktop: configurable strategy enum persisted in localStorage. lazygit: autostash prompt on error detection. Magit: hard `user-error` on create-with-start-point. Zed: delegates to git, toast on error. JetBrains: Smart Checkout uses Shelf (not git stash).

### Finding: Branch-from-issue integration exists in exactly two tools
**Confidence:** CONFIRMED
**Evidence:** JetBrains Tasks plugin docs, lazygit PR status display

JetBrains: configurable template-based branch naming with 10+ issue trackers. lazygit: PR status badges, no issue-to-branch creation.

### Finding: Magit's spinoff/spinout is unique in the ecosystem
**Confidence:** CONFIRMED
**Evidence:** `magit/magit` `lisp/magit-branch.el`

`spinoff` creates a new branch, moves unpushed commits to it, resets source to merge-base via `git update-ref`. No other tool offers this.

### Finding: lazygit has the most complete worktree support
**Confidence:** CONFIRMED
**Evidence:** `jesseduffield/lazygit` `pkg/commands/git_commands/worktree.go`

Full panel: create (from ref / detached), switch session, remove, open in editor. Branch-worktree collision detection: prompts to switch to existing worktree.

### Finding: "Recently used" branches diverge between committer-date and reflog
**Confidence:** CONFIRMED
**Evidence:** VS Code `git.branchSortOrder` default `committerdate`; GitHub Desktop `git log -g` reflog scan (n=2500)

Committer-date sort puts recently-modified branches first. Reflog-based recency puts recently-switched-to branches first.

---

## Negative searches

- Searched for proactive "create branch to rescue" in detached HEAD: not found in any editor
- Searched for automatic remote branch rename: not found (reflects git's lack of atomic remote rename)
