# Audit Findings

**Artifact:** `specs/2026-04-08-workspace-cleanup/SPEC.md`
**Audit date:** 2026-04-08
**Baseline commit audited:** `0a14ba3` (drift check: current HEAD `0a5673b` adds only a new spec directory; no changes to files this spec analyzes)
**Total findings:** 8 (2 high, 4 medium, 2 low)

---

## High Severity

### [H] Finding 1: `packages/app` has no Playwright config or E2E tests — M6, R4, A6, and §6 Should-have all reference infrastructure that doesn't exist

**Category:** FACTUAL / COMPLETENESS
**Source:** T1 (codebase)
**Location:** SPEC.md §6 (should-have row "packages/app Playwright E2E still passes"), §7 M6, §12 A6, §14 R4, §9 Step 8
**Issue:** Multiple risk/requirement/metric entries presuppose an existing Playwright E2E harness in `packages/app`, but the harness does not exist in the current tree. Only a stale `test:e2e` script remains in `packages/app/package.json:15` (`npx playwright test`) — pointing at nothing.
**Current text:**
- §6: `| Should | packages/app Playwright E2E still passes | cd packages/app && bun run test:e2e completes | Unchanged config |`
- §7 M6: `E2E Playwright tests still pass in packages/app`
- §12 A6: `Playwright webServer config in packages/app/playwright.config.ts doesn't break under turbo`
- §14 R4: `Playwright webServer breaks because cwd changes`
**Evidence:**
- `find packages/app -name 'playwright*'` → no results
- `find packages/app -type d -name 'tests'` → no results
- `find packages/app -type f -name '*e2e*' -not -path '*node_modules*'` → no results
- The only `playwright.config.ts` in the repo lives under `.claude/worktrees/presence-awareness-ux/init_spike/playwright.config.ts` (a stale worktree)
- `packages/app/package.json:12` still has `"test": "bun test --path-ignore-patterns 'tests/e2e'"` — filter references a non-existent directory
**Impact:** M6 and the §6 Should requirement cannot be verified because there is nothing to run. A6 and R4 describe a non-existent threat model. Worse, this is symptomatic of stale E2E scaffolding in `packages/app/package.json` (both `test` and `test:e2e` reference non-existent `tests/e2e`) that's a natural candidate for "dead config cleanup" scope — yet the spec leaves it untouched and instead treats it as working infrastructure.
**Status:** CONTRADICTED (by codebase)
**Decision-implicating?** Yes — this affects what the cleanup actually covers. Options: (a) drop M6/R4/A6/should-have row; (b) add the stale `test:e2e` removal to SCOPE as another dead-config item (consistent with the spec's stated "remove dead config" theme); (c) leave the E2E script alone but acknowledge it's a no-op placeholder.

---

### [H] Finding 2: Spec's `check` script contradicts its "openbolts pattern verbatim" citation — openbolts does NOT include `build` in `check`

**Category:** FACTUAL
**Source:** T2 (direct source read of `~/openbolts/package.json`)
**Location:** SPEC.md §6 (Must row "Root check script runs typecheck+lint+test+build"), §9 Step 4, §10 D3, §5 P1 "After" block
**Issue:** The spec repeatedly cites openbolts as the precedent for a root `check` script composed of `typecheck && lint && test && build`. Openbolts actually uses `typecheck && lint && test && test:integration`. The presence of `build` in open-knowledge's `check` is not openbolts precedent — it's a novel choice.
**Current text:**
- §6: `"check": "bun run typecheck && bun run lint && bun run test && bun run build" (openbolts pattern)`
- §9 Step 4: same script
- §10 D3: `Root check script = typecheck + lint + test + build, via turbo` / Evidence: `openbolts package.json:13-24`
- §5 P1 "After": `bun run check # → turbo run typecheck ... → turbo run test ... → turbo run build`
**Evidence:**
```
$ cat ~/openbolts/package.json | grep -E '"check"|"check:fast"'
"check:fast": "bun run typecheck && bun run lint && bun run test",
"check": "bun run typecheck && bun run lint && bun run test && bun run test:integration",
```
The paused-spec evidence file `specs/2026-04-08-workspace-layout/evidence/openbolts-template.md:46-47` already documents this correctly — so the audit spec is internally inconsistent with its own predecessor evidence.
**Impact:** The rationale "openbolts pattern verbatim" is wrong. Including `build` in the pre-commit/CI gate is a substantive design choice — it slows `check` meaningfully (next build + vite build + tsdown build) and changes what "fast feedback" looks like. It may still be the right call, but D3's evidence collapses: there's no precedent for it in either template repo (agents uses `turbo check --filter=... && format:check && ...`, not a build step in `check`). This is decision-implicating because a reviewer taking the spec at face value would believe the pattern is battle-tested precedent.
**Status:** CONTRADICTED
**Decision-implicating?** Yes — D3's justification is load-bearing and factually wrong. Either drop `build` from `check` (match openbolts), or keep it and re-justify with an honest rationale ("we want builds in the pre-commit gate because X; neither template repo does this but Y").

---

## Medium Severity

### [M] Finding 3: Spec claims `packages/core` and `packages/server` have no tests; the codebase has 6 test files in those packages today

**Category:** FACTUAL / COHERENCE
**Source:** T1
**Location:** SPEC.md §9 Step 3 ("Why no test adjustment needed"), §12 A2
**Issue:** The spec's rationale for adding `test: bun test` to core/server claims "bun test will exit cleanly if there are no `*.test.ts` files yet. When tests get added later, they'll automatically be picked up." Tests already exist.
**Current text:** SPEC.md:326 — "adding `test: bun test` to core and server is safe; bun test will exit cleanly if there are no `*.test.ts` files yet. When tests get added later, they'll automatically be picked up."
**Evidence:**
```
$ find packages/core packages/server -name '*.test.ts'
packages/core/src/utils/identity.test.ts
packages/core/src/extensions/jsx-tokenizer-prototype.test.ts
packages/core/src/extensions/jsx-component.test.ts
packages/core/src/extensions/frontmatter.test.ts
packages/server/src/file-watcher.test.ts
packages/server/src/persistence.test.ts
```
**Impact:** Two concrete consequences the spec doesn't account for:
1. The implementer will get *real* test runs from D13, not no-op scripts. Those tests must pass. If any of them are currently broken (flaky, env-dependent), they surface during the cleanup PR and get wrongly attributed to the cleanup.
2. **Coverage semantics change:** today, CI runs `bun test` at repo root (`.github/workflows/ci.yml:51`), which bun runs recursively — finding all 6 tests. After migration to `turbo run test`, turbo will invoke each package's `test` script. For `packages/app` this is `bun test --path-ignore-patterns 'tests/e2e'`, for core/server the new `bun test`, for cli the existing `bun test`. Net result *should* be the same recursive coverage, but through a different invocation path. The spec does not explicitly trace this equivalence — A4 asserts it without the per-package walk the assumption verification plan calls for.
**Status:** CONTRADICTED (the narrative "when tests get added later" is factually wrong now)
**Decision-implicating?** No — D13 is still correct to add the scripts. But the rationale and A4 verification need a rewrite that accounts for existing tests and explicitly maps current → new coverage.

---

### [M] Finding 4: Evidence file cites bun issue #25835 as confirming "root-only overrides," but the issue is about `file:` path resolution, not child-workspace override support

**Category:** FACTUAL
**Source:** T4 (GitHub issue verification)
**Location:** `evidence/bun-overrides-root-only.md:31`
**Issue:** The evidence file says the bun issue "title itself confirms bun's expected behavior is root-only." The issue is actually about `file:` path resolution semantics for root-level overrides — it presupposes root-level overrides work and asks bun to fix how `file:` paths inside them resolve. It is not about whether workspace-child overrides are ignored.
**Current text:** `evidence/bun-overrides-root-only.md:31` — "Related bun issue: oven-sh/bun#25835 ... the issue title itself confirms bun's expected behavior is root-only."
**Evidence:** Fetched https://github.com/oven-sh/bun/issues/25835 — issue describes vendored-tarball `file:` paths being resolved relative to the requesting package instead of the workspace root. Does not mention child-workspace override support.
**Impact:** The underlying claim (bun overrides are root-only) is still correct — it's confirmed by bun's own "top-level only" docs and definitively by npm's [cli#4517](https://github.com/npm/cli/issues/4517) (which bun targets for compat). The npm issue is the load-bearing citation. Removing the bun#25835 reference would tighten the evidence without weakening the conclusion. As-is, a reader following the link will find it doesn't confirm what the evidence says it confirms, which undermines trust in the rest of the evidence file.
**Status:** INCOHERENT (citation doesn't support its stated conclusion)
**Decision-implicating?** No — the bug diagnosis holds; only the citation chain is weak. Remove or re-characterize the #25835 link.

---

### [M] Finding 5: §6 requirement "AGENTS.md contains current CLAUDE.md content" (zero content loss) conflicts with §9 Step 5 "Optional content update" to reflect new root scripts

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md §6 Must row, §9 Step 5 note
**Issue:** §6 requires the full `CLAUDE.md` content to migrate "including commands, monorepo structure, per-package sections, conventions, research references, changesets" with "Zero content loss." §9 Step 5 then says "Optional content update (low-risk): Update the dev cycle section in AGENTS.md to reference the new root scripts." Updating the dev cycle section is a content *change* (the current CLAUDE.md has `cd packages/<pkg> && bunx tsc --noEmit` and `cd packages/<pkg> && bun test` patterns at lines 29-30 — exactly what the root scripts are replacing). "Zero content loss" and "Optional content update" pull against each other.
**Evidence:** `CLAUDE.md:24-31`:
```
### Quality gates

bun run lint                         # Biome lint across all packages
bun run format                       # Biome format across all packages
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck per package
cd packages/<pkg> && bun test           # Unit tests per package
```
If copied verbatim, the new `AGENTS.md` will document outdated gate commands that contradict the root `bun run check` this PR is creating.
**Impact:** Not blocking — both interpretations ship a working PR. But the acceptance criterion "Zero content loss" can't be verified if the spec also says content updates are allowed. Either (a) scope the update into a Must row and drop "Zero content loss," or (b) keep verbatim and add a follow-up task to update the guidance. Leaving it ambiguous means the implementer makes the call without a clear spec signal.
**Status:** INCOHERENT
**Decision-implicating?** No — editorial decision. Pick one and say so.

---

### [M] Finding 6: `.gitignore` has 4 dead `init_spike` lines that are in the same class of dead config the spec is cleaning up but are not in scope

**Category:** COMPLETENESS
**Source:** T1
**Location:** SPEC.md §6, §9, §16 SCOPE
**Issue:** The spec cleans up dead `init_spike` references in `biome.jsonc:38` and `ci.yml:5,7` under the "dead config cleanup" banner. `.gitignore` contains four more dead `init_spike` lines that match the same pattern — directory removed, references stale.
**Current text:** SCOPE list (SPEC.md:567-576) includes `biome.jsonc` and `ci.yml` but not `.gitignore`.
**Evidence:**
```
$ grep -n init_spike .gitignore
7:# init_spike: accidental tsc JS emit beside src/ (sources are .ts/.tsx; .d.ts may live under src/types/)
8:init_spike/src/**/*.js
9:init_spike/src/**/*.js.map
24:init_spike/content/test-doc.md
```
**Impact:** Incomplete cleanup. M5 (`grep -c init_spike .github/workflows/ci.yml biome.jsonc` returns 0) doesn't cover `.gitignore`, so it won't catch the miss. If the stated principle is "remove dead `init_spike` config wherever it lives," `.gitignore` should be in SCOPE. If the principle is narrower ("only config that affects tool behavior"), that narrowing should be explicit. Low-risk surgical fix — 4 line deletions.
**Status:** STALE (the spec's scope didn't catch all instances)
**Decision-implicating?** No — small additive fix. Add `.gitignore` to SCOPE, update M5 to include it.

---

## Low Severity

### [L] Finding 7: Numeric imprecisions and off-by-one line counts

**Category:** FACTUAL
**Source:** T1, T2
**Location:** SPEC.md §1, §8, §10
**Issue:** Several small numeric claims are off or imprecise:
1. `.github/workflows/ci.yml` is 59 lines, not 60 (SPEC.md:21 and §8 header both say "60 lines")
2. `~/openbolts/turbo.json` is 24 lines, not 25 (SPEC.md:238 table row "openbolts turbo.json | 25 lines, 7 tasks")
3. SPEC.md §8 line 240 says `openbolts bun run check (2 lines total)` — openbolts CI is 25 lines total; the "2 lines" reading only makes sense if "lines" means "run commands," which is confusing in a context that's also measuring workflow file length
4. `@codemirror/view` has **7 distinct version ranges** in `bun.lock` (not 2 like `@codemirror/state`). The evidence file (`bun-overrides-root-only.md:53-57`) only shows the `@codemirror/state` two-version case and doesn't mention that `@codemirror/view` is even more fragmented.
**Evidence:**
```
$ wc -l .github/workflows/ci.yml ~/openbolts/turbo.json ~/openbolts/.github/workflows/ci.yml
59 .github/workflows/ci.yml
24 ~/openbolts/turbo.json
25 ~/openbolts/.github/workflows/ci.yml

$ grep -o '"@codemirror/view": "[^"]*"' bun.lock | sort -u
"@codemirror/view": "^6.0.0"
"@codemirror/view": "^6.17.0"
"@codemirror/view": "^6.23.0"
"@codemirror/view": "^6.27.0"
"@codemirror/view": "^6.35.0"
"@codemirror/view": "^6.37.0"
"@codemirror/view": "^6.41.0"
```
**Impact:** None of these change decisions. But point 4 is worth surfacing: the `@codemirror/view` duplication is *worse* than the evidence file leads you to believe, which actually *strengthens* the bug story — the current state has 7 different view version ranges being dedup'd only by the (inert) child override. After the fix, all 7 should collapse.
**Status:** STALE / CONTRADICTED (minor)
**Decision-implicating?** No. Editorial precision fix.

---

### [L] Finding 8: Spec adds `"dev": "turbo run dev"` at root without precedent from either template repo

**Category:** COHERENCE
**Source:** T2
**Location:** SPEC.md §9 Step 4
**Issue:** Spec adds `"dev": "turbo run dev"` to root `package.json`. Openbolts has `dev: {}` in `turbo.json` but no root `dev` script (you run dev from individual packages). Agents has a root `dev` script, but it filters to 5 specific packages, not a naked `turbo dev`. A naked `turbo run dev` in open-knowledge would start both `packages/app` (vite dev server on 5173) AND `docs` (next dev on 3010) in parallel — desirable or not, it's an undocumented behavior choice.
**Current text:** SPEC.md:339 — `"dev": "turbo run dev"`
**Evidence:** `~/openbolts/package.json` has no `dev` script. `~/agents/package.json:14` has `"dev": "turbo dev --filter=@inkeep/agents-api --filter=@inkeep/agents-manage-ui --filter=@inkeep/agents-docs --filter=@inkeep/agents-core --filter=@inkeep/agents-sdk"` — filtered, not naked.
**Impact:** Minor. The naked `turbo run dev` works but the spec should briefly acknowledge (a) that it's not a direct port of either template, and (b) what happens when you invoke it (both app and docs dev servers start). Alternatively, drop it — users can still `cd packages/app && bun run dev` as documented today.
**Status:** INCOHERENT (minor — claims template precedent but has none)
**Decision-implicating?** No.

---

## Confirmed Claims (summary)

Claims that checked out under verification:

- **Bug diagnosis (§1 Gap 5, D1, evidence file):** `packages/app/package.json:62-65` has the overrides block; it's a workspace child, so bun ignores it. Root `bun.lock` has two distinct `@codemirror/state` version ranges confirming non-dedup. The fix direction (move to root) is correct. (T1, T2, T4)
- **`packages/core` and `packages/server` have no `scripts` block (D13):** Confirmed via direct file read. (T1)
- **`packages/cli` and `packages/app` have typecheck + test scripts already:** Confirmed. (T1)
- **Template repo shape for AGENTS.md/CLAUDE.md symlink (D5):** Both `~/agents` and `~/openbolts` have `AGENTS.md` as a real file and `CLAUDE.md` as a 9-byte symlink to `AGENTS.md`. (T2)
- **Template repos both use turbo (D2):** Confirmed. `~/openbolts/turbo.json` (24 lines, 7 tasks), `~/agents/turbo.json` (181 lines). (T2)
- **Openbolts CI workflow shape (D4):** Single `bun install` + single `bun run check` step — matches the spec's "after" picture. (T2)
- **bun overrides are root-only (D1 core claim):** Confirmed by bun docs "top-level only" note + npm's [cli#4517](https://github.com/npm/cli/issues/4517) (bun aims for npm compat). The conclusion holds even though one of the cited issues (bun#25835) doesn't actually prove it — see Finding 4. (T4)
- **Turbo silently skips packages without matching scripts (D13 rationale):** Confirmed via [turborepo docs](https://turborepo.dev/docs/guides/skipping-tasks). (T4)
- **`~/openbolts/packages/docs` exists as a next/fumadocs workspace member (A7):** Confirmed. Precedent for docs-as-workspace-package under turbo. (T2)
- **Root `package.json` scripts and structure (§8):** All verbatim quotes in §8 match `package.json` at baseline. (T1)
- **`biome.jsonc:38` `!init_spike` entry (§1 Gap 6, D6):** Confirmed at that exact line. (T1)
- **`ci.yml` `feat/init-spike` branch triggers on lines 5 and 7 (§1 Gap 4):** Confirmed. (T1)
- **7 `working-directory` blocks in CI (§1 Gap 4):** Confirmed via `grep -c`. (T1)
- **CLAUDE.md is 6471 bytes, not a symlink, and has no AGENTS.md sibling (§1 Gap 1, §8):** Confirmed. (T1)
- **Drift check:** No changes to any file this spec analyzes between baseline `0a14ba3` and current HEAD `0a5673b` — only a new spec directory was added. Baseline is current.

## Unverifiable Claims

- **Q1 / A3: Whether `$@codemirror/state` deferral syntax resolves correctly at root when root has no direct codemirror dep.** The spec already flags this as UNCERTAIN with a verification plan (run `bun install` and inspect the lockfile). Bun docs don't document the `$packagename` syntax; no authoritative docs exist for this fallback behavior. This is correctly tagged as open in Q1 — audit confirms it remains unverifiable without running the install. Recommendation: execute the Q1 verification immediately after PR scaffold, before committing; the fallback to concrete version pins is already specified.

---

## Sources

- [Turborepo — Skipping tasks](https://turborepo.dev/docs/guides/skipping-tasks)
- [Turborepo — Running tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Bun — Overrides and resolutions](https://bun.sh/docs/install/overrides)
- [oven-sh/bun#25835](https://github.com/oven-sh/bun/issues/25835)
- [npm/cli#4517](https://github.com/npm/cli/issues/4517)
