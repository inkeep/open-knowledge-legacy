# Design Challenge Findings

**Artifact:** `specs/2026-04-08-workspace-cleanup/SPEC.md`
**Challenge date:** 2026-04-08
**Challenger:** nested Claude, read spec cold, verified claims against live codebase and templates
**Total findings:** 9 (3 High, 4 Medium, 2 Low)

Headline: the spec is solving a real cleanup problem at the right altitude, and most of its decisions hold up. BUT it has two material factual errors — one invalidating the "shipped bug" framing in the Problem Statement, and one that would cause the proposed change to break CI on first run. These are load-bearing and must be fixed before the PR is written.

---

## High Severity

### [H] Finding 1: The "shipped codemirror duplication bug" does not exist in the form the spec claims

**Category:** DESIGN (but traces to a factual misread of evidence)
**Source:** DC3 (framing validity)
**Location:** SPEC.md §1 Problem Statement gap 5; §7 M2; §8 "bun.lock evidence of the bug"; §9 Step 1; §11 Q1; §14 R1; D1; evidence/bun-overrides-root-only.md
**Issue:** The spec asserts that the child-workspace override in `packages/app/package.json:62-65` is a **shipped bug** currently producing **duplicate `@codemirror/state` and `@codemirror/view` resolves** in the dep tree. The "evidence" cited is `grep -o '"@codemirror/state": "[^"]*"' bun.lock | sort -u` returning two lines (`^6.0.0` and `^6.6.0`). This is a misread of the lockfile format.

**Current design:** "**Verified via root `bun.lock`: two distinct version ranges are present** (`^6.0.0` and `^6.6.0`), meaning the dep tree has duplicate codemirror state/view resolves — the exact failure mode the override was meant to prevent."

**What I verified independently:**
```bash
# The actual resolved package blocks in bun.lock:
grep -E '^\s+"@codemirror/state":\s*\[' bun.lock
  → "@codemirror/state": ["@codemirror/state@6.6.0", ...]       # exactly ONE
grep -E '^\s+"@codemirror/view":\s*\[' bun.lock
  → "@codemirror/view": ["@codemirror/view@6.41.0", ...]         # exactly ONE

# Physical node_modules confirms:
ls node_modules/.bun/ | grep codemirror+state
  → @codemirror+state@6.6.0                                      # exactly ONE hoisted copy
ls node_modules/.bun/ | grep codemirror+view
  → @codemirror+view@6.41.0                                      # exactly ONE hoisted copy
```

The "^6.0.0" and "^6.6.0" lines the spec grep-quoted are **dep range declarations inside transitive packages' dependency metadata** (e.g., `@codemirror/language` declares a peer range of `"@codemirror/state": "^6.0.0"`). Bun's solver successfully reconciled all these ranges to a single resolved version. The lockfile does not show duplication; it shows the solver working correctly. In fact, `@codemirror/view` has SEVEN distinct range declarations in the lockfile (`^6.0.0`, `^6.17.0`, `^6.23.0`, `^6.27.0`, `^6.35.0`, `^6.37.0`, `^6.41.0`) — all satisfied by a single `@codemirror/view@6.41.0`. If the spec's "count distinct grep ranges" methodology were valid, codemirror/view would be 7x duplicated; it is not.

**Alternative:** Re-frame the override move as **dead-config housekeeping**, not a bug fix. The child override is indeed ignored by bun (that claim holds via docs). Moving it to root is defensible as idempotent cleanup and latent-defect prevention (if a future child pulls in a codemirror range that forces a duplicate, the root override will catch it). But today, the y-codemirror.next StateField binding is not broken, the source-mode editor is not silently desynced, and the CRDT is not dropping writes. The failure mode described in `evidence/bun-overrides-root-only.md` §Failure mode is not currently manifesting.

**Trade-off:** Recharacterizing the gap changes the PR's framing (bug fix → cleanup) but not the diff. It also changes:
- **M2 acceptance criterion** ("lockfile has exactly one `@codemirror/state` version") — this is already true today. The gate is a no-op verification, not a fix verification.
- **Commit 1 title** (`fix: move codemirror overrides to workspace root`) — should be `chore:`, not `fix:`.
- **The urgency of the whole PR** — the Complication section leans heavily on "concrete failure modes ... silent CRDT sync failures" as the business case. If that's not actually happening, the cleanup is lower-priority than framed.
- **Commit 1 in §9 Step 9** ("bug fix, isolable") — still isolable, but no longer a fix.

