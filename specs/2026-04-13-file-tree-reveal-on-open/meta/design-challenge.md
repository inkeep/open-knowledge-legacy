# Design Challenge Findings

**Artifact:** specs/2026-04-13-file-tree-reveal-on-open/SPEC.md
**Challenge date:** 2026-04-13
**Total findings:** 7 (2 high, 3 medium, 2 low)

The spec is small, focused, and internally coherent. Most decisions hold up under challenge. The high-severity findings cluster around what is *missing* from the spec rather than choices that are wrong: accessibility (focus + reduced motion) and stale-state cleanup on rename. Medium findings probe D7's smooth-scroll choice, D6's strict `[activeDocName]` deps under document mutations, and the "always-reveal" semantics for an edge case the spec doesn't enumerate.

---

## High Severity

### [H] Finding 1: Accessibility — focus management and screen-reader announcement are absent

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — accessibility reviewer)
**Location:** §6 Requirements, §9 Proposed solution, §13 In Scope (no a11y row)
**Issue:** The spec describes a visual reveal — expand ancestor folders, scroll into view — but says nothing about how this surfaces to keyboard or screen-reader users. Three concrete gaps:

1. **No focus management.** Activation can come from many entry points (graph click, wikilink, direct URL). After reveal, where does keyboard focus live? If a screen-reader user tabs back to the sidebar, they should land near the active row. Current behavior: focus stays wherever it was. The spec doesn't discuss whether the active row should be `tabIndex={-1}`-focusable for programmatic focus, or whether a roving tabindex is needed inside the tree.
2. **No `aria-current` on the active row.** The active file row has `isActive` styling (visual) but the codebase doesn't appear to set `aria-current="page"` (or similar). Screen readers won't announce "current" status. This is pre-existing, but the spec is the right moment to fix it because the spec is explicitly making activation visible.
3. **No screen-reader notification of expansion.** When ancestors auto-expand on graph click, an SR user gets no indication. A polite `aria-live` region announcing "Revealed: <docName>" or just leveraging the existing `aria-expanded` transition (which most SRs do announce) would close the gap.

**Current design:** The spec's only a11y-adjacent acceptance criterion is "`aria-expanded='true'` on ancestors" (§6 row 1) — which is a side-effect of the existing folder-button markup, not an intentional a11y design.

**Alternative:** Add explicit a11y requirements:
- Set `aria-current="page"` (or `="true"`) on the active file row.
- Decide focus policy: do we move focus on activation, or only set the active row as the next tab stop (roving tabindex)? Default recommendation: do not steal focus on activation (most activations originate from another widget the user is intentionally interacting with), but make the active row the next tab stop into the sidebar.
- Treat `behavior: 'smooth'` (D7) as conditional on `prefers-reduced-motion: no-preference` (see Finding 3).

**Trade-off:** A few extra lines and one more decision row in §10. No change to the core architecture.

**Status:** CHALLENGED
**Suggested resolution:** Add an "Accessibility" subsection in §6 with the three requirements above, and add D9 capturing the focus policy as a LOCKED product decision. The codebase already uses `prefers-reduced-motion` in `globals.css` (lines 191, 602, 644), so the convention exists — D7 should align with it.

---

### [H] Finding 2: Stale `expandedPaths` after rename / delete is not addressed

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — careful reviewer / dogfooding)
**Location:** §9 (state model), §13 next actions, D4 (lifted state), D6 (deps `[activeDocName]`)
**Issue:** `expandedPaths: Set<string>` accumulates indefinitely. Two concrete failure modes the spec does not address:

1. **Rename a folder while a doc inside is active.** `FileSidebar.handleRename` (line 290–321) sends rename to server, applies it to the local `documents` array, and writes `window.location.hash = #/${nextActiveDocName}`. The reveal effect fires on the new `activeDocName` and unions the **new** ancestor paths into `expandedPaths`. The **old** ancestor paths remain in the set forever. Concrete consequence: if the user later creates a new folder that happens to reuse the old name (or restores it via git), it will appear pre-expanded — an off-by-history bug.
2. **Delete a folder containing the active doc.** `handleDelete` (line 330–374) clears the hash → `activeDocName` becomes null/empty. Reveal doesn't fire (correct), but the deleted folder's path remains in `expandedPaths`. Again, recreating the folder later renders it pre-expanded.

