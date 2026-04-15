# Clone from GitHub — Spec

**Status:** Approved (ready for /decompose)
**Owner(s):** Nick Gomez (CPO/CTO), Miles Kaming-Thanassi (server/UI/MCP)
**Last updated:** 2026-04-14
**Baseline commit:** f17ad00
**Links:**
- Research report: `reports/open-from-github-onboarding-mechanics/REPORT.md`
- Research evidence: `reports/open-from-github-onboarding-mechanics/evidence/` (10 files)
- Spec evidence: `specs/2026-04-14-clone-from-github/evidence/`
- Timeline spec (precedent): `specs/2026-04-10-document-timeline-rollback/SPEC.md`
- Prior library report: `reports/git-library-for-knowledge-platform/REPORT.md`
- Prior onboarding report: `reports/onboarding-multiproject-ux/REPORT.md`

---

## 1) Problem statement

**Situation.** Open Knowledge is a local-first CRDT markdown editor targeting both developers and non-developers at B2B SaaS companies (marketing, ops, growth alongside engineering). It ships as the `@inkeep/open-knowledge` CLI with a React web editor. PR #39 just landed Timeline & Rollback — the first user-visible surface for the shadow-repo attribution journal — making the editor genuinely capable of real knowledge work. To use the editor today, users must: (a) have a directory of markdown on disk, (b) run `open-knowledge start` in it, (c) open the browser. There is no path from "I saw a markdown repo on GitHub" to "I'm editing it in Open Knowledge" that doesn't require terminal fluency (git/gh installed, clone semantics, path navigation).

**Complication.** The "manually clone then start" workflow assumes developer fluency and contradicts the product's non-developer positioning. The editor has no content discovery: non-developers land on an empty editor with no way to populate it from the wealth of markdown knowledge bases on GitHub (playbooks, docs repos, Obsidian vaults shared as repos, AI-generated knowledge bases). With the editor capabilities now real post-PR-#39, the bottleneck shifts from "is the editor good?" to "how do users get content in?" Competitively, every shipped desktop editor with non-developer ambitions (VSCode, Cursor, GitHub Desktop, Obsidian-Git) has clone-from-GitHub — Open Knowledge lacks table stakes.

**Resolution.** Ship "Clone from GitHub" as a first-class onboarding path: CLI subcommand (`open-knowledge clone <url> [<dir>]`) + editor-side empty-state UI + File menu entry, routing through one orchestrator module. Auth via OAuth App Device Flow + gh delegation + PAT fallback — no backend required. Trust model ships with the feature: cloned repos open in a trust-pending read-only state until explicitly trusted, gating agent-writes. Upstream-import tracking completes with a startup HEAD-drift check that captures git operations that occurred while the server was offline — including the initial clone. All surfaces, auth tiers, and trust model ship in one iteration (greenfield directive).

## 2) Goals

- **G1:** A non-developer at a B2B SaaS company can go from "I have a GitHub URL" to "I'm editing it in Open Knowledge" in under 60 seconds, without terminal commands (via editor UI) or with one terminal command (via CLI).
- **G2:** A developer with `gh` installed and logged in can clone a private repo into Open Knowledge with zero additional authentication steps — gh's existing session is reused transparently.
- **G3:** The trust model prevents untrusted cloned repos from silently configuring Open Knowledge's autonomous agent-write capability.
- **G4:** Upstream-import tracking is complete across server lifecycle — git operations (pull, merge, checkout) that occur while the server is offline are captured in the shadow repo and visible in the timeline on next startup.
- **G5:** Clone works for any git host (GitHub, GHES, GitLab, Bitbucket, self-hosted) via URL paste. Authenticated repo browse + Device Flow sign-in are GitHub.com-specific.

## 3) Non-goals

- **[NEVER]** NG1: In-server hot-swap of content directories. Architecturally wrong for our one-server-per-contentDir model (see research D10 evidence).
- **[NOT NOW]** NG2: Push / PR / sync-back flows. Inverse direction; separate feature. — Revisit if: users ask "I cloned and edited, how do I push back?"
- **[NOT NOW]** NG3: Multi-project registry / workspace switching UI. Covered by `onboarding-multiproject-ux` report. — Revisit if: users clone multiple repos and want to switch between them in the editor.
- **[NOT NOW]** NG4: GitLab / Bitbucket-specific browse picker. URL paste works for any host; only GitHub.com gets a browse-my-repos affordance. — Revisit if: significant user demand for non-GitHub browse.
- **[NOT NOW]** NG5: GitHub Enterprise Device Flow. Requires admin-side OAuth App registration on each GHES instance (VSCode/gh have the same constraint). GHES users use PAT or gh delegation. — Revisit if: enterprise customer demand justifies admin-onboarding flow.
- **[NOT NOW]** NG6: Cloned-repo git-log ingestion into timeline. Timeline stays shadow-only. The startup HEAD-drift check creates a single T0 upstream-import entry on clone. Full project-repo log traversal is a separate "File History" feature. — Revisit if: migration users consistently ask "where's my pre-import history?"
- **[NOT UNLESS]** NG7: Bundled git binary (dugite-style). Product already requires git on PATH via shadow-repo. — Only if: significant Windows non-developer adoption where git is not pre-installed.

## 4) Personas / consumers

- **P1: Non-developer knowledge worker.** Marketing/ops/growth at a B2B SaaS company. Saw a markdown docs repo on GitHub (public playbook, shared research log, AI-generated KB). Wants to browse and edit. Little terminal fluency. Probably does NOT have `gh` installed.
  - **Setup precondition.** P1 does not install the CLI or run `open-knowledge start` themselves. A colleague (developer teammate, IT admin, onboarding buddy) installs the CLI once and either (a) creates a launcher/shortcut, (b) gives P1 a bookmark to `http://localhost:<port>` with an autostart mechanism, or (c) the CLI will later ship a platform-native desktop launcher (future work). P1's entry point is the **editor UI in the browser** — they never touch the terminal. The editor-side clone flow (ProjectPicker + CloneDialog) is P1's primary surface.
- **P2: Developer with `gh`.** Already logged in via `gh auth login`. Wants to clone a work repo to get timeline, agent writes, MCP tools. Expects terminal parity with `gh repo clone`. CLI is P2's primary surface.
- **P3: Team member joining a shared KB.** Teammate sends a GitHub URL. May be dev-fluent or not. If dev-fluent, follows P2's path. If not, follows P1's path (colleague sets them up).

## 5) User journeys

### P1: Non-developer clones a public playbook from the editor UI

1. User launches `open-knowledge start` for the first time (or opens a browser to an already-running instance with no content loaded).
2. Empty-state screen shows three cards: **"Clone from GitHub"** / "Open folder on disk" / "Start fresh."
3. User clicks "Clone from GitHub." A dialog opens with a text input ("Paste a GitHub URL or search your repos") and a "Sign in to GitHub" button.
4. User pastes `https://github.com/company/sales-playbook`. The dialog parses it, shows "company/sales-playbook" with a "Clone" button and a local path field auto-filled to `~/Documents/sales-playbook`.
5. User clicks "Clone." A sonner toast appears: "Cloning sales-playbook... Receiving objects: 42%."
6. Clone completes (~5 seconds for a small repo). Toast updates: "Opening sales-playbook..."
7. A new server instance spawns targeting `~/Documents/sales-playbook`. Browser redirects to `http://localhost:<new-port>`. Auto-init scaffolds `.open-knowledge/`.
8. User sees the file tree populated with the playbook's markdown files. They click one and start editing.

**Aha moment:** "I went from a GitHub link to editing in 30 seconds."

### P2: Developer clones a private repo via CLI

