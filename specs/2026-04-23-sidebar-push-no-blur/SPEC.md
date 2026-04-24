---
title: Sidebar push, no blur — Spec
tags: [spec]
---

# Sidebar push, no blur — Spec

**Status:** Approved (ready for implementation)
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-23
**Baseline commit:** 1a03f2cb (verified)
**Worktree:** `.claude/worktrees/sidebar-push-no-blur`

**Links:**
- Evidence: [`evidence/sidebar-mechanism.md`](evidence/sidebar-mechanism.md)
- Process history: [`meta/_changelog.md`](meta/_changelog.md)

---

## 1) Problem statement

**Situation:** The FileSidebar uses two rendering paths gated by viewport width. At `≥ 1280px` it renders inline as a flex sibling of the main `SidebarInset` panel — opening or closing the sidebar reflows the main panel. Below `1280px`, the sidebar renders as a Radix `Sheet` (modal Dialog rendered into a Portal) with a `bg-black/10 backdrop-blur-xs` overlay sitting between the document and the sheet.

**Complication:** Users on viewports < 1280px (laptops in narrow windows, split-screen setups, smaller external displays) routinely browse the file tree with reference to the document's content — picking a related doc, comparing names against headings, orienting before a navigation. The blurred backdrop makes the document content unreadable while the sidebar is open, forcing an "either/or" interaction. The modal pattern is the wrong affordance for a navigation surface that the user expects to coexist with their content.

**Resolution:** At the existing `< 1280px` breakpoint, replace the modal `Sheet` rendering with a push-via-translate behavior: the sidebar slides in from the left, and the main `SidebarInset` panel translates rightward by the sidebar's width. The panel keeps its intrinsic width (cropped on the right while the sidebar is open). No backdrop, no blur. Clicking the visible portion of the document or pressing `ESC` dismisses the sidebar, returning the panel to its original position. Desktop behavior (≥ 1280px) is unchanged.

## 2) Goals
- **G1: Document remains visually present and readable** at sub-1280px widths while the sidebar is open. The user can reference content while choosing a file.
- **G2: Push, don't overlay.** The main panel moves; nothing covers it. No backdrop, no blur, no modal-style focus capture.
- **G3: Symmetric, low-cost dismissal.** The sidebar closes via the same trigger button used to open it, plus `ESC` and clicking anywhere in the visible document area. Closing returns the panel to its original position with the same animation.
- **G4: Desktop behavior preserved.** `≥ 1280px` rendering path is untouched. No regression for users on wide displays.

## 3) Non-goals
- **[NEVER]** NG1: Changing the desktop (`≥ 1280px`) sidebar rendering, animation, or persistence behavior. Out of scope and explicitly excluded by user direction ("small width specifically").
- **[NEVER]** NG2: Replacing the `Sheet` primitive itself. `Sheet` is used by `ConflictResolver` (conflict-resolution modal) and `EditorArea`'s `DocPanel` (which sheet-renders at viewport widths `< 960px` per `useDocPanelLayout`). We are decoupling the FileSidebar from `Sheet`, not removing the primitive. Note: `AuthModal` and `CommandPalette` use Radix `Dialog` directly, not `Sheet` (corrected post-audit).
- **[NOT NOW]** NG3: Persisting the small-width sidebar open/closed state across page reloads. Today the `openMobile` state is in-memory only. Not on the table for this change. — Revisit if: users complain about losing sidebar state on small-width navigation.
- **[NOT NOW]** NG4: New keyboard navigation patterns (arrow keys to traverse the file tree from a closed-sidebar state, etc.). Out of scope. — Revisit if: a keyboard navigation spec lands and includes file-tree access.
- **[NOT NOW]** NG5: Animating the file-tree contents themselves (staggered list reveal, etc.). The slide-in animation animates the sidebar container as a whole. — Revisit if: design polish work explicitly targets this.
- **[NOT UNLESS]** NG6: Preserving scroll position or selection state in the document while the panel is translated. The translate is a pure visual transform; ProseMirror state is unchanged. — Only if: we observe regressions in editor behavior caused by the transform (e.g., tooltip positioning, popover anchoring).
- **[NEVER]** NG7: Applying the same push-no-blur treatment to the right-side `DocPanel` (Backlinks / Forward links / Timeline / Graph). Despite using the same `Sheet` primitive at `<960px`, DocPanel serves a different user task: cross-referencing or reviewing related docs, NOT navigating *based on* the open document's content. The user explicitly does not need the open document visible while interacting with DocPanel. The "blur is wrong for navigation" framing in §1 applies asymmetrically — it's load-bearing for the FileSidebar use case (browse files while reading), and not for DocPanel (consult related artifacts). Asymmetry is **intentional** — at 960-1280px viewports a user will see push-no-blur on the left and modal-with-blur on the right; this is by design per user direction (audit Round 3, design challenge C1).

## 4) Personas / consumers
- **P1: Single user on a narrow viewport (laptop, split-screen, narrow external).** Wants to browse the file tree without losing visual contact with the open document.
- **P2: User on a wide desktop display.** Out of scope for behavioral change but in scope for "must not regress."

## 5) User journeys

### P1 — Narrow viewport, browsing files

