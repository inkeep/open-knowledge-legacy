# Evidence: Push UX, Upstream Tracking, Force Push, Multi-Remote, Behind/Ahead (D2.2, D2.4, D2.6, D2.7, D2.8)

**Dimension:** D2.2 Upstream tracking, D2.4 Push UX, D2.6 Rejected push recovery, D2.7 Multi-remote, D2.8 Behind/ahead indicators
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, zed-industries/zed, GitKraken docs, Fork docs, Sourcetree docs, JetBrains docs

---

## Key files referenced

- `microsoft/vscode` `extensions/git/src/commands.ts:4043-4395` — push, force push protection, publish, push-to
- `microsoft/vscode` `extensions/git/src/statusbar.ts:131-286` — SyncStatusBar (`N↓ M↑`)
- `microsoft/vscode` `extensions/git/src/actionButton.ts:44-322` — dynamic action button
- `desktop/desktop` `app/src/lib/git/push.ts` — `--force-with-lease`, secret scanning
- `desktop/desktop` `app/src/lib/rebase.ts` — `ForcePushBranchState` enum
- `desktop/desktop` `app/src/ui/toolbar/push-pull-button.tsx` — dynamic toolbar button
- `desktop/desktop` `app/src/lib/stores/helpers/find-upstream-remote.ts` — fork detection
- `jesseduffield/lazygit` `pkg/gui/controllers/sync_controller.go` — push/pull with force variants
- `jesseduffield/lazygit` `pkg/gui/controllers/helpers/upstream_helper.go` — upstream prompt
- `jesseduffield/lazygit` `pkg/commands/models/branch.go` — triangular workflow support
- `magit/magit` `lisp/magit-push.el` — push transient with `--force-with-lease` / `--force`
- `magit/magit` `lisp/magit-log.el` — unpulled/unpushed section inserters
- `zed-industries/zed` `crates/git_ui/src/git_ui.rs` — remote button with state machine

---

## Findings

### Finding: Force push protection spans four strategies
**Confidence:** CONFIRMED
**Evidence:** All source-level editors

**Strategy 1: Hidden by default, opt-in setting** (VS Code, Sourcetree)
- VS Code: `git.allowForcePush` (default `false`). Force push shows error "Force push is not allowed" when disabled. When enabled: `git.useForcePushWithLease` (default `true`) uses `--force-with-lease`; `git.useForcePushIfIncludes` (default `true`) adds `--force-if-includes` for git 2.30+; `git.confirmForcePush` (default `true`) shows modal warning.
- Sourcetree: Force push disabled by default. Must be enabled via Preferences > Advanced > "Allow Force Push" checkbox. No `--force-with-lease` support (feature request SRCTREE-4964).

**Strategy 2: Always `--force-with-lease`, never raw `--force`** (GitHub Desktop)
- Never exposes `--force`. Three-state enum:
  - `NotAvailable`: branch hasn't diverged
  - `Available`: diverged but no amend/rebase
  - `Recommended`: diverged AND user performed rebase/amend on pushed commits (button highlights)
- `askForConfirmationOnForcePush` preference controls confirmation dialog.
- Secret scanning: `secretScanningPushProtectionErrorHandler` intercepts `PushWithSecretDetected`.

**Strategy 3: Separate switches in transient** (Magit)
- `--force-with-lease` (`-f`) and `--force` (`-F`) as separate switches in the push transient. No additional confirmation dialog — the user must explicitly select the flag. Push to unconfigured upstream prompts via `magit-confirm 'set-and-push`.

**Strategy 4: Contextual force push with safety heuristics** (Lazygit)
- **Proactive** (branch known to be behind): shows confirmation, uses `--force-with-lease`.
- **Reactive** (push rejected, remote branch NOT stored locally): offers retry with `--force` (not `--force-with-lease`, since no reliable local ref exists to lease against).
- **Reactive** (push rejected, remote branch stored locally): shows rejection without offering force push — suggests fetching instead.
- `Git.DisableForcePushing` (default `false`) blocks all force push.

**Strategy 5: Warning dialog + protected branch lockout** (JetBrains)
- Uses `--force-with-lease`. Force push disabled when a protected branch is selected. Confirmation dialog for all force push actions.

**Strategy 6: No protection** (Zed)
- `git::ForcePush` executes directly — no confirmation dialog or safety guard. `PushOptions::Force` at the API level doesn't distinguish `--force-with-lease` vs `--force`.

### Finding: Upstream tracking flows follow three patterns
**Confidence:** CONFIRMED
**Evidence:** VS Code, GitHub Desktop, Lazygit, Magit, Zed source

**Pattern 1: First-push prompt with auto-set-upstream** (VS Code, GitHub Desktop, Zed)
- VS Code: catches `GitErrorCodes.NoUpstreamBranch`, shows modal "The branch has no remote branch. Would you like to publish?" If multiple remotes, shows quick pick. `--set-upstream` added automatically.
- GitHub Desktop: "Publish branch" button in toolbar. For GitHub repos, "Publish repository" dialog with account, org, privacy settings. `--set-upstream` added automatically.
- Zed: Dynamic remote button shows "Publish" (no upstream) or "Republish" (upstream gone). `PushOptions::SetUpstream` added automatically.

