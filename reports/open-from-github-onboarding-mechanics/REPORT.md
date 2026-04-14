---
title: "Clone-from-GitHub Onboarding Mechanics for On-Device Editors"
description: "Factual landscape and architectural archetypes for implementing 'Clone from GitHub' or 'Open from GitHub' in an on-device editor with no backend. Source-level evidence from VSCode, GitHub Desktop (+ dugite), Zed, Obsidian-Git, gh CLI, isomorphic-git, simple-git, and @octokit/auth-oauth-device. Covers clone execution mechanisms, OAuth App vs GitHub App for no-backend products, Device Flow + gh-credential delegation + PAT fallback, OS-keychain token storage, URL parsing, target directory selection, progress UX, post-clone handoff, workspace-trust patterns, UI naming, and the three architectural seam archetypes (CLI orchestrator / in-server hot-swap / multi-process launcher) with fit tests and decision criteria."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - VSCode
  - GitHub Desktop
  - Zed
  - Obsidian-Git
  - gh CLI
  - dugite
  - simple-git
  - isomorphic-git
  - "@napi-rs/keyring"
  - "@octokit/auth-oauth-device"
  - GitHub App
  - OAuth App
topics:
  - clone from github
  - oauth device flow
  - oauth app registration
  - on-device editor onboarding
  - git credential delegation
  - token storage
  - workspace trust
  - architectural seams
---

# Clone-from-GitHub Onboarding Mechanics for On-Device Editors

**Purpose:** A factual landscape and set of architectural archetypes for adding "Clone from GitHub" (or "Open from GitHub") to any on-device editor running without a backend — Electron apps, native desktop apps, self-hosted Node/Bun CLIs paired with local web UIs, VSCode-style webviews, etc. The report is intentionally portable: implementation decisions specific to any particular codebase belong in a spec that *consumes* this research, not in the research itself.

A reader should be able to use this report to make grounded architectural choices for their own editor, with source-level evidence to back every claim.

---

## Executive Summary

Clone-from-GitHub for an on-device editor with no backend reduces to four architectural choices. Each has a factually-correct default grounded in source-level reads of every mainstream prior art:

