---
title: Spec changelog — sidebar push, no blur
---

# Changelog

Append-only process history for the sidebar-push-no-blur spec.

## 2026-04-23 — Session 1: Intake + Scaffold

- Captured user seed: at viewport widths < 1280px, the FileSidebar opens as a Radix `Sheet` modal with `backdrop-blur-xs` overlay. User wants the sidebar to push the main panel aside (slide action), no blur, document remains readable. Desktop behavior (≥1280px) is explicitly out of scope per user wording "for the sidebar small width specifically."
- Worktree: `.claude/worktrees/sidebar-push-no-blur` on branch `worktree-sidebar-push-no-blur`. Baseline commit `1a03f2cb`.
- Confirmed Open Knowledge MCP not registered in this session; using native Write for spec scaffold per CLAUDE.md escape hatch.
- Investigated current implementation:
  - Breakpoint at 1280px (`packages/app/src/hooks/use-mobile.ts:4`)
  - Two rendering paths in `Sidebar` (`packages/app/src/components/ui/sidebar.tsx:172-241`)
  - Blur originates in `SheetOverlay` (`packages/app/src/components/ui/sheet.tsx:33`): `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`
  - Two state vars: `open` (cookie-persisted) and `openMobile` (in-memory). `toggleSidebar()` dispatches by `isMobile`.
  - Blast radius: `useIsMobile` only consumed by `sidebar.tsx`. No tests pin the small-width Sheet behavior for FileSidebar.
- Persisted to `evidence/sidebar-mechanism.md`.
- User answered first decision batch:
  - Push semantics: **translate right** (document keeps width, slides right; right edge cropped). NOT re-flow.
  - Dismiss: **ESC** + **click outside** (in document area). Trigger button still works.
  - Floor for very narrow viewports: user response indicates "no floor — click in document closes the sidebar." Interpretation: a single push-mode rendering path applies at all sub-1280 widths; click-to-dismiss makes the cramped reading area at <480px tolerable because the user can quickly dismiss the sidebar after picking a file.
- Next: present initial SPEC.md draft + remaining open questions to user.

## 2026-04-23 — Session 1, Round 2: Decision batch resolved

User answered three load-bearing decisions:

- **D7 (file-click behavior at small width):** Stay open + one-shot pulse-hint on the visible document area. Pulse must NOT use blur or dim; ≤ 800ms; honors `prefers-reduced-motion`. Visual treatment of the pulse delegated to implementer + designer (Q9).
- **D2 (state model):** Keep `open` and `openMobile` separate; add resize-sync.
- **D9 (resize across 1280px boundary):** UP (mobile → desktop) adopts cookie-persisted `open` value. DOWN (desktop → mobile) forces `openMobile = false`.

Cascade applied:
- Promoted D7, D8, D9, D10, D11, D12 from open questions to LOCKED/DIRECTED decisions.
- Q1, Q2, Q3, Q4, Q5, Q7, Q8 marked Resolved.
- Q6 (tooltip/popover anchoring under translate) deferred to manual implementation testing — captured in Assumption A2 with explicit test plan.
- Q9 added (DELEGATED): pulse-hint visual treatment.
- Functional Requirements §6 extended with Must-rules for resize-sync, pulse-hint, no-auto-focus, click-to-dismiss-target-check, and `prefers-reduced-motion`.
- System Design §9 extended: `useEffect` for resize-sync, file-selection callback wiring options for the pulse-hint.
- Failure modes table updated: state desync row resolved by D9; new row for "file selection without dismissal" mitigated by pulse-hint.
- Assumptions A2/A3 sharpened with explicit manual-test plans.

Outstanding items:
- Q6: tooltip/popover anchoring under translate — requires implementation prototype.
- Q9: pulse-hint visual specifics — DELEGATED to implementer/designer at PR time.

Ready to move into Audit (Step 6) once the user signs off on the current state.

## 2026-04-23 — Session 1, Round 3: Audit + assessment

Spawned two parallel subagents per /spec workflow Step 6:
- **Auditor** (loaded /audit + /spec): wrote `meta/audit-findings.md` — 13 findings (5H, 5M, 3L).
- **Challenger** (loaded /spec + design-challenge-protocol): wrote `meta/design-challenge.md` — 8 findings (3H, 4M, 1L).

### Auto-fixes applied (per /assess-findings — pure corrections + low-judgment coherence)

