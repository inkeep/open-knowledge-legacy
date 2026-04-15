# Evidence: D7.1–D7.3 — Commit Graph, File History, Blame

**Dimensions:** D7.1 Commit log/graph, D7.2 File history, D7.3 Blame/annotate
**Date:** 2026-04-14
**Sources:** VS Code source/docs, JetBrains IntelliJ Community source, Zed source, GitKraken docs, Sublime Merge docs, Fork docs, lazygit source, tig manual, Magit source, GitHub Desktop docs, GitLens docs, diffview.nvim README, fugitive docs

---

## Key files / pages referenced

- VS Code native graph: `extensions/git/src` (Source Control Graph, v1.93+)
- JetBrains IntelliJ: `plugins/git4idea/src/git4idea/log/GitLogProvider.java` — `GraphColorGetterByNodeFactory` for graph coloring
- JetBrains IntelliJ: `plugins/git4idea/src/git4idea/annotate/GitAnnotationProvider.java` — implements `AnnotationProviderEx, CacheableAnnotationProvider`
- JetBrains IntelliJ: `plugins/git4idea/src/git4idea/history/GitHistoryUtils.java` — `--follow --full-history --simplify-merges`
- Zed: `crates/git_ui/src/file_history_view.rs` — file history view, PR #42441 (~1,600 lines)
- Zed: `crates/git_ui/src/blame_ui.rs` — inline blame, PR #10398
- lazygit: `pkg/gui/presentation/graph/` — graph rendering with `pipeSetCache` using `commitHash + commitCount + divergence` cache key
- Magit: `lisp/magit-log.el` — `magit-log-color-graph-limit` (256 commit cap), `magit-log-remove-graph-args`, `magit-log-trace-definition`
- Magit: `lisp/magit-blame.el` — `magit-blame-styles` (headings/highlight/lines), `magit-blame-addition/removal/reverse/echo`
- GitLens: https://help.gitkraken.com/gitlens/gitlens-features — blame surfaces, commit graph
- GitKraken Desktop: https://gitkraken.com/features/commit-graph — DAG graph, minimap
- Sublime Merge: https://sublimemerge.com — search keywords, `diff_algorithm` preference
- Fork: https://git-fork.com — expand/collapse merge commits with arrow keys
- tig: https://jonas.github.io/tig/doc/manual.html — views enum, blame `,` trace-back
- diffview.nvim: https://github.com/sindrets/diffview.nvim — `:DiffviewFileHistory` with `--follow`
- fugitive: https://github.com/tpope/vim-fugitive — `:Gclog`, `:Git blame`
- GitHub Desktop: https://docs.github.com/en/desktop — linear history, no DAG

---

## Findings

### Finding: DAG graph is universal in power tools but absent in GitHub Desktop
**Confidence:** CONFIRMED
**Evidence:** IntelliJ, GitKraken, Sublime Merge, Fork, lazygit, tig, and Magit all render commit DAG graphs. VS Code added a native Source Control Graph in v1.93 (Aug 2024). GitHub Desktop shows a flat linear commit list only.

**Implications:** Any editor adding git history must decide between DAG and linear. DAG is expected by developers; linear is simpler for non-developers.

### Finding: TUI tools delegate graph rendering to git; GUI tools compute their own
**Confidence:** CONFIRMED
**Evidence:** lazygit uses `pkg/gui/presentation/graph/` with caching but ultimately processes git's `--graph` output. tig uses `git log --graph`. Magit passes `--graph` to git and converts ANSI escapes via `ansi-color`. IntelliJ and GitKraken compute their own graph layout.

**Implications:** Delegation is simpler but limits layout control. Custom rendering enables minimap (GitKraken), merge collapse (Fork), and interactive features.

### Finding: Graph performance capping is an explicit concern in lazygit and Magit
**Confidence:** CONFIRMED
**Evidence:** lazygit uses a thread-safe `pipeSetCache` with mutex. Magit sets `magit-log-color-graph-limit` to disable graph coloring above 256 commits.

### Finding: Follow-renames varies widely — automatic in IntelliJ/Magit, broken in GitKraken
**Confidence:** CONFIRMED
**Evidence:** IntelliJ uses `--follow --full-history --simplify-merges` in `GitHistoryUtils.java`. Magit's `magit-log-buffer-file` supports `--follow`. GitKraken Desktop does NOT use `--follow` — documented in feedback portal #232754. diffview.nvim supports `--follow` optionally.

### Finding: Magit offers function-level history tracing via git -L
**Confidence:** CONFIRMED
**Evidence:** `magit-log-trace-definition` in `magit-log.el` uses git's `-L` flag to trace the evolution of a specific function definition. Unique among surveyed tools.

### Finding: Blame architecture spans four distinct surface patterns
**Confidence:** CONFIRMED
**Evidence:** GitLens: 4 surfaces (current line, gutter, file, status bar). Magit: 4 modes (addition, removal, reverse, echo) with 3 display styles (headings, highlight, lines). Zed: background-thread blame with configurable delay (`delay_ms`) and markdown-rendered tooltips. IntelliJ: `CacheableAnnotationProvider` with click-to-log-tab integration. tig: `,` key traces back to previous modification of a line.

### Finding: Zed's blame runs on background threads for performance
**Confidence:** CONFIRMED
**Evidence:** `crates/git_ui/src/blame_ui.rs`, PR #10398 by mrnugget. Blog post "Fixing the Git Blame Beachball" describes the architecture.

---

## Gaps / follow-ups

- Sublime Merge blame UI details not deeply investigated
- Cursor (VS Code fork) may have additional blame/graph features not explored
