## Changelog

### 2026-04-14 — Bridge-invariant reframe + V0-14 integration post-PR #39 merge
**Trigger:** PR #39 (Timeline + rollbacks) merged on 2026-04-14. It removed the agent UndoManager scaffold (per TQ13) and deferred per-origin undo to V0-14. Our spec needed reframing for three reasons: (a) the original FR-4 consumer was removed, making the behavioral acceptance test (zombie content on undo) unverifiable today; (b) server-side `safetyCheckpoint` primitive shipped (`shadow-repo.ts:254`), creating a naming collision with our proposed client-side helper; (c) V0-14 is documented in PROJECT.md:107-148 as the returning consumer, using standard `Y.UndoManager({ trackedOrigins: Set(['agent-write']) })`.

**Strategic pivot (greenfield-lens):** reframe spec from behavioral ("zero zombie content on agent undo") to architectural ("bridge quality invariant: Observer A preserves Items whose content already matches"). The invariant is testable today via a test-local `Y.UndoManager` as a probe for Item preservation — no product UndoManager needs to exist.

**Changes applied:**
- Header: bumped date, added V0-14 consumer reference, added TQ5/TQ6 PROJECT.md tracking IDs, updated baseline to post-PR-#39 rebase
- §1 Problem Statement: rewritten as bridge-invariant framing; ~257 chars/cycle acknowledged as symptom-of-invariant-violation, not the spec's measurable goal; V0-14 consumer status contextualized
- §2 Goals: G1 rewritten as Item-preservation invariant; G5 added (V0-14 correctness realized when Miles lands it); G6 renumbered
- §3 Non-goals: expanded to NG1-NG8; adds explicit statement that V0-14 architecture + Miles's code are out of scope; `'rollback-apply'` origin documented but not acted on
- §4-5 Personas + User Journeys: P1 refocused to V0-14 per-agent UM as the primary consumer; happy path rewritten end-to-end under V0-14; failure-mode narrative added
- FR-4: behavioral → architectural. Test via Item introspection + test-local UndoManager probe; no product UM required
- FR-7: `safetyCheckpoint` Y.Map helper DROPPED; replaced with `console.warn` + optional `ObserverDeps.onMergeFailed` callback (matches existing observers.ts diagnostic precedent at lines 337/367/500)
- §7b `applyUserDelta` code: signature changed to `(deps: ObserverDeps, oldXmlMd, newXmlMd)`; `emitSafetyCheckpoint` call replaced with inline `console.warn` + `deps.onMergeFailed?.(info)`; `ObserverDeps` interface addition shown inline
- §7c: rewritten as rationale for dropping safety-checkpoint approach (naming collision + no consumer + existing precedent)
- §7d test plan: FR-4 Item-preservation test with UndoManager probe is now the PRIMARY FR-4 assertion; safety-checkpoint.test.ts dropped; FR-7 test becomes `spyOn(console, 'warn')` + `onMergeFailed` callback assertion
- Decision Log: D10 revised; D13 added (bridge-invariant framing LOCKED); D14 added (no safety-checkpoint helper LOCKED); D15 added (origin landscape acknowledged)
- Assumptions: A1 upgraded confidence (verifiable via FR-4 architectural test); A7 added (V0-14 uses trackedOrigins per PROJECT.md); A8 added (rollback not UM-tracked per D6(b))
- Future Work: XmlFragment event-driven sync framing refined; `onMergeFailed` consumer identified; per-character attribution linked to NG7
- SCOPE: removed safety-checkpoint files; explicit `ObserverDeps` interface change documented; noted PROJECT.md:910 vocabulary shift as follow-up (not in-spec); AGENTS.md duplication noted as Miles's territory
- ASK_FIRST: removed safety-events map reference; added callback shape + don't-reintroduce-Y.Map guidance

**Assessment:** the reframe doesn't change the code we write, only how it's justified and tested. Fewer files created (no safety-checkpoint.ts), tighter consumer coupling story (V0-14 inherits correctness), invariant testable today without V0-14 shipping first.

### 2026-04-13 (pm-4) — Test-plan completeness pass + final lock
- Added explicit FR-1 (content-gate skip), FR-2 (DMP patch_apply), A1 (UndoManager-stack-preservation) tests to `observers.test.ts` extension.
- Added `observers.fuzz.test.ts` extension to SCOPE for R3 + A5 verification (agent-paragraph-rewrite operator).
- G3 tightened: STOP_IF threshold (>20% Path A regression) explicitly triggers spec escalation.
- All FRs, decisions, OQs, assumptions, risks have explicit test coverage or rationale for why no test is needed.
- Status: **Ready for Implementation.** No open INVESTIGATING / NEEDS USER JUDGMENT items remain.

### 2026-04-13 (pm-3) — Audit findings applied (22 findings, 16 fixed in-spec)
**Audit performed:** general-purpose subagent reviewed spec for coherence + completeness across 7 dimensions. Punch list of 22 findings (F1–F22), prioritized blocking / should-fix / nice-to-have.

