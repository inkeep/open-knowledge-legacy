# Evidence: Non-Developer Wrappers & JetBrains — Branch Management & Auth

**Dimension:** D4 (Branch management) + D5 (Remote/auth persistence)
**Date:** 2026-04-14
**Sources:** Vinzent03/obsidian-git, isomorphic-git/isomorphic-git, GitKraken docs, fork.dev, JetBrains IntelliJ Community (git4idea plugin)

---

## Key files referenced

**Obsidian-Git:**
- `src/commands.ts` — Branch commands (switch, create, delete)
- `src/main.ts` — Plugin initialization, platform dispatch
- `src/gitManager/isomorphicGit.ts` — isomorphic-git mobile backend with onAuth
- `src/gitManager/simpleGit.ts` — simple-git desktop backend
- `src/setting/localStorageSettings.ts` — Credential storage

**isomorphic-git:**
- `src/typedefs.js` — GitAuth, AuthCallback, AuthFailureCallback, AuthSuccessCallback
- `src/managers/GitRemoteHTTP.js` — Auth retry loop

**JetBrains (IntelliJ Community):**
- `plugins/git4idea/shared/src/com/intellij/vcs/git/branch/popup/GitBranchesPopup.kt`
- `plugins/git4idea/shared/src/com/intellij/vcs/git/branch/popup/GitBranchesTreeModel.kt`
- `src/git4idea/commands/GitHttpGuiAuthenticator.java`
- `src/git4idea/commands/GitHttpAuthService.kt`
- `src/git4idea/commands/SilentHostedGitHttpAuthDataProvider.kt`

---

## Obsidian-Git Findings

### D4: Branch Management

**Finding:** Four branch commands (switch, switch-to-remote, create, delete) via modal dialogs; no naming templates.
**Confidence:** CONFIRMED
**Evidence:** `src/commands.ts`

- `switch-branch`: opens `BranchModal` populated with `branchInfo().branches`, calls `gitManager.checkout(selectedBranch)`
- `switch-to-remote-branch`: `selectRemoteBranch()` → `checkout(branch, remote)` creates local tracking branch
- `create-branch`: free-text `GeneralModal` → `gitManager.createBranch(newBranch)`
- `delete-branch`: lists all branches except current; guards unmerged with "Force delete?" confirmation

No branch-naming template, no issue-tracker integration, no auto-stash on switch.

### D4: Platform Dispatch

**Finding:** Desktop uses simple-git (native git binary); mobile uses isomorphic-git (pure JS, no SSH).
**Confidence:** CONFIRMED
**Evidence:** `src/main.ts`

```typescript
get useSimpleGit(): boolean { return Platform.isDesktopApp; }
```

SSH is desktop-only. Mobile HTTP transport: Obsidian `requestUrl()` adapter.

### D5: Credential Storage

**Finding:** Credentials stored in Obsidian localStorage (no encryption, no keychain); one set per vault.
**Confidence:** CONFIRMED
**Evidence:** `src/gitManager/isomorphicGit.ts`, `src/setting/localStorageSettings.ts`

```typescript
onAuth: () => ({
    username: this.plugin.localStorage.getUsername() ?? undefined,
    password: this.plugin.localStorage.getPassword() ?? undefined,
}),
```

`LocalStorageSettings` wraps Obsidian's `app.loadLocalStorage()`/`app.saveLocalStorage()` (plugin-namespaced browser localStorage). Keys: `<pluginId>:password`, `<pluginId>:username`.

No system keychain integration, no encryption, no multi-account, no `onAuthSuccess` callback (credentials only saved on manual re-entry via `onAuthFailure`).

### Auto-commit/sync

Three independent intervals (minutes): `autoSaveInterval` (commit+pull+push), `autoPullInterval` (pull only), `autoPushInterval` (push only). `autoBackupAfterFileChange` for debounced file-change triggers.

---

## isomorphic-git Findings

### D5: Three-Callback Auth Model

**Finding:** Stateless auth via three callbacks; no credential storage; callers own persistence.
**Confidence:** CONFIRMED
**Evidence:** `src/typedefs.js`, `src/managers/GitRemoteHTTP.js:101-140`

```javascript
@callback AuthCallback        // First 401 → called
@callback AuthFailureCallback // Subsequent 401s → called (after first auth failed)
@callback AuthSuccessCallback // 200 after auth → called (save-prompt opportunity)
```

Retry loop: first 401 → `onAuth`; subsequent → `onAuthFailure`; success after auth → `onAuthSuccess`.

- **No credential storage.** Deliberate contract — callers implement persistence.
- **`headers` escape hatch:** `{ headers: { Authorization: 'Bearer <token>' } }` bypasses Basic Auth encoding
- **Multi-account by convention:** callers key `onAuth` on URL for host-based routing
- **203 handling:** Azure DevOps returns HTML login page instead of 401

---

## GitKraken Findings

### D4: Branch Management UX

**Finding:** Left-panel tree with local/remote/tags/stashes; drag-and-drop for merge/rebase; smart branch visibility.
**Confidence:** CONFIRMED
**Evidence:** GitKraken docs — Branching and Merging

- Double-click or right-click to checkout
- Drag-and-drop: branch onto branch → Merge / Rebase / Interactive Rebase confirmation
- Smart Branch Visibility: shows only checked-out + target + upstream branches
- Create: right-click any commit → "Create branch here" (free-text naming)
- Multi-select: Shift/Cmd for batch delete

