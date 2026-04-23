# World model — Per-worker shadow-repo + git support in the Open Knowledge test harness

**Generated:** 2026-04-22 by `/worldmodel` (shared:worldmodel)
**Seed:** "Playwright per-worker isolation disables shadow repo → structural E2E coverage gap for timeline, save-version, rollback, branch-switch, attribution, external-change reconciliation."
**Owner (seed):** Miles Kaming-Thanassi (server package), per user memory `/Users/edwingomezcuellar/.claude/projects/-Users-edwingomezcuellar-projects-open-knowledge/memory/MEMORY.md`.

## 0) Scope framing (non-prescriptive)

The spec loop will decide what to ship. This document only reports the topology. Two tier questions are pre-staked:

- **Playwright (mandatory):** per-worker tmpdir currently disables shadow (`hocuspocus-plugin.ts:151,159-163,205`). This is the gap the user flagged.
- **Tier 1 integration harness (open question):** `test-harness.ts:119` already runs `ensureProjectGit(contentDir)` but `test-harness.ts:127` still passes `gitEnabled: false`. Open in §9 as ADJACENT, not decided here.

The "unify dev-plugin + createServer" refactor (related to PR #270) is explicitly out of scope per caller directive; §9 surfaces intersection points without recommending absorption.

---

## 1) Surfaces (product + internal) affected

Grouped by consumer / producer role. Every non-trivial claim cites `file:line`.

### 1a. Test-harness surfaces (the direct authoring targets)

| Surface | Path | What it does | Shadow status |
|---|---|---|---|
| Vite dev plugin module scope | `packages/app/src/server/hocuspocus-plugin.ts:146-163` | Gates `runDevShadowInit` AND `gitEnabled` on `isTestIsolated = Boolean(OK_TEST_CONTENT_DIR)` | **Disabled when Playwright sets `OK_TEST_CONTENT_DIR`** |
| Playwright worker fixture | `packages/app/tests/stress/_helpers/fixtures.ts:196-245` | `workerServer` at `{ scope: 'worker' }`; `mkdtempSync(tmpdir(), 'ok-w${workerInfo.workerIndex}-')`; spawns `bun run dev` with `OK_TEST_CONTENT_DIR: contentDir` and `VITE_PORT: port` | Inherits the above disable — **no shadow per worker** |
| Tier 1 integration harness | `packages/app/tests/integration/test-harness.ts:100-245` | `createTestServer()` — `mkdtempSync`, `ensureProjectGit(contentDir)` at line 119, `createServer({ gitEnabled: false })` at line 127 | **Calls `ensureProjectGit` but still opts out of shadow writes** |
| Integration harness comment | `test-harness.ts:114-118` | "Mirror the production auto-git-init path (SPEC R2 / Q3 resolution): every fresh tmpDir gets a real .git/ so the single-mode shadow-repo layout in US-003 can locate the shadow at `<contentDir>/.git/open-knowledge/` without a standalone-mode fallback." | `.git/` exists but no `initShadowRepo` call, no `shadowRepo` option passed, `gitEnabled:false` prevents L2 commits |
| Integration harness — symlink test | `packages/app/tests/integration/symlink-alias.test.ts:44` | Uses `gitEnabled: false` | Same gap; explicit |
| Integration harness — provider pool test | `packages/app/tests/integration/provider-pool-reconnect.test.ts:74` | `gitEnabled: false` | Same gap; explicit |
| Fixture helper inventory | `packages/app/tests/stress/_helpers/*.ts` (`fixtures.ts`, `editor-state.ts`, `provider.ts`, `sidebar.ts`, `graph.ts`, `clipboard.ts`, `slash-menu.ts`, `error-filters.ts`, `index.ts`) | No helper touches shadow / timeline / save-version / rollback surfaces today | — |

### 1b. Production server surfaces the harness must emulate (read + write)

| Surface | Path | Role |
|---|---|---|
| `ensureProjectGit` | `packages/server/src/project-git.ts:43-76` | Runs `git init --initial-branch=main <projectRoot>` when `.git/` absent. Throws `ProjectGitInitError` on failure (D12 fail-fast, SPEC 2026-04-21-shadow-repo-single-mode). |
| `initShadowRepo` | `packages/server/src/shadow-repo.ts:82-125` | Creates bare repo at `<projectRoot>/.git/open-knowledge/`; configures `core.worktree = projectRoot`, `user.name = openknowledge`, `user.email = noreply@openknowledge.local`; sweeps legacy refs; runs `sweepOrphanedTmpIndexFiles`; calls `acquireLock(shadowDir, projectRoot)` |
| `destroyShadowRepo` | `packages/server/src/shadow-repo.ts:131-133` | Calls `releaseLock(shadow.gitDir)` |
| `ShadowHandle` | `packages/server/src/shadow-repo.ts:37-40` | `{ gitDir, workTree }` — passed as `shadowRepo` option to `createServer` |
| `ShadowRef` | `packages/server/src/shadow-repo.ts:43-45` | `{ current: ShadowHandle \| undefined }` — deferred-init pattern; read at commit time in `persistence.ts:261-263` |
| `shadowGit(handle)` | `packages/server/src/shadow-repo.ts:58-66` | `simple-git` instance scoped to the bare repo with `GIT_DIR` + `GIT_WORK_TREE` env vars. Timeout 30s. |
| `commitWip` | `packages/server/src/shadow-repo.ts:216-293` | Plumbing: `read-tree` → `add <pathspec>` → `write-tree` → `commit-tree` → `update-ref refs/wip/<branch>/<writer-id>`. Temp index path via `<gitDir>/index-wip-<writer.id>`. |
| `shadow-lock` | `packages/server/src/shadow-lock.ts:28-82` | Per-shadow-dir exclusive writer lock at `<shadowDir>/lock`; pid+hostname-guarded; stale lock replaced with warn; same-process re-acquire is idempotent |
| `server-lock` | `packages/server/src/server-lock.ts:1-61` | Per-contentDir server lock at `<contentDir>/.open-knowledge/server.lock`; delegated to `acquireProcessLock` (`process-lock.ts`); stale detection + port update; throws `ServerLockCollisionError` |
| `process-alive` | `packages/server/src/process-alive.ts` | Shared PID liveness check between shadow-lock + server-lock |
| `createServer` options | `packages/server/src/standalone.ts:69-116` | Accepts `contentDir`, `projectDir?` (defaults to contentDir), `gitEnabled = true` default, `shadowRepo?: ShadowHandle`, `contentRoot?`, `wipRef?: string`, `commitDebounceMs?` |
| Server boot | `packages/server/src/standalone.ts:164-340` | Acquires server lock at line 190; creates `shadowRef = { current: shadowRepo }` at line 220; `PersistenceOptions.shadowRef` wired at line 228 |
| Server async init | `packages/server/src/standalone.ts:986-991` | `initShadowRepo(projectDir)` called inside `initAsync` when `shadowRef.current` is null at line 986 |
| `bootServer` | `packages/server/src/boot.ts` | HTTP-wrapping entry point. Accepts `gitEnabled` at line 183. Single composition point for CLI start.ts, Electron utility, (NOT Vite dev plugin — dev plugin calls `createServer` direct). |
| Persistence — gitEnabled read | `packages/server/src/persistence.ts:248` | `const gitEnabled = options?.gitEnabled ?? true` |
| Persistence — gitEnabled gate | `packages/server/src/persistence.ts:461` | `if (!gitEnabled) return` short-circuits `scheduleGitCommit` |
| Persistence — commit drain | `packages/server/src/persistence.ts:261-289` | Reads `shadowRef.current` per drain; branch from `getCurrentBranch?.()`; atomic `swapContributors()`; per-writer fan-out (FR-7) |
| `applyExternalChange` | `packages/server/src/external-change.ts` | Disk → CRDT bridge. Records `file-system` classified writer via `contributor-tracker` so reconciliation commits land at `refs/wip/<branch>/file-system` |
| Dev-plugin shadow init | `packages/app/src/server/dev-shadow-init.ts:46-91` | Pure helpers: `runDevShadowInit(projectRoot, onReady, io?, deps?)` and `handleDevShadowInitError(err, io)`. `ProjectGitInitError` → R6 fail-fast + `exit(1)`; other errors → degraded warn |
| Dev plugin persistence wiring | `packages/app/src/server/hocuspocus-plugin.ts:201-210` | `createPersistenceExtension` options. `projectDir: isTestIsolated ? CONTENT_DIR : PROJECT_ROOT`; `contentRoot: isTestIsolated ? '' : CONTENT_ROOT`; `gitEnabled: !isTestIsolated`; `shadowRef` + `getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git'))` |

### 1c. Feature surfaces currently un-covered by automated E2E (the BLOCKED consumers)

| Feature | Production file(s) | Server write path | E2E/integration coverage |
|---|---|---|---|
| TimelinePanel | `packages/app/src/components/TimelinePanel.tsx`, `TimelinePanel.test.ts` (unit only), `EditorHeader.tsx:83-84, 649, 666` | `/api/timeline` handler in `api-extension.ts` (called `getDocumentHistory` import at :134) | **unit-only** (`TimelinePanel.test.ts` tests pure helpers) |
| Save Version | `EditorHeader.tsx:84` → `onSaveVersion` → client fetch | `/api/save-version` handler, `api-extension.ts:4940`; server impl `shadow-repo.ts` (`saveVersion`), `saveVersion.test.ts` unit | **no E2E**, server unit yes |
| Rollback | `api-extension.ts:2659-2799` handler; `ROLLBACK_ORIGIN` paired-write | `/api/rollback`, `api-extension.ts:4943` | **no E2E / integration**; only mechanism tested is the paired-write guard in bridge tests |
| Branch switch UX | `head-watcher.ts` → `persistence.ts:setBatchInProgress` → `parkBranch()` + `readParkedState()` + `restoreBranchWIP` | `standalone.ts:1149-1290` callbacks | **no test** at any tier exercises a real branch switch |
| Classified-writer attribution | `refs/wip/<branch>/file-system`, `git-upstream`, `openknowledge-service` | `shadow-repo-layout.ts:49-84` taxonomy; `contributor-tracker.ts` | **partial** — `persistence-fan-out.test.ts:127-161` covers `file-system` at integration tier; `git-upstream`, `openknowledge-service` untested at integration<br>_[Corrected 2026-04-22 post-audit: two files named `persistence-fan-out.test.ts` exist — the app-integration file at `packages/app/tests/integration/persistence-fan-out.test.ts` uses `clearContributors` (@deprecated), and the server-unit file at `packages/server/src/persistence-fan-out.test.ts` uses `swapContributors` (preferred). The spec's D7/FR6 migration target is the app-integration file. Authoritative fix in `SPEC.md` §16 SCOPE.]_ |
| External-change reconciliation | `external-change.ts`, `applyExternalChange` | Routes to `file-system` classified writer | **partial** — `persistence-fan-out.test.ts:127` covers the ref-creation side; no test covers the disk→CRDT→shadow→UI round-trip |
| Rescue buffers | `/api/rescue`, `/api/rescue/:docName`; `listRescueCheckpoints` via `timelineEntries` at `api-extension.ts:3061, 3125` | `refs/checkpoints/*` + in-memory-checkpoint under `shadow-repo.ts` | **no E2E**; server unit partial |
| Per-session UM + agent-undo round-trip | `session-undo-manager.test.ts`, `agent-undo.test.ts`, `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (integration) | V0-14 landed. Shadow path verified only via fan-out test | Integration covers bridge + per-session undo, but **not** the shadow commit shape (writer id, subject prefix, `ok-actor:` body) produced by an undo |
| Save-version main-git `Co-Authored-By:` trailers | `api-extension.ts:2344-2438`, `saveVersion.test.ts` | Parent-repo commit in `projectDir/.git` | **no E2E**; server unit exists |

### 1d. Non-markdown / infra surfaces touched tangentially

| Surface | Path | Note |
|---|---|---|
| Playwright perf baselines | `packages/app/tests/stress/perf-baseline.json` | Per-file JSON consumed only by `paste-fidelity.e2e.ts`; not per-worker |
| CI `test:e2e` script | `packages/app/package.json` | Fixed list of 6 files per root CLAUDE.md "Quality gates"; the CI set diverges from `bunx playwright test` (run-all) |
| Nightly E2E stability | `.github/workflows/nightly-e2e-stability.yml` | `--repeat-each=3 --workers=1`; **the spec must confirm this harness remains compatible** |
| turbo tasks | `turbo.json` | `test:integration` and `test:e2e` are separate tiers with independent caches |
| Playwright config | `packages/app/playwright.config.ts:34-92` | `workers: isCI ? 4 : undefined`; `failOnFlakyTests: false`; `reuseExistingServer` absent (webServer removed entirely per Track A migration — see comment at :3-18) |

---

## 2) Connections & dependencies

### 2a. The dependency graph (harness setup → shadow lifecycle → feature coverage)

```
Playwright worker boot
  └─► fixtures.ts:196-245 workerServer fixture { scope: 'worker' }
        ├─► getFreePort()                    [kernel-assigned; net.createServer(0)]
        ├─► mkdtempSync(tmpdir, 'ok-w${i}-') [per-worker contentDir]
        ├─► seedRequiredFixtureFiles()        [seeds test-doc.md + sidebar-folder/nested-doc.md]
        └─► spawn('bun', ['run', 'dev'], env: { VITE_PORT, OK_TEST_CONTENT_DIR, NO_COLOR })
                 ↓
         Vite loads hocuspocus-plugin.ts (MODULE SCOPE, once per process)
               ├─► resolveContentConfig()                                     [L70-98]
               ├─► CONTENT_DIR = realpathSync(OK_TEST_CONTENT_DIR)            [L105]
               ├─► acquireServerLock(LOCK_DIR, {port:0, worktreeRoot:PROJECT_ROOT})  [L121 — NB: worktreeRoot is parent repo, not tmpdir]
               ├─► isTestIsolated = Boolean(OK_TEST_CONTENT_DIR)              [L151]  ← THE GATE
               ├─► if (!isTestIsolated) runDevShadowInit(PROJECT_ROOT, …)    [L159-163] ← SKIPPED in tests
               └─► createPersistenceExtension({
                     projectDir: CONTENT_DIR,         [L203; tmpdir when isolated]
                     contentRoot: '',                 [L204]
                     gitEnabled: false,               [L205] ← THE DISABLE
                     shadowRef,                       [L206; shadowRef.current stays undefined]
                     getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git')) [L208; reads parent repo, not tmpdir]
                   })

Tier 1 integration boot (test-harness.ts)
  └─► createTestServer()
        ├─► mkdtempSync + writeFileSync(test-doc.md)                          [L103-112]
        ├─► ensureProjectGit(contentDir)                                      [L119]   ← ALREADY DONE
        ├─► getFreePort() + createServer({contentDir, gitEnabled:false, …})    [L121-129]
        └─► ℹ️ No initShadowRepo call; no shadowRepo option passed; persistence
            never writes WIP refs.

Existing integration test that DOES work end-to-end with shadow
  └─► persistence-fan-out.test.ts:41-90
        ├─► tmpDir = mkdtempSync                                              [L32]
        ├─► projectDir = tmpDir; contentDir = join(tmpDir, 'content')          [L42-43]
        ├─► historyHandle = await initShadowRepo(projectDir)                   [L45]   ← manual opt-in
        └─► createServer({ …, shadowRepo: historyHandle })                    [L47-54] ← gitEnabled defaults to true
```

**Two observations:**

1. The integration harness is **halfway there** already. `ensureProjectGit` is wired (`test-harness.ts:119`). The remaining deltas are (a) call `initShadowRepo(contentDir)` or let `createServer.initAsync` do it, (b) pass `gitEnabled: true`, (c) ensure `contentDir === projectDir` or set `projectDir` explicitly so `refs/wip` lands in the expected place.
2. The Vite dev plugin has a **structural mismatch** under test isolation: `projectDir` becomes `CONTENT_DIR` (tmpdir) in persistence options (`hocuspocus-plugin.ts:203`) — correct for write attribution — but `getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git'))` at line 208 still reads the *parent repo's* HEAD, not the tmpdir. If shadow is enabled per-worker, the branch passed to `refs/wip/<branch>/<writer>` comes from the parent repo (e.g. `main` or whatever the dev has checked out), not the tmpdir's fresh `main`. This is a silent coupling the spec needs to address.

### 2b. Shadow-repo lifecycle (production path)

```
Start
  ensureProjectGit(projectRoot)                    [project-git.ts:43-76]
  initShadowRepo(projectRoot)                      [shadow-repo.ts:82-125]
    ├─ resolveShadowDir(projectRoot)                [core/shadow-repo-layout.ts:95-97 → `.git/open-knowledge`]
    ├─ legacy `.git/openknowledge/` silent rename    [R9 shim L88-95]
    ├─ if (!HEAD exists): mkdir + git init --bare + config [L97-110]
    ├─ sweepLegacyShadowRefs()                       [L115; allowlist-delete legacy writer ids]
    ├─ sweepOrphanedTmpIndexFiles()                  [L119]
    └─ acquireLock(shadowDir, projectRoot)           [shadow-lock.ts:28-68]

Per agent/user write (CRDT transact → persistence.L2 drain)
  commitWip(shadow, writer, contentRoot, message, branch)   [shadow-repo.ts:216-293]
    ├─ read-tree from existing ref (if any)
    ├─ git add <pathspec>  (uses GIT_INDEX_FILE = <gitDir>/index-wip-<writer.id>)
    ├─ write-tree → tree SHA
    ├─ commit-tree <tree> -p <parent> -m <message>  (writer identity → author)
    └─ update-ref refs/wip/<branch>/<writer.id>

External write reconciliation
  applyExternalChange(hocuspocus, docName, content)         [external-change.ts]
    ├─ recordContributor(docName, 'file-system', …)         [contributor-tracker.ts]
    └─ CRDT transact → persistence drain → commitWip → refs/wip/<branch>/file-system

Save Version
  /api/save-version handler                                  [api-extension.ts:4940]
    ├─ saveVersion(history, subject, body, branch)           [shadow-repo.ts]
    │   └─ creates checkpoint ref + tag
    ├─ (optional) commit in parent repo with Co-Authored-By  [api-extension.ts:2344-2438]
    └─ flushPendingGitCommit()

Rollback
  /api/rollback handler                                      [api-extension.ts:2659-2799]
    ├─ read historical content from shadow
    ├─ doc.transact(…, ROLLBACK_ORIGIN)                       [paired:true, skipStoreHooks:false]
    └─ flushPendingGitCommit()

Shutdown
  destroy() phase order (CC8):
    1. stop watchers
    2. drain agent sessions
    3. L1 flush
    4. L2 flush
    5. releaseLock(shadowDir)     [shadow-lock.ts:75-82]
    6. releaseServerLock(lockDir) [server-lock.ts:59-61]  (try/finally)
```

### 2c. Lock topology & concurrency

`shadow-lock` and `server-lock` are **scoped per-directory**. Two workers each with their own tmpdir get two independent lock files at `<tmpdir-w0>/.git/open-knowledge/lock` and `<tmpdir-w1>/.git/open-knowledge/lock` — no cross-worker contention.

However: both locks record `{pid, hostname, ...}`. Under Playwright, each `bun run dev` is a distinct `pid`, so same-host same-pid-idempotent logic (`shadow-lock.ts:44`) does not help; but it does not hurt either because the dirs are distinct.

Risk surface: `hocuspocus-plugin.ts:121` passes `worktreeRoot: PROJECT_ROOT` to `acquireServerLock`. If the test spec enables shadow per-worker, the spec must decide what `worktreeRoot` means — the parent OK repo, the per-worker tmpdir, or both. See §9 open question O1.

### 2d. The `projectDir` vs `contentDir` split

Three bindings drive attribution correctness:

| Binding | Production (non-isolated) | Test isolated today | Production if shadow enabled per-worker |
|---|---|---|---|
| `projectDir` | Parent repo root | tmpdir (`isTestIsolated` branch at `hocuspocus-plugin.ts:203`) | tmpdir (same) |
| `contentDir` | `content.dir` from `.open-knowledge/config.yml` | tmpdir | tmpdir |
| `contentRoot` | rel path from projectDir to contentDir | `''` | `''` (when projectDir === contentDir) |
| `getCurrentBranch()` | `readBranchFromHead(PROJECT_ROOT/.git)` | **PARENT repo's HEAD** (line 208) — known incorrect drift | Must become `readBranchFromHead(CONTENT_DIR/.git)` to match tmpdir |
| `readServerLock.worktreeRoot` | PROJECT_ROOT | PROJECT_ROOT (line 121) — same drift | Should become CONTENT_DIR |

The `persistence-fan-out.test.ts` pattern at line 42 (`projectDir = tmpDir`, `contentDir = join(tmpDir, 'content')`) is a different split — parent-of-content. Both can work; the spec needs to pick one for the harness, and the choice has implications for HEAD-watcher, backlink cache path (`backlink-index.ts:767 → resolve(projectDir, '.open-knowledge', 'cache', branch, 'backlinks.json')`), and the `content-filter` `.gitignore` read path.

### 2e. Open dependency: `BacklinkIndex`'s `projectDir`

`hocuspocus-plugin.ts:195-199` passes `projectDir: PROJECT_ROOT` to `BacklinkIndex` **unconditionally** — not gated on `isTestIsolated`. Same story at line 245 for the API extension's `projectDir: PROJECT_ROOT`. Result: tests that depend on backlink cache writes land them in the OK repo's `.open-knowledge/cache/`, not the tmpdir. The user's seed prompt flagged this as "bug or by-design?" — see §9 open question O3. For the shadow-repo spec specifically, this is ADJACENT: it's a second `projectDir` plumbing inconsistency that the same spec might want to fix in the same sweep.

---

## 3) Entities & terminology (shadow-repo vocabulary the tests must exercise)

### 3a. Writer-ID taxonomy (`packages/core/src/shadow-repo-layout.ts:49-84`)

| Classification | Ref shape | Source | Tested today |
|---|---|---|---|
| `agent` | `agent-<connectionId>` | MCP session (per-session frozen origin) | integration via `persistence-fan-out.test.ts:41-90` |
| `principal` | `principal-<UUID>` | Browser tab principal (D34 dropped `human-` prefix) | **untested** at integration |
| `classified-file-system` | `file-system` | `applyExternalChange` via contributor-tracker | integration `persistence-fan-out.test.ts:127-161` |
| `classified-git-upstream` | `git-upstream` | HEAD-move commit import | **untested** at integration |
| `classified-openknowledge-service` | `openknowledge-service` | Park, service-level fallback | **untested** at integration |
| `unknown` (legacy) | `server`, `human-*`, `upstream` | Pre-D34 writers — swept on startup | unit tests for sweep in `shadow-repo.test.ts` |

### 3b. Subject-prefix action encoding (FR-13)

| Prefix | Action | Writer path |
|---|---|---|
| `wip:` | L2 drain auto-save | any attributed session + `file-system` |
| `checkpoint:` | Save Version | `principal-<UUID>` + co-authored by session writers |
| `reconcile:` | Disk reconcile | `file-system` |
| `import:` | Upstream HEAD-move | `git-upstream` |
| `park:` | Branch-switch park | `openknowledge-service` (D58 per-session deferred) |
| `rollback:` | Rollback apply | triggering session + rollback label |
| `rename:` | Managed rename | triggering session |

### 3c. `ok-actor:` structured commit body (FR-8, D13)

Single JSON line per contributing actor per commit; shape in `shadow-repo-layout.ts` helpers (`formatOkActor`, `parseOkActor`). Fields (`v:1`): `principal`, `agent_session`, `agent_type`, `client_name`, `client_version`, `label`, `display_name`, `color_seed`, `docs[]`, optionally `summaries?[]` (PR #277 adds this).

### 3d. Paired-write origin markers (precedent #1 extension)

Origins that touch BOTH Y.XmlFragment and Y.Text atomically declare `context.paired: true`:

| Origin | Location | Paired? |
|---|---|---|
| `AGENT_WRITE_ORIGIN` (per-session) | `agent-sessions.ts` — frozen at session creation | yes |
| `FILE_WATCHER_ORIGIN` | `external-change.ts` | yes |
| `ROLLBACK_ORIGIN` | `api-extension.ts:151` | yes |
| `MANAGED_RENAME_ORIGIN` | `api-extension.ts` | yes |
| `PARK_SNAPSHOT_ORIGIN` | `standalone.ts:155-162` | yes (read-only, defense-in-depth) |
| `OBSERVER_SYNC_ORIGIN` | `server-observers.ts` | no (self-short-circuits) |

Any new test path that writes via these origins must inherit the identity-based bridge-invariant watcher match in `test-harness.ts:748-752, 805-816`.

### 3e. Lifecycle terms

- **L1 flush / L2 drain:** `persistence.ts:218-223` exports `flushPendingGitCommit` + `waitForPendingCommits`. L1 is Hocuspocus store hook; L2 is the 15s commit debounce.
- **Reconciled base:** `reconciledBaseByBranch` (`persistence.ts:173-207`) — `Map<branch, Map<docName, string>>`; scope switches on branch change.
- **Batch (HEAD watcher):** `setBatchInProgress(true)` gates L1 writes and L2 commits during `BatchBegin`/`BatchEnd` windows.
- **`didGitInit`:** `BootedServer` flag (per the single-mode SPEC) indicating whether `ensureProjectGit` actually ran — consumed by CLI preview-block + Desktop sonner toast.

---

## 4) Patterns (what the repo already does that the spec can inherit)

### 4a. Existing per-worker / per-test isolation patterns

| Pattern | Example | Reusability for this spec |
|---|---|---|
| Kernel-allocated port | `createNetServer(0)` → `.listen(0)` → `address().port` → `.close()` | Used by Tier 1 harness (`test-harness.ts:60-68`), Playwright fixture (`fixtures.ts:124-133`), sync-engine tests. Duplicate helper on both sides — fine. |
| `mkdtempSync(tmpdir(), 'ok-…-')` | `test-harness.ts:106`, `fixtures.ts:201`, `persistence-fan-out.test.ts:32` | Baseline per-worker / per-test |
| `realpathSync` on contentDir | `test-harness.ts:105-106`, `hocuspocus-plugin.ts:105-107` | macOS `/tmp → /private/tmp` resolution; the spec must preserve this so `@parcel/watcher` events match `pathToDocName` |
| `ensureProjectGit(contentDir)` at harness boot | `test-harness.ts:119` | Ready-to-use primitive |
| `initShadowRepo(projectDir)` at test boot | `persistence-fan-out.test.ts:45, 96, 131, 173` | Reference pattern; caller manages `historyHandle` |
| `createServer({ shadowRepo, gitEnabled:default-true })` | `persistence-fan-out.test.ts:47-54` | Reference harness-level opt-in |
| `clearContributors()` in `beforeEach`/`afterEach` | `persistence-fan-out.test.ts:33, 37` | Test-isolation primitive — module-level contributor tracker state |
| `await server.ready` | `test-harness.ts:133`, `persistence-fan-out.test.ts:55` | Waits for file-watcher attach; shadow init if deferred |
| Per-test `crypto.randomUUID()` docName | `test-harness.ts:275` | Zero-coordination multi-test concurrency |
| Graceful kill: SIGTERM → 5s → SIGKILL | `fixtures.ts:182-194` | Lets Vite's close hook run `releaseServerLock` |
| `try/finally` teardown in test body | Documented in root CLAUDE.md "Per-test docName isolation" | Required for `test.concurrent()` correctness |

### 4b. Lock-file patterns the spec inherits

- `acquireProcessLock({lockName, lockDir, metadata})` (`process-lock.ts`) — shared plumbing for `server`, `shadow`, `ui` locks. pid+hostname-guarded; stale replacement; ownership-guarded port update.
- `try/finally` on lock release — `standalone.ts:190-194` and `hocuspocus-plugin.ts:141-143, 278-285`.
- Lock-release-LAST-in-destroy — `standalone.ts` shutdown phases; bracketed `destroy() → releaseShadowLock → releaseServerLock`. Precedent: "Phase 6 runs inside a try/finally so a mid-shutdown throw still releases the lock" (root CLAUDE.md).

### 4c. External-change reconciliation pattern

`external-change.ts:applyExternalChange(hocuspocus, docName, content)`:
1. Records contributor via `contributor-tracker` with writer ID `file-system`
2. Opens direct connection to the doc
3. `transact(…, FILE_WATCHER_ORIGIN)` — paired-write; bridge invariant watcher fires
4. Persistence drain → `commitWip(shadow, FILE_SYSTEM_WRITER, contentRoot, 'reconcile: …', branch)`

`persistence-fan-out.test.ts:127-161` is the reference: assert ref exists at `refs/wip/main/file-system`, parse subject to verify `reconcile:` prefix.

### 4d. The dev-plugin shim pattern for error surfacing

`dev-shadow-init.ts` extracts `runDevShadowInit` as a pure, injectable helper so the fail-fast branch (`ProjectGitInitError` → `exit(1)`) and the degraded branch (other errors → warn) can be unit-tested. The spec can reuse this helper when it wires shadow into the Playwright path — or extend the helper to accept the harness's tmpdir as projectRoot.

### 4e. Structural quiescence gate

`awaitDocQuiescence(doc, {idleTicks: 2, timeoutMs: 2000})` (`test-harness.ts:400-431`) — waits for settle after observer cascades. Spec must decide whether shadow-L2 drain needs its own gate (the harness already exports `persistence.flushPendingGitCommit` + `persistence.waitForPendingCommits` on ServerInstance, usable after boot).

---

## 5) Personas / audiences (feature owners currently blocked)

| Persona | Project / PR | What they can't automate today |
|---|---|---|
| Miles Kaming-Thanassi (server package owner) | PR #277 `feat/agent-change-notes` — summaries on MCP mutation tools | Cannot E2E-verify that `wip:` commit subjects gain the summary suffix ("— added auth design outline"); verification is manual per the PR's "Test plan" section with checkbox left un-checked for integration tier |
| Miles Kaming-Thanassi | PR #268 `feat/agent-write-summaries` — TimelinePanel collapsible bullets | TimelinePanel renders from `ok-contributors:` + summaries; E2E that drives a real MCP `write_document` → shadow commit → TimelinePanel render is currently impossible at Playwright tier |
| Mike (graph-demo work) | PR #186 `feat/graph-demo: Stage 6 agent attribution + Stage 7 time-travel` | Attribution halos on graph nodes depend on `agent-flash`, `agent-effects`, AND shadow-commit history for time-travel. Only the first two survive in today's Playwright harness. |
| Future contributors | Any PR that touches `packages/server/src/server-observers.ts`, `packages/core/src/bridge/**` — would benefit from validating the shadow commit shape as part of the bridge fuzz assertion chain | Can't; `measure:fuzz` runs the bridge but the shadow side is orthogonal ad-hoc. |
| P4 from attribution-foundation SPEC (developer investigating a bug) | `git log --all --oneline refs/wip/main/` journey is the canonical debugging tool | No automated regression test verifies that this log remains legible after future changes |
| P2 from attribution-foundation SPEC (AI agent self-correcting) | Per-session undo must produce a coherent history refs trail | Integration has `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` but verifies only the bridge side, not the shadow commit |
| CI signal quality (SPEC 2026-04-19) | G1 ≥95% PR-tier green rate | Adding per-worker shadow work increases risk of new flake classes (git subprocess timing, lock contention, FS races). Spec must meet this bar. |

---

## 6) 3P landscape (narrow — infra, not product)

Per [Playwright fixture-scope docs](https://playwright.dev/docs/test-fixtures), the `{scope:'worker'}` tuple is the first-class API for per-worker lifecycle fixtures. The existing OK fixture (`fixtures.ts:196-245`) already uses it correctly per [Serenity/JS on worker-scope actors](https://serenity-js.org/blog/playwright-reporting-and-worker-scope-actors/). The canonical guidance ([DEV Community "Scaling Your Playwright Tests"](https://dev.to/gustavomeilus/scaling-your-playwright-tests-a-fixture-for-multi-user-multi-context-worlds-53i4), [TestDino](https://testdino.com/blog/playwright-fixtures/)) is: **"each parallel worker should manage its own set of resources to avoid collisions"** and **"use worker scope when the shared resource is either immutable during tests, or you have an explicit reset mechanism."**

Prior-art projects that run per-worker git-backed services:

- **React Router v7 `integration/`** — the closest precedent per the OK research report at `reports/e2e-isolation-and-broadcaster-lifecycle/REPORT.md` — uses `get-port` + `cross-spawn` per-*test* (finer granularity than per-worker) with `.tmp/integration/<unique>/` dirs. No shadow-git analogue; React Router's integration tests spawn pure app servers.
- **Hocuspocus own tests** (from the OK research report, `tests/utils/newHocuspocus.ts`) — per-test port 0 allocation, no persistence layer on disk to isolate.
- **Outline** — Jest with per-test `TestServer` at port 0; shares a Postgres DB per-worker via schema-per-worker pattern (referenced in e2e-isolation report).
- **Cloudflare Workers testing** ([vitest-integration docs](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/)) — per-worker KV / D1 namespace; analogous to "per-worker shadow repo" at a different primitive layer.

None of the surveyed consumers couple Playwright per-worker isolation with a per-worker git-backed service specifically. **Adopting this is a new position — derivable from well-precedented primitives (`{scope:'worker'}` + kernel-allocated port + per-worker tmpdir) but with no drop-in precedent for "per-worker bare git repo managing refs/wip/<branch>/<writer-id>."** (Same pattern observation the e2e-isolation report makes for Hocuspocus generally.)

Sources:
- [Fixtures | Playwright](https://playwright.dev/docs/test-fixtures)
- [Worker-scope actors in Playwright Test | Serenity/JS](https://serenity-js.org/blog/playwright-reporting-and-worker-scope-actors/)
- [Scaling Your Playwright Tests | DEV Community](https://dev.to/gustavomeilus/scaling-your-playwright-tests-a-fixture-for-multi-user-multi-context-worlds-53i4)
- [Isolation and concurrency | Cloudflare Workers Vitest](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/)
- [Parallel test execution issues | OneUptime](https://oneuptime.com/blog/post/2026-01-24-parallel-test-execution-issues/view)

---

## 7) Prior research (mandatory reads + related)

### 7a. `reports/e2e-isolation-and-broadcaster-lifecycle/REPORT.md` (2026-04-18)

- **Track A recommendation:** per-worker Option A (N child Vite processes per `{scope:'worker'}` fixture + `getFreePort()` + per-worker tmpdirs). **Already shipped** — the fixture file at `_helpers/fixtures.ts` is the implementation.
- Evidence notes (`evidence/a1-playwright-fixture-mechanics.md`) codify the tuple syntax and the `workerInfo.workerIndex` usage that the existing fixture inherits.
- Cost analysis for Option A (4-worker CI baseline): ~8s one-time cold-start, ~200-320 MB memory. Adding `ensureProjectGit` per worker is ~50-200 ms per SPEC 2026-04-21-shadow-repo-single-mode §A2 evidence; adding `initShadowRepo` is another subprocess pair — under 500 ms in aggregate.
- Track B (broadcaster lifecycle) is orthogonal to this spec — noted only as a co-evolving subsystem.

### 7b. `specs/2026-04-21-shadow-repo-single-mode/SPEC.md` (2026-04-21, Andrew)

- **R2:** Auto-`git init` via `ensureProjectGit` runs in `bootServer.autoInitFn` BEFORE HTTP listen (D12 LOCKED).
- **Q3 (closed):** Tier 1 harness creates fresh tmpDir with no `.git/`; **"Every test will trigger auto-`git init` (~100-200 ms × ~50 tests = ~5-10s overhead). No harness change needed."** — This is the origin of the `ensureProjectGit(contentDir)` call at `test-harness.ts:119`.
- R5/R5b: disclosure paths — not directly relevant here but note that enabling shadow in tests re-triggers auto-init paths that were tuned for human UX (sonner toast, preview-block) and those must remain silent in Playwright.
- §16 SCOPE (Vite dev plugin — F6): *"`packages/app/src/server/hocuspocus-plugin.ts:144` — call `ensureProjectGit(PROJECT_ROOT)` before `initShadowRepo`; on throw, surface via the existing `[dev]` warn path + `process.exit(1)` (no degraded bypass for dev server)."* This is exactly the code path today's `isTestIsolated` branch skips.
- §16 EXCLUDE: *"Do not modify persistence, observers, HEAD watcher runtime logic, agent-sessions, or any CRDT code paths."* Spec author should preserve this constraint.
- NG6: worktree handling is owned by a separate spec.

### 7c. `specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md` (2026-04-18, Nick)

- G4: "**History ref semantic clarity** — `git log refs/wip/<branch>/<writer>` is a legible per-actor history." Every test that exercises attribution should verify the log shape — which is only possible with a live shadow.
- FR-5 attribution completeness sweep: 12 handlers must thread `extractAgentIdentity`; meta-test lives at `packages/app/tests/integration/attribution-sweep-coverage.test.ts` (static registry scan). This meta-test runs **without** shadow today; a full integration assertion that also verifies the downstream ref would require shadow.
- FR-7 per-writer fan-out (tested at `persistence-fan-out.test.ts`) — already shadow-aware via explicit opt-in. The spec's job is to make this the default for any test that needs it.
- §8.4 evidence pointer `bug-d-mechanism.md` — this is a paired-write invariant the shadow-touching tests must preserve.

### 7d. `specs/2026-04-19-ci-signal-quality/SPEC.md` (2026-04-19)

- **G1: PR-tier green rate ≥95% on correct code.** Any shadow-per-worker plumbing must meet this bar; flake tolerance for new git-subprocess work is zero.
- **NG6: architectural residual is NOT a CI signal.** Adding shadow to Playwright tier risks introducing a new residual (git-FS-race, lock-collision). Spec must enumerate the new failure modes and prove they are deterministic.
- **Tier 1 (every PR) scope:** unit, integration (bridge-matrix), conversion, fidelity. Adding "shadow-aware integration" to this bucket needs calibration.
- **Tier 2 / 3 (on demand):** `workflow_dispatch` only. If shadow-per-worker tests are too slow for Tier 1, they could live here — but that defeats the "structural coverage" motivation.

### 7e. `specs/2026-04-10-document-timeline-rollback/SPEC.md` (Miles)

- G1-G3: chronological timeline + per-writer attribution + content preview. Surfaces that exist but lack E2E.
- "Append-only rollback: 'Restore to version X' reads historical content from shadow → applies to Y.Doc via CRDT transact, creating a new forward entry in the timeline." — exactly the end-to-end that today's Playwright can't reach.

### 7f. Root `CLAUDE.md` "Shadow repo & branch runtime" §

Key directive for the spec: the shadow is **single-mode** (`.git/open-knowledge/`), writer-ID-classified, branch-scoped. Per-session park deferred to `openknowledge-service` (D58). All this is inherited from SPEC 2026-04-21-shadow-repo-single-mode.

### 7g. Related but ADJACENT

- `specs/2026-04-08-external-write-reconciliation/SPEC.md` — parent spec for the shadow substrate. Important for `file-system` writer tests.
- `specs/2026-04-10-test-isolation-parallelism/SPEC.md` — originated the per-test docName pattern via `crypto.randomUUID()`.
- `reports/git-directory-nesting-shadow-repo/REPORT.md` — confirms `.git/open-knowledge/` is safe from git maintenance (`gc`, `fsck`, `repack`) and invisible to transport.
- `reports/claude-code-worktree-git-isolation/` — adjacent but worktree-focused (NG6 of the single-mode spec).

---

## 8) Current state (precise: what fails at each tier today)

### 8a. Playwright tier (`packages/app/tests/stress/*.e2e.ts`)

- ✅ `bun run dev` spawns per worker with isolated port + tmpdir (`fixtures.ts`)
- ✅ `OK_TEST_CONTENT_DIR` env var propagates
- ✅ `VITE_PORT` propagates
- ❌ `isTestIsolated === true` → `runDevShadowInit` NOT called (`hocuspocus-plugin.ts:159`)
- ❌ `isTestIsolated === true` → `gitEnabled: false` (`hocuspocus-plugin.ts:205`)
- ❌ `shadowRef.current` remains `undefined` forever — `persistence.ts:261-263` short-circuits commits
- ❌ `getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git'))` reads the OK repo's HEAD (`hocuspocus-plugin.ts:208`) — silent coupling
- ❌ `BacklinkIndex({ projectDir: PROJECT_ROOT, … })` writes cache to OK repo path (`hocuspocus-plugin.ts:196`) — silent coupling
- **Result:** zero Playwright coverage of TimelinePanel, Save Version, Rollback, rescue buffers, branch-switch UX, classified-writer attribution visible in git log, external-change reconciliation end-to-end.

### 8b. Tier 1 integration (`packages/app/tests/integration/*.test.ts`)

- ✅ `ensureProjectGit(contentDir)` at `test-harness.ts:119`
- ❌ `createServer({ gitEnabled: false })` at line 127
- ❌ no `initShadowRepo` call; no `shadowRepo` option passed
- ❌ `shadowRef.current` remains `undefined` — same short-circuit as Playwright
- ✅ `persistence-fan-out.test.ts` bypasses the harness entirely and manually calls `initShadowRepo(projectDir)` + passes `shadowRepo`. It demonstrates the working pattern.
- ❌ `symlink-alias.test.ts:44` and `provider-pool-reconnect.test.ts:74` explicitly opt out of git
- **Result:** shadow-dependent integration tests must fork their own harness; 18 integration tests (everything imported via `test-harness.ts`) cannot exercise shadow even when the test would benefit.

### 8c. Server unit tier (`packages/server/src/*.test.ts`)

- ✅ `persistence-fan-out.test.ts` (server-local sibling) exercises shadow
- ✅ `shadow-repo.test.ts`, `save-version.test.ts`, `timeline-query.test.ts`, `shadow-branch-gc.test.ts`, `standalone.test.ts` exercise it via explicit `initShadowRepo` calls
- ✅ `boot.test.ts` passes `gitEnabled: false` because it's testing the boot composition, not persistence
- **Result:** this is the tier with mature shadow coverage; the spec should inherit the patterns rather than invent.

### 8d. What's consistently enforced

- Per-tier writer taxonomy regex (`WRITER_ID_RE` in `core/shadow-repo-layout.ts:83-84`) validated at unit
- Subject-prefix + `ok-actor:` JSON body validated at unit (`shadow-repo.test.ts`, `shadow-repo-layout.test.ts`)
- Server lock + shadow lock per-directory concurrency (unit via `process-lock.test.ts`, `shadow-lock.test.ts`, `server-lock.test.ts`)
- `ensureProjectGit` fail-fast on missing `git` binary (unit via `project-git.test.ts`)

### 8e. Infrastructure preconditions that already hold

- `bun install` from repo root (root CLAUDE.md "Worktree isolation" §) — already part of CI
- `git` binary on PATH (A1 assumption in SPEC 2026-04-21, verified for all supported platforms)
- Kernel-allocated port primitive duplicated in both harnesses (acceptable)
- `mkdtempSync(tmpdir())` supported on macOS / Linux CI runners
- `ubuntu-64gb` CI runner has headroom for `workers=4 × (Vite + Hocuspocus + Chromium)` per `playwright.config.ts:54-72`. Adding per-worker `git init` subprocess: ~50-200 ms one-shot × 4 workers; per-drain `git commit-tree`: ~10-30 ms per attributed write.

---

## 9) Unresolved / adjacent

### O1. Lock `worktreeRoot` semantics for per-worker Playwright

`hocuspocus-plugin.ts:121` passes `worktreeRoot: PROJECT_ROOT` to `acquireServerLock` — this is the OK repo, not the tmpdir. If shadow is enabled per-worker, is `worktreeRoot` meant to identify the shadow's parent repo (tmpdir) or the server process's run location (OK repo)? The `process-lock` metadata is diagnostic, not load-bearing for correctness — but diagnostic drift between test and prod obscures triage. **UNRESOLVED**: Spec must pick, and note the downstream expectation in `readServerLock`'s consumers.

### O2. Tier choice — Playwright only, or also Tier 1 integration?

The user's seed explicitly frames this as the open question. Both tiers have the same `gitEnabled:false` disable, but the cost/benefit differ:

- **Playwright-only:** Fixes the E2E coverage gap the user names (timeline, save-version, rollback, branch-switch UX). `test-harness.ts` stays unchanged, so 18 non-shadow integration tests don't pay the cost.
- **Both:** More consistent "test env mirrors prod" invariant. Unlocks shadow assertions inside Tier 1 bridge-matrix / C-series tests (e.g., "multi-client concurrent writes produce N distinct `refs/wip/<branch>/agent-<connId>` refs"). Costs ~5-10s added to every integration run per SPEC 2026-04-21 Q3 estimate — already measured and accepted by Andrew.

Note: the /tdd skill (loaded by /spec per caller directive) flags `gitEnabled:false` as **mocking an internal collaborator** — an anti-pattern because shadow is an OK-owned module, not an external dependency. Arguments for both-tiers:
1. `persistence-fan-out.test.ts` already bypasses the harness to test shadow — duplicating the boot sequence is friction signal that the harness is the wrong shape.
2. `test-harness.ts:114-118` comment says "every fresh tmpDir gets a real .git/ so the single-mode shadow-repo layout in US-003 can locate the shadow" — suggesting the author expected shadow to follow from `.git/` but stopped short of wiring it.

Arguments for Playwright-only:
1. The SPEC 2026-04-19 CI signal quality stance: any new flake class at Tier 1 directly threatens the ≥95% green-rate bar. Playwright already has `failOnFlakyTests:false` + retry policy, absorbing new infra flake.
2. The 18 non-shadow integration tests don't need it — paying the cost universally is waste.

**ADJACENT, DIRECTED to spec loop:** Recommend "both-tiers as default, with opt-out `{ skipShadow: true }` flag for tests that deliberately want to skip" rather than "Playwright-only." This preserves the tdd principle (don't mock collaborators) while giving a narrow escape hatch. Locking this direction is the spec's call.

### O3. `BacklinkIndex` hardcoded `projectDir: PROJECT_ROOT` under isolation

`hocuspocus-plugin.ts:195-199` and `api-extension.ts` wiring at line 250 both pass `projectDir: PROJECT_ROOT` unconditionally — not gated on `isTestIsolated`. Under Playwright, the backlink cache file at `<PROJECT_ROOT>/.open-knowledge/cache/main/backlinks.json` gets written by **every worker** concurrently. Possible failure modes:
- Lost-update race between workers
- Worker A's test writes cache that worker B reads as "existing state"
- Spurious diffs in the OK repo that developers see as "modified" in status checks

Same pattern at `backlink-index.ts:767` where `this.projectDir` is read without test-isolation awareness.

**UNRESOLVED** — the seed prompt explicitly flagged this as "bug or by-design?" The shadow-per-worker spec is the natural place to fix it because it's the sibling plumbing inconsistency. Flag: **spec might widen scope to include this**, or might surface as ADJACENT and leave for follow-up. Evidence direction required.

### O4. Intersection with PR #270 (editor asset + embed surface)

PR #270 ships `upload-streaming.ts` + `cleanupOrphanUploadTempfiles()` wired in `standalone.ts` boot. The tempfile location `<contentDir>/.open-knowledge/tmp/upload-<uuid>` is per-content-dir — per-worker under isolation. **No conflict with shadow per-worker.** But: PR #270's streaming refactor adds a second process-scope boot-time side effect (`cleanupOrphanUploadTempfiles`). If the spec adds `initShadowRepo` to the Playwright path, ordering matters: both run before HTTP listen, shadow should run before tempfile cleanup (shadow-init's `acquireLock` is the hard-fail path).

**ADJACENT** — ordering discipline to preserve; not a recommendation to absorb PR #270's work.

### O5. Intersection with PR #270's surrounding "unify dev-plugin + createServer" follow-on (explicitly out of scope)

Per caller directive: do NOT recommend absorbing. Surface the touch points:

- `hocuspocus-plugin.ts` has module-level state (contentFilter, backlinkIndex, persistence, hocuspocus at lines 170-176) — these live outside `createServer` composition. A unify refactor would hoist them inside. When that refactor lands, the `isTestIsolated` gate becomes a one-line `shadowRepo: isTestIsolated ? null : historyHandle` option to `createServer`.
- Today the spec's `hocuspocus-plugin.ts:151-163` gate is the ONLY thing that splits dev-plugin behavior from `createServer`. A "unify" PR would delete the duplication entirely.
- **The spec should not block on unification.** Patching both paths (dev-plugin gate + Tier 1 harness) now is strictly less than a unified refactor later; both cleanly absorb into one `gitEnabled: !isTestIsolated ? …` argument.

### O6. HEAD-watcher under test isolation

`standalone.ts:1149-1290` wires HEAD-watcher callbacks (park on BatchBegin, reconcile/restore on BatchEnd). In the Vite plugin, `hocuspocus-plugin.ts:208` hardcodes `getCurrentBranch: () => readBranchFromHead(resolve(PROJECT_ROOT, '.git'))` — reading the parent OK repo under isolation. Enabling shadow per-worker without fixing this silently branches WIP refs under the **OK repo's** current branch name (e.g. `feat/foo`), not the tmpdir's fresh `main`.

Note: the HEAD watcher itself likely doesn't attach to the tmpdir's `.git/HEAD` under isolation (one of the known test-isolation behaviors), so the concern is narrow: `getCurrentBranch()` return value. Either pass `contentDir/.git` or pin to `'main'` in test path. **UNRESOLVED — spec must settle.**

### O7. Test isolation for the `__system__` doc + CC1 broadcast

Shadow writes are attributed per-doc; `__system__` is pseudo-doc (skipped by `isSystemDoc()` everywhere in the shadow path). The new tests will exercise `file-system` writer paths that also fire CC1 broadcasts. If spec absorbs any coverage of branch-switch UX, CC1 fires on `backlinks` + `graph` channels during reconciliation (`hocuspocus-plugin.ts:541-562`). Confirm the broadcaster lifecycle (e2e-isolation report Track B) is unaffected. **ADJACENT — likely no-op but requires spec confirmation.**

### O8. Rename shim (R9 in single-mode SPEC)

`initShadowRepo` silently renames legacy `.git/openknowledge/` → `.git/open-knowledge/` on startup (R9 shim). Under per-worker Playwright, `mkdtempSync` produces a fresh tmpdir with no `.git/` — legacy path can never exist. **Non-concern for new test harness, but** if the spec also expands Tier 1 integration to exercise shadow, and the harness ever allowed reuse of an existing contentDir (`test-harness.ts:86-92` `keepContentDir` flag), the shim could fire. **Defensive note for spec.**

### O9. Contributor-tracker module state

`persistence-fan-out.test.ts:33, 37` calls `clearContributors()` in before/afterEach. This is module-level state in `contributor-tracker.ts`. Under Playwright with 4 workers × 4 separate processes, each process has its own module state — no cross-process collision. **Non-issue for the new Playwright path.** At Tier 1 integration the harness runs in-process; if the spec extends to Tier 1, every test that enables shadow must call `clearContributors()` on setup/teardown or the harness must do it automatically.

### O10. Intersection with PR #277 (agent change-notes) and PR #268 (agent-write-summaries)

Both PRs add `summary?: string` to MCP tools → shadow commit subject + `ok-actor:` body. Neither currently has E2E coverage; both list "Integration test for multi-call drain → multi-bullet commit body (deferred)" as unchecked. The shadow-per-worker spec directly unblocks both. **Spec should note them as primary consumers** of the new harness capability.

### O11. What tests would actually get written first?

Not part of spec scope, but useful for calibration. Candidates ordered by risk:
- **T1 (smallest):** "Agent write → `refs/wip/main/agent-<connId>` exists with expected subject" — clone of `persistence-fan-out.test.ts:41-90` but via the shared harness.
- **T2:** "Save Version → `refs/checkpoints/v1` + parent-repo commit + tag" — verifies the full `/api/save-version` pipeline.
- **T3:** "External disk write → `refs/wip/main/file-system` commit with `reconcile:` subject" — extension of existing unit coverage.
- **T4 (highest signal):** "Rollback → timeline gains a `rollback:` commit + CRDT state matches historical point" — the end-to-end the TimelinePanel / attribution specs were designed for.
- **T5 (Playwright-unique):** TimelinePanel UI rendering — click Save Version, verify timeline row appears, with writer display name "Claude (a4f2)."

**Not a spec deliverable, but the spec's acceptance criteria should probably anchor on T1-T3 to prove the harness works; T4-T5 are downstream work.**

---

## 10) Meta

- **Channels tapped:** web (2 probes, narrow), repo source code (native Read/Grep because `.ts` is source-code — per root CLAUDE.md "Source code and everything else" policy), repo specs + reports (via native Read because this is a worldmodel + we're reading files under `/Users/edwingomezcuellar/projects/open-knowledge/` as reference material, not as in-scope OK documents — the specs are OK markdown but also source artifacts; the native reads are justified by task depth, not an escape hatch), Linear (1 query — no relevant matches).
- **Channels not tapped:** `~/.claude/oss-repos/` — surveyed in `reports/e2e-isolation-and-broadcaster-lifecycle/REPORT.md` already; no new OSS precedent expected for "per-worker bare git repo under Playwright."
- **Confidence:** HIGH on §1-§5, §8; MEDIUM on §6 (landscape) and §9 (open questions — evidence-based but decisions remain for the spec loop).
- **Selective abstraction:** for O2 the "both tiers with opt-out" direction is a suggestion pitched at the spec loop, not a recommendation — written as "recommend" per caller directive, but tier choice remains the spec's decision.
