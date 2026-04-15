# Evidence: Undo/Revert, Auto-Commit, File Status, First Commit (D1.5–D1.8)

**Dimension:** D1.5 Undo/revert after commit, D1.6 Auto-staging/auto-commit, D1.7 File-status visualization, D1.8 Empty-repo first-commit
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, zed-industries/zed, Vinzent03/obsidian-git, GitKraken docs, JetBrains docs

---

## Key files referenced

- `microsoft/vscode` `extensions/git/src/commands.ts:2780-2807` — `git.undoCommit` (mixed reset)
- `microsoft/vscode` `extensions/git/src/commands.ts:2418-2451` — smart commit logic
- `microsoft/vscode` `extensions/git/src/repository.ts:1006-1009` — four SCM resource groups
- `desktop/desktop` `app/src/lib/stores/git-store.ts` — `git reset --mixed` for undo
- `desktop/desktop` `app/src/ui/changes/undo-commit.tsx` — undo banner UI
- `jesseduffield/lazygit` `pkg/gui/controllers/undo_controller.go` — reflog-based undo
- `magit/magit` `lisp/magit-reset.el` — reset transient (soft/mixed/hard/keep/index/worktree)
- `zed-industries/zed` `crates/git_ui/src/git_panel.rs` — `uncommit()` with pushed-commit check
- `Vinzent03/obsidian-git` `src/automaticsManager.ts` — timer-based auto-commit

---

## Findings

### Finding: Three undo-commit implementation strategies exist
**Confidence:** CONFIRMED
**Evidence:** Source code of VS Code, GitHub Desktop, Lazygit, Magit, Zed

**Strategy 1: `git reset --mixed HEAD~1`** (VS Code, GitHub Desktop)
- VS Code's `git.undoCommit`: calls `repository.reset('HEAD~')` (mixed reset). Special-cases merge commits (modal warning), initial commits (deletes HEAD ref + unstages all). Restores commit message to SCM input box.
- GitHub Desktop: `git reset --mixed` to parent SHA. Special-cases initial commit via `undoFirstCommit()` (deletes HEAD ref). Safeguards: warning dialog if uncommitted changes exist or if undoing a merge commit. No time-based expiration on the undo banner.

**Strategy 2: `git reset --soft HEAD^`** (Zed)
- Zed's `uncommit()`: performs `repo.reset("HEAD^", ResetMode::Soft)`. Checks `check_for_pushed_commits()` first — shows confirmation prompt if commit has been pushed. Restores previous commit message to editor.

**Strategy 3: Reflog-based undo** (Lazygit)
- `parseReflogForActions()` walks reflog entries, matching user actions while skipping `[lazygit undo]`/`[lazygit redo]` entries via a counter.
- Three action kinds with different reversal strategies:
  - `COMMIT`: undone with `git reset --soft <previous-hash>`
  - `CHECKOUT`: undone by checking out previous branch
  - `REBASE`: undone with `git reset --hard <previous-hash>` + auto-stash/pop
- Each undo/redo writes a tagged reflog entry (`GIT_REFLOG_ACTION` env var) so subsequent undo/redo correctly skips them.
- Keybindings: `z` for undo, `Z` for redo (global).

**Strategy 4: Full reset transient** (Magit)
- `magit-reset-soft` with `HEAD~1` undoes the last commit, preserving staged changes. Available via the reset transient (`X` key) alongside `--mixed`, `--hard`, `--keep`, `--index`, `--worktree` variants.
- No single "undo commit" command — the user chooses the reset mode explicitly.

**Implications:** VS Code and GitHub Desktop optimize for the common case (undo = keep changes in working tree). Lazygit and Magit expose the full git vocabulary. Lazygit's reflog-based approach is the most sophisticated — it can undo branch switches and rebases, not just commits.

### Finding: Auto-staging / auto-commit patterns span three categories
**Confidence:** CONFIRMED
**Evidence:** VS Code source, Obsidian-git source, GitKraken docs, JetBrains docs

**Category 1: Smart commit (stage-all-if-nothing-staged)** — VS Code
- `git.enableSmartCommit` (default `false`): when committing with nothing staged, auto-stages all changes.
- `git.smartCommitChanges` (`'all' | 'tracked'`): controls whether untracked files are included.
- `git.suggestSmartCommit` (default `true`): one-time prompt "Would you like to stage all and commit directly?" with Always/Never to set the setting permanently.