**Happy path (steps 1..N):**
1. User has a document open at viewport width 1024px. Document is fully visible. Sidebar is closed.
2. User clicks the `SidebarTrigger` button in the editor header (or presses `Cmd/Ctrl + \`).
3. Sidebar slides in from the left (200ms). Main panel translates right by `var(--sidebar-width)` (288px); right edge of document slides off-screen.
4. User scans the file tree. The visible left portion of the document remains readable (no blur, no dim).
5. User clicks a file in the sidebar. Document content swaps. Sidebar remains open. (TBD: does the sidebar auto-dismiss after file selection? See Open Question Q1.)
6. User clicks anywhere in the visible document area. Sidebar slides out (200ms). Main panel translates back to its original position. Right edge becomes visible again.

**Failure / recovery path:**
- If the user resizes the viewport from `< 1280px` to `≥ 1280px` while the sidebar is open in push mode, the sidebar should reconcile to the desktop's `open` state. The `openMobile` state can transition to the closed equivalent or be merged with `open`. (See Decision D2.)
- If the viewport resizes from `≥ 1280px` to `< 1280px` while the desktop sidebar is open, the push-mode sidebar should be open at the new width (translate active) per D9 — `openMobile` carries `open`'s value across the boundary.

**"Aha moment":** First time the user opens the sidebar at small width and sees the document slide right while remaining readable, instead of being blurred behind a modal.

**Debug experience:** The CSS variable `--sidebar-width` and the `data-state="expanded|collapsed"` attribute on the sidebar wrapper should remain inspectable. A new attribute or class signals "push mode active" so devtools shows whether the inset is translated.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Sidebar (small width, opening) | n/a | n/a | n/a | Sidebar slides in 200ms; inset translates right | Resize during animation: animation completes at the new computed width |
| Sidebar (small width, open) | n/a | File tree empty state (existing) | n/a | File tree visible; inset translated right; document partially visible (left portion) | n/a |
| Sidebar (small width, closing) | n/a | n/a | n/a | Sidebar slides out 200ms; inset translates back to origin | Click during close animation: completes the close |
| Document (small width, sidebar open) | Existing loading state | Existing empty state | Existing error state | Visible left portion is interactive; right portion off-screen | Click on visible portion → sidebar closes |
| Sidebar resize across breakpoint | n/a | n/a | n/a | State reconciles per Decision D2 | n/a |

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | At viewport width `< 1280px`, opening the FileSidebar must render it as a push-mode element (not a Radix `Sheet` modal). | DOM: no `[data-slot="sheet-overlay"]` element exists when the sidebar is open at width `< 1280px`. The sidebar element is positioned such that the `SidebarInset` is visibly translated right by the sidebar's width. | Eliminates the blur source and the modal pattern in one step. |
| Must | At viewport width `< 1280px`, the `SidebarInset` panel must translate right by `var(--sidebar-width)` when the sidebar opens, and back to `translateX(0)` when it closes, with a 200ms transition matching the sidebar's slide animation. | Visual: opening and closing the sidebar moves the document container as one block; document content does not re-wrap. | "Translate, not re-flow" is locked by user choice. |
| Must | At viewport width `< 1280px`, no `backdrop-filter`, dim overlay, or other visual effect must be applied to the document area when the sidebar is open. | DOM/CSS: the document area's computed `backdrop-filter` is `none`. No element with non-transparent background or blur sits over the document. | This is the explicit user complaint. |
| Must | Pressing `ESC` while the sidebar is open at width `< 1280px` must close it. | Keyboard: ESC closes; sidebar slides out; inset translates back. | Matches Sheet's existing ESC behavior; keeps keyboard parity. |
| Must | Clicking inside the visible portion of the `SidebarInset` (the document area) while the sidebar is open at width `< 1280px` must close the sidebar. | Click on document → sidebar closes. Click inside the sidebar itself (file tree, header buttons) does not close. | Replaces the Sheet's backdrop-click dismissal. |
| Must | Desktop (`≥ 1280px`) sidebar rendering, animation, and toggle behavior must be unchanged. | Visual + DOM diff vs. baseline at viewport widths 1280, 1440, 1920: no observable difference. | Hard guardrail. |
| Must | The `SidebarTrigger` button in `EditorHeader` must continue to open and close the sidebar at all widths. | Click trigger → opens or closes appropriately. | Existing affordance preserved. |
| Should | The `Cmd/Ctrl + \` keyboard shortcut should toggle the sidebar at all widths. | Press shortcut → toggles. | Existing behavior; no reason to drop. |
| Must | Resizing the viewport across the 1280px boundary must leave the sidebar in a coherent state per D9: crossing UP adopts the React `open` state; crossing DOWN carries `open`'s value across (`setOpenMobile(open)`). No flicker, layout jump, or stuck animation. | Manual test: open desktop sidebar at 1440px → resize to 1024px → small-width sidebar appears in push-mode (translated). Close desktop sidebar at 1440px → resize to 1024px → small-width sidebar is closed (no translate). Open at small width via trigger → resize UP → desktop sidebar opens (because `open` was true; `openMobile`'s prior value is irrelevant on UP). | D9. |
| Must | After a file is selected in the sidebar at small width, the sidebar remains open AND the visible portion of `SidebarInset` plays a one-shot pulse-hint animation (≤ 800ms total). The pulse must NOT use blur or dim — only highlight/accent (e.g., box-shadow ring on the visible left edge). The pulse must not play when `prefers-reduced-motion` is set. | Manual test: select a file → sidebar stays open → visible inset edge briefly pulses → no blur applied. With `prefers-reduced-motion: reduce`, no pulse plays; sidebar still stays open. | D7. |
| Must | The push-mode rendering must NOT auto-focus into the sidebar on open. Focus stays where it was. | Open sidebar via trigger → `document.activeElement` is unchanged (or remains the trigger button per browser default). | D11. |
| Must | The click-to-dismiss handler on `SidebarInset` must NOT fire when the click target is the `SidebarTrigger` button (which has its own toggle). | Click trigger to open → click trigger again to close (toggle path); not double-fired by inset's click. | D12. |
| Should | The push-mode rendering should honor `prefers-reduced-motion` by skipping the slide animation (instantaneous open/close) and skipping the pulse-hint. | With `prefers-reduced-motion: reduce`, sidebar appears/disappears without sliding; inset translates without transition. | A11y baseline; matches Radix Dialog's existing reduced-motion behavior. |
| Could | A focus-trap-like behavior at small width: when the sidebar is open, focus moves into the file tree (mirroring Sheet's auto-focus). | Tab order enters the sidebar on open. | NOT chosen — D11. Listed only to note it was considered. |

### Non-functional requirements
- **Performance:** Sidebar open/close animation should complete in 200ms (matches existing). The translate transform is GPU-accelerated and should not introduce jank. No layout thrash on the editor (the document doesn't re-wrap).
- **Reliability:** Editor focus and scroll position should be unaffected — `transform` does not trigger layout reflow. Tooltip/popover anchoring under translate is verified safe by the portalled-surfaces inventory ([`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md)) for first-render correctness; mid-animation freshness for body-portalled `floating-ui` popups is mitigated by closing open popups on sidebar toggle (see §9 — recommended mitigation 1 in the inventory).
- **Security/privacy:** Not applicable — visual layout change only.
- **Operability:** No new telemetry. The existing `data-state` attribute and CSS variables are sufficient for inspection.
- **Cost:** Zero runtime cost (CSS-only animation).

