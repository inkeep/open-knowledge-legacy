# Changelog — bridge-correctness

## 2026-04-16 — Spec scaffolded

- Baseline commit: `432a834b`
- Branch: `spec/bridge-correctness`
- Worktree: `.claude/worktrees/bridge-correctness`
- Parent context:
  - `specs/2026-04-15-lossless-bridge-merge/CONSIDER.md` (fuzz flake hand-off)
  - PR #161 shipped `mergeThreeWay` + `applyFastDiff`; PR #172 exonerated
  - Seed `1776386718697` reproduces at 40-60% flake rate locally
- Scope: three buckets (A correctness guardrail, B architectural cleanup, C algorithm fix)
- Greenfield: no deferred work, architectural correctness over pragmatism

## 2026-04-16 — Worldmodel + 4 parallel Opus investigations complete

- Dispatched 4 parallel Opus subagents: bridge /explore, Yjs settlement /research, three-way merge /research, fuzz harness /explore + reproduction
- Persisted: `evidence/bridge-surface-map.md`, `evidence/seed-1776386718697-characterization.md`
- Persisted: `reports/yjs-transaction-settlement-hooks/REPORT.md` (+ 8 evidence files)
- Persisted: `reports/three-way-merge-content-preservation/REPORT.md` (+ 9 evidence files)
- Key findings:
  - Seed `1776386718697` reproduced 2/5 (40%) locally
  - **Root cause more specific than original H1/H2/H3**: Observer B lacks `isPairedWriteOrigin` short-circuit (Observer A has one at `server-observers.ts:214`). This is a 4th bucket ("Bucket 0") not in original scope.
  - **Academic result**: Khanna-Kunal-Pierce 2007 formally proves no purely-state-based three-way merge can preserve content under arbitrary interleavings. Hybrid diff3+DMP inherits this limit.
  - **`afterAllTransactions` is confirmed-correct** as settlement primitive. y-prosemirror uses it in production. One Hocuspocus message = one transaction = one fire.
  - **Recommended post-condition invariant: (c) maximal-unique-substring subset** — O(n log n), sub-millisecond for typical markdown.

## 2026-04-16 — Decisions D1-D5 LOCKED (decision batch 1 resolved)

- **D1 LOCKED**: Bucket 0 added — Observer B paired-write symmetry
- **D2 LOCKED**: Post-condition invariant = (c) maximal-unique-substring subset
- **D3 LOCKED**: Production fallback = log + return result-as-computed (not throw, not fall-back-to-Path-A); best UX per collaborative-editor prior art
- **D4 LOCKED**: Single-CRDT collapse (Peritext via Yjs 14 or Automerge) OUT OF SCOPE — subsequent spec, not future work. R1's production data calibrates urgency
- **D5 LOCKED**: Bucket B Yjs hook = `doc.on('afterAllTransactions', ...)` (per-drain), evidence-based per research report
- D6 + D7 (quiescence gate impl, fuzz sample count) are minor implementation-phase decisions; agent-resolvable via evidence
- Q1/Q2/Q3/Q5 resolved via /research findings; Q4 + Q6 remain active, resolved by implementation + post-launch observation
- All major scope + architectural decisions locked. Iteration loop can close; ready for audit phase.

## 2026-04-16 — Audit + challenger complete (parallel nested Opus)

- Audit: 15 findings (2H/7M/6L). Key H1: CONSIDER.md citation doesn't exist in this worktree. Key H2: §D3 vs §D5 citation for single-CRDT collapse.
- Challenger: 11 findings (4H/5M/2L). Key F1: Bucket 0 addresses observer response, not RGA corruption. Key F2: paired-write origin set incomplete. Key F3: 4 buckets = deferred tech debt vs known single-CRDT migration. Key F4: D3 log+continue forecloses user recovery agency.
- Persisted: `meta/audit-findings.md`, `meta/design-challenge.md`.

## 2026-04-16 — /assess-findings + 4 follow-up Opus investigations