**Status:** CHALLENGED
**Suggested resolution:** Re-verify the claim with `grep -E '^\s+"@codemirror/state":\s*\[' bun.lock` (the canonical lockfile resolution line) and update §1 gap 5, §8 bun.lock evidence section, §11 Q1, D1, and the commit title to reflect that this is config hygiene, not a bug fix. Optionally, keep the change in scope because the override IS dead code and moving it is the right thing — but don't lean on the "shipped CRDT bug" framing.

---

### [H] Finding 2: `bun test` in packages with zero test files EXITS CODE 1 — D13 as specified will break CI on first run

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — no SRE would ship this)
**Location:** SPEC.md §9 Step 3 note ("adding `test: bun test` to core and server is safe; bun test will exit cleanly if there are no `*.test.ts` files yet"); D13; §6 "Must" row for core/server scripts
**Issue:** The spec's rationale for D13 hinges on the claim that `bun test` is safe to add to `packages/core` and `packages/server` because "bun test will exit cleanly if there are no `*.test.ts` files yet." This is false.

**Current design:** "`packages/core/package.json` gains `typecheck` and `test` scripts ... `test: bun test`"

**What I verified independently:**
```bash
cd /tmp && mkdir bt-test && cd bt-test && echo '{"name":"bt-test","type":"module"}' > package.json
bun test
# → error: 0 test files matching **{.test,.spec,_test_,_spec_}.{js,ts,jsx,tsx} in --cwd="/private/tmp/bt-test"
# → exit=1
```

Bun `1.3.11` (the pinned version) errors out with exit code 1 when no test files are found. The correct flag is `--pass-with-no-tests`, which I verified works:
```bash
bun test --pass-with-no-tests   # → exit=0
```

`packages/core` and `packages/server` have zero `*.test.ts` files today (verified via listing `src/`). Adding `"test": "bun test"` to their `package.json`, then running `bun run check` at root (which calls `turbo run test`), would cause those packages' test tasks to fail, which would fail the turbo run, which would fail the root check. **This is the exact opposite of what D13 is trying to achieve.**

**Alternative:** Three options:
1. **Use `--pass-with-no-tests`**: `"test": "bun test --pass-with-no-tests"` in both core and server. Minimal change. Allows tests to be added later and picked up automatically.
2. **Don't add a `test` script at all in core/server for now.** Turbo will silently skip them (confirmed experimentally against openbolts below). Add the script later when the first test is written. Drops D13 to "add `typecheck` only." Safer still, at the cost of a dangling TODO to remember.
3. **Use a shell guard**: `"test": "ls src/**/*.test.ts 2>/dev/null && bun test || echo 'no tests'"`. Fragile and ugly; don't do this.

Option 1 or Option 2 both work. Option 2 has precedent — openbolts's `docs` package has no `test` script at all, and `bun run test` at the openbolts root (which does `turbo run test`) works fine: it produces "8 successful / 8 total" when only 4 of 5 packages have test scripts. I verified this by running `bun run test` in `~/openbolts` live.

**Trade-off:**
- Option 1 costs 4 characters of flag per package; locks in the "packages should have a test script" convention explicitly.
- Option 2 drops 2 lines from the diff and shrinks D13 to typecheck-only; relies on convention-by-absence.

**Status:** CHALLENGED
**Suggested resolution:** Update D13 to use `bun test --pass-with-no-tests` OR to drop the `test` addition entirely. Either way, update SPEC.md §9 Step 3 note ("bun test will exit cleanly") to remove the false claim — this is the kind of detail that makes specs look sloppy to reviewers. Also update M1 acceptance ("bun run check passes") to clarify that the fresh package `test` tasks must not regress the gate.

---

### [H] Finding 3: Scope-drift — dead config hunt is incomplete; `.gitignore` has dead `init_spike/` entries and is missing `.turbo/`

**Category:** DESIGN / SCOPE
**Source:** DC2 (stakeholder gap) + DC1 (consistency)
**Location:** SPEC.md §1 gap 6; §6 "dead config" rows; §9 Step 7; D6, D7, G6; §16 SCOPE
**Issue:** The spec identifies two dead config items (`biome.jsonc:38` `!init_spike` and `ci.yml` `feat/init-spike` branch triggers) and scopes them together as cleanup hygiene. But the dead-config hunt is incomplete: `.gitignore` has **two dead `init_spike/` entries** (lines 8-9, 24), and — critically — is **missing the `.turbo/` entry** that the same PR needs because it's adding turbo. Both openbolts and agents have `.turbo/` in .gitignore.

