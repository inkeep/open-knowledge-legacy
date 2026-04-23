# Design Challenge Findings

**Artifact:** `specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md`
**Challenge date:** 2026-04-22
**Total findings:** 7 (3 High, 3 Medium, 1 Low)

The spec is well-scaffolded, tightly reasoned, and backed by thorough evidence. The most serious findings below are NOT reversals of D1–D11 — they are **incompleteness** findings against decisions the spec locks in. Specifically: D3/D4's "three `projectDir` leaks" count is wrong (there are at least six `PROJECT_ROOT` references in `hocuspocus-plugin.ts`, three of which are load-bearing for FR8 T2/T4 and unpatched in §9's Site 1 block). The "is there a fourth site?" prompt in the challenge instructions landed on three.

---

## High Severity

### [H] Finding 1: The "three `projectDir` leaks" enumeration is incomplete — FR8 T2 (Save Version) silently mutates the developer's real OK repo

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer running `bun run test:e2e` locally)
**Location:** §9 System design "Site 1" block (lines 155–174); `evidence/projectdir-couplings.md` §1–§3; FR4, FR8 T2

**Issue:** The spec enumerates exactly three `PROJECT_ROOT` leak sites (D3 BacklinkIndex, D4 persistence `getCurrentBranch`, D9 server-lock `worktreeRoot`). My re-investigation of `packages/app/src/server/hocuspocus-plugin.ts` finds **six** `PROJECT_ROOT` references post-line-146, of which **three additional sites are unaddressed** and at least one is load-bearing for the spec's own acceptance criteria:

| Line | Site | In spec? | Impact under spec |
|---|---|---|---|
| L121 | `acquireServerLock.worktreeRoot` | Yes (D9) | diagnostic drift (low) |
| L190 | `contentFilter.projectDir` | N/A (correctly gated via `process.env.OK_TEST_CONTENT_DIR` ternary) | already correct |
| L196 | `BacklinkIndex.projectDir` | Yes (D3) | cross-worker cache race (high) |
| L208 | persistence `getCurrentBranch` | Yes (D4) | WIP ref under dev's branch name |
| **L245** | **api-extension `getCurrentBranch`** | **NO** | `/api/timeline`, `/api/rescue` query wrong branch → FR8 T1's subject assertion may still pass (WIP write uses persistence branch) but the read-side assertion via `/api/timeline` queries under a DIFFERENT branch, returning empty |
| **L250** | **api-extension `projectDir: PROJECT_ROOT`** | **NO** | `/api/save-version` (FR8 T2) and `/api/rollback` call `simpleGit({baseDir: projectDir}).add() / .commit() / .tags()` against the dev's OK repo, creating `ok/v<N>` tags and commits in the real working tree during test runs |
| **L275** | **server-observer `getCurrentBranch`** | **NO** | `saveInMemoryCheckpoint` on bridge-merge loss writes `refs/checkpoints/*` with wrong branch — rare, but violates the D4 invariant |

**Current design:** `evidence/projectdir-couplings.md` §1–§3 names only three sites. The "Why these three show up together" section explicitly claims these are the complete set of post-SPEC-2026-04-21 drift.

**Alternative:** Collapse all `PROJECT_ROOT`-derived bindings to a single `const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT` at module top and thread it through all six (or seven, including L190 which can use the same uniform binding). Concretely:

```ts
const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT;
// ... use projectRoot in ALL of: runDevShadowInit, acquireServerLock,
// contentFilter, BacklinkIndex, persistence, API extension, server-observer
```

This is actually what the spec's §9 Site 1 block writes at line 158 (`const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT;`), then inconsistently stops applying halfway down the file. If the implementer follows §9's diagrammed fix literally, the rollback + save-version sites stay bug-for-bug identical.

**Trade-off:** Collapsing to a single binding is strictly simpler and more complete. The only "cost" is that the implementer must sweep three additional call sites the spec doesn't list. This is the `ASK_FIRST` check in §16 ("adding a new `projectRoot`-derived binding") — but the sites already exist; they were missed.

