---
title: Design Challenge Findings — sidebar-push-no-blur
artifact: specs/2026-04-23-sidebar-push-no-blur/SPEC.md
challenge_date: 2026-04-23
---

# Design Challenge Findings

**Artifact:** `specs/2026-04-23-sidebar-push-no-blur/SPEC.md`
**Challenge date:** 2026-04-23
**Total findings:** 8 (3 high, 4 medium, 1 low)

The spec scopes the change to the *left* file sidebar. Cold-reading the codebase surfaced one structural concern (the right doc-panel uses the same Sheet+blur pattern at <960px and is invisible to the spec's scope), one framing concern (the breakpoint is single-tier when the post-change behavior makes a tiered breakpoint coherent), and several stakeholder gaps the spec mostly addresses but with documentation holes. Two design choices held up under independent scrutiny: D3 (translate vs re-flow) and D2 (dual-state vs unified).

---

## High Severity

### [H] Finding 1: Right-side DocPanel still uses Sheet+blur at <960px — leaves the asymmetry the spec explicitly calls out as wrong

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer / cold reader)
**Location:** §1 Problem statement; §3 Non-goals NG1; §13 In Scope; §16 Agent constraints
**Issue:** The Complication frames blur as "the wrong affordance for a navigation surface that the user expects to coexist with their content." That framing applies symmetrically to the right-side DocPanel (Backlinks, Forward links, Timeline) — but the spec is silent on it.

`packages/app/src/components/EditorArea.tsx:331` opens `DocPanel` as a Radix `Sheet` whenever `useDocPanelLayout()` returns `'sheet'`. The hook (`packages/app/src/hooks/use-doc-panel-layout.ts:3`) sets that breakpoint at **960px**. So at viewport widths between 960px and 1280px, the user gets:
- **Left sidebar:** new push-via-translate (no blur, document still readable) ✓
- **Right doc panel:** existing Radix Sheet with `bg-black/10 backdrop-blur-xs` overlay ✗

A user who opens Backlinks while reading a document at 1024px will hit the same blur the spec is explicitly fixing on the left. They will reasonably assume the change is incomplete or buggy.

**Current design:** "[NEVER] NG2: Replacing the `Sheet` primitive itself. `Sheet` is used by `AuthModal`, `CommandPalette`, and other dialogs that are genuinely modal. We are decoupling the FileSidebar from `Sheet`, not removing the primitive." Note the absence of any reference to DocPanel's use of Sheet for a navigation/reference surface that the spec's own framing classifies as "wrong."

**Alternative:**
- (a) Expand scope to include DocPanel — apply the same push-via-translate pattern when DocPanel opens at small widths (translate `editorContent` left by panel width, or rebalance the resizable group), OR
- (b) Acknowledge it explicitly in §3 Non-goals as `[NOT NOW]` with a "Revisit if user reports the same complaint about Backlinks" trigger, OR
- (c) Strip just the blur from `SheetOverlay` (rejected Option B from §9, but for DocPanel only) so at least the document-area overlay isn't blurred. This is the half-measure the spec dismissed for FileSidebar — and rightly so — but the spec didn't reason about whether dismissing it for DocPanel was the same trade-off.

**Trade-off:** Expanding scope (a) doubles the work but produces a coherent UX. Documenting deferral (b) costs nothing but leaves a known visible inconsistency. Strip-blur (c) is the cheapest patch but ratifies the half-measure for one panel.

**Status:** CHALLENGED
**Suggested resolution:** Add a Decision (call it D13) that explicitly addresses DocPanel. Either expand scope, defer with a Future Work entry of maturity tier "Identified" (not "Noted"), or accept the inconsistency and explain why the user-pain framing doesn't transfer. Without this, the spec's Goal G1 ("document remains visually present and readable") only holds for one of two narrow-viewport interactions on the same screen.

---

### [H] Finding 2: Click-to-dismiss zone IS the entire visible inset — the editing trade-off is acknowledged, but it conflicts with the spec's own Persona 1

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §6 FR (Must — click-to-dismiss); §10 D12; §14 Risks (row 2: "Click-to-dismiss feels too aggressive")
**Issue:** The Persona is "single user on a narrow viewport... wants to browse the file tree without losing visual contact with the open document." The Aha moment is "first time the user opens the sidebar at small width and sees the document slide right while remaining readable."