- **A1 (Sheet consumers wrong):** Updated NG2, §8 "Key constraints", §16 EXCLUDE, and `evidence/sidebar-mechanism.md` with verified Sheet consumers (`ConflictResolver`, `EditorArea` DocPanel). `AuthModal` and `CommandPalette` use Radix `Dialog`, not Sheet. Confirmed via `grep -n 'import' packages/app/src/components/{AuthModal,CommandPalette}.tsx` + `grep -rln 'from.*ui/sheet' packages/app/src`.
- **A2 (cookie is dead code):** Updated `evidence/sidebar-mechanism.md` State model + §8 Key constraints + D9 rationale to reflect that the `sidebar_state` cookie is write-only; React state's lifetime is the actual mechanism. D9's functional outcome is unchanged.
- **A3 (FileTree.tsx not in SCOPE):** Added `FileTree.tsx` to §16 SCOPE; rewrote §9 component change 5 to default to wrapping at `FileSidebar.tsx` (option b) with the FileTree path also in scope.
- **A5 (sidebar-gap layout):** Updated D8 + §9 component change 1 to explicitly require the small-width branch to omit (or `w-0`) the flex-occupying `sidebar-gap`, so `SidebarInset` keeps full viewport width before translate.
- **A6 (Radix reduced-motion claim wrong):** D6 rewritten — the new push-mode adds `motion-reduce:` modifiers as NEW behavior. Today's Sheet and inline-mode do NOT honor reduced motion.
- **A7 (§15 contradiction):** §15 Noted item rewritten to match reality (Sheet does NOT honor today; this spec adds it for the new push-mode only).
- **A8 (NFR over-promise):** §6 NFR Reliability softened — focus + scroll position safe by transform semantics; tooltip anchoring verified via inventory.
- **A9 (ESC handler guard):** §9 component change 3 + Failure modes table now specifies an explicit guard: `document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]')` check before calling `setOpenMobile(false)`. Alternative (Radix `DismissableLayer`) noted but not chosen for cost.
- **A10 (inset chrome silently activates at small widths):** §9 component change 2 acknowledges that `md:peer-data-[variant=inset]:m-2 ml-0 rounded-xl shadow-sm` will activate at small widths under the new path (because the peer wrapper is now rendered). Default decision: keep the chrome (visual unification with desktop); implementer may suppress with a wider breakpoint if review surfaces a concern.
- **A11 (D12 framing):** D12 rationale rewritten to call the SidebarTrigger exclusion "defensive" — closure-bound state already prevents the immediate-close on open path; the guard hedges against future implementer choices.
- **A12 (D8 stacking context):** D8 rationale rewritten with explicit reasoning: shared DOM ancestry, CSS-variable scope, no canonical portal anchor. Cites the inventory file for the stacking-context analysis.
- **A13 (A1 already verified):** A1 promoted to Verified status with the corrected consumer list. A5 also marked Verified.
- **C8 (A2 lumped categories):** A2 split into A2a (body-portalled HIGH-confidence safe), A2b (mid-animation freshness MEDIUM, mitigated), A2c (inset-descendant fixed HIGH-confidence coherent).

### Investigation: portal/non-portal inventory (resolves A4 + C3)

Both findings demanded a pre-implementation inventory of editor surfaces. Captured in new evidence file: [`evidence/editor-portalled-surfaces-inventory.md`](../evidence/editor-portalled-surfaces-inventory.md). Summary:

- All editor `position: fixed` descendants are either body-portalled (escape transform, first-render correct) or inset-descendant (translate with inset, coherent UX).
- `floating-ui`'s `autoUpdate` does not watch transform changes — addressed by §9 component change 7: close open popups on sidebar toggle.
- `ConnectingBanner` is mounted at App root, NOT inside SidebarProvider — viewport-relative, unaffected.
- `GraphPanel` expanded view (`fixed inset-0`) is inset-descendant — slides with the document at small widths, coherent.
- D8 (inline rendering) holds with the structural deviation captured in A5.

Q6 promoted from Open to **Resolved** with HIGH confidence.

### Findings escalated to user judgment (pending — items to surface in §4 of next response)

- **A2-bonus (cookie):** make the dead `sidebar_state` cookie actually load on mount (small spec-extension), or just correct the rationale and leave the cookie dead?
- **C1 (DocPanel asymmetry):** at 960-1280px, sidebar gets push-no-blur on left + DocPanel keeps Sheet+blur on right — visible inconsistency on the same screen. Expand scope, defer with Future Work, or accept?
- **C2 (click-to-dismiss vs SidebarRail edge affordance):** Persona 1 wants to read while sidebar open; D12 dismisses on any click in inset. Challenger surfaces the existing-but-unused `SidebarRail` component as a discoverable edge-strip alternative.
- **C4 (1280px breakpoint):** inherited from re-flow rationale; with translate, may be re-examinable. Lower to 960 (align with DocPanel) or tier (e.g., push 480-1280, Sheet below)?
- **C5 (pulse-hint conditional on C2):** if C2 changes to an edge affordance, pulse-hint may be redundant.
- **C6 (resize-sync DOWN slams sidebar shut):** unplug-external-display from 1440 → 1200 closes a sidebar the user was using. Re-confirm asymmetric DOWN rule, or carry-over open state?
- **C7 (state bug — tooltip text inverted at small width):** trivial 5-line fix already added to §9 component change 3 + §16 SCOPE. Surfacing for sign-off (it does mutate `state` semantics, even if minor).

