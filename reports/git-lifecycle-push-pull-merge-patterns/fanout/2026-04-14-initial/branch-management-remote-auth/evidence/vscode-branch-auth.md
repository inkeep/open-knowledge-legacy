# Evidence: VSCode — Branch Management & Auth Persistence

**Dimension:** D4 (Branch management) + D5 (Remote/auth persistence)
**Date:** 2026-04-14
**Sources:** microsoft/vscode — `extensions/git/src/`, `extensions/github-authentication/src/`, `extensions/github/src/`

---

## Key files referenced

- `extensions/git/src/commands.ts` — Branch checkout, create, delete, stash commands
- `extensions/git/src/repository.ts` — Repository model, headLabel, branchSortOrder
- `extensions/git/src/statusbar.ts` — CheckoutStatusBar + SyncStatusBar
- `extensions/git/src/git.ts` — Git command execution, HEAD detection
- `extensions/git/src/askpass.ts` — GIT_ASKPASS IPC mechanism
- `extensions/github-authentication/src/common/keychain.ts` — Token storage via ExtensionContext.secrets
- `extensions/github-authentication/src/github.ts` — Session management, multi-account
- `extensions/github/src/pushErrorHandler.ts` — Push error handling (fork creation, secrets detection)

---

## Findings

### D4.1: Branch Picker UX

**Finding:** VSCode uses a QuickPick (not showQuickPick) with progressive loading for branch checkout.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/commands.ts:2852`

- `quickPick.sortByLabel = false` — sort order controlled by git, not alphabetical
- Three command items at top (when not detached): "Create new branch...", "Create new branch from...", "Checkout detached..."
- When user types, command items move to bottom so branch results dominate
- Refs bucketed with `RefItemSeparator` labels: `'branches'`, `'remote branches'`, `'tags'`
- `git.checkoutType` setting (default `['local', 'remote', 'tags']`) controls visible ref types
- `git.branchSortOrder` (default `'committerdate'`, alt `'alphabetically'`) passes `--sort=-committerdate` to `git for-each-ref`
- Ahead/behind shown in picker description when `git.showReferenceDetails: true`

### D4.2: Create Branch

**Finding:** Name validation has a multi-stage pipeline: regex validation, sanitization, and duplicate checking.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/commands.ts:3014-3036`

- `git.branchValidationRegex` (default empty — no custom validation)
- `sanitizedBranchName()` strips leading `-`, dots, `..`, `~`, `^`, `:`, `*.lock`, slashes; replaces with `git.branchWhitespaceChar` (default `-`)
- Duplicate check: inline info message if name already exists
- `git.branchPrefix` (default `""`) pre-fills input box
- `git.branchRandomName.enable` (default `false`) uses `unique-names-generator` with configurable dictionaries

### D4.3: Switch with Dirty Tree

**Finding:** VSCode presents a three-option modal dialog on dirty-tree checkout failure.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/commands.ts:2930-2978`

```typescript
const stash = l10n.t('Stash & Checkout');
const migrate = l10n.t('Migrate Changes');
const force = l10n.t('Force Checkout');
const choice = await window.showWarningMessage(
    l10n.t('Your local changes would be overwritten by checkout.'),
    { modal: true }, stash, migrate, force
);
```

- **Stash & Checkout**: stash (incl. untracked), checkout — stash remains
- **Migrate Changes**: stash, checkout, stash pop — changes move to new branch
- **Force Checkout**: `cleanAll()` (discard all), checkout
- `git.autoStash` (default `false`) applies to `pull` only, not checkout
- `git.pullBeforeCheckout` (default `false`) — pull before local branch checkout

### D4.4: Delete Branch

**Finding:** Separate commands for local and remote deletion; force-delete confirmation for unmerged.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/commands.ts:3142, 3284, 3330-3344`

- `git.deleteBranch`: picker excludes current branch
- `git.deleteRemoteBranch`: scoped to `refs/remotes`
- Unmerged branches: modal confirmation → `git branch -D` (force)

### D4.6: Stash Management

**Finding:** Rich stash command set with save-before-stash prompt.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/commands.ts`

Commands: `stash`, `stashStaged`, `stashIncludeUntracked`, `stashPop`, `stashPopLatest`, `stashApply`, `stashApplyLatest`, `stashDrop`, `stashDropAll`, `stashView`.

- `git.promptToSaveFilesBeforeStash` (default `'always'`, values: `'always'`, `'staged'`, `'never'`)
- `git.useCommitInputAsStashMessage`: pre-fills stash message from commit input box

### D4.7: Detached HEAD

**Finding:** Detected by reading `.git/HEAD` directly; shown as commit icon in status bar.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/git.ts:3041-3042`, `extensions/git/src/statusbar.ts:94-95`

