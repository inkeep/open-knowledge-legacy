# Shadow-repo single mode — Spec

**Status:** Draft
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-21
**Baseline commit:** 54c97051
**Links:**

- Evidence: [./evidence/](./evidence/)
- Adjacent prior art: [[specs/2026-04-13-cli-init-clarity/SPEC]] (auto-init of `.open-knowledge/` config; this spec adds auto-`git init` of parent repo)
- Adjacent prior art: [[specs/2026-04-07-init-spike/SPEC]] (original init decisions)
- Modifies (partially supersedes): D22 in [[PRECEDENTS]] / shadow-repo-layout — `resolveShadowDir` contract simplifies

---

## 1) Problem statement

**Situation.** Open Knowledge's shadow repo (attribution journal for per-writer WIP refs, upstream imports, checkpoints, rescue buffers, timeline, rollback) ships in two modes. `resolveShadowDir(projectRoot)` at `packages/core/src/shadow-repo-layout.ts:72-83` branches on `statSync('<projectRoot>/.git').isDirectory()`:

- **Integrated mode:** shadow lives at `<projectRoot>/.git/open-knowledge/`
- **Standalone mode:** shadow lives at `<projectRoot>/.openknowledge/` (added to `.gitignore` at init time)

**Complication.** Standalone mode has semantically distinct behavior from integrated mode — there is no parent `.git/HEAD` for the HEAD watcher to observe, no real project branch for the `refs/wip/<branch>/<writer-id>` namespace, and no `git pull` → `commitUpstreamImport` path. Every shadow-repo-touching change needs verification in both modes, and the two modes' semantics drift over time (branch scoping, reconciliation, save-version parentage, HEAD-watcher batch kinds). This costs test matrix, code branches in `initShadowRepo`, gitignore special-casing, and doc burden — with no user-facing payoff in the common case (most users run OK inside git repos, and the rest can tolerate an auto-init).

