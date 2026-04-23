# Evidence: Separate-Layer Selection Rendering (D9)

**Dimension:** Figma-style "separate selection layer" rendering as a DOM pattern — architecture, machinery, viability for rich-text block editors
**Date:** 2026-04-16
**Sources:** tldraw (OSS, `github.com/tldraw/tldraw`), Excalidraw (OSS, canvas-based for contrast), React Flow/xyflow (OSS), Floating UI (OSS), Tiptap BubbleMenu (`@tiptap/extension-bubble-menu`), MDN/web.dev perf references

---

## Key files / pages referenced

### tldraw
- `packages/editor/src/lib/components/default-components/DefaultCanvas.tsx:75-87` — single CSS transform applied to both `.tl-html-layer` elements keeps shape + overlay layers in sync
- `packages/editor/src/lib/components/default-components/CanvasShapeIndicators.tsx:235-290` — 2D-canvas rendering of N selected-shape outlines in a single pass
- `packages/editor/src/lib/editor/Editor.ts:2415-2432` — `getShapesPageBounds()` + `Box.Common()` union algorithm
- `packages/editor/src/lib/editor/Editor.ts:3050-3070` — `pageToScreen()` / `screenToPage()` coordinate transforms
- `packages/tldraw/src/lib/canvas/TldrawSelectionForeground.tsx:110-250` — SVG overlay with 8 resize handles + 4 rotate corners, adaptive to zoom
- `packages/editor/src/lib/components/Shape.tsx:75-105` — transform caching via `useQuickReactor`
- `packages/state-react/src/lib/track.ts:100-170` — Proxy-based auto-memoization HOC

### Floating UI
- `packages/core/src/computePosition.ts:20` — async middleware loop API
- `packages/core/src/middleware/offset.ts:85` — canonical middleware signature
- `packages/dom/src/autoUpdate.ts:148` — scroll + ResizeObserver + IntersectionObserver + RAF unified sync

### Tiptap BubbleMenu
- `packages/extension-bubble-menu/src/bubble-menu-plugin.ts:266` — `virtualElement` computation for TextSelection / NodeSelection / CellSelection
- `packages/extension-bubble-menu/src/bubble-menu-plugin.ts:195` — `shouldShow()` visibility predicate
- `packages/extension-bubble-menu/src/bubble-menu-plugin.ts:432` — debounced position update (250ms default)

### React Flow
- `packages/react/src/components/NodesSelection/index.tsx:22-83` — selector union + absolutely-positioned bounding-box div
- `packages/react/src/components/NodeWrapper/index.tsx:186` — per-node `.selected` class alongside the separate bounding rect

### Excalidraw
- `packages/excalidraw/renderer/renderElement.ts:756` — canvas `strokeRect` for selection fill + border
- `packages/excalidraw/renderer/interactiveScene.ts:1345` — transform-handle canvas rendering, zoom-adaptive

