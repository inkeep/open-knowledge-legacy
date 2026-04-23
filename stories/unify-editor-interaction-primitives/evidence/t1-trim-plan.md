---
title: "T1 scope trim plan for PR #237 — delete RawMdxFallbackPropPanel, converge on inline-nested"
type: synthesis
created: 2026-04-21
---

## TLDR

Per the architectural assessment (Items table XQ6 + PQ5), PR #237's `RawMdxFallbackPropPanel` (popover-nested CM6) is transitional scope that would ship-then-delete in the unification PR. Trim it now: delete ~328 LoC, revise US-006's AC, preserve the click-to-source-mode affordance via `handlePrimary` hook. Converge on CB-v2's inline-nested `RawMdxFallbackCMView` as the final implementation (already shipped at `ef49b53a`, matches precedent #26).

Cost to #237: 1-2 day re-enter of review-cloud (approved state resets on scope change). Savings: ~328 LoC avoid ship-then-delete throwaway.

## Why trim (vs. keep and let unification remove)

**Architectural argument:**
- CB-v2's Precedent #26 LOCKED: *"All user content visible and editable. If a component render fails, the NodeView swaps to a nested CodeMirror editor showing the block's source — the user can fix in place."* — Inline-nested is the stronger product commitment.
- Inline UX > popover UX: user edits raw MDX like any other text (inline block becomes editable CM), not in a detached popover.
- Both patterns use CM6 + markdown-lang extensions, but #237's `buildCmExtensions` and #165's `createNestedCMExtensions` are NOT shared modules today (despite FR7's aspiration). Keeping both means maintaining two CM6 configurations.

**Pragmatic argument:**
- US-006's AC was written in isolation (before CB-v2's inline pattern proved out). Revising the AC is honest scope revision, not retroactive commitment-breaking.
- #237 hasn't merged — no users in production depend on popover-nested UX.
- The ship-then-delete cost (~328 LoC) is exactly the "throwaway work not required for the scenarios" your principle rejects.

**User-visible consequence of trim:**
- Between #237 merging and CB-v2 merging (~1-2 week window in Option E): users who encounter raw MDX click the chip → source mode opens via `RAW_MDX_NAV_EVENT`. This is the PRE-#237 behavior.
- Not a regression from today's main (#237 hasn't merged; users currently see pre-#237 behavior).
- Once CB-v2 merges: inline-nested CM editing lands; source-mode navigation remains as fallback.

## What gets deleted from #237

| File | Lines | Fate |
|---|---|---|
| `packages/app/src/editor/extensions/RawMdxFallbackPropPanel.tsx` | 264 | Delete entirely |
| `packages/app/src/editor/extensions/RawMdxFallbackPropPanel.test.tsx` | ~64 | Delete entirely |
| `packages/app/src/editor/extensions/raw-mdx-fallback.tsx` NodeView | ~40 of 136 | Simplify: remove IL PropPanel registration's `controls.propPanel` wiring; remove CM6-related imports |

**Total deleted:** ~368 LoC

## What gets kept

From #237's current RawMdxFallback surface:
- Plain-DOM chip wrapping (`<span data-raw-mdx-fallback>...</span>`)
- InteractionLayer `register({ type: 'rawMdxFallback', nodeId, handlePrimary })` with empty `controls: {}` — forward-compat slot for CB-v2 to fill post-merge with its own PropPanel if needed
- `handlePrimary` hook: dispatches `RAW_MDX_NAV_EVENT` on click/keyboard activation (preserves pre-US-006 "open in source mode" affordance as the click target)
- `raw-mdx-nav-event.ts` module (RAW_MDX_NAV_EVENT type + dispatch helpers)
- `rawmdxfallback-multi-client.test.ts` — unchanged (tests CRDT identity preservation, not PropPanel)
- Core schema (`packages/core/src/extensions/raw-mdx-fallback.ts`) — unchanged

**Net #237 surface post-trim:** plain-DOM chip + `handlePrimary` → source-mode navigation. Forward-compat slot registered with IL but empty.

## Revised US-006 AC

**Before (current):**
```
- raw-mdx-fallback.ts: NodeView removes per-instance React; chip is plain DOM
- DELETE RawMdxFallbackView.tsx
- InteractionLayer hosts embedded CM source editor on chip click
- Multi-client typing converges via existing CRDT bridge
- I9/I10 fidelity invariants pass
```

