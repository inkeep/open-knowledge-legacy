---
title: Audit findings — sidebar-push-no-blur SPEC
audited: 2026-04-23
auditor: shared:audit
artifact: specs/2026-04-23-sidebar-push-no-blur/SPEC.md
baseline_commit: 1a03f2cb
---

# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/sidebar-push-no-blur/specs/2026-04-23-sidebar-push-no-blur/SPEC.md`
**Audit date:** 2026-04-23
**Total findings:** 13 (5 high, 5 medium, 3 low)

---

## High Severity

### [H] Finding 1: AuthModal and CommandPalette do not use Sheet — claim is factually wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §3 NG2; SPEC.md §8 "Key constraints discovered"; evidence/sidebar-mechanism.md "Blast radius"; SPEC.md §16 EXCLUDE
**Issue:** Multiple sections claim that `Sheet` is used by `AuthModal`, `CommandPalette`, and other dialogs. This is false.
**Current text (SPEC.md §3 NG2):** "`Sheet` is used by `AuthModal`, `CommandPalette`, and other dialogs that are genuinely modal."
**Current text (SPEC.md §8):** "`Sheet` is also used by `AuthModal`, `CommandPalette`, and other dialogs."
**Current text (SPEC.md §16 EXCLUDE):** "`packages/app/src/components/AuthModal.tsx`, `CommandPalette.tsx`, etc. (Sheet-using consumers)"
**Evidence:**
- `packages/app/src/components/AuthModal.tsx:20` imports `Dialog, DialogContent, DialogHeader, DialogTitle` from `./ui/dialog` — NOT Sheet.
- `packages/app/src/components/CommandPalette.tsx:23` imports `CommandDialog` — NOT Sheet.
- Actual Sheet consumers (verified via `grep -rln "from.*ui/sheet" packages/app/src`):
  - `packages/app/src/components/ConflictResolver.tsx` (line 18)
  - `packages/app/src/components/EditorArea.tsx` (line 12, used for DocPanel sheet mode at sub-960px)
  - `packages/app/src/components/ui/sidebar.tsx` (the file being modified)
**Status:** CONTRADICTED
**Suggested resolution:** Update NG2, §8, §16 EXCLUDE to list the real Sheet consumers (`ConflictResolver`, `EditorArea`'s DocPanel). The substance of NG2 (don't modify Sheet because other consumers depend on it) is still valid — only the named consumers are wrong. Note that `EditorArea.tsx` ALSO sheet-renders at sub-960px width via `useDocPanelLayout` — implementer should verify the new push-mode sidebar interacts cleanly with the DocPanel sheet at narrow widths (overlapping breakpoints: <1280 sidebar push + <960 DocPanel sheet).

---

### [H] Finding 2: SIDEBAR_COOKIE is dead code (write-only) — D9 rationale and §13 deployment note are wrong

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §10 D9 "Rationale"; SPEC.md §13 "Cookie collision" row; evidence/sidebar-mechanism.md "State model"
**Issue:** The spec and evidence repeatedly claim that `open` is "cookie-persisted" and that resize-UP "adopts cookie-persisted `open` value (existing behavior)." In current code, the cookie is ONLY written by `setOpen` (`packages/app/src/components/ui/sidebar.tsx:80`); it is NEVER read on mount or anywhere else. The React state `_open` is initialized from `defaultOpen` (default `true`), and `defaultOpen` is not passed by `App.tsx:125`. The cookie has no functional effect on state restoration.
**Current text (D9 Rationale):** "User chose 'snap to persisted desktop state.'"
**Current text (D9 Implications):** "On change to `false`: no-op (cookie-driven `open` already correct)."
**Current text (evidence/sidebar-mechanism.md):** "open / setOpen — desktop state (persisted via sidebar_state cookie, 7-day max-age)"
**Current text (§13 deployment table):** "If `openMobile` is unified with `open`, the cookie now persists state from small-width sessions. May surprise existing users on first wide-screen visit."
**Evidence:**
- `packages/app/src/components/ui/sidebar.tsx:64-81` — only writes `document.cookie`, never reads it.
- `grep -rn "sidebar_state\|SIDEBAR_COOKIE" packages/app/src` returns only the constant definitions and the write site; no read site.
- `defaultOpen` is referenced only at the parameter default and `useState(defaultOpen)` initialization; `App.tsx:125` does not pass it.
**Status:** CONTRADICTED
**Why it matters:** D9's functional outcome (snap to current `open` React state on resize-UP) still works because the React state persists across resizes (the component doesn't unmount). But the rationale is built on a false premise. An implementer reading the spec might assume the cookie is load-bearing and refactor it incorrectly. The §13 "Cookie collision" risk does not exist as described.
**Suggested resolution:** Either (a) correct the rationale to note that `open` is React state (not cookie-restored) and the cookie is currently dead code, OR (b) flag a sub-task to make the cookie actually load on mount (which would change behavior — potentially in scope as part of this spec, since D9 leans on persistence semantics). Update evidence/sidebar-mechanism.md "State model" to match reality. Strike or rewrite the §13 "Cookie collision" row.

