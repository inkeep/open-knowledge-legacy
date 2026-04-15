---
title: "Branch Management & Remote/Auth Persistence — Git Lifecycle UX Patterns"
description: "How editors across the spectrum (developer IDEs, visual git clients, power-user TUIs, non-developer wrappers) implement branch management UX and remote/auth persistence for the post-clone git lifecycle. Source-level evidence from 11 tools."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - VSCode
  - GitHub Desktop
  - lazygit
  - Magit
  - Zed
  - JetBrains IntelliJ
  - GitKraken
  - Fork
  - Obsidian-Git
  - isomorphic-git
  - git-credential-manager
topics:
  - branch management UX
  - credential persistence
  - git lifecycle
  - editor architecture
---

# Branch Management & Remote/Auth Persistence — Git Lifecycle UX Patterns

**Purpose:** Factual landscape of how editors and git tools implement branch management UX (D4) and remote/auth persistence (D5) for the post-clone git lifecycle. Covers 11 tools across the spectrum from developer IDEs to non-developer wrappers. Part of the parent report on git lifecycle push/pull/merge patterns.

**Parent report:** `reports/git-lifecycle-push-pull-merge-patterns/`

---

## Executive Summary

Branch management and credential persistence are the two dimensions where the editor spectrum diverges most sharply. Branch picker UX follows three distinct architectural patterns: **dropdown pickers** (VSCode, GitHub Desktop, Zed), **panel-based browsers** (lazygit, GitKraken, Fork), and **transient popups** (Magit, JetBrains). Each pattern optimizes for a different interaction model — quick-switch, visual exploration, and keyboard-driven command dispatch respectively.

The most consequential design decision in branch management is **dirty-working-tree handling on branch switch**. No two tools handle this identically: VSCode offers a three-option modal (stash/migrate/force), GitHub Desktop uses a configurable strategy enum persisted in localStorage, lazygit prompts with an inline autostash sequence, Magit hard-errors on branch creation and delegates to git on existing checkout, Zed fully delegates to git with toast errors, and JetBrains offers "Smart Checkout" using its own Shelf mechanism (not git stash). This is the single highest-variance UX decision across the editor spectrum.

For credential persistence, nearly every tool above Obsidian-Git delegates to the OS keychain via some intermediary. The architectural layering follows a consistent pattern: **editors inject themselves into git's credential prompt chain via `GIT_ASKPASS`** (VSCode, Zed, JetBrains) or **process filter interception** (Magit), then delegate storage to the OS keychain (directly or via GCM). The notable exception is Obsidian-Git, which stores credentials in unencrypted browser localStorage — the weakest credential model surveyed.

**Key Findings:**
- **Branch-from-issue integration exists in exactly two tools:** JetBrains (Tasks plugin with template-based naming across 10+ issue trackers) and lazygit (PR status badges, but no issue-to-branch creation)
- **Worktree UX is emerging but uneven:** lazygit has the most complete worktree panel (full lifecycle with branch-collision detection); Magit integrates worktrees into the branch transient; Zed has a dedicated worktree picker; Fork added worktree support in 2.63; VSCode and GitHub Desktop have no worktree UX
- **GCM is a dispatch layer, not a store:** `ICredentialStore` is a four-method interface with eight swappable backends; editors that delegate to GCM inherit all eight storage options
- **gh CLI's `auth git-credential` is intentionally read-only:** `store` and `erase` are no-ops — gh manages its own token lifecycle independently

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D4.1 | Branch picker UX | P0 | Deep |
| D4.2 | Create branch | P0 | Deep |
| D4.3 | Switch branch (dirty tree) | P0 | Deep |
| D4.4 | Delete branch | P0 | Moderate |
| D4.5 | Rename branch | P1 | Moderate |
| D4.6 | Stash management | P0 | Deep |
| D4.7 | Detached HEAD handling | P0 | Deep |
| D4.8 | Branch visualization | P0 | Moderate |
| D4.9 | Worktree UX | P1 | Moderate |
| D5.1 | Credential persistence | P0 | Deep |
| D5.2 | Token refresh | P0 | Deep |
| D5.3 | Multi-account support | P0 | Deep |
| D5.4 | SSH vs HTTPS | P0 | Moderate |
| D5.5 | Credential failure surface | P0 | Deep |
| D5.6 | Host-specific auth | P0 | Moderate |
| D5.7 | 2FA / passkey / device flow | P1 | Moderate |
| D5.8 | Credential helpers / delegation | P0 | Deep |

