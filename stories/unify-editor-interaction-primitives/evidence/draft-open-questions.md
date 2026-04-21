---
title: "Open questions that must resolve before spec phase"
type: synthesis
created: 2026-04-21
---

## TLDR

Five architecture-shaping open questions remain after the 4 research tracks + type-safety pass. One (Q-2) is a one-way door. The other four are reversible. Sequencing questions (merge order, who owns unification, pre-merge vs post-merge) are EXCLUDED — user directive: "barring merge order."

Each question has: what's open, my current lean (evidence-backed), whether it's a one-way door, what's needed to resolve.

## Q-1: Hover state primitive

**What's open:** Does OK need a `HoverPlugin` separate from `ActivePlugin`, or is hover just an `ActivePlugin` state transition?

**Concrete UX driver:** URL-preview tooltips on link hover (without opening the PropPanel). Standard editor UX pattern — chip hover-popover distinct from chip click-popover.

**My lean:** **Separate primitive.** `ActivePlugin` carries transactional, undo-composable, click-or-keyboard-driven semantics. Hover is ephemeral (local-only, never synced to awareness, not undo-relevant). Overloading `ActivePlugin` with hover lifecycle tangles two different concerns.

**One-way door?** No. Fuse later is trivial (delete HoverPlugin, add `hover: true` to ActivePlugin variants). Split later is a grep-everywhere.

**To resolve:** Product decision — are hover tooltips for links in v1 scope? If yes → build HoverPlugin. If no → skip entirely, defer the primitive.

**Priority:** P2 (deferrable without hard dependency).

## Q-2: `popover-open` decoupled from `active` — THE load-bearing question

**What's open:** Fused model (V2 today: `setActiveNode(id)` also opens PropPanel; `setActive(null)` closes) vs split model (active tracks what's selected; `popover-open` is separate component-local React state).

**Concrete UX driver:** Cmd+click-to-open-a-second-chip-without-closing-the-first. In the fused model, you can't express this — selecting the second chip auto-closes the first's popover. Split model supports it trivially.

**My lean:** **Split from day one. Ship fused default.** Keep popover-open as component-local React state in the PropPanel component. Default behavior: selecting opens popover (matches today's UX); overrideable by the PropPanel when a workflow needs multiple popovers.

**One-way door?** **YES.** Fused → split is the risky migration — PropPanel gets a new open-state source, every consumer that does `setActive(null)` to close needs updating, every `setActiveNode(id)` call site needs re-examined. ~20 LoC cost today vs. ~100+ LoC migration later.

**To resolve:** Decision from story author — ship split-ready (recommended) or commit to fused and own the migration cost if hit. Does not require product research; requires a call.

**Priority:** **P0** (one-way door).

## Q-3: Origin taxonomy completeness

**What's open:** `'pointer' | 'keyboard' | 'programmatic'` is 3 origins. Does `'touch'` need to be distinct from `'pointer'`? Does `'drag'` belong as a kind or an orthogonal modifier? CB-v2's SelectionStatePlugin already tracks `isDragging` separately.

**My lean:** **Keep 3 core origins. Add `'drag'` as an orthogonal boolean modifier** (matches CB-v2's existing `isDragging` shape). `'touch'` stays as `'pointer'` until mobile becomes P0 — the Pointer Events spec intentionally unifies pointer+touch at the API level.

**One-way door?** No. Origins can be added later non-breakingly (`Origin = 'pointer' | 'keyboard' | 'programmatic' | 'touch' | 'voice'`).

**To resolve:** Engineering call. Ship with 3 origins + `isDragging` boolean; add origins as product adds surfaces that need discrimination.

**Priority:** P2.

## Q-4: `nested-editor.editorRef` lifecycle

**What's open:** When a nested editor (CM-in-PM) is destroyed, how does its entry get cleared from `ActivePlugin`? Options: (a) WeakRef to editor, swept by a finalization registry, (b) explicit `dispose` callback passed at registration, the nested editor calls it on unmount.

**My lean:** **Explicit `dispose` callback.** Registration contract: nested editor passes a `dispose` fn on register; ActivePlugin calls it when the entry is swept, OR the nested editor calls `active.deactivate(editorRef)` in its unmount. Matches V2's cache eviction discipline (precedent #25 — explicit eviction paths, no GC magic).

**One-way door?** No. Can switch from explicit → WeakRef later if leaks surface, or add WeakRef as a belt-and-suspenders layer.

**To resolve:** Engineering call. Default to explicit — simpler reasoning + matches existing cache patterns.

**Priority:** P2.

## Q-5: Event delegation precedence

**What's open:** When a DOM event target matches multiple data-attrs (a `data-mark-id` inside a `data-bridge-id`), which wins? Options: (a) attribute-order with documented precedence (`data-mark-id` > `data-node-id` > `data-bridge-id`), (b) innermost-structural-element wins regardless of attr kind.

**My lean:** **Attribute-order, with precedence documented at InteractableRegistry construction.** Innermost-structural is more "intuitive" but requires comparing DOM depths across resolvers — O(resolvers × depth) per event. Attribute-order is O(1) — try each resolver in order, first hit wins. Matches CB-v2's "innermost wrapper wins" precedent (PRECEDENT #30).

**One-way door?** No. The resolver chain is configurable; change at runtime.

**To resolve:** Engineering call. Default to attribute-order.

**Priority:** P2.

## Summary — what blocks spec start

Only **Q-2** (popover-open decoupling) is a one-way door. Resolving it before spec starts prevents a painful migration later.

The other four can either be decided with a 5-minute engineering call (Q-3, Q-4, Q-5) or deferred entirely with low cost (Q-1).

If the user agrees with the leans (Q-1: defer, Q-2: split, Q-3: 3+drag-bool, Q-4: explicit dispose, Q-5: attribute-order), all five resolve in a single session and spec can start.

## Out-of-scope questions (excluded per user directive)

- Merge order of PR #237 vs CB-v2 (mechanical, sequencing)
- Who owns the unification workstream (coordination, sequencing)
- Pre-merge vs post-merge unification (sequencing, not architecture)
- Nested CM selectNode/maybeEscape gap on CB-v2 (scope inclusion; architecture is settled by Track 2)
- First consumer of `useAnchoredPopover` — link editor vs image caption vs other (scope, not architecture)
- Multi-peer wire schema versioning (deferred layer; no architecture-level lock-in today)

## Pointers

- Draft architecture: `draft-architecture-4-primitives.md`
- Multi-peer research (Q-2 adjacent, deferred): `research-multi-peer-selection.md`
- Nested editor research (Q-4 adjacent): `research-nested-editor-selection.md`
- Discriminated-state research (Q-5 precedent): `research-discriminated-plugin-state.md`
