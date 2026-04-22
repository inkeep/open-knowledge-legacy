# Design Challenge Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/specs/2026-04-21-shadow-repo-single-mode/SPEC.md`
**Challenge date:** 2026-04-21
**Total findings:** 10 (4 HIGH, 4 MED, 2 LOW)

Scope: design-level challenges against the spec's framing, rejected alternatives, and stakeholder blind spots. This is distinct from the auditor's coherence/factual track (see `meta/audit-findings.md`) — two findings overlap the audit in the worktree/fail-fast areas and are framed here as *design* challenges (the rejection rationale doesn't hold), not just coherence bugs.

Baseline reviewed against commit `05c7e371` (same as SPEC.md baseline).

---

## High Severity

### [H] Finding 1: D1's "drop W3" rejection reintroduces the exact maintenance problem the spec is solving

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** §1 Complication, §10 D1, §3 NG2, §15 Future Work ("W3")
**Issue:** The spec's Complication argues that the standalone↔integrated split is costly because "the two modes' semantics drift over time (branch scoping, reconciliation, save-version parentage, HEAD-watcher batch kinds). This costs test matrix, code branches ... with no user-facing payoff."

The proposed Resolution (D1) solves the *standalone code path* but preserves a different multi-mode footprint: **the shadow location is still a user-visible-ish directory whose meaning depends on whether the user has `.git/`**. Before the spec, two shadow paths, two code branches. After the spec, one shadow path — but only because we forcibly create `.git/` in any directory the user invokes OK in. That's trading a code-branch problem for a *filesystem-mutation* problem, and the spec's own §14 Risks table rates the first surprise as "MED likelihood."

W3 (relocate shadow to `.open-knowledge/shadow/`) was dropped because the "user retracted W3 during intake; shadow stays at `.git/openknowledge/`." But from a maintainability perspective, W3 is the *simpler* long-term answer to the spec's Complication:

- **No auto-`git init`**: OK works in any directory without mutating the parent's git state. A user who never runs `git init` has one OK-owned dir (`.open-knowledge/`) and that's it. No R6 "fail fast if git missing" regression in "works anywhere" (see Finding 2 below).
- **Single shadow location**: `<root>/.open-knowledge/shadow/` unconditionally. No branching on `.git/` existence. Same benefit the spec is trying to reach, without the fail-fast regression.
- **Worktree-safe**: the `.open-knowledge/` dir is content-adjacent, not git-adjacent, so `git worktree add` doesn't collide with shadow state (Future Work Q4 would be a non-issue).
- **Test harness**: currently passes `gitEnabled: false` and no `.git/` exists in test tmpdirs. With W3, `initShadowRepo` continues to work without the \~5-10s × 50 tests overhead the spec accepts. (The accepted overhead is non-trivial for a pre-production project iterating fast on tests.)

The spec's argument against W3 is that it would "add user-visible bare-git internals" to `.open-knowledge/`. But `.open-knowledge/shadow/` is two levels deep and only visible if the user enters a subdirectory — no worse than `.git/hooks/` being visible today to anyone who has seen `ls .git`. And NG2 rates this as **NEVER**, which is disproportionate to the evidence: the user "retracted the proposal during intake" is the *only* rationale.

**Current design:** "Collapse to a single mode. The shadow repo always lives at `<projectRoot>/.git/openknowledge/`... If `<projectRoot>/.git/` does not exist when the server starts, OK auto-`git init`s the parent repo."

**Alternative:** Collapse to a single mode, but relocate shadow to `<projectRoot>/.open-knowledge/shadow/`. No auto-git-init needed. No R6 "git required to run" capability regression. No Desktop Notification disclosure complexity (R5b). No worktree worry (Q4 becomes a non-issue).

**Trade-off:**
- *Lost*: `.git/openknowledge/` hidden-inside-git ergonomics; migration requires a one-time scan of existing integrated-mode installations (~1 paragraph of migration logic).
- *Gained*: no auto-mutation of user filesystem beyond OK's namespace (matches NG4's stated principle); no R6 fail-fast regression; simpler Desktop story (no IPC schema change D10 needed); simpler tests.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine the W3 rejection. Specifically: is the user's retraction during intake based on a technical reason (which should be captured in D1's rationale), or based on the premise that `.git/openknowledge/` is "where the shadow has always lived"? If the latter, path-dependence is not sufficient justification to reject a simpler architecture. Pre-production is the window to migrate.

