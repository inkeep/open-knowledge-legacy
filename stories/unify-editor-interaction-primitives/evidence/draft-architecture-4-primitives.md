---
title: "Draft architecture — 4 primitives for unified editor interaction"
type: synthesis
created: 2026-04-21
---

## TLDR

Four composable primitives replace the three parallel systems (`current-state-three-parallel-systems.md`). Primitive 1 (`ActivePlugin`) tracks semantic "what's active." Primitive 2 (`InteractableRegistry`) handles event delegation + DOM→ID resolution. Primitive 3 (narrowing helpers) keeps ergonomics from becoming 4-branch switch statements. Primitive 4 (`useAnchoredPopover`) is the Floating UI consumer for selection-anchored UI. Multi-peer presence is a separate, deferred layer (three more primitives) that sits on top without touching the local architecture.

This is a DRAFT — five open questions (see `draft-open-questions.md` / STORY.md Items table) must resolve before the spec phase starts.

## How the research grounds each primitive

| Primitive | Research anchor | Finding that shaped it |
|---|---|---|
| 1. ActivePlugin | [research-pm-state-selection-composition.md](research-pm-state-selection-composition.md) + [research-nested-editor-selection.md](research-nested-editor-selection.md) | Proxy state.selection (no text-range duplication); 4 kinds not 5; recursive `nested-editor` via `inner` matches Lexical's proven pattern |
| 2. InteractableRegistry | V2's InteractionLayer event-delegation code (~60% reusable) + CB-v2's data-attr precedent | Delegation at editor root; stateless; dispatches to ActivePlugin via `tr.setMeta` |
| 3. Narrowing helpers | [research-discriminated-plugin-state.md](research-discriminated-plugin-state.md) | No editor uses 4-branch switches; Lexical + BlockSuite ship predicates + scalar hooks; 4-kind unions are fine with the right ergonomics |
| 4. useAnchoredPopover | CB-v2's deleted `useSelectionAnchoredPopover` hook | Was correct shape; deletion was a scope choice, not an architecture choice; restore with new consumer (ActivePlugin) |
| Multi-peer layer (deferred) | [research-multi-peer-selection.md](research-multi-peer-selection.md) | 6/6 production editors use Pattern B (awareness as source of truth, separate from local state); never re-sync back into a plugin |

## Primitive 1 — `ActivePlugin`

PM PluginState for "what interactable thing is currently active." Transaction-scoped. Composable with undo (if desired). One source of truth for every local consumer.

```ts
type Origin = 'pointer' | 'keyboard' | 'programmatic';
type ActiveBase = { origin: Origin };

// ↓ The extensibility seam. Extensions augment this via declare module.
interface ActiveInteractableMap {
  mark:            { id: MarkId;   markType: string };
  node:            { id: NodeId;   pos: number };
  block:           { id: BridgeId; ancestorChain: Ancestor[] };
  'nested-editor': { editorRef: EditorRef };
}

type ActiveKind = keyof ActiveInteractableMap;

type ActiveInteractable = {
  [K in ActiveKind]: { kind: K } & ActiveBase & ActiveInteractableMap[K]
}[ActiveKind] | null;

// Branded IDs — loose runtime validation; compile-time-only safety.
// Shipped counter formats: `b${n}` (CB-v2 bridge-id-plugin.ts:138), `m${n}` (#237 mark-identity.ts:159).
// Do NOT use `.uuid()` — contradicts shipped runtime shapes.
const MarkId   = z.string().min(1).brand<'MarkId'>();
const NodeId   = z.string().min(1).brand<'NodeId'>();
const BridgeId = z.string().min(1).brand<'BridgeId'>();
type MarkId    = z.infer<typeof MarkId>;
type NodeId    = z.infer<typeof NodeId>;
type BridgeId  = z.infer<typeof BridgeId>;
```

