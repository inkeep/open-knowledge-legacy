/**
 * SelectionStatePlugin — the canonical block-selection state store (Precedent #29).
 *
 * Derives a typed {selectedBlockId, ancestorChain, selectionOrigin, isDragging}
 * state from the current PM selection + event-classified origin. One source of
 * truth for every selection-adjacent surface — NodeView `data-*` attrs,
 * Breadcrumb, aria-live announcer, selection-anchored popovers.
 *
 * Replaces three patterns previously duplicated across the codebase:
 *   - `.is-selected` className toggled from `NodeViewProps.selected`.
 *   - Per-NodeView `$pos.node(depth)` walks to compute ancestor chains.
 *   - Ad-hoc `:has()`-based innermost-wins CSS rules.
 *
 * Read-only over the PM doc: never mutates document content. Meta-only
 * transactions ARE dispatched (see `scheduleRefresh` below) to flow
 * drag/selection signalling through PM's standard apply pipeline —
 * these carry no doc steps and leave the bridge invariant (CLAUDE.md
 * SC-INV-1) unchanged.
 *
 * Origin classification is event-driven (not tx-heuristic): DOM
 * pointerdown/mousedown → 'pointer'; keydown on nav keys → 'keyboard'; a
 * transaction stamped with `SELECTION_ORIGIN_META_KEY` → 'programmatic'
 * (covers agent writes + imperative test-harness `setNodeSelection`). The
 * discipline of one typed meta key per origin category extends Precedent #1
 * (typed transaction origins).
 *
 * Drag tracking: HTML5 `dragstart` / `dragend` / `drop` on `view.dom`
 * toggle `isDragging`. The CSS layer uses this to suppress the halo
 * mid-drag. `drop` is included because a cancelled drag sometimes ends
 * in a drop without a preceding dragend in current browser behavior.
 *
 * Subscription model: the canonical React integration is
 * `useBlockSelection(editor)` (see `../hooks/use-block-selection.ts`), which
 * wires through TipTap's `transaction` + `selectionUpdate` events — the same
 * path used by BubbleMenu and SideMenu. Non-React callers read imperatively
 * via `getBlockSelection(editor)` and listen directly to TipTap events.
 */