**After (T1-trimmed):**
```
- raw-mdx-fallback.ts: NodeView removes per-instance React; chip is plain DOM
- DELETE RawMdxFallbackView.tsx
- InteractionLayer registers RawMdxFallback with empty `controls` (forward-compat slot for CB-v2)
- Click/keyboard activation dispatches RAW_MDX_NAV_EVENT via `handlePrimary` (preserves pre-US-006 "open in source mode" UX)
- In-place editing of raw MDX is OUT OF SCOPE for #237; CB-v2 ships inline-nested CM6 via RawMdxFallbackCMView
- Multi-client typing in raw MDX blocks: unchanged CRDT bridge (no PropPanel-mediated typing path in this PR)
- I9/I10 fidelity invariants pass (unchanged)
```

## Execution checklist (in #237's scope)

- [ ] Delete `packages/app/src/editor/extensions/RawMdxFallbackPropPanel.tsx`
- [ ] Delete `packages/app/src/editor/extensions/RawMdxFallbackPropPanel.test.tsx`
- [ ] Simplify `packages/app/src/editor/extensions/raw-mdx-fallback.tsx`:
  - Remove `@codemirror/*` imports + `buildCmExtensions` references
  - Replace `controls: { propPanel: () => <RawMdxFallbackPropPanel /> }` with `controls: {}` in `register(...)` call
  - Add `handlePrimary: (ctx) => { dispatchRawMdxNav(...); return true; }` as the click target
- [ ] Update `tmp/ship/spec.json` US-006 AC per above
- [ ] Update `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md` FR7 prose: describe the RAW_MDX_NAV_EVENT path, note that in-place editing comes from CB-v2
- [ ] Re-enter `/review-cloud` loop — expect quick turnaround since scope is strictly reduced
- [ ] Push updated commit; merge on re-approval

## Post-trim state of #237

- ~328 LoC removed
- US-006 AC narrower but still coherent (chip + IL registration + source-mode navigation)
- Forward-compat slot for CB-v2 preserved (empty `controls` in IL registration)
- No change to editor-cache.ts, mark-identity.ts, InteractionLayer event delegation, Internal/WikiLink chip patterns, or Option E cold-load UX

## Post-CB-v2-merge state of main

- CB-v2's `RawMdxFallbackCMView` delivers inline-nested CM6 (with `ef49b53a`'s PM/CM selection coordination)
- Users click raw MDX block → inline CM6 editor → edit in place → arrow-boundary escape to outer PM doc
- Source-mode navigation remains as secondary affordance (click-outside-CM, or explicit "open in source" button)

## Post-unification state

- Architecture's `kind: 'nested-editor'` variant wraps `editorRef: CMEditorView` (CB-v2's inline pattern)
- No popover-nested CM6 implementation in codebase
- No teardown work in unification PR for RawMdxFallback — inherited correctly from #165

## Alternatives considered

**Alt 1 — Don't trim; let unification remove ~250 LoC:**
- Saves 1-2 day review delay on #237
- Costs ~328 LoC of ship-then-delete throwaway
- Rejected: violates "minimize throwaway work" principle.

**Alt 2 — Trim only the CM6 setup; keep a simpler PropPanel with just "Open in source mode" button:**
- Saves ~200 LoC of CM6-related code
- Keeps ~64 LoC of simplified PropPanel + button
- Arguably cleaner UI affordance than `handlePrimary`-only (discoverable button vs click-anywhere)
- Weaker case: CB-v2's inline pattern doesn't need this UX; the source-mode-open affordance via `handlePrimary` preserves exactly the pre-#237 behavior.
- **Possible fallback** if `handlePrimary`-only feels under-discoverable during re-review.

**Alt 3 — Keep as-shipped, architecture supports both implementations permanently:**
- Two CM6 implementations in final codebase; maintenance burden
- Violates precedent #26 (popover-nested contradicts "editable in place")
- Rejected.

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reviewer pushback on US-006 AC change | Medium | AC is becoming STRICTLY SMALLER. Explain: CB-v2 is the canonical implementation; #237 preserves the pre-US-006 behavior as transition. |
| Users experience "regression" (no in-place editing) in 1-2 week window | Low | Pre-#237 behavior; not a regression from today's main. Document in PR body. |
| CB-v2 slips badly; editing-gap window extends | Low-Medium | Source-mode navigation remains; raw MDX still editable via full source view, just not in-place. |
| Unification PR still has RawMdxFallback work | Zero | Trim removes it from #237's scope; #165 already has inline-nested shipped. Unification inherits. |

## Confidence

HIGH on the trim decision. MEDIUM on the specific execution sequence (may need Alt 2 fallback if reviewer objects to `handlePrimary`-only affordance).