**Key refinements from research + adversarial validation:**
- **NO `text-range` kind** (Track 4 Proxy pattern): state.selection already models it; consumers read `view.state.selection` when they care. Avoids double-bookkeeping.
- **`origin` hoisted to base** (Track 3): shared-field placement matches Lexical + BlockSuite.
- **`nested-editor` is a LEAF** — no recursive `inner` field. YAGNI: OK has zero N≥2 nested-editor cases; Lexical's recursion is over-engineering for OK's product. Add `inner` only when a real recursive case materializes.
- **Block variant uses `BridgeId` directly** (not a separate `BlockId`): CB-v2 ships a constructor-enforced invariant `selectedBlockId === ancestorChain[last].bridgeId` — one identity, not two.
- **`isDragging` extracted to sibling `DragStatePlugin`** — editor-scoped, not active-interactable-scoped. See "Primitive 0" below.
- **Branded IDs with `.min(1)`**, not `.uuid()` — shipped counter formats (`b{N}`, `m{N}`) would throw on `.uuid().parse()`. Loose runtime validation, full compile-time safety.

## Primitive 1b — `DragStatePlugin` (sibling to ActivePlugin)

Editor-scoped drag state. Separate from ActivePlugin because "is a drag happening in this editor" is orthogonal to "what interactable is active."

```ts
interface DragState {
  isDragging: boolean;
}

// PM PluginState; updated by capture-phase dragstart/dragend/drop listeners
// on view.dom. Consumers that need BOTH active state and drag state query
// both plugins — no conflation.
```

CB-v2 ships `isDragging` on `BlockSelection` as a structural convenience (blocks are the only draggable thing today). Unification separates the concerns: active-ness and drag-ness are different editor states.

**Consumers of drag state today:** CSS `[data-dragging]` attribute on editor root, drop-suppression logic in DnD integration. Unification rewires these to read from `DragStatePlugin` instead of `SelectionStatePlugin.BlockSelection.isDragging`.

## Primitive 2 — `InteractableRegistry`

DOM-coupled, one per editor. Capture-phase listeners on `editor.view.dom`. Resolves DOM targets to kind+id handles. **Writes transaction meta-keys; does NOT own state interpretation.**

```ts
interface InteractableRegistry {
  register(handle: InteractableHandle): void;
  deregister(id: string): void;
  resolveFromTarget(target: EventTarget): { kind: ActiveKind; id: string } | null;
  registerResolver(r: { kind: ActiveKind; attr: string; priority: number }): void;
}

interface InteractableHandle {
  kind: ActiveKind;
  id: string;
  controls: InteractableControls;     // Rendering (pre-declared interface, known optional fields)
  handlePrimary?: PrimaryHook;         // Per-registration field — fires BEFORE ActivePlugin dispatch
                                       // for Cmd+click/middle-click/keyboard universal-link semantics
}
```

- Resolver chain: `closest('[data-mark-id]')` || `closest('[data-node-id]')` || `closest('[data-bridge-id]')` with documented precedence (attribute-order).
- On DOM events (pointerdown/click/auxclick/keydown), dispatches origin via `tr.setMeta(SELECTION_ORIGIN_META_KEY, 'pointer'|'keyboard'|'programmatic')`.
- **Does NOT own `pendingOrigin` classification logic** — that stays in `ActivePlugin.apply` where CB-v2 tuned foreign-transaction-safety (`metaOrigin > pendingOrigin > prev.origin` precedence; prevents y-prosemirror remote-sync transactions from consuming pendingOrigin inappropriately). Registry WRITES meta-keys; plugin INTERPRETS them.

### `InteractableControls` — pre-declared, not extension-merged

```ts
interface InteractableControls {
  popover?: (ctx: InteractableContext) => React.ReactNode;
  toolbar?: (ctx: InteractableContext) => React.ReactNode;    // Reserved for CB-v2 JsxComponentView
  breadcrumb?: (ctx: InteractableContext) => React.ReactNode; // Reserved for CB-v2
}
```

UI slots are a **closed set** — propPanel, toolbar, breadcrumb, maybe 1-2 more in future. Pre-declared optional fields with known names. Extensions add new slots via interface-version bump (breaking change acceptable for UI-slot additions at unification-PR scope), NOT via declaration-merging.

