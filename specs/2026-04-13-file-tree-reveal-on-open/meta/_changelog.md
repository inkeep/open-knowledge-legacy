# Changelog

Append-only process history for this spec.

---

## 2026-04-13 — Scaffold + initial decisions

**Created:**
- `SPEC.md` at baseline commit `496a06d`
- `evidence/navigation-flow.md` — trace of the six navigation entry points converging on `App.tsx` hashchange listener
- `evidence/sidebar-collapse-state.md` — root-cause trace of `FileTreeNode.collapsed` mount-only initialization

**Decisions locked during Intake:**
- **D1 (1A):** Always expand ancestors on `activeDocName` change. User confirmed after agent recommendation. Rationale: hiding the active file is an incoherent sidebar state; manual-collapse override semantics add complexity without clear user-value gain. Escape hatch in Risk §14 + Assumption A3.
- **D2 (2B):** Use `scrollIntoView({ block: 'nearest' })` — scrolls only when off-screen via native CSSOM semantics. User confirmed agent recommendation.
- **D3:** Canonical-only expansion; alias paths not auto-expanded. Alias-aware reveal moved to Future Work (Explored tier).

**Scope:**
- In Scope: reveal-on-activate for all entry points, via single lifted-state primitive in `FileSidebar.tsx`.
- Future Work: alias-aware reveal (Explored), persistent collapse state across sessions (Identified), sidebar virtualization & search-inside-sidebar (Noted).

**Judgment calls deferred / confirmed:**
- None remaining for In Scope items as of scaffold. Open Questions §11 is empty.

**Additional decisions during backlog phase:**
- **D7:** `scrollIntoView` uses `behavior: 'instant'` on initial mount, `'smooth'` on subsequent activations. User confirmed 1B.
- **D8:** Don't auto-open a visually-collapsed sidebar on activation. User confirmed 2A. Hidden-sidebar reveal state is still computed; user sees result on re-open.

**Correction during backlog probe:**
- D6 updated during negative-space extraction. Initial sketch had `useEffect(..., [activeDocName, documents])` to "retry on tree update." Discovered this would re-fire on every 5s poll and regress the existing folder-toggle test (`ux-interactions.e2e.ts:184-211`) by overwriting user's manual collapses. Corrected to `[activeDocName]` only. Ancestor paths are string-derived, not tree-derived — they can be pre-seeded into `expandedPaths` optimistically, so no retry is needed.

---

## 2026-04-13 — Audit + design challenge + assess-findings

**Subprocesses run:**
- Auditor: 5 findings (2H, 2M, 1L) — all factual/coherence corrections.
- Challenger: 7 findings (2H, 3M, 2L) — 2 decision-implicating, rest documentation.

**Pure corrections applied:**
- A1 [H]: §13 Next actions deps fixed (`[activeDocName]` only — now subsumed by D4 derive pattern, not a `useEffect` with deps at all).
- A2 [H]: §9 failure-modes and §8 known-gaps rewritten to match D6 + D4; no more retry-on-tree-update framing.
- A3 [M]: §1 entry-point table split WikiLinkView 266 into its own "Post-create wiki-link navigation" row. Noted that `FileSidebar.tsx:362` (post-delete hash-clear) is not a nav-to-doc entry point.
- A4 [M]: §13 Next actions updated with new D4/D7 mechanics (no first-activation ref needed per D7 simplification).
- A5 [L]: `App.tsx:37` → `App.tsx:29-39` for consistency with evidence.
- M4: D6 rationale widened to cover all `documents`-mutation sources (rename, delete, polls); transitive-ancestor-rename covered by `handleRename` writing new hash.
- M5: Rapid back-and-forth graph-navigation pattern noted in A3 assumption; D8 flagged as escape valve.
- L6: "Sidebar-collapsed orientation cue (breadcrumb)" added to §15 Future Work Identified.

**Decision reopens resolved (user confirmation 2026-04-13):**
- **R1a → A:** Don't steal focus on activation. Roving tabindex, `aria-current="page"` on active row. → **D9 LOCKED.**
- **R1b → B:** Drop `behavior: 'smooth'`; use plain `scrollIntoView({ block: 'nearest' })`. Matches sibling convention (`WikiLinkSuggestionMenu`, `SlashCommandMenu`). Honors `prefers-reduced-motion` implicitly. → **D7 REVISED** (supersedes earlier instant-vs-smooth split).
- **R1c → B:** Rely on `aria-expanded` transitions for SR announcement; no `aria-live` region. → rolled into D9.
- **R2 → B:** Derive-don't-store. `expandedPaths = (ancestors(activeDocName) ∪ userExpanded) \ userCollapsed`, intersected with `folderPaths` on every render. → **D4 REFINED.**

**Design findings dissolved by D4 refinement:**
- **H2 (stale `expandedPaths` after rename/delete):** Render-time intersection with `folderPaths` filters stale entries. Recreated folders render collapsed by default.
- **L7 (scroll-before-children race):** Expansion is synchronous with render; scroll `useEffect` runs post-render against already-mounted DOM.

**Decision Log shape after this round:**
- D1 LOCKED (always reveal)
- D2 LOCKED (scroll when off-screen via `'nearest'`)
- D3 LOCKED (canonical only)
- D4 DIRECTED REFINED (derive-don't-store)
- D5 LOCKED (entry-point agnostic)
- D6 LOCKED (scroll deps `[activeDocName]`)
- D7 LOCKED REVISED (plain scrollIntoView, no behavior)
- D8 LOCKED (don't auto-open sidebar)
- D9 LOCKED NEW (a11y: aria-current, roving tabindex, no focus steal)

**Pending:**
- Verify + finalize (Step 8): mechanical adversarial checks, resolution completeness gate, quality bar, Agent Constraints §16 final pass.

---

## 2026-04-13 — Verify and finalize

**Mechanical adversarial checks:**
- ASSUMED decisions: none. All LOCKED or DIRECTED.
- 1-way door confidence gaps: none. No 1-way doors in Decision Log.
- Non-goal temporal tags verified: NG1 NOT NOW (persistent collapse — additive, no rework); NG2 NOT NOW (alias-aware reveal — additive); NG3 NEVER (sidebar redesign — not in direction).

**Resolution completeness gate:**
- All decisions affecting In Scope items made ✓
- No 3P dependencies added ✓
- Architectural viability validated (standard React, existing patterns in repo) ✓
- Integration feasibility confirmed (single file, no cross-boundary concerns) ✓
- Acceptance criteria verifiable (Playwright + unit tests named) ✓
- No dependency on Future Work items ✓

**Quality bar:**
- SCR problem statement ✓
- Goals + non-goals with temporal tags ✓
- Requirements with verifiable acceptance criteria ✓
- Proposed solution vertical slice (UX, system design, data flow, failure modes) ✓
- Alternatives considered and rejected with reasoning ✓
- Decision Log complete with resolution status on every row ✓
- Risks + mitigations ✓
- Future Work tiered ✓
- Agent Constraints derived from In Scope decisions ✓

**Fact-check during finalize:**
- Confirmed `hashchange` does NOT fire on initial page load (browser behavior); direct URL access is handled by explicit `onHashChange()` call at `App.tsx:31`. Evidence file `navigation-flow.md` updated to clarify.

**Status → Approved.** Spec is implementation-ready.

**Not committed yet:** All artifacts live in the worktree `../open-knowledge-spec-file-tree-reveal` on branch `spec/file-tree-reveal-on-open`. User to review and commit.