import { type Editor, Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { bridgeIdPluginKey } from './bridge-id-plugin.ts';

// ── Types ────────────────────────────────────────────────────────────────

export type SelectionOrigin = 'keyboard' | 'pointer' | 'programmatic';

export interface BlockChainEntry {
  /** Stable bridgeId for the jsxComponent wrapper, or a position-derived
   *  fallback when y-prosemirror binding hasn't published a mapping yet
   *  (briefly true at editor init — not in steady state). */
  readonly bridgeId: string;
  /** Descriptor name, e.g. "Card", "Steps", "Callout". */
  readonly componentName: string;
  /** PM position of the jsxComponent wrapper's start (index of `<` in doc). */
  readonly pos: number;
}

/**
 * INVARIANT: `selectedBlockId` and `ancestorChain` are always in agreement —
 * either both express "no block selected" (`selectedBlockId === null` AND
 * `ancestorChain.length === 0`) or both express "block selected"
 * (`selectedBlockId !== null` AND `ancestorChain[ancestorChain.length - 1]
 * .bridgeId === selectedBlockId`).
 *
 * This invariant is enforced by `deriveBlockSelection` being the SOLE
 * constructor in this module. Consumers safely guard on either field; both
 * resolve to the same selected/not-selected state.
 *
 * If a second constructor is ever added (e.g. multi-block range selection,
 * imperative test-harness selection injection), refactor to a discriminated
 * union (`{ kind: 'none' | 'selected' }`) so the type system enforces the
 * invariant at the API boundary instead of relying on constructor discipline.
 * Declined as premature in v1 (one producer — `deriveBlockSelection` —
 * guarantees the invariant by construction); worth the lift the moment a
 * second constructor lands.
 */
export interface BlockSelection {
  /** bridgeId of the innermost selected jsxComponent, or null if no block selected. */
  readonly selectedBlockId: string | null;
  /** Ancestor chain outer→innermost. Empty when no block is selected. */
  readonly ancestorChain: readonly BlockChainEntry[];
  /** How this selection was initiated. */
  readonly selectionOrigin: SelectionOrigin;
  /** True while an HTML5 drag is active (set by `dragstart`, cleared by `dragend`). */
  readonly isDragging: boolean;
}

// ── Tr-meta keys ─────────────────────────────────────────────────────────

/** PM transaction meta key — consumers that want to override origin
 *  classification set `tr.setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic')`.
 *  The plugin's `apply` checks this before consulting the DOM-event-derived
 *  `pendingOrigin`. Used by agent writes and imperative `setNodeSelection`
 *  in the test harness.
 *
 *  Note on Precedent #1: that precedent governs Y.Doc transaction origins
 *  (typed `LocalTransactionOrigin` objects, identity-matched). PM tr-meta
 *  keys are a different surface — PM's `tr.getMeta(key)` API takes string
 *  or PluginKey instances. We use a unique namespaced string here, in line
 *  with PM convention. */
export const SELECTION_ORIGIN_META_KEY = 'selectionStatePlugin/origin';

/** PM transaction meta key for the plugin's own meta-only refresh
 *  transactions (dragstart / dragend / drop → re-run apply with new
 *  isDragging). Tagged so `apply` can distinguish "we dispatched this
 *  to surface a runtime change" from "the user did something" and not
 *  consume `pendingOrigin` on these passes. */
const SELECTION_REFRESH_META_KEY = 'selectionStatePlugin/refresh';

// ── PluginKey + imperative API ───────────────────────────────────────────

export const selectionStatePluginKey = new PluginKey<BlockSelection>('selectionState');

const EMPTY_SELECTION: BlockSelection = {
  selectedBlockId: null,
  ancestorChain: [],
  selectionOrigin: 'programmatic',
  isDragging: false,
};

/** Imperative read — returns the current plugin state or a safe empty value
 *  if the plugin is not registered (e.g. in a harness without this extension).
 *
 *  For React subscription, use `useBlockSelection(editor)` from
 *  `../hooks/use-block-selection.ts` — it wires TipTap's `transaction` +
 *  `selectionUpdate` events, matching the BubbleMenu / SideMenu pattern.
 *  Non-React callers that need change notification should listen to those
 *  events directly and call `getBlockSelection(editor)` inside the handler. */
export function getBlockSelection(editor: Editor): BlockSelection {
  const state = selectionStatePluginKey.getState(editor.state);
  return state ?? EMPTY_SELECTION;
}

// ── Ancestry derivation (pure) ───────────────────────────────────────────

/**
 * Walk `$from.node(depth)` outward, collecting every jsxComponent ancestor.
 * Returns chain outer→innermost.
 *
 * Exported for unit testing. In-plugin callers use `deriveBlockSelection`.
 */
export function deriveAncestorChain(
  state: EditorState,
  selection: EditorState['selection'],
): BlockChainEntry[] {
  const chain: BlockChainEntry[] = [];

  // Start with the selection's $from path. For a NodeSelection on a
  // jsxComponent, $from.node($from.depth + 1) is the node itself — include it.
  const { $from } = selection;

  // Collect ancestors from depth 0 → $from.depth (outer → inner).
  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth);
    if (node.type.name !== 'jsxComponent') continue;
    // $from.before(depth) is the position just before the node at that depth.
    const pos = $from.before(depth);
    chain.push(toChainEntry(state, node, pos));
  }

  // Special case: NodeSelection sitting ON a jsxComponent. The node itself is
  // at $from.nodeAfter, NOT in the $from.node(depth) walk above (because
  // node(depth) returns the parent at that depth, not the child). Include it
  // so the innermost selected Card-in-Cards shows up as the tail.
  if (selection instanceof NodeSelection) {
    const node = selection.node;
    if (node.type.name === 'jsxComponent') {
      chain.push(toChainEntry(state, node, selection.from));
    }
  }

  return chain;
}

