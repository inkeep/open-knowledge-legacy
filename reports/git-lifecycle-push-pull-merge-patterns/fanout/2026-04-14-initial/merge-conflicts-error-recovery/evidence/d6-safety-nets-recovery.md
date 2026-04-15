# Evidence: D6.4–D6.8 Reflog, Safety Nets, Detached HEAD, Corrupt Repo, Auth Recovery

**Dimension:** Error recovery mechanisms, safety nets, and edge-state handling
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, JetBrains/intellij-community, zed-industries/zed, Vinzent03/obsidian-git, git-scm.com

---

## Key files / pages referenced

- `jesseduffield/lazygit: pkg/gui/controllers/undo_controller.go` — reflog-based undo/redo
- `magit/magit: lisp/magit-reflog.el` — reflog mode with color-coded operations
- `magit/magit: lisp/magit-wip.el` — WIP refs automatic backup system
- `microsoft/vscode: extensions/git/src/git.ts:329-331, 2820-2839` — lock detection + retry
- `microsoft/vscode: extensions/git/src/repository.ts:3143-3161` — auto-stash
- `desktop/desktop: app/src/lib/trampoline/trampoline-credential-helper.ts` — auth trampolines
- `desktop/desktop: app/src/ui/dispatcher/error-handlers.ts` — error handler chain
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/util/GitPreservingProcess.kt` — auto-stash
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/branch/GitCheckoutOperation.java` — smart checkout
- `git-scm.com/docs/git-reflog` — reflog documentation

---

## Findings

### Finding: Reflog UX ranges from invisible (most editors) to full undo system (lazygit)
**Confidence:** CONFIRMED

**Tier 1 — Reflog-powered undo/redo system (lazygit):**

`undo_controller.go` implements global `z` (undo) and `Z` (redo) keybindings that parse the reflog:
- `parseReflogForActions()` walks reflog entries, recognizing `[lazygit undo]`/`[lazygit redo]` tagged entries
- Classifies actions: `checkout: moving from X to Y` → CHECKOUT, `commit`/`reset`/`pull` → COMMIT, `rebase (start)`/`(finish)` → REBASE
- Undo by action type: COMMIT → `git reset --soft <prev>`, CHECKOUT → checkout previous ref, REBASE → hard reset with autostash
- Tags every undo/redo in reflog via `GIT_REFLOG_ACTION=[lazygit undo]` env var — creates audit trail
- Mid-rebase: CURRENT_REBASE type shows "Can't undo while rebasing"

Additionally, dedicated Reflog tab shows entries with `git log -g --format=+%H%x00%ct%x00%gs%x00%P`.

**Tier 2 — Dedicated reflog browser (Magit):**

`lisp/magit-reflog.el`:
- Three entry points: `magit-reflog-current` (current branch), `magit-reflog-other` (any ref), `magit-reflog-head` (HEAD)
- Color-coded by operation: commit=green, amend=magenta, merge=green, checkout=blue, reset=red, rebase=magenta, cherry-pick=green, remote=cyan
- From reflog buffer: navigate to any entry, view commit, reset to it, cherry-pick from it, create branch from it
- `magit-reflog-limit` default 256 entries, adjustable with `+`/`-`

**Tier 3 — Internal only / no user-facing UI (VSCode, JetBrains, Zed):**

VSCode: reflog used internally only — `reflog()` method searches for `'branch: Created from *.'` and `'checkout: moving from .* to {branchName}'` patterns to detect parent branch. No reflog browser, no undo-last-op button.

JetBrains: no explicit reflog UI found, but Local History provides an alternative recovery mechanism.

Zed: no reflog access found.

GitHub Desktop: no reflog access found.

**Implications:** lazygit's reflog-based undo is the most innovative recovery UX across all editors studied. Magit's reflog browser provides raw access for power users. Most editors leave reflog as a CLI-only escape hatch, which is a significant gap given that reflog is the ultimate "I made a mistake" safety net.

---

### Finding: Safety nets cluster into five categories with varying adoption
**Confidence:** CONFIRMED

**Category 1 — Auto-stash before destructive operations:**