These are small leaks (Set entries are tiny strings), but they break the mental model "expandedPaths reflects the current tree." A skeptical reviewer should expect a comment explaining why this is acceptable, or a cleanup pass.

**Current design:** §9's failure-modes table covers "active doc not in tree yet" but not "stale expansion entries after structural mutations."

**Alternative:** Two viable fixes:
- **A (cheap):** On rename/delete, reconcile `expandedPaths` — drop entries whose paths no longer correspond to a folder in the current tree. Costs one Set walk per mutation.
- **B (cheaper, defers):** Garbage-collect stale entries lazily — on each render, intersect `expandedPaths` with the set of folder paths in the current tree. O(folders) per render, but the tree is already O(n) per render.

**Trade-off:** Either adds ~5 lines. The "do nothing" option is also defensible if documented — but it's currently silent, not documented.

**Status:** CHALLENGED
**Suggested resolution:** Either add a §14 risk row "stale expandedPaths entries persist after structural mutations" with explicit accept-or-mitigate decision, or adopt option B in the implementation sketch in §9 (one-line `Set` intersection in render).

---

## Medium Severity

### [M] Finding 3: D7 (smooth scroll) ignores `prefers-reduced-motion`

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — accessibility) + DC1 (simpler alternative)
**Location:** D7 in §10
**Issue:** D7 LOCKS `behavior: 'smooth'` on subsequent activations. The codebase already honors `prefers-reduced-motion` in three places in `globals.css` (lines 191, 602, 644). D7 contradicts that convention without acknowledging the trade-off. Users with vestibular sensitivity, or anyone who has set the OS-level "reduce motion" preference, will get an animated scroll they explicitly opted out of.

**Current design:** "in-app navigation (graph, wikilink) feels more responsive with smooth motion."

**Alternative:** `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'`. One extra check; preserves D7's intent for the 99% case while honoring the existing repo convention for the affected users. Even simpler: always use `'instant'`. The native CSSOM scroll on `block: 'nearest'` for an off-screen-by-100px row is fast and doesn't need smoothing in a lightweight sidebar context.

**Trade-off:** Smooth-when-allowed costs one matchMedia call. Instant-always costs nothing and matches the existing menu/slash-command components in the repo, which use `scrollIntoView({ block: 'nearest' })` without `behavior: 'smooth'` (see `WikiLinkSuggestionMenu.tsx:51`, `SlashCommandMenu.tsx:35`).

**Status:** CHALLENGED
**Suggested resolution:** Either add a `prefers-reduced-motion` guard to D7 (most aligned with repo convention), or simplify to `'instant'` always (most aligned with sibling components). LOCKED status should be revisited.

---

### [M] Finding 4: D6 ("deps `[activeDocName]` only") is correct for polls but the rationale doesn't cover all `documents` mutation sources

**Category:** DESIGN
**Source:** DC1 (simpler alternative not considered) + DC2 (failure-mode gap)
**Location:** D6 in §10, evidence/sidebar-collapse-state.md "Why effect deps must be `[activeDocName]` only"
**Issue:** D6's rationale focuses on the **5s poll**: re-firing on every poll would overwrite manual collapses. True. But `documents` also mutates from:

- **Rename** (`setDocuments` at line 314) — synchronous local update after server response.
- **Delete** (`setDocuments` at line 358) — synchronous local update.
- **External `emitDocumentsChanged()` consumers** (line 315, 359) — listeners may also mutate state.

These are user-initiated, not background polls. With deps `[activeDocName]`, none of these re-fire reveal. That's *correct* for delete (active doc cleared, nothing to reveal) but creates a gap for rename: if the rename moves the active doc to a new folder (`old/foo.md` → `new/foo.md`), `handleRename` writes a new hash → `activeDocName` changes → reveal fires for the new path. **However**, if the rename keeps the same `activeDocName` and only reorganizes ancestors (e.g., parent folder rename moving the active doc transitively), the new ancestor paths may not be in `expandedPaths`. This is an edge case but worth a sentence in D6.

The simpler-alternative angle: `useEffect(() => { ... }, [activeDocName])` plus a separate effect that runs on `documents` changes only when `activeDocName` is non-null and its ancestors have changed. Two effects, narrow guards. Or: keep D6 as-is and just note the rename edge case in §14 risks.

