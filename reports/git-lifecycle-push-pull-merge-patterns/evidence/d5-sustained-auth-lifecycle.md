# Evidence: D5 Sustained Auth Lifecycle (Update 2026-04-14)

**Dimension:** D5 — Token expiry, re-auth UX, scope drift, identity switches during long sessions
**Date:** 2026-04-14
**Sources:** GitHub/GitLab/Bitbucket/Azure DevOps docs, VS Code source, JetBrains source/YouTrack, GitHub Desktop source, lazygit issues, Zed issues, Obsidian-Git docs, GCM source/issues, 1Password docs, gh CLI docs

---

## Key files / pages referenced

- [GitHub Docs — Token Expiration](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [GitHub Docs — Installation Token Auth](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitLab Docs — OAuth Provider](https://docs.gitlab.com/integration/oauth_provider/)
- [Atlassian Blog — Bitbucket Token Expiry](https://www.atlassian.com/blog/bitbucket/enhancing-security-in-bitbucket-introducing-expiry-for-access-tokens)
- [Microsoft Learn — Azure DevOps PATs](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops)
- `microsoft/vscode` `extensions/git/src/askpass.ts` — IPC credential handler
- `microsoft/vscode` `extensions/github-authentication/src/githubServer.ts` — OAuth + keychain auto-regeneration
- [YouTrack IDEA-134848](https://youtrack.jetbrains.com/issue/IDEA-134848) — stale credential bug
- [GitHub Desktop askpass-trampoline](https://github.com/desktop/askpass-trampoline)
- [lazygit Issue #145](https://github.com/jesseduffield/lazygit/issues/145) — credential helper hang
- [Zed Issue #18140](https://github.com/zed-industries/zed/issues/18140) — session persistence Linux
- [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059) — proactive OAuth refresh
- [GCM PR #1464](https://github.com/git-ecosystem/git-credential-manager/pull/1464) — password_expiry_utc + oauth_refresh_token
- [1Password SSH Agent docs](https://developer.1password.com/docs/ssh/agent/)
- [gh CLI — Multiple Accounts](https://github.com/cli/cli/blob/trunk/docs/multiple-accounts.md)

---

## Findings

### Finding: Token expiry varies from 1 hour (GitHub App installation) to never (GitHub OAuth/classic PAT)
**Confidence:** CONFIRMED
**Evidence:** GitHub, GitLab, Bitbucket, Azure DevOps official docs

GitHub OAuth (`gho_`): no expiry. GitHub App installation: 1 hour hard. GitLab OAuth: 2 hours. Bitbucket OAuth: 1 hour. Azure DevOps OAuth refresh: 90 days if used once. External revocation detection is universally lazy — next operation returns 401/403.

### Finding: No editor implements silent token refresh — all require manual re-authentication
**Confidence:** CONFIRMED
**Evidence:** VS Code `askpass.ts`, JetBrains YouTrack IDEA-134848, lazygit Issue #145

VS Code: queries `CredentialsProvider` chain (60s cache); falls back to input box. JetBrains: known bug where IDE sometimes does NOT re-prompt after auth failure. lazygit: delegates to git's credential helpers; can hang if credential cache daemon dies. Zed: delegates to system credential helpers.

### Finding: VS Code auto-regenerates GitHub keychain entries when deleted
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode` `extensions/github-authentication/src/githubServer.ts`, [tekumara/notes](https://github.com/tekumara/notes/blob/main/vscode-github-auth.md)

VS Code stores `vscodevscode.github-authentication` and creates a secondary `github.com` entry for `credential-osxkeychain`. Deleting the `github.com` entry triggers auto-regeneration. `forceNewSession` API enables scope upgrades.

### Finding: JetBrains has a long-standing stale credential bug
**Confidence:** CONFIRMED
**Evidence:** [YouTrack IDEA-134848](https://youtrack.jetbrains.com/issue/IDEA-134848), [IDEA-145083](https://youtrack.jetbrains.com/issue/IDEA-145083)

IDE sometimes does NOT re-prompt after auth failure — silently uses stale credentials from OS keychain or internal store. Workaround: manually delete stale entries.

### Finding: No editor proactively checks OAuth scopes — drift detected only at push-time
**Confidence:** CONFIRMED
**Evidence:** [GitHub Docs — OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), VS Code API

GitHub returns `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` headers on every API call. No editor reads these headers preemptively. The `workflow` scope scenario is canonical: push to `.github/workflows/` fails with server error until user re-authenticates with broader scope.

### Finding: Stale credential detection is universally lazy — no editor proactively detects external identity switches
**Confidence:** CONFIRMED
**Evidence:** VS Code FAQ, JetBrains support, GitHub Desktop Issue #9579

No editor detects that the user's GitHub identity changed externally. Detection happens only when a git operation fails. VS Code: cached credentials persist indefinitely in OS keychain. JetBrains: per-project account assignment is manual.

### Finding: GCM is evolving toward proactive refresh via Git 2.40+/2.41+ credential protocol extensions
**Confidence:** CONFIRMED
**Evidence:** [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059), [GCM PR #1464](https://github.com/git-ecosystem/git-credential-manager/pull/1464)

Git 2.40 added `password_expiry_utc` (check expiry without network). Git 2.41 added `oauth_refresh_token` (store refresh tokens). Git 2.46+ added `state[]` fields and `continue` boolean for multi-stage auth. GCM's Bitbucket provider supports auto refresh. GitHub provider does not yet (issue #2059 open).

### Finding: 1Password SSH agent provides per-application, per-terminal-tab authorization
**Confidence:** CONFIRMED
**Evidence:** [1Password SSH Agent docs](https://developer.1password.com/docs/ssh/agent/)

Approval scoped to specific application + terminal tab. Session duration configurable. Agent config (`~/.config/1password/ssh/agent.toml`) maps keys per SSH host from different vaults/accounts.

### Finding: Credential helper TTLs create silent auth cliffs during long sessions
**Confidence:** CONFIRMED
**Evidence:** [git-scm.com — credential-cache](https://git-scm.com/docs/git-credential-cache), GCM credential stores docs

`credential-cache`: 900s (15 min) default TTL — most aggressive cliff. `osxkeychain`/`wincred`/`credential-store`: permanent, no TTL. GCM: depends on backing store. The `git-credential-oauth` helper (hickford) implements proactive refresh via stored refresh token exchange.

---

## Gaps / follow-ups

- No editor implements `X-OAuth-Scopes` header inspection for proactive scope checking
- GCM proactive refresh for GitHub (Issue #2059) is proposed but not yet implemented
- Azure DevOps OAuth deprecation (2026) may affect long-term auth patterns for that forge