This is deliberately asymmetric with `ActiveInteractableMap` (kinds are OPEN — extensions add new kinds via `declare module`). Kinds differ by product scope; UI slots differ by architectural constraint — rare enough to not need extension-merging overhead.

### `handlePrimary` — per-registration field, not a separate primitive

```ts
type PrimaryHook = (ctx: InteractablePrimaryContext) => boolean | undefined;
interface InteractablePrimaryContext {
  kind: ActiveKind;
  id: string;
  newTab: boolean;  // true when Cmd/Ctrl/middle-click — chip wants universal-link semantics
}
```

Handler fires BEFORE ActivePlugin's `tr.setMeta` dispatch. Returning `true` means "handled — suppress default PropPanel open"; returning `false`/`undefined` falls through to `setActive`.

**Why not "Primitive 5":** handlePrimary is a FIELD per-registration, not an independent architectural concept. It's behavior attached to a specific interactable. Same architectural weight as `controls` (both are fields on `InteractableHandle`). Keeping the primitive count at 4 — ActivePlugin, InteractableRegistry, narrowing helpers, useAnchoredPopover — with DragStatePlugin as sibling-of-1 and handlePrimary as field-of-2.

## Primitive 3 — Narrowing helpers

```ts
// Type-predicate style (Lexical pattern)
export const isMarkActive = (a: ActiveInteractable): a is Extract<ActiveInteractable, {kind: 'mark'}>  => a?.kind === 'mark';
export const isBlockActive = (a: ActiveInteractable): a is Extract<ActiveInteractable, {kind: 'block'}> => a?.kind === 'block';

// Scalar-hook style (Lexical `useLexicalNodeSelection` pattern)
export function useActiveBlock(): Extract<ActiveInteractable, {kind: 'block'}> | null;
export function useActiveMark():  Extract<ActiveInteractable, {kind: 'mark'}>  | null;
```

Consumers rarely write 4-branch switches; predicates + scalar hooks cover ~95% of sites. Where a switch IS needed, use `assertNever(x)` — but ONLY inside code that owns the closed union (core package). Code that dispatches to extensions uses a `default` branch that delegates to the registry (see `type-safety-pattern.md` for the reconciliation).

## Primitive 4 — `useAnchoredPopover`

Floating UI hook. One hook, many consumers (link PropPanel, image caption, multi-peer halo, hover tooltips, first-comment popup, collaborator presence dot).

```ts
function useAnchoredPopover(opts: {
  anchor: 'active' | { kind: ActiveKind; id: string };
  placement: Placement;
  strategy?: 'fixed' | 'absolute';
}): { refs, floatingStyles, isOpen };
```

- `anchor: 'active'` tracks whatever ActivePlugin says is active — seamlessly follows mark → node → block transitions.
- Floating UI virtual element backed by the active interactable's DOM rect (resolved via InteractableRegistry lazily).

## Multi-peer layer (DEFERRED — principle only, NOT wire format)

Not in v1 scope per user direction (2026-04-21).