---

### [H] Finding 3: §9 mutates FileTree.tsx but FileTree.tsx is not in §16 SCOPE

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md §9 step 5; SPEC.md §16 SCOPE
**Issue:** §9 step 5 instructs the implementer to modify `FileTree.tsx` ("When `isMobile && openMobile` and a file is selected, dispatch the pulse-hint event/class to `SidebarInset`"). `FileTree.tsx` is not listed in §16 SCOPE. The Agent Constraints section is meant to bound implementer touch — a P0 functional requirement (FR for D7 pulse-hint) cannot be satisfied without writing to a file outside SCOPE.
**Current text (§9 step 5):** "FileTree / file-selection callback (in `FileTree.tsx`): When `isMobile && openMobile` and a file is selected, dispatch the pulse-hint event/class to `SidebarInset`."
**Current text (§16 SCOPE):** Lists `sidebar.tsx`, `use-mobile.ts`, `FileSidebar.tsx`, `EditorHeader.tsx`, `EditorPane.tsx` — does not list `FileTree.tsx`.
**Evidence:**
- `packages/app/src/components/FileTree.tsx:105-107` defines `navigateTo(targetPath)` which sets `window.location.hash`. This is the actual file-selection handler. Hooking the pulse-hint requires either editing this function (in `FileTree.tsx`) or wrapping `onNavigate` at the `FileSidebar` level, which would still require a prop addition to `FileTree` (also in `FileTree.tsx`).
- §9 step 5 also offers option (b): "wrap the file-selection handler at the `FileSidebar` level." `FileSidebar.tsx` is in SCOPE but is qualified "(review for compat — likely no change needed)" — the qualifier is wrong if the implementer chooses this option.
**Status:** INCOHERENT
**Suggested resolution:** Add `FileTree.tsx` to SCOPE, OR commit to wrapping at `FileSidebar.tsx` and remove the "(likely no change needed)" qualifier from `FileSidebar.tsx`'s SCOPE entry. Either way, §16 must be consistent with §9.

---

### [H] Finding 4: Q6 (tooltip/popover anchoring) is P0 + Blocking but unresolved — fails Step 8 resolution gate

**Category:** COHERENCE
**Source:** L6 (stance consistency); cross-checked with /spec workflow Step 8
**Location:** SPEC.md §11 Q6; SPEC.md §13 In Scope; SPEC.md §16 STOP_IF
**Issue:** Q6 is tagged `P0`, `Blocking? Yes`, `Status: Open (deferred to implementation)`. The /spec workflow's Step 8 resolution-completeness gate requires every In Scope item to have all decisions affecting it resolved (not deferred, not assumed). Q6 affects FR-Must about no-regressions to popover anchoring (implicit in "no regressions to editor focus, tooltip/popover anchoring, or scroll position" in §6 NFR Reliability) and is captured in A2 with status Active. Deferring a P0 blocker to "manual test post-implementation" violates the gate.
**Current text (Q6 row):** "Manual test post-implementation. Could affect link tooltips, autocomplete dropdowns, mention popovers, and the floating menu. Captured as Assumption A2."
**Current text (§16 STOP_IF):** "Tooltip/popover anchoring in the editor breaks under translate. Pause and design an alternative containing-block strategy."
**Evidence:**
- `packages/app/src/editor/extensions/suggestion-floating-ui.ts:111` uses `autoUpdate(virtualEl, popup, doPosition)` from floating-ui. Floating-UI's `autoUpdate` watches scroll-ancestors and resize by default; it does NOT watch CSS transform changes unless `animationFrame: true` is passed (which is costly and not currently used). When SidebarInset is translated, an open suggestion popup will not auto-update its position.
- `packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx:75` uses `appendTo: () => document.body` — these popups are portalled and would need their virtual reference to update via `getBoundingClientRect`. Since BCR returns post-transform coordinates, this should self-correct on the next `autoUpdate` tick (resize/scroll). But for `position: fixed` BubbleMenus that are NOT portalled (e.g. `TableControlsMenu.tsx` does not pass `appendTo`), the menu is inside the transformed SidebarInset and inherits the transform via the new containing block (per CSS spec) — should be visually correct.
**Status:** INCOHERENT (process gate violation)
**Suggested resolution:** Either (a) resolve Q6 in spec with a confirmed mitigation (e.g., apply transform on a non-editor-ancestor wrapper element to avoid creating a new containing block for editor descendants; OR add a small Floating UI prototype during the spec to confirm autoUpdate behavior), (b) downgrade the spec's claim to "expected to work; verify in implementation" and accept the risk in writing, OR (c) move the no-popover-regression requirement to "Should" / Future Work. The current state — P0 + Blocking + Open + Active assumption — is not implementable.

