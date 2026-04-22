# Changelog — unify-editor-interaction-primitives

## 2026-04-21 — Story seeded

- **Author:** Claude Opus 4.7 (during architecture discussion w/ Nick)
- **Input source:** Live conversation branching off V2 editor cache review-cloud loop (PR #237). User request: "capture all of our worldmodel and learnings // draft architecture // open questions into a STORY.md"
- **Skills loaded:** /stories, /structured-thinking, /type-safety (per user's explicit invocation for the type-safety pass earlier)
- **Phase 3 (grounding):** SKIPPED — rich input. User brought ~2 hours of research findings (4 parallel nested-Claude tracks), a drafted 4-primitive architecture, 5 open questions with evidence-backed leans, and a type-safety pass with declaration-merging pattern + branded IDs + `.test-d.ts` lock pattern.
- **Evidence files authored:**
  - `evidence/current-state-three-parallel-systems.md` — snapshot of System A (CB-v2 SelectionStatePlugin), System B (V2 InteractionLayer), System C (PM native state.selection) as they exist today
  - `evidence/draft-architecture-4-primitives.md` — the 4-primitive unification synthesis
  - `evidence/type-safety-pattern.md` — declaration-merged `ActiveInteractableMap` + branded IDs + `.test-d.ts` lock
  - `evidence/draft-open-questions.md` — 5 open questions with evidence-backed leans
  - `evidence/research-multi-peer-selection.md` — raw research brief (Track 1), 26K chars
  - `evidence/research-nested-editor-selection.md` — raw research brief (Track 2), 25.8K chars
  - `evidence/research-discriminated-plugin-state.md` — raw research brief (Track 3), 22.6K chars
  - `evidence/research-pm-state-selection-composition.md` — raw research brief (Track 4), 15K chars
- **Scope of this seed:** Product-level WHAT + WHY for the unification; architecture captured as DRAFT evidence (not Decided). Spec phase will investigate implementation.
- **Excluded per user directive:** Merge order + sequencing questions (Q-G, Q-H, Q-I from conversation). Multi-peer layer (deferred with seam preserved).
- **Load-bearing open question:** Q-2 (popover-open decoupled from selected). Only one-way door in the set. All others are reversible.
- **Resolution gate (Phase 5):** 16 items, all resolved — 4 Decided (Locked), 1 Decided (Directed), 6 Parked (with revisit triggers), 6 Assumed (with verification plans). Zero Open / Exploring / Blocked remaining. Every Assumed item has confidence + verification plan. 7/7 completeness criteria populated.
- **Implementer's veto check:** An engineer reading STORY.md + the 4 synthesis evidence files could enter spec phase without re-deriving problem framing, value rationale, or scope. The 5 open questions have leans + priorities; spec phase starts by resolving PQ3/TQ1 (one-way door), then the rest in parallel with implementation.

## 2026-04-21 (later) — PQ3/TQ1/PQ2 resolved via evidence

- **Research round:** User directed `/research` via `/nest-claude` to investigate Q-2 (popover-open decoupling from selected). 4 parallel subagents: 2 × 3P (ecosystem UX + a11y; OSS code + design systems) writing to `reports/editor-popover-lifecycle-patterns/`, 2 × 1P (CB-v2 + our V2 worktree code explorations) writing to this story's `evidence/`.
- **New 3P report landed:** `reports/editor-popover-lifecycle-patterns/REPORT.md` with 4 evidence files (d1-d4). Surveys 8+ editors, 4 design system primitives, WAI-ARIA, HTML Popover spec.
- **New 1P evidence files:** `evidence/internal-cb-v2-popover-investigation.md` + `evidence/internal-v2-popover-investigation.md`.
- **Key research finding:** Multi-popover UX is ecosystem-absent (zero production editors ship it). CB-v2's pattern (per-instance `useState`) and V2's pattern (externalized `activeNodeId` store) are BOTH mainstream — Plate.js matches V2, BlockNote matches CB-v2. Both produce single-popover UX. The "one-way door" framing dissolves: if multi-popover ever materializes as UX, the migration is standardized via HTML `popover="manual"`, Floating UI `FloatingTree`, or Ariakit `usePopoverStore`.
- **Items table transitions:**
  - **PQ3:** Parked → Decided (Locked). NOT in v1. Zero ecosystem precedent.
  - **TQ1:** Parked → Decided (Directed). Ship V2's fused architecture; document escape hatches. Migration cost quantified at ~270 LoC (higher than the ~100 LoC I previously estimated).
  - **PQ2 (hover state):** Parked → Decided (Directed). Build HoverPlugin as a separate primitive IF URL-preview-on-hover enters scope — not before; direction is clear (every editor treats hover as distinct; HTML `popover="hint"` exists for it).
- **Story shape confirmed:** All P0 items now Decided or Assumed with verification. Implementer's veto still passes. Story is ready for spec phase.
- **Sub-finding of note:** Sub D discovered V2's PropPanel positioning is still "naive top-center" (`InteractionPropPanel.tsx:85`, admitted in `tmp/ship/progress.txt:366` as "CB-v2 adds floating-UI / popper anchoring"). The `useAnchoredPopover` extraction (XQ4) remains P0 — OK IS the first real consumer per CB-v2's `eaeeb291` rationale. No change to XQ4's existing Decided (Locked) status.

## 2026-04-21 (further) — Adversarial validation of both worktrees + architecture refinement

- **Validation round:** Two parallel nested Claudes loaded `/explore` and audited end-to-end: one on #165 (component-blocks-v2 worktree), one on our worktree (playwright-stability). Adversarial stance — find throwaway, test the merge plan, catch cases where the architecture should bend.
- **Key finding:** #237 ships ~4363 LoC of new code; ~75% UNTOUCHED by unification, ~16% LOAD-BEARING-adapted, ~5% directly-replaced. CB-v2's selection substrate (~1100 LoC) is effectively ActivePlugin's block branch already; only ~15 LoC of rename churn. The "three parallel systems" narrative is accurate at the code-path level but overstates divergence at the shape level.
- **Additional architecture adjustments** after adversarial re-check via `/assess-findings`:
  - Drop `.uuid()` from branded IDs — shipped codebases use `b${n}` / `m${n}` counter formats; `.uuid()` would throw on `parse()`. Use `.min(1).brand<'...'>()` — loose runtime, strict compile-time.
  - Fold `BlockId` → `BridgeId`: CB-v2's `selection-state-plugin.ts:56-73` locks the invariant `selectedBlockId === ancestorChain[last].bridgeId`; one identity, not two.
  - Extract `isDragging` to sibling `DragStatePlugin`: editor-scoped state, not active-interactable state. Shipped on BlockSelection for structural convenience; unification separates the concerns.
  - Drop `nested-editor.inner` recursive field: YAGNI — OK has zero N≥2 nesting cases.
  - Drop specific multi-peer wire format: premature specification. Keep Pattern B principle only.
  - Keep `pendingOrigin` in plugin (not registry): foreign-transaction-safety tuning (`metaOrigin > pendingOrigin > prev.origin`) at `selection-state-plugin.ts:248-302` is load-bearing.
  - `handlePrimary` as field on registration API, NOT "Primitive 5": verified at `interaction-layer.tsx:122` — it's a field on `RegisterParams`, not an independent architectural concept.
  - `InteractableControls` as pre-declared interface, NOT extension-merged: UI slots are a closed set; kinds are open. Asymmetric extensibility.
- **XQ2 reclassification:** Decided (Directed) → Decided (Locked). CB-v2 shipped the nested-CM selection-coordination fix at `ef49b53a` (2026-04-21 13:04 PDT) — I absorbed pre-fix framing into STORY.md. Four pieces delivered: CM→PM focus sync, PM→CM selection sync, arrow-at-boundary escape, `updatingRef` feedback-loop guard. Unification inherits.
- **RawMdxFallback architecture decision (T1 plan + PQ5):**
  - User flagged my "contractually committed" framing as appeal-to-authority. Correctly.
  - Re-assessed on merit per stated principle ("architecturally and product best, minimize throwaway").
  - Verified: US-006 AC is revisable (spec commitment made in isolation before CB-v2's inline-nested pattern was ready). Precedent #26 ("all user content visible and editable") is the stronger product commitment. Both PRs use DIFFERENT CM6 setup (not shared `createNestedCMExtensions` factory despite FR7's aspiration).
  - Decision: **trim #237's `RawMdxFallbackPropPanel` + co-located tests (~328 LoC) BEFORE merge.** Revise US-006 AC to click-via-`handlePrimary`-dispatches-RAW_MDX_NAV_EVENT (preserves pre-#237 source-mode affordance). CB-v2's inline-nested `RawMdxFallbackCMView` becomes the canonical implementation.
  - Cost: 1-2 day #237 re-review. Savings: ~328 LoC ship-then-delete throwaway avoided.
- **Items table transitions:**
  - TQ4 (origin taxonomy): Assumed → Decided (Directed). `isDragging` moved off ActivePlugin to sibling DragStatePlugin per TQ9.
  - TQ6 (brand verification): Assumed → Decided (Directed). Drop `.uuid()`, use `.min(1)`.
  - TQ8 (multi-peer wire schema): Parked → Decided (Directed). Document principle only.
  - XQ2 (nested-CM fix): Decided (Directed) → Decided (Locked). Already shipped.
  - NEW items: TQ9 (DragStatePlugin extraction), TQ10 (drop `inner`), TQ11 (handlePrimary as field), TQ12 (InteractableControls pre-declared), TQ13 (data-ok-layer-spawned + focus-restoration scoped invariants), XQ6 (T1 trim execution), PQ5 (converge on inline-nested RawMdxFallback).
- **Merge plan finalized:** Option E + T1 trim. #237 (trimmed) → #165 (rebased) → unification PR (~1000 LoC focused refactor, ~400-500 genuinely new). See `evidence/merge-plan-option-e.md`.
- **New evidence files authored:** `evidence/t1-trim-plan.md` (scope change for #237), `evidence/merge-plan-option-e.md` (topology + decisions).
- **Updated evidence files:** `draft-architecture-4-primitives.md` (new ActiveInteractableMap shape, DragStatePlugin sibling, clarifications for handlePrimary + InteractableControls, multi-peer principle-only), `type-safety-pattern.md` (drop `.uuid()`, `b1`/`m1` counter-format examples).
- **Resolution state:** 9 Locked, 6 Directed, 3 Assumed, 3 Parked. Zero Open/Exploring/Blocked. All P0 items resolved. Story seed + architecture ready for spec phase.
