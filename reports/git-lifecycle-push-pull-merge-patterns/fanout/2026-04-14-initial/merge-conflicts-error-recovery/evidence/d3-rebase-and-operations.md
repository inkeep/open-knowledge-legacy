# Evidence: D3.5–D3.8 Rebase Visualization, Merge Tools, Marker Guards, Cherry-Pick

**Dimension:** Mid-rebase state, merge tool config, unresolved marker guards, cherry-pick/revert conflicts
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, JetBrains/intellij-community, zed-industries/zed, git-scm.com

---

## Key files / pages referenced

- `microsoft/vscode: extensions/git/src/repository.ts:3113-3131` — rebase detection
- `desktop/desktop: app/src/lib/git/rebase.ts` — rebase progress parsing
- `jesseduffield/lazygit: pkg/gui/controllers/helpers/merge_and_rebase_helper.go` — continue/abort/skip
- `jesseduffield/lazygit: pkg/gui/presentation/commits.go` — TODO color coding
- `magit/magit: lisp/magit-sequence.el` — sequence editor with commit-by-commit progress
- `magit/magit: lisp/git-rebase.el` — interactive rebase mode
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/rebase/interactive/dialog/GitInteractiveRebaseDialog.kt`
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/ui/toolbar/GitMergeRebaseWidget.kt`
- `git-scm.com/docs/git-rerere` — reuse recorded resolution

---

## Findings

### Finding: Mid-rebase visualization ranges from boolean to full sequence editor
**Confidence:** CONFIRMED

**Tier 1 — Full sequence editor with commit-by-commit progress:**

Magit (`lisp/magit-sequence.el`, `lisp/git-rebase.el`):
- `git-rebase-mode` opens the rebase todo file with per-commit action editing
- Keybindings: `c`/`p` (pick), `r` (reword), `e` (edit), `s` (squash), `f` (fixup), `d` (drop)
- `M-p`/`M-n` reorder commits; `C-c C-c` finishes, `C-c C-k` aborts
- `git-rebase-auto-advance` (default t) auto-moves to next line after each action change
- Status buffer shows: completed (done face), current stopped (stop face), remaining todo (pick face), onto (onto face), HEAD position, dropped commits
- Mid-rebase commands: `magit-rebase-continue`, `magit-rebase-skip`, `magit-rebase-abort`, `magit-rebase-edit` (re-open todo mid-rebase)
- Published-commit protection: `magit-rebase-interactive-assert` checks publishing branches, warns before rewriting published history

JetBrains (`GitInteractiveRebaseDialog.kt`):
- Two-pane dialog: left table (drag-to-reorder, per-commit action dropdowns), right panel (commit details/diff)
- `GitRebaseTodoModel.kt` state machine: Pick, Edit, Reword, Drop, Unite (squash/fixup)
- "Reset" link to undo all planned changes
- `GitRebaseStatus` tracks: NOT_STARTED, SUSPENDED (mid-rebase), SUCCESS, ERROR
- Main toolbar widget (`GitMergeRebaseWidget.kt`): colored widget with Resolve/Continue/Abort buttons

lazygit:
- Commits panel interleaves TODO items and regular commits during rebase
- Color-coded actions: Pick=cyan, Drop=red, Edit=green, Fixup=magenta, Conflicted=red
- Continue/abort/skip via `m` menu (available from any panel)
- Auto-resolution of empty commits (auto-skips without user intervention)
- Automatic conflict prompt when conflict count drops to 0 during rebase

**Tier 2 — Basic rebase state with N/M progress:**

GitHub Desktop:
- Parses `.git/rebase-merge/msgnum` and `end` files for step counts
- `GitRebaseParser` parses stderr `Rebasing (N/M)` for live progress
- Shows percentage progress bar via `IMultiCommitOperationProgress`
- Interactive rebase via injected todo file (`sequence.editor=cat "<path>" >`)
- Multi-step UI: ChooseBranch → WarnForcePush → ShowProgress → ShowConflicts → ConfirmAbort

**Tier 3 — Boolean "in progress" only:**

VSCode:
- Checks for `.git/REBASE_HEAD`, `.git/rebase-apply/`, `.git/rebase-merge/` directories
- Status bar shows `{branchName} (Rebasing)` with conflict icon
- Action button changes to "Continue" (routes `git.commit` to `rebaseContinue()`)
- NO "N of M commits" counter — does not read `msgnum`/`end` files
- `git.rebaseAbort` command available but no skip command

Zed: No mid-rebase visualization found in source.

**Implications:**
- Magit and JetBrains provide the gold standard for interactive rebase UX
- lazygit achieves comparable power in a TUI context
- VSCode's boolean-only detection is a notable gap for a tool of its market share
- GitHub Desktop's progress bar parsing is a useful middle ground

---

### Finding: External merge tool configuration is rare in modern editors
**Confidence:** CONFIRMED