**What I verified independently:**
```bash
cat /Users/edwingomezcuellar/projects/open-knowledge/.gitignore
# Shows:
#   init_spike/src/**/*.js          ← dead (directory gone)
#   init_spike/src/**/*.js.map      ← dead
#   init_spike/content/test-doc.md  ← dead
# Missing: .turbo/

cat ~/openbolts/.gitignore
# Has: .turbo/ (present)
```

Without `.turbo/` in .gitignore, the first `bun run check` post-merge will produce dirty working copy state (turbo creates `.turbo/` directories per-package). A developer running `git status` after `bun run check` would see untracked `.turbo` directories. Every CI contributor will hit this.

**Alternative:** Add `.gitignore` to the SCOPE list in §16. In Step 7 (or a new step), delete the three dead `init_spike/*` lines and add `.turbo/`. This is one file and one commit, exactly the shape of the other hygiene work. The omission is surprising given that §1 gap 6 is specifically about dead config cleanup and §9 Step 2 introduces turbo.

**Trade-off:** None — it's strict addition of 4 lines changed in one already-on-the-radar file. Without it, the PR ships a known problem.

**Status:** CHALLENGED
**Suggested resolution:** Add `.gitignore` to §16 SCOPE. Add a new functional requirement: "Root `.gitignore` ignores `.turbo/` and has no `init_spike/` entries." Add to §9 Step 7. Update D6 to cover `.gitignore` cleanup too, or add D6b.

---

## Medium Severity

### [M] Finding 4: The `agents` template is not actually "one turbo call" — the spec's CI-pattern claim is based on one template, not two

**Category:** DESIGN / FRAMING
**Source:** DC3 (framing validity) + DC1 (decision quality)
**Location:** SPEC.md §1 gap 4 ("openbolts CI is 2 lines; agents is one turbo call"); D4; §5 P3; §8 template precedent table
**Issue:** The spec repeatedly describes the CI cleanup as backed by **both** template repos. But `~/agents/.github/workflows/ci.yml` is in fact a multi-stage pipeline: changeset-check job, ci-run job on `ubuntu-32gb`, TURBO_TOKEN/TURBO_TEAM secrets, 30-minute timeout, sparse-checkout composite actions, merge-queue handling. It is NOT "one turbo call." The "one turbo call" shape — `bun install && bun run check` — only applies to **openbolts**.

This doesn't invalidate the decision (openbolts alone is a fine precedent), but the spec's presentation of "both templates use X" for CI shape is not accurate. D4's evidence row cites `openbolts/.github/workflows/ci.yml` only; the template precedent table in §8 is ambiguous; but §1 gap 4 claims "agents is one turbo call" which misrepresents the agents template.

**Alternative:** Soften the framing. "Openbolts ci.yml is our closest shape precedent (agents is more elaborate due to its scale)." Keeps the decision, removes the overclaim.

**Trade-off:** None — it's a documentation accuracy fix.

**Status:** CHALLENGED
**Suggested resolution:** Update §1 gap 4 and §8 template precedent table to note that openbolts is the canonical precedent for the CI shape; agents is directionally similar but operationally different. Don't delete D4; just ground it in the single template that actually matches.

---

### [M] Finding 5: R2 ("turbo's `dependsOn: ^build` forces builds of packages that don't have a build step") is undersized — turbo's actual skip semantics are unverified

**Category:** RISK / DECISION
**Source:** DC2 (stakeholder gap)
**Location:** SPEC.md §14 R2; §9 Step 2 turbo.json shape; D13
**Issue:** The spec rates R2 as "Low likelihood, Low impact" with mitigation "Turbo skips tasks that don't exist; openbolts has packages without build and it works." I verified this live by running `bun run test` in `~/openbolts` — yes, it works, and the `docs` package without a `test` script is skipped silently. BUT the spec does NOT independently verify it for open-knowledge's specific topology (`packages/core` and `packages/server` have zero scripts at all, not zero specific scripts). openbolts's `docs` package at least has a `scripts` block. And a web search for "turbo run missing script" returns community reports of errors, not silent skips, for certain configurations.

