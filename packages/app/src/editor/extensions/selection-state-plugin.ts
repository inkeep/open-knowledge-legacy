import { type Editor, Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { bridgeIdPluginKey } from './bridge-id-plugin.ts';

type SelectionOrigin = 'keyboard' | 'pointer' | 'programmatic';

export interface BlockChainEntry {
  readonly bridgeId: string;
  readonly componentName: string;
  readonly pos: number;
}

export interface BlockSelection {
  readonly selectedBlockId: string | null;
  readonly ancestorChain: readonly BlockChainEntry[];
  readonly selectionOrigin: SelectionOrigin;
  readonly isDragging: boolean;
}

export const SELECTION_ORIGIN_META_KEY = 'selectionStatePlugin/origin';

const SELECTION_REFRESH_META_KEY = 'selectionStatePlugin/refresh';

export const selectionStatePluginKey = new PluginKey<BlockSelection>('selectionState');

const EMPTY_SELECTION: BlockSelection = {
  selectedBlockId: null,
  ancestorChain: [],
  selectionOrigin: 'programmatic',
  isDragging: false,
};

export function getBlockSelection(editor: Editor): BlockSelection {
  const state = selectionStatePluginKey.getState(editor.state);
  return state ?? EMPTY_SELECTION;
}

export function deriveAncestorChain(
  state: EditorState,
  selection: EditorState['selection'],
): BlockChainEntry[] {
  const chain: BlockChainEntry[] = [];

  const { $from } = selection;

  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth);
    if (node.type.name !== 'jsxComponent') continue;
    const pos = $from.before(depth);
    chain.push(toChainEntry(state, node, pos));
  }

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

export function getWrapperBridgeId(state: EditorState, pos: number): string {
  return bridgeIdPluginKey.getState(state)?.posToId.get(pos) ?? `pos-${pos}`;
}

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

export interface PluginRuntime {
  pendingOrigin: SelectionOrigin | null;
  isDragging: boolean;
}

const RUNTIME = new WeakMap<Plugin<BlockSelection>, PluginRuntime>();

export function computeSelectionApply(
  tr: import('@tiptap/pm/state').Transaction,
  prev: BlockSelection,
  newState: EditorState,
  runtime: PluginRuntime | undefined,
): BlockSelection {
  const isDragging = runtime?.isDragging ?? prev.isDragging;

  const isRefreshTx = Boolean(tr.getMeta(SELECTION_REFRESH_META_KEY));
  const consumesPending = tr.selectionSet && !isRefreshTx;

  const metaOrigin = tr.getMeta(SELECTION_ORIGIN_META_KEY) as SelectionOrigin | undefined;
  const pendingOrigin = consumesPending ? (runtime?.pendingOrigin ?? null) : null;
  const origin = metaOrigin ?? pendingOrigin ?? prev.selectionOrigin;

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
        },
        handleKeyDown: (_view, event) => {
          if (isBlockNavigationKey(event.key)) {
            const runtime = RUNTIME.get(plugin);
            if (runtime) runtime.pendingOrigin = 'keyboard';
          }
          return false;
        },
      },

      view(view: EditorView) {
        RUNTIME.set(plugin, { pendingOrigin: null, isDragging: false });

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

function scheduleRefresh(editor: Editor): void {
  queueMicrotask(() => {
    if (editor.isDestroyed) return;
    try {
      const tr = editor.state.tr.setMeta(SELECTION_REFRESH_META_KEY, true);
      editor.view.dispatch(tr);
    } catch {}
  });
}
