# Evidence: D3 — GitHub authentication patterns for on-device apps

**Dimension:** How editors get a GitHub token without a server-side callback
**Date:** 2026-04-14
**Sources:** VSCode github-authentication extension (full read), GitHub Desktop, gh CLI, @octokit/auth-oauth-device.js

---

## Key files read end-to-end

- `vscode/extensions/github-authentication/src/flows.ts` (607 lines)
- `vscode/extensions/github-authentication/src/githubServer.ts`
- `vscode/extensions/github-authentication/src/github.ts`
- `vscode/extensions/github-authentication/src/common/keychain.ts`
- `vscode/extensions/github-authentication/src/common/env.ts`
- `gh-cli/git/client.go` (full)
- `gh-cli/pkg/cmd/auth/gitcredential/helper.go` (full)
- `gh-cli/pkg/cmd/auth/shared/gitcredentials/helper_config.go`
- `gh-cli/internal/keyring/keyring.go` (full)
- `gh-cli/internal/authflow/flow.go`
- `gh-cli/internal/ghinstance/host.go`
- `auth-oauth-device.js/src/get-oauth-access-token.ts`
- `desktop/app/src/lib/api.ts`

---

## Findings

### Finding: VSCode's flow selection is dynamic and environment-filtered
**Confidence:** CONFIRMED
**Evidence:** `vscode/extensions/github-authentication/src/flows.ts:607-661`

```typescript
const allFlows: IFlow[] = [
  new LocalServerFlow(),
  new UrlHandlerFlow(),
  new DeviceCodeFlow(),
  new PatFlow()
];

export function getFlows(query: IFlowQuery) {
  const validFlows = allFlows.filter(flow => {
    // filters by GitHub target (.com vs GHES vs HostedEnterprise)
    // filters by extension host (Local vs Remote vs WebWorker)
    // filters by client secret availability
    if (!Config.gitHubClientSecret) {
      useFlow &&= flow.options.supportsNoClientSecret;
    }
    // filters by supported client (vscode.dev whitelist)
    return useFlow;
  });

  const preferDeviceCodeFlow = workspace.getConfiguration('github-authentication')
    .get<boolean>('preferDeviceCodeFlow', false);
  if (preferDeviceCodeFlow) {
    return [...validFlows.filter(f => f instanceof DeviceCodeFlow),
            ...validFlows.filter(f => !(f instanceof DeviceCodeFlow))];
  }
  return validFlows;
}
```

**Key implication for no-backend products:** `supportsNoClientSecret` filter. `UrlHandlerFlow` and `LocalServerFlow` both require `client_secret`. Open-source VSCode builds explicitly leave `Config.gitHubClientSecret` undefined (`config.ts:17-19`) — so OSS VSCode actually runs with only DeviceCodeFlow + PATFlow. Microsoft's shipped VSCode has the secret injected at build time. Any editor distributed as open source or as a self-hosted product with no trusted backend has no place to safely hold a `client_secret` → viable flows collapse to Device Flow + PAT.

### Finding: Fallback chain prompts user before retrying
**Confidence:** CONFIRMED
**Evidence:** `vscode/extensions/github-authentication/src/githubServer.ts:129-152`

```typescript
for (const flow of flows) {
  try {
    if (flow !== flows[0]) {
      await promptToContinue(flow.label);  // "Having trouble? Try a different method?"
    }
    return await flow.trigger({ scopes, callbackUri, ... });
  } catch (e) {
    userCancelled = this.processLoginError(e);
  }
}
throw new Error(userCancelled ? CANCELLATION_ERROR : 'No auth flow succeeded.');
```

**Flow labels surfaced to user:** `"url handler"`, `"local server"`, `"device"`, `"personal access token"`.

### Finding: Device Flow polling implementation details
**Confidence:** CONFIRMED
**Evidence:** `vscode/extensions/github-authentication/src/flows.ts:387-520`

Endpoints:
- `POST https://github.com/login/device/code?client_id=<id>&scope=<scopes>`
- `POST https://github.com/login/oauth/access_token?client_id=<id>&device_code=<code>&grant_type=urn:ietf:params:oauth:grant-type:device_code`