function toChainEntry(state: EditorState, node: PMNode, pos: number): BlockChainEntry {
  const componentName = (node.attrs.componentName as string | undefined) ?? 'unknown';
  return { bridgeId: getWrapperBridgeId(state, pos), componentName, pos };
}

/**
 * Canonical lookup: get the stable bridgeId for a jsxComponent wrapper at a
 * given position.
 *
 * **Production:** `BridgeIdPlugin` is registered in `sharedExtensions` and its
 * `init` walks the doc to assign every jsxComponent a `b{N}`-style ID
 * synchronously, even before y-prosemirror has built its Y.XmlElement
 * mapping. After init, every jsxComponent in the doc has an entry in the
 * plugin's `posToId` map at steady state. The position-derived fallback
 * below is still hit during the init window BEFORE y-prosemirror has
 * published its binding (and in any future surface that accesses
 * `getWrapperBridgeId` before BridgeIdPlugin.apply has run) — brief,
 * but non-zero. Do not rely on the fallback's stability; it's a
 * best-effort breadcrumb for components that couldn't be keyed yet.
 *
 * **Tests / harness without BridgeIdPlugin:** the fallback returns a
 * `pos-N` synthetic. This path is positional and unstable across edits,
 * which is acceptable in unit-test contexts where edits don't shift
 * positions of nodes that need bridge-id stability. Do not rely on the
 * synthetic ID's stability in any new production path.
 *
 * NodeView consumers (e.g. JsxComponentView) use this to compare against
 * `BlockSelection.selectedBlockId` / `ancestorChain[].bridgeId` — both must
 * resolve from this single helper so the fallback paths match.
 */
export function getWrapperBridgeId(state: EditorState, pos: number): string {
  return bridgeIdPluginKey.getState(state)?.posToId.get(pos) ?? `pos-${pos}`;
}

/**
 * Compute the full BlockSelection from the current editor state + origin hints.
 * Pure — no side effects. Used by the plugin `apply` and testable in isolation.
 */
export function deriveBlockSelection(
  state: EditorState,
  prev: BlockSelection,
  overrides: { origin?: SelectionOrigin; isDragging?: boolean } = {},
): BlockSelection {
  const chain = deriveAncestorChain(state, state.selection);
  const innermost = chain[chain.length - 1];
  const next: BlockSelection = {
    selectedBlockId: innermost?.bridgeId ?? null,
    ancestorChain: chain,
    selectionOrigin: overrides.origin ?? prev.selectionOrigin,
    isDragging: overrides.isDragging ?? prev.isDragging,
  };
  // Identity preservation — if derived state is structurally identical to
  // prev, return prev. `useSyncExternalStore` bails out on ===, so this is
  // load-bearing for React re-render minimization.
  if (blockSelectionEqual(prev, next)) return prev;
  return next;
}

function blockSelectionEqual(a: BlockSelection, b: BlockSelection): boolean {
  if (a === b) return true;
  if (a.selectedBlockId !== b.selectedBlockId) return false;
  if (a.selectionOrigin !== b.selectionOrigin) return false;
  if (a.isDragging !== b.isDragging) return false;
  if (a.ancestorChain.length !== b.ancestorChain.length) return false;
  for (let i = 0; i < a.ancestorChain.length; i++) {
    const x = a.ancestorChain[i];
    const y = b.ancestorChain[i];
    if (x.bridgeId !== y.bridgeId) return false;
    if (x.componentName !== y.componentName) return false;
    if (x.pos !== y.pos) return false;
  }
  return true;
}

// ── TipTap Extension ─────────────────────────────────────────────────────

/**
 * Internal mutable ref for the plugin — holds pending DOM-event-classified
 * origin + isDragging, consumed by the next `apply`.
 *
 * Stored per-plugin-instance via a WeakMap keyed on the plugin. (PM plugins
 * are long-lived singletons, so this is effectively per-editor.)
 */