**The principle** (Track 1's 6/6 ecosystem convergence — see `research-multi-peer-selection.md`):

- Local selection stays in native editor state (`state.selection` + `ActivePlugin`).
- Awareness IS the source of truth for remote peers — write-only bridge from local → awareness; never re-sync awareness back into local plugin state.
- Local and remote stores have DIFFERENT shapes by design. Remote presence keyed by `peerId`, materialized into a `RemotePresenceStore` that the decoration plugin reads.

**What's NOT documented here:** specific wire format (field names, version key, payload structure). Documenting a wire contract before the first consumer knows what it needs is a known anti-pattern — the implementation PR owns the schema when it lands.

```
[FUTURE — when multi-peer ships]

  state.selection (PM native) ──┐
                                 ├──► SelectionAwarenessBridge (write-only) ──► Y.Awareness
  ActivePlugin (semantic)       ─┘                                                 │
  DragStatePlugin                                                                  ▼
                                                              RemotePresenceStore
                                                              (keyed by peerId; separate shape)
                                                                                   │
                                                                                   ▼
                                                        remotePresenceDecorationPlugin
                                                        (cursors + halos via PM decorations)
```

**Estimated incremental work when/if multi-peer ships:** ~400 LoC (bridge + store + decoration plugin + CSS variants). Purely additive. The 4 local primitives don't change.

## How this absorbs the 3 parallel systems

| System (today) | Becomes (unified) |
|---|---|
| CB-v2's `SelectionStatePlugin` (block-only) | `ActivePlugin` with `kind: 'block'` variant (what ships in CB-v2 today is one of four kinds in the new shape) |
| V2's `InteractionLayer.activeNodeId` | Collapses into `ActivePlugin` (state) + `InteractableRegistry` (events) split |
| V2's InteractionLayer event delegation + singleton plane | Stays — `InteractableRegistry` (events) + `useAnchoredPopover` (plane) |
| CB-v2's `data-*` attrs on JsxComponent wrappers | Stays; extended with `data-mark-id` / `data-node-id` that `InteractableRegistry.resolve` handles uniformly |
| CB-v2's nested-CM for rawMdxFallback (shipped at `ef49b53a` with PM/CM selection coordination) | Already correct — unification inherits. Gains `kind: 'nested-editor'` type variant wrapping the existing `editorRef`. No implementation work in unification PR. |
| #237's RawMdxFallback popover-CM6 (US-006 as shipped) | **Trimmed in #237 before merge (T1 plan)** — converges on CB-v2's inline-nested pattern. No dual-implementation in final state. |
| Deleted `useSelectionAnchoredPopover` | Restored with new contract — consumes `ActivePlugin`, positions via Floating UI |
| CB-v2's `BlockSelection.isDragging` | Extracted to sibling `DragStatePlugin` — editor-scoped state, not conflated with ActivePlugin. |
| Multi-peer block-halos (NG on CB-v2) | Deferred; future `SelectionAwarenessBridge` + `RemotePresenceStore` + decoration plugin (shape defined then, not now). |

## Total incremental work

- New: `ActivePlugin` kind-polymorphic + branded IDs + `.test-d.ts` lock — ~300 LoC
- New: `InteractableRegistry` (extracted from V2) — ~200 LoC
- New: `useAnchoredPopover` (restored from CB-v2's deletion) — ~150 LoC
- New: narrowing helpers + scalar hooks — ~80 LoC
- Modify: CB-v2 nested CM selection composition — ~50 LoC
- Modify: V2 InteractionLayer → InteractableRegistry split — ~100 LoC refactor
- **Local architecture subtotal: ~880 LoC**
- Deferred: Multi-peer layer — ~400 LoC

Most of the "new" work is actually rearrangement — ~1000 LoC of current parallel-system code already implements the four primitives' shapes, just assembled differently.

## Dependencies on open questions

The exact shape of the 4 primitives depends on Q-1 through Q-5 in STORY.md. The load-bearing one is Q-2 (popover-open decoupled from selected — one-way door if deferred). The others can ship either way.

## Pointers

- Research briefs: `research-multi-peer-selection.md`, `research-nested-editor-selection.md`, `research-discriminated-plugin-state.md`, `research-pm-state-selection-composition.md`
- Type-safety pattern details: `type-safety-pattern.md`
- Current-state snapshot: `current-state-three-parallel-systems.md`
- Ecosystem references: Lexical `_parentEditor` / `$isEditorIsNestedEditor`, BlockSuite's SelectionManager, y-prosemirror's `yCursorPlugin`, TipTap's `Commands<ReturnType>` declaration merging pattern

## Gaps / follow-ups

- The architecture is not validated by a working prototype. The research is indirect (prior art + ecosystem convention). First concrete implementation will surface gaps the research didn't predict.
- No performance microbenchmark for `ActivePlugin.apply()` with 768 marks on PROJECT.md. Track 4 argues O(1) active tracking is safe but it's not measured.
- The `nested-editor.editorRef` lifecycle contract (explicit deactivate callback vs WeakRef) needs a concrete design before spec starts — see Q-4.
