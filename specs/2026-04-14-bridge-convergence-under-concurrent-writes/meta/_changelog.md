# Changelog

## 2026-04-14 — Spec created, Phase 1-2 complete

- Baseline commit stamped: `08c20f1`
- SCR problem statement drafted (Bug-A + Bug-B unified as "bridge convergence under concurrent writes")
- 5-probe stress test passed: real customer pain, deterministic reproducer, narrow wedge (Bug-A alone) justifies but bundling is efficient
- Initial scope hypothesis: SCOPE = `packages/server/src/agent-sessions.ts` + `packages/app/src/editor/observers.ts` + tests; EXCLUDE core / cli / Observer B / file-watcher
- Open Questions seeded: OQ-1 through OQ-7 covering Bug-A options, Bug-B options, unified-vs-split, V0-14 compat, DMP-on-tree feasibility
- Assumptions A1–A4 captured with confidence + verification paths

## 2026-04-14 — Phase 3 (evidence persistence) complete

- Evidence files written: `bug-a-mechanism.md`, `bug-b-mechanism.md`, `updateYFragment-is-structural-diff.md`, `v0-14-interaction.md`
- Bug-C + Bug-D empirically confirmed via nested-claude `/debug`:
  - `packages/app/tests/integration/bug-a-mechanism-isolation.test.ts` (Bug-A server-stomp)
  - `packages/app/tests/integration/bug-c-real-reachability.test.ts` (Observer B drift destruction under delayed Y.Text)
  - `packages/app/tests/integration/bug-d-isolation-repro.test.ts` (post-undo XmlFragment rebuild destroys user content)
- Bug-D classified as design-coupled to V0-14's undo contract → deferred with handoff template

## 2026-04-14 — First audit + challenger pass (pre-expansion version)

- Audit ran against spec version with FR-1..FR-8 and D1..D11 only
- Challenger ran against same narrower version
- Findings logged at `meta/audit-findings.md` (6 findings: 1H/2M/3L) and `meta/design-challenge.md` (7 findings: 1H/4M/2L)
- Resolutions (2 of 8 acted on in commit 542b7b1):
  - Audit [H1] (string vs object `AGENT_WRITE_ORIGIN` in FR-4 test): addressed — clarified test-local UM uses AGENT_WRITE_ORIGIN object
  - Audit [M2] (applyByPrefixSuffix line numbers stale 192-211 not 148-167): corrected in §7c / §13
  - Challenge [H1] (user content under AGENT_WRITE_ORIGIN via prefix-suffix mirror): led to §7a origin-preservation clarification
  - Challenge [M3] (syncTextToFragment dead code + STOP rule): led directly to FR-9 deletion
- Remaining findings carried into iterative loop; Bug-D handoff and harness hardening emerged from Challenge-level scrutiny of the handoff contract

## 2026-04-14 — Iterative-loop expansion: harness hardening in-scope under greenfield rules

- User affirmed greenfield discipline: "no deferred tech debt, optimize for architectural correctness."
- Reclassified harness gaps from Future Work to In Scope:
  - FR-11 bridge invariant watcher (auto-enforced)
  - FR-12 origin-preservation probe helpers
  - FR-13 server-side state inspector
  - FR-14 multi-client factory + convergence assert
  - FR-15 observer scheduler DI
  - FR-16 network-layer sync control (message-ordering, not wall-clock waits)
  - FR-17 property-based bridge-convergence fuzzer (minimal initial op set)
