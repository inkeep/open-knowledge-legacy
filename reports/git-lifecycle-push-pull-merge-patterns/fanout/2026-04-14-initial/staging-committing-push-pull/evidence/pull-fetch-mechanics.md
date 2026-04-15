# Evidence: Pull Semantics, Fetch Automation, Dry-Run (D2.1, D2.3, D2.5)

**Dimension:** D2.1 Pull semantics, D2.3 Fetch automation, D2.5 Dry-run / preview
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, zed-industries/zed, GitKraken docs, Fork docs, Sourcetree docs, JetBrains docs, Vinzent03/obsidian-git

---

## Key files referenced

- `microsoft/vscode` `extensions/git/src/repository.ts:2295-2325` — pull implementation
- `microsoft/vscode` `extensions/git/src/autofetch.ts:11-143` — AutoFetcher class
- `desktop/desktop` `app/src/lib/git/pull.ts` — pull with hook interception
- `desktop/desktop` `app/src/lib/stores/helpers/background-fetcher.ts` — 1-hour default, server-driven interval
- `jesseduffield/lazygit` `pkg/commands/git_commands/sync.go` — `Pull()`, `FetchBackgroundCmdObj()`
- `jesseduffield/lazygit` `pkg/config/user_config.go` — `FetchInterval: 60`, `AutoFetch: true`
- `magit/magit` `lisp/magit-pull.el` — pull transient with `--rebase` / `--ff-only` switches
- `magit/magit` `lisp/magit-fetch.el` — fetch transient (manual only)
- `zed-industries/zed` `crates/git_ui/src/git_panel.rs` — pull with rebase variant

---

## Findings

### Finding: Pull defaults diverge — merge is universal default, rebase opt-in
**Confidence:** CONFIRMED
**Evidence:** All source-level editors

| Editor | Default pull strategy | Rebase option | Configuration surface |
|--------|----------------------|---------------|----------------------|
| VS Code | Merge (follows git config) | Separate `git.pullRebase` command | No setting — must invoke different command |
| GitHub Desktop | Merge (FF with fallback) | Reads `pull.rebase` from git config | No UI toggle; git config only |
| Lazygit | Delegates to git config | Reads `pull.rebase` from git config | No lazygit-level config |
| Magit | Merge | `--rebase` switch in pull transient | Per-invocation choice |
| Zed | Merge | `git::PullRebase` action, `Ctrl+G Shift+Down` | Command palette + keybinding |
| GitKraken | FF-if-possible | Dropdown with FF-only, Rebase options | Persistent default via checkmark |
| Fork | Merge | "Rebase instead of merge" checkbox | **Global sticky** — persists across all repos |
| Sourcetree | Merge | Manual selection per pull | No persistent default |
| JetBrains | Configurable in settings | Settings > VCS > Git: Merge / Rebase / Reset | Persistent per-IDE setting with FF-only/no-FF options |
| Obsidian-git | Merge | `syncMethod: "rebase"` setting | Config-level; also offers `"reset"` (destructive) |

**Key insight:** No editor defaults to rebase. The industry consensus is that merge is the safer default for a broader audience. Rebase is always opt-in, with varying levels of accessibility (GitKraken/JetBrains make it easy to persist; VS Code requires a separate command invocation; GitHub Desktop has no UI — git config only).

**Fork's global-sticky rebase setting** is a known pain point — a feature request (#2658) exists to make it per-repo rather than global.

### Finding: Obsidian-git introduces a third pull strategy: "reset" (destructive sync)
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/gitManager/simpleGit.ts`

`syncMethod: "reset"` uses `git update-ref` to hard-reset the local branch to the remote tracking branch. This is destructive — local commits are discarded. It treats the remote as authoritative truth, which aligns with the "backup" mental model where the vault is the source of truth and git is just transport.

This pattern has no analog in developer-facing editors, where local commits are always preserved by default.

### Finding: Fetch automation intervals span 1 minute to 1 hour
**Confidence:** CONFIRMED
**Evidence:** All source-level editors + docs

| Editor | Auto-fetch default | Default interval | Configurable | Notes |
|--------|-------------------|-----------------|-------------|-------|
| VS Code | **Off** | 180s (3 min) when enabled | `git.autofetchPeriod` | First-time prompt after first remote op |
| GitHub Desktop | **On** | 3600s (1 hour) | Server-driven via API, clamped to 5 min floor | Random skew ±30s to prevent synchronization |
| Lazygit | **On** | 60s (1 min) | `refresher.fetchInterval` | Uses `--no-write-fetch-head` to avoid FETCH_HEAD contention |
| Magit | **Off** | N/A | N/A | No auto-fetch. `magit-auto-revert-mode` only refreshes buffers post-op |
| Zed | **Off** | N/A | N/A | Strictly user-initiated |
| GitKraken | **On** | 60s (1 min) | Preferences > General | — |
| Fork | **On** | 20 min | Preferences / per-remote context menu | — |
| Sourcetree | **On** | 10 min | Tools > Options | Per-repo toggle available |
| JetBrains | **On** (when enabled) | 20 min | Registry key `git.update.incoming.info.time` | Not in standard UI — registry key |
| Obsidian-git | **Off** | N/A | `autoPullInterval` serves a similar role | No fetch — pull is the atomic operation |

**Key implementation details:**

- VS Code `AutoFetcher`: awaits `repository.whenIdleAndFocused()` before fetching, disabling on metered connections (`env.isMeteredConnection`). Disables on `AuthenticationFailed`.
- GitHub Desktop `BackgroundFetcher`: server-driven interval via `api.getFetchPollInterval()`. Random skew per instance prevents fleet synchronization. Runs `git fetch --prune --recurse-submodules=on-demand`.
- Lazygit: Background fetch uses `FetchBackgroundCmdObj()` with `FailOnCredentialRequest()` (silently fails if credentials needed) and `SuppressOutputUnlessError()`. After fetch, `AutoForwardBranches()` fast-forwards local branches behind their tracking branches.
- Lazygit's `--no-write-fetch-head` flag prevents `.git/FETCH_HEAD` contention, enabling concurrent fetch and pull.

### Finding: Dry-run / preview before push-pull is almost non-existent in GUIs
**Confidence:** CONFIRMED
**Evidence:** All editors surveyed

Only Magit exposes `--dry-run` as a push option (the `-n` switch in the push transient). No other editor offers a preview of what a pull or push will do before executing it.

**Behind/ahead indicators** serve as a lightweight preview proxy — they show how many commits will move in each direction. But none of the tools surveyed offer a "show me the commits/diffs that will be merged" preview before pull, or "show me the commits that will be pushed" preview before push, as a first-class UI flow.

**Implications:** This is a gap across the ecosystem. The closest analog is Magit's Unpulled/Unpushed sections in the status buffer, which list the actual commits — but these are informational displays, not a confirmation step before the operation.

---

## Gaps / follow-ups

- `git fetch --prune` behavior across editors not fully catalogued
- Submodule fetch handling varies but was not a primary dimension