**Stance:** Factual (no recommendations)
**Non-goals:** Clone/init UX, OAuth at clone time, CRDT-specific branching, git library selection, draft-isolation-as-worktree for AI agents.

---

## Detailed Findings

### D4.1: Branch Picker UX

**Finding:** Three distinct architectural patterns for branch selection; "recently used" is implemented via two different mechanisms (committer date vs reflog).

**Evidence:** [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md), [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md)

| Tool | Pattern | Search | Sort/Recency | Remote Handling |
|------|---------|--------|-------------|-----------------|
| VSCode | QuickPick dropdown | Fuzzy (label only) | `--sort=-committerdate` (default) or alphabetical | Bucketed sections: local, remote, tags |
| GitHub Desktop | PopoverDropdown | Fuzzy (SectionFilterList) | 3 sections: default, recent (5, reflog), other | Folded into local list; no remote tab |
| lazygit | Dedicated panel | In-panel filter + fuzzy ref prompt | 3 modes: date, recency (reflog), alphabetical | Separate panel |
| Magit | Transient popup | Completion-read | N/A (lettered keybindings) | Same transient, different commands |
| Zed | Fuzzy picker modal | `fuzzy::match_strings()` | Commit timestamp (most recent first) | Local before remote in same list |
| JetBrains | TreePopup | Debounced MutableStateFlow | 5 recent branches section | Separate subtree in tree model |
| GitKraken | Left-panel tree | Inline filter | Graph-position order | Separate tree sections |
| Fork | Sidebar tree | N/A | Folder grouping by `/` | Separate tree sections |
| Obsidian-Git | Modal dialog | None (flat list) | Alphabetical | Separate command for remote |

**"Recently used" divergence:** VSCode uses committer date (`--sort=-committerdate` on `git for-each-ref`), which approximates recency but is the commit date, not the checkout date. GitHub Desktop and lazygit use the reflog (`git log -g HEAD`), which captures actual checkout history. JetBrains has a dedicated `RECENT` branch type with up to 5 entries. This is a meaningful UX difference — committer-date sort puts recently-modified branches first, while reflog-based recency puts recently-switched-to branches first.

### D4.2: Create Branch

**Finding:** Name validation ranges from none (Obsidian-Git) to multi-stage pipeline with API-backed ruleset checks (GitHub Desktop).

**Evidence:** [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md)

| Tool | Name Validation | Prefix/Template | From Issue |
|------|----------------|-----------------|------------|
| VSCode | Sanitize regex + custom `branchValidationRegex` + duplicate check | `git.branchPrefix` + random names | No |
| GitHub Desktop | Client regex + GitHub API ruleset check (`fetchRepoRulesForBranch`) | StartPoint enum (4 options) | No (issues for commit msg only) |
| lazygit | None at creation; git-level validation | `BranchPrefix` config with `{{runCommand}}` template | No (PR status shown, no issue-to-branch) |
| Magit | Git-level validation | Upstream inheritance rules | Via Forge (separate package) |
| Zed | Spaces → hyphens; git-level | None | No |
| JetBrains | Git-level | **Task template** (issue ID, title, lowercasing, hyphenation) | **Yes** — 10+ trackers (Jira, GitHub, GitLab, YouTrack) |
| GitKraken | Git-level | None | No |
| Obsidian-Git | None | None | No |

**Branch-from-issue** is a rare feature. JetBrains is the only tool with a first-class issue-to-branch flow — the Tasks plugin provides configurable template-based branch naming with placeholders for issue ID, title, etc. Other tools either show PR/issue metadata in branch context (lazygit, GitKraken) or offer issue autocomplete in commit messages (GitHub Desktop) without bridging to branch creation.

**Magit's spinoff/spinout** is unique in the ecosystem. `spinoff` creates a new branch, moves unpushed commits to it, and resets the source branch to the merge-base — all via `git update-ref` (no force-push). `spinout` does the same but stays on the current branch. No other surveyed tool offers this primitive.

### D4.3: Switch Branch — Dirty Working Tree Handling

**Finding:** This is the highest-variance UX decision across the editor spectrum. Every tool handles dirty-tree checkout differently.