### Perf machinery (cross-cutting)
- MDN: [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver), [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver), [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver), [Element.getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- React: [useLayoutEffect](https://react.dev/reference/react/useLayoutEffect), [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- FastDOM pattern ([github.com/wilsonpage/fastdom](https://github.com/wilsonpage/fastdom))

---

## Architecture findings

### Finding 1: tldraw's layer stack is DOM + SVG + Canvas, not pure-SVG
**Confidence:** CONFIRMED
**Evidence:** `DefaultCanvas.tsx`

Simplified layer stack:
```
.tl-canvas
├── .tl-html-layer.tl-shapes       ← per-shape DOM (user content)
├── .tl-overlays                    ← transparent hit-test layer
│   ├── <canvas> .tl-canvas-indicators   ← many-shape outlines in ONE canvas
│   ├── .tl-html-layer              ← shared transform with .tl-shapes
│   │   └── <svg> .tl-selection__fg ← selection box + handles
│   └── <svg> .tl-user-handles      ← per-shape custom handles
└── .tl-canvas__in-front            ← context menus, floating UI
```

**Key architectural points:**

1. **Two `.tl-html-layer` elements share a single CSS transform** — applied once via `useQuickReactor`. Shape DOM and selection-overlay SVG move together automatically as the camera pans/zooms. No per-element coordinate math.

2. **Canvas for many outlines, SVG for the selection box.** `CanvasShapeIndicators` renders ALL selected-shape outlines in one 2D-canvas `render` call (O(1) DOM nodes). The selection BOX + resize handles are SVG (O(1) elements, DOM-inspectable + a11y-amenable).

3. **Selection state is a signal, not a DOM class.** `editor.getSelectedShapeIds()` is `@computed`. Selection bounds are `@computed` over that. Re-rendering is automatic via signal subscription — no manual deps, no stale closures.

**Implication:** The naive idea of "one giant SVG overlay per selection" misses the nuance. Production pattern is *hybrid*: single CSS-transformed layer that contains both DOM and overlay, plus canvas for scale when the count is high.

---

### Finding 2: Shared-transform pattern eliminates per-element coordinate transforms
**Confidence:** CONFIRMED
**Evidence:** `DefaultCanvas.tsx:75-87`

```typescript
useQuickReactor('position layers', function positionLayersWhenCameraMoves() {
  const { x, y, z } = editor.getCamera()
  const transform = `scale(${z}) translate(${x}px,${y}px)`
  setStyleProperty(rHtmlLayer.current, 'transform', transform)   // shapes
  setStyleProperty(rHtmlLayer2.current, 'transform', transform)  // overlays
}, [editor, container])
```

Instead of recalculating screen-space positions for every shape + every selection handle on every camera change, tldraw applies a single CSS `transform` to the parent element and lets the browser compositor handle the rest.

**Implication for block editors:** If your editor has zoom/pan (unusual for rich-text), this is the right approach. For a typical rich-text editor without zoom, this pattern isn't needed — block positions are already in document flow.

---

### Finding 3: Canvas rendering for N indicators is an O(N) → O(1) DOM optimization
**Confidence:** CONFIRMED
**Evidence:** `CanvasShapeIndicators.tsx:235-290`

```typescript
useQuickReactor('canvas indicators render', () => {
  const ctx = canvasRef.current.getContext('2d')
  ctx.resetTransform()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr).scale(zoom, zoom).translate(cx, cy)

  // Single canvas pass for every selected shape outline
  for (const shapeId of idsToDisplay) {
    renderShapeIndicator(ctx, editor, shapeId, renderingShapeIds)
  }
}, [editor, $renderData])
```

Trade-off: canvas gives up DOM inspectability, a11y affordances, and CSS styling per-item. You get raw perf when the count is in hundreds/thousands.

**Implication for block editors:** Unlikely to matter. Even heavy-nesting block editors rarely have 500+ simultaneously-selected blocks. Inline CSS / SVG overlay is fine at realistic counts.

---

### Finding 4: Floating UI's virtual-element pattern decouples positioning from DOM presence
**Confidence:** CONFIRMED
**Evidence:** `bubble-menu-plugin.ts:266-330`

Floating UI's `computePosition(reference, floating, ...)` accepts any object with `getBoundingClientRect()` and `getClientRects()` as `reference`. Tiptap uses this to anchor to:

- **TextSelection** → `posToDOMRect(view, from, to)` — computed rect from PM positions
- **NodeSelection** → actual DOM node's `getBoundingClientRect()`
- **CellSelection** → `combineDOMRects(fromDOM, toDOM)` — union of two cells

```typescript
function combineDOMRects(rect1: DOMRect, rect2: DOMRect): DOMRect {
  return new DOMRect(
    Math.min(rect1.left, rect2.left),
    Math.min(rect1.top, rect2.top),
    Math.max(rect1.right, rect2.right) - Math.min(rect1.left, rect2.left),
    Math.max(rect1.bottom, rect2.bottom) - Math.min(rect1.top, rect2.top),
  )
}
```

**Implication:** Multi-select union for positioning an action toolbar above a N-block selection is a simple reduction: `blocks.map(el => el.getBoundingClientRect()).reduce(combineDOMRects)`. Works for any N.

---

### Finding 5: Floating UI's `autoUpdate` is the canonical position-sync loop
**Confidence:** CONFIRMED
**Evidence:** `packages/dom/src/autoUpdate.ts`

```typescript
export function autoUpdate(reference, floating, update, options = {}) {
  const ancestors = [...getOverflowAncestors(reference)]

  // Scroll listeners on ALL scroll ancestors (not just window)
  ancestors.forEach(a => a.addEventListener('scroll', update, { passive: true }))

  // ResizeObserver on both reference AND floating elements
  const resizeObserver = new ResizeObserver(([firstEntry]) => {
    // The elegant trick — unobserve + reobserve via RAF to avoid loops
    resizeObserver.unobserve(floating)
    cancelAnimationFrame(reobserveFrame)
    reobserveFrame = requestAnimationFrame(() => resizeObserver?.observe(floating))
    update()
  })

  // IntersectionObserver for layout-shift detection
  if (layoutShift) observeMove(referenceEl, update)

  // Optional RAF loop for animation-driven updates (transform-based motion)
  if (animationFrame) frameLoop()

  return cleanup
}
```

This combines five triggers (scroll, resize on ancestors, resize on elements, intersection, RAF) and batches them intelligently. It's the reference implementation for "keep this overlay synced to that element's position."

**Implication:** For a separate-layer selection overlay, you don't need to write this from scratch. Import `autoUpdate` from `@floating-ui/dom`. For single-element positioning (toolbar attached to selection), use it directly. For many-element positioning (N selection rings), wrap it in a per-element observer loop.

---

### Finding 6: `useLayoutEffect` over `useEffect` prevents position-sync flicker
**Confidence:** CONFIRMED
**Evidence:** React docs, observed across React Flow + Tiptap

```jsx
// WRONG — overlay flickers because useEffect runs AFTER paint
useEffect(() => {
  overlay.style.left = target.getBoundingClientRect().left + 'px'
}, [])

// RIGHT — useLayoutEffect runs BEFORE paint
useLayoutEffect(() => {
  overlay.style.left = target.getBoundingClientRect().left + 'px'
}, [])
```

For any measurement-then-positioning pattern, `useLayoutEffect` is mandatory. React warns about SSR usage but for editor code running client-side, it's the correct choice.

---

### Finding 7: `useSyncExternalStore` prevents concurrent-mode tearing
**Confidence:** CONFIRMED
**Evidence:** React 18 docs, used by tldraw's `useValue` internally

Under React 18 concurrent mode, renders can be paused and resumed. If a selection-position store is mutated during a paused render, the resumed render uses stale data — the overlay visually "tears" between states.

```jsx
// Subscribe to external position store safely
const position = useSyncExternalStore(
  positionStore.subscribe,
  positionStore.getSnapshot
)
```

**Implication:** For any selection-overlay architecture that tracks positions outside React state (signals, plain objects, etc.), `useSyncExternalStore` is the safe subscription primitive. tldraw's `useValue` wraps this internally.

---

### Finding 8: FastDOM's measure-then-mutate pattern prevents layout thrash
**Confidence:** CONFIRMED
**Evidence:** FastDOM library, `web.dev/rendering-performance`

```typescript
class BatchDOM {
  reads = []
  writes = []
  schedule() {
    requestAnimationFrame(() => {
      // Phase 1: ALL reads (getBoundingClientRect, etc.)
      const measurements = this.reads.map(fn => fn())
      this.reads = []
      // Phase 2: ALL writes (style mutations)
      this.writes.forEach(fn => fn(measurements))
      this.writes = []
    })
  }
}
```

For many selected blocks: batch all measurements first, then apply all position updates. Avoids the read→write→read→write pattern that forces N synchronous layouts.

---

### Finding 9: IntersectionObserver enables virtualization for many-select
**Confidence:** CONFIRMED
**Evidence:** MDN IntersectionObserver; standard virtualization pattern (tanstack-virtual, react-window)

For 500+ selected blocks, don't render 500 overlay rects. Use `IntersectionObserver` to render overlays only for blocks in viewport (+ overscan margin). When blocks scroll out, remove their overlays; when they scroll in, create them.

---

### Finding 10: Tiptap BubbleMenu's `shouldShow` is the canonical visibility gate
**Confidence:** CONFIRMED
**Evidence:** `bubble-menu-plugin.ts:195-210`

```typescript
public shouldShow = ({ view, state, from, to }) => {
  const { empty } = state.selection
  const isEmptyTextBlock = !state.doc.textBetween(from, to).length && isTextSelection(state.selection)
  const hasEditorFocus = view.hasFocus() || this.element.contains(document.activeElement)

  return hasEditorFocus && !empty && !isEmptyTextBlock && this.editor.isEditable
}
```

A visibility gate that checks: editor-has-focus, selection-not-empty, selection-not-an-empty-block, editor-is-editable. Runs before position computation — saves the cost of measuring when the overlay should be hidden anyway.

**Implication:** Always gate visibility with a predicate. Don't rely on `display: none` after positioning — skip the position computation entirely for hidden overlays.

---

### Finding 11: React Flow uses a two-layer pattern (per-node class + separate bounding-box div)
**Confidence:** CONFIRMED
**Evidence:** `NodesSelection/index.tsx:22-83`, `NodeWrapper/index.tsx:186`

React Flow does NOT render selection purely as a separate layer. It applies:
1. `.selected` CSS class on each selected node's wrapper (inline styling)
2. A SEPARATE absolutely-positioned `.react-flow__nodesselection-rect` div sized to the union bounds

```jsx
<div className={cc({ selected: node.selected, selectable, parent, dragging })}>
  {/* node content */}
</div>

{/* Elsewhere, for multi-select */}
<div className="react-flow__nodesselection" style={{ transform: viewportTransform }}>
  <div className="react-flow__nodesselection-rect" style={{ width, height }} />
</div>
```

**Implication:** You can mix approaches. Per-item selection via CSS class (for crisp inline styling) + a separate union rect div (for multi-select affordance). Not purely layer-based.

---

### Finding 12: Excalidraw is canvas-native and not portable as a DOM pattern
**Confidence:** CONFIRMED
**Evidence:** `renderElement.ts:756`, `interactiveScene.ts:1345`

Excalidraw draws selection + handles directly to canvas. Zero DOM. The zoom-aware scaling pattern (`lineWidth / zoom`, handle size `/ zoom`) is transferable, but the rendering pipeline itself isn't applicable to a rich-text editor that needs DOM for text content.

**Lesson worth extracting:** zoom-aware handle size. If a block editor has any scaling, handle/indicator thickness should divide by zoom so they stay visually consistent.

---

## When is separate-layer rendering worth it for a rich-text block editor?

### Signals that say YES
- **Multi-select with group operations** (drag multiple, resize multiple, delete multiple) is a core feature
- **Resize or rotation handles** for media blocks beyond what the block's own chrome provides
- **Zoom/pan** is a product feature (rare for rich-text)
- **Canvas-style features** like lasso-select across blocks, bounding-box manipulation
- **Multi-cursor collaboration indicators** across blocks (each peer's selection drawn separately)
- The block editor has 500+ blocks and multi-select spans most of them
- Action toolbar that tracks selection precisely (Tiptap BubbleMenu — this is LOW overhead)

### Signals that say NO
- Selection is single-block at a time
- Blocks have their own chrome that can carry the selection indicator (border-color swap, overlay tint, behind-halo)
- No zoom/pan
- Multi-select renders fine as per-block class
- <100 blocks typical

### Middle ground
Most rich-text block editors (including the app this report was commissioned for) sit in the **NO** bucket for selection outline but the **YES** bucket for action toolbars. The practical answer is:

1. **Keep inline CSS techniques** (T9 border-color swap, T10 `::before` halo, T11 `::after` overlay) **for the selection outline.** Simpler code, better a11y, works with existing block chrome.
2. **Use Floating UI + virtual elements** (Tiptap BubbleMenu pattern) **for toolbar positioning.** This is mature, battle-tested, solves scroll/resize sync out of the box, composes well.
3. **Defer separate-layer outlines** until you add multi-select-with-group-operations or media-block resize handles.

The heavy investment (tldraw-style signal store, canvas indicators, shared transforms) pays off only for canvas/design-tool-class products. For a rich-text block editor, it's massive complexity for a modest visual upgrade.

---

## Complexity cost estimate

For reference, to replicate even a minimal tldraw-style separate-layer selection in a ProseMirror-based editor:

| Component | LoC estimate | Complexity |
|---|---|---|
| Signal/atom store for selection state | 200-400 | Medium |
| Coordinate transforms (if zoom needed) | 100-200 | Medium |
| Overlay layer React component | 300-500 | Medium |
| Handle rendering (resize only) | 200-400 | Medium |
| Handle event dispatch + hit testing | 150-300 | Medium-High |
| Position sync machinery (ResizeObserver + RAF + scroll) | 100-200 | Medium |
| Multi-select union computation | 50-100 | Low |
| Keyboard navigation integration | 100-200 | Medium |
| A11y (ARIA, focus management) | 150-300 | High |
| **Total baseline** | **~1400-2600 LoC** | — |

For comparison, the inline-CSS techniques in §CSS techniques (T9/T10/T11) are ~20-100 LoC total per variant.

---

## Gaps / follow-ups

- **BlockNote's implementation** — uses Mantine + React internally; whether it leans toward tldraw-style layers or inline CSS not surfaced.
- **AFFiNE edgeless mode** — hybrid DOM blocks + canvas selection. Architecture not deeply explored.
- **Excalidraw's Canvas+DOM hybrid a11y layer** — Agent β proposed this architecturally but no production example was found.
- **Performance benchmarks** — we have the patterns but not hard numbers on "how much does tldraw's signal architecture cost vs. naive React re-render for 100 blocks." Would require a dedicated benchmark harness.
