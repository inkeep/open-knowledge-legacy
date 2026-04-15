# GitHub Sync: Clone, Auto-Sync, and Collaboration — Spec

**Status:** Ready for handoff to Miles. Direction LOCKED (35 decisions); implementation-level timing + UX details are open questions for implementer.
**Handoff to:** Miles Kaming-Thanassi (server/UI/MCP)
**Owner(s):** Nick Gomez (CPO/CTO), Miles Kaming-Thanassi (server/UI/MCP)
**Last updated:** 2026-04-15
**Baseline commit:** 6d8c9ed
**Merged from:**
- `specs/2026-04-14-clone-from-github/SPEC.md` (approved 2026-04-14, 19 locked decisions)
- `specs/2026-04-14-post-clone-git-sync/SPEC.md` (drafting, 9 locked decisions)
- Pre-merge originals archived at: `specs/_archive/2026-04-15-pre-merge/`

**Links:**
- Research: `reports/open-from-github-onboarding-mechanics/REPORT.md` (clone mechanics, 10 evidence files)
- Research: `reports/git-lifecycle-push-pull-merge-patterns/REPORT.md` (post-clone UX, 873 lines, 14 evidence files, sync-engine prior art section, Path C extension with 7 additional dimensions)
- Research: `reports/auto-persistence-version-history-patterns/REPORT.md`
- Research: `reports/git-library-for-knowledge-platform/REPORT.md`
- Research: `reports/git-directory-nesting-shadow-repo/REPORT.md`
- Research: `reports/crdt-origin-laundering-prior-art/REPORT.md`
- Spec evidence: `specs/2026-04-14-github-sync/evidence/`
- Timeline spec (precedent): `specs/2026-04-10-document-timeline-rollback/SPEC.md`

---

## 1) Problem statement

### Situation

Open Knowledge is a local-first CRDT markdown editor for both developers and non-developers at B2B SaaS companies (marketing, ops, growth alongside engineering). It ships as `@inkeep/open-knowledge` CLI + React web editor. PR #39 landed Timeline & Rollback (shadow-repo attribution surface), making the editor genuinely capable of knowledge work.

The server auto-persists to disk (L1, 2–10s debounce via Hocuspocus) and journals attribution to a shadow git at `.git/openknowledge/` or `.openknowledge/` (L2, 30s idle debounce). HEAD watcher detects external user-driven git ops via `@parcel/watcher` on `.git/HEAD` with 100ms quiet window. Reconciliation handles three-way merge for external changes. The only user-facing git surface today is the Timeline panel (shadow history, read-only) and the Save Version button (creates shadow checkpoint).

Cross-repository use cases — teams editing a docs monorepo on GitHub, product marketing maintaining a playbook repo, AI-generated knowledge bases shared as Obsidian vaults — are the product's core growth vectors. Every shipped desktop editor with non-developer ambitions (VSCode, Cursor, GitHub Desktop, Obsidian-Git) supports clone-from-GitHub + sync-back-to-GitHub as table stakes.

### Complication

Today, non-developer users face a two-sided wall:

**Side A — getting content in.** To use the editor, users must have markdown on disk, run `open-knowledge start` in it, open the browser. There is no path from "I saw a markdown repo on GitHub" to "I'm editing it in Open Knowledge" that doesn't require terminal fluency (git/gh installed, clone semantics, path navigation).

**Side B — getting content out.** After edits, there is **zero user-facing parent-git surface**. The server READS `.git/HEAD` but never WRITES. No push, pull, fetch, branch-switch, or remote visibility in UI. A non-developer who edits content has no way to publish changes back except (a) copy-paste into GitHub's web UI (loses CRDT attribution + shadow history), or (b) ask a developer to run git commands (bottleneck).

Research across 15+ editors + 6 sync-engine apps confirms non-dev git tools universally fail at the failure-handling surface ("Could not read from remote repository" regardless of cause; no offline queue; Obsidian-Git retreats to CLI in 6 documented scenarios). The bottleneck shifts from "is the editor good?" to "can non-devs collaborate via git without a terminal?"

### Resolution

Ship the full GitHub collaboration round-trip as one coherent feature:

- **Clone path.** First-class onboarding: CLI subcommand (`open-knowledge clone <url> [<dir>]`), editor-side empty-state UI (ProjectPicker), File menu entry (Clone from GitHub…). OAuth App Device Flow + gh delegation + PAT fallback — no backend required.
- **Auto-sync.** Existing shadow-git L2 pipeline **dual-writes** to parent git on every flush (same code, different `GitHandle`). Continuous auto-sync layer modeled on Linear/Figma/Notion: background fetch/merge/push every 120s. Status badge + conflict banner are the only new UI surfaces for happy-path users.
- **Conflict resolution.** One surface, one decision: side-sheet panel listing conflicted files with [Keep mine] / [Keep theirs] / [Resolve manually] per file. Resolve-manually opens the existing DiffView extended with `@codemirror/merge mergeControls` for per-hunk accept/reject. Never exposes raw `<<<<<<<` markers to non-devs.
- **Credentials.** Single `open-knowledge auth git-credential` CLI subcommand implements git's credential-helper protocol, reads `@napi-rs/keyring`. Clone, push, pull, fetch all use the same mechanism — resolves the silent gap in the clone-precursor spec on Tier B/C credential handoff.
- **Architecture leverages existing infrastructure.** `commitWip()`, `saveVersion()`, batch gating, write tracker, reconciliation, DiffView/`@codemirror/merge` are all reusable. The sync engine is NOT a parallel subsystem — it's the existing L2 pipeline with a second target + a thin remote-operations layer.

All surfaces ship in one iteration (greenfield directive). Terminology stays human (no "push/pull/merge" in default UI); developers get CLI escape hatches.

---

## 2) Goals

- **G1:** A non-developer at a B2B SaaS company can go from "I have a GitHub URL" to "I'm editing it in Open Knowledge" in under 60 seconds, without terminal commands (via editor UI) or with one terminal command (via CLI).
- **G2:** A developer with `gh` installed and logged in can clone a private repo with zero additional authentication steps — gh's existing session is reused transparently.
- **G3:** Upstream-import tracking is complete across server lifecycle — git operations that occur while the server is offline are captured in the shadow repo and visible in the timeline on next startup.
- **G4:** Clone works for any git host (GitHub, GHES, GitLab, Bitbucket, self-hosted) via URL paste. Authenticated repo browse + Device Flow sign-in are GitHub.com-specific.
- **G5:** Non-dev users can collaborate with teammates via git **without ever typing a git command** — changes flow to origin automatically; team changes flow in automatically.
- **G6:** Developers' existing git workflows remain unaffected (external CLI ops continue to work; HEAD watcher handles reconciliation).
- **G7:** Agent-authored content reaches origin alongside user-authored content.
- **G8:** Failure modes (network, auth, conflict) surface with human-readable messaging and clear recovery actions.
- **G9:** Architecture is forward-compatible with future branch-picker, PR workflow, multi-account UX without requiring substrate rewrites.

---

## 3) Non-goals

- **[NEVER]** NG1: In-server hot-swap of content directories. Architecturally wrong for our one-server-per-contentDir model (see research D10 evidence in `reports/open-from-github-onboarding-mechanics/`).
- **[NEVER]** NG2: Force-push by default. Developers can opt in per-repo via CLI; never automatic. Preserves git's collaboration contract.
- **[NOT NOW]** NG3: Push to protected branches with alternative workflows. If auto-push hits GitHub branch protection (403), sync disables for that repo with a toast. No auto-create-user-branches, no auto-PR-creation. Happy path only. — Revisit if: significant customer demand for protected-branch workflows.
- **[NOT NOW]** NG4: Branch management UI (create/delete/switch via editor). v1 is main-branch-only. Users switch branches via CLI; HEAD watcher handles reconciliation. — Revisit if: users frequently need to work across branches from the editor.
- **[NOT NOW]** NG5: PR creation / review workflows from the editor. Inverse of clone's NG2 but narrower — no in-editor PR review.
- **[NOT NOW]** NG6: Multi-project registry / workspace switching UI. Covered by `onboarding-multiproject-ux` report. — Revisit if: users clone multiple repos and want to switch between them in the editor.
- **[NOT NOW]** NG7: GitLab / Bitbucket-specific browse picker. URL paste works for any host; only GitHub.com gets a browse-my-repos affordance. — Revisit if: significant user demand for non-GitHub browse.
- **[NOT NOW]** NG8: GitHub Enterprise Device Flow. Requires admin-side OAuth App registration on each GHES instance. GHES users use PAT or gh delegation. — Revisit if: enterprise customer demand justifies admin-onboarding flow.
- **[NOT NOW]** NG9: Cloned-repo git-log ingestion into timeline. Timeline stays shadow-only. The startup HEAD-drift check creates a single T0 upstream-import entry on clone. — Revisit if: migration users consistently ask "where's my pre-import history?"
- **[NOT NOW]** NG10: Interactive rebase / stash management / cherry-pick UI. Developers use CLI.
- **[NOT NOW]** NG11: Git log graph view / blame / file history UI per-document (separate "File History" feature).
- **[NOT NOW]** NG12: LFS handling UX for large files and media.
- **[NOT NOW]** NG13: Multi-account switching UI (per-repo identity).
- **[NOT NOW]** NG14: Squash / rewrite auto-commit history before push. Research shows Obsidian-Git accepts the commit noise; revisit if user complaints surface (see Future Work F8).
- **[NOT NOW]** NG15: "Watching" remote for real-time updates (webhook or long-poll). v1 uses interval-poll fetch (120s).
- **[NOT UNLESS]** NG16: Bundled git binary (dugite-style). Product requires git on PATH via shadow-repo. — Only if: significant Windows non-developer adoption where git is not pre-installed.

---

## 4) Personas / consumers

- **P1: Non-developer knowledge worker (PRIMARY).** Marketing/ops/growth at a B2B SaaS company. Saw a markdown docs repo on GitHub (public playbook, shared research log, AI-generated KB), or was set up by a colleague on an existing project. Wants to browse and edit. Little terminal fluency. Does NOT have `gh` installed. Expects "cloud sync" semantics: changes appear on GitHub automatically; team changes appear in the editor automatically; conflicts surface as a clear "choose a version" dialog. Should never need to know what "push," "pull," "merge," "rebase," or "HEAD" means.
  - **Setup precondition.** P1 does not install the CLI or run `open-knowledge start` themselves. A colleague (developer teammate, IT admin, onboarding buddy) installs the CLI once and either (a) creates a launcher/shortcut, (b) gives P1 a bookmark to `http://localhost:<port>` with an autostart mechanism, or (c) the CLI will later ship a platform-native desktop launcher (future work). P1's entry point is the **editor UI in the browser**.
- **P2: Developer (SECONDARY).** Comfortable with git. Has `gh` installed and logged in. Uses Open Knowledge for content-editing UX but can drop to CLI for advanced ops (interactive rebase, stash, complex merges). Wants auto-sync to be invisible for normal flow, transparent enough to trust (visible CLI commands, git log inspectable), and the server to NEVER silently force-push or rewrite history. CLI is P2's primary surface for clone and advanced operations.
- **P3: Team member joining a shared KB.** Teammate sends a GitHub URL. May be dev-fluent or not. If dev-fluent, follows P2's path. If not, follows P1's path (colleague sets them up).
- **P4: AI agent author.** Agents write content via MCP/agent-write endpoints. Agent-authored commits reach origin alongside user-authored content via the same auto-sync pipeline.

---

## 5) User journeys

### J1 — P1: Non-developer clones a public playbook from the editor UI

1. User launches `open-knowledge start` for the first time (or opens a browser to an already-running instance with no content loaded).
2. Empty-state screen shows three cards: **"Clone from GitHub"** / "Open folder on disk" / "Start fresh."
3. User clicks "Clone from GitHub." A dialog opens with a text input ("Paste a GitHub URL or search your repos") and a "Sign in to GitHub" button.
4. User pastes `https://github.com/company/sales-playbook`. The dialog parses it, shows "company/sales-playbook" with a "Clone" button and a local path field auto-filled to `~/Documents/sales-playbook`.
5. User clicks "Clone." A sonner toast appears: "Cloning sales-playbook... Receiving objects: 42%."
6. Clone completes (~5 seconds for a small repo). Toast updates: "Opening sales-playbook..."
7. A new server instance spawns targeting `~/Documents/sales-playbook`. Browser redirects to `http://localhost:<new-port>`. Auto-init scaffolds `.open-knowledge/`.
8. User sees the file tree populated. Status badge in header shows initial fetch: "Synced." They click a file and start editing.

**Aha moment:** "I went from a GitHub link to editing in 30 seconds."

### J2 — P2: Developer clones a private repo via CLI

1. Developer runs `open-knowledge clone https://github.com/inkeep/internal-docs`.
2. CLI detects `gh` on PATH, runs `gh auth token` — succeeds. Passes `-c credential.helper='!gh auth git-credential'` to simple-git. No auth UI shown.
3. Clone runs with `--progress`. Terminal shows: `Cloning into './internal-docs'... Receiving objects: 100% (500/500), done.`
4. CLI runs `open-knowledge start --content-dir ./internal-docs`. Auto-init scaffolds `.open-knowledge/`.
5. Browser opens to `http://localhost:3000`. Status badge in header: "Synced."

**Aha moment:** "Same as `gh repo clone` but I'm already in the editor, and my edits sync back automatically."

### J3 — P1: Non-developer signs in to clone a private repo