If W3 holds after re-examination, at minimum upgrade the D1 rationale to explain *why* the non-interactive auto-mutation of the user's filesystem is preferable to the content-adjacent alternative, and capture the user's technical reason for retracting W3.

---

### [H] Finding 2: R6 ("fail fast if git unavailable") is a capability regression from standalone mode's "works anywhere" promise

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §6 R6, §1 Situation, §13 Deployment
**Issue:** The spec frames the standalone mode as something users "can tolerate an auto-init" for. But standalone mode specifically exists to serve users who *don't have git installed* or *don't want to git-init their directory*. R6 codifies removing that capability: "If `git init` fails (git not on PATH ...), the CLI exits with a non-zero status" — and the replacement error message explicitly says "Install git ...".

The spec doesn't interrogate what users this breaks:

1. **Non-dev users**: OK is positioned as "collaborative markdown" — agent writes, UI, preview, docs. Not every notes user is a developer with git installed. `brew install git` is a fine prerequisite for a dev tool; it's unusual for a tool that presents a rich WYSIWYG editor and positions itself adjacent to Notion/Obsidian.
2. **Minimal docker images**: Alpine-based Docker without git, CI containers, Node-only environments — all of which today would run OK in standalone mode and get shadow attribution. After this spec, they exit non-zero.
3. **Locked-down directories**: corporate workstations with `git init` blocked at the filesystem level, or sandbox environments where the user cannot modify the directory's git state.

