---
title: CB-v2 (PR #165) popover-open ↔ block-selection coupling investigation
type: synthesis
created: 2026-04-21
source_worktree: /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/component-blocks-v2
head_commit: bda6625c
---

# TL;DR

In CB-v2, **popover-open state is component-local React `useState` inside `JsxComponentView`**, and block-selection state is a typed PM PluginState (`SelectionStatePlugin`). The two systems are architecturally **split**, not fused — the Popover does NOT read from or subscribe to `selectedBlockId`, and `SelectionStatePlugin` is explicitly read-only over the PM doc and carries no `openPopover`/`activeBlock` field. Coupling exists in exactly two narrow directions: (1) the `consumeAutoOpen(pos)` bridge fires `setPopoverOpen(true)` when `selected` transitions `false → true` on a fresh insert, and (2) FR-13a documents a "mount-on-selected" pattern where the Popover unmounts if the node deselects (but this is achieved through NodeSelection DOM machinery + Radix outside-click, not through a store write). Because popover-open is per-instance React state and there is NO global registry/guard coordinating it, **nothing prevents two open popovers in parallel today** — it is purely emergent. The shipped `useSelectionAnchoredPopover` + `computeSelectionAnchor` hook from PR #168 was DELETED in commit `eaeeb291` under the greenfield "no scaffolded API surface" directive; Precedent #31 was revised to describe the pattern conceptually without a central hook.

---

# State location map

| State | Physical location | Shape | Scope | Authority |
|---|---|---|---|---|
| Popover-open | `JsxComponentView.tsx:132` — `const [popoverOpen, setPopoverOpen] = useState(false);` | `boolean` | Per NodeView instance (one per jsxComponent) | Radix controlled (Popover `open={popoverOpen}` `onOpenChange={setPopoverOpen}` at `JsxComponentView.tsx:496-497`) |
| Block-selection | `selection-state-plugin.ts` PM PluginState keyed on `selectionStatePluginKey` | `BlockSelection = { selectedBlockId, ancestorChain, selectionOrigin, isDragging }` | Single per-editor store | SelectionStatePlugin `apply()` via `computeSelectionApply()` (selection-state-plugin.ts:278-302) |
| `wasSelected` transition sentinel | `JsxComponentView.tsx:133` — `useRef(false)` | boolean | Per NodeView instance | Written in the `useEffect` at lines 222-227; blocks double-fire under Strict Mode |
| `pendingAutoOpen` | `slash-command/component-items.ts:138` — module-level `Set<number>` | `Set<number>` keyed by PM position | Module singleton across editor | Set by `setPendingAutoOpen(pos)`, drained by `consumeAutoOpen(pos)` |
| Radix internal open state | Bypassed — shadcn wrapper uses controlled props | — | — | Does not apply: the Popover is controlled via `open`/`onOpenChange`; `popover.tsx:1-8` is a thin `PopoverPrimitive.Root` forward |

**CONFIRMED:** Popover-open lives entirely in the per-instance React tree. The selection plugin neither reads nor writes it. Quote from `selection-state-plugin.ts:15-16`: "Read-only over the PM doc. Never dispatches a transaction that mutates the document — bridge invariant (CLAUDE.md SC-INV-1) is preserved." The `BlockSelection` type (lines 75-84) contains no popover-related field.

---

# Trigger map

## Opens

| Trigger | Code site | Pathway |
|---|---|---|
| User clicks gear icon | `JsxComponentView.tsx:539-547` (`<PopoverTrigger asChild><button>`) | Radix internal handling → `onOpenChange(true)` → `setPopoverOpen(true)` |
| `selected` transitions `false → true` AND `consumeAutoOpen(pos)` returns true | `JsxComponentView.tsx:222-227` — `useEffect` on `[selected, hasEditableProps, pos]` | Flag set by `focusInsertedComponent` at `component-items.ts:178` after slash-insert; NodeView's post-rAF `setNodeSelection` fires, React re-renders with `selected=true`, effect runs, flag consumed, popover opens |
| Enter/Space on selected node | `JsxComponentView.tsx:368-378` (`handleKeyDown`) | Only fires when `selected && hasEditableProps`; explicit `setPopoverOpen(true)` |

## Closes

| Trigger | Code site | Pathway |
|---|---|---|
| Escape key | Radix-owned (not in JsxComponentView) | A11y test A11Y03 at `tests/a11y/component-blocks.e2e.ts:98-126` verifies Radix closes + returns focus to ProseMirror |
| Outside click | Radix-owned | Standard Radix Popover behavior; SPEC FP05 (line 366): "Click outside the PropPanel → Panel closes; node deselects" |
| Any `onOpenChange(false)` event | `JsxComponentView.tsx:497-537` | Runs `setPopoverOpen(open)` THEN — only when `open === false` AND descriptor has no editable children — a deferred `TextSelection.near` that advances caret past the node (prevents "stuck caret" inside self-closing blocks) |
| Selection moves to different block | **NOT explicit** — emergent only | There is NO effect, NO imperative close, NO subscription from the Popover to `selectedBlockId`. A selection change triggers a PM re-render; Radix's own outside-click handling may close, but no code path actively closes the popover on `selectedBlockId` transition |

## What does NOT trigger open/close

**CONFIRMED via grep:** Zero occurrences of `selectedBlockId` inside `JsxComponentView.tsx`. The component reads `blockSelection?.selectedBlockId` (line 181) only to derive `isInnermostSelected` for the halo `data-selected` attr, never to gate popover behavior.

---

# Coupling analysis

**Architecturally SPLIT, NOT FUSED.**

**CONFIRMED evidence:**

1. **No store field for popover.** `BlockSelection` contains `{ selectedBlockId, ancestorChain, selectionOrigin, isDragging }` (selection-state-plugin.ts:75-84). No `openBlockId`, no `activePopover`.

2. **No subscription from popover to store.** `useBlockSelection(editor)` is consumed at `JsxComponentView.tsx:178` to compute `isInnermostSelected` / `hasChildSelected` / `selectionOrigin` / `isDragging` — none of these feed back into `setPopoverOpen`.

3. **Indirect coupling through the `selected` NodeViewProp.** TipTap's `NodeViewProps.selected` (destructured at line 129) is sourced from PM's NodeSelection, the same substrate the selection plugin reads. The `useEffect` at lines 222-227 fires on `selected` transitions — so there is a one-way, event-shaped bridge from `selection state → popover open`, gated by `consumeAutoOpen` so it only fires on fresh insert. Quote from the effect comment: "Auto-open popover when: (1) component becomes selected AND (2) the pendingAutoOpen flag is set."

4. **FR-13a's "mount-on-selected"** (`specs/2026-04-14-component-blocks-v2/SPEC.md:172`): "Without `stopPropagation`, every input click inside the panel deselects the node → PropPanel unmounts mid-interaction (mount-on-selected pattern)." This is a pre-v2 design idiom for the legacy mount-when-selected pattern; the shipped CB-v2 NodeView DOES NOT actually unmount on deselect — the NodeView stays mounted as long as the node exists, the Popover just closes via Radix outside-click.

5. **Spec D-9 revision rejected fusion.** `specs/2026-04-16-block-selection-indicator/meta/_changelog.md:18`: "D-9 revision (US-006): Floating UI proof-usage is a dedicated hook integration test + pure computeSelectionAnchor unit test rather than production Radix Popover rewire. Rationale: Radix Popover already uses Floating UI internally; dual-source positioning adds risk without signal." → the original plan to rewire the chrome gear Popover to use `useSelectionAnchoredPopover` was explicitly declined.

---

# Multi-popover feasibility analysis

**2+ popovers CAN coexist today** — no guard prevents it. CONFIRMED.

- **Per-instance state.** Every `JsxComponentView` has its own `popoverOpen` state (line 132). No module-level "only one open" singleton.
- **No orchestrator.** Grepped for `activePlugin`, `openBlockId`, `popoverRegistry`, `closeOtherPopovers` across the CB-v2 worktree — zero hits.
- **Radix Popover is non-exclusive.** `packages/app/src/components/ui/popover.tsx` is a thin `PopoverPrimitive.Root` pass-through with no stacking/exclusion wrapper.
- **In practice it doesn't happen** because: (a) the typical user flow is click-to-select which closes the prior Popover via Radix outside-click, and (b) `consumeAutoOpen` is only set on fresh insert, so nothing else auto-opens a second one. But "typical flow" is not a guard — Cmd+click on a gear icon while another popover is open would leave both open (unverified; no test exists).
- **Spec acknowledgment of multi-popover:** UNRESOLVED at the block level. The only reference to "multiple inline popovers in a paragraph" is in `specs/2026-04-14-component-blocks-v2/evidence/inline-component-editing-deferred.md:222` (Q7 of the inline NG14 deferral): "Radix Popover positioning relative to an inline span — viewport-edge handling, scroll behavior, multiple inline popovers in a paragraph. Probe required during re-spec." This is an open question reserved for a future spec, not a decision made in CB-v2.

**INFERRED:** Multi-popover-UX (Cmd+click second chip without closing first) is neither an explicit goal nor an explicit non-goal for blocks in CB-v2. It is simply not addressed.

---

# Justification archaeology

## 1. SPEC §FR-11 / §FR-13a (`specs/2026-04-14-component-blocks-v2/SPEC.md`)

> **FR-11** PropPanel (block): Radix popover floating near the block. Auto-generated controls from PropDef (…). Panel suppressed when no editable props exist.
>
> **FR-13a** PropPanel is wrapped in `<div contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>`. Without `stopPropagation`, every input click inside the panel deselects the node → PropPanel unmounts mid-interaction (mount-on-selected pattern). ProseMirror docs-standard pattern for clickable controls inside NodeViews.

CONFIRMED: The stated model is "mount-on-selected". The rationale is PM NodeView discipline (preventing click-in-input from killing the NodeSelection), not a deliberate fusion with a central plugin.

## 2. Precedent #27 (`PRECEDENTS.md:119`)

> `BlockSelection` shape — `{ selectedBlockId, ancestorChain, selectionOrigin, isDragging }` — is the single source of truth for every selection-adjacent surface (NodeView `data-*` attrs, Breadcrumb, aria-live announcer, **Floating UI popovers**).

CONFIRMED: Popovers are listed as a *consumer* of block selection, not a producer. The store is one-way.

## 3. Precedent #31 — revised in commit `eaeeb291`

Original (pre-`eaeeb291`):
> For any UI that floats relative to editor-content coordinates — (…) — use the `useSelectionAnchoredPopover` hook (`packages/app/src/editor/hooks/use-selection-anchored-popover.ts`) wrapping `@floating-ui/dom`.

Revised (post-`eaeeb291`, `PRECEDENTS.md:123`):
> Any UI that floats relative to editor-content coordinates (…) uses `@floating-ui/dom` with virtual elements derived from the PM selection. (…) **No scaffolded hook or helper ships ahead of the first real consumer** — the greenfield directive precludes exporting unused surface area. The first consumer (link editor being the most likely) extracts the hook + anchor helper at its own site, unit-tests them, and future consumers reuse. The algorithm above is the contract; the file layout is a choice the first consumer makes.

Commit message (`eaeeb291`):
> `useSelectionAnchoredPopover` hook + `computeSelectionAnchor` helper + test — Precedent #31 positioning scaffold that shipped ahead of any consumer in PR #168. Per the greenfield directive (no deferred tech debt, no scaffolded API surface), delete and revise Precedent #31 to describe the pattern conceptually; the first real consumer will extract the helper at its own site.

## 4. PR #165 body (greenfield-discipline section)

> Deleted: (…) `useSelectionAnchoredPopover` hook + `computeSelectionAnchor` helper + test (Precedent #31 scaffolding shipped without a consumer in PR #168 — the first real consumer will derive the helper at its own site).

## 5. Spec D-9 revision (`specs/2026-04-16-block-selection-indicator/meta/_changelog.md:18`)

> **D-9 revision (US-006)**: Floating UI proof-usage is a dedicated hook integration test + pure `computeSelectionAnchor` unit test rather than production Radix Popover rewire. Rationale: Radix Popover already uses Floating UI internally; dual-source positioning adds risk without signal.

**Pattern across sources:** the `Popover` in JsxComponentView was explicitly left as vanilla Radix with component-local `useState`. Two successive opportunities to fuse it with the selection store (SC-8 "Popover rewire" in the original block-selection-indicator SPEC at line 100, and the `useSelectionAnchoredPopover` hook in PR #168) were both declined — first at D-9 revision ("dual-source positioning adds risk without signal"), then at `eaeeb291` ("no scaffolded API surface"). The architectural posture is: *selection is a typed store, popovers are a local per-instance concern, and positioning lives in Radix's internal Floating UI.*

## 6. Controlled-popover history

Three separate commits (`d861d975` `defaultOpen={selected}` → `f01f3a3a` controlled + useEffect → `16ff7780` revert to uncontrolled → `acd270b7` re-controlled → current `useEffect` + `wasSelected` ref) show Nick iterated specifically on the fresh-insert auto-open mechanism. Quote from `f01f3a3a`: "defaultOpen doesn't work because: (1) NodeView mounts with selected=false (insertContent renders before setNodeSelection fires via rAF), (2) defaultOpen only reads on first mount and ignores subsequent prop changes. Fix: controlled open/onOpenChange + useEffect that detects selected transitioning false→true while consumeAutoOpen() returns true."

---

# Multi-popover UX acknowledgment (question 6)

**NOT FOUND** for the Cmd+click-second-chip workflow at the block level. The only near-reference is the inline-component-editing deferral (NG14) which lists "multiple inline popovers in a paragraph" as a re-spec open question. For the shipping CB-v2 block-level PropPanel, this workflow is neither mentioned as a goal nor explicitly excluded.

---

# `SELECTION_ORIGIN_META_KEY` impact on popover (question 7)

**CONFIRMED: no effect.** The origin ('pointer' | 'keyboard' | 'programmatic') is plumbed through to the `data-selection-origin` attribute on the wrapper (`JsxComponentView.tsx:186-187, 386`) as a future hook for keyboard-only focus-ring differentiation. Quote from lines 167-173: "selectionOrigin: How the user arrived at this selection ('keyboard' | 'pointer' | 'programmatic'). Plumbed-through for future keyboard-only focus-ring differentiation; no v1 visual treatment."

The popover-open code path (`useEffect` on `[selected, hasEditableProps, pos]`) does not read `selectionOrigin` or `blockSelection` at all — it uses the TipTap-provided `selected` NodeViewProp + the module-level `pendingAutoOpen` set. A slash-insert fires the autoOpen regardless of whether origin happens to be classified as 'programmatic' (agent-write) or 'keyboard' (user typing slash menu Enter).

---

# Gaps / UNRESOLVED / INACCESSIBLE

- **UNRESOLVED:** Empirical Cmd+click multi-popover behavior is not tested. The spec FP scenario list (FP01-FP06 at SPEC lines 362-366) does not include a "two popovers open simultaneously" scenario. CONFIRMED via grep — no Playwright or unit test covers it.
- **UNRESOLVED:** Does PR #168's original SC-8 Playwright test ("SC-8: Scroll the editor while the Popover is open — Popover stays anchored") still exist post-eaeeb291? SPEC says "verified via Playwright" but the hook it was verifying was deleted. NOT INVESTIGATED further — the question was scoped to coupling, not positioning.
- **INFERRED:** The absence of a central popover orchestrator is deliberate per greenfield discipline ("no scaffolded API surface"), but the investigation did not find a spec passage explicitly weighing fused-vs-split as a decision. The split is emergent from (a) Radix being per-instance, (b) the selection plugin being declared read-only, and (c) the `useSelectionAnchoredPopover` hook being deleted before it could consume selection state.
- **INFERRED:** FR-13a's "mount-on-selected pattern" language is inherited from the legacy (pre-v2) design. In shipping CB-v2, the NodeView does NOT unmount on deselect (verified by reading JsxComponentView.tsx). The language in FR-13a has not been updated.
