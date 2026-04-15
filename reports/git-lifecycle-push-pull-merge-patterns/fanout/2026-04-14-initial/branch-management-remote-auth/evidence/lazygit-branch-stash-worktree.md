# Evidence: lazygit — Branch Management, Stash & Worktrees

**Dimension:** D4 (Branch management)
**Date:** 2026-04-14
**Sources:** jesseduffield/lazygit (GitHub) — `pkg/commands/git_commands/`, `pkg/gui/controllers/`, `pkg/gui/presentation/`

---

## Key files referenced

- `pkg/commands/git_commands/branch.go` — branch checkout, create, rename, delete
- `pkg/commands/git_commands/branch_loader.go` — branch list loading, sorting, upstream parsing
- `pkg/commands/git_commands/stash.go` — stash operations
- `pkg/commands/git_commands/worktree.go` — worktree create/delete
- `pkg/commands/git_commands/worktree_loader.go` — worktree discovery
- `pkg/gui/controllers/branches_controller.go` — branch panel keybindings
- `pkg/gui/controllers/stash_controller.go` — stash panel keybindings
- `pkg/gui/controllers/worktrees_controller.go` — worktree panel keybindings
- `pkg/gui/controllers/helpers/branches_helper.go` — delete confirmation, merge check
- `pkg/gui/controllers/helpers/refs_helper.go` — checkout with dirty-tree autostash
- `pkg/gui/controllers/helpers/worktree_helper.go` — worktree create/switch/remove
- `pkg/gui/presentation/branches.go` — branch row rendering
- `pkg/config/user_config.go` — configuration options

---

## Findings

### D4.1: Branch Panel UX

**Finding:** Three sort modes with separate local/remote panels; reflog-based recency sort.
**Confidence:** CONFIRMED
**Evidence:** `pkg/commands/git_commands/branch_loader.go:53-120`

- `date` — `git for-each-ref --sort=-committerdate`
- `alphabetical` — `git for-each-ref --sort=refname`
- `recency` — reflog-derived: scans for `checkout: moving from X to Y` entries, computes timestamps, merges at front of alphabetical remainder

Current HEAD branch always at position 0 with green `*` indicator. Local and remote branches in separate panels (not tabs).

Fuzzy search: `ListControllerTrait` with `filter_controller.go` for in-panel filtering. `checkoutByName` uses `GetRefsSuggestionsFunc()` — fuzzy across all refs.

### D4.2: Create Branch

**Finding:** Multiple creation paths with configurable branch prefix template.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/controllers/branches_controller.go:newBranch`, `pkg/gui/controllers/helpers/refs_helper.go`

- From branches panel: `git checkout -b <name> <base>` with `BranchPrefix` config pre-fill (supports `{{runCommand "..."}}` template)
- From remote branch: menu with "create local tracking branch" (`git branch --track`) or "checkout detached"
- From commit: `git branch <name> <base>` (no checkout)
- `--no-track` variant available for non-tracking creation

### D4.3: Switch with Dirty Tree — Autostash Prompt

**Finding:** Detects checkout failure from error string, offers autostash sequence.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/controllers/helpers/refs_helper.go`

On `git checkout` failure ("Please commit your changes or stash them"):
1. Prompt: AutoStashTitle / AutoStashPrompt
2. If confirmed: `git stash push -m "lazygit: autostash for checkout <ref>"` → `git checkout <ref>` → `git stash pop 0`
3. If pop fails (conflict), branch switch still completes

Separate `forceCheckout` keybinding: `git checkout --force <branch>` with confirmation dialog.

### D4.4: Delete Branch — Merge Check + Worktree Protection

