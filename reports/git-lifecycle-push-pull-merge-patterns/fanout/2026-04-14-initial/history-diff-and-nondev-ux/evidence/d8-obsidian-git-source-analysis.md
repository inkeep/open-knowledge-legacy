# Evidence: D8 — Obsidian-Git Source-Level Analysis

**Dimension:** D8.1, D8.2, D8.3, D8.4, D8.5, D8.7, D8.8 (Obsidian-Git specifics)
**Date:** 2026-04-14
**Sources:** https://github.com/Vinzent03/obsidian-git (source), CHANGELOG.md, GitHub issues

---

## Key files / pages referenced

- `src/automaticsManager.ts` — auto-commit scheduling, interval calculation, debounce trigger
- `src/main.ts` — vault event listeners (modify/delete/create/rename), `autoCommitDebouncer`, `promiseQueue`
- `src/constants.ts` — default settings (all intervals `0`, `autoBackupAfterFileChange: false`, `pullBeforePush: true`, `syncMethod: "merge"`)
- `src/types.ts` — settings type definitions, `disablePush` toggle
- `src/setting/settings.ts` — settings UI, terminology mapping
- `src/gitManager/simpleGit.ts` — desktop git manager wrapping `simple-git`, `push()` with no `--force`
- `src/gitManager/isomorphicGit.ts` — mobile git manager, `diff3Merge`, `MergeNotSupportedError`
- `src/commands.ts` — command registry, `delete-repo` confirmation
- `CHANGELOG.md` — v2.27.0 "backup" → "commit-and-sync" rename, v2.14.0 conflict instructions, v2.20.2 merge conflict resolution
- GitHub Issue #906 — mobile merge conflict failure (April 2025)
- GitHub Issue #803 — feature request for conflict resolution (November 2024)
- GitHub Issue #340 — merge conflicts on mobile
- GitHub Discussion #616 — force pull request on mobile
- GitHub Discussion #709 — multi-device collaboration patterns

---

## Findings

### Finding: Three independent auto-commit trigger mechanisms
**Confidence:** CONFIRMED
**Evidence:** `src/automaticsManager.ts` implements:

1. **Interval-based (timeout):** `autoSaveInterval` in minutes. Calculates remaining time: `setting - Math.round((now.getTime() - lastAuto.getTime()) / 1000 / 60)`. Persists across sessions. Caps at `2147483647ms` (JS max timeout).
2. **Debounce-based (file-change):** `autoBackupAfterFileChange` triggers `autoCommitDebouncer` on vault events (modify/delete/create/rename).
3. **Three independent intervals:** `autoSaveInterval` (commit/sync), `autoPullInterval`, `autoPushInterval` — can be set independently for fine-grained control.

Execution queued through `promiseQueue` for sequential execution, preventing git index lock races.

### Finding: Default commit message template uses timestamp; separate manual/auto templates
**Confidence:** CONFIRMED
**Evidence:** `src/constants.ts`: `commitMessage: "vault backup: {{date}}"`, `autoCommitMessage: "vault backup: {{date}}"`. Supports `{{date}}` (formatted via `moment().format(settings.commitDateFormat)`, default `YYYY-MM-DD HH:mm`) and `{{hostname}}`. Desktop supports `commitMessageScript` for script-based generation.

### Finding: Terminology underwent explicit evolution from "backup" to "commit-and-sync" in v2.27.0
**Confidence:** CONFIRMED
**Evidence:** `CHANGELOG.md` v2.27.0 (2024-09-18): "Rename 'backup' to 'commit and sync' with a much better settings page." Settings UI now uses "Commit-and-sync" as primary action, with separate toggles: "Push on commit-and-sync", "Pull on commit-and-sync". Advanced settings still expose git-native terms: "hunks", "Line Author" (blame), "Sync method" (merge/rebase/reset).

**Implications:** Middle-ground abstraction — primary action is abstracted, but advanced settings preserve git terminology. This is a conscious design choice to serve both non-dev and developer users.

### Finding: No force-push surface; pull-before-push as default safety net
**Confidence:** CONFIRMED
**Evidence:** `src/gitManager/simpleGit.ts`: `push()` uses standard `git.push()` with no `--force` flag. `src/constants.ts`: `pullBeforePush: true` by default. `disablePush: false` togglable per-device. `delete-repo` command requires "YES" confirmation via `GeneralModal`. `showErrorNotices: true` by default.

**No backup-before-destructive-op:** No evidence of automatic stash or snapshot before pull/merge operations.

### Finding: Desktop uses simple-git (native git); mobile uses isomorphic-git with fundamental conflict limitations
**Confidence:** CONFIRMED
**Evidence:** Desktop (`src/gitManager/simpleGit.ts`): wraps `simple-git` calling system git binary. Pull strategy configurable: merge (default), rebase, reset. `mergeStrategy` options: `"none"` (default), `"ours"`, `"theirs"`.

Mobile (`src/gitManager/isomorphicGit.ts`): uses `isomorphic-git` with `diff3Merge` for three-way merging. Throws `MergeNotSupportedError` for conflicts it cannot auto-resolve. Error message: `"Merge with conflicts is not supported yet"`.

### Finding: Mobile merge conflicts are a known broken capability with no in-app resolution
**Confidence:** CONFIRMED
**Evidence:** Issue #906 (April 2025): mobile users cannot resolve merge conflicts. Issue #803 (November 2024): feature request for conflict resolution. Issue #340: merge conflicts on mobile. Users must resolve on desktop, use `mergeStrategy: "theirs"/"ours"`, or use a terminal (impossible on iOS without workarounds).

**Implications:** This is a direct instance of the "retreat-to-CLI" pattern. The abstraction completely fails for mobile conflict scenarios.

### Finding: Single-user multi-device sync is the designed use case; multi-user is not
**Confidence:** CONFIRMED
**Evidence:** Discussion #709: no awareness of other users, no presence indicators, no real-time collaboration. Most common conflict source: `workspace.json` (open tabs/panes). Community recommendation: add `.obsidian/workspace.json` to `.gitignore`. `autoPullOnBoot` setting (default: false) mitigates divergence from closed-before-interval-fires.

### Finding: Six scenarios reliably require CLI retreat
**Confidence:** CONFIRMED
**Evidence:**
1. Merge conflicts on mobile (MergeNotSupportedError)
2. Authentication failures (SSH keys, credential expiry, PAT rotation)
3. Snap/Flatpak sandboxing preventing access to system git binary
4. Corrupted git state (lock files, detached HEAD, index corruption)
5. Force operations (no force-push/pull UI; Discussion #616)
6. Complex .gitignore management (`git rm --cached` has no UI equivalent)

---

## Gaps / follow-ups

- `commitMessageScript` feature on desktop deserves deeper investigation for custom generation patterns
- The `differentIntervalCommitAndPush` setting enables split commit-only vs push-only intervals — an uncommon pattern worth noting