| Editor | Auto-stash mechanism | Trigger |
|--------|---------------------|---------|
| VSCode | `git.autoStash` setting; native `--autostash` (git 2.27+) or manual stash/pop (older) | Pull/rebase |
| GitHub Desktop | Desktop-specific stash (`!!GitHub_Desktop<branch>` marker) + auto-pop | Branch switch with uncommitted changes |
| lazygit | `--autostash` on all interactive rebase; named stash on checkout; autostash on undo | Rebase, checkout, reflog undo |
| JetBrains | `GitPreservingProcess.kt` wraps operations with stash or shelve (configurable: STASH vs SHELVE) | Checkout, rebase, update |
| Magit | `--autostash` available on pull transient | Pull with rebase |
| Obsidian-Git | None | — |

JetBrains' `GitPreservingProcess` is the most sophisticated: wraps any destructive operation with save → run → load (with conflict resolver if needed). The SHELVE option (IDE-internal, not git stash) is more reliable across complex scenarios. If save fails, the operation is skipped entirely.

**Category 2 — Continuous backup systems:**

Magit WIP refs (`lisp/magit-wip.el`):
- `magit-wip-mode` auto-creates snapshot commits on file save, before/after apply operations
- Refs: `refs/wip/index/<branchref>` (staged) and `refs/wip/wtree/<branchref>` (worktree)
- Recovery: `magit-wip-log-current`, `magit-wip-log-index`, `magit-wip-log-worktree`
- Maintenance: `magit-wip-purge` cleans orphaned WIP refs
- Continuous, per-branch, recoverable via cherry-pick or reset

JetBrains Local History:
- Records every file change (IDE-internal and external), retains 5 working days
- System labels placed at critical points: before/after push update, merge, stash, cherry-pick
- Git-independent: survives `git reset --hard`, broken rebases, anything
- Restores individual files or entire project states to any labeled point

**Category 3 — Confirmation dialogs:**

| Editor | Confirmations before destructive ops |
|--------|-------------------------------------|
| VSCode | Force push: modal warning (gated by `git.allowForcePush`) |
| GitHub Desktop | Force push: dialog with "Do not show again" checkbox; checkout-to-detached: confirmation |
| lazygit | Force push, undo/redo, abort merge/rebase, cherry-pick paste |
| Magit | 28 confirmable actions via `magit-confirm`; `magit-no-confirm` list for selective skip |
| JetBrains | Smart checkout, force push, published commit amend |

Magit's `magit-confirm` system is the most comprehensive, gating 28 destructive actions with a customizable `magit-no-confirm` bypass list.

**Category 4 — Trash instead of delete:**

Magit: `magit-delete-by-moving-to-trash` (default `t`) routes file discards to system trash. Docstring warns: "You should absolutely not disable this and also remove 'discard' from `magit-no-confirm'."

Other editors: not found.

**Category 5 — Published commit protection:**

| Editor | Protection mechanism |
|--------|---------------------|
| Magit | `magit-rebase-interactive-assert` checks publishing branches before rewriting history |
| Magit | `magit-commit-amend-assert` checks before amend/reword of pushed commits |
| JetBrains | "Rebase over merge" warning in push rejection dialog |
| GitHub Desktop | Force push confirmation warns about collaborators |

---

### Finding: Detached HEAD handling follows three approaches
**Confidence:** CONFIRMED

**Approach 1 — Visual indicator + disabled operations:**

VSCode: `$(git-commit)` icon replaces `$(git-branch)` in status bar. Publish/Sync buttons hidden. Checkout command offers "Checkout detached..." option.

lazygit: `DetachedHead` boolean on Branch model. Merge disabled with "Cannot merge branch in detached head state". Moving commits to another branch disabled. Branch icon changes to `DETACHED_HEAD_ICON`. During rebase/bisect: reads original branch name from `.git/rebase-merge/head-name`.

Magit: Header shows `Head: <hash> <message>` with `magit-hash` face (no branch name). Branch delete offers: `[d]etach HEAD & delete`, `[c]heckout <target> & delete`, `[a]bort`.

**Approach 2 — Warning before entering detached state:**

GitHub Desktop: `ConfirmCheckoutCommitDialog` warns "Checking out a commit will create a detached HEAD" with "Do not show again" checkbox. Push/pull button shows disabled "Cannot publish detached HEAD".

