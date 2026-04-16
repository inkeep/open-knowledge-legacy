/**
 * computeSelectionAnchor — pure virtual-element builder for Floating UI
 * (Precedent #19).
 *
 * Takes a PM view + the plugin-derived BlockSelection and returns a
 * reference object compatible with `@floating-ui/dom`'s `computePosition` +
 * `autoUpdate`. Returns `null` when nothing is selected (plugin returns
 * a null-selectedBlockId state, or the wrapper DOM can't be resolved).
 *
 * Extracted as a pure function so unit tests can assert DOMRect shape
 * without spinning up Floating UI machinery. The hook
 * (`useSelectionAnchoredPopover`) composes this with `computePosition` +
 * `autoUpdate`.
 *
 * Virtual-element contract (Floating UI): both `getBoundingClientRect()`
 * and `getClientRects()` must return DOMRect-like objects for every
 * computePosition call. `getClientRects()` returns `[rect]` — a single-
 * element list — because a selected block is a single visually-contiguous
 * region (even if semantically it has children).
 */

import { posToDOMRect } from '@tiptap/core';
import { NodeSelection, type Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { BlockSelection } from '../extensions/selection-state-plugin.ts';

/** Floating UI `ReferenceElement` subset used here. The library's formal
 *  `VirtualElement` type is a superset; this shape satisfies every consumer
 *  without pulling the full `@floating-ui/utils` dep surface into our code. */
export interface SelectionVirtualElement {
  getBoundingClientRect: () => DOMRect;
  getClientRects: () => DOMRect[];
  /** Optional `contextElement` — Floating UI's `autoUpdate` uses this to
   *  discover scroll-ancestor listeners automatically. Returning the editor
   *  DOM is the standard pattern (Tiptap BubbleMenu uses the same). */
  readonly contextElement?: Element;
}

/**
 * Build a virtual-element reference for the current block selection.
 *
 * Strategy:
 *   1. If a block is selected AND the plugin's innermost chain entry has a
 *      resolvable DOM node via `view.nodeDOM(pos)`, return a reference whose
 *      rects track that node's bounding box. This is the primary path —
 *      covers NodeSelection on a jsxComponent.
 *   2. Otherwise, fall back to `posToDOMRect(view, from, to)` over the
 *      current PM selection (covers text selections inside a jsxComponent,
 *      CellSelection, etc.). This matches the Tiptap BubbleMenu strategy.
 *   3. If neither path produces a usable rect, return null.
 *
 * Always returns fresh rects on every `getBoundingClientRect()` call —
 * Floating UI's `autoUpdate` invokes these closures each tick, so the
 * rects track scroll/resize automatically without any caching in this
 * module.
 */
export function computeSelectionAnchor(
  view: EditorView,
  blockSelection: BlockSelection | null,
): SelectionVirtualElement | null {
  if (!view) return null;

  // Path 1: plugin reports a selected block. Prefer the wrapper's DOM node
  // because its rect is the visually-correct halo boundary, not just the
  // text selection within it.
  const innermost = blockSelection?.ancestorChain[blockSelection.ancestorChain.length - 1];
  if (innermost) {
    const anchor = buildAnchorForPos(view, innermost.pos);
    if (anchor) return anchor;
  }

  // Path 2: fallback to posToDOMRect over the raw PM selection. Covers
  // text inside a jsxComponent and NodeSelection on a non-jsxComponent
  // node (which the plugin won't recognize, but still wants a reference).
  const sel: Selection = view.state.selection;
  if (sel.empty && !(sel instanceof NodeSelection)) {
    // No selection span to anchor to.
    return null;
  }
  const rectFn = () => {
    try {
      return posToDOMRect(view, sel.from, sel.to);
    } catch {
      return createEmptyRect();
    }
  };
  return {
    getBoundingClientRect: rectFn,
    getClientRects: () => [rectFn()],
    contextElement: view.dom,
  };
}

/**
 * Create a zero-sized rect in a form compatible with both browser DOMRect
 * and headless test environments (Bun's test runtime doesn't expose DOMRect
 * as a global). Satisfies Floating UI's ReferenceElement shape — consumers
 * only read {x, y, width, height, top, left, right, bottom}.
 */
function createEmptyRect(): DOMRect {
  if (typeof globalThis.DOMRect !== 'undefined') return new DOMRect();
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  } as DOMRect;
}

/**
 * Build a virtual-element reference anchored to the DOM node at `pos`.
 * Returns null when the node's DOM isn't resolvable (brief during mount,
 * or after deletion).
 */
function buildAnchorForPos(view: EditorView, pos: number): SelectionVirtualElement | null {
  // `view.nodeDOM(pos)` returns the DOM representation of the node at pos.
  // For a jsxComponent with a React NodeView, this is the `.jsx-component-wrapper`.
  // Duck-type the returned value — `instanceof HTMLElement` would reference a
  // browser global that isn't present in the headless test runtime.
  const dom = view.nodeDOM(pos);
  if (!isElementWithRect(dom)) {
    return null;
  }
  return {
    getBoundingClientRect: () => dom.getBoundingClientRect(),
    // For a single contiguous block, getClientRects returns [rect] — same
    // as the element's own getClientRects() but we normalize to an array
    // since Floating UI's typing expects that shape.
    getClientRects: () => [dom.getBoundingClientRect()],
    contextElement: view.dom,
  };
}

function isElementWithRect(dom: unknown): dom is { getBoundingClientRect: () => DOMRect } {
  return (
    typeof dom === 'object' &&
    dom !== null &&
    'getBoundingClientRect' in dom &&
    typeof (dom as { getBoundingClientRect: unknown }).getBoundingClientRect === 'function'
  );
}
