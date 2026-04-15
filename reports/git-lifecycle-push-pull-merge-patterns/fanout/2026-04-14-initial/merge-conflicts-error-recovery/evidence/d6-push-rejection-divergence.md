# Evidence: D6.1–D6.3 Network Failure, Rejected Push, Diverged Histories

**Dimension:** Network failure handling, non-fast-forward push recovery, diverged history visualization
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, JetBrains/intellij-community, zed-industries/zed

---

## Key files / pages referenced

- `microsoft/vscode: extensions/git/src/git.ts:2522-2574` — push error classification
- `microsoft/vscode: extensions/git/src/statusbar.ts:236-281` — ahead/behind status bar
- `desktop/desktop: app/src/ui/push-needs-pull/push-needs-pull-warning.tsx` — rejected push dialog
- `desktop/desktop: app/src/ui/toolbar/push-pull-button.tsx` — adaptive push/pull button
- `jesseduffield/lazygit: pkg/gui/controllers/sync_controller.go:195-235` — push rejection handler
- `jesseduffield/lazygit: pkg/gui/presentation/branches.go:214-244` — divergence indicators
- `magit/magit: lisp/magit-push.el` — force-with-lease as default
- `magit/magit: lisp/magit-status.el` — unpushed/unpulled sections
- `JetBrains/intellij-community: plugins/git4idea/src/git4idea/push/GitPushOperation.java` — retry loop
- `zed-industries/zed: crates/git_ui/src/git_panel.rs:3016-3156` — push/pull handling

---

## Findings

### Finding: Rejected push recovery spans four distinct strategies
**Confidence:** CONFIRMED

**Strategy 1 — Automated update-then-retry loop (JetBrains):**

`GitPushOperation.java` implements a retry loop (up to `MAX_PUSH_ATTEMPTS = 10`):
1. Push attempt
2. On `REJECTED_NO_FF`, show `GitRejectedPushUpdateDialog`
3. Dialog offers: **Merge** / **Rebase** / **Cancel**
4. If "rebase over merge" detected (commits include merge commits): "Rebase Anyway" with warning
5. "Remember my choice" checkbox enables `autoUpdateIfPushRejected` for future pushes
6. After user chooses, IDE performs the update, then retries push
7. Before first update, `LocalHistory` system label placed ("Before Push") for recovery

Push result types: `SUCCESS`, `NEW_BRANCH`, `UP_TO_DATE`, `FORCED`, `REJECTED_NO_FF`, `REJECTED_STALE_INFO`, `REJECTED_OTHER`, `ERROR`, `NOT_PUSHED`.

**Strategy 2 — Fetch suggestion (GitHub Desktop, VSCode):**

GitHub Desktop: `pushNeedsPullHandler` shows `PushNeedsPullWarning` dialog:
- Title: "Newer Commits on Remote"
- Body explains the situation, action button: "Fetch"
- After fetching, dialog dismisses. User must then manually pull/merge
- Does NOT auto-pull-and-retry

VSCode: Error notification with text "Can't push refs to remote. Try running 'Pull' first to integrate your changes."
- Offers "Open Git Log" and "Show Command Output" — NOT a "pull then push" button
- No automated recovery flow

**Strategy 3 — Force push confirmation (lazygit):**

`SyncController.pushAux()` (sync_controller.go:195-235):
- If `remoteBranchStoredLocally` is true: shows error "fetch first" (`UpdatesRejected`)
- If `remoteBranchStoredLocally` is false: offers confirmation dialog to force push
- Uses `--force-with-lease` for proactive case (knows branch is behind), `--force` for reactive (rejected)
- `git.disableForcePushing` config completely disables force pushing

**Strategy 4 — Error toast (Zed):**

All git operations use unified `show_error_toast()` with "View Log" action. Push failures surface as "git push failed" with raw output. No recovery workflow offered. Force push is a separate explicit action (`git::ForcePush`).

**Force push safety across editors:**

| Editor | Default force push mode | Confirmation required | Disable option |
|--------|------------------------|----------------------|----------------|
| VSCode | `--force-with-lease` | Yes (modal warning) | `git.allowForcePush` (default false) |
| GitHub Desktop | `--force-with-lease` | Yes (dialog with warning about collaborators) | N/A |
| lazygit | `--force-with-lease` (proactive) / `--force` (reactive) | Yes (confirmation dialog) | `git.disableForcePushing` |
| Magit | `--force-with-lease` (lowercase `f`) / `--force` (uppercase `F`) | No (transient argument) | N/A |
| JetBrains | `--force-with-lease` (configurable via advanced setting) | Within update dialog flow | N/A |
| Zed | `--force-with-lease` | Separate explicit action | N/A |

