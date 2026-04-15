# Evidence: D3.1–D3.3 Conflict Presentation and Resolution Actions

**Dimension:** Merge/rebase conflict presentation, detection, and resolution actions
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, JetBrains/intellij-community, zed-industries/zed, GitKraken docs, Fork docs, Sourcetree docs, sindrets/diffview.nvim, tpope/vim-fugitive, Vinzent03/obsidian-git, tinacms/tinacms

---

## Key files / pages referenced

- `microsoft/vscode: extensions/merge-conflict/src/mergeConflictParser.ts` — inline marker scanner
- `microsoft/vscode: src/vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel.ts` — 3-way merge model
- `desktop/desktop: app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx` — conflict dialog
- `desktop/desktop: app/src/lib/git/diff-check.ts` — marker counting via `git diff --check`
- `jesseduffield/lazygit: pkg/gui/mergeconflicts/rendering.go` — inline colored markers
- `jesseduffield/lazygit: pkg/gui/mergeconflicts/merge_conflict.go` — conflict model (Selection enum)
- `magit/magit: lisp/magit-ediff.el` — 3-way ediff integration
- `magit/magit: lisp/magit-diff.el` — smerge-mode auto-activation
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/merge/GitMergeProvider.java` — 3-pane merge
- `zed-industries/zed: crates/git_ui/src/conflict_view.rs` — inline buttons with agent resolve
- `sindrets/diffview.nvim` — 3/4-way terminal diff layouts

---

## Findings

### Finding: Three distinct conflict presentation architectures exist across the editor spectrum
**Confidence:** CONFIRMED
**Evidence:** Source-level analysis of 10+ editors

**Architecture 1 — Dedicated 3-way merge editor (separate pane/window):**

JetBrains IntelliJ:
- 3-pane layout: left (yours), right (theirs), center (editable result initialized from base)
- `GitMergeProvider.java` loads stages 1/2/3 from git index
- Reverse-root detection: during rebase/unstash, auto-swaps panes so user's changes stay on left
- Per-hunk accept buttons, "Apply Non-Conflicting Changes" auto-merge, "Resolve Simple Conflicts" for non-overlapping line-level changes
- AI extension point: `MergeResolveActionSupport` allows plugins to contribute "Resolve with AI" actions

VSCode 3-way merge editor (opt-in via `git.mergeEditor` setting):
- `MergeEditorInput` takes `base`, `input1`, `input2`, `result` URIs
- `ModifiedBaseRange` tracks divergent regions with state: `base | input1 | input2 | both | unrecognized`
- Layout modes: `mixed` (stacked) and `columns` (side-by-side)
- Actions: Accept/Ignore/Combine/Remove per range, AcceptAll for bulk, ResetToBase, AcceptMerge (Ctrl+Enter)
- `unhandledConflictsCount` tracks per-file resolution progress

GitKraken:
- 3-panel layout (left=current, right=incoming, bottom=editable output)
- Checkbox-based selection per conflict section; both can be checked for "accept both"
- Line-level selection and direct editing in output panel
- AI auto-resolve feature with explanations

diffview.nvim:
- Terminal-based 3/4-way layouts (`diff3_horizontal`, `diff3_vertical`, `diff3_mixed`, `diff4_mixed`)
- Keybindings: `<leader>co` (ours), `<leader>ct` (theirs), `<leader>cb` (base), `<leader>ca` (all)
- Uppercase variants apply to entire file

**Architecture 2 — Inline markers with action buttons/CodeLens:**

VSCode inline extension (`extensions/merge-conflict/`):
- Text scanning for `<<<<<<<`/`=======`/`>>>>>>>` markers via `mergeConflictParser.ts`
- Background color decorations: `merge.currentContentBackground`, `merge.incomingContentBackground`
- CodeLens above each `<<<<<<<`: Accept Current | Accept Incoming | Accept Both | Compare Changes
- Per-hunk granularity, plus bulk per-file operations (`accept.all-current`, etc.)
- `autoNavigateNextConflict.enabled` auto-advances cursor

Zed:
- `ConflictRegion` struct with `ours`, `theirs`, optional `base` ranges (diff3 support)
- Inline buttons above each conflict: "Use [ours_branch]" / "Use [theirs_branch]" / "Use Both"
- "Resolve with Agent" button (conditional on AI settings)
- Color-coded rows: `version_control_conflict_marker_ours`, `version_control_conflict_marker_theirs`
- Resolution edits the buffer directly, auto-saves in project diff view

lazygit:
- Full file rendered with conflict markers colored red
- Arrow keys navigate between hunks (TOP/MIDDLE/BOTTOM for diff3, TOP/BOTTOM for standard)
- `<space>` accepts current hunk, `b` accepts both
- Content undo stack: `State.contents []string` allows undoing individual hunk resolutions
- Merge options menu: ours/theirs/union at file level, plus `git mergetool` launch

**Architecture 3 — File-list dialog (no in-app editing):**

GitHub Desktop:
- `ConflictsDialog` lists conflicted files with icon+count
- `ConflictsWithMarkers` type: `git diff --check` counts markers, shows "N conflicts"
- Primary action: "Open in [external editor]" button
- Secondary: dropdown with ours/theirs manual resolution via `git checkout --ours/--theirs`
- `ManualConflict` type (binary/structural): "Resolve" dropdown only
- Submit button disabled while any files remain unresolved

Sourcetree:
- Right-click menu: "Resolve Using Mine" / "Resolve Using Theirs" (whole file)
- "Launch External Merge Tool" opens configured tool (P4Merge default)

**Architecture 4 — Emacs buffer-based (smerge + ediff):**

Magit:
- Auto-activates `smerge-mode` when visiting conflicted file (via `magit-diff-visit-file--setup`)
- `magit-hunk-section-smerge-map` provides hunk-level actions from status buffer diff
- Keys: `u` (keep upper/ours), `l` (keep lower/theirs), `b` (keep base), `a` (keep all), `RET` (keep current)
- `e` launches `ediff` in 3-way merge mode with ancestor buffers
- vim-fugitive: `:Gvdiffsplit!` opens 3-way vimdiff, `:diffget //2` and `:diffget //3` for resolution

