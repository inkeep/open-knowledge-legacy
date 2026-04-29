# SPEC: Block-Level Selection-Indicator Architecture

**Status:** Draft
**Created:** 2026-04-16
**Baseline commit:** 041603c
**Stacks on:** PR #165 (`worktree-component-blocks-v2`)
**Implementer:** AI coding agent (Claude Code) — greenfield, autonomous
**Location:** `packages/app/src/editor/` + `packages/app/src/components/editor/`
**Nature:** Architectural primitive build. Establishes the **selection layer** of the Component Blocks editor — the single source of truth for "what block is selected," how it's visually indicated, how it's announced to AT, and how selection-anchored UI (toolbars, popovers, breadcrumb) gets positioned. Replaces the current `.is-selected` class + `box-shadow` ring that is broken across three orthogonal dimensions: forced-colors compatibility (invisible in Windows High Contrast Mode), nested selection (stacks outlines on every selected ancestor), and composability (single-axis boolean that doesn't express mouse vs keyboard, dragging, needs-config, or parent-contains-selected state).

**Pace:** Methodical. This sets durable precedents (#15–#20) for every future selection-adjacent surface — link editor, image caption, multi-select, collaborator presence, breadcrumb, focus mode. The iteration loop for the bridge (observers A/B) took months to stabilize; selection UX must not accumulate the same decades-of-editor-history debt. Pick the architecturally-correct patterns now.

**Evidence basis:** [`reports/block-selection-indicator-patterns/`](../../reports/block-selection-indicator-patterns/REPORT.md) — 13-editor survey, 16 CSS techniques, WCAG 2.1/2.2 + ARIA + forced-colors normative floor, transition-timing conventions, nested + multi-block patterns, separate-layer rendering analysis.

---

## 1. Problem Statement (SCR)

### Situation

Component Blocks v2 (PR #165) ships descriptor-dispatched rendering of 18 fumadocs-ui components (Callout, Card, Steps, Tabs, Accordions, Files, ImageZoom, TypeTable, …) inside the TipTap editor. The `JsxComponentView` NodeView emits a wrapper (`div.jsx-component-wrapper`) with a permanent hover-chrome bar (up/down/gear/delete). Block selection is expressed exactly once, as a className toggle at `JsxComponentView.tsx:257` — `${selected ? 'is-selected' : ''}` — driven by TipTap's `NodeSelection` via the `selected` NodeView prop. One CSS rule at `globals.css:1064` paints the visual:

```css
.ProseMirror .jsx-component-wrapper.is-selected {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 40%, transparent);
}
```

### Complication

The current ring is **architecturally broken across three dimensions**, each traceable to a concrete correctness gap, not an aesthetic preference:

| Dimension | Gap | Blast radius |
|---|---|---|
| **Forced-colors compat (WCAG 2.4.7 — AA, baseline)** | `box-shadow` is forced to `none` in Windows High Contrast Mode ([MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)). WHCM users see **zero** selection indicator when keyboard-navigating blocks. | All keyboard-and-WHCM users (often legally-relevant population in regulated contexts) cannot use the editor. |
| **Double-outline on nested + every-block-in-range ghosting on drag** | `.is-selected` is applied to every wrapper that has the `selected` prop in its NodeView render. When PM's NodeSelection targets a child Card, both that Card and its ancestor `Cards` can be marked selected during keyboard-nav transitions — the translucent ring stacks. During drag, the drag-handle extension creates NodeSelections mid-gesture, making every previously-touched wrapper paint a ring until the drag completes. | Nested compound components (Cards-in-Cards, Steps-in-Step, Tabs-with-Tab children) are first-class product features; ghosting during drag is the default user experience. Can't fix without replacing the single-class paint model. |
| **Single-axis expressiveness** | One boolean class encodes seven orthogonal facts the UI needs to render: `selected`, `hover`, `has-child-selected`, `dragging`, `needs-config`, `component-type`, `selection-origin` (keyboard vs pointer). The codebase has already accumulated ad-hoc encodings: `[data-needs-config]` (new), `:hover` + `:not(:has(...))` cascade (global), class-combinator gymnastics. Adding an eighth (selection-origin, for `:focus-visible`-style keyboard-only ring) by the same mechanism compounds the mess. | Every future selection-adjacent feature — link popovers, image caption toolbar, multi-cursor presence, focus mode, breadcrumb active-state — re-pays this cost. Composing them is impossible without a first-class state store. |

Three separate codepaths currently **compute parent/child selection ancestry by walking `$pos.depth`** on each render:

- `JsxComponentView.tsx:117` walks `$pos` to compute `isChildOfComponent` / `siblingIndex`.
- `TypedChildrenGuard` (`typed-children-guard.ts`) walks `$pos.depth` downwards to find nearest `jsxComponent` ancestor with `emptyChildName`.
- Chrome hover CSS (`globals.css:1096`) uses `:not(:has(.component-children .jsx-component-wrapper:hover))` to pick the innermost hovered component — a selector that scales poorly and won't work for keyboard selection (there's no `:keyboard-selected` CSS state).

Each walk is correct in isolation but the codebase lacks a canonical "who is the current ancestry chain" primitive. Every new feature either duplicates the walk or invents a new attribute.

Additionally, a11y is **entirely absent**:

- No `aria-selected` on selected wrappers.
- No `role="group"` on `emptyChildName` containers (Cards, Steps, Tabs).
- No `aria-live` region announcing selection changes.
- No `tabindex` on top-level wrappers — keyboard users can't tab-to-block.
- No `:focus-visible` equivalent; pointer clicks and keyboard arrows produce identical visual state (works, but is a future-fit problem when keyboard-only focus rings are added for forms/buttons).

Research ([reports/block-selection-indicator-patterns/REPORT.md](../../reports/block-selection-indicator-patterns/REPORT.md)) commissioned in the prior session surveyed 13+ editors (Notion, Tiptap, Lexical, Anytype, Outline, Gutenberg, BlockNote, Craft, Figma, tldraw, Excalidraw, React Flow) and catalogued 16 CSS techniques. The evidence-backed recommendation: a **hybrid architecture** — inline CSS for the selection outline (keeping the code simple) + **Floating UI** for selection-anchored popovers (keeping the machinery proven). This is where staff engineers converge; the alternatives (full separate-layer tldraw-style, 1400–2600 LoC) and (inline-only with no action toolbar primitive) each fail on concrete axes.

### Resolution

Build the selection layer as **three orthogonal primitives plus two application components**, codifying CLAUDE.md precedents #15–#20 in the process.

**Primitive A — `SelectionStatePlugin` (PM PluginState).** Typed state `{ selectedBlockId, ancestorChain, selectionOrigin }` derived from the current NodeSelection + triggering event. One source of truth; subscribable via `useSyncExternalStore`. Replaces the `.is-selected` class propagation and the three duplicated ancestry walks.

**Primitive B — `data-*` attribute API + per-block-type CSS architecture.** Drive every selection-adjacent visual from six data attrs on `jsx-component-wrapper`: `data-component-type`, `data-selected`, `data-has-child-selected`, `data-selection-origin`, `data-dragging`, `data-needs-config`. ARIA peers: `aria-selected`, `role="group"`, `tabindex="0"`. CSS: delete the `.is-selected` box-shadow rule; replace with a `::before` behind-content halo (T10 from research) using transparent-outline placeholder (T3) for forced-colors compat, compositor-safe opacity transition gated on `prefers-reduced-motion: no-preference`, per-block-type tuning via `--selection-halo-*` custom properties keyed on `[data-component-type]`, and the Gutenberg innermost-wins rule.

**Primitive C — `useSelectionAnchoredPopover` hook (Floating UI wrapper).** Canonical positioning primitive for any UI that floats relative to the selection. Virtual-element pattern derived from PM selection via `posToDOMRect(view, from, to)` or the NodeSelection's DOM node. `autoUpdate` handles scroll/resize/viewport changes. One proof-usage in-spec to validate the API shape.

**Application components — Breadcrumb + SelectionAnnouncer.** Gutenberg-style ancestry footer (clickable segments that jump via PM NodeSelection) + `<div role="status" aria-live="polite">` region. Both subscribe to the plugin.

**Precedents #15–#20** codified in CLAUDE.md + mirrored to AGENTS.md.

Architecturally, this moves selection from "a CSS class glued to a NodeView prop" to "a first-class typed store with a well-typed API, an a11y floor, and a positioning primitive" — the same discipline that's already proven out for observers, origins, and compound components.

---

## 2. Success Criteria

### Primary — Correctness

**SC-1. Forced-colors compliance (WCAG 2.4.7, AA).** Selecting a block in Windows High Contrast Mode shows a visible selection indicator. Verified via Chrome DevTools `Emulation.setEmulatedMedia({name: 'forced-colors', value: 'active'})` in the Playwright E2E harness, by asserting `getComputedStyle(wrapper, '::before').borderColor !== 'transparent'` when `data-selected="true"`.

**SC-2. No double-outline on nested selection.** Given Card-inside-Cards: selecting the innermost Card paints exactly one halo (on the Card); the ancestor Cards has `data-has-child-selected="true"` but `--selection-halo-opacity: 0`. Verified via Playwright: exactly one `.jsx-component-wrapper[data-selected="true"]` halo is computed-style-visible in the subtree.

**SC-3. No ghost outlines during drag.** Starting a drag on any component sets `data-dragging="true"` and `--selection-halo-opacity: 0` on the source wrapper; on drop, both flags clear. Verified via Playwright DOM assertion during drag.

**SC-4. Three orthogonal axes compose without gymnastics.** `data-selected="true" data-needs-config="true" data-dragging="true"` produce the correct compound visual (dragging dominates — halo hidden; needs-config dominates hover — gear visible). No `:has()`-chain, no class-name explosion. Verified by reading the CSS architecture section — single-attribute selectors only.

**SC-5. A11y floor met:**
- Every selected wrapper has `aria-selected="true"`; deselected wrappers omit the attr.
- Every wrapper with a descriptor where `emptyChildName` is present has `role="group"` + `aria-label` (e.g. "Cards with 3 items").
- Top-level wrappers (children of the editor's doc root) have `tabindex="0"`.
- Selection changes fire a message into `<div role="status" aria-live="polite">`: "Selected: Card, 2 of 3 in Cards."
- `prefers-reduced-motion: reduce` disables the `--selection-halo-opacity` transition (instant swap, no fade).

Verified via Playwright DOM assertions + axe-core scan on the component-showcase page.

**SC-6. Typed origin, no raw strings.** The `selectionOrigin` field is a union `'keyboard' | 'pointer' | 'programmatic'`. PM transaction metadata uses a `LocalTransactionOrigin` object (Precedent #1), not a string. Verified via TypeScript type-check + unit test assertions.

**SC-7. Breadcrumb reflects ancestry + jumps.** Given `<Cards><Card><Steps><Step /></Steps></Card></Cards>` selected at the innermost Step: breadcrumb renders `Document › Cards › Card › Steps › Step`, clicking any segment sets a NodeSelection at that ancestor. Verified via Playwright: breadcrumb DOM has 5 segments, clicking `Card` segment results in `data-selected="true"` on the Card wrapper.

**SC-8. Floating UI primitive validates end-to-end.** The one proof-usage of `useSelectionAnchoredPopover` (the existing chrome bar's gear Popover, rewired) positions correctly on the selected wrapper, follows scroll within 16ms (one frame) via `autoUpdate`, and auto-hides when the selection clears. Verified via Playwright: scroll the editor while the Popover is open — Popover stays anchored to the wrapper.

### Primary — Invariants that must NOT regress

**SC-INV-1. Bridge invariant preserved.** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` holds after every selection plugin state update. The plugin is read-only over the PM doc; it never dispatches transactions that mutate the document. Verified via the existing bridge-matrix integration test suite.

**SC-INV-2. Schema is unchanged (Precedent #9).** Zero new node types, zero new attrs, zero widened content expressions on existing nodes. Selection state lives in PluginState, not schema attrs. Verified via `packages/core/src/schema-invariant.test.ts` snapshot test (unchanged).

**SC-INV-3. Precedent #14 preserved (all user content visible + editable).** Selection indicator sits BEHIND the block's chrome (`z-index: -1` on `::before` halo), never occludes content. Verified via visual regression screenshots + Playwright assertions that `.component-children` content is fully visible when `data-selected="true"`.

**SC-INV-4. NodeRangeSelection compatible.** TypedChildrenGuard's expansion (now tracking `$pos.depth === depth || $pos.depth === depth + 1`) continues to work. Selection plugin stores range state without a visual-range indicator in v1, but the state shape accommodates the extension point.

### Primary — Precedents established (architectural)

**SC-P-15.** Selection state is a first-class typed PM PluginState (mirrors Precedent #1's discipline for origins, Precedent #13's for compound-component context bridge).

**SC-P-16.** `data-*` attributes over className toggling for composable states in React-rendered NodeViews. Standard across Radix UI, Sonner, Vaul, shadcn/ui — our NodeViews now align.

**SC-P-17.** CSS custom-property tokens scoped via `[data-component-type]` for per-block-type theming. Extends the existing `--color-fd-*` bridge pattern from the same file.

**SC-P-18.** Innermost-wins visible chrome + ancestor `data-has-child-selected` propagation (Gutenberg pattern, store-propagated not `:has()`-derived).

**SC-P-19.** Floating UI is the canonical positioning primitive for any UI attached to content coordinates. Replaces ad-hoc `position: absolute`.

**SC-P-20.** A11y codified in the selection plugin (aria-selected, aria-live, forced-colors, reduced-motion) — not retrofitted per-block.

### Secondary — Quality bar

**SC-Q-1.** `bun run check` passes (lint, typecheck, unit, integration, fidelity).
**SC-Q-2.** `bun run test:stress:e2e` passes.
**SC-Q-3.** Playwright E2E for all 8 scenarios below passes (see §6).
**SC-Q-4.** No net increase in `console.warn` noise under normal usage; no `any` types on public exports.
**SC-Q-5.** Bundle size delta: < 3 KB gzipped (conservatively: plugin ~100 LoC, hooks ~60 LoC, new components ~150 LoC — all tree-shakable imports; Floating UI already bundled).

---

## 3. Design

### 3.1. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TipTap Editor (React)                                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ ProseMirror EditorView                                            │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │ SelectionStatePlugin  (NEW)                                 │ │   │
│  │  │ ── apply(tr): derive { selectedBlockId, ancestorChain,       │ │   │
│  │  │                         selectionOrigin } from NodeSelection │ │   │
│  │  │ ── subscribe(): for React components (useSyncExternalStore)  │ │   │
│  │  │ ── getBlockSelection(): imperative read                      │ │   │
│  │  │ ── props.view: classify origin from dom events               │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                   │   │
│  │  NodeViews: JsxComponentView (MODIFIED — consumes plugin)        │   │
│  │    ├── <NodeViewWrapper                                           │   │
│  │    │     data-component-type={descriptor.name}                   │   │
│  │    │     data-selected={isInnermost || undefined}                │   │
│  │    │     data-has-child-selected={hasDesc || undefined}          │   │
│  │    │     data-selection-origin={origin}                          │   │
│  │    │     data-dragging={isDragging || undefined}                 │   │
│  │    │     data-needs-config={needsConfig || undefined}  (existing)│   │
│  │    │     aria-selected={isSelected || undefined}                 │   │
│  │    │     role={hasEmptyChildName ? 'group' : undefined}          │   │
│  │    │     tabIndex={isTopLevel ? 0 : -1}                          │   │
│  │    │     ... existing props ...>                                 │   │
│  │    │   ├── .jsx-component-chrome  (existing; rewired via hook)   │   │
│  │    │   │    └── Popover via useSelectionAnchoredPopover (NEW wrap│   │
│  │    │   └── NodeViewContent  (existing)                           │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Breadcrumb  (NEW)  ── useBlockSelection()                               │
│    Document › Cards › Card › Steps › Step  ← clickable segments          │
│                                                                          │
│  SelectionAnnouncer  (NEW)  ── useBlockSelection(), debounced            │
│    <div role="status" aria-live="polite">                                │
│      "Selected: Card, 2 of 3 in Cards"                                   │
│    </div>                                                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

CSS: pseudo-element architecture driven by data-* attrs (NEW, replaces `.is-selected` rule)
```

### 3.2. Primitive A — `SelectionStatePlugin`

**File:** `packages/app/src/editor/extensions/selection-state-plugin.ts` (NEW)
**Integration:** registered alongside other PM plugins in `sharedExtensions` (or an app-local Tiptap `Extension.create`; TBD in implementation — preference: app-local since it reads app-level descriptor registry).

**PluginState shape:**

```ts
export interface BlockSelection {
  /** Stable bridgeId of the innermost selected jsxComponent, or null. */
  readonly selectedBlockId: string | null;
  /** Bridge-ID chain from root→innermost. Empty if no block selected. */
  readonly ancestorChain: readonly BlockChainEntry[];
  /** How this selection was initiated. */
  readonly selectionOrigin: SelectionOrigin;
  /** Whether a drag is currently in progress on the selected block. */
  readonly isDragging: boolean;
}

export interface BlockChainEntry {
  readonly bridgeId: string;
  readonly componentName: string;  // descriptor name, e.g. "Card", "Steps"
  readonly pos: number;             // PM position of the wrapper start
}

export type SelectionOrigin = 'keyboard' | 'pointer' | 'programmatic';
```

**Typed transaction meta key** (Precedent #1 — object identity, not string):

```ts
import type { LocalTransactionOrigin } from '@hocuspocus/server';

const META_KEY = new PluginKey<BlockSelection>('blockSelectionState');

/** Transaction meta payload used when a caller wants to override origin
 *  classification (e.g. agent-write sets 'programmatic' explicitly). */
export const SELECTION_ORIGIN_META = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'selection-origin-override' },
} satisfies LocalTransactionOrigin;
```

**`apply(tr, old) → BlockSelection`:**

1. Read the current selection (`tr.selection`). If not a `NodeSelection` on a `jsxComponent` node (or an ancestor includes one), derive the nearest `jsxComponent` ancestor via `$from.node(depth)` walk (same pattern as TypedChildrenGuard:66–91).
2. If no jsxComponent ancestor → `{ selectedBlockId: null, ancestorChain: [], selectionOrigin: old.selectionOrigin, isDragging: false }`.
3. Otherwise:
   - Walk `$from.depth` downwards, accumulating every jsxComponent ancestor's `bridgeId` (via `getBridgeId(editorState, node, getPos)` from `bridge-id-plugin.ts`) and componentName.
   - The innermost is `selectedBlockId`.
   - `ancestorChain` = outer→innermost list.
4. **Origin classification** is event-driven, not tx-derived:
   - The plugin installs DOM event listeners in `props.handleKeyDown` and `props.handleDOMEvents.mousedown` / `pointerdown` to set a `pendingOrigin` ref.
   - On the next selection-changing transaction, the ref is consumed and written into state; cleared after.
   - Transactions with meta `SELECTION_ORIGIN_META` override to `'programmatic'` — agents use this path.
5. **Drag detection** via `props.handleDOMEvents.dragstart` / `dragend` on the selected wrapper's DOM node.
6. Identity: if derived state `deepEqual`s `old`, return `old` (reference preservation — `useSyncExternalStore` bails out).

**Subscribe API (React hook):**

```ts
// packages/app/src/editor/hooks/use-block-selection.ts
import { useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import { getBlockSelection, subscribeBlockSelection } from '../extensions/selection-state-plugin';

export function useBlockSelection(editor: Editor | null): BlockSelection | null {
  return useSyncExternalStore(
    (cb) => editor ? subscribeBlockSelection(editor, cb) : () => {},
    () => editor ? getBlockSelection(editor) : null,
    () => null,  // SSR snapshot
  );
}
```

**Imperative API:**

```ts
export function getBlockSelection(editor: Editor): BlockSelection;
export function subscribeBlockSelection(editor: Editor, onChange: () => void): () => void;
```

**Replaces:**
- `JsxComponentView.tsx:117` ancestry walk → consumes `useBlockSelection()` for `isChildOfComponent`, `ancestorChain`.
- `JsxComponentView.tsx:257` `${selected ? 'is-selected' : ''}` className → plugin-driven `data-selected` attr.
- (Eventually) — `TypedChildrenGuard` and `compound-wrappers` continue to own their domain logic (they aren't about selection visuals), but can consume the plugin for ancestor queries if duplication appears.

### 3.3. Primitive B — `data-*` API + CSS architecture

**Data-attr API on `.jsx-component-wrapper`:**

| Attr | Values | Set by | Purpose |
|---|---|---|---|
| `data-component-type` | descriptor.name (lowercase) | JsxComponentView (always) | Keys per-block-type CSS tokens |
| `data-selected` | `"true" \| undefined` | JsxComponentView from plugin | Paints halo on innermost selected wrapper |
| `data-has-child-selected` | `"true" \| undefined` | JsxComponentView from plugin | Signals ancestor of selection (innermost-wins gate) |
| `data-selection-origin` | `"keyboard" \| "pointer" \| "programmatic" \| undefined` | JsxComponentView from plugin | Future styling differentiation (optional in v1) |
| `data-dragging` | `"true" \| undefined` | JsxComponentView from plugin (drag events) | Suppresses halo, kills transition |
| `data-needs-config` | `"true" \| undefined` | JsxComponentView (existing logic) | Chrome-bar gear hint (already shipping) |

ARIA peers:

| Attr | Values | Condition |
|---|---|---|
| `aria-selected` | `"true" \| undefined` | `data-selected === "true"` |
| `role` | `"group" \| undefined` | `descriptor.emptyChildName` is set |
| `aria-label` | `string \| undefined` | When `role="group"`: e.g. `"Cards with 3 items"` |
| `tabIndex` | `0 \| -1` | `0` for top-level wrappers; `-1` for nested (keyboard nav moves between top-level, then descends) |

**CSS architecture (replaces `globals.css:1061-1066`):**

```css
/* 7a. Selection halo — per-block-type tokens, behind-content (T10),
   transparent-outline placeholder (T3), forced-colors compliant,
   reduced-motion gated, compositor-safe opacity transition. */

.ProseMirror .jsx-component-wrapper {
  position: relative;
  border-radius: 0.375rem;

  /* Per-type tokens — overridden below by [data-component-type="..."] */
  --selection-halo-inset: -4px;
  --selection-halo-radius: calc(0.375rem + 4px);
  --selection-halo-color: var(--ring);
  --selection-halo-opacity: 0;
  --selection-halo-width: 2px;
}

/* Reduced-motion default: no transition. Spatial motion opts in. */
.ProseMirror .jsx-component-wrapper::before {
  content: "";
  position: absolute;
  inset: var(--selection-halo-inset);
  border: var(--selection-halo-width) solid transparent;  /* T3 placeholder */
  border-radius: var(--selection-halo-radius);
  opacity: var(--selection-halo-opacity);
  pointer-events: none;
  z-index: -1;                                            /* T10 — behind block's own chrome */
  box-sizing: border-box;
}

@media (prefers-reduced-motion: no-preference) {
  .ProseMirror .jsx-component-wrapper::before {
    transition: opacity 180ms ease-out;                   /* inside 150–300ms cap */
  }
}

/* Paint the halo for the innermost selected wrapper */
.ProseMirror .jsx-component-wrapper[data-selected="true"]::before {
  --selection-halo-opacity: 1;
  border-color: var(--selection-halo-color);
}

/* Innermost-wins: ancestor with a selected descendant suppresses its own halo */
.ProseMirror .jsx-component-wrapper[data-has-child-selected="true"][data-selected="true"]::before {
  --selection-halo-opacity: 0;
}
/* (In practice: plugin never sets both `data-selected` and `data-has-child-selected`
 *  on the same wrapper — innermost-wins is enforced at the state layer too. The CSS
 *  rule exists as defense-in-depth if a future refactor ever sets both.) */

/* Drag suppresses the halo + transition (Vaul pattern) */
.ProseMirror .jsx-component-wrapper[data-dragging="true"]::before {
  --selection-halo-opacity: 0;
  transition: none;
}

/* Forced-colors (Windows High Contrast): browser auto-colors the outline/border,
 * but we make it explicit for clarity. CanvasText is the current system foreground. */
@media (forced-colors: active) {
  .ProseMirror .jsx-component-wrapper[data-selected="true"]::before {
    border-color: CanvasText;
  }
}

/* Per-block-type tuning. Media blocks (ImageZoom, Mermaid) use a tight -2px inset
 * because their visual bounds are sharper than text-heavy blocks. Callouts inherit
 * their type-color so the halo matches the callout's own chroma. */
.ProseMirror .jsx-component-wrapper[data-component-type="imagezoom"],
.ProseMirror .jsx-component-wrapper[data-component-type="mermaid"] {
  --selection-halo-inset: -2px;
  --selection-halo-radius: calc(var(--selection-halo-radius, 0.375rem) + 2px);
}

.ProseMirror .jsx-component-wrapper[data-component-type="callout"] {
  --selection-halo-color: var(--callout-type-color, var(--ring));
}

/* Cards container and Steps container have a bigger natural inset because their
 * chrome (left-padding for counters, border for grid) needs breathing room. */
.ProseMirror .jsx-component-wrapper[data-component-type="cards"],
.ProseMirror .jsx-component-wrapper[data-component-type="steps"] {
  --selection-halo-inset: -6px;
  --selection-halo-radius: calc(var(--selection-halo-radius, 0.375rem) + 6px);
}
```

**Why this combination of techniques:**

- **T10 (behind-content halo via `z-index: -1`):** Zero double-outline — the halo paints BEHIND the block's own border, so even blocks with their own rounded borders (Card, Accordion, Callout) don't stack lines. Requires `position: relative` on the wrapper (already present, line 1042) and a non-opaque background between the wrapper and the halo (which is the case; wrappers are transparent). From `evidence/css-techniques.md` — this is the single cleanest technique.
- **T3 (transparent-outline placeholder):** Forced-colors mode forces `border-color`, so a `border: 2px solid transparent` default becomes visible in WHCM. Without this, `box-shadow` would vanish. From `evidence/a11y-requirements.md` — this is the WCAG 2.4.7 fix.
- **`opacity` transition on compositor thread:** Animating `opacity` runs on the compositor layer; `transition` gated on `no-preference` per `evidence/transitions-and-state-machines.md`.
- **Per-type tokens via `[data-component-type]`:** Extends the project's existing `--color-fd-*` token bridge pattern. No new mechanism.
- **Innermost-wins via state**, not via `:has()`: Gutenberg's approach — store-computed ancestry, not CSS cascade. Survives Firefox `:has()` rollout gaps and is faster on large docs.

### 3.4. Primitive C — `useSelectionAnchoredPopover`

**File:** `packages/app/src/editor/hooks/use-selection-anchored-popover.ts` (NEW)
**Depends on:** `@floating-ui/dom` ^1.7.6 (already installed).

**Signature:**

```ts
export interface UseSelectionAnchoredPopoverOptions {
  /** Whether the popover should be visible. Combined with shouldShow gate. */
  open: boolean;
  /** Additional visibility predicate — e.g. editor has focus, selection non-empty. */
  shouldShow?: (selection: BlockSelection) => boolean;
  /** Placement relative to the anchored block. Default: 'top-end'. */
  placement?: Placement;
  /** Floating UI middleware to apply. Default: [offset(8), flip(), shift({padding: 8}), hide()]. */
  middleware?: Middleware[];
}

export interface UseSelectionAnchoredPopoverResult {
  /** Assign to the floating element (the popover content). */
  setFloating: (el: HTMLElement | null) => void;
  /** Computed style to apply to the floating element. */
  floatingStyles: React.CSSProperties;
  /** Whether the popover is currently visible (open + shouldShow pass). */
  isVisible: boolean;
  /** Current placement after flip/shift resolution. */
  placement: Placement;
}

export function useSelectionAnchoredPopover(
  editor: Editor | null,
  options: UseSelectionAnchoredPopoverOptions,
): UseSelectionAnchoredPopoverResult;
```

**Implementation:**

- Virtual element derived from `editor.state.selection`:
  - If `NodeSelection`: use `editor.view.nodeDOM(selection.from)`'s `getBoundingClientRect()` + `getClientRects()`.
  - If `TextSelection` (non-empty): `posToDOMRect(view, from, to)`.
  - If `CellSelection`: union via `combineDOMRects` (extracted from Tiptap BubbleMenu pattern).
- `computePosition(virtualElement, floating, {...})` on mount + every `autoUpdate` tick.
- `autoUpdate(referenceAsDocument, floating, update, { ancestorScroll: true, elementResize: true, layoutShift: true })` wires scroll + resize + intersection listeners with the ResizeObserver-loop guard (per `evidence/separate-layer-rendering.md`).
- `shouldShow` gate short-circuits position computation when false — saves reflow cost on hidden popovers (Tiptap BubbleMenu pattern).
- Returns `floatingStyles` (position: 'fixed', left, top, transform) and `isVisible` — consumer renders the floating element conditionally.

**Proof usage (in-spec):**

Rewire the existing chrome-bar gear Popover (currently in `JsxComponentView.tsx:345-432`, using `@radix-ui/react-popover`) to use `useSelectionAnchoredPopover` as its positioning source. Radix's own Popover already uses `@floating-ui/react-dom` internally, so this rewire is primarily about:

1. Removing hand-coded `position: absolute; top: -11px; right: 0` on `.jsx-component-chrome` (the chrome bar itself stays inline-positioned on the wrapper — only the Popover content moves through our hook).
2. Demonstrating the virtual-element pattern end-to-end with a real selection source.

**Decision (LOCKED):** The chrome bar pill stays inline-positioned (it's per-wrapper, not per-selection). The **Popover content** goes through `useSelectionAnchoredPopover`. This keeps blast radius minimal while validating the hook against a real codepath. If the rewire surfaces a genuine API gap, we iterate before shipping.

### 3.5. Application component — `Breadcrumb`

**File:** `packages/app/src/components/editor/Breadcrumb.tsx` (NEW)
**Mount:** `TiptapEditor.tsx` render, below `<EditorContent>` inside the `tiptap-editor` wrapper.

**Behavior:**
- Subscribes via `useBlockSelection(editor)`.
- Renders `Document › <componentName>[…]` with chevron separators.
- Each segment is a `<button>` that, on click, sets a PM NodeSelection at that ancestor's position via `editor.chain().setNodeSelection(pos).focus().run()`.
- Empty when no block is selected (or renders a subtle "No selection" placeholder; TBD in impl — lean toward hidden to avoid visual noise).
- Styled to match the editor footer; does not affect `EditorContent` layout.

### 3.6. Application component — `SelectionAnnouncer`

**File:** `packages/app/src/components/editor/SelectionAnnouncer.tsx` (NEW)
**Mount:** `TiptapEditor.tsx` render (visually hidden).

**Behavior:**
- `<div role="status" aria-live="polite" className="sr-only">`.
- Subscribes via `useBlockSelection`.
- On selection change, writes a debounced (200ms) message: `"Selected: {componentName}, {index} of {total} in {parentName}"` (or `"Selected: {componentName}"` at top level).
- Debounce prevents screen-reader queue flooding during rapid keyboard nav.
- Implementation detail: uses a `useEffect` that reads `blockSelection` + debounces + writes `el.textContent` imperatively. (React's batch-diff on `aria-live` regions can swallow fast updates — imperative write is the robust pattern.)

### 3.7. Precedents (CLAUDE.md + AGENTS.md)

New entries appended to the "Architectural precedents" list in both files:

- **#15 Selection state as typed PM PluginState.** A block editor's "what is selected, how did we get here, what's the ancestry chain" is a first-class typed store (`SelectionStatePlugin`), not a per-NodeView boolean. Subscribe via `useSyncExternalStore` for React; `getBlockSelection(editor)` for non-React. Selection-changing events are classified at the event layer (keydown, pointerdown, programmatic via typed origin) and written into PluginState. One source of truth; no duplicated ancestry walks.

- **#16 `data-*` attributes over className toggling for composable states in React-rendered NodeViews.** When a component has N orthogonal runtime states (selected × hover × dragging × needs-config × component-type × has-child-selected), encode each as its own `data-*` attribute, not as a class-list combination. CSS targets via single-attribute selectors (`[data-selected="true"][data-dragging="true"]` etc.). Matches Radix UI / Sonner / Vaul / shadcn patterns.

- **#17 CSS custom-property tokens scoped via `[data-component-type]` for per-block-type theming.** For any visual treatment that needs per-component-type tuning (selection halo, chrome bar, future highlight colors), expose the knobs as `--*` custom properties on the wrapper, override them under `[data-component-type="..."]` selectors. Extends the existing `--color-fd-*` token bridge pattern from `globals.css`. New selectors don't proliferate; new tokens do.

- **#18 Innermost-wins visible chrome, ancestor propagation via state (not `:has()`).** When a block editor has nested components (Card inside Cards, Step inside Steps) and only one selection UI element at a time makes sense, the innermost selected wrapper paints visible chrome; ancestors receive a `data-has-child-selected` state attribute computed in the store (not via the `:has()` CSS selector). Store-propagation beats `:has()` for: Firefox compat gaps, large-doc performance, debuggability. From Gutenberg's production pattern (verified in `reports/block-selection-indicator-patterns/evidence/nested-and-multi-selection.md`).

- **#19 Floating UI is the canonical positioning primitive for selection-anchored overlays.** For any UI that needs to float relative to editor-content coordinates — link editor popovers, image caption, action toolbars, future collaborator presence pins — use the `useSelectionAnchoredPopover` hook (wrapping `@floating-ui/dom`). Virtual elements derive from PM selection via `posToDOMRect` or NodeSelection's DOM node. `autoUpdate` handles scroll/resize/intersection. No ad-hoc `position: absolute` with hand-rolled listeners.

- **#20 A11y is codified in the selection plugin, not retrofitted per-block.** `aria-selected`, `role="group"` on compound containers, `aria-live` announcement of selection changes, `tabindex="0"` on top-level wrappers, `@media (forced-colors: active)` fallback for outline visibility, `@media (prefers-reduced-motion: reduce)` for transition suppression — all derive from the selection plugin's state. Individual NodeViews don't each re-implement these.

---

## 4. Scope

### In scope

- **Primitive A:** `SelectionStatePlugin` with typed state, typed origin meta, event-driven origin classification, drag-state tracking.
- **Primitive B:** `data-*` attribute API on `jsx-component-wrapper`; delete `.is-selected` box-shadow rule; new `::before` halo architecture with per-type tokens, forced-colors, reduced-motion.
- **Primitive C:** `useSelectionAnchoredPopover` hook + proof-usage rewiring the existing chrome gear Popover.
- **Breadcrumb footer component** — reads plugin state, renders clickable ancestry, mounted in `TiptapEditor.tsx`.
- **SelectionAnnouncer** — `aria-live="polite"` region, debounced.
- **CLAUDE.md + AGENTS.md precedents #15–#20.**
- **Tests:**
  - Unit: plugin state transitions, ancestor-chain computation, origin classification (positive + negative cases for each origin).
  - Integration: plugin state visible in the existing bridge-matrix harness; state survives Y.Doc sync; NodeRangeSelection compatibility.
  - Fidelity: existing I1–I7, I12–I17 unaffected (run as-is; no new invariants, no changed invariants).
  - Playwright E2E — 8 scenarios (see §6).

### Out of scope (explicit non-goals)

Each listed with evidence-backed rationale. None are "defer to future" — they are scope decisions made now.

- **No canvas rendering, no SVG separate-layer for selection visuals.** Evidence: `reports/block-selection-indicator-patterns/evidence/separate-layer-rendering.md` — 1400–2600 LoC baseline, worse forced-colors story (SVG stroke doesn't auto-color), ResizeObserver + RAF + coordinate-transform machinery with no payoff for a rich-text editor that lacks zoom/pan. The hybrid in this spec (inline CSS outline + Floating UI toolbar) is the recommended architecture for exactly this class of editor.
- **No zoom/pan.** Not a product feature. Coordinate transforms not needed.
- **No multi-block visual rendering.** Plugin stores range state (the shape has an `ancestorChain` that could encode multi-block union), but the visual indicator stays single-block in v1. Per Gutenberg, the correct multi-block visual is a per-block `::after` 40%-opacity overlay + an is-multi-selected class; adding this requires PM NodeRangeSelection hookup and compound-state rules (`.is-multi-selected:not(.is-partially-selected)`) — a scoped increment done as a follow-up spec when multi-block operations (bulk drag, bulk delete) enter the product.
- **No drag-rect lasso select.** Not a product feature. No bounding-box interaction model.
- **No collaborator-presence selection indicators.** Y.Awareness already exposes peer cursors; peer **block-selection** would require wiring awareness → ghost halos. Follow-up spec when a concrete collaborator UX enters the product.
- **No link editor / image caption popover.** Primitive C (`useSelectionAnchoredPopover`) is established with one proof-usage (chrome gear Popover rewire). Specific downstream popovers are their own features with their own specs.
- **No per-surface focus mode (Gutenberg-style spotlight that fades non-selected blocks to 20% opacity).** Compelling UX but a separate product decision; not required for the selection correctness floor.

### Future Work (maturity-tiered)

- **Multi-block visual (Explored):** Gutenberg's `.is-multi-selected::after { opacity: 0.4 }` pattern + 100ms fade-in. Clear picture; blocked by product decision on when multi-block operations are exposed in the editor.
- **Selection-anchored link editor (Explored):** Uses `useSelectionAnchoredPopover` on text selection. Product-designed flow TBD.
- **Collaborator-presence halos (Identified):** Peer NodeSelections from Y.Awareness → ghost halos in peer color. Architectural pattern clear; implementation scoped to its own spec.
- **Focus mode spotlight (Identified):** Gutenberg's `:not(.has-child-selected) { opacity: 0.2 }` pattern. Requires product decision on toggle UX (keyboard shortcut? toolbar button?).
- **Virtualization of Breadcrumb for very deep nesting (Noted):** Over ~6 levels, breadcrumb could wrap or collapse. Not relevant until component tree permits.

### Files touched

| File | Change |
|---|---|
| `packages/app/src/editor/extensions/selection-state-plugin.ts` | **NEW** — PM plugin + subscribe API |
| `packages/app/src/editor/extensions/selection-state-plugin.test.ts` | **NEW** — unit tests |
| `packages/app/src/editor/hooks/use-block-selection.ts` | **NEW** — React hook (useSyncExternalStore wrapper) |
| `packages/app/src/editor/hooks/use-selection-anchored-popover.ts` | **NEW** — Floating UI virtual-element hook |
| `packages/app/src/components/editor/Breadcrumb.tsx` | **NEW** — ancestry footer |
| `packages/app/src/components/editor/SelectionAnnouncer.tsx` | **NEW** — aria-live region |
| `packages/app/src/editor/utils/selection-origin.ts` | **NEW** (maybe; may be inlined into plugin) — origin classification helper |
| `packages/app/src/editor/extensions/JsxComponentView.tsx` | **MODIFIED** — data-attrs from plugin, remove `.is-selected` className, consume `useBlockSelection`, ARIA |
| `packages/app/src/globals.css` | **MODIFIED** — delete `.is-selected` box-shadow rule at :1064; add `::before` halo architecture with per-type tokens, forced-colors, reduced-motion, innermost-wins |
| `packages/app/src/editor/TiptapEditor.tsx` | **MODIFIED** — mount Breadcrumb + SelectionAnnouncer, register plugin |
| `packages/app/src/editor/extensions/shared.ts` | **MODIFIED** — add SelectionStatePlugin to shared extensions list |
| `CLAUDE.md` + `AGENTS.md` | **MODIFIED** — append precedents #15–#20 |
| `packages/app/tests/integration/selection-state.test.ts` | **NEW** — bridge-matrix integration test |

Estimate: ~620–860 LoC (6 new TS files at ~100 LoC avg + ~60 LoC test; ~40 LoC CSS; ~60 LoC modifications in JsxComponentView + TiptapEditor + shared.ts; ~180 LoC precedent text in CLAUDE.md + AGENTS.md).

---

## 5. Open Questions & Decisions

### Decisions (LOCKED — evidence-backed during research)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D-1 | Inline CSS halo (T10 + T3), NOT separate SVG/canvas layer | 1400–2600 LoC vs 620–860; worse forced-colors story for SVG; editor has no zoom/pan to justify. `separate-layer-rendering.md`. | LOCKED |
| D-2 | Behind-content halo via `z-index: -1` (T10) | Eliminates double-outline on nested chrome; Tiptap DragHandle precedent. `editor-survey.md` + `css-techniques.md`. | LOCKED |
| D-3 | Transparent-outline placeholder (T3) for forced-colors | WCAG 2.4.7 baseline; `box-shadow` alone is invisible in WHCM. `a11y-requirements.md`. | LOCKED |
| D-4 | `data-*` attributes over className for state composition | Radix/Sonner/Vaul/shadcn convention; single-attribute CSS selectors; zero combinatorial explosion. `transitions-and-state-machines.md`. | LOCKED |
| D-5 | Innermost-wins via plugin state, NOT `:has()` | Gutenberg pattern; `:has()` Firefox rollout gap (Nov 2023) + perf concerns on large docs. `nested-and-multi-selection.md`. | LOCKED |
| D-6 | Floating UI for selection-anchored popovers | Already installed (`@floating-ui/dom` ^1.7.6); Tiptap BubbleMenu is the reference implementation. `separate-layer-rendering.md`. | LOCKED |
| D-7 | `SelectionStatePlugin` lives in `packages/app` not `packages/core` | Plugin reads app-level descriptor registry (`getDescriptor`). Core is Node+browser-safe with no React or app deps. | LOCKED |
| D-8 | Origin classification via event listeners on `view.dom`, not PM tx meta heuristics | PM transactions don't carry keyboard-vs-pointer info inherently; events do. Typed meta override available for programmatic selections (agents). | LOCKED |
| D-9 | Proof-usage of Floating UI hook = chrome gear Popover rewire | Minimal blast radius; existing codepath; validates virtual-element API against real NodeSelection. Alternative stub usage adds no signal. | LOCKED |

### Open Questions

All P0 questions resolved during spec authoring. No P2 questions block this scope.

**OQ-1 (resolved inline):** Does the selection plugin need to own `data-dragging` or should the drag-handle extension? **Answer:** Plugin owns it. The drag-handle extension emits `dragstart`/`dragend` DOM events on `view.dom`; the plugin listens (same mechanism as origin classification) and updates state. This keeps all selection-adjacent runtime state in one place. The drag-handle extension's internal state (HTML5 drag API) is orthogonal.

**OQ-2 (resolved inline):** Does `data-selection-origin` drive any visual treatment in v1, or is it just plumbed-through for future? **Answer:** Plumbed-through in v1. Visual differentiation (e.g. stronger ring for `"keyboard"` to match `:focus-visible` semantics for non-focusable elements) is a polish follow-up. Establishing the attr + plumbing now means the follow-up is a pure CSS addition.

**OQ-3 (resolved inline):** Should Breadcrumb render when nothing is selected? **Answer:** No. Hidden when `selectedBlockId === null`. An empty breadcrumb is visual noise; users don't need "Document" perpetually displayed. (Reversible — can add an always-visible mode as a toggle later.)

**OQ-4 (resolved inline):** Where does the SelectionAnnouncer live in the DOM? **Answer:** Inside `.tiptap-editor`, sibling to `EditorContent`. Rendered with `sr-only` utility class (visually hidden, screen-reader accessible). Does not affect editor layout.

**OQ-5 (resolved inline):** Should the plugin's ancestor chain include the editor's doc root? **Answer:** No — chain entries are jsxComponent ancestors only. Breadcrumb prepends a synthetic `Document` segment for display.

---

## 6. Verification

### 6.1 Unit tests

**`selection-state-plugin.test.ts`** — in-memory PM EditorState harness, no DOM required.

- Plugin initializes with `null`/`[]`/`'programmatic'` state.
- Setting a NodeSelection on a top-level jsxComponent produces `selectedBlockId`, single-entry `ancestorChain`, origin from pending classification.
- Setting a NodeSelection on a nested jsxComponent (Card in Cards) produces two-entry ancestorChain (outer→inner), `selectedBlockId` = inner.
- TextSelection inside a jsxComponent's content hole maps to innermost jsxComponent ancestor; `selectedBlockId` = that ancestor.
- Non-jsxComponent selection (e.g. text in paragraph at doc root) → all-null state.
- Reference preservation: identical derived state returns `old` (via `useSyncExternalStore` bail-out assertion).
- Origin classification: keydown event → next tx has `selectionOrigin: 'keyboard'`; mousedown → `'pointer'`; tx with `SELECTION_ORIGIN_META` → `'programmatic'`.
- Drag state: dragstart DOM event sets `isDragging: true`; dragend clears.

### 6.2 Integration tests

**`selection-state.test.ts`** (new, in `packages/app/tests/integration/`)

- Uses `createTestServer` + `createTestClient` from the existing test harness.
- Write a doc with `<Cards><Card><Steps><Step /></Steps></Card></Cards>`.
- NodeSelection on the Step from client A; observe plugin state on client A ← correct ancestor chain [Cards, Card, Steps, Step].
- Bridge invariant: `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` after the state change (plugin is read-only; should always hold).
- Deleting the Step (via setNodeSelection + deleteSelection) → plugin state transitions to `null` cleanly without throwing.

### 6.3 Fidelity tests

Run existing `test:fidelity` suite as-is. No changes expected (selection layer is presentational; no schema, no markdown I/O). Explicit assertion: **I14 (rawMdxFallback byte-identity)**, **I15 (JSX cross-path consistency)**, **I16 (nested-dirty serialization)**, **I17 (all-user-content-visible)** all green before and after. Ship blocks if any regress.

### 6.4 Playwright E2E (via `/browser` headless Playwright)

**8 scenarios** — each produces a clear pass/fail and lives in `packages/app/tests/stress/selection-indicator.e2e.ts`:

| # | Scenario | Assertion |
|---|---|---|
| 1 | Keyboard arrow-nav between blocks | After ArrowDown from top block, next block has `data-selected="true"` + `data-selection-origin="keyboard"`; computed `::before` opacity = 1 |
| 2 | Click block selection | After click on Card body, Card wrapper has `data-selected="true"` + `data-selection-origin="pointer"` |
| 3 | Nested Card-in-Cards — innermost wins | Given `<Cards><Card/></Cards>`: select inner Card. Card has `data-selected="true"`; Cards has `data-has-child-selected="true"` (NOT `data-selected`). Exactly one `.jsx-component-wrapper[data-selected="true"]` in the subtree. |
| 4 | Drag suppresses halo | During an active drag on a block, `data-dragging="true"` set on wrapper; computed `::before` opacity = 0. After drop, flags clear; opacity returns to 0 or 1 based on final selection. |
| 5 | Forced-colors emulation | Chrome DevTools `Emulation.setEmulatedMedia({name: 'forced-colors', value: 'active'})`. With a block selected, `getComputedStyle(wrapper, '::before').borderColor` matches a CanvasText-derived color (not `transparent`, not `rgb(0,0,0,0)`). |
| 6 | Reduced-motion emulation | `Emulation.setEmulatedMedia({name: 'prefers-reduced-motion', value: 'reduce'})`. Select a block; `transition-duration` on the halo pseudo-element is `0s` (no fade). |
| 7 | Breadcrumb navigation | Select innermost Step in `<Cards><Card><Steps><Step/></Steps></Card></Cards>`; breadcrumb DOM has segments: Document, Cards, Card, Steps, Step. Click "Card" segment → Card wrapper has `data-selected="true"`; Step no longer. |
| 8 | Screen-reader announcement | After 200ms debounce post-selection, `<div role="status" aria-live="polite">` contains "Selected: Card, 2 of 3 in Cards" (or equivalent). Verify via MutationObserver on the region. |

All 8 scenarios use `/browser` headless Playwright. The dev server is started via the existing Vite `bun run dev` in the worktree; scenarios point at `http://localhost:<port>` where `<port>` is the resolved port from `VITE_PORT` or Vite's default.

### 6.5 A11y scan

`axe-core` run on the component-showcase page after mounting the editor. Zero new violations introduced by this change.

### 6.6 Manual smoke (QA phase)

1. Open `component-showcase.md` in dev server.
2. Click each of the 18 built-in components → halo appears cleanly, no double outline, no ghost on non-selected.
3. Keyboard nav (arrow up/down) through blocks → halo follows; breadcrumb updates; aria-live region reads (verified with macOS VoiceOver).
4. Enable forced-colors in macOS System Settings (or use Chrome DevTools) → halo visible.
5. Enable reduced-motion → no transition on selection changes.
6. Drag a Card → halo suppresses mid-drag, no ghost on any previously-selected block.

### 6.7 Regression guardrails

- `bun run check` green.
- `bun run test:stress:e2e` green (includes new selection-indicator E2E).
- `bun run test:fidelity` green.
- Bridge invariant assertion in integration tests remains green.
- Precedent #14 assertion: editor-local visual test confirms content is fully rendered inside every block regardless of selection state.

---

## 7. Rollout

Greenfield, no feature flag. Selection plugin is registered unconditionally in the shared extensions list. The `.is-selected` CSS rule is deleted in the same commit as the plugin registration — no intermediate state where both paint.

**Migration:** None required. Existing behavior is preserved for users who don't interact with selection indicators (the visual improves; nothing breaks). Agent writes continue to work (programmatic origin path is explicit).

**Risk:** Low. The selection plugin is additive (new PluginState); the CSS replacement is a drop-in delete + add in the same file. The API surface of `JsxComponentView.tsx` changes only in its className/data-attr emission — zero prop-signature changes. Compound wrappers and typed-children-guard are untouched.

---

## 8. References

- Research report: [`reports/block-selection-indicator-patterns/REPORT.md`](../../reports/block-selection-indicator-patterns/REPORT.md)
- Evidence — editor survey: [`editor-survey.md`](../../reports/block-selection-indicator-patterns/evidence/editor-survey.md)
- Evidence — a11y requirements: [`a11y-requirements.md`](../../reports/block-selection-indicator-patterns/evidence/a11y-requirements.md)
- Evidence — CSS techniques: [`css-techniques.md`](../../reports/block-selection-indicator-patterns/evidence/css-techniques.md)
- Evidence — transition timing: [`transitions-and-state-machines.md`](../../reports/block-selection-indicator-patterns/evidence/transitions-and-state-machines.md)
- Evidence — nested + multi-select: [`nested-and-multi-selection.md`](../../reports/block-selection-indicator-patterns/evidence/nested-and-multi-selection.md)
- Evidence — separate-layer rendering: [`separate-layer-rendering.md`](../../reports/block-selection-indicator-patterns/evidence/separate-layer-rendering.md)
- Existing precedents: [CLAUDE.md](../../CLAUDE.md) (§ Architectural precedents)

---

## 9. Agent Constraints

- **SCOPE:** `packages/app/src/editor/extensions/selection-state-plugin.ts`, `packages/app/src/editor/hooks/`, `packages/app/src/components/editor/`, `packages/app/src/editor/extensions/JsxComponentView.tsx`, `packages/app/src/globals.css`, `packages/app/src/editor/TiptapEditor.tsx`, `packages/app/src/editor/extensions/shared.ts`, `packages/app/tests/integration/`, `packages/app/tests/stress/selection-indicator.e2e.ts`, `CLAUDE.md`, `AGENTS.md`.
- **EXCLUDE:** `packages/core/` (no schema changes — Precedent #9), `packages/server/`, `packages/cli/`, `docs/`, markdown pipeline (`packages/core/src/markdown/`), observers (`packages/app/src/editor/observers.ts`), compound wrappers (`packages/app/src/editor/components/compound-wrappers.tsx`), typed-children-guard (`packages/app/src/editor/extensions/typed-children-guard.ts`).
- **STOP_IF:**
  - Any schema change appears necessary → stop. Selection state MUST live in PluginState.
  - Bridge invariant test fails → stop, diagnose.
  - Fidelity test regresses → stop, diagnose.
  - Precedent #14 violated (any content occluded by selection UI) → stop.
  - An API shape change is needed in `@inkeep/open-knowledge-core` → stop, escalate (this is a 1-way door on core's public surface).
- **ASK_FIRST:** None. Headless / autonomous. All questions were resolved during spec authoring.
