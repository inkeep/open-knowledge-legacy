---
title: "Merge topology — Option E + T1: #237 (trimmed) → #165 (rebased) → unification PR"
type: synthesis
created: 2026-04-21
---

## TLDR

Ship #237 with RawMdxFallback trimmed per T1 → CB-v2 rebases with minimal adaptation (precedent renumber + clean raw-mdx-fallback.ts conflict) → unification PR lands on settled main as a focused refactor (~300-500 LoC). Zero throwaway work between PRs. Validated by adversarial code reviews of both worktrees.

## Sequence

```
Week 1:
  PR #237 finalization
    - Finish existing review-cloud fix-now items (walker maxDepth, eviction fallback log)
    - Resolve 2 remaining CI failures
    - T1 trim: delete RawMdxFallbackPropPanel + tests; simplify raw-mdx-fallback.tsx;
      revise US-006 AC (see evidence/t1-trim-plan.md)
    - Re-enter review-cloud (quick, scope-reduced)
    - MERGE → main has: editor-cache, InteractionLayer, mark-identity, Option E fallback,
      content-visibility mode toggle, provider prewarm; NO RawMdxFallback popover-CM6
    - Precedents #24 (perf), #25 (V2 cache + IL + Option E)

Week 2:
  PR #165 rebase on new main
    - Precedent renumber: #24-32 → #26-34 (#237 occupies #24-25)
    - Resolve raw-mdx-fallback.ts merge conflict: take CB-v2's inline-nested approach
      (clean — #237 no longer has competing popover-CM6 code)
    - No other cross-file conflicts per 1P validation
    - MERGE → main has: all of #237's surface + SelectionStatePlugin, BridgeIdPlugin,
      JsxComponentView with per-instance Radix Popover, RawMdxFallbackCMView
      (inline-nested with ef49b53a fix), Breadcrumb, SelectionAnnouncer,
      descriptor-dispatched MDX, all data-* attrs

Week 3+:
  Unification PR on settled main
    - ActivePlugin introduction:
      - interface ActiveInteractableMap with 4 kinds (mark/node/block/nested-editor)
      - Branded IDs via z.string().min(1).brand<...>() (no .uuid())
      - BridgeId reused directly for block variant (no BlockId)
      - nested-editor as leaf variant (no `inner`)
      - .test-d.ts lock
    - Sibling DragStatePlugin (extract isDragging from SelectionStatePlugin)
    - SelectionStatePlugin.BlockSelection → ActivePlugin kind:'block' branch
      - computeSelectionApply logic preserved verbatim
      - pendingOrigin WeakMap stays in the plugin (foreign-transaction-safety intact)
      - selection-origin event delegation stays in plugin's handleDOMEvents
    - InteractionLayer.activeNodeId → ActivePlugin kind:'mark'|'node' branches
      - Flat-string store replaced by kind-polymorphic state
      - Event delegation extracted to InteractableRegistry module (writes meta-keys)
    - Narrowing helpers:
      - isActive<K>() type predicate
      - useActiveMark(), useActiveBlock(), useActiveNode(), useActiveNestedEditor() scalar hooks
    - useAnchoredPopover (Primitive 4):
      - Restored from CB-v2's deleted useSelectionAnchoredPopover
      - Consumes ActivePlugin for anchor resolution
      - First consumer: InternalLink PropPanel (replaces naive "top-2 -translate-x-1/2" positioning)
    - Precedent consolidation:
      - #24 (perf instr) — untouched
      - #25 (V2 cache + IL + Option E) — corrigendum on #25(c) re: InteractionLayer → ActivePlugin + InteractableRegistry
      - CB-v2's #27-32 → either subsumed by unified entry or preserved with cross-refs
    - Architecture documentation: Pattern B principle for multi-peer (no wire format)
    - MERGE

Total: ~3 weeks from #237's current state to unification complete.
```

## Validated by adversarial code reviews

