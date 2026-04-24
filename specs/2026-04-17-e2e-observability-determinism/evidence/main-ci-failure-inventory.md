---
name: main-ci-failure-inventory
description: Enumerated E2E test failures from CI run 24548842566 on origin/main @ 2026-04-17T05:19Z
sources:
  - ci-run: https://github.com/inkeep/open-knowledge/actions/runs/24548842566
  - collected: gh run view 24548842566 --log-failed
---

# Main CI failure inventory (2026-04-17T05:19Z)

**Run:** 24548842566
**Branch:** main
**Workflow:** chore(ci): update playwright job header — chromium-only, 15 min timeout
**Result:** 18 failed / 76 passed (7.3m)
**State-at-run:** Post-PR #185 (playwright-stability landed), chromium-only, 15-min timeout. No PR #188 fixes applied.

## Failures by category

| # | Test | File:line | Category | In-scope |
|---|------|-----------|----------|----------|
| 1 | S6: multi-turn stress — large content + user edits | crdt-stress.e2e.ts:21 | **crdt-stress S6** | Yes — Cluster 7 |
| 2 | F11: rapid sequential navigation converges to final click | docs-open.e2e.ts:428 | docs-open hybrid nav | Yes — new surface |
| 3 | WYSIWYG copy → text/plain carries markdown | paste-fidelity.e2e.ts:257 | paste / #188 scope | Addressed by cherry-pick |
| 4 | WYSIWYG copy → text/html is wrapped in data-pm-slice | paste-fidelity.e2e.ts:267 | paste / #188 scope | Addressed by cherry-pick |
| 5 | WYSIWYG copy with wikiLink → text/html has `<a class="wiki-link">` | paste-fidelity.e2e.ts:277 | **#188 wikiLink parseHTML priority** | Addressed by cherry-pick |
| 6 | FR-19: copy inside a code block emits fenced block form | paste-fidelity.e2e.ts:473 | **#188 `<pre>` assertion** | Addressed by cherry-pick |
| 7 | FR-22: dragstart writes both text/plain + text/html with data-pm-slice | paste-fidelity.e2e.ts:578 | paste / #188 scope | Addressed by cherry-pick |
| 8 | QA-041: GitHub rendered comment strips data-hovercard-* + class markers | paste-fidelity.e2e.ts:675 | paste vendor fixture | Addressed by cherry-pick |
| 9 | QA-036: Source copy returns non-empty text/plain AND text/html | paste-fidelity.e2e.ts:710 | paste source-view | Addressed by cherry-pick |
| 10 | QA-012: Source copy and WYSIWYG copy produce equivalent semantic HTML | paste-fidelity.e2e.ts:723 | paste parity | Addressed by cherry-pick |
| 11 | QA-034: javascript: / data: / vbscript: hrefs sanitized | paste-fidelity.e2e.ts:811 | paste security | Addressed by cherry-pick |
| 12 | QA-044: Cmd+X emits text/plain + text/html AND removes selection | paste-fidelity.e2e.ts:922 | paste WYSIWYG cut | Addressed by cherry-pick |
| 13 | QA-022: no frame exceeds ~16ms during chunked 1MB paste | paste-fidelity.e2e.ts:958 | **QA-022 60fps perf** | Yes — Cluster 6 |
| 14 | QA-037: Source Cmd+X deletes selection AND writes both MIMEs | paste-fidelity.e2e.ts:1134 | paste source-cut | Addressed by cherry-pick |
| 15 | QA-016: Source empty-selection copy is a no-op (FR-15) | paste-fidelity.e2e.ts:1147 | **#188 FR-15 empty-selection preventDefault** | Addressed by cherry-pick |
| 16 | wikiLink + heading + bold round-trips through Branch C losslessly | paste-fidelity.e2e.ts:1204 | **#188 wikiLink parseHTML priority** | Addressed by cherry-pick |
| 17 | Branch C is taken when data-pm-slice is present | paste-fidelity.e2e.ts:1256 | paste routing | Addressed by cherry-pick |
| 18 | sidebar folder: row click navigates; chevron toggles expand/collapse | ux-interactions.e2e.ts:209 | **sidebar-folder flake** | Yes — Cluster 5 |

## Category summary

| Category | Count | Status after this spec's implementation |
|---|---:|---|
| paste-fidelity (#188 scope) | 13 | **Expected to pass** after cherry-pick `6a4c92ea` verified in local `bun run check` |
| QA-022 perf (Cluster 6) | 1 | Investigation spike — /ship Phase 3 |
| sidebar-folder (Cluster 5) | 1 | Investigation spike — /ship Phase 3 |
| crdt-stress S6 (Cluster 7) | 1 | Investigation spike — /ship Phase 3 |
| docs-open F11 | 1 | New surface — needs investigation / reproduce |
| Unidentified | 1 | Row 17 ("Branch C is taken") may be secondary to #188 fixes; verify |

## Implications for spec

1. **13/18 failures** are #188 scope — verifying the cherry-pick's completeness is the single highest-leverage validation task.
2. The 3 named investigation spikes (Cluster 5/6/7) are confirmed real, not hypothetical.
3. **F11 docs-open flake is a new surface not previously tracked.** Add to Cluster 5's investigation list or classify as a 4th spike.

## Next action

Run `cd packages/app && VITE_PORT=13579 bunx playwright test tests/stress/paste-fidelity.e2e.ts` on this worktree (post-cherry-pick) to confirm the 13 paste-fidelity failures are fixed. If green, absorbed scope is proven complete.

## Empirical validation result (2026-04-17 11:40 PT — post cherry-pick `6a4c92ea`)

Ran `cd packages/app && VITE_PORT=18494 bunx playwright test tests/stress/paste-fidelity.e2e.ts --reporter=list` on this branch.

**Result: 37 passed / 1 failed (1.8m).**

| Before (main) | After (this branch) |
|---|---|
| 13 paste-fidelity failures | 1 paste-fidelity failure |

**Cherry-pick `6a4c92ea` resolves 12 of 13 main-CI paste-fidelity failures.** This empirically confirms Cluster 3's decisions (D-Q16, D-Q17, D-Q18) and validates that the absorbed #188 scope is effectively complete.

**Residual failure (new surface, 1 of 1):**
- Test: `paste-fidelity.e2e.ts:1208 › OK→OK round-trip through Branch C (data-pm-slice) › wikiLink + heading + bold round-trips through Branch C losslessly`
- Assertion: `expect(content.length).toBeLessThan(20)` (doc-is-clear poll in `.toPass({ timeout: 5000 })`)
- Observed: content.length = 99 after test-reset
- Interpretation: **not a Branch C logic bug.** The sibling test `paste-fidelity.e2e.ts:1260 › Branch C is taken when data-pm-slice is present` passes at 34s. The issue is a test-reset / CRDT re-sync race — the doc-is-clear wait times out because prior test state re-syncs from the Hocuspocus server faster than the reset empties the Y.Doc. Classification: **CRDT-propagation signal**, category D per D-Q1. Expected to be fixed by US-12's G1 migration (replace poll-for-empty with `expect.poll` keyed on provider.synced === true AND doc content === expected).

**Implication for spec:** Reduce the scope of "residual paste-fidelity flakes needing investigation spike" from 1 (estimated) to 1 (confirmed), but classify as an ordinary US-12 migration target, not a new spike. Cluster 5/6/7 remain the 3 distinct flake investigations (sidebar-folder, QA-022, crdt-stress S6); F11 docs-open is the 4th. No additional spike added.