The most acute correctness consequence: **FR8 T2 (Save Version → `refs/checkpoints/<n>` + parent-repo commit + tag).** Under the spec as written, running T2 locally (`bun run test:integration`) while the dev has an unrelated branch checked out in the real OK repo will:
1. Create a real `ok/v<N>` tag in the dev's OK repo (`simpleGit({baseDir: PROJECT_ROOT}).tags()` at api-extension.ts:2370)
2. Create a real commit in the dev's OK repo (`pg.add('.') + pg.commit(...)` at api-extension.ts:2816)
3. Write `Co-Authored-By` trailers referencing test agent IDs

Developer re-runs `git status` post-test, sees mysterious tags and a commit they didn't author. This is the exact "Developer dirty-tree artifacts" risk (§14) — except the mitigation ("FR4 BacklinkIndex fix") doesn't cover it because the save-version path doesn't route through BacklinkIndex.

**Status:** CHALLENGED
**Suggested resolution:** Extend D3/D4 coverage to the full seven-site enumeration OR refactor to the single-`projectRoot`-binding approach. The evidence file should list all seven sites (or explicitly mark L245/L250/L275 as "out of scope — why"). Add to FR4 acceptance: "Playwright worker test exercising `/api/save-version` shows zero modification to `git status` in the parent OK repo and zero new tags matching `ok/v*`."

---

### [H] Finding 2: D6 fail-fast is enforced for only ONE of the two error branches in `handleDevShadowInitError`

**Category:** DESIGN
**Source:** DC2 (SRE / CI-operator perspective)
**Location:** D6 in §10; `dev-shadow-init.ts:46-91`; NG5 in §3; FR5 in §6

**Issue:** D6 and NG5 LOCK fail-fast on missing `git`. NG5 reads: "Fall back to a silent degraded mode if `git` is unavailable under isolation. Aligns with SPEC 2026-04-21 R6: 'does NOT fall back to a standalone shadow.' Fail loud." `handleDevShadowInitError` has TWO error branches:

```ts
// packages/app/src/server/dev-shadow-init.ts:46-54
if (err instanceof ProjectGitInitError) {
  io.logWarn(`[dev] ensureProjectGit failed: ${err.message}`);
  if (err.stderr) io.logWarn(`[dev] git stderr: ${err.stderr.trim()}`);
  io.exit(1);
  return;
}
io.logWarn('[dev] Shadow repo init failed (timeline features unavailable):', err);
// ← no exit; silent continuation
```

