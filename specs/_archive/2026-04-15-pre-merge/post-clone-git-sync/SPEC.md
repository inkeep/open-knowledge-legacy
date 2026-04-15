# Post-Clone Git Sync UX

**Status:** Drafting (Intake complete, iterative loop beginning)
**Baseline commit:** e59f87a
**Created:** 2026-04-14
**Primary persona:** Non-developer B2B SaaS user
**Secondary personas:** Developer; AI agent authors
**Extends:** `specs/2026-04-14-clone-from-github/SPEC.md` (approved, 19 locked decisions)

---

## 1. Problem

### Situation
Open Knowledge users can clone a GitHub repo via the Clone-from-GitHub flow (approved 2026-04-14) or open an existing git repo on disk. They edit markdown with CRDT-backed collaboration. The server auto-persists to disk (L1, 2–10s debounce) and journals attribution to a shadow git at `.git/openknowledge/` or `.openknowledge/` (L2, 30s idle debounce). Only user-facing git surface today is the Timeline panel (reads shadow history) and Save Version (creates shadow checkpoint).

### Complication
There is **zero user-facing parent-git surface**. The server READS `.git/HEAD` (HEAD watcher detects external user-driven git ops) but never WRITES. No push, pull, fetch, branch-switch, or remote visibility in UI. A non-developer who clones a repo and edits content has no way to publish changes back except (a) copy-paste into GitHub's web UI (loses CRDT attribution + shadow history), or (b) ask a developer to run git commands (bottleneck). Research across 15+ editors confirms non-dev git tools universally fail at error handling — "Could not read from remote repository" regardless of cause; no offline queue; Obsidian-Git retreats to CLI in 6 documented scenarios.

### Resolution
Extend the existing shadow-git L2 persistence pipeline to **dual-write to parent git** when a remote is detected. Add a continuous auto-sync layer modeled on Linear/Figma/Notion (background fetch/merge/push). Introduce one conflict-resolution surface for the single moment users need to make a git decision. Terminology stays human (status badge, "Changes from your team"); developers get CLI escape hatches. Architecture leverages existing infrastructure — `commitWip()`, batch gating, write tracker, reconciliation, and DiffView/`@codemirror/merge` are all reusable by passing a different `GitHandle`.

---

## 2. Personas

### P1 (Primary) — Non-developer content collaborator
B2B SaaS user. Cloned a GitHub repo via our Clone dialog OR opened a folder that happens to have `.git/` + remote. Does not know git terminology. Expects "cloud sync" semantics: their changes appear on GitHub automatically; team changes appear in their editor automatically; conflicts surface as a clear "choose a version" dialog. Should never need to know what "push," "pull," "merge," "rebase," or "HEAD" means.

### P2 (Secondary) — Developer
Comfortable with git. Uses OK for content-editing UX but can drop to CLI for advanced operations (interactive rebase, stash management, complex merges). Wants auto-sync to be invisible for normal flow, transparent enough to trust (visible CLI commands available, git log inspectable), and the server to NEVER silently force-push or rewrite history.

### P3 — AI agent authors
Agents write content via MCP/agent-write endpoints. Agent-authored commits must reach origin like human commits. The trust gate (`didAutoInit`, locked in clone spec FR9) blocks agent writes on untrusted repos — this spec respects that gate (agent writes are silently allowed only after user trusts the project).

---

## 3. Goals & non-goals

### Goals
- G1: Non-dev users can collaborate with teammates via git without ever typing a git command.
- G2: Developers' existing git workflows remain unaffected (external CLI ops continue to work; HEAD watcher handles reconciliation).
- G3: Agent-authored content reaches origin when agents work on trusted projects.
- G4: Failure modes (network, auth, conflict) surface with human-readable messaging and clear recovery actions.
- G5: Architecture is forward-compatible with future branch-picker, PR workflow, multi-account UX without requiring substrate rewrites.