## 7) Success metrics & instrumentation

This is a UX correctness change, not a measurable adoption play. Success is binary:

- **Outcome 1:** At sub-1280px widths, opening the sidebar no longer blurs the document. (Verified by manual test + visual diff.)
- **Outcome 2:** The document is partially visible to the left of the sidebar. (Verified by manual test.)
- **Outcome 3:** Click-to-dismiss + ESC-to-dismiss work. (Verified by Playwright e2e + manual test.)
- **No regressions** at desktop widths. (Verified by visual regression at 1280/1440/1920.)

No new telemetry. No analytics counter.

## 8) Current state (how it works today)

See [`evidence/sidebar-mechanism.md`](evidence/sidebar-mechanism.md) for the full code trace. Summary:

- `FileSidebar` (`packages/app/src/components/FileSidebar.tsx`) wraps the shadcn `Sidebar` primitive (`packages/app/src/components/ui/sidebar.tsx`).
- `Sidebar` checks `useIsMobile()` (`packages/app/src/hooks/use-mobile.ts`, breakpoint 1280px) and renders one of two paths:
  - `isMobile === true`: Radix `Sheet` (Dialog) inside a Portal, with a `bg-black/10 backdrop-blur-xs` overlay.
  - `isMobile === false`: A `peer` flex item taking width in the layout, plus a `position: fixed` container that animates via `left`/`right`.
- `SidebarProvider` maintains two state variables (`open` for desktop, `openMobile` for mobile). `toggleSidebar()` dispatches by `isMobile`.
- The `SidebarInset` is a `flex-1` `<main>` element, naturally taking remaining width when desktop sidebar is present. At small widths, the Sheet portal removes the sidebar from the layout, so `SidebarInset` takes the full viewport width.

**Key constraints discovered:**
- `useIsMobile` is only consumed by `sidebar.tsx`. Blast radius is contained to that file.
- `Sheet` is also used by `ConflictResolver` (modal) and `EditorArea`'s `DocPanel` (sheet-render at `< 960px`). **We are not modifying `Sheet`** — only changing the FileSidebar's rendering path so it no longer uses `Sheet` at small widths. `AuthModal` and `CommandPalette` use Radix `Dialog`, not `Sheet`.
- The `sidebar_state` cookie set by `setOpen` (`packages/app/src/components/ui/sidebar.tsx:80`) is currently dead code — it is written but never read. State is React-only; the component does not unmount across resizes. D9 reasoning was originally framed as "cookie-persisted" but the actual mechanism is the React state's lifetime.
- No Playwright/integration tests pin the small-width Sheet behavior for the FileSidebar.

## 9) Proposed solution (vertical slice)

### User experience / surfaces
- **Editor pane (`SidebarInset`):** Visually translates right by `var(--sidebar-width)` when the small-width sidebar is open. Receives a click handler that closes the sidebar when the sidebar is open at small width and the click target is not within the sidebar.
- **Sidebar container:** At small widths, slides in from the left via `transform: translateX(0)` (from `translateX(-100%)`). No backdrop element exists.
- **Header / trigger:** Unchanged. The `SidebarTrigger` button in `EditorHeader` continues to call `toggleSidebar()`.
- **Keyboard:** `ESC` listener (window-level) closes the small-width sidebar when open. `Cmd/Ctrl + \` continues to toggle.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/#/<any-doc>` | Document view (single route in this SPA) | Sidebar push at width < 1280, untouched at ≥ 1280, dismiss behaviors |

### System design

**Architecture overview:** The change is contained to `packages/app/src/components/ui/sidebar.tsx` and `packages/app/src/hooks/use-mobile.ts`. No new dependencies. No state model changes other than potentially merging `openMobile` into `open` (see Decision D2 / D3).

