# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/specs/2026-04-21-shadow-repo-single-mode/SPEC.md`
**Audit date:** 2026-04-21
**Total findings:** 12 (3 HIGH, 6 MED, 3 LOW)

Scope: coherence + factual verification against the code at baseline commit `05c7e371`. Audit does NOT evaluate product direction — that's the challenger's job. All file:line citations in findings below are verified against HEAD as of this audit.

---

## High Severity

### [H] Finding 1: Fail-fast vs. degraded-mode contradiction for `ensureProjectGit` failure

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §6 R6 + §9 Failure modes table vs. §16 SCOPE
**Issue:** Three spec passages describe three incompatible behaviors for what happens when `git init` fails. An implementer cannot act on this spec without picking one.

- **§6 R6 (Must):** "the CLI exits with a non-zero status and a clear error; does NOT fall back to a standalone shadow" — fail-fast.
- **§9 Failure modes table:** `ensureProjectGit | git binary not on PATH | spawn ENOENT | Exit with R6 error message | CLI exits non-zero; user installs git` — fail-fast.
- **§16 SCOPE:** "`packages/server/src/standalone.ts` — wire `ensureProjectGit` into `initAsync` before `initShadowRepo`; propagate `didGitInit` to degraded array on failure" — degraded-mode (server still starts).

"Propagate to `degraded` on failure" is semantically opposite to "exit non-zero": the former keeps the server running with the `'project-git'` subsystem missing; the latter refuses to start. These are not two framings of the same behavior.

**Evidence:** See SPEC.md lines 98, 181-188, 307. For comparison, `initAsync` in `packages/server/src/standalone.ts:871-1006` is the `ready` promise; subsystem failures there push to `degraded` (e.g., `shadow-repo`, `file-watcher`, `head-watcher`, `managed-rename-recovery`) without aborting startup. A true fail-fast would have to throw before the server's HTTP listener binds, which means `ensureProjectGit` either runs SYNCHRONOUSLY inside `createServer()` (before it returns `ServerInstance`) or inside `bootServer` before `createServer()` is even called. Current `initAsync` architecture cannot deliver R6 without a structural change the spec doesn't describe.

**Status:** INCOHERENT
**Suggested resolution:** Pick one:
(a) Fail-fast: move `ensureProjectGit` call OUT of `initAsync` and into `bootServer` (before `createServer()`). Helper throws `ProjectGitInitError`; caller exits non-zero. Update §16 SCOPE to remove "propagate to degraded array". Update §9 data flow diagram to show `bootServer → ensureProjectGit → createServer` ordering.
(b) Degraded-mode: keep `ensureProjectGit` in `initAsync`, push to `degraded` on failure. Revise R6 to say "renders degraded warning with clear install instructions; server refuses to start serving collab until git is installed" (or equivalent). Add a corresponding CLI path that reads `booted.degraded.includes('project-git')` and exits non-zero after rendering the warning.

Per the spec's non-interactive / fail-fast framing, (a) is the more natural fit.

---

### [H] Finding 2: Simplified `resolveShadowDir` breaks worktree support (D6 + R3 incoherence with Future Work)

**Category:** COHERENCE + FACTUAL
**Source:** L1, T1
**Location:** §10 D6, §6 R3, §15 Future Work ("Worktree-aware shadow-repo location")
**Issue:** The simplified `resolveShadowDir` (R3/D7) returns `<root>/.git/openknowledge` unconditionally. But in a git worktree, `<root>/.git` is a FILE (not a directory) containing `gitdir: <commondir>/worktrees/<name>`. Creating a directory inside a file fails with `ENOTDIR`.

Current `resolveShadowDir` (`packages/core/src/shadow-repo-layout.ts:72-83`) specifically handles this by falling through to standalone mode when `.git` is not a directory. Worktree users are currently on the standalone-mode path — that's the ONLY path that works for them. After this spec, standalone is gone, AND the simplified resolver returns an invalid path.

