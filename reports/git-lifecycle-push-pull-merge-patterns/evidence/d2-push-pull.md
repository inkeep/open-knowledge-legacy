# Evidence: D2 Push/Pull Mechanics

**Dimension:** D2 — Pull semantics, upstream tracking, fetch automation, force push protection, dry-run
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, Zed, GitKraken, Fork, JetBrains, Obsidian-Git (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/git/src/autofetch.ts` (lines 11-143) — `whenIdleAndFocused()`, metered connection check
- `microsoft/vscode` `extensions/git/src/commands.ts` (lines 4043-4395) — push/pull/force push
- `microsoft/vscode` `extensions/git/src/actionButton.ts` (lines 44-322) — dynamic state machine
- `microsoft/vscode` `extensions/git/src/statusbar.ts` (lines 131-286) — behind/ahead display
- `desktop/desktop` `app/src/lib/stores/helpers/background-fetcher.ts` — server-driven interval, random skew
- `desktop/desktop` `app/src/lib/git/pull.ts` — FF merge with fallback
- `desktop/desktop` `app/src/lib/git/push.ts` — `ForcePushBranchState`, secret scanning handler
- `desktop/desktop` `app/src/lib/stores/helpers/find-upstream-remote.ts` — fork validation
- `jesseduffield/lazygit` `pkg/commands/git_commands/sync.go` — `--no-write-fetch-head`, `FailOnCredentialRequest()`
- `jesseduffield/lazygit` `pkg/gui/controllers/sync_controller.go` (lines 195-235) — force push logic
- `jesseduffield/lazygit` `pkg/commands/models/branch.go` — triangular workflow fields
- `magit/magit` `lisp/magit-push.el` — `--force-with-lease` (f) vs `--force` (F) transient
- `magit/magit` `lisp/magit-pull.el` — `--rebase` switch
- `Vinzent03/obsidian-git` `src/gitManager/simpleGit.ts` — `syncMethod: "reset"` destructive pull

---

## Findings

### Finding: No editor defaults to rebase for pull
**Confidence:** CONFIRMED
**Evidence:** All source-level editors checked: VS Code `repository.ts:2295`, GitHub Desktop `pull.ts`, lazygit delegates to git config, Magit `magit-pull.el`, Zed `git_panel.rs`

Merge is the universal safe default. Rebase is always opt-in with varying accessibility — from persistent toggle (GitKraken, JetBrains) to per-invocation switch (Magit).

### Finding: Fetch automation intervals span 1 min to 1 hour
**Confidence:** CONFIRMED
**Evidence:** VS Code `autofetch.ts:11-143`, GitHub Desktop `background-fetcher.ts`, lazygit `user_config.go`

GitHub Desktop's implementation is most sophisticated: server-driven via `api.getFetchPollInterval()` with 5-min floor and random ±30s skew. VS Code awaits `whenIdleAndFocused()` and disables on metered connections.

### Finding: Force push protection follows four distinct strategies
**Confidence:** CONFIRMED
**Evidence:** VS Code `commands.ts:4043-4395`, GitHub Desktop `rebase.ts` (`ForcePushBranchState` enum), lazygit `sync_controller.go:195-235`, Magit `magit-push.el`

GitHub Desktop's three-state enum (NotAvailable/Available/Recommended) elevates force push to "Recommended" after rebase/amend on pushed commits. Magit maps lowercase `f` to `--force-with-lease` and uppercase `F` to `--force`.

### Finding: Dry-run/preview is almost non-existent
**Confidence:** CONFIRMED
**Evidence:** Searched all 12 editors. Only Magit exposes `--dry-run` as a push transient switch (`-n` in push transient).

### Finding: Obsidian-Git has a destructive "reset" pull strategy
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/gitManager/simpleGit.ts`

`syncMethod: "reset"` uses `git update-ref` to hard-reset local branch to remote tracking branch, discarding local commits. No developer-facing editor offers this.

---

## Negative searches

- Searched for `git push --force-if-includes` adoption beyond VS Code: not found in any other editor source.
- Searched for pull preview/dry-run in GUI editors: only Magit.