**Component changes:**
1. `Sidebar` (in `sidebar.tsx`): Replace the `isMobile === true` branch's `Sheet` rendering with a push-mode rendering — render inline (no Portal) with `position: fixed` for the sidebar container and a transform-based slide animation. Crucially, **omit the flex-occupying `sidebar-gap` element at small widths** (or force it to `w-0`); the existing desktop inline pattern uses a flex `sidebar-gap` that takes width and causes `SidebarInset` to shrink — for translate-not-reflow (D3) to work, the inset must keep its full viewport width before the translate is applied. Concretely: branch on `isMobile`; the small-width branch renders only the `position: fixed` container with `transform: translateX(0|−100%)` driven by `openMobile`.
2. `SidebarInset` (in `sidebar.tsx`): At small width when `openMobile` is true, apply `transform: translateX(var(--sidebar-width))` and, when transitioning, a `transition-transform duration-200 ease-linear`. At small width with `openMobile === false`, no transform. At desktop width, no transform (existing flex behavior). When a file is selected with `openMobile === true`, apply a one-shot pulse-hint class that plays a short CSS keyframe and removes itself. **A10 acknowledgement:** today the inset's variant chrome (`md:peer-data-[variant=inset]:m-2 ml-0 rounded-xl shadow-sm`, `sidebar.tsx:296`) does not activate at `< 1280px` because the mobile branch returns only `<Sheet>` (no peer wrapper). Under the new push-mode, the peer wrapper is rendered, so the chrome activates at all viewports `≥ 768px`. Implementer must decide whether to keep this chrome at small widths (matches desktop appearance, slight visual drift from current) or suppress it (gate the chrome on a wider breakpoint such as `xl:`). Default: **keep**, since it visually unifies with the desktop look. The `ml-0` margin keeps the inset flush against the sidebar's right edge — important for the translate visual.
3. `SidebarProvider` (in `sidebar.tsx`):
   - Keep `open` and `openMobile` as separate state vars (D2).
   - Add an `ESC` window keydown listener gated on `isMobile && openMobile`. Before calling `setOpenMobile(false)`, the handler **must defer to any open Radix dialog** by checking `document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]')`. If a dialog is open, ESC is consumed by Radix's `DismissableLayer` and the sidebar handler must bail.
   - Add a `useEffect` watching `isMobile`. On change to `true` (resize DOWN): call `setOpenMobile(open)` to carry the desktop state across (per D9 — preserves "I was using the sidebar" intent). On change to `false` (resize UP): no-op (`open` is already the active state; user actions at small width are not propagated back per D9).
   - Compute `state` to reflect the active state per width tier (per design challenge C7): `state = isMobile ? (openMobile ? 'expanded' : 'collapsed') : (open ? 'expanded' : 'collapsed')`. Without this, `EditorHeader.tsx:329`'s tooltip text ("Hide Files" / "Show Files") will be inverted at small width.
   - Honor `prefers-reduced-motion` by adding a CSS class or data-attribute that consuming elements use to skip transitions. Today's inline-mode and Sheet do not honor it; this spec adds the behavior to the new push-mode rendering only.
4. `useIsMobile` (in `use-mobile.ts`): Unchanged. The 1280px breakpoint is reused (challenger flagged it as worth re-examining; pending user input on whether to lower to 960 or tier).
5. `FileTree` / file-selection callback: When `isMobile && openMobile` and a file is selected, dispatch the pulse-hint to `SidebarInset`. Implementation options: (a) call into a context-provided `onFileSelectedAtSmallWidth()` from `SidebarProvider`, OR (b) wrap the file-selection callback at the `FileSidebar` level by adding an `onSelect` prop forwarded from `FileSidebar` to `FileTree`. Both are in §16 SCOPE. Default recommendation: (b) — keeps the cross-cutting pulse logic out of `SidebarProvider` and avoids new context wiring.
6. `SidebarInset` click handler: Add `onClick={isMobile && openMobile ? handleClickInsetToClose : undefined}`. The handler reads `e.target` and confirms it is not the `SidebarTrigger` button before calling `setOpenMobile(false)`. With closure-bound state (no functional updaters / refs), the click-to-open path is a no-op even without this guard, but the guard is **defensive** for future implementer choices.
7. **Popup-close-on-toggle:** When `setOpenMobile()` is called (open or close), close any open editor popups (BubbleMenu, suggestion-floating-ui menus). Cheapest mechanism: dispatch a synthetic `Escape` keydown to `document` before applying the state change, OR call TipTap's `editor.commands.blur()`. Without this, body-portalled popups using `floating-ui`'s `autoUpdate` may have stale positions during the 200ms slide. Documented in [`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md).

**Click-to-dismiss wiring:** Add a click handler on the `SidebarInset` element that calls `setOpenMobile(false)` (or the unified state setter) when `isMobile && openMobile`. The handler must not fire on clicks inside the sidebar itself — but since the sidebar is a separate element (not a descendant of `SidebarInset`), the click won't bubble there anyway. The handler should be conservative: probably only attached when the sidebar is open at small width, to avoid spurious handlers on every click.

**Animation:** Use the desktop path's existing `transition-[left,right,width] duration-200 ease-linear` pattern, extended to `transition-[transform,left,right,width] duration-200 ease-linear`. The `SidebarInset` gets a `transition-transform duration-200 ease-linear` rule that's only active at small widths.

**Z-index:** The push-mode sidebar must visually sit "above" the inset's right edge that's translated off-screen. `z-10` (existing inline-mode value) should be sufficient since there's no other overlay competing.

#### Data flow diagram

- **Primary flow:** User clicks `SidebarTrigger` → `toggleSidebar()` → state setter → React re-render → CSS classes/data-attributes update → CSS transitions animate sidebar in and `SidebarInset` translate right.
- **Shadow paths to test:**
  - **viewport resize across 1280 boundary while open:** Need defined behavior (see D2).
  - **Click inside the file tree while sidebar is open:** Must NOT close the sidebar (click target is inside sidebar element, not inset).
  - **Click on the editor's text area while sidebar is open:** MUST close the sidebar. ProseMirror's click is on a descendant of `SidebarInset`.
  - **ESC while sidebar is closed:** No-op. The handler must be a no-op when `!openMobile`.
  - **`Cmd/Ctrl + \` while sidebar is open:** Toggles closed (existing behavior).
  - **Editor focus during close animation:** Editor should retain focus and cursor position.
  - **Viewport at exactly 1279px / 1280px:** Boundary behavior must be deterministic (matches the `<` comparison in `useIsMobile`).

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Animation jank during translate | GPU-accelerated transform should be smooth, but a heavy editor (large doc, many extensions) might cause jank | Visual: stuttering during open/close at small width | Investigate: are we re-painting due to ProseMirror reacting to a layout change? Consider `will-change: transform` on `SidebarInset` while sidebar is open. | Sidebar feels sluggish |
| Click handler interferes with editor click | onClick on `SidebarInset` fires when user clicks editor (intended), but might cause unintended close while user is actively editing | Manual: click in the document area while sidebar open should close, even if cursor lands in editor | This IS the desired behavior (per user choice). Acceptable trade-off. | None — this is the chosen UX |
| ESC swallows other components' ESC handling | Multiple modals (`CommandPalette`'s `CommandDialog`, `AuthModal`, `ConflictResolver`'s Sheet, the `DocPanel` Sheet at `<960px`) use Radix's `DismissableLayer` → ESC closes the topmost layer. | A `window`-level keydown listener fires alongside Radix's listener; there is no built-in priority. | The sidebar's ESC handler must explicitly **defer to any open Radix dialog**: before calling `setOpenMobile(false)`, check `document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]')` and bail if present. Alternative: wrap the small-width sidebar in Radix's `DismissableLayer` to inherit the layer-stack ordering — costlier but more idiomatic. Verify with manual test. | Confusing dismissal if both open |
| State desync on resize | Open at small width → resize to large; or open desktop → resize to small | Resize triggers `useIsMobile` change | D9 reconciliation: DOWN carries `setOpenMobile(open)`; UP adopts React `open` (`openMobile` is irrelevant). `useEffect` in `SidebarProvider` watches `isMobile`. | None when handler runs correctly. Edge case: actions taken at small width (e.g., user closes via click-on-doc) are not propagated back to `open` — on resize-UP, the sidebar reopens at desktop. Documented trade-off per "desktop-canonical" model. |
| File selection at small width without dismissal | User picks a file expecting to read; sidebar stays open per D7; user doesn't realize they need to click-to-dismiss | Pulse-hint plays on file selection (D7) | The pulse hint IS the mitigation. If user research reveals it's insufficient, revisit D7 toward auto-dismiss. | User feels stuck at small width |
| Tooltip/popover anchoring breaks | Editor tooltips (e.g., link previews) anchor to absolute positions that may be wrong after translate | Manual: trigger a tooltip while sidebar is open at small width | If transform creates a new containing block, fixed-position tooltips might anchor differently. Test and either adjust anchor logic or accept the trade-off if tooltips are unaffected. | Tooltips appear in wrong position |

