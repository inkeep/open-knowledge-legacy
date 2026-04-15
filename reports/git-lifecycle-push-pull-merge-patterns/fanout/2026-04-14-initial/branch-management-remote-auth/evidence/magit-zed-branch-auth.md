# Evidence: Magit & Zed — Branch Management & Auth Persistence

**Dimension:** D4 (Branch management) + D5 (Remote/auth persistence)
**Date:** 2026-04-14
**Sources:** magit/magit (GitHub) — `lisp/magit-*.el`; zed-industries/zed (GitHub) — `crates/git_ui/`, `crates/askpass/`, `crates/git/`

---

## Key files referenced

**Magit:**
- `lisp/magit-branch.el` — Branch transient, create, delete, rename, spinoff/spinout
- `lisp/magit-stash.el` — Stash transient, apply/pop/drop
- `lisp/magit-worktree.el` — Worktree commands
- `lisp/magit-refs.el` — Refs buffer, ahead/behind rendering
- `lisp/magit-git.el` — Git commands, `magit-get-current-branch`
- `lisp/magit-process.el` — Process filter, credential interception
- `lisp/magit-status.el` — Status buffer, detached HEAD display
- `lisp/magit-push.el` / `lisp/magit-pull.el` — Push/pull transients

**Zed:**
- `crates/git_ui/src/branch_picker.rs` — Branch picker modal
- `crates/git_ui/src/stash_picker.rs` — Stash picker
- `crates/git_ui/src/worktree_picker.rs` — Worktree picker
- `crates/git_ui/src/git_panel.rs` — Main git panel
- `crates/git_ui/src/askpass_modal.rs` — Credential modal
- `crates/askpass/src/askpass.rs` — Unix socket askpass IPC
- `crates/git/src/repository.rs` — Repository layer
- `crates/credentials_provider/src/credentials_provider.rs` — OS keychain abstraction

---

## Magit Findings

### D4.1-D4.2: Branch Transient

**Finding:** Lettered transient popup with three sections (Checkout, Create, Do) and unique branch creation primitives.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-branch.el`

Checkout: `b` (any ref), `l` (local only), `o` (orphan)
Create: `c` (create+checkout), `n` (create only), `s` (spinoff), `S` (spinout), `w`/`W` (worktree variants)
Do: `C` (configure), `m` (rename), `x` (reset), `k` (delete)

**Spinoff/spinout** — unique to Magit:
- `magit-branch-spinoff`: creates branch, moves unpushed commits to it, resets source to merge-base, checks out new branch
- `magit-branch-spinout`: same but stays on current branch (unless dirty → falls back to spinoff)
- Mechanism: `git update-ref` to rewrite the source branch ref, not force-push

Upstream inheritance: `magit-branch-maybe-adjust-upstream` fires after creation with configurable rules.

### D4.3: Switch with Dirty Tree

**Finding:** Hard error on branch-create-with-start-point; delegates to git on existing branch checkout; no auto-stash.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-branch.el`

```elisp
(when (magit-anything-modified-p t)
  (user-error "Cannot checkout when there are uncommitted changes"))
```

`--autostash` available only in `magit-pull` transient (as `-A`). No auto-stash-on-checkout.

### D4.4: Delete Branch

**Finding:** Handles local (safe/force), remote (git push --delete), and current-branch deletion with rescue options.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-branch.el`

- Local: `-d` (safe) or `-D` (force, via `C-u` prefix)
- Remote: `git push --delete` with `magit-branch-delete-never-verify` option
- Current branch delete: interactive choices — `[d]etach HEAD & delete`, `[c]heckout [upstream] & delete`, `[a]bort`

### D4.6: Stash Management

**Finding:** Comprehensive stash transient with snapshot, selective file stash, and version-aware apply.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-stash.el`

Commands: `z` (both), `i` (index only), `w` (worktree only), `k` (keep-index), `s`/`S` (snapshot), `p` (push with file selection).

Apply: git-version-aware — git ≥2.38.0 tries `--index` first, falls back to `git apply --3way` then `--reject` on conflict. No stash-on-switch integration.

### D4.7: Detached HEAD

**Finding:** Detected via `symbolic-ref` returning nil; rendered as commit hash in status buffer and `"(detached)"` in refs buffer.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-git.el`, `lisp/magit-status.el`, `lisp/magit-refs.el`

No proactive "create branch to save" rescue. The branch transient is the natural exit path.

### D4.8: Ahead/Behind

**Finding:** `git for-each-ref %(upstream:track)` parsed for `>N` / `<N` display in refs buffer.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-refs.el`, `lisp/magit-git.el`