**Resolution.** Collapse to a single mode. The shadow repo always lives at `<projectRoot>/.git/open-knowledge/` (renamed from today's `.git/openknowledge/` for naming consistency with the `.open-knowledge/` config dir — see D14). If `<projectRoot>/.git/` does not exist when the server starts, OK auto-`git init`s the parent repo (default branch `main`) before initializing the shadow. Existing `.git/openknowledge/` directories are silently renamed on first run (D14 / R9). This deletes the standalone code path, unifies HEAD-watcher / branch / upstream-import semantics, and keeps the shadow hidden inside `.git/` (not user-visible).

## 2) Goals

- **G1:** Eliminate the standalone shadow-repo code path — `ShadowRepoMode` type, mode-conditional branches, `.gitignore` auto-mutation — with no remaining references in runtime code.
- **G2:** Preserve the existing behavior for projects that already have `.git/` (zero observable change).
- **G3:** Make OK work in a fresh directory with no `.git/` by auto-initializing a regular git repo on first `ok start` / `ok init`, with prominent disclosure in the first-run preview block.
- **G4:** Simplify `resolveShadowDir`'s contract so callers no longer destructure `{ path, mode }` — function returns a single path.
- **G5:** Rename the integrated shadow subdirectory from `openknowledge/` to `open-knowledge/` for naming consistency with the `.open-knowledge/` config directory. Silent, lossless migration for existing users.

## 3) Non-goals

- **\[NOT NOW] NG1:** Migrating data from existing `.openknowledge/` (standalone) directories into the new `.git/open-knowledge/` location. Reason: this project is pre-production; users with a legacy standalone dir can accept that their prior attribution history is orphaned. Revisit if: any external user reports lost data from a production project.
- **\[NEVER] NG2:** Relocating the shadow repo out of `.git/open-knowledge/` (e.g., into `.open-knowledge/shadow/`). Reason: `.git/open-knowledge/` is hidden, keeps the shadow bare-git internals out of user-visible `ls` output, and preserves today's install footprint. The user explicitly retracted this option during intake.
- **\[NOT NOW] NG3:** Prompting or --flag-gating the auto-`git init` behavior. Reason: matches the non-interactive stance of the rest of the CLI and Desktop's Navigator flow. Revisit if: a user reports surprise from the silent git-init in a published incident.
- **\[NEVER] NG4:** Auto-deleting legacy `.openknowledge/` directories. Reason: OK should not mutate user filesystem state beyond its own namespace.
- **\[NEVER] NG5:** Detecting or warning about legacy `.openknowledge/` directories. Reason: carrying a detection code path solely to surface a one-line warning is more legacy code than it eliminates; the whole point of this spec is to delete the standalone code path, not refactor it. Silent orphan wins.
- **\[NOT NOW] NG6:** Any worktree-specific handling (detection, path resolution, refuse-to-boot message, resolver rewrite). Worktree correctness is owned by a separate spec. This spec deliberately does not touch any worktree code path; implementer should not introduce worktree-awareness even if they notice it while working.
- **\[NEVER] NG7:** macOS system notifications (Electron's `Notification` API). Reason: forks the Desktop notification system that already uses sonner toasts for every other user-facing event; adds permission-prompt surface + DND-invisibility failure modes. User directive: "keep using our existing notification toast system." Revisit only if: the toast system is retired and a Desktop-wide notification strategy explicitly adopts `Notification`.

## 4) Personas / consumers

- **P1: CLI user (existing git repo).** Already has `.git/`. Runs `open-knowledge start`. Today: integrated mode. After this spec: unchanged. This is the common case; the bar is "zero observable change."
- **P2: CLI user (no git repo yet).** Starts OK in a fresh notes directory. Today: OK creates `.openknowledge/` and adds it to `.gitignore` (which doesn't exist). After this spec: OK runs `git init`, then initializes shadow at `.git/open-knowledge/` and scaffolds `.open-knowledge/config.yml`. Preview block discloses the git-init.
- **P3: CLI user (legacy `.openknowledge/` from older OK).** Has a `.openknowledge/` dir from a pre-spec version. After this spec: new version ignores that dir entirely (no detection, no warning) and proceeds as P1 or P2. The legacy dir is an orphan on disk; OK does not reference it.
- **P4: Desktop app user.** Opens a project via the Navigator. The utility process spawns `bootServer({ attachUiSibling: false, idleShutdownMs: null })` which goes through the same startup path. Auto-git-init fires the same way.
- **P5: OK maintainer.** Touches shadow-repo code. Today: must reason about two modes in every change. After this spec: one mode, smaller test matrix.

## 5) User journeys

### P1 (existing git repo)

- Happy path: `cd ~/my-project && open-knowledge start` → shadow at `.git/open-knowledge/`, same as today. No disclosure added to startup output since no side effects fired.
- Failure path: shadow init fails (disk, permissions). Existing error path unchanged.

### P2 (fresh notes directory)

- Happy path: `cd ~/fresh-notes && open-knowledge start` →
  1. Detect no `.git/`
  2. Run `git init --initial-branch=main` in `~/fresh-notes/`
  3. Scaffold `.open-knowledge/config.yml` (existing logic from `cli-init-clarity`)
  4. Init shadow at `.git/open-knowledge/`
  5. Start server, print boxed banner + URL
  6. Print first-run preview block including a "Initialized git repo at `<root>/.git/` (default branch: main)" disclosure line
- Failure path: `git init` fails (no write permission, git not on PATH). CLI exits with a clear error: "`open-knowledge` requires git to initialize a parent repo. Install git or run `git init` yourself in this directory, then re-run." (see R6)
- Aha moment: User realizes OK is maintaining attribution automatically via git — can inspect `git log` (empty; shadow is separate) or use `timeline` panel (populated).

### P3 (legacy `.openknowledge/`)

- Happy path: identical to P1 or P2 (whichever applies based on whether `.git/` exists). OK does not detect or reference the legacy dir. The orphan sits on disk until the user deletes it.
- Rationale: adding detection + warning code solely to surface a dir we have no other reason to touch is itself legacy code. Silent orphan has lower maintenance cost than a warning path.

### P4 (Desktop / Navigator)

- Happy path: User picks `~/fresh-notes` in the Navigator → `createProjectWindow` spawns utility process → `bootServer` runs → same flow as P2. Disclosure surfaces in wherever the utility's stdout lands (log drawer in Desktop, per the Electron spec).

### P5 (maintainer)

- Happy path: Modifying `shadow-repo.ts` now requires only one mode's tests to pass. `ShadowRepoMode` type is gone; `resolveShadowDir` returns `string`.

### Interaction state matrix

| Feature / Surface  | Loading             | Empty | Error                                         | Success                             | Partial                                                                       |
| ------------------ | ------------------- | ----- | --------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `resolveShadowDir` | n/a                 | n/a   | throws on unwritable root                     | returns `<root>/.git/open-knowledge` | n/a                                                                           |
| auto-`git init`    | spawned as child    | n/a   | `git not found` / `permission denied` / fails | `.git/` created, HEAD → `main`      | `.git/` partially created and `git init` failed mid-run (retry on next start) |
| Shadow init        | blocks server start | n/a   | disk/permission error propagates              | `.git/open-knowledge/HEAD` exists    | retry on next start                                                           |

## 6) Requirements

### Functional requirements

| Priority | Requirement                                                                                                                                                                                                                                                                                                                                    | Acceptance criteria                                                                                                                                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Must     | **R1 — Remove standalone mode.** `resolveShadowDir` always returns `<projectRoot>/.git/open-knowledge/`. `ShadowRepoMode` type is deleted. No runtime reference to `.openknowledge/` as a shadow location.                                                                                                                                      | `rg --type ts 'standalone\|ShadowRepoMode\|\.openknowledge/'` returns zero matches outside the changelog and this spec. Existing tests pass after mode-branch removal.                                                                                                                                                                     | —                                                                                                                                                                                                                            |
| Must     | **R2 — Auto-`git init` when `.git/` missing.** On server-start (CLI + Desktop utility process), if `<projectRoot>/.git/` does not exist, run `git init --initial-branch=main <projectRoot>` before initializing the shadow. Runs in `bootServer`'s `autoInitFn` hook BEFORE the HTTP listener binds (so R6 fail-fast exits cleanly).           | Integration test: `createTestServer({ contentDir: tmpDir /* no .git */ })` → server starts → `<tmpDir>/.git/HEAD` exists → `<tmpDir>/.git/open-knowledge/HEAD` exists. Second integration test: `createTestServer({ contentDir: tmpDir })` where tmpDir already has `.git/` → no `git init` subprocess fires.                               | Default branch is `main` regardless of user's git config. See D3. Placement per D12 (fail-fast requires pre-listen).                                                                                                         |
| Must     | **R3 — `resolveShadowDir` signature simplified.** Change return type from `{ path: string; mode: ShadowRepoMode }` to `string`. Update all callers.                                                                                                                                                                                            | Type checker passes. `resolveShadowDir(root)` returns `resolve(root, '.git/open-knowledge')` unconditionally.                                                                                                                                                                                                                               | Preserves D22's "single source of truth" spirit; the rule it encodes just becomes trivial.                                                                                                                                   |
| Must     | **R4 — Legacy `.openknowledge/` is a silent orphan.** OK does not detect, reference, read, or warn about `<projectRoot>/.openknowledge/` directories. No code path exists that examines this location.                                                                                                                                         | Integration test: create `<tmpDir>/.openknowledge/` with dummy contents, start server, capture stdout/stderr; assert NO mention of `.openknowledge` in output AND that `.openknowledge/` contents are byte-identical before/after server run. `rg '\.openknowledge/' packages/` returns zero runtime hits (only tests / spec / changelog). | Never auto-delete (NG4); never warn (NG5).                                                                                                                                                                                   |
| Must     | **R5 — Preview-block disclosure of auto-git-init (CLI).** When auto-git-init fires in CLI flow, render the preview block with a disclosure line `Initialized git repo at <root>/.git/ (default branch: main)`. Preview block render must be gated on `didAutoInit \|\| didGitInit` (currently gated on `didAutoInit` alone in `start.ts:502`). | Integration test as R2; assert disclosure line present in captured output. Second test: `didAutoInit: false, didGitInit: true` → preview block renders.                                                                                                                                                                                    | Only fires when init actually happened (not on subsequent starts). Extends `cli-init-clarity` R5's gating condition.                                                                                                         |
| Must     | **R5b — Desktop disclosure via existing sonner toast.** When auto-git-init fires in Desktop utility flow: (a) `UtilityReadyMessage` carries `didGitInit: true`; (b) main process routes it to the renderer via a new `git-init-notice` event on the existing `OkDesktopBridge` push-event surface (sibling to `onProjectSwitched` / `onMenuAction`); (c) a React subscriber on app mount calls `toast.info("Initialized git repo at <root>/.git/")`. Silent on `didGitInit: false`. | Unit test on `window-manager.ts` ready handler with mocked `{ didGitInit: true }`; assert `webContents.send('git-init-notice', ...)` invoked once. React-side test: mock the bridge event, assert `toast.info` called with expected body. | Uses the toast system already consumed by sync / presence / file-op notifications. No macOS `Notification` API usage (NG7). |
| Must     | **R6 — Fail fast if git unavailable.** If `git init` fails (git not on PATH, permission denied, disk error), the CLI exits with a non-zero status and a clear error; does NOT fall back to a standalone shadow.                                                                                                                                | `PATH=/tmp open-knowledge start` (git removed from PATH) exits non-zero with error `open-knowledge requires git to initialize a parent repo. Install git or run 'git init' yourself, then re-run.`                                                                                                                                         | This is the replacement for the standalone mode's "works anywhere" promise.                                                                                                                                                  |
| Should   | **R7 — `.gitignore` hygiene.** When auto-git-init fires, OK does NOT write anything to `.gitignore` (the `.openknowledge/` gitignore entry from standalone mode is no longer meaningful). Any existing `.gitignore` is untouched.                                                                                                              | Integration test: auto-git-init into dir with pre-existing `.gitignore`; assert file byte-identical before/after.                                                                                                                                                                                                                          | Removes the existing `.gitignore` auto-append logic for standalone.                                                                                                                                                          |
| Could    | **R8 — Doc / CLAUDE.md update.** Remove references to "integrated mode" / "standalone mode" distinction throughout repo docs. `packages/server/README.md`, root `CLAUDE.md`, `packages/core/src/shadow-repo-layout.ts` doc comments. Also update path `.git/openknowledge/` → `.git/open-knowledge/` (R9).                                    | Manual review: no `integrated mode\|standalone mode\|\.openknowledge/\|\.git/openknowledge/` outside spec directory and this spec.                                                                                                                                                                                                         | —                                                                                                                                                                                                                            |
| Must     | **R9 — Silent rename of legacy `.git/openknowledge/`.** On shadow init, if `<projectRoot>/.git/openknowledge/` exists AND `<projectRoot>/.git/open-knowledge/` does NOT exist, `renameSync` the legacy dir to the new location BEFORE any other shadow operation. Runs once per repo and is a no-op on subsequent starts. If BOTH dirs exist (shouldn't happen — defensive), leave both untouched and log a warning via `[shadow-repo]`. | Integration test: seed `<tmpDir>/.git/openknowledge/` with a sentinel file + real git refs; start server; assert `<tmpDir>/.git/open-knowledge/` now contains the sentinel + refs; assert `<tmpDir>/.git/openknowledge/` no longer exists. | ~5-line shim in `initShadowRepo` (or `project-git.ts`). Lossless; preserves user's attribution history. |

### Non-functional requirements

- **Performance:** Auto-git-init adds one `git init` subprocess on first start of a new project (\~50-200ms). Zero cost on subsequent starts and zero cost for existing-git projects.
- **Reliability:** `git init` is an established, well-tested operation; failure modes (missing binary, permissions) are enumerated in R6.
- **Security/privacy:** Auto-git-init touches only `<projectRoot>/.git/`. No network calls, no credentials, no global git-config writes.
- **Operability:** Auto-git-init is logged via the existing banner/preview-block channels. No new telemetry. Failures print to stderr via the existing colored error helper.
- **Cost:** None.

## 7) Success metrics & instrumentation

Pre-production; no formal metrics. Validation criteria:

- **Maintainer friction drop:** After the change, the test matrix for shadow-repo-touching PRs drops from 2 modes × N scenarios to 1 × N. Observable in test file count / runtime.
- **Zero standalone references in code:** `rg 'standalone\|ShadowRepoMode\|\.openknowledge/'` returns only spec/changelog hits.
- **No regression for P1 users:** All existing tests in `packages/server/src/shadow-repo.test.ts` pass with no modification beyond mode-branch removal.

## 8) Current state (how it works today)

See the evidence file [[specs/2026-04-21-shadow-repo-single-mode/evidence/current-shadow-repo-mode-surface]] for the full inventory of callers. Summary:

- `resolveShadowDir` returns `{ path, mode }`. Called by:
  - `packages/server/src/shadow-repo.ts:initShadowRepo` — writes `.gitignore` entry when `mode === 'standalone'`
  - `packages/core/src/shadow-repo-layout.ts:getShadowRepoPath` — destructures `.path`
- `ShadowRepoMode = 'integrated' | 'standalone'` is exported from `shadow-repo-layout.ts`.
- HEAD watcher in `packages/server/src/head-watcher.ts` resolves the parent `.git/` via `resolveGitDir` and attaches file watches to `HEAD`, `MERGE_HEAD`, `ORIG_HEAD`, `index.lock`. If there is no `.git/`, the watcher cannot attach — today, standalone mode degrades this subsystem.
- Persistence, server observers, reconciliation, branch scoping, save-version, and shadow-branch-GC all assume a parent branch name. In standalone mode some of these have brittle defaults.
- `packages/cli/src/commands/start.ts` auto-inits `.open-knowledge/` config (`cli-init-clarity` R1) but does NOT touch `.git/`.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:**
  - `open-knowledge start` — performs auto-git-init if needed; discloses via preview block
  - `open-knowledge init` — also performs auto-git-init (`ok init` is the explicit "set this project up for OK" verb; should not defer the heavier side effect to `start`)
  - `open-knowledge mcp` — does NOT perform auto-git-init (read-only / disk-fallback path; see D4)
- **Desktop:** `bootServer` (used by utility process) runs the same auto-git-init path. Navigator-selected fresh directory triggers init. Disclosure routed via `git-init-notice` preload bridge event → in-app sonner `toast.info` (R5b / D10).
- **Docs:** Root `CLAUDE.md`, `packages/server/README.md`, `packages/cli/README.md`, `packages/core/src/shadow-repo-layout.ts` doc comments, the docs site (Fumadocs) get updated; integrated/standalone mode references removed.
- **Error messages:** One new error string (R6). No legacy warning (R4 is silent-orphan).

#### Affected routes / pages

n/a — no web routes.

### System design

- **Architecture overview:**
  - `resolveShadowDir(projectRoot: string): string` returns `resolve(projectRoot, '.git/open-knowledge')` unconditionally.
  - New helper `ensureProjectGit(projectRoot: string): Promise<{ didInit: boolean }>` in `packages/server/src/project-git.ts` (new file):
    1. If `<projectRoot>/.git` exists (via `existsSync`), return `{ didInit: false }`.
    2. Else, spawn `git init --initial-branch=main <projectRoot>`. On failure, throw a typed `ProjectGitInitError` with the captured stderr.
    3. On success, return `{ didInit: true }`.
  - `createServer()` in `packages/server/src/standalone.ts` (ironic name; rename not in scope) calls `ensureProjectGit()` BEFORE `initShadowRepo()`.
  - `bootStartServer` / `bootServer` propagate `didInit` up to the caller so the CLI / Desktop can render disclosure.
- **Data model:** No CRDT / Y.Doc changes. The shadow repo's on-disk layout is unchanged (`.git/open-knowledge/`).
- **API/transport:** No HTTP endpoint changes.
- **Auth/permissions:** n/a.
- **Enforcement point(s):** Two entrypoints call `initShadowRepo`:
  - `packages/server/src/standalone.ts:initAsync` (reached by `createServer`, which is called by `bootServer` for CLI `ok start` / Desktop utility / integration tests — all flow through `bootServer.autoInitFn` per D12 for pre-listen `ensureProjectGit`).
  - `packages/app/src/server/hocuspocus-plugin.ts:144` (Vite dev plugin — calls `initShadowRepo` directly, bypassing `createServer`). `ensureProjectGit` must be invoked here too, BEFORE `initShadowRepo`.
    Claim "createServer is the single choke point" (audit finding F6) is false; these are two paths and both need the new guard.
- **Observability:** One bracket-prefixed console log (per CLAUDE.md logging conventions):
  - `[project-git] initialized .git/ at <root> (branch: main)` when auto-init fires
  - No log for legacy `.openknowledge/` — silent orphan per R4 / NG5.

#### Data flow diagram

- **Primary flow:** `ok start` → `createServer(opts)` → `ensureProjectGit(root)` → `initShadowRepo(root)` → `createFileWatcher` → `startHeadWatcher` → HTTP listen.
- **Shadow paths to test:**
  - **nil / missing:** `.git/` absent → auto-init fires, `.git/open-knowledge/` follows
  - **empty:** `.git/` present but empty/corrupt → `ensureProjectGit` treats as "exists" (fs check is `statSync(.git).isDirectory()`); shadow init may fail downstream. This mirrors today's behavior.
  - **wrong type:** n/a — worktree-specific interactions are out of scope (NG6)
  - **timeout:** n/a (git init is local + fast)
  - **conflict:** Concurrent `ok start` / `ok init` — server-lock handles (one process per contentDir); the lock acquisition precedes git-init
  - **partial failure:** `git init` crashes mid-run leaving a partial `.git/` — next start finds a corrupt `.git/`, shadow init fails; user runs `rm -rf .git/` and retries. Documented as NG.

#### Failure modes and handling

| Component                        | Failure                                                             | Detection                               | Recovery                                          | User Impact                           |
| -------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `ensureProjectGit`               | `git` binary not on PATH                                            | spawn ENOENT                            | Exit with R6 error message                        | CLI exits non-zero; user installs git |
| `ensureProjectGit`               | No write permission in projectRoot                                  | spawn non-zero exit                     | Exit with R6 error                                | CLI exits non-zero; user fixes perms  |
| `ensureProjectGit`               | Partial init (e.g., disk full)                                      | `.git/HEAD` missing after spawn success | Fail fast with generic git-init error             | User cleans up; retries               |
| `resolveShadowDir`               | Called with relative path                                           | `resolve(projectRoot)` handles          | —                                                 | —                                     |

### Alternatives considered

- **Option A (chosen):** Auto-`git init` silently with preview-block disclosure. Matches non-interactive stance.
- **Option B:** Prompt user before `git init`. Rejected: breaks non-TTY flows (Desktop, CI, piped CLI). Existing scaffolding flow (`.open-knowledge/`) doesn't prompt either.
- **Option C:** Require explicit `--init-git` flag. Rejected: adds friction to the exact user (P2) we want to make things easier for.
- **Option D:** Keep standalone mode; just refactor to reduce drift. Rejected: the user explicitly wants the mode gone, and the drift is structural (no HEAD, no branch) not just code shape.

## 10) Decision log

| ID  | Decision                                                                                                                                                                                                                                                                                                                               | Type (P/T/X) | Resolution | 1-way door?                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                 | Evidence / links                                                                                                                                             | Implications                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scope includes only W1 (remove standalone) + W2 (auto-git-init). W3 (relocate shadow to `.open-knowledge/`) is dropped.                                                                                                                                                                                                                | X            | LOCKED     | No                                                           | User retracted W3 during intake; shadow stays at `.git/open-knowledge/`, no user-visible relocation.                                                                                                                                                                                                                                                                                       | Intake §4 Q1 answer                                                                                                                                          | No filesystem layout change; migration story trivial.                                                                                                                                                               |
| D2  | Auto-`git init` is silent with prominent preview-block disclosure (Option C from intake).                                                                                                                                                                                                                                              | P            | LOCKED     | No                                                           | Matches non-interactive stance of rest of CLI; compatible with Desktop utility process and CI.                                                                                                                                                                                                                                                                                            | Intake §4 Q2 answer                                                                                                                                          | One new disclosure line in preview block. R5 covers.                                                                                                                                                                |
| D3  | Default branch for auto-`git init` is `main`.                                                                                                                                                                                                                                                                                          | T            | LOCKED     | No                                                           | Matches modern git defaults (git 2.28+), unambiguous. Parent-repo's branch is load-bearing for shadow's `refs/wip/<branch>/<writer>` namespace. Using `main` avoids relying on user's `init.defaultBranch` config which may be unset or `master`.                                                                                                                                         | —                                                                                                                                                            | `git init --initial-branch=main` flag; works on all supported git versions.                                                                                                                                         |
| D4  | `ok mcp` does NOT auto-git-init.                                                                                                                                                                                                                                                                                                       | P            | LOCKED     | No                                                           | `ok mcp` stdio path is read-only. Note the transitive case: `ok mcp` may auto-spawn `ok start` (mcp.ts:127-130), and THAT spawned `ok start` runs `ensureProjectGit`. Opt-out: existing `OK_MCP_AUTOSTART=0` / `mcp.autoStart: false`. See D13 for full treatment.                                                                                                                        | `packages/cli/src/commands/mcp.ts` (discoverServerUrl behavior)                                                                                              | One check skipped; no new code for MCP path.                                                                                                                                                                        |
| D5  | Legacy `.openknowledge/` directories are NOT migrated, NOT auto-deleted, and NOT detected at all. Silent orphan — OK carries no code path that references this location.                                                                                                                                                               | P            | LOCKED     | No                                                           | User clarified in intake follow-up: silent orphan (option a) over warning (option b), reason "less legacy code to support." The whole point of this spec is deleting the standalone code path; a warning branch is itself legacy code.                                                                                                                                                    | Intake follow-up (changelog 2026-04-21)                                                                                                                      | Zero runtime references to `.openknowledge/`. Existing dirs are inert on disk until user deletes.                                                                                                                   |
| D6  | `ensureProjectGit` checks for `.git` presence via `existsSync('<root>/.git')` (match-any: dir or file). No further classification.                                                                                                                                                                                                     | T            | LOCKED     | No                                                           | Mechanical detection; simplest form that works for non-worktree projects. Worktree-specific semantics are out of scope (NG6) and owned by a separate spec.                                                                                                                                                                                                                                | —                                                                                                                                                            | One-line implementation; deliberately avoids `isDirectory()` gating because that's a worktree-semantic choice that belongs elsewhere.                                                                               |
| D7  | `resolveShadowDir` keeps its name and export signature as a function, but return type collapses to `string`. `ShadowRepoMode` type is deleted.                                                                                                                                                                                         | T            | LOCKED     | Yes (exported API — consumed by CLI's shadow-repo read path) | Preserves D22's "single source of truth" contract; the encoded rule becomes trivial (always `.git/open-knowledge`). Callers update from `{ path, mode }` destructure to direct string use.                                                                                                                                                                                                 | `packages/core/src/shadow-repo-layout.ts:72-83`                                                                                                              | Cross-package type change; CLI is a consumer.                                                                                                                                                                       |
| D8  | D22 from original shadow-repo spec is updated-in-place rather than retired.                                                                                                                                                                                                                                                            | T            | LOCKED     | No                                                           | User chose "keep the function, path is different" in intake #5. D22's invariant — CLI + server share one layout resolver — remains.                                                                                                                                                                                                                                                       | Intake §4 Q5 answer                                                                                                                                          | Doc-comment refresh on `shadow-repo-layout.ts`.                                                                                                                                                                     |
| D9  | Auto-git-init runs in `ok start` AND `ok init`, NOT in `ok mcp`.                                                                                                                                                                                                                                                                       | P            | LOCKED     | No                                                           | See D4. `ok init` should do more side effects, not fewer, since the user explicitly asked to set up the project.                                                                                                                                                                                                                                                                          | —                                                                                                                                                            | Two call sites, one shared `ensureProjectGit` helper.                                                                                                                                                               |
| D10 | Desktop surfaces auto-`git init` via the existing in-app sonner toast system (`packages/app/src/components/ui/sonner.tsx`), wired through the existing preload bridge push-event pattern (`onProjectSwitched` / `onMenuAction` siblings). NOT a native macOS system notification.                                                       | P            | LOCKED     | No (extends existing bridge shape; matches established patterns)  | User correction 2026-04-21: "macOS notifications are not a goal of this spec... just keep using our existing notification toast system." macOS `Notification` adds permission-prompt surface + DND-invisibility edge cases, AND forks the disclosure system Desktop already uses for every other user-facing event. Reuse the sonner toast consumers already see for sync / presence / file operations. | `packages/app/src/components/ui/sonner.tsx` (sonner consumer); `packages/desktop/src/shared/bridge-contract.ts:58-59` (push-event pattern) | Extend IPC event list + preload bridge + add one React subscriber that calls `toast.info("Initialized git repo at <root>/.git/")`. See R5b + §16 SCOPE. No macOS `Notification` API usage.       |
| D11 | Worktree handling is owned by a separate spec; this spec does not detect, refuse, or work around worktree semantics. Implementer of W1+W2 should not introduce worktree-aware code.                                                                                                                                                    | X            | LOCKED     | No                                                           | User directive (REOPEN-1 = B; follow-up clarification: "All worktree handling is being dealt with in another spec"). Keeps this spec's charter tight. Worktree users pick up that spec's output.                                                                                                                                                                                          | —                                                                                                                                                            | NG6 captures the constraint. No worktree code in §16 SCOPE.                                                                                                                                                         |
| D12 | `ensureProjectGit` runs in `bootServer`'s `autoInitFn` hook BEFORE the HTTP listener binds. On failure, throw; `bootServer` propagates, exit non-zero. No degraded-mode fallback.                                                                                                                                                      | T            | LOCKED     | No                                                           | REOPEN-2 = A. Per-audit finding 1 + challenger F8: `initAsync` (current §16 draft placement) runs after listen, so fail-fast is impossible from there. `bootServer.autoInitFn` is the existing pre-listen pre-createServer hook; repurposes the same hook the CLI uses for `initContent`. Desktop utility shares this path because Desktop users are also developers and can install git. | `packages/server/src/boot.ts:136-144` (autoInitFn runs before `createServer`/listen); `packages/cli/src/commands/start.ts` for parallel `initContent` wiring | Removes the `degraded.push('project-git')` pattern from §16 earlier drafts. Changes the `initContent` + `ensureProjectGit` composition: `bootServer` receives a composed autoInitFn that does both.                 |
| D13 | `ok mcp` that auto-spawns `ok start` inherits the auto-git-init side effect transitively. D4's "ok mcp doesn't auto-git-init" is understood as "not directly"; the spawned `ok start` still may. Users who want zero mutation set `OK_MCP_AUTOSTART=0` or `mcp.autoStart: false` (existing opt-out). No new `--no-auto-git-init` flag. | P            | LOCKED     | No                                                           | DESIGN-2 = A. Adding a flag introduces a special-case code path that contradicts the single-mode goal. The opt-out already exists; documentation is the fix.                                                                                                                                                                                                                              | `packages/cli/src/commands/mcp.ts:127-130` (auto-spawn path)                                                                                                 | D4 rationale updated to mention the transitive case. No new flag.                                                                                                                                                   |
| D14 | Rename the shadow subdirectory from `.git/openknowledge/` to `.git/open-knowledge/` for naming consistency with the `.open-knowledge/` config dir. Existing `.git/openknowledge/` dirs are silently renamed in-place on first run (R9) — lossless, one-time, preserves attribution history. | X | LOCKED | No (we own the shadow repo; no external contract depends on the name) | User directive: "we own the shadow repo so we can do the shim." Different from D5's `.openknowledge/` silent-orphan stance because `.git/openknowledge/` is every existing user's integrated-mode shadow with real history; silent orphan would destroy their timeline. The rename shim is ~5 lines of `existsSync + renameSync`, one-shot, removable after a few releases. | Intake follow-up 2026-04-21 (after PR #244 was opened) | R9 locks the shim behavior. NG2 updated to the new path. Writer identity strings (`user.name 'openknowledge'`, author email `noreply@openknowledge.local`) are NOT renamed — out of scope. |

## 11) Open questions

| ID | Question                                                                                                                                                                                                                                                                                                       | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action                                                                                                                                                                                                                  | Status |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q1 | What check does `ensureProjectGit` use to decide whether `.git/` exists?                                                                                                                                                                                                                                       | T            | P0       | Yes       | **Resolved.** `existsSync('<root>/.git')` — matches any form (dir or file). Further classification (worktrees etc.) is NG6, owned by a separate spec.                                                                                          | Closed |
| Q2 | Does the `cli-init-clarity` R5 preview block run in Desktop's utility-process flow, or is that path CLI-only? Affects whether R5 disclosure surfaces for P4 Desktop users.                                                                                                                                     | T            | P0       | No        | **Resolved.** Desktop utility process does not relay `didAutoInit` to main; preview block is CLI-only. `UtilityReadyMessage` IPC carries only `{ port, apiOrigin }`. Decision on Desktop disclosure is now Q5.                                 | Closed |
| Q3 | Does existing test harness (`createTestServer` in `packages/app/tests/integration/test-harness.ts`) currently rely on the tmpDir NOT having `.git/`? If so, adding auto-git-init changes test isolation semantics.                                                                                             | T            | P0       | Yes       | **Resolved.** Harness creates fresh tmpDir with no `.git/`. Every test will trigger auto-`git init` (\~100-200ms × \~50 tests = \~5-10s overhead). No harness change needed; this validates the production path on every run. See evidence §2. | Closed |
| Q4 | Any worktree-related question (boot behavior, ref-namespace semantics, commondir sharing).                                                                                                                                                                                                                     | T            | n/a      | No        | **Out of scope.** Worktree handling is owned by a separate spec (NG6). This spec is deliberately silent on the topic.                                                                                                                          | Moved  |
| Q5 | Should Desktop surface the auto-`git init` disclosure to the user (log drawer, toast, or similar), or accept silent auto-init in Desktop?                                                                                                                                                                   | P            | P0       | No        | **Resolved.** Initial user answer was Notification (option A); follow-up correction 2026-04-21: use the existing sonner toast system. D10 rewritten; R5b updated; NG7 locks "no macOS system notifications."                                  | Closed |

## 12) Assumptions

| ID | Assumption                                                                                                                               | Confidence | Verification plan                                                                                                                                                               | Expiry   | Status |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| A1 | Every supported platform (macOS, Linux, Windows WSL) ships `git` on a predictable PATH for users who have reached the "install OK" step. | HIGH       | **Verified.** Repo-wide stance is git-on-PATH: existing `simple-git` usage in `git-handle.ts`, `shadow-repo.ts`, `sync-engine.test.ts`. Desktop + CLI distribution specs align. | Verified | Closed |
| A2 | `git init --initial-branch=<name>` is supported on the minimum git version OK requires.                                                  | HIGH       | **Verified.** `packages/server/src/sync-engine.test.ts:149,230,547` already uses `git.init(['--initial-branch=main'])`; codebase assumes git ≥ 2.28 (July 2020).                | Verified | Closed |
| A3 | No existing production users rely on the `.openknowledge/` standalone path.                                                              | HIGH       | **Verified.** User stated pre-production stance in intake; root CLAUDE.md confirms pre-production posture; migration path explicitly skipped per NG1.                           | Verified | Closed |

## 13) In Scope (implement now)

- **Goal:** Collapse shadow-repo dual-mode to single mode; add auto-`git init` fallback.
- **Non-goals:** W3 relocation; migration of existing standalone data; any UX prompts.
- **Requirements with acceptance criteria:** See §6 (R1-R8).
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Andrew.
- **Next actions:**
  - Write `ensureProjectGit` in `packages/server/src/project-git.ts`
  - Delete `ShadowRepoMode` type, simplify `resolveShadowDir`
  - Wire `ensureProjectGit` into `createServer`
  - Remove `.gitignore` auto-append in `initShadowRepo`
  - Wire disclosure into CLI preview block (extend `cli-init-clarity` rendering)
  - Update `packages/core/src/shadow-repo-layout.test.ts` (drop standalone tests)
  - Update `packages/server/src/shadow-repo.test.ts` (drop mode tests)
  - Update `CLAUDE.md`, `packages/server/README.md`
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** One bracket-prefixed console log `[project-git] initialized .git/ at <root> (branch: main)` when auto-init fires; no new telemetry.

### Deployment / rollout considerations

| Concern                           | Approach                                                                           | Verify                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Existing users on integrated mode | First-run silent rename `.git/openknowledge/` → `.git/open-knowledge/` (R9); then unchanged | Rename test in R9; existing tests otherwise pass |
| Users on standalone mode          | Their `.openknowledge/` dir becomes a silent orphan; OK carries no reference to it | Manual test: verify OK does not read / write / warn |
| Desktop app                       | `bootServer` picks up change transparently                                         | Integration test via Desktop harness                |
| Vite dev plugin                   | Same `createServer` path                                                           | Existing dev-server smoke test                      |

## 14) Risks & mitigations

| Risk                                                                                                       | Likelihood             | Impact                                                                      | Mitigation                                                                                                                                                                    | Owner  |
| ---------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Auto-git-init surprises a user who intentionally had a non-git directory                                   | MED                    | LOW (one empty `.git/`; trivial to `rm -rf`)                                | CLI preview-block disclosure (R5); sonner toast on Desktop (R5b); docs update (R8)                                                                                            | Andrew |
| `git` binary unexpectedly missing (minimal Docker image, alpine without git)                               | LOW                    | HIGH (CLI non-functional)                                                   | Fail-fast error with explicit install instruction (R6)                                                                                                                        | Andrew |
| Worktree interaction (boot behavior, `.git` file vs dir, ref-namespace semantics)                          | n/a                    | n/a                                                                         | Out of scope — handled by a separate worktree-focused spec. Do not add worktree code here.                                                                                    | —      |
| Test harness regression (Q3)                                                                               | MED (now LOW — closed) | MED                                                                         | Resolved in round 1; every test runs auto-init (\~5-10s total overhead accepted)                                                                                              | Andrew |
| IPC schema drift — `UtilityReadyMessage.didGitInit` diverges between utility + main + any Zod validator    | LOW                    | MED (boot fails on payload mismatch)                                        | Single-source TS type in `server-entry.ts` imported by `window-manager.ts`; shared channel is `parentPort.postMessage`, narrowed at handler. Not the preload-IPC D14 governs. | Andrew |
| Toast subscriber wired in renderer but bridge event fires before subscriber mounts (race) | LOW | LOW (user misses the one-shot disclosure; `.git/` still visible on disk) | Main process defers `git-init-notice` send until after renderer's first `dom-ready`; if not feasible, main buffers and re-sends on the next subscribe-ack. | Andrew |
| Rename shim (R9) fails mid-run — partial `.git/open-knowledge/` + intact `.git/openknowledge/` on disk | LOW | HIGH (shadow inconsistent; next start may recreate blank shadow alongside legacy) | `renameSync` is atomic on same-filesystem moves (POSIX rename(2)). No cross-FS case — both paths are under `.git/`. Defensive: if both dirs exist at start, log `[shadow-repo] unexpected legacy + new shadow both present` and no-op the rename. | Andrew |
| Rename shim survives past its usefulness (legacy code accumulates) | LOW (for weeks) → MED (for months) | LOW | Track removal alongside a future version bump; remove after ~2 releases. Not tracked as a blocker for this spec. | Andrew |

## 15) Future Work

### Explored

- **W3 — Relocate shadow repo to `.open-knowledge/shadow/`**
  - What we learned: The shadow currently lives at `.git/open-knowledge/` (hidden inside git's dir). Moving it into the user-visible `.open-knowledge/` config dir would improve discoverability but adds user-visible bare-git internals.
  - Recommended approach: Relocate path, update `resolveShadowDir` to return `<root>/.open-knowledge/shadow/`, migrate on first start.
  - Why not in scope now: User retracted the proposal during intake; shadow stays where it is.
  - Triggers to revisit: User feedback that the shadow's current location is hard to inspect / causes git-log confusion / needs to live outside `.git/` for a workflow reason.

### Identified

- **`.openknowledge/` legacy-dir detection (warning, auto-delete, or auto-migration)**
  - What we know: We've chosen NOT to detect, warn, migrate, or delete. Silent orphan by design (R4 / NG5).
  - Why it matters: If OK reaches a userbase size where orphaned dirs cause real confusion, we may want to revisit — but any of these options re-introduces legacy code we just deleted.
  - What investigation is needed: User reports of the orphan causing actual problems (not theoretical).

- **Worktree handling — owned by a separate spec.** All worktree concerns (including the boot-time regression under the simplified `resolveShadowDir`) are out of scope here. See that spec for status.

### Noted

- **Auto-git-init UX polish** — A future TTY-aware prompt could replace the silent behavior if a legitimate non-init use case emerges.
- **`ok status` command** — A future read-only verb could enumerate the auto-init / shadow-init state so users can audit OK's side effects.

## 16) Agent constraints

- **SCOPE (core + server):**
  - `packages/core/src/shadow-repo-layout.ts` — simplify `resolveShadowDir` return to `string`; delete `ShadowRepoMode`; refresh doc-comments
  - `packages/core/src/shadow-repo-layout.test.ts:187-204` — drop standalone-mode test cases; keep null / integrated cases
  - `packages/server/src/shadow-repo.ts:86-100` — remove `.gitignore` mutation + standalone branch in `initShadowRepo`
  - `packages/server/src/shadow-repo.test.ts:73-91` — drop standalone creation test; `:502+` drop the entire "saveVersion — standalone mode" describe block; merge the gitignore-untouched test
  - `packages/server/src/head-watcher.ts` — refresh the `(standalone mode)` doc-comment on line 132
  - `packages/server/src/head-watcher.test.ts:40` — rename `(standalone mode)` label in existing null-case test; no behavior change
  - `packages/server/src/project-git.ts` — NEW; `ensureProjectGit(projectRoot): Promise<{ didInit: boolean }>`. On failure, THROW (no degraded-mode fallback per D12).
  - `packages/server/src/standalone.ts` — import `ensureProjectGit`; wire into `createServer` path via the `bootServer.autoInitFn` composition (see `boot.ts` entry below)
  - `packages/server/src/boot.ts` — add `didGitInit: boolean` to `BootedServer`; compose `ensureProjectGit` into `autoInitFn` (called BEFORE HTTP listener binds per D12); on throw, `bootServer` rejects, caller exits non-zero
- **SCOPE (Vite dev plugin — audit finding F6):**
  - `packages/app/src/server/hocuspocus-plugin.ts:144` — call `ensureProjectGit(PROJECT_ROOT)` before `initShadowRepo`; on throw, surface via the existing `[dev]` warn path + `process.exit(1)` (no degraded bypass for dev server)
- **SCOPE (CLI):**
  - `packages/cli/src/commands/start.ts:477-511` — change preview-block gate from `booted.didAutoInit` to `booted.didAutoInit || booted.didGitInit`; add disclosure line `Initialized git repo at <root>/.git/ (default branch: main)` when `didGitInit` is true
  - `packages/cli/src/commands/init.ts` — wire `ensureProjectGit` into the init flow (same fail-fast)
  - `packages/cli/src/commands/mcp.ts` — **no code change**; update doc-comment at top to note the transitive auto-git-init via auto-spawned `ok start` (D13)
  - `packages/cli/src/content/enrichment.ts:37` — remove `'.openknowledge'` from exclusion list
  - `packages/cli/src/content/shadow-log.ts:4-5` — refresh doc-comment (drop standalone-mode mention)
  - `packages/cli/src/bash/mtime-scan.ts:14,29` — remove `.openknowledge` from exclusion list + doc
- **SCOPE (Desktop + renderer toast):**
  - `packages/desktop/src/utility/server-entry.ts:38-42` — extend `UtilityReadyMessage` TS type with `didGitInit: boolean`; populate from `booted.didGitInit`
  - `packages/desktop/src/shared/ipc-events.ts` — add `git-init-notice` push-event type carrying `{ gitDir: string }`; follow the existing `project-switched` / `menu-action` pattern
  - `packages/desktop/src/shared/bridge-contract.ts:58-59` — add `onGitInitNotice(cb: (evt: { gitDir: string }) => void): OkUnsubscribe` alongside the existing `onProjectSwitched` / `onMenuAction` signatures
  - `packages/desktop/src/preload/index.ts` — wire `onGitInitNotice` via contextBridge using the same listener-wrapper pattern as the existing subscribers
  - `packages/desktop/src/main/window-manager.ts:259-268` — on `ready` with `didGitInit: true`, call `browserWindow.webContents.send('git-init-notice', { gitDir })`
  - `packages/app/src/` — new React subscriber (on app mount; likely in `main.tsx` or a dedicated hook adjacent to `use-sync-toasts.ts`) that calls `window.okDesktop?.onGitInitNotice((evt) => toast.info(`Initialized git repo at ${evt.gitDir}`))`. Mirror the one-shot shape of existing bridge subscribers.
  - Failure-mode path: when `bootServer` throws from `ensureProjectGit`, the utility process exits non-zero before `ready`; existing `onExit` handler in `window-manager.ts` rejects the init promise — surface via existing error dialog path. NO new error handling added.
- **SCOPE (docs + gitignore):**
  - Root `.gitignore:48-55,65` — remove `.openknowledge/` entries and the mode-comment block
  - `AGENTS.md:221` — refresh the shadow-repo description
  - Root `CLAUDE.md` — refresh the shadow-repo section
  - `packages/server/README.md`, `packages/cli/README.md`, `packages/desktop/README.md` — remove integrated/standalone references
  - `docs/content/internals/service-topology.mdx:84` — refresh the shadow-repo line
- **EXCLUDE:**
  - Do not relocate the shadow repo (NG2 / W3 dropped)
  - Do not migrate data from `.openknowledge/` (NG1)
  - Do not detect / warn about legacy `.openknowledge/` (NG5)
  - Do not introduce worktree-aware code (NG6 — owned by a separate spec)
  - Do not modify persistence, observers, HEAD watcher runtime logic, agent-sessions, or any CRDT code paths
  - Do not change the shape of WIP / checkpoint / upstream refs
  - Do not add a degraded-mode fallback for `ensureProjectGit` failure (D12 locks fail-fast)
  - Do not add `--no-auto-git-init` flag to `ok mcp` auto-spawn path (D13 locks "accept transitively")
- **STOP\_IF:**
  - Any caller of `resolveShadowDir`, `ShadowRepoMode`, or `.openknowledge/` (runtime or doc) discovered outside the enumerated SCOPE
  - Any existing test depends on standalone mode semantics beyond simple deletion
  - `ok mcp` path directly invokes `ensureProjectGit` (D4 direct-path violation — the transitive spawn is expected)
  - Implementer finds themselves writing worktree detection code (NG6 violation)
  - `ensureProjectGit` placement ends up AFTER `listen()` (D12 fail-fast violation)
- **ASK\_FIRST:**
  - Any change to `refs/wip/` layout or `writer-id` parsing
  - Any new error-exit path in `bootServer` beyond the `ensureProjectGit` throw
  - Any new CLI flag
  - IPC-schema change beyond `UtilityReadyMessage.didGitInit` + `git-init-notice`
  - Using `new Notification(...)` (NG7) or any macOS system-level notification API
  - Disclosure UI other than sonner `toast.info` (D10 locks the surface; any change re-opens the Desktop disclosure question)

