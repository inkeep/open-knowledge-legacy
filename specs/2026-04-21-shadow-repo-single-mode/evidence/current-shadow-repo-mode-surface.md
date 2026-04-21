---
name: current-shadow-repo-mode-surface
description: Full inventory of runtime + test code that references the integrated/standalone mode split; blast-radius for W1 (removal).
sources:
  - packages/core/src/shadow-repo-layout.ts
  - packages/server/src/shadow-repo.ts
  - packages/server/src/head-watcher.ts
  - packages/server/src/standalone.ts
  - packages/cli/src/content/shadow-log.ts
  - packages/cli/src/bash/mtime-scan.ts
  - packages/core/src/shadow-repo-layout.test.ts
  - packages/server/src/shadow-repo.test.ts
  - packages/server/src/head-watcher.test.ts
  - packages/app/tests/integration/test-harness.ts
---
# Current shadow-repo dual-mode surface

Inventory used to validate the R1 scope (remove standalone) and confirm the blast radius for `resolveShadowDir` signature simplification (R3).

## 1. Runtime references to mode split

### `packages/core/src/shadow-repo-layout.ts`

- Line 5-6: doc-comment mentions both modes
- Line 54: `export type ShadowRepoMode = 'integrated' | 'standalone';`
- Line 59: `ResolvedShadowDir.mode: ShadowRepoMode`
- Line 70: doc-comment mentions standalone fallback
- Line 72-83: `resolveShadowDir` body — branches on `statSync('<projectRoot>/.git').isDirectory()`
- Line 82: standalone path `resolve(abs, '.openknowledge')`
- Line 93: internal consumer (`getShadowRepoPath`) destructures `.path`

After R1+R3: type deleted; `resolveShadowDir` returns `string` unconditionally = `resolve(projectRoot, '.git/open-knowledge')`.

### `packages/server/src/shadow-repo.ts`

- Line 10, 64, 86-100: `.gitignore` auto-append when `mode === 'standalone'`. Entire standalone branch deleted.
- Line 69: `const { path: shadowDir, mode } = resolveShadowDir(projectRoot);` → becomes `const shadowDir = resolveShadowDir(projectRoot);`.

### `packages/server/src/head-watcher.ts`

- Line 132 (doc-comment): `If projectGitDir is null (standalone mode), watcher no-ops.` — refresh comment (remove "(standalone mode)").
- `resolveGitDir` at line 55-73 handles both `.git` as directory AND `.git` as file. Worktree semantics are out of scope for this spec (NG6).

Post-change: the "null" case still exists transiently (between `ensureProjectGit` detecting no `.git/` and the subprocess completing). `resolveGitDir` is called AFTER `ensureProjectGit` so this window is closed in the happy path. Failure path: if `git init` fails, `createServer` should exit before wiring the HEAD watcher.

### `packages/cli/src/bash/mtime-scan.ts`

- Line 14 (doc-comment): lists `.openknowledge/` alongside `.git/` and `.open-knowledge/` as directories to skip during mtime scans.
- This is an independent filename exclusion list; not part of the mode split. It can safely drop `.openknowledge/` from the list since nothing creates it anymore (though leaving it costs nothing).

### `packages/server/src/standalone.ts`

- Line 48: imports `initShadowRepo`
- Line 871-884: calls `initShadowRepo(projectDir)` inside `initAsync()`
- Line 895-901: fallback reinit on corruption check
- NO direct reference to mode; standalone.ts does not branch on shadow location.

Wiring (D12 LOCKED): `ensureProjectGit(projectDir)` runs in `bootServer`'s pre-listen hook (`BootServerOptions.ensureProjectGitFn`) BEFORE `createServer()` is invoked and BEFORE `httpServer.listen()` binds. On failure, `ensureProjectGitFn` throws `ProjectGitInitError`; `bootServer` propagates the error out unswallowed (CLI's Commander action + Desktop's utility `setupUtility` error-IPC each surface R6). No degraded-mode fallback — see SPEC §10 D12 and §16 SCOPE. The Vite dev plugin invokes `ensureProjectGit(PROJECT_ROOT)` directly (not via `bootServer`) and on `ProjectGitInitError` logs `[dev] ensureProjectGit failed` + calls `process.exit(1)`. The integration test harness (`createTestServer`) calls `ensureProjectGit(contentDir)` before `createServer(...)` so every tmpdir-scoped test exercises the production auto-init path.

## 2. Test references to mode split

### `packages/core/src/shadow-repo-layout.test.ts`

