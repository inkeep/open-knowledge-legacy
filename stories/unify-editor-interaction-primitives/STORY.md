# Story: Unify editor interaction primitives

**Last verified:** 2026-04-21

## Problem (SCR-lite)

**Situation:** OK's editor today has **three parallel systems** for tracking "what thing in the editor is active" and rendering UI for it — each built independently, in a different PR, for a different category of interactable, with no shared primitive:

1. **System A — CB-v2's `SelectionStatePlugin`** (PR #165, post-#168-consolidation) — block-only PM PluginState + 6 `data-*` attrs + per-instance Radix Popover inside JsxComponent's React subtree
2. **System B — PR #237's `InteractionLayer`** — singleton store + event delegation + singleton PropPanel for chips (marks) and simple nodes
3. **System C — PM's native `state.selection`** — text-ranges + BubbleMenu via Floating UI

A convergence primitive that SHOULD have bridged A and B (`useSelectionAnchoredPopover`, 578 LoC with full tests) was deleted from CB-v2 on 2026-04-21 on greenfield grounds ("no scaffolded hook ships ahead of the first real consumer"). See `evidence/current-state-three-parallel-systems.md` for the full snapshot.

**Complication:** Three parallel systems produce three parallel costs that compound with every new editor feature:

- **Engineering cost (internal):** Every new interactable kind (hover tooltip, first-comment popup, collaborator halo, image caption) forces a premature choice among three systems or a fourth parallel one. The parallelism doesn't stabilize; it fragments further. Known pending consumers already include: InternalLink PropPanel positioning gap (v1-ship-blocker admitted in PR #237's ship-summary), nested CM selection composition (latent correctness bug in CB-v2's `RawMdxFallbackCMView`), and an unscoped backlog of hover/tooltip UX.
- **Correctness cost (customer):** Cross-cutting consumers like Breadcrumb + SelectionAnnouncer + keyboard navigation must reconcile three sources of truth. CB-v2's nested-CM is ACCIDENTALLY implementing split-ownership today (PM's `state.selection` goes stale whenever nested CM has focus — `EditorView.hasFocus() === false`), surfaced by Track 2 research. This is a live bug mapped to the parallel-systems problem.
- **Platform cost (forward-compat):** Features already discussed but not yet built — multi-peer selection halos, hover URL previews, Cmd+click-second-chip workflows — each needs a foundation that doesn't exist. The foundation will be invented ad-hoc per feature, producing more fragmentation, unless unified first.

**Resolution:** Collapse the three parallel systems into **four composable primitives with a single semantic source of truth** and a type-safe, declaration-merged extension seam:

1. **`ActivePlugin`** — PM PluginState, kind-polymorphic discriminated union (`mark | node | block | nested-editor`), Proxies `state.selection` for text-range (no duplicate bookkeeping), branded IDs per kind, declaration-merged extensibility via `ActiveInteractableMap` interface
2. **`InteractableRegistry`** — DOM event delegation + attr→kind resolution, stateless, dispatches to ActivePlugin via `tr.setMeta`
3. **Narrowing helpers** — type predicates + scalar hooks (`useActiveMark()`, `useActiveBlock()`) so consumers never need 4-branch switches
4. **`useAnchoredPopover`** — Floating UI hook consuming ActivePlugin; restored with new contract from CB-v2's deletion

Multi-peer presence layer is a SEPARATE, DEFERRED concern (three additional primitives: `SelectionAwarenessBridge`, `RemotePresenceStore`, remote decoration plugin) — seam preserved today, code ships later. The local 4-primitive architecture is unaffected by the deferral.

Full architecture: `evidence/draft-architecture-4-primitives.md`.

## Value and goals

Value lives at the intersection of three dimensions — the sum is what motivates the work; any one dimension alone wouldn't justify this scope.

**Platform (primary):** Establishes the foundation that every subsequent "show UI for a thing" feature inherits. The 4 primitives become the precedent for how the editor reasons about interactability. Without this, each new feature either forks a fourth parallel system or retrofits into the wrong one — both compound drift. With it, the link-editor PropPanel, hover tooltips, first-comment popup, collaborator halo, image caption, and multi-peer future all share one foundation.