---

### [H] Finding 5: §9 "extend the inline JSX" misrepresents the layout mechanics required for translate-without-reflow

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity); L1
**Location:** SPEC.md §9 component change 1; SPEC.md §10 D8
**Issue:** §9 instructs the implementer to extend the existing inline rendering JSX. D8 says "Same flex layout container as desktop." Both elide a load-bearing detail: the existing inline rendering uses BOTH a `peer` flex item (`sidebar-gap`, `w-(--sidebar-width)`) that takes width in flex layout AND a `position: fixed` container at left=0. SidebarInset is a flex sibling that takes the remaining width via `flex-1` (i.e., reflow). For "translate, not re-flow" (D3 LOCKED) to work, the small-width path must NOT include the `sidebar-gap` (or the gap must be `w-0`); otherwise SidebarInset shrinks (re-flow) and translating it by `--sidebar-width` would push it past the right edge of the (already-reduced) main panel area. The spec does not call this out.
**Current text (§9 component 1):** "the existing inline-mode JSX is the closest analog; add a small-width-specific variation that uses `transform: translateX(0|−100%)` for the slide and reads `openMobile` instead of `open`."
**Current text (D8):** "At small widths, the sidebar is rendered inline (not portalled). Same flex layout container as desktop."
**Evidence:**
- `packages/app/src/components/ui/sidebar.tsx:208-217` — `sidebar-gap` div with `w-(--sidebar-width)` (collapses to `w-0` only via `group-data-[collapsible=offcanvas]`, which depends on `data-state="collapsed"`).
- `packages/app/src/components/ui/sidebar.tsx:296` — `SidebarInset` is `flex w-full flex-1` (takes available flex space, shrinks with the gap).
- For push-mode at small width to keep SidebarInset's intrinsic width (full viewport), the sidebar's flex-occupying gap must NOT take width. This is a different layout primitive than the existing inline branch (or requires the gap to always be `w-0` at small width regardless of `data-state`).
**Status:** INCOHERENT
**Suggested resolution:** Make D8/§9 explicit: at small widths, the sidebar is rendered inline as a `position: fixed` element WITHOUT a flex-occupying gap (or with the gap forced to `w-0`). SidebarInset retains full viewport width and is translated. This is a deviation from the desktop pattern, not "the same flex layout container as desktop." This affects D8's rationale ("Inline keeps the sidebar inside the layout coordinate space, simplifying the transform-based push") because the simplification is partial — the inline coordinate space still requires structural deviation.

---

## Medium Severity

### [M] Finding 6: D6's "matches Radix Dialog default" claim about prefers-reduced-motion is incorrect