export interface PluginRuntime {
  pendingOrigin: SelectionOrigin | null;
  isDragging: boolean;
}

const RUNTIME = new WeakMap<Plugin<BlockSelection>, PluginRuntime>();

/**
 * Pure apply logic — testable without TipTap or DOM. Mutates `runtime`
 * in-place to consume `pendingOrigin` on selection-changing transactions.
 *
 * Origin precedence (highest → lowest):
 *   1. `metaOrigin` — caller-controlled, e.g. agent-write, programmatic
 *      `setNodeSelection`. Wins absolutely.
 *   2. `pendingOrigin` — DOM-event-derived ('pointer' / 'keyboard'),
 *      consumed only when this tx changes the selection. Foreign
 *      transactions (y-prosemirror remote sync, plugin refresh) that
 *      don't change selection do NOT consume the pending origin —
 *      otherwise a remote sync arriving between user click and PM's
 *      selection-set would steal the classification.
 *   3. `prev.selectionOrigin` — carry-forward when nothing newer applies.
 *
 * Drag state: read from runtime on every apply (no pendingOrigin
 * coupling); the plugin's view() drag handlers schedule a refresh tx that
 * triggers apply, which then reflects the new isDragging.
 */
export function computeSelectionApply(
  tr: import('@tiptap/pm/state').Transaction,
  prev: BlockSelection,
  newState: EditorState,
  runtime: PluginRuntime | undefined,
): BlockSelection {
  const isDragging = runtime?.isDragging ?? prev.isDragging;

  // Selection-changed gate: only consume pendingOrigin when this tx
  // actually moved the selection. PM exposes `tr.selectionSet` for this.
  // Refresh transactions (drag) explicitly disclaim consumption regardless.
  const isRefreshTx = Boolean(tr.getMeta(SELECTION_REFRESH_META_KEY));
  const consumesPending = tr.selectionSet && !isRefreshTx;

  const metaOrigin = tr.getMeta(SELECTION_ORIGIN_META_KEY) as SelectionOrigin | undefined;
  const pendingOrigin = consumesPending ? (runtime?.pendingOrigin ?? null) : null;
  const origin = metaOrigin ?? pendingOrigin ?? prev.selectionOrigin;

  // Consume pendingOrigin only when we actually used (or could have used) it.
  // A foreign tx that doesn't change selection leaves the pending origin
  // intact, so the user's NEXT selection change still picks it up.
  if (consumesPending && runtime) runtime.pendingOrigin = null;

  return deriveBlockSelection(newState, prev, { origin, isDragging });
}

