# Evidence: D6 Error Handling & Recovery

**Dimension:** D6 — Network failure, rejected push, reflog, safety nets, detached HEAD, lock files, credential recovery
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed, Obsidian-Git, TinaCMS (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/git/src/git.ts` (lines 329-331, 2522-2574, 2820-2839) — lock retry, network error
- `microsoft/vscode` `extensions/git/src/repository.ts` (lines 3143-3161) — `RepositoryIsLocked` detection
- `desktop/desktop` `app/src/ui/push-needs-pull/push-needs-pull-warning.tsx` — fetch dialog
- `desktop/desktop` `app/src/lib/trampoline/trampoline-credential-helper.ts` — SAML SSO, scope detection
- `desktop/desktop` `app/src/ui/dispatcher/error-handlers.ts` — secret scanning push protection
- `jesseduffield/lazygit` `pkg/gui/controllers/undo_controller.go` — reflog-based undo/redo
- `jesseduffield/lazygit` `pkg/gui/controllers/sync_controller.go` (lines 195-235) — force push logic
- `jesseduffield/lazygit` `pkg/gui/presentation/branches.go` (lines 214-244) — divergence symbols
- `magit/magit` `lisp/magit-reflog.el` — reflog browser, color-coded entries
- `magit/magit` `lisp/magit-wip.el` — WIP refs (`refs/wip/index/`, `refs/wip/wtree/`)
- `magit/magit` `lisp/magit-push.el` — `--force-with-lease` (f) vs `--force` (F)
- `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/push/GitPushOperation.java` — `MAX_PUSH_ATTEMPTS = 10`
- `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/util/GitPreservingProcess.kt` — save/run/load wrapper

---

## Findings

### Finding: JetBrains implements a 10-attempt push-update-push cycle
**Confidence:** CONFIRMED
**Evidence:** `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/push/GitPushOperation.java`

`MAX_PUSH_ATTEMPTS = 10`. Push result enum: `SUCCESS`, `NEW_BRANCH`, `UP_TO_DATE`, `FORCED`, `REJECTED_NO_FF`, `REJECTED_STALE_INFO`, `REJECTED_OTHER`, `ERROR`, `NOT_PUSHED`. Creates Local History system label before first update attempt.

### Finding: lazygit reflog-based undo is the most innovative recovery UX
**Confidence:** CONFIRMED
**Evidence:** `jesseduffield/lazygit` `pkg/gui/controllers/undo_controller.go`

Format: `git log -g --format=+%H%x00%ct%x00%gs%x00%P`. Tags every undo via `GIT_REFLOG_ACTION=[lazygit undo]` env var. Mid-rebase state detected → shows "Can't undo while rebasing."

### Finding: Magit WIP refs provide continuous per-branch snapshots
**Confidence:** CONFIRMED
**Evidence:** `magit/magit` `lisp/magit-wip.el`

`magit-wip-mode` auto-creates snapshot commits to `refs/wip/index/<branchref>` (staged) and `refs/wip/wtree/<branchref>` (worktree) on every file save and before/after apply operations.

### Finding: JetBrains GitPreservingProcess is the most sophisticated auto-stash
**Confidence:** CONFIRMED
**Evidence:** `JetBrains/intellij-community` `plugins/git4idea/src/git4idea/util/GitPreservingProcess.kt`

Wraps any destructive operation with save → run → load cycle. Uses either git stash or IDE Shelf (configurable). If save fails, operation is skipped entirely. Conflict resolution available on restore.

### Finding: VS Code lock detection with quadratic backoff retry
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode` `extensions/git/src/git.ts:329-331, 2820-2839`

Regex: `/Another git process seems to be running/`. Retry up to 10 times: `Math.pow(attempt, 2) * 50` ms (50ms, 200ms, 450ms, ..., ~5s). No "remove stale lock" UI.

### Finding: Network failure handling is uniformly primitive
**Confidence:** CONFIRMED
**Evidence:** Searched all 12 editors

All detect via single regex on git stderr. No editor distinguishes DNS from auth timeout from HTTP 502. No offline mode, queued operations, or retry with backoff. GitHub Desktop silently swallows background fetch network errors.

### Finding: GitHub Desktop has the most sophisticated credential recovery
**Confidence:** CONFIRMED
**Evidence:** `desktop/desktop` `app/src/lib/trampoline/trampoline-credential-helper.ts`, `app/src/ui/dispatcher/error-handlers.ts`

Handles: SAML SSO re-auth (detects enforcement messages, shows org-specific dialog), missing workflow scope (OAuth scope for `.github/workflows/`), insufficient permissions (triggers "Create Fork"), secret scanning push protection (parses `PushWithSecretDetected`). Rejection tracking prevents infinite re-prompt loops.

---

## Negative searches

- Searched for offline mode / queued operations: not found in any editor
- Searched for "remove stale lock" UI: not found in any editor
- Searched for `git gc` / `git fsck` integration: not found in any editor