| Editor | External merge tool support | Notes |
|--------|---------------------------|-------|
| VSCode | None | No `git.mergetool` setting. VSCode IS the merge tool |
| JetBrains | Not configurable | IDE is the merge tool. Exposes git `--strategy` args |
| GitHub Desktop | None | Delegates to external editor, not mergetool |
| Zed | None | Built-in inline resolution only |
| lazygit | Yes | `git mergetool` launch from merge options menu |
| Magit | Via ediff | `magit-ediff-dwim-resolve-function` customizable |
| GitKraken | Yes | Beyond Compare, FileMerge, Kaleidoscope, KDiff, Araxis, P4Merge |
| Fork | Yes | External merge tool from context menu |
| Sourcetree | Yes | P4Merge default, configurable |

**Pattern:** Modern IDEs (VSCode, JetBrains, Zed) are self-contained merge tools. External merge tool configuration is a legacy pattern preserved in visual git clients and CLI-adjacent tools.

---

### Finding: Unresolved conflict marker guards vary widely in strictness
**Confidence:** CONFIRMED

| Editor | Guard mechanism | Strictness |
|--------|----------------|------------|
| VSCode merge editor | Close dialog: "Save With Conflicts"; AcceptMerge warning | Warning (override allowed) |
| VSCode inline | None | No guard. Relies on git's unmerged-file check |
| VSCode git extension | No pre-commit marker scan | Relies on git |
| GitHub Desktop | Dialog-level: submit disabled while files unresolved; CommitConflictsWarning if forced | Warning (override allowed via "Yes, Commit Files") |
| lazygit | Auto-prompts when conflict count drops to 0; auto-switches to conflict filter | Behavioral nudge, not block |
| JetBrains | Merge editor tracks unresolved hunks | Per-hunk tracking in merge tool |
| Magit | Relies on git | No additional guard |
| Git CLI | `git commit` refuses to commit unmerged paths (built-in) | Hard block |

Git itself provides the baseline guard: `git commit` refuses to create a commit when files have unmerged status codes (UU, AA, etc.). After resolution and staging, the conflict status is cleared. No editor studied performs a separate text scan for leftover `<<<<<<<`/`>>>>>>>` markers in staged files beyond git's own check.

**Implications:** The git-level guard only prevents committing files that git considers unmerged. If a user resolves a conflict by manually editing a file and staging it (but accidentally leaves one set of markers), git will happily commit it. No editor adds a secondary marker-scan guard. This is a universal gap — a pre-commit hook checking for conflict markers would catch this class of error.

---

### Finding: Cherry-pick and revert conflicts use the same resolution UX as merge
**Confidence:** CONFIRMED

All editors studied route cherry-pick and revert conflicts through the same conflict resolution UI as merge/rebase conflicts. Differences are minor:

**GitHub Desktop:** Unified `MultiCommitOperation` component handles merge, rebase, cherry-pick, squash, and reorder with the same step state machine. `CherryPickConflictState` is a discriminated union member alongside `MergeConflictState` and `RebaseConflictState`. Multi-commit cherry-picks track progress via `.git/sequencer/` files. Empty cherry-picks handled with `--allow-empty`.

**JetBrains:** `GitCherryPickProcess` extends `GitApplyChangesProcess` (shared base with revert). Same 3-way merge tool. Differences: deletes `CHERRY_PICK_HEAD` before commit (to enable partial commits), handles empty commits via configurable strategy, tracks `currentCommitCounter / totalCommitsToCherryPick`.

**lazygit:** `WorkingTreeState` struct tracks CherryPicking and Reverting as independent booleans alongside Rebasing and Merging. `CanSkip()` returns true for rebase, cherry-pick, and revert (not merge). Same conflict resolution panel.

**VSCode:** Same inline markers + 3-way merge editor. No operation-specific conflict UI.

**Magit:** Same smerge/ediff integration. `magit-insert-sequencer-sequence` shows multi-commit cherry-pick/revert progress (reads from `.git/sequencer/`).

**Git CLI:** `git cherry-pick --continue`, `git cherry-pick --abort`, `git cherry-pick --skip` follow the same pattern as rebase. `git revert` follows the same pattern.

---

### Finding: Git rerere is an underutilized cross-editor capability
**Confidence:** CONFIRMED
**Evidence:** git-scm.com/docs/git-rerere

`git rerere` (reuse recorded resolution) is built into git and operates silently:
1. First conflict: records preimage (conflicted state) and postimage (resolution) in `.git/rr-cache/`
2. Subsequent identical conflicts: auto-applies the prior resolution
3. Enable: `git config --global rerere.enabled true`
4. Messages: "Recorded preimage for FILE" / "Resolved 'FILE' using previous resolution"
5. `git merge` and `git commit` automatically invoke `git rerere`

No GUI editor studied explicitly surfaces rerere to users. It works transparently in the background. This is particularly valuable for long-lived topic branches that need repeated rebasing.

---

## Gaps / follow-ups

- No editor provides a "replay rerere resolution" UI or rerere cache management
- Interactive rebase in Zed: not implemented as of source analysis date
- VSCode's lack of rebase step progress is a documented community request