**Category 2: Timer-based auto-commit** — Obsidian-git
- `autoSaveInterval` (minutes): fixed-interval commit-and-sync. `setTimeout` loop with millisecond conversion.
- `autoBackupAfterFileChange` (boolean): debounced trigger after file edits.
- `differentIntervalCommitAndPush`: separates commit and push timers.
- `commitAndSync()` = pull + commit + push as atomic operation.
- Default message: `"vault backup: {{date}}"` with template variables.
- Timers persist across restarts via `localStorage` timestamps.
- `pauseAutomatics` gate via localStorage.

**Category 3: No auto-staging** — Lazygit, Magit, Fugitive, GitHub Desktop, Zed
- Lazygit: `Gui.SkipNoStagedFilesWarning: false` — prompts "No files staged. Stage all?" on commit with nothing staged. Not truly auto-staging.
- Magit: `magit-commit-ask-to-stage` (default `'verbose`) — asks to stage before committing with nothing staged. Options: ask, verbose (show diff), stage (auto-stage without confirmation), nil.
- GitHub Desktop: Checkbox model — the "staged" state is per-file checkboxes, rebuilt at commit time. Not auto-staging in the traditional sense.

**Implications:** Auto-commit is a non-developer pattern. Developer editors universally require explicit staging intent. Obsidian-git is the only tool that fully abstracts away the commit decision.

### Finding: File status visualization converges on icon + color + grouping
**Confidence:** CONFIRMED
**Evidence:** VS Code source, GitHub Desktop source, Zed source

**VS Code** — Four SCM resource groups:
| Group | Label | Visibility |
|-------|-------|-----------|
| `merge` | Merge Changes | `hideWhenEmpty = true` |
| `index` | Staged Changes | Hidden unless `git.alwaysShowStagedChangesResourceGroup` |
| `workingTree` | Changes | Always shown |
| `untracked` | Untracked Changes | Only when `git.untrackedChanges: 'separate'` |

Status letters: `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `C` (copied), `U` (unmerged), `!` (ignored), `?` (untracked).

**GitHub Desktop** — Octicon-based:
- New/Untracked: `diffAdded` (green plus)
- Modified: `diffModified` (yellow dot)
- Deleted: `diffRemoved` (red minus)
- Renamed: `diffRenamed`
- Conflicted: `alert` (if markers > 0) or `check` (if resolved)

Accessibility: `AriaLiveContainer` announces `"{path} {fileStatus} {includedText}"` for screen readers.

**Zed** — Three sections:
- `conflicted_count`, `tracked_count`, `new_count` under `GitHeaderEntry` section headers
- `StageStatus` enum: `Staged`, `Unstaged`, `PartiallyStaged`
- Flat or tree view mode (`GitPanelViewMode::Flat | ::Tree`)
- Editor gutter: colored indicators (`HunkAddedColor`, `HunkRemovedColor`)

### Finding: Empty-repo and first-commit handling is an edge case, not a designed flow
**Confidence:** CONFIRMED
**Evidence:** VS Code source, GitHub Desktop source

Most editors treat the empty-repo state as a degenerate case rather than a designed onboarding flow:

- **VS Code**: `commands.ts:2799-2804` — undo on initial commit calls `repository.deleteRef('HEAD')` instead of `reset HEAD~`. The action button returns `undefined` when `!this.state.HEAD`, so no commit button appears on a repo with no HEAD.
- **GitHub Desktop**: `NoChanges` component suggests "Publish your repository to GitHub" for repos without a remote. No special "first commit" onboarding beyond the standard empty-state suggestions.
- **Zed**: No special first-commit flow found in source.
- **Obsidian-git**: `commitAndSync()` handles the first-commit case implicitly — the same flow works regardless of commit count.

**Implications:** First-commit onboarding is an opportunity gap across the ecosystem. Non-developer tools that auto-commit (Obsidian-git) handle it transparently. Developer tools expose the raw git state without guidance.

---

## Gaps / follow-ups

- `.gitignore` management UX (auto-generation, pattern suggestions) not deeply covered
- Editor gutter decorations (inline diff indicators) covered lightly — could be a deeper investigation