**Blocking fixes applied (8):**
- F1: `ASK_FIRST` no longer references dropped `diffCharsFast`; updated to refer to `safety-events` map and DMP instance properties.
- F5: Iteration style change in 7a (for-of → indexed for) called out explicitly.
- F6: `applyUserDelta` signature changed to `(doc, ytext, oldXmlMd, newXmlMd)` — explicit doc param replaces fragile `ytext.doc!`.
- F8 (BIGGEST): `safetyCheckpoint` writes to NEW `Y.Map('safety-events')`, not `Y.Map('activity')` — avoids schema collision with agent-id-keyed presence consumers and feedback-loop risk with `agent-flash-source.ts`.
- F10: Emission gate simplified to `results.some(ok => !ok)` only — no longer fires on every benign Path B merge. Renamed `kind` from `'merge-collision'` to `'merge-failed'` to reflect actual semantics.
- F14: A6 added — baseline behavior after Path B documented and verified non-regressive.
- F15: DMP `Match_Threshold = 0.5` pinned explicitly in code (defensive against shared-instance mutation).
- F20: Precedent #9 already drafted in AGENTS.md/CLAUDE.md (mirrored) — covered in D12.

**Should-fix applied (7):**
- F2: Problem statement updated to describe DMP `patch_make`/`patch_apply` rewrite, not the dropped char-level pivot.
- F4: Stale strikethrough FR-7 row removed.
- F9: FR-3 acceptance criteria tightened to specify the exact multi-client propagation path.
- F11: TQ6 baseline assertion added.
- F12: TQ6 multi-client variant added (per CLAUDE.md "Observer bridge coverage" rule).
- F13: D8 characterization test added (`"hello!!"` for exact-char overlap).
- F18 / F21: SCOPE annotated with import declarations needed; A3 (10% Path B rate) dropped per greenfield directive.

**Nice-to-have deferred:**
- F3, F16, F17, F19, F22 — minor framing or out-of-scope concerns. F22 (D8 mitigation deferral evidence) acknowledged in Future Work; resolution requires user-facing observation, deferred to post-V0.
- F7 (`safetyCheckpoint` runs inside `'sync-from-tree'` transaction) — acknowledged: F8 fix + dedicated map make this safe; activity-map consumers don't read `safety-events`.

### 2026-04-13 (pm-2) — All open questions resolved, decisions cascaded
- D5–D12 LOCKED. User confirmed: D5 (DMP `patch_apply`), D6 (drop diffCharsFast), D9 (user-wins on collision), D10 (safetyCheckpoint emission), D11 (NO Path A/B counter), D12 (AGENTS.md precedent #9).
- Section 7 of SPEC fully rewritten:
  - 7a: content-comparison gate (FR-1) — code with adjacent REMOVED+ADDED pairing
  - 7b: `applyUserDelta` now uses DMP `patch_make` + `patch_apply` (canonical three-way merge)
  - 7c: NEW `safety-checkpoint.ts` helper for FR-7
  - 7d: TQ6 stress test extended with collision + safetyCheckpoint emission assertions
- FR table: FR-7 redefined as safetyCheckpoint emission requirement; old FR-7 (diffCharsFast) struck through.
- SCOPE updated: removed `diff-chars-fast.ts`/`.test.ts`, added `safety-checkpoint.ts`/`.test.ts`, added `AGENTS.md`.
- Risks: added DMP fuzzy-match risk (R3); added baseline drift verification (R4).
- Assumptions: A2 superseded by A4 (DMP patch_apply correctness, empirically verified), A3 status unblocked (no telemetry per D11), A5 added (Match_Threshold default).
- AGENTS.md / CLAUDE.md (symlinked): added precedent #9 documenting the three patterns.

### 2026-04-13 (pm) — Backlog extended with research findings + DMP probe
- `/research` workflow completed: `reports/crdt-origin-laundering-prior-art/REPORT.md` + 5 evidence files. Key findings: Yjs UndoManager has no built-in fix (dmonad: application-layer), y-prosemirror validates minimal-mutation principle, BlockSuite's `{proxy:true}` is closest but doesn't solve our exact problem, three patterns unclaimed in literature.
- DMP empirical probe at `/tmp/dmp-probe.ts`: `patch_make(base,user)` + `patch_apply(patches,agent)` correctly merges same-line collision (`"Hello world brave"`) and handles three-way merge canonically. Custom walk in current spec 7c produces two-line split (wrong).
- Added OQ-4 through OQ-10, D5 through D8 (recommend-lock), 2 new risks (DMP fuzzy-match, baseline drift).
- Pending user judgment: OQ-5 (user-delete + agent-modify line semantics), OQ-6 (safetyCheckpoint emission), OQ-7 (Path A/B telemetry), OQ-10 (AGENTS.md novelty documentation).
- Recommend LOCK: D5 (DMP patch_apply), D6 (drop FR-7), D7 (adjacent-only gate), D8 (accept exact-char duplication).

### 2026-04-13 — Spec scaffolded
Created during /spec session. Context: collaboration-capabilities-audit STORY.md §15 Nick's independent track. D7 re-revised — Observer A work decoupled from Miles's undo (FR-1/FR-2/FR-3/FR-5/FR-6 ship without it). This spec covers FR-4/US-3e (same-line interleaved undo) via origin-aware diff.

Key investigation findings persisted to evidence/:
- `yjs-item-origin-model.md` — Items don't store transaction origins; fix must use content comparison, not origin inspection
- `observer-a-two-paths.md` — Path A (simple) is low-risk for origin-laundering; Path B (diverged/applyUserDelta) is the problem path; char-level diff + content-comparison gate is the fix
