# Evidence: D7 History & Diff Visualization

**Dimension:** D7 — Commit graph, file history, blame, diff viewer, 3-way merge, search, keyboard
**Date:** 2026-04-14
**Sources:** VS Code, JetBrains IntelliJ, Zed, GitKraken, Sublime Merge, Fork, GitHub Desktop, lazygit, tig, Magit, diffview.nvim, fugitive, GitLens

---

## Key files / pages referenced

- `plugins/git4idea/src/git4idea/log/GitLogProvider.java` — `GraphColorGetterByNodeFactory` (JetBrains)
- `plugins/git4idea/src/git4idea/annotate/GitAnnotationProvider.java` — `CacheableAnnotationProvider` (JetBrains)
- `plugins/git4idea/src/git4idea/history/GitHistoryUtils.java` — `--follow --full-history --simplify-merges` (JetBrains)
- `crates/git_ui/src/file_history_view.rs` — PR #42441, ~1,600 lines (Zed)
- `crates/git_ui/src/blame_ui.rs` — background threads, `delay_ms`, markdown tooltips (Zed)
- `crates/git_ui/src/project_diff.rs` — `word_diff_enabled` for expanded diff hunks <5 lines (Zed)
- `pkg/gui/presentation/graph/` — `pipeSetCache` with mutex (lazygit)
- `docs/Custom_Pagers.md` — delta integration, `|` key for pager cycling (lazygit)
- `docs/Keybindings_en.md` — single-key operations (lazygit)
- `lisp/magit-log.el` — `magit-log-color-graph-limit` (256), `magit-log-trace-definition` (Magit)
- `lisp/magit-diff.el` — `magit-diff-refine-hunk` 4 strategies (Magit)
- `lisp/magit-blame.el` — `magit-blame-styles`, 4 modes (Magit)
- [GitLens](https://help.gitkraken.com/gitlens/gitlens-features) — 4 blame surfaces
- [Sublime Merge](https://sublimemerge.com/docs) — structured search keywords
- [GitHub Desktop image diff](https://github.blog/2011-03-21-behold-image-view-modes) — 4 modes

---

## Findings

### Finding: DAG graph follows two architectural patterns
**Confidence:** CONFIRMED
**Evidence:** JetBrains `GitLogProvider.java`, lazygit `pkg/gui/presentation/graph/`, Magit `magit-log.el`

GUI-computed (JetBrains, GitKraken, Sublime Merge, Fork) vs git-delegated (lazygit, tig, Magit). VS Code added native graph in v1.93 (Aug 2024). GitHub Desktop has no DAG graph.

### Finding: GitKraken does not follow renames in file history
**Confidence:** CONFIRMED
**Evidence:** GitKraken docs, feedback portal request #232754

`--follow` flag is not used. JetBrains and Magit follow renames automatically. Magit uniquely offers function-level tracing via `magit-log-trace-definition` using git's `-L` flag.

### Finding: Blame spans four distinct surface patterns
**Confidence:** CONFIRMED
**Evidence:** GitLens docs, Magit `magit-blame.el`, Zed `blame_ui.rs`, JetBrains `GitAnnotationProvider.java`, tig manual

GitLens: 4 independent surfaces (line, gutter, file, status bar). Magit: 4 modes (addition, removal, reverse, echo) x 3 display styles. tig: `,` key traces back to previous modification. VS Code has no native blame.

### Finding: Sublime Merge has the most structured history search
**Confidence:** CONFIRMED
**Evidence:** [Sublime Merge docs](https://sublimemerge.com/docs)

Typed keywords: `author:`, `path:`, `file:`, `line:`, `contents:`, `from:`, `min-parents:`, `max-parents:`, `commit:`. Logical operators: `and`, `or`, `not`. Auto-excludes merge commits for path searches. CLI: `smerge search <query>`.

### Finding: JetBrains does not support pickaxe search
**Confidence:** CONFIRMED
**Evidence:** JetBrains support forums

`git log -S`/`-G` not available through the IDE's search interface. Magit supports them but programmatically drops `--graph` when used (`magit-log-remove-graph-args`).

### Finding: Image diff is rare — GitHub Desktop leads with 4 modes
**Confidence:** CONFIRMED
**Evidence:** [GitHub Desktop blog](https://github.blog/2011-03-21-behold-image-view-modes)

CSS classes: `.image-diff-two-up`, `.image-diff-swipe`. Four modes: 2-Up, Swipe, Onion Skin, Difference. Fork supports basic image diffs. No other tool provides native image diff.

### Finding: Two keyboard paradigms dominate
**Confidence:** CONFIRMED
**Evidence:** lazygit `Keybindings_en.md`, Magit transient system, Sublime Merge `Default.sublime-keymap`

Flat single-character bindings (lazygit) vs hierarchical transient prefixes (Magit). Command palettes (Sublime Merge, Fork: Ctrl+P) bridge the gap.

---

## Negative searches

- Searched for AI-powered history search beyond GitKraken: not found in any other tool
- Searched for integrated bisect UI: not found beyond lazygit (basic) and Magit