1. Same as J1 steps 1–3. User pastes a private repo URL.
2. Clone attempt returns 401. Dialog shows "Sign in to GitHub to access private repos."
3. User clicks "Sign in to GitHub." A modal appears: "Your code: **ABCD-1234** (copied to clipboard). Browser opening — paste this code there."
4. Browser opens `https://github.com/login/device`. User pastes the code. GitHub shows "Authorize Open Knowledge?" with `repo` scope. User clicks "Authorize."
5. Modal polls and detects approval (~5 seconds). Shows "Signed in as @username." Token stored in OS keychain (or `~/.open-knowledge/auth.yml` fallback).
6. Clone retries automatically. Proceeds as J1 steps 5–8.

**Aha moment:** "I didn't have to figure out tokens or SSH keys."

### J4 — WITHDRAWN (trust-pending journey removed with D9)

### J5 — P1: Non-dev happy-path collaboration (no conflicts)

1. User opens editor on a project with `.git/` + remote (cloned via J1/J3 or pre-existing).
2. Status badge: initial fetch runs → shows "Synced."
3. User edits pages for 10 min.
4. L1 auto-saves to disk → persistence L2 (30s idle) triggers dual-write: shadow WIP commit + parent-git commit on current branch (same tree hash, two `update-ref` calls; message `"WIP auto-save <ISO timestamp>"`).
5. 2 min later: background sync interval tick → pushes to origin. Badge briefly shows "Syncing..." → "Synced."
6. Teammate pushes changes to origin.
7. Next auto-fetch cycle: detects behind → auto-merges (clean fast-forward or 3-way merge) → file watcher triggers reconciliation → user sees new content appear.
8. Badge: "Synced" throughout. User never clicked anything.

### J6 — P1: Non-dev conflict path