§14 rates this as "LOW likelihood, HIGH impact." The likelihood calibration deserves challenge: the target user for Desktop (macOS M1) likely has git via Xcode CLI; the target user for the CLI today is a developer; but positioning is changing (see the docs site / Electron spec's trajectory toward non-dev users). "LOW likelihood" is an artifact of today's user mix, not of the spec's forward-looking posture.

Critically, the spec's framing of R6 as a "replacement for the standalone mode's 'works anywhere' promise" is euphemistic — R6 is a *withdrawal* of that promise, not a replacement. The replacement for "works anywhere" is "works in any directory where you've installed git and are willing to have a `.git/` created."

**Current design:** "R6 — Fail fast if git unavailable. If `git init` fails (git not on PATH, permission denied, disk error), the CLI exits with a non-zero status and a clear error; does NOT fall back to a standalone shadow."

**Alternative:** Either
- (a) Fall back to a *disk-only-no-shadow* mode: the server starts, file watcher works, content syncs; only attribution / timeline / Save Version features are unavailable. Maps to the existing degraded-mode pattern (`degraded: ['shadow-repo']`) and keeps all the non-shadow features of OK available for git-less users.
- (b) Adopt W3 (Finding 1) which eliminates the git dependency entirely.

**Trade-off:**
- *(a)*: the "works anywhere" promise survives, albeit in degraded form. Users without git get a warning and no attribution, which is strictly better than a hard exit. Code cost: the existing `degraded` path already handles `'shadow-repo'`; this is a one-line addition.
- *(b)*: covered in Finding 1.

**Status:** CHALLENGED

**Suggested resolution:** Reclassify R6 from "fail fast" to "degrade gracefully to no-shadow mode." The CLI renders `shadow-repo` in the degraded array (already wired — see `packages/cli/src/commands/start.ts:486-499`). Add a warning banner: "Attribution / Save Version unavailable because git is not installed. Install git to enable timeline features." This preserves OK's accessibility as a notes tool for non-dev users while still getting the single-mode code-path simplification the spec is after.

If the spec holds R6 as written, it should acknowledge in §14 that the "HIGH impact" is specifically a *withdrawal of capability*, not a transient infrastructure blocker. That reframing affects Future Work prioritization.

---

### [H] Finding 3: D10's macOS Notification is *not* comparable disclosure to the CLI preview block

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §10 D10, §6 R5b, §14 Risks (last row)
**Issue:** The spec claims D10 "aligns disclosure parity with CLI's preview-block line." This doesn't hold under scrutiny:

1. **Persistence**: The CLI preview block is *printed to stdout* and stays in the terminal scrollback. A user who missed it on first read can scroll back, copy, or redirect to a log. The macOS Notification appears for ~5 seconds and is gone unless the user has notification grouping enabled *and* remembers to check Notification Center. The CLI disclosure is a persistent artifact; the Desktop disclosure is ephemeral.
2. **Muted notifications**: Many macOS power users run with `Do Not Disturb` on during focus hours, or with Notification silencing at the OS / Focus Mode level. Developer-facing apps (like the target OK user) run with muted notifications by default. The last row of §14 acknowledges this ("LOW impact" because "the `.git/` is still there"). But "the `.git/` is still there" is not the same as "the user knows about it" — and the Complication is centered on the user *knowing* OK mutated their directory.
3. **First-launch dialog context**: The user ran OK via the Navigator. They picked a folder. In their mind, they picked a *content* folder. Silent git-init without persistent disclosure conflicts with the Desktop spec's own stated discipline at §8.9 line 839 ("Consent UX: first-launch dialog lists detected editors with checkboxes; user confirms before main writes to user-level config files. No silent writes — matches the principle-of-least-astonishment."). That's user-level-config, but the principle is identical: *don't write to the user's filesystem without visible consent*.
4. **`didGitInit` is a transient signal**: After notification dismiss, there's no record in the app UI that OK initialized a git repo. A user who installs OK, uses it for a week, then notices a stray `.git/` directory ("where did this come from?") has no path to trace it back to OK.

The risks table rightfully notes "Notification permissions disabled → LOW impact" but mis-frames the severity. The core claim is *disclosure parity with CLI*; for a user whose notifications are muted, disclosure is *absent* not *equivalent*.

Additionally, D10's choice to render the Notification from the *main process* (not the utility) means the IPC must propagate `didGitInit: true` even though the main process has no other use for it. This creates an IPC surface solely to fire a 5-second notification — a non-trivial amount of architecture for a disposable signal.

**Current design:** "When auto-git-init fires in Desktop utility flow, (a) `UtilityReadyMessage` carries `didGitInit: true`, and (b) the main process calls `new Notification({ title: 'Open Knowledge', body: 'Initialized git repo at <root>/.git/' }).show()` on receipt."

**Alternative options, in order of simplicity:**
- (i) **First-launch confirmation dialog for git-init** (consistent with §8.9 line 839). "Open Knowledge wants to initialize a git repository in `<path>` to enable version history and attribution. \[Initialize] \[Skip (no attribution)] \[Cancel]." This is the Desktop-native analog to CLI's preview block — persistent, visible, dismissible only by explicit action.
- (ii) **Persistent app-badge-style disclosure**: a dismissible banner inside the editor window ("OK initialized a git repo here — Learn more") that persists until dismissed. The renderer already supports banners (e.g., `ConnectingBanner` per recent PR #231).
- (iii) **Accept the audit finding**: if D10 holds, re-write R5b's acceptance criteria to say "discloses via best-effort transient notification; no guarantee of user visibility" and downgrade the "disclosure parity" claim.

**Trade-off:**
- *(i)*: interactive Desktop flow, adds a dialog component. Costs \~20 LOC of React, matches Desktop spec's existing consent discipline.
- *(ii)*: non-interactive, persistent, dismissible. Matches the "less intrusive than a dialog, more persistent than a Notification" sweet spot.
- *(iii)*: zero code change, honest framing.

**Status:** CHALLENGED

**Suggested resolution:** Pick (ii) or (i) — something persistent inside the app's own UI surface. The Notification path is a stakeholder-gap fix masquerading as a disclosure solution. If retained, at minimum amend R5b to reflect that disclosure is best-effort, not parity.

---

### [H] Finding 4: D6's `existsSync(.git)` gate prevents git-init in worktrees, but simplified `resolveShadowDir` then breaks worktrees anyway — the defer to Future Work is unsafe

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (SRE perspective)
**Location:** §10 D6, §6 R3, §11 Q4, §15 Future Work
**Issue:** This finding overlaps with audit Finding 2 but reframes it as a *design* problem: the spec's claim that "worktree correctness warrants its own spec" treats worktree support as a future-work add-on, when in reality *today's* OK correctly supports worktrees via the standalone-mode fallback.

Before spec: a user running `ok start` inside `.claude/worktrees/my-feature/` has `.git` as a FILE (worktree marker). `resolveShadowDir` sees `.isDirectory() === false` and falls through to `resolve(abs, '.openknowledge')` — standalone mode, which works. The worktree user gets a functional shadow repo (albeit in a location that would conflict across worktrees, which is Q4's concern).

After spec: same user, same scenario. `ensureProjectGit` sees `.git` exists (D6 correctly skips `git init`). Then `initShadowRepo` runs, calls the simplified `resolveShadowDir` which returns `<worktree>/.git/openknowledge`. `mkdirSync('<worktree>/.git/openknowledge', { recursive: true })` — `<worktree>/.git` is a file, throws `ENOTDIR`, caught in `initAsync`, pushed to `degraded: ['shadow-repo']`. **The worktree user goes from working to degraded as a direct consequence of this spec shipping.**

This isn't a deferrable concern. The CLAUDE.md documentation pattern (section "Worktree isolation") explicitly tells agents to run OK in worktrees: "Each worktree has its own content directory. The test harness creates a fresh `tmpDir` per test run — no shared state between worktrees." This workflow breaks.

The spec acknowledges this in Q4 but treats it as an *existing* concern that doesn't need to be resolved here ("worktree behavior warrants its own spec"). That's true for the original Q4 framing (cross-worktree contamination of shared `refs/wip/` state). But a distinct worktree-related regression ships *in* this spec: the spec *creates* a new failure mode (`.git` file → ENOTDIR on shadow init) that didn't exist before.

The suggested resolution in audit Finding 2 is to teach `resolveShadowDir` to follow the `gitdir:` pointer. That's code, and it should be in this spec's scope — not deferred.

**Current design:** D6 "`ensureProjectGit` treats `.git` as 'exists' whether it's a directory OR a file (worktree marker)." R3 "`resolveShadowDir` always returns `<projectRoot>/.git/openknowledge/`."

**Alternative:** `resolveShadowDir` resolves `.git` through the worktree pointer before appending `openknowledge/`:

```ts
export function resolveShadowDir(projectRoot: string): string {
  const gitDir = resolveGitDir(projectRoot); // follows pointer; returns null if absent
  if (gitDir === null) {
    // Caller is expected to have run ensureProjectGit already; this is the
    // "git init failed silently" edge path.
    throw new ShadowRepoError('Cannot resolve shadow dir — no .git/ present');
  }
  return resolve(gitDir, 'openknowledge');
}
```

Now a worktree user's shadow lives at `<commondir>/worktrees/<name>/openknowledge` (worktree-private) or `<commondir>/openknowledge` (shared across worktrees) depending on git-internal semantics. That's Q4's concern, but Q4's concern is *unchanged by this spec* — it's the pre-existing behavior. Not shipping this fix creates a NEW regression.

**Trade-off:**
- *Lost*: R3's claim that `resolveShadowDir` becomes a "one-liner." It's now a 5-line function that mirrors `resolveGitDir`.
- *Gained*: worktree users don't regress; the spec holds G2 ("zero observable change for projects with `.git/`") which worktrees currently satisfy.

**Status:** CHALLENGED

**Suggested resolution:** Promote worktree path resolution (not the cross-worktree contamination Q4 concern) from Future Work to In Scope. The change is small — port `resolveGitDir`'s pointer-following logic into `resolveShadowDir`. D6 currently hand-waves this as handled but it isn't; the spec needs an explicit FR for it and a test.

If deferred, the spec must acknowledge that **worktree users will see `degraded: ['shadow-repo']` after this spec ships** — and that's a regression, not a neutral deferral.

---

## Medium Severity

### [M] Finding 5: D4's "ok mcp doesn't auto-git-init" is asymmetric but not a footgun — the actual footgun is `ok mcp` detach-spawning `ok start` which DOES git-init

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — MCP client engineer)
**Location:** §10 D4, §10 D9, §6 requirements
**Issue:** D4 says "`ok mcp` does NOT auto-git-init ... MCP clients should not cause silent side effects in project directories." This is a sound principle, but the implementation doesn't carry the principle through: `ok mcp` auto-spawns `open-knowledge start` as a sibling process when no server is running (see `packages/cli/src/commands/mcp.ts` D-003 / D-009 lifecycle coupling, `OK_MCP_AUTOSTART=0` to opt out). That sibling *does* run `ensureProjectGit`.

The net effect: a user whose MCP client (Claude Code, Cursor) invokes `ok mcp` in a directory without `.git/` will have `.git/` materialized by the detach-spawned `ok start` without any CLI output visible to them. No preview block (that's `ok start` stdout which MCP doesn't surface to the user). No notification (that's Desktop-only). No user-visible signal at all.

This is actually worse than D4's stated concern: it's silent side effects caused by an MCP call *through* an MCP-principled boundary. The "MCP doesn't mutate" principle is preserved in the verb `ok mcp` itself but violated in practice by the MCP-auto-spawn path.

The spec doesn't address this. D4's rationale is about `ok mcp`'s direct behavior; D9 reaffirms `ok start` + `ok init` run `ensureProjectGit`. But the intersection — `ok mcp` → auto-spawn `ok start` → `ensureProjectGit` — falls between the two decisions.

**Current design:** D4 "`ok mcp` does NOT auto-git-init." D9 "Auto-git-init runs in `ok start` AND `ok init`, NOT in `ok mcp`."

**Issue not addressed:** the `ok mcp` → auto-spawn `ok start` path bypasses D4's intent.

**Alternative:**
- (a) Extend the opt-in check: when `ok mcp` auto-spawns `ok start`, pass `--no-auto-git-init` flag (or env var). Spawned `ok start` skips `ensureProjectGit` and the sibling starts in disk-only / degraded-shadow mode — consistent with D4's "no MCP-triggered side effects" principle.
- (b) Detect "spawned from MCP" in `ensureProjectGit` and abort with a user-facing log. But this is a brittle cross-process detection pattern.
- (c) Accept the gap and document it in §14 Risks.

**Trade-off:**
- *(a)*: one flag propagation; sibling starts in degraded mode; user gets the CLI output (preview block) if they later invoke `ok start` directly.
- *(b) / (c)*: less code but less principled.

**Status:** CHALLENGED

**Suggested resolution:** Add an explicit decision (new D11) to cover this: "`ok mcp` → auto-spawned `ok start` runs with `--no-auto-git-init` (or equivalent env var); the auto-spawned server starts in no-shadow mode. User invokes `ok start` directly to opt in to git-init." This preserves D4's principle across the transitive call boundary.

Alternatively, reframe D4: "`ok mcp` invocations MAY cause `git init` via the auto-spawn path. Users who wish to avoid this should set `OK_MCP_AUTOSTART=0` or run `ok init` explicitly first." This is honest disclosure instead of pretending the boundary is cleaner than it is.

---

### [M] Finding 6: §9's "`createServer()` is the single choke point" is factually incorrect for the Vite dev plugin

**Category:** DESIGN + FACTUAL
**Source:** DC2 (stakeholder gap — dev-experience engineer)
**Location:** §9 System design, "Enforcement point(s)"
**Issue:** The spec claims: "Enforcement point(s): `createServer()` is the single choke point; all server entrypoints (`ok start`, Vite dev plugin, Desktop utility, `bootServer`) flow through it."

This is false for the Vite dev plugin. `packages/app/src/server/hocuspocus-plugin.ts:144` calls `initShadowRepo(PROJECT_ROOT)` directly at module load, bypassing `createServer()`. It also creates its own `Hocuspocus` instance at line 161, its own `persistence` extension at line 184, etc. The plugin is a parallel implementation of `createServer`, not a caller of it.

In practice this doesn't cause a regression today because `PROJECT_ROOT = resolve(PLUGIN_DIR, '../../../..')` (the OK repo itself) always has `.git/`. But the spec's architectural claim ("single choke point") is incorrect and papers over real divergence.

This matters for two reasons:
1. **Future drift**: if a maintainer modifies `createServer` to run `ensureProjectGit` at the top and trusts the "single choke point" claim, the Vite plugin's `initShadowRepo` call site will silently lag. Any future mode of Vite dev that works against a non-repo-root dir (e.g., a sandbox contentDir) will regress.
2. **Scope completeness**: §16 SCOPE doesn't list `hocuspocus-plugin.ts`. If auto-git-init should run in `bun run dev` against non-repo dirs, the plugin needs the same wiring — and the spec doesn't enumerate it.

**Current design:** Claim that `createServer()` is the single enforcement point.

**Alternative:**
- (a) Add the Vite dev plugin to the enforcement surface: either migrate it to use `createServer()` (preferred; removes the parallel implementation), or add a mirroring `ensureProjectGit` call at the top of the plugin.
- (b) Correct the spec to say: "Enforcement: `createServer()` handles CLI and Desktop entrypoints; the Vite dev plugin operates against the OK repo root exclusively (has `.git/` by construction) and does not need auto-git-init."

**Trade-off:**
- *(a)*: aligns architecture with the spec's claim; requires touching `hocuspocus-plugin.ts`.
- *(b)*: honest framing; lower code-change footprint.

**Status:** CHALLENGED

**Suggested resolution:** Pick (b) as minimum viable: correct the spec so the architectural claim isn't misleading. Consider (a) as Future Work if a real non-repo-root dev use case emerges (e.g., agent-sim flows against a sandbox contentDir).

---

### [M] Finding 7: D5 / NG5's "silent orphan beats a one-line warning" is under-argued for a pre-production migration event

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §10 D5, §3 NG5, §4 P3, §5 P3 user journey
**Issue:** The spec's rationale for silent-orphan is: "adding detection + warning code solely to surface a dir we have no other reason to touch is itself legacy code." This is a *maintenance* argument. But the decision's impact is *user-facing*, and the spec doesn't interrogate the user-facing impact:

A pre-production user with `.openknowledge/` on disk runs the new OK. Today's state:
- CLI startup: no mention of `.openknowledge/`.
- Shadow repo: silently repopulates at `.git/openknowledge/` (new spec path).
- `.openknowledge/` sits on disk forever (or until `rm -rf`).
- User's prior attribution history, timeline entries, saved versions, rescue buffers are *orphaned with no user-visible signal*.

The spec argues this is acceptable because A3 ("No existing production users rely on the `.openknowledge/` standalone path") is rated "MEDIUM confidence, pre-production." But pre-production *is* when you have the opportunity to onboard migration cleanly. Shipping a silent orphan locks in a disclosure hole for any user who finds OK *before* this spec ships and upgrades *after*.

The maintenance argument is also asymmetric: "a warning branch is itself legacy code" counts the detection code against one side of the ledger, but doesn't count the loss of the user's timeline history or the support surface area when a user asks "where did my history go?"

The one-line warning ("Detected legacy `.openknowledge/` directory from an older OK version. Your prior attribution history is orphaned. Delete it with `rm -rf .openknowledge/` when convenient.") is:
- \~6 lines of code (an `existsSync` check + a `console.warn`).
- Fireable once per startup.
- Removable in a follow-up spec after N weeks of running to ensure adoption.

The tradeoff — 6 lines of legacy code for N weeks vs. permanent silent disclosure hole — seems clearly to favor the warning. The spec's reasoning treats the warning as permanent; it doesn't need to be.

Additionally, R4's acceptance criteria — `rg '\.openknowledge/' packages/` returns zero runtime hits — is measuring a proxy (code-grep count), not the actual concern (user experience). A gated one-time detector is still "code to support," but it's support proportional to the risk it mitigates.

**Current design:** Silent orphan. No detection, no warning.

**Alternative:**
- (a) **Time-boxed detector**: include a legacy-dir check in this spec's implementation; remove it in a follow-up spec after 4 weeks / 2 release cycles.
- (b) **Auto-migration warning + opt-in**: detect `.openknowledge/`, print a one-time warning with a `--migrate-standalone` flag suggestion. Still no auto-mutation (NG4 holds), but user is informed.
- (c) **Accept silent orphan** but at minimum add it to `packages/cli/README.md` or the docs site upgrade notes so users who search for "where did my OK timeline go" have a hit.

**Trade-off:**
- *(a)*: 6 lines of short-lived code, zero permanent maintenance burden, perfect pre-prod onboarding UX.
- *(b)*: more code; closest to a "migrate-me" verb for users.
- *(c)*: maintenance-minimal, and provides disclosure through a non-runtime surface.

**Status:** CHALLENGED

**Suggested resolution:** Adopt (a) — a time-boxed warning is the best compromise between D5's maintenance posture and the user-facing disclosure concern. Add a secondary spec or follow-up task to remove the detector after N weeks. Alternatively, adopt (c) as a minimum bar (docs disclosure) even if (a) is declined.

---

### [M] Finding 8: `ensureProjectGit` wired into `initAsync` means R6 cannot fail-fast per its acceptance criterion

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE perspective)
**Location:** §16 SCOPE, §6 R6, §9 System design
**Issue:** This overlaps audit Finding 1 but is reframed as a *design* concern: the spec's SCOPE says "wire `ensureProjectGit` into `initAsync` before `initShadowRepo`; propagate `didGitInit` to degraded array on failure." R6 says "exits with a non-zero status."

`initAsync` in `standalone.ts:871` runs *after* the HTTP listener is bound — the `createServer()` function returns a `ServerInstance` with `ready: Promise<void>`, and `initAsync` fulfills that promise asynchronously. Subsystem failures inside `initAsync` push to `degraded[]` and the server continues running. This is the entire purpose of the async-ready architecture: transient subsystem failures shouldn't kill the HTTP listener.

For R6's fail-fast behavior to hold, `ensureProjectGit` must run *before* `createServer()` returns a `ServerInstance` (or throw synchronously inside `createServer`). That's a structural change the spec doesn't describe.

If the implementer follows §16 SCOPE literally, git-init failure shows up as `degraded: ['project-git']` after `await ready` resolves — the server is running, HTTP listener bound, user gets no clear error. The R6 acceptance criterion ("exits non-zero with error message") cannot be satisfied from that code location.

The existing `bootServer` architecture has a pre-`createServer` hook (`autoInitFn` at line 137) that fires *before* `createServer()` is called. If `ensureProjectGit` runs at this layer:
- It throws synchronously for CLI → CLI catches → prints R6 error → exits non-zero. R6 holds.
- For Desktop utility process → IPC the error → main process shows a dialog → user fixes. Desktop equivalent of R6 holds.
- For the Vite dev plugin (Finding 6) → plugin doesn't invoke `bootServer` but the OK repo root is fine.

This aligns with the spec's stated intent (R6 fail-fast) AND the existing architecture's extension pattern (autoInitFn). The SCOPE instruction to wire it into `initAsync` is the wrong layer.

**Current design:** "`packages/server/src/standalone.ts` — wire `ensureProjectGit` into `initAsync` before `initShadowRepo`; propagate `didGitInit` to degraded array on failure"

**Alternative:** Wire `ensureProjectGit` as a composable `bootServer` hook similar to `autoInitFn`. Or extend `autoInitFn` to return `{ didAutoInit, didGitInit }`. Either way, the call site is in `bootServer` (pre-`createServer`), not `initAsync` (post-HTTP-bind).

**Trade-off:**
- *Current*: simpler wiring (inside `initAsync` where `initShadowRepo` already is), but cannot satisfy R6.
- *Alternative*: one more hook in `bootServer`, but satisfies R6 as written.

**Status:** CHALLENGED

**Suggested resolution:** Pick the bootServer hook layer. Revise §16 SCOPE to: "`packages/server/src/boot.ts` — add `ensureProjectGitHook` (or extend `autoInitFn` return shape); surface `didGitInit` on `BootedServer`; `ProjectGitInitError` propagates to caller for R6 non-zero exit." Then `initAsync` doesn't need to change.

---

## Low Severity

### [L] Finding 9: §9 Data flow diagram doesn't account for the test harness's `gitEnabled: false` path

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §9 Data flow, §11 Q3 resolution
**Issue:** The test harness (`packages/app/tests/integration/test-harness.ts:117`) passes `gitEnabled: false` to `createServer`. Q3's resolution says "every test will trigger auto-`git init` (~100-200ms × ~50 tests = ~5-10s overhead)."

This is correct *under the assumption* that `ensureProjectGit` runs unconditionally — but `gitEnabled: false` in persistence.ts controls `scheduleGitCommit`, not `initShadowRepo`. So in today's codebase, even with `gitEnabled: false`, `initShadowRepo` runs and tests currently use standalone mode (since test tmpdirs have no `.git/`).

The spec's Q3 answer is accurate but elides a design question worth raising: should `gitEnabled: false` *also* gate `ensureProjectGit`? Two options:

- (a) Keep `ensureProjectGit` unconditional. Tests pay the \~5-10s cost. The production code path is exercised every test run (SPEC cites this as a feature).
- (b) Gate `ensureProjectGit` on `gitEnabled`. Tests skip entirely. `initShadowRepo` would also need a `gitEnabled` gate to avoid the ENOTDIR-on-no-`.git` failure; this is structurally what the new single-mode wants anyway.

Option (b) has a hidden benefit: it makes the auto-git-init opt-outable via a public API, which is exactly what Finding 5 needs for the `ok mcp` → auto-spawned `ok start` path.

**Status:** CHALLENGED (perspective gap, not a blocking design flaw)

**Suggested resolution:** Add a brief note in §9 acknowledging that `gitEnabled` currently gates git-commit but not shadow-init, and that the spec could extend `gitEnabled` to gate `ensureProjectGit` as a unified opt-out. Not blocking, but relevant for Finding 5 and anyone reading the spec to understand the test harness's ergonomics.

---

### [L] Finding 10: The spec doesn't mention how auto-git-init interacts with the save-version flow and CC1 broadcaster

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §9 Data flow, §13 Deployment
**Issue:** The save-version endpoint (`packages/server/src/api-extension.ts:1819`) calls `saveVersion(shadow, ...)` which creates a project-repo commit via `simpleGit({ baseDir: projectDir })`. In standalone mode today, this path degrades (no parent repo → skip project commit). After this spec, `projectDir` always has `.git/` — but it's a git repo that OK created, initially empty, with no user intent to track content.

Scenarios worth considering:
1. **First save-version after auto-git-init**: OK creates the first commit in a repo the user never intended to git-track. Is this surprising? Is it documented? The preview block mentions "Initialized git repo" but not "subsequent Save Version calls will create commits in this repo."
2. **User runs `git log` after using OK**: sees OK-authored commits in a repo they thought was empty. They may not understand whether those were created by them or by OK.
3. **CC1 broadcaster**: fires on file-index changes. Not directly affected by auto-git-init (the `__system__` doc path is orthogonal). But worth confirming in the spec that CC1 doesn't observe `.git/` state.

These aren't blockers, but they're stakeholder-gap concerns (a user-facing engineer would flag "what happens the first time I save a version in an auto-initialized repo?"). The spec's §9 "Primary flow" stops at "createFileWatcher → startHeadWatcher → HTTP listen" and doesn't trace downstream effects.

**Status:** CHALLENGED (documentation gap)

**Suggested resolution:** Add a brief §9 note:
- "Auto-git-init creates an empty parent repo. The first `save-version` call creates a user-visible commit in this repo (via `simpleGit` at `packages/server/src/api-extension.ts:1819`). This is consistent with today's integrated-mode behavior, but users in the former-standalone population will see `git log` output they didn't before."
- "CC1 broadcaster does not observe `.git/` state; no interaction with auto-git-init."

Also consider extending the preview-block disclosure to mention that Save Version will create commits in the auto-initialized repo.

---

## Confirmed Design Choices (summary)

Design choices that held up under challenge, grouped by lens:

**DC1 (simpler alternatives explored):**
- D2 (silent auto-init with preview-block disclosure, CLI side): The non-interactive stance is consistent with the rest of the CLI and the Desktop Navigator flow. The Finding 3 concern is about Desktop-side disclosure specifically, not CLI.
- D3 (default branch `main` for auto-init): Correctly overrides user `init.defaultBranch` config; `--initial-branch=main` is well-supported on the minimum git version.
- D7 (keep `resolveShadowDir` as a function, collapse return type to `string`): Preserves D22's single-source-of-truth contract with minimal API break.
- R7 (`.gitignore` untouched when auto-git-init fires): Avoids surprising users with mystery gitignore lines.

**DC2 (stakeholder perspectives considered):**
- D6 detection approach (`existsSync(.git)` without `.isDirectory()`): Correctly covers the worktree-marker case. (The issue is elsewhere — see Finding 4.)
- R2 acceptance criterion structure (mechanical integration test via tmpDir + HEAD existence check): Testable, clear, no subjective judgment needed.
- SCOPE-level test harness accommodation: Q3 correctly identifies that the harness will light up every test run, which exercises the production path.

**DC3 (framing holds where challenged):**
- G2 (zero observable change for existing-`.git/` projects): True for non-worktree projects; the mode-branch removal is a structural simplification without behavior change for P1 users.
- NG4 (never auto-delete legacy dirs): Correct principle — OK should not mutate user filesystem beyond its own namespace. (The Finding 7 argument is that this principle *also* applies to auto-`git init`, which mutates user filesystem beyond OK's namespace, but that's a separate framing challenge already covered.)

---

## Severity calibration summary

- **4 HIGH**: D1/W3 re-examination (Finding 1), R6 capability regression (Finding 2), D10 Notification insufficiency (Finding 3), D6/R3 worktree regression (Finding 4).
- **4 MED**: D4 MCP auto-spawn footgun (Finding 5), §9 single-choke-point falsity (Finding 6), D5/NG5 silent-orphan tradeoff (Finding 7), initAsync vs fail-fast layer mismatch (Finding 8).
- **2 LOW**: gitEnabled test-harness gating (Finding 9), save-version/CC1 documentation gap (Finding 10).

The HIGH findings cluster around two root themes:
1. **Auto-`git init` as a silent filesystem mutation of the user's namespace** — violates the spec's own NG4 principle (no mutation beyond OK's namespace). Findings 1, 2, 3 all orbit this.
2. **Worktree support is a silent regression** — Finding 4, reframed from audit. Not safely deferred.

The MED findings cluster around *architectural seams the spec collapses optimistically*: claiming single-choke-point enforcement that doesn't exist (F6), claiming fail-fast that initAsync can't deliver (F8), claiming MCP boundary isolation that the auto-spawn violates (F5), claiming silent-orphan is cheaper than a disclosure (F7).