- New decisions: D14 (auto-watcher), D15 (scheduler DI), D16 (structural races), D17 (PBT + AGENTS.md precedent #11)
- Bug-D handoff formalized: FR-9 (delete `syncTextToFragment` + rewrite CLAUDE.md STOP rule), FR-10 (commit Bug-D regression as `.skip`-guarded), D12 (deferral rationale), `evidence/bug-d-mechanism.md`
- Miles coordination codified: D13 (PR #134 no architectural dependency; either merge order works)
- Spec grew from ~453 → 887 lines with substantial new architectural scope

## 2026-04-14 — Pre-audit checkpoint (second pass)

- Prior `meta/audit-findings.md` and `meta/design-challenge.md` reflect only the pre-expansion spec (FR-1..FR-8, D1..D11).
- New content (FR-9..FR-17, §7e, §7f, D9 rewrite, D12..D17, SCOPE expansion) has not been adversarially reviewed.
- About to spawn fresh parallel audit + challenger on current SPEC.md (887 lines) with delta focus.
- Prior findings files will be overwritten by subagents; this changelog preserves the audit trail.

## 2026-04-14 — Second-pass audit + challenger complete; assessment via /assess-findings

**Audit results (9 findings: 3H, 4M, 2L).** See `meta/audit-findings.md`.
**Challenger results (9 findings: 3H, 4M, 2L).** See `meta/design-challenge.md`.

**Convergent signals between audit and challenger:**
- Audit-H1 + Audit-H2 + Challenger-L8 — FR-11 enforcing-origins type (string `'file-watcher'` would not match production object; `ROLLBACK_ORIGIN` missing; type should be `Set<LocalTransactionOrigin>`).
- Audit-H3 + Challenger implicitly — FR-4 test uses string `'agent-write'` in trackedOrigins; Y.js `UndoManager` matches by identity. Regression from prior audit.
- Audit-L9 + Challenger-M5 — D17 PBT claim conflates CRDT-primitive PBT with application-bridge stress testing.
- Audit-M6 + Challenger-H3 — FR-15 scheduler DI has behavioral/typing gloss + over-reaches on observers.ts public shape.

**Corrections applied to SPEC.md (evidence-determined, autonomous):**
1. FR-11 enforcing-origins set now uses `FILE_WATCHER_ORIGIN` and `ROLLBACK_ORIGIN` object refs; typed `Set<LocalTransactionOrigin>`; SCOPE expanded to export both constants. [Audit-H1, Audit-H2, Challenger-L8]
2. FR-4 test + §1 + §4 P1 + §7b + A4 + evidence/v0-14-interaction.md updated to use `AGENT_WRITE_ORIGIN` object ref; A4 annotated with Y.js identity-matching semantics. [Audit-H3 surface fix]
3. `applyByPrefixSuffix` line references corrected from `148-167` → `192-211` in FR-2, §7c, §13. [Audit-M4]
4. Bug-D test filename unified to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` with diagnostic-name origin cross-reference everywhere. Reconciled FR-10 "content unchanged" vs §13 "rewritten" — spec takes no position; V0-14 owns the decision (DELEGATED resolution). [Audit-M7]
5. Stale test counts (225+ / 358+) removed from G6 / FR-1 / NFR. [Audit-L8]
6. D17 reframed: randomized stress test with oracles, not "property-based testing." Dropped the CRDT-primitive PBT alignment claim. Added validation gate (fuzzer must catch Bug-A/B/C in pre-fix codebase within ≤25 seeds). [Audit-L9 + Challenger-M5]
7. D18 added: fuzzer op-set coverage is CI-enforced, not a documented norm. Fails CI if a bridge write surface lacks an op. [Challenger-M7]
8. FR-11 quiescence mode DROPPED; per-tx only. Settled-state assertion delegated to `assertAllConverged` (FR-14). D14 + §7f.1 + §11 risk row updated accordingly. [Challenger-H2]
9. FR-16 trimmed from 5-method API to `pauseSync`/`resumeSync` only. `delaySync`/`dropInbound`/`inspectSyncQueue` deferred to follow-up. FR-17 generator op-set reduced to 8 kinds all backed by shipped primitives. [Challenger-M4]
10. Bug-D handoff strengthened: §12 Future Work now explicitly requires V0-14's own spec to list the unskip as a required FR. `.skip` is acknowledged as a soft gate; spec-level requirement is the hard gate. [Challenger-M6]

**Escalated to user (genuine judgment calls):**
- **E1: §7f scope.** Challenger-H1 argues §7f is a separate spec. Evidence supports tension between core bridge fix (FR-1..FR-10) with concrete reproducer acceptance and harness hardening (FR-11..FR-17) which requires calibration against real usage. Options: keep bundled with corrections applied; contract to minimal load-bearing subset; split into sibling spec.
- **E2: FR-15 scheduler DI.** Challenger-H3 + Audit-M6 combined argue the scheduler DI over-reaches observers.ts public shape for a benefit parameterizing `DEBOUNCE_MS` or test-only wrapping would already buy. Options: keep as proposed; switch to test-only wrapping (no observers.ts public-shape change); parameterize `DEBOUNCE_MS` only; defer entirely.
- **R1: FR-4 test topology.** Audit-H3 deeper layer — client-side UM cannot observe server-originated agent writes. G5's "UM retains tracked Items through bridge cycle" is test-harness-invalid as currently framed. Options: rewrite FR-4 against server-side UM via `getServerState` (FR-13); use shared-Y.Doc unit test without network; accept the limitation and scope G5 more narrowly.

User response pending.

## 2026-04-14 — Escalated findings resolved; Step 8 (verify and finalize) in progress

User directives (greenfield stance — optimize for architectural correctness, no deferred tech debt):

**R1 → (a) Server-side UM via `getServerState`.** FR-4 test rewritten in §7d to attach `Y.UndoManager` to server-side Y.Text via FR-13's `getServerState` helper. Mirrors V0-14's actual topology; resolves the identity-matching issue (server transactions originate under `AGENT_WRITE_ORIGIN` object, client-side UM cannot capture WebSocket-sync'd remote transactions). FR-4 row + G5 + §7d test body updated. Added a comparison table (client-side rejected vs server-side adopted) for future readers. Implementation ordering note added: FR-13 must land before FR-4's test.

**E1 → (a) Keep §7f bundled.** After 10 corrections applied during assessment, the challenger's "§7f is separate spec" concerns are substantially dissolved: quiescence dropped, PBT overclaim reframed, fuzzer op-set speculative trim, validation + coverage gates added, network API trimmed. Precedent-setting (precedents #10 and #11) lands with the code that embodies them. The bridge fix and its invariant-enforcement discipline are two halves of one architectural commitment.

**E2 → (a) Scheduler DI on `ObserverDeps`, with Audit-M6 typing fix applied.** Scheduler interface return type narrowed from `unknown` to `ReturnType<typeof setTimeout>` — keeps `debounceA: ReturnType<typeof setTimeout> | null` typing intact in observers.ts with zero casts at call sites. Default scheduler is arrow-wrapped passthrough (avoids method-binding ambiguity). Manual scheduler's internal numeric-id casts are scoped to the scheduler implementation boundary. §7f.5 TS sample + FR-15 acceptance + §11 risk row all updated. D15 unchanged in substance (architectural precedent stands) but the type contract is now explicitly typed.

## 2026-04-14 — Step 8 mechanical adversarial checks complete

- **ASSUMED decisions:** none. 18/18 decisions in Decision Log are LOCKED.
- **Confidence gaps on 1-way doors:** none — all public-shape commitments (D1 `applyAgentMarkdownWrite`, D8 `applyByPrefixSuffix`, D9 delete `syncTextToFragment`, D15 `Scheduler` interface, D16 `ControllableWebSocket`, D17 randomized-stress framing, D18 coverage gate, precedents #10 + #11) are backed by audit-verified evidence.
- **Non-goal temporal tags:** NG1–NG5 `[NEVER]`, NG6–NG9 `[NOT NOW]` — all correct (NG9 Bug-D is design-coupled to V0-14, not permanently out).
- **Resolution status on all decisions:** 18 LOCKED + 1 DELEGATED-latitude on Bug-D test rewrite (SCOPE only, not an open decision).
- **Resolution completeness gate (per In Scope item):** all 17 FRs pass — decisions made, 3rd-party deps named and verified in `node_modules/`, architectural viability confirmed via audit, integration boundaries clean, acceptance criteria verifiable, no Out-of-Scope dependencies.
- **Future Work tiers:** Bug-D `[Specified — V0-14 scope]`; per-character attribution `[Identified]`; production observability `[Identified]`; fuzzer op-set extension `[Identified]`; XmlFragment event-driven sync `[Explored]`.

Baseline commit: will be updated from `08c20f1` to current `HEAD` as part of finalization.

## 2026-04-14 — Spec finalized (Step 8 complete)

**Status:** Ready for Implementation.

**Baseline commit:** `08c20f1` (unchanged — no production code modified during spec session; baseline remains the authoritative verification target against which the spec's claims were confirmed).

**Final state:**
- 1001 lines total. 7 personas (P1..P5 + downstream V0-14, upstream file-watcher context). 7 goals (G1..G7). 9 non-goals (NG1..NG9). 17 functional requirements (FR-1..FR-17). 8 Open Questions (all resolved). 18 Decisions (all LOCKED). 7 Assumptions. 8 Risks. 4 Future Work items (tiered). 1 implementation-ordering section. Agent Constraints with SCOPE/EXCLUDE/STOP_IF/ASK_FIRST.
- 5 architectural precedents established: #10 (XmlFragment-authoritative for markdown state), #11 (bridge invariants enforced + stress-verified), continuity with existing #1 (typed origins), #4 (shared computation), #9 (minimal CRDT mutation).
- 4 evidence files: bug-a-mechanism, bug-b-mechanism, bug-d-mechanism (new), updateYFragment-is-structural-diff, v0-14-interaction.
- 4 regression/evidence test files ready to commit: observer-a-baseline-absorption-repro (→ bridge-convergence-regression), bug-a-mechanism-isolation, bug-c-real-reachability, bug-d-v0-14-agent-undo-under-concurrent-typing (skip-guarded, renamed from diagnostic).

**Coordination:**
- Miles's PR #134 (attribution/identity threading): no architectural dependency per D13; either merge order works; this spec's `applyAgentMarkdownWrite` signature will accept Miles's `{agentId, agentName}` threading cleanly on rebase.
- V0-14 inherits: Bug-D handoff template (§7e), skip-guarded test to unskip, precedent #10 for undo handler design, FR-17 fuzzer op-set extension to add `agent-undo` (D18 coverage gate will enforce).

**Audit trail:** two full audit + challenger passes (9+9 findings second pass), 10 corrections auto-applied, 3 escalated findings resolved by user (R1-a server-side UM, E1-a keep bundled, E2-a scheduler DI with typing fix). All findings logged in `meta/audit-findings.md` + `meta/design-challenge.md`; resolution audit trail in this changelog.
</content>
</invoke>