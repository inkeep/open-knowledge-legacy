# Evidence: Credential Architecture — GCM, git Native, gh CLI

**Dimension:** D5 (Remote/auth persistence)
**Date:** 2026-04-14
**Sources:** git-ecosystem/git-credential-manager, git/git (docs + credential.c), cli/cli

---

## Key files referenced

**GCM:**
- `src/shared/Core/ICredentialStore.cs` — Credential store interface
- `src/shared/Core/Interop/MacOS/Native/SecurityFramework.cs` — SecKeychain P/Invoke
- `src/shared/Core/Interop/Windows/WindowsCredentialManager.cs` — WinCred CRUD
- `src/shared/Core/Interop/Windows/DpapiCredentialStore.cs` — DPAPI encrypted file
- `src/shared/Core/Interop/Linux/SecretServiceCollection.cs` — libsecret D-Bus
- `src/shared/Core/HostProvider.cs` — Service key derivation
- `src/shared/Core/HostProviderRegistry.cs` — Provider selection (static + HTTP probe)

**git/git:**
- `credential.c` — Core credential machinery
- `Documentation/gitcredentials.txt` — Credential helper protocol
- `Documentation/git-credential-cache.txt` — Cache daemon
- `Documentation/git-credential-store.txt` — Plaintext store

**gh CLI:**
- `pkg/cmd/auth/gitcredential/helper.go` — `gh auth git-credential` implementation
- `internal/config/config.go` — ActiveToken, keyring vs file fallback
- `internal/keyring/keyring.go` — go-keyring wrapper with 3s timeout

---

## Findings

### D5.1: GCM — Credential Store Abstraction

**Finding:** `ICredentialStore` is a four-method interface with eight swappable backends.
**Confidence:** CONFIRMED
**Evidence:** `src/shared/Core/ICredentialStore.cs`

```csharp
public interface ICredentialStore {
    IList<string> GetAccounts(string service);
    ICredential Get(string service, string account);
    void AddOrUpdate(string service, string account, string secret);
    bool Remove(string service, string account);
}
```

Backends: macOS Keychain, Windows Credential Manager, Windows DPAPI, Linux libsecret/SecretService, GPG/pass, plaintext file, credential-cache, and in-memory.

Service key format: normalized URI without userinfo, trailing slashes trimmed. Default: `https://github.com` (path stripped unless `credential.useHttpPath=true`).

### D5.1: Platform-Specific Stores

**Finding:** macOS uses legacy SecKeychain APIs via P/Invoke; Windows uses WinCred; Linux uses libsecret (no default).
**Confidence:** CONFIRMED
**Evidence:** GCM Interop/* source files

- **macOS**: `SecKeychainFindGenericPassword` / `SecKeychainAddGenericPassword` (legacy, not SecItem API). Service name: `"git:https://github.com"` (configurable namespace prefix). Generic passwords (not internet passwords).
- **Windows**: WinCred target name: `[namespace:]scheme://[account@]host[:port][path]`. Explicitly fails over SSH sessions → DPAPI store is the fix.
- **Linux**: libsecret via `SecretServiceCollection` (D-Bus). Schema: `org.freedesktop.Secret.Generic`. **No default store** — containers/CI with no D-Bus silently fail.
- **DPAPI** (Windows fallback): Encrypted file store using `ProtectedData.Protect`/`Unprotect`. For SSH/headless sessions where WinCred isn't available.
- **Plaintext**: `~/.gcm/store` — cross-platform last resort.

### D5.2: Token Refresh

**Finding:** GitHub OAuth App tokens don't expire — no refresh path exercised. GitLab has proactive refresh.
**Confidence:** CONFIRMED
**Evidence:** GCM provider source files

- **GitHub**: OAuth tokens (`gho_` prefix) don't expire. No refresh flow.
- **GitLab**: Polls token info endpoint; stores refresh token under `"oauth-refresh-token."` prefix key; proactive refresh before expiry.
- **Azure DevOps**: MSAL-based with managed identity support (confirmed from config docs).

### D5.3: Multi-Account

**Finding:** Multi-account requires `username@host` URL embedding or `credential.useHttpPath=true`.
**Confidence:** CONFIRMED
**Evidence:** `credential.c` (git/git), GCM source

git has no native user concept for auth. Without username in URL, first matching credential wins. `credential.useHttpPath=true` adds path-level scoping (per-repo credentials).

GCM provider selection: static hostname matching → HTTP probe (cached) → fallback generic. GitHub provider claims `github.com`, `*.ghe.com`.

### D5.5: git Native Credential Protocol

**Finding:** Key=value on stdin/stdout, blank-line terminated; three operations (get/store/erase); helpers chain until both username and password filled.
**Confidence:** CONFIRMED
**Evidence:** `gitcredentials` man page, `credential.c`

```
protocol=https\nhost=example.com\n\n  → helper → protocol=https\nhost=example.com\nusername=X\npassword=Y\n\n
```

Helper string rules: `!` prefix → shell snippet; absolute path → verbatim; otherwise `git credential-` prepended.

Extended attributes (git 2.44+): `password_expiry_utc`, `oauth_refresh_token`, `authtype=Bearer`, `credential=<token>`, `ephemeral=1`.

### D5.7: GIT_ASKPASS Injection

**Finding:** `GIT_ASKPASS` is the editor injection point for credential UI; invoked only when all helpers return nothing.
**Confidence:** CONFIRMED
**Evidence:** `gitcredentials` man page, `credential.c`

Precedence: `GIT_ASKPASS` env → `core.askPass` config → `SSH_ASKPASS` env → terminal prompt. Editors (VSCode, Zed, JetBrains) inject themselves via `GIT_ASKPASS` to intercept credential prompts with native UI.

### D5.8: gh CLI — Read-Only Credential Bridge

**Finding:** `gh auth git-credential` implements only `get`; `store` and `erase` are intentional no-ops.
**Confidence:** CONFIRMED
**Evidence:** `pkg/cmd/auth/gitcredential/helper.go`

```go
if opts.Operation == "store" { return nil }  // no-op
if opts.Operation == "erase" { return nil }  // no-op
```

Token lookup order: `GH_TOKEN`/`GITHUB_TOKEN` env → OS keyring (`"gh:"+hostname`, 3s timeout) → `hosts.yml` fallback.

Only HTTPS supported (`protocol != "https"` → `SilentError`).

`gist.github.com` fallback: strips `gist.` prefix and retries lookup against base hostname.

### D5.8: git-credential-cache

**Finding:** Socket-based daemon with configurable timeout; in-memory only.
**Confidence:** CONFIRMED
**Evidence:** `git-credential-cache` man page

`git credential-cache--daemon` listens on Unix socket (`~/.cache/git/credential/socket`). Default timeout: 900 seconds (15 min). `git credential-cache exit` terminates daemon. No persistence — credentials lost on daemon exit/timeout.

### D5.8: git-credential-store

**Finding:** Plaintext storage in `~/.git-credentials` with permission check.
**Confidence:** CONFIRMED
**Evidence:** `git-credential-store` man page

Format: `https://user:pass@host\n` per line. File permissions checked on read (warns if world-readable). Simplest credential persistence — no encryption, no OS keychain integration.