Both 1P validations (subagents exploring #237 and #165 worktrees end-to-end with adversarial stance) confirmed:

1. **Zero contradictions between PRs.** 14+ LOCKED decisions across CB-v2's 2 specs; zero violated by unification architecture.
2. **No hidden scope overlap.** #237 and #165 touch almost entirely disjoint files (InteractionLayer vs SelectionStatePlugin; mark-identity vs BridgeIdPlugin). The `raw-mdx-fallback.ts` conflict is the only real overlap — resolved by T1 trim.
3. **~75% of #237 is LOAD-BEARING for unification** (editor-cache, mark-identity, link-resolution, most PropPanel UI). Only ~16% adapted, ~7% directly-replaced.
4. **~100% of #165's selection stack is LOAD-BEARING for unification.** ~15 LoC of rename churn (`useBlockSelection` → `useActiveBlock`), nothing else changes.
5. **Nested-CM correctness gap is ALREADY FIXED in #165** at commit `ef49b53a`. Unification inherits.

## Architecture decisions that drive this plan

Decisions made in this story that affect merge sequencing:

| Decision | Item | Merge impact |
|---|---|---|
| T1 trim: delete #237's RawMdxFallbackPropPanel | XQ6 | Simplifies CB-v2's rebase conflict resolution to "take inline-nested" with no competing code to merge |
| Converge on inline-nested RawMdxFallback (CB-v2's pattern) | PQ5 | Unification has no RawMdxFallback teardown work |
| XQ2 (nested-CM fix) already shipped | XQ2 | Unification inherits, doesn't ship |
| Brand IDs with `.min(1)` not `.uuid()` | TQ6 | Matches both shipped codebases' counter formats; no runtime format migration needed |
| Fold `BlockId` → `BridgeId` | architecture | CB-v2's shipped `bridgeId` becomes the block variant's `id` directly — no name change, no refactor |
| Extract `isDragging` to `DragStatePlugin` | TQ9 | ~20 LoC of focused refactor during unification |
| Drop `nested-editor.inner` | TQ10 | Type-only simplification in architecture doc |
| Drop multi-peer wire format specifics | TQ8 | Premature-specification avoided; implementation PR defines contract |
| `handlePrimary` as field (not Primitive 5) | TQ11 | Matches #237's shipped `RegisterParams` shape |
| `InteractableControls` pre-declared (not extension-merged) | TQ12 | Matches #237's shipped shape |
| `data-ok-layer-spawned` + focus-restoration scoped to singleton | TQ13 | Inherited verbatim from #237; Radix handles per-instance cases |

## Unification PR scope (focused refactor, not teardown)

| Work | LoC estimate |
|---|---|
| ActivePlugin kind-polymorphic module + branded IDs + .test-d.ts lock | ~300 |
| InteractableRegistry extracted from #237's InteractionLayer event code | ~200 (mostly moved, ~50 new) |
| useAnchoredPopover restored from CB-v2's deleted hook | ~150 |
| Narrowing helpers + scalar hooks | ~80 |
| SelectionStatePlugin → ActivePlugin block branch refactor | ~50 LoC of type + move (logic preserved) |
| InteractionLayer.activeNodeId → ActivePlugin mark/node branches | ~100 LoC of adapter changes |
| Rewire PropPanels to useAnchoredPopover (3 files) | ~100 |
| Extract isDragging → DragStatePlugin | ~20 |
| Rename useBlockSelection → useActiveBlock (5 consumer files) | ~15 |
| Precedent consolidation + CLAUDE.md updates | ~100 lines of docs |
| **Total** | **~1015 LoC** |

Of which approximately 400-500 LoC is genuinely NEW; the rest is move-and-rename.

## Failure modes

| Failure | Impact | Mitigation |
|---|---|---|
| #237 re-review on T1 trim stalls | 1-2 day delay | Trim is strictly scope-reducing; explain clearly in PR body update |
| CB-v2 timeline slips badly | Editing-gap window extends (users click raw MDX → source mode only) | Not a regression from today's main; source-mode navigation always available |
| Unification PR delayed for weeks | Main has partial-unification state (3 systems coexist) | Acceptable — each system's shape is documented + commented; architecture docs guide future contributors |
| New architecture surfaces unexpected bugs at unification time | Unification PR scope grows | Scope-gate: if unification touches editor-cache or mark-identity semantics, STOP and spec-phase check |

## Alternatives considered

See `current-state-three-parallel-systems.md` for Option A (merge #165 first), Option B (merge #237 first — chosen), Option C (partial unification in each PR — rejected as coordination hell), Option D (big-bang merge all 3 — rejected as merge-queue nightmare).

Option E (merge #237 first, #165 rebases, unification 3rd) was chosen for:
- Minimum coordination cost
- Each PR stays in its lane
- Unification sees both "before states" on main (cleanest refactor context)
- T1 trim eliminates ship-then-delete throwaway

## Confidence

HIGH on the sequencing. MEDIUM on the unification LoC estimate (scope estimates drift ±20%).
