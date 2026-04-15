# Evidence: D5 Remote/Auth Persistence

**Dimension:** D5 — Credential storage, token refresh, multi-account, SSH/HTTPS, injection points
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GCM, gh CLI, Obsidian-Git, isomorphic-git (source-level + docs)

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/github-authentication/src/common/keychain.ts` — `ExtensionContext.secrets` token storage
- `microsoft/vscode` `extensions/github-authentication/src/github.ts` (lines 184, 255-333) — startup scrub, session management
- `microsoft/vscode` `extensions/git/src/askpass.ts` (line 67) — `GIT_ASKPASS` + `SSH_ASKPASS` IPC
- `desktop/desktop` `app/src/lib/stores/accounts-store.ts` — tokens stripped from localStorage
- `desktop/desktop` `app/src/lib/stores/token-store.ts` — keytar OS keychain
- `desktop/desktop` `app/src/lib/trampoline/trampoline-credential-helper.ts` — credential trampoline
- `desktop/desktop` `app/src/ui/dispatcher/error-handlers.ts` — SAML SSO, secret scanning
- `magit/magit` `lisp/magit-process.el` (lines 1314-1338) — process filter credential interception
- `zed-industries/zed` `crates/askpass/src/askpass.rs` — Unix socket IPC, `zeroize` crate
- `zed-industries/zed` `crates/credentials_provider/src/credentials_provider.rs` — 9 hosting providers
- `JetBrains/intellij-community` `src/git4idea/commands/GitHttpGuiAuthenticator.java` — 3-provider chain
- `JetBrains/intellij-community` `src/git4idea/commands/SilentHostedGitHttpAuthDataProvider.kt` — silent auth
- `git-ecosystem/git-credential-manager` `src/shared/Core/ICredentialStore.cs` — 4-method interface
- `git-ecosystem/git-credential-manager` `src/shared/Core/HostProviderRegistry.cs` — static + HTTP probe matching
- `cli/cli` `pkg/cmd/auth/gitcredential/helper.go` — `store`/`erase` are intentional no-ops
- `cli/cli` `internal/keyring/keyring.go` — 3-second timeout, `"gh:"+hostname` key
- `Vinzent03/obsidian-git` `src/setting/localStorageSettings.ts` — unencrypted localStorage

---

## Findings

### Finding: GCM ICredentialStore is a four-method interface with eight backends
**Confidence:** CONFIRMED
**Evidence:** `git-ecosystem/git-credential-manager` `src/shared/Core/ICredentialStore.cs`

```csharp
public interface ICredentialStore {
    IList<string> GetAccounts(string service);
    ICredential Get(string service, string account);
    void AddOrUpdate(string service, string account, string secret);
    bool Remove(string service, string account);
}
```

Backends: macOS SecKeychain (legacy P/Invoke), Windows WinCred (DPAPI fallback for SSH sessions), Linux libsecret/SecretService (requires D-Bus), plaintext store, credential cache daemon, GPG-backed, plus internal.

### Finding: GitHub OAuth tokens don't expire — no refresh path exercised
**Confidence:** CONFIRMED
**Evidence:** GCM source, VS Code `github.ts:255-333`

VS Code startup scrub: `getUserInfo(token)` → 401 → discard session. GCM GitHub provider has no refresh code. GitLab has proactive refresh with `"oauth-refresh-token."` key prefix.

### Finding: GIT_ASKPASS is the universal editor injection point
**Confidence:** CONFIRMED
**Evidence:** VS Code `askpass.ts:67`, Zed `askpass.rs`, JetBrains `GitAskPassApp`, GitHub Desktop trampoline

All GUI clients except Magit use `GIT_ASKPASS`. Magit uses Emacs process filter interception via regex matching on subprocess stdout (`magit-process.el:1314-1338`).

### Finding: gh CLI store/erase are intentional no-ops
**Confidence:** CONFIRMED
**Evidence:** `cli/cli` `pkg/cmd/auth/gitcredential/helper.go`

```go
if opts.Operation == "store" { return nil }  // no-op
if opts.Operation == "erase" { return nil }  // no-op
```

Token lookup order: `GH_TOKEN`/`GITHUB_TOKEN` env → OS keyring (`"gh:"+hostname`, 3s timeout) → `hosts.yml` fallback.

### Finding: Obsidian-Git stores credentials in unencrypted browser localStorage
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/setting/localStorageSettings.ts`, `src/gitManager/isomorphicGit.ts`

Plugin-namespaced localStorage keys. No keychain integration. `onAuthSuccess` callback exists but is not used.

### Finding: Multi-account is structurally limited by git's credential protocol
**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/gitcredentials](https://git-scm.com/docs/gitcredentials)

Protocol: `protocol=https\nhost=example.com\n\n`. No native user concept. Without `username` in URL, first matching credential wins.

---

## Negative searches

- Searched for passkey support in git operations: not found in any surveyed tool
- Searched for inline 2FA handling: all tools delegate to browser OAuth flow