### Non-goals (strict)
- NG1 [NEVER]: Force-push by default. Never. Developers can opt in per-repo; never automatic.
- NG2 [NOT NOW]: Branch management UI (create/delete/switch via UI). v1 is main-branch-only. Users switch branches via CLI; HEAD watcher handles reconciliation (already works).
- NG3 [NOT NOW]: PR creation / review workflows from the editor.
- NG4 [NOT NOW]: Interactive rebase, stash management, cherry-pick UI.
- NG5 [NOT NOW]: Git log graph view / blame / file history UI (separate feature).
- NG6 [NOT NOW]: Non-GitHub forge browse pickers (URL paste works for any host; clone spec FR5).
- NG7 [NOT UNLESS]: Bundled git binary. Requires git on PATH (same as clone spec).

---

## 4. User journeys

### P1 — Non-dev happy path (no conflicts)
1. User opens editor on a project with `.git/` + remote (cloned or pre-existing).
2. Status badge in header: initial fetch runs, shows "Synced."
3. User edits pages for 10 min.
4. L1 auto-saves to disk → persistence L2 triggers dual-write: shadow WIP commit + parent-git commit ("Updated architecture.md").
5. 2 min later: background sync pushes to origin. Badge briefly shows "Syncing..." → "Synced."
6. Teammate pushes changes to origin.
7. Next auto-fetch cycle: detects behind → auto-merges (reconciledBase absorbs changes) → user sees new content appear.
8. Badge: "Synced" throughout. User never clicked anything.