1. Developer runs `open-knowledge clone https://github.com/inkeep/internal-docs`.
2. CLI detects `gh` on PATH, runs `gh auth token` — succeeds. Passes `credential.helper='!gh auth git-credential'` to simple-git. No auth UI shown.
3. Clone runs with `--progress`. Terminal shows: `Cloning into './internal-docs'... Receiving objects: 100% (500/500), done.`
4. CLI runs `open-knowledge start --content-dir ./internal-docs`. Auto-init scaffolds `.open-knowledge/`.
5. Browser opens to `http://localhost:3000`. Developer sees their docs.

**Aha moment:** "Same as `gh repo clone` but I'm already in the editor."

### P1: Non-developer signs in to clone a private repo

1. Same as P1 journey steps 1-3. User pastes a private repo URL.
2. Clone attempt returns 401. Dialog shows "Sign in to GitHub to access private repos."
3. User clicks "Sign in to GitHub." A modal appears: "Your code: **ABCD-1234** (copied to clipboard). Browser opening — paste this code there."
4. Browser opens `https://github.com/login/device`. User pastes the code. GitHub shows "Authorize Open Knowledge?" with `repo` scope. User clicks "Authorize."
5. Modal polls and detects approval (~5 seconds). Shows "Signed in as @username." Token stored in OS keychain (or `~/.open-knowledge/auth.yml` fallback).
6. Clone retries automatically. Proceeds as P1 steps 5-8.

**Aha moment:** "I didn't have to figure out tokens or SSH keys."

### P3: Team member opens an untrusted repo

1. Teammate sends a GitHub URL for a shared KB repo. P3 clones via CLI or editor UI.
2. The cloned repo already has a `.open-knowledge/config.yml` (it was set up by the teammate).
3. On first start, the server detects: `.open-knowledge/config.yml` exists AND auto-init did NOT run this boot (dir pre-existed) AND this dir is not in `~/.open-knowledge/trust.yml`.
4. Editor opens in **trust-pending mode** — all documents render in source-mode read-only with a project-level banner: "This project was cloned from github.com/team/shared-kb. Review its settings before editing. [Review config] [Trust and enable editing] [Keep read-only]." Trust-pending is a server-instance-level flag, not document-level like PR #39's diff/preview mode.
5. P3 clicks "Trust and enable editing." Dir is written to `~/.open-knowledge/trust.yml`. Editor transitions from preview to editing mode. Agent-write endpoints are now active.