- Line 180-186: "prefers integrated mode when project has its own .git/" — adapt to "always resolves to .git/open-knowledge/"
- Line 187-192: "falls back to standalone mode when no project .git/ exists" — DELETE (violates R1)
- Line 194-201: "both exist" test case — refer to evidence check; standalone assertion at line 199-200 lives INSIDE this test, not a separate standalone test. Keep the integrated assertion; drop the `.openknowledge` assertion.
- Line 206: "returns null when no shadow repo exists" — test stays but with `.git/open-knowledge/` path

### `packages/server/src/shadow-repo.test.ts`

- Line 59: "does not modify .gitignore in integrated mode" — merge into single test "does not modify .gitignore"
- Line 73-85: "creates shadow at .openknowledge/ when no project .git/ exists (standalone)" — DELETE (block ends earlier than the prior 73-91 claim)
- Line 502+: `describe('saveVersion — standalone mode')` — DELETE entire block

### `packages/server/src/head-watcher.test.ts`

- Line 40: "returns null when no .git exists (standalone mode)" — test PROBABLY stays (it tests `resolveGitDir` returning null on no `.git`), but the "(standalone mode)" label becomes misleading. Rename to "returns null when no .git exists".

### `packages/app/tests/integration/test-harness.ts`

- Line 100-108: `contentDir = realpathSync(mkdtempSync(...))` — fresh tmpDir; NO `.git/` created.
- Every integration test will trigger auto-`git init` (R2). Cost: \~100-200ms per test × \~50 tests = \~5-10s wall-clock overhead.
- Recommendation: accept the cost; it validates the production auto-init code path on every run. No harness change needed.

## 3. CLI read path (`resolveShadowDir` / `getShadowRepoPath` consumers)

- `packages/cli/src/content/shadow-log.ts:145` — calls `getShadowRepoPath(projectDir)` which returns `string | null`. Return shape unchanged; only the internal path computation becomes trivial.

## 4. Desktop utility process (Q2 answer)

- `packages/desktop/src/utility/server-entry.ts:179` calls `bootServer(...)` with `skipAutoInit: false`.
- `BootedServer.didAutoInit` is read by CLI for content-scaffolding disclosure; Desktop currently does NOT relay this to the main process. The `UtilityReadyMessage` IPC shape carries only `{ port, apiOrigin }`.
- R5 (preview-block disclosure of git-init) has no current Desktop surface. Three options for Desktop disclosure:
  - (a) Extend `UtilityReadyMessage` with `didGitInit: boolean`; main process shows a toast/log-drawer entry. Requires `ipc-events.ts` / handler update (D14 IPC discipline).
  - (b) Desktop logs bracket-prefixed `[project-git]` via stdout/stderr; Desktop captures it in the log drawer (if log drawer exists; requires verification).
  - (c) Scope R5 to CLI only. Desktop users accept silent auto-init.

This surfaces as new Q5.

## 5. Worktree handling — out of scope

- All worktree-related concerns (boot regression, ref-namespace semantics, commondir sharing) are owned by a separate spec (NG6).
- `ensureProjectGit` uses plain `existsSync(join(projectRoot, '.git'))` — D6 is the minimal form, no worktree-specific classification.

## 6. Blast radius summary

- **Runtime source files to edit:** `shadow-repo-layout.ts`, `shadow-repo.ts`, `standalone.ts`, `boot.ts`, `hocuspocus-plugin.ts` (Vite dev plugin — audit F6), `enrichment.ts`, `shadow-log.ts`, `mtime-scan.ts`, `head-watcher.ts` (doc-comment).
- **New source file:** `packages/server/src/project-git.ts` (`ensureProjectGit`).
- **CLI source files:** `start.ts`, `init.ts`, `mcp.ts` (doc-comment for D13 transitive).
- **Desktop source files:** `server-entry.ts`, `window-manager.ts`.
- **Test files to edit:** `shadow-repo-layout.test.ts`, `shadow-repo.test.ts`, `head-watcher.test.ts` (cosmetic).
- **Docs:** root `CLAUDE.md`, `AGENTS.md`, `packages/*/README.md`, `docs/content/internals/service-topology.mdx`, root `.gitignore`.
- **Test harness:** no change required; auto-init fires once per test.
- **Consumers (CLI):** `shadow-log.ts` unchanged in behavior; `getShadowRepoPath` return type is unchanged.
- **Consumers (Desktop):** `server-entry.ts` gains `didGitInit` field (D10).