The risk as written glosses over a subtle question: **does turbo skip packages with zero `scripts` block differently from packages with a `scripts` block missing the specific task?** The D13 rationale assumes they behave the same.

**What I verified independently:**
- openbolts `docs` has a scripts block with no `test` → turbo silently skips `test` for it (live test)
- open-knowledge `core`/`server` have NO scripts block at all — unverified behavior under turbo

**Alternative:** Pre-verify by doing a 2-minute spike: add `turbo.json` with the minimal shape, add a script-less package, and run `turbo run test`. If it skips cleanly, R2 is genuinely Low. If it errors, D13 is necessary but must use `--pass-with-no-tests` (per Finding 2). Either way, spike before writing the PR.

**Trade-off:** 2 minutes of verification vs. potential "oops we shipped a broken turbo config" PR revision.

**Status:** CHALLENGED
**Suggested resolution:** Before executing §9, run a minimal `turbo run test` test where one package has no scripts block. Update R2 with verified skip-semantics evidence. This may also inform whether D13 option 2 ("drop `test` entirely, let turbo skip") is viable.

---

### [M] Finding 6: The `$@codemirror/state` override deferral syntax at root is load-bearing but Q1 is marked P0 while the spec commits the change to the critical path

**Category:** RISK / DECISION
**Source:** DC2 (stakeholder gap)
**Location:** SPEC.md §11 Q1; §14 R1; §9 Step 1; D11
**Issue:** Q1 asks whether `$@codemirror/state` at root resolves to the workspace children's range without a direct root dep. This is tagged P0 but Status is "Open (needs 5-min test post-scaffold)." D11 is LOCKED with rationale "direct port of current semantics." R1 rates this as Medium/Medium. These are mutually inconsistent — if D11 is LOCKED on a syntax whose viability at root is "open," the decision is ASSUMED, not LOCKED.

Beyond the paperwork issue: **if the `$@pkg-name` deferral syntax doesn't work without a direct root dep,** then the fallback (concrete version pin) has a downside the spec doesn't discuss: **the pin becomes stale**. Every time `packages/app` bumps its codemirror version, a contributor has to remember to update the root override too, or else the root override will downgrade the workspace. The spec treats the fallback as "equivalent" — it's not.

**Alternative (better fallback):** If `$@pkg` doesn't work at root, use a root-dep-less workaround: add `codemirror`/`@codemirror/state`/`@codemirror/view` to the root's own `devDependencies` (marking them as hoist anchors) so the deferral has something to defer to. This keeps the deferral semantics intact and avoids the stale-pin problem. It does pollute root devDeps slightly, but that's exactly what openbolts/agents do for cross-workspace deps they want to control.

**Trade-off:** Root devDep noise vs. stale-pin maintenance burden.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) resolve Q1 BEFORE locking D11 — mark D11 ASSUMED until verified, then LOCK. Or (b) resolve Q1 by adding the codemirror packages to root devDeps as hoist anchors, which makes the deferral syntax definitionally work. Update R1's "fall back to concrete version pin" to include the staleness caveat, OR document the hoist-anchor alternative.

**Note:** This is especially salient given Finding 1 — if there's no actual duplication today, the override itself is preventive rather than curative, and the cost of getting the override syntax wrong is lower. But it's still load-bearing for the PR's own gate (M2).

---

### [M] Finding 7: The "5-commit sequence vs. single atomic" decision (D10) is delegated but the sequence has an ordering bug

**Category:** SEQUENCING
**Source:** DC1 (simpler alternative) + DC2
**Location:** SPEC.md §9 Step 9 (commit order); D10; Q4
**Issue:** The 5-commit sequence is:
1. `fix: move codemirror overrides to workspace root`
2. `chore: add root turbo.json + switch root scripts to turbo`
3. `chore: adopt AGENTS.md + CLAUDE.md symlink convention`
4. `ci: collapse workflow to single install + bun run check`
5. `chore: remove dead init_spike config`

Commit 2 introduces a turbo-dependent root `bun run check` script. Commit 4 updates CI to call `bun run check`. Between commits 2 and 3, if someone pushes to CI at an intermediate state, the CI may fail because CI is still calling the OLD 7-step working-directory pipeline, but the root package.json has already changed semantics. More importantly: **D13's package script additions (core/server `typecheck` + `test`) are not explicitly sequenced** — if they land in commit 2 (turbo wiring) or commit 3, the order matters. If they land in a separate step before commit 2, that's 6 commits, not 5.