UI flow:
1. `env.clipboard.writeText(json.user_code)` — copies code to clipboard automatically
2. `env.openExternal(verification_uri)` — opens browser
3. `window.withProgress({location: Notification, cancellable: true})` — notification with clickable URL + visible code
4. Polling every `json.interval` seconds, hard cap 120 attempts (~2 minutes)
5. Handles `authorization_pending` (continue), `slow_down` (backoff), other errors (fail)

`@octokit/auth-oauth-device.js` implements the same flow with a slightly different polling shape (recursive with `slow_down` → `interval + 7`):

```typescript
if (errorType === "authorization_pending") { await wait(interval); return waitForAccessToken(...); }
if (errorType === "slow_down")             { await wait(interval + 7); return waitForAccessToken(...); }
```

### Finding: PAT flow validates token via API call before accepting
**Confidence:** CONFIRMED
**Evidence:** `vscode/extensions/github-authentication/src/flows.ts:558-604`

```typescript
const tokenScopes = await this.getScopes(token, appUri, logger);
const scopesList = scopes.split(' ');
if (!scopesList.every(scope => {
  const included = tokenScopes.includes(scope);
  if (included || !scope.includes(':')) return included;
  return scope.split(':').some(splitScopes => tokenScopes.includes(splitScopes));
})) {
  throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
}
```

`getScopes()` calls GitHub API with `Authorization: token <pat>` and reads `X-OAuth-Scopes` header. Handles scope hierarchy: `read:user` satisfies `user` requirement.

### Finding: gh CLI's credential-helper delegation is a zero-code auth pattern for any git wrapper supporting `-c` config
**Confidence:** CONFIRMED — this is the most actionable finding of D3
**Evidence:** `gh-cli/git/client.go:142-162`

```go
// AuthenticatedCommand is a wrapper around Command that included configuration to use gh
// as the credential helper for git.
func (c *Client) AuthenticatedCommand(ctx context.Context, credentialPattern CredentialPattern, args ...string) (*Command, error) {
  credHelper := fmt.Sprintf("!%q auth git-credential", c.GhPath)
  preArgs = []string{"-c", "credential.helper="}
  preArgs = append(preArgs, "-c", fmt.Sprintf("credential.helper=%s", credHelper))
  args = append(preArgs, args...)
  return c.Command(ctx, args...)
}
```

The exact git command gh runs:
```bash
git -c credential.helper= -c credential.helper='!gh auth git-credential' clone https://github.com/owner/repo.git
```

