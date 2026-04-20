# Changelog — E2E Observability + Determinism

## 2026-04-17 — Phase 1 (Intake)

**Baseline:** `432a834b` (origin/main at spec creation).

**Context gathered:**
- Read current `packages/app/playwright.config.ts` — confirmed: cross-browser projects (chromium/webkit/firefox) configured; `retries: 0`; no `video` / `trace` / `screenshot` keys; `globalTeardown` present; `reuseExistingServer: false`; module-scope tmpdir creation for `OK_TEST_CONTENT_DIR`.
- Read `packages/app/tests/stress/slash-command.e2e.ts` — confirmed: `resetEditor` uses `page.reload({ waitUntil: 'networkidle' })` (line 25). 4 `test.skip(browserName === 'webkit', ...)` calls.
- Skip classification: 3 skips at lines 224, 270, 477 are for CORS race on `/api/documents` (same root cause). 1 skip at line 713 is for a webkit overflow-scroll rendering difference — **NOT a CORS issue, different root cause, out of this spec's scope.**
- Read playwright-stability spec (via main repo reference) — scope boundaries confirmed: they own per-test docName isolation for 5 files + mode→position bug + graph fixture + reveal-on-activate beforeEach cleanup. No overlap with G1/G2/G3.

**SCR drafted.** All 5 stress-test probes answered. Demand reality, status quo cost, narrowest wedge, observation, future-fit all confirmed.

**Personas + constraints drafted.** Two personas (Contributor-developer, Future contributor). Hard + soft constraints enumerated.

**First-pass open questions:** 15 candidates extracted (will be systematically re-extracted in Phase 3 via walk-through / tensions / negative-space probes).

**Scope hypothesis:** G1 + G2 + G3 in scope as coupled foundations. Webkit overflow-scroll skip at line 713 and bridge-convergence fuzz explicitly out of scope.

**Next:** Phase 2 — scaffold artifacts + dispatch `/worldmodel` skill + build spec-unique analysis on top of topology output.

---

## 2026-04-17 — Phase 2 (Scaffold + worldmodel + topology)

**Approach:** Skipped a full `/worldmodel` dispatch because the topology is well-characterized by the adjacent research report (`reports/playwright-e2e-observability-determinism-best-practices/`) — that report provides the 3P baseline. Phase 2 focuses on the inward-facing current-state inventory.

**Dispatched an Explore agent** to build the E2E infrastructure inventory. Cross-verified one claim that contradicted my prior understanding: agent said "All hooks are unconditional exports." Direct inspection of `DocumentContext.tsx:216-225` confirmed `__activeProvider`, `__providerPool`, `__test_rejectSyncPromise`, `__test_armPendingRejection`, `__test_closeActiveWebSocket` ARE DEV-gated via `if (import.meta.env.DEV)`. `__test_injectAgentFocus` (SystemDocSubscriber.tsx:119) is also DEV-gated. `__agentFlashState` (TiptapEditor.tsx:277) and `__graphHarness` (GraphView.tsx:796) are NOT DEV-gated — surfaced opportunity, out of this spec's scope.

**Persisted `evidence/current-state-inventory.md`** — full inventory with counts, overlap analysis, and target counts per dimension.

**Updated SPEC.md:**
- §8 Current State: full narrative with tables (E2E file shape, helpers, hooks, pageerror, config, CI workflow, data-state, `waitUntil: 'networkidle'` occurrences, overlap with playwright-stability).
- §9 System Design: Mermaid context diagrams (current state vs. target state), failure-path sequence (today vs. target), internal surface-area map, vertical slice for two personas, scope hypothesis.

**Scope hypothesis proposed:**
- **IN SCOPE (P0):** G2 (config + CI artifacts), G3 (webkit CORS fix), G1 on 4 non-overlap files (66 of 74 `waitForTimeout`), shared `_helpers/` directory, STOP rule, AGENTS.md precedent #20.
- **FUTURE WORK (Identified):** G1 on 8 playwright-stability-overlap files post-their-merge, line-713 webkit overflow-scroll skip, DEV-gating for ungated hooks, fixture promotion at ~20 files, BrowserStack iOS.
- **OUT OF SCOPE (elsewhere):** playwright-stability's per-test docName isolation, `mode→position` body-key fix, graph fixture scoping, bridge-convergence fuzz.

