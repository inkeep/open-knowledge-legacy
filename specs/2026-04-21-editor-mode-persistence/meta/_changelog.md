# Changelog

## 2026-04-21 — Initial draft

**What:** First full SPEC.md draft. All P0 decisions resolved (D1-D8 all LOCKED). Ready for audit.

**Spec process milestones this session:**
- Intake: SCR problem statement + 5-probe stress test + 4 initial Open Questions presented.
- Research pass 1: Commissioned [`reports/editor-view-mode-persistence-prior-art/`](../../../reports/editor-view-mode-persistence-prior-art/) with 6 initial dimensions (D1-D6) covering mode-state inventory, storage location, cross-window stickiness, FOUC, URL overrides, Electron ecosystem.
- Research Path C update 1: Added D7 (per-page vs global scope taxonomy + Obsidian frontmatter plugin precedent) after user flagged scope dimension was scattered.
- Research Path C update 2: Added D8 (storage-event cross-tab sync adoption) after user asked specifically about Penpot and peers.
- Open-question-loop resolution: D5 (storage: localStorage), D6 (FOUC: inline script), D7 (cross-window: storage event listener), D8 (write timing: immediate) all locked per research-backed recommendations.

**Baseline commit stamped:** `c29a5a14`

**Pending:**
- Audit (step 6-7) — recommended but user may choose to skip for this scope given it's well-grounded.
- Verify + finalize.
- Move to implementation via `/ship`.

---

## 2026-04-22 — Audit + Challenge + Assess Findings

**What:** Spawned auditor and challenger subagents in parallel. Auditor returned 11 findings (3H / 5M / 3L); challenger returned 8 findings (3H / 4M / 1L). Invoked `/assess-findings` skill, triaged findings into 16 pure corrections (applied surgically) and 3 decision-implicating items (surfaced to user for judgment).

**Three decision-implicating items resolved by user:**
- **F1 = (b) focus-based re-check.** Reopened D7. The original recommendation (live `storage` event auto-apply, next-themes Pattern A) was rejected because the framing "flipping a CSS class is content-safe" under-weighted destruction of DOM focus / IME composition / drag-selection state caused by `display:none` on the mode-swap container. Adopted Excalidraw Pattern C — focus-based lazy re-check — which defers the apply to window focus return. This is exactly the pattern Excalidraw chose for its large-state editor via Issue #2791 + PR #4545.
- **F3 = (b) graceful-degradation framing for A1.** Rewrote A1 to treat future partitioning as a feature (each partition tracks its own pref) rather than a regression. Updated R5 accordingly.
- **F4 = (a) localStorage with explicit repo-convention acknowledgment.** Strengthened D5 rationale to distinguish the two established storage tiers (UX prefs → localStorage, project config → `config.yml`) and justify editor mode's placement in the UX-pref tier.

**Surgical corrections applied (14 edits across SPEC.md):**
- Audit H1 + Challenge F2: Fixed §7.4 `useEffect` dep-array bug via ref-based `editorMode` read; relaxed STOP_IF wording to allow the narrow diff-aware guard while still blocking changes to the `modeBeforeDiffRef` rule itself.
- Audit H2: FR-4 + T3 re-worded from "dual BrowserContext" to "one BrowserContext + two pages" — Playwright contexts don't share localStorage by design.
- Audit H3: A3 re-framed around the `focus` event (which is what we now listen on), not the `storage` event.
- Audit M1: FR-2 AC now asserts on `window.__OK_EDITOR_MODE__` presence pre-mount + first-rendered DOM match, rather than on `waitForLoadState('load')` (too late to prove no-flash).
- Audit M2: NFR-1 softened — dropped the ill-fitting "Playwright perf baseline" claim; retained the microsecond expectation as documented.
- Audit M3: NFR-4 reframed as manual QA; added §8.4 explicit Electron-packaged checklist (MQ1-MQ3).
- Audit M4 + Challenge F6: RAW_MDX_NAV listener stays session-only (does NOT persist). Aligned §7.5 with §7.4.
- Audit M5: Clarified §7.2 that this is the first inline FOUC script in-repo; flagged stale CLAUDE.md claim for separate corrigendum.
- Audit L2: Retitled to "Editor Mode Persistence & Cross-Window Sync."
- Audit L3: D2 rationale sharpened — precise next-themes framing.
- Challenge F5: Added E2E T7 rapid-toggle robustness test.
- Challenge F7: Softened §1 Complication's "multiplies on M1+" framing to forward-looking.
- Challenge F8: Moved storage-key rename from ASK_FIRST to STOP_IF (1-way door).
- Added E2E T8 (FOUC — first-rendered frame asserts persisted mode).

**Low-severity Audit L1 skipped** — non-actionable reference-list polish.

**Not accepted:**
- Challenge F4 option (b/c) config.yml-hybrid — explicitly considered and rejected; rationale added to §16.1 Design alternatives.

**Post-audit spec is:**
- Stronger on correctness (H1 logic bug fixed)
- Stronger on test coverage (T5 now covers H1's exact trace; T7 covers rapid-burst; T8 covers FOUC)
- More honest on assumptions (A1, A3 recalibrated)
- More principled on scope (D5 repo-convention tier explicit)
- More defensive on UX (F1 adopts focus-based pattern avoiding mid-edit interruption)

Ready for Verify + Finalize.

---

## 2026-04-22 — Verified + Finalized

**Mechanical adversarial checks:** Passed — no ASSUMED decisions (all 8 LOCKED), no LOW-confidence 1-way doors, Future Work items correctly tagged with maturity tiers.

**Resolution completeness gate:** Passed — every In Scope item (S1-S6) has design complete, test plan complete, no Out-of-Scope dependency.

**Quality bar:** Passed — traceability FR/NFR → design § → test case is bidirectional; every decision has evidence reference; all 1-way doors cite research evidence.

**Baseline commit at finalization:** `c29a5a14` (unchanged).

Spec is ready for `/ship` to enter implementation.

**Scope-bounded implementation cost estimate (order-of-magnitude, informational):**
- ~1 new hook file + tests (~150 LOC)
- ~10 lines inline HTML script
- ~5 lines change in EditorPane
- ~1 new E2E file (~200 LOC including fixtures)
- Total: ~350 LOC across ~5 files. No server/CRDT/CLI/desktop changes.