JetBrains: Smart checkout warns about overwritten changes but does not specifically warn about detached HEAD entry.

**Approach 3 — No special handling:**

Zed: No detached HEAD-specific UI found in source analysis.
Obsidian-Git: No detached HEAD handling found.

---

### Finding: Lock file handling uses silent retry, not user recovery UI
**Confidence:** CONFIRMED

VSCode (`extensions/git/src/git.ts:329-331, 2820-2839`):
- Detects `RepositoryIsLocked` via regex: `/Another git process seems to be running/`
- Retries up to 10 times with quadratic backoff: `Math.pow(attempt, 2) * 50` ms (50ms, 200ms, 450ms, ..., ~5s)
- Does NOT offer to remove stale lock files
- File watcher explicitly filters out `index.lock` changes to avoid spurious status refreshes

Git CLI error message:
```
fatal: Unable to create '/path/.git/index.lock': File exists.
Another git process seems to be running in this repository...
remove the file manually to continue.
```

No other editor studied provides a "remove stale lock" button or automatic stale lock detection.

**Implications:** Silent retry with backoff is reasonable for transient locks (concurrent git processes). Stale locks from crashed processes require manual intervention in all editors.

---

### Finding: Credential/auth failure recovery is most sophisticated in GitHub Desktop
**Confidence:** CONFIRMED

GitHub Desktop's trampoline pattern (`trampoline-credential-helper.ts`):
- Implements git credential `get/store/erase` commands
- For GitHub.com/GHE: looks up stored accounts in `AccountsStore`
- For generic Git hosts: checks external credential helper or prompts UI
- Missing GitHub account triggers OAuth sign-in flow
- SSH key passphrase prompt with "Remember passphrase" option

Error-specific handlers:
- **SAML SSO re-auth:** detects enforcement messages in git stderr, shows re-auth dialog with org name
- **Missing workflow scope:** detects OAuth scope failures for `.github/workflows/` pushes
- **Insufficient permissions:** triggers "Create Fork" dialog
- **Secret scanning push protection:** parses GitHub Push Protection errors, shows secret locations
- **Rejection tracking:** `setHasRejectedCredentialsForEndpoint()` prevents infinite re-prompt loops

Other editors' auth recovery:
- VSCode: no specific credential re-prompt flow found; relies on git credential helper
- JetBrains: uses standard Git credential infrastructure; no special re-prompt
- lazygit: no auth recovery UI found
- Magit: relies on Emacs' auth-source and git credential helper
- Obsidian-Git: raw git error in Notice modal

---

### Finding: Non-developer wrappers use conflict avoidance over conflict resolution
**Confidence:** CONFIRMED

**TinaCMS — branch-per-edit architecture:**
- Protected branch model: admins designate protected branch (e.g., `main`)
- Editor saves on protected branch → prompted to create new branch
- Automatic draft PR created for each branch
- Merge via GitHub PR UI, not TinaCMS
- Content editors never see conflict markers
- Conflicts are a developer's problem (at merge time in GitHub)

**Obsidian-Git — raw marker exposure:**
- On conflict: writes `conflict-files-obsidian-git.md` listing conflicted files
- Raw `<<<<<<<`/`=======`/`>>>>>>>` markers left in markdown files
- No resolution UI; users must manually edit markers
- Auto-commits blocked while conflicts exist ("Did not commit, because you have conflicts")
- `MergeStrategy`: `none | ours | theirs` (passed to git)
- `SyncMethod`: `rebase | merge | reset` (the "reset" option force-matches remote)
- Open feature request (Issue #803) for conflict resolution modal — no maintainer response

**Implications:** The spectrum is clear: TinaCMS pushes conflicts to the platform layer (GitHub), Obsidian-Git exposes raw git conflicts to users. For non-developer UX, conflict avoidance (branch-per-edit, auto-merge) is far more effective than conflict resolution UI.

---

## Gaps / follow-ups

- `git gc` recovery: no editor surfaces "suggest running git gc" for corrupt repos
- Index corruption detection: no editor attempts to detect or recover from corrupt git index beyond lock file handling
- Token expiry UX: only GitHub Desktop handles token expiry proactively; other editors rely on git's credential infrastructure