**Current design:** D6 LOCKED with rationale referencing only the 5s poll regression test.

**Alternative:** Either widen D6's rationale to enumerate all `documents`-mutation sources, or add a §14 risk row "transitive rename of an ancestor folder may leave new ancestors unexpanded until next activation."

**Trade-off:** Documentation, not code. The fix (re-fire reveal on rename mutations that affect the active doc's ancestor chain) would re-introduce the regression D6 was designed to prevent unless guarded carefully.

**Status:** CHALLENGED
**Suggested resolution:** Update D6 rationale to acknowledge all `documents`-mutation sources, and add a small risk row covering the transitive-ancestor-rename case. Likely accept the gap for v1.

---

### [M] Finding 5: D1 ("always reveal") creates a fight-the-user loop in one specific pattern not enumerated

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — power user)
**Location:** D1 in §10, §5 P2 user journey
**Issue:** The spec's worked example for D1's "manual collapse is overridden" semantics is one-shot: user collapses folder, then opens a doc inside, ancestors re-expand. Fair. But consider the **rapid back-and-forth pattern**:

User opens `a/b/foo.md` from graph → ancestors `a`, `a/b` expand. User collapses `a/b` (wants to keep navigating in graph without the sidebar noise). User clicks another node `a/b/bar.md` in graph → reveal fires → `a/b` re-expands. User collapses again. Click `a/b/baz.md` → re-expands. The user is fighting the sidebar.

D1 documents this as "manual collapses are ephemeral relative to activations" and A3 admits "MEDIUM confidence" with a 2-week dogfooding expiry. But the spec's escape hatch (1B/1C) is binary — switch to per-session memory. A middle ground: **only re-expand if the active doc actually changed**. If the user collapses `a/b` while `foo.md` is still active, and they then click `bar.md` (different doc, same folder), reveal fires — that's the unavoidable case. But repeatedly collapsing in graph mode could feel like fighting if the user is doing graph-driven exploration with sidebar visible-but-quieted.

**Current design:** Always-reveal on every activation, regardless of the user's recent collapse intent.

**Alternative:** D1 stands; add §14 risk monitoring this specific pattern in dogfooding. OR pre-mitigation: track a "user just collapsed this ancestor in the last 2 seconds" debounce — if user collapses `a/b` and then immediately activates a doc inside `a/b`, suppress the reveal. Likely overengineered for v1; surface it as a known watch-item.

**Trade-off:** D1's intent ("hiding the active file is incoherent") is right for the 95% case. The 5% case is users who *want* sidebar noise quieted while doing intensive graph navigation. They have an alternative: D8 (collapse the sidebar entirely). Maybe that's the intended workaround.

**Status:** CHALLENGED
**Suggested resolution:** Add a sentence in §5 P2 journey or §14 risks acknowledging the rapid back-and-forth pattern. Direct power users to D8 (sidebar collapse) as the escape valve. No code change required.

---

## Low Severity

### [L] Finding 6: D8 (don't auto-open collapsed sidebar) is right but the spec doesn't say what *signals* the user that an active doc was revealed off-screen

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — UX coherence)
**Location:** D8 in §10
**Issue:** If the user has the sidebar collapsed (D8) or scrolled to a different region, the only post-activation cue is editor-area changes. There is no badge/highlight/breadcrumb indicating "your active file is in `a/b/`". The spec accepts this implicitly. A skeptical UX reviewer might ask: is there a 1-line breadcrumb anywhere in the editor area that names the path? If yes, this is fine. If no, the "spatial context" goal (G1) is still partially unmet for sidebar-collapsed users.

**Current design:** D8 LOCKED, no compensating affordance discussed.

**Alternative:** Out of scope for this spec — would require a breadcrumb/path-display surface in the editor header. But worth a Future Work note.

**Trade-off:** None for v1. Note for the future.

**Status:** CHALLENGED
**Suggested resolution:** Add a Future Work "Identified" entry: "Sidebar-collapsed orientation cue (breadcrumb in editor header)."

---

### [L] Finding 7: `useLayoutEffect` for scroll may run before children render after a parent expands

