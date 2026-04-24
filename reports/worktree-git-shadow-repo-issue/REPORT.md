# Shadow-repo init fails inside git worktrees (ENOTDIR on `.git/open-knowledge`)

**Status:** Investigation brief — not yet a spec. Surfaced during the 2026-04-23 OpenTelemetry PR (#36) rebase when every `bun run dev` in the worktree logged `ENOTDIR: not a directory, mkdir '.git/open-knowledge'`. Documents what's broken, why, what does+doesn't break as a result, and four candidate fixes. Pick one up in a fresh session.

## 1) The failure

```
[dev] Shadow repo init failed (timeline features unavailable):
  Error: ENOTDIR: not a directory, mkdir '/Users/.../worktrees/otel-instrumentation-spec/.git/open-knowledge'
      errno: -20, code: 'ENOTDIR', syscall: 'mkdir',
      path: '/Users/.../worktrees/otel-instrumentation-spec/.git/open-knowledge'
  }
```

Fires every time `bun run dev` (or any `createServer()` / `bootServer()` call) runs inside a git worktree directory. The main repo checkout works fine. Same code path — different on-disk shape at `.git/`.

## 2) The cause

Git worktrees (`git worktree add .claude/worktrees/X`) create the worktree with a **`.git` pointer file**, not a `.git/` directory. The file's contents are a single line:

```
gitdir: /absolute/path/to/main-repo/.git/worktrees/X
```

The real per-worktree state lives in the main repo's `.git/worktrees/X/` subtree. This is git's design (`man gitrepository-layout`) — see `.git` vs `.git/worktrees/<name>/` dichotomy.

The shadow-repo init code in `packages/server/src/shadow-repo.ts` assumes `.git/` is a directory:

```ts
// Line ~100 (post-migration)
const shadowDir = resolveShadowDir(projectRoot);  // → <projectRoot>/.git/open-knowledge
// ...
tracedMkdirSync(shadowDir, { recursive: true });
// ↑ throws ENOTDIR because projectRoot/.git is a regular file, not a directory
```

`mkdir -p` on a path whose parent is a regular file fails with `ENOTDIR`. `recursive: true` doesn't save you — recursion stops at the first non-directory.

Subsequent fallback attempts (the legacy project-repo commit path inside `persistence.ts`'s `commitToWipRef`) also fail for the same reason. Anything that tries to write into `<worktreeRoot>/.git/` inside a worktree hits this wall:

```
fatal: Unable to create '/Users/.../otel-instrumentation-spec/.git/index-wip.lock': Not a directory
```

## 3) Blast radius — what actually breaks

**Broken inside worktrees:**
- Shadow-repo initialization (the entire journal at `<projectRoot>/.git/open-knowledge/`)
- Per-writer WIP refs (`refs/wip/<branch>/<writer>`)
- Timeline features (restore, version history, save-version)
- The legacy project-repo commit fallback in `persistence.ts:commitToWipRef` (uses `.git/index-wip`)
- OpenTelemetry traces for `shadow.commitWip` / `shadow.commitWipFromTree` spans — they never fire because the subsystem never initializes

**Unaffected:**
- In-memory Y.Doc collaboration + CRDT sync (no git dependency)
- Disk persistence — `fs.writeFile` of `.md` content into `contentDir` still works (contentDir is usually the project root or a subdir, NOT inside `.git/`)
- `file-watcher` — watches `contentDir`, not `.git/`
- HTTP API + WebSocket + agent sessions — none touch `.git/` except the shadow paths above
- Any `bun run check` / test suite (tests use tmpdirs with real `.git/ init`)

**Current runtime behavior when it fails:**
- `runDevShadowInit` (in `packages/app/src/server/dev-shadow-init.ts`) catches the throw and logs the warning `[dev] Shadow repo init failed (timeline features unavailable)`. The server keeps running with `shadowRef.current === undefined`.
- `persistence.commitToWipRef` sees the undefined shadow ref, falls through to the legacy project-repo path, THAT also fails, logs `[persistence] Shadow commit failed`, increments `consecutiveGitFailures`, after 3 failures logs `CRITICAL: Git auto-save has failed 3+ times`.
- Fails silent for UX — user doesn't see an error unless they look at the terminal or hit `/api/history/*`.

## 4) Why it hasn't been fixed

The repo's [`AGENTS.md`](../../AGENTS.md) documents this as a known worktree constraint under the "Concurrent development" / "Worktree gotcha" section — but the doc only covers the `bun install` side-effect (ProseMirror-model dedup + knip false-positives). The shadow-repo consequence is not documented and nothing flags it as a follow-up.

The shadow-repo spec ([`specs/2026-04-21-shadow-repo-single-mode/`](../../specs/2026-04-21-shadow-repo-single-mode/) if it exists, otherwise the layout code in `packages/core/src/shadow-repo-layout.ts`) codified the shadow location as `<projectRoot>/.git/open-knowledge/` because:
- Hidden from `ls` / file browsers
- Auto-gitignored by git (anything in `.git/` is outside the working tree)
- Lives next to the repo it journals, not in a user-home directory

None of those constraints explicitly account for worktrees.

## 5) Candidate fixes (pick one)

### Option A — Resolve the gitdir pointer and write shadow into the canonical `.git/`

Detect worktrees at `initShadowRepo`. If `.git` is a file, read it (`gitdir: ...` line), resolve to the main repo's `.git/worktrees/<name>/` path, write the shadow INTO THERE (e.g. `<main-repo>/.git/worktrees/<name>/open-knowledge/`).

- **Pros:** Each worktree gets its own shadow. Stays inside git's namespace. One behavior regardless of entry shape.
- **Cons:** All worktrees of the same repo share the main `.git/` — deleting a worktree via `git worktree remove` cleans up `.git/worktrees/<name>/` including the shadow. Is that desirable? Probably yes (the shadow is worktree-specific state).
- **Risk:** Shadow data stored inside `.git/worktrees/<name>/` is NOT what `git worktree list` understands as worktree metadata; tooling might trip on unknown subdirs. Low risk in practice — git treats unknown files/dirs in `.git/worktrees/<name>/` as opaque.

### Option B — Write shadow into the main repo's `.git/open-knowledge/` and namespace by worktree

Resolve the worktree to its main `.git/`, write to `<main>/.git/open-knowledge/<worktree-id>/`. All worktrees share one shadow parent, each gets a subdir.

- **Pros:** Single shadow-repo hierarchy. `git gc` in the main repo can clean orphaned worktrees.
- **Cons:** Multi-worktree GC becomes a shared-state problem. Per-worktree concurrent writes need to not step on each other's ref namespaces.
- **Risk:** Higher — shared state means lock contention, cross-worktree coupling.

### Option C — Move shadow out of `.git/` entirely to `.open-knowledge/shadow/`

Colocate shadow with the existing `.open-knowledge/` metadata directory in the contentDir (which is a regular directory inside worktrees). Break the "shadow lives in git" invariant.

- **Pros:** Worktree-transparent. No git internals coupling. Easier to reason about + back up + delete.
- **Cons:** Migration cost — every existing install has shadows in `.git/open-knowledge/`. Need a migration shim like the existing legacy `.git/openknowledge/` → `.git/open-knowledge/` one (see `initShadowRepo` R9 migration).
- **Cons:** No longer auto-gitignored; `.open-knowledge/` must explicitly exclude `shadow/`.
- **Risk:** Medium — changes the spec. Need to sign off on the invariant change.

### Option D — Document + degrade gracefully, don't fix

Declare worktree use as "non-prod, no timeline features, no shadow instrumentation," document clearly in `AGENTS.md` + `packages/server/README.md`, surface a user-visible banner when shadow isn't available (not just a terminal log), move on. No code change.

- **Pros:** Zero dev cost. Fits the worktree-as-experiments pattern many agents use.
- **Cons:** Production-code paths (CI running in worktrees? Someone's IDE that uses worktrees?) silently lose git journaling. Telemetry coverage has a hole for the same reason.
- **Risk:** Low engineering risk; high footgun risk for users who don't read the docs.

## 6) Investigation next steps

1. **Confirm the constraint with git docs:** `man git-worktree` and `gitrepository-layout(5)` — specifically what's guaranteed about `.git/worktrees/<name>/` subtree layout and whether it's stable API.
2. **Prototype Option A in a scratch repo:** `git worktree add`, drop shadow into the resolved gitdir, verify `git worktree remove --force` cleans it up. Verify `git gc` doesn't touch it. This is the most promising option from first impressions — validate or rule out fast.
3. **Check if any existing code already does gitdir resolution.** Grep for `.git/worktrees` or `gitdir:` parsing — the project-repo path handling in `packages/server/src/project-git.ts` might already have a helper.
4. **Benchmark cost.** How often does `initShadowRepo` run? Once per server boot. Gitdir resolution is one `readFileSync + path.resolve` — negligible.

## 7) Pointers

- **Failing code:** [`packages/server/src/shadow-repo.ts`](../../packages/server/src/shadow-repo.ts) `initShadowRepo()`, specifically the `tracedMkdirSync(shadowDir)` call.
- **Path resolution:** [`packages/core/src/shadow-repo-layout.ts`](../../packages/core/src/shadow-repo-layout.ts) `resolveShadowDir(projectRoot)` — this is the single decision point for where shadow lives.
- **Current degraded-mode catch:** [`packages/app/src/server/dev-shadow-init.ts`](../../packages/app/src/server/dev-shadow-init.ts) — wraps `initShadowRepo` and swallows non-fatal errors.
- **Legacy migration precedent:** R9 shim in `initShadowRepo` that rename-migrates `.git/openknowledge/` (pre-spec) to `.git/open-knowledge/`. If Option C is chosen, a similar shim migrates the existing `.git/open-knowledge/` forward.
- **Existing AGENTS.md worktree section:** "Worktree gotcha — `bun install` after `git worktree add`." Covers dedup / knip only; extend to cover shadow if Option D is chosen.

## 8) Scope if picked up

- **Option A implementation:** 1–2 days end-to-end (gitdir resolution + tests + documentation).
- **Option C implementation:** 2–3 days (migration shim + spec amendment + tests).
- **Option D documentation:** 0.5 day (AGENTS.md + package README update + UI banner if desired).

Non-goal for the first pass: changing the shadow-repo *contents* or wire format. This is purely about the enclosing directory.
