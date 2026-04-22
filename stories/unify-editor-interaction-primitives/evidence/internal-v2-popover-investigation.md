---
title: "V2 InteractionLayer: popover-open vs active-node — the fusion audit"
type: synthesis
created: 2026-04-21
source_worktree: /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/playwright-stability
source_head: a5b10a5d (branch feat/v2-editor-cache-and-cold-load-ux; tip of PR #237)
---

## TL;DR

**Popover-open state and `activeNodeId` are 1:1 FUSED today (CONFIRMED).** The singleton `InteractionLayerStore` holds exactly one `_activeNodeId: string | null`, and `<InteractionLayerRoot>` renders the registered `propPanel` iff `active !== null` (`interaction-layer.tsx:317-332`). There is no independent popover-open flag anywhere — not in the store, not in `InteractionLayerView`, not in the three PropPanel components. Every close path (`onClose`, `onDismiss`, `onDeactivate`, Escape, outside-click, new-chip activation) routes through a single `store.setActiveNode(null)` (or `setActiveNode(otherId)`), enforcing mutually-exclusive single-popover semantics. PR #237's spec called this singleton shape "novel architecture" with a specific motivation (collapse 768 React portals → 1 for ~2.2s reconciliation savings); coupling popover-open to active was an unexamined simplification, not an argued stance. The `stories/unify-editor-interaction-primitives/evidence/draft-open-questions.md#Q-2` already identifies this fusion as "THE load-bearing question" and the only one-way-door in the unification spec.

## State location map

**Single source of truth**: `InteractionLayerStore._activeNodeId: string | null` at `interaction-layer.tsx:182`.

```
InteractionLayerStore (interaction-layer.tsx:180-253)
  private _activeNodeId: string | null = null;          // line 182
  private _snapshot: LayerSnapshot = {                  // line 185
    activeNodeId: null,
    active: null,                                        // resolved from registry.get(_activeNodeId)
  };

InteractionLayerRoot (interaction-layer.tsx:301-333)
  const { active } = snapshot;                          // line 317
  if (!active) return null;                             // line 318  ← FUSED GATE
  return <>{active.controls.propPanel?.(ctx)}...</>;    // line 326-331
```

**No separate popover-open flag exists** anywhere in the system. Confirmed via grep across `packages/app/src/editor/interaction-layer.tsx`, `packages/app/src/editor/extensions/{InternalLink,WikiLink,RawMdxFallback}PropPanel.tsx`, `packages/app/src/components/InteractionPropPanel.tsx`, and `mark-interaction-bridge.ts`. The PropPanel components carry no open/closed state of their own — they render unconditionally when mounted, and they are mounted iff `active !== null`.

**What the PropPanel components DO own locally**: subordinate edit-dialog open state (`editDialogOpen`, `createDialogMode`), text input values, fetched heading lists. These are sub-sheet toggles inside the singleton panel, not the popover itself.

**Positioning is fixed, not anchored.** `components/InteractionPropPanel.tsx:85` uses `absolute left-1/2 top-2 -translate-x-1/2` — the singleton PropPanel lives at top-center of the editor wrapper. It is NOT Floating-UI-anchored to the chip. `tmp/ship/progress.txt:366` explicitly frames this: *"Fixed bottom-centered positioning — naive; CB-v2 adds floating-UI / popper anchoring."*

## Trigger map — every `setActiveNode` call site

All call sites listed with file:line and context. **Every code path is inside `interaction-layer.tsx`**; extensions never call `setActiveNode` directly — they route via `deactivate()` closures.

### Open paths (`setActiveNode(id)`)

1. **Pointerdown fallthrough** — `interaction-layer.tsx:466-473`
   - Fires on bare pointerdown (not Cmd/Ctrl/middle/right click).
   - If `handlePrimary` is present and returns `true`, **skip**; otherwise `store.setActiveNode(id)`.
   - Used by InternalLink + WikiLink to let Cmd-click short-circuit to `openInternalHashHrefInNewTab` instead of opening PropPanel.

2. **Keyboard activation (Enter / Space)** — `interaction-layer.tsx:514-528`
   - Only fires if the focused element resolves to a registered chip via `data-mark-id`/`data-node-id` walk.
   - Same `handlePrimary` skip semantics, always with `newTab: false`.

3. **Public handle proxy** — `interaction-layer.tsx:634-636`
   - `handle.setActiveNode(id)` forwards to the store. No in-tree callers outside tests.

### Close paths (`setActiveNode(null)`)

4. **PropPanel `deactivate` callback** — `interaction-layer.tsx:323`
   - `deactivate: () => store.setActiveNode(null)`
   - Passed to every `controls.propPanel(ctx)` renderer as `ctx.deactivate`.
   - Extensions adapt it via the bridge (`mark-interaction-bridge.ts:184`) into `onClose` / `onDismiss` / `onDeactivate` props on the three PropPanels.
   - **Called imperatively by the PropPanel on completion** — e.g. `InternalLinkPropPanel.tsx:308` (`handleRemove`), line 421 (Open button after `handleNavigate`), `WikiLinkPropPanel.tsx:266` (handleRemove), 396 (Open). `RawMdxFallbackPropPanel.tsx:232` (Open-in-source).

5. **Escape key** — `interaction-layer.tsx:504-511`
   - `onKeyDown`: if `getActiveNode() !== null` and `key === 'Escape'`, `setActiveNode(null)` + `preventDefault`.
   - Document-level capture listener.

6. **Outside click** — `interaction-layer.tsx:530-581`
   - Document-level pointerdown capture.
   - Guards: skip if target inside editor dom, inside `[data-ok-interaction-layer]`, inside `[data-ok-prop-panel]`, or inside `[data-ok-layer-spawned]` (Radix dialog allowlist).
   - Else: `store.setActiveNode(null)`.

7. **Store `deregister` cascade** — `interaction-layer.tsx:195-202`
   - `deregister(nodeId)` auto-clears active if the cleared id was the active one.
   - Fired by `markIdentityPlugin` when marks disappear (`mark-identity.ts:267`), by WikiLink NodeView `destroy` (`wiki-link.ts:196`), by RawMdxFallback NodeView `destroy` (`raw-mdx-fallback.tsx:131`), and by `handle.destroy()` via `store.clear()` (line 647).

### Dedupe / race guards

- `setActiveNode` early-returns if `_activeNodeId === nodeId` (no-op), and silently ignores unregistered ids (line 205-212).
- Re-entrant writes are safe; subscribers fire on real transitions only.

## Coupling analysis — fused or split today?

**CONFIRMED FUSED.** The render gate at `interaction-layer.tsx:318` is `if (!active) return null;` — there is no second condition. Every test, every trigger, every consumer sees one-popover-at-a-time semantics. The architecture permits this fusion because:

- **Store shape**: `_activeNodeId: string | null` — single slot, not a set.
- **Render resolution**: `active = registry.get(_activeNodeId) ?? null` (line 249) — single registration resolved at snapshot time.
- **React subtree**: `<InteractionLayerRoot>` renders exactly one of `propPanel / toolbar / breadcrumb`, keyed to `active` (line 328-330). No fragment fan-out over a collection.

Switching activation on a second chip via Cmd+click is ROUTED AWAY (step 1 above: `handlePrimary` with `newTab: true` opens a new browser tab instead of activating). There is no UX code path that opens "chip B's popover while chip A's stays open" — the architecture actively forbids expressing it.

## Multi-popover feasibility — what would need to change

To decouple "what's selected" from "which popovers are open," the following surface touches are required:

1. **Store** (`interaction-layer.tsx:180-253`, ~70 LoC diff):
   - Replace `_activeNodeId: string | null` with `_activeNodeId: string | null` + `_openNodeIds: Set<string>` (or similar discriminated shape).
   - Add `openPopover(nodeId)` / `closePopover(nodeId)` / `isPopoverOpen(nodeId)` methods.
   - Snapshot shape grows from `{ activeNodeId, active }` to `{ activeNodeId, active, openEntries: RegisterParams[] }`.

2. **React root** (`InteractionLayerRoot`, lines 301-333, ~15 LoC):
   - Replace the single-render block with a `.map()` over `openEntries`, each rendering its propPanel with its own `deactivate` closure bound to `closePopover(id)`.

3. **PropPanel components** (3 files × ~5 LoC each):
   - `InternalLinkPropPanel`, `WikiLinkPropPanel`, `RawMdxFallbackPropPanel` — `onClose`/`onDismiss` already abstract; implementation swap is mechanical. `InteractionPropPanel.tsx` receives new positioning anchor (see below).

4. **Outside-click + Escape semantics** (`interaction-layer.tsx:504-581`):
   - Escape today clears ALL (line 508 `setActiveNode(null)`). Split design decides: Escape-clears-active-only, Escape-clears-topmost-popover, or Escape-clears-all.
   - Outside-click today clears ALL. Split design needs a policy: outside-click-nearest-popover vs. outside-click-all.

5. **Positioning** — INDEPENDENT PREREQUISITE but not strictly required:
   - Today all PropPanels render at fixed `top-center` of editor (`InteractionPropPanel.tsx:85`). If two panels render simultaneously they overlap. `tmp/ship/progress.txt:366`: *"CB-v2 adds floating-UI / popper anchoring"* — deleted in commit `eaeeb291` per `current-state-three-parallel-systems.md:49`. Our story would be the first real consumer.

6. **Tests** — `interaction-layer.test.ts` + 3 PropPanel test files + `ux-interactions.e2e.ts` rewrite for new semantics (~150 LoC).

7. **Keyboard and mouse DX decisions**: what does "click a second chip while the first is open" do? Shift-click to open-without-closing? Cmd+click is already taken (new-tab navigation).

**Total estimated migration cost later**: ~300-500 LoC touch spanning 8 files. Split-ready-from-day-one cost today: ~20 LoC per `draft-open-questions.md:Q-2`.

## Justification archaeology — what the code and docs SAY

### What IS justified in spec/precedent/code

- **Singleton plane (one React subtree at editor root)** — justified for the perf reason: collapses 768 React portals into 1, saving ~2.2s of reconciliation (cold-mount-profile §Corrected 5-component attribution row 4). Cited in `SPEC.md:273-311`, `interaction-layer.tsx:5-15`, commit `81fe3d1a` ("collapses 768 React portals to ONE singleton subtree"), PR body Key Decision #2, PRECEDENTS.md #25(c).
- **`InteractionControls` bag (propPanel + toolbar + breadcrumb)** — V2 wires only `propPanel`; `toolbar` and `breadcrumb` are reserved for CB-v2's `JsxComponentView`. Justified at `SPEC.md:300`, `interaction-layer.tsx:88-97`, audit `§S15` (finding: "V2 ships PropPanel only; Toolbar + Breadcrumb are extension points").
- **Plain-DOM chips (no React MarkView)** — perf justification, same 768 portals. Precedent #25(c).
- **Outside-click dismiss + Escape dismiss** — WCAG 2.4.3 focus-order compliance (`interaction-layer.tsx:384-396`), review Pass-2 Major #11 (Pass-2 review).

### What is NOT justified anywhere — the silence is the gap

There is **no code comment, spec paragraph, precedent clause, commit message, audit finding, review note, or ship-summary line that argues for fusing popover-open with activeNodeId**. The fusion is stated as architecture, never as a decision:

- **SPEC.md §9.2 (lines 273-311)** describes the primitive as "shared Popover triggered by activeNodeId" (line 297) and "ActivePropPanel `nodeId={activeNodeId}`" (line 285) — describing the shape, not justifying the 1:1 coupling. The spec's §10 Decision log has zero entries about this.
- **Precedent #25(c)** says `InteractionLayerStore` "holds registry + active node id" — states structure, not rationale for the coupling.
- **Commit `81fe3d1a` (US-003)** enumerates the primitive's API but says nothing about single-at-a-time semantics as a design choice. The decision-log of that commit lists perf (768 portals) and audit §S15 (toolbar/breadcrumb deferral) — nothing about single-vs-multi.
- **`tmp/ship/ship-summary.md`** — "Surfaced Opportunities #1" flags that `toolbar` + `breadcrumb` slots are reserved-but-unwired, but does NOT call out any popover-coupling gap. The ship summary contains NO line matching "multi-popover," "Cmd+click second chip," or "split active from open."
- **`tmp/ship/pr-body.md`** — Key Decision #3 acknowledges the InternalLink chip-click regression (2 clicks to navigate instead of 1) and explicitly punts: *"Defensible as interim UX while #168's `useSelectionAnchoredPopover` lands (enables hover-popover + bare-click-navigate), but worth a product-side decision on whether to flip bare-click behavior now or after #168."* This references positioning, not popover coupling.
- **`evidence/audit-findings-resolution.md`** — searched grep for `PropPanel`, `popover`, `activeNode`, `positioning`, `floating`, `multi.*popover`, `Cmd\+click`. Zero matches on popover-decoupling or multi-popover semantics. Audit touched scoping (S15), primitive API surface, accessibility, focus restoration — never the coupling.

The fusion is the DEFAULT that fell out of a "smallest store that makes tests pass" design. Every downstream component accepted it because the V2 spec's perf lever (768 → 1 portals) had nothing to say about whether the singleton plane holds 1 or N open panels — that is an orthogonal UX question that nobody asked during V2.

### The one place the gap is explicitly articulated

`stories/unify-editor-interaction-primitives/evidence/draft-open-questions.md#Q-2` (lines 27-39, dated 2026-04-21) — this current story's own draft:
> **Q-2: `popover-open` decoupled from `active` — THE load-bearing question**
> [...] **One-way door?** **YES.** Fused → split is the risky migration — PropPanel gets a new open-state source, every consumer that does `setActive(null)` to close needs updating, every `setActiveNode(id)` call site needs re-examined. ~20 LoC cost today vs. ~100+ LoC migration later.
> **Priority:** **P0** (one-way door).

## Migration cost estimate for split-ready

| Surface | Files | LoC delta (est) |
|---|---|---|
| Store shape + methods | `interaction-layer.tsx` | ~70 |
| React root render loop | `interaction-layer.tsx` (InteractionLayerRoot) | ~15 |
| PropPanel dismiss semantics | 3 PropPanel files | ~15 |
| Outside-click / Escape policy | `interaction-layer.tsx` | ~20 |
| Positioning (Floating UI anchor) | `InteractionPropPanel.tsx` + helper | ~100 (separate, independent work) |
| Tests | `interaction-layer.test.ts` + `mark-interaction-bridge.test.tsx` + `ux-interactions.e2e.ts` | ~150 |
| Total (split-ready only, excluding positioning) | 6 files | ~270 LoC |
| Total (split-ready + positioning) | 8 files | ~370 LoC |

Draft-open-questions.md's "~20 LoC vs ~100+ LoC" estimate is optimistic; it counts only the store-shape change. The realistic migration is dominated by the PropPanel-dismiss semantics and the outside-click/Escape policy decisions — both of which are UX questions that invite debate on every follow-up PR.

## Gaps / UNRESOLVED

- **UNCERTAIN:** Whether `handlePrimary` would remain the correct Cmd+click hook in a multi-popover world. Today it's the only path that can open a second chip's "destination" (new tab). A split design that allows Cmd+click-to-open-without-closing-first would conflict with the existing new-tab semantics — product UX decision needed.
- **NOT FOUND:** Any evidence that the V2 implementation considered multi-popover UX during spec, audit, or review. The silence is uniform across 536-line SPEC, 469-line audit resolution, 9.5K-line ship progress log, and 14 commits that touched `interaction-layer.tsx` or the PropPanel files. This is a greenfield, un-litigated design choice — not a committed architectural stance.
- **UNCERTAIN (blast-radius):** `markIdentityPlugin`'s `deregister` cascade (point 7 above) auto-clears `_activeNodeId` when a mark disappears. Under multi-popover, this needs per-id close dispatch — architectural change is straightforward but opens a timing edge: what if a popover was open for a mark that got deleted mid-type? The current "pop closes, no big deal" becomes "which pop closes, and does adjacent ones shift?"
- **CONFIRMED but not load-bearing:** RawMdxFallback's embedded CM6 editor currently depends on being the sole active panel (its `lastActivator` focus-restore and its `Prec.highest` Escape handler both assume exclusive focus). Multi-popover requires the CM6 panel to decide its own Escape semantics vs. layer's — this is solvable but adds a per-PropPanel escape-override contract.
