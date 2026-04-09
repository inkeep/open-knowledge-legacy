---
name: Workspace cleanup spec changelog
description: Append-only process history for post-PR-#10 tooling cleanup
---

## 2026-04-08 — Spec scaffolded

- Baseline commit: `0a14ba3` (post-PR-#10 merge + zod 4 upgrade).
- Origin: PR #10 merged at 2026-04-08T23:57:52Z (merge commit `8971f7c`). Shipped 4-package workspace restructure (`packages/{core,server,cli,app}` + `docs/` at root). Gaps identified via /analyze pass comparing post-merge state to `~/agents` and `~/openbolts` template repos.
- Supersedes paused spec at `specs/2026-04-08-workspace-layout/` which was pre-merge speculation.
- 6 gaps + 2 cleanup items (biome exclusion, CI branch trigger) scoped in. 1 gap (root tsconfig base) deferred to Future Work as judgment call.
- 12 decisions drafted, 4 open questions, 7 assumptions, 8 risks. All P0.
- Cleanup scope locked to 5-7 files total (D12).

## 2026-04-08 — Q2 resolved, D13 added, A1 invalidated

- Read `packages/core/package.json`, `packages/server/package.json`, `packages/cli/package.json`.
- **Q2 resolved:** core and server are both source-consumed (`exports` → `./src/index.ts`). No build step needed. turbo `build` task will skip both.
- **A1 invalidated:** "Every package has a typecheck script" — WRONG. Both core and server have **zero scripts block**. Without scripts, `turbo run typecheck` silently skips them.
- **D13 added (LOCKED):** Add `typecheck` and `test` scripts to `packages/core` and `packages/server`. +4 lines total.
- **Scope updated:** D12 revised from "5-7 files" to "7-9 files" to account for core and server package.json edits.
- **§16 Agent Constraints SCOPE updated:** Added `packages/core/package.json` and `packages/server/package.json` explicitly.

## 2026-04-08 — Phase 6 audit + challenger (parallel subagents)

- Spawned two parallel nested subagents via Agent tool:
  - **Auditor** (loaded /audit + /spec): 8 findings — 2 HIGH, 4 MEDIUM, 2 LOW
  - **Challenger** (loaded /spec + design challenge protocol): 9 findings — 3 HIGH, 4 MEDIUM, 2 LOW
- Findings written to `meta/audit-findings.md` and `meta/design-challenge.md`
- Both subagents read the spec cold, verified claims against live template repos (`~/agents`, `~/openbolts`) and live post-merge codebase

## 2026-04-08 — Phase 7 assess-findings (loaded /assess-findings)

### Ground-truth verifications in-session

- **Canonical codemirror lockfile resolution:** `grep -E '^\s+"@codemirror/state":\s*\[' bun.lock` returns ONE line (`@codemirror/state@6.6.0`). Same for view (`@codemirror/view@6.41.0`). The "shipped bug" in the earlier draft does not exist. Challenger correct, auditor and original spec author (me) wrong — both used faulty `grep -o | sort -u` methodology that extracts transitive dep range declarations, not resolved versions.
- **Core + server have 6 test files** (4 in core, 2 in server). Auditor correct; challenger's "bun test exits 1 with no tests" concern is valid in the abstract but moot here since tests exist.
- **packages/app has no Playwright infrastructure:** `find packages/app -name 'playwright*'` empty; no `tests/e2e/` dir. Auditor correct. `packages/app/package.json` has phantom `test:e2e` script and stale `--path-ignore-patterns 'tests/e2e'` in `test`.
- **Openbolts `check` does NOT include `build`:** `~/openbolts/package.json` has `"check": "typecheck && lint && test && test:integration"`. Auditor correct that the earlier "openbolts verbatim" claim for `check = typecheck && lint && test && build` was factually wrong.
- **`.gitignore` dead config:** 3 init_spike lines (8, 9, 24), missing `.turbo/`. Both subagents correct.
- **`packages/core/tsconfig.json` ≡ `packages/server/tsconfig.json`** (byte-identical compilerOptions). Challenger correct — duplication already exists, "drift trigger" has fired via convergence.
- **`~/agents` CI is NOT "one turbo call":** It's a 434-line multi-stage ubuntu-32gb pipeline with TURBO_TOKEN, merge-queue handling, etc. Challenger correct — only `~/openbolts` matches the "2-line CI" shape; the "both templates" framing was wrong.
- **Bun workspace child overrides are silently ignored:** Confirmed via bun docs + npm/cli#4517. bun#25835 citation was weak (about file: path resolution, not workspace semantics). Auditor correct — removed from evidence file.

### User direction

User selected Option A/A/B/A/B for the 5 decision reopens with framing: "we're a greenfield project, we just want what's architecturally best and evidence-based correctness." This inverted several defaults toward architectural correctness over minimal-PR scope contraction.

### Spec rewrite (this session)

Coherent rewrite of SPEC.md applying all corrections:

**Problem Statement (§1):**
- Rewrote Complication paragraph — dropped "shipped bug with concrete failure modes" framing for codemirror; honest dead-config cleanup + latent-defect prevention
- Added Gap 7 (tsconfig duplication) and Gap 8 (.gitignore missing .turbo/) to the gap list
- Updated Resolution to include tsconfig base, .gitignore cleanup, phantom Playwright scripts, hoist anchors

**Goals (§2):**
- G2: Rewrote from "fix codemirror bug" to "dependency overrides at workspace root per convention"
- G5: Added — shared root tsconfig.json base
- G8: Added — phantom Playwright scripts removal

**Non-goals (§3):**
- NG4: REMOVED (tsconfig base moved to In Scope per D8 flip)
- NG7: Rewrote to cover packages/app check divergence as NOT NOW
- NG8: Kept for ESLint concerns
- NG9: Added — Playwright E2E restoration is out of scope

**Requirements (§6):**
- Added rows for: hoist anchors in root devDeps, root tsconfig.json base, 5× package tsconfig extensions, .gitignore cleanup + .turbo/ entry, phantom Playwright scripts removal, AGENTS.md content update (explicit, not "zero loss")
- Dropped Playwright should-have row
- Fixed `check` script row to match openbolts verbatim (no `build`)
- D13 row rationale updated (tests exist, scripts activate them)

**Metrics (§7):**
- Dropped M6 (Playwright), added M6-M8 (tsconfig extensions, .turbo/ ignore, phantom Playwright scripts removed)

**Current state (§8):**
- Fixed numeric: 59 not 60 lines for ci.yml, 24 not 25 for openbolts turbo.json
- Replaced "the bug" section with corrected canonical-lockfile-resolution verification showing single versions
- Added `.gitignore`, tsconfig duplication, phantom Playwright observations
- Softened "agents CI is one turbo call" framing — openbolts is the single precedent for the 2-line CI shape

**Proposed solution (§9):**
- Step 1: Reframed as "dead-config cleanup", added hoist anchor block for root devDeps
- Step 2: Unchanged (turbo.json) but explicit note: no `dev` task
- Step 3: NEW — Root tsconfig.json base + 5 package extensions
- Step 4: NEW — Add typecheck/test scripts to core + server (rewritten rationale)
- Step 5: Rewrote root scripts block — dropped `build` from `check`, dropped root `dev` script, matched openbolts exactly
- Step 6: AGENTS.md content update made explicit (not "optional")
- Step 7: CI rewrite unchanged
- Step 8: Dead config cleanup expanded to cover .gitignore
- Step 9: NEW — Phantom Playwright scripts cleanup in packages/app
- Step 10: Validation updated (canonical grep, tsconfig checks)
- Step 11: Replaced 5-commit sequence with single atomic PR per D10 LOCKED

**Decision log (§10):**
- D1: Reframed rationale (dead config, not bug fix)
- D3: Corrected ("openbolts verbatim" now actually matches openbolts — dropped `build` from `check`)
- D4: Softened framing (openbolts precedent, agents is different scale)
- D8: FLIPPED from DEFERRED-NOT-NOW to LOCKED-in-scope (root tsconfig base)
- D10: Changed from DELEGATED to LOCKED single atomic
- D11: Changed from `$` syntax alone to hoist anchors
- D13: Rationale corrected (tests exist; `bun test` safety is a non-issue here)
- D14: NEW — no root `dev` script
- D15: NEW — remove phantom Playwright scripts
- D16: NEW — add `.turbo/` to .gitignore, remove init_spike lines

**Open questions (§11):** Q1, Q2, Q3, Q4 all RESOLVED via decisions above. No remaining OQs.

**Assumptions (§12):** A1 deleted (superseded by D13). New A1 about hoist anchors. A2-A8 covering tsconfig compatibility risks.

**Risks (§14):** Dropped R1 (`$` syntax uncertainty — resolved by hoist anchors), R4 (Playwright — dropped). Added R2-R4 for tsconfig extension risks.

**Future Work (§15):** Removed tsconfig entry (now in scope). Added `bun test --pass-with-no-tests` note for future script-less packages. Moved NG7 (packages/app check divergence) to Identified.

**Agent constraints (§16):** SCOPE expanded to include 5 tsconfig files, .gitignore, hoist anchors in package.json. STOP_IF expanded to catch tsconfig extension breakage per package.

### Evidence file updates

- `bun-overrides-root-only.md`: Rewrote "Failure mode" section to acknowledge the bug isn't real. Removed bun#25835 citation (miscited per audit finding 4). Updated fix section to include hoist anchors rationale.
- `post-merge-state.md`: Fixed numeric imprecisions. Replaced "bug evidence" block with corrected canonical-resolution verification.

### Baseline commit update

- Updated from `0a14ba3` to `1ec2e23` (current origin/main after pull this session)
- Drift vs. spec-analyzed files: none (the 2 new commits past 0a14ba3 only touched `.changeset/config.json` and added `reports/bun-module-resolution-extensions/`)
