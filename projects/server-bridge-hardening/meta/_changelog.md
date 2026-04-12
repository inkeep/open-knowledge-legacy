# Changelog — server-bridge-hardening

## 2026-04-11

### Session start
- Bet framing: "group the remaining future work from PR #38 audit into coherent stories, anchored on external-change.ts test coverage as seed"
- Source material: tmp/ship/pr-future-work.md + 2026-04-11 audit against origin/main (`3a5ee59`) + `review-status.json` deferredFindings
- Project scaffolded at projects/server-bridge-hardening/
- Phase 1 grounding: audit already produced world-model-equivalent investigation. Skipping /worldmodel dispatch (rich input).

### Phase 1 decisions
- **PQ1 Decided (Locked):** Appetite = Now phase only (~2-3 days). Trust the 5-probe narrow-wedge finding.
- **PQ2 Decided (Locked):** Decomposition axis = by beneficiary (outcome-framed). Avoids technical-layer anti-pattern.
- **PQ3 Decided (Locked):** Heavy conflict-avoidance weight vs Miles's PR #39. All 3 conflict stories (S3/S6/S8) deferred to Later.
- **XQ2 Decided (Directed):** Re-audit trigger = Miles's PR #39 merges OR subsystem change makes latent item acute. Scope = rerun 2026-04-11 audit methodology.

### Cascade
- Writing stories into PROJECT.md committed scope = Now (S1, S4, S7). Next (S2, S5) and Later (S3, S6, S8) tracked but not committed.
- P2 tail populated (TQ3–TQ13) with parked status and promotion triggers.
- Cross-cutting concerns section filled: Miles's PR #39 merge boundary, test-harness leverage, onSyncError complement.
- Rabbit holes + pre-mortem written to close Phase 1 + Phase 2 + Phase 3 in a single pass given compressed input.

### Pending (carried forward)
- TQ1: S1 test approach — RESOLVED in spec (unit tests for unified handler only, post-unification)
- TQ2: S7 codification location — RESOLVED in spec (integrate into existing Testing section)
- XQ1: S4 init-throw recovery semantics — RESOLVED in spec (destroy-and-evict via destroyEntry)

## 2026-04-11 (afternoon) — PQ3 reframe

### Trigger
User surfaced new framing: "I'm ok with making Miles rebase if we fix the correct bugs/issues and do what's architecturally right if it's evidence-based."

### Evidence-based verification
Agent verified PR #39 actual conflict surface (saved at `specs/2026-04-11-server-bridge-hardening-now/evidence/pr39-conflict-surface-analysis.md`):
- standalone.ts: Miles's change is **+1 line at line 138**. Our unification edits at 177-205, S3 edits at 82-88 + 426-687. **Zero textual overlap.**
- hocuspocus-plugin.ts: Miles adds shadow repo init — partially addresses what S8 would do.
- Miles's branch hasn't been rebased since PR #38 merged — his rebase is already locked in regardless of our work.

### PQ3 reframe
- **PQ3 status:** was "Decided (Locked) — Heavy conflict-avoidance" → NOW "Decided (Locked) — Evidence-based, not heavy"
- **Rationale:** The heavy framing was precautionary, based on file-list overlap rather than textual diff. Actual conflict surface with PR #39 is effectively zero for all our target stories.

### Promoted stories (Later → Now)
- **Unification (was NG1):** Promoted to Now. Replace `standalone.ts applyToDoc` with `createExternalChangeHandler(hocuspocus)` call. Collapses active drift.
- **S3 (server.degraded signal, was Later):** Promoted to Now. The only Major-severity finding from PR #38 review. Near-zero conflict with #39.

### Simplified stories
- **S1:** Dual-copy test plan dropped. Now tests the unified handler directly. Reduces scope from ~1.5 days → ~0.5 day.

### Stories that REMAIN deferred (on their own merits, not conflict-blocked)
- **S5 (module-level state refactor):** Still no multi-instance roadmap forcing function. Speculative.
- **S6 (createServer god-function split):** No forcing function. 688 lines is uncomfortable but not painful.
- **S8 (dev plugin reconciliation):** **Miles's PR #39 is partially doing this.** Re-audit after his PR merges.

### New scope for Now (5 stories)
1. Unification
2. S1 (simplified)
3. S3 (promoted)
4. S4 (unchanged)
5. S7 (unchanged)

Total: still ~2.5-3 days. Same ballpark budget, significantly higher value.

### Cascade to SPEC.md
The server-bridge-hardening-now spec at `specs/2026-04-11-server-bridge-hardening-now/SPEC.md` was rewritten to reflect the new scope. Five atomic commits planned (S7 → unify → S1 → S3 → S4 by increasing risk). See spec _changelog.md for decision-level detail.
