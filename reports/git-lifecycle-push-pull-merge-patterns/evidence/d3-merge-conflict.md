# Evidence: D3 Merge/Rebase Conflict UX

**Dimension:** D3 — Conflict presentation, detection, resolution actions, rebase visualization, marker guards
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed, GitKraken, diffview.nvim, Sourcetree, Fork (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/merge-conflict/src/mergeConflictParser.ts` — inline marker detection
- `microsoft/vscode` `src/vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel.ts` — `ModifiedBaseRange`, `unhandledConflictsCount`
- `microsoft/vscode` `extensions/git/src/repository.ts` (lines 3113-3131) — rebase sentinel detection (boolean only)
- `desktop/desktop` `app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx` — unified `MultiCommitOperation`
- `desktop/desktop` `app/src/lib/git/diff-check.ts` — conflict marker count per file
- `desktop/desktop` `app/src/lib/git/rebase.ts` — `GitRebaseParser` for step progress
- `jesseduffield/lazygit` `pkg/gui/mergeconflicts/rendering.go` — conflict coloring
- `jesseduffield/lazygit` `pkg/gui/controllers/helpers/merge_and_rebase_helper.go` — auto-detect resolution complete
- `jesseduffield/lazygit` `pkg/gui/presentation/commits.go` — Pick=cyan, Drop=red, Edit=green, Fixup=magenta
- `magit/magit` `lisp/magit-sequence.el` — rebase sequence editor
- `magit/magit` `lisp/git-rebase.el` — `git-rebase-mode` with per-commit action editing
- `magit/magit` `lisp/magit-ediff.el` — 3-way ediff
- `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/merge/GitMergeProvider.java` — `isReverseRoot()`
- `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/rebase/interactive/dialog/GitInteractiveRebaseDialog.kt`
- `zed-industries/zed` `crates/git_ui/src/conflict_view.rs` — `ConflictRegion` struct, "Resolve with Agent" button

---

## Findings

### Finding: Four distinct conflict presentation architectures
**Confidence:** CONFIRMED
**Evidence:** Source-level analysis of 6 editors + docs for 6 more

(1) Dedicated 3-way merge editor (JetBrains, VS Code merge editor, GitKraken, diffview.nvim), (2) Inline markers with action buttons (VS Code inline, Zed, lazygit), (3) File-list dialog (GitHub Desktop, Sourcetree, Fork), (4) Emacs buffer-based (Magit smerge + ediff).

### Finding: JetBrains detects rebase reverse-root and swaps panes
**Confidence:** CONFIRMED
**Evidence:** `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/merge/GitMergeUtil.isReverseRoot(repository)`

During rebase, ours/theirs labels are semantically swapped in git's convention. IntelliJ detects this and transparently swaps panes.

### Finding: No editor provides aggregate conflict resolution progress
**Confidence:** CONFIRMED (gap)
**Evidence:** Searched all 12 editors. VS Code merge editor tracks `unhandledConflictsCount` per open file but not aggregated. lazygit auto-detects zero conflicts remaining and prompts to continue.

### Finding: VS Code reads no step progress files during rebase
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode` `extensions/git/src/repository.ts:3113-3131`

Checks for `.git/REBASE_HEAD`, `.git/rebase-apply/`, `.git/rebase-merge/` sentinel directories — boolean detection only. Does not read `msgnum`/`end` files for step counter.

### Finding: No editor scans staged files for leftover conflict markers
**Confidence:** CONFIRMED (gap)
**Evidence:** Searched all 12 editors. Git prevents committing unmerged-status files, but after manual edit + stage, leftover markers pass through.

### Finding: Semantic/language-aware merge is absent from all mainstream editors
**Confidence:** CONFIRMED (negative)
**Evidence:** Searched JetBrains, VS Code, Zed, lazygit, Magit. [SemanticMerge](https://www.semanticmerge.com/) exists as standalone but not integrated.

### Finding: `git rerere` works silently for all editors but none surface it
**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/git-rerere](https://git-scm.com/docs/git-rerere). No editor provides enable/disable UI or shows rerere replay status.

---

## Negative searches

- Searched for AST-aware merge in JetBrains: not found in core `git4idea` plugin despite full AST infrastructure
- Searched for conflict resolution progress bar: not found in any editor