**Failure path:** P3 clicks "Review config" → `.open-knowledge/config.yml` opens in read-only view. If it contains suspicious include patterns or unfamiliar settings, P3 can choose "Keep read-only" and ask the teammate to explain.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Clone dialog (URL input) | Parsing URL... | "Paste a GitHub URL or search your repos" | "Invalid URL format" / "Repository not found" | Shows repo name + clone button | N/A |
| Clone dialog (repo browse) | Fetching repos... spinner | "Sign in to see your repos" | "Couldn't fetch repos" + retry | Scrollable filtered list | N/A |
| Clone progress (toast) | "Cloning {repo}... {phase}: {pct}%" | N/A | "Clone failed: {reason}" + retry/dismiss | "Opening {repo}..." | N/A |
| Auth (Device Flow modal) | "Waiting for authorization..." + polling | N/A | "Authorization timed out" / "Authorization denied" | "Signed in as @{user}" | N/A |
| Auth (PAT input) | Validating token... | "Paste a personal access token" | "Invalid token" / "Token missing required scopes" | "Signed in as @{user}" | N/A |
| Trust banner | N/A | N/A | N/A | "This project was cloned from {origin}..." | N/A |
| Empty-state (ProjectPicker) | N/A | Three cards: Clone / Open / Start fresh | N/A | N/A | N/A |
| Timeline after clone | "No history yet" → then T0 upstream-import entry appears after HEAD-drift check | If shadow init failed: "History unavailable" (graceful, per timeline spec FR15) | N/A | T0 entry: "upstream: initial import at {sha}" | N/A |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | CLI `open-knowledge clone <url> [<dir>]` command | Clones any git URL to `<dir>` (default: `./<repo-name>`). Chains into `open-knowledge start --content-dir <dir>`. Progress shown in terminal via simple-git progress plugin. Exit code 0 on success, non-zero with descriptive error on failure. | Registers alongside `start`, `init`, `mcp`, `preview` in `cli.ts` |
| Must | FR2 | Three-tier auth with detection-driven selection | (A) `gh auth token` succeeds → pass `credential.helper='!gh auth git-credential'` to simple-git. (B) Device Flow via `@octokit/auth-oauth-device` with `config.github.oauthAppClientId` (defaults to `Ov23liqlSd0V1MwR6rhI`; overridable via env var `OPEN_KNOWLEDGE_GITHUB_CLIENT_ID`). (C) PAT paste with `/user` validation — UI suggests "For read-only access, use a fine-grained PAT with `Contents: Read` scope." Selection: A if gh detected → stored token if present → B as default sign-in → C as menu fallback. | All three tiers functional from day one. Auth lives in CLI subcommands (not server HTTP endpoints) — see FR13 architecture. |
| Must | FR3 | OAuth App Device Flow UX | On `onVerification`: auto-copy `user_code` to clipboard, auto-open `verification_uri` in default browser, show modal with visible code + "Waiting for authorization..." + cancel. Poll with `authorization_pending`/`slow_down` handling. 2-minute timeout with "Try again" option. | Matches VSCode pattern (`flows.ts:387-520`) |
| Must | FR4 | Token storage: `@napi-rs/keyring` + plaintext fallback | `TokenStore` interface: `get(host)`, `set(host, login, token)`, `clear(host)`, `backend` property. Primary: OS keychain via `@napi-rs/keyring`. Fallback: `~/.open-knowledge/auth.yml` (`chmod 0600`) when keyring unavailable. Keyed by hostname. | Both paths ship together; log active backend at startup |
| Must | FR5 | URL parser: 5-regex + owner/repo shorthand | Accepts: `https://host/owner/repo(.git)?`, `git@host:owner/repo(.git)?`, `ssh://git@host/owner/repo(.git)?`, `git:host/owner/repo(.git)?`, `*.ghe.com` SSH variant, `owner/repo` shorthand (defaults to github.com). Returns `{protocol, hostname, owner, name}` or null. | Port Desktop's `remote-parsing.ts:27-95` |
| Must | FR6 | Target directory validation | Default: `./<repo-name>` (CLI) or `~/Documents/<repo-name>` (editor dialog). Validate target is empty or non-existent before clone. Clear error if target exists and is non-empty. Editor dialog has "Choose..." button for folder picker. | Matches Desktop's validate-empty pattern |
| Must | FR7 | Clone progress via sonner toast (editor) and terminal output (CLI) | Parse simple-git progress events `{method, stage, progress, processed, total}`. Phase-weighted percentage: Counting 0-10%, Compressing 10-20%, Receiving 20-60%, Resolving 60-100%. Cancel button on toast. | Reuses sonner primitive from PR #39 |
| Must | FR8 | Post-clone handoff: mode-dependent | Terminal mode (`open-knowledge clone <url>` without `--json`): clone completes → read `<target>/.open-knowledge/server.lock`; if live server exists → open browser to its port; else spawn `open-knowledge start --content-dir <target>` → wait for lock's port → open browser. JSONL mode (`--json`, spawned by editor): clone completes → emit `{"type":"complete","dir":"<path>"}` JSONL line → exit. The JSONL consumer (editor) issues a SEPARATE `POST /api/local-op/open` request to spawn/attach the server. Prevents orphan servers when editor tab closes mid-clone. | Terminal UX unchanged; editor decouples clone from server start. |
| Must | FR9 | Trust model: `~/.open-knowledge/trust.yml` | `start.ts` exports its `didAutoInit: boolean` (true when auto-init ran this boot) via a new `createServer()` option. In `createServer()`, compute `trustPending`: if `didAutoInit === false` (dir pre-existed) AND realpath(contentDir) is NOT in `~/.open-knowledge/trust.yml` → `trustPending = true`. Editor renders a project-level trust banner with [Review config] [Trust and enable] [Keep read-only]. All documents open in source-mode read-only while `trustPending`. On "Trust and enable": append `{path: realpath, trustedAt, origin?}` to trust.yml → `trustPending = false` → editor transitions to normal mode. Trust persists across restarts via trust.yml. | Unforgeable: `didAutoInit` is a runtime boolean set by server code, not readable from disk. Replaces the sentinel-based detection (rejected: spoofable by including the sentinel in a shipped malicious config.yml). Separate from PR #39's diff/preview mode. |
| Must | FR10 | `FORBIDDEN_UNTRUSTED` gate on agent-write endpoints | When trust is pending: `/api/agent-write`, `/api/agent-write-md`, `/api/agent-patch` return `403 { ok: false, error: 'FORBIDDEN_UNTRUSTED', message: 'Trust this project before running agent writes' }`. MCP stdio tools that call these endpoints surface the error. `/api/rollback` is NOT gated (user-initiated). `/api/save-version` is NOT gated (user-initiated). | Clear error for MCP consumers |
| Must | FR11 | Startup HEAD-drift check | On `createServer()` after `initShadowRepo()`: read `<shadowDir>/last-known-head`, compare against current project HEAD SHA. If different (including null → SHA for fresh shadow) → `commitUpstreamImport(shadow, contentRoot, lastKnownHead, currentHead, branch)`. Write current HEAD to file. On `destroy()` before shadow lock release: write current HEAD to file. | ~20 lines. Uses existing `commitUpstreamImport()`. Subsumes T0 clone case. |
| Must | FR12 | Editor empty-state: ProjectPicker component | Full-screen component shown when no project is loaded (no active documents). Three cards: "Clone from GitHub" / "Open folder on disk" / "Start fresh." "Clone from GitHub" opens the clone dialog (FR13). "Start fresh" invokes existing `NewItemDialog` (from PR #127, same flow as the current "Create your first file" CTA). ProjectPicker supersedes the inline CTA when it mounts — the NewItemDialog wiring is preserved, only the entry-point UI changes. | New React component in `packages/app/src/components/`. **Coordinate with Andrew (PR #127 owner) before implementation** — our picker extends his shipped empty state additively. |
| Must | FR13 | Clone dialog (editor-side) | Composite input: URL paste field at top + authenticated repo browse list below (when signed in). URL field accepts any git URL format. Local path field with "Choose..." folder picker. "Clone" button triggers `POST /api/local-op/clone` (server relay that spawns `open-knowledge clone --json`). Sign-in is driven by `POST /api/local-op/auth/login` (spawns `open-knowledge auth login --json`). Auth state check via `POST /api/local-op/auth/status` (spawns `open-knowledge auth status --json`). Repo browse list via `POST /api/local-op/auth/repos` (spawns `open-knowledge auth repos --json`). Each server endpoint is a thin subprocess relay (see §9 security section). Progress and auth events streamed to sonner toast / AuthModal as JSONL. | New React component + new CLI subcommands `auth status/login/repos/signout`. No stateful server HTTP auth endpoints — auth is CLI-canonical; server relays subprocess output. |
| Must | FR14 | Non-GitHub URL handling | When parsed URL hostname ≠ github.com: skip Tier A/B/C auth affordances. Set `GIT_TERMINAL_PROMPT=0`. Let system git credentials (SSH agent, credential manager) handle auth. If clone fails with auth error → clear error: "Couldn't authenticate to {hostname}. Make sure your system git is configured for this host." | Matches VSCode behavior for non-GitHub remotes |
| Must | FR15 | File menu entry: "Clone from GitHub..." | Menu item in the editor header (or File menu equivalent). Opens the same clone dialog as FR13. Available when a project IS loaded — result opens in a new browser tab against the new server instance. | Complements the empty-state entry point |
| Should | FR16 | `owner/repo` shorthand recognition | Typing `inkeep/open-knowledge` in the URL field → auto-resolve to `https://github.com/inkeep/open-knowledge`. Show "github.com/inkeep/open-knowledge" as hint text below the input. | Matches Desktop + gh behavior |
| Should | FR17 | Signed-in user indicator | After successful auth (any tier): show "Signed in as @{username}" with avatar in the clone dialog header. "Sign out" option that calls `TokenStore.clear(host)`. | Feedback that auth worked |
| Could | FR18 | Branch picker | After URL is validated and repo is accessible: dropdown to pick a branch (default: repo's default branch). `GET /repos/{owner}/{repo}/branches` paginated. | VSCode offers this; Desktop does not. Deferred if costly. |

### Non-functional requirements

- **Performance:** Clone of a 10MB repo completes in <30 seconds on broadband. Progress updates every 1-2 seconds during Receiving phase. Dialog open → repo cards rendered in <500ms (repos API latency-bound).
- **Reliability:** Clone failure (network drop, auth failure, disk full) leaves no partial clone on disk (simple-git cleans up on failure). Error message is actionable. Retry is available.
- **Security/privacy:** No `client_secret` on user disk. OAuth App `clientId` is public (committed to source; configurable via env/config for forks + resilience). Tokens in OS keychain or `0600`-permission file. Trust model uses unforgeable `didAutoInit` runtime signal (not disk-derived). Agent writes gated on `trustPending`. `GIT_TERMINAL_PROMPT=0` prevents credential prompt hangs. **Local-op endpoints** (`/api/local-op/*`) bind to `127.0.0.1` only, require `Origin` header matching server's host, confine `--dir` args to user's home directory (path traversal rejected), allowlist URL protocols (`https`, `ssh`, `git://`, `git@<host>:` form), and enforce a concurrency limit of 1 active subprocess per endpoint to prevent fork-bomb. **OAuth scope trade-off (known):** GitHub's classic OAuth scope model has no `repo:read`; `repo` grants read+write. Our clone feature uses read only but must request `repo` for Device Flow to access private repos. Users may find this concerning; the Tier C (PAT) path mitigates by suggesting fine-grained PATs with `Contents: Read` scope for read-only access.
- **Operability:** `[clone] url=<url> host=<host> auth=<tier> duration=<ms> result=<ok|error>` logged for every clone attempt. `[auth] host=<host> tier=<A|B|C> backend=<keyring|file> result=<ok|error>` logged for every auth event. `[trust] dir=<path> action=<trust|read-only|review>` logged for trust decisions.

## 7) Success metrics & instrumentation

- **M1: Time-to-first-edit.** User initiates clone → first keystroke in editor. Target: <60 seconds for repos <50MB on broadband.
  - Instrumentation: `[clone] started_at` → `[editor] first_keystroke_at` delta.
- **M2: Auth success rate.** Percentage of clone attempts that succeed on the first auth attempt (any tier).
  - Instrumentation: `[auth] tier=<A|B|C> result=<ok|error|cancelled>` counters.
- **M3: Trust prompt completion rate.** Percentage of trust prompts where user clicks "Trust and enable" vs "Keep read-only" vs closes dialog.
  - Instrumentation: `[trust] action=<trust|read-only|review|dismiss>` counters.
- **M4: Clone error rate.** Percentage of clone attempts that fail (network, auth, disk).
  - Instrumentation: `[clone] result=<ok|error> error_type=<auth|network|disk|parse>` counters.
- No baseline exists (greenfield). First 30 days of data establishes the baseline.

## 8) Current state (how it works today)

- **CLI:** Four commands (`start`, `init`, `mcp`, `preview`). No `clone`. No project-picking UI at the CLI level.
- **Editor:** Assumes content dir already exists. Empty state shows a **"Create your first file" CTA** (PR #127, shipped 2026-04-14 — Andrew's `specs/2026-04-14-file-sidebar-new-file/SPEC.md`). Creating files has four entry points: `+` icon in sidebar header → DropdownMenu, folder-row context menu, `Cmd/Ctrl+Alt+N` keyboard shortcut, empty-state CTA. Dialog component: `NewItemDialog.tsx` (supports file + folder). `FileTree.tsx` still shows "No files yet." alongside the CTA. No "open project" / "clone repo" flow exists.
- **Git dependency:** `simple-git` is already a server dependency (`packages/server/src/shadow-repo.ts:16`) for the shadow-repo WIP attribution journal. Used via `git.raw(...)` for plumbing commands.
- **Shadow repo:** `.git/openknowledge/` (integrated) or `.openknowledge/` (standalone). Per-writer WIP refs, checkpoint refs, upstream-import commits. `commitUpstreamImport()` exists with the `!oldHead` message branch already written but never called for T0.
- **Auto-init:** `start.ts:36-50` calls `runInit({ cwd, mcp: false })` if `.open-knowledge/` is absent. This is the post-clone seam — clone lands files, `start` handles init.
- **Server lock:** One-server-per-contentDir via `server.lock` in `<contentDir>/.open-knowledge/`. `readServerLock()` available for detect-or-spawn pattern.
- **Editor modes:** `'wysiwyg' | 'source' | 'diff'` state machine (from PR #39 timeline spec, `EditorPane.tsx:16`). Diff mode shows historical versions (per-document, triggered by timeline entry selection). Source mode shows CodeMirror with markdown. Trust-pending is a new project-level flag orthogonal to these document-level modes — see FR9.
- **Toast primitive:** `sonner` added in PR #39 (`packages/app/src/components/ui/sonner.tsx`). Reusable for clone progress.
- **No persisted state across restarts:** `reconciledBase`, `lastKnownHash`, `oldHead` are all in-memory. Shadow WIP refs persist in git but are never compared against disk at startup.

## 9) Proposed solution (vertical slice)

### Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│ Browser (React)                                                     │
│                                                                     │
│  ┌─ No project loaded ──────────────────────────────────────────┐  │
│  │  ProjectPicker (full-screen empty state)                      │  │
│  │  ├── [Clone from GitHub]  ──► CloneDialog                     │  │
│  │  ├── [Open folder on disk]                                    │  │
│  │  └── [Start fresh]                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Project loaded ─────────────────────────────────────────────┐  │
│  │  EditorHeader ── [File → Clone from GitHub...] ──► CloneDialog│  │
│  │  EditorArea (TipTap / CodeMirror / Preview mode)              │  │
│  │  TrustBanner (if trustPending) ── [Trust] [Read-only] [Review] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  CloneDialog ─────────────────────────────────────────────────────  │
│  ├── URL input (paste or type)                                     │
│  ├── Repo browse list (signed-in: /user/repos; else: sign-in CTA) │
│  ├── Local path + Choose...                                        │
│  ├── [Clone] button                                                │
│  └── Progress: sonner toast (phase-weighted %)                     │
│       ├── On success: spawn server for <target>, redirect browser  │
│       └── On failure: error toast with retry                       │
│                                                                     │
│  AuthModal (Device Flow) ──────────────────────────────────────────│
│  ├── "Your code: ABCD-1234 (copied)" + browser auto-opened        │
│  ├── Polling indicator + cancel                                    │
│  └── On success: "Signed in as @user" → dismiss → retry clone     │
└─────────────────────────┬──────────────────────────────────────────┘
                          │ HTTP (clone dialog spawns CLI subprocess;
                          │ new server instance serves the cloned project)
┌─────────────────────────▼──────────────────────────────────────────┐
│ CLI: open-knowledge clone <url> [<dir>]                             │
│                                                                     │
│  1. parseGitHubUrl(input) → {protocol, host, owner, name}          │
│  2. resolveTargetDir(dir, url) → validate empty                    │
│  3. resolveAuth(host) → gh / stored / device-flow / PAT            │
│  4. simpleGit({config: authConfig, progress: callback})            │
│       .clone(url, target, ['--progress'])                          │
│  5. Post-clone: readServerLock(target)                              │
│     ├─ live? → openBrowser(existingPort)                           │
│     └─ else? → spawn `open-knowledge start --content-dir <target>` │
│                → wait for server.lock port → openBrowser            │
└─────────────────────────┬──────────────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────────────┐
│ Server: createServer({ contentDir: <target> })                      │
│                                                                     │
│  Boot sequence (initAsync):                                         │
│  1. initShadowRepo(projectDir)                                     │
│  2. ★ HEAD-drift check: read last-known-head, compare vs current   │
│     → commitUpstreamImport() if diverged (T0 on fresh clone)       │
│  3. startWatcher(contentDir)                                        │
│  4. startHeadWatcher(projectDir)                                    │
│  5. Trust check: if untrusted config.yml → set trustPending flag    │
│                                                                     │
│  Runtime:                                                           │
│  ├── Trust gate: agent-write endpoints check trustPending → 403     │
│  ├── Rollback, save-version: NOT gated (user-initiated)            │
│  └── Timeline: /api/history returns T0 upstream-import entry       │
│                                                                     │
│  Shutdown (destroy):                                                │
│  └── Write currentHead to <shadowDir>/last-known-head              │
│      (before shadow lock release, per CC8 ordering)                │
└────────────────────────────────────────────────────────────────────┘
```

### API design

#### Editor-to-CLI subprocess protocol

The clone dialog (running in the browser) calls `POST /api/local-op/clone` on the running server. The server endpoint spawns `open-knowledge clone <url> --dir <path> --json` as a child process and streams its stdout back to the browser via chunked HTTP response (`Transfer-Encoding: chunked`, `Content-Type: application/x-ndjson`). The dialog reads the response body as a `ReadableStream` and parses JSONL:

```jsonl
{"type":"progress","stage":"receiving","progress":42,"processed":500,"total":1200}
{"type":"progress","stage":"resolving","progress":80,"processed":800,"total":1000}
{"type":"complete","dir":"/Users/nick/Documents/sales-playbook","port":3001}
{"type":"error","code":"AUTH_REQUIRED","message":"Sign in to access private repos","host":"github.com"}
```

The `--json` flag switches output from human-readable terminal progress to machine-readable JSONL. The running server endpoint acts purely as a relay — it spawns the subprocess and pipes stdout to the HTTP response without interpreting it.

Why spawn a subprocess (rather than cloning in-process on the running server): (1) the running server is scoped to its current contentDir — asking it to clone into a DIFFERENT dir violates the one-server-per-contentDir invariant; (2) subprocess isolation means clone failures don't destabilize the running editor.

#### Local-op endpoint family (subprocess relays)

Auth is CLI-canonical. The editor interacts with auth and clone operations via a single family of server endpoints that each spawn a short-lived CLI subprocess and relay its JSONL output. This keeps auth state in one place (the CLI), reduces attack surface (no stateful auth HTTP endpoints), and mirrors the clone relay pattern.

| Method | Path | Relays | Purpose |
|---|---|---|---|
| POST | `/api/local-op/clone` | `open-knowledge clone --json <url> --dir <path>` | Clone a repo; streams progress + completion JSONL |
| POST | `/api/local-op/auth/login` | `open-knowledge auth login --json --host <host>` | Device Flow; streams `{user_code, verification_uri}` then `{status: 'complete', user}` |
| POST | `/api/local-op/auth/status` | `open-knowledge auth status --json --host <host>` | Returns `{authenticated: bool, user?, tier?}` one-shot |
| POST | `/api/local-op/auth/repos` | `open-knowledge auth repos --json --host <host>` | Returns paginated user repos one-shot |
| POST | `/api/local-op/auth/signout` | `open-knowledge auth signout --host <host>` | Clears stored token; returns `{ok: true}` |
| POST | `/api/local-op/auth/pat` | `open-knowledge auth pat --json --host <host>` (accepts PAT via stdin) | Validates + stores PAT; returns `{ok, user, scopes}` |
| POST | `/api/local-op/open` | No subprocess — directly invokes `spawn('open-knowledge', ['start', '--content-dir', dir])` | Spawns a new server instance for a cloned dir; returns `{port}` once server.lock publishes |

#### Local-op endpoint security (applies to ALL local-op endpoints)

1. **Binding:** Local-op endpoints MUST bind to `127.0.0.1` only. If `config.server.host` is not localhost (e.g., user set `0.0.0.0` for collab access), local-op endpoints still reject non-loopback connections via `req.socket.remoteAddress` check.
2. **Origin header check:** Reject requests with `Origin` header not matching the server's bound host (CSRF protection — browsers DO send `Origin` for non-simple CORS requests; for localhost this is `http://localhost:<port>` or `http://127.0.0.1:<port>`).
3. **Path confinement:** `--dir` parameter MUST resolve to a subdirectory of the user's home directory (`os.homedir()`). Reject with `400 { error: 'path_outside_home' }` otherwise. Reject path traversal (`..` sequences resolved).
4. **URL protocol allowlist:** Clone URL MUST match one of: `https://`, `ssh://`, `git://`, or `git@<host>:` shorthand. Reject `file://`, `javascript:`, `data:`, `ext::` (git-remote-helper attack vector), or any unknown protocol with `400 { error: 'unsupported_protocol' }`.
5. **Concurrency limit:** Server holds a per-endpoint-family mutex. Max 1 active subprocess per local-op endpoint at a time. Additional requests return `429 { error: 'operation_in_progress' }`. Prevents fork-bomb via repeated clicks.
6. **Subprocess lifetime bound:** Each local-op subprocess has a 10-minute wall-clock timeout (clone can take time; auth is seconds). Timeout kills the subprocess and emits `{"type":"error","code":"TIMEOUT"}`.
7. **Input sanitization:** All CLI args derived from request body are passed as separate argv entries (no shell interpolation). Uses `spawn` (argv array), NOT `exec` (shell-parsed string).

### System design

#### Data model

**Token store schema (`~/.open-knowledge/auth.yml`):**
```yaml
# chmod 0600
github.com:
  login: nickgomez
  token: gho_xxxxxxxxxxxxx
  git_protocol: https
ghes.acme.com:
  login: nick
  token: ghp_yyyyyyyyyyyyy
  git_protocol: https
```

**Trust store schema (`~/.open-knowledge/trust.yml`):**
```yaml
version: 1
trusted:
  - path: /Users/nick/Documents/sales-playbook
    trustedAt: 2026-04-14T10:23:00Z
    origin: https://github.com/company/sales-playbook
  - path: /Users/nick/Projects/internal-docs
    trustedAt: 2026-04-14T11:00:00Z
    origin: https://github.com/inkeep/internal-docs
```

**HEAD-drift persistence (`<shadowDir>/last-known-head`):**
```
abc123def456789   (one line, raw SHA)
```

#### Auth/permissions

- **OAuth App clientId:** `Ov23liqlSd0V1MwR6rhI` (public default, committed to source at `packages/cli/src/github/app-config.ts`). Configurable via `config.github.oauthAppClientId` (workspace or user config) or env var `OPEN_KNOWLEDGE_GITHUB_CLIENT_ID`. Fork-friendly; resilient to OAuth App disruption (rate-limit, suspension, org loss).
- **Scopes:** Device Flow (Tier B) requests `repo`. **Known trade-off:** Classic OAuth scope model has no `repo:read`; `repo` grants read+write access even though clone is read-only. See NG2 for the push/sync-back deferral. Tier C (PAT paste) UI explicitly suggests "For read-only access, use a fine-grained PAT with `Contents: Read` scope." Security-conscious users who decline Device Flow's write access have the PAT path available.
- **No `client_secret` on user disk** — Device Flow doesn't need one.
- **Token storage:** OS keychain via `@napi-rs/keyring` (primary). Fallback: `~/.open-knowledge/auth.yml` with `chmod 0600`. Keyed by hostname.
- **gh delegation (Tier A):** passes through gh's own auth via `credential.helper='!gh auth git-credential'` — no token touches our process.
- **Trust signal (`didAutoInit`):** Set in `start.ts` when auto-init runs this boot. Passed to `createServer({..., didAutoInit})`. Trust check inside `createServer` uses this runtime boolean + trust.yml — cannot be spoofed by disk content.

#### Observability

- `[clone]` structured log: url, host, auth tier, duration, result, error type
- `[auth]` structured log: host, tier, backend (keyring/file), result
- `[trust]` structured log: dir, action (trust/read-only/review/dismiss)
- `[head-drift]` structured log: lastKnownHead, currentHead, upstreamImportSha

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| Editor root (no project) | ProjectPicker empty state | Three cards render; "Clone from GitHub" opens dialog |
| Editor root (project loaded) | EditorHeader File menu | "Clone from GitHub..." menu item; opens dialog |
| Clone dialog | URL input + repo browse + path picker + progress | All interaction states from the matrix |
| Auth modal (Device Flow) | Code display + polling + success/failure | Timeout, cancellation, slow_down backoff |
| Trust banner | Preview mode + trust actions | Gates agent writes; allows rollback; persists to trust.yml |
| Timeline panel | T0 entry after clone | Shows "upstream: initial import at {sha}" after HEAD-drift check |

#### Data flow diagram

- Primary flow: User pastes URL → parse → auth check → simple-git clone → post-clone → start server → browser redirect
- Shadow paths to test:
  - **nil / missing:** URL is empty or null → validation error before clone
  - **empty:** Target dir exists but is empty → clone proceeds (git handles this)
  - **wrong type:** URL is not a valid git URL → parser returns null → clear error
  - **timeout:** Clone stalls (network) → simple-git timeout → error toast with retry
  - **conflict:** Target dir non-empty → validation rejects before clone
  - **partial failure:** Clone interrupted (Ctrl+C, network drop) → simple-git cleans up partial `.git/`
  - **auth failure:** Private repo + no auth → 401 → trigger sign-in flow → retry
  - **trust failure:** Untrusted config.yml → preview mode → user decides

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| URL parser | Invalid URL | Parser returns null | Immediate inline error | "Invalid URL format" — user corrects |
| simple-git clone | Network drop | Git exit code non-zero | Partial clone cleaned up; error toast with retry | "Clone failed: network error" |
| simple-git clone | Auth failure (401/403) | GitError with stderr "Authentication failed" | Trigger sign-in flow (Tier B or C) | "Sign in to access private repos" |
| simple-git clone | Disk full | GitError with "No space left on device" | Partial clone cleaned up | "Not enough disk space" |
| Device Flow | Timeout (2 min) | Poll exhausted | Offer retry or PAT fallback | "Authorization timed out. Try again?" |
| Device Flow | User denies | `access_denied` response | Surface error, offer PAT | "Authorization denied" |
| `@napi-rs/keyring` | Keyring unavailable | Catch on `keyring.set()` | Fallback to file store | Transparent; log "using file storage" |
| Server spawn post-clone | Port conflict | `ServerLockCollisionError` | Detect existing server; open its URL | Transparent redirect |
| Trust check | Untrusted config | config.yml exists + not in trust.yml | Preview mode | Read-only until user trusts |
| HEAD-drift check | Shadow repo corrupt | `commitUpstreamImport` fails | Log warning; skip T0 import; degrade gracefully | Timeline may be empty; editing unaffected |

### Alternatives considered

- **In-server hot-swap endpoint (Archetype B):** Rejected. `createServer()` exposes no reconfigure hook; Y.Docs namespace by docName only; server lock + shadow lock + file watcher all scope to contentDir. Hot-swap would require fundamental refactoring and creates cross-project contamination risks. (See research D10.)
- **isomorphic-git instead of simple-git:** Rejected for clone surface. No native SSH; Node HTTP plugin's `onProgress` not wired; entire packfile buffered in RAM. Viable only as a narrow phase-3 fallback for public HTTPS repos.
- **GitHub App instead of OAuth App:** Rejected. GitHub App's installation tokens require a backend holding the private RSA key. Without a backend, GitHub App degrades to user-to-server tokens that expire every 8 hours and need `client_secret` to refresh. OAuth App's long-lived tokens are strictly superior for no-backend products.
- **keytar for token storage:** Rejected. GitHub repo archived Dec 2022; 4+ years unmaintained. `@napi-rs/keyring` is the credible 2026 replacement with wider platform matrix.
- **Per-file hash persistence for offline drift:** Rejected. Direct file edits (non-git) are already treated as session-local both online and offline — folded into WIP, not classified as upstream. Adding per-file drift detection would create a behavior asymmetry between online and offline. HEAD-drift is sufficient and consistent.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Clone mechanism: `simple-git` | T | LOCKED | No | Already a dep; prior report settled this | `reports/git-library-for-knowledge-platform/` | Inherits git-on-PATH assumption |
| D2 | Auth model: OAuth App + Device Flow + gh delegation + PAT | T/X | LOCKED | Yes (OAuth App registered) | No backend → no client_secret → Device Flow. OAuth App tokens long-lived; GitHub App tokens expire 8h. Every local editor converges here. | Research D3; `Ov23liqlSd0V1MwR6rhI` registered | OAuth App registered on `inkeep` org; `clientId` committed to source as default, overridable via `config.github.oauthAppClientId` or env var `OPEN_KNOWLEDGE_GITHUB_CLIENT_ID` (per design challenge L7 — fork-friendly + resilient to App disruption) |
| D3 | Token storage: `@napi-rs/keyring` primary + `~/.open-knowledge/auth.yml` fallback | T | LOCKED | No | keytar abandoned; @napi-rs/keyring is credible replacement; plaintext fallback matches gh's architecture | Research D4 | Bun smoke test is a pre-merge gate |
| D4 | Integration seam: Archetype A (CLI orchestrator) + editor subprocess spawn | T | LOCKED | No | In-server hot-swap violates one-server-per-contentDir. Subprocess isolation means clone failures don't destabilize editor. | Research D10; `evidence/upstream-sync-flow.md` | Editor clone dialog spawns CLI; doesn't call server HTTP |
| D5 | URL scope: any git host paste + GitHub-only browse picker | P/T | LOCKED | No | Matches VSCode/Desktop prior art. ~0 cost to accept any URL. | Research D2, D5 | Non-GitHub: system git credentials; no browse |
| D6 | GHES: Tier A + Tier C only (no Device Flow against GHES) | T | LOCKED | No | Device Flow against GHES requires admin-side OAuth App registration per-instance — same constraint as VSCode/gh/Desktop | Research D3 (GHES investigation) | GHES users authenticate via PAT or gh delegation |
| D7 | UI naming: "Clone from GitHub" | P | LOCKED | No | Every studied editor uses "Clone." Aligning maximizes discoverability. "from GitHub" anchors the source for non-devs. | Research D9 | CLI command: `open-knowledge clone` |
| D8 | Post-clone: chain into existing `start` auto-init | T | LOCKED | No | `start.ts:36-50` already auto-inits. Zero new init code. | Research D1 | Existing behavior, verified |
| D9 | Trust model ships with feature | P/X | LOCKED | Yes (trust.yml schema) | Cloned repos can contain hostile config.yml. Greenfield security posture requires gating agent writes on untrusted content. | Research D8; design challenge H (sentinel rejected) | New `trust.yml` schema + `FORBIDDEN_UNTRUSTED` HTTP gate. Mechanism: `didAutoInit` runtime boolean passed to createServer (NOT sentinel comment — spoofable). |
| D17 | Auth surface: CLI-canonical via subprocess relays (no stateful server HTTP auth endpoints) | T | LOCKED | Yes (API surface shape) | Two parallel auth surfaces (CLI + HTTP endpoints) duplicate logic and expand attack surface. Single auth implementation in CLI, invoked via `POST /api/local-op/auth/*` subprocess relays from the editor. Mirrors the clone relay pattern. | Design challenge M2 | New CLI subcommands: `auth login/status/repos/signout/pat`. Removes 5 originally-proposed `/api/auth/*` stateful endpoints. |
| D18 | Local-op endpoint security: localhost-only + Origin check + path confinement + protocol allowlist + concurrency=1 | T/X | LOCKED | Yes (security contract) | Local-op endpoints spawn subprocesses with user-supplied arguments; security boundary must be explicit. Standard protections: 127.0.0.1 bind, CSRF via Origin, `--dir` confined to home, URL allowlist (reject `file://`, `ext::`, etc.), fork-bomb prevention. | Design challenge M3 | All `/api/local-op/*` endpoints enforce §9 security section requirements. |
| D19 | Post-clone handoff: mode-dependent. Terminal auto-starts; JSONL (editor-spawned) does not. | T | LOCKED | No | JSONL mode prevents orphan servers when editor tab closes mid-clone. Editor issues separate `POST /api/local-op/open` to spawn server post-clone. | Design challenge L6 | Extends FR8; CLI UX unchanged for terminal users. |
| D10 | Startup HEAD-drift check (subsumes T0 clone import) | T | LOCKED | No | No existing mechanism persists state across restarts. HEAD-drift captures offline git ops. T0 = special case of drift (null → SHA). | `evidence/upstream-sync-flow.md` | ~20 lines in createServer + destroy. Cross-owner: touches Miles's shadow-repo area. |
| D11 | Audience: B2B SaaS dev + non-dev; intuitive copy, short micro-text | P | LOCKED | No | User-confirmed scope | Intake Q1 | Affects all copy, error messages, and UI affordances |
| D12 | Progress: simple-git progress plugin → sonner toast | T | LOCKED | No | simple-git already has the plugin; sonner already shipped in PR #39 | Research D7; timeline spec FR9 | Phase-weighted percentage (Counting/Compressing/Receiving/Resolving) |
| D13 | Scopes: `repo` | T | LOCKED | Yes (OAuth App setting) | `repo` covers private+public read/write. `public_repo` alone fails silently on private repos. | Research D3 | Minimum scope that covers the use case |
| D14 | Timeline extension: NOT extending /api/history to walk project-repo log | P/T | LOCKED | No | Timeline stays shadow-only. Separate "File History" feature if needed. | Intake Q5 decision | Cloned repos show T0 upstream-import entry only (via D10) |
| D15 | Non-HEAD file changes: folded into WIP (consistent online/offline) | T | LOCKED | No | Existing architecture treats non-HEAD file edits as session-local. No per-file hash persistence. Consistent. | `evidence/upstream-sync-flow.md` | Direct file edits while offline are absorbed into next WIP commit |
| D16 | Target dir: must be empty or non-existent | P | LOCKED | No | Matches Desktop's validate-empty pattern | Research D6 | Clear error if non-empty |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | How does the editor detect "no project loaded" for the ProjectPicker empty state? | T | P0 | No | `documents.length === 0` from `/api/documents` polling (FileTree.tsx:394-416). No separate "project loaded" flag — signal is file presence. | **Resolved** |
| Q2 | How does the clone dialog spawn the CLI subprocess from the React app? | T | P0 | No | `POST /api/local-op/clone` spawns `open-knowledge clone --json` as child process, streams JSONL via chunked Transfer-Encoding. Precedent: `POST /api/save-version` does git work. New server starts for cloned dir; port returned from server.lock. | **Resolved** |
| Q3 | How does the server detect externally-authored project-local metadata? | T | P0 | No | **Revised after audit challenge H (sentinel spoofable):** Use unforgeable runtime signal. `start.ts` exports its `didAutoInit: boolean` (true when auto-init ran this boot, false when `.open-knowledge/` pre-existed). Passed to `createServer({..., didAutoInit})` as a new option. Trust check: `didAutoInit === false && realpath(contentDir) not in trust.yml → trustPending = true`. Sentinel approach rejected — attacker can include sentinel in malicious config to silently pass check. `didAutoInit` is set by server code, not readable from disk content. | **Resolved** |
| Q4 | How does trust-pending compose with PR #39's preview mode? | T | P0 | No | Separate concerns. Trust-pending = project-level `trustPending: boolean` on EditorPane + banner. Diff/preview = document-level timeline tool. Don't reuse diff mode for trust. Force `editorMode = 'source'` (read-only) when trustPending. | **Resolved** |
| Q5 | Bun smoke tests: exact test matrix for pre-merge verification? | T | P0 | No | Three smoke tests as `*.smoke.test.ts` files: (1) `simple-git` clone a public repo to tmpdir + verify progress callback fires, (2) `@napi-rs/keyring` set/get/clear cycle, (3) `@octokit/auth-oauth-device` createOAuthDeviceAuth with a mock onVerification. Run via `bun test` as pre-merge gate. | **Resolved** |
| Q6 | Where in the editor header does "Clone from GitHub..." live? | P | P0 | No | DELEGATED to implementer. Options: (a) "File" dropdown menu in header alongside existing Save Version, (b) icon button next to the clock icon. Both are viable; (a) scales better as more project-level actions are added. | **Resolved** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `simple-git` works under Bun for clone + progress callback | HIGH (shadow-repo already uses simple-git under Bun for other ops) | Bun smoke test: `simpleGit({progress}).clone(publicRepo, tmpDir)` | Pre-merge | Active |
| A2 | `@napi-rs/keyring` works under Bun (napi-rs standard pipeline + Bun N-API) | MEDIUM (no public Bun verification found) | Bun smoke test: `keyring.set('test', 'user', 'token'); keyring.get('test', 'user')` | Pre-merge | Active |
| A3 | `@octokit/auth-oauth-device` works under Bun | HIGH (pure HTTP, no native deps) | Smoke test against a test OAuth App | Pre-merge | Active |
| A4 | Privacy policy at `https://inkeep.com/policies/privacy` is suitable for the OAuth App registration | HIGH (verified: live page, SOC 2 Type II compliant) | Already verified via web search | N/A | Verified |

## 13) In Scope (implement now)

- **Goals:** G1 (non-dev clone in <60s), G2 (dev gh-delegation), G3 (trust model), G4 (upstream tracking completeness), G5 (any-host URL paste)
- **Non-goals:** NG1 (no hot-swap), NG2-NG7 (deferred as documented)
- **Requirements:** FR1-FR18 (Must + Should + Could)
- **Proposed solution:** §9 (vertical slice)
- **Owner(s)/DRI:** Nick (CLI + auth + URL parser + github app-config), Miles (server trust check + HEAD-drift + local-op endpoints + FORBIDDEN_UNTRUSTED gate), both (editor UI components)
- **Next actions:** Pre-merge Bun smoke tests (A1, A2, A3); `/decompose` the spec into implementation tasks; begin implementation
- **Risks + mitigations:** See §14
- **Instrumentation:** See §7

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| OAuth App is new | App registered on `inkeep` org; `clientId` committed | Verify Device Flow works end-to-end before merge |
| `@napi-rs/keyring` is a new native dependency | Bun smoke test pre-merge; fallback to file storage | CI builds on macOS + Linux pass |
| Trust model is a new runtime gate | Agent-write endpoints return 403 for untrusted; MCP surfaces error | E2E test: clone untrusted repo → agent write → 403 |
| HEAD-drift check runs at boot | Persist `last-known-head` at `<shadowDir>/last-known-head` | Integration test: stop server → `git pull` → restart → verify upstream-import commit |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| `@napi-rs/keyring` fails on Bun | Low | Medium (fallback to file store) | File store fallback is architecturally correct; Bun smoke test pre-merge | Nick |
| OAuth Device Flow UX confuses non-devs (paste a code?) | Medium | Medium (abandoned auth) | Auto-copy to clipboard + auto-open browser minimizes friction; PAT fallback available | Nick |
| Trust prompt annoys users who clone trusted repos | Low | Low (one-time per project) | Trust persists in `trust.yml`; parent-path trust is future work if needed | Miles |
| Large repo clone takes >60s, user thinks it hung | Medium | Low (just slow) | Phase-weighted progress bar shows movement; cancel button available | Nick |
| Shadow repo init fails on corrupt .git/ | Low | Low (editor works, timeline empty) | Graceful degradation: `degraded.push('shadow-repo')`, timeline shows "History unavailable" | Miles |
| **External:** npm-install asset-path bug (F1 from PR #138 walkthrough audit) blocks browser UI on any `bunx @inkeep/open-knowledge` run today | High (known) | High (blocks clone through the npm path entirely) | Andrew owns the one-line fix in `tsdown` config / `start.ts:102-114` (asset lookup paths). Our clone feature cannot be validated end-to-end via npm install until this is fixed. Pre-merge gate: F1 landed before we ship. | Andrew (external; tracked via PR #138) |
| Local-op endpoint subprocess hangs | Low | Medium (blocks further clones) | 10-minute wall-clock timeout per subprocess (D18); concurrency limit 1 prevents pile-up; watchdog kills + emits TIMEOUT error | Miles |
| User decodes clientId from source + impersonates Open Knowledge to GitHub | Medium | Low | clientId is inherently public (by OAuth design); cannot be "leaked"; attacker needs user consent on GitHub's page to complete auth; no elevated capability gained | n/a (by design) |
| OAuth App suspended/rate-limited by GitHub | Low | High (all Device Flow users blocked) | Fallback: PAT (Tier C); config override (`OPEN_KNOWLEDGE_GITHUB_CLIENT_ID`) allows forks/self-hosted to use their own App | Nick |

## 15) Future Work

### Explored
- **Per-file offline drift detection.** Investigated during the spec. Direct file edits while offline are already handled correctly — `onLoadDocument()` loads from disk, consistent with online behavior. Per-file hash persistence would create a behavior asymmetry. Not needed unless user research surfaces attribution gaps.
  - Trigger: users report "I edited in VSCode offline and can't tell what changed in Open Knowledge."
- **Parent-path trust (VSCode-style longest-prefix matching).** Trust `~/Projects/` to cover all subfolders. Architecture supports it; current per-dir trust is simpler and sufficient for single-folder projects.
  - Trigger: users who clone many repos into the same parent find per-dir trust prompts annoying.

### Identified
- **Cloned-repo git-log ingestion ("File History").** Display pre-import git history alongside shadow timeline entries. Separate feature with its own semantics (attribution, performance on large repos). Timeline stays shadow-only for now.
  - Trigger: migration users asking "where's my pre-import history?"
- **GitHub Enterprise Device Flow.** Requires admin-side OAuth App registration per-instance. Would need an admin-onboarding guide and possibly a per-instance `clientId` config.
  - Trigger: enterprise customer demand.
- **Push / sync-back flows.** The inverse of clone — `open-knowledge push` or in-editor "Push to GitHub." Separate spec.
  - Trigger: users editing cloned content and wanting to contribute back.
- **Multi-project registry.** `~/.open-knowledge/projects.json` auto-populated on clone/start. Enables "recent projects" UI, launcher integration.
  - Trigger: users cloning multiple repos and wanting to switch between them.

### Identified (added post-finalization from git-lifecycle research)
- **Post-clone git lifecycle (push / pull / merge / branches in the editor UI).** Our architecture is already forward-compatible: simple-git supports all ops, `repo` OAuth scope covers push, shadow-repo + reconciliation handle merge natively, branch state is tracked. But no user-facing UI exists for push/pull/merge/branch management. Separate spec(s) will design the UX — likely "Save & Publish" for commit+push, "Get latest" for pull, in-editor conflict resolution leveraging our existing Y.Map conflict storage.
  - Trigger: users say "I cloned and edited, how do I push back?" — or once agents start producing content that users want to publish upstream.
- **Write-access detection at clone time.** After a successful authenticated clone, call `GET /repos/{owner}/{repo}` and check `permissions.push`. If false, show a one-time hint: "You have read-only access to this repo. You can edit locally but won't be able to publish changes back unless you fork or get write access." Preempts frustration at push-time.
  - Trigger: first bug report about "edited a repo I couldn't push to."
- **Contribute Device Flow support to vercel-labs/emulate.** Our test suite adopts [emulate](https://github.com/vercel-labs/emulate) for GitHub REST API coverage (PAT validation, `/user/repos` browse, `GET /repos/{o}/{r}` write-access check) but emulate's OAuth implementation currently supports Authorization Code flow only — no `/login/device/code` or `device_code` grant-type polling. Open Knowledge builds a small Device Flow mock locally for near-term use; the ecosystem-positive next step is to upstream that work as a `~150 LOC PR to emulate`, turning it into the canonical Device Flow testing target for every CLI in the ecosystem (gh, VSCode, Cursor, Windsurf, us). Benefits: (1) our test suite simplifies to one emulator instead of one emulator + one local mock, (2) ecosystem win, (3) upstream goodwill.
  - Trigger: post-merge of this spec's implementation, when we've validated our local Device Flow mock's completeness via real usage.
- **Nightly real-github Device Flow E2E (via `/qa` + `/browser`).** The only spec surface that this feature's PR-gate test suite does NOT exercise against real infrastructure is the actual GitHub Device Flow authorization page (`github.com/login/device`). For first ship, we'll do a one-time manual smoke (see Pre-merge verifications in §12 + §13). But this is fully automatable: a test agent drives Playwright using a dedicated CI GitHub account, reads the `user_code` from our CLI subprocess's JSONL output, types it into `github.com/login/device`, clicks Authorize, and asserts our subprocess's polling loop completes. **Deferred** because: (a) the nightly infrastructure cost (session-cookie rotation, UI-drift maintenance, bot-account provisioning, CI workflow plumbing) exceeds the value of catching OAuth App suspension + API drift for this feature alone, (b) the real value compounds across future features that ALSO need real-github verification (push, fork, private-repo permissions). Landing it alongside push-to-GitHub (NG2) or the emulate Device-Flow upstream contribution (whichever is first) amortizes the infrastructure cost. Implementation sketch: three-tier pipeline — PR gate (mock-GitHub Device Flow, autonomous), nightly (real-github Device Flow via Playwright-driven bot account, autonomous), pre-release (full user-journey E2E, autonomous). `/qa` authors; `/browser` drives.
  - Trigger: whichever happens first — push-to-GitHub feature landing, emulate Device-Flow contribution landing (we want ground-truth check against real github to validate our emulator implementation), or an OAuth App suspension incident.

### Noted
- **GitLab / Bitbucket browse picker.** URL paste already works; adding host-specific browse pickers is additive.
- **Bundled git binary (dugite-style).** Blocked on Bun postinstall compat (Node 20 `Readable.fromWeb`); 400-600MB footprint. Only if Windows non-dev adoption creates demand.
- **`isomorphic-git` fallback for no-git-on-PATH.** Pure JS; no SSH; RAM ceiling. Narrow fallback for public HTTPS repos.
- **Project-identity-as-UUID migration.** PR #138's `lifecycle-edge-cases` report proposes replacing "identity = absolute path" with a project-id UUID stamped on `init`. If adopted, our `trust.yml` schema migrates from realpath-keyed entries to UUID-keyed entries (`mv /project` preserves trust instead of losing it). Non-foreclosed: realpath is fine for v1, UUID migration is a schema bump — no architectural conflict. Flag for design review if the lifecycle-edge-cases proposal is adopted before our clone lands.

## 16) Agent constraints

- **SCOPE:** `packages/cli/src/commands/clone.ts` (new), `packages/cli/src/commands/auth/` (new dir: `login.ts`, `status.ts`, `repos.ts`, `signout.ts`, `pat.ts` — each a CLI subcommand), `packages/cli/src/github/` (new dir: `url.ts`, `app-config.ts`, `octokit.ts`, `list-repos.ts`), `packages/cli/src/auth/` (new dir: `gh-detect.ts`, `device-flow.ts`, `pat.ts`, `token-store.ts`, `resolve-auth.ts`), `packages/cli/src/config/schema.ts` (add `github.oauthAppClientId`), `packages/server/src/standalone.ts` (HEAD-drift check + `didAutoInit` option + `trustPending` state), `packages/server/src/trust.ts` (new), `packages/server/src/api-extension.ts` (`/api/local-op/*` relay endpoints + `FORBIDDEN_UNTRUSTED` gate on agent-write endpoints), `packages/cli/src/commands/start.ts` (pass `didAutoInit` to createServer), `packages/app/src/components/ProjectPicker.tsx` (new — **extends the existing empty-state CTA from PR #127; wires "Start fresh" card to the existing `NewItemDialog` component**), `packages/app/src/components/CloneDialog.tsx` (new), `packages/app/src/components/TrustBanner.tsx` (new), `packages/app/src/components/AuthModal.tsx` (new), `packages/cli/src/cli.ts` (register `clone` + `auth` subcommand group). **Reference existing shipped component:** `packages/app/src/components/NewItemDialog.tsx` (from PR #127 — file + folder creation; reuse, don't reimplement).
- **EXCLUDE:** `packages/core/` (no markdown/CRDT changes), `packages/server/src/persistence.ts` (no persistence logic changes), `packages/server/src/reconciliation.ts` (no reconciliation changes), `packages/server/src/shadow-repo.ts` (only HEAD-drift touches, via standalone.ts; don't modify commitUpstreamImport itself), observer bridge (`observers.ts`), markdown pipeline
- **STOP_IF:** Requires changes to `commitUpstreamImport()` signature, requires changes to Hocuspocus extension API, requires changes to Y.Doc document namespace model, `@napi-rs/keyring` Bun smoke test fails
- **ASK_FIRST:** New npm dependencies beyond `@octokit/auth-oauth-device`, `@octokit/rest`, `@napi-rs/keyring`; changes to existing API endpoint behavior (not adding new ones); changes to the config loader's merge logic; changes to the shadow-repo lock lifecycle
