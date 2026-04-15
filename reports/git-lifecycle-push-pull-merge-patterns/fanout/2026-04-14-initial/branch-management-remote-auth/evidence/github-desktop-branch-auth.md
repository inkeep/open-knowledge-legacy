# Evidence: GitHub Desktop — Branch Management & Auth Persistence

**Dimension:** D4 (Branch management) + D5 (Remote/auth persistence)
**Date:** 2026-04-14
**Sources:** desktop/desktop (GitHub) — `app/src/ui/branches/`, `app/src/lib/stores/`, `app/src/lib/git/`

---

## Key files referenced

- `app/src/ui/branches/group-branches.ts` — Branch list sectioning
- `app/src/ui/branches/branch-list.tsx` — Branch list component
- `app/src/ui/create-branch/create-branch-dialog.tsx` — Create branch dialog
- `app/src/lib/create-branch.ts` — Branch creation logic
- `app/src/lib/sanitize-ref-name.ts` — Name validation
- `app/src/lib/stores/app-store.ts` — `_checkoutBranch` dirty-tree handling
- `app/src/models/uncommitted-changes-strategy.ts` — Strategy enum
- `app/src/ui/stashing/stash-and-switch-branch-dialog.tsx` — Stash/switch dialog
- `app/src/lib/git/stash.ts` — Stash operations, `!!GitHub_Desktop` tagging
- `app/src/lib/stores/accounts-store.ts` — Account persistence
- `app/src/lib/stores/token-store.ts` — keytar OS keychain wrapper
- `app/src/lib/trampoline/trampoline-credential-helper.ts` — GIT_ASKPASS trampoline
- `app/src/lib/stores/sign-in-store.ts` — OAuth browser flow

---

## Findings

### D4.1: Branch Picker UX

**Finding:** Three-section branch list with fuzzy search; no separate remote tab.
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/branches/group-branches.ts`

Sections: `'default'` (repo default branch), `'recent'` (5 recently-checked-out from reflog), `'other'` (remaining local). Remote branches with local tracking are folded into the local list via `mergeRemoteAndLocalBranches`. Pure remote-only branches are excluded from the dropdown.

Fuzzy search via `SectionFilterList` with `IMatches` across all sections. Recent branches from reflog: `git log -g --no-abbrev-commit --pretty=oneline HEAD -n 2500`.

### D4.2: Create Branch

**Finding:** StartPoint enum with four options; name validation uses client regex + GitHub API ruleset check.
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/create-branch/create-branch-dialog.tsx`, `app/src/lib/sanitize-ref-name.ts`

```typescript
export enum StartPoint {
  CurrentBranch, DefaultBranch, Head, UpstreamDefaultBranch
}
```

Client-side: regex strips control chars, `~`, `^`, `:`, `?`, `*`, `[`, `\\`, `""`, `<>`. Replaces with `-`.
GitHub API: `checkBranchNameRules()` calls `fetchRepoRulesForBranch` to check `creation` and `branchNamePattern` rulesets. Bypassable rulesets → warning; non-bypassable → hard error.

### D4.3: Switch with Dirty Tree

**Finding:** Configurable strategy enum persisted in localStorage; default is AskForConfirmation.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/stores/app-store.ts:~4101`, `app/src/models/uncommitted-changes-strategy.ts`

```typescript
export enum UncommittedChangesStrategy {
  AskForConfirmation,    // default — shows StashAndSwitchBranch dialog
  StashOnCurrentBranch,  // auto-stash (warns on existing stash overwrite)
  MoveToNewBranch,       // carry uncommitted to target
}
```

Dialog options: "Leave my changes on `<current>`" (stash) or "Bring my changes to `<target>`" (move).
Detached HEAD / unborn / protected branch → forces `MoveToNewBranch`.

### D4.4: Delete Branch

**Finding:** Always force-delete local (`-D`); remote delete opt-in via checkbox.
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/delete-branch/delete-branch-dialog.tsx`, `app/src/lib/git/branch.ts`

- Local: `git branch -D` always (no soft `-d`)
- Remote: `git push <remote> :<branch>` — checkbox "delete on remote" shown only when upstream exists, unchecked by default
- If deleting current branch: auto-switches to default/recent branch first

### D4.5: Stash Management

**Finding:** Desktop tags its own stashes with `!!GitHub_Desktop<branch>` magic string; one stash per branch.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/git/stash.ts`

Reads stashes from reflog (`git log -g refs/stash`), filters for the `!!GitHub_Desktop<branch>` marker. Only one Desktop stash per branch surfaced in UI. User can restore or discard from the `StashDiffViewer`.

### D4.7: Detached HEAD

**Finding:** Allowed but crippled — push/pull throw errors; create-branch dialog bases on HEAD SHA.
**Confidence:** CONFIRMED
**Evidence:** `app/src/ui/create-branch/create-branch-dialog.tsx`

When `tip.kind === TipState.Detached`: renders message about HEAD reference being detached, forces `StartPoint.Head`, shows 7-char SHA. On branch switch with detached HEAD, forces `UncommittedChangesStrategy.MoveToNewBranch`.

### D5.1: Credential Persistence — Two-Tier Storage

**Finding:** Non-secret account data in localStorage (tokens stripped); tokens in OS keychain via keytar.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/stores/accounts-store.ts`, `app/src/lib/stores/token-store.ts`

```typescript
// Tokens stripped before localStorage write
const usersWithoutTokens = this.accounts.map(account => account.withToken(''))
this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
```

Keychain key: `"GitHub - https://api.github.com"` (dev: `"GitHub Desktop Dev - ..."`).
keytar wraps: macOS Keychain, Windows Credential Manager, Linux libsecret/gnome-keyring.

### D5.2: Token Refresh

**Finding:** No proactive token rotation. Token validity implicitly checked on git push/pull.
**Confidence:** CONFIRMED

`AccountsStore.refresh()` re-fetches user profile (avatar, emails) but does not rotate or refresh tokens. GitHub OAuth tokens don't expire by default.

### D5.3: Multi-Account

**Finding:** One account per endpoint; GitHub.com sorted before GHE instances.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/stores/accounts-store.ts`

Multiple endpoints supported (GitHub.com + N GHE instances). `findGitHubTrampolineAccount(store, endpoint)` maps remotes to accounts for git operations.

### D5.4: SSH vs HTTPS

**Finding:** Default is HTTPS. SSH passphrases stored via keytar with optimistic-write pattern.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/ssh/ssh-credential-storage.ts`

SSH passphrases kept in memory during operation, persisted to keychain only on success, deleted on auth failure. Keyed as `"GitHub Desktop - <name>"`.

### D5.7: OAuth Flow

**Finding:** Browser OAuth redirect flow exclusively; no device flow.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/stores/sign-in-store.ts`

```typescript
shell.openExternal(getOAuthAuthorizationURL(endpoint, csrfToken))
```

Custom URL scheme callback. CSRF state token (`crypto.randomUUID()`) validated on return. `ExistingAccountWarning` step prompts before overwriting existing endpoint account.

### D5.8: Credential Helper — Trampoline

**Finding:** dugite-based git operations use a GIT_ASKPASS trampoline to route credentials through Electron main process.
**Confidence:** CONFIRMED
**Evidence:** `app/src/lib/trampoline/trampoline-credential-helper.ts`

`GIT_TERMINAL_PROMPT=0` set globally. Trampoline intercepts credential requests, routes to `AccountsStore` for GitHub hosts, falls back to username/password dialog for non-GitHub hosts. Each operation gets a unique `trampolineToken` for lifecycle tracking.