**1. Clone mechanism → spawn the system `git` binary via a Node wrapper (or native equivalent).**
Every shipped desktop editor that offers clone (VSCode, GitHub Desktop, gh, Obsidian-Git desktop) spawns git. The exceptions — Zed (libgit2 via `git2` Rust crate) and Obsidian-Git mobile (isomorphic-git pure JS) — are edge cases driven by runtime constraints. For a Node/Bun editor, **simple-git** is the production choice: actively maintained, ~13M weekly downloads, per-invocation git config overrides, structured progress via stderr sideband-2 parsing, outputHandler for raw stream access. **Dugite** (GitHub Desktop's embedded-git wrapper) is architecturally interesting but blocked on Bun today (postinstall uses `stream.Readable.fromWeb()` + `tar-stream`) and adds 400–600 MB per-platform binary footprint. **isomorphic-git** is viable only as a narrow fallback for HTTPS-public-only clone on hosts without git: no native SSH, no wired progress on the Node HTTP plugin, and the entire packfile buffered in RAM.

**2. Auth → OAuth App (not GitHub App) with Device Flow as universal sign-in, plus gh delegation when available, plus PAT fallback.**

"Prefer GitHub Apps for new integrations" is standard GitHub guidance, but it assumes a backend that holds the App's private RSA key safely. On-device products without a backend cannot get GitHub Apps' killer feature (JWT-signed installation tokens) because the private key can't be distributed safely; the remaining path (user-to-server tokens) expires every 8 hours and requires a `client_secret` to refresh that also can't be embedded safely. That regresses UX vs. OAuth Apps' long-lived tokens. Every studied local-first editor — VSCode, gh, GitHub Desktop, Cursor, Windsurf, Obsidian-Git — registers one public OAuth App with a `clientId` committed to source and no secret on user machines (VSCode: `01ab8ac9400c4e429b23`; gh: `178c6fc778ccc68e1d6a`). **Device Flow** is the correct grant type for no-backend products; PKCE with URI-handler callback and loopback-HTTP flows both require either OS-level URI-scheme registration or an embedded `client_secret` — neither is appropriate for a CLI+local-web-UI shape. **gh delegation** (pass `credential.helper='!gh auth git-credential'` to your git wrapper) is the zero-friction path when `gh` is installed: no tokens touch your process. **PAT paste** is the universal escape hatch.

**3. Token storage → OS keychain primary, plaintext 0600 file fallback, both from day one.**

keytar is archived (GitHub repo archived Dec 2022) though still 2M+ weekly downloads of legacy use; `@napi-rs/keyring` is the credible 2026 replacement (active, ~192k weekly, broader platform matrix including FreeBSD and musl Linux). Electron's `safeStorage` is Electron-main-only. No pure-JS OS-keychain binding exists. The plaintext fallback matters in practice because headless Linux, Docker containers, CI runners, and corporate locked-down machines often lack a running secret-service daemon — gh's architecture ships this fallback in `internal/config/config.go:347-384`.

**4. Integration seam → one of three archetypes, chosen by a structural fit test against the editor's codebase.**

Three archetypes exist (see D10 for full detail):
- **A: CLI orchestrator** (clone → init → start chain). Fits nearly all editors with a CLI launcher. Simplest.
- **B: In-server hot-swap endpoint** (running server reconfigures to new content dir). Fits only editors whose server factory exposes a `reconfigure` hook and whose persistence/watcher/document layers can swap scopes without cross-contamination. Rare.
- **C: Multi-process launcher** (detect existing server via lock file; open existing or spawn new). Fits editors that already enforce one-server-per-directory via a lock file. Great for multi-project workflows.

Most on-device editors land on A, or A+C for multi-project products.

**Key Findings:**

- **gh credential-helper delegation is a zero-code auth path.** One line of git config (`credential.helper='!gh auth git-credential'`) shells to gh when a user operation needs credentials, and gh responds via the git-credential-helper stdin/stdout protocol. Works for any editor whose git wrapper supports per-invocation `-c` config. Evidence: `gh-cli/git/client.go:142-162` + `pkg/cmd/auth/gitcredential/helper.go:58-144`.
- **Device Flow is the only OAuth grant type that works for a no-backend on-device product.** VSCode's flow filter at `extensions/github-authentication/src/flows.ts:607-661` explicitly enumerates the filtering logic — when `client_secret` is undefined, only Device Flow and PAT survive. This is the clean architectural answer, not a fallback.
- **Clone progress via stderr sideband-2 parsing is a universal pattern.** Both VSCode (`extensions/git/src/git.ts:451-476`) and simple-git (`plugins/progress-monitor-plugin.ts:6-46`) parse the same regex family: `^(\w+):\s*(\d+)% \((\d+)/(\d+)\)`. Maps cleanly to a weighted 0–100 progress bar with phase labels.
- **Workspace Trust is a first-class security surface, not an optional polish.** Cloned repos land arbitrary configuration files on disk. Any editor that loads project config silently from the cloned directory has an attack surface; the correct architecture gates untrusted configs behind a preview-first confirmation flow (VSCode's Workspace Trust at `src/vs/workbench/services/workspaces/common/workspaceTrust.ts:294-327` is the reference).
- **"Clone from GitHub" is the industry-standard label.** Every studied editor uses "Clone": VSCode ("Git: Clone"), Desktop ("Clone a Repository"), Zed ("Clone Repository"), gh (`gh repo clone`), Obsidian-Git ("Clone an existing remote repo"). "Open" means "open a folder already on disk" across the landscape. Aligning with "Clone" maximizes cross-tool muscle memory.

**Critical caveats applicable to any implementer:**

- Runtime-compatibility smoke tests of your chosen git + keychain libraries are not optional pre-merge work; they gate the feature.
- OAuth App registration + privacy policy URL is a one-time business setup step that blocks ship.
- Scope selection matters: `repo` (private+public read/write) is the default for any editor that wants to support private-repo clone + future push. `public_repo` alone cannot clone private repos — a silent failure mode if a user picks a private template.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | Mapping an editor's init surface (methodology) | Moderate | P0 |
| D2 | Clone execution mechanism | Deep | P0 |
| D3 | GitHub authentication for on-device apps with no backend (incl. OAuth App vs GitHub App) | Deep | P0 |
| D4 | Token storage | Moderate | P0 |
| D5 | URL input & repo picker UX | Moderate | P0 |
| D6 | Target directory selection | Moderate | P1 |
| D7 | Progress UX | Moderate | P1 |
| D8 | Post-clone handoff + trust model | Moderate | P0 |
| D9 | UI naming & information architecture | Moderate | P0 |
| D10 | Architectural seam archetypes | Deep | P0 |
| D11 | Adjacent editor patterns (Logseq, TinaCMS) | Light | P1 |

**Non-goals:** Library-choice re-litigation for in-house git operations (covered elsewhere in prior-art literature); multi-project registry/switching UX; push/PR/sync-back flows (inverse direction); GitHub Enterprise specifics beyond "change the hostname"; GitLab/Bitbucket equivalents; in-browser/PWA clone; CI-driven clone; permission/access-control model design.

**Stance:** Factual landscape with architectural archetypes. Implementation decisions specific to any particular codebase belong in a spec that consumes this report.

---

## Detailed Findings

### D1: Methodology — how to map your editor's init surface

**Finding:** Before choosing an integration seam, any editor needs to answer five questions about its own codebase. The answers determine which architectural archetype (D10) is the right fit and what work is required to support clone-from-GitHub.

**Evidence:** [evidence/d1-methodology-init-surface-mapping.md](evidence/d1-methodology-init-surface-mapping.md)

The five questions:

**Q1: Does your `start`/launch path auto-initialize scaffolding on a fresh or empty directory?**
Many editors create a hidden metadata directory (`.vscode/`, `.obsidian/`, `.cursor/`) on first launch against a new folder. If yours does, your post-clone handoff can be as simple as "spawn start" — the existing auto-init handles everything. If your launch path assumes pre-existing scaffolding, you need an explicit init step in the clone orchestrator.

**Q2: Is a git library already a dependency of your editor's server runtime?**
Many editors use git internally for unrelated features — version history, attribution journals, crash recovery, snapshotting. If yes, your clone feature reuses that dependency without introducing a new one. If no, you select from D2's library options.

**Q3: What is the identity of "a project" in your editor?**
A filesystem path? A UUID stored in a config? A URL? A workspace descriptor file? Clone produces a fresh filesystem directory; that directory must satisfy your "project identity" contract. Editors whose identity is "the filesystem path of the content directory" (Obsidian, VSCode single-folder mode) map trivially. Editors with stronger identity contracts (workspace files, configured UUIDs) need an extra registration step.

**Q4: Does your server factory expose a reconfiguration hook?**
If `server.reconfigure(newPath)` can swap the active content directory without a full restart, Archetype B (in-server hot-swap) is viable. If your server is single-instance-per-contentDir and exposes only `start()` / `destroy()`, Archetype B requires fundamental refactoring — don't force it; use A or C.

**Q5: Does your editor have an empty-state UI today?**
Non-developer "Clone from GitHub" entry points typically live in an empty state (when the editor launches with no project loaded) and in a "File > Open from GitHub..." menu. If your editor has no empty-state UI today, adding one is in-scope for this feature — not a separate project.

The answers form a decision matrix: Q1 determines how much init code your orchestrator needs; Q2 chooses your library path; Q3 constrains your post-clone "register this project" work; Q4 picks between seam archetypes B vs A/C; Q5 sizes your UI work.

---

### D2: Clone execution mechanism

**Finding:** Every shipped on-device editor with a clone feature invokes the system `git` binary via subprocess — except Zed (libgit2 in Rust) and isomorphic-git (pure JS, mobile contexts only). For a Node/Bun editor, simple-git is the production choice; dugite is blocked on Bun runtime compatibility; isomorphic-git is a narrow fallback.

**Evidence:** [evidence/d2-clone-execution-mechanisms.md](evidence/d2-clone-execution-mechanisms.md)

Landscape summary:

| Editor | Mechanism | Binary source |
|---|---|---|
| VSCode | `cp.spawn(gitPath, ['clone', ...])` (`extensions/git/src/git.ts:436-502, 676-702`) | System git, bundled on Windows |
| GitHub Desktop | dugite → `execFile(embeddedGit, ['clone', ...])` (`app/src/lib/git/clone.ts:27-78`) | Prebuilt binaries from `desktop/dugite-native` releases, downloaded postinstall |
| Zed | libgit2 via `git2` Rust crate (`crates/git_ui/src/clone.rs:8-155`) | In-process, no subprocess |
| gh CLI | Orchestrates system `git` with credential-helper overrides (`git/client.go:819-853`) | System git |
| Obsidian-Git desktop | simple-git → `spawn('git', [...])` (`src/gitManager/simpleGit.ts:1036-1048`) | System git |
| Obsidian-Git mobile | isomorphic-git pure JS (`src/gitManager/isomorphicGit.ts:725-748`) | N/A |

**simple-git capabilities confirmed by full source read:**
- Clone options cover `--depth`, `--branch`, `--single-branch`, `--recurse-submodules`, `--bare`, etc. (`src/lib/tasks/clone.ts:14-39`)
- Progress via structured callback parsing stderr sideband-2 regex `^([\s\S]+?):\s*(\d+)% \((\d+)/(\d+)\)` (`src/lib/plugins/progress-monitor-plugin.ts:6-46`)
- Per-invocation `-c key=value` prepending via `config: ['key=value']` option in constructor (`src/lib/plugins/command-config-prefixing-plugin.ts:4-15`) — unlocks gh-delegation pattern and custom credential headers
- Raw stdout/stderr stream access via `outputHandler(command, stdout, stderr, args)` (`src/lib/runners/git-executor-chain.ts:223-226`) — for custom UI rendering
- `GIT_TERMINAL_PROMPT=0` via `.env()` yields clean `GitError` on auth failure instead of stdin hang (`src/lib/plugins/error-detection.plugin.ts:7-9`)

**dugite trade-offs:**
- `package.json:18-20`: Node 20+ required
- `script/download-git.js:94`: uses `Readable.fromWeb()` — not in Bun today
- `script/download-git.js:5`: uses `tar-stream` — Node-specific
- Binary footprint: 150–200 MB compressed, 400–600 MB extracted per platform per install
- `LOCAL_GIT_DIRECTORY` env var is a runtime escape hatch (`lib/git-environment.ts:32-39`); `DUGITE_CACHE_DIR` caches the tarball at install
- Git version shipped: 2.53.0 (as of April 2026)
- Update cadence: lags dugite-native by days-to-weeks after each upstream git release (~every 4–8 weeks)

**isomorphic-git constraints for clone:**
- No native SSH. `git@host:owner/repo.git` URLs throw `UnknownTransportError` with `error.data.suggestion` containing the HTTPS equivalent (`src/managers/GitRemoteManager.js:20-38`) — clean error, not a silent rewrite.
- Node HTTP plugin's `onProgress` accepts the parameter but does not wire it through to `simple-get` (`src/http/node/index.js:14-57`); progress fires only at completion.
- Entire packfile buffered in memory (`src/commands/fetch.js:216`: `Buffer.from(await collect(packstream))`); explicit TODO to stream. RAM ceiling for large repos.
- Auth via `onAuth` callback supports Bearer tokens (`src/managers/GitRemoteHTTP.js:19-28`): `onAuth: () => ({ headers: { Authorization: 'Bearer <token>' } })` works for GitHub private repos.

**Decision heuristic:**
- Node/Bun stack, git-on-PATH is acceptable → **simple-git**
- Node/Electron stack, git-on-PATH unacceptable (e.g., shipping to Windows non-developers) → **dugite** if Node 20+ available
- Rust stack → **libgit2 via `git2`**
- Public-only HTTPS clone, no git binary, willing to accept no-SSH and RAM ceiling → **isomorphic-git**
- Codebase already uses a specific library for other git operations → reuse it unless its limitations block clone

---

### D3: GitHub authentication for on-device apps with no backend

**Finding:** OAuth App (not GitHub App) with Device Flow as universal sign-in, plus gh delegation when available, plus PAT fallback. All three tiers ship together.

**Evidence:** [evidence/d3-github-auth-patterns.md](evidence/d3-github-auth-patterns.md)

#### Registration model: "self-hosted" vs "registered"

Every local-first editor with GitHub auth registers one public app with GitHub. The product maker (Microsoft for VSCode, GitHub for `gh`, the editor maker for any third-party tool) does this once. The app's `clientId` is public and committed to source — VSCode's is `01ab8ac9400c4e429b23` (`extensions/github-authentication/src/config.ts:17-19`), gh's is `178c6fc778ccc68e1d6a` (`internal/authflow/flow.go:20-97`). Every installation of the product uses the same `clientId`. Each user's authorization produces a token that lives only on their machine; the product maker has no visibility into individual tokens.

"Self-hosted" in this context means the product runs locally with no product-maker-operated backend. It does NOT mean skipping registration — skipping would force every user to generate a PAT manually, which is developer jargon unsuitable for non-developer audiences.

#### OAuth App vs GitHub App — decision

| | OAuth App | GitHub App |
|---|---|---|
| Install UX | "Authorize X" — all-or-nothing user scopes | "Install on these specific repos" — fine-grained picker |
| Permission model | User-level OAuth scopes (coarse: `repo` = all private repos) | Per-installation, per-repo, per-permission |
| Token lifetime | Long-lived (no expiry unless revoked) | User-to-server tokens expire in 8 hours |
| Token refresh | Not needed | Requires `client_secret` in exchange |
| Installation tokens (JWT-signed) | N/A | Backend-only — requires private RSA key safely held |
| Secret on user disk | None needed for Device Flow | `client_secret` required for refresh |
| Device Flow support | ✓ (no secret needed) | ✓ (since 2022) |
| Representative users | VSCode, gh, Desktop, Cursor, Windsurf, Obsidian-Git | Dependabot, Vercel, Copilot — all with backends |

**Why OAuth App wins for no-backend products:**

1. GitHub App's fine-grained installation tokens are issued by signing a JWT with the App's private RSA key. That key cannot be distributed to user machines without letting anyone impersonate the app. So that flow is structurally unavailable to a no-backend product.
2. Without installation tokens, GitHub App reduces to user-to-server tokens via Device Flow. Those expire every 8 hours and require `client_secret` to refresh. `client_secret` cannot be embedded safely either (RFC 8252). Net result: users re-auth every 8 hours, which is strictly worse than OAuth App's long-lived tokens.
3. Every studied local-first editor converged on OAuth App for this reason. GitHub's "prefer GitHub Apps" guidance implicitly assumes a server.

**Trade-off acknowledged:** OAuth Apps grant coarse user-level scopes — no per-repo install picker. Users authorizing the app with `repo` scope grant access to all private repos. Mitigations: request minimum scope; surface gh-delegation prominently; document scopes clearly.

**Cost:** One-time setup — register at `github.com/settings/applications/new`, publish privacy policy URL, commit `clientId`, discard `client_secret`.

#### Three auth tiers (all ship together)

**Tier A — Delegate to `gh auth git-credential` when available.** Zero tokens touch your process.

From `gh-cli/git/client.go:142-162`:
```go
credHelper := fmt.Sprintf("!%q auth git-credential", c.GhPath)
preArgs = []string{"-c", "credential.helper="}
preArgs = append(preArgs, "-c", fmt.Sprintf("credential.helper=%s", credHelper))
```

Produces: `git -c credential.helper= -c credential.helper='!gh auth git-credential' clone <url>`

The first `-c` clears any existing chain (prevents git-credential-manager from intercepting). The second sets a shell-command helper that spawns `gh auth git-credential get` and speaks the git-credential-helper protocol on stdin/stdout (`pkg/cmd/auth/gitcredential/helper.go:58-144`):

```
# stdin from git:
protocol=https
host=github.com
<blank>
# stdout from gh:
protocol=https
host=github.com
username=x-access-token
password=<token-from-gh-keyring>
```

Any git wrapper supporting per-invocation `-c` flags can do the same. Detection: `execFile('gh', ['auth', 'token'])` — succeeds only when gh is installed and logged in.

**Tier B — Device Flow.** The right grant type for no-backend products.

VSCode's flow filter at `extensions/github-authentication/src/flows.ts:607-661` explicitly enumerates the filtering logic:

```typescript
const validFlows = allFlows.filter(flow => {
  // filters by target, extension host, client secret availability
  if (!Config.gitHubClientSecret) {
    useFlow &&= flow.options.supportsNoClientSecret;
  }
  // ...
});
```

When `client_secret` is undefined — the OSS VSCode case, and every no-backend product's case — only `DeviceCodeFlow` and `PatFlow` survive the filter. URL-handler PKCE flow requires `client_secret` for token exchange; LocalServer flow requires `client_secret`. Device Flow is the architecturally clean choice.

Device Flow UX pattern (from VSCode's `flows.ts:387-520`):
1. POST `/login/device/code?client_id=<id>&scope=<scopes>` → `{device_code, user_code, verification_uri, interval}`
2. `env.clipboard.writeText(user_code)` — auto-copy code
3. `env.openExternal(verification_uri)` — auto-open browser
4. Show progress notification with visible code and cancel button
5. Poll `/login/oauth/access_token?...&grant_type=urn:ietf:params:oauth:grant-type:device_code` every `interval` seconds
6. Handle `authorization_pending` (continue), `slow_down` (backoff + 7), other errors (fail)

`@octokit/auth-oauth-device` (npm) is the ready-made Node implementation. See `auth-oauth-device.js/src/get-oauth-access-token.ts:79-133` for the polling loop.

**Tier C — PAT paste.** Universal escape hatch.

VSCode's PAT flow at `flows.ts:522-605`:
1. Info modal: "Continue to GitHub to create a Personal Access Token"
2. Open browser to `/settings/tokens/new?description=<app>&scopes=<scopes>`
3. InputBox: placeholder `ghp_1a2b3c4...`, `ignoreFocusOut: true`
4. Validate: call `/user` with `Authorization: token <pat>`, read `X-OAuth-Scopes` header, verify requested scopes present

Required for: corporate SSO users, CI, users who reject OAuth redirects, GitHub Enterprise with custom auth.

#### Flow selection (detection-driven, not user-menu-driven)

```
1. gh on PATH AND `gh auth token` succeeds?
   → Tier A (one config line; invisible to user)
2. Stored token in keychain/file for the host?
   → use it directly
3. Otherwise: trigger sign-in UI
   → Tier B (Device Flow) as primary
   → Tier C (PAT paste) as secondary link/fallback
4. Tier B failure prompts Tier C
   (matches VSCode's githubServer.ts:129-152 "Try another method?" pattern)
```

#### Scopes

Minimum for clone-and-edit workflows (OAuth-scope model, used across all three tiers):
- `repo` — required for private-repo clone + push; includes public repos
- (Alternative for public-only variant: `public_repo`)

Reference: VSCode requests `['repo', 'workflow', 'user:email', 'read:user']` — wider than needed for clone alone because its GitHub extension does more.

---

### D4: Token storage

**Finding:** OS keychain via a maintained native binding, with a plaintext 0600 file fallback for environments without a running secret-service. Both paths ship together.

**Evidence:** [evidence/d4-token-storage.md](evidence/d4-token-storage.md)

#### Library landscape (as of 2026-04-14)

| Library | Status | Platform matrix | Notes |
|---|---|---|---|
| **keytar** | Archived repo (Dec 2022), last release Feb 2022 | mac/Win/Linux | 2.2M weekly downloads of legacy use; not formally npm-deprecated but abandoned |
| **@napi-rs/keyring** | Active (v1.2.0, Sep 2025) | Darwin x64/arm64, Linux glibc+musl x64/arm/arm64/riscv64, Win x64/ia32/arm64, FreeBSD x64 | ~192k weekly downloads; advertised "100% compatible node-keytar alternative"; backed by Rust [keyring-rs](https://github.com/hwchen/keyring-rs) |
| **Electron safeStorage** | Active, Electron-main only | mac/Win/Linux via Electron | Not available to non-Electron Node/Bun |
| **cross-keychain** | Active (v1.1.0, Oct 2025) | Inherits @napi-rs/keyring + CLI tool fallbacks + encrypted file | Bundles the full cascade; newer library (~6 months), modest adoption |
| **Pure-JS alternatives** | None credible | — | Every OS credential store requires native code or shell-out |

#### Why both keychain + file fallback

gh CLI's architecture (`internal/config/config.go:347-384`) is the established baseline:

```go
if secureStorage {
  setErr = keyring.Set(keyringServiceName(hostname), username, token)
  // ...
}
if !secureStorage || setErr != nil {
  c.cfg.Set([]string{hostsKey, hostname, usersKey, username, oauthTokenKey}, token)
  // writes ~/.config/gh/hosts.yml plaintext
}
```

The fallback exists because headless Linux, Docker containers, CI runners, SSH sessions without D-Bus forwarding, and locked-down enterprise Windows machines often lack a working secret service. Failing hard on keyring-unavailable would silently break those users. Shipping keyring-only is incorrect architecture for a cross-environment product.

#### Interface shape

```typescript
interface TokenStore {
  get(host: string): Promise<{ token: string; login?: string } | null>;
  set(host: string, login: string, token: string): Promise<void>;
  clear(host: string): Promise<void>;
  backend: 'keyring' | 'file';
}
```

Implementation: try keyring first; on `ErrNotFound` / timeout / any keyring error, fall through to file. Log the active backend at startup so users can see what's protecting their credentials.

File schema (modeled on gh's `hosts.yml`):

```yaml
# ~/.<appname>/auth.yml (chmod 0600)
github.com:
  login: <username>
  token: gho_xxxxxxxxxxxxx   # OAuth App user token (long-lived) OR ghp_ for PATs
  git_protocol: https
```

#### Runtime-compatibility note

For Bun-based editors: `@napi-rs/keyring` uses the standard napi-rs build pipeline, which Bun's Node-API compatibility generally handles. A 10-minute smoke test before commitment is the correct verification step — treat as "probably works, verify."

Tier A (gh delegation) bypasses token storage entirely: when gh is handling auth, tokens never touch your process. Storage only matters for Tiers B and C.

---

### D5: URL input & repo picker UX

**Finding:** Composite input — URL paste combined with authenticated repo-browse in one dialog. VSCode's `pickRemoteSource` pattern is the reference.

**Evidence:** [evidence/d5-url-input-repo-picker.md](evidence/d5-url-input-repo-picker.md)

Input modes across the landscape:

| Mode | VSCode | GitHub Desktop | gh | Obsidian-Git |
|---|---|---|---|---|
| URL paste | ✓ | ✓ | ✓ | ✓ |
| `owner/repo` shorthand | ✓ (via GitHub extension) | ✓ | ✓ | ✗ |
| Authenticated repo browse | ✓ (RemoteSourceProvider QuickPick) | ✓ (three-tab dialog) | ✗ | ✗ |
| Search by name | ✓ (GitHub Search API) | ✗ (filter own list) | ✗ | ✗ |

**URL parser patterns.** GitHub Desktop's `app/src/lib/remote-parsing.ts:27-95` is the reference — five regexes covering HTTPS, `git@` SCP-like SSH, `ssh://`, `git:`, and GitHub Enterprise `*.ghe.com` variants, plus `owner/repo` shorthand fallback. Copy-pasteable across implementations. Alternative: npm packages like `hosted-git-info` or `parse-github-url` handle more hosts but add a dependency.

**Authenticated repo browse (VSCode's pattern).** `extensions/github/src/remoteSourceProvider.ts:32-147`:

```typescript
class GithubRemoteSourceProvider implements RemoteSourceProvider {
  async getRemoteSources(query?: string) {
    // If no query: returns user's repos via /user/repos
    // If query: searches via /search/repositories + fetches matching repos
    // Protocol (https vs ssh) from 'github.gitProtocol' config
  }
  async getBranches(url) { /* /repos/{owner}/{repo}/branches */ }
}
```

Debounced at 300ms. UI shows repo name, description, stargazer count, icon.

**Phase-appropriate implementation shape.** For a new editor implementation:
- URL paste field accepting HTTPS / SSH / `owner/repo` shorthand (5-regex parser covers 99%)
- Authenticated `/user/repos?per_page=100&sort=updated` list with client-side text filter (rate-limit-safer than hitting Search API per keystroke)
- Branch picker optional — defaulting to the repo's default branch is acceptable initial behavior

---

### D6 + D7: Target directory & progress UX

**Finding:** Target-dir defaults borrow from gh (basename of repo); editor dialogs match GitHub Desktop (full path + validate-empty). Progress rides on stderr sideband-2 via structured plugin.

**Evidence:** [evidence/d6-d7-target-dir-and-progress.md](evidence/d6-d7-target-dir-and-progress.md)

#### Target directory patterns

| Editor | Prompt shape | Default | Validation |
|---|---|---|---|
| VSCode | Pick **parent** folder | `git.defaultCloneDirectory` → `~` | None (lets git fail on conflict) |
| GitHub Desktop | **Full target path** + Choose... button | `<default>/<repo-name>` | Must be empty before Clone enabled |
| gh CLI | Positional arg or derived | `./<repo-name>` (basename of URL minus `.git`) | None |
| Obsidian-Git | Sequential modals | Vault subdir | Warns on overlap with Obsidian config |

**For a CLI command:** match gh's model (`clone <url> [<dir>]`, default basename).
**For an editor dialog:** match Desktop's full-path-with-validate-empty — non-developers understand "this is where your project will live" better than "this is the parent folder."

#### Progress UX

Every editor using native git parses stderr sideband-2. simple-git's plugin (`plugins/progress-monitor-plugin.ts:6-46`):

```typescript
const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString('utf8'));
// emits: { method, stage, progress, processed, total }
```

VSCode maps phases to a weighted 0–100 overall percentage (`extensions/git/src/git.ts:451-476`):
- `Counting objects` → 0–10%
- `Compressing objects` → 10–20%
- `Receiving objects` → 20–60%
- `Resolving deltas` → 60–100%

Rendering surface options: CLI ora spinner with phase label; toast notification with cancel; modal with progress bar. The *data* layer is the same across all renderings.

---

### D8: Post-clone handoff + trust model

**Finding:** Post-clone handoff varies by editor but converges on "open the folder + prompt for trust." Trust model is a first-class security surface: cloned repos drop untrusted configuration files on disk; the editor must gate untrusted configs behind a preview-first confirmation flow.

**Evidence:** [evidence/d8-post-clone-handoff.md](evidence/d8-post-clone-handoff.md)

#### Post-clone patterns

| Editor | Action | Details |
|---|---|---|
| VSCode | 3-option modal | "Open / Open in New Window / Add to Workspace"; then Workspace Trust prompt on folder open |
| GitHub Desktop | Auto-add to repo list | Single-window; no separate "open" step |
| Zed | Open in new workspace | Automatic |
| gh CLI | Print path, exit | Terminal use only; no editor handoff |
| Obsidian-Git | Stay in current vault | Clones as subfolder; user navigates manually |

**General pattern for any editor:** after clone succeeds, (1) determine whether a server/session for the cloned path is already running, (2) either open existing or spawn new, (3) load the folder in the UI, (4) run any first-boot init scaffolding, (5) run trust check.

#### Trust model — why it's not optional

Cloned repos land arbitrary files on disk, including whatever configuration the editor consumes from project-local metadata directories (`.vscode/`, `.obsidian/`, `.cursor/`, etc.). If the editor silently loads this configuration, an attacker can craft a cloned repo whose config enables unexpected behavior — arbitrary task execution (VSCode pre-trust), wide include patterns, disabled safety checks, redirected file-watcher roots, etc.

**VSCode's Workspace Trust** is the reference implementation. `src/vs/workbench/services/workspaces/common/workspaceTrust.ts:294-327` computes trust state; `src/vs/workbench/contrib/workspace/browser/workspace.contribution.ts:452-487` triggers the prompt at workspace load.

Key architectural properties:
- **Persistence:** single JSON blob in app-scoped storage, key `content.trust.model.key`. Format: `{ uriTrustInfo: [{ uri, trusted: boolean }] }`.
- **Longest-prefix matching** (`src/vs/workbench/services/workspaces/common/workspaceTrust.ts:365-401`): trusting `~/Projects/` implicitly trusts all subfolders. Most-specific-prefix wins.
- **Extension gating:** extensions with `capabilities.untrustedWorkspaces.supported !== true` are disabled in untrusted workspaces. Restricted mode is the safety net, not a fallback.
- **Parent-folder checkbox on prompt** ("Trust the authors of all files in the parent folder '{name}'"). Single-folder workspaces only; `file://` and `vscode-remote://` schemes only.
- **Remote authority can force trust** — remote resolvers returning `isTrusted: true` skip the prompt (useful for managed environments).

#### Trust model applied to clone

A cloned repo is a fresh folder that has never been trusted. The editor's first interaction with it triggers the prompt. Acceptable simplifications for editors without VSCode's extension ecosystem:
- Binary (trusted vs untrusted) instead of VSCode's restricted-mode spectrum.
- Per-contentDir trust store (no longest-prefix matching) is simpler and often sufficient.
- "Open read-only" as an in-between option: load the folder for browsing but disable write/execute capabilities until trust is granted.
- If the editor has a "preview mode" primitive (read-only view of historical content), reuse it for the untrusted-project case instead of inventing a new runtime flag.

Trust store schema (modeled on VSCode, simplified):

```yaml
# ~/.<appname>/trust.yml (chmod 0600)
version: 1
trusted:
  - path: /Users/alice/Projects/my-repo    # realpath
    trustedAt: 2026-04-14T10:23:00Z
    origin: https://github.com/owner/my-repo
```

#### Check at launch

On first launch against a cloned directory:
1. Compute realpath of content dir.
2. Look up in trust store.
3. If trusted → boot normally.
4. If NOT trusted AND a project-local config file exists AND was not written by the editor's own init → show trust prompt (preview the config file; three options: trust, open read-only, cancel).
5. If NOT trusted AND no project-local config → safe by construction (editor's init writes trusted scaffolding on first boot). Mark trusted implicitly.

---

### D9: UI naming & information architecture

**Finding:** "Clone" is the universal verb across every studied editor. "Open" means "open a folder already on disk." Primary entry points converge on command palette, empty-state, and File menu.

**Evidence:** [evidence/d9-ui-naming.md](evidence/d9-ui-naming.md)

Naming convergence:

| Editor | Primary label |
|---|---|
| VSCode | "Git: Clone" |
| GitHub Desktop | "Clone a Repository" |
| Zed | "Clone Repository" |
| Obsidian-Git | "Clone an existing remote repo" |
| gh CLI | `gh repo clone` |

None use "Open from GitHub" as canonical. Reasons to align with "Clone":
- Cross-tool muscle memory: users coming from another editor find the feature where they expect
- Docs discoverability: searches for "clone" match
- Semantic precision: "open" elsewhere means local folder

For non-developer audiences, augment with secondary explanatory text: "Download a project from GitHub to edit here" or similar. Users don't need to know what "clone" means to use it.

#### Entry points (common pattern)

1. **Command palette** (power-user entry): "Clone from GitHub..." — always available.
2. **Empty state** (new-user entry): when the editor launches with no project, one of three cards: "Clone from GitHub" / "Open folder on disk" / "Create new project."
3. **File menu** (discoverable entry): "File → Clone from GitHub..." — available while a project is loaded; opens result in new window or replaces current.

All three surfaces typically route to the same dialog/flow.

---

### D10: Architectural seam archetypes

**Finding:** Three archetypes exist. Each has a structural fit test against the editor's codebase. Most on-device editors land on Archetype A, or A+C for multi-project workflows.

**Evidence:** [evidence/d10-architectural-seams.md](evidence/d10-architectural-seams.md)

#### Archetype A: CLI orchestrator (clone → init → start chain)

**Shape:**
```
CLI subcommand or launcher action:
  1. simpleGit / git2 / libgit2 clone <url> → <target-dir>
  2. Run editor's init scaffolding on <target-dir> (idempotent)
  3. Invoke editor's normal start flow on <target-dir>
  4. Open browser / UI to the newly-started instance
```

**Fit test:**
- Editor has an existing start command that accepts a path argument ✓
- Editor's init is idempotent on non-empty directories ✓
- Editor can be invoked multiple times with different paths ✓

**When it's right:** Nearly always, if the editor has a CLI launcher. Simplest architecture; no server-level changes.

**Prior art:** `gh repo clone` (orchestrates git clone with auth injection); VSCode's internal `--folder-uri` argument handling.

**Weaknesses:** CLI-only until paired with a UI entry point (empty-state button that shells to the CLI subcommand). Spawning processes per project is heavier than in-process reconfiguration (but not noticeably so on modern hardware).

#### Archetype B: In-server hot-swap endpoint

**Shape:**
```
POST /api/open-repo { url }
  Running editor server:
  1. Clone repo into new directory
  2. Call server.reconfigure(newContentDir)
  3. Notify all connected clients of the new content
  4. Swap in-memory document state
```

**Fit test:**
- Server factory exposes a `reconfigure(newContentDir)` or equivalent method ✓
- Persistence layer can switch scopes without cross-contamination ✓
- In-memory document state can be torn down and rebuilt safely ✓
- File watcher supports stop-and-restart cleanly ✓
- Connected clients handle a "content dir changed" message ✓

**When it's right:** Rare. Most editor architectures bake the content-dir assumption deep into the server at construction time: file watchers scoped to a specific path, persistence drivers opened against a specific dir, locks acquired per-dir. Reconfiguration would require fundamental refactoring.

**When it's wrong:** If your server factory exposes only `start()` / `destroy()` and the internal state is closed over the content dir at construction, hot-swap requires rebuilding all of it while clients stay connected — creates race windows, orphaned sockets, cross-project contamination. Don't force it.

**Prior art:** None common in the editor ecosystem we studied. More common in server-side CMS architectures (which have different constraints).

#### Archetype C: Multi-process launcher (detect-or-spawn)

**Shape:**
```
Launcher:
  1. Read <target-dir>/<app-lock-file> if present
  2. If lock is live + has a published port/URL:
       open browser/UI to that URL
  3. If no lock or stale lock:
       spawn a new server instance on <target-dir>
       wait for it to publish its port
       open browser/UI to the new instance
```

**Fit test:**
- Server uses a lock file (or equivalent) to prevent multiple instances per directory ✓
- Architecture supports multiple server instances running simultaneously against different directories ✓
- Lock file publishes enough metadata (port, URL) for a launcher to connect ✓

**When it's right:** Products used on multiple projects simultaneously. Users can clone repo A, keep editing, clone repo B in a new window, both run in parallel. No forced "switch projects" context-loss.

**Prior art:** VSCode's behavior when opening a folder — detects an existing window for that folder and brings it to focus, or opens a new window. GitHub Desktop's single-window model does the opposite — no C.

**Weaknesses:** Process proliferation on heavy-switching workflows. Not all editor OSes integrate cleanly with "spawn a new server, wait for port, then open browser" — platform-specific sequencing.

#### Decision tree

```
Q4 of D1 methodology: Does your server factory expose a reconfigure hook?
├─ YES and you want single-window UX → B (in-server hot-swap)
└─ NO
   ├─ Users switch projects rarely / single-window UX acceptable → A
   └─ Users work on multiple projects simultaneously → A (for clone) + C (for "open again")
```

When uncertain: A is the safe default. C composes cleanly on top of A (A does the clone; C is what the editor's launcher does when the user later returns to the cloned dir). B is the exception, not the rule.

#### Cross-archetype invariants

Regardless of archetype chosen:
- Clone must land files at a predictable path so the editor's normal "open this folder" flow can pick them up.
- Post-clone init must be idempotent — if the cloned repo already contains the editor's project-local metadata, init must preserve it.
- Trust check must fire on first boot against the cloned dir (D8).

---

### D11: Adjacent editor patterns (Logseq, TinaCMS)

**Finding:** Neither introduces patterns outside the Tier-1 landscape. Both confirm the "right answer" sits inside the space already analyzed.

**Evidence:** [evidence/d11-adjacent-editors.md](evidence/d11-adjacent-editors.md)

- **Logseq:** No clone feature. Onboarding is folder-only — the user clones externally (`git clone` or GitHub Desktop), then "Open graph" in Logseq. This is the minimum-viable-option pattern: ship nothing, offload clone to external tools. Viable for developer audiences; unsuitable for non-developer onboarding flows.
- **TinaCMS:** Uses isomorphic-git for *reading* git state only. GitHub integration is server-side Octokit REST over the Contents API, not on-device clone. Architecture depends on a Next.js backend holding the token — not applicable to no-backend products.

---

## Limitations & Open Questions

### Dimensions addressed in-report (not deferred)
- Token storage architecture: OS keychain + file fallback, both on day one.
- Auth tiers: all three ship from day one.
- Trust model: ships with feature; preview-first confirmation UX.
- URL input: composite paste + browse from day one.
- UI surfaces: CLI + empty-state + header menu.

### Out of scope (per rubric)
- Multi-project registry / switching UX.
- Push / PR / sync-back flows.
- GitHub Enterprise auth specifics beyond host substitution.
- GitLab / Bitbucket equivalents.
- Permission / access-control model design.

### Pre-merge verifications required (gated, not deferred)

For any implementer:
- Runtime-compatibility smoke tests of chosen git library and keychain binding (especially on non-Node runtimes like Bun).
- OAuth App registration + `clientId` commit + `client_secret` discard.
- Privacy policy URL publication.
- Scope decision committed: `repo` for private-repo support; `public_repo` for public-only variants.
- Trust-prompt UX signoff (what's shown, when, with what default).

### Open research question surfaced by common post-clone expectations

**Cloned-repo history visibility:** editors that maintain their own version history (attribution journal, timeline, etc.) over content face a question when a user clones a repo with existing git history: does the editor's history view surface the pre-clone commits from the cloned `.git/`, or only edits made within the editor post-clone? Options:

- **Editor history stays scoped to its own journal.** Consistent with internal model; user reads external history via other tools.
- **Ingest cloned git log at clone time.** Replay the project repo's markdown-touching commits as synthetic history entries with original author attribution.
- **Unified history query.** Editor's history queries span both its own journal and the project repo's git log, merged by author date.

Each option has implications for query performance, attribution fidelity, and user expectation management. Specific editors may resolve this differently based on their history model; it is a cross-feature decision that clone spec work should surface rather than silently choose.

---

## References

### Evidence Files
- [evidence/d1-methodology-init-surface-mapping.md](evidence/d1-methodology-init-surface-mapping.md)
- [evidence/d2-clone-execution-mechanisms.md](evidence/d2-clone-execution-mechanisms.md)
- [evidence/d3-github-auth-patterns.md](evidence/d3-github-auth-patterns.md)
- [evidence/d4-token-storage.md](evidence/d4-token-storage.md)
- [evidence/d5-url-input-repo-picker.md](evidence/d5-url-input-repo-picker.md)
- [evidence/d6-d7-target-dir-and-progress.md](evidence/d6-d7-target-dir-and-progress.md)
- [evidence/d8-post-clone-handoff.md](evidence/d8-post-clone-handoff.md)
- [evidence/d9-ui-naming.md](evidence/d9-ui-naming.md)
- [evidence/d10-architectural-seams.md](evidence/d10-architectural-seams.md)
- [evidence/d11-adjacent-editors.md](evidence/d11-adjacent-editors.md)

### External Sources

**Editors studied:**
- [microsoft/vscode](https://github.com/microsoft/vscode) — `extensions/git`, `extensions/github-authentication`, `extensions/github`, workspace trust
- [desktop/desktop](https://github.com/desktop/desktop) — GitHub Desktop clone UI + OAuth flow
- [desktop/dugite](https://github.com/desktop/dugite) — embedded-git wrapper
- [desktop/dugite-native](https://github.com/desktop/dugite-native) — prebuilt git binary releases
- [zed-industries/zed](https://github.com/zed-industries/zed) — `crates/git_ui/src/clone.rs`, `crates/git/Cargo.toml`
- [denolehov/obsidian-git](https://github.com/denolehov/obsidian-git) — dual-backend git plugin
- [cli/cli](https://github.com/cli/cli) — gh CLI source, `AuthenticatedCommand` pattern

**Libraries:**
- [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) — pure-JS git
- [steveukx/git-js (simple-git)](https://github.com/steveukx/git-js) — Node git wrapper
- [octokit/auth-oauth-device.js](https://github.com/octokit/auth-oauth-device.js) — Device Flow Node library
- [Brooooooklyn/keyring-node (@napi-rs/keyring)](https://github.com/Brooooooklyn/keyring-node) — keytar replacement
- [magarcia/cross-keychain](https://github.com/magarcia/cross-keychain) — cascade wrapper
- [hwchen/keyring-rs](https://github.com/hwchen/keyring-rs) — Rust foundation for @napi-rs/keyring

**GitHub platform:**
- [GitHub OAuth Apps documentation](https://docs.github.com/en/apps/oauth-apps) — for OAuth App registration
- [GitHub Apps documentation](https://docs.github.com/en/apps) — for the OAuth-App-vs-GitHub-App decision
- [Device Authorization Grant on GitHub](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-cli-with-a-github-app) — Device Flow specifics

**Standards:**
- [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) — authoritative guidance on native-app OAuth
- [RFC 8628 — OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628) — Device Flow spec