D6 says `ensureProjectGit` correctly skips `git init` in a worktree (because `.git` exists). But nothing in the spec handles what happens AFTER `ensureProjectGit` returns `{ didInit: false }`:

- `initShadowRepo(projectRoot)` is called next.
- It calls `resolveShadowDir(projectRoot)` which now returns `<root>/.git/openknowledge`.
- `mkdirSync('<root>/.git/openknowledge', { recursive: true })` — `<root>/.git` is a file, so this throws `ENOTDIR`.
- `initShadowRepo` throws; caught in `initAsync`; `degraded.push('shadow-repo')`.

Worktree users go from working → degraded. This is a regression.

Compounding the issue, the §15 Future Work entry describing this says:

> `<worktree>/.git/openknowledge/` resolves via the worktree's gitdir, but whether that ends up in the worktree's private area OR the shared commondir depends on `resolveGitDir`'s output and Node's path semantics.

This is factually wrong. The simplified `resolveShadowDir` does NOT call `resolveGitDir` — it just does `resolve(projectRoot, '.git/openknowledge')`. The "resolves via the worktree's gitdir" claim describes a world in which the resolver walks the `gitdir:` pointer, but the spec's R3 explicitly makes the resolver a one-liner that doesn't follow the pointer.

**Evidence:**