**Category:** DESIGN
**Source:** DC1 (simpler alternative — verify the implementation sketch is sound)
**Location:** evidence/sidebar-collapse-state.md implementation sketch lines 98–100
**Issue:** The sketch uses `useLayoutEffect(() => activeRowRef.current?.scrollIntoView(...), [activeDocName])`. This runs synchronously after DOM mutations from the same render. Scenario: `activeDocName` changes → the *first* render computes new `expandedPaths` (via the prior `useEffect`, which fires *after* the layout effect on the same render? — no: `useEffect` is post-paint, `useLayoutEffect` is post-DOM-pre-paint). Since `setExpandedPaths` happens in a regular `useEffect`, the new `expandedPaths` won't be reflected in the DOM until the *next* render. So `useLayoutEffect` keyed on `[activeDocName]` may scroll before the just-expanded child rows exist in the DOM, leaving `activeRowRef.current` null.

The spec's §9 risks table acknowledges this with "Use `useLayoutEffect` or rAF wait." But the sketch in evidence uses *only* `useLayoutEffect`. The two should agree — and the safer choice is rAF (or a second-render trigger keyed on `[activeDocName, expandedPaths]`).

**Current design:** Implementation sketch shows `useLayoutEffect` alone; risk row hedges with "or rAF."

**Alternative:** Either:
- Use `useEffect` keyed on `[activeDocName, expandedPaths]` — runs after the *next* render, by which time children are mounted.
- Use `useLayoutEffect` with rAF: `useLayoutEffect(() => { requestAnimationFrame(() => activeRowRef.current?.scrollIntoView(...)); }, [activeDocName])`.
- Move the union of ancestors into the *same* render that triggers the scroll (compute via `useMemo`, not `useEffect`+`setState`). This is the cleanest: derive `expandedPaths` reactively from `activeDocName` + a separate `userToggleSet`, no `setState` for the activation path. Then the scroll layout effect runs after children are already in the DOM.

The third option ("derive, don't store") is genuinely simpler and aligns with the React Compiler convention noted in CLAUDE.md (avoid unnecessary memoization). It would also dissolve the stale-entries concern in Finding 2.

**Trade-off:** The "derive, don't store" model means user manual toggles store only a `userCollapsedSet` (intent: "user wants this collapsed even though it's an ancestor of active"), and the rendered `expandedPaths = ancestorsOf(activeDocName) ∪ userExpandedSet \ userCollapsedSet`. Slightly more conceptual machinery but eliminates two classes of bugs.

**Status:** CHALLENGED
**Suggested resolution:** Reconcile the §9 risk row with the evidence implementation sketch. Consider adopting the "derive, don't store" pattern — it's a simpler alternative the spec didn't enumerate (D4 explicitly defers state shape to implementer, so this is in scope of the implementer's latitude, but it's worth surfacing as a pattern preference).

---

## Confirmed Design Choices (summary)

Decisions that held up under challenge:

- **D1 always-reveal:** Right call for the primary persona. The "fight-the-user" edge case (Finding 5) is real but minor; D8 is the escape valve.
- **D2 `scrollIntoView({ block: 'nearest' })`:** Correct choice — native, no-op when in view, used elsewhere in the codebase.
- **D3 canonical-only reveal:** Correctly scoped; alias-aware reveal is well-documented in Future Work.
- **D4 lift state up:** Sound architectural choice. The "derive, don't store" refinement (Finding 7) is a refinement, not a rebuttal; D4's rejection of per-node `useEffect` (Option B) holds up — the unmount-on-collapse problem in evidence is real.
- **D5 entry-point agnostic via `activeDocName`:** Strongly supported by the navigation-flow evidence; rejection of per-entry-point patches is sound.
- **D6 deps `[activeDocName]`:** Correct; rationale could be widened (Finding 4) but the choice is right.
- **D8 don't auto-open sidebar:** Right; respects user intent. Compensating affordance question (Finding 6) is Future Work, not a rebuttal.

Decision Log lens coverage: DC1 (simpler alternatives) probed D4, D6, D7, sketch in evidence — surfaced a "derive don't store" alternative and a `behavior: 'instant'` alternative. DC2 (stakeholder gaps) surfaced accessibility, stale state, power-user fight-loop. DC3 (framing validity) — the SCR holds; the Complication is grounded in a real, traced code defect (mount-only `useState` initializer at FileSidebar.tsx:79–82, verified). No framing challenge.