`magit-rev-diff-count`: `git rev-list --count --left-right A...B`

### D4.9: Worktree Support

**Finding:** Integrated into branch transient; dedicated worktree transient with create, move, delete, status.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-worktree.el`

Commands: checkout (`git worktree add <dir> <commit>`), branch (`git worktree add -b <branch> <dir>`), move, delete (checks uncommitted, offers trash vs permanent), status (opens Magit for that worktree).

Directory naming: derives from branch name, replacing `/` with `-`. Only displayed when count > 1.

### D5: Auth — Process Filter

**Finding:** Magit intercepts git subprocess output via process filter, not GIT_ASKPASS.
**Confidence:** CONFIRMED
**Evidence:** `lisp/magit-process.el:1314-1338`

`magit-process-filter` dispatches: yes-or-no prompt → username prompt (`read-string`) → password prompt (`read-passwd`).

Credential lookup: `magit-process-password-auth-source` checks `~/.authinfo.gpg` (Emacs `auth-source`) before interactive prompt. `C-g` kills both minibuffer entry and git subprocess.

Forge API tokens: stored in `auth-source` (`~/.authinfo.gpg`).

---

## Zed Findings

### D4.1: Branch Picker

**Finding:** Fuzzy picker modal with inline branch creation; three display modes.
**Confidence:** CONFIRMED
**Evidence:** `crates/git_ui/src/branch_picker.rs`

`BranchList` wraps `Picker<BranchListDelegate>`. Modes: Modal, Popover, Embedded. Listing: `git for-each-ref` with timestamp sort (most recent first, local before remote). `fuzzy::match_strings()` for search.

Inline creation: typing non-existent name shows "Create Branch: {name}" entry. Secondary confirm branches from `main`/`master`. Spaces → hyphens.

### D4.3: Switch with Dirty Tree

**Finding:** Fully delegates to git; no pre-flight check; error surfaces as toast.
**Confidence:** CONFIRMED
**Evidence:** `crates/git/src/repository.rs`, `crates/git_ui/src/branch_picker.rs`

```rust
repo.change_branch(branch.name().to_string()) // → git checkout
```

No uncommitted-changes check at UI layer. Git's native error propagates to `detach_and_prompt_err` → toast notification.

### D4.4: Delete Branch

**Finding:** Safe delete only (`-d`); no force-delete from UI; HEAD branch protected.
**Confidence:** CONFIRMED
**Evidence:** `crates/git/src/repository.rs`

```rust
git_binary?.run(&["branch", if is_remote { "-dr" } else { "-d" }, &name]).await?
```

### D4.6: Stash

**Finding:** Dedicated stash picker with apply/pop/drop; independent of checkout flow.
**Confidence:** CONFIRMED
**Evidence:** `crates/git_ui/src/stash_picker.rs`

Per-entry: `"#{index}: {message}"`, branch name, relative timestamp. Footer buttons: Drop / View / Pop / Apply. No stash-before-checkout prompt.

### D4.9: Worktree Picker

**Finding:** Git worktrees exposed via dedicated picker; opens in new window.
**Confidence:** CONFIRMED
**Evidence:** `crates/git_ui/src/worktree_picker.rs`

Listing: `git worktree list --porcelain`. Creation reads `ProjectSettings::git.worktree_directory` for base path. `TrustedWorktrees` auto-trusts new worktrees. Delete + open-in-new-window hover buttons.

### D5: Auth — Unix Socket Askpass

**Finding:** Unix socket IPC between git subprocess and Zed main process for credential prompts.
**Confidence:** CONFIRMED
**Evidence:** `crates/askpass/src/askpass.rs`, `crates/git_ui/src/askpass_modal.rs`

`PasswordProxy::new()`: creates temp dir → writes `askpass.sh` script → spawns `UnixListener` → reads null-terminated prompts → invokes callback → returns encrypted response.

Callers set `GIT_ASKPASS` and `SSH_ASKPASS` to the script path.

Modal UI: password masking disabled for "yes/no" or "Username" prompts; enabled otherwise. Input zeroed after encryption (`zeroize` crate).

Credential persistence: `CredentialsProvider` trait → OS keychain (macOS/Windows), libsecret (Linux). Windows: in-session cache only.

Nine hosting providers: GitHub, GitLab, Bitbucket, Azure, Gitea, Forgejo, Gitee, Chromium, SourceHut.