### D5: Auth

**Finding:** Profile-per-account (Pro); own SSH key manager; internal credential store with "Forget All" only.
**Confidence:** CONFIRMED
**Evidence:** GitKraken docs — Authentication, GitHub Integration

- Profiles (Pro plan): isolated workspace with own GitHub account, tabs, settings
- One GitHub/GitLab/Bitbucket account per profile, not simultaneous
- SSH: generates and uploads key pairs; "Use local SSH agent" option (Windows: Pageant only)
- Does not read `.ssh/config` aliases
- HTTPS: OAuth browser flow; also supports manual PAT paste
- Token storage location: not publicly documented; no exposed encryption scheme

---

## Fork Findings

### D4: Branch Management

**Finding:** Sidebar with double-click checkout, drag-and-drop merge/rebase, folder grouping, branch starring.
**Confidence:** CONFIRMED
**Evidence:** fork.dev release notes

- Behind/ahead arrow indicators on branch labels
- Branches with `/` auto-group into collapsible folders
- Branch starring (favorites pinned at top)
- `Create Worktree` dialog added in Fork 2.63 (Feb 2026)
- Stash-and-reapply on branch switch (Fork 2.16+)

### D5: Auth

**Finding:** Windows injects `credential.helper=manager-core` into every git process; macOS uses system keychain.
**Confidence:** CONFIRMED
**Evidence:** Fork TrackerWin issue #1915, release notes

- Windows: `GIT_CONFIG_PARAMETERS='credential.helper=manager-core'` injected, hardcodes old GCM name
- macOS: credential-osxkeychain via bundled git; SSH passphrases via keychain checkbox
- Multi-account: supported since Fork 1.0.55 (Sep 2017)
- OAuth: GitHub switched to web flow in Fork 1.0.98 (Sep 2020)

---

## JetBrains Findings

### D4.1: Branch Popup

**Finding:** TreePopup with five lazy subtree holders; prefix grouping; search debounce; recent branches section.
**Confidence:** CONFIRMED
**Evidence:** `GitBranchesPopup.kt`, `GitBranchesTreeModel.kt`

```kotlin
protected var actionsTree: LazyActionsHolder
protected var localBranchesTree: LazyRefsSubtreeHolder<GitStandardLocalBranch>
protected var remoteBranchesTree: LazyRefsSubtreeHolder<GitRemoteBranch>
protected var tagsTree: LazyRefsSubtreeHolder<GitTag>
protected var recentCheckoutBranchesTree: LazyRefsSubtreeHolder<GitStandardLocalBranch>
```

`isPrefixGrouping` toggleable. Search debounced via `MutableStateFlow` + coroutine. Up to 5 recent branches. Multi-repo: `RepositoryNode` level between root and branch types.

### D4.2: Branch-from-Issue (Task Integration)

**Finding:** Unique task/issue integration for branch naming with configurable template.
**Confidence:** CONFIRMED
**Evidence:** JetBrains docs — Tasks

Settings > Tools > Tasks > "Feature branch name format" with placeholders (issue ID, title, lowercasing, hyphenation). Open Task dialog: create changelist, use existing branch, or create new feature branch with auto-generated name. Connected to YouTrack, Jira, GitHub Issues, GitLab Issues, etc.

### D4.3: Switch with Dirty Tree — Smart Checkout

**Finding:** Two options: Force Checkout (discard) or Smart Checkout (shelve + checkout + unshelve + merge conflicts).
**Confidence:** CONFIRMED
**Evidence:** JetBrains docs, `GitBranchCheckoutOperation.kt`

Smart Checkout uses JetBrains' Shelf mechanism (not git stash) for change preservation.

### D5: HTTP Auth — Provider Chain

**Finding:** Three-provider chain: PasswordSafe → silent hosted providers → dialog. Custom GIT_ASKPASS sidecar.
**Confidence:** CONFIRMED
**Evidence:** `GitHttpAuthService.kt`, `GitHttpGuiAuthenticator.java`

```java
// Provider chain:
1. PasswordSafeProvider     // system keychain or KeePass
2. ExtensionAdapterProviders // GitHub/GitLab silent OAuth token providers
3. DialogProvider           // last resort: login dialog with "Remember password"
```

`GitAskPassApp` sidecar process: launched per git operation, registered via UUID, routes `askUsername`/`askPassword` stdio prompts.

### D5: PasswordSafe

**Finding:** Credential storage routed to macOS Keychain, Gnome Keyring, or KeePass DB.
**Confidence:** CONFIRMED
**Evidence:** `GitHttpGuiAuthenticator.java`

Key format: `"http://login@host/path"` under `"Git HTTP Password"` service name. Auth failure: `PasswordSafe.set(attributes, null)` (delete credentials). Configurable via Appearance & Behavior > System Settings > Passwords.

### D5: Silent Hosted Provider

**Finding:** `SilentHostedGitHttpAuthDataProvider` auto-forwards IDE GitHub/GitLab OAuth token as HTTP password.
**Confidence:** CONFIRMED
**Evidence:** `SilentHostedGitHttpAuthDataProvider.kt`

`isSilent() = true` — runs without dialog. Uses default account per project from `AccountManager`. Failure tracking: `HostedGitAuthenticationFailureManager` ignores failed account for current session.

Multiple accounts: Settings > Version Control > GitHub. One default per project. If ambiguous (multiple accounts match URL), falls through to dialog.