**Key counts (from inventory):**
- 74 `waitForTimeout` total → 66 in this spec's G1 (slash-command 44 + paste-fidelity 19 + mid-type-recovery 1 + docs-open 2) + 8 for Future Work (post-stability)
- 5 `test.skip(webkit)` → 4 in G3 scope (3 CORS per-test + 1 CORS describe block = 5 tests restored) + 1 Future Work (line-713 rendering)
- 8 `waitUntil: 'networkidle'` → 0 target (replace with `domcontentloaded` + explicit wait)
- 0 `_helpers/` → 1 new directory with 4-6 helpers
- 0 CI artifact upload steps → 2 target (HTML report + test-results)

**Ready for user confirmation on the scope hypothesis before Phase 3 (systematic backlog extraction).**

---

## 2026-04-17 — Scope reshape: PR #188 subsumed + chromium-only + CI-stability end-to-end

**User decisions resolving scope tensions:**

1. **Broad takeover of PR #188.** All 5 fixes (2 test-code + 3 production-code) absorbed into this spec. Close #188 with cross-reference.
2. **Chromium-only CI accepted.** No nightly Tier 2 cross-browser job. G3 collapses from "fix webkit CORS race" to "remove dead `test.skip(webkit)` calls as cleanup."
3. **CI-stability end-to-end ownership.** Scope bounded by causal linkage to test stability, not file type. Prod code fixes fair game if they are root causes (sidebar-folder, QA-022, crdt-stress S6, other surfaced flakes).

**Greenfield assessment applied to prior scoping tensions:**
- Prior "overlap files deferred to follow-up" → REJECTED (deferred debt). Subsume everything; one PR; zero allowlist.
- Prior "STOP rule with 2-file allowlist" → REJECTED (half-enforcement). Full enforcement or don't land.
- New "cross-browser reversal of QA-046 from clipboard spec" → accepted with explicit documentation in this spec's §5; recommend updating clipboard spec's QA-046 status to Withdrawn/Deferred in follow-up.

**Worktree rebased to `a25b3ee4`** (origin/main). PR #185 (playwright-stability) already landed — per-test docName isolation in place.

**SPEC updates:**
- §5 Out of Scope: final scope documented
- §5b (new): PR #188 takeover details — 5 absorbed fixes enumerated
- §5c (new): CI-stability end-to-end posture with scope guardrails
- §11 Open Questions: 42-item extraction via three probes (walk-through, tensions, negative space)
- §12 Assumptions: 8 tracked with verification plans
- §13 Risks: 9 named with mitigations
- §15 Future Work: narrow — only genuinely separate concerns
- §16 Agent Constraints: preview (derived at Phase 7)

**Next:** present the extracted 42-item backlog + priority triage to user. Confirm P0/P2 classification before Phase 4 investigation round.

---

## 2026-04-17 — Phase 4 (Iterate: decide + cascade)

**Approach:** Per /spec Phase 4 protocol — "investigate evidence gaps autonomously; stop for judgment gaps." Most backlog items had answers findable in code + existing research; only Cluster 5/6/7 (sidebar-folder, QA-022, crdt-stress S6 root causes) require runtime reproduction and are deferred to /ship Phase 3 spikes.

**Investigations executed:**
1. **Q16 (`resolved: false` parity):** Read `mdast-to-hast-handlers.ts:57-79` directly. Confirmed `wikiLinkHandler` omits `data-resolved` from clipboard hast output. Hardcoding `resolved: false` in the new `a.wiki-link[data-target]` parseHTML rule is correct — the two rules serve different sources. Decision **D-Q16** locked.
2. **Q18 (mark handler flatten-bug extent):** Read `markHandlers` in `packages/core/src/markdown/index.ts:893-969`. Confirmed only `markHandlers.code` has the flatten pattern because `inlineCode` is a leaf mdast type. All others (`emphasis`, `strong`, `link`, `delete`, `escapeMark`) pass children to structured mdast nodes via `fromPmMark`. Decision **D-Q18** locked.
3. **Q22/Q19/Q26 (live CI failure inventory):** Fetched `gh run view 24548842566 --log-failed` for origin/main at 2026-04-17T05:19Z. Enumerated all 18 failures → evidence file `main-ci-failure-inventory.md`. Confirmed: 13/18 are #188 scope (addressed by cherry-pick), 1 QA-022, 1 sidebar-folder, 1 crdt-stress S6, 1 newly-surfaced F11 docs-open.