**Evidence:** [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md), [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md)

| Tool | Strategy | Auto-Stash Available | Mechanism |
|------|----------|---------------------|-----------|
| VSCode | 3-option modal on failure: Stash & Checkout / Migrate Changes / Force Checkout | On pull only (`git.autoStash`), not checkout | Catches `DirtyWorkTree` error from git |
| GitHub Desktop | Configurable strategy enum persisted in localStorage (default: AskForConfirmation) | Implicit via strategy | Checks before attempting checkout |
| lazygit | Autostash prompt on failure: stash push → checkout → stash pop | Yes (inline prompt) | Detects error string from git |
| Magit | Hard error on create-with-start-point; delegates to git on existing checkout | On pull only (`-A`), never on checkout | `user-error` guard |
| Zed | Fully delegates to git; error surfaces as toast | No | No pre-flight check |
| JetBrains | Two-option dialog: Force Checkout / Smart Checkout (shelve+checkout+unshelve) | Via Smart Checkout | Uses Shelf (not git stash) |
| GitKraken | Prompt to stash or discard | Yes (inline) | Pre-flight check |
| Fork | Stash-and-reapply | Yes (since 2.16) | Pre-flight |
| Obsidian-Git | Git-level (no guard) | No | Delegates to backend |

Key architectural differences:

- **VSCode's "Migrate Changes"** is the only tool offering explicit move-uncommitted-to-new-branch as a first-class checkout option (stash → checkout → stash pop in one action).
- **JetBrains' Smart Checkout** uses the IDE's own Shelf mechanism rather than git stash — this means shelved changes are IDE-specific, not visible via `git stash list`.
- **GitHub Desktop's strategy enum** is the only persistent preference for this behavior — other tools prompt every time.
- **Magit's hard error** on branch-create-with-start-point is the strictest approach; for existing branches, it delegates to git's own behavior (which may succeed if files don't overlap).

### D4.4: Delete Branch

**Finding:** Consistent local delete with unmerged-branch protection; remote delete is opt-in across all tools.

**Evidence:** [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md)

| Tool | Local | Remote | Unmerged Protection | Current-Branch |
|------|-------|--------|--------------------|----|
| VSCode | `-d` / `-D` with confirmation | Separate command | Modal confirmation for `-D` | Excluded from picker |
| GitHub Desktop | Always `-D` (force) | Opt-in checkbox (unchecked default) | None (always force) | Auto-switches first |
| lazygit | `-D` after merge check | Separate menu option + "both" option | Checks against HEAD + upstream + main branches | Blocked |
| Magit | `-d` (safe) or `-D` (with `C-u` prefix) | `git push --delete` | Yes (safe by default) | Detach/checkout-upstream/abort menu |
| Zed | `-d` (safe only) | `-dr` for remote-tracking | No force-delete from UI | HEAD branch silently skipped |

**lazygit's merge check** is the most sophisticated — it verifies merge status against HEAD, upstream, and all configured main branches via `git rev-list --max-count=1`. Additionally, it has **worktree-checked-out protection**: branches checked out in another worktree cannot be deleted without first detaching or removing that worktree.

**Magit's current-branch deletion** is the most explicit: interactive menu offering detach-HEAD, checkout-upstream, or abort — rather than silently switching or blocking.

### D4.5: Rename Branch

**Finding:** Available in lazygit (with remote-tracking warning), Magit (`m` in branch transient), and JetBrains. VSCode, GitHub Desktop, and Zed lack branch rename UX.
**Confidence:** CONFIRMED

lazygit warns when renaming a branch with a remote upstream ("this won't rename the remote branch") and pre-fills the current name. Git command: `git branch --move <old> <new>`. No tool automatically renames the remote branch (delete+push pattern).

### D4.6: Stash Management

**Finding:** Stash management depth correlates with tool complexity tier; lazygit has the richest stash operations.

**Evidence:** [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md)

| Tool | Operations | Rename | Staged-Only | View Diff | Auto-Stash Context |
|------|-----------|--------|-------------|-----------|-------------------|
| VSCode | push, pop, apply, drop, dropAll, view | No | Yes (`stashStaged`) | Yes | Pull only |
| GitHub Desktop | push, pop, drop | No | No | Yes (StashDiffViewer) | Checkout strategy |
| lazygit | push, pop, apply, drop, rename, keepIndex, stagedOnly, unstagedOnly | **Yes** (hash→drop→store) | **Yes** (git ≥2.35 or fallback) | Yes | Checkout autostash |
| Magit | both, index, worktree, keepIndex, snapshot, push (selective) | No | Yes | Yes | Pull only |
| Zed | push, pop, apply, drop | No | No | Yes | None |
| JetBrains | Via Shelf (not git stash) | N/A | N/A | N/A | Smart Checkout |

**lazygit's stash rename** (`Hash` → `Drop` → `Store` with new message) is unique — no other tool offers renaming stash entries. **Magit's snapshot** creates auto-named stash entries without removing working-tree changes.

**GitHub Desktop's `!!GitHub_Desktop<branch>` stash tagging** is notable — it tags auto-stashes with a magic string prefix so it can distinguish its own stashes from user-created ones. Only one Desktop stash per branch is tracked in the UI.

### D4.7: Detached HEAD Handling

**Finding:** All tools detect detached HEAD; none offer proactive "create branch to rescue" — the rescue path is always implicit via the branch creation flow.

**Evidence:** [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md)

| Tool | Detection | Visual Indicator | Rescue Flow |
|------|-----------|-----------------|-------------|
| VSCode | `.git/HEAD` content check | `$(git-commit)` icon + 8-char hash in status bar | Implicit: "Create new branch..." always first in picker |
| GitHub Desktop | `TipState.Detached` | Message in create-branch dialog | Forces `StartPoint.Head`; push/pull throw |
| lazygit | `symbolic-ref` failure → `--points-at=HEAD` | Synthetic branch entry at position 0 | None automatic |
| Magit | `symbolic-ref` returns nil | `"(detached)"` in refs buffer; hash in status | Branch transient is natural exit |
| Zed | Via repository layer | Toast errors for git operations | Branch picker accessible |

No tool surveyed implements a proactive "you're in detached HEAD — create a branch to save your work?" dialog. The universal pattern is: detect and display the state, and rely on the user initiating branch creation through normal channels.

### D4.8: Branch Visualization

**Finding:** Ahead/behind is universal in developer tools; divergence-from-base-branch is lazygit-unique; PR status badges exist in lazygit and GitKraken.

| Tool | Ahead/Behind | Where Displayed | Graph View | PR Status |
|------|-------------|-----------------|------------|-----------|
| VSCode | `N↓ M↑` | Status bar (SyncStatusBar) + picker description | No (extension-provided) | No |
| GitHub Desktop | Numeric | Toolbar header + Compare tab (not in picker dropdown) | No | PR list (separate view) |
| lazygit | `✓ / ↓N↑M / ↓N / ↑N / ? / UpstreamGone` | Per-branch in panel + base-branch divergence column | `git log --graph` | Colored dot per branch |
| Magit | `>N <N` | Refs buffer | Log graph | Via Forge |
| Zed | Data available (`UpstreamTrackingStatus`) | Not surfaced in branch picker UI | No | No |
| JetBrains | Numeric | Branch popup + status widget | Log tab graph | Via GitHub/GitLab plugin |
| GitKraken | Visual in graph | Branch labels on commit graph | Full graph (core feature) | Via integration |

**lazygit's base-branch divergence** (`ShowDivergenceFromBaseBranch`) is unique — it concurrently computes `git rev-list --left-right --count` for every branch against configured main branches, showing how far each feature branch has drifted from main. The computation runs in an `errgroup` with `atomic.Int32` per branch for lock-free concurrent updates.

### D4.9: Worktree UX

**Finding:** Worktree support is emerging across the ecosystem; lazygit and Magit have the most complete implementations.

**Evidence:** [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md)

| Tool | Worktree Support | Features |
|------|-----------------|----------|
| lazygit | **Full panel** | Create (from ref / detached), switch session, remove, open in editor; branch-worktree collision detection; linked-worktree badge |
| Magit | **Integrated in branch transient** | Create, move, delete (trash/permanent), status per worktree; `w`/`W` keys |
| Zed | **Dedicated picker** | Create (configurable base directory), auto-trust, open in new window; `git worktree list --porcelain` |
| Fork | **Dialog** (since 2.63) | Create Worktree dialog |
| VSCode | None | — |
| GitHub Desktop | None | — |
| JetBrains | Partial | Via terminal or plugin |
| GitKraken | None | — |
| Obsidian-Git | None | — |

**lazygit's branch-worktree collision detection** is the most safety-conscious pattern: attempting to checkout a branch that's checked out in another worktree prompts to switch to that worktree instead, preventing the `fatal: 'X' is already checked out at 'Y'` error from surfacing.

---

### D5.1: Credential Persistence Architecture

**Finding:** Three-tier model: OS keychain (primary for all desktop tools), GCM as intermediary, and editor-internal stores for non-developer tools.

**Evidence:** [evidence/credential-architecture.md](evidence/credential-architecture.md), [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md), [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md)

| Tool | Storage Layer | Mechanism |
|------|--------------|-----------|
| VSCode | OS keychain | `ExtensionContext.secrets` → macOS Keychain / Windows Credential Manager / libsecret |
| GitHub Desktop | OS keychain | `keytar` npm package → same backends |
| lazygit | Delegates to git | No own storage; relies on configured `credential.helper` |
| Magit | Emacs auth-source | `~/.authinfo.gpg` (GPG-encrypted) |
| Zed | OS keychain | `CredentialsProvider` trait → macOS/Windows keychain, libsecret (Linux) |
| JetBrains | PasswordSafe | → macOS Keychain / Gnome Keyring / KeePass DB (configurable) |
| GitKraken | Internal store | Not publicly documented; "Forget All" only reset |
| Fork | GCM (Windows) / osxkeychain (macOS) | Injects `credential.helper=manager-core` on Windows |
| Obsidian-Git | Browser localStorage | **Unencrypted**, plugin-namespaced; no keychain |

**GCM's `ICredentialStore` abstraction** is the most complete: four methods (`Get`, `GetAccounts`, `AddOrUpdate`, `Remove`) implemented by eight backends. Service key format: normalized URI without userinfo (e.g., `git:https://github.com`). Platform-specific: macOS uses legacy `SecKeychainFindGenericPassword` P/Invoke (not modern SecItem API); Windows uses WinCred (fails over SSH sessions → DPAPI fallback); Linux uses libsecret/SecretService (requires D-Bus daemon — silently fails in containers).

### D5.2: Token Refresh

**Finding:** GitHub OAuth tokens don't expire — no refresh flow exercised anywhere. Token refresh is a GitLab-specific concern.

**Evidence:** [evidence/credential-architecture.md](evidence/credential-architecture.md)

| Tool | Refresh Pattern |
|------|----------------|
| VSCode | Load-time scrub: startup `getUserInfo(token)` → 401 → discard session |
| GitHub Desktop | None; re-auth triggered by git operation failure |
| GCM (GitHub) | No refresh (GitHub tokens don't expire) |
| GCM (GitLab) | Proactive: polls token info endpoint, stores refresh token under `"oauth-refresh-token."` prefix |
| JetBrains | Via hosted provider re-auth |
| Obsidian-Git | Manual re-entry on `onAuthFailure` |

The universal pattern for GitHub is: tokens are valid until revoked. Expiry detection happens passively — when a git operation fails with 401, the editor surfaces a re-auth flow. No tool implements proactive GitHub token health checks.

### D5.3: Multi-Account Support

**Finding:** Multi-account is structurally limited by git's credential protocol — `username@host` URL embedding is required for disambiguation.

**Evidence:** [evidence/credential-architecture.md](evidence/credential-architecture.md), [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md)

| Tool | Multi-Account Model |
|------|-------------------|
| VSCode | Multiple sessions per auth provider (`supportsMultipleAccounts: true`) |
| GitHub Desktop | One account per endpoint (GitHub.com + N GHE instances) |
| lazygit | Delegates to git (credential.useHttpPath for path-level scoping) |
| JetBrains | Multiple accounts in Settings; one default per project |
| GitKraken | Profile-per-account (Pro plan); one account per profile |
| Fork | Multiple accounts per service (since 1.0.55) |
| Obsidian-Git | No multi-account (one credential set per vault) |
| gh CLI | One active user per hostname; `gh auth switch` between accounts |

git's credential protocol has no native user concept — without `username` in the URL, the first matching credential wins. GCM mitigates this with configurable namespace prefixes and `credential.useHttpPath=true` for per-repo scoping.

### D5.4: SSH vs HTTPS

**Finding:** HTTPS is the default for most tools; SSH support varies by platform capability.

| Tool | Default | SSH Support | Key Management |
|------|---------|-------------|----------------|
| VSCode | HTTPS | Yes (askpass handles passphrase + host verification) | Delegates to system SSH |
| GitHub Desktop | HTTPS | Yes (keytar stores passphrases) | Optimistic-write: persist on success, delete on failure |
| lazygit | Per-remote | Yes (`GIT_TERMINAL_PROMPT=0` prevents hangs) | Delegates to system SSH |
| Magit | Per-remote | Yes (process filter handles passphrase prompts) | Delegates to ssh-agent |
| Zed | Per-remote | Yes (askpass modal) | Delegates to system SSH |
| GitKraken | HTTPS | Yes (own key manager + auto-upload to hosting service) | Generates/manages keys; does NOT read `.ssh/config` |
| Obsidian-Git | HTTPS (mobile: HTTPS only) | Desktop only (via system git) | Delegates to system SSH |

### D5.5: Credential Failure Surface

**Finding:** Two patterns for credential failure UX: catch-and-prompt (most tools) and silent-fallback-chain (JetBrains, GCM).

| Tool | Failure Pattern |
|------|----------------|
| VSCode | Push error handler: `PermissionDenied` → "Create Fork" modal; auth failures via askpass callback chain |
| GitHub Desktop | `AuthenticationErrors` set → route to sign-in flow (GitHub) or username/password dialog (generic) |
| lazygit | Toast notification from git stderr |
| JetBrains | Silent provider chain: PasswordSafe → silent hosted → dialog. Failed account ignored for session |
| Zed | Askpass modal with re-prompt; toast on failure |
| Obsidian-Git | `onAuthFailure` callback → sequential username then password modals |

**JetBrains' `HostedGitAuthenticationFailureManager`** is unique — it tracks which accounts failed during the current session and skips them in subsequent silent-auth attempts, preventing repeated failures from blocking git operations.

### D5.6: Host-Specific Auth

**Finding:** Multi-forge support varies from none (Obsidian-Git) to nine hosting providers (Zed).

| Tool | Hosting Providers |
|------|------------------|
| VSCode | GitHub.com + GHE (via extensions) |
| GitHub Desktop | GitHub.com + GHE |
| Zed | **9 providers:** GitHub, GitLab, Bitbucket, Azure, Gitea, Forgejo, Gitee, Chromium, SourceHut |
| JetBrains | GitHub, GitLab, Bitbucket, Azure (via plugins) |
| GCM | GitHub, GitLab, Bitbucket, Azure DevOps (built-in host providers with static + HTTP probe matching) |
| Magit | GitHub, GitLab, Gitea, SourceHut, Bitbucket (via Forge package) |

### D5.7: 2FA / Device Flow

**Finding:** Most tools delegate 2FA to the browser OAuth flow; no tool handles interactive 2FA prompts inline.

| Tool | 2FA Handling |
|------|-------------|
| VSCode | Transparent via GitHub OAuth web flow |
| GitHub Desktop | Browser OAuth redirect (no device flow); 2FA handled by GitHub in browser |
| GCM | Device flow for GitHub (browser-based); MSAL for Azure |
| gh CLI | Device flow (`gh auth login`) or browser OAuth |

### D5.8: Credential Helpers — Editor Injection Points

**Finding:** `GIT_ASKPASS` is the universal editor injection point; Magit is the only tool using process filter interception instead.

**Evidence:** [evidence/credential-architecture.md](evidence/credential-architecture.md), [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md), [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md)

| Tool | Injection Mechanism | Details |
|------|-------------------|---------|
| VSCode | `GIT_ASKPASS` + `SSH_ASKPASS` | IPC back to VSCode; checks CredentialsProviders first, falls back to password input box |
| Zed | `GIT_ASKPASS` + `SSH_ASKPASS` | Unix socket IPC; temp `askpass.sh` script; `zeroize` crate for memory safety |
| JetBrains | Custom `GIT_ASKPASS` sidecar (`GitAskPassApp`) | UUID-registered handler; routes to provider chain |
| GitHub Desktop | `GIT_ASKPASS` via trampoline | Routes through Electron main process to AccountsStore |
| Magit | **Process filter** (not GIT_ASKPASS) | Regex-matches git subprocess stdout; dispatches to `read-passwd` in minibuffer |
| Fork | GCM injection (Windows) | `GIT_CONFIG_PARAMETERS='credential.helper=manager-core'` |
| lazygit | None (delegates to git) | `GIT_TERMINAL_PROMPT=0` prevents hangs; relies on configured credential helper |

**gh CLI as credential helper:** `credential.helper='!gh auth git-credential'` — the `!` prefix runs it as a shell snippet. Token lookup order: `GH_TOKEN`/`GITHUB_TOKEN` env → OS keyring (`"gh:"+hostname`, 3-second timeout) → `hosts.yml` fallback.

**git-credential-cache:** Socket-based daemon, 900-second default timeout, in-memory only. `git-credential-store`: plaintext `~/.git-credentials` (warns on world-readable permissions).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D4.5 Rename branch:** Only lazygit and Magit offer rename UX. No tool automates remote rename (delete+push pattern). The remote-rename gap is not a missing feature in any tool — it reflects git's own lack of atomic remote rename.
- **D5.7 2FA / passkey / device flow:** Most tools delegate entirely to browser OAuth, making inline 2FA handling moot. Passkey support for git operations was not found in any surveyed tool.

### Out of Scope (per Rubric)

- Clone/initial init UX
- OAuth at clone time
- CRDT-specific branching internals
- Git library selection criteria
- Draft-isolation-as-worktree for AI agents

---

## References

### Evidence Files

- [evidence/vscode-branch-auth.md](evidence/vscode-branch-auth.md) — VSCode source-level: branch picker, create, switch, stash, detached HEAD, auth
- [evidence/github-desktop-branch-auth.md](evidence/github-desktop-branch-auth.md) — GitHub Desktop source-level: branch sections, strategy enum, keytar, trampoline
- [evidence/lazygit-branch-stash-worktree.md](evidence/lazygit-branch-stash-worktree.md) — lazygit source-level: panel, autostash, worktree, merge check, stash ops
- [evidence/magit-zed-branch-auth.md](evidence/magit-zed-branch-auth.md) — Magit + Zed source-level: transient, spinoff, process filter, askpass IPC
- [evidence/credential-architecture.md](evidence/credential-architecture.md) — GCM, git native protocol, gh CLI bridge
- [evidence/nondev-wrappers-jetbrains.md](evidence/nondev-wrappers-jetbrains.md) — Obsidian-Git, isomorphic-git, GitKraken, Fork, JetBrains

### External Sources

- [microsoft/vscode](https://github.com/microsoft/vscode) — `extensions/git/src/`, `extensions/github-authentication/src/`
- [desktop/desktop](https://github.com/desktop/desktop) — `app/src/lib/stores/`, `app/src/lib/git/`
- [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) — `pkg/commands/git_commands/`, `pkg/gui/controllers/`
- [magit/magit](https://github.com/magit/magit) — `lisp/magit-branch.el`, `lisp/magit-stash.el`, `lisp/magit-process.el`
- [zed-industries/zed](https://github.com/zed-industries/zed) — `crates/git_ui/`, `crates/askpass/`, `crates/git/`
- [git-ecosystem/git-credential-manager](https://github.com/git-ecosystem/git-credential-manager) — `src/shared/Core/`
- [cli/cli](https://github.com/cli/cli) — `pkg/cmd/auth/gitcredential/helper.go`
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) — `src/commands.ts`, `src/gitManager/`
- [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) — `src/managers/GitRemoteHTTP.js`
- [GitKraken Branching and Merging docs](https://help.gitkraken.com/gitkraken-desktop/branching-and-merging/)
- [GitKraken Authentication docs](https://help.gitkraken.com/gitkraken-desktop/authentication/)
- [Fork release notes](https://fork.dev/releasenotes)
- [JetBrains Manage Branches docs](https://www.jetbrains.com/help/idea/manage-branches.html)
- [JetBrains Tasks docs](https://www.jetbrains.com/help/idea/managing-tasks-and-context.html)
- [git-scm.com/docs/gitcredentials](https://git-scm.com/docs/gitcredentials) — git native credential protocol
- [isomorphic-git authentication docs](https://isomorphic-git.org/docs/en/authentication)