Also: commit 2 alone leaves the repo in a state where `bun run check` calls `turbo run typecheck` but core/server may not have the `typecheck` script yet (depending on ordering). First `bun run check` between commits would fail silently or loudly.

**Alternative:** Either (a) make commits atomic by squashing commit 2 + D13 + commit 4 into one ("chore: introduce turbo task graph + matching CI"), OR (b) make D13 commit 0 (before everything) so every subsequent commit sees consistent package scripts. Option (a) is cleaner. The "single atomic PR" alternative the spec mentions in §9 Step 9 is arguably the right default, not the exception — bisect across tooling churn is rarely valuable.

**Trade-off:** Atomic PR is harder to revert surgically if something breaks. 5-commit sequence is harder to author correctly and carries intermediate-broken-state risk.

**Status:** CHALLENGED
**Suggested resolution:** Promote "single atomic PR" to the default recommendation. If keeping 5 commits, add D13's package script additions as commit 0 or split commit 2 into "2a: add package scripts for core/server" and "2b: wire turbo + root scripts". Update §9 Step 9 ordering explicitly to show D13's placement.

---

## Low Severity

### [L] Finding 8: NG4 (root tsconfig.json defer) — the "genuine split" framing may not hold; open-knowledge's core/server/cli/app/docs already have enough tsconfig overlap to benefit

**Category:** DEFERRAL
**Source:** DC1 (simpler alternative)
**Location:** SPEC.md §3 NG4; D8; §15 Future Work "Explored"
**Issue:** The spec defers root `tsconfig.json` base to Future Work, arguing that `~/agents` doesn't have one and `~/openbolts` does, so it's a "genuine split" judgment call. But looking at the actual open-knowledge tsconfigs:
- `packages/core/tsconfig.json`: 13 compilerOptions, ES2022, strict, bundler resolution, noEmit
- `packages/server/tsconfig.json`: **IDENTICAL 13 compilerOptions** to core
- `packages/cli/tsconfig.json`: (not read, but likely similar)
- `packages/app/tsconfig.json`: (not read, but Vite-flavored)

Core and server are byte-for-byte identical in their compilerOptions. That's already the drift the NG4 "Triggers to revisit" section names: "two packages end up with divergent compilerOptions." They're currently convergent — adding a root base now prevents future drift cheaply. The deferral reasoning ("openbolts yes, agents no, judgment call") underweights the fact that open-knowledge is closer in size to openbolts than agents, and already exhibits the duplication pattern.

**What I verified independently:** Diffed core/server tsconfigs — identical.

**Alternative:** Add a 10-line `tsconfig.base.json` at root, have core and server extend it, cli and app keep their bundler-specific fields. Small diff, prevents future drift, matches openbolts precedent.

**Trade-off:** Adds 1 file to scope (small). Adds 2 lines of `"extends": "../../tsconfig.base.json"` to core/server tsconfigs. Downside: foreclosed approach — if agents-style "each package standalone" turns out to be a better fit for open-knowledge later, it's a small diff to revert.

**Status:** CHALLENGED
**Suggested resolution:** Re-read §15 Future Work "Explored" note on tsconfig base with open-knowledge's own drift evidence. If core/server tsconfigs are already identical, the "revisit trigger" has already fired and the item should move In Scope. Note: adding this expands the PR from "small cleanup" to "small cleanup + one architectural decision" — the user may still prefer to defer, which is fine, but the deferral should be explicit judgment, not "templates are split."

---

### [L] Finding 9: The spec doesn't address what happens to `packages/app`'s package-level `check` script (NG8) — inconsistency with the root gate's new coverage

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** SPEC.md §3 NG8; §8 packages/app scripts; G1
**Issue:** NG8 is marked "NOT UNLESS" and preserves `packages/app`'s `bun run check` script. But the script's content is divergent:
```json
"check": "tsc --noEmit && biome check . && bun test && vite build"
```
After the root cleanup, a contributor runs `bun run check` at root → covers all packages. Then runs `cd packages/app && bun run check` → runs biome scoped to packages/app only (different coverage), then `bun test` (different than the root turbo-mediated test), then vite build. These two `check` commands give different guarantees. A contributor iterating in `packages/app` might think they've validated locally when they haven't.