**Pattern 2: Interactive upstream prompt** (Lazygit)
- Two paths: if `push.default = current` in git config, pushes with `--set-upstream` directly (no prompt). Otherwise, opens prompt pre-filled with `<suggested-remote> <branch-name>` (e.g., `origin my-feature`) with autocomplete.
- `getSuggestedRemote()` defaults to `"origin"` if it exists, otherwise first remote.
- Same prompt flow for pull without upstream — sets with `git branch --set-upstream-to`.

**Pattern 3: Explicit transient selection** (Magit)
- `magit-push-current-to-upstream` detects missing upstream and prompts to set it. `magit-push-current-to-pushremote` does the same for push-remote configuration. Both add `--set-upstream` to arguments.

### Finding: Multi-remote support divides into simple picker vs fork-aware
**Confidence:** CONFIRMED
**Evidence:** VS Code, GitHub Desktop, Lazygit source

**Simple remote picker** (VS Code, Magit):
- VS Code: quick pick for remote selection in push-to, pull-from, and fetch. "Add Remote" option in picker. Default remote moved to top.
- Magit: Remote management transient with add/rename/remove/prune. Push/pull/fetch transients accept explicit remote selection. `magit-prefer-push-default` and `remote.pushDefault` config.

**Fork-aware workflow** (GitHub Desktop):
- `findUpstreamRemote()` searches for remote named `"upstream"` and validates it points to the parent repository via `repositoryMatchesRemote()`. Both name AND URL must match.
- `ChooseForkSettings` dialog: "To contribute to the parent repository" vs "For my own purposes". Choice affects which remote is targeted for push/pull.
- `find-forked-remotes-to-prune.ts` handles cleanup of stale fork remotes.

**Fork-shortcut** (Lazygit):
- `addFork()` in `RemotesController` detects `origin` URL, prompts for fork username, rewrites URL with new owner. Supports `username:branch` syntax to checkout a branch after adding the fork. Handles SCP SSH, SSH URL, HTTPS formats.

**Triangular workflow support** (Lazygit):
- The `Branch` model carries four divergence fields: `AheadForPull` / `BehindForPull` (upstream), `AheadForPush` / `BehindForPush` (push target). These can differ in triangular workflows (push to fork, pull from upstream).

### Finding: Behind/ahead indicators are universal but vary in fidelity
**Confidence:** CONFIRMED
**Evidence:** All source-level editors

| Editor | Location | Format | Update trigger |
|--------|----------|--------|----------------|
| VS Code | Status bar | `$(sync) N↓ M↑` | After fetch, live refresh |
| GitHub Desktop | Toolbar button | Arrow icons + counts | After fetch |
| Lazygit | Branches panel | Four separate counts (pull/push targets) | After fetch |
| Magit | Status buffer | "Unpulled from origin/main (N)" / "Unmerged into origin/main (N)" sections with commit lists | On buffer refresh |
| Zed | Git panel footer | ArrowUp/ArrowDown icons + count badges | After fetch |
| GitKraken | Left panel | Commit counts per branch | After auto-fetch |
| JetBrains | Status bar widget | Blue arrow (incoming) + green arrow (outgoing) | After background fetch |

**VS Code action button state machine** (`actionButton.ts:44-322`):
Priority ordering: Commit (if changes) > Publish (no upstream) > Sync Changes N↓ M↑ > Commit (disabled). The button dynamically changes its label and command based on repository state.

**Lazygit** is the only tool that supports triangular workflow divergence (separate ahead/behind for pull vs push targets). When remote branch is not stored locally, counts show `"?"` (unknown).

**Magit** provides the richest divergence view — not just counts, but full commit listings in Unpulled/Unpushed sections with `magit--insert-log`.

### Finding: Rejected push recovery flows are reactive, not preventive
**Confidence:** CONFIRMED
**Evidence:** VS Code, GitHub Desktop, Lazygit source

- **VS Code**: Push error handling at `repository.ts:2670-2693` iterates through registered `PushErrorHandler` instances (extension point). Extensions like GitHub Pull Requests can handle specific push errors.
- **GitHub Desktop**: `pushNeedsPullHandler` catches `PushNotFastForward`, surfaces `PushNeedsPull` dialog prompting user to pull. Additional handlers for `refusedWorkflowUpdate` (OAuth scope), `samlReauthRequired`, `insufficientGitHubRepoPermissions` (suggests fork creation).
- **Lazygit**: Two reactive paths (see force push finding above). Shows "Updates were rejected" and either offers force push (remote branch not local) or suggests fetching (remote branch is local).

No editor offers a preventive check before push (e.g., "your push will be rejected because the remote has N new commits — pull first?"). Behind/ahead indicators serve as a passive signal but don't block the push action.

---

## Gaps / follow-ups

- Branch protection rules (GitHub rulesets, GitLab protected branches) and how editors surface them not deeply covered
- `git push --force-if-includes` adoption (only VS Code with git 2.30+ currently) could be tracked