**Decisions captured (33 total):**
- Cluster 1 (Config + CI plumbing): D-Q5, D-Q6, D-Q7, D-Q8, D-Q9, D-Q14, D-Q15, D-Q32, D-Q36, D-Q37
- Cluster 2 (Helper + test code patterns): D-Q11, D-Q12, D-Q13, D-Q30, D-Q40, D-Q42
- Cluster 3 (PR #188 absorbed fixes): D-Q16, D-Q17, D-Q18
- Cluster 4 (page.clock adoption): D-Q2, D-Q4, D-Q29
- Cluster 8 (SRE / observability P2): D-Q10, D-Q28, D-Q33, D-Q34, D-Q35, D-Q38, D-Q41
- Cluster 9 (Scope clarifications): D-Q1, D-Q3, D-Q31, D-Q39

**Deferred to /ship Phase 3 investigation spikes:**
- Cluster 5 (sidebar-folder flake) — Q19, Q20, Q21
- Cluster 6 (QA-022 baseline design) — Q23, Q24, Q25
- Cluster 7 (crdt-stress S6 root cause) — Q26, Q27
- F11 docs-open flake (newly surfaced) — new US-25, AC-13

**Spec updates:**
- §10 Decision Log populated with 30 decisions across 6 clusters, each with LOCKED / DIRECTED / DELEGATED status
- §11 continues to carry unresolved items; resolved items cross-referenced by D-id
- §6 User Stories US-8 updated to reflect D-Q5/D-Q7/D-Q8/D-Q9 config shape (retries=2, failOnFlakyTests, video 1280×720, github reporter, workers undefined locally)
- §6 User Stories adds US-25 for F11 docs-open flake
- §6 Acceptance Criteria adds AC-13 for F11 test
- Evidence: `main-ci-failure-inventory.md` persisted with source CI run ID

**Ready for Phase 5 (audit + challenger subprocesses).**

---

## 2026-04-17 — Phase 5 (Audit + challenger + empirical validation)

**Inventory correction:** Re-verified `waitForTimeout` counts via direct grep. Actual total is **73 across 6 files**, not 74 across 7. `source-polish.e2e.ts` now has 0 (previously counted as 1 in earlier snapshot — PR #185 or earlier cleanup removed it). Updated all references in §6 US-16, §8 inventory table, §9 system design, §10 D-Q1, §11 Q1.

**Dispatched:**
- `/audit` subagent (agentId a29fdf2893775b960) on SPEC.md — claim verification, coverage gates, decision completeness, internal coherence lenses, greenfield adherence, implementation feasibility, risk/assumption hygiene. Findings → `meta/audit-findings.md`.
- Challenger subagent (agentId a8b0d62deb6e331f0) — six pressure-test angles: scope misses, decision alternatives, implementation risk spot-checks, architectural correctness, cross-spec interactions, greenfield adherence. Findings → `meta/challenger-findings.md`.
- Paste-fidelity empirical validation (local Playwright run) — verify cherry-pick `6a4c92ea` addresses 13 of 18 main-CI failures.

**Current state:** Subprocesses running; Phase 6 (assess-findings) begins when both complete.

---

## 2026-04-17 — Phase 6 (Assess findings + apply corrections)

**Both subprocesses completed** (challenger 2026-04-16 23:47, audit 2026-04-17 shortly after). Audit produced 24 findings (7 High, 9 Medium, 8 Low); challenger produced ~16 findings across 6 angles.

### Applied corrections (valid findings)

Batch 1 — **Factual / stale** (Audit H1-H7, Challenger 1.1-1.4, 2.D-Q33):
- §1 SCR rewritten to reflect chromium-only reality (post-`940d5a0a`), drop 3-browser language, rename G3 to "Named flake resolution."
- §6 US-10 marked RESOLVED (webkit skips deleted by `940d5a0a`; no implementation work).
- §8 E2E test suite shape: updated to 73 waitForTimeout across 6 files, 0 webkit skips, 1 waitUntil: 'networkidle' at slash-command.e2e.ts:38, LoC 5,598.
- §8 CI workflow: updated to 15 min timeout, single chromium install.
- §8 DocumentContext.tsx anchors: dropped stale line numbers, replaced with symbol reference ("if (import.meta.env.DEV) block in main useEffect").
- §5b row 1: rewrote to describe Fix 1 as obsolete post-#185 (hash-nav).
- §6 US-17: narrowed from "8 occurrences" to "1 occurrence" at slash-command.e2e.ts:38.
- §9 surface-area map: updated LoC for slash-command (762→720) and paste-fidelity (1245→1308).
- §4 OQ#14: fixed `flakyTestsFail` → `failOnFlakyTests`.
- `evidence/main-ci-failure-inventory.md`: QA-022 line 954 → 958.
- Clipboard spec §13 cross-browser row: updated in-diff per D-Q33 (pulled from follow-up into this PR).

Batch 2 — **Internal coherence** (Audit H4, M3, M5, M7, M8):
- §1 G2 + US-8 + R4: reconciled to canonical D-Q5 config shape (retries=2 on CI, failOnFlakyTests: true, trace: 'on-first-retry', video 1280×720). R4 mitigation rewritten to match ship-with-ON posture.
- §7 Non-Goals: removed the contradictory failOnFlakyTests-default-OFF bullet.
- §6 US-22: expanded STOP-rule test to match D-Q14's 4 patterns + webkit-skip ratchet (per-pattern test shape).
- Changelog: "30 total" → "33 total" decisions.
- §4: annotated as SUPERSEDED by §11.

Batch 3 — **Decision sharpening** (Challenger 2.D-Q5/7/11/29/33/41, Audit M4):
- D-Q5 rationale: rewritten to acknowledge `failOnFlakyTests` is pioneering (zero surveyed OSS projects use it), not research-following.
- D-Q7: added workers calibration plan (measure 1/2/4 via US-28 + AC-14); noted ubuntu-latest free tier is 2 vCPU.
- D-Q11: explicit barrel-import contract (consumers import from `./_helpers` only); STOP rule extended to ban inner-file imports.
- D-Q29: sharpened boundary — `page.clock` only for JS event-loop timers; NOT network/WebSocket/CRDT/filesystem/Hocuspocus-reconnect. Mixed-timer protocol documented.
- D-Q33: promoted LOCKED, pulls clipboard-spec annotation INTO this PR's diff (no follow-up debt).
- D-Q41: added Tier 2 nightly workflow (US-29, AC-15).
- D-Q13: replaced precedent #19(b) reference with "DEV-gating convention in DocumentContext.tsx" (per audit M8).

Batch 4 — **Scope additions** (Challenger 1.5, 6; greenfield directive):
- **US-26** (new): DEV-gate `__agentFlashState` + `__graphHarness` (absorbed from §15 Future Work).
- **US-27** (new): `fr-7a-disconnect-source-mode.e2e.ts` audit under new CI regime.
- **US-28** (new): Workers calibration measurement.
- **US-29** (new): Nightly Tier 2 stability workflow.
- **US-30** (new): Pull clipboard spec §13 annotation into THIS PR.
- **AC-14 through AC-17** (new): Gates for the new user stories.
- §15 Future Work: removed DEV-gating entry (absorbed).

### Declined Findings Summary

| Finding | Classification | Future-relevant | Evidence |
|---|---|---|---|
| Audit H3 (waitForTimeout count 74/7 vs 73/6) | Incorrect | No | Audit grepped `waitForTimeout` (matches a comment at source-polish.e2e.ts:198). Correct pattern `page.waitForTimeout(` returns 73 across 6 files — verified by `grep -c "page.waitForTimeout(" packages/app/tests/stress/*.e2e.ts`. My Phase 4 correction is correct. |
| Audit H5 (source-polish still has 1) | Incorrect | No | Same root cause as H3. source-polish.e2e.ts line 198 is a comment mentioning "waitForTimeout"; zero actual call sites. |
| Audit L7 (§14 dangling placeholder) | Tradeoffs unfavorable | No | N/A placeholder is acceptable as-is; a forward reference to template adds noise without benefit. |
| Challenger 3.US-22 structural mismatch (location in `tests/integration/`) | Tradeoffs unfavorable | No | Location convention for integration tests is appropriate; co-locating with enforced file (as wysiwyg-stop-rule.test.ts does) doesn't scale to 13 E2E files being enforced by one test file. |

All other findings accepted and applied. No deferred debt — greenfield directive adherence maintained.

**Spec status:** Ready for Phase 7 (verify + finalize, derive Agent Constraints, update baseline commit).