But the dismiss rule is: **any click on the visible document area closes the sidebar.** This includes:

1. Clicking to position the cursor in the document to start typing → sidebar collapses unexpectedly.
2. Clicking a wiki-link in the visible portion of the document to navigate → sidebar collapses + nav fires (per A3 — both fire).
3. Selecting text by drag (touch-down lands in the document) → sidebar closes at mouseup.

The persona wants to *use* the document while the sidebar is open — that's the Goal G1 framing. But the dismiss rule treats any document interaction as "I'm done with the sidebar." These two intents conflict.

The Risks table acknowledges "feels too aggressive" with mitigation "document as intended behavior; provide visible affordance (hover state on visible document area indicating it's clickable to close); revisit after dogfood." That's a behavioral mitigation, not a design fix. A user clicks once to position the cursor, the sidebar closes, they re-open, click again to type, it closes again. The pulse-hint (D7) signals "click to dismiss" once after file selection — but dismissal-on-edit is a separate confusion.

**Current design:** "Decision D12: Click-to-dismiss zone: any click on the `SidebarInset` element (the entire main panel area), excluding clicks on the `SidebarTrigger` button."

**Alternative:** A less-magic dismiss zone:
- (a) **Edge affordance** — a thin (12-16px) clickable strip on the left edge of the visible inset (immediately right of the sidebar's right edge) that closes the sidebar. This mirrors `SidebarRail` (already exported but unused at line 266), is visually discoverable on hover, and doesn't conflict with editor interaction. The rest of the inset behaves normally — clicks position the cursor, drags select text, links navigate.
- (b) **Click on the cropped/off-screen overflow only** — i.e. dismiss when the user clicks on a region that's *only* visible because of the translate (the right edge that is now sliding off-screen). But this region is already off-screen, so it can't be clicked. Unworkable.
- (c) **Dismiss only on click in the *non-content* areas** — e.g. the document's left/right margins or the empty space below the editor. Hard to define precisely without coupling the sidebar to editor-area internals.

(a) is the credible alternative. It uses an already-exported component (`SidebarRail`) the codebase ships but doesn't render. It addresses the "feels too aggressive" risk without rolling back the dismissal capability.

**Trade-off:** Edge-strip dismiss is more discoverable (visible affordance) and avoids the edit-vs-dismiss conflict, but it requires a single-click target instead of a 992px-wide zone. ESC and the trigger button still provide low-cost alternatives. The full-inset dismiss zone is "magic" — users won't know to click in the document until the pulse-hint trains them, and even after training they'll accidentally trigger it during normal editing.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine D12 against Persona 1's stated goal of using the document while the sidebar is open. The spec's own Aha moment ("the document remains readable") implies the user reads, perhaps clicks a word to position the cursor, perhaps starts typing — none of which should close the sidebar. If the user wants to dismiss, they have ESC, the trigger, or (with the proposed edge affordance) the rail. If D12 holds, surface the conflict explicitly: "Click-to-dismiss is in tension with Persona 1's reading-while-browsing goal; we accept this trade-off because [reason]. Pulse-hint after file selection mitigates the most common confusion path." The "revisit after dogfood" note isn't a pre-implementation safety net.

---

### [H] Finding 3: Inline rendering relies on the assumption that no z-index or stacking-context conflict will arise — but the spec leaves that to the implementer

**Category:** DESIGN
**Source:** DC1 (simpler alternative: portal); DC2 (stakeholder gap — implementer)
**Location:** §10 D8 ("inline keeps the sidebar inside the layout coordinate space, simplifying the transform-based push... Implementer may switch to portal if z-index issues arise during prototyping"); §9 System design "Z-index"
**Issue:** D8 picks inline rendering with a fallback escape hatch ("implementer may switch to portal"). But the same paragraph notes "no stacking-context surprises observed in initial design" — *because nothing was prototyped*. The spec doesn't trace a single existing portal-using subsystem to confirm inline works.

A non-exhaustive list of body-portalled UI in this codebase:
- `BubbleMenuBar` (`packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx:75`) — `appendTo={() => document.body}`
- Suggestion menus (slash, wiki-link) — `packages/app/src/editor/extensions/suggestion-floating-ui.ts:52` — `document.body.appendChild(popup)`
- Radix Tooltip / Dialog / DropdownMenu — Radix portals to `document.body` by default
- The proposed pulse-hint is on the inset (not portalled)

`transform: translateX()` on the inset creates a new containing block for any `position: fixed` descendants of the inset. Body-portalled UI is unaffected (it's a sibling of the wrapper, not a descendant). But the spec doesn't enumerate this, doesn't separate "subsystems that survive translate" from "subsystems that need verification," and asks the implementer to discover the right partitioning at PR time. That's process risk: a missed surface (e.g., a Radix DropdownMenu mounted with `portal={false}` like `BlockTypeSelector` at `packages/app/src/editor/bubble-menu/BlockTypeSelector.tsx:131`) could quietly break under translate.

**Current design:** "Z-index: The push-mode sidebar must visually sit 'above' the inset's right edge that's translated off-screen. `z-10` (existing inline-mode value) should be sufficient since there's no other overlay competing." Plus D8's fallback to portal if z-index issues arise.

**Alternative:** Either:
- (a) **Portal the small-width sidebar** — render it into `document.body` (or a stable sidebar-portal anchor in `App.tsx`). The translate moves to the inset alone; the sidebar slides via `transform: translateX()` on a portalled element with `position: fixed; left: 0; top: 0`. This eliminates the entire stacking-context concern and keeps the inset as the sole transformed element. The "inline keeps the sidebar inside the layout coordinate space" claim from D8 doesn't actually buy anything — the sidebar is already `position: fixed` in the existing inline mode (`packages/app/src/components/ui/sidebar.tsx:223`), so it's not in flow.
- (b) **Actually inventory portal/non-portal surfaces** in the spec before locking D8. The spec already asserts in A2 that "tooltip/popover positioning... will be tested post-implementation." A pre-implementation grep over `appendTo`, `createPortal`, `document.body.append`, and Radix `portal={false}` would surface every relevant surface and turn the assumption into evidence.

**Trade-off:** Portal has the cost of pulling the sidebar's z-index, focus order, and screen-reader landmark out of the natural flow — but the existing desktop sidebar is already `position: fixed`, so the focus/landmark cost is the same shape. The "coordinate space" simplicity argument in D8 is rhetorical, not concrete. (b) is the smallest change — keep inline but ground D8 in evidence.

**Status:** CHALLENGED
**Suggested resolution:** Either pre-validate D8 with a portal/non-portal inventory in evidence (resolving Q6 with code reading rather than implementation testing), or revisit D8 toward portal. The spec's NG6 ("only revisit if regressions appear") combined with A2's "MEDIUM confidence, manual test post-implementation" is a recipe for finding the regression in PR review and re-litigating the decision. Front-load the inventory.

---

## Medium Severity

### [M] Finding 4: 1280px breakpoint is the existing Sheet trigger but is an unusually high "mobile" threshold; post-change semantics suggest a tiered approach

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §10 A4 ("HIGH confidence — same threshold that triggers Sheet today"); D5 (desktop unchanged); §6 NFR
**Issue:** The spec inherits 1280px as the breakpoint without re-examining whether it remains the right cutoff *after* the rendering change. The inherited threshold is unusually high for "mobile" — `packages/app/src/hooks/use-mobile.ts:4` even comments "the threshold is unusually high for a 'mobile' cutoff." The original justification (per evidence): "below ~1280 the main panel reading width becomes uncomfortable" with the inline desktop sidebar (288px sidebar leaves 992px). That's a re-flow argument.

The new behavior is **translate, not re-flow** (D3). With translate, reading width concerns at 1280px disappear — the inset keeps its full 1280px width and the sidebar overlays the right edge. The original 1280px rationale doesn't transfer.

Conversely, the new behavior introduces a *new* concern at the bottom: at 480px the visible reading area is 192px (per evidence's reading-width math); at 375px it's 87px. The spec accepts this trade-off via click-to-dismiss + pulse-hint, but doesn't ask whether a *different* breakpoint structure would serve better:

| Width | Desktop inline (today) | Push-translate (proposed) | Re-flow |
|---|---|---|---|
| 1280px+ | OK (D5: unchanged) | n/a | n/a |
| 800-1280px | Re-flow uncomfortable (current Sheet motivation) | Push works well — 512-992px visible | Re-flow uncomfortable |
| 480-800px | n/a (Sheet today) | Push cramped — 192-512px visible | Re-flow worse |
| < 480px | n/a (Sheet today) | Push broken — < 192px visible | Re-flow broken |

**Current design:** A4 reuses the inherited 1280px without re-examining it post-change. The spec also doesn't surface any concern about the 320-480px range where the reading area is < 192px.

**Alternative:**
- (a) **Two-tier breakpoint:** push-mode at 480px-1280px; revert to Sheet (or refuse to render — full-screen sidebar) below 480px. This addresses the user's earlier "no floor" answer (per `meta/_changelog.md`) by reading "no floor" as "no floor on click-to-dismiss," not "no floor on push semantics." At 320px, push-mode leaves the user with one short word visible — click-to-dismiss is the *only* way out, and the document is meaningless anyway. Sheet at <480px would acknowledge that.
- (b) **Lower the breakpoint to ~960px** to align with `DOC_PANEL_SHEET_BREAKPOINT`. This unifies the right and left panel breakpoints (related to Finding 1) and acknowledges that translate works comfortably at the previously-uncomfortable 960-1280px range. Trade-off: at 960-1280px today, users get the desktop inline sidebar (which the original 1280px breakpoint deemed uncomfortable). Lowering to 960px would keep desktop inline rendering at those widths — likely the right call given the new translate semantics.

**Trade-off:** Single-tier (status quo) is simpler — one branch, one rule. Tiered is more work upfront and adds a third state. But the spec admits in §10 D3 implications that "at very narrow widths (e.g., 375px), most of document is off-screen while sidebar is open" — that's an implicit acknowledgement that the single tier doesn't degrade gracefully.

**Status:** CHALLENGED
**Suggested resolution:** Treat the breakpoint as a load-bearing decision, not an inherited constant. Either:
- Add a Decision (D13) confirming the 1280px breakpoint with explicit reasoning *for the translate semantics* (not just inherited from Sheet semantics), OR
- Investigate the tiered alternative — at minimum, document the explicit trade-off at 320-480px in §3 Non-goals or §15 Future Work as "Identified" (e.g., "Sub-480px push semantics are usable only via click-to-dismiss; revisit if mobile usage emerges").

---

### [M] Finding 5: Pulse-hint after file selection is a teaching pattern that should not need to exist in a well-designed dismiss model

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §10 D7 (DIRECTED); §11 Q9 (DELEGATED); §6 FR (Must — pulse-hint); §9 System design
**Issue:** The pulse-hint exists to teach the user "click here to dismiss" because the dismiss zone is invisible. If the dismiss affordance were visible (Finding 2's edge strip), no teaching is required. Pulse-hints are a recognized smell — they signal that the underlying interaction is undiscoverable and the design is patching it with an animation tutorial.

The spec layers complexity to make the teaching work:
- New CSS keyframe + class toggle on `SidebarInset` (§9 component changes #2)
- New file-selection callback wiring (Q9 lists two alternatives, both with new context dependencies)
- New `prefers-reduced-motion` gate (§6 must-rule)
- New "no blur, no dim — only highlight/accent" constraint on the visual treatment (D7)
- A 200ms-or-so delay after file selection before any user might react

`navigateTo()` in `packages/app/src/components/FileTree.tsx:105` is a top-level function with no React context. To dispatch a pulse, one of two new couplings must be introduced:
- Inject a `useSidebar()`-derived callback through props from `FileSidebar` → `FileTree` → every navigation site (sidebar nodes, breadcrumbs, etc.)
- Listen to `hashchange` in `SidebarProvider` and infer "this was a sidebar-driven nav" — but the same `hashchange` fires for agent-driven nav, browser nav, programmatic nav. Filtering this is non-trivial.

Both add new surface area for a feature that exists only because the dismiss is undiscoverable.

**Current design:** "After a file is selected in the sidebar at small width, the sidebar remains open AND the visible portion of `SidebarInset` plays a one-shot pulse-hint animation (≤ 800ms total)... The pulse must NOT use blur or dim — only highlight/accent."

**Alternative:**
- (a) **Pair Finding 2's edge affordance with auto-dismiss after file selection** (the Apple iPad NavigationSplitView pattern in compact layouts — the standard iOS/iPadOS interaction). The user picks a file, the sidebar dismisses, the document is fully visible. If the user wants to keep browsing, they can re-open immediately. This matches user mental model: "I picked a thing → I'm done with the picker." No pulse needed.
- (b) **Visible close button on the sidebar** (e.g., on the right edge of the open sidebar) plus stay-open behavior. This is the explicit-X pattern.
- (c) **Accept that the dismiss zone is the entire inset and skip the pulse** — train the user via tooltip on the trigger button (e.g. "Tap document to close"). Doesn't introduce CSS keyframes or new wiring.

**Trade-off:** (a) reverses the "stay open" choice the user made — Finding 5 is conditional on Finding 2's resolution. If the dismiss zone is fixed and discoverable (Finding 2 alternative), then "stay open" is more defensible because dismissal is cheap and obvious. (a) is the recognized standard pattern across iOS, Material persistent-drawer auto-collapse, and several productivity apps' compact modes. (c) is the cheapest path that retains the spec's "stay open" choice.

**Status:** CHALLENGED
**Suggested resolution:** D7's "stay open + pulse-hint" feels like a 2-out-of-3 compromise (stay open + click-anywhere-dismiss + no visual close affordance) where each individual choice is defensible but the combination forces the pulse into existence. Re-examine after Finding 2; if the dismiss affordance changes, the pulse may become unnecessary. The spec could call out that the pulse is a *consequence* of D12's invisible dismiss zone, making the dependency explicit so a future revisit knows where to look.

---

### [M] Finding 6: Resize-sync rule (D9) discards user intent on viewport DOWN crossing — and silently — without surfacing the trade-off

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §10 D9 (LOCKED); §6 Must-rule for resize-sync; §14 Risks
**Issue:** D9 says: on viewport crossing UP (mobile → desktop), adopt cookie-persisted `open`. On crossing DOWN (desktop → mobile), force `openMobile = false`.

Consider a user on an external display at 1440px who has the desktop sidebar open and visible. They unplug, the laptop shifts to 1200px. The spec's rule: sidebar slams shut. The user lost their sidebar without acting on it.

Conversely: a user opens their sidebar at 1024px (push-mode), then resizes the window upward to 1400px. They were *just* using the sidebar at small width; on crossing UP, the spec adopts the cookie value. If the cookie is `false`, the sidebar that was visibly open suddenly closes. If the cookie is `true`, it stays open — but at the desktop's inline state (different layout). Either way, the user perceives state continuity broken.

The spec's rationale: "DOWN forces `openMobile = false` — defaulting to closed is the conservative choice — avoids surprising the user with an auto-opened sidebar." But the *opposite* surprise (auto-closing a sidebar the user was using) isn't addressed.

This is more relevant on the desktop side because `react-resizable-panels` (used in EditorArea) and OS-level window splits (e.g., macOS Split View, iPad multitasking) cause frequent resize events that cross the 1280px boundary as users drag windows.

**Current design:** D9 is LOCKED. The rationale acknowledges the asymmetric choice on DOWN ("conservative") but not the user-friction it causes for the unplug-external-display case.

**Alternative:**
- (a) **Preserve open-state across the boundary** — on DOWN crossing, if `open === true`, set `openMobile = true`. The user's "I was using the sidebar" intent is preserved; they get the new push semantics. Trade-off: if the user resized aggressively to a tiny window, they may not want the sidebar visible at the new tiny width. But click-to-dismiss is one tap away.
- (b) **Smart preservation with a width threshold** — preserve open-state on DOWN if the new width is ≥ 800px; close otherwise. This handles the unplug-external-display case (1440 → 1200 keeps it open) and the deliberate-tiny case (1440 → 480 closes it).
- (c) **Keep D9 but document the resize-friction in §14 Risks** — at minimum, add a row: "Sidebar disappears on viewport DOWN crossing. Likelihood: medium (external display unplug, OS split-view enter). Impact: low (re-open is one tap). Mitigation: documented; revisit if user complaints."

**Trade-off:** (a) violates the conservative principle but matches user mental model. (b) adds one constant. (c) is the lowest-effort acknowledgment that the trade-off has a cost. The spec currently picks (a) on UP and the inverse on DOWN — that asymmetry may be worth re-examining.

**Status:** CHALLENGED
**Suggested resolution:** Either re-examine D9's DOWN rule (currently LOCKED — would need promotion to user judgment) or add a Risks row acknowledging the unplug-external case. The spec's confidence in D9 ("HIGH" implied by LOCKED) seems overstated given the user-pain framing.

---

### [M] Finding 7: Existing pre-change bug — `state` from `useSidebar()` reflects desktop `open`, not `openMobile` — propagates to `EditorHeader` tooltip; spec doesn't address it

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** §6 FR (Must — `SidebarTrigger` continues to open and close at all widths); §10 D2; existing code at `packages/app/src/components/ui/sidebar.tsx:106` and `packages/app/src/components/EditorHeader.tsx:97,329`
**Issue:** `state` is computed in `SidebarProvider` from `open` only:
```ts
const state = open ? 'expanded' : 'collapsed';
```
At small width, the sidebar's actual state is `openMobile`, but `state` continues to reflect the desktop cookie value. `EditorHeader.tsx:329` uses `state` to label the trigger tooltip:
```tsx
{sidebarState === 'expanded' ? 'Hide Files' : 'Show Files'}
```
At small width with the sidebar open (push-mode), if the cookie says `open = false`, the tooltip says "Show Files" — wrong. The user opens the sidebar and the tooltip suggests it's closed.

This is an *existing* bug today (in the Sheet world, the same mismatch is masked because the Sheet is its own dialog with focus capture, so users rarely hover the trigger while the Sheet is open). The push-mode change makes the trigger continuously visible alongside the sidebar — the bug becomes user-visible.

The spec's D2 LOCKS the dual-state model. It doesn't address what `state` means when `isMobile` is true. The implementer either:
- Fixes the bug as part of the change (out of scope per §16) — extending the change, OR
- Ships the regression (the visible bug worsens), OR
- Realizes mid-implementation that they need to compute `state` differently (a small `state = isMobile ? (openMobile ? 'expanded' : 'collapsed') : (open ? ...)` change), inflating scope.

**Current design:** "D2: keep `open` and `openMobile` as separate state vars... Smallest blast radius; cookie semantics unchanged." Doesn't address downstream consumers of `state`.

**Alternative:** Either:
- (a) Acknowledge in §6 that `state` must be recomputed to reflect the active state at each width tier. Add an FR: "At small widths with `openMobile === true`, the `state` value exposed by `useSidebar()` must be `'expanded'`; with `openMobile === false`, `'collapsed'`. EditorHeader's tooltip and any future consumer reflects the actual state." This is a 5-line patch.
- (b) Document it as a `[NOT NOW]` non-goal: "Tooltip text correction — separate cleanup."

**Trade-off:** (a) is trivial and prevents a visible regression. (b) ships a known visible regression to defer trivial work. Strong preference for (a).

**Status:** CHALLENGED
**Suggested resolution:** Add the `state` derivation correction to In Scope. Without it, the trigger tooltip will say "Show Files" while the sidebar is open at small width — a directly visible inconsistency that users will report.

---

## Low Severity

### [L] Finding 8: A2 (tooltip/popover anchoring) treats body-portalled and inset-descendant surfaces as one risk; they have different failure modes

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — implementer)
**Location:** §12 A2; §11 Q6 (deferred to implementation)
**Issue:** A2 lists "ProseMirror's tooltip/popover positioning, the floating menu, slash-command/autocomplete dropdowns, or the Y.js cursor/selection overlays" together at MEDIUM confidence. These surfaces have structurally different relationships to the proposed `transform`:

- **Body-portalled** (BubbleMenu via `appendTo={() => document.body}`, suggestion popups via `document.body.appendChild`, Radix Tooltip default): siblings of the wrapper, not descendants. `transform` on the inset doesn't affect their containing block. Their `getBoundingClientRect()` of the editor view returns *post-transform* coordinates — fixed-position popups at body level will be positioned at the visually-correct post-translate coordinates. Should be fine.

- **Non-portalled** (Radix `portal={false}` like `BlockTypeSelector` at `packages/app/src/editor/bubble-menu/BlockTypeSelector.tsx:131`): mounted inside the BubbleMenu's body-portalled DOM, so transitively also a body-descendant. Should be fine, but worth verifying.

- **Inline editor-DOM** (`.collaboration-cursor__caret` / `.collaboration-cursor__label` from `globals.css:487-509`): `position: relative` and `position: absolute` *inside* the editor DOM, which IS a descendant of the inset. They translate with the inset — relative positioning means they remain correctly placed relative to the editor's inline content. Should be fine.

The risk that warrants verification is the third category combined with any *fixed*-positioned editor descendant. Currently I find no `position: fixed` element rendered as a descendant of `SidebarInset` (only body-portalled fixed elements). But the table-controls menu and other future surfaces could land there.

**Current design:** A2 lumps these together with a generic "manual test post-implementation" plan.

**Alternative:** Sharpen A2 into three separate assumptions (or a three-row sub-table) so the implementer knows which surface to test for which class of failure. Specifically: **add a check** for any existing or new `position: fixed` elements rendered inside `SidebarInset`'s subtree. If none exist (current state), promote A2's confidence to HIGH for body-portalled surfaces and keep MEDIUM only for the "future fixed descendants" risk.

**Trade-off:** Extra spec detail vs. clearer testing scope. Low priority — A2's manual test will surface real issues regardless. But the precision matters because it tells the implementer when to stop testing.

**Status:** CHALLENGED
**Suggested resolution:** Optional sharpening. Not a blocker.

---

## Confirmed Design Choices (summary)

The following design choices held up under the three lenses; if a cold reader independently rediscovered them, the rediscovery confirms the existing rationale rather than challenging it.

**DC1 (simpler alternative):**
- **D3 (translate vs re-flow):** Holds. The user explicitly chose translate to preserve reading-position continuity; re-flow at small widths produces a 480-768px reading area that re-wraps on every open/close. Translate keeps the document's internal layout stable. The trade-off (right edge crops) is real but acceptable per §10 D3 implications.
- **D2 (separate `open` / `openMobile`):** Holds for blast-radius reasons. Unifying would change cookie semantics (small-width sessions persisting state to desktop visits) and require updating any code that reads `open` for cookie-driven SSR-like initialization. Keep separate is the smaller-radius choice. The cost (resize-sync) is real but bounded.

**DC2 (stakeholder gap):**
- **D5 (desktop unchanged):** Holds. Properly LOCKED as 1-way-door-with-evidence-required-to-revisit. Visual regression check at 1280/1440/1920 is appropriate.
- **D11 (no auto-focus into sidebar on open):** Holds. Push-mode is non-modal; auto-focus would imply focus capture that doesn't exist and would steal focus from active editing.
- **D6 (200ms ease-linear):** Holds. Matches existing animation; honoring `prefers-reduced-motion` is correctly added in the new spec rules.

**DC3 (framing validity):**
- **Complication structure:** Holds. The framing — blur + modal pattern as wrong affordance for navigation — is internally consistent and matches the user's explicit complaint. The Resolution follows from the Complication. Note that Finding 1 challenges the *scope* of the framing (it should also apply to DocPanel), not the framing itself.

---

## Cross-cutting observation (not a numbered finding)

The spec is well-structured for its declared scope but the scope is artificially narrow. Finding 1, Finding 4, and Finding 7 all surface the same underlying issue: the FileSidebar isn't an isolated UI surface in this codebase. It coexists with `SidebarInset`'s right-side DocPanel, with editor surfaces that read `useSidebar().state`, and with a breakpoint hierarchy (`use-mobile.ts: 1280` and `use-doc-panel-layout.ts: 960` and `use-doc-panel-layout.ts: 1024`) that wasn't designed as a coherent system. The "small width specifically" scoping (per §10 D5 and the user's quoted intent) keeps the change tractable but leaves three bugs/inconsistencies adjacent to it. A scope checkpoint is warranted before implementation.