- `packages/core/src/shadow-repo-layout.ts:75-82` (current handles `.isDirectory()` branch)
- `packages/server/src/head-watcher.ts:55-73` (current `resolveGitDir` shows the `gitdir:` pointer-following pattern the spec doesn't reproduce)
- `packages/server/src/shadow-repo.ts:74` (`mkdirSync(shadowDir, { recursive: true })` — the call that throws ENOTDIR in worktree after spec changes).

**Status:** CONTRADICTED / INCOHERENT

**Suggested resolution:** Either:
(a) Update R3/D7: `resolveShadowDir` must resolve `.git` through the worktree pointer before appending `openknowledge/`. Use the same approach `resolveGitDir` uses in `head-watcher.ts`. The function is no longer a one-liner, but the behavior is correct for worktrees.
(b) Promote Q4 from Future Work (Identified) to an In-Scope blocker. The spec's charter is "single-mode cleanup" and the cleanup currently breaks worktrees; that's not a defer-able issue if R3 ships as written.
(c) Correct the Future Work description to match what R3 actually does: "simplified `resolveShadowDir` returns a literal path that is INVALID in worktrees; follow-up spec must teach it to follow the `gitdir:` pointer."

---

### [H] Finding 3: §16 SCOPE misses several call sites that R1 / R8 acceptance criteria would flag

**Category:** COHERENCE + FACTUAL
**Source:** L4, T1
**Location:** §16 SCOPE
**Issue:** The spec's R1 acceptance criterion is `rg --type ts 'standalone|ShadowRepoMode|\.openknowledge/'` returns zero matches outside the changelog/spec. R8 extends this to `'integrated mode|standalone mode|.openknowledge/'` (all files, manual review). The current §16 SCOPE omits several files that match these greps today and are not otherwise excluded by the acceptance criteria.

Files in repo that contain the target strings but are NOT in §16 SCOPE:

1. **`packages/server/src/head-watcher.ts:132,142`** — doc-comment "If projectGitDir is null (standalone mode)" + inline comment `// Standalone mode — no .git to watch`. Evidence file §1 explicitly flags line 132, but §16 SCOPE only lists `head-watcher.test.ts`, not the source.
2. **`packages/cli/src/content/enrichment.ts:37`** — `'.openknowledge'` inside `DIR_SKIP` Set (parallel to mtime-scan.ts:29). The spec lists mtime-scan.ts for "optional polish" but not enrichment.ts.
3. **`packages/cli/src/content/shadow-log.ts:5`** — doc-comment "Reads the bare shadow repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode)". Not in SCOPE.
4. **`packages/server/src/standalone.test.ts:164+`** — a test that calls `initShadowRepo(projectDir)` on a bare tmpDir with no `.git/`. Today this works via standalone fallback. After the spec, `initShadowRepo` would try to `mkdirSync` inside a non-existent `.git/` and throw. Not in SCOPE — the implementer won't know to init `projectDir` as a git repo first.
5. **`packages/.gitignore:1`** — single line `.openknowledge/`. Dev-tooling file. Not in SCOPE.
6. **`.gitignore` (repo root) lines 48, 55, 65** — comment + two `.openknowledge/` entries. Not in SCOPE.
7. **`AGENTS.md:221`** — describes shadow as "at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode, no project `.git/`)". R8 mentions `CLAUDE.md`; `AGENTS.md` may be symlinked/paired with it, but §16 SCOPE lists `CLAUDE.md` only.
8. **`docs/content/internals/service-topology.mdx:84`** — user-facing docs page with the same "integrated / standalone" phrasing. R8 mentions "the docs site (Fumadocs) get updated" but §16 SCOPE doesn't list the specific file.

Items 4 is the highest-risk gap because it will cause a test failure on the implementation PR unless the test is updated. Items 1, 3, 7, 8 will cause the spec's own acceptance criteria (R1/R8) to report non-zero matches.

**Evidence:**

- Direct `rg .openknowledge /packages` shows 6 files (spec evidence file covers 5; enrichment.ts is missed entirely).
- `packages/server/src/standalone.test.ts:164-180` shows the failing test setup (no `git init` on `projectDir` before `initShadowRepo`).
- `.gitignore` root: `grep -n .openknowledge .gitignore` returns lines 48, 55, 65.
- `AGENTS.md` line 221 confirmed via grep.

**Status:** INCOHERENT (SCOPE underspecifies the blast radius vs. acceptance criteria)

**Suggested resolution:** Either
(a) Expand §16 SCOPE to enumerate all 8 items above, OR
(b) Narrow R1 acceptance criteria to match what §16 actually covers (e.g., "zero runtime references in the enumerated SCOPE files"), AND update R8's wording so unaddressed items don't count as spec-level failures.

Of these, (a) is correct — the change is mechanical and finite, and the spec's stated goal is to delete the standalone code path everywhere.

---

## Medium Severity

### [M] Finding 4: "D14 IPC discipline applies" is a category error for utility-main IPC

**Category:** FACTUAL
**Source:** T1
**Location:** §10 D10 row ("Rationale" + "Implications" columns), §16 SCOPE ("Any Zod validator for the ready-message IPC shape...")
**Issue:** The spec claims D14 IPC discipline governs the `UtilityReadyMessage` shape, and that updates should touch "any Zod validator for the ready-message IPC shape (check `packages/desktop/src/shared/ipc-events.ts`...)". These are conflating two different IPC surfaces.

D14 (from `specs/2026-04-11-electron-desktop-app/SPEC.md`) governs **main ↔ renderer IPC via `ipcMain.handle` / `ipcRenderer.invoke`**. The guard is the `no-loosely-typed-webcontents-ipc` Biome GritQL rule, and the typed channel map lives in `packages/desktop/src/shared/ipc-channels.ts` (request/response) and `ipc-events.ts` (push events).

`UtilityReadyMessage` is a **utility-process ↔ main IPC message via `parentPort.postMessage`** — an entirely different mechanism. It's defined in `packages/desktop/src/utility/server-entry.ts:38-42` and has NO Zod validator. The typed discriminated union on `UtilityOutgoingMessage` (lines 52-55) IS the validation.

Searching `ipc-events.ts` for a "ready-message" shape is tautologically fruitless because the file describes renderer-push events (`ok:project:switching`, `ok:project:switched`, `ok:menu-action`), not utility-main messages.

**Evidence:**

- `packages/desktop/src/shared/ipc-events.ts:14-21` shows the three `EventChannels` entries — none related to `ready` or utility-main traffic.
- `packages/desktop/src/utility/server-entry.ts:38-55` shows the utility message types and their use with `parentPort.postMessage`, which bypasses the D14-governed `ipcMain.handle` flow entirely.
- CLAUDE.md § "IPC discipline (D19)" restricts the ban to `ipcMain.handle` / `ipcRenderer.invoke` — utility messages are out of its scope.

**Status:** CONTRADICTED
**Suggested resolution:**

- Remove the "D14 IPC discipline applies" claim from D10's "Implications" and "Rationale" columns. Replace with "Utility-process ↔ main message discriminated union is the validation; update `UtilityReadyMessage` to add the `didGitInit: boolean` field."
- Remove the `ipc-events.ts`-check line from §16 SCOPE. Replace with: "update `UtilityReadyMessage` in `server-entry.ts`; no other type surface needs to change."

---

### [M] Finding 5: R5 disclosure condition misses `didGitInit && !didAutoInit` case

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §6 R5
**Issue:** R5 says "When auto-git-init fires in CLI flow, the first-run preview block (from `cli-init-clarity` R5) includes a line: `Initialized git repo at <root>/.git/ (default branch: main)`." But `cli-init-clarity` R5 is explicitly gated on `didAutoInit === true` (content-scaffold fired). If `didGitInit: true` but `didAutoInit: false` (user has `.open-knowledge/` config already but no `.git/`), the preview block doesn't render at all and the disclosure is lost.

This state IS reachable — e.g., any user who ran `ok init` once (scaffold persists) then deleted `.git/` before running `ok start` again. Or a user who manually created `.open-knowledge/config.yml` in a fresh directory before ever running `ok`.

§16 SCOPE says "read `didGitInit`; render disclosure line alongside the existing `didAutoInit` (scaffold) disclosure" — suggests adding the line INSIDE the existing `if (didAutoInit)` block, which preserves the gap.

**Evidence:**

- `packages/cli/src/commands/start.ts:477,502` — preview rendering lives inside `if (booted.didAutoInit) { ... }`.
- `specs/2026-04-13-cli-init-clarity/SPEC.md` §6 R5: "Gated by `didAutoInit` so it only fires on first-run-via-start, not on subsequent `start` invocations."

**Status:** INCOHERENT
**Suggested resolution:** Update R5 acceptance criteria to say "disclosure renders when `didGitInit === true` regardless of `didAutoInit`" AND update §16 SCOPE to instruct the implementer to move the disclosure line OUT of the `if (didAutoInit)` block (or add a sibling `if (didGitInit)` render path).

---

### [M] Finding 6: R2 acceptance criterion uses wrong parameter name for `createTestServer`

**Category:** FACTUAL
**Source:** T1
**Location:** §6 R2 Acceptance criteria
**Issue:** R2 says `createTestServer({ projectRoot: tmpDir /* no .git */ })`. The actual harness signature is `createTestServer(options: CreateTestServerOptions = {})` where `CreateTestServerOptions` has `contentDir`, not `projectRoot`.

**Evidence:**

- `packages/app/tests/integration/test-harness.ts:97-103` shows `options.contentDir` is the actual parameter. No `projectRoot` field exists.

**Status:** CONTRADICTED
**Suggested resolution:** Rephrase as `createTestServer({ /* default — no .git in auto-created tmpDir */ })` or `createTestServer({ contentDir: tmpDir /* no .git */ })`. Minor edit.

---

### [M] Finding 7: Line-range imprecision across `resolveGitDir` references

**Category:** FACTUAL
**Source:** L4, T1
**Location:** §8 ("at line 55-70"), §10 D6 Evidence ("55-70"), §11 Q1 ("lines 55-72"), §12 A4 ("lines 55-70"), evidence file §1 ("55-72")
**Issue:** Four citations for the same `resolveGitDir` function span three different ranges (55-70, 55-72, 55-73). The actual function body is lines 55-73 (closing brace on line 73).

**Evidence:** `packages/server/src/head-watcher.ts:55-73` is the actual range (inclusive of closing brace).

**Status:** STALE (drift between evidence file and spec body)
**Suggested resolution:** Pick one canonical range and update all five citations. Low-impact, but affects the spec's self-consistency claim ("Evidence file confirms…").

---

### [M] Finding 8: Evidence file overstates the range of the standalone test in `shadow-repo.test.ts`

**Category:** FACTUAL
**Source:** L4
**Location:** Evidence file `current-shadow-repo-mode-surface.md` §2
**Issue:** Evidence says:

> Line 73-91: "creates shadow at `.openknowledge/` when no project `.git/` exists (standalone)" — DELETE

The actual test spans lines 73-85. Line 87 starts the next test (`"is idempotent"`). Deleting lines 73-91 as a block would delete the first 5 lines of `"is idempotent"`.

**Evidence:** `packages/server/src/shadow-repo.test.ts:73-85` is the actual boundary; line 87 is `test('is idempotent — second call does not error', ...)`.

**Status:** STALE
**Suggested resolution:** Change evidence file §2 "Line 73-91" to "Line 73-85" and verify the §16 SCOPE reflects the correct range.

---

### [M] Finding 9: Evidence file mischaracterizes `shadow-repo-layout.test.ts:199-200` as a deletable standalone test

**Category:** FACTUAL
**Source:** L4
**Location:** Evidence file `current-shadow-repo-mode-surface.md` §2
**Issue:** Evidence says:

> Line 199-200: similar standalone-case test — DELETE

Lines 199-200 are INSIDE the `"prefers integrated over standalone when both exist"` test (lines 194-201), not a separate standalone test. That test verifies that when BOTH `.git/` and `.openknowledge/` exist, integrated wins. Post-spec, this test is either deletable (behavior is trivial if standalone is gone) or adaptable (verify `.git/openknowledge/` wins regardless of what's in `.openknowledge/`).

Labeling line 199-200 as a "similar standalone-case test" is a mischaracterization.

**Evidence:** `packages/core/src/shadow-repo-layout.test.ts:194-201` is the full test block.

**Status:** INCOHERENT (evidence misclassifies the test's role)
**Suggested resolution:** Update evidence file to describe lines 194-201 as "`prefers integrated over standalone when both exist` — DELETE or ADAPT: after R1, the test either collapses to verifying the single path, or is removed because the `either-or` no longer exists."

---

## Low Severity

### [L] Finding 10: A1 labeled HIGH confidence but deferred verification and still marked Active

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** §12 A1
**Issue:** A1 says:

> Every supported platform (macOS, Linux, Windows WSL) ships `git` on a predictable PATH for users who have reached the "install OK" step. | HIGH | The Desktop spec assumes this; CLI distribution spec assumes this. Tracked as HIGH because OK is a collab tool for developers. | Before finalization | Active

A HIGH-confidence assumption shouldn't have an unresolved verification plan AND be Active at the same time. Either the verification is a formality (in which case close it now), or the confidence isn't actually HIGH yet. The current row is internally inconsistent.

**Status:** INCOHERENT (confidence label doesn't match status/verification)
**Suggested resolution:** Either (a) reclassify to MEDIUM and do verification post-finalize, or (b) close A1 ("Confirmed — developer platforms assumed per parent specs; see D-xx of cli-distribution") now.

---

### [L] Finding 11: Evidence file estimate "~50 tests × 100-200ms" understates test count

**Category:** FACTUAL
**Source:** T1
**Location:** Evidence file §2 test-harness line + Q3 answer in SPEC
**Issue:** Evidence file and Q3 both claim "\~100-200ms per test × \~50 tests = \~5-10s wall-clock overhead." Actual test count using `createTestServer`: 26 files across `packages/app/tests/integration/`. At typical 3-8 tests per file (spotchecked), real test count is 100-150+, not 50.

Worst-case overhead could be 150 × 200ms = 30s. Best case 100 × 100ms = 10s. Neither matches the "5-10s" estimate.

This doesn't change the "accept the cost" decision, but the stated budget is \~3x low.

**Evidence:** `find packages -name '*.test.ts' | xargs grep -l createTestServer` returns 26 files; each hosts multiple `test()` blocks.

**Status:** STALE / UNVERIFIED
**Suggested resolution:** Re-state as "\~150 tests × 100-200ms = \~15-30s wall-clock overhead" or leave the point but drop the numeric estimate. Alternatively, mark this as something to measure empirically during implementation.

---

### [L] Finding 12: `shadow-repo.ts:86-99` vs `86-100` line range drift

**Category:** FACTUAL
**Source:** L4, T1
**Location:** §16 SCOPE (`packages/server/src/shadow-repo.ts` — "remove `.gitignore` mutation + standalone branch in `initShadowRepo` (lines 86-99)")
**Issue:** The standalone branch in `initShadowRepo` spans lines 86-100 (closing `}` on line 100). §16 SCOPE says "lines 86-99" which omits the closing brace line. Trivial off-by-one.

**Evidence:** `packages/server/src/shadow-repo.ts:86-100` — the `if (mode === 'standalone') { ... }` block.

**Status:** STALE
**Suggested resolution:** Update to "lines 86-100" for precision. Non-blocking.

---

## Confirmed Claims (summary)

Coherent + factually verified (no finding needed):

- `resolveShadowDir` at `packages/core/src/shadow-repo-layout.ts:72-83` — body is lines 72-83. ✓
- `ShadowRepoMode = 'integrated' | 'standalone'` at line 54. ✓
- `resolveShadowDir` has only TWO callers: internal `getShadowRepoPath` (line 93) and `shadow-repo.ts:69`. ✓ (spec evidence is correct; any other caller would surface via `rg` and none do.)
- `head-watcher.ts:resolveGitDir` pattern handles both `.git` as dir (line 59) and `.git` as file (lines 60-67, `gitdir:` pointer follow). ✓
- `sync-engine.test.ts:149,230,547` all use `git.init(['--initial-branch=main'])` — confirms A2. ✓
- `test-harness.ts` creates fresh tmpDir via `mkdtempSync` (line 103) with no `.git/`. ✓
- `window-manager.ts` ready handler is at lines 259-268 (the `onMessage` closure). ✓
- `server-entry.ts:38-42` is the `UtilityReadyMessage` interface. ✓
- CLI / Desktop / Vite-dev entry points all flow through `createServer()` + `bootServer()` — §9's "choke point" claim is correct.
- D1-D5, D7-D9 rationales align with intake history in `_changelog.md`.
- The `cli-init-clarity` R5 reference exists and is correctly described as "Should"-priority + gated on `didAutoInit`. (Gap surfaces in Finding 5.)

## Unverifiable Claims

- A3 ("No existing production users rely on the `.openknowledge/` standalone path") — MEDIUM. The pre-production stance is the user's domain knowledge; no way to verify from the codebase.
- The "\~100-200ms per `git init`" micro-benchmark is platform-dependent and will be verified during implementation per Q3's "accept the cost" stance.
- Notification permission behavior on various macOS versions (R5b Risk row) — depends on OS-level user settings; not verifiable pre-ship.

---

## Summary

The spec is substantively coherent on its core decisions (W1 + W2 scope, silent orphan for legacy `.openknowledge/`, `main` as default branch, Desktop Notification path). The three HIGH findings compound from a single structural weakness: **§16 SCOPE and §6 Requirements/§9 Design were written with different mental models** — §9 describes `ensureProjectGit` as a synchronous pre-check with fail-fast semantics, while §16 SCOPE describes it as an async init-phase helper with degraded-mode fallback. The worktree and test-harness gaps surface from the same asymmetry: §9's high-level "unconditional `.git/openknowledge`" claim hasn't been stress-tested against the full caller inventory §16 should have enumerated.

Recommend resolving Findings 1-3 together in a single iteration since they share the same root cause.