### P1 — Non-dev conflict path
1. User edits "onboarding.md" locally.
2. Teammate pushes conflicting edit to same file.
3. Auto-sync detects behind → tries merge → conflict markers produced on disk for `onboarding.md`.
4. Sync pauses. Badge turns orange "Conflict."
5. Project-level banner appears: "1 page has conflicting changes from your team. [Review and resolve]"
6. User clicks [Review and resolve] → Conflict resolver panel lists affected files.
7. Per file: [Keep my version] / [Keep team's version] / [View changes].
8. [View changes] opens DiffView with 3-way `@codemirror/merge mergeControls` — per-hunk accept/reject.
9. User resolves → sync resumes → auto-pushes resolution to origin.

### P2 — Developer flow
1. Developer opens their existing repo in OK editor.
2. Auto-sync activates (remote detected). Runs invisibly.
3. Developer does interactive rebase in terminal. HEAD watcher detects → reconciliation → editor state stays coherent.
4. Developer uses `open-knowledge sync` CLI in scripts / CI.
5. Force-push from developer is manual via CLI; never automatic.

### P5 — Offline
1. Network drops while user is editing.
2. L1 auto-save continues (disk-local). Shadow commits continue (disk-local).
3. Next auto-fetch fails → network-error classification → 3 retries with backoff → persistent failure.
4. Badge: grey "Offline — changes saved locally."
5. Network restored → next cycle succeeds → queued commits pushed → badge: "Synced."

### P6 — Auth expiry
1. GitHub token revoked externally (org policy, user regenerated token).
2. Next push fails with 401 → auth-error classification.
3. Sync pauses. Badge: red "Sign in again."
4. Toast appears: "Couldn't sync with GitHub — please sign in again. [Sign in]"
5. [Sign in] opens AuthModal (from clone spec — Device Flow).
6. After re-auth: sync resumes, pushes queued commits.

---

## 5. Key design insight

**The shadow git L2 pipeline is the sync pipeline.** Parent-git sync is not a separate system — it's the existing persistence pipeline dual-writing to a second `GitHandle`. This reframing collapses what would otherwise be parallel infrastructure into a config toggle + a thin remote-operations layer.

**Reusable verbatim (just pass a different GitHandle):**
- `commitWip(git, writer, contentRoot, message, branch)` — works identically against parent git via `GIT_DIR`/`GIT_WORK_TREE` env vars
- `saveVersion(git, contentRoot, writers, branch)` — same plumbing, different target
- `parkBranch`, `readParkedState`, `commitUpstreamImport` — all parameterized by `GitHandle`
- Batch gating (`isBatchInProgress`) — storage-agnostic
- Write tracker (self-write feedback prevention) — path-based, not git-specific
- External change handler + reconciliation — CRDT-only, git-agnostic
- Timeline history query (`getDocumentHistory`) — accepts any `ShadowHandle`-shaped input

**Net-new (additive layer, does not modify shadow behavior):**
- Remote operations: `push`, `fetch`, `merge` via simple-git
- Remote detection on startup (`git remote -v`)
- Credential injection via `GIT_ASKPASS` reading `@napi-rs/keyring`
- Sync engine state machine (synced/syncing/conflict/offline/auth-error)
- CC1 `sync-status` broadcast channel
- UI: status badge, conflict banner, conflict resolver panel
- CLI: `open-knowledge sync|push|pull` (discover running server via lock)
- Config: `sync.*` section
- Error classification (5-class taxonomy)

See `evidence/shadow-pipeline-reusability.md` for the detailed reuse map.

---

## 6. Scope hypothesis

### In Scope (P0)
- Sync engine in server: remote detection, fetch/merge/push lifecycle, state machine, error classification
- Dual-write on L2 persistence (shadow + parent git, same commit content, separate refs)
- Save Version enhancement: also creates a parent-git named commit (tagged `ok/v<N>`)
- `GIT_ASKPASS` credential injection from keyring (clone-time storage)
- Sync status badge component (header)
- Conflict banner + resolver panel (project-level)
- DiffView extension to 3-way with `mergeControls`
- CC1 `sync-status` broadcast channel
- Config schema: `sync.*`
- CLI commands: `sync`, `push`, `pull` (server-discovery via lock)
- Server endpoints: `GET /api/sync/status`, `POST /api/sync/trigger`, `GET /api/sync/conflicts`, `POST /api/sync/resolve-conflict`

### Out of Scope (P2 → Future Work)
- Branch-picker UI, branch creation from editor
- PR creation / review
- Interactive rebase, stash management
- Git log graph / blame / file history UI
- LFS handling UX
- Non-GitHub forge browse pickers
- Multi-account switching UI
- Automatic force-push-with-lease (requires user opt-in)
- Squash / rewrite auto-commit history before push
- "Watching" remote for real-time updates (v1 is interval-poll fetch)

---

## 7. Functional requirements (draft — refined during iteration)

| ID | Priority | Requirement |
|----|----------|-------------|
| FR1 | Must | On server startup: detect remote via `git remote -v`. If no remote exists OR `sync.enabled=false`, sync engine stays dormant; UI shows no sync badge. |
| FR2 | Must | On L2 persistence commit (after 30s debounce): commit to shadow `refs/wip/<branch>/<writer-id>` AND commit to parent git on the current branch (using same `commitWip` code with different `GitHandle`). |
| FR3 | Must | Background fetch every `sync.intervalSeconds` (default 120s). If behind origin AND no unresolved conflicts: merge origin/<branch> into local branch. |
| FR4 | Must | If ahead of origin: push to origin/<branch> after each L2 commit AND after each successful merge. |
| FR5 | Must | If push rejected (non-fast-forward): pause auto-push, trigger fetch, surface toast; do NOT force-push. |
| FR6 | Must | If merge produces conflict markers: pause sync; show conflict banner; when user resolves → resume sync. |
| FR7 | Must | Save Version creates: (a) shadow checkpoint (existing behavior), (b) parent-git named commit (new — user-provided message or auto-generated), (c) parent-git lightweight tag `ok/v<N>`. Affordance demoted from primary header button to overflow menu (per D2). |
| FR7a | Must | Protected-branch detection: when auto-push receives 403/rejected due to branch protection, disable sync for this repo (`sync.enabled=false` persisted to workspace config), emit toast with guidance, show "Sync disabled" state in badge (per D3). |
| FR8 | Must | Credential injection via `GIT_ASKPASS` helper binary/script reading from `@napi-rs/keyring` keyed by hostname. Never store credentials in git config. |
| FR9 | Must | Sync status badge in editor header: `synced` (green) / `syncing` (spinner) / `ahead N` / `behind N` / `conflict` / `offline` / `auth-error`. Click → details popover. |
| FR10 | Must | Conflict resolver: per-file [Keep mine] [Keep theirs] [View changes]. "View changes" opens 3-way `@codemirror/merge` with per-hunk accept/reject. |
| FR11 | Must | Error classification (5-class taxonomy — network/auth/semantic/structural/local). Network: auto-retry 3x with exponential backoff. Auth: re-auth toast. Semantic: pause + user action. Structural: guidance toast. Local: cleanup + retry. |
| FR12 | Must | CC1 `sync-status` channel: emit on every state transition. Clients subscribe via `ProviderPool.__system__`. |
| FR13 | Must | CLI `open-knowledge sync|push|pull` discover running server via `server.lock`, call HTTP endpoints, display JSONL progress + final status. |
| FR14 | Must | Config keys: `sync.enabled` (auto-detect from remote), `sync.intervalSeconds` (default 120), `sync.autoCommit` (default true), `sync.autoPush` (default true), `sync.autoPull` (default true), `sync.commitMessage` (default "auto"). |
| FR15 | Should | Ahead/behind counts shown in status badge popover. |
| FR16 | Should | "Changes from team" indicator when fetch finds remote commits before pulling. |
| FR17 | Should | Conflict resolver indicates number of pending conflicts in badge. |
| FR18 | Should | AuthModal from clone spec reused for re-auth flow. |
| FR19 | Could | Auto-merge strategy config (`sync.mergeStrategy: merge | rebase`, default `merge`). |
| FR20 | Could | Background sync pause/resume toggle (for users who want manual control). |

---

## 8. Current state

From `evidence/shadow-pipeline-reusability.md` (harvested from worldmodel run this session):

- `createServer()` wires: shadow repo init, HEAD watcher, file watcher, persistence extension (L1+L2), reconciliation loop, shadow GC
- L1: `onStoreDocument` (persistence.ts) serializes Y.Doc → markdown → atomic disk write with `writeTracker.register(hash)` for self-write feedback prevention
- L2: `scheduleGitCommit()` debounces 30s → `commitToWipRef()` → `commitWip(shadow, writer, contentRoot, message, branch)` writes to `refs/wip/<branch>/<writer-id>`
- `commitWip` uses isolated `GIT_INDEX_FILE` (separate from project staging area), plumbing commands: `hash-object`, `read-tree`, `add`, `write-tree`, `commit-tree`, `update-ref`
- Batch gating (`isBatchInProgress`) blocks L1/L2 during HEAD watcher coordinated operations; unblocks on BatchEnd
- HEAD watcher detects external git ops (pull, merge, rebase, checkout) via `@parcel/watcher` on `.git/HEAD` with 100ms quiet window; classifies `within-branch`/`cross-branch`/`detached-head`
- `commitUpstreamImport` on within-branch HEAD moves with file changes — records external commits
- `saveVersion` creates `refs/checkpoints/<branch>/<sha>` in shadow with all WIP refs as parents; resets per-writer WIP refs after
- Reconciliation: three-way merge with `reconciledBase` as merge base; outcomes `noop|clean|merged|conflicts|refused`
- Timeline UI reads `GET /api/history?docName` (shadow-scoped); Save Version button in EditorHeader; no other user-facing git surface
- Existing DiffView.tsx uses `@codemirror/merge` in split/unified read-only mode for timeline preview
- simple-git already the shadow's git library; `shadowGit(shadow)` factory creates isolated simple-git instance per-operation
- Server lock at `<contentDir>/.open-knowledge/server.lock` — one server per contentDir
- CC1 broadcast primitive at `__system__` Y.Doc — channels `files`, `backlinks`, `graph` exist today; ready for `sync-status`
- Sonner toast system initialized at main.tsx
- No config keys exist for git behavior today

---

## 9. Target state

- **Dual-write L2:** `commitToWipRef()` writes to both `shadowRef.current` AND `parentGitRef.current` when remote detected. Same commit content, separate refs, same plumbing.
- **SyncEngine:** new subsystem wired into `createServer()` after shadow init and HEAD watcher. State machine: `dormant` (no remote) → `synced` → `syncing` → `conflict` → `auth-error` → `offline`. Interval-driven fetch/merge/push. Emits CC1 `sync-status`.
- **GIT_ASKPASS helper:** small binary (or node script invoked via shebang) reads keyring by hostname + outputs token. Set on every simple-git operation against parent git.
- **Conflict storage:** when sync pauses on conflict, conflict state persisted to `<contentDir>/.open-knowledge/conflicts.json` (survives restarts). Resolution clears entry.
- **UI:** `SyncStatusBadge.tsx` in `EditorHeader` (primary); `ConflictBanner.tsx` mounted in `App.tsx` above SidebarProvider (visible when conflicts pending); `ConflictResolver.tsx` as right-side sheet (consistent with TimelinePanel); extended `DiffView.tsx` accepting `conflictMode` prop. Save Version button demoted to overflow menu (per D2).
- **CLI:** `sync.ts`, `push.ts`, `pull.ts` commands alongside existing `start`, `init`, `mcp`.
- **Config:** `sync` section in `schema.ts`.
- **Save Version:** dialog prompts user for optional commit message (default: auto-generated from changed files). Creates dual commit (shadow + parent) + `ok/v<N>` tag.
- **Trust gate interaction:** when `trustPending === true` (from clone spec FR9), SyncEngine stays `dormant`. Auto-sync activates only when trust resolves.

---

## 10. Decision log

| ID | Decision | Rationale | Reversibility | Status | Confidence |
|----|----------|-----------|---------------|--------|-----------|
| D1 | **Auto-sync aggressiveness = aggressive but batched.** Auto-commit on L2 flush (30s idle, same cadence as existing shadow L2). Auto-push on fetch-interval (120s default) — batches multiple commits into fewer push events. Auto-pull on fetch-interval when behind + no local conflicts. | Matches Nick's "smart and just doing things" intent without spamming origin with commit-per-30s pushes. Cadence intentionally mirrors shadow L2 so parent and shadow advance together on the same trigger — dual-write is one event, not two. | Reversible (cadence is a config value `sync.intervalSeconds`) | LOCKED | HIGH |
| D2 | **Save Version is the secondary UX, behind a menu rather than a primary button.** Auto-sync is the primary flow. Save Version still creates a named parent commit + `ok/v<N>` tag + shadow checkpoint, but the UI affordance is demoted from primary header button to a menu item (e.g., ⋯ overflow or File menu entry). | Auto-sync handles the continuous flow; Save Version is for intentional milestone moments only. Primary UI real estate goes to sync status. | Reversible (UI placement is easy to change) | LOCKED | HIGH |
| D3 | **Protected branches: sync disabled for that repo. Happy path only.** If auto-push fails because the branch is protected (403/rejected), show a toast ("Can't sync to `<branch>` — it's protected. Sync disabled for this project."), set `sync.enabled=false` for this repo, let user/developer handle via CLI. No alternative workflows (no auto-create user branches, no PR creation). | Nick scope: "only support happy path: auto sync with origin main on or off. nothing in between or affordances for other workflows." Tightly scoped. | Reversible (can add workflows later as Future Work) | LOCKED | HIGH |
| D4 | **Conflict resolver form factor = side sheet.** Slides in from right, editor visible. Consistent with Timeline panel pattern. Closeable; conflict banner persists until all files resolved. | Non-blocking, scales to many conflicts, matches existing pattern. | Reversible | LOCKED | HIGH |
| D5 | **Auto-sync is NOT gated by clone spec's trust gate in v1.** Sync applies to any git repo with remote. Trust gate (clone spec D9) is scoped to agent writes only. | See trust-gate explanation in §13 — agent-write trust gate protects against malicious config instructing agents; auto-sync only pushes user-authored edits to the repo's own origin, which is lower-risk. Revisit if a concrete threat model emerges. | Reversible (can add gate in a future iteration without breaking anything) | LOCKED | MEDIUM |
| D6 | **Auto-commit message matches shadow verbatim:** `"WIP auto-save ${new Date().toISOString()}"`. Same generation code; parent uses the same string as shadow. Save Version commits use a separate user-provided or auto-generated meaningful message. | Investigation confirmed shadow L2 uses `WIP auto-save ${ISO timestamp}` at `persistence.ts:183`. Nick's "least minimum divergence" directive — match exactly. Obsidian-Git makes the same trade-off of timestamp-noisy history. | Reversible (message generation is pure function) | LOCKED | HIGH |
| D7 | **Dual-write at L2: shadow-first, parent-second, parent-retry on failure.** Same L2 flush event computes one tree hash, creates two commit objects, updates two refs. Trivial overhead. Shadow stays authoritative local journal; parent catches up on next cycle if its commit fails. | Write-only-to-parent path would break shadow's per-writer attribution (HEAD watcher would attribute everything to `UPSTREAM_WRITER`). Dual-write IS the minimum-divergence path; same plumbing code, two targets. | Reversible | LOCKED | HIGH |
| D8 | **Conflict resolver: side sheet + per-file actions + DiffView extension.** Side sheet (per D4) lists conflicted files. Per file: `[Keep my version]` (runs `git checkout --ours`), `[Keep team's version]` (runs `git checkout --theirs`), `[Resolve manually]` (opens DiffView with `conflictMode` + `@codemirror/merge mergeControls: true` for per-hunk accept/reject). Never exposes raw `<<<<<<<` markers to non-dev users. | Miles confirmed not building interactive merge UI (DiffView in PR #39 is read-only). Extending existing DiffView with `mergeControls` reuses `@codemirror/merge` infrastructure. Contrasts with Obsidian-Git's "edit raw markers in Source mode" approach which fails for non-devs. | Reversible | LOCKED (approach) | MEDIUM ⚠ |
| D9 | **Credential flow via `open-knowledge auth git-credential` subcommand.** New CLI subcommand implements git's credential-helper protocol: reads stdin (key=value), extracts host, reads `@napi-rs/keyring` (clone-time storage), outputs `username=X\npassword=Y`. Every simple-git invocation passes `-c credential.helper='!open-knowledge auth git-credential'`. Works for clone, push, pull, fetch. | Matches clone spec Tier A's existing pattern (`credential.helper='!gh auth git-credential'`). Resolves clone spec's silent gap on Tier B/C credential handoff to simple-git. No GIT_ASKPASS helper binary needed. No global git config modification. One CLI subcommand extends the `auth` group. | Reversible | LOCKED (approach) | MEDIUM ⚠ |

### Decision uncertainty flags (INVESTIGATE)

| Decision | Dimension uncertain | Why | Research trigger |
|----------|--------------------|-----|------------------|
| **D8** | `@codemirror/merge mergeControls: true` fitness | Have not source-verified the out-of-box UX of the Accept/Reject controls. Could be stock-ugly or customizable; could or could not support our conflict-resolution flow (staged file state) | Upcoming OSS git-sync research pass (Direction 2) |
| **D9** | Token refresh strategy | GitHub OAuth tokens don't expire (no refresh needed for primary host), but GitLab/Bitbucket tokens do. GCM's `password_expiry_utc` + `oauth_refresh_token` (git 2.40+) pattern exists but not verified for our implementation. `hickford/git-credential-oauth` has a full implementation in Go to reference | Upcoming OSS git-sync research pass (Direction 1) |

---

## 11. Open questions (expanded in Step 4)

_(Populated in Step 4.)_

---

## 12. Assumptions

_(Populated during iteration.)_

---

## 13. Risks & unknowns

### Trust gate relationship (context for D5)
The clone spec (D9) introduces a trust gate: cloned repos are `trustPending` until user reviews the config; during this state, agent-write endpoints return `403 FORBIDDEN_UNTRUSTED`. The mechanism is a runtime `didAutoInit` boolean (unforgeable by disk content) + `trust.yml` persistence.

**This gate is not implemented yet** — clone spec is approved but not decomposed/built. It's a locked decision in the future clone feature.

**Why sync does NOT gate on trust in v1:**
- The trust gate protects against a specific threat: a malicious repo config instructing an agent to write harmful content. It lives on agent-write endpoints because those are the attack surface.
- Auto-sync pushes user-authored edits to the repo's own origin (the remote the user cloned from or configured). It does not expose any new attack surface — the user already committed to the provenance of the repo by opening it.
- Malicious config could try to manipulate `sync.*` keys, but NG1 (never force-push) neutralizes the main abuse vector, and the remote URL is immutable from our side (we push to whatever origin the repo has).

**Future revisit triggers:**
- If a concrete threat model emerges where sync amplifies risk (e.g., agent writes + auto-push combo)
- If clone spec's trust gate lands and users request a unified "trust before anything happens" posture

### Known risks
- R1 [Medium]: Auto-commits produce frequent commits on origin ("Updated X" every ~30s when user edits continuously). Team members see noise. Mitigation: batching via 120s push interval reduces push events but not commit count. Accept for v1 per research (Obsidian-Git accepted this); revisit if complaints surface (see F8 Future Work).
- R2 [Medium]: Dual-write partial failure (shadow commits succeed, parent fails or vice versa) could cause divergence. Mitigation: decision D7 below will define recovery strategy.
- R3 [Low]: `GIT_ASKPASS` helper fails silently if keychain is locked → push fails with opaque git error. Mitigation: error classification path surfaces clear toast.
- R4 [Medium]: Force-pushed remote breaks auto-pull (non-fast-forward). Requires manual recovery via CLI. Mitigation: detect and surface as specific error class; do not auto-force-pull.
- R5 [Low]: Simultaneous same-branch edits from multiple local OK servers produce push races. Mitigation: server detects rejection → pull/merge/retry → at most one conflict dialog.

---

## 14. Future work

- F1 [Identified]: Branch-picker UI + branch create/switch from editor. Architecture ready (reconciledBase branch scope switch works); UI design deferred.
- F2 [Identified]: PR creation / review from editor. Requires GitHub API integration (clone spec's Device Flow auth carries forward).
- F3 [Identified]: Interactive rebase / stash UI.
- F4 [Identified]: Git log graph / blame / file history UI (per-doc).
- F5 [Noted]: LFS support for large files and media.
- F6 [Noted]: Multi-account switching UI (per-repo identity).
- F7 [Noted]: Force-push-with-lease opt-in.
- F8 [Explored]: Squash auto-commit history before push. Explored in research; decided against for v1 (adds complexity, reversibility risk). Future consideration if git history noise becomes a user complaint.
- F9 [Noted]: "Watching" remote for real-time updates (webhook or long-poll) — v1 uses interval fetch.

---

## 15. Agent Constraints

_(Populated in Step 8 after decisions finalize.)_

---

## 16. References

- Parent spec: `specs/2026-04-14-clone-from-github/SPEC.md`
- Research: `reports/git-lifecycle-push-pull-merge-patterns/REPORT.md` (873 lines, 8+7 dimensions, 14 evidence files, sync-engine prior art section)
- Research: `reports/open-from-github-onboarding-mechanics/REPORT.md`
- Research: `reports/auto-persistence-version-history-patterns/REPORT.md`
- Research: `reports/git-library-for-knowledge-platform/REPORT.md`
- Research: `reports/crdt-origin-laundering-prior-art/REPORT.md`
- Worldmodel (this session): referenced inline; canonical state in `evidence/shadow-pipeline-reusability.md`
- Key source files (current state):
  - `packages/server/src/shadow-repo.ts` (commitWip, saveVersion, parkBranch, commitUpstreamImport)
  - `packages/server/src/persistence.ts` (L1/L2 pipeline, batch gating, reconciledBase)
  - `packages/server/src/head-watcher.ts` (BatchBegin/BatchEnd, batch kind classification)
  - `packages/server/src/file-watcher.ts` (DiskEvent, writeTracker)
  - `packages/server/src/external-change.ts` (applyExternalChange bridge)
  - `packages/server/src/reconciliation.ts` (three-way merge)
  - `packages/server/src/cc1-broadcast.ts` (pure-signal broadcast primitive)
  - `packages/server/src/standalone.ts` (createServer factory)
  - `packages/app/src/components/DiffView.tsx` (@codemirror/merge split/unified)
  - `packages/app/src/components/TimelinePanel.tsx`, `EditorHeader.tsx`
  - `packages/cli/src/commands/start.ts`, `mcp.ts`, `init.ts`
  - `packages/cli/src/config/schema.ts`
