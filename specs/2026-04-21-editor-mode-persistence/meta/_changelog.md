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

---

## 2026-04-22 — D9 supersedes D7 (post-ship reversal, PR #269 amend-in-place)

**What:** After D7 (focus-based cross-window sync, Excalidraw Pattern C) shipped in PR #269, the user surfaced UX feedback: *"hmm, i think this is kind of weird, seeing a page just change in front of me when i click on a tab. [...] open tab a can't affect open tab b, unless tab b refreshes."* The spontaneous mode-flip on tab-click was itself surprising, regardless of D7's IME/drag-select protection. D9 resolves this by retiring cross-window sync entirely — each tab is its own session for its lifetime; `localStorage` is read only at load (refresh, new tab, new window). Matches VS Code / JetBrains IDE convention.

**Why D7's framing was wrong:** D7 solved a real problem (mid-edit IME interruption when swapping mode on an unfocused window) but for a window the user isn't looking at — eventual-consistency on an unfocused window has low user value. D7 optimized a trade-off where the less-optimized alternative (no live sync at all) was strictly simpler AND aligned better with the user's mental model of "each tab is its own session."

**TDD-driven test revision (via `/tdd` skill):**
- 4 unit tests for the deleted `shouldApplyPersistedMode` H1 guard retired (33 → 29 unit tests).
- 3 E2E tests retired: old T3 (cross-window focus-based sync), old T5 (diff exit under concurrent flip — H1 race), old T7 (rapid external-write + focus churn). Their invariants no longer exist.
- 1 new E2E test added: new T3 "open tabs are independent until reload." Positive assertion of the D9 invariant: flip in page A + focus return on page B leaves B unchanged; reload B picks up the new value. Would fail if any future contributor re-added a focus listener.
- Net: 9 → 7 E2E tests (T1, T2, T3-new, T4, T6, T8, T9).

**Surface changes:**
- `use-editor-mode.ts` — delete focus `useEffect`, delete `shouldApplyPersistedMode` helper, drop `useEffect` from React import, simplify JSDoc.
- `EditorPane.tsx` — delete `editorModeRef` + mirror effect, delete cross-window sync `useEffect`, delete `shouldApplyPersistedMode` import. `handleModeChange` write-side unchanged; `modeBeforeDiffRef` diff restoration unchanged (pre-existing behavior).
- `index.html` — inline FOUC script **unchanged** (it already reads localStorage only at load, which matches D9).
- SPEC.md — §1, §2, §5.1 S3, §6.1 FR-4 (inverted) / FR-6 (trimmed), §7.3 (code sample simplified), §7.4 (integration simplified — no sync effect), §8.1 (focus tests retired), §8.3 (T3 rewritten, T5/T7 deleted, T9 kept), §8.4 (MQ1+MQ2 retired, MQ3 renumbered as MQ1), §10 (D7 annotated "Superseded by D9", D9 added as LOCKED), §12 A3 (retired), §13 R1/R4/R7 (N/A under D9), §15 STOP_IF (diff-aware-branch carve-out deleted), §16.1 (alternatives condensed).
- AGENTS.md (two duplicated sections), `.changeset/editor-mode-persistence.md` — updated to reflect per-tab-session design.

**Non-breaking for existing users:** The `ok-editor-mode-v1` localStorage key is unchanged; existing entries are forward-compatible. A user whose browser has `'source'` in that key picks it up at load under D9 exactly as they did at load under D7 — the only behavioral delta is what happens at focus-return while a tab is open.

**Scope posture:** Amended PR #269 in place (user directive). D7 never shipped to main — the feature lands on main with the simpler D9 design on first merge. 5 logical commits on top of `b714a500`.

**D7 entry preservation:** Left intact in §10 with a "SUPERSEDED by D9" annotation, preserving the audit + design-challenge paper trail (meta/_audit-findings.md, meta/_design-challenge.md, this changelog). Per CLAUDE.md post-ship corrigendum protocol: shipped specs are moment-in-time; add breadcrumbs, don't rewrite. Applied here for consistency even though PR #269 hasn't merged — the audit artifacts already reference D7 and deserve the historical record.