**Alternative:** Either (a) rename `packages/app/package.json` scripts's `check` → `check:local` or `check:package` to disambiguate, OR (b) rewrite `packages/app/package.json`'s `check` to just invoke the root script (`cd ../.. && bun run check`), OR (c) delete the package-level check script and document that `bun run check` runs from root.

**Trade-off:** Keeping as-is preserves the "package-focused iteration" value NG8 claims. But the value is fake — if the root gate and package gate don't match, the package gate is a local convenience with false-green risk.

**Status:** CHALLENGED
**Suggested resolution:** Don't expand scope to touch this unless it becomes a pain point. But note in §15 Future Work "Identified" that `packages/app`'s `check` script diverges from root and should eventually be reconciled.

---

## Confirmed Design Choices (summary)

Design choices that held up under challenge:

- **D2 (add root turbo.json)** — Both templates have it; openbolts shape cleanly applies. Confirmed by reading `~/openbolts/turbo.json`.
- **D3 (root check = typecheck + lint + test + build)** — Verbatim openbolts pattern. Confirmed.
- **D5 (AGENTS.md real + CLAUDE.md symlink)** — Both templates use this; git tracks symlinks as mode 120000 (verified via `git ls-files -s CLAUDE.md` on `~/agents`). Git mv + ln -s preserves content + history cleanly. Low risk of biome symlink processing issues because open-knowledge's biome config doesn't target .md files (verified `bunx biome check CLAUDE.md` returns "ignored").
- **D6 (remove `!init_spike` from biome.jsonc)** — Verified: line 38, directory gone. Correct single-line delete. (But see Finding 3 — incomplete hunt.)
- **D7 (remove `feat/init-spike` branch triggers)** — Verified: lines 5 and 7 of ci.yml. Correct two-line delete.
- **D12 (scope is 7-9 files)** — Approximately correct; would become 8-10 with .gitignore (Finding 3) and possibly 9-11 with D13 fix (Finding 2 option 1).
- **NG1, NG2, NG3 (package structure, runtime code, CLI behavior untouched)** — Correctly out of scope; the PR's diff genuinely stays in tooling layer.
- **NG6 (changesets unchanged)** — Correct deferral; no blocker.
- **G7 (zero new deps except turbo)** — Clean scope boundary. Correct.

---

## Meta observations for the spec author

1. **The bug framing (Finding 1) is the biggest issue.** Everything downstream — the urgency of the PR, the "fix:" commit title, M2, R1, Q1 — leans on the premise that codemirror is currently duplicated. It's not. Re-run the lockfile verification yourself: `grep -E '^\s+"@codemirror/state":\s*\[' bun.lock` returns ONE line. The `grep -o | sort -u` methodology the spec used extracts range declarations from transitive dep metadata, not resolved package entries, and gives a false duplicate count. This is an easy error to make because bun.lock's text format inlines dep ranges from every transitive package.

2. **The spec correctly identified the overall cleanup problem** (template drift after PR #10). It's real, tractable, right-sized. The specific technical errors in Findings 1 and 2 are fixable without changing the spec's overall shape or rejecting its direction.

3. **D13 is the single most fragile decision** (Finding 2) and it was introduced mid-scaffold via an A1 invalidation (per `meta/_changelog.md`). Decisions added late under pressure to close open questions are where most bugs hide. Give D13 a second pass.

4. **The 5-commit sequence (Finding 7) should not be delegated to the implementer.** D10 is marked DELEGATED ("implementer's call"), but the ordering hazard is a spec-time concern: if core/server `typecheck` scripts don't exist before commit 2's turbo wiring, any intermediate state is broken. Specs that delegate sequencing to implementers are ducking a decision they should own.

5. **Scope is actually under-bounded, not over-bounded** (Finding 3) — the dead-config hunt in `.gitignore` and the missing `.turbo/` ignore are gaps the same cleanup ethos should catch. The spec is disciplined about contracting scope (the NG section is detailed and reasonable) but didn't run the same discipline on expansion.

6. **Overall altitude** — the spec is solving a real problem at the right altitude. It is NOT over-engineering; it is NOT under-engineering. It is sloppy in two places (Findings 1 and 2) and slightly incomplete in one (Finding 3). None of these are reasons to re-scope the spec. All of these are reasons to fix before writing the PR.