### Alternatives considered

- **Option A — Push via flex re-flow (NOT chosen):** Render the small-width sidebar as a normal flex sibling (like desktop), letting the `SidebarInset` shrink to fit remaining width. Document text re-wraps to the narrower width. **Why not:** User explicitly chose "translate, not re-flow." Re-flow disrupts visual continuity of the document; reading position shifts when text re-wraps.
- **Option B — Keep Sheet but strip the blur (rejected):** Just remove `bg-black/10 backdrop-blur-xs` from `SheetOverlay`. **Why not:** The Sheet remains a modal — the document is still covered by the Sheet content (sidebar takes 75% of viewport at small widths via `data-[side=left]:w-3/4`), and the modal pattern (focus trap, portal) doesn't fit the "browse alongside content" use case. Half-measure.
- **Option C — Push via translate (CHOSEN):** Sidebar slides in via transform; `SidebarInset` translates right by `var(--sidebar-width)` while keeping its intrinsic width. Document keeps its layout, just slides right. **Why chosen:** Matches user's stated intent verbatim; preserves visual continuity; no document re-flow; click-to-dismiss makes the cramped reading at very narrow widths tolerable.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Replace `Sheet` rendering at `< 1280px` with push-via-translate. Sidebar slides in from left; `SidebarInset` translates right by `var(--sidebar-width)`; no backdrop, no blur. | X | LOCKED | No — reversible by reverting the rendering path | User's stated intent; eliminates the explicit pain (blur) and the implicit pain (modal pattern for a navigation surface). | User direction in conversation; [`evidence/sidebar-mechanism.md`](evidence/sidebar-mechanism.md) | Removes `Sheet` usage from `Sidebar` (no other consumer). Inset must apply transform conditionally. |
| D2 | State model: keep `open` (desktop, React state — cookie at `sidebar.tsx:80` is currently dead code) and `openMobile` (in-memory, small-width) as separate state vars. Add resize-sync per D9. | T | LOCKED | No | User chose "keep separate, add resize-sync." Smallest blast radius; no change to cookie semantics (the cookie remains dead in this spec — see Future Work "Identified" entry on persisting state). The two states reconcile at the breakpoint via the D9 sync rule. | User direction in conversation | Need new `useEffect` watching `isMobile` to reconcile state on resize (D9). |
| D3 | Push semantics: translate (not re-flow) | P | LOCKED | No | User chose explicitly. Translate keeps document layout stable; re-flow disrupts reading position. | User direction in conversation | At very narrow widths (e.g., 375px), most of document is off-screen while sidebar is open. Mitigated by click-to-dismiss + pulse hint (D7). |
| D4 | Dismiss surfaces: ESC + click on visible document area + `SidebarTrigger` button | P | LOCKED | No | User chose ESC + click-outside. Trigger button retained as the symmetric open/close affordance. | User direction in conversation | New `ESC` window listener gated on `isMobile && openMobile`. New `onClick` on `SidebarInset` gated on same condition. |
| D5 | Desktop (`≥ 1280px`) behavior: unchanged | X | LOCKED | Yes — changing desktop is a separate spec | User scoped the change to "small width specifically". Desktop is a hard guardrail. | User direction in conversation | All visual changes at desktop widths are regressions. Visual regression test at 1280/1440/1920 required. |
| D6 | Animation: 200ms ease-linear (matches existing sidebar slide) | T | DIRECTED | No | Consistency with existing animation. Implementer may tune easing if testing reveals jank. | Existing CSS in `sidebar.tsx:223` | Both sidebar and inset transitions should use the same duration to feel synchronized. Honor `prefers-reduced-motion` by adding `motion-reduce:transition-none` (or equivalent) to the transform/transition rules — this is **NEW** behavior; today's `Sheet` and inline-mode sidebar do NOT honor reduced-motion (verified post-audit). |
| D7 | File selection at small width keeps sidebar open, with a brief one-shot pulse-hint on the visible document area to invite click-to-dismiss. | P | DIRECTED | No | User chose "stay open, blink-pulse the document area as a hint." Direction is set; visual treatment of the pulse is delegated to implementer + designer. Constraint: the pulse must NOT use blur/dim (defeats the goal); use a subtle highlight/accent instead (e.g., box-shadow ring on the visible left edge of the inset, or a faint background gradient that fades). Plays once on file selection, ≤ 800ms total. Honors `prefers-reduced-motion` (no pulse). | User direction in conversation | New CSS keyframe + class toggle on `SidebarInset`. Triggered from file-selection callback in `FileTree`. |
| D8 | At small widths, the sidebar is rendered **inline** (not portalled), with structural deviation from desktop: no flex-occupying `sidebar-gap` (or gap forced to `w-0`) so `SidebarInset` keeps full viewport width before the translate is applied. Visual difference vs desktop: transform on the inset + position/animation on the sidebar container. | T | DIRECTED | No | Inline holds for: (1) shared DOM ancestry with `SidebarInset` (simplifies click-to-dismiss wiring); (2) `--sidebar-width` CSS variable already scoped to `SidebarProvider`; (3) no canonical sidebar portal anchor exists in `App.tsx`. Stacking-context implications: `transform` on `SidebarInset` creates a new containing block for `position: fixed` descendants. All editor surfaces inventoried — body-portalled popups (BubbleMenu, suggestion-floating-ui, Radix Dialogs) escape the transform; inset-descendant fixed elements (GraphPanel-expanded) translate with the inset, which is coherent UX. See [`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md). | [`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md) | Removes the `Sheet` import from `sidebar.tsx`'s small-width path. The mobile branch is replaced by a small-width-specific variation of the inline pattern with no flex-occupying gap. |
| D9 | On viewport resize across the 1280px boundary: **desktop is the canonical state**, mobile is a transient view of it. When crossing UP (mobile → desktop), active state becomes `open` (the in-memory `openMobile` is discarded). When crossing DOWN (desktop → mobile), `openMobile` is initialized from `open` (carry-across — `setOpenMobile(open)`). User actions at small width DO NOT propagate back to `open`; if a user closes at small width and resizes UP, the sidebar reopens at desktop's `open` state. | T | LOCKED | No | User chose "snap to persisted desktop state" on UP and "carry open-state across the boundary" on DOWN (audit Round 3). Together these encode "desktop is authoritative; small-width is a transient view." Resolves design challenge C6 (unplug-external-display 1440→1200 now preserves the open sidebar). Note: the `sidebar_state` cookie is currently dead code (write-only); React state's lifetime is the actual mechanism. | User direction in conversation; [`evidence/sidebar-mechanism.md`](evidence/sidebar-mechanism.md) "State model" | Add `useEffect` in `SidebarProvider` watching `isMobile`. On change to `true` (DOWN): `setOpenMobile(open)`. On change to `false` (UP): no-op (`open` is already the active state). Document the asymmetric "lost action at small width on resize-UP" trade-off. |
| D10 | `Cmd/Ctrl + \` keyboard shortcut continues to toggle at all widths. | P | DELEGATED | No | Existing behavior; no reason to drop. The current `toggleSidebar()` already dispatches by `isMobile`. | `sidebar.tsx:89-102` | None — already wired. |
| D11 | Focus management: opening the small-width sidebar does NOT auto-move focus into the file tree. The sidebar is no longer a modal `dialog`; focus stays in the editor (or wherever it was). Tabbing into the sidebar works as it does on desktop. | P | DIRECTED | No | Push mode is non-modal. Auto-focus would be confusing — it implies focus capture that doesn't exist. Users who want keyboard nav can Tab into the sidebar. | n/a | Implementer must NOT call `.focus()` on the file tree on open. |
| D12 | Click-to-dismiss zone: any click on the `SidebarInset` element (the entire main panel area), excluding clicks on the `SidebarTrigger` button (which has its own toggle behavior). Clicks inside the sidebar element do not bubble to `SidebarInset` (DOM hierarchy). | P | DIRECTED | No | Simplest effective rule. Editor-area clicks intentionally close the sidebar (per user choice — accepted trade-off, mitigated by D7 pulse-hint). Re-confirmed in audit Round 3 against design challenge C2 (which proposed an edge-strip via `SidebarRail`); user chose to keep D12. The SidebarTrigger exclusion is **defensive** — with closure-bound state (no functional updaters or refs), the bubbled click on inset reads the prior render's `openMobile === false` and is a no-op anyway. The exclusion guards against future implementer choices that read latest state via ref/functional updater. | User direction in conversation | onClick handler on `SidebarInset` gated on `isMobile && openMobile`. Trigger button retains its existing onClick. |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | When the user clicks a file in the sidebar at small width, should the sidebar auto-close? | P | P0 | Yes | Resolved: stay open + pulse-hint. See D7. | Resolved |
| Q2 | Should we unify the two state variables (`open` + `openMobile`) into one, or keep them separate with a resize-sync? | T | P0 | Yes | Resolved: keep separate + resize-sync. See D2 + D9. | Resolved |
| Q3 | Should the small-width sidebar be portalled or inline? | T | P0 | Yes | Resolved: inline. See D8. | Resolved |
| Q4 | Behavior when resizing across the 1280px boundary while the sidebar is open. | T | P0 | Yes | Resolved: UP adopts React `open`; DOWN carries `setOpenMobile(open)` (per audit Round 3 user re-confirmation against design challenge C6). See D9. | Resolved |
| Q5 | `Cmd/Ctrl + \` continues to toggle at all widths? | P | P0 | No | Resolved: yes. See D10. | Resolved |
| Q6 | Tooltip/popover anchoring during translate: do any editor tooltips break? | T | P0 | Yes | Resolved: pre-implementation portal/non-portal inventory completed at [`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md). All editor `position: fixed` descendants are either body-portalled (escape transform — first-render correct) or inset-descendant (translate with inset — coherent). Mid-animation freshness for `floating-ui` popups mitigated by §9 component change 7 (close popups on sidebar toggle). | Resolved |
| Q7 | Focus management at small width. | P | P0 | No | Resolved: no auto-focus into the sidebar. See D11. | Resolved |
| Q8 | Click-to-dismiss zone scope. | P | P0 | No | Resolved: full `SidebarInset`, excluding the SidebarTrigger button. See D12. | Resolved |
| Q9 | Pulse-hint visual treatment: exact CSS (box-shadow, gradient, ring color, easing). | P | P0 | No | Delegated to implementer + designer. Constraints in D7 (no blur/dim, ≤ 800ms one-shot, honors `prefers-reduced-motion`). Could prototype both `box-shadow` ring and gradient fade and pick. | Open (DELEGATED) |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Removing `Sheet` from the FileSidebar's small-width path does not affect any other consumer of `Sheet`. | HIGH | **Verified** (post-audit): real Sheet consumers are `ConflictResolver` (independent modal lifecycle) and `EditorArea`'s `DocPanel` (own `useDocPanelLayout` breakpoint at 960px). Both are independent of the FileSidebar's Sheet usage. `AuthModal` and `CommandPalette` use Radix `Dialog`, not `Sheet`. | Verified | Verified |
| A2a | Body-portalled editor surfaces (BubbleMenu, suggestion-floating-ui, Radix Dialogs, Y.js cursor overlays) maintain correct first-render position under inset translate. | HIGH | Verified by inventory at [`evidence/editor-portalled-surfaces-inventory.md`](evidence/editor-portalled-surfaces-inventory.md). | Verified | Verified |
| A2b | Mid-animation freshness for body-portalled `floating-ui` popups during the 200ms slide is mitigated by closing open popups on sidebar toggle (§9 component change 7). | MEDIUM | Manual test post-implementation: open BubbleMenu via text selection at small width, then toggle sidebar — verify menu closes cleanly without lingering at stale position. | Before merge | Active |
| A2c | Inset-descendant `position: fixed` elements (currently only `GraphPanel` expanded view) translate with the inset and remain coherent. | HIGH | Verified by CSS Transforms Module Level 1 §6 and inventory. Visual check at PR time. | Before merge | Active |
| A3 | Click-to-dismiss on `SidebarInset` does not interfere with editor selection, drag operations, or Ctrl/Cmd-click behavior in the editor. The handler reads `e.target` after the editor's own click handling has already established the new selection/cursor; closing the sidebar afterward should not re-trigger any editor side effects. | MEDIUM | Manual test: select text via drag while sidebar open at small width (drag should complete; sidebar should close at mouseup); Cmd-click a wiki-link (link navigation should fire AND sidebar should close). Note: this assumption is conditional on D12 holding (design challenge C2 may revise it to an edge-strip dismiss affordance, in which case the assumption is moot). | Before merge | Active |
| A4 | The 1280px breakpoint is correct for the new push behavior. | HIGH | Reuse existing `useIsMobile`. Re-confirmed in audit Round 3 against design challenge C4 — user chose to keep 1280px unchanged. The breakpoint's original re-flow rationale doesn't apply to translate semantics, but the threshold itself is unchanged for blast-radius simplicity (no callers other than `sidebar.tsx`). | Verified | Verified |
| A5 | No Playwright tests exercise the FileSidebar in Sheet mode that would need updating. | HIGH | grep over `packages/app/tests/` for `mobile`, `sheet`, `Sheet` in combination with sidebar — none found. | Verified | Verified |

