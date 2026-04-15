# Evidence: Staging Granularity (D1.1, D1.2)

**Dimension:** D1.1 Staging surface granularity, D1.2 Partial commit / stash workflows
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, zed-industries/zed, tpope/vim-fugitive, GitKraken docs, Fork docs, Sourcetree docs, JetBrains docs, Vinzent03/obsidian-git

---

## Key files referenced

- `microsoft/vscode` `extensions/git/src/commands.ts:1515-1932` — staging commands
- `microsoft/vscode` `extensions/git/src/staging.ts:16-124` — hunk/line intersection logic
- `desktop/desktop` `app/src/models/diff/diff-selection.ts` — DiffSelection divergence model
- `desktop/desktop` `app/src/lib/git/apply.ts` — `git apply --cached` for partial staging
- `jesseduffield/lazygit` `pkg/gui/controllers/staging_controller.go` — line/hunk staging
- `jesseduffield/lazygit` `pkg/commands/git_commands/stash.go` — stash variants
- `magit/magit` `lisp/magit-apply.el:216-406` — `magit-apply-patch`, staging dispatch
- `magit/magit` `lisp/magit-diff.el:3521-3991` — scope detection, region patch construction
- `zed-industries/zed` `crates/git_ui/src/git_panel.rs` — file/hunk staging
- `zed-industries/zed` `crates/buffer_diff/src/buffer_diff.rs` — `stage_or_unstage_hunks()`
- `tpope/vim-fugitive` `autoload/fugitive.vim` — status buffer staging keys

---

## Findings

### Finding: Four distinct granularity tiers exist across the ecosystem
**Confidence:** CONFIRMED
**Evidence:** Source-level analysis of 6 editors, docs-level analysis of 5 more

The staging granularity spectrum:

| Level | Description | Editors supporting |
|-------|-------------|-------------------|
| Stage-all | `git add -A` or equivalent | All (universal) |
| Stage-file | Individual file toggle | All except GitHub CLI |
| Stage-hunk | Diff hunk boundary | VS Code, GitHub Desktop, Lazygit, Magit, Zed, GitKraken, Fork, Sourcetree, JetBrains, Fugitive |
| Stage-line/range | Arbitrary line selection | VS Code, GitHub Desktop, Lazygit, Magit, GitKraken, Fork, Sourcetree, JetBrains |

Missing line-level: Zed (tracked as issue #45295, in active development), Fugitive (delegates to `git add --patch`), Obsidian-git (file-only by design).

### Finding: Three implementation strategies for sub-hunk staging
**Confidence:** CONFIRMED
**Evidence:** Source code of VS Code, GitHub Desktop, Lazygit, Magit

**Strategy 1: Patch construction + `git apply --cached`** (VS Code, GitHub Desktop, Lazygit)
- VS Code: `intersectDiffWithRange()` in `staging.ts:109` clips hunks to editor selection, `applyLineChanges()` constructs the patched content, then `git hash-object -w --stdin` + `git update-index` writes to the index.
- GitHub Desktop: `DiffSelection` model tracks per-line inclusion via divergence set. At commit time, a formatted patch of only selected lines is piped to `git apply --cached --unidiff-zero`.
- Lazygit: `applySelection()` in `staging_controller.go` extracts `SelectedPatchRange()`, uses `patch.Parse().Transform(TransformOpts{IncludedLineIndices})` to construct a surgical patch, applies via `git apply --cached`.

**Strategy 2: In-process patch with diff fixup** (Magit)
- `magit-diff-hunk-region-patch` walks every line in the hunk, converts unselected lines to context (replacing first char with space), then `diff-fixup-modifs` recalculates `@@ -X,Y +A,B @@` headers. The constructed patch is piped to `git apply -p0 --ignore-space-change -`.

**Strategy 3: Three-way diff editor** (JetBrains)
- Three-pane view showing HEAD / Staged / Local. The staged pane is a fully-functional editor — users can type directly into it for character-level staging precision. Changes in the staged pane are written to the git index.

### Finding: GitHub Desktop's staging model inverts the traditional index
**Confidence:** CONFIRMED
**Evidence:** `desktop/desktop` `app/src/lib/git/commit.ts`, `app/src/models/diff/diff-selection.ts`

GitHub Desktop does NOT use `git add` in the traditional sense. Its `createCommit()` sequence:
1. `unstageAll(repository)` — clears the index completely
2. `stageFiles(repository, files)` — stages only checked files
3. Files with partial selections go through `applyPatchToIndex()`
4. `git commit` runs against the rebuilt index

The `DiffSelection` data model uses a divergence-tracking approach: stores `defaultSelectionType` (All/None) and only records `divergingLines` (lines that differ from default). For a 10,000-line file with 3 lines deselected, only 3 entries are stored.

**Implications:** The index is transient — rebuilt from scratch at commit time. Users never interact with `git add` directly. This is a fundamentally different mental model from Magit/Lazygit where the index is a persistent, incrementally-modified staging area.

### Finding: Stash workflows expose the staging/partial-commit boundary
**Confidence:** CONFIRMED
**Evidence:** `jesseduffield/lazygit` `pkg/commands/git_commands/stash.go`

Lazygit exposes 5 stash variants through a menu:

| Option | Git command | Since |
|--------|-------------|-------|
| Stash all | `git stash push -m <msg>` | — |
| Keep index | `git stash push --keep-index -m <msg>` | — |
| Include untracked | `git stash push --include-untracked -m <msg>` | — |
| Staged only | `git stash push --staged -m <msg>` | git 2.35+ |
| Unstaged only | Temp commit + stash + soft reset (workaround) | — |

The "staged only" variant requires git 2.35+. For older versions, `SaveStagedChanges()` uses a multi-step workaround: `stash --keep-index`, `stash push`, `stash apply stash@{1}`, reverse-apply first stash, drop it. Known bugs documented in source comments.

The "unstaged only" workaround (`StashUnstagedChanges()`) commits everything to a temp commit with `--no-verify`, stashes what remains, then `git reset --soft HEAD^`.

**Implications:** The staging area and stash are deeply intertwined for partial-commit workflows. Tools that abstract away the index (GitHub Desktop) cannot expose these granular stash variants.

### Finding: Obsidian-git represents the non-developer endpoint — file-only staging
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/types.ts`, `src/main.ts`

Obsidian-git exposes `autoCommitOnlyStaged` but provides no hunk or line staging UI. The abstraction layer is deliberately coarse — users think in "changed files" not "changed hunks." This matches the target audience (knowledge workers using Obsidian for notes, not developers using git for version control).

---

## Gaps / follow-ups

- Zed line-level staging is in active development (issue #45295) — re-check after implementation lands
- Neovim ecosystem has multiple git staging plugins beyond Fugitive (diffview.nvim, gitsigns.nvim) — not covered in depth