**Finding:** Three-option delete menu (local/remote/both); merge check against HEAD + upstream + main branches.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/controllers/branches_controller.go:delete`, `pkg/gui/controllers/helpers/branches_helper.go`

Merge check: `git rev-list --max-count=1 <branch> ^HEAD ^<upstream>@{upstream} ^<mainBranches>... --`
If unmerged → force-delete confirmation dialog.

Worktree protection: if branch checked out in another worktree, delete blocked → menu: "Switch to worktree", "Detach worktree", "Remove worktree".

Multi-select: range selection for batch delete (force check per branch).

### D4.5: Rename Branch

**Finding:** Rename with remote-tracking warning; pre-fills current name.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/controllers/branches_controller.go:rename`

If branch has remote upstream: warning dialog ("this won't rename the remote branch") before prompt. Git command: `git branch --move <old> <new>`.

### D4.6: Stash Management

**Finding:** Comprehensive stash operations including rename, staged-only, unstaged-only.
**Confidence:** CONFIRMED
**Evidence:** `pkg/commands/git_commands/stash.go`

- `Push(message)`: `git stash push -m <message>`
- `Pop(index)`: `git stash pop refs/stash@{N}`
- `Apply(index)`: `git stash apply refs/stash@{N}`
- `Drop(index)`: `git stash drop refs/stash@{N}`
- `Rename(index, message)`: Hash → Drop → Store (re-store with new message)
- `StashAndKeepIndex`: `git stash push --keep-index`
- `SaveStagedChanges`: `git stash push --staged` (git ≥2.35, multi-step fallback for older)
- `StashUnstagedChanges`: temporary commit → stash → reset soft

Controller: apply, pop, drop (with confirmation), new branch from stash entry, rename. Bulk drop supports range selection (processed in reverse index order). `SkipStashWarning` config bypasses confirmations.

### D4.7: Detached HEAD

**Finding:** Detected via `symbolic-ref` failure; synthetic branch entry with hash; no auto-rescue.
**Confidence:** CONFIRMED
**Evidence:** `pkg/commands/git_commands/branch.go:CurrentBranchInfo`

`git symbolic-ref --short HEAD` fails → fallback to `git branch --points-at=HEAD`. `BranchInfo.DetachedHead = true`. Display: synthetic `models.Branch` with hash as `DisplayName` at position 0 in branch list. No automatic "create branch to rescue" dialog.

### D4.8: Branch Visualization

**Finding:** Rich branch row with upstream status, base-branch divergence, PR status, and custom coloring.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/presentation/branches.go`, `pkg/commands/git_commands/branch_loader.go`

Upstream status symbols: `✓` (matches), `↓N↑M` (diverged), `↓N` (behind), `↑N` (ahead), `?` (not stored locally), `UpstreamGone` (remote deleted).

Base-branch divergence: `ShowDivergenceFromBaseBranch` setting → concurrent `git rev-list --left-right --count` per branch.

PR status: colored dot (green=OPEN, red=CLOSED, purple=MERGED, gray=DRAFT) with hyperlinked PR number.

Custom branch colors: `BranchColorPatterns` config (regex → color).

### D4.9: Worktree Support

**Finding:** Dedicated worktree panel with full lifecycle; branch-worktree collision detection.
**Confidence:** CONFIRMED
**Evidence:** `pkg/gui/controllers/worktrees_controller.go`, `pkg/gui/controllers/helpers/worktree_helper.go`

Panel keybindings: New, Select/GoInto (switch session), OpenFile (open in editor), Remove.

Creation flow: Menu "Create from ref" / "Create from ref (detached)" → prompt for base ref (fuzzy) → prompt for path → prompt for branch name → `git worktree add [-b <branch>] <path> <base>` → `DispatchSwitchTo` (switch lazygit session).

Discovery: `git worktree list --porcelain`, handles mid-rebase worktrees.

Branch collision: checking out a branch that's in another worktree → prompt to switch to that worktree instead. Badge: linked-worktree icon with worktree name in branch row.

Guards: can't delete current worktree, can't delete main worktree.

Auto-forward branches: `Git.AutoForwardBranches` → fast-forward via `git update-ref --stdin` in batch post-fetch.
