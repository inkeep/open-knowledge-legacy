# Evidence: D7.4–D7.8 — Diff Viewer, 3-Way Merge, Search, Keyboard Ergonomics

**Dimensions:** D7.4 Diff viewer, D7.5 3-way merge in history, D7.6 Commit detail, D7.7 History search, D7.8 Keyboard ergonomics
**Date:** 2026-04-14
**Sources:** VS Code docs/issues, JetBrains docs, GitKraken docs, Sublime Merge docs, Fork docs, lazygit source/docs, tig manual, Magit source, Zed source, GitHub Desktop source/docs, diffview.nvim README, fugitive docs

---

## Key files / pages referenced

- VS Code 3-way merge editor: https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts (v1.69+, June 2022)
- VS Code issues: #43026 (whitespace toggle), #106855 (word-level diff)
- Zed: `crates/git_ui/src/project_diff.rs` — ProjectDiff with Diff/BranchDiff modes, word diff via `word_diff_enabled`
- lazygit: `docs/Custom_Pagers.md` — delta integration, `|` key for pager cycling
- lazygit: `docs/Keybindings_en.md` — `y` (copy), `G` (open PR), `t` (revert), `C`/`V` (cherry-pick), `T` (tag), `s`/`f`/`r`/`d`/`e` (rebase ops)
- lazygit: `docs/Custom_Keybindings.md` — arbitrary git command binding
- Magit: `lisp/magit-diff.el` — `magit-diff-refine-hunk` (4 strategies), `magit-diff-paint-whitespace`, whitespace controls
- Sublime Merge: https://sublimemerge.com/docs — search keywords (`author:`, `path:`, `file:`, `contents:`, `commit:`, `line:`), logical operators, `Default.sublime-keymap`
- Fork: https://git-fork.com — 4-way merge, Quick Launch (Ctrl+P)
- GitKraken: https://gitkraken.com/features/merge-conflict-resolution-tool — 3-way merge, AI conflict resolution
- GitHub Desktop: https://github.blog/2011-03-21-behold-image-view-modes — 4 image diff modes (2-Up, Swipe, Onion Skin, Difference)
- diffview.nvim: README — layouts `diff1_plain` through `diff4_mixed`, conflict keybindings `<leader>co/ct/cb/ca`
- tig: manual — REQ_MOVE_UP/DOWN, REQ_VIEW_*, consistent request mapping

---

## Findings

### Finding: Diff viewer modes converge on unified + split toggle
**Confidence:** CONFIRMED
**Evidence:** VS Code (inline/side-by-side toggle via menu), JetBrains (side-by-side default, switchable to 3-side), GitKraken (Hunk/Inline/Split buttons), Sublime Merge (inline + side-by-side with character-level diffs). All major tools offer both modes.

**Implications:** Unified + split toggle is table stakes. Differentiation comes from word-level refinement (Magit: 4 strategies; Sublime Merge: character-level; Zed: `word_diff_enabled`), whitespace controls, and pager composition (lazygit + delta).

### Finding: Image diff is rare — GitHub Desktop leads with 4 modes
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop: 2-Up, Swipe, Onion Skin, Difference (CSS: `.image-diff-two-up`, `.image-diff-swipe`). Fork supports basic image diffs. VS Code, Sublime Merge, lazygit, tig, Magit have no native image diff.

### Finding: 3-way merge editors are converging across the spectrum
**Confidence:** CONFIRMED
**Evidence:** VS Code (3-panel since v1.69 with Copilot assist), JetBrains (3-side viewer with code completion), GitKraken (3-way + AI + conflict prevention), Fork (4-way), diffview.nvim (3-way and 4-way layouts), Magit (3-way faces via smerge/ediff). Fork and diffview.nvim go to 4-way.

### Finding: Sublime Merge has the most structured history search syntax
**Confidence:** CONFIRMED
**Evidence:** Keywords: `author:`, `path:`, `file:`, `line:`, `contents:`, `from:`, `min-parents:`, `max-parents:`, `commit:`. Logical operators: `and`, `or`, `not`. Auto-excludes merge commits for path/file/contents searches. CLI: `smerge search <query>`.

**Implications:** Structured search syntax with typed keywords is more powerful than free-text search. JetBrains notably lacks pickaxe (`-S`/`-G`) support despite being a full IDE.

### Finding: JetBrains IntelliJ does not support pickaxe search (-S/-G)
**Confidence:** CONFIRMED
**Evidence:** Acknowledged in JetBrains support forums. The Log tab supports branch, user/author, date, path filters and free text search on messages, but not content-based search through history.

### Finding: Magit programmatically handles --graph incompatibility with search flags
**Confidence:** CONFIRMED
**Evidence:** `magit-log-remove-graph-args` in `magit-log.el` lists args incompatible with `--graph` (e.g., `--follow`, `-G`, `-S`, `-L`). Graph is auto-dropped when these flags are present.

### Finding: Two dominant keyboard paradigms — flat bindings (lazygit) vs hierarchical transients (Magit)
**Confidence:** CONFIRMED
**Evidence:** lazygit: flat single-character bindings across panels (`s` squash, `f` fixup, `r` reword, `d` drop, `e` edit, `C` copy, `V` paste, `t` revert, `y` copy attributes). Magit: hierarchical transient prefixes (`l` for log, `d` for diff, `A` for cherry-pick) with infix arguments toggleable before invocation.

**Implications:** Flat bindings optimize speed for frequent users. Hierarchical transients optimize discoverability and reduce key memorization. Sublime Merge and Fork bridge with command palettes (Ctrl+P).

### Finding: lazygit's commit operations are the most keyboard-accessible
**Confidence:** CONFIRMED
**Evidence:** Single-key operations: `y` (copy hash/URL/diff/message/author), `G` (open PR in browser), `t` (revert), `C`/`V` (cherry-pick copy/paste), `T` (tag), `o` (open in browser), `n` (new branch from commit). Custom command keybindings allow binding arbitrary git commands.

### Finding: GitKraken's interactive cherry-pick tool is unique
**Confidence:** CONFIRMED
**Evidence:** Multi-commit cherry-pick with reorder, squash, reword, and drop controls before applying. No other surveyed tool offers this level of interactive cherry-pick control.

---

## Negative searches (for NOT FOUND)

- lazygit per-file history: not documented as a feature, no dedicated view
- tig 3-way merge: delegates to external tools
- GitHub Desktop 3-way merge: not documented, shows conflict markers in text

---

## Gaps / follow-ups

- AI-powered history features (GitKraken natural language search, VS Code Copilot merge) deserve deeper investigation as the space evolves
- Sourcetree not deeply covered