Deep verification of the 4 HIGH challenger findings:
1. **RGA mechanism** (Investigation 1): challenger VERIFIED CORRECT. Paused-client stale-anchored insert lands at tombstoned origin, inside paired-write content. Bucket 0 is harm reduction, not primary fix.
2. **ROLLBACK + MANAGED_RENAME** (Investigation 2): both source-verified as paired writers. Test-scenario sketches produced.
3. **Server-side rebase** (Investigation 3): no Hocuspocus hook (issue #346 open). OT-on-CRDT layer architecturally unwarranted.
4. **Typed paired marker** (Investigation 4): `LocalTransactionOrigin.context: any` permits `{paired: true}` drop-in.
5. **Peritext-on-Yjs-14 pull-in assessment**: prior 2-4 week estimate invalidated. `@y/y@14.0.0-rc.13` one day old; `@tiptap/y-tiptap` + `@hocuspocus/server` still pin `yjs@^13`. Realistic effort 12-19 weeks. D4 OUT-OF-SCOPE stands.
6. **Four-candidate single-CRDT comparison**: Automerge 2.2+ ranked first for cost/risk/readiness.
7. **Collab-editor UX patterns**: no production editor shows mid-typing toasts for merge anomalies; silent-is-fine when merge is correct (Google Docs/Notion) becomes a liability when loss can happen (Obsidian 4-year complaint thread).

## 2026-04-16 — Notion-esque UX reframing + refined R7

- User directive: focus on maximizing two-observer dual-CRDT approach; Peritext/Yjs 14 path explored in parallel separately.
- UX reconsideration: Notion-esque users do NOT want toasts. Trust-erosion cost > marginal help for the 1% who notice live.
- Replacement pattern: silent named version-history checkpoint (matches Notion's duplicate-on-merge shape). Uses existing `save-version` infrastructure + new generic primitive `saveInMemoryCheckpoint`.

## 2026-04-16 — Checkpoint architecture /explore (Opus)

- `saveVersion` is wrong-shaped for R7 (reads disk, resets WIP refs, no metadata).
- Clean path: new primitive modeled on `parkBranch` blob-staging (`shadow-repo.ts:294-319`).
- ~100 LOC across 4 surfaces: primitive in shadow-repo.ts, threading into Observer A setup, TimelinePanel kind-aware rendering, parseCheckpoint helper.
- Open verification items (Q7-Q9): parseContributors tolerance, commitWip concurrent-safety, namespace choice.

## 2026-04-16 — /assess-findings on R7 proposal

- Adversarial stress-test of generalization claim:
  - "Generic per precedent #2" — PARTIALLY VALID. Use new primitive (not `safetyCheckpoint` extension — that's wip-ref-based).
  - "Rescue-buffer migration" — VALID concrete 2nd use case.
  - "V0-14 / managed-rename / shutdown-flush uses" — SPECULATIVE / WEAK. DECLINE.
  - "Body-line metadata channel" — UNVERIFIED (Q7 tracks).
  - "`Record<string, unknown>` metadata" — VIOLATES R10. REJECT as written; replace with discriminated union.
- Refined R7: 2 concrete callers only (R7 bridge-merge-loss + R7e external-change rescue). Kind union starts at 2 entries.

## 2026-04-16 — D6-D9 LOCKED + full SPEC.md cascade

- D6: Bucket 0 expanded (typed marker, 4 origins, symmetric A+B, MANAGED_RENAME to enforcing set)
- D7: Bucket 0 is harm reduction not primary fix (honest framing for R0h)
- D8: silent-checkpoint approach via `saveInMemoryCheckpoint` (R7a-e)
- D9: invariant (c) + order-preservation side-check
- Spec sections §1 Complication (mechanism honest), §1 Resolution (4 buckets refined), §3 Non-goals, §5 User journeys (J1-J5 populated), §6 Requirements (restructured: R0-R13 enumerated), §7 Metrics (M1-M10), §8 Current state (populated from bridge-surface-map), §9 Proposed solution (all buckets + oracle table), §10 Decision Log (D6-D9 LOCKED, D10-D13 implementation-pending), §11 OQ (Q7-Q9 new active), §12 Assumptions (A1-A2 CONFIRMED), §13 Risks (K1-K7), §14 In Scope enumerated, §15 relabeled SS-1/2/3, §16 Agent Constraints populated with SCOPE/EXCLUDE/STOP_IF/ASK_FIRST.
- All audit editorial findings addressed (CONSIDER.md citation replaced with evidence file ref; §D3 citations corrected; stale "to verify" removed from assumptions; FW-→SS- relabel).
- Ready for /spec Phase 8 (verify + finalize).

## 2026-04-16 — Round-2 audit (Opus) + full cascade

- Round-1 audit archived to `meta/audit-findings-round-1.md`; round-2 written to `meta/audit-findings.md` (14 findings: 3H/6M/5L).
- 10/15 round-1 findings correctly addressed; 5 unfixed editorial findings (F4 D5 citation, F10 Q5 fact ordering, F11 stale counts, F12 quote paraphrase, F13 line off-by-one) re-flagged in round 2.
- 3 HIGH findings new in round 2:
  - H1: two cited reports (`collab-editor-silent-loss-ux-patterns/REPORT.md`, `single-crdt-collapse-alternatives/REPORT.md`) never materialized from the subagents. **Now written from inline content.**
  - H2: D1 "proximate fix" vs D7 "harm reduction" framing incoherence. **D1 rewritten to match D7's honest framing** ("addresses observer-layer amplification; see D7 for full mechanism").
  - H3: R5b misidentified typing-defer lines. Lines 292 + 410 are main Observer A/B debounce, not typing-defer. **R5b reframed per Q1 option (c)**: spike whether client observers need any debounce at all under precedent #14 (baseline-only); if not, delete all 4 setTimeouts. Fallback: extract into `client-observer-timing.ts` (not `typing-defer.ts` — misleading). New D14 locks the spike decision process.
- 6 MEDIUM findings addressed:
  - F4 D5 citation: added §D4 (y-prosemirror ecosystem precedent)
  - F5 R7e reader-path asymmetry: **scoped in reader migration as R7f** per Q2 option (a) — `/api/rescue` now reads from timeline refs in addition to flat files. SS-3 relabeled to "shutdown-flush rescue consolidation" (no longer about reader migration). §16 EXCLUDE updated.
  - F6 §8 cascade: typing-defer line count corrected
  - F7 R7b citation: `§B3` → "Path A vs Path B selection" section name
  - F8 Q3 citation: §D4 → §D1 + Correctness Equivalence Summary
  - F9 §1 "wholesale-replacing": softened to character-level DMP (wholesale-equivalent when content is wholly different)
- 5 LOW findings addressed:
  - F10 Q5 fact ordering: `idempotent/stable/near-success` order corrected to match Facts 4.2.2/4.3.2/4.4.2
  - F11 stale counts in bridge-surface-map.md: 269→190, 36→28, 354→353, 388→387
  - F12 paraphrased quote in seed-characterization: replaced with verbatim from `:382-384`
  - F13 `:381-384` → `:382-384` in SPEC R0c + evidence
  - F14 "Automerge ranked first" nuance: softened with three-axis ranking
- Two REPORT.md files written from inline subagent content:
  - `reports/collab-editor-silent-loss-ux-patterns/REPORT.md` (full synthesis + evidence file links)
  - `reports/single-crdt-collapse-alternatives/REPORT.md` (four-candidate comparison with three-axis ranking)
- D14 added: R5b client observer debounce audit outcome (spike → delete or extract). D-series renumbered and re-ordered.
- §14 In Scope + §16 Agent Constraints updated for R7f scope-in.

## 2026-04-16 — Verify + finalize (Phase 8)

- **Mechanical adversarial checks passed:**
  - No load-bearing ASSUMED decisions remaining (all D1-D9 LOCKED; D10-D14 DELEGATED).
  - 1-way door confidence promoted: D5 MEDIUM→HIGH (research-exhaustive source-trace across Yjs + Hocuspocus).
  - D9 confidence stamp added (HIGH; additive refinement to D2 grounded in Challenge F6 evidence).
  - Non-goal temporal tags accurate: SS-1 single-CRDT is correctly framed as "subsequent spec (being explored in parallel)" not "future work"; server-side rebase is correctly NEVER (architectural OT-on-CRDT conflict).

- **Resolution status assigned:**
  - D1-D9: LOCKED (9 decisions, all with HIGH or MEDIUM-HIGH confidence)
  - D10-D14: DELEGATED (5 implementation-phase decisions — implementer resolves via spike/evidence; all reversible)

- **Resolution completeness gate:** every in-scope requirement (R0-R0h, R1-R3, R7-R7f, R8, R4-R6, R5b, R9, R11, R10, R12, R13) passes:
  - All governing decisions made (D1-D9 LOCKED or D10-D14 DELEGATED to implementer)
  - 3rd-party dependencies named: `yjs@13.6.30`, `diff-match-patch`, `node-diff3`, `@hocuspocus/server`, `y-protocols`, `@tiptap/core`, Sonner
  - Architectural viability validated via source-trace (Yjs RGA, afterAllTransactions, parkBranch template, Observer A/B asymmetry)
  - Integration feasibility confirmed (R0 typed marker drop-in; R7a blob-staging template at `shadow-repo.ts:294-319`; R7f merges timeline-ref + flat-file reads)
  - Acceptance criteria verifiable (every R- has observable gate)
  - No dependency on out-of-scope items

- **Quality bar checklist:** §1 SCR ✓, §2 Goals ✓, §3 Non-goals ✓, §4 Personas ✓, §5 User journeys (J1-J5) ✓, §6 Requirements (R0-R13 with sub-numbers) ✓, §7 Metrics (M1-M10) ✓, §8 Current state ✓ (grounded in evidence), §9 Proposed solution with code sketches ✓, §10 Decision Log D1-D14 with resolution status ✓, §11 OQ (Q1-Q9 with RESOLVED/ACTIVE tags) ✓, §12 Assumptions A1-A4 ✓, §13 Risks K1-K7 ✓, §14 In Scope enumerated ✓, §15 Subsequent Specs SS-1/2/3 ✓, §16 Agent Constraints (SCOPE/EXCLUDE/STOP_IF/ASK_FIRST) ✓.

- **Baseline commit**: `432a834b` (unchanged; current main HEAD; spec grounded on this).

- **Spec finalized.** Ready for implementation. `/spec` Phase 8 complete.

## 2026-04-16 — Decision Log cascade from yjs-14-ecosystem-adoption research

New evidence from `reports/yjs-14-ecosystem-adoption/` (created this session, 7 source-traced evidence files + /audit pass + 3 Path C follow-ups) materially strengthens D4 (single-CRDT collapse out-of-scope).

**D4 update inlined into SPEC.md §10 Decision Log:** Added "D4 evidence update (2026-04-16)" block with 6 source-traced findings that confirm the LOCKED posture:
1. Yjs 14 + Hocuspocus structurally incompatible at the import layer (lib0 split + import-name split)
2. TipTap + Hocuspocus both shipped fresh pinning `yjs ^13` (2026-04-08 and 2026-04-16 respectively) — not migrating
3. BlockNote "design partner" sharpened framing: zero public code progress 2.5 months post-FOSDEM-2026
4. Dual-view binding gap is ecosystem-universal (Loro has same limitation as @y/codemirror; choosing Loro does NOT unlock dual-view)
5. Wire-format interop empirically CONFIRMED (28 cross-version decode directions passed) — removes one migration risk
6. dmonad himself flagged v14 as broken alpha; 0.275% npm adoption ratio

**Tactical surprise:** Independent production bug surfaced during research — `patches/y-prosemirror@1.3.7.patch` only patches y-prosemirror, but production code imports from `@tiptap/y-tiptap` (vendored fork, unpatched). Destructive-delete safety net bypassed. Should be a separate story on Yjs 13 today, independent of any migration decision.

**§3 Non-goals updated** with cross-reference to §10 D4 evidence update.

**No new decisions locked.** D4 framing unchanged; just strengthened with concrete 2026-04-16 ecosystem evidence. The collapse is more clearly a SEPARATE spec that waits until (a) Yjs 14 stable ships, (b) Hocuspocus/TipTap publish v14 peer-deps, (c) BlockNote ships production code with `@y/*` deps.

## 2026-04-17 — Implementation shipped: Bucket 0, A, C (Bucket B deferred)

Stories US-001, US-002, US-003, US-004, US-005, US-006, US-007, US-008, US-013, US-014, US-015 landed on `spec/bridge-correctness`.

**Bucket 0 (harm reduction):**
- US-001: typed `context.paired` marker + symmetric Observer B short-circuit + `MANAGED_RENAME_ORIGIN` export + BRIDGE_ENFORCING_ORIGINS addition (6→7).
- US-002: T8/T9/T10 paired-write regression tests at the observer layer; Mutation H validation matrix committed.

**Bucket A (correctness guardrail + silent recovery):**
- US-003: `BridgeMergeContentLossError` + `assertContentPreservation` (maximal-unique-line-substring + D9 order-preservation). K3 calibration: split segments on newline, drop whitespace-only lines.
- US-004: `saveInMemoryCheckpoint` primitive + `parseCheckpoint` + `formatCheckpointBodyLine`; Q7/Q8 resolved empirically.
- US-005: Observer A Path B wraps `mergeThreeWay` in try/catch scoped to `BridgeMergeContentLossError`; emits structured log, writes silent checkpoint via `queueMicrotask`, applies merge as-computed in prod. Threads `shadow`/`contentRoot`/`docName`/`getBranch` through `SetupServerObserversOpts`; both standalone.ts and hocuspocus-plugin.ts call sites updated.
- US-006: TimelinePanel kind-aware rendering (three variants: `'save'`, `'bridge-merge-loss'`, `'external-change-rescue'`); pure helpers exported + unit-tested.
- US-007: reconcile-delete + branch-switch rescue write paths migrated to `saveInMemoryCheckpoint`; `/api/rescue` reader merges flat-file + timeline-ref results. Shutdown-flush path retained flat-file per SPEC.
- US-008: fuzz sample count gated by env (`STRESS_FUZZ_NIGHTLY=1` → 10000; `STRESS_FUZZ_PR=1` → 1000; default 25). R8 oracle-check relationship table at `evidence/oracle-check-relationships.md`.

**Bucket C (telemetry + residual characterization):**
- US-013: `bridgeMergeContentLoss` + `bridgeMergeCheckpointCreated` counters added to `ReconciliationMetrics` (US-005 wiring); metrics.test.ts coverage.
- US-014: R0h/R11 evidence file `evidence/seed-1776386718697-post-bucket-0-rate.md` with reproduction command, D7 framing, Q4 partial resolution.

**Cross-cutting:**
- US-015: CLAUDE.md precedent #1 extended with `context.paired` marker; precedent #11(b) rewritten with post-condition + telemetry language; origin-guard truth table refreshed; STOP rules added for `BridgeMergeContentLossError` catch-site discipline and paired marker non-removal.

**Deferred (Bucket B settlement migration):**
- US-009 (afterAllTransactions dispatch), US-010 (awaitDocQuiescence), US-011 (client observer audit), US-012 (setTimeout grep gate). STOP_IF risk and test-harness semantics change were judged too large for this iteration — the 50 ms `setTimeout` debounce via injected Scheduler is still the observer dispatch mechanism. Paired-write short-circuits (US-001) already cancel debounces synchronously on the hot paths that caused seed-1776325179241. Bucket B will land in a follow-up story when the test harness is prepared to migrate off ManualScheduler.flush() semantics.

**Regression:** bun run check green at ship. 541 unit tests, 159 integration tests pass.

## 2026-04-17 — Bucket B shipped: settlement-based observer dispatch (phase 3 complete)

Stories US-009, US-010, US-011, US-012 landed on `spec/bridge-correctness` (commits `5d919d35` → `0d623b09`). All 15 user stories now pass; phase 3 implementation complete.

**Bucket B (architectural cleanup — settlement-based dispatch):**
- US-009: Server observer dispatch migrated from 50 ms `setTimeout` debounce via injected `Scheduler` to `doc.on('afterAllTransactions', ...)`. Observer callbacks flag `xmlDirty` / `textDirty`; the settlement handler runs Observer A's sync work first so its `Y.Text` write is visible to Observer B's read, then Observer B's. One outermost `doc.transact()` call = one drain = one settlement fire. Observer B canonicalizes `Y.Text` via `applyFastDiff` after `updateYFragment` so the bridge invariant `ytext === serialize(fragment)` holds at every settlement point — replaces the debounce-era reliance on Observer A's subsequent Path B firing to close the gap. Test-only `onDispatch?: (kind: 'none' | 'a' | 'b') => void` hook added for unit-level drain assertions (T8/T9/T10 regression tests).
- US-010: `awaitDocQuiescence(doc, opts?)` structural gate added to `test-harness.ts` — resolves once the doc has been quiet on `afterAllTransactions` for N consecutive microtasks (default 2). Replaces fuzz-harness `wait(1500)` / `wait(800)` gates that measured wall-clock instead of observer settlement. Combined with `assertAllConverged` for inter-client WebSocket propagation.
- US-011: Client observer (`packages/app/src/editor/observers.ts`) simplified to a shell per D14-DELEGATED outcome = option (a) DELETE. Removed: `DEBOUNCE_MS`, `TYPING_DEFER_MS`, `REMOTE_TREE_SYNC_GRACE_MS`, four `sched.setTimeout` sites, per-doc `TypingState`, `lastSyncedXmlMd` baseline, client-side cross-CRDT write paths. ~300 LOC retired. The client shell retains only (a) the `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` object identities needed by `BRIDGE_ENFORCING_ORIGINS`, (b) `onSyncError` for non-transient parse failures, and (c) `markUserTyping` for the agent-focus typing guard consumer.
- US-012: Precedent #13(b) enforcement grep gate at `packages/server/src/bridge-no-wallclock.test.ts` — scans both bridge observer files on every PR and fails CI on `setTimeout(` / `setInterval(` / `sched.setTimeout(` / `sched.clearTimeout(` / `new Scheduler(` / `: Scheduler` / `<Scheduler>` call sites. Comments and JSDoc referencing the retired machinery are allowed (comment-and-string stripper preserves line numbers for reporting). Dropped `Scheduler` / `defaultScheduler` re-export from `observers.ts`; removed `scheduler?: Scheduler` from `ObserverDeps` and `CreateTestClientOptions`; deleted `ManualScheduler` + `createManualScheduler` from `test-harness.ts` (no remaining consumers).

**Cross-cutting amendments (US-015):**
- CLAUDE.md precedent #13(b) rewritten as "Settlement-based propagation, not wall-clock debounce"; propagation matrix W1/W2 rows reference settlement dispatch; origin-guard truth table reflects paired-write symmetric short-circuit; STOP rules added for Bucket B (no wall-clock `setTimeout` in bridge code; `awaitDocQuiescence` over `wait(ms)` in new bridge tests).
- `docs/content/internals/agent-write-path.mdx` lines 36 + 55 updated to reference `afterAllTransactions` + the paired-write marker (commit `c691380c`).

**Spec §11 Q4/Q7/Q8/Q9 resolution:**
- Q7 / Q8 RESOLVED empirically during US-004.
- Q9 RESOLVED: ref namespace locked to `refs/checkpoints/<branch>/<sha>`.
- Q4 PARTIALLY RESOLVED: reproduction command + D7 framing committed to `evidence/seed-1776386718697-post-bucket-0-rate.md`; full 100× rate characterization is a post-merge observation against R9 telemetry.
- Q6 remains active (30-day post-ship observation window).

**Docs phase (this commit batch):**
- `docs/content/internals/architecture.mdx`: Source-toggle section updated for dual-editor concurrent-mount + server-authoritative bridge; stale "Typing coordination" paragraph (markUserTyping typing-defer) removed; content-preservation post-condition noted with pointer to SPEC §6 R1/R7.
- `docs/content/internals/agent-write-path.mdx`: frontmatter description + opening paragraph de-referenced from the removed `three-way-merge.ts`; "Source mode live injection" rewritten for `y-codemirror.next` binding; obsolete "Three-way merge on toggle-back" section replaced with "Mode toggle (no merge)" explaining the dual-editor concurrent-mount + server bridge model.
- `packages/server/README.md`: new "Server-authoritative bridge" section — settlement dispatch, paired-write marker, content-preservation post-condition + silent recovery, `saveInMemoryCheckpoint` primitive, `/api/rescue` reader merge, telemetry counters.
- `packages/core/src/bridge/README.md` (new): public API reference + post-condition policy + STOP rules for the single authorized catch site.
- Orphaned `packages/core/src/bridge/scheduler.ts` deleted (unreferenced post-US-012); exports removed from `packages/core/src/bridge/index.ts` and `packages/core/src/index.ts`.

**Regression:** `bun run check` green (lint + typecheck + unit + integration + conversion + fidelity). All 15 stories pass the ship gate.