Two `-c` flags:
1. `credential.helper=` — clears any existing chain (important; otherwise user's git-credential-manager could intercept)
2. `credential.helper=!gh auth git-credential` — delegates to `gh auth git-credential get` as a shell-command credential helper

**The sub-binary protocol** — `gh-cli/pkg/cmd/auth/gitcredential/helper.go:58-144`:

Git sends on stdin:
```
protocol=https
host=github.com
path=/owner/repo.git
<blank line>
```

Helper responds on stdout:
```
protocol=https
host=github.com
username=x-access-token
password=<token>
```

`store` and `erase` operations are no-ops. Only `get` is implemented.

**Portability implication:** Any editor whose git wrapper supports per-invocation `-c` config (simple-git via `config: [...]`, dugite via direct argv, `child_process.spawn` directly) can delegate to gh with one line. No OAuth implementation required in the editor. No tokens touch the editor's code. No storage to maintain. Detection: `execFile('gh', ['auth', 'token'])` — succeeds only when gh is installed AND logged in for the target host.

### Finding: gh auth setup-git writes a persistent credential helper config
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/pkg/cmd/auth/shared/gitcredentials/helper_config.go:20-65`

```go
func (hc *HelperConfig) ConfigureOurs(hostname string) error {
  credHelperKey := fmt.Sprintf("credential.%s.helper", strings.TrimSuffix(ghinstance.HostPrefix(hostname), "/"))
  // 1. Clear existing: git config --global --replace-all <key> ""
  // 2. Add gh: git config --global --add <key> "!<gh-path> auth git-credential"
}
```

So after `gh auth setup-git`, the user's `~/.gitconfig` has:
```ini
[credential "https://github.com"]
    helper = 
    helper = !/usr/local/bin/gh auth git-credential
```

This applies to `git clone` invoked **anywhere on the machine**, not just inside gh. If the user has run `gh auth setup-git`, our `simple-git.clone()` call may already get gh's auth without us doing anything.

### Finding: gh stores tokens in OS keyring with plaintext fallback
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/internal/keyring/keyring.go:1-83`, `internal/config/config.go:508-510, 347-384`

Service name: `gh:<hostname>` (e.g. `gh:github.com`). Uses `zalando/go-keyring` with 3-second timeout wrapping.

Fallback: if `secureStorage = false` or `keyring.Set` errors, token writes to `~/.config/gh/hosts.yml` under `users.<username>.oauth_token`. Format:

```yaml
github.com:
  user: nickgomez
  oauth_token: ghu_xxxxxxxx
  git_protocol: https
  users:
    nickgomez:
      oauth_token: ghu_xxxxxxxx
```

### Finding: GitHub Desktop's OAuth flow requires an embedded client_secret
**Confidence:** CONFIRMED
**Evidence:** `desktop/app/src/lib/api.ts:2343-2381`

```typescript
export async function requestOAuthToken(endpoint: string, code: string): Promise<string | null> {
  const response = await request(urlBase, null, 'POST', 'login/oauth/access_token', {
    client_id: ClientID,
    client_secret: ClientSecret,
    code: code,
  })
}
```

`ClientSecret` is injected at build time via `__OAUTH_SECRET__`. Desktop accepts the trade-off that any attacker can extract `client_secret` from a Desktop install. This is not a pattern we should copy — modern guidance (RFC 8252) is PKCE or Device Flow for native apps.

### Finding: isomorphic-git supports Bearer tokens via onAuth headers
**Confidence:** CONFIRMED
**Evidence:** `isomorphic-git/src/managers/GitRemoteHTTP.js:19-28, 114-132`

```javascript
const updateHeaders = (headers, auth) => {
  if (auth.username || auth.password) {
    headers.Authorization = calculateBasicAuthHeader(auth);
  }
  // but any manually provided headers take precedence
  if (auth.headers) {
    Object.assign(headers, auth.headers);
  }
}
```

`onAuth` is called only on 401 (first attempt). Subsequent 401s call `onAuthFailure` (prevents infinite loops from naive callbacks). Returning `{cancel: true}` throws `UserCanceledError`. Returning `undefined` lets the 401 propagate as `HttpError`.

### Finding: isomorphic-git rejects SSH URLs with a clean error + HTTPS suggestion
**Confidence:** CONFIRMED (correcting prior "silent rewrite" framing)
**Evidence:** `isomorphic-git/src/managers/GitRemoteManager.js:20-38`

```javascript
throw new UnknownTransportError(
  url,
  parts.transport,
  parts.transport === 'ssh' ? translateSSHtoHTTP(url) : undefined
);
```

The rewrite is computed as a **suggestion** in `error.data.suggestion`, not auto-applied. So SSH URLs fail loudly, not silently. Our clone flow can detect `error.code === 'UnknownTransportError'` and surface the suggestion to the user.

---

## Pattern synthesis — viable auth flows for any no-backend on-device editor

Ranked by complexity vs reach for a non-developer audience:

| Flow | Complexity | Works without gh? | Works for private? | Best for |
|---|---|---|---|---|
| **Delegate to `gh auth git-credential`** | ⭐ trivial (1 config line) | No | Yes (if user ran gh auth login) | Users who already have gh |
| **OAuth Device Flow** (`@octokit/auth-oauth-device`) | ⭐⭐ moderate (register app, embed clientId, implement polling UI) | Yes | Yes (after login) | Non-developer first-run |
| **PAT paste** | ⭐ trivial (prompt → store) | Yes | Yes (with correct scopes) | Power users, CI, enterprise |
| **Public-only / no auth** | ⭐ trivial | Yes | No | Zero-friction first demo |
| **PKCE Auth Code** | ⭐⭐⭐⭐ requires URI handler registration + OAuth App pre-registration | Yes | Yes | Not viable for products without OS-level URI handler registration |
| **OAuth App + embedded client_secret** | ⭐⭐⭐ doable but bad practice | Yes | Yes | Rejected — don't copy Desktop |
| **OAuth App + loopback HTTP server** | ⭐⭐⭐ needs picking free port, OS firewall ok | Yes | Yes | Viable alt to Device Flow |

---

## Gaps / follow-ups

- GitHub App (as opposed to OAuth App) permission model not investigated. GitHub Apps offer per-repo fine-grained installation — likely better long-term but more implementation cost.