DELEGATED items unchanged: Q9 (pulse-hint visual specifics).

## 2026-04-23 — Session 1, Round 4: User judgment on design challenges + finalization

User answered the four cross-cutting design-challenge items:

- **C1 (DocPanel asymmetry):** **Don't change DocPanel.** User rationale: "I don't need to see the file contents in the same way when I use this view." Captured as **NG7 [NEVER]** in §3 with explicit asymmetric framing — DocPanel serves a different task (cross-referencing related artifacts, not navigating based on document content), so the "blur is wrong for navigation" framing applies asymmetrically.
- **C2 (click-to-dismiss vs SidebarRail edge affordance):** **Keep D12 (current spec).** Pulse-hint stays. D12 promoted from "DIRECTED (pending re-confirmation)" to plain "DIRECTED."
- **C4 (1280px breakpoint):** **Keep 1280px unchanged.** A4 promoted back to HIGH confidence (Verified).
- **C6 (resize-sync DOWN):** **Carry open-state across the boundary.** D9 revised — DOWN now `setOpenMobile(open)` instead of `setOpenMobile(false)`. This encodes "desktop-canonical, small-width is a transient view" model. Documented trade-off: actions taken at small width (e.g., user closes via click-on-doc) are NOT propagated back to `open`; on resize-UP the sidebar reopens at desktop's `open`.

Cascaded changes:
- §3 Non-goals: NG7 added.
- §6 Must-rule for resize-sync: rewritten to reflect carry-across DOWN.
- §9 component change 3: useEffect on `isMobile` change to `true` now calls `setOpenMobile(open)`.
- Failure modes table: state-desync row updated; cookie-collision row replaced with "no-action-this-spec" row.
- §11 Q4: resolution row reflects new D9.
- D2 rationale: corrected the dead-cookie reference.
- Multiple straggling references to "cookie-persisted" / "DOWN forces openMobile=false" / "DIRECTED (pending re-confirmation)" cleaned up.

### Verification (Step 8)

**Mechanical adversarial checks:**
- ASSUMED decisions still load-bearing: **none.** All 12 decisions LOCKED/DIRECTED/DELEGATED.
- LOW/MEDIUM confidence assumptions underpinning 1-way doors: **none.** D5 (desktop unchanged) and NG7 (DocPanel) are both 1-way doors with HIGH confidence (user direction). A2b/A2c MEDIUM are NOT 1-way doors (reversible post-merge).
- Non-goal temporal tags accuracy: NG1/NG2 [NEVER] correct (require new spec to revisit), NG3/NG4/NG5 [NOT NOW] correct (could promote later), NG6 [NOT UNLESS] correct (only if regressions appear), NG7 [NEVER] correct (durable product reasoning).

**Resolution-completeness gate** for the single In Scope item (push-no-blur for FileSidebar small-width):
- All decisions made (D1-D12 — no INVESTIGATING/ASSUMED).
- No new 3rd-party dependencies needed.
- Architectural viability validated (portal/non-portal inventory + sidebar-gap layout deviation captured).
- Integration feasibility confirmed (FileTree↔FileSidebar↔SidebarProvider↔SidebarInset wiring specified).
- Acceptance criteria verifiable (each FR has a manual test or visual check).
- No dependency on Out of Scope items (DocPanel is OOS but does not block).

**Pass.**

### Future Work classification

- **Explored:** Unify `open` and `openMobile` state.
- **Identified:** Persisting small-width sidebar state; auto-focus / focus-trap behavior; activate the `sidebar_state` cookie's read path to make persistence real.
- **Noted:** A11y review of the new push-mode landmark roles; reduced-motion compliance for existing inline-mode and remaining Sheet consumers (this spec only adds it for the new push-mode).

### Agent Constraints (§16)

Reviewed and updated to include FileTree.tsx + EditorArea/ConflictResolver in EXCLUDE alongside Sheet primitive itself. SCOPE bounds the change to `sidebar.tsx` + `use-mobile.ts` + `FileSidebar.tsx` + `FileTree.tsx` + `EditorHeader.tsx` (review-only) + `EditorPane.tsx` (review-only) + new e2e file.

Spec status: **Approved (ready for implementation)**. Baseline commit `1a03f2cb` re-stamped as the verified baseline.



