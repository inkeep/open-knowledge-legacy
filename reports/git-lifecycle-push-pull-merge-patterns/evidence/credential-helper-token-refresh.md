# Evidence: Credential Helper Token Refresh Strategy

**Dimension:** D5 (extended) — Git credential protocol extensions for token refresh, implementation patterns, per-forge behavior, and scoping considerations
**Date:** 2026-04-15
**Sources:** git/git source (credential.c, credential.h, http.c, Documentation/git-credential.adoc), git-ecosystem/git-credential-manager source (GitLabHostProvider.cs, BitbucketHostProvider.cs, AzureReposHostProvider.cs, GenericHostProvider.cs, ICredentialStore.cs), hickford/git-credential-oauth source (main.go), GitHub/GitLab/Bitbucket/Azure DevOps/Gitea/Forgejo official docs

---

## Key files / pages referenced

- git/git `credential.c` lines 48-52, 512-531, 553, 578 — `credential_fill()`, `credential_clear_secrets()`, `credential_approve()`, `credential_reject()`
- git/git `http.c` lines 1881-1898, 2362-2405 — HTTP 401 handling, retry loop
- git/git `Documentation/git-credential.adoc` lines 158-168, 186-265 — protocol extension specs
- [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059) — credential protocol enhancement tracking
- [GCM PR #1464](https://github.com/git-ecosystem/git-credential-manager/pull/1464) — store PasswordExpiry + OAuthRefreshToken (open since Nov 2023)
- [GCM Issue #789](https://github.com/git-ecosystem/git-credential-manager/issues/789) — refresh tokens for GitHub (blocked-external-dependency)
- hickford/git-credential-oauth `main.go` lines 298-306, 335-366 — refresh exchange, protocol output
- [hickford/git-credential-oauth Issue #20](https://github.com/hickford/git-credential-oauth/issues/20) — storage helper support matrix
- [GitHub Docs — Token Expiration and Revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [GitHub Docs — Refreshing User Access Tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [GitLab OAuth2 API docs](https://docs.gitlab.com/api/oauth2/)
- [GitLab Doorkeeper config](https://gitlab.com/gitlab-org/gitlab/blob/master/config/initializers/doorkeeper.rb) — `access_token_expires_in 7200`
- [Bitbucket Cloud OAuth 2.0 docs](https://developer.atlassian.com/cloud/bitbucket/oauth-2/)
- [Azure DevOps OAuth deprecation announcement](https://devblogs.microsoft.com/devops/no-new-azure-devops-oauth-apps/)
- [Gitea OAuth2 Provider docs](https://docs.gitea.com/development/oauth2-provider)
- [Forgejo OAuth2 Provider docs](https://forgejo.org/docs/next/user/oauth2-provider/)
- [GitHub Blog — Highlights from Git 2.46](https://github.blog/open-source/git/highlights-from-git-2-46/)
- [Git 2.40 release notes](https://raw.githubusercontent.com/git/git/master/Documentation/RelNotes/2.40.0.txt) — `password_expiry_utc` introduction
- [Git 2.41 release notes](https://raw.githubusercontent.com/git/git/master/Documentation/RelNotes/2.41.0.txt) — `oauth_refresh_token` introduction

---

## Findings

### Finding: Git's credential protocol extensions enable helper-driven refresh without Git performing OAuth logic itself
**Confidence:** CONFIRMED
**Evidence:** git/git `credential.c` lines 48-52, 512-531; `Documentation/git-credential.adoc` lines 158-168

Git 2.40 added `password_expiry_utc` (commit `d208bfdfe` by M Hickford). Git 2.41 added `oauth_refresh_token` (commit `a5c76569e` by M Hickford). The design is:

1. **`password_expiry_utc`** — checked during `credential_fill()` only (not proactively before operations). When a helper returns an expired password (`password_expiry_utc < time(NULL)`), Git calls `credential_clear_secrets()` which frees `password` and `credential` but **preserves `oauth_refresh_token` and `username`**. The loop then continues to the next helper in the chain.

2. **`oauth_refresh_token`** — pure pass-through. Git docs state: "Git itself has no special behaviour for this attribute." On `store`, the refresh token is passed to storage helpers. On `get`, stored refresh tokens are forwarded to subsequent helpers. On `erase`, the refresh token is freed and the erase command is sent to helpers.

3. **Intended chaining pattern** (from M Hickford's commit message):
```
[credential]
    helper = storage    # eg. cache or osxkeychain
    helper = oauth      # eg. git-credential-oauth
```
Storage helper returns expired access token + refresh token → Git detects expiry, clears password, keeps refresh token → OAuth helper receives refresh token, calls token endpoint, returns fresh credentials.

**Implications:** Git never performs OAuth refresh itself. A credential helper that wants to support refresh must implement the token endpoint exchange. The protocol's design (preserving refresh tokens when clearing expired passwords) specifically enables chained helper architectures where one helper stores and another generates.

---

### Finding: Storage helper support for protocol extensions varies widely by platform and Git version
**Confidence:** CONFIRMED
**Evidence:** [hickford/git-credential-oauth#20](https://github.com/hickford/git-credential-oauth/issues/20)

| Storage Helper | `password_expiry_utc` | `oauth_refresh_token` |
|---|---|---|
| credential-cache (in-memory daemon) | Git 2.40 | Git 2.41 |
| credential-store (plaintext `~/.git-credentials`) | **Never** | **Never** |
| wincred (Windows Credential Manager) | Git 2.41 | Git 2.44 |
| libsecret (Linux GNOME Keyring / KDE Wallet) | Git 2.43 | Git 2.43 |
| osxkeychain (macOS Keychain) | Git 2.45 | Git 2.45 |

**Implications:** The macOS default helper (osxkeychain) requires Git 2.45 for both fields. Without storage helper support, refresh tokens cannot be persisted between sessions, forcing a full interactive re-auth on every cache expiry. `credential-store` never gained support — users relying on plaintext storage cannot benefit from refresh.

---

### Finding: Git version adoption constrains practical refresh viability
**Confidence:** INFERRED (no authoritative public version distribution data)
**Evidence:** Ubuntu package repos, Homebrew release cadence, Stack Overflow Developer Survey 2025 (Git usage only, no version breakdown)

- Ubuntu 22.04 LTS ships git 2.34 — below the 2.40 threshold for any refresh support. In active support until 2027.
- Ubuntu 24.04 LTS ships git 2.43 — has `password_expiry_utc` (2.40) and `oauth_refresh_token` (2.41) but NOT osxkeychain support (2.45).
- macOS Xcode Command Line Tools: version varies by Xcode release; Homebrew users typically have latest.
- Git for Windows: auto-updates available; GitHub Desktop bundles recent versions.

Estimated Git 2.40+ adoption among developers: >60-70% by mid-2026. Git 2.45+ (required for macOS osxkeychain): substantially lower. No public source publishes a definitive version distribution.

**Implications:** A refresh implementation that requires Git 2.45+ would be degraded (no persistent refresh token storage) for a material fraction of macOS users who haven't upgraded Git. Graceful degradation (fall back to interactive re-auth when storage helper doesn't support refresh tokens) is essential.

---

### Finding: GCM implements per-provider reactive refresh but has not adopted Git's protocol extensions
**Confidence:** CONFIRMED
**Evidence:** GCM source — GitLabHostProvider.cs, BitbucketHostProvider.cs, GenericHostProvider.cs; [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059); [GCM PR #1464](https://github.com/git-ecosystem/git-credential-manager/pull/1464)

GCM's current (`main`) approach:

| Provider | Refresh support | Trigger | RT key format |
|---|---|---|---|
| GitHub | None (gho_ doesn't expire) | N/A | N/A |
| GitLab | Reactive (401 from `/oauth/token/info`) | API validation failure | `oauth-refresh-token.{host}` |
| Bitbucket | Reactive (401 from API) | API validation failure | `{scheme}://{host}/refresh_token` |
| Azure DevOps | MSAL-internal (proactive) | MSAL `AcquireTokenSilent` | MSAL opaque cache |
| Generic | Reactive | Refresh attempt, fallback to interactive | `refresh_token.{host}` |

Each provider stores refresh tokens as **separate credential entries** in the OS credential store with provider-specific key prefixes. The `ICredentialStore` interface has no refresh-token-aware methods.

PR #1464 (open since Nov 2023, unmerged) adds `ICredential.PasswordExpiry`, `ICredential.OAuthRefreshToken`, and `ICredentialStore.CanStoreOAuthRefreshToken`/`CanStorePasswordExpiry` capability flags — embedding refresh tokens as first-class credential properties. Issue #2059 (opened Sep 2025) tracks the full protocol integration.

GitHub provider refresh: Issue #789 (opened Jul 2022) is `blocked-external-dependency` — GitHub's OAuth flow produces non-expiring `gho_` tokens and does not issue refresh tokens at the application level.

**Implications:** GCM's refresh architecture is mature but provider-siloed. Each provider reinvents storage key naming and validation flow. The protocol-level approach (PR #1464 + Issue #2059) would unify this but has stalled for 2+ years. Any new credential helper implementing refresh can choose between: (a) GCM's per-provider approach (requires per-forge code), or (b) the `git-credential-oauth` approach (protocol-level, stateless, chained).

---

### Finding: git-credential-oauth implements the canonical protocol-level refresh pattern in ~500 LOC
**Confidence:** CONFIRMED
**Evidence:** hickford/git-credential-oauth `main.go` — ~600 LOC, 2 dependencies (`golang.org/x/oauth2`, `rsc.io/qr`)

Architecture is a clean separation of concerns:

1. **Generation** (git-credential-oauth): Stateless. Reads `oauth_refresh_token` from stdin (line 298), calls `TokenSource().Token()` for refresh exchange (HTTP POST to token endpoint with `grant_type=refresh_token`), outputs `password`, `password_expiry_utc`, `oauth_refresh_token` to stdout.
2. **Storage** (any git storage helper): Stores everything Git passes to `store`, returns it on `get`.
3. **Orchestration** (Git itself): Calls helpers in order, passes refresh token from storage to generator, checks `password_expiry_utc`.

The refresh exchange itself is ~10 LOC:
```go
if pairs["oauth_refresh_token"] != "" {
    token, err = c.TokenSource(ctx, &oauth2.Token{RefreshToken: pairs["oauth_refresh_token"]}).Token()
    if err != nil {
        fmt.Fprintln(os.Stderr, "error during OAuth token refresh", err)
    }
}
```

If refresh fails (expired/invalid refresh token), falls through to full interactive OAuth flow (opens browser). No hard failure.

Supports 14 forges out of box (GitHub, GitLab, Bitbucket, Gitea, Codeberg, various GitLab instances, googlesource.com). Custom forges via `credential.<url>.oauthClientId` git config.

**Implications:** The pattern is highly portable to Node/TypeScript. Core refresh: `fetch()` POST to token endpoint. Protocol I/O: stdin line-by-line parsing. No Go-specific dependencies beyond a QR library (optional, for device flow). Estimated port: ~100-150 LOC for refresh + protocol, ~80 LOC for forge config table.

---

### Finding: Per-forge token refresh behavior diverges significantly, with all non-GitHub forges using single-use refresh tokens
**Confidence:** CONFIRMED (GitHub, GitLab, Bitbucket, Gitea) / INFERRED (Forgejo, Azure DevOps access TTL)
**Evidence:** Official docs for each forge (see references above)

| Forge | Access TTL | Refresh TTL | Single-use RT? | Notes |
|---|---|---|---|---|
| GitHub OAuth App (`gho_`) | No expiry | N/A | N/A | 1yr inactivity auto-revoke |
| GitHub App (user token) | 8 hours | 6 months | Yes | App owners can opt out of expiry |
| GitLab | 2 hours (hardcoded) | No explicit TTL | Yes | Race condition on concurrent refresh |
| Bitbucket | 1 hour | No documented expiry | Yes | App passwords removed June 2026 |
| Azure DevOps | ~1 hour (undocumented exact) | 90 days unused | Yes | Being sunset in 2026 → Entra ID |
| Gitea | 1 hour (configurable) | ~30 days (configurable) | Yes | No scopes — tokens have full access |
| Forgejo/Codeberg | 1 hour (configurable) | ~30 days (inferred) | Yes (inferred) | Same Gitea codebase |

Universal pattern: every non-GitHub forge uses short-lived access tokens (1-2 hours) with refresh tokens. All refresh tokens are single-use (token rotation on each exchange). This means a credential helper must store the new refresh token after every exchange — losing a refresh response means falling back to interactive auth.

GitLab-specific hazard: because refresh tokens are single-use, concurrent refresh requests race. The second request receives a 401 because the first already rotated the token. Documented by HashiCorp and GitLab community.

**Implications:** For GitHub-primary users, token refresh is unnecessary. For any multi-forge scenario involving GitLab, Bitbucket, Gitea, or Forgejo, refresh is essential for sessions exceeding 1-2 hours. The single-use pattern means refresh token storage must be reliable and atomic — lost refresh responses require full re-auth.

---

### Finding: Git 2.46 added multi-stage auth (`state[]`, `continue`, `authtype`, `credential`) but these are orthogonal to refresh
**Confidence:** CONFIRMED
**Evidence:** git/git commit `ac4c7cbfa` by brian m. carlson; `Documentation/git-credential.adoc` lines 228-265

Git 2.46 added:
- `continue` (boolean): signals non-final step in multi-stage auth (NTLM, Kerberos)
- `state[]` (multi-valued): opaque per-helper state across auth rounds
- `authtype`/`credential`: pre-encoded auth material for Bearer, NTLM, etc.
- Retry loop in `http_request_recoverable()` capped at 3 iterations

These fields enable protocols requiring multiple client-server round trips. They are capability-gated (`capability[]=state`, `capability[]=authtype`). Not related to token refresh, but complement it — a credential helper could use `authtype=Bearer` + `credential=<access_token>` to pass tokens without the username:password encoding.

**Implications:** Multi-stage auth fields are a maturity indicator for the credential protocol but not required for OAuth token refresh. Adoption is substantially lower (~Git 2.46, released July 2024). Exclude from refresh scoping.

---

## Negative searches

- **Public git version distribution data:** Searched Stack Overflow Developer Survey (2024, 2025), GitHub Octoverse, GitHub Blog, GitLab surveys, git-scm.com. No source publishes a breakdown of git client version distribution. Only aggregate "uses git" percentages exist. → NOT FOUND
- **GCM PR #1464 merge status:** Verified as OPEN and unmerged as of 2026-04-15. No linked merged replacement PR. → CONFIRMED (still open)
- **`credential-store` support for protocol extensions:** Searched git/git `credential-store.c` source and changelog. Plaintext format (`protocol://user:password@host`) has no field for `password_expiry_utc` or `oauth_refresh_token`. → CONFIRMED (never supported)

---

## Gaps / follow-ups

- No authoritative data on what % of developers have Git 2.40+, 2.41+, or 2.45+. Version adoption constraints are estimated, not measured.
- GCM's PR #1464 has been open for 2+ years — unclear whether it will merge or be superseded. The protocol-level approach may remain theoretical in GCM for some time.
- GitLab's refresh token race condition under concurrent access has no documented workaround in credential helper implementations.
- Bitbucket's June 2026 removal of app passwords may drive more users to OAuth, increasing refresh token dependency.
