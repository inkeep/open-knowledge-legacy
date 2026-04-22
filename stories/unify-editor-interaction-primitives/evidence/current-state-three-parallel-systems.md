---
title: "Current-state worldmodel — three parallel systems for 'what's active in the editor'"
type: synthesis
created: 2026-04-21
---

## TLDR

As of 2026-04-21, OK's editor has THREE parallel systems for tracking "what thing in the editor is active" and rendering UI for it. They were designed independently, in different PRs, with different authors, and they coexist — intentionally in the current design state, per CB-v2's author's explicit stance. The research in this story argues for unification; this file captures the factual snapshot of what exists today, before unification.

## The three systems

### System A — CB-v2's `SelectionStatePlugin` (block-only)

- **File:** `packages/app/src/editor/extensions/selection-state-plugin.ts` (449 LoC, on PR #165 worktree)
- **Shape:** PM PluginState holding `{ selectedBlockId, ancestorChain, selectionOrigin, isDragging }`. Block-only — docstring explicitly rejects kind-polymorphism ("Declined as premature in v1").
- **Consumers:** `JsxComponentView.tsx`, `Breadcrumb.tsx`, `SelectionAnnouncer.tsx`
- **Rendering:** emits 6 `data-*` attrs on JsxComponent wrappers (`data-selected`, `data-has-child-selected`, `data-selection-origin`, `data-dragging`, `data-needs-config`, `data-component-type`); CSS consumes attrs directly
- **Propanel:** per-instance Radix Popover inside JsxComponent's React subtree
- **Multi-peer:** explicit non-goal (#168 SPEC §4)

### System B — PR #237's `InteractionLayer` (chips + simple nodes)

- **File:** `packages/app/src/editor/interaction-layer.tsx` (on PR #237)
- **Shape:** Singleton store with `setActiveNode(nodeId | null)`, `register/deregister`, `subscribe`. Single active-node ID (string); NO kind, NO origin, NO ancestor-chain.
- **Consumers:** `InternalLink` (mark), `WikiLink` (node), `RawMdxFallback` (node), `JsxComponent` (registers for PropPanel slot only per precedent #25(c))
- **Rendering:** plain-DOM chips with `data-mark-id` / `data-node-id`; event delegation on editor root; singleton PropPanel at editor root
- **Propanel:** one at a time, rendered in the main React tree by `InteractionLayerView`

### System C — PM's native `state.selection` (text-range)

- **File:** PM's built-in — `prosemirror-state`
- **Shape:** `TextSelection | NodeSelection | custom`. `{anchor, head, from, to}` for text ranges.
- **Consumers:** Every TipTap command, BubbleMenu, y-prosemirror's yCursorPlugin
- **Rendering:** native browser cursor + yCursorPlugin for remote peer cursors
- **Propanel:** BubbleMenuBar (Floating UI anchored to selection rect)

## Cross-cutting invariants (three systems agree)

| Invariant | System A (CB-v2) | System B (V2) | System C (PM native) |
|---|---|---|---|
| Schema add-only forever (precedent #9) | ✅ bridgeId via PluginState, no schema attr | ✅ mark-id via PluginState, no schema attr | ✅ native |
| Typed transaction origins, object identity (precedent #1) | ✅ SELECTION_ORIGIN_META_KEY | ✅ typed origins | ✅ PM native |
| Event delegation at editor-root `view.dom` | ✅ `handleDOMEvents` | ✅ pointerdown at editor root | ✅ native |
| Stable semantic IDs keyed by PM/Y element (WeakMap) | ✅ bridgeId | ✅ mark-id | N/A (positional) |

**The convergence substrate is solid.** Disagreement lives entirely in the rendering + UI-state layers.

## What got deleted from CB-v2 (2026-04-21 09:49 PDT, commit eaeeb291)

The hook that could have been the convergence point between Systems A and B:

- `packages/app/src/editor/hooks/use-selection-anchored-popover.ts` (181 LoC) — DELETED
- `packages/app/src/editor/selection/compute-selection-anchor.ts` (146 LoC) — DELETED
- Tests (251 LoC) — DELETED

CB-v2's author's rationale (direct quote from commit message): *"Precedent #31 positioning scaffold that shipped ahead of any consumer in PR #168. Per the greenfield directive (no deferred tech debt, no scaffolded API surface), delete and revise Precedent #31 to describe the pattern conceptually; the first real consumer (link editor most likely) extracts the helper at its own site."*

**Implication:** If PR #237's InternalLink PropPanel wants selection-anchored positioning (admitted as a ship-summary gap), WE are the first real consumer. Per CB-v2's stated stance, WE would extract the helper at OUR site. The convergence architectural choice lands at our feet, not theirs.

## Precedent numbering collision (mechanical, merge-order problem)

| # | Main | PR #237 (V2) | CB-v2 (#165) |
|---|---|---|---|
| 24 | (does not exist) | Perf instrumentation as first-class | Direct PM dispatch for nested editors |
| 25 | (does not exist) | V2 editor cache + InteractionLayer + Option E | Compound components via DOM data-attributes |
| 26 | — | — | All user content visible and editable |
| 27-32 | — | — | Selection state, data-* attrs, CSS tokens, innermost-wins, Floating UI (conceptual), a11y |

Whoever merges second renumbers. PR #237-first → CB-v2 renumbers ~50 code comments. CB-v2-first → PR #237 renumbers ~4 code comments.

## Pointers

- CB-v2 SelectionStatePlugin — `packages/app/src/editor/extensions/selection-state-plugin.ts` (PR #165 worktree)
- V2 InteractionLayer — `packages/app/src/editor/interaction-layer.tsx` (PR #237 worktree)
- CB-v2's deletion commit — `eaeeb291` on PR #165
- Research: `reports/block-selection-indicator-patterns/REPORT.md`, `reports/context-bridge-registry-architecture/REPORT.md`, `reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md`, `reports/cm-in-pm-nested-editor-architecture/REPORT.md`

## Gaps / follow-ups

- Not investigated: how mobile/touch interaction composes across A, B, C today. All three use Pointer Events in principle, but per-instance Radix Popover (System A) has iOS-specific quirks not characterized here.
- Not investigated: performance cost of System B's InteractableLayer event delegation with 768 `data-mark-id` chips on PROJECT.md. Track 4 research noted PluginState for O(1) active tracking is safe; broader delegation cost not measured.