1. User edits "onboarding.md" locally.
2. Teammate pushes conflicting edit to same file.
3. Auto-sync detects behind → tries merge → conflict markers produced on disk.
4. Sync pauses. Badge turns orange: "Conflict."
5. Project-level banner appears: "1 page has conflicting changes from your team. [Review and resolve]"
6. User clicks [Review and resolve] → side-sheet ConflictResolver opens (consistent with TimelinePanel).
7. Per file: [Keep my version] / [Keep team's version] / [Resolve manually].
8. [Resolve manually] opens DiffView in `conflictMode` with `@codemirror/merge mergeControls` — per-hunk accept/reject.
9. User resolves → sync resumes → merge completes → auto-push pushes resolved state to origin. Badge: "Synced."

### J7 — P2: Developer flow

1. Developer opens their existing repo in OK editor.
2. Auto-sync activates (remote detected). Runs invisibly.
3. Developer does interactive rebase in terminal. HEAD watcher detects → `commitUpstreamImport` records external commits in shadow → reconciliation keeps editor state coherent.
4. Developer uses `open-knowledge sync` CLI in scripts / CI.
5. Force-push from developer is manual via CLI; never automatic.

### J8 — Offline

1. Network drops while user is editing.
2. L1 auto-save continues (disk-local). Shadow commits continue (disk-local). Parent-git commits continue (disk-local).
3. Next auto-fetch fails → network-error classification → 3 retries with backoff → persistent failure.
4. Badge: grey "Offline — changes saved locally."
5. Network restored → next cycle succeeds → queued commits pushed → badge: "Synced."

### J9 — Auth expiry

1. GitHub token revoked externally (org policy, user regenerated token).
2. Next push fails with 401 → auth-error classification.
3. Sync pauses. Badge: red "Sign in again."
4. Toast: "Couldn't sync with GitHub — please sign in again. [Sign in]"
5. [Sign in] opens AuthModal (Device Flow, same as J3).
6. After re-auth: sync resumes, pushes queued commits.

### J10 — Protected-branch refusal (per D3)

1. User is on `main` of a team repo with GitHub branch protection (requires PR).
2. Auto-push tries to push to `origin/main` → 403 / non-fast-forward rejected with protection reason.
3. Sync pauses. Badge: "Sync disabled for this project."
4. Toast (P1-appropriate copy): "Can't sync to `main` — it's a protected branch. Ask a teammate to set up a branch for you, or adjust this project's branch protection settings. [Share this with a teammate →]" (copy action generates a shareable message with repo + branch + error context for a developer to act on). Developers see the same toast with an additional "Use git CLI" action.
5. `sync.enabled=false` persisted to workspace config. User can manually re-enable from config if they set up a non-protected workflow, or work via CLI.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Clone dialog (URL input) | Parsing URL... | "Paste a GitHub URL or search your repos" | "Invalid URL format" / "Repository not found" | Shows repo name + clone button | N/A |
| Clone dialog (repo browse) | Fetching repos... spinner | "Sign in to see your repos" | "Couldn't fetch repos" + retry | Scrollable filtered list | N/A |
| Clone progress (toast) | "Cloning {repo}... {phase}: {pct}%" | N/A | "Clone failed: {reason}" + retry/dismiss | "Opening {repo}..." | N/A |
| Auth (Device Flow modal) | "Waiting for authorization..." + polling | N/A | "Authorization timed out" / "Authorization denied" | "Signed in as @{user}" | N/A |
| Auth (PAT input) | Validating token... | "Paste a personal access token" | "Invalid token" / "Token missing required scopes" | "Signed in as @{user}" | N/A |
| Identity prompt (first sync) | N/A | N/A | "Please set your name and email" | "Sync started as @{user}" | N/A |
| Empty-state (ProjectPicker) | N/A | Three cards: Clone / Open / Start fresh | N/A | N/A | N/A |
| Timeline after clone | "No history yet" → T0 entry after HEAD-drift check | "History unavailable" if shadow init failed | N/A | T0: "upstream: initial import at {sha}" | N/A |
| Sync status badge | Spinner + "Syncing" | Hidden when no remote | Red icon + specific error state | Green check + "Synced" or count if ahead/behind | N/A |
| Conflict banner (project-level) | N/A | Hidden when no conflicts | N/A | "N page(s) have conflicting changes from your team. [Review]" | N/A |
| Conflict resolver (side sheet) | "Loading conflicts..." | "No conflicts" (shouldn't appear if banner absent) | Per-file error state | List of files w/ per-file actions | "N of M resolved" progress |
| DiffView (conflictMode) | Loading diff... | N/A | "Couldn't load conflict version" | Per-hunk accept/reject ready | Some hunks resolved |

---

## 6) Requirements

### Functional requirements

**Clone + onboarding (from precursor spec):**

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | CLI `open-knowledge clone <url> [<dir>]` command | Clones any git URL to `<dir>` (default: `./<repo-name>`). Chains into `open-knowledge start --content-dir <dir>`. Progress via simple-git plugin. Exit code 0 on success, non-zero with descriptive error on failure. | Registers alongside `start`, `init`, `mcp`, `preview`, `sync`, `push`, `pull` in `cli.ts` |
| Must | FR2 | Three-tier auth with detection-driven selection | (A) `gh auth token` succeeds → pass `-c credential.helper='!gh auth git-credential'` to simple-git. (B) Device Flow via `@octokit/auth-oauth-device` with `config.github.oauthAppClientId` (defaults to `Ov23liqlSd0V1MwR6rhI`; overridable via env var `OPEN_KNOWLEDGE_GITHUB_CLIENT_ID`). (C) PAT paste with `/user` validation. Selection: A if gh detected → stored token if present → B as default sign-in → C as menu fallback. | All three tiers functional from day one. Auth lives in CLI subcommands (not stateful server HTTP endpoints) — see FR17. |
| Must | FR3 | OAuth App Device Flow UX | On `onVerification`: auto-copy `user_code` to clipboard, auto-open `verification_uri` in default browser, show modal with visible code + "Waiting for authorization..." + cancel. Poll with `authorization_pending`/`slow_down` handling. 2-minute timeout with "Try again" option. | Matches VSCode pattern |
| Must | FR4 | Token storage: `@napi-rs/keyring` + plaintext fallback | `TokenStore` interface: `get(host)`, `set(host, login, token)`, `clear(host)`, `backend` property. Primary: OS keychain via `@napi-rs/keyring`. Fallback: `~/.open-knowledge/auth.yml` (`chmod 0600`) when keyring unavailable. Keyed by hostname. | Both paths ship together; log active backend at startup |
| Must | FR5 | URL parser: 5-regex + owner/repo shorthand | Accepts: `https://host/owner/repo(.git)?`, `git@host:owner/repo(.git)?`, `ssh://git@host/owner/repo(.git)?`, `git:host/owner/repo(.git)?`, `*.ghe.com` SSH variant, `owner/repo` shorthand (defaults to github.com). Returns `{protocol, hostname, owner, name}` or null. | Port Desktop's `remote-parsing.ts:27-95` |
| Must | FR6 | Target directory validation | Default: `./<repo-name>` (CLI) or `~/Documents/<repo-name>` (editor dialog). Validate target is empty or non-existent before clone. Clear error if target exists and is non-empty. Editor dialog has "Choose..." button for folder picker. | Matches Desktop's validate-empty pattern |
| Must | FR7 | Clone progress via sonner toast (editor) and terminal output (CLI) | Parse simple-git progress events `{method, stage, progress, processed, total}`. Phase-weighted percentage: Counting 0-10%, Compressing 10-20%, Receiving 20-60%, Resolving 60-100%. Cancel button on toast. | Reuses sonner primitive from PR #39 |
| Must | FR8 | Post-clone handoff: mode-dependent | Terminal mode: clone completes → read `<target>/.open-knowledge/server.lock`; if live → open browser to its port; else spawn `open-knowledge start --content-dir <target>` → wait for lock's port → open browser. JSONL mode (`--json`, spawned by editor): emit `{"type":"complete","dir":"<path>"}` → exit. Editor (JSONL consumer) issues separate `POST /api/local-op/open` to spawn server. | Terminal UX unchanged; editor decouples clone from server start. Prevents orphan servers when editor tab closes mid-clone. |
| ~~Must~~ | ~~FR9~~ | ~~Trust model~~ | **WITHDRAWN 2026-04-15** — trust-pending concept killed. See §10 D9, §13, and meta/_changelog.md. | — |
| ~~Must~~ | ~~FR10~~ | ~~FORBIDDEN_UNTRUSTED gate~~ | **WITHDRAWN 2026-04-15** — agent-write gating removed along with trust model. | — |
| Must | FR11 | Startup HEAD-drift check | On `createServer()` after `initShadowRepo()`: read `<shadowDir>/last-known-head`, compare against current project HEAD SHA. If different (including null → SHA for fresh shadow) → `commitUpstreamImport(shadow, contentRoot, lastKnownHead, currentHead, branch)`. Write current HEAD to file. On `destroy()` before shadow lock release: write current HEAD to file. | ~20 lines. Uses existing `commitUpstreamImport()`. Subsumes T0 clone case. |
| Must | FR12 | Editor empty-state: ProjectPicker component | Full-screen component shown when no project loaded (`documents.length === 0`). Three cards: "Clone from GitHub" / "Open folder on disk" / "Start fresh." "Clone from GitHub" opens CloneDialog (FR13). "Start fresh" invokes existing `NewItemDialog` (from PR #127). ProjectPicker supersedes the inline "Create your first file" CTA. | **Coordinate with Andrew (PR #127 owner)** — extends his shipped empty state additively |
| Must | FR13 | Clone dialog (editor-side) | URL paste field + authenticated repo browse list (when signed in) + local path field + "Clone" button. Triggers `POST /api/local-op/clone` (server relay spawns `open-knowledge clone --json`). Sign-in via `POST /api/local-op/auth/login`. Auth state via `POST /api/local-op/auth/status`. Repo browse via `POST /api/local-op/auth/repos`. Progress via sonner toast. | New React component + CLI subcommands |
| Must | FR14 | Non-GitHub URL handling | When parsed URL hostname ≠ github.com: skip Tier A/B/C GitHub-specific affordances. Set `GIT_TERMINAL_PROMPT=0`. Use `open-knowledge auth git-credential` (FR19) for credential handoff — if no stored credentials for that host, fall through to system git credentials (SSH agent, credential manager). Clear error on failure: "Couldn't authenticate to {hostname}. Make sure your system git is configured for this host." | Matches VSCode behavior for non-GitHub remotes |
| Must | FR15 | File menu entry: "Clone from GitHub..." | Menu item in editor header (File menu or overflow). Opens same CloneDialog as FR13. Available when a project IS loaded — result opens in new browser tab against the new server instance. | Complements empty-state entry point |
| Should | FR16 | `owner/repo` shorthand recognition | Typing `inkeep/open-knowledge` in URL field → auto-resolve to `https://github.com/inkeep/open-knowledge`. Show "github.com/inkeep/open-knowledge" as hint. | Matches Desktop + gh behavior |

**Credential flow (unified across clone + sync):**

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR17 | Auth surface: CLI-canonical via subprocess relays | Single auth implementation in CLI, invoked via `POST /api/local-op/auth/*` subprocess relays from the editor. Mirrors the clone relay pattern. Removes 5 originally-proposed `/api/auth/*` stateful endpoints. | New CLI subcommand group `auth`: `login`, `status`, `repos`, `signout`, `pat`, `git-credential` |
| Must | FR18 | Local-op endpoint security | All `/api/local-op/*` endpoints: (1) `127.0.0.1` bind + reject non-loopback via `req.socket.remoteAddress`; (2) Origin header check against server's bound host; (3) `--dir` confined to user's home dir (reject `..` path traversal); (4) URL protocol allowlist (`https://`, `ssh://`, `git://`, `git@<host>:` — reject `file://`, `javascript:`, `ext::`, etc.); (5) concurrency=1 per endpoint (429 on additional); (6) 10-min subprocess wall-clock timeout; (7) input sanitization (spawn with argv array, no shell interpolation). | Standard defense-in-depth for user-facing local automation |
| Must | FR19 | `open-knowledge auth git-credential` subcommand | New subcommand in `auth` group. Implements git's credential-helper protocol: reads key=value on stdin (host, protocol, etc.), reads `@napi-rs/keyring` by hostname, outputs `username=X\npassword=Y` on stdout. Every simple-git invocation (clone, fetch, pull, push) passes `-c credential.helper='!open-knowledge auth git-credential'`. No GIT_ASKPASS helper binary. No global git config modification. | Resolves clone-precursor Tier B/C credential handoff gap. Works for GitHub, GitLab, Bitbucket, and any host with keyring-stored credentials. |
| Should | FR20 | Signed-in user indicator | After successful auth (any tier): show "Signed in as @{username}" with avatar in the clone dialog / sync status popover. "Sign out" calls `TokenStore.clear(host)`. | Feedback that auth worked |
| Must | FR20a | Git identity resolution chain (per D29) | On first sync attempt that requires a commit: check if `user.name` + `user.email` are set in repo-local or global git config. If set → proceed. If unset AND user authenticated via Device Flow → derive from GitHub `/user` endpoint response (name/email/login stored at auth time), write to repo-local `.git/config`. If still unset (non-GitHub remote OR gh-delegated auth where we don't control the auth surface) → prompt via AuthModal variant: "Before syncing, tell your teammates who you are: [Name] [Email] [Save]" → write to repo-local `.git/config`. Re-check chain on each subsequent failed-identity error. | Reuses AuthModal component from FR13 with identity prompt variant. |

**Auto-sync engine (net-new):**

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR21 | Remote detection on startup | On `createServer()` after `initShadowRepo()` and HEAD-drift check: run `git remote -v`. If no remote OR `sync.enabled=false`, sync engine stays `dormant`; UI shows no sync badge. Fetch interval uses **±15% jitter**: configured `sync.intervalSeconds` (default 120s) becomes 102–138s actual interval per cycle. Prevents thundering-herd when multiple developers restart editors simultaneously (Syncthing ±25%, GitHub Desktop ±30s/hour precedent). | Gate for all sync functionality. Jitter applies to the periodic fetch cycle; shadow L2 is debounce-based and doesn't need jitter. |
| Must | FR21a | Sync follows HEAD's current branch (per D31) | Sync operates on whatever branch HEAD currently points to. If the user is on `main`, sync pushes to `origin/main`. If externally checked out `feature/foo`, sync pushes to `origin/feature/foo`. No UI restriction to default branch; no UI-exposed branch picker. On detached HEAD: sync temporarily pauses with `disabled` badge + tooltip "Detached HEAD — sync disabled until you check out a branch." On first push for a branch that has no origin counterpart: auto-sets upstream via `git push -u origin/<branch>`. | Mirrors shadow's existing branch-scoped behavior (`reconciledBase` per-branch, `switchReconciledBaseScope()`). If we later add a branch-picker UI, this FR becomes the default while UI surfaces per-branch choice. |
| Must | FR21b | Sync loop uses chained `setTimeout`, not `setInterval` | Each sync cycle schedules the next timer only AFTER the current cycle completes (`fetch → merge-if-behind → push-if-ahead → on-completion schedule next`). Effective cycle time is `operation_duration + jittered_interval`. Natural rate-limiting; prevents overlap if a cycle takes longer than the interval. | **Shadow-parallel: matches shadow L2's existing `scheduleGitCommit()` pattern at `persistence.ts:275-292`** (uses `commitInFlight` + `pendingAfterCommit` to serialize + recursively re-schedule). Same architectural approach. |
| Must | FR21c | Scheduler state persistence across restart | Persist sync engine state to `<contentDir>/.open-knowledge/sync-state.json` (sibling to `server.lock`). Schema v1: `{version: 1, lastSyncUtc, lastFetchUtc, consecutiveFailures, pausedReason?: string, pausedSinceUtc?, inflightConflicts: string[]}`. Written on each state transition (debounced 5s). On restart: compute remaining wait from `max(0, (lastFetchUtc + jitteredInterval) - now)` rather than restart-from-zero. | **Shadow-parallel pattern: `<shadowDir>/last-known-head`** (simple sidecar file for persistent git state) is the precedent — this extends the pattern to sync state at the contentDir level. Shadow's `reconciledBase` + `BlockConflict[]` are currently in-memory-only gaps (see Future Work F10, F11). |
| Must | FR22 | Dual-write at L2 | On `scheduleGitCommit()` → `commitToWipRef()`: compute tree hash once, then commit to shadow `refs/wip/<branch>/<writer-id>` AND to parent git `refs/heads/<branch>` using the same `commitWip` code with different `GitHandle`. Message: `"WIP auto-save ${new Date().toISOString()}"` (matches existing shadow behavior). Shadow-first, parent-second. If parent commit fails, retry on next cycle (bounded drift: at most one interval). | Parent commits use user's git config `user.name/.email` (per D29). Shadow commits keep hardcoded `openknowledge-server` identity (current behavior preserved). Separate index isolation: `GIT_INDEX_FILE=<parentGitDir>/index-ok-sync` (never touches user's staging area). Invariant: L1 disk write must complete before L2 commit-tree, otherwise the file watcher's buffered events interact with HEAD-watcher's upstream-import logic (`standalone.ts:1081-1083` comment documents this). |
| Must | FR23 | Background fetch + auto-pull with counted backoff + content-scoped conflict surface | Every jittered `sync.intervalSeconds` cycle: `git fetch origin`. If behind and no unresolved conflicts: `git merge origin/<branch>` (fast-forward preferred; fallback to 3-way merge). On clean merge: resume normal cadence. On conflict: **auto-resolve non-content-file conflicts with theirs** (`git checkout --theirs <file> && git add <file>` for any conflicted file NOT matching `content.include`/`content.exclude` — remote version wins for files outside our scope). Only content-file conflicts pause sync + surface conflict banner (FR27). Rationale: we only commit content files (D35), so non-content conflicts are between the user's external git work and their team's — not ours to surface. Auto-accepting theirs for non-content files prevents our conflict resolver from showing files it doesn't manage. **Counted backoff on consecutive network-class failures (per FR31 class 1):** after 3 consecutive transient failures, escalate to 5-min retry; after 5 total, 15-min retry; after 8 total, 60-min retry. Badge shows `offline`. Manual trigger (`/api/sync/trigger`) bypasses backoff + resets `consecutiveFailures` to 0. Reset on any successful fetch. | SiYuan/dejavu-inspired pattern (simplified from SiYuan's 7/8/15-step backoff). Counter persisted in `sync-state.json` (FR21c) so backoff survives restart. Shadow does not have an analog — shadow ops are local and don't have network-class transient failures. |
| Must | FR24 | Auto-push | After each successful L2 commit AND after each successful merge: if ahead of origin, push to `origin/<branch>`. Never force-push. | Never force-push, per NG2 |
| Must | FR25 | Rejected-push recovery (non-fast-forward) | If push rejected: pause auto-push, trigger fetch+merge, retry push. If merge conflicts: pause for user resolution (FR26). Do NOT force-push. | Covers the race where another push landed first |
| Must | FR26 | Protected-branch detection | When auto-push receives 403/rejected with branch-protection reason (parse stderr for GitHub's `protected branch` / `refusing to allow` / `At least N approving review` / secret-detection patterns, plus dugite's GH001–GH004 equivalents): set `sync.enabled=false` persisted to workspace config, emit toast ("Can't sync to `<branch>` — it's a protected branch. [Learn more]"), show "Sync disabled" state in badge. Do not try alternative workflows (no auto-branch, no auto-PR). | Per D3 happy-path-only scope |
| Must | FR27 | Conflict resolver UI + persistence | Side sheet (per D4) lists conflicted files (from `<contentDir>/.open-knowledge/conflicts.json`). Schema v1: `{version: 1, conflicts: [{file, source: 'parent-merge' \| 'reconcile', detectedAt, oursSha?, theirsSha?, baseSha?}]}`. Per-file actions: [Keep my version] (`git checkout --ours <file>` for parent-merge; apply `ours` state for reconcile), [Keep team's version] (`git checkout --theirs <file>`; or apply `theirs`), [Resolve manually] (opens DiffView with `conflictMode` + `@codemirror/merge mergeControls: true` for per-hunk accept/reject). When all files staged: complete merge via `git commit`; sync resumes. | Never exposes raw `<<<<<<<` markers to non-dev users. **Shadow-parallel:** the `source` discriminator allows the SAME conflict storage + UI to handle both parent-git merge conflicts (this spec) AND shadow's existing `BlockConflict[]` reconciliation conflicts (currently detected but not rendered — Future Work F11 gates on this FR landing first). D8 MEDIUM ⚠ on `mergeControls` fitness — pending separate OSS conflict-UI research. |
| Must | FR28 | Save Version enhancement | Creates: (a) shadow checkpoint (existing behavior, `refs/checkpoints/<branch>/<sha>` with WIP refs as parents; resets WIP refs after), (b) parent-git named commit on current branch (user-provided message via dialog, or auto-generated from changed files), (c) parent-git lightweight tag `ok/v<N>` (sequential). Auto-pushed on next sync cycle. Demoted from primary header button to overflow menu (per D2). | UI affordance change coordinated with any in-flight Save Version UI work |
| Must | FR28a | Rollback creates parent commit (per D30) | When user clicks "Restore this version" in Timeline, the rollback now creates (a) the existing shadow safetyCheckpoint (unchanged) AND (b) a parent-git commit on current branch with message `"Restored to v<N>: <original checkpoint message>"`. Auto-pushed on next sync cycle. Rollback becomes visible to teammates in git log. | Matches Google Drive precedent: restoration is a versioned event visible to all collaborators. |
| Must | FR29 | Sync status badge + manual sync button | In editor header. States: `dormant` (hidden) / `synced` (green check) / `syncing` (spinner) / `ahead N` / `behind N` / `conflict` (orange) / `offline` (grey crossed-cloud) / `auth-error` (red) / `disabled` (grey, tooltip with reason) / **`available` (cloud icon, no auto-sync — remote detected but sync.enabled=false)**. Click → details popover showing last sync time, counts, error message, and actions: **[Sync now]** (always present when remote exists — triggers immediate `POST /api/sync/trigger`; one-shot commit-of-watched-files + pull + push), [Pause/Resume] (when auto-sync on), [Sign in] (when auth-error), [Retry] (when offline). **When auto-sync is OFF:** badge shows `available` state; popover shows "Sync with GitHub" as primary action + "Enable auto-sync" toggle. When auto-sync is ON: badge shows normal states; popover shows "Sync now" for immediate trigger. | Figma-inspired placement (near presence). Primary status surface. Manual sync is always available if remote exists, regardless of auto-sync setting. |
| Must | FR30 | CC1 `sync-status` broadcast channel | New channel `ch:'sync-status'` on `__system__` Y.Doc. Emit on every state transition. Clients subscribe via existing `ProviderPool.__system__` mechanism. Debounced 100ms per channel (existing pattern). Payload follows existing CC1 contract `{v:1, ch:'sync-status', seq:N}` — pure signal; client re-fetches `/api/sync/status` on receipt. | Extends existing CC1 pattern (`files`, `backlinks`, `graph`) |
| Must | FR31 | Error classification with typed retryability (5-class taxonomy) | Each class explicitly marked retryable vs non-retryable (Temporal-inspired): **Class 1 Network** (DNS, timeout, 5xx, 429) — **retryable** with exponential backoff + jitter (per FR21) + counted backoff (per FR23). **Class 2 Auth** (401/403, expired token, scope mismatch) — **non-retryable**; pause sync; surface re-auth toast + AuthModal; transition to `auth-error`. **Class 3 Semantic** (non-fast-forward rejected, protected-branch, merge conflict) — **non-retryable**; pause; specific UI action per subclass. **Class 4 Structural** (LFS quota, large file, pre-receive hook, secret-detected) — **non-retryable**; guidance toast with doc link. **Class 5 Local** (index.lock, dirty tree, disk full) — **retryable** after cleanup. | Cross-domain anchors: Stripe type/code/decline_code, gRPC status codes, AWS retryability classification, **Temporal's `ApplicationFailure.non_retryable` / `nonRetryableErrorTypes` pattern** (which no git client currently implements). Shadow's errors are primarily Class 5 (local); could gain same typed classification as Future Work F12. |
| Must | FR32 | CLI sync commands | `open-knowledge sync` (commit + pull + push), `open-knowledge push` (push only), `open-knowledge pull` (pull only). Discover running server via `server.lock`, call HTTP endpoints, display text progress (or JSONL with `--json`). If no running server: perform the operation as a one-shot via CLI-local simple-git. | Parity with MCP discovery pattern |
| Must | FR33 | Server endpoints for sync | `GET /api/sync/status` (current state snapshot), `POST /api/sync/trigger` (fire-and-return manual sync; 202 accepted; progress via CC1), `GET /api/sync/conflicts` (list of conflicted files with metadata), `POST /api/sync/resolve-conflict` (body: `{file, strategy: 'mine'|'theirs'|'content', content?}`). Security: `127.0.0.1` bind + Origin check (same as `/api/local-op/*`). | All ops run in-process on running server; no subprocess relay needed (operates on same contentDir). |
| Must | FR34 | Config schema: `sync.*` section | Keys: `sync.enabled` (auto-detect from remote detection; override to disable), `sync.intervalSeconds` (default 120), `sync.autoCommit` (default true), `sync.autoPush` (default true), `sync.autoPull` (default true), `sync.commitMessage` (default `"auto"` = auto-generated; or template string). Per-repo override via workspace config `.open-knowledge/config.yml`. | Consistent precedence: CLI flags > env > workspace > user > defaults |
| Should | FR35 | Ahead/behind counts in badge popover | When `ahead N` or `behind N`: show counts. "Last synced 2 min ago." | Figma-inspired compact detail view |
| Should | FR36 | "Changes from team" indicator | When auto-fetch finds remote commits BEFORE pulling them: show "N changes from team" indicator in badge popover. Auto-pull triggers soon after. | Brief visibility into inbound work |
| Should | FR37 | Conflict count in badge | When conflicts pending: badge shows count ("3 conflicts"). Clicking opens conflict resolver. | Scales to many conflicts |
| Should | FR38 | AuthModal reused for re-auth | When auth-error triggers re-auth: reuse AuthModal from FR13 (Device Flow flow). | DRY auth surface |
| Could | FR39 | Branch picker (clone dialog) | After URL validated and repo accessible: dropdown to pick branch (default: repo's default branch). `GET /repos/{owner}/{repo}/branches`. | VSCode offers; Desktop does not. Deferred if costly. |
| Could | FR40 | Auto-merge strategy config | `sync.mergeStrategy: merge | rebase` (default `merge`). | Developers may prefer rebase for linear history |
| Should | FR41 | Manual sync pause/resume toggle | Button in sync status popover: Pause / Resume. Sets `sync.paused=true` in `sync-state.json` (FR21c) with `pausedSinceUtc` + optional `pausedReason`. Sync engine respects pause flag: auto-fetch + auto-push suspended. L2 dual-writes to shadow continue (shadow is local journal, unaffected by network-level pause). Manual trigger via CLI or `/api/sync/trigger` bypasses pause without clearing it. Status badge shows `disabled (paused)` with resume affordance. | **Shadow-parallel consideration:** shadow has `gitEnabled` config-only toggle; this introduces a parallel runtime toggle at sync layer. Obsidian-Git precedent (`pause` persisted in localStorage). Future Work F13 proposes symmetric runtime toggle for shadow (not v1). |

### Non-functional requirements

- **Performance:** Clone of a 10MB repo completes in <30 seconds on broadband. Sync fetch cycle (idle) completes in <2 seconds on typical repo. DiffView in `conflictMode` loads <500ms for files <50KB. Dual-write L2 overhead <10ms vs. shadow-only.
- **Reliability:** Clone/push/pull failure leaves no partial state. Dual-write drift bounded to 1 interval (shadow-first, parent-retry). Force-push never happens automatically (NG2).
- **Security/privacy:** No `client_secret` on user disk. OAuth App `clientId` is public (committed to source; configurable via env/config). Tokens in OS keychain or `0600`-permission file. `GIT_TERMINAL_PROMPT=0` prevents credential prompt hangs. Local-op endpoints follow FR18 security contract. Auto-sync never force-pushes. Parent-git index isolation (`GIT_INDEX_FILE`) preserves user's staging area. **OAuth scope trade-off (known):** GitHub's classic OAuth scope has no `repo:read`; `repo` grants read+write. Tier C (PAT) path mitigates via fine-grained PAT `Contents: Read` scope for read-only users. **Workspace-trust style gate:** Considered, rejected for v1 — see §13 Risks "Trust gate consideration (rejected)".
- **Operability:** `[clone]`, `[auth]`, `[head-drift]`, `[sync]`, `[sync-error]`, `[dual-write]` structured logs. Sync state machine transitions logged at INFO. Error classification logs at WARN. Failed retries log at ERROR after exhaustion.

---

## 7) Success metrics & instrumentation

- **M1: Time-to-first-edit.** Clone start → first keystroke in editor. Target: <60s for <50MB repos on broadband.
- **M2: Auth success rate.** Clone attempts succeeding on first auth attempt (any tier).
- **M3: Auto-sync activation rate.** Percentage of projects with detected remote that activate sync successfully on first startup (vs. no remote detected, sync disabled by config, protected-branch disable).
- **M4: Clone error rate.** Failure classification (auth / network / disk / parse).
- **M5: Sync round-trip latency.** L1 save → appeared on origin (for the user's own commits). Target: <3 minutes p50 at default 120s interval.
- **M6: Sync failure rate.** Per error class (network / auth / semantic / structural / local). Exposes which class dominates in practice.
- **M7: Conflict resolution completion rate.** Conflicts surfaced → [Keep mine] / [Keep theirs] / [Resolve manually] / dismissed without resolution.
- **M8: Protected-branch disable rate.** How often users hit FR26 (sync disabled after protected-branch rejection). High rate → we should revisit NG3.
- No baselines exist (greenfield). First 30 days establishes baseline.

---

## 8) Current state (how it works today)

**CLI:** Four commands (`start`, `init`, `mcp`, `preview`). No `clone`, `sync`, `push`, `pull`, `auth *`.

**Editor:** Assumes content dir exists. Empty state shows "Create your first file" CTA (PR #127, Andrew's `specs/2026-04-14-file-sidebar-new-file/SPEC.md`). Four creation entry points exist (sidebar + button, folder-row context menu, `Cmd/Ctrl+Alt+N`, empty-state CTA). Dialog: `NewItemDialog.tsx`. No clone or project-picking UI. Save Version button in `EditorHeader.tsx` (primary header placement today). Timeline panel (right sheet) reads `GET /api/history`. DiffView (`packages/app/src/components/DiffView.tsx`) uses `@codemirror/merge` in split/unified mode, read-only, for timeline preview — built by Miles in PR #39.

**Git integration:**
- `simple-git` is a server dependency for shadow-repo (`packages/server/src/shadow-repo.ts:16`).
- `shadowGit(shadow)` factory creates isolated simple-git instance per-operation.
- No `GIT_ASKPASS` or `credential.helper` usage exists anywhere in code today.
- Shadow repo location: `.git/openknowledge/` (integrated) or `.openknowledge/` (standalone).
- Per-writer WIP refs, checkpoint refs, upstream-import commits. `commitUpstreamImport()` exists (with `!oldHead` message branch written but never called for T0).
- HEAD watcher on `.git/HEAD`, `.git/MERGE_HEAD`, `.git/ORIG_HEAD`, `.git/index.lock` via `@parcel/watcher` with 100ms quiet window, 30s batch timeout.
- Batch gating (`isBatchInProgress`) blocks L1/L2 during HEAD moves.
- Reconciliation: three-way merge with `reconciledBase`; outcomes `noop|clean|merged|conflicts|refused`. Conflict markers detected but NOT rendered in any UI.

**Server:**
- `createServer()` wires shadow repo init, HEAD watcher, file watcher, persistence (L1+L2), reconciliation, shadow GC.
- L1: `onStoreDocument` (persistence.ts) — Y.Doc → markdown → atomic disk write + `writeTracker.register(hash)` for self-write feedback prevention.
- L2: `scheduleGitCommit()` (30s idle debounce) → `commitToWipRef()` → `commitWip(shadow, writer, contentRoot, message, branch)` with message `"WIP auto-save ${new Date().toISOString()}"` at `persistence.ts:183` and `defaultWriter = {id:'server', name:'openknowledge-server', email:'noreply@openknowledge.local'}`.
- Server lock at `<contentDir>/.open-knowledge/server.lock` — one server per contentDir.
- CC1 broadcast primitive at `__system__` Y.Doc — channels `files`, `backlinks`, `graph` exist; ready for `sync-status`.
- Sonner toast initialized at `main.tsx`.
- No config keys for git behavior today.

**Editor modes:** `'wysiwyg' | 'source' | 'diff'` state machine (PR #39, `EditorPane.tsx:16`). Conflict-pending is a new project-level state orthogonal to these document-level modes.

**No persisted state across restarts for reconciledBase, lastKnownHash, oldHead** (all in-memory today). Shadow WIP refs persist in git but never compared vs. disk at startup (FR11 fixes this).

---

## 9) Proposed solution (vertical slice)

### Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (React)                                                   │
│                                                                   │
│ ┌─ No project loaded ────────────────────────────────────────┐   │
│ │ ProjectPicker (FR12)                                        │   │
│ │ ├── [Clone from GitHub]  ──► CloneDialog                    │   │
│ │ ├── [Open folder on disk]                                   │   │
│ │ └── [Start fresh]  ──► NewItemDialog (PR #127)              │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│ ┌─ Project loaded ───────────────────────────────────────────┐   │
│ │ EditorHeader                                                │   │
│ │ ├── SyncStatusBadge (FR29)  ──► popover (ahead/behind)     │   │
│ │ ├── PresenceBar                                             │   │
│ │ └── Overflow menu                                           │   │
│ │     ├── Save Version (FR28; demoted from primary)          │   │
│ │     └── Clone from GitHub... (FR15)                        │   │
│ │                                                             │   │
│ │ ConflictBanner (if conflicts pending)                       │   │
│ │                                                             │   │
│ │ EditorArea (TipTap / CodeMirror / Preview mode)             │   │
│ │ TimelinePanel (right sheet, existing)                       │   │
│ │ ConflictResolver (right sheet, FR27) ──► DiffView w/       │   │
│ │                                          conflictMode       │   │
│ └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
         ┌───────────────────────┴────────────────────────┐
         │ Editor ↔ Server HTTP                            │
         │                                                 │
         │ Clone + Auth (subprocess relay):                │
         │  POST /api/local-op/clone  (FR13)               │
         │  POST /api/local-op/auth/login|status|repos|    │
         │       signout|pat  (FR17)                       │
         │  POST /api/local-op/open  (FR8)                 │
         │                                                 │
         │ Sync (in-process on running server):            │
         │  GET  /api/sync/status  (FR33)                  │
         │  POST /api/sync/trigger                         │
         │  GET  /api/sync/conflicts                       │
         │  POST /api/sync/resolve-conflict                │
         │                                                 │
         │ CC1 broadcast channel:                           │
         │  ch: 'sync-status' on __system__ Y.Doc (FR30)   │
         └───────────────────────┬────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────┐
│ Server: createServer({ contentDir, didAutoInit })                  │
│                                                                    │
│ Boot sequence (initAsync):                                         │
│ 1. acquireServerLock(lockDir)                                      │
│ 2. initShadowRepo(projectDir)                                      │
│ 3. ★ HEAD-drift check (FR11): read last-known-head,                │
│    compare vs current HEAD → commitUpstreamImport() if diverged    │
│    (T0 fresh clone = special case of drift: null → SHA)            │
│ 4. startWatcher(contentDir) — file watcher                         │
│ 5. startHeadWatcher(projectDir) — .git/HEAD watcher                │
│ 6. ★ Remote detection (FR21): git remote -v → if present +         │
│    sync.enabled: start SyncEngine                                  │
│                                                                    │
│ Runtime:                                                           │
│ ├── Persistence L1 (existing): CRDT → markdown → disk              │
│ ├── Persistence L2 (★ modified, FR22):                             │
│ │   commitToWipRef() dual-writes shadow + parent on same trigger   │
│ ├── SyncEngine (★ new, FR21-31):                                    │
│ │   ┌─────────────────────────────────────────┐                    │
│ │   │ state: dormant/idle/fetching/pulling/   │                    │
│ │   │   pushing/conflict/offline/             │                    │
│ │   │   auth-error/disabled                   │                    │
│ │   │                                         │                    │
│ │   │ interval tick (120s):                   │                    │
│ │   │  1. fetch origin                        │                    │
│ │   │  2. if behind + no conflicts: merge     │                    │
│ │   │  3. if ahead: push                      │                    │
│ │   │  4. on failure: classify + retry/pause  │                    │
│ │   │                                         │                    │
│ │   │ credential helper:                       │                    │
│ │   │  -c credential.helper=                   │                    │
│ │   │    '!open-knowledge auth git-credential' │                    │
│ │   │                                         │                    │
│ │   │ emits CC1 sync-status on transition     │                    │
│ │   └─────────────────────────────────────────┘                    │
│ ├── Conflict storage: <contentDir>/.open-knowledge/conflicts.json  │
│ └── Rollback, save-version: user-initiated; NOT trust-gated        │
│                                                                    │
│ Shutdown (destroy, CC8-ordered):                                   │
│ 1. Stop watchers                                                   │
│ 2. Drain agent sessions                                            │
│ 3. L1 flush                                                        │
│ 4. L2 flush (dual-write)                                           │
│ 5. Stop SyncEngine                                                 │
│ 6. Write currentHead → <shadowDir>/last-known-head                 │
│ 7. Release shadow lock                                             │
│ 8. Release server lock (try/finally guard)                         │
└─────────────────────┬──────────────────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────────┐
│ CLI: open-knowledge <subcommand>                                    │
│                                                                    │
│ start / init / mcp / preview (existing)                            │
│ clone <url> [<dir>] (FR1)                                          │
│ auth login (FR17 — Device Flow)                                    │
│ auth status (FR17)                                                 │
│ auth repos (FR17)                                                  │
│ auth signout (FR17)                                                │
│ auth pat (FR17 — validate + store PAT)                             │
│ auth git-credential (FR19 — implements git credential-helper       │
│   protocol; reads stdin, outputs credentials; invoked via          │
│   -c credential.helper='!open-knowledge auth git-credential')       │
│ sync / push / pull (FR32 — server-discovery via server.lock;       │
│   falls back to one-shot simple-git if no server running)          │
└────────────────────────────────────────────────────────────────────┘
```

### API design

#### Editor ↔ CLI subprocess relays (clone + auth)

The clone dialog (running in the browser) calls `POST /api/local-op/clone`. The server spawns `open-knowledge clone <url> --dir <path> --json` as a child process and streams stdout via chunked HTTP (`Transfer-Encoding: chunked`, `Content-Type: application/x-ndjson`):

```jsonl
{"type":"progress","stage":"receiving","progress":42,"processed":500,"total":1200}
{"type":"progress","stage":"resolving","progress":80,"processed":800,"total":1000}
{"type":"complete","dir":"/Users/nick/Documents/sales-playbook","port":3001}
{"type":"error","code":"AUTH_REQUIRED","message":"Sign in to access private repos","host":"github.com"}
```

Why subprocess relay for clone: running server is scoped to its current contentDir; cloning into a DIFFERENT dir violates one-server-per-contentDir. Subprocess isolation means clone failures don't destabilize the editor.

**Local-op endpoint family:**

| Method | Path | Relays | Purpose |
|---|---|---|---|
| POST | `/api/local-op/clone` | `open-knowledge clone --json <url> --dir <path>` | Clone a repo; streams progress + completion JSONL |
| POST | `/api/local-op/auth/login` | `open-knowledge auth login --json --host <host>` | Device Flow |
| POST | `/api/local-op/auth/status` | `open-knowledge auth status --json --host <host>` | `{authenticated, user?, tier?}` one-shot |
| POST | `/api/local-op/auth/repos` | `open-knowledge auth repos --json --host <host>` | Paginated user repos one-shot |
| POST | `/api/local-op/auth/signout` | `open-knowledge auth signout --host <host>` | Clears stored token |
| POST | `/api/local-op/auth/pat` | `open-knowledge auth pat --json --host <host>` (PAT via stdin) | Validates + stores PAT |
| POST | `/api/local-op/open` | Direct spawn `open-knowledge start --content-dir <dir>` | Spawns new server for cloned dir; returns port from lock |

All local-op endpoints enforce FR18 security.

#### Sync endpoints (in-process)

Running on the server that owns `<contentDir>`. No subprocess relay — sync operates on the same contentDir the server manages.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/sync/status` | — | `{state, lastSync, ahead, behind, error?, conflictCount}` |
| POST | `/api/sync/trigger` | `{op: 'sync'|'push'|'pull'}` | `202 Accepted` (fire-and-return); progress via CC1 |
| GET | `/api/sync/conflicts` | — | `{conflicts: [{file, mineSha, theirsSha, baseSha}]}` |
| POST | `/api/sync/resolve-conflict` | `{file, strategy: 'mine'|'theirs'|'content', content?}` | `{ok: true}` or error |

Security: same `127.0.0.1` bind + Origin check as `/api/local-op/*`. Not subprocess relays; in-process simple-git invocations.

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

**HEAD-drift persistence (`<shadowDir>/last-known-head`):** one-line raw SHA.

**Conflict persistence (`<contentDir>/.open-knowledge/conflicts.json`):**
```json
{
  "version": 1,
  "branch": "main",
  "conflicts": [
    {
      "file": "onboarding.md",
      "detectedAt": "2026-04-15T10:23:00Z",
      "oursSha": "abc123",
      "theirsSha": "def456",
      "baseSha": "789abc"
    }
  ]
}
```

**Config schema additions (`packages/cli/src/config/schema.ts`):**
```yaml
github:
  oauthAppClientId: "Ov23liqlSd0V1MwR6rhI"  # default; overridable

sync:
  enabled: true           # auto-detect from remote; override to disable
  intervalSeconds: 120
  autoCommit: true
  autoPush: true
  autoPull: true
  commitMessage: "auto"   # "auto" = match shadow ("WIP auto-save <ISO>")
  # Future: mergeStrategy: merge | rebase (FR40, deferred)
```

#### Auth / permissions

- **OAuth App clientId:** `Ov23liqlSd0V1MwR6rhI` (public default, committed to source at `packages/cli/src/github/app-config.ts`). Overridable via `config.github.oauthAppClientId` or env var `OPEN_KNOWLEDGE_GITHUB_CLIENT_ID`. Fork-friendly; resilient to OAuth App disruption.
- **Scopes:** Device Flow (Tier B) requests `repo`. **Known trade-off:** Classic OAuth has no `repo:read`; `repo` grants read+write. Tier C (PAT paste) UI suggests "For read-only access, use a fine-grained PAT with `Contents: Read` scope."
- **No `client_secret` on user disk.**
- **Token storage:** OS keychain via `@napi-rs/keyring` (primary); `~/.open-knowledge/auth.yml` with `chmod 0600` fallback. Keyed by hostname.
- **Tier A gh delegation:** `-c credential.helper='!gh auth git-credential'`.
- **Tier B/C + post-clone ops:** `-c credential.helper='!open-knowledge auth git-credential'` — our new subcommand reads `@napi-rs/keyring` by hostname, outputs git credential protocol.

#### Observability

- `[clone]`: url, host, auth tier, duration, result, error type
- `[auth]`: host, tier, backend (keyring/file), result
- `[head-drift]`: lastKnownHead, currentHead, upstreamImportSha
- `[sync]`: state transition, ahead, behind, duration
- `[sync-error]`: class (network/auth/semantic/structural/local), subclass, retry count, resolution
- `[dual-write]`: shadow_result, parent_result, drift_detected

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| Editor root (no project) | ProjectPicker empty state | Three cards render; "Clone from GitHub" opens dialog |
| Editor root (project loaded) | EditorHeader + overflow | Sync badge present; File menu has "Clone from GitHub..." |
| Clone dialog | URL + repo browse + path + progress | All interaction states |
| Auth modal (Device Flow) | Code display + polling + success/failure | Timeout, cancellation, slow_down backoff |
| Sync status badge | All 9 states | Each triggers correctly; popover shows right details |
| Conflict banner | Project-level | Appears when conflicts; dismiss on resolution |
| Conflict resolver (side sheet) | Per-file actions + DiffView w/ conflictMode | [Keep mine] [Keep theirs] [Resolve manually] work; DiffView mergeControls accept/reject |
| Timeline panel | T0 entry after clone | T0: "upstream: initial import at {sha}" |

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| URL parser | Invalid URL | Parser returns null | Immediate inline error | "Invalid URL format" |
| simple-git clone | Network drop | GitError with stderr | Partial clone cleaned up; error toast with retry | "Clone failed: network error" |
| simple-git clone | Auth failure | 401/403 GitError | Trigger Tier B/C sign-in | "Sign in to access private repos" |
| simple-git clone | Disk full | GitError | Cleaned up | "Not enough disk space" |
| Device Flow | Timeout 2min | Poll exhausted | Retry or PAT fallback | "Authorization timed out" |
| `@napi-rs/keyring` | Unavailable | Catch on `keyring.set()` | Fallback to file store | Transparent; log "using file storage" |
| HEAD-drift check | Shadow corrupt | commitUpstreamImport fails | Log warning; skip T0 | Timeline may be empty; editing unaffected |
| Dual-write L2 | Parent commit fails (dirty tree from external stage) | Git exit code non-zero | Shadow commit persists; parent retries next cycle | Bounded drift; sync may briefly show "ahead" state |
| Sync fetch | Network error | GitError | 3-retry exponential backoff | Badge: `offline` |
| Sync push | Rejected (non-FF) | GitError with "non-fast-forward" | Trigger fetch+merge, retry push | Brief `syncing` → `synced` or `conflict` |
| Sync push | Rejected (protected branch) | GitError with protection keywords | `sync.enabled=false`, toast, badge `disabled` | "Can't sync to `main` — it's a protected branch." |
| Sync merge | Conflict markers | `git merge` exit code + `.git/MERGE_HEAD` present | Pause sync; surface conflict banner | Badge: `conflict`; user resolves |
| Auth expiry | 401 from push | HTTP status | Pause; re-auth toast | Badge: `auth-error` |
| `mergeControls` limitation | Unknown out-of-box UX | Will verify via OSS research | Fallback: custom controls | D8 MEDIUM ⚠ flag |

### Alternatives considered

- **In-server hot-swap endpoint (Archetype B):** Rejected for clone (`createServer()` exposes no reconfigure hook; hot-swap creates cross-project contamination). Sync DOES run in-process on running server because it operates on the same contentDir.
- **isomorphic-git instead of simple-git:** Rejected for clone (no SSH; RAM ceiling). Rejected for sync (merge broken, 7-year open issue). simple-git is the industry-standard choice.
- **GitHub App instead of OAuth App:** Rejected. Requires backend for private RSA key.
- **keytar for token storage:** Rejected (archived Dec 2022).
- **Write-only-to-parent (skip shadow for sync):** Rejected. Would break shadow's per-writer attribution (HEAD watcher → `commitUpstreamImport` → `UPSTREAM_WRITER`). Dual-write IS the minimum-divergence path.
- **`GIT_ASKPASS` helper binary:** Rejected in favor of `open-knowledge auth git-credential` (matches clone-precursor's Tier A pattern; one CLI subcommand vs. a separate helper).
- **Atomic dual-write via filesystem lock:** Rejected. simple-git doesn't expose transactional semantics; shadow-first sequential with parent-retry is bounded-drift simpler.
- **Per-file offline drift detection:** Rejected. Creates asymmetry with online behavior; HEAD-drift is sufficient.

---

## 10) Decision log

**Renumbering note:** The original clone-precursor spec had D1–D19; the sync-precursor had D1–D9. Merged into linear D1–D28.

| ID | Orig | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|---|
| D1 | Clone-D1 | Clone mechanism: `simple-git` | T | LOCKED | No | Already dep; prior report settled | `reports/git-library-for-knowledge-platform/` | Inherits git-on-PATH assumption |
| D2 | Clone-D2 | Auth model: OAuth App + Device Flow + gh delegation + PAT | T/X | LOCKED | Yes (OAuth App registered) | No backend → Device Flow. OAuth App long-lived tokens vs GitHub App 8h. | Research D3; `Ov23liqlSd0V1MwR6rhI` registered on `inkeep` | clientId committed to source, overridable |
| D3 | Clone-D3 | Token storage: `@napi-rs/keyring` + `auth.yml` fallback | T | LOCKED | No | keytar abandoned; @napi-rs/keyring credible replacement; file fallback matches gh | Research D4 | Bun smoke test is pre-merge gate |
| D4 | Clone-D4 | Integration seam: Archetype A (CLI orchestrator + editor subprocess spawn) | T | LOCKED | No | In-server hot-swap violates one-server-per-contentDir | Research D10; `evidence/upstream-sync-flow.md` | Editor spawns CLI for clone; doesn't call server HTTP |
| D5 | Clone-D5 | URL scope: any git host paste + GitHub-only browse | P/T | LOCKED | No | Matches VSCode/Desktop | Research D2, D5 | Non-GitHub: system git credentials; no browse |
| D6 | Clone-D6 | GHES: Tier A + Tier C only (no Device Flow) | T | LOCKED | No | Device Flow against GHES needs admin OAuth App per-instance | Research D3 (GHES) | GHES users: PAT or gh delegation |
| D7 | Clone-D7 | UI naming: "Clone from GitHub" | P | LOCKED | No | Every studied editor uses "Clone"; "from GitHub" anchors source for non-devs | Research D9 | CLI: `open-knowledge clone` |
| D8 | Clone-D8 | Post-clone: chain into existing `start` auto-init | T | LOCKED | No | `start.ts:36-50` already auto-inits; zero new init code | Research D1 | Existing behavior verified |
| ~~D9~~ | Clone-D9 | ~~Trust model ships with feature~~ | P/X | **WITHDRAWN 2026-04-15** | ~~Yes~~ | Investigation found: current `.open-knowledge/config.yml` schema (content.*, server.*, persistence.*, mcp.tools.*) has **zero code-execution capability** — nothing a malicious config could execute. VSCode's Workspace Trust guards tasks.json + launch.json + settings.json which DO have execution power; our analog doesn't exist. Non-dev tools (Obsidian, Linear, Notion, Google Docs) don't have trust gates. For our non-dev primary audience + inert config surface, the gate is over-engineered. **Removed.** Cascade: FR9, FR10, J4, TrustBanner component, `~/.open-knowledge/trust.yml`, `FORBIDDEN_UNTRUSTED` HTTP gate, trust-pending UI state all REMOVED. `didAutoInit` runtime signal retained for informational logging only (no gate application). | See §13 Risks section "Trust gate consideration (rejected)" + meta/_changelog.md 2026-04-15 entry | Preserved here with WITHDRAWN status for audit trail. |
| D10 | Clone-D10 | Startup HEAD-drift check (subsumes T0) | T | LOCKED | No | No existing persisted state across restart; drift captures offline ops | `evidence/upstream-sync-flow.md` | ~20 lines in createServer + destroy |
| D11 | Clone-D11 | Audience: B2B SaaS dev + non-dev; intuitive copy | P | LOCKED | No | User-confirmed scope | Intake | Affects all copy + error messages |
| D12 | Clone-D12 | Progress: simple-git progress → sonner toast | T | LOCKED | No | simple-git has plugin; sonner shipped PR #39 | Research D7; timeline spec FR9 | Phase-weighted percentage |
| D13 | Clone-D13 | Scopes: `repo` | T | LOCKED | Yes (OAuth App setting) | `repo` covers private+public read+write; minimum scope | Research D3 | Tier C fine-grained PAT for read-only mitigates |
| D14 | Clone-D14 | Timeline: NOT extending `/api/history` to walk project-repo log | P/T | LOCKED | No | Timeline stays shadow-only | Intake Q5 | Cloned repos show T0 upstream-import entry only (via D10) |
| D15 | Clone-D15 | Non-HEAD file changes: folded into WIP (consistent online/offline) | T | LOCKED | No | Existing architecture; no per-file hash persistence | `evidence/upstream-sync-flow.md` | Consistent |
| D16 | Clone-D16 | Target dir: must be empty or non-existent | P | LOCKED | No | Matches Desktop's validate-empty | Research D6 | Clear error if non-empty |
| D17 | Clone-D17 | Auth surface: CLI-canonical via subprocess relays | T | LOCKED | Yes (API surface shape) | Two parallel auth surfaces (CLI + HTTP) duplicate logic. Single impl in CLI, relayed via `/api/local-op/auth/*`. | Design challenge M2 | New CLI subcommands; removes 5 stateful `/api/auth/*` endpoints |
| D18 | Clone-D18 | Local-op endpoint security: 127.0.0.1 + Origin + path + protocol + concurrency=1 | T/X | LOCKED | Yes (security contract) | Subprocess spawner needs explicit security boundary | Design challenge M3 | See FR18 |
| D19 | Clone-D19 | Post-clone handoff: mode-dependent (Terminal auto-starts; JSONL does not) | T | LOCKED | No | JSONL mode prevents orphan servers when editor tab closes mid-clone | Design challenge L6 | Extends FR8 |
| D20 | Sync-D1 | **Auto-sync is OPT-IN, not default-on.** When a remote is detected, sync stays dormant until user explicitly enables it. Opt-in surfaces: (a) `open-knowledge init` prompt ("Enable auto-sync with remote?"), (b) post-auth flow after signing in ("Enable sync for this project?"), (c) settings/config.yaml `sync.enabled: true`. Once enabled: aggressive but batched — shadow commits at L2 (30s idle), parent commits at push-time only (squash-before-push, see D33), auto-pull on interval. **Timing (push + pull intervals) is an OPEN QUESTION for implementation** — research validated 30s/60s/120s are all safe against GitHub rate limits; SiYuan uses 30s, Logseq 60s, Obsidian-Git 10min. | P | LOCKED (direction); **OPEN** (timing) | No | Nick direction (2026-04-15): "they opt in to auto-commit." Research finding: NO production tool defaults to full-auto bidirectional git sync. Opt-in addresses industry concern #4 ("push is a public action — requires explicit intent"). CRDT layer structurally mitigates concerns #1 (merge conflicts) and #3 (no mobile merge). | `evidence/why-full-auto-git-sync-rare.md` — comprehensive survey; 0/6 tools default to full-auto | `sync.enabled` starts as `false` (or absent) in config. User action flips to `true`. |
| D21 | Sync-D2 | Save Version demoted to overflow menu; auto-sync is primary UX | P | LOCKED | No | Auto-sync handles continuous flow; Save Version for intentional milestones only. Primary UI real estate to sync status. | Nick direction | UI placement change; coordinate with any in-flight Save Version UI work |
| D22 | Sync-D3 | Protected branches: sync disabled for that repo. Happy path only. | P | LOCKED | No | Nick scope: "auto sync with origin main on or off. Nothing in between." Tightly scoped. No auto-branch, no auto-PR. | Nick direction | Revisit if significant customer demand |
| D23 | Sync-D4 | Conflict resolver form factor = side sheet | P | LOCKED | No | Consistent with Timeline panel pattern; non-blocking; scales to many conflicts. | Research (D8 non-dev abstraction) | Same component slot as TimelinePanel |
| ~~D24~~ | Sync-D5 | ~~Auto-sync NOT gated on trust in v1~~ | P/T | **WITHDRAWN 2026-04-15** | No | Moot: trust gate itself removed (D9). No gating anywhere. | N/A | Preserved here with WITHDRAWN status for audit trail. |
| D25 | Sync-D6 | **Parent commit message: descriptive file-list** (different from shadow). Shadow keeps `"WIP auto-save <ISO>"` at L2 (unchanged). Parent commit at push-time uses squash message: `"Auto-save: Updated X.md, Y.md"` (≤3 files) or `"Auto-save: N files changed"` (>3). Save Version: user-provided message. Different messages for different audiences (internal journal vs. team-visible). | T | LOCKED | No | Squash-before-push (D33) creates one parent commit per cycle. Message should reflect what changed in the cycle, not mirror shadow's per-L2-flush timestamp. | Spec-challenger H1 analysis | Reversible |
| D26 | Sync-D7 | **Shadow commits at L2 (unchanged). Parent commits at push-time only.** L2 persistence calls `commitWip(shadow)` only — no parent write at L2. Parent commit happens in sync engine's push cycle: `writeTree` of content-filtered files → diff vs `lastPushedSha` → skip if unchanged → `commitTree` → `updateRef` → push. Same `commitWip` plumbing, different timing. | T | LOCKED | No | Dual-write at L2 would produce N commits per push cycle (history noise — challenger H1). Decoupling: shadow's purpose (attribution journal) at journal cadence; parent's purpose (team-visible history) at publish cadence. Simpler: removes parent op from hot L2 path. | Spec-challenger H1, squash analysis | Parent only touched by sync engine (not L2) — simplifies parentGitMutex (D32) |
| D27 | Sync-D8 | **Conflict resolver v0: per-file AND per-hunk Accept/Reject (Keep mine / Keep theirs) — NO manual inline editing.** Unified-mode DiffView + custom `mergeControls` render function for styled buttons per hunk. Users pick Accept/Reject per hunk; never hand-edit conflict markers or merged text. Abort option ("Exit merge") undoes merge attempt + points to docs. `collapseUnchanged: true`. Miles finalizes exact UX. | P/T | **LOCKED** (direction) | No | Source-level `@codemirror/merge` v6.12.1: custom render, per-hunk granularity, unified-mode. Only production per-hunk accept/reject in surveyed libraries. No manual editing means non-devs can't accidentally corrupt merge state. | `reports/git-lifecycle-push-pull-merge-patterns/evidence/codemirror-merge-controls-fitness.md` | Abort = `git merge --abort` + toast with docs link. |
| D28 | Sync-D9 | Credential flow: `open-knowledge auth git-credential` subcommand implementing git credential-helper protocol. **v1 without token refresh.** GitHub OAuth `gho_` tokens don't expire — refresh adds zero value for primary host. Non-GitHub forges (GitLab 2h, Bitbucket 1h, Gitea 1h) hit token cliff → FR31 Class 2 re-auth toast (functional, not silent). Refresh deferred to Future Work (~150 LOC port of `hickford/git-credential-oauth` pattern; blocked by Git 2.45+ adoption for macOS `osxkeychain` refresh-token persistence). Users who need refresh NOW can chain our helper with GCM or git-credential-oauth (interop preserved). | T | **LOCKED** | No | Source-level on git credential protocol (`credential.c`), GCM (`GitLabHostProvider.cs`, `BitbucketHostProvider.cs`), hickford/git-credential-oauth (`main.go` — ~600 LOC Go CLI), per-forge OAuth docs. Git 2.40 added `password_expiry_utc`, 2.41 added `oauth_refresh_token`, but macOS osxkeychain needs 2.45+ to persist. Ubuntu 22.04 LTS ships 2.34 (below threshold). GCM's refresh PR #1464 open since Nov 2023, unmerged. | `reports/git-lifecycle-push-pull-merge-patterns/evidence/credential-helper-token-refresh.md` (source-level on git protocol + GCM + hickford + per-forge token behavior) | Future Work: add refresh when Git 2.45+ adoption is broader or demand surfaces. |
| D29 | new 2026-04-15 | **Parent commit author identity = user's git config.** Shadow keeps its hardcoded `openknowledge-server <noreply@openknowledge.local>` (internal journal, existing behavior). Parent git uses user's `user.name` / `user.email` from git config — team-visible on origin. Resolution chain (repo → global → derive-from-GitHub-auth → AuthModal prompt) per FR20a. | P/T | LOCKED | No | Claude Code precedent: user's git config by default + `Co-Authored-By` trailer. Applied here to the new public-facing surface (parent git); shadow stays internal. Two surfaces, two appropriate identities. | Claude Code docs ([deployhq](https://www.deployhq.com/blog/how-to-use-git-with-claude-code-understanding-the-co-authored-by-attribution), [settings docs](https://code.claude.com/docs/en/settings)); shadow code verification at `shadow-repo.ts:180-183, 345-348, 486-489` (hardcoded identity always used). | Fallback chain is FR20a. |
| D30 | new 2026-04-15 | **Rollback creates a parent-git commit** (in addition to the existing shadow safetyCheckpoint). Commit message: `"Restored to v<N>: <original message>"`. Auto-pushed on next sync cycle. | P | LOCKED | No | Google Drive precedent: restoration is a versioned event visible to all collaborators. Restoring a version makes it the current version for the team; the restore itself is in history. | [Google Drive version history docs](https://support.google.com/drive/answer/2409045) | Rollback becomes a team-visible event in parent git log. |
| D31 | new 2026-04-15 | **Sync follows HEAD's current branch** (no restriction to `main`/default). If user is on `feature/foo`, sync pushes to `origin/feature/foo`. On detached HEAD: sync paused with `disabled` badge. On first push for a branch that has no origin counterpart: auto-sets upstream. | P/T | LOCKED | No | Mirrors shadow's existing branch-scoped behavior (`reconciledBase` per-branch, `switchReconciledBaseScope()`). No branch-changing UI exists today (investigation confirmed); user switches branches externally via git CLI, HEAD watcher handles it. No restriction to add. D22's "main only" wording was product intent about scope (no branch-picker UI in v1), not a code-level restriction. | Shadow source: branch-scoped `reconciledBase` per-branch map; `switchReconciledBaseScope()` exists; no branch UI in `packages/app/src/components/`. | If branch-picker UI is added later, this FR becomes the default; UI surfaces per-branch choice on top. |

| D32 | new 2026-04-15 | **parentGitMutex: all parent-git mutations serialize through a single async queue.** L2 dual-write commit (now push-time-only per D26), sync fetch+merge, sync push, Save Version parent commit, rollback parent commit — all must hold exclusive access to avoid race conditions (spec-challenger H2 identified: sync merge can advance branch ref while push-time commit has stale parent → merge content lost). Pattern: same as shadow's `commitInFlight` + `pendingAfterCommit` in `persistence.ts:275-292`. ~30 LOC mutex wrapper. | T | **LOCKED** | No | Challenger H2 identified genuine race between L2 dual-write and sync-engine ops. Since D26 now puts parent commits in sync engine only (not L2), the mutex simplifies: only sync-engine-internal operations need serialization. But Save Version and rollback also touch parent — they must acquire the mutex too. | Spec-challenger H2 analysis + `persistence.ts:275-292` shadow pattern | All parent-git write operations go through this queue. |
| D33 | new 2026-04-15 | **Squash-before-push: one parent commit per push cycle, not N.** At push time: `writeTree` of current content-filtered files → diff tree vs `lastPushedSha` tree → if same, skip → else `commitTree(tree, parent=lastPushedSha, msg)` → `updateRef` → push. Shadow retains per-edit granularity. Remote gets one clean "Auto-save: Updated X, Y" commit per cycle. No force-push needed (each commit builds on previous). | T | **LOCKED** | No | Spec-challenger H1 analysis: Obsidian-Git precedent is for personal vaults, not shared team branches. Auto-commit noise poisons `git log`, `git blame`, CI/CD triggers on shared branches. Squash eliminates this. ~50-100 LOC using existing `commitWip` plumbing (tree computation shared). | Spec-challenger H1, squash-before-push analysis | `lastPushedSha` persisted in `sync-state.json` (FR21c). Save Version creates separate named commit directly on branch (not squashed). |
| D34 | new 2026-04-15 | **Auto-sync is opt-in, not default-on.** `sync.enabled` defaults to `false` (or absent) in config. User explicitly enables via: (a) `open-knowledge init` prompt when remote detected, (b) post-auth flow after Device Flow sign-in, (c) settings/config.yaml. Once enabled, full auto-sync activates (auto-commit of watched files + auto-pull + squash-push). | P | **LOCKED** | No | Research finding: NO production tool defaults to full-auto bidirectional git sync (0/6 surveyed). Developer tools actively reject auto-push (GitHub Desktop #2191 closed, VS Code #14885 closed). Opt-in addresses concern #4 ("push is a public action — requires explicit intent"). Nick: "they opt in to auto-commit." | `evidence/why-full-auto-git-sync-rare.md` | Aligns with industry posture while offering the capability. Once opted in, UX is Figma-like invisible sync. |
| D35 | new 2026-04-15 | **Content-scope-only parent commits.** Auto-sync only commits files matching `content.include` / `content.exclude` patterns from `config.yaml` (same patterns the file watcher + content filter already use). Does NOT `git add .` or `git add -A`. Non-content files (README.md outside content dir, CI configs, images not in include pattern) are untouched by our auto-commits. User manages non-content files via git CLI. | T | **LOCKED** | No | Nick direction: "we'd only auto-commit if our 'watched' files change, not for any other files in that git project." Reuses existing `ContentFilter` primitive from file-watcher. Shadow already uses `contentRoot` pathspec in `commitWip` — parent does the same. | Shared primitive: `ContentFilter` from `packages/server/src/content-filter.ts` | If user wants all files synced, they can set `content.include: ['**/*']` — but default is markdown content only. |

### Decision uncertainty flags — ALL RESOLVED

All previously MEDIUM ⚠ items resolved via targeted research (2026-04-15):
- **D27:** `@codemirror/merge mergeControls` fitness confirmed via source-level analysis of v6.12.1 — custom render function, unified mode, per-hunk granularity all viable → upgraded to **LOCKED HIGH**
- **D28:** Token refresh strategy resolved: v1 without refresh (GitHub `gho_` tokens don't expire; non-GitHub gets FR31 Class 2 re-auth toast; refresh is ~150 LOC Future Work; chaining with GCM/git-credential-oauth available today) → upgraded to **LOCKED HIGH**

---

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | How does the editor detect "no project loaded" for ProjectPicker? | T | P0 | No | `documents.length === 0` from `/api/documents` polling (FileTree.tsx:394-416) | **Resolved** (from clone precursor) |
| Q2 | How does the clone dialog spawn the CLI subprocess from React? | T | P0 | No | `POST /api/local-op/clone` spawns `open-knowledge clone --json` as child process, streams JSONL via chunked Transfer-Encoding | **Resolved** (from clone precursor) |
| Q3 | How does the server detect externally-authored project-local metadata? | T | P0 | No | Unforgeable runtime signal: `didAutoInit` boolean passed to `createServer()`. Sentinel-based approach rejected (spoofable). | **Resolved** (from clone precursor) |
| ~~Q4~~ | ~~How does trust-pending compose with PR #39's preview mode?~~ | T | P0 | No | **Resolved historically (clone precursor); now moot** as trust-pending is withdrawn. Preserved for audit trail. | **Moot** |
| Q5 | Bun smoke tests: pre-merge matrix? | T | P0 | No | Three `*.smoke.test.ts` files: (1) simple-git clone + progress, (2) @napi-rs/keyring cycle, (3) @octokit/auth-oauth-device mock. | **Resolved** (from clone precursor) |
| Q6 | Where does "Clone from GitHub..." live in the header? | P | P0 | No | **DELEGATED** to implementer. D21 demotes Save Version to overflow menu — putting Clone from GitHub there is natural. | **Resolved** (from clone precursor, updated by D21) |
| ~~Q-M1~~ | ~~mergeControls fitness~~ | T | P0 | No | **RESOLVED 2026-04-15:** source-level analysis of @codemirror/merge v6.12.1 confirmed custom render function + unified mode + per-hunk = viable. D27 → LOCKED HIGH. See `reports/git-lifecycle-push-pull-merge-patterns/evidence/codemirror-merge-controls-fitness.md`. | **Resolved** |
| ~~Q-M2~~ | ~~Token refresh strategy~~ | T | P0 | No | **RESOLVED 2026-04-15:** v1 without refresh. GitHub `gho_` doesn't expire; non-GitHub → re-auth toast; refresh ~150 LOC Future Work. D28 → LOCKED HIGH. See `reports/git-lifecycle-push-pull-merge-patterns/evidence/credential-helper-token-refresh.md`. | **Resolved** |
| ~~Q-M3~~ | ~~Trust gate rationale refinement~~ | P | P0 | No | **RESOLVED 2026-04-15:** trust gate withdrawn entirely (D9). Rationale question moot. | **Resolved** |
| ~~Q-M4~~ | ~~Trust scope wording~~ | P | P0 | No | **RESOLVED 2026-04-15:** no gate, no wording. | **Resolved** |
| Q-M5 | Save Version UI coordination — D21 demotes to overflow. Check for in-flight work. | P | P2 | No | Coordinate with Andrew/Miles. | **Open** — coordination |
| Q-M6 | Should sync-CLI support `--dry-run`? | P | P2 | No | Add if user feedback requests. | **Open** — Future Work |
| **Q-TIMING** | **Sync interval: push + pull cadences.** Research validated 30s/60s/120s are all safe against GitHub rate limits (15 ops/sec per repo soft limit; single user at 30s = 0.033 ops/sec, 1000x under). Prior art: SiYuan 30s (bundled), Logseq 60s (push-only), Obsidian-Git 10min (both disabled by default), GitHub Desktop 1hr fetch-only. **Options:** (a) single `sync.intervalSeconds` at 60s (both push+pull), (b) decouple: `sync.pushIntervalSeconds: 60`, `sync.pullIntervalSeconds: 30` (pulls are cheap; faster pull = more real-time incoming changes). Nick leans B with push=60s, pull=30s but left open. **Miles decides.** | T | **P0 — OPEN** | No | Research basis: `evidence/c1-git-editor-sync-dynamics.md`, `evidence/why-full-auto-git-sync-rare.md`. GitHub rate limits: no concern at these cadences ([community#44515](https://github.com/orgs/community/discussions/44515)). | **Open — Miles decides** |
| **Q-OPTINUX** | **Opt-in flow UX.** Three surfaces proposed: (a) `open-knowledge init` prompt when remote detected, (b) post-auth flow after Device Flow, (c) settings/config.yaml. Exact dialog copy + interaction flow left to implementer. | P | **P0 — OPEN** | No | D34 locks the principle (opt-in); UX is implementation detail. | **Open — Miles designs** |
| **Q-ABORTUX** | **Conflict abort UX.** When user exits merge without resolving: (a) run `git merge --abort`, (b) show toast with link to docs/help. Exact copy + flow for Miles. | P | P2 | No | D27 locks per-hunk accept/reject + abort option. | **Open — Miles designs** |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `simple-git` works under Bun for clone + progress callback | HIGH (shadow-repo already uses simple-git under Bun) | Bun smoke test: `simpleGit({progress}).clone(publicRepo, tmpDir)` | Pre-merge | Active |
| A2 | `@napi-rs/keyring` works under Bun (napi-rs standard + Bun N-API) | MEDIUM (no public Bun verification found) | Bun smoke test: `keyring.set('test', 'user', 'token'); keyring.get('test', 'user')` | Pre-merge | Active |
| A3 | `@octokit/auth-oauth-device` works under Bun | HIGH (pure HTTP) | Smoke test against test OAuth App | Pre-merge | Active |
| A4 | Privacy policy at `https://inkeep.com/policies/privacy` suits OAuth App registration | HIGH (verified) | Already verified | N/A | Verified |
| A5 | `simple-git`'s `-c credential.helper=...` per-invocation flag overrides git config helpers | HIGH (documented pattern, used by Tier A clone) | Existing clone-precursor verification | Pre-merge | Active |
| A6 | `@codemirror/merge` `mergeControls` with custom render function provides usable per-hunk controls | **HIGH** (source-verified v6.12.1) | Verified via source-level analysis | N/A | **Verified** |
| A7 | Dual-write overhead (one extra `commit-tree` + `update-ref` per L2 flush) is <10ms | MEDIUM | Perf benchmark against existing shadow-only L2 | Pre-merge | Active |
| A8 | Parent-git branch protection rejection is detectable via stderr string patterns (GitHub-specific) | MEDIUM | Source-trace dugite's 59 codes; test against real GitHub protected branch | Pre-merge | Active |

---

## 13) Risks & mitigations

### Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| `@napi-rs/keyring` fails on Bun | Low | Medium (fallback to file store) | Bun smoke test pre-merge; file fallback architecturally correct | Nick |
| OAuth Device Flow UX confuses non-devs | Medium | Medium (abandoned auth) | Auto-copy clipboard + auto-open browser; PAT fallback | Nick |
| Large repo clone takes >60s, user thinks hung | Medium | Low | Phase-weighted progress bar; cancel button | Nick |
| Shadow repo init fails on corrupt .git/ | Low | Low | Graceful degradation: `degraded.push('shadow-repo')`, timeline "History unavailable" | Miles |
| Dual-write partial failure (shadow succeeds, parent fails) | Medium | Medium | Bounded drift: parent catches up on next cycle via retry; drift detection logs | Nick |
| Force-pushed remote breaks auto-pull | Low | Medium | Classify as specific error; do NOT auto-force-pull; user recovery via CLI | Nick |
| Multi-user push races on same branch | Medium | Low | Server detects rejection → pull/merge/retry; at most one conflict dialog | Nick |
| Auto-commits produce git log noise on origin | Medium | Medium | Accept for v1 (Obsidian-Git precedent); F8 Future Work if user complaints | Nick |
| `@codemirror/merge mergeControls` fitness insufficient | Medium | Medium (fallback: custom controls) | OSS research Direction 2 pre-implementation | Nick |
| Protected-branch stderr pattern mis-classification (new GitHub error strings) | Low | Low | Defensive: treat unrecognized rejection as "auth/semantic error, pause sync, surface toast with raw stderr excerpt" | Nick |
| Local-op endpoint subprocess hangs | Low | Medium | 10-min wall-clock timeout (D18); concurrency=1 prevents pile-up | Miles |
| OAuth App suspended/rate-limited by GitHub | Low | High | Fallback: PAT (Tier C); config override allows forks | Nick |
| **External:** npm-install asset-path bug (F1, PR #138) blocks browser UI on `bunx @inkeep/open-knowledge` | High (known) | High | Andrew owns fix; pre-merge gate: F1 must land | Andrew (external) |

### Trust gate consideration (rejected)

**Decision (D9 WITHDRAWN 2026-04-15):** We considered VSCode-style Workspace Trust (cloned repos open in read-only mode until user reviews + approves, with agent-write endpoints returning `403 FORBIDDEN_UNTRUSTED`). Ultimately rejected for v1.

**Investigation finding:** The current `.open-knowledge/config.yml` schema (`packages/cli/src/config/schema.ts`) contains only `content.{include,exclude,dir}`, `server.{port,host}`, `persistence.{debounceMs,maxDebounceMs}`, `mcp.tools.*` bounded integer params. **Zero code execution. Zero webhooks. Zero task runners.** A malicious config can annoy (bad port, huge debounce) but cannot execute code.

VSCode's Workspace Trust protects `.vscode/tasks.json` + `launch.json` + `settings.json` — all of which CAN execute arbitrary commands or activate extensions. Our config surface has no equivalent power.

**Precedent check:** Trust-pending concept exists in VSCode (since 2021), JetBrains Trust Project, Cursor/Windsurf (inherited from VSCode). **Absent in all non-dev tools surveyed** (Obsidian, Linear, Notion, Google Docs, Joplin, Logseq, SiYuan). For our non-dev primary audience + inert config schema, the machinery is over-engineered.

**Future revisit triggers:**
- `.open-knowledge/config.yml` schema grows to include `tasks:`, `hooks:`, `webhooks:`, or similar execution surfaces (config becomes code-equivalent)
- A concrete threat model emerges where cloned repo content amplifies risk through agent-write endpoints in a way that file-content-already-on-disk doesn't
- Users explicitly request a review-before-editing posture
- MCP tool surface grows to include operations with side effects beyond the local content directory (e.g., network requests, file system access outside contentDir)
- Content rendering gains code execution capability (plugins, custom components, embedded scripts) — the cloned content itself becomes an execution vector independent of config

If revisited, re-introduce the `didAutoInit` signal + `trust.yml` schema from the withdrawn D9 as the foundation.

---

## 14) Future work

### Shared-primitive reuse principle (new precedent, reframed from "shadow-parallel" per audit challenge)

**Added 2026-04-15 per Nick directive; reframed per spec-challenger finding M5:** before introducing any new persistent state, scheduler mechanic, error handling, or UI primitive, first ask:

1. **Does a shared primitive already serve this need?** (e.g., `GitHandle`, `commitWip`, `CC1 broadcast`) → use the shared primitive; don't build a parallel one.
2. **Can both shadow and parent benefit from the same new primitive?** → build one primitive that serves both via parameterization (e.g., `conflicts.json` with `source: 'parent-merge' | 'reconcile'` discriminator).
3. **Is this legitimately target-specific?** (credentials, remotes, protected branches for parent; per-writer attribution refs for shadow) → accept the divergence, document it explicitly.

The framing is "shared primitives serve both targets" — not "shadow is the template and parent conforms." Shadow and parent have fundamentally different purposes (internal journal vs. team-visible collaboration surface), different failure modes, and different identity models. Primitives are shared where they naturally overlap; concerns diverge where requirements differ.

This complements CLAUDE.md's Architectural Precedent #1 (typed transaction origins) and #2 (generic primitives over specific ones). Apply during implementation decomposition.

### Shadow gaps surfaced by this spec (shadow-parallel Future Work)

These are PRE-EXISTING shadow gaps that the sync-engine design illuminates. Not blocking for this spec; captured here as Future Work so the lens doesn't lose the signal.

- **F10 [Identified]: Shadow `reconciledBase` persistence.** Currently `Map<branch, Map<docName, string>>` is in-memory-only. Cold vs. warm restart may reconcile disk differences differently. Pattern: extend `<shadowDir>/` sidecar with `reconciled-base.json`, following `last-known-head`'s precedent.
  - Trigger: observed reconciliation bug traceable to cold-restart divergence, or explicit shadow team decision to harden.
- **F11 [Identified]: Shadow `BlockConflict[]` rendering + persistence.** Currently reconciliation conflicts are detected + logged + lost. FR27's ConflictResolver UI + `conflicts.json` schema already supports a `source: 'parent-merge' | 'reconcile'` discriminator — shadow reconciliation conflicts plug into the SAME UI via the same persistence file. Small additional effort once FR27 lands.
  - Trigger: users report "the editor told me there was a conflict in the logs but didn't show me."
- **F12 [Noted]: Shadow typed error classification.** Adopt FR31's 5-class taxonomy for shadow's internal errors (mostly Class 5 Local). Low priority; unifies error handling when Timeline UI wants to surface shadow-specific error states.
- **F13 [Noted]: Shadow runtime pause/resume toggle.** Symmetric with sync's `sync.paused` (FR41). Shadow currently has config-only `gitEnabled`; adding runtime toggle would unify the pattern. Low priority unless observed user need.

### Explored
- **Per-file offline drift detection.** Direct file edits offline handled by `onLoadDocument()` from disk. Per-file hash persistence would create asymmetry. Not needed unless user research surfaces gaps.
  - Trigger: users report "I edited in VSCode offline and can't tell what changed."
- **Parent-path trust (VSCode-style longest-prefix).** Trust `~/Projects/` to cover subfolders. Architecture supports; per-dir is simpler for v1.
  - Trigger: many-repo users find per-dir prompts annoying.
- **Squash auto-commit history before push (F8).** Research-explored. Complexity + reversibility risk. Accept commit noise for v1 (Obsidian-Git precedent).
  - Trigger: user complaints about git log noise on origin.

### Identified
- **Cloned-repo git-log ingestion ("File History").** Display pre-import git history alongside shadow timeline. Separate semantics (attribution, performance on large repos).
  - Trigger: migration users asking "where's my pre-import history?"
- **GitHub Enterprise Device Flow.** Requires admin-side OAuth App per-instance. Admin-onboarding guide.
  - Trigger: enterprise customer demand.
- **Branch-picker UI + branch create/switch from editor.** Architecture ready (reconciledBase branch scope switch works); UI deferred.
  - Trigger: users frequently work across branches from editor.
- **PR creation / review from editor.** Requires GitHub API integration (Device Flow auth carries forward).
  - Trigger: users editing + wanting to contribute back via PR flow.
- **Interactive rebase / stash UI.**
  - Trigger: non-dev users needing operations that CLI covers today for developers.
- **Git log graph / blame / file history UI (per-doc).**
  - Trigger: users needing deeper history navigation.
- **Multi-project registry.** `~/.open-knowledge/projects.json` auto-populated on clone/start. Enables "recent projects" UI.
  - Trigger: users cloning multiple repos and wanting to switch.
- **Write-access detection at clone time.** After authenticated clone, `GET /repos/{owner}/{repo}` check `permissions.push`. Hint if read-only: "You won't be able to publish changes back unless you fork or get write access."
  - Trigger: first bug report about "edited a repo I couldn't push to."
- **Contribute Device Flow support to `vercel-labs/emulate`.** Our test suite adopts emulate for GitHub REST; emulate currently lacks Device Flow. Small upstream PR (~150 LOC) makes emulate canonical for every CLI. Benefits: simpler test suite + ecosystem win.
  - Trigger: post-merge, after local Device Flow mock validated.
- **Nightly real-github Device Flow E2E (via `/qa` + `/browser`).** Playwright-driven bot account testing real `github.com/login/device`. Deferred pending cost amortization (push-to-GitHub, emulate contribution).
  - Trigger: push-to-GitHub feature landing, emulate Device-Flow contribution, or OAuth App suspension incident.
- **OSS git-sync research pass.** Source-level deep dives on Obsidian-Git credential flow, Logseq git-auto, GCM, `hickford/git-credential-oauth`, `@codemirror/merge mergeControls` behavior, Foam/Dendron if applicable. Resolves Q-M1 + Q-M2.
  - Trigger: before locking FR27 + FR19 implementation.

### Noted
- **Auto-merge strategy config (FR40):** `sync.mergeStrategy: merge | rebase`. v1 uses merge.
- **Manual sync pause/resume toggle (FR41).** For quiet work sessions.
- **LFS handling UX (NG12).** Large files + media.
- **Multi-account switching UI (NG13).** Per-repo identity.
- **Force-push-with-lease opt-in (NG2).** Developers can opt per-repo; never automatic.
- **"Watching" remote for real-time updates (NG15).** Webhook or long-poll. v1 uses interval.
- **GitLab / Bitbucket browse picker (NG7).** URL paste already works; host-specific browse is additive.
- **Bundled git binary (NG16, dugite-style).** Only if Windows non-dev adoption creates demand.
- **`isomorphic-git` fallback for no-git-on-PATH.** Narrow HTTPS-only fallback.
- **Project-identity-as-UUID migration.** PR #138's lifecycle-edge-cases report proposes replacing realpath-keyed identity with UUID. Relevant if future features introduce user-preferences keyed by project path (e.g., sync-disabled-for-this-repo preferences, future re-introduction of trust gate, etc.).
- **CLI `--dry-run` flag for sync/push/pull (Q-M6).** Show what would be committed/pushed without acting.
- **AI-generated commit messages for auto-commit + Save Version.** Research shows table-stakes in commercial editors. Deferred pending cost + model dependency evaluation.

---

## 15) Agent constraints

- **SCOPE:**
  - CLI: `packages/cli/src/commands/clone.ts` (new), `packages/cli/src/commands/sync.ts` (new), `packages/cli/src/commands/push.ts` (new), `packages/cli/src/commands/pull.ts` (new), `packages/cli/src/commands/auth/` (new dir: `login.ts`, `status.ts`, `repos.ts`, `signout.ts`, `pat.ts`, `git-credential.ts`), `packages/cli/src/cli.ts` (register new subcommands), `packages/cli/src/config/schema.ts` (add `github.oauthAppClientId` + `sync.*` section)
  - CLI helpers: `packages/cli/src/github/` (new: `url.ts`, `app-config.ts`, `octokit.ts`, `list-repos.ts`), `packages/cli/src/auth/` (new: `gh-detect.ts`, `device-flow.ts`, `pat.ts`, `token-store.ts`, `resolve-auth.ts`, `credential-helper.ts` — for `auth git-credential`)
  - Server: `packages/server/src/standalone.ts` (HEAD-drift check; SyncEngine integration), `packages/server/src/sync-engine.ts` (new — state machine, fetch/pull/push, error classification), `packages/server/src/sync-endpoints.ts` (new HTTP endpoints), `packages/server/src/git-handle.ts` (new — unified `GitHandle` type + `createGitInstance` factory), `packages/server/src/git-identity.ts` (new — identity resolution chain per FR20a), `packages/server/src/persistence.ts` (modify: dual-write in `commitToWipRef()`), `packages/server/src/api-extension.ts` (`/api/local-op/*` relays + `/api/sync/*` endpoints), `packages/server/src/cc1-broadcast.ts` (add `sync-status` channel)
  - Editor: `packages/app/src/components/ProjectPicker.tsx` (new — extends PR #127's empty state), `packages/app/src/components/CloneDialog.tsx` (new), `packages/app/src/components/AuthModal.tsx` (new — with identity-prompt variant for FR20a), `packages/app/src/components/SyncStatusBadge.tsx` (new), `packages/app/src/components/ConflictBanner.tsx` (new), `packages/app/src/components/ConflictResolver.tsx` (new), `packages/app/src/components/DiffView.tsx` (modify: add `conflictMode` prop + `mergeControls` integration), `packages/app/src/components/EditorHeader.tsx` (modify: add SyncStatusBadge; demote Save Version to overflow), `packages/app/src/App.tsx` (mount ConflictBanner), `packages/app/src/hooks/use-sync-status.ts` (new — CC1 subscription)
  - Reference existing component (do NOT reimplement): `packages/app/src/components/NewItemDialog.tsx` (PR #127)

- **EXCLUDE:**
  - `packages/core/` — no markdown/CRDT changes
  - `packages/server/src/shadow-repo.ts` — only additive: new `commitWip` invocations against parent `GitHandle`. Do NOT modify existing `commitWip`, `saveVersion`, `parkBranch` internals beyond extracting the `ref` parameter if needed. Preserve shadow behavior exactly.
  - `packages/server/src/reconciliation.ts` — no logic changes
  - `packages/server/src/file-watcher.ts` — no modifications to writeTracker/DiskEvent shape
  - `packages/server/src/head-watcher.ts` — no modifications
  - `packages/server/src/external-change.ts` — no modifications
  - `packages/server/src/observers.ts` — untouched
  - Markdown pipeline, observer bridges, MDX handling — untouched
  - Timeline UI, backlinks, graph, search — untouched

- **STOP_IF:**
  - Requires changes to `commitUpstreamImport()` signature
  - Requires changes to Hocuspocus extension API
  - Requires changes to Y.Doc document namespace model
  - Requires modifying user's global git config
  - Requires writing credentials to disk outside `auth.yml` fallback
  - Requires force-pushing to origin (NG2)
  - `@napi-rs/keyring` Bun smoke test fails
  - `@codemirror/merge mergeControls` proves unworkable beyond what custom render function can address (D27 — verified viable via source-level analysis; STOP_IF retained as implementation safety net)

- **ASK_FIRST:**
  - New npm dependencies beyond `@octokit/auth-oauth-device`, `@octokit/rest`, `@napi-rs/keyring`
  - Changes to existing API endpoint behavior (not just adding new ones)
  - Changes to the config loader's merge logic
  - Changes to the shadow-repo lock lifecycle
  - Changes to CC8 shutdown ordering
  - Any change that blurs the shadow-vs-parent attribution model (e.g., merging ref namespaces)

---

## 16) References

### Prior art + research
- `reports/open-from-github-onboarding-mechanics/REPORT.md` — 11-dimension clone mechanics landscape
- `reports/git-lifecycle-push-pull-merge-patterns/REPORT.md` — 873-line, 8+7 dimension post-clone UX landscape with sync-engine prior art, 5-class error taxonomy, D8 non-dev abstraction patterns
- `reports/auto-persistence-version-history-patterns/REPORT.md` — L2 shadow pipeline + Save Version precedent
- `reports/git-library-for-knowledge-platform/REPORT.md` — simple-git locked for shadow; hybrid eval
- `reports/git-directory-nesting-shadow-repo/REPORT.md` — shadow at `.git/openknowledge/` safety
- `reports/crdt-origin-laundering-prior-art/REPORT.md` — per-writer attribution rationale
- `reports/symlink-handling-file-sync-crdt/REPORT.md` — write-file-atomic + realpath
- `reports/crdt-branching-namespacing-prior-art/REPORT.md` — branch scope on Hocuspocus

### Spec evidence (this spec)
- `evidence/shadow-pipeline-reusability.md` — map of every shadow function to its parent-git equivalent
- `evidence/editor-integration-surfaces.md` — clone-precursor investigation of editor mount points
- `evidence/upstream-sync-flow.md` — clone-precursor investigation of HEAD-drift semantics

### Key source files (current state, pre-implementation)
- `packages/server/src/shadow-repo.ts` — `commitWip`, `saveVersion`, `parkBranch`, `commitUpstreamImport`, `shadowGit`
- `packages/server/src/persistence.ts` — L1/L2 pipeline, batch gating, `reconciledBase`, message at `:183`
- `packages/server/src/head-watcher.ts` — BatchBegin/BatchEnd, batch kind classification
- `packages/server/src/file-watcher.ts` — DiskEvent, writeTracker
- `packages/server/src/external-change.ts` — `applyExternalChange` bridge
- `packages/server/src/reconciliation.ts` — three-way merge
- `packages/server/src/cc1-broadcast.ts` — CC1 primitive
- `packages/server/src/standalone.ts` — `createServer` factory
- `packages/app/src/components/DiffView.tsx` — `@codemirror/merge` split/unified (Miles, PR #39)
- `packages/app/src/components/TimelinePanel.tsx`, `EditorHeader.tsx` — existing git-adjacent UI
- `packages/cli/src/commands/start.ts`, `mcp.ts`, `init.ts`, `preview.ts` — existing CLI
- `packages/cli/src/config/schema.ts` — config (no git keys today)
- `packages/core/src/shadow-repo-layout.ts` — `resolveShadowDir`, `parseWriterId`

### Related precedent specs
- `specs/2026-04-10-document-timeline-rollback/SPEC.md` — Timeline + rollback (PR #39)
- `specs/2026-04-14-file-sidebar-new-file/SPEC.md` — PR #127 NewItemDialog
- `specs/2026-04-13-observer-a-origin-aware-diff/SPEC.md` — observer-bridge origin awareness

### Pre-merge originals (archived 2026-04-15)
- `specs/_archive/2026-04-15-pre-merge/clone-from-github/` — original approved clone spec (D1–D19)
- `specs/_archive/2026-04-15-pre-merge/post-clone-git-sync/` — original sync-drafting spec (D1–D9)

---

## 17) Merge notes

This spec was created by merging two precursor specs on 2026-04-15:
- `specs/2026-04-14-clone-from-github/SPEC.md` (approved, 493 lines, 19 decisions)
- `specs/2026-04-14-post-clone-git-sync/SPEC.md` (drafting, 328 lines, 9 decisions)

**Rationale for merge:** The two specs share credential flow, auth CLI subcommand group, trust-gate interaction, subprocess relay architecture, and testing infrastructure. Neither had shipped; co-developing as one spec resolves cross-cutting decisions jointly, surfaces incoherencies as explicit open questions, and produces one coherent story for implementers.

**Fidelity preservation:**
- Both originals archived at `specs/_archive/2026-04-15-pre-merge/`
- All 19 clone-spec decisions (D1–D19) preserved with original IDs noted in the "Orig" column of §10
- All 9 sync-spec decisions preserved as D20–D28 with original IDs noted
- All 18 clone FRs + 20 sync FRs merged into unified FR1–FR41, grouped by concern
- All non-goals preserved + renumbered (NG1–NG16)
- All user journeys preserved + extended (J1–J10 + interaction state matrix)
- All evidence files copied into `evidence/`
- Open questions from both merged + new merge-driven incoherencies (Q-M1 through Q-M6)
- Future work items merged (Explored / Identified / Noted tiers preserved)

**Incoherencies flagged as open questions:**
- ~~Q-M3~~ **RESOLVED 2026-04-15:** Trust gate (D9) withdrawn entirely. Rationale refinement is moot. See §13 "Trust gate consideration (rejected)".
- ~~Q-M4~~ **RESOLVED 2026-04-15:** Trust scope wording moot. No gate exists.
- Q-M5: Clone spec's Save Version references imply primary-header placement; Sync D21 demotes to overflow. Open: coordinate with in-flight Save Version UI.
- Q-M6: Should sync-CLI commands support `--dry-run`? Open: add if user feedback requests.

**Decisions left uncertain (MEDIUM ⚠ confidence):**
- D27 (Sync-D8): `@codemirror/merge mergeControls: true` fitness pending OSS research
- D28 (Sync-D9): Token refresh strategy pending OSS research

**Pre-merge audit findings preserved:**
- Clone-precursor's `meta/audit-findings.md` (5 findings; all resolved in clone spec before merge) and `meta/design-challenge.md` (7 challenges; 6 accepted + incorporated) live in archive
- Sync-precursor's `meta/backlog.md` (79 candidates) informed the merged §11 Open Questions

**Post-merge next steps:**
1. Run /audit + /spec-challenger on merged spec (spec-workflow Step 6)
2. Dispatch OSS git-sync research pass (resolves Q-M1, Q-M2; refines D27, D28)
3. Resolve remaining merge-driven coordination item Q-M5 (Save Version UI) — Q-M3 and Q-M4 resolved via D9 withdrawal
4. Verify completeness gate (§8 of spec workflow) — every In Scope item implementable
5. Stamp final baseline commit + transition Status from "Drafting" to "Approved"
