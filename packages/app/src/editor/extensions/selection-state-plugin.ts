/**
 * SelectionStatePlugin — the canonical block-selection state store (Precedent #15).
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
 * Read-only over the PM doc. Never dispatches a transaction that mutates the
 * document — bridge invariant (CLAUDE.md SC-INV-1) is preserved.
 *
 * Origin classification (Precedent #8 analog — event-layer truth, not tx
 * heuristics): DOM pointerdown/mousedown → 'pointer'; keydown → 'keyboard';
 * transactions stamped with `SELECTION_ORIGIN_META` → 'programmatic'.
 *
 * Drag tracking: HTML5 dragstart/dragend on `view.dom` toggles `isDragging`.
 * The CSS layer uses this to suppress the halo mid-drag.
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
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

// ── Typed transaction origins (Precedent #1) ─────────────────────────────

/**
 * Transaction meta-origin callers can stamp to force the plugin to record
 * the selection as `'programmatic'` (e.g. agent writes, imperative
 * `setNodeSelection` from test harness).
 *
 * Object identity, not a string — `Set.has()` matching in `trackedOrigins`
 * is identity-based; string literals silently fail.
 */
export const SELECTION_ORIGIN_META = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'selection-origin-override' },
} satisfies LocalTransactionOrigin;

/** PM transaction meta key — consumers that want to override origin classification
 *  set `tr.setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic')`. The plugin's
 *  `apply` checks this before consulting the DOM-event-derived pendingOrigin. */
export const SELECTION_ORIGIN_META_KEY = 'selectionStatePlugin/origin';

// ── PluginKey + imperative API ───────────────────────────────────────────

export const selectionStatePluginKey = new PluginKey<BlockSelection>('blockSelectionState');

const EMPTY_SELECTION: BlockSelection = {
  selectedBlockId: null,
  ancestorChain: [],
  selectionOrigin: 'programmatic',
  isDragging: false,
};

/** Imperative read — returns the current plugin state or a safe empty value
 *  if the plugin is not registered (e.g. in a harness without this extension). */
export function getBlockSelection(editor: Editor): BlockSelection {
  const state = selectionStatePluginKey.getState(editor.state);
  return state ?? EMPTY_SELECTION;
}

/** Imperative subscribe — React hooks use `useSyncExternalStore` against this.
 *  Non-React callers can subscribe directly for imperative needs. */
export function subscribeBlockSelection(editor: Editor, onChange: () => void): () => void {
  const emitter = getEmitter(editor);
  emitter.listeners.add(onChange);
  return () => {
    emitter.listeners.delete(onChange);
  };
}

// ── Per-editor emitter (no globals) ──────────────────────────────────────

interface Emitter {
  listeners: Set<() => void>;
  lastState: BlockSelection | null;
}

const EMITTERS = new WeakMap<Editor, Emitter>();

function getEmitter(editor: Editor): Emitter {
  let emitter = EMITTERS.get(editor);
  if (!emitter) {
    emitter = { listeners: new Set(), lastState: null };
    EMITTERS.set(editor, emitter);
  }
  return emitter;
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
 * given position, or a position-derived synthetic fallback when
 * bridge-id-plugin hasn't published a mapping yet (brief during editor init)
 * or isn't registered (unit tests with pure PM).
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
interface PluginRuntime {
  pendingOrigin: SelectionOrigin | null;
  isDragging: boolean;
}

const RUNTIME = new WeakMap<Plugin<BlockSelection>, PluginRuntime>();

/**
 * Notify subscribers if the plugin state changed reference-wise.
 * Called from `view.update` (PM plugin lifecycle) so listeners see the
 * final committed state, not a mid-apply intermediate.
 */
function notifyIfChanged(editor: Editor): void {
  const emitter = getEmitter(editor);
  const current = getBlockSelection(editor);
  if (emitter.lastState === current) return;
  emitter.lastState = current;
  for (const listener of emitter.listeners) {
    try {
      listener();
    } catch (err) {
      // Defense-in-depth: a subscriber throwing must not break others.
      console.warn('[selection-state] subscriber threw', err);
    }
  }
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
          const runtime = RUNTIME.get(plugin);
          const pendingOrigin = runtime?.pendingOrigin ?? null;
          const isDragging = runtime?.isDragging ?? prev.isDragging;

          // Programmatic override wins over pending event classification.
          const metaOrigin = tr.getMeta(SELECTION_ORIGIN_META_KEY) as SelectionOrigin | undefined;
          const origin = metaOrigin ?? pendingOrigin ?? prev.selectionOrigin;

          // Consume pendingOrigin — next selection change re-derives it from events.
          if (runtime) runtime.pendingOrigin = null;

          const next = deriveBlockSelection(newState, prev, {
            origin,
            isDragging,
          });
          return next;
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
          update: () => {
            notifyIfChanged(editor);
          },
          destroy: () => {
            view.dom.removeEventListener('dragstart', onDragStart, true);
            view.dom.removeEventListener('dragend', onDragEnd, true);
            view.dom.removeEventListener('drop', onDragEnd, true);
            RUNTIME.delete(plugin);
            EMITTERS.delete(editor);
          },
        };
      },
    });

    return [plugin];
  },
});

function isBlockNavigationKey(key: string): boolean {
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
 * Dispatch a no-op transaction to force PM to re-run `apply` so the plugin
 * state reflects the latest runtime (e.g. after dragstart/dragend). Uses
 * `setMeta` with a benign key so the transaction is visible to observers
 * but mutates nothing.
 */
function scheduleRefresh(editor: Editor): void {
  // The dragstart/dragend may fire during PM's internal event processing.
  // Deferring to the next microtask ensures we don't dispatch mid-tr.
  queueMicrotask(() => {
    try {
      const tr = editor.state.tr.setMeta('selectionStatePlugin/refresh', true);
      editor.view.dispatch(tr);
    } catch {
      // Editor torn down between queueMicrotask and dispatch — safe to ignore.
    }
  });
}
