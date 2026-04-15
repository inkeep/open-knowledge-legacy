# Evidence: D1 Staging & Commit UX

**Dimension:** D1 — Staging granularity, commit message composition, amend, undo, auto-commit
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GitKraken, Obsidian-Git (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/git/src/commands.ts` (lines 1515-1932, 2418-2603, 2780-2807) — staging, smart commit, undo
- `microsoft/vscode` `extensions/git/src/staging.ts` (lines 16-124) — `intersectDiffWithRange()` patch construction
- `microsoft/vscode` `extensions/git/src/repository.ts` (lines 1006-1009, 1099-1127) — SCM groups, commit validation
- `desktop/desktop` `app/src/models/diff/diff-selection.ts` — inverted index `DiffSelection` divergence set
- `desktop/desktop` `app/src/lib/git/apply.ts` — `applyPatchToIndex()`
- `desktop/desktop` `app/src/lib/wrap-rich-text-commit-message.ts` — 50/72 char limits
- `jesseduffield/lazygit` `pkg/gui/controllers/staging_controller.go` — `Transform(TransformOpts{IncludedLineIndices})`
- `jesseduffield/lazygit` `pkg/commands/git_commands/stash.go` — 5 stash variants
- `jesseduffield/lazygit` `pkg/gui/controllers/undo_controller.go` — reflog-based undo
- `jesseduffield/lazygit` `pkg/config/user_config.go` — `CommitPrefixConfig{Pattern, Replace}`
- `magit/magit` `lisp/magit-apply.el` (lines 216-406) — stage/unstage apply
- `magit/magit` `lisp/magit-diff.el` (lines 3521-3991) — `magit-diff-hunk-region-patch`, `diff-fixup-modifs`
- `magit/magit` `lisp/magit-commit.el` — 12 commit transient commands, `magit-commit-amend-assert`
- `zed-industries/zed` `crates/git_ui/src/git_panel.rs` — AI commit, `check_for_pushed_commits()`
- `Vinzent03/obsidian-git` `src/automaticsManager.ts` — timer/debounce auto-commit

---

## Findings

### Finding: Four staging tiers with three sub-hunk implementation strategies
**Confidence:** CONFIRMED
**Evidence:** VS Code `staging.ts:16-124`, GitHub Desktop `diff-selection.ts`, lazygit `staging_controller.go`, Magit `magit-diff.el:3521-3991`, JetBrains docs

Stage-all (12/12), stage-file (11/12), stage-hunk (10/12), stage-line (8/12). Three strategies for sub-hunk: patch construction + `git apply --cached` (VS Code, GitHub Desktop, lazygit), in-process diff fixup (Magit), three-way diff editor (JetBrains).

### Finding: GitHub Desktop rebuilds the index from scratch at commit time
**Confidence:** CONFIRMED
**Evidence:** `desktop/desktop` `app/src/lib/git/commit.ts`, `diff-selection.ts`

Sequence: `unstageAll()` → `stageFiles()` → `commit()`. `DiffSelection` stores `defaultSelectionType` + only diverging lines. Users never interact with `git add` directly.

### Finding: AI commit messages are table-stakes for commercial editors
**Confidence:** CONFIRMED
**Evidence:** GitKraken docs (v11.3+ Commit Composer), JetBrains AI docs, Cursor docs, Zed `git_panel.rs`, VS Code Copilot docs

5 of 7 commercial editors ship native AI commit messages. GitKraken's Commit Composer goes furthest with AI-assisted commit history restructuring. Zed compresses diff to 20KB max and loads project rules.

### Finding: Lazygit reflog-based undo handles three action kinds
**Confidence:** CONFIRMED
**Evidence:** `jesseduffield/lazygit` `pkg/gui/controllers/undo_controller.go`

`parseReflogForActions()` walks reflog. Three kinds: COMMIT (soft reset), CHECKOUT (checkout previous), REBASE (hard reset + auto-stash/pop). Tags each undo via `GIT_REFLOG_ACTION=[lazygit undo]`.

### Finding: Auto-commit is exclusively a non-developer pattern
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/automaticsManager.ts`, VS Code `commands.ts:2418-2451`

Only Obsidian-Git offers timer-based auto-commit. VS Code `git.enableSmartCommit` (default false) is the closest developer-side equivalent. Magit `magit-commit-ask-to-stage` (default 'verbose) prompts but does not auto-stage silently.

---

## Negative searches

- Searched for conventional-commits plugin ecosystem depth: shallow coverage only. GitKraken and JetBrains have marketplace plugins; no deep analysis.
- Searched for Zed line-level staging: confirmed in active development (issue #45295), not yet shipped.