**Category:** FACTUAL
**Source:** T1 + T3 (Radix docs)
**Location:** SPEC.md §10 D6 "Rationale"
**Issue:** D6 claims "Honor `prefers-reduced-motion` by collapsing the animation to instantaneous (matches Radix Dialog default)." Radix Dialog (used internally by Sheet) does NOT auto-honor `prefers-reduced-motion`. Animations on Radix Dialog are CSS-driven by the consumer (in this codebase, via tailwindcss-animate's `data-open:animate-in`/`data-closed:animate-out`). Tailwind's animate-in/out also do not auto-honor `prefers-reduced-motion`. Today's Sheet does not honor it either, contrary to D6's implication.
**Current text:** "Honor `prefers-reduced-motion` by collapsing the animation to instantaneous (matches Radix Dialog default)."
**Evidence:**
- `packages/app/src/components/ui/sheet.tsx:33,58` — uses `data-open:animate-in data-open:fade-in-0` etc., no `motion-reduce:` modifier.
- `packages/app/src/components/ui/sidebar.tsx` — `transition-[left,right,width] duration-200 ease-linear` at line 211, 223, no reduced-motion gate.
- `grep -rn "prefers-reduced-motion\|motion-safe\|motion-reduce" packages/app/src/components/ui/sidebar.tsx packages/app/src/components/ui/sheet.tsx` returns no matches.
**Status:** CONTRADICTED
**Suggested resolution:** Strike "(matches Radix Dialog default)" and reframe as: "Honor `prefers-reduced-motion` by adding `motion-reduce:transition-none` (or equivalent) to the transform/transition rules. This is a NEW behavior — today's Sheet and inline-mode sidebar do not honor it." This also has implications for §15 "Noted" which already correctly identifies this as a gap; the contradiction is between D6 and §15.

---

### [M] Finding 7: §15 "Noted" contradicts D6 on current reduced-motion behavior

**Category:** COHERENCE
**Source:** L1
**Location:** SPEC.md §10 D6 vs SPEC.md §15 "Noted" / "Reduced-motion preference"
**Issue:** §15 Noted item says "Today's Sheet honors this via Radix; the inline mode does not." This contradicts the actual code (sheet.tsx and sidebar.tsx both fail to honor reduced motion — see Finding 6) AND contradicts D6's claim that the new push mode "matches Radix Dialog default."
**Current text (§15):** "Reduced-motion preference. Users with `prefers-reduced-motion` should get instantaneous open/close (no slide animation). Today's Sheet honors this via Radix; the inline mode does not (transition is unconditional). Worth a follow-up."
**Status:** INCOHERENT
**Suggested resolution:** Reconcile §15 Noted with reality (Sheet does NOT honor today). Either commit to honoring it in this spec (consistent with FR Should and D6) or move it to Future Work without the false claim. The current Noted item also says "worth a follow-up" — but FR Should requires it as part of this spec. Pick one position.

---

### [M] Finding 8: §6 NFR Reliability over-promises "no regressions to scroll position"

**Category:** COHERENCE / FACTUAL
**Source:** L3 (missing conditionality)
**Location:** SPEC.md §6 NFR Reliability
**Issue:** "No regressions to editor focus, tooltip/popover anchoring, or scroll position. The transform is applied to a wrapper; ProseMirror's editor view should not detect a layout change." This is a strong unconditional claim. Tooltip/popover anchoring is explicitly listed as Q6 (open + blocking) and A2 (Medium confidence). The same passage cannot promise no regressions while flagging the same item as an open question.
**Current text:** "No regressions to editor focus, tooltip/popover anchoring, or scroll position."
**Status:** INCOHERENT (with §11 Q6 and §12 A2)
**Suggested resolution:** Soften the language to match Q6/A2 confidence, e.g., "Editor focus and scroll position should be unaffected (transform does not trigger layout). Tooltip/popover anchoring may regress; verified in Q6/A2."

---

### [M] Finding 9: ESC handler "Radix Dialog priority" claim is unsubstantiated mitigation

**Category:** FACTUAL / COHERENCE
**Source:** L3 + T3 (Radix internals)
**Location:** SPEC.md §9 Failure modes, "ESC swallows other components' ESC handling" row
**Issue:** The mitigation is "Use Radix Dialog priority order — modals capture ESC first. Sidebar's ESC handler runs only if no modal is currently focused. Verify with manual test." There is no documented Radix mechanism for "the sidebar's window-level keydown listener defers to Radix Dialog's." Radix Dialog uses dismissable-layer stacking internally for its OWN dialogs, but a window-level keydown listener added in `SidebarProvider` will fire BEFORE any Radix-managed `onEscapeKeyDown` if the Radix mechanism is event-based (and after, if it's focus-based) — implementation order matters. The spec proposes the window-level listener at §9 component change 3 without addressing the contention.
**Current text (failure modes):** "Use Radix Dialog priority order — modals capture ESC first. Sidebar's ESC handler runs only if no modal is currently focused."
**Current text (§9 component 3):** "Add an `ESC` window keydown listener gated on `isMobile && openMobile` that calls `setOpenMobile(false)`."
**Evidence:**
- Radix `Dialog.Content` uses `DismissableLayer` internally (https://github.com/radix-ui/primitives/blob/main/packages/react/dialog). DismissableLayer maintains a layer stack and only the topmost layer responds to `onEscapeKeyDown`. Its handler is attached to `document` via `addEventListener` with the default `capture: false`.
- A `window`-level keydown listener will fire alongside Radix's. There is no built-in priority. The spec's proposal needs an explicit guard (e.g., check `document.querySelector('[role=dialog][data-state=open]')` before closing the sidebar; or delegate to a single shared dismissable-layer registration).
**Status:** UNVERIFIABLE in current form (insufficient detail in spec)
**Suggested resolution:** Either (a) tighten §9 component 3 with the explicit guard mechanism (e.g., ignore ESC if any open Radix dialog is detected), (b) wrap the small-width sidebar in Radix's `DismissableLayer` to inherit stack ordering, or (c) accept that ESC may close both layers and document the resulting UX.

---

### [M] Finding 10: SidebarInset's existing inset-variant margin/border-radius is silently activated at small widths

**Category:** FACTUAL
**Source:** T1
**Location:** SPEC.md §9 component change 2; SPEC.md §6 FR (no-regression at desktop)
**Issue:** Today, at width `< 1280px`, the `SidebarInset` does not display its inset-variant styling (`m-2 ml-0 rounded-xl shadow-sm`) because the styling is `peer-data-[variant=inset]` and the mobile branch does NOT render the peer wrapper (it returns just `<Sheet>`). When the new push-mode renders the sidebar inline, the peer wrapper IS rendered, so `peer-data-[variant=inset]:m-2 ml-0 rounded-xl shadow-sm` activates at small widths for the first time. This is a visual change at small widths the spec doesn't acknowledge.
**Evidence:**
- `packages/app/src/components/ui/sidebar.tsx:172-196` (mobile branch) returns only `<Sheet>` — no peer wrapper. So at `< 1280px` today, no peer with `data-variant=inset` exists.
- `packages/app/src/components/ui/sidebar.tsx:198-241` (inline branch) renders the peer wrapper with `data-variant={variant}`.
- `packages/app/src/components/ui/sidebar.tsx:296` `SidebarInset` styling: `md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2`. The `md:` prefix is `≥ 768px`, so all viewports `≥ 768px` pick up the styling once the peer exists.
- `FileSidebar.tsx:39` uses `<Sidebar variant="inset">`.
**Status:** STALE/CONTRADICTED (the spec's "before/after" comparison at small widths is incomplete)
**Suggested resolution:** Acknowledge in §9 that small-width SidebarInset gains inset-variant chrome (8px margins, rounded corners, shadow) when the rendering moves from Sheet (no peer) to inline (peer present). Decide whether to keep this chrome at small widths or suppress it (e.g., gate on `xl:` instead of `md:`, or add a `data-mobile` peer-data attribute). The `ml-0` margin matters for the proposed `transform: translateX(var(--sidebar-width))` — the visual gap between the sidebar's right edge and the inset's translated left edge is currently `ml-0` (no gap), but if the inset gets `m-2` (top/right/bottom 8px), the visual treatment changes vs. desktop's adjacent layout.

---

## Low Severity

### [L] Finding 11: Click-to-dismiss "double-fire" concern is overstated; closure semantics already prevent the bug

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §10 D12 "Implications"; SPEC.md §6 FR9; SPEC.md §9 SidebarInset onClick
**Issue:** D12 and FR9 emphasize that the click-to-dismiss handler must NOT fire when the click target is the SidebarTrigger button, framing it as a correctness requirement to prevent the sidebar from immediately closing after opening. With React's standard closure-bound state, the handler at SidebarInset reads the `openMobile` value from the prior render — when the user clicks the trigger to open, the closure still has `openMobile === false`, so the bubbled handler is a no-op. The "immediate close" bug only manifests if the implementer uses functional updaters or `useRef` to read the latest state. The spec should either explain WHY the check matters (implementation choice) or flag it as belt-and-suspenders.
**Current text (FR9):** "Click trigger to open → click trigger again to close (toggle path); not double-fired by inset's click."
**Status:** INCOHERENT (the stated concern is conditional on implementation choice, not unconditional)
**Suggested resolution:** Reframe D12's target-check as "defensive" (handles the case where the implementer reads latest state via ref or functional updater). Optional: drop the FR if the implementer commits to closure-bound state. This is low-severity because the safety check works either way; only the rationale needs sharpening.

---

### [L] Finding 12: D8's "no stacking-context surprises observed in initial design" is unverified — design hasn't been prototyped

**Category:** COHERENCE / FACTUAL
**Source:** L2 (confidence-prose misalignment)
**Location:** SPEC.md §10 D8 "Rationale"
**Issue:** "No stacking-context surprises observed in initial design" implies a prototype was tested. The session changelog and evidence file show no prototype was built — the spec is a paper design. The transform on SidebarInset DOES create a new stacking context (and a new containing block for fixed-position descendants), which is a known CSS gotcha that has not been observed because nothing has been built.
**Current text:** "No stacking-context surprises observed in initial design."
**Status:** INCOHERENT (overconfident phrasing for a paper design)
**Suggested resolution:** Replace with "Stacking-context implications of the transform have been considered — descendants with `position: fixed` (e.g., editor BubbleMenu) become positioned relative to the transformed inset. This is the desired behavior because they should slide with the inset. Portalled popups (e.g., suggestion-floating-ui, BubbleMenuBar with `appendTo: document.body`) escape the transform and are positioned independently — verified at `packages/app/src/editor/extensions/suggestion-floating-ui.ts:52` and `packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx:75`."

---

### [L] Finding 13: A1 "verify Sheet imports" verification plan duplicates investigation already done

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** SPEC.md §12 A1
**Issue:** A1 says "Verification plan: grep for `Sheet` imports across `packages/app/src/`; verify all other uses are independent. Expiry: Before implementation." This investigation was already performed during the spec session (per evidence and changelog). The result is that `Sheet` is used by `ConflictResolver`, `EditorArea`, and the file being changed (and NOT by AuthModal/CommandPalette as Finding 1 corrects). The Assumption can be promoted to a fact and the verification marked complete.
**Current text:** "Confidence HIGH | Verification plan: grep ... | Expiry: Before implementation | Status: Active"
**Status:** INCOHERENT (active assumption that has already been verified)
**Suggested resolution:** Promote A1 to a verified fact in §8 (current state) and remove from A-table OR mark as "Verified — see Finding 1's corrected list" with status moved off "Active."

---

## Confirmed Claims (summary)

The following load-bearing claims were verified against the codebase and external sources:

**File:line citations in evidence/sidebar-mechanism.md (all confirmed):**
- `App.tsx:125-130` — SidebarProvider/FileSidebar/SidebarInset block matches verbatim.
- `sidebar.tsx:172-241` — covers both rendering branches (mobile branch 172-196, inline branch 198-241).
- `sheet.tsx:33` — `bg-black/10 ... supports-backdrop-filter:backdrop-blur-xs` overlay className.
- `sidebar.tsx:89-102` — keyboard shortcut `useEffect` for `Cmd/Ctrl + \`.
- `sidebar.tsx:223` — inline-mode container with `transition-[left,right,width] duration-200 ease-linear`.
- `EditorHeader.tsx:326` — `<SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />`.
- `use-mobile.ts` — 1280px breakpoint, `<` comparison, matchMedia listener.

**Architectural claims (confirmed):**
- `useIsMobile` is consumed only by `sidebar.tsx` (`use-doc-panel-layout.ts` is a separate hook with its own breakpoint constants — initial grep was a false positive on substring `use-mobile`).
- Two state variables `open` and `openMobile`; `toggleSidebar` dispatches by `isMobile`.
- The two states are independent across resizes (no synchronization in current code).
- `Sheet` returns null when closed (Radix Dialog default); the peer wrapper is NOT rendered in mobile branch.
- ProseMirror editor click handlers do NOT call `stopPropagation` on click events (verified via grep on editor source).
- No Playwright tests pin the FileSidebar's mobile/Sheet behavior (A5 confirmed).
- React Compiler is enabled per `CLAUDE.md`; spec proposes no `forwardRef`/`memo`/`useMemo`/`useCallback`.

**CSS/visual claims (confirmed):**
- `transform: translateX(...)` does establish a new containing block for `position: fixed` descendants (CSS Transforms Module Level 1, §6).
- BubbleMenu with `appendTo: () => document.body` (BubbleMenuBar.tsx:75) escapes the inset's transform — positioning is independent.
- Suggestion popups in `suggestion-floating-ui.ts:52` are appended to `document.body` — same independence.

## Unverifiable Claims

- **Q9 pulse-hint visual treatment** — DELEGATED to implementer/designer; no specifics in spec to verify.
- **Animation feel ("200ms ease-linear should not introduce jank")** — claim about GPU compositing is reasonable but cannot be confirmed without a prototype on representative content.
- **"Modern Tailwind sets `transform: translateZ(0)` implicitly via `transform-gpu` or layout transforms; fall back to `margin-left` if needed"** (§14 risk mitigation) — Tailwind 4's `translate-x-*` utilities use `transform`, but whether the GPU-compositing fallback is needed is implementation-time.