**Implications:** `--force-with-lease` is the universal default. JetBrains' retry loop is the most sophisticated recovery. Most editors stop at "tell the user to pull" without automating the pull-and-retry cycle.

---

### Finding: Network failure handling is uniformly primitive across editors
**Confidence:** CONFIRMED

| Editor | Network failure behavior | Offline detection | Retry UI |
|--------|-------------------------|-------------------|----------|
| VSCode | `RemoteConnectionError` regex on "Could not read from remote repository". Generic notification. | None | None |
| GitHub Desktop | Background fetch errors silently swallowed (`backgroundTaskHandler`). User-initiated ops show generic error dialog. | None | None |
| lazygit | Error surface through standard error handler | None | None |
| Magit | `magit-process-finish` extracts error via regexps, displays in mode line + error header section | None | None |
| JetBrains | Generic error notification | None | None |
| Zed | Error toast with "View Log" button. `REMOTE_CANCELLED_BY_USER` suppressed. | None | None |
| Obsidian-Git | Custom `NoNetworkError` class, `Notice()` modal with timeout | None | None |

No editor studied provides:
- Offline mode or queued operations
- Network-specific error classification (DNS vs timeout vs 502 vs auth)
- Automatic retry with backoff
- Pre-operation network check

**Implications:** Network failure handling is a universal gap. All editors treat "Could not read from remote repository" as a single error class. Distinguishing auth failure from DNS failure from network timeout would improve UX significantly.

---

### Finding: Diverged history visualization follows two patterns — counts and commit lists
**Confidence:** CONFIRMED

**Pattern 1 — Compact counts in status bar/button:**

VSCode status bar:
- Behind only: `{N}↓`; Ahead only: `{N}↑`; Both: `{behind}↓ {ahead}↑`
- Tooltip with natural language: "Pull {N} commits from {remote}/{branch}"
- ActionButton in SCM view: "Sync Changes" with `{behind}$(arrow-down) {ahead}$(arrow-up)` counts

GitHub Desktop push/pull button:
- Adapts label: "Fetch" (in sync) → "Pull" (behind) → "Push" (ahead) → "Sync" (both)
- Compact count badges with up/down arrow Octicons
- Force push state detection: `ForcePushBranchState` tracks `NotAvailable`, `Available`, `Recommended`
- Merge preview via `git merge-tree --write-tree` before merge

Zed:
- Adaptive button: Fetch (in sync) → Push (ahead, with count badge) → Pull (behind, with ahead+behind badges)
- Split button with dropdown (Force Push, Pull with Rebase, etc.)

lazygit branch list:
- `✓` (in sync), `↓N` (behind), `↑N` (ahead), `↓N↑N` (both), `?` (remote not stored)
- Additional: divergence from base branch shown as right-aligned `↓N` or `↓`
- Configurable via `gui.showDivergenceFromBaseBranch`: none/onlyArrow/arrowAndNumber

**Pattern 2 — Full commit log of diverged history:**

Magit status buffer:
- Four dedicated sections: unpushed-to-pushremote, unpushed-to-upstream, unpulled-from-pushremote, unpulled-from-upstream
- Each shows the actual commit log of diverged history, not just counts
- Upstream header dynamically shows "Merge:" or "Rebase:" based on `branch.<name>.rebase` / `pull.rebase`

Magit refs buffer:
- `<N` (behind) and `N>` (ahead) relative to focus ref
- `magit-refs-show-commit-count` controls display: `all`, `branch`, or `nil`

**Implications:** Compact counts are universal. Magit's commit-list approach provides more context but takes more space. The ahead/behind counts drive the primary user action — most editors correctly adapt the button label (push vs pull vs sync) based on the state.

---

## Negative searches

- No editor provides a visual branch divergence graph (network graph) in the conflict/push context. Graph views exist as separate features (History/Log viewers) but are not integrated into the push rejection recovery flow.
- No editor offers a "merge vs rebase" choice at the moment of divergence detection (except JetBrains' push rejection dialog).

---

## Gaps / follow-ups

- Triangular workflow support (push remote ≠ pull remote): lazygit supports this (separate `AheadForPull`/`AheadForPush` and `BehindForPull`/`BehindForPush`). Other editors' support unclear.
- Network retry policies: no editor implements automatic retry with backoff for network operations.