**Implications:**
- Developer IDEs converge on dedicated 3-way editors as the primary tool
- Inline markers with action buttons are the rising pattern (VSCode, Zed, lazygit) — lower friction than opening a separate tool
- Non-developer wrappers (GitHub Desktop, Sourcetree) delegate to external editors — no in-app resolution
- Agent/AI resolution is emerging: Zed (inline button), JetBrains (extension point), GitKraken (auto-resolve)

---

### Finding: Conflict detection universally relies on git status porcelain codes
**Confidence:** CONFIRMED
**Evidence:** All 6 source-level editors parse the same git status codes

All editors detect conflicts by parsing `git status --porcelain` two-letter codes:

| Code | Meaning | Editors that classify it |
|------|---------|------------------------|
| `UU` | Both modified | All |
| `AA` | Both added | All |
| `DD` | Both deleted | VSCode, GitHub Desktop, lazygit |
| `AU` | Added by us | VSCode, GitHub Desktop |
| `UA` | Added by them | VSCode, GitHub Desktop |
| `DU` | Deleted by us | VSCode, GitHub Desktop, lazygit |
| `UD` | Deleted by them | VSCode, GitHub Desktop, lazygit |

VSCode groups all conflict codes into a `mergeGroup` resource group ("Merge Changes"). GitHub Desktop further distinguishes `ConflictsWithMarkers` (UU, AA — have inline markers) from `ManualConflict` (DD, AU, UA, DU, UD — no markers). lazygit separates `HasMergeConflicts` (any code) from `HasInlineMergeConflicts` (UU, AA only).

**Progress indicators (N of M resolved):**
- VSCode merge editor: `unhandledConflictsCount` per file, no cross-file aggregate
- VSCode SCM: `repositoryHasUnresolvedConflicts` boolean only (no count)
- GitHub Desktop: `conflictedFiles.length` used to disable submit button; no "3 of 5 resolved" counter
- lazygit: auto-switches to "conflicted files" filter view; auto-prompts to continue when count drops to 0
- JetBrains: dedicated Conflicts tool window with tree of conflicted files; no aggregate counter
- Magit: conflicted files appear in Unstaged section; no counter, but merge/rebase sequence sections above give context

**Implications:** No editor studied provides a true "N of M files resolved" progress bar at the SCM level. The closest is lazygit's auto-detection of conflict count dropping to zero. This is a gap across the industry.

---

### Finding: Resolution granularity spans four levels, from whole-file to per-line
**Confidence:** CONFIRMED

| Granularity | Who offers it | Mechanism |
|-------------|---------------|-----------|
| Whole file (ours/theirs) | All editors | `git checkout --ours/--theirs` |
| Per conflict block (hunk) | VSCode inline, lazygit, Magit smerge | Replace conflict region with chosen content |
| Per modified-base-range | VSCode merge editor, JetBrains, GitKraken | Per-range accept/combine/ignore buttons |
| Per line | JetBrains (direct editing in result pane), GitKraken (line selection), diffview.nvim (diffget) | Manual editing of result |

**Decision triggers:**
- Whole-file is appropriate for binary conflicts or when one side is clearly correct
- Per-hunk is the sweet spot for most text conflicts
- Per-line is needed for complex overlapping changes where neither side is fully correct

---

## Negative searches

- **Semantic/AST-aware merge (D3.4):** Searched IntelliJ git4idea plugin for "semantic merge", "ast merge", "language-aware merge" — NOT FOUND. Despite having full AST infrastructure, JetBrains does not apply it to merge resolution. No other editor in the study uses AST-aware merge. Semantic merge exists as a standalone commercial tool (SemanticMerge/PlasticSCM) but is not integrated into any mainstream editor.

---

## Gaps / follow-ups

- Cursor and Windsurf: both are VSCode forks and likely inherit the inline merge conflict extension + 3-way merge editor. Not independently verified.
- SmartGit: has a built-in conflict resolver but was not included in source-level analysis.