Only `ProjectGitInitError` fails fast. **Any other throw** from `ensureProjectGit` OR from `initShadowRepo` (EEXIST on race, disk full, corrupt `.git/`, lock collision on a stale `<shadowDir>/lock`, simple-git subprocess OOM) falls into the second branch: warn + continue. Under Playwright, the worker's `shadowRef.current` stays undefined, `gitEnabled: true` is set (per spec), and persistence's L2 drain at `persistence.ts:261-263` reads `shadowRef.current` → `undefined` → short-circuits commits. **The worker silently runs without shadow.** The test passes for non-shadow assertions, silently fails to produce `refs/wip/*` commits, and FR8 T1-T3 tests fail in a confusing way (ref doesn't exist) rather than clearly ("shadow failed to initialize, here's why").

**Current design:** FR5 says "if `ensureProjectGit` throws `ProjectGitInitError`, the dev plugin calls `process.exit(1)`". But NG5 says "silent degraded mode" is rejected. The spec's wording conflates two different questions:
1. "What if `git` isn't on PATH?" → `ProjectGitInitError` → fail loud (D6 addresses this)
2. "What if shadow init fails for any other reason?" → unaddressed; silent by default

**Alternative:** Under `isTestIsolated`, fail-fast on ALL shadow-init errors (both branches). The test-path should not share the production "degraded warn" behavior — production's rationale is "keep the dev server running even if shadow breaks so the user isn't blocked editing"; the test path has no such constraint, and silent coverage loss is worse than loud failure. Concretely:

```ts
export function handleDevShadowInitError(
  err: unknown,
  io: DevShadowInitIo,
  opts: { isTestIsolated: boolean },
): void {
  if (err instanceof ProjectGitInitError || opts.isTestIsolated) {
    io.logWarn(`[dev] shadow init failed: ${err}`);
    io.exit(1);
    return;
  }
  io.logWarn('[dev] Shadow repo init failed (timeline features unavailable):', err);
}
```

**Trade-off:** More code to thread `isTestIsolated` into the error handler; strictly safer under NG5. The existing helper signature already takes an opts object for dependency injection — adding one boolean is minor.

**Status:** CHALLENGED
**Suggested resolution:** Broaden D6/FR5 to cover the full error surface of `runDevShadowInit` under isolation, not just `ProjectGitInitError`. Add a row to §9's Failure modes table: "`initShadowRepo` throws (EEXIST / disk full / corrupt git) — detection: helper's catch branch; recovery: `exit(1)` under isolation (proposed); production path unchanged." Update FR5 acceptance criteria to assert the "non-ProjectGitInitError" case also fails loud under isolation.

---

### [H] Finding 3: `skipShadow: true` opt-OUT is a higher-risk default than `enableShadow: true` opt-IN — inverts the burden-of-proof against the 34-test silent majority

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** D2 LOCKED; §9 System design Site 2; FR3

**Issue:** The challenge prompt asked directly: "is `skipShadow: true` the right API shape, or would an opt-in flag be safer?" Investigating the Tier 1 test corpus:

- **36 integration test files** in `packages/app/tests/integration/`
- **3 tests** reference shadow concepts by grep (`shadow | wipRef | refs/wip | commitWip | SaveVersion | timeline | rollback`): `attribution-sweep-coverage.test.ts`, `mdx-extension.test.ts`, `persistence-fan-out.test.ts`
- **33 tests** are shadow-orthogonal: bridge-matrix, C1-C10 concurrent-write tests, CC1, backlinks, presence, session lifecycle, provider-pool, symlink, etc.

D2 LOCKS "both tiers get shadow by default" on the `/tdd` principle that `gitEnabled: false` mocks an internal collaborator. That principle is right for tests whose subject-of-verification includes shadow. It is WRONG for tests whose subject-of-verification is the bridge, the presence bar, the provider pool, or the session lifecycle — shadow is then irrelevant plumbing, not "the internal collaborator being verified," and the default-on stance imposes:

1. **~5-10s added to every Tier 1 run** (pre-accepted by SPEC 2026-04-21 Q3, but that was under the assumption `ensureProjectGit` alone is ~100-200ms × 50 tests; adding `initShadowRepo` subprocess pair is another 100-300ms × 50 tests → plausibly 15-25s, not 5-10s)
2. **Any `initShadowRepo` flake** (subprocess timing, EEXIST race, lock contention) becomes a flake class for all 33 shadow-orthogonal tests — violates SPEC 2026-04-19 G1 (≥95% PR-tier green rate). Shadow-unrelated-test flake attributable to shadow infra is the new failure class the spec's NFR "Reliability" section must address but dismisses with "each deterministic" (unproven for 33 tests).
3. **Cognitive overhead**: every new integration test author must now know "is my test shadow-orthogonal? Should I pass `skipShadow: true`?" — the `skipShadow` JSDoc risk-mitigation (§14 row 6) is a convention, not a compiler check.

An opt-IN flag reverses the burden: 3 tests explicitly opt in, 33 pay no cost, the flake-surface is localized to 3 tests, and `persistence-fan-out.test.ts` (FR6 migration) becomes `createTestServer({ withShadow: true })` instead of `createTestServer()` — same amount of code, narrower default.

**Current design:** `createTestServer()` default = shadow on; `{ skipShadow: true }` = off. D2 rationale cites `/tdd` + `persistence-fan-out.test.ts`'s hand-fork.

**Alternative:** `createTestServer()` default = shadow off (unchanged); `{ withShadow: true }` or `{ enableShadow: true }` opt-IN. `persistence-fan-out.test.ts` migrates to the opt-in flag (still satisfies D7's "delete hand-fork" — the hand-fork IS the manual `initShadowRepo` call; the opt-in replaces it). FR8 T1-T3 smoke tests opt in explicitly. The 33 shadow-orthogonal tests stay unchanged.

**Trade-off:** Opt-in preserves the current default's cost profile + flake surface. Loses the `/tdd` "don't mock internal collaborators" purity argument — but that argument only applies when shadow IS the collaborator under test; a presence-bar test that passes `{ gitEnabled: false }` isn't mocking shadow-the-collaborator, it's opting out of shadow-the-side-effect. The `/tdd` framing is arguably a category error. The Playwright tier's default-on stance is separately defensible (Playwright has `failOnFlakyTests: false` + retry absorbing infra flake per SPEC 2026-04-19), but Tier 1 has no such shock absorber.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine D2 with the 33:3 ratio and the flake-surface argument on the table. Two defensible exits:
- **(a)** Split D2 into two decisions: Playwright = default-on (infra cost is 4 workers × 100-500ms one-shot; test isolation already absorbs flake via Playwright retries); Tier 1 = default-off with opt-in flag (33:3 asymmetry; no retry shock absorber).
- **(b)** Keep D2 but validate the flake-surface claim: implement, run the full Tier 1 suite 50× under `--repeat-each=50` before considering D2 final, and reject if new flake class appears.

The `/tdd` argument against mocking internal collaborators is sound; it just doesn't cover the case where the collaborator is a side-effect the test doesn't care about. Presence-bar tests aren't mocking shadow; they're opting out of it.

---

## Medium Severity

### [M] Finding 4: Framing as "completion of SPEC 2026-04-21" obscures a meaningful design decision

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §1 Situation, §1 Resolution, §10 D2 rationale ("Completes SPEC 2026-04-21 Q3 intent")

**Issue:** The spec frames itself as "completing the intent of SPEC 2026-04-21 Q3" (§1 Resolution). Re-reading SPEC 2026-04-21 Q3 (quoted in `evidence/worldmodel.md` §7b): **"Every test will trigger auto-`git init` (~100-200 ms × ~50 tests = ~5-10s overhead). No harness change needed."**

Q3's resolution explicitly said **no harness change**. The Q3 decision was about auto-`git init` on every tmpdir; it did NOT extend to "therefore also enable shadow commits per-test." The SPEC 2026-04-21 §16 SCOPE line for the Vite dev plugin is **"call `ensureProjectGit(PROJECT_ROOT)` before `initShadowRepo`; on throw, surface via the existing `[dev]` warn path + `process.exit(1)` (no degraded bypass for dev server)"** — that's the *production* dev plugin path, not the test path. SPEC 2026-04-21's test-isolation story is: `ensureProjectGit` yes, `initShadowRepo` no, `gitEnabled:false` yes.

The current spec is NOT completing 2026-04-21's intent — it's **changing** that intent. That's a legitimate design choice (the `/tdd` argument, the feature-coverage gap, Miles's PR #277 being blocked all favor the change), but framing it as "completion" obscures the policy shift for reviewer mental model. A cold reader of SPEC 2026-04-21 Q3 would say "this question was already closed with 'no harness change needed.'"

**Current design:** "Resolution. Flip the guard in both test tiers. [...] Completes the intent of SPEC 2026-04-21-shadow-repo-single-mode Q3." (§1)

**Alternative:** Re-frame as: "Resolution. SPEC 2026-04-21 Q3 closed with 'no harness change needed' under the assumption that shadow-off integration tests were adequate. Subsequent work (PR #277, #268, #186, T5 deletion in PR #269) has invalidated that assumption — the no-harness-change closure is stale. This spec reopens Q3 with new evidence and directs: Tier 1 + Playwright both enable shadow."

**Trade-off:** The spec becomes explicit about overriding a prior decision, which is more honest and gives future reviewers a clean breadcrumb. No cost beyond one paragraph of §1 edit.

**Status:** CHALLENGED
**Suggested resolution:** Tighten §1 Resolution + D2 rationale to name this as a Q3-reopen rather than Q3-completion. Consider adding a corrigendum breadcrumb in SPEC 2026-04-21's Q3 entry per the CLAUDE.md post-ship corrigendum protocol.

---

### [M] Finding 5: D1 (PR #270 refactor out of scope) is argued on "blast radius" but the blast radius is largely within this spec's own SCOPE

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** D1 LOCKED in §10; §16 SCOPE list

**Issue:** D1 keeps PR #270's "unify dev-plugin + createServer" refactor out of scope on the argument that folding it in "expands blast radius." Investigating the relationship:

- `hocuspocus-plugin.ts` has its own `new Hocuspocus(...)` instance and wires 5+ extensions manually (L212-277)
- `standalone.ts` has `createServer()` which also does `new Hocuspocus(...)` and wires the same extension set
- Every time one of them gets a new extension / config, the other drifts
- The seven-site `PROJECT_ROOT` leak problem that D3/D4/Finding 1 address is **a direct consequence of this duplication**: the dev plugin manually wires `getCurrentBranch` three times, `projectDir` three times, etc., rather than routing them through one `createServer` options object

**If the two paths were unified now, D3/D4 become a single-option fix** (`createServer({ gitEnabled: isTestIsolated, projectDir: ... })` — one call site, one source of truth). The spec's own fix is essentially a manual unification that runs along a narrow FR4 seam.

D1's blast-radius argument weighs two bodies of work:
- **(a)** Ship this spec standalone (~7 sites patched manually, leaves duplication intact, leaves D1 seam for later)
- **(b)** Unify first, then ship this spec on top (one site patched, duplication deleted)

The argument for (a) is "PR #270's cadence shouldn't block." But the argument for (b) is that (a)'s patches are almost-certain to be re-opened when (b) lands — every line changed in this spec's dev-plugin fix will be re-touched during unification, or worse, will leak bugs into the unification's merge.

**Current design:** "Two separate problems sharing a boundary ≠ one problem; folding in expands blast radius." (D1 rationale)

**Alternative:** Either (i) sequence this spec AFTER PR #270's unification lands (defer 2-4 weeks; preserves the work), or (ii) absorb a narrow version of unification into this spec (just the dev-plugin's `new Hocuspocus` → `createServer()` collapse; defer the rest).

**Trade-off:** Sequencing risks: PR #270 might stall or change shape; the blocked consumers (Miles PR #277, Andrew #268, Mike #186) pay the wait cost. Absorption risks: larger PR, more review load. Going standalone risks: 7 patched sites become merge conflicts against PR #270.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine D1 with a direct ask to PR #270's author: "what's the eta, and is the collapse stable enough that this spec could land a 'tiny' unification as its dev-plugin Site 1?" If eta is weeks-not-days and the collapse shape is stable, (ii) is strictly better than the spec's current plan. The "seam" language in G4 already concedes this is dead-weight work that will be re-touched.

---

### [M] Finding 6: D7 (migrate `persistence-fan-out.test.ts`) discards genuinely useful isolation properties of the hand-fork

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** D7 LOCKED; FR6; `persistence-fan-out.test.ts:41-90`

**Issue:** D7 locks the migration on the argument "the hand-fork's existence IS the signal the harness was wrong shape." Investigating what the hand-fork gains:

`persistence-fan-out.test.ts` manually:
1. Creates a tmpdir with `projectDir = tmpDir` and `contentDir = join(tmpDir, 'content')` (nested, not flat)
2. Explicitly calls `initShadowRepo(projectDir)` and passes `shadowRepo: historyHandle` to `createServer`
3. Calls `clearContributors()` in before/afterEach at the test level (not the harness level)
4. Owns the full lifecycle with precise visibility

This gives the test author **precise control** over three axes the default harness hides:
- **Nested vs flat projectDir/contentDir split** — the hand-fork tests `projectDir = tmpDir; contentDir = join(tmpDir, 'content')`; the default harness uses `projectDir = contentDir = tmpdir`. These are different production topologies (`.open-knowledge/config.yml` `content.dir`). The hand-fork covers the nested-dir case; D7's migration collapses coverage into the flat-dir case only.
- **Pre-shadow vs post-shadow assertion shape** — the test can inspect `historyHandle.gitDir` at known timing; harness migration pushes that onto `server.shadowDir` with different lifecycle guarantees.
- **Per-test teardown order** — hand-fork lets the test choose when to `destroyShadowRepo` vs harness's blanket cleanup.

D7 says the hand-fork is "redundant once default harness supports shadow" — but redundancy is only true if the default harness exposes the same fine-grained control. The spec's Site 2 block doesn't expose a way to choose nested-vs-flat `projectDir`. That's either (a) a missing option in `createTestServer` that FR6 requires, or (b) a concession that `persistence-fan-out.test.ts` loses coverage of the nested-dir topology.

**Current design:** "The hand-fork's existence IS the signal the harness was wrong shape. Delete it."

**Alternative:** Migrate the EASY part of the hand-fork (manual `initShadowRepo` + `shadowRepo:` option), but retain the nested-dir `projectDir/contentDir` split via a harness option: `createTestServer({ withShadow: true, nestedProjectDir: true })`. OR: add a separate test at the server package unit tier (`packages/server/src/`) that covers the nested-dir case, so deleting the Tier 1 hand-fork doesn't lose coverage.

**Trade-off:** D7 as-written is simpler (-4 lines of boot code); the alternative adds an option. But that option likely needs to exist anyway — the production `.open-knowledge/config.yml` `content.dir` relative to `projectDir` is exactly this nested-dir split, and the harness currently can't exercise it.

**Status:** CHALLENGED
**Suggested resolution:** Before D7 locks, audit what the hand-fork's nested-dir split proves that the flat harness doesn't. If the answer is "nothing the server unit tier covers," D7 holds. If it's "the `contentRoot` path-join correctness in persistence.ts drain code," the coverage must be moved somewhere, not deleted.

---

## Low Severity

### [L] Finding 7: The "NG6 defers T4/T5" framing is defensible, but T4's absence makes FR8's acceptance criteria a weak proof that the harness works

**Category:** DESIGN
**Source:** DC3 (framing validity — acceptance criteria scope)
**Location:** NG6, D8 LOCKED, FR8

**Issue:** The challenge prompt asked: "NG6 defers T4/T5 — challenge whether at least one should ship with this spec." Investigating FR8 T1-T3:

- **T1**: Agent write → `refs/wip/main/agent-<connId>` exists with `wip:` subject. Proves: shadow init runs + single-commit write path works.
- **T2**: Save Version → `refs/checkpoints/<n>` + parent-repo commit + tag. Proves: shadow checkpoint + parent-git commit wiring works.
- **T3**: External disk write → `refs/wip/main/file-system` + `reconcile:` subject. Proves: file-watcher → external-change → shadow commit works.

All three are **single-write pathways**. What's untested by T1-T3:
- **Multi-writer fan-out**: the canary for the original `persistence-fan-out.test.ts` (per-drain-fan-out FR-7 in SPEC 2026-04-18). If FR6 migrates that test to the new harness, "coverage unchanged" is only true if T1-T3 exercise the multi-writer case — which they don't, explicitly.
- **Branch-switch park/restore cycle**: D8 defers T4 (rollback) and T5 (TimelinePanel), but the whole point of branch-scoped `reconciledBase` + shadow branch namespacing (the D4 fix) is to survive branch-switch. Without a branch-switch smoke in FR8, the D4 fix is load-bearing but unverified.
- **Round-trip read**: T2 asserts checkpoint creation but not checkpoint QUERY via `/api/timeline`. If the L245 `getCurrentBranch` bug (Finding 1) is unpatched, T2 writes to `refs/checkpoints/*` fine but the read-side timeline query reads the wrong branch and returns empty — test passes for the write but silently loses the read guarantee.

**Current design:** D8 LOCKED: "T1-T3 smoke tests; T4 (rollback E2E) + T5 (TimelinePanel UI render) are downstream feature tests, not this spec's acceptance bar."

**Alternative:** Add T3.5 (multi-writer fan-out, closest analog to the hand-fork's coverage) OR T6 (timeline query round-trip — write via agent, then `GET /api/timeline` returns the commit) to FR8. These are cheap (existing test infra + harness), close the FR6-deletes-coverage risk, and validate the spec's own D4 fix.

**Trade-off:** Adds two tests to FR8 → +~200 lines of test code. Minor.

**Status:** CHALLENGED
**Suggested resolution:** Add T6 (timeline query round-trip) to FR8 as a `Could` tier — it's the exact shape that would have caught the L245 `getCurrentBranch` leak in Finding 1, and it's the minimum acceptance bar for "shadow harness works for the consumer PRs (#277, #268, #186)."

---

## Confirmed Design Choices (summary)

**DC1 (simpler alternative):**
- **Option C rejection (central `enableShadowForTests()` helper)** holds up. The two harnesses are structurally different and separate binding sites is cleaner than a shared helper.
- **D5 (value dimensions = internal velocity + platform reliability)** is correctly scoped; the user-facing surface genuinely doesn't change.

**DC2 (stakeholder gap):**
- **Lock topology (A1) — per-directory scoping** is correct per source inspection. Four workers × four tmpdirs = four independent locks; no cross-worker contention. Concern only if a future spec introduces a shared global lock path, which is STOP'd in §16.
- **CC1 broadcaster orthogonality** (Q8) holds — `__system__` pseudo-doc is shadow-skipped throughout; broadcasts don't write to shadow.
- **Failure-modes table** (§9) correctly enumerates the known deterministic failure classes. Finding 2 expands it but doesn't invalidate it.

**DC3 (framing validity):**
- **Complication's three forces (§1)** — (1) feature-coverage gap, (2) delete-or-skip pattern, (3) `/tdd` mocking-internal-collaborator anti-pattern — genuinely interact. Remove any one and the spec's urgency weakens but the Resolution still stands. Findings 4–5 challenge the framing breadcrumbs, not the underlying forces.
- **G1 (automated coverage) and G3 (no CI regression)** are genuinely in tension — Finding 3's opt-in/out framing is the most direct surfacing of that tension; the spec's current posture bets on G1 > G3, which is a defensible product call.

---

## Meta: Challenges NOT surfaced

Inspecting the Decision Log §10, I walked each entry looking for un-addressed reversals. D5 (value dimensions), D10 (contributor-tracker auto-wire), D11 (boot.test.ts inline gitEnabled) all held up without credible counter-arguments. NG1 (per-worker isolation) is correctly marked NEVER. NG3 (PR #270 absorption) is challenged indirectly in Finding 5. NG4 (retroactively rewriting deleted tests) is the right default.

The "Tier 1 integration-only" framing that the challenge prompt invited me to challenge — I considered it and rejected: if the Playwright test coverage gap is the acute pain, Tier 1-only would not unlock Playwright timeline/save-version tests. "Playwright-only" is a stronger counter (Finding 3 partially encodes it). "Both-tiers-with-opt-in" is the strongest counter and Finding 3's recommended exit.