## 13) In Scope (implement now)

- **Goal:** Replace the FileSidebar's `Sheet` rendering at `< 1280px` with push-via-translate; preserve desktop behavior.
- **Non-goals:** See §3.
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Andrew (until reassigned).
- **Next actions (tickets/tasks):**
  1. Resolve Open Questions Q1–Q8.
  2. Implement changes in `packages/app/src/components/ui/sidebar.tsx` and (potentially) `use-mobile.ts`.
  3. Add Playwright e2e: open sidebar at viewport 1024px, verify no overlay/blur, verify inset translates, verify ESC and click-to-dismiss.
  4. Visual regression check at desktop widths (manual or screenshot diff).
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** No new instrumentation. Outcome verified by manual + Playwright test.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Visual regression at desktop widths | Manual screenshot diff at 1280, 1440, 1920 before/after | Reviewer compares screenshots in PR |
| User on small viewport mid-session has stale UX | Page reload picks up new code; no migration needed | n/a — no persisted state is changing meaning |
| Animation feel | Match existing 200ms ease-linear; tune in PR review if needed | Manual test on macOS Safari, Chrome, Firefox |
| Cookie semantics | The `sidebar_state` cookie at `sidebar.tsx:80` is currently dead code (write-only). This spec does not change that. If a future spec activates the cookie's read path (Future Work "Identified"), revisit how it interacts with `openMobile`. | No action this spec |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Tooltip/popover anchoring breaks under translate transform | Medium | Medium | Test with link tooltips, autocomplete, mention popovers; if broken, isolate the transform to a different element so editor's containing block is unchanged | Implementer |
| Click-to-dismiss feels too aggressive (closes while user is editing) | Medium | Low (user can re-open) | Document as intended behavior; provide visible affordance (hover state on visible document area indicating it's clickable to close); revisit after dogfood | Implementer + designer |
| State desync on viewport resize | Medium | Low (rare action) | Implement resize-sync handler in `SidebarProvider`; verify with manual test | Implementer |
| Users on legacy browsers without `transform` GPU acceleration see jank | Low | Low | Modern Tailwind sets `transform: translateZ(0)` implicitly via `transform-gpu` or layout transforms; fall back to `margin-left` if needed | Implementer |
| Inset's right-edge crop is interpreted as broken layout | Low | Low | Documentation: this is intentional. No DOM is hidden; only visually translated. | Designer |
| ESC handler conflicts with other modal handlers (CommandPalette, AuthModal) | Low | Medium | Use Radix Dialog's existing focus/event priority; sidebar's ESC handler runs only when no modal is open | Implementer |

## 15) Future Work

### Explored

- **Unify `open` and `openMobile` state.** Investigated during the spec; would simplify the state model and remove a class of resize-sync bugs. Not in scope now because (a) it changes cookie semantics and may surprise users, and (b) the simpler approach for this spec is to keep them separate and add a resize-sync. **Triggers to revisit:** Q2 resolution moves toward unification, OR a future spec touches `SidebarProvider` and finds the dual-state model awkward.

### Identified

- **Persisting small-width sidebar state across reloads.** Today `openMobile` is in-memory only. Some users may want it persisted. Unknown if this is a real ask — would need user feedback.
- **Auto-focus / focus-trap behavior.** The Sheet today auto-focuses inside the modal. Push mode is non-modal, so focus management is different. May be worth a UX pass for keyboard users.

### Noted

- **A11y review of the new push-mode pattern.** Push-mode sidebar at small widths is no longer a `dialog` — screen readers will encounter it as a peer landmark. The `aria-label` and landmark roles on `SidebarHeader` / file tree should be reviewed.
- **Reduced-motion preference for existing inline-mode and Sheet.** Users with `prefers-reduced-motion` should get instantaneous open/close. **Neither today's Sheet nor today's inline-mode sidebar honor this** (verified post-audit — no `motion-reduce:` modifiers in either path). This spec adds reduced-motion handling to the **new** push-mode rendering and inset transform per D6 + the §6 Should rule. Bringing today's desktop inline-mode and remaining Sheet consumers into compliance is **NOT in this spec's scope** — listed here as a sibling follow-up.

## 16) Agent constraints

- **SCOPE:**
  - `packages/app/src/components/ui/sidebar.tsx` (primary change — small-width branch, `SidebarInset` transform, `SidebarProvider` ESC + resize-sync, `state` derivation per C7)
  - `packages/app/src/hooks/use-mobile.ts` (potential — only if breakpoint logic changes)
  - `packages/app/src/components/FileSidebar.tsx` (wrap file-tree's `onSelect` to dispatch the pulse-hint at small width — see §9 component change 5)
  - `packages/app/src/components/FileTree.tsx` (if implementer routes the pulse-hint via a new `onSelectAtSmallWidth` callback prop instead of wrapping at FileSidebar; see §9 component change 5)
  - `packages/app/src/components/EditorHeader.tsx` (review for compat — likely no change needed unless C7 fix changes the tooltip wiring)
  - `packages/app/src/components/EditorPane.tsx` (review for compat — likely no change needed)
  - New Playwright test file (e.g., `packages/app/tests/stress/sidebar-push-small-width.e2e.ts`)
- **EXCLUDE:**
  - `packages/app/src/components/ui/sheet.tsx` (do not modify the Sheet primitive itself; `ConflictResolver` and `DocPanel` depend on it)
  - `packages/app/src/components/ConflictResolver.tsx`, `packages/app/src/components/EditorArea.tsx` (Sheet-using consumers — do not change their Sheet usage as part of this spec)
  - `packages/app/src/components/AuthModal.tsx`, `packages/app/src/components/CommandPalette.tsx` (use Radix `Dialog`, unrelated to this change)
  - Any package outside `packages/app` (this is a UI-only change)
  - All tests except the new push-mode e2e (no test refactor required)
- **STOP_IF:**
  - Removing `Sheet` from the FileSidebar reveals a coupling we missed (e.g., another component reads sidebar's mobile state). Pause and re-investigate.
  - Tooltip/popover anchoring in the editor breaks under translate. Pause and design an alternative containing-block strategy.
  - Implementing click-to-dismiss interferes with editor selection or drag operations. Pause and consider scoping the click handler more narrowly.
- **ASK_FIRST:**
  - Any change that affects desktop (`≥ 1280px`) rendering — explicit out of scope.
  - Any change to the `Sheet` primitive itself.
  - Any new dependency.
  - Any change to the `useIsMobile` breakpoint value or semantics.