export const SelectionStatePlugin = Extension.create({
  name: 'selectionStatePlugin',

  addProseMirrorPlugins() {
    const editor = this.editor as Editor;

    const plugin = new Plugin<BlockSelection>({
      key: selectionStatePluginKey,

      state: {
        init(_config, state): BlockSelection {
          return deriveBlockSelection(state, EMPTY_SELECTION);
        },

        apply(tr, prev, _oldState, newState): BlockSelection {
          return computeSelectionApply(tr, prev, newState, RUNTIME.get(plugin));
        },
      },

      props: {
        handleDOMEvents: {
          // Pointer events fire before PM commits the selection-changing tx.
          // Set pendingOrigin; next `apply` consumes it.
          mousedown: () => {
            const runtime = RUNTIME.get(plugin);
            if (runtime) runtime.pendingOrigin = 'pointer';
            return false;
          },
          pointerdown: () => {
            const runtime = RUNTIME.get(plugin);
            if (runtime) runtime.pendingOrigin = 'pointer';
            return false;
          },
          // Drag events intentionally handled in view() via capture-phase
          // listeners (below) — NodeView wrappers' stopEvent() intercepts
          // drag events before PM's handleDOMEvents chain runs, so capture
          // phase on view.dom is the only reliable registration point.
        },
        handleKeyDown: (_view, event) => {
          // Classify arrow/tab/escape/enter as keyboard-origin; other keys
          // don't move the block selection, so they're irrelevant.
          if (isBlockNavigationKey(event.key)) {
            const runtime = RUNTIME.get(plugin);
            if (runtime) runtime.pendingOrigin = 'keyboard';
          }
          return false;
        },
      },

      view(view: EditorView) {
        RUNTIME.set(plugin, { pendingOrigin: null, isDragging: false });

        // Drag listeners on view.dom in CAPTURE phase. NodeView wrappers
        // (e.g. jsxComponent's React portal root) can set pmViewDesc.stopEvent
        // for drag events, which short-circuits PM's handleDOMEvents chain.
        // Capture phase on view.dom fires BEFORE any descendant handler,
        // guaranteeing we observe the drag lifecycle regardless of NodeView
        // stopEvent policies.
        const onDragStart = () => {
          const runtime = RUNTIME.get(plugin);
          if (!runtime) return;
          runtime.isDragging = true;
          scheduleRefresh(editor);
        };
        const onDragEnd = () => {
          const runtime = RUNTIME.get(plugin);
          if (!runtime) return;
          runtime.isDragging = false;
          scheduleRefresh(editor);
        };

        view.dom.addEventListener('dragstart', onDragStart, true);
        view.dom.addEventListener('dragend', onDragEnd, true);
        view.dom.addEventListener('drop', onDragEnd, true);

        return {
          destroy: () => {
            view.dom.removeEventListener('dragstart', onDragStart, true);
            view.dom.removeEventListener('dragend', onDragEnd, true);
            view.dom.removeEventListener('drop', onDragEnd, true);
            RUNTIME.delete(plugin);
          },
        };
      },
    });

    return [plugin];
  },
});

/** Exported pure helper — exported so `selection-state-plugin.test.ts` can
 *  assert the full key list without exercising the keydown handler. The
 *  branching here determines which keys tag the pending origin as
 *  `'keyboard'`; a future refactor that drops e.g. PageUp/PageDown would
 *  regress origin classification silently, and the E2E test only exercises
 *  ArrowDown. */
export function isBlockNavigationKey(key: string): boolean {
  return (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Tab' ||
    key === 'Escape' ||
    key === 'Enter' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'PageUp' ||
    key === 'PageDown'
  );
}

/**
 * Dispatch a meta-only transaction to force PM to re-run `apply` so the
 * plugin state reflects the latest runtime (e.g. after dragstart/dragend
 * toggled `isDragging`). The tx mutates no document content — only PM's
 * tx pipeline propagates the runtime change to subscribers.
 *
 * Tagged with `SELECTION_REFRESH_META_KEY` so `computeSelectionApply` can
 * distinguish "we dispatched this to surface a runtime change" from
 * "the user did something" and not consume `pendingOrigin` on these
 * passes.
 *
 * Note: this is the ONE intentional case where the plugin dispatches a tx.
 * The plugin remains read-only with respect to the PM doc (SC-INV-1
 * preserved); the dispatch is a meta-only signal carrier, not a doc
 * mutation. The CLAUDE.md Precedent #29 docstring acknowledges this.
 */
function scheduleRefresh(editor: Editor): void {
  // The dragstart/dragend may fire during PM's internal event processing.
  // Deferring to the next microtask ensures we don't dispatch mid-tr.
  queueMicrotask(() => {
    // Pre-check inside the microtask (not before enqueue): destruction can
    // happen between enqueue and execution. Matches the TipTap community
    // idiom for extensions that dispatch async (ueberdosis/tiptap#3798).
    if (editor.isDestroyed) return;
    try {
      const tr = editor.state.tr.setMeta(SELECTION_REFRESH_META_KEY, true);
      editor.view.dispatch(tr);
    } catch {
      // Defense-in-depth for the race window between `isDestroyed` check
      // and `dispatch` execution — both can be straddled by a final
      // teardown on the event loop.
    }
  });
}