```typescript
detached: !headContent.startsWith('ref: '),
// Status bar icon for detached HEAD:
return '$(git-commit)';
// Label falls back to 8-char commit hash:
const head = HEAD.name || (HEAD.commit || '').substr(0, 8);
```

No explicit "create branch from HEAD" rescue dialog. The checkout picker always offers "Create new branch..." as the first option, serving as implicit rescue.

### D4.8: Branch Visualization

**Finding:** Two status bar items: CheckoutStatusBar (branch icon + name) and SyncStatusBar (ahead/behind).
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/statusbar.ts:20, 141`

Icon hierarchy: `$(loading~spin)` → `$(lock)` (protected) → `$(git-branch-conflicts)` (merge) → `$(git-branch-staged-changes)` → `$(git-branch-changes)` → `$(git-branch)` (clean) → `$(tag)` → `$(git-commit)` (detached)

Sync label: `${this.HEAD.behind}↓ ${this.HEAD.ahead}↑`

### D5.1: Credential Persistence

**Finding:** GitHub auth extension stores tokens via `vscode.ExtensionContext.secrets` → OS keychain.
**Confidence:** CONFIRMED
**Evidence:** `extensions/github-authentication/src/common/keychain.ts`

```typescript
async setToken(token: string): Promise<void> {
    return await this.context.secrets.store(this.serviceId, token);
}
```

Service IDs: `github.auth` (GitHub.com), `<authority><path>.ghes.auth` (GHE). Sessions stored as JSON array of `SessionData` objects (id, account, scopes, accessToken). Cross-window sync via `context.secrets.onDidChange`.

### D5.2: Token Refresh

**Finding:** No automatic token refresh. Load-time scrub pattern removes invalid sessions.
**Confidence:** CONFIRMED
**Evidence:** `extensions/github-authentication/src/github.ts:255-333`

At startup, `readSessions()` calls `getUserInfo(token)` for sessions missing account data. If GitHub returns 401, session is silently discarded. Not background refresh — one-time startup scrub.

### D5.3: Multi-Account

**Finding:** GitHub auth extension supports multiple accounts via `supportsMultipleAccounts: true`.
**Confidence:** CONFIRMED
**Evidence:** `extensions/github-authentication/src/github.ts:184`

Sessions stored as array. Same account + same scopes → old session replaced. Social sign-in providers (Google, Microsoft) supported.

### D5.5: Credential Failure on Push

**Finding:** Push error handler offers "Create Fork" for permission denied; no re-auth trigger.
**Confidence:** CONFIRMED
**Evidence:** `extensions/github/src/pushErrorHandler.ts:101`

- `PermissionDenied` → Create Fork modal (rename origin→upstream, add fork as origin, push)
- `PushRejected` with `GH009` → Opens stderr + "Learn More" link (GitHub push protection)

### D5.8: Credential Helpers — GIT_ASKPASS

**Finding:** VSCode's `Askpass` class sets `GIT_ASKPASS` + `SSH_ASKPASS` for git subprocess credential prompts.
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/askpass.ts:67`

- `git.useIntegratedAskPass` (default `true`): sets GIT_ASKPASS for git calls
- `git.terminalAuthentication` (default `true`): extends to integrated terminal
- Handler checks registered `CredentialsProvider`s first, falls back to `window.showInputBox({password: true})`
- Username cached 60s per authority for paired username/password requests
- SSH: passphrase via password input, host authenticity via QuickPick yes/no
- Windows: content-addressed askpass script (SHA-256 hash) for stable paths across updates

---

## Settings Reference

| Setting | Default | Notes |
|---|---|---|
| `git.checkoutType` | `['local','remote','tags']` | Ref types in picker |
| `git.branchSortOrder` | `'committerdate'` | Picker order |
| `git.branchPrefix` | `""` | Auto-prefix for new branches |
| `git.branchValidationRegex` | `""` | Custom validation regex |
| `git.branchRandomName.enable` | `false` | Random name generation |
| `git.pullBeforeCheckout` | `false` | Pull before switch |
| `git.autoStash` | `false` | Auto-stash on pull only |
| `git.promptToSaveFilesBeforeStash` | `'always'` | Save prompt before stash |
| `git.useIntegratedAskPass` | `true` | VSCode handles credential prompts |
| `git.terminalAuthentication` | `true` | Askpass extends to terminal |
| `git.enableStatusBarSync` | `true` | Show sync indicator |
| `git.branchProtection` | `[]` | Protected branch patterns |