**Customer (near-term):** Fixes a currently-latent correctness bug (nested CM selection gap on CB-v2 — `RawMdxFallbackCMView` has no `selectNode`/`maybeEscape` wiring, `state.selection` goes stale on focus) and unblocks admitted v1 gaps (InternalLink PropPanel positioning — flagged in PR #237's ship-summary, no foundation exists today).

**Engineering velocity (compounding):** Reduces future feature cost. A hover URL preview today = "invent a fourth system or contort an existing one"; with this foundation = `useAnchoredPopover({anchor: 'active', placement: 'top'})` + a lightweight HoverPlugin sibling (deferred, but seam exists). The intersection — **fixing a present correctness bug** + **unblocking a present v1 gap** + **reducing every future feature's cost** — justifies the ~880 LoC of unification work above and beyond the per-feature value of any one downstream consumer.

**Observable success criteria** (what "done" looks like):
- **All three parallel systems' code collapses into the 4 primitives** — zero remaining references to the old `SelectionStatePlugin` block-only API, zero remaining references to the old `InteractionLayer.activeNodeId` string-keyed API; both are replaced by `ActivePlugin` + `InteractableRegistry`
- **CB-v2's nested-CM selection gap is closed** — `RawMdxFallbackCMView` has `selectNode`/`maybeEscape` wired; `view.state.selection` is NOT stale when nested CM has focus (verified by test asserting the `'nested-editor'` kind is active with correct `editorRef`)
- **`useAnchoredPopover` has at least one real consumer** — InternalLink PropPanel positions via Floating UI + ActivePlugin, no longer admitted as a gap
- **Type-safety is locked** — `packages/app/src/editor/active-plugin/types.test-d.ts` exists, contains `@ts-expect-error` lines for (a) BlockId-assigned-to-MarkId brand invariant, (b) extension-kind-not-declared (proves declaration-merging seam intact)
- **Multi-peer seam exists but no multi-peer code ships** — the awareness bridge is a documented extension point, with an awareness payload shape declared in `evidence/`, but NOT implemented
- **Precedents #27-32 (CB-v2) + #24-25 (PR #237) either merge or get replaced** by a single precedent entry covering the 4-primitive foundation (numbering TBD per merge-order question, excluded from this story)

## Invariants

- **Schema is add-only forever (precedent #9 preserved).** `ActivePlugin` state lives in PM PluginState keyed by WeakMap off PM/Y elements; NO changes to node attrs, mark attrs, content expressions, or mark excludes. Every existing mark/node schema is untouched.
- **Typed transaction origins (precedent #1 preserved).** Every write to `ActivePlugin` uses a `LocalTransactionOrigin` object-ref. Origins are identity-matched, not string-matched. Existing origins (`AGENT_WRITE_ORIGIN`, `OBSERVER_SYNC_ORIGIN`, etc.) are unaffected — `ActivePlugin` gets its own origin `ACTIVE_PLUGIN_ORIGIN`.
- **`ActivePlugin` Proxies `state.selection`, never duplicates it.** Text-range state is read from `view.state.selection`; `ActivePlugin` stores only semantic enrichment (kind, id, origin, ancestorChain for blocks). Falsifiable: grep for `{from: number; to: number}` in `ActivePlugin`'s state type — zero hits.
- **Branded IDs prevent same-base-type swaps at compile time.** `MarkId`, `NodeId`, `BridgeId` are distinct Zod-branded types (`.min(1).brand<'...'>()` — loose validation, compile-time-only safety; counter formats `b{N}` and `m{N}` from shipped codebases are accepted). Block variant uses `BridgeId` directly (not a separate `BlockId`) per CB-v2's constructor-enforced invariant `selectedBlockId === ancestorChain[last].bridgeId`. Falsifiable: `.test-d.ts` line `const swapped: Extract<..., {kind:'mark'}> = { kind:'mark', id: bridgeId, ... }` compiles WITHOUT `@ts-expect-error` → brand invariant broken.
- **`ActivePlugin` holds only active-interactable state; editor-wide drag state lives in a separate `DragStatePlugin`.** CB-v2 ships `isDragging` on `BlockSelection` as a structural convenience (blocks are the only drag affordance today) but semantically it's editor-global. Unification separates: `ActivePlugin` = "what's active," `DragStatePlugin` = "is a drag happening in this editor." Consumers that need both query both.
- **`nested-editor` variant is a leaf; no recursive `inner` field** (YAGNI — zero N≥2 nesting cases in OK's product today).
- **Extensibility seam uses `interface`-based declaration merging.** `ActiveInteractableMap` is an `interface`, not a `type`. Falsifiable: `.test-d.ts` line asserting an undeclared extension kind does NOT compile.
- **Local and remote selection stores remain asymmetric** (Track 1's 6/6 ecosystem convergence). `ActivePlugin` is local-only; remote peer presence lives in `RemotePresenceStore` keyed by `peerId` with a DIFFERENT shape. No re-sync from remote → local.
- **Core's DISPATCH switches use `default` to delegate to registry, not `assertNever`.** Core's switches over CORE-OWNED kinds use `assertNever` (standard exhaustiveness). Two switch classes coexist; see `evidence/type-safety-pattern.md` for the reconciliation.
- **Multi-peer primitive is purely additive.** Local 4-primitive architecture does not change when multi-peer ships. Falsifiable: if the ActivePlugin type shape requires any change when the awareness layer is added, the additive invariant is broken.

## Constraints

- **TipTap-family ecosystem.** Stack is TipTap (PM-based). Declaration merging (`interface Commands<ReturnType>`) is TipTap's canonical extensibility pattern — following suit is idiomatic. Constrains: don't invent a different extensibility mechanism (e.g., runtime registries, strategy pattern) when declaration merging is the framework convention.
- **React Compiler is enabled** (per CLAUDE.md). Constrains: no manual `forwardRef`, `memo`, `useMemo`, `useCallback` in the new primitives. Rely on compiler.
- **`verbatimModuleSyntax: true` + strict mode** (per tsconfig). Constrains: all type imports explicitly `import type`; no same-file type+value imports.
- **Precedent #25 bifurcation preserved** (from PR #237). Plain-DOM chips + singleton PropPanel for simple interactables (marks, atom nodes); per-instance React NodeView + IL-registered PropPanel slot for rich NodeViews (RawMdxFallback, JsxComponent). This split IS the right split per the 4-primitive architecture — Primitive 4 (`useAnchoredPopover`) is the singleton-popover consumer; per-instance NodeView popovers remain local.
- **Merge-order independence.** Architecture must make sense whether PR #237 merges first, CB-v2 merges first, or both merge and unification is a third PR. See `evidence/draft-open-questions.md` — sequencing is out of scope for THIS story; architecture must tolerate any order.
- **Performance — ActivePlugin apply must stay O(1) per transaction.** Single-active-value plugin, not per-node/per-mark walk. Track 4 evidence: O(1) active tracking is safe; O(n) doc walks are not (ruled out by `reports/context-bridge-registry-architecture/REPORT.md`). NO microbenchmark yet on PROJECT.md's 768-mark scale — TQ5 in Items table.
- **Multi-peer awareness schema is Y.Awareness compatible.** Wire format must tolerate unknown fields (peers on older clients). This constrains the deferred layer's design but not the local architecture.

## Non-goals

- **[NOT NOW] Multi-peer block halos.** User-confirmed 2026-04-21 not in v1 scope. Local architecture is built to support future retrofit (Pattern B, purely additive, ~400 LoC when we decide to ship). **Revisit trigger:** product decision to ship collaborator presence indicators, OR a customer ask with priority above local-architecture polish. See `evidence/research-multi-peer-selection.md`.
- **[NOT NOW] Hover state primitive (`HoverPlugin`).** Only needed if URL-preview tooltips on link hover become a product UX in v1. Defer the primitive entirely if not. **Revisit trigger:** product decides to ship hover tooltips OR a non-link hover-driven UX lands. Adding HoverPlugin later is purely additive (no architectural disturbance to ActivePlugin). See Q-1 in `evidence/draft-open-questions.md`.
- **[NEVER] Unify local + remote selection into one store.** Track 1's 6/6 ecosystem convergence: local and remote are intentionally DIFFERENT shapes. Pattern A (PM plugin primary + awareness bridge re-syncing back into the plugin) is used by ZERO production editors surveyed. Don't reinvent it.
- **[NEVER] Add attrs to PM schema to carry mark/node/block identity.** Identity lives in PluginState keyed by WeakMap (precedent #9). Schema changes would propagate into every serialization boundary (Y.XmlFragment, markdown, fidelity invariants).
- **[NOT UNLESS] A single unified `interactable-id` DOM attr replacing `data-mark-id`/`data-node-id`/`data-bridge-id`.** Separate attrs match CB-v2 precedent (`data-component-type="callout"`), keep CSS selectors natural, and let InteractableRegistry resolve via ordered attr probes. Unify the attrs only if a concrete resolution ambiguity forces it (none surfaced yet). See Q-5.
- **[NOT NOW] `touch` as a distinct `origin` value.** Pointer Events spec unifies pointer+touch at the API level; distinguishing them at the `Origin` layer adds nothing until mobile UX becomes P0. **Revisit trigger:** mobile UX work begins, OR a touch-specific interaction (long-press, force-touch) enters scope. See Q-3.
- **Technical architecture specification.** This story captures the problem, value, invariants, non-goals, and acceptance criteria. It captures the draft architecture in evidence files as research output — NOT as settled design. The spec phase investigates implementation: file layout, test strategy, migration order, per-primitive API surface.
- **Merge-order sequencing of PR #237 vs CB-v2 vs unification PR.** Out of scope per user directive 2026-04-21. Architecture must tolerate any merge order; who owns which PR is a coordination question, not an architecture question.

## Acceptance criteria

Derived from invariants + goals, written as observable outcomes.

1. **Four primitives exist and are consumed in production:**
   - `packages/app/src/editor/active-plugin/` exists with `ActivePlugin`, `ActiveInteractableMap`, `ActiveInteractable`, narrowing helpers, `.test-d.ts`
   - `packages/app/src/editor/interactable-registry/` exists with `InteractableRegistry`, resolver chain, event-delegation module
   - `packages/app/src/editor/use-anchored-popover.ts` exists, has at least one real consumer
   - Three parallel systems (`SelectionStatePlugin`, `InteractionLayer.activeNodeId`, old ad-hoc patterns) are removed or collapsed into the 4 primitives

2. **Type-safety lock exists and passes:**
   - `packages/app/src/editor/active-plugin/types.test-d.ts` exists
   - Contains at least 2 `@ts-expect-error` lines covering: brand invariant (`BridgeId` ≠ `MarkId`), extensibility seam (undeclared extension kind)
   - Test-d exercises shipped counter-format strings (`MarkId.parse('m1')`, `BridgeId.parse('b1')`) — `.min(1)` brand-only, NOT `.uuid()`
   - `tsc --noEmit` passes with zero errors
   - Deleting the `@ts-expect-error` directives causes the expected compile errors on the expected lines

3. **Nested-editor correctness regression coverage** (inherited from PR #165, not implemented here):
   - PR #165's `RawMdxFallbackCMView` has `selectNode` + `maybeEscape` + arrow-handler wiring (shipped at `ef49b53a`)
   - When a nested CM has focus, `ActivePlugin` reports `kind: 'nested-editor'` with correct `editorRef` (from inherited fix)
   - `view.state.selection` is NOT stale when nested CM has focus (asserted by test)
   - Regression test preserves the `ef49b53a` coverage so a future refactor doesn't regress the invariant

4. **Extensibility is demonstrated:**
   - At least one kind is registered via declaration merging (either a v1 kind in core, or a dogfood kind in tests) showing the pattern works end-to-end
   - A grep for "declare module '@ok/editor'" (or the local equivalent) finds at least one use

5. **Multi-peer seam exists at the PRINCIPLE level, NOT as specific wire format:**
   - Architecture evidence documents Pattern B principle (awareness as source of truth; separate store keyed by peerId; never re-sync remote → local)
   - ZERO multi-peer code ships (no `SelectionAwarenessBridge`, no `RemotePresenceStore`, no remote decoration plugin)
   - Specific wire format (fields, versioning) is DEFERRED to the multi-peer implementation PR — NOT locked in architecture docs
   - Future-work trigger is captured (product decision to ship collaborator presence)

6. **Existing invariants unbroken:**
   - All Tier 1 integration tests pass (bridge-matrix, C1-C10, fidelity I1-I11)
   - All existing Playwright E2E tests pass
   - `bun run check` green; `bun run check:full:parallel` green before final push
   - Zero changes to PM schema (precedent #9); zero changes to typed origin objects already in use

7. **Documentation + precedent reconciliation:**
   - CLAUDE.md gets a new precedent entry (number TBD post-merge-order resolution) describing the 4-primitive foundation + extensibility seam
   - CB-v2's precedents #27-32 and PR #237's #24-25 are either subsumed by the new entry or explicitly preserved with updated cross-references
   - Existing `.test-d.ts` conventions are documented once (reference from CLAUDE.md or PRECEDENTS.md)

## Items

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | Multi-peer halos in v1 scope? | Product | P0 | Decided (Locked) | **NOT in v1.** Architecture preserves seam for future retrofit. Revisit trigger: product decision to ship collaborator presence. User-confirmed 2026-04-21. (evidence/research-multi-peer-selection.md, evidence/draft-architecture-4-primitives.md §Multi-peer layer) |
| PQ2 | Hover state primitive (HoverPlugin) in v1? | Product | P2 | Decided (Directed) | **Build HoverPlugin as a separate primitive IF/WHEN URL-preview-on-hover or similar UX enters scope** — not before. Research finding: every editor that ships hover-preview treats it as a distinct primitive from click/edit popover (Notion smart chips, Figma, Google Docs, Confluence Smart Links, Medium). HTML platform ships `popover="hint"` specifically for this (2024+). Do NOT fold hover into ActivePlugin — ecosystem is unanimous. Direction is clear; implementation triggered by product decision. (reports/editor-popover-lifecycle-patterns/REPORT.md §D1 "Hover-preview universally distinct primitive") |
| PQ3 | Cmd+click-second-chip-without-closing-first UX supported? | Product | P0 | Decided (Locked) | **NOT in v1 scope.** Research finding: ZERO production editors ship multi-popover UX (surveyed 8+ editors including Notion, Figma, Google Docs, Confluence, Medium, Lexical, BlockNote, BlockSuite, Plate.js, TipTap). "Cmd+click opens in new tab, doesn't open second popover" is V2's current behavior (`handlePrimary` hook) and is ecosystem-consistent. Multi-popover is unvalidated territory; no user research, a11y guidance, or library documentation supports it as a pattern. (evidence/internal-v2-popover-investigation.md Q4; reports/editor-popover-lifecycle-patterns/REPORT.md §D1-D2) |
| TQ1 | popover-open state decoupled from ActivePlugin.active? | Technical | P0 | Decided (Directed) | **Ship V2's fused architecture as-is. Document the escape-hatch migration path.** Research finding: V2's externalized-single-slot pattern (`activeNodeId` → render gate) is semantically identical to Plate.js's `openEditorId` — mainstream ecosystem pattern. CB-v2's per-instance `useState` is also mainstream (matches BlockNote + Lexical). BOTH produce single-popover UX. The "one-way door" framing dissolves because multi-popover isn't a real ecosystem UX — if it ever becomes one, the migration is standardized: swap to HTML `popover="manual"`, Floating UI `FloatingTree`, or Ariakit `usePopoverStore`. Migration cost revised from ~100+ LoC to ~270 LoC if needed (evidence/internal-v2-popover-investigation.md Q6), but probability of needing it is low given ecosystem convergence. Hover-preview (if ever in scope) uses its own `HoverPlugin` primitive — universal ecosystem pattern per reports/editor-popover-lifecycle-patterns/REPORT.md §D1 + HTML `popover="hint"`. (evidence/internal-cb-v2-popover-investigation.md; evidence/internal-v2-popover-investigation.md; reports/editor-popover-lifecycle-patterns/REPORT.md) |
| TQ2 | Event delegation precedence: attribute-order vs innermost-structural | Technical | P2 | Assumed | Lean: attribute-order with documented precedence (mark > node > bridge). O(1) per event vs innermost-structural's O(resolvers × depth). Confidence: Medium. Verify by: smoke-test with a mark inside a block to confirm expected winner. Reversible. (evidence/draft-open-questions.md Q-5) |
| TQ3 | nested-editor.editorRef lifecycle: WeakRef vs explicit dispose callback | Technical | P2 | Assumed | Lean: explicit dispose (matches precedent #25 cache eviction discipline). Confidence: Medium. Verify by: implement nested-CM unmount test that asserts entry cleared from ActivePlugin. (evidence/draft-open-questions.md Q-4) |
| TQ4 | Origin taxonomy: add 'touch' and 'drag' now? | Technical | P2 | Decided (Directed) | Keep 3 core origins (`pointer` \| `keyboard` \| `programmatic`). `touch` subsumed in `pointer` until mobile P0. Drag state is NOT on ActivePlugin at all — extracted to sibling `DragStatePlugin` per TQ9 (editor-scoped, not active-scoped). (evidence/draft-architecture-4-primitives.md) |
| TQ5 | ActivePlugin.apply performance at 768-mark scale (PROJECT.md) | Technical | P0 | Assumed | **Claim:** O(1) active tracking is safe per Track 4 + context-bridge-registry report. Confidence: Medium — ruled in by theory, not empirically measured. Verify by: microbenchmark `ActivePlugin.apply` on PROJECT.md cold-pool-warm before production ship. (evidence/research-pm-state-selection-composition.md) |
| TQ6 | Brand ID runtime shape — `.uuid()` vs `.min(1)` vs pure type-level | Technical | P0 | Decided (Directed) | **Drop `.uuid()`. Use `z.string().min(1).brand<'...'>()` — loose validation, preserves all compile-time properties.** Verified both shipped codebases use counter formats: CB-v2 `b${counter}` at `bridge-id-plugin.ts:138,144,182,200`; #237 `m${counter}` at `mark-identity.ts:45,159`. `.uuid()` would throw on `parse('b1')`. Cross-workspace `$brand` unification remains MEDIUM-confidence — verify via `.test-d.ts` before cross-package brand usage. (evidence/type-safety-pattern.md) |
| TQ7 | ActivePlugin's relationship to PM undo/redo | Technical | P2 | Parked | Lean: active-state changes are NOT part of undo history (matches PM's native selection semantics — `tr.setMeta` changes aren't undo-tracked by default). Revisit: if a consumer requests undo-composable selection changes. |
| TQ8 | Multi-peer wire schema specifics | Technical | P2 | Decided (Directed) | **Document Pattern B PRINCIPLE only** (awareness as source of truth; separate store; never re-sync into local). Do NOT document specific wire format in architecture docs — premature specification is a known anti-pattern. Wire format (`v`, `cursor`, `active` fields) decided when multi-peer ships; implementation PR owns the contract. (evidence/research-multi-peer-selection.md) |
| XQ1 | Declaration-merging pattern unverified via `tsc --noEmit` | Cross-cutting | P0 | Assumed | **Type-safety skill's validation loop says `tsc --noEmit` is non-optional.** Drafted pattern in `evidence/type-safety-pattern.md` is NOT yet compiled. Confidence: High that it works (TipTap precedent), but MUST verify before ActivePlugin work starts. Verify by: scratch `.ts` file exercising `ActiveInteractableMap` + declaration-merged extension + branded narrowing, run `bun run --filter=@inkeep/open-knowledge-app tsc --noEmit`. (evidence/type-safety-pattern.md §Gaps) |
| XQ2 | CB-v2's nested-CM selection correctness gap (RawMdxFallbackCMView) | Cross-cutting | P0 | Decided (Locked) | **Already shipped in #165 at commit `ef49b53a` (2026-04-21)** — *"fix(raw-mdx-fallback): complete canonical PM+CM selection coordination"* by Nick. Four pieces delivered: CM→PM focus sync, PM→CM selection sync, arrow-at-boundary escape, `updatingRef` feedback-loop guard. Verified via `git show ef49b53a` + grep of `updatingRef` (20+ occurrences across RawMdxFallbackCMView.tsx:94-387). Unification PR INHERITS this — no implementation needed. Prior "~50 LoC fix" framing was based on pre-fix research. (evidence/internal-cb-v2-popover-investigation.md) |
| XQ3 | Precedent numbering collision across 3 branches | Cross-cutting | P2 | Parked | Mechanical merge-mechanics problem. #237 has #24-25; CB-v2 has #24-32; main has 23. Whoever merges second renumbers. Out of this story's scope per user directive. Will be resolved in whichever PR rebases second. (evidence/current-state-three-parallel-systems.md §Precedent collision) |
| XQ4 | First real consumer for `useAnchoredPopover` | Cross-cutting | P0 | Decided (Locked) | **InternalLink PropPanel.** Already admitted as a v1 positioning gap in PR #237's ship-summary. CB-v2's deletion rationale explicitly names link-editor as the likely first consumer. Consumer identified → extraction happens in this story's spec phase. (evidence/current-state-three-parallel-systems.md §What got deleted) |
| XQ5 | Precedent #25 bifurcation preserved? | Cross-cutting | P0 | Decided (Locked) | **YES — preserved.** Plain-DOM chips + singleton PropPanel for simple interactables (marks, atoms); per-instance React NodeView + IL-registered PropPanel slot for rich NodeViews. The split IS the right split for the 4 primitives. Primitive 4 is the singleton path; per-instance NodeView popovers remain local state (not in ActivePlugin). |
| TQ9 | Extract `isDragging` to `DragStatePlugin` (not on ActivePlugin) | Technical | P0 | Decided (Directed) | **`isDragging` is editor-scoped state, not active-interactable state.** CB-v2 sets/clears via HTML5 drag events on `view.dom` (editor-global). Placing on `BlockSelection` conflates "what's active" with "is a drag happening." Unification extracts to sibling `DragStatePlugin`. ActivePlugin stays purely about active interactables. ~20 LoC of refactor during unification (relocate set/clear logic, update 1-2 consumers + CSS). (reports/editor-popover-lifecycle-patterns/REPORT.md adjacent; architecture evidence) |
| TQ10 | `nested-editor.inner` recursive field | Technical | P2 | Decided (Directed) | **DROP.** YAGNI — OK has zero N≥2 nested-editor cases today (CM-in-PM is N=1; nested JsxComponents are blocks-in-blocks, not editors-in-editors). Lexical's recursive `_parentEditor` pattern is over-engineering for OK's product. Variant shape: `{ kind: 'nested-editor'; editorRef: EditorRef }`. Add `inner` only if N≥2 becomes real. |
| TQ11 | `handlePrimary` architectural treatment | Technical | P0 | Decided (Locked) | **Field on registration API, NOT Primitive 5.** Verified at `interaction-layer.tsx:122`: `handlePrimary` is a field on `RegisterParams` alongside `controls`. Architecturally: every chip/interactable registers with `{kind, id, controls, handlePrimary}`; handlePrimary fires BEFORE ActivePlugin dispatch for Cmd+click/middle-click/keyboard universal-link semantics. Not elevated to primitive — 4 primitives, not 5. (evidence/internal-v2-popover-investigation.md Q4) |
| TQ12 | `InteractableControls` extensibility posture | Technical | P0 | Decided (Locked) | **Pre-declared interface with known optional fields** (`propPanel?`, `toolbar?`, `breadcrumb?`) — NOT extension-merged via declaration merging. UI slots are a closed set; OK doesn't publish a third-party extension ecosystem that adds new slots. Asymmetry is correct: `ActiveInteractableMap` (kinds) is extension-merged because kinds are open; `InteractableControls` (slots) stays pre-declared because slots are closed. Verified shape at `interaction-layer.tsx:84-97`. (evidence/internal-v2-popover-investigation.md) |
| TQ13 | `data-ok-layer-spawned` + focus-restoration invariants (scoped) | Cross-cutting | P0 | Decided (Locked) | **Required for singleton-PropPanel + useAnchoredPopover consumers.** Not universal — Radix handles both invariants automatically for per-instance Radix popovers. `data-ok-layer-spawned`: dialogs spawned from inside active popover must carry this attr; outside-click detection checks via `closest('[data-ok-layer-spawned]')`. Focus restoration: singleton plane detaches trigger from PropPanel location, so custom `lastActivator` + `isPotentialChipElement(el, nodeId)` verification is required for WCAG 2.4.3. Scope documented in architecture; do NOT apply to Radix Popover-hosted PropPanels (CB-v2's JsxComponent). (evidence/internal-v2-popover-investigation.md) |
| XQ6 | T1 scope trim: delete `RawMdxFallbackPropPanel.tsx` in #237 | Cross-cutting | P0 | Decided (Directed) | **Trim #237's popover-nested CM6 editor in the RawMdxFallback scope.** Evidence: CB-v2's shipped `RawMdxFallbackCMView` inline-nested pattern is architecturally stronger (precedent #26 — "all user content visible and editable in place"); both PRs use disjoint CM6 setup (no shared `createNestedCMExtensions` factory as FR7 aspired). #237's popover-CM6 is ~250 LoC of transitional scope that would ship-then-delete in unification. T1 plan: revise US-006 AC to "chip + `handlePrimary` → source-mode toggle via RAW_MDX_NAV_EVENT"; delete `RawMdxFallbackPropPanel.tsx` (264 LoC) + co-located tests (~64 LoC); simplify `raw-mdx-fallback.tsx` NodeView. Editing-gap window (pre-CB-v2 users click → source mode instead of in-popover CM6) is equivalent to pre-#237 behavior — no regression from today's main. (evidence/t1-trim-plan.md) |
| PQ5 | RawMdxFallback final implementation: popover-nested vs inline-nested | Product | P0 | Decided (Locked) | **Converge on inline-nested** (CB-v2's `RawMdxFallbackCMView` with `ef49b53a` fix). Matches precedent #26 (all user content visible + editable in place). #237's popover-nested (US-006 as shipped) is transitional — trimmed per XQ6. Final state: user clicks raw MDX → block becomes editable CM6 in place → arrow-boundary escape to outer PM doc. No popover-CM6 UX in v1. Architecture's `kind: 'nested-editor'` type is agnostic to host location, but final-state implementation is inline only. |

## Context

- **Traces to:** V2 editor cache + cold-load UX sprint (`specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/`) + CB-v2 component blocks v2 (`specs/2026-04-14-component-blocks-v2/`) + block-selection-indicator (`specs/2026-04-16-block-selection-indicator/`). None of these specs "own" the unification — this story is the first framing of the unification as a first-class concern.
- **Lateral:**
  - PR #237 (V2 editor cache) — ships InteractionLayer in current (pre-unification) shape; this story's work either overlaps with it or comes after
  - PR #165 (CB-v2) — ships SelectionStatePlugin in current (pre-unification) shape; same overlap consideration
  - Open question XQ3 (precedent numbering) is the only direct lateral coupling
- **Forward:** Multi-peer presence (future `SelectionAwarenessBridge` + `RemotePresenceStore` + decoration plugin); hover UX (future `HoverPlugin` as sibling to `ActivePlugin`); agent-driven programmatic selection (already expressible via `origin: 'programmatic'`); mobile/touch UX (adds `'touch'` origin); custom user components (CB-v2 NG13 — descriptor-registered components get `kind: 'block'` automatically via the existing pattern).

## Evidence & References

### Evidence Files

- [evidence/current-state-three-parallel-systems.md](evidence/current-state-three-parallel-systems.md) — Factual snapshot of Systems A (CB-v2), B (V2 InteractionLayer), C (PM native state.selection) as of 2026-04-21. Precedent numbering collision table. CB-v2 same-day deletion of `useSelectionAnchoredPopover` (commit `eaeeb291`) with author's greenfield rationale quoted.
- [evidence/draft-architecture-4-primitives.md](evidence/draft-architecture-4-primitives.md) — The 4-primitive synthesis + multi-peer deferred layer sketch + absorption map (3 parallel systems → 4 primitives) + LoC estimate (~880 local, ~400 deferred).
- [evidence/type-safety-pattern.md](evidence/type-safety-pattern.md) — Declaration-merged `ActiveInteractableMap` + branded IDs (Zod `.brand()`) + `.test-d.ts` lock + `assertNever` reconciliation for switch dispatch vs registry dispatch + TipTap `Commands<ReturnType>` precedent.
- [evidence/draft-open-questions.md](evidence/draft-open-questions.md) — 5 open questions (Q-1 to Q-5) with evidence-backed leans, one-way-door analysis, priority rationale. Q-2 (popover-open decoupling) is the only load-bearing one.
- [evidence/research-multi-peer-selection.md](evidence/research-multi-peer-selection.md) — Track 1 research brief (26K chars). 7 editors surveyed; 4/6 use Pattern B (pure Y.Awareness field); 0/6 use Pattern A (PM plugin + awareness bridge). OK's bridgeId pattern means block-halos are architecturally feasible (unlike vanilla TipTap).
- [evidence/research-nested-editor-selection.md](evidence/research-nested-editor-selection.md) — Track 2 research brief (25.8K chars). CB-v2 is accidentally Option 3 (split ownership) with a latent correctness gap. Lexical's `_parentEditor` + `$isEditorIsNestedEditor` + `SELECTION_CHANGE_COMMAND` pattern ships in production — Option 2 proven.
- [evidence/research-discriminated-plugin-state.md](evidence/research-discriminated-plugin-state.md) — Track 3 research brief (22.6K chars). 4-kind unions are fine with narrowing helpers. Origin hoisted to base type. All surveyed editors chose open extensibility (class hierarchy); our declaration-merging choice is a refinement on TypeScript's native extensibility (TipTap precedent).
- [evidence/research-pm-state-selection-composition.md](evidence/research-pm-state-selection-composition.md) — Track 4 research brief (15K chars). Proxy pattern (read `state.selection`, don't duplicate `{from,to}`) is 3-for-3 convergent across CB-v2, y-prosemirror, TipTap core.
- [evidence/internal-cb-v2-popover-investigation.md](evidence/internal-cb-v2-popover-investigation.md) — 1P code investigation of PR #165's JsxComponentView + SelectionStatePlugin; finds CB-v2 is de-facto SPLIT at code level (per-instance `useState`); multi-popover technically possible but emergently prevented by Radix defaults + PM single-selection.
- [evidence/internal-v2-popover-investigation.md](evidence/internal-v2-popover-investigation.md) — 1P code investigation of our V2 InteractionLayer; FULLY FUSED at architecture level (1:1 render gate at `interaction-layer.tsx:318`); 4 open paths + 4 close paths all through `store.setActiveNode(...)`; migration cost to split quantified at ~270 LoC across 6 files.
- [evidence/t1-trim-plan.md](evidence/t1-trim-plan.md) — Specific scope trim for PR #237: delete `RawMdxFallbackPropPanel` (264 LoC) + tests (~64 LoC); simplify `raw-mdx-fallback.tsx` NodeView; revise US-006 AC. Preserves source-mode navigation via `handlePrimary`. Avoids ~328 LoC of ship-then-delete throwaway. Feeds Items table XQ6 + PQ5.
- [evidence/merge-plan-option-e.md](evidence/merge-plan-option-e.md) — Validated merge topology: #237 (T1-trimmed) → #165 (rebased) → unification PR. Zero throwaway between PRs. Decision trail from adversarial 1P code reviews of both worktrees.

### Research Reports (generated during this story's research phase)

- [reports/editor-popover-lifecycle-patterns/REPORT.md](../../reports/editor-popover-lifecycle-patterns/REPORT.md) — 3P factual synthesis commissioned to inform PQ3/TQ1 (popover-open decoupling). Surveys 8+ editors, 4 design-system primitives, WAI-ARIA, HTML Popover spec. Finds: multi-popover UX is ecosystem-absent; fused-as-default with standardized escape hatches (`popover="manual"`, `FloatingTree`, `usePopoverStore`) if migration is ever needed. Cross-referenced from PQ3 + TQ1 + PQ2 in Items table.

### Research Reports (prior art, pre-this-story)

- [reports/block-selection-indicator-patterns/REPORT.md](../../reports/block-selection-indicator-patterns/REPORT.md) — 13-editor survey that seeded CB-v2's SelectionStatePlugin; Gutenberg-class subtype pattern; "no surveyed editor uses `:has()`"
- [reports/context-bridge-registry-architecture/REPORT.md](../../reports/context-bridge-registry-architecture/REPORT.md) — 7 architectures for TipTap NodeView context propagation; ranks PM PluginState as #3 due to O(n) doc-walk concern (not applicable to single-active-value ActivePlugin — see Constraints)
- [reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md](../../reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md) — CB-v2 architectural state at PR #168 merge point
- [reports/cm-in-pm-nested-editor-architecture/REPORT.md](../../reports/cm-in-pm-nested-editor-architecture/REPORT.md) — Nested editor focus discipline; §13.1 explicitly out-of-scope for per-block collaborative cursors (gap Track 2 filled)

### Code Repositories (ecosystem reference — read-only)

- [facebook/lexical](https://github.com/facebook/lexical) — `_parentEditor` / `$isEditorIsNestedEditor` / `SELECTION_CHANGE_COMMAND` / `useLexicalNodeSelection` patterns
- [toeverything/blocksuite](https://github.com/toeverything/blocksuite) — SelectionManager with stable semantic IDs + multi-peer block halos (ships what we deferred)
- [yjs/y-prosemirror](https://github.com/yjs/y-prosemirror) — `yCursorPlugin` reading state.selection on every view update (Track 4 Proxy reference)
- [ianstormtaylor/slate](https://github.com/ianstormtaylor/slate) / [ianstormtaylor/slate-yjs](https://github.com/ianstormtaylor/slate-yjs) — Pattern B awareness convergence (Track 1 evidence)
- [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) — `interface Commands<ReturnType>` declaration-merging pattern (type-safety reference)

### External Sources

- [TypeScript Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) — the language feature backing the extensibility seam
- [ProseMirror state reference](https://prosemirror.net/docs/ref/) — PluginState + selection semantics
- [Floating UI](https://floating-ui.com/) — `useAnchoredPopover` dependency

### Upstream Artifacts

- `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md` — V2 editor cache spec (InteractionLayer lives here in current shape)
- `specs/2026-04-14-component-blocks-v2/SPEC.md` — CB-v2 spec (SelectionStatePlugin descends from here)
- `specs/2026-04-16-block-selection-indicator/SPEC.md` — #168 spec that defined the block-only SelectionStatePlugin shape
- `tmp/ok-arch-research/` (transient /tmp — copied into this story's evidence/) — the 4 nested-Claude research tracks
